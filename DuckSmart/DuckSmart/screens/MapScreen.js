// /Users/gozyr/Development/ducksmart/DuckSmart/DuckSmart/screens/MapScreen.js

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  TextInput,
  Alert,
  Platform,
  Image,
  Linking,
  Share,
  Keyboard,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  deleteWaypointPath,
  getFollowBackCoordinates,
  getWaypointSummary,
  loadWaypointPaths,
  startWaypointRecording,
  stopWaypointRecording,
  syncOfflineWaypointPaths,
} from "../services/waypoint_helper";
import {
  fetchWaterLevelsForRegion,
  getWaterLevelMarkerColor,
  getWaterLevelMarkerIcon,
  formatWaterLevelCallout,
} from "../services/waterLevels";
import MapView, { Callout, Circle as MapCircle, Geojson, Marker, Polyline, UrlTile } from "react-native-maps";
import * as Location from "expo-location";
import * as FileSystem from "expo-file-system";
import AsyncStorage from "@react-native-async-storage/async-storage";
import BottomSheet, { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { useNavigation } from "@react-navigation/native";

import { sharedStyles as styles } from "../constants/styles";
import { ASSETS } from "../constants/assets";
import { COLORS, PIN_TYPES } from "../constants/theme";
import RowHeader from "../components/RowHeader";
import ScreenBackground from "../components/ScreenBackground";
import PropertySearchBar from "../components/PropertySearchBar";
import { usePremium } from "../context/PremiumContext";
import { useAuth } from "../context/AuthContext";
import { logEvent, logPinCreated } from "../services/analytics";
import { GET_REGRID_TILE_URL, LOOKUP_REGRID_PARCEL_URL } from "../config";
import { getRadarTileUrl } from "../services/radar";
import { createSharedPin } from "../services/shareImport";
import { getPropertyFeatureRegion } from "../services/mapSearch";
import { fetchPublicPropertyGeojson } from "../services/public_property";

const FREE_PIN_LIMIT = 5;
const RADAR_REGION_DELTA = 3.0;
const PIN_STAT_RESETS_KEY = "@ducksmart_pin_stat_resets_v1";
const PIN_SEASON_ARCHIVES_KEY = "@ducksmart_pin_season_archives_v1";
const HISTORY_SEASON_STATE_KEY = "@ducksmart_history_season_state_v1";

const HUNT_BROWN = "#21150D";
const HUNT_BROWN_CARD = "#2B1C11";
const HUNT_BROWN_DEEP = "#160E09";
const HUNT_TAN = "#D9A84C";
const HUNT_TAN_SOFT = "rgba(217,168,76,0.14)";
const HUNT_BORDER = "rgba(217,168,76,0.28)";
const WHITE = COLORS.white || "#FFFFFF";
const GREEN = COLORS.green || "#2ECC71";
const MUTED = COLORS.muted || "rgba(255,255,255,0.65)";

const DEFAULT_REGION = {
  latitude: 33.994,
  longitude: -83.382,
  latitudeDelta: 0.06,
  longitudeDelta: 0.06,
};

const STATE_LINES_URL =
  "https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json";

const STATE_LINE_COLOR = "#FF7A00";

const REGRID_TILE_URL = GET_REGRID_TILE_URL
  ? `${GET_REGRID_TILE_URL}/{z}/{x}/{y}.png`
  : null;
const REGRID_POINT_LOOKUP_URL = LOOKUP_REGRID_PARCEL_URL;
const PARCEL_CACHE_DIR = `${FileSystem.cacheDirectory}regrid_tiles/`;
const RADAR_CACHE_DIR = `${FileSystem.cacheDirectory}radar_tiles/`;
const MAP_ENGAGEMENT_INTERVAL_MS = 12000;

const SNAP_COLLAPSED = 0;
const SNAP_PEEK = 1;
const SNAP_EXPANDED = 2;

function getDefaultSeasonStartTimestamp() {
  const now = new Date();
  const seasonStartYear = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  return new Date(seasonStartYear, 8, 1, 0, 0, 0, 0).getTime();
}

function createDefaultHistorySeasonState() {
  return {
    currentSeasonStart: getDefaultSeasonStartTimestamp(),
    lastSeasonStart: null,
    lastSeasonClosedAt: null,
    undo: null,
  };
}

function normalizeHistorySeasonState(value) {
  const fallback = createDefaultHistorySeasonState();

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
    undo: value.undo || null,
  };
}

function getParcelValue(feature, keys) {
  const props = feature?.properties || {};
  const fields = props.fields || {};
  const enhancedOwner =
    Array.isArray(props.enhanced_ownership) && props.enhanced_ownership.length > 0
      ? props.enhanced_ownership[0]
      : {};

  for (const key of keys) {
    const value = props[key] ?? fields[key] ?? enhancedOwner[key];

    if (value !== undefined && value !== null && `${value}`.trim() !== "") {
      return `${value}`.trim();
    }
  }

  return null;
}

