// /context/PremiumContext.js
// DuckSmart — Premium Context
//
// Manages the user's subscription state (free vs. Pro) using RevenueCat.
// Uses RevenueCat Offerings / Packages so Android base plans work correctly.

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Alert, Platform } from "react-native";
import Constants from "expo-constants";
import { auth } from "../services/firebase";
import { logProUpgrade } from "../services/analytics";

const isExpoGo = Constants.appOwnership === "expo";

let Purchases = null;
let isRevenueCatAvailable = false;

if (!isExpoGo) {
  try {
    const rcModule = require("react-native-purchases");
    Purchases = rcModule.default || rcModule.Purchases;
    isRevenueCatAvailable = true;
  } catch (_) {
    // react-native-purchases not linked — fallback to free
  }
}

const REVENUECAT_API_KEYS = {
  ios: "appl_mtRPtHyfBkCUdQpHPmncfwiVNOR",
  android: "goog_jJcLFzpPdRQNEqRgQOvMkMAVVvb",
};

const PRO_ENTITLEMENT = "pro";

const PRODUCT_IDS = {
  monthly: "ducksmart_pro_monthly",
  yearly: "ducksmart_pro_yearly",
};

const FALLBACK_MONTHLY_PRICE = "$9.99";
const FALLBACK_YEARLY_PRICE = "$39.99";

const DEV_FORCE_PRO = __DEV__ && false;

const PremiumContext = createContext(null);

function getProductId(item) {
  if (!item) return null;

  return (
    item.product?.identifier ||
    item.product?.productIdentifier ||
    item.product?.productId ||
    item.product?.id ||
    item.identifier ||
    item.productIdentifier ||
    item.productId ||
    item.id ||
    null
  );
}

function getPriceString(item, fallback) {
  if (!item) return fallback;

  return (
    item.product?.priceString ||
    item.product?.localizedPriceString ||
    item.priceString ||
    item.localizedPriceString ||
    fallback
  );
}

function hasPro(customerInfo) {
  return customerInfo?.entitlements?.active?.[PRO_ENTITLEMENT] !== undefined;
}

function normalizeText(value) {
  return String(value || "").toLowerCase();
}

function isMonthlyPackage(pkg) {
  const packageType = normalizeText(pkg?.packageType);
  const identifier = normalizeText(pkg?.identifier);
  const productId = normalizeText(getProductId(pkg));

  return (
    packageType === "monthly" ||
    identifier.includes("monthly") ||
    identifier.includes("$rc_monthly") ||
    productId.includes(PRODUCT_IDS.monthly)
  );
}

function isYearlyPackage(pkg) {
  const packageType = normalizeText(pkg?.packageType);
  const identifier = normalizeText(pkg?.identifier);
  const productId = normalizeText(getProductId(pkg));

  return (
    packageType === "annual" ||
    packageType === "yearly" ||
    identifier.includes("annual") ||
    identifier.includes("yearly") ||
    identifier.includes("$rc_annual") ||
    productId.includes(PRODUCT_IDS.yearly)
  );
}

function isSupportedPackageOrProduct(item) {
  const productId = normalizeText(getProductId(item));

  return (
    productId.includes(PRODUCT_IDS.monthly) ||
    productId.includes(PRODUCT_IDS.yearly)
  );
}

