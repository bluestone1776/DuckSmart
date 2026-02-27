import React, { useMemo, useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  StatusBar,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Modal,
  Image,
  Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path, Circle, Line, Polygon, Text as SvgText } from "react-native-svg";
import MapView, { UrlTile } from "react-native-maps";
import { COLORS } from "../constants/theme";
import { getRadarTileUrl, formatRadarAge } from "../services/radar";
import { ASSETS } from "../constants/assets";
import { clamp, formatWind } from "../utils/helpers";
import { scoreHuntToday } from "../utils/scoring";
import { useWeather } from "../context/WeatherContext";
import { scheduleHuntAlerts, cancelHuntAlerts } from "../services/notifications";
import {
  WATER_TYPES,
  WEATHER_OPTIONS,
  SEASON_OPTIONS,
  PRESSURE_OPTIONS,
  SPECIES_OPTIONS,
  recommendSpread,
} from "../data/decoySpreadData";
import * as ImagePicker from "expo-image-picker";
import AdBanner from "../components/AdBanner";
import ProUpgradePrompt from "../components/ProUpgradePrompt";
import ScreenBackground from "../components/ScreenBackground";
import { usePremium } from "../context/PremiumContext";
import { analyzeSpread as aiAnalyzeSpread, isAIAvailable } from "../services/ai";

const SCREEN_WIDTH = Dimensions.get("window").width;

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

    </View>
  );
}

