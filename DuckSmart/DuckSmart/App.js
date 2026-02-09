import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  StatusBar,
  TextInput,
  Alert,
  Platform,
  KeyboardAvoidingView,
  Image,
  Modal,
} from "react-native";

import MapView, { Marker } from "react-native-maps";
import * as Location from "expo-location";
import * as ImagePicker from "expo-image-picker";
import Svg, { Path, Circle, Text as SvgText, Defs, LinearGradient, Stop } from "react-native-svg";

import { NavigationContainer, useNavigation } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

// -----------------------------
// Assets (drop these in ./assets)
// -----------------------------
const ASSETS = {
  logo: require("./assets/logo_ducksmart.png"),
  spreads: {
    "J-Hook": require("./assets/spread_j_hook.png"),
    "U-Shape": require("./assets/spread_u_shape.png"),
    "Pods + Landing Zone": require("./assets/spread_pods.png"),
    Runway: require("./assets/spread_runway.png"),
    "V-Spread": require("./assets/spread_v_spread.png"),
    "Timber Pocket": require("./assets/spread_timber_pocket.png"),
  },
  ducks: {
    Mallard: require("./assets/duck_mallard.png"),
    "Wood Duck": require("./assets/duck_wood_duck.png"),
    Gadwall: require("./assets/duck_gadwall.png"),
    "Green-winged Teal": require("./assets/duck_green_wing_teal.png"),
    Canvasback: require("./assets/duck_canvasback.png"),
  },
};

// -----------------------------
// Helpers / Shared UI
// -----------------------------
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

function formatWind(deg) {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const idx = Math.round(deg / 45) % 8;
  return dirs[idx];
}

function scoreHunt(weather) {
  let score = 50;
  if (weather.windMph >= 6 && weather.windMph <= 18) score += 12;
  if (weather.windMph < 3) score -= 10;
  if (weather.windMph > 22) score -= 8;

  if (weather.deltaTemp24hF <= -8) score += 12;
  if (weather.deltaTemp24hF >= 8) score -= 6;

  if (weather.deltaPressure3h >= 0.05) score += 6;
  if (weather.deltaPressure3h <= -0.05) score += 4;

  if (weather.precipChance >= 20 && weather.precipChance <= 55) score += 6;
  if (weather.precipChance >= 75) score -= 6;

  if (weather.cloudPct >= 35 && weather.cloudPct <= 85) score += 5;
  if (weather.cloudPct < 15) score -= 3;

  return { score: clamp(score, 0, 100) };
}

function Card({ title, right, children }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{title}</Text>
        {right ? <View>{right}</View> : null}
      </View>
      <View style={{ marginTop: 10 }}>{children}</View>
    </View>
  );
}

function Chip({ label, selected, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, selected ? styles.chipSelected : styles.chipUnselected]}
    >
      <Text style={[styles.chipText, selected ? styles.chipTextSelected : null]}>{label}</Text>
    </Pressable>
  );
}

