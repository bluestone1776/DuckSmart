// components/DogHelper.js

import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  Image,
  Modal,
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
} from "react-native";

import { COLORS } from "../constants/theme";
import { clamp } from "../utils/helpers";

const HUNT_BROWN = "#1A120D";
const HUNT_BROWN_CARD = "rgba(20, 14, 10, 0.96)";
const HUNT_BROWN_CARD_2 = "rgba(27, 18, 12, 0.98)";
const HUNT_BORDER = "rgba(217,168,76,0.20)";
const HUNT_GOLD = "#D9A84C";
const HUNT_MUTED = "rgba(255,255,255,0.58)";
const HUNT_TEXT_SOFT = "rgba(255,255,255,0.42)";
const RED = "#FF6B6B";
const GREEN = "#39FF14";

function getDogPhoto(dog) {
  return (
    dog?.photoUri ||
    dog?.photoURL ||
    dog?.photoUrl ||
    dog?.imageUri ||
    dog?.imageUrl ||
    null
  );
}

function getCleanDogs(dogs = []) {
  return Array.isArray(dogs)
    ? dogs.filter((dog) => dog && dog.id && !dog.deletedAt && dog.active !== false)
    : [];
}

function safeNumber(value) {
  const num = Math.round(Number(value || 0));
  return Number.isFinite(num) ? Math.max(0, num) : 0;
}

function createEmptyDogStats(dog) {
  return {
    dogId: dog?.id || "",
    dogName: dog?.name || "Hunting Dog",
    dogPhotoUri: getDogPhoto(dog),
    breed: dog?.breed || "",
    dogUsed: false,

    duckRetrieves: 0,
    gooseRetrieves: 0,
    crippleRetrieves: 0,
    blindRetrieves: 0,
    markedRetrieves: 0,
    waterRetrieves: 0,
    landRetrieves: 0,
    longRetrieveYards: 0,

    notes: "",
    updatedAt: Date.now(),
  };
}

function normalizeDogStatsItem(item, dog = null) {
  const fallback = dog ? createEmptyDogStats(dog) : createEmptyDogStats({});

  return {
    ...fallback,
    ...(item || {}),
    dogId: item?.dogId || dog?.id || fallback.dogId,
    dogName: item?.dogName || dog?.name || fallback.dogName,
    dogPhotoUri: item?.dogPhotoUri || getDogPhoto(dog) || fallback.dogPhotoUri,
    breed: item?.breed || dog?.breed || fallback.breed,
    dogUsed: item?.dogUsed === true,

    duckRetrieves: safeNumber(item?.duckRetrieves),
    gooseRetrieves: safeNumber(item?.gooseRetrieves),
    crippleRetrieves: safeNumber(item?.crippleRetrieves),
    blindRetrieves: safeNumber(item?.blindRetrieves),
    markedRetrieves: safeNumber(item?.markedRetrieves),
    waterRetrieves: safeNumber(item?.waterRetrieves),
    landRetrieves: safeNumber(item?.landRetrieves),
    longRetrieveYards: safeNumber(item?.longRetrieveYards),

    notes: item?.notes || "",
    updatedAt: item?.updatedAt || Date.now(),
  };
}

function normalizeDogStatsList(value, dogs = []) {
  const safeValue = Array.isArray(value) ? value : [];
  const activeDogs = getCleanDogs(dogs);

  const existingByDogId = new Map(
    safeValue
      .filter((item) => item?.dogId)
      .map((item) => [String(item.dogId), item])
  );

  return activeDogs.map((dog) => {
    const existing = existingByDogId.get(String(dog.id)) || null;

    return normalizeDogStatsItem(
      existing || createEmptyDogStats(dog),
      dog
    );
  });
}

function getBirdsRecovered(stats) {
  return (
    Number(stats?.duckRetrieves || 0) +
    Number(stats?.gooseRetrieves || 0) +
    Number(stats?.crippleRetrieves || 0)
  );
}

