// DuckSmart — Web Weather Service
//
// TypeScript port of services/weather.js for the Next.js web dashboard.
// Uses the same OpenWeatherMap free-tier endpoints and transformation logic.

const OWM_API_KEY = process.env.NEXT_PUBLIC_OWM_API_KEY || "";
const BASE = "https://api.openweathermap.org/data/2.5";

// ── Types ────────────────────────────────────────────────────

export interface HourlyEntry {
  t: string;
  temp: number;
  precip: number;
  wind: number;
  gust: number;
}

export interface TrendEntry {
  t: string;
  temp: number;
  pressureInHg: number;
  wind: number;
  windDeg: number;
}

export interface WeatherData {
  locationName: string;
  tempF: number;
  feelsLikeF: number;
  windMph: number;
  windDeg: number;
  pressureInHg: number;
  deltaTemp24hF: number;
  deltaPressure3h: number;
  precipChance: number;
  cloudPct: number;
  sunrise: string;
  sunset: string;
  hourly: HourlyEntry[];
  trends48h: TrendEntry[];
}

// ── Raw API calls ────────────────────────────────────────────

async function fetchCurrentWeather(lat: number, lon: number) {
  const url = `${BASE}/weather?lat=${lat}&lon=${lon}&units=imperial&appid=${OWM_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OWM current: ${res.status}`);
  return res.json();
}

async function fetchForecast(lat: number, lon: number) {
  const url = `${BASE}/forecast?lat=${lat}&lon=${lon}&units=imperial&appid=${OWM_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OWM forecast: ${res.status}`);
  return res.json();
}

// ── Helpers ──────────────────────────────────────────────────

function hpaToInHg(hpa: number): number {
  return hpa / 33.8639;
}

function unixToTimeString(unix: number, tzOffsetSec: number): string {
  const utcMs = unix * 1000;
  const localMs = utcMs + (tzOffsetSec || 0) * 1000;
  const d = new Date(localMs);
  let hours = d.getUTCHours();
  const mins = d.getUTCMinutes().toString().padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  return `${hours}:${mins} ${ampm}`;
}

function formatHourLabel(unix: number, tzOffsetSec: number): string {
  const utcMs = unix * 1000;
  const localMs = utcMs + tzOffsetSec * 1000;
  const d = new Date(localMs);
  const hours = d.getUTCHours();
  if (hours === 0) return "12a";
  if (hours < 12) return `${hours}a`;
  if (hours === 12) return "12p";
  return `${hours - 12}p`;
}

// ── Hourly interpolation ─────────────────────────────────────

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function formatFullHourLabel(unix: number, tzOffsetSec: number): string {
  const utcMs = unix * 1000;
  const localMs = utcMs + tzOffsetSec * 1000;
  const d = new Date(localMs);
  let hours = d.getUTCHours();
  const ampm = hours >= 12 ? "pm" : "am";
  hours = hours % 12 || 12;
  return `${hours}${ampm}`;
}

function buildHourlyFromForecast(
  list: any[],
  nowUnix: number,
  tzOffset: number
): HourlyEntry[] {
  if (!list || list.length < 2) return [];

  const HOURS_TO_GENERATE = 6;
  const result: HourlyEntry[] = [];
  const currentHourUnix = Math.floor(nowUnix / 3600) * 3600;

  for (let h = 0; h < HOURS_TO_GENERATE; h++) {
    const targetUnix = currentHourUnix + h * 3600;

    let before: any = null;
    let after: any = null;
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
      const nearest = list.find((e: any) => e.dt >= targetUnix) || list[list.length - 1];
      before = nearest;
      after = nearest;
    }

    const span = after.dt - before.dt;
    const t = span > 0 ? (targetUnix - before.dt) / span : 0;

    result.push({
      t: h === 0 ? "Now" : formatFullHourLabel(targetUnix, tzOffset),
      temp: Math.round(lerp(before.main.temp, after.main.temp, t)),
      precip: Math.round(
        lerp((before.pop || 0) * 100, (after.pop || 0) * 100, t)
      ),
      wind: Math.round(lerp(before.wind.speed, after.wind.speed, t)),
      gust: Math.round(
        lerp(
          before.wind.gust || before.wind.speed,
          after.wind.gust || after.wind.speed,
          t
        )
      ),
    });
  }

  return result;
}

