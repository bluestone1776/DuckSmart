// DuckSmart runtime configuration
// API keys are read from app.json > expo.extra at runtime

import Constants from "expo-constants";

export const OWM_API_KEY =
  Constants.expoConfig?.extra?.openWeatherMapApiKey || "";

// Regrid Parcel API — property line tile overlay
// Sign up at https://regrid.com → API section → copy your token
export const REGRID_TOKEN =
  Constants.expoConfig?.extra?.regridToken || "";
