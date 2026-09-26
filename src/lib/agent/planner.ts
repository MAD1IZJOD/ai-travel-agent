/**
 * Trip planner: turns constraints plus a set of planning choices (stay tier,
 * transport strategy, activity style) into a complete, costed plan.
 *
 * It is pure and synchronous — research data is attached separately, and
 * validation / revision live in their own modules — so each stage can be
 * tested in isolation.
 */
import { GUIDE_PRICE_BASIS, getGuide } from "@/lib/data/guides";
import { getDestination, getOrigin } from "@/lib/data/places";
import { STAY_LABELS, formatInr } from "@/lib/format";
import { roundTo } from "./geo";
import { buildItinerary, travelWindows } from "./itinerary";
import { BUFFER_RATE, GUESTS_PER_ROOM, STAY_TIER_THRESHOLDS } from "./pricing";
import { rankDestinations, type CandidateEstimate, type DestinationCandidate } from "./selector";
import { chooseTransport, toTransportPlan, transportOptions, type TransportStrategy } from "./transport";
import type { BudgetBreakdown, DestinationSummary, SourceRef, StayPlan, StayTier, TripConstraints, TripPlan } from "./types";

export interface PlanOptions {
  stayTier: StayTier;
  foodTier: StayTier;
  transportStrategy: TransportStrategy;
  frugalActivities: boolean;
  sharedLocalTransport: boolean;
  preferredActivityIds?: string[];
}

export const CHEAPEST_OPTIONS: PlanOptions = {
  stayTier: "budget",
  foodTier: "budget",
  transportStrategy: "cheapest",
  frugalActivities: true,
  sharedLocalTransport: true,
};

export interface DraftPlan {
  feasible: boolean;
  plan: TripPlan | null;
}

/* ------------------------------------------------------------------ */
/* Sources                                                             */
/* ------------------------------------------------------------------ */

export function wikipediaUrl(title: string): string {
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;
}

function baseSources(destinationName: string, destinationId: string): SourceRef[] {
  return [
    {
      id: `guide:${destinationId}`,
      label: `Wayfare destination guide: ${destinationName}`,
      kind: "reference",
      note: "Curated list of well-known places, dishes and neighbourhoods.",
    },
    { id: "estimate:transport", label: "Transport fares and times", kind: "estimated", note: "Distance-based model of typical bus, 3AC train and economy fares. Not a live quote." },
    { id: "estimate:stay", label: "Room rates", kind: "estimated", note: GUIDE_PRICE_BASIS },
    { id: "estimate:fees", label: "Entry fees and activity prices", kind: "estimated", note: GUIDE_PRICE_BASIS },
    { id: "estimate:food", label: "Food and local travel costs", kind: "estimated", note: "Per-day allowances adjusted for local prices." },
    { id: "agent:itinerary", label: "Day plans, timings and travel times", kind: "suggestion", note: "Arranged by the planner from straight-line distances between stops." },
  ];
}

/* ------------------------------------------------------------------ */
/* Building blocks                                                     */
/* ------------------------------------------------------------------ */

export function stayTierForBudget(perPersonPerDay: number): StayTier {
  if (perPersonPerDay >= STAY_TIER_THRESHOLDS.comfort) return "comfort";
  if (perPersonPerDay >= STAY_TIER_THRESHOLDS.mid) return "mid";
  return "budget";
}

function stayPlan(destinationId: string, tier: StayTier, travelers: number, nights: number): StayPlan {
  const option = getGuide(destinationId).stays[tier];
  const rooms = Math.ceil(travelers / GUESTS_PER_ROOM);
  return {
    tier,
    name: option.name,
    area: option.area,
    nightlyRateInr: option.nightlyRate,
    rooms,
    nights,
    totalInr: option.nightlyRate * rooms * nights,
  };
}

export function budgetBreakdown(parts: Omit<BudgetBreakdown, "buffer" | "total" | "remaining">): BudgetBreakdown {
  const subtotal = parts.transport + parts.stay + parts.food + parts.activities + parts.localTravel;
  const buffer = roundTo(subtotal * BUFFER_RATE, 100);
  const total = subtotal + buffer;
  return { ...parts, buffer, total, remaining: parts.budget - total };
}

/** Initial planning choices, before any validation-driven revision. */
export function initialOptions(constraints: TripConstraints, destinationId: string): PlanOptions {
  const cheapest = buildPlan(constraints, destinationId, CHEAPEST_OPTIONS);
  const transport = cheapest.plan?.transport.totalInr ?? 0;
  const perPersonPerDay = (constraints.budgetInr - transport) / (constraints.travelers * constraints.days);
  const tier = stayTierForBudget(perPersonPerDay);
  return {
    stayTier: tier,
    foodTier: tier,
    transportStrategy: tier === "budget" ? "cheapest" : "balanced",
    frugalActivities: false,
    sharedLocalTransport: tier === "budget",
  };
}

/* ------------------------------------------------------------------ */
/* Plan                                                                */
/* ------------------------------------------------------------------ */

