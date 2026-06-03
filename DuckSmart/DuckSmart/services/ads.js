// DuckSmart — Ad Service
//
// Manages Google AdMob interstitial ads for the free tier.
// Interstitials show a full-screen ad that the user can dismiss.
// Currently triggered: after logging a hunt (LogScreen).
//
// In Expo Go / dev builds where the native module isn't linked,
// all functions are safe no-ops.

import { Platform } from "react-native";
import Constants from "expo-constants";

const isExpoGo = Constants.appOwnership === "expo";
const SESSION_INTERSTITIAL_LIMIT = 3;

// ---------------------------------------------------------------------------
// Lazy-load the AdMob module — prevents crash in Expo Go
// ---------------------------------------------------------------------------
let AdMobInterstitial = null;
let AdEventType = null;
let mobileAds = null;
let isAdMobAvailable = false;
let isAdMobInitialized = false;

if (!isExpoGo) {
  try {
    const adModule = require("react-native-google-mobile-ads");
    AdMobInterstitial = adModule.InterstitialAd;
    AdEventType = adModule.AdEventType;
    mobileAds = adModule.default;
    isAdMobAvailable = true;
  } catch (_) {
    /* react-native-google-mobile-ads not linked */
  }
}

// ---------------------------------------------------------------------------
// Production Interstitial Ad Unit IDs
// ---------------------------------------------------------------------------
const AD_UNIT_IDS = {
  interstitial: {
    ios: "ca-app-pub-1918151395354287/3411847187",
    android: "ca-app-pub-1918151395354287/1783296087",
  },
};

// ---------------------------------------------------------------------------
// Interstitial ad instance (singleton — preloaded for instant show)
// ---------------------------------------------------------------------------
let interstitialAd = null;
let isAdLoaded = false;
let isAdLoading = false;
let isAdShowing = false;
let sessionInterstitialCount = 0;

/**
 * Initialize the AdMob SDK. Must be called before creating any ad requests.
 * Returns true if initialization succeeded.
 */
async function ensureAdMobInitialized() {
  if (isAdMobInitialized) return true;
  if (!isAdMobAvailable || !mobileAds) return false;

  try {
    await mobileAds().initialize();
    isAdMobInitialized = true;
    return true;
  } catch (err) {
    console.warn("DuckSmart: AdMob initialization failed:", err.message);
    return false;
  }
}

/**
 * Returns true if this user should be allowed to see an interstitial.
 */
export function canShowInterstitialAd({ isPro = false } = {}) {
  if (isPro) return false;
  if (sessionInterstitialCount >= SESSION_INTERSTITIAL_LIMIT) return false;
  return true;
}

/**
 * Optional helper for debugging.
 */
export function getInterstitialSessionCount() {
  return sessionInterstitialCount;
}

/**
 * Optional helper if you ever want to manually reset the count.
 * Normally a full app restart resets the in-memory session.
 */
export function resetInterstitialSessionCount() {
  sessionInterstitialCount = 0;
}

/**
 * Preload an interstitial ad so it's ready to show immediately.
 * Call this early (e.g., when the app starts or a screen mounts).
 * Safe to call multiple times.
 */
export async function preloadInterstitialAd({ isPro = false } = {}) {
  if (!isAdMobAvailable || !AdMobInterstitial) return;
  if (!canShowInterstitialAd({ isPro })) return;
  if (isAdLoaded || isAdLoading || isAdShowing) return;

  const ready = await ensureAdMobInitialized();
  if (!ready) return;

  try {
    isAdLoading = true;

    const adUnitId =
      Platform.OS === "ios"
        ? AD_UNIT_IDS.interstitial.ios
        : AD_UNIT_IDS.interstitial.android;

    interstitialAd = AdMobInterstitial.createForAdRequest(adUnitId, {
      requestNonPersonalizedAdsOnly: true,
    });

    interstitialAd.addAdEventListener(AdEventType.LOADED, () => {
      isAdLoaded = true;
      isAdLoading = false;
    });

    interstitialAd.addAdEventListener(AdEventType.OPENED, () => {
      isAdShowing = true;
    });

    interstitialAd.addAdEventListener(AdEventType.CLOSED, () => {
      isAdLoaded = false;
      isAdLoading = false;
      isAdShowing = false;
      interstitialAd = null;

      if (sessionInterstitialCount < SESSION_INTERSTITIAL_LIMIT) {
        setTimeout(() => {
          preloadInterstitialAd({ isPro });
        }, 2000);
      }
    });

    interstitialAd.addAdEventListener(AdEventType.ERROR, (error) => {
      console.warn("DuckSmart: Ad failed to load/show:", error.message);
      isAdLoaded = false;
      isAdLoading = false;
      isAdShowing = false;
      interstitialAd = null;
    });

    interstitialAd.load();
  } catch (err) {
    console.warn("DuckSmart: Failed to create interstitial ad:", err.message);
    isAdLoading = false;
    isAdShowing = false;
    interstitialAd = null;
  }
}

/**
 * Show the preloaded interstitial ad.
 * Returns true if the ad was shown, false if it wasn't ready or was skipped.
 *
 * Example:
 *   await showInterstitialAd({ isPro: user?.plan === "pro" });
 */
export async function showInterstitialAd({ isPro = false } = {}) {
  if (!canShowInterstitialAd({ isPro })) {
    return false;
  }

  if (!isAdMobAvailable || !interstitialAd || !isAdLoaded || isAdShowing) {
    return false;
  }

  try {
    sessionInterstitialCount += 1;
    await interstitialAd.show();
    return true;
  } catch (err) {
    sessionInterstitialCount = Math.max(0, sessionInterstitialCount - 1);
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