//screens/HistoryScreen.js
import React, { useMemo, useState, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StatusBar,
  TextInput,
  Alert,
  Platform,
  KeyboardAvoidingView,
  Image,
  Share,
  Modal,
  Dimensions,
  StyleSheet,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import MapView, { Marker } from "react-native-maps";
import Svg, {
  Path,
  Circle,
  Text as SvgText,
  Defs,
  LinearGradient,
  Stop,
} from "react-native-svg";

import { sharedStyles as styles } from "../constants/styles";
import { COLORS, ENVIRONMENTS } from "../constants/theme";
import { ASSETS } from "../constants/assets";
import { SPREADS } from "../data/decoySpreadData";
import { clamp } from "../utils/helpers";
import Chip from "../components/Chip";
import ScreenBackground from "../components/ScreenBackground";
import { usePremium } from "../context/PremiumContext";
import { createSharedHuntLog } from "../services/shareImport";
import { logEvent as logFirebaseEvent, logScreenView as logFirebaseScreenView } from "../services/analytics";

const SCREEN_WIDTH = Dimensions.get("window").width;

const GOLD = "#D9A84C";
const GREEN = "#39D96A";
const RED = "#FF4D4D";
const BG_DARK = "#05090A";
const CARD = "rgba(17,23,25,0.92)";
const CARD_SOFT = "rgba(255,255,255,0.045)";
const BORDER = "rgba(255,255,255,0.075)";
const GOLD_BORDER = "rgba(217,168,76,0.34)";
const MUTED = "rgba(255,255,255,0.62)";
const MUTED_DARK = "rgba(255,255,255,0.42)";

const FILTERS = [
  { key: "currentSeason", label: "Current Season" },
  { key: "lastSeason", label: "Last Season" },
  { key: "all", label: "All Time" },
];

const HISTORY_SEASON_STATE_KEY = "@ducksmart_history_season_state_v1";

const FALLBACK_THUMBS = [
  ASSETS.backgrounds.today,
  ASSETS.backgrounds.identify,
  ASSETS.backgrounds.log,
  ASSETS.backgrounds.history,
].filter(Boolean);

function getDefaultSeasonStartTimestamp() {
  const now = new Date();
  const seasonStartYear = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  return new Date(seasonStartYear, 8, 1, 0, 0, 0, 0).getTime();
}

function createDefaultSeasonState() {
  return {
    currentSeasonStart: getDefaultSeasonStartTimestamp(),
    lastSeasonStart: null,
    lastSeasonClosedAt: null,
    undo: null,
  };
}

function normalizeSeasonState(value) {
  const fallback = createDefaultSeasonState();

  if (!value || typeof value !== "object") return fallback;

  return {
    currentSeasonStart:
      Number.isFinite(Number(value.currentSeasonStart))
        ? Number(value.currentSeasonStart)
        : fallback.currentSeasonStart,
    lastSeasonStart:
      Number.isFinite(Number(value.lastSeasonStart))
        ? Number(value.lastSeasonStart)
        : null,
    lastSeasonClosedAt:
      Number.isFinite(Number(value.lastSeasonClosedAt))
        ? Number(value.lastSeasonClosedAt)
        : null,
    undo:
      value.undo && typeof value.undo === "object"
        ? normalizeSeasonState({ ...value.undo, undo: null })
        : null,
  };
}

function isCurrentSeasonLog(log, seasonState) {
  return getLogTimestamp(log) >= Number(seasonState.currentSeasonStart || 0);
}

function isLastSeasonLog(log, seasonState) {
  if (!seasonState.lastSeasonStart || !seasonState.lastSeasonClosedAt) return false;

  const ts = getLogTimestamp(log);
  return ts >= Number(seasonState.lastSeasonStart) && ts < Number(seasonState.lastSeasonClosedAt);
}

function formatSeasonDate(timestamp) {
  if (!timestamp) return "";

  return new Date(timestamp).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function cleanAnalyticsParams(params = {}) {
  return Object.entries(params).reduce((safe, [key, value]) => {
    if (value === undefined || value === null) return safe;

    if (typeof value === "boolean") {
      safe[key] = value ? 1 : 0;
      return safe;
    }

    if (typeof value === "number") {
      safe[key] = Number.isFinite(value) ? value : 0;
      return safe;
    }

    safe[key] = String(value).slice(0, 100);
    return safe;
  }, {});
}

async function logAnalyticsEvent(name, params = {}) {
  try {
    await Promise.resolve(
      logFirebaseEvent(name, null, cleanAnalyticsParams(params))
    );
  } catch (err) {
    if (__DEV__) {
      console.log("DuckSmart analytics event error:", name, err?.message || err);
    }
  }
}

async function logAnalyticsScreen(screenName, params = {}) {
  try {
    await Promise.resolve(logFirebaseScreenView(null, screenName));

    if (Object.keys(params || {}).length > 0) {
      await Promise.resolve(
        logFirebaseEvent(
          "screen_view_detail",
          null,
          cleanAnalyticsParams({
            screen_name: screenName,
            ...params,
          })
        )
      );
    }
  } catch (err) {
    if (__DEV__) {
      console.log("DuckSmart analytics screen error:", screenName, err?.message || err);
    }
  }
}

function getPhotoUri(photo) {
  if (!photo) return null;
  if (typeof photo === "string") return photo;
  return photo.uri || photo.downloadUrl || null;
}

function getImageSourceFromPhoto(photo) {
  const uri = getPhotoUri(photo);
  return uri ? { uri } : null;
}

function hashString(value) {
  const str = String(value || "");
  let hash = 0;

  for (let i = 0; i < str.length; i += 1) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }

  return Math.abs(hash);
}

function getLogDate(log) {
  const raw = log?.dateTime || log?.createdAt || Date.now();
  const date = typeof raw === "number" ? new Date(raw) : new Date(raw);

  if (Number.isNaN(date.getTime())) {
    return new Date();
  }

  return date;
}

function getLogTimestamp(log) {
  return getLogDate(log).getTime();
}

function formatDateTime(log) {
  return getLogDate(log).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatShortDate(log) {
  return getLogDate(log).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getDisplayLocation(log) {
  if (log?.pinTitle) return log.pinTitle;

  if (log?.location?.latitude != null && log?.location?.longitude != null) {
    return `${log.location.latitude.toFixed(4)}, ${log.location.longitude.toFixed(4)}`;
  }

  return log?.environment || "Hunt Location";
}

function getFallbackSource(log, index = 0) {
  if (!FALLBACK_THUMBS.length) return null;

  const key = log?.id || log?.dateTime || index;
  return FALLBACK_THUMBS[hashString(key) % FALLBACK_THUMBS.length];
}

function getLogThumbnailSource(log, index = 0) {
  const firstPhoto = Array.isArray(log?.photos) ? log.photos[0] : null;
  const photoSource = getImageSourceFromPhoto(firstPhoto);
  if (photoSource) return photoSource;

  const spreadPhotoSource = getImageSourceFromPhoto(log?.spreadPhoto);
  if (spreadPhotoSource) return spreadPhotoSource;

  return getFallbackSource(log, index);
}

function formatScoreSmall(score) {
  const raw = Number(score || 0);
  const normalized = raw > 10 ? raw / 20 : raw;
  return normalized.toFixed(1);
}

function getScoreColor(score) {
  const raw = Number(score || 0);
  const normalized = raw > 10 ? raw / 20 : raw;

  if (normalized < 3.5) return RED;
  return GREEN;
}

function getKillColor(kills) {
  const value = Number(kills || 0);
  if (value > 0 && value < 6) return RED;
  return GREEN;
}

function getLogAnalyticsParams(log, extra = {}) {
  if (!log) return cleanAnalyticsParams(extra);

  const photos = Array.isArray(log.photos) ? log.photos : [];
  const ageDays = Math.max(0, Math.round((Date.now() - getLogTimestamp(log)) / 86400000));

  return cleanAnalyticsParams({
    log_id_hash: hashString(log.id || log.dateTime || log.createdAt),
    environment: log.environment || "unknown",
    spread: log.spread || "unknown",
    has_location: log?.location?.latitude != null && log?.location?.longitude != null ? 1 : 0,
    has_pin_title: log.pinTitle ? 1 : 0,
    has_notes: log.notes ? 1 : 0,
    has_spread_photo: log.spreadPhoto ? 1 : 0,
    photo_count: photos.length,
    ducks_harvested: Number(log.ducksHarvested || 0),
    crippled_birds: Number(log.crippledBirds || 0),
    hunters: Number(log.hunters || 1),
    hunt_score: Number(log.huntScore || 0),
    hunt_age_days: ageDays,
    ...extra,
  });
}

function isThisSeason(log) {
  const date = getLogDate(log);
  const now = new Date();
  const seasonStartYear = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  const seasonStart = new Date(seasonStartYear, 8, 1, 0, 0, 0, 0);

  return date >= seasonStart;
}

function isThisYear(log) {
  return getLogDate(log).getFullYear() === new Date().getFullYear();
}

function isCustomRange(log) {
  const date = getLogDate(log);
  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(now.getDate() - 30);

  return date >= thirtyDaysAgo;
}

function PhotoViewerModal({ photos, index, onClose, onChangeIndex }) {
  if (!photos || photos.length === 0) return null;

  const current = photos[index] || photos[0];
  const source = getImageSourceFromPhoto(current);
  const hasMultiple = photos.length > 1;

  return (
    <Modal visible transparent={false} animationType="fade" onRequestClose={onClose}>
      <SafeAreaView style={viewerStyles.safe}>
        <View style={viewerStyles.topBar}>
          <View style={{ flex: 1 }}>
            <Text style={viewerStyles.counter}>
              {hasMultiple ? `${index + 1} of ${photos.length}` : "Photo"}
            </Text>
          </View>

          <Pressable style={viewerStyles.closeBtn} onPress={onClose}>
            <Text style={viewerStyles.closeBtnText}>✕</Text>
          </Pressable>
        </View>

        <View style={viewerStyles.imageWrap}>
          {source ? (
            <Image source={source} style={viewerStyles.image} resizeMode="contain" />
          ) : (
            <Text style={viewerStyles.noPhotoText}>Photo unavailable</Text>
          )}

          {hasMultiple && index > 0 ? (
            <Pressable
              style={[viewerStyles.arrowBtn, viewerStyles.arrowLeft]}
              onPress={() => onChangeIndex(index - 1)}
            >
              <Text style={viewerStyles.arrowText}>‹</Text>
            </Pressable>
          ) : null}

          {hasMultiple && index < photos.length - 1 ? (
            <Pressable
              style={[viewerStyles.arrowBtn, viewerStyles.arrowRight]}
              onPress={() => onChangeIndex(index + 1)}
            >
              <Text style={viewerStyles.arrowText}>›</Text>
            </Pressable>
          ) : null}
        </View>

        <Pressable style={viewerStyles.bottomCloseBtn} onPress={onClose}>
          <Text style={viewerStyles.bottomCloseBtnText}>Close</Text>
        </Pressable>
      </SafeAreaView>
    </Modal>
  );
}

function StatCard({ icon, value, label, accent }) {
  return (
    <View style={local.statCard}>
      <Text style={local.statIcon}>{icon}</Text>
      <Text style={[local.statValue, accent ? { color: accent } : null]}>{value}</Text>
      <Text style={local.statLabel}>{label}</Text>
    </View>
  );
}

function KillsChart({ logs }) {
  const chartWidth = Math.max(SCREEN_WIDTH - 48, 280);
  const chartHeight = 160;
  const leftPad = 30;
  const rightPad = 8;
  const topPad = 16;
  const bottomPad = 28;

  const monthData = useMemo(() => {
    const now = new Date();
    const months = [];

    for (let i = 5; i >= 0; i -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        key: `${d.getFullYear()}-${d.getMonth()}`,
        label: d.toLocaleDateString(undefined, { month: "short" }),
        value: 0,
      });
    }

    logs.forEach((log) => {
      const d = getLogDate(log);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const match = months.find((m) => m.key === key);

      if (match) {
        match.value += Number(log.ducksHarvested || 0);
      }
    });

    return months;
  }, [logs]);

  const maxValue = Math.max(20, ...monthData.map((m) => m.value));
  const plotWidth = chartWidth - leftPad - rightPad;
  const plotHeight = chartHeight - topPad - bottomPad;

  const points = monthData.map((m, index) => {
    const x = leftPad + (index / Math.max(monthData.length - 1, 1)) * plotWidth;
    const y = topPad + (1 - m.value / maxValue) * plotHeight;

    return { x, y, value: m.value, label: m.label };
  });

  const linePath = points
    .map((p, index) => `${index === 0 ? "M" : "L"} ${p.x} ${p.y}`)
    .join(" ");

  const areaPath =
    points.length > 0
      ? `${linePath} L ${points[points.length - 1].x} ${topPad + plotHeight} L ${points[0].x} ${
          topPad + plotHeight
        } Z`
      : "";

  const yLabels = [0, 5, 10, 15, 20];

  return (
    <View style={local.chartCard}>
      <View style={local.chartHeader}>
        <Text style={local.sectionTitle}>KILLS OVER TIME</Text>
        <Text style={local.chartSort}>By Hunt Date⌄</Text>
      </View>

      <Svg width={chartWidth} height={chartHeight}>
        <Defs>
          <LinearGradient id="goldFill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={GOLD} stopOpacity="0.32" />
            <Stop offset="1" stopColor={GOLD} stopOpacity="0" />
          </LinearGradient>
        </Defs>

        {yLabels.map((label) => {
          const y = topPad + (1 - label / 20) * plotHeight;

          return (
            <React.Fragment key={label}>
              <Path
                d={`M ${leftPad} ${y} L ${chartWidth - rightPad} ${y}`}
                stroke="rgba(255,255,255,0.09)"
                strokeWidth={1}
                fill="none"
              />
              <SvgText
                x={4}
                y={y + 4}
                fill="rgba(255,255,255,0.64)"
                fontSize="10"
                fontWeight="700"
              >
                {label}
              </SvgText>
            </React.Fragment>
          );
        })}

        {areaPath ? <Path d={areaPath} fill="url(#goldFill)" /> : null}
        {linePath ? (
          <Path d={linePath} stroke={GOLD} strokeWidth={2.5} fill="none" strokeLinecap="round" />
        ) : null}

        {points.map((p, index) => (
          <Circle key={`point-${index}`} cx={p.x} cy={p.y} r={4} fill={GOLD} />
        ))}

        {points.map((p, index) => (
          <SvgText
            key={`label-${index}`}
            x={p.x}
            y={chartHeight - 7}
            fill="rgba(255,255,255,0.68)"
            fontSize="10"
            fontWeight="700"
            textAnchor="middle"
          >
            {p.label}
          </SvgText>
        ))}
      </Svg>
    </View>
  );
}

function SummaryBlock({ logs }) {
  const totalHunts = logs.length;
  const totalKilled = logs.reduce((sum, log) => sum + Number(log.ducksHarvested || 0), 0);
  const avgScore =
    totalHunts > 0
      ? logs.reduce((sum, log) => sum + Number(log.huntScore || 0), 0) / totalHunts
      : 0;
  const successRate =
    totalHunts > 0
      ? Math.round((logs.filter((log) => Number(log.ducksHarvested || 0) > 0).length / totalHunts) * 100)
      : 0;

  return (
    <View style={local.summaryBlock}>
      <Text style={local.sectionTitle}>HUNT SUMMARY</Text>

      <View style={local.statGrid}>
        <StatCard icon="▦" value={totalHunts} label="TOTAL HUNTS" />
        <StatCard icon="◎" value={totalKilled} label="TOTAL KILLED" />
        <StatCard icon="▥" value={formatScoreSmall(avgScore)} label="AVG PREDICTION SCORE" />
        <StatCard icon="◉" value={`${successRate}%`} label="SUCCESS RATE" />
      </View>
    </View>
  );
}

function HuntRow({ log, index, onPress, onDelete }) {
  const source = getLogThumbnailSource(log, index);
  const kills = Number(log.ducksHarvested || 0);
  const score = formatScoreSmall(log.huntScore || 0);

  return (
    <Pressable style={local.huntRow} onPress={onPress}>
      {source ? <Image source={source} style={local.huntThumb} resizeMode="cover" /> : null}

      <View style={local.huntInfo}>
        <Text style={local.huntDate} numberOfLines={1}>
          {formatDateTime(log)}
        </Text>
        <Text style={local.huntTitle} numberOfLines={1}>
          {getDisplayLocation(log)}
        </Text>
        <Text style={local.huntSub} numberOfLines={1}>
          {log.environment || "Hunt"}{log.pinTitle ? "" : " Log"}
        </Text>
      </View>

      <View style={local.huntNumbers}>
        <Text style={[local.huntKillCount, { color: getKillColor(kills) }]}>🦆 {kills}</Text>
        <Text style={[local.huntScoreText, { color: getScoreColor(log.huntScore) }]}>{score}</Text>
      </View>

      <Pressable
        onPress={(e) => {
          e.stopPropagation?.();
          onDelete?.();
        }}
        style={local.rowDeleteBtn}
      >
        <Text style={local.rowDeleteText}>×</Text>
      </Pressable>

      <Text style={local.huntChevron}>›</Text>
    </Pressable>
  );
}

function DetailStat({ label, value, color }) {
  return (
    <View style={local.detailStat}>
      <Text style={[local.detailStatValue, color ? { color } : null]}>{value}</Text>
      <Text style={local.detailStatLabel}>{label}</Text>
    </View>
  );
}

function HuntScoreGauge({ score }) {
  const size = 220;
  const stroke = 14;
  const radius = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const startX = cx - radius;
  const startY = cy;
  const endX = cx + radius;
  const endY = cy;
  const d = `M ${startX} ${startY} A ${radius} ${radius} 0 0 1 ${endX} ${endY}`;
  const p = clamp(Number(score || 0), 0, 100) / 100;
  const angle = Math.PI * (1 - p);
  const needleX = cx + radius * Math.cos(angle);
  const needleY = cy - radius * Math.sin(angle);
  const arcColor = score < 40 ? RED : score < 70 ? GOLD : GREEN;

  return (
    <View style={{ alignItems: "center" }}>
      <Svg width={size} height={size * 0.62} viewBox={`0 0 ${size} ${size}`}>
        <Path d={d} stroke="rgba(255,255,255,0.12)" strokeWidth={stroke} strokeLinecap="round" fill="none" />
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
        <SvgText x={cx} y={cy - 10} fill="#FFFFFF" fontSize="34" fontWeight="900" textAnchor="middle">
          {Math.round(score || 0)}
        </SvgText>
        <SvgText x={cx} y={cy + 18} fill={arcColor} fontSize="12" fontWeight="900" textAnchor="middle">
          HUNT SCORE
        </SvgText>
      </Svg>
    </View>
  );
}

function DetailCard({ title, children, right }) {
  return (
    <View style={local.detailCard}>
      <View style={local.detailCardHeader}>
        <Text style={local.detailCardTitle}>{title}</Text>
        {right ? <View>{right}</View> : null}
      </View>
      <View style={local.detailCardBody}>{children}</View>
    </View>
  );
}

function cleanHistoryShareNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function getHistoryShareCoordinate(value = {}) {
  if (!value) return null;

  const candidates = [
    value,
    value.coordinate,
    value.coordinates,
    value.coords,
    value.location,
    value.gps,
    value.geo,
    value.mapData,
    value.pin,
    value.linkedPin,
  ].filter(Boolean);

  for (const source of candidates) {
    const latitude =
      source.latitude ??
      source.lat ??
      source.locationLatitude ??
      source.locationLat ??
      source.gpsLatitude ??
      source.coordinate?.latitude ??
      source.coordinate?.lat ??
      source.coordinates?.latitude ??
      source.coordinates?.lat ??
      source.location?.latitude ??
      source.location?.lat ??
      source.gps?.latitude ??
      source.gps?.lat ??
      source.geo?.latitude ??
      source.geo?.lat;

    const longitude =
      source.longitude ??
      source.lng ??
      source.lon ??
      source.locationLongitude ??
      source.locationLng ??
      source.locationLon ??
      source.gpsLongitude ??
      source.coordinate?.longitude ??
      source.coordinate?.lng ??
      source.coordinate?.lon ??
      source.coordinates?.longitude ??
      source.coordinates?.lng ??
      source.coordinates?.lon ??
      source.location?.longitude ??
      source.location?.lng ??
      source.location?.lon ??
      source.gps?.longitude ??
      source.gps?.lng ??
      source.gps?.lon ??
      source.geo?.longitude ??
      source.geo?.lng ??
      source.geo?.lon;

    const latNum = cleanHistoryShareNumber(latitude);
    const lngNum = cleanHistoryShareNumber(longitude);

    if (latNum !== null && lngNum !== null) {
      return {
        latitude: latNum,
        longitude: lngNum,
      };
    }
  }

  return null;
}

function withHistoryShareCoordinateFields(source = {}, coordinate) {
  if (!coordinate) return source;

  return {
    ...source,
    coordinate,
    coordinates: coordinate,
    coords: coordinate,
    location: source.location || coordinate,
    latitude: coordinate.latitude,
    longitude: coordinate.longitude,
    locationLatitude: coordinate.latitude,
    locationLongitude: coordinate.longitude,
  };
}

function normalizeLinkedPinForHistoryShare(pin, fallbackLog) {
  if (!pin) return null;

  const coordinate = getHistoryShareCoordinate(pin) || getHistoryShareCoordinate(fallbackLog);

  if (!coordinate) {
    return {
      ...pin,
      title: pin.title || pin.name || fallbackLog?.pinTitle || "Shared Hunt Spot",
      type: pin.type || pin.pinType || "Spot",
      notes: pin.notes || "",
    };
  }

  return withHistoryShareCoordinateFields(
    {
      ...pin,
      title: pin.title || pin.name || fallbackLog?.pinTitle || "Shared Hunt Spot",
      name: pin.name || pin.title || fallbackLog?.pinTitle || "Shared Hunt Spot",
      type: pin.type || pin.pinType || "Spot",
      pinType: pin.pinType || pin.type || "Spot",
      notes: pin.notes || "",
      description: pin.description || pin.notes || "",
      photos: Array.isArray(pin.photos) ? pin.photos : [],
      images: Array.isArray(pin.images) ? pin.images : Array.isArray(pin.photos) ? pin.photos : [],
    },
    coordinate
  );
}

function normalizeHuntLogForHistoryShare(log, linkedPin) {
  const coordinate = getHistoryShareCoordinate(log) || getHistoryShareCoordinate(linkedPin);

  if (!coordinate) {
    return {
      ...log,
      linkedPin: linkedPin || null,
    };
  }

  return withHistoryShareCoordinateFields(
    {
      ...log,
      linkedPin: linkedPin || null,
    },
    coordinate
  );
}
function getPinTimestamp(pin) {
  const raw =
    pin?.archivedAt ||
    pin?.updatedAt ||
    pin?.createdAt ||
    pin?.originalCreatedAt ||
    Date.now();

  const date = typeof raw === "number" ? new Date(raw) : new Date(raw);
  return Number.isNaN(date.getTime()) ? Date.now() : date.getTime();
}

function isArchivedPinForLastSeason(pin, seasonState) {
  if (!pin?.archivedAt || !seasonState.lastSeasonStart || !seasonState.lastSeasonClosedAt) {
    return false;
  }

  const archivedAt = Number(pin.archivedAt);
  return (
    archivedAt >= Number(seasonState.lastSeasonStart) &&
    archivedAt <= Number(seasonState.lastSeasonClosedAt)
  );
}

function getArchivedPinCoordinate(pin) {
  return (
    pin?.coordinate ||
    pin?.coordinates ||
    pin?.coords ||
    pin?.location ||
    null
  );
}

function archivedPinToHistoryItem(pin) {
  const coordinate = getArchivedPinCoordinate(pin);

  return {
    id: `archived-pin-${pin.id}`,
    itemKind: "archivedPin",
    pinId: pin.id,
    title: pin.title || pin.name || "Archived Pin",
    pinTitle: pin.title || pin.name || "Archived Pin",
    environment: "Archived Map Pin",
    notes: pin.notes || "",
    dateTime: new Date(getPinTimestamp(pin)).toISOString(),
    createdAt: getPinTimestamp(pin),
    location: coordinate,
    type: pin.type || "Spot",
    pinType: pin.type || "Spot",
    archivedPin: pin,
    ducksHarvested: 0,
    crippledBirds: 0,
    hunters: 1,
    huntScore: 0,
    photos: Array.isArray(pin.photos) ? pin.photos : [],
  };
} 
export default function HistoryScreen({ logs, pins = [], setPins, deleteLog, updateLog, onLogout }) {
  const { isPro } = usePremium();
  const navigation = useNavigation();

  const [query, setQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [filterMode, setFilterMode] = useState("currentSeason");
  const [viewAll, setViewAll] = useState(false);

  const [selectedId, setSelectedId] = useState(null);
  const selected = useMemo(() => {
  const logMatch = logs.find((l) => l.id === selectedId);
  if (logMatch) return logMatch;

  const archivedPinMatch = pins
    .filter((pin) => pin?.archivedAt)
    .map(archivedPinToHistoryItem)
    .find((item) => item.id === selectedId);

  return archivedPinMatch || null;
}, [logs, pins, selectedId]);

  const [viewerPhotos, setViewerPhotos] = useState(null);
  const [viewerIndex, setViewerIndex] = useState(0);

  const [editVisible, setEditVisible] = useState(false);
  const [editEnvironment, setEditEnvironment] = useState("Marsh");
  const [editSpread, setEditSpread] = useState("j_hook");
  const [editSpreadOtherText, setEditSpreadOtherText] = useState("");
  const [editDucksHarvested, setEditDucksHarvested] = useState("0");
  const [editCrippledBirds, setEditCrippledBirds] = useState("0");
  const [editHunters, setEditHunters] = useState("1");
  const [editNotes, setEditNotes] = useState("");
  const [sharingLog, setSharingLog] = useState(false);
  const [editPhotos, setEditPhotos] = useState([]);
  const [seasonState, setSeasonState] = useState(createDefaultSeasonState());
  const [seasonReady, setSeasonReady] = useState(false);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const raw = await AsyncStorage.getItem(HISTORY_SEASON_STATE_KEY);
        const parsed = raw ? JSON.parse(raw) : null;

        if (mounted) {
          setSeasonState(normalizeSeasonState(parsed));
        }
      } catch {
        if (mounted) {
          setSeasonState(createDefaultSeasonState());
        }
      } finally {
        if (mounted) {
          setSeasonReady(true);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  async function saveSeasonState(nextState) {
    const normalized = normalizeSeasonState(nextState);
    setSeasonState(normalized);

    try {
      await AsyncStorage.setItem(HISTORY_SEASON_STATE_KEY, JSON.stringify(normalized));
    } catch {
      Alert.alert("Season Error", "Could not save the season change. Please try again.");
    }
  }

const filtered = useMemo(() => {
  const q = (query || "").toLowerCase().trim();

  const filteredLogs = logs
    .filter((log) => {
      if (filterMode === "currentSeason") return isCurrentSeasonLog(log, seasonState);
      if (filterMode === "lastSeason") return isLastSeasonLog(log, seasonState);
      return true;
    });

  const archivedPinItems = pins
    .filter((pin) => {
      if (!pin?.archivedAt) return false;
      if (filterMode === "currentSeason") return false;
      if (filterMode === "lastSeason") return isArchivedPinForLastSeason(pin, seasonState);
      return true;
    })
    .map(archivedPinToHistoryItem);

  return [...filteredLogs, ...archivedPinItems]
    .filter((item) => {
      if (!q) return true;

      const hay = [
        item.environment,
        item.spread,
        item.spreadOtherText,
        item.notes,
        item.pinTitle,
        item.title,
        item.type,
        item.pinType,
        formatDateTime(item),
        getDisplayLocation(item),
      ]
        .join(" | ")
        .toLowerCase();

      return hay.includes(q);
    })
    .sort((a, b) => getLogTimestamp(b) - getLogTimestamp(a));
}, [logs, pins, query, filterMode, seasonState]);

  const visibleLogs = useMemo(() => {
    if (viewAll || query.trim()) return filtered;
    return filtered.slice(0, 4);
  }, [filtered, viewAll, query]);

  const analyticsBase = useMemo(
    () =>
      cleanAnalyticsParams({
        is_pro: isPro ? 1 : 0,
        total_logs: logs.length,
        filtered_logs: filtered.length,
        visible_logs: visibleLogs.length,
        filter_mode: filterMode,
        search_open: showSearch ? 1 : 0,
        has_query: query.trim() ? 1 : 0,
        query_length: query.trim().length,
        view_all: viewAll ? 1 : 0,
      }),
    [isPro, logs.length, filtered.length, visibleLogs.length, filterMode, showSearch, query, viewAll]
  );

  React.useEffect(() => {
    void logAnalyticsScreen("HistoryScreen", {
      is_pro: isPro ? 1 : 0,
      total_logs: logs.length,
    });
  }, [isPro, logs.length]);

  React.useEffect(() => {
    if (selected) {
      void logAnalyticsScreen("HistoryDetailScreen", getLogAnalyticsParams(selected, analyticsBase));
    }
  }, [selected, analyticsBase]);

  React.useEffect(() => {
    if (!selected && filtered.length === 0) {
      void logAnalyticsEvent("history_empty_state", analyticsBase);
    }
  }, [selected, filtered.length, analyticsBase]);

  function openPhotoViewer(photos, index) {
    void logAnalyticsEvent("history_photo_open", {
      ...analyticsBase,
      photo_count: Array.isArray(photos) ? photos.length : 0,
      photo_index: index + 1,
      selected_log: selected ? 1 : 0,
      ...(selected ? getLogAnalyticsParams(selected) : {}),
    });

    setViewerPhotos(photos);
    setViewerIndex(index);
  }

  function closePhotoViewer() {
    void logAnalyticsEvent("history_photo_close", {
      ...analyticsBase,
      photo_count: Array.isArray(viewerPhotos) ? viewerPhotos.length : 0,
      photo_index: viewerIndex + 1,
      selected_log: selected ? 1 : 0,
      ...(selected ? getLogAnalyticsParams(selected) : {}),
    });

    setViewerPhotos(null);
    setViewerIndex(0);
  }

  function changePhotoIndex(index) {
    void logAnalyticsEvent("history_photo_nav", {
      ...analyticsBase,
      photo_count: Array.isArray(viewerPhotos) ? viewerPhotos.length : 0,
      photo_index: index + 1,
      selected_log: selected ? 1 : 0,
      ...(selected ? getLogAnalyticsParams(selected) : {}),
    });

    setViewerIndex(index);
  }

  function openEditModal() {
    if (!selected) return;

    void logAnalyticsEvent("history_edit_open", {
      ...analyticsBase,
      ...getLogAnalyticsParams(selected),
    });

    setEditEnvironment(selected.environment || "Marsh");
    setEditSpread(selected.spread || "j_hook");
    setEditSpreadOtherText(selected.spreadOtherText || "");
    setEditDucksHarvested(String(selected.ducksHarvested ?? 0));
    setEditCrippledBirds(String(selected.crippledBirds ?? 0));
    setEditHunters(String(selected.hunters || 1));
    setEditNotes(selected.notes || "");
    setEditPhotos(Array.isArray(selected.photos) ? selected.photos : []);
    setEditVisible(true);
  }

  function closeEditModal() {
    void logAnalyticsEvent("history_edit_cancel", {
      ...analyticsBase,
      ...(selected ? getLogAnalyticsParams(selected) : {}),
    });

    setEditVisible(false);
  }

  async function addEditPhoto(useCamera) {
    if (!selected) return;

    try {
      let result;

      if (useCamera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();

        if (!perm.granted) {
          Alert.alert("Permission Needed", "Camera access is required to add a hunt photo.");
          return;
        }

        result = await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.8,
          allowsEditing: true,
        });
      } else {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();

        if (!perm.granted) {
          Alert.alert("Permission Needed", "Photo library access is required to add a hunt photo.");
          return;
        }

        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.8,
          allowsEditing: true,
        });
      }

      if (result.canceled || !result.assets?.length) return;

      const nextPhoto = {
        uri: result.assets[0].uri,
        addedAt: Date.now(),
      };

      setEditPhotos((prev) => [...prev, nextPhoto]);

      void logAnalyticsEvent("history_edit_photo_added", {
        ...analyticsBase,
        ...(selected ? getLogAnalyticsParams(selected) : {}),
        source: useCamera ? "camera" : "gallery",
      });
    } catch (err) {
      Alert.alert("Photo Error", err.message || "Could not add the photo. Please try again.");
    }
  }

  function promptAddEditPhoto() {
    Alert.alert("Add Hunt Photo", "Take a photo or choose one from your gallery.", [
      { text: "Camera", onPress: () => addEditPhoto(true) },
      { text: "Gallery", onPress: () => addEditPhoto(false) },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  function removeEditPhoto(index) {
    setEditPhotos((prev) => prev.filter((_, i) => i !== index));

    void logAnalyticsEvent("history_edit_photo_removed", {
      ...analyticsBase,
      ...(selected ? getLogAnalyticsParams(selected) : {}),
      photo_index: index + 1,
    });
  }

  function saveEditedLog() {
    if (!selected || !updateLog) return;

    if (editSpread === "other" && !editSpreadOtherText.trim()) {
      void logAnalyticsEvent("history_edit_validation", {
        ...analyticsBase,
        ...getLogAnalyticsParams(selected),
        error: "missing_other_spread",
      });

      Alert.alert("Describe the spread", "Please add a short description for the Other spread.");
      return;
    }

    const safeHarvest = Math.max(0, Math.min(50, Math.round(Number(editDucksHarvested) || 0)));
    const safeCrippled = Math.max(0, Math.min(50, Math.round(Number(editCrippledBirds) || 0)));
    const safeHunters = Math.max(1, Math.min(20, Math.round(Number(editHunters) || 1)));
    const safeNotes = (editNotes || "").trim().slice(0, 5000);
    const safeSpreadOtherText = (editSpreadOtherText || "").trim().slice(0, 200);
    const selectedSpread = SPREADS.find((sp) => sp.key === editSpread);

    void logAnalyticsEvent("history_edit_save", {
      ...analyticsBase,
      ...getLogAnalyticsParams(selected),
      new_environment: editEnvironment,
      new_spread: editSpread,
      new_ducks_harvested: safeHarvest,
      new_crippled_birds: safeCrippled,
      new_hunters: safeHunters,
      has_new_notes: safeNotes ? 1 : 0,
      new_notes_length: safeNotes.length,
      has_other_spread_text: safeSpreadOtherText ? 1 : 0,
      photo_count_new: Array.isArray(editPhotos) ? editPhotos.length : 0,
    });

    updateLog(selected.id, {
      environment: editEnvironment,
      spread: editSpread,
      spreadOtherText: editSpread === "other" ? safeSpreadOtherText : "",
      spreadDetails: selectedSpread
        ? {
            name: selectedSpread.name,
            type: selectedSpread.type,
            decoyCount: selectedSpread.decoyCount,
            calling: selectedSpread.calling,
            bestTime: selectedSpread.bestTime,
            notes: selectedSpread.notes,
          }
        : null,
      ducksHarvested: safeHarvest,
      crippledBirds: safeCrippled,
      hunters: safeHunters,
      notes: safeNotes,
      photos: editPhotos,
      updatedAt: Date.now(),
    });

    setEditVisible(false);
    Alert.alert("Updated", "Your hunt log has been updated.");
  }

  async function shareLog(log) {
  if (!log || sharingLog) return;

  const linkedPin =
    log?.pinId && Array.isArray(pins)
      ? pins.find((pin) => pin.id === log.pinId)
      : null;

  const normalizedLinkedPin = normalizeLinkedPinForHistoryShare(linkedPin, log);
  const normalizedLog = normalizeHuntLogForHistoryShare(log, normalizedLinkedPin);

  void logAnalyticsEvent("history_share_options_opened", {
    ...analyticsBase,
    ...getLogAnalyticsParams(normalizedLog),
    has_linked_pin: normalizedLinkedPin ? 1 : 0,
  });

  Alert.alert(
    "Share Hunt Log",
    "How do you want to share this hunt log?",
    [
      {
        text: "Share within App",
        onPress: () => {
          void logAnalyticsEvent("history_share_within_app_selected", {
            ...analyticsBase,
            ...getLogAnalyticsParams(normalizedLog),
            has_linked_pin: normalizedLinkedPin ? 1 : 0,
          });

          navigation.navigate("ShareScreen", {
            shareType: "hunt_log",
            item: normalizedLog,
          });
        },
      },
      {
        text: "Share Other Ways",
        onPress: async () => {
          void logAnalyticsEvent("history_share_other_ways_start", {
            ...analyticsBase,
            ...getLogAnalyticsParams(normalizedLog),
            has_linked_pin: normalizedLinkedPin ? 1 : 0,
          });

          setSharingLog(true);

          try {
            const shareResult = await createSharedHuntLog(
              normalizedLog,
              normalizedLinkedPin
            );

            const firstHuntPhotoUri =
              Array.isArray(normalizedLog.photos) && normalizedLog.photos.length > 0
                ? getPhotoUri(normalizedLog.photos[0])
                : null;

            const spreadPhotoUri = getPhotoUri(normalizedLog.spreadPhoto);
            const shareImageUri =
              firstHuntPhotoUri || spreadPhotoUri || shareResult.imageUrl || undefined;

            const nativeShareResult = await Share.share({
              message: shareResult.message,
              url: shareImageUri,
            });

            void logAnalyticsEvent("history_share_other_ways_result", {
              ...analyticsBase,
              ...getLogAnalyticsParams(normalizedLog),
              action: nativeShareResult?.action || "unknown",
              activity_type: nativeShareResult?.activityType || "unknown",
              has_message: shareResult?.message ? 1 : 0,
            });
          } catch (err) {
            void logAnalyticsEvent("history_share_other_ways_error", {
              ...analyticsBase,
              ...getLogAnalyticsParams(normalizedLog),
              error_message: err?.message || "unknown",
            });

            console.error("DuckSmart share hunt log error:", err);
            Alert.alert(
              "Share Failed",
              err.message || "Could not create a share link for this hunt log. Please try again."
            );
          } finally {
            setSharingLog(false);
          }
        },
      },
      {
        text: "Cancel",
        style: "cancel",
        onPress: () => {
          void logAnalyticsEvent("history_share_options_cancelled", {
            ...analyticsBase,
            ...getLogAnalyticsParams(normalizedLog),
          });
        },
      },
    ]
  );
}

  function confirmDelete(id) {
    const log = logs.find((l) => l.id === id);

    void logAnalyticsEvent("history_delete_prompt", {
      ...analyticsBase,
      ...(log ? getLogAnalyticsParams(log) : {}),
    });

    Alert.alert("Delete hunt log?", log ? formatDateTime(log) : "", [
      {
        text: "Cancel",
        style: "cancel",
        onPress: () => {
          void logAnalyticsEvent("history_delete_cancel", {
            ...analyticsBase,
            ...(log ? getLogAnalyticsParams(log) : {}),
          });
        },
      },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void logAnalyticsEvent("history_delete_confirm", {
            ...analyticsBase,
            ...(log ? getLogAnalyticsParams(log) : {}),
          });

          deleteLog(id);
          if (selectedId === id) setSelectedId(null);
        },
      },
    ]);
  }

  function handleBackOrLogout() {
    if (selected) {
      void logAnalyticsEvent("history_back_to_list", {
        ...analyticsBase,
        ...getLogAnalyticsParams(selected),
      });

      setSelectedId(null);
      return;
    }

    void logAnalyticsEvent("history_logout_tap", analyticsBase);
    onLogout?.();
  }

  function handleToggleSearch() {
    const nextValue = !showSearch;

    void logAnalyticsEvent("history_search_toggle", {
      ...analyticsBase,
      search_open_next: nextValue ? 1 : 0,
    });

    setShowSearch((prev) => !prev);
  }

  function handleSearchChange(text) {
    void logAnalyticsEvent("history_search_change", {
      ...analyticsBase,
      has_query_next: text.trim() ? 1 : 0,
      query_length_next: text.trim().length,
    });

    setQuery(text);
  }

  function handleClearSearch() {
    void logAnalyticsEvent("history_search_clear", analyticsBase);
    setQuery("");
  }

  function handleFilterSelect(key) {
    void logAnalyticsEvent("history_filter_select", {
      ...analyticsBase,
      filter_mode_next: key,
    });

    setFilterMode(key);
    setViewAll(false);
  }

  function handleOpenLog(log, index) {
    void logAnalyticsEvent("history_log_open", {
      ...analyticsBase,
      row_index: index + 1,
      ...getLogAnalyticsParams(log),
    });

    setSelectedId(log.id);
  }

  function handleViewAllToggle() {
    const nextValue = !viewAll;

    void logAnalyticsEvent("history_view_all_toggle", {
      ...analyticsBase,
      view_all_next: nextValue ? 1 : 0,
    });

    setViewAll((prev) => !prev);
  }

  function closeCurrentSeason() {
    const currentSeasonLogs = logs.filter((log) => isCurrentSeasonLog(log, seasonState));

    if (currentSeasonLogs.length === 0) {
      Alert.alert(
        "No Current Season Data",
        "There are no hunt logs in Current Season yet, so there is nothing to close."
      );
      return;
    }

    Alert.alert(
      "Close Current Season?",
      "Once the season is closed, Current Season will reset and the results from this season will move into Last Season. You can undo the most recent close from the Last Season tab.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Close Season",
          style: "destructive",
          onPress: async () => {
            const closedAt = Date.now();

            const nextState = {
              currentSeasonStart: closedAt,
              lastSeasonStart: seasonState.currentSeasonStart,
              lastSeasonClosedAt: closedAt,
              undo: {
                currentSeasonStart: seasonState.currentSeasonStart,
                lastSeasonStart: seasonState.lastSeasonStart,
                lastSeasonClosedAt: seasonState.lastSeasonClosedAt,
              },
            };

void logAnalyticsEvent("history_close_season", {
  ...analyticsBase,
  current_season_logs: currentSeasonLogs.length,
});

const currentSeasonPinIds = new Set(
  currentSeasonLogs
    .map((log) => log.pinId)
    .filter(Boolean)
);

if (typeof setPins === "function" && currentSeasonPinIds.size > 0) {
  setPins((prevPins) =>
    prevPins.map((pin) =>
      currentSeasonPinIds.has(pin.id)
        ? {
            ...pin,
            archivedAt: closedAt,
            archivedSeason: "lastSeason",
            archivedSeasonStart: seasonState.currentSeasonStart,
            archivedSeasonClosedAt: closedAt,
          }
        : pin
    )
  );
}

await saveSeasonState(nextState);
            setFilterMode("lastSeason");
            setViewAll(true);
          },
        },
      ]
    );
  }

  function undoCloseSeason() {
    if (!seasonState.undo) {
      Alert.alert("Nothing To Undo", "There is no recent season close to undo.");
      return;
    }

    Alert.alert(
      "Undo Close Season?",
      "This will restore the most recent closed season back into Current Season.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Undo",
          onPress: async () => {
            const restoredState = normalizeSeasonState({
              ...seasonState.undo,
              undo: null,
            });

void logAnalyticsEvent("history_undo_close_season", analyticsBase);

if (typeof setPins === "function") {
  setPins((prevPins) =>
    prevPins.map((pin) => {
      if (
        pin?.archivedSeason === "lastSeason" &&
        Number(pin.archivedSeasonClosedAt) === Number(seasonState.lastSeasonClosedAt)
      ) {
        const {
          archivedAt,
          archivedSeason,
          archivedSeasonStart,
          archivedSeasonClosedAt,
          ...rest
        } = pin;

        return rest;
      }

      return pin;
    })
  );
}

await saveSeasonState(restoredState);
            setFilterMode("currentSeason");
            setViewAll(false);
          },
        },
      ]
    );
  }

  const hasSelectedLocation =
    selected?.location?.latitude != null && selected?.location?.longitude != null;

  return (
    <ScreenBackground style={styles.safe} bg={ASSETS.backgrounds.history}>
      <View pointerEvents="none" style={local.darkOverlay} />

      <SafeAreaView edges={["top", "left", "right"]} style={{ flex: 1 }}>
        <StatusBar barStyle="light-content" />

        <PhotoViewerModal
          photos={viewerPhotos}
          index={viewerIndex}
          onClose={closePhotoViewer}
          onChangeIndex={changePhotoIndex}
        />

        <Modal visible={editVisible} transparent animationType="slide" onRequestClose={closeEditModal}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
            <View style={local.editBackdrop}>
              <View style={local.editPanel}>
                <ScrollView contentContainerStyle={local.editContent} showsVerticalScrollIndicator={false}>
                  <View style={local.editHeader}>
                    <Text style={local.editTitle}>EDIT HUNT LOG</Text>

                    <Pressable style={local.editCloseBtn} onPress={closeEditModal}>
                      <Text style={local.editCloseText}>✕</Text>
                    </Pressable>
                  </View>

                  <Text style={local.editLabel}>Environment</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={local.chipRow}>
                      {ENVIRONMENTS.map((env) => (
                        <Chip
                          key={env}
                          label={env}
                          selected={env === editEnvironment}
                          onPress={() => {
                            void logAnalyticsEvent("history_edit_env", {
                              ...analyticsBase,
                              ...(selected ? getLogAnalyticsParams(selected) : {}),
                              environment_next: env,
                            });

                            setEditEnvironment(env);
                          }}
                        />
                      ))}
                    </View>
                  </ScrollView>

                  <Text style={local.editLabel}>Spread</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={local.chipRow}>
                      {SPREADS.filter((sp) => !sp.isAddon).map((sp) => (
                        <Chip
                          key={sp.key}
                          label={sp.name}
                          selected={sp.key === editSpread}
                          onPress={() => {
                            void logAnalyticsEvent("history_edit_spread", {
                              ...analyticsBase,
                              ...(selected ? getLogAnalyticsParams(selected) : {}),
                              spread_next: sp.key,
                            });

                            setEditSpread(sp.key);
                          }}
                        />
                      ))}
                      <Chip
                        label="None"
                        selected={editSpread === "none"}
                        onPress={() => {
                          void logAnalyticsEvent("history_edit_spread", {
                            ...analyticsBase,
                            ...(selected ? getLogAnalyticsParams(selected) : {}),
                            spread_next: "none",
                          });

                          setEditSpread("none");
                        }}
                      />
                      <Chip
                        label="Other"
                        selected={editSpread === "other"}
                        onPress={() => {
                          void logAnalyticsEvent("history_edit_spread", {
                            ...analyticsBase,
                            ...(selected ? getLogAnalyticsParams(selected) : {}),
                            spread_next: "other",
                          });

                          setEditSpread("other");
                        }}
                      />
                    </View>
                  </ScrollView>

                  {editSpread === "other" ? (
                    <>
                      <Text style={local.editLabel}>Other Spread</Text>
                      <TextInput
                        value={editSpreadOtherText}
                        onChangeText={setEditSpreadOtherText}
                        placeholder="Describe custom spread..."
                        placeholderTextColor="rgba(255,255,255,0.34)"
                        style={[local.editInput, local.editTallInput]}
                        multiline
                      />
                    </>
                  ) : null}

                  <View style={local.editGrid}>
                    <View style={local.editGridItem}>
                      <Text style={local.editLabel}>Ducks Harvested</Text>
                      <TextInput
                        value={editDucksHarvested}
                        onChangeText={setEditDucksHarvested}
                        keyboardType="number-pad"
                        placeholder="0"
                        placeholderTextColor="rgba(255,255,255,0.34)"
                        style={local.editInput}
                      />
                    </View>

                    <View style={local.editGridItem}>
                      <Text style={local.editLabel}>Crippled Birds</Text>
                      <TextInput
                        value={editCrippledBirds}
                        onChangeText={setEditCrippledBirds}
                        keyboardType="number-pad"
                        placeholder="0"
                        placeholderTextColor="rgba(255,255,255,0.34)"
                        style={local.editInput}
                      />
                    </View>
                  </View>

                  <Text style={local.editLabel}>Hunters</Text>
                  <TextInput
                    value={editHunters}
                    onChangeText={setEditHunters}
                    keyboardType="number-pad"
                    placeholder="1"
                    placeholderTextColor="rgba(255,255,255,0.34)"
                    style={local.editInput}
                  />

                  <Text style={local.editLabel}>Notes</Text>
                  <TextInput
                    value={editNotes}
                    onChangeText={setEditNotes}
                    placeholder="Update notes..."
                    placeholderTextColor="rgba(255,255,255,0.34)"
                    style={[local.editInput, local.editNotesInput]}
                    multiline
                  />

                  <Text style={local.editLabel}>Photos</Text>
                  {editPhotos.length > 0 ? (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      <View style={local.editPhotoRow}>
                        {editPhotos.map((photo, index) => {
                          const source = getImageSourceFromPhoto(photo);

                          return (
                            <View key={`${getPhotoUri(photo)}-${index}`} style={local.editPhotoCard}>
                              {source ? (
                                <Image source={source} style={local.editPhotoImage} resizeMode="cover" />
                              ) : null}

                              <Pressable
                                style={local.editPhotoRemoveBtn}
                                onPress={() => removeEditPhoto(index)}
                              >
                                <Text style={local.editPhotoRemoveText}>×</Text>
                              </Pressable>
                            </View>
                          );
                        })}
                      </View>
                    </ScrollView>
                  ) : (
                    <Text style={local.editPhotoEmpty}>No photos attached yet.</Text>
                  )}

                  <Pressable style={local.addPhotoBtn} onPress={promptAddEditPhoto}>
                    <Text style={local.addPhotoBtnText}>Add Photo</Text>
                  </Pressable>

                  <View style={local.editBtnRow}>
                    <Pressable style={local.secondaryBtn} onPress={closeEditModal}>
                      <Text style={local.secondaryBtnText}>Cancel</Text>
                    </Pressable>

                    <Pressable style={local.primaryBtn} onPress={saveEditedLog}>
                      <Text style={local.primaryBtnText}>Save Changes</Text>
                    </Pressable>
                  </View>
                </ScrollView>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={local.container} showsVerticalScrollIndicator={false}>
            <View style={local.appBar}>
              <Pressable
                style={local.appIconBtn}
                onPress={handleBackOrLogout}
                accessibilityRole="button"
              >
                <Text style={local.appIconText}>{selected ? "‹" : "☰"}</Text>
              </Pressable>

              <Text style={local.appTitle}>{selected ? "HUNT DETAILS" : "HUNT HISTORY"}</Text>

              <Pressable
                style={local.appIconBtn}
                onPress={() => (selected ? shareLog(selected) : handleToggleSearch())}
                accessibilityRole="button"
              >
                <Text style={local.filterIcon}>{selected ? "↗" : "⌯"}</Text>
              </Pressable>
            </View>

            {!selected ? (
              <>
                <View style={local.tabsWrap}>
                  {FILTERS.map((tab) => {
                    const selectedTab = filterMode === tab.key;

                    return (
                      <Pressable
                        key={tab.key}
                        style={[local.tabBtn, selectedTab ? local.tabBtnSelected : null]}
                        onPress={() => handleFilterSelect(tab.key)}
                      >
                        <Text style={[local.tabText, selectedTab ? local.tabTextSelected : null]}>
                          {tab.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {showSearch ? (
                  <View style={local.searchBox}>
                    <TextInput
                      value={query}
                      onChangeText={handleSearchChange}
                      placeholder="Search notes, environment, spread, date..."
                      placeholderTextColor="rgba(255,255,255,0.36)"
                      style={local.searchInput}
                    />

                    {query ? (
                      <Pressable onPress={handleClearSearch} style={local.clearSearchBtn}>
                        <Text style={local.clearSearchText}>×</Text>
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}

                {!isPro ? (
                  <View style={local.proNotice}>
                    <Text style={local.proTitle}>DuckSmart Pro</Text>
                    <Text style={local.proText}>
                      Free accounts can save up to 5 hunt logs. Upgrade for unlimited hunt history, cloud backup, and sharing.
                    </Text>
                  </View>
                ) : null}

                <SummaryBlock logs={filtered} />

                <KillsChart logs={filtered} />

                <View style={local.recentHeader}>
                  <Text style={local.sectionTitle}>RECENT HUNTS</Text>
                  <Text style={local.recentMeta}>{filtered.length} total</Text>
                </View>

                {visibleLogs.length === 0 ? (
                  <View style={local.emptyCard}>
                    <Text style={local.emptyTitle}>No hunts found</Text>
                    <Text style={local.emptyText}>
                      {filterMode === "lastSeason" && !seasonState.lastSeasonClosedAt
                        ? "Last Season will stay empty until you close the current season."
                        : "Create a hunt in the Log tab, or clear your search/filter."}
                    </Text>
                  </View>
                ) : (
visibleLogs.map((log, index) => (
  <HuntRow
    key={log.id}
    log={log}
    index={index}
    onPress={() => handleOpenLog(log, index)}
    onDelete={log.itemKind === "archivedPin" ? null : () => confirmDelete(log.id)}
  />
))
                )}

                {filtered.length > 4 && !query.trim() ? (
                  <Pressable style={local.viewAllBtn} onPress={handleViewAllToggle}>
                    <Text style={local.viewAllIcon}>▥</Text>
                    <Text style={local.viewAllText}>{viewAll ? "SHOW LESS" : "VIEW ALL HUNTS"}</Text>
                    <Text style={local.viewAllChevron}>›</Text>
                  </Pressable>
                ) : null}

                <View style={local.seasonActionBox}>
                  {filterMode === "lastSeason" ? (
                    <>
                      <Text style={local.seasonActionTitle}>Last Season</Text>
                      <Text style={local.seasonActionText}>
                        {seasonState.lastSeasonClosedAt
                          ? `Closed ${formatSeasonDate(seasonState.lastSeasonClosedAt)}. These logs stay here unless you undo the most recent close.`
                          : "No season has been closed yet."}
                      </Text>

                      {seasonState.lastSeasonClosedAt && seasonState.undo ? (
                        <Pressable style={local.undoSeasonBtn} onPress={undoCloseSeason}>
                          <Text style={local.undoSeasonBtnText}>Undo Most Recent Close Season</Text>
                        </Pressable>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <Text style={local.seasonActionTitle}>Season Controls</Text>
                      <Text style={local.seasonActionText}>
                        Close Current Season when your season is over. Current Season resets and these results move to Last Season.
                      </Text>

                      <Pressable
                        style={[
                          local.closeSeasonBtn,
                          (!seasonReady || filtered.length === 0) ? local.closeSeasonBtnDisabled : null,
                        ]}
                        onPress={closeCurrentSeason}
                        disabled={!seasonReady || filtered.length === 0}
                      >
                        <Text style={local.closeSeasonBtnText}>Close Current Season</Text>
                      </Pressable>
                    </>
                  )}
                </View>
              </>
            ) : (
              <>
                <View style={local.detailHero}>
                  <Image
                    source={getLogThumbnailSource(selected, 0)}
                    style={local.detailHeroImage}
                    resizeMode="cover"
                  />
                  <View style={local.detailHeroOverlay} />

                  <View style={local.detailHeroContent}>
                    <Text style={local.detailDate}>{formatDateTime(selected)}</Text>
                    <Text style={local.detailTitle} numberOfLines={2}>
                      {getDisplayLocation(selected)}
                    </Text>
                    <Text style={local.detailSubtitle}>
                      {selected.environment || "Hunt"} • {selected.pinTitle ? "Pinned Spot" : "GPS Spot"}
                    </Text>
                  </View>
                </View>

                <View style={local.detailStatsGrid}>
                  <DetailStat label="Ducks" value={selected.ducksHarvested ?? 0} color={GREEN} />
                  <DetailStat label="Score" value={formatScoreSmall(selected.huntScore)} color={getScoreColor(selected.huntScore)} />
                  <DetailStat label="Hunters" value={selected.hunters || 1} />
                  <DetailStat label="Crippled" value={selected.crippledBirds ?? 0} color={(selected.crippledBirds ?? 0) > 0 ? RED : MUTED} />
                </View>

                {hasSelectedLocation ? (
                  <DetailCard title="GPS LOCATION">
                    <View style={local.miniMapWrap}>
                      <MapView
                        style={local.miniMap}
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

                      <View style={local.miniMapFooter}>
                        <Text style={local.miniMapText}>
                          {selected.location.latitude.toFixed(5)}, {selected.location.longitude.toFixed(5)}
                        </Text>
                        <Text style={local.miniMapMuted}>{formatShortDate(selected)}</Text>
                      </View>
                    </View>
                  </DetailCard>
                ) : null}

                {selected.pinTitle ? (
                  <DetailCard title="SPOT">
                    <Text style={local.goldText}>📍 {selected.pinTitle}</Text>
                  </DetailCard>
                ) : null}

                <DetailCard title="HUNT SCORE">
                  <HuntScoreGauge score={selected.huntScore || 0} />
                </DetailCard>

                <DetailCard title="NOTES">
                  <View style={local.noteBox}>
                    <Text style={selected.notes ? local.noteText : local.noteTextMuted}>
                      {selected.notes || "No notes for this hunt."}
                    </Text>
                  </View>
                </DetailCard>

                <DetailCard title="ENVIRONMENT">
                  <Chip label={selected.environment || "Unknown"} selected />
                </DetailCard>

                <DetailCard title="SPREAD LAYOUT USED">
                  {(() => {
                    const sp = SPREADS.find((s) => s.key === selected.spread);
                    const img = ASSETS.decoys?.[selected.spread];

                    return (
                      <View>
                        {img ? <Image source={img} style={local.spreadThumb} resizeMode="cover" /> : null}

                        {selected.spreadPhoto?.uri ? (
                          <Pressable
                            onPress={() => openPhotoViewer([selected.spreadPhoto], 0)}
                            style={{ marginTop: img ? 12 : 0 }}
                          >
                            <Text style={local.spreadPhotoLabel}>Saved Spread Photo</Text>
                            <Image
                              source={{ uri: selected.spreadPhoto.uri }}
                              style={local.spreadThumb}
                              resizeMode="cover"
                            />
                            <Text style={local.tapHint}>Tap to view full size</Text>
                          </Pressable>
                        ) : null}

                        <Text style={local.detailSpreadName}>
                          {sp?.name || selected.spreadDetails?.name || selected.spread || "Not listed"}
                        </Text>

                        {selected.spread === "other" && selected.spreadOtherText ? (
                          <Text style={local.detailLine}>
                            <Text style={local.detailLabel}>Other Spread:</Text> {selected.spreadOtherText}
                          </Text>
                        ) : null}
                      </View>
                    );
                  })()}
                </DetailCard>

                {selected.photos?.length ? (
                  <DetailCard title={`PHOTOS (${selected.photos.length})`}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      <View style={local.photoRow}>
                        {selected.photos.map((photo, index) => {
                          const source = getImageSourceFromPhoto(photo);

                          return (
                            <Pressable
                              key={`${getPhotoUri(photo)}-${index}`}
                              style={local.photoCard}
                              onPress={() => openPhotoViewer(selected.photos, index)}
                            >
                              {source ? <Image source={source} style={local.photo} /> : null}
                            </Pressable>
                          );
                        })}
                      </View>
                    </ScrollView>
                  </DetailCard>
                ) : null}

{selected.itemKind === "archivedPin" ? (
  <View style={local.detailBtnRow}>
    <Pressable style={local.primaryBtn} onPress={() => setSelectedId(null)}>
      <Text style={local.primaryBtnText}>Back to History</Text>
    </Pressable>
  </View>
) : (
  <View style={local.detailBtnRow}>
    <Pressable style={local.secondaryBtn} onPress={() => confirmDelete(selected.id)}>
      <Text style={local.secondaryBtnText}>Delete</Text>
    </Pressable>

    <Pressable style={local.secondaryBtn} onPress={openEditModal}>
      <Text style={local.secondaryBtnText}>Edit</Text>
    </Pressable>

    <Pressable
      style={[local.primaryBtn, sharingLog ? { opacity: 0.55 } : null]}
      onPress={() => shareLog(selected)}
      disabled={sharingLog}
    >
      <Text style={local.primaryBtnText}>{sharingLog ? "Sharing..." : "Share"}</Text>
    </Pressable>
  </View>
)}
              </>
            )}

            <View style={{ height: Platform.OS === "android" ? 0 : 24 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ScreenBackground>
  );
}

const viewerStyles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: COLORS.black,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  counter: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: "900",
  },
  closeBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: CARD,
    alignItems: "center",
    justifyContent: "center",
  },
  closeBtnText: {
    color: COLORS.white,
    fontSize: 18,
    fontWeight: "800",
  },
  imageWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  image: {
    width: SCREEN_WIDTH,
    height: "100%",
  },
  noPhotoText: {
    color: COLORS.white,
    fontWeight: "900",
  },
  arrowBtn: {
    position: "absolute",
    top: "50%",
    marginTop: -24,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(14,14,14,0.75)",
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: "center",
    justifyContent: "center",
  },
  arrowLeft: {
    left: 12,
  },
  arrowRight: {
    right: 12,
  },
  arrowText: {
    color: COLORS.white,
    fontSize: 28,
    fontWeight: "900",
    marginTop: -2,
  },
  bottomCloseBtn: {
    marginHorizontal: 16,
    marginBottom: 12,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: "rgba(217,168,76,0.14)",
    borderWidth: 1,
    borderColor: GOLD,
    alignItems: "center",
  },
  bottomCloseBtnText: {
    color: GOLD,
    fontWeight: "900",
    fontSize: 15,
  },
});

const local = StyleSheet.create({
  darkOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.72)",
  },

  container: {
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: Platform.OS === "android" ? 110 : 34,
  },

  appBar: {
    height: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  appIconBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  appIconText: {
    color: COLORS.white,
    fontSize: 25,
    fontWeight: "900",
  },
  appTitle: {
    flex: 1,
    textAlign: "center",
    color: COLORS.white,
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: 0.3,
  },
  filterIcon: {
    color: GOLD,
    fontSize: 24,
    fontWeight: "900",
  },

  tabsWrap: {
    flexDirection: "row",
    padding: 4,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.045)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
    marginBottom: 10,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  tabBtnSelected: {
    backgroundColor: "rgba(217,168,76,0.10)",
    borderWidth: 1,
    borderColor: GOLD,
  },
  tabText: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 12,
    fontWeight: "800",
  },
  tabTextSelected: {
    color: GOLD,
    fontWeight: "900",
  },

  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    borderRadius: 16,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 12,
  },
  searchInput: {
    flex: 1,
    height: 46,
    color: COLORS.white,
    fontWeight: "800",
    fontSize: 14,
  },
  clearSearchBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  clearSearchText: {
    color: MUTED,
    fontSize: 22,
    fontWeight: "900",
  },

  proNotice: {
    padding: 13,
    borderRadius: 16,
    backgroundColor: "rgba(217,168,76,0.08)",
    borderWidth: 1,
    borderColor: GOLD_BORDER,
    marginBottom: 10,
  },
  proTitle: {
    color: GOLD,
    fontWeight: "900",
    fontSize: 13,
  },
  proText: {
    color: MUTED,
    fontWeight: "700",
    fontSize: 12,
    marginTop: 5,
    lineHeight: 17,
  },

  summaryBlock: {
    marginBottom: 10,
  },
  sectionTitle: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 0.3,
  },
  statGrid: {
    flexDirection: "row",
    gap: 8,
    marginTop: 9,
  },
  statCard: {
    flex: 1,
    minHeight: 112,
    borderRadius: 15,
    backgroundColor: CARD_SOFT,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  statIcon: {
    color: GOLD,
    fontSize: 24,
    fontWeight: "900",
    marginBottom: 7,
  },
  statValue: {
    color: COLORS.white,
    fontSize: 28,
    fontWeight: "900",
    lineHeight: 31,
  },
  statLabel: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 9,
    fontWeight: "900",
    marginTop: 7,
    textAlign: "center",
  },

  chartCard: {
    padding: 12,
    borderRadius: 18,
    backgroundColor: "rgba(5,9,10,0.62)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
    marginBottom: 10,
  },
  chartHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  chartSort: {
    color: GOLD,
    fontSize: 12,
    fontWeight: "900",
  },

  recentHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
    marginTop: 2,
  },
  recentMeta: {
    color: MUTED_DARK,
    fontSize: 11,
    fontWeight: "800",
  },

  huntRow: {
    minHeight: 86,
    flexDirection: "row",
    alignItems: "center",
    padding: 9,
    borderRadius: 15,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.045)",
    marginBottom: 8,
  },
  huntThumb: {
    width: 76,
    height: 66,
    borderRadius: 11,
    backgroundColor: BG_DARK,
    marginRight: 10,
  },
  huntInfo: {
    flex: 1,
    minWidth: 0,
  },
  huntDate: {
    color: MUTED,
    fontSize: 11,
    fontWeight: "700",
  },
  huntTitle: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: "900",
    marginTop: 4,
  },
  huntSub: {
    color: "rgba(255,255,255,0.56)",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 3,
  },
  huntNumbers: {
    alignItems: "flex-end",
    minWidth: 48,
    marginLeft: 8,
  },
  huntKillCount: {
    fontSize: 13,
    fontWeight: "900",
  },
  huntScoreText: {
    fontSize: 13,
    fontWeight: "900",
    marginTop: 4,
  },
  rowDeleteBtn: {
    width: 26,
    height: 50,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 4,
  },
  rowDeleteText: {
    color: "rgba(255,255,255,0.28)",
    fontSize: 19,
    fontWeight: "900",
  },
  huntChevron: {
    color: "rgba(255,255,255,0.54)",
    fontSize: 25,
    fontWeight: "900",
    marginLeft: 2,
  },

  emptyCard: {
    padding: 18,
    borderRadius: 16,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 10,
  },
  emptyTitle: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: "900",
    textAlign: "center",
  },
  emptyText: {
    color: MUTED,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
    textAlign: "center",
    marginTop: 5,
  },

  viewAllBtn: {
    height: 54,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: GOLD,
    backgroundColor: "rgba(217,168,76,0.06)",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    marginTop: 2,
  },
  viewAllIcon: {
    color: GOLD,
    fontSize: 23,
    fontWeight: "900",
    marginRight: 12,
  },
  viewAllText: {
    flex: 1,
    color: GOLD,
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.3,
  },
  viewAllChevron: {
    color: GOLD,
    fontSize: 25,
    fontWeight: "900",
  },

  detailHero: {
    height: 178,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 10,
  },
  detailHeroImage: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
  },
  detailHeroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.50)",
  },
  detailHeroContent: {
    flex: 1,
    justifyContent: "flex-end",
    padding: 14,
  },
  detailDate: {
    color: GOLD,
    fontSize: 12,
    fontWeight: "900",
  },
  detailTitle: {
    color: COLORS.white,
    fontSize: 25,
    fontWeight: "900",
    marginTop: 4,
  },
  detailSubtitle: {
    color: MUTED,
    fontSize: 13,
    fontWeight: "800",
    marginTop: 4,
  },

  detailStatsGrid: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
  },
  detailStat: {
    flex: 1,
    minHeight: 76,
    borderRadius: 15,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: "center",
    justifyContent: "center",
  },
  detailStatValue: {
    color: COLORS.white,
    fontSize: 23,
    fontWeight: "900",
  },
  detailStatLabel: {
    color: MUTED_DARK,
    fontSize: 9,
    fontWeight: "900",
    marginTop: 4,
    textTransform: "uppercase",
  },

  detailCard: {
    padding: 13,
    borderRadius: 18,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 10,
  },
  detailCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  detailCardTitle: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 0.4,
  },
  detailCardBody: {
    marginTop: 10,
  },

  miniMapWrap: {
    borderRadius: 15,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: GOLD_BORDER,
    backgroundColor: BG_DARK,
  },
  miniMap: {
    height: 170,
    width: "100%",
  },
  miniMapFooter: {
    padding: 10,
    backgroundColor: "rgba(0,0,0,0.62)",
  },
  miniMapText: {
    color: COLORS.white,
    fontSize: 12,
    fontWeight: "900",
  },
  miniMapMuted: {
    color: MUTED_DARK,
    fontSize: 11,
    fontWeight: "700",
    marginTop: 3,
  },
  goldText: {
    color: GOLD,
    fontSize: 14,
    fontWeight: "900",
  },

  noteBox: {
    padding: 12,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  noteText: {
    color: "rgba(255,255,255,0.82)",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "700",
  },
  noteTextMuted: {
    color: MUTED_DARK,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "700",
  },

  spreadThumb: {
    width: "100%",
    height: 170,
    borderRadius: 15,
    backgroundColor: BG_DARK,
  },
  spreadPhotoLabel: {
    color: MUTED,
    fontSize: 12,
    fontWeight: "900",
    marginBottom: 8,
  },
  tapHint: {
    color: MUTED_DARK,
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center",
    marginTop: 6,
  },
  detailSpreadName: {
    color: COLORS.white,
    fontWeight: "900",
    fontSize: 14,
    marginTop: 10,
  },
  detailLine: {
    color: MUTED,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
    marginTop: 10,
  },
  detailLabel: {
    color: COLORS.white,
    fontWeight: "900",
  },

  photoRow: {
    flexDirection: "row",
    gap: 10,
    paddingRight: 8,
  },
  photoCard: {
    width: 104,
    height: 92,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: BG_DARK,
  },
  photo: {
    width: "100%",
    height: "100%",
  },

  detailBtnRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 2,
  },
  primaryBtn: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    backgroundColor: GOLD,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: {
    color: BG_DARK,
    fontSize: 13,
    fontWeight: "900",
  },
  secondaryBtn: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryBtnText: {
    color: COLORS.white,
    fontSize: 13,
    fontWeight: "900",
  },

  seasonActionBox: {
    marginTop: 12,
    padding: 13,
    borderRadius: 17,
    backgroundColor: "rgba(5,9,10,0.70)",
    borderWidth: 1,
    borderColor: GOLD_BORDER,
  },
  seasonActionTitle: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: "900",
  },
  seasonActionText: {
    color: MUTED,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
    marginTop: 6,
    marginBottom: 11,
  },
  closeSeasonBtn: {
    minHeight: 46,
    borderRadius: 14,
    backgroundColor: "rgba(217,168,76,0.12)",
    borderWidth: 1,
    borderColor: GOLD,
    alignItems: "center",
    justifyContent: "center",
  },
  closeSeasonBtnDisabled: {
    opacity: 0.45,
  },
  closeSeasonBtnText: {
    color: GOLD,
    fontSize: 13,
    fontWeight: "900",
  },
  undoSeasonBtn: {
    minHeight: 46,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: "center",
    justifyContent: "center",
  },
  undoSeasonBtnText: {
    color: COLORS.white,
    fontSize: 13,
    fontWeight: "900",
  },
  editPhotoRow: {
    flexDirection: "row",
    gap: 10,
    paddingRight: 8,
  },
  editPhotoCard: {
    width: 94,
    height: 84,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: BG_DARK,
    borderWidth: 1,
    borderColor: BORDER,
  },
  editPhotoImage: {
    width: "100%",
    height: "100%",
  },
  editPhotoRemoveBtn: {
    position: "absolute",
    top: 5,
    right: 5,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.72)",
    alignItems: "center",
    justifyContent: "center",
  },
  editPhotoRemoveText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: "900",
    marginTop: -1,
  },
  editPhotoEmpty: {
    color: MUTED_DARK,
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 8,
  },
  addPhotoBtn: {
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: GOLD_BORDER,
    backgroundColor: "rgba(217,168,76,0.08)",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
  },
  addPhotoBtnText: {
    color: GOLD,
    fontSize: 13,
    fontWeight: "900",
  },

  editBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.78)",
    justifyContent: "flex-end",
  },
  editPanel: {
    maxHeight: "92%",
    backgroundColor: "#0B0F10",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderColor: GOLD_BORDER,
  },
  editContent: {
    padding: 16,
    paddingBottom: 28,
  },
  editHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  editTitle: {
    color: COLORS.white,
    fontSize: 20,
    fontWeight: "900",
  },
  editCloseBtn: {
    width: 38,
    height: 38,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: CARD_SOFT,
    alignItems: "center",
    justifyContent: "center",
  },
  editCloseText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: "900",
  },
  chipRow: {
    flexDirection: "row",
    gap: 8,
    paddingRight: 8,
  },
  editLabel: {
    color: MUTED,
    fontSize: 12,
    fontWeight: "900",
    marginTop: 12,
    marginBottom: 8,
  },
  editGrid: {
    flexDirection: "row",
    gap: 10,
  },
  editGridItem: {
    flex: 1,
  },
  editInput: {
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "rgba(255,255,255,0.04)",
    color: COLORS.white,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontWeight: "800",
  },
  editTallInput: {
    height: 84,
    textAlignVertical: "top",
  },
  editNotesInput: {
    height: 110,
    textAlignVertical: "top",
  },
  editBtnRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },
});