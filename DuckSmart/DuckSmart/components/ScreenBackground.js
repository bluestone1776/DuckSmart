// DuckSmart — ScreenBackground
//
// Wraps screen content with a background image + accent-tinted gradient overlay
// that adapts to the user's chosen accent colour.

import React from "react";
import { StyleSheet, View, Image } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "../context/ThemeContext";
import { ASSETS } from "../constants/assets";

export default function ScreenBackground({ children, style, bg }) {
  const { accentBg } = useTheme();

  return (
    <View style={[styles.base, style]}>
      {/* Background image — subtle, low opacity */}
      <Image
        source={bg || ASSETS.bgMarsh}
        style={styles.bgImage}
        resizeMode="cover"
      />

      {/* Screen content */}
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { flex: 1, backgroundColor: "#000000" },
  bgImage: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
    opacity: 0.9,
  },
  content: {
    flex: 1,
  },
});
