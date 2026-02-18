// DuckSmart — Push Notification Service
//
// Schedules local push notifications for:
// - 30 minutes before sunrise ("It's almost shooting time!")
// - At sunset ("Time's up — sunset!")
//
// Uses expo-notifications for local scheduling.
// All imports are lazy to avoid crashes in Expo Go.

import Constants from "expo-constants";

// Check if we're running in Expo Go (notifications don't work there)
const isExpoGo = Constants.appOwnership === "expo";

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
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  }
}

/**
 * Request notification permissions (required on iOS).
 * Returns true if granted.
 */
export async function requestNotificationPermissions() {
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
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;

  if (existing !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  return finalStatus === "granted";
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
    const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
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
