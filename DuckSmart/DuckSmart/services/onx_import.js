// services/onx_import.js

import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";

const ONX_SOURCE = "onx";
const DEFAULT_PIN_TYPE = "Spot";

function cleanText(value, fallback = "") {
  const text = String(value || "")
    .replace(/\s+/g, " ")
    .trim();

  return text || fallback;
}

function cleanFileName(value) {
  return cleanText(value, "onx-import.gpx").slice(0, 180);
}

function cleanNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function decodeXml(value = "") {
  return String(value || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .trim();
}

function stripXmlTags(value = "") {
  return decodeXml(String(value || "").replace(/<[^>]+>/g, " "));
}

function escapeRegExp(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getAttr(attrs = "", name) {
  const safeName = escapeRegExp(name);
  const re = new RegExp(`${safeName}\\s*=\\s*["']([^"']+)["']`, "i");
  const match = String(attrs || "").match(re);

  return match ? decodeXml(match[1]) : "";
}

function extractElements(xml = "", tagName) {
  const safeTag = escapeRegExp(tagName);
  const re = new RegExp(
    `<(?:[A-Za-z0-9_-]+:)?${safeTag}\\b([^>]*?)(?:\\/\\s*>|>([\\s\\S]*?)<\\/(?:[A-Za-z0-9_-]+:)?${safeTag}\\s*>)`,
    "gi"
  );

  const out = [];
  let match;

  while ((match = re.exec(String(xml || "")))) {
    out.push({
      raw: match[0] || "",
      attrs: match[1] || "",
      inner: match[2] || "",
    });
  }

  return out;
}

function getTagValue(xml = "", tagName) {
  const safeTag = escapeRegExp(tagName);
  const exact = new RegExp(
    `<${safeTag}\\b[^>]*>([\\s\\S]*?)<\\/${safeTag}\\s*>`,
    "i"
  );

  const exactMatch = String(xml || "").match(exact);

  if (exactMatch) {
    return stripXmlTags(exactMatch[1]);
  }

  const localName = tagName.includes(":")
    ? tagName.split(":").pop()
    : tagName;

  const safeLocal = escapeRegExp(localName);
  const loose = new RegExp(
    `<(?:[A-Za-z0-9_-]+:)?${safeLocal}\\b[^>]*>([\\s\\S]*?)<\\/(?:[A-Za-z0-9_-]+:)?${safeLocal}\\s*>`,
    "i"
  );

  const looseMatch = String(xml || "").match(loose);

  return looseMatch ? stripXmlTags(looseMatch[1]) : "";
}

function getFirstNonEmpty(...values) {
  for (const value of values) {
    const cleaned = cleanText(value);
    if (cleaned) return cleaned;
  }

  return "";
}

function parseTimestamp(value) {
  const raw = cleanText(value);

  if (!raw) return null;

  const parsed = new Date(raw).getTime();

  return Number.isFinite(parsed) ? parsed : null;
}

function getPointTime(pointInner = "", fallback = null) {
  return (
    parseTimestamp(getTagValue(pointInner, "time")) ||
    fallback ||
    Date.now()
  );
}

function stableHash(value = "") {
  const str = String(value || "");
  let hash = 0;

  if (!str.length) return "0";

  for (let i = 0; i < str.length; i += 1) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }

  return Math.abs(hash).toString(36);
}

function toRad(value) {
  return (value * Math.PI) / 180;
}

function getDistanceMiles(points = []) {
  const coords = points
    .map((point) => {
      const latitude = cleanNumber(point?.latitude);
      const longitude = cleanNumber(point?.longitude);

      if (latitude === null || longitude === null) return null;

      return { latitude, longitude };
    })
    .filter(Boolean);

  if (coords.length < 2) return 0;

  let total = 0;
  const earthRadiusMiles = 3958.8;

  for (let i = 1; i < coords.length; i += 1) {
    const a = coords[i - 1];
    const b = coords[i];

    const dLat = toRad(b.latitude - a.latitude);
    const dLon = toRad(b.longitude - a.longitude);

    const lat1 = toRad(a.latitude);
    const lat2 = toRad(b.latitude);

    const hav =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1) *
        Math.cos(lat2) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(hav), Math.sqrt(1 - hav));

    total += earthRadiusMiles * c;
  }

  return total;
}

