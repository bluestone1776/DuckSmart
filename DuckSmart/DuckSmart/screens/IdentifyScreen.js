import React, { useMemo, useState } from "react";
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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import * as ImagePicker from "expo-image-picker";

import { COLORS } from "../constants/theme";
import { ASSETS } from "../constants/assets";
import { identifyDuck, isAIAvailable } from "../services/ai";
import { usePremium } from "../context/PremiumContext";
import ProUpgradePrompt from "../components/ProUpgradePrompt";
import ScreenBackground from "../components/ScreenBackground";
import {
  IDENTIFY_SPECIES,
  IDENTIFY_GROUPS,
  IDENTIFY_HABITATS,
  IDENTIFY_SIZE,
  FREE_SPECIES_IDS,
  EASTER_EGG_DUCK,
  computeIdentifyMatches,
} from "../data/species";

// --- Identify sub-components ---

function IdentifyCard({ title, right, children }) {
  return (
    <View style={s.card}>
      <View style={s.cardHeader}>
        <Text style={s.cardTitle}>{title}</Text>
        {right ? <View>{right}</View> : null}
      </View>
      <View style={{ marginTop: 10 }}>{children}</View>
    </View>
  );
}

function IdentifyChip({ label, selected, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={[s.chip, selected ? s.chipSelected : s.chipUnselected]}
    >
      <Text style={[s.chipText, selected ? s.chipTextSelected : null]}>{label}</Text>
    </Pressable>
  );
}

