//screens/LogScreen.js

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  FlatList,
  StatusBar,
  TextInput,
  Alert,
  Platform,
  KeyboardAvoidingView,
  Image,
  Modal,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as Location from "expo-location";
import * as ImagePicker from "expo-image-picker";
import { useNavigation } from "@react-navigation/native";
import { doc, setDoc } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";

import { sharedStyles as styles } from "../constants/styles";
import { COLORS, ENVIRONMENTS, PIN_TYPES } from "../constants/theme";
import { ASSETS } from "../constants/assets";
import { SPREADS } from "../data/decoySpreadData";
import { IDENTIFY_SPECIES } from "../data/species";
import { clamp } from "../utils/helpers";
import { scoreHuntToday } from "../utils/scoring";
import Chip from "../components/Chip";
import ScreenBackground from "../components/ScreenBackground";
import { useWeather } from "../context/WeatherContext";
import { usePremium } from "../context/PremiumContext";
import { useAuth } from "../context/AuthContext";
import { showInterstitialAd } from "../services/ads";
import { logHuntLogged } from "../services/analytics";
import { db, storage } from "../services/firebase";

const FREE_HUNT_LOG_LIMIT = 5;
const FREE_PIN_LIMIT = 5;

const HUNT_BROWN = "#1A120D";
const HUNT_BROWN_CARD = "rgba(20, 14, 10, 0.94)";
const HUNT_BROWN_CARD_2 = "rgba(27, 18, 12, 0.96)";
const HUNT_BORDER = "rgba(217,168,76,0.20)";
const HUNT_GOLD = "#D9A84C";
const HUNT_MUTED = "rgba(255,255,255,0.58)";
const HUNT_TEXT_SOFT = "rgba(255,255,255,0.42)";

function pad2(v) {
  return `${v}`.padStart(2, "0");
}

function mergeDateAndTime(dateObj, timeObj) {
  const merged = new Date(dateObj);
  merged.setHours(timeObj.getHours(), timeObj.getMinutes(), 0, 0);
  return merged;
}

