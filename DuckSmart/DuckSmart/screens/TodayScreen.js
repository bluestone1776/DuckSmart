import React, { useMemo, useState, useCallback, useEffect } from "react";
import {
  SafeAreaView,
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
import Svg, { Path, Circle, Text as SvgText } from "react-native-svg";
import MapView, { UrlTile } from "react-native-maps";
import { COLORS } from "../constants/theme";
import { getRadarTileUrl, formatRadarAge } from "../services/radar";
import { ASSETS } from "../constants/assets";
import { clamp } from "../utils/helpers";
import { formatWind } from "../utils/helpers";
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
import AdBanner from "../components/AdBanner";
import ProUpgradePrompt from "../components/ProUpgradePrompt";
import { usePremium } from "../context/PremiumContext";

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
const FREE_HOURLY_LIMIT = 3;   // Free users see 3 hours; Pro sees all 5
const FREE_SPREAD_LIMIT = 2;   // Free users see 2 spreads; Pro sees all

export default function TodayScreen({ onLogout }) {
  const { weather, loading, refresh, coords } = useWeather();
  const { isPro } = usePremium();
  const [refreshing, setRefreshing] = useState(false);
  const [alertsOn, setAlertsOn] = useState(false);

  // Hunt probability environment selector
  const environments = ["Marsh", "Timber", "Field", "Open Water", "River"];
  const [environment, setEnvironment] = useState("Marsh");

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

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refresh(), loadRadar()]);
    setRefreshing(false);
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
      <SafeAreaView style={s.safe}>
        <StatusBar barStyle="light-content" />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={COLORS.green} />
          <Text style={{ color: COLORS.muted, marginTop: 14, fontWeight: "800" }}>Loading weather...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const primary = recommendation.primary;
  const addon = recommendation.addon;

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" />

      {/* Spread image popup */}
      <SpreadImageModal
        visible={!!spreadModal}
        onClose={() => setSpreadModal(null)}
        spread={spreadModal}
      />

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
          <View>
            <Text style={s.brand}>
              <Text style={s.brandDuck}>Duck</Text>
              <Text style={s.brandSmart}>Smart</Text>
            </Text>
            <Text style={s.subHeader}>
              Today • {weather.locationName}
            </Text>
          </View>

          <Pressable style={s.gearButton} onPress={onLogout || (() => {})}>
            <Text style={s.gearText}>⚙︎</Text>
          </Pressable>
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

        {/* Hourly quick look — free: 3hrs, Pro: all */}
        <TodayCard
          title="Hourly Snapshot"
          right={
            !isPro ? (
              <View style={s.proTagPill}>
                <Text style={s.proTagText}>PRO unlocks all</Text>
              </View>
            ) : null
          }
        >
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={s.hourlyRow}>
              {weather.hourly
                .slice(0, isPro ? weather.hourly.length : FREE_HOURLY_LIMIT)
                .map((h) => (
                  <View key={h.t} style={s.hourlyCard}>
                    <Text style={s.hourlyTime}>{h.t}</Text>
                    <Text style={s.hourlyTemp}>{h.temp}°</Text>
                    <Text style={s.hourlySmall}>Precip {h.precip}%</Text>
                    <Text style={s.hourlySmall}>Wind {h.wind} mph</Text>
                    <Text style={s.hourlySmall}>Gust {h.gust}</Text>
                  </View>
                ))}

              {/* Locked placeholder cards for free users */}
              {!isPro && weather.hourly.length > FREE_HOURLY_LIMIT && (
                <View style={[s.hourlyCard, s.hourlyCardLocked]}>
                  <Text style={s.hourlyLockIcon}>🔒</Text>
                  <Text style={s.hourlyLockText}>
                    +{weather.hourly.length - FREE_HOURLY_LIMIT} more{"\n"}with Pro
                  </Text>
                </View>
              )}
            </View>
          </ScrollView>
        </TodayCard>

        {/* ================================================================
            DECOY SPREAD ADVISOR — Selection → Recommendation → Image Popup
            ================================================================ */}
        <TodayCard title="Decoy Spread Advisor">

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

  engineRow: { flexDirection: "row", gap: 10, marginTop: 12, marginBottom: 4 },
  enginePill: { flex: 1, padding: 12, borderRadius: 14, backgroundColor: COLORS.bgDeep, borderWidth: 1, borderColor: COLORS.borderSubtle, alignItems: "center" },
  engineLabel: { color: COLORS.mutedDark, fontSize: 11, fontWeight: "700" },
  engineValue: { marginTop: 4, color: COLORS.green, fontSize: 20, fontWeight: "900" },

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
});
