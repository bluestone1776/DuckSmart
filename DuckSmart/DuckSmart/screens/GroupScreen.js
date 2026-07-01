// DuckSmart — Groups / Shared Logs Screen
//
// Shows:
// - Compact user DuckSmart ID card
// - Unread-only notification alert center
// - Hunting Party users / pending requests
// - Find DuckSmart Users search section
// - All Shared Logs: outgoing shared items + incoming shared notifications
// - Reports & Blocked Users at bottom
//
// Tapping an approved Hunting Party member opens UserCardScreen.
// Tapping a searched user opens UserCardScreen.
// Tapping a shared notification opens ShareScreen in view mode.

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
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";

import { COLORS } from "../constants/theme";
import { useAuth } from "../context/AuthContext";
import {
  createOrUpdateUserProfile,
  loadUserProfile,
} from "../services/profile";
import {
  searchUsersForHuntingParty,
  loadHuntingParty,
  loadIncomingHuntingPartyRequests,
  approveHuntingPartyRequest,
  declineHuntingPartyRequest,
  removeUserFromHuntingParty,
  loadLogsSharedByMe,
} from "../services/user_search";
import {
  loadAllInAppNotifications,
  markInAppNotificationRead,
} from "../services/in_app_notifications";
import { getSharedItem } from "../services/shareImport";

const GOLD = "#D9A84C";
const RED = "#FF4D4D";
const GREEN = "#39D96A";
const BLUE = "#4DA3FF";
const BG = "#05090A";
const CARD = "rgba(13,18,19,0.96)";
const CARD_SOFT = "rgba(255,255,255,0.045)";
const SECTION_BG = "rgba(5,10,11,0.96)";
const BORDER = "rgba(255,255,255,0.08)";
const GOLD_BORDER = "rgba(217,168,76,0.34)";
const BLUE_BORDER = "rgba(77,163,255,0.36)";
const MUTED = "rgba(255,255,255,0.62)";
const MUTED_DARK = "rgba(255,255,255,0.42)";

const SHARED_NOTIFICATION_TYPES = new Set([
  "shared_hunt_log",
  "shared_pin",
  "shared_decoy_spread",
  "shared_scouting_log",
]);

function getDisplayName(profile, user) {
  return (
    profile?.displayName ||
    user?.displayName ||
    user?.email?.split("@")?.[0] ||
    "DuckSmart User"
  );
}

function getDuckId(profile) {
  return profile?.duckIdLower || profile?.duckId || "";
}

function getPhotoURL(profile, user) {
  return profile?.photoURL || user?.photoURL || null;
}

function getInitials(value) {
  const str = String(value || "D").trim();
  const parts = str.split(/\s+/).filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }

  return String(parts[0]?.[0] || "D").toUpperCase();
}

function getStatusLabel(item) {
  const status = String(item?.status || "approved").toLowerCase();

  if (status === "pending") return "PENDING";
  if (status === "requested") return "REQUESTED";
  if (status === "approved" || status === "active") return "APPROVED";

  return status.toUpperCase();
}

function getNotificationIcon(type) {
  switch (type) {
    case "hunting_party_request":
      return "👥";
    case "shared_pin":
      return "📍";
    case "shared_hunt_log":
      return "▤";
    case "shared_decoy_spread":
      return "🦆";
    case "shared_scouting_log":
      return "🔎";
    default:
      return "🔔";
  }
}

function getShareTypeFromNotificationType(type) {
  switch (type) {
    case "shared_pin":
      return "pin";
    case "shared_hunt_log":
      return "hunt_log";
    case "shared_decoy_spread":
      return "decoy_spread";
    case "shared_scouting_log":
      return "scouting_log";
    default:
      return "shared_item";
  }
}

