"use client";

import { useEffect, useState } from "react";
import { getAllFeedback, updateFeedbackStatus } from "@/lib/firestore";
import { formatDateTime } from "@/lib/utils";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Badge from "@/components/ui/Badge";
import Chip from "@/components/ui/Chip";
import Button from "@/components/ui/Button";
import Skeleton from "@/components/ui/Skeleton";
import EmptyState from "@/components/ui/EmptyState";
import { MessageSquare, Check, Clock } from "lucide-react";
import type { FeedbackTicket } from "@/lib/types";

export default function AdminFeedbackPage() {
  const [tickets, setTickets] = useState<FeedbackTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    async function fetchFeedback() {
      try {
        const data = await getAllFeedback();
        setTickets(data);
      } catch (err) {
        console.error("Failed to fetch feedback:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchFeedback();
  }, []);

  async function toggleStatus(ticket: FeedbackTicket) {
    const newStatus = ticket.status === "pending" ? "resolved" : "pending";
    setUpdatingId(ticket.id);
    try {
      await updateFeedbackStatus(ticket.id, newStatus);
      setTickets((prev) =>
        prev.map((t) => (t.id === ticket.id ? { ...t, status: newStatus } : t))
      );
    } catch (err) {
      console.error("Failed to update status:", err);
    } finally {
      setUpdatingId(null);
    }
  }

  const filtered = tickets.filter((t) => {
    const matchesSearch =
      !search.trim() ||
      t.message.toLowerCase().includes(search.toLowerCase()) ||
      t.email.toLowerCase().includes(search.toLowerCase()) ||
      t.category.toLowerCase().includes(search.toLowerCase());
    const matchesStatus =
      statusFilter === "all" || t.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const pendingCount = tickets.filter((t) => t.status === "pending").length;
  const resolvedCount = tickets.filter((t) => t.status === "resolved").length;

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-white font-black text-2xl">Feedback</h1>
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-white font-black text-2xl">Feedback</h1>
        <div className="flex items-center gap-3">
          <span className="text-[#D9A84C] font-bold text-sm">
            {pendingCount} pending
          </span>
          <span className="text-[#2ECC71] font-bold text-sm">
            {resolvedCount} resolved
          </span>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <Input
            placeholder="Search feedback..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <Chip
            label="All"
            selected={statusFilter === "all"}
            onClick={() => setStatusFilter("all")}
          />
          <Chip
            label="Pending"
            selected={statusFilter === "pending"}
            onClick={() => setStatusFilter("pending")}
          />
          <Chip
            label="Resolved"
            selected={statusFilter === "resolved"}
            onClick={() => setStatusFilter("resolved")}
          />
        </div>
      </div>

      {/* Ticket list */}
      {filtered.length === 0 ? (
        <EmptyState
          icon="💬"
          title="No feedback found"
          description={
            tickets.length === 0
              ? "No feedback has been submitted yet."
              : "No feedback matches your filters."
          }
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((ticket) => (
            <Card key={ticket.id}>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge
                      label={ticket.status}
                      color={ticket.status === "pending" ? "yellow" : "green"}
                    />
                    <Badge label={ticket.category} color="green" />
                    <span className="text-[#6D6D6D] font-bold text-[10px]">
                      {ticket.platform}
                    </span>
                  </div>

                  <p className="text-[#BDBDBD] font-bold text-sm whitespace-pre-wrap mb-2">
                    {ticket.message}
                  </p>

                  <div className="flex items-center gap-4">
                    <span className="text-[#6D6D6D] font-bold text-xs">
                      {ticket.email}
                    </span>
                    <span className="text-[#6D6D6D] font-bold text-xs">
                      {ticket.createdAt
                        ? formatDateTime(ticket.createdAt)
                        : ticket.timestamp
                        ? formatDateTime(ticket.timestamp)
                        : "N/A"}
                    </span>
                  </div>
                </div>

                <Button
                  variant="secondary"
                  onClick={() => toggleStatus(ticket)}
                  disabled={updatingId === ticket.id}
                  className="flex-shrink-0"
                >
                  <span className="flex items-center gap-2">
                    {ticket.status === "pending" ? (
                      <>
                        <Check size={14} />
                        Resolve
                      </>
                    ) : (
                      <>
                        <Clock size={14} />
                        Reopen
                      </>
                    )}
                  </span>
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
