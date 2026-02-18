// DuckSmart — Ad Banner Component
//
// Shows a placeholder banner in Expo Go / development.
// In production builds, replace this with the real Google AdMob integration.
//
// To enable real ads in production:
// 1. Set up AdMob account at https://admob.google.com
// 2. Add app.json plugin: ["react-native-google-mobile-ads", { "androidAppId": "...", "iosAppId": "..." }]
// 3. Replace this placeholder with the real BannerAd component

import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { COLORS } from "../constants/theme";

/**
 * AdBanner — placeholder for ad space.
 * Shows a subtle banner indicating ad placement.
 * Will be replaced with real Google AdMob in production builds.
 */
export default function AdBanner() {
  return (
    <View style={styles.placeholder}>
      <Text style={styles.placeholderText}>Ad Space</Text>
      <Text style={styles.placeholderSub}>Upgrade to Pro for ad-free experience</Text>
    </View>
  );
}

const styles = StyleSheet.create({
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
