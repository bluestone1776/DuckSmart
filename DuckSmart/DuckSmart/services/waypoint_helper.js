//services/waypoint_helper.js

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

import { auth, db } from "./firebase";

const WAYPOINT_LOCAL_PREFIX = "@ducksmart_waypoint_paths_v1";
const WAYPOINT_ACTIVE_PREFIX = "@ducksmart_active_waypoint_v1";

const DEFAULT_MIN_DISTANCE_METERS = 8;
const DEFAULT_TIME_INTERVAL_MS = 3500;
const DEFAULT_MAX_ACCURACY_METERS = 75;

function getUserId(userId) {
  return userId || auth?.currentUser?.uid || null;
}

function getLocalStorageKey(userId) {
  return `${WAYPOINT_LOCAL_PREFIX}_${userId || "guest"}`;
}

function getActiveStorageKey(userId) {
  return `${WAYPOINT_ACTIVE_PREFIX}_${userId || "guest"}`;
}

function cleanNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function cleanWaypointCoordinate(value) {
  if (!value) return null;

  const latitude = cleanNumber(value.latitude ?? value.lat);
  const longitude = cleanNumber(value.longitude ?? value.lng ?? value.lon);

  if (latitude === null || longitude === null) return null;

  return { latitude, longitude };
}

export function normalizeWaypointPoint(value = {}) {
  const coordinate = cleanWaypointCoordinate(value);
  if (!coordinate) return null;

  return {
    latitude: coordinate.latitude,
    longitude: coordinate.longitude,
    timestamp: Number.isFinite(Number(value.timestamp))
      ? Number(value.timestamp)
      : Date.now(),
    accuracy:
      value.accuracy === undefined || value.accuracy === null
        ? null
        : cleanNumber(value.accuracy),
    altitude:
      value.altitude === undefined || value.altitude === null
        ? null
        : cleanNumber(value.altitude),
    speed:
      value.speed === undefined || value.speed === null
        ? null
        : cleanNumber(value.speed),
    heading:
      value.heading === undefined || value.heading === null
        ? null
        : cleanNumber(value.heading),
  };
}

export function getWaypointCoordinates(points = []) {
  return points.map(cleanWaypointCoordinate).filter(Boolean);
}

export function getFollowBackCoordinates(pathOrPoints) {
  const points = Array.isArray(pathOrPoints)
    ? pathOrPoints
    : pathOrPoints?.points || [];

  return getWaypointCoordinates(points).slice().reverse();
}

function toRad(value) {
  return (value * Math.PI) / 180;
}

export function getWaypointDistanceMiles(points = []) {
  const coords = getWaypointCoordinates(points);

  if (coords.length < 2) return 0;

  let total = 0;
  const earthRadiusMiles = 3958.8;

  for (let i = 1; i < coords.length; i += 1) {
    const a = coords[i - 1];
    const b = coords[i];

    const dLat = toRad(b.latitude - a.latitude);
    const dLon = toRad(b.longitude - a.longitude);

    const lat1 = toRad(a.latitude);
    const lat2 = toRad(b.latitude);

    const hav =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1) *
        Math.cos(lat2) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(hav), Math.sqrt(1 - hav));
    total += earthRadiusMiles * c;
  }

  return total;
}

export function formatWaypointDistance(miles) {
  const n = Number(miles);

  if (!Number.isFinite(n)) return "0 ft";
  if (n < 0.1) return `${Math.round(n * 5280)} ft`;

  return `${n.toFixed(2)} mi`;
}

export function getWaypointDisplayTitle(path) {
  if (path?.title) return path.title;

  const createdAt = Number(path?.createdAt || path?.startedAt || Date.now());

  return `Mapped Path ${new Date(createdAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })}`;
}

