// /Users/gozyr/Development/ducksmart/DuckSmart/DuckSmart/services/mapSearch.js

import { SEARCH_REGRID_OWNER_URL } from "../config";

const REGRID_OWNER_SEARCH_URL = SEARCH_REGRID_OWNER_URL;

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 10;

const STATE_ABBREVIATIONS = {
  alabama: "al",
  alaska: "ak",
  arizona: "az",
  arkansas: "ar",
  california: "ca",
  colorado: "co",
  connecticut: "ct",
  delaware: "de",
  florida: "fl",
  georgia: "ga",
  hawaii: "hi",
  idaho: "id",
  illinois: "il",
  indiana: "in",
  iowa: "ia",
  kansas: "ks",
  kentucky: "ky",
  louisiana: "la",
  maine: "me",
  maryland: "md",
  massachusetts: "ma",
  michigan: "mi",
  minnesota: "mn",
  mississippi: "ms",
  missouri: "mo",
  montana: "mt",
  nebraska: "ne",
  nevada: "nv",
  "new hampshire": "nh",
  "new jersey": "nj",
  "new mexico": "nm",
  "new york": "ny",
  "north carolina": "nc",
  "north dakota": "nd",
  ohio: "oh",
  oklahoma: "ok",
  oregon: "or",
  pennsylvania: "pa",
  "rhode island": "ri",
  "south carolina": "sc",
  "south dakota": "sd",
  tennessee: "tn",
  texas: "tx",
  utah: "ut",
  vermont: "vt",
  virginia: "va",
  washington: "wa",
  "west virginia": "wv",
  wisconsin: "wi",
  wyoming: "wy",
  "district of columbia": "dc",
  dc: "dc",
};

function cleanString(value) {
  return String(value || "").trim();
}

function cleanLimit(value) {
  const n = Math.round(Number(value || DEFAULT_LIMIT));

  if (!Number.isFinite(n)) return DEFAULT_LIMIT;
  if (n < 1) return 1;
  if (n > MAX_LIMIT) return MAX_LIMIT;

  return n;
}

function cleanNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function cleanDisplayValue(value) {
  if (value === undefined || value === null) return "";
  if (typeof value === "object") return "";
  return String(value).trim();
}

function firstValue(feature, keys) {
  const props = feature?.properties || {};
  const fields = props.fields || {};
  const enhancedOwner =
    Array.isArray(props.enhanced_ownership) && props.enhanced_ownership.length > 0
      ? props.enhanced_ownership[0]
      : {};

  for (const key of keys) {
    const value = cleanDisplayValue(
      props[key] ?? fields[key] ?? enhancedOwner[key] ?? feature?.[key]
    );

    if (value) return value;
  }

  return "";
}

function encodeQuery(params = {}) {
  return Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join("&");
}

export function normalizeStateForRegridPath(stateValue) {
  const raw = cleanString(stateValue).toLowerCase();

  if (!raw) return "";

  const noPeriods = raw.replace(/\./g, "");
  const normalized = STATE_ABBREVIATIONS[noPeriods] || noPeriods;

  if (/^[a-z]{2}$/.test(normalized)) {
    return `/us/${normalized}`;
  }

  return "";
}

function normalizeCountyForRegridPath(countyValue) {
  const raw = cleanString(countyValue)
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\bcounty\b/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return raw;
}

function buildRegridOwnerSearchPath({ state, county }) {
  const statePath = normalizeStateForRegridPath(state);
  const countySlug = normalizeCountyForRegridPath(county);

  if (!statePath) return "";
  if (!countySlug) return statePath;

  return `${statePath}/${countySlug}`;
}

function getFeatureCoordinate(feature) {
  const props = feature?.properties || {};
  const fields = props.fields || {};

  const latitude =
    feature?.latitude ??
    feature?.lat ??
    props.latitude ??
    props.lat ??
    props.locationLatitude ??
    fields.latitude ??
    fields.lat ??
    fields.locationLatitude ??
    feature?.geometry?.coordinates?.[1];

  const longitude =
    feature?.longitude ??
    feature?.lng ??
    feature?.lon ??
    props.longitude ??
    props.lng ??
    props.lon ??
    props.locationLongitude ??
    fields.longitude ??
    fields.lng ??
    fields.lon ??
    fields.locationLongitude ??
    feature?.geometry?.coordinates?.[0];

  const latNum = cleanNumber(latitude);
  const lngNum = cleanNumber(longitude);

  if (latNum !== null && lngNum !== null) {
    return {
      latitude: latNum,
      longitude: lngNum,
    };
  }

  return null;
}

