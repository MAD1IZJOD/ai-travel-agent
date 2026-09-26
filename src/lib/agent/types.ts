/**
 * Core domain model for the travel agent.
 *
 * Everything the agent reasons about is expressed with these types, so the
 * parser, planner, validator, replanner and UI all share one vocabulary.
 */

export const INTERESTS = [
  "nature",
  "food",
  "history",
  "culture",
  "adventure",
  "beach",
  "spiritual",
  "nightlife",
  "wellness",
] as const;
export type Interest = (typeof INTERESTS)[number];

export const PACES = ["relaxed", "balanced", "packed"] as const;
export type Pace = (typeof PACES)[number];

export const STAY_TIERS = ["budget", "mid", "comfort"] as const;
export type StayTier = (typeof STAY_TIERS)[number];

export const TRANSPORT_MODES = ["bus", "train", "flight"] as const;
export type TransportMode = (typeof TRANSPORT_MODES)[number];

/** How a constraint value was obtained — shown to the user so assumptions are never hidden. */
export type ValueOrigin = "stated" | "inferred" | "default";

export interface TripConstraints {
  originId: string;
  /** Set when the traveller named a destination; otherwise the agent chooses. */
  destinationId: string | null;
  travelers: number;
  days: number;
  /** Total trip budget in INR for the whole group. */
  budgetInr: number;
  interests: Interest[];
  pace: Pace;
  /** ISO date (YYYY-MM-DD). */
  startDate: string;
}

export type ConstraintField = keyof TripConstraints;

export type ConstraintOrigins = Record<ConstraintField, ValueOrigin>;

export type IssueSeverity = "blocking" | "warning" | "info";

export interface ParseIssue {
  code: string;
  severity: IssueSeverity;
  message: string;
  field?: ConstraintField;
}

export interface ParsedRequest {
  constraints: TripConstraints;
  origins: ConstraintOrigins;
  issues: ParseIssue[];
  /** Which extractor produced the constraints. */
  extractor: "rules" | "rules+llm";
}

/* ------------------------------------------------------------------ */
/* Grounding                                                           */
/* ------------------------------------------------------------------ */

/**
 * verified   – fetched live from a named external source during this run.
 * reference  – from our curated dataset, which cites a public reference.
 * estimated  – computed by our cost/time model; not a quote.
 * suggestion – a planning choice made by the agent.
 */
export type Verification = "verified" | "reference" | "estimated" | "suggestion";

export interface SourceRef {
  id: string;
  label: string;
  url?: string;
  kind: Verification;
  retrievedAt?: string;
  note?: string;
}

/* ------------------------------------------------------------------ */
/* Plan                                                                */
/* ------------------------------------------------------------------ */

export type Slot = "morning" | "afternoon" | "evening";

export interface PlannedActivity {
  id: string;
  name: string;
  slot: Slot;
  startTime: string;
  durationHours: number;
  interests: Interest[];
  costInr: number;
  /** Minutes from the previous stop (or the stay for the first stop). */
  travelMinutes: number;
  description: string;
  sourceIds: string[];
}

export interface FoodPick {
  name: string;
  description: string;
  costPerPersonInr: number;
}

export interface DayPlan {
  day: number;
  date: string;
  title: string;
  kind: "arrival" | "full" | "departure" | "arrival-departure" | "travel";
  activities: PlannedActivity[];
  food: FoodPick[];
  stayName: string | null;
  spendInr: number;
  travelMinutes: number;
  notes: string[];
}

export interface TransportLeg {
  mode: TransportMode;
  from: string;
  to: string;
  hours: number;
  costPerPersonInr: number;
  overnight: boolean;
  lastMile: string;
}

export interface TransportPlan {
  outbound: TransportLeg;
  inbound: TransportLeg;
  totalInr: number;
  rationale: string;
}

export interface StayPlan {
  tier: StayTier;
  name: string;
  area: string;
  nightlyRateInr: number;
  rooms: number;
  nights: number;
  totalInr: number;
}

export interface BudgetBreakdown {
  transport: number;
  stay: number;
  food: number;
  activities: number;
  localTravel: number;
  buffer: number;
  total: number;
  budget: number;
  remaining: number;
}

export type CheckStatus = "pass" | "warn" | "fail";

export interface ConstraintCheck {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
  hard: boolean;
}

export interface PlanRevision {
  step: string;
  reason: string;
  savedInr?: number;
}

export interface WeatherSummary {
  basis: "forecast" | "last-year";
  avgHighC: number;
  avgLowC: number;
  wetDays: number;
  days: number;
  sourceId: string;
  note: string;
}

export interface DestinationSummary {
  id: string;
  name: string;
  region: string;
  tagline: string;
  description: string;
  imageUrl: string | null;
  lat: number;
  lng: number;
  matchedInterests: Interest[];
  whyChosen: string[];
  alternativesConsidered: { name: string; reason: string }[];
}

export interface Adjustment {
  id: string;
  label: string;
  description: string;
  patch: Partial<TripConstraints>;
  estimatedTotalInr: number;
}

export type PlanStatus = "ok" | "revised" | "needs-approval";

/** A real external lookup made while planning — shown to the user as-is. */
export interface ToolCallRecord {
  tool: "wikipedia" | "weather";
  target: string;
  status: "ok" | "failed" | "skipped" | "filtered";
  detail: string;
  durationMs: number;
}

export interface TripPlan {
  status: PlanStatus;
  constraints: TripConstraints;
  destination: DestinationSummary;
  transport: TransportPlan;
  stay: StayPlan;
  days: DayPlan[];
  budget: BudgetBreakdown;
  checks: ConstraintCheck[];
  revisions: PlanRevision[];
  /** Offered when a hard constraint cannot be met without the traveller's approval. */
  adjustments: Adjustment[];
  weather: WeatherSummary | null;
  sources: SourceRef[];
  research: ToolCallRecord[];
  highlights: string[];
  notices: string[];
  generatedAt: string;
}

/* ------------------------------------------------------------------ */
/* Replanning                                                          */
/* ------------------------------------------------------------------ */

export interface PlanChange {
  area: "destination" | "transport" | "stay" | "itinerary" | "budget" | "food";
  before: string;
  after: string;
  why: string;
}

export interface PlanDiff {
  changedConstraints: { field: ConstraintField; before: string; after: string }[];
  changes: PlanChange[];
  preserved: string[];
  summary: string;
}

/* ------------------------------------------------------------------ */
/* Agent run trace (real stages, streamed to the UI)                   */
/* ------------------------------------------------------------------ */

export const AGENT_STAGES = [
  "understand",
  "research",
  "plan",
  "validate",
  "finalize",
] as const;
export type AgentStage = (typeof AGENT_STAGES)[number];

export interface StageEvent {
  type: "stage";
  stage: AgentStage;
  status: "running" | "done" | "warning";
  detail: string;
}

export interface ResultEvent {
  type: "result";
  plan: TripPlan;
  diff: PlanDiff | null;
}

export interface ErrorEvent {
  type: "error";
  message: string;
}

export type AgentEvent = StageEvent | ResultEvent | ErrorEvent;
