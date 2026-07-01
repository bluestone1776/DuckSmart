// DuckSmart — Settings Modal
//
// Full-screen modal with: Subscription, Weather Alerts, Hunting License,
// Feedback form, App info, and Logout.
// Triggered by the gear button on any screen.

import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  Modal,
  Pressable,
  TextInput,
  ScrollView,
  Alert,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Image,
  ActivityIndicator,
  Linking,
} from "react-native";
import { WebView } from "react-native-webview";
import * as StoreReview from "expo-store-review";
import * as ImagePicker from "expo-image-picker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useNavigation } from "@react-navigation/native";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";

import { COLORS } from "../constants/theme";
import { submitFeedback } from "../services/feedback";
import { isAdminUnlockText, verifyCurrentAdmin } from "../services/adminLogin";
import { useAuth } from "../context/AuthContext";
import { usePremium } from "../context/PremiumContext";
import { logFeedbackSubmitted } from "../services/analytics";
import { storage } from "../services/firebase";
import { loadUserProfile } from "../services/profile";
import {
  loadWeatherAlertSettings as loadSavedWeatherAlertSettings,
  requestNotificationPermissions,
  saveWeatherAlertSettingsForUser,
  loadHuntingPartyRequestNotificationSetting,
  saveHuntingPartyRequestNotificationSettingForUser,
} from "../services/notifications";

const CATEGORIES = ["Bug", "Feature Request", "Question", "Other"];

const GOLD = "#D9A84C";
const RED = "#FF4D4D";
const BG = "#05090A";
const CARD = "rgba(13,18,19,0.96)";
const CARD_SOFT = "rgba(255,255,255,0.045)";
const BORDER = "rgba(255,255,255,0.08)";
const GOLD_BORDER = "rgba(217,168,76,0.34)";
const MUTED = "rgba(255,255,255,0.62)";
const MUTED_DARK = "rgba(255,255,255,0.42)";

const SETTINGS_RATE_PROMPT_SEEN_KEY = "@ducksmart_settings_rate_prompt_seen_v1";
const STATE_REGS_STORAGE_PATH = "state_regs.json";
const FLYING_DUCKS_IMAGE = require("../assets/flying_ducks.png");

const HISTORY_SEASON_STATE_KEY = "@ducksmart_history_season_state_v1";

function getDefaultSeasonStartTimestamp() {
  const now = new Date();
  const seasonStartYear = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  return new Date(seasonStartYear, 8, 1, 0, 0, 0, 0).getTime();
}

function createDefaultSeasonState() {
  return {
    currentSeasonStart: getDefaultSeasonStartTimestamp(),
    lastSeasonStart: null,
    lastSeasonClosedAt: null,
    undo: null,
  };
}

function normalizeSeasonState(value) {
  const fallback = createDefaultSeasonState();

  if (!value || typeof value !== "object") return fallback;

  return {
    currentSeasonStart:
      Number.isFinite(Number(value.currentSeasonStart))
        ? Number(value.currentSeasonStart)
        : fallback.currentSeasonStart,
    lastSeasonStart:
      Number.isFinite(Number(value.lastSeasonStart))
        ? Number(value.lastSeasonStart)
        : null,
    lastSeasonClosedAt:
      Number.isFinite(Number(value.lastSeasonClosedAt))
        ? Number(value.lastSeasonClosedAt)
        : null,
    undo:
      value.undo && typeof value.undo === "object"
        ? normalizeSeasonState({ ...value.undo, undo: null })
        : null,
  };
}

function getLogDate(log) {
  const raw = log?.dateTime || log?.createdAt || Date.now();
  const date = typeof raw === "number" ? new Date(raw) : new Date(raw);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function getLogTimestamp(log) {
  return getLogDate(log).getTime();
}

function isCurrentSeasonLog(log, seasonState) {
  return getLogTimestamp(log) >= Number(seasonState.currentSeasonStart || 0);
}

function getSupportNotificationId(notification) {
  return String(
    notification?.id ||
      notification?.relatedId ||
      notification?.feedbackId ||
      notification?.createdAt ||
      ""
  ).trim();
}

const DEFAULT_WEATHER_ALERT_SETTINGS = {
  freezeWarning: false,
  pressureDrop: false,
  pressureRise: false,
  coldFront: false,
  perfectStorm: false,
};

const WEATHER_ALERT_OPTIONS = [
  {
    key: "freezeWarning",
    title: "Freeze Warning",
    subtitle: "Alert when temperatures are near or below freezing.",
  },
  {
    key: "pressureDrop",
    title: "Barometric Pressure Drop",
    subtitle: "Alert when pressure drops sharply over the next 24 hours.",
  },
  {
    key: "pressureRise",
    title: "Barometric Pressure Rise",
    subtitle: "Alert when pressure rises sharply over the next 24 hours.",
  },
  {
    key: "coldFront",
    title: "Cold Front",
    subtitle: "Alert when a temperature drop and wind shift suggest a front.",
  },
  {
    key: "perfectStorm",
    title: "Perfect Storm",
    subtitle: "Alert when cold front, north wind, clouds/rain, and temp drop line up.",
  },
];

function getLicenseStorageRef(uid) {
  return ref(storage, `users/${uid}/hunting_license/license.jpg`);
}

function withCacheBuster(url) {
  if (!url) return null;
  return `${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`;
}

function getDisplayName(profile, user) {
  return (
    profile?.displayName ||
    user?.displayName ||
    user?.email?.split("@")?.[0] ||
    "DuckSmart User"
  );
}

function getDisplayHandle(profile, user) {
  if (profile?.duckIdLower) return `@${profile.duckIdLower}`;
  if (profile?.duckId) return `@${profile.duckId}`;
  return user?.email || "Tap to manage account";
}

function getProfilePhoto(profile, user) {
  return profile?.photoURL || user?.photoURL || null;
}

function getInitials(value) {
  const str = String(value || "D").trim();
  const parts = str.split(/\s+/).filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }

  return String(parts[0]?.[0] || "D").toUpperCase();
}

