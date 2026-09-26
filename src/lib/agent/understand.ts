/**
 * Request understanding: rules first, then (optionally) a language model —
 * Claude or a local model via Ollama — to fill gaps.
 *
 * The rule-based parser is authoritative for anything it found. The LLM can
 * only add values for fields the rules missed, and those are marked
 * "inferred" so the traveller can see and correct them.
 */
import { DESTINATIONS, ORIGINS } from "@/lib/data/places";
import { toIsoDate } from "./dates";
import type { LlmAssistant, LlmFields } from "./llm/fields";
import { extractFields, finalizeConstraints, type ExtractedFields, type ParseOptions } from "./parser";
import type { Interest, ParsedRequest } from "./types";

export interface UnderstandOptions extends ParseOptions {
  llm?: LlmAssistant | null;
}

function matchByAlias<T extends { id: string; aliases: string[] }>(value: string | null, places: T[]): T | undefined {
  if (!value) return undefined;
  const lower = value.toLowerCase().trim();
  return places.find((p) => p.aliases.some((alias) => lower === alias || lower.includes(alias)));
}

function hasGaps(fields: ExtractedFields): boolean {
  return !fields.originId || !fields.days || !fields.budgetInr || !fields.travelers || !fields.interests || !fields.pace;
}

/** Terrain words a model may return as a "destination" — they describe interests, not places. */
const GENERIC_PLACES: { pattern: RegExp; interest: Interest | null }[] = [
  { pattern: /^(the\s+)?(hills?|mountains?|himalayas?|valleys?|forests?|countryside|nature)$/i, interest: "nature" },
  { pattern: /^(the\s+)?(beach(es)?|sea(side)?|coast|islands?)$/i, interest: "beach" },
  { pattern: /^(somewhere|anywhere|any ?place|north|south|east|west)\b.*$/i, interest: null },
];

/**
 * Small models sometimes fill every field whether or not the traveller said
 * anything about it. A model value is only accepted when the text contains
 * some evidence for that field.
 */
const EVIDENCE = {
  travelers: /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b|\b(people|persons?|pax|friends?|family|couple|wife|husband|partner|missus|girlfriend|boyfriend|solo|alone|myself|kids?|children|group|us|we)\b/i,
  days: /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|a|few|couple)\s*(-|\s)?(days?|nights?|weeks?|weekend|fortnight)\b|\b(week|weekend|fortnight)\b/i,
  budget: /(₹|\brs\.?|\binr\b|rupees?|\d+\s*(k|l|lakhs?|lacs?|thousand)\b|budget|\b\d{4,}\b)/i,
  pace: /\b(relax\w*|slow|easy|chill\w*|leisure\w*|lazy|calm|unhurried|hectic|busy|packed|rush\w*|pace|intense|balanced|moderate)\b/i,
};

/** Only trust a model's date if the traveller actually mentioned when. */
const DATE_CUE =/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b|\b\d{1,2}(st|nd|rd|th)\b|\d{4}-\d{2}-\d{2}|\b(tomorrow|next week|next month|this weekend|diwali|holi|christmas|new year)\b/i;

export function mergeLlmFields(rules: ExtractedFields, llm: LlmFields, text = ""): ExtractedFields {
  const merged: ExtractedFields = { ...rules, issues: [...rules.issues] };
  const extraInterests: Interest[] = [];

  if (!merged.originId && !merged.unknownOrigin && llm.origin_city) {
    const origin = matchByAlias(llm.origin_city, ORIGINS);
    if (origin) merged.originId = { value: origin.id, origin: "inferred" };
  }
  if (!merged.destinationId && !merged.unknownDestination && llm.destination) {
    const generic = GENERIC_PLACES.find((g) => g.pattern.test(llm.destination!.trim()));
    const destination = matchByAlias(llm.destination, DESTINATIONS);
    if (generic) {
      if (generic.interest) extraInterests.push(generic.interest);
    } else if (destination) merged.destinationId = { value: destination.id, origin: "inferred" };
    else merged.unknownDestination = llm.destination.slice(0, 60);
  }
  if (!merged.travelers && llm.travelers !== null && EVIDENCE.travelers.test(text)) merged.travelers = { value: llm.travelers, origin: "inferred" };
  if (!merged.days && llm.days !== null && EVIDENCE.days.test(text)) merged.days = { value: llm.days, origin: "inferred" };
  // A zero or negative model budget means "not found", not an invalid budget the traveller gave.
  if (!merged.budgetInr && llm.budget_inr !== null && llm.budget_inr > 0 && EVIDENCE.budget.test(text)) {
    merged.budgetInr = { value: llm.budget_inr, origin: "inferred" };
    merged.budgetPerPerson = llm.budget_is_per_person;
  }
  // Interests the rules missed are added after the ones the traveller stated.
  const modelInterests = [...llm.interests, ...extraInterests].filter((i) => !merged.excludedInterests?.includes(i));
  const known = merged.interests?.value ?? [];
  const added = [...new Set(modelInterests)].filter((i) => !known.includes(i));
  if (added.length > 0) merged.interests = { value: [...known, ...added], origin: merged.interests?.origin ?? "inferred" };

  if (!merged.pace && llm.pace && EVIDENCE.pace.test(text)) merged.pace = { value: llm.pace, origin: "inferred" };
  if (!merged.startDate && llm.start_date && DATE_CUE.test(text)) merged.startDate = { value: llm.start_date, origin: "inferred" };

  return merged;
}

export async function understandRequest(rawText: string, options: UnderstandOptions = {}): Promise<ParsedRequest> {
  const today = options.today ?? toIsoDate(new Date());
  const rules = extractFields(rawText, { today });
  let fields: ExtractedFields = rules;
  let extractor: ParsedRequest["extractor"] = "rules";
  let assistedBy: string | undefined;

  if (options.llm && rules.cleanText.length > 0 && hasGaps(rules)) {
    const llm = await options.llm.extract(rules.cleanText, today);
    if (llm) {
      fields = mergeLlmFields(rules, llm, rules.cleanText);
      extractor = "rules+llm";
      assistedBy = options.llm.label;
    }
  }

  return { ...finalizeConstraints(fields, rules.cleanText, { today }), extractor, ...(assistedBy ? { assistedBy } : {}) };
}
