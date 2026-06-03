// DuckSmart — Push Notification Service
//
// Schedules local push notifications for:
// - 30 minutes before sunrise ("It's almost shooting time!")
// - At sunset ("Time's up — sunset!")
// - Weather condition alerts selected in Settings
// - Hunting Party request push notifications
//
// Also registers the device's Expo Push Token for server-side/client-triggered push notifications.
// This is required for alerts to work when the app is closed.
//
// Uses expo-notifications for local scheduling.
// All imports are lazy to avoid crashes in Expo Go.

import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { auth, db } from "./firebase";

// Check if we're running in Expo Go (notifications don't work there)
const isExpoGo = Constants.appOwnership === "expo";

const WEATHER_ALERT_SETTINGS_KEY = "@ducksmart_weather_alert_settings_v1";
const HUNTING_PARTY_REQUEST_NOTIFICATIONS_KEY =
  "@ducksmart_hunting_party_request_notifications_v1";

const WEATHER_ALERT_SETTINGS_DOC_ID = "notifications";
const WEATHER_ALERT_SENT_KEY = "@ducksmart_weather_alert_sent_v1";
const EXPO_PUSH_TOKEN_LOCAL_KEY = "@ducksmart_expo_push_token_v1";

const DEFAULT_WEATHER_ALERT_SETTINGS = {
  freezeWarning: false,
  pressureDrop: false,
  pressureRise: false,
  coldFront: false,
  perfectStorm: false,
};

const DEFAULT_HUNTING_PARTY_REQUEST_NOTIFICATIONS_ENABLED = true;

// Client asked for 2+ pressure change before notifying.
const PRESSURE_POINT_THRESHOLD = 2;

function normalizeWeatherAlertSettings(value) {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_WEATHER_ALERT_SETTINGS };
  }

  return {
    ...DEFAULT_WEATHER_ALERT_SETTINGS,
    freezeWarning: !!value.freezeWarning,
    pressureDrop: !!value.pressureDrop,
    pressureRise: !!value.pressureRise,
    coldFront: !!value.coldFront,
    perfectStorm: !!value.perfectStorm,
  };
}

function normalizeHuntingPartyRequestNotificationsEnabled(value) {
  if (value === undefined || value === null) {
    return DEFAULT_HUNTING_PARTY_REQUEST_NOTIFICATIONS_ENABLED;
  }

  return !!value;
}

function getExpoProjectId() {
  return (
    Constants?.easConfig?.projectId ||
    Constants?.expoConfig?.extra?.eas?.projectId ||
    Constants?.manifest?.extra?.eas?.projectId ||
    Constants?.manifest2?.extra?.eas?.projectId ||
    null
  );
}

function getSafeTokenDocId(token) {
  return String(token || "")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 180);
}

function getDisplayName(profile = {}) {
  return (
    profile.displayName ||
    profile.emailLower ||
    profile.duckIdLower ||
    profile.duckId ||
    "A DuckSmart user"
  );
}

function getDuckId(profile = {}) {
  return profile.duckIdLower || profile.duckId || "";
}

