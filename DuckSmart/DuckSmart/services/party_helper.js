// services/party_helper.js

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit as firestoreLimit,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from "firebase/firestore";

import { auth, db, isFirebaseConfigValid } from "./firebase";
import { loadUserProfile } from "./profile";

const HUNTING_PARTIES_COLLECTION = "hunting_parties";
const HUNTING_PARTY_INVITE_CODES_COLLECTION = "hunting_party_invite_codes";

const DUCKSMART_GROUP_PRODUCT_ID = "ducksmart_group";
const INCLUDED_HUNTERS = 5;
const INVITE_CODE_LENGTH = 7;
const INVITE_EXPIRES_DAYS = 30;
const GROUP_ACCESS_DAYS = 365;

function assertFirebaseReady() {
  if (!isFirebaseConfigValid) {
    throw new Error("Firebase is not configured for this build.");
  }
}

function cleanString(value, maxLength = 500) {
  if (value === undefined || value === null) return "";
  return String(value).trim().slice(0, maxLength);
}

function cleanEmail(value) {
  return cleanString(value, 220).toLowerCase();
}

function cleanCode(value) {
  return cleanString(value, 40).replace(/\s/g, "").toUpperCase();
}

function getNow() {
  return Date.now();
}

function getInviteExpiresAt() {
  return getNow() + INVITE_EXPIRES_DAYS * 24 * 60 * 60 * 1000;
}

function getGroupExpiresAt(startAt = getNow()) {
  return startAt + GROUP_ACCESS_DAYS * 24 * 60 * 60 * 1000;
}

function getPartyGroupExpiresAt(party = {}) {
  return Number(party.groupExpiresAt || party.expiresAt || 0);
}

function isPartyExpired(party = {}) {
  const expiresAt = getPartyGroupExpiresAt(party);
  return !!expiresAt && expiresAt <= getNow();
}

function isPartyCurrent(party = {}) {
  if (!party?.id && !party?.partyId) return false;
  if (party.active !== true) return false;
  if (String(party.status || "").toLowerCase() === "expired") return false;
  if (isPartyExpired(party)) return false;
  return true;
}

function normalizeParty(data = {}, id = "") {
  const includedHunters = Number(data.includedHunters || INCLUDED_HUNTERS);
  const extraHunters = Number(data.extraHunters || 0);
  const groupExpiresAt = getPartyGroupExpiresAt(data);
  const expired = !!groupExpiresAt && groupExpiresAt <= getNow();
  const rawActive = data.active === true;
  const active = rawActive && !expired;
  const rawStatus = String(data.status || "").toLowerCase();

  return {
    id: data.id || data.partyId || id,
    partyId: data.partyId || data.id || id,
    ownerUid: data.ownerUid || "",
    ownerEmail: data.ownerEmail || "",
    ownerEmailLower: data.ownerEmailLower || cleanEmail(data.ownerEmail || ""),
    partyName: data.partyName || "Hunting Party",
    productId: data.productId || DUCKSMART_GROUP_PRODUCT_ID,
    includedHunters,
    extraHunters,
    hunterLimit: Number(data.hunterLimit || includedHunters + extraHunters),
    active,
    status: expired ? "expired" : data.status || (active ? "active" : rawStatus || "inactive"),
    groupStartedAt: Number(data.groupStartedAt || data.createdAt || 0) || null,
    groupExpiresAt: groupExpiresAt || null,
    expired,
    createdAt: data.createdAt || null,
    updatedAt: data.updatedAt || null,
  };
}

function normalizeMember(data = {}, id = "") {
  return {
    id: data.id || id,
    uid: data.uid || data.memberUid || id,
    memberUid: data.memberUid || data.uid || id,
    partyId: data.partyId || "",
    email: data.email || data.emailLower || "",
    emailLower: data.emailLower || cleanEmail(data.email || ""),
    displayName: data.displayName || "DuckSmart User",
    role: data.role || "guide",
    status: data.status || "active",
    active: data.active !== false,
    joinedAt: data.joinedAt || data.createdAt || null,
    addedAt: data.addedAt || data.createdAt || null,
    updatedAt: data.updatedAt || null,
  };
}