function formatDistance(miles) {
  const n = Number(miles);

  if (!Number.isFinite(n)) return "0 ft";
  if (n < 0.1) return `${Math.round(n * 5280)} ft`;

  return `${n.toFixed(2)} mi`;
}

function guessDuckSmartPinType({ name = "", icon = "", description = "" } = {}) {
  const text = `${name} ${icon} ${description}`.toLowerCase();

  if (
    text.includes("blind") ||
    text.includes("pit") ||
    text.includes("stand") ||
    text.includes("hide")
  ) {
    return "Blind";
  }

  if (
    text.includes("ramp") ||
    text.includes("boat") ||
    text.includes("launch")
  ) {
    return "Ramp";
  }

  if (
    text.includes("parking") ||
    text.includes("access") ||
    text.includes("gate") ||
    text.includes("entry")
  ) {
    return "Access";
  }

  return DEFAULT_PIN_TYPE;
}

function buildPinNotes({
  description,
  comment,
  symbol,
  icon,
  color,
  sourceFileName,
} = {}) {
  const parts = [];

  if (description) parts.push(description);
  if (comment && comment !== description) parts.push(comment);
  if (symbol) parts.push(`Symbol: ${symbol}`);
  if (icon) parts.push(`onX icon: ${icon}`);
  if (color) parts.push(`onX color: ${color}`);
  if (sourceFileName) parts.push(`Imported from onX GPX: ${sourceFileName}`);

  return parts.filter(Boolean).join("\n");
}

function parseGpxPoints(xml = "", pointTag = "trkpt", fallbackTimestamp = null) {
  return extractElements(xml, pointTag)
    .map((item, index) => {
      const latitude = cleanNumber(getAttr(item.attrs, "lat"));
      const longitude = cleanNumber(getAttr(item.attrs, "lon"));

      if (latitude === null || longitude === null) return null;

      const elevation = cleanNumber(getTagValue(item.inner, "ele"));
      const timestamp = getPointTime(item.inner, fallbackTimestamp);

      return {
        latitude,
        longitude,
        timestamp,
        elevation,
        altitude: elevation,
        pointIndex: index,
      };
    })
    .filter(Boolean);
}

function parseWaypoints(xml = "", metadata = {}) {
  const sourceFileName = cleanFileName(metadata.fileName);
  const importedAt = Date.now();

  return extractElements(xml, "wpt")
    .map((item, index) => {
      const latitude = cleanNumber(getAttr(item.attrs, "lat"));
      const longitude = cleanNumber(getAttr(item.attrs, "lon"));

      if (latitude === null || longitude === null) return null;

      const name = getFirstNonEmpty(
        getTagValue(item.inner, "name"),
        `onX Waypoint ${index + 1}`
      );

      const description = getFirstNonEmpty(
        getTagValue(item.inner, "desc"),
        getTagValue(item.inner, "description")
      );

      const comment = getTagValue(item.inner, "cmt");
      const symbol = getTagValue(item.inner, "sym");
      const icon = getFirstNonEmpty(
        getTagValue(item.inner, "onx:icon"),
        getTagValue(item.inner, "icon")
      );
      const color = getFirstNonEmpty(
        getTagValue(item.inner, "onx:color"),
        getTagValue(item.inner, "color")
      );

      const timestamp =
        parseTimestamp(getTagValue(item.inner, "time")) || importedAt;

      const coordinate = { latitude, longitude };
      const pinType = guessDuckSmartPinType({
        name,
        icon,
        description,
      });

      const sourceId = stableHash(
        `${sourceFileName}|wpt|${index}|${name}|${latitude}|${longitude}|${timestamp}`
      );

      return {
        id: `onx-pin-${sourceId}`,
        title: name,
        name,
        type: pinType,
        pinType,
        notes: buildPinNotes({
          description,
          comment,
          symbol,
          icon,
          color,
          sourceFileName,
        }),

        coordinate,
        coordinates: coordinate,
        coords: coordinate,
        location: coordinate,
        latitude,
        longitude,
        locationLatitude: latitude,
        locationLongitude: longitude,

        importedFrom: ONX_SOURCE,
        importedFromOnX: true,
        importedFromFileName: sourceFileName,
        importedAt,
        originalOnXName: name,
        originalOnXIcon: icon || null,
        originalOnXColor: color || null,
        originalOnXSymbol: symbol || null,
        originalOnXTime: getTagValue(item.inner, "time") || null,

        createdAt: timestamp,
        updatedAt: importedAt,
      };
    })
    .filter(Boolean);
}

