import { BedDouble, Bus, Moon, Plane, TrainFront } from "lucide-react";
import type { TransportLeg, TripPlan } from "@/lib/agent/types";
import { MODE_LABELS, STAY_LABELS, formatHours, formatInr } from "@/lib/format";
import { Card } from "@/components/ui/primitives";
import { SourceLabel } from "./SourceLabel";

const MODE_ICONS = { bus: Bus, train: TrainFront, flight: Plane };

function Leg({ leg, label }: { leg: TransportLeg; label: string }) {
  const Icon = MODE_ICONS[leg.mode];
  return (
    <div className="flex gap-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-lagoon-soft text-lagoon">
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <div className="min-w-0 text-sm">
        <p className="font-medium text-ink">
          {label}: {leg.from} → {leg.to}
        </p>
        <p className="text-ink-soft">
          {leg.overnight && <Moon className="mr-1 inline h-3.5 w-3.5" aria-label="Overnight" />}
          {leg.overnight ? "Overnight " : ""}
          {MODE_LABELS[leg.mode].toLowerCase()} · ~{formatHours(leg.hours)} door to door · ~{formatInr(leg.costPerPersonInr)}/person
        </p>
        <p className="text-ink-faint">{leg.lastMile}</p>
      </div>
    </div>
  );
}

export function LogisticsCard({ plan }: { plan: TripPlan }) {
  const { transport, stay } = plan;
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-xl text-ink">Getting there</h2>
        <SourceLabel kind="estimated" />
      </div>
      <div className="mt-4 space-y-4">
        <Leg leg={transport.outbound} label="Out" />
        <Leg leg={transport.inbound} label="Back" />
      </div>
      <p className="mt-4 rounded-lg bg-surface-muted/70 p-3 text-sm text-ink-soft">{transport.rationale}</p>

      <div className="mt-5 border-t border-line pt-4">
        <h3 className="flex items-center gap-2 font-medium text-ink">
          <BedDouble className="h-4 w-4 text-ink-faint" aria-hidden />
          Where you&apos;ll stay
        </h3>
        {stay.nights > 0 ? (
          <>
            <p className="mt-1 text-sm text-ink">
              {STAY_LABELS[stay.tier]} · {stay.name.toLowerCase()} in {stay.area}
            </p>
            <p className="text-sm text-ink-soft">
              {stay.rooms} room{stay.rooms > 1 ? "s" : ""} × {stay.nights} night{stay.nights > 1 ? "s" : ""} at ~{formatInr(stay.nightlyRateInr)} = {formatInr(stay.totalInr)}
            </p>
            <p className="mt-1 text-xs text-ink-faint">A type of stay and area, not a specific booking — pick any well-reviewed place that matches.</p>
          </>
        ) : (
          <p className="mt-1 text-sm text-ink-soft">No hotel night needed for this trip.</p>
        )}
      </div>
    </Card>
  );
}
