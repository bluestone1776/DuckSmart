// ---------------------------------------------------------------------------
//  DuckSmart decoy spread data & recommendation engine
//  Ported from mobile utils/spreads.js to typed web module
// ---------------------------------------------------------------------------

// ---- Interfaces -----------------------------------------------------------

export interface Spread {
  key: string;
  name: string;
  type: string;
  waterTypes: string[];
  weather: string[];
  season: string[];
  species: string[];
  pressure: string;
  motionDecoys: boolean;
  calling: string;
  decoyCount: string;
  hideType: string;
  bestTime: string;
  highPressureFriendly: boolean;
  windDependent: boolean;
  bigWater: boolean;
  lowVisibility: boolean;
  notes: string;
  mistakes: string;
  isAddon?: boolean;
}

export interface ScoredSpread extends Spread {
  score: number;
}

// ---- Option constants -----------------------------------------------------

export const WATER_TYPES = [
  "Marsh",
  "Pond",
  "River edge",
  "Open water",
  "Shallow water / Flats",
  "Timber",
  "Field",
  "Shoreline",
] as const;

export const WEATHER_OPTIONS = [
  "Calm",
  "Light wind",
  "Moderate wind",
  "Windy",
  "Cold & windy",
] as const;

export const SEASON_OPTIONS = ["Early", "Mid", "Late"] as const;

export const PRESSURE_OPTIONS = ["Low", "Medium", "High"] as const;

export const SPECIES_OPTIONS = [
  "Mallard",
  "Gadwall",
  "Wood ducks",
  "Teal",
  "Divers",
  "Mixed puddle ducks",
  "Mixed species",
] as const;

// ---- Spread data ----------------------------------------------------------

export const SPREADS: Spread[] = [
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
    decoyCount: "18\u201336",
    hideType: "Blind / Natural",
    bestTime: "Morning",
    highPressureFriendly: false,
    windDependent: true,
    bigWater: false,
    lowVisibility: false,
    notes:
      "Versatile all-around spread. Set the hook into the wind; keep the kill hole just off the tip.",
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
    decoyCount: "24\u201348",
    hideType: "Blind",
    bestTime: "Morning\u2013Midday",
    highPressureFriendly: false,
    windDependent: true,
    bigWater: true,
    lowVisibility: false,
    notes:
      "Clear landing zone ducks trust. Open end downwind; keep a clean runway to the pocket.",
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
    decoyCount: "36\u201372",
    hideType: "Layout / Blind",
    bestTime: "Morning",
    highPressureFriendly: false,
    windDependent: true,
    bigWater: true,
    lowVisibility: false,
    notes:
      "Long-range visibility for big flocks. Set the V pointing downwind.",
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
    decoyCount: "6\u201318",
    hideType: "Natural cover",
    bestTime: "Late morning",
    highPressureFriendly: true,
    windDependent: true,
    bigWater: false,
    lowVisibility: true,
    notes:
      "Subtle pressured-duck killer. Runs parallel to shore; less is more.",
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
    decoyCount: "48\u2013100+",
    hideType: "Layout / Boat",
    bestTime: "Midday",
    highPressureFriendly: false,
    windDependent: true,
    bigWater: true,
    lowVisibility: false,
    notes:
      "Best for winter divers on big water. Leave a landing gap in the raft.",
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
    decoyCount: "6\u201312",
    hideType: "Natural cover",
    bestTime: "Morning",
    highPressureFriendly: false,
    windDependent: false,
    bigWater: false,
    lowVisibility: true,
    notes:
      "Tight cover realism. Small pocket close to shore for woodies and teal.",
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
    decoyCount: "12\u201324",
    hideType: "Blind",
    bestTime: "Morning",
    highPressureFriendly: false,
    windDependent: false,
    bigWater: false,
    lowVisibility: false,
    notes:
      "Early-season feeding look. Scatter decoys naturally; avoid neat rows.",
    mistakes: "Too neat",
  },
  {
    key: "confidence_spread",
    name: "Confidence Spread",
    type: "Realism Add-on",
    waterTypes: [
      "marsh",
      "pond",
      "river edge",
      "open water",
      "shallow water / flats",
      "timber",
      "field",
      "shoreline",
    ],
    weather: ["calm", "light wind", "moderate wind", "windy", "cold & windy"],
    season: ["early", "mid", "late"],
    species: [
      "mallard",
      "gadwall",
      "wood ducks",
      "teal",
      "divers",
      "mixed puddle ducks",
      "mixed species",
    ],
    pressure: "any",
    motionDecoys: true,
    calling: "Any",
    decoyCount: "+4\u20136",
    hideType: "Any",
    bestTime: "Any",
    highPressureFriendly: false,
    windDependent: false,
    bigWater: false,
    lowVisibility: false,
    notes:
      "Adds realism and trust. Mix heron, egret, or coot decoys into any spread.",
    mistakes: "Overusing",
    isAddon: true,
  },
];

// ---- Recommendation engine ------------------------------------------------

export interface SpreadSelections {
  waterType?: string;
  weather?: string;
  season?: string;
  pressure?: string;
  species?: string;
}

/**
 * Score every spread against the user's selections and return the best
 * primary spread, the best add-on (confidence) spread, and the full
 * sorted list of scored spreads.
 */
export function recommendSpread(selections: SpreadSelections): {
  primary: ScoredSpread | null;
  addon: ScoredSpread | null;
  all: ScoredSpread[];
} {
  const normalize = (v: string | undefined): string =>
    v ? v.toLowerCase().trim() : "";

  const waterType = normalize(selections.waterType);
  const weather = normalize(selections.weather);
  const season = normalize(selections.season);
  const pressure = normalize(selections.pressure);
  const species = normalize(selections.species);

  const scored: ScoredSpread[] = SPREADS.map((spread) => {
    let score = 0;

    // Water type match (+30)
    if (waterType && spread.waterTypes.some((w) => w.toLowerCase() === waterType)) {
      score += 30;
    }

    // Weather match (+25)
    if (weather && spread.weather.some((w) => w.toLowerCase() === weather)) {
      score += 25;
    }

    // Season match (+20)
    if (season && spread.season.some((s) => s.toLowerCase() === season)) {
      score += 20;
    }

    // Pressure match (+15) — "any" always matches
    if (pressure) {
      if (
        spread.pressure.toLowerCase() === "any" ||
        spread.pressure.toLowerCase() === pressure
      ) {
        score += 15;
      }
    }

    // Species match (+10)
    if (species && spread.species.some((s) => s.toLowerCase() === species)) {
      score += 10;
    }

    return { ...spread, score };
  });

  // Sort descending by score
  scored.sort((a, b) => b.score - a.score);

  const primary =
    scored.find((s) => !s.isAddon && s.score > 0) ?? null;

  const addon =
    scored.find((s) => s.isAddon === true && s.score > 0) ?? null;

  return { primary, addon, all: scored };
}