function normalizeStateRegsPayload(payload) {
  let entries = [];

  if (Array.isArray(payload)) {
    entries = payload.map((value, index) => [String(index), value]);
  } else if (Array.isArray(payload?.states)) {
    entries = payload.states.map((value, index) => [String(index), value]);
  } else if (Array.isArray(payload?.state_regs)) {
    entries = payload.state_regs.map((value, index) => [String(index), value]);
  } else if (payload && typeof payload === "object") {
    entries = Object.entries(payload);
  }

  return entries
    .map(([key, value]) => {
      if (typeof value === "string") {
        return {
          code: String(key || "").toUpperCase(),
          name: String(key || "").toUpperCase(),
          url: value,
        };
      }

      if (!value || typeof value !== "object") return null;

      const code = String(
        value.abbreviation ||
          value.abbr ||
          value.code ||
          value.stateCode ||
          value.state_code ||
          value.state ||
          key ||
          ""
      ).toUpperCase();

      const name = String(
        value.name ||
          value.stateName ||
          value.state_name ||
          value.label ||
          value.title ||
          code
      );

      const url =
        value.url ||
        value.link ||
        value.regulationsUrl ||
        value.regulations_url ||
        value.href ||
        value.pdf ||
        value.website;

      if (!code || !url) return null;

      return {
        code,
        name,
        url,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.code.localeCompare(b.code));
}

async function uploadLicensePhotoToFirebase({ uid, sourceUri }) {
  if (!uid) {
    throw new Error("You must be signed in to save a hunting license photo.");
  }

  if (!sourceUri) {
    throw new Error("No image was selected.");
  }

  const response = await fetch(sourceUri);
  const blob = await response.blob();

  const licenseRef = getLicenseStorageRef(uid);

  await uploadBytes(licenseRef, blob, {
    contentType: "image/jpeg",
  });

  const downloadUrl = await getDownloadURL(licenseRef);
  return withCacheBuster(downloadUrl);
}

async function loadLicensePhotoFromFirebase(uid) {
  if (!uid) return null;

  try {
    const downloadUrl = await getDownloadURL(getLicenseStorageRef(uid));
    return withCacheBuster(downloadUrl);
  } catch (err) {
    if (err?.code === "storage/object-not-found") {
      return null;
    }

    throw err;
  }
}

async function removeLicensePhotoFromFirebase(uid) {
  if (!uid) {
    throw new Error("You must be signed in to remove a hunting license photo.");
  }

  try {
    await deleteObject(getLicenseStorageRef(uid));
  } catch (err) {
    if (err?.code !== "storage/object-not-found") {
      throw err;
    }
  }
}

export default function SettingsModal({
  visible,
  onClose,
  onLogout,
  logs = [],
  pins = [],
  setPins,
  dogs = [],
  supportMessageNotification = null,
  onOpenSupportMessage,
  refreshSupportNotifications,
}) {
  const navigation = useNavigation();
  const { deleteAccount, user } = useAuth();
  const {
    isPro,
    purchase,
    restore,
    redeemOfferCode,
    getMonthlyPrice,
    getAnnualPrice,
    monthlyPackage,
    annualPackage,
  } = usePremium();

  const [feedbackMsg, setFeedbackMsg] = useState("");
  const [category, setCategory] = useState("Bug");
  const [submitting, setSubmitting] = useState(false);

  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);

  const [licenseUri, setLicenseUri] = useState(null);
  const [licenseLoading, setLicenseLoading] = useState(false);
  const [licenseViewer, setLicenseViewer] = useState(false);

  const [stateRegsLoading, setStateRegsLoading] = useState(false);
  const [stateRegs, setStateRegs] = useState([]);
  const [stateRegsError, setStateRegsError] = useState("");
  const [selectedStateCode, setSelectedStateCode] = useState("");
  const [selectedStateReg, setSelectedStateReg] = useState(null);
  const [statePickerVisible, setStatePickerVisible] = useState(false);
  const [regsWebViewVisible, setRegsWebViewVisible] = useState(false);

  const [weatherAlertSettings, setWeatherAlertSettings] = useState(DEFAULT_WEATHER_ALERT_SETTINGS);
  const [weatherAlertsLoaded, setWeatherAlertsLoaded] = useState(false);

  const [huntingPartyRequestsEnabled, setHuntingPartyRequestsEnabled] = useState(true);
  const [huntingPartyRequestsLoaded, setHuntingPartyRequestsLoaded] = useState(false);

  const [seasonState, setSeasonState] = useState(createDefaultSeasonState());
  const [seasonReady, setSeasonReady] = useState(false);

  const handledSupportNotificationIdsRef = useRef(new Set());
  const supportOpenTimerRef = useRef(null);

  useEffect(() => {
    if (!visible) return;

    if (typeof refreshSupportNotifications === "function") {
      refreshSupportNotifications();
    }
  }, [visible, refreshSupportNotifications]);

  useEffect(() => {
    if (!visible || !supportMessageNotification) return;

    const notificationId = getSupportNotificationId(supportMessageNotification);

    if (!notificationId) return;
    if (handledSupportNotificationIdsRef.current.has(notificationId)) return;

    handledSupportNotificationIdsRef.current.add(notificationId);

    clearTimeout(supportOpenTimerRef.current);

    supportOpenTimerRef.current = setTimeout(() => {
      if (typeof onOpenSupportMessage === "function") {
        onOpenSupportMessage(supportMessageNotification);
      }
    }, 250);

    return () => {
      clearTimeout(supportOpenTimerRef.current);
    };
  }, [visible, supportMessageNotification, onOpenSupportMessage]);

  const activeDogs = Array.isArray(dogs)
    ? dogs.filter((dog) => !dog?.deletedAt && dog?.active !== false)
    : [];

  const firstDog = activeDogs[0] || null;
  const firstDogPhoto =
    firstDog?.photoUri ||
    firstDog?.photoURL ||
    firstDog?.photoUrl ||
    firstDog?.imageUri ||
    firstDog?.imageUrl ||
    null;

  const dogNamesText = activeDogs
    .map((dog) => String(dog?.name || "").trim())
    .filter(Boolean)
    .join(", ");

  useEffect(() => {
    if (!visible) return;

    let cancelled = false;

    async function showFirstSettingsRatePrompt() {
      try {
        const alreadySeen = await AsyncStorage.getItem(SETTINGS_RATE_PROMPT_SEEN_KEY);

        if (alreadySeen || cancelled) return;

        await AsyncStorage.setItem(SETTINGS_RATE_PROMPT_SEEN_KEY, "true");

        setTimeout(() => {
          if (cancelled) return;

          Alert.alert(
            "Enjoying DuckSmart?",
            "A quick rating helps more hunters find the app.",
            [
              {
                text: "Not Now",
                style: "cancel",
              },
              {
                text: "Rate DuckSmart",
                onPress: requestDuckSmartReview,
              },
            ]
          );
        }, 700);
      } catch (err) {
        console.log("DuckSmart rate prompt error:", err);
      }
    }

    showFirstSettingsRatePrompt();

    return () => {
      cancelled = true;
    };
  }, [visible]);

  useEffect(() => {
    if (!visible) return;

    let mounted = true;

    async function loadSeasonState() {
      try {
        const raw = await AsyncStorage.getItem(HISTORY_SEASON_STATE_KEY);
        const parsed = raw ? JSON.parse(raw) : null;

        if (mounted) {
          setSeasonState(normalizeSeasonState(parsed));
        }
      } catch {
        if (mounted) {
          setSeasonState(createDefaultSeasonState());
        }
      } finally {
        if (mounted) {
          setSeasonReady(true);
        }
      }
    }

    loadSeasonState();

    return () => {
      mounted = false;
    };
  }, [visible]);

  useEffect(() => {
    if (!visible) return;

    let mounted = true;

    async function loadProfile() {
      if (!user?.uid) {
        setProfile(null);
        return;
      }

      setProfileLoading(true);

      try {
        const loaded = await loadUserProfile(user.uid);
        if (mounted) setProfile(loaded || null);
      } catch (err) {
        console.log("DuckSmart profile load error:", err?.message || err);
        if (mounted) setProfile(null);
      } finally {
        if (mounted) setProfileLoading(false);
      }
    }

    loadProfile();

    return () => {
      mounted = false;
    };
  }, [visible, user?.uid]);

  useEffect(() => {
    if (!visible) return;

    let mounted = true;

    async function loadLicense() {
      if (!user?.uid) {
        setLicenseUri(null);
        return;
      }

      setLicenseLoading(true);

      try {
        const url = await loadLicensePhotoFromFirebase(user.uid);
        if (mounted) setLicenseUri(url);
      } catch (err) {
        console.error("DuckSmart license photo load error:", err);
        if (mounted) setLicenseUri(null);
      } finally {
        if (mounted) setLicenseLoading(false);
      }
    }

    loadLicense();

    return () => {
      mounted = false;
    };
  }, [visible, user?.uid]);

  useEffect(() => {
    if (!visible) return;

    let mounted = true;

    (async () => {
      try {
        const savedSettings = await loadSavedWeatherAlertSettings(user?.uid);

        if (mounted) {
          setWeatherAlertSettings({
            ...DEFAULT_WEATHER_ALERT_SETTINGS,
            ...savedSettings,
          });
        }
      } catch {
        if (mounted) {
          setWeatherAlertSettings(DEFAULT_WEATHER_ALERT_SETTINGS);
        }
      } finally {
        if (mounted) {
          setWeatherAlertsLoaded(true);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, [visible, user?.uid]);

  useEffect(() => {
    if (!visible) return;

    let mounted = true;

    (async () => {
      try {
        const enabled = await loadHuntingPartyRequestNotificationSetting(user?.uid);

        if (mounted) {
          setHuntingPartyRequestsEnabled(!!enabled);
        }
      } catch {
        if (mounted) {
          setHuntingPartyRequestsEnabled(true);
        }
      } finally {
        if (mounted) {
          setHuntingPartyRequestsLoaded(true);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, [visible, user?.uid]);

  useEffect(() => {
    if (!visible) return;
    if (stateRegs.length || stateRegsLoading) return;

    loadStateRegulations();
  }, [visible]);

  async function requestDuckSmartReview() {
    try {
      const available = await StoreReview.isAvailableAsync();

      if (available) {
        await StoreReview.requestReview();
        return;
      }

      Alert.alert(
        "Ratings Unavailable Here",
        "The store rating prompt usually works in the production App Store or Google Play build, not every test environment."
      );
    } catch (err) {
      console.log("DuckSmart store review error:", err);
      Alert.alert(
        "Rating Unavailable",
        "The store rating prompt could not open right now. Please try again after installing the production version."
      );
    }
  }

  async function loadStateRegulations() {
    setStateRegsLoading(true);
    setStateRegsError("");

    try {
      const regsRef = ref(storage, STATE_REGS_STORAGE_PATH);
      const downloadUrl = await getDownloadURL(regsRef);
      const response = await fetch(downloadUrl);

      if (!response.ok) {
        throw new Error("Could not load state regulations.");
      }

      const payload = await response.json();
      const normalized = normalizeStateRegsPayload(payload);

      if (!normalized.length) {
        throw new Error("No state regulation links were found.");
      }

      setStateRegs(normalized);
    } catch (err) {
      console.error("DuckSmart state regulations load error:", err);
      setStateRegsError("Could not load state regulations. Please try again.");
    } finally {
      setStateRegsLoading(false);
    }
  }

  function openProfileScreen() {
    onClose?.();

    setTimeout(() => {
      try {
        navigation.navigate("ProfileScreen");
      } catch (err) {
        console.log("DuckSmart profile navigation error:", err?.message || err);
      }
    }, 150);
  }

  function openGroupScreen() {
    onClose?.();

    setTimeout(() => {
      try {
        navigation.navigate("GroupScreen");
      } catch (err) {
        console.log("DuckSmart group navigation error:", err?.message || err);
      }
    }, 150);
  }

  function openDogScreen() {
    onClose?.();

    setTimeout(() => {
      try {
        navigation.navigate("DogScreen");
      } catch (err) {
        console.log("DuckSmart dog navigation error:", err?.message || err);
      }
    }, 150);
  }

  async function openAdminReportsScreen() {
    try {
      await verifyCurrentAdmin();

      setFeedbackMsg("");
      setCategory("Bug");
      onClose?.();

      setTimeout(() => {
        try {
          navigation.navigate("AdminReportsScreen");
        } catch (err) {
          console.log("DuckSmart admin navigation error:", err?.message || err);
          Alert.alert("Admin Error", "Could not open the admin reports screen.");
        }
      }, 150);
    } catch (err) {
      Alert.alert(
        "Admin Access Denied",
        err?.message || "This account is not allowed to open the admin portal."
      );
    }
  }

  function handleSelectStateReg(code) {
    setSelectedStateCode(code);
    setStatePickerVisible(false);

    if (!code) {
      setSelectedStateReg(null);
      return;
    }

    const picked = stateRegs.find((item) => item.code === code);

    if (!picked?.url) {
      Alert.alert("Missing Link", "No regulation link was found for this state.");
      return;
    }

    setSelectedStateReg(picked);
    setRegsWebViewVisible(true);
  }

  async function saveWeatherAlertSettings(nextSettings) {
    setWeatherAlertSettings(nextSettings);

    try {
      await saveWeatherAlertSettingsForUser(user?.uid, nextSettings);
    } catch {
      Alert.alert("Settings Error", "Could not save alert settings. Please try again.");
    }
  }

  async function toggleWeatherAlert(key) {
    const turningOn = !weatherAlertSettings[key];

    if (turningOn) {
      const hasPermission = await requestNotificationPermissions();

      if (!hasPermission) {
        Alert.alert(
          "Notifications Off",
          "Please allow notifications for DuckSmart before enabling this alert."
        );
        return;
      }
    }

    const nextSettings = {
      ...weatherAlertSettings,
      [key]: !weatherAlertSettings[key],
    };

    await saveWeatherAlertSettings(nextSettings);
  }

  async function toggleHuntingPartyRequests() {
    const turningOn = !huntingPartyRequestsEnabled;

    if (turningOn) {
      const hasPermission = await requestNotificationPermissions();

      if (!hasPermission) {
        Alert.alert(
          "Notifications Off",
          "Please allow notifications for DuckSmart before enabling Hunting Party request alerts."
        );
        return;
      }
    }

    const nextValue = !huntingPartyRequestsEnabled;
    setHuntingPartyRequestsEnabled(nextValue);

    try {
      await saveHuntingPartyRequestNotificationSettingForUser(user?.uid, nextValue);
    } catch {
      setHuntingPartyRequestsEnabled(!nextValue);
      Alert.alert("Settings Error", "Could not save Hunting Party notification settings.");
    }
  }

  async function pickLicensePhoto(useCamera) {
    try {
      if (!user?.uid) {
        Alert.alert("Sign In Required", "Please sign in before saving a hunting license photo.");
        return;
      }

      let result;

      if (useCamera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();

        if (!perm.granted) {
          Alert.alert("Permission Needed", "Camera access is required to take a photo of your license.");
          return;
        }

        result = await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.8,
          allowsEditing: true,
        });
      } else {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();

        if (!perm.granted) {
          Alert.alert("Permission Needed", "Photo library access is required to select your license image.");
          return;
        }

        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.8,
          allowsEditing: true,
        });
      }

      if (result.canceled || !result.assets?.length) return;

      setLicenseLoading(true);

      const sourceUri = result.assets[0].uri;
      const savedUrl = await uploadLicensePhotoToFirebase({
        uid: user.uid,
        sourceUri,
      });

      setLicenseUri(savedUrl);
    } catch (err) {
      console.error("DuckSmart license photo save error:", err);
      Alert.alert(
        "Error",
        `Could not save the license photo.\n\n${err.message || "Please try again."}`
      );
    } finally {
      setLicenseLoading(false);
    }
  }

  function handleAddLicense() {
    Alert.alert("Add Hunting License", "Take a photo or choose from your gallery.", [
      { text: "Camera", onPress: () => pickLicensePhoto(true) },
      { text: "Gallery", onPress: () => pickLicensePhoto(false) },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  function handleRemoveLicense() {
    Alert.alert("Remove License Photo?", "This will delete the saved image from your DuckSmart account.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          try {
            setLicenseLoading(true);
            await removeLicensePhotoFromFirebase(user?.uid);
            setLicenseUri(null);
            setLicenseViewer(false);
          } catch (err) {
            console.error("DuckSmart license photo remove error:", err);
            Alert.alert("Error", "Could not remove the license photo.");
          } finally {
            setLicenseLoading(false);
          }
        },
      },
    ]);
  }

  async function saveSeasonState(nextState) {
    const normalized = normalizeSeasonState(nextState);
    setSeasonState(normalized);

    try {
      await AsyncStorage.setItem(HISTORY_SEASON_STATE_KEY, JSON.stringify(normalized));
    } catch {
      Alert.alert("Season Error", "Could not save the season change. Please try again.");
    }
  }

  function closeCurrentSeasonFromSettings() {
    const currentSeasonLogs = logs.filter((log) => isCurrentSeasonLog(log, seasonState));

    if (currentSeasonLogs.length === 0) {
      Alert.alert(
        "No Current Season Data",
        "There are no hunt logs in Current Season yet, so there is nothing to close."
      );
      return;
    }

    Alert.alert(
      "Close Current Season?",
      "Once the season is closed, Current Season will reset and the results from this season will move into Last Season.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Close Season",
          style: "destructive",
          onPress: async () => {
            const closedAt = Date.now();

            const nextState = {
              currentSeasonStart: closedAt,
              lastSeasonStart: seasonState.currentSeasonStart,
              lastSeasonClosedAt: closedAt,
              undo: {
                currentSeasonStart: seasonState.currentSeasonStart,
                lastSeasonStart: seasonState.lastSeasonStart,
                lastSeasonClosedAt: seasonState.lastSeasonClosedAt,
              },
            };

            const currentSeasonPinIds = new Set(
              currentSeasonLogs
                .map((log) => log.pinId)
                .filter(Boolean)
            );

            if (typeof setPins === "function" && currentSeasonPinIds.size > 0) {
              setPins((prevPins) =>
                prevPins.map((pin) =>
                  currentSeasonPinIds.has(pin.id)
                    ? {
                        ...pin,
                        archivedAt: closedAt,
                        archivedSeason: "lastSeason",
                        archivedSeasonStart: seasonState.currentSeasonStart,
                        archivedSeasonClosedAt: closedAt,
                      }
                    : pin
                )
              );
            }

            await saveSeasonState(nextState);

            Alert.alert(
              "Season Closed",
              "Current Season has been reset. This season's logs now appear under Last Season."
            );
          },
        },
      ]
    );
  }

  async function handleSubmitFeedback() {
    const msg = feedbackMsg.trim();

    if (isAdminUnlockText(msg)) {
      openAdminReportsScreen();
      return;
    }

    if (!msg) {
      Alert.alert("Empty Feedback", "Please write something before submitting.");
      return;
    }

    setSubmitting(true);

    try {
      await submitFeedback({ message: msg, category });
      logFeedbackSubmitted(user?.uid, category);
      Alert.alert("Thanks!", "Your feedback has been submitted. We'll look into it.");
      setFeedbackMsg("");
      setCategory("Bug");
    } catch {
      Alert.alert("Error", "Could not submit feedback. Please try again later.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleLogout() {
    Alert.alert("Log Out", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log Out",
        style: "destructive",
        onPress: () => {
          onClose();
          onLogout();
        },
      },
    ]);
  }

  function handleDeleteAccount() {
    Alert.alert(
      "Delete Account",
      "This will permanently delete your account and all associated data (hunt logs, map pins, etc.). This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete Account",
          style: "destructive",
          onPress: () => {
            Alert.alert(
              "Are you sure?",
              "This is your last chance. Your account and all data will be permanently removed.",
              [
                { text: "Keep Account", style: "cancel" },
                {
                  text: "Delete Forever",
                  style: "destructive",
                  onPress: async () => {
                    try {
                      await deleteAccount();
                      onClose();
                    } catch {
                      // AuthContext handles user-facing error state.
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  }

  function renderWeatherAlertToggle(option) {
    const enabled = !!weatherAlertSettings[option.key];

    return (
      <Pressable
        key={option.key}
        style={ms.alertSettingRow}
        onPress={() => toggleWeatherAlert(option.key)}
        disabled={!weatherAlertsLoaded}
      >
        <View style={{ flex: 1 }}>
          <Text style={ms.alertSettingTitle}>{option.title}</Text>
          <Text style={ms.alertSettingSub}>{option.subtitle}</Text>
        </View>

        <View style={[ms.toggleTrack, enabled ? ms.toggleTrackOn : null]}>
          <View style={[ms.toggleKnob, enabled ? ms.toggleKnobOn : null]} />
        </View>
      </Pressable>
    );
  }

  const displayName = profileLoading ? "Loading profile..." : getDisplayName(profile, user);
  const displayHandle = getDisplayHandle(profile, user);
  const profilePhoto = getProfilePhoto(profile, user);

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={ms.safe}>
        <View style={ms.backdrop}>
          <ScrollView contentContainerStyle={ms.container} showsVerticalScrollIndicator={false}>
            <View style={ms.headerRow}>
              <View>
                <Text style={ms.headerKicker}>DUCKSMART</Text>
                <Text style={ms.headerTitle}>SETTINGS</Text>
              </View>

              <Pressable style={ms.closeBtn} onPress={onClose}>
                <Text style={ms.closeBtnText}>✕</Text>
              </Pressable>
            </View>

            <Pressable style={ms.accountCard} onPress={openProfileScreen}>
              {profilePhoto ? (
                <Image source={{ uri: profilePhoto }} style={ms.accountAvatar} resizeMode="cover" />
              ) : (
                <View style={ms.accountAvatarFallback}>
                  <Text style={ms.accountAvatarInitials}>{getInitials(displayName || user?.email)}</Text>
                </View>
              )}

              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={ms.accountLabel}>ACCOUNT</Text>
                <Text style={ms.accountName} numberOfLines={1}>
                  {displayName}
                </Text>
                <Text style={ms.accountEmail} numberOfLines={1}>
                  {displayHandle}
                </Text>
                <Text style={ms.accountHint}>Tap to manage profile and subscription</Text>
              </View>

              <View style={[ms.statusPill, isPro ? ms.statusPillPro : null]}>
                <Text style={[ms.statusPillText, isPro ? ms.statusPillTextPro : null]}>
                  {isPro ? "PRO" : "FREE"}
                </Text>
              </View>

              <Text style={ms.accountChevron}>›</Text>
            </Pressable>

            <Pressable style={ms.groupsCard} onPress={openGroupScreen}>
              <Image source={FLYING_DUCKS_IMAGE} style={ms.groupsImage} resizeMode="cover" />

              <View style={ms.groupsOverlay} />

              <View style={ms.groupsContent}>
                <View style={{ flex: 1 }}>
                  <Text style={ms.groupsKicker}>DUCKSMART COMMUNITY</Text>
                  <Text style={ms.groupsTitle}>Comms Check</Text>
                  <Text style={ms.groupsSub}>
                    View your DuckSmart ID, shared hunts, and future hunting groups.
                  </Text>
                </View>

                <View style={ms.groupsArrowCircle}>
                  <Text style={ms.groupsArrow}>›</Text>
                </View>
              </View>
            </Pressable>

            <Pressable style={ms.dogCard} onPress={openDogScreen}>
              {firstDogPhoto ? (
                <Image source={{ uri: firstDogPhoto }} style={ms.dogAvatar} resizeMode="cover" />
              ) : (
                <View style={ms.dogIconWrap}>
                  <Text style={ms.dogIcon}>🐾</Text>
                </View>
              )}

              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={ms.dogKicker}>DOG PORTAL</Text>
                <Text style={ms.dogTitle} numberOfLines={2}>
                  {activeDogs.length > 0
                    ? dogNamesText || "Manage Hunting Dogs"
                    : "Add Hunting Dog"}
                </Text>
                <Text style={ms.dogSub} numberOfLines={2}>
                  {activeDogs.length > 0
                    ? `${activeDogs.length} hunting dog${activeDogs.length === 1 ? "" : "s"} added. Track retrieves, birds recovered, and dog history.`
                    : "Add your hunting dog to unlock dog retrieve tracking inside Hunt Logs."}
                </Text>
              </View>

              <View style={ms.groupsArrowCircle}>
                <Text style={ms.groupsArrow}>›</Text>
              </View>
            </Pressable>

            {!isPro ? (
              <View style={ms.section}>
                <Text style={ms.sectionTitle}>Subscription</Text>

                <Text style={ms.sectionSub}>
                  Unlock animated radar, 48hr weather trends, extended forecasts,
                  unlimited map pins, all duck species, and an ad-free experience.
                </Text>

                <Pressable style={ms.upgradeBtn} onPress={() => purchase(annualPackage)}>
                  <Text style={ms.upgradeBtnText}>{`Yearly — ${getAnnualPrice()}/yr`}</Text>
                  <Text style={ms.upgradeBtnSub}>Best value — save 33%</Text>
                </Pressable>

                <Pressable style={ms.upgradeBtnSecondary} onPress={() => purchase(monthlyPackage)}>
                  <Text style={ms.upgradeBtnSecondaryText}>{`Monthly — ${getMonthlyPrice()}/mo`}</Text>
                </Pressable>

                <Pressable style={ms.restoreBtn} onPress={restore}>
                  <Text style={ms.restoreBtnText}>Restore Purchase</Text>
                </Pressable>

                {Platform.OS === "ios" ? (
                  <Pressable style={ms.offerCodeBtn} onPress={redeemOfferCode}>
                    <Text style={ms.offerCodeBtnText}>Redeem Pro Offer Code</Text>
                  </Pressable>
                ) : null}

                <View style={ms.legalRow}>
                  <Text
                    style={ms.legalLink}
                    onPress={() => Linking.openURL("https://mallardworks.io/privacy-policy")}
                  >
                    Privacy Policy
                  </Text>
                  <Text style={ms.legalSep}>|</Text>
                  <Text
                    style={ms.legalLink}
                    onPress={() => Linking.openURL("https://mallardworks.io/terms-%26-conditions")}
                  >
                    Terms of Use (EULA)
                  </Text>
                </View>
              </View>
            ) : null}

            <View style={ms.section}>
              <Text style={ms.sectionTitle}>Hunting Party Notifications</Text>
              <Text style={ms.sectionSub}>
                Choose whether DuckSmart should notify you when another user requests to add you to their Hunting Party.
              </Text>

              <Pressable
                style={ms.alertSettingRow}
                onPress={toggleHuntingPartyRequests}
                disabled={!huntingPartyRequestsLoaded}
              >
                <View style={{ flex: 1 }}>
                  <Text style={ms.alertSettingTitle}>Hunting Party Requests</Text>
                  <Text style={ms.alertSettingSub}>
                    Alert when another hunter sends you a Hunting Party request.
                  </Text>
                </View>

                <View style={[ms.toggleTrack, huntingPartyRequestsEnabled ? ms.toggleTrackOn : null]}>
                  <View style={[ms.toggleKnob, huntingPartyRequestsEnabled ? ms.toggleKnobOn : null]} />
                </View>
              </Pressable>
            </View>

            <View style={ms.section}>
              <Text style={ms.sectionTitle}>Weather Alerts</Text>
              <Text style={ms.sectionSub}>
                Choose which hunting weather conditions DuckSmart should watch for.
              </Text>

              {WEATHER_ALERT_OPTIONS.map(renderWeatherAlertToggle)}
            </View>

            <View style={ms.section}>
              <Text style={ms.sectionTitle}>Hunting License</Text>
              <Text style={ms.sectionSub}>
                Store a photo of your hunting license for quick access in the field.
              </Text>

              {licenseLoading ? (
                <ActivityIndicator color={GOLD} style={{ marginVertical: 16 }} />
              ) : licenseUri ? (
                <>
                  <Pressable onPress={() => setLicenseViewer(true)}>
                    <Image source={{ uri: licenseUri }} style={ms.licenseThumb} resizeMode="cover" />
                    <Text style={ms.licenseTapHint}>Tap to view full size</Text>
                  </Pressable>

                  <View style={ms.licenseButtonRow}>
                    <Pressable style={[ms.upgradeBtn, { flex: 1 }]} onPress={handleAddLicense}>
                      <Text style={ms.upgradeBtnText}>Replace Photo</Text>
                    </Pressable>

                    <Pressable style={[ms.deleteBtn, { flex: 1, marginTop: 0 }]} onPress={handleRemoveLicense}>
                      <Text style={ms.deleteBtnText}>Remove</Text>
                    </Pressable>
                  </View>
                </>
              ) : (
                <Pressable style={ms.licenseAddBtn} onPress={handleAddLicense}>
                  <Text style={ms.licenseAddIcon}>📄</Text>
                  <Text style={ms.licenseAddText}>Add License Photo</Text>
                  <Text style={ms.licenseAddSub}>Camera or Gallery</Text>
                </Pressable>
              )}
            </View>

            <View style={ms.section}>
              <Text style={ms.sectionTitle}>Hunting Regulations</Text>
              <Text style={ms.sectionSub}>
                Select a state abbreviation to open hunting regulations inside DuckSmart.
              </Text>

              {stateRegsLoading ? (
                <View style={ms.stateSelectButton}>
                  <ActivityIndicator color={GOLD} />
                </View>
              ) : (
                <Pressable
                  style={ms.stateSelectButton}
                  onPress={() => setStatePickerVisible(true)}
                >
                  <View style={{ flex: 1 }}>
                    <Text
                      style={
                        selectedStateCode
                          ? ms.stateSelectValue
                          : ms.stateSelectPlaceholder
                      }
                    >
                      {selectedStateCode || "Select State"}
                    </Text>

                    {selectedStateReg?.name ? (
                      <Text style={ms.stateSelectSub} numberOfLines={1}>
                        {selectedStateReg.name}
                      </Text>
                    ) : null}
                  </View>

                  <Text style={ms.stateSelectChevron}>⌄</Text>
                </Pressable>
              )}

              {stateRegsError ? (
                <View style={ms.regsErrorBox}>
                  <Text style={ms.regsErrorText}>{stateRegsError}</Text>
                  <Pressable style={ms.regsRetryBtn} onPress={loadStateRegulations}>
                    <Text style={ms.regsRetryText}>Try Again</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>

            <View style={ms.section}>
              <Text style={ms.sectionTitle}>Season Controls</Text>
              <Text style={ms.sectionSub}>
                Close Current Season when your season is over. Current Season resets and these results move to Last Season.
              </Text>

              <Pressable
                style={[
                  ms.upgradeBtn,
                  (!seasonReady || logs.length === 0) ? { opacity: 0.45 } : null,
                ]}
                onPress={closeCurrentSeasonFromSettings}
                disabled={!seasonReady || logs.length === 0}
              >
                <Text style={ms.upgradeBtnText}>Close Current Season</Text>
              </Pressable>
            </View>

            <Modal visible={licenseViewer} transparent={false} animationType="fade" onRequestClose={() => setLicenseViewer(false)}>
              <View style={ms.licenseViewerBg}>
                <Image source={{ uri: licenseUri }} style={ms.licenseViewerImage} resizeMode="contain" />
                <Pressable style={ms.licenseViewerClose} onPress={() => setLicenseViewer(false)}>
                  <Text style={ms.closeBtnText}>✕  Close</Text>
                </Pressable>
              </View>
            </Modal>

            <Modal
              visible={statePickerVisible}
              transparent
              animationType="fade"
              onRequestClose={() => setStatePickerVisible(false)}
            >
              <View style={ms.statePickerBackdrop}>
                <View style={ms.statePickerCard}>
                  <View style={ms.statePickerHeader}>
                    <View>
                      <Text style={ms.statePickerTitle}>Select State</Text>
                      <Text style={ms.statePickerSub}>Hunting regulations</Text>
                    </View>

                    <Pressable
                      style={ms.statePickerClose}
                      onPress={() => setStatePickerVisible(false)}
                    >
                      <Text style={ms.closeBtnText}>✕</Text>
                    </Pressable>
                  </View>

                  <ScrollView style={ms.stateList} showsVerticalScrollIndicator={false}>
                    {stateRegs.map((item) => (
                      <Pressable
                        key={`${item.code}-${item.url}`}
                        style={ms.stateRow}
                        onPress={() => handleSelectStateReg(item.code)}
                      >
                        <View style={ms.stateCodeBadge}>
                          <Text style={ms.stateCodeText}>{item.code}</Text>
                        </View>

                        <Text style={ms.stateNameText} numberOfLines={1}>
                          {item.name || item.code}
                        </Text>

                        <Text style={ms.stateRowChevron}>›</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              </View>
            </Modal>

            <Modal
              visible={regsWebViewVisible}
              transparent={false}
              animationType="slide"
              onRequestClose={() => setRegsWebViewVisible(false)}
            >
              <View style={ms.webViewBg}>
                <View style={ms.webViewHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={ms.headerKicker}>HUNTING REGULATIONS</Text>
                    <Text style={ms.webViewTitle} numberOfLines={1}>
                      {selectedStateReg?.code ? `${selectedStateReg.code} Regulations` : "State Regulations"}
                    </Text>
                  </View>

                  <Pressable style={ms.webViewCloseBtn} onPress={() => setRegsWebViewVisible(false)}>
                    <Text style={ms.webViewCloseText}>✕ Close</Text>
                  </Pressable>
                </View>

                {selectedStateReg?.url ? (
                  <WebView
                    source={{ uri: selectedStateReg.url }}
                    style={ms.webView}
                    originWhitelist={["*"]}
                    startInLoadingState
                    setSupportMultipleWindows={false}
                    javaScriptCanOpenWindowsAutomatically={false}
                    allowsBackForwardNavigationGestures
                    onShouldStartLoadWithRequest={() => true}
                    renderLoading={() => (
                      <View style={ms.webViewLoading}>
                        <ActivityIndicator color={GOLD} />
                        <Text style={ms.webViewLoadingText}>Loading regulations...</Text>
                      </View>
                    )}
                  />
                ) : (
                  <View style={ms.webViewLoading}>
                    <Text style={ms.regsErrorText}>No regulation link found.</Text>
                  </View>
                )}
              </View>
            </Modal>

            <View style={ms.section}>
              <Text style={ms.sectionTitle}>Send Feedback</Text>
              <Text style={ms.sectionSub}>
                Report a bug, suggest a feature, or ask a question. We read every message.
              </Text>

              {supportMessageNotification ? (
                <Pressable
                  style={ms.supportMessageCard}
                  onPress={() => {
                    if (typeof onOpenSupportMessage === "function") {
                      onOpenSupportMessage(supportMessageNotification);
                    }
                  }}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={ms.supportMessageKicker}>DUCKSMART ADMIN</Text>
                    <Text style={ms.supportMessageTitle} numberOfLines={1}>
                      {supportMessageNotification.title || "Admin replied"}
                    </Text>
                    <Text style={ms.supportMessageSub} numberOfLines={2}>
                      {supportMessageNotification.message || "Tap to view your support conversation."}
                    </Text>
                  </View>

                  <View style={ms.supportMessageBadge}>
                    <Text style={ms.supportMessageBadgeText}>OPEN</Text>
                  </View>

                  <Text style={ms.supportMessageArrow}>›</Text>
                </Pressable>
              ) : null}

              <Text style={ms.label}>Category</Text>
              <View style={ms.chipRow}>
                {CATEGORIES.map((cat) => (
                  <Pressable
                    key={cat}
                    onPress={() => setCategory(cat)}
                    style={[ms.chip, category === cat ? ms.chipSelected : ms.chipUnselected]}
                  >
                    <Text style={[ms.chipText, category === cat ? ms.chipTextSelected : null]}>
                      {cat}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={ms.label}>Message</Text>
              <TextInput
                value={feedbackMsg}
                onChangeText={setFeedbackMsg}
                placeholder="Describe the issue or suggestion..."
                placeholderTextColor="rgba(255,255,255,0.30)"
                style={ms.textArea}
                multiline
              />

              <Pressable
                style={[ms.submitBtn, submitting ? ms.submitBtnDisabled : null]}
                onPress={handleSubmitFeedback}
                disabled={submitting}
              >
                <Text style={ms.submitBtnText}>{submitting ? "Submitting..." : "Submit Feedback"}</Text>
              </Pressable>
            </View>

            <View style={ms.section}>
              <Text style={ms.sectionTitle}>About DuckSmart</Text>
              <Text style={ms.infoText}>Version 1.3.3</Text>
              <Text style={ms.infoText}>Built for duck hunters, by duck hunters.</Text>
              <Text style={ms.infoTextMuted}>
                Weather data provided by OpenWeatherMap. Prediction scores are estimates
                based on weather and environmental data — not guaranteed outcomes.
              </Text>
            </View>

            <Pressable style={ms.logoutBtn} onPress={handleLogout}>
              <Text style={ms.logoutBtnText}>Log Out</Text>
            </Pressable>

            <Pressable style={ms.deleteBtn} onPress={handleDeleteAccount}>
              <Text style={ms.deleteBtnText}>Delete Account</Text>
            </Pressable>

            <View style={{ height: 24 }} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const ms = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.72)",
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(5,9,10,0.96)",
  },
  container: {
    paddingHorizontal: 12,
    paddingTop: Platform.OS === "ios" ? 30 : 34,
    paddingBottom: 100,
  },
  supportMessageCard: {
    minHeight: 76,
    borderRadius: 15,
    backgroundColor: "rgba(217,168,76,0.12)",
    borderWidth: 1,
    borderColor: GOLD,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  supportMessageKicker: {
    color: GOLD,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
  },
  supportMessageTitle: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: "900",
    marginTop: 3,
  },
  supportMessageSub: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
    marginTop: 3,
  },
  supportMessageBadge: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: GOLD,
  },
  supportMessageBadgeText: {
    color: BG,
    fontSize: 10,
    fontWeight: "900",
  },
  supportMessageArrow: {
    color: GOLD,
    fontSize: 24,
    fontWeight: "900",
    marginLeft: -2,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  headerKicker: {
    color: GOLD,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  headerTitle: {
    color: COLORS.white,
    fontSize: 27,
    fontWeight: "900",
    letterSpacing: 0.3,
    marginTop: 1,
  },
  closeBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: CARD,
    alignItems: "center",
    justifyContent: "center",
  },
  closeBtnText: {
    color: COLORS.white,
    fontSize: 17,
    fontWeight: "900",
  },

  accountCard: {
    minHeight: 78,
    borderRadius: 17,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: GOLD_BORDER,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  accountAvatar: {
    width: 50,
    height: 50,
    borderRadius: 16,
    backgroundColor: BG,
    marginRight: 10,
  },
  accountAvatarFallback: {
    width: 50,
    height: 50,
    borderRadius: 16,
    backgroundColor: "rgba(217,168,76,0.12)",
    borderWidth: 1,
    borderColor: GOLD_BORDER,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  accountAvatarInitials: {
    color: GOLD,
    fontSize: 17,
    fontWeight: "900",
  },
  accountLabel: {
    color: MUTED_DARK,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
  accountName: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: "900",
    marginTop: 4,
  },
  accountEmail: {
    color: GOLD,
    fontSize: 12,
    fontWeight: "900",
    marginTop: 3,
  },
  accountHint: {
    color: MUTED_DARK,
    fontSize: 11,
    fontWeight: "700",
    marginTop: 3,
  },
  accountChevron: {
    color: GOLD,
    fontSize: 24,
    fontWeight: "900",
    marginLeft: 8,
  },

  groupsCard: {
    height: 112,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: GOLD_BORDER,
    marginBottom: 8,
  },
  groupsImage: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
  },
  groupsOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.48)",
  },
  groupsContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  groupsKicker: {
    color: GOLD,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
  groupsTitle: {
    color: COLORS.white,
    fontSize: 19,
    fontWeight: "900",
    marginTop: 3,
  },
  groupsSub: {
    color: "rgba(255,255,255,0.76)",
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 17,
    marginTop: 4,
    maxWidth: 260,
  },
  groupsArrowCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(217,168,76,0.16)",
    borderWidth: 1,
    borderColor: GOLD_BORDER,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 10,
  },
  groupsArrow: {
    color: GOLD,
    fontSize: 28,
    fontWeight: "900",
    marginTop: -2,
  },

  dogCard: {
    minHeight: 98,
    borderRadius: 18,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: GOLD_BORDER,
    marginBottom: 8,
    paddingHorizontal: 13,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
  },
  dogAvatar: {
    width: 58,
    height: 58,
    borderRadius: 18,
    backgroundColor: BG,
    borderWidth: 1,
    borderColor: GOLD_BORDER,
    marginRight: 11,
  },
  dogIconWrap: {
    width: 58,
    height: 58,
    borderRadius: 18,
    backgroundColor: "rgba(217,168,76,0.12)",
    borderWidth: 1,
    borderColor: GOLD_BORDER,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 11,
  },
  dogIcon: {
    fontSize: 29,
  },
  dogKicker: {
    color: GOLD,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
  dogTitle: {
    color: COLORS.white,
    fontSize: 18,
    fontWeight: "900",
    marginTop: 3,
  },
  dogSub: {
    color: "rgba(255,255,255,0.76)",
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 17,
    marginTop: 4,
  },

  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: CARD_SOFT,
  },
  statusPillPro: {
    borderColor: GOLD,
    backgroundColor: "rgba(217,168,76,0.12)",
  },
  statusPillText: {
    color: MUTED,
    fontSize: 11,
    fontWeight: "900",
  },
  statusPillTextPro: {
    color: GOLD,
  },

  section: {
    marginBottom: 8,
    padding: 11,
    borderRadius: 17,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
  },
  sectionTitle: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: "900",
    marginBottom: 5,
    letterSpacing: 0.2,
  },
  sectionSub: {
    color: MUTED,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
    marginBottom: 10,
  },

  label: {
    color: MUTED,
    fontSize: 11,
    fontWeight: "900",
    marginTop: 8,
    marginBottom: 7,
    letterSpacing: 0.4,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipSelected: {
    backgroundColor: "rgba(217,168,76,0.12)",
    borderColor: GOLD,
  },
  chipUnselected: {
    backgroundColor: CARD_SOFT,
    borderColor: BORDER,
  },
  chipText: {
    fontSize: 11,
    fontWeight: "800",
    color: "rgba(255,255,255,0.78)",
  },
  chipTextSelected: {
    color: GOLD,
    fontWeight: "900",
  },

  textArea: {
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 14,
    paddingHorizontal: 11,
    paddingVertical: 9,
    color: COLORS.white,
    fontWeight: "800",
    height: 96,
    textAlignVertical: "top",
  },

  submitBtn: {
    marginTop: 10,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: GOLD,
    alignItems: "center",
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  submitBtnText: {
    color: BG,
    fontWeight: "900",
    fontSize: 14,
  },

  infoText: {
    color: MUTED,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 4,
  },
  infoTextMuted: {
    color: MUTED_DARK,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 8,
    lineHeight: 17,
  },

  logoutBtn: {
    marginTop: 6,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,77,77,0.42)",
    alignItems: "center",
  },
  logoutBtnText: {
    color: RED,
    fontWeight: "900",
    fontSize: 14,
  },

  deleteBtn: {
    marginTop: 8,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.035)",
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: "center",
  },
  deleteBtnText: {
    color: MUTED_DARK,
    fontWeight: "900",
    fontSize: 13,
  },

  upgradeBtn: {
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: GOLD,
    alignItems: "center",
  },
  upgradeBtnText: {
    color: BG,
    fontWeight: "900",
    fontSize: 14,
  },
  upgradeBtnSub: {
    color: "rgba(5,9,10,0.72)",
    fontWeight: "800",
    fontSize: 11,
    marginTop: 2,
  },
  upgradeBtnSecondary: {
    marginTop: 8,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: CARD_SOFT,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: "center",
  },
  upgradeBtnSecondaryText: {
    color: COLORS.white,
    fontWeight: "900",
    fontSize: 14,
  },

  restoreBtn: {
    marginTop: 8,
    paddingVertical: 8,
    alignItems: "center",
  },
  restoreBtnText: {
    color: GOLD,
    fontWeight: "800",
    fontSize: 13,
  },
  offerCodeBtn: {
    marginTop: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: "rgba(217,168,76,0.12)",
    borderWidth: 1,
    borderColor: GOLD,
    alignItems: "center",
    justifyContent: "center",
  },
  offerCodeBtnText: {
    color: GOLD,
    fontWeight: "900",
    fontSize: 14,
    letterSpacing: 0.2,
  },

  legalRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 6,
    gap: 8,
  },
  legalLink: {
    color: MUTED,
    fontWeight: "700",
    fontSize: 12,
    textDecorationLine: "underline",
  },
  legalSep: {
    color: MUTED_DARK,
    fontSize: 12,
  },

  alertSettingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
  },
  alertSettingTitle: {
    color: COLORS.white,
    fontSize: 13,
    fontWeight: "900",
  },
  alertSettingSub: {
    color: MUTED_DARK,
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 15,
    marginTop: 3,
  },
  toggleTrack: {
    width: 46,
    height: 27,
    borderRadius: 999,
    backgroundColor: CARD_SOFT,
    borderWidth: 1,
    borderColor: BORDER,
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  toggleTrackOn: {
    backgroundColor: "rgba(217,168,76,0.15)",
    borderColor: GOLD,
  },
  toggleKnob: {
    width: 19,
    height: 19,
    borderRadius: 10,
    backgroundColor: MUTED_DARK,
  },
  toggleKnobOn: {
    backgroundColor: GOLD,
    alignSelf: "flex-end",
  },

  licenseThumb: {
    width: "100%",
    height: 190,
    borderRadius: 14,
    backgroundColor: BG,
    borderWidth: 1,
    borderColor: BORDER,
  },
  licenseTapHint: {
    color: MUTED_DARK,
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center",
    marginTop: 5,
  },
  licenseButtonRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
  },
  licenseAddBtn: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 22,
    borderRadius: 14,
    backgroundColor: CARD_SOFT,
    borderWidth: 1,
    borderColor: BORDER,
    borderStyle: "dashed",
  },
  licenseAddIcon: {
    fontSize: 26,
    marginBottom: 5,
  },
  licenseAddText: {
    color: COLORS.white,
    fontWeight: "900",
    fontSize: 14,
  },
  licenseAddSub: {
    color: MUTED_DARK,
    fontWeight: "700",
    fontSize: 12,
    marginTop: 3,
  },

  stateSelectButton: {
    minHeight: 56,
    borderRadius: 14,
    backgroundColor: CARD_SOFT,
    borderWidth: 1,
    borderColor: GOLD_BORDER,
    paddingHorizontal: 13,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  stateSelectPlaceholder: {
    color: MUTED,
    fontSize: 15,
    fontWeight: "900",
  },
  stateSelectValue: {
    color: COLORS.white,
    fontSize: 17,
    fontWeight: "900",
  },
  stateSelectSub: {
    color: MUTED_DARK,
    fontSize: 11,
    fontWeight: "800",
    marginTop: 2,
  },
  stateSelectChevron: {
    color: GOLD,
    fontSize: 24,
    fontWeight: "900",
    marginLeft: 10,
  },
  statePickerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.78)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  statePickerCard: {
    width: "100%",
    maxHeight: "78%",
    borderRadius: 19,
    backgroundColor: BG,
    borderWidth: 1,
    borderColor: GOLD_BORDER,
    padding: 13,
  },
  statePickerHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 11,
  },
  statePickerTitle: {
    color: COLORS.white,
    fontSize: 21,
    fontWeight: "900",
  },
  statePickerSub: {
    color: MUTED,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 2,
  },
  statePickerClose: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: "center",
    justifyContent: "center",
  },
  stateList: {
    maxHeight: 470,
  },
  stateRow: {
    minHeight: 56,
    borderRadius: 14,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 10,
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  stateCodeBadge: {
    width: 44,
    height: 34,
    borderRadius: 12,
    backgroundColor: "rgba(217,168,76,0.12)",
    borderWidth: 1,
    borderColor: GOLD_BORDER,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  stateCodeText: {
    color: GOLD,
    fontSize: 14,
    fontWeight: "900",
  },
  stateNameText: {
    flex: 1,
    color: COLORS.white,
    fontSize: 14,
    fontWeight: "900",
  },
  stateRowChevron: {
    color: GOLD,
    fontSize: 24,
    fontWeight: "900",
    marginLeft: 8,
  },

  regsErrorBox: {
    marginTop: 8,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,77,77,0.35)",
    backgroundColor: "rgba(255,77,77,0.07)",
  },
  regsErrorText: {
    color: RED,
    fontSize: 12,
    fontWeight: "800",
    textAlign: "center",
    lineHeight: 17,
  },
  regsRetryBtn: {
    marginTop: 8,
    alignItems: "center",
  },
  regsRetryText: {
    color: GOLD,
    fontSize: 12,
    fontWeight: "900",
  },

  licenseViewerBg: {
    flex: 1,
    backgroundColor: COLORS.black,
    alignItems: "center",
    justifyContent: "center",
    padding: 14,
  },
  licenseViewerImage: {
    width: "100%",
    height: "75%",
    borderRadius: 14,
  },
  licenseViewerClose: {
    marginTop: 18,
    paddingVertical: 13,
    paddingHorizontal: 36,
    borderRadius: 14,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
  },

  webViewBg: {
    flex: 1,
    backgroundColor: BG,
  },
  webViewHeader: {
    paddingTop: Platform.OS === "ios" ? 100 : 108,
    paddingHorizontal: 12,
    paddingBottom: 10,
    backgroundColor: CARD,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  webViewTitle: {
    color: COLORS.white,
    fontSize: 20,
    fontWeight: "900",
    marginTop: 2,
  },
  webViewCloseBtn: {
    paddingVertical: 10,
    paddingHorizontal: 13,
    borderRadius: 13,
    backgroundColor: CARD_SOFT,
    borderWidth: 1,
    borderColor: BORDER,
  },
  webViewCloseText: {
    color: COLORS.white,
    fontSize: 13,
    fontWeight: "900",
  },
  webView: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  webViewLoading: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: BG,
  },
  webViewLoadingText: {
    color: MUTED,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 10,
  },
});