// screens/PartyScreen.js

import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  ScrollView,
  StatusBar,
  StyleSheet,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Share,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";

import { COLORS } from "../constants/theme";
import { useAuth } from "../context/AuthContext";
import { usePremium } from "../context/PremiumContext";
import {
  cancelPartyInvite,
  createHuntingParty,
  loadPartyDashboard,
  redeemPartyInviteCode,
  removePartyMember,
  sendPartyInvite,
} from "../services/party_helper";

const GOLD = "#D9A84C";
const GREEN = "#39D96A";
const RED = "#FF4D4D";
const BLUE = "#4DA3FF";
const BG = "#05090A";
const CARD = "rgba(13,18,19,0.96)";
const CARD_SOFT = "rgba(255,255,255,0.045)";
const BORDER = "rgba(255,255,255,0.08)";
const GOLD_BORDER = "rgba(217,168,76,0.34)";
const MUTED = "rgba(255,255,255,0.62)";
const MUTED_DARK = "rgba(255,255,255,0.42)";

const DUCKSMART_GROUP_PRODUCT_ID = "ducksmart_group";
const INCLUDED_HUNTERS = 5;

const DEV_FORCE_DUCKSMART_GROUP = __DEV__ && false;

function cleanEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function cleanText(value, maxLength = 120) {
  return String(value || "").trim().slice(0, maxLength);
}

