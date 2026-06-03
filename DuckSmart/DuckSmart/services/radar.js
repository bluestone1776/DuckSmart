// /Users/gozyr/Development/ducksmart/DuckSmart/DuckSmart/services/radar.js
// DuckSmart — RainViewer Radar Service

const RAINVIEWER_API = "https://api.rainviewer.com/public/weather-maps.json";

// Cache to avoid re-fetching on every render
let cachedTileUrl = null;
let cachedTimestamp = null;
let cachedFrames = null;
let cachedAt = 0;
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

function buildTileUrl(host, path) {
  return `${host}${path}/256/{z}/{x}/{y}/6/1_1.png`;
}

/**
 * Fetch the latest radar tile URL template from RainViewer.
 *
 * @returns {Promise<{ tileUrl: string, timestamp: number } | null>}
 */
export async function getRadarTileUrl() {
  const result = await fetchRadarFrames();
  if (!result) return null;
  return {
    tileUrl: result.tileUrl,
    timestamp: result.timestamp,
  };
}

/**
 * Fetch all past radar frames from RainViewer for animated loop.
 *
 * @returns {Promise<{ tileUrl: string, timestamp: number, frames: { tileUrl: string, timestamp: number }[] } | null>}
 */
export async function fetchRadarFrames() {
  if (cachedTileUrl && Date.now() - cachedAt < CACHE_TTL) {
    return {
      tileUrl: cachedTileUrl,
      timestamp: cachedTimestamp,
      frames: cachedFrames,
    };
  }

  try {
    console.log("DuckSmart radar fetch starting");

    const res = await fetch(RAINVIEWER_API);
    console.log("DuckSmart radar response status", res.status);

    if (!res.ok) throw new Error(`RainViewer API: ${res.status}`);

    const data = await res.json();
    const host = data?.host || "https://tilecache.rainviewer.com";
    const pastFrames = data?.radar?.past;

    console.log("DuckSmart radar host", host);
    console.log("DuckSmart radar past frame count", pastFrames?.length || 0);

    if (!pastFrames || pastFrames.length === 0) {
      console.warn("DuckSmart: No radar frames available from RainViewer.");
      return null;
    }

    const latestFrame = pastFrames[pastFrames.length - 1];
    const tileUrl = buildTileUrl(host, latestFrame.path);

    console.log("DuckSmart radar latest frame", latestFrame);
    console.log("DuckSmart radar tileUrl", tileUrl);

    const frames = pastFrames.map((frame) => ({
      tileUrl: buildTileUrl(host, frame.path),
      timestamp: frame.time,
    }));

    cachedTileUrl = tileUrl;
    cachedTimestamp = latestFrame.time;
    cachedFrames = frames;
    cachedAt = Date.now();

    return {
      tileUrl,
      timestamp: latestFrame.time,
      frames,
    };
  } catch (err) {
    console.error("DuckSmart radar fetch error:", err.message);
    return null;
  }
}

export function formatRadarAge(unixSeconds) {
  if (!unixSeconds) return "";
  const ageMs = Date.now() - unixSeconds * 1000;
  const ageMin = Math.round(ageMs / 60000);

  if (ageMin < 1) return "Just now";
  if (ageMin === 1) return "1 min ago";
  if (ageMin < 60) return `${ageMin} min ago`;
  return "Over 1 hr ago";
}