async function loadWeatherAlertSettingsFromLocal() {
  try {
    const raw = await AsyncStorage.getItem(WEATHER_ALERT_SETTINGS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return normalizeWeatherAlertSettings(parsed);
  } catch {
    return { ...DEFAULT_WEATHER_ALERT_SETTINGS };
  }
}

async function saveWeatherAlertSettingsLocal(settings) {
  const normalized = normalizeWeatherAlertSettings(settings);
  await AsyncStorage.setItem(WEATHER_ALERT_SETTINGS_KEY, JSON.stringify(normalized));
  return normalized;
}

async function loadHuntingPartyRequestNotificationsLocal() {
  try {
    const raw = await AsyncStorage.getItem(HUNTING_PARTY_REQUEST_NOTIFICATIONS_KEY);

    if (raw === null) {
      return DEFAULT_HUNTING_PARTY_REQUEST_NOTIFICATIONS_ENABLED;
    }

    return raw === "true";
  } catch {
    return DEFAULT_HUNTING_PARTY_REQUEST_NOTIFICATIONS_ENABLED;
  }
}

async function saveHuntingPartyRequestNotificationsLocal(enabled) {
  const normalized = normalizeHuntingPartyRequestNotificationsEnabled(enabled);
  await AsyncStorage.setItem(
    HUNTING_PARTY_REQUEST_NOTIFICATIONS_KEY,
    normalized ? "true" : "false"
  );
  return normalized;
}

async function loadWeatherAlertSettingsFromFirestore(uid) {
  if (!uid) return null;

  try {
    const snap = await getDoc(doc(db, "users", uid, "settings", WEATHER_ALERT_SETTINGS_DOC_ID));
    if (!snap.exists()) return null;

    const data = snap.data();
    return normalizeWeatherAlertSettings(data?.weatherAlerts || data);
  } catch (err) {
    console.log("DuckSmart notification settings Firestore load failed:", err?.message || err);
    return null;
  }
}

async function loadHuntingPartyRequestNotificationSettingFromFirestore(uid) {
  if (!uid) return null;

  try {
    const snap = await getDoc(doc(db, "users", uid, "settings", WEATHER_ALERT_SETTINGS_DOC_ID));
    if (!snap.exists()) return null;

    const data = snap.data();

    if (data?.huntingPartyRequestsEnabled === undefined) {
      return null;
    }

    return normalizeHuntingPartyRequestNotificationsEnabled(
      data.huntingPartyRequestsEnabled
    );
  } catch (err) {
    console.log("DuckSmart Hunting Party notification setting load failed:", err?.message || err);
    return null;
  }
}

async function saveExpoPushTokenForUser({ uid, expoPushToken, projectId, deviceInfo }) {
  const userId = uid || auth.currentUser?.uid || null;

  if (!userId || !expoPushToken) {
    return false;
  }

  const { Platform } = require("react-native");
  const tokenDocId = getSafeTokenDocId(expoPushToken);

  await AsyncStorage.setItem(EXPO_PUSH_TOKEN_LOCAL_KEY, expoPushToken);

  await setDoc(
    doc(db, "users", userId, "pushTokens", tokenDocId),
    {
      token: expoPushToken,
      platform: Platform.OS,
      projectId: projectId || null,
      deviceName: deviceInfo?.deviceName || null,
      osName: deviceInfo?.osName || null,
      osVersion: deviceInfo?.osVersion || null,
      enabled: true,
      updatedAt: Date.now(),
      updatedAtServer: serverTimestamp(),
    },
    { merge: true }
  );

  await setDoc(
    doc(db, "users", userId, "settings", WEATHER_ALERT_SETTINGS_DOC_ID),
    {
      expoPushTokens: arrayUnion(expoPushToken),
      pushTokenUpdatedAt: Date.now(),
      pushTokenUpdatedAtServer: serverTimestamp(),
    },
    { merge: true }
  );

  return true;
}

async function getAndSaveExpoPushToken(uid = null) {
  const Notifications = getNotifications();
  const Device = getDevice();

  if (!Notifications || !Device || !Device.isDevice || isExpoGo) {
    return null;
  }

  try {
    const projectId = getExpoProjectId();

    if (!projectId) {
      console.log("DuckSmart: Missing Expo projectId. Push token registration skipped.");
      return null;
    }

    const tokenResult = await Notifications.getExpoPushTokenAsync({
      projectId,
    });

    const expoPushToken = tokenResult?.data;

    if (!expoPushToken) {
      console.log("DuckSmart: Expo push token was empty.");
      return null;
    }

    await saveExpoPushTokenForUser({
      uid,
      expoPushToken,
      projectId,
      deviceInfo: {
        deviceName: Device.deviceName || null,
        osName: Device.osName || null,
        osVersion: Device.osVersion || null,
      },
    });

    console.log("DuckSmart: Expo push token registered.");
    return expoPushToken;
  } catch (err) {
    console.log("DuckSmart Expo push token registration failed:", err?.message || err);
    return null;
  }
}

async function loadExpoPushTokensForUser(uid) {
  const userId = uid || null;

  if (!userId) return [];

  const tokens = new Set();

  try {
    const settingsSnap = await getDoc(
      doc(db, "users", userId, "settings", WEATHER_ALERT_SETTINGS_DOC_ID)
    );

    if (settingsSnap.exists()) {
      const data = settingsSnap.data();
      const settingsTokens = Array.isArray(data?.expoPushTokens)
        ? data.expoPushTokens
        : [];

      settingsTokens.forEach((token) => {
        if (typeof token === "string" && token.startsWith("ExponentPushToken")) {
          tokens.add(token);
        }
      });
    }
  } catch (err) {
    console.log("DuckSmart push token settings read failed:", err?.message || err);
  }

  try {
    const tokenSnap = await getDocs(collection(db, "users", userId, "pushTokens"));

    tokenSnap.docs.forEach((item) => {
      const data = item.data();
      const token = data?.token;

      if (
        data?.enabled !== false &&
        typeof token === "string" &&
        token.startsWith("ExponentPushToken")
      ) {
        tokens.add(token);
      }
    });
  } catch (err) {
    console.log("DuckSmart push token subcollection read failed:", err?.message || err);
  }

  return Array.from(tokens);
}

async function sendExpoPushMessages(messages) {
  const safeMessages = Array.isArray(messages)
    ? messages.filter(Boolean)
    : [messages].filter(Boolean);

  if (!safeMessages.length) return false;

  try {
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(safeMessages.length === 1 ? safeMessages[0] : safeMessages),
    });

    if (!response.ok) {
      console.log("DuckSmart Expo push send failed:", response.status);
      return false;
    }

    return true;
  } catch (err) {
    console.log("DuckSmart Expo push send error:", err?.message || err);
    return false;
  }
}

