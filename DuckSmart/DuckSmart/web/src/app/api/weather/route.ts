import { NextRequest, NextResponse } from "next/server";

/**
 * Server-side weather proxy — keeps the OWM API key out of the client bundle.
 *
 * GET /api/weather?lat=33.99&lon=-83.38
 * GET /api/weather?zip=30601
 */

const OWM_KEY = process.env.OWM_API_KEY || "";
const BASE = "https://api.openweathermap.org/data/2.5";

export async function GET(request: NextRequest) {
  if (!OWM_KEY) {
    return NextResponse.json(
      { error: "OWM API key not configured" },
      { status: 500 },
    );
  }

  const { searchParams } = request.nextUrl;
  const zip = searchParams.get("zip");
  const lat = searchParams.get("lat");
  const lon = searchParams.get("lon");

  try {
    // Zip geocoding mode
    if (zip) {
      const geoUrl = `https://api.openweathermap.org/geo/1.0/zip?zip=${encodeURIComponent(zip)},US&appid=${OWM_KEY}`;
      const geoRes = await fetch(geoUrl);
      if (!geoRes.ok) {
        return NextResponse.json({ error: "Zip not found" }, { status: 404 });
      }
      const geo = await geoRes.json();
      return NextResponse.json({ lat: geo.lat, lon: geo.lon, name: geo.name });
    }

    // Weather mode — requires lat/lon
    if (!lat || !lon) {
      return NextResponse.json(
        { error: "lat and lon are required" },
        { status: 400 },
      );
    }

    const [currentRes, forecastRes] = await Promise.all([
      fetch(
        `${BASE}/weather?lat=${lat}&lon=${lon}&units=imperial&appid=${OWM_KEY}`,
      ),
      fetch(
        `${BASE}/forecast?lat=${lat}&lon=${lon}&units=imperial&appid=${OWM_KEY}`,
      ),
    ]);

    if (!currentRes.ok || !forecastRes.ok) {
      return NextResponse.json(
        { error: "OWM API error" },
        { status: 502 },
      );
    }

    const [current, forecast] = await Promise.all([
      currentRes.json(),
      forecastRes.json(),
    ]);

    return NextResponse.json({ current, forecast });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Internal error" },
      { status: 500 },
    );
  }
}
