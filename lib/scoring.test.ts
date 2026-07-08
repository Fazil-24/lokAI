import { describe, expect, it } from "vitest";
import {
  DEFAULT_WEIGHTS,
  rankProjects,
  scoreProject,
  type ProjectFeatures,
} from "./scoring";

function project(overrides: Partial<ProjectFeatures> & { id: string }): ProjectFeatures {
  return {
    name: overrides.id,
    demandVolume: 0,
    urgencySignal: 0,
    demographicGap: 0,
    schemeFit: false,
    coFundingPercent: 0,
    existingSanctionedWorksAtLocation: 0,
    overlapsExistingWork: false,
    ...overrides,
  };
}

describe("rankProjects", () => {
  it("ranks higher demand/urgency/demographic-gap above a low-signal project", () => {
    const high = project({ id: "high", demandVolume: 40, urgencySignal: 30, demographicGap: 0.9 });
    const low = project({ id: "low", demandVolume: 2, urgencySignal: 1, demographicGap: 0.1 });

    const ranked = rankProjects([high, low]);

    expect(ranked[0].project.id).toBe("high");
    expect(ranked[0].rank).toBe(1);
    expect(ranked[1].project.id).toBe("low");
    expect(ranked[0].breakdown.total).toBeGreaterThan(ranked[1].breakdown.total);
  });

  it("penalizes a project that overlaps an existing sanctioned work", () => {
    const clean = project({ id: "clean", demandVolume: 10, urgencySignal: 10, demographicGap: 0.5 });
    const overlapping = project({
      id: "overlapping",
      demandVolume: 10,
      urgencySignal: 10,
      demographicGap: 0.5,
      overlapsExistingWork: true,
    });

    const ranked = rankProjects([clean, overlapping]);

    expect(ranked[0].project.id).toBe("clean");
    const overlapResult = ranked.find((r) => r.project.id === "overlapping")!;
    expect(overlapResult.breakdown.factors.overlapPenalty.contribution).toBeLessThan(0);
  });

  it("rewards scheme fit scaled by co-funding percent", () => {
    const funded = project({ id: "funded", schemeFit: true, coFundingPercent: 100 });
    const unfunded = project({ id: "unfunded", schemeFit: false, coFundingPercent: 0 });

    const ranked = rankProjects([funded, unfunded]);

    expect(ranked[0].project.id).toBe("funded");
    expect(ranked[0].breakdown.factors.schemeFit.contribution).toBeCloseTo(DEFAULT_WEIGHTS.w4 * 1);
  });

  it("boosts equity for locations with fewer existing sanctioned works", () => {
    const underserved = project({ id: "underserved", existingSanctionedWorksAtLocation: 0 });
    const saturated = project({ id: "saturated", existingSanctionedWorksAtLocation: 20 });

    const ranked = rankProjects([underserved, saturated]);

    expect(ranked[0].project.id).toBe("underserved");
  });

  it("treats a zero-variance cohort as neutral instead of producing NaN", () => {
    const a = project({ id: "a", demandVolume: 5, urgencySignal: 5, demographicGap: 0.5 });
    const b = project({ id: "b", demandVolume: 5, urgencySignal: 5, demographicGap: 0.5 });

    const ranked = rankProjects([a, b]);

    expect(Number.isNaN(ranked[0].breakdown.total)).toBe(false);
    expect(ranked[0].breakdown.total).toBeCloseTo(ranked[1].breakdown.total);
  });

  it("respects admin-adjustable weights", () => {
    const demandHeavy = project({ id: "demand", demandVolume: 100, urgencySignal: 0, demographicGap: 0 });
    const urgencyHeavy = project({ id: "urgency", demandVolume: 0, urgencySignal: 100, demographicGap: 0 });

    const demandFirst = rankProjects([demandHeavy, urgencyHeavy], {
      ...DEFAULT_WEIGHTS,
      w1: 10,
      w2: 0,
    });
    expect(demandFirst[0].project.id).toBe("demand");

    const urgencyFirst = rankProjects([demandHeavy, urgencyHeavy], {
      ...DEFAULT_WEIGHTS,
      w1: 0,
      w2: 10,
    });
    expect(urgencyFirst[0].project.id).toBe("urgency");
  });

  it("returns an empty array for an empty cohort", () => {
    expect(rankProjects([])).toEqual([]);
  });
});

describe("scoreProject", () => {
  it("scores a single project against a cohort it isn't already part of", () => {
    const cohort = [project({ id: "a", demandVolume: 10 }), project({ id: "b", demandVolume: 20 })];
    const target = project({ id: "c", demandVolume: 30 });

    const breakdown = scoreProject(target, cohort);

    expect(breakdown.projectId).toBe("c");
    expect(breakdown.factors.demand.normalized).toBe(1);
  });
});
