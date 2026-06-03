// DuckSmart — In-App Notifications Service
//
// Stores notifications at:
// users/{uid}/inAppNotifications/{notificationId}
//
// Used for:
// - Hunting Party requests
// - Shared hunt logs
// - Shared pins
// - Shared decoy spreads
// - Shared scouting logs

import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit as firestoreLimit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";

import { auth, db, isFirebaseConfigValid } from "./firebase";

function assertFirebaseReady() {
  if (!isFirebaseConfigValid) {
    throw new Error("Firebase is not configured for this build.");
  }
}

function cleanString(value, maxLength = 500) {
  if (value === undefined || value === null) return "";
  return String(value).trim().slice(0, maxLength);
}

function normalizeNotification(data = {}, id = "") {
  return {
    id,
    recipientUid: data.recipientUid || "",
    senderUid: data.senderUid || "",
    senderName: data.senderName || "DuckSmart User",
    senderDuckId: data.senderDuckId || "",
    type: data.type || "general",
    title: data.title || "DuckSmart Notification",
    message: data.message || "",
    status: data.status || "unread",
    actionScreen: data.actionScreen || "GroupScreen",
    relatedId: data.relatedId || "",
    createdAt: data.createdAt || 0,
    updatedAt: data.updatedAt || 0,
  };
}

export async function createInAppNotification({
  recipientUid,
  senderUid = "",
  senderName = "DuckSmart User",
  senderDuckId = "",
  type = "general",
  title = "DuckSmart Notification",
  message = "",
  actionScreen = "GroupScreen",
  relatedId = "",
} = {}) {
  assertFirebaseReady();

  const safeRecipientUid = cleanString(recipientUid || "", 160);

  if (!safeRecipientUid) {
    throw new Error("Missing notification recipient.");
  }

  const now = Date.now();

  const ref = await addDoc(
    collection(db, "users", safeRecipientUid, "inAppNotifications"),
    {
      recipientUid: safeRecipientUid,
      senderUid: cleanString(senderUid, 160),
      senderName: cleanString(senderName, 120),
      senderDuckId: cleanString(senderDuckId, 80),
      type: cleanString(type, 80),
      title: cleanString(title, 160),
      message: cleanString(message, 500),
      status: "unread",
      actionScreen: cleanString(actionScreen, 80),
      relatedId: cleanString(relatedId, 200),
      createdAt: now,
      createdAtServer: serverTimestamp(),
      updatedAt: now,
      updatedAtServer: serverTimestamp(),
    }
  );

  return ref.id;
}

export async function loadUnreadInAppNotifications(uid = null) {
  assertFirebaseReady();

  const safeUid = cleanString(uid || auth.currentUser?.uid || "", 160);

  if (!safeUid) return [];

  const notificationsRef = collection(db, "users", safeUid, "inAppNotifications");

  let snap;

  try {
    const q = query(
      notificationsRef,
      where("status", "==", "unread"),
      orderBy("createdAt", "desc"),
      firestoreLimit(20)
    );

    snap = await getDocs(q);
  } catch {
    snap = await getDocs(notificationsRef);
  }

  return snap.docs
    .map((item) => normalizeNotification(item.data(), item.id))
    .filter((item) => item.status === "unread")
    .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
}

export async function loadAllInAppNotifications(uid = null) {
  assertFirebaseReady();

  const safeUid = cleanString(uid || auth.currentUser?.uid || "", 160);

  if (!safeUid) return [];

  const notificationsRef = collection(db, "users", safeUid, "inAppNotifications");

  let snap;

  try {
    const q = query(
      notificationsRef,
      orderBy("createdAt", "desc"),
      firestoreLimit(50)
    );

    snap = await getDocs(q);
  } catch {
    snap = await getDocs(notificationsRef);
  }

  return snap.docs
    .map((item) => normalizeNotification(item.data(), item.id))
    .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
}

export async function markInAppNotificationRead(uid, notificationId) {
  assertFirebaseReady();

  const safeUid = cleanString(uid || auth.currentUser?.uid || "", 160);
  const safeNotificationId = cleanString(notificationId, 200);

  if (!safeUid || !safeNotificationId) return false;

  await updateDoc(doc(db, "users", safeUid, "inAppNotifications", safeNotificationId), {
    status: "read",
    viewedAt: Date.now(),
    viewedAtServer: serverTimestamp(),
    updatedAt: Date.now(),
    updatedAtServer: serverTimestamp(),
  });

  return true;
}

export async function markInAppNotificationActioned(uid, notificationId) {
  assertFirebaseReady();

  const safeUid = cleanString(uid || auth.currentUser?.uid || "", 160);
  const safeNotificationId = cleanString(notificationId, 200);

  if (!safeUid || !safeNotificationId) return false;

  await updateDoc(doc(db, "users", safeUid, "inAppNotifications", safeNotificationId), {
    status: "actioned",
    actionedAt: Date.now(),
    actionedAtServer: serverTimestamp(),
    updatedAt: Date.now(),
    updatedAtServer: serverTimestamp(),
  });

  return true;
}