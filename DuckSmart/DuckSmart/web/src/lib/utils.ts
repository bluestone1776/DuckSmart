import { format } from "date-fns";
import { COLORS, PIN_TYPES } from "./constants";

// ---------------------------------------------------------------------------
//  General
// ---------------------------------------------------------------------------

/** Clamp a number between min and max (inclusive). */
export function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

// ---------------------------------------------------------------------------
//  Wind
// ---------------------------------------------------------------------------

const CARDINAL_DIRECTIONS = [
  "N", "NNE", "NE", "ENE",
  "E", "ESE", "SE", "SSE",
  "S", "SSW", "SW", "WSW",
  "W", "WNW", "NW", "NNW",
] as const;

/** Convert a wind bearing (0-360) to a cardinal direction string. */
export function formatWind(deg: number): string {
  const index = Math.round(((deg % 360) + 360) % 360 / 22.5) % 16;
  return CARDINAL_DIRECTIONS[index];
}

// ---------------------------------------------------------------------------
//  Date formatting
// ---------------------------------------------------------------------------

function toDate(value: number | string): Date {
  if (typeof value === "number") {
    // Firestore timestamps are in milliseconds
    return new Date(value);
  }
  return new Date(value);
}

/** Format a timestamp or ISO string as "Jan 15, 2025". */
export function formatDate(value: number | string): string {
  return format(toDate(value), "MMM d, yyyy");
}

/** Format a timestamp or ISO string as "Jan 15, 2025 6:30 AM". */
export function formatDateTime(value: number | string): string {
  return format(toDate(value), "MMM d, yyyy h:mm a");
}

// ---------------------------------------------------------------------------
//  Score & Pin colors
// ---------------------------------------------------------------------------

/** Return a theme color based on hunt score. */
export function getScoreColor(score: number): string {
  if (score >= 70) return COLORS.green;
  if (score >= 40) return COLORS.yellow;
  return COLORS.red;
}

/** Return the color for a given pin type key, defaulting to green. */
export function getPinColor(type: string): string {
  const pin = PIN_TYPES.find((p) => p.key === type);
  return pin?.color ?? COLORS.green;
}