function normalizeInvite(data = {}, id = "") {
  return {
    id: data.id || data.inviteId || id,
    inviteId: data.inviteId || data.id || id,
    partyId: data.partyId || "",
    partyName: data.partyName || "Hunting Party",
    email: data.email || data.emailLower || "",
    emailLower: data.emailLower || cleanEmail(data.email || ""),
    code: data.code || "",
    status: data.status || "pending",
    invitedByUid: data.invitedByUid || "",
    acceptedByUid: data.acceptedByUid || "",
    createdAt: data.createdAt || null,
    updatedAt: data.updatedAt || null,
    acceptedAt: data.acceptedAt || null,
    cancelledAt: data.cancelledAt || null,
    expiresAt: data.expiresAt || null,
  };
}

function normalizeAccess(data = {}, id = "") {
  return {
    id: data.id || id || "pro",
    active: data.active === true,
    isPro: data.isPro === true || data.active === true,
    source: data.source || "",
    partyId: data.partyId || "",
    role: data.role || "",
    productId: data.productId || "",
    updatedAt: data.updatedAt || null,
  };
}

function isPartyAccessSource(access = {}) {
  const source = String(access.source || "").toLowerCase();
  return source.includes("hunting_party") || access.productId === DUCKSMART_GROUP_PRODUCT_ID;
}

function getRandomCodePart(length = INVITE_CODE_LENGTH) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";

  for (let i = 0; i < length; i += 1) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }

  return code;
}

async function createUniqueInviteCode() {
  for (let i = 0; i < 8; i += 1) {
    const code = getRandomCodePart();
    const codeRef = doc(db, HUNTING_PARTY_INVITE_CODES_COLLECTION, code);
    const snap = await getDoc(codeRef);

    if (!snap.exists()) return code;
  }

  throw new Error("Could not create a unique invite code. Please try again.");
}

async function getCurrentUserPublicData(uid, fallbackEmail = "") {
  let profile = null;

  try {
    profile = uid ? await loadUserProfile(uid) : null;
  } catch {
    profile = null;
  }

  const firebaseUser = auth.currentUser;
  const email = cleanEmail(fallbackEmail || firebaseUser?.email || profile?.email || "");

  return {
    uid,
    email,
    emailLower: email,
    displayName:
      cleanString(profile?.displayName || firebaseUser?.displayName || email.split("@")[0], 120) ||
      "DuckSmart User",
    photoURL: profile?.photoURL || firebaseUser?.photoURL || null,
    duckId: profile?.duckId || profile?.duckIdLower || "",
    duckIdLower: profile?.duckIdLower || profile?.duckId || "",
  };
}

async function loadOwnerParty(uid) {
  const ownerQuery = query(
    collection(db, HUNTING_PARTIES_COLLECTION),
    where("ownerUid", "==", uid),
    firestoreLimit(1)
  );

  const snap = await getDocs(ownerQuery);

  if (snap.empty) return null;

  const docSnap = snap.docs[0];

  return normalizeParty(docSnap.data(), docSnap.id);
}

async function loadPartyById(partyId) {
  const safePartyId = cleanString(partyId, 180);

  if (!safePartyId) return null;

  const partySnap = await getDoc(doc(db, HUNTING_PARTIES_COLLECTION, safePartyId));

  if (!partySnap.exists()) return null;

  return normalizeParty(partySnap.data(), partySnap.id);
}

async function markAccessInactiveForExpiredParty(accessRef, access, party) {
  const now = getNow();
  const source = party?.id ? "hunting_party_expired" : "hunting_party_missing";

  const inactivePayload = {
    active: false,
    isPro: false,
    source,
    partyId: access.partyId || "",
    productId: access.productId || DUCKSMART_GROUP_PRODUCT_ID,
    updatedAt: now,
    updatedAtServer: serverTimestamp(),
  };

  await setDoc(accessRef, inactivePayload, { merge: true }).catch(() => {});

  return normalizeAccess(
    {
      ...access,
      ...inactivePayload,
    },
    "pro"
  );
}

async function loadAccess(uid) {
  if (!uid) return null;

  const accessRef = doc(db, "users", uid, "access", "pro");
  const accessSnap = await getDoc(accessRef);

  if (!accessSnap.exists()) return null;

  const access = normalizeAccess(accessSnap.data(), accessSnap.id);

  if (!access.active || !access.partyId || !isPartyAccessSource(access)) {
    return access;
  }

  const party = await loadPartyById(access.partyId);

  if (!party?.id || !isPartyCurrent(party)) {
    return markAccessInactiveForExpiredParty(accessRef, access, party);
  }

  return access;
}

