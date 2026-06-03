import {
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  sendEmailVerification,
  GoogleAuthProvider,
  OAuthProvider,
  type User,
} from "firebase/auth";
import { auth } from "./firebase";

// ---------------------------------------------------------------------------
// Login helpers
// ---------------------------------------------------------------------------

export async function loginWithEmail(email: string, password: string) {
  return signInWithEmailAndPassword(auth, email, password);
}

export async function loginWithGoogle() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({
    prompt: "select_account",
  });

  return signInWithPopup(auth, provider);
}

export async function loginWithApple() {
  const provider = new OAuthProvider("apple.com");

  provider.addScope("email");
  provider.addScope("name");

  provider.setCustomParameters({
    locale: "en",
  });

  return signInWithPopup(auth, provider);
}

// ---------------------------------------------------------------------------
// Email verification
// ---------------------------------------------------------------------------

export async function resendVerificationEmail() {
  if (!auth.currentUser) return;
  await sendEmailVerification(auth.currentUser);
}

export async function refreshCurrentUser() {
  if (!auth.currentUser) return null;
  await auth.currentUser.reload();
  return auth.currentUser;
}

// ---------------------------------------------------------------------------
// Logout
// ---------------------------------------------------------------------------

export async function logout() {
  return signOut(auth);
}

// ---------------------------------------------------------------------------
// Auth state observer
// ---------------------------------------------------------------------------

export function onAuthChange(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback);
}

// ---------------------------------------------------------------------------
// Error formatting
// ---------------------------------------------------------------------------

const AUTH_ERROR_MAP: Record<string, string> = {
  "auth/user-not-found": "No account found with that email address.",
  "auth/wrong-password": "Incorrect password. Please try again.",
  "auth/email-already-in-use": "An account with that email already exists.",
  "auth/weak-password": "Password must be at least 6 characters.",
  "auth/invalid-email": "Please enter a valid email address.",
  "auth/invalid-credential": "Invalid email or password.",
  "auth/too-many-requests": "Too many failed attempts. Please try again later.",
  "auth/network-request-failed": "Network error. Check your connection.",
  "auth/user-disabled": "This account has been disabled.",

  "auth/popup-closed-by-user": "Sign-in was cancelled.",
  "auth/cancelled-popup-request": "Sign-in was cancelled.",
  "auth/popup-blocked": "Sign-in popup was blocked. Please allow popups and try again.",
  "auth/account-exists-with-different-credential":
    "An account already exists with a different sign-in method.",
  "auth/credential-already-in-use":
    "This credential is already associated with another account.",
  "auth/operation-not-allowed":
    "Firebase rejected this provider. Check the Apple provider configuration in Firebase Authentication.",
  "auth/unauthorized-domain":
    "This domain is not authorized for sign-in in Firebase Authentication.",
  "auth/internal-error": "An internal authentication error occurred. Please try again.",
};

export function formatAuthError(code: string): string {
  return (
    AUTH_ERROR_MAP[code] ??
    `An unexpected error occurred (${code || "unknown"}). Please try again.`
  );
}

export function getRawAuthErrorMessage(error: unknown): string {
  const err = error as {
    code?: string;
    message?: string;
    customData?: unknown;
  };

  console.error("Firebase auth error:", err);

  const code = err?.code ?? "unknown";
  const message = err?.message ?? "No Firebase error message returned.";

  return `${formatAuthError(code)}\n\nCode: ${code}\n\nDetails: ${message}`;
}