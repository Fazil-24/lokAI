import { NextResponse } from "next/server";
import { runQuery, toNumber } from "@/lib/neo4j";
import { BLOCK_COORDINATES } from "@/lib/geo";

interface LocationRow {
  id: string;
  name: string;
  submissionCount: unknown;
  worksCount: unknown;
  themeCount: unknown;
}

export async function GET() {
  const rows = await runQuery<LocationRow>(`
    MATCH (l:Location)
    OPTIONAL MATCH (s:Submission)-[:SUBMITTED_IN]->(l)
    WITH l, count(DISTINCT s) AS submissionCount
    OPTIONAL MATCH (sw:SanctionedWork)-[:LOCATED_IN]->(l)
    WITH l, submissionCount, count(DISTINCT sw) AS worksCount
    OPTIONAL MATCH (t:IssueTheme)-[:AFFECTS_LOCATION]->(l)
    RETURN l.id AS id, l.name AS name, submissionCount, worksCount, count(DISTINCT t) AS themeCount
  `);

  const locations = rows
    .filter((row) => BLOCK_COORDINATES[row.id])
    .map((row) => ({
      id: row.id,
      name: row.name,
      ...BLOCK_COORDINATES[row.id],
      submissionCount: toNumber(row.submissionCount),
      sanctionedWorksCount: toNumber(row.worksCount),
      issueThemeCount: toNumber(row.themeCount),
      demandScore: toNumber(row.submissionCount) + toNumber(row.themeCount),
    }));

  return NextResponse.json({ locations });
}