async function loadPartyMembers(partyId) {
  const snap = await getDocs(
    collection(db, HUNTING_PARTIES_COLLECTION, partyId, "members")
  );

  return snap.docs
    .map((item) => normalizeMember(item.data(), item.id))
    .filter((item) => item.uid)
    .sort((a, b) => {
      const roleA = String(a.role || "");
      const roleB = String(b.role || "");

      if (roleA !== roleB) {
        if (roleA === "owner") return -1;
        if (roleB === "owner") return 1;
      }

      return String(a.displayName || "").localeCompare(String(b.displayName || ""));
    });
}

async function loadPartyInvites(partyId) {
  const snap = await getDocs(
    collection(db, HUNTING_PARTIES_COLLECTION, partyId, "invites")
  );

  return snap.docs
    .map((item) => normalizeInvite(item.data(), item.id))
    .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
}

async function countClaimedHunterSlots(partyId) {
  const [members, invites] = await Promise.all([
    loadPartyMembers(partyId),
    loadPartyInvites(partyId),
  ]);

  const activeMembers = members.filter((item) => {
    const status = String(item.status || "active").toLowerCase();
    return status === "active" && item.active !== false;
  });

  const pendingInvites = invites.filter((item) => {
    const status = String(item.status || "pending").toLowerCase();
    return status === "pending";
  });

  return {
    activeMembers,
    pendingInvites,
    claimedHunterSlots: activeMembers.length + pendingInvites.length,
  };
}

async function assertPartyOwner(partyId, uid) {
  const party = await loadPartyById(partyId);

  if (!party?.id) {
    throw new Error("Hunting Party not found.");
  }

  if (party.ownerUid !== uid) {
    throw new Error("Only the Hunting Party owner can do this.");
  }

  if (!isPartyCurrent(party)) {
    throw new Error("This Hunting Party is not active.");
  }

  return party;
}

export async function loadPartyDashboard({ uid, email } = {}) {
  assertFirebaseReady();

  const safeUid = cleanString(uid || auth.currentUser?.uid, 180);

  if (!safeUid) {
    throw new Error("You must be signed in to load Hunting Party.");
  }

  const [ownerParty, access] = await Promise.all([
    loadOwnerParty(safeUid),
    loadAccess(safeUid),
  ]);

  let party = ownerParty;

  if (!party?.id && access?.active && access?.partyId) {
    party = await loadPartyById(access.partyId);
  }

  if (!party?.id) {
    return {
      party: null,
      members: [],
      invites: [],
      access,
    };
  }

  const [members, invites] = await Promise.all([
    loadPartyMembers(party.id),
    party.ownerUid === safeUid ? loadPartyInvites(party.id) : Promise.resolve([]),
  ]);

  const ownerHasCurrentParty = party.ownerUid === safeUid && isPartyCurrent(party);

  return {
    party,
    members,
    invites,
    access:
      access ||
      normalizeAccess(
        {
          active: ownerHasCurrentParty,
          isPro: ownerHasCurrentParty,
          source: ownerHasCurrentParty ? "hunting_party_owner" : "hunting_party_owner_inactive",
          partyId: party.id,
          role: party.ownerUid === safeUid ? "owner" : "",
          productId: party.productId || DUCKSMART_GROUP_PRODUCT_ID,
        },
        "pro"
      ),
  };
}

