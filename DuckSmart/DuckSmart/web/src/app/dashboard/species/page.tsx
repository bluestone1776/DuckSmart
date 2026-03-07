"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  IDENTIFY_SPECIES,
  IDENTIFY_GROUPS,
  IDENTIFY_SIZE,
  IDENTIFY_HABITATS,
  EASTER_EGG_DUCK,
  type Species,
} from "@/lib/species";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Chip from "@/components/ui/Chip";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";

const GROUP_COLORS: Record<string, "green" | "yellow" | "red"> = {
  Dabbler: "green",
  Diver: "yellow",
  Merganser: "red",
  "Sea Duck": "red",
};

export default function SpeciesGuidePage() {
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState<string>("All");
  const [sizeFilter, setSizeFilter] = useState<string>("All");
  const [habitatFilter, setHabitatFilter] = useState<string>("All");

  const filteredSpecies = useMemo(() => {
    let result = [...IDENTIFY_SPECIES];

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (sp) =>
          sp.name.toLowerCase().includes(q) ||
          sp.group.toLowerCase().includes(q) ||
          sp.keyMarks.some((k) => k.toLowerCase().includes(q)) ||
          sp.primaryHabitats.toLowerCase().includes(q)
      );
    }

    // Group filter
    if (groupFilter !== "All") {
      result = result.filter((sp) => sp.group === groupFilter);
    }

    // Size filter
    if (sizeFilter !== "All") {
      result = result.filter((sp) => sp.size === sizeFilter);
    }

    // Habitat filter
    if (habitatFilter !== "All") {
      result = result.filter(
        (sp) =>
          sp.habitats[habitatFilter] &&
          sp.habitats[habitatFilter] !== "Low" &&
          sp.habitats[habitatFilter] !== "Rare"
      );
    }

    return result;
  }, [search, groupFilter, sizeFilter, habitatFilter]);

  const allSpeciesWithEgg = [...filteredSpecies, EASTER_EGG_DUCK];

  return (
    <div className="space-y-6">
      <h1 className="text-white font-black text-2xl">Species Guide</h1>
      <p className="text-[#8E8E8E] font-bold text-sm">
        {IDENTIFY_SPECIES.length} species in the database
      </p>

      {/* Filters */}
      <div className="space-y-4">
        <Input
          placeholder="Search species by name, marks, habitat..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <div>
          <p className="text-[#6D6D6D] font-bold text-xs uppercase mb-2">Group</p>
          <div className="flex flex-wrap gap-2">
            <Chip
              label="All"
              selected={groupFilter === "All"}
              onClick={() => setGroupFilter("All")}
            />
            {IDENTIFY_GROUPS.map((g) => (
              <Chip
                key={g}
                label={g}
                selected={groupFilter === g}
                onClick={() => setGroupFilter(g)}
              />
            ))}
          </div>
        </div>

        <div>
          <p className="text-[#6D6D6D] font-bold text-xs uppercase mb-2">Size</p>
          <div className="flex flex-wrap gap-2">
            <Chip
              label="All"
              selected={sizeFilter === "All"}
              onClick={() => setSizeFilter("All")}
            />
            {IDENTIFY_SIZE.map((s) => (
              <Chip
                key={s}
                label={s}
                selected={sizeFilter === s}
                onClick={() => setSizeFilter(s)}
              />
            ))}
          </div>
        </div>

        <div>
          <p className="text-[#6D6D6D] font-bold text-xs uppercase mb-2">Habitat</p>
          <div className="flex flex-wrap gap-2">
            <Chip
              label="All"
              selected={habitatFilter === "All"}
              onClick={() => setHabitatFilter("All")}
            />
            {IDENTIFY_HABITATS.map((h) => (
              <Chip
                key={h}
                label={h}
                selected={habitatFilter === h}
                onClick={() => setHabitatFilter(h)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Results */}
      {filteredSpecies.length === 0 && !search.trim() ? (
        <EmptyState
          icon="🦆"
          title="No species match"
          description="Try adjusting your filters to see more species."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {(search.trim() ? filteredSpecies : allSpeciesWithEgg).map((sp) => (
            <SpeciesCard key={sp.id} species={sp} />
          ))}
        </div>
      )}
    </div>
  );
}

function SpeciesCard({ species }: { species: Species }) {
  const badgeColor = GROUP_COLORS[species.group] || "green";

  return (
    <Link href={`/dashboard/species/${species.id}`}>
      <Card className="hover:border-[#2ECC71] transition-colors cursor-pointer h-full">
        <div className="flex items-start justify-between mb-2">
          <h3 className="text-white font-black text-[15px]">{species.name}</h3>
          <Badge label={species.group} color={badgeColor} />
        </div>

        <div className="flex items-center gap-3 mb-3">
          <span className="text-[#6D6D6D] font-bold text-xs">
            Size: {species.size}
          </span>
          <span className="text-[#6D6D6D] font-bold text-xs">|</span>
          <span className="text-[#6D6D6D] font-bold text-xs">
            {species.primaryHabitats.split(",").slice(0, 2).join(", ")}
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5 mb-3">
          {Object.entries(species.habitats)
            .filter(([, val]) => val === "High")
            .map(([habitat]) => (
              <span
                key={habitat}
                className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#0E1A12] border border-[#2ECC71] text-[#2ECC71]"
              >
                {habitat}
              </span>
            ))}
        </div>

        <p className="text-[#7A7A7A] font-bold text-xs line-clamp-2">
          {species.keyMarks[0]}
        </p>
      </Card>
    </Link>
  );
}
