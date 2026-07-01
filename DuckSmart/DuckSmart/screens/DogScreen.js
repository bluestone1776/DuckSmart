// screens/DogScreen.js

import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  Alert,
  Image,
  Modal,
  StyleSheet,
  Platform,
  ActivityIndicator,
  KeyboardAvoidingView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useNavigation } from "@react-navigation/native";

import ScreenBackground from "../components/ScreenBackground";
import { COLORS } from "../constants/theme";
import { ASSETS } from "../constants/assets";
import { useAuth } from "../context/AuthContext";
import { saveDogToFirebase, uploadDogPhotoToFirebase } from "../services/dogs";

const HUNT_BROWN = "#1A120D";
const HUNT_BROWN_CARD = "rgba(20, 14, 10, 0.94)";
const HUNT_BROWN_CARD_2 = "rgba(27, 18, 12, 0.96)";
const HUNT_BORDER = "rgba(217,168,76,0.20)";
const HUNT_GOLD = "#D9A84C";
const HUNT_MUTED = "rgba(255,255,255,0.58)";
const HUNT_TEXT_SOFT = "rgba(255,255,255,0.42)";
const RED = "#FF6B6B";
const HISTORY_SEASON_STATE_KEY = "@ducksmart_history_season_state_v1";

function getDefaultSeasonStartTimestamp() {
  const now = new Date();
  const seasonStartYear = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  return new Date(seasonStartYear, 8, 1, 0, 0, 0, 0).getTime();
}

function createDefaultSeasonState() {
  return {
    currentSeasonStart: getDefaultSeasonStartTimestamp(),
    lastSeasonStart: null,
    lastSeasonClosedAt: null,
    undo: null,
  };
}

function normalizeSeasonState(value) {
  const fallback = createDefaultSeasonState();

  if (!value || typeof value !== "object") return fallback;

  return {
    currentSeasonStart:
      Number.isFinite(Number(value.currentSeasonStart))
        ? Number(value.currentSeasonStart)
        : fallback.currentSeasonStart,
    lastSeasonStart:
      Number.isFinite(Number(value.lastSeasonStart))
        ? Number(value.lastSeasonStart)
        : null,
    lastSeasonClosedAt:
      Number.isFinite(Number(value.lastSeasonClosedAt))
        ? Number(value.lastSeasonClosedAt)
        : null,
    undo: value.undo || null,
  };
}

function getTimestampFromValue(value) {
  if (!value) return null;

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (value?.seconds) {
    const seconds = Number(value.seconds);
    return Number.isFinite(seconds) ? seconds * 1000 : null;
  }

  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function getLogSeasonTimestamp(log) {
  return (
    getTimestampFromValue(log?.createdAt) ||
    getTimestampFromValue(log?.savedAt) ||
    getTimestampFromValue(log?.dateTime) ||
    getTimestampFromValue(log?.huntDate) ||
    Date.now()
  );
}

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

function getDogAgeLabel(dog) {
  const birthday = dog?.birthday?.trim?.();

  if (!birthday) {
    return dog?.age ? `${dog.age} years old` : "Age not added";
  }

  const birthDate = new Date(birthday);

  if (Number.isNaN(birthDate.getTime())) {
    return dog?.age ? `${dog.age} years old` : "Age not added";
  }

  const now = new Date();
  let years = now.getFullYear() - birthDate.getFullYear();
  const monthDiff = now.getMonth() - birthDate.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birthDate.getDate())) {
    years -= 1;
  }

  if (years <= 0) return "Under 1 year old";
  if (years === 1) return "1 year old";

  return `${years} years old`;
}

