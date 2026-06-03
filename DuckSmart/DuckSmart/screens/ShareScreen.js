// DuckSmart — Share Screen
//
// Supports:
// 1) Composer mode:
//    navigation.navigate("ShareScreen", {
//      shareType: "pin" | "hunt_log" | "decoy_spread" | "scouting_log",
//      item,
//    });
//
// 2) View shared mode:
//    navigation.navigate("ShareScreen", {
//      mode: "view_shared",
//      readOnly: true,
//      shareType,
//      item,
//      sharedNotification,
//      shareId,
//      member,
//      memberUid,
//    });
//
// Composer mode writes:
// - users/{currentUid}/sharedItems/{shareId}
// - users/{recipientUid}/inAppNotifications/{notificationId}
//
// View shared mode can save:
// - shared pins into local/cloud pins through App state
// - shared hunt/scout/decoy logs into local/cloud logs through App state
//
// Fixed:
// - No stale Done / already shared state between different shared items.
// - Shared pins/logs carry normalized coordinate, latitude, longitude, and location fields.
// - Remove / Unshare is handled inside ShareScreen instead of GroupScreen/UserCardScreen rows.

import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Image,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, useRoute } from "@react-navigation/native";
import MapView, { Marker } from "react-native-maps";
import {
  addDoc,
  collection,
  doc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

import { COLORS } from "../constants/theme";
import { useAuth } from "../context/AuthContext";
import { usePremium } from "../context/PremiumContext";
import { db, isFirebaseConfigValid } from "../services/firebase";
import { loadUserProfile } from "../services/profile";
import {
  loadHuntingParty,
  removeSharedItem,
  searchUsersForHuntingParty,
} from "../services/user_search";
import {
  blockUser,
  submitUserReport,
} from "../services/block_user";

const FREE_SHARED_SAVE_LIMIT = 3;

const GOLD = "#D9A84C";
const RED = "#FF4D4D";
const GREEN = "#39D96A";
const BLUE = "#4DA3FF";
const BG = "#05090A";
const CARD = "rgba(13,18,19,0.96)";
const SECTION_BG = "rgba(5,10,11,0.96)";
const CARD_SOFT = "rgba(255,255,255,0.045)";
const BORDER = "rgba(255,255,255,0.08)";
const GOLD_BORDER = "rgba(217,168,76,0.34)";
const BLUE_BORDER = "rgba(77,163,255,0.36)";
const MUTED = "rgba(255,255,255,0.62)";
const MUTED_DARK = "rgba(255,255,255,0.42)";

function assertFirebaseReady() {
  if (!isFirebaseConfigValid) {
    throw new Error("Firebase is not configured for this build.");
  }
}

function cleanString(value, maxLength = 500) {
  if (value === undefined || value === null) return "";
  return String(value).trim().slice(0, maxLength);
}

function cleanDocId(value) {
  return cleanString(value || "item", 160).replace(/[^a-zA-Z0-9_-]/g, "_");
}

function cleanNumber(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function getNestedValue(source, paths = []) {
  if (!source) return null;

  for (const path of paths) {
    const parts = path.split(".");
    let current = source;

    for (const part of parts) {
      if (current === undefined || current === null) {
        current = null;
        break;
      }

      current = current[part];
    }

    if (current !== undefined && current !== null && current !== "") {
      return current;
    }
  }

  return null;
}

function getInitials(value) {
  const str = String(value || "D").trim();
  const parts = str.split(/\s+/).filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }

  return String(parts[0]?.[0] || "D").toUpperCase();
}

function getDisplayName(profile, user) {
  return (
    profile?.displayName ||
    user?.displayName ||
    user?.email?.split("@")?.[0] ||
    "DuckSmart User"
  );
}

function getDuckId(profile) {
  return profile?.duckIdLower || profile?.duckId || "";
}

function getPhotoURL(profile, user) {
  return profile?.photoURL || user?.photoURL || null;
}

function getRouteShareItem(params = {}) {
  return (
    params.item ||
    params.pin ||
    params.log ||
    params.shareItem ||
    params.payload ||
    null
  );
}

function getRouteShareType(params = {}) {
  const item = getRouteShareItem(params) || {};

  return cleanString(
    params.shareType ||
      params.type ||
      item.shareType ||
      item.itemType ||
      item.type ||
      "pin",
    80
  ).toLowerCase();
}

function getNotificationType(shareType) {
  switch (String(shareType || "").toLowerCase()) {
    case "pin":
    case "map_pin":
    case "mappin":
    case "shared_pin":
      return "shared_pin";
    case "hunt":
    case "huntlog":
    case "hunt_log":
    case "log":
    case "shared_hunt_log":
      return "shared_hunt_log";
    case "decoy":
    case "decoy_spread":
    case "decoyspread":
    case "shared_decoy_spread":
      return "shared_decoy_spread";
    case "scouting":
    case "scout":
    case "scout_log":
    case "scouting_log":
    case "shared_scouting_log":
      return "shared_scouting_log";
    default:
      return "shared_pin";
  }
}

function getShareTypeForPayload(shareType) {
  switch (getNotificationType(shareType)) {
    case "shared_pin":
      return "pin";
    case "shared_hunt_log":
      return "hunt_log";
    case "shared_decoy_spread":
      return "decoy_spread";
    case "shared_scouting_log":
      return "scouting_log";
    default:
      return "pin";
  }
}

function getShareTypeLabel(shareType) {
  switch (getNotificationType(shareType)) {
    case "shared_pin":
      return "Map Pin";
    case "shared_hunt_log":
      return "Hunt Log";
    case "shared_decoy_spread":
      return "Decoy Spread";
    case "shared_scouting_log":
      return "Scouting Log";
    default:
      return "Shared Item";
  }
}

function getShareIcon(shareType) {
  switch (getNotificationType(shareType)) {
    case "shared_pin":
      return "📍";
    case "shared_decoy_spread":
      return "🦆";
    case "shared_scouting_log":
      return "🔎";
    default:
      return "▤";
  }
}

function isSharedPinType(shareType) {
  return getNotificationType(shareType) === "shared_pin";
}

function getCoordinate(item = {}) {
  const candidates = [
    item,
    item.payload,
    item.coordinate,
    item.coordinates,
    item.coords,
    item.location,
    item.gps,
    item.geo,
    item.mapData,
    item.pin,
    item.mapPin,
    item.linkedPin,
    item.payload?.coordinate,
    item.payload?.coordinates,
    item.payload?.coords,
    item.payload?.location,
    item.payload?.gps,
    item.payload?.geo,
    item.payload?.mapData,
    item.payload?.pin,
    item.payload?.mapPin,
    item.payload?.linkedPin,
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

    const latNum = cleanNumber(latitude);
    const lngNum = cleanNumber(longitude);

    if (latNum !== null && lngNum !== null) {
      return {
        latitude: latNum,
        longitude: lngNum,
      };
    }
  }

  return null;
}

function getItemTitle(item = {}, shareType = "pin") {
  return (
    item.title ||
    item.name ||
    item.pinTitle ||
    item.locationName ||
    item.spotName ||
    item.label ||
    item.environment ||
    item.payload?.title ||
    item.payload?.name ||
    item.payload?.pinTitle ||
    item.payload?.locationName ||
    item.payload?.spotName ||
    item.payload?.label ||
    item.payload?.environment ||
    item.linkedPin?.title ||
    item.payload?.linkedPin?.title ||
    `${getShareTypeLabel(shareType)}`
  );
}

function getItemNotes(item = {}) {
  return (
    item.notes ||
    item.description ||
    item.details ||
    item.memo ||
    item.comments ||
    item.observations ||
    item.summary ||
    item.payload?.notes ||
    item.payload?.description ||
    item.payload?.details ||
    item.payload?.memo ||
    item.payload?.comments ||
    item.payload?.observations ||
    item.payload?.summary ||
    item.linkedPin?.notes ||
    item.payload?.linkedPin?.notes ||
    ""
  );
}

function normalizePhotoEntry(photo) {
  if (!photo) return null;

  if (typeof photo === "string") {
    return photo;
  }

  return (
    photo.url ||
    photo.uri ||
    photo.downloadURL ||
    photo.downloadUrl ||
    photo.photoURL ||
    photo.imageUrl ||
    photo.imageURL ||
    photo.imageUri ||
    photo.sharedUrl ||
    null
  );
}

function getPhotos(item = {}) {
  const possiblePhotoArrays = [
    item.photos,
    item.images,
    item.imageUrls,
    item.imageURLS,
    item.photoUrls,
    item.attachments,
    item.harvestPhotos,
    item.duckPhotos,
    item.payload?.photos,
    item.payload?.images,
    item.payload?.imageUrls,
    item.payload?.imageURLS,
    item.payload?.photoUrls,
    item.payload?.attachments,
    item.payload?.harvestPhotos,
    item.payload?.duckPhotos,
    item.linkedPin?.photos,
    item.payload?.linkedPin?.photos,
  ];

  const output = [];

  possiblePhotoArrays.forEach((raw) => {
    if (Array.isArray(raw)) {
      raw.forEach((photo) => {
        const normalized = normalizePhotoEntry(photo);
        if (normalized) output.push(normalized);
      });
    }
  });

  const singlePhotos = [
    item.photoURL,
    item.photoUrl,
    item.photo,
    item.imageUrl,
    item.imageURL,
    item.imageUri,
    item.spreadPhoto,
    item.payload?.photoURL,
    item.payload?.photoUrl,
    item.payload?.photo,
    item.payload?.imageUrl,
    item.payload?.imageURL,
    item.payload?.imageUri,
    item.payload?.spreadPhoto,
    item.linkedPin?.photoURL,
    item.linkedPin?.imageUrl,
    item.payload?.linkedPin?.photoURL,
    item.payload?.linkedPin?.imageUrl,
  ];

  singlePhotos.forEach((photo) => {
    const normalized = normalizePhotoEntry(photo);
    if (normalized) output.push(normalized);
  });

  return Array.from(new Set(output)).slice(0, 12);
}

function formatDate(value) {
  if (!value) return "";

  const date =
    typeof value === "number"
      ? new Date(value)
      : value?.seconds
        ? new Date(value.seconds * 1000)
        : new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatValue(value) {
  if (value === undefined || value === null || value === "") return "";

  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (typeof value === "string") {
    return value.trim();
  }

  if (value?.seconds) {
    return formatDate(value);
  }

  if (Array.isArray(value)) {
    const parts = value
      .map((entry) => {
        if (typeof entry === "string" || typeof entry === "number") return String(entry);
        if (entry?.name) return String(entry.name);
        if (entry?.label) return String(entry.label);
        if (entry?.species) return String(entry.species);
        if (entry?.title) return String(entry.title);
        return "";
      })
      .filter(Boolean);

    return parts.join(", ");
  }

  if (typeof value === "object") {
    if (value.latitude != null && value.longitude != null) {
      return `${Number(value.latitude).toFixed(5)}, ${Number(value.longitude).toFixed(5)}`;
    }

    if (value.lat != null && (value.lng != null || value.lon != null)) {
      return `${Number(value.lat).toFixed(5)}, ${Number(value.lng || value.lon).toFixed(5)}`;
    }

    if (value.name) return String(value.name);
    if (value.label) return String(value.label);
    if (value.title) return String(value.title);
    if (value.value) return String(value.value);

    return "";
  }

  return String(value);
}

function getDetailRows(item = {}, shareType = "pin") {
  const root = item || {};
  const payload = item?.payload || {};
  const linkedPin = item?.linkedPin || item?.payload?.linkedPin || {};
  const coordinate = getCoordinate(item);
  const rows = [];

  function add(label, value) {
    const text = formatValue(value);
    if (!text) return;

    const exists = rows.some((row) => row.label === label && row.value === text);
    if (!exists) rows.push({ label, value: text });
  }

  add("Date", getNestedValue(root, ["dateTime", "huntDate", "date", "createdAt"]));
  add("Location", getNestedValue(root, ["locationName", "spotName", "location.name", "payload.locationName", "payload.spotName"]));
  add("Linked Pin", linkedPin?.title || linkedPin?.name || linkedPin?.spotName);
  add("Pin Type", getNestedValue(root, ["pinType", "type", "payload.pinType", "payload.type"]));

  if (coordinate) {
    add("Coordinates", coordinate);
  }

  add("Species", getNestedValue(root, ["species", "duckSpecies", "targetSpecies", "payload.species", "payload.duckSpecies", "speciesSighted", "payload.speciesSighted"]));
  add("Harvested", getNestedValue(root, ["harvested", "harvestCount", "ducksHarvested", "birdsHarvested", "payload.harvested", "payload.harvestCount", "payload.ducksHarvested"]));
  add("Hunters", getNestedValue(root, ["hunters", "hunterNames", "party", "payload.hunters", "payload.hunterNames"]));
  add("Dog", getNestedValue(root, ["dog", "dogName", "payload.dog", "payload.dogName"]));
  add("Blind", getNestedValue(root, ["blind", "blindType", "setup", "payload.blind", "payload.blindType", "payload.setup"]));
  add("Decoys", getNestedValue(root, ["decoys", "decoyCount", "spread", "payload.decoys", "payload.decoyCount", "payload.spread"]));
  add("Calls", getNestedValue(root, ["calls", "calling", "payload.calls", "payload.calling"]));

  add("Weather", getNestedValue(root, ["weatherSnapshot.summary", "weather.summary", "weather.description", "weather", "payload.weatherSnapshot.summary", "payload.weather.summary", "payload.weather.description"]));
  add("Temperature", getNestedValue(root, ["temperature", "temp", "weather.temperature", "weather.temp", "payload.temperature", "payload.weather.temperature"]));
  add("Wind", getNestedValue(root, ["wind", "windSpeed", "weather.wind", "weather.windSpeed", "payload.wind", "payload.weather.wind"]));
  add("Pressure", getNestedValue(root, ["pressure", "barometricPressure", "weather.pressure", "payload.pressure", "payload.weather.pressure"]));
  add("Moon", getNestedValue(root, ["moon", "moonPhase", "payload.moon", "payload.moonPhase"]));
  add("Water", getNestedValue(root, ["water", "waterLevel", "payload.water", "payload.waterLevel"]));

  if (isSharedPinType(shareType)) {
    add("Pin Notes", getItemNotes(item));
  }

  return rows.slice(0, 18);
}

function deepCleanForFirestore(value) {
  if (value === undefined) return null;
  if (value === null) return null;

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map(deepCleanForFirestore);
  }

  if (typeof value === "object") {
    const output = {};

    Object.keys(value).forEach((key) => {
      const cleaned = deepCleanForFirestore(value[key]);
      if (cleaned !== undefined) {
        output[key] = cleaned;
      }
    });

    return output;
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  return String(value);
}

function getPayloadSource(item = {}) {
  if (item?.payload && typeof item.payload === "object") {
    return item.payload;
  }

  return item || {};
}

function buildSharePayload(item, shareType) {
  const source = getPayloadSource(item);
  const coordinate = getCoordinate(item);
  const photos = getPhotos(item);
  const normalizedShareType = getShareTypeForPayload(shareType);

  return deepCleanForFirestore({
    ...source,
    shareType: normalizedShareType,
    notificationType: getNotificationType(shareType),
    title: getItemTitle(source, shareType),
    notes: getItemNotes(source),
    coordinate,
    latitude: coordinate ? coordinate.latitude : null,
    longitude: coordinate ? coordinate.longitude : null,
    location: source.location || coordinate || null,
    photos,
    sharedPayloadVersion: 2,
  });
}

function getSavedPinType(value) {
  const raw = String(value || "").toLowerCase();

  if (!raw || raw === "pin" || raw === "shared_pin" || raw === "map_pin" || raw === "mappin") {
    return "Spot";
  }

  return value;
}

function buildSavedPinFromSharedItem({
  shareItem,
  shareType,
  shareId,
  ownerProfile,
}) {
  const coordinate = getCoordinate(shareItem);

  if (!coordinate) {
    throw new Error("This shared pin is missing map coordinates.");
  }

  const now = Date.now();
  const originalTitle = getItemTitle(shareItem, shareType);

  return {
    ...shareItem,
    id: `shared-pin-${now}`,
    title: originalTitle || "Shared Pin",
    type: getSavedPinType(shareItem.pinType || shareItem.type),
    notes: getItemNotes(shareItem),
    coordinate,
    latitude: coordinate.latitude,
    longitude: coordinate.longitude,
    location: coordinate,
    photos: getPhotos(shareItem),
    importedFromShareId: shareId || shareItem.shareId || shareItem.id || null,
    sharedFromUid: ownerProfile?.uid || shareItem.senderUid || null,
    sharedFromName: getDisplayName(ownerProfile),
    createdAt: now,
    updatedAt: now,
    savedFromSharedCardAt: now,
  };
}

function buildSavedLogFromSharedItem({
  shareItem,
  shareType,
  shareId,
  ownerProfile,
}) {
  const now = Date.now();
  const notificationType = getNotificationType(shareType);
  const isScout = notificationType === "shared_scouting_log";
  const coordinate = getCoordinate(shareItem);

  return {
    ...shareItem,
    id: `shared-log-${now}`,
    title: getItemTitle(shareItem, shareType),
    notes: getItemNotes(shareItem),
    photos: getPhotos(shareItem),
    coordinate: coordinate || shareItem.coordinate || null,
    latitude: coordinate ? coordinate.latitude : shareItem.latitude || null,
    longitude: coordinate ? coordinate.longitude : shareItem.longitude || null,
    location: shareItem.location || coordinate || null,
    logType: isScout ? "scout" : shareItem.logType || "hunt",
    logMode: isScout ? "scout" : shareItem.logMode || "hunt",
    type: shareItem.type || "huntLog",
    shareType,
    importedFromShareId: shareId || shareItem.shareId || shareItem.id || null,
    sharedFromUid: ownerProfile?.uid || shareItem.senderUid || null,
    sharedFromName: getDisplayName(ownerProfile),
    createdAt: now,
    updatedAt: now,
    savedFromSharedCardAt: now,
  };
}

function UserAvatar({ profile, user, size = 44 }) {
  const displayName = getDisplayName(profile, user);
  const photoURL = getPhotoURL(profile, user);

  if (photoURL) {
    return (
      <Image
        source={{ uri: photoURL }}
        style={[
          s.userAvatar,
          {
            width: size,
            height: size,
            borderRadius: Math.round(size / 3),
          },
        ]}
        resizeMode="cover"
      />
    );
  }

  return (
    <View
      style={[
        s.userAvatarFallback,
        {
          width: size,
          height: size,
          borderRadius: Math.round(size / 3),
        },
      ]}
    >
      <Text style={[s.userAvatarInitials, { fontSize: Math.round(size * 0.28) }]}>
        {getInitials(displayName)}
      </Text>
    </View>
  );
}

function SectionHeader({ eyebrow, title, subtitle, right }) {
  return (
    <View style={s.sectionHeaderBlock}>
      <View style={{ flex: 1 }}>
        {eyebrow ? <Text style={s.sectionEyebrow}>{eyebrow}</Text> : null}
        <Text style={s.sectionTitle}>{title}</Text>
        {subtitle ? <Text style={s.sectionSub}>{subtitle}</Text> : null}
      </View>

      {right ? <View style={s.sectionRight}>{right}</View> : null}
    </View>
  );
}

function RecipientRow({
  item,
  currentUser,
  onShare,
  busy,
}) {
  const displayName = getDisplayName(item, currentUser);
  const duckId = getDuckId(item);
  const email = item?.emailLower || item?.email || "";

  return (
    <View style={s.recipientRow}>
      <UserAvatar profile={item} user={currentUser} size={46} />

      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.recipientName} numberOfLines={1}>
          {displayName}
        </Text>

        <Text style={s.recipientHandle} numberOfLines={1}>
          {duckId ? `@${duckId}` : email || "DuckSmart User"}
        </Text>
      </View>

      <Pressable
        style={[s.shareUserBtn, busy ? s.disabledBtn : null]}
        onPress={() => onShare?.(item)}
        disabled={busy}
      >
        <Text style={s.shareUserBtnText}>
          {busy ? "..." : "Share"}
        </Text>
      </Pressable>
    </View>
  );
}

function SharedCardPreview({
  item,
  shareType,
  ownerProfile,
  user,
  readOnly = false,
  sharedNotification,
}) {
  const title = getItemTitle(item, shareType);
  const notes = getItemNotes(item);
  const coordinate = getCoordinate(item);
  const photos = getPhotos(item);
  const previewPhoto = photos[0] || null;
  const typeLabel = getShareTypeLabel(shareType);
  const detailRows = getDetailRows(item, shareType);

  const createdAt =
    item?.createdAt ||
    item?.dateTime ||
    item?.date ||
    item?.payload?.createdAt ||
    item?.payload?.dateTime ||
    item?.payload?.date ||
    sharedNotification?.createdAt ||
    null;

  return (
    <View style={s.shareCard}>
      <View style={s.shareCardTop}>
        <View style={s.shareIconWrap}>
          <Text style={s.shareIcon}>{getShareIcon(shareType)}</Text>
        </View>

        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.shareCardEyebrow}>
            {readOnly ? `SHARED ${typeLabel.toUpperCase()}` : typeLabel.toUpperCase()}
          </Text>
          <Text style={s.shareCardTitle} numberOfLines={2}>
            {title}
          </Text>

          {createdAt ? (
            <Text style={s.shareCardDate}>{formatDate(createdAt)}</Text>
          ) : null}
        </View>
      </View>

      {coordinate ? (
        <View style={s.sharedMapWrap}>
          <MapView
            style={s.sharedMap}
            region={{
              latitude: coordinate.latitude,
              longitude: coordinate.longitude,
              latitudeDelta: 0.012,
              longitudeDelta: 0.012,
            }}
            scrollEnabled={false}
            zoomEnabled={false}
            pitchEnabled={false}
            rotateEnabled={false}
            toolbarEnabled={false}
          >
            <Marker coordinate={coordinate} title={title} />
          </MapView>

          <View style={s.sharedMapFooter}>
            <Text style={s.sharedMapText}>
              {coordinate.latitude.toFixed(5)}, {coordinate.longitude.toFixed(5)}
            </Text>
          </View>
        </View>
      ) : (
        isSharedPinType(shareType) ? (
          <View style={s.missingMapBox}>
            <Text style={s.missingMapTitle}>GPS Missing</Text>
            <Text style={s.missingMapText}>
              This shared pin did not include usable coordinates.
            </Text>
          </View>
        ) : null
      )}

      {previewPhoto ? (
        <Image source={{ uri: previewPhoto }} style={s.previewImage} resizeMode="cover" />
      ) : null}

      {photos.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.photoStrip}>
          {photos.slice(1).map((uri, index) => (
            <Image
              key={`${uri}-${index}`}
              source={{ uri }}
              style={s.photoThumb}
              resizeMode="cover"
            />
          ))}
        </ScrollView>
      ) : null}

      <View style={s.detailGrid}>
        <View style={s.detailBox}>
          <Text style={s.detailLabel}>Photos</Text>
          <Text style={s.detailValue}>{photos.length}</Text>
        </View>

        <View style={s.detailBox}>
          <Text style={s.detailLabel}>Latitude</Text>
          <Text style={s.detailValue}>
            {coordinate ? coordinate.latitude.toFixed(5) : "--"}
          </Text>
        </View>

        <View style={s.detailBox}>
          <Text style={s.detailLabel}>Longitude</Text>
          <Text style={s.detailValue}>
            {coordinate ? coordinate.longitude.toFixed(5) : "--"}
          </Text>
        </View>
      </View>

      {detailRows.length > 0 ? (
        <View style={s.detailsBlock}>
          <Text style={s.detailsBlockTitle}>Details</Text>

          {detailRows.map((row) => (
            <View key={`${row.label}-${row.value}`} style={s.detailRow}>
              <Text style={s.detailRowLabel}>{row.label}</Text>
              <Text style={s.detailRowValue}>{row.value}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {notes ? (
        <View style={s.notesBox}>
          <Text style={s.notesLabel}>Notes</Text>
          <Text style={s.notesText}>{notes}</Text>
        </View>
      ) : null}

      <View style={s.ownerRow}>
        <UserAvatar profile={ownerProfile} user={user} size={36} />

        <View style={{ flex: 1 }}>
          <Text style={s.ownerLabel}>{readOnly ? "Shared by" : "Sharing as"}</Text>
          <Text style={s.ownerName} numberOfLines={1}>
            {getDisplayName(ownerProfile, user)}
            {getDuckId(ownerProfile) ? ` • @${getDuckId(ownerProfile)}` : ""}
          </Text>
        </View>
      </View>
    </View>
  );
}

export default function ShareScreen({
  pins = [],
  logs = [],
  addPin,
  addLog,
  openGroupScreen,
}) {
  const navigation = useNavigation();
  const route = useRoute();
  const { user } = useAuth();
  const {
    isPro,
    purchase,
    monthlyPackage,
    yearlyPackage,
    annualPackage,
  } = usePremium();

  const params = route.params || {};
const rawShareItem = getRouteShareItem(params);
const sharedNotification = params.sharedNotification || null;
const shareContainer = sharedNotification || rawShareItem || {};
const shareItem = sharedNotification?.payload || rawShareItem?.payload || rawShareItem;
const shareType = getRouteShareType(params);
const readOnly = params.mode === "view_shared" || params.readOnly === true;

const shareItemObject =
  shareItem && typeof shareItem === "object" ? shareItem : {};

const shareContainerObject =
  shareContainer && typeof shareContainer === "object" ? shareContainer : {};

const resolvedCoordinate =
  getCoordinate(shareItemObject) ||
  getCoordinate(shareContainerObject) ||
  getCoordinate(rawShareItem || {}) ||
  getCoordinate(sharedNotification || {});

const resolvedShareItem = shareItem
  ? {
      ...shareContainerObject,
      ...shareItemObject,
      coordinate: resolvedCoordinate || shareItemObject.coordinate || shareContainerObject.coordinate || null,
      coordinates: resolvedCoordinate || shareItemObject.coordinates || shareContainerObject.coordinates || null,
      coords: resolvedCoordinate || shareItemObject.coords || shareContainerObject.coords || null,
      location: shareItemObject.location || shareContainerObject.location || resolvedCoordinate || null,
      latitude: resolvedCoordinate
        ? resolvedCoordinate.latitude
        : shareItemObject.latitude ?? shareContainerObject.latitude ?? null,
      longitude: resolvedCoordinate
        ? resolvedCoordinate.longitude
        : shareItemObject.longitude ?? shareContainerObject.longitude ?? null,
      locationLatitude: resolvedCoordinate
        ? resolvedCoordinate.latitude
        : shareItemObject.locationLatitude ?? shareContainerObject.locationLatitude ?? null,
      locationLongitude: resolvedCoordinate
        ? resolvedCoordinate.longitude
        : shareItemObject.locationLongitude ?? shareContainerObject.locationLongitude ?? null,
    }
  : null;

  const memberFromParams =
    params.member ||
    params.senderProfile ||
    params.sharedBy ||
    null;

  const [profile, setProfile] = useState(null);
  const [huntingParty, setHuntingParty] = useState([]);
  const [loading, setLoading] = useState(true);

  const [searchText, setSearchText] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState([]);

  const [busyUid, setBusyUid] = useState(null);
  const [savingSharedItem, setSavingSharedItem] = useState(false);
  const [savedSharedItem, setSavedSharedItem] = useState(false);
  const [removingShare, setRemovingShare] = useState(false);

  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [safetyTarget, setSafetyTarget] = useState(null);
  const [reportMessage, setReportMessage] = useState("");

const title = getItemTitle(resolvedShareItem || {}, shareType);
const typeLabel = getShareTypeLabel(shareType);
const notificationType = getNotificationType(shareType);
const coordinate = resolvedCoordinate || getCoordinate(resolvedShareItem || {});
const photos = getPhotos(resolvedShareItem || {});
  const shareId =
    params.shareId ||
    sharedNotification?.shareId ||
    sharedNotification?.relatedId ||
    shareContainer?.shareId ||
    shareContainer?.relatedId ||
resolvedShareItem?.shareId ||
resolvedShareItem?.id ||
    "";

  const canShare = !!user?.uid && !!shareItem && !readOnly;

  const ownerProfile = useMemo(() => {
    if (readOnly) {
      if (memberFromParams) return memberFromParams;

      return {
        uid:
          sharedNotification?.senderUid ||
          shareContainer?.senderUid ||
          shareContainer?.ownerUid ||
          params.memberUid ||
          "",
        displayName:
          sharedNotification?.senderName ||
          shareContainer?.senderName ||
          shareContainer?.ownerName ||
          "DuckSmart User",
        duckId:
          sharedNotification?.senderDuckId ||
          shareContainer?.senderDuckId ||
          shareContainer?.ownerDuckId ||
          "",
        duckIdLower:
          sharedNotification?.senderDuckId ||
          shareContainer?.senderDuckId ||
          shareContainer?.ownerDuckId ||
          "",
        photoURL:
          sharedNotification?.senderPhotoURL ||
          shareContainer?.senderPhotoURL ||
          shareContainer?.ownerPhotoURL ||
          null,
      };
    }

    return profile;
  }, [readOnly, memberFromParams, sharedNotification, shareContainer, params.memberUid, profile]);

  const filteredHuntingParty = useMemo(() => {
    return (Array.isArray(huntingParty) ? huntingParty : []).filter((member) => {
      const status = String(member?.status || "").toLowerCase();
      return member?.uid && (status === "active" || status === "approved");
    });
  }, [huntingParty]);

  const alreadySaved = useMemo(() => {
    if (!readOnly || !shareId) return false;

    if (isSharedPinType(shareType)) {
      return (Array.isArray(pins) ? pins : []).some(
        (pin) => pin.importedFromShareId === shareId
      );
    }

    return (Array.isArray(logs) ? logs : []).some(
      (log) => log.importedFromShareId === shareId
    );
  }, [readOnly, shareId, shareType, pins, logs]);

  const canRemoveShare = useMemo(() => {
    if (!user?.uid || !shareId) return false;

    const direction = String(shareContainer?.direction || params.direction || "").toLowerCase();

    if (direction === "shared_by_me") return true;
    if (shareContainer?.ownerUid === user.uid) return true;
    if (shareContainer?.senderUid === user.uid) return true;
    if (shareContainer?.createdBy === user.uid) return true;
    if (shareContainer?.sharedFromUid === user.uid) return true;

    return false;
  }, [user?.uid, shareId, shareContainer, params.direction]);

  useEffect(() => {
    let mounted = true;

    async function loadInitial() {
      if (!user?.uid) {
        setLoading(false);
        return;
      }

      setLoading(true);

      try {
        const loadedProfile = await loadUserProfile(user.uid);

        if (readOnly) {
          if (!mounted) return;
          setProfile(loadedProfile || null);
          setHuntingParty([]);
          return;
        }

        const loadedParty = await loadHuntingParty(user.uid);

        if (!mounted) return;

        setProfile(loadedProfile || null);
        setHuntingParty(Array.isArray(loadedParty) ? loadedParty : []);
      } catch (err) {
        console.log("DuckSmart share screen load error:", err?.message || err);

        if (mounted) {
          setProfile(null);
          setHuntingParty([]);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadInitial();

    return () => {
      mounted = false;
    };
  }, [user?.uid, readOnly]);

  useEffect(() => {
    if (!user?.uid || readOnly) return;

    const queryText = searchText.trim();

    if (queryText.length < 2) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }

    let cancelled = false;

    setSearchLoading(true);

    const timer = setTimeout(async () => {
      try {
        const results = await searchUsersForHuntingParty(queryText, {
          currentUid: user.uid,
          limit: 16,
        });

        if (cancelled) return;

        const partyUidSet = new Set(filteredHuntingParty.map((item) => item.uid));

        const filtered = (Array.isArray(results) ? results : []).filter((item) => {
          if (!item?.uid) return false;
          if (item.uid === user.uid) return false;
          if (partyUidSet.has(item.uid)) return false;
          return true;
        });

        setSearchResults(filtered);
      } catch (err) {
        console.log("DuckSmart share search error:", err?.message || err);

        if (!cancelled) {
          setSearchResults([]);
        }
      } finally {
        if (!cancelled) {
          setSearchLoading(false);
        }
      }
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchText, user?.uid, filteredHuntingParty, readOnly]);

  function handleBack() {
    if (readOnly) {
      if (typeof openGroupScreen === "function") {
        openGroupScreen();
        return;
      }

      navigation.navigate("GroupScreen");
      return;
    }

    navigation.goBack();
  }

  async function openPaywall(limitType) {
    Alert.alert(
      "DuckSmart Pro Required",
      `Free accounts can save up to ${FREE_SHARED_SAVE_LIMIT} ${limitType}. Upgrade to Pro for unlimited saved shared items.`,
      [
        { text: "Not Now", style: "cancel" },
        {
          text: "Upgrade to Pro",
          onPress: () => purchase(yearlyPackage || annualPackage || monthlyPackage),
        },
      ]
    );
  }

  async function saveSharedItemToAccount() {
    if (!readOnly || !resolvedShareItem || savingSharedItem) return;

    if (alreadySaved || savedSharedItem) {
      Alert.alert("Already Saved", "This shared item is already saved to your account.");
      return;
    }

    if (isSharedPinType(shareType)) {
      if (!addPin) {
        Alert.alert("Save Error", "Pin saving is not connected in this build.");
        return;
      }

      if (!isPro && Array.isArray(pins) && pins.length >= FREE_SHARED_SAVE_LIMIT) {
        openPaywall("pins");
        return;
      }

      try {
        setSavingSharedItem(true);

        const savedPin = buildSavedPinFromSharedItem({
          shareItem: resolvedShareItem,
          shareType,
          shareId,
          ownerProfile,
        });

        addPin(savedPin);
        setSavedSharedItem(true);

        Alert.alert("Pin Saved", `"${savedPin.title}" was added to your saved pins.`);
      } catch (err) {
        Alert.alert("Save Failed", err?.message || "Could not save this pin.");
      } finally {
        setSavingSharedItem(false);
      }

      return;
    }

    if (!addLog) {
      Alert.alert("Save Error", "Log saving is not connected in this build.");
      return;
    }

    if (!isPro && Array.isArray(logs) && logs.length >= FREE_SHARED_SAVE_LIMIT) {
      openPaywall("logs");
      return;
    }

    try {
      setSavingSharedItem(true);

      const savedLog = buildSavedLogFromSharedItem({
        shareItem: resolvedShareItem,
        shareType,
        shareId,
        ownerProfile,
      });

      addLog(savedLog);
      setSavedSharedItem(true);

      Alert.alert("Saved", `"${savedLog.title}" was added to your saved logs.`);
    } catch (err) {
      Alert.alert("Save Failed", err?.message || "Could not save this log.");
    } finally {
      setSavingSharedItem(false);
    }
  }

  function getSaveButtonLabel() {
    if (alreadySaved || savedSharedItem) return "Already Saved";

    if (isSharedPinType(shareType)) return "Add to Saved Pins";

    if (getNotificationType(shareType) === "shared_hunt_log") {
      return "Add to Hunt History";
    }

    return "Add to Saved Logs";
  }

  async function shareWithUser(targetProfile) {
    if (!canShare || !targetProfile?.uid || busyUid) return;

    const targetUid = cleanString(targetProfile.uid, 160);

    if (!targetUid || targetUid === user.uid) {
      Alert.alert("Share Error", "You cannot share this with yourself.");
      return;
    }

    assertFirebaseReady();

    setBusyUid(targetUid);

    try {
      const now = Date.now();
      const itemId = cleanDocId(resolvedShareItem?.id || resolvedShareItem?.shareId || title);
      const outboundShareId = `${notificationType}_${itemId}_${targetUid}_${now}`;
      const senderName = getDisplayName(profile, user);
      const senderDuckId = getDuckId(profile);
      const payload = buildSharePayload(resolvedShareItem, shareType);
      const payloadCoordinate = getCoordinate(payload);
      const payloadPhotos = getPhotos(payload);

      const senderSharedRef = doc(db, "users", user.uid, "sharedItems", outboundShareId);

      const sharedRecord = {
        id: outboundShareId,
        shareId: outboundShareId,
        ownerUid: user.uid,
        senderUid: user.uid,
        senderName,
        senderDuckId,
        recipientUid: targetUid,
        recipientName: getDisplayName(targetProfile),
        recipientDuckId: getDuckId(targetProfile),
        recipientEmail: targetProfile.emailLower || "",
        sharedWithUid: targetUid,
        sharedWithDisplayName: getDisplayName(targetProfile),
        sharedWithDuckId: getDuckId(targetProfile),
        sharedWithEmail: targetProfile.emailLower || "",
        type: notificationType,
        itemType: notificationType,
        shareType: getShareTypeForPayload(shareType),
        title: payload.title || title,
        payload,
        photoCount: payloadPhotos.length,
        coordinate: payloadCoordinate,
        latitude: payloadCoordinate ? payloadCoordinate.latitude : null,
        longitude: payloadCoordinate ? payloadCoordinate.longitude : null,
        status: "active",
        createdAt: now,
        createdAtServer: serverTimestamp(),
        updatedAt: now,
        updatedAtServer: serverTimestamp(),
      };

      await setDoc(senderSharedRef, sharedRecord, { merge: true });

      await addDoc(collection(db, "users", targetUid, "inAppNotifications"), {
        recipientUid: targetUid,
        senderUid: user.uid,
        senderName,
        senderDuckId,
        senderPhotoURL: profile?.photoURL || user?.photoURL || null,
        type: notificationType,
        title: `${senderName} shared a ${typeLabel}`,
        message: `${senderName} shared "${payload.title || title}" with you in DuckSmart.`,
        status: "unread",
        actionScreen: "ShareScreen",
        relatedId: outboundShareId,
        shareId: outboundShareId,
        shareType: getShareTypeForPayload(shareType),
        itemType: notificationType,
        payload,
        photoCount: payloadPhotos.length,
        coordinate: payloadCoordinate,
        latitude: payloadCoordinate ? payloadCoordinate.latitude : null,
        longitude: payloadCoordinate ? payloadCoordinate.longitude : null,
        createdAt: now,
        createdAtServer: serverTimestamp(),
        updatedAt: now,
        updatedAtServer: serverTimestamp(),
      });

      Alert.alert(
        "Shared",
        `"${payload.title || title}" was shared with ${getDisplayName(targetProfile)}.`
      );
    } catch (err) {
      console.log("DuckSmart in-app share failed:", err?.message || err);
      Alert.alert("Share Failed", err?.message || "Could not share this item.");
    } finally {
      setBusyUid(null);
    }
  }

  async function handleRemoveSharedItem() {
    if (!user?.uid || !shareId || removingShare) return;

    Alert.alert(
      "Remove Shared Item?",
      `Remove "${title}" from your shared list?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            setRemovingShare(true);

            try {
              await removeSharedItem(user.uid, shareId);

              Alert.alert("Removed", "This shared item has been removed.", [
                {
                  text: "OK",
                  onPress: handleBack,
                },
              ]);
            } catch (err) {
              console.log("DuckSmart remove shared item error:", err?.message || err);
              Alert.alert("Could Not Remove Share", err?.message || "Please try again.");
            } finally {
              setRemovingShare(false);
            }
          },
        },
      ]
    );
  }

  function openSafetyActions(targetProfile) {
    if (!targetProfile?.uid) {
      Alert.alert("Missing User", "Could not find this user.");
      return;
    }

    setSafetyTarget(targetProfile);
    setReportMessage("");
    setReportModalVisible(true);
  }

  async function handleBlockTarget() {
    if (!user?.uid || !safetyTarget?.uid) return;

    Alert.alert(
      "Block User?",
      `Block ${getDisplayName(safetyTarget)}? They will be removed from your Hunting Party if currently added.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Block",
          style: "destructive",
          onPress: async () => {
            try {
              await blockUser(user.uid, safetyTarget, "Blocked from ShareScreen");
              setReportModalVisible(false);
              setSafetyTarget(null);
              Alert.alert("Blocked", "This user has been blocked.");
            } catch (err) {
              Alert.alert("Block Failed", err?.message || "Could not block this user.");
            }
          },
        },
      ]
    );
  }

  async function handleSubmitReport() {
    if (!user?.uid || !safetyTarget?.uid) return;

    const message = cleanString(reportMessage, 5000);

    if (!message) {
      Alert.alert("Report Message", "Please enter a short report message.");
      return;
    }

    try {
      await submitUserReport({
        reporterUid: user.uid,
        reporterEmail: user.email || "",
        category: readOnly ? "Shared Content" : "User Report",
        reportedUid: safetyTarget.uid,
        reportedUserText:
          `${getDisplayName(safetyTarget)} ${getDuckId(safetyTarget) ? `@${getDuckId(safetyTarget)}` : ""}`.trim(),
        message,
        source: "ShareScreen",
      });

      setReportModalVisible(false);
      setSafetyTarget(null);
      setReportMessage("");

      Alert.alert("Report Sent", "DuckSmart admin will review this report.");
    } catch (err) {
      Alert.alert("Report Failed", err?.message || "Could not submit this report.");
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={s.safe}>
        <StatusBar barStyle="light-content" />
        <View style={s.loadingCardFull}>
          <ActivityIndicator color={GOLD} />
          <Text style={s.loadingText}>Loading share screen...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" />

      <ScrollView contentContainerStyle={s.container} showsVerticalScrollIndicator={false}>
        <View style={s.headerRow}>
          <Pressable style={s.backBtn} onPress={handleBack}>
            <Text style={s.backBtnText}>‹</Text>
          </Pressable>

          <View style={{ flex: 1 }}>
            <Text style={s.headerKicker}>DUCKSMART</Text>
            <Text style={s.headerTitle}>
              {readOnly ? "SHARED ITEM" : "SHARE WITHIN APP"}
            </Text>
          </View>
        </View>

        {!shareItem ? (
          <View style={s.section}>
            <SectionHeader
              eyebrow="MISSING ITEM"
              title="Nothing To Show"
              subtitle="Go back and try opening this shared item again."
            />
          </View>
        ) : !user?.uid ? (
          <View style={s.section}>
            <SectionHeader
              eyebrow="SIGN IN REQUIRED"
              title="Please Sign In"
              subtitle="You must be signed in to view or share items inside DuckSmart."
            />
          </View>
        ) : readOnly ? (
          <>
            {sharedNotification?.message ? (
              <View style={s.sharedMessageCard}>
                <Text style={s.sharedMessageKicker}>MESSAGE</Text>
                <Text style={s.sharedMessageText}>{sharedNotification.message}</Text>
              </View>
            ) : null}

            <SharedCardPreview
              item={resolvedShareItem}
              shareType={shareType}
              ownerProfile={ownerProfile}
              user={user}
              readOnly
              sharedNotification={sharedNotification}
            />

            <Pressable
              style={[
                s.saveSharedBtn,
                (savingSharedItem || alreadySaved || savedSharedItem) ? s.disabledBtn : null,
              ]}
              onPress={saveSharedItemToAccount}
              disabled={savingSharedItem || alreadySaved || savedSharedItem}
            >
              <Text style={s.saveSharedBtnText}>
                {savingSharedItem ? "Saving..." : getSaveButtonLabel()}
              </Text>
            </Pressable>

            {canRemoveShare ? (
              <Pressable
                style={[s.removeShareBtn, removingShare ? s.disabledBtn : null]}
                onPress={handleRemoveSharedItem}
                disabled={removingShare}
              >
                <Text style={s.removeShareBtnText}>
                  {removingShare ? "Removing..." : "Remove Shared Item"}
                </Text>
              </Pressable>
            ) : null}

            {ownerProfile?.uid && ownerProfile.uid !== user.uid ? (
              <Pressable
                style={s.bottomReportTextBtn}
                onPress={() => openSafetyActions(ownerProfile)}
              >
                <Text style={s.bottomReportText}>Report / Block User</Text>
              </Pressable>
            ) : null}
          </>
        ) : (
          <>
            <SharedCardPreview
              item={resolvedShareItem}
              shareType={shareType}
              ownerProfile={ownerProfile}
              user={user}
              readOnly={false}
            />

            {isSharedPinType(shareType) && !coordinate ? (
              <View style={s.warningCard}>
                <Text style={s.warningTitle}>GPS Required</Text>
                <Text style={s.warningText}>
                  This pin is missing coordinates, so it cannot be shared as a working map pin.
                </Text>
              </View>
            ) : null}

            <View style={s.section}>
              <SectionHeader
                eyebrow="HUNTING PARTY"
                title="Share With Hunting Party"
                subtitle="Choose an approved hunting partner below."
              />

              {filteredHuntingParty.length > 0 ? (
                filteredHuntingParty.map((member) => (
                  <RecipientRow
                    key={member.uid}
                    item={member}
                    currentUser={user}
                    busy={busyUid === member.uid}
                    onShare={shareWithUser}
                  />
                ))
              ) : (
                <View style={s.emptyCard}>
                  <Text style={s.emptyTitle}>No Approved Hunting Party Yet</Text>
                  <Text style={s.emptyText}>
                    Add hunting partners from Groups before sharing directly.
                  </Text>
                </View>
              )}
            </View>

            <View style={s.section}>
              <SectionHeader
                eyebrow="DIRECT SEARCH"
                title="Find Another DuckSmart User"
                subtitle="Search by name, email, or DuckSmart ID."
              />

              <View style={s.searchBox}>
                <TextInput
                  value={searchText}
                  onChangeText={setSearchText}
                  placeholder="Search name, email, or DuckSmart ID..."
                  placeholderTextColor="rgba(255,255,255,0.34)"
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={s.searchInput}
                />

                {searchLoading ? (
                  <ActivityIndicator color={GOLD} size="small" />
                ) : searchText ? (
                  <Pressable
                    style={s.clearSearchBtn}
                    onPress={() => {
                      setSearchText("");
                      setSearchResults([]);
                    }}
                  >
                    <Text style={s.clearSearchText}>×</Text>
                  </Pressable>
                ) : null}
              </View>

              {searchText.trim().length >= 2 ? (
                <View style={s.searchResultsBox}>
                  {searchLoading ? (
                    <Text style={s.emptyText}>Searching...</Text>
                  ) : searchResults.length > 0 ? (
                    searchResults.map((result) => (
                      <RecipientRow
                        key={result.uid}
                        item={result}
                        currentUser={user}
                        busy={busyUid === result.uid}
                        onShare={shareWithUser}
                      />
                    ))
                  ) : (
                    <Text style={s.emptyText}>No available users found.</Text>
                  )}
                </View>
              ) : null}
            </View>
          </>
        )}

        <View style={{ height: 30 }} />
      </ScrollView>

      <Modal
        visible={reportModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setReportModalVisible(false)}
      >
        <View style={s.modalBackdrop}>
          <View style={s.reportModalCard}>
            <View style={s.reportModalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={s.reportKicker}>SAFETY</Text>
                <Text style={s.reportTitle}>Report / Block User</Text>
              </View>

              <Pressable
                style={s.modalCloseBtn}
                onPress={() => setReportModalVisible(false)}
              >
                <Text style={s.modalCloseText}>✕</Text>
              </Pressable>
            </View>

            {safetyTarget ? (
              <View style={s.reportUserRow}>
                <UserAvatar profile={safetyTarget} user={user} size={44} />

                <View style={{ flex: 1 }}>
                  <Text style={s.reportUserName}>{getDisplayName(safetyTarget)}</Text>
                  <Text style={s.reportUserHandle}>
                    {getDuckId(safetyTarget) ? `@${getDuckId(safetyTarget)}` : "DuckSmart User"}
                  </Text>
                </View>
              </View>
            ) : null}

            <Text style={s.reportLabel}>Report message</Text>
            <TextInput
              value={reportMessage}
              onChangeText={setReportMessage}
              placeholder="Tell admin what happened..."
              placeholderTextColor="rgba(255,255,255,0.34)"
              multiline
              style={s.reportInput}
            />

            <Pressable style={s.reportSubmitBtn} onPress={handleSubmitReport}>
              <Text style={s.reportSubmitText}>Submit Report</Text>
            </Pressable>

            <Pressable style={s.blockSubmitBtn} onPress={handleBlockTarget}>
              <Text style={s.blockSubmitText}>Block User</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: BG,
  },
  container: {
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 40,
  },

  headerRow: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  backBtnText: {
    color: COLORS.white,
    fontSize: 30,
    fontWeight: "900",
    marginTop: -3,
  },
  headerKicker: {
    color: GOLD,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  headerTitle: {
    color: COLORS.white,
    fontSize: 25,
    fontWeight: "900",
    letterSpacing: 0.3,
    marginTop: 1,
  },

  loadingCardFull: {
    flex: 1,
    backgroundColor: BG,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    color: MUTED,
    fontSize: 13,
    fontWeight: "800",
    marginTop: 10,
  },

  section: {
    marginBottom: 10,
    padding: 12,
    borderRadius: 18,
    backgroundColor: SECTION_BG,
    borderWidth: 1,
    borderColor: BORDER,
  },
  sectionHeaderBlock: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 12,
    gap: 10,
  },
  sectionEyebrow: {
    color: GOLD,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
    marginBottom: 4,
  },
  sectionTitle: {
    color: COLORS.white,
    fontSize: 17,
    fontWeight: "900",
  },
  sectionSub: {
    color: MUTED,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
    marginTop: 5,
  },
  sectionRight: {
    alignItems: "flex-end",
  },

  shareCard: {
    marginBottom: 10,
    padding: 12,
    borderRadius: 18,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
  },
  shareCardTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  shareIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: "rgba(217,168,76,0.12)",
    borderWidth: 1,
    borderColor: GOLD_BORDER,
    alignItems: "center",
    justifyContent: "center",
  },
  shareIcon: {
    fontSize: 23,
  },
  shareCardEyebrow: {
    color: GOLD,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
  },
  shareCardTitle: {
    color: COLORS.white,
    fontSize: 21,
    fontWeight: "900",
    marginTop: 3,
  },
  shareCardDate: {
    color: MUTED_DARK,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 4,
  },

  sharedMapWrap: {
    height: 220,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: GOLD_BORDER,
    backgroundColor: BG,
    marginBottom: 10,
  },
  sharedMap: {
    flex: 1,
  },
  sharedMapFooter: {
    minHeight: 34,
    backgroundColor: "rgba(5,9,10,0.94)",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  sharedMapText: {
    color: GOLD,
    fontSize: 12,
    fontWeight: "900",
  },
  missingMapBox: {
    borderRadius: 16,
    backgroundColor: "rgba(255,77,77,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,77,77,0.34)",
    padding: 12,
    marginBottom: 10,
  },
  missingMapTitle: {
    color: RED,
    fontSize: 14,
    fontWeight: "900",
  },
  missingMapText: {
    color: MUTED,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 17,
    marginTop: 5,
  },

  previewImage: {
    width: "100%",
    height: 210,
    borderRadius: 16,
    backgroundColor: BG,
    marginBottom: 10,
  },
  photoStrip: {
    gap: 8,
    paddingBottom: 4,
    marginBottom: 10,
  },
  photoThumb: {
    width: 78,
    height: 78,
    borderRadius: 14,
    backgroundColor: BG,
  },

  detailGrid: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
  },
  detailBox: {
    flex: 1,
    borderRadius: 14,
    backgroundColor: CARD_SOFT,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 10,
  },
  detailLabel: {
    color: MUTED_DARK,
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  detailValue: {
    color: COLORS.white,
    fontSize: 12,
    fontWeight: "900",
    marginTop: 6,
  },
  detailsBlock: {
    borderRadius: 16,
    backgroundColor: CARD_SOFT,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 10,
    marginBottom: 10,
  },
  detailsBlockTitle: {
    color: COLORS.white,
    fontSize: 13,
    fontWeight: "900",
    marginBottom: 8,
  },
  detailRow: {
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
    paddingVertical: 8,
  },
  detailRowLabel: {
    color: MUTED_DARK,
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  detailRowValue: {
    color: MUTED,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 18,
    marginTop: 4,
  },
  notesBox: {
    borderRadius: 16,
    backgroundColor: "rgba(217,168,76,0.07)",
    borderWidth: 1,
    borderColor: GOLD_BORDER,
    padding: 10,
    marginBottom: 10,
  },
  notesLabel: {
    color: GOLD,
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
    marginBottom: 5,
  },
  notesText: {
    color: MUTED,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 19,
  },
  ownerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.07)",
    paddingTop: 10,
  },
  ownerLabel: {
    color: MUTED_DARK,
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  ownerName: {
    color: COLORS.white,
    fontSize: 13,
    fontWeight: "900",
    marginTop: 3,
  },

  sharedMessageCard: {
    marginBottom: 10,
    padding: 12,
    borderRadius: 18,
    backgroundColor: "rgba(77,163,255,0.07)",
    borderWidth: 1,
    borderColor: BLUE_BORDER,
  },
  sharedMessageKicker: {
    color: BLUE,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
    marginBottom: 5,
  },
  sharedMessageText: {
    color: COLORS.white,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 18,
  },

  saveSharedBtn: {
    marginTop: 2,
    marginBottom: 8,
    paddingVertical: 14,
    borderRadius: 15,
    backgroundColor: GOLD,
    alignItems: "center",
  },
  saveSharedBtnText: {
    color: BG,
    fontSize: 14,
    fontWeight: "900",
  },
  removeShareBtn: {
    marginTop: 2,
    marginBottom: 8,
    paddingVertical: 14,
    borderRadius: 15,
    backgroundColor: "rgba(255,77,77,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,77,77,0.48)",
    alignItems: "center",
  },
  removeShareBtnText: {
    color: RED,
    fontSize: 14,
    fontWeight: "900",
  },

  warningCard: {
    marginBottom: 10,
    padding: 12,
    borderRadius: 18,
    backgroundColor: "rgba(255,77,77,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,77,77,0.34)",
  },
  warningTitle: {
    color: RED,
    fontSize: 14,
    fontWeight: "900",
  },
  warningText: {
    color: MUTED,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 17,
    marginTop: 5,
  },

  bottomReportTextBtn: {
    alignSelf: "center",
    paddingVertical: 12,
    paddingHorizontal: 18,
    marginTop: 8,
    marginBottom: 8,
  },
  bottomReportText: {
    color: RED,
    fontSize: 13,
    fontWeight: "900",
    textAlign: "center",
    textDecorationLine: "none",
  },

  recipientRow: {
    minHeight: 68,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "rgba(255,255,255,0.035)",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    marginBottom: 8,
  },
  recipientName: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: "900",
  },
  recipientHandle: {
    color: MUTED,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 3,
  },

  userAvatar: {
    backgroundColor: BG,
  },
  userAvatarFallback: {
    backgroundColor: "rgba(217,168,76,0.14)",
    borderWidth: 1,
    borderColor: GOLD_BORDER,
    alignItems: "center",
    justifyContent: "center",
  },
  userAvatarInitials: {
    color: GOLD,
    fontWeight: "900",
  },

  shareUserBtn: {
    minWidth: 68,
    height: 38,
    borderRadius: 13,
    backgroundColor: "rgba(217,168,76,0.12)",
    borderWidth: 1,
    borderColor: GOLD,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  shareUserBtnText: {
    color: GOLD,
    fontSize: 12,
    fontWeight: "900",
  },
  disabledBtn: {
    opacity: 0.55,
  },

  emptyCard: {
    borderRadius: 16,
    backgroundColor: CARD_SOFT,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 12,
  },
  emptyTitle: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: "900",
  },
  emptyText: {
    color: MUTED,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 18,
    marginTop: 5,
  },

  searchBox: {
    minHeight: 48,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "rgba(255,255,255,0.04)",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    color: COLORS.white,
    fontSize: 14,
    fontWeight: "800",
    paddingVertical: 10,
  },
  clearSearchBtn: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  clearSearchText: {
    color: COLORS.white,
    fontSize: 20,
    fontWeight: "900",
    marginTop: -2,
  },
  searchResultsBox: {
    marginTop: 10,
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.74)",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
  },
  reportModalCard: {
    width: "100%",
    maxHeight: "86%",
    borderRadius: 18,
    backgroundColor: BG,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
  },
  reportModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  reportKicker: {
    color: RED,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
  },
  reportTitle: {
    color: COLORS.white,
    fontSize: 19,
    fontWeight: "900",
    marginTop: 3,
  },
  modalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.05)",
    alignItems: "center",
    justifyContent: "center",
  },
  modalCloseText: {
    color: COLORS.white,
    fontSize: 18,
    fontWeight: "900",
  },
  reportUserRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 16,
    backgroundColor: CARD_SOFT,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 10,
    marginBottom: 12,
  },
  reportUserName: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: "900",
  },
  reportUserHandle: {
    color: MUTED,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 3,
  },
  reportLabel: {
    color: MUTED,
    fontSize: 11,
    fontWeight: "900",
    marginBottom: 8,
    textTransform: "uppercase",
  },
  reportInput: {
    minHeight: 100,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "rgba(255,255,255,0.04)",
    color: COLORS.white,
    paddingHorizontal: 12,
    paddingVertical: 10,
    textAlignVertical: "top",
    fontSize: 14,
    fontWeight: "800",
  },
  reportSubmitBtn: {
    marginTop: 12,
    height: 48,
    borderRadius: 15,
    backgroundColor: GOLD,
    alignItems: "center",
    justifyContent: "center",
  },
  reportSubmitText: {
    color: BG,
    fontSize: 14,
    fontWeight: "900",
  },
  blockSubmitBtn: {
    marginTop: 10,
    height: 48,
    borderRadius: 15,
    backgroundColor: "rgba(255,77,77,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,77,77,0.48)",
    alignItems: "center",
    justifyContent: "center",
  },
  blockSubmitText: {
    color: RED,
    fontSize: 14,
    fontWeight: "900",
  },
});