// Half gauge with red→green gradient (matches earlier request)
function HalfGaugeGradient({ value, size = 260 }) {
  const stroke = 16;
  const radius = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;

  const startX = cx - radius;
  const startY = cy;
  const endX = cx + radius;
  const endY = cy;

  const d = `M ${startX} ${startY} A ${radius} ${radius} 0 0 1 ${endX} ${endY}`;

  const p = clamp(value, 0, 100) / 100;
  const angle = Math.PI * (1 - p);
  const needleX = cx + radius * Math.cos(angle);
  const needleY = cy - radius * Math.sin(angle);

  const arcLen = Math.PI * radius;

  return (
    <View style={{ alignItems: "center" }}>
      <Svg width={size} height={size * 0.62} viewBox={`0 0 ${size} ${size}`}>
        <Defs>
          <LinearGradient id="rg" x1="0" y1="0" x2={size} y2="0">
            <Stop offset="0%" stopColor="#D94C4C" />
            <Stop offset="55%" stopColor="#D9A84C" />
            <Stop offset="100%" stopColor="#4CD97B" />
          </LinearGradient>
        </Defs>

        {/* base arc */}
        <Path d={d} stroke="#2A2A2A" strokeWidth={stroke} strokeLinecap="round" fill="none" />

        {/* progress arc (gradient stroke) */}
        <Path
          d={d}
          stroke="url(#rg)"
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${arcLen * p} ${arcLen}`}
        />

        {/* needle */}
        <Circle cx={needleX} cy={needleY} r={10} fill="#FFFFFF" />
        <Circle cx={needleX} cy={needleY} r={6} fill="#0F0F0F" />

        <SvgText x={cx} y={cy - 12} fill="#FFFFFF" fontSize="40" fontWeight="800" textAnchor="middle">
          {Math.round(value)}
        </SvgText>
        <SvgText x={cx} y={cy + 20} fill="#BDBDBD" fontSize="12" fontWeight="700" textAnchor="middle">
          Hunt Score
        </SvgText>
      </Svg>
    </View>
  );
}

// -----------------------------
// TODAY / HOME (User-provided screen code)
// -----------------------------
function TodayScreen() {
  const navigation = useNavigation();

  // MVP state (later: load from GPS + weather API + saved default environment)
  const environments = ["Marsh", "Timber", "Field", "Open Water", "River"];
  const [environment, setEnvironment] = useState("Marsh");

  const weather = useMemo(
    () => ({
      locationName: "Your Area",
      tempF: 31,
      feelsLikeF: 26,
      windMph: 12,
      windDeg: 315,
      pressureInHg: 30.08,
      deltaTemp24hF: -10, // temp change vs 24h ago
      deltaPressure3h: 0.06, // pressure change vs 3h ago
      precipChance: 35,
      cloudPct: 70,
      sunrise: "7:32 AM",
      sunset: "5:18 PM",
      hourly: [
        { t: "Now", temp: 31, precip: 25, wind: 12, gust: 18 },
        { t: "1p", temp: 33, precip: 30, wind: 13, gust: 20 },
        { t: "2p", temp: 34, precip: 35, wind: 14, gust: 22 },
        { t: "3p", temp: 34, precip: 40, wind: 13, gust: 21 },
        { t: "4p", temp: 32, precip: 30, wind: 11, gust: 17 },
      ],
    }),
    []
  );

  const hunt = useMemo(() => scoreHuntToday(weather), [weather]);
  const spread = useMemo(
    () => spreadRecommendationToday({ environment, windDeg: weather.windDeg }),
    [environment, weather.windDeg]
  );

  return (
    <SafeAreaView style={todayStyles.safe}>
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={todayStyles.container}>
        {/* Header */}
        <View style={todayStyles.headerRow}>
          <View>
            <Text style={todayStyles.brand}>
              <Text style={todayStyles.brandDuck}>Duck</Text>
              <Text style={todayStyles.brandSmart}>Smart</Text>
            </Text>
            <Text style={todayStyles.subHeader}>
              Today • {weather.locationName}
            </Text>
          </View>

          <Pressable style={todayStyles.gearButton} onPress={() => {}}>
            <Text style={todayStyles.gearText}>⚙︎</Text>
          </Pressable>
        </View>

        {/* Environment selector */}
        <View style={{ marginTop: 12 }}>
          <Text style={todayStyles.sectionLabel}>Environment</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={todayStyles.chipRow}>
              {environments.map((env) => (
                <TodayChip
                  key={env}
                  label={env}
                  selected={env === environment}
                  onPress={() => setEnvironment(env)}
                />
              ))}
            </View>
          </ScrollView>
        </View>

        {/* Hunt probability */}
        <TodayCard
          title="Hunt Probability"
          right={
            <View style={todayStyles.scorePill}>
              <Text style={todayStyles.scorePillText}>
                {hunt.score >= 70 ? "Prime" : hunt.score >= 45 ? "Fair" : "Tough"}
              </Text>
            </View>
          }
        >
          <TodayHalfGauge value={hunt.score} />

          <View style={todayStyles.whyBox}>
            <Text style={todayStyles.whyTitle}>Why this score</Text>
            {hunt.why.length === 0 ? (
              <Text style={todayStyles.whyText}>Add more signals to explain this.</Text>
            ) : (
              hunt.why.map((item, idx) => (
                <View key={idx} style={todayStyles.whyRow}>
                  <Text style={todayStyles.whyBullet}>
                    {item.type === "up" ? "▲" : "▼"}
                  </Text>
                  <Text style={todayStyles.whyText}>{item.text}</Text>
                </View>
              ))
            )}
          </View>
        </TodayCard>

        {/* Real-time Weather */}
        <TodayCard title="Real-Time Weather">
          <View style={todayStyles.metricRow}>
            <TodayMetricPill label="Temp" value={`${weather.tempF}°F`} />
            <TodayMetricPill label="Feels" value={`${weather.feelsLikeF}°F`} />
            <TodayMetricPill
              label="Wind"
              value={`${weather.windMph} mph ${formatWind(weather.windDeg)}`}
            />
          </View>

          <View style={todayStyles.metricRow}>
            <TodayMetricPill label="Pressure" value={`${weather.pressureInHg}`} />
            <TodayMetricPill label="Precip" value={`${weather.precipChance}%`} />
            <TodayMetricPill label="Clouds" value={`${weather.cloudPct}%`} />
          </View>

          <View style={todayStyles.sunRow}>
            <View style={todayStyles.sunPill}>
              <Text style={todayStyles.sunLabel}>Sunrise</Text>
              <Text style={todayStyles.sunValue}>{weather.sunrise}</Text>
            </View>
            <View style={todayStyles.sunPill}>
              <Text style={todayStyles.sunLabel}>Sunset</Text>
              <Text style={todayStyles.sunValue}>{weather.sunset}</Text>
            </View>
          </View>
        </TodayCard>

        {/* Hourly quick look */}
        <TodayCard title="Hourly Snapshot">
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={todayStyles.hourlyRow}>
              {weather.hourly.map((h) => (
                <View key={h.t} style={todayStyles.hourlyCard}>
                  <Text style={todayStyles.hourlyTime}>{h.t}</Text>
                  <Text style={todayStyles.hourlyTemp}>{h.temp}°</Text>
                  <Text style={todayStyles.hourlySmall}>Precip {h.precip}%</Text>
                  <Text style={todayStyles.hourlySmall}>Wind {h.wind} mph</Text>
                  <Text style={todayStyles.hourlySmall}>Gust {h.gust}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
        </TodayCard>

        {/* Spread recommendation */}
        <TodayCard title="Recommended Spread Right Now">
          <Text style={todayStyles.spreadName}>{spread.name}</Text>
          <Text style={todayStyles.spreadDetail}>{spread.detail}</Text>

          <View style={todayStyles.spreadActionsRow}>
            <Pressable style={todayStyles.primaryBtn} onPress={() => {}}>
              <Text style={todayStyles.primaryBtnText}>View Diagram</Text>
            </Pressable>
            <Pressable style={todayStyles.secondaryBtn} onPress={() => {}}>
              <Text style={todayStyles.secondaryBtnText}>Save to Hunt Log</Text>
            </Pressable>
          </View>

          <View style={todayStyles.diagramPlaceholder}>
            <Text style={todayStyles.diagramPlaceholderText}>
              Diagram preview placeholder
            </Text>
            <Text style={todayStyles.diagramPlaceholderSub}>
              (We’ll wire this to your spread images next.)
            </Text>
          </View>
        </TodayCard>

        {/* Quick actions */}
        <View style={todayStyles.quickActions}>
          <Pressable style={todayStyles.actionBtn} onPress={() => navigation.navigate("Log")}>
            <Text style={todayStyles.actionBtnText}>Log Hunt</Text>
          </Pressable>
          <Pressable style={todayStyles.actionBtn} onPress={() => navigation.navigate("History")}>
            <Text style={todayStyles.actionBtnText}>Hunt History</Text>
          </Pressable>
          <Pressable style={todayStyles.actionBtn} onPress={() => navigation.navigate("Identify")}>
            <Text style={todayStyles.actionBtnText}>Identify Duck</Text>
          </Pressable>
        </View>

        <View style={{ height: 22 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ----- Today helpers/components (isolated so other screens remain unchanged) -----
function scoreHuntToday(weather) {
  let score = 50;
  const reasonsUp = [];
  const reasonsDown = [];

  if (weather.windMph >= 6 && weather.windMph <= 18) {
    score += 12;
    reasonsUp.push("Good wind speed for movement + decoy realism.");
  } else if (weather.windMph < 3) {
    score -= 10;
    reasonsDown.push("Dead-calm wind can make birds cautious.");
  } else if (weather.windMph > 22) {
    score -= 8;
    reasonsDown.push("Strong wind can reduce comfort and shooting windows.");
  }

  if (weather.deltaTemp24hF <= -8) {
    score += 12;
    reasonsUp.push("Recent temperature drop can spark movement.");
  } else if (weather.deltaTemp24hF >= 8) {
    score -= 6;
    reasonsDown.push("Warm-up can slow daytime movement.");
  }

  if (weather.deltaPressure3h >= 0.05) {
    score += 6;
    reasonsUp.push("Rising pressure often follows a front (good windows).");
  } else if (weather.deltaPressure3h <= -0.05) {
    score += 4;
    reasonsUp.push("Falling pressure can precede a front (birds may feed).");
  }

  if (weather.precipChance >= 20 && weather.precipChance <= 55) {
    score += 6;
    reasonsUp.push("Light weather can improve concealment and movement.");
  } else if (weather.precipChance >= 75) {
    score -= 6;
    reasonsDown.push("High precipitation can reduce visibility and comfort.");
  }

  if (weather.cloudPct >= 35 && weather.cloudPct <= 85) {
    score += 5;
    reasonsUp.push("Cloud cover can extend quality light + reduce glare.");
  } else if (weather.cloudPct < 15) {
    score -= 3;
    reasonsDown.push("Bluebird skies can increase pressure and visibility.");
  }

  score = clamp(score, 0, 100);

  const why = [
    ...reasonsUp.slice(0, 2).map((t) => ({ type: "up", text: t })),
    ...reasonsDown.slice(0, 2).map((t) => ({ type: "down", text: t })),
  ].slice(0, 3);

  return { score, why };
}

function spreadRecommendationToday({ environment, windDeg }) {
  const wind = formatWind(windDeg);

  if (environment === "Timber") {
    return {
      name: "Small Pocket / Landing Hole",
      detail: `Keep it tight. Open a landing hole downwind. Wind: ${wind}.`,
    };
  }
  if (environment === "Marsh") {
    return {
      name: "J-Hook",
      detail: `Set the hook into the wind; keep the kill hole just off the tip. Wind: ${wind}.`,
    };
  }
  if (environment === "Field") {
    return {
      name: "Pods + Landing Zone",
      detail: `Two pods with a wide landing zone downwind. Wind: ${wind}.`,
    };
  }
  if (environment === "Open Water") {
    return {
      name: "U-Shape",
      detail: `Open end downwind; keep a clean runway to the pocket. Wind: ${wind}.`,
    };
  }
  return {
    name: "Runway Line",
    detail: `Create a runway into the wind with a clean pocket. Wind: ${wind}.`,
  };
}

function TodayCard({ title, right, children }) {
  return (
    <View style={todayStyles.card}>
      <View style={todayStyles.cardHeader}>
        <Text style={todayStyles.cardTitle}>{title}</Text>
        {right ? <View>{right}</View> : null}
      </View>
      <View style={{ marginTop: 10 }}>{children}</View>
    </View>
  );
}

function TodayChip({ label, selected, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        todayStyles.chip,
        selected ? todayStyles.chipSelected : todayStyles.chipUnselected,
      ]}
    >
      <Text style={[todayStyles.chipText, selected ? todayStyles.chipTextSelected : null]}>
        {label}
      </Text>
    </Pressable>
  );
}

function TodayMetricPill({ label, value }) {
  return (
    <View style={todayStyles.metricPill}>
      <Text style={todayStyles.metricLabel}>{label}</Text>
      <Text style={todayStyles.metricValue}>{value}</Text>
    </View>
  );
}

function TodayHalfGauge({ value, size = 220 }) {
  const stroke = 14;
  const radius = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;

  const startX = cx - radius;
  const startY = cy;
  const endX = cx + radius;
  const endY = cy;

  const d = `M ${startX} ${startY} A ${radius} ${radius} 0 0 1 ${endX} ${endY}`;

  const p = clamp(value, 0, 100) / 100;
  const angle = Math.PI * (1 - p);
  const needleX = cx + radius * Math.cos(angle);
  const needleY = cy - radius * Math.sin(angle);

  const arcColor = value < 40 ? "#D94C4C" : value < 70 ? "#D9A84C" : "#4CD97B";

  return (
    <View style={{ alignItems: "center" }}>
      <Svg width={size} height={size * 0.62} viewBox={`0 0 ${size} ${size}`}>
        <Path d={d} stroke="#2A2A2A" strokeWidth={stroke} strokeLinecap="round" fill="none" />
        <Path
          d={d}
          stroke={arcColor}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${Math.PI * radius * p} ${Math.PI * radius}`}
        />
        <Circle cx={needleX} cy={needleY} r={9} fill="#FFFFFF" />
        <Circle cx={needleX} cy={needleY} r={5} fill="#0F0F0F" />

        <SvgText x={cx} y={cy - 10} fill="#FFFFFF" fontSize="34" fontWeight="700" textAnchor="middle">
          {Math.round(value)}
        </SvgText>
        <SvgText x={cx} y={cy + 18} fill="#BDBDBD" fontSize="12" textAnchor="middle">
          Hunt Probability
        </SvgText>
      </Svg>

      <View style={todayStyles.gaugeLegendRow}>
        <Text style={todayStyles.legendText}>Low</Text>
        <Text style={todayStyles.legendText}>High</Text>
      </View>
    </View>
  );
}

