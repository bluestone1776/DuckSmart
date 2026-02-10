// DuckSmart shared helper functions

export const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

export function formatWind(deg) {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const idx = Math.round(deg / 45) % 8;
  return dirs[idx];
}