export async function saveWeatherAlertSettingsForUser(uid, settings) {
  const normalized = await saveWeatherAlertSettingsLocal(settings);

  const userId = uid || auth.currentUser?.uid || null;

  if (userId) {
    try {
      await setDoc(
        doc(db, "users", userId, "settings", WEATHER_ALERT_SETTINGS_DOC_ID),
        {
          weatherAlerts: normalized,
          updatedAt: Date.now(),
          updatedAtServer: serverTimestamp(),
        },
        { merge: true }
      );

      const hasAnyEnabledAlert = Object.values(normalized).some(Boolean);
      if (hasAnyEnabledAlert) {
        await getAndSaveExpoPushToken(userId);
      }
    } catch (err) {
      console.log("DuckSmart notification settings Firestore save failed:", err?.message || err);
    }
  }

  return normalized;
}

export async function loadHuntingPartyRequestNotificationSetting(uid = null) {
  const userId = uid || auth.currentUser?.uid || null;

  const firestoreSetting =
    await loadHuntingPartyRequestNotificationSettingFromFirestore(userId);

  if (firestoreSetting !== null) {
    await saveHuntingPartyRequestNotificationsLocal(firestoreSetting);
    return firestoreSetting;
  }

  return loadHuntingPartyRequestNotificationsLocal();
}

export async function saveHuntingPartyRequestNotificationSettingForUser(
  uid,
  enabled
) {
  const normalized = await saveHuntingPartyRequestNotificationsLocal(enabled);
  const userId = uid || auth.currentUser?.uid || null;

  if (userId) {
    try {
      await setDoc(
        doc(db, "users", userId, "settings", WEATHER_ALERT_SETTINGS_DOC_ID),
        {
          huntingPartyRequestsEnabled: normalized,
          updatedAt: Date.now(),
          updatedAtServer: serverTimestamp(),
        },
        { merge: true }
      );

      if (normalized) {
        await getAndSaveExpoPushToken(userId);
      }
    } catch (err) {
      console.log("DuckSmart Hunting Party notification setting save failed:", err?.message || err);
    }
  }

  return normalized;
}

export async function sendHuntingPartyRequestNotification({
  recipientUid,
  requesterProfile,
} = {}) {
  const safeRecipientUid = String(recipientUid || "").trim();

  if (!safeRecipientUid) return false;

  const enabled =
    await loadHuntingPartyRequestNotificationSettingFromFirestore(safeRecipientUid);

  if (enabled === false) {
    return false;
  }

  const tokens = await loadExpoPushTokensForUser(safeRecipientUid);

  if (!tokens.length) {
    return false;
  }

  const requesterName = getDisplayName(requesterProfile);
  const requesterDuckId = getDuckId(requesterProfile);

  const messages = tokens.map((token) => ({
    to: token,
    sound: "default",
    title: "DuckSmart Hunting Party Request",
    body: `${requesterName} wants to add you to their Hunting Party.`,
    data: {
      type: "hunting-party-request",
      requesterUid: requesterProfile?.uid || "",
      requesterDuckId,
      screen: "GroupScreen",
    },
  }));

  return sendExpoPushMessages(messages);
}

