/**
 * Deterministic (non-LLM) matching of a new submission's theme against
 * existing IssueTheme nodes, so the "extract vs decide" line stays clean:
 * the LLM extracts a candidate theme name/summary, plain code decides
 * whether it's the same theme as something already in the graph.
 */
import { runQuery, runWrite } from "./neo4j";
import { canonicalizeBlockName, locationIdFromName } from "./locations";

const STOPWORDS = new Set([
  "the", "a", "an", "of", "in", "on", "at", "to", "for", "and", "or", "is",
  "are", "near", "this", "that", "with", "from", "into", "area", "issue",
]);

function normalizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(normalizeWords(a));
  const setB = new Set(normalizeWords(b));
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const word of setA) if (setB.has(word)) intersection++;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

const MATCH_THRESHOLD = 0.3;

interface ExistingTheme {
  id: string;
  name: string;
  description: string;
}

export interface MatchOrCreateThemeInput {
  issueTheme: string;
  sector: string;
  summary: string;
  locationName: string;
}

export async function matchOrCreateIssueTheme(
  input: MatchOrCreateThemeInput
): Promise<{ id: string; created: boolean; locationId: string; locationName: string }> {
  const locationName = canonicalizeBlockName(input.locationName);
  const locationId = locationIdFromName(locationName);

  const candidates = await runQuery<ExistingTheme>(
    `MATCH (t:IssueTheme)-[:AFFECTS_LOCATION]->(l:Location {id: $locationId})
     WHERE t.sector = $sector
     RETURN t.id AS id, t.name AS name, t.description AS description`,
    { locationId, sector: input.sector }
  );

  let best: { id: string; score: number } | null = null;
  for (const candidate of candidates) {
    const score = Math.max(
      jaccardSimilarity(input.issueTheme, candidate.name),
      jaccardSimilarity(input.summary, candidate.description ?? "")
    );
    if (!best || score > best.score) best = { id: candidate.id, score };
  }

  if (best && best.score >= MATCH_THRESHOLD) {
    await runWrite(
      `MATCH (t:IssueTheme {id: $id}) SET t.submissionCount = coalesce(t.submissionCount, 0) + 1`,
      { id: best.id }
    );
    return { id: best.id, created: false, locationId, locationName };
  }

  const id = `theme-${locationId}-${input.sector}-${Date.now().toString(36)}`;
  await runWrite(
    `MERGE (l:Location {id: $locationId})
       ON CREATE SET l.name = $locationName, l.type = 'block'
     WITH l
     MERGE (t:IssueTheme {id: $id})
     SET t.name = $name, t.sector = $sector, t.description = $description, t.submissionCount = 1
     MERGE (t)-[:AFFECTS_LOCATION]->(l)`,
    {
      id,
      name: input.issueTheme,
      sector: input.sector,
      description: input.summary,
      locationId,
      locationName,
    }
  );
  return { id, created: true, locationId, locationName };
}
