// DuckSmart — Water Levels Service
//
// Free/no-key water-level helper.
// Sources:
// - USGS Water Services: rivers, creeks, lakes, reservoirs, stream gauges
// - NOAA CO-OPS: coastal/tide water-level stations
//
// Main function:
//   fetchWaterLevelsForRegion(region)
//
// Returns marker-ready rows:
// {
//   id,
//   source,
//   kind,
//   stationId,
//   title,
//   coordinate,
//   latitude,
//   longitude,
//   primaryLabel,
//   secondaryLabel,
//   trend,
//   updatedAt,
//   updatedAtMillis,
//   detailLines,
// }

const USGS_IV_URL = "https://waterservices.usgs.gov/nwis/iv/";
const NOAA_STATIONS_URL =
  "https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json";
const NOAA_DATA_URL =
  "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter";

const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_MAX_USGS_SITES = 24;
const DEFAULT_MAX_NOAA_STATIONS = 12;
const DEFAULT_REGION_PADDING = 0.18;
const DEFAULT_MAX_DELTA = 2.5;

const NOAA_STATION_CACHE_TTL_MS = 1000 * 60 * 60 * 6;

const USGS_PARAMETER_CODES = {
  DISCHARGE_CFS: "00060",
  GAGE_HEIGHT_FT: "00065",
  LAKE_RESERVOIR_ELEVATION_FT: "00062",
};

let noaaStationCache = {
  loadedAt: 0,
  stations: [],
};

function cleanString(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function cleanNumber(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  const number = cleanNumber(value, min);
  return Math.max(min, Math.min(max, number));
}

function round(value, digits = 2) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;

  const factor = Math.pow(10, digits);
  return Math.round(number * factor) / factor;
}

function toRad(value) {
  return (Number(value) * Math.PI) / 180;
}

function getDistanceMiles(a, b) {
  if (!a || !b) return null;

  const lat1 = cleanNumber(a.latitude);
  const lon1 = cleanNumber(a.longitude);
  const lat2 = cleanNumber(b.latitude);
  const lon2 = cleanNumber(b.longitude);

  if (
    lat1 === null ||
    lon1 === null ||
    lat2 === null ||
    lon2 === null
  ) {
    return null;
  }

  const earthRadiusMiles = 3958.8;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const rLat1 = toRad(lat1);
  const rLat2 = toRad(lat2);

  const hav =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(rLat1) *
      Math.cos(rLat2) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(hav), Math.sqrt(1 - hav));

  return earthRadiusMiles * c;
}

function getRegionCenter(region = {}) {
  const latitude = cleanNumber(region.latitude);
  const longitude = cleanNumber(region.longitude);

  if (latitude === null || longitude === null) {
    return null;
  }

  return { latitude, longitude };
}

function getRegionBox(region = {}, options = {}) {
  const center = getRegionCenter(region);

  if (!center) {
    throw new Error("Missing map region for water levels.");
  }

  const maxDelta = cleanNumber(options.maxDelta, DEFAULT_MAX_DELTA);
  const padding = cleanNumber(options.padding, DEFAULT_REGION_PADDING);

  const latitudeDelta = clamp(
    cleanNumber(region.latitudeDelta, 0.25),
    0.02,
    maxDelta
  );

  const longitudeDelta = clamp(
    cleanNumber(region.longitudeDelta, 0.25),
    0.02,
    maxDelta
  );

  const paddedLatDelta = latitudeDelta * (1 + padding);
  const paddedLngDelta = longitudeDelta * (1 + padding);

  const south = clamp(center.latitude - paddedLatDelta / 2, -89.9, 89.9);
  const north = clamp(center.latitude + paddedLatDelta / 2, -89.9, 89.9);
  const west = clamp(center.longitude - paddedLngDelta / 2, -179.9, 179.9);
  const east = clamp(center.longitude + paddedLngDelta / 2, -179.9, 179.9);

  return {
    center,
    south,
    north,
    west,
    east,
    bbox: `${west.toFixed(6)},${south.toFixed(6)},${east.toFixed(6)},${north.toFixed(6)}`,
  };
}

