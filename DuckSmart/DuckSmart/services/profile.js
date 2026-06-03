// DuckSmart — Profile Service
//
// Handles user profile creation, profile photo upload, profile loading,
// searchable public user lookup, and unique DuckSmart ID assignment.
//
// Writes:
// - users/{uid}/profile/private
// - users_public/{uid}
// - ducksmart_ids/{duckIdLower}

import {
  collection,
  doc,
  getDoc,
  limit as firestoreLimit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  startAt,
  endAt,
  getDocs,
} from "firebase/firestore";
import {
  getDownloadURL,
  ref,
  uploadBytes,
} from "firebase/storage";
import { updateProfile } from "firebase/auth";

import { auth, db, storage, isFirebaseConfigValid } from "./firebase";

const USERS_PUBLIC_COLLECTION = "users_public";
const DUCKSMART_IDS_COLLECTION = "ducksmart_ids";
const PROFILE_PRIVATE_DOC_ID = "private";

const DUCKSMART_ID_WORDS = [
  "mallard",
  "teal",
  "pintail",
  "wigeon",
  "gadwall",
  "canvasback",
  "redhead",
  "scaup",
  "bufflehead",
  "goldeneye",
  "merganser",
  "shoveler",
  "woodduck",
  "blackduck",
  "eider",
  "scoter",
  "ruddy",
  "ringneck",
  "longtail",
  "harlequin",
  "bluewing",
  "greenwing",
  "cinnamon",
  "mottled",
  "whistler",
  "drake",
  "hen",
  "flock",
  "decoy",
  "blind",
  "marsh",
  "timber",
  "flyway",
  "caller",
  "retriever",
  "sprig",
  "diver",
  "puddler",
  "cupped",
  "waterfowl",
  "feather",
  "wingbeat",
  "sunrise",
  "creek",
  "bayou",
  "reed",
  "cattail",
  "northwind",
  "splashdown",
  "flightline",
];

const DUCKSMART_ID_WORD_SET = new Set(DUCKSMART_ID_WORDS);

function assertFirebaseReady() {
  if (!isFirebaseConfigValid) {
    throw new Error("Firebase is not configured for this build.");
  }
}

function cleanString(value, maxLength = 120) {
  if (value === undefined || value === null) return "";
  return String(value).trim().slice(0, maxLength);
}

function cleanEmail(value) {
  return cleanString(value, 200).toLowerCase();
}

function cleanDuckId(value) {
  return cleanString(value, 60)
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "")
    .replace(/^[._-]+|[._-]+$/g, "");
}

function getFallbackDisplayName({ displayName, email }) {
  const safeName = cleanString(displayName, 80);
  if (safeName) return safeName;

  const emailPrefix = cleanString(String(email || "").split("@")[0], 80);
  if (emailPrefix) return emailPrefix;

  return "DuckSmart User";
}

function getRandomDuckSmartIdCandidate() {
  const word = DUCKSMART_ID_WORDS[Math.floor(Math.random() * DUCKSMART_ID_WORDS.length)];
  const number = String(Math.floor(Math.random() * 999) + 1).padStart(3, "0");
  return `${word}-${number}`;
}

function isGeneratedDuckSmartId(value) {
  const duckId = cleanDuckId(value);
  const match = duckId.match(/^([a-z]+)-(\d{3})$/);

  if (!match) return false;

  const word = match[1];
  const number = Number(match[2]);

  return DUCKSMART_ID_WORD_SET.has(word) && number >= 1 && number <= 999;
}

function isEmailDerivedDuckId({ duckId, email }) {
  const safeDuckId = cleanDuckId(duckId);
  const emailLower = cleanEmail(email);
  const emailPrefix = cleanDuckId(String(emailLower || "").split("@")[0] || "");
  const wholeEmailClean = cleanDuckId(emailLower);

  if (!safeDuckId || !emailLower) return false;

  return safeDuckId === emailPrefix || safeDuckId === wholeEmailClean;
}

function shouldReplaceLegacyDuckId({ duckId, email }) {
  const safeDuckId = cleanDuckId(duckId);

  if (!safeDuckId) return true;

  if (isGeneratedDuckSmartId(safeDuckId)) {
    return false;
  }

  return isEmailDerivedDuckId({ duckId: safeDuckId, email });
}

