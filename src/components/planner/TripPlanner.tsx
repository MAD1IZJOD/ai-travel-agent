"use client";

import { PencilLine } from "lucide-react";
import { useState } from "react";
import { hasBlockingIssues } from "@/lib/agent/parser";
import type { ConstraintField, ParsedRequest, TripConstraints } from "@/lib/agent/types";
import { Button, Card, SectionHeading } from "@/components/ui/primitives";
import { ConstraintForm } from "./ConstraintForm";
import { ConstraintSummary } from "./ConstraintSummary";
import { TripRequestForm } from "./TripRequestForm";

type Phase =
  | { name: "idle" }
  | { name: "understanding"; text: string }
  | { name: "review"; text: string; parsed: ParsedRequest; editing: boolean }
  | { name: "error"; text: string; message: string };

/** Marks edited fields as stated and drops the issues that no longer apply. */
export function applyEdits(parsed: ParsedRequest, next: TripConstraints): ParsedRequest {
  const changed = (Object.keys(next) as ConstraintField[]).filter(
    (field) => JSON.stringify(next[field]) !== JSON.stringify(parsed.constraints[field]) || parsed.origins[field] === "default",
  );
  const origins = { ...parsed.origins };
  for (const field of changed) origins[field] = "stated";
  return {
    ...parsed,
    constraints: next,
    origins,
    issues: parsed.issues.filter((issue) => !issue.field || !changed.includes(issue.field)).filter((i) => i.field || i.severity !== "blocking"),
  };
}

export function TripPlanner() {
  const [phase, setPhase] = useState<Phase>({ name: "idle" });

  async function understand(text: string) {
    setPhase({ name: "understanding", text });
    try {
      const response = await fetch("/api/understand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? "Something went wrong.");
      const parsed = data as ParsedRequest;
      setPhase({ name: "review", text, parsed, editing: hasBlockingIssues(parsed.issues) });
    } catch (error) {
      setPhase({
        name: "error",
        text,
        message: error instanceof Error ? error.message : "We couldn't reach the planner. Check your connection and try again.",
      });
    }
  }

  const busy = phase.name === "understanding";
  const requestText = phase.name === "idle" ? "" : phase.text;

  return (
    <div className="space-y-10">
      <TripRequestForm key={requestText} initialText={requestText} busy={busy} onSubmit={understand} />

      {phase.name === "error" && (
        <Card className="animate-rise border-bad/30 bg-bad-soft/40 p-5">
          <p className="font-medium text-bad">{phase.message}</p>
          <Button variant="secondary" className="mt-3" onClick={() => understand(phase.text)}>
            Try again
          </Button>
        </Card>
      )}

      {phase.name === "review" && (
        <section className="animate-rise" aria-labelledby="understood-heading">
          <SectionHeading
            id="understood-heading"
            eyebrow="Step 1"
            title="Here's what we understood"
            action={
              !phase.editing && (
                <Button variant="secondary" size="sm" onClick={() => setPhase({ ...phase, editing: true })}>
                  <PencilLine className="h-4 w-4" aria-hidden />
                  Edit details
                </Button>
              )
            }
          />
          {phase.editing ? (
            <Card className="p-5 sm:p-6">
              <ConstraintSummary constraints={phase.parsed.constraints} origins={phase.parsed.origins} issues={phase.parsed.issues} />
              <div className="mt-6 border-t border-line pt-6">
                <ConstraintForm
                  initial={phase.parsed.constraints}
                  submitLabel="Save details"
                  onSubmit={(next) => setPhase({ ...phase, parsed: applyEdits(phase.parsed, next), editing: false })}
                  onCancel={hasBlockingIssues(phase.parsed.issues) ? undefined : () => setPhase({ ...phase, editing: false })}
                />
              </div>
            </Card>
          ) : (
            <ConstraintSummary constraints={phase.parsed.constraints} origins={phase.parsed.origins} issues={phase.parsed.issues} />
          )}
        </section>
      )}
    </div>
  );
}
