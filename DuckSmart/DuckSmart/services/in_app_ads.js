// /Users/gozyr/Development/ducksmart/DuckSmart/DuckSmart/services/in_app_ads.js

import { Platform } from "react-native";
import { ref, getDownloadURL } from "firebase/storage";

import { storage } from "./firebase";
import { logEvent } from "./analytics";

const ADS_JSON_PATH = "in_app_ads/ads.json";
const CACHE_MS = 5 * 60 * 1000;

let cachedAds = null;
let cachedAt = 0;

function normalizeAdId(id) {
  const clean = String(id || "").replace("#", "").trim();
  return clean || null;
}

function normalizeAd(raw) {
  if (!raw) return null;

  const id = normalizeAdId(raw.id || raw.adId || raw.trackingId);
  const companyName = String(raw.companyName || raw.company || "").trim();
  const linkUrl = String(raw.linkUrl || raw.hyperlink || raw.url || "").trim();
  const imagePath = String(raw.imagePath || "").trim();
  const imageGsUri = String(raw.imageGsUri || raw.gsUri || "").trim();
  const imageUrl = String(raw.imageUrl || raw.downloadUrl || "").trim();

  if (!id || !companyName || !linkUrl) return null;
  if (!imagePath && !imageGsUri && !imageUrl) return null;

  return {
    id,
    trackingId: `#${id}`,
    companyName,
    linkUrl,
    imagePath,
    imageGsUri,
    imageUrl,
    active: raw.active !== false,
    aspectRatio: Number(raw.aspectRatio || 4) || 4,
  };
}

async function getResolvedImageUrl(ad) {
  if (ad.imageUrl) return ad.imageUrl;

  const pathOrUri = ad.imagePath || ad.imageGsUri;
  const imageRef = ref(storage, pathOrUri);

  return await getDownloadURL(imageRef);
}

export async function getInAppAds({ forceRefresh = false } = {}) {
  const now = Date.now();

  if (!forceRefresh && cachedAds && now - cachedAt < CACHE_MS) {
    return cachedAds;
  }

  try {
    const jsonRef = ref(storage, ADS_JSON_PATH);
    const jsonUrl = await getDownloadURL(jsonRef);

    const res = await fetch(jsonUrl);

    if (!res.ok) {
      throw new Error(`Ads JSON failed with status ${res.status}`);
    }

    const json = await res.json();
    const rawAds = Array.isArray(json?.ads) ? json.ads : [];

    const activeAds = rawAds
      .map(normalizeAd)
      .filter((ad) => ad && ad.active);

    const ads = await Promise.all(
      activeAds.map(async (ad) => ({
        ...ad,
        imageUrl: await getResolvedImageUrl(ad),
      }))
    );

    cachedAds = ads;
    cachedAt = now;

    return ads;
  } catch (err) {
    console.log("DuckSmart in-app sponsor ads failed:", err?.message || err);
    return cachedAds || [];
  }
}

export async function getRandomInAppAd(previousAdId = null) {
  const ads = await getInAppAds();

  if (!ads.length) return null;

  const previousClean = normalizeAdId(previousAdId);

  const pool =
    previousClean && ads.length > 1
      ? ads.filter((ad) => normalizeAdId(ad.id) !== previousClean)
      : ads;

  const finalPool = pool.length ? pool : ads;
  const index = Math.floor(Math.random() * finalPool.length);

  return finalPool[index];
}

export function trackInAppAdImpression(userId, ad, meta = {}) {
  if (!ad) return;

  logEvent("in_app_sponsor_ad_impression", userId || null, {
    adId: ad.id,
    trackingId: ad.trackingId,
    companyName: ad.companyName,
    linkUrl: ad.linkUrl,
    screen: meta.screen || "UnknownScreen",
    placementId: meta.placementId || "unknown",
    platform: Platform.OS,
  });
}

export function trackInAppAdClick(userId, ad, meta = {}) {
  if (!ad) return;

  logEvent("in_app_sponsor_ad_click", userId || null, {
    adId: ad.id,
    trackingId: ad.trackingId,
    companyName: ad.companyName,
    linkUrl: ad.linkUrl,
    screen: meta.screen || "UnknownScreen",
    placementId: meta.placementId || "unknown",
    platform: Platform.OS,
  });
}