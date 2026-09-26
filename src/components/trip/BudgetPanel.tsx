import type { BudgetBreakdown } from "@/lib/agent/types";
import { formatInr } from "@/lib/format";
import { Card, cn } from "@/components/ui/primitives";
import { SourceLabel } from "./SourceLabel";

const CATEGORIES: { key: keyof Pick<BudgetBreakdown, "transport" | "stay" | "food" | "activities" | "localTravel" | "buffer">; label: string; color: string }[] = [
  { key: "transport", label: "Transport", color: "bg-lagoon" },
  { key: "stay", label: "Stay", color: "bg-clay" },
  { key: "food", label: "Food", color: "bg-[#c99a2e]" },
  { key: "activities", label: "Activities", color: "bg-[#5f8a6a]" },
  { key: "localTravel", label: "Local travel", color: "bg-[#7c6f9c]" },
  { key: "buffer", label: "Buffer", color: "bg-line-strong" },
];

export function BudgetPanel({ budget }: { budget: BudgetBreakdown }) {
  const scale = Math.max(budget.budget, budget.total);
  const over = budget.remaining < 0;

  return (
    <Card className="p-5" aria-labelledby="budget-heading">
      <div className="flex items-center justify-between gap-2">
        <h2 id="budget-heading" className="font-display text-xl text-ink">
          Budget
        </h2>
        <SourceLabel kind="estimated" />
      </div>

      <p className="mt-3 flex items-baseline gap-2">
        <span className="font-display text-3xl text-ink">{formatInr(budget.total)}</span>
        <span className="text-sm text-ink-faint">of {formatInr(budget.budget)}</span>
      </p>
      <p className={cn("text-sm font-medium", over ? "text-bad" : "text-ok")}>
        {over ? `${formatInr(-budget.remaining)} over budget` : `${formatInr(budget.remaining)} left over`}
      </p>

      <div className="relative mt-4 h-3 w-full overflow-hidden rounded-full bg-surface-muted" role="img" aria-label={`Estimated ${formatInr(budget.total)} of a ${formatInr(budget.budget)} budget`}>
        <div className="flex h-full">
          {CATEGORIES.map(({ key, color }) => (
            <div key={key} className={cn("h-full", color)} style={{ width: `${(budget[key] / scale) * 100}%` }} />
          ))}
        </div>
        {over && <div className="absolute top-0 bottom-0 w-0.5 bg-ink" style={{ left: `${(budget.budget / scale) * 100}%` }} aria-hidden />}
      </div>

      <table className="mt-4 w-full text-sm">
        <caption className="sr-only">Estimated cost by category</caption>
        <tbody>
          {CATEGORIES.map(({ key, label, color }) => (
            <tr key={key} className="border-b border-line/60 last:border-0">
              <th scope="row" className="py-1.5 text-left font-normal text-ink-soft">
                <span className={cn("mr-2 inline-block h-2.5 w-2.5 rounded-sm align-middle", color)} aria-hidden />
                {label}
              </th>
              <td className="py-1.5 text-right text-ink tabular-nums">{formatInr(budget[key])}</td>
              <td className="w-12 py-1.5 text-right text-ink-faint tabular-nums">{budget.total ? Math.round((budget[key] / budget.total) * 100) : 0}%</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-xs text-ink-faint">The buffer covers tips, snacks and surprises. Every figure is an estimate from typical prices, not a quote.</p>
    </Card>
  );
}
