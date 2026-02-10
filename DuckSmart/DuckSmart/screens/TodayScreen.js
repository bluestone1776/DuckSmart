import React, { useMemo, useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  StatusBar,
} from "react-native";
import Svg, { Path, Circle, Text as SvgText } from "react-native-svg";
import { useNavigation } from "@react-navigation/native";

import { COLORS } from "../constants/theme";
import { clamp } from "../utils/helpers";
import { formatWind } from "../utils/helpers";
import { scoreHuntToday } from "../utils/scoring";
import { spreadRecommendation } from "../utils/spreads";

// --- Today-specific sub-components ---

function TodayCard({ title, right, children }) {
  return (
    <View style={s.card}>
      <View style={s.cardHeader}>
        <Text style={s.cardTitle}>{title}</Text>
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
      style={[s.chip, selected ? s.chipSelected : s.chipUnselected]}
    >
      <Text style={[s.chipText, selected ? s.chipTextSelected : null]}>
        {label}
      </Text>
    </Pressable>
  );
}

function TodayMetricPill({ label, value }) {
  return (
    <View style={s.metricPill}>
      <Text style={s.metricLabel}>{label}</Text>
      <Text style={s.metricValue}>{value}</Text>
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

      <View style={s.gaugeLegendRow}>
        <Text style={s.legendText}>Low</Text>
        <Text style={s.legendText}>High</Text>
      </View>
    </View>
  );
}

// --- Main screen ---

