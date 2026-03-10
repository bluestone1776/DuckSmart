// DuckSmart — eBird API v2 migration intelligence
//
// Pulls live waterfowl sighting data from Cornell Lab's eBird to
// detect migration surges.  Compares this-week vs last-week counts
// within 50 km of the user's location.
//
// Free API — requires a key from https://ebird.org/api/keygen
// Gracefully returns null when no key is configured.

import { EBIRD_API_KEY } from "../config";

const BASE = "https://api.ebird.org/v2";

// Huntable waterfowl species codes (Anatidae + key geese)
const WATERFOWL_CODES = new Set([
  // Dabbling ducks
  "mallar3", "norpin", "gnwtea", "buwtea", "cintea",
  "amewig", "norsho", "gadwal", "wooduc",
  // Diving ducks
  "canvas", "redhea", "rinduc", "lessca", "gresca",
  "buffle", "comgol", "hoomer", "commel", "rebmer", "rudtur",
  // Geese (commonly hunted alongside ducks)
  "cangoo", "snogoo", "gwfgoo",
]);

// ── raw API call ──────────────────────────────────────────────

async function fetchRecentObs(lat, lon, back) {
  const url = `${BASE}/data/obs/geo/recent?lat=${lat}&lng=${lon}&dist=50&back=${back}`;
  const res = await fetch(url, {
    headers: { "X-eBirdApiToken": EBIRD_API_KEY },
  });
  if (!res.ok) throw new Error(`eBird ${res.status}`);
  return res.json();
}

// ── public API ────────────────────────────────────────────────

/**
 * Fetch migration intelligence for the user's area.
 *
 * Returns null if no eBird key is configured or the API fails.
 * Otherwise returns:
 *   { thisWeekCount, lastWeekCount, changePercent,
 *     topSpecies: [{ name, count }],
 *     signal, trending, summary }
 */
export async function fetchMigrationData(lat, lon) {
  if (!EBIRD_API_KEY) return null;

  try {
    // Two parallel fetches: 7 days (this week) and 14 days (this + last)
    const [thisWeekAll, twoWeeksAll] = await Promise.all([
      fetchRecentObs(lat, lon, 7),
      fetchRecentObs(lat, lon, 14),
    ]);

    // Filter for waterfowl only
    const filterDucks = (obs) => obs.filter((o) => WATERFOWL_CODES.has(o.speciesCode));

    const thisWeekDucks = filterDucks(thisWeekAll);
    const twoWeekDucks = filterDucks(twoWeeksAll);

    // Sum howMany (default 1 when observer didn't count)
    const sum = (arr) => arr.reduce((s, o) => s + (o.howMany || 1), 0);
    const thisWeekCount = sum(thisWeekDucks);
    const twoWeekCount = sum(twoWeekDucks);
    const lastWeekCount = Math.max(0, twoWeekCount - thisWeekCount);

    // Week-over-week change
    const changePercent =
      lastWeekCount > 0
        ? Math.round(((thisWeekCount - lastWeekCount) / lastWeekCount) * 100)
        : thisWeekCount > 0
        ? 100
        : 0;

    // Top species by count this week
    const speciesCounts = {};
    thisWeekDucks.forEach((o) => {
      speciesCounts[o.comName] = (speciesCounts[o.comName] || 0) + (o.howMany || 1);
    });

    const topSpecies = Object.entries(speciesCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, count]) => ({ name, count }));

    // Migration signal for scoring engine
    // 1.0 = baseline (no change), >1.0 = boost, <1.0 = penalty
    const signal = Math.max(0.5, Math.min(1.5, 1.0 + changePercent / 400));

    const trending = changePercent > 20 ? "up" : changePercent < -20 ? "down" : "stable";

    // Human-readable summary
    let summary;
    if (topSpecies.length > 0 && changePercent > 20) {
      summary = `${topSpecies[0].name}s up ${changePercent}% in your area this week`;
    } else if (changePercent < -20) {
      summary = "Waterfowl activity declining in your area";
    } else if (thisWeekCount > 0) {
      summary = `${thisWeekCount} waterfowl sighted nearby this week`;
    } else {
      summary = "Low waterfowl activity reported nearby";
    }

    return {
      thisWeekCount,
      lastWeekCount,
      changePercent,
      topSpecies,
      signal,
      trending,
      summary,
    };
  } catch (err) {
    console.warn("DuckSmart eBird fetch error:", err.message);
    return null;
  }
}
