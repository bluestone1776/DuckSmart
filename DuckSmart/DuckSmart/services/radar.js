// DuckSmart — RainViewer Radar Service
//
// Fetches the latest real-time weather radar tile URL from RainViewer's free API.
// RainViewer provides actual radar imagery (updated ~every 10 minutes),
// unlike OpenWeatherMap's precipitation_new which is a static estimate.
//
// No API key required — completely free.

const RAINVIEWER_API = "https://api.rainviewer.com/public/weather-maps.json";

// Cache to avoid re-fetching on every render
let cachedTileUrl = null;
let cachedTimestamp = null;
let cachedFrames = null;
let cachedAt = 0;
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

/**
 * Build a tile URL from a RainViewer frame path.
 * Color scheme 6 = "universal blue" (good contrast on dark map backgrounds)
 * Smooth = 1 (anti-aliased edges), Snow = 1 (snow shown in separate color)
 */
function buildTileUrl(path) {
  return `https://tilecache.rainviewer.com${path}/256/{z}/{x}/{y}/6/1_1.png`;
}

/**
 * Fetch the latest radar tile URL template from RainViewer.
 *
 * Returns a URL string like:
 *   https://tilecache.rainviewer.com/v2/radar/1234567890/256/{z}/{x}/{y}/6/1_1.png
 *
 * Compatible with react-native-maps UrlTile component.
 *
 * @returns {Promise<{ tileUrl: string, timestamp: number } | null>}
 */
export async function getRadarTileUrl() {
  const result = await fetchRadarFrames();
  if (!result) return null;
  return { tileUrl: result.tileUrl, timestamp: result.timestamp };
}

/**
 * Fetch all past radar frames from RainViewer for animated loop.
 *
 * @returns {Promise<{ tileUrl: string, timestamp: number, frames: { tileUrl: string, timestamp: number }[] } | null>}
 */
export async function fetchRadarFrames() {
  // Return cached result if still fresh
  if (cachedTileUrl && Date.now() - cachedAt < CACHE_TTL) {
    return { tileUrl: cachedTileUrl, timestamp: cachedTimestamp, frames: cachedFrames };
  }

  try {
    const res = await fetch(RAINVIEWER_API);
    if (!res.ok) throw new Error(`RainViewer API: ${res.status}`);

    const data = await res.json();

    // data.radar.past is an array of { time, path } sorted chronologically
    // The last entry is the most recent radar frame
    const pastFrames = data?.radar?.past;
    if (!pastFrames || pastFrames.length === 0) {
      console.warn("DuckSmart: No radar frames available from RainViewer.");
      return null;
    }

    const latestFrame = pastFrames[pastFrames.length - 1];
    const tileUrl = buildTileUrl(latestFrame.path);

    // Build all frames for animation loop
    const frames = pastFrames.map((frame) => ({
      tileUrl: buildTileUrl(frame.path),
      timestamp: frame.time,
    }));

    // Cache the result
    cachedTileUrl = tileUrl;
    cachedTimestamp = latestFrame.time;
    cachedFrames = frames;
    cachedAt = Date.now();

    return { tileUrl, timestamp: latestFrame.time, frames };
  } catch (err) {
    console.error("DuckSmart radar fetch error:", err.message);
    return null;
  }
}

/**
 * Format a unix timestamp into a human-readable "Updated X min ago" string.
 * @param {number} unixSeconds
 * @returns {string}
 */
export function formatRadarAge(unixSeconds) {
  if (!unixSeconds) return "";
  const ageMs = Date.now() - unixSeconds * 1000;
  const ageMin = Math.round(ageMs / 60000);
  if (ageMin < 1) return "Just now";
  if (ageMin === 1) return "1 min ago";
  if (ageMin < 60) return `${ageMin} min ago`;
  return "Over 1 hr ago";
}