function formatDateLabel(date) {
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTimeLabel(date) {
  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatWeatherSummary(weather) {
  const temp =
    weather?.tempF != null
      ? `${Math.round(weather.tempF)}°F`
      : weather?.temperature != null
        ? `${Math.round(weather.temperature)}°F`
        : "--°F";

  const condition =
    weather?.condition ||
    weather?.shortForecast ||
    weather?.description ||
    weather?.weather ||
    "Forecast";

  const windSpeed =
    weather?.windMph != null
      ? `${Math.round(weather.windMph)} mph`
      : weather?.windSpeed != null
        ? `${Math.round(weather.windSpeed)} mph`
        : "-- mph";

  const windDir = weather?.windDir || weather?.windDirection || "";

  return `${temp} • ${condition} • ${windSpeed}${windDir ? ` ${windDir}` : ""}`;
}

function formatPressure(value) {
  if (value == null || Number.isNaN(Number(value))) return "-- inHg";
  return `${Number(value).toFixed(2)} inHg`;
}

function getImageExtension(uri) {
  const cleanUri = String(uri || "").split("?")[0];
  const lastPart = cleanUri.split("/").pop() || "";
  const ext = lastPart.includes(".") ? lastPart.split(".").pop().toLowerCase() : "";

  if (["jpg", "jpeg", "png", "webp", "heic"].includes(ext)) {
    return ext;
  }

  return "jpg";
}

function getContentTypeFromExtension(ext) {
  switch (ext) {
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "heic":
      return "image/heic";
    case "jpg":
    case "jpeg":
    default:
      return "image/jpeg";
  }
}

function getDuckAsset(speciesName, showFemale = false) {
  const duckAsset = ASSETS.ducks?.[speciesName];

  if (!duckAsset) return null;

  if (duckAsset.male || duckAsset.female) {
    return showFemale ? duckAsset.female || duckAsset.male : duckAsset.male || duckAsset.female;
  }

  return duckAsset;
}

function hasFemaleDuckAsset(speciesName) {
  const duckAsset = ASSETS.ducks?.[speciesName];
  return !!(duckAsset?.male && duckAsset?.female);
}

function isRemoteUri(uri) {
  return typeof uri === "string" && /^https?:\/\//i.test(uri);
}

function normalizeImage(image) {
  if (!image) return null;

  if (typeof image === "string") {
    return {
      uri: image,
      width: null,
      height: null,
    };
  }

  if (!image.uri) return null;

  return {
    uri: image.uri,
    width: Number.isFinite(Number(image.width)) ? Number(image.width) : null,
    height: Number.isFinite(Number(image.height)) ? Number(image.height) : null,
  };
}

async function uploadHuntImageToFirebase({ uid, logId, image, index, prefix }) {
  const normalized = normalizeImage(image);

  if (!normalized?.uri) return null;

  if (isRemoteUri(normalized.uri)) {
    return normalized;
  }

  const ext = getImageExtension(normalized.uri);
  const contentType = getContentTypeFromExtension(ext);
  const fileName = `${prefix}_${index}_${Date.now()}.${ext}`;
  const imageRef = ref(storage, `users/${uid}/hunt-photos/${logId}/${fileName}`);

  const response = await fetch(normalized.uri);
  const blob = await response.blob();

  const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
  if (blob.size > MAX_PHOTO_BYTES) {
    throw new Error("One of the selected images is over 10 MB.");
  }

  await uploadBytes(imageRef, blob, { contentType });

  const downloadUrl = await getDownloadURL(imageRef);

  return {
    ...normalized,
    uri: downloadUrl,
    downloadUrl,
    storagePath: `users/${uid}/hunt-photos/${logId}/${fileName}`,
  };
}

async function uploadLogImagesToFirebase({ uid, logId, photos, spreadPhoto }) {
  if (!uid) {
    throw new Error("You must be signed in to save log photos.");
  }

  const uploadedPhotos = [];

  const sourcePhotos = Array.isArray(photos) ? photos.slice(0, 12) : [];

  for (let i = 0; i < sourcePhotos.length; i += 1) {
    const uploaded = await uploadHuntImageToFirebase({
      uid,
      logId,
      image: sourcePhotos[i],
      index: i,
      prefix: "photo",
    });

    if (uploaded) uploadedPhotos.push(uploaded);
  }

  const uploadedSpreadPhoto = spreadPhoto
    ? await uploadHuntImageToFirebase({
        uid,
        logId,
        image: spreadPhoto,
        index: 0,
        prefix: "spread_photo",
      })
    : null;

  return {
    photos: uploadedPhotos,
    spreadPhoto: uploadedSpreadPhoto,
  };
}

function LogRow({
  icon,
  label,
  value,
  subvalue,
  onPress,
  hideChevron = false,
  compact = false,
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={[local.rowCard, compact ? local.rowCardCompact : null]}
    >
      <View style={local.rowIconWrap}>
        <Text style={local.rowIcon}>{icon}</Text>
      </View>

      <View style={local.rowTextWrap}>
        <Text style={local.rowLabel}>{label}</Text>
        <Text style={local.rowValue} numberOfLines={2}>
          {value}
        </Text>
        {subvalue ? (
          <Text style={local.rowSubvalue} numberOfLines={1}>
            {subvalue}
          </Text>
        ) : null}
      </View>

      {!hideChevron ? <Text style={local.rowChevron}>›</Text> : null}
    </Pressable>
  );
}

function WeatherForecastRow({ value, onPress }) {
  return (
    <Pressable onPress={onPress} style={local.weatherForecastCard}>
      <View style={local.weatherIconWrap}>
        <Text style={local.weatherIcon}>⛅</Text>
      </View>

      <View style={local.weatherTextWrap}>
        <Text style={local.weatherLabel}>WEATHER FORECAST</Text>
        <Text style={local.weatherValue} numberOfLines={1}>
          {value}
        </Text>
      </View>

      <Text style={local.weatherChevron}>›</Text>
    </Pressable>
  );
}

function SectionCard({ title, children, style }) {
  return (
    <View style={[local.sectionCard, style]}>
      {title ? <Text style={local.sectionTitle}>{title}</Text> : null}
      {children}
    </View>
  );
}

function CounterRow({ value, onMinus, onPlus }) {
  return (
    <View style={local.counterRow}>
      <Pressable onPress={onMinus} style={local.counterBtn}>
        <Text style={local.counterBtnText}>−</Text>
      </Pressable>

      <View style={local.counterCenter}>
        <Text style={local.counterNumber}>{value}</Text>
      </View>

      <Pressable onPress={onPlus} style={local.counterBtn}>
        <Text style={local.counterBtnText}>+</Text>
      </Pressable>
    </View>
  );
}

function ScoutSpeciesCard({ species, selected, onPress }) {
  const imageSource = getDuckAsset(species.name);

  return (
    <Pressable
      onPress={onPress}
      style={[local.speciesCard, selected ? local.speciesCardSelected : null]}
    >
      {imageSource ? (
        <Image source={imageSource} style={local.speciesThumb} resizeMode="cover" />
      ) : (
        <View style={[local.speciesThumb, local.speciesThumbEmpty]}>
          <Text style={local.speciesThumbText}>🦆</Text>
        </View>
      )}

      <Text
        style={[local.speciesName, selected ? local.speciesNameSelected : null]}
        numberOfLines={1}
      >
        {species.name}
      </Text>
      <Text style={local.speciesMeta} numberOfLines={1}>
        {species.group} • {species.size}
      </Text>
    </Pressable>
  );
}

const ScoutSpeciesPickerRow = React.memo(function ScoutSpeciesPickerRow({
  species,
  count,
  onOpen,
  onAdd,
  onRemove,
}) {
  const imageSource = getDuckAsset(species.name);

  return (
    <View style={local.scoutSpeciesRow}>
      <Pressable style={local.scoutSpeciesInfo} onPress={() => onOpen(species)}>
        {imageSource ? (
          <Image
            source={imageSource}
            style={local.scoutSpeciesRowThumb}
            resizeMode="cover"
          />
        ) : (
          <View style={[local.scoutSpeciesRowThumb, local.speciesThumbEmpty]}>
            <Text style={local.speciesThumbText}>🦆</Text>
          </View>
        )}

        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={local.scoutSpeciesRowName} numberOfLines={1}>
            {species.name}
          </Text>
          <Text style={local.scoutSpeciesRowMeta} numberOfLines={1}>
            {species.group} • {species.size}
          </Text>
        </View>
      </Pressable>

      <View style={local.scoutSpeciesCounter}>
        <Pressable onPress={() => onRemove(species.id)} style={local.scoutSpeciesCounterBtn}>
          <Text style={local.scoutSpeciesCounterBtnText}>−</Text>
        </Pressable>

        <Text style={local.scoutSpeciesCount}>{count}</Text>

        <Pressable onPress={() => onAdd(species.id)} style={local.scoutSpeciesCounterBtn}>
          <Text style={local.scoutSpeciesCounterBtnText}>+</Text>
        </Pressable>
      </View>
    </View>
  );
});

function SelectionModal({ visible, title, onClose, children }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={local.modalBackdrop}>
        <View style={local.selectModalCard}>
          <View style={local.selectModalHeader}>
            <Text style={local.selectModalTitle}>{title}</Text>
            <Pressable onPress={onClose} style={local.selectModalCloseBtn}>
              <Text style={local.selectModalCloseText}>✕</Text>
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>{children}</ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export default function LogScreen({
  route,
  addLog,
  addPin,
  pins = [],
  logs = [],
}) {
  const navigation = useNavigation();
  const { weather: liveWeather } = useWeather();
  const { isPro, purchase } = usePremium();
  const { user } = useAuth();

  const hunt = scoreHuntToday(liveWeather);
  const huntScore = hunt.score;

  const now = new Date();
  const defaultStart = new Date(now);
  defaultStart.setHours(6, 30, 0, 0);
  const defaultEnd = new Date(now);
  defaultEnd.setHours(10, 15, 0, 0);

  const [activeLogType, setActiveLogType] = useState("hunt");
  const [huntDate, setHuntDate] = useState(new Date());
  const [tempHuntDate, setTempHuntDate] = useState(new Date());
  const [startTime, setStartTime] = useState(defaultStart);
  const [endTime, setEndTime] = useState(defaultEnd);

  const [environment, setEnvironment] = useState("Marsh");
  const [spread, setSpread] = useState("j_hook");
  const [spreadOtherText, setSpreadOtherText] = useState("");
  const [spreadPhoto, setSpreadPhoto] = useState(null);
  const [ducksHarvested, setDucksHarvested] = useState(0);
  const [crippledBirds, setCrippledBirds] = useState(0);
  const [hunters, setHunters] = useState(1);
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState([]);
  const [selectedPinId, setSelectedPinId] = useState(null);
  const [selectedScoutSpeciesIds, setSelectedScoutSpeciesIds] = useState([]);
  const [speciesModalVisible, setSpeciesModalVisible] = useState(false);
  const [speciesPickerVisible, setSpeciesPickerVisible] = useState(false);
  const [selectedSpeciesId, setSelectedSpeciesId] = useState(null);
  const [showFemaleSpecies, setShowFemaleSpecies] = useState(false);

  const [locPerm, setLocPerm] = useState("unknown");
  const [location, setLocation] = useState(null);

  const [savePinModalVisible, setSavePinModalVisible] = useState(false);
  const [pendingHuntEntry, setPendingHuntEntry] = useState(null);
  const [newPinName, setNewPinName] = useState("");

  const [pinPickerVisible, setPinPickerVisible] = useState(false);
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [timePickerVisible, setTimePickerVisible] = useState(false);
  const [timePickerTarget, setTimePickerTarget] = useState("start");
  const [saving, setSaving] = useState(false);

  const isScoutLog = activeLogType === "scout";
  const activeLogLabel = isScoutLog ? "Scout" : "Hunt";
  const activeLogLabelLower = isScoutLog ? "scout" : "hunt";

  const selectedPin = useMemo(
    () => pins.find((pin) => pin.id === selectedPinId) || null,
    [pins, selectedPinId]
  );

  const selectedSpread = useMemo(
    () => SPREADS.find((sp) => sp.key === spread) || null,
    [spread]
  );

const scoutSpeciesList = useMemo(
  () => [...IDENTIFY_SPECIES].sort((a, b) => a.name.localeCompare(b.name)),
  []
);

const selectedScoutSpecies = useMemo(() => {
  return scoutSpeciesList
    .map((sp) => {
      const count = selectedScoutSpeciesIds.filter((id) => id === sp.id).length;

      return {
        id: sp.id,
        name: sp.name,
        group: sp.group,
        size: sp.size,
        count,
      };
    })
    .filter((sp) => sp.count > 0);
}, [scoutSpeciesList, selectedScoutSpeciesIds]);

  const selectedSpecies = useMemo(
    () => IDENTIFY_SPECIES.find((sp) => sp.id === selectedSpeciesId) || null,
    [selectedSpeciesId]
  );

  const selectedSpeciesImage = selectedSpecies
    ? getDuckAsset(selectedSpecies.name, showFemaleSpecies)
    : null;
  const selectedSpeciesHasFemale = selectedSpecies
    ? hasFemaleDuckAsset(selectedSpecies.name)
    : false;

  useEffect(() => {
    const routePinId = route?.params?.selectedPinId || route?.params?.pinId || null;

    if (routePinId && pins.some((pin) => pin.id === routePinId)) {
      setSelectedPinId(routePinId);
    }
  }, [route?.params?.selectedPinId, route?.params?.pinId, pins]);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();

      if (status !== "granted") {
        setLocPerm("denied");
        return;
      }

      setLocPerm("granted");

      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      setLocation({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      });
    })();
  }, []);

  async function addPhotosFromLibrary() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!perm.granted) {
      Alert.alert("Photos permission needed", `Enable photo access to attach pictures to your ${activeLogLabelLower} log.`);
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.85,
      selectionLimit: 6,
    });

    if (result.canceled) return;

    const picked = (result.assets || []).map((a) => ({
      uri: a.uri,
      width: a.width,
      height: a.height,
    }));

    setPhotos((prev) => [...prev, ...picked].slice(0, 12));
  }

  function removePhoto(uri) {
    setPhotos((prev) => prev.filter((p) => p.uri !== uri));
  }

  async function pickSpreadPhoto(useCamera) {
    try {
      let result;

      if (useCamera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();

        if (!perm.granted) {
          Alert.alert("Camera permission needed", "Enable camera access to take a spread photo.");
          return;
        }

        result = await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.85,
          allowsEditing: true,
        });
      } else {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();

        if (!perm.granted) {
          Alert.alert("Photos permission needed", "Enable photo access to choose a spread photo.");
          return;
        }

        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.85,
          allowsEditing: true,
        });
      }

      if (result.canceled || !result.assets?.length) return;

      const asset = result.assets[0];

      setSpreadPhoto({
        uri: asset.uri,
        width: asset.width,
        height: asset.height,
      });
    } catch {
      Alert.alert("Photo Error", "Could not add the spread photo. Please try again.");
    }
  }

  function addSpreadPhoto() {
    Alert.alert("Spread Photo", "Take a photo or choose one from your gallery.", [
      { text: "Camera", onPress: () => pickSpreadPhoto(true) },
      { text: "Gallery", onPress: () => pickSpreadPhoto(false) },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  function openScoutSpecies(species) {
    setSelectedSpeciesId(species.id);
    setShowFemaleSpecies(false);
    setSpeciesModalVisible(true);
  }

function getScoutSpeciesCount(speciesId) {
  return selectedScoutSpeciesIds.filter((id) => id === speciesId).length;
}

function addScoutSpecies(speciesId) {
  setSelectedScoutSpeciesIds((prev) => [...prev, speciesId]);
}

function removeScoutSpecies(speciesId) {
  setSelectedScoutSpeciesIds((prev) => {
    const index = prev.lastIndexOf(speciesId);
    if (index === -1) return prev;

    return prev.filter((_, i) => i !== index);
  });
}

function toggleScoutSpecies(speciesId) {
  if (getScoutSpeciesCount(speciesId) > 0) {
    removeScoutSpecies(speciesId);
    return;
  }

  addScoutSpecies(speciesId);
}

const renderScoutSpeciesPickerItem = useCallback(
  ({ item }) => (
    <ScoutSpeciesPickerRow
      species={item}
      count={getScoutSpeciesCount(item.id)}
      onOpen={openScoutSpecies}
      onAdd={addScoutSpecies}
      onRemove={removeScoutSpecies}
    />
  ),
  [selectedScoutSpeciesIds]
);


  function handleScoutTabPress() {
    if (!isPro) {
      Alert.alert("Pro Feature", "Scout logs are available with DuckSmart Pro.", [
        { text: "Not Now", style: "cancel" },
        { text: "Upgrade to Pro", onPress: purchase },
      ]);
      return;
    }

    setActiveLogType("scout");
  }

  function resetForm() {
    const resetNow = new Date();
    const resetStart = new Date(resetNow);
    resetStart.setHours(6, 30, 0, 0);
    const resetEnd = new Date(resetNow);
    resetEnd.setHours(10, 15, 0, 0);

    setHuntDate(new Date());
    setTempHuntDate(new Date());
    setStartTime(resetStart);
    setEndTime(resetEnd);
    setEnvironment("Marsh");
    setSpread("j_hook");
    setSpreadOtherText("");
    setSpreadPhoto(null);
    setDucksHarvested(0);
    setCrippledBirds(0);
    setHunters(1);
    setNotes("");
    setPhotos([]);
    setSelectedPinId(null);
    setSelectedScoutSpeciesIds([]);
    setSpeciesPickerVisible(false);
    setSpeciesModalVisible(false);
    setSelectedSpeciesId(null);
    setShowFemaleSpecies(false);
  }

  function defaultPinName() {
    const date = new Date();
    const month = date.toLocaleString(undefined, { month: "short" });
    const day = date.getDate();
    return `${activeLogLabel} Spot — ${month} ${day}`;
  }

  async function buildHuntEntry(linkedPin = null) {
    if (!user?.uid) {
      throw new Error(`You must be signed in to save this ${activeLogLabelLower} log.`);
    }

    const logType = isScoutLog ? "scout" : "hunt";
    const logLabel = logType === "scout" ? "Scout Log" : "Hunt Log";
    const logId = `${logType}-${Date.now()}`;

    const safeHarvest = Math.max(0, Math.min(50, Math.round(ducksHarvested)));
    const safeCrippled = Math.max(0, Math.min(50, Math.round(crippledBirds)));
    const safeHunters = Math.max(1, Math.min(20, Math.round(hunters)));
    const safeNotes = (notes || "").trim().slice(0, 5000);
    const safeSpreadOtherText = (spreadOtherText || "").trim().slice(0, 200);

    const uploadedImages = await uploadLogImagesToFirebase({
      uid: user.uid,
      logId,
      photos,
      spreadPhoto,
    });

    const huntDateTime = mergeDateAndTime(huntDate, startTime);
    const scoutSpeciesPayload = isScoutLog
      ? selectedScoutSpecies.map((sp) => ({
          id: sp.id,
          name: sp.name,
          group: sp.group,
          size: sp.size,
          count: sp.count,
        }))
      : [];
    const speciesSightedPayload = scoutSpeciesPayload.map(
      (sp) => `${sp.count} ${sp.name}`
    );

    return {
      id: logId,
      logType,
      logMode: logType,
      logCategory: logType,
      isScoutLog,
      isHuntLog: !isScoutLog,
      type: logType === "scout" ? "scoutLog" : "huntLog",
      shareType: logType === "scout" ? "scoutLog" : "huntLog",
      displayType: logType === "scout" ? "scoutLog" : "huntLog",
      logLabel,
      shareLabel: logLabel,
      title: `${logLabel} — ${formatDateLabel(huntDate)}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      dateTime: huntDateTime.toISOString(),
      huntDate: huntDate.toISOString(),
      startTime: formatTimeLabel(startTime),
      endTime: formatTimeLabel(endTime),
      environment: isScoutLog ? null : environment,
      spread: isScoutLog ? null : spread,
      spreadOtherText: !isScoutLog && spread === "other" ? safeSpreadOtherText : "",
      spreadPhoto: isScoutLog ? null : uploadedImages.spreadPhoto,
      spreadDetails:
        !isScoutLog && selectedSpread
          ? {
              name: selectedSpread.name,
              type: selectedSpread.type,
              decoyCount: selectedSpread.decoyCount,
              calling: selectedSpread.calling,
              bestTime: selectedSpread.bestTime,
              notes: selectedSpread.notes,
            }
          : null,
      huntScore: isScoutLog ? null : huntScore,
      ducksHarvested: isScoutLog ? null : safeHarvest,
      crippledBirds: isScoutLog ? null : safeCrippled,
      hunters: isScoutLog ? null : safeHunters,
      scoutSpecies: scoutSpeciesPayload,
      speciesSighted: speciesSightedPayload,
      ducksSighted: scoutSpeciesPayload,
      selectedDucks: scoutSpeciesPayload,
      sightingCount: scoutSpeciesPayload.reduce((sum, sp) => sum + sp.count, 0),
      scoutSummary: speciesSightedPayload.length
        ? speciesSightedPayload.join(", ")
        : "No species selected",
      notes: safeNotes,
      location,
      weatherSnapshot: {
        summary: formatWeatherSummary(liveWeather),
        tempF: liveWeather?.tempF ?? null,
        windMph: liveWeather?.windMph ?? null,
        windDir: liveWeather?.windDir || liveWeather?.windDirection || null,
        pressureInHg: liveWeather?.pressureInHg ?? null,
        condition:
          liveWeather?.condition ||
          liveWeather?.shortForecast ||
          liveWeather?.description ||
          null,
      },
      photos: uploadedImages.photos,
      pinId: linkedPin?.id || null,
      pinTitle: linkedPin?.title || null,
      savedToFirebaseAt: Date.now(),
      shareReady: true,
    };
  }

  async function saveHuntEntryToFirebase(entry) {
    if (!user?.uid) {
      throw new Error("You must be signed in to save this log.");
    }

    await setDoc(doc(db, "users", user.uid, "logs", entry.id), entry, {
      merge: true,
    });
  }

  async function savePinToFirebase(pin) {
    if (!user?.uid) return;

    await setDoc(
      doc(db, "users", user.uid, "pins", pin.id),
      {
        ...pin,
        updatedAt: Date.now(),
      },
      {
        merge: true,
      }
    );
  }

  async function completeSave(entry) {
    await saveHuntEntryToFirebase(entry);

    addLog(entry);

    logHuntLogged(user?.uid, {
      logType: entry.logType || "hunt",
      environment: entry.environment,
      spread: entry.spread,
      huntScore: entry.huntScore,
      ducksHarvested: entry.ducksHarvested,
      scoutSpeciesCount: Array.isArray(entry.scoutSpecies)
        ? entry.scoutSpecies.length
        : 0,
      scoutSightingCount: entry.sightingCount || 0,
      photoCount: entry.photos.length + (entry.spreadPhoto ? 1 : 0),
    });

    Alert.alert("Saved", `Your ${entry.logType === "scout" ? "scout" : "hunt"} log has been saved.`);
    resetForm();

    if (!isPro) {
      setTimeout(() => showInterstitialAd(), 800);
    }
  }

  async function saveWithoutNewPin() {
    if (!pendingHuntEntry || saving) return;

    try {
      setSaving(true);

      const entry = pendingHuntEntry;

      setSavePinModalVisible(false);
      setPendingHuntEntry(null);
      setNewPinName("");

      await completeSave(entry);
    } catch (err) {
      console.error("DuckSmart log save error:", err);
      Alert.alert("Save Error", err.message || "Could not save this log. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function saveWithNewPin() {
    if (!pendingHuntEntry || !location || saving) return;

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

    try {
      setSaving(true);

      const title = newPinName.trim().slice(0, 80) || defaultPinName();

      const newPin = {
        id: `pin-${Date.now()}`,
        title,
        type: isScoutLog ? "Scout" : "Spot",
        notes: `Saved from ${activeLogLabelLower} log.`,
        coordinate: location,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await savePinToFirebase(newPin);
      addPin(newPin);

      const entry = {
        ...pendingHuntEntry,
        pinId: newPin.id,
        pinTitle: newPin.title,
        updatedAt: Date.now(),
      };

      setSavePinModalVisible(false);
      setPendingHuntEntry(null);
      setNewPinName("");

      await completeSave(entry);
    } catch (err) {
      console.error("DuckSmart log save error:", err);
      Alert.alert("Save Error", err.message || "Could not save this log. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function validateAndSave() {
    if (saving) return;

    if (isScoutLog && !isPro) {
      Alert.alert("Pro Feature", "Scout logs are available with DuckSmart Pro.", [
        { text: "Not Now", style: "cancel" },
        { text: "Upgrade to Pro", onPress: purchase },
      ]);
      return;
    }

    if (!isPro && logs.length >= FREE_HUNT_LOG_LIMIT) {
      Alert.alert(
        "Log Limit Reached",
        `Free accounts can save up to ${FREE_HUNT_LOG_LIMIT} logs. Upgrade to DuckSmart Pro for unlimited hunt and scout logs.`,
        [
          { text: "Not Now", style: "cancel" },
          { text: "Upgrade to Pro", onPress: purchase },
        ]
      );
      return;
    }

    if (!location) {
      Alert.alert("Missing GPS", `Wait for GPS or enable location before saving this ${activeLogLabelLower} log.`);
      return;
    }

    if (spread === "other" && !spreadOtherText.trim()) {
      Alert.alert("Describe the spread", "Please add a short description for the Other spread.");
      return;
    }

    try {
      setSaving(true);

      const linkedPin = selectedPinId ? pins.find((p) => p.id === selectedPinId) : null;
      const entry = await buildHuntEntry(linkedPin);

      if (!linkedPin && addPin) {
        setPendingHuntEntry(entry);
        setNewPinName(defaultPinName());
        setSavePinModalVisible(true);
        setSaving(false);
        return;
      }

      await completeSave(entry);
    } catch (err) {
      console.error("DuckSmart log save error:", err);
      Alert.alert("Save Error", err.message || "Could not save this log. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function openDatePicker() {
    setTempHuntDate(new Date(huntDate));
    setDatePickerVisible(true);
  }

  function cancelDatePicker() {
    setTempHuntDate(new Date(huntDate));
    setDatePickerVisible(false);
  }

  function handleDatePickerChange(event, selectedDate) {
    if (Platform.OS === "android") {
      setDatePickerVisible(false);

      if (event?.type === "set" && selectedDate) {
        setHuntDate(new Date(selectedDate));
      }

      return;
    }

    if (selectedDate) {
      setTempHuntDate(new Date(selectedDate));
    }
  }

  function confirmDatePicker() {
    setHuntDate(new Date(tempHuntDate));
    setDatePickerVisible(false);
  }

  function handleTimePickerChange(event, selectedTime) {
  if (Platform.OS === "android") {
    setTimePickerVisible(false);

    if (event?.type === "set" && selectedTime) {
      const next = new Date(huntDate);
      next.setHours(selectedTime.getHours(), selectedTime.getMinutes(), 0, 0);

      if (timePickerTarget === "start") {
        setStartTime(next);
      } else {
        setEndTime(next);
      }
    }

    return;
  }

  if (selectedTime) {
    const next = new Date(huntDate);
    next.setHours(selectedTime.getHours(), selectedTime.getMinutes(), 0, 0);

    if (timePickerTarget === "start") {
      setStartTime(next);
    } else {
      setEndTime(next);
    }
  }
}

  function openWeatherDetails() {
    Alert.alert(
      "Weather Forecast",
      [
        `Summary: ${formatWeatherSummary(liveWeather)}`,
        `Pressure: ${formatPressure(liveWeather?.pressureInHg)}`,
        `Precipitation: ${
          liveWeather?.precipChance != null ? `${liveWeather.precipChance}%` : "--%"
        }`,
      ].join("\n")
    );
  }

  function handleBack() {
    if (navigation?.canGoBack?.()) {
      navigation.goBack();
      return;
    }

    Alert.alert("Close", "Use the tabs below to leave this screen.");
  }

  return (
    <ScreenBackground style={styles.safe} bg={ASSETS.backgrounds.log}>
      <View pointerEvents="none" style={local.darkOverlay} />

      <SafeAreaView edges={["top", "left", "right"]} style={{ flex: 1 }}>
        <StatusBar barStyle="light-content" />

        <SelectionModal
          visible={pinPickerVisible}
          title="Select Location"
          onClose={() => setPinPickerVisible(false)}
        >
          <Pressable
            style={[local.optionRow, !selectedPinId ? local.optionRowSelected : null]}
            onPress={() => {
              setSelectedPinId(null);
              setPinPickerVisible(false);
            }}
          >
            <Text style={[local.optionLabel, !selectedPinId ? local.optionLabelSelected : null]}>
              Current GPS Spot
            </Text>
            <Text style={local.optionSub}>Save without linking to an existing pin</Text>
          </Pressable>

          {pins.map((pin) => {
            const pinType = PIN_TYPES.find((t) => t.key === pin.type);
            const dotColor = pinType?.color || COLORS.green;
            const selected = selectedPinId === pin.id;

            return (
              <Pressable
                key={pin.id}
                style={[local.optionRow, selected ? local.optionRowSelected : null]}
                onPress={() => {
                  setSelectedPinId(pin.id);
                  setPinPickerVisible(false);
                }}
              >
                <View style={local.optionRowTop}>
                  <View style={[local.pinDot, { backgroundColor: dotColor }]} />
                  <Text style={[local.optionLabel, selected ? local.optionLabelSelected : null]}>
                    {pin.title}
                  </Text>
                </View>
                <Text style={local.optionSub}>{pin.type}</Text>
              </Pressable>
            );
          })}
        </SelectionModal>

        {datePickerVisible ? (
          <Modal
            visible={datePickerVisible}
            transparent
            animationType="fade"
            onRequestClose={cancelDatePicker}
          >
            <View style={local.modalBackdrop}>
              <View style={local.selectModalCard}>
                <View style={local.selectModalHeader}>
                  <Text style={local.selectModalTitle}>Select Date</Text>
                  <Pressable onPress={cancelDatePicker} style={local.selectModalCloseBtn}>
                    <Text style={local.selectModalCloseText}>✕</Text>
                  </Pressable>
                </View>

                <DateTimePicker
                  value={Platform.OS === "ios" ? tempHuntDate : huntDate}
                  mode="date"
                  display={Platform.OS === "ios" ? "inline" : "calendar"}
                  onChange={handleDatePickerChange}
                  themeVariant="dark"
                />

                {Platform.OS === "ios" ? (
                  <View style={local.modalButtonRow}>
                    <Pressable style={local.modalSecondaryBtn} onPress={cancelDatePicker}>
                      <Text style={local.modalSecondaryText}>Cancel</Text>
                    </Pressable>

                    <Pressable style={local.modalPrimaryBtn} onPress={confirmDatePicker}>
                      <Text style={local.modalPrimaryText}>Done</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            </View>
          </Modal>
        ) : null}

        {timePickerVisible ? (
  <Modal
    visible={timePickerVisible}
    transparent
    animationType="fade"
    onRequestClose={() => setTimePickerVisible(false)}
  >
    <View style={local.modalBackdrop}>
      <View style={local.selectModalCard}>
        <View style={local.selectModalHeader}>
          <Text style={local.selectModalTitle}>
            {timePickerTarget === "start" ? "Select Start Time" : "Select End Time"}
          </Text>

          <Pressable
            onPress={() => setTimePickerVisible(false)}
            style={local.selectModalCloseBtn}
          >
            <Text style={local.selectModalCloseText}>✕</Text>
          </Pressable>
        </View>

        <DateTimePicker
          value={timePickerTarget === "start" ? startTime : endTime}
          mode="time"
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={handleTimePickerChange}
          themeVariant="dark"
        />

        {Platform.OS === "ios" ? (
          <View style={local.modalButtonRow}>
            <Pressable
              style={local.modalSecondaryBtn}
              onPress={() => setTimePickerVisible(false)}
            >
              <Text style={local.modalSecondaryText}>Done</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </View>
  </Modal>
) : null}

        <Modal
          visible={savePinModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setSavePinModalVisible(false)}
        >
          <View style={local.modalBackdrop}>
            <View style={local.modalCard}>
              <Text style={local.modalTitle}>Save this spot as a pin?</Text>
              <Text style={local.modalText}>
                You did not select an existing pin. Save this GPS location as a map pin so you can reuse it later.
              </Text>

              <Text style={local.modalLabel}>Pin Name</Text>
              <TextInput
                value={newPinName}
                onChangeText={setNewPinName}
                placeholder="Example: North timber hole"
                placeholderTextColor="rgba(255,255,255,0.34)"
                style={local.modalInput}
              />

              <View style={local.modalButtonRow}>
                <Pressable
                  style={[local.modalSecondaryBtn, saving ? local.disabledBtn : null]}
                  onPress={saveWithoutNewPin}
                  disabled={saving}
                >
                  <Text style={local.modalSecondaryText}>{saving ? "Saving..." : "No"}</Text>
                </Pressable>

                <Pressable
                  style={[local.modalPrimaryBtn, saving ? local.disabledBtn : null]}
                  onPress={saveWithNewPin}
                  disabled={saving}
                >
                  <Text style={local.modalPrimaryText}>{saving ? "Saving..." : "Save Pin"}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        <Modal
          visible={speciesPickerVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setSpeciesPickerVisible(false)}
        >
          <View style={local.modalBackdrop}>
            <View style={local.scoutPickerModalCard}>
              <View style={local.selectModalHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={local.selectModalTitle}>Species Sighted</Text>
                  <Text style={local.scoutPickerSubtitle}>
                    Add counts with + / −. Tap a species name or photo to view details.
                  </Text>
                </View>

                <Pressable
                  onPress={() => setSpeciesPickerVisible(false)}
                  style={local.selectModalCloseBtn}
                >
                  <Text style={local.selectModalCloseText}>✕</Text>
                </Pressable>
              </View>

              <FlatList
                data={scoutSpeciesList}
                keyExtractor={(item) => String(item.id)}
                renderItem={renderScoutSpeciesPickerItem}
                extraData={selectedScoutSpeciesIds}
                initialNumToRender={12}
                maxToRenderPerBatch={8}
                updateCellsBatchingPeriod={50}
                windowSize={7}
                removeClippedSubviews={Platform.OS === "android"}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={local.scoutPickerListContent}
                showsVerticalScrollIndicator={false}
              />

              <View style={local.modalButtonRow}>
                <Pressable
                  style={local.modalSecondaryBtn}
                  onPress={() => setSelectedScoutSpeciesIds([])}
                >
                  <Text style={local.modalSecondaryText}>Clear</Text>
                </Pressable>

                <Pressable
                  style={local.modalPrimaryBtn}
                  onPress={() => setSpeciesPickerVisible(false)}
                >
                  <Text style={local.modalPrimaryText}>Done</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        <Modal
          visible={speciesModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setSpeciesModalVisible(false)}
        >
          <View style={local.modalBackdrop}>
            <View style={local.speciesModalCard}>
              <View style={local.selectModalHeader}>
                <Text style={local.selectModalTitle}>Species</Text>
                <Pressable
                  onPress={() => setSpeciesModalVisible(false)}
                  style={local.selectModalCloseBtn}
                >
                  <Text style={local.selectModalCloseText}>✕</Text>
                </Pressable>
              </View>

              {selectedSpecies ? (
                <>
                  <Text style={local.speciesModalTitle}>{selectedSpecies.name}</Text>
                  <Text style={local.speciesModalSub}>
                    {selectedSpecies.group} • {selectedSpecies.size}
                  </Text>

                  <View style={local.speciesModalHero}>
                    {selectedSpeciesImage ? (
                      <Image
                        source={selectedSpeciesImage}
                        style={local.speciesModalImage}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={[local.speciesModalImage, local.speciesModalEmpty]}>
                        <Text style={local.speciesThumbText}>🦆</Text>
                      </View>
                    )}
                  </View>

                  {selectedSpeciesHasFemale ? (
                    <View style={local.speciesSexToggleRow}>
                      <Pressable
                        style={[
                          local.speciesSexToggleBtn,
                          !showFemaleSpecies ? local.speciesSexToggleBtnActive : null,
                        ]}
                        onPress={() => setShowFemaleSpecies(false)}
                      >
                        <Text
                          style={[
                            local.speciesSexToggleText,
                            !showFemaleSpecies ? local.speciesSexToggleTextActive : null,
                          ]}
                        >
                          Drake
                        </Text>
                      </Pressable>

                      <Pressable
                        style={[
                          local.speciesSexToggleBtn,
                          showFemaleSpecies ? local.speciesSexToggleBtnActive : null,
                        ]}
                        onPress={() => setShowFemaleSpecies(true)}
                      >
                        <Text
                          style={[
                            local.speciesSexToggleText,
                            showFemaleSpecies ? local.speciesSexToggleTextActive : null,
                          ]}
                        >
                          Hen
                        </Text>
                      </Pressable>
                    </View>
                  ) : null}

                  {selectedSpecies.keyMarks?.length ? (
                    <View style={local.speciesMarksBox}>
                      {selectedSpecies.keyMarks.slice(0, 4).map((mark, index) => (
                        <View key={`${selectedSpecies.id}-mark-${index}`} style={local.speciesMarkRow}>
                          <Text style={local.speciesMarkBullet}>✓</Text>
                          <Text style={local.speciesMarkText}>{mark}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}

                  <View style={local.modalButtonRow}>
                    <Pressable
                      style={local.modalSecondaryBtn}
                      onPress={() => setSpeciesModalVisible(false)}
                    >
                      <Text style={local.modalSecondaryText}>Close</Text>
                    </Pressable>

                    <Pressable
                      style={local.modalPrimaryBtn}
                      onPress={() => toggleScoutSpecies(selectedSpecies.id)}
                    >
                      <Text style={local.modalPrimaryText}>
                        {getScoutSpeciesCount(selectedSpecies.id) > 0 ? "Remove One" : "Add One"}
                      </Text>
                    </Pressable>
                  </View>
                </>
              ) : null}
            </View>
          </View>
        </Modal>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={local.container}
          >
            <View style={local.headerRow}>
              <Pressable onPress={handleBack} style={local.headerSideBtn}>
                <Text style={local.headerSideBtnText}>✕</Text>
              </Pressable>

              <Text style={local.headerTitle}>LOGS</Text>

              <Pressable
                onPress={validateAndSave}
                style={local.headerSaveWrap}
                disabled={saving}
              >
                <Text style={[local.headerSaveText, saving ? local.headerSaveTextDisabled : null]}>
                  {saving ? "Saving" : "Save"}
                </Text>
              </Pressable>
            </View>

            <View style={local.logTabsWrap}>
              <Pressable
                onPress={handleScoutTabPress}
                style={[
                  local.logTabButton,
                  activeLogType === "scout" ? local.logTabButtonActive : null,
                ]}
              >
                <Text
                  style={[
                    local.logTabText,
                    activeLogType === "scout" ? local.logTabTextActive : null,
                  ]}
                >
                  SCOUT{!isPro ? " 🔒" : ""}
                </Text>
              </Pressable>

              <Pressable
                onPress={() => setActiveLogType("hunt")}
                style={[
                  local.logTabButton,
                  activeLogType === "hunt" ? local.logTabButtonActive : null,
                ]}
              >
                <Text
                  style={[
                    local.logTabText,
                    activeLogType === "hunt" ? local.logTabTextActive : null,
                  ]}
                >
                  HUNT
                </Text>
              </Pressable>
            </View>

            <LogRow
              icon="📍"
              label="LOCATION"
              value={selectedPin?.title || "Current GPS Spot"}
              subvalue={
                selectedPin
                  ? selectedPin.type
                  : locPerm === "denied"
                    ? "Location permission denied"
                    : location
                      ? `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`
                      : "Getting GPS location..."
              }
              onPress={() => setPinPickerVisible(true)}
            />

            <LogRow
              icon="📅"
              label="DATE"
              value={formatDateLabel(huntDate)}
              onPress={openDatePicker}
            />

            <View style={local.timeRow}>
              <View style={local.timeHalf}>
                <LogRow
                  icon="🕒"
                  label="START TIME"
                  value={formatTimeLabel(startTime)}
                  onPress={() => {
                    setTimePickerTarget("start");
                    setTimePickerVisible(true);
                  }}
                  compact
                />
              </View>

              <View style={local.timeGap} />

              <View style={local.timeHalf}>
                <LogRow
                  icon="🕓"
                  label="END TIME"
                  value={formatTimeLabel(endTime)}
                  onPress={() => {
                    setTimePickerTarget("end");
                    setTimePickerVisible(true);
                  }}
                  compact
                />
              </View>
            </View>

            <WeatherForecastRow
              value={formatWeatherSummary(liveWeather)}
              onPress={openWeatherDetails}
            />

{isScoutLog ? (
  <SectionCard title="SPECIES SIGHTED">
    <Text style={local.speciesHelpText}>
      Add the number of each species seen. This opens in a faster picker so the log screen does not lag while scrolling.
    </Text>

    <Pressable
      style={local.scoutSpeciesOpenButton}
      onPress={() => setSpeciesPickerVisible(true)}
    >
      <View style={local.scoutSpeciesOpenIcon}>
        <Text style={local.scoutSpeciesOpenIconText}>🦆</Text>
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={local.scoutSpeciesOpenTitle}>Select Species Sighted</Text>
        <Text style={local.scoutSpeciesOpenSub} numberOfLines={2}>
          {selectedScoutSpecies.length
            ? selectedScoutSpecies.map((sp) => `${sp.count} ${sp.name}`).join(", ")
            : "No species selected yet"}
        </Text>
      </View>

      <Text style={local.rowChevron}>›</Text>
    </Pressable>

    {selectedScoutSpecies.length ? (
      <View style={local.selectedSpeciesWrap}>
        {selectedScoutSpecies.map((sp) => (
          <Pressable
            key={sp.id}
            style={local.selectedSpeciesChip}
            onPress={() => openScoutSpecies(sp)}
          >
            <Text style={local.selectedSpeciesChipText}>
              {sp.count} {sp.name}
            </Text>
          </Pressable>
        ))}
      </View>
    ) : (
      <Text style={local.smallHelper}>No species selected yet.</Text>
    )}
  </SectionCard>
) : null}

            {!isScoutLog ? (
              <SectionCard title="HARVESTED (TOTAL)">
                <CounterRow
                  value={ducksHarvested}
                  onMinus={() => setDucksHarvested((prev) => clamp(prev - 1, 0, 50))}
                  onPlus={() => setDucksHarvested((prev) => clamp(prev + 1, 0, 50))}
                />
              </SectionCard>
            ) : null}

{!isScoutLog ? (
  <View style={local.miniStatsRow}>
    <SectionCard style={local.miniStatCard}>
      <Text style={local.miniStatLabel}>HUNTERS</Text>
      <View style={local.inlineCounterRow}>
        <Pressable
          onPress={() => setHunters((prev) => clamp(prev - 1, 1, 20))}
          style={local.inlineCounterBtn}
        >
          <Text style={local.inlineCounterBtnText}>−</Text>
        </Pressable>
        <Text style={local.inlineCounterValue}>{hunters}</Text>
        <Pressable
          onPress={() => setHunters((prev) => clamp(prev + 1, 1, 20))}
          style={local.inlineCounterBtn}
        >
          <Text style={local.inlineCounterBtnText}>+</Text>
        </Pressable>
      </View>
    </SectionCard>

    <SectionCard style={local.miniStatCard}>
      <Text style={local.miniStatLabel}>CRIPPLED BIRDS</Text>
      <View style={local.inlineCounterRow}>
        <Pressable
          onPress={() => setCrippledBirds((prev) => clamp(prev - 1, 0, 50))}
          style={local.inlineCounterBtn}
        >
          <Text style={local.inlineCounterBtnText}>−</Text>
        </Pressable>
        <Text style={local.inlineCounterValue}>{crippledBirds}</Text>
        <Pressable
          onPress={() => setCrippledBirds((prev) => clamp(prev + 1, 0, 50))}
          style={local.inlineCounterBtn}
        >
          <Text style={local.inlineCounterBtnText}>+</Text>
        </Pressable>
      </View>
    </SectionCard>
  </View>
) : null}

            <SectionCard title="NOTES">
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder="Capture what worked, bird movement, calling, hide, wind, access, and anything worth remembering..."
                placeholderTextColor="rgba(255,255,255,0.30)"
                style={local.notesInput}
                multiline
              />
            </SectionCard>

            <SectionCard title="PHOTOS (OPTIONAL)">
              <View style={local.photoStrip}>
                {photos.map((p) => (
                  <Pressable
                    key={p.uri}
                    onLongPress={() => removePhoto(p.uri)}
                    style={local.photoThumbWrap}
                  >
                    <Image source={{ uri: p.uri }} style={local.photoThumb} />
                  </Pressable>
                ))}

                <Pressable onPress={addPhotosFromLibrary} style={local.addPhotoBox}>
                  <Text style={local.addPhotoPlus}>＋</Text>
                </Pressable>
              </View>

              <Text style={local.smallHelper}>Long-press a photo to remove it.</Text>
            </SectionCard>

            <Text style={local.privacyText}>
              Your map pin data and hunt log data are never shared or sold.
            </Text>

{!isScoutLog ? (
  <>
    <SectionCard title="ENVIRONMENT">
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={local.chipRow}>
          {ENVIRONMENTS.map((env) => (
            <Chip
              key={env}
              label={env}
              selected={env === environment}
              onPress={() => setEnvironment(env)}
            />
          ))}
        </View>
      </ScrollView>
    </SectionCard>

    <SectionCard title="DECOY SPREAD">
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={local.spreadRow}>
          {SPREADS.filter((sp) => !sp.isAddon).map((sp) => {
            const selected = sp.key === spread;
            const imageSource = ASSETS.decoys?.[sp.key];

            return (
              <Pressable
                key={sp.key}
                onPress={() => setSpread(sp.key)}
                style={[local.spreadCard, selected ? local.spreadCardSelected : null]}
              >
                {imageSource ? (
                  <Image source={imageSource} style={local.spreadImage} resizeMode="cover" />
                ) : (
                  <View style={local.spreadImagePlaceholder}>
                    <Text style={local.spreadImagePlaceholderText}>Decoy</Text>
                  </View>
                )}

                <Text
                  style={[local.spreadName, selected ? local.spreadNameSelected : null]}
                  numberOfLines={1}
                >
                  {sp.name}
                </Text>
                <Text style={local.spreadType} numberOfLines={1}>
                  {sp.type}
                </Text>
              </Pressable>
            );
          })}

          <Pressable
            onPress={() => setSpread("none")}
            style={[local.spreadCardPlain, spread === "none" ? local.spreadCardSelected : null]}
          >
            <Text style={[local.spreadPlainTitle, spread === "none" ? local.spreadNameSelected : null]}>
              None
            </Text>
            <Text style={local.spreadPlainSub}>No spread used</Text>
          </Pressable>

          <Pressable
            onPress={() => setSpread("other")}
            style={[local.spreadCardPlain, spread === "other" ? local.spreadCardSelected : null]}
          >
            <Text style={[local.spreadPlainTitle, spread === "other" ? local.spreadNameSelected : null]}>
              Other
            </Text>
            <Text style={local.spreadPlainSub}>Custom spread</Text>
          </Pressable>
        </View>
      </ScrollView>

      {spread === "other" ? (
        <View style={local.subSection}>
          <Text style={local.subSectionLabel}>Describe the spread</Text>
          <TextInput
            value={spreadOtherText}
            onChangeText={setSpreadOtherText}
            placeholder="Example: 6 mallards left, 2 teal right, pocket in the center..."
            placeholderTextColor="rgba(255,255,255,0.30)"
            style={local.subTextInput}
            multiline
          />
        </View>
      ) : null}

      <View style={local.subSection}>
        <Text style={local.subSectionLabel}>Spread Photo</Text>

        {spreadPhoto ? (
          <>
            <Image source={{ uri: spreadPhoto.uri }} style={local.spreadPhoto} />

            <View style={local.bottomButtonRow}>
              <Pressable onPress={addSpreadPhoto} style={local.secondaryButton}>
                <Text style={local.secondaryButtonText}>Replace</Text>
              </Pressable>

              <Pressable onPress={() => setSpreadPhoto(null)} style={local.secondaryButton}>
                <Text style={local.secondaryButtonText}>Remove</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <Pressable onPress={addSpreadPhoto} style={local.addSpreadPhotoBox}>
            <Text style={local.addSpreadPhotoIcon}>📷</Text>
            <Text style={local.addSpreadPhotoTitle}>Add Spread Photo</Text>
          </Pressable>
        )}
      </View>
    </SectionCard>
  </>
) : null}

            <View style={local.bottomButtonRow}>
              <Pressable
                onPress={resetForm}
                style={[local.secondaryButton, saving ? local.disabledBtn : null]}
                disabled={saving}
              >
                <Text style={local.secondaryButtonText}>Reset</Text>
              </Pressable>

              <Pressable
                onPress={validateAndSave}
                style={[local.primaryButton, saving ? local.disabledBtn : null]}
                disabled={saving}
              >
                <Text style={local.primaryButtonText}>{saving ? "Saving..." : `Save ${activeLogLabel}`}</Text>
              </Pressable>
            </View>

            <View style={{ height: Platform.OS === "ios" ? 22 : 10 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ScreenBackground>
  );
}

const local = StyleSheet.create({
  darkOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.72)",
  },
  scoutPickerModalCard: {
    width: "94%",
    maxHeight: "88%",
    borderRadius: 20,
    backgroundColor: HUNT_BROWN_CARD_2,
    borderWidth: 1,
    borderColor: HUNT_BORDER,
    padding: 12,
  },
  scoutPickerSubtitle: {
    color: HUNT_TEXT_SOFT,
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 16,
    marginTop: 4,
  },
  scoutPickerListContent: {
    paddingTop: 8,
    paddingBottom: 8,
  },
  scoutSpeciesOpenButton: {
    minHeight: 74,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.04)",
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  scoutSpeciesOpenIcon: {
    width: 44,
    height: 44,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(217,168,76,0.12)",
    borderWidth: 1,
    borderColor: "rgba(217,168,76,0.22)",
    marginRight: 10,
  },
  scoutSpeciesOpenIconText: {
    fontSize: 23,
  },
  scoutSpeciesOpenTitle: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: "900",
  },
  scoutSpeciesOpenSub: {
    color: HUNT_TEXT_SOFT,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
    marginTop: 3,
  },
scoutSpeciesVerticalList: {
  gap: 8,
},

scoutSpeciesRow: {
  minHeight: 74,
  borderRadius: 14,
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.10)",
  backgroundColor: "rgba(255,255,255,0.03)",
  padding: 8,
  flexDirection: "row",
  alignItems: "center",
},

scoutSpeciesInfo: {
  flex: 1,
  minWidth: 0,
  flexDirection: "row",
  alignItems: "center",
},

scoutSpeciesRowThumb: {
  width: 58,
  height: 52,
  borderRadius: 11,
  marginRight: 10,
  backgroundColor: "rgba(255,255,255,0.04)",
},

scoutSpeciesRowName: {
  color: COLORS.white,
  fontSize: 14,
  fontWeight: "900",
},

scoutSpeciesRowMeta: {
  color: HUNT_TEXT_SOFT,
  fontSize: 11,
  fontWeight: "700",
  marginTop: 3,
},

scoutSpeciesCounter: {
  flexDirection: "row",
  alignItems: "center",
  marginLeft: 8,
},

scoutSpeciesCounterBtn: {
  width: 34,
  height: 34,
  borderRadius: 10,
  backgroundColor: "rgba(255,255,255,0.06)",
  alignItems: "center",
  justifyContent: "center",
},

scoutSpeciesCounterBtnText: {
  color: COLORS.white,
  fontSize: 24,
  fontWeight: "800",
  lineHeight: 24,
},

scoutSpeciesCount: {
  width: 34,
  textAlign: "center",
  color: HUNT_GOLD,
  fontSize: 18,
  fontWeight: "900",
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
  headerSaveWrap: {
    width: 56,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  headerSaveText: {
    color: HUNT_GOLD,
    fontSize: 15,
    fontWeight: "900",
  },
  headerSaveTextDisabled: {
    opacity: 0.55,
  },

  logTabsWrap: {
    height: 44,
    flexDirection: "row",
    borderRadius: 15,
    backgroundColor: "rgba(20, 14, 10, 0.86)",
    borderWidth: 1,
    borderColor: HUNT_BORDER,
    padding: 4,
    marginBottom: 10,
  },
  logTabButton: {
    flex: 1,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  logTabButtonActive: {
    backgroundColor: HUNT_GOLD,
  },
  logTabText: {
    color: HUNT_MUTED,
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  logTabTextActive: {
    color: "#1A120D",
  },

  rowCard: {
    minHeight: 76,
    borderRadius: 18,
    backgroundColor: HUNT_BROWN_CARD,
    borderWidth: 1,
    borderColor: HUNT_BORDER,
    paddingHorizontal: 12,
    paddingVertical: 11,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  rowCardCompact: {
    minHeight: 72,
  },
  rowIconWrap: {
    width: 42,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  rowIcon: {
    color: HUNT_GOLD,
    fontSize: 23,
    fontWeight: "900",
  },
  rowTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  rowLabel: {
    color: HUNT_MUTED,
    fontSize: 10,
    fontWeight: "900",
    marginBottom: 4,
    letterSpacing: 0.7,
  },
  rowValue: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: "800",
  },
  rowSubvalue: {
    color: HUNT_TEXT_SOFT,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 3,
  },
  rowChevron: {
    color: "rgba(255,255,255,0.42)",
    fontSize: 28,
    fontWeight: "500",
    marginLeft: 8,
  },

  weatherForecastCard: {
    minHeight: 58,
    borderRadius: 16,
    backgroundColor: HUNT_BROWN_CARD,
    borderWidth: 1,
    borderColor: HUNT_BORDER,
    paddingHorizontal: 12,
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  weatherIconWrap: {
    width: 34,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  weatherIcon: {
    color: HUNT_GOLD,
    fontSize: 21,
    fontWeight: "900",
  },
  weatherTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  weatherLabel: {
    color: HUNT_MUTED,
    fontSize: 10,
    fontWeight: "900",
    marginBottom: 3,
    letterSpacing: 0.7,
  },
  weatherValue: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: "800",
  },
  weatherChevron: {
    color: "rgba(255,255,255,0.36)",
    fontSize: 24,
    fontWeight: "500",
    marginLeft: 8,
  },

  timeRow: {
    flexDirection: "row",
    alignItems: "stretch",
    marginBottom: 8,
  },
  timeHalf: {
    flex: 1,
  },
  timeGap: {
    width: 8,
  },

  sectionCard: {
    borderRadius: 18,
    backgroundColor: HUNT_BROWN_CARD_2,
    borderWidth: 1,
    borderColor: HUNT_BORDER,
    padding: 12,
    marginBottom: 8,
  },
  sectionTitle: {
    color: COLORS.white,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.5,
    marginBottom: 10,
  },

  counterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  counterBtn: {
    width: 54,
    height: 54,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  counterBtnText: {
    color: COLORS.white,
    fontSize: 34,
    fontWeight: "700",
    lineHeight: 34,
  },
  counterCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  counterNumber: {
    color: COLORS.white,
    fontSize: 48,
    fontWeight: "900",
    lineHeight: 52,
  },

  miniStatsRow: {
    flexDirection: "row",
    marginBottom: 8,
    gap: 8,
  },
  miniStatCard: {
    flex: 1,
    marginBottom: 0,
  },
  miniStatLabel: {
    color: HUNT_MUTED,
    fontSize: 10,
    fontWeight: "900",
    marginBottom: 10,
    letterSpacing: 0.6,
  },
  inlineCounterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  inlineCounterBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  inlineCounterBtnText: {
    color: COLORS.white,
    fontSize: 24,
    fontWeight: "800",
    lineHeight: 24,
  },
  inlineCounterValue: {
    color: COLORS.white,
    fontSize: 24,
    fontWeight: "900",
  },

  notesInput: {
    minHeight: 94,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.03)",
    color: COLORS.white,
    paddingHorizontal: 12,
    paddingVertical: 10,
    textAlignVertical: "top",
    fontSize: 15,
    fontWeight: "700",
  },

  photoStrip: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
  },
  photoThumbWrap: {
    width: 84,
    height: 84,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  photoThumb: {
    width: "100%",
    height: "100%",
  },
  addPhotoBox: {
    width: 84,
    height: 84,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "rgba(255,255,255,0.24)",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  addPhotoPlus: {
    color: COLORS.white,
    fontSize: 34,
    fontWeight: "500",
    lineHeight: 34,
  },
  smallHelper: {
    color: HUNT_TEXT_SOFT,
    fontSize: 11,
    fontWeight: "700",
    marginTop: 9,
  },

  chipRow: {
    flexDirection: "row",
    gap: 8,
    paddingRight: 8,
  },

  speciesHelpText: {
    color: HUNT_TEXT_SOFT,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
    marginBottom: 10,
  },
  speciesRow: {
    flexDirection: "row",
    gap: 10,
    paddingRight: 8,
  },
  speciesCard: {
    width: 126,
    borderRadius: 15,
    padding: 8,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  speciesCardSelected: {
    borderColor: HUNT_GOLD,
    backgroundColor: "rgba(217,168,76,0.10)",
  },
  speciesThumb: {
    width: "100%",
    height: 78,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  speciesThumbEmpty: {
    alignItems: "center",
    justifyContent: "center",
  },
  speciesThumbText: {
    color: HUNT_TEXT_SOFT,
    fontSize: 24,
  },
  speciesName: {
    color: COLORS.white,
    fontSize: 13,
    fontWeight: "800",
  },
  speciesNameSelected: {
    color: HUNT_GOLD,
  },
  speciesMeta: {
    color: HUNT_TEXT_SOFT,
    fontSize: 11,
    fontWeight: "700",
    marginTop: 2,
  },
  selectedSpeciesWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  },
  selectedSpeciesChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: HUNT_BORDER,
    backgroundColor: "rgba(217,168,76,0.08)",
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  selectedSpeciesChipText: {
    color: HUNT_GOLD,
    fontSize: 12,
    fontWeight: "900",
  },

  spreadRow: {
    flexDirection: "row",
    gap: 10,
    paddingRight: 8,
  },
  spreadCard: {
    width: 126,
    borderRadius: 15,
    padding: 8,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  spreadCardSelected: {
    borderColor: HUNT_GOLD,
    backgroundColor: "rgba(217,168,76,0.10)",
  },
  spreadImage: {
    width: "100%",
    height: 78,
    borderRadius: 12,
    marginBottom: 8,
  },
  spreadImagePlaceholder: {
    width: "100%",
    height: 78,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: "rgba(255,255,255,0.05)",
    alignItems: "center",
    justifyContent: "center",
  },
  spreadImagePlaceholderText: {
    color: HUNT_TEXT_SOFT,
    fontSize: 12,
    fontWeight: "700",
  },
  spreadName: {
    color: COLORS.white,
    fontSize: 13,
    fontWeight: "800",
  },
  spreadNameSelected: {
    color: HUNT_GOLD,
  },
  spreadType: {
    color: HUNT_TEXT_SOFT,
    fontSize: 11,
    fontWeight: "700",
    marginTop: 2,
  },

  spreadCardPlain: {
    width: 118,
    borderRadius: 15,
    padding: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  spreadPlainTitle: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: "800",
  },
  spreadPlainSub: {
    color: HUNT_TEXT_SOFT,
    fontSize: 11,
    fontWeight: "700",
    marginTop: 4,
    textAlign: "center",
  },

  subSection: {
    marginTop: 12,
  },
  subSectionLabel: {
    color: HUNT_MUTED,
    fontSize: 11,
    fontWeight: "900",
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  subTextInput: {
    minHeight: 82,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.03)",
    color: COLORS.white,
    paddingHorizontal: 12,
    paddingVertical: 10,
    textAlignVertical: "top",
    fontSize: 14,
    fontWeight: "700",
  },

  spreadPhoto: {
    width: "100%",
    height: 170,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  addSpreadPhotoBox: {
    height: 86,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.22)",
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  addSpreadPhotoIcon: {
    color: HUNT_GOLD,
    fontSize: 22,
    fontWeight: "800",
  },
  addSpreadPhotoTitle: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: "800",
    marginTop: 6,
  },

  privacyText: {
    color: HUNT_TEXT_SOFT,
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center",
    lineHeight: 16,
    paddingHorizontal: 10,
    marginTop: 2,
    marginBottom: 10,
  },

  bottomButtonRow: {
    flexDirection: "row",
    gap: 10,
  },
  secondaryButton: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: "800",
  },
  primaryButton: {
    flex: 1.25,
    height: 48,
    borderRadius: 14,
    backgroundColor: HUNT_GOLD,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: {
    color: HUNT_BROWN,
    fontSize: 14,
    fontWeight: "900",
  },
  disabledBtn: {
    opacity: 0.6,
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
    borderRadius: 20,
    backgroundColor: HUNT_BROWN_CARD_2,
    borderWidth: 1,
    borderColor: HUNT_BORDER,
    padding: 16,
  },
  modalTitle: {
    color: COLORS.white,
    fontSize: 20,
    fontWeight: "900",
    marginBottom: 8,
  },
  modalText: {
    color: HUNT_MUTED,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
    marginBottom: 14,
  },
  modalLabel: {
    color: HUNT_MUTED,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  modalInput: {
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
    marginBottom: 14,
  },
  modalButtonRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
  },
  modalSecondaryBtn: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  modalSecondaryText: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: "800",
  },
  modalPrimaryBtn: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    backgroundColor: HUNT_GOLD,
    alignItems: "center",
    justifyContent: "center",
  },
  modalPrimaryText: {
    color: HUNT_BROWN,
    fontSize: 14,
    fontWeight: "900",
  },

  selectModalCard: {
    width: "100%",
    maxHeight: "82%",
    borderRadius: 20,
    backgroundColor: HUNT_BROWN_CARD_2,
    borderWidth: 1,
    borderColor: HUNT_BORDER,
    padding: 12,
  },
  selectModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
    marginBottom: 10,
  },
  selectModalTitle: {
    color: COLORS.white,
    fontSize: 18,
    fontWeight: "900",
  },
  selectModalCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 10,
  },
  selectModalCloseText: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: "900",
  },

  optionRow: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.03)",
    padding: 12,
    marginBottom: 8,
  },
  optionRowSelected: {
    borderColor: HUNT_GOLD,
    backgroundColor: "rgba(217,168,76,0.10)",
  },
  optionRowTop: {
    flexDirection: "row",
    alignItems: "center",
  },
  optionLabel: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: "800",
  },
  optionLabelSelected: {
    color: HUNT_GOLD,
  },
  optionSub: {
    color: HUNT_TEXT_SOFT,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 3,
  },

  pinDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
});