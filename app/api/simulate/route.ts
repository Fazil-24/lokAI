import { NextResponse } from "next/server";
import { fetchProjectsByIds } from "@/lib/themeDetail";
import { reason } from "@/lib/reason";
import { runQuery, toNumber } from "@/lib/neo4j";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const projectIds: string[] = Array.isArray(body?.projectIds)
    ? body.projectIds.filter((x: unknown) => typeof x === "string").slice(0, 3)
    : [];

  if (projectIds.length === 0) {
    return NextResponse.json({ error: "Provide 1-3 projectIds" }, { status: 400 });
  }

  const projects = await fetchProjectsByIds(projectIds);
  if (projects.length === 0) {
    return NextResponse.json({ error: "No matching projects found" }, { status: 404 });
  }

  const themeCounts = await runQuery<{
    projectId: string;
    submissionCount: unknown;
    locationName: string;
  }>(
    `MATCH (t:IssueTheme)-[:SUGGESTS]->(p:ProjectOption)
     WHERE p.id IN $ids
     MATCH (t)-[:AFFECTS_LOCATION]->(l:Location)
     RETURN p.id AS projectId, coalesce(t.submissionCount, 0) AS submissionCount, l.name AS locationName`,
    { ids: projectIds }
  );
  const contextByProject = new Map(
    themeCounts.map((r) => [
      r.projectId,
      { submissionCount: toNumber(r.submissionCount), locationName: r.locationName },
    ])
  );

  const comparisons = await Promise.all(
    projects.map(async (project) => {
      const ctx = contextByProject.get(project.id);
      const overlapFact = project.overlapsExistingWork
        ? `This project DOES duplicate an existing sanctioned work (${project.overlappingWorks.map((w) => w.workName).join(", ")}) — you MUST mention this duplication risk, do not say there is no overlap.`
        : "This project has NO overlap with existing sanctioned works — you MUST NOT claim it duplicates anything.";

      const prompt = `You are narrating a trade-off comparison for a constituency officer. Do not invent precise numbers or forecasts — only reference the real figures given below, and phrase uncertain impact directionally ("likely to...", "should help..."). The overlap fact below is authoritative; never contradict it.

Project: ${project.name}
Description: ${project.description}
Sector: ${project.sector}
Location: ${project.locationName}
Estimated cost: ₹${project.estimatedCost.toLocaleString("en-IN")}
Scheme feasibility: ${project.feasibility.overall}
${overlapFact}
${ctx ? `Citizen reports behind this need: ${ctx.submissionCount}` : ""}

Write a 2-3 sentence "why recommended" explanation an officer could read aloud, grounded only in the facts above.`;

      let narration = "";
      try {
        const result = await reason({ prompt, mode: "explain" });
        narration = result.text.trim();
      } catch {
        narration = "";
      }

      return {
        ...project,
        beneficiaryContext: ctx ?? null,
        narration,
      };
    })
  );

  return NextResponse.json({ comparisons });
}
