// DuckSmart — Blocked Users / Reports Screen
//
// Lets users:
// - View open admin conversations
// - Open/reply to admin conversations
// - Swipe left to close/archive admin conversations
// - View blocked users
// - Unblock users
// - Submit a report / admin contact request

import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Image,
  ActivityIndicator,
  Alert,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { Swipeable } from "react-native-gesture-handler";
import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";

import { COLORS } from "../constants/theme";
import { useAuth } from "../context/AuthContext";
import { db } from "../services/firebase";
import {
  loadBlockedUsers,
  unblockUser,
  submitUserReport,
} from "../services/block_user";
import UserMessages from "../components/UserMessages";

const GOLD = "#D9A84C";
const RED = "#FF4D4D";
const GREEN = "#39FF14";
const BG = "#05090A";
const CARD = "rgba(13,18,19,0.96)";
const CARD_SOFT = "rgba(255,255,255,0.045)";
const BORDER = "rgba(255,255,255,0.08)";
const GOLD_BORDER = "rgba(217,168,76,0.34)";
const MUTED = "rgba(255,255,255,0.62)";
const MUTED_DARK = "rgba(255,255,255,0.42)";

const REPORT_CATEGORIES = [
  "Harassment",
  "Spam",
  "Inappropriate Content",
  "Safety Concern",
  "Account Help",
  "Other",
];

function clean(value) {
  return String(value || "").trim();
}

function lower(value) {
  return clean(value).toLowerCase();
}

function getDisplayName(profile) {
  return (
    profile?.displayName ||
    profile?.emailLower ||
    profile?.duckIdLower ||
    "DuckSmart User"
  );
}

function getDuckId(profile) {
  return profile?.duckIdLower || profile?.duckId || "";
}

function getPhotoURL(profile) {
  return profile?.photoURL || null;
}

function getInitials(value) {
  const str = String(value || "D").trim();
  const parts = str.split(/\s+/).filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }

  return String(parts[0]?.[0] || "D").toUpperCase();
}

function getThreadId(thread) {
  return clean(thread?.firestoreId || thread?.id);
}

function isClosedThread(thread) {
  const status = lower(thread?.status);
  return status === "closed" || status === "resolved";
}

function getThreadTime(thread) {
  return Number(
    thread?.latestMessageAtMillis ||
      thread?.updatedAtMillis ||
      thread?.timestamp ||
      0
  );
}

function formatThreadDate(value) {
  const time = Number(value || 0);
  if (!time) return "No date";

  const date = new Date(time);
  if (Number.isNaN(date.getTime())) return "No date";

  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getThreadTitle(thread) {
  return clean(thread?.category) || "DuckSmart Admin";
}

function getThreadPreview(thread) {
  return (
    clean(thread?.latestMessage) ||
    clean(thread?.message) ||
    "Tap to view your conversation with DuckSmart admin."
  );
}

function getThreadStatus(thread) {
  const status = lower(thread?.status);

  if (thread?.userUnread === true || status === "admin_replied") {
    return "NEW";
  }

  if (status === "user_replied") return "SENT";
  if (status === "pending") return "OPEN";

  return "OPEN";
}

function BlockedUserRow({ item, busy, onUnblock }) {
  const displayName = getDisplayName(item);
  const duckId = getDuckId(item);
  const photoURL = getPhotoURL(item);

  return (
    <View style={s.blockedRow}>
      {photoURL ? (
        <Image source={{ uri: photoURL }} style={s.avatar} resizeMode="cover" />
      ) : (
        <View style={s.avatarFallback}>
          <Text style={s.avatarInitials}>{getInitials(displayName)}</Text>
        </View>
      )}

      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.blockedName} numberOfLines={1}>
          {displayName}
        </Text>

        <Text style={s.blockedHandle} numberOfLines={1}>
          {duckId ? `@${duckId}` : item?.emailLower || "Blocked User"}
        </Text>
      </View>

      <Pressable
        style={[s.unblockBtn, busy ? s.disabledBtn : null]}
        onPress={() => onUnblock?.(item)}
        disabled={busy}
      >
        <Text style={s.unblockBtnText}>{busy ? "..." : "Unblock"}</Text>
      </Pressable>
    </View>
  );
}

