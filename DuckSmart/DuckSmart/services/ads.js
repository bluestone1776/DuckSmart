// DuckSmart — Ad Service
//
// Manages Google AdMob interstitial ads for the free tier.
// Interstitials show a full-screen ad that the user can dismiss.
// Currently triggered: after logging a hunt (LogScreen).
//
// Setup required:
//   1. Create AdMob account at https://admob.google.com
//   2. Create ad units (interstitial) for iOS and Android
//   3. Replace TEST ad unit IDs below with your real ones
//   4. Add plugin to app.json (see comments in app.json)
//   5. Install: npx expo install react-native-google-mobile-ads
//
// In Expo Go / dev builds where the native module isn't linked,
// all functions are safe no-ops.

import { Platform } from "react-native";
import Constants from "expo-constants";

const isExpoGo = Constants.appOwnership === "expo";

// ---------------------------------------------------------------------------
// Lazy-load the AdMob module — prevents crash in Expo Go
// ---------------------------------------------------------------------------
let AdMobInterstitial = null;
let AdEventType = null;
let TestIds = null;
let isAdMobAvailable = false;

if (!isExpoGo) {
  try {
    const adModule = require("react-native-google-mobile-ads");
    AdMobInterstitial = adModule.InterstitialAd;
    AdEventType = adModule.AdEventType;
    TestIds = adModule.TestIds;
    isAdMobAvailable = true;
  } catch (_) {
    /* react-native-google-mobile-ads not linked */
  }
}

// ---------------------------------------------------------------------------
// Ad Unit IDs
// Replace these with your real AdMob ad unit IDs for production.
// The TestIds are safe for development — they show test ads.
// ---------------------------------------------------------------------------
const AD_UNIT_IDS = {
  interstitial: {
    ios: TestIds?.INTERSTITIAL || "ca-app-pub-xxxxxxxxxxxxx/yyyyyyyyyy",
    android: TestIds?.INTERSTITIAL || "ca-app-pub-xxxxxxxxxxxxx/yyyyyyyyyy",
  },
};

// ---------------------------------------------------------------------------
// Interstitial ad instance (singleton — preloaded for instant show)
// ---------------------------------------------------------------------------
let interstitialAd = null;
let isAdLoaded = false;
let isAdLoading = false;

/**
 * Preload an interstitial ad so it's ready to show immediately.
 * Call this early (e.g., when the app starts or a screen mounts).
 * Safe to call multiple times — will only load if not already loaded/loading.
 */
export function preloadInterstitialAd() {
  if (!isAdMobAvailable || !AdMobInterstitial) return;
  if (isAdLoaded || isAdLoading) return;

  isAdLoading = true;

  const adUnitId = Platform.OS === "ios"
    ? AD_UNIT_IDS.interstitial.ios
    : AD_UNIT_IDS.interstitial.android;

  interstitialAd = AdMobInterstitial.createForAdRequest(adUnitId, {
    requestNonPersonalizedAdsOnly: true,
  });

  interstitialAd.addAdEventListener(AdEventType.LOADED, () => {
    isAdLoaded = true;
    isAdLoading = false;
  });

  interstitialAd.addAdEventListener(AdEventType.CLOSED, () => {
    // Ad was dismissed — preload the next one
    isAdLoaded = false;
    isAdLoading = false;
    interstitialAd = null;
    // Slight delay before preloading next ad
    setTimeout(preloadInterstitialAd, 2000);
  });

  interstitialAd.addAdEventListener(AdEventType.ERROR, (error) => {
    console.warn("DuckSmart: Ad failed to load:", error.message);
    isAdLoaded = false;
    isAdLoading = false;
    interstitialAd = null;
  });

  interstitialAd.load();
}

/**
 * Show the preloaded interstitial ad.
 * Returns true if the ad was shown, false if it wasn't ready.
 * After showing, automatically preloads the next ad.
 */
export async function showInterstitialAd() {
  if (!isAdMobAvailable || !interstitialAd || !isAdLoaded) {
    // Ad not available — silently skip (don't block the user)
    return false;
  }

  try {
    await interstitialAd.show();
    return true;
  } catch (err) {
    console.warn("DuckSmart: Failed to show ad:", err.message);
    return false;
  }
}

/**
 * Check if AdMob is available in the current environment.
 */
export function isAdsAvailable() {
  return isAdMobAvailable;
}
