// DuckSmart — User Search / Hunting Party Service
//
// Search uses users_public through services/profile.js.
//
// Hunting Party lives at:
// - users/{uid}/huntingParty/{memberUid}
//
// Status values:
// - requested = I requested this user
// - pending   = this user requested me, waiting for my approval
// - active    = approved Hunting Party member
//
// Blocked users live at:
// - users/{uid}/blockedUsers/{blockedUid}
//
// Shared item placeholders live at:
// - users/{uid}/sharedItems/{shareId}

import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit as firestoreLimit,
  orderBy,
  query,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";

import { auth, db, isFirebaseConfigValid } from "./firebase";
import { loadUserProfile, searchUsers } from "./profile";
import { sendHuntingPartyRequestNotification } from "./notifications";

function assertFirebaseReady() {
  if (!isFirebaseConfigValid) {
    throw new Error("Firebase is not configured for this build.");
  }
}

function cleanString(value, maxLength = 500) {
  if (value === undefined || value === null) return "";
  return String(value).trim().slice(0, maxLength);
}

function normalizePublicProfile(profile = {}) {
  return {
    uid: profile.uid || "",
    displayName: profile.displayName || "DuckSmart User",
    displayNameLower:
      profile.displayNameLower || String(profile.displayName || "").toLowerCase(),
    emailLower: profile.emailLower || "",
    duckId: profile.duckId || profile.duckIdLower || "",
    duckIdLower: profile.duckIdLower || profile.duckId || "",
    photoURL: profile.photoURL || null,
  };
}

function normalizePartyMember(data = {}) {
  return {
    uid: data.uid || data.memberUid || "",
    memberUid: data.memberUid || data.uid || "",
    ownerUid: data.ownerUid || "",
    displayName: data.displayName || "DuckSmart User",
    displayNameLower:
      data.displayNameLower || String(data.displayName || "").toLowerCase(),
    emailLower: data.emailLower || "",
    duckId: data.duckId || data.duckIdLower || "",
    duckIdLower: data.duckIdLower || data.duckId || "",
    photoURL: data.photoURL || null,
    addedAt: data.addedAt || null,
    requestedAt: data.requestedAt || null,
    approvedAt: data.approvedAt || null,
    addedByUid: data.addedByUid || "",
    requestedByUid: data.requestedByUid || "",
    approvedByUid: data.approvedByUid || "",
    relationship: data.relationship || "hunting_party",
    status: data.status || "active",
  };
}

function normalizeSharedItem(data = {}, id = "") {
  return {
    id: data.id || id,
    shareId: data.shareId || id,
    type: data.type || data.itemType || "shared",
    itemType: data.itemType || data.type || "shared",
    title: data.title || "",
    payload: data.payload || null,
    recipientUid: data.recipientUid || "",
    recipientName: data.recipientName || "",
    recipientDuckId: data.recipientDuckId || "",
    sharedWithDisplayName: data.sharedWithDisplayName || "",
    sharedWithDuckId: data.sharedWithDuckId || "",
    sharedWithEmail: data.sharedWithEmail || "",
    createdAt: data.createdAt || null,
    sharedAt: data.sharedAt || null,
    updatedAt: data.updatedAt || null,
  };
}

async function loadBlockedUidSet(uid) {
  const safeUid = cleanString(uid || auth.currentUser?.uid, 160);

  if (!safeUid) return new Set();

  const snap = await getDocs(collection(db, "users", safeUid, "blockedUsers"));

  return new Set(snap.docs.map((item) => item.id));
}

async function getCurrentUserPublicProfile(uid) {
  const currentProfile = await loadUserProfile(uid);

  return normalizePublicProfile({
    uid,
    emailLower: auth.currentUser?.email || "",
    ...currentProfile,
  });
}

export async function searchUsersForHuntingParty(searchText, options = {}) {
  assertFirebaseReady();

  const currentUid = cleanString(
    options.currentUid || auth.currentUser?.uid || "",
    160
  );

  if (!currentUid) {
    throw new Error("You must be signed in to search users.");
  }

  const term = cleanString(searchText, 120);

  if (term.length < 2) {
    return [];
  }

  const [blockedUidSet, results] = await Promise.all([
    loadBlockedUidSet(currentUid),
    searchUsers(term, {
      currentUid,
      limit: options.limit || 16,
    }),
  ]);

  return (Array.isArray(results) ? results : [])
    .map(normalizePublicProfile)
    .filter((profile) => {
      if (!profile.uid) return false;
      if (profile.uid === currentUid) return false;
      if (blockedUidSet.has(profile.uid)) return false;
      return true;
    });
}

