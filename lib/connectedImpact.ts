import { getSession } from "./neo4j";

/**
 * "Connected Impact" — honest 2-hop graph reachability from a selected
 * ProjectOption. This is NOT a prediction or simulation of consequences;
 * it's exactly what OVERLAPS_WITH_WORK/AFFECTS_LOCATION/etc. edges already
 * in the graph say is nearby. UI copy must say "Connected Impact" or
 * "What Else This Touches" — never "butterfly effect" or "simulation".
 */

export interface ImpactNode {
  id: string;
  label: string;
  name: string;
  hop: 1 | 2;
  relType: string;
  /** id of the node this one is directly connected to (the project itself for hop 1, a hop-1 node for hop 2) */
  parentId: string;
}

function displayName(label: string, props: Record<string, unknown>): string {
  switch (label) {
    case "Location":
      return String(props.name ?? "Unknown location");
    case "PublicIndicator":
      return `${props.metric ?? "Indicator"}: ${props.value ?? "?"}`;
    case "ProjectOption":
      return String(props.name ?? "Untitled project");
    case "SchemeRule":
      return String(props.name ?? "Scheme rule");
    case "SanctionedWork":
      return String(props.workName ?? "Sanctioned work");
    case "IssueTheme":
      return String(props.name ?? "Issue theme");
    case "Submission":
      return String(props.trackingId ?? props.summary ?? "Submission");
    case "Sector":
      return String(props.name ?? "Sector");
    case "Constituency":
      return String(props.name ?? "Constituency");
    default:
      return String(props.name ?? props.id ?? label);
  }
}

interface RawNode {
  properties: Record<string, unknown>;
  labels: string[];
}

const MAX_PER_LABEL = 4;

/**
 * A high-volume location can have 100+ SanctionedWork nodes, which would
 * otherwise bury the genuinely interesting connections (other themes,
 * projects, indicators) under dozens of near-identical entries. Dedupe by
 * (label, name) and cap each category so the ripple stays legible.
 */
function pruneForDisplay(nodes: ImpactNode[]): ImpactNode[] {
  const byLabel = new Map<string, Map<string, ImpactNode>>();
  for (const node of nodes) {
    const byName = byLabel.get(node.label) ?? new Map<string, ImpactNode>();
    if (!byName.has(node.name)) byName.set(node.name, node);
    byLabel.set(node.label, byName);
  }
  const pruned: ImpactNode[] = [];
  for (const byName of byLabel.values()) {
    pruned.push(...Array.from(byName.values()).slice(0, MAX_PER_LABEL));
  }
  return pruned;
}

export async function fetchConnectedImpact(
  projectId: string
): Promise<{ hop1: ImpactNode[]; hop2: ImpactNode[] }> {
  const session = getSession();
  try {
    const result = await session.run(
      `MATCH (p:ProjectOption {id: $projectId})-[r1]-(n1)
       WHERE n1 <> p
       WITH p, r1, n1
       OPTIONAL MATCH (n1)-[r2]-(n2)
       WHERE n2 <> p AND n2 <> n1
       RETURN n1, type(r1) AS r1Type,
              n2, type(r2) AS r2Type`,
      { projectId }
    );

    const hop1Map = new Map<string, ImpactNode>();
    const hop2Map = new Map<string, ImpactNode>();

    for (const record of result.records) {
      const n1 = record.get("n1") as RawNode | null;
      const r1Type = record.get("r1Type") as string | null;
      const n2 = record.get("n2") as RawNode | null;
      const r2Type = record.get("r2Type") as string | null;

      if (n1 && r1Type) {
        const label = n1.labels[0];
        const id = String(n1.properties.id ?? "");
        if (id && !hop1Map.has(id)) {
          hop1Map.set(id, {
            id,
            label,
            name: displayName(label, n1.properties),
            hop: 1,
            relType: r1Type,
            parentId: projectId,
          });
        }

        if (n2 && r2Type && n1.properties.id) {
          const label2 = n2.labels[0];
          const id2 = String(n2.properties.id ?? "");
          const parentId = String(n1.properties.id);
          if (id2 && id2 !== id && !hop2Map.has(id2) && !hop1Map.has(id2)) {
            hop2Map.set(id2, {
              id: id2,
              label: label2,
              name: displayName(label2, n2.properties),
              hop: 2,
              relType: r2Type,
              parentId,
            });
          }
        }
      }
    }

    return {
      hop1: pruneForDisplay(Array.from(hop1Map.values())),
      hop2: pruneForDisplay(Array.from(hop2Map.values())),
    };
  } finally {
    await session.close();
  }
}

