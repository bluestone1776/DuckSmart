// DuckSmart shared styles

import { StyleSheet } from "react-native";
import { COLORS } from "./theme";

export const sharedStyles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.black },
  container: { padding: 16, paddingBottom: 28, backgroundColor: COLORS.black },

  // general header
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  brand: { fontSize: 22, fontWeight: "900", letterSpacing: 0.2 },
  brandSmall: { fontSize: 18, fontWeight: "900" },
  brandDuck: { color: COLORS.white },
  brandSmart: { color: COLORS.green },
  subHeader: { marginTop: 4, color: COLORS.muted, fontSize: 13 },
  subHeaderSmall: { marginTop: 3, color: COLORS.muted, fontSize: 12 },
  logoSmall: { width: 42, height: 42, borderRadius: 12 },

  gearButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.bg,
  },
  gearText: { color: COLORS.white, fontSize: 18 },

  card: {
    marginTop: 14,
    backgroundColor: COLORS.bg,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardTitle: { color: COLORS.white, fontSize: 15, fontWeight: "800" },

  chipRow: { flexDirection: "row", gap: 10, paddingBottom: 4, paddingRight: 6 },
  chip: { paddingVertical: 9, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1 },
  chipSelected: { backgroundColor: COLORS.greenBg, borderColor: COLORS.green },
  chipUnselected: { backgroundColor: COLORS.bg, borderColor: COLORS.border },
  chipText: { fontSize: 13, fontWeight: "700", color: COLORS.white },
  chipTextSelected: { color: COLORS.green },

  inputLabel: { color: COLORS.muted, fontSize: 12, marginBottom: 8, marginTop: 10, fontWeight: "900" },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bgDeep,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: COLORS.white,
    fontWeight: "800",
  },

  smallBtn: {
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.green,
    backgroundColor: COLORS.greenBg,
  },
  smallBtnText: { color: COLORS.green, fontWeight: "900", fontSize: 12 },

  sheetBtnRow: { flexDirection: "row", gap: 10, marginTop: 14 },
  primaryBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: COLORS.greenBg,
    borderWidth: 1,
    borderColor: COLORS.green,
    alignItems: "center",
  },
  primaryBtnText: { color: COLORS.green, fontWeight: "900" },
  secondaryBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: COLORS.bgDeep,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
  },
  secondaryBtnText: { color: COLORS.white, fontWeight: "900" },

  noteBox: { padding: 12, borderRadius: 14, backgroundColor: COLORS.bgDeep, borderWidth: 1, borderColor: COLORS.borderSubtle },
  noteText: { color: COLORS.white, fontSize: 13, lineHeight: 18, fontWeight: "700" },
  noteTextMuted: { color: COLORS.mutedDark, fontSize: 13, lineHeight: 18, fontWeight: "700" },

  spreadThumb: { width: "100%", height: 140, borderRadius: 16, marginTop: 12, borderWidth: 1, borderColor: COLORS.borderSubtle },
  spreadThumbSmall: { width: "100%", height: 110, borderRadius: 16, marginTop: 10, borderWidth: 1, borderColor: COLORS.borderSubtle },

  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.72)", alignItems: "center", justifyContent: "center", padding: 18 },
  modalCard: { width: "100%", maxWidth: 520, backgroundColor: COLORS.bg, borderRadius: 18, borderWidth: 1, borderColor: COLORS.border, padding: 14 },
  modalTitle: { color: COLORS.white, fontWeight: "900", fontSize: 16, marginBottom: 10 },
  modalImage: { width: "100%", height: 360 },

  miniMapWrap: { borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: COLORS.borderSubtle, backgroundColor: COLORS.bgDeepest },
  miniMap: { height: 160, width: "100%" },
  miniMapFooter: { padding: 12 },
  miniMapText: { color: COLORS.white, fontWeight: "900" },
  miniMapMuted: { color: COLORS.mutedDark, marginTop: 6, fontWeight: "800" },

  presetRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 12, justifyContent: "center" },
  presetBtn: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 14, backgroundColor: COLORS.bgDeep, borderWidth: 1, borderColor: COLORS.border },
  presetBtnActive: { borderColor: COLORS.green, backgroundColor: COLORS.greenBg },
  presetBtnText: { color: COLORS.white, fontWeight: "900" },
  presetBtnTextActive: { color: COLORS.green },

  photoRow: { flexDirection: "row", gap: 10, paddingVertical: 6, paddingRight: 6 },
  photoCard: { width: 130, borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: COLORS.borderSubtle, backgroundColor: COLORS.bgDeepest },
  photo: { width: "100%", height: 92 },
  photoHint: { color: COLORS.mutedDark, fontWeight: "800", fontSize: 11, padding: 10 },

  historyRow: { flexDirection: "row", gap: 10, alignItems: "flex-start", paddingVertical: 12, borderTopWidth: 1, borderTopColor: COLORS.borderSubtle },
  historyRowSelected: { backgroundColor: COLORS.bgDeep, borderRadius: 12, paddingHorizontal: 10 },
  historyTitle: { color: COLORS.white, fontWeight: "900" },
  historySub: { color: COLORS.muted, marginTop: 4, fontWeight: "800" },
  historyNotes: { color: COLORS.mutedDark, marginTop: 8, fontWeight: "800", lineHeight: 18 },

  trashBtn: { width: 42, height: 42, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.bgDeep, alignItems: "center", justifyContent: "center" },
  trashBtnText: { color: COLORS.white, fontSize: 16 },

  detailMapWrap: { marginTop: 12, borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: COLORS.borderSubtle, backgroundColor: COLORS.bgDeepest },
  detailMap: { height: 170, width: "100%" },
  detailLine: { color: COLORS.muted, fontWeight: "800", lineHeight: 20, marginBottom: 6 },
  detailLabel: { color: COLORS.white, fontWeight: "900" },

  // map screen
  mapWrap: { flex: 1, backgroundColor: COLORS.black },
  mapTopBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    backgroundColor: "rgba(0,0,0,0.85)",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderSubtle,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  iconBtnActive: { borderColor: COLORS.green, backgroundColor: COLORS.greenBg },
  iconBtnText: { color: COLORS.white, fontSize: 18, fontWeight: "900" },
  map: { flex: 1 },

  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: 14,
    backgroundColor: COLORS.bg,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  sheetHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  sheetTitle: { color: COLORS.white, fontSize: 16, fontWeight: "900" },
  sheetSub: { color: COLORS.muted, fontSize: 12, marginTop: 4 },
  sheetPill: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1, borderColor: COLORS.border },
  sheetPillText: { color: COLORS.muted, fontSize: 12, fontWeight: "800" },
  sheetHint: { marginTop: 8, color: COLORS.muted, fontSize: 12, lineHeight: 18, fontWeight: "700" },

  pinListRow: { flexDirection: "row", gap: 10, paddingVertical: 10, paddingRight: 6 },
  pinPill: { width: 170, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.bgDeep },
  pinPillType: { color: COLORS.green, fontWeight: "900", fontSize: 12 },
  pinPillTitle: { color: COLORS.white, fontWeight: "900", marginTop: 6, fontSize: 13 },

  disclaimer: { marginTop: 12, color: COLORS.mutedDarker, fontSize: 12, lineHeight: 18, fontWeight: "700" },
});
