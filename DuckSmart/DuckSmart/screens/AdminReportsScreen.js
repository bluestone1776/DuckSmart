// DuckSmart — Admin Reports Screen
//
// Clean admin inbox for submitted user reports.
// Tap any report to open UserMessages.js.
// Swipe left on a report to close/archive it.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  StatusBar,
  FlatList,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import {
  collection,
  doc,
  getDocs,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { Swipeable } from "react-native-gesture-handler";

import { COLORS } from "../constants/theme";
import { db } from "../services/firebase";
import { verifyCurrentAdmin } from "../services/adminLogin";
import UserMessages from "../components/UserMessages";

const GOLD = "#D9A84C";
const BG = "#05090A";
const CARD = "rgba(13,18,19,0.96)";
const CARD_SOFT = "rgba(255,255,255,0.055)";
const BORDER = "rgba(255,255,255,0.10)";
const MUTED = "rgba(255,255,255,0.66)";
const MUTED_DARK = "rgba(255,255,255,0.44)";
const RED = "#FF4D4D";
const GREEN = "#39FF14";

function clean(value) {
  return String(value || "").trim();
}

function lower(value) {
  return clean(value).toLowerCase();
}

function getReportId(report) {
  return clean(report?.firestoreId || report?.id);
}

function isClosedReport(report) {
  const status = lower(report?.status);
  return status === "closed" || status === "resolved";
}

function getReportTime(report) {
  return Number(
    report?.latestMessageAtMillis ||
      report?.updatedAtMillis ||
      report?.timestamp ||
      0
  );
}

function formatDate(value) {
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

function getStatusLabel(report) {
  const status = lower(report?.status);

  if (report?.adminUnread === true || status === "user_replied") {
    return "Needs Reply";
  }

  if (status === "admin_replied") return "Replied";
  if (status === "resolved") return "Resolved";
  if (status === "closed") return "Closed";

  return "Pending";
}

function getStatusColor(report) {
  const label = getStatusLabel(report);

  if (label === "Needs Reply") return GREEN;
  if (label === "Replied") return GOLD;
  if (label === "Resolved" || label === "Closed") return MUTED;

  return RED;
}

function getPreview(report) {
  return (
    clean(report?.latestMessage) ||
    clean(report?.message) ||
    "No message provided."
  );
}

function withTimeout(promise, ms, message) {
  let timer;

  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export default function AdminReportsScreen() {
  const navigation = useNavigation();
  const swipeRefs = useRef({});

  const [adminEmail, setAdminEmail] = useState("");
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [accessError, setAccessError] = useState("");

  const [reports, setReports] = useState([]);
  const [loadingReports, setLoadingReports] = useState(false);
  const [reportsError, setReportsError] = useState("");
  const [search, setSearch] = useState("");

  const [selectedReport, setSelectedReport] = useState(null);
  const [messagesVisible, setMessagesVisible] = useState(false);

  const activeReports = useMemo(
    () => reports.filter((report) => !isClosedReport(report)),
    [reports]
  );

  const loadReports = useCallback(async () => {
    setLoadingReports(true);
    setReportsError("");

    try {
      const snap = await withTimeout(
        getDocs(collection(db, "feedback")),
        9000,
        "Reports took too long to load."
      );

      const rows = snap.docs
        .map((docSnap) => ({
          firestoreId: docSnap.id,
          ...docSnap.data(),
        }))
        .sort((a, b) => getReportTime(b) - getReportTime(a));

      setReports(rows);
    } catch (err) {
      const message = err?.message || "Could not load reports.";
      console.warn("DuckSmart admin reports failed:", message);
      setReportsError(message);
    } finally {
      setLoadingReports(false);
    }
  }, []);

  const verifyAndLoad = useCallback(async () => {
    setCheckingAccess(true);
    setAccessError("");

    try {
      const admin = await verifyCurrentAdmin();

      setAdminEmail(admin.email || "Admin");
      await loadReports();
    } catch (err) {
      setAccessError(err?.message || "Admin access denied.");
    } finally {
      setCheckingAccess(false);
    }
  }, [loadReports]);

  useEffect(() => {
    verifyAndLoad();
  }, [verifyAndLoad]);

  const filteredReports = useMemo(() => {
    const term = lower(search);

    if (!term) return activeReports;

    return activeReports.filter((report) => {
      const searchable = [
        report.category,
        report.message,
        report.latestMessage,
        report.email,
        report.userId,
        report.status,
        report.platform,
        report.appVersion,
      ]
        .map(lower)
        .join(" ");

      return searchable.includes(term);
    });
  }, [activeReports, search]);

  const needsReplyCount = activeReports.filter(
    (report) =>
      report.adminUnread === true || lower(report.status) === "user_replied"
  ).length;

  const pendingCount = activeReports.filter(
    (report) => lower(report.status || "pending") === "pending"
  ).length;

  function closeScreen() {
    if (navigation.canGoBack()) {
      navigation.goBack();
    }
  }

  function closeOpenSwipeRows(exceptId = "") {
    Object.entries(swipeRefs.current || {}).forEach(([id, ref]) => {
      if (id !== exceptId) {
        ref?.close?.();
      }
    });
  }

  function openReport(report) {
    const reportId = getReportId(report);

    if (!reportId) {
      Alert.alert("Missing Report ID", "This report cannot be opened.");
      return;
    }

    closeOpenSwipeRows();

    setSelectedReport(report);
    setMessagesVisible(true);
  }

  function closeMessages() {
    setMessagesVisible(false);
    setSelectedReport(null);

    setTimeout(() => {
      loadReports();
    }, 300);
  }

  async function closeIssue(report) {
    const reportId = getReportId(report);

    if (!reportId) {
      Alert.alert("Missing Report ID", "This report cannot be closed.");
      return;
    }

    closeOpenSwipeRows();

    Alert.alert(
      "Close Issue?",
      "This will remove the report from the active admin inbox.",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Close Issue",
          style: "destructive",
          onPress: async () => {
            try {
              await updateDoc(doc(db, "feedback", reportId), {
                status: "closed",
                adminUnread: false,
                userUnread: false,
                closedAt: serverTimestamp(),
                closedAtMillis: Date.now(),
                updatedAt: serverTimestamp(),
                updatedAtMillis: Date.now(),
              });

              setReports((prev) =>
                prev.map((item) =>
                  getReportId(item) === reportId
                    ? {
                        ...item,
                        status: "closed",
                        adminUnread: false,
                        userUnread: false,
                        closedAtMillis: Date.now(),
                        updatedAtMillis: Date.now(),
                      }
                    : item
                )
              );
            } catch (err) {
              Alert.alert(
                "Close Failed",
                err?.message || "Could not close this issue."
              );
            }
          },
        },
      ]
    );
  }

  function renderHeader() {
    return (
      <>
        <View style={s.header}>
          <View style={{ flex: 1 }}>
            <Text style={s.kicker}>DUCKSMART ADMIN</Text>
            <Text style={s.title}>Reports Inbox</Text>
            <Text style={s.subTitle} numberOfLines={1}>
              {adminEmail}
            </Text>
          </View>

          <Pressable style={s.closeBtn} onPress={closeScreen}>
            <Text style={s.closeText}>✕</Text>
          </Pressable>
        </View>

        <View style={s.statsRow}>
          <View style={s.statCard}>
            <Text style={s.statValue}>{activeReports.length}</Text>
            <Text style={s.statLabel}>Active</Text>
          </View>

          <View style={s.statCard}>
            <Text style={s.statValue}>{needsReplyCount}</Text>
            <Text style={s.statLabel}>Needs Reply</Text>
          </View>

          <View style={s.statCard}>
            <Text style={s.statValue}>{pendingCount}</Text>
            <Text style={s.statLabel}>Pending</Text>
          </View>
        </View>

        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search reports..."
          placeholderTextColor="rgba(255,255,255,0.34)"
          style={s.searchInput}
          autoCapitalize="none"
        />

        {reportsError ? (
          <View style={s.errorBox}>
            <Text style={s.errorText}>{reportsError}</Text>
            <Pressable onPress={loadReports} style={s.retryBtn}>
              <Text style={s.retryText}>Try Again</Text>
            </Pressable>
          </View>
        ) : null}

        <Text style={s.swipeHint}>Swipe left on a report to close it.</Text>
      </>
    );
  }

  function renderRightActions(report) {
    return (
      <Pressable style={s.swipeCloseAction} onPress={() => closeIssue(report)}>
        <Text style={s.swipeCloseText}>Close</Text>
      </Pressable>
    );
  }

  function renderReport({ item }) {
    const reportId = getReportId(item);
    const statusColor = getStatusColor(item);
    const statusLabel = getStatusLabel(item);
    const isNew = statusLabel === "Needs Reply";

    return (
      <Swipeable
        ref={(ref) => {
          if (reportId) {
            swipeRefs.current[reportId] = ref;
          }
        }}
        renderRightActions={() => renderRightActions(item)}
        overshootRight={false}
        onSwipeableWillOpen={() => closeOpenSwipeRows(reportId)}
      >
        <Pressable
          style={({ pressed }) => [
            s.reportCard,
            isNew ? s.reportCardNew : null,
            pressed ? s.reportCardPressed : null,
          ]}
          onPress={() => openReport(item)}
        >
          <View style={s.reportTopRow}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={s.categoryRow}>
                <Text style={s.category} numberOfLines={1}>
                  {item.category || "Other"}
                </Text>

                {isNew ? (
                  <View style={s.newBadge}>
                    <Text style={s.newBadgeText}>NEW</Text>
                  </View>
                ) : null}
              </View>

              <Text style={s.email} numberOfLines={1}>
                {item.email || "No email"}
              </Text>
            </View>

            <View style={[s.statusPill, { borderColor: statusColor }]}>
              <Text style={[s.statusText, { color: statusColor }]}>
                {statusLabel}
              </Text>
            </View>
          </View>

          <Text style={s.preview} numberOfLines={3}>
            {getPreview(item)}
          </Text>

          <View style={s.reportBottomRow}>
            <Text style={s.dateText}>{formatDate(getReportTime(item))}</Text>

            <View style={s.openPill}>
              <Text style={s.openPillText}>Open Chat</Text>
              <Text style={s.openArrow}>›</Text>
            </View>
          </View>
        </Pressable>
      </Swipeable>
    );
  }

  function renderEmpty() {
    if (loadingReports) {
      return (
        <View style={s.centerBox}>
          <ActivityIndicator color={GOLD} />
          <Text style={s.centerText}>Loading reports...</Text>
        </View>
      );
    }

    return (
      <View style={s.emptyCard}>
        <Text style={s.emptyTitle}>No Reports Found</Text>
        <Text style={s.emptyText}>No active reports match this search.</Text>
      </View>
    );
  }

  if (checkingAccess) {
    return (
      <SafeAreaView style={s.safe}>
        <StatusBar barStyle="light-content" />
        <View style={s.centerBox}>
          <ActivityIndicator color={GOLD} />
          <Text style={s.centerTitle}>Checking admin access...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (accessError) {
    return (
      <SafeAreaView style={s.safe}>
        <StatusBar barStyle="light-content" />

        <View style={s.header}>
          <View style={{ flex: 1 }}>
            <Text style={s.kicker}>DUCKSMART ADMIN</Text>
            <Text style={s.title}>Access Denied</Text>
          </View>

          <Pressable style={s.closeBtn} onPress={closeScreen}>
            <Text style={s.closeText}>✕</Text>
          </Pressable>
        </View>

        <View style={s.centerBox}>
          <Text style={s.errorTitle}>Admin Access Denied</Text>
          <Text style={s.errorTextLarge}>{accessError}</Text>

          <Pressable style={s.goldBtn} onPress={verifyAndLoad}>
            <Text style={s.goldBtnText}>Check Again</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" />

      <FlatList
        data={filteredReports}
        keyExtractor={(item, index) => getReportId(item) || `report-${index}`}
        renderItem={renderReport}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={s.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={loadingReports}
            onRefresh={loadReports}
            tintColor={GOLD}
          />
        }
      />

      <UserMessages
        visible={messagesVisible}
        onClose={closeMessages}
        report={selectedReport}
        feedbackId={selectedReport?.firestoreId || ""}
        mode="admin"
        title={
          selectedReport?.category
            ? `${selectedReport.category} Report`
            : "DuckSmart Support"
        }
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: BG,
  },

  listContent: {
    paddingBottom: 38,
  },

  header: {
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 12,
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
    letterSpacing: 1.2,
  },
  title: {
    color: COLORS.white,
    fontSize: 25,
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
    width: 42,
    height: 42,
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

  statsRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 16,
    paddingVertical: 10,
    alignItems: "center",
  },
  statValue: {
    color: GOLD,
    fontSize: 21,
    fontWeight: "900",
  },
  statLabel: {
    color: MUTED_DARK,
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
    marginTop: 2,
  },

  searchInput: {
    marginHorizontal: 12,
    marginTop: 10,
    marginBottom: 8,
    height: 46,
    borderRadius: 15,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    color: COLORS.white,
    paddingHorizontal: 13,
    fontSize: 14,
    fontWeight: "800",
  },

  swipeHint: {
    color: MUTED_DARK,
    fontSize: 11,
    fontWeight: "800",
    marginHorizontal: 14,
    marginBottom: 10,
  },

  reportCard: {
    marginHorizontal: 12,
    marginBottom: 10,
    padding: 13,
    borderRadius: 18,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
  },
  reportCardNew: {
    borderColor: "rgba(217,168,76,0.55)",
    backgroundColor: "rgba(217,168,76,0.075)",
  },
  reportCardPressed: {
    opacity: 0.72,
    transform: [{ scale: 0.995 }],
  },
  reportTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  categoryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  category: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: "900",
    flexShrink: 1,
  },
  email: {
    color: MUTED_DARK,
    fontSize: 11,
    fontWeight: "800",
    marginTop: 4,
  },
  newBadge: {
    backgroundColor: GOLD,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  newBadgeText: {
    color: BG,
    fontSize: 9,
    fontWeight: "900",
  },
  statusPill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 9,
  },
  statusText: {
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  preview: {
    color: MUTED,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 19,
    marginTop: 11,
  },
  reportBottomRow: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  dateText: {
    color: MUTED_DARK,
    fontSize: 11,
    fontWeight: "700",
  },
  openPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(217,168,76,0.12)",
    borderWidth: 1,
    borderColor: "rgba(217,168,76,0.32)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  openPillText: {
    color: GOLD,
    fontSize: 11,
    fontWeight: "900",
  },
  openArrow: {
    color: GOLD,
    fontSize: 15,
    fontWeight: "900",
    marginTop: -1,
  },

  swipeCloseAction: {
    width: 94,
    marginBottom: 10,
    marginRight: 12,
    borderRadius: 18,
    backgroundColor: "rgba(255,77,77,0.92)",
    alignItems: "center",
    justifyContent: "center",
  },
  swipeCloseText: {
    color: COLORS.white,
    fontSize: 13,
    fontWeight: "900",
  },

  centerBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 22,
  },
  centerTitle: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: "900",
    marginTop: 12,
  },
  centerText: {
    color: MUTED,
    fontSize: 13,
    fontWeight: "800",
    marginTop: 8,
  },

  emptyCard: {
    marginHorizontal: 12,
    marginTop: 12,
    padding: 20,
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
  emptyText: {
    color: MUTED,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 6,
    textAlign: "center",
  },

  errorBox: {
    marginHorizontal: 12,
    marginBottom: 10,
    padding: 11,
    borderRadius: 15,
    backgroundColor: "rgba(255,77,77,0.08)",
    borderWidth: 1,
    borderColor: RED,
  },
  errorText: {
    color: RED,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 17,
    textAlign: "center",
  },
  errorTitle: {
    color: COLORS.white,
    fontSize: 20,
    fontWeight: "900",
    marginBottom: 8,
  },
  errorTextLarge: {
    color: RED,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 19,
    textAlign: "center",
  },
  retryBtn: {
    marginTop: 8,
    alignItems: "center",
  },
  retryText: {
    color: GOLD,
    fontSize: 12,
    fontWeight: "900",
  },
  goldBtn: {
    marginTop: 16,
    backgroundColor: GOLD,
    borderRadius: 15,
    paddingVertical: 13,
    paddingHorizontal: 26,
  },
  goldBtnText: {
    color: BG,
    fontSize: 14,
    fontWeight: "900",
  },
});