// DuckSmart — Premium Context
//
// Manages the user's subscription state (free vs. Pro) using RevenueCat.
// Provides isPro, loading, purchase, and restore functions to all screens.
//
// RevenueCat handles both Apple App Store and Google Play subscriptions,
// receipt validation, and trial periods from a single SDK.
//
// Setup required:
//   1. Create a RevenueCat account at https://www.revenuecat.com
//   2. Add your App Store / Play Store apps in the RevenueCat dashboard
//   3. Create an Offering with a "DuckSmart Pro" subscription product
//   4. Replace REVENUECAT_API_KEYS below with your real keys
//   5. Install: npx expo install react-native-purchases

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { Platform, Alert } from "react-native";
import Constants from "expo-constants";

// ---------------------------------------------------------------------------
// RevenueCat — lazy-loaded so app doesn't crash in Expo Go
// ---------------------------------------------------------------------------
const isExpoGo = Constants.appOwnership === "expo";

let Purchases = null;
let isRevenueCatAvailable = false;

if (!isExpoGo) {
  try {
    const rcModule = require("react-native-purchases");
    Purchases = rcModule.default || rcModule.Purchases;
    isRevenueCatAvailable = true;
  } catch (_) {
    /* react-native-purchases not linked — fallback to free */
  }
}

// ---------------------------------------------------------------------------
// RevenueCat API keys — replace with your real keys from the RC dashboard
// ---------------------------------------------------------------------------
const REVENUECAT_API_KEYS = {
  ios: "appl_YOUR_REVENUECAT_IOS_KEY",
  android: "goog_YOUR_REVENUECAT_ANDROID_KEY",
};

// The entitlement identifier you set up in RevenueCat dashboard
const PRO_ENTITLEMENT = "pro";

const PremiumContext = createContext(null);

export function PremiumProvider({ children }) {
  const [isPro, setIsPro] = useState(false);
  const [loading, setLoading] = useState(true);
  const [offerings, setOfferings] = useState(null);

  // ---------------------------------------------------------------------------
  // Initialize RevenueCat on mount
  // ---------------------------------------------------------------------------
  useEffect(() => {
    async function init() {
      if (!isRevenueCatAvailable || !Purchases) {
        // RevenueCat not available (Expo Go or not installed) — default to free
        setLoading(false);
        return;
      }

      try {
        const apiKey = Platform.OS === "ios"
          ? REVENUECAT_API_KEYS.ios
          : REVENUECAT_API_KEYS.android;

        // Configure RevenueCat (only call once)
        await Purchases.configure({ apiKey });

        // Check current entitlements
        await checkSubscription();

        // Pre-fetch offerings for the paywall
        const offers = await Purchases.getOfferings();
        if (offers.current) {
          setOfferings(offers.current);
        }
      } catch (err) {
        console.error("DuckSmart: RevenueCat init error:", err.message);
      } finally {
        setLoading(false);
      }
    }

    init();
  }, []);

  // ---------------------------------------------------------------------------
  // Check if user has Pro entitlement
  // ---------------------------------------------------------------------------
  const checkSubscription = useCallback(async () => {
    if (!isRevenueCatAvailable || !Purchases) return;

    try {
      const customerInfo = await Purchases.getCustomerInfo();
      const hasPro = customerInfo.entitlements.active[PRO_ENTITLEMENT] !== undefined;
      setIsPro(hasPro);
    } catch (err) {
      console.error("DuckSmart: Failed to check subscription:", err.message);
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Purchase Pro subscription
  // ---------------------------------------------------------------------------
  const purchase = useCallback(async () => {
    if (!isRevenueCatAvailable || !Purchases) {
      Alert.alert(
        "Not Available",
        "In-app purchases require a production build. Subscriptions are not available in Expo Go."
      );
      return false;
    }

    if (!offerings || !offerings.availablePackages.length) {
      Alert.alert("Error", "No subscription packages available. Please try again later.");
      return false;
    }

    try {
      // Use the first available package (should be our Pro subscription)
      const pkg = offerings.availablePackages[0];
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      const hasPro = customerInfo.entitlements.active[PRO_ENTITLEMENT] !== undefined;
      setIsPro(hasPro);

      if (hasPro) {
        Alert.alert("Welcome to Pro!", "You now have access to all DuckSmart features. Happy hunting!");
      }
      return hasPro;
    } catch (err) {
      // User cancelled the purchase
      if (err.userCancelled) return false;
      console.error("DuckSmart: Purchase error:", err.message);
      Alert.alert("Purchase Failed", "Could not complete the purchase. Please try again.");
      return false;
    }
  }, [offerings]);

  // ---------------------------------------------------------------------------
  // Restore previous purchases (required by App Store guidelines)
  // ---------------------------------------------------------------------------
  const restore = useCallback(async () => {
    if (!isRevenueCatAvailable || !Purchases) {
      Alert.alert(
        "Not Available",
        "Purchase restoration requires a production build."
      );
      return;
    }

    try {
      const customerInfo = await Purchases.restorePurchases();
      const hasPro = customerInfo.entitlements.active[PRO_ENTITLEMENT] !== undefined;
      setIsPro(hasPro);

      if (hasPro) {
        Alert.alert("Restored!", "Your Pro subscription has been restored.");
      } else {
        Alert.alert("No Subscription Found", "We couldn't find an active Pro subscription for this account.");
      }
    } catch (err) {
      console.error("DuckSmart: Restore error:", err.message);
      Alert.alert("Restore Failed", "Could not restore purchases. Please try again.");
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Get price string for display on paywalls
  // ---------------------------------------------------------------------------
  const getProPrice = useCallback(() => {
    if (!offerings || !offerings.availablePackages.length) return null;
    return offerings.availablePackages[0].product.priceString;
  }, [offerings]);

  return (
    <PremiumContext.Provider
      value={{
        isPro,
        loading,
        purchase,
        restore,
        getProPrice,
        checkSubscription,
      }}
    >
      {children}
    </PremiumContext.Provider>
  );
}

/**
 * Hook to access premium state from any screen.
 * Returns: { isPro, loading, purchase, restore, getProPrice, checkSubscription }
 */
export function usePremium() {
  const ctx = useContext(PremiumContext);
  if (!ctx) {
    throw new Error("usePremium must be used inside <PremiumProvider>");
  }
  return ctx;
}
