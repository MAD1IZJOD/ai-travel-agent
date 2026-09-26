import { CheckCircle2, CircleSlash, ExternalLink, ShieldAlert, XCircle } from "lucide-react";
import type { SourceRef, ToolCallRecord, TripPlan, Verification } from "@/lib/agent/types";
import { Card, cn } from "@/components/ui/primitives";
import { SourceLabel, VERIFICATION_COPY } from "./SourceLabel";

const ORDER: Verification[] = ["verified", "reference", "estimated", "suggestion"];
const TOOL_NAMES: Record<ToolCallRecord["tool"], string> = { wikipedia: "Wikipedia", weather: "Open-Meteo" };
const CALL_ICONS = { ok: CheckCircle2, filtered: ShieldAlert, failed: XCircle, skipped: CircleSlash };
const CALL_COLORS = { ok: "text-ok", filtered: "text-warn", failed: "text-bad", skipped: "text-ink-faint" };

function formatTime(iso?: string): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function SourceItem({ source }: { source: SourceRef }) {
  const retrieved = formatTime(source.retrievedAt);
  return (
    <li className="text-sm">
      {source.url ? (
        <a href={source.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink">
          {source.label}
          <ExternalLink className="h-3 w-3" aria-hidden />
        </a>
      ) : (
        <span className="font-medium text-ink">{source.label}</span>
      )}
      {(source.note || retrieved) && (
        <p className="text-ink-soft">
          {source.note}
          {retrieved && <span className="text-ink-faint"> Retrieved {retrieved}.</span>}
        </p>
      )}
    </li>
  );
}

export function SourcesPanel({ plan }: { plan: TripPlan }) {
  const groups = ORDER.map((kind) => ({ kind, items: plan.sources.filter((s) => s.kind === kind) })).filter((g) => g.items.length > 0);

  return (
    <Card className="p-5 sm:p-6" aria-labelledby="sources-heading">
      <h2 id="sources-heading" className="font-display text-xl text-ink">
        Where this comes from
      </h2>
      <p className="mt-1 text-sm text-ink-soft">
        We only mark something as checked when we fetched it while building this plan. Everything else is labelled for what it is.
      </p>

      <div className="mt-5 grid gap-6 md:grid-cols-2">
        {groups.map(({ kind, items }) => (
          <div key={kind}>
            <div className="flex items-center gap-2">
              <SourceLabel kind={kind} />
              <span className="text-xs text-ink-faint">{VERIFICATION_COPY[kind].explain}</span>
            </div>
            <ul className="mt-2 space-y-2">
              {items.map((source) => (
                <SourceItem key={source.id} source={source} />
              ))}
            </ul>
          </div>
        ))}
      </div>

      {plan.research.length > 0 && (
        <div className="mt-6 border-t border-line pt-4">
          <h3 className="text-sm font-semibold text-ink">What we looked up for this plan</h3>
          <ul className="mt-2 space-y-1.5">
            {plan.research.map((call) => {
              const Icon = CALL_ICONS[call.status];
              return (
                <li key={`${call.tool}-${call.target}`} className="flex gap-2 text-sm">
                  <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", CALL_COLORS[call.status])} aria-hidden />
                  <span className="text-ink-soft">
                    <span className="font-medium text-ink">{TOOL_NAMES[call.tool]}</span> · {call.target} — {call.detail}
                    {call.durationMs > 0 && <span className="text-ink-faint"> ({(call.durationMs / 1000).toFixed(1)}s)</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Card>
  );
}
