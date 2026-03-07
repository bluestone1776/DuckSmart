"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useAuth } from "@/hooks/useAuth";
import { getHuntLog, updateHuntLog, deleteHuntLog } from "@/lib/firestore";
import { formatDate, formatDateTime, getScoreColor } from "@/lib/utils";
import { SPREAD_NAMES } from "@/lib/constants";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import Skeleton from "@/components/ui/Skeleton";
import { ArrowLeft, Pencil, Trash2, X, Check, MapPin } from "lucide-react";
import type { HuntLog } from "@/lib/types";

// Dynamic import — Leaflet cannot run on server
const MiniMap = dynamic(() => import("@/components/ui/MiniMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-40 bg-[#0E0E0E] rounded-[14px] flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-[#2ECC71] border-t-transparent rounded-full animate-spin" />
    </div>
  ),
});

export default function HuntLogDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const logId = params.logId as string;

  const [log, setLog] = useState<HuntLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Edit state
  const [editing, setEditing] = useState(false);
  const [editNotes, setEditNotes] = useState("");
  const [editDucks, setEditDucks] = useState("");
  const [saving, setSaving] = useState(false);

  // Delete state
  const [deleteModal, setDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Photo modal
  const [photoModal, setPhotoModal] = useState<string | null>(null);

  const fetchLog = useCallback(async () => {
    if (!user?.uid || !logId) return;
    setLoading(true);
    try {
      const data = await getHuntLog(user.uid, logId);
      setLog(data);
      if (data) {
        setEditNotes(data.notes || "");
        setEditDucks(String(data.ducksHarvested || 0));
      }
    } catch (err) {
      setError("Failed to load hunt log.");
    } finally {
      setLoading(false);
    }
  }, [user?.uid, logId]);

  useEffect(() => {
    fetchLog();
  }, [fetchLog]);

  async function handleSave() {
    if (!user?.uid || !logId) return;
    setSaving(true);
    try {
      await updateHuntLog(user.uid, logId, {
        notes: editNotes,
        ducksHarvested: parseInt(editDucks) || 0,
      });
      setLog((prev) =>
        prev
          ? { ...prev, notes: editNotes, ducksHarvested: parseInt(editDucks) || 0 }
          : prev
      );
      setEditing(false);
    } catch {
      setError("Failed to save changes.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!user?.uid || !logId) return;
    setDeleting(true);
    try {
      await deleteHuntLog(user.uid, logId);
      router.push("/dashboard/history");
    } catch {
      setError("Failed to delete hunt log.");
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-60" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  if (!log) {
    return (
      <div className="space-y-4">
        <Link
          href="/dashboard/history"
          className="inline-flex items-center gap-2 text-[#8E8E8E] hover:text-white transition-colors font-bold text-sm"
        >
          <ArrowLeft size={16} />
          Back to History
        </Link>
        <div className="bg-[rgba(217,76,76,0.12)] border border-[#D94C4C] rounded-[14px] px-4 py-3">
          <p className="text-[#D94C4C] font-bold text-sm">
            {error || "Hunt log not found."}
          </p>
        </div>
      </div>
    );
  }

  const spreadName = SPREAD_NAMES[log.spread] || log.spreadDetails?.name || "Unknown";
  const scoreColor = getScoreColor(log.huntScore || 0);

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Link
          href="/dashboard/history"
          className="inline-flex items-center gap-2 text-[#8E8E8E] hover:text-white transition-colors font-bold text-sm"
        >
          <ArrowLeft size={16} />
          Back to History
        </Link>
        <div className="flex items-center gap-2">
          {!editing ? (
            <>
              <Button variant="secondary" onClick={() => setEditing(true)}>
                <span className="flex items-center gap-2">
                  <Pencil size={14} />
                  Edit
                </span>
              </Button>
              <button
                onClick={() => setDeleteModal(true)}
                className="rounded-[14px] px-4 py-3 font-black text-sm bg-[rgba(217,76,76,0.12)] border border-[#D94C4C] text-[#D94C4C] hover:brightness-125 transition-all cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <Trash2 size={14} />
                  Delete
                </span>
              </button>
            </>
          ) : (
            <>
              <Button onClick={handleSave} disabled={saving}>
                <span className="flex items-center gap-2">
                  <Check size={14} />
                  {saving ? "Saving..." : "Save"}
                </span>
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setEditing(false);
                  setEditNotes(log.notes || "");
                  setEditDucks(String(log.ducksHarvested || 0));
                }}
              >
                <span className="flex items-center gap-2">
                  <X size={14} />
                  Cancel
                </span>
              </Button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-[rgba(217,76,76,0.12)] border border-[#D94C4C] rounded-[14px] px-4 py-3">
          <p className="text-[#D94C4C] font-bold text-sm">{error}</p>
        </div>
      )}

      {/* Overview */}
      <Card title="Overview">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <div>
            <p className="text-[#6D6D6D] font-bold text-xs uppercase mb-1">Date</p>
            <p className="text-white font-black text-sm">
              {log.dateTime ? formatDateTime(log.dateTime) : formatDate(log.createdAt)}
            </p>
          </div>
          <div>
            <p className="text-[#6D6D6D] font-bold text-xs uppercase mb-1">Environment</p>
            <p className="text-white font-black text-sm">{log.environment || "N/A"}</p>
          </div>
          <div>
            <p className="text-[#6D6D6D] font-bold text-xs uppercase mb-1">Spread</p>
            <p className="text-white font-black text-sm">{spreadName}</p>
          </div>
          <div>
            <p className="text-[#6D6D6D] font-bold text-xs uppercase mb-1">Score</p>
            <p className="font-black text-2xl" style={{ color: scoreColor }}>
              {log.huntScore || 0}
            </p>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-[#2C2C2C]">
          <div>
            <p className="text-[#6D6D6D] font-bold text-xs uppercase mb-1">Ducks Harvested</p>
            {editing ? (
              <Input
                type="number"
                value={editDucks}
                onChange={(e) => setEditDucks(e.target.value)}
                className="max-w-[120px]"
              />
            ) : (
              <p className="text-[#2ECC71] font-black text-2xl">
                {log.ducksHarvested || 0}
              </p>
            )}
          </div>
        </div>
      </Card>

      {/* Spread Details */}
      {log.spreadDetails && (
        <Card title="Spread Details">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {log.spreadDetails.type && (
              <div>
                <p className="text-[#6D6D6D] font-bold text-xs uppercase mb-1">Type</p>
                <p className="text-white font-bold text-sm">{log.spreadDetails.type}</p>
              </div>
            )}
            {log.spreadDetails.decoyCount && (
              <div>
                <p className="text-[#6D6D6D] font-bold text-xs uppercase mb-1">Decoy Count</p>
                <p className="text-white font-bold text-sm">{log.spreadDetails.decoyCount}</p>
              </div>
            )}
            {log.spreadDetails.calling && (
              <div>
                <p className="text-[#6D6D6D] font-bold text-xs uppercase mb-1">Calling</p>
                <p className="text-white font-bold text-sm">{log.spreadDetails.calling}</p>
              </div>
            )}
            {log.spreadDetails.bestTime && (
              <div>
                <p className="text-[#6D6D6D] font-bold text-xs uppercase mb-1">Best Time</p>
                <p className="text-white font-bold text-sm">{log.spreadDetails.bestTime}</p>
              </div>
            )}
            {log.spreadDetails.notes && (
              <div className="col-span-full">
                <p className="text-[#6D6D6D] font-bold text-xs uppercase mb-1">Spread Notes</p>
                <p className="text-[#BDBDBD] font-bold text-sm">{log.spreadDetails.notes}</p>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Notes */}
      <Card title="Notes">
        {editing ? (
          <textarea
            value={editNotes}
            onChange={(e) => setEditNotes(e.target.value)}
            rows={4}
            className="bg-[#0E0E0E] border border-[#3A3A3A] rounded-[14px] px-3 py-2.5 text-white font-extrabold w-full placeholder:text-[#6D6D6D] focus:outline-none focus:border-[#2ECC71] resize-none"
            placeholder="Add notes..."
          />
        ) : (
          <p className="text-[#BDBDBD] font-bold text-sm whitespace-pre-wrap">
            {log.notes || "No notes recorded."}
          </p>
        )}
      </Card>

      {/* Location */}
      {log.location && (
        <Card title="Location">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <MapPin size={18} className="text-[#2ECC71]" />
              <p className="text-[#BDBDBD] font-bold text-sm">
                {log.location.latitude.toFixed(4)}, {log.location.longitude.toFixed(4)}
              </p>
            </div>
            <Link
              href="/dashboard/map"
              className="text-[#2ECC71] hover:underline font-bold text-xs"
            >
              Open in Map
            </Link>
          </div>
          <div className="border border-[#2C2C2C] rounded-[14px] overflow-hidden">
            <MiniMap
              latitude={log.location.latitude}
              longitude={log.location.longitude}
              color={scoreColor}
            />
          </div>
        </Card>
      )}

      {/* Photos */}
      {log.photos && log.photos.length > 0 && (
        <Card title={`Photos (${log.photos.length})`}>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {log.photos.map((photo, idx) => (
              <button
                key={idx}
                onClick={() => setPhotoModal(photo.uri)}
                className="cursor-pointer"
              >
                <img
                  src={photo.uri}
                  alt={`Hunt photo ${idx + 1}`}
                  className="w-full h-32 object-cover rounded-[14px] border border-[#3A3A3A] hover:border-[#2ECC71] transition-colors"
                />
              </button>
            ))}
          </div>
        </Card>
      )}

      {/* Photo Modal */}
      <Modal
        open={!!photoModal}
        onClose={() => setPhotoModal(null)}
        title="Photo"
      >
        {photoModal && (
          <img
            src={photoModal}
            alt="Hunt photo full size"
            className="w-full rounded-[14px]"
          />
        )}
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        open={deleteModal}
        onClose={() => setDeleteModal(false)}
        title="Delete Hunt Log"
      >
        <p className="text-[#BDBDBD] font-bold text-sm mb-6">
          Are you sure you want to delete this hunt log? This action cannot be undone.
          All associated photos will also be permanently deleted.
        </p>
        <div className="flex items-center gap-3 justify-end">
          <Button variant="secondary" onClick={() => setDeleteModal(false)}>
            Cancel
          </Button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="rounded-[14px] px-4 py-3 font-black text-sm bg-[rgba(217,76,76,0.12)] border border-[#D94C4C] text-[#D94C4C] hover:brightness-125 transition-all cursor-pointer disabled:opacity-50"
          >
            {deleting ? "Deleting..." : "Delete Forever"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