export async function createHuntingParty({
  uid,
  email,
  partyName,
  productId = DUCKSMART_GROUP_PRODUCT_ID,
} = {}) {
  assertFirebaseReady();

  const safeUid = cleanString(uid || auth.currentUser?.uid, 180);
  const safeEmail = cleanEmail(email || auth.currentUser?.email || "");
  const safePartyName = cleanString(partyName, 100);

  if (!safeUid) {
    throw new Error("You must be signed in to create a Hunting Party.");
  }

  if (!safePartyName) {
    throw new Error("Enter a lodge, club, or guide team name.");
  }

  if (productId !== DUCKSMART_GROUP_PRODUCT_ID) {
    throw new Error("Invalid DuckSmart Group product.");
  }

  const existing = await loadOwnerParty(safeUid);

  if (existing?.id) {
    return {
      party: existing,
      alreadyExists: true,
    };
  }

  const ownerProfile = await getCurrentUserPublicData(safeUid, safeEmail);
  const now = getNow();
  const groupExpiresAt = getGroupExpiresAt(now);

  const partyRef = doc(collection(db, HUNTING_PARTIES_COLLECTION));
  const memberRef = doc(
    db,
    HUNTING_PARTIES_COLLECTION,
    partyRef.id,
    "members",
    safeUid
  );
  const accessRef = doc(db, "users", safeUid, "access", "pro");

  const partyPayload = {
    id: partyRef.id,
    partyId: partyRef.id,
    ownerUid: safeUid,
    ownerEmail: safeEmail,
    ownerEmailLower: safeEmail,
    partyName: safePartyName,
    productId: DUCKSMART_GROUP_PRODUCT_ID,
    includedHunters: INCLUDED_HUNTERS,
    extraHunters: 0,
    hunterLimit: INCLUDED_HUNTERS,
    active: true,
    status: "active",
    groupStartedAt: now,
    groupExpiresAt,
    createdAt: now,
    updatedAt: now,
    createdAtServer: serverTimestamp(),
    updatedAtServer: serverTimestamp(),
  };

  const memberPayload = {
    uid: safeUid,
    memberUid: safeUid,
    partyId: partyRef.id,
    email: ownerProfile.email,
    emailLower: ownerProfile.emailLower,
    displayName: ownerProfile.displayName,
    photoURL: ownerProfile.photoURL || null,
    duckId: ownerProfile.duckId || "",
    duckIdLower: ownerProfile.duckIdLower || "",
    role: "owner",
    status: "active",
    active: true,
    joinedAt: now,
    addedAt: now,
    updatedAt: now,
    joinedAtServer: serverTimestamp(),
    updatedAtServer: serverTimestamp(),
  };

  const accessPayload = {
    active: true,
    isPro: true,
    source: "hunting_party_owner",
    partyId: partyRef.id,
    role: "owner",
    productId: DUCKSMART_GROUP_PRODUCT_ID,
    groupExpiresAt,
    updatedAt: now,
    updatedAtServer: serverTimestamp(),
  };

  const batch = writeBatch(db);

  batch.set(partyRef, partyPayload);
  batch.set(memberRef, memberPayload);
  batch.set(accessRef, accessPayload, { merge: true });

  await batch.commit();

  return {
    party: normalizeParty(partyPayload, partyRef.id),
    member: normalizeMember(memberPayload, safeUid),
    access: normalizeAccess(accessPayload, "pro"),
  };
}

export async function sendPartyInvite({
  partyId,
  email,
  invitedByUid,
} = {}) {
  assertFirebaseReady();

  const safePartyId = cleanString(partyId, 180);
  const safeEmail = cleanEmail(email);
  const safeInvitedByUid = cleanString(invitedByUid || auth.currentUser?.uid, 180);

  if (!safePartyId) {
    throw new Error("Missing Hunting Party.");
  }

  if (!safeInvitedByUid) {
    throw new Error("You must be signed in to create invites.");
  }

  if (!safeEmail || !safeEmail.includes("@")) {
    throw new Error("Enter a valid email address.");
  }

  const party = await assertPartyOwner(safePartyId, safeInvitedByUid);

  const existingMemberQuery = query(
    collection(db, HUNTING_PARTIES_COLLECTION, safePartyId, "members"),
    where("emailLower", "==", safeEmail),
    firestoreLimit(1)
  );

  const existingInviteQuery = query(
    collection(db, HUNTING_PARTIES_COLLECTION, safePartyId, "invites"),
    where("emailLower", "==", safeEmail),
    where("status", "==", "pending"),
    firestoreLimit(1)
  );

  const [existingMemberSnap, existingInviteSnap, slotInfo] = await Promise.all([
    getDocs(existingMemberQuery),
    getDocs(existingInviteQuery),
    countClaimedHunterSlots(safePartyId),
  ]);

  if (!existingMemberSnap.empty) {
    throw new Error("This user is already in this Hunting Party.");
  }

  if (!existingInviteSnap.empty) {
    throw new Error("This email already has a pending invite.");
  }

  if (slotInfo.claimedHunterSlots >= Number(party.hunterLimit || INCLUDED_HUNTERS)) {
    throw new Error("No open hunter slots available.");
  }

  const code = await createUniqueInviteCode();
  const now = getNow();
  const expiresAt = getInviteExpiresAt();

  const inviteRef = doc(
    collection(db, HUNTING_PARTIES_COLLECTION, safePartyId, "invites")
  );
  const codeRef = doc(db, HUNTING_PARTY_INVITE_CODES_COLLECTION, code);

  const invitePayload = {
    id: inviteRef.id,
    inviteId: inviteRef.id,
    partyId: safePartyId,
    partyName: party.partyName || "Hunting Party",
    email: safeEmail,
    emailLower: safeEmail,
    code,
    status: "pending",
    invitedByUid: safeInvitedByUid,
    createdAt: now,
    updatedAt: now,
    expiresAt,
    createdAtServer: serverTimestamp(),
    updatedAtServer: serverTimestamp(),
  };

  const codePayload = {
    code,
    partyId: safePartyId,
    inviteId: inviteRef.id,
    email: safeEmail,
    emailLower: safeEmail,
    status: "pending",
    createdAt: now,
    updatedAt: now,
    expiresAt,
    createdAtServer: serverTimestamp(),
    updatedAtServer: serverTimestamp(),
  };

  const batch = writeBatch(db);

  batch.set(inviteRef, invitePayload);
  batch.set(codeRef, codePayload);

  await batch.commit();

  return normalizeInvite(invitePayload, inviteRef.id);
}

