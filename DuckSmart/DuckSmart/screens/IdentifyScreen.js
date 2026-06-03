// /Users/gozyr/Development/ducksmart/DuckSmart/DuckSmart/screens/IdentifyScreen.js

import React, { useMemo, useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  StatusBar,
  TextInput,
  Image,
  Alert,
  ActivityIndicator,
  Modal,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import * as ImagePicker from "expo-image-picker";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { COLORS } from "../constants/theme";
import { ASSETS } from "../constants/assets";
import { identifyDuck, isAIAvailable } from "../services/ai";
import { showInterstitialAd } from "../services/ads";
import { usePremium } from "../context/PremiumContext";
import { useAuth } from "../context/AuthContext";
import { logDuckIdentified, logEvent, logScreenView } from "../services/analytics";
import ProUpgradePrompt from "../components/ProUpgradePrompt";
import ScreenBackground from "../components/ScreenBackground";
import InAppSponsorAd from "../components/InAppSponsorAd";
import {
  IDENTIFY_SPECIES,
  IDENTIFY_GROUPS,
  IDENTIFY_HABITATS,
  IDENTIFY_SIZE,
  FREE_SPECIES_IDS,
  EASTER_EGG_DUCK,
  computeIdentifyMatches,
} from "../data/species";


const AI_DUCK_DAILY_LIMIT = 3;
const AI_DUCK_USAGE_KEY = "@ducksmart_ai_duck_id_usage_v1";

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

function getTodayKey() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

async function loadAIDuckUsage() {
  try {
    const raw = await AsyncStorage.getItem(AI_DUCK_USAGE_KEY);

    if (!raw) {
      return { date: getTodayKey(), count: 0 };
    }

    const parsed = JSON.parse(raw);
    const today = getTodayKey();

    if (!parsed || parsed.date !== today) {
      return { date: today, count: 0 };
    }

    return {
      date: today,
      count: Math.max(0, Math.min(AI_DUCK_DAILY_LIMIT, Number(parsed.count) || 0)),
    };
  } catch {
    return { date: getTodayKey(), count: 0 };
  }
}

async function saveAIDuckUsage(count) {
  const payload = {
    date: getTodayKey(),
    count: Math.max(0, Math.min(AI_DUCK_DAILY_LIMIT, count)),
  };

  await AsyncStorage.setItem(AI_DUCK_USAGE_KEY, JSON.stringify(payload));
  return payload;
}

function ratingColor(rating) {
  if (rating === "High") return GREEN;
  if (rating === "Medium") return GOLD;
  return MUTED_DARK;
}

function confidenceColor(confidence) {
  const value = Number(confidence || 0);

  if (value >= 70) return GREEN;
  if (value >= 40) return GOLD;
  return RED;
}

function getDuckAsset(speciesName) {
  const duckAsset = ASSETS.ducks?.[speciesName];

  if (!duckAsset) return null;

  return duckAsset.male || duckAsset;
}

function IdentifyCard({ title, right, children, style }) {
  return (
    <View style={[s.card, style]}>
      <View style={s.cardHeader}>
        <Text style={s.cardTitle}>{title}</Text>
        {right ? <View>{right}</View> : null}
      </View>

      <View style={s.cardBody}>{children}</View>
    </View>
  );
}

function IdentifyChip({ label, selected, onPress }) {
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

function IdentifyPill({ label, value, color }) {
  return (
    <View style={s.pill}>
      <Text style={s.pillLabel}>{label}</Text>
      <Text style={[s.pillValue, color ? { color } : null]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

function IdentifySectionLabel({ children }) {
  return <Text style={s.sectionLabel}>{children}</Text>;
}

function ScanCorner({ position }) {
  return <View pointerEvents="none" style={[s.scanCorner, s[position]]} />;
}

const SpeciesMatchRow = React.memo(function SpeciesMatchRow({ species, score, onPress }) {
  const duckAsset = getDuckAsset(species.name);

  return (
    <Pressable onPress={onPress} style={s.matchRow}>
      {duckAsset ? (
        <Image source={duckAsset} style={s.matchThumb} resizeMode="cover" />
      ) : (
        <View style={[s.matchThumb, s.matchThumbEmpty]}>
          <Text style={s.matchThumbText}>🦆</Text>
        </View>
      )}

      <View style={s.matchContent}>
        <Text style={s.matchTitle} numberOfLines={1}>
          {species.name}
        </Text>
        <Text style={s.matchSub} numberOfLines={1}>
          {species.group} • {species.size}
        </Text>
        <Text style={s.matchHint} numberOfLines={2}>
          {species.keyMarks?.[0] || "Tap for full field marks."}
        </Text>
      </View>

      <View style={s.scoreBubble}>
        <Text style={s.scoreBubbleText}>{score}</Text>
      </View>

      <Text style={s.rowChevron}>›</Text>
    </Pressable>
  );
});

function IdentifyHome({ navigation }) {
  const { isPro, purchase } = usePremium();
  const { user } = useAuth();

  const [group, setGroup] = useState(null);
  const [habitat, setHabitat] = useState(null);
  const [size, setSize] = useState(null);
  const [query, setQuery] = useState("");

  const [aiPhoto, setAiPhoto] = useState(null);
  const [aiResult, setAiResult] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiModalVisible, setAiModalVisible] = useState(false);
  const [aiDailyCount, setAiDailyCount] = useState(0);
  const [aiUsageReady, setAiUsageReady] = useState(false);

  const [filterTaps, setFilterTaps] = useState(0);
  const screenViewLoggedRef = useRef(false);

  useEffect(() => {
    if (screenViewLoggedRef.current) return;
    screenViewLoggedRef.current = true;

    logScreenView(user?.uid, "IdentifyScreen");

    logEvent("identify_screen_view", user?.uid, {
      screen: "IdentifyScreen",
      isPro: !!isPro,
      platform: Platform.OS,
    });

    logEvent("identify_tool_session_started", user?.uid, {
      screen: "IdentifyScreen",
      isPro: !!isPro,
      platform: Platform.OS,
    });

    return () => {
      logEvent("identify_tool_session_ended", user?.uid, {
        screen: "IdentifyScreen",
        isPro: !!isPro,
        platform: Platform.OS,
      });
    };
  }, [user?.uid, isPro]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      const usage = await loadAIDuckUsage();

      if (mounted) {
        setAiDailyCount(usage.count);
        setAiUsageReady(true);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (!isPro) {
        showInterstitialAd();
      }
    };
  }, [isPro]);

  const aiLimitReached = aiUsageReady && aiDailyCount >= AI_DUCK_DAILY_LIMIT;

  async function handleAIDuckID(useCamera) {
    const source = useCamera ? "camera" : "gallery";

    logEvent("identify_ai_source_selected", user?.uid, {
      screen: "IdentifyScreen",
      source,
      isPro: !!isPro,
      platform: Platform.OS,
    });

    if (!isPro) {
      logEvent("identify_ai_paywall_shown", user?.uid, {
        screen: "IdentifyScreen",
        source,
        platform: Platform.OS,
      });
      Alert.alert("Pro Feature", "AI Duck ID requires DuckSmart Pro.", [
        { text: "Not Now", style: "cancel" },
        { text: "Upgrade to Pro", onPress: purchase },
      ]);
      return;
    }

    if (!isAIAvailable()) {
      logEvent("identify_ai_not_configured", user?.uid, {
        screen: "IdentifyScreen",
        platform: Platform.OS,
      });

      Alert.alert(
        "Not Configured",
        "AI features require an OpenAI API key. Add it in app.json → extra → openaiApiKey."
      );
      return;
    }

    const usageBefore = await loadAIDuckUsage();
    setAiDailyCount(usageBefore.count);

    if (usageBefore.count >= AI_DUCK_DAILY_LIMIT) {
      logEvent("identify_ai_limit_reached", user?.uid, {
        screen: "IdentifyScreen",
        source,
        aiDailyCount: usageBefore.count,
        aiDailyLimit: AI_DUCK_DAILY_LIMIT,
        platform: Platform.OS,
      });

      Alert.alert(
        "Limit Reached",
        "AI Duck ID is limited to 3 uses per day. You've already used 3 of 3 today."
      );
      return;
    }

    try {
      let result;

      if (useCamera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();

        if (!perm.granted) {
          logEvent("identify_ai_permission_denied", user?.uid, {
            screen: "IdentifyScreen",
            source,
            permission: "camera",
            platform: Platform.OS,
          });

          Alert.alert("Permission Needed", "Camera access is required for AI Duck ID.");
          return;
        }

        result = await ImagePicker.launchCameraAsync({
          quality: 0.7,
          allowsEditing: true,
        });
      } else {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();

        if (!perm.granted) {
          logEvent("identify_ai_permission_denied", user?.uid, {
            screen: "IdentifyScreen",
            source,
            permission: "photo_library",
            platform: Platform.OS,
          });

          Alert.alert("Permission Needed", "Photo library access is required for AI Duck ID.");
          return;
        }

        result = await ImagePicker.launchImageLibraryAsync({
          quality: 0.7,
          allowsEditing: true,
        });
      }

      if (result.canceled || !result.assets?.length) {
        logEvent("identify_ai_photo_cancelled", user?.uid, {
          screen: "IdentifyScreen",
          source,
          platform: Platform.OS,
        });
        return;
      }

      const uri = result.assets[0].uri;

      logEvent("identify_ai_photo_selected", user?.uid, {
        screen: "IdentifyScreen",
        source,
        platform: Platform.OS,
      });

      setAiPhoto(uri);
      setAiResult(null);
      setAiLoading(true);
      setAiModalVisible(true);

      logEvent("identify_ai_scan_started", user?.uid, {
        screen: "IdentifyScreen",
        source,
        aiDailyCountBefore: usageBefore.count,
        aiDailyLimit: AI_DUCK_DAILY_LIMIT,
        platform: Platform.OS,
      });

      const identification = await identifyDuck(uri);

      setAiResult(identification);
      logDuckIdentified(user?.uid);

      logEvent("identify_ai_scan_success", user?.uid, {
        screen: "IdentifyScreen",
        source,
        species: identification?.species || null,
        confidence: Number(identification?.confidence) || null,
        aiDailyCountAfter: Math.min(AI_DUCK_DAILY_LIMIT, usageBefore.count + 1),
        aiDailyLimit: AI_DUCK_DAILY_LIMIT,
        platform: Platform.OS,
      });

      const nextCount = Math.min(AI_DUCK_DAILY_LIMIT, usageBefore.count + 1);
      await saveAIDuckUsage(nextCount);
      setAiDailyCount(nextCount);
    } catch (err) {
      logEvent("identify_ai_scan_failed", user?.uid, {
        screen: "IdentifyScreen",
        source,
        message: err?.message || "Unknown error",
        platform: Platform.OS,
      });

      Alert.alert("AI Error", err.message || "Could not identify the duck. Please try again.");
      setAiModalVisible(false);
    } finally {
      setAiLoading(false);
    }
  }

  async function promptAIDuckID() {
    logEvent("identify_ai_prompt_pressed", user?.uid, {
      screen: "IdentifyScreen",
      isPro: !!isPro,
      aiDailyCount,
      aiDailyLimit: AI_DUCK_DAILY_LIMIT,
      aiUsageReady: !!aiUsageReady,
      platform: Platform.OS,
    });

    if (!isPro) {
      logEvent("identify_ai_paywall_shown", user?.uid, {
        screen: "IdentifyScreen",
        source: "prompt",
        platform: Platform.OS,
      });
      Alert.alert("Pro Feature", "AI Duck ID requires DuckSmart Pro.", [
        { text: "Not Now", style: "cancel" },
        { text: "Upgrade to Pro", onPress: purchase },
      ]);
      return;
    }

    if (!isAIAvailable()) {
      logEvent("identify_ai_not_configured", user?.uid, {
        screen: "IdentifyScreen",
        platform: Platform.OS,
      });

      Alert.alert(
        "Not Configured",
        "AI features require an OpenAI API key. Add it in app.json → extra → openaiApiKey."
      );
      return;
    }

    const usage = await loadAIDuckUsage();
    setAiDailyCount(usage.count);

    if (usage.count >= AI_DUCK_DAILY_LIMIT) {
      logEvent("identify_ai_limit_reached", user?.uid, {
        screen: "IdentifyScreen",
        source: "prompt",
        aiDailyCount: usage.count,
        aiDailyLimit: AI_DUCK_DAILY_LIMIT,
        platform: Platform.OS,
      });

      Alert.alert(
        "Limit Reached",
        "AI Duck ID is limited to 3 uses per day. You've already used 3 of 3 today."
      );
      return;
    }

    Alert.alert("AI Duck ID", "Take a photo or choose one from your gallery.", [
      { text: "Camera", onPress: () => handleAIDuckID(true) },
      { text: "Gallery", onPress: () => handleAIDuckID(false) },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  const matches = useMemo(
    () => computeIdentifyMatches({ group, habitat, size, queryText: query }),
    [group, habitat, size, query]
  );

  function toggleGroup(g) {
    logEvent("identify_filter_changed", user?.uid, {
      screen: "IdentifyScreen",
      filter: "group",
      value: g,
      platform: Platform.OS,
    });

    setGroup((prev) => (prev === g ? null : g));
    setFilterTaps((n) => n + 1);
  }

  function toggleHabitat(h) {
    logEvent("identify_filter_changed", user?.uid, {
      screen: "IdentifyScreen",
      filter: "habitat",
      value: h,
      platform: Platform.OS,
    });

    setHabitat((prev) => (prev === h ? null : h));
    setFilterTaps((n) => n + 1);
  }

  function toggleSize(sz) {
    logEvent("identify_filter_changed", user?.uid, {
      screen: "IdentifyScreen",
      filter: "size",
      value: sz,
      platform: Platform.OS,
    });

    setSize((prev) => (prev === sz ? null : sz));
    setFilterTaps((n) => n + 1);
  }

  function clearFilters() {
    logEvent("identify_filters_cleared", user?.uid, {
      screen: "IdentifyScreen",
      platform: Platform.OS,
    });

    setGroup(null);
    setHabitat(null);
    setSize(null);
    setQuery("");
  }

  const hasFilter = !!(group || habitat || size || query);
  const visibleMatchCount = matches.filter(
    ({ species }) => isPro || FREE_SPECIES_IDS.includes(species.id)
  ).length;

  return (
    <ScreenBackground style={s.safe} bg={ASSETS.backgrounds.identify}>
      <View pointerEvents="none" style={s.darkOverlay} />

      <SafeAreaView edges={["top", "left", "right"]} style={{ flex: 1 }}>
        <StatusBar barStyle="light-content" />

        <Modal
          visible={aiModalVisible}
          transparent={false}
          animationType="slide"
          onRequestClose={() => setAiModalVisible(false)}
        >
          <ScreenBackground style={s.safe} bg={ASSETS.backgrounds.identify}>
            <View pointerEvents="none" style={s.darkOverlay} />

            <SafeAreaView edges={["top", "left", "right"]} style={{ flex: 1 }}>
              <ScrollView contentContainerStyle={s.container} showsVerticalScrollIndicator={false}>
                <View style={s.topBar}>
                  <Pressable style={s.headerSide} onPress={() => setAiModalVisible(false)}>
                    <Text style={s.backText}>‹</Text>
                  </Pressable>

                  <Text style={s.screenTitle}>AI DUCK ID</Text>

                  <View style={s.aiLimitPill}>
                    <Text style={s.aiLimitPillText}>
                      {Math.min(aiDailyCount, AI_DUCK_DAILY_LIMIT)} of {AI_DUCK_DAILY_LIMIT}
                    </Text>
                  </View>
                </View>

                {aiPhoto ? (
                  <View style={s.scanHero}>
                    <Image source={{ uri: aiPhoto }} style={s.scanImage} resizeMode="cover" />
                    <View style={s.scanOverlay} />
                    <ScanCorner position="scanCornerTL" />
                    <ScanCorner position="scanCornerTR" />
                    <ScanCorner position="scanCornerBL" />
                    <ScanCorner position="scanCornerBR" />
                  </View>
                ) : null}

                {aiLoading ? (
                  <View style={s.aiLoadingBox}>
                    <ActivityIndicator size="large" color={GOLD} />
                    <Text style={s.aiLoadingText}>Analyzing duck...</Text>
                  </View>
                ) : null}

                {aiResult ? (
                  <>
                    <IdentifyCard title="IDENTIFICATION">
                      <View style={s.aiResultHeader}>
                        <View style={{ flex: 1 }}>
                          <Text style={s.aiSpeciesName}>{aiResult.species}</Text>

                          {aiResult.sex && aiResult.sex !== "Unknown" ? (
                            <Text style={s.aiSex}>Sex: {aiResult.sex}</Text>
                          ) : null}
                        </View>

                        <View
                          style={[
                            s.confidenceBadge,
                            { backgroundColor: confidenceColor(aiResult.confidence) },
                          ]}
                        >
                          <Text style={s.confidenceBadgeText}>
                            {aiResult.confidence}% Match
                          </Text>
                        </View>
                      </View>

                      <View style={s.aiConfBarBg}>
                        <View
                          style={[
                            s.aiConfBarFill,
                            {
                              width: `${Math.max(0, Math.min(100, Number(aiResult.confidence) || 0))}%`,
                              backgroundColor: confidenceColor(aiResult.confidence),
                            },
                          ]}
                        />
                      </View>
                    </IdentifyCard>

                    {aiResult.fieldMarks?.length > 0 ? (
                      <IdentifyCard title="FIELD MARKS DETECTED">
                        {aiResult.fieldMarks.map((mark, i) => (
                          <View key={i} style={s.checkRow}>
                            <Text style={s.checkIcon}>✓</Text>
                            <Text style={s.checkText}>{mark}</Text>
                          </View>
                        ))}
                      </IdentifyCard>
                    ) : null}

                    {aiResult.similarSpecies?.length > 0 ? (
                      <IdentifyCard title="SIMILAR SPECIES">
                        {aiResult.similarSpecies.map((sim, i) => (
                          <View key={i} style={s.aiSimRow}>
                            <Text style={s.aiSimName}>{sim.name}</Text>
                            <Text style={s.aiSimDist}>{sim.distinction}</Text>
                          </View>
                        ))}
                      </IdentifyCard>
                    ) : null}

                    {aiResult.notes ? (
                      <IdentifyCard title="AI NOTES">
                        <Text style={s.longText}>{aiResult.notes}</Text>
                      </IdentifyCard>
                    ) : null}

                    <Pressable style={s.primaryBtn} onPress={() => setAiModalVisible(false)}>
                      <Text style={s.primaryBtnText}>Done</Text>
                    </Pressable>
                  </>
                ) : null}

                <View style={{ height: Platform.OS === "android" ? 8 : 28 }} />
              </ScrollView>
            </SafeAreaView>
          </ScreenBackground>
        </Modal>

        <ScrollView contentContainerStyle={s.container} showsVerticalScrollIndicator={false}>
          {isPro ? (
            <IdentifyCard
              title="AI POWERED IDENTIFICATION"
              right={
                <View style={s.aiLimitPill}>
                  <Text style={s.aiLimitPillText}>
                    {aiUsageReady ? `${aiDailyCount} of ${AI_DUCK_DAILY_LIMIT}` : "..."}
                  </Text>
                </View>
              }
            >
              <Text style={s.aiUsageText}>Daily limit: {AI_DUCK_DAILY_LIMIT}</Text>
              <Text style={s.aiUsageMeta}>
                {!aiUsageReady
                  ? "Checking today's usage..."
                  : aiLimitReached
                    ? "3 of 3 used today — limit reached."
                    : `${aiDailyCount} of ${AI_DUCK_DAILY_LIMIT} used today.`}
              </Text>

              <Pressable
                style={[
                  s.primaryBtn,
                  (!aiUsageReady || aiLimitReached) ? s.primaryBtnDisabled : null,
                ]}
                onPress={promptAIDuckID}
                disabled={!aiUsageReady || aiLimitReached}
              >
                <Text
                  style={[
                    s.primaryBtnText,
                    (!aiUsageReady || aiLimitReached) ? s.primaryBtnTextDisabled : null,
                  ]}
                >
                  {aiLimitReached ? "Limit Reached" : "Take or Upload Photo"}
                </Text>
              </Pressable>
            </IdentifyCard>
          ) : (
            <IdentifyCard
              title="AI POWERED IDENTIFICATION"
              right={
                <View style={s.aiProTag}>
                  <Text style={s.aiProTagText}>PRO</Text>
                </View>
              }
            >
              <ProUpgradePrompt message="Snap a photo and let AI instantly identify the species, confidence level, and key field marks." />
            </IdentifyCard>
          )}

          <IdentifyCard title="DETAILED INFORMATION">
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search mallard, teal, white wing patch, diver..."
              placeholderTextColor="rgba(255,255,255,0.35)"
              style={s.input}
            />

            <Text style={s.helpText}>
              Search by species name, color, marking, group, or field feature.
            </Text>
          </IdentifyCard>

          <IdentifyCard
            title="BUILT FOR HUNTERS"
            right={
              hasFilter ? (
                <Pressable style={s.clearBtn} onPress={clearFilters}>
                  <Text style={s.clearBtnText}>Clear</Text>
                </Pressable>
              ) : null
            }
          >
            <IdentifySectionLabel>Group</IdentifySectionLabel>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={s.chipRow}>
                {IDENTIFY_GROUPS.map((g) => (
                  <IdentifyChip
                    key={g}
                    label={g}
                    selected={group === g}
                    onPress={() => toggleGroup(g)}
                  />
                ))}
              </View>
            </ScrollView>

            <IdentifySectionLabel>Habitat</IdentifySectionLabel>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={s.chipRow}>
                {IDENTIFY_HABITATS.map((h) => (
                  <IdentifyChip
                    key={h}
                    label={h}
                    selected={habitat === h}
                    onPress={() => toggleHabitat(h)}
                  />
                ))}
              </View>
            </ScrollView>

            <IdentifySectionLabel>Size</IdentifySectionLabel>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={s.chipRow}>
                {IDENTIFY_SIZE.map((sz) => (
                  <IdentifyChip
                    key={sz}
                    label={sz}
                    selected={size === sz}
                    onPress={() => toggleSize(sz)}
                  />
                ))}
              </View>
            </ScrollView>
          </IdentifyCard>

          <IdentifyCard
            title="MATCHES"
            right={
              hasFilter ? (
                <View style={s.sheetPill}>
                  <Text style={s.sheetPillText}>{visibleMatchCount} shown</Text>
                </View>
              ) : null
            }
          >
            {!hasFilter ? (
              <View style={s.noteBox}>
                <Text style={s.noteTextMuted}>
                  Select a group, habitat, or size above — or type a search — to find matching species.
                </Text>
              </View>
            ) : matches.length === 0 ? (
              <View style={s.noteBox}>
                <Text style={s.noteTextMuted}>
                  No matches found. Try changing filters or clear the search.
                </Text>
              </View>
            ) : (
              <>
                {matches.map(({ species, score }) => {
                  const isFree = FREE_SPECIES_IDS.includes(species.id);

                  if (!isPro && !isFree) return null;

                  return (
                    <SpeciesMatchRow
                      key={species.id}
                      species={species}
                      score={score}
                      onPress={() => navigation.navigate("SpeciesDetail", { id: species.id })}
                    />
                  );
                })}

                {!isPro && matches.some(({ species }) => !FREE_SPECIES_IDS.includes(species.id)) ? (
                  <View style={s.proUnlockBox}>
                    <Text style={s.proUnlockIcon}>🔒</Text>
                    <Text style={s.proUnlockText}>
                      Upgrade to Pro to unlock{" "}
                      {matches.filter(({ species }) => !FREE_SPECIES_IDS.includes(species.id)).length}{" "}
                      more species matching your filters.
                    </Text>
                  </View>
                ) : null}
              </>
            )}

            {filterTaps >= 10 ? (
              <Pressable
                style={[s.matchRow, { opacity: 0.7 }]}
                onPress={() => navigation.navigate("SpeciesDetail", { id: EASTER_EGG_DUCK.id })}
              >
                <View style={[s.matchThumb, s.eggThumb]}>
                  <Text style={s.eggThumbText}>?</Text>
                </View>

                <View style={s.matchContent}>
                  <Text style={[s.matchTitle, { fontStyle: "italic" }]}>Probably a Duck</Text>
                  <Text style={s.matchSub}>??? • Size: Yes</Text>
                  <Text style={s.matchHint} numberOfLines={2}>
                    May or may not have feathers — reports vary.
                  </Text>
                </View>

                <View style={s.eggScoreBubble}>
                  <Text style={s.eggScoreText}>?</Text>
                </View>
              </Pressable>
            ) : null}
          </IdentifyCard>

          <InAppSponsorAd screen="IdentifyScreen" placementId="identify_bottom_sponsor" />

          <View style={{ height: Platform.OS === "android" ? 120 : 140 }} />
        </ScrollView>
      </SafeAreaView>
    </ScreenBackground>
  );
}

function SpeciesDetail({ route, navigation }) {
  const { id } = route.params;
  const sp =
    IDENTIFY_SPECIES.find((x) => x.id === id) ||
    (id === EASTER_EGG_DUCK.id ? EASTER_EGG_DUCK : null);

  const [showFemale, setShowFemale] = useState(false);

  if (!sp) {
    return (
      <ScreenBackground style={s.safe} bg={ASSETS.backgrounds.identify}>
        <View pointerEvents="none" style={s.darkOverlay} />

        <SafeAreaView edges={["top", "left", "right"]} style={{ flex: 1 }}>
          <StatusBar barStyle="light-content" />
          <View style={[s.container, s.centered]}>
            <Text style={s.notFoundText}>Not found</Text>
          </View>
        </SafeAreaView>
      </ScreenBackground>
    );
  }

  const isEasterEgg = sp.id === EASTER_EGG_DUCK.id;
  const duckAsset = ASSETS.ducks?.[sp.name];
  const hasMaleFemale = !!(duckAsset && duckAsset.male);
  const heroSource = hasMaleFemale
    ? showFemale
      ? duckAsset.female
      : duckAsset.male
    : duckAsset || null;

  const habitats = Object.entries(sp.habitats || {});
  const keyMarks = sp.keyMarks || [];
  const lookalikes = sp.lookalikes || [];
  const tips = sp.tips || [];

  return (
    <ScreenBackground style={s.safe} bg={ASSETS.backgrounds.identify}>
      <View pointerEvents="none" style={s.darkOverlay} />

      <SafeAreaView edges={["top", "left", "right"]} style={{ flex: 1 }}>
        <StatusBar barStyle="light-content" />

        <ScrollView contentContainerStyle={s.container} showsVerticalScrollIndicator={false}>
          <View style={s.topBar}>
            <Pressable style={s.headerSide} onPress={() => navigation.goBack()}>
              <Text style={s.backText}>‹</Text>
            </Pressable>

            <Text style={s.screenTitle}>SPECIES DETAIL</Text>

            <View style={s.headerSide} />
          </View>

          <View style={s.detailTitleBlock}>
            <Text style={[s.detailTitle, isEasterEgg ? { fontStyle: "italic" } : null]}>
              {sp.name}
            </Text>
            <Text style={s.detailSub}>
              {sp.group} • {isEasterEgg ? "Size: Yes" : sp.size}
            </Text>
          </View>

          {isEasterEgg ? (
            <View style={s.heroWrap}>
              <View style={[s.heroImage, s.eggHero]}>
                <Text style={s.eggHeroQuestion}>?</Text>
                <Text style={s.eggHeroCaption}>Artist's rendering unavailable</Text>
              </View>
            </View>
          ) : heroSource ? (
            <View style={s.heroWrap}>
              <Image source={heroSource} style={s.heroImage} resizeMode="cover" />

              {hasMaleFemale ? (
                <View style={s.sexToggleRow}>
                  <Pressable
                    style={[s.sexToggleBtn, !showFemale ? s.sexToggleBtnActive : null]}
                    onPress={() => setShowFemale(false)}
                  >
                    <Text style={[s.sexToggleText, !showFemale ? s.sexToggleTextActive : null]}>
                      Drake
                    </Text>
                  </Pressable>

                  <Pressable
                    style={[s.sexToggleBtn, showFemale ? s.sexToggleBtnActive : null]}
                    onPress={() => setShowFemale(true)}
                  >
                    <Text style={[s.sexToggleText, showFemale ? s.sexToggleTextActive : null]}>
                      Hen
                    </Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          ) : null}

          <IdentifyCard title="AT-A-GLANCE">
            <View style={s.pillRow}>
              <IdentifyPill label="Group" value={sp.group} />
              <IdentifyPill label="Size" value={isEasterEgg ? "Yes" : sp.size} />
            </View>

            {sp.flightInfo ? (
              <View style={s.pillRow}>
                <IdentifyPill label="Flight" value={sp.flightInfo} />
              </View>
            ) : null}
          </IdentifyCard>

          <IdentifyCard title="HABITAT & BEHAVIOR">
            {sp.primaryHabitats ? (
              <Text style={s.longText}>{sp.primaryHabitats}</Text>
            ) : null}

            {sp.habitatBehavior ? (
              <Text style={[s.longText, { marginTop: 8 }]}>{sp.habitatBehavior}</Text>
            ) : null}

            {habitats.length > 0 ? (
              <>
                <View style={[s.pillRow, { marginTop: 12 }]}>
                  {habitats.slice(0, 3).map(([hab, rating]) => (
                    <IdentifyPill
                      key={hab}
                      label={hab}
                      value={rating}
                      color={ratingColor(rating)}
                    />
                  ))}
                </View>

                {habitats.length > 3 ? (
                  <View style={s.pillRow}>
                    {habitats.slice(3).map(([hab, rating]) => (
                      <IdentifyPill
                        key={hab}
                        label={hab}
                        value={rating}
                        color={ratingColor(rating)}
                      />
                    ))}
                  </View>
                ) : null}
              </>
            ) : null}
          </IdentifyCard>

          <IdentifyCard title="KEY FIELD MARKS">
            {keyMarks.length ? (
              keyMarks.map((m, idx) => (
                <View key={idx} style={s.bulletRow}>
                  <Text style={s.bullet}>✓</Text>
                  <Text style={s.bulletText}>{m}</Text>
                </View>
              ))
            ) : (
              <Text style={s.noteTextMuted}>No field marks listed.</Text>
            )}
          </IdentifyCard>

          <IdentifyCard title="COMMONLY MISTAKEN FOR">
            {lookalikes.length ? (
              lookalikes.map((m, idx) => (
                <View key={idx} style={s.bulletRow}>
                  <Text style={s.bullet}>•</Text>
                  <Text style={s.bulletText}>{m}</Text>
                </View>
              ))
            ) : (
              <Text style={s.noteTextMuted}>No common lookalikes listed.</Text>
            )}
          </IdentifyCard>

          <IdentifyCard title="HUNTING TIPS">
            {tips.length ? (
              tips.map((tip, idx) => (
                <View key={idx} style={s.bulletRow}>
                  <Text style={s.bullet}>•</Text>
                  <Text style={s.bulletText}>{tip}</Text>
                </View>
              ))
            ) : (
              <Text style={s.noteTextMuted}>No tips listed.</Text>
            )}
          </IdentifyCard>

          <IdentifyCard title="REGULATIONS">
            <Text style={s.longText}>
              {sp.legalNote || "Always verify current rules before hunting."}
            </Text>
            <Text style={s.disclaimer}>
              Always verify current season dates, bag limits, and species restrictions with your state wildlife agency.
            </Text>
          </IdentifyCard>

          <View style={{ height: Platform.OS === "android" ? 8 : 24 }} />
        </ScrollView>
      </SafeAreaView>
    </ScreenBackground>
  );
}

const Stack = createNativeStackNavigator();

export default function IdentifyStackScreen() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="IdentifyHome" component={IdentifyHome} />
      <Stack.Screen name="SpeciesDetail" component={SpeciesDetail} />
    </Stack.Navigator>
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
    paddingTop: 4,
    paddingBottom: Platform.OS === "android" ? 0 : 54,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  topBar: {
    height: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
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
    fontSize: 23,
    fontWeight: "900",
    letterSpacing: 0.3,
  },
  flashBtn: {
    width: 48,
    height: 42,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  flashText: {
    color: COLORS.white,
    fontSize: 30,
    fontWeight: "900",
  },

  scanHero: {
    height: 245,
    overflow: "hidden",
    backgroundColor: BG,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    marginBottom: 10,
  },
  scanImage: {
    width: "100%",
    height: "100%",
  },
  scanOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.12)",
  },
  scanCorner: {
    position: "absolute",
    width: 42,
    height: 42,
    borderColor: COLORS.white,
  },
  scanCornerTL: {
    top: 26,
    left: 26,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 6,
  },
  scanCornerTR: {
    top: 26,
    right: 26,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 6,
  },
  scanCornerBL: {
    bottom: 34,
    left: 26,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 6,
  },
  scanCornerBR: {
    bottom: 34,
    right: 26,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 6,
  },
  scanBottomDots: {
    position: "absolute",
    bottom: 12,
    alignSelf: "center",
    flexDirection: "row",
    gap: 8,
  },
  scanDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: "rgba(255,255,255,0.34)",
  },
  scanDotActive: {
    backgroundColor: GOLD,
  },

  resultCard: {
    backgroundColor: CARD,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
    marginBottom: 10,
  },
  resultHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  resultSpecies: {
    color: COLORS.white,
    fontSize: 25,
    fontWeight: "900",
  },
  resultLatin: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 15,
    fontStyle: "italic",
    fontWeight: "600",
    marginTop: 4,
  },
  confidenceBadge: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  confidenceBadgeText: {
    color: COLORS.white,
    fontSize: 13,
    fontWeight: "900",
  },
  resultDivider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.08)",
    marginVertical: 13,
  },
  keyFeaturesTitle: {
    color: COLORS.white,
    fontSize: 17,
    fontWeight: "900",
    marginBottom: 8,
  },
  checkRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 9,
  },
  checkIcon: {
    width: 21,
    height: 21,
    borderRadius: 11,
    backgroundColor: "rgba(57,217,106,0.22)",
    color: GREEN,
    textAlign: "center",
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 21,
  },
  checkText: {
    flex: 1,
    color: "rgba(255,255,255,0.84)",
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20,
  },

  card: {
    marginBottom: 10,
    backgroundColor: CARD,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 12,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  cardTitle: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 0.3,
  },
  cardBody: {
    marginTop: 10,
  },

  input: {
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 11,
    color: COLORS.white,
    fontWeight: "800",
  },
  helpText: {
    marginTop: 9,
    color: MUTED_DARK,
    fontWeight: "800",
    lineHeight: 18,
    fontSize: 12,
  },

  sectionLabel: {
    color: MUTED,
    fontSize: 11,
    fontWeight: "900",
    marginTop: 10,
    marginBottom: 7,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  chipRow: {
    flexDirection: "row",
    gap: 8,
    paddingBottom: 2,
    paddingRight: 8,
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipSelected: {
    backgroundColor: "rgba(217,168,76,0.12)",
    borderColor: GOLD,
  },
  chipUnselected: {
    backgroundColor: "rgba(255,255,255,0.035)",
    borderColor: BORDER,
  },
  chipText: {
    fontSize: 12,
    fontWeight: "800",
    color: "rgba(255,255,255,0.78)",
  },
  chipTextSelected: {
    color: GOLD,
    fontWeight: "900",
  },

  aiLimitPill: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: GOLD_BORDER,
    backgroundColor: "rgba(217,168,76,0.10)",
  },
  aiLimitPillText: {
    color: GOLD,
    fontSize: 11,
    fontWeight: "900",
  },
  aiProTag: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "rgba(217,168,76,0.14)",
    borderWidth: 1,
    borderColor: GOLD,
  },
  aiProTagText: {
    color: GOLD,
    fontSize: 10,
    fontWeight: "900",
  },
  aiUsageText: {
    color: COLORS.white,
    fontSize: 13,
    fontWeight: "900",
  },
  aiUsageMeta: {
    color: MUTED,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 5,
    lineHeight: 17,
    marginBottom: 12,
  },
  primaryBtn: {
    minHeight: 47,
    borderRadius: 14,
    backgroundColor: GOLD,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  primaryBtnDisabled: {
    opacity: 0.55,
  },
  primaryBtnText: {
    color: BG,
    fontWeight: "900",
    fontSize: 14,
  },
  primaryBtnTextDisabled: {
    color: "rgba(5,9,10,0.78)",
  },

  sheetPill: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  sheetPillText: {
    color: MUTED,
    fontSize: 11,
    fontWeight: "900",
  },
  clearBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: GOLD_BORDER,
    backgroundColor: "rgba(217,168,76,0.08)",
  },
  clearBtnText: {
    color: GOLD,
    fontSize: 11,
    fontWeight: "900",
  },

  noteBox: {
    padding: 12,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  noteTextMuted: {
    color: MUTED_DARK,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
  },

  matchRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    paddingVertical: 11,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
  },
  matchThumb: {
    width: 58,
    height: 58,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: BG,
  },
  matchThumbEmpty: {
    alignItems: "center",
    justifyContent: "center",
  },
  matchThumbText: {
    color: MUTED_DARK,
    fontSize: 20,
  },
  matchContent: {
    flex: 1,
    minWidth: 0,
  },
  matchTitle: {
    color: COLORS.white,
    fontWeight: "900",
    fontSize: 15,
  },
  matchSub: {
    color: MUTED,
    marginTop: 4,
    fontWeight: "800",
    fontSize: 12,
  },
  matchHint: {
    color: MUTED_DARK,
    marginTop: 5,
    fontWeight: "700",
    lineHeight: 17,
    fontSize: 12,
  },
  scoreBubble: {
    width: 42,
    height: 42,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: GOLD_BORDER,
    backgroundColor: "rgba(217,168,76,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  scoreBubbleText: {
    color: GOLD,
    fontWeight: "900",
    fontSize: 13,
  },
  rowChevron: {
    color: "rgba(255,255,255,0.44)",
    fontSize: 23,
    fontWeight: "900",
  },

  proUnlockBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 10,
    padding: 12,
    borderRadius: 14,
    backgroundColor: "rgba(217,168,76,0.08)",
    borderWidth: 1,
    borderColor: GOLD_BORDER,
  },
  proUnlockIcon: {
    fontSize: 18,
  },
  proUnlockText: {
    flex: 1,
    color: MUTED,
    fontWeight: "800",
    fontSize: 12,
    lineHeight: 17,
  },

  eggThumb: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(217,168,76,0.08)",
    borderColor: GOLD_BORDER,
    borderStyle: "dashed",
  },
  eggThumbText: {
    color: GOLD,
    fontSize: 23,
    fontWeight: "900",
  },
  eggScoreBubble: {
    width: 42,
    height: 42,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: GOLD_BORDER,
    borderStyle: "dashed",
    backgroundColor: "rgba(217,168,76,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  eggScoreText: {
    color: GOLD,
    fontWeight: "900",
    fontSize: 18,
  },

  aiLoadingBox: {
    paddingVertical: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  aiLoadingText: {
    color: MUTED,
    marginTop: 12,
    fontWeight: "800",
  },
  aiResultHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  aiSpeciesName: {
    color: COLORS.white,
    fontSize: 26,
    fontWeight: "900",
  },
  aiSex: {
    color: MUTED,
    fontSize: 13,
    fontWeight: "800",
    marginTop: 5,
  },
  aiConfBarBg: {
    height: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
    marginTop: 13,
  },
  aiConfBarFill: {
    height: "100%",
    borderRadius: 999,
  },
  aiSimRow: {
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
  },
  aiSimName: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: "900",
  },
  aiSimDist: {
    color: MUTED,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
    marginTop: 4,
  },

  detailTitleBlock: {
    marginBottom: 10,
  },
  detailTitle: {
    color: COLORS.white,
    fontSize: 29,
    fontWeight: "900",
    letterSpacing: -0.4,
  },
  detailSub: {
    color: GOLD,
    marginTop: 4,
    fontWeight: "800",
    fontSize: 13,
  },
  heroWrap: {
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: BG,
    marginBottom: 10,
  },
  heroImage: {
    width: "100%",
    height: 240,
  },
  sexToggleRow: {
    flexDirection: "row",
    backgroundColor: CARD,
  },
  sexToggleBtn: {
    flex: 1,
    paddingVertical: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  sexToggleBtnActive: {
    backgroundColor: "rgba(217,168,76,0.12)",
  },
  sexToggleText: {
    color: MUTED_DARK,
    fontWeight: "900",
    fontSize: 13,
  },
  sexToggleTextActive: {
    color: GOLD,
  },

  pillRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
  },
  pill: {
    flex: 1,
    padding: 11,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  pillLabel: {
    color: MUTED_DARK,
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  pillValue: {
    marginTop: 6,
    color: COLORS.white,
    fontSize: 13,
    fontWeight: "900",
  },

  bulletRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 9,
  },
  bullet: {
    color: GOLD,
    fontWeight: "900",
  },
  bulletText: {
    color: MUTED,
    fontWeight: "800",
    lineHeight: 18,
    flex: 1,
  },
  longText: {
    color: MUTED,
    fontWeight: "800",
    lineHeight: 20,
  },
  disclaimer: {
    marginTop: 12,
    color: MUTED_DARK,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
  },

  eggHero: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(217,168,76,0.08)",
  },
  eggHeroQuestion: {
    color: GOLD,
    fontSize: 70,
    fontWeight: "900",
  },
  eggHeroCaption: {
    color: MUTED,
    fontSize: 13,
    fontWeight: "800",
    marginTop: 8,
  },
  notFoundText: {
    color: COLORS.white,
    fontSize: 18,
    fontWeight: "900",
  },
});