const todayStyles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#000000" },
  container: { padding: 16, paddingBottom: 28, backgroundColor: "#000000" },

  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  brand: { fontSize: 28, fontWeight: "800", letterSpacing: 0.2 },
  brandDuck: { color: "#FFFFFF" },
  brandSmart: { color: "#2ECC71" },
  subHeader: { marginTop: 4, color: "#BDBDBD", fontSize: 13 },

  gearButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2A2A2A",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0B0B0B",
  },
  gearText: { color: "#FFFFFF", fontSize: 18 },

  sectionLabel: { color: "#BDBDBD", fontSize: 12, marginBottom: 8 },
  chipRow: { flexDirection: "row", gap: 10, paddingBottom: 4 },
  chip: { paddingVertical: 9, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1 },
  chipSelected: { backgroundColor: "#0E1A12", borderColor: "#2ECC71" },
  chipUnselected: { backgroundColor: "#0B0B0B", borderColor: "#2A2A2A" },
  chipText: { fontSize: 13, fontWeight: "700", color: "#FFFFFF" },
  chipTextSelected: { color: "#2ECC71" },

  card: {
    marginTop: 14,
    backgroundColor: "#0B0B0B",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#2A2A2A",
    padding: 14,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardTitle: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },

  scorePill: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "#111111",
    borderWidth: 1,
    borderColor: "#2A2A2A",
  },
  scorePillText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" },

  gaugeLegendRow: { width: 220, flexDirection: "row", justifyContent: "space-between", marginTop: -6 },
  legendText: { color: "#7A7A7A", fontSize: 12, fontWeight: "700" },

  whyBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: "#070707",
    borderWidth: 1,
    borderColor: "#1F1F1F",
  },
  whyTitle: { color: "#FFFFFF", fontSize: 13, fontWeight: "800", marginBottom: 8 },
  whyRow: { flexDirection: "row", gap: 8, marginBottom: 6, alignItems: "flex-start" },
  whyBullet: { color: "#BDBDBD", fontWeight: "900", marginTop: 1 },
  whyText: { color: "#BDBDBD", fontSize: 13, lineHeight: 18, flex: 1 },

  metricRow: { flexDirection: "row", gap: 10, marginBottom: 10 },
  metricPill: { flex: 1, padding: 12, borderRadius: 14, backgroundColor: "#070707", borderWidth: 1, borderColor: "#1F1F1F" },
  metricLabel: { color: "#8E8E8E", fontSize: 11, fontWeight: "700" },
  metricValue: { marginTop: 6, color: "#FFFFFF", fontSize: 16, fontWeight: "900" },

  sunRow: { flexDirection: "row", gap: 10 },
  sunPill: { flex: 1, padding: 12, borderRadius: 14, backgroundColor: "#070707", borderWidth: 1, borderColor: "#1F1F1F" },
  sunLabel: { color: "#8E8E8E", fontSize: 11, fontWeight: "700" },
  sunValue: { marginTop: 6, color: "#FFFFFF", fontSize: 14, fontWeight: "900" },

  hourlyRow: { flexDirection: "row", gap: 10 },
  hourlyCard: { width: 110, padding: 12, borderRadius: 14, backgroundColor: "#070707", borderWidth: 1, borderColor: "#1F1F1F" },
  hourlyTime: { color: "#BDBDBD", fontWeight: "800", fontSize: 12 },
  hourlyTemp: { color: "#FFFFFF", fontWeight: "900", fontSize: 22, marginTop: 6, marginBottom: 6 },
  hourlySmall: { color: "#8E8E8E", fontSize: 11, fontWeight: "700" },

  spreadName: { color: "#FFFFFF", fontSize: 18, fontWeight: "900" },
  spreadDetail: { color: "#BDBDBD", marginTop: 6, fontSize: 13, lineHeight: 18 },
  spreadActionsRow: { flexDirection: "row", gap: 10, marginTop: 12 },
  primaryBtn: { flex: 1, paddingVertical: 12, borderRadius: 14, backgroundColor: "#0E1A12", borderWidth: 1, borderColor: "#2ECC71", alignItems: "center" },
  primaryBtnText: { color: "#2ECC71", fontWeight: "900" },
  secondaryBtn: { flex: 1, paddingVertical: 12, borderRadius: 14, backgroundColor: "#070707", borderWidth: 1, borderColor: "#2A2A2A", alignItems: "center" },
  secondaryBtnText: { color: "#FFFFFF", fontWeight: "900" },

  diagramPlaceholder: { marginTop: 12, height: 120, borderRadius: 14, borderWidth: 1, borderColor: "#1F1F1F", backgroundColor: "#050505", alignItems: "center", justifyContent: "center" },
  diagramPlaceholderText: { color: "#BDBDBD", fontWeight: "800" },
  diagramPlaceholderSub: { color: "#7A7A7A", marginTop: 6, fontSize: 12, fontWeight: "700" },

  quickActions: { marginTop: 14, flexDirection: "row", gap: 10 },
  actionBtn: { flex: 1, paddingVertical: 14, borderRadius: 16, backgroundColor: "#0B0B0B", borderWidth: 1, borderColor: "#2A2A2A", alignItems: "center" },
  actionBtnText: { color: "#FFFFFF", fontWeight: "900" },
});


// -----------------------------
// MAP (pins)
// -----------------------------
const PIN_TYPES = [
  { key: "Spot", label: "Spot" },
  { key: "Roost", label: "Roost" },
  { key: "Feed", label: "Feed" },
  { key: "FlightLine", label: "Flight Line" },
  { key: "Parking", label: "Parking" },
  { key: "Hazard", label: "Hazard" },
];

