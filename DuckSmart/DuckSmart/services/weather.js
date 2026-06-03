// DuckSmart — OpenWeatherMap weather service
//
// Uses the free-tier endpoints:
//   1. Current Weather  (/data/2.5/weather)   — live conditions
//   2. 5-Day Forecast   (/data/2.5/forecast)  — 3-hour steps for hourly + deltas
//
// Transforms raw API data into the app's weather object shape so the
// scoring engine, Today display, and Log Weather Brief all work unchanged.

import { GET_WEATHER_URL } from "../config";

const BASE = "https://api.openweathermap.org/data/2.5";

// ── raw API calls ────────────────────────────────────────────

async function fetchCurrentWeather(lat, lon) {
  const url = `${BASE}/weather?lat=${lat}&lon=${lon}&units=imperial`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OWM current: ${res.status}`);
  return res.json();
}

async function fetchForecast(lat, lon) {
  const url = `${BASE}/forecast?lat=${lat}&lon=${lon}&units=imperial`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OWM forecast: ${res.status}`);
  return res.json();
}

// ── helpers ──────────────────────────────────────────────────

function hpaToInHg(hpa) {
  return hpa / 33.8639;
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

// ── hourly interpolation ─────────────────────────────────────

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

// ── daily forecast aggregation for hunt scoring ───────────────

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

// ── plain 5-day weather forecast for Today UI ─────────────────

function buildDailyWeatherForecasts(list, current, tzOffset) {
  if (!list || list.length === 0) return [];

  const currentDateKey = current?.dt ? localDateKeyFromUnix(current.dt, tzOffset) : null;
  const days = groupForecastByLocalDay(list, tzOffset);
  const result = [];

  for (let i = 0; i < Math.min(days.length, 5); i++) {
    const { entries, localMs, dateKey } = days[i];

    const temps = entries.flatMap((entry) => [
      entry.main.temp,
      entry.main.temp_min,
      entry.main.temp_max,
    ]).filter((value) => typeof value === "number");

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

// ── transform ────────────────────────────────────────────────

function buildWeatherObject(current, forecast) {
  const now = Date.now() / 1000;
  const list = forecast.list || [];

  const tempF = Math.round(current.main.temp);
  const feelsLikeF = Math.round(current.main.feels_like);
  const windMph = Math.round(current.wind.speed);
  const windDeg = current.wind.deg || 0;
  const pressureHpa = current.main.pressure;
  const pressureInHg = Math.round(hpaToInHg(pressureHpa) * 100) / 100;

  const currentCloudPct = typeof current.clouds?.all === "number" ? current.clouds.all : null;
  const forecastCloudPct = typeof list[0]?.clouds?.all === "number" ? list[0].clouds.all : null;
  const cloudPct = Math.round(
    currentCloudPct != null && forecastCloudPct != null
      ? (currentCloudPct + forecastCloudPct) / 2
      : forecastCloudPct ?? currentCloudPct ?? 0
  );

  const locationName = current.name || "Your Area";
  const tzOffset = current.timezone || 0;

  const precipChance = list.length > 0 ? Math.round((list[0].pop || 0) * 100) : 0;

  const sunrise = current.sys.sunrise ? unixToTimeString(current.sys.sunrise, tzOffset) : "–";
  const sunset = current.sys.sunset ? unixToTimeString(current.sys.sunset, tzOffset) : "–";

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

// ── public API ───────────────────────────────────────────────

export async function fetchWeather(lat, lon) {
  if (!GET_WEATHER_URL) {
    console.warn("DuckSmart: No weather function configured. Using mock data.");
    return null;
  }

  try {
    const url =
      `${GET_WEATHER_URL}` +
      `?lat=${encodeURIComponent(lat)}` +
      `&lon=${encodeURIComponent(lon)}`;

    const res = await fetch(url);
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data?.error || `Weather function: ${res.status}`);
    }

    return data?.weather || data;
  } catch (err) {
    console.error("DuckSmart weather fetch error:", err.message);
    return null;
  }
}

export const MOCK_WEATHER = {
  locationName: "Your Area",
  tempF: 31,
  feelsLikeF: 26,
  windMph: 12,
  windDeg: 315,
  pressureInHg: 30.08,
  deltaTemp24hF: -10,
  deltaPressure3h: 0.06,
  precipChance: 35,
  cloudPct: 70,
  sunrise: "7:32 AM",
  sunset: "5:18 PM",
  hourly: [
    { t: "Now", temp: 31, precip: 25, wind: 12, gust: 18 },
    { t: "1pm", temp: 32, precip: 28, wind: 12, gust: 19 },
    { t: "2pm", temp: 33, precip: 30, wind: 13, gust: 20 },
    { t: "3pm", temp: 34, precip: 35, wind: 14, gust: 22 },
    { t: "4pm", temp: 34, precip: 40, wind: 13, gust: 21 },
    { t: "5pm", temp: 32, precip: 30, wind: 11, gust: 17 },
  ],
  trends48h: [
    { t: "12p", temp: 31, pressureInHg: 30.08, wind: 12, windDeg: 315 },
    { t: "3p", temp: 33, pressureInHg: 30.05, wind: 13, windDeg: 310 },
    { t: "6p", temp: 30, pressureInHg: 30.02, wind: 14, windDeg: 305 },
    { t: "9p", temp: 27, pressureInHg: 29.98, wind: 11, windDeg: 300 },
    { t: "12a", temp: 24, pressureInHg: 29.95, wind: 10, windDeg: 295 },
    { t: "3a", temp: 22, pressureInHg: 29.92, wind: 9, windDeg: 290 },
    { t: "6a", temp: 21, pressureInHg: 29.90, wind: 8, windDeg: 285 },
    { t: "9a", temp: 25, pressureInHg: 29.88, wind: 10, windDeg: 280 },
    { t: "12p", temp: 29, pressureInHg: 29.92, wind: 12, windDeg: 275 },
    { t: "3p", temp: 31, pressureInHg: 29.95, wind: 14, windDeg: 270 },
    { t: "6p", temp: 28, pressureInHg: 29.98, wind: 12, windDeg: 265 },
    { t: "9p", temp: 25, pressureInHg: 30.00, wind: 10, windDeg: 260 },
    { t: "12a", temp: 22, pressureInHg: 30.02, wind: 8, windDeg: 255 },
    { t: "3a", temp: 20, pressureInHg: 30.04, wind: 7, windDeg: 250 },
    { t: "6a", temp: 19, pressureInHg: 30.06, wind: 6, windDeg: 250 },
    { t: "9a", temp: 23, pressureInHg: 30.08, wind: 9, windDeg: 255 },
  ],
  forecast5Day: [
    { label: "Wed", dateUnix: Math.floor(Date.now() / 1000) + 86400, deltaTemp24hF: -8, deltaPressure3h: 0.08, windMph: 14, precipChance: 20, cloudPct: 55 },
    { label: "Thu", dateUnix: Math.floor(Date.now() / 1000) + 172800, deltaTemp24hF: -3, deltaPressure3h: 0.04, windMph: 10, precipChance: 45, cloudPct: 80 },
    { label: "Fri", dateUnix: Math.floor(Date.now() / 1000) + 259200, deltaTemp24hF: 5, deltaPressure3h: 0.02, windMph: 6, precipChance: 60, cloudPct: 90 },
    { label: "Sat", dateUnix: Math.floor(Date.now() / 1000) + 345600, deltaTemp24hF: 2, deltaPressure3h: 0.03, windMph: 8, precipChance: 30, cloudPct: 40 },
  ],
  dailyWeather5Day: [
    { label: "Today", dateUnix: Math.floor(Date.now() / 1000), highF: 34, lowF: 24, precipChance: 40, windMph: 12, gustMph: 20, cloudPct: 70, condition: "Cloudy", icon: null },
    { label: "Thu", dateUnix: Math.floor(Date.now() / 1000) + 86400, highF: 38, lowF: 25, precipChance: 30, windMph: 10, gustMph: 18, cloudPct: 55, condition: "Partly Cloudy", icon: null },
    { label: "Fri", dateUnix: Math.floor(Date.now() / 1000) + 172800, highF: 41, lowF: 28, precipChance: 45, windMph: 14, gustMph: 22, cloudPct: 80, condition: "Light Rain", icon: null },
    { label: "Sat", dateUnix: Math.floor(Date.now() / 1000) + 259200, highF: 36, lowF: 22, precipChance: 20, windMph: 11, gustMph: 19, cloudPct: 40, condition: "Clear", icon: null },
    { label: "Sun", dateUnix: Math.floor(Date.now() / 1000) + 345600, highF: 39, lowF: 26, precipChance: 35, windMph: 9, gustMph: 15, cloudPct: 60, condition: "Overcast Clouds", icon: null },
  ],
};