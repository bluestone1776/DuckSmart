// DuckSmart — Solunar & Moon Phase (pure math, no API)
//
// Moon phase calculation based on the synodic period relative to
// a known new moon reference point.  Solunar theory: animal feeding
// activity peaks around new and full moons, and is lowest at quarter
// moons.  Serious hunters swear by it.
//
// All functions are pure — no network calls, no dependencies.

const KNOWN_NEW_MOON_UNIX = Date.UTC(2000, 0, 6, 18, 14, 0) / 1000; // Jan 6 2000 18:14 UTC
const SYNODIC_PERIOD = 29.53059; // days
const SECS_PER_DAY = 86400;

/**
 * Get moon phase data for a given date.
 *
 * @param {Date} [date] — defaults to now
 * @returns {{ phaseFraction: number, illumination: number, name: string, emoji: string }}
 */
export function getMoonPhase(date = new Date()) {
  const unixSec = date.getTime() / 1000;
  const daysSinceNew = (unixSec - KNOWN_NEW_MOON_UNIX) / SECS_PER_DAY;
  const phase = ((daysSinceNew % SYNODIC_PERIOD) + SYNODIC_PERIOD) % SYNODIC_PERIOD;
  const phaseFraction = phase / SYNODIC_PERIOD; // 0 = new, 0.5 = full

  // Illumination: 0 at new moon, 1 at full moon
  const illumination = (1 - Math.cos(2 * Math.PI * phaseFraction)) / 2;

  // Phase name (8 segments)
  let name;
  if (phaseFraction < 0.0625) name = "New Moon";
  else if (phaseFraction < 0.1875) name = "Waxing Crescent";
  else if (phaseFraction < 0.3125) name = "First Quarter";
  else if (phaseFraction < 0.4375) name = "Waxing Gibbous";
  else if (phaseFraction < 0.5625) name = "Full Moon";
  else if (phaseFraction < 0.6875) name = "Waning Gibbous";
  else if (phaseFraction < 0.8125) name = "Last Quarter";
  else if (phaseFraction < 0.9375) name = "Waning Crescent";
  else name = "New Moon";

  const emojis = ["\u{1F311}", "\u{1F312}", "\u{1F313}", "\u{1F314}", "\u{1F315}", "\u{1F316}", "\u{1F317}", "\u{1F318}"];
  const emoji = emojis[Math.floor(phaseFraction * 8) % 8];

  return { phaseFraction, illumination, name, emoji };
}

/**
 * Solunar activity signal (0-1) for the scoring engine.
 *
 * New moon and full moon = peak feeding activity = 1.0
 * Quarter moons = lowest activity = 0.4
 * Follows a smooth cosine curve between extremes.
 *
 * @param {Date} [date] — defaults to now
 * @returns {number} 0.4 – 1.0
 */
export function solunarSignal(date = new Date()) {
  const { illumination } = getMoonPhase(date);
  // Distance from 50% illumination (quarter moons)
  const extremity = Math.abs(2 * illumination - 1);
  return 0.4 + 0.6 * extremity;
}
