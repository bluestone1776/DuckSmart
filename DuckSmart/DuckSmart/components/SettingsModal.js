// DuckSmart — Settings Modal
//
// Full-screen modal with: Feedback form, App info, and Logout.
// Triggered by the gear button on any screen.

import React, { useState, useEffect } from "react";
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
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system";
import { COLORS } from "../constants/theme";
import { submitFeedback } from "../services/feedback";
import { useAuth } from "../context/AuthContext";
import { usePremium } from "../context/PremiumContext";
import { useTheme } from "../context/ThemeContext";
import { logFeedbackSubmitted, logProUpgrade } from "../services/analytics";

// ---------------------------------------------------------------------------
// Hunting License — stored locally in the document directory
// ---------------------------------------------------------------------------
const LICENSE_PATH = `${FileSystem.documentDirectory}hunting_license.jpg`;

const CATEGORIES = ["Bug", "Feature Request", "Question", "Other"];

export default function SettingsModal({ visible, onClose, onLogout }) {
  const { deleteAccount, user } = useAuth();
  const { isPro, purchase, restore, getProPrice } = usePremium();
  const { accent, presets, setAccent } = useTheme();
  const [feedbackMsg, setFeedbackMsg] = useState("");
  const [category, setCategory] = useState("Bug");
  const [submitting, setSubmitting] = useState(false);

  // Hunting License state
  const [licenseUri, setLicenseUri] = useState(null);
  const [licenseLoading, setLicenseLoading] = useState(true);
  const [licenseViewer, setLicenseViewer] = useState(false);

  // Load saved license on mount
  useEffect(() => {
    if (!visible) return;
    (async () => {
      try {
        const info = await FileSystem.getInfoAsync(LICENSE_PATH);
        if (info.exists) {
          setLicenseUri(LICENSE_PATH + "?t=" + info.modificationTime);
        } else {
          setLicenseUri(null);
        }
      } catch {
        setLicenseUri(null);
      } finally {
        setLicenseLoading(false);
      }
    })();
  }, [visible]);

  async function pickLicensePhoto(useCamera) {
    try {
      let result;
      if (useCamera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          Alert.alert("Permission Needed", "Camera access is required to take a photo of your license.");
          return;
        }
        result = await ImagePicker.launchCameraAsync({
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
          quality: 0.8,
          allowsEditing: true,
        });
      }

      if (result.canceled || !result.assets?.length) return;

      const sourceUri = result.assets[0].uri;
      await FileSystem.copyAsync({ from: sourceUri, to: LICENSE_PATH });
      const info = await FileSystem.getInfoAsync(LICENSE_PATH);
      setLicenseUri(LICENSE_PATH + "?t=" + info.modificationTime);
    } catch {
      Alert.alert("Error", "Could not save the license photo. Please try again.");
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
    Alert.alert("Remove License Photo?", "This will delete the saved image from this device.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          try {
            await FileSystem.deleteAsync(LICENSE_PATH, { idempotent: true });
            setLicenseUri(null);
          } catch {
            Alert.alert("Error", "Could not remove the license photo.");
          }
        },
      },
    ]);
  }

  async function handleSubmitFeedback() {
    const msg = feedbackMsg.trim();
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
                      // Error is set in AuthContext and shown to the user
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

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={ms.safe}>
        <ScrollView contentContainerStyle={ms.container}>
          {/* Header */}
          <View style={ms.headerRow}>
            <Text style={ms.headerTitle}>Settings</Text>
            <Pressable style={ms.closeBtn} onPress={onClose}>
              <Text style={ms.closeBtnText}>✕</Text>
            </Pressable>
          </View>

          {/* Feedback Section */}
          <View style={ms.section}>
            <Text style={ms.sectionTitle}>Send Feedback</Text>
            <Text style={ms.sectionSub}>
              Report a bug, suggest a feature, or ask a question. We read every message.
            </Text>

            <Text style={ms.label}>Category</Text>
            <View style={ms.chipRow}>
              {CATEGORIES.map((cat) => (
                <Pressable
                  key={cat}
                  onPress={() => setCategory(cat)}
                  style={[ms.chip, category === cat ? ms.chipSelected : ms.chipUnselected]}
                >
                  <Text style={[ms.chipText, category === cat ? ms.chipTextSelected : null]}>{cat}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={ms.label}>Message</Text>
            <TextInput
              value={feedbackMsg}
              onChangeText={setFeedbackMsg}
              placeholder="Describe the issue or suggestion..."
              placeholderTextColor={COLORS.mutedDarkest}
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

          {/* Subscription */}
          <View style={ms.section}>
            <Text style={ms.sectionTitle}>Subscription</Text>
            {isPro ? (
              <>
                <View style={ms.proBadgeRow}>
                  <View style={ms.proBadge}>
                    <Text style={ms.proBadgeText}>PRO</Text>
                  </View>
                  <Text style={ms.proStatusText}>DuckSmart Pro — Active</Text>
                </View>
                <Text style={ms.sectionSub}>
                  You have access to all features. Happy hunting!
                </Text>
              </>
            ) : (
              <>
                <Text style={ms.sectionSub}>
                  Unlock animated radar, 48hr weather trends, extended forecasts,
                  unlimited map pins, all duck species, and an ad-free experience.
                </Text>
                <Pressable style={ms.upgradeBtn} onPress={purchase}>
                  <Text style={ms.upgradeBtnText}>
                    {getProPrice() ? `Upgrade to Pro — ${getProPrice()}` : "Upgrade to Pro"}
                  </Text>
                </Pressable>
                <Pressable style={ms.restoreBtn} onPress={restore}>
                  <Text style={ms.restoreBtnText}>Restore Purchase</Text>
                </Pressable>
              </>
            )}
          </View>

          {/* Hunting License */}
          <View style={ms.section}>
            <Text style={ms.sectionTitle}>Hunting License</Text>
            <Text style={ms.sectionSub}>
              Store a photo of your hunting license for quick offline access in the field.
            </Text>

            {licenseLoading ? (
              <ActivityIndicator color={COLORS.green} style={{ marginVertical: 20 }} />
            ) : licenseUri ? (
              <>
                <Pressable onPress={() => setLicenseViewer(true)}>
                  <Image source={{ uri: licenseUri }} style={ms.licenseThumb} resizeMode="cover" />
                  <Text style={ms.licenseTapHint}>Tap to view full size</Text>
                </Pressable>
                <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
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

          {/* License Full-Screen Viewer */}
          <Modal visible={licenseViewer} transparent={false} animationType="fade" onRequestClose={() => setLicenseViewer(false)}>
            <View style={ms.licenseViewerBg}>
              <Image source={{ uri: licenseUri }} style={ms.licenseViewerImage} resizeMode="contain" />
              <Pressable style={ms.licenseViewerClose} onPress={() => setLicenseViewer(false)}>
                <Text style={ms.closeBtnText}>✕  Close</Text>
              </Pressable>
            </View>
          </Modal>

          {/* Accent Color Theme */}
          <View style={ms.section}>
            <Text style={ms.sectionTitle}>Accent Color</Text>
            <Text style={ms.sectionSub}>
              Personalize the look of DuckSmart. Pick a color that matches your style.
            </Text>
            <View style={ms.themeGrid}>
              {presets.map((p) => (
                <Pressable
                  key={p.key}
                  style={[
                    ms.themeSwatch,
                    { backgroundColor: p.bg, borderColor: p.color },
                    accent.key === p.key && ms.themeSwatchSelected,
                  ]}
                  onPress={() => setAccent(p)}
                >
                  <View style={[ms.themeCircle, { backgroundColor: p.color }]} />
                  <Text style={[ms.themeLabel, { color: p.color }]}>{p.label}</Text>
                  {accent.key === p.key && <Text style={[ms.themeCheck, { color: p.color }]}>✓</Text>}
                </Pressable>
              ))}
            </View>
          </View>

          {/* App Info */}
          <View style={ms.section}>
            <Text style={ms.sectionTitle}>About DuckSmart</Text>
            <Text style={ms.infoText}>Version 1.0.0</Text>
            <Text style={ms.infoText}>Built for duck hunters, by duck hunters.</Text>
            <Text style={ms.infoTextMuted}>
              Weather data provided by OpenWeatherMap. Prediction scores are estimates
              based on weather and environmental data — not guaranteed outcomes.
            </Text>
          </View>

          {/* Logout */}
          <Pressable style={ms.logoutBtn} onPress={handleLogout}>
            <Text style={ms.logoutBtnText}>Log Out</Text>
          </Pressable>

          {/* Delete Account */}
          <Pressable style={ms.deleteBtn} onPress={handleDeleteAccount}>
            <Text style={ms.deleteBtnText}>Delete Account</Text>
          </Pressable>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const ms = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.transparentBlack },
  container: { padding: 16, paddingBottom: 28 },

  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20, paddingTop: 10 },
  headerTitle: { color: COLORS.white, fontSize: 24, fontWeight: "900" },
  closeBtn: {
    width: 42, height: 42, borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.border,
    backgroundColor: COLORS.bg, alignItems: "center", justifyContent: "center",
  },
  closeBtnText: { color: COLORS.white, fontSize: 18, fontWeight: "900" },

  section: {
    marginBottom: 20, padding: 14, borderRadius: 18,
    backgroundColor: COLORS.bg, borderWidth: 1, borderColor: COLORS.border,
  },
  sectionTitle: { color: COLORS.white, fontSize: 16, fontWeight: "900", marginBottom: 6 },
  sectionSub: { color: COLORS.muted, fontSize: 13, lineHeight: 18, fontWeight: "700", marginBottom: 12 },

  label: { color: COLORS.muted, fontSize: 12, fontWeight: "900", marginTop: 10, marginBottom: 8 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1 },
  chipSelected: { backgroundColor: COLORS.greenBg, borderColor: COLORS.green },
  chipUnselected: { backgroundColor: COLORS.bgDeep, borderColor: COLORS.border },
  chipText: { fontSize: 12, fontWeight: "700", color: COLORS.white },
  chipTextSelected: { color: COLORS.green },

  textArea: {
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.bgDeep,
    borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10,
    color: COLORS.white, fontWeight: "800", height: 110, textAlignVertical: "top",
  },

  submitBtn: {
    marginTop: 14, paddingVertical: 12, borderRadius: 14,
    backgroundColor: COLORS.greenBg, borderWidth: 1, borderColor: COLORS.green, alignItems: "center",
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { color: COLORS.green, fontWeight: "900" },

  infoText: { color: COLORS.muted, fontSize: 13, fontWeight: "700", marginTop: 4 },
  infoTextMuted: { color: COLORS.mutedDarker, fontSize: 12, fontWeight: "700", marginTop: 8, lineHeight: 18 },

  logoutBtn: {
    marginTop: 10, paddingVertical: 14, borderRadius: 14,
    backgroundColor: COLORS.bgDeep, borderWidth: 1, borderColor: COLORS.red, alignItems: "center",
  },
  logoutBtnText: { color: COLORS.red, fontWeight: "900", fontSize: 15 },

  deleteBtn: {
    marginTop: 10, paddingVertical: 14, borderRadius: 14,
    backgroundColor: COLORS.bgDeep, borderWidth: 1, borderColor: COLORS.border, alignItems: "center",
  },
  deleteBtnText: { color: COLORS.mutedDark, fontWeight: "900", fontSize: 13 },

  proBadgeRow: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  proBadge: {
    paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999,
    backgroundColor: COLORS.greenBg, borderWidth: 1, borderColor: COLORS.green, marginRight: 10,
  },
  proBadgeText: { color: COLORS.green, fontSize: 11, fontWeight: "900" },
  proStatusText: { color: COLORS.white, fontSize: 14, fontWeight: "800" },

  upgradeBtn: {
    paddingVertical: 14, borderRadius: 14,
    backgroundColor: COLORS.greenBg, borderWidth: 1, borderColor: COLORS.green, alignItems: "center",
  },
  upgradeBtnText: { color: COLORS.green, fontWeight: "900", fontSize: 15 },

  restoreBtn: {
    marginTop: 10, paddingVertical: 10, alignItems: "center",
  },
  restoreBtnText: { color: COLORS.mutedDark, fontWeight: "700", fontSize: 13 },

  // Hunting License
  licenseThumb: {
    width: "100%",
    height: 200,
    borderRadius: 14,
    backgroundColor: COLORS.bgDeep,
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
  },
  licenseTapHint: {
    color: COLORS.mutedDarker,
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center",
    marginTop: 6,
  },
  licenseAddBtn: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 28,
    borderRadius: 14,
    backgroundColor: COLORS.bgDeep,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderStyle: "dashed",
  },
  licenseAddIcon: { fontSize: 28, marginBottom: 6 },
  licenseAddText: { color: COLORS.white, fontWeight: "900", fontSize: 14 },
  licenseAddSub: { color: COLORS.mutedDark, fontWeight: "700", fontSize: 12, marginTop: 4 },

  licenseViewerBg: {
    flex: 1,
    backgroundColor: COLORS.black,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  licenseViewerImage: {
    width: "100%",
    height: "75%",
    borderRadius: 14,
  },
  licenseViewerClose: {
    marginTop: 20,
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 14,
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  // Accent Color Theme
  themeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  themeSwatch: {
    width: "47%",
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
  },
  themeSwatchSelected: {
    borderWidth: 2,
  },
  themeCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  themeLabel: {
    fontSize: 12,
    fontWeight: "800",
    flex: 1,
  },
  themeCheck: {
    fontSize: 14,
    fontWeight: "900",
  },
});
