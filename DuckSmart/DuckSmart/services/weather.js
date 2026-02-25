// DuckSmart — OpenWeatherMap weather service
//
// Uses the free-tier endpoints:
//   1. Current Weather  (/data/2.5/weather)   — live conditions
//   2. 5-Day Forecast   (/data/2.5/forecast)  — 3-hour steps for hourly + deltas
//
// Transforms raw API data into the app's weather object shape so the
// scoring engine, Today display, and Log Weather Brief all work unchanged.

import { OWM_API_KEY } from "../config";

const BASE = "https://api.openweathermap.org/data/2.5";

// ── raw API calls ────────────────────────────────────────────

async function fetchCurrentWeather(lat, lon) {
  const url = `${BASE}/weather?lat=${lat}&lon=${lon}&units=imperial&appid=${OWM_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OWM current: ${res.status}`);
  return res.json();
}

async function fetchForecast(lat, lon) {
  const url = `${BASE}/forecast?lat=${lat}&lon=${lon}&units=imperial&appid=${OWM_API_KEY}`;
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
  // Use the location's timezone offset from OWM (seconds from UTC)
  // instead of the device's local timezone
  const utcMs = unix * 1000;
  const localMs = utcMs + tzOffsetSec * 1000;
  const d = new Date(localMs);
  // getUTCHours gives us the "local" hour at the weather location
  let hours = d.getUTCHours();
  if (hours === 0) return "12a";
  if (hours < 12) return `${hours}a`;
  if (hours === 12) return "12p";
  return `${hours - 12}p`;
}

// ── hourly interpolation ─────────────────────────────────────
//
// OWM 5-day forecast gives 3-hour steps. We interpolate to generate
// 1-hour resolution data so the Hourly Snapshot shows e.g. 7pm 8pm 9pm.
// We produce up to 6 hourly entries starting from the current hour.

function lerp(a, b, t) {
  return a + (b - a) * t;
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

function buildHourlyFromForecast(list, nowUnix, tzOffset) {
  if (!list || list.length < 2) return [];

  const HOURS_TO_GENERATE = 6; // enough for 3 free + 5 pro + 1 buffer
  const result = [];

  // Start from the top of the current hour
  const currentHourUnix = Math.floor(nowUnix / 3600) * 3600;

  for (let h = 0; h < HOURS_TO_GENERATE; h++) {
    const targetUnix = currentHourUnix + h * 3600;

    // Find the two forecast entries that bracket this hour
    let before = null;
    let after = null;
    for (let i = 0; i < list.length - 1; i++) {
      if (list[i].dt <= targetUnix && list[i + 1].dt >= targetUnix) {
        before = list[i];
        after = list[i + 1];
        break;
      }
    }

    // If target is before the first entry, use the first entry
    if (!before && list.length > 0 && targetUnix <= list[0].dt) {
      before = list[0];
      after = list[0];
    }
    // If target is after the last bracketed pair, use the nearest entry
    if (!before) {
      const nearest = list.find((e) => e.dt >= targetUnix) || list[list.length - 1];
      before = nearest;
      after = nearest;
    }

    // Calculate interpolation factor (0..1 between the two entries)
    const span = after.dt - before.dt;
    const t = span > 0 ? (targetUnix - before.dt) / span : 0;

    result.push({
      t: h === 0 ? "Now" : formatFullHourLabel(targetUnix, tzOffset),
      temp: Math.round(lerp(before.main.temp, after.main.temp, t)),
      precip: Math.round(lerp((before.pop || 0) * 100, (after.pop || 0) * 100, t)),
      wind: Math.round(lerp(before.wind.speed, after.wind.speed, t)),
      gust: Math.round(lerp(
        before.wind.gust || before.wind.speed,
        after.wind.gust || after.wind.speed,
        t
      )),
    });
  }

  return result;
}

// ── transform ────────────────────────────────────────────────

function buildWeatherObject(current, forecast) {
  const now = Date.now() / 1000; // current unix seconds
  const list = forecast.list || [];

  // --- direct mappings (units=imperial gives °F and mph) ---
  const tempF = Math.round(current.main.temp);
  const feelsLikeF = Math.round(current.main.feels_like);
  const windMph = Math.round(current.wind.speed);
  const windDeg = current.wind.deg || 0;
  const pressureHpa = current.main.pressure;
  const pressureInHg = Math.round(hpaToInHg(pressureHpa) * 100) / 100;
  const cloudPct = current.clouds.all;
  const locationName = current.name || "Your Area";
  const tzOffset = current.timezone || 0; // seconds from UTC for this location

  // precipChance: use the first forecast entry's pop (probability of precipitation)
  const precipChance = list.length > 0 ? Math.round((list[0].pop || 0) * 100) : 0;

  // sunrise / sunset — use the location's timezone
  const sunrise = current.sys.sunrise ? unixToTimeString(current.sys.sunrise, tzOffset) : "–";
  const sunset = current.sys.sunset ? unixToTimeString(current.sys.sunset, tzOffset) : "–";

  // --- delta calculations ---

  // deltaTemp24hF: compare current temp to forecast ~24h from now
  // The 5-day forecast gives entries every 3 hours. Entry index 7-8 is ~21-24h out.
  let deltaTemp24hF = 0;
  const entry24h = list.find((e) => e.dt >= now + 22 * 3600) || list[list.length - 1];
  if (entry24h) {
    // Positive = warmer ahead, Negative = colder ahead
    // But our scoring expects: negative = it GOT colder (past tense)
    // So we reverse: if future is colder → positive delta (birds moved), if future warmer → negative
    // Actually, the scoring's coldSignal treats negative deltaTemp24hF as "it got colder" = good push
    // Best approximation: current temp minus the temp 24h-ago-ish (use earliest forecast)
    // OWM forecast is forward-looking. Let's estimate: current minus ~24h-ahead entry
    // If temp is dropping (entry24h.main.temp < current), that's a cold front coming.
    deltaTemp24hF = Math.round(entry24h.main.temp - tempF);
  }

  // deltaPressure3h: compare current pressure to the nearest forecast entry (~3h)
  let deltaPressure3h = 0;
  const entry3h = list.find((e) => e.dt >= now + 2.5 * 3600);
  if (entry3h) {
    const futureInHg = hpaToInHg(entry3h.main.pressure);
    deltaPressure3h = Math.round((pressureInHg - futureInHg) * 100) / 100;
  }

  // --- hourly array (1-hour intervals, interpolated from 3-hour forecast) ---
  // OWM free tier gives 3-hour steps. We linearly interpolate to get true
  // hour-by-hour data so the UI can show e.g. 7pm, 8pm, 9pm, 10pm, 11pm.
  const hourly = buildHourlyFromForecast(list, now, tzOffset);

  // --- 48-hour trend data (up to 16 forecast entries = 48hrs at 3hr intervals) ---
  const trends48h = list.slice(0, 16).map((entry) => ({
    t: formatHourLabel(entry.dt, tzOffset),
    temp: Math.round(entry.main.temp),
    pressureInHg: Math.round(hpaToInHg(entry.main.pressure) * 100) / 100,
    wind: Math.round(entry.wind.speed),
    windDeg: entry.wind.deg || 0,
  }));

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
  };
}