export async function saveWeatherLocationForNotifications({
  uid = null,
  lat,
  lon,
  locationName = null,
}) {
  const userId = uid || auth.currentUser?.uid || null;
  const nLat = Number(lat);
  const nLon = Number(lon);

  if (!userId || !Number.isFinite(nLat) || !Number.isFinite(nLon)) {
    return false;
  }

  try {
    await setDoc(
      doc(db, "users", userId, "settings", WEATHER_ALERT_SETTINGS_DOC_ID),
      {
        weatherLocation: {
          lat: nLat,
          lon: nLon,
          locationName: locationName || null,
          updatedAt: Date.now(),
        },
        updatedAt: Date.now(),
        updatedAtServer: serverTimestamp(),
      },
      { merge: true }
    );

    return true;
  } catch (err) {
    console.log("DuckSmart weather location save failed:", err?.message || err);
    return false;
  }
}

/**
 * Lazily load expo-notifications only in production builds.
 * Returns null in Expo Go to prevent crashes.
 */
function getNotifications() {
  if (isExpoGo) return null;
  try {
    return require("expo-notifications");
  } catch {
    return null;
  }
}

function getDevice() {
  try {
    return require("expo-device");
  } catch {
    return null;
  }
}

// Set up notification handler only in production builds
if (!isExpoGo) {
  const Notifications = getNotifications();
  if (Notifications) {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  }
}

/**
 * Request notification permissions.
 * Returns true if granted.
 */
export async function requestNotificationPermissions(options = {}) {
  const Notifications = getNotifications();
  const Device = getDevice();

  if (!Notifications || !Device || !Device.isDevice || isExpoGo) {
    console.log("DuckSmart: Notifications are not available in Expo Go. They will work in production builds.");
    return false;
  }

  const { Platform } = require("react-native");

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("hunt-alerts", {
      name: "Hunt Alerts",
      importance: Notifications.AndroidImportance.HIGH,
      sound: "default",
      vibrationPattern: [0, 250, 250, 250],
    });

    await Notifications.setNotificationChannelAsync("weather-alerts", {
      name: "Weather Alerts",
      importance: Notifications.AndroidImportance.HIGH,
      sound: "default",
      vibrationPattern: [0, 250, 250, 250],
    });

    await Notifications.setNotificationChannelAsync("social-alerts", {
      name: "Hunting Party Alerts",
      importance: Notifications.AndroidImportance.HIGH,
      sound: "default",
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;

  if (existing !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  const granted = finalStatus === "granted";

  if (granted && !options.skipTokenRegistration) {
    await getAndSaveExpoPushToken(auth.currentUser?.uid || null);
  }

  return granted;
}

/**
 * Explicitly register this device for server push notifications.
 * Use this from app startup or after login if needed.
 */
export async function registerForPushNotificationsAsync(uid = null) {
  const hasPermission = await requestNotificationPermissions({
    skipTokenRegistration: true,
  });

  if (!hasPermission) return null;

  return getAndSaveExpoPushToken(uid || auth.currentUser?.uid || null);
}

/**
 * Cancel all previously scheduled hunt alert notifications.
 */
export async function cancelHuntAlerts() {
  const Notifications = getNotifications();
  if (!Notifications || isExpoGo) return;

  const all = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of all) {
    if (
      n.content.data?.type === "sunrise-alert" ||
      n.content.data?.type === "sunset-alert"
    ) {
      await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }
  }
}

/**
 * Schedule sunrise and sunset notifications for today.
 *
 * @param {string} sunriseStr — sunrise time string e.g. "6:42 AM"
 * @param {string} sunsetStr  — sunset time string e.g. "5:31 PM"
 */
export async function scheduleHuntAlerts(sunriseStr, sunsetStr) {
  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission) return false;

  const Notifications = getNotifications();
  if (!Notifications) return false;

  // Cancel any existing alerts first
  await cancelHuntAlerts();

  const now = new Date();

  // Parse time string like "6:42 AM" into a Date for today
  const parseTime = (timeStr) => {
    const match = String(timeStr || "").match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (!match) return null;

    let hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const period = match[3].toUpperCase();

    if (period === "PM" && hours !== 12) hours += 12;
    if (period === "AM" && hours === 12) hours = 0;

    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    return date;
  };

  const sunriseDate = parseTime(sunriseStr);
  const sunsetDate = parseTime(sunsetStr);

  let scheduled = 0;

  // Schedule 30 min before sunrise
  if (sunriseDate) {
    const alertTime = new Date(sunriseDate.getTime() - 30 * 60 * 1000);
    if (alertTime > now) {
      const secondsUntil = Math.floor((alertTime - now) / 1000);
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "DuckSmart — Shooting Time!",
          body: "30 minutes until sunrise. Get ready!",
          sound: "default",
          data: { type: "sunrise-alert" },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: secondsUntil,
          repeats: false,
        },
      });
      scheduled++;
    }
  }

  // Schedule at sunset
  if (sunsetDate) {
    if (sunsetDate > now) {
      const secondsUntil = Math.floor((sunsetDate - now) / 1000);
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "DuckSmart — Time's Up!",
          body: "Sunset — shooting hours are over. Stay safe out there.",
          sound: "default",
          data: { type: "sunset-alert" },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: secondsUntil,
          repeats: false,
        },
      });
      scheduled++;
    }
  }

  return scheduled > 0;
}

