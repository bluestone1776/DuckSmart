// DuckSmart — Settings Modal
//
// Full-screen modal with: Feedback form, App info, and Logout.
// Triggered by the gear button on any screen.

import React, { useState } from "react";
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
} from "react-native";
import { COLORS } from "../constants/theme";
import { submitFeedback } from "../services/feedback";
import { useAuth } from "../context/AuthContext";

const CATEGORIES = ["Bug", "Feature Request", "Question", "Other"];

export default function SettingsModal({ visible, onClose, onLogout }) {
  const { deleteAccount } = useAuth();
  const [feedbackMsg, setFeedbackMsg] = useState("");
  const [category, setCategory] = useState("Bug");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmitFeedback() {
    const msg = feedbackMsg.trim();
    if (!msg) {
      Alert.alert("Empty Feedback", "Please write something before submitting.");
      return;
    }

    setSubmitting(true);
    try {
      await submitFeedback({ message: msg, category });
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
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
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
  safe: { flex: 1, backgroundColor: COLORS.black },
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
});
