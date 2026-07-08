/**
 * Approximate town-center coordinates for the 8 seeded blocks. The CSV has
 * no ward-level shapefiles at this resolution, so per the spec this is a
 * deliberately "stylized" map (town-center points, not precise boundaries)
 * rather than blocking the build on missing GeoJSON.
 */
export const BLOCK_COORDINATES: Record<string, { lat: number; lng: number }> = {
  "loc-hosakote": { lat: 13.0707, lng: 77.7996 },
  "loc-devanahalli": { lat: 13.2417, lng: 77.7137 },
  "loc-dodda-ballapur": { lat: 13.2946, lng: 77.535 },
  "loc-chikkaballapura": { lat: 13.4351, lng: 77.7315 },
  "loc-magadi": { lat: 12.9639, lng: 77.2247 },
  "loc-nelamangala": { lat: 13.1004, lng: 77.3956 },
  "loc-gudibanda": { lat: 13.8814, lng: 77.8386 },
  "loc-bagepalli": { lat: 13.7833, lng: 77.7833 },
};

/** Centroid of the known blocks, used to default the map view. */
export const CONSTITUENCY_CENTER = { lat: 13.28, lng: 77.62 };
