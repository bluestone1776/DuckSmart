// DuckSmart — Share / Import Service
//
// Creates shareable DuckSmart pin and hunt-log records in Firebase.
// Pins are shared as structured data.
// Hunt logs are shared as structured data, with local photos uploaded to Firebase Storage
// so the receiver can import/view them on their own device.
//
// Updated behavior:
// - Pin shares include full pin info + pin images/photos.
// - Hunt log shares include hunt info + hunt photos + linked pin info/photos when provided.
// - Hunt log imports can return both the imported hunt log and the linked imported pin.
// - Share messages include a DuckSmart Share Code instead of relying on broken app links.
// - Photo/image sharing should be handled by the native Share url from the calling screen.
//
// Fixed:
// - External share/import now uses the same flexible GPS normalization as in-app sharing.
// - Pins are stored with coordinate, coordinates, location, latitude, and longitude.
// - Hunt logs are stored with location, coordinate, latitude, and longitude.
// - Linked pins inside hunt logs keep GPS in every expected shape.

import {
  collection,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import {
  getDownloadURL,
  ref,
  uploadBytes,
} from "firebase/storage";

import { auth, db, storage, isFirebaseConfigValid } from "./firebase";

const SHARE_COLLECTION = "shared_ducksmart_items";
const APP_SCHEME = "ducksmart";
const WEBSITE_SHARE_BASE_URL = "https://ducksmart.app/share";
const DOWNLOAD_LINK = "https://ducksmart.app/qr-1";

function assertFirebaseReady() {
  if (!isFirebaseConfigValid) {
    throw new Error("Firebase is not configured for this build.");
  }
}

function cleanString(value, maxLength = 1000) {
  if (value === undefined || value === null) return "";
  return String(value).trim().slice(0, maxLength);
}

function cleanNumber(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function getCoordinateFromValue(value) {
  if (!value) return null;

  const candidates = [
    value,
    value.coordinate,
    value.coordinates,
    value.coords,
    value.location,
    value.gps,
    value.geo,
    value.mapData,
    value.pin,
    value.mapPin,
    value.linkedPin,
    value.payload,
    value.payload?.coordinate,
    value.payload?.coordinates,
    value.payload?.coords,
    value.payload?.location,
    value.payload?.gps,
    value.payload?.geo,
    value.payload?.mapData,
    value.payload?.pin,
    value.payload?.mapPin,
    value.payload?.linkedPin,
  ].filter(Boolean);

  for (const source of candidates) {
    const latitude =
      source.latitude ??
      source.lat ??
      source.locationLatitude ??
      source.locationLat ??
      source.gpsLatitude ??
      source.coordinate?.latitude ??
      source.coordinate?.lat ??
      source.coordinates?.latitude ??
      source.coordinates?.lat ??
      source.location?.latitude ??
      source.location?.lat ??
      source.gps?.latitude ??
      source.gps?.lat ??
      source.geo?.latitude ??
      source.geo?.lat;

    const longitude =
      source.longitude ??
      source.lng ??
      source.lon ??
      source.locationLongitude ??
      source.locationLng ??
      source.locationLon ??
      source.gpsLongitude ??
      source.coordinate?.longitude ??
      source.coordinate?.lng ??
      source.coordinate?.lon ??
      source.coordinates?.longitude ??
      source.coordinates?.lng ??
      source.coordinates?.lon ??
      source.location?.longitude ??
      source.location?.lng ??
      source.location?.lon ??
      source.gps?.longitude ??
      source.gps?.lng ??
      source.gps?.lon ??
      source.geo?.longitude ??
      source.geo?.lng ??
      source.geo?.lon;

    const latNum = cleanNumber(latitude);
    const lngNum = cleanNumber(longitude);

    if (latNum !== null && lngNum !== null) {
      return {
        latitude: latNum,
        longitude: lngNum,
      };
    }
  }

  return null;
}

function cleanCoordinate(value) {
  return getCoordinateFromValue(value);
}

function withCoordinateFields(source = {}, coordinate) {
  if (!coordinate) {
    return {
      ...source,
      coordinate: null,
      coordinates: null,
      location: null,
      latitude: null,
      longitude: null,
      locationLatitude: null,
      locationLongitude: null,
    };
  }

  return {
    ...source,
    coordinate,
    coordinates: coordinate,
    location: coordinate,
    latitude: coordinate.latitude,
    longitude: coordinate.longitude,
    locationLatitude: coordinate.latitude,
    locationLongitude: coordinate.longitude,
  };
}

function normalizePinType(value) {
  const raw = cleanString(value, 60);
  const lowered = raw.toLowerCase();

  if (!raw || lowered === "pin" || lowered === "shared_pin" || lowered === "map_pin" || lowered === "mappin") {
    return "Spot";
  }

  return raw;
}

function normalizeImage(image) {
  if (!image) return null;

  if (typeof image === "string") {
    return { uri: image };
  }

  const uri =
    image.uri ||
    image.downloadUrl ||
    image.downloadURL ||
    image.sharedUrl ||
    image.url ||
    image.imageUrl ||
    image.imageURL ||
    image.photoUrl ||
    image.photoURL ||
    null;

  if (!uri) return null;

  return {
    ...image,
    uri,
    width: image.width || null,
    height: image.height || null,
  };
}

function normalizeImageList(value) {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value.map(normalizeImage).filter(Boolean);
  }

  const single = normalizeImage(value);
  return single ? [single] : [];
}

function dedupeImages(images = []) {
  const seen = new Set();
  const result = [];

  images.forEach((image) => {
    const normalized = normalizeImage(image);
    if (!normalized?.uri) return;

    if (seen.has(normalized.uri)) return;

    seen.add(normalized.uri);
    result.push(normalized);
  });

  return result;
}

function getImageUrl(image) {
  const normalized = normalizeImage(image);
  return normalized?.sharedUrl || normalized?.downloadUrl || normalized?.uri || null;
}

function getFirstImageUrl(images = []) {
  const first = dedupeImages(images).find((image) => getImageUrl(image));
  return first ? getImageUrl(first) : null;
}

function getPinImageCandidates(pin) {
  if (!pin) return [];

  return dedupeImages([
    ...normalizeImageList(pin.photos),
    ...normalizeImageList(pin.images),
    ...normalizeImageList(pin.media),
    ...normalizeImageList(pin.attachments),
    ...normalizeImageList(pin.photo),
    ...normalizeImageList(pin.image),
    ...normalizeImageList(pin.thumbnail),
    ...normalizeImageList(pin.thumbnailImage),
    ...normalizeImageList(pin.imageUrl),
    ...normalizeImageList(pin.imageURL),
    ...normalizeImageList(pin.photoUrl),
    ...normalizeImageList(pin.photoURL),
    ...normalizeImageList(pin.downloadUrl),
    ...normalizeImageList(pin.downloadURL),
  ]);
}

function getPinBannerImageUrl(pin) {
  if (!pin) return null;

  return getFirstImageUrl([
    ...normalizeImageList(pin.image),
    ...normalizeImageList(pin.thumbnail),
    ...normalizeImageList(pin.thumbnailImage),
    ...normalizeImageList(pin.photo),
    ...normalizeImageList(pin.photos),
    ...normalizeImageList(pin.images),
  ]);
}

function getHuntLogBannerImageUrl(log) {
  if (!log) return null;

  return getFirstImageUrl([
    ...normalizeImageList(log.photos),
    ...normalizeImageList(log.spreadPhoto),
    ...normalizeImageList(log.image),
    ...normalizeImageList(log.photo),
    ...normalizeImageList(log.thumbnail),
    ...normalizeImageList(log.linkedPin?.image),
    ...normalizeImageList(log.linkedPin?.thumbnail),
    ...normalizeImageList(log.linkedPin?.photos),
    ...normalizeImageList(log.linkedPin?.images),
  ]);
}

function imageExtensionFromUri(uri) {
  const clean = String(uri || "").split("?")[0];
  const last = clean.split("/").pop() || "";
  const ext = last.includes(".") ? last.split(".").pop().toLowerCase() : "";

  if (["jpg", "jpeg", "png", "webp", "heic"].includes(ext)) {
    return ext;
  }

  return "jpg";
}

function contentTypeFromExtension(ext) {
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

function isRemoteUri(uri) {
  return typeof uri === "string" && /^https?:\/\//i.test(uri);
}

async function uploadImageForShare({ shareId, image, folder, index = 0 }) {
  const normalized = normalizeImage(image);
  if (!normalized?.uri) return null;

  if (isRemoteUri(normalized.uri)) {
    return normalized;
  }

  const ext = imageExtensionFromUri(normalized.uri);
  const contentType = contentTypeFromExtension(ext);
  const fileRef = ref(
    storage,
    `shared_items/${shareId}/${folder}/${Date.now()}-${index}.${ext}`
  );

  const response = await fetch(normalized.uri);
  const blob = await response.blob();

  await uploadBytes(fileRef, blob, { contentType });

  const downloadUrl = await getDownloadURL(fileRef);

  return {
    ...normalized,
    uri: downloadUrl,
    sharedUrl: downloadUrl,
    downloadUrl,
  };
}

async function uploadImagesForShare({ shareId, images, folder }) {
  const uploadedImages = [];
  const sourceImages = dedupeImages(images);

  for (let i = 0; i < sourceImages.length; i += 1) {
    const uploaded = await uploadImageForShare({
      shareId,
      image: sourceImages[i],
      folder,
      index: i,
    });

    if (uploaded) uploadedImages.push(uploaded);
  }

  return uploadedImages;
}

function sanitizePin(pin, imageUpdates = {}) {
  const coordinate = cleanCoordinate(pin);

  if (!coordinate) {
    throw new Error("This pin does not have valid coordinates.");
  }

  const photos = dedupeImages(imageUpdates.photos || pin.photos || pin.images || []);
  const mainImage =
    normalizeImage(imageUpdates.image) ||
    normalizeImage(pin.image) ||
    normalizeImage(pin.photo) ||
    normalizeImage(pin.thumbnail) ||
    normalizeImage(pin.thumbnailImage) ||
    photos[0] ||
    null;

  return withCoordinateFields(
    {
      title: cleanString(pin.title || pin.name || pin.pinTitle || "Shared Pin", 120),
      name: cleanString(pin.name || pin.title || pin.pinTitle || "Shared Pin", 120),
      type: normalizePinType(pin.pinType || pin.type),
      pinType: normalizePinType(pin.pinType || pin.type),
      notes: cleanString(pin.notes || pin.description || "", 3000),
      description: cleanString(pin.description || pin.notes || "", 3000),

      photos,
      images: photos,
      image: mainImage,
      thumbnail: mainImage,

      color: pin.color || null,
      icon: pin.icon || null,
      emoji: pin.emoji || null,

      originalId: pin.originalId || pin.id || null,
      originalCreatedAt: pin.originalCreatedAt || pin.createdAt || null,
      originalUpdatedAt: pin.originalUpdatedAt || pin.updatedAt || null,
    },
    coordinate
  );
}

function buildFallbackPinFromHuntLog(log) {
  const coordinate = cleanCoordinate(log?.linkedPin || log?.pin || log);

  if (!coordinate) return null;

  return withCoordinateFields(
    {
      id: log.pinId || null,
      title: log.pinTitle || "Shared Hunt Spot",
      name: log.pinTitle || "Shared Hunt Spot",
      type: "Spot",
      pinType: "Spot",
      notes: log.notes ? `Imported from shared hunt log.\n\n${log.notes}` : "Imported from shared hunt log.",
      description: log.notes ? `Imported from shared hunt log.\n\n${log.notes}` : "Imported from shared hunt log.",
      photos: [],
      images: [],
      createdAt: log.createdAt || Date.now(),
      updatedAt: log.updatedAt || Date.now(),
    },
    coordinate
  );
}

function sanitizeHuntLogForShare(log, imageUpdates = {}, linkedPinPayload = null) {
  const location = cleanCoordinate(log);

  if (!location) {
    throw new Error("This hunt log does not have a valid GPS location.");
  }

  return withCoordinateFields(
    {
      dateTime: log.dateTime || new Date().toISOString(),
      huntDate: log.huntDate || null,
      startTime: log.startTime || null,
      endTime: log.endTime || null,
      createdAt: log.createdAt || Date.now(),
      updatedAt: log.updatedAt || null,

      environment: cleanString(log.environment || "", 80),
      spread: cleanString(log.spread || "", 80),
      spreadOtherText: cleanString(log.spreadOtherText || "", 500),

      spreadPhoto: imageUpdates.spreadPhoto || null,
      spreadDetails: log.spreadDetails || null,

      huntScore: cleanNumber(log.huntScore, 0),
      ducksHarvested: cleanNumber(log.ducksHarvested, 0),
      crippledBirds: cleanNumber(log.crippledBirds, 0),
      hunters: cleanNumber(log.hunters, 1),

      notes: cleanString(log.notes || "", 5000),
      weatherSnapshot: log.weatherSnapshot || null,

      photos: imageUpdates.photos || [],

      pinId: linkedPinPayload?.originalId || log.pinId || null,
      pinTitle: cleanString(linkedPinPayload?.title || log.pinTitle || "", 120),

      linkedPin: linkedPinPayload || null,

      logType: log.logType || log.logMode || "hunt",
      logMode: log.logMode || log.logType || "hunt",
      type: log.type || "huntLog",
      shareType: log.shareType || "huntLog",

      originalId: log.originalId || log.id || null,
    },
    location
  );
}

function getShareLinks(shareId) {
  return {
    appLink: `${APP_SCHEME}://share/${shareId}`,
    webLink: `${WEBSITE_SHARE_BASE_URL}/${shareId}`,
  };
}

export function buildPinShareMessage(pin, shareResult) {
  return [
    `DuckSmart Pin: ${pin.title || "Shared Pin"}`,
    pin.type ? `Type: ${pin.type}` : "",
    pin.notes ? `Notes: ${pin.notes}` : "",
    pin.coordinate
      ? `GPS: ${Number(pin.coordinate.latitude).toFixed(5)}, ${Number(pin.coordinate.longitude).toFixed(5)}`
      : "",
    pin.photos?.length ? `Photos Included: ${pin.photos.length}` : "",
    "",
    "DuckSmart Share Code:",
    shareResult.id,
    "",
    "Open DuckSmart and enter this code to import the shared pin.",
    "",
    "Don't have DuckSmart yet? Download it here:",
    DOWNLOAD_LINK,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildHuntLogShareMessage(log, shareResult) {
  const date = log.dateTime ? new Date(log.dateTime).toLocaleDateString() : "Shared Hunt";
  const linkedPin = log.linkedPin || null;

  return [
    `DuckSmart Hunt Log — ${date}`,
    log.pinTitle ? `Spot: ${log.pinTitle}` : "",
    log.environment ? `Environment: ${log.environment}` : "",
    log.spread ? `Spread: ${log.spread}` : "",
    log.coordinate
      ? `GPS: ${Number(log.coordinate.latitude).toFixed(5)}, ${Number(log.coordinate.longitude).toFixed(5)}`
      : "",
    log.huntScore != null ? `Hunt Score: ${log.huntScore}/100` : "",
    log.ducksHarvested != null ? `Ducks Harvested: ${log.ducksHarvested}` : "",
    log.crippledBirds != null ? `Crippled Birds: ${log.crippledBirds}` : "",
    log.hunters != null ? `Hunters: ${log.hunters}` : "",
    log.photos?.length ? `Hunt Photos Included: ${log.photos.length}` : "",
    linkedPin?.photos?.length ? `Pin Photos Included: ${linkedPin.photos.length}` : "",
    log.notes ? `\nNotes: ${log.notes}` : "",
    "",
    "DuckSmart Share Code:",
    shareResult.id,
    "",
    linkedPin
      ? "Open DuckSmart and enter this code to import the hunt log and linked pin."
      : "Open DuckSmart and enter this code to import the hunt log.",
    "",
    "Don't have DuckSmart yet? Download it here:",
    DOWNLOAD_LINK,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function createSharedPin(pin) {
  assertFirebaseReady();

  const user = auth.currentUser;
  const docRef = doc(collection(db, SHARE_COLLECTION));
  const shareId = docRef.id;

  const normalizedPinSource = sanitizePin(pin);

  const uploadedPinPhotos = await uploadImagesForShare({
    shareId,
    images: getPinImageCandidates(normalizedPinSource),
    folder: "pin_photos",
  });

  const payload = sanitizePin(
    {
      ...normalizedPinSource,
      photos: uploadedPinPhotos,
      images: uploadedPinPhotos,
      image: uploadedPinPhotos[0] || normalizedPinSource.image,
      thumbnail: uploadedPinPhotos[0] || normalizedPinSource.thumbnail,
    },
    {
      photos: uploadedPinPhotos,
      image: uploadedPinPhotos[0] || normalizedPinSource.image,
    }
  );

  await setDoc(docRef, {
    version: 3,
    type: "pin",
    payload,
    coordinate: payload.coordinate,
    latitude: payload.latitude,
    longitude: payload.longitude,
    createdAt: serverTimestamp(),
    createdBy: user?.uid || null,
    createdByEmail: user?.email || null,
  });

  const links = getShareLinks(shareId);
  const imageUrl = getPinBannerImageUrl(payload);

  return {
    id: shareId,
    type: "pin",
    ...links,
    imageUrl,
    url: links.appLink,
    coordinate: payload.coordinate,
    latitude: payload.latitude,
    longitude: payload.longitude,
    message: buildPinShareMessage(payload, {
      id: shareId,
      ...links,
      imageUrl,
    }),
  };
}

export async function createSharedHuntLog(log, linkedPin = null) {
  assertFirebaseReady();

  const user = auth.currentUser;
  const docRef = doc(collection(db, SHARE_COLLECTION));
  const shareId = docRef.id;

  const uploadedSpreadPhoto = log.spreadPhoto
    ? await uploadImageForShare({
        shareId,
        image: log.spreadPhoto,
        folder: "spread_photo",
        index: 0,
      })
    : null;

  const uploadedPhotos = await uploadImagesForShare({
    shareId,
    images: Array.isArray(log.photos) ? log.photos : [],
    folder: "hunt_photos",
  });

  const pinSource =
    linkedPin ||
    log.linkedPin ||
    log.linkedPinSnapshot ||
    log.pin ||
    buildFallbackPinFromHuntLog(log);

  let linkedPinPayload = null;

  if (pinSource) {
    const safePinSource = {
      ...pinSource,
      title: pinSource.title || log.pinTitle || "Shared Hunt Spot",
      name: pinSource.name || pinSource.title || log.pinTitle || "Shared Hunt Spot",
      type: pinSource.type || pinSource.pinType || "Spot",
      pinType: pinSource.pinType || pinSource.type || "Spot",
      notes: pinSource.notes || "",
      description: pinSource.description || pinSource.notes || "",
      coordinate: cleanCoordinate(pinSource) || cleanCoordinate(log),
      location: cleanCoordinate(pinSource) || cleanCoordinate(log),
    };

    const uploadedPinPhotos = await uploadImagesForShare({
      shareId,
      images: getPinImageCandidates(safePinSource),
      folder: "linked_pin_photos",
    });

    linkedPinPayload = sanitizePin(
      {
        ...safePinSource,
        photos: uploadedPinPhotos,
        images: uploadedPinPhotos,
        image: uploadedPinPhotos[0] || normalizeImage(safePinSource.image || safePinSource.photo),
        thumbnail: uploadedPinPhotos[0] || normalizeImage(safePinSource.thumbnail || safePinSource.image),
      },
      {
        photos: uploadedPinPhotos,
        image: uploadedPinPhotos[0] || normalizeImage(safePinSource.image || safePinSource.photo),
      }
    );
  }

  const payload = sanitizeHuntLogForShare(
    log,
    {
      spreadPhoto: uploadedSpreadPhoto,
      photos: uploadedPhotos,
    },
    linkedPinPayload
  );

  await setDoc(docRef, {
    version: 3,
    type: "huntLog",
    payload,
    coordinate: payload.coordinate,
    latitude: payload.latitude,
    longitude: payload.longitude,
    createdAt: serverTimestamp(),
    createdBy: user?.uid || null,
    createdByEmail: user?.email || null,
  });

  const links = getShareLinks(shareId);
  const imageUrl = getHuntLogBannerImageUrl(payload);

  return {
    id: shareId,
    type: "huntLog",
    ...links,
    imageUrl,
    url: links.appLink,
    coordinate: payload.coordinate,
    latitude: payload.latitude,
    longitude: payload.longitude,
    message: buildHuntLogShareMessage(payload, {
      id: shareId,
      ...links,
      imageUrl,
    }),
  };
}

export function parseDuckSmartShareId(url) {
  if (!url || typeof url !== "string") return null;

  const trimmed = url.trim();

  const appMatch = trimmed.match(/^ducksmart:\/\/share\/([^/?#]+)/i);
  if (appMatch?.[1]) return decodeURIComponent(appMatch[1]);

  const webMatch = trimmed.match(/ducksmart\.app\/share\/([^/?#]+)/i);
  if (webMatch?.[1]) return decodeURIComponent(webMatch[1]);

  return null;
}

export async function getSharedItem(shareId) {
  assertFirebaseReady();

  if (!shareId) {
    throw new Error("Missing share ID.");
  }

  const snap = await getDoc(doc(db, SHARE_COLLECTION, shareId));

  if (!snap.exists()) {
    throw new Error("This shared DuckSmart item was not found.");
  }

  const data = snap.data();

  if (!data?.type || !data?.payload) {
    throw new Error("This shared DuckSmart item is invalid.");
  }

  const payloadCoordinate = cleanCoordinate(data.payload || data);
  const payload = payloadCoordinate
    ? withCoordinateFields(data.payload, payloadCoordinate)
    : data.payload;

  return {
    id: snap.id,
    type: data.type,
    payload,
    coordinate: payloadCoordinate,
    latitude: payloadCoordinate ? payloadCoordinate.latitude : null,
    longitude: payloadCoordinate ? payloadCoordinate.longitude : null,
    version: data.version || 1,
    createdBy: data.createdBy || null,
  };
}

function buildImportedPinFromPayload(payload, shareId) {
  const coordinate = cleanCoordinate(payload);

  if (!coordinate) {
    throw new Error("This shared pin does not have valid coordinates.");
  }

  const photos = dedupeImages(payload.photos || payload.images || []);
  const image =
    normalizeImage(payload.image) ||
    normalizeImage(payload.thumbnail) ||
    photos[0] ||
    null;

  return withCoordinateFields(
    {
      ...payload,

      id: `imported-pin-${Date.now()}`,
      title: cleanString(payload.title || payload.name || "Imported Pin", 120),
      name: cleanString(payload.name || payload.title || "Imported Pin", 120),
      type: normalizePinType(payload.pinType || payload.type),
      pinType: normalizePinType(payload.pinType || payload.type),
      notes: cleanString(payload.notes || payload.description || "", 3000),
      description: cleanString(payload.description || payload.notes || "", 3000),

      photos,
      images: photos,
      image,
      thumbnail: image,

      color: payload.color || null,
      icon: payload.icon || null,
      emoji: payload.emoji || null,

      createdAt: Date.now(),
      updatedAt: Date.now(),
      importedAt: Date.now(),
      importedFromShareId: shareId,
      importedOriginalId: payload.originalId || null,
    },
    coordinate
  );
}

export function buildImportedPin(sharedItem) {
  if (!sharedItem) {
    throw new Error("Missing shared item.");
  }

  if (sharedItem.type === "pin") {
    return buildImportedPinFromPayload(sharedItem.payload || {}, sharedItem.id);
  }

  if (sharedItem.type === "huntLog") {
    const payload = sharedItem.payload || {};
    const linkedPin = payload.linkedPin || buildFallbackPinFromHuntLog(payload);

    if (!linkedPin) {
      throw new Error("This shared hunt log does not include a valid linked pin.");
    }

    return buildImportedPinFromPayload(linkedPin, sharedItem.id);
  }

  throw new Error("This shared item is not a pin.");
}

function buildImportedHuntLogFromPayload(payload, shareId, importedPin = null) {
  const location = cleanCoordinate(payload);

  if (!location) {
    throw new Error("This shared hunt log does not have a valid GPS location.");
  }

  return withCoordinateFields(
    {
      ...payload,

      id: `imported-hunt-${Date.now()}`,

      pinId: importedPin?.id || payload.pinId || null,
      pinTitle: importedPin?.title || cleanString(payload.pinTitle || "", 120),

      linkedPin: importedPin || null,
      linkedPinImport: importedPin || null,

      createdAt: Date.now(),
      updatedAt: Date.now(),
      importedAt: Date.now(),
      importedFromShareId: shareId,
    },
    location
  );
}

export function buildImportedHuntLog(sharedItem) {
  if (!sharedItem || sharedItem.type !== "huntLog") {
    throw new Error("This shared item is not a hunt log.");
  }

  const payload = sharedItem.payload || {};
  let importedPin = null;

  try {
    importedPin = buildImportedPin(sharedItem);
  } catch {
    importedPin = null;
  }

  return buildImportedHuntLogFromPayload(payload, sharedItem.id, importedPin);
}

export function buildImportedHuntLogAndPin(sharedItem) {
  if (!sharedItem || sharedItem.type !== "huntLog") {
    throw new Error("This shared item is not a hunt log.");
  }

  const payload = sharedItem.payload || {};
  let pin = null;

  try {
    pin = buildImportedPin(sharedItem);
  } catch {
    pin = null;
  }

  const huntLog = buildImportedHuntLogFromPayload(payload, sharedItem.id, pin);

  return {
    huntLog,
    pin,
  };
}