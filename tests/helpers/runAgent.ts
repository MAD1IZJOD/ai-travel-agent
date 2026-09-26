import { runAgent, type AgentInput } from "@/lib/agent/agent";
import { createResearchTools } from "@/lib/tools";
import type { AgentEvent, ResultEvent, StageEvent } from "@/lib/agent/types";
import { fakeFetch } from "./fakeFetch";

export const TODAY = "2026-09-26";

export interface AgentRun {
  events: AgentEvent[];
  stages: StageEvent[];
  result: ResultEvent;
}

export async function run(input: AgentInput, fetchImpl = fakeFetch()): Promise<AgentRun> {
  const events: AgentEvent[] = [];
  await runAgent(input, { tools: createResearchTools({ fetchImpl }), today: TODAY, emit: (e) => events.push(e) });
  const result = events.find((e): e is ResultEvent => e.type === "result");
  if (!result) throw new Error(`No result event: ${JSON.stringify(events)}`);
  return { events, stages: events.filter((e): e is StageEvent => e.type === "stage"), result };
}
