// DuckSmart — Auth Screen
//
// Login / Sign Up screen with email + password.
// Dark theme matching the rest of the app.

import React, { useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
} from "react-native";
import { COLORS } from "../constants/theme";
import { ASSETS } from "../constants/assets";
import { useAuth } from "../context/AuthContext";

export default function AuthScreen() {
  const { login, signup, loading, error, clearError } = useAuth();

  const [mode, setMode] = useState("login"); // "login" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function toggleMode() {
    setMode((prev) => (prev === "login" ? "signup" : "login"));
    clearError();
  }

  async function handleSubmit() {
    if (!email.trim() || !password) return;
    if (mode === "login") {
      await login(email.trim(), password);
    } else {
      await signup(email.trim(), password);
    }
  }

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1, justifyContent: "center" }}
      >
        <View style={s.inner}>
          {/* Branding */}
          <View style={s.brandWrap}>
            <Image source={ASSETS.logo} style={s.logo} resizeMode="contain" />
            <Text style={s.brand}>
              <Text style={s.brandDuck}>Duck</Text>
              <Text style={s.brandSmart}>Smart</Text>
            </Text>
            <Text style={s.tagline}>
              {mode === "login" ? "Welcome back" : "Create your account"}
            </Text>
          </View>

          {/* Error display */}
          {error ? (
            <View style={s.errorBox}>
              <Text style={s.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* Email field */}
          <Text style={s.label}>Email</Text>
          <TextInput
            value={email}
            onChangeText={(t) => {
              setEmail(t);
              if (error) clearError();
            }}
            placeholder="you@example.com"
            placeholderTextColor={COLORS.mutedDarkest}
            style={s.input}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
          />

          {/* Password field */}
          <Text style={s.label}>Password</Text>
          <TextInput
            value={password}
            onChangeText={(t) => {
              setPassword(t);
              if (error) clearError();
            }}
            placeholder="At least 6 characters"
            placeholderTextColor={COLORS.mutedDarkest}
            style={s.input}
            secureTextEntry
            textContentType={mode === "signup" ? "newPassword" : "password"}
          />

          {/* Submit button */}
          <Pressable
            style={[s.submitBtn, loading && s.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={COLORS.green} />
            ) : (
              <Text style={s.submitBtnText}>
                {mode === "login" ? "Log In" : "Sign Up"}
              </Text>
            )}
          </Pressable>

          {/* Mode toggle */}
          <Pressable onPress={toggleMode} style={s.toggleBtn}>
            <Text style={s.toggleText}>
              {mode === "login"
                ? "Don't have an account? Sign Up"
                : "Already have an account? Log In"}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.black },
  inner: { paddingHorizontal: 24 },

  brandWrap: { alignItems: "center", marginBottom: 32 },
  logo: { width: 72, height: 72, borderRadius: 18, marginBottom: 14 },
  brand: { fontSize: 32, fontWeight: "900", letterSpacing: 0.2 },
  brandDuck: { color: COLORS.white },
  brandSmart: { color: COLORS.green },
  tagline: { marginTop: 8, color: COLORS.muted, fontSize: 14, fontWeight: "700" },

  errorBox: {
    padding: 12,
    borderRadius: 14,
    backgroundColor: "rgba(217, 76, 76, 0.12)",
    borderWidth: 1,
    borderColor: COLORS.red,
    marginBottom: 16,
  },
  errorText: { color: COLORS.red, fontWeight: "800", fontSize: 13 },

  label: { color: COLORS.muted, fontSize: 12, fontWeight: "900", marginBottom: 8, marginTop: 12 },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bgDeep,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: COLORS.white,
    fontWeight: "800",
    fontSize: 15,
  },

  submitBtn: {
    marginTop: 24,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: COLORS.greenBg,
    borderWidth: 1,
    borderColor: COLORS.green,
    alignItems: "center",
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: COLORS.green, fontWeight: "900", fontSize: 16 },

  toggleBtn: { marginTop: 18, alignItems: "center" },
  toggleText: { color: COLORS.mutedDark, fontWeight: "800", fontSize: 13 },
});
