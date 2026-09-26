/**
 * Regression tests for "the app shows the previous trip's data".
 * Root causes: hyphenated interests were missed, so a model timeout fell back
 * to default interests; the model echoed the origin as a destination; and
 * nothing stopped an older response from overwriting a newer one.
 */
import { describe, expect, it } from "vitest";
import { parseTripRequest } from "@/lib/agent/parser";
import { understandRequest } from "@/lib/agent/understand";
import { createLatestOnly } from "@/lib/latestOnly";

const today = "2026-09-26";

describe("each request produces its own data", () => {
  it("reads hyphenated interests without needing a model", () => {
    expect(parseTripRequest("Plan a 3 day history-focused trip from Mumbai for 1 person under ₹20,000.", { today }).constraints.interests).toEqual(["history"]);
    expect(parseTripRequest("Plan a 2 day food-focused trip from Delhi for 2 people under ₹10,000.", { today }).constraints.interests).toEqual(["food"]);
    expect(parseTripRequest("a nature-heavy, beach-y week from Chennai", { today }).constraints.interests).toEqual(expect.arrayContaining(["nature", "beach"]));
  });

  it("sequential different requests never carry over each other's values", () => {
    const requests = [
      ["Plan a 6 day relaxed nature and food trip from Delhi for 2 people under ₹50,000.", { originId: "delhi", days: 6, travelers: 2, budgetInr: 50_000, interests: ["nature", "food"], pace: "relaxed" }],
      ["Plan a 3 day history-focused trip from Mumbai for 1 person under ₹20,000.", { originId: "mumbai", days: 3, travelers: 1, budgetInr: 20_000, interests: ["history"] }],
      ["Plan a 8 day beach trip from Bangalore for 4 people under ₹80,000 with a packed itinerary.", { originId: "bengaluru", days: 8, travelers: 4, budgetInr: 80_000, interests: ["beach"], pace: "packed" }],
      ["Plan a 2 day food-focused trip from Delhi for 2 people under ₹10,000.", { originId: "delhi", days: 2, travelers: 2, budgetInr: 10_000, interests: ["food"] }],
    ] as const;
    for (const [text, expected] of requests) expect(parseTripRequest(text, { today }).constraints).toMatchObject(expected);
  });

  it("ignores a model echoing the departure city as the destination", async () => {
    const result = await understandRequest("Plan a 2 day food trip from Delhi for 2 people", {
      today,
      llm: { label: "test", extract: async () => ({ origin_city: "Delhi", destination: "Delhi", travelers: 2, days: 2, budget_inr: null, budget_is_per_person: false, interests: ["food"], pace: null, start_date: null }) },
    });
    expect(result.issues.map((i) => i.code)).not.toContain("unsupported-destination");
    expect(result.constraints.destinationId).toBeNull();
  });
});

describe("latest request wins", () => {
  const settle = (ms: number, value: string) => new Promise<string>((resolve) => setTimeout(() => resolve(value), ms));

  it("A starts, B starts, B finishes, A finishes late: B stays on screen", async () => {
    const guard = createLatestOnly();
    let shown = "";
    const request = async (name: string, ms: number) => {
      const ticket = guard.next();
      const value = await settle(ms, name);
      if (ticket.isCurrent()) shown = value;
      return ticket;
    };
    const a = request("A", 40);
    const b = request("B", 5);
    await Promise.all([a, b]);
    expect(shown).toBe("B");
    expect((await a).signal.aborted).toBe(true);
  });

  it("rapid A → B → C shows C", async () => {
    const guard = createLatestOnly();
    let shown = "";
    await Promise.all(
      [["A", 30], ["B", 20], ["C", 10]].map(async ([name, ms]) => {
        const ticket = guard.next();
        const value = await settle(ms as number, name as string);
        if (ticket.isCurrent()) shown = value;
      }),
    );
    expect(shown).toBe("C");
  });

  it("a failed newer request is not replaced by an older success", async () => {
    const guard = createLatestOnly();
    let shown = "none";
    const older = guard.next();
    const newer = guard.next();
    if (newer.isCurrent()) shown = "error for B";
    await settle(5, "");
    if (older.isCurrent()) shown = "A";
    expect(shown).toBe("error for B");
  });

  it("cancel() drops everything in flight", () => {
    const guard = createLatestOnly();
    const ticket = guard.next();
    guard.cancel();
    expect(ticket.isCurrent()).toBe(false);
    expect(ticket.signal.aborted).toBe(true);
  });
});
