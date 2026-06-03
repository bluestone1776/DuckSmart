// DuckSmart runtime configuration
// Sensitive API keys must NOT live in Expo config or the app bundle.
// OpenWeather, Regrid, and OpenAI now route through Firebase Functions.

import Constants from "expo-constants";

const extra = Constants.expoConfig?.extra || Constants.manifest?.extra || {};

const DEFAULT_FUNCTIONS_BASE_URL =
  "https://us-central1-ducksmart-9c80e.cloudfunctions.net";

export const FUNCTIONS_BASE_URL =
  extra.functionsBaseUrl || DEFAULT_FUNCTIONS_BASE_URL;

function cleanBaseUrl(url) {
  return `${url || DEFAULT_FUNCTIONS_BASE_URL}`.replace(/\/+$/, "");
}

export function getFunctionUrl(functionName) {
  return `${cleanBaseUrl(FUNCTIONS_BASE_URL)}/${functionName}`;
}

// Firebase Functions — secure backend proxies
export const GET_WEATHER_URL = getFunctionUrl("getWeather");

export const GET_REGRID_TILE_URL = getFunctionUrl("getRegridTile");
export const LOOKUP_REGRID_PARCEL_URL = getFunctionUrl("lookupRegridParcel");
export const SEARCH_REGRID_ADDRESS_URL = getFunctionUrl("searchRegridAddress");
export const SEARCH_REGRID_OWNER_URL = getFunctionUrl("searchRegridOwner");

export const CALL_OPENAI_URL = getFunctionUrl("callOpenAI");

// Deprecated exports kept temporarily so old imports do not crash while we fix files one by one.
// These must stay empty. Do not put real keys here.
export const OWM_API_KEY = "";
export const REGRID_TOKEN = "";
export const OPENAI_API_KEY = "";

// eBird API v2 — still app-side for now unless we move it later.
// Free key from https://ebird.org/api/keygen
export const EBIRD_API_KEY = extra.ebirdApiKey || "";