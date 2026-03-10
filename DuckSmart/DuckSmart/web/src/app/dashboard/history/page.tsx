"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useHuntLogs } from "@/hooks/useHuntLogs";
import { formatDate, getScoreColor } from "@/lib/utils";
import { ENVIRONMENTS, SPREAD_NAMES } from "@/lib/constants";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Chip from "@/components/ui/Chip";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import StatCard from "@/components/ui/StatCard";
import Skeleton from "@/components/ui/Skeleton";
import EmptyState from "@/components/ui/EmptyState";
import { Target, TrendingUp, Award, Hash, Plus } from "lucide-react";
import type { HuntLog } from "@/lib/types";

type SortKey = "date-desc" | "date-asc" | "score-desc" | "score-asc" | "ducks-desc" | "ducks-asc";

export default function HistoryPage() {
  const { logs, loading, error } = useHuntLogs();
  const [search, setSearch] = useState("");
  const [envFilter, setEnvFilter] = useState<string>("All");
  const [sortBy, setSortBy] = useState<SortKey>("date-desc");

  // Stats
  const stats = useMemo(() => {
    if (!logs.length) return { total: 0, ducks: 0, avgScore: 0, bestScore: 0 };
    const ducks = logs.reduce((s, l) => s + (l.ducksHarvested || 0), 0);
    const scores = logs.map((l) => l.huntScore || 0);
    const avg = scores.reduce((s, v) => s + v, 0) / scores.length;
    const best = Math.max(...scores);
    return { total: logs.length, ducks, avgScore: Math.round(avg), bestScore: best };
  }, [logs]);

  // Filtered + sorted logs
  const filteredLogs = useMemo(() => {
    let result = [...logs];

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (l) =>
          (l.notes || "").toLowerCase().includes(q) ||
          (l.environment || "").toLowerCase().includes(q) ||
          (SPREAD_NAMES[l.spread] || l.spreadDetails?.name || "").toLowerCase().includes(q)
      );
    }

    // Environment filter
    if (envFilter !== "All") {
      result = result.filter((l) => l.environment === envFilter);
    }

    // Sort
    result.sort((a, b) => {
      switch (sortBy) {
        case "date-desc":
          return (b.createdAt || 0) - (a.createdAt || 0);
        case "date-asc":
          return (a.createdAt || 0) - (b.createdAt || 0);
        case "score-desc":
          return (b.huntScore || 0) - (a.huntScore || 0);
        case "score-asc":
          return (a.huntScore || 0) - (b.huntScore || 0);
        case "ducks-desc":
          return (b.ducksHarvested || 0) - (a.ducksHarvested || 0);
        case "ducks-asc":
          return (a.ducksHarvested || 0) - (b.ducksHarvested || 0);
        default:
          return 0;
      }
    });

    return result;
  }, [logs, search, envFilter, sortBy]);

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-white font-black text-2xl">Hunt History</h1>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-white font-black text-2xl">Hunt History</h1>
        <Link href="/dashboard/history/new">
          <Button>
            <span className="flex items-center gap-2">
              <Plus size={14} />
              New Hunt Log
            </span>
          </Button>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Hunts"
          value={stats.total}
          color="white"
          icon={<Hash size={18} />}
        />
        <StatCard
          label="Ducks Harvested"
          value={stats.ducks}
          color="green"
          icon={<Target size={18} />}
        />
        <StatCard
          label="Avg Score"
          value={stats.avgScore}
          color="yellow"
          icon={<TrendingUp size={18} />}
        />
        <StatCard
          label="Best Score"
          value={stats.bestScore}
          color="green"
          icon={<Award size={18} />}
        />
      </div>

      {/* Filters */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <Input
              placeholder="Search hunts..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortKey)}
            className="bg-[#0E0E0E] border border-[#3A3A3A] rounded-[14px] px-3 py-2.5 text-white font-extrabold text-sm focus:outline-none focus:border-[#2ECC71] cursor-pointer"
          >
            <option value="date-desc">Newest First</option>
            <option value="date-asc">Oldest First</option>
            <option value="score-desc">Highest Score</option>
            <option value="score-asc">Lowest Score</option>
            <option value="ducks-desc">Most Ducks</option>
            <option value="ducks-asc">Fewest Ducks</option>
          </select>
        </div>

        <div className="flex flex-wrap gap-2">
          <Chip
            label="All"
            selected={envFilter === "All"}
            onClick={() => setEnvFilter("All")}
          />
          {ENVIRONMENTS.map((env) => (
            <Chip
              key={env}
              label={env}
              selected={envFilter === env}
              onClick={() => setEnvFilter(env)}
            />
          ))}
        </div>
      </div>

      {/* Results */}
      {error && (
        <div className="bg-[rgba(217,76,76,0.12)] border border-[#D94C4C] rounded-[14px] px-4 py-3">
          <p className="text-[#D94C4C] font-bold text-sm">{error}</p>
        </div>
      )}

      {filteredLogs.length === 0 ? (
        <EmptyState
          icon="🦆"
          title="No hunts found"
          description={
            logs.length === 0
              ? "Your hunt logs will appear here once you start logging hunts in the app."
              : "No hunts match your current filters. Try adjusting your search or filters."
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredLogs.map((log) => (
            <HuntLogCard key={log.id} log={log} />
          ))}
        </div>
      )}
    </div>
  );
}

function HuntLogCard({ log }: { log: HuntLog }) {
  const spreadName = SPREAD_NAMES[log.spread] || log.spreadDetails?.name || "Unknown";
  const scoreColor = getScoreColor(log.huntScore || 0);
  const badgeColor =
    log.environment === "Marsh" || log.environment === "Timber"
      ? "green"
      : log.environment === "Field"
      ? "yellow"
      : "red";

  return (
    <Link href={`/dashboard/history/${log.id}`}>
      <Card className="hover:border-[#2ECC71] transition-colors cursor-pointer h-full">
        <div className="flex justify-between items-start mb-3">
          <div>
            <p className="text-white font-black text-sm">
              {log.dateTime ? formatDate(log.dateTime) : formatDate(log.createdAt)}
            </p>
            <div className="flex items-center gap-2 mt-1">
              <Badge label={log.environment || "Unknown"} color={badgeColor} />
            </div>
          </div>
          {log.photos && log.photos.length > 0 && (
            <Image
              src={log.photos[0].uri}
              alt="Hunt photo"
              width={56}
              height={56}
              className="w-14 h-14 rounded-[10px] object-cover border border-[#3A3A3A]"
            />
          )}
        </div>

        <p className="text-[#8E8E8E] font-bold text-xs mb-3">{spreadName}</p>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div>
              <p className="text-[#6D6D6D] font-bold text-[10px] uppercase">Score</p>
              <p className="font-black text-lg" style={{ color: scoreColor }}>
                {log.huntScore || 0}
              </p>
            </div>
            <div>
              <p className="text-[#6D6D6D] font-bold text-[10px] uppercase">Ducks</p>
              <p className="text-white font-black text-lg">
                {log.ducksHarvested || 0}
              </p>
            </div>
          </div>
          {log.photos && log.photos.length > 0 && (
            <p className="text-[#6D6D6D] font-bold text-xs">
              {log.photos.length} photo{log.photos.length !== 1 ? "s" : ""}
            </p>
          )}
        </div>

        {log.notes && (
          <p className="text-[#7A7A7A] font-bold text-xs mt-3 line-clamp-2">
            {log.notes}
          </p>
        )}
      </Card>
    </Link>
  );
}
