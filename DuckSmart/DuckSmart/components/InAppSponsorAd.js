// /Users/gozyr/Development/ducksmart/DuckSmart/DuckSmart/components/InAppSponsorAd.js

import React, { useEffect, useRef, useState } from "react";
import {
  Image,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { COLORS } from "../constants/theme";
import { useAuth } from "../context/AuthContext";
import {
  getRandomInAppAd,
  trackInAppAdClick,
  trackInAppAdImpression,
} from "../services/in_app_ads";

export default function InAppSponsorAd({
  screen = "UnknownScreen",
  placementId = "unknown",
  style,
}) {
  const { user } = useAuth();

  const [ad, setAd] = useState(null);
  const [failed, setFailed] = useState(false);
  const impressionLoggedRef = useRef(false);

  useEffect(() => {
    let mounted = true;

    setFailed(false);
    impressionLoggedRef.current = false;

    async function loadAd() {
      const pickedAd = await getRandomInAppAd();

      if (mounted) {
        setAd(pickedAd);
      }
    }

    loadAd();

    return () => {
      mounted = false;
    };
  }, [screen, placementId]);

  function handleImageLoad() {
    if (!ad || impressionLoggedRef.current) return;

    impressionLoggedRef.current = true;

    trackInAppAdImpression(user?.uid || null, ad, {
      screen,
      placementId,
    });
  }

  async function handlePress() {
    if (!ad?.linkUrl) return;

    trackInAppAdClick(user?.uid || null, ad, {
      screen,
      placementId,
    });

    try {
      await Linking.openURL(ad.linkUrl);
    } catch (err) {
      console.log("DuckSmart sponsor ad link failed:", err?.message || err);
    }
  }

  if (!ad || failed) return null;

  return (
    <View style={[s.wrap, style]}>
      <Pressable
        onPress={handlePress}
        style={[s.banner, { aspectRatio: ad.aspectRatio || 4 }]}
        accessibilityRole="link"
        accessibilityLabel={`Open sponsor ad from ${ad.companyName}`}
      >
        <Image
          source={{ uri: ad.imageUrl }}
          style={s.image}
          resizeMode="cover"
          onLoad={handleImageLoad}
          onError={() => setFailed(true)}
        />

        <View pointerEvents="none" style={s.label}>
          <Text style={s.labelText}>Sponsor</Text>
        </View>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    width: "100%",
    marginTop: 8,
    marginBottom: 10,
  },
  banner: {
    width: "100%",
    overflow: "hidden",
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  label: {
    position: "absolute",
    right: 8,
    bottom: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.52)",
  },
  labelText: {
    color: COLORS.white,
    fontSize: 10,
    fontWeight: "900",
  },
});