function AdminThreadRow({ item, onOpen, onCloseThread }) {
  const threadId = getThreadId(item);
  const status = getThreadStatus(item);
  const isUnread = status === "NEW";

  function renderRightActions() {
    return (
      <Pressable style={s.swipeCloseAction} onPress={() => onCloseThread?.(item)}>
        <Text style={s.swipeCloseText}>Close</Text>
      </Pressable>
    );
  }

  return (
    <Swipeable
      renderRightActions={renderRightActions}
      overshootRight={false}
      key={threadId}
    >
      <Pressable
        style={[s.adminThreadRow, isUnread ? s.adminThreadRowUnread : null]}
        onPress={() => onOpen?.(item)}
      >
        <View style={s.adminIconWrap}>
          <Text style={s.adminIcon}>💬</Text>
        </View>

        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={s.adminThreadTopRow}>
            <Text style={s.adminThreadTitle} numberOfLines={1}>
              {getThreadTitle(item)}
            </Text>

            <View style={[s.threadBadge, isUnread ? s.threadBadgeNew : null]}>
              <Text style={[s.threadBadgeText, isUnread ? s.threadBadgeTextNew : null]}>
                {status}
              </Text>
            </View>
          </View>

          <Text style={s.adminThreadPreview} numberOfLines={2}>
            {getThreadPreview(item)}
          </Text>

          <Text style={s.adminThreadDate} numberOfLines={1}>
            {formatThreadDate(getThreadTime(item))}
          </Text>
        </View>

        <Text style={s.threadArrow}>›</Text>
      </Pressable>
    </Swipeable>
  );
}

