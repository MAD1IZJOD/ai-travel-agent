/**
 * LLM-as-a-judge: a local model (default Qwen3 8B via Ollama) scores finished
 * plans against a rubric. A deliberately broken "control" plan checks that the
 * judge can tell good from bad before its scores are trusted.
 *
 *   npm run eval:judge          (needs Ollama running with the judge model)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { TripPlan } from "@/lib/agent/types";
import { CASES } from "../dataset";
import { runCase } from "../harness";

const OLLAMA = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
const MODEL = process.env.JUDGE_MODEL || "qwen3:8b";
const JUDGED_CASES = ["reference-request", "group-beach-weekend", "history-focus", "food-focus", "replan-budget-down"];
const CRITERIA = ["constraint_fit", "personalisation", "pacing", "practicality"] as const;

const verdictSchema = z.object({
  constraint_fit: z.number().int().min(1).max(5),
  personalisation: z.number().int().min(1).max(5),
  pacing: z.number().int().min(1).max(5),
  practicality: z.number().int().min(1).max(5),
  problems: z.array(z.string().max(300)).max(8),
});
type Verdict = z.infer<typeof verdictSchema>;

const RUBRIC = `You are a strict reviewer of travel itineraries. You receive a traveller's constraints and a plan as JSON.
Score each criterion from 1 (poor) to 5 (excellent). Judge only what is in the JSON; do not assume facts that are not there.
- constraint_fit: total cost within budget, correct number of days and travellers, starts from the right city.
- personalisation: activities and food match the stated interests.
- pacing: activity count per day matches the requested pace (relaxed ≈ 1–2, balanced ≈ 3, packed ≈ 4+), with sensible travel time between stops.
- practicality: timings are realistic, transport choice is sensible for the distance, days flow logically.
List concrete problems you see (empty list if none). Be critical: do not give 5s by default.`;

function digest(plan: TripPlan) {
  const c = plan.constraints;
  return {
    constraints: { from: c.originId, travellers: c.travelers, days: c.days, budgetInr: c.budgetInr, interests: c.interests, pace: c.pace },
    destination: plan.destination.name,
    transport: { mode: plan.transport.outbound.mode, hoursEachWay: plan.transport.outbound.hours, overnight: plan.transport.outbound.overnight },
    estimatedTotalInr: plan.budget.total,
    days: plan.days.map((d) => ({
      day: d.day,
      kind: d.kind,
      activities: d.activities.map((a) => ({ time: a.startTime, name: a.name, hours: a.durationHours, interests: a.interests, travelMinutesBefore: a.travelMinutes })),
      food: d.food.map((f) => f.name),
    })),
  };
}

/** The same plan with the pace, interests and budget deliberately broken. */
function brokenControl(plan: TripPlan): ReturnType<typeof digest> {
  const d = digest(plan);
  const nightlife = { time: "23:30", name: "Late-night club crawl", hours: 4, interests: ["nightlife" as const], travelMinutesBefore: 150 };
  return {
    ...d,
    estimatedTotalInr: plan.constraints.budgetInr * 2,
    days: d.days.map((day) => ({ ...day, activities: Array.from({ length: 6 }, (_, i) => ({ ...nightlife, name: `${nightlife.name} #${i + 1}` })), food: [] })),
  };
}

async function judge(payload: unknown): Promise<Verdict> {
  const response = await fetch(`${OLLAMA}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(120_000),
    body: JSON.stringify({
      model: MODEL,
      stream: false,
      think: false,
      format: z.toJSONSchema(verdictSchema),
      options: { temperature: 0 },
      messages: [
        { role: "system", content: RUBRIC },
        { role: "user", content: `<plan>\n${JSON.stringify(payload)}\n</plan>` },
      ],
    }),
  });
  const body = (await response.json()) as { message: { content: string } };
  return verdictSchema.parse(JSON.parse(body.message.content));
}

const mean = (verdict: Verdict) => CRITERIA.reduce((s, k) => s + verdict[k], 0) / CRITERIA.length;

async function judgeAvailable(): Promise<boolean> {
  try {
    const tags = (await (await fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(3_000) })).json()) as { models: { name: string }[] };
    return tags.models.some((m) => m.name === MODEL);
  } catch {
    return false;
  }
}

const available = await judgeAvailable();

describe.runIf(available)(`LLM judge (${MODEL} via Ollama)`, () => {
  it("scores good plans well and the broken control clearly lower", { timeout: 600_000 }, async () => {
    const rows: { id: string; verdict: Verdict; mean: number }[] = [];
    let referencePlan: TripPlan | null = null;

    for (const id of JUDGED_CASES) {
      const ctx = await runCase(CASES.find((c) => c.id === id)!);
      if (!ctx.plan) throw new Error(`No plan for ${id}`);
      if (id === "reference-request") referencePlan = ctx.plan;
      const verdict = await judge(digest(ctx.plan));
      rows.push({ id, verdict, mean: mean(verdict) });
    }

    const control = await judge(brokenControl(referencePlan!));
    const goodAverage = rows.reduce((s, r) => s + r.mean, 0) / rows.length;
    const controlAverage = mean(control);

    const dir = fileURLToPath(new URL("../results/", import.meta.url));
    mkdirSync(dir, { recursive: true });
    writeFileSync(`${dir}judge-latest.json`, `${JSON.stringify({ model: MODEL, generatedAt: new Date().toISOString(), goodAverage, controlAverage, rows, control }, null, 2)}\n`);
    writeFileSync(
      `${dir}judge-latest.md`,
      [
        "# LLM-as-a-judge scorecard",
        "",
        `Judge: \`${MODEL}\` via Ollama, temperature 0. Scores 1–5 per criterion. Generated by \`npm run eval:judge\`.`,
        "",
        "| Plan | Constraint fit | Personalisation | Pacing | Practicality | Mean |",
        "|---|---|---|---|---|---|",
        ...rows.map((r) => `| ${r.id} | ${r.verdict.constraint_fit} | ${r.verdict.personalisation} | ${r.verdict.pacing} | ${r.verdict.practicality} | ${r.mean.toFixed(2)} |`),
        `| **control (deliberately broken)** | ${control.constraint_fit} | ${control.personalisation} | ${control.pacing} | ${control.practicality} | ${controlAverage.toFixed(2)} |`,
        "",
        `Average for real plans: **${goodAverage.toFixed(2)}** · broken control: **${controlAverage.toFixed(2)}**`,
        "",
        "## Problems the judge raised",
        "",
        ...rows.flatMap((r) => (r.verdict.problems.length ? [`- **${r.id}:** ${r.verdict.problems.join("; ")}`] : [])),
        `- **control:** ${control.problems.join("; ") || "none listed"}`,
        "",
        "A small local model is a noisy judge; treat these scores as a smoke test alongside the deterministic scorecard, not as ground truth.",
        "",
      ].join("\n"),
    );

    // The judge is only trustworthy if it separates a broken plan from real ones.
    expect(controlAverage).toBeLessThan(goodAverage - 1);
    expect(goodAverage).toBeGreaterThanOrEqual(3);
  });
});

describe.skipIf(available)("LLM judge", () => {
  it.skip(`skipped: Ollama with ${MODEL} is not reachable at ${OLLAMA}`, () => {});
});