function formatParcelInfo(feature, coordinate) {
  const props = feature?.properties || {};
  const fields = props.fields || {};

  const owner =
    getParcelValue(feature, [
      "owner",
      "owner_name",
      "ownername",
      "ownname",
      "mailname",
    ]) || "Not listed";

  const address =
    props.headline ||
    getParcelValue(feature, [
      "address",
      "situs_address",
      "situs_full_address",
      "saddr",
      "mailadd",
    ]) ||
    "Not listed";

  const parcelNumber =
    getParcelValue(feature, ["parcelnumb", "parcel_number", "apn", "pin"]) ||
    "Not listed";

  const acres = getParcelValue(feature, ["ll_gisacre", "gisacre", "acres"]);
  const path = props.path || fields.path || "Not listed";

  return [
    `Owner: ${owner}`,
    `Address: ${address}`,
    `Parcel #: ${parcelNumber}`,
    acres ? `Acres: ${acres}` : null,
    `Regrid Path: ${path}`,
    "",
    coordinate
      ? `Tapped: ${coordinate.latitude.toFixed(6)}, ${coordinate.longitude.toFixed(6)}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function getLogTimestamp(log) {
  if (typeof log?.createdAt === "number") return log.createdAt;

  if (log?.dateTime) {
    const parsed = new Date(log.dateTime).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function getLogYear(log) {
  const ts = getLogTimestamp(log);
  if (!ts) return null;
  return new Date(ts).getFullYear();
}

function summarizePinLogs(pinLogs) {
  const hunts = pinLogs.length;
  const totalDucks = pinLogs.reduce((sum, log) => sum + (log.ducksHarvested || 0), 0);
  const totalCrippled = pinLogs.reduce((sum, log) => sum + (log.crippledBirds || 0), 0);
  const totalHunters = pinLogs.reduce((sum, log) => sum + (log.hunters || 1), 0);
  const scores = pinLogs.map((log) => log.huntScore || 0);

  const avgScore =
    scores.length > 0
      ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length)
      : 0;

  const bestScore = scores.length > 0 ? Math.max(...scores) : 0;
  const avgPerHunter = totalHunters > 0 ? +(totalDucks / totalHunters).toFixed(1) : 0;

  return {
    hunts,
    totalDucks,
    totalCrippled,
    totalHunters,
    avgScore,
    bestScore,
    avgPerHunter,
  };
}

function normalizePinTypeName(type) {
  switch (type) {
    case "Roost":
      return "Pit";
    case "Feed":
      return "Blind";
    case "Flight Line":
      return "Ramp";
    case "Parking":
      return "Access";
    default:
      return type || "Spot";
  }
}

function formatResetDate(timestamp) {
  if (!timestamp) return "";
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatLogDate(log) {
  if (log?.dateTime) {
    return new Date(log.dateTime).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  if (log?.createdAt) {
    return new Date(log.createdAt).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  return "Hunt log";
}

function isScoutLogEntry(log) {
  return (
    log?.isScoutLog === true ||
    log?.logType === "scout" ||
    log?.logMode === "scout" ||
    log?.logCategory === "scout" ||
    log?.displayType === "scoutLog" ||
    log?.type === "scoutLog" ||
    log?.shareType === "scoutLog"
  );
}

function isHuntLogEntry(log) {
  return !isScoutLogEntry(log);
}

function getScoutLogSummary(log) {
  if (Array.isArray(log?.scoutSpecies) && log.scoutSpecies.length > 0) {
    return log.scoutSpecies
      .map((sp) => `${sp.count || 1} ${sp.name}`)
      .join(", ");
  }

  if (Array.isArray(log?.speciesSighted) && log.speciesSighted.length > 0) {
    return log.speciesSighted.join(", ");
  }

  if (Array.isArray(log?.ducksSighted) && log.ducksSighted.length > 0) {
    return log.ducksSighted
      .map((sp) => `${sp.count || 1} ${sp.name}`)
      .join(", ");
  }

  if (log?.scoutSummary) return log.scoutSummary;

  if (log?.notes) return log.notes;

  return "Scout report saved";
}

function getRegionAnalytics(region) {
  if (!region) {
    return {
      latitudeDelta: null,
      longitudeDelta: null,
      zoomBucket: "unknown",
    };
  }

  const latitudeDelta = Number(region.latitudeDelta || 0);
  const longitudeDelta = Number(region.longitudeDelta || 0);

  let zoomBucket = "wide";
  if (latitudeDelta <= 0.02) zoomBucket = "close";
  else if (latitudeDelta <= 0.08) zoomBucket = "local";
  else if (latitudeDelta <= 0.5) zoomBucket = "area";
  else if (latitudeDelta <= 2) zoomBucket = "regional";

  return {
    latitudeDelta: Number(latitudeDelta.toFixed(4)),
    longitudeDelta: Number(longitudeDelta.toFixed(4)),
    zoomBucket,
  };
}

function cleanCoordinateNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function getDistanceMiles(a, b) {
  if (!a || !b) return null;

  const lat1 = Number(a.latitude);
  const lon1 = Number(a.longitude);
  const lat2 = Number(b.latitude);
  const lon2 = Number(b.longitude);

  if (
    !Number.isFinite(lat1) ||
    !Number.isFinite(lon1) ||
    !Number.isFinite(lat2) ||
    !Number.isFinite(lon2)
  ) {
    return null;
  }

  const toRad = (value) => (value * Math.PI) / 180;
  const earthRadiusMiles = 3958.8;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const rLat1 = toRad(lat1);
  const rLat2 = toRad(lat2);

  const hav =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(rLat1) *
      Math.cos(rLat2) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(hav), Math.sqrt(1 - hav));

  return earthRadiusMiles * c;
}

function formatDistanceYards(miles) {
  if (!Number.isFinite(Number(miles))) return "";

  const yards = Math.round(Number(miles) * 1760);

  if (yards < 1) return "0 yd";
  if (yards === 1) return "1 yd";

  return `${yards.toLocaleString()} yds`;
}

const MEASURE_MARKER_PRESS_SUPPRESS_MS = 450;
const MEASURE_SAME_POINT_EPSILON = 0.00001;

function getCleanMeasureCoordinate(coordinate) {
  if (!coordinate) return null;

  const latitude = cleanCoordinateNumber(coordinate.latitude ?? coordinate.lat);
  const longitude = cleanCoordinateNumber(
    coordinate.longitude ?? coordinate.lng ?? coordinate.lon
  );

  if (latitude === null || longitude === null) return null;

  return { latitude, longitude };
}

function areSameMeasureCoordinate(a, b) {
  const first = getCleanMeasureCoordinate(a);
  const second = getCleanMeasureCoordinate(b);

  if (!first || !second) return false;

  return (
    Math.abs(first.latitude - second.latitude) <= MEASURE_SAME_POINT_EPSILON &&
    Math.abs(first.longitude - second.longitude) <= MEASURE_SAME_POINT_EPSILON
  );
}

function getPinCoordinate(pin) {
  if (!pin) return null;

  const sources = [
    pin.coordinate,
    pin.coordinates,
    pin.coords,
    pin.location,
    pin.mapData,
    pin,
  ].filter(Boolean);

  for (const source of sources) {
    const latitude =
      source.latitude ??
      source.lat ??
      source.locationLatitude ??
      source.coordinate?.latitude ??
      source.coordinate?.lat ??
      source.coordinates?.latitude ??
      source.coordinates?.lat;

    const longitude =
      source.longitude ??
      source.lng ??
      source.lon ??
      source.locationLongitude ??
      source.coordinate?.longitude ??
      source.coordinate?.lng ??
      source.coordinate?.lon ??
      source.coordinates?.longitude ??
      source.coordinates?.lng ??
      source.coordinates?.lon;

    const latNum = cleanCoordinateNumber(latitude);
    const lngNum = cleanCoordinateNumber(longitude);

    if (latNum !== null && lngNum !== null) {
      return {
        latitude: latNum,
        longitude: lngNum,
      };
    }
  }

  return null;
}

function normalizePin(pin) {
  const coordinate = getPinCoordinate(pin);

  if (!coordinate) return null;

  return {
  ...pin,
  type: normalizePinTypeName(pin.type),
  pinType: normalizePinTypeName(pin.pinType || pin.type),
  coordinate,
    coordinates: coordinate,
    coords: coordinate,
    location: coordinate,
    latitude: coordinate.latitude,
    longitude: coordinate.longitude,
    locationLatitude: coordinate.latitude,
    locationLongitude: coordinate.longitude,
  };
}

function normalizePinForShare(pin) {
  const coordinate = getPinCoordinate(pin);

  if (!coordinate) {
    return null;
  }

  const isPathPin = isWaypointPathPin(pin);
  const waypointPath = isPathPin ? getWaypointPathFromPin(pin) : null;
  const pathCoordinates = waypointPath?.coordinates || getWaypointPathCoordinatesFromPin(pin);
  const pathSummary = waypointPath ? getWaypointSummary(waypointPath) : null;

  return {
    ...pin,
    shareType: "pin",
    itemType: "shared_pin",

    itemKind: isPathPin ? "waypointPath" : pin.itemKind || "pin",
    type: isPathPin ? "Path" : pin.type || "Spot",
    pinType: isPathPin ? "Path" : pin.pinType || pin.type || "Spot",

    title:
      pin.title ||
      pin.name ||
      pathSummary?.title ||
      (isPathPin ? "Mapped Path" : "Shared Pin"),

    name:
      pin.name ||
      pin.title ||
      pathSummary?.title ||
      (isPathPin ? "Mapped Path" : "Shared Pin"),

    notes:
      pin.notes ||
      pin.description ||
      (pathSummary
        ? `${pathSummary.distanceText} • ${pathSummary.pointCount} points`
        : ""),

    description:
      pin.description ||
      pin.notes ||
      (pathSummary
        ? `${pathSummary.distanceText} • ${pathSummary.pointCount} points`
        : ""),

    coordinate,
    coordinates: coordinate,
    coords: coordinate,
    location: coordinate,
    latitude: coordinate.latitude,
    longitude: coordinate.longitude,
    locationLatitude: coordinate.latitude,
    locationLongitude: coordinate.longitude,

    waypointPathId:
      pin.waypointPathId ||
      waypointPath?.id ||
      pin.waypointPath?.id ||
      null,

    waypointPath: waypointPath
      ? {
          ...waypointPath,
          coordinates: pathCoordinates,
        }
      : pin.waypointPath || null,

    pathCoordinates: Array.isArray(pathCoordinates) ? pathCoordinates : [],
    pathPoints: Array.isArray(waypointPath?.points)
      ? waypointPath.points
      : Array.isArray(pin.pathPoints)
        ? pin.pathPoints
        : Array.isArray(pathCoordinates)
          ? pathCoordinates
          : [],

    distanceMiles:
      waypointPath?.distanceMiles ??
      pin.distanceMiles ??
      0,

    pointCount:
      waypointPath?.pointCount ??
      pin.pointCount ??
      (Array.isArray(pathCoordinates) ? pathCoordinates.length : 0),

    photos: Array.isArray(pin.photos) ? pin.photos : [],
    images: Array.isArray(pin.images)
      ? pin.images
      : Array.isArray(pin.photos)
        ? pin.photos
        : [],

    originalId: pin.id || null,
    originalCreatedAt: pin.createdAt || null,
    originalUpdatedAt: pin.updatedAt || null,
  };
}

function isWaypointPathPin(pin) {
  return (
    pin?.itemKind === "waypointPath" ||
    pin?.type === "Path" ||
    pin?.pinType === "Path" ||
    Array.isArray(pin?.pathCoordinates) ||
    Array.isArray(pin?.waypointPath?.coordinates)
  );
}

function getWaypointPathCoordinatesFromPin(pin) {
  const raw =
    Array.isArray(pin?.pathCoordinates)
      ? pin.pathCoordinates
      : Array.isArray(pin?.waypointPath?.coordinates)
        ? pin.waypointPath.coordinates
        : Array.isArray(pin?.waypointPath?.points)
          ? pin.waypointPath.points
          : Array.isArray(pin?.pathPoints)
            ? pin.pathPoints
            : [];

  return raw.map(getCleanMeasureCoordinate).filter(Boolean);
}

function getWaypointPathFromPin(pin) {
  if (!isWaypointPathPin(pin)) return null;

  const coordinates = getWaypointPathCoordinatesFromPin(pin);

  if (coordinates.length < 2) return null;

  return {
    ...(pin.waypointPath || {}),
    id: pin.waypointPathId || pin.waypointPath?.id || pin.id,
    pathId: pin.waypointPathId || pin.waypointPath?.id || pin.id,
    title: pin.title || pin.waypointPath?.title || "Mapped Path",
    points: Array.isArray(pin.pathPoints) ? pin.pathPoints : coordinates,
    coordinates,
    distanceMiles: Number.isFinite(Number(pin.distanceMiles))
      ? Number(pin.distanceMiles)
      : pin.waypointPath?.distanceMiles,
    pointCount: Number.isFinite(Number(pin.pointCount))
      ? Number(pin.pointCount)
      : coordinates.length,
    startedAt: pin.waypointPath?.startedAt || pin.createdAt || Date.now(),
    createdAt: pin.createdAt || pin.waypointPath?.createdAt || Date.now(),
    updatedAt: pin.updatedAt || Date.now(),
  };
}

function buildWaypointPathPin(path) {
  const coordinates = Array.isArray(path?.coordinates)
    ? path.coordinates.map(getCleanMeasureCoordinate).filter(Boolean)
    : Array.isArray(path?.points)
      ? path.points.map(getCleanMeasureCoordinate).filter(Boolean)
      : [];

  if (!path?.id || coordinates.length < 2) return null;

  const summary = getWaypointSummary(path);
  const start = coordinates[0];
  const title = summary?.title || path.title || "Mapped Path";

  return {
    id: `path-pin-${path.id}`,
    itemKind: "waypointPath",
    type: "Path",
    pinType: "Path",
    title,
    name: title,
    notes: `${summary.distanceText} • ${summary.pointCount} points`,
    description: `${summary.distanceText} • ${summary.pointCount} points`,

    coordinate: start,
    coordinates: start,
    coords: start,
    location: start,
    latitude: start.latitude,
    longitude: start.longitude,
    locationLatitude: start.latitude,
    locationLongitude: start.longitude,

    waypointPathId: path.id,
    waypointPath: {
      ...path,
      coordinates,
    },
    pathPoints: Array.isArray(path.points) ? path.points : coordinates,
    pathCoordinates: coordinates,

    distanceMiles: path.distanceMiles || 0,
    pointCount: summary.pointCount || coordinates.length,

    shareType: "pin",
    itemType: "shared_pin",
    icon: "👣",
    emoji: "👣",

    createdAt: path.createdAt || path.startedAt || Date.now(),
    updatedAt: Date.now(),
  };
}

function getPinKpi(pin, logs = []) {
  const pinLogs = logs.filter((log) => log.pinId === pin?.id);

  return {
    pinType: pin?.type || "unknown",
    hasTitle: pin?.title ? 1 : 0,
    hasNotes: pin?.notes ? 1 : 0,
    hasCoordinate: getPinCoordinate(pin) ? 1 : 0,
    linkedHunts: pinLogs.length,
  };
}

function getPropertyFeatureId(feature, index = 0) {
  return (
    feature?.id ||
    feature?.properties?.id ||
    feature?.properties?.parcelnumb ||
    feature?.properties?.parcel_number ||
    feature?.properties?.ducksmartParcelNumber ||
    `property-result-${index}`
  );
}

function getPropertyFeatureCoordinate(feature) {
  const props = feature?.properties || {};
  const fields = props.fields || {};
  const center = props.ducksmartCenter;

  const sources = [center, props, fields, feature].filter(Boolean);

  for (const source of sources) {
    const latitude =
      source.latitude ??
      source.lat ??
      source.locationLatitude ??
      source.centerLatitude;

    const longitude =
      source.longitude ??
      source.lng ??
      source.lon ??
      source.locationLongitude ??
      source.centerLongitude;

    const latNum = cleanCoordinateNumber(latitude);
    const lngNum = cleanCoordinateNumber(longitude);

    if (latNum !== null && lngNum !== null) {
      return {
        latitude: latNum,
        longitude: lngNum,
      };
    }
  }

  if (
    feature?.geometry?.type === "Point" &&
    Array.isArray(feature.geometry.coordinates) &&
    feature.geometry.coordinates.length >= 2
  ) {
    const lngNum = cleanCoordinateNumber(feature.geometry.coordinates[0]);
    const latNum = cleanCoordinateNumber(feature.geometry.coordinates[1]);

    if (latNum !== null && lngNum !== null) {
      return {
        latitude: latNum,
        longitude: lngNum,
      };
    }
  }

  return null;
}

function getPropertyDetailRows(feature) {
  const props = feature?.properties || {};

  if (Array.isArray(props.ducksmartDetails) && props.ducksmartDetails.length > 0) {
    return props.ducksmartDetails.filter((item) => item?.label && item?.value);
  }

  return [
    { label: "Owner", value: props.ducksmartOwner || "Owner not listed" },
    { label: "Address", value: props.ducksmartAddress || "Address not listed" },
    { label: "Parcel #", value: props.ducksmartParcelNumber || "Parcel number not listed" },
    props.ducksmartAcres ? { label: "Acres", value: props.ducksmartAcres } : null,
    props.ducksmartCounty ? { label: "County", value: props.ducksmartCounty } : null,
    props.ducksmartPath ? { label: "Regrid Path", value: props.ducksmartPath } : null,
  ].filter(Boolean);
}

function getFeatureCollectionFromFeature(feature) {
  if (!feature) return null;

  return {
    type: "FeatureCollection",
    features: [feature],
  };
}

function normalizeFeatureCollection(result) {
  if (!result) return null;

  if (result.type === "FeatureCollection" && Array.isArray(result.features)) {
    return result;
  }

  if (Array.isArray(result.features)) {
    return {
      type: "FeatureCollection",
      features: result.features,
    };
  }

  if (result.type === "Feature") {
    return {
      type: "FeatureCollection",
      features: [result],
    };
  }

  return null;
}

export default function MapScreen({ pins = [], setPins, logs = [] }) {
  const navigation = useNavigation();
  const {
  isPro,
  purchase,
  loading: premiumLoading,
  annualPackage,
  monthlyPackage,
} = usePremium();
  const { user } = useAuth();

  const mapRef = useRef(null);
  const bottomSheetRef = useRef(null);
  const lastNormalRegionRef = useRef(DEFAULT_REGION);
  const screenViewLoggedRef = useRef(false);
  const mapMoveCountRef = useRef(0);
  const lastMapMoveLoggedAtRef = useRef(0);
const mapSessionStartedAtRef = useRef(Date.now());
const lastPinsCountRef = useRef(pins.length);
const ignoreNextMeasureMapPressUntilRef = useRef(0);
const measureStartRef = useRef(null);
const measurePointsRef = useRef([]);
const waypointControllerRef = useRef(null);
const mapToolLabelTimerRef = useRef(null);
const toggleRefreshNoticeTimerRef = useRef(null);
const initialLocationCenteredRef = useRef(false);
  const snapPoints = useMemo(() => [118, 260, "65%"], []);

  const [sheetIndex, setSheetIndex] = useState(SNAP_COLLAPSED);
  const [permissionState, setPermissionState] = useState("unknown");
  const [userLoc, setUserLoc] = useState(null);
  const [region, setRegion] = useState(DEFAULT_REGION);

  const [isAddMode, setIsAddMode] = useState(false);
  const [draftCoord, setDraftCoord] = useState(null);
  const [draftType, setDraftType] = useState("Spot");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftNotes, setDraftNotes] = useState("");

  const [isEditingPin, setIsEditingPin] = useState(false);
  const [editType, setEditType] = useState("Spot");
  const [editTitle, setEditTitle] = useState("");
  const [editNotes, setEditNotes] = useState("");

  const [mapType, setMapType] = useState("standard");
  const [stateLinesGeojson, setStateLinesGeojson] = useState(null);
  const [showParcels, setShowParcels] = useState(false);
  const [showRadar, setShowRadar] = useState(false);
  const [radarTileUrl, setRadarTileUrl] = useState(null);

const [propertySearchVisible, setPropertySearchVisible] = useState(false);
const [propertySearchResults, setPropertySearchResults] = useState(null);
const [selectedPropertyFeatureId, setSelectedPropertyFeatureId] = useState(null);
const [expandedPropertyFeatureId, setExpandedPropertyFeatureId] = useState(null);
const [parcelLookupLoading, setParcelLookupLoading] = useState(false);
const [showPropertyHint, setShowPropertyHint] = useState(false);

const [showPublicLand, setShowPublicLand] = useState(false);
const [publicLandGeojson, setPublicLandGeojson] = useState(null);
const [publicLandLoading, setPublicLandLoading] = useState(false);
const [showPublicLandHint, setShowPublicLandHint] = useState(false);

const [showWaterLevels, setShowWaterLevels] = useState(false);
const [waterLevelStations, setWaterLevelStations] = useState([]);
const [waterLevelLoading, setWaterLevelLoading] = useState(false);
const [showWaterLevelHint, setShowWaterLevelHint] = useState(false);
const [selectedWaterLevelStation, setSelectedWaterLevelStation] = useState(null);

const [measureMode, setMeasureMode] = useState(false);
const [measurePoints, setMeasurePoints] = useState([]);
const [measureLabel, setMeasureLabel] = useState("");

const [waypointMode, setWaypointMode] = useState(false);
const [waypointLivePoints, setWaypointLivePoints] = useState([]);
const [waypointSavedPaths, setWaypointSavedPaths] = useState([]);
const [showWaypoints, setShowWaypoints] = useState(true);
const [selectedWaypointPathId, setSelectedWaypointPathId] = useState(null);
const [followBackMode, setFollowBackMode] = useState(false);
const [waypointStatus, setWaypointStatus] = useState("");
const [waypointSaving, setWaypointSaving] = useState(false);
const [mapToolLabel, setMapToolLabel] = useState(null);
const [toggleRefreshNotice, setToggleRefreshNotice] = useState(false);


  const [sharingPin, setSharingPin] = useState(false);
  const [pinStatResets, setPinStatResets] = useState({});
  const [pinSeasonArchives, setPinSeasonArchives] = useState({});
  const [historySeasonState, setHistorySeasonState] = useState(createDefaultHistorySeasonState());
  const [selectedPinId, setSelectedPinId] = useState(null);

  const activePins = useMemo(
    () =>
      pins
        .map(normalizePin)
        .filter(Boolean)
        .filter((pin) => !pin?.deletedAt && !pin?.removedAt),
    [pins]
  );

  const selectedPin = useMemo(
    () => activePins.find((p) => p.id === selectedPinId) || null,
    [activePins, selectedPinId]
  );

const selectedWaypointPath = useMemo(
  () => waypointSavedPaths.find((path) => path.id === selectedWaypointPathId) || null,
  [waypointSavedPaths, selectedWaypointPathId]
);

const selectedWaypointCoordinates = useMemo(() => {
  if (!selectedWaypointPath) return [];

  return followBackMode
    ? getFollowBackCoordinates(selectedWaypointPath)
    : selectedWaypointPath.coordinates || [];
}, [selectedWaypointPath, followBackMode]);

const waypointPathPins = useMemo(
  () => activePins.filter(isWaypointPathPin),
  [activePins]
);

const normalPinRows = useMemo(
  () => activePins.filter((pin) => !isWaypointPathPin(pin)),
  [activePins]
);

const mappedPathRows = useMemo(() => {
  const rowsById = new Map();

  const addPathRow = (path, source = "saved") => {
    if (!path?.id) return;

    const id = String(path.id);
    const existing = rowsById.get(id);

    const nextRow = {
      id,
      path,
      source,
      summary: getWaypointSummary(path),
      updatedAt: Number(path.updatedAt || path.createdAt || path.startedAt || 0),
    };

    if (!existing || nextRow.updatedAt > existing.updatedAt) {
      rowsById.set(id, nextRow);
    }
  };

  waypointSavedPaths.forEach((path) => {
    addPathRow(path, "saved");
  });

  waypointPathPins
    .map(getWaypointPathFromPin)
    .filter(Boolean)
    .forEach((path) => {
      addPathRow(path, "pin");
    });

  return Array.from(rowsById.values()).sort(
    (a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0)
  );
}, [waypointSavedPaths, waypointPathPins]);

const selectedPinIsWaypointPath = isWaypointPathPin(selectedPin);

const selectedPinWaypointPath = useMemo(() => {
  return selectedPinIsWaypointPath ? getWaypointPathFromPin(selectedPin) : null;
}, [selectedPinIsWaypointPath, selectedPin]);

  const propertySearchFeatures = useMemo(
    () =>
      Array.isArray(propertySearchResults?.features)
        ? propertySearchResults.features.slice(0, 10)
        : [],
    [propertySearchResults]
  );

  const selectedPropertyFeature = useMemo(() => {
    if (!propertySearchFeatures.length) return null;

    return (
      propertySearchFeatures.find(
        (feature, index) => getPropertyFeatureId(feature, index) === selectedPropertyFeatureId
      ) || propertySearchFeatures[0]
    );
  }, [propertySearchFeatures, selectedPropertyFeatureId]);

  const selectedPropertyGeojson = useMemo(
    () => getFeatureCollectionFromFeature(selectedPropertyFeature),
    [selectedPropertyFeature]
  );

const selectedPinHuntLogs = useMemo(() => {
  if (!selectedPinId) return [];

  const currentSeasonStart = Number(
    historySeasonState.currentSeasonStart || getDefaultSeasonStartTimestamp()
  );

  return logs
    .filter((log) => log.pinId === selectedPinId)
    .filter(isHuntLogEntry)
    .filter((log) => getLogTimestamp(log) >= currentSeasonStart)
    .sort((a, b) => getLogTimestamp(b) - getLogTimestamp(a))
    .slice(0, 4);
}, [logs, selectedPinId, historySeasonState.currentSeasonStart]);

const selectedPinScoutLogs = useMemo(() => {
  if (!selectedPinId) return [];

  const currentSeasonStart = Number(
    historySeasonState.currentSeasonStart || getDefaultSeasonStartTimestamp()
  );

  return logs
    .filter((log) => log.pinId === selectedPinId)
    .filter(isScoutLogEntry)
    .filter((log) => getLogTimestamp(log) >= currentSeasonStart)
    .sort((a, b) => getLogTimestamp(b) - getLogTimestamp(a))
    .slice(0, 4);
}, [logs, selectedPinId, historySeasonState.currentSeasonStart]);
  
const pinStats = useMemo(() => {
  if (!selectedPinId || selectedPinIsWaypointPath) return null;

  const currentSeasonStart = Number(
    historySeasonState.currentSeasonStart || getDefaultSeasonStartTimestamp()
  );

  const lastSeasonStart = historySeasonState.lastSeasonStart
    ? Number(historySeasonState.lastSeasonStart)
    : null;

  const lastSeasonClosedAt = historySeasonState.lastSeasonClosedAt
    ? Number(historySeasonState.lastSeasonClosedAt)
    : null;

  const pinLogs = logs
    .filter((log) => log.pinId === selectedPinId)
    .filter(isHuntLogEntry);

  const currentSeasonLogs = pinLogs.filter(
    (log) => getLogTimestamp(log) >= currentSeasonStart
  );

  const lastSeasonLogs =
    lastSeasonStart && lastSeasonClosedAt
      ? pinLogs.filter((log) => {
          const ts = getLogTimestamp(log);
          return ts >= lastSeasonStart && ts < lastSeasonClosedAt;
        })
      : [];

  return {
    currentYear: new Date(currentSeasonStart).getFullYear(),
    lastYear: lastSeasonStart
      ? new Date(lastSeasonStart).getFullYear()
      : new Date().getFullYear() - 1,
    resetAt: currentSeasonStart,
    lastSeasonClosedAt: lastSeasonClosedAt || null,
    current: summarizePinLogs(currentSeasonLogs),
    previous: summarizePinLogs(lastSeasonLogs),
  };
}, [selectedPinId, selectedPinIsWaypointPath, logs, historySeasonState]);

const showFloatingAddButton = !isAddMode && !selectedPin;
const floatingAddBottom = sheetIndex === SNAP_COLLAPSED ? 142 : 292;
const overlayBadgeBottom = sheetIndex === SNAP_COLLAPSED ? 96 : 248;
const publicLandRegularGeojson = useMemo(() => {
  const features = Array.isArray(publicLandGeojson?.features)
    ? publicLandGeojson.features
    : [];

  return {
    type: "FeatureCollection",
    features: features.filter(
      (feature) => feature?.properties?.ducksmartLandCategory !== "wma"
    ),
  };
}, [publicLandGeojson]);

const publicLandWmaGeojson = useMemo(() => {
  const features = Array.isArray(publicLandGeojson?.features)
    ? publicLandGeojson.features
    : [];

  return {
    type: "FeatureCollection",
    features: features.filter(
      (feature) => feature?.properties?.ducksmartLandCategory === "wma"
    ),
  };
}, [publicLandGeojson]);

const publicLandCount = Array.isArray(publicLandRegularGeojson?.features)
  ? publicLandRegularGeojson.features.length
  : 0;

const publicWmaCount = Array.isArray(publicLandWmaGeojson?.features)
  ? publicLandWmaGeojson.features.length
  : 0;

const hideMapToolsForSheet =
  sheetIndex !== SNAP_COLLAPSED || isAddMode || !!selectedPin;
const propertyTileOpacity = useMemo(() => {
  const delta = Number(region?.latitudeDelta || 0);

  if (!Number.isFinite(delta) || delta <= 0) return 0.65;
  if (delta > 0.25) return 0.18;
  if (delta > 0.12) return 0.28;
  if (delta > 0.06) return 0.42;
  if (delta > 0.025) return 0.62;

  return 0.88;
}, [region?.latitudeDelta]);

  const logoSource =
    ASSETS?.logo ||
    ASSETS?.icons?.logo ||
    ASSETS?.backgrounds?.map ||
    ASSETS?.backgrounds?.today ||
    null;

  const trackMapEvent = useCallback(
    (action, metadata = {}) => {
      const sessionAgeSeconds = Math.max(
        0,
        Math.round((Date.now() - mapSessionStartedAtRef.current) / 1000)
      );

      const eventParams = {
        screen: "MapScreen",
        action,
        isPro: isPro ? 1 : 0,
        hasUser: user?.uid ? 1 : 0,
        pinsCount: activePins.length,
        logsCount: logs.length,
        showRadar: showRadar ? 1 : 0,
        showParcels: showParcels ? 1 : 0,
        mapType,
        sheetIndex,
        sessionAgeSeconds,
        ...metadata,
      };

      logEvent(`map_${action}`, user?.uid, eventParams);
      logEvent("map_kpi", user?.uid, eventParams);
    },
    [
      user?.uid,
      isPro,
      activePins.length,
      logs.length,
      showRadar,
      showParcels,
      mapType,
      sheetIndex,
    ]
  );

  useEffect(() => {
    if (screenViewLoggedRef.current) return;
    screenViewLoggedRef.current = true;

    const pinTypes = activePins.reduce((counts, pin) => {
      const key = pin?.type || "unknown";
      counts[key] = (counts[key] || 0) + 1;
      return counts;
    }, {});

    trackMapEvent("screen_view", {
      regridConfigured: REGRID_TILE_URL ? 1 : 0,
      radarConfigured: 1,
      spotPins: pinTypes.Spot || 0,
      blindPins: pinTypes.Blind || 0,
      rampPins: pinTypes.Ramp || 0,
      otherPins: pinTypes.Other || 0,
      ...getRegionAnalytics(region),
    });
  }, [activePins, region, trackMapEvent]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const response = await fetch(STATE_LINES_URL);
        const data = await response.json();

        if (
          mounted &&
          data?.type === "FeatureCollection" &&
          Array.isArray(data.features)
        ) {
          setStateLinesGeojson(data);
        }
      } catch (err) {
        console.warn("DuckSmart state lines failed:", err?.message || err);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const previousPinsCount = lastPinsCountRef.current;

    if (previousPinsCount !== pins.length) {
      trackMapEvent("pins_count_changed", {
        previousPinsCount,
        nextPinsCount: pins.length,
        deltaPins: pins.length - previousPinsCount,
      });

      lastPinsCountRef.current = pins.length;
    }
  }, [pins.length, trackMapEvent]);

useEffect(() => {
  if (!isPro && showParcels) {
    setShowParcels(false);
    setPropertySearchResults(null);
    setSelectedPropertyFeatureId(null);
    setExpandedPropertyFeatureId(null);
    setPropertySearchVisible(false);
    trackMapEvent("property_lines_auto_disabled_free");
  }
  if (!isPro && showWaterLevels) {
    setShowWaterLevels(false);
    setShowWaterLevelHint(false);
    setSelectedWaterLevelStation(null);
    setWaterLevelStations([]);
    trackMapEvent("water_levels_auto_disabled_free");
  }
  if (!isPro && showPublicLand) {
    setShowPublicLand(false);
    setPublicLandGeojson(null);
    trackMapEvent("public_land_auto_disabled_free");
  }
}, [isPro, showParcels, showPublicLand, trackMapEvent]);

  useEffect(() => {
  let mounted = true;

  async function loadMapSeasonData() {
    try {
      const [rawResets, rawArchives, rawHistorySeason] = await Promise.all([
        AsyncStorage.getItem(PIN_STAT_RESETS_KEY),
        AsyncStorage.getItem(PIN_SEASON_ARCHIVES_KEY),
        AsyncStorage.getItem(HISTORY_SEASON_STATE_KEY),
      ]);

      const parsedResets = rawResets ? JSON.parse(rawResets) : {};
      const parsedArchives = rawArchives ? JSON.parse(rawArchives) : {};
      const parsedHistorySeason = rawHistorySeason ? JSON.parse(rawHistorySeason) : null;

      if (!mounted) return;

      setPinStatResets(
        parsedResets && typeof parsedResets === "object" ? parsedResets : {}
      );
      setPinSeasonArchives(
        parsedArchives && typeof parsedArchives === "object" ? parsedArchives : {}
      );
      setHistorySeasonState(normalizeHistorySeasonState(parsedHistorySeason));
    } catch {
      if (!mounted) return;

      setPinStatResets({});
      setPinSeasonArchives({});
      setHistorySeasonState(createDefaultHistorySeasonState());
    }
  }

  loadMapSeasonData();

  const unsubscribe = navigation.addListener?.("focus", loadMapSeasonData);

  return () => {
    mounted = false;
    if (typeof unsubscribe === "function") unsubscribe();
  };
}, [navigation]);

  const loadRadar = useCallback(async () => {
    try {
      const result = await getRadarTileUrl();
      const tileUrl = result?.tileUrl || null;
      setRadarTileUrl(tileUrl);

      trackMapEvent(tileUrl ? "radar_tile_loaded" : "radar_tile_empty");

      return tileUrl;
    } catch (err) {
      trackMapEvent("radar_tile_failed", {
        message: err.message || "Unknown error",
      });

      setRadarTileUrl(null);
      return null;
    }
  }, [trackMapEvent]);

  useEffect(() => {
    loadRadar();
  }, [loadRadar]);

  useEffect(() => {
  if (initialLocationCenteredRef.current) return;
  initialLocationCenteredRef.current = true;

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();

        trackMapEvent("location_permission_result", { status });

        if (status !== "granted") {
          setPermissionState("denied");
          return;
        }

        setPermissionState("granted");

        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        const coord = {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        };

        setUserLoc(coord);

        const initialRegion = {
          ...coord,
          latitudeDelta: 0.03,
          longitudeDelta: 0.03,
        };

        setRegion(initialRegion);
        lastNormalRegionRef.current = initialRegion;

        trackMapEvent("location_loaded", {
          ...getRegionAnalytics(initialRegion),
        });

        requestAnimationFrame(() => {
          mapRef.current?.animateToRegion(initialRegion, 650);
        });
      } catch (err) {
        setPermissionState("denied");
        trackMapEvent("location_failed", {
          message: err.message || "Unknown error",
        });
      }
    })();
  }, [trackMapEvent]);
  const lookupParcelAtCoordinate = useCallback(
async (coordinate) => {
  if (showPropertyHint) setShowPropertyHint(false);

  if (!coordinate || parcelLookupLoading) return;

  if (!showParcels) return;

      if (!isPro) {
        setShowParcels(false);
        trackMapEvent("property_lookup_paywall_hit");

        Alert.alert(
          "Pro Feature",
          "Property owner info requires DuckSmart Pro.",
          [
            { text: "Not Now", style: "cancel" },
            { text: "Upgrade to Pro", onPress: purchase },
          ]
        );
        return;
      }

      if (!REGRID_POINT_LOOKUP_URL) {
        trackMapEvent("property_lookup_not_configured");

        Alert.alert(
          "Property Lookup Not Configured",
          "This build does not include a Regrid lookup function."
        );
        return;
      }

      setParcelLookupLoading(true);

      trackMapEvent("property_lookup_started", {
        ...getRegionAnalytics(region),
      });

      try {
        const url =
          `${REGRID_POINT_LOOKUP_URL}` +
          `?lat=${encodeURIComponent(coordinate.latitude)}` +
          `&lon=${encodeURIComponent(coordinate.longitude)}` +
          `&radius=8` +
          `&limit=1` +
          `&return_geometry=false` +
          `&return_custom=true`;

        const response = await fetch(url);
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          const message = data?.message || data?.error || `HTTP ${response.status}`;
          throw new Error(message);
        }

        const parcel = data?.parcels?.features?.[0];

        if (!parcel) {
          trackMapEvent("property_lookup_empty", {
            ...getRegionAnalytics(region),
          });

          Alert.alert(
            "No Parcel Found",
            "No parcel owner data was found at this exact point. Try long-pressing directly inside a visible property boundary."
          );
          return;
        }

        trackMapEvent("property_lookup_success", {
          ...getRegionAnalytics(region),
        });

        Alert.alert("Parcel Owner Info", formatParcelInfo(parcel, coordinate));
      } catch (err) {
        console.error("DuckSmart Regrid parcel lookup error:", err);

        trackMapEvent("property_lookup_failed", {
          message: err.message || "Unknown error",
        });

        Alert.alert(
          "Owner Lookup Failed",
          `Could not load parcel owner info.\n\n${err.message || "Unknown error"}`
        );
      } finally {
        setParcelLookupLoading(false);
      }
    },
    [
      parcelLookupLoading,
      showParcels,
      isPro,
      purchase,
      trackMapEvent,
      region,
    ]
  );

  const getRadarRegion = useCallback(() => {
    const center = userLoc || region || DEFAULT_REGION;

    return {
      latitude: center.latitude,
      longitude: center.longitude,
      latitudeDelta: RADAR_REGION_DELTA,
      longitudeDelta: RADAR_REGION_DELTA,
    };
  }, [region, userLoc]);

  const openRadar = useCallback(async () => {
    const currentRegion = region || DEFAULT_REGION;
    lastNormalRegionRef.current = currentRegion;

    setShowParcels(false);
    setPropertySearchResults(null);
    setSelectedPropertyFeatureId(null);
    setExpandedPropertyFeatureId(null);
    setPropertySearchVisible(false);

    const tileUrl = radarTileUrl || (await loadRadar());
    if (!tileUrl) {
      trackMapEvent("radar_unavailable");
      Alert.alert("Radar Unavailable", "Weather radar could not be loaded right now.");
      return;
    }

    const radarRegion = getRadarRegion();

    setShowRadar(true);
    setRegion(radarRegion);
    trackMapEvent("radar_enabled", {
      ...getRegionAnalytics(radarRegion),
    });

    requestAnimationFrame(() => {
      mapRef.current?.animateToRegion(radarRegion, 650);
    });
  }, [getRadarRegion, loadRadar, radarTileUrl, region, trackMapEvent]);

  const closeRadar = useCallback(
    (source = "manual") => {
      setShowRadar(false);
      trackMapEvent("radar_disabled", {
        source,
        ...getRegionAnalytics(region),
      });

      const restoreRegion = lastNormalRegionRef.current || userLoc || DEFAULT_REGION;
      setRegion(restoreRegion);

      setTimeout(() => {
        mapRef.current?.animateToRegion(restoreRegion, 650);
      }, 120);
    },
    [trackMapEvent, userLoc, region]
  );

function openProPurchase() {
  purchase(annualPackage || monthlyPackage);
}

function blockPremiumMapFeature(featureName) {
  if (premiumLoading) {
    Alert.alert(
      "Checking Subscription",
      "DuckSmart is still checking your subscription. Please try again in a second."
    );
    return true;
  }

  if (!isPro) {
    trackMapEvent("premium_map_feature_paywall_hit", {
      featureName,
      ...getRegionAnalytics(region),
    });

    Alert.alert(
      "Pro Feature",
      `${featureName} is included with DuckSmart Pro.`,
      [
        { text: "Not Now", style: "cancel" },
        { text: "Upgrade to Pro", onPress: openProPurchase },
      ]
    );

    return true;
  }

  return false;
}

async function togglePublicLand() {
  async function togglePublicLand() {
  if (blockPremiumMapFeature("Public land overlays")) return;

  if (showPublicLand) {
    setShowPublicLand(false);
    setShowPublicLandHint(false);

    trackMapEvent("public_land_disabled", {
      source: "map_button",
      ...getRegionAnalytics(region),
    });

    return;
  }

    Alert.alert(
      "Pro Feature",
      "Public land overlays are included with DuckSmart Pro.",
      [
        { text: "Not Now", style: "cancel" },
        { text: "Upgrade to Pro", onPress: purchase },
      ]
    );

    return;
  }

if (showPublicLand) {
  setShowPublicLand(false);
  setShowPublicLandHint(false);

  trackMapEvent("public_land_disabled", {
    source: "map_button",
    ...getRegionAnalytics(region),
  });

  return;
}

  try {
    setPublicLandLoading(true);

    const geojson = await fetchPublicPropertyGeojson(region);

setPublicLandGeojson(geojson);
setShowPublicLand(true);
setShowPublicLandHint(true);

    trackMapEvent("public_land_enabled", {
      source: "map_button",
      featuresCount: geojson?.features?.length || 0,
      ...getRegionAnalytics(region),
    });
  } catch (err) {
    console.error("DuckSmart public land overlay error:", err);

    setPublicLandGeojson({
      type: "FeatureCollection",
      features: [],
    });

    setShowPublicLand(true);
setShowPublicLandHint(true);

    trackMapEvent("public_land_failed", {
      message: err?.message || "Unknown error",
    });
  } finally {
    setPublicLandLoading(false);
  }
}

function clearMeasure() {
  ignoreNextMeasureMapPressUntilRef.current = 0;
  measureStartRef.current = null;
  measurePointsRef.current = [];
  setMeasurePoints([]);
  setMeasureLabel("");
}

function toggleMeasureMode() {
  const next = !measureMode;

  if (!next) {
    clearMeasure();
  } else {
ignoreNextMeasureMapPressUntilRef.current = 0;
measureStartRef.current = null;
measurePointsRef.current = [];
setMeasurePoints([]);
setMeasureLabel("Tap start point");
setSelectedPinId(null);
setIsAddMode(false);
setDraftCoord(null);
  }

  setMeasureMode(next);

  trackMapEvent(next ? "measure_mode_enabled" : "measure_mode_disabled", {
    source: "map_button",
    ...getRegionAnalytics(region),
  });
}

function addMeasureCoordinate(coordinate, source = "map") {
  const cleanCoordinate = getCleanMeasureCoordinate(coordinate);
  if (!cleanCoordinate) return;

  const existingPoints = Array.isArray(measurePointsRef.current)
    ? measurePointsRef.current
    : [];

  const start =
    measureStartRef.current ||
    existingPoints[0] ||
    measurePoints[0] ||
    null;

  if (!start) {
    measureStartRef.current = cleanCoordinate;
    measurePointsRef.current = [cleanCoordinate];
    setMeasurePoints([cleanCoordinate]);
    setMeasureLabel("Start set — tap end point");

    trackMapEvent("measure_first_point_selected", {
      source,
      ...getRegionAnalytics(region),
    });

    return;
  }

  if (areSameMeasureCoordinate(start, cleanCoordinate)) {
    setMeasureLabel("Tap a different end point");
    return;
  }

  const miles = getDistanceMiles(start, cleanCoordinate);
  const yards = Number.isFinite(miles) ? Math.round(miles * 1760) : null;
  const label = yards === null ? "Distance unavailable" : `${yards.toLocaleString()} yds`;

  const nextPoints = [start, cleanCoordinate];

  measureStartRef.current = null;
  measurePointsRef.current = nextPoints;
  setMeasurePoints(nextPoints);
  setMeasureLabel(label);

  trackMapEvent("measure_completed", {
    source,
    distanceMiles: Number.isFinite(miles) ? Number(miles.toFixed(3)) : null,
    distanceYards: yards,
    ...getRegionAnalytics(region),
  });
}

function measureCurrentLocationToPin(pin) {
  const start = getCleanMeasureCoordinate(userLoc);
  const end = getCleanMeasureCoordinate(getPinCoordinate(pin));

  if (!start || !end) {
    Alert.alert(
      "Distance Unavailable",
      "Current location or pin GPS is missing."
    );
    return;
  }

  const miles = getDistanceMiles(start, end);

  const nextPoints = [start, end];

setMeasureMode(true);
measurePointsRef.current = nextPoints;
setMeasurePoints(nextPoints);
setMeasureLabel(formatDistanceYards(miles) || "Distance unavailable");

  trackMapEvent("measure_user_to_pin", {
    distanceMiles: Number.isFinite(miles) ? Number(miles.toFixed(3)) : null,
    distanceYards: Number.isFinite(miles) ? Math.round(miles * 1760) : null,
    ...getRegionAnalytics(region),
  });
}

  async function toggleRadar() {
    if (showRadar) {
      closeRadar("top_button");
      return;
    }

    trackMapEvent("radar_button_tapped", {
      wasEnabled: showRadar ? 1 : 0,
    });

    await openRadar();
  }

  function toggleMapType() {
    setMapType((prev) => {
      const next = prev === "standard" ? "satellite" : prev === "satellite" ? "hybrid" : "standard";

      trackMapEvent("map_type_changed", {
        from: prev,
        to: next,
        ...getRegionAnalytics(region),
      });

      return next;
    });
  }


async function toggleWaterLevels() {
  if (showWaterLevels) {
  setShowWaterLevels(false);
  setShowWaterLevelHint(false);
  setSelectedWaterLevelStation(null);

    trackMapEvent("water_levels_disabled", {
      source: "map_button",
      ...getRegionAnalytics(region),
    });

    return;
  }

  try {
    setWaterLevelLoading(true);
    setShowPublicLandHint(false);

    const result = await fetchWaterLevelsForRegion(region, {
      maxSites: 20,
      maxStations: 8,
      timeoutMs: 9000,
    });

    const stations = Array.isArray(result?.stations) ? result.stations : [];

    setWaterLevelStations(stations);
    setShowWaterLevels(true);
    setShowWaterLevelHint(true);

    trackMapEvent("water_levels_enabled", {
      source: "map_button",
      stationsCount: stations.length,
      freshwaterCount: result?.freshwater?.length || 0,
      tideCount: result?.tides?.length || 0,
      errorsCount: result?.errors?.length || 0,
      ...getRegionAnalytics(region),
    });

    if (stations.length === 0) {
      Alert.alert(
        "No Water Levels Found",
        "No USGS or NOAA water-level stations were found in this map area. Try zooming out or moving near a river, lake, reservoir, or coast."
      );
    }
  } catch (err) {
    console.error("DuckSmart water levels error:", err);

    setWaterLevelStations([]);
    setShowWaterLevels(true);
    setShowWaterLevelHint(true);

    trackMapEvent("water_levels_failed", {
      message: err?.message || "Unknown error",
      ...getRegionAnalytics(region),
    });

    Alert.alert(
      "Water Levels Failed",
      err?.message || "Could not load water levels right now."
    );
  } finally {
    setWaterLevelLoading(false);
  }
}

async function toggleWaypointMapping() {
  if (waypointSaving) return;

  if (waypointMode) {
    await stopWaypointMapping();
    return;
  }

  Alert.alert(
    "Start Mapping Path?",
    "Are you sure you want to begin mapping a path?",
    [
      {
        text: "Cancel",
        style: "cancel",
      },
      {
        text: "Start",
        onPress: async () => {
          await startWaypointMapping();
        },
      },
    ]
  );
}

async function startWaypointMapping() {
  try {
    setWaypointSaving(true);
    setMeasureMode(false);
    clearMeasure();
    setSelectedPinId(null);
    setIsAddMode(false);
    setDraftCoord(null);
    setFollowBackMode(false);
    setSelectedWaypointPathId(null);
    setWaypointLivePoints([]);
    setWaypointStatus("Starting GPS...");

    const controller = await startWaypointRecording({
      userId: user?.uid,
      onPointsChange: (points) => {
        setWaypointLivePoints(points);
      },
      onStatus: (message) => {
        setWaypointStatus(message);
      },
      onError: (err) => {
        setWaypointStatus(err?.message || "Waypoint mapping failed.");
      },
    });

    waypointControllerRef.current = controller;
    setWaypointMode(true);
    setWaypointStatus("Mapping path...");

    trackMapEvent("waypoint_mapping_started", {
      source: "map_button",
      ...getRegionAnalytics(region),
    });
  } catch (err) {
    Alert.alert(
      "Waypoint Mapping Failed",
      err?.message || "Could not start GPS path mapping."
    );

    setWaypointMode(false);
    setWaypointLivePoints([]);
    setWaypointStatus("");
  } finally {
    setWaypointSaving(false);
  }
}

async function stopWaypointMapping() {
  const controller = waypointControllerRef.current;

  const currentSession =
    controller && typeof controller.getSession === "function"
      ? controller.getSession()
      : null;

  const currentPoints = Array.isArray(currentSession?.points)
    ? currentSession.points
    : Array.isArray(waypointLivePoints)
      ? waypointLivePoints
      : [];

  const shouldSave = currentPoints.length >= 2;

  try {
    setWaypointSaving(true);
    setWaypointStatus(shouldSave ? "Saving path..." : "Stopping path...");

    let savedPath = null;

    if (controller) {
      if (shouldSave) {
        savedPath = await stopWaypointRecording(controller, { save: true });
      } else if (typeof controller.cancel === "function") {
        await controller.cancel();
      } else {
        await stopWaypointRecording(controller, { save: false });
      }
    }

    waypointControllerRef.current = null;
    setWaypointMode(false);
    setWaypointLivePoints([]);
    setWaypointStatus("");
    setWaypointSaving(false);
    setFollowBackMode(false);

    if (shouldSave && savedPath?.id) {
  const pathPin = saveWaypointPathAsPin(savedPath);

  await reloadWaypointPaths();
  setSelectedWaypointPathId(savedPath.id);

  if (pathPin?.id) {
    setSelectedPinId(pathPin.id);
    setIsEditingPin(false);
    bottomSheetRef.current?.snapToIndex(SNAP_EXPANDED);
  }
} else {
  setSelectedWaypointPathId(null);
}

    trackMapEvent(
      shouldSave ? "waypoint_mapping_stopped" : "waypoint_mapping_cancelled",
      {
        pointCount: currentPoints.length,
        saved: savedPath?.id ? 1 : 0,
        ...getRegionAnalytics(region),
      }
    );
  } catch (err) {
    console.warn("Waypoint stop failed:", err?.message || err);

    waypointControllerRef.current = null;
    setWaypointMode(false);
    setWaypointLivePoints([]);
    setWaypointStatus("");
    setWaypointSaving(false);
    setSelectedWaypointPathId(null);
    setFollowBackMode(false);
  }
}

function getCleanWaypointPathCoordinates(path) {
  const raw = Array.isArray(path?.coordinates)
    ? path.coordinates
    : Array.isArray(path?.points)
      ? path.points
      : [];

  return raw.map(getCleanMeasureCoordinate).filter(Boolean);
}

function zoomToWaypointPath(path, useFollowBack = false) {
  const coordinates = useFollowBack
    ? getFollowBackCoordinates(path).map(getCleanMeasureCoordinate).filter(Boolean)
    : getCleanWaypointPathCoordinates(path);

  if (!coordinates.length) return;

  requestAnimationFrame(() => {
    if (coordinates.length >= 2 && typeof mapRef.current?.fitToCoordinates === "function") {
      mapRef.current.fitToCoordinates(coordinates, {
        edgePadding: {
          top: 110,
          right: 70,
          bottom: sheetIndex === SNAP_COLLAPSED ? 190 : 340,
          left: 70,
        },
        animated: true,
      });

      return;
    }

    const first = coordinates[0];

    const nextRegion = {
      latitude: first.latitude,
      longitude: first.longitude,
      latitudeDelta: 0.018,
      longitudeDelta: 0.018,
    };

    setRegion(nextRegion);
    mapRef.current?.animateToRegion(nextRegion, 500);
  });
}

function showWaypointPath(path) {
  if (!path?.id) return;

  setShowWaypoints(true);
  setSelectedWaypointPathId(path.id);
  setFollowBackMode(false);

  zoomToWaypointPath(path, false);

  trackMapEvent("waypoint_path_shown", {
    pathId: path.id,
    pointCount: Array.isArray(path.coordinates) ? path.coordinates.length : 0,
    ...getRegionAnalytics(region),
  });
}

function followWaypointPathBack(path) {
  if (!path?.id) return;

  setShowWaypoints(true);
  setSelectedWaypointPathId(path.id);
  setFollowBackMode(true);

  zoomToWaypointPath(path, true);

  trackMapEvent("waypoint_path_follow_back", {
    pathId: path.id,
    pointCount: Array.isArray(path.coordinates) ? path.coordinates.length : 0,
    ...getRegionAnalytics(region),
  });
}

function saveWaypointPathAsPin(savedPath) {
  if (!savedPath?.id || typeof setPins !== "function") return null;

  const pathPin = buildWaypointPathPin(savedPath);

  if (!pathPin) return null;

  setPins((prev) => {
    const existing = Array.isArray(prev) ? prev : [];

    const withoutDuplicate = existing.filter((pin) => {
      return (
        pin.id !== pathPin.id &&
        pin.waypointPathId !== pathPin.waypointPathId
      );
    });

    return [pathPin, ...withoutDuplicate];
  });

  return pathPin;
}

function ensureWaypointPathPin(path) {
  if (!path?.id) return null;

  const existingPathPin = activePins.find((pin) => {
    return (
      isWaypointPathPin(pin) &&
      (
        pin.waypointPathId === path.id ||
        pin.waypointPath?.id === path.id ||
        pin.id === `path-pin-${path.id}`
      )
    );
  });

  if (existingPathPin) return existingPathPin;

  const pathPin = buildWaypointPathPin(path);

  if (!pathPin || typeof setPins !== "function") return null;

  setPins((prev) => {
    const existing = Array.isArray(prev) ? prev : [];

    const withoutDuplicate = existing.filter((pin) => {
      return (
        pin.id !== pathPin.id &&
        pin.waypointPathId !== pathPin.waypointPathId
      );
    });

    return [pathPin, ...withoutDuplicate];
  });

  return pathPin;
}

function openWaypointPathAsPin(path) {
  const pathPin = ensureWaypointPathPin(path);

  if (!pathPin?.id) {
    showWaypointPath(path);
    return;
  }

  setSelectedPinId(pathPin.id);
  setIsEditingPin(false);
  setDraftCoord(null);
  showWaypointPath(path);
  bottomSheetRef.current?.snapToIndex(SNAP_EXPANDED);
}

function shareWaypointPathAsPin(path) {
  const pathPin = ensureWaypointPathPin(path);

  if (!pathPin) {
    Alert.alert("Path Share Error", "Could not prepare this path for sharing.");
    return;
  }

  const normalizedPin = normalizePinForShare(pathPin);

  if (!normalizedPin) {
    Alert.alert("Missing GPS", "This path is missing GPS coordinates.");
    return;
  }

navigation.navigate("ShareScreen", {
  shareType: "pin",
  item: normalizedPin,
  shareSessionId: `pin-${normalizedPin.originalId || normalizedPin.id || Date.now()}-${Date.now()}`,
});
}

async function removeWaypointPath(pathId) {
  try {
    const nextPaths = await deleteWaypointPath(pathId, user?.uid);
    setWaypointSavedPaths(nextPaths);

    if (typeof setPins === "function") {
      setPins((prev) =>
        (Array.isArray(prev) ? prev : []).filter((pin) => {
          return (
            pin.waypointPathId !== pathId &&
            pin.waypointPath?.id !== pathId &&
            pin.id !== `path-pin-${pathId}`
          );
        })
      );
    }

    if (selectedWaypointPathId === pathId) {
      setSelectedWaypointPathId(null);
      setFollowBackMode(false);
    }

    if (
      selectedPin &&
      (
        selectedPin.waypointPathId === pathId ||
        selectedPin.waypointPath?.id === pathId ||
        selectedPin.id === `path-pin-${pathId}`
      )
    ) {
      setSelectedPinId(null);
      setIsEditingPin(false);
      bottomSheetRef.current?.snapToIndex(SNAP_COLLAPSED);
    }

    trackMapEvent("waypoint_path_deleted", {
      pathId,
      ...getRegionAnalytics(region),
    });
  } catch {
    Alert.alert("Delete Failed", "Could not delete this mapped path.");
  }
}

  function toggleParcels() {
    if (!REGRID_TILE_URL) {
      trackMapEvent("property_lines_not_configured");
      Alert.alert("Property Lines Unavailable", "Property line tiles are not configured yet.");
      return;
    }

    if (!isPro) {
      trackMapEvent("property_lines_paywall_hit");

      Alert.alert(
        "Pro Feature",
        "Property lines are included with DuckSmart Pro.",
        [
          { text: "Not Now", style: "cancel" },
          { text: "Upgrade to Pro", onPress: purchase },
        ]
      );
      return;
    }

if (showParcels) {
  setShowParcels(false);
  setShowPropertyHint(false);
  setPropertySearchVisible(false);
  setPropertySearchResults(null);
  setSelectedPropertyFeatureId(null);
  setExpandedPropertyFeatureId(null);

  trackMapEvent("property_lines_disabled", {
    source: "top_button",
    ...getRegionAnalytics(region),
  });

  return;
}

    if (showRadar) {
      closeRadar("property_lines_enabled");
    }

 setShowParcels(true);
setShowPropertyHint(true);
setPropertySearchVisible(false);

    trackMapEvent("property_lines_enabled", {
      source: "top_button",
      ...getRegionAnalytics(region),
    });
  }

  const handleRegionChangeComplete = useCallback(
    (nextRegion) => {
      setRegion(nextRegion);
      mapMoveCountRef.current += 1;

      if (!showRadar) {
        lastNormalRegionRef.current = nextRegion;
      }

      const now = Date.now();

      if (now - lastMapMoveLoggedAtRef.current >= MAP_ENGAGEMENT_INTERVAL_MS) {
        lastMapMoveLoggedAtRef.current = now;

        trackMapEvent("map_moved", {
          moveCount: mapMoveCountRef.current,
          ...getRegionAnalytics(nextRegion),
        });
      }
    },
    [showRadar, trackMapEvent]
  );

  const handleSheetChange = useCallback(
    (index) => {
      setSheetIndex(index);

      trackMapEvent("sheet_changed", {
        index,
        mode: isAddMode ? "add_pin" : selectedPinId ? "pin_detail" : "pin_list",
      });

      if (index === SNAP_COLLAPSED) {
        if (isAddMode) {
          setIsAddMode(false);
          setDraftCoord(null);
        }

        if (selectedPinId) setSelectedPinId(null);
        if (isEditingPin) setIsEditingPin(false);
      }
    },
    [isAddMode, selectedPinId, isEditingPin, trackMapEvent]
  );

  useEffect(() => {
    if (isAddMode) {
      bottomSheetRef.current?.snapToIndex(SNAP_EXPANDED);
    }
  }, [isAddMode]);

  useEffect(() => {
    if (selectedPinId) {
      bottomSheetRef.current?.snapToIndex(SNAP_EXPANDED);
    }
  }, [selectedPinId]);

const reloadWaypointPaths = useCallback(async () => {
  const paths = await loadWaypointPaths(user?.uid);
  setWaypointSavedPaths(paths);

  if (user?.uid) {
    syncOfflineWaypointPaths(user.uid).catch(() => {});
  }
}, [user?.uid]);

useEffect(() => {
  reloadWaypointPaths();
}, [reloadWaypointPaths]);


  function startAddPin() {
    if (!isPro && activePins.length >= FREE_PIN_LIMIT) {
      trackMapEvent("pin_limit_hit", {
        limit: FREE_PIN_LIMIT,
        attemptedFrom: "add_button",
      });

      Alert.alert(
        "Pin Limit Reached",
        `Free accounts can save up to ${FREE_PIN_LIMIT} pins. Upgrade to DuckSmart Pro for unlimited scouting pins.`,
        [
          { text: "Not Now", style: "cancel" },
          { text: "Upgrade to Pro", onPress: purchase },
        ]
      );
      return;
    }

    trackMapEvent("add_pin_started", {
      source: "floating_or_sheet_button",
      pinsBefore: activePins.length,
    });

    setIsAddMode(true);
    setDraftCoord(null);
    setDraftTitle("");
    setDraftNotes("");
    setDraftType("Spot");
    setSelectedPinId(null);
    setIsEditingPin(false);
  }

  function cancelAddPin() {
    trackMapEvent("add_pin_cancelled", {
      hadCoordinate: draftCoord ? 1 : 0,
      draftType,
      hadTitle: draftTitle.trim() ? 1 : 0,
      hadNotes: draftNotes.trim() ? 1 : 0,
    });

    setIsAddMode(false);
    setDraftCoord(null);
    bottomSheetRef.current?.snapToIndex(SNAP_COLLAPSED);
  }

function onMapPress(e) {
  const coord = e?.nativeEvent?.coordinate;
  if (!coord) return;

  if (measureMode) {
    if (Date.now() < ignoreNextMeasureMapPressUntilRef.current) {
      return;
    }

    addMeasureCoordinate(coord, "map");
    return;
  }

  if (showPropertyHint) setShowPropertyHint(false);

  trackMapEvent("map_tapped", {
    mode: measureMode
      ? "measure"
      : isAddMode
        ? "add_pin"
        : showParcels
          ? "property_lines"
          : "browse",
    hasSelectedPin: selectedPin ? 1 : 0,
    ...getRegionAnalytics(region),
  });

  if (isAddMode) {
    setDraftCoord(coord);

    trackMapEvent("add_pin_location_selected", {
      draftType,
      ...getRegionAnalytics(region),
    });

    return;
  }

  if (showParcels) {
    trackMapEvent("property_map_tap_ignored", {
      source: "property_lines_bulk_search_only",
      ...getRegionAnalytics(region),
    });
  }
}

  function savePin() {
  Keyboard.dismiss();
    if (!isPro && activePins.length >= FREE_PIN_LIMIT) {
      trackMapEvent("pin_limit_hit", {
        limit: FREE_PIN_LIMIT,
        attemptedFrom: "save_pin",
      });

      Alert.alert(
        "Pin Limit Reached",
        `Free accounts can save up to ${FREE_PIN_LIMIT} pins. Upgrade to DuckSmart Pro for unlimited scouting pins.`,
        [
          { text: "Not Now", style: "cancel" },
          { text: "Upgrade to Pro", onPress: purchase },
        ]
      );
      return;
    }

    if (!draftCoord) {
      trackMapEvent("save_pin_missing_coordinate");
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
      coordinates: draftCoord,
      latitude: draftCoord.latitude,
      longitude: draftCoord.longitude,
      createdAt: Date.now(),
    };

    setPins((prev) => [newPin, ...prev]);
    logPinCreated(user?.uid, draftType);

    trackMapEvent("pin_created", {
      pinType: draftType,
      hasTitle: draftTitle.trim() ? 1 : 0,
      hasNotes: notes ? 1 : 0,
      pinsCountAfter: activePins.length + 1,
      source: "map_save_pin",
      ...getRegionAnalytics(region),
    });

    setIsAddMode(false);
    setDraftCoord(null);
    bottomSheetRef.current?.snapToIndex(SNAP_COLLAPSED);

    const pinRegion = {
      ...draftCoord,
      latitudeDelta: showRadar ? RADAR_REGION_DELTA : 0.02,
      longitudeDelta: showRadar ? RADAR_REGION_DELTA : 0.02,
    };

    requestAnimationFrame(() => {
      mapRef.current?.animateToRegion(pinRegion, 500);
    });
  }

  function startEditSelectedPin() {
    if (!selectedPin) return;

    trackMapEvent("pin_edit_started", {
      ...getPinKpi(selectedPin, logs),
    });

    setEditTitle(selectedPin.title || "");
    setEditType(selectedPin.type || "Spot");
    setEditNotes(selectedPin.notes || "");
    setIsEditingPin(true);
  }

  function cancelEditSelectedPin() {
    trackMapEvent("pin_edit_cancelled", {
      ...(selectedPin ? getPinKpi(selectedPin, logs) : {}),
    });

    setIsEditingPin(false);
    setEditTitle("");
    setEditType("Spot");
    setEditNotes("");
  }

  function saveEditedPin() {
    if (!selectedPin) return;

    const title = editTitle.trim() || `${editType} Pin`;
    const notes = editNotes.trim();

    setPins((prev) =>
      prev.map((pin) => {
        if (pin.id !== selectedPin.id) return pin;

        const coordinate = getPinCoordinate(pin) || selectedPin.coordinate;

        return {
          ...pin,
          title,
          type: editType,
          notes,
          coordinate,
          coordinates: coordinate,
          latitude: coordinate.latitude,
          longitude: coordinate.longitude,
          updatedAt: Date.now(),
        };
      })
    );

    trackMapEvent("pin_edited", {
      pinType: editType,
      hasTitle: title ? 1 : 0,
      hasNotes: notes ? 1 : 0,
            linkedHunts: selectedPinHuntLogs.length,
    });

    setIsEditingPin(false);
  }

  function deleteSelectedPin() {
    if (!selectedPin) return;

    Alert.alert("Delete pin?", selectedPin.title, [
      {
        text: "Cancel",
        style: "cancel",
        onPress: () => {
          trackMapEvent("pin_delete_cancelled", {
            ...getPinKpi(selectedPin, logs),
          });
        },
      },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          trackMapEvent("pin_deleted", {
            ...getPinKpi(selectedPin, logs),
            pinsCountAfter: Math.max(activePins.length - 1, 0),
          });

          setPins((prev) => prev.filter((p) => p.id !== selectedPin.id));
          setSelectedPinId(null);
          setIsEditingPin(false);
          bottomSheetRef.current?.snapToIndex(SNAP_COLLAPSED);
        },
      },
    ]);
  }

  function closeDetail() {
    trackMapEvent("pin_detail_closed", {
      ...(selectedPin ? getPinKpi(selectedPin, logs) : {}),
    });

    setSelectedPinId(null);
    setIsEditingPin(false);
    bottomSheetRef.current?.snapToIndex(SNAP_COLLAPSED);
  }

  function backToPinList() {
  trackMapEvent("pin_detail_back_to_list", {
    ...(selectedPin ? getPinKpi(selectedPin, logs) : {}),
  });

  setSelectedPinId(null);
  setIsEditingPin(false);
  bottomSheetRef.current?.snapToIndex(SNAP_EXPANDED);
}

  function centerOnPin(pin) {
    const coordinate = getPinCoordinate(pin);
    if (!coordinate) return;

    const pinRegion = {
      ...coordinate,
      latitudeDelta: showRadar ? RADAR_REGION_DELTA : 0.02,
      longitudeDelta: showRadar ? RADAR_REGION_DELTA : 0.02,
    };

    setRegion(pinRegion);

    requestAnimationFrame(() => {
      mapRef.current?.animateToRegion(pinRegion, 500);
    });
  }

  function goToUser() {
    if (!userLoc) return;

    const userRegion = {
      ...userLoc,
      latitudeDelta: 0.025,
      longitudeDelta: 0.025,
    };

    setRegion(userRegion);
    lastNormalRegionRef.current = userRegion;

    trackMapEvent("go_to_user_location", {
      ...getRegionAnalytics(userRegion),
    });

    requestAnimationFrame(() => {
      mapRef.current?.animateToRegion(userRegion, 500);
    });
  }

  function addHuntForSelectedPin() {
    if (!selectedPin) return;

    trackMapEvent("add_hunt_from_pin", {
      ...getPinKpi(selectedPin, logs),
    });

    navigation.navigate("Log", {
      selectedPinId: selectedPin.id,
      selectedPinTitle: selectedPin.title,
      pinId: selectedPin.id,
      pinTitle: selectedPin.title,
      linkedPin: selectedPin,
    });
  }

  async function shareSelectedPin() {
    if (!selectedPin || sharingPin) return;

    const normalizedPin = normalizePinForShare(selectedPin);

    if (!normalizedPin) {
      trackMapEvent("pin_share_missing_coordinate", {
        ...getPinKpi(selectedPin, logs),
      });

      Alert.alert(
        "Missing GPS",
        "This pin is missing GPS coordinates, so it cannot be shared as a working map pin."
      );
      return;
    }

    trackMapEvent("pin_share_options_opened", {
      ...getPinKpi(normalizedPin, logs),
    });

    const isPathShare = isWaypointPathPin(selectedPin);

Alert.alert(
  isPathShare ? "Share Path" : "Share Pin",
  isPathShare ? "How do you want to share this path?" : "How do you want to share this pin?",
  [
      {
        text: "Share within App",
        onPress: () => {
          trackMapEvent("pin_share_within_app_selected", {
            ...getPinKpi(normalizedPin, logs),
          });

          navigation.navigate("ShareScreen", {
            shareType: "pin",
            item: normalizedPin,
          });
        },
      },
      {
        text: "Send DuckSmart Invite",
        onPress: async () => {
          setSharingPin(true);

          trackMapEvent("pin_share_other_ways_started", {
            ...getPinKpi(normalizedPin, logs),
          });

          try {
            const shareResult = await createSharedPin(normalizedPin);

            await Share.share({
              message: shareResult.message,
              url: shareResult.imageUrl || undefined,
            });

            trackMapEvent("pin_share_other_ways_completed", {
              ...getPinKpi(normalizedPin, logs),
            });
          } catch (err) {
            console.error("DuckSmart share pin error:", err);

            trackMapEvent("pin_share_other_ways_failed", {
              message: err.message || "Unknown error",
            });

            Alert.alert(
              "Share Failed",
              err.message || "Could not create a share link for this pin. Please try again."
            );
          } finally {
            setSharingPin(false);
          }
        },
      },
      {
        text: "Cancel",
        style: "cancel",
        onPress: () => {
          trackMapEvent("pin_share_options_cancelled", {
            ...getPinKpi(normalizedPin, logs),
          });
        },
      },
    ]);
  }

  function navigateToPin() {
    if (!selectedPin) return;

    const coordinate = getPinCoordinate(selectedPin);
    if (!coordinate) {
      Alert.alert("Missing GPS", "This pin does not have coordinates.");
      return;
    }

    const url = Platform.select({
      ios: `http://maps.apple.com/?daddr=${coordinate.latitude},${coordinate.longitude}`,
      android: `google.navigation:q=${coordinate.latitude},${coordinate.longitude}`,
      default: `https://www.google.com/maps/dir/?api=1&destination=${coordinate.latitude},${coordinate.longitude}`,
    });

    trackMapEvent("pin_navigation_started", {
      ...getPinKpi(selectedPin, logs),
    });

    Linking.openURL(url).catch(() => {
      const fallback = `https://www.google.com/maps/dir/?api=1&destination=${coordinate.latitude},${coordinate.longitude}`;

      Linking.openURL(fallback).catch(() => {
        Alert.alert("Navigation Error", "Could not open maps on this device.");
      });
    });
  }

  async function savePinSeasonState(nextResets, nextArchives) {
    setPinStatResets(nextResets);
    setPinSeasonArchives(nextArchives);

    try {
      await Promise.all([
        AsyncStorage.setItem(PIN_STAT_RESETS_KEY, JSON.stringify(nextResets)),
        AsyncStorage.setItem(PIN_SEASON_ARCHIVES_KEY, JSON.stringify(nextArchives)),
      ]);
    } catch {
      Alert.alert("Season Error", "Could not close the season. Please try again.");
    }
  }

  function closeSelectedPinSeason() {
    if (!selectedPin || !pinStats) return;

    Alert.alert(
      "Close Season?",
      `This will close the current season for "${selectedPin.title}". Current season stats will move to Last Season, current stats will restart at zero, and hunt logs will stay saved. This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Close Season",
          style: "destructive",
          onPress: () => {
            const closedAt = Date.now();

                        const pinLogIds = logs
              .filter((log) => log.pinId === selectedPin.id)
              .filter(isHuntLogEntry)
              .filter((log) => {
                const ts = getLogTimestamp(log);
                return pinStats.resetAt
                  ? ts >= pinStats.resetAt
                  : getLogYear(log) === pinStats.currentYear;
              })
              .map((log) => log.id)
              .filter(Boolean);

            const nextArchives = {
              ...pinSeasonArchives,
              [selectedPin.id]: {
                ...(pinSeasonArchives[selectedPin.id] || {}),
                lastSeason: {
                  closedAt,
                  pinId: selectedPin.id,
                  pinTitle: selectedPin.title,
                  pinType: selectedPin.type,
                  summary: pinStats.current,
                  logIds: pinLogIds,
                },
              },
            };

            const nextResets = {
              ...pinStatResets,
              [selectedPin.id]: closedAt,
            };

            trackMapEvent("pin_season_closed", {
              ...getPinKpi(selectedPin, logs),
              hunts: pinStats.current.hunts,
              ducks: pinStats.current.totalDucks,
            });

            savePinSeasonState(nextResets, nextArchives);
          },
        },
      ]
    );
  }

  function clearPropertySearchResults() {
    setPropertySearchResults(null);
    setSelectedPropertyFeatureId(null);
    setExpandedPropertyFeatureId(null);

    trackMapEvent("property_search_cleared", {
      ...getRegionAnalytics(region),
    });
  }

  function handlePropertySearchResults(result) {
    const featureCollection = normalizeFeatureCollection(result);

    if (!featureCollection || !featureCollection.features.length) {
      setPropertySearchResults(null);
      setSelectedPropertyFeatureId(null);
      setExpandedPropertyFeatureId(null);

      trackMapEvent("property_search_empty", {
        ...getRegionAnalytics(region),
      });

      return;
    }

    const firstFeature = featureCollection.features[0];
    const firstFeatureId = getPropertyFeatureId(firstFeature, 0);

    setPropertySearchResults(featureCollection);
    setSelectedPropertyFeatureId(firstFeatureId);
    setExpandedPropertyFeatureId(firstFeatureId);

    trackMapEvent("property_search_results_loaded", {
      resultsCount: featureCollection.features.length,
      ...getRegionAnalytics(region),
    });

    const nextRegion = getPropertyFeatureRegion(firstFeature);

    if (nextRegion) {
      setRegion(nextRegion);

      requestAnimationFrame(() => {
        mapRef.current?.animateToRegion(nextRegion, 650);
      });
    }
  }

function flashMapToolLabel(label, topOffset = 0) {
  if (!label) return;

  setMapToolLabel({
    text: label,
    top: topOffset,
  });

  if (mapToolLabelTimerRef.current) {
    clearTimeout(mapToolLabelTimerRef.current);
  }

  mapToolLabelTimerRef.current = setTimeout(() => {
    setMapToolLabel(null);
    mapToolLabelTimerRef.current = null;
  }, 950);
}

function flashToggleRefreshNotice() {
  setToggleRefreshNotice(true);

  if (toggleRefreshNoticeTimerRef.current) {
    clearTimeout(toggleRefreshNoticeTimerRef.current);
  }

  toggleRefreshNoticeTimerRef.current = setTimeout(() => {
    setToggleRefreshNotice(false);
    toggleRefreshNoticeTimerRef.current = null;
  }, 1800);
}

  function handlePropertyResultPress(feature, index) {
    const featureId = getPropertyFeatureId(feature, index);

    setSelectedPropertyFeatureId(featureId);
    setExpandedPropertyFeatureId((prev) => (prev === featureId ? null : featureId));

    trackMapEvent("property_result_selected", {
      index,
      featureId,
      ...getRegionAnalytics(region),
    });

    const nextRegion = getPropertyFeatureRegion(feature);

    if (nextRegion) {
      setRegion(nextRegion);

      requestAnimationFrame(() => {
        mapRef.current?.animateToRegion(nextRegion, 650);
      });
    }
  }

    const renderTypePicker = (value, onChange) => (
    <View style={localStyles.typeRow}>
      {PIN_TYPES.map((type) => {
        const active = value === type.key;

        return (
          <Pressable
            key={type.key}
            style={[localStyles.typeChip, active ? localStyles.typeChipActive : null]}
            onPress={() => onChange(type.key)}
          >
            <Text style={[localStyles.typeChipText, active ? localStyles.typeChipTextActive : null]}>
              {type.label || type.key}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

const renderMapToolButton = ({
  keyName,
  icon,
  active = false,
  disabled = false,
  onPress,
  label,
  displayLabel,
  labelTop = 0,
  showRefreshNotice = false,
}) => (

  <Pressable
    key={keyName}
    style={[
      localStyles.mapToolButton,
      active ? localStyles.mapToolButtonActive : null,
      disabled ? localStyles.mapToolButtonDisabled : null,
    ]}
    onPress={() => {
      flashMapToolLabel(displayLabel || label, labelTop);

if (showRefreshNotice) {
  flashToggleRefreshNotice();
}

if (typeof onPress === "function") onPress();
    }}
    disabled={disabled}
    accessibilityLabel={label}
    accessibilityRole="button"
  >
    <Text style={localStyles.mapToolIcon}>{icon}</Text>
  </Pressable>
);

  return (
    <ScreenBackground source={ASSETS?.backgrounds?.map || ASSETS?.backgrounds?.today}>
      <SafeAreaView style={localStyles.screen} edges={["left", "right"]}>
        <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

        <View
  style={localStyles.mapWrap}
  onTouchStart={() => {
  if (showPropertyHint) setShowPropertyHint(false);
  if (showPublicLandHint) setShowPublicLandHint(false);
  if (showWaterLevelHint) setShowWaterLevelHint(false);
}}
>

<MapView
  ref={mapRef}
  style={styles.map || localStyles.mapFallback}
  mapType={mapType}
  initialRegion={DEFAULT_REGION}
  region={region}
  onRegionChangeComplete={handleRegionChangeComplete}
  onPress={onMapPress}
  onLongPress={(e) => {
    const coordinate = e?.nativeEvent?.coordinate;

    if (coordinate && showParcels) {
      lookupParcelAtCoordinate(coordinate);
    }
  }}
            showsUserLocation={permissionState === "granted"}
            showsMyLocationButton={false}
            rotateEnabled={false}
            toolbarEnabled={false}
            moveOnMarkerPress={false}
            maxZoomLevel={showRadar ? 7 : 20}
          >
            {stateLinesGeojson ? (
              <Geojson
                geojson={stateLinesGeojson}
                strokeColor={STATE_LINE_COLOR}
                fillColor="rgba(0,0,0,0)"
                strokeWidth={3}
                zIndex={4}
              />
            ) : null}

          {selectedPropertyGeojson ? (
  <Geojson
    geojson={selectedPropertyGeojson}
    strokeColor="#FF7A00"
    fillColor="rgba(255,122,0,0.22)"
    strokeWidth={4}
    zIndex={6}
  />
) : null}

{showPublicLand && isPro && publicLandRegularGeojson && publicLandCount > 0 ? (
  <Geojson
    geojson={publicLandRegularGeojson}
    strokeColor="#FFD700"
    fillColor="rgba(57,255,20,0.32)"
    strokeWidth={5}
    zIndex={7}
  />
) : null}

{showPublicLand && isPro && publicLandWmaGeojson && publicWmaCount > 0 ? (
  <Geojson
    geojson={publicLandWmaGeojson}
    strokeColor="#89CFF0"
    fillColor="rgba(137,207,240,0.24)"
    strokeWidth={5}
    zIndex={8}
  />
) : null}

{measurePoints.length === 2 ? (
  <Polyline
    coordinates={measurePoints}
    strokeColor="#FFD700"
    strokeWidth={5}
    zIndex={9}
  />
) : null}

{measurePoints.map((point, index) => (
  <Marker
    key={`measure-point-${index}`}
    coordinate={point}
    pinColor="#FFD700"
    title=""
    description=""
    tappable={false}
    tracksViewChanges={false}
    zIndex={20}
  />
))}

{waypointLivePoints.length >= 2 ? (
  <Polyline
    coordinates={waypointLivePoints}
    strokeColor="#D9A84C"
    strokeWidth={5}
    lineDashPattern={[10, 8]}
    zIndex={10}
  />
) : null}

{showWaypoints && selectedWaypointCoordinates.length >= 2 ? (
  <Polyline
    coordinates={selectedWaypointCoordinates}
    strokeColor={followBackMode ? "#39FF14" : "#D9A84C"}
    strokeWidth={5}
    lineDashPattern={[10, 8]}
    zIndex={8}
  />
) : null}

{showWaypoints
  ? waypointPathPins.map((pathPin) => {
      const coordinates = getWaypointPathCoordinatesFromPin(pathPin);

      if (coordinates.length < 2) return null;

      const isSelectedPathPin = selectedPinId === pathPin.id;

      return (
        <Polyline
          key={`saved-path-line-${pathPin.id}`}
          coordinates={coordinates}
          strokeColor={isSelectedPathPin ? "#39FF14" : "#4DA3FF"}
          strokeWidth={isSelectedPathPin ? 6 : 4}
          lineDashPattern={[10, 8]}
          zIndex={isSelectedPathPin ? 11 : 7}
        />
      );
    })
  : null}

{showWaypoints && selectedWaypointCoordinates.length >= 1 ? (
  <Marker
    coordinate={selectedWaypointCoordinates[0]}
    title={followBackMode ? "Follow Back Start" : "Path Start"}
    pinColor={followBackMode ? "#39FF14" : "#D9A84C"}
  />
) : null}

{showWaypoints && selectedWaypointCoordinates.length >= 2 ? (
  <Marker
    coordinate={selectedWaypointCoordinates[selectedWaypointCoordinates.length - 1]}
    title={followBackMode ? "Original Start" : "Path End"}
    pinColor={followBackMode ? "#D9A84C" : "#39FF14"}
  />
) : null}

{propertySearchFeatures.map((feature, index) => {
  const coordinate = getPropertyFeatureCoordinate(feature);
  if (!coordinate) return null;

  const featureId = getPropertyFeatureId(feature, index);
  const props = feature?.properties || {};
  const isSelected = featureId === selectedPropertyFeatureId;

  return (
    <Marker
      key={`property-marker-${featureId}`}
      coordinate={coordinate}
      title={`${index + 1}. ${props.ducksmartOwner || "Property Result"}`}
      description={props.ducksmartAddress || props.headline || "Tap to view this parcel"}
      anchor={{ x: 0.5, y: 0.5 }}
      onPress={() => handlePropertyResultPress(feature, index)}
    >
      <View
        style={[
          localStyles.propertyMapMarker,
          isSelected ? localStyles.propertyMapMarkerSelected : null,
        ]}
      >
        <Text
          style={[
            localStyles.propertyMapMarkerText,
            isSelected ? localStyles.propertyMapMarkerTextSelected : null,
          ]}
        >
          {index + 1}
        </Text>
      </View>
    </Marker>
  );
})}

{showWaterLevels
  ? waterLevelStations.map((item) => {
      const coordinate = item?.coordinate;
      if (!coordinate?.latitude || !coordinate?.longitude) return null;

      const color = getWaterLevelMarkerColor(item);
      const icon = getWaterLevelMarkerIcon(item);
      const details = formatWaterLevelCallout(item)
        .split("\n")
        .filter(Boolean);

      return (
  <Marker
    key={item.id || `${item.source}-${item.stationId}`}
    coordinate={coordinate}
    anchor={{ x: 0.5, y: 0.5 }}
    title={Platform.OS === "ios" ? undefined : item.title || "Water Level"}
    description={
      Platform.OS === "ios"
        ? undefined
        : details.join(" • ")
    }
    onPress={(e) => {
      e?.stopPropagation?.();

      setSelectedWaterLevelStation(item);

      trackMapEvent("water_level_marker_selected", {
        source: item.source || "",
        stationId: item.stationId || "",
        kind: item.kind || "",
        type: item.type || "",
        ...getRegionAnalytics(region),
      });
    }}
  >
    <View style={[localStyles.waterLevelMarker, { borderColor: color }]}>
      <Text style={localStyles.waterLevelMarkerText}>{icon}</Text>
    </View>

    {Platform.OS === "ios" ? (
      <Callout tooltip={false}>
        <View style={localStyles.waterLevelCallout}>
          <Text style={localStyles.waterLevelCalloutTitle}>
            {item.title || "Water Level"}
          </Text>

          {details.map((line, index) => (
            <Text
              key={`${item.id || item.stationId}-water-detail-${index}`}
              style={
                index === 1
                  ? localStyles.waterLevelCalloutPrimary
                  : localStyles.waterLevelCalloutText
              }
            >
              {line}
            </Text>
          ))}
        </View>
      </Callout>
    ) : null}
    </Marker>
);
    })
  : null}

            {activePins.map((p) => {
              const isPathPin = isWaypointPathPin(p);

              if (!showWaypoints && isPathPin) return null;

              const coordinate = getPinCoordinate(p);
              if (!coordinate) return null;

              const pinType = PIN_TYPES.find((t) => t.key === p.type);
              const pinColor = isPathPin ? "#4DA3FF" : pinType?.color || GREEN;

              return (
                <Marker
                  key={p.id}
                  coordinate={coordinate}
                  title={p.title}
                  description={
  isPathPin
    ? `Mapped Path${p.notes ? ` • ${p.notes}` : ""}`
    : `${p.type}${p.notes ? ` • ${p.notes}` : ""}`
}
                  pinColor={pinColor}
                  onPress={(e) => {
  e?.stopPropagation?.();

  if (measureMode) {
  const coordinate = getPinCoordinate(p);

  ignoreNextMeasureMapPressUntilRef.current =
    Date.now() + MEASURE_MARKER_PRESS_SUPPRESS_MS;

  addMeasureCoordinate(coordinate, "pin");
  return;
}

  trackMapEvent("pin_selected", {
    source: "marker",
    ...getPinKpi(p, logs),
    hasDecoySpread: p.decoySpreadPlan ? 1 : 0,
  });

  setSelectedPinId(p.id);
  setIsAddMode(false);
  setDraftCoord(null);
  setIsEditingPin(false);
}}
                />
              );
            })}

            {isAddMode && draftCoord ? (
              <Marker coordinate={draftCoord} pinColor={GREEN} title="New Pin" />
            ) : null}

            {showRadar && radarTileUrl ? (
              <UrlTile
                urlTemplate={radarTileUrl}
                zIndex={1}
                opacity={0.7}
                minimumZ={0}
                maximumZ={7}
                maximumNativeZ={7}
                tileSize={256}
              />
            ) : null}

{showParcels && isPro && REGRID_TILE_URL ? (
  <UrlTile
    urlTemplate={REGRID_TILE_URL}
    zIndex={2}
    opacity={propertyTileOpacity}
    minimumZ={10}
    maximumZ={21}
    maximumNativeZ={21}
    tileSize={256}
  />
) : null}
         </MapView>

         {Platform.OS === "android" && selectedWaterLevelStation ? (
  <View style={localStyles.waterLevelAndroidInfoCard}>
    <View style={localStyles.waterLevelAndroidInfoHeader}>
      <Text style={localStyles.waterLevelAndroidInfoTitle} numberOfLines={2}>
        {selectedWaterLevelStation.title || "Water Level"}
      </Text>

      <Pressable onPress={() => setSelectedWaterLevelStation(null)}>
        <Text style={localStyles.waterLevelAndroidInfoClose}>✕</Text>
      </Pressable>
    </View>

    {formatWaterLevelCallout(selectedWaterLevelStation)
      .split("\n")
      .filter(Boolean)
      .map((line, index) => (
        <Text
          key={`android-water-info-${selectedWaterLevelStation.id || selectedWaterLevelStation.stationId}-${index}`}
          style={
            index === 1
              ? localStyles.waterLevelAndroidInfoPrimary
              : localStyles.waterLevelAndroidInfoText
          }
        >
          {line}
        </Text>
      ))}
  </View>
) : null}

{!hideMapToolsForSheet ? (
  <View style={localStyles.mapToolRail}>
    {renderMapToolButton({
      keyName: "map-type",
      icon: "🛰️",
      active: mapType !== "standard",
      onPress: toggleMapType,
      label: "Change map type",
      displayLabel: "Satellite Map",
      labelTop: 0,
      showRefreshNotice: true,
    })}

    {renderMapToolButton({
      keyName: "radar",
      icon: "🌧️",
      active: showRadar,
      onPress: toggleRadar,
      label: showRadar ? "Hide radar" : "Show radar",
      displayLabel: "Radar",
      labelTop: 53,
      showRefreshNotice: true,
    })}

    {renderMapToolButton({
      keyName: "regrid",
      icon: "▦",
      active: showParcels,
      onPress: toggleParcels,
      label: showParcels ? "Hide property lines" : "Show property lines",
      displayLabel: "Property Lines",
      labelTop: 106,
      showRefreshNotice: true,
    })}

    {renderMapToolButton({
      keyName: "public-land",
      icon: "🟨",
      active: showPublicLand,
      disabled: publicLandLoading,
      onPress: togglePublicLand,
      label: showPublicLand ? "Hide public land" : "Show public land",
      displayLabel: "Public Lands",
      labelTop: 159,
      showRefreshNotice: true,
    })}

    {renderMapToolButton({
  keyName: "water-levels",
  icon: "💧",
  active: showWaterLevels,
  disabled: waterLevelLoading,
  onPress: toggleWaterLevels,
  label: showWaterLevels ? "Hide water levels" : "Show water levels",
  displayLabel: "Water Levels",
  labelTop: 212,
  showRefreshNotice: true,
})}

    {renderMapToolButton({
      keyName: "add-pin",
      icon: "📍",
      active: isAddMode,
      onPress: startAddPin,
      label: "Add pin",
      displayLabel: "Add Pin",
      labelTop: 265,
    })}

    {renderMapToolButton({
      keyName: "map-path",
      icon: "👣",
      active: waypointMode,
      disabled: waypointSaving,
      onPress: toggleWaypointMapping,
      label: waypointMode ? "Stop mapping my path" : "Start mapping my path",
      displayLabel: waypointMode ? "Stop Path" : "Map Path",
      labelTop: 318,
    })}

    {renderMapToolButton({
      keyName: "show-waypoints",
      icon: "🧭",
      active: showWaypoints,
      onPress: () => setShowWaypoints((prev) => !prev),
      label: showWaypoints ? "Hide waypoints" : "Show waypoints",
      displayLabel: showWaypoints ? "Hide Paths" : "Show Paths",
      labelTop: 371,
    })}

    {renderMapToolButton({
      keyName: "measure",
      icon: "📏",
      active: measureMode,
      onPress: toggleMeasureMode,
      label: measureMode ? "Turn off measuring" : "Turn on measuring",
      displayLabel: "Measure",
      labelTop: 424,
      showRefreshNotice: true,
    })}

    {renderMapToolButton({
      keyName: "my-location",
      icon: "🎯",
      disabled: !userLoc,
      onPress: goToUser,
      label: "Go to my location",
      displayLabel: "My Location",
      labelTop: 477,
    })}
  </View>
) : null}

{mapToolLabel && !hideMapToolsForSheet ? (
  <View
    pointerEvents="none"
    style={[
      localStyles.mapToolLabelBubble,
      { top: (Platform.OS === "ios" ? 54 : 34) + mapToolLabel.top + 5 },
    ]}
  >
    <Text style={localStyles.mapToolLabelText}>{mapToolLabel.text}</Text>
  </View>
) : null}

{toggleRefreshNotice && !hideMapToolsForSheet ? (
  <View pointerEvents="none" style={localStyles.toggleRefreshNotice}>
    <Text style={localStyles.toggleRefreshNoticeText}>
      Turn Toggles On/Off to Refresh
    </Text>
  </View>
) : null}

{waypointMode || waypointStatus ? (
  <View style={localStyles.waypointBadge}>
    <Text style={localStyles.waypointBadgeText}>
      {waypointStatus ||
        `Mapping path... ${waypointLivePoints.length} points`}
    </Text>
  </View>
) : null}

{showWaypoints && selectedWaypointPath && sheetIndex === SNAP_COLLAPSED && !selectedPin ? (
  <View
    style={[
      localStyles.waypointSelectedBadge,
      {
        bottom: sheetIndex === SNAP_COLLAPSED ? 138 : 306,
      },
    ]}
  >
    <Text style={localStyles.waypointBadgeText} numberOfLines={1}>
      {followBackMode ? "Follow Back: " : "Path: "}
      {getWaypointSummary(selectedWaypointPath).distanceText}
    </Text>

    <Pressable onPress={() => setFollowBackMode((prev) => !prev)}>
      <Text style={localStyles.waypointBadgeAction}>
        {followBackMode ? "Normal" : "Back"}
      </Text>
    </Pressable>

    <Pressable
      onPress={() => {
        setSelectedWaypointPathId(null);
        setFollowBackMode(false);
      }}
    >
      <Text style={localStyles.waypointBadgeClose}>✕</Text>
    </Pressable>
  </View>
) : null}

          {showParcels && showPropertyHint ? (
  <View pointerEvents="none" style={localStyles.propertyHintBubble}>
    <Text style={localStyles.propertyHintText}>
      Long Press a Property to Display Owner Details
    </Text>
  </View>
) : null}

{showPublicLand && showPublicLandHint && isPro ? (
  <View pointerEvents="none" style={localStyles.publicLandHintBubble}>
    <Text style={localStyles.publicLandHintText}>
      Public Lands appear in{" "}
      <Text style={localStyles.publicLandYellowText}>yellow</Text>
      {" "}and Wildlife Management Areas appear in{" "}
      <Text style={localStyles.publicLandBlueText}>blue</Text>.
    </Text>

    <Text style={localStyles.publicLandHintSubText}>
      Toggle on and off to reload results.
    </Text>
  </View>
) : null}

{showPublicLand && isPro ? (
  <View style={localStyles.publicLandCountBadge}>
    <Text style={localStyles.publicLandCountText}>
      Public: {publicLandCount}
      {publicWmaCount > 0 ? ` • WMA: ${publicWmaCount}` : ""}
    </Text>
  </View>
) : null}

{showWaterLevels && showWaterLevelHint ? (
  <View pointerEvents="none" style={localStyles.waterLevelHintBubble}>
    <Text style={localStyles.waterLevelHintText}>
      Water Levels show nearby USGS freshwater gauges and NOAA tide stations.
    </Text>

    <Text style={localStyles.waterLevelHintSubText}>
      Tap a blue water marker to view current level details.
    </Text>
  </View>
) : null}

{showWaterLevels ? (
  <View
    style={[
      localStyles.waterLevelCountBadge,
      {
        top:
          showPublicLand && isPro
            ? Platform.OS === "ios"
              ? 164
              : 158
            : Platform.OS === "ios"
              ? 132
              : 126,
      },
    ]}
  >
    <Text style={localStyles.waterLevelCountText}>
      Water: {waterLevelStations.length}
    </Text>
  </View>
) : null}

{measureMode || measureLabel ? (
  <View style={localStyles.measureBadge}>
    <Text style={localStyles.measureBadgeText}>
      {measureLabel || "Touch Map or Select Pin"}
    </Text>

  {measureMode && userLoc ? (
  <Pressable
    style={localStyles.measureUseLocationBtn}
    onPress={() => addMeasureCoordinate(userLoc, "current_location")}
  >
    <Text style={localStyles.measureUseLocationText}>
      {measurePoints.length === 1 ? "User 📍 to End" : "User 📍 to Start"}
    </Text>
  </Pressable>
) : null}

    <Pressable onPress={clearMeasure}>
      <Text style={localStyles.measureBadgeClose}>✕</Text>
    </Pressable>
  </View>
) : null}


          {showParcels && isPro && REGRID_TILE_URL ? (
            <Pressable
              style={[
                localStyles.propertySearchFloatingBtn,
                propertySearchVisible ? localStyles.propertySearchFloatingBtnActive : null,
              ]}
              onPress={() => {
                setPropertySearchVisible((prev) => !prev);

                trackMapEvent("property_search_button_toggled", {
                  nextVisible: propertySearchVisible ? 0 : 1,
                  ...getRegionAnalytics(region),
                });
              }}
              accessibilityLabel={
                propertySearchVisible ? "Hide property search" : "Show property search"
              }
              accessibilityRole="button"
            >
              <Text style={localStyles.propertySearchFloatingBtnText}>🔍</Text>
            </Pressable>
          ) : null}

          {propertySearchFeatures.length > 0 ? (
            <View
  style={[
    localStyles.propertyResultsPanel,
    {
      bottom: sheetIndex === SNAP_COLLAPSED ? 218 : 292,
    },
  ]}
>
              <View style={localStyles.propertyResultsHeader}>
                <View>
                  <Text style={localStyles.propertyResultsTitle}>Property Results</Text>
                  <Text style={localStyles.propertyResultsSub}>
                    Tap a row to center and view details
                  </Text>
                </View>

                <Pressable style={localStyles.propertyResultsClose} onPress={clearPropertySearchResults}>
                  <Text style={localStyles.overlayBadgeClose}>✕</Text>
                </Pressable>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                {propertySearchFeatures.map((feature, index) => {
                  const featureId = getPropertyFeatureId(feature, index);
                  const props = feature?.properties || {};
                  const isSelected = featureId === selectedPropertyFeatureId;
                  const isExpanded = featureId === expandedPropertyFeatureId;
                  const detailRows = getPropertyDetailRows(feature);

                  return (
                    <Pressable
                      key={featureId}
                      style={[
                        localStyles.propertyResultRow,
                        isSelected ? localStyles.propertyResultRowSelected : null,
                      ]}
                      onPress={() => handlePropertyResultPress(feature, index)}
                      accessibilityLabel={`Open property result ${index + 1}`}
                      accessibilityRole="button"
                    >
                      <View style={localStyles.propertyResultTopRow}>
                        <View style={localStyles.propertyResultNumberBubble}>
                          <Text style={localStyles.propertyResultNumberText}>{index + 1}</Text>
                        </View>

                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={localStyles.propertyResultOwner} numberOfLines={1}>
                            {props.ducksmartOwner || getParcelValue(feature, ["owner", "owner_name"]) || "Owner not listed"}
                          </Text>
                          <Text style={localStyles.propertyResultAddress} numberOfLines={2}>
                            {props.ducksmartAddress || props.headline || "Address not listed"}
                          </Text>
                        </View>

                        <Text style={localStyles.propertyResultChevron}>
                          {isExpanded ? "⌃" : "›"}
                        </Text>
                      </View>

                      {isExpanded ? (
                        <View style={localStyles.propertyResultDetails}>
                          {detailRows.map((row) => (
                            <View
                              key={`${featureId}-${row.label}`}
                              style={localStyles.propertyResultDetailRow}
                            >
                              <Text style={localStyles.propertyResultDetailLabel}>
                                {row.label}
                              </Text>
                              <Text style={localStyles.propertyResultDetailValue}>
                                {row.value}
                              </Text>
                            </View>
                          ))}
                        </View>
                      ) : null}
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          ) : null}

                    <PropertySearchBar
            visible={propertySearchVisible && showParcels && isPro && !!REGRID_TILE_URL}
            onClose={() => setPropertySearchVisible(false)}
            onResults={handlePropertySearchResults}
            onClear={clearPropertySearchResults}
          />

          {showRadar ? (
            <View
              style={[
                localStyles.overlayBadge,
                { bottom: showParcels ? overlayBadgeBottom + 42 : overlayBadgeBottom },
              ]}
            >
              <Text style={localStyles.overlayBadgeText}>🌧 Radar</Text>

              <Pressable onPress={() => closeRadar("badge")}>
                <Text style={localStyles.overlayBadgeClose}>✕</Text>
              </Pressable>
            </View>
          ) : null}

          {showParcels && isPro ? (
            <View style={[localStyles.overlayBadge, { bottom: overlayBadgeBottom }]}>
              <Text style={localStyles.overlayBadgeText}>▦ Property Lines</Text>

              <Pressable
                onPress={() => {
                  trackMapEvent("property_lines_disabled", {
                    source: "badge",
                    ...getRegionAnalytics(region),
                  });

                  setShowParcels(false);
                  setPropertySearchResults(null);
                  setSelectedPropertyFeatureId(null);
                  setExpandedPropertyFeatureId(null);
                  setPropertySearchVisible(false);
                }}
              >
                <Text style={localStyles.overlayBadgeClose}>✕</Text>
              </Pressable>
            </View>
          ) : null}

          <BottomSheet
  ref={bottomSheetRef}
  index={SNAP_COLLAPSED}
  snapPoints={snapPoints}
  onChange={handleSheetChange}
  backgroundStyle={localStyles.bottomSheetBg}
  handleIndicatorStyle={localStyles.bottomSheetHandle}
  style={localStyles.bottomSheetContainer}
  enableDynamicSizing={false}
>

            <BottomSheetScrollView
              contentContainerStyle={[
                localStyles.bottomSheetContent,
                localStyles.bottomSheetContentPad,
              ]}
              keyboardShouldPersistTaps="handled"
            >
              {isAddMode ? (
                <>
                  <Text style={styles.sheetTitle || localStyles.sheetTitle}>
                    Add Map Pin
                  </Text>

                  <Text style={localStyles.sectionLabel}>Pin Type</Text>
                  {renderTypePicker(draftType, setDraftType)}

                  <Text style={localStyles.sectionLabel}>Title</Text>
                  <TextInput
                    value={draftTitle}
                    onChangeText={setDraftTitle}
                    placeholder={`${draftType} Pin`}
                    placeholderTextColor="rgba(255,255,255,0.35)"
                    style={localStyles.input}
                  />

                  <Text style={localStyles.sectionLabel}>Notes</Text>
                  <TextInput
  value={draftNotes}
  onChangeText={setDraftNotes}
  placeholder="Add scouting notes..."
  placeholderTextColor="rgba(255,255,255,0.35)"
  style={[localStyles.input, localStyles.textArea]}
  multiline
  returnKeyType="done"
  blurOnSubmit
  onSubmitEditing={Keyboard.dismiss}
/>

                  <View style={localStyles.addCoordBox}>
                    <Text style={localStyles.coordTitle}>
                      {draftCoord ? "Pin location selected" : "Tap the map to place this pin"}
                    </Text>
                    <Text style={localStyles.coordText}>
                      {draftCoord
                        ? `${draftCoord.latitude.toFixed(6)}, ${draftCoord.longitude.toFixed(6)}`
                        : "No GPS location yet"}
                    </Text>
                  </View>

                  <View style={localStyles.actionRow}>
                    <Pressable style={localStyles.actionButtonAlt} onPress={cancelAddPin}>
                      <Text style={localStyles.actionButtonText}>Cancel</Text>
                    </Pressable>

                    <Pressable style={localStyles.actionButton} onPress={savePin}>
                      <Text style={localStyles.actionButtonText}>Save Pin</Text>
                    </Pressable>
                  </View>
                </>
              ) : selectedPin ? (
                <>
                  {isEditingPin ? (
                    <>
                      <Text style={styles.sheetTitle || localStyles.sheetTitle}>
                        Edit Pin
                      </Text>

                      <Text style={localStyles.sectionLabel}>Pin Type</Text>
                      {renderTypePicker(editType, setEditType)}

                      <Text style={localStyles.sectionLabel}>Title</Text>
                      <TextInput
                        value={editTitle}
                        onChangeText={setEditTitle}
                        placeholder={`${editType} Pin`}
                        placeholderTextColor="rgba(255,255,255,0.35)"
                        style={localStyles.input}
                      />

                      <Text style={localStyles.sectionLabel}>Notes</Text>
                      <TextInput
                        value={editNotes}
                        onChangeText={setEditNotes}
                        placeholder="Add scouting notes..."
                        placeholderTextColor="rgba(255,255,255,0.35)"
                        style={[localStyles.input, localStyles.textArea]}
                        multiline
                      />

                      <View style={localStyles.actionRow}>
                        <Pressable style={localStyles.actionButtonAlt} onPress={cancelEditSelectedPin}>
                          <Text style={localStyles.actionButtonText}>Cancel</Text>
                        </Pressable>

                        <Pressable style={localStyles.actionButton} onPress={saveEditedPin}>
                          <Text style={localStyles.actionButtonText}>Save</Text>
                        </Pressable>
                      </View>

                      <Pressable style={localStyles.deleteSmallBtn} onPress={deleteSelectedPin}>
                        <Text style={localStyles.actionButtonDangerText}>Delete Pin</Text>
                      </Pressable>
                    </>
                  ) : (
                    <>
                      <View style={localStyles.pinDetailHeader}>
                        <View style={{ flex: 1 }}>
                          <Text style={localStyles.pinDetailTitle}>
                            {selectedPin.title}
                          </Text>
                          <Text style={localStyles.pinDetailMeta}>
                            {selectedPin.type} • {selectedPin.coordinate.latitude.toFixed(5)},{" "}
                            {selectedPin.coordinate.longitude.toFixed(5)}
                          </Text>
                        </View>

                        <Pressable style={localStyles.backToListBtn} onPress={backToPinList}>
  <Text style={localStyles.backToListText}>‹ Pins</Text>
</Pressable>
                      </View>

                      {selectedPin.notes ? (
                        <Text style={localStyles.pinDetailNotes}>{selectedPin.notes}</Text>
                      ) : (
                        <Text style={localStyles.pinDetailNotesMuted}>No notes yet.</Text>
                      )}

                      {pinStats ? (
                        <View style={localStyles.statsCard}>
                          <View style={localStyles.statHeaderRow}>
                            <View>
                              <Text style={localStyles.statTitle}>Spot History</Text>
                              <Text style={localStyles.statSub}>
                                Stats linked to this pin
                              </Text>
                            </View>

                            
                          </View>

                          <View style={localStyles.statPeriodBlock}>
                            <Text style={localStyles.statPeriodTitle}>
                              Current Season
                              {pinStats.resetAt ? ` since ${formatResetDate(pinStats.resetAt)}` : ""}
                            </Text>

                            <View style={localStyles.statsGrid}>
                              <View style={localStyles.statItem}>
                                <Text style={localStyles.statValue}>{pinStats.current.hunts}</Text>
                                <Text style={localStyles.statLabel}>Hunts</Text>
                              </View>

                              <View style={localStyles.statItem}>
                                <Text style={[localStyles.statValue, { color: GREEN }]}>
                                  {pinStats.current.totalDucks}
                                </Text>
                                <Text style={localStyles.statLabel}>Ducks</Text>
                              </View>

                              <View style={localStyles.statItem}>
                                <Text style={localStyles.statValue}>
                                  {pinStats.current.avgPerHunter}
                                </Text>
                                <Text style={localStyles.statLabel}>Per Hunter</Text>
                              </View>

                              <View style={localStyles.statItem}>
                                <Text style={[localStyles.statValue, { color: HUNT_TAN }]}>
                                  {pinStats.current.avgScore}
                                </Text>
                                <Text style={localStyles.statLabel}>Avg Score</Text>
                              </View>
                            </View>
                          </View>

                          <View style={localStyles.statPeriodBlock}>
                            <Text style={localStyles.statPeriodTitle}>
                              {pinStats.lastSeasonClosedAt
                                ? `Last Season (closed ${formatResetDate(pinStats.lastSeasonClosedAt)})`
                                : `Last Season (${pinStats.lastYear})`}
                            </Text>

                            <View style={localStyles.statsGrid}>
                              <View style={localStyles.statItem}>
                                <Text style={localStyles.statValue}>{pinStats.previous.hunts}</Text>
                                <Text style={localStyles.statLabel}>Hunts</Text>
                              </View>

                              <View style={localStyles.statItem}>
                                <Text style={[localStyles.statValue, { color: GREEN }]}>
                                  {pinStats.previous.totalDucks}
                                </Text>
                                <Text style={localStyles.statLabel}>Ducks</Text>
                              </View>

                              <View style={localStyles.statItem}>
                                <Text style={localStyles.statValue}>
                                  {pinStats.previous.avgPerHunter}
                                </Text>
                                <Text style={localStyles.statLabel}>Per Hunter</Text>
                              </View>

                              <View style={localStyles.statItem}>
                                <Text style={[localStyles.statValue, { color: HUNT_TAN }]}>
                                  {pinStats.previous.avgScore}
                                </Text>
                                <Text style={localStyles.statLabel}>Avg Score</Text>
                              </View>
                            </View>
                          </View>
                        </View>
                      ) : null}

                                            {selectedPinHuntLogs.length > 0 ? (
                        <View style={localStyles.recentHuntsCard}>
                          <Text style={localStyles.recentHuntsTitle}>Recent Hunts Here</Text>

                          {selectedPinHuntLogs.map((log) => (
                            <View key={log.id || `${log.dateTime}-${log.createdAt}`} style={localStyles.recentHuntRow}>
                              <Text style={localStyles.recentHuntDate}>
                                {formatLogDate(log)}
                              </Text>
                              <Text style={localStyles.recentHuntMeta}>
                                {(log.ducksHarvested || 0)} ducks • {(log.hunters || 1)} hunters • Score{" "}
                                {log.huntScore || 0}
                              </Text>
                            </View>
                          ))}
                        </View>
                      ) : null}

                      {selectedPinScoutLogs.length > 0 ? (
                        <View style={localStyles.recentHuntsCard}>
                          <Text style={localStyles.recentHuntsTitle}>Recent Scout Reports Here</Text>

                          {selectedPinScoutLogs.map((log) => (
                            <View key={log.id || `${log.dateTime}-${log.createdAt}`} style={localStyles.recentHuntRow}>
                              <Text style={localStyles.recentHuntDate}>
                                {formatLogDate(log)}
                              </Text>
                              <Text style={localStyles.recentHuntMeta}>
                                Scout • {getScoutLogSummary(log)}
                              </Text>
                            </View>
                          ))}
                        </View>
                      ) : null}

{selectedPinIsWaypointPath && selectedPinWaypointPath ? (
  <View style={localStyles.pinActionGrid}>
    <Pressable
      style={localStyles.pinActionBtn}
      onPress={() => showWaypointPath(selectedPinWaypointPath)}
    >
      <Text style={localStyles.pinActionBtnText}>Show Path</Text>
    </Pressable>

    <Pressable
      style={localStyles.pinActionBtn}
      onPress={() => followWaypointPathBack(selectedPinWaypointPath)}
    >
      <Text style={localStyles.pinActionBtnText}>Follow Back</Text>
    </Pressable>

    <Pressable
      style={localStyles.pinActionBtn}
      onPress={() => centerOnPin(selectedPin)}
    >
      <Text style={localStyles.pinActionBtnText}>Center</Text>
    </Pressable>

    <Pressable
      style={[
        localStyles.pinActionBtn,
        sharingPin ? localStyles.pinActionBtnDisabled : null,
      ]}
      onPress={shareSelectedPin}
      disabled={sharingPin}
    >
      <Text style={localStyles.pinActionBtnText}>
        {sharingPin ? "Sharing..." : "Share Path"}
      </Text>
    </Pressable>

    <Pressable
      style={[localStyles.pinActionBtn, localStyles.pinActionDanger]}
      onPress={() => {
        const pathId =
          selectedPinWaypointPath?.id ||
          selectedPin?.waypointPathId ||
          selectedPin?.waypointPath?.id;

        if (!pathId) {
          Alert.alert("Delete Failed", "This mapped path is missing its path ID.");
          return;
        }

        Alert.alert(
          "Delete Mapped Path?",
          `Delete "${selectedPin.title}"?`,
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Delete",
              style: "destructive",
              onPress: () => removeWaypointPath(pathId),
            },
          ]
        );
      }}
    >
      <Text style={localStyles.pinActionDangerText}>Delete Path</Text>
    </Pressable>
  </View>
) : (
  <View style={localStyles.pinActionGrid}>
    <Pressable style={localStyles.pinActionBtn} onPress={startEditSelectedPin}>
      <Text style={localStyles.pinActionBtnText}>Edit Notes</Text>
    </Pressable>

    <Pressable style={localStyles.pinActionBtn} onPress={addHuntForSelectedPin}>
      <Text style={localStyles.pinActionBtnText}>Add Hunt</Text>
    </Pressable>

    <Pressable style={localStyles.pinActionBtn} onPress={() => centerOnPin(selectedPin)}>
      <Text style={localStyles.pinActionBtnText}>Center</Text>
    </Pressable>

    <Pressable
      style={localStyles.pinActionBtn}
      onPress={() => measureCurrentLocationToPin(selectedPin)}
    >
      <Text style={localStyles.pinActionBtnText}>Distance</Text>
    </Pressable>

    <Pressable
      style={[
        localStyles.pinActionBtn,
        sharingPin ? localStyles.pinActionBtnDisabled : null,
      ]}
      onPress={shareSelectedPin}
      disabled={sharingPin}
    >
      <Text style={localStyles.pinActionBtnText}>
        {sharingPin ? "Sharing..." : "Share Pin"}
      </Text>
    </Pressable>

    <Pressable
      style={[localStyles.pinActionBtn, localStyles.pinActionPrimary]}
      onPress={navigateToPin}
    >
      <Text style={[localStyles.pinActionBtnText, localStyles.pinActionPrimaryText]}>
        Navigate
      </Text>
    </Pressable>
  </View>
)}
                    </>
                  )}
                </>
              ) : (
                <>
                  <Pressable
                    onPress={() => {
                      trackMapEvent("pin_sheet_peek_opened", {
                        pinsCount: activePins.length,
                      });
                      bottomSheetRef.current?.snapToIndex(SNAP_PEEK);
                    }}
                  >
                    <Text style={[styles.sheetTitle || localStyles.sheetTitle, { textAlign: "center" }]}>
  {isPro
    ? `${normalPinRows.length} Pins`
    : `${normalPinRows.length}/${FREE_PIN_LIMIT} Pins`}
</Text>
                  </Pressable>

  <>
  <View style={{ marginTop: 8 }}>
    <RowHeader
  title="Pins"
  pill={
    isPro
      ? `${normalPinRows.length} saved`
      : `${normalPinRows.length}/${FREE_PIN_LIMIT}`
  }
/>
  </View>

  <View style={localStyles.pinVerticalList}>
    {normalPinRows.map((p) => {
      const pinType = PIN_TYPES.find((t) => t.key === p.type);
      const dotColor = pinType?.color || GREEN;

      return (
        <Pressable
          key={p.id}
          style={localStyles.pinRow}
          onPress={() => {
            trackMapEvent("pin_selected_from_list", {
              source: "bottom_sheet_list",
              ...getPinKpi(p, logs),
            });

            setSelectedPinId(p.id);
            setIsEditingPin(false);
            centerOnPin(p);
          }}
        >
          <View style={[localStyles.pinDot, { backgroundColor: dotColor }]} />

          <View style={{ flex: 1 }}>
            <Text style={localStyles.pinRowTitle} numberOfLines={1}>
              {p.title}
            </Text>
            <Text style={localStyles.pinRowMeta} numberOfLines={1}>
              {p.type} • {p.coordinate.latitude.toFixed(5)},{" "}
              {p.coordinate.longitude.toFixed(5)}
            </Text>
          </View>

          <Text style={localStyles.pinRowChevron}>›</Text>
        </Pressable>
      );
    })}
  </View>

{mappedPathRows.length > 0 ? (
  <View style={{ marginTop: 16 }}>
    <RowHeader
      title="Mapped Paths"
      pill={`${mappedPathRows.length} saved`}
    />

    <View style={localStyles.pinVerticalList}>
      {mappedPathRows.map(({ id, path, summary }, index) => (
        <Pressable
          key={`mapped-path-${id}-${index}`}
          style={localStyles.pinRow}
          onPress={() => openWaypointPathAsPin(path)}
        >
          <View style={[localStyles.pinDot, { backgroundColor: "#4DA3FF" }]} />

          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={localStyles.pinRowTitle} numberOfLines={1}>
              {summary.title}
            </Text>

            <Text style={localStyles.pinRowMeta} numberOfLines={1}>
              Path • {summary.distanceText} • {summary.pointCount} points
            </Text>
          </View>

          <Pressable
            style={localStyles.waypointDeleteBtn}
            onPress={(e) => {
              e?.stopPropagation?.();

              Alert.alert(
                "Delete Mapped Path?",
                `Delete "${summary.title}"?`,
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Delete",
                    style: "destructive",
                    onPress: () => removeWaypointPath(path.id || id),
                  },
                ]
              );
            }}
          >
            <Text style={localStyles.waypointDeleteText}>✕</Text>
          </Pressable>
        </Pressable>
      ))}
    </View>
  </View>
) : null}

  <Text style={styles.sheetHint || localStyles.sheetHint}>
    {!isPro && activePins.length >= FREE_PIN_LIMIT ? (
      "Pin limit reached — upgrade to Pro for unlimited pins."
    ) : (
      <>
        Tap{" "}
        <Text style={{ color: HUNT_TAN, fontWeight: "900" }}>
          Add Pin
        </Text>{" "}
        to add a scouting pin, or tap a marker to view details.
      </>
    )}
  </Text>
</>
                </>
              )}

              <Text style={localStyles.privacyDisclaimer}>
                Your map pins and hunt log data are never shared or sold.
              </Text>
            </BottomSheetScrollView>
          </BottomSheet>
        </View>
      </SafeAreaView>
    </ScreenBackground>
  );
}

const localStyles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  mapWrap: {
    flex: 1,
    overflow: "hidden",
  },
  mapFallback: {
    flex: 1,
  },
    mapToolRail: {
    position: "absolute",
    top: Platform.OS === "ios" ? 54 : 34,
    left: 10,
    zIndex: 6,
    gap: 9,
  },
  mapToolButton: {
  width: 44,
  height: 44,
  borderRadius: 22,
  backgroundColor: "rgba(30, 144, 255, 0.28)",
  borderWidth: 1,
  borderColor: "rgba(173, 216, 255, 0.55)",
  alignItems: "center",
  justifyContent: "center",
},
  mapToolButtonActive: {
    backgroundColor: "rgba(217,168,76,0.82)",
    borderColor: HUNT_TAN,
  },
  mapToolButtonDisabled: {
    opacity: 0.45,
  },
  mapToolIcon: {
    fontSize: 21,
    fontWeight: "900",
  },
mapToolLabelBubble: {
  position: "absolute",
  left: 64,
  zIndex: 7,
  paddingVertical: 8,
  paddingHorizontal: 12,
  borderRadius: 999,
  backgroundColor: "rgba(30, 144, 255, 0.78)",
  borderWidth: 1,
  borderColor: "rgba(173, 216, 255, 0.8)",
},
waterLevelAndroidInfoCard: {
  position: "absolute",
  left: 14,
  right: 14,
  top: Platform.OS === "android" ? 92 : 104,
  zIndex: 120,
  elevation: 120,
  paddingVertical: 12,
  paddingHorizontal: 14,
  borderRadius: 16,
  backgroundColor: WHITE,
  borderWidth: 1,
  borderColor: "#4DA3FF",
  shadowColor: "#000",
  shadowOpacity: 0.35,
  shadowRadius: 8,
},
waterLevelAndroidInfoHeader: {
  flexDirection: "row",
  alignItems: "flex-start",
  gap: 10,
  marginBottom: 6,
},
waterLevelAndroidInfoTitle: {
  flex: 1,
  color: HUNT_BROWN_DEEP,
  fontSize: 14,
  fontWeight: "900",
},
waterLevelAndroidInfoClose: {
  color: "#0077CC",
  fontSize: 16,
  fontWeight: "900",
},
waterLevelAndroidInfoPrimary: {
  color: "#0077CC",
  fontSize: 13,
  fontWeight: "900",
  marginTop: 3,
},
waterLevelAndroidInfoText: {
  color: HUNT_BROWN_DEEP,
  fontSize: 12,
  fontWeight: "700",
  marginTop: 3,
  lineHeight: 16,
},
mapToolLabelText: {
  color: WHITE,
  fontSize: 12,
  fontWeight: "900",
},
bottomSheetContainer: {
  zIndex: 80,
  elevation: 80,
},
  bottomSheetBg: {
    backgroundColor: HUNT_BROWN,
    borderTopWidth: 1,
    borderTopColor: HUNT_BORDER,
  },
  bottomSheetHandle: {
    backgroundColor: HUNT_TAN,
    width: 44,
  },
  bottomSheetContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },
    propertySearchFloatingBtn: {
    position: "absolute",
    top: Platform.OS === "ios" ? 174 : 168,
    right: 12,
    zIndex: 11,
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "rgba(22,14,9,0.92)",
    borderWidth: 1,
    borderColor: HUNT_BORDER,
    alignItems: "center",
    justifyContent: "center",
  },
publicLandFloatingBtn: {
  position: "absolute",
  top: Platform.OS === "ios" ? 82 : 76,
  right: 12,
  zIndex: 14,
  minWidth: 72,
  height: 44,
  paddingHorizontal: 10,
  borderRadius: 14,
  backgroundColor: "rgba(22,14,9,0.92)",
  borderWidth: 1,
  borderColor: HUNT_BORDER,
  alignItems: "center",
  justifyContent: "center",
},
publicLandFloatingBtnActive: {
  backgroundColor: "rgba(57,255,20,0.18)",
  borderColor: "#39FF14",
},
publicLandFloatingBtnDisabled: {
  opacity: 0.55,
},
publicLandFloatingBtnText: {
  color: HUNT_TAN,
  fontSize: 13,
  fontWeight: "900",
},
measureFloatingBtn: {
  position: "absolute",
  top: Platform.OS === "ios" ? 82 : 76,
  left: 12,
  zIndex: 14,
  minWidth: 82,
  height: 44,
  paddingHorizontal: 10,
  borderRadius: 14,
  backgroundColor: "rgba(22,14,9,0.92)",
  borderWidth: 1,
  borderColor: HUNT_BORDER,
  alignItems: "center",
  justifyContent: "center",
},
measureFloatingBtnActive: {
  backgroundColor: HUNT_TAN_SOFT,
  borderColor: HUNT_TAN,
},
measureFloatingBtnText: {
  color: HUNT_TAN,
  fontSize: 13,
  fontWeight: "900",
},
measureBadge: {
  position: "absolute",
  top: Platform.OS === "ios" ? 132 : 126,
  left: 12,
  zIndex: 14,
  flexDirection: "row",
  alignItems: "center",
  gap: 8,
  paddingVertical: 8,
  paddingHorizontal: 11,
  borderRadius: 999,
  backgroundColor: "rgba(22,14,9,0.94)",
  borderWidth: 1,
  borderColor: HUNT_TAN,
},
measureBadgeText: {
  color: WHITE,
  fontSize: 12,
  fontWeight: "900",
},
measureBadgeClose: {
  color: HUNT_TAN,
  fontSize: 13,
  fontWeight: "900",
},
  propertySearchFloatingBtnActive: {
    backgroundColor: HUNT_TAN_SOFT,
    borderColor: HUNT_TAN,
  },
propertySearchFloatingBtnText: {
  color: HUNT_TAN,
  fontSize: 28,
  fontWeight: "900",
  lineHeight: 32,
},
  bottomSheetContentPad: {
  paddingBottom: Platform.OS === "android" ? 190 : 170,
},
  mapTopBarFixed: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 10,
    backgroundColor: "rgba(33,21,13,0.94)",
    borderBottomWidth: 1,
    borderBottomColor: HUNT_BORDER,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  mapHeaderLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  mapLogoSmall: {
    width: 34,
    height: 34,
    borderRadius: 10,
  },
  mapHeaderTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  mapTitle: {
    color: WHITE,
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 1.4,
  },
  mapSubtitle: {
    color: "rgba(255,255,255,0.62)",
    fontSize: 11,
    fontWeight: "800",
    marginTop: 2,
  },
  mapIconRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
  },
  mapIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: HUNT_BORDER,
    backgroundColor: "rgba(22,14,9,0.86)",
    alignItems: "center",
    justifyContent: "center",
  },
  mapIconBtnActive: {
    backgroundColor: HUNT_TAN_SOFT,
    borderColor: HUNT_TAN,
  },
  mapIconBtnDisabled: {
    opacity: 0.45,
  },
  mapIconBtnText: {
    color: WHITE,
    fontSize: 16,
    fontWeight: "900",
  },
  waterLevelMarker: {
  width: 34,
  height: 34,
  borderRadius: 17,
  backgroundColor: "rgba(22,14,9,0.94)",
  borderWidth: 2,
  alignItems: "center",
  justifyContent: "center",
  shadowColor: "#000",
  shadowOpacity: 0.35,
  shadowRadius: 6,
  elevation: 4,
},
waterLevelMarkerText: {
  fontSize: 18,
},
waterLevelHintBubble: {
  position: "absolute",
  top: Platform.OS === "ios" ? 104 : 92,
  left: 62,
  right: 14,
  zIndex: 15,
  paddingVertical: 12,
  paddingHorizontal: 14,
  borderRadius: 18,
  backgroundColor: "rgba(22,14,9,0.95)",
  borderWidth: 1,
  borderColor: "#4DA3FF",
  alignItems: "center",
  shadowColor: "#000",
  shadowOpacity: 0.35,
  shadowRadius: 8,
  elevation: 5,
},
waterLevelCallout: {
  width: 240,
  paddingVertical: 10,
  paddingHorizontal: 11,
  borderRadius: 12,
  backgroundColor: WHITE,
},
waterLevelCalloutTitle: {
  color: HUNT_BROWN_DEEP,
  fontSize: 14,
  fontWeight: "900",
  marginBottom: 5,
},
waterLevelCalloutPrimary: {
  color: "#0077CC",
  fontSize: 13,
  fontWeight: "900",
  marginTop: 3,
},
waterLevelCalloutText: {
  color: HUNT_BROWN_DEEP,
  fontSize: 12,
  fontWeight: "700",
  marginTop: 3,
  lineHeight: 16,
},
toggleRefreshNotice: {
  position: "absolute",
  top: Platform.OS === "ios" ? 54 : 34,
  alignSelf: "center",
  zIndex: 20,
  paddingVertical: 10,
  paddingHorizontal: 16,
  borderRadius: 999,
  backgroundColor: "rgba(22,14,9,0.94)",
  borderWidth: 1,
  borderColor: HUNT_TAN,
  shadowColor: "#000",
  shadowOpacity: 0.35,
  shadowRadius: 8,
  elevation: 6,
},
toggleRefreshNoticeText: {
  color: WHITE,
  fontSize: 13,
  fontWeight: "900",
  textAlign: "center",
},
waterLevelHintText: {
  color: WHITE,
  fontSize: 13,
  fontWeight: "900",
  textAlign: "center",
  lineHeight: 18,
},
waterLevelHintSubText: {
  color: "#4DA3FF",
  fontSize: 12,
  fontWeight: "900",
  textAlign: "center",
  marginTop: 5,
},
waterLevelCountBadge: {
  position: "absolute",
  right: 12,
  zIndex: 14,
  paddingVertical: 7,
  paddingHorizontal: 10,
  borderRadius: 999,
  backgroundColor: "rgba(22,14,9,0.92)",
  borderWidth: 1,
  borderColor: "#4DA3FF",
},
waterLevelCountText: {
  color: "#4DA3FF",
  fontSize: 11,
  fontWeight: "900",
},
  floatingAddBtn: {
    position: "absolute",
    right: 16,
    zIndex: 9,
    paddingVertical: 13,
    paddingHorizontal: 18,
    borderRadius: 999,
    backgroundColor: HUNT_TAN,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 5,
  },
  floatingAddBtnText: {
    color: HUNT_BROWN_DEEP,
    fontSize: 13,
    fontWeight: "900",
  },
  propertyHintBubble: {
  position: "absolute",
  top: Platform.OS === "ios" ? 116 : 104,
  left: 18,
  right: 18,
  zIndex: 13,
  paddingVertical: 11,
  paddingHorizontal: 14,
  borderRadius: 18,
  backgroundColor: "rgba(33,21,13,0.95)",
  borderWidth: 1,
  borderColor: HUNT_TAN,
  alignItems: "center",
  shadowColor: "#000",
  shadowOpacity: 0.35,
  shadowRadius: 8,
  elevation: 5,
},

propertyHintText: {
  color: WHITE,
  fontSize: 13,
  fontWeight: "900",
  textAlign: "center",
},
publicLandHintBubble: {
  position: "absolute",
  top: Platform.OS === "ios" ? 104 : 92,
  left: 62,
  right: 14,
  zIndex: 15,
  paddingVertical: 12,
  paddingHorizontal: 14,
  borderRadius: 18,
  backgroundColor: "rgba(22,14,9,0.95)",
  borderWidth: 1,
  borderColor: "#89CFF0",
  alignItems: "center",
  shadowColor: "#000",
  shadowOpacity: 0.35,
  shadowRadius: 8,
  elevation: 5,
},

publicLandHintText: {
  color: WHITE,
  fontSize: 13,
  fontWeight: "900",
  textAlign: "center",
  lineHeight: 18,
},
publicLandYellowText: {
  color: "#FFD700",
  fontWeight: "900",
},

publicLandBlueText: {
  color: "#89CFF0",
  fontWeight: "900",
},

publicLandHintSubText: {
  color: "#89CFF0",
  fontSize: 12,
  fontWeight: "900",
  textAlign: "center",
  marginTop: 5,
},
  overlayBadge: {
    position: "absolute",
    alignSelf: "center",
    zIndex: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: "rgba(22,14,9,0.92)",
    borderWidth: 1,
    borderColor: HUNT_BORDER,
  },
  publicLandCountBadge: {
  position: "absolute",
  top: Platform.OS === "ios" ? 132 : 126,
  right: 12,
  zIndex: 14,
  paddingVertical: 7,
  paddingHorizontal: 10,
  borderRadius: 999,
  backgroundColor: "rgba(22,14,9,0.92)",
  borderWidth: 1,
  borderColor: "#39FF14",
},
publicLandCountText: {
  color: "#39FF14",
  fontSize: 11,
  fontWeight: "900",
},
  overlayBadgeText: {
    color: WHITE,
    fontSize: 12,
    fontWeight: "900",
  },
  overlayBadgeClose: {
    color: HUNT_TAN,
    fontSize: 14,
    fontWeight: "900",
  },
propertyResultsPanel: {
  position: "absolute",
  left: 12,
  right: 12,
  height: 230,
  zIndex: 9,
  padding: 12,
  borderRadius: 18,
  backgroundColor: "rgba(33,21,13,0.95)",
  borderWidth: 1,
  borderColor: HUNT_BORDER,
  overflow: "hidden",
},
  propertyResultsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
    gap: 10,
  },
  propertyResultsTitle: {
    color: WHITE,
    fontSize: 14,
    fontWeight: "900",
  },
  propertyResultsSub: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 2,
  },
  propertyResultsClose: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: HUNT_BROWN_DEEP,
    borderWidth: 1,
    borderColor: HUNT_BORDER,
    alignItems: "center",
    justifyContent: "center",
  },
  propertyResultRow: {
    padding: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(217,168,76,0.18)",
    backgroundColor: HUNT_BROWN_CARD,
    marginBottom: 8,
  },
  propertyResultRowSelected: {
    borderColor: HUNT_TAN,
    backgroundColor: "rgba(217,168,76,0.10)",
  },
  propertyResultTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  propertyResultNumberBubble: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: HUNT_TAN_SOFT,
    borderWidth: 1,
    borderColor: HUNT_TAN,
    alignItems: "center",
    justifyContent: "center",
  },
  propertyResultNumberText: {
    color: HUNT_TAN,
    fontSize: 12,
    fontWeight: "900",
  },
  propertyResultOwner: {
    color: WHITE,
    fontSize: 13,
    fontWeight: "900",
  },
  propertyResultAddress: {
    color: "rgba(255,255,255,0.58)",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 2,
    lineHeight: 15,
  },
  waypointFloatingBtn: {
  position: "absolute",
  top: Platform.OS === "ios" ? 132 : 126,
  left: 12,
  zIndex: 14,
  minWidth: 82,
  height: 44,
  paddingHorizontal: 10,
  borderRadius: 14,
  backgroundColor: "rgba(22,14,9,0.92)",
  borderWidth: 1,
  borderColor: HUNT_BORDER,
  alignItems: "center",
  justifyContent: "center",
},
waypointFloatingBtnActive: {
  backgroundColor: HUNT_TAN_SOFT,
  borderColor: HUNT_TAN,
},
waypointFloatingBtnDisabled: {
  opacity: 0.55,
},
waypointFloatingBtnText: {
  color: HUNT_TAN,
  fontSize: 13,
  fontWeight: "900",
},
waypointBadge: {
  position: "absolute",
  top: Platform.OS === "ios" ? 182 : 176,
  left: 12,
  right: 12,
  maxWidth: 260,
  zIndex: 14,
  flexDirection: "row",
  alignItems: "center",
  gap: 8,
  paddingVertical: 8,
  paddingHorizontal: 11,
  borderRadius: 999,
  backgroundColor: "rgba(22,14,9,0.94)",
  borderWidth: 1,
  borderColor: HUNT_TAN,
},
waypointSelectedBadge: {
  position: "absolute",
  left: 12,
  right: 12,
  zIndex: 14,
  flexDirection: "row",
  alignItems: "center",
  gap: 8,
  paddingVertical: 8,
  paddingHorizontal: 11,
  borderRadius: 999,
  backgroundColor: "rgba(22,14,9,0.94)",
  borderWidth: 1,
  borderColor: HUNT_TAN,
},
waypointBadgeText: {
  flex: 1,
  color: WHITE,
  fontSize: 12,
  fontWeight: "900",
},
waypointBadgeAction: {
  color: "#39FF14",
  fontSize: 12,
  fontWeight: "900",
},
waypointBadgeClose: {
  color: HUNT_TAN,
  fontSize: 13,
  fontWeight: "900",
},
waypointRow: {
  flexDirection: "row",
  alignItems: "center",
  gap: 10,
  paddingVertical: 12,
  paddingHorizontal: 12,
  borderRadius: 15,
  borderWidth: 1,
  borderColor: HUNT_BORDER,
  backgroundColor: HUNT_BROWN_CARD,
},
waypointRowBtn: {
  paddingVertical: 7,
  paddingHorizontal: 10,
  borderRadius: 999,
  backgroundColor: HUNT_TAN_SOFT,
  borderWidth: 1,
  borderColor: HUNT_TAN,
},
waypointRowBtnText: {
  color: HUNT_TAN,
  fontSize: 11,
  fontWeight: "900",
},
waypointDeleteBtn: {
  width: 28,
  height: 28,
  borderRadius: 10,
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: "rgba(255,80,80,0.08)",
  borderWidth: 1,
  borderColor: "rgba(255,80,80,0.24)",
},
waypointDeleteText: {
  color: "#FF6B6B",
  fontSize: 12,
  fontWeight: "900",
},
  propertyResultChevron: {
    color: HUNT_TAN,
    fontSize: 18,
    fontWeight: "900",
  },
  propertyResultDetails: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(217,168,76,0.14)",
    gap: 7,
  },
  propertyResultDetailRow: {
    flexDirection: "row",
    gap: 8,
  },
  propertyResultDetailLabel: {
    width: 78,
    color: "rgba(255,255,255,0.45)",
    fontSize: 11,
    fontWeight: "900",
  },
  propertyResultDetailValue: {
    flex: 1,
    color: WHITE,
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 15,
  },
  sheetTitle: {
    color: WHITE,
    fontSize: 18,
    fontWeight: "900",
  },
  sheetHint: {
    color: MUTED,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
    marginTop: 12,
  },
  sectionLabel: {
    color: "rgba(255,255,255,0.64)",
    fontSize: 12,
    fontWeight: "900",
    marginTop: 14,
    marginBottom: 8,
    textTransform: "uppercase",
  },
  input: {
    minHeight: 46,
    borderRadius: 14,
    paddingHorizontal: 13,
    paddingVertical: 10,
    backgroundColor: HUNT_BROWN_CARD,
    borderWidth: 1,
    borderColor: HUNT_BORDER,
    color: WHITE,
    fontSize: 14,
    fontWeight: "700",
  },
  textArea: {
    minHeight: 92,
    textAlignVertical: "top",
  },
  typeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  typeChip: {
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: HUNT_BROWN_CARD,
    borderWidth: 1,
    borderColor: HUNT_BORDER,
  },
  typeChipActive: {
    backgroundColor: HUNT_TAN_SOFT,
    borderColor: HUNT_TAN,
  },
  typeChipText: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 12,
    fontWeight: "900",
  },
  typeChipTextActive: {
    color: HUNT_TAN,
  },
  addCoordBox: {
    marginTop: 14,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: HUNT_BORDER,
    backgroundColor: HUNT_BROWN_CARD,
  },
  coordTitle: {
    color: WHITE,
    fontSize: 13,
    fontWeight: "900",
  },
  coordText: {
    color: "rgba(255,255,255,0.56)",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 4,
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 15,
    backgroundColor: HUNT_TAN,
    alignItems: "center",
  },
  actionButtonAlt: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 15,
    backgroundColor: HUNT_BROWN_CARD,
    borderWidth: 1,
    borderColor: HUNT_BORDER,
    alignItems: "center",
  },
  actionButtonText: {
    color: WHITE,
    fontSize: 13,
    fontWeight: "900",
  },
  actionButtonDangerText: {
    color: "#FF6B6B",
    fontSize: 13,
    fontWeight: "900",
  },
  deleteSmallBtn: {
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 15,
    backgroundColor: "rgba(255,80,80,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,80,80,0.24)",
    alignItems: "center",
  },
  pinDetailHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  pinDetailTitle: {
    color: WHITE,
    fontSize: 19,
    fontWeight: "900",
  },
  pinDetailMeta: {
    color: "rgba(255,255,255,0.58)",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 4,
  },
  pinDetailNotes: {
    color: "rgba(255,255,255,0.82)",
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 19,
    marginTop: 12,
  },
  pinDetailNotesMuted: {
    color: "rgba(255,255,255,0.42)",
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 19,
    marginTop: 12,
  },
  statsCard: {
    marginTop: 14,
    padding: 12,
    borderRadius: 16,
    backgroundColor: HUNT_BROWN_CARD,
    borderWidth: 1,
    borderColor: HUNT_BORDER,
  },
  statHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  statTitle: {
    color: WHITE,
    fontSize: 14,
    fontWeight: "900",
  },
  statSub: {
    color: "rgba(255,255,255,0.58)",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 3,
  },
  clearResetBtn: {
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: HUNT_BORDER,
    backgroundColor: HUNT_BROWN_DEEP,
  },
  clearResetBtnText: {
    color: HUNT_TAN,
    fontSize: 11,
    fontWeight: "900",
  },
  statPeriodBlock: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(217,168,76,0.16)",
  },
  statPeriodTitle: {
    color: "rgba(255,255,255,0.68)",
    fontSize: 12,
    fontWeight: "900",
    marginBottom: 10,
  },
  statsGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  statItem: {
    alignItems: "center",
    flex: 1,
  },
  statValue: {
    color: WHITE,
    fontSize: 20,
    fontWeight: "900",
  },
  statLabel: {
    color: "rgba(255,255,255,0.48)",
    fontSize: 10,
    fontWeight: "800",
    marginTop: 2,
    textTransform: "uppercase",
  },
  recentHuntsCard: {
    marginTop: 12,
    padding: 12,
    borderRadius: 16,
    backgroundColor: HUNT_BROWN_CARD,
    borderWidth: 1,
    borderColor: HUNT_BORDER,
  },
  recentHuntsTitle: {
    color: WHITE,
    fontSize: 13,
    fontWeight: "900",
    marginBottom: 8,
  },
  recentHuntRow: {
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(217,168,76,0.12)",
  },
  recentHuntDate: {
    color: HUNT_TAN,
    fontSize: 12,
    fontWeight: "900",
  },
  recentHuntMeta: {
    color: "rgba(255,255,255,0.58)",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 2,
  },
  pinVerticalList: {
    marginTop: 10,
    gap: 8,
  },
  pinRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: HUNT_BORDER,
    backgroundColor: HUNT_BROWN_CARD,
  },
  pinDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  pinRowTitle: {
    color: WHITE,
    fontSize: 13,
    fontWeight: "900",
  },
  pinRowMeta: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 3,
  },
  pinRowChevron: {
    color: HUNT_TAN,
    fontSize: 22,
    fontWeight: "900",
  },
  measureUseLocationBtn: {
  paddingVertical: 5,
  paddingHorizontal: 8,
  borderRadius: 999,
  backgroundColor: HUNT_TAN_SOFT,
  borderWidth: 1,
  borderColor: HUNT_TAN,
},
measureUseLocationText: {
  color: HUNT_TAN,
  fontSize: 11,
  fontWeight: "900",
},
  pinActionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 14,
  },
  pinActionBtn: {
    flexGrow: 1,
    flexBasis: "47%",
    paddingVertical: 12,
    borderRadius: 15,
    backgroundColor: HUNT_BROWN_CARD,
    borderWidth: 1,
    borderColor: HUNT_BORDER,
    alignItems: "center",
  },
  pinActionBtnDisabled: {
    opacity: 0.55,
  },
  pinActionBtnText: {
    color: WHITE,
    fontWeight: "900",
  },
  pinActionPrimary: {
    backgroundColor: HUNT_TAN_SOFT,
    borderColor: HUNT_TAN,
  },
  pinActionPrimaryText: {
    color: HUNT_TAN,
  },
  
  propertyMapMarker: {
  minWidth: 30,
  height: 30,
  borderRadius: 15,
  backgroundColor: "rgba(33,21,13,0.94)",
  borderWidth: 2,
  borderColor: HUNT_TAN,
  alignItems: "center",
  justifyContent: "center",
  shadowColor: "#000",
  shadowOpacity: 0.35,
  shadowRadius: 6,
  elevation: 4,
},
propertyMapMarkerSelected: {
  backgroundColor: HUNT_TAN,
  borderColor: WHITE,
  transform: [{ scale: 1.12 }],
},
propertyMapMarkerText: {
  color: HUNT_TAN,
  fontSize: 13,
  fontWeight: "900",
},
propertyMapMarkerTextSelected: {
  color: HUNT_BROWN_DEEP,
},
  privacyDisclaimer: {
  color: "rgba(255,255,255,0.42)",
  fontSize: 11,
  fontWeight: "700",
  lineHeight: 16,
  textAlign: "center",
  marginTop: 14,
  marginBottom: 36,
  paddingHorizontal: 8,
},
backToListBtn: {
  paddingVertical: 7,
  paddingHorizontal: 10,
  borderRadius: 999,
  borderWidth: 1,
  borderColor: HUNT_BORDER,
  backgroundColor: HUNT_BROWN_DEEP,
},

backToListText: {
  color: HUNT_TAN,
  fontSize: 12,
  fontWeight: "900",
},
});