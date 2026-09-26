import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import type { ConstraintCheck } from "@/lib/agent/types";
import { Card, cn } from "@/components/ui/primitives";

const ICONS = { pass: CheckCircle2, warn: AlertTriangle, fail: XCircle };
const COLORS = { pass: "text-ok", warn: "text-warn", fail: "text-bad" };

export function ChecksPanel({ checks }: { checks: ConstraintCheck[] }) {
  const met = checks.filter((c) => c.status === "pass");
  const notMet = checks.filter((c) => c.status !== "pass");

  const renderList = (items: ConstraintCheck[]) => (
    <ul className="mt-2 space-y-2.5">
      {items.map((check) => {
        const Icon = ICONS[check.status];
        return (
          <li key={check.id} className="flex gap-2.5 text-sm">
            <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", COLORS[check.status])} aria-hidden />
            <div>
              <p className="font-medium text-ink">
                {check.label}
                <span className="sr-only">: {check.status === "pass" ? "met" : check.status === "warn" ? "note" : "not met"}</span>
                {!check.hard && <span className="ml-1.5 text-xs font-normal text-ink-faint">preference</span>}
              </p>
              <p className="text-ink-soft">{check.detail}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );

  return (
    <Card className="p-5" aria-labelledby="checks-heading">
      <h2 id="checks-heading" className="font-display text-xl text-ink">
        Constraint check
      </h2>
      <p className="mt-1 text-sm text-ink-soft">
        {met.length} of {checks.length} met{notMet.length ? `, ${notMet.length} worth a look` : ""}.
      </p>
      {notMet.length > 0 && (
        <div className="mt-4">
          <h3 className="text-xs font-semibold tracking-[0.1em] text-ink-faint uppercase">Worth a look</h3>
          {renderList(notMet)}
        </div>
      )}
      <div className="mt-4">
        <h3 className="text-xs font-semibold tracking-[0.1em] text-ink-faint uppercase">Met</h3>
        {renderList(met)}
      </div>
    </Card>
  );
}
