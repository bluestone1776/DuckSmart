// DuckSmart — Ad Banner Component
//
// Shows a Google AdMob banner ad for free-tier users.
// Pro users see nothing (component returns null).
// Falls back to a placeholder in Expo Go / development builds.

import React from "react";
import { View, Text, Pressable, StyleSheet, Platform } from "react-native";
import Constants from "expo-constants";
import { COLORS } from "../constants/theme";
import { usePremium } from "../context/PremiumContext";

const isExpoGo = Constants.appOwnership === "expo";

// ---------------------------------------------------------------------------
// Lazy-load AdMob banner — prevents crash in Expo Go
// ---------------------------------------------------------------------------
let BannerAd = null;
let BannerAdSize = null;
let TestIds = null;
let isAdMobAvailable = false;

if (!isExpoGo) {
  try {
    const adModule = require("react-native-google-mobile-ads");
    BannerAd = adModule.BannerAd;
    BannerAdSize = adModule.BannerAdSize;
    TestIds = adModule.TestIds;
    isAdMobAvailable = true;
  } catch (_) {
    /* not linked */
  }
}

// Replace with your real banner ad unit IDs
const BANNER_AD_UNIT = {
  ios: TestIds?.BANNER || "ca-app-pub-xxxxxxxxxxxxx/yyyyyyyyyy",
  android: TestIds?.BANNER || "ca-app-pub-xxxxxxxxxxxxx/yyyyyyyyyy",
};

/**
 * AdBanner — shows a banner ad for free users.
 * Returns null for Pro subscribers (ad-free experience).
 */
export default function AdBanner() {
  const { isPro, purchase } = usePremium();

  // Pro users: no ads
  if (isPro) return null;

  // Production build with AdMob linked: show real banner
  if (isAdMobAvailable && BannerAd) {
    const adUnitId = Platform.OS === "ios"
      ? BANNER_AD_UNIT.ios
      : BANNER_AD_UNIT.android;

    return (
      <View style={styles.bannerWrap}>
        <BannerAd
          unitId={adUnitId}
          size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
          requestOptions={{ requestNonPersonalizedAdsOnly: true }}
          onAdFailedToLoad={(error) => {
            console.warn("DuckSmart: Banner ad failed:", error.message);
          }}
        />
      </View>
    );
  }

  // Expo Go / dev: show placeholder with upgrade CTA
  return (
    <Pressable style={styles.placeholder} onPress={purchase}>
      <Text style={styles.placeholderText}>Ad Space</Text>
      <Text style={styles.placeholderSub}>Upgrade to Pro for ad-free experience</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bannerWrap: {
    marginTop: 14,
    alignItems: "center",
    overflow: "hidden",
    borderRadius: 14,
  },
  placeholder: {
    marginTop: 14,
    padding: 14,
    borderRadius: 14,
    backgroundColor: COLORS.bgDeep,
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
    alignItems: "center",
  },
  placeholderText: {
    color: COLORS.mutedDark,
    fontWeight: "800",
    fontSize: 12,
  },
  placeholderSub: {
    color: COLORS.mutedDarker,
    fontWeight: "700",
    fontSize: 11,
    marginTop: 4,
  },
});
