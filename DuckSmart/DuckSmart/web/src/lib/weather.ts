// DuckSmart — Web Weather Service
//
// Weather now routes through Firebase Functions instead of exposing
// OpenWeatherMap keys through NEXT_PUBLIC_ env vars.

const GET_WEATHER_URL =
  process.env.NEXT_PUBLIC_GET_WEATHER_URL ||
  "https://us-central1-ducksmart-9c80e.cloudfunctions.net/getWeather";

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

function safeNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function safeArray<T>(value: unknown, fallback: T[]): T[] {
  return Array.isArray(value) ? value : fallback;
}

function normalizeWeatherData(value: any): WeatherData {
  return {
    locationName: value?.locationName || MOCK_WEATHER.locationName,
    tempF: safeNumber(value?.tempF, MOCK_WEATHER.tempF),
    feelsLikeF: safeNumber(value?.feelsLikeF, value?.tempF ?? MOCK_WEATHER.feelsLikeF),
    windMph: safeNumber(value?.windMph, MOCK_WEATHER.windMph),
    windDeg: safeNumber(value?.windDeg, MOCK_WEATHER.windDeg),
    pressureInHg: safeNumber(value?.pressureInHg, MOCK_WEATHER.pressureInHg),
    deltaTemp24hF: safeNumber(value?.deltaTemp24hF, MOCK_WEATHER.deltaTemp24hF),
    deltaPressure3h: safeNumber(value?.deltaPressure3h, MOCK_WEATHER.deltaPressure3h),
    precipChance: safeNumber(value?.precipChance, MOCK_WEATHER.precipChance),
    cloudPct: safeNumber(value?.cloudPct, MOCK_WEATHER.cloudPct),
    sunrise: value?.sunrise || MOCK_WEATHER.sunrise,
    sunset: value?.sunset || MOCK_WEATHER.sunset,
    hourly: safeArray<HourlyEntry>(value?.hourly, MOCK_WEATHER.hourly),
    trends48h: safeArray<TrendEntry>(value?.trends48h, MOCK_WEATHER.trends48h),
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
  try {
    const url =
      `${GET_WEATHER_URL}` +
      `?lat=${encodeURIComponent(lat)}` +
      `&lon=${encodeURIComponent(lon)}`;

    const res = await fetch(url);
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data?.error || `Weather function failed: ${res.status}`);
    }

    return normalizeWeatherData(data?.weather || data);
  } catch (err: any) {
    console.error("DuckSmart weather fetch error:", err.message);
    return null;
  }
}

/**
 * Geocode a US zip code to coordinates.
 *
 * This used to call OpenWeather directly with the exposed OWM key.
 * It now returns null until we add a Firebase geocodeZip function.
 */
export async function geocodeZip(
  zip: string
): Promise<{ lat: number; lon: number; name: string } | null> {
  console.warn(
    `DuckSmart: geocodeZip(${zip}) needs a Firebase Function before it can be used safely.`
  );
  return null;
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