export default function TodayScreen() {
  const navigation = useNavigation();

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
      deltaTemp24hF: -10,
      deltaPressure3h: 0.06,
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
    () => spreadRecommendation({ environment, windDeg: weather.windDeg }),
    [environment, weather.windDeg]
  );

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={s.container}>
        {/* Header */}
        <View style={s.headerRow}>
          <View>
            <Text style={s.brand}>
              <Text style={s.brandDuck}>Duck</Text>
              <Text style={s.brandSmart}>Smart</Text>
            </Text>
            <Text style={s.subHeader}>
              Today \u2022 {weather.locationName}
            </Text>
          </View>

          <Pressable style={s.gearButton} onPress={() => {}}>
            <Text style={s.gearText}>{"\u2699\uFE0E"}</Text>
          </Pressable>
        </View>

        {/* Environment selector */}
        <View style={{ marginTop: 12 }}>
          <Text style={s.sectionLabel}>Environment</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={s.chipRow}>
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
            <View style={s.scorePill}>
              <Text style={s.scorePillText}>
                {hunt.score >= 70 ? "Prime" : hunt.score >= 45 ? "Fair" : "Tough"}
              </Text>
            </View>
          }
        >
          <TodayHalfGauge value={hunt.score} />

          <View style={s.whyBox}>
            <Text style={s.whyTitle}>Why this score</Text>
            {hunt.why.length === 0 ? (
              <Text style={s.whyText}>Add more signals to explain this.</Text>
            ) : (
              hunt.why.map((item, idx) => (
                <View key={idx} style={s.whyRow}>
                  <Text style={s.whyBullet}>
                    {item.type === "up" ? "\u25B2" : "\u25BC"}
                  </Text>
                  <Text style={s.whyText}>{item.text}</Text>
                </View>
              ))
            )}
          </View>
        </TodayCard>

        {/* Real-time Weather */}
        <TodayCard title="Real-Time Weather">
          <View style={s.metricRow}>
            <TodayMetricPill label="Temp" value={`${weather.tempF}\u00B0F`} />
            <TodayMetricPill label="Feels" value={`${weather.feelsLikeF}\u00B0F`} />
            <TodayMetricPill
              label="Wind"
              value={`${weather.windMph} mph ${formatWind(weather.windDeg)}`}
            />
          </View>

          <View style={s.metricRow}>
            <TodayMetricPill label="Pressure" value={`${weather.pressureInHg}`} />
            <TodayMetricPill label="Precip" value={`${weather.precipChance}%`} />
            <TodayMetricPill label="Clouds" value={`${weather.cloudPct}%`} />
          </View>

          <View style={s.sunRow}>
            <View style={s.sunPill}>
              <Text style={s.sunLabel}>Sunrise</Text>
              <Text style={s.sunValue}>{weather.sunrise}</Text>
            </View>
            <View style={s.sunPill}>
              <Text style={s.sunLabel}>Sunset</Text>
              <Text style={s.sunValue}>{weather.sunset}</Text>
            </View>
          </View>
        </TodayCard>

        {/* Hourly quick look */}
        <TodayCard title="Hourly Snapshot">
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={s.hourlyRow}>
              {weather.hourly.map((h) => (
                <View key={h.t} style={s.hourlyCard}>
                  <Text style={s.hourlyTime}>{h.t}</Text>
                  <Text style={s.hourlyTemp}>{h.temp}\u00B0</Text>
                  <Text style={s.hourlySmall}>Precip {h.precip}%</Text>
                  <Text style={s.hourlySmall}>Wind {h.wind} mph</Text>
                  <Text style={s.hourlySmall}>Gust {h.gust}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
        </TodayCard>

        {/* Spread recommendation */}
        <TodayCard title="Recommended Spread Right Now">
          <Text style={s.spreadName}>{spread.name}</Text>
          <Text style={s.spreadDetail}>{spread.detail}</Text>

          <View style={s.spreadActionsRow}>
            <Pressable style={s.primaryBtn} onPress={() => {}}>
              <Text style={s.primaryBtnText}>View Diagram</Text>
            </Pressable>
            <Pressable style={s.secondaryBtn} onPress={() => {}}>
              <Text style={s.secondaryBtnText}>Save to Hunt Log</Text>
            </Pressable>
          </View>

          <View style={s.diagramPlaceholder}>
            <Text style={s.diagramPlaceholderText}>
              Diagram preview placeholder
            </Text>
            <Text style={s.diagramPlaceholderSub}>
              (We'll wire this to your spread images next.)
            </Text>
          </View>
        </TodayCard>

        {/* Quick actions */}
        <View style={s.quickActions}>
          <Pressable style={s.actionBtn} onPress={() => navigation.navigate("Log")}>
            <Text style={s.actionBtnText}>Log Hunt</Text>
          </Pressable>
          <Pressable style={s.actionBtn} onPress={() => navigation.navigate("History")}>
            <Text style={s.actionBtnText}>Hunt History</Text>
          </Pressable>
          <Pressable style={s.actionBtn} onPress={() => navigation.navigate("Identify")}>
            <Text style={s.actionBtnText}>Identify Duck</Text>
          </Pressable>
        </View>

        <View style={{ height: 22 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.black },
  container: { padding: 16, paddingBottom: 28, backgroundColor: COLORS.black },

  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  brand: { fontSize: 28, fontWeight: "800", letterSpacing: 0.2 },
  brandDuck: { color: COLORS.white },
  brandSmart: { color: COLORS.green },
  subHeader: { marginTop: 4, color: COLORS.muted, fontSize: 13 },

  gearButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.bg,
  },
  gearText: { color: COLORS.white, fontSize: 18 },

  sectionLabel: { color: COLORS.muted, fontSize: 12, marginBottom: 8 },
  chipRow: { flexDirection: "row", gap: 10, paddingBottom: 4 },
  chip: { paddingVertical: 9, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1 },
  chipSelected: { backgroundColor: COLORS.greenBg, borderColor: COLORS.green },
  chipUnselected: { backgroundColor: COLORS.bg, borderColor: COLORS.border },
  chipText: { fontSize: 13, fontWeight: "700", color: COLORS.white },
  chipTextSelected: { color: COLORS.green },

  card: {
    marginTop: 14,
    backgroundColor: COLORS.bg,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardTitle: { color: COLORS.white, fontSize: 15, fontWeight: "800" },

  scorePill: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "#111111",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  scorePillText: { color: COLORS.white, fontSize: 12, fontWeight: "800" },

  gaugeLegendRow: { width: 220, flexDirection: "row", justifyContent: "space-between", marginTop: -6 },
  legendText: { color: COLORS.mutedDarker, fontSize: 12, fontWeight: "700" },

  whyBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: COLORS.bgDeep,
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
  },
  whyTitle: { color: COLORS.white, fontSize: 13, fontWeight: "800", marginBottom: 8 },
  whyRow: { flexDirection: "row", gap: 8, marginBottom: 6, alignItems: "flex-start" },
  whyBullet: { color: COLORS.muted, fontWeight: "900", marginTop: 1 },
  whyText: { color: COLORS.muted, fontSize: 13, lineHeight: 18, flex: 1 },

  metricRow: { flexDirection: "row", gap: 10, marginBottom: 10 },
  metricPill: { flex: 1, padding: 12, borderRadius: 14, backgroundColor: COLORS.bgDeep, borderWidth: 1, borderColor: COLORS.borderSubtle },
  metricLabel: { color: COLORS.mutedDark, fontSize: 11, fontWeight: "700" },
  metricValue: { marginTop: 6, color: COLORS.white, fontSize: 16, fontWeight: "900" },

  sunRow: { flexDirection: "row", gap: 10 },
  sunPill: { flex: 1, padding: 12, borderRadius: 14, backgroundColor: COLORS.bgDeep, borderWidth: 1, borderColor: COLORS.borderSubtle },
  sunLabel: { color: COLORS.mutedDark, fontSize: 11, fontWeight: "700" },
  sunValue: { marginTop: 6, color: COLORS.white, fontSize: 14, fontWeight: "900" },

  hourlyRow: { flexDirection: "row", gap: 10 },
  hourlyCard: { width: 110, padding: 12, borderRadius: 14, backgroundColor: COLORS.bgDeep, borderWidth: 1, borderColor: COLORS.borderSubtle },
  hourlyTime: { color: COLORS.muted, fontWeight: "800", fontSize: 12 },
  hourlyTemp: { color: COLORS.white, fontWeight: "900", fontSize: 22, marginTop: 6, marginBottom: 6 },
  hourlySmall: { color: COLORS.mutedDark, fontSize: 11, fontWeight: "700" },

  spreadName: { color: COLORS.white, fontSize: 18, fontWeight: "900" },
  spreadDetail: { color: COLORS.muted, marginTop: 6, fontSize: 13, lineHeight: 18 },
  spreadActionsRow: { flexDirection: "row", gap: 10, marginTop: 12 },
  primaryBtn: { flex: 1, paddingVertical: 12, borderRadius: 14, backgroundColor: COLORS.greenBg, borderWidth: 1, borderColor: COLORS.green, alignItems: "center" },
  primaryBtnText: { color: COLORS.green, fontWeight: "900" },
  secondaryBtn: { flex: 1, paddingVertical: 12, borderRadius: 14, backgroundColor: COLORS.bgDeep, borderWidth: 1, borderColor: COLORS.border, alignItems: "center" },
  secondaryBtnText: { color: COLORS.white, fontWeight: "900" },

  diagramPlaceholder: { marginTop: 12, height: 120, borderRadius: 14, borderWidth: 1, borderColor: COLORS.borderSubtle, backgroundColor: COLORS.bgDeepest, alignItems: "center", justifyContent: "center" },
  diagramPlaceholderText: { color: COLORS.muted, fontWeight: "800" },
  diagramPlaceholderSub: { color: COLORS.mutedDarker, marginTop: 6, fontSize: 12, fontWeight: "700" },

  quickActions: { marginTop: 14, flexDirection: "row", gap: 10 },
  actionBtn: { flex: 1, paddingVertical: 14, borderRadius: 16, backgroundColor: COLORS.bg, borderWidth: 1, borderColor: COLORS.border, alignItems: "center" },
  actionBtnText: { color: COLORS.white, fontWeight: "900" },
});
