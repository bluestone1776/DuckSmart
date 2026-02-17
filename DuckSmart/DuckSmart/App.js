import React, { useState, useEffect, useCallback } from "react";
import { View, ActivityIndicator, Alert } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";

import { COLORS } from "./constants/theme";
import { WeatherProvider } from "./context/WeatherContext";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { saveLogs, loadLogs, savePins, loadPins } from "./services/storage";

import TodayScreen from "./screens/TodayScreen";
import MapScreen from "./screens/MapScreen";
import LogScreen from "./screens/LogScreen";
import HistoryScreen from "./screens/HistoryScreen";
import IdentifyStackScreen from "./screens/IdentifyScreen";
import AuthScreen from "./screens/AuthScreen";

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

// --- Main app (tabs + data) — only renders when authenticated ---

function MainApp() {
  const { logout } = useAuth();
  const [logs, setLogs] = useState([]);
  const [pins, setPins] = useState(SEED_PINS);
  const [ready, setReady] = useState(false);

  // Load persisted data on startup
  useEffect(() => {
    (async () => {
      const [savedLogs, savedPins] = await Promise.all([loadLogs(), loadPins()]);
      if (savedLogs.length > 0) setLogs(savedLogs);
      if (savedPins) setPins(savedPins);
      setReady(true);
    })();
  }, []);

  // Persist logs whenever they change
  useEffect(() => {
    if (ready) saveLogs(logs);
  }, [logs, ready]);

  // Persist pins whenever they change
  useEffect(() => {
    if (ready) savePins(pins);
  }, [pins, ready]);

  const addLog = useCallback((entry) => setLogs((prev) => [entry, ...prev]), []);
  const deleteLog = useCallback((id) => setLogs((prev) => prev.filter((l) => l.id !== id)), []);

  const handleLogout = useCallback(() => {
    Alert.alert("Log Out", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Log Out", style: "destructive", onPress: () => logout() },
    ]);
  }, [logout]);

  return (
    <WeatherProvider>
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarStyle: {
            backgroundColor: COLORS.bg,
            borderTopColor: COLORS.border,
            borderTopWidth: 1,
            height: 62,
            paddingBottom: 10,
            paddingTop: 8,
          },
          tabBarActiveTintColor: COLORS.green,
          tabBarInactiveTintColor: COLORS.muted,
          tabBarLabelStyle: { fontWeight: "800" },
          tabBarIcon: ({ focused, color, size }) => {
            const icons = TAB_ICONS[route.name];
            const iconName = focused ? icons.focused : icons.unfocused;
            return <Ionicons name={iconName} size={size} color={color} />;
          },
        })}
      >
        <Tab.Screen name="Today">{() => <TodayScreen onLogout={handleLogout} />}</Tab.Screen>
        <Tab.Screen name="Map">{() => <MapScreen pins={pins} setPins={setPins} />}</Tab.Screen>
        <Tab.Screen name="Log">{() => <LogScreen addLog={addLog} onLogout={handleLogout} />}</Tab.Screen>
        <Tab.Screen name="History">{() => <HistoryScreen logs={logs} deleteLog={deleteLog} onLogout={handleLogout} />}</Tab.Screen>
        <Tab.Screen name="Identify" component={IdentifyStackScreen} />
      </Tab.Navigator>
    </NavigationContainer>
    </WeatherProvider>
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
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  );
}