export async function cancelPartyInvite({
  partyId,
  inviteId,
  uid,
} = {}) {
  assertFirebaseReady();

  const safePartyId = cleanString(partyId, 180);
  const safeInviteId = cleanString(inviteId, 180);
  const safeUid = cleanString(uid || auth.currentUser?.uid, 180);

  if (!safePartyId || !safeInviteId) {
    throw new Error("Missing invite.");
  }

  await assertPartyOwner(safePartyId, safeUid);

  const inviteRef = doc(
    db,
    HUNTING_PARTIES_COLLECTION,
    safePartyId,
    "invites",
    safeInviteId
  );

  const inviteSnap = await getDoc(inviteRef);

  if (!inviteSnap.exists()) {
    throw new Error("Invite not found.");
  }

  const invite = normalizeInvite(inviteSnap.data(), inviteSnap.id);
  const now = getNow();

  const batch = writeBatch(db);

  batch.set(
    inviteRef,
    {
      status: "cancelled",
      cancelledAt: now,
      updatedAt: now,
      updatedAtServer: serverTimestamp(),
    },
    { merge: true }
  );

  if (invite.code) {
    batch.set(
      doc(db, HUNTING_PARTY_INVITE_CODES_COLLECTION, invite.code),
      {
        status: "cancelled",
        cancelledAt: now,
        updatedAt: now,
        updatedAtServer: serverTimestamp(),
      },
      { merge: true }
    );
  }

  await batch.commit();

  return true;
}