// ---------------------------------------------------------------------------
// 48-Hour Trend Sparkline — mini SVG line chart
// ---------------------------------------------------------------------------
function TrendSparkline({ data, color, width = 280, height = 60, suffix = "" }) {
  if (!data || data.length < 2) return null;

  const pad = 4;
  const minV = Math.min(...data);
  const maxV = Math.max(...data);
  const range = maxV - minV || 1;

  // Calculate x,y for each data point
  const pts = data.map((v, i) => ({
    x: pad + (i / (data.length - 1)) * (width - pad * 2),
    y: pad + (1 - (v - minV) / range) * (height - pad * 2),
  }));

  // Build SVG path
  const linePath = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaPath = `${linePath} L ${pts[pts.length - 1].x} ${height} L ${pts[0].x} ${height} Z`;

  const first = data[0];
  const last = data[data.length - 1];
  const trendArrow = last > first ? "▲" : last < first ? "▼" : "—";
  const trendColor = last > first ? COLORS.red : last < first ? "#3498DB" : COLORS.muted;

  return (
    <View>
      <Svg width={width} height={height}>
        <Path d={areaPath} fill={color} opacity={0.1} />
        <Path d={linePath} stroke={color} strokeWidth={2} fill="none" />
        <Circle cx={pts[0].x} cy={pts[0].y} r={3} fill={color} />
        <Circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r={3} fill={color} />
      </Svg>
      <View style={s.trendMeta}>
        <Text style={[s.trendArrow, { color: trendColor }]}>{trendArrow}</Text>
        <Text style={s.trendRange}>
          {minV}{suffix} – {maxV}{suffix}
        </Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Wind Compass — SVG compass showing wind direction
// ---------------------------------------------------------------------------
function WindCompass({ deg, speed, size = 80 }) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 8;
  const arrowLen = r - 6;

  // Wind degrees indicate where wind is coming FROM
  // Arrow points in the direction wind blows TO (add 180°)
  const toRad = (d) => (d * Math.PI) / 180;
  const blowTo = deg + 180;
  const tipX = cx + arrowLen * Math.sin(toRad(blowTo));
  const tipY = cy - arrowLen * Math.cos(toRad(blowTo));
  const tailX = cx - (arrowLen * 0.35) * Math.sin(toRad(blowTo));
  const tailY = cy + (arrowLen * 0.35) * Math.cos(toRad(blowTo));

  // Arrow head wings
  const wingSpread = 8;
  const wingBack = 12;
  const wing1X = tipX - wingSpread * Math.cos(toRad(blowTo)) - wingBack * Math.sin(toRad(blowTo));
  const wing1Y = tipY - wingSpread * Math.sin(toRad(blowTo)) + wingBack * Math.cos(toRad(blowTo));
  const wing2X = tipX + wingSpread * Math.cos(toRad(blowTo)) - wingBack * Math.sin(toRad(blowTo));
  const wing2Y = tipY + wingSpread * Math.sin(toRad(blowTo)) + wingBack * Math.cos(toRad(blowTo));

  const cardinals = [
    { label: "N", angle: 0 },
    { label: "E", angle: 90 },
    { label: "S", angle: 180 },
    { label: "W", angle: 270 },
  ];

  return (
    <View style={{ alignItems: "center" }}>
      <Svg width={size} height={size}>
        {/* Outer ring */}
        <Circle cx={cx} cy={cy} r={r} stroke={COLORS.border} strokeWidth={1.5} fill={COLORS.bgDeep} />

        {/* Cardinal tick marks and labels */}
        {cardinals.map((c) => {
          const lx = cx + (r - 2) * Math.sin(toRad(c.angle));
          const ly = cy - (r - 2) * Math.cos(toRad(c.angle));
          return (
            <SvgText
              key={c.label}
              x={lx}
              y={ly + 4}
              fill={c.label === "N" ? COLORS.green : COLORS.mutedDark}
              fontSize={9}
              fontWeight="900"
              textAnchor="middle"
            >
              {c.label}
            </SvgText>
          );
        })}

        {/* Arrow shaft */}
        <Line x1={tailX} y1={tailY} x2={tipX} y2={tipY} stroke={COLORS.green} strokeWidth={2.5} />

        {/* Arrow head */}
        <Polygon
          points={`${tipX},${tipY} ${wing1X},${wing1Y} ${wing2X},${wing2Y}`}
          fill={COLORS.green}
        />

        {/* Center dot */}
        <Circle cx={cx} cy={cy} r={4} fill={COLORS.bgDeep} stroke={COLORS.border} strokeWidth={1} />
      </Svg>
      {speed !== undefined && (
        <Text style={s.compassSpeed}>{speed} mph</Text>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Picker row — horizontal scrollable chips acting as a single-select
// ---------------------------------------------------------------------------
function PickerRow({ label, options, value, onChange }) {
  return (
    <View style={s.pickerSection}>
      <Text style={s.pickerLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={s.chipRow}>
          {options.map((opt) => (
            <TodayChip
              key={opt}
              label={opt}
              selected={opt === value}
              onPress={() => onChange(opt)}
            />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Spread image popup modal
// ---------------------------------------------------------------------------
function SpreadImageModal({ visible, onClose, spread }) {
  if (!spread) return null;
  const img = ASSETS.decoys[spread.key];

  return (
    <Modal visible={visible} transparent={false} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={s.modalSafe}>
        <ScrollView contentContainerStyle={s.modalScroll}>
          {/* Close bar */}
          <View style={s.modalTopBar}>
            <View style={{ flex: 1 }}>
              <Text style={s.modalTitle}>{spread.name}</Text>
              <Text style={s.modalSubtitle}>{spread.type}</Text>
            </View>
            <Pressable style={s.modalXBtn} onPress={onClose}>
              <Text style={s.modalXBtnText}>✕</Text>
            </Pressable>
          </View>

          {/* Full-width image */}
          {img ? (
            <Image
              source={img}
              style={s.modalImage}
              resizeMode="contain"
            />
          ) : (
            <View style={s.modalImagePlaceholder}>
              <Text style={s.modalImagePlaceholderText}>Image not available</Text>
            </View>
          )}

          <View style={s.modalInfoRow}>
            <View style={s.modalInfoPill}>
              <Text style={s.modalInfoLabel}>Decoys</Text>
              <Text style={s.modalInfoValue}>{spread.decoyCount}</Text>
            </View>
            <View style={s.modalInfoPill}>
              <Text style={s.modalInfoLabel}>Calling</Text>
              <Text style={s.modalInfoValue}>{spread.calling}</Text>
            </View>
            <View style={s.modalInfoPill}>
              <Text style={s.modalInfoLabel}>Best Time</Text>
              <Text style={s.modalInfoValue}>{spread.bestTime}</Text>
            </View>
          </View>

          <Text style={s.modalNotes}>{spread.notes}</Text>

          <View style={s.modalMistakeBox}>
            <Text style={s.modalMistakeLabel}>Common Mistake</Text>
            <Text style={s.modalMistakeText}>{spread.mistakes}</Text>
          </View>

          <Pressable style={s.modalCloseBtn} onPress={onClose}>
            <Text style={s.modalCloseBtnText}>Close</Text>
          </Pressable>

          <View style={{ height: 30 }} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// --- Main screen ---

// ---------------------------------------------------------------------------
// Freemium gating limits
// ---------------------------------------------------------------------------
const FREE_HOURLY_LIMIT = 3;   // Free users see 3 consecutive hours
const PRO_HOURLY_LIMIT = 5;    // Pro users see 5 consecutive hours
const FREE_SPREAD_LIMIT = 2;   // Free users see 2 spreads; Pro sees all

export default function TodayScreen({ onLogout }) {
  const { weather, loading, refresh, coords } = useWeather();
  const { isPro } = usePremium();
  const [refreshing, setRefreshing] = useState(false);
  const [alertsOn, setAlertsOn] = useState(false);
  const [refreshCount, setRefreshCount] = useState(0);

  const hunt = useMemo(() => scoreHuntToday(weather), [weather]);

  // ---------------------------------------------------------------------------
  // Decoy Spread Advisor state
  // ---------------------------------------------------------------------------
  const [dWater, setDWater] = useState(WATER_TYPES[0]);
  const [dWeather, setDWeather] = useState(WEATHER_OPTIONS[0]);
  const [dSeason, setDSeason] = useState(SEASON_OPTIONS[0]);
  const [dPressure, setDPressure] = useState(PRESSURE_OPTIONS[0]);
  const [dSpecies, setDSpecies] = useState(SPECIES_OPTIONS[0]);
  const [spreadModal, setSpreadModal] = useState(null); // spread object or null

  // AI Spread Analyzer state
  const [aiSpreadPhoto, setAiSpreadPhoto] = useState(null);
  const [aiSpreadResult, setAiSpreadResult] = useState(null);
  const [aiSpreadLoading, setAiSpreadLoading] = useState(false);
  const [aiSpreadModalVisible, setAiSpreadModalVisible] = useState(false);

  // ---------------------------------------------------------------------------
  // Weather Radar — RainViewer live radar tiles
  // ---------------------------------------------------------------------------
  const [radarTileUrl, setRadarTileUrl] = useState(null);
  const [radarTimestamp, setRadarTimestamp] = useState(null);

  const loadRadar = useCallback(async () => {
    const result = await getRadarTileUrl();
    if (result) {
      setRadarTileUrl(result.tileUrl);
      setRadarTimestamp(result.timestamp);
    }
  }, []);

  useEffect(() => {
    loadRadar();
  }, [loadRadar]);

  const recommendation = useMemo(
    () =>
      recommendSpread({
        waterType: dWater,
        weather: dWeather,
        season: dSeason,
        pressure: dPressure,
        species: dSpecies,
      }),
    [dWater, dWeather, dSeason, dPressure, dSpecies]
  );

  // ---------------------------------------------------------------------------
  // AI Spread Analyzer
  // ---------------------------------------------------------------------------
  async function handleAISpreadAnalyzer(useCamera) {
    if (!isPro) {
      Alert.alert("Pro Feature", "AI Spread Analyzer requires DuckSmart Pro.", [
        { text: "Not Now", style: "cancel" },
        { text: "Upgrade to Pro", onPress: () => {} },
      ]);
      return;
    }
    if (!isAIAvailable()) {
      Alert.alert("Not Configured", "AI features require an OpenAI API key. Add it in app.json → extra → openaiApiKey.");
      return;
    }

    try {
      let result;
      if (useCamera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) { Alert.alert("Permission Needed", "Camera access is required."); return; }
        result = await ImagePicker.launchCameraAsync({ quality: 0.7, allowsEditing: true });
      } else {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) { Alert.alert("Permission Needed", "Photo library access is required."); return; }
        result = await ImagePicker.launchImageLibraryAsync({ quality: 0.7, allowsEditing: true });
      }
      if (result.canceled || !result.assets?.length) return;

      const uri = result.assets[0].uri;
      setAiSpreadPhoto(uri);
      setAiSpreadResult(null);
      setAiSpreadLoading(true);
      setAiSpreadModalVisible(true);

      const weatherCtx = weather ? {
        windDir: formatWind(weather.windDeg),
        windMph: weather.windMph,
        tempF: weather.tempF,
        condition: `${weather.cloudPct}% clouds, ${weather.precipChance}% precip chance`,
      } : null;

      const analysis = await aiAnalyzeSpread(uri, weatherCtx);
      setAiSpreadResult(analysis);
    } catch (err) {
      Alert.alert("AI Error", err.message || "Could not analyze the spread. Please try again.");
      setAiSpreadModalVisible(false);
    } finally {
      setAiSpreadLoading(false);
    }
  }

  function promptAISpreadAnalyzer() {
    Alert.alert("AI Spread Analyzer", "Take a photo of your decoy spread or choose from gallery.", [
      { text: "Camera", onPress: () => handleAISpreadAnalyzer(true) },
      { text: "Gallery", onPress: () => handleAISpreadAnalyzer(false) },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refresh(), loadRadar()]);
    setRefreshing(false);
    setRefreshCount((c) => c + 1);
  }, [refresh, loadRadar]);

  const toggleHuntAlerts = useCallback(async () => {
    if (alertsOn) {
      await cancelHuntAlerts();
      setAlertsOn(false);
      Alert.alert("Alerts Off", "Sunrise and sunset alerts have been cancelled.");
    } else {
      const success = await scheduleHuntAlerts(weather.sunrise, weather.sunset);
      if (success) {
        setAlertsOn(true);
        Alert.alert("Alerts Set!", "You'll be notified 30 min before sunrise and at sunset.");
      } else {
        Alert.alert("Permission Needed", "Enable notifications in your device settings to use hunt alerts.");
      }
    }
  }, [alertsOn, weather.sunrise, weather.sunset]);

  if (loading && !weather.tempF) {
    return (
      <ScreenBackground style={s.safe}>
        <SafeAreaView style={{ flex: 1 }}>
        <StatusBar barStyle="light-content" />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={COLORS.green} />
          <Text style={{ color: COLORS.muted, marginTop: 14, fontWeight: "800" }}>Loading weather...</Text>
        </View>
        </SafeAreaView>
      </ScreenBackground>
    );
  }

  const primary = recommendation.primary;
  const addon = recommendation.addon;

  return (
    <ScreenBackground style={s.safe}>
      <SafeAreaView style={{ flex: 1 }}>
      <StatusBar barStyle="light-content" />

      {/* Spread image popup */}
      <SpreadImageModal
        visible={!!spreadModal}
        onClose={() => setSpreadModal(null)}
        spread={spreadModal}
      />

      {/* AI Spread Analyzer result modal */}
      <Modal visible={aiSpreadModalVisible} transparent={false} animationType="slide" onRequestClose={() => setAiSpreadModalVisible(false)}>
        <SafeAreaView style={[s.safe, { backgroundColor: "#000" }]}>
          <ScrollView contentContainerStyle={s.container}>
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
              <Pressable style={s.gearButton} onPress={() => setAiSpreadModalVisible(false)}>
                <Text style={s.gearText}>‹</Text>
              </Pressable>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ color: COLORS.white, fontSize: 22, fontWeight: "900" }}>AI Spread Analyzer</Text>
                <Text style={{ color: COLORS.muted, fontSize: 12, fontWeight: "700", marginTop: 2 }}>Powered by DuckSmart AI</Text>
              </View>
            </View>

            {aiSpreadPhoto && (
              <Image source={{ uri: aiSpreadPhoto }} style={s.aiSpreadPhoto} resizeMode="cover" />
            )}

            {aiSpreadLoading && (
              <View style={s.aiSpreadLoadingBox}>
                <ActivityIndicator size="large" color={COLORS.green} />
                <Text style={s.aiSpreadLoadingText}>Analyzing your spread...</Text>
              </View>
            )}

            {aiSpreadResult && (
              <>
                {/* Overall Score */}
                <TodayCard title="Overall Score">
                  <View style={{ alignItems: "center" }}>
                    <TodayHalfGauge value={aiSpreadResult.overallScore} />
                  </View>
                  {aiSpreadResult.spreadType && (
                    <Text style={s.aiSpreadType}>Detected: {aiSpreadResult.spreadType}</Text>
                  )}
                  {aiSpreadResult.summary && (
                    <Text style={s.aiSpreadSummary}>{aiSpreadResult.summary}</Text>
                  )}
                </TodayCard>

                {/* Category Scores */}
                <TodayCard title="Breakdown">
                  {[
                    { key: "windAlignment", label: "Wind Alignment", icon: "💨" },
                    { key: "spacing", label: "Spacing", icon: "↔️" },
                    { key: "realism", label: "Realism", icon: "🦆" },
                    { key: "landingZone", label: "Landing Zone", icon: "🎯" },
                  ].map((cat) => {
                    const data = aiSpreadResult.scores?.[cat.key];
                    if (!data) return null;
                    const barColor = data.score >= 70 ? COLORS.green : data.score >= 40 ? COLORS.yellow : COLORS.red;
                    return (
                      <View key={cat.key} style={s.aiScoreCatRow}>
                        <View style={s.aiScoreCatHeader}>
                          <Text style={s.aiScoreCatIcon}>{cat.icon}</Text>
                          <Text style={s.aiScoreCatLabel}>{cat.label}</Text>
                          <Text style={[s.aiScoreCatValue, { color: barColor }]}>{data.score}</Text>
                        </View>
                        <View style={s.aiScoreBarBg}>
                          <View style={[s.aiScoreBarFill, { width: `${data.score}%`, backgroundColor: barColor }]} />
                        </View>
                        {data.note ? <Text style={s.aiScoreCatNote}>{data.note}</Text> : null}
                      </View>
                    );
                  })}
                </TodayCard>

                {/* Improvements */}
                {aiSpreadResult.improvements?.length > 0 && (
                  <TodayCard title="Improvements">
                    {aiSpreadResult.improvements.map((tip, i) => (
                      <View key={i} style={s.aiImprovRow}>
                        <Text style={s.aiImprovBullet}>{i + 1}</Text>
                        <Text style={s.aiImprovText}>{tip}</Text>
                      </View>
                    ))}
                  </TodayCard>
                )}

                <Pressable style={s.aiSpreadDoneBtn} onPress={() => setAiSpreadModalVisible(false)}>
                  <Text style={s.aiSpreadDoneBtnText}>Done</Text>
                </Pressable>
              </>
            )}
            <View style={{ height: 30 }} />
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <ScrollView
        contentContainerStyle={s.container}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.green}
            colors={[COLORS.green]}
          />
        }
      >
        {/* Header */}
        <View style={s.headerRow}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Image source={ASSETS.logo} style={s.logoSmall} resizeMode="contain" />
            <View>
              <Text style={s.brand}>
                <Text style={s.brandDuck}>Duck</Text>
                <Text style={s.brandSmart}>Smart</Text>
              </Text>
              <Text style={s.subHeader}>
                Today • {weather.locationName}
              </Text>
            </View>
          </View>

          <Pressable style={s.gearButton} onPress={onLogout || (() => {})}>
            <Text style={s.gearText}>⚙︎</Text>
          </Pressable>
        </View>

        {/* Easter egg — appears on every 4th pull-to-refresh */}
        {refreshCount > 0 && refreshCount % 4 === 0 && (
          <Text style={s.easterEggLine}>Same weather. Different hopes.</Text>
        )}

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
                    {item.type === "up" ? "▲" : "▼"}
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
            <TodayMetricPill label="Temp" value={`${weather.tempF}°F`} />
            <TodayMetricPill label="Feels" value={`${weather.feelsLikeF}°F`} />
            <TodayMetricPill label="Precip" value={`${weather.precipChance}%`} />
          </View>

          <View style={s.metricRow}>
            <TodayMetricPill label="Pressure" value={`${weather.pressureInHg}`} />
            <TodayMetricPill label="Clouds" value={`${weather.cloudPct}%`} />
            <TodayMetricPill
              label="Wind"
              value={`${weather.windMph} mph ${formatWind(weather.windDeg)}`}
            />
          </View>

          {/* Wind compass + Sun times */}
          <View style={s.windCompassRow}>
            <WindCompass deg={weather.windDeg} speed={weather.windMph} size={80} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={s.windFromLabel}>
                Wind from <Text style={{ color: COLORS.green }}>{formatWind(weather.windDeg)}</Text>
              </Text>
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
            </View>
          </View>

          <Pressable style={[s.alertBtn, alertsOn ? s.alertBtnActive : null]} onPress={toggleHuntAlerts}>
            <Text style={[s.alertBtnText, alertsOn ? s.alertBtnTextActive : null]}>
              {alertsOn ? "🔔  Alerts On" : "🔕  Set Shoot-Time Alerts"}
            </Text>
          </Pressable>
        </TodayCard>

        {/* Weather Radar — free: static snapshot, Pro: live + refresh */}
        {coords && radarTileUrl && (
          <TodayCard
            title="Weather Radar"
            right={
              isPro ? (
                <Pressable style={s.radarRefreshBtn} onPress={loadRadar}>
                  <Text style={s.radarRefreshText}>↻</Text>
                </Pressable>
              ) : (
                <View style={s.proTagPill}>
                  <Text style={s.proTagText}>Static</Text>
                </View>
              )
            }
          >
            <View style={s.radarWrap}>
              <MapView
                style={s.radarMap}
                initialRegion={{
                  latitude: coords.latitude,
                  longitude: coords.longitude,
                  latitudeDelta: 1.5,
                  longitudeDelta: 1.5,
                }}
                mapType="standard"
                pointerEvents="none"
              >
                <UrlTile
                  urlTemplate={radarTileUrl}
                  zIndex={1}
                  opacity={0.7}
                />
              </MapView>
            </View>
            <Text style={s.radarCaption}>
              {isPro
                ? `Live radar • ${formatRadarAge(radarTimestamp)}`
                : "Static radar • Upgrade to Pro for live refresh"}
            </Text>
          </TodayCard>
        )}

        {/* Hourly quick look — free: 3 consecutive hrs, Pro: 5 consecutive hrs */}
        <TodayCard
          title="Hourly Snapshot"
          right={
            !isPro ? (
              <View style={s.proTagPill}>
                <Text style={s.proTagText}>PRO: 5 hours</Text>
              </View>
            ) : null
          }
        >
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={s.hourlyRow}>
              {weather.hourly
                .slice(0, isPro ? PRO_HOURLY_LIMIT : FREE_HOURLY_LIMIT)
                .map((h) => (
                  <View key={h.t} style={s.hourlyCard}>
                    <Text style={s.hourlyTime}>{h.t}</Text>
                    <Text style={s.hourlyTemp}>{h.temp}°</Text>
                    <Text style={s.hourlySmall}>Precip {h.precip}%</Text>
                    <Text style={s.hourlySmall}>Wind {h.wind} mph</Text>
                    <Text style={s.hourlySmall}>Gust {h.gust}</Text>
                  </View>
                ))}

              {/* Locked placeholder card for free users */}
              {!isPro && (
                <View style={[s.hourlyCard, s.hourlyCardLocked]}>
                  <Text style={s.hourlyLockIcon}>🔒</Text>
                  <Text style={s.hourlyLockText}>
                    +{PRO_HOURLY_LIMIT - FREE_HOURLY_LIMIT} more{"\n"}with Pro
                  </Text>
                </View>
              )}
            </View>
          </ScrollView>
        </TodayCard>

        {/* 48-Hour Trends — Pro feature */}
        {weather.trends48h && weather.trends48h.length > 2 && (
          isPro ? (
            <TodayCard title="48-Hour Trends">
              <View style={s.trendSection}>
                <Text style={s.trendLabel}>Temperature (°F)</Text>
                <TrendSparkline
                  data={weather.trends48h.map((d) => d.temp)}
                  color={COLORS.green}
                  width={SCREEN_WIDTH - 64}
                  height={55}
                  suffix="°"
                />
              </View>
              <View style={s.trendSection}>
                <Text style={s.trendLabel}>Barometric Pressure (inHg)</Text>
                <TrendSparkline
                  data={weather.trends48h.map((d) => d.pressureInHg)}
                  color={COLORS.yellow}
                  width={SCREEN_WIDTH - 64}
                  height={55}
                  suffix=""
                />
              </View>
              <View style={s.trendTimeRow}>
                <Text style={s.trendTimeLabel}>Now</Text>
                <Text style={s.trendTimeLabel}>24h</Text>
                <Text style={s.trendTimeLabel}>48h</Text>
              </View>
            </TodayCard>
          ) : (
            <TodayCard
              title="48-Hour Trends"
              right={
                <View style={s.proTagPill}>
                  <Text style={s.proTagText}>PRO</Text>
                </View>
              }
            >
              <ProUpgradePrompt message="Unlock 48-hour temperature and pressure trend charts to spot cold fronts and pressure changes before they arrive." />
            </TodayCard>
          )
        )}

        {/* ================================================================
            DECOY SPREAD ADVISOR — Selection → Recommendation → Image Popup
            ================================================================ */}
        <TodayCard
          title="Decoy Spread Advisor"
          right={
            <Pressable
              style={[s.radarRefreshBtn, isPro && { borderColor: COLORS.green, backgroundColor: COLORS.greenBg }]}
              onPress={promptAISpreadAnalyzer}
            >
              <Text style={[s.radarRefreshText, isPro && { color: COLORS.green }]}>📷</Text>
            </Pressable>
          }
        >

          {/* Wind compass for spread orientation */}
          <View style={s.decoyCompassRow}>
            <WindCompass deg={weather.windDeg} size={64} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={s.decoyCompassTitle}>
                Wind: {formatWind(weather.windDeg)} at {weather.windMph} mph
              </Text>
              <Text style={s.decoyCompassHint}>
                Set your spread with the open end facing downwind
              </Text>
            </View>
          </View>

          {/* Selection pickers */}
          <PickerRow label="Water Type" options={WATER_TYPES} value={dWater} onChange={setDWater} />
          <PickerRow label="Weather" options={WEATHER_OPTIONS} value={dWeather} onChange={setDWeather} />
          <PickerRow label="Season" options={SEASON_OPTIONS} value={dSeason} onChange={setDSeason} />

          {/* Recommendation result */}
          {primary && (
            <View style={s.recBox}>
              <Text style={s.recLabel}>Recommended Spread</Text>

              <Pressable
                style={s.recCard}
                onPress={() => setSpreadModal(primary)}
              >
                {ASSETS.decoys[primary.key] && (
                  <Image
                    source={ASSETS.decoys[primary.key]}
                    style={s.recThumb}
                    resizeMode="cover"
                  />
                )}
                <View style={s.recInfo}>
                  <Text style={s.recName}>{primary.name}</Text>
                  <Text style={s.recType}>{primary.type}</Text>
                  <Text style={s.recDetail} numberOfLines={2}>
                    {primary.notes}
                  </Text>
                  <View style={s.recMetaRow}>
                    <Text style={s.recMeta}>Decoys: {primary.decoyCount}</Text>
                    <Text style={s.recMeta}>Match: {primary.score}%</Text>
                  </View>
                </View>
                <Text style={s.recChevron}>›</Text>
              </Pressable>

              {/* Runner up spreads — free: 1 runner-up (2 total), Pro: all */}
              {recommendation.all.length > 1 && (
                <View style={s.runnersSection}>
                  <Text style={s.runnersTitle}>Other Options</Text>
                  {recommendation.all
                    .slice(1, isPro ? 4 : FREE_SPREAD_LIMIT)
                    .map((sp) => (
                      <Pressable
                        key={sp.key}
                        style={s.runnerRow}
                        onPress={() => setSpreadModal(sp)}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={s.runnerName}>{sp.name}</Text>
                          <Text style={s.runnerType}>{sp.type} • {sp.decoyCount} decoys</Text>
                        </View>
                        <Text style={s.runnerScore}>{sp.score}%</Text>
                        <Text style={s.recChevron}>›</Text>
                      </Pressable>
                    ))}

                  {/* Lock prompt for remaining spreads */}
                  {!isPro && recommendation.all.length > FREE_SPREAD_LIMIT && (
                    <ProUpgradePrompt
                      compact
                      message={`${recommendation.all.length - FREE_SPREAD_LIMIT} more spreads with Pro`}
                    />
                  )}
                </View>
              )}

              {/* Confidence Spread add-on tip — Pro only */}
              {addon && isPro && (
                <Pressable
                  style={s.addonTip}
                  onPress={() => setSpreadModal(addon)}
                >
                  <Text style={s.addonIcon}>+</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={s.addonTitle}>Add a Confidence Spread</Text>
                    <Text style={s.addonText}>
                      Mix {addon.decoyCount} heron, egret, or coot decoys for extra realism.
                    </Text>
                  </View>
                  <Text style={s.recChevron}>›</Text>
                </Pressable>
              )}
              {addon && !isPro && (
                <ProUpgradePrompt
                  compact
                  message="Confidence Spread tips with Pro"
                />
              )}
            </View>
          )}
        </TodayCard>

        {/* Ad Banner — free version only */}
        <AdBanner />

        {/* Disclaimer */}
        <Text style={s.disclaimer}>
          The prediction score is an estimate based on weather, environmental data, and historical patterns.
          It is not a guarantee of hunt success — actual results may vary due to animal behavior,
          local conditions, and other factors beyond prediction.
        </Text>

        <View style={{ height: 22 }} />
      </ScrollView>
      </SafeAreaView>
    </ScreenBackground>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1 },
  container: { padding: 16, paddingBottom: 28 },

  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  logoSmall: { width: 42, height: 42, borderRadius: 12 },
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
  hourlyCardLocked: { alignItems: "center", justifyContent: "center", borderStyle: "dashed", borderColor: COLORS.border },
  hourlyLockIcon: { fontSize: 20, marginBottom: 4 },
  hourlyLockText: { color: COLORS.muted, fontSize: 11, fontWeight: "700", textAlign: "center", lineHeight: 16 },
  hourlyTime: { color: COLORS.muted, fontWeight: "800", fontSize: 12 },
  hourlyTemp: { color: COLORS.white, fontWeight: "900", fontSize: 22, marginTop: 6, marginBottom: 6 },
  hourlySmall: { color: COLORS.mutedDark, fontSize: 11, fontWeight: "700" },

  proTagPill: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999, backgroundColor: COLORS.greenBg, borderWidth: 1, borderColor: COLORS.green },
  proTagText: { color: COLORS.green, fontSize: 10, fontWeight: "900" },

  // ---- Wind Compass ----
  windCompassRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
    padding: 10,
    borderRadius: 14,
    backgroundColor: COLORS.bgDeep,
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
  },
  windFromLabel: { color: COLORS.muted, fontSize: 13, fontWeight: "800", marginBottom: 8 },
  compassSpeed: { color: COLORS.muted, fontSize: 11, fontWeight: "800", marginTop: 2 },

  // ---- 48-Hour Trends ----
  trendSection: { marginBottom: 14 },
  trendLabel: { color: COLORS.muted, fontSize: 12, fontWeight: "900", marginBottom: 6 },
  trendMeta: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  trendArrow: { fontSize: 12, fontWeight: "900" },
  trendRange: { color: COLORS.mutedDark, fontSize: 11, fontWeight: "700" },
  trendTimeRow: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 4 },
  trendTimeLabel: { color: COLORS.mutedDarker, fontSize: 10, fontWeight: "700" },

  // ---- Decoy Compass ----
  decoyCompassRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    borderRadius: 14,
    backgroundColor: COLORS.bgDeep,
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
  },
  decoyCompassTitle: { color: COLORS.white, fontSize: 14, fontWeight: "800" },
  decoyCompassHint: { color: COLORS.mutedDark, fontSize: 12, fontWeight: "700", marginTop: 4, lineHeight: 16 },

  alertBtn: {
    marginTop: 10,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: COLORS.bgDeep,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
  },
  alertBtnActive: { borderColor: COLORS.green, backgroundColor: COLORS.greenBg },
  alertBtnText: { color: COLORS.muted, fontWeight: "900", fontSize: 13 },
  alertBtnTextActive: { color: COLORS.green },

  // ---- Decoy Spread Advisor ----
  pickerSection: { marginTop: 12 },
  pickerLabel: { color: COLORS.muted, fontSize: 12, fontWeight: "900", marginBottom: 8 },

  recBox: { marginTop: 16 },
  recLabel: { color: COLORS.green, fontSize: 13, fontWeight: "900", marginBottom: 10 },

  recCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    borderRadius: 14,
    backgroundColor: COLORS.bgDeep,
    borderWidth: 1,
    borderColor: COLORS.green,
  },
  recThumb: {
    width: 70,
    height: 70,
    borderRadius: 10,
    backgroundColor: COLORS.bgDeepest,
  },
  recInfo: { flex: 1, marginLeft: 12 },
  recName: { color: COLORS.white, fontSize: 16, fontWeight: "900" },
  recType: { color: COLORS.green, fontSize: 12, fontWeight: "700", marginTop: 2 },
  recDetail: { color: COLORS.muted, fontSize: 12, fontWeight: "700", marginTop: 4, lineHeight: 16 },
  recMetaRow: { flexDirection: "row", gap: 12, marginTop: 6 },
  recMeta: { color: COLORS.mutedDark, fontSize: 11, fontWeight: "800" },
  recChevron: { color: COLORS.mutedDark, fontSize: 24, fontWeight: "700", marginLeft: 4 },

  runnersSection: { marginTop: 12 },
  runnersTitle: { color: COLORS.muted, fontSize: 12, fontWeight: "900", marginBottom: 8 },
  runnerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: COLORS.bgDeep,
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
    marginBottom: 6,
  },
  runnerName: { color: COLORS.white, fontSize: 14, fontWeight: "800" },
  runnerType: { color: COLORS.mutedDark, fontSize: 11, fontWeight: "700", marginTop: 2 },
  runnerScore: { color: COLORS.muted, fontSize: 13, fontWeight: "900", marginRight: 4 },

  addonTip: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
    padding: 12,
    borderRadius: 14,
    backgroundColor: COLORS.bgDeep,
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
    borderStyle: "dashed",
  },
  addonIcon: { color: COLORS.green, fontSize: 22, fontWeight: "900", marginRight: 10 },
  addonTitle: { color: COLORS.white, fontSize: 13, fontWeight: "800" },
  addonText: { color: COLORS.mutedDark, fontSize: 12, fontWeight: "700", marginTop: 2 },

  // ---- Spread image modal (full-screen) ----
  modalSafe: { flex: 1, backgroundColor: COLORS.black },
  modalScroll: { padding: 16, paddingBottom: 40 },
  modalTopBar: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  modalXBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  modalXBtnText: { color: COLORS.white, fontSize: 18, fontWeight: "700" },
  modalTitle: { color: COLORS.white, fontSize: 22, fontWeight: "900" },
  modalSubtitle: { color: COLORS.green, fontSize: 13, fontWeight: "700", marginTop: 4 },
  modalImage: {
    width: SCREEN_WIDTH - 32,
    height: SCREEN_WIDTH - 32,
    borderRadius: 14,
    backgroundColor: COLORS.bgDeep,
  },
  modalImagePlaceholder: {
    width: SCREEN_WIDTH - 32,
    height: 250,
    borderRadius: 14,
    backgroundColor: COLORS.bgDeep,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
  },
  modalImagePlaceholderText: { color: COLORS.mutedDark, fontWeight: "800" },

  modalInfoRow: { flexDirection: "row", gap: 8, marginTop: 14 },
  modalInfoPill: {
    flex: 1,
    padding: 10,
    borderRadius: 12,
    backgroundColor: COLORS.bgDeep,
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
    alignItems: "center",
  },
  modalInfoLabel: { color: COLORS.mutedDark, fontSize: 10, fontWeight: "700" },
  modalInfoValue: { color: COLORS.white, fontSize: 14, fontWeight: "900", marginTop: 4 },

  modalNotes: {
    color: COLORS.muted,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20,
    marginTop: 14,
  },
  modalMistakeBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "rgba(217, 76, 76, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(217, 76, 76, 0.3)",
  },
  modalMistakeLabel: { color: COLORS.red, fontSize: 11, fontWeight: "900" },
  modalMistakeText: { color: COLORS.muted, fontSize: 13, fontWeight: "700", marginTop: 4 },

  modalCloseBtn: {
    marginTop: 18,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: COLORS.greenBg,
    borderWidth: 1,
    borderColor: COLORS.green,
    alignItems: "center",
  },
  modalCloseBtnText: { color: COLORS.green, fontWeight: "900", fontSize: 15 },

  radarWrap: { borderRadius: 14, overflow: "hidden", borderWidth: 1, borderColor: COLORS.borderSubtle },
  radarMap: { width: "100%", height: 200 },
  radarCaption: { color: COLORS.mutedDark, fontSize: 11, fontWeight: "700", marginTop: 8, textAlign: "center" },
  radarRefreshBtn: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: COLORS.bgDeep, borderWidth: 1, borderColor: COLORS.border,
    alignItems: "center", justifyContent: "center",
  },
  radarRefreshText: { color: COLORS.muted, fontSize: 16, fontWeight: "900" },

  disclaimer: { marginTop: 18, color: COLORS.mutedDarker, fontSize: 11, lineHeight: 17, fontWeight: "700", textAlign: "center", paddingHorizontal: 8 },

  // Easter Egg
  easterEggLine: {
    color: COLORS.mutedDarker,
    fontSize: 11,
    fontWeight: "700",
    fontStyle: "italic",
    textAlign: "center",
    marginTop: 8,
    opacity: 0.6,
  },

  // AI Spread Analyzer
  aiSpreadPhoto: {
    width: "100%",
    height: 240,
    borderRadius: 18,
    backgroundColor: COLORS.bgDeep,
    marginBottom: 4,
  },
  aiSpreadLoadingBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
  },
  aiSpreadLoadingText: {
    color: COLORS.muted,
    fontWeight: "800",
    fontSize: 14,
    marginTop: 14,
  },
  aiSpreadType: {
    color: COLORS.green,
    fontWeight: "800",
    fontSize: 13,
    textAlign: "center",
    marginTop: 4,
  },
  aiSpreadSummary: {
    color: COLORS.muted,
    fontWeight: "700",
    fontSize: 13,
    textAlign: "center",
    marginTop: 6,
    lineHeight: 18,
    fontStyle: "italic",
  },
  aiScoreCatRow: {
    marginBottom: 14,
  },
  aiScoreCatHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  aiScoreCatIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  aiScoreCatLabel: {
    color: COLORS.white,
    fontWeight: "800",
    fontSize: 14,
    flex: 1,
  },
  aiScoreCatValue: {
    fontWeight: "900",
    fontSize: 16,
  },
  aiScoreBarBg: {
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.bgDeep,
    overflow: "hidden",
  },
  aiScoreBarFill: {
    height: 8,
    borderRadius: 4,
  },
  aiScoreCatNote: {
    color: COLORS.mutedDark,
    fontWeight: "700",
    fontSize: 12,
    marginTop: 4,
    lineHeight: 16,
  },
  aiImprovRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 8,
  },
  aiImprovBullet: {
    color: COLORS.green,
    fontWeight: "900",
    fontSize: 14,
    width: 18,
    textAlign: "center",
  },
  aiImprovText: {
    color: COLORS.muted,
    fontWeight: "700",
    fontSize: 13,
    flex: 1,
    lineHeight: 18,
  },
  aiSpreadDoneBtn: {
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: COLORS.greenBg,
    borderWidth: 1,
    borderColor: COLORS.green,
    alignItems: "center",
    marginTop: 6,
  },
  aiSpreadDoneBtnText: {
    color: COLORS.green,
    fontWeight: "900",
    fontSize: 15,
  },
});