/**
 * Load weather alert settings saved from SettingsModal.
 */
export async function loadWeatherAlertSettings(uid = null) {
  const userId = uid || auth.currentUser?.uid || null;

  const firestoreSettings = await loadWeatherAlertSettingsFromFirestore(userId);
  if (firestoreSettings) {
    await saveWeatherAlertSettingsLocal(firestoreSettings);
    return firestoreSettings;
  }

  return loadWeatherAlertSettingsFromLocal();
}

/**
 * Get YYYY-MM-DD local date string.
 */
function getTodayKey() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Prevent sending the same weather alert repeatedly all day.
 */
async function wasWeatherAlertSentToday(type) {
  try {
    const raw = await AsyncStorage.getItem(WEATHER_ALERT_SENT_KEY);
    const sent = raw ? JSON.parse(raw) : {};
    return sent[type] === getTodayKey();
  } catch {
    return false;
  }
}

async function markWeatherAlertSentToday(type) {
  try {
    const raw = await AsyncStorage.getItem(WEATHER_ALERT_SENT_KEY);
    const sent = raw ? JSON.parse(raw) : {};
    sent[type] = getTodayKey();
    await AsyncStorage.setItem(WEATHER_ALERT_SENT_KEY, JSON.stringify(sent));
  } catch {
    // Silent fail — notification should not crash app
  }
}

/**
 * Schedule an immediate local weather alert.
 */
async function sendWeatherAlert(type, title, body) {
  const alreadySent = await wasWeatherAlertSentToday(type);
  if (alreadySent) return false;

  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission) return false;

  const Notifications = getNotifications();
  if (!Notifications) return false;

  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      sound: "default",
      data: { type },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 1,
      repeats: false,
    },
  });

  await markWeatherAlertSentToday(type);
  return true;
}

/**
 * Normalize pressure values.
 */
function getPressureInHg(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;

  // Already in inHg
  if (n > 20 && n < 35) return n;

  // hPa / millibars fallback
  if (n > 800 && n < 1100) return n * 0.0295299830714;

  return null;
}

/**
 * Get current and rough next-24h pressure from available weather data.
 */
function getPressureTrend(weather) {
  const current = getPressureInHg(weather?.pressureInHg ?? weather?.pressure);

  let future = null;

  if (Array.isArray(weather?.hourly) && weather.hourly.length > 0) {
    const withPressure = weather.hourly
      .map((h) => getPressureInHg(h.pressureInHg ?? h.pressure))
      .filter((v) => v != null);

    if (withPressure.length > 0) {
      future = withPressure[Math.min(withPressure.length - 1, 23)];
    }
  }

  if (future == null && Array.isArray(weather?.trends48h) && weather.trends48h.length > 0) {
    const withPressure = weather.trends48h
      .map((h) => getPressureInHg(h.pressureInHg ?? h.pressure))
      .filter((v) => v != null);

    if (withPressure.length > 0) {
      future = withPressure[Math.min(withPressure.length - 1, 24)];
    }
  }

  if (current == null || future == null) {
    return { current, future, change: 0 };
  }

  return {
    current,
    future,
    change: future - current,
  };
}

