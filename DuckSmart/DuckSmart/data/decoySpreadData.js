// DuckSmart — Decoy Spread Data & Recommendation Engine
//
// All data sourced from the Duck_Decoy_Spreads.xlsx spreadsheet.
// The recommend() function scores each spread against user selections
// and returns a sorted list of matches.

// -----------------------------------------------------------------------
// Selection option values (used in the UI pickers)
// -----------------------------------------------------------------------

export const WATER_TYPES = [
  "Marsh",
  "Pond",
  "River edge",
  "Open water",
  "Shallow water / Flats",
  "Timber",
  "Field",
  "Shoreline",
];

export const WEATHER_OPTIONS = [
  "Calm",
  "Light wind",
  "Moderate wind",
  "Windy",
  "Cold & windy",
];

export const SEASON_OPTIONS = [
  "Early",
  "Mid",
  "Late",
];

export const PRESSURE_OPTIONS = [
  "Low",
  "Medium",
  "High",
];

export const SPECIES_OPTIONS = [
  "Mallard",
  "Gadwall",
  "Wood ducks",
  "Teal",
  "Divers",
  "Mixed puddle ducks",
  "Mixed species",
];

// -----------------------------------------------------------------------
// Spread definitions (from the spreadsheet)
// -----------------------------------------------------------------------

export const SPREADS = [
  {
    key: "j_hook",
    name: "J-Hook",
    type: "Landing Funnel",
    waterTypes: ["marsh", "pond", "river edge"],
    weather: ["calm", "moderate wind"],
    season: ["mid", "late"],
    species: ["mallard", "mixed puddle ducks"],
    pressure: "medium",
    motionDecoys: true,
    calling: "Medium",
    decoyCount: "18–36",
    hideType: "Blind / Natural",
    bestTime: "Morning",
    highPressureFriendly: false,
    windDependent: true,
    bigWater: false,
    lowVisibility: false,
    notes: "Versatile all-around spread. Set the hook into the wind; keep the kill hole just off the tip.",
    mistakes: "Pocket too tight; overcalling",
  },
  {
    key: "u_shape",
    name: "U-Shape",
    type: "Landing Zone",
    waterTypes: ["open water", "marsh"],
    weather: ["light wind", "moderate wind"],
    season: ["mid", "late"],
    species: ["mallard", "gadwall"],
    pressure: "medium",
    motionDecoys: true,
    calling: "Medium",
    decoyCount: "24–48",
    hideType: "Blind",
    bestTime: "Morning–Midday",
    highPressureFriendly: false,
    windDependent: true,
    bigWater: true,
    lowVisibility: false,
    notes: "Clear landing zone ducks trust. Open end downwind; keep a clean runway to the pocket.",
    mistakes: "Too symmetrical",
  },
  {
    key: "v_spread",
    name: "V-Spread",
    type: "Migration Corridor",
    waterTypes: ["open water", "field"],
    weather: ["windy"],
    season: ["early", "mid"],
    species: ["divers", "mixed species"],
    pressure: "low",
    motionDecoys: false,
    calling: "Aggressive",
    decoyCount: "36–72",
    hideType: "Layout / Blind",
    bestTime: "Morning",
    highPressureFriendly: false,
    windDependent: true,
    bigWater: true,
    lowVisibility: false,
    notes: "Long-range visibility for big flocks. Set the V pointing downwind.",
    mistakes: "Wrong wind angle",
  },
  {
    key: "line_spread",
    name: "Line Spread",
    type: "Travel Line",
    waterTypes: ["river edge", "shoreline"],
    weather: ["windy", "cold & windy"],
    season: ["late"],
    species: ["mixed puddle ducks"],
    pressure: "high",
    motionDecoys: false,
    calling: "Low",
    decoyCount: "6–18",
    hideType: "Natural cover",
    bestTime: "Late morning",
    highPressureFriendly: true,
    windDependent: true,
    bigWater: false,
    lowVisibility: true,
    notes: "Subtle pressured-duck killer. Runs parallel to shore; less is more.",
    mistakes: "Too uniform",
  },
  {
    key: "open_water_raft",
    name: "Open Water Raft",
    type: "Raft / Loafing",
    waterTypes: ["open water"],
    weather: ["cold & windy", "windy"],
    season: ["late"],
    species: ["divers"],
    pressure: "medium",
    motionDecoys: true,
    calling: "Low",
    decoyCount: "48–100+",
    hideType: "Layout / Boat",
    bestTime: "Midday",
    highPressureFriendly: false,
    windDependent: true,
    bigWater: true,
    lowVisibility: false,
    notes: "Best for winter divers on big water. Leave a landing gap in the raft.",
    mistakes: "No landing gap",
  },
  {
    key: "shoreline_pocket",
    name: "Shoreline Pocket",
    type: "Edge / Pocket",
    waterTypes: ["marsh", "timber", "shoreline"],
    weather: ["calm"],
    season: ["early", "mid"],
    species: ["wood ducks", "teal"],
    pressure: "low",
    motionDecoys: false,
    calling: "Low",
    decoyCount: "6–12",
    hideType: "Natural cover",
    bestTime: "Morning",
    highPressureFriendly: false,
    windDependent: false,
    bigWater: false,
    lowVisibility: true,
    notes: "Tight cover realism. Small pocket close to shore for woodies and teal.",
    mistakes: "Too far from cover",
  },
  {
    key: "feeding_spread",
    name: "Feeding Spread",
    type: "Relaxed / Active",
    waterTypes: ["shallow water / flats"],
    weather: ["calm"],
    season: ["early"],
    species: ["mixed puddle ducks"],
    pressure: "low",
    motionDecoys: true,
    calling: "Low",
    decoyCount: "12–24",
    hideType: "Blind",
    bestTime: "Morning",
    highPressureFriendly: false,
    windDependent: false,
    bigWater: false,
    lowVisibility: false,
    notes: "Early-season feeding look. Scatter decoys naturally; avoid neat rows.",
    mistakes: "Too neat",
  },
  {
    key: "confidence_spread",
    name: "Confidence Spread",
    type: "Realism Add-on",
    waterTypes: ["marsh", "pond", "river edge", "open water", "shallow water / flats", "timber", "field", "shoreline"],
    weather: ["calm", "light wind", "moderate wind", "windy", "cold & windy"],
    season: ["early", "mid", "late"],
    species: ["mallard", "gadwall", "wood ducks", "teal", "divers", "mixed puddle ducks", "mixed species"],
    pressure: "any",
    motionDecoys: true,
    calling: "Any",
    decoyCount: "+4–6",
    hideType: "Any",
    bestTime: "Any",
    highPressureFriendly: false,
    windDependent: false,
    bigWater: false,
    lowVisibility: false,
    notes: "Adds realism and trust. Mix heron, egret, or coot decoys into any spread.",
    mistakes: "Overusing",
    isAddon: true,
  },
];

