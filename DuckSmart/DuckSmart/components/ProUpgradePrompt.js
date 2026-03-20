// DuckSmart — Pro Upgrade Prompt
//
// Reusable component shown when free users hit a gated feature.
// Two modes:
//   - Default: full card with lock icon, message, and upgrade button
//   - Compact: single inline row for tight spaces (e.g. inside a list)

import React from "react";
import { View, Text, Pressable, StyleSheet, Linking } from "react-native";
import { COLORS } from "../constants/theme";
import { usePremium } from "../context/PremiumContext";

const PRIVACY_URL = "https://mallardworks.io/privacy-policy";
const TERMS_URL = "https://mallardworks.io/terms-%26-conditions";

export default function ProUpgradePrompt({ message, compact }) {
  const { purchase, monthlyPackage, annualPackage, getMonthlyPrice, getAnnualPrice } = usePremium();

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
      <Text style={styles.title}>DuckSmart Pro</Text>
      <Text style={styles.message}>{message || "This feature requires DuckSmart Pro"}</Text>
      <Pressable style={styles.upgradeBtn} onPress={() => purchase(annualPackage)}>
        <Text style={styles.upgradeBtnText}>
          {`${getAnnualPrice()} / year`}
        </Text>
        <Text style={styles.upgradeBtnSub}>Best value — save 33%</Text>
      </Pressable>
      <Pressable style={[styles.upgradeBtn, styles.upgradeBtnSecondary]} onPress={() => purchase(monthlyPackage)}>
        <Text style={styles.upgradeBtnTextSecondary}>
          {`${getMonthlyPrice()} / month`}
        </Text>
      </Pressable>
      <Text style={styles.legalNote}>
        Payment is charged to your iTunes account at confirmation. Subscriptions auto-renew unless cancelled at least 24 hours before the end of the current period.
      </Text>
      <View style={styles.legalRow}>
        <Text style={styles.legalLink} onPress={() => Linking.openURL(PRIVACY_URL)}>Privacy Policy</Text>
        <Text style={styles.legalSep}>|</Text>
        <Text style={styles.legalLink} onPress={() => Linking.openURL(TERMS_URL)}>Terms of Use</Text>
      </View>
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
    marginBottom: 4,
  },
  title: {
    color: COLORS.green,
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 6,
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
  upgradeBtnSub: {
    color: COLORS.green,
    fontWeight: "700",
    fontSize: 11,
    marginTop: 2,
    opacity: 0.7,
  },
  upgradeBtnSecondary: {
    marginTop: 8,
    backgroundColor: COLORS.bgDeep,
    borderColor: COLORS.border,
  },
  upgradeBtnTextSecondary: {
    color: COLORS.white,
    fontWeight: "900",
    fontSize: 14,
  },

  legalNote: {
    color: COLORS.mutedDarker,
    fontSize: 10,
    fontWeight: "600",
    textAlign: "center",
    marginTop: 12,
    lineHeight: 14,
  },
  legalRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 6,
    gap: 8,
  },
  legalLink: {
    color: COLORS.mutedDark,
    fontSize: 11,
    fontWeight: "700",
    textDecorationLine: "underline",
  },
  legalSep: {
    color: COLORS.mutedDarker,
    fontSize: 11,
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
