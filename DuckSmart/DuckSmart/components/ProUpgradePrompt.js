// DuckSmart — Pro Upgrade Prompt
//
// Reusable component shown when free users hit a gated feature.
// Default: DuckSmart Pro
// DuckSmart Group mode: Hunting Party setup using ducksmart_group

import React from "react";
import { View, Text, Pressable, StyleSheet, Linking } from "react-native";
import { COLORS } from "../constants/theme";
import { usePremium } from "../context/PremiumContext";

const PRIVACY_URL = "https://mallardworks.io/privacy-policy";
const TERMS_URL = "https://mallardworks.io/terms-%26-conditions";

const GOLD = "#D9A84C";
const GOLD_BG = "rgba(217,168,76,0.14)";
const GOLD_BORDER = "rgba(217,168,76,0.48)";

export default function ProUpgradePrompt({ message, compact, mode = "pro" }) {
  const {
    purchase,
    monthlyPackage,
    annualPackage,
    getMonthlyPrice,
    getAnnualPrice,

    purchaseDuckSmartGroup,
    getDuckSmartGroupPrice,
  } = usePremium();

  const isDuckSmartGroup = mode === "ducksmart_group";

  function handleProPurchase() {
    purchase(annualPackage || monthlyPackage);
  }

  function handleDuckSmartGroupPurchase() {
    if (typeof purchaseDuckSmartGroup === "function") {
      purchaseDuckSmartGroup();
    }
  }

  if (compact) {
    return (
      <Pressable
        style={[styles.compactWrap, isDuckSmartGroup && styles.compactWrapGroup]}
        onPress={isDuckSmartGroup ? handleDuckSmartGroupPurchase : handleProPurchase}
      >
        <Text style={styles.lockIcon}>{isDuckSmartGroup ? "👥" : "🔒"}</Text>

        <Text style={styles.compactText}>
          {message || (isDuckSmartGroup ? "Start DuckSmart Group" : "Upgrade to Pro")}
        </Text>

        <Text style={[styles.compactArrow, isDuckSmartGroup && styles.compactArrowGroup]}>
          ›
        </Text>
      </Pressable>
    );
  }

  if (isDuckSmartGroup) {
    return (
      <View style={[styles.wrap, styles.groupWrap]}>
        <Text style={styles.lockIconLarge}>👥</Text>

        <Text style={styles.groupTitle}>DuckSmart Group</Text>

        <Text style={styles.message}>
          {message ||
            "Create a Hunting Party for your lodge, club, or guide team. Includes shared users, shared map pins, shared hunt logs, and Pro access for added hunters."}
        </Text>

        <View style={styles.benefitsBox}>
          <Text style={styles.benefitText}>• Includes 5 hunters</Text>
          <Text style={styles.benefitText}>• Shared Hunting Party pins</Text>
          <Text style={styles.benefitText}>• Shared Hunting Party hunt logs</Text>
          <Text style={styles.benefitText}>• Add Extra Hunter for $29.99</Text>
        </View>

        <Pressable style={styles.groupBtn} onPress={handleDuckSmartGroupPurchase}>
          <Text style={styles.groupBtnText}>
            {typeof getDuckSmartGroupPrice === "function"
              ? getDuckSmartGroupPrice()
              : "$249.99"}
          </Text>
          <Text style={styles.groupBtnSub}>Start DuckSmart Group</Text>
        </Pressable>

        <Text style={styles.legalNote}>
          Payment is charged to your App Store or Google Play account at confirmation. Access and renewal terms are managed through the store account used for purchase.
        </Text>

        <View style={styles.legalRow}>
          <Text style={styles.legalLink} onPress={() => Linking.openURL(PRIVACY_URL)}>
            Privacy Policy
          </Text>

          <Text style={styles.legalSep}>|</Text>

          <Text style={styles.legalLink} onPress={() => Linking.openURL(TERMS_URL)}>
            Terms of Use
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.lockIconLarge}>🔒</Text>

      <Text style={styles.title}>DuckSmart Pro</Text>

      <Text style={styles.message}>
        {message || "This feature requires DuckSmart Pro"}
      </Text>

      <Pressable style={styles.upgradeBtn} onPress={() => purchase(annualPackage)}>
        <Text style={styles.upgradeBtnText}>
          {`${getAnnualPrice()} / year`}
        </Text>
        <Text style={styles.upgradeBtnSub}>Best value — save 33%</Text>
      </Pressable>

      <Pressable
        style={[styles.upgradeBtn, styles.upgradeBtnSecondary]}
        onPress={() => purchase(monthlyPackage)}
      >
        <Text style={styles.upgradeBtnTextSecondary}>
          {`${getMonthlyPrice()} / month`}
        </Text>
      </Pressable>

      <Text style={styles.legalNote}>
        Payment is charged to your iTunes account at confirmation. Subscriptions auto-renew unless cancelled at least 24 hours before the end of the current period.
      </Text>

      <View style={styles.legalRow}>
        <Text style={styles.legalLink} onPress={() => Linking.openURL(PRIVACY_URL)}>
          Privacy Policy
        </Text>

        <Text style={styles.legalSep}>|</Text>

        <Text style={styles.legalLink} onPress={() => Linking.openURL(TERMS_URL)}>
          Terms of Use
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 12,
    padding: 18,
    borderRadius: 14,
    backgroundColor: COLORS.bgDeep,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
  },

  groupWrap: {
    borderColor: GOLD_BORDER,
    backgroundColor: COLORS.bgDeep,
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

  groupTitle: {
    color: GOLD,
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

  benefitsBox: {
    width: "100%",
    padding: 12,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: GOLD_BORDER,
    marginBottom: 12,
  },

  benefitText: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 20,
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

  groupBtn: {
    paddingVertical: 11,
    paddingHorizontal: 24,
    borderRadius: 999,
    backgroundColor: GOLD_BG,
    borderWidth: 1,
    borderColor: GOLD,
    alignItems: "center",
  },

  groupBtnText: {
    color: GOLD,
    fontWeight: "900",
    fontSize: 14,
  },

  groupBtnSub: {
    color: GOLD,
    fontWeight: "700",
    fontSize: 11,
    marginTop: 2,
    opacity: 0.75,
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

  compactWrapGroup: {
    borderColor: GOLD_BORDER,
    backgroundColor: "rgba(217,168,76,0.06)",
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

  compactArrowGroup: {
    color: GOLD,
  },
});