export async function loadHuntingParty(uid = null) {
  assertFirebaseReady();

  const safeUid = cleanString(uid || auth.currentUser?.uid, 160);

  if (!safeUid) return [];

  const snap = await getDocs(collection(db, "users", safeUid, "huntingParty"));

  return snap.docs
    .map((item) => normalizePartyMember({ uid: item.id, ...item.data() }))
    .filter((item) => {
      const status = String(item.status || "").toLowerCase();
      return item.uid && status !== "pending";
    })
    .sort((a, b) => {
      const aStatus = String(a.status || "");
      const bStatus = String(b.status || "");

      if (aStatus !== bStatus) {
        if (aStatus === "active") return -1;
        if (bStatus === "active") return 1;
      }

      return String(a.displayName || "").localeCompare(String(b.displayName || ""));
    });
}

export async function loadIncomingHuntingPartyRequests(uid = null) {
  assertFirebaseReady();

  const safeUid = cleanString(uid || auth.currentUser?.uid, 160);

  if (!safeUid) return [];

  const snap = await getDocs(collection(db, "users", safeUid, "huntingParty"));

  return snap.docs
    .map((item) => normalizePartyMember({ uid: item.id, ...item.data() }))
    .filter((item) => {
      const status = String(item.status || "").toLowerCase();
      return item.uid && status === "pending";
    })
    .sort((a, b) => Number(b.requestedAt || 0) - Number(a.requestedAt || 0));
}

export async function sendHuntingPartyRequest(uid, targetProfile) {
  assertFirebaseReady();

  const requesterUid = cleanString(uid || auth.currentUser?.uid, 160);
  const target = normalizePublicProfile(targetProfile);
  const targetUid = cleanString(target.uid, 160);

  if (!requesterUid) {
    throw new Error("You must be signed in to send a Hunting Party request.");
  }

  if (!targetUid) {
    throw new Error("Missing user to request.");
  }

  if (requesterUid === targetUid) {
    throw new Error("You cannot request yourself.");
  }

  const blockedUidSet = await loadBlockedUidSet(requesterUid);

  if (blockedUidSet.has(targetUid)) {
    throw new Error("Unblock this user before sending a Hunting Party request.");
  }

  const requester = await getCurrentUserPublicProfile(requesterUid);
  const now = Date.now();

  const requesterRecordRef = doc(db, "users", requesterUid, "huntingParty", targetUid);
  const recipientRecordRef = doc(db, "users", targetUid, "huntingParty", requesterUid);

  const batch = writeBatch(db);

  batch.set(
    requesterRecordRef,
    {
      ownerUid: requesterUid,
      memberUid: targetUid,
      uid: targetUid,
      displayName: target.displayName,
      displayNameLower: target.displayNameLower,
      emailLower: target.emailLower,
      duckId: target.duckId,
      duckIdLower: target.duckIdLower,
      photoURL: target.photoURL,
      status: "requested",
      relationship: "hunting_party",
      requestedByUid: requesterUid,
      addedByUid: requesterUid,
      requestedAt: now,
      requestedAtServer: serverTimestamp(),
      updatedAt: now,
      updatedAtServer: serverTimestamp(),
    },
    { merge: true }
  );

  batch.set(
    recipientRecordRef,
    {
      ownerUid: targetUid,
      memberUid: requesterUid,
      uid: requesterUid,
      displayName: requester.displayName,
      displayNameLower: requester.displayNameLower,
      emailLower: requester.emailLower,
      duckId: requester.duckId,
      duckIdLower: requester.duckIdLower,
      photoURL: requester.photoURL,
      status: "pending",
      relationship: "hunting_party",
      requestedByUid: requesterUid,
      addedByUid: requesterUid,
      requestedAt: now,
      requestedAtServer: serverTimestamp(),
      updatedAt: now,
      updatedAtServer: serverTimestamp(),
    },
    { merge: true }
  );

  await batch.commit();

  try {
    await sendHuntingPartyRequestNotification({
      recipientUid: targetUid,
      requesterProfile: requester,
    });
  } catch (err) {
    console.log("DuckSmart hunting party push notification failed:", err?.message || err);
  }

  return true;
}

