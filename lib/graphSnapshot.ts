/**
 * Priority graph snapshot: IssueTheme/ProjectOption/Location/SchemeRule/
 * overlapping-SanctionedWork nodes and the real edges between them,
 * flattened for a lightweight client-side SVG graph view. Cached in-memory
 * with a short TTL (module-level singleton, reused across warm serverless
 * invocations) instead of re-querying Aura on every dashboard paint —
 * invalidated explicitly after a demo-reset.
 */
import { runQuery, toNumber } from "./neo4j";

export type GraphNodeLabel =
  | "IssueTheme"
  | "ProjectOption"
  | "Location"
  | "SchemeRule"
  | "SanctionedWork";

export interface GraphNode {
  id: string;
  label: GraphNodeLabel;
  name: string;
  sector?: string;
  detail?: Record<string, string | number | null>;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: string;
}

export interface GraphSnapshot {
  nodes: GraphNode[];
  edges: GraphEdge[];
  generatedAt: string;
}

/** Caps overlap nodes per project so a high-volume location doesn't bury the graph in near-identical SanctionedWork entries — mirrors the pruning in lib/connectedImpact.ts. */
const MAX_OVERLAPS_PER_PROJECT = 3;

async function fetchGraphSnapshotFromDb(): Promise<GraphSnapshot> {
  const [themeRows, projectRows, ruleRows, overlapRows] = await Promise.all([
    runQuery<{
      id: string;
      name: string;
      sector: string;
      submissionCount: unknown;
      locationId: string;
      locationName: string;
    }>(`
      MATCH (t:IssueTheme)-[:AFFECTS_LOCATION]->(l:Location)
      OPTIONAL MATCH (s:Submission)-[:MENTIONS_ISSUE]->(t)
      WITH t, l, count(s) AS actualCount
      RETURN t.id AS id, t.name AS name, t.sector AS sector,
             coalesce(t.submissionCount, actualCount, 0) AS submissionCount,
             l.id AS locationId, l.name AS locationName
    `),
    runQuery<{
      themeId: string;
      id: string;
      name: string;
      sector: string;
      estimatedCost: unknown;
      status: string;
      locationId: string;
      locationName: string;
    }>(`
      MATCH (t:IssueTheme)-[:SUGGESTS]->(p:ProjectOption)-[:AFFECTS_LOCATION]->(l:Location)
      RETURN t.id AS themeId, p.id AS id, p.name AS name, p.sector AS sector,
             p.estimatedCost AS estimatedCost, p.status AS status,
             l.id AS locationId, l.name AS locationName
    `),
    runQuery<{ projectId: string; ruleId: string; ruleName: string; eligibilityCriteria: string }>(`
      MATCH (p:ProjectOption)-[:PERMITTED_BY]->(r:SchemeRule)
      RETURN p.id AS projectId, r.id AS ruleId, r.name AS ruleName, r.eligibilityCriteria AS eligibilityCriteria
    `),
    runQuery<{
      projectId: string;
      workId: string;
      workName: string;
      amount: unknown;
      dateRecommended: string | null;
    }>(
      `
      MATCH (p:ProjectOption)-[:OVERLAPS_WITH_WORK]->(sw:SanctionedWork)
      WITH p, sw ORDER BY sw.amount DESC
      WITH p, collect(sw)[0..$max] AS topWorks
      UNWIND topWorks AS sw
      RETURN p.id AS projectId, sw.id AS workId, sw.workName AS workName,
             sw.amount AS amount, sw.dateRecommended AS dateRecommended
      `,
      { max: MAX_OVERLAPS_PER_PROJECT }
    ),
  ]);

  const nodes = new Map<string, GraphNode>();
  const edges = new Map<string, GraphEdge>();

  function addEdge(source: string, target: string, type: string) {
    edges.set(`${type}:${source}->${target}`, { id: `${type}:${source}->${target}`, source, target, type });
  }

  for (const row of themeRows) {
    nodes.set(row.id, {
      id: row.id,
      label: "IssueTheme",
      name: row.name,
      sector: row.sector,
      detail: { submissionCount: toNumber(row.submissionCount), location: row.locationName },
    });
    if (!nodes.has(row.locationId)) {
      nodes.set(row.locationId, { id: row.locationId, label: "Location", name: row.locationName });
    }
    addEdge(row.id, row.locationId, "AFFECTS_LOCATION");
  }

  for (const row of projectRows) {
    nodes.set(row.id, {
      id: row.id,
      label: "ProjectOption",
      name: row.name,
      sector: row.sector,
      detail: {
        estimatedCost: toNumber(row.estimatedCost),
        status: row.status,
        location: row.locationName,
      },
    });
    if (!nodes.has(row.locationId)) {
      nodes.set(row.locationId, { id: row.locationId, label: "Location", name: row.locationName });
    }
    addEdge(row.themeId, row.id, "SUGGESTS");
    addEdge(row.id, row.locationId, "AFFECTS_LOCATION");
  }

  for (const row of ruleRows) {
    if (!nodes.has(row.ruleId)) {
      nodes.set(row.ruleId, {
        id: row.ruleId,
        label: "SchemeRule",
        name: row.ruleName,
        detail: { eligibilityCriteria: row.eligibilityCriteria },
      });
    }
    addEdge(row.projectId, row.ruleId, "PERMITTED_BY");
  }

  for (const row of overlapRows) {
    if (!nodes.has(row.workId)) {
      nodes.set(row.workId, {
        id: row.workId,
        label: "SanctionedWork",
        name: row.workName,
        detail: { amount: toNumber(row.amount), dateRecommended: row.dateRecommended },
      });
    }
    addEdge(row.projectId, row.workId, "OVERLAPS_WITH_WORK");
  }

  return {
    nodes: Array.from(nodes.values()),
    edges: Array.from(edges.values()),
    generatedAt: new Date().toISOString(),
  };
}

const TTL_MS = 15_000;
let cached: { data: GraphSnapshot; expiresAt: number } | null = null;

export async function getGraphSnapshot(forceRefresh = false): Promise<GraphSnapshot> {
  if (!forceRefresh && cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }
  const data = await fetchGraphSnapshotFromDb();
  cached = { data, expiresAt: Date.now() + TTL_MS };
  return data;
}

export function invalidateGraphSnapshotCache(): void {
  cached = null;
}