// ── public API ───────────────────────────────────────────────

/**
 * Fetch weather for given coordinates and return the app's weather object.
 * Returns null on any error (caller should handle fallback).
 */
export async function fetchWeather(lat, lon) {
  if (!OWM_API_KEY || OWM_API_KEY === "YOUR_API_KEY_HERE") {
    console.warn("DuckSmart: No OpenWeatherMap API key configured. Using mock data.");
    return null;
  }

  try {
    const [current, forecast] = await Promise.all([
      fetchCurrentWeather(lat, lon),
      fetchForecast(lat, lon),
    ]);
    return buildWeatherObject(current, forecast);
  } catch (err) {
    console.error("DuckSmart weather fetch error:", err.message);
    return null;
  }
}

/**
 * Default mock weather — used as fallback when API is unavailable.
 */
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
    { t: "3p",  temp: 33, pressureInHg: 30.05, wind: 13, windDeg: 310 },
    { t: "6p",  temp: 30, pressureInHg: 30.02, wind: 14, windDeg: 305 },
    { t: "9p",  temp: 27, pressureInHg: 29.98, wind: 11, windDeg: 300 },
    { t: "12a", temp: 24, pressureInHg: 29.95, wind: 10, windDeg: 295 },
    { t: "3a",  temp: 22, pressureInHg: 29.92, wind: 9,  windDeg: 290 },
    { t: "6a",  temp: 21, pressureInHg: 29.90, wind: 8,  windDeg: 285 },
    { t: "9a",  temp: 25, pressureInHg: 29.88, wind: 10, windDeg: 280 },
    { t: "12p", temp: 29, pressureInHg: 29.92, wind: 12, windDeg: 275 },
    { t: "3p",  temp: 31, pressureInHg: 29.95, wind: 14, windDeg: 270 },
    { t: "6p",  temp: 28, pressureInHg: 29.98, wind: 12, windDeg: 265 },
    { t: "9p",  temp: 25, pressureInHg: 30.00, wind: 10, windDeg: 260 },
    { t: "12a", temp: 22, pressureInHg: 30.02, wind: 8,  windDeg: 255 },
    { t: "3a",  temp: 20, pressureInHg: 30.04, wind: 7,  windDeg: 250 },
    { t: "6a",  temp: 19, pressureInHg: 30.06, wind: 6,  windDeg: 250 },
    { t: "9a",  temp: 23, pressureInHg: 30.08, wind: 9,  windDeg: 255 },
  ],
};
