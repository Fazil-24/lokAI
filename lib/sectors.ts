/** All Sector nodes seeded in the graph, independent of which ones the MPLADS CSV happens to touch. */
export const ALL_SECTORS = [
  "roads",
  "water",
  "lighting",
  "community",
  "health",
  "education",
  "other",
] as const;

export type Sector = (typeof ALL_SECTORS)[number];

const SECTOR_KEYWORDS: Record<Exclude<Sector, "other">, RegExp> = {
  roads: /road|pathway|approach road/i,
  lighting: /lighting|street light/i,
  water: /drain|gutter|water|drinking water/i,
  community: /community center|community hall|boundary wall/i,
  health: /semen bank|health|hospital/i,
  education: /school|anganwadi|college|classroom/i,
};

export function deriveSector(work: string): Sector {
  for (const [sector, re] of Object.entries(SECTOR_KEYWORDS) as [
    Exclude<Sector, "other">,
    RegExp,
  ][]) {
    if (re.test(work)) return sector;
  }
  return "other";
}
