import { describe, expect, it } from "vitest";
import { evaluateFeasibility, type FeasibilityInput } from "./schemeRules";

function input(overrides: Partial<FeasibilityInput> = {}): FeasibilityInput {
  return {
    sector: "roads",
    estimatedCost: 250_000,
    overlapsExistingWork: false,
    ...overrides,
  };
}

describe("evaluateFeasibility", () => {
  it("has no RED rules for a small, non-overlapping, durable-asset project", () => {
    // Overall stays AMBER because the SC/ST allocation guideline is portfolio-level
    // and always AMBER on its own (see spec's own example: "...falls short of the
    // 15% SC-area allocation guideline — Amber"), even when every other rule passes.
    const result = evaluateFeasibility(input());
    expect(result.overall).toBe("AMBER");
    expect(result.rules.every((r) => r.status !== "RED")).toBe(true);
  });

  it("flags RED for a project that overlaps an existing sanctioned work", () => {
    const result = evaluateFeasibility(input({ overlapsExistingWork: true }));
    expect(result.overall).toBe("RED");
    const dup = result.rules.find((r) => r.ruleId === "rule-no-duplication")!;
    expect(dup.status).toBe("RED");
  });

  it("flags RED when cost exceeds the per-work ceiling share of annual entitlement", () => {
    const result = evaluateFeasibility(
      input({ estimatedCost: 20_000_000, annualEntitlement: 50_000_000 })
    );
    const ceiling = result.rules.find((r) => r.ruleId === "rule-cost-ceiling")!;
    expect(ceiling.status).toBe("RED");
    expect(result.overall).toBe("RED");
  });

  it("flags AMBER (not RED) for cost in the middle band", () => {
    const result = evaluateFeasibility(
      input({ estimatedCost: 7_500_000, annualEntitlement: 50_000_000 })
    );
    const ceiling = result.rules.find((r) => r.ruleId === "rule-cost-ceiling")!;
    expect(ceiling.status).toBe("AMBER");
  });

  it("marks the SC/ST allocation guideline as AMBER (portfolio-level, not per-project verifiable)", () => {
    const result = evaluateFeasibility(input());
    const scSt = result.rules.find((r) => r.ruleId === "rule-sc-st-allocation")!;
    expect(scSt.status).toBe("AMBER");
  });

  it("flags RED for a privately-owned asset", () => {
    const result = evaluateFeasibility(input({ isPubliclyOwned: false }));
    const ownership = result.rules.find((r) => r.ruleId === "rule-public-ownership")!;
    expect(ownership.status).toBe("RED");
    expect(result.overall).toBe("RED");
  });

  it("marks an 'other' sector project AMBER for durable-asset classification", () => {
    const result = evaluateFeasibility(input({ sector: "other" }));
    const durable = result.rules.find((r) => r.ruleId === "rule-durable-asset")!;
    expect(durable.status).toBe("AMBER");
  });

  it("overall status is the worst of any individual rule", () => {
    const redResult = evaluateFeasibility(input({ overlapsExistingWork: true }));
    expect(redResult.overall).toBe("RED");

    const amberResult = evaluateFeasibility(input({ sector: "other" }));
    expect(amberResult.overall).toBe("AMBER");
  });
});
