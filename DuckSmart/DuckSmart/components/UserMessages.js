// DuckSmart — User/Admin Support Messages

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";

import { COLORS } from "../constants/theme";
import { db } from "../services/firebase";
import { useAuth } from "../context/AuthContext";
import { getCurrentUserEmail, isAdminEmail } from "../services/adminLogin";
import {
  createAdminMessageNotification,
  createAdminInboxNotificationIfNeeded,
} from "../services/in_app_notifications";

const GOLD = "#D9A84C";
const RED = "#FF4D4D";
const BG = "#05090A";
const CARD = "rgba(13,18,19,0.98)";
const CARD_SOFT = "rgba(255,255,255,0.045)";
const BORDER = "rgba(255,255,255,0.09)";
const MUTED = "rgba(255,255,255,0.62)";
const MUTED_DARK = "rgba(255,255,255,0.42)";
const USER_BUBBLE = "rgba(217,168,76,0.16)";
const ADMIN_BUBBLE = "rgba(255,255,255,0.07)";

function cleanText(value) {
  return String(value || "").trim();
}

function getFeedbackId(report, fallbackId) {
  return (
    cleanText(fallbackId) ||
    cleanText(report?.firestoreId) ||
    cleanText(report?.feedbackId) ||
    cleanText(report?.id)
  );
}

