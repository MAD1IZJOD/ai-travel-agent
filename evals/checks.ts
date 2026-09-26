/**
 * Property checks. Each returns a named pass/fail with a human-readable
 * detail, so a failing eval says *what* went wrong, not just that it did.
 */
import { GUIDES } from "@/lib/data/guides";
import { PACE_RULES } from "@/lib/agent/itinerary";
import type { Interest, PlanStatus, TripPlan } from "@/lib/agent/types";
import { AGENT_STAGES } from "@/lib/agent/types";
import type { Check, EvalContext } from "./harness";

const result = (name: string, pass: boolean, detail: string) => ({ name, pass, detail });
const activities = (plan: TripPlan) => plan.days.flatMap((d) => d.activities);

function needPlan(name: string, ctx: EvalContext, run: (plan: TripPlan) => { pass: boolean; detail: string }) {
  if (!ctx.plan) return result(name, false, "No plan was produced");
  const { pass, detail } = run(ctx.plan);
  return result(name, pass, detail);
}

/* ------------------------------ understanding ------------------------------ */

export const extracted = (expected: Record<string, unknown>): Check => (ctx) => {
  const got = ctx.parsed?.constraints as Record<string, unknown> | undefined;
  const wrong = Object.entries(expected).filter(([k, v]) => JSON.stringify(got?.[k]) !== JSON.stringify(v));
  return result("extracts constraints", wrong.length === 0, wrong.length ? wrong.map(([k, v]) => `${k}: expected ${JSON.stringify(v)}, got ${JSON.stringify(got?.[k])}`).join("; ") : Object.keys(expected).join(", "));
};

export const hasIssue = (code: string, severity?: "blocking" | "warning" | "info"): Check => (ctx) => {
  const issue = ctx.parsed?.issues.find((i) => i.code === code);
  return result(`flags ${code}`, Boolean(issue) && (!severity || issue!.severity === severity), issue ? `${issue.severity}: ${issue.message}` : "not flagged");
};

export const noPlanUntilFixed: Check = (ctx) => result("waits for the traveller instead of planning", ctx.plan === null && ctx.result === null, ctx.plan ? "planned anyway" : "held back");

export const doesNotEcho = (pattern: RegExp): Check => (ctx) => {
  const text = JSON.stringify({ parsed: ctx.parsed, plan: ctx.plan });
  return result(`does not echo ${pattern}`, !pattern.test(text), pattern.test(text) ? "found in output" : "absent");
};

/* -------------------------------- planning -------------------------------- */

export const status = (...allowed: PlanStatus[]): Check => (ctx) =>
  needPlan(`status is ${allowed.join(" or ")}`, ctx, (plan) => ({ pass: allowed.includes(plan.status), detail: plan.status }));

export const withinBudget: Check = (ctx) =>
  needPlan("stays within budget", ctx, (plan) => ({ pass: plan.budget.total <= plan.constraints.budgetInr, detail: `₹${plan.budget.total} of ₹${plan.constraints.budgetInr}` }));

export const destinationIs = (...ids: string[]): Check => (ctx) =>
  needPlan(`destination in [${ids.join(", ")}]`, ctx, (plan) => ({ pass: ids.includes(plan.destination.id), detail: plan.destination.id }));

export const destinationStrongFor = (interest: Interest): Check => (ctx) =>
  needPlan(`destination is strong for ${interest}`, ctx, (plan) => {
    const score = GUIDES[plan.destination.id].interestScores[interest] ?? 0;
    return { pass: score >= 2, detail: `${plan.destination.id} scores ${score}/3` };
  });

export const coversInterests = (...interests: Interest[]): Check => (ctx) =>
  needPlan(`itinerary covers ${interests.join(" + ")}`, ctx, (plan) => {
    const missing = interests.filter((i) => !activities(plan).some((a) => a.interests.includes(i)));
    return { pass: missing.length === 0, detail: missing.length ? `missing ${missing.join(", ")}` : "all present" };
  });

export const onTopicShare = (min: number): Check => (ctx) =>
  needPlan(`≥${Math.round(min * 100)}% of activities match interests`, ctx, (plan) => {
    const acts = activities(plan);
    const share = acts.filter((a) => a.interests.some((i) => plan.constraints.interests.includes(i))).length / Math.max(1, acts.length);
    return { pass: share >= min, detail: `${Math.round(share * 100)}%` };
  });

export const foodPicksPerDay = (n: number): Check => (ctx) =>
  needPlan(`${n} food picks on full days`, ctx, (plan) => {
    const full = plan.days.filter((d) => d.kind === "full");
    return { pass: full.length > 0 && full.every((d) => d.food.length === n), detail: full.map((d) => d.food.length).join(",") };
  });

export const excludesActivity = (id: string): Check => (ctx) =>
  needPlan(`does not schedule ${id}`, ctx, (plan) => ({ pass: !activities(plan).some((a) => a.id === id), detail: activities(plan).map((a) => a.id).join(", ") }));

export const transportMode = (...modes: string[]): Check => (ctx) =>
  needPlan(`travels by ${modes.join("/")}`, ctx, (plan) => ({ pass: modes.includes(plan.transport.outbound.mode), detail: `${plan.transport.outbound.mode}, ${plan.transport.outbound.hours}h` }));

export const offersAdjustment = (id: string): Check => (ctx) => {
  const adjustments = ctx.plan?.adjustments ?? ctx.result?.blocked?.adjustments ?? [];
  const found = adjustments.find((a) => a.id === id);
  return result(`offers "${id}" adjustment`, Boolean(found), found ? found.label : `offered: ${adjustments.map((a) => a.id).join(", ") || "none"}`);
};

