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
  "auth/too-many-requests":
    "Too many failed attempts. Please try again later.",
};

/** Map a Firebase auth error code to a user-friendly message. */
export function formatAuthError(code: string): string {
  return AUTH_ERROR_MAP[code] ?? "An unexpected error occurred. Please try again.";
}
