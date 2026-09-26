/**
 * Guards against vacuous evals: every check must actually fail on a plan
 * that breaks the property it claims to measure.
 */
import { describe, expect, it } from "vitest";
import type { TripPlan } from "@/lib/agent/types";
import * as c from "./checks";
import { runCase, type EvalContext } from "./harness";

async function goodContext(): Promise<EvalContext> {
  return runCase({ id: "sanity", title: "sanity", category: "planning", constraints: { destinationId: "jaipur", interests: ["history", "food"], pace: "relaxed", days: 4, budgetInr: 50_000 }, checks: [] });
}

const withPlan = (ctx: EvalContext, mutate: (plan: TripPlan) => TripPlan): EvalContext => ({ ...ctx, plan: mutate(structuredClone(ctx.plan!)) });
const universal = (name: string) => c.UNIVERSAL.find((check) => check({ parsed: null, constraints: null, stages: [], result: null, plan: null, before: null }).name === name)!;

describe("eval checks detect broken plans", () => {
  it("passes a good plan", async () => {
    const ctx = await goodContext();
    for (const check of [c.withinBudget, c.coversInterests("history"), ...c.UNIVERSAL]) expect(check(ctx).pass).toBe(true);
  });

  it("fails an over-budget plan", async () => {
    const ctx = withPlan(await goodContext(), (p) => ({ ...p, budget: { ...p.budget, total: 99_000, remaining: -49_000 } }));
    expect(c.withinBudget(ctx).pass).toBe(false);
    expect(universal("[inv] fits budget or asks for approval")(ctx).pass).toBe(false);
    expect(universal("[inv] budget parts add up")(ctx).pass).toBe(false);
  });

  it("fails a crammed relaxed day", async () => {
    const ctx = withPlan(await goodContext(), (p) => {
      p.days[1].activities = [...p.days[1].activities, ...p.days[2].activities, ...p.days[3].activities];
      return p;
    });
    expect(universal("[inv] respects the pace ceiling")(ctx).pass).toBe(false);
  });

  it("fails fabricated or dangling sources", async () => {
    const fabricated = withPlan(await goodContext(), (p) => ({ ...p, sources: [...p.sources, { id: "estimate:x", label: "Made up", kind: "estimated", url: "https://example.com" }] }));
    expect(universal("[inv] verified sources are traceable")(fabricated).pass).toBe(false);
    const dangling = withPlan(await goodContext(), (p) => {
      p.days[0].activities[0].sourceIds.push("wiki:Nowhere");
      return p;
    });
    expect(universal("[inv] activity citations resolve")(dangling).pass).toBe(false);
  });

  it("fails a plan missing a requested interest or with the wrong length", async () => {
    const ctx = await goodContext();
    expect(c.coversInterests("beach")(ctx).pass).toBe(false);
    expect(universal("[inv] one day per requested day")(withPlan(ctx, (p) => ({ ...p, days: p.days.slice(1) }))).pass).toBe(false);
  });

  it("fails a broken trajectory", async () => {
    const ctx = await goodContext();
    expect(universal("[inv] trajectory: every stage reported in order")({ ...ctx, stages: ctx.stages.slice(2) }).pass).toBe(false);
  });
});
