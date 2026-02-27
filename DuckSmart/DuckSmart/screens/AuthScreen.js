// DuckSmart — Auth Screen
//
// Login / Sign Up screen with email + password, Google, and Apple sign-in.
// Dark theme matching the rest of the app.

import React, { useState } from "react";
import {
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
import { SafeAreaView } from "react-native-safe-area-context";
import { COLORS } from "../constants/theme";
import { ASSETS } from "../constants/assets";
import { useAuth } from "../context/AuthContext";
import ScreenBackground from "../components/ScreenBackground";

// ---------------------------------------------------------------------------
// SVG-like icon components for Google & Apple (pure RN, no extra dep)
// ---------------------------------------------------------------------------

function GoogleIcon() {
  return (
    <Text style={{ fontSize: 20, fontWeight: "800" }}>
      <Text style={{ color: "#4285F4" }}>G</Text>
    </Text>
  );
}

function AppleIcon() {
  return (
    <Text style={{ fontSize: 22, fontWeight: "800", color: COLORS.white }}>
      {"\uF8FF"}
    </Text>
  );
}

export default function AuthScreen() {
  const {
    login,
    signup,
    loading,
    error,
    clearError,
    loginWithGoogle,
    loginWithApple,
  } = useAuth();

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

  // Always show Google; show Apple only on iOS
  const showApple = Platform.OS === "ios";

  return (
    <ScreenBackground style={s.safe} bg={ASSETS.backgrounds.auth}>
      <SafeAreaView style={{ flex: 1 }}>
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

          {/* ---- Social Sign-In Buttons (always visible) ---- */}
          <Pressable
            style={[s.socialBtn, s.googleBtn, loading && s.submitBtnDisabled]}
            onPress={loginWithGoogle}
            disabled={loading}
          >
            <GoogleIcon />
            <Text style={s.socialBtnText}>Continue with Google</Text>
          </Pressable>

          {showApple && (
            <Pressable
              style={[s.socialBtn, s.appleBtn, loading && s.submitBtnDisabled]}
              onPress={loginWithApple}
              disabled={loading}
            >
              <AppleIcon />
              <Text style={[s.socialBtnText, { color: COLORS.white }]}>
                Continue with Apple
              </Text>
            </Pressable>
          )}

          {/* Divider */}
          <View style={s.dividerRow}>
            <View style={s.dividerLine} />
            <Text style={s.dividerText}>or</Text>
            <View style={s.dividerLine} />
          </View>

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
    </ScreenBackground>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1 },
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

  // ---- Social Buttons ----
  socialBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
  },
  googleBtn: {
    backgroundColor: COLORS.bgDeep,
    borderColor: COLORS.border,
  },
  appleBtn: {
    backgroundColor: "#000000",
    borderColor: COLORS.border,
  },
  socialBtnText: {
    fontWeight: "900",
    fontSize: 15,
    color: COLORS.white,
  },

  // ---- Divider ----
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
    marginBottom: 10,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.border,
  },
  dividerText: {
    color: COLORS.mutedDark,
    fontWeight: "800",
    fontSize: 12,
    marginHorizontal: 12,
  },

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
