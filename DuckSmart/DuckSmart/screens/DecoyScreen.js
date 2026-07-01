// /Users/gozyr/Development/ducksmart/DuckSmart/DuckSmart/screens/DecoyScreen.js

import React, { useMemo, useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  StatusBar,
  Alert,
  Modal,
  Image,
  ActivityIndicator,
  ImageBackground,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import Svg, { Circle, Text as SvgText } from "react-native-svg";

import { COLORS } from "../constants/theme";
import { ASSETS } from "../constants/assets";
import {
  WATER_TYPES,
  WEATHER_OPTIONS,
  SEASON_OPTIONS,
  PRESSURE_OPTIONS,
  SPECIES_OPTIONS,
  recommendSpread,
} from "../data/decoySpreadData";
import { usePremium } from "../context/PremiumContext";
import { analyzeSpread as aiAnalyzeSpread, isAIAvailable } from "../services/ai";
import { showInterstitialAd } from "../services/ads";
import ProUpgradePrompt from "../components/ProUpgradePrompt";
import ScreenBackground from "../components/ScreenBackground";
import InAppSponsorAd from "../components/InAppSponsorAd";

const FREE_SPREAD_LIMIT = 2;

const GOLD = "#D9A84C";
const GREEN = "#39D96A";
const RED = "#FF4D4D";
const BG = "#05090A";
const CARD = "rgba(13,18,19,0.94)";
const CARD_SOFT = "rgba(255,255,255,0.045)";
const BORDER = "rgba(255,255,255,0.08)";
const GOLD_BORDER = "rgba(217,168,76,0.34)";
const MUTED = "rgba(255,255,255,0.62)";
const MUTED_DARK = "rgba(255,255,255,0.42)";

function DecoyCard({ title, right, children, style }) {
  return (
    <View style={[s.card, style]}>
      {title || right ? (
        <View style={s.cardHeader}>
          {title ? <Text style={s.cardTitle}>{title}</Text> : <View />}
          {right ? <View>{right}</View> : null}
        </View>
      ) : null}

      <View style={title || right ? s.cardBody : null}>{children}</View>
    </View>
  );
}

function DecoyChip({ label, selected, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={[s.chip, selected ? s.chipSelected : s.chipUnselected]}
    >
      <Text style={[s.chipText, selected ? s.chipTextSelected : null]}>
        {label}
      </Text>
    </Pressable>
  );
}

function PickerRow({ label, options, value, onChange }) {
  return (
    <View style={s.pickerSection}>
      <Text style={s.pickerLabel}>{label}</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={s.chipRow}>
          {options.map((opt) => (
            <DecoyChip
              key={opt}
              label={opt}
              selected={opt === value}
              onPress={() => onChange(opt)}
            />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function ConditionTile({ icon, label, value }) {
  return (
    <View style={s.conditionTile}>
      <Text style={s.conditionIcon}>{icon}</Text>
      <Text style={s.conditionLabel}>{label}</Text>
      <Text style={s.conditionValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function DetailColumn({ label, value }) {
  return (
    <View style={s.detailColumn}>
      <Text style={s.detailLabel}>{label}</Text>
      <Text style={s.detailValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function ScoreRing({ score = 0, size = 110 }) {
  const safeScore = Math.max(0, Math.min(100, Math.round(Number(score) || 0)));
  const stroke = 9;
  const radius = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = circumference * (safeScore / 100);
  const scoreColor = safeScore >= 70 ? GREEN : safeScore >= 45 ? GOLD : RED;

  return (
    <View style={s.scoreRingWrap}>
      <Svg width={size} height={size}>
        <Circle
          cx={cx}
          cy={cy}
          r={radius}
          stroke="rgba(255,255,255,0.10)"
          strokeWidth={stroke}
          fill="none"
        />
        <Circle
          cx={cx}
          cy={cy}
          r={radius}
          stroke={scoreColor}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${progress} ${circumference}`}
          rotation="-90"
          origin={`${cx}, ${cy}`}
        />
        <SvgText
          x={cx}
          y={cy + 10}
          fill="#FFFFFF"
          fontSize="32"
          fontWeight="900"
          textAnchor="middle"
        >
          {safeScore}
        </SvgText>
      </Svg>
    </View>
  );
}

function SpreadImageModal({ visible, onClose, spread }) {
  if (!spread) return null;

  const img = ASSETS.decoys?.[spread.key];

  return (
    <Modal visible={visible} transparent={false} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={s.modalSafe}>
        <ScrollView contentContainerStyle={s.modalScroll} showsVerticalScrollIndicator={false}>
          <View style={s.modalTopBar}>
            <Pressable style={s.modalBackBtn} onPress={onClose}>
              <Text style={s.modalBackText}>‹</Text>
            </Pressable>

            <View style={{ flex: 1 }}>
              <Text style={s.modalTitle}>{spread.name}</Text>
              <Text style={s.modalSubtitle}>{spread.type}</Text>
            </View>

            <Pressable style={s.modalXBtn} onPress={onClose}>
              <Text style={s.modalXBtnText}>✕</Text>
            </Pressable>
          </View>

          {img ? (
            <Image source={img} style={s.modalImage} resizeMode="contain" />
          ) : (
            <View style={s.modalImagePlaceholder}>
              <Text style={s.modalImagePlaceholderText}>Image not available</Text>
            </View>
          )}

          <View style={s.modalInfoRow}>
            <View style={s.modalInfoPill}>
              <Text style={s.modalInfoLabel}>Decoys</Text>
              <Text style={s.modalInfoValue}>{spread.decoyCount}</Text>
            </View>

            <View style={s.modalInfoPill}>
              <Text style={s.modalInfoLabel}>Calling</Text>
              <Text style={s.modalInfoValue}>{spread.calling}</Text>
            </View>

            <View style={s.modalInfoPill}>
              <Text style={s.modalInfoLabel}>Best Time</Text>
              <Text style={s.modalInfoValue}>{spread.bestTime}</Text>
            </View>
          </View>

          <Text style={s.modalNotes}>{spread.notes}</Text>

          <View style={s.modalMistakeBox}>
            <Text style={s.modalMistakeLabel}>Common Mistake</Text>
            <Text style={s.modalMistakeText}>{spread.mistakes}</Text>
          </View>

          <Pressable style={s.modalCloseBtn} onPress={onClose}>
            <Text style={s.modalCloseBtnText}>Close</Text>
          </Pressable>

          <View style={{ height: 24 }} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function SpreadOverview({ spread, water, weather }) {
  const img = spread ? ASSETS.decoys?.[spread.key] : null;

  return (
    <View style={s.overviewWrap}>
      <View style={s.overviewImageWrap}>
        {img ? (
          <Image source={img} style={s.overviewImage} resizeMode="cover" />
        ) : (
          <ImageBackground
            source={ASSETS.backgrounds.map || ASSETS.backgrounds.today}
            style={s.overviewImage}
            imageStyle={s.overviewImageBg}
          >
            <View style={s.fakeWaterOverlay} />
            <View style={s.blindMarker}>
              <Text style={s.blindEmoji}>▴</Text>
              <Text style={s.blindText}>BLIND</Text>
            </View>
          </ImageBackground>
        )}

        <View style={s.overviewDarkener} />

        <View style={s.windBadge}>
          <Text style={s.windBadgeArrow}>↗</Text>
          <View>
            <Text style={s.windBadgeLabel}>WIND</Text>
            <Text style={s.windBadgeValue}>{weather}</Text>
          </View>
        </View>

        <View style={s.overviewFooterBadge}>
          <Text style={s.overviewFooterText}>{water}</Text>
        </View>
      </View>
    </View>
  );
}

export default function DecoyScreen({
  navigation,
  onLogout,
  pins = [],
  setPins,
}) {
  const { isPro, loading: premiumLoading, purchase } = usePremium();

  const [dWater, setDWater] = useState(WATER_TYPES[0]);
  const [dWeather, setDWeather] = useState(WEATHER_OPTIONS[0]);
  const [dSeason, setDSeason] = useState(SEASON_OPTIONS[0]);
  const [dPressure, setDPressure] = useState(PRESSURE_OPTIONS[0]);
  const [dSpecies, setDSpecies] = useState(SPECIES_OPTIONS[0]);
  const [spreadModal, setSpreadModal] = useState(null);
  const [savePinModalVisible, setSavePinModalVisible] = useState(false);
  const [savedSpreadsModalVisible, setSavedSpreadsModalVisible] = useState(false);
  const [locationJournalModalVisible, setLocationJournalModalVisible] = useState(false);
  const [selectedJournalPinId, setSelectedJournalPinId] = useState(null);
  const [editingSpreadEntryId, setEditingSpreadEntryId] = useState(null);
  const [spreadNoteDrafts, setSpreadNoteDrafts] = useState({});

  const [aiSpreadPhoto, setAiSpreadPhoto] = useState(null);
  const [aiSpreadResult, setAiSpreadResult] = useState(null);
  const [aiSpreadLoading, setAiSpreadLoading] = useState(false);
  const [aiSpreadModalVisible, setAiSpreadModalVisible] = useState(false);

  const recommendation = useMemo(
    () =>
      recommendSpread({
        waterType: dWater,
        weather: dWeather,
        season: dSeason,
        pressure: dPressure,
        species: dSpecies,
      }),
    [dWater, dWeather, dSeason, dPressure, dSpecies]
  );

  const primary = recommendation.primary;
  const addon = recommendation.addon;
  const allRecommendations = recommendation.all || [];

  function getSpreadEntries(pin) {
    const list = [];

    if (Array.isArray(pin?.decoySpreadPlans)) {
      pin.decoySpreadPlans.forEach((plan) => {
        if (plan?.primarySpread) {
          list.push(plan);
        }
      });
    }

    if (
      pin?.decoySpreadPlan?.primarySpread &&
      !list.some(
        (plan) =>
          String(plan?.id || plan?.savedAt) ===
          String(pin.decoySpreadPlan?.id || pin.decoySpreadPlan?.savedAt)
      )
    ) {
      list.push(pin.decoySpreadPlan);
    }

    return list.sort((a, b) => Number(b?.savedAt || 0) - Number(a?.savedAt || 0));
  }

  function getSpreadEntryKey(plan, index) {
    return String(plan?.id || plan?.savedAt || index);
  }

  function getDraftKey(pin, plan, index) {
    return `${pin?.id || "pin"}-${getSpreadEntryKey(plan, index)}`;
  }

  function formatSavedDate(ts) {
    if (!ts) return "Saved spread";

    try {
      return new Date(ts).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch (err) {
      return "Saved spread";
    }
  }

  const savedSpreadPins = useMemo(
    () =>
      Array.isArray(pins)
        ? pins.filter((pin) => getSpreadEntries(pin).length > 0)
        : [],
    [pins]
  );

  const selectedJournalPin = useMemo(() => {
    if (!selectedJournalPinId) return null;
    return pins.find((pin) => pin.id === selectedJournalPinId) || null;
  }, [pins, selectedJournalPinId]);

  const selectedJournalEntries = getSpreadEntries(selectedJournalPin);

  useEffect(() => {
  return () => {
    if (!premiumLoading && !isPro) {
      showInterstitialAd({ isPro, premiumLoading });
    }
  };
}, [isPro, premiumLoading]);

  async function handleAISpreadAnalyzer(useCamera) {
    if (!isPro) {
      Alert.alert("Pro Feature", "AI Spread Analyzer requires DuckSmart Pro.", [
        { text: "Not Now", style: "cancel" },
        { text: "Upgrade to Pro", onPress: purchase },
      ]);
      return;
    }

    if (!isAIAvailable()) {
      Alert.alert(
        "Not Configured",
        "AI features require an OpenAI API key. Add it in app.json → extra → openaiApiKey."
      );
      return;
    }

    try {
      let result;

      if (useCamera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();

        if (!perm.granted) {
          Alert.alert("Permission Needed", "Camera access is required.");
          return;
        }

        result = await ImagePicker.launchCameraAsync({
          quality: 0.7,
          allowsEditing: true,
        });
      } else {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();

        if (!perm.granted) {
          Alert.alert("Permission Needed", "Photo library access is required.");
          return;
        }

        result = await ImagePicker.launchImageLibraryAsync({
          quality: 0.7,
          allowsEditing: true,
        });
      }

      if (result.canceled || !result.assets?.length) return;

      const uri = result.assets[0].uri;

      setAiSpreadPhoto(uri);
      setAiSpreadResult(null);
      setAiSpreadLoading(true);
      setAiSpreadModalVisible(true);

      const analysis = await aiAnalyzeSpread(uri, null);
      setAiSpreadResult(analysis);
    } catch (err) {
      Alert.alert("AI Error", err.message || "Could not analyze the spread. Please try again.");
      setAiSpreadModalVisible(false);
    } finally {
      setAiSpreadLoading(false);
    }
  }

  function promptAISpreadAnalyzer() {
    Alert.alert("AI Spread Analyzer", "Take a photo of your decoy spread or choose from gallery.", [
      { text: "Camera", onPress: () => handleAISpreadAnalyzer(true) },
      { text: "Gallery", onPress: () => handleAISpreadAnalyzer(false) },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  function handleBackPress() {
    if (navigation?.canGoBack?.()) {
      navigation.goBack();
      return;
    }

    if (onLogout) {
      onLogout();
    }
  }

  function buildSpreadPlan(note = "", existingId = null, existingSavedAt = null) {
    if (!primary) return null;

    const now = Date.now();

    return {
      id: existingId || `${now}-${Math.random().toString(36).slice(2, 8)}`,
      savedAt: existingSavedAt || now,
      updatedAt: now,
      note: note || "",
      waterType: dWater,
      weather: dWeather,
      season: dSeason,
      pressure: dPressure,
      species: dSpecies,
      primarySpread: {
        key: primary.key,
        name: primary.name,
        type: primary.type,
        decoyCount: primary.decoyCount,
        calling: primary.calling,
        bestTime: primary.bestTime,
        notes: primary.notes,
        mistakes: primary.mistakes,
        score: primary.score,
        detail: primary.detail || null,
      },
      addonSpread: addon
        ? {
            key: addon.key,
            name: addon.name,
            type: addon.type,
            decoyCount: addon.decoyCount,
            calling: addon.calling,
            bestTime: addon.bestTime,
            notes: addon.notes,
            mistakes: addon.mistakes,
            score: addon.score,
            detail: addon.detail || null,
          }
        : null,
    };
  }

  function updatePinSpreadEntries(pin, updater) {
    if (!pin || !setPins) {
      Alert.alert(
        "Pins Not Connected",
        "This screen needs pins and setPins passed from App.js before it can update saved spreads."
      );
      return;
    }

    setPins((prev) =>
      prev.map((p) => {
        if (p.id !== pin.id) return p;

        const currentEntries = getSpreadEntries(p);
        const nextEntries = updater(currentEntries)
          .filter((entry) => entry?.primarySpread)
          .sort((a, b) => Number(b?.savedAt || 0) - Number(a?.savedAt || 0));

        return {
          ...p,
          decoySpreadPlans: nextEntries,
          decoySpreadPlan: nextEntries[0] || null,
          updatedAt: Date.now(),
        };
      })
    );
  }

  function openLocationJournal(pin) {
    if (!pin) return;

    setSelectedJournalPinId(pin.id);
    setEditingSpreadEntryId(null);
    setSavedSpreadsModalVisible(false);
    setLocationJournalModalVisible(true);
  }

  function closeLocationJournal() {
    setLocationJournalModalVisible(false);
    setEditingSpreadEntryId(null);
  }

  function openSavedSpreadFromPlan(plan) {
    const savedSpread = plan?.primarySpread;

    if (!savedSpread) return;

    closeLocationJournal();
    setSpreadModal(savedSpread);
  }

  function beginEditSpreadNote(pin, plan, index) {
    const draftKey = getDraftKey(pin, plan, index);

    setSpreadNoteDrafts((prev) => ({
      ...prev,
      [draftKey]: prev[draftKey] ?? plan?.note ?? "",
    }));

    setEditingSpreadEntryId(draftKey);
  }

  function saveSpreadNote(pin, plan, index) {
    const draftKey = getDraftKey(pin, plan, index);
    const entryKey = getSpreadEntryKey(plan, index);
    const nextNote = spreadNoteDrafts[draftKey] ?? "";

    updatePinSpreadEntries(pin, (entries) =>
      entries.map((entry, i) =>
        getSpreadEntryKey(entry, i) === entryKey
          ? {
              ...entry,
              note: nextNote,
              updatedAt: Date.now(),
            }
          : entry
      )
    );

    setEditingSpreadEntryId(null);
  }

  function replaceSavedSpreadWithCurrent(pin, plan, index) {
    if (!primary) {
      Alert.alert("No Spread Yet", "Choose conditions to generate a spread recommendation first.");
      return;
    }

    const entryKey = getSpreadEntryKey(plan, index);
    const replacement = buildSpreadPlan(
      plan?.note || "",
      plan?.id || null,
      plan?.savedAt || null
    );

    updatePinSpreadEntries(pin, (entries) =>
      entries.map((entry, i) =>
        getSpreadEntryKey(entry, i) === entryKey ? replacement : entry
      )
    );

    Alert.alert("Spread Updated", "This saved spread was updated with your current spread setup.");
  }

  function addCurrentSpreadToJournalPin(pin) {
    if (!primary) {
      Alert.alert("No Spread Yet", "Choose conditions to generate a spread recommendation first.");
      return;
    }

    const spreadPlan = buildSpreadPlan("");

    updatePinSpreadEntries(pin, (entries) => [spreadPlan, ...entries]);

    Alert.alert("Spread Added", `A new spread was added to ${pin.title || "that location"}.`);
  }

  function openPinPickerForSpreadSave() {
    if (!primary) {
      Alert.alert("No Spread Yet", "Choose conditions to generate a spread recommendation.");
      return;
    }

    if (!Array.isArray(pins) || pins.length === 0) {
      Alert.alert("No Pins Yet", "Create a map pin first, then attach this decoy spread to that spot.");
      return;
    }

    if (!setPins) {
      Alert.alert(
        "Pins Not Connected",
        "This screen needs pins and setPins passed from App.js before it can save a spread to a pin."
      );
      return;
    }

    setSavePinModalVisible(true);
  }

  function saveSpreadToPin(pin) {
    if (!pin || !setPins || !primary) return;

    const spreadPlan = buildSpreadPlan("");

    setPins((prev) =>
      prev.map((p) => {
        if (p.id !== pin.id) return p;

        const currentEntries = getSpreadEntries(p);
        const nextEntries = [spreadPlan, ...currentEntries]
          .filter((entry) => entry?.primarySpread)
          .sort((a, b) => Number(b?.savedAt || 0) - Number(a?.savedAt || 0));

        return {
          ...p,
          decoySpreadPlans: nextEntries,
          decoySpreadPlan: spreadPlan,
          updatedAt: Date.now(),
        };
      })
    );

    setSavePinModalVisible(false);

    Alert.alert("Spread Saved", `This decoy spread was added to ${pin.title || "that pin"}.`);
  }

  const bg = ASSETS.backgrounds.decoy || ASSETS.backgrounds.today;
  const primaryScore = primary?.score ?? 0;

  return (
    <ScreenBackground style={s.safe} bg={bg}>
      <View pointerEvents="none" style={s.darkOverlay} />

      <SafeAreaView edges={["top", "left", "right"]} style={{ flex: 1 }}>
        <StatusBar barStyle="light-content" />

        <SpreadImageModal
          visible={!!spreadModal}
          onClose={() => setSpreadModal(null)}
          spread={spreadModal}
        />

        <Modal
          visible={savePinModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setSavePinModalVisible(false)}
        >
          <View style={s.saveModalBackdrop}>
            <View style={s.saveModalCard}>
              <View style={s.saveModalHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={s.saveModalTitle}>SAVE SPREAD TO PIN</Text>
                  <Text style={s.saveModalSub}>
                    Choose an existing map pin to add this decoy spread to.
                  </Text>
                </View>

                <Pressable
                  style={s.saveModalClose}
                  onPress={() => setSavePinModalVisible(false)}
                >
                  <Text style={s.saveModalCloseText}>✕</Text>
                </Pressable>
              </View>

              <ScrollView style={s.savePinList} showsVerticalScrollIndicator={false}>
                {pins.map((pin) => {
                  const savedCount = getSpreadEntries(pin).length;

                  return (
                    <Pressable
                      key={pin.id}
                      style={s.savePinRow}
                      onPress={() => saveSpreadToPin(pin)}
                    >
                      <View style={s.savePinIcon}>
                        <Text style={s.savePinIconText}>📍</Text>
                      </View>

                      <View style={{ flex: 1 }}>
                        <Text style={s.savePinTitle} numberOfLines={1}>
                          {pin.title || "Untitled Pin"}
                        </Text>

                        <Text style={s.savePinMeta} numberOfLines={1}>
                          {pin.type || "Spot"}
                          {savedCount > 0
                            ? ` • ${savedCount} saved spread${savedCount === 1 ? "" : "s"}`
                            : ""}
                        </Text>
                      </View>

                      <Text style={s.savePinChevron}>›</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          </View>
        </Modal>

        <Modal
          visible={savedSpreadsModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setSavedSpreadsModalVisible(false)}
        >
          <View style={s.saveModalBackdrop}>
            <View style={s.saveModalCard}>
              <View style={s.saveModalHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={s.saveModalTitle}>Saved Locations and Spreads</Text>
                  <Text style={s.saveModalSub}>
                    Choose a saved location to view its spread history.
                  </Text>
                </View>

                <Pressable
                  style={s.saveModalClose}
                  onPress={() => setSavedSpreadsModalVisible(false)}
                >
                  <Text style={s.saveModalCloseText}>✕</Text>
                </Pressable>
              </View>

              <ScrollView style={s.savePinList} showsVerticalScrollIndicator={false}>
                {savedSpreadPins.length === 0 ? (
                  <View style={s.noteBox}>
                    <Text style={s.noteTextMuted}>
                      No saved spreads yet. Use the Save button to attach a decoy spread to a map pin.
                    </Text>
                  </View>
                ) : (
                  savedSpreadPins.map((pin) => {
                    const savedCount = getSpreadEntries(pin).length;

                    return (
                      <Pressable
                        key={pin.id}
                        style={s.savePinRow}
                        onPress={() => openLocationJournal(pin)}
                      >
                        <View style={s.savePinIcon}>
                          <Text style={s.savePinIconText}>📍</Text>
                        </View>

                        <View style={{ flex: 1 }}>
                          <Text style={s.savePinTitle} numberOfLines={1}>
                            {pin.title || "Untitled Pin"}
                          </Text>

                          <Text style={s.savePinMeta} numberOfLines={1}>
                            {pin.type || "Spot"} • {savedCount} saved spread
                            {savedCount === 1 ? "" : "s"}
                          </Text>
                        </View>

                        <Text style={s.savePinChevron}>›</Text>
                      </Pressable>
                    );
                  })
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>

        <Modal
          visible={locationJournalModalVisible}
          transparent
          animationType="fade"
          onRequestClose={closeLocationJournal}
        >
          <View style={s.saveModalBackdrop}>
            <View style={s.saveModalCard}>
              <View style={s.saveModalHeader}>
                <Pressable
                  style={s.journalBackBtn}
                  onPress={() => {
                    closeLocationJournal();
                    setSavedSpreadsModalVisible(true);
                  }}
                >
                  <Text style={s.journalBackText}>‹</Text>
                </Pressable>

                <View style={{ flex: 1 }}>
                  <Text style={s.saveModalTitle} numberOfLines={1}>
                    {selectedJournalPin?.title || "Saved Location"}
                  </Text>
                  <Text style={s.saveModalSub} numberOfLines={2}>
                    {selectedJournalPin?.type || "Spot"} • {selectedJournalEntries.length} saved spread
                    {selectedJournalEntries.length === 1 ? "" : "s"}
                  </Text>
                </View>

                <Pressable style={s.saveModalClose} onPress={closeLocationJournal}>
                  <Text style={s.saveModalCloseText}>✕</Text>
                </Pressable>
              </View>

              <Pressable
                style={s.journalAddFullBtn}
                onPress={() => addCurrentSpreadToJournalPin(selectedJournalPin)}
              >
                <Text style={s.journalAddFullText}>+ Add Current Spread To This Location</Text>
              </Pressable>

              <ScrollView style={s.journalEntryList} showsVerticalScrollIndicator={false}>
                {selectedJournalEntries.length === 0 ? (
                  <View style={s.noteBox}>
                    <Text style={s.noteTextMuted}>
                      No spreads saved to this location yet.
                    </Text>
                  </View>
                ) : (
                  selectedJournalEntries.map((plan, index) => {
                    const savedSpread = plan?.primarySpread;
                    const draftKey = getDraftKey(selectedJournalPin, plan, index);
                    const isEditing = editingSpreadEntryId === draftKey;
                    const noteValue = spreadNoteDrafts[draftKey] ?? plan?.note ?? "";

                    return (
                      <View key={draftKey} style={s.journalEntryCard}>
                        <View style={s.journalEntryTop}>
                          <View style={{ flex: 1 }}>
                            <Text style={s.journalEntryTitle} numberOfLines={1}>
                              {savedSpread?.name || "Saved Spread"}
                            </Text>
                            <Text style={s.journalEntryMeta} numberOfLines={1}>
                              {formatSavedDate(plan?.savedAt)}
                              {plan?.waterType ? ` • ${plan.waterType}` : ""}
                              {plan?.weather ? ` • ${plan.weather}` : ""}
                            </Text>
                          </View>

                          <Text style={s.journalEntryScore}>
                            {savedSpread?.score ? `${savedSpread.score}%` : ""}
                          </Text>
                        </View>

                        <View style={s.journalCompareRow}>
                          <Text style={s.journalCompareText} numberOfLines={1}>
                            {savedSpread?.type || "Spread"} • {savedSpread?.decoyCount || "-"} decoys
                          </Text>
                          <Text style={s.journalCompareText} numberOfLines={1}>
                            {plan?.season || "Season"} • {plan?.pressure || "Pressure"}
                          </Text>
                        </View>

                        {isEditing ? (
                          <TextInput
                            value={noteValue}
                            onChangeText={(text) =>
                              setSpreadNoteDrafts((prev) => ({
                                ...prev,
                                [draftKey]: text,
                              }))
                            }
                            placeholder="Short result note..."
                            placeholderTextColor={MUTED_DARK}
                            style={s.journalNoteInput}
                            maxLength={160}
                            returnKeyType="done"
                          />
                        ) : (
                          <Text
                            style={plan?.note ? s.journalNoteText : s.journalNoteMuted}
                            numberOfLines={2}
                          >
                            {plan?.note || "No result notes yet."}
                          </Text>
                        )}

                        <View style={s.journalActions}>
                          <Pressable
                            style={s.journalActionBtn}
                            onPress={() => openSavedSpreadFromPlan(plan)}
                          >
                            <Text style={s.journalActionText}>View</Text>
                          </Pressable>

                          {isEditing ? (
                            <Pressable
                              style={s.journalActionBtn}
                              onPress={() => saveSpreadNote(selectedJournalPin, plan, index)}
                            >
                              <Text style={s.journalActionTextGold}>Save Note</Text>
                            </Pressable>
                          ) : (
                            <Pressable
                              style={s.journalActionBtn}
                              onPress={() => beginEditSpreadNote(selectedJournalPin, plan, index)}
                            >
                              <Text style={s.journalActionText}>Note</Text>
                            </Pressable>
                          )}

                          <Pressable
                            style={s.journalActionBtn}
                            onPress={() =>
                              replaceSavedSpreadWithCurrent(selectedJournalPin, plan, index)
                            }
                          >
                            <Text style={s.journalActionTextGold}>Update</Text>
                          </Pressable>
                        </View>
                      </View>
                    );
                  })
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>

        <Modal
          visible={aiSpreadModalVisible}
          transparent={false}
          animationType="slide"
          onRequestClose={() => setAiSpreadModalVisible(false)}
        >
          <SafeAreaView style={s.aiModalSafe}>
            <ScrollView contentContainerStyle={s.container} showsVerticalScrollIndicator={false}>
              <View style={s.modalHeaderRow}>
                <Pressable style={s.headerCircleBtn} onPress={() => setAiSpreadModalVisible(false)}>
                  <Text style={s.headerCircleText}>‹</Text>
                </Pressable>

                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={s.aiTitle}>AI SPREAD ANALYZER</Text>
                  <Text style={s.aiSub}>Powered by DuckSmart AI</Text>
                </View>
              </View>

              {aiSpreadPhoto ? (
                <Image source={{ uri: aiSpreadPhoto }} style={s.aiSpreadPhoto} resizeMode="cover" />
              ) : null}

              {aiSpreadLoading ? (
                <View style={s.aiSpreadLoadingBox}>
                  <ActivityIndicator size="large" color={GOLD} />
                  <Text style={s.aiSpreadLoadingText}>Analyzing your spread...</Text>
                </View>
              ) : null}

              {aiSpreadResult ? (
                <>
                  <DecoyCard title="OVERALL SCORE">
                    <Text style={s.aiBigScore}>{aiSpreadResult.overallScore}</Text>

                    {aiSpreadResult.spreadType ? (
                      <Text style={s.aiSpreadType}>Detected: {aiSpreadResult.spreadType}</Text>
                    ) : null}

                    {aiSpreadResult.summary ? (
                      <Text style={s.aiSpreadSummary}>{aiSpreadResult.summary}</Text>
                    ) : null}
                  </DecoyCard>

                  <DecoyCard title="BREAKDOWN">
                    {[
                      { key: "windAlignment", label: "Wind Alignment" },
                      { key: "spacing", label: "Spacing" },
                      { key: "realism", label: "Realism" },
                      { key: "landingZone", label: "Landing Zone" },
                    ].map((cat) => {
                      const data = aiSpreadResult.scores?.[cat.key];
                      if (!data) return null;

                      const barColor =
                        data.score >= 70 ? GREEN : data.score >= 40 ? GOLD : RED;

                      return (
                        <View key={cat.key} style={s.aiScoreCatRow}>
                          <View style={s.aiScoreCatHeader}>
                            <Text style={s.aiScoreCatLabel}>{cat.label}</Text>
                            <Text style={[s.aiScoreCatValue, { color: barColor }]}>
                              {data.score}
                            </Text>
                          </View>

                          <View style={s.aiScoreBarBg}>
                            <View
                              style={[
                                s.aiScoreBarFill,
                                {
                                  width: `${data.score}%`,
                                  backgroundColor: barColor,
                                },
                              ]}
                            />
                          </View>

                          {data.note ? <Text style={s.aiScoreCatNote}>{data.note}</Text> : null}
                        </View>
                      );
                    })}
                  </DecoyCard>

                  {aiSpreadResult.improvements?.length > 0 ? (
                    <DecoyCard title="IMPROVEMENTS">
                      {aiSpreadResult.improvements.map((tip, i) => (
                        <View key={i} style={s.aiImprovRow}>
                          <Text style={s.aiImprovBullet}>{i + 1}</Text>
                          <Text style={s.aiImprovText}>{tip}</Text>
                        </View>
                      ))}
                    </DecoyCard>
                  ) : null}

                  <Pressable
                    style={s.modalCloseBtn}
                    onPress={() => setAiSpreadModalVisible(false)}
                  >
                    <Text style={s.modalCloseBtnText}>Done</Text>
                  </Pressable>
                </>
              ) : null}

              <View style={{ height: 24 }} />
            </ScrollView>
          </SafeAreaView>
        </Modal>

        <ScrollView contentContainerStyle={s.container} showsVerticalScrollIndicator={false}>
          <View style={s.topBar}>
            <Pressable
              style={s.headerSide}
              onPress={handleBackPress}
              accessibilityLabel="Back or settings"
              accessibilityRole="button"
            >
              <Text style={s.backText}>‹</Text>
            </Pressable>

            <Text style={s.screenTitle}>DECOY SPREAD</Text>

            <Pressable
              style={s.saveBtn}
              onPress={openPinPickerForSpreadSave}
              accessibilityLabel="Save spread to pin"
              accessibilityRole="button"
            >
              <Text style={s.saveText}>Save</Text>
            </Pressable>
          </View>

          <Pressable
            style={s.locationCard}
            onPress={() => setSavedSpreadsModalVisible(true)}
          >
            <View style={s.locationIconWrap}>
              <Text style={s.locationIcon}>📍</Text>
            </View>

            <View style={{ flex: 1 }}>
              <Text style={s.locationTitle}>Saved Locations and Spreads</Text>
              <Text style={s.locationSub}>
                {savedSpreadPins.length > 0
                  ? `${savedSpreadPins.length} saved location${savedSpreadPins.length === 1 ? "" : "s"}`
                  : "No saved spreads yet"}
              </Text>
            </View>

            <Text style={s.chevron}>⌄</Text>
          </Pressable>

          <DecoyCard title="CONDITIONS">
            <View style={s.conditionsGrid}>
              <ConditionTile icon="≋" label="WATER" value={dWater} />
              <ConditionTile icon="☁" label="WEATHER" value={dWeather} />
              <ConditionTile icon="◴" label="SEASON" value={dSeason} />
              <ConditionTile icon="⌁" label="PRESSURE" value={dPressure} />
            </View>
          </DecoyCard>

          <DecoyCard title="SPREAD OVERVIEW">
            {primary ? (
              <Pressable onPress={() => setSpreadModal(primary)}>
                <SpreadOverview spread={primary} water={dWater} weather={dWeather} />
              </Pressable>
            ) : (
              <View style={s.noteBox}>
                <Text style={s.noteTextMuted}>No recommendation yet.</Text>
              </View>
            )}

            {primary ? (
              <View style={s.detailsStrip}>
                <DetailColumn label="TOTAL DECOYS" value={primary.decoyCount} />
                <View style={s.detailDivider} />
                <DetailColumn label="SPREAD TYPE" value={primary.type} />
                <View style={s.detailDivider} />
                <DetailColumn label="SPECIES MIX" value={dSpecies} />
              </View>
            ) : null}
          </DecoyCard>

          <DecoyCard title="BUILD YOUR SPREAD">
            <PickerRow label="Water Type" options={WATER_TYPES} value={dWater} onChange={setDWater} />
            <PickerRow label="Weather" options={WEATHER_OPTIONS} value={dWeather} onChange={setDWeather} />
            <PickerRow label="Season" options={SEASON_OPTIONS} value={dSeason} onChange={setDSeason} />
            <PickerRow label="Pressure" options={PRESSURE_OPTIONS} value={dPressure} onChange={setDPressure} />
            <PickerRow label="Species Focus" options={SPECIES_OPTIONS} value={dSpecies} onChange={setDSpecies} />
          </DecoyCard>

          {primary ? (
            <DecoyCard>
              <View style={s.aiHeaderRow}>
                <Text style={s.aiAnalysisTitle}>AI SPREAD ANALYSIS</Text>
                <View style={s.betaPill}>
                  <Text style={s.betaText}>BETA</Text>
                </View>
              </View>

              <View style={s.aiAnalysisBody}>
                <View style={s.scoreSide}>
                  <ScoreRing score={primaryScore} size={110} />
                  <Text style={s.scoreLabel}>PREDICTION SCORE</Text>
                  <Text style={s.successText}>
                    {primaryScore >= 70 ? "High Success Potential" : "Needs Fine-Tuning"}
                  </Text>
                </View>

                <View style={s.aiChecklist}>
                  <View style={s.checkRow}>
                    <Text style={s.checkIcon}>✓</Text>
                    <Text style={s.checkText}>
                      Best match for {dWater.toLowerCase()} water.
                    </Text>
                  </View>

                  <View style={s.checkRow}>
                    <Text style={s.checkIcon}>✓</Text>
                    <Text style={s.checkText}>
                      Built around {dWeather.toLowerCase()} conditions.
                    </Text>
                  </View>

                  <View style={s.checkRow}>
                    <Text style={s.checkIcon}>✓</Text>
                    <Text style={s.checkText} numberOfLines={3}>
                      {primary.detail || primary.notes || "Tune spacing and landing zone based on wind."}
                    </Text>
                  </View>
                </View>
              </View>

              <Pressable style={s.optimizeBtn} onPress={promptAISpreadAnalyzer}>
                <Text style={s.optimizeText}>✦ Optimize with AI</Text>
              </Pressable>

              <Text style={s.optimizeHelper}>
                Let AI suggest improvements to increase your success.
              </Text>
            </DecoyCard>
          ) : null}

          {allRecommendations.length > 1 ? (
            <DecoyCard title="OTHER OPTIONS">
              {allRecommendations.slice(1, isPro ? 4 : FREE_SPREAD_LIMIT).map((sp) => (
                <Pressable
                  key={sp.key}
                  style={s.runnerRow}
                  onPress={() => setSpreadModal(sp)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={s.runnerName}>{sp.name}</Text>
                    <Text style={s.runnerType}>
                      {sp.type} • {sp.decoyCount} decoys
                    </Text>
                  </View>

                  <Text style={s.runnerScore}>{sp.score}%</Text>
                  <Text style={s.runnerChevron}>›</Text>
                </Pressable>
              ))}

              {!isPro && allRecommendations.length > FREE_SPREAD_LIMIT ? (
                <ProUpgradePrompt
                  compact
                  message={`${allRecommendations.length - FREE_SPREAD_LIMIT} more spreads with Pro`}
                />
              ) : null}
            </DecoyCard>
          ) : null}

          {addon && isPro ? (
            <Pressable style={s.addonTip} onPress={() => setSpreadModal(addon)}>
              <Text style={s.addonIcon}>+</Text>

              <View style={{ flex: 1 }}>
                <Text style={s.addonTitle}>Add a Confidence Spread</Text>
                <Text style={s.addonText}>
                  Mix {addon.decoyCount} heron, egret, or coot decoys for extra realism.
                </Text>
              </View>

              <Text style={s.runnerChevron}>›</Text>
            </Pressable>
          ) : null}

          {addon && !isPro ? (
            <ProUpgradePrompt compact message="Confidence Spread tips with Pro" />
          ) : null}

          <InAppSponsorAd screen="DecoyScreen" placementId="decoy_bottom_sponsor" />

          <Text style={s.disclaimer}>
            Spread advice is a recommendation based on the conditions you selected. Always adjust for
            real wind, bird behavior, local pressure, and your actual setup.
          </Text>

          <View style={{ height: 16 }} />
        </ScrollView>
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
    paddingHorizontal: 10,
    paddingTop: 4,
    paddingBottom: 100,
  },

  topBar: {
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  headerSide: {
    width: 48,
    height: 42,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  backText: {
    color: COLORS.white,
    fontSize: 32,
    fontWeight: "700",
    marginTop: -2,
  },
  screenTitle: {
    flex: 1,
    color: COLORS.white,
    textAlign: "center",
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: 0.2,
  },
  saveBtn: {
    width: 48,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  saveText: {
    color: GOLD,
    fontSize: 15,
    fontWeight: "900",
  },

  locationCard: {
    minHeight: 66,
    borderRadius: 16,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 10,
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  locationIconWrap: {
    width: 40,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 7,
  },
  locationIcon: {
    fontSize: 23,
    color: GOLD,
  },
  locationTitle: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: "900",
  },
  locationSub: {
    color: MUTED,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 3,
  },
  chevron: {
    color: "rgba(255,255,255,0.46)",
    fontSize: 28,
    fontWeight: "500",
    marginLeft: 7,
  },

  card: {
    marginBottom: 8,
    backgroundColor: CARD,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 10,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardTitle: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 0.3,
  },
  cardBody: {
    marginTop: 8,
  },

  conditionsGrid: {
    flexDirection: "row",
    gap: 6,
  },
  conditionTile: {
    flex: 1,
    minHeight: 82,
    borderRadius: 14,
    backgroundColor: CARD_SOFT,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  conditionIcon: {
    color: COLORS.white,
    fontSize: 23,
    fontWeight: "900",
    marginBottom: 6,
  },
  conditionLabel: {
    color: COLORS.white,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.3,
  },
  conditionValue: {
    color: "rgba(255,255,255,0.76)",
    fontSize: 10,
    fontWeight: "800",
    marginTop: 4,
    textAlign: "center",
  },

  pickerSection: {
    marginTop: 8,
  },
  pickerLabel: {
    color: MUTED,
    fontSize: 10,
    fontWeight: "900",
    marginBottom: 6,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  chipRow: {
    flexDirection: "row",
    gap: 6,
    paddingBottom: 1,
    paddingRight: 6,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipUnselected: {
    backgroundColor: "rgba(255,255,255,0.035)",
    borderColor: BORDER,
  },
  chipSelected: {
    backgroundColor: "rgba(217,168,76,0.12)",
    borderColor: GOLD,
  },
  chipText: {
    color: "rgba(255,255,255,0.76)",
    fontSize: 11,
    fontWeight: "800",
  },
  chipTextSelected: {
    color: GOLD,
    fontWeight: "900",
  },

  overviewWrap: {
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: GOLD_BORDER,
    backgroundColor: BG,
  },
  overviewImageWrap: {
    height: 220,
    overflow: "hidden",
    backgroundColor: "#0A1A1C",
  },
  overviewImage: {
    width: "100%",
    height: "100%",
  },
  overviewImageBg: {
    opacity: 0.82,
  },
  fakeWaterOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,35,40,0.58)",
  },
  overviewDarkener: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.10)",
  },
  windBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    minWidth: 84,
    paddingVertical: 7,
    paddingHorizontal: 9,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.68)",
    borderWidth: 1,
    borderColor: BORDER,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  windBadgeArrow: {
    color: COLORS.white,
    fontSize: 18,
    fontWeight: "900",
  },
  windBadgeLabel: {
    color: COLORS.white,
    fontSize: 9,
    fontWeight: "900",
  },
  windBadgeValue: {
    color: "rgba(255,255,255,0.76)",
    fontSize: 9,
    fontWeight: "800",
    marginTop: 1,
  },
  overviewFooterBadge: {
    position: "absolute",
    left: 8,
    bottom: 8,
    paddingVertical: 6,
    paddingHorizontal: 9,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.62)",
    borderWidth: 1,
    borderColor: GOLD_BORDER,
  },
  overviewFooterText: {
    color: GOLD,
    fontSize: 10,
    fontWeight: "900",
  },
  blindMarker: {
    position: "absolute",
    bottom: 16,
    alignSelf: "center",
    alignItems: "center",
  },
  blindEmoji: {
    color: GOLD,
    fontSize: 30,
    fontWeight: "900",
  },
  blindText: {
    color: COLORS.white,
    fontSize: 9,
    fontWeight: "900",
    marginTop: 1,
  },

  detailsStrip: {
    marginTop: 8,
    minHeight: 60,
    borderRadius: 14,
    backgroundColor: CARD_SOFT,
    borderWidth: 1,
    borderColor: BORDER,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
  },
  detailColumn: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 4,
  },
  detailLabel: {
    color: MUTED,
    fontSize: 8,
    fontWeight: "900",
    textTransform: "uppercase",
    textAlign: "center",
  },
  detailValue: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: "900",
    marginTop: 4,
    textAlign: "center",
  },
  detailDivider: {
    width: 1,
    height: 34,
    backgroundColor: "rgba(255,255,255,0.10)",
  },

  aiHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  aiAnalysisTitle: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 0.3,
  },
  betaPill: {
    marginLeft: 7,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "rgba(57,217,106,0.18)",
  },
  betaText: {
    color: GREEN,
    fontSize: 8,
    fontWeight: "900",
  },
  aiAnalysisBody: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  scoreSide: {
    width: 116,
    alignItems: "center",
  },
  scoreRingWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  scoreLabel: {
    color: COLORS.white,
    fontSize: 10,
    fontWeight: "900",
    marginTop: -2,
  },
  successText: {
    color: GREEN,
    fontSize: 10,
    fontWeight: "800",
    marginTop: 3,
    textAlign: "center",
  },
  aiChecklist: {
    flex: 1,
    gap: 8,
  },
  checkRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 7,
  },
  checkIcon: {
    width: 19,
    height: 19,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "rgba(57,217,106,0.20)",
    color: GREEN,
    textAlign: "center",
    fontSize: 12,
    fontWeight: "900",
  },
  checkText: {
    flex: 1,
    color: "rgba(255,255,255,0.84)",
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 16,
  },
  optimizeBtn: {
    marginTop: 12,
    minHeight: 45,
    borderRadius: 13,
    backgroundColor: GOLD,
    alignItems: "center",
    justifyContent: "center",
  },
  optimizeText: {
    color: BG,
    fontSize: 15,
    fontWeight: "900",
  },
  optimizeHelper: {
    color: MUTED,
    fontSize: 10,
    fontWeight: "700",
    textAlign: "center",
    marginTop: 7,
  },

  runnerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 13,
    backgroundColor: CARD_SOFT,
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 7,
  },
  runnerName: {
    color: COLORS.white,
    fontSize: 13,
    fontWeight: "900",
  },
  runnerType: {
    color: MUTED_DARK,
    fontSize: 10,
    fontWeight: "700",
    marginTop: 2,
  },
  runnerScore: {
    color: GOLD,
    fontSize: 12,
    fontWeight: "900",
    marginRight: 6,
  },
  runnerChevron: {
    color: "rgba(255,255,255,0.46)",
    fontSize: 23,
    fontWeight: "700",
  },

  addonTip: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    padding: 10,
    borderRadius: 15,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: GOLD_BORDER,
    borderStyle: "dashed",
  },
  addonIcon: {
    color: GOLD,
    fontSize: 22,
    fontWeight: "900",
    marginRight: 9,
  },
  addonTitle: {
    color: COLORS.white,
    fontSize: 13,
    fontWeight: "900",
  },
  addonText: {
    color: MUTED_DARK,
    fontSize: 11,
    fontWeight: "700",
    marginTop: 2,
    lineHeight: 15,
  },

  noteBox: {
    marginTop: 6,
    backgroundColor: CARD_SOFT,
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: BORDER,
  },
  noteTextMuted: {
    color: MUTED,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
  },

  saveModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.78)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  saveModalCard: {
    width: "100%",
    maxHeight: "78%",
    borderRadius: 20,
    backgroundColor: BG,
    borderWidth: 1,
    borderColor: GOLD_BORDER,
    padding: 14,
  },
  saveModalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 12,
  },
  saveModalTitle: {
    color: COLORS.white,
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: 0.4,
  },
  saveModalSub: {
    color: MUTED,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 4,
    lineHeight: 17,
  },
  saveModalClose: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: "center",
    justifyContent: "center",
  },
  saveModalCloseText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: "900",
  },
  savePinList: {
    maxHeight: 420,
  },
  savePinRow: {
    minHeight: 68,
    borderRadius: 15,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 10,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  savePinIcon: {
    width: 40,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  savePinIconText: {
    fontSize: 22,
  },
  savePinTitle: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: "900",
  },
  savePinMeta: {
    color: MUTED_DARK,
    fontSize: 11,
    fontWeight: "700",
    marginTop: 3,
  },
  savePinChevron: {
    color: GOLD,
    fontSize: 25,
    fontWeight: "900",
    marginLeft: 8,
  },

  journalBackBtn: {
    width: 34,
    height: 36,
    borderRadius: 12,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: "center",
    justifyContent: "center",
  },
  journalBackText: {
    color: COLORS.white,
    fontSize: 26,
    fontWeight: "900",
    marginTop: -2,
  },
  journalAddFullBtn: {
    minHeight: 42,
    borderRadius: 13,
    backgroundColor: GOLD,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  journalAddFullText: {
    color: BG,
    fontSize: 13,
    fontWeight: "900",
  },
  journalEntryList: {
    maxHeight: 360,
  },
  journalEntryCard: {
    borderRadius: 15,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 10,
    marginBottom: 8,
  },
  journalEntryTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  journalEntryTitle: {
    color: COLORS.white,
    fontSize: 13,
    fontWeight: "900",
  },
  journalEntryMeta: {
    color: MUTED_DARK,
    fontSize: 10,
    fontWeight: "700",
    marginTop: 3,
  },
  journalEntryScore: {
    color: GOLD,
    fontSize: 12,
    fontWeight: "900",
    marginTop: 1,
  },
  journalCompareRow: {
    marginTop: 8,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.035)",
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 9,
    paddingVertical: 7,
    gap: 3,
  },
  journalCompareText: {
    color: "rgba(255,255,255,0.70)",
    fontSize: 10,
    fontWeight: "800",
  },
  journalNoteText: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 15,
    marginTop: 8,
  },
  journalNoteMuted: {
    color: MUTED_DARK,
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 15,
    marginTop: 8,
  },
  journalNoteInput: {
    height: 42,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: 1,
    borderColor: GOLD_BORDER,
    color: COLORS.white,
    fontSize: 12,
    fontWeight: "700",
    paddingHorizontal: 10,
    marginTop: 8,
  },
  journalActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginTop: 9,
  },
  journalActionBtn: {
    flex: 1,
    minHeight: 32,
    borderRadius: 11,
    backgroundColor: "rgba(255,255,255,0.045)",
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  journalActionText: {
    color: COLORS.white,
    fontSize: 10,
    fontWeight: "900",
  },
  journalActionTextGold: {
    color: GOLD,
    fontSize: 10,
    fontWeight: "900",
  },

  modalSafe: {
    flex: 1,
    backgroundColor: COLORS.black,
  },
  modalScroll: {
    padding: 12,
    paddingBottom: 34,
  },
  modalTopBar: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    gap: 8,
  },
  modalBackBtn: {
    width: 36,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  modalBackText: {
    color: COLORS.white,
    fontSize: 32,
    fontWeight: "800",
  },
  modalXBtn: {
    width: 40,
    height: 40,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: CARD,
    alignItems: "center",
    justifyContent: "center",
  },
  modalXBtnText: {
    color: COLORS.white,
    fontSize: 17,
    fontWeight: "900",
  },
  modalTitle: {
    color: COLORS.white,
    fontSize: 23,
    fontWeight: "900",
  },
  modalSubtitle: {
    color: GOLD,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 3,
  },
  modalImage: {
    width: "100%",
    height: 260,
    borderRadius: 16,
    backgroundColor: BG,
    marginBottom: 14,
  },
  modalImagePlaceholder: {
    width: "100%",
    height: 260,
    borderRadius: 16,
    backgroundColor: BG,
    marginBottom: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  modalImagePlaceholderText: {
    color: MUTED_DARK,
    fontSize: 13,
    fontWeight: "700",
  },
  modalInfoRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  modalInfoPill: {
    flex: 1,
    borderRadius: 13,
    padding: 10,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
  },
  modalInfoLabel: {
    color: MUTED,
    fontSize: 10,
    fontWeight: "800",
    marginBottom: 3,
  },
  modalInfoValue: {
    color: COLORS.white,
    fontSize: 13,
    fontWeight: "900",
  },
  modalNotes: {
    color: COLORS.white,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 19,
    marginBottom: 12,
  },
  modalMistakeBox: {
    borderRadius: 15,
    padding: 12,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 14,
  },
  modalMistakeLabel: {
    color: GOLD,
    fontSize: 11,
    fontWeight: "900",
    marginBottom: 5,
  },
  modalMistakeText: {
    color: COLORS.white,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
  },
  modalCloseBtn: {
    marginTop: 6,
    backgroundColor: GOLD,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 13,
  },
  modalCloseBtnText: {
    color: BG,
    fontSize: 14,
    fontWeight: "900",
  },

  aiModalSafe: {
    flex: 1,
    backgroundColor: BG,
  },
  modalHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  headerCircleBtn: {
    width: 40,
    height: 40,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: CARD,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCircleText: {
    color: COLORS.white,
    fontSize: 27,
    fontWeight: "900",
    marginTop: -3,
  },
  aiTitle: {
    color: COLORS.white,
    fontSize: 21,
    fontWeight: "900",
  },
  aiSub: {
    color: MUTED,
    fontSize: 11,
    fontWeight: "700",
    marginTop: 2,
  },
  aiSpreadPhoto: {
    width: "100%",
    height: 220,
    borderRadius: 16,
    marginBottom: 12,
    backgroundColor: BG,
  },
  aiSpreadLoadingBox: {
    paddingVertical: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  aiSpreadLoadingText: {
    color: MUTED,
    marginTop: 10,
    fontWeight: "800",
  },
  aiBigScore: {
    color: GREEN,
    fontSize: 46,
    fontWeight: "900",
    textAlign: "center",
  },
  aiSpreadType: {
    color: COLORS.white,
    fontSize: 13,
    fontWeight: "800",
    textAlign: "center",
    marginTop: 7,
  },
  aiSpreadSummary: {
    color: MUTED,
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
    lineHeight: 17,
    marginTop: 7,
  },
  aiScoreCatRow: {
    marginBottom: 12,
  },
  aiScoreCatHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 5,
  },
  aiScoreCatLabel: {
    color: COLORS.white,
    fontSize: 12,
    fontWeight: "800",
  },
  aiScoreCatValue: {
    fontSize: 12,
    fontWeight: "900",
  },
  aiScoreBarBg: {
    height: 9,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.07)",
    overflow: "hidden",
  },
  aiScoreBarFill: {
    height: 9,
    borderRadius: 999,
  },
  aiScoreCatNote: {
    color: MUTED,
    fontSize: 11,
    fontWeight: "700",
    marginTop: 5,
    lineHeight: 15,
  },
  aiImprovRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 9,
  },
  aiImprovBullet: {
    color: GREEN,
    fontSize: 12,
    fontWeight: "900",
    width: 20,
  },
  aiImprovText: {
    flex: 1,
    color: COLORS.white,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
  },

  disclaimer: {
    color: MUTED_DARK,
    fontSize: 10,
    fontWeight: "700",
    lineHeight: 15,
    marginTop: 12,
    textAlign: "center",
    paddingHorizontal: 8,
  },
});