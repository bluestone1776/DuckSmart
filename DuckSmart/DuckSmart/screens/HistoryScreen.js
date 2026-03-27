import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StatusBar,
  TextInput,
  Alert,
  Platform,
  KeyboardAvoidingView,
  Image,
  Share,
  Modal,
  Dimensions,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import MapView, { Marker } from "react-native-maps";

import Svg, { Path, Circle, Text as SvgText } from "react-native-svg";

import { sharedStyles as styles } from "../constants/styles";
import { COLORS } from "../constants/theme";
import { ASSETS } from "../constants/assets";
import { SPREADS } from "../data/decoySpreadData";
import { clamp } from "../utils/helpers";
import Card from "../components/Card";
import Chip from "../components/Chip";
import Header from "../components/Header";
import ScreenBackground from "../components/ScreenBackground";

const SCREEN_WIDTH = Dimensions.get("window").width;

// ---------------------------------------------------------------------------
// Full-screen photo viewer modal
// ---------------------------------------------------------------------------
function PhotoViewerModal({ photos, index, onClose, onChangeIndex }) {
  if (!photos || photos.length === 0) return null;
  const current = photos[index] || photos[0];
  const hasMultiple = photos.length > 1;

  return (
    <Modal visible transparent={false} animationType="fade" onRequestClose={onClose}>
      <SafeAreaView style={viewerStyles.safe}>
        {/* Top bar */}
        <View style={viewerStyles.topBar}>
          <View style={{ flex: 1 }}>
            <Text style={viewerStyles.counter}>
              {hasMultiple ? `${index + 1} of ${photos.length}` : "Photo"}
            </Text>
          </View>
          <Pressable style={viewerStyles.closeBtn} onPress={onClose}>
            <Text style={viewerStyles.closeBtnText}>✕</Text>
          </Pressable>
        </View>

        {/* Image */}
        <View style={viewerStyles.imageWrap}>
          <Image
            source={{ uri: current.uri }}
            style={viewerStyles.image}
            resizeMode="contain"
          />

          {/* Nav arrows */}
          {hasMultiple && index > 0 && (
            <Pressable
              style={[viewerStyles.arrowBtn, viewerStyles.arrowLeft]}
              onPress={() => onChangeIndex(index - 1)}
            >
              <Text style={viewerStyles.arrowText}>‹</Text>
            </Pressable>
          )}
          {hasMultiple && index < photos.length - 1 && (
            <Pressable
              style={[viewerStyles.arrowBtn, viewerStyles.arrowRight]}
              onPress={() => onChangeIndex(index + 1)}
            >
              <Text style={viewerStyles.arrowText}>›</Text>
            </Pressable>
          )}
        </View>

        {/* Bottom close */}
        <Pressable style={viewerStyles.bottomCloseBtn} onPress={onClose}>
          <Text style={viewerStyles.bottomCloseBtnText}>Close</Text>
        </Pressable>
      </SafeAreaView>
    </Modal>
  );
}

const viewerStyles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.black },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  counter: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: "800",
  },
  closeBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  closeBtnText: { color: COLORS.white, fontSize: 18, fontWeight: "700" },

  imageWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  image: {
    width: SCREEN_WIDTH,
    height: "100%",
  },

  arrowBtn: {
    position: "absolute",
    top: "50%",
    marginTop: -24,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(14,14,14,0.75)",
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
  },
  arrowLeft: { left: 12 },
  arrowRight: { right: 12 },
  arrowText: { color: COLORS.white, fontSize: 28, fontWeight: "900", marginTop: -2 },

  bottomCloseBtn: {
    marginHorizontal: 16,
    marginBottom: 12,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: COLORS.greenBg,
    borderWidth: 1,
    borderColor: COLORS.green,
    alignItems: "center",
  },
  bottomCloseBtnText: { color: COLORS.green, fontWeight: "900", fontSize: 15 },
});

