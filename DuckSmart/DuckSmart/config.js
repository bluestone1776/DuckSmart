// DuckSmart runtime configuration
// API keys are read from app.json > expo.extra at runtime

import Constants from "expo-constants";

export const OWM_API_KEY =
  Constants.expoConfig?.extra?.openWeatherMapApiKey || "";
