import { CalendarDays, ExternalLink, Mountain, Sparkles, Users, Wallet } from "lucide-react";
import Image from "next/image";
import { addDays, formatDisplayDate } from "@/lib/agent/dates";
import type { TripPlan } from "@/lib/agent/types";
import { getOrigin } from "@/lib/data/places";
import { INTEREST_LABELS, PACE_LABELS, formatInr, pluralize } from "@/lib/format";
import { Card } from "@/components/ui/primitives";
import { SourceLabel } from "./SourceLabel";

function Stat({ icon: Icon, label, value, sub }: { icon: typeof Users; label: string; value: string; sub?: string }) {
  return (
    <div className="flex gap-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
      <div>
        <dt className="text-xs font-semibold tracking-[0.1em] text-ink-faint uppercase">{label}</dt>
        <dd className="mt-0.5 font-medium text-ink">{value}</dd>
        {sub && <dd className="text-sm text-ink-soft">{sub}</dd>}
      </div>
    </div>
  );
}

export function TripOverview({ plan }: { plan: TripPlan }) {
  const { destination, constraints, budget } = plan;
  const wikiSource = plan.sources.find((s) => s.kind === "verified" && s.id.startsWith("wiki:") && s.note?.startsWith("Destination"));
  const endDate = addDays(constraints.startDate, constraints.days - 1);

  return (
    <Card className="overflow-hidden">
      <div className="relative aspect-[16/9] bg-surface-muted sm:aspect-[21/9]">
        {destination.imageUrl ? (
          <Image
            src={destination.imageUrl}
            alt={`${destination.name}, ${destination.region}`}
            fill
            priority
            sizes="(min-width: 1024px) 720px, 100vw"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-gradient-to-br from-lagoon-soft to-surface-muted">
            <Mountain className="h-12 w-12 text-lagoon/40" aria-hidden />
          </div>
        )}
        {destination.imageUrl && wikiSource && (
          <p className="absolute right-2 bottom-2 rounded bg-ink/60 px-2 py-0.5 text-[11px] text-white">Photo via Wikimedia Commons</p>
        )}
      </div>

      <div className="p-5 sm:p-7">
        <p className="text-xs font-semibold tracking-[0.12em] text-lagoon uppercase">Your trip</p>
        <h2 className="mt-1 font-display text-3xl leading-tight text-ink sm:text-4xl">
          {destination.name}
          {destination.region !== destination.name && <span className="ml-2 font-sans text-base font-normal text-ink-faint">{destination.region}</span>}
        </h2>
        <p className="mt-1 text-ink-soft">{destination.tagline}</p>

        {destination.description !== destination.tagline && (
          <div className="mt-4 rounded-xl bg-surface-muted/70 p-4">
            <p className="text-sm leading-relaxed text-ink-soft">{destination.description}</p>
            {wikiSource?.url && (
              <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink-faint">
                <SourceLabel kind="verified" />
                <a href={wikiSource.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline decoration-line-strong underline-offset-2 hover:text-ink">
                  Wikipedia <ExternalLink className="h-3 w-3" aria-hidden />
                </a>
              </p>
            )}
          </div>
        )}

        <dl className="mt-6 grid grid-cols-1 gap-5 border-t border-line pt-6 sm:grid-cols-2 lg:grid-cols-4">
          <Stat icon={CalendarDays} label="When" value={`${formatDisplayDate(constraints.startDate)} – ${formatDisplayDate(endDate)}`} sub={pluralize(constraints.days, "day")} />
          <Stat icon={Users} label="Who" value={pluralize(constraints.travelers, "traveller")} sub={`From ${getOrigin(constraints.originId).name}`} />
          <Stat
            icon={Sparkles}
            label="Style"
            value={PACE_LABELS[constraints.pace].label}
            sub={constraints.interests.map((i) => INTEREST_LABELS[i]).join(" + ")}
          />
          <Stat
            icon={Wallet}
            label="Estimated spend"
            value={formatInr(budget.total)}
            sub={budget.remaining >= 0 ? `${formatInr(budget.remaining)} left of ${formatInr(budget.budget)}` : `${formatInr(-budget.remaining)} over ${formatInr(budget.budget)}`}
          />
        </dl>

        {plan.highlights.length > 0 && (
          <div className="mt-6">
            <h3 className="text-sm font-semibold text-ink">Highlights</h3>
            <ul className="mt-2 flex flex-wrap gap-2">
              {plan.highlights.map((h) => (
                <li key={h} className="rounded-full border border-line bg-surface px-3 py-1 text-sm text-ink-soft">
                  {h}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
              Why {destination.name} <SourceLabel kind="suggestion" />
            </h3>
            <ul className="mt-2 space-y-1.5 text-sm text-ink-soft">
              {destination.whyChosen.map((reason) => (
                <li key={reason} className="flex gap-2">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-lagoon" aria-hidden />
                  {reason}
                </li>
              ))}
            </ul>
          </div>
          {destination.alternativesConsidered.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-ink">Also considered</h3>
              <ul className="mt-2 space-y-1.5 text-sm text-ink-soft">
                {destination.alternativesConsidered.map((alt) => (
                  <li key={alt.name}>
                    <span className="font-medium text-ink">{alt.name}</span> — {alt.reason.charAt(0).toLowerCase() + alt.reason.slice(1)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