export default function HistoryScreen({ logs, deleteLog, onLogout }) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const selected = useMemo(() => logs.find((l) => l.id === selectedId) || null, [logs, selectedId]);

  // Photo viewer state
  const [viewerPhotos, setViewerPhotos] = useState(null);
  const [viewerIndex, setViewerIndex] = useState(0);

  function openPhotoViewer(photos, index) {
    setViewerPhotos(photos);
    setViewerIndex(index);
  }

  function closePhotoViewer() {
    setViewerPhotos(null);
    setViewerIndex(0);
  }

  const filtered = useMemo(() => {
    const q = (query || "").toLowerCase().trim();
    return logs
      .filter((l) => {
        if (!q) return true;
        const hay = [l.environment, l.spread, l.notes, l.pinTitle, new Date(l.dateTime).toLocaleString()].join(" | ").toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [logs, query]);

  async function shareLog(log) {
    const date = new Date(log.dateTime).toLocaleDateString();
    const ducks = log.ducksHarvested != null ? `\nDucks Harvested: ${log.ducksHarvested}` : "";
    const huntersLine = log.hunters > 1 ? `Hunters: ${log.hunters}` : "";
    const avgLine = log.hunters > 1 && log.ducksHarvested > 0 ? `Avg per Hunter: ${(log.ducksHarvested / log.hunters).toFixed(1)}` : "";
    const message = [
      `DuckSmart Hunt Log — ${date}`,
      `Environment: ${log.environment}`,
      `Spread: ${log.spread}`,
      `Hunt Score: ${log.huntScore}/100`,
      ducks,
      huntersLine,
      avgLine,
      log.pinTitle ? `Spot: ${log.pinTitle}` : "",
      log.notes ? `\nNotes: ${log.notes}` : "",
      `\nLogged with DuckSmart`,
    ].filter(Boolean).join("\n");

    try {
      await Share.share({ message });
    } catch {
      // User cancelled or share failed — no action needed
    }
  }

  function confirmDelete(id) {
    const log = logs.find((l) => l.id === id);
    Alert.alert("Delete hunt log?", log ? new Date(log.dateTime).toLocaleString() : "", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteLog(id) },
    ]);
  }

  return (
    <ScreenBackground style={styles.safe} bg={ASSETS.backgrounds.history}>
      <SafeAreaView style={{ flex: 1 }}>
      <StatusBar barStyle="light-content" />

      {/* Full-screen photo viewer */}
      <PhotoViewerModal
        photos={viewerPhotos}
        index={viewerIndex}
        onClose={closePhotoViewer}
        onChangeIndex={setViewerIndex}
      />

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.container}>
          <Header subtitle={selected ? "Hunt Details" : "Hunt History"} onGearPress={onLogout} />

          {!selected && (
            <>
              <Card title="Search">
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search notes, environment, spread, date..."
                  placeholderTextColor="#6D6D6D"
                  style={styles.input}
                />
              </Card>

              <View style={{ marginTop: 14, padding: 14, borderRadius: 16, backgroundColor: "#0E1A12", borderWidth: 1, borderColor: "#2ECC71" }}>
                <Text style={{ color: "#2ECC71", fontWeight: "900", fontSize: 13 }}>Upgrade to Pro</Text>
                <Text style={{ color: "#BDBDBD", fontWeight: "800", fontSize: 13, marginTop: 6, lineHeight: 18 }}>
                  You can save up to 5 hunt logs for free. Upgrade to DuckSmart Pro for unlimited logs, cloud backup, and more.
                </Text>
              </View>

              <Card title="Logs">
                {filtered.length === 0 ? (
                  <View style={styles.noteBox}>
                    <Text style={styles.noteTextMuted}>No logs yet (or no matches). Create one in the Log tab.</Text>
                  </View>
                ) : (
                  filtered.map((l) => (
                    <Pressable
                      key={l.id}
                      onPress={() => setSelectedId(l.id)}
                      style={styles.historyRow}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.historyTitle}>{new Date(l.dateTime).toLocaleString()}</Text>
                        <Text style={styles.historySub}>
                          {l.environment} • {l.spread} • Score {l.huntScore}{l.ducksHarvested != null ? ` • ${l.ducksHarvested} ducks` : ""}{l.hunters > 1 ? ` • ${l.hunters} hunters` : ""}{l.pinTitle ? ` • 📍 ${l.pinTitle}` : ""}
                        </Text>
                        {ASSETS.spreads[l.spread] ? (
                          <Image source={ASSETS.spreads[l.spread]} style={styles.spreadThumbSmall} resizeMode="cover" />
                        ) : null}
                        {l.notes ? (
                          <Text style={styles.historyNotes} numberOfLines={2}>
                            {l.notes}
                          </Text>
                        ) : null}
                      </View>

                      <Pressable onPress={() => confirmDelete(l.id)} style={styles.trashBtn}>
                        <Text style={styles.trashBtnText}>🗑</Text>
                      </Pressable>
                    </Pressable>
                  ))
                )}
              </Card>
            </>
          )}

          {selected ? (
            <>
              {/* Back button */}
              <Pressable onPress={() => setSelectedId(null)} style={{ flexDirection: "row", alignItems: "center", marginTop: 8, marginBottom: 4 }}>
                <Text style={{ color: COLORS.green, fontWeight: "900", fontSize: 14 }}>← Back to Logs</Text>
              </Pressable>

              {/* GPS Location Card */}
              <Card title="GPS Location">
                <View style={styles.miniMapWrap}>
                  <MapView
                    style={styles.miniMap}
                    region={{
                      latitude: selected.location.latitude,
                      longitude: selected.location.longitude,
                      latitudeDelta: 0.01,
                      longitudeDelta: 0.01,
                    }}
                    pointerEvents="none"
                  >
                    <Marker coordinate={selected.location} />
                  </MapView>
                  <View style={styles.miniMapFooter}>
                    <Text style={styles.miniMapText}>
                      {selected.location.latitude.toFixed(5)}, {selected.location.longitude.toFixed(5)}
                    </Text>
                    <Text style={styles.miniMapMuted}>
                      {new Date(selected.dateTime).toLocaleString()}
                    </Text>
                  </View>
                </View>
              </Card>

              {/* Spot Card */}
              {selected.pinTitle ? (
                <Card title="Spot">
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={{ color: COLORS.yellow, fontWeight: "900", fontSize: 14 }}>📍 {selected.pinTitle}</Text>
                  </View>
                </Card>
              ) : null}

              {/* Environment Card */}
              <Card title="Environment">
                <Chip label={selected.environment} selected />
              </Card>

              {/* Spread Card */}
              <Card title="Spread Layout Used">
                {(() => {
                  const sp = SPREADS.find((s) => s.key === selected.spread);
                  const img = ASSETS.decoys?.[selected.spread];
                  return (
                    <View>
                      {img && (
                        <Image source={img} style={styles.spreadThumb} resizeMode="cover" />
                      )}
                      <Text style={{ color: COLORS.white, fontWeight: "900", fontSize: 14, marginTop: img ? 10 : 0 }}>
                        {sp?.name || selected.spreadDetails?.name || selected.spread}
                      </Text>
                      {sp?.type ? (
                        <Text style={{ color: COLORS.mutedDark, fontWeight: "700", fontSize: 12, marginTop: 2 }}>{sp.type}</Text>
                      ) : null}
                      {selected.spreadDetails ? (
                        <View style={{ marginTop: 10, gap: 4 }}>
                          {selected.spreadDetails.decoyCount ? (
                            <Text style={styles.detailLine}><Text style={styles.detailLabel}>Decoys:</Text> {selected.spreadDetails.decoyCount}</Text>
                          ) : null}
                          {selected.spreadDetails.calling ? (
                            <Text style={styles.detailLine}><Text style={styles.detailLabel}>Calling:</Text> {selected.spreadDetails.calling}</Text>
                          ) : null}
                          {selected.spreadDetails.bestTime ? (
                            <Text style={styles.detailLine}><Text style={styles.detailLabel}>Best Time:</Text> {selected.spreadDetails.bestTime}</Text>
                          ) : null}
                        </View>
                      ) : null}
                    </View>
                  );
                })()}
              </Card>

              {/* Hunt Score Card */}
              <Card title="Hunt Score">
                {(() => {
                  const size = 220;
                  const stroke = 14;
                  const radius = (size - stroke) / 2;
                  const cx = size / 2;
                  const cy = size / 2;
                  const startX = cx - radius;
                  const startY = cy;
                  const endX = cx + radius;
                  const endY = cy;
                  const d = `M ${startX} ${startY} A ${radius} ${radius} 0 0 1 ${endX} ${endY}`;
                  const score = selected.huntScore || 0;
                  const p = clamp(score, 0, 100) / 100;
                  const angle = Math.PI * (1 - p);
                  const needleX = cx + radius * Math.cos(angle);
                  const needleY = cy - radius * Math.sin(angle);
                  const arcColor = score < 40 ? "#D94C4C" : score < 70 ? "#D9A84C" : "#4CD97B";
                  return (
                    <View style={{ alignItems: "center" }}>
                      <Svg width={size} height={size * 0.62} viewBox={`0 0 ${size} ${size}`}>
                        <Path d={d} stroke="#2A2A2A" strokeWidth={stroke} strokeLinecap="round" fill="none" />
                        <Path d={d} stroke={arcColor} strokeWidth={stroke} strokeLinecap="round" fill="none" strokeDasharray={`${Math.PI * radius * p} ${Math.PI * radius}`} />
                        <Circle cx={needleX} cy={needleY} r={9} fill="#FFFFFF" />
                        <Circle cx={needleX} cy={needleY} r={5} fill="#0F0F0F" />
                        <SvgText x={cx} y={cy - 10} fill="#FFFFFF" fontSize="34" fontWeight="700" textAnchor="middle">
                          {Math.round(score)}
                        </SvgText>
                        <SvgText x={cx} y={cy + 18} fill="#BDBDBD" fontSize="12" textAnchor="middle">
                          Hunt Score
                        </SvgText>
                      </Svg>
                    </View>
                  );
                })()}
              </Card>

              {/* Ducks Harvested Card */}
              <Card title="Ducks Harvested">
                <View style={{ alignItems: "center" }}>
                  <Text style={{ color: "#FFFFFF", fontSize: 44, fontWeight: "900" }}>{selected.ducksHarvested ?? 0}</Text>
                  <Text style={{ color: "#BDBDBD", fontWeight: "900", marginTop: 6 }}>
                    {(selected.ducksHarvested ?? 0) === 0 ? "Skunked" : (selected.ducksHarvested ?? 0) >= 6 ? "Limit!" : (selected.ducksHarvested ?? 0) >= 3 ? "Solid bag" : "A few"}
                  </Text>
                </View>
              </Card>

              {/* Hunters Card */}
              <Card title="Hunters">
                <View style={{ alignItems: "center" }}>
                  <Text style={{ color: "#FFFFFF", fontSize: 44, fontWeight: "900" }}>{selected.hunters || 1}</Text>
                  <Text style={{ color: "#BDBDBD", fontWeight: "900", marginTop: 6 }}>
                    {(selected.hunters || 1) === 1 ? "Solo hunt" : `${selected.hunters} hunters`}
                  </Text>
                  {(selected.hunters || 1) > 1 && (selected.ducksHarvested || 0) > 0 && (
                    <Text style={{ color: COLORS.green, fontWeight: "900", fontSize: 13, marginTop: 4 }}>
                      {(selected.ducksHarvested / selected.hunters).toFixed(1)} ducks per hunter
                    </Text>
                  )}
                </View>
              </Card>

              {/* Notes Card */}
              <Card title="Notes">
                <View style={styles.noteBox}>
                  <Text style={selected.notes ? styles.noteText : styles.noteTextMuted}>
                    {selected.notes || "No notes for this hunt."}
                  </Text>
                </View>
                {selected.notes && selected.notes.length > 150 && (
                  <Text style={{ color: "#3A3A3A", fontSize: 11, fontWeight: "700", fontStyle: "italic", textAlign: "center", marginTop: 6, opacity: 0.5 }}>
                    You'll read this again. Probably.
                  </Text>
                )}
              </Card>

              {/* Photos Card */}
              {selected.photos?.length ? (
                <Card title={`Photos (${selected.photos.length})`}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={styles.photoRow}>
                      {selected.photos.map((p, i) => (
                        <Pressable
                          key={p.uri}
                          style={styles.photoCard}
                          onPress={() => openPhotoViewer(selected.photos, i)}
                        >
                          <Image source={{ uri: p.uri }} style={styles.photo} />
                        </Pressable>
                      ))}
                    </View>
                  </ScrollView>
                </Card>
              ) : null}

              {/* Action buttons */}
              <View style={styles.sheetBtnRow}>
                <Pressable style={styles.secondaryBtn} onPress={() => confirmDelete(selected.id)}>
                  <Text style={styles.secondaryBtnText}>Delete</Text>
                </Pressable>
                <Pressable style={styles.primaryBtn} onPress={() => shareLog(selected)}>
                  <Text style={styles.primaryBtnText}>Share Hunt</Text>
                </Pressable>
              </View>
            </>
          ) : null}

          <View style={{ height: 20 }} />
        </ScrollView>
      </KeyboardAvoidingView>
      </SafeAreaView>
    </ScreenBackground>
  );
}