export function normalizeWaypointPath(path = {}) {
  const rawPoints = Array.isArray(path.points) ? path.points : [];

  const points = rawPoints
    .map(normalizeWaypointPoint)
    .filter(Boolean)
    .sort((a, b) => a.timestamp - b.timestamp);

  if (points.length === 0) return null;

  const id =
    path.id ||
    path.pathId ||
    path.waypointId ||
    `waypoint-${Date.now()}`;

  const startedAt = Number.isFinite(Number(path.startedAt))
    ? Number(path.startedAt)
    : points[0]?.timestamp || Date.now();

  const endedAt = Number.isFinite(Number(path.endedAt))
    ? Number(path.endedAt)
    : points[points.length - 1]?.timestamp || startedAt;

  const distanceMiles = Number.isFinite(Number(path.distanceMiles))
    ? Number(path.distanceMiles)
    : getWaypointDistanceMiles(points);

  return {
    id,
    pathId: id,
    title: path.title || getWaypointDisplayTitle({ startedAt }),
    points,
    coordinates: getWaypointCoordinates(points),
    startedAt,
    endedAt,
    createdAt: Number.isFinite(Number(path.createdAt))
      ? Number(path.createdAt)
      : startedAt,
    updatedAt: Number.isFinite(Number(path.updatedAt))
      ? Number(path.updatedAt)
      : Date.now(),
    distanceMiles,
    pointCount: points.length,
    savedOffline: path.savedOffline === true,
    syncedToFirebase: path.syncedToFirebase === true,
  };
}

async function readLocalWaypointPaths(userId) {
  try {
    const raw = await AsyncStorage.getItem(getLocalStorageKey(userId));
    const parsed = raw ? JSON.parse(raw) : [];

    if (!Array.isArray(parsed)) return [];

    return parsed
      .map(normalizeWaypointPath)
      .filter(Boolean)
      .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
  } catch {
    return [];
  }
}

async function writeLocalWaypointPaths(userId, paths) {
  const normalized = Array.isArray(paths)
    ? paths.map(normalizeWaypointPath).filter(Boolean)
    : [];

  await AsyncStorage.setItem(
    getLocalStorageKey(userId),
    JSON.stringify(normalized)
  );

  return normalized;
}

export async function loadWaypointPaths(userId) {
  const uid = getUserId(userId);

  if (!uid) {
    return readLocalWaypointPaths(null);
  }

  const localPaths = await readLocalWaypointPaths(uid);

  try {
    const ref = collection(db, "users", uid, "waypoints");
    const q = query(ref, orderBy("createdAt", "desc"));
    const snap = await getDocs(q);

    const remotePaths = snap.docs
      .map((item) =>
        normalizeWaypointPath({
          id: item.id,
          ...item.data(),
        })
      )
      .filter(Boolean);

    const mergedById = {};

    [...remotePaths, ...localPaths].forEach((path) => {
      if (!path?.id) return;

      const existing = mergedById[path.id];

      if (!existing) {
        mergedById[path.id] = path;
        return;
      }

      const existingUpdated = Number(existing.updatedAt || existing.createdAt || 0);
      const nextUpdated = Number(path.updatedAt || path.createdAt || 0);

      if (nextUpdated > existingUpdated) {
        mergedById[path.id] = path;
      }
    });

    const merged = Object.values(mergedById).sort(
      (a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0)
    );

    await writeLocalWaypointPaths(uid, merged);

    return merged;
  } catch {
    return localPaths;
  }
}

export async function saveWaypointPath(path, userId) {
  const uid = getUserId(userId);
  const normalized = normalizeWaypointPath(path);

  if (!normalized || normalized.points.length < 2) {
    return null;
  }

  const localUserId = uid || null;
  const localPaths = await readLocalWaypointPaths(localUserId);

  const offlinePath = {
    ...normalized,
    savedOffline: true,
    syncedToFirebase: false,
  };

  const nextLocal = [
    offlinePath,
    ...localPaths.filter((item) => item.id !== normalized.id),
  ];

  await writeLocalWaypointPaths(localUserId, nextLocal);

  if (!uid) {
    return offlinePath;
  }

  try {
    const ref = doc(db, "users", uid, "waypoints", normalized.id);

    const firebasePayload = {
      id: normalized.id,
      pathId: normalized.id,
      title: normalized.title,
      points: normalized.points,
      coordinates: normalized.coordinates,
      startedAt: normalized.startedAt,
      endedAt: normalized.endedAt,
      createdAt: normalized.createdAt,
      updatedAt: Date.now(),
      distanceMiles: normalized.distanceMiles,
      pointCount: normalized.pointCount,
      savedOffline: true,
      syncedToFirebase: true,
      serverUpdatedAt: serverTimestamp(),
    };

    await setDoc(ref, firebasePayload, { merge: true });

    const syncedPath = {
      ...normalized,
      updatedAt: firebasePayload.updatedAt,
      savedOffline: true,
      syncedToFirebase: true,
    };

    const syncedLocal = [
      syncedPath,
      ...localPaths.filter((item) => item.id !== normalized.id),
    ];

    await writeLocalWaypointPaths(uid, syncedLocal);

    return syncedPath;
  } catch {
    return offlinePath;
  }
}

