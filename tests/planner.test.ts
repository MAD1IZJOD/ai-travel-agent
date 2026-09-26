import { describe, expect, it } from "vitest";
import { GUIDES } from "@/lib/data/guides";
import { buildPlan, draftTrip, initialOptions, selectDestination, CHEAPEST_OPTIONS } from "@/lib/agent/planner";
import { PACE_RULES } from "@/lib/agent/itinerary";
import type { TripConstraints, TripPlan } from "@/lib/agent/types";

const base: TripConstraints = {
  originId: "delhi",
  destinationId: null,
  travelers: 2,
  days: 6,
  budgetInr: 50_000,
  interests: ["nature", "food"],
  pace: "relaxed",
  startDate: "2026-10-17",
};

const plan = (overrides: Partial<TripConstraints> = {}): TripPlan => {
  const draft = draftTrip({ ...base, ...overrides });
  expect(draft.feasible).toBe(true);
  return draft.plan!;
};

const activities = (p: TripPlan) => p.days.flatMap((d) => d.activities);

describe("plan structure", () => {
  it("has exactly one day per requested day, with consecutive dates", () => {
    for (const days of [1, 2, 4, 6, 10]) {
      const p = plan({ days, destinationId: "jaipur" });
      expect(p.days).toHaveLength(days);
      expect(p.days[0].date).toBe(base.startDate);
      p.days.forEach((d, i) => expect(d.day).toBe(i + 1));
    }
  });

  it("never repeats an activity", () => {
    const p = plan({ days: 10, pace: "packed" });
    const ids = activities(p).map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("adds up the budget correctly", () => {
    const p = plan();
    const { transport, stay, food, activities: acts, localTravel, buffer, total, budget, remaining } = p.budget;
    expect(transport + stay + food + acts + localTravel + buffer).toBe(total);
    expect(budget - total).toBe(remaining);
    expect(stay).toBe(p.stay.nightlyRateInr * p.stay.rooms * p.stay.nights);
    expect(acts).toBe(activities(p).reduce((s, a) => s + a.costInr, 0));
  });

  it("books one hotel room per two travellers and one night fewer than days on a daytime trip", () => {
    const p = plan({ travelers: 3, destinationId: "jaipur" });
    expect(p.stay.rooms).toBe(2);
    expect(p.stay.nights).toBe(base.days - 1);
  });

  it("scales costs with the number of travellers", () => {
    const two = buildPlan({ ...base, destinationId: "jaipur" }, "jaipur", CHEAPEST_OPTIONS).plan!;
    const four = buildPlan({ ...base, destinationId: "jaipur", travelers: 4 }, "jaipur", CHEAPEST_OPTIONS).plan!;
    expect(four.budget.transport).toBeGreaterThan(two.budget.transport);
    expect(four.budget.food).toBe(two.budget.food * 2);
  });
});

describe("personalisation", () => {
  it("relaxed trips never exceed two activities a day", () => {
    const p = plan({ pace: "relaxed" });
    for (const day of p.days) expect(day.activities.length).toBeLessThanOrEqual(PACE_RULES.relaxed.maxPerDay);
  });

  it("packed trips are denser than relaxed ones", () => {
    const relaxed = activities(plan({ pace: "relaxed", destinationId: "jaipur", interests: ["history", "culture"], days: 3 })).length;
    const packed = activities(plan({ pace: "packed", destinationId: "jaipur", interests: ["history", "culture"], days: 3 })).length;
    expect(packed).toBeGreaterThan(relaxed);
  });

  it("a nature-focused trip is mostly nature", () => {
    const acts = activities(plan({ interests: ["nature"] }));
    const nature = acts.filter((a) => a.interests.includes("nature"));
    expect(nature.length / acts.length).toBeGreaterThanOrEqual(0.5);
  });

  it("a food-focused trip includes food experiences and extra food picks", () => {
    const p = plan({ interests: ["food", "history"], destinationId: "jaipur" });
    expect(activities(p).some((a) => a.interests.includes("food"))).toBe(true);
    const fullDay = p.days.find((d) => d.kind === "full")!;
    expect(fullDay.food.length).toBe(3);
  });

  it("picks a beach destination for a beach lover", () => {
    expect(selectDestination({ ...base, originId: "mumbai", interests: ["beach", "nightlife"] }).chosen.id).toBe("goa");
  });

  it("picks a history-strong destination for a history lover", () => {
    const { chosen } = selectDestination({ ...base, interests: ["history"] });
    expect(GUIDES[chosen.id].interestScores.history).toBeGreaterThanOrEqual(3);
  });

  it("respects a destination the traveller named", () => {
    expect(plan({ destinationId: "varanasi" }).destination.id).toBe("varanasi");
  });

  it("chooses richer stays when the budget allows", () => {
    expect(initialOptions({ ...base, budgetInr: 25_000 }, "jaipur").stayTier).toBe("budget");
    expect(initialOptions({ ...base, budgetInr: 150_000 }, "jaipur").stayTier).toBe("comfort");
  });
});

describe("practicality", () => {
  it("origin changes the transport plan", () => {
    const fromMumbai = plan({ originId: "mumbai", destinationId: "goa" });
    const fromDelhi = plan({ originId: "delhi", destinationId: "goa", budgetInr: 120_000 });
    expect(fromDelhi.transport.outbound.hours).not.toBe(fromMumbai.transport.outbound.hours);
    expect(fromDelhi.transport.totalInr).toBeGreaterThan(fromMumbai.transport.totalInr);
  });

  it("skips seasonal activities out of season", () => {
    const july = plan({ destinationId: "rishikesh", startDate: "2027-07-10", interests: ["adventure"], days: 8 });
    expect(activities(july).map((a) => a.id)).not.toContain("rsk-rafting");
    const october = plan({ destinationId: "rishikesh", interests: ["adventure"], days: 8 });
    expect(activities(october).map((a) => a.id)).toContain("rsk-rafting");
  });

  it("reports travel time between stops", () => {
    const acts = activities(plan());
    expect(acts.every((a) => Number.isFinite(a.travelMinutes) && a.travelMinutes >= 0)).toBe(true);
    expect(acts.some((a) => a.travelMinutes > 0)).toBe(true);
  });

  it("refuses a trip where travel takes longer than the trip", () => {
    const draft = buildPlan({ ...base, originId: "kolkata", destinationId: "goa", days: 1 }, "goa", CHEAPEST_OPTIONS);
    expect(draft.feasible).toBe(false);
  });

  it("does not pick an unreachable destination for a one-day trip", () => {
    const { chosen } = selectDestination({ ...base, days: 1 });
    expect(Number.isFinite(chosen.score)).toBe(true);
    expect(chosen.estimate.oneWayHours).toBeLessThan(8);
  });

  it("explains the transport choice", () => {
    expect(plan().transport.rationale).toMatch(/cost|cheapest|only practical/);
    expect(plan().transport.rationale).not.toMatch(/₹-|-\d+ hr/);
  });
});
