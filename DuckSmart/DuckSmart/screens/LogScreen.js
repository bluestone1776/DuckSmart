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
} from "react-native";
import Svg, { Path, Circle, Text as SvgText } from "react-native-svg";
import MapView, { Marker } from "react-native-maps";
import * as Location from "expo-location";
import * as ImagePicker from "expo-image-picker";

import { sharedStyles as styles } from "../constants/styles";
import { ENVIRONMENTS } from "../constants/theme";
import { ASSETS } from "../constants/assets";
import { SPREADS } from "../data/decoySpreadData";
import { clamp } from "../utils/helpers";
import Card from "../components/Card";
import Chip from "../components/Chip";
import Header from "../components/Header";
import { useWeather } from "../context/WeatherContext";

export default function LogScreen({ addLog, onLogout }) {
  const { weather: liveWeather } = useWeather();
  const [environment, setEnvironment] = useState("Marsh");
  const [spread, setSpread] = useState("j_hook");
  const [huntScore, setHuntScore] = useState(72);
  const [ducksHarvested, setDucksHarvested] = useState(0);
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState([]);

  const [locPerm, setLocPerm] = useState("unknown");
  const [location, setLocation] = useState(null);
  const [mapRegion, setMapRegion] = useState(null);


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
    setSpread("j_hook");
    setHuntScore(72);
    setDucksHarvested(0);
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
      ducksHarvested,
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
          <Header subtitle="Log Hunt" onGearPress={onLogout} />

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

          <Card title="Spread Layout Used">
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: "row", gap: 10, paddingBottom: 4, paddingRight: 6 }}>
                {SPREADS.filter((sp) => !sp.isAddon).map((sp) => {
                  const selected = sp.key === spread;
                  const img = ASSETS.decoys[sp.key];
                  return (
                    <Pressable
                      key={sp.key}
                      onPress={() => setSpread(sp.key)}
                      style={{
                        width: 130,
                        borderRadius: 14,
                        borderWidth: 1,
                        borderColor: selected ? "#2ECC71" : "#2C2C2C",
                        backgroundColor: selected ? "#0E1A12" : "#0E0E0E",
                        overflow: "hidden",
                      }}
                    >
                      {img && (
                        <Image
                          source={img}
                          style={{ width: 130, height: 90, borderTopLeftRadius: 14, borderTopRightRadius: 14 }}
                          resizeMode="cover"
                        />
                      )}
                      <View style={{ padding: 8 }}>
                        <Text style={{ color: selected ? "#2ECC71" : "#FFFFFF", fontSize: 12, fontWeight: "800" }} numberOfLines={1}>
                          {sp.name}
                        </Text>
                        <Text style={{ color: "#8E8E8E", fontSize: 10, fontWeight: "700", marginTop: 2 }} numberOfLines={1}>
                          {sp.type}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
          </Card>

          <Card title="Hunt Score (0–100)">
            {(() => {
              const size = 220;
              const stroke = 14;
              const radius = (size - stroke) / 2;
              const cx = size / 2;
              const cy = size / 2;
              const startX = cx - radius;
              const startY = cy;
              const endX = cx + radius;
              const endY = cy;
              const d = `M ${startX} ${startY} A ${radius} ${radius} 0 0 1 ${endX} ${endY}`;
              const p = clamp(huntScore, 0, 100) / 100;
              const angle = Math.PI * (1 - p);
              const needleX = cx + radius * Math.cos(angle);
              const needleY = cy - radius * Math.sin(angle);
              const arcColor = huntScore < 40 ? "#D94C4C" : huntScore < 70 ? "#D9A84C" : "#4CD97B";
              return (
                <View style={{ alignItems: "center" }}>
                  <Svg width={size} height={size * 0.62} viewBox={`0 0 ${size} ${size}`}>
                    <Path d={d} stroke="#2A2A2A" strokeWidth={stroke} strokeLinecap="round" fill="none" />
                    <Path d={d} stroke={arcColor} strokeWidth={stroke} strokeLinecap="round" fill="none" strokeDasharray={`${Math.PI * radius * p} ${Math.PI * radius}`} />
                    <Circle cx={needleX} cy={needleY} r={9} fill="#FFFFFF" />
                    <Circle cx={needleX} cy={needleY} r={5} fill="#0F0F0F" />
                    <SvgText x={cx} y={cy - 10} fill="#FFFFFF" fontSize="34" fontWeight="700" textAnchor="middle">
                      {Math.round(huntScore)}
                    </SvgText>
                    <SvgText x={cx} y={cy + 18} fill="#BDBDBD" fontSize="12" textAnchor="middle">
                      {huntScore >= 70 ? "Great day" : huntScore >= 45 ? "Decent" : "Grind"}
                    </SvgText>
                  </Svg>
                </View>
              );
            })()}

            <View style={{ flexDirection: "row", justifyContent: "center", gap: 16, marginTop: 10 }}>
              <Pressable onPress={() => setHuntScore((prev) => clamp(prev - 5, 0, 100))} style={styles.stepBtn}>
                <Text style={styles.stepBtnText}>–5</Text>
              </Pressable>
              <Pressable onPress={() => setHuntScore((prev) => clamp(prev - 1, 0, 100))} style={styles.stepBtn}>
                <Text style={styles.stepBtnText}>–</Text>
              </Pressable>
              <Pressable onPress={() => setHuntScore((prev) => clamp(prev + 1, 0, 100))} style={styles.stepBtn}>
                <Text style={styles.stepBtnText}>+</Text>
              </Pressable>
              <Pressable onPress={() => setHuntScore((prev) => clamp(prev + 5, 0, 100))} style={styles.stepBtn}>
                <Text style={styles.stepBtnText}>+5</Text>
              </Pressable>
            </View>
          </Card>

          <Card title="Ducks Harvested">
            <View style={{ alignItems: "center" }}>
              <Text style={{ color: "#FFFFFF", fontSize: 44, fontWeight: "900" }}>{ducksHarvested}</Text>
              <Text style={{ color: "#BDBDBD", fontWeight: "900", marginTop: 6 }}>
                {ducksHarvested === 0 ? "Skunked" : ducksHarvested >= 6 ? "Limit!" : ducksHarvested >= 3 ? "Solid bag" : "A few"}
              </Text>
            </View>
            <View style={styles.sliderRow}>
              <Pressable onPress={() => setDucksHarvested((prev) => clamp(prev - 1, 0, 50))} style={styles.stepBtn}>
                <Text style={styles.stepBtnText}>–</Text>
              </Pressable>
              <View style={styles.sliderTrack}>
                <View style={[styles.sliderFill, { width: `${clamp((ducksHarvested / 12) * 100, 0, 100)}%` }]} />
              </View>
              <Pressable onPress={() => setDucksHarvested((prev) => clamp(prev + 1, 0, 50))} style={styles.stepBtn}>
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
