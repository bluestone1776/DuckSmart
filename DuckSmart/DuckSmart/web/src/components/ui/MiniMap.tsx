"use client";

import {
  MapContainer,
  TileLayer,
  CircleMarker,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";

interface MiniMapProps {
  latitude: number;
  longitude: number;
  color?: string;
  height?: number;
}

export default function MiniMap({
  latitude,
  longitude,
  color = "#2ECC71",
  height = 160,
}: MiniMapProps) {
  return (
    <MapContainer
      center={[latitude, longitude]}
      zoom={13}
      className="w-full rounded-[14px]"
      style={{ height, background: "#0E0E0E" }}
      zoomControl={false}
      attributionControl={false}
      dragging={false}
      scrollWheelZoom={false}
      doubleClickZoom={false}
      touchZoom={false}
    >
      <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
      <CircleMarker
        center={[latitude, longitude]}
        radius={8}
        pathOptions={{
          color,
          fillColor: color,
          fillOpacity: 0.8,
          weight: 2,
        }}
      />
    </MapContainer>
  );
}