export function buildPlan(
  constraints: TripConstraints,
  destinationId: string,
  options: PlanOptions,
  selection?: { candidate?: DestinationCandidate; alternatives?: DestinationCandidate[] },
): DraftPlan {
  const origin = getOrigin(constraints.originId);
  const place = getDestination(destinationId);
  const guide = getGuide(destinationId);

  const allOptions = transportOptions(origin, place, guide, constraints.travelers, options.sharedLocalTransport);
  const chosen = chooseTransport(allOptions, options.transportStrategy, options.stayTier, constraints.travelers, constraints.pace);
  if (!chosen) return { feasible: false, plan: null };

  const windows = travelWindows(constraints.days, chosen, constraints.pace);
  if (!windows.feasible) return { feasible: false, plan: null };

  const transport = toTransportPlan(chosen, allOptions, options.transportStrategy, origin, place, constraints.travelers);
  const stay = stayPlan(destinationId, options.stayTier, constraints.travelers, windows.nights);
  const itinerary = buildItinerary({
    constraints,
    place,
    guide,
    windows,
    stay,
    foodTier: options.foodTier,
    options: {
      frugalActivities: options.frugalActivities,
      sharedLocalTransport: options.sharedLocalTransport,
      preferredActivityIds: options.preferredActivityIds,
    },
  });

  const budget = budgetBreakdown({
    transport: transport.totalInr,
    stay: stay.totalInr,
    food: itinerary.foodInr,
    activities: itinerary.activitiesInr,
    localTravel: itinerary.localTravelInr,
    budget: constraints.budgetInr,
  });

  const destination: DestinationSummary = {
    id: place.id,
    name: place.name,
    region: place.region,
    tagline: guide.tagline,
    description: guide.tagline,
    imageUrl: null,
    lat: place.lat,
    lng: place.lng,
    matchedInterests: selection?.candidate?.matched ?? constraints.interests.filter((i) => (guide.interestScores[i] ?? 0) >= 2),
    whyChosen: selection?.candidate?.reasons ?? ["You chose this destination"],
    alternativesConsidered: (selection?.alternatives ?? []).map((alt) => ({
      name: alt.name,
      reason: alt.concerns[0] ?? "Scored slightly lower overall",
    })),
  };

  const allActivities = itinerary.days.flatMap((d) => d.activities);
  const highlights = [
    ...allActivities
      .filter((a) => a.interests.some((i) => constraints.interests.includes(i)))
      .slice(0, 3)
      .map((a) => a.name),
    `${STAY_LABELS[stay.tier]} stay: ${stay.name.toLowerCase()} in ${stay.area}`,
  ];

  const plan: TripPlan = {
    status: "ok",
    constraints,
    destination,
    transport,
    stay,
    days: itinerary.days,
    budget,
    checks: [],
    revisions: [],
    adjustments: [],
    weather: null,
    sources: baseSources(place.name, place.id),
    research: [],
    highlights,
    notices: [],
    generatedAt: new Date().toISOString(),
  };
  return { feasible: true, plan };
}

/** Cheapest workable version of a trip — used for ranking and for "can this ever fit?" checks. */
export function estimateCandidate(constraints: TripConstraints, destinationId: string): CandidateEstimate {
  const draft = buildPlan(constraints, destinationId, CHEAPEST_OPTIONS);
  if (!draft.plan) {
    return { minimumTotalInr: null, oneWayHours: Infinity, overnight: false };
  }
  return {
    minimumTotalInr: draft.plan.budget.total,
    oneWayHours: draft.plan.transport.outbound.hours,
    overnight: draft.plan.transport.outbound.overnight,
  };
}

export function selectDestination(constraints: TripConstraints): { chosen: DestinationCandidate; ranked: DestinationCandidate[] } {
  const ranked = rankDestinations(constraints, (id) => estimateCandidate(constraints, id));
  if (constraints.destinationId) {
    const chosen = ranked.find((c) => c.id === constraints.destinationId)!;
    return { chosen: { ...chosen, reasons: ["You picked it", ...chosen.reasons] }, ranked };
  }
  return { chosen: ranked[0], ranked };
}

/** Straight path: pick a destination, choose initial options, build the plan. */
export function draftTrip(constraints: TripConstraints): DraftPlan & { options: PlanOptions | null } {
  const { chosen, ranked } = selectDestination(constraints);
  const options = initialOptions(constraints, chosen.id);
  const alternatives = constraints.destinationId ? [] : ranked.filter((c) => c.id !== chosen.id && Number.isFinite(c.score)).slice(0, 2);
  const draft = buildPlan(constraints, chosen.id, options, { candidate: chosen, alternatives });
  return { ...draft, options };
}

export function describeBudget(plan: TripPlan): string {
  const { total, budget, remaining } = plan.budget;
  return remaining >= 0
    ? `${formatInr(total)} of your ${formatInr(budget)} budget, leaving ${formatInr(remaining)}`
    : `${formatInr(total)} — ${formatInr(-remaining)} over your ${formatInr(budget)} budget`;
}
