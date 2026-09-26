/**
 * Revision loop: when a plan breaks a hard constraint, change the plan — not
 * the traveller's requirements — in small, explainable steps. If that still
 * can't work, stop and offer concrete adjustments for the traveller to
 * approve instead of presenting an impossible trip.
 */
import { findDestination } from "@/lib/data/places";
import { MODE_LABELS, STAY_LABELS, formatInr } from "@/lib/format";
import { roundTo } from "./geo";
import { LIMITS } from "./limits";
import { buildPlan, CHEAPEST_OPTIONS, initialOptions, type PlanOptions } from "./planner";
import { interestFit, type DestinationCandidate } from "./selector";
import type { Adjustment, PlanRevision, PlanStatus, StayTier, TripConstraints, TripPlan } from "./types";
import { failingHardChecks, validatePlan } from "./validator";

const TIER_ORDER: StayTier[] = ["budget", "mid", "comfort"];
/** A fallback destination must still suit at least this share of the traveller's interests. */
const MIN_FALLBACK_FIT = 0.5;
const BUDGET_ROUNDING = 1_000;

function cheaperTier(tier: StayTier): StayTier | null {
  const index = TIER_ORDER.indexOf(tier);
  return index > 0 ? TIER_ORDER[index - 1] : null;
}

interface LadderStep {
  apply: (options: PlanOptions) => PlanOptions | null;
  describe: (before: TripPlan, after: TripPlan) => string;
}

const LADDER: LadderStep[] = [
  {
    apply: (o) => (o.transportStrategy === "cheapest" ? null : { ...o, transportStrategy: "cheapest" }),
    describe: (before, after) =>
      before.transport.outbound.mode === after.transport.outbound.mode
        ? "Chose the cheapest way to travel"
        : `Switched from ${MODE_LABELS[before.transport.outbound.mode].toLowerCase()} to the cheaper ${MODE_LABELS[after.transport.outbound.mode].toLowerCase()}`,
  },
  {
    apply: (o) => {
      const tier = cheaperTier(o.stayTier);
      return tier ? { ...o, stayTier: tier } : null;
    },
    describe: (before, after) => `Moved from ${STAY_LABELS[before.stay.tier].toLowerCase()} to ${STAY_LABELS[after.stay.tier].toLowerCase()} stays`,
  },
  {
    apply: (o) => {
      const tier = cheaperTier(o.foodTier);
      return tier ? { ...o, foodTier: tier } : null;
    },
    describe: () => "Planned more meals at local eateries",
  },
  {
    apply: (o) => (o.sharedLocalTransport ? null : { ...o, sharedLocalTransport: true }),
    describe: () => "Use autos and shared jeeps locally instead of private cabs",
  },
  {
    apply: (o) => (o.frugalActivities ? null : { ...o, frugalActivities: true }),
    describe: () => "Swapped pricey activities for free ones where possible",
  },
  {
    apply: (o) => {
      const tier = cheaperTier(o.stayTier);
      return tier ? { ...o, stayTier: tier } : null;
    },
    describe: (before, after) => `Moved from ${STAY_LABELS[before.stay.tier].toLowerCase()} to ${STAY_LABELS[after.stay.tier].toLowerCase()} stays`,
  },
  {
    apply: (o) => {
      const tier = cheaperTier(o.foodTier);
      return tier ? { ...o, foodTier: tier } : null;
    },
    describe: () => "Planned more meals at local eateries",
  },
];

interface FitResult {
  plan: TripPlan;
  options: PlanOptions;
  revisions: PlanRevision[];
  fits: boolean;
}

/** Walk down the ladder until the plan fits the budget or there is nothing left to cut. */
export function fitToBudget(
  constraints: TripConstraints,
  destinationId: string,
  start: PlanOptions,
  selection?: Parameters<typeof buildPlan>[3],
): FitResult | null {
  let options = start;
  const first = buildPlan(constraints, destinationId, options, selection).plan;
  if (!first) return null;
  let plan = first;
  const revisions: PlanRevision[] = [];

  for (const step of LADDER) {
    if (plan.budget.remaining >= 0) break;
    const next = step.apply(options);
    if (!next) continue;
    const candidate = buildPlan(constraints, destinationId, next, selection).plan;
    if (!candidate || candidate.budget.total >= plan.budget.total) {
      options = next; // Keep the cheaper setting even if it didn't move the total, so later steps compound.
      continue;
    }
    revisions.push({
      step: step.describe(plan, candidate),
      reason: `The plan was ${formatInr(-plan.budget.remaining)} over budget.`,
      savedInr: plan.budget.total - candidate.budget.total,
    });
    plan = candidate;
    options = next;
  }
  return { plan, options, revisions, fits: plan.budget.remaining >= 0 };
}

function cheapestTotal(constraints: TripConstraints, destinationId: string): number | null {
  return buildPlan(constraints, destinationId, CHEAPEST_OPTIONS).plan?.budget.total ?? null;
}

