// /Users/gozyr/Development/ducksmart/DuckSmart/DuckSmart/components/PropertySearchBar.js
// /Users/gozyr/Development/ducksmart/DuckSmart/DuckSmart/components/PropertySearchBar.js

import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Modal,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from "react-native";

import { COLORS } from "../constants/theme";
import { searchParcelsByOwner } from "../services/mapSearch";

const GOLD = "#D9A84C";
const BG = "#05090A";
const CARD = "rgba(18,20,18,0.98)";
const CARD_DEEP = "rgba(8,10,9,0.96)";
const CARD_SOFT = "rgba(255,255,255,0.055)";
const BORDER = "rgba(255,255,255,0.10)";
const GOLD_BORDER = "rgba(217,168,76,0.34)";
const MUTED = "rgba(255,255,255,0.66)";
const MUTED_DARK = "rgba(255,255,255,0.44)";
const RED = "#FF4D4D";

const RESULTS_PAGE_SIZE = 10;
const SEARCH_LIMIT = 10;

const STATES = [
  { label: "Alabama", value: "AL" },
  { label: "Alaska", value: "AK" },
  { label: "Arizona", value: "AZ" },
  { label: "Arkansas", value: "AR" },
  { label: "California", value: "CA" },
  { label: "Colorado", value: "CO" },
  { label: "Connecticut", value: "CT" },
  { label: "Delaware", value: "DE" },
  { label: "Florida", value: "FL" },
  { label: "Georgia", value: "GA" },
  { label: "Hawaii", value: "HI" },
  { label: "Idaho", value: "ID" },
  { label: "Illinois", value: "IL" },
  { label: "Indiana", value: "IN" },
  { label: "Iowa", value: "IA" },
  { label: "Kansas", value: "KS" },
  { label: "Kentucky", value: "KY" },
  { label: "Louisiana", value: "LA" },
  { label: "Maine", value: "ME" },
  { label: "Maryland", value: "MD" },
  { label: "Massachusetts", value: "MA" },
  { label: "Michigan", value: "MI" },
  { label: "Minnesota", value: "MN" },
  { label: "Mississippi", value: "MS" },
  { label: "Missouri", value: "MO" },
  { label: "Montana", value: "MT" },
  { label: "Nebraska", value: "NE" },
  { label: "Nevada", value: "NV" },
  { label: "New Hampshire", value: "NH" },
  { label: "New Jersey", value: "NJ" },
  { label: "New Mexico", value: "NM" },
  { label: "New York", value: "NY" },
  { label: "North Carolina", value: "NC" },
  { label: "North Dakota", value: "ND" },
  { label: "Ohio", value: "OH" },
  { label: "Oklahoma", value: "OK" },
  { label: "Oregon", value: "OR" },
  { label: "Pennsylvania", value: "PA" },
  { label: "Rhode Island", value: "RI" },
  { label: "South Carolina", value: "SC" },
  { label: "South Dakota", value: "SD" },
  { label: "Tennessee", value: "TN" },
  { label: "Texas", value: "TX" },
  { label: "Utah", value: "UT" },
  { label: "Vermont", value: "VT" },
  { label: "Virginia", value: "VA" },
  { label: "Washington", value: "WA" },
  { label: "West Virginia", value: "WV" },
  { label: "Wisconsin", value: "WI" },
  { label: "Wyoming", value: "WY" },
  { label: "District of Columbia", value: "DC" },
];

function getFeatureTitle(feature) {
  return (
    feature?.properties?.ducksmartOwner ||
    feature?.properties?.owner ||
    feature?.properties?.owner_name ||
    feature?.properties?.ownername ||
    "Owner not listed"
  );
}

function getFeatureAddress(feature) {
  return (
    feature?.properties?.ducksmartAddress ||
    feature?.properties?.headline ||
    feature?.properties?.address ||
    feature?.properties?.situs_address ||
    "Address not listed"
  );
}

function getFeatureParcelNumber(feature) {
  return (
    feature?.properties?.ducksmartParcelNumber ||
    feature?.properties?.parcelnumb ||
    feature?.properties?.parcel_number ||
    feature?.properties?.apn ||
    "Parcel number not listed"
  );
}

