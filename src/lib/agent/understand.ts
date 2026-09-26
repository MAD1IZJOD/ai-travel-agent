/**
 * Request understanding: rules first, then (optionally) Claude to fill gaps.
 *
 * The rule-based parser is authoritative for anything it found. The LLM can
 * only add values for fields the rules missed, and those are marked
 * "inferred" so the traveller can see and correct them.
 */
import { DESTINATIONS, ORIGINS } from "@/lib/data/places";
import { toIsoDate } from "./dates";
import type { LlmExtractor, LlmFields } from "./llmExtractor";
import { extractFields, finalizeConstraints, type ExtractedFields, type ParseOptions } from "./parser";
import type { ParsedRequest } from "./types";

export interface UnderstandOptions extends ParseOptions {
  llmExtract?: LlmExtractor;
}

function matchByAlias<T extends { id: string; aliases: string[] }>(value: string | null, places: T[]): T | undefined {
  if (!value) return undefined;
  const lower = value.toLowerCase().trim();
  return places.find((p) => p.aliases.some((alias) => lower === alias || lower.includes(alias)));
}

function hasGaps(fields: ExtractedFields): boolean {
  return !fields.originId || !fields.days || !fields.budgetInr || !fields.travelers || !fields.interests || !fields.pace;
}

export function mergeLlmFields(rules: ExtractedFields, llm: LlmFields): ExtractedFields {
  const merged: ExtractedFields = { ...rules, issues: [...rules.issues] };

  if (!merged.originId && !merged.unknownOrigin && llm.origin_city) {
    const origin = matchByAlias(llm.origin_city, ORIGINS);
    if (origin) merged.originId = { value: origin.id, origin: "inferred" };
  }
  if (!merged.destinationId && !merged.unknownDestination && llm.destination) {
    const destination = matchByAlias(llm.destination, DESTINATIONS);
    if (destination) merged.destinationId = { value: destination.id, origin: "inferred" };
    else merged.unknownDestination = llm.destination.slice(0, 60);
  }
  if (!merged.travelers && llm.travelers !== null) merged.travelers = { value: llm.travelers, origin: "inferred" };
  if (!merged.days && llm.days !== null) merged.days = { value: llm.days, origin: "inferred" };
  if (!merged.budgetInr && llm.budget_inr !== null) {
    merged.budgetInr = { value: llm.budget_inr, origin: "inferred" };
    merged.budgetPerPerson = llm.budget_is_per_person;
  }
  if (!merged.interests && llm.interests.length > 0) {
    const allowed = llm.interests.filter((i) => !merged.excludedInterests?.includes(i));
    if (allowed.length > 0) merged.interests = { value: [...new Set(allowed)], origin: "inferred" };
  }
  if (!merged.pace && llm.pace) merged.pace = { value: llm.pace, origin: "inferred" };
  if (!merged.startDate && llm.start_date) merged.startDate = { value: llm.start_date, origin: "inferred" };

  return merged;
}

export async function understandRequest(rawText: string, options: UnderstandOptions = {}): Promise<ParsedRequest> {
  const today = options.today ?? toIsoDate(new Date());
  const rules = extractFields(rawText, { today });
  let fields: ExtractedFields = rules;
  let extractor: ParsedRequest["extractor"] = "rules";

  if (options.llmExtract && rules.cleanText.length > 0 && hasGaps(rules)) {
    const llm = await options.llmExtract(rules.cleanText, today);
    if (llm) {
      fields = mergeLlmFields(rules, llm);
      extractor = "rules+llm";
    }
  }

  return { ...finalizeConstraints(fields, rules.cleanText, { today }), extractor };
}
