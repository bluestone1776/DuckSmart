//services/analytics.js
// DuckSmart — Analytics Service
//
// Logs user events to Firestore for analytics/insights AND Firebase Analytics.
// Fire-and-forget pattern — never blocks the UI or crashes the app.
// Events are stored in a top-level "analytics" collection for easy querying.

import { db } from "./firebase";
import { collection, addDoc } from "firebase/firestore";
import { Platform } from "react-native";
import Constants from "expo-constants";
import analytics from "@react-native-firebase/analytics";

// ---------------------------------------------------------------------------
// Device info (gathered once at startup)
// ---------------------------------------------------------------------------

let Device = null;
try {
  Device = require("expo-device");
} catch (_) {
  /* expo-device not available */
}

const deviceInfo = {
  platform: Platform.OS,
  osVersion: String(Platform.Version),
  appVersion: Constants.expoConfig?.version || "1.1.0",
  model: Device?.modelName || null,
  brand: Device?.brand || null,
  manufacturer: Device?.manufacturer || null,
  isDevice: Device?.isDevice ?? null,
};

// ---------------------------------------------------------------------------
// Session ID — unique per app launch
// ---------------------------------------------------------------------------

const sessionId = `s-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

// ---------------------------------------------------------------------------
// Firebase Analytics safe formatting
// ---------------------------------------------------------------------------

function cleanEventName(eventName) {
  const cleaned = String(eventName || "unknown_event")
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .slice(0, 40);

  return /^[a-zA-Z]/.test(cleaned) ? cleaned : `event_${cleaned}`;
}

function cleanParamName(key) {
  const cleaned = String(key || "param")
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .slice(0, 40);

  return /^[a-zA-Z]/.test(cleaned) ? cleaned : `param_${cleaned}`;
}

function cleanParamValue(value) {
  if (value === null || value === undefined) return null;

  if (typeof value === "string") {
    return value.slice(0, 100);
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "boolean") {
    return value;
  }

  try {
    return JSON.stringify(value).slice(0, 100);
  } catch (_) {
    return String(value).slice(0, 100);
  }
}

function buildFirebaseAnalyticsParams(userId, metadata = {}) {
  const params = {
    userId: userId || "guest",
    sessionId,
    platform: Platform.OS,
  };

  Object.entries(metadata || {}).forEach(([key, value]) => {
    const cleanKey = cleanParamName(key);
    const cleanValue = cleanParamValue(value);

    if (cleanValue !== null && cleanValue !== undefined) {
      params[cleanKey] = cleanValue;
    }
  });

  return Object.fromEntries(Object.entries(params).slice(0, 25));
}

// ---------------------------------------------------------------------------
// Log an analytics event
// ---------------------------------------------------------------------------

/**
 * Log an analytics event to Firestore and Firebase Analytics.
 * Safe to call from anywhere — silently no-ops on failure.
 *
 * @param {string} eventName  e.g. "hunt_logged", "login", "screen_view"
 * @param {string|null} userId  Firebase Auth UID (null if unauthenticated)
 * @param {object} metadata  Event-specific data (environment, spread, etc.)
 */
export async function logEvent(eventName, userId, metadata = {}) {
  try {
    await addDoc(collection(db, "analytics"), {
      eventName,
      userId: userId || null,
      sessionId,
      timestamp: Date.now(),
      device: deviceInfo,
      metadata,
    });
  } catch (err) {
    console.warn("DuckSmart Firestore analytics:", err.message);
  }

  try {
    if (userId) {
      await analytics().setUserId(userId);
    }

    await analytics().logEvent(
      cleanEventName(eventName),
      buildFirebaseAnalyticsParams(userId, metadata)
    );
  } catch (err) {
    console.warn("DuckSmart Firebase Analytics:", err.message);
  }
}

// ---------------------------------------------------------------------------
// Convenience wrappers for common events
// ---------------------------------------------------------------------------

export const logLogin = (userId, method) =>
  logEvent("login", userId, { method });

export const logSignup = (userId, method) =>
  logEvent("signup", userId, { method });

export const logHuntLogged = (userId, { environment, spread, huntScore, ducksHarvested, photoCount }) =>
  logEvent("hunt_logged", userId, { environment, spread, huntScore, ducksHarvested, photoCount });

export const logHuntDeleted = (userId) =>
  logEvent("hunt_deleted", userId);

export const logPinCreated = (userId, pinType) =>
  logEvent("pin_created", userId, { pinType });

export const logPinDeleted = (userId) =>
  logEvent("pin_deleted", userId);

export const logDuckIdentified = (userId) =>
  logEvent("duck_identified", userId);

export const logSpreadAnalyzed = (userId) =>
  logEvent("spread_analyzed", userId);

export const logScreenView = (userId, screenName) =>
  logEvent("screen_view", userId, { screenName });

export const logAppOpen = (userId) =>
  logEvent("app_open", userId);

export const logProUpgrade = (userId) =>
  logEvent("pro_upgrade", userId);

export const logFeedbackSubmitted = (userId, category) =>
  logEvent("feedback_submitted", userId, { category });