function collectGeometryPoints(geometry) {
  if (!geometry?.coordinates) return [];

  const points = [];

  function collectPoints(coords) {
    if (!Array.isArray(coords)) return;

    if (
      coords.length >= 2 &&
      typeof coords[0] === "number" &&
      typeof coords[1] === "number"
    ) {
      points.push({
        longitude: coords[0],
        latitude: coords[1],
      });
      return;
    }

    coords.forEach(collectPoints);
  }

  collectPoints(geometry.coordinates);

  return points.filter(
    (point) =>
      Number.isFinite(point.latitude) &&
      Number.isFinite(point.longitude)
  );
}

function getGeometryCenter(geometry) {
  const validPoints = collectGeometryPoints(geometry);

  if (!validPoints.length) return null;

  const total = validPoints.reduce(
    (sum, point) => ({
      latitude: sum.latitude + point.latitude,
      longitude: sum.longitude + point.longitude,
    }),
    { latitude: 0, longitude: 0 }
  );

  return {
    latitude: total.latitude / validPoints.length,
    longitude: total.longitude / validPoints.length,
  };
}

function getGeometryBounds(geometry) {
  const validPoints = collectGeometryPoints(geometry);

  if (!validPoints.length) return null;

  const latitudes = validPoints.map((point) => point.latitude);
  const longitudes = validPoints.map((point) => point.longitude);

  const minLatitude = Math.min(...latitudes);
  const maxLatitude = Math.max(...latitudes);
  const minLongitude = Math.min(...longitudes);
  const maxLongitude = Math.max(...longitudes);

  return {
    minLatitude,
    maxLatitude,
    minLongitude,
    maxLongitude,
    latitude: (minLatitude + maxLatitude) / 2,
    longitude: (minLongitude + maxLongitude) / 2,
    latitudeDelta: Math.max((maxLatitude - minLatitude) * 2.2, 0.006),
    longitudeDelta: Math.max((maxLongitude - minLongitude) * 2.2, 0.006),
  };
}

function getParcelOwner(feature) {
  return (
    firstValue(feature, [
      "owner",
      "owner_name",
      "ownername",
      "ownname",
      "mailname",
      "ll_owner",
      "ll_owner1",
      "ll_owner2",
    ]) || "Owner not listed"
  );
}

function getParcelAddress(feature) {
  const props = feature?.properties || {};

  return (
    cleanDisplayValue(props.headline) ||
    firstValue(feature, [
      "address",
      "situs_address",
      "situs_full_address",
      "saddr",
      "full_address",
      "location_address",
      "mailadd",
      "mail_address",
    ]) ||
    "Address not listed"
  );
}

function getParcelNumber(feature) {
  return (
    firstValue(feature, [
      "parcelnumb",
      "parcel_number",
      "apn",
      "pin",
      "parcel_id",
      "ll_uuid",
    ]) || "Parcel number not listed"
  );
}

function getParcelAcres(feature) {
  return firstValue(feature, [
    "ll_gisacre",
    "gisacre",
    "acres",
    "acreage",
    "shape_area",
  ]);
}

function getParcelCounty(feature) {
  return firstValue(feature, [
    "county",
    "county_name",
    "cntyname",
    "admin2",
  ]);
}

function getParcelCity(feature) {
  return firstValue(feature, [
    "city",
    "municipality",
    "situs_city",
    "mail_city",
    "scity",
  ]);
}

function getParcelState(feature) {
  return firstValue(feature, [
    "state",
    "state2",
    "situs_state",
    "mail_state",
    "szip_state",
  ]);
}

function getParcelZip(feature) {
  return firstValue(feature, [
    "zip",
    "zipcode",
    "situs_zip",
    "mail_zip",
    "szip",
  ]);
}

function getParcelPath(feature) {
  return firstValue(feature, [
    "path",
    "ll_path",
    "source_path",
  ]);
}

function buildDetailRows(feature) {
  const owner = getParcelOwner(feature);
  const address = getParcelAddress(feature);
  const parcelNumber = getParcelNumber(feature);
  const acres = getParcelAcres(feature);
  const county = getParcelCounty(feature);
  const city = getParcelCity(feature);
  const state = getParcelState(feature);
  const zip = getParcelZip(feature);
  const path = getParcelPath(feature);

  return [
    { label: "Owner", value: owner },
    { label: "Address", value: address },
    { label: "Parcel #", value: parcelNumber },
    acres ? { label: "Acres", value: acres } : null,
    county ? { label: "County", value: county } : null,
    city ? { label: "City", value: city } : null,
    state ? { label: "State", value: state } : null,
    zip ? { label: "ZIP", value: zip } : null,
    path ? { label: "Regrid Path", value: path } : null,
  ].filter(Boolean);
}

