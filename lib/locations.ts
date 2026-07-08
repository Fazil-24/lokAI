/**
 * The MPLADS CSV spells the same block inconsistently across rows
 * (e.g. "HOSKOTE" vs "Hosakote"). This canonicalizes known variants
 * so they collapse into a single Location node instead of duplicates.
 */
const BLOCK_ALIASES: Record<string, string> = {
  hoskote: "Hosakote",
  hosakote: "Hosakote",
  devanhalli: "Devanahalli",
  devanahalli: "Devanahalli",
  chikballapur: "Chikkaballapura",
  chikkaballapura: "Chikkaballapura",
  "chik ballapur": "Chikkaballapura",
  "dodda ballapur": "Dodda Ballapur",
  magadi: "Magadi",
  nelamangala: "Nelamangala",
  gudibanda: "Gudibanda",
  bagepalli: "Bagepalli",
};

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split(/\s+/)
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
    .join(" ");
}

/** Resolves a raw BLOCK/VILLAGE/CITY value to a canonical block-level location name. */
export function canonicalizeBlockName(raw: string | undefined | null): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return "Unspecified";
  const key = trimmed.toLowerCase();
  return BLOCK_ALIASES[key] ?? titleCase(trimmed);
}

export function locationIdFromName(name: string): string {
  return (
    "loc-" +
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
  );
}
