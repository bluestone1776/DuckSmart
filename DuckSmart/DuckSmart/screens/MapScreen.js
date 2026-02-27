import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  TextInput,
  Alert,
  Platform,
  KeyboardAvoidingView,
  Image,
  Linking,
} from "react-native";
import MapView, { Marker, UrlTile } from "react-native-maps";
import * as Location from "expo-location";
import * as FileSystem from "expo-file-system";

import { sharedStyles as styles } from "../constants/styles";
import { ASSETS } from "../constants/assets";
import { COLORS, PIN_TYPES } from "../constants/theme";
import Chip from "../components/Chip";
import RowHeader from "../components/RowHeader";
import ScreenBackground from "../components/ScreenBackground";
import { usePremium } from "../context/PremiumContext";
import { REGRID_TOKEN } from "../config";

const FREE_PIN_LIMIT = 5; // Free users: max 5 pins, Pro: unlimited

// ---------------------------------------------------------------------------
// Regrid property lines — tile URL + local cache dir
// ---------------------------------------------------------------------------
const REGRID_TILE_URL = REGRID_TOKEN
  ? `https://tiles.regrid.com/api/v1/parcels/{z}/{x}/{y}.png?token=${REGRID_TOKEN}`
  : null;

const PARCEL_CACHE_DIR = `${FileSystem.cacheDirectory}regrid_tiles/`;