export async function redeemPartyInviteCode({
  uid,
  email,
  code,
} = {}) {
  assertFirebaseReady();

  const safeUid = cleanString(uid || auth.currentUser?.uid, 180);
  const safeEmail = cleanEmail(email || auth.currentUser?.email || "");
  const safeCode = cleanCode(code);

  if (!safeUid) {
    throw new Error("You must be signed in to redeem this code.");
  }

  if (!safeEmail) {
    throw new Error("Your account needs an email address to redeem this code.");
  }

  if (!safeCode) {
    throw new Error("Enter an activation code.");
  }

  const codeRef = doc(db, HUNTING_PARTY_INVITE_CODES_COLLECTION, safeCode);
  const codeSnap = await getDoc(codeRef);

  if (!codeSnap.exists()) {
    throw new Error("This activation code was not found.");
  }

  const codeData = codeSnap.data() || {};
  const partyId = cleanString(codeData.partyId, 180);
  const inviteId = cleanString(codeData.inviteId, 180);
  const inviteEmail = cleanEmail(codeData.emailLower || codeData.email || "");

  if (!partyId || !inviteId) {
    throw new Error("This activation code is invalid.");
  }

  if (String(codeData.status || "").toLowerCase() !== "pending") {
    throw new Error("This activation code is no longer active.");
  }

  if (Number(codeData.expiresAt || 0) && Number(codeData.expiresAt) < getNow()) {
    throw new Error("This activation code has expired.");
  }

  if (inviteEmail && inviteEmail !== safeEmail) {
    throw new Error("This activation code was sent to a different email address.");
  }

  const partyRef = doc(db, HUNTING_PARTIES_COLLECTION, partyId);
  const inviteRef = doc(
    db,
    HUNTING_PARTIES_COLLECTION,
    partyId,
    "invites",
    inviteId
  );
  const memberRef = doc(
    db,
    HUNTING_PARTIES_COLLECTION,
    partyId,
    "members",
    safeUid
  );
  const accessRef = doc(db, "users", safeUid, "access", "pro");

  const [partySnap, inviteSnap, memberSnap, profile] = await Promise.all([
    getDoc(partyRef),
    getDoc(inviteRef),
    getDoc(memberRef),
    getCurrentUserPublicData(safeUid, safeEmail),
  ]);

  if (!partySnap.exists()) {
    throw new Error("Hunting Party not found.");
  }

  if (!inviteSnap.exists()) {
    throw new Error("Invite not found.");
  }

  const party = normalizeParty(partySnap.data(), partySnap.id);
  const invite = normalizeInvite(inviteSnap.data(), inviteSnap.id);

  if (!isPartyCurrent(party)) {
    throw new Error("This Hunting Party is not active.");
  }

  if (String(invite.status || "").toLowerCase() !== "pending") {
    throw new Error("This invite is no longer active.");
  }

  if (cleanEmail(invite.emailLower || invite.email) !== safeEmail) {
    throw new Error("This invite was sent to a different email address.");
  }

  if (memberSnap.exists()) {
    throw new Error("You are already in this Hunting Party.");
  }

  const slotInfo = await countClaimedHunterSlots(partyId);

  if (slotInfo.claimedHunterSlots >= Number(party.hunterLimit || INCLUDED_HUNTERS)) {
    throw new Error("This Hunting Party has no open hunter slots.");
  }

  const now = getNow();

  const memberPayload = {
    uid: safeUid,
    memberUid: safeUid,
    partyId,
    email: profile.email,
    emailLower: profile.emailLower,
    displayName: profile.displayName,
    photoURL: profile.photoURL || null,
    duckId: profile.duckId || "",
    duckIdLower: profile.duckIdLower || "",
    role: "guide",
    status: "active",
    active: true,
    joinedAt: now,
    addedAt: now,
    invitedByUid: invite.invitedByUid || "",
    inviteId,
    updatedAt: now,
    joinedAtServer: serverTimestamp(),
    updatedAtServer: serverTimestamp(),
  };

  const accessPayload = {
    active: true,
    isPro: true,
    source: "hunting_party",
    partyId,
    role: "guide",
    productId: party.productId || DUCKSMART_GROUP_PRODUCT_ID,
    groupExpiresAt: party.groupExpiresAt || null,
    updatedAt: now,
    updatedAtServer: serverTimestamp(),
  };

  const batch = writeBatch(db);

  batch.set(memberRef, memberPayload);
  batch.set(accessRef, accessPayload, { merge: true });

  batch.set(
    inviteRef,
    {
      status: "accepted",
      acceptedByUid: safeUid,
      acceptedAt: now,
      updatedAt: now,
      acceptedAtServer: serverTimestamp(),
      updatedAtServer: serverTimestamp(),
    },
    { merge: true }
  );

  batch.set(
    codeRef,
    {
      status: "accepted",
      acceptedByUid: safeUid,
      acceptedAt: now,
      updatedAt: now,
      acceptedAtServer: serverTimestamp(),
      updatedAtServer: serverTimestamp(),
    },
    { merge: true }
  );

  await batch.commit();

  return {
    party,
    member: normalizeMember(memberPayload, safeUid),
    access: normalizeAccess(accessPayload, "pro"),
  };
}

