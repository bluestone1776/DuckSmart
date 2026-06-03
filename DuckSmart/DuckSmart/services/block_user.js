// DuckSmart — Block / Report Service
//
// Stores blocked users at:
// - users/{uid}/blockedUsers/{blockedUid}
//
// Stores reports at:
// - reports/{reportId}

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  writeBatch,
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

function normalizeUserProfile(profile = {}) {
  return {
    uid: profile.uid || "",
    displayName: profile.displayName || "DuckSmart User",
    displayNameLower:
      profile.displayNameLower || String(profile.displayName || "").toLowerCase(),
    emailLower: profile.emailLower || "",
    duckId: profile.duckId || profile.duckIdLower || "",
    duckIdLower: profile.duckIdLower || profile.duckId || "",
    photoURL: profile.photoURL || null,
    blockedAt: profile.blockedAt || null,
  };
}

export async function loadBlockedUsers(uid = null) {
  assertFirebaseReady();

  const safeUid = cleanString(uid || auth.currentUser?.uid, 160);

  if (!safeUid) return [];

  const snap = await getDocs(collection(db, "users", safeUid, "blockedUsers"));

  return snap.docs
    .map((item) => normalizeUserProfile({ uid: item.id, ...item.data() }))
    .sort((a, b) =>
      String(a.displayName || "").localeCompare(String(b.displayName || ""))
    );
}

export async function blockUser(uid, targetProfile, reason = "") {
  assertFirebaseReady();

  const safeUid = cleanString(uid || auth.currentUser?.uid, 160);
  const targetUid = cleanString(targetProfile?.uid, 160);

  if (!safeUid) {
    throw new Error("You must be signed in to block a user.");
  }

  if (!targetUid) {
    throw new Error("Missing user to block.");
  }

  if (safeUid === targetUid) {
    throw new Error("You cannot block yourself.");
  }

  const batch = writeBatch(db);

  const blockedRef = doc(db, "users", safeUid, "blockedUsers", targetUid);
  const ownPartyRef = doc(db, "users", safeUid, "huntingParty", targetUid);
  const targetPartyRef = doc(db, "users", targetUid, "huntingParty", safeUid);

  batch.set(
    blockedRef,
    {
      uid: targetUid,
      displayName: cleanString(targetProfile.displayName || "DuckSmart User", 120),
      displayNameLower: cleanString(
        targetProfile.displayNameLower ||
          String(targetProfile.displayName || "").toLowerCase(),
        120
      ),
      emailLower: cleanString(targetProfile.emailLower || "", 200).toLowerCase(),
      duckId: cleanString(targetProfile.duckId || targetProfile.duckIdLower || "", 80),
      duckIdLower: cleanString(targetProfile.duckIdLower || targetProfile.duckId || "", 80),
      photoURL: targetProfile.photoURL || null,
      reason: cleanString(reason, 500),
      blockedAt: Date.now(),
      blockedAtServer: serverTimestamp(),
    },
    { merge: true }
  );

  // Remove from both Hunting Party lists.
  batch.delete(ownPartyRef);
  batch.delete(targetPartyRef);

  await batch.commit();

  return true;
}

export async function unblockUser(uid, blockedUid) {
  assertFirebaseReady();

  const safeUid = cleanString(uid || auth.currentUser?.uid, 160);
  const safeBlockedUid = cleanString(blockedUid, 160);

  if (!safeUid) {
    throw new Error("You must be signed in to unblock a user.");
  }

  if (!safeBlockedUid) {
    throw new Error("Missing blocked user.");
  }

  await deleteDoc(doc(db, "users", safeUid, "blockedUsers", safeBlockedUid));

  return true;
}

export async function submitUserReport({
  reporterUid,
  reporterEmail = "",
  category = "Other",
  reportedUid = "",
  reportedUserText = "",
  message = "",
  source = "BlockedScreen",
} = {}) {
  assertFirebaseReady();

  const safeReporterUid = cleanString(reporterUid || auth.currentUser?.uid, 160);

  if (!safeReporterUid) {
    throw new Error("You must be signed in to submit a report.");
  }

  const safeMessage = cleanString(message, 5000);

  if (!safeMessage) {
    throw new Error("Please enter a report message.");
  }

  const reportRef = await addDoc(collection(db, "reports"), {
    reporterUid: safeReporterUid,
    reporterEmail: cleanString(reporterEmail || auth.currentUser?.email || "", 200),
    category: cleanString(category || "Other", 80),
    reportedUid: cleanString(reportedUid, 160),
    reportedUserText: cleanString(reportedUserText, 500),
    message: safeMessage,
    source: cleanString(source, 80),
    status: "new",
    createdAt: Date.now(),
    createdAtServer: serverTimestamp(),
  });

  return {
    id: reportRef.id,
  };
}