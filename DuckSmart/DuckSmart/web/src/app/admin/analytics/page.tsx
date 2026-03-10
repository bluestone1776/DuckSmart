"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getAnalyticsEvents } from "@/lib/firestore";
import type { QueryDocumentSnapshot } from "firebase/firestore";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import StatCard from "@/components/ui/StatCard";
import Skeleton from "@/components/ui/Skeleton";
import EmptyState from "@/components/ui/EmptyState";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Activity, Users, Zap, TrendingUp } from "lucide-react";
import { format, subDays } from "date-fns";
import type { AnalyticsEvent } from "@/lib/types";

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

const EVENT_COLORS: Record<string, string> = {
  login: "#2ECC71",
  signup: "#4CD97B",
  hunt_logged: "#3498DB",
  duck_identified: "#F1C40F",
  pin_created: "#E67E22",
  spread_analyzed: "#9B59B6",
  feedback_submitted: "#D9A84C",
  pro_upgrade: "#2ECC71",
  app_open: "#8E8E8E",
  screen_view: "#6D6D6D",
};

const PAGE_SIZE = 500;

export default function AdminAnalyticsPage() {
  const [events, setEvents] = useState<AnalyticsEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const cursorRef = useRef<QueryDocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(true);

  const fetchPage = useCallback(async (cursor: QueryDocumentSnapshot | null) => {
    const thirtyDaysAgo = subDays(new Date(), 30).getTime();
    const { events: page, lastDoc } = await getAnalyticsEvents({
      startDate: thirtyDaysAgo,
      limit: PAGE_SIZE,
      cursor,
    });
    cursorRef.current = lastDoc;
    setHasMore(!!lastDoc);
    return page;
  }, []);

  // Initial load — first page
  useEffect(() => {
    (async () => {
      try {
        const page = await fetchPage(null);
        setEvents(page);
      } catch (err) {
        console.error("Failed to fetch analytics:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [fetchPage]);

  // Load more
  async function handleLoadMore() {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchPage(cursorRef.current);
      setEvents((prev) => [...prev, ...page]);
    } catch (err) {
      console.error("Failed to load more analytics:", err);
    } finally {
      setLoadingMore(false);
    }
  }

  // Computed metrics
  const stats = useMemo(() => {
    const uniqueUsers = new Set(events.map((e) => e.userId)).size;
    const logins = events.filter((e) => e.eventName === "login").length;
    const signups = events.filter((e) => e.eventName === "signup").length;
    const huntsLogged = events.filter((e) => e.eventName === "hunt_logged").length;
    return { total: events.length, uniqueUsers, logins, signups, huntsLogged };
  }, [events]);

  // Events by day (last 30 days)
  const eventsByDay = useMemo(() => {
    const map = new Map<string, number>();
    events.forEach((e) => {
      const key = format(new Date(e.timestamp), "MMM d");
      map.set(key, (map.get(key) || 0) + 1);
    });
    // Fill last 30 days
    const result = [];
    for (let i = 29; i >= 0; i--) {
      const d = subDays(new Date(), i);
      const key = format(d, "MMM d");
      result.push({ day: key, events: map.get(key) || 0 });
    }
    return result;
  }, [events]);

  // Event type breakdown
  const eventTypeBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    events.forEach((e) => {
      map.set(e.eventName, (map.get(e.eventName) || 0) + 1);
    });
    return Array.from(map.entries())
      .map(([name, count]) => ({
        name: name.replace(/_/g, " "),
        count,
        color: EVENT_COLORS[name] || "#8E8E8E",
      }))
      .sort((a, b) => b.count - a.count);
  }, [events]);

  // Platform breakdown
  const platformBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    events.forEach((e) => {
      const platform = e.device?.platform || "unknown";
      map.set(platform, (map.get(platform) || 0) + 1);
    });
    return Array.from(map.entries()).map(([name, value]) => ({
      name,
      value,
      color: name === "ios" ? "#3498DB" : name === "android" ? "#2ECC71" : "#8E8E8E",
    }));
  }, [events]);

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-white font-black text-2xl">Platform Analytics</h1>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-72" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-white font-black text-2xl">Platform Analytics</h1>
      <p className="text-[#8E8E8E] font-bold text-sm">Last 30 days</p>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Events"
          value={stats.total}
          color="white"
          icon={<Activity size={18} />}
        />
        <StatCard
          label="Unique Users"
          value={stats.uniqueUsers}
          color="green"
          icon={<Users size={18} />}
        />
        <StatCard
          label="Logins"
          value={stats.logins}
          color="yellow"
          icon={<Zap size={18} />}
        />
        <StatCard
          label="Hunts Logged"
          value={stats.huntsLogged}
          color="green"
          icon={<TrendingUp size={18} />}
        />
      </div>

      {events.length === 0 ? (
        <EmptyState
          icon="📊"
          title="No analytics data"
          description="Analytics events will appear here as users interact with the app."
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Events over time */}
          <Card title="Events Over Time" className="lg:col-span-2">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={eventsByDay}>
                  <CartesianGrid stroke="#2C2C2C" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="day"
                    tick={{ fill: "#8E8E8E", fontSize: 10 }}
                    axisLine={{ stroke: "#3A3A3A" }}
                    tickLine={{ stroke: "#3A3A3A" }}
                    interval="preserveStartEnd"
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
                    dataKey="events"
                    name="Events"
                    stroke="#D9A84C"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Event type breakdown */}
          <Card title="Event Types">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={eventTypeBreakdown} layout="vertical">
                  <CartesianGrid stroke="#2C2C2C" strokeDasharray="3 3" />
                  <XAxis
                    type="number"
                    tick={{ fill: "#8E8E8E", fontSize: 11 }}
                    axisLine={{ stroke: "#3A3A3A" }}
                    allowDecimals={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fill: "#8E8E8E", fontSize: 10 }}
                    axisLine={{ stroke: "#3A3A3A" }}
                    width={100}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="count" name="Count" radius={[0, 4, 4, 0]}>
                    {eventTypeBreakdown.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Platform breakdown */}
          <Card title="Platform Breakdown">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={platformBreakdown}
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
                    {platformBreakdown.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      )}

      {/* Load More */}
      {hasMore && events.length > 0 && (
        <div className="flex justify-center pt-2">
          <Button variant="secondary" onClick={handleLoadMore} disabled={loadingMore}>
            {loadingMore ? "Loading..." : `Load More Events (${events.length} loaded)`}
          </Button>
        </div>
      )}
    </div>
  );
}
