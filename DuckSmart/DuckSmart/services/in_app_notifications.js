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
// - Admin support messages
// - Admin inbox alerts

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

const ADMIN_NOTIFICATION_RECIPIENTS = [
  {
    uid: "yLHt9KO1PdgWpjxHa5ILkQaajbk1",
    email: "chris@mallardworks.io",
  },
  {
    uid: "Egau9Y6y1zMjWlr3UkiEEunlg4N2",
    email: "ryals.chris@gmail.com",
  },
  {
    uid: "prFCE8m3Bdbs6iKZRLn2cI9l4ck1",
    email: "bluestone1776@gmail.com",
  },
];

function assertFirebaseReady() {
  if (!isFirebaseConfigValid) {
    throw new Error("Firebase is not configured for this build.");
  }
}

function cleanString(value, maxLength = 500) {
  if (value === undefined || value === null) return "";
  return String(value).trim().slice(0, maxLength);
}

function lower(value) {
  return cleanString(value, 500).toLowerCase();
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
    feedbackId: data.feedbackId || data.relatedId || "",
    createdAt: data.createdAt || 0,
    updatedAt: data.updatedAt || 0,
  };
}

function isOpenAdminInboxItem(item = {}) {
  const status = lower(item.status || "pending");

  if (status === "closed" || status === "resolved") return false;

  return (
    status === "pending" ||
    status === "user_replied" ||
    item.adminUnread === true
  );
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
  feedbackId = "",
} = {}) {
  assertFirebaseReady();

  const safeRecipientUid = cleanString(recipientUid || "", 160);

  if (!safeRecipientUid) {
    throw new Error("Missing notification recipient.");
  }

  const now = Date.now();
  const safeRelatedId = cleanString(relatedId || feedbackId, 200);
  const safeFeedbackId = cleanString(feedbackId || relatedId, 200);

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
      relatedId: safeRelatedId,
      feedbackId: safeFeedbackId,
      createdAt: now,
      createdAtServer: serverTimestamp(),
      updatedAt: now,
      updatedAtServer: serverTimestamp(),
    }
  );

  return ref.id;
}

export async function createAdminMessageNotification({
  recipientUid,
  feedbackId,
  adminUid = "",
  adminName = "DuckSmart Admin",
  message = "",
} = {}) {
  const safeFeedbackId = cleanString(feedbackId, 200);

  if (!safeFeedbackId) {
    throw new Error("Missing feedback thread ID.");
  }

  return createInAppNotification({
    recipientUid,
    senderUid: adminUid,
    senderName: adminName,
    senderDuckId: "",
    type: "admin_message",
    title: "DuckSmart Admin Replied",
    message:
      cleanString(message, 180) ||
      "You have a new message from DuckSmart support.",
    actionScreen: "UserMessages",
    relatedId: safeFeedbackId,
    feedbackId: safeFeedbackId,
  });
}

export async function createAdminInboxNotification({
  senderUid = "",
  relatedId = "",
  feedbackId = "",
  message = "New and Updated Admin Messages To Check",
} = {}) {
  assertFirebaseReady();

  const safeRelatedId = cleanString(relatedId || feedbackId, 200);
  const safeFeedbackId = cleanString(feedbackId || relatedId, 200);

  const notificationIds = [];

  for (const admin of ADMIN_NOTIFICATION_RECIPIENTS) {
    if (!admin?.uid) continue;

    const notificationId = await createInAppNotification({
      recipientUid: admin.uid,
      senderUid,
      senderName: "DuckSmart",
      senderDuckId: "",
      type: "admin_inbox",
      title: "Admin Inbox",
      message,
      actionScreen: "AdminReportsScreen",
      relatedId: safeRelatedId,
      feedbackId: safeFeedbackId,
    });

    notificationIds.push(notificationId);
  }

  return notificationIds;
}

export async function createAdminInboxNotificationIfNeeded({
  senderUid = "",
  relatedId = "",
  feedbackId = "",
  message = "New and Updated Admin Messages To Check",
} = {}) {
  assertFirebaseReady();

  const snap = await getDocs(collection(db, "feedback"));

  const hasOpenAdminItems = snap.docs.some((docSnap) =>
    isOpenAdminInboxItem(docSnap.data())
  );

  if (!hasOpenAdminItems) {
    return [];
  }

  return createAdminInboxNotification({
    senderUid,
    relatedId,
    feedbackId,
    message,
  });
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