export async function deleteWaypointPath(pathId, userId) {
  const uid = getUserId(userId);
  const localUserId = uid || null;

  const localPaths = await readLocalWaypointPaths(localUserId);
  const nextLocal = localPaths.filter((path) => path.id !== pathId);

  await writeLocalWaypointPaths(localUserId, nextLocal);

  if (uid) {
    try {
      await deleteDoc(doc(db, "users", uid, "waypoints", pathId));
    } catch {}
  }

  return nextLocal;
}

export async function syncOfflineWaypointPaths(userId) {
  const uid = getUserId(userId);
  if (!uid) return [];

  const localPaths = await readLocalWaypointPaths(uid);
  const unsynced = localPaths.filter((path) => path.syncedToFirebase !== true);

  const synced = [];

  for (const path of unsynced) {
    try {
      const saved = await saveWaypointPath(path, uid);
      if (saved) synced.push(saved);
    } catch {}
  }

  return synced;
}

export async function saveActiveWaypointDraft(session, userId) {
  const uid = getUserId(userId);

  if (!session) return null;

  try {
    await AsyncStorage.setItem(getActiveStorageKey(uid), JSON.stringify(session));
  } catch {}

  return session;
}

export async function loadActiveWaypointDraft(userId) {
  const uid = getUserId(userId);

  try {
    const raw = await AsyncStorage.getItem(getActiveStorageKey(uid));
    if (!raw) return null;

    const parsed = JSON.parse(raw);

    return {
      ...parsed,
      points: Array.isArray(parsed.points)
        ? parsed.points.map(normalizeWaypointPoint).filter(Boolean)
        : [],
    };
  } catch {
    return null;
  }
}

export async function clearActiveWaypointDraft(userId) {
  const uid = getUserId(userId);

  try {
    await AsyncStorage.removeItem(getActiveStorageKey(uid));
  } catch {}
}

export function createWaypointSession({ title, userId } = {}) {
  const now = Date.now();
  const id = `waypoint-${now}`;

  return {
    id,
    pathId: id,
    userId: getUserId(userId),
    title: title || `Mapped Path ${new Date(now).toLocaleDateString()}`,
    points: [],
    startedAt: now,
    createdAt: now,
    updatedAt: now,
    status: "recording",
  };
}

