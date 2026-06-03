import React, { useState, useEffect, useCallback, useRef } from "react";
import { View, Text, Pressable, ActivityIndicator, Image, Alert, Linking } from "react-native";
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
import { logAppOpen, logHuntDeleted, logPinDeleted } from "./services/analytics";
import {
  buildImportedHuntLog,
  buildImportedPin,
  getSharedItem,
  parseDuckSmartShareId,
} from "./services/shareImport";

import TodayScreen from "./screens/TodayScreen";
import MapScreen from "./screens/MapScreen";
import LogScreen from "./screens/LogScreen";
import HistoryScreen from "./screens/HistoryScreen";
import DecoyScreen from "./screens/DecoyScreen";
import IdentifyStackScreen from "./screens/IdentifyScreen";
import AuthScreen from "./screens/AuthScreen";
import ProfileScreen from "./screens/ProfileScreen";
import GroupScreen from "./screens/GroupScreen";
import BlockedScreen from "./screens/BlockedScreen";
import UserCardScreen from "./screens/UserCardScreen";
import ShareScreen from "./screens/ShareScreen";
import SettingsModal from "./components/SettingsModal";
import { ASSETS } from "./constants/assets";

SplashScreen.preventAutoHideAsync().catch(() => {});

const HUNT_BROWN = "#21150D";
const HUNT_BROWN_DARK = "#140C07";
const HUNT_TAN = "#D9A84C";
const HUNT_BORDER = "rgba(217,168,76,0.22)";
const HUNT_INACTIVE = "rgba(255,255,255,0.52)";

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
  Decoy: { focused: "grid", unfocused: "grid-outline" },
  Identify: { focused: "search", unfocused: "search-outline" },
  ProfileScreen: { focused: "person", unfocused: "person-outline" },
  GroupScreen: { focused: "people", unfocused: "people-outline" },
  BlockedScreen: { focused: "ban", unfocused: "ban-outline" },
  UserCardScreen: { focused: "person-circle", unfocused: "person-circle-outline" },
  ShareScreen: { focused: "share-social", unfocused: "share-social-outline" },
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

