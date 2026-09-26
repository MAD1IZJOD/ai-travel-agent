/**
 * Replanning: when the traveller changes a requirement, work out what that
 * change affects, keep what still works (destination, activities), rebuild
 * the rest, and explain the difference in plain language.
 */
import { GUIDES } from "@/lib/data/guides";
import { findDestination, getOrigin } from "@/lib/data/places";
import { INTEREST_LABELS, MODE_LABELS, PACE_LABELS, STAY_LABELS, formatInr, pluralize } from "@/lib/format";
import { formatDisplayDate } from "./dates";
import type { DestinationCandidate } from "./selector";
import type { ConstraintField, PlanChange, PlanDiff, PlanSnapshot, TripConstraints, TripPlan } from "./types";

/** Keep the previous destination unless another scores this much better. */
const STICKY_DESTINATION_MARGIN = 8;

export function snapshotOf(plan: TripPlan): PlanSnapshot {
  const activities = plan.days.flatMap((d) => d.activities);
  return {
    constraints: plan.constraints,
    destinationId: plan.destination.id,
    destinationName: plan.destination.name,
    transportMode: plan.transport.outbound.mode,
    transportHours: plan.transport.outbound.hours,
    transportTotalInr: plan.transport.totalInr,
    stayTier: plan.stay.tier,
    stayLabel: `${plan.stay.name}, ${plan.stay.area}`,
    budgetTotalInr: plan.budget.total,
    activityIds: activities.map((a) => a.id),
    activityNames: activities.map((a) => a.name),
  };
}

export function changedFields(before: TripConstraints, after: TripConstraints): ConstraintField[] {
  return (Object.keys(after) as ConstraintField[]).filter((field) => JSON.stringify(before[field]) !== JSON.stringify(after[field]));
}

function describeValue(field: ConstraintField, c: TripConstraints): string {
  switch (field) {
    case "originId":
      return getOrigin(c.originId).name;
    case "destinationId":
      return c.destinationId ? (findDestination(c.destinationId)?.name ?? c.destinationId) : "Your choice";
    case "travelers":
      return pluralize(c.travelers, "traveller");
    case "days":
      return pluralize(c.days, "day");
    case "budgetInr":
      return formatInr(c.budgetInr);
    case "interests":
      return c.interests.map((i) => INTEREST_LABELS[i]).join(" + ");
    case "pace":
      return PACE_LABELS[c.pace].label;
    case "startDate":
      return formatDisplayDate(c.startDate);
  }
}

export const FIELD_NOUNS: Record<ConstraintField, string> = {
  originId: "new starting city",
  destinationId: "destination choice",
  travelers: "group size",
  days: "trip length",
  budgetInr: "budget",
  interests: "interests",
  pace: "pace",
  startDate: "dates",
};

function causeFor(field: ConstraintField, before: TripConstraints, after: TripConstraints): string {
  switch (field) {
    case "budgetInr":
      return after.budgetInr < before.budgetInr ? "To fit the lower budget" : "The higher budget allows it";
    case "pace":
      return `To match a ${PACE_LABELS[after.pace].label.toLowerCase()} pace`;
    case "interests":
      return `To reflect ${after.interests.map((i) => INTEREST_LABELS[i].toLowerCase()).join(" and ")}`;
    case "days":
      return `For a ${after.days}-day trip`;
    case "travelers":
      return `For ${pluralize(after.travelers, "traveller")}`;
    case "originId":
      return `Starting from ${getOrigin(after.originId).name} now`;
    case "startDate":
      return "For your new dates";
    case "destinationId":
      return after.destinationId ? `You picked ${describeValue("destinationId", after)}` : "You asked us to choose";
  }
}

