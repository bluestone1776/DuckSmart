// DuckSmart hunt scoring — Push/Go dual-engine formula
//
// Push Score  = pressure-to-move (cold fronts, snow, freezing temps push birds south)
// Go Score    = flight-window quality (tailwinds, clear skies, low precip let birds fly)
// Final Score = 100 * (Push^0.9) * (Go^1.1)   (multiplicative — both engines must fire)
//
// MVP weights (until we have snow persistence data from API):
//   Push  = 60% cold-signal + 40% pressure-signal
//   Go    = 55% tailwind + 30% no-precip + 15% cloud-clearance

import { clamp } from "./helpers";

// ── helpers ──────────────────────────────────────────────────

/** 0-1 cold signal: bigger temp drop = stronger push */
function coldSignal(deltaTemp24hF) {
  // deltaTemp24hF is negative when it got colder
  // −15°F or more → 1.0,  0°F → 0.3 (neutral), +10°F → 0.0
  if (deltaTemp24hF <= -15) return 1.0;
  if (deltaTemp24hF >= 10) return 0.0;
  return clamp((10 - deltaTemp24hF) / 25, 0, 1);
}

/** 0-1 pressure signal: rapid change (either direction) after a front */
function pressureSignal(deltaPressure3h) {
  // Big swing = front passing = good push.  ±0.10+ inHg → 1.0,  0 → 0.2
  const magnitude = Math.abs(deltaPressure3h);
  if (magnitude >= 0.10) return 1.0;
  return clamp(0.2 + (magnitude / 0.10) * 0.8, 0, 1);
}

/** 0-1 tailwind quality: moderate wind is best */
function tailwindSignal(windMph) {
  // 8-16 mph → ideal.  0 → bad.  >25 → bad
  if (windMph >= 8 && windMph <= 16) return 1.0;
  if (windMph < 3) return 0.15;
  if (windMph < 8) return 0.4 + (windMph - 3) * 0.12; // 3→0.4 .. 8→1.0
  if (windMph <= 22) return 1.0 - ((windMph - 16) / 6) * 0.35; // 16→1.0 .. 22→0.65
  return clamp(0.65 - (windMph - 22) * 0.06, 0.1, 0.65); // >22 degrades
}

/** 0-1 no-precip signal: less precip = better flight window */
function noPrecipSignal(precipChance) {
  // 0% → 1.0,  50% → 0.5,  100% → 0.1
  return clamp(1.0 - precipChance * 0.009, 0.1, 1.0);
}

/** 0-1 cloud clearance: mid cloud cover is ideal, extremes less so */
function cloudSignal(cloudPct) {
  // 30-70% → best (cover + light).  0% → okay.  100% → okay-ish
  if (cloudPct >= 30 && cloudPct <= 70) return 1.0;
  if (cloudPct < 30) return 0.6 + (cloudPct / 30) * 0.4;
  return 1.0 - ((cloudPct - 70) / 30) * 0.3; // 70→1.0 .. 100→0.7
}

// ── main scoring ─────────────────────────────────────────────

function computePushGo(weather) {
  const cold = coldSignal(weather.deltaTemp24hF);
  const pressure = pressureSignal(weather.deltaPressure3h);
  const push = 0.60 * cold + 0.40 * pressure;

  const tailwind = tailwindSignal(weather.windMph);
  const noPrecip = noPrecipSignal(weather.precipChance);
  const cloud = cloudSignal(weather.cloudPct);
  const go = 0.55 * tailwind + 0.30 * noPrecip + 0.15 * cloud;

  // Multiplicative final score with asymmetric exponents
  const raw = Math.pow(push, 0.9) * Math.pow(go, 1.1);
  const score = clamp(Math.round(100 * raw), 0, 100);

  return { score, push, go, signals: { cold, pressure, tailwind, noPrecip, cloud } };
}

// ── exported API (backwards-compatible) ──────────────────────

export function scoreHunt(weather) {
  const { score } = computePushGo(weather);
  return { score };
}

export function scoreHuntToday(weather) {
  const { score, push, go, signals } = computePushGo(weather);
  const reasons = [];

  // Push engine reasons
  if (signals.cold >= 0.7) {
    reasons.push({ type: "up", text: "Strong cold front pushing birds south." });
  } else if (signals.cold <= 0.25) {
    reasons.push({ type: "down", text: "Warm-up may slow migration movement." });
  }

  if (signals.pressure >= 0.7) {
    reasons.push({ type: "up", text: "Pressure swing signals front passage — good push." });
  }

  // Go engine reasons
  if (signals.tailwind >= 0.8) {
    reasons.push({ type: "up", text: "Good wind speed for flight and decoy realism." });
  } else if (signals.tailwind <= 0.3) {
    reasons.push({ type: "down", text: "Calm or extreme wind hurts the flight window." });
  }

  if (signals.noPrecip >= 0.7) {
    reasons.push({ type: "up", text: "Low precipitation keeps the flight window open." });
  } else if (signals.noPrecip <= 0.35) {
    reasons.push({ type: "down", text: "Heavy precip closes the flight window." });
  }

  if (signals.cloud >= 0.85) {
    reasons.push({ type: "up", text: "Cloud cover extends quality light and reduces glare." });
  } else if (signals.cloud <= 0.5) {
    reasons.push({ type: "down", text: "Extreme cloud conditions reduce flight quality." });
  }

  // Keep top 3 reasons, prefer positives first
  const why = [
    ...reasons.filter((r) => r.type === "up").slice(0, 2),
    ...reasons.filter((r) => r.type === "down").slice(0, 2),
  ].slice(0, 3);

  return { score, push: Math.round(push * 100), go: Math.round(go * 100), why };
}
