/**
 * Deterministic scheme-eligibility checks — no LLM judgment. Each rule maps
 * to one of the SchemeRule nodes seeded in scripts/seed.ts (see
 * rule-durable-asset, rule-sc-st-allocation, rule-cost-ceiling,
 * rule-no-duplication, rule-public-ownership).
 */

export type ComplianceStatus = "GREEN" | "AMBER" | "RED";

export interface RuleResult {
  ruleId: string;
  ruleName: string;
  status: ComplianceStatus;
  explanation: string;
}

export interface FeasibilityInput {
  sector: string;
  estimatedCost: number;
  /** MPLADS annual entitlement per constituency; defaults to the real ₹5 crore figure. */
  annualEntitlement?: number;
  /** Defaults to true — most citizen-derived/MPLADS projects target public infrastructure. */
  isPubliclyOwned?: boolean;
  overlapsExistingWork: boolean;
}

const DEFAULT_ANNUAL_ENTITLEMENT = 50_000_000; // ₹5 crore, per MPLADS guidelines
const NON_DURABLE_SECTORS = new Set(["other"]);

function checkDurableAsset(input: FeasibilityInput): RuleResult {
  const isDurable = !NON_DURABLE_SECTORS.has(input.sector);
  return {
    ruleId: "rule-durable-asset",
    ruleName: "Durable Community Asset Requirement",
    status: isDurable ? "GREEN" : "AMBER",
    explanation: isDurable
      ? `Sector "${input.sector}" is a recognized durable-asset category (road, water, lighting, community, health, or education infrastructure).`
      : `Sector "${input.sector}" isn't confidently classified as a durable community asset — needs manual review before recommending.`,
  };
}

function checkScStAllocation(): RuleResult {
  return {
    ruleId: "rule-sc-st-allocation",
    ruleName: "SC/ST Area Allocation Guideline",
    status: "AMBER",
    explanation:
      "This 15%/7.5% SC/ST allocation guideline applies to the MP's full annual entitlement, not a single project — it can't be verified per-project from available data. Check the portfolio-level allocation manually.",
  };
}

function checkCostCeiling(input: FeasibilityInput): RuleResult {
  const entitlement = input.annualEntitlement ?? DEFAULT_ANNUAL_ENTITLEMENT;
  const share = input.estimatedCost / entitlement;
  let status: ComplianceStatus;
  if (share <= 0.1) status = "GREEN";
  else if (share <= 0.25) status = "AMBER";
  else status = "RED";

  return {
    ruleId: "rule-cost-ceiling",
    ruleName: "Per-Work Cost Ceiling",
    status,
    explanation: `Estimated cost is ${(share * 100).toFixed(1)}% of the ₹${(entitlement / 10_000_000).toFixed(1)} crore annual constituency entitlement.`,
  };
}

function checkNoDuplication(input: FeasibilityInput): RuleResult {
  return {
    ruleId: "rule-no-duplication",
    ruleName: "No Duplication of Sanctioned Works",
    status: input.overlapsExistingWork ? "RED" : "GREEN",
    explanation: input.overlapsExistingWork
      ? "This project overlaps with an existing MP-recommended work at the same location and sector — likely duplication."
      : "No overlapping sanctioned work found at this location/sector.",
  };
}

function checkPublicOwnership(input: FeasibilityInput): RuleResult {
  const isPublic = input.isPubliclyOwned ?? true;
  return {
    ruleId: "rule-public-ownership",
    ruleName: "Public Ownership / No Private Benefit",
    status: isPublic ? "GREEN" : "RED",
    explanation: isPublic
      ? "Asset targets public land/institution — no private-benefit flag."
      : "Flagged as benefiting a private individual or entity — not eligible.",
  };
}

const WORST_FIRST: ComplianceStatus[] = ["RED", "AMBER", "GREEN"];

export function evaluateFeasibility(input: FeasibilityInput): {
  overall: ComplianceStatus;
  rules: RuleResult[];
} {
  const rules = [
    checkDurableAsset(input),
    checkScStAllocation(),
    checkCostCeiling(input),
    checkNoDuplication(input),
    checkPublicOwnership(input),
  ];

  const overall =
    WORST_FIRST.find((status) => rules.some((r) => r.status === status)) ?? "GREEN";

  return { overall, rules };
}