/** Which constraint changes can affect each part of the plan, most direct first. */
const AREA_CAUSES: Record<PlanChange["area"], ConstraintField[]> = {
  destination: ["destinationId", "interests", "originId", "budgetInr", "days", "startDate"],
  transport: ["originId", "destinationId", "budgetInr", "travelers"],
  stay: ["budgetInr", "travelers", "destinationId", "days"],
  itinerary: ["pace", "interests", "days", "destinationId", "startDate", "budgetInr"],
  food: ["budgetInr", "interests"],
  budget: ["budgetInr", "days", "travelers", "originId", "destinationId", "pace", "interests"],
};

export interface ReplanDestination {
  destinationId: string;
  locked: boolean;
}

/**
 * Decide where the replanned trip goes. A destination the traveller picked is
 * always kept. Otherwise the previous destination is kept unless the change
 * makes somewhere else clearly better — replanning shouldn't reshuffle
 * everything for a small tweak.
 */
export function chooseReplanDestination(previous: PlanSnapshot, next: TripConstraints, ranked: DestinationCandidate[]): ReplanDestination {
  if (next.destinationId) return { destinationId: next.destinationId, locked: true };
  const best = ranked[0];
  const previousCandidate = ranked.find((c) => c.id === previous.destinationId);
  const keep =
    previousCandidate &&
    Number.isFinite(previousCandidate.score) &&
    previousCandidate.estimate.minimumTotalInr !== null &&
    best.score - previousCandidate.score <= STICKY_DESTINATION_MARGIN;
  return keep ? { destinationId: previous.destinationId, locked: false } : { destinationId: best.id, locked: false };
}