function IdentifyPill({ label, value, color }) {
  return (
    <View style={s.pill}>
      <Text style={s.pillLabel}>{label}</Text>
      <Text style={[s.pillValue, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

function IdentifySectionLabel({ children }) {
  return <Text style={s.sectionLabel}>{children}</Text>;
}

// Habitat rating color helper
function ratingColor(rating) {
  if (rating === "High") return COLORS.green;
  if (rating === "Medium") return COLORS.yellow;
  return COLORS.mutedDark;
}

// --- Home screen ---

function IdentifyHome({ navigation }) {
  const { isPro, purchase } = usePremium();
  const [group, setGroup] = useState(null);
  const [habitat, setHabitat] = useState(null);
  const [size, setSize] = useState(null);
  const [query, setQuery] = useState("");

  // AI Duck ID state
  const [aiPhoto, setAiPhoto] = useState(null);
  const [aiResult, setAiResult] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiModalVisible, setAiModalVisible] = useState(false);

  async function handleAIDuckID(useCamera) {
    if (!isPro) {
      Alert.alert("Pro Feature", "AI Duck ID requires DuckSmart Pro.", [
        { text: "Not Now", style: "cancel" },
        { text: "Upgrade to Pro", onPress: purchase },
      ]);
      return;
    }
    if (!isAIAvailable()) {
      Alert.alert("Not Configured", "AI features require an OpenAI API key. Add it in app.json → extra → openaiApiKey.");
      return;
    }

    try {
      let result;
      if (useCamera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          Alert.alert("Permission Needed", "Camera access is required for AI Duck ID.");
          return;
        }
        result = await ImagePicker.launchCameraAsync({ quality: 0.7, allowsEditing: true });
      } else {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          Alert.alert("Permission Needed", "Photo library access is required for AI Duck ID.");
          return;
        }
        result = await ImagePicker.launchImageLibraryAsync({ quality: 0.7, allowsEditing: true });
      }

      if (result.canceled || !result.assets?.length) return;

      const uri = result.assets[0].uri;
      setAiPhoto(uri);
      setAiResult(null);
      setAiLoading(true);
      setAiModalVisible(true);

      const identification = await identifyDuck(uri);
      setAiResult(identification);
    } catch (err) {
      Alert.alert("AI Error", err.message || "Could not identify the duck. Please try again.");
      setAiModalVisible(false);
    } finally {
      setAiLoading(false);
    }
  }

  function promptAIDuckID() {
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

  // Track filter interactions for easter egg reveal
  const [filterTaps, setFilterTaps] = useState(0);

  // Toggle selection — tap again to deselect
  function toggleGroup(g) { setGroup((prev) => (prev === g ? null : g)); setFilterTaps((n) => n + 1); }
  function toggleHabitat(h) { setHabitat((prev) => (prev === h ? null : h)); setFilterTaps((n) => n + 1); }
  function toggleSize(sz) { setSize((prev) => (prev === sz ? null : sz)); setFilterTaps((n) => n + 1); }

  const hasFilter = !!(group || habitat || size || query);

  return (
    <ScreenBackground style={s.safe}>
      <SafeAreaView style={{ flex: 1 }}>
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={s.container}>
        <View style={s.headerRow}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Image source={ASSETS.logo} style={s.logoSmall} resizeMode="contain" />
            <View>
              <Text style={s.brand}>
                <Text style={s.brandDuck}>Duck</Text>
                <Text style={s.brandSmart}>Smart</Text>
              </Text>
              <Text style={s.subHeader}>Identify Duck</Text>
            </View>
          </View>
          <Pressable style={[s.gearButton, { backgroundColor: isPro ? COLORS.greenBg : COLORS.bg }]} onPress={promptAIDuckID}>
            <Text style={[s.gearText, isPro && { color: COLORS.green }]}>📷</Text>
          </Pressable>
        </View>

        {/* AI Duck ID Result Modal */}
        <Modal visible={aiModalVisible} transparent={false} animationType="slide" onRequestClose={() => setAiModalVisible(false)}>
          <SafeAreaView style={[s.safe, { backgroundColor: "#000" }]}>
            <ScrollView contentContainerStyle={s.container}>
              <View style={s.detailHeader}>
                <Pressable style={s.backBtn} onPress={() => setAiModalVisible(false)}>
                  <Text style={s.backBtnText}>‹</Text>
                </Pressable>
                <View style={{ flex: 1 }}>
                  <Text style={s.detailTitle}>AI Duck ID</Text>
                  <Text style={s.detailSub}>Powered by DuckSmart AI</Text>
                </View>
              </View>

              {/* Photo */}
              {aiPhoto && (
                <Image source={{ uri: aiPhoto }} style={s.aiPhoto} resizeMode="cover" />
              )}

              {aiLoading && (
                <View style={s.aiLoadingBox}>
                  <ActivityIndicator size="large" color={COLORS.green} />
                  <Text style={s.aiLoadingText}>Analyzing duck...</Text>
                </View>
              )}

              {aiResult && (
                <>
                  {/* Species + Confidence */}
                  <IdentifyCard title="Identification">
                    <Text style={s.aiSpeciesName}>{aiResult.species}</Text>
                    <View style={s.aiConfRow}>
                      <View style={s.aiConfBarBg}>
                        <View style={[s.aiConfBarFill, {
                          width: `${aiResult.confidence}%`,
                          backgroundColor: aiResult.confidence >= 70 ? COLORS.green : aiResult.confidence >= 40 ? COLORS.yellow : COLORS.red,
                        }]} />
                      </View>
                      <Text style={s.aiConfText}>{aiResult.confidence}%</Text>
                    </View>
                    {aiResult.sex && aiResult.sex !== "Unknown" && (
                      <Text style={s.aiSex}>Sex: {aiResult.sex}</Text>
                    )}
                  </IdentifyCard>

                  {/* Field Marks */}
                  {aiResult.fieldMarks?.length > 0 && (
                    <IdentifyCard title="Field Marks Detected">
                      {aiResult.fieldMarks.map((mark, i) => (
                        <View key={i} style={s.aiMarkRow}>
                          <Text style={s.aiMarkBullet}>•</Text>
                          <Text style={s.aiMarkText}>{mark}</Text>
                        </View>
                      ))}
                    </IdentifyCard>
                  )}

                  {/* Similar Species */}
                  {aiResult.similarSpecies?.length > 0 && (
                    <IdentifyCard title="Similar Species">
                      {aiResult.similarSpecies.map((sim, i) => (
                        <View key={i} style={s.aiSimRow}>
                          <Text style={s.aiSimName}>{sim.name}</Text>
                          <Text style={s.aiSimDist}>{sim.distinction}</Text>
                        </View>
                      ))}
                    </IdentifyCard>
                  )}

                  {/* Notes */}
                  {aiResult.notes && (
                    <IdentifyCard title="AI Notes">
                      <Text style={s.aiNotes}>{aiResult.notes}</Text>
                    </IdentifyCard>
                  )}

                  <Pressable style={s.primaryBtn} onPress={() => setAiModalVisible(false)}>
                    <Text style={s.primaryBtnText}>Done</Text>
                  </Pressable>
                </>
              )}
              <View style={{ height: 30 }} />
            </ScrollView>
          </SafeAreaView>
        </Modal>

        {/* AI Duck ID promo card — shown for free users */}
        {!isPro && (
          <IdentifyCard
            title="AI Duck ID"
            right={<View style={s.aiProTag}><Text style={s.aiProTagText}>PRO</Text></View>}
          >
            <ProUpgradePrompt message="Snap a photo and let AI instantly identify the species, confidence level, and key field marks." />
          </IdentifyCard>
        )}

        <IdentifyCard title="Quick Search">
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Try: mallard, teal, white wing patch, diver..."
            placeholderTextColor="#6D6D6D"
            style={s.input}
          />
          <Text style={s.helpText}>
            Search by species name, color, marking, or group.
          </Text>
        </IdentifyCard>

        <IdentifyCard title="Filters">
          <IdentifySectionLabel>Group</IdentifySectionLabel>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={s.chipRow}>
              {IDENTIFY_GROUPS.map((g) => (
                <IdentifyChip key={g} label={g} selected={group === g} onPress={() => toggleGroup(g)} />
              ))}
            </View>
          </ScrollView>

          <IdentifySectionLabel>Habitat</IdentifySectionLabel>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={s.chipRow}>
              {IDENTIFY_HABITATS.map((h) => (
                <IdentifyChip key={h} label={h} selected={habitat === h} onPress={() => toggleHabitat(h)} />
              ))}
            </View>
          </ScrollView>

          <IdentifySectionLabel>Size</IdentifySectionLabel>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={s.chipRow}>
              {IDENTIFY_SIZE.map((sz) => (
                <IdentifyChip key={sz} label={sz} selected={size === sz} onPress={() => toggleSize(sz)} />
              ))}
            </View>
          </ScrollView>
        </IdentifyCard>

        <IdentifyCard
          title="Matches"
          right={
            hasFilter ? (
              <View style={s.sheetPill}>
                <Text style={s.sheetPillText}>{matches.filter(({ species }) => isPro || FREE_SPECIES_IDS.includes(species.id)).length} shown</Text>
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
                if (!isPro && !isFree) return null; // hide locked ducks from list
                return (
                  <Pressable
                    key={species.id}
                    onPress={() => navigation.navigate("SpeciesDetail", { id: species.id })}
                    style={s.matchRow}
                  >
                    {ASSETS.ducks[species.name] ? (
                      <Image source={ASSETS.ducks[species.name].male || ASSETS.ducks[species.name]} style={s.matchThumb} resizeMode="cover" />
                    ) : (
                      <View style={[s.matchThumb, { alignItems: "center", justifyContent: "center" }]}>
                        <Text style={{ color: COLORS.mutedDark, fontSize: 20 }}>🦆</Text>
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={s.matchTitle}>{species.name}</Text>
                      <Text style={s.matchSub}>
                        {species.group} • {species.size}
                      </Text>
                      <Text style={s.matchHint} numberOfLines={2}>
                        {species.keyMarks[0]}
                      </Text>
                    </View>
                    <View style={s.scoreBubble}>
                      <Text style={s.scoreBubbleText}>{score}</Text>
                    </View>
                  </Pressable>
                );
              })}

              {/* Pro upsell — shown to free users when there are hidden species */}
              {!isPro && matches.some(({ species }) => !FREE_SPECIES_IDS.includes(species.id)) && (
                <View style={s.proUnlockBox}>
                  <Text style={s.proUnlockIcon}>🔒</Text>
                  <Text style={s.proUnlockText}>
                    Upgrade to Pro to unlock {matches.filter(({ species }) => !FREE_SPECIES_IDS.includes(species.id)).length} more species matching your filters.
                  </Text>
                </View>
              )}
            </>
          )}

          {/* ── Easter Egg Duck — appears after 10+ filter taps ── */}
          {filterTaps >= 10 && (
            <Pressable
              style={[s.matchRow, { opacity: 0.7 }]}
              onPress={() => navigation.navigate("SpeciesDetail", { id: EASTER_EGG_DUCK.id })}
            >
              <View style={[s.matchThumb, s.eggThumb]}>
                <Text style={s.eggThumbText}>?</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.matchTitle, { fontStyle: "italic" }]}>Probably a Duck</Text>
                <Text style={s.matchSub}>??? • Size: Yes</Text>
                <Text style={s.matchHint} numberOfLines={2}>
                  May or may not have feathers — reports vary
                </Text>
              </View>
              <View style={s.eggScoreBubble}>
                <Text style={s.eggScoreText}>?</Text>
              </View>
            </Pressable>
          )}
        </IdentifyCard>

        <View style={{ height: 22 }} />
      </ScrollView>
      </SafeAreaView>
    </ScreenBackground>
  );
}