export const blocked = (reason: RegExp): Check => (ctx) =>
  result("blocks with an explanation", ctx.plan === null && reason.test(ctx.result?.blocked?.reason ?? ""), ctx.result?.blocked?.reason ?? "not blocked");

/* ------------------------------- replanning ------------------------------- */

export const keptDestination: Check = (ctx) =>
  result("keeps the destination", Boolean(ctx.plan && ctx.before && ctx.plan.destination.id === ctx.before.destination.id), `${ctx.before?.destination.id} → ${ctx.plan?.destination.id}`);

export const diffSummary = (pattern: RegExp): Check => (ctx) =>
  result(`diff summary matches ${pattern}`, pattern.test(ctx.result?.diff?.summary ?? ""), ctx.result?.diff?.summary ?? "no diff");

export const diffExplains = (area: string, why: RegExp): Check => (ctx) => {
  const change = ctx.result?.diff?.changes.find((c) => c.area === area);
  return result(`explains ${area} change`, Boolean(change) && why.test(change!.why), change ? change.why : "no change recorded");
};

export const moreActivitiesThanBefore: Check = (ctx) => {
  const before = ctx.before ? activities(ctx.before).length : 0;
  const after = ctx.plan ? activities(ctx.plan).length : 0;
  return result("adds activities", after > before, `${before} → ${after}`);
};

export const cheaperThanBefore: Check = (ctx) =>
  result("costs less than before", Boolean(ctx.plan && ctx.before && ctx.plan.budget.total < ctx.before.budget.total), `₹${ctx.before?.budget.total} → ₹${ctx.plan?.budget.total}`);

/* ------------------------------ tools & grounding ------------------------------ */

export const noVerifiedWikipedia: Check = (ctx) =>
  needPlan("no Wikipedia claims when Wikipedia failed", ctx, (plan) => {
    const wiki = plan.sources.filter((s) => s.id.startsWith("wiki:"));
    return { pass: wiki.length === 0, detail: `${wiki.length} wiki sources` };
  });

export const noticeMentions = (pattern: RegExp): Check => (ctx) =>
  needPlan(`notices mention ${pattern}`, ctx, (plan) => ({ pass: plan.notices.some((n) => pattern.test(n)), detail: plan.notices.join(" | ") || "no notices" }));

export const descriptionExcludes = (pattern: RegExp): Check => (ctx) =>
  needPlan(`description free of ${pattern}`, ctx, (plan) => ({ pass: !pattern.test(plan.destination.description), detail: plan.destination.description.slice(0, 120) }));

export const toolCallRecorded = (tool: "wikipedia" | "weather", statusValue: string): Check => (ctx) =>
  needPlan(`records ${tool} call as ${statusValue}`, ctx, (plan) => {
    const call = plan.research.find((c) => c.tool === tool && c.status === statusValue);
    return { pass: Boolean(call), detail: plan.research.map((c) => `${c.tool}:${c.status}`).join(", ") };
  });

/* ------------------------- universal invariants (every plan) ------------------------- */

export const UNIVERSAL: Check[] = [
  (ctx) => needPlan("[inv] one day per requested day", ctx, (plan) => ({ pass: plan.days.length === plan.constraints.days, detail: `${plan.days.length}/${plan.constraints.days}` })),
  (ctx) =>
    needPlan("[inv] fits budget or asks for approval", ctx, (plan) => ({
      pass: plan.budget.remaining >= 0 || (plan.status === "needs-approval" && plan.adjustments.length > 0),
      detail: `${plan.status}, remaining ₹${plan.budget.remaining}`,
    })),
  (ctx) =>
    needPlan("[inv] respects the pace ceiling", ctx, (plan) => {
      const busiest = Math.max(0, ...plan.days.map((d) => d.activities.length));
      return { pass: busiest <= PACE_RULES[plan.constraints.pace].maxPerDay, detail: `busiest day ${busiest}` };
    }),
  (ctx) =>
    needPlan("[inv] no repeated activities", ctx, (plan) => {
      const ids = activities(plan).map((a) => a.id);
      return { pass: new Set(ids).size === ids.length, detail: `${ids.length} activities` };
    }),
  (ctx) =>
    needPlan("[inv] budget parts add up", ctx, (plan) => {
      const b = plan.budget;
      return { pass: b.transport + b.stay + b.food + b.activities + b.localTravel + b.buffer === b.total, detail: `total ₹${b.total}` };
    }),
  (ctx) =>
    needPlan("[inv] verified sources are traceable", ctx, (plan) => {
      const bad = plan.sources.filter((s) => s.kind === "verified" && (!s.url || !s.retrievedAt));
      const fabricatedUrls = plan.sources.filter((s) => s.kind !== "verified" && s.url);
      return { pass: bad.length === 0 && fabricatedUrls.length === 0, detail: `${plan.sources.filter((s) => s.kind === "verified").length} verified` };
    }),
  (ctx) =>
    needPlan("[inv] activity citations resolve", ctx, (plan) => {
      const ids = new Set(plan.sources.map((s) => s.id));
      const dangling = activities(plan).flatMap((a) => a.sourceIds).filter((id) => !ids.has(id));
      return { pass: dangling.length === 0, detail: dangling.length ? dangling.join(", ") : "all resolve" };
    }),
  (ctx) =>
    needPlan("[inv] hard checks agree with status", ctx, (plan) => {
      const failing = plan.checks.some((c) => c.hard && c.status === "fail");
      return { pass: failing === (plan.status === "needs-approval"), detail: `${plan.status}, hard fails: ${failing}` };
    }),
  (ctx) => {
    const finished = ctx.stages.filter((s) => s.status !== "running").map((s) => s.stage);
    return result("[inv] trajectory: every stage reported in order", JSON.stringify(finished) === JSON.stringify([...AGENT_STAGES]), finished.join(" → "));
  },
];