function isInsideBox(coordinate, box) {
  const latitude = cleanNumber(coordinate?.latitude);
  const longitude = cleanNumber(coordinate?.longitude);

  if (latitude === null || longitude === null || !box) return false;

  return (
    latitude >= box.south &&
    latitude <= box.north &&
    longitude >= box.west &&
    longitude <= box.east
  );
}

function getLatestValue(values = []) {
  const rows = Array.isArray(values) ? values : [];

  const cleanRows = rows
    .map((item) => ({
      value: cleanNumber(item?.value),
      dateTime: cleanString(item?.dateTime),
      qualifiers: item?.qualifiers || [],
    }))
    .filter((item) => item.value !== null && item.dateTime)
    .sort((a, b) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime());

  return cleanRows[0] || null;
}

function getOldestValue(values = []) {
  const rows = Array.isArray(values) ? values : [];

  const cleanRows = rows
    .map((item) => ({
      value: cleanNumber(item?.value),
      dateTime: cleanString(item?.dateTime),
      qualifiers: item?.qualifiers || [],
    }))
    .filter((item) => item.value !== null && item.dateTime)
    .sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime());

  return cleanRows[0] || null;
}

function getTrend(latestValue, oldestValue, threshold = 0.05) {
  const latest = cleanNumber(latestValue);
  const oldest = cleanNumber(oldestValue);

  if (latest === null || oldest === null) {
    return {
      trend: "unknown",
      trendDelta: null,
      trendLabel: "Trend unavailable",
    };
  }

  const delta = latest - oldest;

  if (Math.abs(delta) < threshold) {
    return {
      trend: "steady",
      trendDelta: round(delta, 2),
      trendLabel: "Steady",
    };
  }

  if (delta > 0) {
    return {
      trend: "rising",
      trendDelta: round(delta, 2),
      trendLabel: `Rising ${Math.abs(delta).toFixed(2)} ft`,
    };
  }

  return {
    trend: "falling",
    trendDelta: round(delta, 2),
    trendLabel: `Falling ${Math.abs(delta).toFixed(2)} ft`,
  };
}

function formatDateTime(value) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return cleanString(value);

  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function makeUrl(baseUrl, params = {}) {
  const query = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => {
      return `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`;
    })
    .join("&");

  return `${baseUrl}?${query}`;
}

async function fetchJson(url, options = {}) {
  const timeoutMs = cleanNumber(options.timeoutMs, DEFAULT_TIMEOUT_MS);

  let controller = null;
  let timer = null;

  if (typeof AbortController !== "undefined") {
    controller = new AbortController();

    timer = setTimeout(() => {
      try {
        controller.abort();
      } catch {
        // Ignore abort errors.
      }
    }, timeoutMs);
  }

  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller?.signal,
      headers: {
        Accept: "application/json",
      },
    });

    const text = await response.text();

    let data = null;

    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }

    if (!response.ok) {
      const message =
        data?.error?.message ||
        data?.message ||
        data?.error ||
        `HTTP ${response.status}`;

      throw new Error(message);
    }

    return data;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function normalizeUsgsTimeSeriesItem(item = {}) {
  const siteInfo = item?.sourceInfo || {};
  const variable = item?.variable || {};
  const values = Array.isArray(item?.values?.[0]?.value)
    ? item.values[0].value
    : [];

  const siteCode = cleanString(siteInfo?.siteCode?.[0]?.value);
  const siteName = cleanString(siteInfo?.siteName, "USGS Water Gauge");

  const geogLocation = siteInfo?.geoLocation?.geogLocation || {};
  const latitude = cleanNumber(geogLocation?.latitude);
  const longitude = cleanNumber(geogLocation?.longitude);

  const variableCode = cleanString(variable?.variableCode?.[0]?.value);
  const variableName = cleanString(variable?.variableName);
  const unit = cleanString(variable?.unit?.unitCode);

  const latest = getLatestValue(values);
  const oldest = getOldestValue(values);

  if (!siteCode || latitude === null || longitude === null || !variableCode || !latest) {
    return null;
  }

  return {
    siteCode,
    siteName,
    coordinate: { latitude, longitude },
    variableCode,
    variableName,
    unit,
    latest,
    oldest,
  };
}

