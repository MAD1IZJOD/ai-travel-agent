"use client";

import { AlertTriangle, Info, PencilLine, SlidersHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { hasBlockingIssues } from "@/lib/agent/parser";
import { snapshotOf } from "@/lib/agent/replan";
import type { Adjustment, ConstraintField, ParsedRequest, TripConstraints } from "@/lib/agent/types";
import { formatInr } from "@/lib/format";
import { Button, Card, SectionHeading } from "@/components/ui/primitives";
import { BudgetPanel } from "@/components/trip/BudgetPanel";
import { ChangeSummary } from "@/components/trip/ChangeSummary";
import { ChecksPanel } from "@/components/trip/ChecksPanel";
import { Itinerary } from "@/components/trip/Itinerary";
import { LogisticsCard } from "@/components/trip/LogisticsCard";
import { ApprovalPanel, BlockedPanel, RevisionNote } from "@/components/trip/PlanStatus";
import { SourcesPanel } from "@/components/trip/SourcesPanel";
import { TripMap } from "@/components/trip/TripMap";
import { TripOverview } from "@/components/trip/TripOverview";
import { AgentProgress } from "./AgentProgress";
import { ChangeTripDialog } from "./ChangeTripDialog";
import { ConstraintForm } from "./ConstraintForm";
import { ConstraintSummary } from "./ConstraintSummary";
import { QuickChanges } from "./QuickChanges";
import { TripRequestForm } from "./TripRequestForm";
import { useAgentRun } from "./useAgentRun";

/** Marks changed fields as stated and drops the issues that no longer apply. */
export function applyEdits(parsed: ParsedRequest, next: TripConstraints): ParsedRequest {
  const changed = (Object.keys(next) as ConstraintField[]).filter((field) => JSON.stringify(next[field]) !== JSON.stringify(parsed.constraints[field]));
  const origins = { ...parsed.origins };
  for (const field of changed) origins[field] = "stated";
  return {
    ...parsed,
    constraints: next,
    origins,
    // Submitting the form resolves every blocking issue: the traveller has reviewed each field.
    issues: parsed.issues.filter((issue) => issue.severity !== "blocking" && (!issue.field || !changed.includes(issue.field))),
  };
}

type Understanding = { status: "idle" } | { status: "loading"; text: string } | { status: "error"; text: string; message: string } | { status: "ready"; text: string; parsed: ParsedRequest };

export function TripPlanner() {
  const [understanding, setUnderstanding] = useState<Understanding>({ status: "idle" });
  const [editingDetails, setEditingDetails] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const agent = useAgentRun();
  const resultsRef = useRef<HTMLDivElement>(null);

  const plan = agent.result?.plan ?? null;
  const diff = agent.result?.diff ?? null;
  const blocked = agent.result?.blocked ?? null;

  // Bring the outcome into view once a run finishes.
  useEffect(() => {
    if (!agent.running && agent.result) resultsRef.current?.scrollIntoView({ block: "start" });
  }, [agent.running, agent.result]);

  async function understand(text: string) {
    agent.reset();
    setUnderstanding({ status: "loading", text });
    try {
      const response = await fetch("/api/understand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? "Something went wrong.");
      const parsed = data as ParsedRequest;
      setUnderstanding({ status: "ready", text, parsed });
      const blocking = hasBlockingIssues(parsed.issues);
      setEditingDetails(blocking);
      if (!blocking) agent.start(parsed.constraints);
    } catch (error) {
      setUnderstanding({
        status: "error",
        text,
        message: error instanceof Error && error.message ? error.message : "We couldn't reach the planner. Check your connection and try again.",
      });
    }
  }

  /** Plan (or replan, when a plan already exists) with new constraints. */
  function planWith(next: TripConstraints) {
    if (understanding.status === "ready") setUnderstanding({ ...understanding, parsed: applyEdits(understanding.parsed, next) });
    setEditingDetails(false);
    setDialogOpen(false);
    // The current plan stays on screen while replanning; it becomes the baseline for the diff.
    agent.start(next, plan ? snapshotOf(plan) : undefined);
  }

  const constraints = understanding.status === "ready" ? understanding.parsed.constraints : null;
  const approve = (adjustment: Adjustment) => constraints && planWith({ ...constraints, ...adjustment.patch });
  const requestText = understanding.status === "idle" ? "" : understanding.text;
  const showFullProgress = agent.running && !plan;
  const replanning = agent.running && Boolean(plan);

  return (
    <div className="space-y-10">
      <TripRequestForm key={requestText} initialText={requestText} busy={understanding.status === "loading" || agent.running} onSubmit={understand} />

      {understanding.status === "error" && (
        <Card className="animate-rise border-bad/30 bg-bad-soft/40 p-5" role="alert">
          <p className="font-medium text-bad">{understanding.message}</p>
          <Button variant="secondary" className="mt-3" onClick={() => understand(understanding.text)}>
            Try again
          </Button>
        </Card>
      )}

      {understanding.status === "ready" && (
        <section className="animate-rise" aria-labelledby="understood-heading">
          <SectionHeading
            id="understood-heading"
            eyebrow={understanding.parsed.assistedBy ? `Understood · gaps filled by ${understanding.parsed.assistedBy}` : "Understood"}
            title="Here's what we heard"
            action={
              !editingDetails && (
                <Button variant="secondary" size="sm" onClick={() => setEditingDetails(true)} disabled={agent.running}>
                  <PencilLine className="h-4 w-4" aria-hidden />
                  Edit details
                </Button>
              )
            }
          />
          <ConstraintSummary
            constraints={understanding.parsed.constraints}
            origins={understanding.parsed.origins}
            issues={understanding.parsed.issues}
            highlight={diff?.changedConstraints.map((c) => c.field)}
          />
          {editingDetails && (
            <Card className="mt-4 p-5 sm:p-6">
              <ConstraintForm
                initial={understanding.parsed.constraints}
                submitLabel={plan ? "Replan my trip" : "Plan this trip"}
                onSubmit={planWith}
                onCancel={hasBlockingIssues(understanding.parsed.issues) ? undefined : () => setEditingDetails(false)}
              />
            </Card>
          )}
        </section>
      )}

      {showFullProgress && (
        <Card className="animate-rise p-5 sm:p-6">
          <h2 className="font-display text-xl text-ink">Planning your trip</h2>
          <p className="mt-1 mb-5 text-sm text-ink-soft">Each step below updates as it actually finishes.</p>
          <AgentProgress stages={agent.stages} running={agent.running} />
        </Card>
      )}

      {agent.error && (
        <Card className="animate-rise border-bad/30 bg-bad-soft/40 p-5" role="alert">
          <p className="flex items-center gap-2 font-medium text-bad">
            <AlertTriangle className="h-4 w-4" aria-hidden />
            {agent.error}
          </p>
          {constraints && (
            <Button variant="secondary" className="mt-3" onClick={() => planWith(constraints)}>
              Try again
            </Button>
          )}
        </Card>
      )}

      {blocked && !agent.running && (
        <div ref={resultsRef} className="scroll-mt-20">
          <BlockedPanel blocked={blocked} onApprove={approve} busy={agent.running} />
        </div>
      )}

      {plan && constraints && (
        <div ref={resultsRef} className="scroll-mt-20 space-y-6" aria-busy={replanning}>
          <div className="sticky top-2 z-20">
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface/95 px-4 py-2.5 shadow-[0_8px_24px_-16px_rgba(29,27,24,0.35)] backdrop-blur">
              <p className="min-w-0 truncate text-sm">
                <span className="font-semibold text-ink">{plan.destination.name}</span>
                <span className="text-ink-soft">
                  {" "}
                  · {plan.constraints.days} days · {formatInr(plan.budget.total)} of {formatInr(plan.budget.budget)}
                </span>
              </p>
              <Button size="sm" onClick={() => setDialogOpen(true)} disabled={agent.running}>
                <SlidersHorizontal className="h-4 w-4" aria-hidden />
                Change trip
              </Button>
            </div>
            {replanning && (
              <Card className="mt-2 p-4">
                <p className="mb-3 text-sm font-medium text-ink">Replanning — keeping what still works…</p>
                <AgentProgress stages={agent.stages} running compact />
              </Card>
            )}
          </div>

          <div className={replanning ? "pointer-events-none space-y-6 opacity-50 transition-opacity" : "space-y-6"}>
            {diff && <ChangeSummary diff={diff} />}
            {plan.status === "needs-approval" && <ApprovalPanel plan={plan} onApprove={approve} busy={agent.running} />}

            <Card className="p-4 sm:p-5">
              <QuickChanges constraints={constraints} busy={agent.running} onApply={(patch) => planWith({ ...constraints, ...patch })} onOpenEditor={() => setDialogOpen(true)} />
            </Card>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
              <div className="space-y-6">
                <TripOverview plan={plan} />
                <RevisionNote plan={plan} />
                {plan.notices.length > 0 && (
                  <Card className="p-5">
                    <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
                      <Info className="h-4 w-4 text-lagoon" aria-hidden />
                      Good to know
                    </h2>
                    <ul className="mt-2 space-y-1.5 text-sm text-ink-soft">
                      {plan.weather && <li>{plan.weather.note}</li>}
                      {plan.notices.map((notice) => (
                        <li key={notice}>{notice}</li>
                      ))}
                    </ul>
                  </Card>
                )}
              </div>

              <aside className="space-y-6 lg:col-start-2 lg:row-span-3 lg:row-start-1 lg:self-start" aria-label="Trip summary">
                <BudgetPanel budget={plan.budget} />
                <ChecksPanel checks={plan.checks} />
                <LogisticsCard plan={plan} />
                <TripMap plan={plan} />
              </aside>

              <div className="lg:col-start-1">
                <Itinerary plan={plan} />
              </div>
              <div className="lg:col-start-1">
                <SourcesPanel plan={plan} />
              </div>
            </div>
          </div>

          <ChangeTripDialog open={dialogOpen} constraints={constraints} onClose={() => setDialogOpen(false)} onSubmit={planWith} />
        </div>
      )}
    </div>
  );
}
