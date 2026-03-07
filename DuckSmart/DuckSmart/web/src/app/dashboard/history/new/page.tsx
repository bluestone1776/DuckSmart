"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { createHuntLog } from "@/lib/firestore";
import { ENVIRONMENTS, SPREAD_NAMES } from "@/lib/constants";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Chip from "@/components/ui/Chip";
import { ArrowLeft, Check, MapPin } from "lucide-react";
import type { HuntLog } from "@/lib/types";

const SPREAD_KEYS = Object.keys(SPREAD_NAMES);

export default function NewHuntLogPage() {
  const { user } = useAuth();
  const router = useRouter();

  // Form state
  const [dateTime, setDateTime] = useState(() => {
    const now = new Date();
    // Format as local datetime-local value
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  });
  const [environment, setEnvironment] = useState<string>(ENVIRONMENTS[0]);
  const [spread, setSpread] = useState<string>(SPREAD_KEYS[0]);
  const [huntScore, setHuntScore] = useState("50");
  const [ducksHarvested, setDucksHarvested] = useState("0");
  const [notes, setNotes] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function handleUseMyLocation() {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(pos.coords.latitude.toFixed(6));
        setLongitude(pos.coords.longitude.toFixed(6));
      },
      () => {
        setError("Unable to retrieve your location. Please enter manually.");
      }
    );
  }

  async function handleSave() {
    if (!user?.uid) return;

    // Validate
    if (!dateTime) {
      setError("Date/time is required.");
      return;
    }
    const score = parseInt(huntScore);
    if (isNaN(score) || score < 0 || score > 100) {
      setError("Score must be between 0 and 100.");
      return;
    }
    const ducks = parseInt(ducksHarvested);
    if (isNaN(ducks) || ducks < 0) {
      setError("Ducks harvested must be 0 or more.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const logId = `log-${Date.now()}`;
      const lat = parseFloat(latitude);
      const lng = parseFloat(longitude);

      const newLog: HuntLog = {
        id: logId,
        createdAt: Date.now(),
        dateTime: new Date(dateTime).toISOString(),
        environment,
        spread,
        spreadDetails: null,
        huntScore: score,
        ducksHarvested: ducks,
        notes: notes.trim(),
        location:
          !isNaN(lat) && !isNaN(lng)
            ? { latitude: lat, longitude: lng }
            : { latitude: 0, longitude: 0 },
        photos: [],
      };

      await createHuntLog(user.uid, newLog);
      router.push(`/dashboard/history/${logId}`);
    } catch {
      setError("Failed to create hunt log. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Link
          href="/dashboard/history"
          className="inline-flex items-center gap-2 text-[#8E8E8E] hover:text-white transition-colors font-bold text-sm"
        >
          <ArrowLeft size={16} />
          Back to History
        </Link>
      </div>

      <h1 className="text-white font-black text-2xl">New Hunt Log</h1>

      {/* Date & Time */}
      <Card title="Date & Time">
        <input
          type="datetime-local"
          value={dateTime}
          onChange={(e) => setDateTime(e.target.value)}
          className="bg-[#0E0E0E] border border-[#3A3A3A] rounded-[14px] px-3 py-2.5 text-white font-extrabold w-full focus:outline-none focus:border-[#2ECC71] text-sm"
        />
      </Card>

      {/* Environment */}
      <Card title="Environment">
        <div className="flex flex-wrap gap-2">
          {ENVIRONMENTS.map((env) => (
            <Chip
              key={env}
              label={env}
              selected={environment === env}
              onClick={() => setEnvironment(env)}
            />
          ))}
        </div>
      </Card>

      {/* Spread */}
      <Card title="Decoy Spread">
        <div className="flex flex-wrap gap-2">
          {SPREAD_KEYS.map((key) => (
            <Chip
              key={key}
              label={SPREAD_NAMES[key]}
              selected={spread === key}
              onClick={() => setSpread(key)}
            />
          ))}
        </div>
      </Card>

      {/* Score & Ducks */}
      <Card title="Results">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Input
              label="Hunt Score (0-100)"
              type="number"
              value={huntScore}
              onChange={(e) => setHuntScore(e.target.value)}
              placeholder="0-100"
            />
            {/* Score slider */}
            <input
              type="range"
              min="0"
              max="100"
              value={huntScore}
              onChange={(e) => setHuntScore(e.target.value)}
              className="w-full mt-2 accent-[#2ECC71]"
            />
          </div>
          <Input
            label="Ducks Harvested"
            type="number"
            value={ducksHarvested}
            onChange={(e) => setDucksHarvested(e.target.value)}
            placeholder="0"
          />
        </div>
      </Card>

      {/* Location */}
      <Card title="Location (Optional)">
        <div className="grid grid-cols-2 gap-4 mb-3">
          <Input
            label="Latitude"
            type="number"
            value={latitude}
            onChange={(e) => setLatitude(e.target.value)}
            placeholder="e.g. 35.1234"
          />
          <Input
            label="Longitude"
            type="number"
            value={longitude}
            onChange={(e) => setLongitude(e.target.value)}
            placeholder="e.g. -89.5678"
          />
        </div>
        <button
          type="button"
          onClick={handleUseMyLocation}
          className="flex items-center gap-2 text-[#2ECC71] font-bold text-xs hover:underline cursor-pointer"
        >
          <MapPin size={12} />
          Use my current location
        </button>
      </Card>

      {/* Notes */}
      <Card title="Notes">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          placeholder="How was the hunt? Weather conditions, notable observations..."
          className="bg-[#0E0E0E] border border-[#3A3A3A] rounded-[14px] px-3 py-2.5 text-white font-extrabold w-full placeholder:text-[#6D6D6D] focus:outline-none focus:border-[#2ECC71] resize-none text-sm"
        />
      </Card>

      {/* Error */}
      {error && (
        <div className="bg-[rgba(217,76,76,0.12)] border border-[#D94C4C] rounded-[14px] px-4 py-3">
          <p className="text-[#D94C4C] font-bold text-sm">{error}</p>
        </div>
      )}

      {/* Save */}
      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={saving}>
          <span className="flex items-center gap-2">
            <Check size={14} />
            {saving ? "Saving..." : "Create Hunt Log"}
          </span>
        </Button>
        <Link href="/dashboard/history">
          <Button variant="secondary">Cancel</Button>
        </Link>
      </div>
    </div>
  );
}
