import type { Interest, Pace, StayTier, TransportMode } from "@/lib/agent/types";

const inrFormatter = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

export function formatInr(amount: number): string {
  return `₹${inrFormatter.format(Math.round(amount))}`;
}

/** ₹50K / ₹1.2L style used in compact places. */
export function formatInrShort(amount: number): string {
  if (amount >= 100_000) return `₹${(amount / 100_000).toFixed(amount % 100_000 === 0 ? 0 : 1)}L`;
  if (amount >= 1_000) return `₹${(amount / 1_000).toFixed(amount % 1_000 === 0 ? 0 : 1)}K`;
  return formatInr(amount);
}

export function formatHours(hours: number): string {
  const whole = Math.floor(hours);
  const minutes = Math.round((hours - whole) * 60);
  if (whole === 0) return `${minutes} min`;
  return minutes === 0 ? `${whole} hr` : `${whole} hr ${minutes} min`;
}

export function formatMinutes(minutes: number): string {
  return minutes < 60 ? `${minutes} min` : formatHours(minutes / 60);
}

export const INTEREST_LABELS: Record<Interest, string> = {
  nature: "Nature",
  food: "Food",
  history: "History",
  culture: "Culture",
  adventure: "Adventure",
  beach: "Beaches",
  spiritual: "Spiritual",
  nightlife: "Nightlife",
  wellness: "Wellness",
};

export const PACE_LABELS: Record<Pace, { label: string; hint: string }> = {
  relaxed: { label: "Relaxed", hint: "2 things a day, long lunches" },
  balanced: { label: "Balanced", hint: "3 things a day" },
  packed: { label: "Packed", hint: "4+ things a day" },
};

export const STAY_LABELS: Record<StayTier, string> = {
  budget: "Budget",
  mid: "Mid-range",
  comfort: "Comfort",
};

export const MODE_LABELS: Record<TransportMode, string> = {
  bus: "Bus",
  train: "Train",
  flight: "Flight",
};

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
