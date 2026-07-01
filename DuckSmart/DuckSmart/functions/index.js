const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const { Expo } = require("expo-server-sdk");

admin.initializeApp();

const db = admin.firestore();
const expo = new Expo();

const TEST_PUSH_KEY = "ducksmart-test-2026";

const OWM_BASE = "https://api.openweathermap.org/data/2.5";
const REGRID_API_BASE = "https://app.regrid.com/api/v2/parcels";
const REGRID_TILE_BASE =
  "https://tiles.regrid.com/api/v1/sources/parcel/layers/b3c35a56df012059b62eeab44fd9b9539d87a87e";
const OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions";
const HUBSPOT_BASE = "https://api.hubapi.com";
const HUBSPOT_SYNC_VERSION = "2026-07-01-v2";

const OWM_API_KEY = defineSecret("DUCKSMART_OWM_API_KEY");
const REGRID_TOKEN = defineSecret("REGRID_TOKEN");
const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");
const HUBSPOT_PRIVATE_APP_TOKEN = defineSecret("HUBSPOT_PRIVATE_APP_TOKEN");

const PRESSURE_POINT_THRESHOLD = 2;

const DEFAULT_WEATHER_ALERT_SETTINGS = {
  freezeWarning: false,
  pressureDrop: false,
  pressureRise: false,
  coldFront: false,
  perfectStorm: false,
};

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

function hpaToInHg(hpa) {
  return hpa / 33.8639;
}

function getPressureInHg(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;

  if (n > 20 && n < 35) return n;
  if (n > 800 && n < 1100) return n * 0.0295299830714;

  return null;
}

function unixToTimeString(unix, tzOffsetSec) {
  const utcMs = unix * 1000;
  const localMs = utcMs + (tzOffsetSec || 0) * 1000;
  const d = new Date(localMs);
  let hours = d.getUTCHours();
  const mins = d.getUTCMinutes().toString().padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  return `${hours}:${mins} ${ampm}`;
}

function formatHourLabel(unix, tzOffsetSec) {
  const utcMs = unix * 1000;
  const localMs = utcMs + tzOffsetSec * 1000;
  const d = new Date(localMs);
  let hours = d.getUTCHours();
  if (hours === 0) return "12a";
  if (hours < 12) return `${hours}a`;
  if (hours === 12) return "12p";
  return `${hours - 12}p`;
}

function formatFullHourLabel(unix, tzOffsetSec) {
  const utcMs = unix * 1000;
  const localMs = utcMs + tzOffsetSec * 1000;
  const d = new Date(localMs);
  let hours = d.getUTCHours();
  const ampm = hours >= 12 ? "pm" : "am";
  hours = hours % 12 || 12;
  return `${hours}${ampm}`;
}

function formatDayLabelFromLocalMs(localMs) {
  const d = new Date(localMs);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getUTCDay()];
}

function localDateKeyFromUnix(unix, tzOffsetSec) {
  const localMs = unix * 1000 + tzOffsetSec * 1000;
  const d = new Date(localMs);
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
}

function titleCase(value) {
  if (!value) return "";
  return String(value)
    .split(" ")
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : ""))
    .join(" ");
}

function mostCommonWeather(entries) {
  const counts = new Map();

  entries.forEach((entry) => {
    const weather = entry.weather?.[0];
    if (!weather) return;

    const key = `${weather.main || ""}|${weather.description || ""}|${weather.icon || ""}`;
    const existing = counts.get(key) || {
      count: 0,
      main: weather.main || "",
      description: weather.description || "",
      icon: weather.icon || "",
    };

    existing.count += 1;
    counts.set(key, existing);
  });

  return [...counts.values()].sort((a, b) => b.count - a.count)[0] || {
    main: "",
    description: "",
    icon: "",
  };
}

