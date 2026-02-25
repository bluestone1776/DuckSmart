import React, { useMemo, useState } from "react";
import {
  SafeAreaView,
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
} from "react-native";
import MapView, { Marker } from "react-native-maps";

import { sharedStyles as styles } from "../constants/styles";
import { ASSETS } from "../constants/assets";
import Card from "../components/Card";
import Header from "../components/Header";

export default function HistoryScreen({ logs, deleteLog, onLogout }) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const selected = useMemo(() => logs.find((l) => l.id === selectedId) || null, [logs, selectedId]);

  const filtered = useMemo(() => {
    const q = (query || "").toLowerCase().trim();
    return logs
      .filter((l) => {
        if (!q) return true;
        const hay = [l.environment, l.spread, l.notes, new Date(l.dateTime).toLocaleString()].join(" | ").toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [logs, query]);

  async function shareLog(log) {
    const date = new Date(log.dateTime).toLocaleDateString();
    const ducks = log.ducksHarvested != null ? `\nDucks Harvested: ${log.ducksHarvested}` : "";
    const message = [
      `DuckSmart Hunt Log — ${date}`,
      `Environment: ${log.environment}`,
      `Spread: ${log.spread}`,
      `Hunt Score: ${log.huntScore}/100`,
      ducks,
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
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.container}>
          <Header subtitle="Hunt History" onGearPress={onLogout} />

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
              filtered.map((l) => {
                const isSelected = selectedId === l.id;
                return (
                  <Pressable
                    key={l.id}
                    onPress={() => setSelectedId(isSelected ? null : l.id)}
                    style={[styles.historyRow, isSelected ? styles.historyRowSelected : null]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.historyTitle}>{new Date(l.dateTime).toLocaleString()}</Text>
                      <Text style={styles.historySub}>
                        {l.environment} • {l.spread} • Score {l.huntScore}{l.ducksHarvested != null ? ` • ${l.ducksHarvested} ducks` : ""}
                      </Text>
                      <Image source={ASSETS.spreads[l.spread]} style={styles.spreadThumbSmall} resizeMode="cover" />
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
                );
              })
            )}
          </Card>

          {selected ? (
            <Card title="Details">
              <Text style={styles.detailLine}>
                <Text style={styles.detailLabel}>GPS:</Text>{" "}
                {selected.location.latitude.toFixed(5)}, {selected.location.longitude.toFixed(5)}
              </Text>
              {selected.ducksHarvested != null ? (
                <Text style={styles.detailLine}>
                  <Text style={styles.detailLabel}>Ducks Harvested:</Text> {selected.ducksHarvested}
                </Text>
              ) : null}

              <View style={styles.detailMapWrap}>
                <MapView
                  style={styles.detailMap}
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
              </View>

              <View style={styles.noteBox}>
                <Text style={selected.notes ? styles.noteText : styles.noteTextMuted}>
                  {selected.notes || "No notes for this hunt."}
                </Text>
              </View>

              {selected.photos?.length ? (
                <>
                  <Text style={[styles.inputLabel, { marginTop: 12 }]}>Photos</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={styles.photoRow}>
                      {selected.photos.map((p) => (
                        <View key={p.uri} style={styles.photoCard}>
                          <Image source={{ uri: p.uri }} style={styles.photo} />
                        </View>
                      ))}
                    </View>
                  </ScrollView>
                </>
              ) : null}

              <View style={styles.sheetBtnRow}>
                <Pressable style={styles.primaryBtn} onPress={() => shareLog(selected)}>
                  <Text style={styles.primaryBtnText}>Share Hunt</Text>
                </Pressable>
              </View>
            </Card>
          ) : null}

          <View style={{ height: 20 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
