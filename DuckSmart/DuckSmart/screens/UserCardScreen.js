// DuckSmart — User Card Screen
//
// Opened when tapping a Hunting Party member or searched DuckSmart user.
// Shows:
// - Selected user's public profile
// - DuckSmart ID / profile image
// - Hunting Party request/approval status when known
// - Shared hunts / pins / logs / decoy spreads / scouting logs between both users
// - Request Hunting Party button for searched users
// - Report / Block User safety action
//
// Fixed:
// - Shared rows always open ShareScreen.
// - Remove / Unshare is no longer handled from the row.
// - ShareScreen now owns the shared item remove/unshare button.

import React, { useEffect, useMemo, useState } from "react";
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
  Modal,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, useRoute } from "@react-navigation/native";
import { doc, getDoc } from "firebase/firestore";

import { COLORS } from "../constants/theme";
import { useAuth } from "../context/AuthContext";
import { db, isFirebaseConfigValid } from "../services/firebase";
import {
  loadAllInAppNotifications,
  markInAppNotificationRead,
} from "../services/in_app_notifications";
import {
  loadLogsSharedByMe,
  sendHuntingPartyRequest,
} from "../services/user_search";
import {
  blockUser,
  submitUserReport,
} from "../services/block_user";

const GOLD = "#D9A84C";
const RED = "#FF4D4D";
const GREEN = "#39D96A";
const BLUE = "#4DA3FF";
const BG = "#05090A";
const CARD = "rgba(13,18,19,0.96)";
const SECTION_BG = "rgba(5,10,11,0.96)";
const CARD_SOFT = "rgba(255,255,255,0.045)";
const BORDER = "rgba(255,255,255,0.08)";
const GOLD_BORDER = "rgba(217,168,76,0.34)";
const MUTED = "rgba(255,255,255,0.62)";
const MUTED_DARK = "rgba(255,255,255,0.42)";

const SHARED_NOTIFICATION_TYPES = new Set([
  "shared_hunt_log",
  "shared_pin",
  "shared_decoy_spread",
  "shared_scouting_log",
]);

function cleanString(value) {
  return String(value || "").trim();
}

function getParamMember(routeParams = {}) {
  return (
    routeParams.member ||
    routeParams.user ||
    routeParams.profile ||
    routeParams.selectedUser ||
    null
  );
}

function getParamMemberUid(routeParams = {}) {
  return (
    routeParams.memberUid ||
    routeParams.uid ||
    routeParams.userId ||
    routeParams.member?.uid ||
    routeParams.user?.uid ||
    routeParams.profile?.uid ||
    routeParams.selectedUser?.uid ||
    ""
  );
}