function buildWaypointPath({
  points,
  index,
  name,
  description,
  comment,
  sourceFileName,
  kind,
} = {}) {
  const cleanPoints = Array.isArray(points)
    ? points
        .map((point, pointIndex) => {
          const latitude = cleanNumber(point?.latitude);
          const longitude = cleanNumber(point?.longitude);

          if (latitude === null || longitude === null) return null;

          const timestamp = Number.isFinite(Number(point?.timestamp))
            ? Number(point.timestamp)
            : Date.now();

          return {
            latitude,
            longitude,
            timestamp,
            accuracy: point?.accuracy ?? null,
            altitude: point?.altitude ?? point?.elevation ?? null,
            elevation: point?.elevation ?? point?.altitude ?? null,
            speed: point?.speed ?? null,
            heading: point?.heading ?? null,
            pointIndex,
          };
        })
        .filter(Boolean)
    : [];

  if (cleanPoints.length < 2) return null;

  const importedAt = Date.now();
  const startedAt = cleanPoints[0]?.timestamp || importedAt;
  const endedAt = cleanPoints[cleanPoints.length - 1]?.timestamp || startedAt;
  const distanceMiles = getDistanceMiles(cleanPoints);

  const title = cleanText(
    name,
    kind === "route" ? `onX Route ${index + 1}` : `onX Path ${index + 1}`
  );

  const sourceId = stableHash(
    `${sourceFileName}|${kind}|${index}|${title}|${cleanPoints[0].latitude}|${cleanPoints[0].longitude}|${cleanPoints.length}`
  );

  const coordinates = cleanPoints.map((point) => ({
    latitude: point.latitude,
    longitude: point.longitude,
  }));

  const sourceNotes = [
    description,
    comment && comment !== description ? comment : "",
    `Imported from onX GPX: ${sourceFileName}`,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    id: `onx-path-${sourceId}`,
    pathId: `onx-path-${sourceId}`,
    title,
    name: title,
    notes: sourceNotes,
    description: sourceNotes,
    points: cleanPoints,
    coordinates,
    startedAt,
    endedAt,
    createdAt: startedAt,
    updatedAt: importedAt,
    distanceMiles,
    pointCount: cleanPoints.length,
    savedOffline: true,
    syncedToFirebase: false,

    importedFrom: ONX_SOURCE,
    importedFromOnX: true,
    importedFromFileName: sourceFileName,
    importedAt,
    originalOnXName: name || null,
    originalOnXType: kind,
  };
}

function parseTracks(xml = "", metadata = {}) {
  const sourceFileName = cleanFileName(metadata.fileName);

  return extractElements(xml, "trk")
    .map((item, index) => {
      const name = getTagValue(item.inner, "name");
      const description = getFirstNonEmpty(
        getTagValue(item.inner, "desc"),
        getTagValue(item.inner, "description")
      );
      const comment = getTagValue(item.inner, "cmt");

      const segments = extractElements(item.inner, "trkseg");

      let points = [];

      if (segments.length > 0) {
        segments.forEach((segment) => {
          points = points.concat(parseGpxPoints(segment.inner, "trkpt"));
        });
      } else {
        points = parseGpxPoints(item.inner, "trkpt");
      }

      return buildWaypointPath({
        points,
        index,
        name,
        description,
        comment,
        sourceFileName,
        kind: "track",
      });
    })
    .filter(Boolean);
}

function parseRoutes(xml = "", metadata = {}) {
  const sourceFileName = cleanFileName(metadata.fileName);

  return extractElements(xml, "rte")
    .map((item, index) => {
      const name = getTagValue(item.inner, "name");
      const description = getFirstNonEmpty(
        getTagValue(item.inner, "desc"),
        getTagValue(item.inner, "description")
      );
      const comment = getTagValue(item.inner, "cmt");
      const points = parseGpxPoints(item.inner, "rtept");

      return buildWaypointPath({
        points,
        index,
        name,
        description,
        comment,
        sourceFileName,
        kind: "route",
      });
    })
    .filter(Boolean);
}

