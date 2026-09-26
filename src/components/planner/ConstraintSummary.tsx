import { AlertTriangle, Info, OctagonAlert } from "lucide-react";
import type { ConstraintField, ConstraintOrigins, ParseIssue, TripConstraints } from "@/lib/agent/types";
import { findDestination, getOrigin } from "@/lib/data/places";
import { formatDisplayDate } from "@/lib/agent/dates";
import { INTEREST_LABELS, PACE_LABELS, formatInr, pluralize } from "@/lib/format";
import { cn } from "@/components/ui/primitives";

const ORIGIN_LABEL: Record<ConstraintOrigins[ConstraintField], string> = {
  stated: "You said",
  inferred: "Interpreted",
  default: "Assumed",
};

interface Tile {
  field: ConstraintField;
  label: string;
  value: string;
}

function buildTiles(c: TripConstraints): Tile[] {
  return [
    { field: "originId", label: "From", value: getOrigin(c.originId).name },
    { field: "destinationId", label: "Going to", value: c.destinationId ? (findDestination(c.destinationId)?.name ?? "—") : "We'll pick" },
    { field: "travelers", label: "Travellers", value: pluralize(c.travelers, "person", "people") },
    { field: "days", label: "Duration", value: pluralize(c.days, "day") },
    { field: "budgetInr", label: "Budget", value: formatInr(c.budgetInr) },
    { field: "interests", label: "Interests", value: c.interests.map((i) => INTEREST_LABELS[i]).join(" + ") },
    { field: "pace", label: "Pace", value: PACE_LABELS[c.pace].label },
    { field: "startDate", label: "Starting", value: formatDisplayDate(c.startDate) },
  ];
}

export function ConstraintSummary({
  constraints,
  origins,
  issues,
  highlight = [],
}: {
  constraints: TripConstraints;
  origins: ConstraintOrigins;
  issues: ParseIssue[];
  highlight?: ConstraintField[];
}) {
  const tiles = buildTiles(constraints);
  const blockingFields = new Set(issues.filter((i) => i.severity === "blocking").map((i) => i.field));

  return (
    <div>
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-4">
        {tiles.map((tile) => {
          const origin = origins[tile.field];
          const blocked = blockingFields.has(tile.field);
          const changed = highlight.includes(tile.field);
          return (
            <div
              key={tile.field}
              className={cn(
                "flex min-h-[5.5rem] flex-col justify-between bg-surface px-4 py-3",
                blocked && "bg-bad-soft/60",
                changed && "bg-lagoon-soft/70",
              )}
            >
              <dt className="flex items-center justify-between gap-2 text-xs font-semibold tracking-[0.1em] text-ink-faint uppercase">
                {tile.label}
                {!blocked && (
                  <span
                    className={cn(
                      "text-[10px] font-medium tracking-normal normal-case",
                      origin === "default" ? "text-warn" : origin === "inferred" ? "text-lagoon" : "text-ink-faint",
                    )}
                  >
                    {changed ? "Changed" : ORIGIN_LABEL[origin]}
                  </span>
                )}
              </dt>
              <dd className={cn("mt-1 text-base font-medium text-ink", blocked && "text-bad")}>
                {blocked ? "Needs your input" : tile.value}
              </dd>
            </div>
          );
        })}
      </dl>
      <IssueList issues={issues} />
    </div>
  );
}

export function IssueList({ issues }: { issues: ParseIssue[] }) {
  if (issues.length === 0) return null;
  const order = { blocking: 0, warning: 1, info: 2 } as const;
  const sorted = [...issues].sort((a, b) => order[a.severity] - order[b.severity]);

  return (
    <ul className="mt-3 space-y-1.5" aria-label="Notes about your request">
      {sorted.map((issue) => {
        const Icon = issue.severity === "blocking" ? OctagonAlert : issue.severity === "warning" ? AlertTriangle : Info;
        return (
          <li
            key={issue.code}
            className={cn(
              "flex items-start gap-2 rounded-lg px-3 py-2 text-sm",
              issue.severity === "blocking" && "bg-bad-soft text-bad",
              issue.severity === "warning" && "bg-warn-soft text-[#7a4f00]",
              issue.severity === "info" && "bg-surface-muted text-ink-soft",
            )}
          >
            <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>{issue.message}</span>
          </li>
        );
      })}
    </ul>
  );
}
