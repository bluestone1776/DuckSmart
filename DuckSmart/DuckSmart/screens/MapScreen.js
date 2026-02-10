import React, { useEffect, useMemo, useRef, useState } from "react";
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
import * as Location from "expo-location";

import { sharedStyles as styles } from "../constants/styles";
import { ASSETS } from "../constants/assets";
import { PIN_TYPES } from "../constants/theme";
import Chip from "../components/Chip";
import RowHeader from "../components/RowHeader";

export default function MapScreen({ pins, setPins }) {
  const mapRef = useRef(null);
  const [permissionState, setPermissionState] = useState("unknown");
  const [userLoc, setUserLoc] = useState(null);
  const [region, setRegion] = useState(null);

  const [isAddMode, setIsAddMode] = useState(false);
  const [draftCoord, setDraftCoord] = useState(null);
  const [draftType, setDraftType] = useState("Spot");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftNotes, setDraftNotes] = useState("");

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

  function goToUser() {
    if (!userLoc) return;
    const r = { ...userLoc, latitudeDelta: 0.02, longitudeDelta: 0.02 };
    setRegion(r);
    mapRef.current?.animateToRegion(r, 500);
  }

  const mapInitial = region || {
    latitude: 33.994,
    longitude: -83.382,
    latitudeDelta: 0.06,
    longitudeDelta: 0.06,
  };

  return (
    <SafeAreaView style={styles.safe}>
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
                Map \u2022 Pins & Scouting{permissionState === "denied" ? " \u2022 Location Off" : ""}
              </Text>
            </View>
          </View>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable style={styles.iconBtn} onPress={goToUser} disabled={!userLoc}>
              <Text style={styles.iconBtnText}>{"\u25CE"}</Text>
            </Pressable>
            <Pressable
              style={[styles.iconBtn, isAddMode ? styles.iconBtnActive : null]}
              onPress={isAddMode ? cancelAddPin : startAddPin}
            >
              <Text style={styles.iconBtnText}>{isAddMode ? "\u2715" : "+"}</Text>
            </Pressable>
          </View>
        </View>

        <MapView
          ref={mapRef}
          style={styles.map}
          initialRegion={mapInitial}
          onPress={onMapPress}
          showsUserLocation={permissionState === "granted"}
          showsMyLocationButton={false}
          rotateEnabled={false}
          toolbarEnabled={false}
        >
          {pins.map((p) => (
            <Marker
              key={p.id}
              coordinate={p.coordinate}
              title={p.title}
              description={`${p.type}${p.notes ? ` \u2022 ${p.notes}` : ""}`}
              onPress={() => {
                setSelectedPinId(p.id);
                setIsAddMode(false);
                setDraftCoord(null);
              }}
            />
          ))}
          {isAddMode && draftCoord ? <Marker coordinate={draftCoord} pinColor="#2ECC71" title="New Pin" /> : null}
        </MapView>

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
                      {selectedPin.type} \u2022 {selectedPin.coordinate.latitude.toFixed(5)}, {selectedPin.coordinate.longitude.toFixed(5)}
                    </Text>
                  </View>
                  <Pressable style={styles.trashBtn} onPress={deleteSelectedPin}>
                    <Text style={styles.trashBtnText}>{"\uD83D\uDDD1"}</Text>
                  </Pressable>
                </View>

                <View style={styles.noteBox}>
                  <Text style={selectedPin.notes ? styles.noteText : styles.noteTextMuted}>
                    {selectedPin.notes || "No notes yet."}
                  </Text>
                </View>

                <View style={styles.sheetBtnRow}>
                  <Pressable style={styles.secondaryBtn} onPress={() => setSelectedPinId(null)}>
                    <Text style={styles.secondaryBtnText}>Close</Text>
                  </Pressable>
                  <Pressable
                    style={styles.primaryBtn}
                    onPress={() => mapRef.current?.animateToRegion({ ...selectedPin.coordinate, latitudeDelta: 0.015, longitudeDelta: 0.015 }, 450)}
                  >
                    <Text style={styles.primaryBtnText}>Center</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                <RowHeader title="Pins" pill={`${pins.length} saved`} />
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
                  Tap <Text style={{ color: "#2ECC71", fontWeight: "900" }}>+</Text> to add a scouting pin, or tap a marker to view details.
                </Text>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </View>
    </SafeAreaView>
  );
}
