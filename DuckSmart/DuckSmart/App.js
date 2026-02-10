import React, { useState } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";

import { COLORS } from "./constants/theme";

import TodayScreen from "./screens/TodayScreen";
import MapScreen from "./screens/MapScreen";
import LogScreen from "./screens/LogScreen";
import HistoryScreen from "./screens/HistoryScreen";
import IdentifyStackScreen from "./screens/IdentifyScreen";

const Tab = createBottomTabNavigator();

export default function App() {
  const [logs, setLogs] = useState([]);
  const [pins, setPins] = useState([
    {
      id: "seed-1",
      title: "North Marsh Edge",
      type: "Spot",
      notes: "Good flight line at first light.",
      coordinate: { latitude: 33.994, longitude: -83.382 },
      createdAt: Date.now() - 1000 * 60 * 60 * 24,
    },
  ]);

  const addLog = (entry) => setLogs((prev) => [entry, ...prev]);
  const deleteLog = (id) => setLogs((prev) => prev.filter((l) => l.id !== id));

  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={{
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
        }}
      >
        <Tab.Screen name="Today" component={TodayScreen} />
        <Tab.Screen name="Map">{() => <MapScreen pins={pins} setPins={setPins} />}</Tab.Screen>
        <Tab.Screen name="Log">{() => <LogScreen addLog={addLog} />}</Tab.Screen>
        <Tab.Screen name="History">{() => <HistoryScreen logs={logs} deleteLog={deleteLog} />}</Tab.Screen>
        <Tab.Screen name="Identify" component={IdentifyStackScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
