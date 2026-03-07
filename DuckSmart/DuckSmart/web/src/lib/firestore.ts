// ---------------------------------------------------------------------------
//  DuckSmart Web — Firestore service layer
//
//  All data-access functions for the web dashboard.
//  Mirrors the React Native sync.js service, adapted for server/client reads.
// ---------------------------------------------------------------------------

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  updateDoc,
  query,
  orderBy,
  where,
  limit,
} from "firebase/firestore";
import { ref, listAll, deleteObject } from "firebase/storage";

import { db, storage } from "@/lib/firebase";
import type {
  UserProfile,
  UserRole,
  HuntLog,
  MapPin,
  FeedbackTicket,
  AnalyticsEvent,
} from "@/lib/types";

// ═══════════════════════════════════════════════════════════════════════════
//  User Data
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Read a user's profile document at `users/{uid}`.
 * Returns null if the document does not exist.
 */
export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) return null;
  return snap.data() as UserProfile;
}

/**
 * Update (merge) fields on a user's profile document.
 */
export async function updateUserProfile(
  uid: string,
  data: Partial<UserProfile>,
): Promise<void> {
  await setDoc(doc(db, "users", uid), data, { merge: true });
}

// ---------------------------------------------------------------------------
//  Hunt Logs
// ---------------------------------------------------------------------------

/**
 * Fetch all hunt logs for a user, ordered by createdAt descending.
 */
export async function getUserHuntLogs(uid: string): Promise<HuntLog[]> {
  const q = query(
    collection(db, "users", uid, "logs"),
    orderBy("createdAt", "desc"),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ ...d.data(), id: d.id }) as HuntLog);
}

/**
 * Fetch a single hunt log by ID.
 * Returns null if it does not exist.
 */
export async function getHuntLog(
  uid: string,
  logId: string,
): Promise<HuntLog | null> {
  const snap = await getDoc(doc(db, "users", uid, "logs", logId));
  if (!snap.exists()) return null;
  return { ...snap.data(), id: snap.id } as HuntLog;
}

/**
 * Create a new hunt log. Uses the log's own `id` as the document ID.
 */
export async function createHuntLog(uid: string, log: HuntLog): Promise<void> {
  await setDoc(doc(db, "users", uid, "logs", log.id), log);
}

/**
 * Update (merge) fields on a hunt log. Automatically sets `updatedAt`.
 */
export async function updateHuntLog(
  uid: string,
  logId: string,
  data: Partial<HuntLog>,
): Promise<void> {
  await setDoc(
    doc(db, "users", uid, "logs", logId),
    { ...data, updatedAt: Date.now() },
    { merge: true },
  );
}

/**
 * Delete a hunt log document and its associated photos from Storage.
 */
export async function deleteHuntLog(
  uid: string,
  logId: string,
): Promise<void> {
  // Delete Firestore document
  await deleteDoc(doc(db, "users", uid, "logs", logId));

  // Delete associated photos from Firebase Storage
  try {
    const photosRef = ref(storage, `users/${uid}/hunt-photos/${logId}`);
    const result = await listAll(photosRef);
    await Promise.all(result.items.map((item) => deleteObject(item)));
  } catch {
    // Silently ignore — photos folder may not exist for this log
  }
}

// ---------------------------------------------------------------------------
//  Map Pins
// ---------------------------------------------------------------------------

/**
 * Fetch all map pins for a user, ordered by createdAt descending.
 */
export async function getUserPins(uid: string): Promise<MapPin[]> {
  const q = query(
    collection(db, "users", uid, "pins"),
    orderBy("createdAt", "desc"),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ ...d.data(), id: d.id }) as MapPin);
}

/**
 * Create a new map pin. Uses the pin's own `id` as the document ID.
 */
export async function createPin(uid: string, pin: MapPin): Promise<void> {
  await setDoc(doc(db, "users", uid, "pins", pin.id), pin);
}

/**
 * Update (merge) fields on a map pin. Automatically sets `updatedAt`.
 */
export async function updatePin(
  uid: string,
  pinId: string,
  data: Partial<MapPin>,
): Promise<void> {
  await setDoc(
    doc(db, "users", uid, "pins", pinId),
    { ...data, updatedAt: Date.now() },
    { merge: true },
  );
}

/**
 * Delete a map pin document.
 */
export async function deletePin(uid: string, pinId: string): Promise<void> {
  await deleteDoc(doc(db, "users", uid, "pins", pinId));
}

// ═══════════════════════════════════════════════════════════════════════════
//  Admin Functions
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fetch all user profiles from the `users` collection.
 */
export async function getAllUsers(): Promise<UserProfile[]> {
  const snap = await getDocs(collection(db, "users"));
  return snap.docs.map((d) => d.data() as UserProfile);
}

/**
 * Read a user's role document at `roles/{uid}`.
 * Returns null if the document does not exist.
 */
export async function getUserRole(uid: string): Promise<UserRole | null> {
  const snap = await getDoc(doc(db, "roles", uid));
  if (!snap.exists()) return null;
  return snap.data() as UserRole;
}

/**
 * Fetch all feedback tickets, ordered by timestamp descending.
 */
export async function getAllFeedback(): Promise<FeedbackTicket[]> {
  const q = query(collection(db, "feedback"), orderBy("timestamp", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ ...d.data(), id: d.id }) as FeedbackTicket);
}

/**
 * Update the status of a feedback ticket.
 */
export async function updateFeedbackStatus(
  docId: string,
  status: string,
): Promise<void> {
  await updateDoc(doc(db, "feedback", docId), { status });
}

/**
 * Fetch analytics events with optional filters.
 *
 * @param options.startDate  Only events at or after this timestamp (ms)
 * @param options.endDate    Only events at or before this timestamp (ms)
 * @param options.eventName  Filter by event name
 * @param options.limit      Maximum number of events to return
 */
export async function getAnalyticsEvents(options: {
  startDate?: number;
  endDate?: number;
  eventName?: string;
  limit?: number;
}): Promise<AnalyticsEvent[]> {
  const constraints = [];

  if (options.startDate !== undefined) {
    constraints.push(where("timestamp", ">=", options.startDate));
  }
  if (options.endDate !== undefined) {
    constraints.push(where("timestamp", "<=", options.endDate));
  }
  if (options.eventName) {
    constraints.push(where("eventName", "==", options.eventName));
  }

  // Order by timestamp descending
  constraints.push(orderBy("timestamp", "desc"));

  if (options.limit !== undefined) {
    constraints.push(limit(options.limit));
  }

  const q = query(collection(db, "analytics"), ...constraints);
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ ...d.data(), id: d.id } as unknown as AnalyticsEvent));
}