export function buildDuckSmartPathPinFromOnXPath(path) {
  const coordinates = Array.isArray(path?.coordinates)
    ? path.coordinates
    : Array.isArray(path?.points)
      ? path.points.map((point) => ({
          latitude: point.latitude,
          longitude: point.longitude,
        }))
      : [];

  const cleanCoordinates = coordinates
    .map((point) => {
      const latitude = cleanNumber(point?.latitude);
      const longitude = cleanNumber(point?.longitude);

      if (latitude === null || longitude === null) return null;

      return { latitude, longitude };
    })
    .filter(Boolean);

  if (!path?.id || cleanCoordinates.length < 2) return null;

  const importedAt = Date.now();
  const start = cleanCoordinates[0];
  const distanceMiles = Number.isFinite(Number(path.distanceMiles))
    ? Number(path.distanceMiles)
    : getDistanceMiles(cleanCoordinates);

  const pointCount = Number.isFinite(Number(path.pointCount))
    ? Number(path.pointCount)
    : cleanCoordinates.length;

  const distanceText = formatDistance(distanceMiles);
  const title = cleanText(path.title || path.name, "onX Path");

  return {
    id: `path-pin-${path.id}`,
    itemKind: "waypointPath",
    type: "Path",
    pinType: "Path",
    title,
    name: title,
    notes: `${distanceText} • ${pointCount} points`,
    description: `${distanceText} • ${pointCount} points`,

    coordinate: start,
    coordinates: start,
    coords: start,
    location: start,
    latitude: start.latitude,
    longitude: start.longitude,
    locationLatitude: start.latitude,
    locationLongitude: start.longitude,

    waypointPathId: path.id,
    waypointPath: {
      ...path,
      coordinates: cleanCoordinates,
    },
    pathPoints: Array.isArray(path.points) ? path.points : cleanCoordinates,
    pathCoordinates: cleanCoordinates,

    distanceMiles,
    pointCount,

    shareType: "pin",
    itemType: "shared_pin",
    icon: "👣",
    emoji: "👣",

    importedFrom: ONX_SOURCE,
    importedFromOnX: true,
    importedFromFileName: path.importedFromFileName || null,
    importedAt: path.importedAt || importedAt,

    createdAt: path.createdAt || path.startedAt || importedAt,
    updatedAt: importedAt,
  };
}

export function parseOnXGpxText(gpxText, metadata = {}) {
  const xml = String(gpxText || "").trim();

  if (!xml) {
    throw new Error("This GPX file is empty.");
  }

  if (!xml.includes("<gpx") && !xml.includes(":gpx")) {
    throw new Error("This does not look like a valid GPX file.");
  }

  const sourceFileName = cleanFileName(metadata.fileName);

  const pins = parseWaypoints(xml, {
    ...metadata,
    fileName: sourceFileName,
  });

  const trackPaths = parseTracks(xml, {
    ...metadata,
    fileName: sourceFileName,
  });

  const routePaths = parseRoutes(xml, {
    ...metadata,
    fileName: sourceFileName,
  });

  const waypointPaths = [...trackPaths, ...routePaths];
  const pathPins = waypointPaths
    .map(buildDuckSmartPathPinFromOnXPath)
    .filter(Boolean);

  return {
    pins,
    waypointPaths,
    pathPins,
    allPins: [...pins, ...pathPins],
    summary: {
      fileName: sourceFileName,
      pinsCount: pins.length,
      pathsCount: waypointPaths.length,
      pathPinsCount: pathPins.length,
      totalMapItems: pins.length + pathPins.length,
      tracksCount: trackPaths.length,
      routesCount: routePaths.length,
    },
  };
}

async function readTextFromUri(uri) {
  if (!uri) {
    throw new Error("Missing GPX file URI.");
  }

  try {
    return await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType?.UTF8 || "utf8",
    });
  } catch (firstErr) {
    try {
      return await FileSystem.readAsStringAsync(uri);
    } catch {
      throw firstErr;
    }
  }
}

function getDocumentAsset(result) {
  if (!result) return null;

  if (Array.isArray(result.assets) && result.assets.length > 0) {
    return result.assets[0];
  }

  if (result.uri) return result;

  return null;
}

