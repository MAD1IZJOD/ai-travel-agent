import { AlertTriangle, Check, Circle, Loader2 } from "lucide-react";
import { AGENT_STAGES, type AgentStage } from "@/lib/agent/types";
import { cn } from "@/components/ui/primitives";
import type { StageState } from "./useAgentRun";

const STAGE_LABELS: Record<AgentStage, string> = {
  understand: "Understanding your trip",
  research: "Researching options",
  plan: "Building the itinerary",
  validate: "Checking it against your constraints",
  finalize: "Wrapping up",
};

/** Shows only what the server has actually reported — nothing is animated ahead of reality. */
export function AgentProgress({ stages, running, compact = false }: { stages: StageState; running: boolean; compact?: boolean }) {
  return (
    <ol className={cn("space-y-3", compact && "space-y-2")} aria-live="polite" aria-busy={running}>
      {AGENT_STAGES.map((stage) => {
        const current = stages[stage];
        const status = current?.status ?? "pending";
        const Icon = status === "done" ? Check : status === "warning" ? AlertTriangle : status === "running" ? Loader2 : Circle;
        return (
          <li key={stage} className="flex gap-3">
            <span
              className={cn(
                "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                status === "done" && "bg-ok-soft text-ok",
                status === "warning" && "bg-warn-soft text-warn",
                status === "running" && "bg-lagoon-soft text-lagoon",
                status === "pending" && "text-line-strong",
              )}
            >
              <Icon className={cn("h-3.5 w-3.5", status === "running" && "animate-spin", status === "pending" && "h-3 w-3")} aria-hidden />
            </span>
            <div className="min-w-0">
              <p className={cn("text-sm font-medium", status === "pending" ? "text-ink-faint" : "text-ink")}>
                {STAGE_LABELS[stage]}
                <span className="sr-only">{status === "pending" ? " — waiting" : status === "running" ? " — in progress" : status === "warning" ? " — done, with a note" : " — done"}</span>
              </p>
              {current && !compact && <p className="mt-0.5 text-sm text-ink-soft">{current.detail}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
