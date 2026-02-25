// DuckSmart — AI Service
//
// Powers two Pro features:
// 1. AI Duck ID     — identify a duck species from a photo
// 2. AI Spread Analyzer — score a decoy spread photo for quality
//
// Uses OpenAI's GPT-4o vision endpoint.  Gracefully degrades if the key
// is missing or the request fails.

import * as FileSystem from "expo-file-system";
import { OPENAI_API_KEY } from "../config";

const API_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = "gpt-4o";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Infer MIME type from file extension */
function mimeFromUri(uri) {
  const lower = uri.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/jpeg"; // default for .jpg / .jpeg / camera captures
}

/** Convert a local file URI to a base64 data URL for the OpenAI vision API */
async function imageToBase64(uri) {
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return `data:${mimeFromUri(uri)};base64,${base64}`;
}

/** Call the OpenAI chat completions API with a vision prompt */
async function callVision(systemPrompt, userText, imageUri) {
  if (!OPENAI_API_KEY) {
    throw new Error("AI features require an OpenAI API key. Add it in app.json → extra → openaiApiKey.");
  }

  const dataUrl = await imageToBase64(imageUri);

  const body = {
    model: MODEL,
    max_tokens: 1024,
    temperature: 0.3,
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          { type: "text", text: userText },
          { type: "image_url", image_url: { url: dataUrl, detail: "low" } },
        ],
      },
    ],
  };

  // 30-second timeout so the app doesn't hang if OpenAI is unresponsive
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);

  let res;
  try {
    res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err.name === "AbortError") {
      throw new Error("AI request timed out. Check your connection and try again.");
    }
    throw err;
  }
  clearTimeout(timer);

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OpenAI API error ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content || "";
  return raw;
}

/** Parse a JSON block out of a markdown-fenced response */
function parseJSON(raw) {
  // Strip markdown code fences if present
  const cleaned = raw.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
  return JSON.parse(cleaned);
}

// ---------------------------------------------------------------------------
// AI Duck ID
// ---------------------------------------------------------------------------

const DUCK_ID_SYSTEM = `You are DuckSmart AI, an expert North American waterfowl identification assistant.
Analyze the photo and identify the duck species.

ALWAYS respond with valid JSON in this exact format (no markdown, no extra text):
{
  "species": "Common Name",
  "confidence": 85,
  "sex": "Drake" or "Hen" or "Unknown",
  "fieldMarks": ["mark 1", "mark 2", "mark 3"],
  "similarSpecies": [
    { "name": "Species Name", "distinction": "how to tell apart" }
  ],
  "notes": "One sentence with a helpful observation about the bird."
}

Rules:
- confidence is 0-100.
- If the photo does not contain a duck, set species to "Not a Duck" and confidence to 0.
- fieldMarks should list 2-4 visible identifying features.
- similarSpecies should list 1-2 species that look similar.
- Keep all text concise.`;

export async function identifyDuck(imageUri) {
  const raw = await callVision(
    DUCK_ID_SYSTEM,
    "Identify this duck species. What field marks do you see?",
    imageUri
  );

  try {
    return parseJSON(raw);
  } catch {
    // If JSON parse fails, return a structured fallback
    return {
      species: "Unknown",
      confidence: 0,
      sex: "Unknown",
      fieldMarks: ["Could not parse AI response"],
      similarSpecies: [],
      notes: raw.slice(0, 200),
    };
  }
}

// ---------------------------------------------------------------------------
// AI Spread Analyzer
// ---------------------------------------------------------------------------

const SPREAD_SYSTEM = `You are DuckSmart AI, an expert duck hunting decoy spread analyst.
Analyze the photo of a decoy spread and score it on four criteria.

Context will include current wind direction and speed.

ALWAYS respond with valid JSON in this exact format (no markdown, no extra text):
{
  "overallScore": 75,
  "scores": {
    "windAlignment": { "score": 80, "note": "brief note" },
    "spacing": { "score": 70, "note": "brief note" },
    "realism": { "score": 75, "note": "brief note" },
    "landingZone": { "score": 72, "note": "brief note" }
  },
  "improvements": ["improvement 1", "improvement 2", "improvement 3"],
  "spreadType": "Name of detected spread pattern",
  "summary": "One sentence overall assessment."
}

Rules:
- Each score is 0-100.
- overallScore is the weighted average (wind 30%, spacing 25%, realism 25%, landing zone 20%).
- improvements should list 2-4 actionable tips.
- If the photo does not show decoys, set overallScore to 0 and note it in summary.
- Keep all text concise and practical.`;

export async function analyzeSpread(imageUri, weatherContext) {
  const userText = weatherContext
    ? `Analyze this decoy spread. Current conditions: Wind from ${weatherContext.windDir} at ${weatherContext.windMph} mph, ${weatherContext.tempF}°F, ${weatherContext.condition}.`
    : "Analyze this decoy spread setup.";

  const raw = await callVision(SPREAD_SYSTEM, userText, imageUri);

  try {
    return parseJSON(raw);
  } catch {
    return {
      overallScore: 0,
      scores: {
        windAlignment: { score: 0, note: "Parse error" },
        spacing: { score: 0, note: "Parse error" },
        realism: { score: 0, note: "Parse error" },
        landingZone: { score: 0, note: "Parse error" },
      },
      improvements: ["Could not parse AI response"],
      spreadType: "Unknown",
      summary: raw.slice(0, 200),
    };
  }
}

/** Quick check if AI features are available (key configured) */
export function isAIAvailable() {
  return !!OPENAI_API_KEY;
}
