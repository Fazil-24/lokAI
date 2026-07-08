import { NextResponse } from "next/server";
import { runQuery, toNumber } from "@/lib/neo4j";

export async function GET() {
  const [themeRows, submissionRows, workRows, populationRows, durableThemeRows] =
    await Promise.all([
      runQuery<{ count: unknown }>("MATCH (t:IssueTheme) RETURN count(t) AS count"),
      runQuery<{ count: unknown }>("MATCH (s:Submission) RETURN count(s) AS count"),
      runQuery<{ count: unknown; total: unknown }>(
        "MATCH (sw:SanctionedWork) RETURN count(sw) AS count, sum(sw.amount) AS total"
      ),
      runQuery<{ value: unknown }>(
        "MATCH (p:PublicIndicator {metric: 'District Population'}) RETURN p.value AS value"
      ),
      runQuery<{ count: unknown }>(
        "MATCH (t:IssueTheme) WHERE t.sector <> 'other' RETURN count(t) AS count"
      ),
    ]);

  return NextResponse.json({
    recurringIssueThemes: toNumber(themeRows[0]?.count),
    submissionVolume: toNumber(submissionRows[0]?.count),
    ongoingWorksCount: toNumber(workRows[0]?.count),
    ongoingWorksTotalAllocation: toNumber(workRows[0]?.total),
    affectedPopulationEstimate: toNumber(populationRows[0]?.value),
    schemeCompatibleThemeCount: toNumber(durableThemeRows[0]?.count),
  });
}
