// DuckSmart — Profile Screen
//
// Simple account/profile screen opened from Settings.
// Shows editable user info, profile photo, DuckSmart ID, current subscription summary,
// and onX GPX import tools.

import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  ScrollView,
  StatusBar,
  StyleSheet,
  Image,
  Alert,
  ActivityIndicator,
  Platform,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { useNavigation } from "@react-navigation/native";

import { COLORS } from "../constants/theme";
import { useAuth } from "../context/AuthContext";
import { usePremium } from "../context/PremiumContext";
import {
  createOrUpdateUserProfile,
  loadUserProfile,
  uploadProfilePhoto,
} from "../services/profile";
import {
  getOnXImportSummaryText,
  mergeOnXImportedPins,
  pickAndParseOnXGpxFile,
} from "../services/onx_import";

const GOLD = "#D9A84C";
const BG = "#05090A";
const CARD = "rgba(13,18,19,0.96)";
const CARD_SOFT = "rgba(255,255,255,0.045)";
const BORDER = "rgba(255,255,255,0.08)";
const GOLD_BORDER = "rgba(217,168,76,0.34)";
const MUTED = "rgba(255,255,255,0.62)";
const MUTED_DARK = "rgba(255,255,255,0.42)";

function cleanDuckId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "")
    .replace(/^[._-]+|[._-]+$/g, "");
}

function getDisplayName(profile, user) {
  return (
    profile?.displayName ||
    user?.displayName ||
    user?.email?.split("@")?.[0] ||
    "DuckSmart User"
  );
}

function getDuckId(profile) {
  return profile?.duckIdLower || profile?.duckId || "";
}