function MapScreen({ pins, setPins }) {
  const mapRef = useRef(null);
  const [permissionState, setPermissionState] = useState("unknown");
  const [userLoc, setUserLoc] = useState(null);
  const [region, setRegion] = useState(null);

  const [isAddMode, setIsAddMode] = useState(false);
  const [draftCoord, setDraftCoord] = useState(null);
  const [draftType, setDraftType] = useState("Spot");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftNotes, setDraftNotes] = useState("");

  const [selectedPinId, setSelectedPinId] = useState(null);
  const selectedPin = useMemo(() => pins.find((p) => p.id === selectedPinId) || null, [pins, selectedPinId]);

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          setPermissionState("denied");
          return;
        }
        setPermissionState("granted");
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const coord = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
        setUserLoc(coord);

        const initialRegion = { ...coord, latitudeDelta: 0.03, longitudeDelta: 0.03 };
        setRegion(initialRegion);
        requestAnimationFrame(() => mapRef.current?.animateToRegion(initialRegion, 650));
      } catch {
        setPermissionState("denied");
      }
    })();
  }, []);

  function startAddPin() {
    setIsAddMode(true);
    setDraftCoord(null);
    setDraftTitle("");
    setDraftNotes("");
    setDraftType("Spot");
    setSelectedPinId(null);
  }

  function cancelAddPin() {
    setIsAddMode(false);
    setDraftCoord(null);
  }

  function onMapPress(e) {
    if (!isAddMode) return;
    const coord = e?.nativeEvent?.coordinate;
    if (coord) setDraftCoord(coord);
  }

  function savePin() {
    if (!draftCoord) {
      Alert.alert("Drop a pin", "Tap the map to choose a pin location.");
      return;
    }
    const title = draftTitle.trim() || `${draftType} Pin`;
    const notes = draftNotes.trim();

    const newPin = {
      id: `pin-${Date.now()}`,
      title,
      type: draftType,
      notes,
      coordinate: draftCoord,
      createdAt: Date.now(),
    };
    setPins((prev) => [newPin, ...prev]);
    setIsAddMode(false);
    setDraftCoord(null);

    requestAnimationFrame(() => {
      mapRef.current?.animateToRegion({ ...draftCoord, latitudeDelta: 0.02, longitudeDelta: 0.02 }, 500);
    });
  }

  function deleteSelectedPin() {
    if (!selectedPin) return;
    Alert.alert("Delete pin?", selectedPin.title, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          setPins((prev) => prev.filter((p) => p.id !== selectedPin.id));
          setSelectedPinId(null);
        },
      },
    ]);
  }

  function goToUser() {
    if (!userLoc) return;
    const r = { ...userLoc, latitudeDelta: 0.02, longitudeDelta: 0.02 };
    setRegion(r);
    mapRef.current?.animateToRegion(r, 500);
  }

  const mapInitial = region || {
    latitude: 33.994,
    longitude: -83.382,
    latitudeDelta: 0.06,
    longitudeDelta: 0.06,
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />
      <View style={styles.mapWrap}>
        <View style={styles.mapTopBar}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Image source={ASSETS.logo} style={styles.logoSmall} resizeMode="contain" />
            <View>
              <Text style={styles.brandSmall}>
                <Text style={styles.brandDuck}>Duck</Text>
                <Text style={styles.brandSmart}>Smart</Text>
              </Text>
              <Text style={styles.subHeaderSmall}>
                Map • Pins & Scouting{permissionState === "denied" ? " • Location Off" : ""}
              </Text>
            </View>
          </View>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable style={styles.iconBtn} onPress={goToUser} disabled={!userLoc}>
              <Text style={styles.iconBtnText}>◎</Text>
            </Pressable>
            <Pressable
              style={[styles.iconBtn, isAddMode ? styles.iconBtnActive : null]}
              onPress={isAddMode ? cancelAddPin : startAddPin}
            >
              <Text style={styles.iconBtnText}>{isAddMode ? "✕" : "+"}</Text>
            </Pressable>
          </View>
        </View>

        <MapView
          ref={mapRef}
          style={styles.map}
          initialRegion={mapInitial}
          onPress={onMapPress}
          showsUserLocation={permissionState === "granted"}
          showsMyLocationButton={false}
          rotateEnabled={false}
          toolbarEnabled={false}
        >
          {pins.map((p) => (
            <Marker
              key={p.id}
              coordinate={p.coordinate}
              title={p.title}
              description={`${p.type}${p.notes ? ` • ${p.notes}` : ""}`}
              onPress={() => {
                setSelectedPinId(p.id);
                setIsAddMode(false);
                setDraftCoord(null);
              }}
            />
          ))}
          {isAddMode && draftCoord ? <Marker coordinate={draftCoord} pinColor="#2ECC71" title="New Pin" /> : null}
        </MapView>

        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={styles.sheet}>
            {isAddMode ? (
              <>
                <RowHeader title="Add Pin" pill={draftCoord ? "Tap Save" : "Tap map to drop"} />

                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.chipRow}>
                    {PIN_TYPES.map((t) => (
                      <Chip key={t.key} label={t.label} selected={draftType === t.key} onPress={() => setDraftType(t.key)} />
                    ))}
                  </View>
                </ScrollView>

                <View style={{ marginTop: 10 }}>
                  <Text style={styles.inputLabel}>Title</Text>
                  <TextInput
                    value={draftTitle}
                    onChangeText={setDraftTitle}
                    placeholder="e.g., South timber hole"
                    placeholderTextColor="#6D6D6D"
                    style={styles.input}
                  />
                </View>

                <View style={{ marginTop: 10 }}>
                  <Text style={styles.inputLabel}>Notes</Text>
                  <TextInput
                    value={draftNotes}
                    onChangeText={setDraftNotes}
                    placeholder="Wind, access, birds seen, hazards..."
                    placeholderTextColor="#6D6D6D"
                    style={[styles.input, { height: 78, textAlignVertical: "top" }]}
                    multiline
                  />
                </View>

                <View style={styles.sheetBtnRow}>
                  <Pressable style={styles.secondaryBtn} onPress={cancelAddPin}>
                    <Text style={styles.secondaryBtnText}>Cancel</Text>
                  </Pressable>
                  <Pressable style={styles.primaryBtn} onPress={savePin}>
                    <Text style={styles.primaryBtnText}>Save Pin</Text>
                  </Pressable>
                </View>
              </>
            ) : selectedPin ? (
              <>
                <View style={styles.sheetHeaderRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sheetTitle}>{selectedPin.title}</Text>
                    <Text style={styles.sheetSub}>
                      {selectedPin.type} • {selectedPin.coordinate.latitude.toFixed(5)}, {selectedPin.coordinate.longitude.toFixed(5)}
                    </Text>
                  </View>
                  <Pressable style={styles.trashBtn} onPress={deleteSelectedPin}>
                    <Text style={styles.trashBtnText}>🗑</Text>
                  </Pressable>
                </View>

                <View style={styles.noteBox}>
                  <Text style={selectedPin.notes ? styles.noteText : styles.noteTextMuted}>
                    {selectedPin.notes || "No notes yet."}
                  </Text>
                </View>

                <View style={styles.sheetBtnRow}>
                  <Pressable style={styles.secondaryBtn} onPress={() => setSelectedPinId(null)}>
                    <Text style={styles.secondaryBtnText}>Close</Text>
                  </Pressable>
                  <Pressable
                    style={styles.primaryBtn}
                    onPress={() => mapRef.current?.animateToRegion({ ...selectedPin.coordinate, latitudeDelta: 0.015, longitudeDelta: 0.015 }, 450)}
                  >
                    <Text style={styles.primaryBtnText}>Center</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                <RowHeader title="Pins" pill={`${pins.length} saved`} />
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.pinListRow}>
                    {pins.slice(0, 10).map((p) => (
                      <Pressable
                        key={p.id}
                        style={styles.pinPill}
                        onPress={() => {
                          setSelectedPinId(p.id);
                          mapRef.current?.animateToRegion({ ...p.coordinate, latitudeDelta: 0.02, longitudeDelta: 0.02 }, 450);
                        }}
                      >
                        <Text style={styles.pinPillType}>{p.type}</Text>
                        <Text style={styles.pinPillTitle} numberOfLines={1}>
                          {p.title}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </ScrollView>
                <Text style={styles.sheetHint}>
                  Tap <Text style={{ color: "#2ECC71", fontWeight: "900" }}>+</Text> to add a scouting pin, or tap a marker to view details.
                </Text>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </View>
    </SafeAreaView>
  );
}

// -----------------------------
// LOG
// -----------------------------
const ENVIRONMENTS = ["Marsh", "Timber", "Field", "Open Water", "River"];
const SPREADS = ["J-Hook", "U-Shape", "Pods + Landing Zone", "Runway", "V-Spread", "Timber Pocket"];

function LogScreen({ addLog }) {
  const [environment, setEnvironment] = useState("Marsh");
  const [spread, setSpread] = useState("J-Hook");
  const [huntScore, setHuntScore] = useState(72);
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState([]);

  const [locPerm, setLocPerm] = useState("unknown");
  const [location, setLocation] = useState(null);
  const [mapRegion, setMapRegion] = useState(null);

  const [spreadModal, setSpreadModal] = useState(false);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setLocPerm("denied");
        return;
      }
      setLocPerm("granted");
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const coord = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      setLocation(coord);
      setMapRegion({ ...coord, latitudeDelta: 0.01, longitudeDelta: 0.01 });
    })();
  }, []);

  async function addPhotosFromLibrary() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Photos permission needed", "Enable photo access to attach pictures to your hunt log.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.85,
      selectionLimit: 6,
    });
    if (result.canceled) return;
    const picked = (result.assets || []).map((a) => ({ uri: a.uri, width: a.width, height: a.height }));
    setPhotos((prev) => [...picked, ...prev].slice(0, 12));
  }

  function removePhoto(uri) {
    setPhotos((prev) => prev.filter((p) => p.uri !== uri));
  }

  function resetForm() {
    setEnvironment("Marsh");
    setSpread("J-Hook");
    setHuntScore(72);
    setNotes("");
    setPhotos([]);
  }

  function validateAndSave() {
    if (!location) {
      Alert.alert("Missing GPS", "Wait for GPS (or enable location) before saving this hunt.");
      return;
    }
    const entry = {
      id: `hunt-${Date.now()}`,
      createdAt: Date.now(),
      dateTime: new Date().toISOString(),
      environment,
      spread,
      huntScore,
      notes: notes.trim(),
      location,
      photos,
    };
    addLog(entry);
    Alert.alert("Saved", "Your hunt log was saved (in-app memory for now).");
    resetForm();
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.container}>
          <Header subtitle="Log Hunt" />

          <Card title="GPS Location">
            {mapRegion ? (
              <View style={styles.miniMapWrap}>
                <MapView style={styles.miniMap} region={mapRegion} pointerEvents="none">
                  {location ? <Marker coordinate={location} /> : null}
                </MapView>
                <View style={styles.miniMapFooter}>
                  <Text style={styles.miniMapText}>
                    {location ? `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}` : "Getting GPS..."}
                  </Text>
                  <Text style={styles.miniMapMuted}>{locPerm === "denied" ? "Location permission denied" : "Saved with your hunt"}</Text>
                </View>
              </View>
            ) : (
              <View style={styles.noteBox}>
                <Text style={styles.noteTextMuted}>
                  {locPerm === "denied" ? "Location permission denied. Enable it to save GPS." : "Getting your GPS location..."}
                </Text>
              </View>
            )}
          </Card>

          <Card title="Environment">
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.chipRow}>
                {ENVIRONMENTS.map((env) => (
                  <Chip key={env} label={env} selected={env === environment} onPress={() => setEnvironment(env)} />
                ))}
              </View>
            </ScrollView>
          </Card>

          <Card
            title="Spread Layout Used"
            right={
              <Pressable style={styles.smallBtn} onPress={() => setSpreadModal(true)}>
                <Text style={styles.smallBtnText}>Preview</Text>
              </Pressable>
            }
          >
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.chipRow}>
                {SPREADS.map((s) => (
                  <Chip key={s} label={s} selected={s === spread} onPress={() => setSpread(s)} />
                ))}
              </View>
            </ScrollView>

            <Image source={ASSETS.spreads[spread]} style={styles.spreadThumb} resizeMode="cover" />

            <Modal visible={spreadModal} transparent animationType="fade" onRequestClose={() => setSpreadModal(false)}>
              <View style={styles.modalBackdrop}>
                <View style={styles.modalCard}>
                  <Text style={styles.modalTitle}>{spread}</Text>
                  <Image source={ASSETS.spreads[spread]} style={styles.modalImage} resizeMode="contain" />
                  <Pressable style={styles.primaryBtn} onPress={() => setSpreadModal(false)}>
                    <Text style={styles.primaryBtnText}>Close</Text>
                  </Pressable>
                </View>
              </View>
            </Modal>
          </Card>

          <Card title="Hunt Score (0–100)">
            <View style={{ alignItems: "center" }}>
              <Text style={{ color: "#FFFFFF", fontSize: 44, fontWeight: "900" }}>{huntScore}</Text>
              <Text style={{ color: "#BDBDBD", fontWeight: "900", marginTop: 6 }}>
                {huntScore >= 70 ? "Great day" : huntScore >= 45 ? "Decent" : "Grind"}
              </Text>
            </View>

            <View style={styles.presetRow}>
              {[25, 50, 75, 90].map((v) => (
                <Pressable key={v} onPress={() => setHuntScore(v)} style={[styles.presetBtn, huntScore === v ? styles.presetBtnActive : null]}>
                  <Text style={[styles.presetBtnText, huntScore === v ? styles.presetBtnTextActive : null]}>{v}</Text>
                </Pressable>
              ))}
              <Pressable onPress={() => setHuntScore((prev) => clamp(prev + 5, 0, 100))} style={styles.presetBtn}>
                <Text style={styles.presetBtnText}>+5</Text>
              </Pressable>
              <Pressable onPress={() => setHuntScore((prev) => clamp(prev - 5, 0, 100))} style={styles.presetBtn}>
                <Text style={styles.presetBtnText}>-5</Text>
              </Pressable>
            </View>
          </Card>

          <Card title="Notes">
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="What worked? Birds seen, calling, concealment, access..."
              placeholderTextColor="#6D6D6D"
              style={[styles.input, { height: 110, textAlignVertical: "top" }]}
              multiline
            />
          </Card>

          <Card
            title="Photos"
            right={
              <Pressable style={styles.smallBtn} onPress={addPhotosFromLibrary}>
                <Text style={styles.smallBtnText}>Add</Text>
              </Pressable>
            }
          >
            {photos.length === 0 ? (
              <View style={styles.noteBox}>
                <Text style={styles.noteTextMuted}>No photos attached yet.</Text>
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.photoRow}>
                  {photos.map((p) => (
                    <Pressable key={p.uri} onLongPress={() => removePhoto(p.uri)} style={styles.photoCard}>
                      <Image source={{ uri: p.uri }} style={styles.photo} />
                      <Text style={styles.photoHint}>Hold to remove</Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
            )}
          </Card>

          <View style={styles.sheetBtnRow}>
            <Pressable style={styles.secondaryBtn} onPress={resetForm}>
              <Text style={styles.secondaryBtnText}>Reset</Text>
            </Pressable>
            <Pressable style={styles.primaryBtn} onPress={validateAndSave}>
              <Text style={styles.primaryBtnText}>Save Hunt</Text>
            </Pressable>
          </View>

          <View style={{ height: 20 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// -----------------------------
// HISTORY
// -----------------------------
function HistoryScreen({ logs, deleteLog }) {
  const [query, setQuery] = useState("");
  const [filterEnv, setFilterEnv] = useState("All");
  const [filterSpread, setFilterSpread] = useState("All");
  const [selectedId, setSelectedId] = useState(null);
  const selected = useMemo(() => logs.find((l) => l.id === selectedId) || null, [logs, selectedId]);

  const environments = useMemo(() => ["All", ...Array.from(new Set(logs.map((l) => l.environment))).sort()], [logs]);
  const spreads = useMemo(() => ["All", ...Array.from(new Set(logs.map((l) => l.spread))).sort()], [logs]);

  const filtered = useMemo(() => {
    const q = (query || "").toLowerCase().trim();
    return logs
      .filter((l) => {
        if (filterEnv !== "All" && l.environment !== filterEnv) return false;
        if (filterSpread !== "All" && l.spread !== filterSpread) return false;
        if (!q) return true;
        const hay = [l.environment, l.spread, l.notes, new Date(l.dateTime).toLocaleString()].join(" | ").toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [logs, query, filterEnv, filterSpread]);

  function confirmDelete(id) {
    const log = logs.find((l) => l.id === id);
    Alert.alert("Delete hunt log?", log ? new Date(log.dateTime).toLocaleString() : "", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteLog(id) },
    ]);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.container}>
          <Header subtitle="Hunt History" />

          <Card title="Search & Filters">
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search notes, environment, spread, date..."
              placeholderTextColor="#6D6D6D"
              style={styles.input}
            />

            <Text style={styles.inputLabel}>Environment</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.chipRow}>
                {environments.map((e) => (
                  <Chip key={e} label={e} selected={filterEnv === e} onPress={() => setFilterEnv(e)} />
                ))}
              </View>
            </ScrollView>

            <Text style={styles.inputLabel}>Spread</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.chipRow}>
                {spreads.map((s) => (
                  <Chip key={s} label={s} selected={filterSpread === s} onPress={() => setFilterSpread(s)} />
                ))}
              </View>
            </ScrollView>
          </Card>

          <Card title="Logs">
            {filtered.length === 0 ? (
              <View style={styles.noteBox}>
                <Text style={styles.noteTextMuted}>No logs yet (or no matches). Create one in the Log tab.</Text>
              </View>
            ) : (
              filtered.map((l) => {
                const isSelected = selectedId === l.id;
                return (
                  <Pressable
                    key={l.id}
                    onPress={() => setSelectedId(isSelected ? null : l.id)}
                    style={[styles.historyRow, isSelected ? styles.historyRowSelected : null]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.historyTitle}>{new Date(l.dateTime).toLocaleString()}</Text>
                      <Text style={styles.historySub}>
                        {l.environment} • {l.spread} • Score {l.huntScore}
                      </Text>
                      <Image source={ASSETS.spreads[l.spread]} style={styles.spreadThumbSmall} resizeMode="cover" />
                      {l.notes ? (
                        <Text style={styles.historyNotes} numberOfLines={2}>
                          {l.notes}
                        </Text>
                      ) : null}
                    </View>

                    <Pressable onPress={() => confirmDelete(l.id)} style={styles.trashBtn}>
                      <Text style={styles.trashBtnText}>🗑</Text>
                    </Pressable>
                  </Pressable>
                );
              })
            )}
          </Card>

          {selected ? (
            <Card title="Details">
              <Text style={styles.detailLine}>
                <Text style={styles.detailLabel}>GPS:</Text>{" "}
                {selected.location.latitude.toFixed(5)}, {selected.location.longitude.toFixed(5)}
              </Text>

              <View style={styles.detailMapWrap}>
                <MapView
                  style={styles.detailMap}
                  region={{
                    latitude: selected.location.latitude,
                    longitude: selected.location.longitude,
                    latitudeDelta: 0.01,
                    longitudeDelta: 0.01,
                  }}
                  pointerEvents="none"
                >
                  <Marker coordinate={selected.location} />
                </MapView>
              </View>

              <View style={styles.noteBox}>
                <Text style={selected.notes ? styles.noteText : styles.noteTextMuted}>
                  {selected.notes || "No notes for this hunt."}
                </Text>
              </View>

              {selected.photos?.length ? (
                <>
                  <Text style={[styles.inputLabel, { marginTop: 12 }]}>Photos</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={styles.photoRow}>
                      {selected.photos.map((p) => (
                        <View key={p.uri} style={styles.photoCard}>
                          <Image source={{ uri: p.uri }} style={styles.photo} />
                        </View>
                      ))}
                    </View>
                  </ScrollView>
                </>
              ) : null}
            </Card>
          ) : null}

          <View style={{ height: 20 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// -----------------------------
// IDENTIFY (User-provided guided wizard + detail pages)
// -----------------------------
const identifySafeLower = (s) => (s || "").toString().toLowerCase();

function IdentifyCard({ title, right, children }) {
  return (
    <View style={identifyStyles.card}>
      <View style={identifyStyles.cardHeader}>
        <Text style={identifyStyles.cardTitle}>{title}</Text>
        {right ? <View>{right}</View> : null}
      </View>
      <View style={{ marginTop: 10 }}>{children}</View>
    </View>
  );
}

function IdentifyChip({ label, selected, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={[identifyStyles.chip, selected ? identifyStyles.chipSelected : identifyStyles.chipUnselected]}
    >
      <Text style={[identifyStyles.chipText, selected ? identifyStyles.chipTextSelected : null]}>{label}</Text>
    </Pressable>
  );
}

function IdentifyPill({ label, value }) {
  return (
    <View style={identifyStyles.pill}>
      <Text style={identifyStyles.pillLabel}>{label}</Text>
      <Text style={identifyStyles.pillValue}>{value}</Text>
    </View>
  );
}

function IdentifySectionLabel({ children }) {
  return <Text style={identifyStyles.sectionLabel}>{children}</Text>;
}

// MVP Species Data (local for MVP)
const IDENTIFY_SPECIES = [
  {
    id: "mallard",
    name: "Mallard",
    group: "Puddle (Dabbler)",
    size: "Large",
    habitats: ["Marsh", "Timber", "Open Water", "River", "Field"],
    regions: ["Southeast", "Midwest", "Northeast", "South Central", "West"],
    flightStyle: ["Steady", "Direct", "Strong"],
    keyMarks: [
      "Drake: green head, white neck ring, chestnut chest",
      "Hen: mottled brown with orange bill",
      "Blue/purple speculum with white borders",
    ],
    lookalikes: ["American Black Duck", "Mottled Duck"],
    legalNote:
      "Common game species in most areas; always confirm season dates and bag limits for your state/zone.",
    tips: [
      "Often vocal on approach; listen for quacks/chuckles.",
      "Hens can resemble mottled/black duck—use speculum and bill color.",
    ],
  },
  {
    id: "woodduck",
    name: "Wood Duck",
    group: "Puddle (Dabbler)",
    size: "Medium",
    habitats: ["Timber", "Marsh", "River"],
    regions: ["Southeast", "Midwest", "Northeast", "South Central"],
    flightStyle: ["Fast", "Erratic", "Tree-Line"],
    keyMarks: [
      "Drake: iridescent green/purple head with bold white face lines",
      "Hen: teardrop white eye ring, crested head",
      "Compact body; short neck",
    ],
    lookalikes: ["Mandarin Duck (rare/escaped)"],
    legalNote:
      "Often legal where seasons allow; verify wood duck limits separately (can differ by zone).",
    tips: [
      "In timber, they rocket through gaps—lead is different than open water birds.",
      "Listen for squeals/whistles, especially early.",
    ],
  },
  {
    id: "gadwall",
    name: "Gadwall",
    group: "Puddle (Dabbler)",
    size: "Medium",
    habitats: ["Marsh", "Open Water", "River"],
    regions: ["Southeast", "Midwest", "Northeast", "South Central", "West"],
    flightStyle: ["Steady", "Low", "Quick Turns"],
    keyMarks: [
      "Gray/brown overall; subtle patterning",
      "White speculum patch visible in flight",
      "Drake has black rump and chestnut wing coverts",
    ],
    lookalikes: ["Hen Mallard (at a glance)", "Wigeon (in flight)"],
    legalNote: "Usually legal during regular duck season; confirm local regs.",
    tips: ["Can be quiet; look for the white wing patch on passing birds."],
  },
  {
    id: "greenwing",
    name: "Green-winged Teal",
    group: "Puddle (Dabbler)",
    size: "Small",
    habitats: ["Marsh", "River", "Open Water"],
    regions: ["Southeast", "Midwest", "Northeast", "South Central", "West"],
    flightStyle: ["Very Fast", "Tight Flocks", "Zippy"],
    keyMarks: [
      "Drake: chestnut head with green eye patch",
      "Small silhouette; rapid wingbeats",
      "Green speculum (often flashes)",
    ],
    lookalikes: ["Blue-winged Teal", "Cinnamon Teal (west)"],
    legalNote: "Often has its own limit in some places; check teal vs duck limits.",
    tips: ["They juke hard—keep your head on the bird and swing through."],
  },
  {
    id: "canvasback",
    name: "Canvasback",
    group: "Diver",
    size: "Large",
    habitats: ["Open Water"],
    regions: ["Midwest", "Northeast", "South Central", "West"],
    flightStyle: ["Fast", "Powerful", "Low Over Water"],
    keyMarks: [
      "Sloping forehead; long profile",
      "Drake: red head, white back",
      "Often in big rafts on open water",
    ],
    lookalikes: ["Redhead", "Ring-necked Duck"],
    legalNote:
      "Diver limits can differ and can change; always confirm current season/limits.",
    tips: ["Look for the long, sloped head profile at distance."],
  },
];

// Wizard options
const IDENTIFY_REGIONS = ["Southeast", "Midwest", "Northeast", "South Central", "West"];
const IDENTIFY_HABITATS = ["Marsh", "Timber", "Field", "Open Water", "River"];
const IDENTIFY_SIZE = ["Small", "Medium", "Large"];
const IDENTIFY_FLIGHT = ["Steady", "Fast", "Very Fast", "Erratic", "Powerful", "Tree-Line", "Low"];

function computeIdentifyMatches({ region, habitat, size, flightTags, queryText }) {
  const q = identifySafeLower(queryText).trim();

  const scored = IDENTIFY_SPECIES.map((s) => {
    let score = 0;

    if (region && s.regions.includes(region)) score += 3;
    if (habitat && s.habitats.includes(habitat)) score += 3;
    if (size && s.size === size) score += 2;

    if (flightTags?.length) {
      const hits = flightTags.filter((t) => s.flightStyle.includes(t));
      score += hits.length * 2;
    }

    if (q) {
      const hay = identifySafeLower(
        [
          s.name,
          s.group,
          s.size,
          ...s.keyMarks,
          ...s.lookalikes,
          ...s.habitats,
          ...s.regions,
          ...s.flightStyle,
        ].join(" | ")
      );
      if (hay.includes(q)) score += 3;
    }

    if (!region && !habitat && !size && !(flightTags?.length) && !q) score += 1;

    return { species: s, score };
  });

  return scored
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
}

function IdentifyHome({ navigation }) {
  const [region, setRegion] = useState("Southeast");
  const [habitat, setHabitat] = useState("Marsh");
  const [size, setSize] = useState("Medium");
  const [flightTags, setFlightTags] = useState([]);
  const [query, setQuery] = useState("");

  const matches = useMemo(
    () => computeIdentifyMatches({ region, habitat, size, flightTags, queryText: query }),
    [region, habitat, size, flightTags, query]
  );

  function toggleFlight(tag) {
    setFlightTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  return (
    <SafeAreaView style={identifyStyles.safe}>
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={identifyStyles.container}>
        <View style={identifyStyles.headerRow}>
          <View>
            <Text style={identifyStyles.brand}>
              <Text style={identifyStyles.brandDuck}>Duck</Text>
              <Text style={identifyStyles.brandSmart}>Smart</Text>
            </Text>
            <Text style={identifyStyles.subHeader}>Identify Duck</Text>
          </View>
          <Pressable style={identifyStyles.gearButton} onPress={() => {}}>
            <Text style={identifyStyles.gearText}>⚙︎</Text>
          </Pressable>
        </View>

        <IdentifyCard title="Quick Search">
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Try: mallard, teal, white wing patch, diver..."
            placeholderTextColor="#6D6D6D"
            style={identifyStyles.input}
          />
          <Text style={identifyStyles.helpText}>
            Use this if you already noticed a key feature (color patch, size, or species name).
          </Text>
        </IdentifyCard>

        <IdentifyCard title="Guided Filters">
          <IdentifySectionLabel>Region</IdentifySectionLabel>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={identifyStyles.chipRow}>
              {IDENTIFY_REGIONS.map((r) => (
                <IdentifyChip key={r} label={r} selected={region === r} onPress={() => setRegion(r)} />
              ))}
            </View>
          </ScrollView>

          <IdentifySectionLabel>Habitat</IdentifySectionLabel>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={identifyStyles.chipRow}>
              {IDENTIFY_HABITATS.map((h) => (
                <IdentifyChip key={h} label={h} selected={habitat === h} onPress={() => setHabitat(h)} />
              ))}
            </View>
          </ScrollView>

          <IdentifySectionLabel>Size</IdentifySectionLabel>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={identifyStyles.chipRow}>
              {IDENTIFY_SIZE.map((s) => (
                <IdentifyChip key={s} label={s} selected={size === s} onPress={() => setSize(s)} />
              ))}
            </View>
          </ScrollView>

          <IdentifySectionLabel>Flight Style (pick any)</IdentifySectionLabel>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={identifyStyles.chipRow}>
              {IDENTIFY_FLIGHT.map((f) => (
                <IdentifyChip key={f} label={f} selected={flightTags.includes(f)} onPress={() => toggleFlight(f)} />
              ))}
            </View>
          </ScrollView>
        </IdentifyCard>

        <IdentifyCard
          title="Likely Matches"
          right={
            <View style={identifyStyles.sheetPill}>
              <Text style={identifyStyles.sheetPillText}>{matches.length} shown</Text>
            </View>
          }
        >
          {matches.length === 0 ? (
            <View style={identifyStyles.noteBox}>
              <Text style={identifyStyles.noteTextMuted}>
                No matches found. Try changing habitat/size or clear the search.
              </Text>
            </View>
          ) : (
            matches.map(({ species, score }) => (
              <Pressable
                key={species.id}
                onPress={() => navigation.navigate("SpeciesDetail", { id: species.id })}
                style={identifyStyles.matchRow}
              >
                <View style={{ flex: 1 }}>
                  <Text style={identifyStyles.matchTitle}>{species.name}</Text>
                  <Text style={identifyStyles.matchSub}>
                    {species.group} • {species.size} • {species.habitats.join(", ")}
                  </Text>
                  <Text style={identifyStyles.matchHint} numberOfLines={2}>
                    {species.keyMarks[0]}
                  </Text>
                </View>

                <View style={identifyStyles.scoreBubble}>
                  <Text style={identifyStyles.scoreBubbleText}>{score}</Text>
                </View>
              </Pressable>
            ))
          )}

          <Text style={identifyStyles.disclaimer}>
            Legal note: this MVP uses built-in info only. We’ll add state/zone regulations later from an authoritative source.
          </Text>
        </IdentifyCard>

        <View style={{ height: 22 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function SpeciesDetail({ route, navigation }) {
  const { id } = route.params;
  const s = IDENTIFY_SPECIES.find((x) => x.id === id);

  if (!s) {
    return (
      <SafeAreaView style={identifyStyles.safe}>
        <StatusBar barStyle="light-content" />
        <View style={[identifyStyles.container, { justifyContent: "center", alignItems: "center" }]}>
          <Text style={{ color: "#FFFFFF", fontSize: 18, fontWeight: "900" }}>Not found</Text>
          <Pressable style={[identifyStyles.primaryBtn, { marginTop: 12 }]} onPress={() => navigation.goBack()}>
            <Text style={identifyStyles.primaryBtnText}>Back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={identifyStyles.safe}>
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={identifyStyles.container}>
        <View style={identifyStyles.detailHeader}>
          <Pressable style={identifyStyles.backBtn} onPress={() => navigation.goBack()}>
            <Text style={identifyStyles.backBtnText}>‹</Text>
          </Pressable>

          <View style={{ flex: 1 }}>
            <Text style={identifyStyles.detailTitle}>{s.name}</Text>
            <Text style={identifyStyles.detailSub}>
              {s.group} • {s.size}
            </Text>
          </View>
        </View>

        <IdentifyCard title="At-a-glance">
          <View style={identifyStyles.pillRow}>
            <IdentifyPill label="Group" value={s.group.split(" ")[0]} />
            <IdentifyPill label="Size" value={s.size} />
            <IdentifyPill label="Habitat" value={s.habitats[0]} />
          </View>
          <View style={identifyStyles.pillRow}>
            <IdentifyPill label="Flight" value={s.flightStyle[0]} />
            <IdentifyPill label="Region" value={s.regions[0]} />
            <IdentifyPill label="Lookalike" value={s.lookalikes?.[0] || "-"} />
          </View>
        </IdentifyCard>

        <IdentifyCard title="Key Field Marks">
          {s.keyMarks.map((m, idx) => (
            <View key={idx} style={identifyStyles.bulletRow}>
              <Text style={identifyStyles.bullet}>•</Text>
              <Text style={identifyStyles.bulletText}>{m}</Text>
            </View>
          ))}
        </IdentifyCard>

        <IdentifyCard title="Commonly Mistaken For">
          {s.lookalikes?.length ? (
            s.lookalikes.map((m, idx) => (
              <View key={idx} style={identifyStyles.bulletRow}>
                <Text style={identifyStyles.bullet}>•</Text>
                <Text style={identifyStyles.bulletText}>{m}</Text>
              </View>
            ))
          ) : (
            <Text style={identifyStyles.noteTextMuted}>No common lookalikes listed.</Text>
          )}
        </IdentifyCard>

        <IdentifyCard title="Habitat & Behavior">
          <Text style={identifyStyles.longText}>
            Habitats: {s.habitats.join(", ")}
            {"\n"}Flight: {s.flightStyle.join(", ")}
            {"\n"}Regions: {s.regions.join(", ")}
          </Text>
          <View style={identifyStyles.noteBox}>
            <Text style={identifyStyles.noteTextMuted}>
            {s.tips.join("\n\n")}
            </Text>

          </View>
        </IdentifyCard>

        <IdentifyCard title="Legality (MVP)">
          <Text style={identifyStyles.longText}>{s.legalNote}</Text>
          <Text style={identifyStyles.disclaimer}>
            We’ll add real regulations by state/zone + season dates in a later phase.
          </Text>
        </IdentifyCard>

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const IdentifyStack = createNativeStackNavigator();
function IdentifyStackScreen() {
  return (
    <IdentifyStack.Navigator screenOptions={{ headerShown: false }}>
      <IdentifyStack.Screen name="IdentifyHome" component={IdentifyHome} />
      <IdentifyStack.Screen name="SpeciesDetail" component={SpeciesDetail} />
    </IdentifyStack.Navigator>
  );
}

const identifyStyles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#000000" },
  container: { padding: 16, paddingBottom: 28, backgroundColor: "#000000" },

  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  brand: { fontSize: 28, fontWeight: "800", letterSpacing: 0.2 },
  brandDuck: { color: "#FFFFFF" },
  brandSmart: { color: "#2ECC71" },
  subHeader: { marginTop: 4, color: "#BDBDBD", fontSize: 13 },

  gearButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2A2A2A",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0B0B0B",
  },
  gearText: { color: "#FFFFFF", fontSize: 18 },

  card: {
    marginTop: 14,
    backgroundColor: "#0B0B0B",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#2A2A2A",
    padding: 14,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardTitle: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },

  input: {
    borderWidth: 1,
    borderColor: "#2A2A2A",
    backgroundColor: "#070707",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#FFFFFF",
    fontWeight: "800",
  },

  sectionLabel: { color: "#BDBDBD", fontSize: 12, fontWeight: "900", marginTop: 12, marginBottom: 8 },

  chipRow: { flexDirection: "row", gap: 10, paddingBottom: 4, paddingRight: 6 },
  chip: { paddingVertical: 9, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1 },
  chipSelected: { backgroundColor: "#0E1A12", borderColor: "#2ECC71" },
  chipUnselected: { backgroundColor: "#0B0B0B", borderColor: "#2A2A2A" },
  chipText: { fontSize: 13, fontWeight: "700", color: "#FFFFFF" },
  chipTextSelected: { color: "#2ECC71" },

  helpText: { marginTop: 10, color: "#8E8E8E", fontWeight: "800", lineHeight: 18 },

  sheetPill: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1, borderColor: "#2A2A2A" },
  sheetPillText: { color: "#BDBDBD", fontSize: 12, fontWeight: "800" },

  matchRow: { flexDirection: "row", gap: 10, alignItems: "center", paddingVertical: 12, borderTopWidth: 1, borderTopColor: "#1F1F1F" },
  matchTitle: { color: "#FFFFFF", fontWeight: "900", fontSize: 15 },
  matchSub: { color: "#BDBDBD", marginTop: 4, fontWeight: "800" },
  matchHint: { color: "#8E8E8E", marginTop: 6, fontWeight: "800", lineHeight: 18 },

  scoreBubble: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#2A2A2A",
    backgroundColor: "#070707",
    alignItems: "center",
    justifyContent: "center",
  },
  scoreBubbleText: { color: "#2ECC71", fontWeight: "900" },

  disclaimer: { marginTop: 12, color: "#7A7A7A", fontSize: 12, lineHeight: 18, fontWeight: "700" },

  noteBox: { padding: 12, borderRadius: 14, backgroundColor: "#070707", borderWidth: 1, borderColor: "#1F1F1F", marginTop: 10 },
  noteTextMuted: { color: "#8E8E8E", fontSize: 13, lineHeight: 18, fontWeight: "700" },

  // Detail
  detailHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 6 },
  backBtn: { width: 42, height: 42, borderRadius: 12, borderWidth: 1, borderColor: "#2A2A2A", backgroundColor: "#0B0B0B", alignItems: "center", justifyContent: "center" },
  backBtnText: { color: "#FFFFFF", fontSize: 22, fontWeight: "900", marginTop: -2 },

  detailTitle: { color: "#FFFFFF", fontSize: 22, fontWeight: "900" },
  detailSub: { color: "#BDBDBD", marginTop: 4, fontWeight: "800" },

  pillRow: { flexDirection: "row", gap: 10, marginBottom: 10 },
  pill: { flex: 1, padding: 12, borderRadius: 14, backgroundColor: "#070707", borderWidth: 1, borderColor: "#1F1F1F" },
  pillLabel: { color: "#8E8E8E", fontSize: 11, fontWeight: "800" },
  pillValue: { marginTop: 6, color: "#FFFFFF", fontSize: 14, fontWeight: "900" },

  bulletRow: { flexDirection: "row", gap: 10, marginBottom: 8 },
  bullet: { color: "#2ECC71", fontWeight: "900" },
  bulletText: { color: "#BDBDBD", fontWeight: "800", lineHeight: 18, flex: 1 },

  longText: { color: "#BDBDBD", fontWeight: "800", lineHeight: 20 },

  primaryBtn: { paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14, backgroundColor: "#0E1A12", borderWidth: 1, borderColor: "#2ECC71", alignItems: "center" },
  primaryBtnText: { color: "#2ECC71", fontWeight: "900" },
});


// -----------------------------
// Header + small helpers
// -----------------------------
function Header({ subtitle = "Today" }) {
  return (
    <View style={styles.headerRow}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Image source={ASSETS.logo} style={styles.logoSmall} resizeMode="contain" />
        <View>
          <Text style={styles.brand}>
            <Text style={styles.brandDuck}>Duck</Text>
            <Text style={styles.brandSmart}>Smart</Text>
          </Text>
          <Text style={styles.subHeader}>{subtitle}</Text>
        </View>
      </View>

      <Pressable style={styles.gearButton} onPress={() => {}}>
        <Text style={styles.gearText}>⚙︎</Text>
      </Pressable>
    </View>
  );
}

function RowHeader({ title, pill }) {
  return (
    <View style={styles.sheetHeaderRow}>
      <Text style={styles.sheetTitle}>{title}</Text>
      <View style={styles.sheetPill}>
        <Text style={styles.sheetPillText}>{pill}</Text>
      </View>
    </View>
  );
}

// -----------------------------
// APP (tabs + shared state)
// -----------------------------
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
            backgroundColor: "#0B0B0B",
            borderTopColor: "#2A2A2A",
            borderTopWidth: 1,
            height: 62,
            paddingBottom: 10,
            paddingTop: 8,
          },
          tabBarActiveTintColor: "#2ECC71",
          tabBarInactiveTintColor: "#BDBDBD",
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

// -----------------------------
// Styles
// -----------------------------
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#000000" },
  container: { padding: 16, paddingBottom: 28, backgroundColor: "#000000" },

  // general header
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  brand: { fontSize: 22, fontWeight: "900", letterSpacing: 0.2 },
  brandSmall: { fontSize: 18, fontWeight: "900" },
  brandDuck: { color: "#FFFFFF" },
  brandSmart: { color: "#2ECC71" },
  subHeader: { marginTop: 4, color: "#BDBDBD", fontSize: 13 },
  subHeaderSmall: { marginTop: 3, color: "#BDBDBD", fontSize: 12 },
  logoSmall: { width: 42, height: 42, borderRadius: 12 },

  // Today-specific top row (center logo + gear)
  todayTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
    marginTop: 4,
  },
  todayLogo: { width: 160, height: 56 },

  // Weather typography (larger)
  weatherRow: { flexDirection: "row", alignItems: "center" },
  bigTemp: { color: "#FFFFFF", fontSize: 58, fontWeight: "900", lineHeight: 60 },
  bigFeels: { color: "#BDBDBD", fontSize: 16, fontWeight: "800", marginTop: 6 },
  bigMeta: { color: "#BDBDBD", fontSize: 14, fontWeight: "800", marginTop: 6 },

  // Action buttons (large, light black, white outline)
  actionStack: { marginTop: 14, gap: 12 },
  bigBtn: {
    paddingVertical: 18,
    borderRadius: 18,
    backgroundColor: "#0B0B0B",
    borderWidth: 2,
    borderColor: "#FFFFFF",
    alignItems: "center",
  },
  bigBtnText: { color: "#FFFFFF", fontWeight: "900", fontSize: 18 },

  gearButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2A2A2A",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0B0B0B",
  },
  gearText: { color: "#FFFFFF", fontSize: 18 },

  card: {
    marginTop: 14,
    backgroundColor: "#0B0B0B",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#2A2A2A",
    padding: 14,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardTitle: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },

  chipRow: { flexDirection: "row", gap: 10, paddingBottom: 4, paddingRight: 6 },
  chip: { paddingVertical: 9, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1 },
  chipSelected: { backgroundColor: "#0E1A12", borderColor: "#2ECC71" },
  chipUnselected: { backgroundColor: "#0B0B0B", borderColor: "#2A2A2A" },
  chipText: { fontSize: 13, fontWeight: "700", color: "#FFFFFF" },
  chipTextSelected: { color: "#2ECC71" },

  inputLabel: { color: "#BDBDBD", fontSize: 12, marginBottom: 8, marginTop: 10, fontWeight: "900" },
  input: {
    borderWidth: 1,
    borderColor: "#2A2A2A",
    backgroundColor: "#070707",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#FFFFFF",
    fontWeight: "800",
  },

  smallBtn: {
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#2ECC71",
    backgroundColor: "#0E1A12",
  },
  smallBtnText: { color: "#2ECC71", fontWeight: "900", fontSize: 12 },

  sheetBtnRow: { flexDirection: "row", gap: 10, marginTop: 14 },
  primaryBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: "#0E1A12",
    borderWidth: 1,
    borderColor: "#2ECC71",
    alignItems: "center",
  },
  primaryBtnText: { color: "#2ECC71", fontWeight: "900" },
  secondaryBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: "#070707",
    borderWidth: 1,
    borderColor: "#2A2A2A",
    alignItems: "center",
  },
  secondaryBtnText: { color: "#FFFFFF", fontWeight: "900" },

  muted: { color: "#BDBDBD", fontWeight: "800", lineHeight: 18 },

  // spread images
  spreadThumb: { width: "100%", height: 140, borderRadius: 16, marginTop: 12, borderWidth: 1, borderColor: "#1F1F1F" },
  spreadThumbSmall: { width: "100%", height: 110, borderRadius: 16, marginTop: 10, borderWidth: 1, borderColor: "#1F1F1F" },

  // modal
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.72)", alignItems: "center", justifyContent: "center", padding: 18 },
  modalCard: { width: "100%", maxWidth: 520, backgroundColor: "#0B0B0B", borderRadius: 18, borderWidth: 1, borderColor: "#2A2A2A", padding: 14 },
  modalTitle: { color: "#FFFFFF", fontWeight: "900", fontSize: 16, marginBottom: 10 },
  modalImage: { width: "100%", height: 360 },

  // mini map
  miniMapWrap: { borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: "#1F1F1F", backgroundColor: "#050505" },
  miniMap: { height: 160, width: "100%" },
  miniMapFooter: { padding: 12 },
  miniMapText: { color: "#FFFFFF", fontWeight: "900" },
  miniMapMuted: { color: "#8E8E8E", marginTop: 6, fontWeight: "800" },

  noteBox: { padding: 12, borderRadius: 14, backgroundColor: "#070707", borderWidth: 1, borderColor: "#1F1F1F" },
  noteText: { color: "#FFFFFF", fontSize: 13, lineHeight: 18, fontWeight: "700" },
  noteTextMuted: { color: "#8E8E8E", fontSize: 13, lineHeight: 18, fontWeight: "700" },

  // preset score
  presetRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 12, justifyContent: "center" },
  presetBtn: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 14, backgroundColor: "#070707", borderWidth: 1, borderColor: "#2A2A2A" },
  presetBtnActive: { borderColor: "#2ECC71", backgroundColor: "#0E1A12" },
  presetBtnText: { color: "#FFFFFF", fontWeight: "900" },
  presetBtnTextActive: { color: "#2ECC71" },

  // photos
  photoRow: { flexDirection: "row", gap: 10, paddingVertical: 6, paddingRight: 6 },
  photoCard: { width: 130, borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: "#1F1F1F", backgroundColor: "#050505" },
  photo: { width: "100%", height: 92 },
  photoHint: { color: "#8E8E8E", fontWeight: "800", fontSize: 11, padding: 10 },

  // history list rows
  historyRow: { flexDirection: "row", gap: 10, alignItems: "flex-start", paddingVertical: 12, borderTopWidth: 1, borderTopColor: "#1F1F1F" },
  historyRowSelected: { backgroundColor: "#070707", borderRadius: 12, paddingHorizontal: 10 },
  historyTitle: { color: "#FFFFFF", fontWeight: "900" },
  historySub: { color: "#BDBDBD", marginTop: 4, fontWeight: "800" },
  historyNotes: { color: "#8E8E8E", marginTop: 8, fontWeight: "800", lineHeight: 18 },

  trashBtn: { width: 42, height: 42, borderRadius: 12, borderWidth: 1, borderColor: "#2A2A2A", backgroundColor: "#070707", alignItems: "center", justifyContent: "center" },
  trashBtnText: { color: "#FFFFFF", fontSize: 16 },

  // detail map
  detailMapWrap: { marginTop: 12, borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: "#1F1F1F", backgroundColor: "#050505" },
  detailMap: { height: 170, width: "100%" },
  detailLine: { color: "#BDBDBD", fontWeight: "800", lineHeight: 20, marginBottom: 6 },
  detailLabel: { color: "#FFFFFF", fontWeight: "900" },

  // map screen
  mapWrap: { flex: 1, backgroundColor: "#000000" },
  mapTopBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    backgroundColor: "rgba(0,0,0,0.85)",
    borderBottomWidth: 1,
    borderBottomColor: "#1F1F1F",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2A2A2A",
    backgroundColor: "#0B0B0B",
    alignItems: "center",
    justifyContent: "center",
  },
  iconBtnActive: { borderColor: "#2ECC71", backgroundColor: "#0E1A12" },
  iconBtnText: { color: "#FFFFFF", fontSize: 18, fontWeight: "900" },
  map: { flex: 1 },

  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: 14,
    backgroundColor: "#0B0B0B",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderTopWidth: 1,
    borderTopColor: "#2A2A2A",
  },
  sheetHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  sheetTitle: { color: "#FFFFFF", fontSize: 16, fontWeight: "900" },
  sheetSub: { color: "#BDBDBD", fontSize: 12, marginTop: 4 },
  sheetPill: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1, borderColor: "#2A2A2A" },
  sheetPillText: { color: "#BDBDBD", fontSize: 12, fontWeight: "800" },
  sheetHint: { marginTop: 8, color: "#BDBDBD", fontSize: 12, lineHeight: 18, fontWeight: "700" },

  pinListRow: { flexDirection: "row", gap: 10, paddingVertical: 10, paddingRight: 6 },
  pinPill: { width: 170, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: "#2A2A2A", backgroundColor: "#070707" },
  pinPillType: { color: "#2ECC71", fontWeight: "900", fontSize: 12 },
  pinPillTitle: { color: "#FFFFFF", fontWeight: "900", marginTop: 6, fontSize: 13 },

  // identify
  matchRow: { flexDirection: "row", gap: 10, alignItems: "center", paddingVertical: 12, borderTopWidth: 1, borderTopColor: "#1F1F1F" },
  duckThumb: { width: 58, height: 78, borderRadius: 14, borderWidth: 1, borderColor: "#1F1F1F" },
  matchTitle: { color: "#FFFFFF", fontWeight: "900", fontSize: 15 },
  matchSub: { color: "#BDBDBD", marginTop: 4, fontWeight: "800" },
  matchHint: { color: "#8E8E8E", marginTop: 6, fontWeight: "800", lineHeight: 18 },
  chev: { color: "#BDBDBD", fontSize: 26, fontWeight: "900", marginLeft: 6 },

  disclaimer: { marginTop: 12, color: "#7A7A7A", fontSize: 12, lineHeight: 18, fontWeight: "700" },

  detailHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 6 },
  backBtn: { width: 42, height: 42, borderRadius: 12, borderWidth: 1, borderColor: "#2A2A2A", backgroundColor: "#0B0B0B", alignItems: "center", justifyContent: "center" },
  backBtnText: { color: "#FFFFFF", fontSize: 22, fontWeight: "900", marginTop: -2 },
  detailTitle: { color: "#FFFFFF", fontSize: 22, fontWeight: "900" },
  detailSub: { color: "#BDBDBD", marginTop: 4, fontWeight: "800" },
  duckHero: { width: "100%", height: 240, borderRadius: 18, borderWidth: 1, borderColor: "#1F1F1F", marginTop: 12 },

  bulletRow: { flexDirection: "row", gap: 10, marginBottom: 8 },
  bullet: { color: "#2ECC71", fontWeight: "900" },
  bulletText: { color: "#BDBDBD", fontWeight: "800", lineHeight: 18, flex: 1 },
  longText: { color: "#BDBDBD", fontWeight: "800", lineHeight: 20 },
});
