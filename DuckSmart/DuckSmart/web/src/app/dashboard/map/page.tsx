"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useAuth } from "@/hooks/useAuth";
import { useHuntLogs } from "@/hooks/useHuntLogs";
import { usePins } from "@/hooks/usePins";
import { createPin, updatePin, deletePin } from "@/lib/firestore";
import { PIN_TYPES } from "@/lib/constants";
import { getPinColor } from "@/lib/utils";
import Skeleton from "@/components/ui/Skeleton";
import EmptyState from "@/components/ui/EmptyState";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import {
  Plus,
  X,
  Check,
  Pencil,
  Trash2,
  MapPin as MapPinIcon,
  Crosshair,
} from "lucide-react";
import type { MapPin } from "@/lib/types";

// Dynamic import — Leaflet cannot run on server
const MapViewInner = dynamic(() => import("./MapViewInner"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-[#0E0E0E] rounded-[18px] flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-[#2ECC71] border-t-transparent rounded-full animate-spin" />
    </div>
  ),
});

type Mode = "view" | "add" | "detail" | "edit";

export default function MapPage() {
  const { user } = useAuth();
  const { logs, loading: logsLoading } = useHuntLogs();
  const { pins, loading: pinsLoading, refetch: refetchPins } = usePins();

  // Layer toggles
  const [showLogs, setShowLogs] = useState(true);
  const [showPins, setShowPins] = useState(true);
  const [pinTypeFilters, setPinTypeFilters] = useState<string[]>([]);

  // CRUD state
  const [mode, setMode] = useState<Mode>("view");
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);
  const [draftPosition, setDraftPosition] = useState<[number, number] | null>(
    null
  );

  // Form fields
  const [formTitle, setFormTitle] = useState("");
  const [formType, setFormType] = useState<string>(PIN_TYPES[0].key);
  const [formNotes, setFormNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Delete confirmation
  const [deleteModal, setDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const loading = logsLoading || pinsLoading;
  const selectedPin = pins.find((p) => p.id === selectedPinId) || null;

  function togglePinType(key: string) {
    setPinTypeFilters((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }

  // ── Mode transitions ────────────────────────────────────────────────

  function startAddMode() {
    setMode("add");
    setSelectedPinId(null);
    setDraftPosition(null);
    setFormTitle("");
    setFormType(PIN_TYPES[0].key);
    setFormNotes("");
    setError("");
  }

  function cancelAdd() {
    setMode("view");
    setDraftPosition(null);
    setError("");
  }

  function selectPin(pinId: string) {
    if (mode === "add") return; // don't interrupt add mode
    setMode("detail");
    setSelectedPinId(pinId);
    setError("");
  }

  function startEditMode() {
    if (!selectedPin) return;
    setMode("edit");
    setFormTitle(selectedPin.title);
    setFormType(selectedPin.type);
    setFormNotes(selectedPin.notes || "");
    setError("");
  }

  function cancelEdit() {
    setMode("detail");
    setError("");
  }

  function closeDetail() {
    setMode("view");
    setSelectedPinId(null);
    setError("");
  }

  // ── Map click handler ───────────────────────────────────────────────

  function handleMapClick(lat: number, lng: number) {
    if (mode === "add") {
      setDraftPosition([lat, lng]);
    } else if (mode === "view") {
      // Deselect pin when clicking empty map
      setSelectedPinId(null);
    }
  }

  // ── CRUD operations ─────────────────────────────────────────────────

  async function handleSaveNewPin() {
    if (!user?.uid || !draftPosition) return;
    if (!formTitle.trim()) {
      setError("Title is required.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const newPin: MapPin = {
        id: `pin-${Date.now()}`,
        title: formTitle.trim(),
        type: formType,
        notes: formNotes.trim(),
        coordinate: {
          latitude: draftPosition[0],
          longitude: draftPosition[1],
        },
        createdAt: Date.now(),
      };
      await createPin(user.uid, newPin);
      await refetchPins();
      setMode("view");
      setDraftPosition(null);
    } catch {
      setError("Failed to save pin. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdatePin() {
    if (!user?.uid || !selectedPinId) return;
    if (!formTitle.trim()) {
      setError("Title is required.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      await updatePin(user.uid, selectedPinId, {
        title: formTitle.trim(),
        type: formType,
        notes: formNotes.trim(),
      });
      await refetchPins();
      setMode("detail");
    } catch {
      setError("Failed to update pin. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeletePin() {
    if (!user?.uid || !selectedPinId) return;
    setDeleting(true);
    try {
      await deletePin(user.uid, selectedPinId);
      await refetchPins();
      setDeleteModal(false);
      setMode("view");
      setSelectedPinId(null);
    } catch {
      setError("Failed to delete pin. Please try again.");
    } finally {
      setDeleting(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────

  const hasData =
    logs.some((l) => l.location?.latitude && l.location?.longitude) ||
    pins.some((p) => p.coordinate?.latitude && p.coordinate?.longitude);

  if (loading) {
    return (
      <div className="space-y-4">
        <h1 className="text-white font-black text-2xl">Map</h1>
        <Skeleton className="h-[calc(100vh-10rem)]" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Page header with Add Pin button */}
      <div className="flex items-center justify-between">
        <h1 className="text-white font-black text-2xl">Map</h1>
        {(mode === "view") && (
          <Button onClick={startAddMode}>
            <span className="flex items-center gap-2">
              <Plus size={14} />
              Add Pin
            </span>
          </Button>
        )}
        {mode === "add" && !hasData && (
          <Button variant="secondary" onClick={cancelAdd}>
            Cancel
          </Button>
        )}
      </div>

      {!hasData && mode === "view" ? (
        <EmptyState
          icon="🗺️"
          title="No map data yet"
          description="Your hunt locations and pins will appear on the map once you start logging in the app, or add a pin using the button above."
        />
      ) : !hasData && mode === "add" ? (
        <div className="relative">
          {/* Empty map for first pin placement */}
          <div
            className="border border-[#3A3A3A] rounded-[18px] overflow-hidden"
            style={{ height: "calc(100vh - 12rem)" }}
          >
            <MapViewInner
              logs={[]}
              pins={[]}
              showLogs={false}
              showPins={false}
              pinTypeFilters={[]}
              selectedPinId={null}
              draftPosition={draftPosition}
              onMapClick={handleMapClick}
              onPinClick={selectPin}
            />
          </div>

          {/* Add Pin panel */}
          <div className="absolute bottom-4 left-4 z-[1000] bg-[#141414]/95 backdrop-blur border border-[#3A3A3A] rounded-[18px] p-4 w-[320px]">
            <div className="flex items-center justify-between mb-3">
              <p className="text-white font-black text-sm">Add Your First Pin</p>
              <button
                onClick={cancelAdd}
                className="text-[#8E8E8E] hover:text-white cursor-pointer transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {!draftPosition ? (
              <div className="flex items-center gap-2 py-4">
                <Crosshair
                  size={16}
                  className="text-[#2ECC71] animate-pulse"
                />
                <p className="text-[#8E8E8E] font-bold text-sm">
                  Click on the map to place your pin
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-[#6D6D6D] font-bold text-xs">
                  {draftPosition[0].toFixed(4)},{" "}
                  {draftPosition[1].toFixed(4)}
                </p>

                <Input
                  label="Title"
                  placeholder="e.g. North Pond Blind"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                />

                <div>
                  <p className="text-[#8E8E8E] text-xs font-black mb-2">
                    Type
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {PIN_TYPES.map((pt) => (
                      <button
                        key={pt.key}
                        onClick={() => setFormType(pt.key)}
                        className={`text-[11px] font-bold px-2.5 py-1.5 rounded-full border transition-colors cursor-pointer ${
                          formType === pt.key
                            ? "border-current"
                            : "border-[#3A3A3A] opacity-50"
                        }`}
                        style={{ color: pt.color }}
                      >
                        {pt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-[#8E8E8E] text-xs font-black mb-2">
                    Notes
                  </p>
                  <textarea
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    rows={2}
                    placeholder="Optional notes..."
                    className="bg-[#0E0E0E] border border-[#3A3A3A] rounded-[14px] px-3 py-2.5 text-white font-extrabold w-full placeholder:text-[#6D6D6D] focus:outline-none focus:border-[#2ECC71] resize-none text-sm"
                  />
                </div>

                {error && (
                  <p className="text-[#D94C4C] font-bold text-xs">{error}</p>
                )}

                <div className="flex items-center gap-2">
                  <Button
                    onClick={handleSaveNewPin}
                    disabled={saving}
                    className="flex-1"
                  >
                    <span className="flex items-center justify-center gap-2">
                      <Check size={14} />
                      {saving ? "Saving..." : "Save Pin"}
                    </span>
                  </Button>
                  <Button variant="secondary" onClick={cancelAdd}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="relative">
          {/* Map */}
          <div
            className="border border-[#3A3A3A] rounded-[18px] overflow-hidden"
            style={{ height: "calc(100vh - 12rem)" }}
          >
            <MapViewInner
              logs={logs}
              pins={pins}
              showLogs={showLogs}
              showPins={showPins}
              pinTypeFilters={pinTypeFilters}
              selectedPinId={selectedPinId}
              draftPosition={draftPosition}
              onMapClick={handleMapClick}
              onPinClick={selectPin}
            />
          </div>

          {/* ════════ Filter / Layers panel (top-right) ════════ */}
          <div className="absolute top-4 right-4 z-[1000] bg-[#141414]/95 backdrop-blur border border-[#3A3A3A] rounded-[18px] p-4 max-w-[240px]">
            <p className="text-white font-black text-sm mb-3">Layers</p>

            <div className="flex flex-col gap-2 mb-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showLogs}
                  onChange={() => setShowLogs(!showLogs)}
                  className="accent-[#2ECC71]"
                />
                <span className="text-[#BDBDBD] font-bold text-sm">
                  Hunt Logs (
                  {logs.filter((l) => l.location?.latitude).length})
                </span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showPins}
                  onChange={() => setShowPins(!showPins)}
                  className="accent-[#2ECC71]"
                />
                <span className="text-[#BDBDBD] font-bold text-sm">
                  Pins ({pins.filter((p) => p.coordinate?.latitude).length})
                </span>
              </label>
            </div>

            {showPins && (
              <>
                <div className="border-t border-[#3A3A3A] my-2" />
                <p className="text-[#8E8E8E] font-bold text-xs mb-2">
                  Pin Types
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {PIN_TYPES.map((pt) => (
                    <button
                      key={pt.key}
                      onClick={() => togglePinType(pt.key)}
                      className={`text-[11px] font-bold px-2 py-1 rounded-full border transition-colors cursor-pointer ${
                        pinTypeFilters.length === 0 ||
                        pinTypeFilters.includes(pt.key)
                          ? "border-current opacity-100"
                          : "border-[#3A3A3A] opacity-40"
                      }`}
                      style={{ color: pt.color }}
                    >
                      {pt.label}
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* Legend */}
            <div className="border-t border-[#3A3A3A] mt-3 pt-2">
              <p className="text-[#6D6D6D] font-bold text-[10px] uppercase mb-1">
                Legend
              </p>
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#2ECC71]" />
                  <span className="text-[#8E8E8E] text-[11px] font-bold">
                    High Score (70+)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#D9A84C]" />
                  <span className="text-[#8E8E8E] text-[11px] font-bold">
                    Mid Score (40-69)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#D94C4C]" />
                  <span className="text-[#8E8E8E] text-[11px] font-bold">
                    {"Low Score (<40)"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ════════ Add Pin panel (bottom-left) ════════ */}
          {mode === "add" && (
            <div className="absolute bottom-4 left-4 z-[1000] bg-[#141414]/95 backdrop-blur border border-[#3A3A3A] rounded-[18px] p-4 w-[320px]">
              <div className="flex items-center justify-between mb-3">
                <p className="text-white font-black text-sm">Add New Pin</p>
                <button
                  onClick={cancelAdd}
                  className="text-[#8E8E8E] hover:text-white cursor-pointer transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              {!draftPosition ? (
                <div className="flex items-center gap-2 py-4">
                  <Crosshair
                    size={16}
                    className="text-[#2ECC71] animate-pulse"
                  />
                  <p className="text-[#8E8E8E] font-bold text-sm">
                    Click on the map to place your pin
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-[#6D6D6D] font-bold text-xs">
                    {draftPosition[0].toFixed(4)},{" "}
                    {draftPosition[1].toFixed(4)}
                  </p>

                  <Input
                    label="Title"
                    placeholder="e.g. North Pond Blind"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                  />

                  <div>
                    <p className="text-[#8E8E8E] text-xs font-black mb-2">
                      Type
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {PIN_TYPES.map((pt) => (
                        <button
                          key={pt.key}
                          onClick={() => setFormType(pt.key)}
                          className={`text-[11px] font-bold px-2.5 py-1.5 rounded-full border transition-colors cursor-pointer ${
                            formType === pt.key
                              ? "border-current"
                              : "border-[#3A3A3A] opacity-50"
                          }`}
                          style={{ color: pt.color }}
                        >
                          {pt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-[#8E8E8E] text-xs font-black mb-2">
                      Notes
                    </p>
                    <textarea
                      value={formNotes}
                      onChange={(e) => setFormNotes(e.target.value)}
                      rows={2}
                      placeholder="Optional notes..."
                      className="bg-[#0E0E0E] border border-[#3A3A3A] rounded-[14px] px-3 py-2.5 text-white font-extrabold w-full placeholder:text-[#6D6D6D] focus:outline-none focus:border-[#2ECC71] resize-none text-sm"
                    />
                  </div>

                  {error && (
                    <p className="text-[#D94C4C] font-bold text-xs">{error}</p>
                  )}

                  <div className="flex items-center gap-2">
                    <Button
                      onClick={handleSaveNewPin}
                      disabled={saving}
                      className="flex-1"
                    >
                      <span className="flex items-center justify-center gap-2">
                        <Check size={14} />
                        {saving ? "Saving..." : "Save Pin"}
                      </span>
                    </Button>
                    <Button variant="secondary" onClick={cancelAdd}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ════════ Pin Detail panel (bottom-left) ════════ */}
          {mode === "detail" && selectedPin && (
            <div className="absolute bottom-4 left-4 z-[1000] bg-[#141414]/95 backdrop-blur border border-[#3A3A3A] rounded-[18px] p-4 w-[320px]">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{
                      backgroundColor: getPinColor(selectedPin.type),
                    }}
                  />
                  <p className="text-white font-black text-sm">
                    {selectedPin.title}
                  </p>
                </div>
                <button
                  onClick={closeDetail}
                  className="text-[#8E8E8E] hover:text-white cursor-pointer transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <MapPinIcon size={12} className="text-[#6D6D6D]" />
                  <span className="text-[#8E8E8E] font-bold text-xs">
                    {PIN_TYPES.find((p) => p.key === selectedPin.type)
                      ?.label || selectedPin.type}
                  </span>
                </div>

                <p className="text-[#6D6D6D] font-bold text-xs">
                  {selectedPin.coordinate?.latitude?.toFixed(4)},{" "}
                  {selectedPin.coordinate?.longitude?.toFixed(4)}
                </p>

                {selectedPin.notes && (
                  <p className="text-[#BDBDBD] font-bold text-xs mt-2">
                    {selectedPin.notes}
                  </p>
                )}

                {error && (
                  <p className="text-[#D94C4C] font-bold text-xs">{error}</p>
                )}

                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[#2C2C2C]">
                  <Button
                    variant="secondary"
                    onClick={startEditMode}
                    className="flex-1"
                  >
                    <span className="flex items-center justify-center gap-2">
                      <Pencil size={12} />
                      Edit
                    </span>
                  </Button>
                  <button
                    onClick={() => setDeleteModal(true)}
                    className="rounded-[14px] px-4 py-3 font-black text-sm bg-[rgba(217,76,76,0.12)] border border-[#D94C4C] text-[#D94C4C] hover:brightness-125 transition-all cursor-pointer"
                  >
                    <span className="flex items-center gap-2">
                      <Trash2 size={12} />
                      Delete
                    </span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ════════ Pin Edit panel (bottom-left) ════════ */}
          {mode === "edit" && selectedPin && (
            <div className="absolute bottom-4 left-4 z-[1000] bg-[#141414]/95 backdrop-blur border border-[#3A3A3A] rounded-[18px] p-4 w-[320px]">
              <div className="flex items-center justify-between mb-3">
                <p className="text-white font-black text-sm">Edit Pin</p>
                <button
                  onClick={cancelEdit}
                  className="text-[#8E8E8E] hover:text-white cursor-pointer transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-3">
                <Input
                  label="Title"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                />

                <div>
                  <p className="text-[#8E8E8E] text-xs font-black mb-2">
                    Type
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {PIN_TYPES.map((pt) => (
                      <button
                        key={pt.key}
                        onClick={() => setFormType(pt.key)}
                        className={`text-[11px] font-bold px-2.5 py-1.5 rounded-full border transition-colors cursor-pointer ${
                          formType === pt.key
                            ? "border-current"
                            : "border-[#3A3A3A] opacity-50"
                        }`}
                        style={{ color: pt.color }}
                      >
                        {pt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-[#8E8E8E] text-xs font-black mb-2">
                    Notes
                  </p>
                  <textarea
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    rows={2}
                    placeholder="Optional notes..."
                    className="bg-[#0E0E0E] border border-[#3A3A3A] rounded-[14px] px-3 py-2.5 text-white font-extrabold w-full placeholder:text-[#6D6D6D] focus:outline-none focus:border-[#2ECC71] resize-none text-sm"
                  />
                </div>

                {error && (
                  <p className="text-[#D94C4C] font-bold text-xs">{error}</p>
                )}

                <div className="flex items-center gap-2">
                  <Button
                    onClick={handleUpdatePin}
                    disabled={saving}
                    className="flex-1"
                  >
                    <span className="flex items-center justify-center gap-2">
                      <Check size={14} />
                      {saving ? "Saving..." : "Save Changes"}
                    </span>
                  </Button>
                  <Button variant="secondary" onClick={cancelEdit}>
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Delete confirmation modal */}
      <Modal
        open={deleteModal}
        onClose={() => setDeleteModal(false)}
        title="Delete Pin"
      >
        <p className="text-[#BDBDBD] font-bold text-sm mb-6">
          Are you sure you want to delete &ldquo;{selectedPin?.title}
          &rdquo;? This action cannot be undone.
        </p>
        <div className="flex items-center gap-3 justify-end">
          <Button variant="secondary" onClick={() => setDeleteModal(false)}>
            Cancel
          </Button>
          <button
            onClick={handleDeletePin}
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
