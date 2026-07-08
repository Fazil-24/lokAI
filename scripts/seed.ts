/**
 * Idempotent seed script: safe to re-run before every demo (uses MERGE, never CREATE).
 * Run with: npm run seed
 */
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import Papa from "papaparse";
import { getDriver, runWrite } from "../lib/neo4j";
import { SCHEMA_CONSTRAINTS } from "../lib/schema";
import { ALL_SECTORS, deriveSector } from "../lib/sectors";
import { canonicalizeBlockName, locationIdFromName } from "../lib/locations";

type CsvRow = {
  "MP NAME": string;
  WORK: string;
  CATEGORY: string;
  STATE: string;
  CONSTITUENCY: string;
  IDA: string;
  CITY: string;
  WARD: string;
  BLOCK: string;
  VILLAGE: string;
  "RECOMMENDED DATE": string;
  "ALLOCATION AMOUNT": string;
  "IDA APPROVAL": string;
  STATUS: string;
  HOUSE: string;
};

const CSV_PATH = path.resolve(process.cwd(), "data/chikballapur_mplads_seed.csv");
const CONSTITUENCY_ID = "chikballapur";

// Real Census 2011 figures — cited, not invented (see files/lokai-setup-guide.md discussion).
const PUBLIC_INDICATORS = [
  {
    id: "pi-district-population",
    location: "Chikballapur Constituency",
    metric: "District Population",
    value: 1255104,
    year: 2011,
    source: "Census of India 2011 (Chikkaballapur District)",
  },
  {
    id: "pi-district-literacy",
    location: "Chikballapur Constituency",
    metric: "District Literacy Rate (%)",
    value: 70.08,
    year: 2011,
    source: "Census of India 2011 (Chikkaballapur District)",
  },
  {
    id: "pi-district-sex-ratio",
    location: "Chikballapur Constituency",
    metric: "Sex Ratio (females per 1000 males)",
    value: 968,
    year: 2011,
    source: "Census of India 2011 (Chikkaballapur District)",
  },
  {
    id: "pi-doddaballapur-population",
    location: "Dodda Ballapur",
    metric: "Taluk Population",
    value: 299594,
    year: 2011,
    source: "Census of India 2011 (Dod Ballapur Taluk)",
  },
  {
    id: "pi-doddaballapur-literacy",
    location: "Dodda Ballapur",
    metric: "Taluk Literacy Rate (%)",
    value: 70.01,
    year: 2011,
    source: "Census of India 2011 (Dod Ballapur Taluk)",
  },
];

const MPLADS_SOURCE_URL =
  "https://mplads.gov.in/mplads/UploadedFiles/PocketBookEnglish_884.pdf";

const SCHEME_RULES = [
  {
    id: "rule-durable-asset",
    name: "Durable Community Asset Requirement",
    eligibilityCriteria:
      "Recommended work must result in a durable, publicly-owned community asset (e.g. road, drinking water facility, school building) rather than recurring or consumable expenditure.",
    coFundingPercent: 100,
    sourceUrl: MPLADS_SOURCE_URL,
  },
  {
    id: "rule-sc-st-allocation",
    name: "SC/ST Area Allocation Guideline",
    eligibilityCriteria:
      "At least 15% of the MP's annual entitlement should go to works in areas inhabited by SC population, and at least 7.5% to ST-inhabited areas.",
    coFundingPercent: 0,
    sourceUrl: MPLADS_SOURCE_URL,
  },
  {
    id: "rule-cost-ceiling",
    name: "Per-Work Cost Ceiling",
    eligibilityCriteria:
      "A single recommended work should be a reasonable share of the ₹5 crore annual constituency entitlement — flagged for coordination if it alone would consume a disproportionate share.",
    coFundingPercent: 0,
    sourceUrl: MPLADS_SOURCE_URL,
  },
  {
    id: "rule-no-duplication",
    name: "No Duplication of Sanctioned Works",
    eligibilityCriteria:
      "Proposed project must not substantially duplicate an already MP-recommended work in the same location and sector.",
    coFundingPercent: 0,
    sourceUrl: MPLADS_SOURCE_URL,
  },
  {
    id: "rule-public-ownership",
    name: "Public Ownership / No Private Benefit",
    eligibilityCriteria:
      "Asset created must be on public land or in a public institution, and must not benefit a private individual or entity.",
    coFundingPercent: 0,
    sourceUrl: MPLADS_SOURCE_URL,
  },
];

function readCsvRows(): CsvRow[] {
  const csv = fs.readFileSync(CSV_PATH, "utf-8");
  const { data, errors } = Papa.parse<CsvRow>(csv, {
    header: true,
    skipEmptyLines: true,
  });
  if (errors.length > 0) {
    throw new Error(`CSV parse errors: ${JSON.stringify(errors.slice(0, 5))}`);
  }
  return data;
}