function getShareTypeFromCloudItemType(type) {
  const normalized = String(type || "").toLowerCase();

  if (normalized === "huntlog" || normalized === "hunt_log" || normalized === "hunt") {
    return "hunt_log";
  }

  if (normalized === "pin" || normalized === "map_pin" || normalized === "mappin") {
    return "pin";
  }

  if (normalized === "scouting_log" || normalized === "scout_log" || normalized === "scout") {
    return "scouting_log";
  }

  if (normalized === "decoy_spread" || normalized === "decoyspread" || normalized === "decoy") {
    return "decoy_spread";
  }

  return "shared_item";
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

function getSharedItemTitle(item) {
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

function getSharedItemTypeLabel(item) {
  const type = String(item?.type || item?.itemType || "").toLowerCase();

  if (type === "shared_pin" || type === "pin" || type === "mappin" || type === "map_pin") {
    return "Map Pin";
  }

  if (
    type === "shared_hunt_log" ||
    type === "huntlog" ||
    type === "hunt_log" ||
    type === "hunt"
  ) {
    return "Hunt Log";
  }

  if (
    type === "shared_decoy_spread" ||
    type === "decoy" ||
    type === "decoyspread" ||
    type === "decoy_spread"
  ) {
    return "Decoy Spread";
  }

  if (
    type === "shared_scouting_log" ||
    type === "scouting" ||
    type === "scouting_log"
  ) {
    return "Scouting Log";
  }

  return "Shared Log";
}

function getSharedIcon(item) {
  const label = getSharedItemTypeLabel(item);

  if (label === "Map Pin") return "📍";
  if (label === "Decoy Spread") return "🦆";
  if (label === "Scouting Log") return "🔎";
  return "▤";
}

function getNotificationMember(item = {}) {
  const uid =
    item.senderUid ||
    item.requesterUid ||
    item.memberUid ||
    item.relatedUserUid ||
    item.relatedUid ||
    "";

  return {
    uid,
    memberUid: uid,
    displayName: item.senderName || item.requesterName || item.displayName || "DuckSmart User",
    duckId: item.senderDuckId || item.requesterDuckId || item.duckId || "",
    duckIdLower: item.senderDuckId || item.requesterDuckId || item.duckIdLower || item.duckId || "",
    emailLower: item.senderEmail || item.requesterEmail || item.emailLower || "",
    photoURL: item.senderPhotoURL || item.requesterPhotoURL || item.photoURL || null,
    status: item.type === "hunting_party_request" ? "pending" : "active",
  };
}

async function loadOrCreateProfileWithDuckId(user) {
  let loadedProfile = await loadUserProfile(user.uid);

  const existingDuckId = getDuckId(loadedProfile);

  if (existingDuckId) {
    return loadedProfile;
  }

  const createdProfile = await createOrUpdateUserProfile({
    uid: user.uid,
    email: user.email || "",
    displayName: getDisplayName(loadedProfile, user),
    photoURL: getPhotoURL(loadedProfile, user),
    provider: "group_screen_migration",
  });

  const createdDuckId = getDuckId(createdProfile);

  if (!createdDuckId) {
    throw new Error("Could not assign a DuckSmart ID.");
  }

  return createdProfile;
}

function UserAvatar({ profile, user, size = 48 }) {
  const displayName = getDisplayName(profile, user);
  const photoURL = getPhotoURL(profile, user);

  if (photoURL) {
    return (
      <Image
        source={{ uri: photoURL }}
        style={[
          s.userAvatar,
          {
            width: size,
            height: size,
            borderRadius: Math.round(size / 3),
          },
        ]}
        resizeMode="cover"
      />
    );
  }

  return (
    <View
      style={[
        s.userAvatarFallback,
        {
          width: size,
          height: size,
          borderRadius: Math.round(size / 3),
        },
      ]}
    >
      <Text style={[s.userAvatarInitials, { fontSize: Math.round(size * 0.28) }]}>
        {getInitials(displayName)}
      </Text>
    </View>
  );
}

function SectionHeader({ eyebrow, title, subtitle, right, titleStyle }) {
  return (
    <View style={s.sectionHeaderBlock}>
      <View style={{ flex: 1 }}>
        {eyebrow ? <Text style={s.sectionEyebrow}>{eyebrow}</Text> : null}
        <Text style={[s.sectionTitle, titleStyle]}>{title}</Text>
        {subtitle ? <Text style={s.sectionSub}>{subtitle}</Text> : null}
      </View>

      {right ? <View style={s.sectionRight}>{right}</View> : null}
    </View>
  );
}

function StatusPill({ status }) {
  const label = getStatusLabel({ status });
  const approved = label === "APPROVED";
  const requested = label === "REQUESTED";

  return (
    <View
      style={[
        s.statusFlag,
        approved ? s.statusFlagApproved : null,
        requested ? s.statusFlagRequested : null,
        !approved && !requested ? s.statusFlagPending : null,
      ]}
    >
      <Text
        style={[
          s.statusFlagText,
          approved ? s.statusFlagTextApproved : null,
          requested ? s.statusFlagTextRequested : null,
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

function NotificationRow({ item, onPress }) {
  return (
    <Pressable
      style={[s.notificationRow, s.notificationRowUnread]}
      onPress={() => onPress?.(item)}
    >
      <View style={s.notificationIconWrap}>
        <Text style={s.notificationIcon}>{getNotificationIcon(item?.type)}</Text>
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={s.notificationTitleRow}>
          <Text style={s.notificationTitle} numberOfLines={1}>
            {item?.title || "DuckSmart Notification"}
          </Text>

          <View style={s.unreadDot} />
        </View>

        <Text style={s.notificationMessage} numberOfLines={2}>
          {item?.message || "You have a new DuckSmart update."}
        </Text>

        <Text style={s.notificationMeta} numberOfLines={1}>
          {formatDate(item?.createdAt)} • UNREAD
        </Text>
      </View>

      <Text style={s.notificationChevron}>›</Text>
    </Pressable>
  );
}

function PartyUserRow({
  item,
  currentUser,
  onRemove,
  onOpenUserCard,
  busy,
}) {
  const displayName = getDisplayName(item, currentUser);
  const duckId = getDuckId(item);
  const email = item?.emailLower || item?.email || "";
  const status = item?.status || "approved";

  return (
    <Pressable style={s.partyRow} onPress={() => onOpenUserCard?.(item)}>
      <UserAvatar profile={item} user={currentUser} size={46} />

      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.partyName} numberOfLines={1}>
          {displayName}
        </Text>

        <Text style={s.partyHandle} numberOfLines={1}>
          {duckId ? `@${duckId}` : email || "DuckSmart User"}
        </Text>

        <StatusPill status={status} />
      </View>

      <Pressable
        style={s.viewUserBtn}
        onPress={() => onOpenUserCard?.(item)}
        disabled={busy}
      >
        <Text style={s.viewUserBtnText}>›</Text>
      </Pressable>

      <Pressable
        style={[s.trashBtn, busy ? s.disabledBtn : null]}
        onPress={() => onRemove?.(item)}
        disabled={busy}
      >
        <Text style={s.trashBtnText}>🗑</Text>
      </Pressable>
    </Pressable>
  );
}

function SearchUserRow({
  item,
  currentUser,
  onOpenUserCard,
  busy,
}) {
  const displayName = getDisplayName(item, currentUser);
  const duckId = getDuckId(item);
  const email = item?.emailLower || item?.email || "";

  return (
    <Pressable
      style={[s.searchUserRow, busy ? s.disabledBtn : null]}
      onPress={() => onOpenUserCard?.(item)}
      disabled={busy}
    >
      <UserAvatar profile={item} user={currentUser} size={44} />

      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.partyName} numberOfLines={1}>
          {displayName}
        </Text>

        <Text style={s.partyHandle} numberOfLines={1}>
          {duckId ? `@${duckId}` : email || "DuckSmart User"}
        </Text>

        <Text style={s.searchUserHint}>Tap to view user card</Text>
      </View>

      <Text style={s.searchUserChevron}>›</Text>
    </Pressable>
  );
}

function IncomingRequestRow({
  item,
  currentUser,
  busy,
  onApprove,
  onDecline,
  onOpenUserCard,
}) {
  const displayName = getDisplayName(item, currentUser);
  const duckId = getDuckId(item);
  const requesterUid = item?.uid || item?.requesterUid;

  return (
    <Pressable
      style={s.requestRow}
      onPress={() => onOpenUserCard?.(item)}
      disabled={!requesterUid}
    >
      <UserAvatar profile={item} user={currentUser} size={46} />

      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.partyName} numberOfLines={1}>
          {displayName}
        </Text>

        <Text style={s.partyHandle} numberOfLines={1}>
          {duckId ? `@${duckId}` : "DuckSmart User"}
        </Text>

        <StatusPill status="pending" />
      </View>

      <View style={s.requestButtonStack}>
        <Pressable
          style={[s.approveBtn, busy ? s.disabledBtn : null]}
          onPress={() => onApprove?.(item)}
          disabled={busy || !requesterUid}
        >
          <Text style={s.approveBtnText}>Approve</Text>
        </Pressable>

        <Pressable
          style={[s.declineBtn, busy ? s.disabledBtn : null]}
          onPress={() => onDecline?.(item)}
          disabled={busy || !requesterUid}
        >
          <Text style={s.declineBtnText}>Decline</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

function SharedLogRow({ item, onPress }) {
  const title = getSharedItemTitle(item);
  const typeLabel = getSharedItemTypeLabel(item);
  const date = formatDate(item?.createdAt || item?.sharedAt || item?.updatedAt);
  const direction = item?.direction === "shared_with_me" ? "Shared with you" : "Shared by you";

  const sharedPerson =
    item?.sharedWithDisplayName ||
    item?.sharedWithDuckId ||
    item?.sharedWithEmail ||
    item?.recipientName ||
    item?.recipientDuckId ||
    item?.senderName ||
    item?.senderDuckId ||
    "";

  const isIncoming = item?.direction === "shared_with_me";

  return (
    <Pressable
      style={[s.sharedLogRow, isIncoming ? s.sharedLogIncoming : s.sharedLogOutgoing]}
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
              {isIncoming ? "IN" : "OUT"}
            </Text>
          </View>
        </View>

        <Text style={s.sharedMeta} numberOfLines={2}>
          {typeLabel} • {direction}
          {sharedPerson ? ` • ${sharedPerson}` : ""}
          {date ? ` • ${date}` : ""}
        </Text>
      </View>

      <Text style={s.sharedChevron}>›</Text>
    </Pressable>
  );
}

export default function GroupScreen({ openSettings }) {
  const navigation = useNavigation();
  const { user } = useAuth();

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [setupError, setSetupError] = useState("");

  const [notifications, setNotifications] = useState([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);

  const [searchText, setSearchText] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState([]);

  const [partyLoading, setPartyLoading] = useState(false);
  const [huntingParty, setHuntingParty] = useState([]);
  const [incomingRequests, setIncomingRequests] = useState([]);
  const [busyUserUid, setBusyUserUid] = useState(null);

  const [sharedLoading, setSharedLoading] = useState(false);
  const [sharedItems, setSharedItems] = useState([]);

  const [shareCodeInput, setShareCodeInput] = useState("");
  const [shareCodeLoading, setShareCodeLoading] = useState(false);

  const unreadNotifications = useMemo(() => {
    return (Array.isArray(notifications) ? notifications : []).filter(
      (item) => String(item?.status || "").toLowerCase() === "unread"
    );
  }, [notifications]);

  const allSharedLogs = useMemo(() => {
    const outgoing = (Array.isArray(sharedItems) ? sharedItems : []).map((item) => ({
      ...item,
      direction: "shared_by_me",
      source: "sharedItems",
    }));

    const incoming = (Array.isArray(notifications) ? notifications : [])
      .filter((item) => SHARED_NOTIFICATION_TYPES.has(item?.type))
      .map((item) => ({
        id: item.id,
        shareId: item.shareId || item.relatedId || item.id,
        relatedId: item.relatedId || "",
        type: item.type,
        itemType: item.type,
        title: item.title,
        message: item.message,
        payload: item.payload || null,
        senderUid: item.senderUid || "",
        senderName: item.senderName || "",
        senderDuckId: item.senderDuckId || "",
        status: item.status || "unread",
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        direction: "shared_with_me",
        source: "notification",
      }));

    return [...incoming, ...outgoing].sort((a, b) => {
      const aTime = Number(a.createdAt || a.sharedAt || a.updatedAt || 0);
      const bTime = Number(b.createdAt || b.sharedAt || b.updatedAt || 0);
      return bTime - aTime;
    });
  }, [sharedItems, notifications]);

  useEffect(() => {
    let mounted = true;

    async function loadProfile() {
      if (!user?.uid) {
        setLoading(false);
        setSetupError("You must be signed in to view Groups / Shared Logs.");
        return;
      }

      setLoading(true);
      setSetupError("");

      try {
        const loadedProfile = await loadOrCreateProfileWithDuckId(user);

        if (!mounted) return;

        setProfile(loadedProfile || null);
      } catch (err) {
        console.log("DuckSmart group profile load error:", err?.message || err);

        if (mounted) {
          setSetupError(
            err?.message ||
              "Could not load your DuckSmart sharing profile."
          );
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadProfile();

    return () => {
      mounted = false;
    };
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;

    let mounted = true;

    async function loadNotifications() {
      setNotificationsLoading(true);

      try {
        const loaded = await loadAllInAppNotifications(user.uid);

        if (mounted) {
          setNotifications(Array.isArray(loaded) ? loaded : []);
        }
      } catch (err) {
        console.log("DuckSmart notifications load error:", err?.message || err);

        if (mounted) {
          setNotifications([]);
        }
      } finally {
        if (mounted) {
          setNotificationsLoading(false);
        }
      }
    }

    loadNotifications();

    return () => {
      mounted = false;
    };
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;

    let mounted = true;

    async function loadPartyAndRequests() {
      setPartyLoading(true);

      try {
        const [members, requests] = await Promise.all([
          loadHuntingParty(user.uid),
          loadIncomingHuntingPartyRequests(user.uid),
        ]);

        if (mounted) {
          setHuntingParty(Array.isArray(members) ? members : []);
          setIncomingRequests(Array.isArray(requests) ? requests : []);
        }
      } catch (err) {
        console.log("DuckSmart hunting party load error:", err?.message || err);

        if (mounted) {
          setHuntingParty([]);
          setIncomingRequests([]);
        }
      } finally {
        if (mounted) setPartyLoading(false);
      }
    }

    loadPartyAndRequests();

    return () => {
      mounted = false;
    };
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;

    let mounted = true;

    async function loadSharedItems() {
      setSharedLoading(true);

      try {
        const items = await loadLogsSharedByMe(user.uid);

        if (mounted) {
          setSharedItems(Array.isArray(items) ? items : []);
        }
      } catch (err) {
        console.log("DuckSmart shared items load error:", err?.message || err);

        if (mounted) {
          setSharedItems([]);
        }
      } finally {
        if (mounted) setSharedLoading(false);
      }
    }

    loadSharedItems();

    return () => {
      mounted = false;
    };
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;

    const searchQuery = searchText.trim();

    if (searchQuery.length < 2) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }

    let cancelled = false;

    setSearchLoading(true);

    const timer = setTimeout(async () => {
      try {
        const results = await searchUsersForHuntingParty(searchQuery, {
          currentUid: user.uid,
        });

        if (!cancelled) {
          const filtered = (Array.isArray(results) ? results : []).filter((result) => {
            if (!result?.uid) return false;
            if (result.uid === user.uid) return false;
            return true;
          });

          setSearchResults(filtered);
        }
      } catch (err) {
        console.log("DuckSmart user search error:", err?.message || err);

        if (!cancelled) {
          setSearchResults([]);
        }
      } finally {
        if (!cancelled) {
          setSearchLoading(false);
        }
      }
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchText, user?.uid]);

  async function refreshNotifications() {
    if (!user?.uid) return;

    try {
      const loaded = await loadAllInAppNotifications(user.uid);
      setNotifications(Array.isArray(loaded) ? loaded : []);
    } catch {
      setNotifications([]);
    }
  }

  async function refreshPartyAndRequests() {
    if (!user?.uid) return;

    const [members, requests] = await Promise.all([
      loadHuntingParty(user.uid),
      loadIncomingHuntingPartyRequests(user.uid),
    ]);

    setHuntingParty(Array.isArray(members) ? members : []);
    setIncomingRequests(Array.isArray(requests) ? requests : []);
  }

  async function markNotificationViewed(item) {
    if (!user?.uid || !item?.id) return;

    try {
      await markInAppNotificationRead(user.uid, item.id);

      setNotifications((prev) =>
        prev.map((notification) =>
          notification.id === item.id
            ? { ...notification, status: "read", viewedAt: Date.now() }
            : notification
        )
      );
    } catch (err) {
      console.log("DuckSmart mark notification read error:", err?.message || err);
    }
  }

  async function handleNotificationPress(item) {
    if (!user?.uid || !item?.id) return;

    await markNotificationViewed(item);

    if (item.type === "hunting_party_request") {
      const member = getNotificationMember(item);

      if (member.uid) {
        navigation.navigate("UserCardScreen", {
          member,
          memberUid: member.uid,
          sourceNotification: item,
        });
        return;
      }

      Alert.alert(
        "Hunting Party Request",
        "This request is shown in the Hunting Party section. Approve or decline it there."
      );
      return;
    }

    if (SHARED_NOTIFICATION_TYPES.has(item.type)) {
      const member = getNotificationMember(item);

      navigation.navigate("ShareScreen", {
        mode: "view_shared",
        readOnly: true,
        shareType: getShareTypeFromNotificationType(item.type),
        item: item.payload || item,
        sharedNotification: item,
        shareId: item.shareId || item.relatedId || item.id,
        member,
        memberUid: member.uid || item.senderUid || "",
      });
      return;
    }

    Alert.alert(item.title || "DuckSmart Notification", item.message || "");
  }

  async function handleSharedLogPress(item) {
    if (!user?.uid || !item) return;

    if (item.direction === "shared_with_me" && item.status === "unread" && item.id) {
      await markNotificationViewed(item);
    }

    const isIncoming = item.direction === "shared_with_me";
    const member = isIncoming
      ? getNotificationMember(item)
      : {
          uid: item.recipientUid || item.sharedWithUid || item.targetUid || item.memberUid || "",
          memberUid: item.recipientUid || item.sharedWithUid || item.targetUid || item.memberUid || "",
          displayName:
            item.sharedWithDisplayName ||
            item.recipientName ||
            item.displayName ||
            "DuckSmart User",
          duckId: item.sharedWithDuckId || item.recipientDuckId || item.duckId || "",
          duckIdLower: item.sharedWithDuckId || item.recipientDuckId || item.duckIdLower || item.duckId || "",
          emailLower: item.sharedWithEmail || item.recipientEmail || item.emailLower || "",
          photoURL: item.sharedWithPhotoURL || item.recipientPhotoURL || item.photoURL || null,
          status: "active",
        };

    navigation.navigate("ShareScreen", {
      mode: "view_shared",
      readOnly: true,
      shareType: getShareTypeFromNotificationType(item.type || item.itemType),
      item,
      sharedNotification: isIncoming || item.source === "notification" ? item : null,
      shareId: item.shareId || item.relatedId || item.id,
      member,
      memberUid: member.uid || item.senderUid || item.recipientUid || item.sharedWithUid || "",
      direction: item.direction,
    });
  }

  async function handleFindSharedCode() {
    if (!user?.uid || shareCodeLoading) return;

    const code = shareCodeInput.trim().replace(/\s/g, "");

    if (!code) {
      Alert.alert("Share Code Needed", "Enter the DuckSmart Share Code first.");
      return;
    }

    setShareCodeLoading(true);

    try {
      const sharedItem = await getSharedItem(code);
      const shareType = getShareTypeFromCloudItemType(sharedItem?.type);

      navigation.navigate("ShareScreen", {
        mode: "view_shared",
        readOnly: true,
        shareType,
        item: sharedItem.payload || sharedItem,
        sharedNotification: null,
        shareId: sharedItem.id || code,
        source: "share_code",
      });

      setShareCodeInput("");
    } catch (err) {
      Alert.alert(
        "Shared Log Not Found",
        err?.message || "Could not find a shared DuckSmart item with that code."
      );
    } finally {
      setShareCodeLoading(false);
    }
  }

  async function handleRetry() {
    if (!user?.uid) return;

    setLoading(true);
    setSetupError("");

    try {
      const loadedProfile = await loadOrCreateProfileWithDuckId(user);
      setProfile(loadedProfile || null);
    } catch (err) {
      setSetupError(
        err?.message || "Could not load your DuckSmart sharing profile."
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleApproveRequest(requestProfile) {
    const requesterUid = requestProfile?.uid || requestProfile?.requesterUid;

    if (!user?.uid || !requesterUid || busyUserUid) return;

    setBusyUserUid(requesterUid);

    try {
      await approveHuntingPartyRequest(user.uid, requestProfile);
      await Promise.all([
        refreshPartyAndRequests(),
        refreshNotifications(),
      ]);
    } catch (err) {
      console.error("DuckSmart approve request error:", err);
      Alert.alert(
        "Could Not Approve Request",
        err?.message || "Please try again."
      );
    } finally {
      setBusyUserUid(null);
    }
  }

  async function handleDeclineRequest(requestProfile) {
    const requesterUid = requestProfile?.uid || requestProfile?.requesterUid;

    if (!user?.uid || !requesterUid || busyUserUid) return;

    setBusyUserUid(requesterUid);

    try {
      await declineHuntingPartyRequest(user.uid, requestProfile);
      await Promise.all([
        refreshPartyAndRequests(),
        refreshNotifications(),
      ]);
    } catch (err) {
      console.error("DuckSmart decline request error:", err);
      Alert.alert(
        "Could Not Decline Request",
        err?.message || "Please try again."
      );
    } finally {
      setBusyUserUid(null);
    }
  }

  function confirmRemoveFromParty(targetProfile) {
    const targetUid = targetProfile?.uid || targetProfile?.memberUid;

    if (!user?.uid || !targetUid || busyUserUid) return;

    Alert.alert(
      "Remove From Hunting Party?",
      `Remove ${getDisplayName(targetProfile)} from your Hunting Party?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => handleRemoveFromParty(targetProfile),
        },
      ]
    );
  }

  async function handleRemoveFromParty(targetProfile) {
    const targetUid = targetProfile?.uid || targetProfile?.memberUid;

    if (!user?.uid || !targetUid || busyUserUid) return;

    setBusyUserUid(targetUid);

    try {
      await removeUserFromHuntingParty(user.uid, targetUid);
      await refreshPartyAndRequests();
    } catch (err) {
      console.error("DuckSmart remove hunting party error:", err);
      Alert.alert(
        "Could Not Remove User",
        err?.message || "Please try again."
      );
    } finally {
      setBusyUserUid(null);
    }
  }

  function openUserCard(member) {
    const memberUid = member?.uid || member?.memberUid;

    if (!memberUid) {
      Alert.alert("User Missing", "Could not open this user's profile.");
      return;
    }

    navigation.navigate("UserCardScreen", {
      member,
      memberUid,
    });
  }

  function openBlockedScreen() {
    navigation.navigate("BlockedScreen");
  }

  function handleBackPress() {
    if (typeof openSettings === "function") {
      navigation.navigate("Today");

      setTimeout(() => {
        openSettings();
      }, 150);

      return;
    }

    navigation.goBack();
  }

  const duckId = getDuckId(profile);
  const photoURL = getPhotoURL(profile, user);
  const displayName = getDisplayName(profile, user);
  const unreadCount = unreadNotifications.length;
  const incomingSharedCount = allSharedLogs.filter((item) => item.direction === "shared_with_me").length;
  const outgoingSharedCount = allSharedLogs.filter((item) => item.direction === "shared_by_me").length;

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" />

      <ScrollView contentContainerStyle={s.container} showsVerticalScrollIndicator={false}>
        <View style={s.headerRow}>
          <Pressable style={s.backBtn} onPress={handleBackPress}>
            <Text style={s.backBtnText}>‹</Text>
          </Pressable>

          <View style={{ flex: 1 }}>
            <Text style={s.headerKicker}>DUCKSMART</Text>
            <Text style={s.headerTitle}>GROUPS / SHARED LOGS</Text>
          </View>
        </View>

        {loading ? (
          <View style={s.loadingCard}>
            <ActivityIndicator color={GOLD} />
            <Text style={s.loadingText}>Loading sharing profile...</Text>
          </View>
        ) : setupError ? (
          <View style={s.section}>
            <SectionHeader
              eyebrow="ACCOUNT"
              title="Profile Issue"
              subtitle={setupError}
            />

            <Pressable style={s.primaryBtn} onPress={handleRetry}>
              <Text style={s.primaryBtnText}>Retry</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={s.userCard}>
              {photoURL ? (
                <Image source={{ uri: photoURL }} style={s.avatar} resizeMode="cover" />
              ) : (
                <View style={s.avatarFallback}>
                  <Text style={s.avatarInitials}>{getInitials(displayName || user?.email)}</Text>
                </View>
              )}

              <View style={s.idWrap}>
                <Text style={s.idLabel}>YOUR DUCKSMART ID</Text>
                <Text style={s.duckIdText} numberOfLines={1}>
                  @{duckId}
                </Text>
              </View>
            </View>

            {unreadCount > 0 ? (
              <View style={s.section}>
                <SectionHeader
                  eyebrow="ALERT CENTER"
                  title="Unread Alerts"
                  subtitle="Tap an alert to open the shared item or user card."
                  right={notificationsLoading ? <ActivityIndicator color={GOLD} size="small" /> : null}
                />

                <View style={s.unreadBadge}>
                  <Text style={s.unreadBadgeText}>{unreadCount} unread</Text>
                </View>

                <View style={s.notificationList}>
                  {unreadNotifications.map((item) => (
                    <NotificationRow
                      key={item.id}
                      item={item}
                      onPress={handleNotificationPress}
                    />
                  ))}
                </View>
              </View>
            ) : null}

            <View style={s.section}>
              <SectionHeader
                eyebrow="YOUR PEOPLE"
                title="Hunting Party"
                titleStyle={{ color: BLUE }}
                subtitle="Pending requests and approved hunting partners live here. Tap a member to view their user card."
                right={partyLoading ? <ActivityIndicator color={GOLD} size="small" /> : null}
              />

              {incomingRequests.length > 0 ? (
                <View style={s.requestList}>
                  <Text style={s.subSectionTitle}>REQUESTS TO APPROVE</Text>

                  {incomingRequests.map((request) => {
                    const requestUid = request.uid || request.requesterUid;

                    return (
                      <IncomingRequestRow
                        key={requestUid}
                        item={request}
                        currentUser={user}
                        busy={busyUserUid === requestUid}
                        onApprove={handleApproveRequest}
                        onDecline={handleDeclineRequest}
                        onOpenUserCard={openUserCard}
                      />
                    );
                  })}
                </View>
              ) : null}

              {huntingParty.length > 0 ? (
                <View style={s.partyList}>
                  {huntingParty.map((member) => {
                    const memberUid = member.uid || member.memberUid;

                    return (
                      <PartyUserRow
                        key={memberUid}
                        item={member}
                        currentUser={user}
                        busy={busyUserUid === memberUid}
                        onRemove={confirmRemoveFromParty}
                        onOpenUserCard={openUserCard}
                      />
                    );
                  })}
                </View>
              ) : (
                <View style={s.emptyCard}>
                  <Text style={s.emptyTitle}>No Hunting Party Yet</Text>
                  <Text style={s.emptyText}>
                    Search below to view DuckSmart users and send requests from their user card.
                  </Text>
                </View>
              )}
            </View>

            <View style={s.section}>
              <SectionHeader
                eyebrow="SEARCH"
                title="Find DuckSmart Users"
                subtitle="Search by name, email, or DuckSmart ID. Tap a user to open their card."
              />

              <View style={s.searchBox}>
                <TextInput
                  value={searchText}
                  onChangeText={setSearchText}
                  placeholder="Search name, email, or DuckSmart ID..."
                  placeholderTextColor="rgba(255,255,255,0.34)"
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={s.searchInput}
                />

                {searchLoading ? (
                  <ActivityIndicator color={GOLD} size="small" />
                ) : searchText ? (
                  <Pressable
                    style={s.clearSearchBtn}
                    onPress={() => {
                      setSearchText("");
                      setSearchResults([]);
                    }}
                  >
                    <Text style={s.clearSearchText}>×</Text>
                  </Pressable>
                ) : null}
              </View>

              {searchText.trim().length >= 2 ? (
                <View style={s.searchResultsBox}>
                  {searchLoading ? (
                    <Text style={s.emptyText}>Searching...</Text>
                  ) : searchResults.length > 0 ? (
                    searchResults.map((item) => (
                      <SearchUserRow
                        key={item.uid}
                        item={item}
                        currentUser={user}
                        busy={busyUserUid === item.uid}
                        onOpenUserCard={openUserCard}
                      />
                    ))
                  ) : (
                    <Text style={s.emptyText}>No available users found.</Text>
                  )}
                </View>
              ) : null}
            </View>

            <View style={s.section}>
              <SectionHeader
                eyebrow="SHARED DATA"
                title="All Shared Logs"
                subtitle="Items shared with you and items you have shared with others."
                right={sharedLoading ? <ActivityIndicator color={GOLD} size="small" /> : null}
              />

              <View style={s.sharedCounterRow}>
                <View style={s.sharedCounterPill}>
                  <Text style={s.sharedCounterValue}>{incomingSharedCount}</Text>
                  <Text style={s.sharedCounterLabel}>Received</Text>
                </View>

                <View style={s.sharedCounterPill}>
                  <Text style={s.sharedCounterValue}>{outgoingSharedCount}</Text>
                  <Text style={s.sharedCounterLabel}>Shared</Text>
                </View>
              </View>

              {allSharedLogs.length > 0 ? (
                <View style={s.sharedList}>
                  {allSharedLogs.map((item) => (
                    <SharedLogRow
                      key={`${item.direction}-${item.id || item.shareId || item.relatedId}`}
                      item={item}
                      onPress={handleSharedLogPress}
                    />
                  ))}
                </View>
              ) : (
                <View style={s.emptyCard}>
                  <Text style={s.emptyTitle}>No Shared Logs Yet</Text>
                  <Text style={s.emptyText}>
                    Hunt logs, pins, scouting logs, and decoy spreads shared with you or by you will appear here.
                  </Text>
                </View>
              )}
            </View>

            <View style={s.section}>
              <SectionHeader
                eyebrow="SHARE CODE"
                title="Find Shared Logs With Code"
                subtitle="Enter the DuckSmart Share Code from a text message to open and save the shared item."
              />

              <View style={s.shareCodeBox}>
                <TextInput
                  value={shareCodeInput}
                  onChangeText={setShareCodeInput}
                  placeholder="Enter DuckSmart Share Code..."
                  placeholderTextColor="rgba(255,255,255,0.34)"
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={s.shareCodeInput}
                  editable={!shareCodeLoading}
                />

                {shareCodeInput ? (
                  <Pressable
                    style={s.clearShareCodeBtn}
                    onPress={() => setShareCodeInput("")}
                    disabled={shareCodeLoading}
                  >
                    <Text style={s.clearShareCodeText}>×</Text>
                  </Pressable>
                ) : null}
              </View>

              <Pressable
                style={[
                  s.shareCodeBtn,
                  (!shareCodeInput.trim() || shareCodeLoading) ? s.disabledBtn : null,
                ]}
                onPress={handleFindSharedCode}
                disabled={!shareCodeInput.trim() || shareCodeLoading}
              >
                {shareCodeLoading ? (
                  <ActivityIndicator color={BG} size="small" />
                ) : (
                  <Text style={s.shareCodeBtnText}>Open Shared Log</Text>
                )}
              </Pressable>
            </View>

            <Pressable style={s.blockedButton} onPress={openBlockedScreen}>
              <View style={{ flex: 1 }}>
                <Text style={s.blockedButtonKicker}>SAFETY / ADMIN</Text>
                <Text style={s.blockedButtonTitle}>Reports & Blocked Users</Text>
                <Text style={s.blockedButtonSub}>
                  Manage blocked users or contact DuckSmart admin.
                </Text>
              </View>

              <Text style={s.blockedChevron}>›</Text>
            </Pressable>
          </>
        )}

        <View style={{ height: 28 }} />
      </ScrollView>
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
    fontSize: 24,
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
    letterSpacing: 0.1,
  },
  sectionSub: {
    color: MUTED,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
    marginTop: 5,
  },

  userCard: {
    minHeight: 74,
    borderRadius: 18,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: GOLD_BORDER,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  avatar: {
    width: 58,
    height: 58,
    borderRadius: 19,
    backgroundColor: BG,
    marginRight: 10,
  },
  avatarFallback: {
    width: 58,
    height: 58,
    borderRadius: 19,
    backgroundColor: "rgba(217,168,76,0.14)",
    borderWidth: 1,
    borderColor: GOLD_BORDER,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  avatarInitials: {
    color: GOLD,
    fontSize: 20,
    fontWeight: "900",
  },
  idWrap: {
    flex: 1,
    borderRadius: 14,
    backgroundColor: CARD_SOFT,
    borderWidth: 1,
    borderColor: BORDER,
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: "flex-start",
  },
  idLabel: {
    color: MUTED_DARK,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.8,
    marginBottom: 3,
  },
  duckIdText: {
    color: GOLD,
    fontSize: 18,
    fontWeight: "900",
  },

  unreadBadge: {
    alignSelf: "flex-start",
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "rgba(217,168,76,0.12)",
    borderWidth: 1,
    borderColor: GOLD_BORDER,
    marginBottom: 9,
  },
  unreadBadgeText: {
    color: GOLD,
    fontSize: 11,
    fontWeight: "900",
  },
  notificationList: {
    gap: 8,
  },
  notificationRow: {
    minHeight: 78,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "rgba(255,255,255,0.035)",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 10,
    marginBottom: 8,
  },
  notificationRowUnread: {
    borderColor: GOLD_BORDER,
    backgroundColor: "rgba(217,168,76,0.055)",
  },
  notificationIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: "rgba(217,168,76,0.10)",
    borderWidth: 1,
    borderColor: GOLD_BORDER,
    alignItems: "center",
    justifyContent: "center",
  },
  notificationIcon: {
    fontSize: 20,
  },
  notificationTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  notificationTitle: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: "900",
    flex: 1,
  },
  notificationMessage: {
    color: MUTED,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
    marginTop: 3,
  },
  notificationMeta: {
    color: MUTED_DARK,
    fontSize: 10,
    fontWeight: "800",
    marginTop: 4,
  },
  notificationChevron: {
    color: GOLD,
    fontSize: 22,
    fontWeight: "900",
  },
  unreadDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: GOLD,
  },

  searchBox: {
    minHeight: 48,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: GOLD_BORDER,
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    color: COLORS.white,
    fontSize: 14,
    fontWeight: "800",
    paddingVertical: 11,
  },
  clearSearchBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  clearSearchText: {
    color: MUTED,
    fontSize: 22,
    fontWeight: "900",
  },
  searchResultsBox: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "rgba(255,255,255,0.025)",
    padding: 8,
    marginBottom: 2,
  },

  subSectionTitle: {
    color: GOLD,
    fontSize: 12,
    fontWeight: "900",
    marginBottom: 8,
    letterSpacing: 0.6,
  },
  requestList: {
    marginBottom: 8,
  },
  partyList: {
    gap: 8,
    marginTop: 2,
  },
  partyRow: {
    minHeight: 66,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: BLUE_BORDER,
    backgroundColor: "rgba(77,163,255,0.045)",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    marginBottom: 8,
  },
  searchUserRow: {
    minHeight: 64,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "rgba(255,255,255,0.035)",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    marginBottom: 8,
  },
  requestRow: {
    minHeight: 76,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: GOLD_BORDER,
    backgroundColor: "rgba(217,168,76,0.055)",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    marginBottom: 8,
  },
  userAvatar: {
    backgroundColor: BG,
  },
  userAvatarFallback: {
    backgroundColor: "rgba(217,168,76,0.14)",
    borderWidth: 1,
    borderColor: GOLD_BORDER,
    alignItems: "center",
    justifyContent: "center",
  },
  userAvatarInitials: {
    color: GOLD,
    fontWeight: "900",
  },
  partyName: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: "900",
  },
  partyHandle: {
    color: MUTED,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 3,
  },
  searchUserHint: {
    color: BLUE,
    fontSize: 10,
    fontWeight: "900",
    marginTop: 5,
  },
  searchUserChevron: {
    color: BLUE,
    fontSize: 24,
    fontWeight: "900",
  },

  statusFlag: {
    alignSelf: "flex-start",
    marginTop: 6,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
  },
  statusFlagApproved: {
    backgroundColor: "rgba(57,217,106,0.10)",
    borderColor: "rgba(57,217,106,0.50)",
  },
  statusFlagPending: {
    backgroundColor: "rgba(217,168,76,0.10)",
    borderColor: GOLD_BORDER,
  },
  statusFlagRequested: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderColor: BORDER,
  },
  statusFlagText: {
    color: GOLD,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  statusFlagTextApproved: {
    color: GREEN,
  },
  statusFlagTextRequested: {
    color: MUTED,
  },

  viewUserBtn: {
    width: 34,
    height: 38,
    borderRadius: 13,
    backgroundColor: "rgba(77,163,255,0.12)",
    borderWidth: 1,
    borderColor: BLUE_BORDER,
    alignItems: "center",
    justifyContent: "center",
  },
  viewUserBtnText: {
    color: BLUE,
    fontSize: 24,
    fontWeight: "900",
    marginTop: -2,
  },
  trashBtn: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: "rgba(255,77,77,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,77,77,0.28)",
    alignItems: "center",
    justifyContent: "center",
  },
  trashBtnText: {
    fontSize: 16,
  },
  disabledBtn: {
    opacity: 0.55,
  },

  requestButtonStack: {
    gap: 6,
    alignItems: "stretch",
  },
  approveBtn: {
    minWidth: 74,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: "rgba(57,217,106,0.12)",
    borderWidth: 1,
    borderColor: "rgba(57,217,106,0.45)",
    alignItems: "center",
  },
  approveBtnText: {
    color: GREEN,
    fontSize: 11,
    fontWeight: "900",
  },
  declineBtn: {
    minWidth: 74,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: "rgba(255,77,77,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,77,77,0.28)",
    alignItems: "center",
  },
  declineBtnText: {
    color: RED,
    fontSize: 11,
    fontWeight: "900",
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
    marginTop: 2,
  },
  sharedLogRow: {
    minHeight: 74,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    marginBottom: 8,
  },
  sharedLogIncoming: {
    borderColor: "rgba(77,163,255,0.30)",
    backgroundColor: "rgba(77,163,255,0.055)",
  },
  sharedLogOutgoing: {
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

  shareCodeBox: {
    minHeight: 48,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: GOLD_BORDER,
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  shareCodeInput: {
    flex: 1,
    color: COLORS.white,
    fontSize: 14,
    fontWeight: "800",
    paddingVertical: 11,
  },
  clearShareCodeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  clearShareCodeText: {
    color: MUTED,
    fontSize: 22,
    fontWeight: "900",
  },
  shareCodeBtn: {
    minHeight: 46,
    borderRadius: 14,
    backgroundColor: GOLD,
    alignItems: "center",
    justifyContent: "center",
  },
  shareCodeBtnText: {
    color: BG,
    fontSize: 13,
    fontWeight: "900",
  },

  blockedButton: {
    minHeight: 86,
    borderRadius: 18,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: "rgba(255,77,77,0.34)",
    paddingHorizontal: 13,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    marginBottom: 8,
  },
  blockedButtonKicker: {
    color: RED,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
    marginBottom: 3,
  },
  blockedButtonTitle: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: "900",
  },
  blockedButtonSub: {
    color: MUTED,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 4,
    lineHeight: 17,
  },
  blockedChevron: {
    color: RED,
    fontSize: 26,
    fontWeight: "900",
    marginLeft: 10,
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

  primaryBtn: {
    marginTop: 4,
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
});