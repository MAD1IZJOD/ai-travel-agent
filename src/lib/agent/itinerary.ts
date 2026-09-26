/**
 * Day-by-day itinerary construction.
 *
 * Works out which parts of each day are free once travel is accounted for,
 * then fills them with activities that match the traveller's interests,
 * respecting pace (how many things per day), season, opening months and
 * distance between stops.
 */
import type { Attraction, DestinationGuide } from "@/lib/data/guides";
import type { DestinationPlace } from "@/lib/data/places";
import { MODE_LABELS, formatHours } from "@/lib/format";
import { addDays, monthIndex } from "./dates";
import { haversineKm, roundTo, type Point } from "./geo";
import { FOOD_PER_PERSON_PER_DAY, LAST_MILE, LOCAL_TRAVEL } from "./pricing";
import type { TransportOption } from "./transport";
import type { DayPlan, FoodPick, Interest, Pace, PlannedActivity, Slot, StayPlan, TripConstraints } from "./types";

/* ------------------------------------------------------------------ */
/* Pace rules                                                          */
/* ------------------------------------------------------------------ */

/**
 * maxOffTopicPerDay: activities that match none of the traveller's interests.
 * They rank last and never outnumber on-topic activities on the same day.
 */
export const PACE_RULES: Record<Pace, { maxPerDay: number; maxPerSlot: number; maxOffTopicPerDay: number; startHour: Record<Slot, number> }> = {
  relaxed: { maxPerDay: 2, maxPerSlot: 1, maxOffTopicPerDay: 1, startHour: { morning: 9.5, afternoon: 15, evening: 18 } },
  balanced: { maxPerDay: 3, maxPerSlot: 1, maxOffTopicPerDay: 1, startHour: { morning: 8.5, afternoon: 14, evening: 18 } },
  packed: { maxPerDay: 5, maxPerSlot: 2, maxOffTopicPerDay: 2, startHour: { morning: 8, afternoon: 13.5, evening: 18 } },
};

const SLOTS: Slot[] = ["morning", "afternoon", "evening"];
const SUNRISE_START_HOUR = 5.5;
/** Activities this long take the morning and the afternoon. */
const FULL_DAY_HOURS = 5;
/** Earliest reasonable departure from home, and latest arrival home. */
const DEPART_HOUR = 6.5;
const LATEST_HOME_HOUR = 22;
const OVERNIGHT_DEPART_HOUR = 20;
const OVERNIGHT_ARRIVE_HOUR = 7;

/* ------------------------------------------------------------------ */
/* Travel windows                                                      */
/* ------------------------------------------------------------------ */

export interface DayWindow {
  kind: DayPlan["kind"];
  /** Hours available at the destination that day (local clock), or null. */
  open: [number, number] | null;
  /** Usable hours per slot once travel is taken out. */
  capacity: Partial<Record<Slot, number>>;
  notes: string[];
}

export interface TravelWindows {
  days: DayWindow[];
  /** Nights spent at the destination (i.e. hotel nights). */
  nights: number;
  /** False when travel alone takes longer than the trip. */
  feasible: boolean;
}

const SLOT_HOURS: Record<Slot, [number, number]> = { morning: [8, 12.5], afternoon: [13.5, 18], evening: [18, 21.5] };
/** A slot is only worth planning if at least this much of it is free. */
const MIN_SLOT_HOURS = 1.5;
/** How far an activity may run past the end of its slot. */
const SLOT_OVERRUN_HOURS = 0.5;
/** Time to check in and freshen up after arriving, or to get to the station before leaving. */
const ARRIVAL_BUFFER_HOURS = 0.75;
const DEPARTURE_BUFFER_HOURS = 0.5;
/** On arrival after an overnight journey, relaxed and balanced travellers rest until early afternoon. */
const REST_UNTIL_HOUR = 13;
/** Below this much time at the destination, a trip isn't worth making. */
const MIN_ON_GROUND_HOURS = 3;

function capacityFor(open: [number, number] | null): Partial<Record<Slot, number>> {
  const capacity: Partial<Record<Slot, number>> = {};
  if (!open) return capacity;
  for (const slot of SLOTS) {
    const [start, end] = SLOT_HOURS[slot];
    const overlap = Math.min(end, open[1]) - Math.max(start, open[0]);
    if (overlap >= MIN_SLOT_HOURS) capacity[slot] = overlap;
  }
  return capacity;
}

