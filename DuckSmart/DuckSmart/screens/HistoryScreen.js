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
} from "react-native";
import MapView, { Marker } from "react-native-maps";

import { sharedStyles as styles } from "../constants/styles";
import { ASSETS } from "../constants/assets";
import Card from "../components/Card";
import Chip from "../components/Chip";
import Header from "../components/Header";

export default function HistoryScreen({ logs, deleteLog }) {
  const [query, setQuery] = useState("");
  const [filterEnv, setFilterEnv] = useState("All");
  const [filterSpread, setFilterSpread] = useState("All");
  const [selectedId, setSelectedId] = useState(null);
  const selected = useMemo(() => logs.find((l) => l.id === selectedId) || null, [logs, selectedId]);

  const environments = useMemo(() => ["All", ...Array.from(new Set(logs.map((l) => l.environment))).sort()], [logs]);
  const spreads = useMemo(() => ["All", ...Array.from(new Set(logs.map((l) => l.spread))).sort()], [logs]);

  const filtered = useMemo(() => {
    const q = (query || "").toLowerCase().trim();
    return logs
      .filter((l) => {
        if (filterEnv !== "All" && l.environment !== filterEnv) return false;
        if (filterSpread !== "All" && l.spread !== filterSpread) return false;
        if (!q) return true;
        const hay = [l.environment, l.spread, l.notes, new Date(l.dateTime).toLocaleString()].join(" | ").toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [logs, query, filterEnv, filterSpread]);

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
          <Header subtitle="Hunt History" />

          <Card title="Search & Filters">
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search notes, environment, spread, date..."
              placeholderTextColor="#6D6D6D"
              style={styles.input}
            />

            <Text style={styles.inputLabel}>Environment</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.chipRow}>
                {environments.map((e) => (
                  <Chip key={e} label={e} selected={filterEnv === e} onPress={() => setFilterEnv(e)} />
                ))}
              </View>
            </ScrollView>

            <Text style={styles.inputLabel}>Spread</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.chipRow}>
                {spreads.map((s) => (
                  <Chip key={s} label={s} selected={filterSpread === s} onPress={() => setFilterSpread(s)} />
                ))}
              </View>
            </ScrollView>
          </Card>

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
                        {l.environment} • {l.spread} • Score {l.huntScore}
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
            </Card>
          ) : null}

          <View style={{ height: 20 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