function getDisplayName(profile) {
  return (
    profile?.displayName ||
    profile?.emailLower ||
    profile?.duckIdLower ||
    profile?.duckId ||
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

function formatDate(value) {
  if (!value) return "";

  const date =
    typeof value === "number"
      ? new Date(value)
      : value?.seconds
        ? new Date(value.seconds * 1000)
        : new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getSharedTypeLabel(item) {
  const type = String(item?.type || item?.itemType || "").toLowerCase();

  if (type === "shared_pin" || type === "pin" || type === "map_pin" || type === "mappin") {
    return "Map Pin";
  }

  if (type === "shared_hunt_log" || type === "huntlog" || type === "hunt_log" || type === "hunt") {
    return "Hunt Log";
  }

  if (type === "shared_decoy_spread" || type === "decoy" || type === "decoy_spread" || type === "decoyspread") {
    return "Decoy Spread";
  }

  if (type === "shared_scouting_log" || type === "scouting" || type === "scouting_log") {
    return "Scouting Log";
  }

  return "Shared Log";
}

function getShareTypeForShareScreen(item) {
  const type = String(item?.type || item?.itemType || "").toLowerCase();

  if (type === "shared_pin" || type === "pin" || type === "map_pin" || type === "mappin") {
    return "pin";
  }

  if (type === "shared_hunt_log" || type === "huntlog" || type === "hunt_log" || type === "hunt") {
    return "hunt_log";
  }

  if (type === "shared_decoy_spread" || type === "decoy" || type === "decoy_spread" || type === "decoyspread") {
    return "decoy_spread";
  }

  if (type === "shared_scouting_log" || type === "scouting" || type === "scouting_log") {
    return "scouting_log";
  }

  return "shared_item";
}

function getSharedIcon(item) {
  const label = getSharedTypeLabel(item);

  if (label === "Map Pin") return "📍";
  if (label === "Decoy Spread") return "🦆";
  if (label === "Scouting Log") return "🔎";
  return "▤";
}

function getSharedTitle(item) {
  return (
    item?.title ||
    item?.payload?.title ||
    item?.payload?.pinTitle ||
    item?.payload?.locationName ||
    item?.payload?.environment ||
    item?.message ||
    "Shared Item"
  );
}

function itemMatchesMember(item, memberUid) {
  if (!item || !memberUid) return false;

  const directFields = [
    item.recipientUid,
    item.sharedWithUid,
    item.targetUid,
    item.memberUid,
    item.senderUid,
    item.ownerUid,
  ];

  if (directFields.some((value) => cleanString(value) === memberUid)) {
    return true;
  }

  if (Array.isArray(item.recipientUids) && item.recipientUids.includes(memberUid)) {
    return true;
  }

  if (Array.isArray(item.sharedWithUids) && item.sharedWithUids.includes(memberUid)) {
    return true;
  }

  if (Array.isArray(item.sharedWith)) {
    return item.sharedWith.some((entry) => {
      if (typeof entry === "string") return entry === memberUid;
      return cleanString(entry?.uid || entry?.memberUid || entry?.recipientUid) === memberUid;
    });
  }

  return false;
}

function normalizePublicProfile(data = {}, fallbackUid = "") {
  return {
    uid: data.uid || fallbackUid,
    memberUid: data.memberUid || data.uid || fallbackUid,
    displayName: data.displayName || "DuckSmart User",
    displayNameLower: data.displayNameLower || String(data.displayName || "").toLowerCase(),
    emailLower: data.emailLower || "",
    duckId: data.duckId || data.duckIdLower || "",
    duckIdLower: data.duckIdLower || data.duckId || "",
    photoURL: data.photoURL || null,
    status: data.status || "",
  };
}

function SectionHeader({ eyebrow, title, subtitle, right }) {
  return (
    <View style={s.sectionHeaderBlock}>
      <View style={{ flex: 1 }}>
        {eyebrow ? <Text style={s.sectionEyebrow}>{eyebrow}</Text> : null}
        <Text style={s.sectionTitle}>{title}</Text>
        {subtitle ? <Text style={s.sectionSub}>{subtitle}</Text> : null}
      </View>

      {right ? <View style={s.sectionRight}>{right}</View> : null}
    </View>
  );
}

function StatusPill({ status }) {
  const safeStatus = String(status || "unknown").toLowerCase();

  let label = safeStatus.toUpperCase();
  let style = s.statusNeutral;
  let textStyle = s.statusTextNeutral;

  if (safeStatus === "active" || safeStatus === "approved") {
    label = "APPROVED";
    style = s.statusApproved;
    textStyle = s.statusTextApproved;
  } else if (safeStatus === "pending") {
    label = "PENDING";
    style = s.statusPending;
    textStyle = s.statusTextPending;
  } else if (safeStatus === "requested") {
    label = "REQUESTED";
    style = s.statusRequested;
    textStyle = s.statusTextRequested;
  }

  return (
    <View style={[s.statusPill, style]}>
      <Text style={[s.statusText, textStyle]}>{label}</Text>
    </View>
  );
}

function SharedRow({ item, onPress }) {
  const isIncoming = item.direction === "shared_with_me";
  const typeLabel = getSharedTypeLabel(item);
  const title = getSharedTitle(item);
  const date = formatDate(item.createdAt || item.sharedAt || item.updatedAt);

  return (
    <Pressable
      style={[s.sharedRow, isIncoming ? s.sharedIncoming : s.sharedOutgoing]}
      onPress={() => onPress?.(item)}
    >
      <View style={s.sharedIconWrap}>
        <Text style={s.sharedIcon}>{getSharedIcon(item)}</Text>
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={s.sharedTitleRow}>
          <Text style={s.sharedTitle} numberOfLines={1}>
            {title}
          </Text>

          <View style={[s.directionPill, isIncoming ? s.directionPillIncoming : s.directionPillOutgoing]}>
            <Text style={[s.directionPillText, isIncoming ? s.directionPillTextIncoming : null]}>
              {isIncoming ? "WITH YOU" : "BY YOU"}
            </Text>
          </View>
        </View>

        <Text style={s.sharedMeta} numberOfLines={2}>
          {typeLabel}
          {date ? ` • ${date}` : ""}
          {item.status ? ` • ${String(item.status).toUpperCase()}` : ""}
        </Text>
      </View>

      <Text style={s.sharedChevron}>›</Text>
    </Pressable>
  );
}

function UserAvatar({ profile, size = 126 }) {
  const displayName = getDisplayName(profile);
  const photoURL = getPhotoURL(profile);

  if (photoURL) {
    return (
      <Image
        source={{ uri: photoURL }}
        style={[
          s.avatar,
          {
            width: size,
            height: size,
            borderRadius: Math.round(size / 3.25),
          },
        ]}
        resizeMode="cover"
      />
    );
  }

  return (
    <View
      style={[
        s.avatarFallback,
        {
          width: size,
          height: size,
          borderRadius: Math.round(size / 3.25),
        },
      ]}
    >
      <Text style={s.avatarInitials}>{getInitials(displayName)}</Text>
    </View>
  );
}

export default function UserCardScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { user } = useAuth();

  const routeMember = getParamMember(route.params || {});
  const memberUid = getParamMemberUid(route.params || {});

  const [memberProfile, setMemberProfile] = useState(
    routeMember ? normalizePublicProfile(routeMember, memberUid) : null
  );
  const [relationship, setRelationship] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [sharedOutgoing, setSharedOutgoing] = useState([]);

  const [loading, setLoading] = useState(true);
  const [requestingParty, setRequestingParty] = useState(false);

  const [safetyVisible, setSafetyVisible] = useState(false);
  const [reportMessage, setReportMessage] = useState("");
  const [safetyBusy, setSafetyBusy] = useState(false);

  const relationshipStatus = String(relationship?.status || "unknown").toLowerCase();
  const hasKnownRelationship = relationshipStatus !== "unknown" && !!relationship?.status;
  const canRequest =
    !!user?.uid &&
    !!memberUid &&
    user.uid !== memberUid &&
    !["active", "approved", "requested", "pending"].includes(relationshipStatus);

  const isRequested = relationshipStatus === "requested";
  const isPending = relationshipStatus === "pending";
  const isActive = relationshipStatus === "active" || relationshipStatus === "approved";

  const sharedBetweenUsers = useMemo(() => {
    const incoming = (Array.isArray(notifications) ? notifications : [])
      .filter((item) => SHARED_NOTIFICATION_TYPES.has(item?.type))
      .filter((item) => itemMatchesMember(item, memberUid))
      .map((item) => ({
        ...item,
        id: item.id,
        shareId: item.shareId || item.relatedId || item.id,
        direction: "shared_with_me",
        source: "notification",
      }));

    const outgoing = (Array.isArray(sharedOutgoing) ? sharedOutgoing : [])
      .filter((item) => itemMatchesMember(item, memberUid))
      .map((item) => ({
        ...item,
        direction: "shared_by_me",
        source: "sharedItems",
      }));

    return [...incoming, ...outgoing].sort((a, b) => {
      const aTime = Number(a.createdAt || a.sharedAt || a.updatedAt || 0);
      const bTime = Number(b.createdAt || b.sharedAt || b.updatedAt || 0);
      return bTime - aTime;
    });
  }, [notifications, sharedOutgoing, memberUid]);

  const requestNotifications = useMemo(() => {
    return (Array.isArray(notifications) ? notifications : []).filter((item) => {
      if (item?.type !== "hunting_party_request") return false;
      return itemMatchesMember(item, memberUid);
    });
  }, [notifications, memberUid]);

  useEffect(() => {
    let mounted = true;

    async function loadData() {
      if (!user?.uid || !memberUid) {
        setLoading(false);
        return;
      }

      setLoading(true);

      try {
        let publicProfile = routeMember
          ? normalizePublicProfile(routeMember, memberUid)
          : null;

        if (isFirebaseConfigValid) {
          try {
            const publicSnap = await getDoc(doc(db, "users_public", memberUid));
            if (publicSnap.exists()) {
              publicProfile = normalizePublicProfile(publicSnap.data(), memberUid);
            }
          } catch (err) {
            console.log("DuckSmart user public profile load error:", err?.message || err);
          }

          try {
            const relationshipSnap = await getDoc(
              doc(db, "users", user.uid, "huntingParty", memberUid)
            );

            if (relationshipSnap.exists()) {
              setRelationship({
                uid: memberUid,
                memberUid,
                ...relationshipSnap.data(),
              });
            } else {
              setRelationship(null);
            }
          } catch (err) {
            console.log("DuckSmart relationship load error:", err?.message || err);
            setRelationship(null);
          }
        }

        const [loadedNotifications, loadedSharedOutgoing] = await Promise.all([
          loadAllInAppNotifications(user.uid),
          loadLogsSharedByMe(user.uid),
        ]);

        if (!mounted) return;

        setMemberProfile(publicProfile || normalizePublicProfile(routeMember || {}, memberUid));
        setNotifications(Array.isArray(loadedNotifications) ? loadedNotifications : []);
        setSharedOutgoing(Array.isArray(loadedSharedOutgoing) ? loadedSharedOutgoing : []);
      } catch (err) {
        console.log("DuckSmart user card load error:", err?.message || err);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadData();

    return () => {
      mounted = false;
    };
  }, [user?.uid, memberUid]);

  async function refreshSharedData() {
    if (!user?.uid) return;

    const [loadedNotifications, loadedSharedOutgoing] = await Promise.all([
      loadAllInAppNotifications(user.uid),
      loadLogsSharedByMe(user.uid),
    ]);

    setNotifications(Array.isArray(loadedNotifications) ? loadedNotifications : []);
    setSharedOutgoing(Array.isArray(loadedSharedOutgoing) ? loadedSharedOutgoing : []);
  }

  async function handleRequestHuntingParty() {
    if (!user?.uid || !memberProfile?.uid || requestingParty) return;

    setRequestingParty(true);

    try {
      await sendHuntingPartyRequest(user.uid, memberProfile);

      const now = Date.now();

      setRelationship({
        uid: memberProfile.uid,
        memberUid: memberProfile.uid,
        ownerUid: user.uid,
        status: "requested",
        requestedAt: now,
        requestedByUid: user.uid,
      });

      Alert.alert(
        "Request Sent",
        `${getDisplayName(memberProfile)} will need to approve your Hunting Party request.`
      );
    } catch (err) {
      console.log("DuckSmart request hunting party error:", err?.message || err);
      Alert.alert("Request Failed", err?.message || "Could not send this request.");
    } finally {
      setRequestingParty(false);
    }
  }

  async function handleSharedPress(item) {
    if (!user?.uid || !item) return;

    if (item.direction === "shared_with_me" && item.status === "unread" && item.id) {
      try {
        await markInAppNotificationRead(user.uid, item.id);
        await refreshSharedData();
      } catch {
        // Do not block opening the shared item.
      }
    }

    navigation.navigate("ShareScreen", {
      mode: "view_shared",
      readOnly: true,
      shareType: getShareTypeForShareScreen(item),
      item,
      sharedNotification: item.source === "notification" ? item : null,
      shareId: item.shareId || item.relatedId || item.id,
      member: memberProfile,
      memberUid,
      direction: item.direction,
    });
  }

  async function handleSubmitReport() {
    if (!user?.uid || !memberProfile?.uid || safetyBusy) return;

    const message = cleanString(reportMessage);

    if (!message) {
      Alert.alert("Report Message", "Please enter a short message for admin.");
      return;
    }

    setSafetyBusy(true);

    try {
      await submitUserReport({
        reporterUid: user.uid,
        reporterEmail: user.email || "",
        category: "User Report",
        reportedUid: memberProfile.uid,
        reportedUserText:
          `${getDisplayName(memberProfile)} ${getDuckId(memberProfile) ? `@${getDuckId(memberProfile)}` : ""}`.trim(),
        message,
        source: "UserCardScreen",
      });

      setReportMessage("");
      setSafetyVisible(false);

      Alert.alert("Report Sent", "DuckSmart admin will review this report.");
    } catch (err) {
      Alert.alert("Report Failed", err?.message || "Could not submit this report.");
    } finally {
      setSafetyBusy(false);
    }
  }

  function confirmBlockUser() {
    if (!user?.uid || !memberProfile?.uid || safetyBusy) return;

    Alert.alert(
      "Block User?",
      `Block ${getDisplayName(memberProfile)}? This removes them from your Hunting Party if they are currently added.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Block",
          style: "destructive",
          onPress: handleBlockUser,
        },
      ]
    );
  }

  async function handleBlockUser() {
    if (!user?.uid || !memberProfile?.uid || safetyBusy) return;

    setSafetyBusy(true);

    try {
      await blockUser(user.uid, memberProfile, "Blocked from UserCardScreen");

      setSafetyVisible(false);
      setRelationship(null);

      Alert.alert("User Blocked", "This user has been blocked.");
      navigation.goBack();
    } catch (err) {
      Alert.alert("Block Failed", err?.message || "Could not block this user.");
    } finally {
      setSafetyBusy(false);
    }
  }

  const displayName = getDisplayName(memberProfile);
  const duckId = getDuckId(memberProfile);
  const photoURL = getPhotoURL(memberProfile);
  const approved = isActive;
  const incomingCount = sharedBetweenUsers.filter((item) => item.direction === "shared_with_me").length;
  const outgoingCount = sharedBetweenUsers.filter((item) => item.direction === "shared_by_me").length;
  const isSelf = user?.uid && memberUid && user.uid === memberUid;

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" />

      <ScrollView contentContainerStyle={s.container} showsVerticalScrollIndicator={false}>
        <View style={s.headerRow}>
          <Pressable style={s.backBtn} onPress={() => navigation.goBack()}>
            <Text style={s.backBtnText}>‹</Text>
          </Pressable>

          <View style={{ flex: 1 }}>
            <Text style={s.headerKicker}>DUCKSMART</Text>
            <Text style={s.headerTitle}>USER CARD</Text>
          </View>
        </View>

        {!memberUid ? (
          <View style={s.section}>
            <SectionHeader
              eyebrow="MISSING USER"
              title="No User Selected"
              subtitle="Go back to Groups / Shared Logs and tap a DuckSmart user again."
            />
          </View>
        ) : loading ? (
          <View style={s.loadingCard}>
            <ActivityIndicator color={GOLD} />
            <Text style={s.loadingText}>Loading user card...</Text>
          </View>
        ) : (
          <>
            <View style={s.profileCard}>
              {photoURL ? (
                <Image source={{ uri: photoURL }} style={s.avatar} resizeMode="cover" />
              ) : (
                <View style={s.avatarFallback}>
                  <Text style={s.avatarInitials}>{getInitials(displayName)}</Text>
                </View>
              )}

              <Text style={s.profileName} numberOfLines={1}>
                {displayName}
              </Text>

              <Text style={s.profileDuckId} numberOfLines={1}>
                {duckId ? `@${duckId}` : "DuckSmart User"}
              </Text>

              {hasKnownRelationship ? (
                <View style={s.profileStatusRow}>
                  <StatusPill status={relationshipStatus} />
                </View>
              ) : null}

              {!isSelf && canRequest ? (
                <Pressable
                  style={[s.requestPartyBtn, requestingParty ? s.disabledBtn : null]}
                  onPress={handleRequestHuntingParty}
                  disabled={requestingParty}
                >
                  <Text style={s.requestPartyBtnText}>
                    {requestingParty ? "Sending Request..." : "Request Hunting Party"}
                  </Text>
                </Pressable>
              ) : null}

              {!isSelf && isRequested ? (
                <View style={s.infoPill}>
                  <Text style={s.infoPillText}>Hunting Party request pending</Text>
                </View>
              ) : null}

              {!isSelf && isPending ? (
                <View style={s.infoPill}>
                  <Text style={s.infoPillText}>This user requested you — approve from Groups</Text>
                </View>
              ) : null}
            </View>

            {hasKnownRelationship ? (
              <View style={s.section}>
                <SectionHeader
                  eyebrow="RELATIONSHIP"
                  title="Hunting Party Status"
                  subtitle="This shows the current request or approval status between you and this user."
                />

                <View style={s.statusGrid}>
                  <View style={s.statusBox}>
                    <Text style={s.statusBoxLabel}>Current Status</Text>
                    <Text style={[s.statusBoxValue, approved ? { color: GREEN } : { color: GOLD }]}>
                      {String(relationshipStatus).toUpperCase()}
                    </Text>
                  </View>

                  <View style={s.statusBox}>
                    <Text style={s.statusBoxLabel}>Requested</Text>
                    <Text style={s.statusBoxValue}>
                      {formatDate(relationship?.requestedAt) || "--"}
                    </Text>
                  </View>

                  <View style={s.statusBox}>
                    <Text style={s.statusBoxLabel}>Approved</Text>
                    <Text style={s.statusBoxValue}>
                      {formatDate(relationship?.approvedAt) || "--"}
                    </Text>
                  </View>
                </View>

                {requestNotifications.length > 0 ? (
                  <View style={s.requestNote}>
                    <Text style={s.requestNoteTitle}>Request Notifications</Text>
                    <Text style={s.requestNoteText}>
                      {requestNotifications.length} Hunting Party request notification
                      {requestNotifications.length === 1 ? "" : "s"} found between you and this user.
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            <View style={s.section}>
              <SectionHeader
                eyebrow="SHARED BETWEEN YOU"
                title="Shared Hunts / Pins / Logs"
                subtitle="Only items shared between you and this DuckSmart user are shown here."
              />

              <View style={s.sharedCounterRow}>
                <View style={s.sharedCounterPill}>
                  <Text style={s.sharedCounterValue}>{incomingCount}</Text>
                  <Text style={s.sharedCounterLabel}>From Them</Text>
                </View>

                <View style={s.sharedCounterPill}>
                  <Text style={s.sharedCounterValue}>{outgoingCount}</Text>
                  <Text style={s.sharedCounterLabel}>From You</Text>
                </View>
              </View>

              {sharedBetweenUsers.length > 0 ? (
                <View style={s.sharedList}>
                  {sharedBetweenUsers.map((item) => {
                    const key = `${item.direction}-${item.id || item.shareId || item.relatedId}`;

                    return (
                      <SharedRow
                        key={key}
                        item={item}
                        onPress={handleSharedPress}
                      />
                    );
                  })}
                </View>
              ) : (
                <View style={s.emptyCard}>
                  <Text style={s.emptyTitle}>Nothing Shared Yet</Text>
                  <Text style={s.emptyText}>
                    Shared hunts, pins, logs, decoy spreads, and scouting logs between you and this user will appear here.
                  </Text>
                </View>
              )}
            </View>

            {!isSelf ? (
              <Pressable style={s.reportBlockTextBtn} onPress={() => setSafetyVisible(true)}>
                <Text style={s.reportBlockText}>Report/ Block User</Text>
              </Pressable>
            ) : null}
          </>
        )}

        <View style={{ height: 28 }} />
      </ScrollView>

      <Modal
        visible={safetyVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSafetyVisible(false)}
      >
        <View style={s.modalBackdrop}>
          <View style={s.safetyCard}>
            <View style={s.safetyHeader}>
              <View style={{ flex: 1 }}>
                <Text style={s.safetyKicker}>SAFETY</Text>
                <Text style={s.safetyTitle}>Report / Block User</Text>
              </View>

              <Pressable
                style={s.closeModalBtn}
                onPress={() => setSafetyVisible(false)}
              >
                <Text style={s.closeModalText}>✕</Text>
              </Pressable>
            </View>

            <View style={s.safetyUserRow}>
              <UserAvatar profile={memberProfile} size={44} />

              <View style={{ flex: 1 }}>
                <Text style={s.safetyUserName} numberOfLines={1}>
                  {displayName}
                </Text>
                <Text style={s.safetyUserHandle} numberOfLines={1}>
                  {duckId ? `@${duckId}` : "DuckSmart User"}
                </Text>
              </View>
            </View>

            <Text style={s.reportLabel}>Report message</Text>

            <TextInput
              value={reportMessage}
              onChangeText={setReportMessage}
              placeholder="Tell admin what happened..."
              placeholderTextColor="rgba(255,255,255,0.34)"
              multiline
              style={s.reportInput}
            />

            <Pressable
              style={[s.reportSubmitBtn, safetyBusy ? s.disabledBtn : null]}
              onPress={handleSubmitReport}
              disabled={safetyBusy}
            >
              <Text style={s.reportSubmitText}>
                {safetyBusy ? "Submitting..." : "Submit Report"}
              </Text>
            </Pressable>

            <Pressable
              style={[s.blockSubmitBtn, safetyBusy ? s.disabledBtn : null]}
              onPress={confirmBlockUser}
              disabled={safetyBusy}
            >
              <Text style={s.blockSubmitText}>Block User</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
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
    fontSize: 25,
    fontWeight: "900",
    letterSpacing: 0.3,
    marginTop: 1,
  },

  loadingCard: {
    minHeight: 160,
    borderRadius: 18,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    color: MUTED,
    fontSize: 13,
    fontWeight: "800",
    marginTop: 10,
  },

  section: {
    marginBottom: 10,
    padding: 12,
    borderRadius: 20,
    backgroundColor: SECTION_BG,
    borderWidth: 1,
    borderColor: "rgba(217,168,76,0.16)",
  },
  sectionHeaderBlock: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingBottom: 10,
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.07)",
  },
  sectionRight: {
    paddingTop: 2,
  },
  sectionEyebrow: {
    color: GOLD,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.1,
    marginBottom: 3,
  },
  sectionTitle: {
    color: COLORS.white,
    fontSize: 18,
    fontWeight: "900",
  },
  sectionSub: {
    color: MUTED,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
    marginTop: 5,
  },

  profileCard: {
    borderRadius: 24,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: GOLD_BORDER,
    padding: 18,
    alignItems: "center",
    marginBottom: 10,
  },
  avatar: {
    backgroundColor: BG,
    marginBottom: 14,
  },
  avatarFallback: {
    backgroundColor: "rgba(217,168,76,0.14)",
    borderWidth: 1,
    borderColor: GOLD_BORDER,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  avatarInitials: {
    color: GOLD,
    fontSize: 38,
    fontWeight: "900",
  },
  profileName: {
    color: COLORS.white,
    fontSize: 23,
    fontWeight: "900",
  },
  profileDuckId: {
    color: GOLD,
    fontSize: 16,
    fontWeight: "900",
    marginTop: 5,
  },
  profileStatusRow: {
    marginTop: 12,
  },

  requestPartyBtn: {
    marginTop: 14,
    width: "100%",
    paddingVertical: 13,
    borderRadius: 15,
    backgroundColor: "rgba(77,163,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(77,163,255,0.52)",
    alignItems: "center",
  },
  requestPartyBtnText: {
    color: BLUE,
    fontSize: 14,
    fontWeight: "900",
  },
  infoPill: {
    marginTop: 12,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "rgba(217,168,76,0.10)",
    borderWidth: 1,
    borderColor: GOLD_BORDER,
  },
  infoPillText: {
    color: GOLD,
    fontSize: 12,
    fontWeight: "900",
    textAlign: "center",
  },

  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
  },
  statusText: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  statusApproved: {
    backgroundColor: "rgba(57,217,106,0.10)",
    borderColor: "rgba(57,217,106,0.50)",
  },
  statusPending: {
    backgroundColor: "rgba(217,168,76,0.10)",
    borderColor: GOLD_BORDER,
  },
  statusRequested: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderColor: BORDER,
  },
  statusNeutral: {
    backgroundColor: CARD_SOFT,
    borderColor: BORDER,
  },
  statusTextApproved: {
    color: GREEN,
  },
  statusTextPending: {
    color: GOLD,
  },
  statusTextRequested: {
    color: MUTED,
  },
  statusTextNeutral: {
    color: MUTED,
  },

  statusGrid: {
    gap: 8,
  },
  statusBox: {
    borderRadius: 15,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "rgba(255,255,255,0.035)",
    padding: 11,
  },
  statusBoxLabel: {
    color: MUTED_DARK,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
  statusBoxValue: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: "900",
    marginTop: 4,
  },

  requestNote: {
    marginTop: 10,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: GOLD_BORDER,
    backgroundColor: "rgba(217,168,76,0.07)",
    padding: 11,
  },
  requestNoteTitle: {
    color: GOLD,
    fontSize: 13,
    fontWeight: "900",
  },
  requestNoteText: {
    color: MUTED,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
    marginTop: 4,
  },

  sharedCounterRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
  },
  sharedCounterPill: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "rgba(255,255,255,0.035)",
    paddingVertical: 10,
    alignItems: "center",
  },
  sharedCounterValue: {
    color: GOLD,
    fontSize: 18,
    fontWeight: "900",
  },
  sharedCounterLabel: {
    color: MUTED,
    fontSize: 11,
    fontWeight: "800",
    marginTop: 2,
  },

  sharedList: {
    gap: 8,
  },
  sharedRow: {
    minHeight: 76,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    marginBottom: 8,
  },
  sharedIncoming: {
    borderColor: "rgba(77,163,255,0.30)",
    backgroundColor: "rgba(77,163,255,0.055)",
  },
  sharedOutgoing: {
    borderColor: "rgba(217,168,76,0.25)",
    backgroundColor: "rgba(217,168,76,0.045)",
  },
  sharedIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "rgba(217,168,76,0.10)",
    borderWidth: 1,
    borderColor: GOLD_BORDER,
    alignItems: "center",
    justifyContent: "center",
  },
  sharedIcon: {
    fontSize: 19,
  },
  sharedTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  sharedTitle: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: "900",
    flex: 1,
  },
  sharedMeta: {
    color: MUTED,
    fontSize: 11,
    fontWeight: "800",
    marginTop: 4,
    lineHeight: 15,
  },
  sharedChevron: {
    color: GOLD,
    fontSize: 22,
    fontWeight: "900",
  },

  directionPill: {
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderWidth: 1,
  },
  directionPillIncoming: {
    backgroundColor: "rgba(77,163,255,0.12)",
    borderColor: "rgba(77,163,255,0.42)",
  },
  directionPillOutgoing: {
    backgroundColor: "rgba(217,168,76,0.12)",
    borderColor: GOLD_BORDER,
  },
  directionPillText: {
    color: GOLD,
    fontSize: 9,
    fontWeight: "900",
  },
  directionPillTextIncoming: {
    color: BLUE,
  },

  disabledBtn: {
    opacity: 0.55,
  },

  reportBlockTextBtn: {
    alignSelf: "center",
    paddingVertical: 13,
    paddingHorizontal: 18,
    marginTop: 2,
    marginBottom: 8,
  },
  reportBlockText: {
    color: RED,
    fontSize: 14,
    fontWeight: "900",
    textAlign: "center",
    textDecorationLine: "none",
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

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.78)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  safetyCard: {
    width: "100%",
    maxWidth: 430,
    borderRadius: 22,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: "rgba(255,77,77,0.34)",
    padding: 14,
  },
  safetyHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 12,
  },
  safetyKicker: {
    color: RED,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
  safetyTitle: {
    color: COLORS.white,
    fontSize: 20,
    fontWeight: "900",
    marginTop: 3,
  },
  closeModalBtn: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: CARD_SOFT,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: "center",
    justifyContent: "center",
  },
  closeModalText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: "900",
  },
  safetyUserRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "rgba(255,255,255,0.035)",
    padding: 10,
    marginBottom: 10,
  },
  safetyUserName: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: "900",
  },
  safetyUserHandle: {
    color: MUTED,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 3,
  },
  reportLabel: {
    color: MUTED,
    fontSize: 11,
    fontWeight: "900",
    marginBottom: 7,
  },
  reportInput: {
    minHeight: 100,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "rgba(255,255,255,0.04)",
    color: COLORS.white,
    fontSize: 13,
    fontWeight: "800",
    padding: 11,
    textAlignVertical: "top",
  },
  reportSubmitBtn: {
    marginTop: 10,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: GOLD,
    alignItems: "center",
  },
  reportSubmitText: {
    color: BG,
    fontSize: 13,
    fontWeight: "900",
  },
  blockSubmitBtn: {
    marginTop: 8,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: "rgba(255,77,77,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,77,77,0.34)",
    alignItems: "center",
  },
  blockSubmitText: {
    color: RED,
    fontSize: 13,
    fontWeight: "900",
  },
});