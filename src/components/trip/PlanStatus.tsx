import { AlertTriangle, ArrowRight, Wrench } from "lucide-react";
import type { Adjustment, BlockedOutcome, TripPlan } from "@/lib/agent/types";
import { formatInr } from "@/lib/format";
import { Button, Card } from "@/components/ui/primitives";

function AdjustmentList({ adjustments, onApprove, busy }: { adjustments: Adjustment[]; onApprove: (a: Adjustment) => void; busy: boolean }) {
  if (adjustments.length === 0) {
    return <p className="mt-3 text-sm text-ink-soft">Try changing the trip details — for example the budget, length or destination.</p>;
  }
  return (
    <ul className="mt-4 grid gap-3 sm:grid-cols-2">
      {adjustments.map((a) => (
        <li key={a.id} className="flex flex-col justify-between rounded-xl border border-line bg-surface p-4">
          <div>
            <p className="font-medium text-ink">{a.label}</p>
            <p className="mt-1 text-sm text-ink-soft">{a.description}</p>
            {a.estimatedTotalInr > 0 && <p className="mt-1 text-sm text-ink-faint">Estimated {formatInr(a.estimatedTotalInr)}</p>}
          </div>
          <Button variant="secondary" size="sm" className="mt-3 self-start" disabled={busy} onClick={() => onApprove(a)}>
            Use this <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Button>
        </li>
      ))}
    </ul>
  );
}

/** Shown when a hard constraint can't be met: explain, propose, and wait for the traveller's approval. */
export function ApprovalPanel({ plan, onApprove, busy }: { plan: TripPlan; onApprove: (a: Adjustment) => void; busy: boolean }) {
  const failing = plan.checks.filter((c) => c.hard && c.status === "fail");
  return (
    <Card className="animate-rise border-warn/40 bg-warn-soft/40 p-5 sm:p-6" role="alert">
      <div className="flex gap-3">
        <AlertTriangle className="mt-1 h-5 w-5 shrink-0 text-warn" aria-hidden />
        <div>
          <h2 className="font-display text-xl text-ink">This trip doesn&apos;t fit yet — your call</h2>
          <p className="mt-1 text-ink-soft">
            {failing.map((c) => c.detail).join(" ")} We already switched to the cheapest options we&apos;d recommend. Rather than hand you a plan that doesn&apos;t work, here are ways to fix it:
          </p>
        </div>
      </div>
      <AdjustmentList adjustments={plan.adjustments} onApprove={onApprove} busy={busy} />
      <p className="mt-4 text-sm text-ink-faint">Below is the closest plan we could make, so you can see what it would look like.</p>
    </Card>
  );
}

export function BlockedPanel({ blocked, onApprove, busy }: { blocked: BlockedOutcome; onApprove: (a: Adjustment) => void; busy: boolean }) {
  return (
    <Card className="animate-rise border-warn/40 bg-warn-soft/40 p-5 sm:p-6" role="alert">
      <div className="flex gap-3">
        <AlertTriangle className="mt-1 h-5 w-5 shrink-0 text-warn" aria-hidden />
        <div>
          <h2 className="font-display text-xl text-ink">We can&apos;t plan this one as asked</h2>
          <p className="mt-1 text-ink-soft">{blocked.reason} Pick a change and we&apos;ll plan it right away.</p>
        </div>
      </div>
      <AdjustmentList adjustments={blocked.adjustments} onApprove={onApprove} busy={busy} />
    </Card>
  );
}

export function RevisionNote({ plan }: { plan: TripPlan }) {
  if (plan.revisions.length === 0 || plan.status === "needs-approval") return null;
  const saved = plan.revisions.reduce((sum, r) => sum + (r.savedInr ?? 0), 0);
  return (
    <Card className="p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
        <Wrench className="h-4 w-4 text-lagoon" aria-hidden />
        We adjusted the plan to fit your constraints
      </h2>
      <p className="mt-1 text-sm text-ink-soft">The first draft was over budget. These changes saved {formatInr(saved)}:</p>
      <ol className="mt-3 space-y-1.5 text-sm">
        {plan.revisions.map((r, i) => (
          <li key={r.step} className="flex justify-between gap-4">
            <span className="text-ink">
              <span className="mr-2 text-ink-faint">{i + 1}.</span>
              {r.step}
            </span>
            {r.savedInr ? <span className="shrink-0 text-ok">−{formatInr(r.savedInr)}</span> : null}
          </li>
        ))}
      </ol>
    </Card>
  );
}