function mergeUsgsSiteRows(rows = [], regionCenter = null) {
  const grouped = new Map();

  rows.filter(Boolean).forEach((row) => {
    const existing = grouped.get(row.siteCode) || {
      id: `usgs-${row.siteCode}`,
      source: "USGS",
      kind: "freshwater",
      type: "freshwater_gauge",
      stationId: row.siteCode,
      title: row.siteName,
      coordinate: row.coordinate,
      latitude: row.coordinate.latitude,
      longitude: row.coordinate.longitude,
      parameters: {},
      updatedAt: "",
      updatedAtMillis: 0,
    };

    existing.parameters[row.variableCode] = {
      code: row.variableCode,
      name: row.variableName,
      unit: row.unit,
      value: row.latest.value,
      dateTime: row.latest.dateTime,
      oldestValue: row.oldest?.value ?? null,
      oldestDateTime: row.oldest?.dateTime || "",
    };

    const latestMillis = new Date(row.latest.dateTime).getTime();

    if (Number.isFinite(latestMillis) && latestMillis > existing.updatedAtMillis) {
      existing.updatedAt = row.latest.dateTime;
      existing.updatedAtMillis = latestMillis;
    }

    grouped.set(row.siteCode, existing);
  });

  return Array.from(grouped.values())
    .map((site) => {
      const gage = site.parameters[USGS_PARAMETER_CODES.GAGE_HEIGHT_FT];
      const flow = site.parameters[USGS_PARAMETER_CODES.DISCHARGE_CFS];
      const elevation = site.parameters[USGS_PARAMETER_CODES.LAKE_RESERVOIR_ELEVATION_FT];

      const mainLevel = elevation || gage || null;
      const trendInfo = mainLevel
        ? getTrend(mainLevel.value, mainLevel.oldestValue)
        : {
            trend: "unknown",
            trendDelta: null,
            trendLabel: "Trend unavailable",
          };

      const distanceMiles = regionCenter
        ? getDistanceMiles(regionCenter, site.coordinate)
        : null;

      const levelLabel = elevation
        ? `Lake level ${Number(elevation.value).toFixed(2)} ft`
        : gage
          ? `Gage height ${Number(gage.value).toFixed(2)} ft`
          : "Water level unavailable";

      const flowLabel = flow
        ? `Flow ${Math.round(Number(flow.value)).toLocaleString()} cfs`
        : "";

      const secondaryParts = [
        trendInfo.trendLabel,
        flowLabel,
        formatDateTime(site.updatedAt),
      ].filter(Boolean);

      return {
        ...site,
        type: elevation ? "lake_level" : "river_gauge",
        distanceMiles: round(distanceMiles, 2),
        levelFt: mainLevel ? round(mainLevel.value, 2) : null,
        gageHeightFt: gage ? round(gage.value, 2) : null,
        elevationFt: elevation ? round(elevation.value, 2) : null,
        flowCfs: flow ? Math.round(Number(flow.value)) : null,
        trend: trendInfo.trend,
        trendDeltaFt: trendInfo.trendDelta,
        primaryLabel: levelLabel,
        secondaryLabel: secondaryParts.join(" • "),
        detailLines: [
          "Freshwater Gauge",
          levelLabel,
          flowLabel,
          trendInfo.trendLabel,
          site.updatedAt ? `Updated ${formatDateTime(site.updatedAt)}` : "",
          site.stationId ? `USGS ${site.stationId}` : "",
        ].filter(Boolean),
      };
    })
    .sort((a, b) => {
      const aDistance = Number.isFinite(a.distanceMiles) ? a.distanceMiles : 999999;
      const bDistance = Number.isFinite(b.distanceMiles) ? b.distanceMiles : 999999;
      return aDistance - bDistance;
    });
}

export async function fetchFreshwaterWaterLevels(region, options = {}) {
  const box = getRegionBox(region, options);
  const maxSites = cleanNumber(options.maxSites, DEFAULT_MAX_USGS_SITES);

  const url = makeUrl(USGS_IV_URL, {
    format: "json",
    bBox: box.bbox,
    parameterCd: [
      USGS_PARAMETER_CODES.GAGE_HEIGHT_FT,
      USGS_PARAMETER_CODES.DISCHARGE_CFS,
      USGS_PARAMETER_CODES.LAKE_RESERVOIR_ELEVATION_FT,
    ].join(","),
    siteStatus: "active",
    period: options.period || "PT12H",
  });

  const data = await fetchJson(url, {
    timeoutMs: options.timeoutMs,
  });

  const timeSeries = Array.isArray(data?.value?.timeSeries)
    ? data.value.timeSeries
    : [];

  const normalizedRows = timeSeries.map(normalizeUsgsTimeSeriesItem).filter(Boolean);

  return mergeUsgsSiteRows(normalizedRows, box.center).slice(0, maxSites);
}

