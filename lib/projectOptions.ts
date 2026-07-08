import { runQuery, runWrite, toNumber } from "./neo4j";
import { reasonExtractJson } from "./reason";
import { evaluateFeasibility } from "./schemeRules";

interface ThemeContext {
  id: string;
  name: string;
  sector: string;
  description: string | null;
  submissionCount: number;
  locationId: string;
  locationName: string;
}

interface NearbyWork {
  workName: string;
  amount: number;
}

interface CandidateProject {
  name: string;
  description: string;
  estimatedCost: number;
  rationale: string;
}

async function fetchThemeContext(themeId: string): Promise<ThemeContext | null> {
  const rows = await runQuery<{
    id: string;
    name: string;
    sector: string;
    description: string | null;
    submissionCount: unknown;
    locationId: string;
    locationName: string;
  }>(
    `MATCH (t:IssueTheme {id: $themeId})-[:AFFECTS_LOCATION]->(l:Location)
     RETURN t.id AS id, t.name AS name, t.sector AS sector, t.description AS description,
            coalesce(t.submissionCount, 0) AS submissionCount, l.id AS locationId, l.name AS locationName`,
    { themeId }
  );
  const row = rows[0];
  if (!row) return null;
  return { ...row, submissionCount: toNumber(row.submissionCount) };
}

async function fetchNearbyWorks(locationId: string): Promise<NearbyWork[]> {
  const rows = await runQuery<{ workName: string; amount: unknown }>(
    `MATCH (sw:SanctionedWork)-[:LOCATED_IN]->(:Location {id: $locationId})
     RETURN DISTINCT sw.workName AS workName, sw.amount AS amount
     ORDER BY sw.amount DESC LIMIT 5`,
    { locationId }
  );
  return rows.map((r) => ({ workName: r.workName, amount: toNumber(r.amount) }));
}

function buildProjectGenerationPrompt(theme: ThemeContext, nearbyWorks: NearbyWork[]): string {
  const worksText =
    nearbyWorks.length > 0
      ? nearbyWorks.map((w) => `- ${w.workName} (₹${w.amount.toLocaleString("en-IN")})`).join("\n")
      : "(none on record)";

  return `A civic issue theme has been reported repeatedly in ${theme.locationName}, Chikballapur constituency, Karnataka.

Theme: ${theme.name}
Sector: ${theme.sector}
Summary: ${theme.description || "(no summary)"}
Number of citizen reports: ${theme.submissionCount}

Already-recommended government (MPLADS) works at this location, for cost calibration:
${worksText}

Propose 2-3 distinct, concrete candidate infrastructure projects that could address this issue. Ground estimated costs in the scale of the works listed above where relevant (Indian Rupees). Do not propose vague or generic projects — be specific to the theme and sector.

Return ONLY a JSON array, no other text, in exactly this shape:
[{"name": string, "description": string, "estimatedCost": number, "rationale": string}]`;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/**
 * Generates 2-3 ProjectOption candidates for a theme via the LLM (extract
 * mode, grounded in real graph context — see buildProjectGenerationPrompt),
 * then deterministically computes overlap-with-existing-work and scheme
 * feasibility in code, never via the LLM. Idempotent: if options already
 * exist for this theme, returns them without generating again.
 */
export async function ensureProjectOptionsForTheme(themeId: string): Promise<string[]> {
  const existing = await runQuery<{ id: string }>(
    `MATCH (:IssueTheme {id: $themeId})-[:SUGGESTS]->(p:ProjectOption) RETURN p.id AS id`,
    { themeId }
  );
  if (existing.length > 0) return existing.map((r) => r.id);

  const theme = await fetchThemeContext(themeId);
  if (!theme) return [];

  const nearbyWorks = await fetchNearbyWorks(theme.locationId);
  const prompt = buildProjectGenerationPrompt(theme, nearbyWorks);

  let candidates: CandidateProject[];
  try {
    const result = await reasonExtractJson<CandidateProject[]>(prompt);
    candidates = Array.isArray(result.data) ? result.data.slice(0, 3) : [];
  } catch (err) {
    console.error("[projectOptions] generation failed:", err);
    return [];
  }
  if (candidates.length === 0) return [];

  const overlappingWorks = await runQuery<{ id: string }>(
    `MATCH (sw:SanctionedWork)-[:LOCATED_IN]->(:Location {id: $locationId})
     WHERE sw.sector = $sector
     RETURN sw.id AS id`,
    { locationId: theme.locationId, sector: theme.sector }
  );
  const overlaps = overlappingWorks.length > 0;

  const ids: string[] = [];
  for (const candidate of candidates) {
    const id = `proj-${slugify(theme.id)}-${slugify(candidate.name).slice(0, 40)}`;
    ids.push(id);

    const feasibility = evaluateFeasibility({
      sector: theme.sector,
      estimatedCost: candidate.estimatedCost,
      overlapsExistingWork: overlaps,
    });
    const permittedRuleIds = feasibility.rules
      .filter((r) => r.status === "GREEN")
      .map((r) => r.ruleId);

    await runWrite(
      `MERGE (p:ProjectOption {id: $id})
       SET p.name = $name, p.sector = $sector, p.estimatedCost = $estimatedCost,
           p.status = 'proposed', p.source = 'citizen-derived',
           p.description = $description, p.rationale = $rationale
       WITH p
       MATCH (t:IssueTheme {id: $themeId})
       MERGE (t)-[:SUGGESTS]->(p)
       WITH p
       MATCH (l:Location {id: $locationId})
       MERGE (p)-[:AFFECTS_LOCATION]->(l)
       WITH p
       UNWIND $permittedRuleIds AS ruleId
       MATCH (r:SchemeRule {id: ruleId})
       MERGE (p)-[:PERMITTED_BY]->(r)`,
      {
        id,
        name: candidate.name,
        sector: theme.sector,
        estimatedCost: candidate.estimatedCost,
        description: candidate.description,
        rationale: candidate.rationale,
        themeId: theme.id,
        locationId: theme.locationId,
        permittedRuleIds,
      }
    );

    if (overlaps) {
      await runWrite(
        `MATCH (p:ProjectOption {id: $id})
         MATCH (sw:SanctionedWork)-[:LOCATED_IN]->(:Location {id: $locationId})
         WHERE sw.sector = $sector
         MERGE (p)-[:OVERLAPS_WITH_WORK]->(sw)`,
        { id, locationId: theme.locationId, sector: theme.sector }
      );
    }
  }

  return ids;
}