export async function removePartyMember({
  partyId,
  memberUid,
  uid,
} = {}) {
  assertFirebaseReady();

  const safePartyId = cleanString(partyId, 180);
  const safeMemberUid = cleanString(memberUid, 180);
  const safeUid = cleanString(uid || auth.currentUser?.uid, 180);

  if (!safePartyId || !safeMemberUid) {
    throw new Error("Missing member.");
  }

  const party = await assertPartyOwner(safePartyId, safeUid);

  if (safeMemberUid === party.ownerUid) {
    throw new Error("The Hunting Party owner cannot be removed.");
  }

  const memberRef = doc(
    db,
    HUNTING_PARTIES_COLLECTION,
    safePartyId,
    "members",
    safeMemberUid
  );
  const accessRef = doc(db, "users", safeMemberUid, "access", "pro");

  const memberSnap = await getDoc(memberRef);

  if (!memberSnap.exists()) {
    throw new Error("Member not found.");
  }

  const now = getNow();
  const accessSnap = await getDoc(accessRef);
  const access = accessSnap.exists()
    ? normalizeAccess(accessSnap.data(), accessSnap.id)
    : null;

  const batch = writeBatch(db);

  batch.set(
    memberRef,
    {
      status: "removed",
      active: false,
      removedAt: now,
      removedByUid: safeUid,
      updatedAt: now,
      updatedAtServer: serverTimestamp(),
    },
    { merge: true }
  );

  if (access?.partyId === safePartyId) {
    batch.set(
      accessRef,
      {
        active: false,
        isPro: false,
        source: "hunting_party_removed",
        removedFromPartyId: safePartyId,
        partyId: safePartyId,
        updatedAt: now,
        updatedAtServer: serverTimestamp(),
      },
      { merge: true }
    );
  }

  await batch.commit();

  return true;
}

export async function loadPartyAccess(uid = null) {
  assertFirebaseReady();

  const safeUid = cleanString(uid || auth.currentUser?.uid, 180);

  if (!safeUid) return null;

  return loadAccess(safeUid);
}

export async function hasPartyProAccess(uid = null) {
  const access = await loadPartyAccess(uid);

  return !!access?.active;
}

export async function deactivateHuntingParty({ partyId, uid } = {}) {
  assertFirebaseReady();

  const safePartyId = cleanString(partyId, 180);
  const safeUid = cleanString(uid || auth.currentUser?.uid, 180);

  if (!safePartyId) {
    throw new Error("Missing Hunting Party.");
  }

  const party = await assertPartyOwner(safePartyId, safeUid);
  const members = await loadPartyMembers(safePartyId);
  const now = getNow();

  const batch = writeBatch(db);

  batch.set(
    doc(db, HUNTING_PARTIES_COLLECTION, safePartyId),
    {
      active: false,
      status: "inactive",
      deactivatedAt: now,
      deactivatedByUid: safeUid,
      updatedAt: now,
      updatedAtServer: serverTimestamp(),
    },
    { merge: true }
  );

  members.forEach((member) => {
    if (!member.uid) return;

    batch.set(
      doc(db, HUNTING_PARTIES_COLLECTION, safePartyId, "members", member.uid),
      {
        active: false,
        status: "inactive",
        deactivatedAt: now,
        updatedAt: now,
        updatedAtServer: serverTimestamp(),
      },
      { merge: true }
    );

    batch.set(
      doc(db, "users", member.uid, "access", "pro"),
      {
        active: false,
        isPro: false,
        source: member.uid === party.ownerUid ? "hunting_party_owner_inactive" : "hunting_party_inactive",
        partyId: safePartyId,
        updatedAt: now,
        updatedAtServer: serverTimestamp(),
      },
      { merge: true }
    );
  });

  await batch.commit();

  return true;
}

export async function hardDeleteCancelledPartyInvite({ partyId, inviteId, uid } = {}) {
  assertFirebaseReady();

  const safePartyId = cleanString(partyId, 180);
  const safeInviteId = cleanString(inviteId, 180);
  const safeUid = cleanString(uid || auth.currentUser?.uid, 180);

  if (!safePartyId || !safeInviteId) {
    throw new Error("Missing invite.");
  }

  await assertPartyOwner(safePartyId, safeUid);

  const inviteRef = doc(
    db,
    HUNTING_PARTIES_COLLECTION,
    safePartyId,
    "invites",
    safeInviteId
  );

  const inviteSnap = await getDoc(inviteRef);

  if (!inviteSnap.exists()) return true;

  const invite = normalizeInvite(inviteSnap.data(), inviteSnap.id);

  await deleteDoc(inviteRef);

  if (invite.code) {
    await deleteDoc(doc(db, HUNTING_PARTY_INVITE_CODES_COLLECTION, invite.code)).catch(() => {});
  }

  return true;
}