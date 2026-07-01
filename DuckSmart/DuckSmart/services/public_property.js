// /services/public_property.js

const PAD_US_FEE_LAYER_URL =
  "https://edits.nationalmap.gov/arcgis/rest/services/PAD-US/PAD_US_Landforms/MapServer/0";

const PUBLIC_PROPERTY_MAX_FEATURES = 150;
const PUBLIC_PROPERTY_TIMEOUT_MS = 12000;
const MAX_PUBLIC_LAND_DELTA = 0.75;

const PUBLIC_PROPERTY_FIELDS = [
  "OBJECTID",
  "Category",
  "Own_Type",
  "Own_Name",
  "Mang_Type",
  "Mang_Name",
  "Loc_Mang",
  "Des_Tp",
  "Loc_Ds",
  "Unit_Nm",
  "Loc_Nm",
  "State_Nm",
  "GIS_Acres",
].join(",");

function emptyFeatureCollection() {
  return {
    type: "FeatureCollection",
    features: [],
  };
}

function cleanNumber(value, fallback = null) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function cleanText(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function clamp(value, min, max) {
  const n = cleanNumber(value, min);
  return Math.max(min, Math.min(max, n));
}

function getRegionBounds(region) {
  if (!region) return null;

  const latitude = cleanNumber(region.latitude);
  const longitude = cleanNumber(region.longitude);

  if (latitude === null || longitude === null) return null;

  const rawLatDelta = cleanNumber(region.latitudeDelta, 0.08);
  const rawLngDelta = cleanNumber(region.longitudeDelta, 0.08);

  const latitudeDelta = clamp(rawLatDelta * 1.25, 0.04, MAX_PUBLIC_LAND_DELTA);
  const longitudeDelta = clamp(rawLngDelta * 1.25, 0.04, MAX_PUBLIC_LAND_DELTA);

  return {
    xmin: longitude - longitudeDelta / 2,
    ymin: latitude - latitudeDelta / 2,
    xmax: longitude + longitudeDelta / 2,
    ymax: latitude + latitudeDelta / 2,
  };
}

function makeArcGisGeometry(bounds) {
  if (!bounds) return null;

  return JSON.stringify({
    xmin: bounds.xmin,
    ymin: bounds.ymin,
    xmax: bounds.xmax,
    ymax: bounds.ymax,
    spatialReference: {
      wkid: 4326,
    },
  });
}

function getPublicLandTitle(props = {}) {
  return (
    cleanText(props.Loc_Nm) ||
    cleanText(props.Unit_Nm) ||
    cleanText(props.Loc_Ds) ||
    cleanText(props.Mang_Name) ||
    cleanText(props.Own_Name) ||
    "Public Land"
  );
}

function getSearchBlob(props = {}) {
  return [
    props.Category,
    props.Own_Type,
    props.Own_Name,
    props.Mang_Type,
    props.Mang_Name,
    props.Loc_Mang,
    props.Des_Tp,
    props.Loc_Ds,
    props.Unit_Nm,
    props.Loc_Nm,
    props.State_Nm,
  ]
    .map(cleanText)
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function isWmaFeature(props = {}) {
  const blob = getSearchBlob(props);

  if (!blob) return false;

  const directWmaMatch =
    blob.includes("wildlife management area") ||
    blob.includes("waterfowl management area") ||
    /\bwma\b/i.test(blob) ||
    /\bw\.m\.a\.?\b/i.test(blob);

  if (directWmaMatch) return true;

  const huntingLandMatch =
    blob.includes("wildlife area") ||
    blob.includes("wildlife management") ||
    blob.includes("wildlife conservation area") ||
    blob.includes("wildlife habitat area") ||
    blob.includes("game land") ||
    blob.includes("game lands") ||
    blob.includes("game management area") ||
    blob.includes("state game area") ||
    blob.includes("waterfowl production area") ||
    blob.includes("waterfowl area") ||
    blob.includes("duck management area") ||
    blob.includes("habitat management area");

  if (huntingLandMatch) return true;

  const managerCode = cleanText(props.Mang_Name).toUpperCase();
  const ownerCode = cleanText(props.Own_Name).toUpperCase();

  const stateFishWildlifeManaged =
    managerCode === "SFW" ||
    ownerCode === "SFW" ||
    blob.includes("state fish and wildlife") ||
    blob.includes("fish & wildlife") ||
    blob.includes("fish and wildlife");

  return (
    stateFishWildlifeManaged &&
    (
      blob.includes("wildlife") ||
      blob.includes("game") ||
      blob.includes("waterfowl") ||
      blob.includes("habitat")
    )
  );
}

function normalizePublicFeature(feature) {
  if (!feature || feature.type !== "Feature") return null;

  const geometryType = feature.geometry?.type;

  if (!["Polygon", "MultiPolygon"].includes(geometryType)) {
    return null;
  }

  const props = feature.properties || {};
  const isWma = isWmaFeature(props);
  const title = getPublicLandTitle(props);

  return {
    ...feature,
    properties: {
      ...props,
      ducksmartPublicLand: true,
      ducksmartLandCategory: isWma ? "wma" : "public",
      ducksmartIsWma: isWma,
      ducksmartTitle: title,
      ducksmartSubtitle: [
        isWma ? "WMA / Wildlife Area" : null,
        props.Own_Name || null,
        props.Mang_Name || null,
        props.State_Nm || null,
      ]
        .filter(Boolean)
        .join(" • "),
      ducksmartAcres: props.GIS_Acres || null,
    },
  };
}

function normalizeFeatureCollection(data) {
  if (!data || data.type !== "FeatureCollection" || !Array.isArray(data.features)) {
    return emptyFeatureCollection();
  }

  return {
    type: "FeatureCollection",
    features: data.features
      .slice(0, PUBLIC_PROPERTY_MAX_FEATURES)
      .map(normalizePublicFeature)
      .filter(Boolean),
  };
}

function buildPublicPropertyQueryUrl(region) {
  const bounds = getRegionBounds(region);
  const geometry = makeArcGisGeometry(bounds);

  const params = new URLSearchParams({
    f: "geojson",
    where: "1=1",
    outFields: PUBLIC_PROPERTY_FIELDS,
    returnGeometry: "true",
    spatialRel: "esriSpatialRelIntersects",
    geometryType: "esriGeometryEnvelope",
    inSR: "4326",
    outSR: "4326",
    resultRecordCount: String(PUBLIC_PROPERTY_MAX_FEATURES),
    geometryPrecision: "4",
    maxAllowableOffset: "0.0005",
  });

  if (geometry) {
    params.append("geometry", geometry);
  }

  return `${PAD_US_FEE_LAYER_URL}/query?${params.toString()}`;
}

async function fetchWithTimeout(url, timeoutMs = PUBLIC_PROPERTY_TIMEOUT_MS) {
  const controller = typeof AbortController !== "undefined"
    ? new AbortController()
    : null;

  const timeout = controller
    ? setTimeout(() => controller.abort(), timeoutMs)
    : null;

  try {
    return await fetch(url, {
      method: "GET",
      signal: controller?.signal,
      headers: {
        Accept: "application/json",
      },
    });
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function fetchPublicPropertyGeojson(region) {
  try {
    const url = buildPublicPropertyQueryUrl(region);

    const response = await fetchWithTimeout(url);
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(`Public land request failed with HTTP ${response.status}`);
    }

    if (data?.error?.message) {
      throw new Error(data.error.message);
    }

    return normalizeFeatureCollection(data);
  } catch (err) {
    console.warn("DuckSmart public land helper failed:", err?.message || err);
    return emptyFeatureCollection();
  }
}