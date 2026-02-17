// DuckSmart — Firebase initialization
//
// Reads config from app.json > expo.extra.firebase,
// picks the correct apiKey and appId based on platform (iOS vs Android),
// initializes Firebase app + Auth with AsyncStorage persistence.

import { Platform } from "react-native";
import { initializeApp, getApps, getApp } from "firebase/app";
import { initializeAuth, getAuth, getReactNativePersistence } from "firebase/auth";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";

const extra = Constants.expoConfig?.extra?.firebase;

const firebaseConfig = {
  apiKey: Platform.OS === "ios" ? extra?.iosApiKey : extra?.androidApiKey,
  authDomain: extra?.authDomain,
  projectId: extra?.projectId,
  storageBucket: extra?.storageBucket,
  messagingSenderId: extra?.messagingSenderId,
  appId: Platform.OS === "ios" ? extra?.iosAppId : extra?.androidAppId,
};

if (!firebaseConfig.apiKey || !firebaseConfig.appId) {
  console.warn(
    "DuckSmart: Firebase config missing or incomplete for platform:",
    Platform.OS
  );
}

// Initialize Firebase app (singleton — safe to call multiple times)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Initialize Auth with AsyncStorage persistence.
// Guard against hot-reload re-initialization crash.
const auth =
  getApps().length === 1
    ? initializeAuth(app, {
        persistence: getReactNativePersistence(AsyncStorage),
      })
    : getAuth(app);

export { app, auth };
