/**
 * The travel agent: one coherent loop over clearly separated stages.
 *
 *   understand → research → plan → validate (and revise) → finalize
 *
 * Each stage reports what it actually did through `emit`, which the API
 * streams to the UI — progress is never simulated.
 */
import { DESTINATIONS, findDestination, getOrigin } from "@/lib/data/places";
import type { ResearchTools } from "@/lib/tools";
import { INTEREST_LABELS, PACE_LABELS, STAY_LABELS, formatInr, pluralize } from "@/lib/format";
import { estimateCandidate } from "./planner";
import { FIELD_NOUNS, chooseReplanDestination, changedFields, diffPlans } from "./replan";
import { applyResearch, gatherResearch, type ResearchData } from "./research";
import { planWithRevisions } from "./reviser";
import { rankDestinations } from "./selector";
import type { AgentEvent, AgentStage, PlanDiff, PlanSnapshot, StageEvent, TripConstraints, TripPlan } from "./types";
import { validatePlan } from "./validator";

export interface AgentInput {
  constraints: TripConstraints;
  previous?: PlanSnapshot;
}

export interface AgentDeps {
  tools: ResearchTools;
  today: string;
  emit: (event: AgentEvent) => void;
}

function stage(emit: AgentDeps["emit"], name: AgentStage, status: StageEvent["status"], detail: string) {
  emit({ type: "stage", stage: name, status, detail });
}

function describeRequest(c: TripConstraints): string {
  return [
    `${pluralize(c.days, "day")} from ${getOrigin(c.originId).name}`,
    pluralize(c.travelers, "traveller"),
    formatInr(c.budgetInr),
    c.interests.map((i) => INTEREST_LABELS[i].toLowerCase()).join(" + "),
    PACE_LABELS[c.pace].label.toLowerCase(),
  ].join(" · ");
}

export async function runAgent({ constraints, previous }: AgentInput, { tools, today, emit }: AgentDeps): Promise<void> {
  // 1. Understand
  stage(emit, "understand", "running", "Reading your trip details");
  const changed = previous ? changedFields(previous.constraints, constraints) : [];
  stage(
    emit,
    "understand",
    "done",
    previous
      ? changed.length > 0
        ? `Replanning for your ${changed.map((f) => FIELD_NOUNS[f]).join(", ")}`
        : "Nothing changed — refreshing the plan"
      : describeRequest(constraints),
  );

  // 2. Research: compare destinations, then look up the chosen one
  stage(emit, "research", "running", constraints.destinationId ? "Checking your destination" : `Comparing ${DESTINATIONS.length} destinations`);
  const ranked = rankDestinations(constraints, (id) => estimateCandidate(constraints, id));
  const choice = previous
    ? chooseReplanDestination(previous, constraints, ranked)
    : { destinationId: constraints.destinationId ?? ranked[0].id, locked: Boolean(constraints.destinationId) };
  const chosenName = findDestination(choice.destinationId)?.name ?? choice.destinationId;

  let research: ResearchData = await gatherResearch(constraints, choice.destinationId, tools, today);
  const lookupsOk = research.calls.filter((c) => c.status === "ok" || c.status === "filtered").length;
  const lookupsFailed = research.calls.filter((c) => c.status === "failed").length;
  const comparison = constraints.destinationId
    ? `${chosenName}, as you asked`
    : previous && choice.destinationId === previous.destinationId
      ? `Kept ${chosenName} — still the best fit`
      : `Compared ${DESTINATIONS.length} destinations — ${chosenName} fits best`;
  const lookups = tools.offline ? "live lookups are off" : lookupsFailed > 0 ? `${lookupsOk} live lookups worked, ${lookupsFailed} didn't` : `checked ${lookupsOk} live sources`;
  stage(emit, "research", lookupsFailed > 0 || tools.offline ? "warning" : "done", `${comparison}; ${lookups}`);

  // 3. Plan (with revisions when a hard constraint breaks)
  stage(emit, "plan", "running", `Building a ${constraints.days}-day plan for ${chosenName}`);
  const outcome = planWithRevisions({
    constraints,
    destinationId: choice.destinationId,
    ranked,
    locked: choice.locked,
    preferredActivityIds: previous?.activityIds,
  });

  if (!outcome.plan) {
    stage(emit, "plan", "warning", outcome.blockedReason ?? "This trip can't be planned as asked");
    emit({ type: "result", plan: null, diff: null, blocked: { reason: outcome.blockedReason ?? "This trip can't be planned as asked.", adjustments: outcome.adjustments } });
    return;
  }

  const activityCount = outcome.plan.days.reduce((n, d) => n + d.activities.length, 0);
  stage(emit, "plan", "done", `${pluralize(activityCount, "activity", "activities")} across ${pluralize(constraints.days, "day")}, ${STAY_LABELS[outcome.plan.stay.tier].toLowerCase()} stay in ${outcome.plan.stay.area}`);

  // 4. Validate (research is attached first so weather feeds the checks)
  stage(emit, "validate", "running", "Checking the plan against your constraints");
  if (research.destinationId !== outcome.plan.destination.id) {
    research = await gatherResearch(constraints, outcome.plan.destination.id, tools, today);
  }
  let plan: TripPlan = applyResearch(outcome.plan, research);
  plan = { ...plan, checks: validatePlan(plan, constraints) };

  const hardFails = plan.checks.filter((c) => c.hard && c.status === "fail");
  const saved = plan.revisions.reduce((sum, r) => sum + (r.savedInr ?? 0), 0);
  stage(
    emit,
    "validate",
    hardFails.length > 0 ? "warning" : "done",
    hardFails.length > 0
      ? `${hardFails.map((c) => c.label).join(", ")} can't be met as asked — your call`
      : plan.revisions.length > 0
        ? `Made ${pluralize(plan.revisions.length, "change")} to fit your constraints, saving ${formatInr(saved)}; all hard checks pass`
        : `All ${plan.checks.filter((c) => c.hard).length} hard checks pass`,
  );

  // 5. Finalize
  const diff: PlanDiff | null = previous ? diffPlans(previous, plan) : null;
  stage(emit, "finalize", "done", diff ? diff.summary : `Estimated ${formatInr(plan.budget.total)} of ${formatInr(plan.budget.budget)}`);
  emit({ type: "result", plan, diff, blocked: null });
}
