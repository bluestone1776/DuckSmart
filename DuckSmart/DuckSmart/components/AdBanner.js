// DuckSmart — Ad Banner + Sponsor Section
//
// Two parts:
//   1. Ad banner (AdMob for free users, hidden for Pro)
//   2. Sponsor section (always visible) — shows sponsor ad slot + "Become a Sponsor" email link

import React, { useState, useEffect } from "react";
import { View, Text, Pressable, StyleSheet, Platform, Linking } from "react-native";
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
let mobileAds = null;
let isAdMobAvailable = false;

if (!isExpoGo) {
  try {
    const adModule = require("react-native-google-mobile-ads");
    BannerAd = adModule.BannerAd;
    BannerAdSize = adModule.BannerAdSize;
    TestIds = adModule.TestIds;
    mobileAds = adModule.default;
    isAdMobAvailable = true;
  } catch (_) {
    /* not linked */
  }
}

// Replace with your real banner ad unit IDs
const BANNER_AD_UNIT = {
  ios: TestIds?.BANNER || "ca-app-pub-1495369158025732/5998809708",
  android: TestIds?.BANNER || "ca-app-pub-1495369158025732/6294827756",
};

// ---------------------------------------------------------------------------
// Sponsor config — update this when you land a sponsor
// ---------------------------------------------------------------------------
const SPONSOR_EMAIL = "sales@mallardworks.io"; // your email for sponsor inquiries
const SPONSOR_SUBJECT = "Request for Sponsorship";
const SPONSOR_BODY = "I'd like to learn more about sponsorship on the DuckSmart app.";

// Set this to a sponsor object when you have one, or null to show the placeholder
const ACTIVE_SPONSOR = { name: "Delta Waterfowl", tagline: "Proud sponsor of DuckSmart" };

/**
 * AdBanner — shows ad + sponsor section.
 * Initializes AdMob SDK before showing the first banner.
 */
export default function AdBanner() {
  const { isPro, purchase } = usePremium();
  const [adReady, setAdReady] = useState(false);

  // Initialize AdMob SDK before rendering any banner
  useEffect(() => {
    if (isPro || !isAdMobAvailable || !mobileAds) return;

    let cancelled = false;
    (async () => {
      try {
        await mobileAds().initialize();
        if (!cancelled) setAdReady(true);
      } catch (err) {
        console.warn("DuckSmart: AdMob banner init failed:", err.message);
      }
    })();
    return () => { cancelled = true; };
  }, [isPro]);

  function openSponsorEmail() {
    const url = `mailto:${SPONSOR_EMAIL}?subject=${encodeURIComponent(SPONSOR_SUBJECT)}&body=${encodeURIComponent(SPONSOR_BODY)}`;
    Linking.openURL(url).catch(() => {
      // If mail app isn't available, just silently fail
    });
  }

  return (
    <View>
      {/* --- Ad / Sponsor Slot --- */}
      {!isPro && renderAd(purchase, adReady)}

      {/* --- Sponsor CTA (always visible, all users) --- */}
      <View style={styles.sponsorSection}>
        {ACTIVE_SPONSOR ? (
          <Text style={styles.sponsorText}>
            Sponsored by{" "}
            <Text style={styles.sponsorName}>{ACTIVE_SPONSOR.name}</Text>
            {ACTIVE_SPONSOR.tagline ? ` — ${ACTIVE_SPONSOR.tagline}` : ""}
          </Text>
        ) : (
          <Text style={styles.sponsorText}>
            Want your brand here?
          </Text>
        )}
        <Pressable style={styles.sponsorBtn} onPress={openSponsorEmail}>
          <Text style={styles.sponsorBtnText}>Become a Sponsor</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Ad rendering (extracted so Pro users skip it entirely)
// ---------------------------------------------------------------------------
function renderAd(purchase, adReady) {
  // Production build with AdMob linked + initialized: show real banner
  if (isAdMobAvailable && BannerAd && adReady) {
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

  // --- Sponsor section ---
  sponsorSection: {
    marginTop: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: COLORS.bgDeep,
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
    alignItems: "center",
  },
  sponsorText: {
    color: COLORS.mutedDark,
    fontWeight: "700",
    fontSize: 12,
    textAlign: "center",
  },
  sponsorName: {
    color: COLORS.green,
    fontWeight: "900",
  },
  sponsorBtn: {
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },
  sponsorBtnText: {
    color: COLORS.muted,
    fontWeight: "800",
    fontSize: 12,
  },
});
