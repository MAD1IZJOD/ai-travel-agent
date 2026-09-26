import { BedDouble, Car, Clock, Coffee, ExternalLink, Info, Utensils } from "lucide-react";
import { formatDisplayDate } from "@/lib/agent/dates";
import type { DayPlan, PlannedActivity, SourceRef, TripPlan } from "@/lib/agent/types";
import { INTEREST_LABELS, formatHours, formatInr, formatMinutes } from "@/lib/format";
import { Badge, Card, SectionHeading, cn } from "@/components/ui/primitives";
import { SourceLabel } from "./SourceLabel";

const KIND_LABELS: Record<DayPlan["kind"], string | null> = {
  arrival: "Arrival",
  departure: "Heading home",
  "arrival-departure": "Day trip",
  travel: "Travel",
  full: null,
};

const SLOT_LABELS = { morning: "Morning", afternoon: "Afternoon", evening: "Evening" } as const;

function ActivityRow({ activity, sources, isFirst, requested }: { activity: PlannedActivity; sources: Map<string, SourceRef>; isFirst: boolean; requested: string[] }) {
  const wiki = activity.sourceIds.map((id) => sources.get(id)).find((s) => s?.kind === "verified" && s.url);
  return (
    <li className="relative pl-16 sm:pl-20">
      <div className="absolute top-0 left-0 w-12 text-right sm:w-14">
        <p className="text-sm font-semibold text-ink tabular-nums">{activity.startTime}</p>
        <p className="text-[11px] tracking-wide text-ink-faint uppercase">{SLOT_LABELS[activity.slot]}</p>
      </div>
      <span className={cn("absolute left-[3.6rem]", activity.travelMinutes > 0 ? "top-[1.6rem]" : "top-1.5", " h-2.5 w-2.5 rounded-full border-2 border-lagoon bg-surface sm:left-[4.35rem]")} aria-hidden />
      {activity.travelMinutes > 0 && (
        <p className="mb-1 flex items-center gap-1.5 text-xs text-ink-faint">
          <Car className="h-3 w-3" aria-hidden />
          {formatMinutes(activity.travelMinutes)} {isFirst ? "from your stay" : "from the previous stop"}
        </p>
      )}
      <h4 className="font-medium text-ink">{activity.name}</h4>
      <p className="mt-0.5 text-sm text-ink-soft">{activity.description}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Badge>
          <Clock className="h-3 w-3" aria-hidden />
          {formatHours(activity.durationHours)}
        </Badge>
        <Badge tone={activity.costInr === 0 ? "ok" : "neutral"}>{activity.costInr === 0 ? "Free" : `${formatInr(activity.costInr)} est.`}</Badge>
        {activity.interests.map((interest) => (
          <Badge key={interest} tone={requested.includes(interest) ? "lagoon" : "neutral"}>
            {INTEREST_LABELS[interest]}
          </Badge>
        ))}
        {wiki?.url && (
          <a
            href={wiki.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-ink-faint underline decoration-line-strong underline-offset-2 hover:text-ink"
          >
            Wikipedia <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
        )}
      </div>
    </li>
  );
}

function DayCard({ day, plan, sources }: { day: DayPlan; plan: TripPlan; sources: Map<string, SourceRef> }) {
  const kind = KIND_LABELS[day.kind];
  const freeTime = day.notes.filter((n) => /unhurried|free day/i.test(n));
  const logistics = day.notes.filter((n) => !freeTime.includes(n));

  return (
    <Card className="overflow-hidden" id={`day-${day.day}`}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line bg-surface-muted/40 px-5 py-4">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-xl bg-ink text-white">
            <span className="text-[9px] leading-none tracking-wider uppercase opacity-70">Day</span>
            <span className="text-base leading-tight font-semibold">{day.day}</span>
          </span>
          <div>
            <p className="text-sm text-ink-faint">
              {formatDisplayDate(day.date)}
              {kind && <span className="ml-2 rounded-full bg-clay-soft px-2 py-0.5 text-xs font-medium text-clay">{kind}</span>}
            </p>
            <h3 className="font-display text-lg leading-snug text-ink">{day.title}</h3>
          </div>
        </div>
        <div className="text-right text-sm">
          <p className="font-medium text-ink">{formatInr(day.spendInr)}</p>
          <p className="text-xs text-ink-faint">on the ground{day.travelMinutes > 0 ? ` · ${formatMinutes(day.travelMinutes)} local travel` : ""}</p>
        </div>
      </header>

      <div className="space-y-5 px-5 py-5">
        {logistics.length > 0 && (
          <div className="flex gap-2 rounded-lg bg-surface-muted/70 px-3 py-2 text-sm text-ink-soft">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
            <div className="space-y-1">
              {logistics.map((note) => (
                <p key={note}>{note}</p>
              ))}
            </div>
          </div>
        )}

        {day.activities.length > 0 && (
          <ol className="relative space-y-6 before:absolute before:top-2 before:bottom-2 before:left-[3.9rem] before:w-px before:bg-line sm:before:left-[4.65rem]">
            {day.activities.map((activity, index) => (
              <ActivityRow key={activity.id} activity={activity} sources={sources} isFirst={index === 0} requested={plan.constraints.interests} />
            ))}
          </ol>
        )}

        {freeTime.map((note) => (
          <p key={note} className="flex items-center gap-2 rounded-lg border border-dashed border-line-strong px-3 py-2 text-sm text-ink-soft">
            <Coffee className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
            {note}
          </p>
        ))}

        {(day.food.length > 0 || day.stayName) && (
          <div className={cn("grid gap-4 border-t border-line pt-4", day.stayName && day.food.length > 0 && "sm:grid-cols-[1.6fr_1fr]")}>
            {day.food.length > 0 && (
              <div>
                <p className="flex items-center gap-1.5 text-xs font-semibold tracking-[0.1em] text-ink-faint uppercase">
                  <Utensils className="h-3.5 w-3.5" aria-hidden /> Eat
                </p>
                <ul className="mt-1.5 space-y-1 text-sm">
                  {day.food.map((f) => (
                    <li key={f.name} className="flex justify-between gap-3">
                      <span className="text-ink" title={f.description}>
                        {f.name}
                      </span>
                      <span className="shrink-0 text-ink-faint">{f.costPerPersonInr === 0 ? "Free" : `~${formatInr(f.costPerPersonInr)}/person`}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {day.stayName && (
              <div>
                <p className="flex items-center gap-1.5 text-xs font-semibold tracking-[0.1em] text-ink-faint uppercase">
                  <BedDouble className="h-3.5 w-3.5" aria-hidden /> Sleep
                </p>
                <p className="mt-1.5 text-sm text-ink">{day.stayName}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

export function Itinerary({ plan }: { plan: TripPlan }) {
  const sources = new Map(plan.sources.map((s) => [s.id, s]));
  return (
    <section aria-labelledby="itinerary-heading">
      <SectionHeading
        id="itinerary-heading"
        eyebrow="Day by day"
        title="Your itinerary"
        action={
          <span className="hidden gap-1.5 sm:flex">
            <SourceLabel kind="suggestion" />
            <SourceLabel kind="estimated" />
          </span>
        }
      />
      <p className="-mt-2 mb-4 text-sm text-ink-soft">
        Timings and travel times are our suggestions based on distances between stops. Prices are estimates for {plan.constraints.travelers} — check before booking.
      </p>
      <div className="space-y-4">
        {plan.days.map((day) => (
          <DayCard key={day.day} day={day} plan={plan} sources={sources} />
        ))}
      </div>
    </section>
  );
}
