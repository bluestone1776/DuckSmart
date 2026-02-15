// DuckSmart — AsyncStorage persistence layer
//
// Saves and loads hunt logs, map pins, and cached weather
// so data survives app restarts.

import AsyncStorage from "@react-native-async-storage/async-storage";

const KEYS = {
  LOGS: "@ducksmart_logs",
  PINS: "@ducksmart_pins",
  WEATHER_CACHE: "@ducksmart_weather_cache",
};

// ── Logs ─────────────────────────────────────────────────────

export async function saveLogs(logs) {
  try {
    await AsyncStorage.setItem(KEYS.LOGS, JSON.stringify(logs));
  } catch (err) {
    console.error("DuckSmart: failed to save logs", err.message);
  }
}

export async function loadLogs() {
  try {
    const json = await AsyncStorage.getItem(KEYS.LOGS);
    return json ? JSON.parse(json) : [];
  } catch (err) {
    console.error("DuckSmart: failed to load logs", err.message);
    return [];
  }
}

// ── Pins ─────────────────────────────────────────────────────

export async function savePins(pins) {
  try {
    await AsyncStorage.setItem(KEYS.PINS, JSON.stringify(pins));
  } catch (err) {
    console.error("DuckSmart: failed to save pins", err.message);
  }
}

export async function loadPins() {
  try {
    const json = await AsyncStorage.getItem(KEYS.PINS);
    return json ? JSON.parse(json) : null; // null = use default seed
  } catch (err) {
    console.error("DuckSmart: failed to load pins", err.message);
    return null;
  }
}

// ── Weather cache (for offline fallback) ─────────────────────

export async function cacheWeather(weather) {
  try {
    const payload = { weather, cachedAt: Date.now() };
    await AsyncStorage.setItem(KEYS.WEATHER_CACHE, JSON.stringify(payload));
  } catch (err) {
    console.error("DuckSmart: failed to cache weather", err.message);
  }
}

export async function loadCachedWeather() {
  try {
    const json = await AsyncStorage.getItem(KEYS.WEATHER_CACHE);
    if (!json) return null;
    const { weather, cachedAt } = JSON.parse(json);
    // Cache valid for 2 hours
    const TWO_HOURS = 2 * 60 * 60 * 1000;
    if (Date.now() - cachedAt > TWO_HOURS) return null;
    return weather;
  } catch (err) {
    console.error("DuckSmart: failed to load cached weather", err.message);
    return null;
  }
}
