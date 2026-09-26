/**
 * Long-distance transport between the origin city and the destination.
 * Fares and durations come from the documented model in pricing.ts.
 */
import type { Origin, DestinationPlace } from "@/lib/data/places";
import type { DestinationGuide } from "@/lib/data/guides";
import { formatHours, formatInr, MODE_LABELS } from "@/lib/format";
import { haversineKm, roundTo } from "./geo";
import { LAST_MILE, TRANSPORT_MODEL, VALUE_OF_TIME_PER_HOUR } from "./pricing";
import type { Pace, StayTier, TransportLeg, TransportMode, TransportPlan } from "./types";

export interface TransportOption {
  mode: TransportMode;
  gateway: string;
  /** Door-to-door hours, one way. */
  hours: number;
  farePerPerson: number;
  lastMileKm: number;
  lastMileGroupCost: number;
  overnight: boolean;
  lastMile: string;
  /** Round trip for the whole group. */
  roundTripInr: number;
}

export type TransportStrategy = "balanced" | "cheapest";

function lastMileCost(km: number, travelers: number, shared: boolean): number {
  if (km <= 0) return 0;
  if (shared) return roundTo(km * LAST_MILE.sharedPerKmPerPerson * travelers, 10);
  const vehicles = Math.ceil(travelers / LAST_MILE.seatsPerVehicle);
  return roundTo(km * LAST_MILE.taxiPerKmPerVehicle * vehicles, 10);
}

function describeLastMile(gateway: string, km: number, shared: boolean): string {
  if (km <= 5) return `Short auto or cab ride from ${gateway}`;
  return `${shared ? "Shared jeep or bus" : "Pre-booked cab"} from ${gateway} (~${Math.round(km)} km)`;
}

export function transportOptions(
  origin: Origin,
  destination: DestinationPlace,
  guide: DestinationGuide,
  travelers: number,
  sharedLastMile: boolean,
): TransportOption[] {
  const straightKm = haversineKm(origin, destination);
  const options: TransportOption[] = [];
  const build = (mode: TransportMode, gateway: string, mainHours: number, fare: number, lastKm: number): TransportOption => {
    const hours = mainHours + lastKm / LAST_MILE.kmh;
    const groupLastMile = lastMileCost(lastKm, travelers, sharedLastMile);
    return {
      mode,
      gateway,
      hours: Math.round(hours * 4) / 4,
      farePerPerson: roundTo(fare, 10),
      lastMileKm: lastKm,
      lastMileGroupCost: groupLastMile,
      overnight: mode !== "flight" && hours >= TRANSPORT_MODEL.overnightMinHours && hours <= TRANSPORT_MODEL.overnightMaxHours,
      lastMile: lastKm > 0 ? describeLastMile(gateway, lastKm, sharedLastMile) : "Drops you in town",
      roundTripInr: 2 * (roundTo(fare, 10) * travelers + groupLastMile),
    };
  };

  const roadKm = straightKm * (guide.roadFactor || TRANSPORT_MODEL.defaultRoadFactor);
  if (roadKm <= TRANSPORT_MODEL.bus.maxRoadKm) {
    const fare = Math.max(TRANSPORT_MODEL.bus.minFare, roadKm * TRANSPORT_MODEL.bus.perKmPerPerson);
    options.push(build("bus", `${destination.name} bus stand`, roadKm / TRANSPORT_MODEL.bus.kmh, fare, 0));
  }

  if (destination.railhead && straightKm >= TRANSPORT_MODEL.train.minStraightKm) {
    const railKm = straightKm * TRANSPORT_MODEL.train.routeFactor;
    const fare = Math.max(TRANSPORT_MODEL.train.minFare, railKm * TRANSPORT_MODEL.train.perKmPerPerson);
    options.push(build("train", destination.railhead.name, railKm / TRANSPORT_MODEL.train.kmh, fare, destination.railhead.km));
  }

  if (destination.airport && straightKm >= TRANSPORT_MODEL.flight.minStraightKm) {
    const fare = TRANSPORT_MODEL.flight.baseFare + straightKm * TRANSPORT_MODEL.flight.perKm;
    const mainHours = straightKm / TRANSPORT_MODEL.flight.cruiseKmh + TRANSPORT_MODEL.flight.overheadHours;
    options.push(build("flight", destination.airport.name, mainHours, fare, destination.airport.km));
  }

  return options.filter((o) => o.hours <= TRANSPORT_MODEL.maxLegHours);
}