export function PremiumProvider({ children }) {
  const [isPro, setIsPro] = useState(DEV_FORCE_PRO);
  const [loading, setLoading] = useState(true);
  const [monthlyPackage, setMonthlyPackage] = useState(null);
  const [yearlyPackage, setYearlyPackage] = useState(null);

  const checkSubscription = useCallback(async () => {
    if (!isRevenueCatAvailable || !Purchases) return false;

    try {
      const customerInfo = await Purchases.getCustomerInfo();
      const active = hasPro(customerInfo);
      setIsPro(DEV_FORCE_PRO || active);
      return active;
    } catch (err) {
      console.error("DuckSmart: Failed to check subscription:", err.message);
      return false;
    }
  }, []);

  const loadOfferings = useCallback(async () => {
    if (!isRevenueCatAvailable || !Purchases) return;

    try {
      if (typeof Purchases.getOfferings !== "function") {
        console.warn("DuckSmart: Purchases.getOfferings is not available.");
        return;
      }

      const offerings = await Purchases.getOfferings();
      const packages = offerings?.current?.availablePackages || [];

      console.log(
        "DuckSmart RevenueCat packages:",
        packages.map((pkg) => ({
          identifier: pkg?.identifier,
          packageType: pkg?.packageType,
          productId: getProductId(pkg),
          price: getPriceString(pkg, "unknown"),
        }))
      );

      const monthly =
        packages.find(isMonthlyPackage) ||
        packages.find((pkg) => normalizeText(getProductId(pkg)).includes("monthly")) ||
        null;

      const yearly =
        packages.find(isYearlyPackage) ||
        packages.find((pkg) => normalizeText(getProductId(pkg)).includes("yearly")) ||
        null;

      setMonthlyPackage(monthly);
      setYearlyPackage(yearly);

      if (!monthly) {
        console.warn("DuckSmart: Monthly RevenueCat package not found.");
      }

      if (!yearly) {
        console.warn("DuckSmart: Yearly RevenueCat package not found.");
      }
    } catch (err) {
      console.warn("DuckSmart: Failed to load RevenueCat offerings:", err.message);
      setMonthlyPackage(null);
      setYearlyPackage(null);
    }
  }, []);

  useEffect(() => {
    async function initRevenueCat() {
      if (!isRevenueCatAvailable || !Purchases) {
        setLoading(false);
        return;
      }

      try {
        const apiKey =
          Platform.OS === "ios"
            ? REVENUECAT_API_KEYS.ios
            : REVENUECAT_API_KEYS.android;

        if (!apiKey) {
          console.warn("DuckSmart: No RevenueCat API key for this platform.");
          setLoading(false);
          return;
        }

        await Purchases.configure({ apiKey });

        if (typeof Purchases.addCustomerInfoUpdateListener === "function") {
          Purchases.addCustomerInfoUpdateListener((customerInfo) => {
            const active = hasPro(customerInfo);
            setIsPro(DEV_FORCE_PRO || active);
          });
        }

        await checkSubscription();
        await loadOfferings();
      } catch (err) {
        console.error("DuckSmart: RevenueCat init error:", err.message);
      } finally {
        setLoading(false);
      }
    }

    initRevenueCat();
  }, [checkSubscription, loadOfferings]);

  const purchase = useCallback(
    async (packageOrProduct) => {
      if (!isRevenueCatAvailable || !Purchases) {
        Alert.alert(
          "Not Available",
          "In-app purchases require a production build. Subscriptions are not available in Expo Go."
        );
        return false;
      }

      if (!packageOrProduct) {
        Alert.alert(
          "Subscription Loading",
          "Subscriptions are still loading. Please wait a few seconds and try again."
        );

        await loadOfferings();
        return false;
      }

      if (!isSupportedPackageOrProduct(packageOrProduct)) {
        Alert.alert(
          "Subscription Error",
          "This subscription product is not supported in this build."
        );
        return false;
      }

      try {
        let result;

        if (packageOrProduct?.product && typeof Purchases.purchasePackage === "function") {
          result = await Purchases.purchasePackage(packageOrProduct);
        } else if (typeof Purchases.purchaseStoreProduct === "function") {
          result = await Purchases.purchaseStoreProduct(packageOrProduct);
        } else {
          Alert.alert(
            "Purchase Unavailable",
            "Could not start the purchase right now. Please try again."
          );
          return false;
        }

        const customerInfo = result?.customerInfo || result;
        const active = hasPro(customerInfo);

        setIsPro(DEV_FORCE_PRO || active);

        if (active) {
          logProUpgrade(auth.currentUser?.uid);
          Alert.alert(
            "Welcome to Pro!",
            "You now have access to all DuckSmart features. Happy hunting!"
          );
        } else {
          await checkSubscription();
        }

        return active;
      } catch (err) {
        if (err?.userCancelled) return false;

        console.error("DuckSmart: Purchase error:", err.message);
        Alert.alert(
          "Purchase Failed",
          err.message || "Could not complete the purchase. Please try again."
        );
        return false;
      }
    },
    [checkSubscription, loadOfferings]
  );

  const restore = useCallback(async () => {
    if (!isRevenueCatAvailable || !Purchases) {
      Alert.alert(
        "Not Available",
        "Purchase restoration requires a production build."
      );
      return false;
    }

    try {
      const customerInfo = await Purchases.restorePurchases();
      const active = hasPro(customerInfo);

      setIsPro(DEV_FORCE_PRO || active);

      if (active) {
        Alert.alert("Restored!", "Your Pro subscription has been restored.");
      } else {
        Alert.alert(
          "No Subscription Found",
          "We couldn't find an active Pro subscription for this account."
        );
      }

      return active;
    } catch (err) {
      console.error("DuckSmart: Restore error:", err.message);
      Alert.alert("Restore Failed", "Could not restore purchases. Please try again.");
      return false;
    }
  }, []);

  const redeemOfferCode = useCallback(async () => {
    if (Platform.OS !== "ios") {
      Alert.alert(
        "iOS Only",
        "Offer code redemption is only available through the iOS App Store."
      );
      return false;
    }

    if (
      !isRevenueCatAvailable ||
      !Purchases ||
      typeof Purchases.presentCodeRedemptionSheet !== "function"
    ) {
      Alert.alert(
        "Not Available",
        "Offer code redemption requires an iOS TestFlight or App Store build."
      );
      return false;
    }

    try {
      await Purchases.presentCodeRedemptionSheet();

      setTimeout(() => {
        checkSubscription().catch(() => {});
      }, 1500);

      Alert.alert(
        "Offer Code Submitted",
        "If your code was accepted by Apple, DuckSmart Pro should activate shortly. If it does not, tap Restore Purchase."
      );

      return true;
    } catch (err) {
      console.error("DuckSmart: Offer code redemption error:", err.message);
      Alert.alert(
        "Offer Code Error",
        "Could not open the Apple offer code screen. Please try again."
      );
      return false;
    }
  }, [checkSubscription]);

  const getMonthlyPrice = useCallback(() => {
    return getPriceString(monthlyPackage, FALLBACK_MONTHLY_PRICE);
  }, [monthlyPackage]);

  const getAnnualPrice = useCallback(() => {
    return getPriceString(yearlyPackage, FALLBACK_YEARLY_PRICE);
  }, [yearlyPackage]);

  const getYearlyPrice = getAnnualPrice;
  const getProPrice = getMonthlyPrice;

  return (
    <PremiumContext.Provider
      value={{
        isPro,
        loading,
        purchase,
        restore,
        redeemOfferCode,
        getProPrice,
        getMonthlyPrice,
        getAnnualPrice,
        getYearlyPrice,
        monthlyPackage,
        yearlyPackage,
        annualPackage: yearlyPackage,
        checkSubscription,
        reloadOfferings: loadOfferings,
      }}
    >
      {children}
    </PremiumContext.Provider>
  );
}

export function usePremium() {
  const ctx = useContext(PremiumContext);

  if (!ctx) {
    throw new Error("usePremium must be used inside <PremiumProvider>");
  }

  return ctx;
}

