import { ArrowRight, Check, RefreshCw } from "lucide-react";
import type { PlanChange, PlanDiff } from "@/lib/agent/types";
import { Card } from "@/components/ui/primitives";

const AREA_LABELS: Record<PlanChange["area"], string> = {
  destination: "Destination",
  transport: "Getting there",
  stay: "Where you stay",
  itinerary: "Day plans",
  food: "Food",
  budget: "Estimated cost",
};

export function ChangeSummary({ diff }: { diff: PlanDiff }) {
  return (
    <Card className="animate-rise border-lagoon/30 p-5 sm:p-6" aria-labelledby="changes-heading">
      <div className="flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-lagoon-soft text-lagoon">
          <RefreshCw className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 id="changes-heading" className="font-display text-xl text-ink">
            What changed
          </h2>
          <p className="mt-1 text-ink-soft">{diff.summary}</p>
        </div>
      </div>

      {diff.changedConstraints.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-2" aria-label="You changed">
          {diff.changedConstraints.map((c) => (
            <li key={c.field} className="inline-flex items-center gap-1.5 rounded-lg bg-surface-muted px-3 py-1.5 text-sm">
              <span className="text-ink-faint line-through decoration-ink-faint/60">{c.before}</span>
              <ArrowRight className="h-3.5 w-3.5 text-ink-faint" aria-label="to" />
              <span className="font-medium text-ink">{c.after}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <h3 className="text-sm font-semibold text-ink">Updated</h3>
          {diff.changes.length === 0 ? (
            <p className="mt-2 text-sm text-ink-soft">Nothing needed to change.</p>
          ) : (
            <ul className="mt-2 divide-y divide-line rounded-xl border border-line">
              {diff.changes.map((change) => (
                <li key={change.area} className="p-3">
                  <p className="text-xs font-semibold tracking-[0.1em] text-ink-faint uppercase">{AREA_LABELS[change.area]}</p>
                  <p className="mt-1 text-sm">
                    <span className="text-ink-faint">{change.before}</span>
                    <ArrowRight className="mx-1.5 inline h-3.5 w-3.5 text-ink-faint" aria-label="now" />
                    <span className="font-medium text-ink">{change.after}</span>
                  </p>
                  <p className="mt-0.5 text-sm text-lagoon">{change.why}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3 className="text-sm font-semibold text-ink">Stayed the same</h3>
          <ul className="mt-2 space-y-1.5">
            {diff.preserved.map((item) => (
              <li key={item} className="flex items-start gap-2 text-sm text-ink-soft">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-ok" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  );
}
