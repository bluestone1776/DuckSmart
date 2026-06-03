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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import MapView, { Geojson, Marker, UrlTile } from "react-native-maps";
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

const FREE_PIN_LIMIT = 5;
const RADAR_REGION_DELTA = 3.0;
const PIN_STAT_RESETS_KEY = "@ducksmart_pin_stat_resets_v1";
const PIN_SEASON_ARCHIVES_KEY = "@ducksmart_pin_season_archives_v1";

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

  return {
    ...pin,
    shareType: "pin",
    itemType: "shared_pin",
    title: pin.title || pin.name || "Shared Pin",
    name: pin.name || pin.title || "Shared Pin",
    type: pin.type || "Spot",
    pinType: pin.type || "Spot",
    notes: pin.notes || pin.description || "",
    description: pin.description || pin.notes || "",
    coordinate,
    coordinates: coordinate,
    coords: coordinate,
    location: coordinate,
    latitude: coordinate.latitude,
    longitude: coordinate.longitude,
    locationLatitude: coordinate.latitude,
    locationLongitude: coordinate.longitude,
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
  const { isPro, purchase } = usePremium();
  const { user } = useAuth();

  const mapRef = useRef(null);
  const bottomSheetRef = useRef(null);
  const lastNormalRegionRef = useRef(DEFAULT_REGION);
  const screenViewLoggedRef = useRef(false);
  const mapMoveCountRef = useRef(0);
  const lastMapMoveLoggedAtRef = useRef(0);
  const mapSessionStartedAtRef = useRef(Date.now());
  const lastPinsCountRef = useRef(pins.length);

  const snapPoints = useMemo(() => [128, 240, "60%"], []);

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

  const [sharingPin, setSharingPin] = useState(false);
  const [pinStatResets, setPinStatResets] = useState({});
  const [pinSeasonArchives, setPinSeasonArchives] = useState({});
  const [selectedPinId, setSelectedPinId] = useState(null);

  const activePins = useMemo(
    () =>
      pins
        .map(normalizePin)
        .filter(Boolean)
        .filter((pin) => !pin?.archivedAt),
    [pins]
  );

  const selectedPin = useMemo(
    () => activePins.find((p) => p.id === selectedPinId) || null,
    [activePins, selectedPinId]
  );

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

    return logs
      .filter((log) => log.pinId === selectedPinId)
      .filter(isHuntLogEntry)
      .sort((a, b) => getLogTimestamp(b) - getLogTimestamp(a))
      .slice(0, 4);
  }, [logs, selectedPinId]);

  const selectedPinScoutLogs = useMemo(() => {
    if (!selectedPinId) return [];

    return logs
      .filter((log) => log.pinId === selectedPinId)
      .filter(isScoutLogEntry)
      .sort((a, b) => getLogTimestamp(b) - getLogTimestamp(a))
      .slice(0, 4);
  }, [logs, selectedPinId]);

  const pinStats = useMemo(() => {
    if (!selectedPinId) return null;

    const nowYear = new Date().getFullYear();
    const lastYear = nowYear - 1;
    const resetAt = pinStatResets[selectedPinId] || null;
    const archivedLastSeason = pinSeasonArchives[selectedPinId]?.lastSeason || null;

        const pinLogs = logs
      .filter((log) => log.pinId === selectedPinId)
      .filter(isHuntLogEntry);

    const currentSeasonLogs = resetAt
      ? pinLogs.filter((log) => getLogTimestamp(log) >= resetAt)
      : pinLogs.filter((log) => getLogYear(log) === nowYear);

    const lastYearLogs = pinLogs.filter((log) => getLogYear(log) === lastYear);

    const previousSummary =
      archivedLastSeason?.summary && typeof archivedLastSeason.summary === "object"
        ? archivedLastSeason.summary
        : summarizePinLogs(lastYearLogs);

    return {
      currentYear: nowYear,
      lastYear,
      resetAt,
      lastSeasonClosedAt: archivedLastSeason?.closedAt || null,
      current: summarizePinLogs(currentSeasonLogs),
      previous: previousSummary,
    };
  }, [selectedPinId, logs, pinStatResets, pinSeasonArchives]);

  const showFloatingAddButton = !isAddMode && !selectedPin;
  const floatingAddBottom = sheetIndex === SNAP_COLLAPSED ? 142 : 292;
  const overlayBadgeBottom = sheetIndex === SNAP_COLLAPSED ? 96 : 248;

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
  }, [isPro, showParcels, trackMapEvent]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const [rawResets, rawArchives] = await Promise.all([
          AsyncStorage.getItem(PIN_STAT_RESETS_KEY),
          AsyncStorage.getItem(PIN_SEASON_ARCHIVES_KEY),
        ]);

        const parsedResets = rawResets ? JSON.parse(rawResets) : {};
        const parsedArchives = rawArchives ? JSON.parse(rawArchives) : {};

        if (!mounted) return;

        setPinStatResets(
          parsedResets && typeof parsedResets === "object" ? parsedResets : {}
        );
        setPinSeasonArchives(
          parsedArchives && typeof parsedArchives === "object" ? parsedArchives : {}
        );
      } catch {
        if (!mounted) return;
        setPinStatResets({});
        setPinSeasonArchives({});
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

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

    trackMapEvent("map_tapped", {
      mode: isAddMode ? "add_pin" : showParcels ? "property_lines" : "browse",
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

    Alert.alert("Share Pin", "How do you want to share this pin?", [
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

  return (
    <ScreenBackground source={ASSETS?.backgrounds?.map || ASSETS?.backgrounds?.today}>
      <SafeAreaView style={localStyles.screen} edges={["top", "left", "right"]}>
        <StatusBar barStyle="light-content" />

        <View style={localStyles.mapWrap}>
          <View style={localStyles.mapTopBarFixed}>
            <View style={localStyles.mapHeaderLeft}>
              {logoSource ? (
                <Image source={logoSource} style={localStyles.mapLogoSmall} resizeMode="cover" />
              ) : null}

              <View style={localStyles.mapHeaderTextWrap}>
                <Text style={localStyles.mapTitle}>MAP</Text>
                <Text style={localStyles.mapSubtitle} numberOfLines={1}>
                  Pins • Radar • Property Lines
                </Text>
              </View>
            </View>

            <View style={localStyles.mapIconRow}>
              <Pressable
                style={[localStyles.mapIconBtn, showRadar ? localStyles.mapIconBtnActive : null]}
                onPress={toggleRadar}
                accessibilityLabel={showRadar ? "Hide radar" : "Show radar"}
                accessibilityRole="button"
              >
                <Text style={localStyles.mapIconBtnText}>🌧</Text>
              </Pressable>

              <Pressable
                style={localStyles.mapIconBtn}
                onPress={toggleMapType}
                accessibilityLabel="Change map type"
                accessibilityRole="button"
              >
                <Text style={localStyles.mapIconBtnText}>◩</Text>
              </Pressable>

              <Pressable
                style={[
                  localStyles.mapIconBtn,
                  showParcels ? localStyles.mapIconBtnActive : null,
                ]}
                onPress={toggleParcels}
                accessibilityLabel={showParcels ? "Hide property lines" : "Show property lines"}
                accessibilityRole="button"
              >
                <Text style={localStyles.mapIconBtnText}>▦</Text>
              </Pressable>

              <Pressable
                style={[
                  localStyles.mapIconBtn,
                  !userLoc ? localStyles.mapIconBtnDisabled : null,
                ]}
                onPress={goToUser}
                disabled={!userLoc}
                accessibilityLabel="Go to my location"
                accessibilityRole="button"
              >
                <Text style={localStyles.mapIconBtnText}>◎</Text>
              </Pressable>
            </View>
          </View>

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

            {activePins.map((p) => {
              const coordinate = getPinCoordinate(p);
              if (!coordinate) return null;

              const pinType = PIN_TYPES.find((t) => t.key === p.type);
              const pinColor = pinType?.color || GREEN;

              return (
                <Marker
                  key={p.id}
                  coordinate={coordinate}
                  title={p.title}
                  description={`${p.type}${p.notes ? ` • ${p.notes}` : ""}`}
                  pinColor={pinColor}
                  onPress={() => {
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
                opacity={1}
                minimumZ={10}
                maximumZ={21}
                maximumNativeZ={21}
                tileSize={256}
              />
            ) : null}
          </MapView>
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
            <View style={localStyles.propertyResultsPanel}>
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

          {showFloatingAddButton ? (
            <Pressable
              style={[localStyles.floatingAddBtn, { bottom: floatingAddBottom }]}
              onPress={startAddPin}
              accessibilityLabel="Add pin"
              accessibilityRole="button"
            >
              <Text style={localStyles.floatingAddBtnText}>Add Pin</Text>
            </Pressable>
          ) : null}

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

                        <Pressable style={localStyles.clearResetBtn} onPress={closeDetail}>
                          <Text style={localStyles.clearResetBtnText}>Close</Text>
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

                            <Pressable style={localStyles.clearResetBtn} onPress={closeSelectedPinSeason}>
                              <Text style={localStyles.clearResetBtnText}>Close Season</Text>
                            </Pressable>
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
                        ? `${activePins.length} Pins`
                        : `${activePins.length}/${FREE_PIN_LIMIT} Pins`}
                    </Text>
                  </Pressable>

                  {sheetIndex >= SNAP_PEEK ? (
                    <>
                      <View style={{ marginTop: 8 }}>
                        <RowHeader
                          title="Pins"
                          pill={
                            isPro
                              ? `${activePins.length} saved`
                              : `${activePins.length}/${FREE_PIN_LIMIT}`
                          }
                        />
                      </View>

                      <View style={localStyles.pinVerticalList}>
                        {activePins.map((p) => {
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
                  ) : null}
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
    top: Platform.OS === "ios" ? 82 : 76,
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
    paddingBottom: Platform.OS === "android" ? 108 : 44,
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
    top: Platform.OS === "ios" ? 116 : 104,
    maxHeight: 280,
    zIndex: 9,
    padding: 12,
    borderRadius: 18,
    backgroundColor: "rgba(33,21,13,0.95)",
    borderWidth: 1,
    borderColor: HUNT_BORDER,
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
  privacyDisclaimer: {
    color: "rgba(255,255,255,0.42)",
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 16,
    textAlign: "center",
    marginTop: 14,
    paddingHorizontal: 8,
  },
});