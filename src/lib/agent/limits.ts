/** Input limits shared by the parser, API validation and UI controls. */
export const LIMITS = {
  requestMaxChars: 600,
  minDays: 1,
  maxDays: 21,
  minTravelers: 1,
  maxTravelers: 10,
  minBudgetInr: 1_000,
  maxBudgetInr: 5_000_000,
  /** How far ahead a trip can start. */
  maxLeadDays: 365,
  /** Default lead time when the traveller gives no dates. */
  defaultLeadDays: 21,
} as const;

export const DEFAULTS = {
  originId: "delhi",
  travelers: 2,
  days: 5,
  /** Per person per day, used only when no budget is given. */
  budgetPerPersonPerDayInr: 4_000,
  pace: "balanced",
} as const;
