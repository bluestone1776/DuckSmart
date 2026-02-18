// DuckSmart — Feedback Service
//
// Stores user feedback/support tickets in Firebase Firestore.
// Falls back to AsyncStorage if Firebase is unavailable.

import AsyncStorage from "@react-native-async-storage/async-storage";

const FEEDBACK_KEY = "ducksmart_feedback";

/**
 * Save a feedback ticket locally (and optionally to Firebase in future).
 * @param {{ message: string, category: string, email?: string }} ticket
 */
export async function submitFeedback(ticket) {
  const entry = {
    id: `fb-${Date.now()}`,
    ...ticket,
    createdAt: new Date().toISOString(),
    status: "pending",
  };

  try {
    // Store locally for now — will sync to Firebase in v2
    const existing = await loadFeedback();
    const updated = [entry, ...existing];
    await AsyncStorage.setItem(FEEDBACK_KEY, JSON.stringify(updated));
    return entry;
  } catch (err) {
    console.error("Failed to save feedback:", err);
    throw err;
  }
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
