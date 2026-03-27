import React, { useState, useEffect, useCallback, useRef } from "react";
import { View, Text, Pressable, ActivityIndicator, Image } from "react-native";
import * as SplashScreen from "expo-splash-screen";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";

import { COLORS } from "./constants/theme";
import { WeatherProvider } from "./context/WeatherContext";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { PremiumProvider, usePremium } from "./context/PremiumContext";
import { ThemeProvider, useTheme } from "./context/ThemeContext";
import { saveLogs, loadLogs, savePins, loadPins } from "./services/storage";
import { preloadInterstitialAd } from "./services/ads";
import {
  pushLogs, pushPins, pullLogs, pullPins,
  mergeLogs, mergePins, pushDeleteLog, pushDeletePin,
  upsertUserProfile,
} from "./services/sync";
import { logAppOpen, logHuntLogged, logHuntDeleted, logPinCreated, logPinDeleted } from "./services/analytics";

import TodayScreen from "./screens/TodayScreen";
import MapScreen from "./screens/MapScreen";
import LogScreen from "./screens/LogScreen";
import HistoryScreen from "./screens/HistoryScreen";
import IdentifyStackScreen from "./screens/IdentifyScreen";
import AuthScreen from "./screens/AuthScreen";
import SettingsModal from "./components/SettingsModal";
import { ASSETS } from "./constants/assets";

// Keep native splash visible until we're ready
SplashScreen.preventAutoHideAsync().catch(() => {});

// --- Error Boundary — catches render crashes and shows recovery UI ---