function getRetrieveSummary(stats) {
  if (!stats || stats.dogUsed === false) return "Not used on this hunt";

  const birdsRecovered = getBirdsRecovered(stats);
  const parts = [];

  if (birdsRecovered > 0) parts.push(`${birdsRecovered} recovered`);
  if (stats.blindRetrieves > 0) parts.push(`${stats.blindRetrieves} blind`);
  if (stats.markedRetrieves > 0) parts.push(`${stats.markedRetrieves} marked`);
  if (stats.waterRetrieves > 0) parts.push(`${stats.waterRetrieves} water`);

  return parts.length ? parts.join(" • ") : "Used, no retrieves added";
}

function MiniCounter({ label, value, onMinus, onPlus }) {
  return (
    <View style={s.counterCard}>
      <Text style={s.counterLabel} numberOfLines={1}>{label}</Text>

      <View style={s.counterRow}>
        <Pressable style={s.counterBtn} onPress={onMinus}>
          <Text style={s.counterBtnText}>−</Text>
        </Pressable>

        <Text style={s.counterValue}>{value}</Text>

        <Pressable style={s.counterBtn} onPress={onPlus}>
          <Text style={s.counterBtnText}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function DogHelper({
  visible,
  dogs = [],
  value = [],
  onChange,
  onClose,
}) {
  const activeDogs = useMemo(() => getCleanDogs(dogs), [dogs]);
  const [draftStats, setDraftStats] = useState([]);

  useEffect(() => {
    if (!visible) return;

    const normalized = normalizeDogStatsList(value, activeDogs);
    setDraftStats(normalized);
  }, [visible, value, activeDogs]);

  const totals = useMemo(() => {
    return draftStats
      .filter((item) => item?.dogUsed === true)
      .reduce(
        (sum, item) => {
          sum.dogsUsed += 1;
          sum.birdsRecovered += getBirdsRecovered(item);
          sum.ducks += Number(item.duckRetrieves || 0);
          sum.geese += Number(item.gooseRetrieves || 0);
          sum.cripples += Number(item.crippleRetrieves || 0);
          return sum;
        },
        {
          dogsUsed: 0,
          birdsRecovered: 0,
          ducks: 0,
          geese: 0,
          cripples: 0,
        }
      );
  }, [draftStats]);

  function cleanForParent(nextStats) {
    return nextStats
      .filter((item) => item?.dogId && item.dogUsed === true)
      .map((item) => ({
        ...item,
        dogId: String(item.dogId),
        dogName: String(item.dogName || "Hunting Dog"),
        dogUsed: true,
        duckRetrieves: safeNumber(item.duckRetrieves),
        gooseRetrieves: safeNumber(item.gooseRetrieves),
        crippleRetrieves: safeNumber(item.crippleRetrieves),
        blindRetrieves: safeNumber(item.blindRetrieves),
        markedRetrieves: safeNumber(item.markedRetrieves),
        waterRetrieves: safeNumber(item.waterRetrieves),
        landRetrieves: safeNumber(item.landRetrieves),
        longRetrieveYards: safeNumber(item.longRetrieveYards),
        notes: String(item.notes || "").trim().slice(0, 1000),
        updatedAt: Date.now(),
      }));
  }

  function emit(nextStats) {
    setDraftStats(nextStats);
    onChange?.(cleanForParent(nextStats));
  }

  function updateDogStats(dogId, updates, markUsed = true) {
    const nextStats = draftStats.map((item) => {
      if (item.dogId !== dogId) return item;

      return {
        ...item,
        ...updates,
        dogUsed: markUsed ? true : updates.dogUsed,
        updatedAt: Date.now(),
      };
    });

    emit(nextStats);
  }

  function toggleDogUsed(dogId) {
    const current = draftStats.find((item) => item.dogId === dogId);
    const nextUsed = current?.dogUsed !== true;

    const nextStats = draftStats.map((item) => {
      if (item.dogId !== dogId) return item;

      if (nextUsed) {
        return {
          ...item,
          dogUsed: true,
          updatedAt: Date.now(),
        };
      }

      return {
        ...item,
        dogUsed: false,
        duckRetrieves: 0,
        gooseRetrieves: 0,
        crippleRetrieves: 0,
        blindRetrieves: 0,
        markedRetrieves: 0,
        waterRetrieves: 0,
        landRetrieves: 0,
        longRetrieveYards: 0,
        notes: "",
        updatedAt: Date.now(),
      };
    });

    emit(nextStats);
  }

  function changeCounter(dogId, key, amount) {
    const current = draftStats.find((item) => item.dogId === dogId);
    if (!current) return;

    const next = clamp(Number(current[key] || 0) + amount, 0, 999);

    updateDogStats(dogId, {
      [key]: next,
    });
  }

  function clearAllDogStats() {
    const nextStats = draftStats.map((item) => ({
      ...item,
      dogUsed: false,
      duckRetrieves: 0,
      gooseRetrieves: 0,
      crippleRetrieves: 0,
      blindRetrieves: 0,
      markedRetrieves: 0,
      waterRetrieves: 0,
      landRetrieves: 0,
      longRetrieveYards: 0,
      notes: "",
      updatedAt: Date.now(),
    }));

    emit(nextStats);
  }

  function handleDone() {
    onChange?.(cleanForParent(draftStats));
    onClose?.();
  }

  if (!activeDogs.length) {
    return null;
  }

  return (
    <Modal
      visible={!!visible}
      transparent
      animationType="fade"
      onRequestClose={handleDone}
    >
      <KeyboardAvoidingView
        style={s.backdrop}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 20 : 0}
      >
        <View style={s.modalCard}>
          <View style={s.headerRow}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.kicker}>DOG HELPER</Text>
              <Text style={s.title}>Dog Hunting Stats</Text>
              <Text style={s.subtitle}>
                Add retrieve stats for each dog used on this hunt.
              </Text>
            </View>

            <Pressable style={s.closeBtn} onPress={handleDone}>
              <Text style={s.closeText}>✕</Text>
            </Pressable>
          </View>

          <View style={s.summaryRow}>
            <View style={s.summaryBox}>
              <Text style={s.summaryValue}>{totals.birdsRecovered}</Text>
              <Text style={s.summaryLabel}>Recovered</Text>
            </View>

            <View style={s.summaryBox}>
              <Text style={s.summaryValue}>{totals.dogsUsed}</Text>
              <Text style={s.summaryLabel}>Dogs</Text>
            </View>

            <View style={s.summaryBox}>
              <Text style={s.summaryValue}>{totals.ducks}</Text>
              <Text style={s.summaryLabel}>Ducks</Text>
            </View>

            <View style={s.summaryBox}>
              <Text style={s.summaryValue}>{totals.geese}</Text>
              <Text style={s.summaryLabel}>Geese</Text>
            </View>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={s.scrollContent}
          >
            {draftStats.map((item) => {
              const dog = activeDogs.find((d) => String(d.id) === String(item.dogId));
              const dogPhoto = getDogPhoto(dog) || item.dogPhotoUri;
              const dogUsed = item.dogUsed === true;

              return (
                <View key={item.dogId} style={[s.dogCard, dogUsed ? s.dogCardUsed : null]}>
                  <View style={s.dogTopRow}>
                    {dogPhoto ? (
                      <Image source={{ uri: dogPhoto }} style={s.dogPhoto} resizeMode="cover" />
                    ) : (
                      <View style={s.dogPhotoFallback}>
                        <Text style={s.dogPhotoFallbackText}>🐾</Text>
                      </View>
                    )}

                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={s.dogName} numberOfLines={1}>
                        {item.dogName || dog?.name || "Hunting Dog"}
                      </Text>

                      <Text style={s.dogMeta} numberOfLines={1}>
                        {dog?.breed || item.breed || "Dog work"}
                      </Text>

                      <Text style={s.dogSummary} numberOfLines={1}>
                        {getRetrieveSummary(item)}
                      </Text>
                    </View>

                    <Pressable
                      style={[s.usedPill, dogUsed ? s.usedPillActive : null]}
                      onPress={() => toggleDogUsed(item.dogId)}
                    >
                      <Text style={[s.usedPillText, dogUsed ? s.usedPillTextActive : null]}>
                        {dogUsed ? "Used" : "Use"}
                      </Text>
                    </Pressable>
                  </View>

                  <View style={s.counterGrid}>
                    <MiniCounter
                      label="Ducks"
                      value={item.duckRetrieves}
                      onMinus={() => changeCounter(item.dogId, "duckRetrieves", -1)}
                      onPlus={() => changeCounter(item.dogId, "duckRetrieves", 1)}
                    />

                    <MiniCounter
                      label="Geese"
                      value={item.gooseRetrieves}
                      onMinus={() => changeCounter(item.dogId, "gooseRetrieves", -1)}
                      onPlus={() => changeCounter(item.dogId, "gooseRetrieves", 1)}
                    />

                    <MiniCounter
                      label="Cripples"
                      value={item.crippleRetrieves}
                      onMinus={() => changeCounter(item.dogId, "crippleRetrieves", -1)}
                      onPlus={() => changeCounter(item.dogId, "crippleRetrieves", 1)}
                    />

                    <MiniCounter
                      label="Blind"
                      value={item.blindRetrieves}
                      onMinus={() => changeCounter(item.dogId, "blindRetrieves", -1)}
                      onPlus={() => changeCounter(item.dogId, "blindRetrieves", 1)}
                    />

                    <MiniCounter
                      label="Marked"
                      value={item.markedRetrieves}
                      onMinus={() => changeCounter(item.dogId, "markedRetrieves", -1)}
                      onPlus={() => changeCounter(item.dogId, "markedRetrieves", 1)}
                    />

                    <MiniCounter
                      label="Water"
                      value={item.waterRetrieves}
                      onMinus={() => changeCounter(item.dogId, "waterRetrieves", -1)}
                      onPlus={() => changeCounter(item.dogId, "waterRetrieves", 1)}
                    />

                    <MiniCounter
                      label="Land"
                      value={item.landRetrieves}
                      onMinus={() => changeCounter(item.dogId, "landRetrieves", -1)}
                      onPlus={() => changeCounter(item.dogId, "landRetrieves", 1)}
                    />

                    <MiniCounter
                      label="Long yd"
                      value={item.longRetrieveYards}
                      onMinus={() => changeCounter(item.dogId, "longRetrieveYards", -5)}
                      onPlus={() => changeCounter(item.dogId, "longRetrieveYards", 5)}
                    />
                  </View>

                  <TextInput
                    value={item.notes}
                    onChangeText={(text) =>
                      updateDogStats(item.dogId, {
                        notes: text,
                      })
                    }
                    placeholder="Dog notes..."
                    placeholderTextColor="rgba(255,255,255,0.30)"
                    style={s.notesInput}
                    multiline
                  />
                </View>
              );
            })}

            <View style={s.buttonRow}>
              <Pressable style={s.clearBtn} onPress={clearAllDogStats}>
                <Text style={s.clearBtnText}>Clear All</Text>
              </Pressable>

              <Pressable style={s.doneBtn} onPress={handleDone}>
                <Text style={s.doneBtnText}>Done</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.74)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
    paddingVertical: Platform.OS === "ios" ? 20 : 12,
  },

  modalCard: {
    width: "100%",
    maxHeight: "94%",
    borderRadius: 20,
    backgroundColor: HUNT_BROWN_CARD_2,
    borderWidth: 1,
    borderColor: HUNT_BORDER,
    overflow: "hidden",
  },

  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 13,
    paddingTop: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(217,168,76,0.07)",
  },

  kicker: {
    color: HUNT_GOLD,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1,
  },

  title: {
    color: COLORS.white,
    fontSize: 19,
    fontWeight: "900",
    marginTop: 2,
  },

  subtitle: {
    color: HUNT_MUTED,
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 15,
    marginTop: 3,
  },

  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 10,
  },

  closeText: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: "900",
  },

  summaryRow: {
    flexDirection: "row",
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },

  summaryBox: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    paddingVertical: 7,
    alignItems: "center",
    marginHorizontal: 3,
  },

  summaryValue: {
    color: HUNT_GOLD,
    fontSize: 19,
    fontWeight: "900",
  },

  summaryLabel: {
    color: HUNT_TEXT_SOFT,
    fontSize: 8,
    fontWeight: "900",
    marginTop: 1,
    textTransform: "uppercase",
    textAlign: "center",
  },

  scrollContent: {
    padding: 10,
    paddingBottom: Platform.OS === "ios" ? 30 : 22,
  },

  dogCard: {
    borderRadius: 16,
    backgroundColor: HUNT_BROWN_CARD,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    padding: 10,
    marginBottom: 9,
  },

  dogCardUsed: {
    borderColor: "rgba(57,255,20,0.34)",
  },

  dogTopRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 9,
  },

  dogPhoto: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: "rgba(255,255,255,0.04)",
    marginRight: 9,
  },

  dogPhotoFallback: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: "rgba(217,168,76,0.12)",
    borderWidth: 1,
    borderColor: HUNT_BORDER,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 9,
  },

  dogPhotoFallbackText: {
    fontSize: 25,
  },

  dogName: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: "900",
  },

  dogMeta: {
    color: HUNT_MUTED,
    fontSize: 10,
    fontWeight: "700",
    marginTop: 2,
  },

  dogSummary: {
    color: HUNT_GOLD,
    fontSize: 10,
    fontWeight: "900",
    marginTop: 3,
  },

  usedPill: {
    minWidth: 52,
    alignItems: "center",
    paddingVertical: 7,
    paddingHorizontal: 9,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    marginLeft: 8,
  },

  usedPillActive: {
    backgroundColor: "rgba(57,255,20,0.12)",
    borderColor: GREEN,
  },

  usedPillText: {
    color: HUNT_MUTED,
    fontSize: 10,
    fontWeight: "900",
  },

  usedPillTextActive: {
    color: GREEN,
  },

  counterGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },

  counterCard: {
    width: "49%",
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.035)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    padding: 8,
    marginBottom: 7,
  },

  counterLabel: {
    color: HUNT_TEXT_SOFT,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    marginBottom: 5,
  },

  counterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  counterBtn: {
    width: 31,
    height: 31,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.07)",
    alignItems: "center",
    justifyContent: "center",
  },

  counterBtnText: {
    color: COLORS.white,
    fontSize: 21,
    fontWeight: "800",
    lineHeight: 21,
  },

  counterValue: {
    color: COLORS.white,
    fontSize: 22,
    fontWeight: "900",
  },

  notesInput: {
    minHeight: 54,
    maxHeight: 96,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.035)",
    color: COLORS.white,
    paddingHorizontal: 10,
    paddingVertical: 8,
    textAlignVertical: "top",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 1,
  },

  buttonRow: {
    flexDirection: "row",
    marginTop: 3,
    marginBottom: 2,
  },

  clearBtn: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    backgroundColor: "rgba(255,77,77,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,77,77,0.24)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },

  clearBtnText: {
    color: RED,
    fontSize: 13,
    fontWeight: "900",
  },

  doneBtn: {
    flex: 1.25,
    height: 46,
    borderRadius: 14,
    backgroundColor: HUNT_GOLD,
    alignItems: "center",
    justifyContent: "center",
  },

  doneBtnText: {
    color: HUNT_BROWN,
    fontSize: 14,
    fontWeight: "900",
  },
});