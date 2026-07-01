// DuckSmart — Admin Login Helper

import { auth } from "./firebase";

export const ADMIN_EMAILS = [
  "chris@mallardworks.io",
  "bluestone1776@gmail.com",
  "ryals.chris@gmail.com",
];

export const ADMIN_UNLOCK_CODE = "admin-";

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clean(value) {
  return String(value || "").trim().toLowerCase();
}

export function isAdminUnlockText(value) {
  return clean(value).replace(/\s+/g, "") === ADMIN_UNLOCK_CODE;
}

export function isAdminEmail(email) {
  const safeEmail = clean(email);

  return ADMIN_EMAILS.some((adminEmail) => clean(adminEmail) === safeEmail);
}

export function getCurrentUserEmail(firebaseUser = auth.currentUser) {
  const directEmail = clean(firebaseUser?.email);

  if (directEmail) return directEmail;

  if (Array.isArray(firebaseUser?.providerData)) {
    const providerEmail = firebaseUser.providerData
      .map((provider) => clean(provider?.email))
      .find(Boolean);

    if (providerEmail) return providerEmail;
  }

  return "";
}

export async function verifyCurrentAdmin() {
  const currentUser = auth.currentUser;

  if (!currentUser) {
    throw new Error("Please sign in with an admin account.");
  }

  try {
    await currentUser.reload();
  } catch {
    // Keep going if reload fails.
  }

  const freshUser = auth.currentUser || currentUser;
  const email = getCurrentUserEmail(freshUser);

  if (!email) {
    throw new Error("This sign-in method did not return an email address.");
  }

  if (!isAdminEmail(email)) {
    throw new Error(`Not authorized as admin: ${email}`);
  }

  return {
    uid: freshUser.uid,
    email,
  };
}

export async function verifyAdminAfterLogin(loginFunction) {
  if (typeof loginFunction !== "function") {
    throw new Error("Admin login is not available in this build.");
  }

  await loginFunction();

  await wait(800);

  return verifyCurrentAdmin();
}