function clock12(hour: number): string {
  const h = Math.floor(hour) % 24;
  const m = Math.round((hour % 1) * 60);
  const suffix = h >= 12 ? "pm" : "am";
  const display = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${display}${suffix}` : `${display}:${String(m).padStart(2, "0")}${suffix}`;
}

export function travelWindows(totalDays: number, leg: TransportOption, pace: Pace): TravelWindows {
  const mode = MODE_LABELS[leg.mode].toLowerCase();
  const DAY_END = 24;

  // Arrival
  let arrivalDay = 0;
  let arrivalOpen: number;
  let arrivalNote: string;
  if (leg.overnight) {
    arrivalOpen = pace === "packed" ? OVERNIGHT_ARRIVE_HOUR + ARRIVAL_BUFFER_HOURS : REST_UNTIL_HOUR;
    arrivalNote = `Arrive around ${clock12(OVERNIGHT_ARRIVE_HOUR)} on the overnight ${mode} (you leave the evening before). ${pace === "packed" ? "Drop your bags and go." : "Check in and rest before heading out."}`;
  } else {
    const arriveAt = DEPART_HOUR + leg.hours;
    arrivalDay = Math.floor(arriveAt / DAY_END);
    arrivalOpen = (arriveAt % DAY_END) + ARRIVAL_BUFFER_HOURS;
    arrivalNote = `Leave around ${clock12(DEPART_HOUR)} and arrive around ${clock12(arriveAt % DAY_END)} — about ${formatHours(leg.hours)} by ${mode}, door to door.`;
  }

  // Departure
  let departureDay = totalDays - 1;
  let departureClose: number;
  let departureNote: string;
  if (leg.overnight) {
    departureClose = pace === "relaxed" ? REST_UNTIL_HOUR : OVERNIGHT_DEPART_HOUR - DEPARTURE_BUFFER_HOURS;
    departureNote = `Overnight ${mode} home, leaving around ${clock12(OVERNIGHT_DEPART_HOUR)}.`;
  } else {
    const leaveAt = LATEST_HOME_HOUR - leg.hours;
    if (leaveAt >= DEPART_HOUR) {
      departureClose = leaveAt - DEPARTURE_BUFFER_HOURS;
      departureNote = `Leave around ${clock12(leaveAt)} to be home by ${clock12(LATEST_HOME_HOUR)} — about ${formatHours(leg.hours)} by ${mode}.`;
    } else {
      departureDay = totalDays - 1 - Math.ceil((DEPART_HOUR - leaveAt) / DAY_END);
      departureClose = 0;
      departureNote = `Start the ${formatHours(leg.hours)} ${mode} journey home.`;
    }
  }

  if (arrivalDay > departureDay) return { days: [], nights: 0, feasible: false };

  const days: DayWindow[] = [];
  for (let i = 0; i < totalDays; i++) {
    let window: DayWindow;
    if (i < arrivalDay) window = { kind: "travel", open: null, capacity: {}, notes: [`On the ${mode} to your destination.`] };
    else if (i > departureDay) window = { kind: "travel", open: null, capacity: {}, notes: [`On the ${mode} home.`] };
    else {
      const start = i === arrivalDay ? arrivalOpen : 0;
      const end = i === departureDay ? departureClose : DAY_END;
      const open: [number, number] | null = end > start ? [start, end] : null;
      const kind: DayPlan["kind"] =
        i === arrivalDay && i === departureDay ? "arrival-departure" : i === arrivalDay ? "arrival" : i === departureDay ? "departure" : "full";
      const notes = kind === "arrival-departure" ? [arrivalNote, departureNote] : kind === "arrival" ? [arrivalNote] : kind === "departure" ? [departureNote] : [];
      window = { kind, open, capacity: capacityFor(open), notes };
    }
    days.push(window);
  }

  const onGroundHours = days.reduce((sum, d) => sum + (d.open ? d.open[1] - d.open[0] : 0), 0);
  const feasible = onGroundHours >= MIN_ON_GROUND_HOURS && days.some((d) => Object.keys(d.capacity).length > 0);
  return { days, nights: Math.max(0, departureDay - arrivalDay), feasible };
}

/* ------------------------------------------------------------------ */
/* Activity selection                                                  */
/* ------------------------------------------------------------------ */

export interface ItineraryOptions {
  /** Prefer free activities and skip expensive ones. */
  frugalActivities: boolean;
  /** Use autos/shared transport locally. */
  sharedLocalTransport: boolean;
  /** Activity IDs to keep where possible (targeted replanning). */
  preferredActivityIds?: string[];
}

const FRUGAL_MAX_FEE = 500;

function interestWeights(interests: Interest[]): Map<Interest, number> {
  return new Map(interests.map((interest, index) => [interest, 10 * Math.max(0.6, 1 - index * 0.1)]));
}

function scoreAttraction(
  attraction: Attraction,
  weights: Map<Interest, number>,
  coverage: Map<Interest, number>,
  assignedCount: number,
  previous: Point,
  options: ItineraryOptions,
): number {
  let interestScore = 0;
  let primary: Interest | null = null;
  for (const interest of attraction.interests) {
    const weight = weights.get(interest) ?? 0;
    if (weight > interestScore) primary = interest;
    interestScore += weight;
  }
  if (interestScore === 0) interestScore = 1;

  let score = interestScore;
  if (primary) {
    const share = (coverage.get(primary) ?? 0) / (assignedCount + 1);
    score += 6 * (1 - share);
  }
  score += options.frugalActivities ? (attraction.feePerPerson === 0 ? 4 : -attraction.feePerPerson / 150) : -attraction.feePerPerson / 1_000;
  score -= 0.25 * haversineKm(previous, attraction);
  if (options.preferredActivityIds?.includes(attraction.id)) score += 8;
  return score;
}

function formatClock(hour: number): string {
  const h = Math.floor(hour);
  const m = Math.round((hour - h) * 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function travelMinutes(from: Point, to: Point): number {
  const km = haversineKm(from, to) * LOCAL_TRAVEL.windiness;
  if (km < 0.3) return 0;
  return roundTo((km / LOCAL_TRAVEL.cityKmh) * 60 + LOCAL_TRAVEL.stopOverheadMinutes, 5);
}

/* ------------------------------------------------------------------ */
/* Builder                                                             */
/* ------------------------------------------------------------------ */

export interface ItineraryInput {
  constraints: TripConstraints;
  place: DestinationPlace;
  guide: DestinationGuide;
  windows: TravelWindows;
  stay: StayPlan;
  foodTier: StayPlan["tier"];
  options: ItineraryOptions;
}

export interface ItineraryResult {
  days: DayPlan[];
  foodInr: number;
  activitiesInr: number;
  localTravelInr: number;
}

export function buildItinerary({ constraints, place, guide, windows, stay, foodTier, options }: ItineraryInput): ItineraryResult {
  const rules = PACE_RULES[constraints.pace];
  const weights = interestWeights(constraints.interests);
  const coverage = new Map<Interest, number>();
  const used = new Set<string>();
  const vehicles = Math.ceil(constraints.travelers / LAST_MILE.seatsPerVehicle);
  const stayPoint: Point = { lat: place.lat, lng: place.lng };
  const foodPerPersonPerDay = roundTo(FOOD_PER_PERSON_PER_DAY[foodTier] * guide.costIndex, 10);
  let assigned = 0;
  let foodInr = 0;
  let activitiesInr = 0;
  let localTravelInr = 0;

  const days: DayPlan[] = windows.days.map((window, index) => {
    const date = addDays(constraints.startDate, index);
    const month = monthIndex(date);
    const activities: PlannedActivity[] = [];
    const notes = [...window.notes];
    let previous = stayPoint;
    let dayKm = 0;
    const takenSlots = new Set<Slot>();
    const openFrom = window.open?.[0] ?? 0;
    const openUntil = window.open?.[1] ?? 0;
    let offTopic = 0;
    let onTopic = 0;

    /** An activity must finish before the next part of the day begins. */
    const slotDeadline = (slot: Slot): number =>
      slot === "morning" ? rules.startHour.afternoon : slot === "afternoon" ? rules.startHour.evening + SLOT_OVERRUN_HOURS : SLOT_HOURS.evening[1] + SLOT_OVERRUN_HOURS;

    for (const slot of SLOTS) {
      const slotCapacity = window.capacity[slot];
      if (!slotCapacity || takenSlots.has(slot)) continue;
      let hoursLeft = slotCapacity;
      let clock = Math.max(rules.startHour[slot], openFrom);
      let inSlot = 0;

      while (activities.length < rules.maxPerDay && inSlot < rules.maxPerSlot) {
        const nextSlot = SLOTS[SLOTS.indexOf(slot) + 1];
        const canTakeFullDay = slot === "morning" && slotCapacity >= 4 && Boolean(nextSlot && window.capacity[nextSlot]) && activities.length === 0;
        const candidates = guide.attractions.filter((a) => {
          if (used.has(a.id)) return false;
          if (a.months && !a.months.includes(month)) return false;
          if (a.slot !== "any" && a.slot !== slot) return false;
          if (options.frugalActivities && a.feePerPerson > FRUGAL_MAX_FEE) return false;
          if (!a.interests.some((i) => weights.has(i)) && (offTopic >= rules.maxOffTopicPerDay || offTopic >= onTopic)) return false;
          const arriveAt = clock + travelMinutes(previous, a) / 60;
          if (a.hours >= FULL_DAY_HOURS) {
            return canTakeFullDay && inSlot === 0 && arriveAt + a.hours <= Math.min(slotDeadline("afternoon"), openUntil);
          }
          const slotEnd = Math.min(slotDeadline(slot), openUntil);
          return a.hours <= hoursLeft && (/sunrise/i.test(a.name) || arriveAt + a.hours <= slotEnd);
        });
        if (candidates.length === 0) break;

        const best = candidates
          .map((a) => ({ a, score: scoreAttraction(a, weights, coverage, assigned, previous, options) }))
          .sort((x, y) => y.score - x.score)[0].a;

        const minutes = travelMinutes(previous, best);
        const isSunrise = /sunrise/i.test(best.name) && slot === "morning" && inSlot === 0 && openFrom <= SUNRISE_START_HOUR;
        const start = isSunrise ? SUNRISE_START_HOUR : clock + minutes / 60;

        activities.push({
          id: best.id,
          name: best.name,
          slot,
          startTime: formatClock(start),
          durationHours: best.hours,
          interests: best.interests,
          costInr: best.feePerPerson * constraints.travelers,
          travelMinutes: minutes,
          description: best.blurb,
          lat: best.lat,
          lng: best.lng,
          sourceIds: [`guide:${place.id}`, ...(best.wikiTitle ? [`wiki:${best.wikiTitle}`] : []), ...(best.feePerPerson > 0 ? ["estimate:fees"] : [])],
        });

        used.add(best.id);
        if (best.interests.some((i) => weights.has(i))) onTopic += 1;
        else offTopic += 1;
        assigned += 1;
        inSlot += 1;
        for (const interest of best.interests) coverage.set(interest, (coverage.get(interest) ?? 0) + 1);
        dayKm += haversineKm(previous, best) * LOCAL_TRAVEL.windiness;
        previous = best;
        clock = start + best.hours;
        hoursLeft -= best.hours + minutes / 60;

        if (best.hours >= FULL_DAY_HOURS && nextSlot) {
          takenSlots.add(nextSlot);
          break;
        }
      }
    }

    dayKm += haversineKm(previous, stayPoint) * LOCAL_TRAVEL.windiness;

    if (constraints.pace === "relaxed" && window.kind === "full" && !activities.some((a) => a.slot === "afternoon")) {
      notes.push("Unhurried afternoon — long lunch, a nap or a café. Nothing booked.");
    }
    if (activities.length === 0 && window.kind === "full") {
      notes.push("Free day — we've run out of new things that match your interests here.");
    }

    // Food: two suggestions per day (three for food lovers), rotated so days differ.
    const pickCount = constraints.interests.includes("food") ? 3 : 2;
    const food: FoodPick[] = window.kind === "travel" ? [] : Array.from({ length: Math.min(pickCount, guide.food.length) }, (_, k) => {
      const spot = guide.food[(index * pickCount + k) % guide.food.length];
      return { name: spot.name, description: spot.description, costPerPersonInr: spot.costPerPerson };
    });

    const dayFood = window.kind === "travel" ? roundTo(foodPerPersonPerDay * 0.5, 10) * constraints.travelers : foodPerPersonPerDay * constraints.travelers;
    const dayActivities = activities.reduce((sum, a) => sum + a.costInr, 0);
    const localFactor = (options.sharedLocalTransport ? LOCAL_TRAVEL.sharedFactor : 1) * guide.costIndex;
    const dayLocal =
      activities.length === 0 && window.kind === "travel"
        ? 0
        : roundTo((LOCAL_TRAVEL.dailyBasePerVehicle + dayKm * LOCAL_TRAVEL.perKmPerVehicle) * vehicles * localFactor, 10);
    const hasNight = window.kind === "arrival" || window.kind === "full";
    const dayStay = hasNight && stay.nights > 0 ? stay.nightlyRateInr * stay.rooms : 0;

    foodInr += dayFood;
    activitiesInr += dayActivities;
    localTravelInr += dayLocal;

    const travelTotal = activities.reduce((sum, a) => sum + a.travelMinutes, 0) + (activities.length > 0 ? travelMinutes(previous, stayPoint) : 0);

    return {
      day: index + 1,
      date,
      title: dayTitle(window.kind, activities),
      kind: window.kind,
      activities,
      food,
      stayName: hasNight && stay.nights > 0 ? `${stay.name}, ${stay.area}` : null,
      spendInr: dayFood + dayActivities + dayLocal + dayStay,
      travelMinutes: travelTotal,
      notes,
    };
  });

  return { days, foodInr, activitiesInr, localTravelInr };
}

function dayTitle(kind: DayPlan["kind"], activities: PlannedActivity[]): string {
  const headline = activities.find((a) => a.durationHours >= 1.5) ?? activities[0];
  switch (kind) {
    case "travel":
      return "Travel day";
    case "arrival":
      return headline ? `Arrive · ${headline.name}` : "Arrive and settle in";
    case "departure":
      return headline ? `${headline.name} · head home` : "Head home";
    case "arrival-departure":
      return headline ? `Day trip · ${headline.name}` : "Day trip";
    default:
      return headline?.name ?? "Free day";
  }
}