function formatDate(value) {
  const raw = value || Date.now();
  const date = typeof raw === "number" ? new Date(raw) : new Date(raw);

  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getOriginalMessage(report) {
  const text = cleanText(report?.message);

  if (!text) return null;

  return {
    id: "__original_feedback_message__",
    text,
    senderRole: "user",
    senderEmail: report?.email || "",
    senderUid: report?.userId || "",
    createdAtMillis: Number(report?.timestamp || 0) || Date.now(),
    isOriginal: true,
  };
}

export default function UserMessages({
  visible,
  onClose,
  report = null,
  feedbackId = "",
  mode = "user",
  title = "DuckSmart Support",
}) {
  const { user } = useAuth();
  const scrollRef = useRef(null);

  const [messages, setMessages] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [messageText, setMessageText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const reportId = useMemo(
    () => getFeedbackId(report, feedbackId),
    [report, feedbackId]
  );

  const currentEmail = getCurrentUserEmail(user);
  const currentUserIsAdmin = isAdminEmail(currentEmail);
  const senderRole = mode === "admin" && currentUserIsAdmin ? "admin" : "user";

  const originalMessage = useMemo(() => getOriginalMessage(report), [report]);

  const visibleMessages = useMemo(() => {
    const rows = Array.isArray(messages) ? messages : [];

    if (!originalMessage) return rows;

    const hasOriginalAlready = rows.some(
      (msg) =>
        cleanText(msg.text) === cleanText(originalMessage.text) &&
        msg.senderRole === "user"
    );

    if (hasOriginalAlready) return rows;

    return [originalMessage, ...rows].sort(
      (a, b) => Number(a.createdAtMillis || 0) - Number(b.createdAtMillis || 0)
    );
  }, [messages, originalMessage]);

  useEffect(() => {
    if (!visible || !reportId) return;

    setLoadingMessages(true);
    setError("");

    const messagesRef = collection(db, "feedback", reportId, "messages");
    const messagesQuery = query(messagesRef, orderBy("createdAtMillis", "asc"));

    const unsubscribe = onSnapshot(
      messagesQuery,
      (snap) => {
        const rows = snap.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));

        setMessages(rows);
        setLoadingMessages(false);

        setTimeout(() => {
          scrollRef.current?.scrollToEnd?.({ animated: true });
        }, 150);
      },
      (err) => {
        console.warn("DuckSmart support messages load failed:", err?.message || err);
        setError(err?.message || "Could not load this support conversation.");
        setLoadingMessages(false);
      }
    );

    return unsubscribe;
  }, [visible, reportId]);

  useEffect(() => {
    if (!visible || !reportId || !user?.uid) return;

    const feedbackRef = doc(db, "feedback", reportId);

    const payload =
      senderRole === "admin"
        ? {
            adminUnread: false,
            adminLastViewedAt: serverTimestamp(),
            adminLastViewedAtMillis: Date.now(),
          }
        : {
            userUnread: false,
            userLastViewedAt: serverTimestamp(),
            userLastViewedAtMillis: Date.now(),
          };

    updateDoc(feedbackRef, payload).catch((err) => {
      console.warn("DuckSmart support read marker failed:", err?.message || err);
    });
  }, [visible, reportId, senderRole, user?.uid]);

  async function handleSendMessage() {
    const text = cleanText(messageText);

    if (!reportId) {
      Alert.alert("Message Error", "Missing feedback report ID.");
      return;
    }

    if (!user?.uid) {
      Alert.alert("Sign In Required", "Please sign in before sending a message.");
      return;
    }

    if (mode === "admin" && !currentUserIsAdmin) {
      Alert.alert("Admin Access Denied", "This account is not allowed to respond as admin.");
      return;
    }

    if (!text) {
      Alert.alert("Empty Message", "Please type a message before sending.");
      return;
    }

    setSending(true);

    const now = Date.now();
    const feedbackRef = doc(db, "feedback", reportId);
    const messagesRef = collection(db, "feedback", reportId, "messages");

    try {
      await addDoc(messagesRef, {
        text,
        senderUid: user.uid,
        senderEmail: currentEmail || user.email || "",
        senderRole,
        createdAt: serverTimestamp(),
        createdAtMillis: now,
      });

      setMessageText("");

      if (senderRole === "admin") {
        await updateDoc(feedbackRef, {
          status: "admin_replied",
          latestMessage: text,
          latestMessageAt: serverTimestamp(),
          latestMessageAtMillis: now,
          latestSenderRole: "admin",
          userUnread: true,
          adminUnread: false,
          adminLastViewedAt: serverTimestamp(),
          adminLastViewedAtMillis: now,
        });

        try {
  await createAdminInboxNotificationIfNeeded({
    senderUid: user.uid,
    feedbackId: reportId,
    relatedId: reportId,
    message: "New and Updated Admin Messages To Check",
  });
} catch (notificationErr) {
  console.warn(
    "DuckSmart admin inbox notification failed:",
    notificationErr?.message || notificationErr
  );
}

        if (report?.userId) {
          try {
            await createAdminMessageNotification({
              recipientUid: report.userId,
              feedbackId: reportId,
              adminUid: user.uid,
              adminName: currentEmail || "DuckSmart Admin",
              message: text,
            });
          } catch (notificationErr) {
            console.warn(
              "DuckSmart admin message notification failed:",
              notificationErr?.message || notificationErr
            );
          }
        }
      } else {
        await updateDoc(feedbackRef, {
          status: "user_replied",
          latestMessage: text,
          latestMessageAt: serverTimestamp(),
          latestMessageAtMillis: now,
          latestSenderRole: "user",
          adminUnread: true,
          userUnread: false,
          userLastViewedAt: serverTimestamp(),
          userLastViewedAtMillis: now,
        });
      }

      setTimeout(() => {
        scrollRef.current?.scrollToEnd?.({ animated: true });
      }, 150);
    } catch (err) {
      console.warn("DuckSmart support message send failed:", err?.message || err);
      Alert.alert("Message Failed", err?.message || "Could not send this message.");
    } finally {
      setSending(false);
    }
  }

  function renderMessage(message) {
    const isAdminMessage = message.senderRole === "admin";
    const isMine =
      cleanText(message.senderUid) === cleanText(user?.uid) ||
      (senderRole === "admin" && isAdminMessage);

    return (
      <View
        key={message.id}
        style={[
          ums.messageWrap,
          isMine ? ums.messageWrapMine : ums.messageWrapOther,
        ]}
      >
        <View
          style={[
            ums.messageBubble,
            isAdminMessage ? ums.adminBubble : ums.userBubble,
            message.isOriginal ? ums.originalBubble : null,
          ]}
        >
          <View style={ums.messageMetaRow}>
            <Text style={ums.messageSender}>
              {isAdminMessage ? "DuckSmart Admin" : "User"}
            </Text>

            {message.isOriginal ? (
              <Text style={ums.originalTag}>Original Report</Text>
            ) : null}
          </View>

          <Text style={ums.messageText}>{message.text}</Text>

          <Text style={ums.messageTime}>
            {formatDate(message.createdAtMillis)}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <Modal
      visible={!!visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={ums.safe}
      >
        <View style={ums.backdrop}>
          <Pressable style={ums.tapOut} onPress={onClose} />

          <View style={ums.card}>
            <View style={ums.header}>
              <View style={{ flex: 1 }}>
                <Text style={ums.kicker}>
                  {senderRole === "admin" ? "ADMIN MESSAGE BOARD" : "SUPPORT MESSAGE"}
                </Text>
                <Text style={ums.title} numberOfLines={1}>
                  {title}
                </Text>
                <Text style={ums.subTitle} numberOfLines={1}>
                  {report?.email || currentEmail || "DuckSmart Support"}
                </Text>
              </View>

              <Pressable style={ums.closeBtn} onPress={onClose}>
                <Text style={ums.closeText}>✕</Text>
              </Pressable>
            </View>

            {!reportId ? (
              <View style={ums.centerBox}>
                <Text style={ums.errorText}>Missing support thread ID.</Text>
              </View>
            ) : loadingMessages ? (
              <View style={ums.centerBox}>
                <ActivityIndicator color={GOLD} />
                <Text style={ums.loadingText}>Loading conversation...</Text>
              </View>
            ) : (
              <>
                {error ? (
                  <View style={ums.errorBox}>
                    <Text style={ums.errorText}>{error}</Text>
                  </View>
                ) : null}

                <ScrollView
                  ref={scrollRef}
                  style={ums.messagesArea}
                  contentContainerStyle={ums.messagesContent}
                  showsVerticalScrollIndicator={false}
                  onContentSizeChange={() =>
                    scrollRef.current?.scrollToEnd?.({ animated: false })
                  }
                >
                  {visibleMessages.length > 0 ? (
                    visibleMessages.map(renderMessage)
                  ) : (
                    <View style={ums.emptyBox}>
                      <Text style={ums.emptyTitle}>No messages yet</Text>
                      <Text style={ums.emptySub}>
                        Send the first reply to start this support conversation.
                      </Text>
                    </View>
                  )}
                </ScrollView>

                <View style={ums.inputWrap}>
                  <TextInput
                    value={messageText}
                    onChangeText={setMessageText}
                    placeholder={
                      senderRole === "admin"
                        ? "Reply to this user..."
                        : "Reply to DuckSmart support..."
                    }
                    placeholderTextColor="rgba(255,255,255,0.34)"
                    style={ums.input}
                    multiline
                    editable={!sending}
                  />

                  <Pressable
                    style={[ums.sendBtn, sending ? ums.sendBtnDisabled : null]}
                    onPress={handleSendMessage}
                    disabled={sending}
                  >
                    {sending ? (
                      <ActivityIndicator color={BG} />
                    ) : (
                      <Text style={ums.sendBtnText}>Send</Text>
                    )}
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const ums = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.72)",
  },
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
  },
  tapOut: {
    flex: 1,
  },
  card: {
    height: "88%",
    backgroundColor: BG,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: "hidden",
  },
  header: {
    minHeight: 74,
    paddingHorizontal: 14,
    paddingTop: 13,
    paddingBottom: 11,
    backgroundColor: CARD,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  kicker: {
    color: GOLD,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
  title: {
    color: COLORS.white,
    fontSize: 20,
    fontWeight: "900",
    marginTop: 2,
  },
  subTitle: {
    color: MUTED_DARK,
    fontSize: 11,
    fontWeight: "800",
    marginTop: 3,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: CARD_SOFT,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: "center",
    justifyContent: "center",
  },
  closeText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: "900",
  },
  centerBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
  },
  loadingText: {
    color: MUTED,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 8,
  },
  errorBox: {
    margin: 12,
    padding: 11,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: RED,
    backgroundColor: "rgba(255,77,77,0.08)",
  },
  errorText: {
    color: RED,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 17,
    textAlign: "center",
  },
  messagesArea: {
    flex: 1,
  },
  messagesContent: {
    padding: 12,
    paddingBottom: 18,
  },
  messageWrap: {
    marginBottom: 10,
    flexDirection: "row",
  },
  messageWrapMine: {
    justifyContent: "flex-end",
  },
  messageWrapOther: {
    justifyContent: "flex-start",
  },
  messageBubble: {
    maxWidth: "88%",
    borderRadius: 17,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: BORDER,
  },
  adminBubble: {
    backgroundColor: ADMIN_BUBBLE,
  },
  userBubble: {
    backgroundColor: USER_BUBBLE,
    borderColor: "rgba(217,168,76,0.22)",
  },
  originalBubble: {
    borderColor: GOLD,
  },
  messageMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 5,
  },
  messageSender: {
    color: GOLD,
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  originalTag: {
    color: MUTED_DARK,
    fontSize: 9,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  messageText: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20,
  },
  messageTime: {
    color: MUTED_DARK,
    fontSize: 10,
    fontWeight: "700",
    marginTop: 7,
    textAlign: "right",
  },
  emptyBox: {
    marginTop: 50,
    padding: 18,
    borderRadius: 18,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: "center",
  },
  emptyTitle: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: "900",
  },
  emptySub: {
    color: MUTED,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
    marginTop: 6,
    textAlign: "center",
  },
  inputWrap: {
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    backgroundColor: CARD,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 105,
    borderRadius: 15,
    backgroundColor: CARD_SOFT,
    borderWidth: 1,
    borderColor: BORDER,
    color: COLORS.white,
    fontSize: 14,
    fontWeight: "800",
    paddingHorizontal: 12,
    paddingVertical: 10,
    textAlignVertical: "top",
  },
  sendBtn: {
    minWidth: 68,
    height: 44,
    borderRadius: 15,
    backgroundColor: GOLD,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  sendBtnDisabled: {
    opacity: 0.55,
  },
  sendBtnText: {
    color: BG,
    fontSize: 14,
    fontWeight: "900",
  },
});