async function applyConstraints() {
  for (const statement of SCHEMA_CONSTRAINTS) {
    await runWrite(statement);
  }
  console.log(`Applied ${SCHEMA_CONSTRAINTS.length} constraints.`);
}

async function seedConstituency() {
  await runWrite(
    `MERGE (c:Constituency {id: $id})
     SET c.name = $name, c.state = $state`,
    { id: CONSTITUENCY_ID, name: "Chikballapur", state: "Karnataka" }
  );
}

async function seedSectors() {
  await runWrite(
    `UNWIND $sectors AS sectorId
     MERGE (s:Sector {id: sectorId})
     SET s.name = sectorId`,
    { sectors: ALL_SECTORS as unknown as string[] }
  );
  console.log(`Seeded ${ALL_SECTORS.length} sectors.`);
}

async function seedLocations(blockNames: string[]) {
  const locations = blockNames.map((name) => ({
    id: locationIdFromName(name),
    name,
  }));
  await runWrite(
    `UNWIND $locations AS loc
     MERGE (l:Location {id: loc.id})
     SET l.name = loc.name, l.type = 'block'
     WITH l
     MATCH (c:Constituency {id: $constituencyId})
     MERGE (l)-[:PART_OF_CONSTITUENCY]->(c)`,
    { locations, constituencyId: CONSTITUENCY_ID }
  );
  console.log(`Seeded ${locations.length} block-level locations.`);
}

async function seedSanctionedWorks(rows: CsvRow[]) {
  const works = rows.map((row, index) => {
    const blockName = canonicalizeBlockName(
      row.BLOCK || row.VILLAGE || row.CITY
    );
    return {
      id: `sw-${index + 1}`,
      workName: row.WORK,
      description: row.WORK,
      amount: Number.parseFloat(row["ALLOCATION AMOUNT"]) || 0,
      agency: row.IDA || null,
      dateRecommended: row["RECOMMENDED DATE"] || null,
      source: "MPLADS",
      status: "MP-Recommended (Pending District Sanction)",
      mpName: row["MP NAME"] || null,
      village: row.VILLAGE || null,
      sector: deriveSector(row.WORK),
      locationId: locationIdFromName(blockName),
    };
  });

  await runWrite(
    `UNWIND $works AS w
     MERGE (sw:SanctionedWork {id: w.id})
     SET sw.workName = w.workName,
         sw.description = w.description,
         sw.amount = w.amount,
         sw.agency = w.agency,
         sw.dateRecommended = w.dateRecommended,
         sw.source = w.source,
         sw.status = w.status,
         sw.mpName = w.mpName,
         sw.village = w.village,
         sw.sector = w.sector
     WITH sw, w
     MATCH (l:Location {id: w.locationId})
     MERGE (sw)-[:LOCATED_IN]->(l)
     WITH sw, w
     MATCH (s:Sector {id: w.sector})
     MERGE (sw)-[:IN_SECTOR]->(s)`,
    { works }
  );
  console.log(`Seeded ${works.length} SanctionedWork nodes from the MPLADS CSV.`);
}

async function seedPublicIndicators() {
  await runWrite(
    `UNWIND $indicators AS pi
     MERGE (n:PublicIndicator {id: pi.id})
     SET n.location = pi.location, n.metric = pi.metric, n.value = pi.value,
         n.year = pi.year, n.source = pi.source`,
    { indicators: PUBLIC_INDICATORS }
  );
  console.log(`Seeded ${PUBLIC_INDICATORS.length} public indicators.`);
}

async function seedSchemeRules() {
  await runWrite(
    `UNWIND $rules AS r
     MERGE (n:SchemeRule {id: r.id})
     SET n.name = r.name, n.eligibilityCriteria = r.eligibilityCriteria,
         n.coFundingPercent = r.coFundingPercent, n.sourceUrl = r.sourceUrl`,
    { rules: SCHEME_RULES }
  );
  console.log(`Seeded ${SCHEME_RULES.length} scheme rules.`);
}

async function main() {
  console.log(`Reading CSV from ${CSV_PATH}`);
  const rows = readCsvRows();
  console.log(`Parsed ${rows.length} MPLADS rows.`);

  const blockNames = Array.from(
    new Set(
      rows.map((row) => canonicalizeBlockName(row.BLOCK || row.VILLAGE || row.CITY))
    )
  );

  await applyConstraints();
  await seedConstituency();
  await seedSectors();
  await seedLocations(blockNames);
  await seedSanctionedWorks(rows);
  await seedPublicIndicators();
  await seedSchemeRules();

  console.log("Seed complete.");
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await getDriver().close();
  });
