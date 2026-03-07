"use client";

import { useMemo } from "react";
import { useHuntLogs } from "@/hooks/useHuntLogs";
import { ENVIRONMENTS, SPREAD_NAMES } from "@/lib/constants";
import Card from "@/components/ui/Card";
import StatCard from "@/components/ui/StatCard";
import Skeleton from "@/components/ui/Skeleton";
import EmptyState from "@/components/ui/EmptyState";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Hash, Target, TrendingUp, Calendar } from "lucide-react";
import { format } from "date-fns";

const ENV_COLORS: Record<string, string> = {
  Marsh: "#2ECC71",
  Timber: "#3498DB",
  Field: "#F1C40F",
  "Open Water": "#E67E22",
  River: "#9B59B6",
};

const SCORE_BUCKET_COLORS = ["#D94C4C", "#D94C4C", "#D9A84C", "#2ECC71", "#2ECC71"];

function CustomTooltip({ active, payload, label }: any) {
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

export default function AnalyticsPage() {
  const { logs, loading } = useHuntLogs();

  // Computed stats
  const stats = useMemo(() => {
    if (!logs.length) return { total: 0, ducks: 0, avgScore: 0, thisMonth: 0 };
    const ducks = logs.reduce((s, l) => s + (l.ducksHarvested || 0), 0);
    const scores = logs.map((l) => l.huntScore || 0);
    const avg = Math.round(scores.reduce((s, v) => s + v, 0) / scores.length);

    const now = new Date();
    const thisMonth = logs.filter((l) => {
      const d = new Date(l.dateTime || l.createdAt);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;

    return { total: logs.length, ducks, avgScore: avg, thisMonth };
  }, [logs]);

  // Chart 1: Hunts over time (by month)
  const huntsOverTime = useMemo(() => {
    const map = new Map<string, number>();
    logs.forEach((l) => {
      const d = new Date(l.dateTime || l.createdAt);
      const key = format(d, "MMM yyyy");
      map.set(key, (map.get(key) || 0) + 1);
    });
    // Sort chronologically
    const entries = Array.from(map.entries()).sort((a, b) => {
      return new Date(a[0]).getTime() - new Date(b[0]).getTime();
    });
    return entries.map(([month, count]) => ({ month, hunts: count }));
  }, [logs]);

  // Chart 2: Ducks over time (by month)
  const ducksOverTime = useMemo(() => {
    const map = new Map<string, number>();
    logs.forEach((l) => {
      const d = new Date(l.dateTime || l.createdAt);
      const key = format(d, "MMM yyyy");
      map.set(key, (map.get(key) || 0) + (l.ducksHarvested || 0));
    });
    const entries = Array.from(map.entries()).sort((a, b) => {
      return new Date(a[0]).getTime() - new Date(b[0]).getTime();
    });
    return entries.map(([month, ducks]) => ({ month, ducks }));
  }, [logs]);

  // Chart 3: Environment breakdown
  const envBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    logs.forEach((l) => {
      const env = l.environment || "Unknown";
      map.set(env, (map.get(env) || 0) + 1);
    });
    return Array.from(map.entries()).map(([name, value]) => ({
      name,
      value,
      color: ENV_COLORS[name] || "#8E8E8E",
    }));
  }, [logs]);

  // Chart 4: Score distribution
  const scoreDistribution = useMemo(() => {
    const buckets = [
      { range: "0-20", min: 0, max: 20, count: 0 },
      { range: "21-40", min: 21, max: 40, count: 0 },
      { range: "41-60", min: 41, max: 60, count: 0 },
      { range: "61-80", min: 61, max: 80, count: 0 },
      { range: "81-100", min: 81, max: 100, count: 0 },
    ];
    logs.forEach((l) => {
      const s = l.huntScore || 0;
      const b = buckets.find((bk) => s >= bk.min && s <= bk.max);
      if (b) b.count++;
    });
    return buckets.map((b, i) => ({
      range: b.range,
      count: b.count,
      color: SCORE_BUCKET_COLORS[i],
    }));
  }, [logs]);

  // Chart 5: Top spreads
  const topSpreads = useMemo(() => {
    const map = new Map<string, number>();
    logs.forEach((l) => {
      const name = SPREAD_NAMES[l.spread] || l.spreadDetails?.name || l.spread || "Unknown";
      map.set(name, (map.get(name) || 0) + 1);
    });
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [logs]);

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-white font-black text-2xl">Analytics</h1>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-72" />
          ))}
        </div>
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-white font-black text-2xl">Analytics</h1>
        <EmptyState
          icon="📊"
          title="No analytics yet"
          description="Start logging hunts in the app to see your performance analytics here."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-white font-black text-2xl">Analytics</h1>

      {/* Stats row */}
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
          label="This Month"
          value={stats.thisMonth}
          color="green"
          icon={<Calendar size={18} />}
        />
      </div>

      {/* Charts grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Chart 1: Hunts Over Time */}
        <Card title="Hunts Over Time">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={huntsOverTime}>
                <CartesianGrid stroke="#2C2C2C" strokeDasharray="3 3" />
                <XAxis
                  dataKey="month"
                  tick={{ fill: "#8E8E8E", fontSize: 11 }}
                  axisLine={{ stroke: "#3A3A3A" }}
                  tickLine={{ stroke: "#3A3A3A" }}
                />
                <YAxis
                  tick={{ fill: "#8E8E8E", fontSize: 11 }}
                  axisLine={{ stroke: "#3A3A3A" }}
                  tickLine={{ stroke: "#3A3A3A" }}
                  allowDecimals={false}
                />
                <Tooltip content={<CustomTooltip />} />
                <Line
                  type="monotone"
                  dataKey="hunts"
                  name="Hunts"
                  stroke="#2ECC71"
                  strokeWidth={2}
                  dot={{ fill: "#2ECC71", r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Chart 2: Ducks Harvested Over Time */}
        <Card title="Ducks Harvested Over Time">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ducksOverTime}>
                <CartesianGrid stroke="#2C2C2C" strokeDasharray="3 3" />
                <XAxis
                  dataKey="month"
                  tick={{ fill: "#8E8E8E", fontSize: 11 }}
                  axisLine={{ stroke: "#3A3A3A" }}
                  tickLine={{ stroke: "#3A3A3A" }}
                />
                <YAxis
                  tick={{ fill: "#8E8E8E", fontSize: 11 }}
                  axisLine={{ stroke: "#3A3A3A" }}
                  tickLine={{ stroke: "#3A3A3A" }}
                  allowDecimals={false}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="ducks" name="Ducks" fill="#2ECC71" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Chart 3: Environment Breakdown */}
        <Card title="Environment Breakdown">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={envBreakdown}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  label={({ name, percent }: any) =>
                    `${name} ${((percent ?? 0) * 100).toFixed(0)}%`
                  }
                  labelLine={{ stroke: "#3A3A3A" }}
                >
                  {envBreakdown.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Chart 4: Score Distribution */}
        <Card title="Score Distribution">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={scoreDistribution}>
                <CartesianGrid stroke="#2C2C2C" strokeDasharray="3 3" />
                <XAxis
                  dataKey="range"
                  tick={{ fill: "#8E8E8E", fontSize: 11 }}
                  axisLine={{ stroke: "#3A3A3A" }}
                  tickLine={{ stroke: "#3A3A3A" }}
                />
                <YAxis
                  tick={{ fill: "#8E8E8E", fontSize: 11 }}
                  axisLine={{ stroke: "#3A3A3A" }}
                  tickLine={{ stroke: "#3A3A3A" }}
                  allowDecimals={false}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" name="Hunts" radius={[4, 4, 0, 0]}>
                  {scoreDistribution.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Chart 5: Top Spreads */}
        <Card title="Top Spreads" className="lg:col-span-2">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topSpreads} layout="vertical">
                <CartesianGrid stroke="#2C2C2C" strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  tick={{ fill: "#8E8E8E", fontSize: 11 }}
                  axisLine={{ stroke: "#3A3A3A" }}
                  tickLine={{ stroke: "#3A3A3A" }}
                  allowDecimals={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fill: "#8E8E8E", fontSize: 11 }}
                  axisLine={{ stroke: "#3A3A3A" }}
                  tickLine={{ stroke: "#3A3A3A" }}
                  width={120}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" name="Uses" fill="#2ECC71" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  );
}