/** Concrete changes the traveller could approve, each priced by actually re-planning. */
export function proposeAdjustments(constraints: TripConstraints, destinationId: string, ranked: DestinationCandidate[]): Adjustment[] {
  const adjustments: Adjustment[] = [];
  const name = findDestination(destinationId)?.name ?? destinationId;
  const cheapest = cheapestTotal(constraints, destinationId);

  if (cheapest !== null && cheapest > constraints.budgetInr) {
    const needed = Math.min(LIMITS.maxBudgetInr, roundTo(cheapest + BUDGET_ROUNDING / 2, BUDGET_ROUNDING));
    adjustments.push({
      id: "raise-budget",
      label: `Raise the budget to ${formatInr(needed)}`,
      description: `Keeps all ${constraints.days} days in ${name}, with budget stays and mostly free activities.`,
      patch: { budgetInr: needed },
      estimatedTotalInr: cheapest,
    });
  }

  for (let days = constraints.days - 1; days >= 2; days--) {
    const total = cheapestTotal({ ...constraints, days }, destinationId);
    if (total !== null && total <= constraints.budgetInr) {
      adjustments.push({
        id: "shorten",
        label: `Shorten the trip to ${days} days`,
        description: `Stays within ${formatInr(constraints.budgetInr)} in ${name}.`,
        patch: { days },
        estimatedTotalInr: total,
      });
      break;
    }
  }

  const alternative = ranked.find((c) => {
    if (c.id === destinationId || !Number.isFinite(c.score)) return false;
    const total = c.estimate.minimumTotalInr;
    return total !== null && total <= constraints.budgetInr && interestFit(c.id, constraints.interests).fit >= MIN_FALLBACK_FIT;
  });
  if (alternative) {
    adjustments.push({
      id: "other-destination",
      label: `Go to ${alternative.name} instead`,
      description: `${alternative.reasons[0] ?? "Suits your interests"}, and fits ${formatInr(constraints.budgetInr)} for ${constraints.days} days.`,
      patch: { destinationId: alternative.id },
      estimatedTotalInr: alternative.estimate.minimumTotalInr!,
    });
  }

  return adjustments;
}

/** Longest travel requires at least this many days for the given destination. */
function minimumFeasibleDays(constraints: TripConstraints, destinationId: string): number | null {
  for (let days = constraints.days + 1; days <= LIMITS.maxDays; days++) {
    if (buildPlan({ ...constraints, days }, destinationId, CHEAPEST_OPTIONS).feasible) return days;
  }
  return null;
}

export interface RevisionInput {
  constraints: TripConstraints;
  destinationId: string;
  ranked: DestinationCandidate[];
  /** True when the traveller named the destination, or a replan should keep it. */
  locked: boolean;
  preferredActivityIds?: string[];
}

export interface RevisionOutcome {
  plan: TripPlan | null;
  status: PlanStatus;
  blockedReason: string | null;
  adjustments: Adjustment[];
}

export function planWithRevisions({ constraints, destinationId, ranked, locked, preferredActivityIds }: RevisionInput): RevisionOutcome {
  const candidate = ranked.find((c) => c.id === destinationId);
  const alternatives = locked ? [] : ranked.filter((c) => c.id !== destinationId && Number.isFinite(c.score)).slice(0, 2);
  const start: PlanOptions = { ...initialOptions(constraints, destinationId), preferredActivityIds };
  const primary = fitToBudget(constraints, destinationId, start, { candidate, alternatives });

  // Travel doesn't fit the trip length at all.
  if (!primary) {
    const name = findDestination(destinationId)?.name ?? destinationId;
    const fallback = locked ? null : ranked.find((c) => c.id !== destinationId && c.estimate.minimumTotalInr !== null);
    if (fallback) return planWithRevisions({ constraints, destinationId: fallback.id, ranked, locked: true, preferredActivityIds });
    const adjustments: Adjustment[] = [];
    const days = minimumFeasibleDays(constraints, destinationId);
    if (days) {
      adjustments.push({
        id: "lengthen",
        label: `Make it ${days} days`,
        description: `The shortest trip that leaves real time in ${name}.`,
        patch: { days },
        estimatedTotalInr: cheapestTotal({ ...constraints, days }, destinationId) ?? 0,
      });
    }
    const closer = ranked.find((c) => c.id !== destinationId && c.estimate.minimumTotalInr !== null);
    if (closer) {
      adjustments.push({
        id: "closer",
        label: `Go to ${closer.name} instead`,
        description: `${closer.reasons[0] ?? "Closer to home"} — reachable in a ${constraints.days}-day trip.`,
        patch: { destinationId: closer.id },
        estimatedTotalInr: closer.estimate.minimumTotalInr!,
      });
    }
    return {
      plan: null,
      status: "needs-approval",
      blockedReason: `Getting to ${name} and back takes longer than a ${constraints.days}-day trip allows.`,
      adjustments,
    };
  }

  let result = primary;
  const destinationRevisions: PlanRevision[] = [];

  // Over budget even after trimming: try another destination if the traveller left it open.
  if (!result.fits && !locked) {
    for (const other of ranked) {
      if (other.id === destinationId || !Number.isFinite(other.score)) continue;
      if (interestFit(other.id, constraints.interests).fit < MIN_FALLBACK_FIT) continue;
      if (other.estimate.minimumTotalInr === null || other.estimate.minimumTotalInr > constraints.budgetInr) continue;
      const attempt = fitToBudget(constraints, other.id, { ...initialOptions(constraints, other.id), preferredActivityIds }, { candidate: other, alternatives: [] });
      if (attempt?.fits) {
        destinationRevisions.push({
          step: `Switched from ${findDestination(destinationId)?.name} to ${other.name}`,
          reason: `${findDestination(destinationId)?.name} couldn't fit ${formatInr(constraints.budgetInr)} even at its cheapest.`,
          savedInr: result.plan.budget.total - attempt.plan.budget.total,
        });
        result = attempt;
        break;
      }
    }
  }

  const plan = result.plan;
  const revisions = [...result.revisions, ...destinationRevisions];
  const checks = validatePlan(plan, constraints);
  const failing = failingHardChecks(checks);
  const needsApproval = failing.length > 0;
  const adjustments = needsApproval ? proposeAdjustments(constraints, plan.destination.id, ranked) : [];
  const status: PlanStatus = needsApproval ? "needs-approval" : revisions.length > 0 ? "revised" : "ok";

  return {
    plan: { ...plan, checks, revisions, adjustments, status },
    status,
    blockedReason: null,
    adjustments,
  };
}
