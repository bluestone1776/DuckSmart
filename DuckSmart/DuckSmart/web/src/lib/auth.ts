import {
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  type User,
} from "firebase/auth";
import { auth } from "./firebase";

// ---------------------------------------------------------------------------
//  Login helpers
// ---------------------------------------------------------------------------

export async function loginWithEmail(
  email: string,
  password: string,
) {
  return signInWithEmailAndPassword(auth, email, password);
}

export async function loginWithGoogle() {
  const provider = new GoogleAuthProvider();
  return signInWithPopup(auth, provider);
}

// ---------------------------------------------------------------------------
//  Logout
// ---------------------------------------------------------------------------

export async function logout() {
  // Clear session cookie so middleware redirects to login immediately
  document.cookie = "__session=; path=/; max-age=0";
  return signOut(auth);
}

// ---------------------------------------------------------------------------
//  Auth state observer
// ---------------------------------------------------------------------------

export function onAuthChange(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback);
}

// ---------------------------------------------------------------------------
//  Error formatting
// ---------------------------------------------------------------------------

const AUTH_ERROR_MAP: Record<string, string> = {
  "auth/user-not-found": "No account found with that email address.",
  "auth/wrong-password": "Incorrect password. Please try again.",
  "auth/email-already-in-use": "An account with that email already exists.",
  "auth/weak-password": "Password must be at least 6 characters.",
  "auth/invalid-email": "Please enter a valid email address.",
  "auth/invalid-credential": "Invalid email or password.",
  "auth/too-many-requests":
    "Too many failed attempts. Please try again later.",
  "auth/network-request-failed": "Network error. Check your connection.",
  "auth/user-disabled": "This account has been disabled.",
  // OAuth-specific errors
  "auth/popup-closed-by-user": "Sign-in was cancelled.",
  "auth/cancelled-popup-request": "Sign-in was cancelled.",
  "auth/popup-blocked":
    "Sign-in popup was blocked. Please allow popups and try again.",
  "auth/account-exists-with-different-credential":
    "An account already exists with a different sign-in method.",
  "auth/credential-already-in-use":
    "This credential is already associated with another account.",
  "auth/operation-not-allowed":
    "This sign-in method is not enabled. Please contact support.",
  "auth/unauthorized-domain":
    "This domain is not authorized for sign-in. Please contact support.",
  "auth/internal-error":
    "An internal authentication error occurred. Please try again.",
};

/** Map a Firebase auth error code to a user-friendly message. */
export function formatAuthError(code: string): string {
  return AUTH_ERROR_MAP[code] ?? `An unexpected error occurred (${code || "unknown"}). Please try again.`;
}
