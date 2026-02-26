// DuckSmart — Firestore Sync Service
//
// Local-first cloud sync for Pro users. All functions are safe to
// call from any context — they silently no-op if something goes wrong.
// Failures are logged to console but never block the UI or crash the app.
//
// Data flow:
//   Local write → AsyncStorage (existing) → Firestore push (this module)
//   App launch  → AsyncStorage load (existing) → Firestore pull + merge (this module)

import { db } from "./firebase";
import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  writeBatch,
} from "firebase/firestore";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BATCH_LIMIT = 450; // Firestore max is 500, leave headroom

/** Strip the photos array before pushing — local file URIs aren't cloud-syncable */
function stripPhotos(log) {
  const { photos, ...rest } = log;
  return rest;
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
// Push — write local data to Firestore (background, non-blocking)
// ---------------------------------------------------------------------------

/**
 * Push all hunt logs to Firestore. Strips photos, adds updatedAt.
 * Uses batched writes for efficiency (chunked to stay under 500 limit).
 */
export async function pushLogs(uid, logs) {
  try {
    const colRef = collection(db, "users", uid, "logs");
    const batches = chunk(logs, BATCH_LIMIT);

    for (const group of batches) {
      const batch = writeBatch(db);
      for (const log of group) {
        const data = { ...stripPhotos(log), updatedAt: Date.now() };
        batch.set(doc(colRef, log.id), data, { merge: true });
      }
      await batch.commit();
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
 *   - Only cloud → keep cloud (with empty photos array)
 *   - Both → keep whichever has the higher updatedAt (or createdAt)
 *
 * Always preserves local photos array (cloud docs never have photos).
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
      // Only exists in cloud — add it (photos won't exist, default to empty)
      map.set(cloudLog.id, { ...cloudLog, photos: cloudLog.photos || [] });
    } else {
      // Exists in both — latest wins, but always keep local photos
      const localTime = local.updatedAt || local.createdAt || 0;
      const cloudTime = cloudLog.updatedAt || cloudLog.createdAt || 0;
      if (cloudTime > localTime) {
        map.set(cloudLog.id, { ...cloudLog, photos: local.photos || [] });
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
// Delete — remove individual docs from Firestore
// ---------------------------------------------------------------------------

/** Delete a single hunt log from Firestore */
export async function pushDeleteLog(uid, logId) {
  try {
    await deleteDoc(doc(db, "users", uid, "logs", logId));
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
// Account deletion — wipe all user data from Firestore
// ---------------------------------------------------------------------------

/**
 * Delete ALL Firestore data for a user (logs + pins).
 * Must be called BEFORE deleteUser() since security rules require auth.
 */
export async function deleteAllUserData(uid) {
  try {
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
  } catch (err) {
    console.warn("DuckSmart sync: deleteAllUserData failed —", err.message);
    // Still proceed with account deletion — orphaned data can be cleaned up later
  }
}
