import React, { useMemo, useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  StatusBar,
  TextInput,
  Image,
} from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { COLORS } from "../constants/theme";
import { ASSETS } from "../constants/assets";
import {
  IDENTIFY_SPECIES,
  IDENTIFY_REGIONS,
  IDENTIFY_HABITATS,
  IDENTIFY_SIZE,
  IDENTIFY_FLIGHT,
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

function IdentifyPill({ label, value }) {
  return (
    <View style={s.pill}>
      <Text style={s.pillLabel}>{label}</Text>
      <Text style={s.pillValue}>{value}</Text>
    </View>
  );
}

function IdentifySectionLabel({ children }) {
  return <Text style={s.sectionLabel}>{children}</Text>;
}

// --- Home screen ---

function IdentifyHome({ navigation }) {
  const [region, setRegion] = useState("Southeast");
  const [habitat, setHabitat] = useState("Marsh");
  const [size, setSize] = useState("Medium");
  const [flightTags, setFlightTags] = useState([]);
  const [query, setQuery] = useState("");

  const matches = useMemo(
    () => computeIdentifyMatches({ region, habitat, size, flightTags, queryText: query }),
    [region, habitat, size, flightTags, query]
  );

  function toggleFlight(tag) {
    setFlightTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={s.container}>
        <View style={s.headerRow}>
          <View>
            <Text style={s.brand}>
              <Text style={s.brandDuck}>Duck</Text>
              <Text style={s.brandSmart}>Smart</Text>
            </Text>
            <Text style={s.subHeader}>Identify Duck</Text>
          </View>
          <Pressable style={s.gearButton} onPress={() => {}}>
            <Text style={s.gearText}>⚙︎</Text>
          </Pressable>
        </View>

        <View style={{ marginTop: 14, padding: 14, borderRadius: 16, backgroundColor: "#0E1A12", borderWidth: 1, borderColor: "#2ECC71" }}>
          <Text style={{ color: "#2ECC71", fontWeight: "900", fontSize: 13 }}>Free Version</Text>
          <Text style={{ color: "#BDBDBD", fontWeight: "800", fontSize: 13, marginTop: 6, lineHeight: 18 }}>
            Upgrade to the paid version for more species, detailed images, range maps, and AI-powered identification.
          </Text>
        </View>

        <IdentifyCard title="Quick Search">
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Try: mallard, teal, white wing patch, diver..."
            placeholderTextColor="#6D6D6D"
            style={s.input}
          />
          <Text style={s.helpText}>
            Use this if you already noticed a key feature (color patch, size, or species name).
          </Text>
        </IdentifyCard>

        <IdentifyCard title="Guided Filters">
          <IdentifySectionLabel>Region</IdentifySectionLabel>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={s.chipRow}>
              {IDENTIFY_REGIONS.map((r) => (
                <IdentifyChip key={r} label={r} selected={region === r} onPress={() => setRegion(r)} />
              ))}
            </View>
          </ScrollView>

          <IdentifySectionLabel>Habitat</IdentifySectionLabel>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={s.chipRow}>
              {IDENTIFY_HABITATS.map((h) => (
                <IdentifyChip key={h} label={h} selected={habitat === h} onPress={() => setHabitat(h)} />
              ))}
            </View>
          </ScrollView>

          <IdentifySectionLabel>Size</IdentifySectionLabel>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={s.chipRow}>
              {IDENTIFY_SIZE.map((sz) => (
                <IdentifyChip key={sz} label={sz} selected={size === sz} onPress={() => setSize(sz)} />
              ))}
            </View>
          </ScrollView>

          <IdentifySectionLabel>Flight Style (pick any)</IdentifySectionLabel>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={s.chipRow}>
              {IDENTIFY_FLIGHT.map((f) => (
                <IdentifyChip key={f} label={f} selected={flightTags.includes(f)} onPress={() => toggleFlight(f)} />
              ))}
            </View>
          </ScrollView>
        </IdentifyCard>

        <IdentifyCard
          title="Likely Matches"
          right={
            <View style={s.sheetPill}>
              <Text style={s.sheetPillText}>{matches.length} shown</Text>
            </View>
          }
        >
          {matches.length === 0 ? (
            <View style={s.noteBox}>
              <Text style={s.noteTextMuted}>
                No matches found. Try changing habitat/size or clear the search.
              </Text>
            </View>
          ) : (
            matches.map(({ species, score }) => (
              <Pressable
                key={species.id}
                onPress={() => navigation.navigate("SpeciesDetail", { id: species.id })}
                style={s.matchRow}
              >
                {ASSETS.ducks[species.name] ? (
                  <Image source={ASSETS.ducks[species.name]} style={s.matchThumb} resizeMode="cover" />
                ) : null}
                <View style={{ flex: 1 }}>
                  <Text style={s.matchTitle}>{species.name}</Text>
                  <Text style={s.matchSub}>
                    {species.group} • {species.size} • {species.habitats.join(", ")}
                  </Text>
                  <Text style={s.matchHint} numberOfLines={2}>
                    {species.keyMarks[0]}
                  </Text>
                </View>

                <View style={s.scoreBubble}>
                  <Text style={s.scoreBubbleText}>{score}</Text>
                </View>
              </Pressable>
            ))
          )}

          <Text style={s.disclaimer}>
            Legal note: this MVP uses built-in info only. We'll add state/zone regulations later from an authoritative source.
          </Text>
        </IdentifyCard>

        <View style={{ height: 22 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// --- Detail screen ---

function SpeciesDetail({ route, navigation }) {
  const { id } = route.params;
  const sp = IDENTIFY_SPECIES.find((x) => x.id === id);

  if (!sp) {
    return (
      <SafeAreaView style={s.safe}>
        <StatusBar barStyle="light-content" />
        <View style={[s.container, { justifyContent: "center", alignItems: "center" }]}>
          <Text style={{ color: COLORS.white, fontSize: 18, fontWeight: "900" }}>Not found</Text>
          <Pressable style={[s.primaryBtn, { marginTop: 12 }]} onPress={() => navigation.goBack()}>
            <Text style={s.primaryBtnText}>Back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={s.container}>
        <View style={s.detailHeader}>
          <Pressable style={s.backBtn} onPress={() => navigation.goBack()}>
            <Text style={s.backBtnText}>‹</Text>
          </Pressable>

          <View style={{ flex: 1 }}>
            <Text style={s.detailTitle}>{sp.name}</Text>
            <Text style={s.detailSub}>
              {sp.group} • {sp.size}
            </Text>
          </View>
        </View>

        {ASSETS.ducks[sp.name] ? (
          <View style={s.heroWrap}>
            <Image source={ASSETS.ducks[sp.name]} style={s.heroImage} resizeMode="cover" />
          </View>
        ) : null}

        <IdentifyCard title="At-a-glance">
          <View style={s.pillRow}>
            <IdentifyPill label="Group" value={sp.group.split(" ")[0]} />
            <IdentifyPill label="Size" value={sp.size} />
            <IdentifyPill label="Habitat" value={sp.habitats[0]} />
          </View>
          <View style={s.pillRow}>
            <IdentifyPill label="Flight" value={sp.flightStyle[0]} />
            <IdentifyPill label="Region" value={sp.regions[0]} />
            <IdentifyPill label="Lookalike" value={sp.lookalikes?.[0] || "-"} />
          </View>
        </IdentifyCard>

        <IdentifyCard title="Key Field Marks">
          {sp.keyMarks.map((m, idx) => (
            <View key={idx} style={s.bulletRow}>
              <Text style={s.bullet}>•</Text>
              <Text style={s.bulletText}>{m}</Text>
            </View>
          ))}
        </IdentifyCard>

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

        <IdentifyCard title="Habitat & Behavior">
          <Text style={s.longText}>
            Habitats: {sp.habitats.join(", ")}
            {"\n"}Flight: {sp.flightStyle.join(", ")}
            {"\n"}Regions: {sp.regions.join(", ")}
          </Text>
          <View style={s.noteBox}>
            <Text style={s.noteTextMuted}>
              {sp.tips.join("\n\n")}
            </Text>
          </View>
        </IdentifyCard>

        <IdentifyCard title="Legality (MVP)">
          <Text style={s.longText}>{sp.legalNote}</Text>
          <Text style={s.disclaimer}>
            We'll add real regulations by state/zone + season dates in a later phase.
          </Text>
        </IdentifyCard>

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
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
  safe: { flex: 1, backgroundColor: COLORS.black },
  container: { padding: 16, paddingBottom: 28, backgroundColor: COLORS.black },

  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
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
  heroImage: { width: "100%", height: 200 },

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
});
