import React, { useState, useEffect, useCallback, useRef } from "react";
import { View, ActivityIndicator } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
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
            paddingTop: 8,
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
        <Tab.Screen name="Map">{() => <MapScreen pins={pins} setPins={setPins} />}</Tab.Screen>
        <Tab.Screen name="Log">{() => <LogScreen addLog={addLog} onLogout={openSettings} />}</Tab.Screen>
        <Tab.Screen name="History">{() => <HistoryScreen logs={logs} deleteLog={deleteLog} onLogout={openSettings} />}</Tab.Screen>
        <Tab.Screen name="Identify" component={IdentifyStackScreen} />
      </Tab.Navigator>

      <SettingsModal visible={settingsVisible} onClose={closeSettings} onLogout={logout} />
    </NavigationContainer>
    </WeatherProvider>
    </PremiumProvider>
  );
}

// --- Auth gate — shows loading / login / main app ---

function AuthGate() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.black, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" color={COLORS.green} />
      </View>
    );
  }

  return user ? <MainApp /> : <AuthScreen />;
}

// --- Root component ---

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <AuthGate />
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
