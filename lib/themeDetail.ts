import { runQuery, toNumber } from "./neo4j";
import { evaluateFeasibility, type ComplianceStatus } from "./schemeRules";

export interface ThemeDetail {
  id: string;
  name: string;
  sector: string;
  description: string | null;
  submissionCount: number;
  locationId: string;
  locationName: string;
  submissions: {
    trackingId: string;
    summary: string | null;
    urgencySignal: number;
    submitterName: string | null;
    timestamp: string | null;
  }[];
  overlappingWorks: { id: string; workName: string; amount: number; dateRecommended: string | null }[];
}

export async function fetchThemeDetail(themeId: string): Promise<ThemeDetail | null> {
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

  const [submissions, overlappingWorks] = await Promise.all([
    runQuery<{
      trackingId: string;
      summary: string | null;
      urgencySignal: unknown;
      submitterName: string | null;
      timestamp: unknown;
    }>(
      `MATCH (s:Submission)-[:MENTIONS_ISSUE]->(:IssueTheme {id: $themeId})
       RETURN s.trackingId AS trackingId, s.summary AS summary, s.urgencySignal AS urgencySignal,
              s.submitterName AS submitterName, toString(s.timestamp) AS timestamp
       ORDER BY s.timestamp DESC`,
      { themeId }
    ),
    runQuery<{ id: string; workName: string; amount: unknown; dateRecommended: string | null }>(
      `MATCH (sw:SanctionedWork)-[:LOCATED_IN]->(:Location {id: $locationId})
       WHERE sw.sector = $sector
       RETURN sw.id AS id, sw.workName AS workName, sw.amount AS amount, sw.dateRecommended AS dateRecommended
       ORDER BY sw.amount DESC LIMIT 10`,
      { locationId: row.locationId, sector: row.sector }
    ),
  ]);

  return {
    ...row,
    submissionCount: toNumber(row.submissionCount),
    submissions: submissions.map((s) => ({
      ...s,
      urgencySignal: toNumber(s.urgencySignal),
      timestamp: s.timestamp as string | null,
    })),
    overlappingWorks: overlappingWorks.map((w) => ({ ...w, amount: toNumber(w.amount) })),
  };
}

export interface ProjectDetail {
  id: string;
  name: string;
  description: string | null;
  rationale: string | null;
  sector: string;
  estimatedCost: number;
  status: string;
  source: string;
  locationId: string;
  locationName: string;
  overlapsExistingWork: boolean;
  overlappingWorks: { workName: string; amount: number; dateRecommended: string | null }[];
  feasibility: { overall: ComplianceStatus; rules: ReturnType<typeof evaluateFeasibility>["rules"] };
}

export async function fetchProjectsByIds(ids: string[]): Promise<ProjectDetail[]> {
  if (ids.length === 0) return [];
  const rows = await runQuery<{
    id: string;
    name: string;
    description: string | null;
    rationale: string | null;
    sector: string;
    estimatedCost: unknown;
    status: string;
    source: string;
    locationId: string;
    locationName: string;
  }>(
    `MATCH (p:ProjectOption)-[:AFFECTS_LOCATION]->(l:Location)
     WHERE p.id IN $ids
     RETURN p.id AS id, p.name AS name, p.description AS description, p.rationale AS rationale,
            p.sector AS sector, p.estimatedCost AS estimatedCost, p.status AS status, p.source AS source,
            l.id AS locationId, l.name AS locationName`,
    { ids }
  );

  const overlapRows = await runQuery<{
    projectId: string;
    workName: string;
    amount: unknown;
    dateRecommended: string | null;
  }>(
    `MATCH (p:ProjectOption)-[:OVERLAPS_WITH_WORK]->(sw:SanctionedWork)
     WHERE p.id IN $ids
     WITH p.id AS projectId, sw ORDER BY sw.amount DESC
     WITH projectId, collect({workName: sw.workName, amount: sw.amount, dateRecommended: sw.dateRecommended})[0..5] AS works
     UNWIND works AS w
     RETURN projectId, w.workName AS workName, w.amount AS amount, w.dateRecommended AS dateRecommended`,
    { ids }
  );
  const overlapsByProject = new Map<string, ProjectDetail["overlappingWorks"]>();
  for (const row of overlapRows) {
    const list = overlapsByProject.get(row.projectId) ?? [];
    list.push({ workName: row.workName, amount: toNumber(row.amount), dateRecommended: row.dateRecommended });
    overlapsByProject.set(row.projectId, list);
  }

  return rows.map((row) => {
    const overlappingWorks = overlapsByProject.get(row.id) ?? [];
    const feasibility = evaluateFeasibility({
      sector: row.sector,
      estimatedCost: toNumber(row.estimatedCost),
      overlapsExistingWork: overlappingWorks.length > 0,
    });
    return {
      ...row,
      estimatedCost: toNumber(row.estimatedCost),
      overlapsExistingWork: overlappingWorks.length > 0,
      overlappingWorks,
      feasibility,
    };
  });
}
