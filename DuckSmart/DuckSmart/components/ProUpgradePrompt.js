// DuckSmart — Pro Upgrade Prompt
//
// Reusable component shown when free users hit a gated feature.
// Two modes:
//   - Default: full card with lock icon, message, and upgrade button
//   - Compact: single inline row for tight spaces (e.g. inside a list)

import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { COLORS } from "../constants/theme";
import { usePremium } from "../context/PremiumContext";

export default function ProUpgradePrompt({ message, compact }) {
  const { purchase } = usePremium();

  if (compact) {
    return (
      <Pressable style={styles.compactWrap} onPress={purchase}>
        <Text style={styles.lockIcon}>🔒</Text>
        <Text style={styles.compactText}>{message || "Upgrade to Pro"}</Text>
        <Text style={styles.compactArrow}>›</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.lockIconLarge}>🔒</Text>
      <Text style={styles.message}>{message || "This feature requires DuckSmart Pro"}</Text>
      <Pressable style={styles.upgradeBtn} onPress={purchase}>
        <Text style={styles.upgradeBtnText}>Upgrade to Pro</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  // --- Full prompt ---
  wrap: {
    marginTop: 12,
    padding: 18,
    borderRadius: 14,
    backgroundColor: COLORS.bgDeep,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
  },
  lockIconLarge: {
    fontSize: 28,
    marginBottom: 8,
  },
  message: {
    color: COLORS.muted,
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
    lineHeight: 18,
    marginBottom: 12,
  },
  upgradeBtn: {
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 999,
    backgroundColor: COLORS.greenBg,
    borderWidth: 1,
    borderColor: COLORS.green,
  },
  upgradeBtnText: {
    color: COLORS.green,
    fontWeight: "900",
    fontSize: 14,
  },

  // --- Compact inline prompt ---
  compactWrap: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: COLORS.bgDeep,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderStyle: "dashed",
    marginBottom: 6,
  },
  lockIcon: {
    fontSize: 14,
    marginRight: 8,
  },
  compactText: {
    flex: 1,
    color: COLORS.muted,
    fontSize: 13,
    fontWeight: "700",
  },
  compactArrow: {
    color: COLORS.green,
    fontSize: 20,
    fontWeight: "700",
    marginLeft: 4,
  },
});
