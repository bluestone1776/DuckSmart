"use client";

import { useEffect } from "react";
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Popup,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { formatDate, getScoreColor, getPinColor } from "@/lib/utils";
import { PIN_TYPES } from "@/lib/constants";
import type { HuntLog, MapPin } from "@/lib/types";

// Fix default marker icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

interface MapViewInnerProps {
  logs: HuntLog[];
  pins: MapPin[];
  showLogs: boolean;
  showPins: boolean;
  pinTypeFilters: string[];
  selectedPinId?: string | null;
  draftPosition?: [number, number] | null;
  onMapClick?: (lat: number, lng: number) => void;
  onPinClick?: (pinId: string) => void;
}

function FitBounds({
  logs,
  pins,
  showLogs,
  showPins,
}: {
  logs: HuntLog[];
  pins: MapPin[];
  showLogs: boolean;
  showPins: boolean;
}) {
  const map = useMap();

  useEffect(() => {
    const points: [number, number][] = [];

    if (showLogs) {
      logs.forEach((l) => {
        if (l.location?.latitude && l.location?.longitude) {
          points.push([l.location.latitude, l.location.longitude]);
        }
      });
    }

    if (showPins) {
      pins.forEach((p) => {
        if (p.coordinate?.latitude && p.coordinate?.longitude) {
          points.push([p.coordinate.latitude, p.coordinate.longitude]);
        }
      });
    }

    if (points.length > 0) {
      const bounds = L.latLngBounds(points.map(([lat, lng]) => [lat, lng]));
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
    }
  }, [logs, pins, showLogs, showPins, map]);

  return null;
}

function MapClickHandler({
  onMapClick,
}: {
  onMapClick: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function MapViewInner({
  logs,
  pins,
  showLogs,
  showPins,
  pinTypeFilters,
  selectedPinId,
  draftPosition,
  onMapClick,
  onPinClick,
}: MapViewInnerProps) {
  const filteredPins =
    pinTypeFilters.length === 0
      ? pins
      : pins.filter((p) => pinTypeFilters.includes(p.type));

  return (
    <MapContainer
      center={[39.8283, -98.5795]}
      zoom={4}
      className="w-full h-full"
      style={{ background: "#0E0E0E" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://carto.com/">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
      />

      <FitBounds logs={logs} pins={pins} showLogs={showLogs} showPins={showPins} />

      {/* Map click handler — active only when callback is provided */}
      {onMapClick && <MapClickHandler onMapClick={onMapClick} />}

      {/* Hunt log markers */}
      {showLogs &&
        logs.map((log) => {
          if (!log.location?.latitude || !log.location?.longitude) return null;
          const color = getScoreColor(log.huntScore || 0);
          return (
            <CircleMarker
              key={`log-${log.id}`}
              center={[log.location.latitude, log.location.longitude]}
              radius={8}
              pathOptions={{
                color,
                fillColor: color,
                fillOpacity: 0.7,
                weight: 2,
              }}
            >
              <Popup>
                <div style={{ minWidth: 160, fontSize: 12 }}>
                  <p style={{ fontWeight: 800, fontSize: 13, marginBottom: 4 }}>
                    {log.dateTime
                      ? formatDate(log.dateTime)
                      : formatDate(log.createdAt)}
                  </p>
                  <p><strong>Environment:</strong> {log.environment}</p>
                  <p><strong>Score:</strong> {log.huntScore || 0}</p>
                  <p><strong>Ducks:</strong> {log.ducksHarvested || 0}</p>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}

      {/* Pin markers */}
      {showPins &&
        filteredPins.map((pin) => {
          if (!pin.coordinate?.latitude || !pin.coordinate?.longitude) return null;
          const color = getPinColor(pin.type);
          const pinType = PIN_TYPES.find((p) => p.key === pin.type);
          const isSelected = selectedPinId === pin.id;
          return (
            <CircleMarker
              key={`pin-${pin.id}`}
              center={[pin.coordinate.latitude, pin.coordinate.longitude]}
              radius={isSelected ? 10 : 7}
              pathOptions={{
                color: isSelected ? "#FFFFFF" : color,
                fillColor: color,
                fillOpacity: isSelected ? 1 : 0.8,
                weight: isSelected ? 3 : 2,
              }}
              eventHandlers={{
                click: (e) => {
                  if (onPinClick) {
                    L.DomEvent.stopPropagation(e.originalEvent);
                    onPinClick(pin.id);
                  }
                },
              }}
            >
              {!onPinClick && (
                <Popup>
                  <div style={{ minWidth: 140, fontSize: 12 }}>
                    <p style={{ fontWeight: 800, fontSize: 13, marginBottom: 4 }}>
                      {pin.title}
                    </p>
                    <p><strong>Type:</strong> {pinType?.label || pin.type}</p>
                    {pin.notes && (
                      <p style={{ marginTop: 4, color: "#666" }}>{pin.notes}</p>
                    )}
                  </div>
                </Popup>
              )}
            </CircleMarker>
          );
        })}

      {/* Draft pin marker (while placing a new pin) */}
      {draftPosition && (
        <CircleMarker
          center={draftPosition}
          radius={10}
          pathOptions={{
            color: "#FFFFFF",
            fillColor: "#2ECC71",
            fillOpacity: 0.9,
            weight: 3,
            dashArray: "5 5",
          }}
        />
      )}
    </MapContainer>
  );
}