function getPhotoURL(profile, user) {
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

function pluralize(count, singular, plural = `${singular}s`) {
  return Number(count) === 1 ? singular : plural;
}

function openSubscriptionManager() {
  const url =
    Platform.OS === "ios"
      ? "itms-apps://apps.apple.com/account/subscriptions"
      : "https://play.google.com/store/account/subscriptions";

  Linking.openURL(url).catch(() => {
    Alert.alert(
      "Subscription Settings",
      "Open your App Store or Google Play account subscriptions to manage or cancel your plan."
    );
  });
}

async function loadOrCreateProfileWithDuckId(user) {
  let loadedProfile = await loadUserProfile(user.uid);

  const existingDuckId = getDuckId(loadedProfile);

  if (existingDuckId) {
    return loadedProfile;
  }

  const createdProfile = await createOrUpdateUserProfile({
    uid: user.uid,
    email: user.email || "",
    displayName: getDisplayName(loadedProfile, user),
    photoURL: getPhotoURL(loadedProfile, user),
    provider: "profile_migration",
  });

  const createdDuckId = getDuckId(createdProfile);

  if (!createdDuckId) {
    throw new Error("Could not assign a DuckSmart ID.");
  }

  return createdProfile;
}

export default function ProfileScreen({
  openSettings,
  pins = [],
  setPins,
}) {
  const navigation = useNavigation();
  const { user } = useAuth();
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

  const [profile, setProfile] = useState(null);
  const [displayName, setDisplayName] = useState("");
  const [savedDuckId, setSavedDuckId] = useState("");
  const [duckIdDraft, setDuckIdDraft] = useState("");
  const [photoURL, setPhotoURL] = useState(null);

  const [loading, setLoading] = useState(true);
  const [setupError, setSetupError] = useState("");
  const [saving, setSaving] = useState(false);
  const [importingOnX, setImportingOnX] = useState(false);

  function handleBackPress() {
    if (typeof openSettings === "function") {
      navigation.navigate("Today");

      setTimeout(() => {
        openSettings();
      }, 150);

      return;
    }

    navigation.goBack();
  }

  useEffect(() => {
    let mounted = true;

    async function loadProfile() {
      if (!user?.uid) {
        setLoading(false);
        setSetupError("You must be signed in to manage your profile.");
        return;
      }

      setLoading(true);
      setSetupError("");

      try {
        const loadedProfile = await loadOrCreateProfileWithDuckId(user);

        if (!mounted) return;

        const nextName = getDisplayName(loadedProfile, user);
        const nextDuckId = getDuckId(loadedProfile);
        const nextPhotoURL = getPhotoURL(loadedProfile, user);

        if (!nextDuckId) {
          throw new Error("DuckSmart ID was not assigned.");
        }

        setProfile(loadedProfile || null);
        setDisplayName(nextName);
        setSavedDuckId(nextDuckId);
        setDuckIdDraft(nextDuckId);
        setPhotoURL(nextPhotoURL);
      } catch (err) {
        console.log("DuckSmart profile setup error:", err?.message || err);

        if (mounted) {
          setSetupError(
            err?.message ||
              "Could not finish setting up your DuckSmart profile."
          );
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadProfile();

    return () => {
      mounted = false;
    };
  }, [user?.uid]);

  async function handleRetrySetup() {
    if (!user?.uid) return;

    setLoading(true);
    setSetupError("");

    try {
      const loadedProfile = await loadOrCreateProfileWithDuckId(user);

      const nextName = getDisplayName(loadedProfile, user);
      const nextDuckId = getDuckId(loadedProfile);
      const nextPhotoURL = getPhotoURL(loadedProfile, user);

      if (!nextDuckId) {
        throw new Error("DuckSmart ID was not assigned.");
      }

      setProfile(loadedProfile || null);
      setDisplayName(nextName);
      setSavedDuckId(nextDuckId);
      setDuckIdDraft(nextDuckId);
      setPhotoURL(nextPhotoURL);
    } catch (err) {
      setSetupError(
        err?.message || "Could not finish setting up your DuckSmart profile."
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveProfile() {
    if (!user?.uid || saving) return;

    const safeName = String(displayName || "").trim();
    const safeDuckId = cleanDuckId(duckIdDraft);

    if (!safeName) {
      Alert.alert("Missing Name", "Please enter your name.");
      return;
    }

    if (!safeDuckId || safeDuckId.length < 3) {
      Alert.alert("DuckSmart ID", "Your DuckSmart ID must be at least 3 characters.");
      return;
    }

    try {
      setSaving(true);

      const saved = await createOrUpdateUserProfile({
        uid: user.uid,
        email: user.email || "",
        displayName: safeName,
        duckId: safeDuckId,
        photoURL,
        provider: "profile",
      });

      const savedId = getDuckId(saved);

      if (!savedId) {
        throw new Error("DuckSmart ID was not saved.");
      }

      setProfile(saved || null);
      setDisplayName(saved?.displayName || safeName);
      setSavedDuckId(savedId);
      setDuckIdDraft(savedId);
      setPhotoURL(saved?.photoURL || photoURL || null);

      Alert.alert("Saved", "Your DuckSmart profile has been updated.");
    } catch (err) {
      console.error("DuckSmart profile save error:", err);
      Alert.alert(
        "Profile Error",
        err?.message || "Could not save your profile. That DuckSmart ID may already be taken."
      );
    } finally {
      setSaving(false);
    }
  }

  function handleChangePhoto() {
    Alert.alert("Update Profile Photo", "Take a new photo or choose one from your phone.", [
      {
        text: "Camera",
        onPress: () => pickAndUploadProfilePhoto("camera"),
      },
      {
        text: "Photo Library",
        onPress: () => pickAndUploadProfilePhoto("library"),
      },
      {
        text: "Cancel",
        style: "cancel",
      },
    ]);
  }

  async function pickAndUploadProfilePhoto(source) {
    if (!user?.uid || saving) return;

    try {
      let result;

      if (source === "camera") {
        const perm = await ImagePicker.requestCameraPermissionsAsync();

        if (!perm.granted) {
          Alert.alert("Camera Permission Needed", "Please allow camera access to take a profile photo.");
          return;
        }

        result = await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.82,
        });
      } else {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();

        if (!perm.granted) {
          Alert.alert("Photo Permission Needed", "Please allow photo access to choose a profile picture.");
          return;
        }

        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.82,
        });
      }

      if (result.canceled || !result.assets?.length) return;

      setSaving(true);

      const uploaded = await uploadProfilePhoto({
        uid: user.uid,
        sourceUri: result.assets[0].uri,
      });

      const nextPhotoURL =
        uploaded?.photoURL ||
        uploaded?.downloadUrl ||
        uploaded?.url ||
        null;

      if (!nextPhotoURL) {
        throw new Error("Profile photo uploaded, but no URL was returned.");
      }

      const safeName =
        String(displayName || "").trim() || getDisplayName(profile, user);

      const safeDuckId = savedDuckId || getDuckId(profile);

      if (!safeDuckId) {
        throw new Error("DuckSmart ID was not loaded.");
      }

      const saved = await createOrUpdateUserProfile({
        uid: user.uid,
        email: user.email || "",
        displayName: safeName,
        duckId: safeDuckId,
        photoURL: nextPhotoURL,
        provider: "profile",
      });

      const savedId = getDuckId(saved);

      if (!savedId) {
        throw new Error("DuckSmart ID was not saved.");
      }

      setProfile(saved || null);
      setPhotoURL(nextPhotoURL);
      setDisplayName(saved?.displayName || safeName);
      setSavedDuckId(savedId);
      setDuckIdDraft(savedId);
    } catch (err) {
      console.error("DuckSmart profile photo error:", err);
      Alert.alert("Photo Error", err?.message || "Could not update your profile photo.");
    } finally {
      setSaving(false);
    }
  }

  async function handleImportOnXData() {
    if (importingOnX) return;

    if (typeof setPins !== "function") {
      Alert.alert(
        "Import Not Ready",
        "The profile screen still needs to receive map pin storage from App.js before onX imports can be saved."
      );
      return;
    }

    try {
      setImportingOnX(true);

      const result = await pickAndParseOnXGpxFile();

      if (result?.canceled) {
        return;
      }

      const importedMapItems = Array.isArray(result?.allPins)
        ? result.allPins
        : [
            ...(Array.isArray(result?.pins) ? result.pins : []),
            ...(Array.isArray(result?.pathPins) ? result.pathPins : []),
          ];

      if (importedMapItems.length === 0) {
        Alert.alert(
          "No onX Data Found",
          "No pins or paths were found in this GPX file."
        );
        return;
      }

      const currentPins = Array.isArray(pins) ? pins : [];
      const mergedPins = mergeOnXImportedPins(currentPins, importedMapItems);
      const addedCount = Math.max(0, mergedPins.length - currentPins.length);

      setPins(mergedPins);

      const summaryText = getOnXImportSummaryText(result);

      if (addedCount <= 0) {
        Alert.alert(
          "Already Imported",
          "These onX pins and paths already appear to be saved on your DuckSmart map."
        );
        return;
      }

      Alert.alert(
        "onX Import Complete",
        `${summaryText}\n\nAdded ${addedCount} new ${pluralize(
          addedCount,
          "map item"
        )} to your DuckSmart map.`
      );
    } catch (err) {
      console.error("DuckSmart onX import error:", err);
      Alert.alert(
        "onX Import Failed",
        err?.message || "Could not import this onX GPX file."
      );
    } finally {
      setImportingOnX(false);
    }
  }

  function openPartyScreen() {
    navigation.navigate("PartyScreen");
  }

  const planName = isPro ? "DuckSmart Pro" : "Free Account";
  const planSub = isPro
    ? "Your Pro subscription is active."
    : "Upgrade to unlock Pro features.";

  const profileReady = !!user?.uid && !!savedDuckId && !loading && !setupError;
  const duckIdChanged = cleanDuckId(duckIdDraft) !== cleanDuckId(savedDuckId);

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" />

      <ScrollView contentContainerStyle={s.container} showsVerticalScrollIndicator={false}>
        <View style={s.headerRow}>
          <Pressable style={s.backBtn} onPress={handleBackPress}>
            <Text style={s.backBtnText}>‹</Text>
          </Pressable>

          <View style={{ flex: 1 }}>
            <Text style={s.headerKicker}>DUCKSMART</Text>
            <Text style={s.headerTitle}>PROFILE</Text>
          </View>
        </View>

        {loading ? (
          <View style={s.loadingCard}>
            <ActivityIndicator color={GOLD} />
            <Text style={s.loadingText}>Loading profile...</Text>
          </View>
        ) : setupError ? (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Profile Setup Issue</Text>
            <Text style={s.sectionSub}>
              {setupError}
            </Text>

            <Pressable style={s.primaryBtn} onPress={handleRetrySetup}>
              <Text style={s.primaryBtnText}>Retry</Text>
            </Pressable>
          </View>
        ) : profileReady ? (
          <>
            <View style={s.heroCard}>
              <Pressable style={s.avatarWrap} onPress={handleChangePhoto} disabled={saving}>
                {photoURL ? (
                  <Image source={{ uri: photoURL }} style={s.avatar} resizeMode="cover" />
                ) : (
                  <View style={s.avatarFallback}>
                    <Text style={s.avatarInitials}>{getInitials(displayName || user?.email)}</Text>
                  </View>
                )}

                <View style={s.avatarBadge}>
                  <Text style={s.avatarBadgeText}>✎</Text>
                </View>
              </Pressable>

              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.heroName} numberOfLines={1}>
                  {displayName}
                </Text>

                <Text style={s.heroHandle} numberOfLines={1}>
                  @{savedDuckId}
                </Text>

                <Text style={s.heroEmail} numberOfLines={1}>
                  {user?.email || "No email on file"}
                </Text>
              </View>

              <View style={[s.statusPill, isPro ? s.statusPillPro : null]}>
                <Text style={[s.statusPillText, isPro ? s.statusPillTextPro : null]}>
                  {isPro ? "PRO" : "FREE"}
                </Text>
              </View>
            </View>

            <View style={s.section}>
              <Text style={s.sectionTitle}>Personal Info</Text>
              <Text style={s.sectionSub}>
                This is the profile other DuckSmart users will search for when sharing hunts, pins, and future group access.
              </Text>

              <Pressable
                style={[s.photoButton, saving ? s.disabledBtn : null]}
                onPress={handleChangePhoto}
                disabled={saving}
              >
                <Text style={s.photoButtonText}>
                  {saving ? "Updating..." : "Change Profile Photo"}
                </Text>
              </Pressable>

              <Text style={s.label}>Name</Text>
              <TextInput
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="Your name"
                placeholderTextColor="rgba(255,255,255,0.30)"
                style={s.input}
                autoCapitalize="words"
              />

              <Text style={s.label}>DuckSmart ID</Text>
              <TextInput
                value={duckIdDraft}
                onChangeText={(text) => setDuckIdDraft(cleanDuckId(text))}
                placeholder="example: mallard-472"
                placeholderTextColor="rgba(255,255,255,0.30)"
                style={s.input}
                autoCapitalize="none"
                autoCorrect={false}
              />

              <Text style={s.helperText}>
                Letters, numbers, periods, underscores, and dashes only. Your saved ID stays @{savedDuckId} until you tap Save Profile.
              </Text>

              {duckIdChanged ? (
                <Text style={s.pendingText}>
                  New ID pending: @{cleanDuckId(duckIdDraft) || "enter-id"}
                </Text>
              ) : null}

              <Pressable
                style={[s.primaryBtn, saving ? s.disabledBtn : null]}
                onPress={handleSaveProfile}
                disabled={saving}
              >
                <Text style={s.primaryBtnText}>{saving ? "Saving..." : "Save Profile"}</Text>
              </Pressable>
            </View>

            <View style={s.section}>
              <Text style={s.sectionTitle}>Import onX Data</Text>
              <Text style={s.sectionSub}>
                Import a GPX export from onX to add its pins and paths to your DuckSmart map.
              </Text>

              <View style={s.importCard}>
                <Text style={s.importTitle}>Supported Import</Text>
                <Text style={s.importText}>
                  onX GPX waypoints become DuckSmart pins. onX tracks and routes become mapped paths.
                </Text>
              </View>

              <Pressable
                style={[
                  s.secondaryBtnGold,
                  importingOnX ? s.disabledBtn : null,
                ]}
                onPress={handleImportOnXData}
                disabled={importingOnX}
              >
                {importingOnX ? (
                  <ActivityIndicator color={GOLD} />
                ) : (
                  <Text style={s.secondaryBtnGoldText}>Import onX GPX File</Text>
                )}
              </Pressable>

              <Text style={s.helperText}>
                Export your markups from onX as a GPX file, then choose that file here.
              </Text>
            </View>

            <View style={s.section}>
              <Text style={s.sectionTitle}>Subscription</Text>
              <Text style={s.sectionSub}>{planSub}</Text>

              <View style={s.planCard}>
                <View style={{ flex: 1 }}>
                  <Text style={s.planLabel}>CURRENT PLAN</Text>
                  <Text style={s.planName}>{planName}</Text>
                </View>

                <View style={[s.statusPill, isPro ? s.statusPillPro : null]}>
                  <Text style={[s.statusPillText, isPro ? s.statusPillTextPro : null]}>
                    {isPro ? "ACTIVE" : "FREE"}
                  </Text>
                </View>
              </View>

              {!isPro ? (
                <>
                  <Pressable style={s.upgradeBtn} onPress={() => purchase(annualPackage)}>
                    <Text style={s.upgradeBtnText}>{`Yearly — ${getAnnualPrice()}/yr`}</Text>
                    <Text style={s.upgradeBtnSub}>Best value — save 33%</Text>
                  </Pressable>

                  <Pressable style={s.secondaryBtn} onPress={() => purchase(monthlyPackage)}>
                    <Text style={s.secondaryBtnText}>{`Monthly — ${getMonthlyPrice()}/mo`}</Text>
                  </Pressable>
                </>
              ) : null}

              <Pressable style={s.secondaryBtn} onPress={restore}>
                <Text style={s.secondaryBtnText}>Restore Purchase</Text>
              </Pressable>

              <Pressable style={s.secondaryBtn} onPress={openSubscriptionManager}>
                <Text style={s.secondaryBtnText}>Manage / Cancel Subscription</Text>
              </Pressable>

              {Platform.OS === "ios" ? (
                <Pressable style={s.secondaryBtnGold} onPress={redeemOfferCode}>
                  <Text style={s.secondaryBtnGoldText}>Redeem Pro Offer Code</Text>
                </Pressable>
              ) : null}
            </View>

            <View style={s.section}>
              <Text style={s.sectionTitle}>Hunting Party</Text>
              <Text style={s.sectionSub}>
                Set up a lodge, club, or guide team with shared pins, shared hunt logs, invite codes, and hunter access.
              </Text>

              <View style={s.partyCard}>
                <Text style={s.partyTitle}>DuckSmart Group</Text>
                <Text style={s.partyText}>
                  Includes 5 hunters, shared pins, shared hunt logs, and group access tools.
                </Text>
              </View>

              <Pressable style={s.secondaryBtnGold} onPress={openPartyScreen}>
                <Text style={s.secondaryBtnGoldText}>Manage Hunting Party</Text>
              </Pressable>
            </View>
          </>
        ) : null}

        <View style={{ height: 28 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: BG,
  },
  container: {
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 40,
  },

  headerRow: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  backBtnText: {
    color: COLORS.white,
    fontSize: 30,
    fontWeight: "900",
    marginTop: -3,
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

  loadingCard: {
    minHeight: 160,
    borderRadius: 18,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    color: MUTED,
    fontSize: 13,
    fontWeight: "800",
    marginTop: 10,
  },

  heroCard: {
    minHeight: 96,
    borderRadius: 20,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: GOLD_BORDER,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  avatarWrap: {
    width: 68,
    height: 68,
    borderRadius: 22,
    marginRight: 12,
  },
  avatar: {
    width: 68,
    height: 68,
    borderRadius: 22,
    backgroundColor: BG,
  },
  avatarFallback: {
    width: 68,
    height: 68,
    borderRadius: 22,
    backgroundColor: "rgba(217,168,76,0.14)",
    borderWidth: 1,
    borderColor: GOLD_BORDER,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitials: {
    color: GOLD,
    fontSize: 21,
    fontWeight: "900",
  },
  avatarBadge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 25,
    height: 25,
    borderRadius: 13,
    backgroundColor: GOLD,
    borderWidth: 2,
    borderColor: BG,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarBadgeText: {
    color: BG,
    fontSize: 12,
    fontWeight: "900",
  },
  heroName: {
    color: COLORS.white,
    fontSize: 20,
    fontWeight: "900",
  },
  heroHandle: {
    color: GOLD,
    fontSize: 12,
    fontWeight: "900",
    marginTop: 4,
  },
  heroEmail: {
    color: MUTED,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 3,
  },

  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: CARD_SOFT,
    marginLeft: 8,
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
    borderRadius: 18,
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
  input: {
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 14,
    paddingHorizontal: 11,
    paddingVertical: 10,
    color: COLORS.white,
    fontWeight: "800",
    fontSize: 14,
  },
  helperText: {
    color: MUTED_DARK,
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 16,
    marginTop: 8,
  },
  pendingText: {
    color: GOLD,
    fontSize: 11,
    fontWeight: "900",
    marginTop: 8,
  },

  photoButton: {
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: CARD_SOFT,
    borderWidth: 1,
    borderColor: GOLD_BORDER,
    alignItems: "center",
    marginBottom: 4,
  },
  photoButtonText: {
    color: GOLD,
    fontWeight: "900",
    fontSize: 13,
  },

  primaryBtn: {
    marginTop: 12,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: GOLD,
    alignItems: "center",
  },
  primaryBtnText: {
    color: BG,
    fontWeight: "900",
    fontSize: 14,
  },
  disabledBtn: {
    opacity: 0.55,
  },

  importCard: {
    borderRadius: 15,
    borderWidth: 1,
    borderColor: GOLD_BORDER,
    backgroundColor: "rgba(217,168,76,0.08)",
    padding: 11,
    marginBottom: 4,
  },
  importTitle: {
    color: GOLD,
    fontSize: 14,
    fontWeight: "900",
  },
  importText: {
    color: MUTED,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
    marginTop: 5,
  },

  planCard: {
    minHeight: 64,
    borderRadius: 15,
    backgroundColor: CARD_SOFT,
    borderWidth: 1,
    borderColor: GOLD_BORDER,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  planLabel: {
    color: MUTED_DARK,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.7,
  },
  planName: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: "900",
    marginTop: 3,
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
  secondaryBtn: {
    marginTop: 8,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: CARD_SOFT,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: "center",
  },
  secondaryBtnText: {
    color: COLORS.white,
    fontWeight: "900",
    fontSize: 13,
  },
  secondaryBtnGold: {
    marginTop: 8,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: "rgba(217,168,76,0.12)",
    borderWidth: 1,
    borderColor: GOLD,
    alignItems: "center",
  },
  secondaryBtnGoldText: {
    color: GOLD,
    fontWeight: "900",
    fontSize: 13,
  },

  partyCard: {
    borderRadius: 15,
    borderWidth: 1,
    borderColor: GOLD_BORDER,
    backgroundColor: "rgba(217,168,76,0.08)",
    padding: 11,
  },
  partyTitle: {
    color: GOLD,
    fontSize: 14,
    fontWeight: "900",
  },
  partyText: {
    color: MUTED,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
    marginTop: 5,
  },
});