function getFutureLowTemp(weather) {
  const temps = [];

  if (Number.isFinite(Number(weather?.tempF))) {
    temps.push(Number(weather.tempF));
  }

  if (Array.isArray(weather?.hourly)) {
    weather.hourly.forEach((h) => {
      const temp = Number(h.temp ?? h.tempF);
      if (Number.isFinite(temp)) temps.push(temp);
    });
  }

  if (Array.isArray(weather?.forecast5Day)) {
    weather.forecast5Day.forEach((d) => {
      const temp = Number(d.lowF ?? d.tempMinF ?? d.tempF ?? d.temp);
      if (Number.isFinite(temp)) temps.push(temp);
    });
  }

  if (temps.length === 0) return null;
  return Math.min(...temps);
}

function getTempDrop(weather) {
  const current = Number(weather?.tempF);
  if (!Number.isFinite(current)) return 0;

  let futureLow = getFutureLowTemp(weather);
  if (!Number.isFinite(futureLow)) return 0;

  return current - futureLow;
}

function isNorthWind(weather) {
  const windDeg = Number(weather?.windDeg);
  if (!Number.isFinite(windDeg)) return false;

  return windDeg >= 315 || windDeg <= 45;
}

function hasCloudsOrRain(weather) {
  const clouds = Number(weather?.cloudPct ?? weather?.clouds);
  const precip = Number(weather?.precipChance ?? weather?.rainChance ?? weather?.pop);

  return (
    (Number.isFinite(clouds) && clouds >= 60) ||
    (Number.isFinite(precip) && precip >= 30)
  );
}

/**
 * Evaluate current weather and send selected weather alerts.
 *
 * This is intentionally safe to call after each weather refresh.
 * It sends each alert type at most once per local day.
 */
export async function checkAndNotifyWeatherAlerts(weather) {
  if (!weather) return false;

  const settings = await loadWeatherAlertSettings();
  const pressureTrend = getPressureTrend(weather);
  const tempDrop = getTempDrop(weather);
  const futureLow = getFutureLowTemp(weather);
  const windMph = Number(weather?.windMph);
  const northWind = isNorthWind(weather);
  const cloudyOrRainy = hasCloudsOrRain(weather);

  let sentAny = false;

  if (settings.freezeWarning && futureLow != null && futureLow <= 32) {
    const sent = await sendWeatherAlert(
      "weather-freeze-warning",
      "DuckSmart — Freeze Warning",
      `Temperatures may hit ${Math.round(futureLow)}°F. Expect freezing conditions.`
    );
    sentAny = sentAny || sent;
  }

  if (settings.pressureDrop && pressureTrend.change <= -PRESSURE_POINT_THRESHOLD) {
    const sent = await sendWeatherAlert(
      "weather-pressure-drop",
      "DuckSmart — Pressure Dropping",
      `Barometric pressure is dropping about ${Math.abs(pressureTrend.change).toFixed(2)} inHg. Hunting conditions may change.`
    );
    sentAny = sentAny || sent;
  }

  if (settings.pressureRise && pressureTrend.change >= PRESSURE_POINT_THRESHOLD) {
    const sent = await sendWeatherAlert(
      "weather-pressure-rise",
      "DuckSmart — Pressure Rising",
      `Barometric pressure is rising about ${pressureTrend.change.toFixed(2)} inHg. Watch for changing bird movement.`
    );
    sentAny = sentAny || sent;
  }

  if (settings.coldFront && tempDrop >= 8 && Number.isFinite(windMph) && windMph >= 8) {
    const sent = await sendWeatherAlert(
      "weather-cold-front",
      "DuckSmart — Possible Cold Front",
      `Temps may drop about ${Math.round(tempDrop)}° with ${Math.round(windMph)} mph wind.`
    );
    sentAny = sentAny || sent;
  }

  if (
    settings.perfectStorm &&
    tempDrop >= 8 &&
    northWind &&
    Number.isFinite(windMph) &&
    windMph >= 10 &&
    windMph <= 20 &&
    cloudyOrRainy
  ) {
    const sent = await sendWeatherAlert(
      "weather-perfect-storm",
      "DuckSmart — Perfect Storm Setup",
      "Cold front, north wind, clouds/rain, and dropping temps are lining up."
    );
    sentAny = sentAny || sent;
  }

  return sentAny;
}