// DuckSmart — Auth Context
//
// Provides authentication state and actions to all screens via React Context.
// Supports Email/Password, Google Sign-In, and Apple Sign-In.
// Listens to onAuthStateChanged for persistent sessions.

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { Platform } from "react-native";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signOut,
  deleteUser,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithCredential,
  updateProfile,
} from "firebase/auth";
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { auth, db, isFirebaseConfigValid } from "../services/firebase";
import { clearAllData } from "../services/storage";
import { deleteAllUserData } from "../services/sync";
import { logLogin, logSignup } from "../services/analytics";
import Constants from "expo-constants";

// ---------------------------------------------------------------------------
// Google Sign-In – native module, must be lazy-loaded so Expo Go doesn't crash
// ---------------------------------------------------------------------------
const isExpoGo = Constants.appOwnership === "expo";

let GoogleSignin = null;
let isGoogleAvailable = false;
if (!isExpoGo) {
  try {
    const gModule = require("@react-native-google-signin/google-signin");
    GoogleSignin = gModule.GoogleSignin;
    isGoogleAvailable = true;
  } catch (_) {
    /* native module not linked */
  }
}

// ---------------------------------------------------------------------------
// Apple Sign-In – only available on iOS 13+
// ---------------------------------------------------------------------------
let AppleAuthentication = null;
let CryptoModule = null;
let isAppleAvailable = false;
if (!isExpoGo && Platform.OS === "ios") {
  try {
    AppleAuthentication = require("expo-apple-authentication");
    CryptoModule = require("expo-crypto");
    isAppleAvailable = true;
  } catch (_) {
    /* native module not available */
  }
}

// ---------------------------------------------------------------------------
// Configure Google Sign-In (runs once at import time)
// ---------------------------------------------------------------------------
if (isGoogleAvailable && GoogleSignin) {
  const extra = Constants.expoConfig?.extra?.firebase;
  const webClientId = extra?.googleWebClientId;
  if (webClientId && webClientId !== "REPLACE_WITH_WEB_CLIENT_ID") {
    GoogleSignin.configure({ webClientId });
  } else {
    console.warn(
      "DuckSmart: googleWebClientId not set in app.json — Google Sign-In will not work."
    );
  }
}

const AuthContext = createContext(null);

function cleanString(value, maxLength = 120) {
  if (value === undefined || value === null) return "";
  return String(value).trim().slice(0, maxLength);
}

function cleanDuckId(value) {
  return cleanString(value, 60)
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "")
    .replace(/^[._-]+|[._-]+$/g, "");
}

function buildFallbackName(firebaseUser, fallbackName = "") {
  const suppliedName = cleanString(fallbackName, 80);
  if (suppliedName) return suppliedName;

  const authName = cleanString(firebaseUser?.displayName, 80);
  if (authName) return authName;

  const emailPrefix = cleanString(firebaseUser?.email?.split("@")?.[0], 80);
  if (emailPrefix) return emailPrefix;

  return "DuckSmart User";
}

function buildFallbackDuckId(firebaseUser, displayName = "") {
  const emailBase = cleanString(firebaseUser?.email?.split("@")?.[0], 40);
  const nameBase = cleanString(displayName, 40);
  const base = cleanDuckId(emailBase || nameBase || "ducksmart");
  const uidSuffix = cleanString(firebaseUser?.uid, 6).toLowerCase();

  return cleanDuckId(`${base || "ducksmart"}-${uidSuffix}`);
}

