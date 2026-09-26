"use client";

import { SlidersHorizontal } from "lucide-react";
import { LIMITS } from "@/lib/agent/limits";
import type { Interest, TripConstraints } from "@/lib/agent/types";
import { INTEREST_LABELS, PACE_LABELS, formatInr } from "@/lib/format";
import { Button } from "@/components/ui/primitives";

interface QuickChange {
  label: string;
  patch: Partial<TripConstraints>;
}

const BUDGET_STEP = 5_000;

/** One-tap "what if" changes, derived from the current trip. */
export function suggestQuickChanges(c: TripConstraints): QuickChange[] {
  const changes: QuickChange[] = [];

  const lower = Math.max(LIMITS.minBudgetInr, Math.round((c.budgetInr * 0.7) / BUDGET_STEP) * BUDGET_STEP);
  if (lower < c.budgetInr) changes.push({ label: `Budget ${formatInr(c.budgetInr)} → ${formatInr(lower)}`, patch: { budgetInr: lower } });

  const nextPace = c.pace === "packed" ? "relaxed" : "packed";
  changes.push({ label: `Pace ${PACE_LABELS[c.pace].label} → ${PACE_LABELS[nextPace].label}`, patch: { pace: nextPace } });

  const [first, ...rest] = c.interests;
  const replacement: Interest = first === "history" ? "nature" : c.interests.includes("history") ? "culture" : "history";
  if (!rest.includes(replacement)) {
    changes.push({
      label: `Interest ${INTEREST_LABELS[first]} → ${INTEREST_LABELS[replacement]}`,
      patch: { interests: [replacement, ...rest] },
    });
  }
  return changes;
}

export function QuickChanges({ constraints, busy, onApply, onOpenEditor }: { constraints: TripConstraints; busy: boolean; onApply: (patch: Partial<TripConstraints>) => void; onOpenEditor: () => void }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-medium text-ink">Change something and we&apos;ll replan</p>
        <p className="text-sm text-ink-soft">Try one of these, or edit any detail.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {suggestQuickChanges(constraints).map((change) => (
          <Button key={change.label} variant="secondary" size="sm" disabled={busy} onClick={() => onApply(change.patch)}>
            {change.label}
          </Button>
        ))}
        <Button size="sm" disabled={busy} onClick={onOpenEditor}>
          <SlidersHorizontal className="h-4 w-4" aria-hidden />
          Change trip
        </Button>
      </div>
    </div>
  );
}
