// DuckSmart — Weather Context
//
// Provides live weather data to all screens via React Context.
// Handles GPS, API fetch, auto-refresh (15 min), offline caching,
// and graceful fallback to mock data.

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import * as Location from "expo-location";
import { fetchWeather, MOCK_WEATHER } from "../services/weather";
import { cacheWeather, loadCachedWeather } from "../services/storage";

const WeatherContext = createContext(null);

const REFRESH_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

export function WeatherProvider({ children }) {
  const [weather, setWeather] = useState(MOCK_WEATHER);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const coordsRef = useRef(null);
  const intervalRef = useRef(null);

  // Core fetch logic — reusable for initial load + refresh
  const loadWeather = useCallback(async (coords) => {
    if (!coords) return;
    setLoading(true);
    setError(null);

    try {
      const result = await fetchWeather(coords.latitude, coords.longitude);
      if (result) {
        setWeather(result);
        // Cache for offline use
        cacheWeather(result);
      } else {
        // API failed — try loading from cache
        const cached = await loadCachedWeather();
        if (cached) {
          setWeather(cached);
          setError("Using cached weather data (offline).");
        } else {
          setError("Could not fetch live weather. Using default data.");
        }
      }
    } catch (err) {
      // Network error — try cache
      const cached = await loadCachedWeather();
      if (cached) {
        setWeather(cached);
        setError("Using cached weather data (offline).");
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Manual refresh (for pull-to-refresh)
  const refresh = useCallback(async () => {
    await loadWeather(coordsRef.current);
  }, [loadWeather]);

  // Initial load: try cache first for fast startup, then GPS → live fetch
  useEffect(() => {
    let mounted = true;

    (async () => {
      // Try loading cached weather immediately for fast first paint
      const cached = await loadCachedWeather();
      if (cached && mounted) {
        setWeather(cached);
        setLoading(false);
      }

      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          if (mounted) {
            setError("Location permission denied. Using cached/default weather data.");
            setLoading(false);
          }
          return;
        }

        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const coords = {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        };
        coordsRef.current = coords;

        if (mounted) {
          await loadWeather(coords);
        }
      } catch (err) {
        if (mounted) {
          setError("GPS error. Using cached/default weather data.");
          setLoading(false);
        }
      }
    })();

    // Auto-refresh every 15 minutes
    intervalRef.current = setInterval(() => {
      if (coordsRef.current) {
        loadWeather(coordsRef.current);
      }
    }, REFRESH_INTERVAL_MS);

    return () => {
      mounted = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [loadWeather]);

  return (
    <WeatherContext.Provider value={{ weather, loading, error, refresh }}>
      {children}
    </WeatherContext.Provider>
  );
}

/**
 * Hook to access weather data from any screen.
 * Returns: { weather, loading, error, refresh }
 */
export function useWeather() {
  const ctx = useContext(WeatherContext);
  if (!ctx) {
    throw new Error("useWeather must be used inside <WeatherProvider>");
  }
  return ctx;
}