function getDogStats(dog, logs = []) {
  const targetDogId = String(dog?.id || "");

  return logs.reduce(
    (totals, log) => {
      const statsList = Array.isArray(log?.dogStatsList)
        ? log.dogStatsList
        : log?.dogStats?.dogUsed
          ? [log.dogStats]
          : [];

      const dogEntries = statsList.filter((stats) => {
        return (
          stats?.dogUsed !== false &&
          String(stats?.dogId || "") === targetDogId
        );
      });

      if (!dogEntries.length) return totals;

      const mergedForThisLog = dogEntries.reduce(
        (sum, stats) => {
          sum.duckRetrieves += Number(stats.duckRetrieves || 0);
          sum.gooseRetrieves += Number(stats.gooseRetrieves || 0);
          sum.crippleRetrieves += Number(stats.crippleRetrieves || 0);
          sum.blindRetrieves += Number(stats.blindRetrieves || 0);
          sum.markedRetrieves += Number(stats.markedRetrieves || 0);
          sum.waterRetrieves += Number(stats.waterRetrieves || 0);
          sum.landRetrieves += Number(stats.landRetrieves || 0);
          sum.longRetrieveYards = Math.max(
            sum.longRetrieveYards,
            Number(stats.longRetrieveYards || 0)
          );

          return sum;
        },
        {
          duckRetrieves: 0,
          gooseRetrieves: 0,
          crippleRetrieves: 0,
          blindRetrieves: 0,
          markedRetrieves: 0,
          waterRetrieves: 0,
          landRetrieves: 0,
          longRetrieveYards: 0,
        }
      );

      totals.huntsLogged += 1;
      totals.duckRetrieves += mergedForThisLog.duckRetrieves;
      totals.gooseRetrieves += mergedForThisLog.gooseRetrieves;
      totals.crippleRetrieves += mergedForThisLog.crippleRetrieves;
      totals.blindRetrieves += mergedForThisLog.blindRetrieves;
      totals.markedRetrieves += mergedForThisLog.markedRetrieves;
      totals.waterRetrieves += mergedForThisLog.waterRetrieves;
      totals.landRetrieves += mergedForThisLog.landRetrieves;
      totals.longRetrieveYards = Math.max(
        totals.longRetrieveYards,
        mergedForThisLog.longRetrieveYards
      );

      totals.birdsRecovered =
  totals.duckRetrieves +
  totals.gooseRetrieves +
  totals.crippleRetrieves +
  totals.blindRetrieves +
  totals.markedRetrieves +
  totals.waterRetrieves +
  totals.landRetrieves;

      return totals;
    },
    {
      huntsLogged: 0,
      birdsRecovered: 0,
      duckRetrieves: 0,
      gooseRetrieves: 0,
      crippleRetrieves: 0,
      blindRetrieves: 0,
      markedRetrieves: 0,
      waterRetrieves: 0,
      landRetrieves: 0,
      longRetrieveYards: 0,
    }
  );
}