export function diffPlans(previous: PlanSnapshot, plan: TripPlan): PlanDiff {
  const before = previous.constraints;
  const after = plan.constraints;
  const fields = changedFields(before, after);
  const changes: PlanChange[] = [];
  const preserved: string[] = [];
  const revisionSteps = plan.revisions.map((r) => r.step);

  const destinationMoved = plan.destination.id !== previous.destinationId;
  const why = (area: PlanChange["area"], fallback?: string): string => {
    if (area !== "itinerary" && area !== "destination" && revisionSteps.length > 0 && fields.includes("budgetInr") && after.budgetInr < before.budgetInr) {
      return `${causeFor("budgetInr", before, after)}: ${revisionSteps[0].charAt(0).toLowerCase()}${revisionSteps[0].slice(1)}`;
    }
    const field = AREA_CAUSES[area].find((f) => fields.includes(f));
    // Transport and stay follow the destination unless a directly related detail changed too.
    if (destinationMoved && (area === "transport" || area === "stay") && (!field || field === "interests" || field === "destinationId")) {
      return `Because you're now going to ${plan.destination.name}`;
    }
    return field ? causeFor(field, before, after) : (fallback ?? "Knock-on effect of your other changes");
  };

  // Destination
  if (plan.destination.id !== previous.destinationId) {
    const switched = plan.revisions.find((r) => r.step.startsWith("Switched from"));
    changes.push({ area: "destination", before: previous.destinationName, after: plan.destination.name, why: switched?.reason ?? why("destination") });
  } else {
    preserved.push(`Destination: ${plan.destination.name}`);
  }

  // Transport
  const mode = plan.transport.outbound.mode;
  const transportChanged = mode !== previous.transportMode || Math.abs(plan.transport.totalInr - previous.transportTotalInr) >= 100;
  if (transportChanged) {
    changes.push({
      area: "transport",
      before: `${MODE_LABELS[previous.transportMode]} · ${formatInr(previous.transportTotalInr)}`,
      after: `${MODE_LABELS[mode]} · ${formatInr(plan.transport.totalInr)}`,
      why: why("transport"),
    });
  } else {
    preserved.push(`Travel by ${MODE_LABELS[mode].toLowerCase()}`);
  }

  // Stay
  const stayLabel = `${plan.stay.name}, ${plan.stay.area}`;
  if (plan.stay.tier !== previous.stayTier || stayLabel !== previous.stayLabel) {
    changes.push({
      area: "stay",
      before: `${STAY_LABELS[previous.stayTier]} · ${previous.stayLabel}`,
      after: `${STAY_LABELS[plan.stay.tier]} · ${stayLabel}`,
      why: why("stay"),
    });
  } else {
    preserved.push(`${STAY_LABELS[plan.stay.tier]} stay in ${plan.stay.area}`);
  }

  // Itinerary
  const nowIds = plan.days.flatMap((d) => d.activities.map((a) => a.id));
  const kept = nowIds.filter((id) => previous.activityIds.includes(id));
  const added = plan.days.flatMap((d) => d.activities).filter((a) => !previous.activityIds.includes(a.id));
  const removed = previous.activityNames.filter((_, k) => !nowIds.includes(previous.activityIds[k]));
  if (added.length > 0 || removed.length > 0) {
    const detail = [added.length ? `${added.length} added` : "", removed.length ? `${removed.length} dropped` : ""].filter(Boolean).join(", ");
    changes.push({
      area: "itinerary",
      before: pluralize(previous.activityIds.length, "activity", "activities"),
      after: `${pluralize(nowIds.length, "activity", "activities")} (${detail})`,
      why: why("itinerary"),
    });
  }
  if (kept.length > 0) preserved.push(`${kept.length} of ${previous.activityIds.length} activities kept`);

  // Budget
  if (Math.abs(plan.budget.total - previous.budgetTotalInr) >= 100) {
    changes.push({ area: "budget", before: formatInr(previous.budgetTotalInr), after: formatInr(plan.budget.total), why: why("budget") });
  }

  // Preferences that carried over untouched
  if (!fields.includes("interests")) preserved.push(`Your ${after.interests.map((i) => INTEREST_LABELS[i].toLowerCase()).join(" and ")} focus`);
  if (!fields.includes("pace")) preserved.push(`${PACE_LABELS[after.pace].label} pace`);

  const changedAreas = changes.filter((c) => c.area !== "budget").map((c) => c.area);
  const nouns = fields.map((f) => FIELD_NOUNS[f]);
  const lead = fields.includes("budgetInr") && fields.length === 1 ? (after.budgetInr < before.budgetInr ? "lower budget" : "higher budget") : nouns.join(" and ");
  const summaryParts = [
    changedAreas.length > 0 ? `Your ${lead} changed the ${joinAreas(changedAreas)}.` : `Your ${lead} didn't require changes beyond the cost estimate.`,
  ];
  const keptPreferences = fields.includes("interests") ? null : `Your ${after.interests.map((i) => INTEREST_LABELS[i].toLowerCase()).join(" and ")} preferences were preserved`;
  if (keptPreferences) summaryParts.push(`${keptPreferences}${kept.length ? `, and ${kept.length} of ${previous.activityIds.length} activities stayed the same` : ""}.`);

  return {
    changedConstraints: fields.map((field) => ({ field, before: describeValue(field, before), after: describeValue(field, after) })),
    changes,
    preserved,
    summary: summaryParts.join(" "),
  };
}

function joinAreas(areas: PlanChange["area"][]): string {
  const names = areas.map((a) => (a === "itinerary" ? "day plans" : a));
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * Client-sent snapshots are untrusted: rebuild every display string from our
 * own data using the IDs, and drop activity IDs we don't recognise.
 */
export function normalizeSnapshot(snapshot: PlanSnapshot): PlanSnapshot {
  const guide = GUIDES[snapshot.destinationId];
  const stay = guide.stays[snapshot.stayTier];
  const known = snapshot.activityIds.flatMap((id) => {
    const attraction = guide.attractions.find((a) => a.id === id);
    return attraction ? [{ id, name: attraction.name }] : [];
  });
  return {
    ...snapshot,
    destinationName: findDestination(snapshot.destinationId)?.name ?? snapshot.destinationId,
    stayLabel: `${stay.name}, ${stay.area}`,
    activityIds: known.map((a) => a.id),
    activityNames: known.map((a) => a.name),
  };
}
