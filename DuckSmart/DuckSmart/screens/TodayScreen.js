//screens/TodayScreen.js

import React, { useMemo, useState, useCallback, useEffect, useRef } from "react";
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
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path, Circle, Line, Polygon, Text as SvgText } from "react-native-svg";
import MapView, { UrlTile } from "react-native-maps";

import { COLORS } from "../constants/theme";
import { fetchRadarFrames, formatRadarAge } from "../services/radar";
import { ASSETS } from "../constants/assets";
import { clamp, formatWind } from "../utils/helpers";
import { scoreHunt, scoreHuntToday } from "../utils/scoring";
import { getMoonPhase } from "../utils/solunar";
import { useWeather } from "../context/WeatherContext";
import {
  scheduleHuntAlerts, cancelHuntAlerts,
  saveWeatherLocationForNotifications
} from "../services/notifications";
import ProUpgradePrompt from "../components/ProUpgradePrompt";
import ScreenBackground from "../components/ScreenBackground";
import { usePremium } from "../context/PremiumContext";
import { useAuth } from "../context/AuthContext";
import { logEvent, logScreenView } from "../services/analytics";
import InAppSponsorAd from "../components/InAppSponsorAd";
import InAppNotificationsModal from "../components/InAppNotificationsModal";
import {
  loadUnreadInAppNotifications,
  markInAppNotificationRead,
} from "../services/in_app_notifications";

const SCREEN_WIDTH = Dimensions.get("window").width;
const GOLD = "#D9A84C";
const GOLD_SOFT = "rgba(217,168,76,0.14)";
const DARK_CARD = "rgba(3, 6, 7, 0.93)";
const DARK_CARD_SOFT = "rgba(10, 14, 15, 0.94)";
const RADAR_REGION_DELTA = 3.0;
const RADAR_MAX_ZOOM = 7;
const RADAR_FRAME_INTERVAL_MS = 1800;

const FREE_HOURLY_LIMIT = 3;
const FREE_DAILY_LIMIT = 3;
const PRO_HOURLY_LIMIT = 5;
const PRO_DAILY_LIMIT = 5;

function analyticsNumber(value, decimals = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return decimals > 0 ? Number(n.toFixed(decimals)) : Math.round(n);
}

function analyticsScoreBand(score) {
  const n = Number(score);
  if (!Number.isFinite(n)) return "unknown";
  if (n >= 70) return "prime";
  if (n >= 45) return "fair";
  return "low";
}

function buildTodayAnalyticsMeta({
  weather,
  hunt,
  isPro,
  coords,
  radarTileUrl,
  radarFrames,
  radarExpanded,
  radarPlaying,
  alertsOn,
  hourlyCount,
  dailyCount,
  trendCount,
}) {
  return {
    screen: "TodayScreen",
    isPro: !!isPro,
    isDev: !!__DEV__,
    alertsOn: !!alertsOn,
    locationName: weather?.locationName || null,
    hasCoords: !!coords,
    approxLatitude: coords?.latitude != null ? analyticsNumber(coords.latitude, 2) : null,
    approxLongitude: coords?.longitude != null ? analyticsNumber(coords.longitude, 2) : null,
    tempF: analyticsNumber(weather?.tempF),
    feelsLikeF: analyticsNumber(weather?.feelsLikeF),
    windMph: analyticsNumber(weather?.windMph),
    windDeg: analyticsNumber(weather?.windDeg),
    windDirection: formatWind(weather?.windDeg),
    pressureInHg: analyticsNumber(weather?.pressureInHg, 2),
    precipChance: analyticsNumber(weather?.precipChance),
    cloudPct: analyticsNumber(weather?.cloudPct),
    sunriseAvailable: !!weather?.sunrise,
    sunsetAvailable: !!weather?.sunset,
    huntScore: analyticsNumber(hunt?.score),
    huntScoreBand: analyticsScoreBand(hunt?.score),
    huntWhyCount: Array.isArray(hunt?.why) ? hunt.why.length : 0,
    hourlyCount: hourlyCount || 0,
    dailyCount: dailyCount || 0,
    trendCount: trendCount || 0,
    hasMigration: !!weather?.migration,
    migrationTrending: weather?.migration?.trending || null,
    migrationChangePercent: analyticsNumber(weather?.migration?.changePercent),
    migrationTopSpeciesCount: Array.isArray(weather?.migration?.topSpecies) ? weather.migration.topSpecies.length : 0,
    hasRadar: !!radarTileUrl,
    radarFrameCount: Array.isArray(radarFrames) ? radarFrames.length : 0,
    radarExpanded: !!radarExpanded,
    radarPlaying: !!radarPlaying,
    platform: Platform.OS,
  };
}

function openWeatherIconUrl(icon) {
  if (!icon) return null;
  return `https://openweathermap.org/img/wn/${icon}@2x.png`;
}

function getWeatherEmojiFromData(item = {}) {
  const icon = String(item.icon || "");

  if (icon.startsWith("01")) return "☀️";
  if (icon.startsWith("02")) return "🌤️";
  if (icon.startsWith("03") || icon.startsWith("04")) return "☁️";
  if (icon.startsWith("09") || icon.startsWith("10")) return "🌧️";
  if (icon.startsWith("11")) return "⛈️";
  if (icon.startsWith("13")) return "❄️";
  if (icon.startsWith("50")) return "🌫️";

  const precip = Number(item.precip ?? item.precipChance ?? 0);
  const cloudPct = Number(item.cloudPct ?? 0);
  const temp = Number(item.temp ?? item.tempF ?? item.highF ?? 0);

  if (precip >= 65) return "🌧️";
  if (precip >= 35) return "🌦️";
  if (temp <= 32 && precip >= 25) return "❄️";
  if (cloudPct >= 70) return "☁️";
  if (cloudPct >= 35) return "🌤️";
  return "☀️";
}

function WeatherIcon({ item, size = 28 }) {
  const iconUrl = openWeatherIconUrl(item?.icon);

  if (iconUrl) {
    return <Image source={{ uri: iconUrl }} style={{ width: size, height: size }} resizeMode="contain" />;
  }

  return <Text style={[s.weatherEmoji, { fontSize: size - 4 }]}>{getWeatherEmojiFromData(item)}</Text>;
}

function SectionCard({ title, eyebrow, right, children, style }) {
  return (
    <View style={[s.card, style]}>
      <View style={s.cardHeader}>
        <View style={{ flex: 1 }}>
          {eyebrow ? <Text style={s.cardEyebrow}>{eyebrow}</Text> : null}
          <Text style={s.cardTitle}>{title}</Text>
        </View>
        {right ? <View>{right}</View> : null}
      </View>
      <View style={s.cardBody}>{children}</View>
    </View>
  );
}

