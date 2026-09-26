/**
 * Constraint validation. Independent of generation: it only reads a finished
 * plan and reports what holds and what doesn't. Hard checks must pass for a
 * plan to be presented as-is; soft checks become warnings.
 */
import { getGuide } from "@/lib/data/guides";
import { findDestination, getOrigin } from "@/lib/data/places";
import { INTEREST_LABELS, PACE_LABELS, formatInr } from "@/lib/format";
import { monthIndex } from "./dates";
import { PACE_RULES } from "./itinerary";
import { GUESTS_PER_ROOM, TRANSPORT_MODEL } from "./pricing";
import type { ConstraintCheck, TripConstraints, TripPlan } from "./types";

/** Budget headroom below which we call the plan "tight". */
const TIGHT_BUDGET_SHARE = 0.03;
/** Share of waking hours spent travelling above which we warn. */
const MAX_TRAVEL_SHARE = 0.35;
const USABLE_HOURS_PER_DAY = 14;
const MIN_ON_TOPIC_SHARE = 0.5;
const EARLIEST_START_HOUR = 5;
const LATEST_END_HOUR = 23;

function toHours(clock: string): number {
  const [h, m] = clock.split(":").map(Number);
  return h + m / 60;
}

export function validatePlan(plan: TripPlan, constraints: TripConstraints): ConstraintCheck[] {
  const checks: ConstraintCheck[] = [];
  const activities = plan.days.flatMap((d) => d.activities);
  const guide = getGuide(plan.destination.id);

  // Budget (hard)
  const { total, budget, remaining } = plan.budget;
  checks.push(
    remaining < 0
      ? { id: "budget", label: "Budget", status: "fail", hard: true, detail: `Estimated ${formatInr(total)} is ${formatInr(-remaining)} over your ${formatInr(budget)} budget.` }
      : remaining < budget * TIGHT_BUDGET_SHARE
        ? { id: "budget", label: "Budget", status: "warn", hard: true, detail: `Fits, but only ${formatInr(remaining)} to spare — little room for surprises.` }
        : { id: "budget", label: "Budget", status: "pass", hard: true, detail: `Estimated ${formatInr(total)}, ${formatInr(remaining)} under your ${formatInr(budget)} budget (includes a contingency buffer).` },
  );

  // Duration (hard)
  checks.push(
    plan.days.length === constraints.days
      ? { id: "duration", label: "Trip length", status: "pass", hard: true, detail: `${constraints.days} days, door to door.` }
      : { id: "duration", label: "Trip length", status: "fail", hard: true, detail: `Plan has ${plan.days.length} days but you asked for ${constraints.days}.` },
  );

  // Travellers (hard)
  const roomsNeeded = Math.ceil(constraints.travelers / GUESTS_PER_ROOM);
  const priced = activities.every((a) => a.costInr % constraints.travelers === 0);
  checks.push(
    plan.stay.rooms >= roomsNeeded && priced
      ? { id: "travelers", label: "Travellers", status: "pass", hard: true, detail: `Priced for ${constraints.travelers}, with ${plan.stay.rooms} room${plan.stay.rooms > 1 ? "s" : ""}.` }
      : { id: "travelers", label: "Travellers", status: "fail", hard: true, detail: `Not every cost covers all ${constraints.travelers} travellers.` },
  );

  // Origin (hard)
  const origin = getOrigin(constraints.originId);
  checks.push(
    plan.transport.outbound.from === origin.name && plan.transport.inbound.to === origin.name
      ? { id: "origin", label: "Starting point", status: "pass", hard: true, detail: `Round trip from ${origin.name}.` }
      : { id: "origin", label: "Starting point", status: "fail", hard: true, detail: `Transport doesn't start and end in ${origin.name}.` },
  );

  // Destination (hard, only if the traveller chose one)
  if (constraints.destinationId) {
    const wanted = findDestination(constraints.destinationId)?.name ?? constraints.destinationId;
    checks.push(
      plan.destination.id === constraints.destinationId
        ? { id: "destination", label: "Destination", status: "pass", hard: true, detail: `${wanted}, as you asked.` }
        : { id: "destination", label: "Destination", status: "fail", hard: true, detail: `You asked for ${wanted}.` },
    );
  }

  // Pace (hard ceiling)
  const rules = PACE_RULES[constraints.pace];
  const busiest = Math.max(0, ...plan.days.map((d) => d.activities.length));
  const fullDays = plan.days.filter((d) => d.kind === "full");
  const average = fullDays.length ? fullDays.reduce((s, d) => s + d.activities.length, 0) / fullDays.length : 0;
  checks.push(
    busiest > rules.maxPerDay
      ? { id: "pace", label: "Pace", status: "fail", hard: true, detail: `A day has ${busiest} activities — too many for a ${PACE_LABELS[constraints.pace].label.toLowerCase()} trip.` }
      : constraints.pace === "packed" && average < 2.5 && fullDays.length > 0
        ? { id: "pace", label: "Pace", status: "warn", hard: true, detail: `Averages ${average.toFixed(1)} activities a day — we ran short of new things that match your interests here.` }
        : { id: "pace", label: "Pace", status: "pass", hard: true, detail: `${PACE_LABELS[constraints.pace].label}: at most ${busiest} planned activit${busiest === 1 ? "y" : "ies"} on any day.` },
  );

  // Interests (soft)
  const covered = constraints.interests.filter(
    (interest) => activities.some((a) => a.interests.includes(interest)) || (interest === "food" && plan.days.some((d) => d.food.length > 0)),
  );
  const missing = constraints.interests.filter((i) => !covered.includes(i));
  const onTopic = activities.filter((a) => a.interests.some((i) => constraints.interests.includes(i))).length;
  const share = activities.length ? onTopic / activities.length : 0;
  checks.push(
    missing.length > 0
      ? { id: "interests", label: "Interests", status: "warn", hard: false, detail: `Couldn't find good ${missing.map((i) => INTEREST_LABELS[i].toLowerCase()).join(" or ")} options at ${plan.destination.name}.` }
      : share < MIN_ON_TOPIC_SHARE
        ? { id: "interests", label: "Interests", status: "warn", hard: false, detail: `Only ${Math.round(share * 100)}% of activities match your interests.` }
        : { id: "interests", label: "Interests", status: "pass", hard: false, detail: `${onTopic} of ${activities.length} activities match ${constraints.interests.map((i) => INTEREST_LABELS[i].toLowerCase()).join(", ")}.` },
  );

  // Schedule sanity (hard)
  const clash = plan.days.find((day) =>
    day.activities.some((a, k) => {
      const start = toHours(a.startTime);
      const end = start + a.durationHours;
      const next = day.activities[k + 1];
      return start < EARLIEST_START_HOUR || end > LATEST_END_HOUR || (next !== undefined && toHours(next.startTime) < end);
    }),
  );
  const month = monthIndex(constraints.startDate);
  const outOfSeason = activities.find((a) => {
    const source = guide.attractions.find((x) => x.id === a.id);
    return source?.months && !source.months.includes(month);
  });
  checks.push(
    clash
      ? { id: "schedule", label: "Schedule", status: "fail", hard: true, detail: `Day ${clash.day} has overlapping or unrealistic timings.` }
      : outOfSeason
        ? { id: "schedule", label: "Schedule", status: "fail", hard: true, detail: `${outOfSeason.name} isn't running at that time of year.` }
        : { id: "schedule", label: "Schedule", status: "pass", hard: true, detail: "No overlaps, and every activity is open in your travel month." },
  );

  // Travel burden (soft)
  const daytimeHours = [plan.transport.outbound, plan.transport.inbound].reduce((sum, leg) => sum + (leg.overnight ? 0 : leg.hours), 0);
  const travelShare = daytimeHours / (constraints.days * USABLE_HOURS_PER_DAY);
  checks.push(
    travelShare > MAX_TRAVEL_SHARE || plan.transport.outbound.hours > TRANSPORT_MODEL.overnightMaxHours
      ? { id: "travel", label: "Travel time", status: "warn", hard: false, detail: `About ${Math.round(daytimeHours)} daytime hours in transit — a big share of a ${constraints.days}-day trip.` }
      : { id: "travel", label: "Travel time", status: "pass", hard: false, detail: plan.transport.outbound.overnight ? "Overnight journeys keep your days free." : `About ${Math.round(daytimeHours)} hours of travel in total.` },
  );

  // Season & weather (soft)
  const seasonal = guide.seasonNotes.find((n) => n.months.includes(month));
  const wet = plan.weather && plan.weather.days > 0 && plan.weather.wetDays / plan.weather.days >= 0.5;
  checks.push(
    !guide.bestMonths.includes(month) || wet
      ? { id: "season", label: "Season & weather", status: "warn", hard: false, detail: seasonal?.note ?? (wet ? "Expect rain on most days." : "Not the best time of year to visit.") }
      : { id: "season", label: "Season & weather", status: "pass", hard: false, detail: plan.weather ? plan.weather.note : "A good time of year to visit." },
  );

  return checks;
}

export function failingHardChecks(checks: ConstraintCheck[]): ConstraintCheck[] {
  return checks.filter((c) => c.hard && c.status === "fail");
}
