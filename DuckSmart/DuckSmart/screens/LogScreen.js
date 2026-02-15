import React, { useEffect, useState } from "react";
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
  Modal,
} from "react-native";
import MapView, { Marker } from "react-native-maps";
import * as Location from "expo-location";
import * as ImagePicker from "expo-image-picker";

import { sharedStyles as styles } from "../constants/styles";
import { ENVIRONMENTS, SPREADS } from "../constants/theme";
import { ASSETS } from "../constants/assets";
import { clamp } from "../utils/helpers";
import Card from "../components/Card";
import Chip from "../components/Chip";
import Header from "../components/Header";
import { useWeather } from "../context/WeatherContext";

export default function LogScreen({ addLog }) {
  const { weather: liveWeather } = useWeather();
  const [environment, setEnvironment] = useState("Marsh");
  const [spread, setSpread] = useState("J-Hook");
  const [huntScore, setHuntScore] = useState(72);
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState([]);

  const [locPerm, setLocPerm] = useState("unknown");
  const [location, setLocation] = useState(null);
  const [mapRegion, setMapRegion] = useState(null);

  const [spreadModal, setSpreadModal] = useState(false);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setLocPerm("denied");
        return;
      }
      setLocPerm("granted");
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const coord = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      setLocation(coord);
      setMapRegion({ ...coord, latitudeDelta: 0.01, longitudeDelta: 0.01 });
    })();
  }, []);

  async function addPhotosFromLibrary() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Photos permission needed", "Enable photo access to attach pictures to your hunt log.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.85,
      selectionLimit: 6,
    });
    if (result.canceled) return;
    const picked = (result.assets || []).map((a) => ({ uri: a.uri, width: a.width, height: a.height }));
    setPhotos((prev) => [...picked, ...prev].slice(0, 12));
  }

  function removePhoto(uri) {
    setPhotos((prev) => prev.filter((p) => p.uri !== uri));
  }

  function resetForm() {
    setEnvironment("Marsh");
    setSpread("J-Hook");
    setHuntScore(72);
    setNotes("");
    setPhotos([]);
  }

  function validateAndSave() {
    if (!location) {
      Alert.alert("Missing GPS", "Wait for GPS (or enable location) before saving this hunt.");
      return;
    }
    const entry = {
      id: `hunt-${Date.now()}`,
      createdAt: Date.now(),
      dateTime: new Date().toISOString(),
      environment,
      spread,
      huntScore,
      notes: notes.trim(),
      location,
      photos,
    };
    addLog(entry);
    Alert.alert("Saved", "Your hunt log was saved (in-app memory for now).");
    resetForm();
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.container}>
          <Header subtitle="Log Hunt" />

          <Card title="GPS Location">
            {mapRegion ? (
              <View style={styles.miniMapWrap}>
                <MapView style={styles.miniMap} region={mapRegion} pointerEvents="none">
                  {location ? <Marker coordinate={location} /> : null}
                </MapView>
                <View style={styles.miniMapFooter}>
                  <Text style={styles.miniMapText}>
                    {location ? `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}` : "Getting GPS..."}
                  </Text>
                  <Text style={styles.miniMapMuted}>{locPerm === "denied" ? "Location permission denied" : "Saved with your hunt"}</Text>
                </View>
              </View>
            ) : (
              <View style={styles.noteBox}>
                <Text style={styles.noteTextMuted}>
                  {locPerm === "denied" ? "Location permission denied. Enable it to save GPS." : "Getting your GPS location..."}
                </Text>
              </View>
            )}
          </Card>

          <Card title="Environment">
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.chipRow}>
                {ENVIRONMENTS.map((env) => (
                  <Chip key={env} label={env} selected={env === environment} onPress={() => setEnvironment(env)} />
                ))}
              </View>
            </ScrollView>
          </Card>

          <Card
            title="Spread Layout Used"
            right={
              <Pressable style={styles.smallBtn} onPress={() => setSpreadModal(true)}>
                <Text style={styles.smallBtnText}>Preview</Text>
              </Pressable>
            }
          >
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.chipRow}>
                {SPREADS.map((s) => (
                  <Chip key={s} label={s} selected={s === spread} onPress={() => setSpread(s)} />
                ))}
              </View>
            </ScrollView>

            <Image source={ASSETS.spreads[spread]} style={styles.spreadThumb} resizeMode="cover" />

            <Modal visible={spreadModal} transparent animationType="fade" onRequestClose={() => setSpreadModal(false)}>
              <View style={styles.modalBackdrop}>
                <View style={styles.modalCard}>
                  <Text style={styles.modalTitle}>{spread}</Text>
                  <Image source={ASSETS.spreads[spread]} style={styles.modalImage} resizeMode="contain" />
                  <Pressable style={styles.primaryBtn} onPress={() => setSpreadModal(false)}>
                    <Text style={styles.primaryBtnText}>Close</Text>
                  </Pressable>
                </View>
              </View>
            </Modal>
          </Card>

          <Card title="Hunt Score (0–100)">
            <View style={{ alignItems: "center" }}>
              <Text style={{ color: "#FFFFFF", fontSize: 44, fontWeight: "900" }}>{huntScore}</Text>
              <Text style={{ color: "#BDBDBD", fontWeight: "900", marginTop: 6 }}>
                {huntScore >= 70 ? "Great day" : huntScore >= 45 ? "Decent" : "Grind"}
              </Text>
            </View>

            <View style={styles.sliderRow}>
              <Pressable onPress={() => setHuntScore((prev) => clamp(prev - 1, 0, 100))} style={styles.stepBtn}>
                <Text style={styles.stepBtnText}>–</Text>
              </Pressable>
              <View style={styles.sliderTrack}>
                <View style={[styles.sliderFill, { width: `${huntScore}%` }]} />
              </View>
              <Pressable onPress={() => setHuntScore((prev) => clamp(prev + 1, 0, 100))} style={styles.stepBtn}>
                <Text style={styles.stepBtnText}>+</Text>
              </Pressable>
            </View>
          </Card>

          <Card title="Weather Brief">
            <View style={styles.weatherBriefRow}>
              <View style={styles.weatherBriefPill}>
                <Text style={styles.weatherBriefLabel}>Temp</Text>
                <Text style={styles.weatherBriefValue}>
                  {liveWeather?.tempF != null ? `${liveWeather.tempF}°F` : "--°F"}
                </Text>
              </View>
              <View style={styles.weatherBriefPill}>
                <Text style={styles.weatherBriefLabel}>Barometric</Text>
                <Text style={styles.weatherBriefValue}>
                  {liveWeather?.pressureInHg != null ? `${liveWeather.pressureInHg.toFixed(2)} inHg` : "-- inHg"}
                </Text>
              </View>
              <View style={styles.weatherBriefPill}>
                <Text style={styles.weatherBriefLabel}>Wind</Text>
                <Text style={styles.weatherBriefValue}>
                  {liveWeather?.windMph != null ? `${liveWeather.windMph} mph` : "-- mph"}
                </Text>
              </View>
            </View>
            <Text style={{ color: "#7A7A7A", fontSize: 12, fontWeight: "700", marginTop: 10, lineHeight: 18 }}>
              Live weather from your current location.
            </Text>
          </Card>

          <Card title="Notes">
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="What worked? Birds seen, calling, concealment, access..."
              placeholderTextColor="#6D6D6D"
              style={[styles.input, { height: 110, textAlignVertical: "top" }]}
              multiline
            />
          </Card>

          <Card
            title="Photos"
            right={
              <Pressable style={styles.smallBtn} onPress={addPhotosFromLibrary}>
                <Text style={styles.smallBtnText}>Add</Text>
              </Pressable>
            }
          >
            {photos.length === 0 ? (
              <View style={styles.noteBox}>
                <Text style={styles.noteTextMuted}>No photos attached yet.</Text>
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.photoRow}>
                  {photos.map((p) => (
                    <Pressable key={p.uri} onLongPress={() => removePhoto(p.uri)} style={styles.photoCard}>
                      <Image source={{ uri: p.uri }} style={styles.photo} />
                      <Text style={styles.photoHint}>Hold to remove</Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
            )}
          </Card>

          <View style={styles.sheetBtnRow}>
            <Pressable style={styles.secondaryBtn} onPress={resetForm}>
              <Text style={styles.secondaryBtnText}>Reset</Text>
            </Pressable>
            <Pressable style={styles.primaryBtn} onPress={validateAndSave}>
              <Text style={styles.primaryBtnText}>Save Hunt</Text>
            </Pressable>
          </View>

          <View style={{ height: 20 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