function formatAppleFullName(fullName) {
  if (!fullName) return "";

  return [
    fullName.givenName,
    fullName.middleName,
    fullName.familyName,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();
}

async function saveUserProfile(firebaseUser, provider = "unknown", profile = {}) {
  if (!firebaseUser?.uid || !isFirebaseConfigValid) return;

  try {
    const uid = firebaseUser.uid;
    const publicRef = doc(db, "users_public", uid);
    const privateRef = doc(db, "users", uid, "profile", "private");

    const existingPublicSnap = await getDoc(publicRef);
    const existingPublic = existingPublicSnap.exists() ? existingPublicSnap.data() : {};

    const displayName = buildFallbackName(
      firebaseUser,
      profile.displayName || existingPublic.displayName
    );

    const photoURL =
      cleanString(profile.photoURL || firebaseUser.photoURL || existingPublic.photoURL || "", 1000) ||
      null;

    const email = cleanString(firebaseUser.email || profile.email || "", 200);
    const emailLower = email.toLowerCase();

    const duckIdLower =
      cleanDuckId(existingPublic.duckIdLower || profile.duckId || "") ||
      buildFallbackDuckId(firebaseUser, displayName);

    const publicPayload = {
      uid,
      displayName,
      displayNameLower: displayName.toLowerCase(),
      photoURL,
      emailLower,
      duckIdLower,
      searchableText: [
        displayName,
        emailLower,
        duckIdLower,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase(),
      provider,
      updatedAt: Date.now(),
      updatedAtServer: serverTimestamp(),
    };

    if (!existingPublicSnap.exists()) {
      publicPayload.createdAt = Date.now();
      publicPayload.createdAtServer = serverTimestamp();
    }

    await setDoc(publicRef, publicPayload, { merge: true });

    await setDoc(
      privateRef,
      {
        uid,
        email,
        emailLower,
        displayName,
        photoURL,
        duckIdLower,
        provider,
        updatedAt: Date.now(),
        updatedAtServer: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (err) {
    console.log("DuckSmart profile save failed:", err?.message || err);
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Listen for auth state changes (fires on login, logout, app restart)
  useEffect(() => {
    // If Firebase config is invalid, don't wait forever — go straight to login
    if (!isFirebaseConfigValid) {
      console.warn("DuckSmart: Firebase config invalid — skipping auth listener");
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);

      if (firebaseUser?.uid) {
        saveUserProfile(firebaseUser, "session");
      }
    });

    // Safety timeout: if onAuthStateChanged never fires (e.g. network issue,
    // Firebase misconfigured), stop loading after 10 seconds so the user
    // can at least see the login screen instead of a blank screen.
    const timeout = setTimeout(() => {
      setLoading((current) => {
        if (current) {
          console.warn("DuckSmart: Auth listener timed out — showing login screen");
        }
        return false;
      });
    }, 10000);

    return () => {
      unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  // --------------- Email / Password ---------------

  const login = useCallback(async (email, password) => {
    setError(null);
    setLoading(true);
    try {
      const result = await signInWithEmailAndPassword(auth, email, password);
      await saveUserProfile(result.user, "email");
      logLogin(result.user.uid, "email");
    } catch (err) {
      setError(formatAuthError(err.code));
      setLoading(false);
    }
  }, []);

  const signup = useCallback(async (email, password, profile = {}) => {
    setError(null);
    setLoading(true);
    try {
      const result = await createUserWithEmailAndPassword(auth, email, password);

      const displayName = cleanString(profile.displayName, 80);

      if (displayName) {
        await updateProfile(result.user, {
          displayName,
        });
      }

      await saveUserProfile(result.user, "email", {
        displayName,
      });

      await sendEmailVerification(result.user);
      logSignup(result.user.uid, "email");
    } catch (err) {
      console.error("Signup error:", err, err.code, err.message);
      setError(formatAuthError(err.code));
      setLoading(false);
    }
  }, []);

  const resendVerification = useCallback(async () => {
    if (!auth.currentUser) return;
    try {
      await sendEmailVerification(auth.currentUser);
    } catch (err) {
      if (err.code === "auth/too-many-requests") {
        setError("Verification email already sent. Please check your inbox or try again later.");
      } else {
        setError(formatAuthError(err.code));
      }
    }
  }, []);

  const refreshUser = useCallback(async () => {
    if (!auth.currentUser) return;
    await auth.currentUser.reload();
    setUser({ ...auth.currentUser });
  }, []);

  // --------------- Google Sign-In ---------------

  const loginWithGoogle = useCallback(async () => {
    if (!isGoogleAvailable || !GoogleSignin) {
      setError(
        isExpoGo
          ? "Google Sign-In requires a production build. Please use email/password in Expo Go."
          : "Google Sign-In is not available on this device."
      );
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const response = await GoogleSignin.signIn();
      const idToken = response?.data?.idToken ?? response?.idToken;
      const googleUser = response?.data?.user || response?.user || null;

      if (!idToken) {
        throw new Error("No ID token returned from Google Sign-In.");
      }

      const credential = GoogleAuthProvider.credential(idToken);
      const result = await signInWithCredential(auth, credential);

      const displayName =
        cleanString(result.user.displayName, 80) ||
        cleanString(googleUser?.name, 80);

      const photoURL =
        cleanString(result.user.photoURL, 1000) ||
        cleanString(googleUser?.photo, 1000);

      if (displayName || photoURL) {
        await updateProfile(result.user, {
          displayName: displayName || result.user.displayName || undefined,
          photoURL: photoURL || result.user.photoURL || undefined,
        });
      }

      await saveUserProfile(result.user, "google", {
        displayName,
        photoURL,
      });

      logLogin(result.user.uid, "google");
    } catch (err) {
      console.error("Google sign-in error:", err?.code, err?.message, err);
      // User cancelled the flow
      if (err.code === "SIGN_IN_CANCELLED" || err.code === "12501") {
        setLoading(false);
        return;
      }
      // Pass through the actual error code/message for better debugging
      const code = err.code || "auth/google-signin-failed";
      const msg = formatAuthError(code);
      setError(msg);
      setLoading(false);
    }
  }, []);

  // --------------- Apple Sign-In ---------------

  const loginWithApple = useCallback(async () => {
    if (!isAppleAvailable || !AppleAuthentication || !CryptoModule) {
      setError(
        isExpoGo
          ? "Apple Sign-In requires a production build. Please use email/password in Expo Go."
          : "Apple Sign-In is not available on this device."
      );
      return;
    }
    setError(null);
    setLoading(true);
    try {
      // Generate a random nonce, hash it with SHA-256 for Apple
      const rawNonce = CryptoModule.randomUUID();
      const hashedNonce = await CryptoModule.digestStringAsync(
        CryptoModule.CryptoDigestAlgorithm.SHA256,
        rawNonce
      );

      const appleCredential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });

      const { identityToken } = appleCredential;
      if (!identityToken) {
        throw new Error("No identity token returned from Apple Sign-In.");
      }

      const provider = new OAuthProvider("apple.com");
      const credential = provider.credential({
        idToken: identityToken,
        rawNonce: rawNonce,
      });

      const result = await signInWithCredential(auth, credential);

      const appleDisplayName = formatAppleFullName(appleCredential.fullName);

      if (appleDisplayName && !result.user.displayName) {
        await updateProfile(result.user, {
          displayName: appleDisplayName,
        });
      }

      await saveUserProfile(result.user, "apple", {
        displayName: appleDisplayName,
        email: appleCredential.email || result.user.email || "",
      });

      logLogin(result.user.uid, "apple");
    } catch (err) {
      console.error("Apple sign-in error:", err);
      // User cancelled the flow
      if (err.code === "ERR_REQUEST_CANCELED") {
        setLoading(false);
        return;
      }
      setError(formatAuthError(err.code || "auth/apple-signin-failed"));
      setLoading(false);
    }
  }, []);

  // --------------- Logout ---------------

  const logout = useCallback(async () => {
    setError(null);
    try {
      // Sign out of Google if it was used
      if (isGoogleAvailable && GoogleSignin) {
        try {
          await GoogleSignin.signOut();
        } catch (_) {
          /* ignore – user may not have signed in via Google */
        }
      }
      await signOut(auth);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  // --------------- Delete Account ---------------

  const deleteAccount = useCallback(async () => {
    setError(null);
    try {
      // Sign out of Google if it was used
      if (isGoogleAvailable && GoogleSignin) {
        try {
          await GoogleSignin.signOut();
        } catch (_) {
          /* ignore */
        }
      }
      const uid = auth.currentUser?.uid;

      // Clear local data (logs, pins, weather cache)
      await clearAllData();

      // Clear Firestore data (must happen BEFORE deleteUser — security rules require auth)
      if (uid) {
        await deleteAllUserData(uid);
      }

      // Delete the Firebase user (permanently removes the account)
      await deleteUser(auth.currentUser);
    } catch (err) {
      // Firebase requires recent authentication for account deletion
      if (err.code === "auth/requires-recent-login") {
        setError("For security, please log out and log back in before deleting your account.");
      } else {
        setError(err.message);
      }
      throw err;
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        error,
        login,
        signup,
        logout,
        deleteAccount,
        clearError,
        loginWithGoogle,
        loginWithApple,
        resendVerification,
        refreshUser,
        isGoogleAvailable,
        isAppleAvailable,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Hook to access auth state from any screen.
 * Returns: { user, loading, error, login, signup, logout, clearError,
 *            loginWithGoogle, loginWithApple, resendVerification, refreshUser,
 *            isGoogleAvailable, isAppleAvailable }
 */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside <AuthProvider>");
  }
  return ctx;
}

/**
 * Maps Firebase / OAuth error codes to user-friendly messages.
 */
function formatAuthError(code) {
  switch (code) {
    case "auth/invalid-email":
      return "Invalid email address.";
    case "auth/user-disabled":
      return "This account has been disabled.";
    case "auth/user-not-found":
      return "No account found with this email.";
    case "auth/wrong-password":
      return "Incorrect password.";
    case "auth/email-already-in-use":
      return "An account with this email already exists.";
    case "auth/weak-password":
      return "Password must be at least 6 characters.";
    case "auth/too-many-requests":
      return "Too many attempts. Please try again later.";
    case "auth/network-request-failed":
      return "Network error. Check your connection.";
    case "auth/invalid-credential":
      return "Invalid email or password.";
    // OAuth-specific errors
    case "auth/account-exists-with-different-credential":
      return "An account already exists with a different sign-in method.";
    case "auth/credential-already-in-use":
      return "This credential is already associated with another account.";
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return "Sign-in was cancelled.";
    case "auth/google-signin-failed":
      return "Google Sign-In failed. Please try again.";
    case "auth/apple-signin-failed":
      return "Apple Sign-In failed. Please try again.";
    case "auth/popup-blocked":
      return "Sign-in popup was blocked. Please allow popups and try again.";
    case "auth/operation-not-allowed":
      return "This sign-in method is not enabled. Please contact support.";
    case "auth/internal-error":
      return "An internal authentication error occurred. Please try again.";
    default:
      return `Authentication failed (${code || "unknown"}). Please try again.`;
  }
}