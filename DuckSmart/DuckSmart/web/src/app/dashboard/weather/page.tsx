"use client";

import { useState, useEffect, useCallback } from "react";
import Card from "@/components/ui/Card";
import StatCard from "@/components/ui/StatCard";
import Skeleton from "@/components/ui/Skeleton";
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Thermometer,
  Wind,
  Gauge,
  CloudRain,
  Cloud,
  Sunrise,
  Sunset,
  RefreshCw,
  MapPin,
} from "lucide-react";
import {
  fetchWeather,
  geocodeZip,
  MOCK_WEATHER,
} from "@/lib/weather";
import type { WeatherData } from "@/lib/weather";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CARDINAL_DIRS = [
  "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
  "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
];

function getCardinalDirection(deg: number): string {
  return CARDINAL_DIRS[Math.round(deg / 22.5) % 16];
}

// ---------------------------------------------------------------------------
// Chart tooltip
// ---------------------------------------------------------------------------

function WeatherTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#141414] border border-[#3A3A3A] rounded-[10px] px-3 py-2 shadow-lg">
      <p className="text-white font-black text-xs mb-1">{label}</p>
      {payload.map((entry: any, i: number) => (
        <p key={i} className="text-sm font-bold" style={{ color: entry.color }}>
          {entry.name}: {entry.value}
        </p>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Wind compass SVG
// ---------------------------------------------------------------------------

function WindCompass({ deg, size = 140 }: { deg: number; size?: number }) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 14;

  // Arrow points in the direction wind is coming FROM
  const rad = ((deg - 90) * Math.PI) / 180;
  const tipX = cx + r * 0.72 * Math.cos(rad);
  const tipY = cy + r * 0.72 * Math.sin(rad);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="flex-shrink-0"
    >
      {/* Outer ring */}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke="#3A3A3A"
        strokeWidth={2}
      />
      {/* Inner ring */}
      <circle
        cx={cx}
        cy={cy}
        r={r * 0.3}
        fill="none"
        stroke="#2C2C2C"
        strokeWidth={1}
      />

      {/* Cardinal labels */}
      <text x={cx} y={14} textAnchor="middle" fill="#8E8E8E" fontSize={12} fontWeight={800}>N</text>
      <text x={size - 8} y={cy + 4} textAnchor="end" fill="#8E8E8E" fontSize={12} fontWeight={800}>E</text>
      <text x={cx} y={size - 6} textAnchor="middle" fill="#8E8E8E" fontSize={12} fontWeight={800}>S</text>
      <text x={8} y={cy + 4} textAnchor="start" fill="#8E8E8E" fontSize={12} fontWeight={800}>W</text>

      {/* Wind direction line */}
      <line
        x1={cx}
        y1={cy}
        x2={tipX}
        y2={tipY}
        stroke="#2ECC71"
        strokeWidth={3}
        strokeLinecap="round"
      />
      {/* Center dot */}
      <circle cx={cx} cy={cy} r={5} fill="#2ECC71" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function WeatherPage() {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [zipInput, setZipInput] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(
    null
  );

  // ── Fetch weather from coords ──
  const loadFromCoords = useCallback(
    async (lat: number, lon: number) => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchWeather(lat, lon);
        if (data) {
          setWeather(data);
          setLastUpdated(new Date());
        } else {
          setWeather(MOCK_WEATHER);
          setError("API unavailable. Showing sample data.");
        }
      } catch (err: any) {
        setWeather(MOCK_WEATHER);
        setError(err.message || "Failed to fetch weather.");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // ── Initial load: browser geolocation ──
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError("Geolocation not supported. Enter a zip code.");
      setWeather(MOCK_WEATHER);
      setLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setCoords({ lat: latitude, lon: longitude });
        loadFromCoords(latitude, longitude);
      },
      () => {
        setError("Location access denied. Enter a zip code below.");
        setWeather(MOCK_WEATHER);
        setLoading(false);
      },
      { enableHighAccuracy: false, timeout: 10000 }
    );
  }, [loadFromCoords]);

  // ── Zip code handler ──
  async function handleZipSubmit() {
    if (zipInput.length < 5) return;
    setLoading(true);
    setError(null);
    const geo = await geocodeZip(zipInput);
    if (geo) {
      setCoords({ lat: geo.lat, lon: geo.lon });
      await loadFromCoords(geo.lat, geo.lon);
    } else {
      setError("Could not find that zip code.");
      setLoading(false);
    }
  }

  // ── Refresh handler ──
  function handleRefresh() {
    if (coords) loadFromCoords(coords.lat, coords.lon);
  }

  // ── Loading skeleton ──
  if (loading && !weather) {
    return (
      <div className="space-y-6">
        <h1 className="text-white font-black text-2xl">Weather</h1>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-72" />
          ))}
        </div>
      </div>
    );
  }

  const w = weather || MOCK_WEATHER;

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-white font-black text-2xl">Weather</h1>
          <div className="flex items-center gap-2 mt-1">
            <MapPin size={14} className="text-[#2ECC71]" />
            <span className="text-[#8E8E8E] font-bold text-sm">
              {w.locationName}
            </span>
            {lastUpdated && (
              <span className="text-[#6D6D6D] text-xs font-bold ml-2">
                Updated {lastUpdated.toLocaleTimeString()}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Zip code input */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={zipInput}
              onChange={(e) =>
                setZipInput(e.target.value.replace(/\D/g, "").slice(0, 5))
              }
              placeholder="Zip code"
              maxLength={5}
              className="bg-[#0E0E0E] border border-[#3A3A3A] rounded-xl px-3 py-2 text-white text-sm font-bold w-24 placeholder:text-[#6D6D6D] focus:border-[#2ECC71] focus:outline-none"
              onKeyDown={(e) => e.key === "Enter" && handleZipSubmit()}
            />
            <button
              onClick={handleZipSubmit}
              disabled={zipInput.length < 5}
              className="bg-[#0E1A12] border border-[#2ECC71] text-[#2ECC71] font-black text-xs px-3 py-2 rounded-xl hover:bg-[#1a2e1f] disabled:opacity-40 transition-colors cursor-pointer"
            >
              Go
            </button>
          </div>

          {/* Refresh */}
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="p-2 rounded-xl border border-[#3A3A3A] bg-[#0E0E0E] text-[#8E8E8E] hover:text-white hover:border-[#2ECC71] transition-colors cursor-pointer disabled:opacity-40"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div className="bg-[#1a1a0e] border border-[#D9A84C] rounded-xl px-4 py-3">
          <p className="text-[#D9A84C] text-sm font-bold">{error}</p>
        </div>
      )}

      {/* ── Current Conditions Grid ── */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard
          label="Temperature"
          value={`${w.tempF}\u00B0F`}
          color="green"
          icon={<Thermometer size={18} />}
        />
        <StatCard
          label="Feels Like"
          value={`${w.feelsLikeF}\u00B0F`}
          color="yellow"
          icon={<Thermometer size={18} />}
        />
        <StatCard
          label="Wind"
          value={`${w.windMph} mph`}
          color="white"
          icon={<Wind size={18} />}
        />
        <StatCard
          label="Pressure"
          value={`${w.pressureInHg} inHg`}
          color="white"
          icon={<Gauge size={18} />}
        />
        <StatCard
          label="Precip Chance"
          value={`${w.precipChance}%`}
          color={w.precipChance > 50 ? "red" : "green"}
          icon={<CloudRain size={18} />}
        />
        <StatCard
          label="Cloud Cover"
          value={`${w.cloudPct}%`}
          color="white"
          icon={<Cloud size={18} />}
        />
      </div>

      {/* ── Sun Times + Delta ── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 bg-[#0E0E0E] border border-[#2C2C2C] rounded-full px-4 py-2">
          <Sunrise size={16} className="text-[#D9A84C]" />
          <span className="text-white font-bold text-sm">{w.sunrise}</span>
        </div>
        <div className="flex items-center gap-2 bg-[#0E0E0E] border border-[#2C2C2C] rounded-full px-4 py-2">
          <Sunset size={16} className="text-[#9B59B6]" />
          <span className="text-white font-bold text-sm">{w.sunset}</span>
        </div>
        <div className="flex items-center gap-2 bg-[#0E0E0E] border border-[#2C2C2C] rounded-full px-4 py-2">
          <span className="text-[#8E8E8E] text-xs font-bold">
            24h Temp Change
          </span>
          <span
            className={`font-black text-sm ${
              w.deltaTemp24hF < 0 ? "text-[#3498DB]" : "text-[#D94C4C]"
            }`}
          >
            {w.deltaTemp24hF > 0 ? "+" : ""}
            {w.deltaTemp24hF}&deg;F
          </span>
        </div>
      </div>

      {/* ── Hourly Forecast Chart ── */}
      <Card title="Hourly Forecast">
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={w.hourly}>
              <CartesianGrid stroke="#2C2C2C" strokeDasharray="3 3" />
              <XAxis
                dataKey="t"
                tick={{ fill: "#8E8E8E", fontSize: 11 }}
                axisLine={{ stroke: "#3A3A3A" }}
                tickLine={{ stroke: "#3A3A3A" }}
              />
              <YAxis
                yAxisId="temp"
                tick={{ fill: "#8E8E8E", fontSize: 11 }}
                axisLine={{ stroke: "#3A3A3A" }}
                tickLine={{ stroke: "#3A3A3A" }}
              />
              <YAxis
                yAxisId="precip"
                orientation="right"
                tick={{ fill: "#8E8E8E", fontSize: 11 }}
                axisLine={{ stroke: "#3A3A3A" }}
                tickLine={{ stroke: "#3A3A3A" }}
                domain={[0, 100]}
              />
              <Tooltip content={<WeatherTooltip />} />
              <Area
                yAxisId="temp"
                type="monotone"
                dataKey="temp"
                name="Temp (\u00B0F)"
                stroke="#2ECC71"
                fill="#0E1A12"
                strokeWidth={2}
              />
              <Area
                yAxisId="precip"
                type="monotone"
                dataKey="precip"
                name="Precip (%)"
                stroke="#3498DB"
                fill="rgba(52,152,219,0.1)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* ── 48-Hour Trends ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="48h Temperature Trend">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={w.trends48h}>
                <CartesianGrid stroke="#2C2C2C" strokeDasharray="3 3" />
                <XAxis
                  dataKey="t"
                  tick={{ fill: "#8E8E8E", fontSize: 11 }}
                  axisLine={{ stroke: "#3A3A3A" }}
                  tickLine={{ stroke: "#3A3A3A" }}
                />
                <YAxis
                  tick={{ fill: "#8E8E8E", fontSize: 11 }}
                  axisLine={{ stroke: "#3A3A3A" }}
                  tickLine={{ stroke: "#3A3A3A" }}
                />
                <Tooltip content={<WeatherTooltip />} />
                <Line
                  type="monotone"
                  dataKey="temp"
                  name="Temp (\u00B0F)"
                  stroke="#2ECC71"
                  strokeWidth={2}
                  dot={{ fill: "#2ECC71", r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="48h Pressure Trend">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={w.trends48h}>
                <CartesianGrid stroke="#2C2C2C" strokeDasharray="3 3" />
                <XAxis
                  dataKey="t"
                  tick={{ fill: "#8E8E8E", fontSize: 11 }}
                  axisLine={{ stroke: "#3A3A3A" }}
                  tickLine={{ stroke: "#3A3A3A" }}
                />
                <YAxis
                  tick={{ fill: "#8E8E8E", fontSize: 11 }}
                  axisLine={{ stroke: "#3A3A3A" }}
                  tickLine={{ stroke: "#3A3A3A" }}
                  domain={["auto", "auto"]}
                />
                <Tooltip content={<WeatherTooltip />} />
                <Line
                  type="monotone"
                  dataKey="pressureInHg"
                  name="Pressure (inHg)"
                  stroke="#D9A84C"
                  strokeWidth={2}
                  dot={{ fill: "#D9A84C", r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* ── Wind Card ── */}
      <Card title="Wind">
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <WindCompass deg={w.windDeg} />

          <div className="grid grid-cols-2 gap-x-8 gap-y-4 flex-1">
            <div>
              <p className="text-[#7A7A7A] text-xs font-black uppercase tracking-wider">
                Speed
              </p>
              <p className="text-white text-2xl font-black mt-1">
                {w.windMph} mph
              </p>
            </div>
            <div>
              <p className="text-[#7A7A7A] text-xs font-black uppercase tracking-wider">
                Direction
              </p>
              <p className="text-white text-2xl font-black mt-1">
                {w.windDeg}&deg;
              </p>
            </div>
            <div>
              <p className="text-[#7A7A7A] text-xs font-black uppercase tracking-wider">
                3h Pressure Change
              </p>
              <p
                className={`text-2xl font-black mt-1 ${
                  w.deltaPressure3h > 0
                    ? "text-[#2ECC71]"
                    : w.deltaPressure3h < 0
                    ? "text-[#D94C4C]"
                    : "text-white"
                }`}
              >
                {w.deltaPressure3h > 0 ? "+" : ""}
                {w.deltaPressure3h} inHg
              </p>
            </div>
            <div>
              <p className="text-[#7A7A7A] text-xs font-black uppercase tracking-wider">
                Bearing
              </p>
              <p className="text-white text-2xl font-black mt-1">
                {getCardinalDirection(w.windDeg)}
              </p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