function groupForecastByLocalDay(list, tzOffset) {
  const dayBuckets = new Map();

  list.forEach((entry) => {
    const localMs = entry.dt * 1000 + tzOffset * 1000;
    const dateKey = localDateKeyFromUnix(entry.dt, tzOffset);

    if (!dayBuckets.has(dateKey)) {
      dayBuckets.set(dateKey, { entries: [], localMs, dateKey });
    }

    dayBuckets.get(dateKey).entries.push(entry);
  });

  return [...dayBuckets.values()].sort((a, b) => a.localMs - b.localMs);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function buildHourlyFromForecast(list, nowUnix, tzOffset) {
  if (!list || list.length < 2) return [];

  const HOURS_TO_GENERATE = 6;
  const result = [];
  const currentHourUnix = Math.floor(nowUnix / 3600) * 3600;

  for (let h = 0; h < HOURS_TO_GENERATE; h++) {
    const targetUnix = currentHourUnix + h * 3600;

    let before = null;
    let after = null;

    for (let i = 0; i < list.length - 1; i++) {
      if (list[i].dt <= targetUnix && list[i + 1].dt >= targetUnix) {
        before = list[i];
        after = list[i + 1];
        break;
      }
    }

    if (!before && list.length > 0 && targetUnix <= list[0].dt) {
      before = list[0];
      after = list[0];
    }

    if (!before) {
      const nearest = list.find((e) => e.dt >= targetUnix) || list[list.length - 1];
      before = nearest;
      after = nearest;
    }

    const span = after.dt - before.dt;
    const t = span > 0 ? (targetUnix - before.dt) / span : 0;

    const interpolatedWind = lerp(before.wind.speed, after.wind.speed, t);
    const nearestForGust =
      Math.abs(targetUnix - before.dt) <= Math.abs(after.dt - targetUnix) ? before : after;
    const nearestGust = nearestForGust.wind.gust ?? nearestForGust.wind.speed;

    result.push({
      t: h === 0 ? "Now" : formatFullHourLabel(targetUnix, tzOffset),
      temp: Math.round(lerp(before.main.temp, after.main.temp, t)),
      precip: Math.round(lerp((before.pop || 0) * 100, (after.pop || 0) * 100, t)),
      wind: Math.round(interpolatedWind),
      gust: Math.round(Math.max(interpolatedWind, nearestGust)),
    });
  }

  return result;
}

function buildDailyForecasts(list, currentTemp, tzOffset) {
  if (!list || list.length < 8) return [];

  const days = groupForecastByLocalDay(list, tzOffset);
  const futureDays = days.slice(1);

  const result = [];
  let prevAvgTemp = days[0]
    ? days[0].entries.reduce((s, e) => s + e.main.temp, 0) / days[0].entries.length
    : currentTemp;

  for (let i = 0; i < Math.min(futureDays.length, 4); i++) {
    const { entries, localMs } = futureDays[i];
    const dayLabel = formatDayLabelFromLocalMs(localMs);

    const avgTemp = entries.reduce((s, e) => s + e.main.temp, 0) / entries.length;
    const avgWind = entries.reduce((s, e) => s + e.wind.speed, 0) / entries.length;
    const avgClouds = entries.reduce((s, e) => s + e.clouds.all, 0) / entries.length;
    const maxPrecip = Math.max(...entries.map((e) => (e.pop || 0) * 100));

    const deltaTemp = Math.round(avgTemp - prevAvgTemp);

    let maxPressureSwing = 0;
    for (let j = 1; j < entries.length; j++) {
      const swing = Math.abs(
        hpaToInHg(entries[j].main.pressure) - hpaToInHg(entries[j - 1].main.pressure)
      );
      if (swing > maxPressureSwing) maxPressureSwing = swing;
    }

    result.push({
      label: dayLabel,
      dateUnix: entries[0].dt,
      deltaTemp24hF: deltaTemp,
      deltaPressure3h: Math.round(maxPressureSwing * 100) / 100,
      windMph: Math.round(avgWind),
      precipChance: Math.round(maxPrecip),
      cloudPct: Math.round(avgClouds),
    });

    prevAvgTemp = avgTemp;
  }

  return result;
}

function buildDailyWeatherForecasts(list, current, tzOffset) {
  if (!list || list.length === 0) return [];

  const currentDateKey = current?.dt ? localDateKeyFromUnix(current.dt, tzOffset) : null;
  const days = groupForecastByLocalDay(list, tzOffset);
  const result = [];

  for (let i = 0; i < Math.min(days.length, 5); i++) {
    const { entries, localMs, dateKey } = days[i];

    const temps = entries
      .flatMap((entry) => [
        entry.main.temp,
        entry.main.temp_min,
        entry.main.temp_max,
      ])
      .filter((value) => typeof value === "number");

    const windValues = entries.map((entry) => entry.wind?.speed || 0);
    const gustValues = entries.map((entry) => entry.wind?.gust || entry.wind?.speed || 0);
    const precipValues = entries.map((entry) => (entry.pop || 0) * 100);
    const cloudValues = entries.map((entry) => entry.clouds?.all || 0);

    const weather = mostCommonWeather(entries);
    const isToday = currentDateKey && dateKey === currentDateKey;

    result.push({
      label: isToday ? "Today" : formatDayLabelFromLocalMs(localMs),
      dateUnix: entries[0]?.dt || null,
      highF: Math.round(Math.max(...temps)),
      lowF: Math.round(Math.min(...temps)),
      precipChance: Math.round(Math.max(...precipValues)),
      windMph: Math.round(windValues.reduce((s, v) => s + v, 0) / windValues.length),
      gustMph: Math.round(Math.max(...gustValues)),
      cloudPct: Math.round(cloudValues.reduce((s, v) => s + v, 0) / cloudValues.length),
      condition: titleCase(weather.description || weather.main || "Forecast"),
      icon: weather.icon || null,
    });
  }

  return result;
}

function getTodayKey() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getLatLonFromObject(obj) {
  if (!obj || typeof obj !== "object") return null;

  const lat = obj.lat ?? obj.latitude ?? obj.coords?.latitude;
  const lon = obj.lon ?? obj.lng ?? obj.longitude ?? obj.coords?.longitude;

  const nLat = Number(lat);
  const nLon = Number(lon);

  if (!Number.isFinite(nLat) || !Number.isFinite(nLon)) return null;

  return {
    lat: nLat,
    lon: nLon,
    locationName: obj.locationName || obj.name || obj.city || null,
  };
}

function getSavedLocation(settingsData, userData) {
  const candidates = [
    settingsData?.weatherLocation,
    settingsData?.lastWeatherLocation,
    settingsData?.lastLocation,
    settingsData?.location,
    settingsData?.coords,
    settingsData,
    userData?.weatherLocation,
    userData?.lastWeatherLocation,
    userData?.lastLocation,
    userData?.location,
    userData?.coords,
    userData,
  ];

  for (const item of candidates) {
    const found = getLatLonFromObject(item);
    if (found) return found;
  }

  return null;
}

function getOpenWeatherApiKey() {
  const key = OWM_API_KEY.value();

  if (!key) {
    throw new Error("Missing DUCKSMART_OWM_API_KEY Firebase secret");
  }

  return key;
}

function getRegridToken() {
  const token = REGRID_TOKEN.value();

  if (!token) {
    throw new Error("Missing REGRID_TOKEN Firebase secret");
  }

  return token;
}

function getOpenAiApiKey() {
  const key = OPENAI_API_KEY.value();

  if (!key) {
    throw new Error("Missing OPENAI_API_KEY Firebase secret");
  }

  return key;
}

function getHubSpotToken() {
  const token = HUBSPOT_PRIVATE_APP_TOKEN.value();

  if (!token) {
    throw new Error("Missing HUBSPOT_PRIVATE_APP_TOKEN Firebase secret");
  }

  return token;
}

function cleanHubSpotString(value, maxLength = 500) {
  if (value === undefined || value === null) return "";
  return String(value).trim().slice(0, maxLength);
}

function splitDisplayName(displayName = "") {
  const safe = cleanHubSpotString(displayName, 160);
  if (!safe) return { firstName: "", lastName: "" };

  const parts = safe.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { firstName: parts[0] || "", lastName: "" };

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

function buildHubSpotContactProperties({ uid, profile = {} }) {
  const email = cleanEmail(profile.emailLower || profile.email || "");
  const displayName = cleanHubSpotString(profile.displayName || "", 160);
  const names = splitDisplayName(displayName);

  const properties = {
    email,
  };

  if (displayName) properties.firstname = names.firstName || displayName;
  if (names.lastName) properties.lastname = names.lastName;

  return properties;
}

async function hubSpotRequest(path, options = {}) {
  const response = await fetch(`${HUBSPOT_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${getHubSpotToken()}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch (_) {
    data = text;
  }

  if (!response.ok) {
    const message =
      data?.message ||
      data?.error ||
      `HubSpot request failed with status ${response.status}`;

    const err = new Error(message);
    err.status = response.status;
    err.data = data;
    throw err;
  }

  return data;
}

async function upsertHubSpotContact({ uid, profile }) {
  const properties = buildHubSpotContactProperties({ uid, profile });
  const email = properties.email;

  if (!email || !email.includes("@")) {
    throw new Error("Missing valid email for HubSpot contact sync.");
  }

  try {
    return await hubSpotRequest(
      `/crm/v3/objects/contacts/${encodeURIComponent(email)}?idProperty=email`,
      {
        method: "PATCH",
        body: JSON.stringify({ properties }),
      }
    );
  } catch (err) {
    if (err.status !== 404) throw err;

    try {
      return await hubSpotRequest("/crm/v3/objects/contacts", {
        method: "POST",
        body: JSON.stringify({ properties }),
      });
    } catch (createErr) {
      if (createErr.status !== 409) throw createErr;

      return await hubSpotRequest(
        `/crm/v3/objects/contacts/${encodeURIComponent(email)}?idProperty=email`,
        {
          method: "PATCH",
          body: JSON.stringify({ properties }),
        }
      );
    }
  }
}

function cleanEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function verifyFirebaseAuth(req) {
  const header = req.headers.authorization || "";
  const match = header.match(/^Bearer (.+)$/);

  if (!match) {
    throw new Error("Missing Firebase auth token");
  }

  return admin.auth().verifyIdToken(match[1]);
}

function sendOptions(req, res) {
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return true;
  }

  return false;
}

function copyQueryParam(req, url, key) {
  const value = req.query[key];

  if (value !== undefined && value !== null && `${value}`.trim() !== "") {
    url.searchParams.set(key, `${value}`);
  }
}

async function fetchCurrentWeather(lat, lon) {
  const url =
    `${OWM_BASE}/weather` +
    `?lat=${encodeURIComponent(lat)}` +
    `&lon=${encodeURIComponent(lon)}` +
    `&units=imperial` +
    `&appid=${encodeURIComponent(getOpenWeatherApiKey())}`;

  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`OWM current failed: ${res.status}`);
  }

  return res.json();
}

async function fetchForecast(lat, lon) {
  const url =
    `${OWM_BASE}/forecast` +
    `?lat=${encodeURIComponent(lat)}` +
    `&lon=${encodeURIComponent(lon)}` +
    `&units=imperial` +
    `&appid=${encodeURIComponent(getOpenWeatherApiKey())}`;

  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`OWM forecast failed: ${res.status}`);
  }

  return res.json();
}

function buildWeatherObject(current, forecast) {
  const now = Date.now() / 1000;
  const list = forecast?.list || [];

  const tempF = Math.round(current?.main?.temp ?? 0);
  const feelsLikeF = Math.round(current?.main?.feels_like ?? current?.main?.temp ?? 0);
  const windMph = Math.round(current?.wind?.speed ?? 0);
  const windDeg = current?.wind?.deg || 0;
  const pressureHpa = current?.main?.pressure ?? 0;
  const pressureInHg = Math.round(hpaToInHg(pressureHpa) * 100) / 100;

  const currentCloudPct =
    typeof current?.clouds?.all === "number" ? current.clouds.all : null;
  const forecastCloudPct =
    typeof list?.[0]?.clouds?.all === "number" ? list[0].clouds.all : null;

  const cloudPct = Math.round(
    currentCloudPct != null && forecastCloudPct != null
      ? (currentCloudPct + forecastCloudPct) / 2
      : forecastCloudPct ?? currentCloudPct ?? 0
  );

  const locationName = current?.name || "Your Area";
  const tzOffset = current?.timezone || 0;

  const precipChance = list.length > 0 ? Math.round((list[0].pop || 0) * 100) : 0;

  const sunrise = current?.sys?.sunrise
    ? unixToTimeString(current.sys.sunrise, tzOffset)
    : "–";

  const sunset = current?.sys?.sunset
    ? unixToTimeString(current.sys.sunset, tzOffset)
    : "–";

  let deltaTemp24hF = 0;
  const entry24h = list.find((e) => e.dt >= now + 22 * 3600) || list[list.length - 1];
  if (entry24h) {
    deltaTemp24hF = Math.round(entry24h.main.temp - tempF);
  }

  let deltaPressure3h = 0;
  const entry3h = list.find((e) => e.dt >= now + 2.5 * 3600);
  if (entry3h) {
    const futureInHg = hpaToInHg(entry3h.main.pressure);
    deltaPressure3h = Math.round((pressureInHg - futureInHg) * 100) / 100;
  }

  const hourly = buildHourlyFromForecast(list, now, tzOffset);

  const trends48h = list.slice(0, 16).map((entry) => ({
    t: formatHourLabel(entry.dt, tzOffset),
    temp: Math.round(entry.main.temp),
    pressureInHg: Math.round(hpaToInHg(entry.main.pressure) * 100) / 100,
    wind: Math.round(entry.wind.speed),
    windDeg: entry.wind.deg || 0,
    precipChance: Math.round((entry?.pop || 0) * 100),
    cloudPct: Math.round(entry?.clouds?.all ?? 0),
  }));

  const forecast5Day = buildDailyForecasts(list, tempF, tzOffset);
  const dailyWeather5Day = buildDailyWeatherForecasts(list, current, tzOffset);

  return {
    locationName,
    tempF,
    feelsLikeF,
    windMph,
    windDeg,
    pressureInHg,
    deltaTemp24hF,
    deltaPressure3h,
    precipChance,
    cloudPct,
    sunrise,
    sunset,
    hourly,
    trends48h,
    forecast5Day,
    dailyWeather5Day,
  };
}

async function fetchWeather(lat, lon) {
  const [current, forecast] = await Promise.all([
    fetchCurrentWeather(lat, lon),
    fetchForecast(lat, lon),
  ]);

  return buildWeatherObject(current, forecast);
}

function getFutureLowTemp(weather) {
  const temps = [];

  if (Number.isFinite(Number(weather?.tempF))) {
    temps.push(Number(weather.tempF));
  }

  if (Array.isArray(weather?.forecast5Day)) {
    weather.forecast5Day.forEach((d) => {
      const temp = Number(d.lowF ?? d.tempF ?? d.temp);
      if (Number.isFinite(temp)) temps.push(temp);
    });
  }

  if (Array.isArray(weather?.dailyWeather5Day)) {
    weather.dailyWeather5Day.forEach((d) => {
      const temp = Number(d.lowF ?? d.tempF ?? d.temp);
      if (Number.isFinite(temp)) temps.push(temp);
    });
  }

  if (temps.length === 0) return null;
  return Math.min(...temps);
}

function getTempDrop(weather) {
  const current = Number(weather?.tempF);
  if (!Number.isFinite(current)) return 0;

  const futureLow = getFutureLowTemp(weather);
  if (!Number.isFinite(futureLow)) return 0;

  return current - futureLow;
}

function getPressureTrend(weather) {
  const current = getPressureInHg(weather?.pressureInHg);

  let future = null;

  if (Array.isArray(weather?.trends48h) && weather.trends48h.length > 0) {
    const withPressure = weather.trends48h
      .map((h) => getPressureInHg(h.pressureInHg))
      .filter((v) => v != null);

    if (withPressure.length > 0) {
      future = withPressure[Math.min(withPressure.length - 1, 8)];
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

function isNorthWind(weather) {
  const windDeg = Number(weather?.windDeg);
  if (!Number.isFinite(windDeg)) return false;

  return windDeg >= 315 || windDeg <= 45;
}

function hasCloudsOrRain(weather) {
  const clouds = Number(weather?.cloudPct);
  const precip = Number(weather?.precipChance);

  return (
    (Number.isFinite(clouds) && clouds >= 60) ||
    (Number.isFinite(precip) && precip >= 30)
  );
}

function evaluateWeatherAlerts(settings, weather) {
  const alerts = [];

  const pressureTrend = getPressureTrend(weather);
  const tempDrop = getTempDrop(weather);
  const futureLow = getFutureLowTemp(weather);
  const windMph = Number(weather?.windMph);
  const northWind = isNorthWind(weather);
  const cloudyOrRainy = hasCloudsOrRain(weather);

  if (settings.freezeWarning && futureLow != null && futureLow <= 32) {
    alerts.push({
      type: "weather-freeze-warning",
      title: "DuckSmart — Freeze Warning",
      body: `Temperatures may hit ${Math.round(futureLow)}°F. Expect freezing conditions.`,
    });
  }

  if (settings.pressureDrop && pressureTrend.change <= -PRESSURE_POINT_THRESHOLD) {
    alerts.push({
      type: "weather-pressure-drop",
      title: "DuckSmart — Pressure Dropping",
      body: `Barometric pressure is dropping about ${Math.abs(pressureTrend.change).toFixed(2)} inHg. Hunting conditions may change.`,
    });
  }

  if (settings.pressureRise && pressureTrend.change >= PRESSURE_POINT_THRESHOLD) {
    alerts.push({
      type: "weather-pressure-rise",
      title: "DuckSmart — Pressure Rising",
      body: `Barometric pressure is rising about ${pressureTrend.change.toFixed(2)} inHg. Watch for changing bird movement.`,
    });
  }

  if (settings.coldFront && tempDrop >= 8 && Number.isFinite(windMph) && windMph >= 8) {
    alerts.push({
      type: "weather-cold-front",
      title: "DuckSmart — Possible Cold Front",
      body: `Temps may drop about ${Math.round(tempDrop)}° with ${Math.round(windMph)} mph wind.`,
    });
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
    alerts.push({
      type: "weather-perfect-storm",
      title: "DuckSmart — Perfect Storm Setup",
      body: "Cold front, north wind, clouds/rain, and dropping temps are lining up.",
    });
  }

  return alerts;
}

async function getSavedExpoPushTokens() {
  const snap = await db.collectionGroup("pushTokens").get();
  const byUser = new Map();

  snap.forEach((docSnap) => {
    const data = docSnap.data();

    if (!data || data.enabled === false) return;

    const token = data.token;

    if (!Expo.isExpoPushToken(token)) {
      logger.warn("Invalid Expo push token skipped", { token });
      return;
    }

    const userRef = docSnap.ref.parent.parent;
    if (!userRef) return;

    const uid = userRef.id;

    if (!byUser.has(uid)) {
      byUser.set(uid, {
        uid,
        userRef,
        tokens: new Set(),
      });
    }

    byUser.get(uid).tokens.add(token);
  });

  return Array.from(byUser.values()).map((entry) => ({
    ...entry,
    tokens: Array.from(entry.tokens),
  }));
}

async function sendExpoPushMessages(messages) {
  const chunks = expo.chunkPushNotifications(messages);
  const tickets = [];

  for (const chunk of chunks) {
    try {
      const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
      tickets.push(...ticketChunk);
    } catch (err) {
      logger.error("Expo push chunk failed", err);
    }
  }

  return tickets;
}

async function wasAlertSentToday(uid, type) {
  const todayKey = getTodayKey();
  const ref = db.doc(`users/${uid}/notificationHistory/${todayKey}`);
  const snap = await ref.get();

  if (!snap.exists) return false;

  return snap.data()?.sentTypes?.[type] === true;
}

async function markAlertSentToday(uid, type) {
  const todayKey = getTodayKey();
  const ref = db.doc(`users/${uid}/notificationHistory/${todayKey}`);

  await ref.set(
    {
      sentTypes: {
        [type]: true,
      },
      updatedAt: Date.now(),
      updatedAtServer: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

async function runWeatherAlertCheck() {
  const usersWithTokens = await getSavedExpoPushTokens();

  let usersChecked = 0;
  let usersSkippedNoLocation = 0;
  let pushesQueued = 0;

  const messages = [];

  for (const entry of usersWithTokens) {
    const { uid, userRef, tokens } = entry;

    try {
      const [settingsSnap, userSnap] = await Promise.all([
        db.doc(`users/${uid}/settings/notifications`).get(),
        userRef.get(),
      ]);

      const settingsData = settingsSnap.exists ? settingsSnap.data() : {};
      const userData = userSnap.exists ? userSnap.data() : {};

      const settings = normalizeWeatherAlertSettings(
        settingsData?.weatherAlerts || settingsData
      );

      const hasAnyAlertEnabled = Object.values(settings).some(Boolean);
      if (!hasAnyAlertEnabled) continue;

      const location = getSavedLocation(settingsData, userData);

      if (!location) {
        usersSkippedNoLocation++;
        logger.info("Skipping user with no saved weather location", { uid });
        continue;
      }

      usersChecked++;

      const weather = await fetchWeather(location.lat, location.lon);
      const alerts = evaluateWeatherAlerts(settings, weather);

      for (const alert of alerts) {
        const alreadySent = await wasAlertSentToday(uid, alert.type);
        if (alreadySent) continue;

        tokens.forEach((token) => {
          messages.push({
            to: token,
            sound: "default",
            title: alert.title,
            body: alert.body,
            data: {
              type: alert.type,
              locationName: weather.locationName || location.locationName || "Your Area",
              sentAt: Date.now(),
            },
          });
        });

        await markAlertSentToday(uid, alert.type);
        pushesQueued += tokens.length;
      }
    } catch (err) {
      logger.error("Weather alert check failed for user", {
        uid,
        error: err.message || err,
      });
    }
  }

  let tickets = [];

  if (messages.length > 0) {
    tickets = await sendExpoPushMessages(messages);
  }

  return {
    ok: true,
    usersWithTokens: usersWithTokens.length,
    usersChecked,
    usersSkippedNoLocation,
    pushesQueued,
    ticketCount: tickets.length,
  };
}

exports.syncDuckSmartSignupToHubSpot = onDocumentWritten(
  {
    document: "users/{uid}/profile/private",
    region: "us-central1",
    timeoutSeconds: 60,
    memory: "256MiB",
    secrets: [HUBSPOT_PRIVATE_APP_TOKEN],
  },
  async (event) => {
    const afterSnap = event.data?.after;

    if (!afterSnap || !afterSnap.exists) {
      logger.warn("syncDuckSmartSignupToHubSpot skipped: no after snapshot");
      return;
    }

    const uid = event.params.uid;
    const profile = afterSnap.data() || {};
    const syncStatus = String(profile.hubspotSyncStatus || "").toLowerCase();
    const syncVersion = String(profile.hubspotSyncVersion || "");

    if (syncStatus === "synced" && syncVersion === HUBSPOT_SYNC_VERSION) {
      logger.info("syncDuckSmartSignupToHubSpot skipped: already synced", {
        uid,
        hubspotContactId: profile.hubspotContactId || "",
      });
      return;
    }

    if (syncStatus === "error" && syncVersion === HUBSPOT_SYNC_VERSION) {
      logger.info("syncDuckSmartSignupToHubSpot skipped: previous error already recorded", {
        uid,
        error: profile.hubspotSyncError || "",
      });
      return;
    }

    const email = cleanEmail(profile.emailLower || profile.email || "");

    if (!email || !email.includes("@")) {
      await afterSnap.ref.set(
        {
          hubspotSyncStatus: "error",
          hubspotSyncVersion: HUBSPOT_SYNC_VERSION,
          hubspotSyncError: "Missing valid email.",
          hubspotSyncAttemptedAt: Date.now(),
          hubspotSyncAttemptedAtServer: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      logger.warn("syncDuckSmartSignupToHubSpot skipped: invalid email", {
        uid,
        email,
      });

      return;
    }

    try {
      const contact = await upsertHubSpotContact({ uid, profile });

      await afterSnap.ref.set(
        {
          hubspotSyncStatus: "synced",
          hubspotSyncVersion: HUBSPOT_SYNC_VERSION,
          hubspotContactId: contact?.id || "",
          hubspotSyncedAt: Date.now(),
          hubspotSyncedAtServer: admin.firestore.FieldValue.serverTimestamp(),
          hubspotSyncError: "",
        },
        { merge: true }
      );

      logger.info("DuckSmart signup synced to HubSpot", {
        uid,
        email,
        hubspotContactId: contact?.id || "",
      });
    } catch (err) {
      const message = err.message || "Unknown HubSpot sync error";

      await afterSnap.ref.set(
        {
          hubspotSyncStatus: "error",
          hubspotSyncVersion: HUBSPOT_SYNC_VERSION,
          hubspotSyncError: message,
          hubspotSyncAttemptedAt: Date.now(),
          hubspotSyncAttemptedAtServer: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      logger.error("DuckSmart signup HubSpot sync failed", {
        uid,
        email,
        error: message,
        status: err.status || null,
      });
    }
  }
);

exports.getWeather = onRequest(
  {
    region: "us-central1",
    cors: true,
    invoker: "public",
    secrets: [OWM_API_KEY],
    timeoutSeconds: 60,
    memory: "256MiB",
  },
  async (req, res) => {
    if (sendOptions(req, res)) return;

    try {
      const lat = req.query.lat;
      const lon = req.query.lon ?? req.query.lng;

      if (!lat || !lon) {
        res.status(400).json({
          ok: false,
          error: "Missing lat or lon",
        });
        return;
      }

      const weather = await fetchWeather(lat, lon);

      res.json({
        ok: true,
        weather,
      });
    } catch (err) {
      logger.error("getWeather failed", err);

      res.status(500).json({
        ok: false,
        error: err.message || "Unknown error",
      });
    }
  }
);

exports.getRegridTile = onRequest(
  {
    region: "us-central1",
    cors: true,
    invoker: "public",
    secrets: [REGRID_TOKEN],
    timeoutSeconds: 60,
    memory: "256MiB",
  },
  async (req, res) => {
    if (sendOptions(req, res)) return;

    try {
      const pathParts = (req.path || "")
        .split("/")
        .map((part) => part.trim())
        .filter(Boolean);

      const z = req.query.z || pathParts[0];
      const x = req.query.x || pathParts[1];
      const yRaw = req.query.y || pathParts[2];
      const y = yRaw ? `${yRaw}`.replace(".png", "") : null;

      if (!z || !x || !y) {
        res.status(400).json({
          ok: false,
          error: "Missing tile z/x/y",
        });
        return;
      }

      const tileUrl =
        `${REGRID_TILE_BASE}/${encodeURIComponent(z)}/${encodeURIComponent(x)}/${encodeURIComponent(y)}.png` +
        `?token=${encodeURIComponent(getRegridToken())}`;

      const upstream = await fetch(tileUrl);

      if (!upstream.ok) {
        res.status(upstream.status).send(await upstream.text());
        return;
      }

      const buffer = Buffer.from(await upstream.arrayBuffer());

      res.set("Content-Type", upstream.headers.get("content-type") || "image/png");
      res.set("Cache-Control", "public, max-age=86400");
      res.status(200).send(buffer);
    } catch (err) {
      logger.error("getRegridTile failed", err);

      res.status(500).json({
        ok: false,
        error: err.message || "Unknown error",
      });
    }
  }
);

exports.lookupRegridParcel = onRequest(
  {
    region: "us-central1",
    cors: true,
    invoker: "public",
    secrets: [REGRID_TOKEN],
    timeoutSeconds: 60,
    memory: "256MiB",
  },
  async (req, res) => {
    if (sendOptions(req, res)) return;

    try {
      const lat = req.query.lat;
      const lon = req.query.lon ?? req.query.lng;

      if (!lat || !lon) {
        res.status(400).json({
          ok: false,
          error: "Missing lat or lon",
        });
        return;
      }

      const url = new URL(`${REGRID_API_BASE}/point`);
      url.searchParams.set("lat", `${lat}`);
      url.searchParams.set("lon", `${lon}`);
      url.searchParams.set("token", getRegridToken());

      copyQueryParam(req, url, "radius");
      copyQueryParam(req, url, "limit");
      copyQueryParam(req, url, "return_geometry");
      copyQueryParam(req, url, "return_custom");

      if (!url.searchParams.has("radius")) url.searchParams.set("radius", "8");
      if (!url.searchParams.has("limit")) url.searchParams.set("limit", "1");
      if (!url.searchParams.has("return_geometry")) url.searchParams.set("return_geometry", "false");
      if (!url.searchParams.has("return_custom")) url.searchParams.set("return_custom", "true");

      const upstream = await fetch(url.toString());
      const data = await upstream.json().catch(() => ({}));

      res.status(upstream.status).json(data);
    } catch (err) {
      logger.error("lookupRegridParcel failed", err);

      res.status(500).json({
        ok: false,
        error: err.message || "Unknown error",
      });
    }
  }
);

exports.searchRegridAddress = onRequest(
  {
    region: "us-central1",
    cors: true,
    invoker: "public",
    secrets: [REGRID_TOKEN],
    timeoutSeconds: 60,
    memory: "256MiB",
  },
  async (req, res) => {
    if (sendOptions(req, res)) return;

    try {
      const query = req.query.query || req.query.q || req.query.address;

      if (!query) {
        res.status(400).json({
          ok: false,
          error: "Missing query",
        });
        return;
      }

      const url = new URL(`${REGRID_API_BASE}/address`);
      url.searchParams.set("query", `${query}`);
      url.searchParams.set("token", getRegridToken());

      copyQueryParam(req, url, "path");
      copyQueryParam(req, url, "limit");
      copyQueryParam(req, url, "return_geometry");
      copyQueryParam(req, url, "return_custom");

      if (!url.searchParams.has("limit")) url.searchParams.set("limit", "10");
      if (!url.searchParams.has("return_geometry")) url.searchParams.set("return_geometry", "true");
      if (!url.searchParams.has("return_custom")) url.searchParams.set("return_custom", "true");

      const upstream = await fetch(url.toString());
      const data = await upstream.json().catch(() => ({}));

      res.status(upstream.status).json(data);
    } catch (err) {
      logger.error("searchRegridAddress failed", err);

      res.status(500).json({
        ok: false,
        error: err.message || "Unknown error",
      });
    }
  }
);

exports.searchRegridOwner = onRequest(
  {
    region: "us-central1",
    cors: true,
    invoker: "public",
    secrets: [REGRID_TOKEN],
    timeoutSeconds: 60,
    memory: "256MiB",
  },
  async (req, res) => {
    if (sendOptions(req, res)) return;

    try {
      const owner = req.query.owner || req.query.query || req.query.q;

      if (!owner) {
        res.status(400).json({
          ok: false,
          error: "Missing owner",
        });
        return;
      }

      const url = new URL(`${REGRID_API_BASE}/owner`);
      url.searchParams.set("owner", `${owner}`);
      url.searchParams.set("token", getRegridToken());

      copyQueryParam(req, url, "path");
      copyQueryParam(req, url, "limit");
      copyQueryParam(req, url, "return_geometry");
      copyQueryParam(req, url, "return_custom");
      copyQueryParam(req, url, "return_field_labels");
      copyQueryParam(req, url, "return_stacked");
      copyQueryParam(req, url, "return_zoning");
      copyQueryParam(req, url, "return_matched_buildings");
      copyQueryParam(req, url, "return_matched_addresses");
      copyQueryParam(req, url, "return_enhanced_ownership");

      if (!url.searchParams.has("limit")) url.searchParams.set("limit", "20");
      if (!url.searchParams.has("return_custom")) url.searchParams.set("return_custom", "true");

      const upstream = await fetch(url.toString());
      const data = await upstream.json().catch(() => ({}));

      res.status(upstream.status).json(data);
    } catch (err) {
      logger.error("searchRegridOwner failed", err);

      res.status(500).json({
        ok: false,
        error: err.message || "Unknown error",
      });
    }
  }
);

exports.callOpenAI = onRequest(
  {
    region: "us-central1",
    cors: true,
    invoker: "public",
    secrets: [OPENAI_API_KEY],
    timeoutSeconds: 120,
    memory: "512MiB",
  },
  async (req, res) => {
    if (sendOptions(req, res)) return;

    try {
      if (req.method !== "POST") {
        res.status(405).json({
          ok: false,
          error: "POST required",
        });
        return;
      }

      await verifyFirebaseAuth(req);

      const upstream = await fetch(OPENAI_CHAT_COMPLETIONS_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${getOpenAiApiKey()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(req.body || {}),
      });

      const text = await upstream.text();

      res.status(upstream.status);
      res.set("Content-Type", upstream.headers.get("content-type") || "application/json");
      res.send(text);
    } catch (err) {
      logger.error("callOpenAI failed", err);

      const isAuthError =
        err.message === "Missing Firebase auth token" ||
        err.code === "auth/argument-error" ||
        err.code === "auth/id-token-expired";

      res.status(isAuthError ? 401 : 500).json({
        ok: false,
        error: err.message || "Unknown error",
      });
    }
  }
);

exports.sendTestPush = onRequest(
  {
    region: "us-central1",
    cors: true,
    invoker: "public",
  },
  async (req, res) => {
    if (sendOptions(req, res)) return;

    try {
      const key = req.query.key;

      if (key !== TEST_PUSH_KEY) {
        res.status(403).json({
          ok: false,
          error: "Forbidden",
        });
        return;
      }

      const usersWithTokens = await getSavedExpoPushTokens();
      const tokens = usersWithTokens.flatMap((entry) => entry.tokens);

      if (!tokens.length) {
        res.json({
          ok: true,
          sent: 0,
          message: "No saved Expo push tokens found.",
        });
        return;
      }

      const messages = tokens.map((token) => ({
        to: token,
        sound: "default",
        title: "DuckSmart Push Test",
        body: "If you see this, remote push notifications are working.",
        data: {
          type: "test-push",
          sentAt: Date.now(),
        },
      }));

      const tickets = await sendExpoPushMessages(messages);

      res.json({
        ok: true,
        tokenCount: tokens.length,
        ticketCount: tickets.length,
        tickets,
      });
    } catch (err) {
      logger.error("sendTestPush failed", err);

      res.status(500).json({
        ok: false,
        error: err.message || "Unknown error",
      });
    }
  }
);

exports.runWeatherAlertCheckNow = onRequest(
  {
    region: "us-central1",
    cors: true,
    invoker: "public",
    secrets: [OWM_API_KEY],
    timeoutSeconds: 540,
    memory: "512MiB",
  },
  async (req, res) => {
    if (sendOptions(req, res)) return;

    try {
      const key = req.query.key;

      if (key !== TEST_PUSH_KEY) {
        res.status(403).json({
          ok: false,
          error: "Forbidden",
        });
        return;
      }

      const result = await runWeatherAlertCheck();
      res.json(result);
    } catch (err) {
      logger.error("runWeatherAlertCheckNow failed", err);

      res.status(500).json({
        ok: false,
        error: err.message || "Unknown error",
      });
    }
  }
);

exports.scheduledWeatherAlerts = onSchedule(
  {
    schedule: "every 60 minutes",
    region: "us-central1",
    timeZone: "America/New_York",
    secrets: [OWM_API_KEY],
    timeoutSeconds: 540,
    memory: "512MiB",
  },
  async () => {
    const result = await runWeatherAlertCheck();
    logger.info("scheduledWeatherAlerts result", result);
  }
);