// DuckSmart — Firestore + Storage Sync Service
//
// Local-first cloud sync for ALL users. All functions are safe to
// call from any context — they silently no-op if something goes wrong.
// Failures are logged to console but never block the UI or crash the app.
//
// Data flow:
//   Local write → AsyncStorage (offline cache) → Firestore push (this module)
//   App launch  → AsyncStorage load (offline) → Firestore pull + merge (this module)
//
// Photos are uploaded to Firebase Storage and their download URLs
// are stored in the Firestore log document.

import { db, storage } from "./firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  writeBatch,
} from "firebase/firestore";
import {
  ref,
  uploadBytes,
  getDownloadURL,
  listAll,
  deleteObject,
} from "firebase/storage";
import { Platform } from "react-native";
import Constants from "expo-constants";

// ---------------------------------------------------------------------------
// Device info helper (for user profile)
// ---------------------------------------------------------------------------

let Device = null;
try {
  Device = require("expo-device");
} catch (_) {
  /* expo-device not available */
}

function getDeviceInfo() {
  return {
    platform: Platform.OS,
    osVersion: String(Platform.Version),
    appVersion: Constants.expoConfig?.version || "1.0.0",
    model: Device?.modelName || null,
    brand: Device?.brand || null,
    manufacturer: Device?.manufacturer || null,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BATCH_LIMIT = 450; // Firestore max is 500, leave headroom

/** Check if a URI is a local file path (not a cloud URL) */
function isLocalUri(uri) {
  return uri && !uri.startsWith("https://");
}

/** Chunk an array into groups of `size` */
function chunk(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

// ---------------------------------------------------------------------------
// Photo upload — Firebase Storage
// ---------------------------------------------------------------------------

// In-memory cache: localUri → downloadUrl (prevents re-uploads within a session)
const uploadedPhotoCache = new Map();

/**
 * Upload a single photo to Firebase Storage.
 * Returns the photo object with the URI replaced by a download URL.
 * If already uploaded (in cache or already a URL), returns as-is.
 */
async function uploadPhoto(uid, logId, photo, index) {
  if (!photo.uri) return photo;

  // Already a cloud URL — no upload needed
  if (!isLocalUri(photo.uri)) return photo;

  // Already uploaded this session — return cached URL
  if (uploadedPhotoCache.has(photo.uri)) {
    return { ...photo, uri: uploadedPhotoCache.get(photo.uri) };
  }

  try {
    const ext = photo.uri.split(".").pop()?.split("?")[0] || "jpg";
    const filename = `photo_${index}_${Date.now()}.${ext}`;
    const storageRef = ref(storage, `users/${uid}/hunt-photos/${logId}/${filename}`);

    const response = await fetch(photo.uri);
    const blob = await response.blob();
    await uploadBytes(storageRef, blob);

    const downloadUrl = await getDownloadURL(storageRef);
    uploadedPhotoCache.set(photo.uri, downloadUrl);

    return { ...photo, uri: downloadUrl };
  } catch (err) {
    console.warn("DuckSmart sync: photo upload failed —", err.message);
    // Return original photo — sync the log without this photo's cloud URL
    return photo;
  }
}

/**
 * Upload all photos for a hunt log to Firebase Storage.
 * Returns a new photos array with cloud download URLs replacing local URIs.
 */
async function uploadLogPhotos(uid, logId, photos) {
  if (!photos || photos.length === 0) return [];
  const results = await Promise.all(
    photos.map((photo, i) => uploadPhoto(uid, logId, photo, i))
  );
  return results;
}

// ---------------------------------------------------------------------------
// Push — write local data to Firestore (background, non-blocking)
// ---------------------------------------------------------------------------

/**
 * Push all hunt logs to Firestore.
 * Uploads photos to Firebase Storage and includes download URLs in the doc.
 */
export async function pushLogs(uid, logs) {
  try {
    for (const log of logs) {
      // Upload any local photos to Storage, get download URLs
      const cloudPhotos = await uploadLogPhotos(uid, log.id, log.photos || []);

      // Build the Firestore document with cloud photo URLs
      const data = { ...log, photos: cloudPhotos, updatedAt: Date.now() };
      await setDoc(doc(db, "users", uid, "logs", log.id), data, { merge: true });
    }
  } catch (err) {
    console.warn("DuckSmart sync: pushLogs failed —", err.message);
  }
}

/**
 * Push all map pins to Firestore. Adds updatedAt.
 */
export async function pushPins(uid, pins) {
  try {
    const colRef = collection(db, "users", uid, "pins");
    const batches = chunk(pins, BATCH_LIMIT);

    for (const group of batches) {
      const batch = writeBatch(db);
      for (const pin of group) {
        const data = { ...pin, updatedAt: Date.now() };
        batch.set(doc(colRef, pin.id), data, { merge: true });
      }
      await batch.commit();
    }
  } catch (err) {
    console.warn("DuckSmart sync: pushPins failed —", err.message);
  }
}

// ---------------------------------------------------------------------------
// Pull — fetch cloud data (returns array or null on failure)
// ---------------------------------------------------------------------------

/**
 * Pull all hunt logs from Firestore for this user.
 * Returns an array of log objects, or null if the pull failed.
 */
export async function pullLogs(uid) {
  try {
    const snap = await getDocs(collection(db, "users", uid, "logs"));
    return snap.docs.map((d) => d.data());
  } catch (err) {
    console.warn("DuckSmart sync: pullLogs failed —", err.message);
    return null;
  }
}

/**
 * Pull all map pins from Firestore for this user.
 * Returns an array of pin objects, or null if the pull failed.
 */
export async function pullPins(uid) {
  try {
    const snap = await getDocs(collection(db, "users", uid, "pins"));
    return snap.docs.map((d) => d.data());
  } catch (err) {
    console.warn("DuckSmart sync: pullPins failed —", err.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Merge — "latest wins" conflict resolution
// ---------------------------------------------------------------------------

/**
 * Merge local and cloud hunt logs. For each unique log ID:
 *   - Only local → keep local
 *   - Only cloud → keep cloud (with download URL photos)
 *   - Both → keep whichever has the higher updatedAt (or createdAt)
 *
 * Preserves local photos when available (local URIs display faster).
 * Returns merged array sorted newest-first by createdAt.
 */
export function mergeLogs(localLogs, cloudLogs) {
  const map = new Map();

  // Index local logs first
  for (const log of localLogs) {
    map.set(log.id, log);
  }

  // Merge in cloud logs
  for (const cloudLog of cloudLogs) {
    const local = map.get(cloudLog.id);
    if (!local) {
      // Only exists in cloud — use cloud version (photos have download URLs)
      map.set(cloudLog.id, { ...cloudLog, photos: cloudLog.photos || [] });
    } else {
      // Exists in both — latest wins, but prefer local photos for fast display
      const localTime = local.updatedAt || local.createdAt || 0;
      const cloudTime = cloudLog.updatedAt || cloudLog.createdAt || 0;
      if (cloudTime > localTime) {
        // Cloud is newer — use cloud data but keep local photos if they exist
        const photos = local.photos?.length ? local.photos : (cloudLog.photos || []);
        map.set(cloudLog.id, { ...cloudLog, photos });
      }
      // else: local is newer or equal, keep local as-is
    }
  }

  return Array.from(map.values()).sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Merge local and cloud map pins. Same "latest wins" strategy.
 * Returns merged array sorted newest-first by createdAt.
 */
export function mergePins(localPins, cloudPins) {
  const map = new Map();

  for (const pin of localPins) {
    map.set(pin.id, pin);
  }

  for (const cloudPin of cloudPins) {
    const local = map.get(cloudPin.id);
    if (!local) {
      map.set(cloudPin.id, cloudPin);
    } else {
      const localTime = local.updatedAt || local.createdAt || 0;
      const cloudTime = cloudPin.updatedAt || cloudPin.createdAt || 0;
      if (cloudTime > localTime) {
        map.set(cloudPin.id, cloudPin);
      }
    }
  }

  return Array.from(map.values()).sort((a, b) => b.createdAt - a.createdAt);
}

// ---------------------------------------------------------------------------
// Delete — remove individual docs (+ associated Storage files) from Firebase
// ---------------------------------------------------------------------------

/** Recursively delete all files under a Storage reference */
async function deleteAllInStorageRef(storageRef) {
  try {
    const result = await listAll(storageRef);
    await Promise.all(result.items.map((item) => deleteObject(item)));
    await Promise.all(result.prefixes.map((prefix) => deleteAllInStorageRef(prefix)));
  } catch (err) {
    // Silently fail — files may not exist
    console.warn("DuckSmart sync: deleteStorage failed —", err.message);
  }
}

/** Delete a single hunt log from Firestore + its photos from Storage */
export async function pushDeleteLog(uid, logId) {
  try {
    await deleteDoc(doc(db, "users", uid, "logs", logId));
    // Also delete associated photos from Storage
    const photosRef = ref(storage, `users/${uid}/hunt-photos/${logId}`);
    await deleteAllInStorageRef(photosRef);
  } catch (err) {
    console.warn("DuckSmart sync: pushDeleteLog failed —", err.message);
  }
}

/** Delete a single map pin from Firestore */
export async function pushDeletePin(uid, pinId) {
  try {
    await deleteDoc(doc(db, "users", uid, "pins", pinId));
  } catch (err) {
    console.warn("DuckSmart sync: pushDeletePin failed —", err.message);
  }
}

// ---------------------------------------------------------------------------
// User Profile — Firestore document at users/{uid}
// ---------------------------------------------------------------------------

/**
 * Create or update the user profile document in Firestore.
 * Called on login/signup and periodically during app use.
 *
 * @param {object} firebaseUser  Firebase Auth user object
 * @param {object} extra  Additional fields: { location, isPro }
 */
export async function upsertUserProfile(firebaseUser, extra = {}) {
  if (!firebaseUser?.uid) return;

  try {
    const providerData = firebaseUser.providerData?.[0];
    const profile = {
      uid: firebaseUser.uid,
      email: firebaseUser.email || null,
      displayName: firebaseUser.displayName || providerData?.displayName || null,
      photoURL: firebaseUser.photoURL || providerData?.photoURL || null,
      authProvider: providerData?.providerId || "password",
      lastLoginAt: Date.now(),
      device: getDeviceInfo(),
    };

    // Add location if provided
    if (extra.location) {
      profile.lastKnownLocation = {
        latitude: extra.location.latitude,
        longitude: extra.location.longitude,
      };
    }

    // Add subscription status if provided
    if (extra.isPro !== undefined) {
      profile.isPro = extra.isPro;
    }

    // Check if profile already exists — only set createdAt on first creation
    const docRef = doc(db, "users", firebaseUser.uid);
    const existing = await getDoc(docRef);
    if (!existing.exists()) {
      profile.createdAt = Date.now();
    }

    // merge: true so we don't overwrite fields not included in this update
    await setDoc(docRef, profile, { merge: true });
  } catch (err) {
    console.warn("DuckSmart sync: upsertUserProfile failed —", err.message);
  }
}

// ---------------------------------------------------------------------------
// Account deletion — wipe ALL user data from Firebase
// ---------------------------------------------------------------------------

/**
 * Delete ALL Firebase data for a user (profile + logs + pins + Storage photos).
 * Must be called BEFORE deleteUser() since security rules require auth.
 */
export async function deleteAllUserData(uid) {
  try {
    // Delete user profile document
    await deleteDoc(doc(db, "users", uid)).catch(() => {});

    // Delete all logs
    const logSnap = await getDocs(collection(db, "users", uid, "logs"));
    const logChunks = chunk(logSnap.docs, BATCH_LIMIT);
    for (const group of logChunks) {
      const batch = writeBatch(db);
      group.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }

    // Delete all pins
    const pinSnap = await getDocs(collection(db, "users", uid, "pins"));
    const pinChunks = chunk(pinSnap.docs, BATCH_LIMIT);
    for (const group of pinChunks) {
      const batch = writeBatch(db);
      group.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }

    // Delete all photos from Storage
    const userPhotosRef = ref(storage, `users/${uid}/hunt-photos`);
    await deleteAllInStorageRef(userPhotosRef);
  } catch (err) {
    console.warn("DuckSmart sync: deleteAllUserData failed —", err.message);
    // Still proceed with account deletion — orphaned data can be cleaned up later
  }
}
