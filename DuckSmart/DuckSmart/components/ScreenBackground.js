// DuckSmart — ScreenBackground
//
// Wraps screen content with a subtle accent-tinted gradient that adapts
// to the user's chosen accent colour.

import React from "react";
import { StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "../context/ThemeContext";

export default function ScreenBackground({ children, style }) {
  const { accentBg } = useTheme();

  return (
    <LinearGradient
      colors={["#000000", accentBg || "#0E1A12"]}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={[styles.base, style]}
    >
      {children}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  base: { flex: 1 },
});