function normalizeNoaaStation(station = {}) {
  const id = cleanString(
    station.id ||
      station.stationId ||
      station.station_id ||
      station.station ||
      station.station_id
  );

  const name = cleanString(
    station.name ||
      station.stationName ||
      station.station_name ||
      station.longname ||
      "NOAA Tide Station"
  );

  const latitude = cleanNumber(
    station.lat ??
      station.latitude ??
      station.location?.lat ??
      station.location?.latitude
  );

  const longitude = cleanNumber(
    station.lng ??
      station.lon ??
      station.long ??
      station.longitude ??
      station.location?.lng ??
      station.location?.lon ??
      station.location?.longitude
  );

  if (!id || latitude === null || longitude === null) return null;

  return {
    id,
    name,
    coordinate: {
      latitude,
      longitude,
    },
    state: cleanString(station.state),
    timezone: cleanString(station.timezone),
    raw: station,
  };
}

async function loadNoaaWaterLevelStations(options = {}) {
  const force = !!options.force;
  const now = Date.now();

  if (
    !force &&
    noaaStationCache.stations.length > 0 &&
    now - noaaStationCache.loadedAt < NOAA_STATION_CACHE_TTL_MS
  ) {
    return noaaStationCache.stations;
  }

  const url = makeUrl(NOAA_STATIONS_URL, {
    type: "waterlevels",
    units: "english",
  });

  const data = await fetchJson(url, {
    timeoutMs: options.timeoutMs,
  });

  const rawStations = Array.isArray(data?.stations)
    ? data.stations
    : Array.isArray(data?.data)
      ? data.data
      : [];

  const stations = rawStations.map(normalizeNoaaStation).filter(Boolean);

  noaaStationCache = {
    loadedAt: now,
    stations,
  };

  return stations;
}

async function fetchNoaaLatestWaterLevel(station, options = {}) {
  const url = makeUrl(NOAA_DATA_URL, {
    date: "latest",
    station: station.id,
    product: "water_level",
    datum: options.datum || "MLLW",
    time_zone: options.timeZone || "lst_ldt",
    units: options.units || "english",
    format: "json",
    application: "DuckSmart",
  });

  const data = await fetchJson(url, {
    timeoutMs: options.timeoutMs,
  });

  const latest = Array.isArray(data?.data) ? data.data[0] : null;
  const value = cleanNumber(latest?.v);

  if (!latest || value === null) {
    return null;
  }

  const observedAt = cleanString(latest?.t);
  const updatedAtMillis = observedAt ? new Date(observedAt).getTime() : Date.now();

  return {
    id: `noaa-${station.id}`,
    source: "NOAA",
    kind: "tide",
    type: "tide_station",
    stationId: station.id,
    title: station.name,
    coordinate: station.coordinate,
    latitude: station.coordinate.latitude,
    longitude: station.coordinate.longitude,
    state: station.state,
    timezone: station.timezone,
    waterLevelFt: round(value, 2),
    trend: "unknown",
    trendDeltaFt: null,
    updatedAt: observedAt,
    updatedAtMillis: Number.isFinite(updatedAtMillis) ? updatedAtMillis : Date.now(),
    primaryLabel: `Water level ${Number(value).toFixed(2)} ft`,
    secondaryLabel: [
      "NOAA tide station",
      `Datum ${options.datum || "MLLW"}`,
      observedAt ? formatDateTime(observedAt) : "",
    ]
      .filter(Boolean)
      .join(" • "),
    detailLines: [
      "Coastal / Tide Station",
      `Water level ${Number(value).toFixed(2)} ft`,
      `Datum ${options.datum || "MLLW"}`,
      observedAt ? `Updated ${formatDateTime(observedAt)}` : "",
      station.id ? `NOAA ${station.id}` : "",
    ].filter(Boolean),
    raw: data,
  };
}

