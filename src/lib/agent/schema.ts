import { z } from "zod";
import { DESTINATIONS, ORIGINS } from "@/lib/data/places";
import { isValidIsoDate } from "./dates";
import { LIMITS } from "./limits";
import { INTERESTS, PACES } from "./types";

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