export async function startWaypointRecording({
  userId,
  title,
  onPoint,
  onPointsChange,
  onStatus,
  onError,
  minDistanceMeters = DEFAULT_MIN_DISTANCE_METERS,
  timeIntervalMs = DEFAULT_TIME_INTERVAL_MS,
  maxAccuracyMeters = DEFAULT_MAX_ACCURACY_METERS,
} = {}) {
  const uid = getUserId(userId);
  const session = createWaypointSession({ title, userId: uid });

  let stopped = false;
  let intervalId = null;
  let collectInFlight = false;
  let latestSession = session;

  function safeStatus(message) {
    if (typeof onStatus === "function") {
      try {
        onStatus(message);
      } catch {}
    }
  }

  function safeError(err) {
    if (typeof onError === "function") {
      try {
        onError(err);
      } catch {}
    }
  }

  function updateSession(nextPoint) {
    if (stopped || !nextPoint) return latestSession;

    const previousPoint = latestSession.points[latestSession.points.length - 1];

    if (previousPoint) {
      const movedMiles = getWaypointDistanceMiles([previousPoint, nextPoint]);
      const movedMeters = movedMiles * 1609.344;

      if (movedMeters < Math.max(1, minDistanceMeters * 0.5)) {
        return latestSession;
      }
    }

    latestSession = {
      ...latestSession,
      points: [...latestSession.points, nextPoint],
      updatedAt: Date.now(),
    };

    saveActiveWaypointDraft(latestSession, uid).catch(() => {});

    if (typeof onPoint === "function") {
      try {
        onPoint(nextPoint, latestSession);
      } catch {}
    }

    if (typeof onPointsChange === "function") {
      try {
        onPointsChange(latestSession.points, latestSession);
      } catch {}
    }

    return latestSession;
  }

  async function collectPoint() {
    if (stopped || collectInFlight) return;

    collectInFlight = true;

    try {
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      if (stopped || !location?.coords) return;

      const accuracy = cleanNumber(location.coords.accuracy);

      if (
        accuracy !== null &&
        maxAccuracyMeters > 0 &&
        accuracy > maxAccuracyMeters
      ) {
        safeStatus(`Waiting for better GPS... ±${Math.round(accuracy)}m`);
        return;
      }

      const point = normalizeWaypointPoint({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy,
        altitude: location.coords.altitude,
        speed: location.coords.speed,
        heading: location.coords.heading,
        timestamp: location.timestamp || Date.now(),
      });

      updateSession(point);
      safeStatus(`Mapping path... ${latestSession.points.length} points`);
    } catch (err) {
      safeStatus("Still trying to get GPS...");
      safeError(err);
    } finally {
      collectInFlight = false;
    }
  }

  try {
    const foreground = await Location.requestForegroundPermissionsAsync();

    if (foreground.status !== "granted") {
      throw new Error("Location permission is required to map your path.");
    }

    safeStatus("Starting GPS path mapping...");

    await collectPoint();

    intervalId = setInterval(() => {
      collectPoint();
    }, Math.max(1500, timeIntervalMs));

    safeStatus("Mapping path...");

    return {
      id: session.id,

      getSession: () => latestSession,

      stop: async ({ save = true } = {}) => {
        stopped = true;

        if (intervalId) {
          clearInterval(intervalId);
          intervalId = null;
        }

        await clearActiveWaypointDraft(uid);

        const points = Array.isArray(latestSession.points)
          ? latestSession.points
          : [];

        if (!save || points.length < 2) {
          return null;
        }

        const finished = normalizeWaypointPath({
          ...latestSession,
          status: "finished",
          endedAt: Date.now(),
          updatedAt: Date.now(),
        });

        if (!finished || finished.points.length < 2) {
          return null;
        }

        return saveWaypointPath(finished, uid);
      },

      cancel: async () => {
        stopped = true;

        if (intervalId) {
          clearInterval(intervalId);
          intervalId = null;
        }

        await clearActiveWaypointDraft(uid);
        return null;
      },
    };
  } catch (err) {
    stopped = true;

    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }

    safeError(err);
    throw err;
  }
}

export async function stopWaypointRecording(controller, options = {}) {
  if (!controller || typeof controller.stop !== "function") {
    return null;
  }

  try {
    return await controller.stop(options);
  } catch {
    return null;
  }
}

export function getNearestWaypointPoint(pathOrPoints, currentLocation) {
  const current = cleanWaypointCoordinate(currentLocation);
  const points = Array.isArray(pathOrPoints)
    ? pathOrPoints
    : pathOrPoints?.points || [];

  const coords = getWaypointCoordinates(points);

  if (!current || coords.length === 0) return null;

  let best = null;
  let bestMiles = Infinity;

  coords.forEach((point, index) => {
    const miles = getWaypointDistanceMiles([current, point]);

    if (miles < bestMiles) {
      bestMiles = miles;
      best = {
        ...point,
        index,
        distanceMiles: miles,
      };
    }
  });

  return best;
}

export function getWaypointSummary(path) {
  const normalized = normalizeWaypointPath(path);

  if (!normalized) {
    return {
      title: "Mapped Path",
      pointCount: 0,
      distanceText: "0 ft",
      startedText: "",
    };
  }

  return {
    title: getWaypointDisplayTitle(normalized),
    pointCount: normalized.points.length,
    distanceText: formatWaypointDistance(normalized.distanceMiles),
    startedText: new Date(normalized.startedAt).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }),
  };
}