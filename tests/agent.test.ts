import { describe, expect, it } from "vitest";
import { AGENT_STAGES, type TripConstraints, type TripPlan } from "@/lib/agent/types";
import { normalizeSnapshot, snapshotOf } from "@/lib/agent/replan";
import { validatePlan } from "@/lib/agent/validator";
import { planSnapshotSchema, planRequestSchema } from "@/lib/agent/schema";
import { run } from "./helpers/runAgent";

const reference: TripConstraints = {
  originId: "delhi",
  destinationId: null,
  travelers: 2,
  days: 6,
  budgetInr: 50_000,
  interests: ["nature", "food"],
  pace: "relaxed",
  startDate: "2026-10-17",
};

const check = (plan: TripPlan, id: string) => plan.checks.find((c) => c.id === id)!;
const activityIds = (plan: TripPlan) => plan.days.flatMap((d) => d.activities.map((a) => a.id));

describe("agent run", () => {
  it("reports every real stage in order and finishes with a valid plan", async () => {
    const { stages, result } = await run({ constraints: reference });
    const finished = stages.filter((s) => s.status !== "running").map((s) => s.stage);
    expect(finished).toEqual([...AGENT_STAGES]);
    expect(stages.every((s) => s.detail.length > 0)).toBe(true);

    const plan = result.plan!;
    expect(plan.days).toHaveLength(6);
    expect(plan.budget.total).toBeLessThanOrEqual(50_000);
    expect(plan.checks.filter((c) => c.hard).every((c) => c.status !== "fail")).toBe(true);
    expect(["ok", "revised"]).toContain(plan.status);
  });

  it("stage details describe what actually happened, including failed lookups", async () => {
    const { stages } = await run({ constraints: reference }, (await import("./helpers/fakeFetch")).fakeFetch({ wiki: () => new Response("", { status: 503 }) }));
    const research = stages.find((s) => s.stage === "research" && s.status !== "running")!;
    expect(research.status).toBe("warning");
    expect(research.detail).toMatch(/didn't/);
  });
});

describe("constraint validation", () => {
  it("catches a plan that breaks pace, duration and budget", async () => {
    const plan = (await run({ constraints: reference })).result.plan!;
    const crowded = { ...plan, days: plan.days.map((d, i) => (i === 1 ? { ...d, activities: [...d.activities, ...plan.days[2].activities, ...plan.days[3].activities] } : d)) };
    expect(validatePlan(crowded, reference).find((c) => c.id === "pace")?.status).toBe("fail");

    const short = { ...plan, days: plan.days.slice(0, 4) };
    expect(validatePlan(short, reference).find((c) => c.id === "duration")?.status).toBe("fail");

    const pricey = { ...plan, budget: { ...plan.budget, total: 70_000, remaining: -20_000 } };
    expect(validatePlan(pricey, reference).find((c) => c.id === "budget")?.status).toBe("fail");
  });

  it("flags a destination that doesn't serve the requested interests", async () => {
    const plan = (await run({ constraints: { ...reference, destinationId: "varanasi", interests: ["beach"] } })).result.plan!;
    expect(check(plan, "interests").status).toBe("warn");
  });
});

describe("budget revision", () => {
  it("revises a tight plan down to the budget and explains each step", async () => {
    const { result } = await run({ constraints: { ...reference, destinationId: "jaipur", budgetInr: 38_000, interests: ["history", "food"] } });
    const plan = result.plan!;
    expect(plan.status).toBe("revised");
    expect(plan.budget.total).toBeLessThanOrEqual(38_000);
    expect(plan.revisions.length).toBeGreaterThan(0);
    for (const revision of plan.revisions) {
      expect(revision.step.length).toBeGreaterThan(5);
      expect(revision.savedInr).toBeGreaterThan(0);
    }
    expect(plan.days).toHaveLength(6);
  });

  it("asks for approval instead of presenting an impossible budget", async () => {
    const constraints = { ...reference, budgetInr: 8_000 };
    const { result } = await run({ constraints });
    const plan = result.plan!;
    expect(plan.status).toBe("needs-approval");
    expect(check(plan, "budget").status).toBe("fail");
    expect(plan.adjustments.length).toBeGreaterThan(0);
    const raise = plan.adjustments.find((a) => a.id === "raise-budget")!;
    expect(raise.patch.budgetInr).toBeGreaterThan(8_000);

    // Approving the adjustment produces a plan that fits.
    const approved = await run({ constraints: { ...constraints, ...raise.patch } });
    expect(approved.result.plan!.budget.remaining).toBeGreaterThanOrEqual(0);
    expect(approved.result.plan!.status).not.toBe("needs-approval");
  });

  it("offers a shorter trip when that would fit", async () => {
    const { result } = await run({ constraints: { ...reference, destinationId: "jaipur", budgetInr: 12_000, days: 7 } });
    const shorten = result.plan!.adjustments.find((a) => a.id === "shorten");
    expect(shorten?.patch.days).toBeLessThan(7);
    expect(shorten!.estimatedTotalInr).toBeLessThanOrEqual(12_000);
  });
});

describe("infeasible requests", () => {
  it("blocks a trip where travel takes longer than the trip and proposes fixes", async () => {
    const constraints = { ...reference, originId: "kolkata", destinationId: "goa", days: 1 };
    const { result } = await run({ constraints });
    expect(result.plan).toBeNull();
    expect(result.blocked?.reason).toMatch(/longer than a 1-day trip/);
    const lengthen = result.blocked!.adjustments.find((a) => a.id === "lengthen")!;
    expect(lengthen.patch.days).toBeGreaterThan(1);

    const approved = await run({ constraints: { ...constraints, ...lengthen.patch, budgetInr: 100_000 } });
    expect(approved.result.plan?.destination.id).toBe("goa");
  });
});

describe("replanning", () => {
  async function replan(change: Partial<TripConstraints>, base: TripConstraints = reference) {
    const first = (await run({ constraints: base })).result.plan!;
    const second = await run({ constraints: { ...base, ...change }, previous: snapshotOf(first) });
    return { first, second: second.result.plan!, diff: second.result.diff! };
  }

  it("budget ₹50K → ₹35K: re-costs the trip, keeps the destination and interests", async () => {
    const { first, second, diff } = await replan({ budgetInr: 35_000 });
    expect(second.budget.total).toBeLessThanOrEqual(35_000);
    expect(second.destination.id).toBe(first.destination.id);
    expect(diff.changedConstraints.map((c) => c.field)).toEqual(["budgetInr"]);
    expect(diff.summary).toMatch(/lower budget/);
    expect(diff.summary).toMatch(/nature and food preferences were preserved/);
    expect(diff.preserved.join(" ")).toMatch(/Destination/);
    const kept = activityIds(second).filter((id) => activityIds(first).includes(id));
    expect(kept.length).toBeGreaterThan(0);
  });

  it("interest nature → history: the itinerary shifts to history and says why", async () => {
    const { second, diff } = await replan({ interests: ["history", "food"] });
    const history = second.days.flatMap((d) => d.activities).filter((a) => a.interests.includes("history"));
    expect(history.length).toBeGreaterThan(0);
    expect(diff.changes.some((c) => c.area === "itinerary" || c.area === "destination")).toBe(true);
    expect(diff.changes.find((c) => c.area === "itinerary" || c.area === "destination")!.why).toMatch(/history/i);
  });

  it("pace relaxed → packed: denser days, explained by the pace change", async () => {
    const base = { ...reference, destinationId: "jaipur", interests: ["history", "culture"] as TripConstraints["interests"], days: 4, budgetInr: 60_000 };
    const { first, second, diff } = await replan({ pace: "packed" }, base);
    expect(activityIds(second).length).toBeGreaterThan(activityIds(first).length);
    expect(diff.changes.find((c) => c.area === "itinerary")?.why).toMatch(/packed pace/i);
    expect(diff.preserved.join(" ")).toMatch(/Destination: Jaipur/);
  });

  it("no change: nothing but the plan is refreshed", async () => {
    const { diff } = await replan({});
    expect(diff.changedConstraints).toHaveLength(0);
    expect(diff.changes.filter((c) => c.area !== "budget")).toHaveLength(0);
  });
});

describe("replan input safety", () => {
  it("rebuilds display text from IDs instead of trusting the client", async () => {
    const plan = (await run({ constraints: reference })).result.plan!;
    const tampered = { ...snapshotOf(plan), destinationName: "<img src=x onerror=alert(1)>", activityNames: snapshotOf(plan).activityNames.map(() => "Free iPhone") };
    const clean = normalizeSnapshot(planSnapshotSchema.parse(tampered));
    expect(clean.destinationName).toBe(plan.destination.name);
    expect(clean.activityNames).not.toContain("Free iPhone");
  });

  it("rejects malformed or oversized plan requests", () => {
    expect(planRequestSchema.safeParse({ constraints: { ...reference, days: 400 } }).success).toBe(false);
    expect(planRequestSchema.safeParse({ constraints: { ...reference, budgetInr: -5 } }).success).toBe(false);
    expect(planRequestSchema.safeParse({ constraints: { ...reference, originId: "london" } }).success).toBe(false);
    expect(planRequestSchema.safeParse({ constraints: reference, extra: "field" }).success).toBe(false);
    expect(planRequestSchema.safeParse({ constraints: reference, previous: { activityIds: ["../../etc/passwd"] } }).success).toBe(false);
  });
});