function SmallMetric({ label, value, icon, accent }) {
  return (
    <View style={s.smallMetric}>
      <View style={s.smallMetricTop}>
        <Text style={s.smallMetricIcon}>{icon}</Text>
        <Text style={s.smallMetricLabel}>{label}</Text>
      </View>
      <Text style={[s.smallMetricValue, accent ? { color: accent } : null]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function HeroGauge({ value, size = 208 }) {
  const stroke = 17;
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
  const arcColor = value < 40 ? COLORS.red : value < 70 ? GOLD : COLORS.green;

  return (
    <View style={s.gaugeWrap}>
      <Svg width={size} height={size * 0.52} viewBox={`0 0 ${size} ${size}`}>
        <Path d={d} stroke="rgba(255,255,255,0.12)" strokeWidth={stroke} strokeLinecap="round" fill="none" />
        <Path
          d={d}
          stroke={arcColor}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${Math.PI * radius * p} ${Math.PI * radius}`}
        />
        <Circle cx={needleX} cy={needleY} r={10} fill="#FFFFFF" />
        <Circle cx={needleX} cy={needleY} r={5} fill="#0C0F10" />

        <SvgText x={cx} y={cy - 20} fill="#FFFFFF" fontSize="46" fontWeight="900" textAnchor="middle">
          {Math.round(value)}
        </SvgText>
        <SvgText x={cx} y={cy + 13} fill={arcColor} fontSize="13" fontWeight="900" textAnchor="middle">
          {value >= 70 ? "VERY HIGH" : value >= 45 ? "FAIR" : "TOUGH"}
        </SvgText>
      </Svg>
    </View>
  );
}

function TrendSparkline({ data, color, width = 280, height = 64, suffix = "" }) {
  if (!data || data.length < 2) return null;

  const pad = 6;
  const minV = Math.min(...data);
  const maxV = Math.max(...data);
  const range = maxV - minV || 1;

  const pts = data.map((v, i) => ({
    x: pad + (i / (data.length - 1)) * (width - pad * 2),
    y: pad + (1 - (v - minV) / range) * (height - pad * 2),
  }));

  const linePath = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaPath = `${linePath} L ${pts[pts.length - 1].x} ${height} L ${pts[0].x} ${height} Z`;

  const first = data[0];
  const last = data[data.length - 1];
  const trendArrow = last > first ? "▲" : last < first ? "▼" : "—";
  const trendColor = last > first ? COLORS.red : last < first ? "#4DA3FF" : COLORS.muted;

  return (
    <View style={s.trendChartWrap}>
      <Svg width={width} height={height}>
        <Path d={areaPath} fill={color} opacity={0.12} />
        <Path d={linePath} stroke={color} strokeWidth={2.5} fill="none" />
        <Circle cx={pts[0].x} cy={pts[0].y} r={3.5} fill={color} />
        <Circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r={3.5} fill={color} />
      </Svg>
      <View style={s.trendMeta}>
        <Text style={[s.trendArrow, { color: trendColor }]}>{trendArrow}</Text>
        <Text style={s.trendRange}>
          {minV}
          {suffix} – {maxV}
          {suffix}
        </Text>
      </View>
    </View>
  );
}

function WindCompass({ deg, speed, size = 84 }) {
  const safeDeg = Number.isFinite(Number(deg)) ? Number(deg) : 0;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 8;
  const arrowLen = r - 6;

  const toRad = (d) => (d * Math.PI) / 180;
  const blowTo = safeDeg + 180;
  const tipX = cx + arrowLen * Math.sin(toRad(blowTo));
  const tipY = cy - arrowLen * Math.cos(toRad(blowTo));
  const tailX = cx - arrowLen * 0.35 * Math.sin(toRad(blowTo));
  const tailY = cy + arrowLen * 0.35 * Math.cos(toRad(blowTo));

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
    <View style={s.compassWrap}>
      <Svg width={size} height={size}>
        <Circle cx={cx} cy={cy} r={r} stroke="rgba(217,168,76,0.55)" strokeWidth={1.5} fill="rgba(0,0,0,0.35)" />
        {cardinals.map((c) => {
          const lx = cx + (r - 3) * Math.sin(toRad(c.angle));
          const ly = cy - (r - 3) * Math.cos(toRad(c.angle));
          return (
            <SvgText
              key={c.label}
              x={lx}
              y={ly + 4}
              fill={c.label === "N" ? GOLD : "rgba(255,255,255,0.5)"}
              fontSize={9}
              fontWeight="900"
              textAnchor="middle"
            >
              {c.label}
            </SvgText>
          );
        })}
        <Line x1={tailX} y1={tailY} x2={tipX} y2={tipY} stroke={GOLD} strokeWidth={2.5} />
        <Polygon points={`${tipX},${tipY} ${wing1X},${wing1Y} ${wing2X},${wing2Y}`} fill={GOLD} />
        <Circle cx={cx} cy={cy} r={4} fill="#0B0F10" stroke="rgba(255,255,255,0.3)" strokeWidth={1} />
      </Svg>
      {speed !== undefined ? <Text style={s.compassSpeed}>{speed} mph</Text> : null}
    </View>
  );
}

function MiniForecastBlock({ title, subtitle, children }) {
  return (
    <View style={s.miniForecastBlock}>
      <View style={s.miniForecastHeader}>
        <Text style={s.miniForecastTitle}>{title}</Text>
        {subtitle ? <Text style={s.miniForecastSub}>{subtitle}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function HourlyWeatherRow({ hourly, limit = PRO_HOURLY_LIMIT }) {
  const hoursToShow = hourly.slice(0, limit);

  if (!hoursToShow.length) {
    return (
      <View style={s.emptyForecastBox}>
        <Text style={s.emptyForecastText}>Hourly forecast unavailable right now.</Text>
      </View>
    );
  }

  return (
    <View style={s.fiveCardRow}>
      {hoursToShow.map((h, index) => (
        <View key={`${h.t}-${index}`} style={s.forecastMiniCard}>
          <Text style={s.forecastMiniTime}>{h.t}</Text>
          <WeatherIcon item={h} size={29} />
          <Text style={s.forecastMiniTemp}>{h.temp}°</Text>
          <Text style={s.forecastMiniSmall}>{h.precip}%</Text>
        </View>
      ))}
    </View>
  );
}

function DailyWeatherRow({ days, limit = PRO_DAILY_LIMIT }) {
  const daysToShow = days.slice(0, limit);

  if (!daysToShow.length) {
    return (
      <View style={s.emptyForecastBox}>
        <Text style={s.emptyForecastText}>5-day forecast unavailable right now.</Text>
      </View>
    );
  }

  return (
    <View style={s.fiveCardRow}>
      {daysToShow.map((day, index) => (
        <View key={`${day.label}-${index}`} style={s.forecastMiniCard}>
          <Text style={s.forecastMiniTime}>{day.label}</Text>
          <WeatherIcon item={day} size={29} />
          <Text style={s.forecastMiniTemp}>
            {day.highF != null && day.lowF != null ? `${day.highF}°` : day.score != null ? `${day.score}` : "--"}
          </Text>
          <Text style={s.forecastMiniSmall}>
            {day.lowF != null ? `L ${day.lowF}°` : day.score != null ? "Score" : ""}
          </Text>
        </View>
      ))}
    </View>
  );
}

function WhyScoreModal({ visible, onClose, hunt }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.modalBackdrop}>
        <View style={s.whyModalCard}>
          <View style={s.whyModalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={s.modalEyebrow}>PREDICTION DETAILS</Text>
              <Text style={s.whyModalTitle}>Why this score</Text>
            </View>

            <Pressable style={s.modalCloseBtn} onPress={onClose}>
              <Text style={s.modalCloseText}>✕</Text>
            </Pressable>
          </View>

          <View style={s.modalScoreRow}>
            <Text style={s.modalScoreNumber}>{Math.round(hunt.score)}</Text>
            <Text style={s.modalScoreText}>
              {hunt.score >= 70 ? "Very High" : hunt.score >= 45 ? "Fair" : "Tough"} hunt conditions
            </Text>
          </View>

          <View style={s.whyModalList}>
            {hunt.why.length === 0 ? (
              <Text style={s.whyText}>Add more signals to explain this.</Text>
            ) : (
              hunt.why.map((item, idx) => (
                <View key={idx} style={s.whyRow}>
                  <Text style={s.whyBullet}>{item.type === "up" ? "▲" : "▼"}</Text>
                  <Text style={s.whyText}>{item.text}</Text>
                </View>
              ))
            )}
          </View>

          <Pressable style={s.modalDoneBtn} onPress={onClose}>
            <Text style={s.modalDoneText}>Got it</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

export default function TodayScreen({ onLogout, openGroupScreen }) {
  const { weather, loading, refresh, coords } = useWeather();
  const { isPro, purchase } = usePremium();
  const { user } = useAuth();
  const userId = user?.uid || null;

  const [refreshing, setRefreshing] = useState(false);
  const [alertsOn, setAlertsOn] = useState(false);
  const [refreshCount, setRefreshCount] = useState(0);
  const [whyModalVisible, setWhyModalVisible] = useState(false);

  const [inAppNotifications, setInAppNotifications] = useState([]);
  const [inAppNotificationsVisible, setInAppNotificationsVisible] = useState(false);

  const weatherAnalyticsSignatureRef = useRef(null);
  const proTrendsAnalyticsSignatureRef = useRef(null);

  const hunt = useMemo(() => scoreHuntToday(weather), [weather]);

  const forecast = useMemo(() => {
    const days = [{ label: "Today", score: scoreHunt(weather).score }];

    if (Array.isArray(weather?.forecast5Day)) {
      weather.forecast5Day.forEach((day) => {
        const date = day.dateUnix ? new Date(day.dateUnix * 1000) : undefined;
        days.push({ label: day.label, score: scoreHunt(day, date).score });
      });
    }

    return days.slice(0, 5);
  }, [weather]);

  const dailyWeatherCards = useMemo(() => {
    const daily = Array.isArray(weather?.dailyWeather5Day)
      ? weather.dailyWeather5Day.slice(0, PRO_DAILY_LIMIT)
      : [];

    if (daily.length > 0) {
      return daily.map((day, index) => ({
        ...day,
        score: forecast[index]?.score ?? null,
      }));
    }

    return forecast.map((day) => ({
      label: day.label,
      score: day.score,
      icon: null,
      highF: null,
      lowF: null,
      precipChance: null,
      windMph: null,
      cloudPct: null,
    }));
  }, [weather, forecast]);

  const moonPhase = useMemo(() => getMoonPhase(), []);

  const [radarTileUrl, setRadarTileUrl] = useState(null);
  const [radarTimestamp, setRadarTimestamp] = useState(null);
  const [radarFrames, setRadarFrames] = useState([]);
  const [radarExpanded, setRadarExpanded] = useState(false);
  const [radarFrameIndex, setRadarFrameIndex] = useState(0);
  const [radarPlaying, setRadarPlaying] = useState(false);

  const hourly = Array.isArray(weather?.hourly) ? weather.hourly : [];
  const hourlyForecastLimit = isPro ? PRO_HOURLY_LIMIT : FREE_HOURLY_LIMIT;
  const dailyForecastLimit = isPro ? PRO_DAILY_LIMIT : FREE_DAILY_LIMIT;
  const trendWidth = Math.max(SCREEN_WIDTH - 64, 240);

  const todayAnalyticsMeta = useMemo(
    () =>
      buildTodayAnalyticsMeta({
        weather,
        hunt,
        isPro,
        coords,
        radarTileUrl,
        radarFrames,
        radarExpanded,
        radarPlaying,
        alertsOn,
        hourlyCount: hourly.length,
        dailyCount: dailyWeatherCards.length,
        trendCount: Array.isArray(weather?.trends48h) ? weather.trends48h.length : 0,
      }),
    [
      weather,
      hunt,
      isPro,
      coords,
      radarTileUrl,
      radarFrames,
      radarExpanded,
      radarPlaying,
      alertsOn,
      hourly.length,
      dailyWeatherCards.length,
    ]
  );

  useEffect(() => {
    if (!userId) {
      setInAppNotifications([]);
      setInAppNotificationsVisible(false);
      return;
    }

    let mounted = true;

    async function loadUnreadNotifications() {
      try {
        const unread = await loadUnreadInAppNotifications(userId);

        if (!mounted) return;

        setInAppNotifications(Array.isArray(unread) ? unread : []);

        if (Array.isArray(unread) && unread.length > 0) {
          setInAppNotificationsVisible(true);

          logEvent("today_in_app_notifications_popup_shown", userId, {
            screen: "TodayScreen",
            unreadCount: unread.length,
            notificationTypes: unread.map((item) => item.type).filter(Boolean),
          });
        }
      } catch (err) {
        console.log("DuckSmart in-app notification load error:", err?.message || err);
      }
    }

    loadUnreadNotifications();

    return () => {
      mounted = false;
    };
  }, [userId]);

  useEffect(() => {
    const lat = coords?.latitude ?? coords?.lat;
    const lon = coords?.longitude ?? coords?.lon ?? coords?.lng;

    if (lat == null || lon == null) return;

    saveWeatherLocationForNotifications({
      lat,
      lon,
      locationName: weather?.locationName || null,
    });
  }, [
    coords?.latitude,
    coords?.longitude,
    coords?.lat,
    coords?.lon,
    coords?.lng,
    weather?.locationName,
  ]);

  const loadRadar = useCallback(async () => {
    logEvent("today_radar_load_requested", userId, {
      screen: "TodayScreen",
      isPro: !!isPro,
      isDev: !!__DEV__,
    });

    const result = await fetchRadarFrames();
    console.log("DuckSmart TodayScreen radar result", result);

    logEvent("today_radar_load_result", userId, {
      screen: "TodayScreen",
      isPro: !!isPro,
      hasRadar: !!result?.tileUrl,
      radarFrameCount: Array.isArray(result?.frames) ? result.frames.length : 0,
      radarTimestamp: result?.timestamp || null,
    });

    if (result) {
      setRadarTileUrl(result.tileUrl);
      setRadarTimestamp(result.timestamp);
      setRadarFrames(result.frames || []);
    }
  }, [isPro, userId]);

  useEffect(() => {
    logScreenView(userId, "TodayScreen");
    logEvent("today_screen_view", userId, todayAnalyticsMeta);
  }, [userId]);

  useEffect(() => {
    if (!weather?.tempF && !weather?.locationName) return;

    const signature = JSON.stringify({
      refreshCount,
      tempF: weather?.tempF ?? null,
      feelsLikeF: weather?.feelsLikeF ?? null,
      windMph: weather?.windMph ?? null,
      pressureInHg: weather?.pressureInHg ?? null,
      precipChance: weather?.precipChance ?? null,
      cloudPct: weather?.cloudPct ?? null,
      huntScore: analyticsNumber(hunt?.score),
      locationName: weather?.locationName || null,
    });

    if (weatherAnalyticsSignatureRef.current === signature) return;
    weatherAnalyticsSignatureRef.current = signature;

    logEvent("today_weather_snapshot", userId, {
      ...todayAnalyticsMeta,
      refreshCount,
    });
  }, [weather, hunt, refreshCount, todayAnalyticsMeta, userId]);

  useEffect(() => {
    const trendCount = Array.isArray(weather?.trends48h) ? weather.trends48h.length : 0;
    if (trendCount <= 2) return;

    const signature = `${userId || "guest"}-${isPro ? "pro" : "free"}-${trendCount}`;
    if (proTrendsAnalyticsSignatureRef.current === signature) return;
    proTrendsAnalyticsSignatureRef.current = signature;

    logEvent(isPro ? "today_48h_trends_visible" : "today_48h_trends_paywall_visible", userId, {
      ...todayAnalyticsMeta,
      trendCount,
    });
  }, [weather?.trends48h, isPro, todayAnalyticsMeta, userId]);

  useEffect(() => {
    loadRadar();
  }, [loadRadar]);

  useEffect(() => {
    if (!radarExpanded || !radarPlaying || radarFrames.length < 2) return;

    const interval = setInterval(() => {
      setRadarFrameIndex((prev) => (prev + 1) % radarFrames.length);
    }, RADAR_FRAME_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [radarExpanded, radarPlaying, radarFrames.length]);

  useEffect(() => {
    if (radarExpanded && radarFrames.length > 1) {
      setRadarFrameIndex(0);
      setRadarPlaying(true);
    } else {
      setRadarPlaying(false);
    }
  }, [radarExpanded, radarFrames.length]);

  const onRefresh = useCallback(async () => {
    logEvent("today_pull_to_refresh_started", userId, todayAnalyticsMeta);
    setRefreshing(true);
    await Promise.all([refresh(), loadRadar()]);
    setRefreshing(false);
    setRefreshCount((c) => c + 1);
    logEvent("today_pull_to_refresh_completed", userId, todayAnalyticsMeta);
  }, [refresh, loadRadar, todayAnalyticsMeta, userId]);

  const toggleHuntAlerts = useCallback(async () => {
    logEvent("today_hunt_alerts_toggle_pressed", userId, {
      ...todayAnalyticsMeta,
      previousAlertsOn: !!alertsOn,
    });

    if (alertsOn) {
      await cancelHuntAlerts();
      setAlertsOn(false);
      logEvent("today_hunt_alerts_cancelled", userId, todayAnalyticsMeta);
      Alert.alert("Alerts Off", "Sunrise and sunset alerts have been cancelled.");
    } else {
      const success = await scheduleHuntAlerts(weather.sunrise, weather.sunset);

      if (success) {
        setAlertsOn(true);
        logEvent("today_hunt_alerts_scheduled", userId, todayAnalyticsMeta);
        Alert.alert("Alerts Set!", "You'll be notified 30 min before sunrise and at sunset.");
      } else {
        logEvent("today_hunt_alerts_permission_needed", userId, todayAnalyticsMeta);
        Alert.alert("Permission Needed", "Enable notifications in your device settings to use hunt alerts.");
      }
    }
  }, [alertsOn, weather.sunrise, weather.sunset, todayAnalyticsMeta, userId]);

  async function handleMarkInAppNotificationRead(item) {
    if (!userId || !item?.id) return;

    try {
      await markInAppNotificationRead(userId, item.id);

      setInAppNotifications((prev) => {
        const next = prev.filter((notification) => notification.id !== item.id);

        if (next.length === 0) {
          setInAppNotificationsVisible(false);
        }

        return next;
      });

      logEvent("today_in_app_notification_marked_read", userId, {
        screen: "TodayScreen",
        notificationId: item.id,
        notificationType: item.type || null,
      });
    } catch (err) {
      console.log("DuckSmart mark notification read error:", err?.message || err);
      Alert.alert("Notification Error", "Could not mark this notification as read.");
    }
  }

  function handleViewAllInAppNotifications() {
    setInAppNotificationsVisible(false);

    logEvent("today_in_app_notifications_view_all_pressed", userId, {
      screen: "TodayScreen",
      unreadCount: inAppNotifications.length,
    });

    if (typeof openGroupScreen === "function") {
      openGroupScreen();
      return;
    }

    Alert.alert(
      "Notifications",
      "Open Groups / Shared Logs to view your DuckSmart notifications."
    );
  }

  if (loading && !weather?.tempF) {
    return (
      <ScreenBackground style={s.safe} bg={ASSETS.backgrounds.today}>
        <View pointerEvents="none" style={s.darkScrim} />
        <SafeAreaView edges={["top", "left", "right"]} style={{ flex: 1 }}>
          <StatusBar barStyle="light-content" />
          <View style={s.loadingWrap}>
            <ActivityIndicator size="large" color={GOLD} />
            <Text style={s.loadingTitle}>Loading weather...</Text>
            <Text style={s.loadingSub}>Building your hunt picture.</Text>
          </View>

          <InAppNotificationsModal
            visible={inAppNotificationsVisible}
            notifications={inAppNotifications}
            onClose={() => setInAppNotificationsVisible(false)}
            onViewAll={handleViewAllInAppNotifications}
            onMarkRead={handleMarkInAppNotificationRead}
          />
        </SafeAreaView>
      </ScreenBackground>
    );
  }

  return (
    <ScreenBackground style={s.safe} bg={ASSETS.backgrounds.today}>
      <View pointerEvents="none" style={s.darkScrim} />

      <SafeAreaView edges={["top", "left", "right"]} style={{ flex: 1 }}>
        <StatusBar barStyle="light-content" />

        <WhyScoreModal
          visible={whyModalVisible}
          onClose={() => {
            logEvent("today_score_details_closed", userId, todayAnalyticsMeta);
            setWhyModalVisible(false);
          }}
          hunt={hunt}
        />

        <InAppNotificationsModal
          visible={inAppNotificationsVisible}
          notifications={inAppNotifications}
          onClose={() => setInAppNotificationsVisible(false)}
          onViewAll={handleViewAllInAppNotifications}
          onMarkRead={handleMarkInAppNotificationRead}
        />

        <ScrollView
          style={s.scrollSurface}
          contentContainerStyle={s.container}
          contentInsetAdjustmentBehavior="never"
          automaticallyAdjustContentInsets={false}
          automaticallyAdjustsScrollIndicatorInsets={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={GOLD}
              colors={[GOLD]}
            />
          }
        >
          <View style={s.heroTop}>
            <View style={s.headerRow}>
              <View style={s.brandRow}>
                <Image source={ASSETS.logo} style={s.logoSmall} resizeMode="contain" />
                <View>
                  <Text style={s.brand}>
                    <Text style={s.brandDuck}>DUCK</Text>
                    <Text style={s.brandSmart}>SMART</Text>
                  </Text>
                  <Text style={s.locationText} numberOfLines={1}>
                    Today • {weather.locationName || "Current Location"}
                  </Text>
                </View>
              </View>

              <Pressable
                style={s.gearButton}
                onPress={() => {
                  logEvent("today_settings_pressed", userId, todayAnalyticsMeta);
                  (onLogout || (() => {}))();
                }}
                accessibilityLabel="Settings"
                accessibilityRole="button"
              >
                <Text style={s.gearText}>⚙︎</Text>
              </Pressable>
            </View>

            <View style={s.heroCopy}>
              <Text style={s.heroWhite}>PREDICT THE HUNT.</Text>
            </View>
          </View>

          {refreshCount > 0 && refreshCount % 4 === 0 ? (
            <Text style={s.easterEggLine}>Same weather. Different hopes.</Text>
          ) : null}

          <View style={s.heroPanel}>
            <Pressable
              style={s.predictionTapArea}
              onPress={() => {
                logEvent("today_score_details_opened", userId, todayAnalyticsMeta);
                setWhyModalVisible(true);
              }}
              accessibilityLabel="Open prediction score details"
              accessibilityRole="button"
            >
              <View style={s.heroScoreHeader}>
                <View>
                  <Text style={s.panelEyebrow}>PREDICTION SCORE</Text>
                  <Text style={s.panelTitle}>
                    {hunt.score >= 70 ? "Optimal Conditions" : hunt.score >= 45 ? "Huntable Window" : "Tough Conditions"}
                  </Text>
                </View>

                <View style={s.scorePill}>
                  <Text style={s.scorePillText}>
                    {hunt.score >= 70 ? "PRIME" : hunt.score >= 45 ? "FAIR" : "LOW"}
                  </Text>
                </View>
              </View>

              <HeroGauge value={hunt.score} />

              <Text style={s.tapHint}>Tap score for details</Text>
            </Pressable>

            <View style={s.heroMetricGrid}>
              <SmallMetric
                label="Weather"
                icon={getWeatherEmojiFromData({
                  precip: weather.precipChance,
                  cloudPct: weather.cloudPct,
                  temp: weather.tempF,
                })}
                value={`${weather.precipChance ?? "--"}%`}
                accent={GOLD}
              />
              <SmallMetric
                label="Wind"
                icon="💨"
                value={`${weather.windMph ?? "--"} mph`}
              />
              <SmallMetric
                label="Pressure"
                icon="⌁"
                value={`${weather.pressureInHg ?? "--"}`}
              />
            </View>

            <MiniForecastBlock
              title={isPro ? "5-Hour Weather" : "3-Hour Weather"}
              subtitle={isPro ? "Next hunt window" : "Pro unlocks 5 hours"}
            >
              <HourlyWeatherRow hourly={hourly} limit={hourlyForecastLimit} />
              {!isPro ? (
                <ProUpgradePrompt compact message="Unlock the full 5-hour forecast with Pro" />
              ) : null}
            </MiniForecastBlock>

            <MiniForecastBlock
              title={isPro ? "5-Day Weather" : "3-Day Weather"}
              subtitle={isPro ? "Daily outlook" : "Pro unlocks 5 days"}
            >
              <DailyWeatherRow days={dailyWeatherCards} limit={dailyForecastLimit} />
              {!isPro ? (
                <ProUpgradePrompt compact message="Unlock the full 5-day forecast with Pro" />
              ) : null}
            </MiniForecastBlock>
          </View>

          {weather.migration ? (
            <SectionCard title="Migration Intel" eyebrow="BIRD MOVEMENT">
              <Text style={s.migSummary}>{weather.migration.summary}</Text>

              {weather.migration.topSpecies?.length > 0 ? (
                <View style={s.migSpeciesList}>
                  {weather.migration.topSpecies.map((sp, i) => (
                    <View key={`${sp.name}-${i}`} style={s.migSpeciesRow}>
                      <Text style={s.migSpeciesName}>{sp.name}</Text>
                      <Text style={s.migSpeciesCount}>{sp.count} sighted</Text>
                    </View>
                  ))}
                </View>
              ) : null}

              <View style={s.migFooter}>
                <View
                  style={[
                    s.migTrendPill,
                    {
                      backgroundColor:
                        weather.migration.trending === "up"
                          ? "#2ECC7122"
                          : weather.migration.trending === "down"
                            ? "#D94C4C22"
                            : "#88888822",
                    },
                  ]}
                >
                  <Text
                    style={[
                      s.migTrendText,
                      {
                        color:
                          weather.migration.trending === "up"
                            ? COLORS.green
                            : weather.migration.trending === "down"
                              ? COLORS.red
                              : COLORS.muted,
                      },
                    ]}
                  >
                    {weather.migration.trending === "up"
                      ? "▲"
                      : weather.migration.trending === "down"
                        ? "▼"
                        : "—"}{" "}
                    {weather.migration.changePercent > 0 ? "+" : ""}
                    {weather.migration.changePercent}% vs last week
                  </Text>
                </View>
                <Text style={s.migSource}>via eBird</Text>
              </View>
            </SectionCard>
          ) : null}

          <SectionCard title="Real-Time Weather" eyebrow="FIELD CONDITIONS">
            <View style={s.metricRow}>
              <SmallMetric label="Temp" icon="🌡️" value={`${weather.tempF ?? "--"}°F`} />
              <SmallMetric label="Feels" icon="🧥" value={`${weather.feelsLikeF ?? "--"}°F`} />
              <SmallMetric label="Precip" icon="🌧️" value={`${weather.precipChance ?? "--"}%`} />
            </View>

            <View style={s.metricRow}>
              <SmallMetric label="Pressure" icon="⌁" value={`${weather.pressureInHg ?? "--"}`} />
              <SmallMetric label="Clouds" icon="☁️" value={`${weather.cloudPct ?? "--"}%`} />
              <SmallMetric
                label="Wind"
                icon="💨"
                value={`${weather.windMph ?? "--"} ${formatWind(weather.windDeg)}`}
              />
            </View>

            <View style={s.windCompassRow}>
              <WindCompass deg={weather.windDeg} speed={weather.windMph} size={82} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={s.windFromLabel}>
                  Wind from <Text style={{ color: GOLD }}>{formatWind(weather.windDeg)}</Text>
                </Text>
                <View style={s.sunRow}>
                  <View style={s.sunPill}>
                    <Text style={s.sunLabel}>Sunrise</Text>
                    <Text style={s.sunValue}>{weather.sunrise || "--"}</Text>
                  </View>
                  <View style={s.sunPill}>
                    <Text style={s.sunLabel}>Sunset</Text>
                    <Text style={s.sunValue}>{weather.sunset || "--"}</Text>
                  </View>
                </View>
              </View>
            </View>

            <View style={s.moonRow}>
              <Text style={s.moonEmoji}>{moonPhase.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.moonName}>{moonPhase.name}</Text>
                <Text style={s.moonDetail}>
                  {Math.round(moonPhase.illumination * 100)}% illuminated • Solunar{" "}
                  {moonPhase.illumination < 0.15 || moonPhase.illumination > 0.85
                    ? "peak"
                    : moonPhase.illumination > 0.35 && moonPhase.illumination < 0.65
                      ? "low"
                      : "moderate"}
                </Text>
              </View>
            </View>

            <Pressable
              style={[s.alertBtn, alertsOn ? s.alertBtnActive : null]}
              onPress={toggleHuntAlerts}
              accessibilityLabel={alertsOn ? "Turn off hunt alerts" : "Set sunrise and sunset alerts"}
              accessibilityRole="button"
            >
              <Text style={[s.alertBtnText, alertsOn ? s.alertBtnTextActive : null]}>
                {alertsOn ? "🔔  Shoot-Time Alerts On" : "🔕  Set Shoot-Time Alerts"}
              </Text>
            </Pressable>
          </SectionCard>

          {coords && radarTileUrl ? (
            <SectionCard
              title="Weather Radar"
              eyebrow="LIVE MAP"
              right={
                isPro ? (
                  <Pressable
                    style={s.radarRefreshBtn}
                    onPress={() => {
                      logEvent("today_radar_refresh_pressed", userId, todayAnalyticsMeta);
                      loadRadar();
                    }}
                    accessibilityLabel="Refresh radar"
                    accessibilityRole="button"
                  >
                    <Text style={s.radarRefreshText}>↻</Text>
                  </Pressable>
                ) : (
                  <View style={s.proTagPill}>
                    <Text style={s.proTagText}>STATIC</Text>
                  </View>
                )
              }
            >
              <Pressable
                onPress={() => {
                  logEvent("today_radar_card_pressed", userId, todayAnalyticsMeta);

                  if ((isPro || __DEV__) && radarFrames.length > 1) {
                    logEvent("today_radar_loop_opened", userId, todayAnalyticsMeta);
                    setRadarFrameIndex(0);
                    setRadarExpanded(true);
                  } else if (!isPro && !__DEV__) {
                    logEvent("today_radar_loop_paywall_shown", userId, todayAnalyticsMeta);
                    Alert.alert("Pro Feature", "Animated radar loop requires DuckSmart Pro.", [
                      { text: "Not Now", style: "cancel" },
                      {
                        text: "Upgrade to Pro",
                        onPress: () => {
                          logEvent("today_radar_loop_upgrade_pressed", userId, todayAnalyticsMeta);
                          purchase();
                        },
                      },
                    ]);
                  }
                }}
              >
                <View style={s.radarWrap}>
                  <MapView
                    style={s.radarMap}
                    initialRegion={{
                      latitude: coords.latitude,
                      longitude: coords.longitude,
                      latitudeDelta: RADAR_REGION_DELTA,
                      longitudeDelta: RADAR_REGION_DELTA,
                    }}
                    mapType="standard"
                    pointerEvents="none"
                    maxZoomLevel={RADAR_MAX_ZOOM}
                    scrollEnabled={false}
                    zoomEnabled={false}
                    rotateEnabled={false}
                    pitchEnabled={false}
                    toolbarEnabled={false}
                  >
                    <UrlTile
                      urlTemplate={radarTileUrl}
                      zIndex={1}
                      opacity={0.7}
                      minimumZ={0}
                      maximumZ={RADAR_MAX_ZOOM}
                      maximumNativeZ={RADAR_MAX_ZOOM}
                      tileSize={256}
                    />
                  </MapView>

                  <View style={s.radarOverlayTag}>
                    <Text style={s.radarOverlayText}>
                      {(isPro || __DEV__) ? "Tap for loop" : "Pro unlocks animation"}
                    </Text>
                  </View>
                </View>
              </Pressable>

              <Text style={s.radarCaption}>
                {(isPro || __DEV__)
                  ? `Live radar • ${formatRadarAge(radarTimestamp)} • Tap to expand`
                  : "Static radar • Upgrade to Pro for animated radar"}
              </Text>
            </SectionCard>
          ) : null}

          <Modal
            visible={radarExpanded}
            transparent={false}
            animationType="slide"
            onRequestClose={() => {
              logEvent("today_radar_modal_closed", userId, todayAnalyticsMeta);
              setRadarExpanded(false);
            }}
          >
            <SafeAreaView style={s.radarModalSafe}>
              <View style={s.radarModalHeader}>
                <View>
                  <Text style={s.radarModalTitle}>Weather Radar</Text>
                  {radarFrames[radarFrameIndex] ? (
                    <Text style={s.radarModalSub}>
                      {formatRadarAge(radarFrames[radarFrameIndex].timestamp)}
                    </Text>
                  ) : null}
                </View>

                <Pressable
                  onPress={() => {
                    logEvent("today_radar_modal_closed", userId, todayAnalyticsMeta);
                    setRadarExpanded(false);
                  }}
                  style={s.radarCloseBtn}
                >
                  <Text style={s.radarCloseText}>✕</Text>
                </Pressable>
              </View>

              <View style={{ flex: 1 }}>
                {coords && radarFrames[radarFrameIndex] ? (
                  <MapView
                    style={{ flex: 1 }}
                    initialRegion={{
                      latitude: coords.latitude,
                      longitude: coords.longitude,
                      latitudeDelta: RADAR_REGION_DELTA,
                      longitudeDelta: RADAR_REGION_DELTA,
                    }}
                    mapType="standard"
                    maxZoomLevel={RADAR_MAX_ZOOM}
                    rotateEnabled={false}
                    pitchEnabled={false}
                    toolbarEnabled={false}
                  >
                    <UrlTile
                      urlTemplate={radarFrames[radarFrameIndex].tileUrl}
                      zIndex={1}
                      opacity={0.7}
                      minimumZ={0}
                      maximumZ={RADAR_MAX_ZOOM}
                      maximumNativeZ={RADAR_MAX_ZOOM}
                      tileSize={256}
                    />
                  </MapView>
                ) : null}
              </View>

              <View style={s.radarControls}>
                <Pressable
                  onPress={() => {
                    logEvent("today_radar_frame_previous_pressed", userId, {
                      ...todayAnalyticsMeta,
                      radarFrameIndex,
                    });
                    setRadarPlaying(false);
                    setRadarFrameIndex((prev) => (prev - 1 + radarFrames.length) % radarFrames.length);
                  }}
                  style={s.radarStepBtn}
                >
                  <Text style={s.radarStepText}>◀</Text>
                </Pressable>

                <Pressable
                  onPress={() => {
                    logEvent(radarPlaying ? "today_radar_paused" : "today_radar_played", userId, {
                      ...todayAnalyticsMeta,
                      radarFrameIndex,
                    });
                    setRadarPlaying((prev) => !prev);
                  }}
                  style={s.radarPlayBtn}
                >
                  <Text style={s.radarPlayText}>{radarPlaying ? "⏸" : "▶"}</Text>
                </Pressable>

                <Pressable
                  onPress={() => {
                    logEvent("today_radar_frame_next_pressed", userId, {
                      ...todayAnalyticsMeta,
                      radarFrameIndex,
                    });
                    setRadarPlaying(false);
                    setRadarFrameIndex((prev) => (prev + 1) % radarFrames.length);
                  }}
                  style={s.radarStepBtn}
                >
                  <Text style={s.radarStepText}>▶</Text>
                </Pressable>
              </View>

              <View style={s.radarFrameFooter}>
                <Text style={s.radarFrameText}>
                  Frame {radarFrameIndex + 1} of {radarFrames.length}
                </Text>
              </View>
            </SafeAreaView>
          </Modal>

          {weather.trends48h && weather.trends48h.length > 2 ? (
            isPro ? (
              <SectionCard title="48-Hour Trends" eyebrow="PRESSURE + TEMP">
                <View style={s.trendSection}>
                  <Text style={s.trendLabel}>Temperature (°F)</Text>
                  <TrendSparkline
                    data={weather.trends48h.map((d) => d.temp)}
                    color={COLORS.green}
                    width={trendWidth}
                    height={56}
                    suffix="°"
                  />
                </View>

                <View style={s.trendSection}>
                  <Text style={s.trendLabel}>Barometric Pressure (inHg)</Text>
                  <TrendSparkline
                    data={weather.trends48h.map((d) => d.pressureInHg)}
                    color={GOLD}
                    width={trendWidth}
                    height={56}
                    suffix=""
                  />
                </View>

                <View style={s.trendTimeRow}>
                  <Text style={s.trendTimeLabel}>Now</Text>
                  <Text style={s.trendTimeLabel}>24h</Text>
                  <Text style={s.trendTimeLabel}>48h</Text>
                </View>
              </SectionCard>
            ) : (
              <SectionCard
                title="48-Hour Trends"
                eyebrow="PRO INSIGHTS"
                right={
                  <View style={s.proTagPill}>
                    <Text style={s.proTagText}>PRO</Text>
                  </View>
                }
              >
                <ProUpgradePrompt message="Unlock 48-hour temperature and pressure trend charts to spot cold fronts and pressure changes before they arrive." />
              </SectionCard>
            )
          ) : null}

          <InAppSponsorAd screen="TodayScreen" placementId="today_bottom_sponsor" />

          <Text style={s.disclaimer}>
            The prediction score is an estimate based on weather, environmental data, and historical patterns.
            It is not a guarantee of hunt success — actual results may vary due to animal behavior,
            local conditions, and other factors beyond prediction.
          </Text>

        </ScrollView>
      </SafeAreaView>
    </ScreenBackground>
  );
}

const s = StyleSheet.create({
  safe: {
    flex: 1,
  },
  scrollSurface: {
    flex: 1,
    backgroundColor: "transparent",
  },
  darkScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.68)",
    zIndex: 0,
  },
  container: {
    padding: 12,
    paddingBottom: 100,
    zIndex: 1,
  },

  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 22,
    zIndex: 1,
  },
  loadingTitle: {
    color: COLORS.white,
    marginTop: 12,
    fontWeight: "900",
    fontSize: 16,
  },
  loadingSub: {
    color: COLORS.muted,
    marginTop: 5,
    fontWeight: "700",
    fontSize: 12,
  },

  heroTop: {
    marginBottom: 8,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  logoSmall: {
    width: 38,
    height: 38,
    borderRadius: 11,
  },
  brand: {
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: 0.2,
  },
  brandDuck: {
    color: COLORS.white,
  },
  brandSmart: {
    color: GOLD,
  },
  locationText: {
    color: "rgba(255,255,255,0.7)",
    fontWeight: "800",
    fontSize: 11,
    marginTop: 1,
    maxWidth: SCREEN_WIDTH - 126,
  },
  gearButton: {
    width: 40,
    height: 40,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "rgba(217,168,76,0.35)",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.62)",
  },
  gearText: {
    color: COLORS.white,
    fontSize: 18,
    fontWeight: "900",
  },

  heroCopy: {
    marginTop: 14,
    marginBottom: 2,
  },
  heroWhite: {
    color: COLORS.white,
    fontSize: 30,
    lineHeight: 34,
    fontWeight: "900",
    letterSpacing: -0.8,
  },

  easterEggLine: {
    color: "rgba(255,255,255,0.36)",
    fontSize: 11,
    fontWeight: "700",
    fontStyle: "italic",
    textAlign: "center",
    marginTop: 2,
    marginBottom: 6,
  },

  heroPanel: {
    marginTop: 6,
    padding: 12,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.74)",
    borderWidth: 1,
    borderColor: "rgba(217,168,76,0.25)",
    overflow: "hidden",
  },
  predictionTapArea: {
    borderRadius: 18,
  },
  heroScoreHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  panelEyebrow: {
    color: GOLD,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
  panelTitle: {
    color: COLORS.white,
    fontSize: 18,
    fontWeight: "900",
    marginTop: 3,
  },
  scorePill: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: GOLD_SOFT,
    borderWidth: 1,
    borderColor: GOLD,
  },
  scorePillText: {
    color: GOLD,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  gaugeWrap: {
    alignItems: "center",
    marginTop: 2,
    marginBottom: -21,
  },
  tapHint: {
    color: "rgba(255,255,255,0.42)",
    fontSize: 10,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 2,
  },
  heroMetricGrid: {
    flexDirection: "row",
    gap: 8,
    marginTop: 6,
  },

  miniForecastBlock: {
    marginTop: 10,
  },
  miniForecastHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginBottom: 7,
  },
  miniForecastTitle: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: "900",
  },
  miniForecastSub: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
  },

  card: {
    marginTop: 10,
    backgroundColor: DARK_CARD,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    padding: 12,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  cardEyebrow: {
    color: GOLD,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  cardTitle: {
    color: COLORS.white,
    fontSize: 17,
    fontWeight: "900",
    letterSpacing: -0.2,
  },
  cardBody: {
    marginTop: 10,
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.78)",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
  },
  whyModalCard: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 24,
    backgroundColor: "rgba(8,12,13,0.98)",
    borderWidth: 1,
    borderColor: "rgba(217,168,76,0.34)",
    padding: 16,
  },
  whyModalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  modalEyebrow: {
    color: GOLD,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  whyModalTitle: {
    color: COLORS.white,
    fontSize: 22,
    fontWeight: "900",
    marginTop: 3,
  },
  modalCloseBtn: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  modalCloseText: {
    color: COLORS.white,
    fontSize: 17,
    fontWeight: "900",
  },
  modalScoreRow: {
    marginTop: 14,
    padding: 13,
    borderRadius: 18,
    backgroundColor: GOLD_SOFT,
    borderWidth: 1,
    borderColor: "rgba(217,168,76,0.30)",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  modalScoreNumber: {
    color: GOLD,
    fontSize: 34,
    fontWeight: "900",
  },
  modalScoreText: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: "900",
    flex: 1,
  },
  whyModalList: {
    marginTop: 14,
    gap: 2,
  },
  whyRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 7,
    alignItems: "flex-start",
  },
  whyBullet: {
    color: GOLD,
    fontWeight: "900",
    marginTop: 1,
    width: 16,
  },
  whyText: {
    color: "rgba(255,255,255,0.76)",
    fontSize: 13,
    lineHeight: 18,
    flex: 1,
    fontWeight: "700",
  },
  modalDoneBtn: {
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: GOLD_SOFT,
    borderWidth: 1,
    borderColor: GOLD,
    alignItems: "center",
  },
  modalDoneText: {
    color: GOLD,
    fontSize: 13,
    fontWeight: "900",
  },

  metricRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
  },
  smallMetric: {
    flex: 1,
    minHeight: 68,
    padding: 10,
    borderRadius: 16,
    backgroundColor: DARK_CARD_SOFT,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    justifyContent: "center",
  },
  smallMetricTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  smallMetricIcon: {
    color: GOLD,
    fontSize: 14,
    fontWeight: "900",
  },
  smallMetricLabel: {
    color: "rgba(255,255,255,0.52)",
    fontSize: 9,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  smallMetricValue: {
    marginTop: 6,
    color: COLORS.white,
    fontSize: 17,
    fontWeight: "900",
  },

  weatherEmoji: {
    textAlign: "center",
  },

  fiveCardRow: {
    flexDirection: "row",
    gap: 6,
  },
  forecastMiniCard: {
    flex: 1,
    minHeight: 92,
    borderRadius: 15,
    backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  forecastMiniTime: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 10,
    fontWeight: "900",
    marginBottom: 4,
  },
  forecastMiniTemp: {
    color: COLORS.white,
    fontSize: 18,
    fontWeight: "900",
    marginTop: 4,
  },
  forecastMiniSmall: {
    color: "rgba(255,255,255,0.48)",
    fontSize: 9,
    fontWeight: "800",
    marginTop: 1,
  },
  emptyForecastBox: {
    padding: 11,
    borderRadius: 15,
    backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  emptyForecastText: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 12,
    fontWeight: "800",
    textAlign: "center",
  },

  migSummary: {
    color: "rgba(255,255,255,0.82)",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "700",
  },
  migSpeciesList: {
    marginTop: 10,
    gap: 7,
  },
  migSpeciesRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 9,
    paddingHorizontal: 11,
    borderRadius: 15,
    backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  migSpeciesName: {
    color: COLORS.white,
    fontSize: 13,
    fontWeight: "900",
  },
  migSpeciesCount: {
    color: GOLD,
    fontSize: 12,
    fontWeight: "900",
  },
  migFooter: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  migTrendPill: {
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: 999,
  },
  migTrendText: {
    fontSize: 12,
    fontWeight: "900",
  },
  migSource: {
    color: "rgba(255,255,255,0.35)",
    fontSize: 11,
    fontWeight: "800",
  },

  windCompassRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
    padding: 10,
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  compassWrap: {
    alignItems: "center",
  },
  compassSpeed: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 10,
    fontWeight: "900",
    marginTop: 1,
  },
  windFromLabel: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 13,
    fontWeight: "900",
    marginBottom: 7,
  },
  sunRow: {
    flexDirection: "row",
    gap: 8,
  },
  sunPill: {
    flex: 1,
    padding: 9,
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.28)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  sunLabel: {
    color: "rgba(255,255,255,0.48)",
    fontSize: 9,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  sunValue: {
    marginTop: 4,
    color: COLORS.white,
    fontSize: 12,
    fontWeight: "900",
  },
  moonRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
    padding: 10,
    borderRadius: 17,
    backgroundColor: "rgba(217,168,76,0.09)",
    borderWidth: 1,
    borderColor: "rgba(217,168,76,0.22)",
  },
  moonEmoji: {
    fontSize: 24,
    marginRight: 10,
  },
  moonName: {
    color: COLORS.white,
    fontSize: 13,
    fontWeight: "900",
  },
  moonDetail: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 3,
    lineHeight: 16,
  },
  alertBtn: {
    marginTop: 10,
    paddingVertical: 12,
    borderRadius: 15,
    backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    alignItems: "center",
  },
  alertBtnActive: {
    borderColor: GOLD,
    backgroundColor: GOLD_SOFT,
  },
  alertBtnText: {
    color: "rgba(255,255,255,0.78)",
    fontWeight: "900",
    fontSize: 13,
  },
  alertBtnTextActive: {
    color: GOLD,
  },

  radarWrap: {
    height: 198,
    borderRadius: 17,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(217,168,76,0.25)",
    backgroundColor: "#111",
  },
  radarMap: {
    width: "100%",
    height: "100%",
  },
  radarOverlayTag: {
    position: "absolute",
    right: 9,
    bottom: 9,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.72)",
    borderWidth: 1,
    borderColor: "rgba(217,168,76,0.35)",
  },
  radarOverlayText: {
    color: GOLD,
    fontSize: 10,
    fontWeight: "900",
  },
  radarCaption: {
    color: "rgba(255,255,255,0.52)",
    fontSize: 11,
    fontWeight: "800",
    marginTop: 8,
    textAlign: "center",
  },
  radarRefreshBtn: {
    width: 32,
    height: 32,
    borderRadius: 11,
    backgroundColor: GOLD_SOFT,
    borderWidth: 1,
    borderColor: "rgba(217,168,76,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  radarRefreshText: {
    color: GOLD,
    fontSize: 16,
    fontWeight: "900",
  },

  radarModalSafe: {
    flex: 1,
    backgroundColor: COLORS.black,
  },
  radarModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  radarModalTitle: {
    color: COLORS.white,
    fontWeight: "900",
    fontSize: 18,
  },
  radarModalSub: {
    color: "rgba(255,255,255,0.5)",
    fontWeight: "700",
    fontSize: 12,
    marginTop: 3,
  },
  radarCloseBtn: {
    width: 40,
    height: 40,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  radarCloseText: {
    color: COLORS.white,
    fontSize: 17,
    fontWeight: "900",
  },
  radarControls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  radarStepBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: DARK_CARD_SOFT,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  radarStepText: {
    color: COLORS.white,
    fontWeight: "900",
    fontSize: 17,
  },
  radarPlayBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: GOLD_SOFT,
    borderWidth: 1,
    borderColor: GOLD,
    alignItems: "center",
    justifyContent: "center",
  },
  radarPlayText: {
    color: GOLD,
    fontWeight: "900",
    fontSize: 21,
  },
  radarFrameFooter: {
    alignItems: "center",
    paddingBottom: 14,
  },
  radarFrameText: {
    color: "rgba(255,255,255,0.48)",
    fontSize: 12,
    fontWeight: "800",
  },

  trendSection: {
    marginBottom: 12,
  },
  trendLabel: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 12,
    fontWeight: "900",
    marginBottom: 7,
  },
  trendChartWrap: {
    overflow: "hidden",
  },
  trendMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 1,
  },
  trendArrow: {
    fontSize: 12,
    fontWeight: "900",
  },
  trendRange: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 11,
    fontWeight: "800",
  },
  trendTimeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 4,
  },
  trendTimeLabel: {
    color: "rgba(255,255,255,0.32)",
    fontSize: 10,
    fontWeight: "800",
  },

  proTagPill: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: GOLD_SOFT,
    borderWidth: 1,
    borderColor: "rgba(217,168,76,0.32)",
  },
  proTagText: {
    color: GOLD,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.7,
  },

  disclaimer: {
    marginTop: 14,
    color: "rgba(255,255,255,0.34)",
    fontSize: 11,
    lineHeight: 17,
    fontWeight: "700",
    textAlign: "center",
    paddingHorizontal: 8,
  },
});