export async function approveHuntingPartyRequest(uid, requestProfile) {
  assertFirebaseReady();

  const approverUid = cleanString(uid || auth.currentUser?.uid, 160);
  const requesterUid = cleanString(
    requestProfile?.uid || requestProfile?.memberUid || requestProfile?.requesterUid,
    160
  );

  if (!approverUid) {
    throw new Error("You must be signed in to approve requests.");
  }

  if (!requesterUid) {
    throw new Error("Missing request user.");
  }

  if (approverUid === requesterUid) {
    throw new Error("Invalid Hunting Party request.");
  }

  const approver = await getCurrentUserPublicProfile(approverUid);
  const requester = normalizePublicProfile({
    uid: requesterUid,
    ...requestProfile,
  });

  const now = Date.now();

  const approverRecordRef = doc(db, "users", approverUid, "huntingParty", requesterUid);
  const requesterRecordRef = doc(db, "users", requesterUid, "huntingParty", approverUid);

  const batch = writeBatch(db);

  batch.set(
    approverRecordRef,
    {
      ownerUid: approverUid,
      memberUid: requesterUid,
      uid: requesterUid,
      displayName: requester.displayName,
      displayNameLower: requester.displayNameLower,
      emailLower: requester.emailLower,
      duckId: requester.duckId,
      duckIdLower: requester.duckIdLower,
      photoURL: requester.photoURL,
      status: "active",
      relationship: "hunting_party",
      approvedByUid: approverUid,
      approvedAt: now,
      approvedAtServer: serverTimestamp(),
      updatedAt: now,
      updatedAtServer: serverTimestamp(),
    },
    { merge: true }
  );

  batch.set(
    requesterRecordRef,
    {
      ownerUid: requesterUid,
      memberUid: approverUid,
      uid: approverUid,
      displayName: approver.displayName,
      displayNameLower: approver.displayNameLower,
      emailLower: approver.emailLower,
      duckId: approver.duckId,
      duckIdLower: approver.duckIdLower,
      photoURL: approver.photoURL,
      status: "active",
      relationship: "hunting_party",
      approvedByUid: approverUid,
      approvedAt: now,
      approvedAtServer: serverTimestamp(),
      updatedAt: now,
      updatedAtServer: serverTimestamp(),
    },
    { merge: true }
  );

  await batch.commit();

  return true;
}

export async function declineHuntingPartyRequest(uid, requestProfile) {
  assertFirebaseReady();

  const declinedByUid = cleanString(uid || auth.currentUser?.uid, 160);
  const requesterUid = cleanString(
    requestProfile?.uid || requestProfile?.memberUid || requestProfile?.requesterUid,
    160
  );

  if (!declinedByUid) {
    throw new Error("You must be signed in to decline requests.");
  }

  if (!requesterUid) {
    throw new Error("Missing request user.");
  }

  const batch = writeBatch(db);

  batch.delete(doc(db, "users", declinedByUid, "huntingParty", requesterUid));
  batch.delete(doc(db, "users", requesterUid, "huntingParty", declinedByUid));

  await batch.commit();

  return true;
}

export async function removeUserFromHuntingParty(uid, memberUid) {
  assertFirebaseReady();

  const safeUid = cleanString(uid || auth.currentUser?.uid, 160);
  const safeMemberUid = cleanString(memberUid, 160);

  if (!safeUid) {
    throw new Error("You must be signed in to remove users.");
  }

  if (!safeMemberUid) {
    throw new Error("Missing Hunting Party user.");
  }

  const batch = writeBatch(db);

  batch.delete(doc(db, "users", safeUid, "huntingParty", safeMemberUid));
  batch.delete(doc(db, "users", safeMemberUid, "huntingParty", safeUid));

  await batch.commit();

  return true;
}

export async function loadLogsSharedByMe(uid = null) {
  assertFirebaseReady();

  const safeUid = cleanString(uid || auth.currentUser?.uid, 160);

  if (!safeUid) return [];

  const sharedRef = collection(db, "users", safeUid, "sharedItems");

  let snap;

  try {
    const q = query(
      sharedRef,
      orderBy("createdAt", "desc"),
      firestoreLimit(50)
    );

    snap = await getDocs(q);
  } catch {
    snap = await getDocs(sharedRef);
  }

  return snap.docs
    .map((item) => normalizeSharedItem(item.data(), item.id))
    .sort((a, b) => {
      const aTime = Number(a.createdAt || a.sharedAt || a.updatedAt || 0);
      const bTime = Number(b.createdAt || b.sharedAt || b.updatedAt || 0);
      return bTime - aTime;
    });
}

export async function removeSharedItem(uid, shareId) {
  assertFirebaseReady();

  const safeUid = cleanString(uid || auth.currentUser?.uid, 160);
  const safeShareId = cleanString(shareId, 200);

  if (!safeUid) {
    throw new Error("You must be signed in to remove shared items.");
  }

  if (!safeShareId) {
    throw new Error("Missing shared item.");
  }

  await deleteDoc(doc(db, "users", safeUid, "sharedItems", safeShareId));

  return true;
}