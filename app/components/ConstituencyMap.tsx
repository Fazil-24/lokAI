"use client";

import { MapContainer, TileLayer, CircleMarker, Tooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { CONSTITUENCY_CENTER } from "@/lib/geo";

export interface MapLocation {
  id: string;
  name: string;
  lat: number;
  lng: number;
  submissionCount: number;
  sanctionedWorksCount: number;
  issueThemeCount: number;
  demandScore: number;
}

export function ConstituencyMap({
  locations,
  selectedLocationId,
  onSelectLocation,
}: {
  locations: MapLocation[];
  selectedLocationId?: string | null;
  onSelectLocation?: (id: string) => void;
}) {
  const maxDemand = Math.max(1, ...locations.map((l) => l.demandScore));

  return (
    <MapContainer
      center={[CONSTITUENCY_CENTER.lat, CONSTITUENCY_CENTER.lng]}
      zoom={9}
      scrollWheelZoom={false}
      style={{ height: "100%", width: "100%", minHeight: 360, borderRadius: 16 }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {locations.map((loc) => {
        const intensity = loc.demandScore / maxDemand;
        const radius = 9 + intensity * 22;
        const color = intensity > 0.66 ? "#dc2626" : intensity > 0.33 ? "#c1af8b" : "#8a7f61";
        const isSelected = loc.id === selectedLocationId;
        return (
          <CircleMarker
            key={loc.id}
            center={[loc.lat, loc.lng]}
            radius={radius}
            pathOptions={{
              color,
              fillColor: color,
              fillOpacity: isSelected ? 0.85 : 0.5,
              weight: isSelected ? 3 : 1,
            }}
            eventHandlers={{ click: () => onSelectLocation?.(loc.id) }}
          >
            <Tooltip direction="top">
              <div className="text-sm">
                <strong>{loc.name}</strong>
                <br />
                {loc.submissionCount} submissions · {loc.issueThemeCount} issue themes
                <br />
                {loc.sanctionedWorksCount} sanctioned works
              </div>
            </Tooltip>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