// ── Transform ────────────────────────────────────────────────

function buildWeatherObject(current: any, forecast: any): WeatherData {
  const now = Date.now() / 1000;
  const list = forecast.list || [];

  const tempF = Math.round(current.main.temp);
  const feelsLikeF = Math.round(current.main.feels_like);
  const windMph = Math.round(current.wind.speed);
  const windDeg = current.wind.deg || 0;
  const pressureHpa = current.main.pressure;
  const pressureInHg = Math.round(hpaToInHg(pressureHpa) * 100) / 100;
  const cloudPct = current.clouds.all;
  const locationName = current.name || "Your Area";
  const tzOffset = current.timezone || 0;

  const precipChance =
    list.length > 0 ? Math.round((list[0].pop || 0) * 100) : 0;

  const sunrise = current.sys.sunrise
    ? unixToTimeString(current.sys.sunrise, tzOffset)
    : "–";
  const sunset = current.sys.sunset
    ? unixToTimeString(current.sys.sunset, tzOffset)
    : "–";

  // Delta: temp change ~24h ahead
  let deltaTemp24hF = 0;
  const entry24h =
    list.find((e: any) => e.dt >= now + 22 * 3600) || list[list.length - 1];
  if (entry24h) {
    deltaTemp24hF = Math.round(entry24h.main.temp - tempF);
  }

  // Delta: pressure change ~3h ahead
  let deltaPressure3h = 0;
  const entry3h = list.find((e: any) => e.dt >= now + 2.5 * 3600);
  if (entry3h) {
    const futureInHg = hpaToInHg(entry3h.main.pressure);
    deltaPressure3h = Math.round((pressureInHg - futureInHg) * 100) / 100;
  }

  const hourly = buildHourlyFromForecast(list, now, tzOffset);

  const trends48h: TrendEntry[] = list.slice(0, 16).map((entry: any) => ({
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

// ── Public API ───────────────────────────────────────────────

/**
 * Fetch weather for given coordinates.
 * Returns null on any error (caller should handle fallback).
 */
export async function fetchWeather(
  lat: number,
  lon: number
): Promise<WeatherData | null> {
  if (!OWM_API_KEY || OWM_API_KEY === "YOUR_API_KEY_HERE") {
    console.warn("DuckSmart: No OWM API key. Using mock data.");
    return null;
  }

  try {
    const [current, forecast] = await Promise.all([
      fetchCurrentWeather(lat, lon),
      fetchForecast(lat, lon),
    ]);
    return buildWeatherObject(current, forecast);
  } catch (err: any) {
    console.error("DuckSmart weather fetch error:", err.message);
    return null;
  }
}

/**
 * Geocode a US zip code to coordinates using OWM Geocoding API.
 */
export async function geocodeZip(
  zip: string
): Promise<{ lat: number; lon: number; name: string } | null> {
  if (!OWM_API_KEY) return null;
  const url = `https://api.openweathermap.org/geo/1.0/zip?zip=${zip},US&appid=${OWM_API_KEY}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    return { lat: data.lat, lon: data.lon, name: data.name };
  } catch {
    return null;
  }
}

/**
 * Default mock weather — used as fallback when API is unavailable.
 */
export const MOCK_WEATHER: WeatherData = {
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
    { t: "6a", temp: 21, pressureInHg: 29.9, wind: 8, windDeg: 285 },
    { t: "9a", temp: 25, pressureInHg: 29.88, wind: 10, windDeg: 280 },
    { t: "12p", temp: 29, pressureInHg: 29.92, wind: 12, windDeg: 275 },
    { t: "3p", temp: 31, pressureInHg: 29.95, wind: 14, windDeg: 270 },
    { t: "6p", temp: 28, pressureInHg: 29.98, wind: 12, windDeg: 265 },
    { t: "9p", temp: 25, pressureInHg: 30.0, wind: 10, windDeg: 260 },
    { t: "12a", temp: 22, pressureInHg: 30.02, wind: 8, windDeg: 255 },
    { t: "3a", temp: 20, pressureInHg: 30.04, wind: 7, windDeg: 250 },
    { t: "6a", temp: 19, pressureInHg: 30.06, wind: 6, windDeg: 250 },
    { t: "9a", temp: 23, pressureInHg: 30.08, wind: 9, windDeg: 255 },
  ],
};