class ErrorBoundary extends React.Component {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("DuckSmart crash:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, backgroundColor: COLORS.black, alignItems: "center", justifyContent: "center", padding: 32 }}>
          <Text style={{ color: COLORS.white, fontSize: 22, fontWeight: "900", marginBottom: 12 }}>Something went wrong</Text>
          <Text style={{ color: COLORS.muted, fontSize: 14, fontWeight: "700", textAlign: "center", lineHeight: 20, marginBottom: 24 }}>
            DuckSmart hit an unexpected error. Tap below to restart.
          </Text>
          <Pressable
            onPress={() => this.setState({ hasError: false, error: null })}
            style={{ paddingVertical: 14, paddingHorizontal: 32, borderRadius: 14, backgroundColor: COLORS.greenBg, borderWidth: 1, borderColor: COLORS.green }}
          >
            <Text style={{ color: COLORS.green, fontWeight: "900", fontSize: 15 }}>Restart App</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

const Tab = createBottomTabNavigator();

const TAB_ICONS = {
  Today: { focused: "today", unfocused: "today-outline" },
  Map: { focused: "map", unfocused: "map-outline" },
  Log: { focused: "add-circle", unfocused: "add-circle-outline" },
  History: { focused: "time", unfocused: "time-outline" },
  Identify: { focused: "search", unfocused: "search-outline" },
};

const SEED_PINS = [
  {
    id: "seed-1",
    title: "North Marsh Edge",
    type: "Spot",
    notes: "Good flight line at first light.",
    coordinate: { latitude: 33.994, longitude: -83.382 },
    createdAt: Date.now() - 1000 * 60 * 60 * 24,
  },
];

// --- Cloud sync bridge — renders nothing, just manages Firestore sync ---
// Syncs ALL users (not just Pro) — local storage is offline cache only.

function SyncManager({ uid, user, logs, pins, setLogs, setPins, ready }) {
  const { isPro } = usePremium();
  const hasSynced = useRef(false);
  const isMerging = useRef(false);
  const prevLogIds = useRef(new Set());
  const prevPinIds = useRef(new Set());
  const pushLogsTimer = useRef(null);
  const pushPinsTimer = useRef(null);

  // ── Create/update user profile + log app open on login ──
  useEffect(() => {
    if (!ready || !uid || !user) return;

    // Get location from most recent log (if any)
    const recentLocation = logs.length > 0 ? logs[0].location : null;
    upsertUserProfile(user, { location: recentLocation, isPro });
    logAppOpen(uid);
  }, [ready, uid]);

  // ── Update user profile when Pro status changes ──
  useEffect(() => {
    if (!ready || !uid || !user) return;
    upsertUserProfile(user, { isPro });
  }, [isPro]);

  // ── Pull on login (once) — merge cloud data with local ──
  useEffect(() => {
    if (!ready || !uid || hasSynced.current) return;
    hasSynced.current = true;

    (async () => {
      isMerging.current = true;
      try {
        const [cloudLogs, cloudPins] = await Promise.all([
          pullLogs(uid),
          pullPins(uid),
        ]);

        if (cloudLogs) {
          setLogs((local) => {
            const merged = mergeLogs(local, cloudLogs);
            prevLogIds.current = new Set(merged.map((l) => l.id));
            return merged;
          });
        }
        if (cloudPins) {
          setPins((local) => {
            const merged = mergePins(local, cloudPins);
            prevPinIds.current = new Set(merged.map((p) => p.id));
            return merged;
          });
        }
      } catch (err) {
        console.warn("DuckSmart sync: initial pull failed —", err.message);
      }
      // Allow pushes after a short delay so merge-triggered effects settle
      setTimeout(() => { isMerging.current = false; }, 1000);
    })();
  }, [ready, uid]);

  // ── Push logs after local changes (debounced 2s) ──
  useEffect(() => {
    if (!ready || !uid || !hasSynced.current || isMerging.current) return;

    // Detect deletions by comparing previous IDs to current
    const currentIds = new Set(logs.map((l) => l.id));
    for (const prevId of prevLogIds.current) {
      if (!currentIds.has(prevId)) {
        pushDeleteLog(uid, prevId);
        logHuntDeleted(uid);
      }
    }
    prevLogIds.current = currentIds;

    // Debounced push
    clearTimeout(pushLogsTimer.current);
    pushLogsTimer.current = setTimeout(() => {
      pushLogs(uid, logs);
    }, 2000);

    return () => clearTimeout(pushLogsTimer.current);
  }, [logs, ready, uid]);

  // ── Push pins after local changes (debounced 2s) ──
  useEffect(() => {
    if (!ready || !uid || !hasSynced.current || isMerging.current) return;

    // Detect pin deletions
    const currentIds = new Set(pins.map((p) => p.id));
    for (const prevId of prevPinIds.current) {
      if (!currentIds.has(prevId)) {
        pushDeletePin(uid, prevId);
        logPinDeleted(uid);
      }
    }
    prevPinIds.current = currentIds;

    clearTimeout(pushPinsTimer.current);
    pushPinsTimer.current = setTimeout(() => {
      pushPins(uid, pins);
    }, 2000);

    return () => clearTimeout(pushPinsTimer.current);
  }, [pins, ready, uid]);

  return null;
}

// --- Main app (tabs + data) — only renders when authenticated ---

function MainApp() {
  const { user, logout } = useAuth();
  const { accentColor } = useTheme();
  const insets = useSafeAreaInsets();
  const [logs, setLogs] = useState([]);
  const [pins, setPins] = useState(SEED_PINS);
  const [ready, setReady] = useState(false);

  // Load persisted data on startup + preload first ad
  useEffect(() => {
    (async () => {
      const [savedLogs, savedPins] = await Promise.all([loadLogs(), loadPins()]);
      if (savedLogs.length > 0) setLogs(savedLogs);
      if (savedPins) setPins(savedPins);
      setReady(true);
    })();

    // Preload interstitial ad — wrapped so a failure never blocks startup
    try {
      preloadInterstitialAd().catch((err) =>
        console.warn("DuckSmart: Ad preload failed:", err.message)
      );
    } catch (err) {
      console.warn("DuckSmart: Ad preload error:", err.message);
    }
  }, []);

  // Persist logs whenever they change
  useEffect(() => {
    if (ready) saveLogs(logs);
  }, [logs, ready]);

  // Persist pins whenever they change
  useEffect(() => {
    if (ready) savePins(pins);
  }, [pins, ready]);

  const [settingsVisible, setSettingsVisible] = useState(false);

  const addLog = useCallback((entry) => setLogs((prev) => [entry, ...prev]), []);
  const deleteLog = useCallback((id) => setLogs((prev) => prev.filter((l) => l.id !== id)), []);

  const openSettings = useCallback(() => setSettingsVisible(true), []);
  const closeSettings = useCallback(() => setSettingsVisible(false), []);

  return (
    <PremiumProvider>
    <SyncManager uid={user?.uid} user={user} logs={logs} pins={pins} setLogs={setLogs} setPins={setPins} ready={ready} />
    <WeatherProvider>
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarStyle: {
            backgroundColor: COLORS.bg,
            borderTopColor: COLORS.border,
            borderTopWidth: 1,
            height: 80 + insets.bottom,
            paddingTop: 8,
            paddingBottom: Math.max(insets.bottom, 24),
          },
          tabBarActiveTintColor: accentColor,
          tabBarInactiveTintColor: COLORS.muted,
          tabBarLabelStyle: { fontWeight: "800" },
          tabBarIcon: ({ focused, color, size }) => {
            const icons = TAB_ICONS[route.name];
            const iconName = focused ? icons.focused : icons.unfocused;
            return <Ionicons name={iconName} size={size} color={color} />;
          },
        })}
      >
        <Tab.Screen name="Today">{() => <TodayScreen onLogout={openSettings} />}</Tab.Screen>
        <Tab.Screen name="Map">{() => <MapScreen pins={pins} setPins={setPins} logs={logs} />}</Tab.Screen>
        <Tab.Screen name="Log">{() => <LogScreen addLog={addLog} pins={pins} onLogout={openSettings} />}</Tab.Screen>
        <Tab.Screen name="History">{() => <HistoryScreen logs={logs} deleteLog={deleteLog} onLogout={openSettings} />}</Tab.Screen>
        <Tab.Screen name="Identify" component={IdentifyStackScreen} />
      </Tab.Navigator>