function balancedScore(option: TransportOption, tier: StayTier, travelers: number, pace: Pace): number {
  const valueOfTime = VALUE_OF_TIME_PER_HOUR[tier] * (pace === "relaxed" ? 1.3 : 1);
  let timeCost = 2 * option.hours * valueOfTime * travelers;
  // Daytime legs longer than an overnight journey eat whole holiday days.
  if (option.hours > TRANSPORT_MODEL.overnightMaxHours) timeCost *= 2;
  // Overnight legs keep the days free, which is worth something.
  if (option.overnight) timeCost *= 0.7;
  return option.roundTripInr + timeCost;
}

export function chooseTransport(
  options: TransportOption[],
  strategy: TransportStrategy,
  tier: StayTier,
  travelers: number,
  pace: Pace,
): TransportOption | null {
  if (options.length === 0) return null;
  const ranked = [...options].sort((a, b) =>
    strategy === "cheapest"
      ? a.roundTripInr - b.roundTripInr || a.hours - b.hours
      : balancedScore(a, tier, travelers, pace) - balancedScore(b, tier, travelers, pace),
  );
  return ranked[0];
}

function compareTo(chosen: TransportOption, alt: TransportOption): string {
  const hoursDiff = alt.hours - chosen.hours;
  const costDiff = alt.roundTripInr - chosen.roundTripInr;
  const time =
    Math.abs(hoursDiff) < 0.25 ? "takes about as long" : hoursDiff < 0 ? `is ${formatHours(-hoursDiff)} quicker each way` : `takes ${formatHours(hoursDiff)} longer each way`;
  const cost = Math.abs(costDiff) < 100 ? "costs about the same" : costDiff < 0 ? `costs ${formatInr(-costDiff)} less` : `costs ${formatInr(costDiff)} more`;
  const daytime = chosen.overnight && !alt.overnight ? ", but uses up daytime" : "";
  return `the ${MODE_LABELS[alt.mode].toLowerCase()} ${time} and ${cost}${daytime}`;
}

function explainChoice(chosen: TransportOption, options: TransportOption[], strategy: TransportStrategy): string {
  const label = `${chosen.overnight ? "An overnight " : "A "}${MODE_LABELS[chosen.mode].toLowerCase()} (about ${formatHours(chosen.hours)} door to door)`;
  const others = options.filter((o) => o !== chosen);
  const headline = strategy === "cheapest" ? `${label} is the cheapest way there` : `${label} is the best balance of cost and time`;
  if (others.length === 0) return `${label} is the only practical way there.`;
  return `${headline}; ${others.map((alt) => compareTo(chosen, alt)).join("; ")}.`;
}

export function toTransportPlan(
  chosen: TransportOption,
  options: TransportOption[],
  strategy: TransportStrategy,
  origin: Origin,
  destination: DestinationPlace,
  travelers: number,
): TransportPlan {
  const perPersonLastMile = Math.round(chosen.lastMileGroupCost / travelers);
  const leg = (from: string, to: string): TransportLeg => ({
    mode: chosen.mode,
    from,
    to,
    hours: chosen.hours,
    costPerPersonInr: chosen.farePerPerson + perPersonLastMile,
    overnight: chosen.overnight,
    lastMile: chosen.lastMile,
  });
  return {
    outbound: leg(origin.name, destination.name),
    inbound: leg(destination.name, origin.name),
    totalInr: chosen.roundTripInr,
    rationale: explainChoice(chosen, options, strategy),
  };
}
