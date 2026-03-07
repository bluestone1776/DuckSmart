// ---------------------------------------------------------------------------
//  DuckSmart shared constants — ported from mobile theme.js
// ---------------------------------------------------------------------------

export const COLORS = {
  black: "#000000",
  bg: "#141414",
  bgDeep: "#0E0E0E",
  bgDeepest: "#0A0A0A",
  border: "#3A3A3A",
  borderSubtle: "#2C2C2C",
  white: "#FFFFFF",
  green: "#2ECC71",
  greenBg: "#0E1A12",
  greenBright: "#4CD97B",
  red: "#D94C4C",
  yellow: "#D9A84C",
  muted: "#BDBDBD",
  mutedDark: "#8E8E8E",
  mutedDarker: "#7A7A7A",
  mutedDarkest: "#6D6D6D",
  transparentBlack: "rgba(0,0,0,0.8)",
} as const;

export const ENVIRONMENTS = [
  "Marsh",
  "Timber",
  "Field",
  "Open Water",
  "River",
] as const;

export const PIN_TYPES = [
  { key: "Spot", label: "Spot", color: "#2ECC71" },
  { key: "Roost", label: "Roost", color: "#3498DB" },
  { key: "Feed", label: "Feed", color: "#F1C40F" },
  { key: "FlightLine", label: "Flight Line", color: "#E67E22" },
  { key: "Parking", label: "Parking", color: "#9B59B6" },
  { key: "Hazard", label: "Hazard", color: "#E74C3C" },
] as const;

export const SPREAD_NAMES: Record<string, string> = {
  j_hook: "J-Hook",
  u_shape: "U-Shape",
  pods_landing_zone: "Pods + Landing Zone",
  runway: "Runway",
  v_spread: "V-Spread",
  timber_pocket: "Timber Pocket",
  line_spread: "Line Spread",
  open_water_raft: "Open Water Raft",
  shoreline_pocket: "Shoreline Pocket",
  feeding_spread: "Feeding Spread",
  confidence_spread: "Confidence Spread",
} as const;