function getImageExtension(uri) {
  const cleanUri = String(uri || "").split("?")[0];
  const lastPart = cleanUri.split("/").pop() || "";
  const ext = lastPart.includes(".") ? lastPart.split(".").pop().toLowerCase() : "";

  if (["jpg", "jpeg", "png", "webp", "heic"].includes(ext)) {
    return ext;
  }

  return "jpg";
}

function getContentTypeFromExtension(ext) {
  switch (ext) {
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "heic":
      return "image/heic";
    case "jpg":
    case "jpeg":
    default:
      return "image/jpeg";
  }
}

function buildSearchableText({
  displayName,
  emailLower,
  duckIdLower,
}) {
  return [
    displayName,
    String(displayName || "").toLowerCase(),
    emailLower,
    duckIdLower,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function normalizePublicProfile(data = {}) {
  return {
    uid: data.uid || "",
    displayName: data.displayName || "DuckSmart User",
    displayNameLower: data.displayNameLower || String(data.displayName || "").toLowerCase(),
    emailLower: data.emailLower || "",
    duckIdLower: data.duckIdLower || data.duckId || "",
    duckId: data.duckId || data.duckIdLower || "",
    photoURL: data.photoURL || null,
    searchableText: data.searchableText || "",
    provider: data.provider || "unknown",
    updatedAt: data.updatedAt || null,
    createdAt: data.createdAt || null,
  };
}

function normalizePrivateProfile(data = {}) {
  return {
    uid: data.uid || "",
    email: data.email || "",
    emailLower: data.emailLower || cleanEmail(data.email),
    displayName: data.displayName || "DuckSmart User",
    displayNameLower: data.displayNameLower || String(data.displayName || "").toLowerCase(),
    duckIdLower: data.duckIdLower || data.duckId || "",
    duckId: data.duckId || data.duckIdLower || "",
    photoURL: data.photoURL || null,
    provider: data.provider || "unknown",
    updatedAt: data.updatedAt || null,
    createdAt: data.createdAt || null,
  };
}

function profileMatchesSearch(profile, term) {
  const q = String(term || "").toLowerCase().trim();
  if (!q) return false;

  const haystack = [
    profile.displayName,
    profile.displayNameLower,
    profile.emailLower,
    profile.duckIdLower,
    profile.duckId,
    profile.searchableText,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(q);
}

async function pickAvailableRandomDuckSmartId(transaction, uid) {
  for (let i = 0; i < 80; i += 1) {
    const candidate = getRandomDuckSmartIdCandidate();
    const candidateRef = doc(db, DUCKSMART_IDS_COLLECTION, candidate);
    const candidateSnap = await transaction.get(candidateRef);

    if (!candidateSnap.exists()) {
      return candidate;
    }

    const assignedUid = candidateSnap.data()?.uid;
    if (assignedUid === uid) {
      return candidate;
    }
  }

  throw new Error("Could not assign a DuckSmart ID. Please try again.");
}

export async function createOrUpdateUserProfile({
  uid,
  email = "",
  displayName = "",
  duckId = "",
  photoURL = null,
  provider = "email",
} = {}) {
  assertFirebaseReady();

  const safeUid = cleanString(uid || auth.currentUser?.uid, 160);
  if (!safeUid) {
    throw new Error("Missing user ID.");
  }

  const safeEmail = cleanString(email || auth.currentUser?.email || "", 200);
  const emailLower = cleanEmail(safeEmail);

  const finalDisplayName = getFallbackDisplayName({
    displayName,
    email: safeEmail,
  });

  const requestedDuckId = cleanDuckId(duckId);
  const finalPhotoURL = photoURL ? cleanString(photoURL, 1000) : null;

  let savedPrivateProfile = null;

  await runTransaction(db, async (transaction) => {
    const publicRef = doc(db, USERS_PUBLIC_COLLECTION, safeUid);
    const privateRef = doc(db, "users", safeUid, "profile", PROFILE_PRIVATE_DOC_ID);

    // READS FIRST
    const publicSnap = await transaction.get(publicRef);
    const privateSnap = await transaction.get(privateRef);

    const existingPublic = publicSnap.exists() ? publicSnap.data() : {};
    const existingPrivate = privateSnap.exists() ? privateSnap.data() : {};

    const existingDuckId = cleanDuckId(
      existingPublic.duckIdLower ||
        existingPublic.duckId ||
        existingPrivate.duckIdLower ||
        existingPrivate.duckId ||
        ""
    );

    let finalDuckId = "";

    if (requestedDuckId) {
      finalDuckId = requestedDuckId;
    } else if (
      existingDuckId &&
      !shouldReplaceLegacyDuckId({
        duckId: existingDuckId,
        email: safeEmail || existingPrivate.email || existingPublic.emailLower,
      })
    ) {
      finalDuckId = existingDuckId;
    } else {
      finalDuckId = await pickAvailableRandomDuckSmartId(transaction, safeUid);
    }

    if (finalDuckId.length < 3) {
      throw new Error("DuckSmart ID must be at least 3 characters.");
    }

    const idRef = doc(db, DUCKSMART_IDS_COLLECTION, finalDuckId);
    const idSnap = await transaction.get(idRef);

    let oldIdRef = null;
    let oldIdSnap = null;

    if (existingDuckId && existingDuckId !== finalDuckId) {
      oldIdRef = doc(db, DUCKSMART_IDS_COLLECTION, existingDuckId);
      oldIdSnap = await transaction.get(oldIdRef);
    }

    // AFTER THIS POINT: NO MORE transaction.get() CALLS

    if (idSnap.exists() && idSnap.data()?.uid !== safeUid) {
      throw new Error("That DuckSmart ID is already taken.");
    }

    const createdAt =
      existingPublic.createdAt ||
      existingPrivate.createdAt ||
      Date.now();

    const publicProfile = {
      uid: safeUid,
      displayName: finalDisplayName,
      displayNameLower: finalDisplayName.toLowerCase(),
      emailLower,
      duckId: finalDuckId,
      duckIdLower: finalDuckId,
      photoURL: finalPhotoURL,
      searchableText: buildSearchableText({
        displayName: finalDisplayName,
        emailLower,
        duckIdLower: finalDuckId,
      }),
      provider,
      createdAt,
      updatedAt: Date.now(),
      updatedAtServer: serverTimestamp(),
    };

    if (!publicSnap.exists()) {
      publicProfile.createdAtServer = serverTimestamp();
    }

    const privateProfile = {
      uid: safeUid,
      email: safeEmail,
      emailLower,
      displayName: finalDisplayName,
      displayNameLower: finalDisplayName.toLowerCase(),
      duckId: finalDuckId,
      duckIdLower: finalDuckId,
      photoURL: finalPhotoURL,
      provider,
      createdAt,
      updatedAt: Date.now(),
      updatedAtServer: serverTimestamp(),
    };

    if (!privateSnap.exists()) {
      privateProfile.createdAtServer = serverTimestamp();
    }

    transaction.set(publicRef, publicProfile, { merge: true });
    transaction.set(privateRef, privateProfile, { merge: true });

    transaction.set(
      idRef,
      {
        uid: safeUid,
        duckIdLower: finalDuckId,
        updatedAt: Date.now(),
        updatedAtServer: serverTimestamp(),
      },
      { merge: true }
    );

    if (
      oldIdRef &&
      oldIdSnap &&
      oldIdSnap.exists() &&
      oldIdSnap.data()?.uid === safeUid
    ) {
      transaction.delete(oldIdRef);
    }

    savedPrivateProfile = privateProfile;
  });

  if (auth.currentUser?.uid === safeUid) {
    try {
      await updateProfile(auth.currentUser, {
        displayName: savedPrivateProfile.displayName,
        photoURL: savedPrivateProfile.photoURL || auth.currentUser.photoURL || undefined,
      });
    } catch (err) {
      console.log("DuckSmart auth profile update failed:", err?.message || err);
    }
  }

  return normalizePrivateProfile(savedPrivateProfile);
}

export async function loadUserProfile(uid = null) {
  assertFirebaseReady();

  const safeUid = cleanString(uid || auth.currentUser?.uid, 160);
  if (!safeUid) return null;

  const privateRef = doc(db, "users", safeUid, "profile", PROFILE_PRIVATE_DOC_ID);
  const publicRef = doc(db, USERS_PUBLIC_COLLECTION, safeUid);

  const privateSnap = await getDoc(privateRef);

  if (privateSnap.exists()) {
    const privateProfile = normalizePrivateProfile(privateSnap.data());

    const shouldRegenerate =
      auth.currentUser?.uid === safeUid &&
      shouldReplaceLegacyDuckId({
        duckId: privateProfile.duckIdLower || privateProfile.duckId,
        email: auth.currentUser.email || privateProfile.email || "",
      });

    if (shouldRegenerate) {
      return createOrUpdateUserProfile({
        uid: safeUid,
        email: auth.currentUser.email || privateProfile.email || "",
        displayName: auth.currentUser.displayName || privateProfile.displayName || "",
        photoURL: auth.currentUser.photoURL || privateProfile.photoURL || null,
        provider: "profile_id_migration",
      });
    }

    return privateProfile;
  }

  const publicSnap = await getDoc(publicRef);

  if (publicSnap.exists()) {
    const publicProfile = normalizePublicProfile(publicSnap.data());

    const shouldRegenerate =
      auth.currentUser?.uid === safeUid &&
      shouldReplaceLegacyDuckId({
        duckId: publicProfile.duckIdLower || publicProfile.duckId,
        email: auth.currentUser.email || publicProfile.emailLower || "",
      });

    if (shouldRegenerate) {
      return createOrUpdateUserProfile({
        uid: safeUid,
        email: auth.currentUser.email || publicProfile.emailLower || "",
        displayName: auth.currentUser.displayName || publicProfile.displayName || "",
        photoURL: auth.currentUser.photoURL || publicProfile.photoURL || null,
        provider: "profile_id_migration",
      });
    }

    return publicProfile;
  }

  if (auth.currentUser?.uid === safeUid) {
    return createOrUpdateUserProfile({
      uid: safeUid,
      email: auth.currentUser.email || "",
      displayName: auth.currentUser.displayName || "",
      photoURL: auth.currentUser.photoURL || null,
      provider: "session",
    });
  }

  return null;
}

export async function uploadProfilePhoto({ uid, sourceUri } = {}) {
  assertFirebaseReady();

  const safeUid = cleanString(uid || auth.currentUser?.uid, 160);

  if (!safeUid) {
    throw new Error("You must be signed in to upload a profile photo.");
  }

  if (!sourceUri) {
    throw new Error("No profile photo was selected.");
  }

  const ext = getImageExtension(sourceUri);
  const contentType = getContentTypeFromExtension(ext);
  const photoRef = ref(storage, `users/${safeUid}/profile/profile.${ext}`);

  const response = await fetch(sourceUri);
  const blob = await response.blob();

  const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
  if (blob.size > MAX_PHOTO_BYTES) {
    throw new Error("Profile photo must be under 8 MB.");
  }

  await uploadBytes(photoRef, blob, { contentType });

  const downloadUrl = await getDownloadURL(photoRef);

  return {
    photoURL: downloadUrl,
    downloadUrl,
    storagePath: `users/${safeUid}/profile/profile.${ext}`,
  };
}

async function runPrefixSearch({ field, term, maxResults }) {
  const safeTerm = String(term || "").toLowerCase().trim();

  if (!safeTerm) return [];

  const usersRef = collection(db, USERS_PUBLIC_COLLECTION);

  const q = query(
    usersRef,
    orderBy(field),
    startAt(safeTerm),
    endAt(`${safeTerm}\uf8ff`),
    firestoreLimit(maxResults)
  );

  const snap = await getDocs(q);

  return snap.docs.map((item) => normalizePublicProfile(item.data()));
}

export async function searchUsers(searchText, options = {}) {
  assertFirebaseReady();

  const term = String(searchText || "").toLowerCase().trim();
  const currentUid = options.currentUid || auth.currentUser?.uid || null;
  const maxResults = Math.max(1, Math.min(Number(options.limit || 12), 25));

  if (term.length < 2) {
    return [];
  }

  const searches = await Promise.allSettled([
    runPrefixSearch({
      field: "displayNameLower",
      term,
      maxResults,
    }),
    runPrefixSearch({
      field: "emailLower",
      term,
      maxResults,
    }),
    runPrefixSearch({
      field: "duckIdLower",
      term,
      maxResults,
    }),
  ]);

  const byUid = new Map();

  searches.forEach((result) => {
    if (result.status !== "fulfilled") return;

    result.value.forEach((profile) => {
      if (!profile?.uid) return;
      if (currentUid && profile.uid === currentUid) return;

      byUid.set(profile.uid, profile);
    });
  });

  return Array.from(byUid.values())
    .filter((profile) => profileMatchesSearch(profile, term))
    .slice(0, maxResults);
}