export default function BlockedScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();

  const [adminThreads, setAdminThreads] = useState([]);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [selectedThread, setSelectedThread] = useState(null);
  const [threadModalVisible, setThreadModalVisible] = useState(false);

  const [blockedUsers, setBlockedUsers] = useState([]);
  const [loadingBlocked, setLoadingBlocked] = useState(true);
  const [busyUid, setBusyUid] = useState(null);

  const [category, setCategory] = useState("Other");
  const [reportedUserText, setReportedUserText] = useState("");
  const [message, setMessage] = useState("");
  const [submittingReport, setSubmittingReport] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function loadData() {
      if (!user?.uid) {
        setLoadingThreads(false);
        setLoadingBlocked(false);
        return;
      }

      setLoadingThreads(true);
      setLoadingBlocked(true);

      try {
        const [threadsResults, blockedResults] = await Promise.all([
          loadAdminThreads(user.uid),
          loadBlockedUsers(user.uid),
        ]);

        if (mounted) {
          setAdminThreads(Array.isArray(threadsResults) ? threadsResults : []);
          setBlockedUsers(Array.isArray(blockedResults) ? blockedResults : []);
        }
      } catch (err) {
        console.log("DuckSmart blocked screen load error:", err?.message || err);

        if (mounted) {
          setAdminThreads([]);
          setBlockedUsers([]);
        }
      } finally {
        if (mounted) {
          setLoadingThreads(false);
          setLoadingBlocked(false);
        }
      }
    }

    loadData();

    return () => {
      mounted = false;
    };
  }, [user?.uid]);

  async function loadAdminThreads(uid) {
    if (!uid) return [];

    const feedbackQuery = query(
      collection(db, "feedback"),
      where("userId", "==", uid)
    );

    const snap = await getDocs(feedbackQuery);

    return snap.docs
      .map((docSnap) => ({
        firestoreId: docSnap.id,
        ...docSnap.data(),
      }))
      .filter((thread) => !isClosedThread(thread))
      .sort((a, b) => getThreadTime(b) - getThreadTime(a));
  }

  async function refreshAdminThreads() {
    if (!user?.uid) return;

    setLoadingThreads(true);

    try {
      const results = await loadAdminThreads(user.uid);
      setAdminThreads(Array.isArray(results) ? results : []);
    } catch (err) {
      console.log("DuckSmart admin threads refresh error:", err?.message || err);
      setAdminThreads([]);
    } finally {
      setLoadingThreads(false);
    }
  }

  async function refreshBlockedUsers() {
    if (!user?.uid) return;

    setLoadingBlocked(true);

    try {
      const results = await loadBlockedUsers(user.uid);
      setBlockedUsers(Array.isArray(results) ? results : []);
    } catch {
      setBlockedUsers([]);
    } finally {
      setLoadingBlocked(false);
    }
  }

  function openAdminThread(thread) {
    if (!getThreadId(thread)) {
      Alert.alert("Missing Conversation", "This admin conversation could not be opened.");
      return;
    }

    setSelectedThread(thread);
    setThreadModalVisible(true);
  }

  function closeThreadModal() {
    setThreadModalVisible(false);
    setSelectedThread(null);

    setTimeout(() => {
      refreshAdminThreads();
    }, 300);
  }

  function confirmCloseThread(thread) {
    const threadId = getThreadId(thread);

    if (!threadId) {
      Alert.alert("Missing Conversation", "This admin conversation could not be closed.");
      return;
    }

    Alert.alert(
      "Close Conversation?",
      "This will archive the conversation and remove it from this screen.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Close",
          style: "destructive",
          onPress: () => closeAdminThread(thread),
        },
      ]
    );
  }

  async function closeAdminThread(thread) {
    const threadId = getThreadId(thread);

    if (!threadId) return;

    try {
      await updateDoc(doc(db, "feedback", threadId), {
        status: "closed",
        userUnread: false,
        closedByUserAt: serverTimestamp(),
        closedByUserAtMillis: Date.now(),
        updatedAt: serverTimestamp(),
        updatedAtMillis: Date.now(),
      });

      setAdminThreads((prev) =>
        prev.filter((item) => getThreadId(item) !== threadId)
      );
    } catch (err) {
      console.error("DuckSmart close admin thread error:", err);
      Alert.alert("Close Failed", err?.message || "Could not close this conversation.");
    }
  }

  function confirmUnblock(target) {
    if (!user?.uid || !target?.uid || busyUid) return;

    Alert.alert(
      "Unblock User?",
      `Allow ${getDisplayName(target)} to appear in searches and sharing again?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Unblock",
          onPress: () => handleUnblock(target),
        },
      ]
    );
  }

  async function handleUnblock(target) {
    if (!user?.uid || !target?.uid || busyUid) return;

    setBusyUid(target.uid);

    try {
      await unblockUser(user.uid, target.uid);
      await refreshBlockedUsers();
    } catch (err) {
      console.error("DuckSmart unblock user error:", err);
      Alert.alert("Unblock Failed", err?.message || "Please try again.");
    } finally {
      setBusyUid(null);
    }
  }

  async function handleSubmitReport() {
    if (!user?.uid || submittingReport) return;

    const safeMessage = message.trim();
    const safeReportedUserText = reportedUserText.trim();

    if (!safeMessage) {
      Alert.alert("Missing Message", "Please describe what happened.");
      return;
    }

    try {
      setSubmittingReport(true);

      await submitUserReport({
        reporterUid: user.uid,
        reporterEmail: user.email || "",
        category,
        reportedUserText: safeReportedUserText,
        message: safeMessage,
      });

      setCategory("Other");
      setReportedUserText("");
      setMessage("");

      Alert.alert("Report Submitted", "DuckSmart admin has received your report.");
    } catch (err) {
      console.error("DuckSmart submit report error:", err);
      Alert.alert("Report Failed", err?.message || "Please try again.");
    } finally {
      setSubmittingReport(false);
    }
  }

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={s.container} showsVerticalScrollIndicator={false}>
          <View style={s.headerRow}>
            <Pressable style={s.backBtn} onPress={() => navigation.goBack()}>
              <Text style={s.backBtnText}>‹</Text>
            </Pressable>

            <View style={{ flex: 1 }}>
              <Text style={s.headerKicker}>DUCKSMART</Text>
              <Text style={s.headerTitle}>REPORTS / BLOCKED USERS</Text>
            </View>
          </View>

          <View style={s.section}>
            <View style={s.sectionHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.sectionTitle}>Admin Conversations</Text>
                <Text style={s.sectionSub}>
                  Open conversations with DuckSmart admin appear here first. Swipe left to close one.
                </Text>
              </View>

              {loadingThreads ? <ActivityIndicator color={GOLD} size="small" /> : null}
            </View>

            {loadingThreads ? (
              <View style={s.loadingCard}>
                <ActivityIndicator color={GOLD} />
                <Text style={s.loadingText}>Loading admin conversations...</Text>
              </View>
            ) : adminThreads.length > 0 ? (
              <View style={s.adminThreadList}>
                {adminThreads.map((item) => (
                  <AdminThreadRow
                    key={getThreadId(item)}
                    item={item}
                    onOpen={openAdminThread}
                    onCloseThread={confirmCloseThread}
                  />
                ))}
              </View>
            ) : (
              <View style={s.emptyCard}>
                <Text style={s.emptyTitle}>No Admin Conversations</Text>
                <Text style={s.emptyText}>
                  If DuckSmart admin replies to one of your reports, the conversation will appear here.
                </Text>
              </View>
            )}
          </View>

          <View style={s.section}>
            <View style={s.sectionHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.sectionTitle}>Blocked Users</Text>
                <Text style={s.sectionSub}>
                  Blocked users will not appear in your Hunting Party search results.
                </Text>
              </View>

              {loadingBlocked ? <ActivityIndicator color={GOLD} size="small" /> : null}
            </View>

            {loadingBlocked ? (
              <View style={s.loadingCard}>
                <ActivityIndicator color={GOLD} />
                <Text style={s.loadingText}>Loading blocked users...</Text>
              </View>
            ) : blockedUsers.length > 0 ? (
              <View style={s.blockedList}>
                {blockedUsers.map((item) => (
                  <BlockedUserRow
                    key={item.uid}
                    item={item}
                    busy={busyUid === item.uid}
                    onUnblock={confirmUnblock}
                  />
                ))}
              </View>
            ) : (
              <View style={s.emptyCard}>
                <Text style={s.emptyTitle}>No Blocked Users</Text>
                <Text style={s.emptyText}>
                  Users you block later will appear here so you can unblock them.
                </Text>
              </View>
            )}
          </View>

          <View style={s.section}>
            <Text style={s.sectionTitle}>Submit Report / Contact Admin</Text>
            <Text style={s.sectionSub}>
              Use this for user reports, safety concerns, account help, or corporate/group setup questions.
            </Text>

            <Text style={s.label}>Category</Text>
            <View style={s.chipRow}>
              {REPORT_CATEGORIES.map((item) => {
                const selected = item === category;

                return (
                  <Pressable
                    key={item}
                    style={[s.chip, selected ? s.chipSelected : null]}
                    onPress={() => setCategory(item)}
                  >
                    <Text style={[s.chipText, selected ? s.chipTextSelected : null]}>
                      {item}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={s.label}>User ID / Email Involved Optional</Text>
            <TextInput
              value={reportedUserText}
              onChangeText={setReportedUserText}
              placeholder="Example: @mallard-472 or user@email.com"
              placeholderTextColor="rgba(255,255,255,0.34)"
              autoCapitalize="none"
              autoCorrect={false}
              style={s.input}
            />

            <Text style={s.label}>Message</Text>
            <TextInput
              value={message}
              onChangeText={setMessage}
              placeholder="Describe the issue..."
              placeholderTextColor="rgba(255,255,255,0.34)"
              multiline
              style={s.textArea}
            />

            <Pressable
              style={[s.primaryBtn, submittingReport ? s.disabledBtn : null]}
              onPress={handleSubmitReport}
              disabled={submittingReport}
            >
              <Text style={s.primaryBtnText}>
                {submittingReport ? "Submitting..." : "Submit Report"}
              </Text>
            </Pressable>
          </View>

          <View style={{ height: 28 }} />
        </ScrollView>

        <UserMessages
          visible={threadModalVisible}
          onClose={closeThreadModal}
          report={selectedThread}
          feedbackId={selectedThread?.firestoreId || ""}
          mode="user"
          title={
            selectedThread?.category
              ? `${selectedThread.category} Report`
              : "DuckSmart Support"
          }
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: BG,
  },
  container: {
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 40,
  },

  headerRow: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  backBtnText: {
    color: COLORS.white,
    fontSize: 30,
    fontWeight: "900",
    marginTop: -3,
  },
  headerKicker: {
    color: GOLD,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  headerTitle: {
    color: COLORS.white,
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: 0.3,
    marginTop: 1,
  },

  section: {
    marginBottom: 8,
    padding: 11,
    borderRadius: 18,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  sectionTitle: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: "900",
    marginBottom: 5,
    letterSpacing: 0.2,
  },
  sectionSub: {
    color: MUTED,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
    marginBottom: 10,
  },

  loadingCard: {
    minHeight: 112,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: CARD_SOFT,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    color: MUTED,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 10,
  },

  adminThreadList: {
    gap: 8,
  },
  adminThreadRow: {
    minHeight: 78,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: CARD_SOFT,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    marginBottom: 8,
  },
  adminThreadRowUnread: {
    borderColor: GOLD,
    backgroundColor: "rgba(217,168,76,0.11)",
  },
  adminIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: "rgba(217,168,76,0.14)",
    borderWidth: 1,
    borderColor: GOLD_BORDER,
    alignItems: "center",
    justifyContent: "center",
  },
  adminIcon: {
    fontSize: 21,
  },
  adminThreadTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  adminThreadTitle: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: "900",
    flexShrink: 1,
  },
  adminThreadPreview: {
    color: MUTED,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
    marginTop: 4,
  },
  adminThreadDate: {
    color: MUTED_DARK,
    fontSize: 10,
    fontWeight: "800",
    marginTop: 4,
  },
  threadBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
  },
  threadBadgeNew: {
    backgroundColor: GOLD,
    borderColor: GOLD,
  },
  threadBadgeText: {
    color: MUTED,
    fontSize: 9,
    fontWeight: "900",
  },
  threadBadgeTextNew: {
    color: BG,
  },
  threadArrow: {
    color: GOLD,
    fontSize: 26,
    fontWeight: "900",
    marginLeft: 2,
  },
  swipeCloseAction: {
    width: 92,
    minHeight: 78,
    marginBottom: 8,
    borderRadius: 15,
    backgroundColor: "rgba(255,77,77,0.92)",
    alignItems: "center",
    justifyContent: "center",
  },
  swipeCloseText: {
    color: COLORS.white,
    fontSize: 13,
    fontWeight: "900",
  },

  blockedList: {
    gap: 8,
  },
  blockedRow: {
    minHeight: 66,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: CARD_SOFT,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    marginBottom: 8,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: BG,
  },
  avatarFallback: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: "rgba(217,168,76,0.14)",
    borderWidth: 1,
    borderColor: GOLD_BORDER,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitials: {
    color: GOLD,
    fontSize: 14,
    fontWeight: "900",
  },
  blockedName: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: "900",
  },
  blockedHandle: {
    color: MUTED,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 3,
  },
  unblockBtn: {
    minWidth: 78,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 13,
    backgroundColor: "rgba(217,168,76,0.12)",
    borderWidth: 1,
    borderColor: GOLD,
    alignItems: "center",
  },
  unblockBtnText: {
    color: GOLD,
    fontSize: 12,
    fontWeight: "900",
  },

  emptyCard: {
    marginTop: 4,
    padding: 13,
    borderRadius: 15,
    backgroundColor: "rgba(255,255,255,0.035)",
    borderWidth: 1,
    borderColor: BORDER,
  },
  emptyTitle: {
    color: COLORS.white,
    fontSize: 13,
    fontWeight: "900",
    textAlign: "center",
  },
  emptyText: {
    color: MUTED,
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
    lineHeight: 17,
    marginTop: 5,
  },

  label: {
    color: MUTED,
    fontSize: 11,
    fontWeight: "900",
    marginTop: 8,
    marginBottom: 7,
    letterSpacing: 0.4,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
    marginBottom: 2,
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: CARD_SOFT,
  },
  chipSelected: {
    borderColor: GOLD,
    backgroundColor: "rgba(217,168,76,0.12)",
  },
  chipText: {
    color: MUTED,
    fontSize: 11,
    fontWeight: "800",
  },
  chipTextSelected: {
    color: GOLD,
    fontWeight: "900",
  },
  input: {
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "rgba(255,255,255,0.04)",
    color: COLORS.white,
    paddingHorizontal: 12,
    fontWeight: "800",
    fontSize: 14,
  },
  textArea: {
    minHeight: 116,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "rgba(255,255,255,0.04)",
    color: COLORS.white,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontWeight: "800",
    fontSize: 14,
    textAlignVertical: "top",
  },
  primaryBtn: {
    marginTop: 12,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: GOLD,
    alignItems: "center",
  },
  primaryBtnText: {
    color: BG,
    fontWeight: "900",
    fontSize: 14,
  },
  disabledBtn: {
    opacity: 0.55,
  },
});