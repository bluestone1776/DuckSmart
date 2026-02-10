// DuckSmart hunt scoring utilities

import { clamp } from "./helpers";

export function scoreHunt(weather) {
  let score = 50;
  if (weather.windMph >= 6 && weather.windMph <= 18) score += 12;
  if (weather.windMph < 3) score -= 10;
  if (weather.windMph > 22) score -= 8;

  if (weather.deltaTemp24hF <= -8) score += 12;
  if (weather.deltaTemp24hF >= 8) score -= 6;

  if (weather.deltaPressure3h >= 0.05) score += 6;
  if (weather.deltaPressure3h <= -0.05) score += 4;

  if (weather.precipChance >= 20 && weather.precipChance <= 55) score += 6;
  if (weather.precipChance >= 75) score -= 6;

  if (weather.cloudPct >= 35 && weather.cloudPct <= 85) score += 5;
  if (weather.cloudPct < 15) score -= 3;

  return { score: clamp(score, 0, 100) };
}

export function scoreHuntToday(weather) {
  let score = 50;
  const reasonsUp = [];
  const reasonsDown = [];

  if (weather.windMph >= 6 && weather.windMph <= 18) {
    score += 12;
    reasonsUp.push("Good wind speed for movement + decoy realism.");
  } else if (weather.windMph < 3) {
    score -= 10;
    reasonsDown.push("Dead-calm wind can make birds cautious.");
  } else if (weather.windMph > 22) {
    score -= 8;
    reasonsDown.push("Strong wind can reduce comfort and shooting windows.");
  }

  if (weather.deltaTemp24hF <= -8) {
    score += 12;
    reasonsUp.push("Recent temperature drop can spark movement.");
  } else if (weather.deltaTemp24hF >= 8) {
    score -= 6;
    reasonsDown.push("Warm-up can slow daytime movement.");
  }

  if (weather.deltaPressure3h >= 0.05) {
    score += 6;
    reasonsUp.push("Rising pressure often follows a front (good windows).");
  } else if (weather.deltaPressure3h <= -0.05) {
    score += 4;
    reasonsUp.push("Falling pressure can precede a front (birds may feed).");
  }

  if (weather.precipChance >= 20 && weather.precipChance <= 55) {
    score += 6;
    reasonsUp.push("Light weather can improve concealment and movement.");
  } else if (weather.precipChance >= 75) {
    score -= 6;
    reasonsDown.push("High precipitation can reduce visibility and comfort.");
  }

  if (weather.cloudPct >= 35 && weather.cloudPct <= 85) {
    score += 5;
    reasonsUp.push("Cloud cover can extend quality light + reduce glare.");
  } else if (weather.cloudPct < 15) {
    score -= 3;
    reasonsDown.push("Bluebird skies can increase pressure and visibility.");
  }

  score = clamp(score, 0, 100);

  const why = [
    ...reasonsUp.slice(0, 2).map((t) => ({ type: "up", text: t })),
    ...reasonsDown.slice(0, 2).map((t) => ({ type: "down", text: t })),
  ].slice(0, 3);

  return { score, why };
}
