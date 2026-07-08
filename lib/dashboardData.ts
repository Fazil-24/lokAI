import { runQuery, toNumber } from "./neo4j";
import type { ProjectFeatures } from "./scoring";
import { isDurableAssetSector } from "./schemeRules";

export interface ThemeCard {
  features: ProjectFeatures;
  sector: string;
  locationId: string;
  locationName: string;
  description: string;
}

interface ThemeRow {
  id: string;
  name: string;
  sector: string;
  description: string | null;
  locationId: string;
  locationName: string;
  submissionCount: number;
  avgUrgency: number;
  existingWorks: number;
  overlapCount: number;
}

interface IndicatorRow {
  location: string;
  metric: string;
  value: number;
}

/** Rough demographic-gap proxy from real cited indicators: lower literacy -> bigger gap. Falls back to the constituency-wide figure, then 0 (never fabricated). */
function computeDemographicGap(
  locationName: string,
  indicators: IndicatorRow[]
): number {
  const local = indicators.find(
    (i) => i.location === locationName && /literacy rate/i.test(i.metric)
  );
  const constituencyWide = indicators.find(
    (i) => i.location === "Chikballapur Constituency" && /literacy rate/i.test(i.metric)
  );
  const literacy = local?.value ?? constituencyWide?.value;
  if (literacy === undefined) return 0;
  return Math.max(0, (100 - literacy) / 100);
}

export async function fetchRankableThemes(): Promise<ThemeCard[]> {
  const [themeRows, indicatorRows] = await Promise.all([
    runQuery<ThemeRow>(`
      MATCH (t:IssueTheme)-[:AFFECTS_LOCATION]->(l:Location)
      OPTIONAL MATCH (s:Submission)-[:MENTIONS_ISSUE]->(t)
      WITH t, l, avg(coalesce(s.urgencySignal, 0)) AS avgUrgency, count(s) AS actualSubmissionCount
      OPTIONAL MATCH (sw:SanctionedWork)-[:LOCATED_IN]->(l)
      WITH t, l, avgUrgency, actualSubmissionCount, count(sw) AS existingWorks
      OPTIONAL MATCH (sw2:SanctionedWork)-[:LOCATED_IN]->(l)
      WHERE sw2.sector = t.sector
      RETURN t.id AS id, t.name AS name, t.sector AS sector, t.description AS description,
             l.id AS locationId, l.name AS locationName,
             coalesce(t.submissionCount, actualSubmissionCount, 0) AS submissionCount,
             avgUrgency, existingWorks, count(sw2) AS overlapCount
    `),
    runQuery<IndicatorRow>(
      "MATCH (p:PublicIndicator) RETURN p.location AS location, p.metric AS metric, p.value AS value"
    ),
  ]);

  return themeRows.map((row) => {
    const schemeFit = isDurableAssetSector(row.sector);
    const features: ProjectFeatures = {
      id: row.id,
      name: row.name,
      demandVolume: toNumber(row.submissionCount),
      urgencySignal: toNumber(row.avgUrgency),
      demographicGap: computeDemographicGap(row.locationName, indicatorRows),
      schemeFit,
      coFundingPercent: schemeFit ? 100 : 0,
      existingSanctionedWorksAtLocation: toNumber(row.existingWorks),
      overlapsExistingWork: toNumber(row.overlapCount) > 0,
    };
    return {
      features,
      sector: row.sector,
      locationId: row.locationId,
      locationName: row.locationName,
      description: row.description ?? "",
    };
  });
}