export default function MapScreen({ pins, setPins }) {
  const { isPro, purchase } = usePremium();
  const mapRef = useRef(null);
  const [permissionState, setPermissionState] = useState("unknown");
  const [userLoc, setUserLoc] = useState(null);
  const [region, setRegion] = useState(null);

  const [isAddMode, setIsAddMode] = useState(false);
  const [draftCoord, setDraftCoord] = useState(null);
  const [draftType, setDraftType] = useState("Spot");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftNotes, setDraftNotes] = useState("");

  const [mapType, setMapType] = useState("hybrid"); // "standard" | "satellite" | "hybrid"
  const [showParcels, setShowParcels] = useState(false); // Property line overlay (Pro)
  const [selectedPinId, setSelectedPinId] = useState(null);
  const selectedPin = useMemo(() => pins.find((p) => p.id === selectedPinId) || null, [pins, selectedPinId]);

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          setPermissionState("denied");
          return;
        }
        setPermissionState("granted");
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const coord = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
        setUserLoc(coord);

        const initialRegion = { ...coord, latitudeDelta: 0.03, longitudeDelta: 0.03 };
        setRegion(initialRegion);
        requestAnimationFrame(() => mapRef.current?.animateToRegion(initialRegion, 650));
      } catch {
        setPermissionState("denied");
      }
    })();
  }, []);

  function startAddPin() {
    // Free users limited to FREE_PIN_LIMIT pins
    if (!isPro && pins.length >= FREE_PIN_LIMIT) {
      Alert.alert(
        "Pin Limit Reached",
        `Free accounts can save up to ${FREE_PIN_LIMIT} pins. Upgrade to DuckSmart Pro for unlimited scouting pins.`,
        [
          { text: "Not Now", style: "cancel" },
          { text: "Upgrade to Pro", onPress: purchase },
        ]
      );
      return;
    }

    setIsAddMode(true);
    setDraftCoord(null);
    setDraftTitle("");
    setDraftNotes("");
    setDraftType("Spot");
    setSelectedPinId(null);
  }

  function cancelAddPin() {
    setIsAddMode(false);
    setDraftCoord(null);
  }

  function onMapPress(e) {
    if (!isAddMode) return;
    const coord = e?.nativeEvent?.coordinate;
    if (coord) setDraftCoord(coord);
  }

  function savePin() {
    if (!draftCoord) {
      Alert.alert("Drop a pin", "Tap the map to choose a pin location.");
      return;
    }
    const title = draftTitle.trim() || `${draftType} Pin`;
    const notes = draftNotes.trim();

    const newPin = {
      id: `pin-${Date.now()}`,
      title,
      type: draftType,
      notes,
      coordinate: draftCoord,
      createdAt: Date.now(),
    };
    setPins((prev) => [newPin, ...prev]);
    setIsAddMode(false);
    setDraftCoord(null);

    requestAnimationFrame(() => {
      mapRef.current?.animateToRegion({ ...draftCoord, latitudeDelta: 0.02, longitudeDelta: 0.02 }, 500);
    });
  }

  function deleteSelectedPin() {
    if (!selectedPin) return;
    Alert.alert("Delete pin?", selectedPin.title, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          setPins((prev) => prev.filter((p) => p.id !== selectedPin.id));
          setSelectedPinId(null);
        },
      },
    ]);
  }

  function toggleParcels() {
    if (!isPro) {
      Alert.alert(
        "Pro Feature",
        "Property line overlays require DuckSmart Pro. See parcel boundaries, owner info, and lot lines on the map.",
        [
          { text: "Not Now", style: "cancel" },
          { text: "Upgrade to Pro", onPress: purchase },
        ]
      );
      return;
    }
    if (!REGRID_TILE_URL) {
      Alert.alert("Not Configured", "Property lines are not available yet. Check back soon!");
      return;
    }
    setShowParcels((prev) => !prev);
  }

  function goToUser() {
    if (!userLoc) return;
    const r = { ...userLoc, latitudeDelta: 0.02, longitudeDelta: 0.02 };
    setRegion(r);
    mapRef.current?.animateToRegion(r, 500);
  }

  function navigateToPin() {
    if (!selectedPin) return;
    const { latitude, longitude } = selectedPin.coordinate;
    const label = encodeURIComponent(selectedPin.title);

    // Try Google Maps first, fall back to Apple Maps
    const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}&travelmode=driving`;
    const appleMapsUrl = `maps://app?daddr=${latitude},${longitude}&dirflg=d&t=h`;

    const url = Platform.OS === "ios" ? appleMapsUrl : googleMapsUrl;

    Linking.canOpenURL(url)
      .then((supported) => {
        if (supported) {
          Linking.openURL(url);
        } else {
          // Fallback to Google Maps web URL
          Linking.openURL(googleMapsUrl);
        }
      })
      .catch(() => Linking.openURL(googleMapsUrl));
  }

  const mapInitial = region || {
    latitude: 33.994,
    longitude: -83.382,
    latitudeDelta: 0.06,
    longitudeDelta: 0.06,
  };

  return (
    <ScreenBackground style={styles.safe}>
      <SafeAreaView style={{ flex: 1 }}>
      <StatusBar barStyle="light-content" />
      <View style={styles.mapWrap}>
        <View style={styles.mapTopBar}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Image source={ASSETS.logo} style={styles.logoSmall} resizeMode="contain" />
            <View>
              <Text style={styles.brandSmall}>
                <Text style={styles.brandDuck}>Duck</Text>
                <Text style={styles.brandSmart}>Smart</Text>
              </Text>
              <Text style={styles.subHeaderSmall}>
                Map • Pins & Scouting{permissionState === "denied" ? " • Location Off" : ""}
              </Text>
            </View>
          </View>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable
              style={styles.iconBtn}
              onPress={() => setMapType((prev) => prev === "standard" ? "satellite" : prev === "satellite" ? "hybrid" : "standard")}
            >
              <Text style={styles.iconBtnText}>{mapType === "standard" ? "🗺" : mapType === "satellite" ? "🛰" : "🛰"}</Text>
            </Pressable>
            <Pressable
              style={[styles.iconBtn, showParcels ? styles.iconBtnActive : null]}
              onPress={toggleParcels}
            >
              <Text style={styles.iconBtnText}>▦</Text>
            </Pressable>
            <Pressable style={styles.iconBtn} onPress={goToUser} disabled={!userLoc}>
              <Text style={styles.iconBtnText}>◎</Text>
            </Pressable>
            <Pressable
              style={[styles.iconBtn, isAddMode ? styles.iconBtnActive : null]}
              onPress={isAddMode ? cancelAddPin : startAddPin}
            >
              <Text style={styles.iconBtnText}>{isAddMode ? "✕" : "+"}</Text>
            </Pressable>
          </View>
        </View>

        <MapView
          ref={mapRef}
          style={styles.map}
          mapType={mapType}
          initialRegion={mapInitial}
          onPress={onMapPress}
          showsUserLocation={permissionState === "granted"}
          showsMyLocationButton={false}
          rotateEnabled={false}
          toolbarEnabled={false}
        >
          {pins.map((p) => {
            const pinType = PIN_TYPES.find((t) => t.key === p.type);
            const pinColor = pinType?.color || "#2ECC71";
            return (
              <Marker
                key={p.id}
                coordinate={p.coordinate}
                title={p.title}
                description={`${p.type}${p.notes ? ` • ${p.notes}` : ""}`}
                pinColor={pinColor}
                onPress={() => {
                  setSelectedPinId(p.id);
                  setIsAddMode(false);
                  setDraftCoord(null);
                }}
              />
            );
          })}
          {isAddMode && draftCoord ? <Marker coordinate={draftCoord} pinColor="#2ECC71" title="New Pin" /> : null}

          {/* Regrid property line tiles — Pro only */}
          {showParcels && REGRID_TILE_URL && (
            <UrlTile
              urlTemplate={REGRID_TILE_URL}
              zIndex={2}
              opacity={0.65}
              minimumZ={10}
              maximumZ={21}
              tileSize={256}
              tileCachePath={PARCEL_CACHE_DIR}
            />
          )}
        </MapView>

        {/* Property lines active indicator */}
        {showParcels && (
          <View style={localStyles.parcelBadge}>
            <Text style={localStyles.parcelBadgeText}>▦ Property Lines</Text>
            <Pressable onPress={() => setShowParcels(false)}>
              <Text style={localStyles.parcelBadgeClose}>✕</Text>
            </Pressable>
          </View>
        )}

        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={styles.sheet}>
            {isAddMode ? (
              <>
                <RowHeader title="Add Pin" pill={draftCoord ? "Tap Save" : "Tap map to drop"} />

                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.chipRow}>
                    {PIN_TYPES.map((t) => (
                      <Chip key={t.key} label={t.label} selected={draftType === t.key} onPress={() => setDraftType(t.key)} />
                    ))}
                  </View>
                </ScrollView>

                <View style={{ marginTop: 10 }}>
                  <Text style={styles.inputLabel}>Title</Text>
                  <TextInput
                    value={draftTitle}
                    onChangeText={setDraftTitle}
                    placeholder="e.g., South timber hole"
                    placeholderTextColor="#6D6D6D"
                    style={styles.input}
                  />
                </View>

                <View style={{ marginTop: 10 }}>
                  <Text style={styles.inputLabel}>Notes</Text>
                  <TextInput
                    value={draftNotes}
                    onChangeText={setDraftNotes}
                    placeholder="Wind, access, birds seen, hazards..."
                    placeholderTextColor="#6D6D6D"
                    style={[styles.input, { height: 78, textAlignVertical: "top" }]}
                    multiline
                  />
                </View>

                <View style={styles.sheetBtnRow}>
                  <Pressable style={styles.secondaryBtn} onPress={cancelAddPin}>
                    <Text style={styles.secondaryBtnText}>Cancel</Text>
                  </Pressable>
                  <Pressable style={styles.primaryBtn} onPress={savePin}>
                    <Text style={styles.primaryBtnText}>Save Pin</Text>
                  </Pressable>
                </View>
              </>
            ) : selectedPin ? (
              <>
                <View style={styles.sheetHeaderRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sheetTitle}>{selectedPin.title}</Text>
                    <Text style={styles.sheetSub}>
                      {selectedPin.type} • {selectedPin.coordinate.latitude.toFixed(5)}, {selectedPin.coordinate.longitude.toFixed(5)}
                    </Text>
                  </View>
                  <Pressable style={styles.trashBtn} onPress={deleteSelectedPin}>
                    <Text style={styles.trashBtnText}>🗑</Text>
                  </Pressable>
                </View>

                <View style={styles.noteBox}>
                  <Text style={selectedPin.notes ? styles.noteText : styles.noteTextMuted}>
                    {selectedPin.notes || "No notes yet."}
                  </Text>
                </View>

                {/* Easter egg — appears on "Spot" type pins */}
                {selectedPin.type === "Spot" && (
                  <Text style={localStyles.eggHint}>At least 12 people know about this.</Text>
                )}

                <View style={styles.sheetBtnRow}>
                  <Pressable style={styles.secondaryBtn} onPress={() => setSelectedPinId(null)}>
                    <Text style={styles.secondaryBtnText}>Close</Text>
                  </Pressable>
                  <Pressable
                    style={styles.secondaryBtn}
                    onPress={() => mapRef.current?.animateToRegion({ ...selectedPin.coordinate, latitudeDelta: 0.015, longitudeDelta: 0.015 }, 450)}
                  >
                    <Text style={styles.secondaryBtnText}>Center</Text>
                  </Pressable>
                  <Pressable style={styles.primaryBtn} onPress={navigateToPin}>
                    <Text style={styles.primaryBtnText}>Navigate</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                <RowHeader
                  title="Pins"
                  pill={isPro ? `${pins.length} saved` : `${pins.length}/${FREE_PIN_LIMIT}`}
                />
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.pinListRow}>
                    {pins.slice(0, 10).map((p) => (
                      <Pressable
                        key={p.id}
                        style={styles.pinPill}
                        onPress={() => {
                          setSelectedPinId(p.id);
                          mapRef.current?.animateToRegion({ ...p.coordinate, latitudeDelta: 0.02, longitudeDelta: 0.02 }, 450);
                        }}
                      >
                        <Text style={styles.pinPillType}>{p.type}</Text>
                        <Text style={styles.pinPillTitle} numberOfLines={1}>
                          {p.title}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </ScrollView>
                <Text style={styles.sheetHint}>
                  {!isPro && pins.length >= FREE_PIN_LIMIT
                    ? "Pin limit reached — upgrade to Pro for unlimited pins."
                    : <>Tap <Text style={{ color: "#2ECC71", fontWeight: "900" }}>+</Text> to add a scouting pin, or tap a marker to view details.</>}
                </Text>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </View>
      </SafeAreaView>
    </ScreenBackground>
  );
}

// ---------------------------------------------------------------------------
// Local styles (MapScreen-specific, not shared)
// ---------------------------------------------------------------------------
const localStyles = StyleSheet.create({
  parcelBadge: {
    position: "absolute",
    bottom: 180,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: "rgba(14,26,18,0.92)",
    borderWidth: 1,
    borderColor: COLORS.green,
  },
  parcelBadgeText: {
    color: COLORS.green,
    fontSize: 12,
    fontWeight: "900",
  },
  parcelBadgeClose: {
    color: COLORS.muted,
    fontSize: 14,
    fontWeight: "700",
    marginLeft: 4,
  },
  eggHint: {
    color: COLORS.mutedDarker,
    fontSize: 11,
    fontWeight: "700",
    fontStyle: "italic",
    textAlign: "center",
    marginTop: 6,
    opacity: 0.5,
  },
});