// -----------------------------------------------------------------------
// Recommendation engine
// -----------------------------------------------------------------------

/**
 * Scores all spreads against user selections, returns sorted best matches.
 *
 * @param {Object} selections
 * @param {string}   selections.waterType    – one of WATER_TYPES
 * @param {string}   selections.weather      – one of WEATHER_OPTIONS
 * @param {string}   selections.season       – one of SEASON_OPTIONS
 * @param {string}   selections.pressure     – one of PRESSURE_OPTIONS
 * @param {string}   [selections.species]    – one of SPECIES_OPTIONS (optional)
 *
 * @returns {{ primary: Object, addon: Object|null, all: Array }}
 */
export function recommendSpread(selections) {
  const { waterType, weather, season, pressure, species } = selections;

  const wt = waterType?.toLowerCase() || "";
  const wx = weather?.toLowerCase() || "";
  const sn = season?.toLowerCase() || "";
  const pr = pressure?.toLowerCase() || "";
  const sp = species?.toLowerCase() || "";

  const scored = SPREADS.map((spread) => {
    let score = 0;

    // Water type match (most important)
    if (spread.waterTypes.some((w) => wt.includes(w) || w.includes(wt))) {
      score += 30;
    }

    // Weather match
    if (spread.weather.some((w) => wx.includes(w) || w.includes(wx))) {
      score += 25;
    }

    // Season match
    if (spread.season.some((s) => sn === s)) {
      score += 20;
    }

    // Pressure match
    if (spread.pressure === "any" || spread.pressure === pr) {
      score += 15;
    }

    // Species match (bonus)
    if (sp && spread.species.some((s) => sp.includes(s) || s.includes(sp))) {
      score += 10;
    }

    return { ...spread, score };
  });

  // Separate add-on from main spreads
  const mainSpreads = scored.filter((s) => !s.isAddon).sort((a, b) => b.score - a.score);
  const addon = scored.find((s) => s.isAddon) || null;

  return {
    primary: mainSpreads[0] || null,
    addon,
    all: mainSpreads,
  };
}
