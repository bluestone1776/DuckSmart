// DuckSmart — Theme Context
//
// Provides accent color theming. Default is the classic green (#2ECC71).
// User selection persists locally via expo-file-system.

import React, { createContext, useContext, useState, useEffect } from "react";
import * as FileSystem from "expo-file-system";

const THEME_PATH = `${FileSystem.documentDirectory}theme_pref.json`;

const ACCENT_PRESETS = [
  { key: "green", label: "Classic Green", color: "#2ECC71", bg: "#0E1A12" },
  { key: "blue", label: "Cold Front Blue", color: "#3498DB", bg: "#0E1520" },
  { key: "orange", label: "Sunrise Orange", color: "#E67E22", bg: "#1A1308" },
  { key: "gold", label: "Retriever Gold", color: "#F1C40F", bg: "#1A1708" },
  { key: "red", label: "Redhead Red", color: "#E74C3C", bg: "#1A0E0E" },
  { key: "teal", label: "Teal Wing", color: "#1ABC9C", bg: "#0E1A18" },
];

const ThemeContext = createContext({
  accent: ACCENT_PRESETS[0],
  accentColor: "#2ECC71",
  accentBg: "#0E1A12",
  presets: ACCENT_PRESETS,
  setAccent: () => {},
});

export function ThemeProvider({ children }) {
  const [accent, setAccentState] = useState(ACCENT_PRESETS[0]);

  // Load saved preference on mount
  useEffect(() => {
    (async () => {
      try {
        const info = await FileSystem.getInfoAsync(THEME_PATH);
        if (info.exists) {
          const raw = await FileSystem.readAsStringAsync(THEME_PATH);
          const data = JSON.parse(raw);
          const found = ACCENT_PRESETS.find((p) => p.key === data.key);
          if (found) setAccentState(found);
        }
      } catch {
        // Default theme
      }
    })();
  }, []);

  async function setAccent(preset) {
    setAccentState(preset);
    try {
      await FileSystem.writeAsStringAsync(THEME_PATH, JSON.stringify({ key: preset.key }));
    } catch {
      // Silent — preference will be lost on restart
    }
  }

  return (
    <ThemeContext.Provider
      value={{
        accent,
        accentColor: accent.color,
        accentBg: accent.bg,
        presets: ACCENT_PRESETS,
        setAccent,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