      <SettingsModal visible={settingsVisible} onClose={closeSettings} onLogout={logout} />
    </NavigationContainer>
    </WeatherProvider>
    </PremiumProvider>
  );
}

// --- Email verification screen — shown for unverified email/password users ---

function VerifyEmailScreen() {
  const { user, resendVerification, refreshUser, logout, error, clearError } = useAuth();
  const [resent, setResent] = useState(false);
  const [checking, setChecking] = useState(false);

  async function handleResend() {
    clearError();
    setResent(false);
    await resendVerification();
    setResent(true);
  }

  async function handleCheckVerification() {
    setChecking(true);
    clearError();
    await refreshUser();
    setChecking(false);
  }

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.black, alignItems: "center", justifyContent: "center", padding: 32 }}>
      <Image source={ASSETS.logo} style={{ width: 72, height: 72, borderRadius: 18, marginBottom: 20 }} resizeMode="contain" />
      <Text style={{ color: COLORS.white, fontSize: 22, fontWeight: "900", marginBottom: 8 }}>Verify Your Email</Text>
      <Text style={{ color: COLORS.muted, fontSize: 14, fontWeight: "700", textAlign: "center", lineHeight: 20, marginBottom: 8 }}>
        We sent a verification link to:
      </Text>
      <Text style={{ color: COLORS.green, fontSize: 15, fontWeight: "900", marginBottom: 24 }}>
        {user?.email}
      </Text>
      <Text style={{ color: COLORS.mutedDark, fontSize: 13, fontWeight: "700", textAlign: "center", lineHeight: 20, marginBottom: 28 }}>
        Please check your inbox (and spam folder) and tap the link to verify your email address.
      </Text>

      {error ? (
        <View style={{ padding: 12, borderRadius: 14, backgroundColor: "rgba(217, 76, 76, 0.12)", borderWidth: 1, borderColor: COLORS.red, marginBottom: 16, width: "100%" }}>
          <Text style={{ color: COLORS.red, fontWeight: "800", fontSize: 13, textAlign: "center" }}>{error}</Text>
        </View>
      ) : null}

      {resent ? (
        <Text style={{ color: COLORS.green, fontWeight: "800", fontSize: 13, marginBottom: 16 }}>
          Verification email sent!
        </Text>
      ) : null}

      <Pressable
        onPress={handleCheckVerification}
        disabled={checking}
        style={{ width: "100%", paddingVertical: 14, borderRadius: 14, backgroundColor: COLORS.greenBg, borderWidth: 1, borderColor: COLORS.green, alignItems: "center", marginBottom: 12, opacity: checking ? 0.6 : 1 }}
      >
        {checking ? (
          <ActivityIndicator color={COLORS.green} />
        ) : (
          <Text style={{ color: COLORS.green, fontWeight: "900", fontSize: 15 }}>I've Verified — Continue</Text>
        )}
      </Pressable>

      <Pressable
        onPress={handleResend}
        style={{ width: "100%", paddingVertical: 14, borderRadius: 14, backgroundColor: COLORS.bgDeep, borderWidth: 1, borderColor: COLORS.border, alignItems: "center", marginBottom: 12 }}
      >
        <Text style={{ color: COLORS.white, fontWeight: "900", fontSize: 15 }}>Resend Verification Email</Text>
      </Pressable>

      <Pressable onPress={logout} style={{ marginTop: 8 }}>
        <Text style={{ color: COLORS.mutedDark, fontWeight: "800", fontSize: 13 }}>Sign out</Text>
      </Pressable>
    </View>
  );
}

// --- Auth gate — shows loading / login / verification / main app ---

function AuthGate() {
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [loading]);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.black, alignItems: "center", justifyContent: "center" }}>
        <Image
          source={ASSETS.logo}
          style={{ width: 120, height: 120, marginBottom: 24 }}
          resizeMode="contain"
        />
        <Text style={{ color: COLORS.white, fontSize: 28, fontWeight: "900", letterSpacing: 0.5 }}>
          <Text style={{ color: COLORS.green }}>Duck</Text>
          <Text>Smart</Text>
        </Text>
        <Text style={{ color: COLORS.muted, fontSize: 13, fontWeight: "700", marginTop: 6 }}>
          Hunt Smarter.
        </Text>
        <ActivityIndicator size="small" color={COLORS.green} style={{ marginTop: 28 }} />
      </View>
    );
  }

  if (!user) return <AuthScreen />;

  // Email/password users must verify their email before accessing the app.
  // OAuth users (Google, Apple) are already verified by their provider.
  const isEmailProvider = user.providerData?.some((p) => p.providerId === "password");
  if (isEmailProvider && !user.emailVerified) {
    return <VerifyEmailScreen />;
  }

  return <MainApp />;
}

// --- Root component ---

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ErrorBoundary>
          <ThemeProvider>
            <AuthProvider>
              <AuthGate />
            </AuthProvider>
          </ThemeProvider>
        </ErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