function getDisplayName(item = {}) {
  return (
    item.displayName ||
    item.name ||
    item.email ||
    item.emailLower ||
    "DuckSmart User"
  );
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

function SectionHeader({ eyebrow, title, subtitle, right }) {
  return (
    <View style={s.sectionHeader}>
      <View style={{ flex: 1 }}>
        {eyebrow ? <Text style={s.eyebrow}>{eyebrow}</Text> : null}
        <Text style={s.sectionTitle}>{title}</Text>
        {subtitle ? <Text style={s.sectionSub}>{subtitle}</Text> : null}
      </View>

      {right ? <View style={s.sectionRight}>{right}</View> : null}
    </View>
  );
}

function StatPill({ label, value, tone = "gold" }) {
  return (
    <View
      style={[
        s.statPill,
        tone === "green" ? s.statPillGreen : null,
        tone === "blue" ? s.statPillBlue : null,
        tone === "red" ? s.statPillRed : null,
      ]}
    >
      <Text
        style={[
          s.statValue,
          tone === "green" ? s.greenText : null,
          tone === "blue" ? s.blueText : null,
          tone === "red" ? s.redText : null,
        ]}
      >
        {value}
      </Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

function MemberRow({ item, isOwner, canRemove, busy, onRemove }) {
  const displayName = getDisplayName(item);
  const email = item.emailLower || item.email || "";
  const role = String(item.role || "guide").toUpperCase();

  return (
    <View style={s.memberRow}>
      <View style={s.avatarFallback}>
        <Text style={s.avatarInitials}>{getInitials(displayName || email)}</Text>
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.memberName} numberOfLines={1}>
          {displayName}
        </Text>

        <Text style={s.memberEmail} numberOfLines={1}>
          {email || "No email listed"}
        </Text>

        <View style={s.rolePill}>
          <Text style={s.rolePillText}>{isOwner ? "OWNER" : role}</Text>
        </View>
      </View>

      {canRemove ? (
        <Pressable
          style={[s.smallDangerBtn, busy ? s.disabledBtn : null]}
          onPress={() => onRemove?.(item)}
          disabled={busy}
        >
          <Text style={s.smallDangerBtnText}>Remove</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function InviteRow({ item, busy, onCancel, onShare }) {
  const email = item.emailLower || item.email || "";
  const code = item.code || "";
  const created = formatDate(item.createdAt);

  return (
    <View style={s.inviteRow}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.inviteEmail} numberOfLines={1}>
          {email}
        </Text>

        <Text style={s.inviteMeta} numberOfLines={1}>
          Code: {code || "Pending"}{created ? ` • Created ${created}` : ""}
        </Text>
      </View>

      <View style={s.inviteActions}>
        <Pressable
          style={[s.smallActionBtn, busy ? s.disabledBtn : null]}
          onPress={() => onShare?.(item)}
          disabled={busy || !code}
        >
          <Text style={s.smallActionBtnText}>Text Code</Text>
        </Pressable>

        <Pressable
          style={[s.smallDangerBtn, busy ? s.disabledBtn : null]}
          onPress={() => onCancel?.(item)}
          disabled={busy}
        >
          <Text style={s.smallDangerBtnText}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function PartyScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const premium = usePremium();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState("");

  const [party, setParty] = useState(null);
  const [members, setMembers] = useState([]);
  const [invites, setInvites] = useState([]);
  const [access, setAccess] = useState(null);

  const [partyName, setPartyName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [activationCode, setActivationCode] = useState("");
  const [error, setError] = useState("");

  const purchaseDuckSmartGroup =
    typeof premium.purchaseDuckSmartGroup === "function"
      ? premium.purchaseDuckSmartGroup
      : null;

  const checkSubscription =
    typeof premium.checkSubscription === "function"
      ? premium.checkSubscription
      : null;

  const getDuckSmartGroupPrice =
    typeof premium.getDuckSmartGroupPrice === "function"
      ? premium.getDuckSmartGroupPrice
      : null;

  const partyId = party?.id || access?.partyId || "";
  const isOwner = !!user?.uid && party?.ownerUid === user.uid;

  const activeHunters = useMemo(
    () =>
      (Array.isArray(members) ? members : []).filter((item) => {
        const status = String(item.status || "active").toLowerCase();
        return status === "active";
      }),
    [members]
  );

  const pendingInvites = useMemo(
    () =>
      (Array.isArray(invites) ? invites : []).filter((item) => {
        const status = String(item.status || "pending").toLowerCase();
        return status === "pending";
      }),
    [invites]
  );

  const includedHunters = Number(party?.includedHunters || INCLUDED_HUNTERS);
  const extraHunters = Number(party?.extraHunters || 0);
  const hunterLimit = Number(
    party?.hunterLimit || includedHunters + extraHunters || INCLUDED_HUNTERS
  );
  const claimedSlots = activeHunters.length + pendingInvites.length;
  const openHunterSlots = Math.max(0, hunterLimit - claimedSlots);

  const hasStartedInviting =
    pendingInvites.length > 0 ||
    activeHunters.some((member) => {
      const memberUid = member.uid || member.memberUid;
      return memberUid && memberUid !== party?.ownerUid;
    });

  async function reload({ silent = false } = {}) {
    if (!user?.uid) {
      setLoading(false);
      setError("You must be signed in to use Hunting Party.");
      return;
    }

    if (!silent) setLoading(true);
    setError("");

    try {
      const result = await loadPartyDashboard({
        uid: user.uid,
        email: user.email || "",
      });

      setParty(result?.party || null);
      setMembers(Array.isArray(result?.members) ? result.members : []);
      setInvites(Array.isArray(result?.invites) ? result.invites : []);
      setAccess(result?.access || null);
    } catch (err) {
      console.log("DuckSmart Hunting Party load error:", err?.message || err);
      setError(err?.message || "Could not load Hunting Party.");
      setParty(null);
      setMembers([]);
      setInvites([]);
      setAccess(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    reload();
  }, [user?.uid]);

  async function handleRefresh() {
    setRefreshing(true);
    await reload({ silent: true });
  }

  function handleBack() {
    navigation.goBack();
  }

  async function handleCreateParty() {
    if (!user?.uid || busy) return;

    const safeName = cleanText(partyName, 80);

    if (!safeName) {
      Alert.alert("Party Name Needed", "Enter your lodge, club, or guide team name first.");
      return;
    }

    if (!DEV_FORCE_DUCKSMART_GROUP && !purchaseDuckSmartGroup) {
      Alert.alert(
        "DuckSmart Group Not Ready",
        "DuckSmart Group purchase support still needs to be added to PremiumContext.js."
      );
      return;
    }

    try {
      setBusy(true);

      const purchased = DEV_FORCE_DUCKSMART_GROUP
        ? true
        : await purchaseDuckSmartGroup();

      if (!purchased) {
        setBusy(false);
        return;
      }

      const created = await createHuntingParty({
        uid: user.uid,
        email: user.email || "",
        partyName: safeName,
        productId: DUCKSMART_GROUP_PRODUCT_ID,
      });

      setPartyName("");
      setParty(created?.party || created || null);

      if (checkSubscription) {
        await checkSubscription().catch(() => {});
      }

      await reload({ silent: true });

      Alert.alert(
        "Hunting Party Created",
        "Your Hunting Party is active. You can now create invite codes for hunters."
      );
    } catch (err) {
      console.error("DuckSmart Hunting Party create error:", err);
      Alert.alert(
        "Setup Failed",
        err?.message || "Could not create your Hunting Party."
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateInvite() {
    if (!user?.uid || !partyId || busy) return;

    const email = cleanEmail(inviteEmail);

    if (!email || !email.includes("@")) {
      Alert.alert("Email Needed", "Enter a valid email address.");
      return;
    }

    if (!isOwner) {
      Alert.alert("Owner Only", "Only the Hunting Party owner can create invite codes.");
      return;
    }

    if (openHunterSlots <= 0) {
      Alert.alert(
        "No Hunter Slots Available",
        "This Hunting Party has no open hunter slots available."
      );
      return;
    }

    try {
      setBusy(true);

      await sendPartyInvite({
        partyId,
        email,
        invitedByUid: user.uid,
      });

      setInviteEmail("");
      await reload({ silent: true });

      Alert.alert(
        "Invite Code Created",
        "Text the activation code from Pending Invites to the hunter."
      );
    } catch (err) {
      console.error("DuckSmart Hunting Party invite error:", err);
      Alert.alert(
        "Invite Failed",
        err?.message || "Could not create this invite code."
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleRedeemCode() {
    if (!user?.uid || busy) return;

    const code = cleanText(activationCode, 40).replace(/\s/g, "");

    if (!code) {
      Alert.alert("Activation Code Needed", "Enter your Hunting Party activation code.");
      return;
    }

    try {
      setBusy(true);

      await redeemPartyInviteCode({
        uid: user.uid,
        email: user.email || "",
        code,
      });

      setActivationCode("");
      await reload({ silent: true });

      Alert.alert(
        "Joined Hunting Party",
        "You now have access through this Hunting Party."
      );
    } catch (err) {
      console.error("DuckSmart Hunting Party activation error:", err);
      Alert.alert(
        "Activation Failed",
        err?.message || "Could not redeem this activation code."
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleShareInvite(invite) {
    const code = invite?.code || "";
    const email = invite?.emailLower || invite?.email || "";
    const name = party?.partyName || "Hunting Party";

    if (!code) {
      Alert.alert("Code Missing", "This invite does not have an activation code yet.");
      return;
    }

    const message = [
      `You've been invited to join ${name} on DuckSmart.`,
      "",
      "Activation Code:",
      code,
      "",
      "Open DuckSmart > Profile > Hunting Party, then enter this code.",
      email ? `Invite email: ${email}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    try {
      await Share.share({ message });
    } catch (err) {
      Alert.alert("Share Failed", err?.message || "Could not open the share sheet.");
    }
  }

  function confirmRemoveMember(member) {
    const memberUid = member?.uid || member?.memberUid;

    if (!memberUid || !partyId || busy) return;

    Alert.alert(
      "Remove Hunter?",
      `Remove ${getDisplayName(member)} from this Hunting Party?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => handleRemoveMember(member),
        },
      ]
    );
  }

  async function handleRemoveMember(member) {
    const memberUid = member?.uid || member?.memberUid;

    if (!memberUid || !partyId || busy) return;

    try {
      setBusyId(memberUid);
      setBusy(true);

      await removePartyMember({
        partyId,
        memberUid,
        uid: user.uid,
      });

      await reload({ silent: true });
    } catch (err) {
      Alert.alert(
        "Remove Failed",
        err?.message || "Could not remove this hunter."
      );
    } finally {
      setBusyId("");
      setBusy(false);
    }
  }

  function confirmCancelInvite(invite) {
    const inviteId = invite?.id || invite?.inviteId;

    if (!inviteId || !partyId || busy) return;

    Alert.alert(
      "Cancel Invite?",
      `Cancel the invite for ${invite.emailLower || invite.email || "this hunter"}?`,
      [
        { text: "No", style: "cancel" },
        {
          text: "Cancel Invite",
          style: "destructive",
          onPress: () => handleCancelInvite(invite),
        },
      ]
    );
  }

  async function handleCancelInvite(invite) {
    const inviteId = invite?.id || invite?.inviteId;

    if (!inviteId || !partyId || busy) return;

    try {
      setBusyId(inviteId);
      setBusy(true);

      await cancelPartyInvite({
        partyId,
        inviteId,
        uid: user.uid,
      });

      await reload({ silent: true });
    } catch (err) {
      Alert.alert(
        "Cancel Failed",
        err?.message || "Could not cancel this invite."
      );
    } finally {
      setBusyId("");
      setBusy(false);
    }
  }

  function renderInviteBlock() {
    if (!isOwner) return null;

    return (
      <View style={s.section}>
        <SectionHeader
          eyebrow="INVITES"
          title="Create Invite Code"
          subtitle="Enter an email to create an activation code. Then text or share that code with the hunter."
          right={
            openHunterSlots <= 0 ? (
              <View style={s.fullPill}>
                <Text style={s.fullPillText}>FULL</Text>
              </View>
            ) : null
          }
        />

        <TextInput
          value={inviteEmail}
          onChangeText={setInviteEmail}
          placeholder="hunter@example.com"
          placeholderTextColor="rgba(255,255,255,0.30)"
          style={s.input}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          editable={!busy && openHunterSlots > 0}
        />

        <Pressable
          style={[
            s.primaryBtn,
            (!inviteEmail.trim() || busy || openHunterSlots <= 0) ? s.disabledBtn : null,
          ]}
          onPress={handleCreateInvite}
          disabled={!inviteEmail.trim() || busy || openHunterSlots <= 0}
        >
          {busy ? (
            <ActivityIndicator color={BG} size="small" />
          ) : (
            <Text style={s.primaryBtnText}>Create Invite Code</Text>
          )}
        </Pressable>
      </View>
    );
  }

  function renderActiveHuntersBlock() {
    return (
      <View style={s.section}>
        <SectionHeader
          eyebrow="PARTY"
          title="Active Hunters"
          subtitle="These users currently have Hunting Party access."
        />

        {activeHunters.length > 0 ? (
          <View style={s.list}>
            {activeHunters.map((member) => {
              const memberUid = member.uid || member.memberUid;
              const memberIsOwner = memberUid === party?.ownerUid;
              const canRemove = isOwner && !memberIsOwner && memberUid !== user?.uid;

              return (
                <MemberRow
                  key={memberUid || member.emailLower || member.email}
                  item={member}
                  isOwner={memberIsOwner}
                  canRemove={canRemove}
                  busy={busyId === memberUid}
                  onRemove={confirmRemoveMember}
                />
              );
            })}
          </View>
        ) : (
          <View style={s.emptyCard}>
            <Text style={s.emptyTitle}>No active hunters yet.</Text>
            <Text style={s.emptyText}>
              Create invite codes to give hunters access.
            </Text>
          </View>
        )}
      </View>
    );
  }

  function renderPendingInvitesBlock() {
    if (!isOwner) return null;

    return (
      <View style={s.section}>
        <SectionHeader
          eyebrow="PENDING"
          title="Pending Invites"
          subtitle="Text these activation codes to hunters. They enter the code from Hunting Party."
        />

        {pendingInvites.length > 0 ? (
          <View style={s.list}>
            {pendingInvites.map((invite) => {
              const inviteId = invite.id || invite.inviteId;

              return (
                <InviteRow
                  key={inviteId || invite.emailLower || invite.email}
                  item={invite}
                  busy={busyId === inviteId}
                  onCancel={confirmCancelInvite}
                  onShare={handleShareInvite}
                />
              );
            })}
          </View>
        ) : (
          <View style={s.emptyCard}>
            <Text style={s.emptyTitle}>No pending invites.</Text>
            <Text style={s.emptyText}>
              Invite codes you create will appear here until they are accepted.
            </Text>
          </View>
        )}
      </View>
    );
  }

  function renderSharedDataBlock() {
    return (
      <View style={s.section}>
        <SectionHeader
          eyebrow="SHARED DATA"
          title="Party Pins / Logs"
          subtitle="This is the Hunting Party workspace for shared pins and hunt logs. We will wire the Map, Log, and History screens into this after the account structure is stable."
        />

        <View style={s.sharedPreviewGrid}>
          <View style={s.sharedPreviewCard}>
            <Text style={s.sharedPreviewIcon}>📍</Text>
            <Text style={s.sharedPreviewTitle}>Hunting Party Pins</Text>
            <Text style={s.sharedPreviewText}>
              Shared map pins will live under this Hunting Party.
            </Text>
          </View>

          <View style={s.sharedPreviewCard}>
            <Text style={s.sharedPreviewIcon}>▤</Text>
            <Text style={s.sharedPreviewTitle}>Hunting Party Logs</Text>
            <Text style={s.sharedPreviewText}>
              Shared hunt logs will be visible to active hunters.
            </Text>
          </View>
        </View>
      </View>
    );
  }

  function renderRedeemAnotherCodeBlock() {
    if (isOwner) return null;

    return (
      <View style={s.section}>
        <SectionHeader
          eyebrow="INVITED HUNTER"
          title="Have Another Activation Code?"
          subtitle="Use this if another Hunting Party sent you a separate invite."
        />

        <TextInput
          value={activationCode}
          onChangeText={setActivationCode}
          placeholder="Enter activation code..."
          placeholderTextColor="rgba(255,255,255,0.30)"
          style={s.input}
          autoCapitalize="characters"
          autoCorrect={false}
          editable={!busy}
        />

        <Pressable
          style={[
            s.secondaryBtnGold,
            (!activationCode.trim() || busy) ? s.disabledBtn : null,
          ]}
          onPress={handleRedeemCode}
          disabled={!activationCode.trim() || busy}
        >
          <Text style={s.secondaryBtnGoldText}>Redeem Code</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        <ScrollView
          contentContainerStyle={s.container}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          refreshControl={
            <RefreshControl
              tintColor={GOLD}
              refreshing={refreshing}
              onRefresh={handleRefresh}
            />
          }
        >
          <View style={s.headerRow}>
            <Pressable style={s.backBtn} onPress={handleBack}>
              <Text style={s.backBtnText}>‹</Text>
            </Pressable>

            <View style={{ flex: 1 }}>
              <Text style={s.headerKicker}>DUCKSMART</Text>
              <Text style={s.headerTitle}>HUNTING PARTY</Text>
            </View>
          </View>

          {loading ? (
            <View style={s.loadingCard}>
              <ActivityIndicator color={GOLD} />
              <Text style={s.loadingText}>Loading Hunting Party...</Text>
            </View>
          ) : error ? (
            <View style={s.section}>
              <SectionHeader
                eyebrow="ACCOUNT"
                title="Could Not Load"
                subtitle={error}
              />

              <Pressable style={s.primaryBtn} onPress={() => reload()}>
                <Text style={s.primaryBtnText}>Retry</Text>
              </Pressable>
            </View>
          ) : !partyId ? (
            <>
              <View style={s.section}>
                <SectionHeader
                  eyebrow="DUCKSMART GROUP"
                  title="Start Hunting Party"
                  subtitle="Set up a lodge, club, or guide team account with shared hunters, shared map pins, shared hunt logs, and Pro access for added hunters."
                />

                {DEV_FORCE_DUCKSMART_GROUP ? (
                  <View style={s.devBox}>
                    <Text style={s.devBoxText}>
                      DEV MODE: DuckSmart Group purchase bypass is enabled.
                    </Text>
                  </View>
                ) : null}

                <View style={s.planCard}>
                  <Text style={s.planTitle}>DuckSmart Group</Text>

                  <Text style={s.planText}>
                    Includes 5 hunters, Hunting Party pins, Hunting Party hunt logs, and Pro access for added hunters.
                  </Text>

                  <View style={s.benefitsBox}>
                    <Text style={s.benefitText}>• 5 hunters included</Text>
                    <Text style={s.benefitText}>• Shared Hunting Party pins</Text>
                    <Text style={s.benefitText}>• Shared Hunting Party hunt logs</Text>
                  </View>

                  <View style={s.planPriceRow}>
                    <Text style={s.planPrice}>
                      {getDuckSmartGroupPrice ? getDuckSmartGroupPrice() : "$249.99"}
                    </Text>
                  </View>
                </View>

                <Text style={s.label}>Lodge / Team / Party Name</Text>
                <TextInput
                  value={partyName}
                  onChangeText={setPartyName}
                  placeholder="Example: North Marsh Lodge"
                  placeholderTextColor="rgba(255,255,255,0.30)"
                  style={s.input}
                  autoCapitalize="words"
                  editable={!busy}
                />

                <Pressable
                  style={[s.primaryBtn, busy ? s.disabledBtn : null]}
                  onPress={handleCreateParty}
                  disabled={busy}
                >
                  {busy ? (
                    <ActivityIndicator color={BG} size="small" />
                  ) : (
                    <Text style={s.primaryBtnText}>
                      {DEV_FORCE_DUCKSMART_GROUP
                        ? "Create Hunting Party"
                        : "Buy / Create Hunting Party"}
                    </Text>
                  )}
                </Pressable>
              </View>

              <View style={s.section}>
                <SectionHeader
                  eyebrow="INVITED HUNTER"
                  title="Join With Activation Code"
                  subtitle="If a Hunting Party invited you, enter the activation code they texted or shared with you."
                />

                <TextInput
                  value={activationCode}
                  onChangeText={setActivationCode}
                  placeholder="Enter activation code..."
                  placeholderTextColor="rgba(255,255,255,0.30)"
                  style={s.input}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  editable={!busy}
                />

                <Pressable
                  style={[
                    s.secondaryBtnGold,
                    (!activationCode.trim() || busy) ? s.disabledBtn : null,
                  ]}
                  onPress={handleRedeemCode}
                  disabled={!activationCode.trim() || busy}
                >
                  <Text style={s.secondaryBtnGoldText}>Join Hunting Party</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <>
              <View style={s.section}>
                <SectionHeader
                  eyebrow="ACCOUNT"
                  title={party?.partyName || "Hunting Party"}
                  subtitle={
                    isOwner
                      ? "You are the Hunting Party owner. Manage hunter slots, invite codes, and members here."
                      : "You have access through this Hunting Party."
                  }
                />

                <View style={s.statsGrid}>
                  <StatPill label="Hunters" value={`${activeHunters.length}/${hunterLimit}`} tone="gold" />
                  <StatPill label="Open" value={openHunterSlots} tone={openHunterSlots > 0 ? "green" : "red"} />
                  <StatPill label="Extra" value={extraHunters} tone="blue" />
                </View>

                <View style={s.detailBox}>
                  <Text style={s.detailText}>
                    Included hunters: <Text style={s.detailStrong}>{includedHunters}</Text>
                  </Text>
                  <Text style={s.detailText}>
                    Extra hunters: <Text style={s.detailStrong}>{extraHunters}</Text>
                  </Text>
                </View>
              </View>

              {hasStartedInviting ? (
                <>
                  {renderActiveHuntersBlock()}
                  {renderPendingInvitesBlock()}
                  {renderSharedDataBlock()}
                  {renderInviteBlock()}
                </>
              ) : (
                <>
                  {renderInviteBlock()}
                  {renderActiveHuntersBlock()}
                  {renderPendingInvitesBlock()}
                  {renderSharedDataBlock()}
                </>
              )}

              {renderRedeemAnotherCodeBlock()}
            </>
          )}

          <View style={{ height: 34 }} />
        </ScrollView>
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
    paddingBottom: 150,
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
    minHeight: 170,
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

  devBox: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(77,163,255,0.45)",
    backgroundColor: "rgba(77,163,255,0.10)",
    padding: 10,
    marginBottom: 10,
  },
  devBoxText: {
    color: BLUE,
    fontSize: 11,
    fontWeight: "900",
    textAlign: "center",
  },

  section: {
    marginBottom: 9,
    padding: 12,
    borderRadius: 20,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
  },
  sectionHeader: {
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
  eyebrow: {
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

  planCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: GOLD_BORDER,
    backgroundColor: "rgba(217,168,76,0.08)",
    padding: 12,
    marginBottom: 11,
  },
  planTitle: {
    color: GOLD,
    fontSize: 16,
    fontWeight: "900",
  },
  planText: {
    color: MUTED,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
    marginTop: 6,
  },
  benefitsBox: {
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: GOLD_BORDER,
    padding: 10,
    marginTop: 10,
  },
  benefitText: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 19,
  },
  planPriceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 11,
    flexWrap: "wrap",
  },
  planPrice: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: "900",
  },

  label: {
    color: MUTED,
    fontSize: 11,
    fontWeight: "900",
    marginTop: 2,
    marginBottom: 7,
    letterSpacing: 0.4,
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: GOLD_BORDER,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 11,
    color: COLORS.white,
    fontWeight: "800",
    fontSize: 14,
  },

  primaryBtn: {
    marginTop: 11,
    minHeight: 48,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: GOLD,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: {
    color: BG,
    fontWeight: "900",
    fontSize: 14,
  },
  secondaryBtn: {
    marginTop: 9,
    minHeight: 46,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: CARD_SOFT,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryBtnText: {
    color: COLORS.white,
    fontWeight: "900",
    fontSize: 13,
  },
  secondaryBtnGold: {
    marginTop: 9,
    minHeight: 46,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: "rgba(217,168,76,0.12)",
    borderWidth: 1,
    borderColor: GOLD,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryBtnGoldText: {
    color: GOLD,
    fontWeight: "900",
    fontSize: 13,
  },
  disabledBtn: {
    opacity: 0.42,
  },
  extraHunterHint: {
    color: MUTED_DARK,
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center",
    lineHeight: 15,
    marginTop: 8,
  },

  statsGrid: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
  },
  statPill: {
    flex: 1,
    minHeight: 66,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: GOLD_BORDER,
    backgroundColor: "rgba(217,168,76,0.065)",
    alignItems: "center",
    justifyContent: "center",
  },
  statPillGreen: {
    borderColor: "rgba(57,217,106,0.48)",
    backgroundColor: "rgba(57,217,106,0.08)",
  },
  statPillBlue: {
    borderColor: "rgba(77,163,255,0.45)",
    backgroundColor: "rgba(77,163,255,0.08)",
  },
  statPillRed: {
    borderColor: "rgba(255,77,77,0.45)",
    backgroundColor: "rgba(255,77,77,0.08)",
  },
  statValue: {
    color: GOLD,
    fontSize: 20,
    fontWeight: "900",
  },
  statLabel: {
    color: MUTED,
    fontSize: 10,
    fontWeight: "900",
    marginTop: 3,
    textTransform: "uppercase",
  },
  greenText: {
    color: GREEN,
  },
  blueText: {
    color: BLUE,
  },
  redText: {
    color: RED,
  },

  detailBox: {
    borderRadius: 15,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: CARD_SOFT,
    padding: 11,
    gap: 5,
  },
  detailText: {
    color: MUTED,
    fontSize: 12,
    fontWeight: "700",
  },
  detailStrong: {
    color: COLORS.white,
    fontWeight: "900",
  },

  fullPill: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(255,77,77,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,77,77,0.42)",
  },
  fullPillText: {
    color: RED,
    fontSize: 10,
    fontWeight: "900",
  },

  list: {
    gap: 8,
  },
  memberRow: {
    minHeight: 74,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "rgba(255,255,255,0.035)",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 10,
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
    fontSize: 15,
    fontWeight: "900",
  },
  memberName: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: "900",
  },
  memberEmail: {
    color: MUTED,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 3,
  },
  rolePill: {
    alignSelf: "flex-start",
    marginTop: 6,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: GOLD_BORDER,
    backgroundColor: "rgba(217,168,76,0.10)",
  },
  rolePillText: {
    color: GOLD,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.5,
  },

  inviteRow: {
    minHeight: 62,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: GOLD_BORDER,
    backgroundColor: "rgba(217,168,76,0.055)",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 10,
  },
  inviteEmail: {
    color: COLORS.white,
    fontSize: 13,
    fontWeight: "900",
  },
  inviteMeta: {
    color: MUTED,
    fontSize: 11,
    fontWeight: "700",
    marginTop: 4,
  },
  inviteActions: {
    alignItems: "flex-end",
    gap: 6,
  },

  smallActionBtn: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: "rgba(217,168,76,0.10)",
    borderWidth: 1,
    borderColor: GOLD_BORDER,
    alignItems: "center",
  },
  smallActionBtnText: {
    color: GOLD,
    fontSize: 11,
    fontWeight: "900",
  },
  smallDangerBtn: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: "rgba(255,77,77,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,77,77,0.28)",
    alignItems: "center",
  },
  smallDangerBtnText: {
    color: RED,
    fontSize: 11,
    fontWeight: "900",
  },

  emptyCard: {
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

  sharedPreviewGrid: {
    gap: 8,
  },
  sharedPreviewCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: CARD_SOFT,
    padding: 13,
  },
  sharedPreviewIcon: {
    fontSize: 22,
    marginBottom: 8,
  },
  sharedPreviewTitle: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: "900",
  },
  sharedPreviewText: {
    color: MUTED,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
    marginTop: 5,
  },
});