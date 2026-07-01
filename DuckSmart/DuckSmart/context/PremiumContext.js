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
import { loadPartyAccess } from "../services/party_helper";

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
  ducksmartGroup: "ducksmart_group",
};

const FALLBACK_MONTHLY_PRICE = "$9.99";
const FALLBACK_YEARLY_PRICE = "$39.99";
const FALLBACK_DUCKSMART_GROUP_PRICE = "$249.99";

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

function hasActivePartyAccess(access) {
  return access?.active === true || access?.isPro === true;
}

function normalizeText(value) {
  return String(value || "").toLowerCase();
}

function isExactProduct(item, productId) {
  const found = normalizeText(getProductId(item));
  const wanted = normalizeText(productId);

  return found === wanted || found.startsWith(`${wanted}:`);
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

function isDuckSmartGroupPackage(pkg) {
  return isExactProduct(pkg, PRODUCT_IDS.ducksmartGroup);
}

function isSupportedPackageOrProduct(item) {
  const productId = normalizeText(getProductId(item));

  return (
    productId.includes(PRODUCT_IDS.monthly) ||
    productId.includes(PRODUCT_IDS.yearly)
  );
}

function isSupportedDuckSmartGroupItem(item) {
  return isExactProduct(item, PRODUCT_IDS.ducksmartGroup);
}

async function purchaseRevenueCatItem(packageOrProduct) {
  if (!packageOrProduct) return null;

  if (packageOrProduct?.product && typeof Purchases.purchasePackage === "function") {
    return Purchases.purchasePackage(packageOrProduct);
  }

  if (typeof Purchases.purchaseStoreProduct === "function") {
    return Purchases.purchaseStoreProduct(packageOrProduct);
  }

  return null;
}

export function PremiumProvider({ children }) {
  const [isPro, setIsPro] = useState(DEV_FORCE_PRO);
  const [loading, setLoading] = useState(true);
  const [monthlyPackage, setMonthlyPackage] = useState(null);
  const [yearlyPackage, setYearlyPackage] = useState(null);

  const [ducksmartGroupPackage, setDucksmartGroupPackage] = useState(null);
  const [partyAccess, setPartyAccess] = useState(null);
  const [revenueCatIsPro, setRevenueCatIsPro] = useState(DEV_FORCE_PRO);

  const updateProState = useCallback((revenueActive, nextPartyAccess) => {
    const partyActive = hasActivePartyAccess(nextPartyAccess);

    setRevenueCatIsPro(DEV_FORCE_PRO || !!revenueActive);
    setIsPro(DEV_FORCE_PRO || !!revenueActive || partyActive);
  }, []);

  const refreshPartyAccess = useCallback(async () => {
    const uid = auth.currentUser?.uid;

    if (!uid) {
      setPartyAccess(null);
      return null;
    }

    try {
      const access = await loadPartyAccess(uid);
      const safeAccess = access || null;

      setPartyAccess(safeAccess);
      return safeAccess;
    } catch (err) {
      console.warn("DuckSmart: Failed to check Hunting Party access:", err?.message || err);
      setPartyAccess(null);
      return null;
    }
  }, []);

  const checkSubscription = useCallback(async () => {
    const nextPartyAccess = await refreshPartyAccess();

    if (!isRevenueCatAvailable || !Purchases) {
      updateProState(false, nextPartyAccess);
      return DEV_FORCE_PRO || hasActivePartyAccess(nextPartyAccess);
    }

    try {
      const customerInfo = await Purchases.getCustomerInfo();
      const active = hasPro(customerInfo);

      updateProState(active, nextPartyAccess);

      return DEV_FORCE_PRO || active || hasActivePartyAccess(nextPartyAccess);
    } catch (err) {
      console.error("DuckSmart: Failed to check subscription:", err.message);
      updateProState(false, nextPartyAccess);
      return DEV_FORCE_PRO || hasActivePartyAccess(nextPartyAccess);
    }
  }, [refreshPartyAccess, updateProState]);

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

      const ducksmartGroup =
        packages.find(isDuckSmartGroupPackage) ||
        packages.find((pkg) => isExactProduct(pkg, PRODUCT_IDS.ducksmartGroup)) ||
        null;

      setMonthlyPackage(monthly);
      setYearlyPackage(yearly);
      setDucksmartGroupPackage(ducksmartGroup);

      if (!monthly) {
        console.warn("DuckSmart: Monthly RevenueCat package not found.");
      }

      if (!yearly) {
        console.warn("DuckSmart: Yearly RevenueCat package not found.");
      }

      if (!ducksmartGroup) {
        console.warn("DuckSmart: DuckSmart Group RevenueCat package not found.");
      }
    } catch (err) {
      console.warn("DuckSmart: Failed to load RevenueCat offerings:", err.message);
      setMonthlyPackage(null);
      setYearlyPackage(null);
      setDucksmartGroupPackage(null);
    }
  }, []);

  useEffect(() => {
    async function initRevenueCat() {
      if (!isRevenueCatAvailable || !Purchases) {
        const nextPartyAccess = await refreshPartyAccess();
        updateProState(false, nextPartyAccess);
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
          const nextPartyAccess = await refreshPartyAccess();
          updateProState(false, nextPartyAccess);
          setLoading(false);
          return;
        }

        await Purchases.configure({ apiKey });

        if (typeof Purchases.addCustomerInfoUpdateListener === "function") {
          Purchases.addCustomerInfoUpdateListener(async (customerInfo) => {
            const active = hasPro(customerInfo);
            const nextPartyAccess = await refreshPartyAccess();
            updateProState(active, nextPartyAccess);
          });
        }

        await checkSubscription();
        await loadOfferings();
      } catch (err) {
        console.error("DuckSmart: RevenueCat init error:", err.message);
        const nextPartyAccess = await refreshPartyAccess();
        updateProState(false, nextPartyAccess);
      } finally {
        setLoading(false);
      }
    }

    initRevenueCat();
  }, [checkSubscription, loadOfferings, refreshPartyAccess, updateProState]);

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
        const result = await purchaseRevenueCatItem(packageOrProduct);

        if (!result) {
          Alert.alert(
            "Purchase Unavailable",
            "Could not start the purchase right now. Please try again."
          );
          return false;
        }

        const customerInfo = result?.customerInfo || result;
        const active = hasPro(customerInfo);
        const nextPartyAccess = await refreshPartyAccess();

        updateProState(active, nextPartyAccess);

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
    [checkSubscription, loadOfferings, refreshPartyAccess, updateProState]
  );

  const purchaseDuckSmartGroup = useCallback(async () => {
    if (!isRevenueCatAvailable || !Purchases) {
      Alert.alert(
        "Not Available",
        "DuckSmart Group purchases require a production build."
      );
      return false;
    }

    const packageOrProduct = ducksmartGroupPackage;

    if (!packageOrProduct) {
      Alert.alert(
        "DuckSmart Group Loading",
        "DuckSmart Group is still loading. Please wait a few seconds and try again."
      );

      await loadOfferings();
      return false;
    }

    if (!isSupportedDuckSmartGroupItem(packageOrProduct)) {
      Alert.alert(
        "DuckSmart Group Error",
        "The DuckSmart Group product is not supported in this build."
      );
      return false;
    }

    try {
      const result = await purchaseRevenueCatItem(packageOrProduct);

      if (!result) {
        Alert.alert(
          "Purchase Unavailable",
          "Could not start the DuckSmart Group purchase right now."
        );
        return false;
      }

      const customerInfo = result?.customerInfo || result;
      const active = hasPro(customerInfo);
      const nextPartyAccess = await refreshPartyAccess();

      updateProState(active, nextPartyAccess);

      if (active) {
        logProUpgrade(auth.currentUser?.uid);
      }

      return true;
    } catch (err) {
      if (err?.userCancelled) return false;

      console.error("DuckSmart: DuckSmart Group purchase error:", err.message);
      Alert.alert(
        "DuckSmart Group Failed",
        err.message || "Could not complete the DuckSmart Group purchase."
      );
      return false;
    }
  }, [
    ducksmartGroupPackage,
    loadOfferings,
    refreshPartyAccess,
    updateProState,
  ]);

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
      console.log("DUCKSMART RC RESTORE CUSTOMER INFO:", JSON.stringify(customerInfo, null, 2));

      const active = hasPro(customerInfo);
      const nextPartyAccess = await refreshPartyAccess();
      const partyActive = hasActivePartyAccess(nextPartyAccess);

      updateProState(active, nextPartyAccess);

      if (active) {
        Alert.alert("Restored!", "Your Pro subscription has been restored.");
      } else if (partyActive) {
        Alert.alert("Access Active", "Your Hunting Party access is active.");
      } else {
        Alert.alert(
          "No Subscription Found",
          "We couldn't find an active Pro subscription for this account."
        );
      }

      return DEV_FORCE_PRO || active || partyActive;
    } catch (err) {
      console.error("DuckSmart: Restore error:", err.message);
      Alert.alert("Restore Failed", "Could not restore purchases. Please try again.");
      return false;
    }
  }, [refreshPartyAccess, updateProState]);

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

  const getDuckSmartGroupPrice = useCallback(() => {
    return getPriceString(ducksmartGroupPackage, FALLBACK_DUCKSMART_GROUP_PRICE);
  }, [ducksmartGroupPackage]);

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

        revenueCatIsPro,
        partyAccess,
        refreshPartyAccess,

        purchaseDuckSmartGroup,
        getDuckSmartGroupPrice,
        ducksmartGroupPackage,
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