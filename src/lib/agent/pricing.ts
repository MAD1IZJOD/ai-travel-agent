/**
 * Cost and time model.
 *
 * These are transparent planning assumptions, not live fares. They are rough
 * 2025 averages for India and every number derived from them is labelled
 * "estimated" in the UI.
 */
import type { StayTier } from "./types";

export const TRANSPORT_MODEL = {
  bus: {
    /** AC sleeper / Volvo fare per km per person. */
    perKmPerPerson: 1.8,
    minFare: 300,
    kmh: 45,
    /** Beyond this road distance we don't suggest a bus. */
    maxRoadKm: 1_100,
  },
  train: {
    /** 3AC fare per km per person. */
    perKmPerPerson: 1.5,
    minFare: 250,
    kmh: 55,
    /** Rail distance ÷ straight-line distance. */
    routeFactor: 1.25,
    minStraightKm: 150,
  },
  flight: {
    baseFare: 2_500,
    perKm: 4,
    cruiseKmh: 700,
    /** Check-in, security, boarding and baggage. */
    overheadHours: 2.5,
    minStraightKm: 350,
  },
  /** Road distance ÷ straight-line distance when a guide has no specific factor. */
  defaultRoadFactor: 1.35,
  /** Overnight departures are practical for legs in this range (hours). */
  overnightMinHours: 7,
  overnightMaxHours: 16,
  /** Legs longer than this are never offered. */
  maxLegHours: 36,
} as const;

export const LAST_MILE = {
  taxiPerKmPerVehicle: 18,
  sharedPerKmPerPerson: 3,
  kmh: 35,
  seatsPerVehicle: 4,
} as const;

/** How much an hour of travel time is "worth" per person when balancing cost and time. */
export const VALUE_OF_TIME_PER_HOUR: Record<StayTier, number> = {
  budget: 60,
  mid: 200,
  comfort: 450,
};

/** Food spend per person per day, before the destination cost index. */
export const FOOD_PER_PERSON_PER_DAY: Record<StayTier, number> = {
  budget: 600,
  mid: 1_100,
  comfort: 1_900,
};

export const LOCAL_TRAVEL = {
  perKmPerVehicle: 16,
  dailyBasePerVehicle: 250,
  /** Autos, shared jeeps and buses instead of private cabs. */
  sharedFactor: 0.55,
  cityKmh: 22,
  windiness: 1.4,
  stopOverheadMinutes: 10,
} as const;

export const GUESTS_PER_ROOM = 2;

/** Contingency added on top of the estimate, as a share of the subtotal. */
export const BUFFER_RATE = 0.07;

/** Budget per person per day (after transport) that suggests each stay tier. */
export const STAY_TIER_THRESHOLDS = {
  comfort: 6_500,
  mid: 3_000,
} as const;
