import { z } from "zod";
import { DESTINATIONS, ORIGINS } from "@/lib/data/places";
import { isValidIsoDate } from "./dates";
import { LIMITS } from "./limits";
import { INTERESTS, PACES, STAY_TIERS, TRANSPORT_MODES } from "./types";

const originIds = ORIGINS.map((o) => o.id) as [string, ...string[]];
const destinationIds = DESTINATIONS.map((d) => d.id) as [string, ...string[]];

/** Validates constraints arriving from the client. Nothing from the browser is trusted. */
export const tripConstraintsSchema = z
  .object({
    originId: z.enum(originIds),
    destinationId: z.enum(destinationIds).nullable(),
    travelers: z.number().int().min(LIMITS.minTravelers).max(LIMITS.maxTravelers),
    days: z.number().int().min(LIMITS.minDays).max(LIMITS.maxDays),
    budgetInr: z.number().int().min(LIMITS.minBudgetInr).max(LIMITS.maxBudgetInr),
    interests: z.array(z.enum(INTERESTS)).min(1).max(INTERESTS.length),
    pace: z.enum(PACES),
    startDate: z.string().refine(isValidIsoDate, "Invalid date"),
  })
  .strict();

export const parseRequestSchema = z
  .object({
    text: z.string().max(LIMITS.requestMaxChars * 2),
  })
  .strict();

const shortText = z.string().max(200);

/** A previous plan summary sent back by the client for replanning — validated like any other input. */
export const planSnapshotSchema = z
  .object({
    constraints: tripConstraintsSchema,
    destinationId: z.enum(destinationIds),
    destinationName: shortText,
    transportMode: z.enum(TRANSPORT_MODES),
    transportHours: z.number().min(0).max(72),
    transportTotalInr: z.number().int().min(0).max(LIMITS.maxBudgetInr * 2),
    stayTier: z.enum(STAY_TIERS),
    stayLabel: shortText,
    budgetTotalInr: z.number().int().min(0).max(LIMITS.maxBudgetInr * 2),
    activityIds: z.array(z.string().regex(/^[a-z]{3}-[a-z0-9-]{2,40}$/)).max(120),
    activityNames: z.array(shortText).max(120),
  })
  .strict()
  .refine((s) => s.activityIds.length === s.activityNames.length, "Activity lists must match");

export const planRequestSchema = z
  .object({
    constraints: tripConstraintsSchema,
    previous: planSnapshotSchema.optional(),
  })
  .strict();
