/**
 * Idempotent seed script: safe to re-run before every demo (uses MERGE, never CREATE).
 * Run with: npm run seed
 */
import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import { getDriver } from "../lib/neo4j";
import { seedBaseData } from "../lib/seedBaseData";

async function main() {
  const summary = await seedBaseData();
  console.log(`Seeded ${summary.locations} block-level locations.`);
  console.log(`Seeded ${summary.sanctionedWorks} SanctionedWork nodes from the MPLADS CSV.`);
  console.log(`Seeded ${summary.publicIndicators} public indicators.`);
  console.log(`Seeded ${summary.schemeRules} scheme rules.`);
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