function isDocumentPickerCancelled(result) {
  return (
    result?.canceled === true ||
    result?.cancelled === true ||
    result?.type === "cancel"
  );
}

export async function readOnXGpxFile(uri, metadata = {}) {
  const text = await readTextFromUri(uri);

  return parseOnXGpxText(text, metadata);
}

export async function pickAndParseOnXGpxFile() {
  const result = await DocumentPicker.getDocumentAsync({
    type: [
      "application/gpx+xml",
      "application/xml",
      "text/xml",
      "text/gpx",
      "application/octet-stream",
      "*/*",
    ],
    copyToCacheDirectory: true,
    multiple: false,
  });

  if (isDocumentPickerCancelled(result)) {
    return {
      canceled: true,
      pins: [],
      waypointPaths: [],
      pathPins: [],
      allPins: [],
      summary: {
        fileName: "",
        pinsCount: 0,
        pathsCount: 0,
        pathPinsCount: 0,
        totalMapItems: 0,
        tracksCount: 0,
        routesCount: 0,
      },
    };
  }

  const asset = getDocumentAsset(result);

  if (!asset?.uri) {
    throw new Error("Could not read the selected GPX file.");
  }

  const fileName = cleanFileName(asset.name || "onx-import.gpx");
  const extension = fileName.split(".").pop()?.toLowerCase();

  if (extension && extension !== "gpx" && extension !== "xml") {
    throw new Error("Please choose a GPX export file from onX.");
  }

  const parsed = await readOnXGpxFile(asset.uri, {
    fileName,
    fileUri: asset.uri,
    mimeType: asset.mimeType || asset.mime || "",
    size: asset.size || null,
  });

  return {
    canceled: false,
    file: {
      name: fileName,
      uri: asset.uri,
      mimeType: asset.mimeType || asset.mime || "",
      size: asset.size || null,
    },
    ...parsed,
  };
}

export function mergeOnXImportedPins(existingPins = [], importedPins = []) {
  const existing = Array.isArray(existingPins) ? existingPins : [];
  const incoming = Array.isArray(importedPins) ? importedPins : [];

  const seen = new Set();

  existing.forEach((pin) => {
    if (pin?.id) seen.add(String(pin.id));

    const lat = cleanNumber(pin?.latitude ?? pin?.coordinate?.latitude);
    const lon = cleanNumber(pin?.longitude ?? pin?.coordinate?.longitude);
    const title = cleanText(pin?.title || pin?.name);

    if (lat !== null && lon !== null && title) {
      seen.add(`${title}|${lat.toFixed(6)}|${lon.toFixed(6)}`);
    }
  });

  const uniqueIncoming = incoming.filter((pin) => {
    if (!pin) return false;

    const lat = cleanNumber(pin.latitude ?? pin.coordinate?.latitude);
    const lon = cleanNumber(pin.longitude ?? pin.coordinate?.longitude);
    const title = cleanText(pin.title || pin.name);

    const idKey = pin.id ? String(pin.id) : "";
    const gpsKey =
      lat !== null && lon !== null && title
        ? `${title}|${lat.toFixed(6)}|${lon.toFixed(6)}`
        : "";

    if ((idKey && seen.has(idKey)) || (gpsKey && seen.has(gpsKey))) {
      return false;
    }

    if (idKey) seen.add(idKey);
    if (gpsKey) seen.add(gpsKey);

    return true;
  });

  return [...uniqueIncoming, ...existing];
}

export function getOnXImportSummaryText(result = {}) {
  const summary = result.summary || {};
  const pinsCount = Number(summary.pinsCount || 0);
  const pathsCount = Number(summary.pathsCount || 0);

  if (pinsCount === 0 && pathsCount === 0) {
    return "No pins or paths were found in this onX GPX file.";
  }

  const parts = [];

  if (pinsCount === 1) parts.push("1 pin");
  if (pinsCount > 1) parts.push(`${pinsCount} pins`);

  if (pathsCount === 1) parts.push("1 path");
  if (pathsCount > 1) parts.push(`${pathsCount} paths`);

  return `Imported ${parts.join(" and ")} from onX.`;
}

export default {
  pickAndParseOnXGpxFile,
  readOnXGpxFile,
  parseOnXGpxText,
  buildDuckSmartPathPinFromOnXPath,
  mergeOnXImportedPins,
  getOnXImportSummaryText,
};