function getFeatureAcres(feature) {
  return (
    feature?.properties?.ducksmartAcres ||
    feature?.properties?.ll_gisacre ||
    feature?.properties?.gisacre ||
    feature?.properties?.acres ||
    null
  );
}

function getFeatureCounty(feature) {
  return (
    feature?.properties?.ducksmartCounty ||
    feature?.properties?.county ||
    feature?.properties?.county_name ||
    null
  );
}

function getFeaturePath(feature) {
  return feature?.properties?.ducksmartPath || feature?.properties?.path || null;
}

function getFeatureKey(feature, index = 0) {
  return (
    feature?.id ||
    feature?.properties?.id ||
    feature?.properties?.parcelnumb ||
    feature?.properties?.parcel_number ||
    feature?.properties?.ducksmartParcelNumber ||
    `property-${index}`
  );
}

function getStateLabel(stateValue) {
  const match = STATES.find((item) => item.value === stateValue);
  return match ? `${match.label} (${match.value})` : "Select a state";
}

function makeFeatureCollection(features, selectedFeature = null) {
  const safeFeatures = Array.isArray(features) ? features : [];

  if (!selectedFeature) {
    return {
      type: "FeatureCollection",
      features: safeFeatures,
    };
  }

  const selectedId = getFeatureKey(selectedFeature, 0);

  const orderedFeatures = [
    selectedFeature,
    ...safeFeatures.filter((feature, index) => {
      return getFeatureKey(feature, index) !== selectedId;
    }),
  ];

  return {
    type: "FeatureCollection",
    features: orderedFeatures,
  };
}

