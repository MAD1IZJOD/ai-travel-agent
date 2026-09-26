"use client";

import { useCallback, useRef, useState } from "react";
import type { AgentEvent, AgentStage, PlanSnapshot, ResultEvent, StageEvent, TripConstraints } from "@/lib/agent/types";

export type StageState = Partial<Record<AgentStage, Omit<StageEvent, "type" | "stage">>>;

export interface AgentRunState {
  running: boolean;
  stages: StageState;
  result: ResultEvent | null;
  error: string | null;
}

const IDLE: AgentRunState = { running: false, stages: {}, result: null, error: null };

/** Runs the planning agent and follows its streamed progress events. */
export function useAgentRun() {
  const [state, setState] = useState<AgentRunState>(IDLE);
  const abortRef = useRef<AbortController | null>(null);

  const start = useCallback(async (constraints: TripConstraints, previous?: PlanSnapshot) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setState((s) => ({ running: true, stages: {}, result: previous ? s.result : null, error: null }));

    const handle = (event: AgentEvent) => {
      if (event.type === "stage") {
        setState((s) => ({ ...s, stages: { ...s.stages, [event.stage]: { status: event.status, detail: event.detail } } }));
      } else if (event.type === "result") {
        setState((s) => ({ ...s, running: false, result: event }));
      } else {
        setState((s) => ({ ...s, running: false, error: event.message }));
      }
    };

    try {
      const response = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ constraints, previous }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error ?? "The planner is unavailable right now.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) if (line.trim()) handle(JSON.parse(line) as AgentEvent);
      }
      if (buffer.trim()) handle(JSON.parse(buffer) as AgentEvent);
      setState((s) => (s.running ? { ...s, running: false, error: s.result ? null : "The planner stopped before finishing. Please try again." } : s));
    } catch (error) {
      if (controller.signal.aborted) return;
      setState((s) => ({
        ...s,
        running: false,
        error: error instanceof Error && error.message ? error.message : "We couldn't reach the planner. Check your connection and try again.",
      }));
    }
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setState(IDLE);
  }, []);

  return { ...state, start, reset };
}
