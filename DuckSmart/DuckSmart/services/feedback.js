// DuckSmart — Feedback Service
//
// Stores user feedback/support tickets in Firebase Firestore.
// Also saves locally in AsyncStorage as a fallback.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { db, auth } from "./firebase";
import { collection, addDoc } from "firebase/firestore";
import { Platform } from "react-native";
import Constants from "expo-constants";

const FEEDBACK_KEY = "ducksmart_feedback";

/**
 * Submit a feedback ticket to Firestore and save locally as backup.
 * @param {{ message: string, category: string }} ticket
 */
export async function submitFeedback(ticket) {
  const user = auth.currentUser;
  const entry = {
    id: `fb-${Date.now()}`,
    ...ticket,
    userId: user?.uid || null,
    email: user?.email || null,
    platform: Platform.OS,
    appVersion: Constants.expoConfig?.version || "1.0.0",
    createdAt: new Date().toISOString(),
    timestamp: Date.now(),
    status: "pending",
  };

  try {
    // Push to Firestore
    await addDoc(collection(db, "feedback"), entry);
  } catch (err) {
    console.warn("DuckSmart feedback: Firestore write failed —", err.message);
  }

  try {
    // Also save locally as backup
    const existing = await loadFeedback();
    const updated = [entry, ...existing];
    await AsyncStorage.setItem(FEEDBACK_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn("DuckSmart feedback: local save failed —", err.message);
  }

  return entry;
}

/**
 * Load all locally stored feedback entries.
 */
export async function loadFeedback() {
  try {
    const raw = await AsyncStorage.getItem(FEEDBACK_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
