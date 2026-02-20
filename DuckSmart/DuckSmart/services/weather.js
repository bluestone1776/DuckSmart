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

  // --- hourly array (next 5 forecast entries) ---
  const hourly = list.slice(0, 5).map((entry, idx) => ({
    t: idx === 0 ? "Now" : formatHourLabel(entry.dt, tzOffset),
    temp: Math.round(entry.main.temp),
    precip: Math.round((entry.pop || 0) * 100),
    wind: Math.round(entry.wind.speed),
    gust: Math.round(entry.wind.gust || entry.wind.speed),
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
    { t: "1p", temp: 33, precip: 30, wind: 13, gust: 20 },
    { t: "2p", temp: 34, precip: 35, wind: 14, gust: 22 },
    { t: "3p", temp: 34, precip: 40, wind: 13, gust: 21 },
    { t: "4p", temp: 32, precip: 30, wind: 11, gust: 17 },
  ],
};