export async function fetchTideWaterLevels(region, options = {}) {
  const box = getRegionBox(region, options);
  const maxStations = cleanNumber(options.maxStations, DEFAULT_MAX_NOAA_STATIONS);

  const stations = await loadNoaaWaterLevelStations(options);

  const nearbyStations = stations
    .filter((station) => isInsideBox(station.coordinate, box))
    .map((station) => ({
      ...station,
      distanceMiles: getDistanceMiles(box.center, station.coordinate),
    }))
    .sort((a, b) => {
      const aDistance = Number.isFinite(a.distanceMiles) ? a.distanceMiles : 999999;
      const bDistance = Number.isFinite(b.distanceMiles) ? b.distanceMiles : 999999;
      return aDistance - bDistance;
    })
    .slice(0, maxStations);

  const rows = await Promise.all(
    nearbyStations.map(async (station) => {
      try {
        const latest = await fetchNoaaLatestWaterLevel(station, options);

        if (!latest) return null;

        return {
          ...latest,
          distanceMiles: round(station.distanceMiles, 2),
        };
      } catch {
        return null;
      }
    })
  );

  return rows.filter(Boolean);
}

export async function fetchWaterLevelsForRegion(region, options = {}) {
  const includeFreshwater = options.includeFreshwater !== false;
  const includeTides = options.includeTides !== false;

  const startedAt = Date.now();

  const result = {
    stations: [],
    freshwater: [],
    tides: [],
    errors: [],
    fetchedAt: new Date().toISOString(),
    fetchedAtMillis: startedAt,
  };

  const jobs = [];

  if (includeFreshwater) {
    jobs.push(
      fetchFreshwaterWaterLevels(region, options)
        .then((rows) => {
          result.freshwater = rows;
        })
        .catch((err) => {
          result.errors.push({
            source: "USGS",
            message: err?.message || "Could not load freshwater gauges.",
          });
        })
    );
  }

  if (includeTides) {
    jobs.push(
      fetchTideWaterLevels(region, options)
        .then((rows) => {
          result.tides = rows;
        })
        .catch((err) => {
          result.errors.push({
            source: "NOAA",
            message: err?.message || "Could not load tide stations.",
          });
        })
    );
  }

  await Promise.all(jobs);

  result.stations = [...result.freshwater, ...result.tides].sort((a, b) => {
    const aDistance = Number.isFinite(a.distanceMiles) ? a.distanceMiles : 999999;
    const bDistance = Number.isFinite(b.distanceMiles) ? b.distanceMiles : 999999;

    if (aDistance !== bDistance) return aDistance - bDistance;

    return String(a.title || "").localeCompare(String(b.title || ""));
  });

  return result;
}

export function getWaterLevelMarkerColor(item = {}) {
  if (item.kind === "tide") return "#4DA3FF";
  if (item.type === "lake_level") return "#39FF14";
  if (item.trend === "rising") return "#39FF14";
  if (item.trend === "falling") return "#D9A84C";
  return "#89CFF0";
}

export function getWaterLevelMarkerIcon(item = {}) {
  if (item.kind === "tide") return "🌊";
  if (item.type === "lake_level") return "🏞️";
  return "💧";
}

export function getWaterLevelSummaryText(item = {}) {
  const title = cleanString(item.title, "Water Level");
  const primary = cleanString(item.primaryLabel);
  const secondary = cleanString(item.secondaryLabel);

  return [title, primary, secondary].filter(Boolean).join("\n");
}

export function formatWaterLevelCallout(item = {}) {
  const lines = Array.isArray(item.detailLines) && item.detailLines.length > 0
    ? item.detailLines
    : [
        item.primaryLabel,
        item.secondaryLabel,
        item.stationId ? `Station ${item.stationId}` : "",
      ].filter(Boolean);

  return lines.join("\n");
}

export function clearNoaaStationCache() {
  noaaStationCache = {
    loadedAt: 0,
    stations: [],
  };
}

export default {
  fetchWaterLevelsForRegion,
  fetchFreshwaterWaterLevels,
  fetchTideWaterLevels,
  getWaterLevelMarkerColor,
  getWaterLevelMarkerIcon,
  getWaterLevelSummaryText,
  formatWaterLevelCallout,
  clearNoaaStationCache,
};