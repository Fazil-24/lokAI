/**
 * Pure, LLM-free priority scoring. Every number here traces back to a
 * feature value the caller pulled from Neo4j/the CSV — nothing is invented.
 *
 * priority_score(project) =
 *     w1 * normalized(demand_volume)
 *   + w2 * normalized(urgency_signal)
 *   + w3 * normalized(demographic_gap)
 *   + w4 * scheme_fit_bonus
 *   + w5 * equity_weight
 *   - w6 * overlap_penalty
 */

export interface ProjectFeatures {
  id: string;
  name: string;
  /** count of linked submissions/themes */
  demandVolume: number;
  /** recurrence + severity signal, already a non-negative count/score */
  urgencySignal: number;
  /** e.g. enrollment/capacity overrun ratio; higher = bigger gap */
  demographicGap: number;
  /** whether the project is PERMITTED_BY at least one SchemeRule */
  schemeFit: boolean;
  /** co-funding percent (0-100) of the best-matching scheme, if schemeFit */
  coFundingPercent: number;
  /** how many SanctionedWorks already exist at this project's location(s) */
  existingSanctionedWorksAtLocation: number;
  /** whether the project OVERLAPS_WITH_WORK an existing SanctionedWork */
  overlapsExistingWork: boolean;
}

export interface ScoringWeights {
  w1: number; // demand volume
  w2: number; // urgency
  w3: number; // demographic gap
  w4: number; // scheme fit
  w5: number; // equity
  w6: number; // overlap penalty
}

export const DEFAULT_WEIGHTS: ScoringWeights = {
  w1: 1,
  w2: 1,
  w3: 1,
  w4: 1,
  w5: 1,
  w6: 1,
};

interface FactorBreakdown {
  raw: number;
  normalized: number;
  weight: number;
  /** signed contribution to the total (already weight * normalized, negated for penalties) */
  contribution: number;
}

export interface ScoreBreakdown {
  projectId: string;
  projectName: string;
  total: number;
  factors: {
    demand: FactorBreakdown;
    urgency: FactorBreakdown;
    demographicGap: FactorBreakdown;
    schemeFit: FactorBreakdown;
    equity: FactorBreakdown;
    overlapPenalty: FactorBreakdown;
  };
}

export interface RankedProject {
  project: ProjectFeatures;
  breakdown: ScoreBreakdown;
  rank: number;
}

/** Min-max normalize; a cohort with zero variance is treated as neutral (0.5), not zero. */
function normalize(value: number, min: number, max: number): number {
  if (max === min) return 0.5;
  return (value - min) / (max - min);
}

function minMax(values: number[]): { min: number; max: number } {
  return { min: Math.min(...values), max: Math.max(...values) };
}

/** Equity favors locations with fewer existing sanctioned works, so we invert the count before normalizing. */
function equityRaw(existingWorks: number): number {
  return 1 / (1 + Math.max(0, existingWorks));
}

/**
 * Scores every project in `projects` relative to each other (min-max
 * normalization is cohort-relative, matching the spec's `normalized(x)`),
 * and returns them ranked highest-score first.
 */
export function rankProjects(
  projects: ProjectFeatures[],
  weights: ScoringWeights = DEFAULT_WEIGHTS
): RankedProject[] {
  if (projects.length === 0) return [];

  const demandRange = minMax(projects.map((p) => p.demandVolume));
  const urgencyRange = minMax(projects.map((p) => p.urgencySignal));
  const gapRange = minMax(projects.map((p) => p.demographicGap));
  const equityRange = minMax(
    projects.map((p) => equityRaw(p.existingSanctionedWorksAtLocation))
  );

  const breakdowns = projects.map((project) => {
    const demandNorm = normalize(project.demandVolume, demandRange.min, demandRange.max);
    const urgencyNorm = normalize(project.urgencySignal, urgencyRange.min, urgencyRange.max);
    const gapNorm = normalize(project.demographicGap, gapRange.min, gapRange.max);
    const equityNorm = normalize(
      equityRaw(project.existingSanctionedWorksAtLocation),
      equityRange.min,
      equityRange.max
    );
    const schemeFitBonus = project.schemeFit ? project.coFundingPercent / 100 : 0;
    const overlapPenalty = project.overlapsExistingWork ? 1 : 0;

    const factors: ScoreBreakdown["factors"] = {
      demand: {
        raw: project.demandVolume,
        normalized: demandNorm,
        weight: weights.w1,
        contribution: weights.w1 * demandNorm,
      },
      urgency: {
        raw: project.urgencySignal,
        normalized: urgencyNorm,
        weight: weights.w2,
        contribution: weights.w2 * urgencyNorm,
      },
      demographicGap: {
        raw: project.demographicGap,
        normalized: gapNorm,
        weight: weights.w3,
        contribution: weights.w3 * gapNorm,
      },
      schemeFit: {
        raw: schemeFitBonus,
        normalized: schemeFitBonus,
        weight: weights.w4,
        contribution: weights.w4 * schemeFitBonus,
      },
      equity: {
        raw: project.existingSanctionedWorksAtLocation,
        normalized: equityNorm,
        weight: weights.w5,
        contribution: weights.w5 * equityNorm,
      },
      overlapPenalty: {
        raw: overlapPenalty,
        normalized: overlapPenalty,
        weight: weights.w6,
        contribution: -weights.w6 * overlapPenalty,
      },
    };

    const total =
      factors.demand.contribution +
      factors.urgency.contribution +
      factors.demographicGap.contribution +
      factors.schemeFit.contribution +
      factors.equity.contribution +
      factors.overlapPenalty.contribution;

    const breakdown: ScoreBreakdown = {
      projectId: project.id,
      projectName: project.name,
      total,
      factors,
    };
    return { project, breakdown };
  });

  breakdowns.sort((a, b) => b.breakdown.total - a.breakdown.total);

  return breakdowns.map((b, index) => ({ ...b, rank: index + 1 }));
}

/** Convenience for scoring a single project against a cohort without re-deriving ranks. */
export function scoreProject(
  project: ProjectFeatures,
  cohort: ProjectFeatures[],
  weights: ScoringWeights = DEFAULT_WEIGHTS
): ScoreBreakdown {
  const ranked = rankProjects(cohort.some((p) => p.id === project.id) ? cohort : [...cohort, project], weights);
  const found = ranked.find((r) => r.project.id === project.id);
  if (!found) {
    throw new Error(`Project ${project.id} not found in scored cohort`);
  }
  return found.breakdown;
}
