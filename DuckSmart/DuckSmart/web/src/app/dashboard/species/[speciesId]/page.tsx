"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { IDENTIFY_SPECIES, EASTER_EGG_DUCK, type Species } from "@/lib/species";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import { ArrowLeft } from "lucide-react";

const GROUP_COLORS: Record<string, "green" | "yellow" | "red"> = {
  Dabbler: "green",
  Diver: "yellow",
  Merganser: "red",
  "Sea Duck": "red",
  "???": "yellow",
};

const HABITAT_RATING_COLORS: Record<string, string> = {
  High: "#2ECC71",
  Medium: "#D9A84C",
  Low: "#D94C4C",
  Rare: "#8E8E8E",
};

export default function SpeciesDetailPage() {
  const params = useParams();
  const speciesId = params.speciesId as string;

  const allSpecies = [...IDENTIFY_SPECIES, EASTER_EGG_DUCK];
  const species = allSpecies.find((sp) => sp.id === speciesId);

  if (!species) {
    return (
      <div className="space-y-4">
        <Link
          href="/dashboard/species"
          className="inline-flex items-center gap-2 text-[#8E8E8E] hover:text-white transition-colors font-bold text-sm"
        >
          <ArrowLeft size={16} />
          Back to Species Guide
        </Link>
        <Card>
          <p className="text-[#D94C4C] font-bold text-sm">Species not found.</p>
        </Card>
      </div>
    );
  }

  const badgeColor = GROUP_COLORS[species.group] || "green";

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Back link */}
      <Link
        href="/dashboard/species"
        className="inline-flex items-center gap-2 text-[#8E8E8E] hover:text-white transition-colors font-bold text-sm"
      >
        <ArrowLeft size={16} />
        Back to Species Guide
      </Link>

      {/* Header */}
      <div className="flex items-center gap-4">
        <h1 className="text-white font-black text-2xl">{species.name}</h1>
        <Badge label={species.group} color={badgeColor} />
      </div>

      {/* Quick facts */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card>
          <p className="text-[#6D6D6D] font-bold text-xs uppercase mb-1">Group</p>
          <p className="text-white font-black text-sm">{species.group}</p>
        </Card>
        <Card>
          <p className="text-[#6D6D6D] font-bold text-xs uppercase mb-1">Size</p>
          <p className="text-white font-black text-sm">{species.size}</p>
        </Card>
        <Card>
          <p className="text-[#6D6D6D] font-bold text-xs uppercase mb-1">Flight</p>
          <p className="text-white font-black text-sm">{species.flightInfo}</p>
        </Card>
      </div>

      {/* Habitats */}
      <Card title="Habitat Ratings">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 mb-4">
          {Object.entries(species.habitats).map(([habitat, rating]) => (
            <div
              key={habitat}
              className="bg-[#0E0E0E] border border-[#2C2C2C] rounded-[14px] p-3 text-center"
            >
              <p className="text-[#8E8E8E] font-bold text-xs mb-1">{habitat}</p>
              <p
                className="font-black text-sm"
                style={{ color: HABITAT_RATING_COLORS[rating] || "#8E8E8E" }}
              >
                {rating}
              </p>
            </div>
          ))}
        </div>
        <div>
          <p className="text-[#6D6D6D] font-bold text-xs uppercase mb-1">Primary Habitats</p>
          <p className="text-[#BDBDBD] font-bold text-sm">{species.primaryHabitats}</p>
        </div>
        <div className="mt-3">
          <p className="text-[#6D6D6D] font-bold text-xs uppercase mb-1">Behavior</p>
          <p className="text-[#BDBDBD] font-bold text-sm">{species.habitatBehavior}</p>
        </div>
      </Card>

      {/* Key Marks */}
      <Card title="Key Identification Marks">
        <ul className="space-y-2">
          {species.keyMarks.map((mark, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="text-[#2ECC71] mt-1">•</span>
              <span className="text-[#BDBDBD] font-bold text-sm">{mark}</span>
            </li>
          ))}
        </ul>
      </Card>

      {/* Lookalikes */}
      {species.lookalikes.length > 0 && (
        <Card title="Lookalikes">
          <div className="flex flex-wrap gap-2">
            {species.lookalikes.map((name, i) => {
              const match = allSpecies.find((sp) => sp.name === name);
              return match ? (
                <Link
                  key={i}
                  href={`/dashboard/species/${match.id}`}
                  className="text-[#2ECC71] font-bold text-sm hover:underline bg-[#0E1A12] border border-[#2ECC71]/30 rounded-full px-3 py-1"
                >
                  {name}
                </Link>
              ) : (
                <span
                  key={i}
                  className="text-[#8E8E8E] font-bold text-sm bg-[#0E0E0E] border border-[#3A3A3A] rounded-full px-3 py-1"
                >
                  {name}
                </span>
              );
            })}
          </div>
        </Card>
      )}

      {/* Hunting Tips */}
      {species.tips.length > 0 && (
        <Card title="Hunting Tips">
          <ul className="space-y-2">
            {species.tips.map((tip, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-[#D9A84C] mt-1">💡</span>
                <span className="text-[#BDBDBD] font-bold text-sm">{tip}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Legal Note */}
      <Card title="Legal Note">
        <div className="bg-[rgba(217,168,76,0.08)] border border-[#D9A84C]/30 rounded-[14px] p-3">
          <p className="text-[#D9A84C] font-bold text-sm">⚠️ {species.legalNote}</p>
        </div>
      </Card>
    </div>
  );
}