export default function PropertySearchBar({
  visible,
  onClose,
  onResults,
  onClear,
}) {
  const [owner, setOwner] = useState("");
  const [state, setState] = useState("");
  const [county, setCounty] = useState("");
  const [stateDropdownOpen, setStateDropdownOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [visibleCount, setVisibleCount] = useState(RESULTS_PAGE_SIZE);
  const [selectedFeature, setSelectedFeature] = useState(null);

  const cleanOwner = owner.trim();
  const cleanState = state.trim().toUpperCase();
  const cleanCounty = county.trim();

  const resultFeatures = useMemo(() => {
    return Array.isArray(lastResult?.featureCollection?.features)
      ? lastResult.featureCollection.features
      : [];
  }, [lastResult]);

  const visibleFeatures = useMemo(() => {
    return resultFeatures.slice(0, visibleCount);
  }, [resultFeatures, visibleCount]);

  const selectedDetails = useMemo(() => {
    if (!selectedFeature) return [];

    return [
      { label: "Owner", value: getFeatureTitle(selectedFeature) },
      { label: "Address", value: getFeatureAddress(selectedFeature) },
      { label: "Parcel #", value: getFeatureParcelNumber(selectedFeature) },
      getFeatureAcres(selectedFeature)
        ? { label: "Acres", value: getFeatureAcres(selectedFeature) }
        : null,
      getFeatureCounty(selectedFeature)
        ? { label: "County", value: getFeatureCounty(selectedFeature) }
        : null,
      getFeaturePath(selectedFeature)
        ? { label: "Regrid Path", value: getFeaturePath(selectedFeature) }
        : null,
    ].filter(Boolean);
  }, [selectedFeature]);

  const selectedFeatureKey = selectedFeature ? getFeatureKey(selectedFeature, 0) : null;
  const hasMoreResults = visibleCount < resultFeatures.length;
  const canSearch = cleanOwner.length >= 4 && cleanState.length === 2 && !loading;

  function resetAndClose() {
    setStateDropdownOpen(false);
    onClose?.();
  }

  function clearResults() {
    setLastResult(null);
    setSelectedFeature(null);
    setVisibleCount(RESULTS_PAGE_SIZE);
    onClear?.();
  }

  function clearSearchForm() {
    setOwner("");
    setState("");
    setCounty("");
    setStateDropdownOpen(false);
    clearResults();
  }

  function selectState(value) {
    setState(value);
    setStateDropdownOpen(false);
  }

  function loadMoreResults() {
    setVisibleCount((prev) =>
      Math.min(prev + RESULTS_PAGE_SIZE, resultFeatures.length)
    );
  }

  function selectResult(feature) {
    setSelectedFeature(feature);

    const featureCollection = makeFeatureCollection(resultFeatures, feature);
    onResults?.(featureCollection);

    setTimeout(() => {
      onClose?.();
    }, 100);
  }

  function showAllOnMap() {
    if (!resultFeatures.length) return;

    const featureCollection = makeFeatureCollection(resultFeatures, selectedFeature);
    onResults?.(featureCollection);

    setTimeout(() => {
      onClose?.();
    }, 100);
  }

  async function handleSearch() {
    if (cleanOwner.length < 4) {
      Alert.alert(
        "Owner Name Needed",
        "Enter at least 4 characters of the owner or business name."
      );
      return;
    }

    if (cleanState.length !== 2) {
      Alert.alert("State Needed", "Select a state before searching.");
      return;
    }

    try {
      setLoading(true);
      setStateDropdownOpen(false);
      setVisibleCount(RESULTS_PAGE_SIZE);
      setSelectedFeature(null);

      const result = await searchParcelsByOwner({
        owner: cleanOwner,
        state: cleanState,
        county: cleanCounty,
        limit: SEARCH_LIMIT,
      });

      const features = Array.isArray(result?.featureCollection?.features)
        ? result.featureCollection.features
        : [];

      setLastResult(result);

      if (features.length > 0) {
        const firstFeature = features[0];
        setSelectedFeature(firstFeature);
        onResults?.(makeFeatureCollection(features, firstFeature));
      } else {
        onClear?.();
      }

      if (!features.length) {
        Alert.alert(
          "No Properties Found",
          cleanCounty
            ? `No matching properties were found for that owner name in ${cleanCounty} County, ${cleanState}.`
            : "No matching properties were found for that owner name in that state."
        );
      }
    } catch (err) {
      Alert.alert(
        "Property Search Failed",
        err?.message || "Could not search property owners right now."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      visible={!!visible}
      transparent
      animationType="fade"
      onRequestClose={resetAndClose}
    >
      <KeyboardAvoidingView
        style={s.backdrop}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={s.panel}>
          <View style={s.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.kicker}>PROPERTY SEARCH</Text>
              <Text style={s.title}>Search Landowner Records</Text>
              <Text style={s.subtitle}>
                Search by owner or business name. Add a county to keep results from pulling across the whole state.
              </Text>
            </View>

            <Pressable style={s.closeBtn} onPress={resetAndClose}>
              <Text style={s.closeText}>✕</Text>
            </Pressable>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="always"
            contentContainerStyle={s.scrollContent}
          >
            <Text style={s.label}>Owner / Business Name</Text>
            <TextInput
              value={owner}
              onChangeText={setOwner}
              placeholder="Example: Smith or Mallard Farms LLC"
              placeholderTextColor="rgba(255,255,255,0.34)"
              autoCapitalize="words"
              autoCorrect={false}
              style={s.input}
              returnKeyType="next"
            />

            <Text style={s.label}>State</Text>
            <Pressable
              style={[
                s.dropdownButton,
                stateDropdownOpen ? s.dropdownButtonActive : null,
              ]}
              onPress={() => setStateDropdownOpen((prev) => !prev)}
            >
              <Text
                style={[
                  s.dropdownButtonText,
                  cleanState ? s.dropdownButtonTextSelected : null,
                ]}
              >
                {getStateLabel(cleanState)}
              </Text>

              <Text style={s.dropdownChevron}>
                {stateDropdownOpen ? "⌃" : "⌄"}
              </Text>
            </Pressable>

            {stateDropdownOpen ? (
              <View style={s.dropdownMenu}>
                <ScrollView
                  nestedScrollEnabled
                  showsVerticalScrollIndicator
                  keyboardShouldPersistTaps="always"
                  style={s.dropdownScroll}
                >
                  {STATES.map((item) => {
                    const selected = cleanState === item.value;

                    return (
                      <Pressable
                        key={item.value}
                        style={[
                          s.dropdownItem,
                          selected ? s.dropdownItemSelected : null,
                        ]}
                        onPress={() => selectState(item.value)}
                      >
                        <Text
                          style={[
                            s.dropdownItemText,
                            selected ? s.dropdownItemTextSelected : null,
                          ]}
                        >
                          {item.label}
                        </Text>

                        <Text
                          style={[
                            s.dropdownItemCode,
                            selected ? s.dropdownItemTextSelected : null,
                          ]}
                        >
                          {item.value}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            ) : null}

            <Text style={s.label}>County</Text>
            <TextInput
              value={county}
              onChangeText={setCounty}
              placeholder="Optional — example: Burke"
              placeholderTextColor="rgba(255,255,255,0.34)"
              autoCapitalize="words"
              autoCorrect={false}
              style={s.input}
              returnKeyType="search"
              onSubmitEditing={handleSearch}
            />

            <Text style={s.countyNote}>
              County is optional, but it keeps owner search from pulling results across the whole state.
            </Text>

            <View style={s.buttonRow}>
              <Pressable
                style={[s.secondaryBtn, loading ? s.disabledBtn : null]}
                onPress={clearSearchForm}
                disabled={loading}
              >
                <Text style={s.secondaryBtnText}>Clear</Text>
              </Pressable>

              <Pressable
                style={[s.primaryBtn, !canSearch ? s.disabledBtn : null]}
                onPress={handleSearch}
                disabled={!canSearch}
              >
                {loading ? (
                  <ActivityIndicator color={BG} />
                ) : (
                  <Text style={s.primaryBtnText}>Search Properties</Text>
                )}
              </Pressable>
            </View>

            <Text style={s.usageNote}>
              Results display up to 10 at a time. Tap any result row to open it on the map.
            </Text>

            {selectedFeature ? (
              <View style={s.selectedBox}>
                <View style={s.selectedHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.selectedKicker}>SELECTED PARCEL</Text>
                    <Text style={s.selectedTitle} numberOfLines={1}>
                      {getFeatureTitle(selectedFeature)}
                    </Text>
                  </View>

                  <Pressable style={s.viewMapBtn} onPress={showAllOnMap}>
                    <Text style={s.viewMapText}>View Map</Text>
                  </Pressable>
                </View>

                {selectedDetails.map((item) => (
                  <View key={item.label} style={s.detailRow}>
                    <Text style={s.detailLabel}>{item.label}</Text>
                    <Text style={s.detailValue}>{item.value}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {lastResult ? (
              <View style={s.resultsBox}>
                <View style={s.resultsHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.resultsTitle}>
                      {resultFeatures.length} Result
                      {resultFeatures.length === 1 ? "" : "s"}
                    </Text>
                    <Text style={s.resultsSub}>
                      Showing {Math.min(visibleCount, resultFeatures.length)} of{" "}
                      {resultFeatures.length} • {lastResult.owner} •{" "}
                      {cleanCounty ? `${cleanCounty} County, ` : ""}
                      {lastResult.statePath || cleanState}
                    </Text>
                  </View>

                  <Pressable style={s.showOnMapBtn} onPress={showAllOnMap}>
                    <Text style={s.showOnMapText}>Map</Text>
                  </Pressable>
                </View>

                {visibleFeatures.length > 0 ? (
                  <>
                    {visibleFeatures.map((feature, index) => {
                      const featureKey = getFeatureKey(feature, index);
                      const isSelected = selectedFeatureKey === featureKey;

                      return (
                        <TouchableOpacity
                          key={featureKey}
                          activeOpacity={0.65}
                          style={[
                            s.resultRow,
                            isSelected ? s.resultRowSelected : null,
                          ]}
                          onPress={() => selectResult(feature)}
                        >
                          <View style={s.resultTopRow}>
                            <View
                              style={[
                                s.resultNumberBubble,
                                isSelected ? s.resultNumberBubbleSelected : null,
                              ]}
                            >
                              <Text
                                style={[
                                  s.resultNumberText,
                                  isSelected ? s.resultNumberTextSelected : null,
                                ]}
                              >
                                {index + 1}
                              </Text>
                            </View>

                            <View style={{ flex: 1, minWidth: 0 }}>
                              <Text style={s.resultOwner} numberOfLines={1}>
                                {getFeatureTitle(feature)}
                              </Text>
                              <Text style={s.resultAddress} numberOfLines={2}>
                                {getFeatureAddress(feature)}
                              </Text>
                              <Text style={s.resultParcel} numberOfLines={1}>
                                Parcel: {getFeatureParcelNumber(feature)}
                              </Text>

                              {getFeatureCounty(feature) ? (
                                <Text style={s.resultCounty} numberOfLines={1}>
                                  County: {getFeatureCounty(feature)}
                                </Text>
                              ) : null}

                              <Text style={s.tapHint}>
                                Tap to open parcel details on map
                              </Text>
                            </View>

                            <View style={s.openPill}>
                              <Text style={s.openPillText}>Open</Text>
                            </View>
                          </View>
                        </TouchableOpacity>
                      );
                    })}

                    {hasMoreResults ? (
                      <Pressable style={s.loadMoreBtn} onPress={loadMoreResults}>
                        <Text style={s.loadMoreText}>Load 10 More</Text>
                      </Pressable>
                    ) : (
                      <Text style={s.endText}>End of results</Text>
                    )}
                  </>
                ) : (
                  <View style={s.emptyBox}>
                    <Text style={s.emptyTitle}>No matching parcels</Text>
                    <Text style={s.emptyText}>
                      Try a different spelling, business name, state, or county.
                    </Text>
                  </View>
                )}
              </View>
            ) : null}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.72)",
    alignItems: "center",
    justifyContent: "center",
    padding: 14,
  },

  panel: {
    width: "100%",
    maxHeight: "90%",
    borderRadius: 22,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: GOLD_BORDER,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 10,
  },

  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    backgroundColor: "rgba(217,168,76,0.08)",
  },

  kicker: {
    color: GOLD,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.2,
  },

  title: {
    color: COLORS.white,
    fontSize: 21,
    fontWeight: "900",
    marginTop: 4,
  },

  subtitle: {
    color: MUTED,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
    marginTop: 6,
  },

  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 10,
  },

  closeText: {
    color: COLORS.white,
    fontSize: 17,
    fontWeight: "900",
  },

  scrollContent: {
    padding: 16,
    paddingBottom: 20,
  },

  label: {
    color: MUTED,
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 12,
  },

  input: {
    minHeight: 50,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "rgba(255,255,255,0.045)",
    color: COLORS.white,
    paddingHorizontal: 13,
    paddingVertical: 10,
    fontSize: 14,
    fontWeight: "800",
  },

  countyNote: {
    color: MUTED_DARK,
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 16,
    marginTop: 8,
  },

  dropdownButton: {
    minHeight: 50,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "rgba(255,255,255,0.045)",
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  dropdownButtonActive: {
    borderColor: GOLD,
    backgroundColor: "rgba(217,168,76,0.10)",
  },

  dropdownButtonText: {
    color: "rgba(255,255,255,0.42)",
    fontSize: 14,
    fontWeight: "800",
  },

  dropdownButtonTextSelected: {
    color: COLORS.white,
  },

  dropdownChevron: {
    color: GOLD,
    fontSize: 20,
    fontWeight: "900",
    marginLeft: 10,
  },

  dropdownMenu: {
    marginTop: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: CARD_DEEP,
    overflow: "hidden",
  },

  dropdownScroll: {
    maxHeight: 230,
  },

  dropdownItem: {
    minHeight: 44,
    paddingHorizontal: 13,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  dropdownItemSelected: {
    backgroundColor: "rgba(217,168,76,0.14)",
  },

  dropdownItemText: {
    color: COLORS.white,
    fontSize: 13,
    fontWeight: "800",
  },

  dropdownItemCode: {
    color: MUTED_DARK,
    fontSize: 12,
    fontWeight: "900",
  },

  dropdownItemTextSelected: {
    color: GOLD,
  },

  buttonRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 18,
  },

  secondaryBtn: {
    flex: 1,
    height: 50,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: CARD_SOFT,
    alignItems: "center",
    justifyContent: "center",
  },

  secondaryBtnText: {
    color: COLORS.white,
    fontSize: 13,
    fontWeight: "900",
  },

  primaryBtn: {
    flex: 2,
    height: 50,
    borderRadius: 16,
    backgroundColor: GOLD,
    alignItems: "center",
    justifyContent: "center",
  },

  primaryBtnText: {
    color: BG,
    fontSize: 13,
    fontWeight: "900",
  },

  disabledBtn: {
    opacity: 0.5,
  },

  usageNote: {
    color: MUTED_DARK,
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 16,
    textAlign: "center",
    marginTop: 12,
  },

  selectedBox: {
    marginTop: 16,
    borderRadius: 18,
    backgroundColor: "rgba(217,168,76,0.10)",
    borderWidth: 1,
    borderColor: GOLD_BORDER,
    padding: 12,
  },

  selectedHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },

  selectedKicker: {
    color: GOLD,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.9,
  },

  selectedTitle: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: "900",
    marginTop: 3,
  },

  viewMapBtn: {
    minWidth: 78,
    height: 36,
    borderRadius: 12,
    backgroundColor: GOLD,
    alignItems: "center",
    justifyContent: "center",
  },

  viewMapText: {
    color: BG,
    fontSize: 12,
    fontWeight: "900",
  },

  detailRow: {
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
    paddingTop: 8,
    marginTop: 8,
  },

  detailLabel: {
    color: MUTED_DARK,
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },

  detailValue: {
    color: COLORS.white,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 17,
    marginTop: 3,
  },

  resultsBox: {
    marginTop: 16,
    borderRadius: 18,
    backgroundColor: "rgba(5,10,11,0.82)",
    borderWidth: 1,
    borderColor: BORDER,
    padding: 12,
  },

  resultsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },

  resultsTitle: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: "900",
  },

  resultsSub: {
    color: MUTED_DARK,
    fontSize: 11,
    fontWeight: "800",
    marginTop: 4,
  },

  showOnMapBtn: {
    minWidth: 62,
    height: 38,
    borderRadius: 13,
    backgroundColor: "rgba(217,168,76,0.12)",
    borderWidth: 1,
    borderColor: GOLD,
    alignItems: "center",
    justifyContent: "center",
  },

  showOnMapText: {
    color: GOLD,
    fontSize: 12,
    fontWeight: "900",
  },

  resultRow: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.035)",
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 15,
    marginTop: 9,
  },

  resultRowSelected: {
    backgroundColor: "rgba(217,168,76,0.12)",
    borderColor: "rgba(217,168,76,0.38)",
  },

  resultTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },

  resultNumberBubble: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(217,168,76,0.13)",
    borderWidth: 1,
    borderColor: "rgba(217,168,76,0.35)",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },

  resultNumberBubbleSelected: {
    backgroundColor: GOLD,
    borderColor: GOLD,
  },

  resultNumberText: {
    color: GOLD,
    fontSize: 11,
    fontWeight: "900",
  },

  resultNumberTextSelected: {
    color: BG,
  },

  resultOwner: {
    color: COLORS.white,
    fontSize: 13,
    fontWeight: "900",
  },

  resultAddress: {
    color: MUTED,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 17,
    marginTop: 4,
  },

  resultParcel: {
    color: GOLD,
    fontSize: 11,
    fontWeight: "800",
    marginTop: 4,
  },

  resultCounty: {
    color: MUTED,
    fontSize: 11,
    fontWeight: "800",
    marginTop: 4,
  },

  tapHint: {
    color: MUTED_DARK,
    fontSize: 10,
    fontWeight: "800",
    marginTop: 5,
  },

  openPill: {
    minWidth: 48,
    height: 30,
    borderRadius: 999,
    backgroundColor: "rgba(217,168,76,0.14)",
    borderWidth: 1,
    borderColor: GOLD,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },

  openPillText: {
    color: GOLD,
    fontSize: 11,
    fontWeight: "900",
  },

  loadMoreBtn: {
    height: 44,
    borderRadius: 15,
    marginTop: 12,
    backgroundColor: "rgba(217,168,76,0.12)",
    borderWidth: 1,
    borderColor: GOLD,
    alignItems: "center",
    justifyContent: "center",
  },

  loadMoreText: {
    color: GOLD,
    fontSize: 13,
    fontWeight: "900",
  },

  endText: {
    color: MUTED_DARK,
    fontSize: 11,
    fontWeight: "800",
    textAlign: "center",
    marginTop: 12,
  },

  emptyBox: {
    padding: 14,
    borderRadius: 15,
    backgroundColor: "rgba(255,77,77,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,77,77,0.25)",
    marginTop: 6,
  },

  emptyTitle: {
    color: RED,
    fontSize: 13,
    fontWeight: "900",
    textAlign: "center",
  },

  emptyText: {
    color: MUTED,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
    textAlign: "center",
    marginTop: 5,
  },
});