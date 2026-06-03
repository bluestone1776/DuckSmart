import React from "react";
import {
  View,
  Text,
  Modal,
  Pressable,
  StyleSheet,
  ScrollView,
} from "react-native";

import { COLORS } from "../constants/theme";

const GOLD = "#D9A84C";
const BG = "#05090A";
const CARD = "rgba(13,18,19,0.98)";
const BORDER = "rgba(255,255,255,0.10)";
const MUTED = "rgba(255,255,255,0.62)";
const MUTED_DARK = "rgba(255,255,255,0.42)";

function getIcon(type) {
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

export default function InAppNotificationsModal({
  visible,
  notifications = [],
  onClose,
  onViewAll,
  onMarkRead,
}) {
  const first = notifications[0];
  const count = notifications.length;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={s.card}>
          <View style={s.headerRow}>
            <View>
              <Text style={s.kicker}>DUCKSMART</Text>
              <Text style={s.title}>
                {count === 1 ? "New Notification" : `${count} New Notifications`}
              </Text>
            </View>

            <Pressable style={s.closeBtn} onPress={onClose}>
              <Text style={s.closeText}>✕</Text>
            </Pressable>
          </View>

          <ScrollView style={s.list} showsVerticalScrollIndicator={false}>
            {notifications.slice(0, 4).map((item) => (
              <View key={item.id} style={s.row}>
                <View style={s.iconWrap}>
                  <Text style={s.icon}>{getIcon(item.type)}</Text>
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={s.rowTitle}>{item.title}</Text>
                  <Text style={s.rowMessage}>{item.message}</Text>
                </View>
              </View>
            ))}
          </ScrollView>

          {count > 4 ? (
            <Text style={s.moreText}>+{count - 4} more in Groups / Shared Logs</Text>
          ) : null}

          <Pressable style={s.primaryBtn} onPress={onViewAll}>
            <Text style={s.primaryBtnText}>View Notifications</Text>
          </Pressable>

          {first?.id ? (
            <Pressable style={s.secondaryBtn} onPress={() => onMarkRead?.(first)}>
              <Text style={s.secondaryBtnText}>
                {count === 1 ? "Mark Read" : "Mark First Read"}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.74)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  card: {
    width: "100%",
    maxWidth: 430,
    borderRadius: 24,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: "rgba(217,168,76,0.34)",
    padding: 15,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 12,
  },
  kicker: {
    color: GOLD,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  title: {
    color: COLORS.white,
    fontSize: 22,
    fontWeight: "900",
    marginTop: 3,
  },
  closeBtn: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: "rgba(255,255,255,0.06)",
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
  list: {
    maxHeight: 300,
  },
  row: {
    flexDirection: "row",
    gap: 10,
    padding: 11,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.045)",
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 8,
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "rgba(217,168,76,0.10)",
    borderWidth: 1,
    borderColor: "rgba(217,168,76,0.34)",
    alignItems: "center",
    justifyContent: "center",
  },
  icon: {
    fontSize: 20,
  },
  rowTitle: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: "900",
  },
  rowMessage: {
    color: MUTED,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
    marginTop: 3,
  },
  moreText: {
    color: MUTED_DARK,
    fontSize: 12,
    fontWeight: "800",
    textAlign: "center",
    marginTop: 4,
    marginBottom: 8,
  },
  primaryBtn: {
    marginTop: 8,
    paddingVertical: 13,
    borderRadius: 15,
    backgroundColor: GOLD,
    alignItems: "center",
  },
  primaryBtnText: {
    color: BG,
    fontSize: 14,
    fontWeight: "900",
  },
  secondaryBtn: {
    marginTop: 8,
    paddingVertical: 12,
    borderRadius: 15,
    backgroundColor: "rgba(255,255,255,0.045)",
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: "center",
  },
  secondaryBtnText: {
    color: COLORS.white,
    fontSize: 13,
    fontWeight: "900",
  },
});