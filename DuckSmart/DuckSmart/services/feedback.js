// DuckSmart — Feedback Service
//
// Stores user feedback/support tickets in Firebase Firestore.
// Also saves locally in AsyncStorage as a fallback.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { db, auth } from "./firebase";
import { collection, addDoc } from "firebase/firestore";
import { Platform } from "react-native";
import Constants from "expo-constants";
import { createAdminInboxNotificationIfNeeded } from "./in_app_notifications";

const FEEDBACK_KEY = "ducksmart_feedback";

export async function submitFeedback(ticket) {
  const user = auth.currentUser;

  const entry = {
    id: `fb-${Date.now()}`,
    ...ticket,
    userId: user?.uid || null,
    email: user?.email || null,
    platform: Platform.OS,
    appVersion: Constants.expoConfig?.version || "1.1.0",
    createdAt: new Date().toISOString(),
    timestamp: Date.now(),
    status: "pending",
    adminUnread: true,
    userUnread: false,
  };

  let feedbackDocId = "";

  try {
    const docRef = await addDoc(collection(db, "feedback"), entry);
    feedbackDocId = docRef.id;

    await createAdminInboxNotificationIfNeeded({
      senderUid: user?.uid || "",
      feedbackId: feedbackDocId,
      relatedId: feedbackDocId,
      message: "New and Updated Admin Messages To Check",
    });
  } catch (err) {
    console.warn("DuckSmart feedback: Firestore write failed —", err.message);
  }

  try {
    const existing = await loadFeedback();
    const updated = [{ ...entry, firestoreId: feedbackDocId }, ...existing];
    await AsyncStorage.setItem(FEEDBACK_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn("DuckSmart feedback: local save failed —", err.message);
  }

  return { ...entry, firestoreId: feedbackDocId };
}

export async function loadFeedback() {
  try {
    const raw = await AsyncStorage.getItem(FEEDBACK_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}