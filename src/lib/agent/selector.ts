/**
 * Destination ranking. Each candidate gets a score from interest fit, season,
 * travel burden and affordability, plus plain-language reasons the UI shows.
 */
import { GUIDES } from "@/lib/data/guides";
import { DESTINATIONS, getOrigin } from "@/lib/data/places";
import { INTEREST_LABELS, formatHours } from "@/lib/format";
import { monthIndex } from "./dates";
import { PACE_RULES } from "./itinerary";
import type { Interest, TripConstraints } from "./types";

export interface CandidateEstimate {
  /** Cheapest workable total for the trip, or null if travel doesn't fit. */
  minimumTotalInr: number | null;
  oneWayHours: number;
  overnight: boolean;
}

export interface DestinationCandidate {
  id: string;
  name: string;
  score: number;
  matched: Interest[];
  weak: Interest[];
  inSeason: boolean;
  estimate: CandidateEstimate;
  reasons: string[];
  concerns: string[];
}

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const WEIGHTS = {
  interestFit: 60,
  inSeason: 12,
  offSeason: -12,
  travelBurden: 45,
  depth: 30,
  /** Scales with how much of the budget the cheapest version leaves spare. */
  affordabilitySlack: 20,
  unaffordableBase: -30,
  unaffordableSlope: -60,
};

/**
 * Share of the trip's activity slots a destination can fill with in-season
 * attractions that match the traveller's interests (0–1).
 */
export function activityDepth(destinationId: string, constraints: TripConstraints): number {
  const month = monthIndex(constraints.startDate);
  const matching = GUIDES[destinationId].attractions.filter(
    (a) => (!a.months || a.months.includes(month)) && a.interests.some((i) => constraints.interests.includes(i)),
  ).length;
  const needed = Math.max(1, Math.round(constraints.days * PACE_RULES[constraints.pace].maxPerDay * 0.7));
  return Math.min(1, matching / needed);
}

/** Hours of usable daylight we assume per trip day when weighing travel time. */
const USABLE_HOURS_PER_DAY = 14;

export function interestFit(destinationId: string, interests: Interest[]): { fit: number; matched: Interest[]; weak: Interest[] } {
  const guide = GUIDES[destinationId];
  const scores = interests.map((i) => guide.interestScores[i] ?? 0);
  return {
    fit: scores.reduce((a, b) => a + b, 0) / (3 * interests.length),
    matched: interests.filter((_, k) => scores[k] >= 2),
    weak: interests.filter((_, k) => scores[k] <= 1),
  };
}

export function rankDestinations(
  constraints: TripConstraints,
  estimate: (destinationId: string) => CandidateEstimate,
): DestinationCandidate[] {
  const origin = getOrigin(constraints.originId);
  const month = monthIndex(constraints.startDate);

  return DESTINATIONS.map((place) => {
    const guide = GUIDES[place.id];
    const { fit, matched, weak } = interestFit(place.id, constraints.interests);
    const inSeason = guide.bestMonths.includes(month);
    const est = estimate(place.id);
    const reasons: string[] = [];
    const concerns: string[] = [];

    let score = fit * WEIGHTS.interestFit;
    if (matched.length > 0) reasons.push(`Strong for ${matched.map((i) => INTEREST_LABELS[i].toLowerCase()).join(" and ")}`);
    if (weak.length > 0) concerns.push(`Not much for ${weak.map((i) => INTEREST_LABELS[i].toLowerCase()).join(" or ")}`);

    const depth = activityDepth(place.id, constraints);
    score += WEIGHTS.depth * depth;
    if (depth < 0.6) concerns.push("Not enough matching things to do for a trip this long");

    score += inSeason ? WEIGHTS.inSeason : WEIGHTS.offSeason;
    if (inSeason) reasons.push(`${MONTH_NAMES[month]} is a good time to go`);
    else {
      const seasonal = guide.seasonNotes.find((n) => n.months.includes(month));
      concerns.push(seasonal ? seasonal.note : `${MONTH_NAMES[month]} isn't the best season`);
    }

    const travelShare = (2 * est.oneWayHours * (est.overnight ? 0.6 : 1)) / (constraints.days * USABLE_HOURS_PER_DAY);
    score -= WEIGHTS.travelBurden * travelShare;
    const journey = `${est.overnight ? "an overnight trip" : formatHours(est.oneWayHours)} from ${origin.name}`;
    if (travelShare < 0.25) reasons.push(`Easy to reach — ${journey}`);
    else if (travelShare > 0.45) concerns.push(`Getting there takes a big share of a ${constraints.days}-day trip (${journey})`);

    if (est.minimumTotalInr === null) {
      score = -Infinity;
      concerns.push("Travel alone would take longer than the trip");
    } else if (est.minimumTotalInr <= constraints.budgetInr) {
      score += WEIGHTS.affordabilitySlack * (1 - est.minimumTotalInr / constraints.budgetInr);
      reasons.push("Fits your budget");
    } else {
      const over = est.minimumTotalInr / constraints.budgetInr - 1;
      score += WEIGHTS.unaffordableBase + WEIGHTS.unaffordableSlope * over;
      concerns.push("Hard to do within your budget");
    }

    return { id: place.id, name: place.name, score, matched, weak, inSeason, estimate: est, reasons, concerns };
  }).sort((a, b) => b.score - a.score);
}