// --- Detail screen (bio page) ---

function SpeciesDetail({ route, navigation }) {
  const { id } = route.params;
  const sp = IDENTIFY_SPECIES.find((x) => x.id === id) || (id === EASTER_EGG_DUCK.id ? EASTER_EGG_DUCK : null);
  const [showFemale, setShowFemale] = useState(false);

  if (!sp) {
    return (
      <ScreenBackground style={s.safe}>
        <SafeAreaView style={{ flex: 1 }}>
        <StatusBar barStyle="light-content" />
        <View style={[s.container, { justifyContent: "center", alignItems: "center" }]}>
          <Text style={{ color: COLORS.white, fontSize: 18, fontWeight: "900" }}>Not found</Text>
          <Pressable style={[s.primaryBtn, { marginTop: 12 }]} onPress={() => navigation.goBack()}>
            <Text style={s.primaryBtnText}>Back</Text>
          </Pressable>
        </View>
        </SafeAreaView>
      </ScreenBackground>
    );
  }

  const isEasterEgg = sp.id === EASTER_EGG_DUCK.id;
  const duckAsset = ASSETS.ducks[sp.name];
  const hasMaleFemale = duckAsset && duckAsset.male;
  const heroSource = hasMaleFemale
    ? (showFemale ? duckAsset.female : duckAsset.male)
    : duckAsset || null;

  return (
    <ScreenBackground style={s.safe}>
      <SafeAreaView style={{ flex: 1 }}>
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={s.container}>
        <View style={s.detailHeader}>
          <Pressable style={s.backBtn} onPress={() => navigation.goBack()}>
            <Text style={s.backBtnText}>‹</Text>
          </Pressable>

          <View style={{ flex: 1 }}>
            <Text style={[s.detailTitle, isEasterEgg && { fontStyle: "italic" }]}>{sp.name}</Text>
            <Text style={s.detailSub}>
              {sp.group} • {isEasterEgg ? "Size: Yes" : sp.size}
            </Text>
          </View>
        </View>

        {/* Easter Egg hero — mystery blurred placeholder */}
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
                  <Text style={[s.sexToggleText, !showFemale ? s.sexToggleTextActive : null]}>Drake</Text>
                </Pressable>
                <Pressable
                  style={[s.sexToggleBtn, showFemale ? s.sexToggleBtnActive : null]}
                  onPress={() => setShowFemale(true)}
                >
                  <Text style={[s.sexToggleText, showFemale ? s.sexToggleTextActive : null]}>Hen</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* At-a-glance */}
        <IdentifyCard title="At-a-glance">
          <View style={s.pillRow}>
            <IdentifyPill label="Group" value={sp.group} />
            <IdentifyPill label="Size" value={sp.size} />
          </View>
          {sp.flightInfo ? (
            <View style={[s.pillRow, { marginTop: 0 }]}>
              <IdentifyPill label="Flight" value={sp.flightInfo} />
            </View>
          ) : null}
        </IdentifyCard>

        {/* Habitat & Behavior */}
        <IdentifyCard title="Habitat & Behavior">
          {sp.primaryHabitats ? (
            <Text style={s.longText}>{sp.primaryHabitats}</Text>
          ) : null}
          {sp.habitatBehavior ? (
            <Text style={[s.longText, { marginTop: 8 }]}>{sp.habitatBehavior}</Text>
          ) : null}
          <View style={[s.pillRow, { marginTop: 12 }]}>
            {Object.entries(sp.habitats).slice(0, 3).map(([hab, rating]) => (
              <IdentifyPill key={hab} label={hab} value={rating} color={ratingColor(rating)} />
            ))}
          </View>
          <View style={s.pillRow}>
            {Object.entries(sp.habitats).slice(3).map(([hab, rating]) => (
              <IdentifyPill key={hab} label={hab} value={rating} color={ratingColor(rating)} />
            ))}
          </View>
        </IdentifyCard>

        {/* Key field marks */}
        <IdentifyCard title="Key Field Marks">
          {sp.keyMarks.map((m, idx) => (
            <View key={idx} style={s.bulletRow}>
              <Text style={s.bullet}>•</Text>
              <Text style={s.bulletText}>{m}</Text>
            </View>
          ))}
        </IdentifyCard>

        {/* Commonly Mistaken For */}
        <IdentifyCard title="Commonly Mistaken For">
          {sp.lookalikes?.length ? (
            sp.lookalikes.map((m, idx) => (
              <View key={idx} style={s.bulletRow}>
                <Text style={s.bullet}>•</Text>
                <Text style={s.bulletText}>{m}</Text>
              </View>
            ))
          ) : (
            <Text style={s.noteTextMuted}>No common lookalikes listed.</Text>
          )}
        </IdentifyCard>

        {/* Tips */}
        <IdentifyCard title="Hunting Tips">
          {sp.tips?.map((tip, idx) => (
            <View key={idx} style={s.bulletRow}>
              <Text style={s.bullet}>•</Text>
              <Text style={s.bulletText}>{tip}</Text>
            </View>
          ))}
        </IdentifyCard>

        {/* Legal note */}
        <IdentifyCard title="Regulations">
          <Text style={s.longText}>{sp.legalNote}</Text>
          <Text style={s.disclaimer}>
            Always verify current season dates, bag limits, and species restrictions with your state wildlife agency.
          </Text>
        </IdentifyCard>

        <View style={{ height: 24 }} />
      </ScrollView>
      </SafeAreaView>
    </ScreenBackground>
  );
}