function SyncManager({ uid, user, logs, pins, setLogs, setPins, ready }) {
  const { isPro } = usePremium();
  const hasSynced = useRef(false);
  const isMerging = useRef(false);
  const prevLogIds = useRef(new Set());
  const prevPinIds = useRef(new Set());
  const pushLogsTimer = useRef(null);
  const pushPinsTimer = useRef(null);

  useEffect(() => {
    if (!ready || !uid || !user) return;

    const recentLocation = logs.length > 0 ? logs[0].location : null;
    upsertUserProfile(user, { location: recentLocation, isPro });
    logAppOpen(uid);
  }, [ready, uid]);

  useEffect(() => {
    if (!ready || !uid || !user) return;
    upsertUserProfile(user, { isPro });
  }, [isPro]);

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

      setTimeout(() => {
        isMerging.current = false;
      }, 1000);
    })();
  }, [ready, uid]);

  useEffect(() => {
    if (!ready || !uid || !hasSynced.current || isMerging.current) return;

    const currentIds = new Set(logs.map((l) => l.id));

    for (const prevId of prevLogIds.current) {
      if (!currentIds.has(prevId)) {
        pushDeleteLog(uid, prevId);
        logHuntDeleted(uid);
      }
    }

    prevLogIds.current = currentIds;

    clearTimeout(pushLogsTimer.current);
    pushLogsTimer.current = setTimeout(() => {
      pushLogs(uid, logs);
    }, 2000);

    return () => clearTimeout(pushLogsTimer.current);
  }, [logs, ready, uid]);

  useEffect(() => {
    if (!ready || !uid || !hasSynced.current || isMerging.current) return;

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

function MainApp() {
  const { user, logout } = useAuth();
  const { accentColor } = useTheme();
  const insets = useSafeAreaInsets();
  const [logs, setLogs] = useState([]);
  const [pins, setPins] = useState(SEED_PINS);
  const [ready, setReady] = useState(false);
  const handledShareIdsRef = useRef(new Set());

  const [settingsVisible, setSettingsVisible] = useState(false);

  const addLog = useCallback((entry) => setLogs((prev) => [entry, ...prev]), []);
  const addPin = useCallback((entry) => setPins((prev) => [entry, ...prev]), []);

  const updateLog = useCallback((id, updates) => {
    setLogs((prev) =>
      prev.map((log) =>
        log.id === id
          ? { ...log, ...updates, updatedAt: Date.now() }
          : log
      )
    );
  }, []);

  const deleteLog = useCallback((id) => setLogs((prev) => prev.filter((l) => l.id !== id)), []);

  const openSettings = useCallback(() => setSettingsVisible(true), []);
  const closeSettings = useCallback(() => setSettingsVisible(false), []);

  const handleSharedLink = useCallback(
    async (url) => {
      const shareId = parseDuckSmartShareId(url);
      if (!shareId) return;

      if (handledShareIdsRef.current.has(shareId)) {
        return;
      }

      handledShareIdsRef.current.add(shareId);

      try {
        const sharedItem = await getSharedItem(shareId);

        if (sharedItem.type === "pin") {
          const title = sharedItem.payload?.title || "Shared Pin";

          Alert.alert(
            "Import Shared Pin?",
            `Add "${title}" to your DuckSmart pins?`,
            [
              {
                text: "Cancel",
                style: "cancel",
                onPress: () => {
                  handledShareIdsRef.current.delete(shareId);
                },
              },
              {
                text: "Add Pin",
                onPress: () => {
                  try {
                    const importedPin = buildImportedPin(sharedItem);

                    setPins((prev) => {
                      const alreadyImported = prev.some(
                        (pin) => pin.importedFromShareId === sharedItem.id
                      );

                      if (alreadyImported) return prev;

                      return [importedPin, ...prev];
                    });

                    Alert.alert("Pin Added", "The shared pin was added to your map.");
                  } catch (err) {
                    handledShareIdsRef.current.delete(shareId);
                    Alert.alert("Import Failed", err.message || "Could not import this pin.");
                  }
                },
              },
            ]
          );

          return;
        }

        if (sharedItem.type === "huntLog") {
          const date = sharedItem.payload?.dateTime
            ? new Date(sharedItem.payload.dateTime).toLocaleDateString()
            : "Shared Hunt";

          Alert.alert(
            "Import Shared Hunt Log?",
            `Add this hunt log from ${date} to your DuckSmart history?`,
            [
              {
                text: "Cancel",
                style: "cancel",
                onPress: () => {
                  handledShareIdsRef.current.delete(shareId);
                },
              },
              {
                text: "Add Log",
                onPress: () => {
                  try {
                    const importedLog = buildImportedHuntLog(sharedItem);

                    setLogs((prev) => {
                      const alreadyImported = prev.some(
                        (log) => log.importedFromShareId === sharedItem.id
                      );

                      if (alreadyImported) return prev;

                      return [importedLog, ...prev];
                    });

                    Alert.alert("Hunt Log Added", "The shared hunt log was added to your history.");
                  } catch (err) {
                    handledShareIdsRef.current.delete(shareId);
                    Alert.alert("Import Failed", err.message || "Could not import this hunt log.");
                  }
                },
              },
            ]
          );

          return;
        }

        handledShareIdsRef.current.delete(shareId);
        Alert.alert("Unsupported Share", "This shared DuckSmart item is not supported.");
      } catch (err) {
        handledShareIdsRef.current.delete(shareId);
        Alert.alert("Import Failed", err.message || "Could not open this shared DuckSmart item.");
      }
    },
    [setLogs, setPins]
  );

  useEffect(() => {
    (async () => {
      const [savedLogs, savedPins] = await Promise.all([loadLogs(), loadPins()]);

      if (savedLogs.length > 0) setLogs(savedLogs);
      if (savedPins) setPins(savedPins);

      setReady(true);
    })();

    try {
      preloadInterstitialAd().catch((err) =>
        console.warn("DuckSmart: Ad preload failed:", err.message)
      );
    } catch (err) {
      console.warn("DuckSmart: Ad preload error:", err.message);
    }
  }, []);

  useEffect(() => {
    if (ready) saveLogs(logs);
  }, [logs, ready]);

  useEffect(() => {
    if (ready) savePins(pins);
  }, [pins, ready]);

  useEffect(() => {
    let mounted = true;

    Linking.getInitialURL()
      .then((url) => {
        if (mounted && url) {
          handleSharedLink(url);
        }
      })
      .catch(() => {});

    const subscription = Linking.addEventListener("url", ({ url }) => {
      handleSharedLink(url);
    });

    return () => {
      mounted = false;
      subscription?.remove?.();
    };
  }, [handleSharedLink]);

  return (
    <PremiumProvider>
      <SyncManager
        uid={user?.uid}
        user={user}
        logs={logs}
        pins={pins}
        setLogs={setLogs}
        setPins={setPins}
        ready={ready}
      />

      <WeatherProvider>
        <NavigationContainer>
          <Tab.Navigator
            screenOptions={({ route }) => {
              const icons = TAB_ICONS[route.name] || {
                focused: "ellipse",
                unfocused: "ellipse-outline",
              };

              const isHiddenRoute =
                route.name === "ProfileScreen" ||
                route.name === "GroupScreen" ||
                route.name === "BlockedScreen" ||
                route.name === "UserCardScreen" ||
                route.name === "ShareScreen";

              return {
                headerShown: false,

                tabBarButton: isHiddenRoute ? () => null : undefined,

                tabBarStyle: isHiddenRoute
                  ? { display: "none" }
                  : {
                      position: "absolute",
                      backgroundColor: HUNT_BROWN,
                      borderTopColor: HUNT_BORDER,
                      borderTopWidth: 1,
                    },

                tabBarActiveTintColor: accentColor || HUNT_TAN,
                tabBarInactiveTintColor: HUNT_INACTIVE,

                tabBarLabelStyle: {
                  fontWeight: "900",
                  fontSize: 10,
                },

                tabBarItemStyle: isHiddenRoute
                  ? {
                      display: "none",
                    }
                  : {
                      flex: 1,
                      paddingTop: 2,
                      paddingBottom: 15,
                    },

                tabBarHideOnKeyboard: true,

                tabBarIcon: ({ focused, color, size }) => {
                  const iconName = focused ? icons.focused : icons.unfocused;
                  return <Ionicons name={iconName} size={size} color={color} />;
                },
              };
            }}
          >
            <Tab.Screen name="Today">
              {(props) => (
                <TodayScreen
                  {...props}
                  onLogout={openSettings}
                  openGroupScreen={() => props.navigation.navigate("GroupScreen")}
                />
              )}
            </Tab.Screen>

            <Tab.Screen name="Map">
              {(props) => (
                <MapScreen
                  {...props}
                  pins={pins}
                  setPins={setPins}
                  logs={logs}
                />
              )}
            </Tab.Screen>

            <Tab.Screen name="Log">
              {() => (
                <LogScreen
                  addLog={addLog}
                  addPin={addPin}
                  pins={pins}
                  logs={logs}
                  onLogout={openSettings}
                />
              )}
            </Tab.Screen>

            <Tab.Screen name="History">
              {() => (
                <HistoryScreen
                  logs={logs}
                  pins={pins}
                  setPins={setPins}
                  deleteLog={deleteLog}
                  updateLog={updateLog}
                  onLogout={openSettings}
                />
              )}
            </Tab.Screen>

            <Tab.Screen name="Decoy">
              {(props) => (
                <DecoyScreen
                  {...props}
                  pins={pins}
                  setPins={setPins}
                  onLogout={openSettings}
                />
              )}
            </Tab.Screen>

            <Tab.Screen name="Identify" component={IdentifyStackScreen} />

           <Tab.Screen name="ProfileScreen">
  {(props) => <ProfileScreen {...props} openSettings={openSettings} />}
</Tab.Screen>

            <Tab.Screen name="GroupScreen">
  {(props) => <GroupScreen {...props} openSettings={openSettings} />}
</Tab.Screen>

            <Tab.Screen name="BlockedScreen" component={BlockedScreen} />

            <Tab.Screen name="UserCardScreen" component={UserCardScreen} />

            <Tab.Screen name="ShareScreen">
  {(props) => (
    <ShareScreen
      {...props}
      pins={pins}
      logs={logs}
      addPin={addPin}
      addLog={addLog}
      openGroupScreen={() => props.navigation.navigate("GroupScreen")}
    />
  )}
</Tab.Screen>
          </Tab.Navigator>

          <SettingsModal visible={settingsVisible} onClose={closeSettings} onLogout={logout} />
        </NavigationContainer>
      </WeatherProvider>
    </PremiumProvider>
  );
}

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
    <View style={{ flex: 1, backgroundColor: HUNT_BROWN_DARK, alignItems: "center", justifyContent: "center", padding: 32 }}>
      <Image source={ASSETS.logo} style={{ width: 72, height: 72, borderRadius: 18, marginBottom: 20 }} resizeMode="contain" />

      <Text style={{ color: COLORS.white, fontSize: 22, fontWeight: "900", marginBottom: 8 }}>Verify Your Email</Text>

      <Text style={{ color: COLORS.muted, fontSize: 14, fontWeight: "700", textAlign: "center", lineHeight: 20, marginBottom: 8 }}>
        We sent a verification link to:
      </Text>

      <Text style={{ color: HUNT_TAN, fontSize: 15, fontWeight: "900", marginBottom: 24 }}>
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
        <Text style={{ color: HUNT_TAN, fontWeight: "800", fontSize: 13, marginBottom: 16 }}>
          Verification email sent!
        </Text>
      ) : null}

      <Pressable
        onPress={handleCheckVerification}
        disabled={checking}
        style={{ width: "100%", paddingVertical: 14, borderRadius: 14, backgroundColor: "rgba(217,168,76,0.16)", borderWidth: 1, borderColor: HUNT_TAN, alignItems: "center", marginBottom: 12, opacity: checking ? 0.6 : 1 }}
      >
        {checking ? (
          <ActivityIndicator color={HUNT_TAN} />
        ) : (
          <Text style={{ color: HUNT_TAN, fontWeight: "900", fontSize: 15 }}>I've Verified — Continue</Text>
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

function AuthGate() {
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [loading]);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: HUNT_BROWN_DARK, alignItems: "center", justifyContent: "center" }}>
        <Image
          source={ASSETS.logo}
          style={{ width: 120, height: 120, marginBottom: 24 }}
          resizeMode="contain"
        />

        <Text style={{ color: COLORS.white, fontSize: 28, fontWeight: "900", letterSpacing: 0.5 }}>
          <Text style={{ color: HUNT_TAN }}>Duck</Text>
          <Text>Smart</Text>
        </Text>

        <Text style={{ color: COLORS.muted, fontSize: 13, fontWeight: "700", marginTop: 6 }}>
          Hunt Smarter.
        </Text>

        <ActivityIndicator size="small" color={HUNT_TAN} style={{ marginTop: 28 }} />
      </View>
    );
  }

  if (!user) return <AuthScreen />;

  const isEmailProvider = user.providerData?.some((p) => p.providerId === "password");

  if (isEmailProvider && !user.emailVerified) {
    return <VerifyEmailScreen />;
  }

  return <MainApp />;
}

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