function StatBox({ label, value }) {
  return (
    <View style={s.statBox}>
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

export default function DogScreen({ dogs = [], setDogs, logs = [] }) {
  const navigation = useNavigation();
  const { user } = useAuth();

  const [modalVisible, setModalVisible] = useState(false);
  const [editingDogId, setEditingDogId] = useState(null);
  const [dogName, setDogName] = useState("");
  const [dogBreed, setDogBreed] = useState("");
  const [dogBirthday, setDogBirthday] = useState("");
  const [dogAge, setDogAge] = useState("");
  const [dogSex, setDogSex] = useState("");
  const [dogNotes, setDogNotes] = useState("");
  const [dogPhotoUri, setDogPhotoUri] = useState(null);
  const [savingDog, setSavingDog] = useState(false);
const [seasonState, setSeasonState] = useState(createDefaultSeasonState());

  const activeDogs = useMemo(
    () => dogs.filter((dog) => dog && !dog.deletedAt && dog.active !== false),
    [dogs]
  );

  useEffect(() => {
  let mounted = true;

  async function loadSeasonState() {
    try {
      const raw = await AsyncStorage.getItem(HISTORY_SEASON_STATE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;

      if (mounted) {
        setSeasonState(normalizeSeasonState(parsed));
      }
    } catch {
      if (mounted) {
        setSeasonState(createDefaultSeasonState());
      }
    }
  }

  loadSeasonState();

  const unsubscribe = navigation.addListener?.("focus", loadSeasonState);

  return () => {
    mounted = false;
    if (typeof unsubscribe === "function") unsubscribe();
  };
}, [navigation]);

const currentSeasonDogLogs = useMemo(() => {
  const currentSeasonStart = Number(
    seasonState.currentSeasonStart || getDefaultSeasonStartTimestamp()
  );

  return logs.filter((log) => {
    if (!log || log.itemKind === "archivedPin") return false;
    return getLogSeasonTimestamp(log) >= currentSeasonStart;
  });
}, [logs, seasonState.currentSeasonStart]);

  function resetForm() {
    setEditingDogId(null);
    setDogName("");
    setDogBreed("");
    setDogBirthday("");
    setDogAge("");
    setDogSex("");
    setDogNotes("");
    setDogPhotoUri(null);
    setSavingDog(false);
  }

  function openAddDog() {
    resetForm();
    setModalVisible(true);
  }

  function openEditDog(dog) {
    setEditingDogId(dog.id);
    setDogName(dog.name || "");
    setDogBreed(dog.breed || "");
    setDogBirthday(dog.birthday || "");
    setDogAge(dog.age || "");
    setDogSex(dog.sex || "");
    setDogNotes(dog.notes || "");
    setDogPhotoUri(getDogPhoto(dog));
    setModalVisible(true);
  }

  async function pickDogPhoto() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!perm.granted) {
      Alert.alert("Photos Needed", "Allow photo access to add your dog's picture.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      allowsEditing: true,
      aspect: [1, 1],
    });

    if (result.canceled || !result.assets?.length) return;

    setDogPhotoUri(result.assets[0].uri);
  }

  async function saveDog() {
    if (savingDog) return;

    const name = dogName.trim();

    if (!name) {
      Alert.alert("Dog Name Needed", "Add your hunting dog's name first.");
      return;
    }

    setSavingDog(true);

    const now = Date.now();
    const dogId = editingDogId || `dog-${now}`;

    let finalPhotoUri = dogPhotoUri || null;

    try {
      if (user?.uid && finalPhotoUri) {
        finalPhotoUri = await uploadDogPhotoToFirebase({
          uid: user.uid,
          dogId,
          sourceUri: finalPhotoUri,
        });
      }
    } catch (err) {
      console.warn("DuckSmart dog photo upload failed:", err?.message || err);
    }

    const existingDog = dogs.find((dog) => dog.id === dogId);

    const dogPayload = {
      id: dogId,
      name,
      breed: dogBreed.trim(),
      birthday: dogBirthday.trim(),
      age: dogAge.trim(),
      sex: dogSex.trim(),
      notes: dogNotes.trim(),
      photoUri: finalPhotoUri,
      photoUrl: finalPhotoUri,
      photoURL: finalPhotoUri,
      active: true,
      deletedAt: null,
      createdAt: existingDog?.createdAt || now,
      updatedAt: now,
    };

    try {
      if (user?.uid) {
        await saveDogToFirebase(user.uid, dogPayload);
      }
    } catch (err) {
      console.warn("DuckSmart dog profile cloud save failed:", err?.message || err);
      Alert.alert(
        "Saved Locally",
        "Your dog was saved on this device, but Firebase backup failed. Check rules if this keeps happening."
      );
    }

    if (typeof setDogs === "function") {
      setDogs((prev) => {
        const exists = prev.some((dog) => dog.id === dogPayload.id);

        if (exists) {
          return prev.map((dog) => (dog.id === dogPayload.id ? dogPayload : dog));
        }

        return [dogPayload, ...prev];
      });
    }

    setModalVisible(false);
    resetForm();
  }

  function deleteDog(dog) {
    Alert.alert("Remove Dog?", `Remove ${dog.name} from your active hunting dog list?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          const removedDog = {
            ...dog,
            active: false,
            deletedAt: Date.now(),
            updatedAt: Date.now(),
          };

          try {
            if (user?.uid) {
              await saveDogToFirebase(user.uid, removedDog);
            }
          } catch (err) {
            console.warn("DuckSmart dog remove cloud save failed:", err?.message || err);
          }

          if (typeof setDogs === "function") {
            setDogs((prev) =>
              prev.map((item) => (item.id === dog.id ? removedDog : item))
            );
          }
        },
      },
    ]);
  }

  return (
    <ScreenBackground source={ASSETS?.backgrounds?.log || ASSETS?.backgrounds?.today}>
      <View pointerEvents="none" style={s.darkOverlay} />

      <SafeAreaView edges={["top", "left", "right"]} style={s.safe}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={s.container}
        >
          <View style={s.headerRow}>
            <Pressable onPress={() => navigation.goBack()} style={s.headerSideBtn}>
              <Text style={s.headerSideBtnText}>✕</Text>
            </Pressable>

            <Text style={s.headerTitle}>DOG PORTAL</Text>

            <Pressable onPress={openAddDog} style={s.headerAddBtn}>
              <Text style={s.headerAddText}>＋</Text>
            </Pressable>
          </View>

          <View style={s.heroCard}>
            <Text style={s.heroKicker}>HUNTING DOGS</Text>
            <Text style={s.heroTitle}>Track retrieves, hunt history, and dog work.</Text>
            <Text style={s.heroSub}>
              Add your dog here, then use the Dog Helper on Hunt Logs to track birds recovered.
            </Text>

            {activeDogs.length === 0 ? (
              <Pressable style={s.primaryBtn} onPress={openAddDog}>
                <Text style={s.primaryBtnText}>Add Hunting Dog</Text>
              </Pressable>
            ) : null}
          </View>

          {activeDogs.length === 0 ? (
            <View style={s.emptyCard}>
              <Text style={s.emptyIcon}>🐾</Text>
              <Text style={s.emptyTitle}>No hunting dogs added yet.</Text>
              <Text style={s.emptyText}>
                Add a dog to unlock dog retrieve tracking inside Hunt Logs.
              </Text>
            </View>
          ) : null}

          {activeDogs.map((dog) => {
            const stats = getDogStats(dog, currentSeasonDogLogs);
            const dogPhoto = getDogPhoto(dog);
            const birdsRecovered = Number(stats.birdsRecovered || 0);

            return (
              <Pressable key={dog.id} style={s.dogCard} onPress={() => openEditDog(dog)}>
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
                      {dog.name}
                    </Text>

                    <Text style={s.dogMeta} numberOfLines={1}>
                      {[dog.breed || "Breed not added", getDogAgeLabel(dog)]
                        .filter(Boolean)
                        .join(" • ")}
                    </Text>

                    {dog.sex ? <Text style={s.dogSub}>{dog.sex}</Text> : null}
                  </View>

                  <Text style={s.chevron}>›</Text>
                </View>

                <View style={s.bigStatRow}>
                  <Text style={s.bigStatLabel}>Birds Recovered</Text>
                  <Text style={s.bigStatValue}>{birdsRecovered}</Text>
                </View>

                <View style={s.statsGrid}>
                  <StatBox label="Hunts" value={stats.huntsLogged} />
                  <StatBox label="Ducks" value={stats.duckRetrieves} />
                  <StatBox label="Geese" value={stats.gooseRetrieves} />
                  <StatBox label="Cripples" value={stats.crippleRetrieves} />
                </View>

                <View style={s.statsGrid}>
                  <StatBox label="Blind" value={stats.blindRetrieves} />
                  <StatBox label="Marked" value={stats.markedRetrieves} />
                  <StatBox label="Water" value={stats.waterRetrieves} />
                  <StatBox label="Land" value={stats.landRetrieves} />
                </View>

                <View style={s.statsGrid}>
                  <StatBox label="Longest" value={`${stats.longRetrieveYards || 0} yd`} />
                </View>

                {dog.notes ? (
                  <Text style={s.dogNotes} numberOfLines={3}>
                    {dog.notes}
                  </Text>
                ) : null}

                <View style={s.removeDogTextWrap}>
                  <Pressable
                    onPress={() => deleteDog(dog)}
                    hitSlop={{ top: 12, bottom: 12, left: 18, right: 18 }}
                  >
                    <Text style={s.removeDogText}>Remove Dog</Text>
                  </Pressable>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>

        <Modal
          visible={modalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => {
            if (!savingDog) setModalVisible(false);
          }}
        >
          <KeyboardAvoidingView
            style={s.modalBackdrop}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            keyboardVerticalOffset={Platform.OS === "ios" ? 24 : 0}
          >
            <View style={s.modalCard}>
              <View style={s.modalHeader}>
                <Text style={s.modalTitle}>
                  {editingDogId ? "Edit Hunting Dog" : "Add Hunting Dog"}
                </Text>

                <Pressable
                  onPress={() => {
                    if (!savingDog) setModalVisible(false);
                  }}
                  style={s.modalCloseBtn}
                  disabled={savingDog}
                >
                  <Text style={s.modalCloseText}>✕</Text>
                </Pressable>
              </View>

              <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={s.modalScrollContent}
              >
                <Pressable style={s.photoPicker} onPress={pickDogPhoto} disabled={savingDog}>
                  {dogPhotoUri ? (
                    <Image source={{ uri: dogPhotoUri }} style={s.photoPickerImage} resizeMode="cover" />
                  ) : (
                    <>
                      <Text style={s.photoPickerIcon}>🐾</Text>
                      <Text style={s.photoPickerText}>Add Dog Photo</Text>
                    </>
                  )}
                </Pressable>

                <Text style={s.label}>Dog Name</Text>
                <TextInput
                  value={dogName}
                  onChangeText={setDogName}
                  placeholder="Example: Drake"
                  placeholderTextColor="rgba(255,255,255,0.30)"
                  style={s.input}
                  editable={!savingDog}
                />

                <Text style={s.label}>Breed Optional</Text>
                <TextInput
                  value={dogBreed}
                  onChangeText={setDogBreed}
                  placeholder="Lab, Chesapeake, Boykin..."
                  placeholderTextColor="rgba(255,255,255,0.30)"
                  style={s.input}
                  editable={!savingDog}
                />

                <Text style={s.label}>Birthday Optional</Text>
                <TextInput
                  value={dogBirthday}
                  onChangeText={setDogBirthday}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="rgba(255,255,255,0.30)"
                  style={s.input}
                  editable={!savingDog}
                />

                <Text style={s.label}>Age Optional</Text>
                <TextInput
                  value={dogAge}
                  onChangeText={setDogAge}
                  placeholder="Example: 4"
                  placeholderTextColor="rgba(255,255,255,0.30)"
                  keyboardType="numeric"
                  style={s.input}
                  editable={!savingDog}
                />

                <Text style={s.label}>Sex Optional</Text>
                <TextInput
                  value={dogSex}
                  onChangeText={setDogSex}
                  placeholder="Male / Female"
                  placeholderTextColor="rgba(255,255,255,0.30)"
                  style={s.input}
                  editable={!savingDog}
                />

                <Text style={s.label}>Notes</Text>
                <TextInput
                  value={dogNotes}
                  onChangeText={setDogNotes}
                  placeholder="Strengths, handling notes, blind work, water work..."
                  placeholderTextColor="rgba(255,255,255,0.30)"
                  style={[s.input, s.textArea]}
                  multiline
                  editable={!savingDog}
                />

                <View style={s.modalButtonRow}>
                  <Pressable
                    style={[s.secondaryBtn, savingDog ? s.disabledBtn : null]}
                    onPress={() => setModalVisible(false)}
                    disabled={savingDog}
                  >
                    <Text style={s.secondaryBtnText}>Cancel</Text>
                  </Pressable>

                  <Pressable
                    style={[s.primarySmallBtn, savingDog ? s.disabledBtn : null]}
                    onPress={saveDog}
                    disabled={savingDog}
                  >
                    {savingDog ? (
                      <ActivityIndicator color={HUNT_BROWN} />
                    ) : (
                      <Text style={s.primarySmallBtnText}>Save Dog</Text>
                    )}
                  </Pressable>
                </View>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </SafeAreaView>
    </ScreenBackground>
  );
}

const s = StyleSheet.create({
  safe: {
    flex: 1,
  },
  darkOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.72)",
  },
  container: {
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: Platform.OS === "android" ? 110 : 64,
  },
  headerRow: {
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  headerSideBtn: {
    width: 42,
    height: 42,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  headerSideBtnText: {
    color: COLORS.white,
    fontSize: 23,
    fontWeight: "800",
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    color: COLORS.white,
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: 0.2,
  },
  headerAddBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: HUNT_GOLD,
    alignItems: "center",
    justifyContent: "center",
  },
  headerAddText: {
    color: HUNT_BROWN,
    fontSize: 26,
    fontWeight: "900",
    marginTop: -2,
  },
  heroCard: {
    borderRadius: 20,
    backgroundColor: HUNT_BROWN_CARD,
    borderWidth: 1,
    borderColor: HUNT_BORDER,
    padding: 14,
    marginBottom: 10,
  },
  heroKicker: {
    color: HUNT_GOLD,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
  heroTitle: {
    color: COLORS.white,
    fontSize: 22,
    fontWeight: "900",
    lineHeight: 27,
    marginTop: 5,
  },
  heroSub: {
    color: HUNT_MUTED,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 19,
    marginTop: 7,
  },
  primaryBtn: {
    marginTop: 13,
    height: 48,
    borderRadius: 15,
    backgroundColor: HUNT_GOLD,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: {
    color: HUNT_BROWN,
    fontSize: 14,
    fontWeight: "900",
  },
  emptyCard: {
    borderRadius: 20,
    backgroundColor: HUNT_BROWN_CARD,
    borderWidth: 1,
    borderColor: HUNT_BORDER,
    padding: 18,
    alignItems: "center",
  },
  emptyIcon: {
    fontSize: 36,
    marginBottom: 8,
  },
  emptyTitle: {
    color: COLORS.white,
    fontSize: 17,
    fontWeight: "900",
  },
  emptyText: {
    color: HUNT_MUTED,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 19,
    textAlign: "center",
    marginTop: 6,
  },
  dogCard: {
    borderRadius: 20,
    backgroundColor: HUNT_BROWN_CARD_2,
    borderWidth: 1,
    borderColor: HUNT_BORDER,
    padding: 12,
    marginBottom: 10,
  },
  dogTopRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  dogPhoto: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.05)",
    marginRight: 11,
  },
  dogPhotoFallback: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: "rgba(217,168,76,0.12)",
    borderWidth: 1,
    borderColor: HUNT_BORDER,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 11,
  },
  dogPhotoFallbackText: {
    fontSize: 30,
  },
  dogName: {
    color: COLORS.white,
    fontSize: 19,
    fontWeight: "900",
  },
  dogMeta: {
    color: HUNT_MUTED,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 4,
  },
  dogSub: {
    color: HUNT_TEXT_SOFT,
    fontSize: 11,
    fontWeight: "700",
    marginTop: 3,
  },
  chevron: {
    color: HUNT_GOLD,
    fontSize: 28,
    fontWeight: "900",
    marginLeft: 8,
  },
  bigStatRow: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(217,168,76,0.14)",
    paddingTop: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  bigStatLabel: {
    color: HUNT_MUTED,
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  bigStatValue: {
    color: HUNT_GOLD,
    fontSize: 34,
    fontWeight: "900",
  },
  statsGrid: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
  },
  statBox: {
    flex: 1,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    paddingVertical: 10,
    alignItems: "center",
  },
  statValue: {
    color: COLORS.white,
    fontSize: 19,
    fontWeight: "900",
  },
  statLabel: {
    color: HUNT_TEXT_SOFT,
    fontSize: 10,
    fontWeight: "900",
    marginTop: 3,
    textTransform: "uppercase",
  },
  dogNotes: {
    color: HUNT_MUTED,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
    marginTop: 10,
  },
  removeDogTextWrap: {
    marginTop: 28,
    paddingTop: 4,
    paddingBottom: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  removeDogText: {
    color: RED,
    fontSize: 12,
    fontWeight: "900",
    textAlign: "center",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.72)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  modalCard: {
    width: "100%",
    maxHeight: "88%",
    borderRadius: 20,
    backgroundColor: HUNT_BROWN_CARD_2,
    borderWidth: 1,
    borderColor: HUNT_BORDER,
    padding: 12,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
    marginBottom: 10,
  },
  modalTitle: {
    color: COLORS.white,
    fontSize: 18,
    fontWeight: "900",
  },
  modalCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  modalCloseText: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: "900",
  },
  modalScrollContent: {
    paddingBottom: Platform.OS === "ios" ? 130 : 160,
  },
  photoPicker: {
    height: 128,
    borderRadius: 18,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: HUNT_BORDER,
    backgroundColor: "rgba(255,255,255,0.04)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  photoPickerImage: {
    width: "100%",
    height: "100%",
  },
  photoPickerIcon: {
    fontSize: 34,
  },
  photoPickerText: {
    color: HUNT_MUTED,
    fontSize: 13,
    fontWeight: "900",
    marginTop: 7,
  },
  label: {
    color: HUNT_MUTED,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.5,
    marginTop: 12,
    marginBottom: 7,
    textTransform: "uppercase",
  },
  input: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.04)",
    color: COLORS.white,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    fontWeight: "700",
  },
  textArea: {
    minHeight: 90,
    textAlignVertical: "top",
  },
  modalButtonRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
    marginBottom: 4,
  },
  secondaryBtn: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryBtnText: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: "800",
  },
  primarySmallBtn: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    backgroundColor: HUNT_GOLD,
    alignItems: "center",
    justifyContent: "center",
  },
  primarySmallBtnText: {
    color: HUNT_BROWN,
    fontSize: 14,
    fontWeight: "900",
  },
  disabledBtn: {
    opacity: 0.55,
  },
});