function normalizeFeature(feature, index) {
  const geometryCenter = getGeometryCenter(feature?.geometry);
  const fallbackCoordinate = getFeatureCoordinate(feature);
  const center = geometryCenter || fallbackCoordinate || null;
  const bounds = getGeometryBounds(feature?.geometry);

  const owner = getParcelOwner(feature);
  const address = getParcelAddress(feature);
  const parcelNumber = getParcelNumber(feature);
  const acres = getParcelAcres(feature);
  const county = getParcelCounty(feature);
  const path = getParcelPath(feature);

  return {
    ...feature,
    id:
      feature?.id ||
      feature?.properties?.id ||
      feature?.properties?.parcelnumb ||
      feature?.properties?.parcel_number ||
      feature?.properties?.apn ||
      `regrid-result-${index}`,
    properties: {
      ...(feature?.properties || {}),
      ducksmartOwner: owner,
      ducksmartAddress: address,
      ducksmartParcelNumber: parcelNumber,
      ducksmartAcres: acres || null,
      ducksmartCounty: county || null,
      ducksmartPath: path || null,
      ducksmartCenter: center,
      ducksmartBounds: bounds,
      ducksmartDetails: buildDetailRows(feature),
      ducksmartResultTitle: owner,
      ducksmartResultSubtitle: address,
    },
  };
}

function normalizeRegridResponse(data, limit = DEFAULT_LIMIT) {
  const rawFeatures =
    data?.parcels?.features ||
    data?.features ||
    data?.results?.features ||
    [];

  const features = Array.isArray(rawFeatures)
    ? rawFeatures.map(normalizeFeature).slice(0, cleanLimit(limit))
    : [];

  return {
    type: "FeatureCollection",
    features,
  };
}

export function getPropertySearchCenter(featureCollection) {
  const features = Array.isArray(featureCollection?.features)
    ? featureCollection.features
    : [];

  const centers = features
    .map((feature) => feature?.properties?.ducksmartCenter || getGeometryCenter(feature?.geometry))
    .filter(
      (center) =>
        center &&
        Number.isFinite(center.latitude) &&
        Number.isFinite(center.longitude)
    );

  if (!centers.length) return null;

  const total = centers.reduce(
    (sum, center) => ({
      latitude: sum.latitude + center.latitude,
      longitude: sum.longitude + center.longitude,
    }),
    { latitude: 0, longitude: 0 }
  );

  return {
    latitude: total.latitude / centers.length,
    longitude: total.longitude / centers.length,
  };
}

export function getPropertyFeatureRegion(feature) {
  const bounds = feature?.properties?.ducksmartBounds;
  const center = feature?.properties?.ducksmartCenter;

  if (
    bounds &&
    Number.isFinite(Number(bounds.latitude)) &&
    Number.isFinite(Number(bounds.longitude))
  ) {
    return {
      latitude: Number(bounds.latitude),
      longitude: Number(bounds.longitude),
      latitudeDelta: Number(bounds.latitudeDelta) || 0.012,
      longitudeDelta: Number(bounds.longitudeDelta) || 0.012,
    };
  }

  if (
    center &&
    Number.isFinite(Number(center.latitude)) &&
    Number.isFinite(Number(center.longitude))
  ) {
    return {
      latitude: Number(center.latitude),
      longitude: Number(center.longitude),
      latitudeDelta: 0.018,
      longitudeDelta: 0.018,
    };
  }

  return null;
}

export async function searchParcelsByOwner({
  owner,
  state,
  county,
  limit = DEFAULT_LIMIT,
} = {}) {
  const cleanOwner = cleanString(owner);
  const path = buildRegridOwnerSearchPath({ state, county });
  const safeLimit = cleanLimit(limit);

  if (!REGRID_OWNER_SEARCH_URL) {
    throw new Error("Property search is not configured for this build.");
  }

  if (cleanOwner.length < 4) {
    throw new Error("Enter at least 4 characters of the owner or business name.");
  }

  if (!path) {
    throw new Error("Select a valid state before searching property owners.");
  }

  const query = encodeQuery({
    owner: cleanOwner,
    query: cleanOwner,
    path,
    limit: safeLimit,
    return_geometry: true,
    return_custom: true,
    return_field_labels: false,
    return_stacked: true,
    return_zoning: false,
    return_matched_buildings: false,
    return_matched_addresses: false,
    return_enhanced_ownership: false,
  });

  const response = await fetch(`${REGRID_OWNER_SEARCH_URL}?${query}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      data?.message ||
      data?.error ||
      data?.detail ||
      `Property owner search failed with status ${response.status}.`;

    throw new Error(message);
  }

  const featureCollection = normalizeRegridResponse(data, safeLimit);
  const center = getPropertySearchCenter(featureCollection);

return {
  owner: cleanOwner,
  statePath: path,
  county: cleanString(county),
  limit: safeLimit,
  count: featureCollection.features.length,
  featureCollection,
  center,
  raw: data,
};
}