// --- Stack navigator ---

const Stack = createNativeStackNavigator();

export default function IdentifyStackScreen() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="IdentifyHome" component={IdentifyHome} />
      <Stack.Screen name="SpeciesDetail" component={SpeciesDetail} />
    </Stack.Navigator>
  );
}

// --- Styles ---

const s = StyleSheet.create({
  safe: { flex: 1 },
  container: { padding: 16, paddingBottom: 28 },

  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  logoSmall: { width: 44, height: 44, borderRadius: 12 },
  brand: { fontSize: 28, fontWeight: "800", letterSpacing: 0.2 },
  brandDuck: { color: COLORS.white },
  brandSmart: { color: COLORS.green },
  subHeader: { marginTop: 4, color: COLORS.muted, fontSize: 13 },

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

  sectionLabel: { color: COLORS.muted, fontSize: 12, fontWeight: "900", marginTop: 12, marginBottom: 8 },

  chipRow: { flexDirection: "row", gap: 10, paddingBottom: 4, paddingRight: 6 },
  chip: { paddingVertical: 9, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1 },
  chipSelected: { backgroundColor: COLORS.greenBg, borderColor: COLORS.green },
  chipUnselected: { backgroundColor: COLORS.bg, borderColor: COLORS.border },
  chipText: { fontSize: 13, fontWeight: "700", color: COLORS.white },
  chipTextSelected: { color: COLORS.green },

  helpText: { marginTop: 10, color: COLORS.mutedDark, fontWeight: "800", lineHeight: 18 },

  sheetPill: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1, borderColor: COLORS.border },
  sheetPillText: { color: COLORS.muted, fontSize: 12, fontWeight: "800" },

  matchThumb: { width: 52, height: 52, borderRadius: 14, borderWidth: 1, borderColor: COLORS.borderSubtle, backgroundColor: COLORS.bgDeep },
  matchRow: { flexDirection: "row", gap: 10, alignItems: "center", paddingVertical: 12, borderTopWidth: 1, borderTopColor: COLORS.borderSubtle },
  matchTitle: { color: COLORS.white, fontWeight: "900", fontSize: 15 },
  matchSub: { color: COLORS.muted, marginTop: 4, fontWeight: "800" },
  matchHint: { color: COLORS.mutedDark, marginTop: 6, fontWeight: "800", lineHeight: 18 },

  scoreBubble: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bgDeep,
    alignItems: "center",
    justifyContent: "center",
  },
  scoreBubbleText: { color: COLORS.green, fontWeight: "900" },

  disclaimer: { marginTop: 12, color: COLORS.mutedDarker, fontSize: 12, lineHeight: 18, fontWeight: "700" },

  noteBox: { padding: 12, borderRadius: 14, backgroundColor: COLORS.bgDeep, borderWidth: 1, borderColor: COLORS.borderSubtle, marginTop: 10 },
  noteTextMuted: { color: COLORS.mutedDark, fontSize: 13, lineHeight: 18, fontWeight: "700" },

  // Detail
  heroWrap: { marginTop: 14, borderRadius: 18, overflow: "hidden", borderWidth: 1, borderColor: COLORS.borderSubtle, backgroundColor: COLORS.bgDeepest },
  heroImage: { width: "100%", height: 240 },

  sexToggleRow: { flexDirection: "row", gap: 0, backgroundColor: COLORS.bgDeep },
  sexToggleBtn: { flex: 1, paddingVertical: 10, alignItems: "center", justifyContent: "center" },
  sexToggleBtnActive: { backgroundColor: COLORS.greenBg },
  sexToggleText: { color: COLORS.mutedDark, fontWeight: "900", fontSize: 13 },
  sexToggleTextActive: { color: COLORS.green },

  detailHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 6 },
  backBtn: { width: 42, height: 42, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.bg, alignItems: "center", justifyContent: "center" },
  backBtnText: { color: COLORS.white, fontSize: 22, fontWeight: "900", marginTop: -2 },

  detailTitle: { color: COLORS.white, fontSize: 22, fontWeight: "900" },
  detailSub: { color: COLORS.muted, marginTop: 4, fontWeight: "800" },

  pillRow: { flexDirection: "row", gap: 10, marginBottom: 10 },
  pill: { flex: 1, padding: 12, borderRadius: 14, backgroundColor: COLORS.bgDeep, borderWidth: 1, borderColor: COLORS.borderSubtle },
  pillLabel: { color: COLORS.mutedDark, fontSize: 11, fontWeight: "800" },
  pillValue: { marginTop: 6, color: COLORS.white, fontSize: 14, fontWeight: "900" },

  bulletRow: { flexDirection: "row", gap: 10, marginBottom: 8 },
  bullet: { color: COLORS.green, fontWeight: "900" },
  bulletText: { color: COLORS.muted, fontWeight: "800", lineHeight: 18, flex: 1 },

  longText: { color: COLORS.muted, fontWeight: "800", lineHeight: 20 },

  primaryBtn: { paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14, backgroundColor: COLORS.greenBg, borderWidth: 1, borderColor: COLORS.green, alignItems: "center" },
  primaryBtnText: { color: COLORS.green, fontWeight: "900" },

  // Pro unlock note
  proUnlockBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: COLORS.bgDeep,
    borderWidth: 1,
    borderColor: COLORS.yellow,
  },
  proUnlockIcon: { fontSize: 18 },
  proUnlockText: {
    flex: 1,
    color: COLORS.muted,
    fontWeight: "800",
    fontSize: 12,
    lineHeight: 17,
  },

  // Easter Egg Duck
  eggThumb: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1A1A1A",
    borderColor: COLORS.yellow,
    borderStyle: "dashed",
  },
  eggThumbText: {
    color: COLORS.yellow,
    fontSize: 24,
    fontWeight: "900",
  },
  eggScoreBubble: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.yellow,
    borderStyle: "dashed",
    backgroundColor: COLORS.bgDeep,
    alignItems: "center",
    justifyContent: "center",
  },
  eggScoreText: {
    color: COLORS.yellow,
    fontWeight: "900",
    fontSize: 18,
  },
  eggHero: {
    backgroundColor: "#111111",
    alignItems: "center",
    justifyContent: "center",
  },
  eggHeroQuestion: {
    fontSize: 72,
    fontWeight: "900",
    color: COLORS.yellow,
    opacity: 0.35,
  },
  eggHeroCaption: {
    color: COLORS.mutedDarker,
    fontSize: 12,
    fontWeight: "700",
    fontStyle: "italic",
    marginTop: -8,
  },

  // AI Duck ID
  aiProTag: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: COLORS.greenBg,
    borderWidth: 1,
    borderColor: COLORS.green,
  },
  aiProTagText: { color: COLORS.green, fontSize: 10, fontWeight: "900" },

  aiPhoto: {
    width: "100%",
    height: 260,
    borderRadius: 18,
    backgroundColor: COLORS.bgDeep,
    marginBottom: 4,
  },
  aiLoadingBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
  },
  aiLoadingText: {
    color: COLORS.muted,
    fontWeight: "800",
    fontSize: 14,
    marginTop: 14,
  },
  aiSpeciesName: {
    color: COLORS.white,
    fontSize: 24,
    fontWeight: "900",
    marginBottom: 8,
  },
  aiConfRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  aiConfBarBg: {
    flex: 1,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.bgDeep,
    overflow: "hidden",
  },
  aiConfBarFill: {
    height: 10,
    borderRadius: 5,
  },
  aiConfText: {
    color: COLORS.white,
    fontWeight: "900",
    fontSize: 16,
    width: 46,
    textAlign: "right",
  },
  aiSex: {
    color: COLORS.muted,
    fontWeight: "800",
    fontSize: 13,
    marginTop: 8,
  },
  aiMarkRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 6,
  },
  aiMarkBullet: {
    color: COLORS.green,
    fontWeight: "900",
    fontSize: 14,
    marginTop: 1,
  },
  aiMarkText: {
    color: COLORS.muted,
    fontWeight: "700",
    fontSize: 13,
    flex: 1,
    lineHeight: 18,
  },
  aiSimRow: {
    padding: 10,
    borderRadius: 12,
    backgroundColor: COLORS.bgDeep,
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
    marginBottom: 6,
  },
  aiSimName: {
    color: COLORS.white,
    fontWeight: "900",
    fontSize: 14,
  },
  aiSimDist: {
    color: COLORS.mutedDark,
    fontWeight: "700",
    fontSize: 12,
    marginTop: 4,
    lineHeight: 16,
  },
  aiNotes: {
    color: COLORS.muted,
    fontWeight: "700",
    fontSize: 13,
    lineHeight: 18,
    fontStyle: "italic",
  },
});
