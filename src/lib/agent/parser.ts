/**
 * Rule-based request understanding.
 *
 * Turns free text into structured trip constraints plus a list of issues
 * (missing, ambiguous, contradictory or invalid information). It is
 * deterministic, fast and fully testable; the optional LLM extractor only
 * fills gaps this parser could not resolve.
 */
import { DESTINATIONS, ORIGINS } from "@/lib/data/places";
import { addDays, daysBetween, isValidIsoDate, toIsoDate } from "./dates";
import { DEFAULTS, LIMITS } from "./limits";
import { sanitizeUserText } from "./safety";
import {
  INTERESTS,
  type ConstraintField,
  type ConstraintOrigins,
  type Interest,
  type Pace,
  type ParseIssue,
  type ParsedRequest,
  type TripConstraints,
  type ValueOrigin,
} from "./types";

/* ------------------------------------------------------------------ */
/* Extraction result                                                   */
/* ------------------------------------------------------------------ */

interface Extracted<T> {
  value: T;
  origin: Exclude<ValueOrigin, "default">;
}

/** Raw findings before defaults and validation are applied. Also produced by the LLM extractor. */
export interface ExtractedFields {
  originId?: Extracted<string>;
  unknownOrigin?: string;
  destinationId?: Extracted<string>;
  unknownDestination?: string;
  travelers?: Extracted<number>;
  days?: Extracted<number>;
  budgetInr?: Extracted<number>;
  budgetPerPerson?: boolean;
  interests?: Extracted<Interest[]>;
  excludedInterests?: Interest[];
  pace?: Extracted<Pace>;
  startDate?: Extracted<string>;
  issues: ParseIssue[];
}

export interface ParseOptions {
  /** Injected for deterministic tests. */
  today?: string;
}

/* ------------------------------------------------------------------ */
/* Vocabulary                                                          */
/* ------------------------------------------------------------------ */

const WORD_NUMBERS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
  fifteen: 15, twenty: 20,
};
const NUMBER_WORD = `(?:${Object.keys(WORD_NUMBERS).join("|")})`;

const INTEREST_KEYWORDS: Record<Interest, string[]> = {
  nature: ["nature", "natural", "mountain", "mountains", "hill", "hills", "hill station", "trek", "trekking", "hike", "hiking", "forest", "forests", "waterfall", "waterfalls", "lake", "lakes", "wildlife", "greenery", "scenic", "scenery", "outdoors", "outdoor", "tea garden", "tea gardens", "valley", "valleys", "river"],
  food: ["food", "foodie", "cuisine", "cuisines", "eat", "eating", "street food", "restaurant", "restaurants", "culinary", "cafe", "cafes", "dishes", "dining", "biryani", "local flavours", "local flavors"],
  history: ["history", "historic", "historical", "heritage", "fort", "forts", "palace", "palaces", "monument", "monuments", "ruins", "museum", "museums", "architecture"],
  culture: ["culture", "cultural", "art", "arts", "market", "markets", "bazaar", "bazaars", "local life", "craft", "crafts", "shopping", "music", "festival", "festivals"],
  adventure: ["adventure", "adventurous", "rafting", "paragliding", "bungee", "camping", "skiing", "zipline", "zip line", "thrill", "thrilling", "kayaking", "scuba", "snorkelling", "snorkeling"],
  beach: ["beach", "beaches", "sea", "seaside", "coast", "coastal", "surf", "surfing", "ocean"],
  spiritual: ["spiritual", "spirituality", "temple", "temples", "yoga", "meditation", "pilgrimage", "ghat", "ghats", "ashram", "aarti", "gurudwara"],
  nightlife: ["nightlife", "party", "parties", "partying", "club", "clubs", "clubbing", "bar", "bars", "pub", "pubs"],
  wellness: ["wellness", "spa", "ayurveda", "ayurvedic", "detox", "rejuvenate", "rejuvenation", "retreat"],
};

const PACE_KEYWORDS: Record<Pace, string[]> = {
  relaxed: ["relaxed", "relaxing", "relax", "slow", "slow-paced", "easy", "easygoing", "easy-going", "laid-back", "laid back", "chill", "chilled", "leisurely", "unhurried", "not rushed", "no rush", "lazy"],
  balanced: ["balanced", "moderate", "moderately paced", "mix of"],
  packed: ["packed", "action-packed", "busy", "fast-paced", "fast paced", "intense", "see as much", "as much as possible", "maximum", "hectic", "jam-packed", "full on", "full-on"],
};

const NEGATIONS = ["no", "not", "don't", "dont", "avoid", "without", "hate", "skip", "except", "not into", "never"];

/** Well-known places we deliberately don't plan for yet, so we can say so honestly. */
const UNSUPPORTED_PLACES = [
  "paris", "london", "bali", "dubai", "thailand", "bangkok", "phuket", "singapore", "maldives", "europe", "switzerland",
  "japan", "tokyo", "new york", "usa", "america", "nepal", "kathmandu", "sri lanka", "bhutan", "vietnam", "australia",
  "leh", "ladakh", "kashmir", "srinagar", "gulmarg", "ooty", "kodaikanal", "andaman", "andamans", "shimla", "mussoorie",
  "nainital", "sikkim", "gangtok", "meghalaya", "shillong", "spiti", "agra", "mysore", "mysuru", "kasol", "jaisalmer",
  "jodhpur", "pushkar", "ranthambore", "gokarna", "alleppey", "alappuzha", "wayanad", "lonavala", "mahabaleshwar",
  "the moon", "moon", "mars", "atlantis", "narnia", "hogwarts", "antarctica", "north pole",
];

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const MONTH_ABBR = MONTHS.map((m) => m.slice(0, 3));

const STOP_WORDS = new Set([
  "the", "a", "an", "my", "our", "some", "somewhere", "someplace", "india", "relax", "chill", "explore", "see", "enjoy", "eat",
  "go", "travel", "stay", "visit", "be", "have", "get", "do", "take", "spend", "plan", "under", "within", "around",
  ...MONTHS, ...MONTH_ABBR,
]);

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function wordRegex(phrase: string, flags = "i"): RegExp {
  return new RegExp(`(?<![\\w-])${escapeRegex(phrase)}(?![\\w-])`, flags);
}

function toNumber(token: string): number {
  const lower = token.toLowerCase();
  if (lower in WORD_NUMBERS) return WORD_NUMBERS[lower];
  return Number(token.replace(/,/g, ""));
}

function isNegated(lower: string, index: number): boolean {
  const before = lower.slice(Math.max(0, index - 24), index);
  return NEGATIONS.some((neg) => new RegExp(`(?<![\\w])${escapeRegex(neg)}\\s+(?:\\w+\\s+){0,2}$`).test(before));
}

function firstIndexOf(lower: string, phrases: string[]): number {
  let best = -1;
  for (const phrase of phrases) {
    const match = wordRegex(phrase).exec(lower);
    if (match && (best === -1 || match.index < best)) best = match.index;
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* Field extractors                                                    */
/* ------------------------------------------------------------------ */

function extractPlaces(text: string, lower: string, out: ExtractedFields): void {
  const fromMatch = /\bfrom\s+([a-z][a-z .]{1,30}?)(?=\s+(?:to|for|with|under|in|on|during|,|and|\d)|[,.!?]|$)/i.exec(text);
  const destinationMatch = /\b(?:to|visit|visiting|in|explore|exploring)\s+([a-z][a-z .]{1,30}?)(?=\s+(?:from|for|with|under|in|on|during|and|,|\d)|[,.!?]|$)/gi;

  const matchPlace = <T extends { aliases: string[] }>(candidate: string, places: T[]): T | undefined =>
    places.find((p) => p.aliases.some((alias) => wordRegex(alias).test(candidate)));

  // Origin: explicit "from X" wins; otherwise an origin city mentioned anywhere.
  if (fromMatch) {
    const candidate = fromMatch[1].trim();
    const origin = matchPlace(candidate, ORIGINS);
    if (origin) out.originId = { value: origin.id, origin: "stated" };
    else out.unknownOrigin = candidate;
  }

  // Destination: a known destination named anywhere in the text.
  const known = DESTINATIONS.map((d) => ({ d, index: firstIndexOf(lower, d.aliases) }))
    .filter((x) => x.index >= 0)
    .sort((a, b) => a.index - b.index);
  if (known.length > 0) {
    const [first] = known;
    out.destinationId = { value: first.d.id, origin: "stated" };
    if (known.length > 1) {
      out.issues.push({
        code: "multiple-destinations",
        severity: "warning",
        field: "destinationId",
        message: `You mentioned ${known.map((k) => k.d.name).join(" and ")}. We plan one base per trip, so we started with ${first.d.name}.`,
      });
    }
    if (first.d.aliases.includes("kerala") && wordRegex("kerala").test(lower) && !wordRegex("munnar").test(lower)) {
      out.issues.push({
        code: "region-mapped",
        severity: "info",
        field: "destinationId",
        message: "For Kerala we plan around Munnar, the hill-station base we have detailed data for.",
      });
    }
  } else {
    const originPhrase = fromMatch?.[1].trim().toLowerCase() ?? "";
    const unsupported = UNSUPPORTED_PLACES.find(
      (place) => wordRegex(place).test(lower) && !wordRegex(place).test(originPhrase),
    );
    if (unsupported) {
      out.unknownDestination = unsupported;
    } else {
      for (const match of text.matchAll(destinationMatch)) {
        const candidate = match[1].trim();
        const firstWord = candidate.split(/\s+/)[0].toLowerCase();
        const isCapitalised = /^[A-Z]/.test(candidate);
        const isOrigin = matchPlace(candidate, ORIGINS);
        if (isCapitalised && !isOrigin && !STOP_WORDS.has(firstWord)) {
          out.unknownDestination = candidate;
          break;
        }
      }
    }
  }

  if (!out.originId && !out.unknownOrigin) {
    const mentioned = ORIGINS.map((o) => ({ o, index: firstIndexOf(lower, o.aliases) }))
      .filter((x) => x.index >= 0)
      .sort((a, b) => a.index - b.index);
    if (mentioned.length > 0) out.originId = { value: mentioned[0].o.id, origin: "inferred" };
  }
}

function extractDays(lower: string, out: ExtractedFields): void {
  const range = new RegExp(`\\b(\\d{1,2})\\s*(?:-|to|–)\\s*(\\d{1,2})\\s*(days?|nights?)\\b`).exec(lower);
  if (range) {
    const high = Number(range[2]) + (range[3].startsWith("night") ? 1 : 0);
    out.days = { value: high, origin: "inferred" };
    out.issues.push({
      code: "duration-range",
      severity: "info",
      field: "days",
      message: `You gave a range, so we planned for the longer end (${high} days). You can shorten it anytime.`,
    });
    return;
  }

  const single = new RegExp(`(^|[^\\w-]|\\s)(-\\s*)?\\b(\\d{1,4}|${NUMBER_WORD})\\s*-?\\s*(days?|nights?|weeks?)\\b`).exec(lower);
  if (single) {
    const negative = Boolean(single[2]);
    const amount = toNumber(single[3]);
    const unit = single[4];
    let days = unit.startsWith("week") ? amount * 7 : unit.startsWith("night") ? amount + 1 : amount;
    if (negative) days = -days;
    out.days = { value: days, origin: "stated" };
  } else if (/\b(fortnight)\b/.test(lower)) {
    out.days = { value: 14, origin: "stated" };
  } else if (/\blong weekend\b/.test(lower)) {
    out.days = { value: 3, origin: "stated" };
  } else if (/\bweekend\b/.test(lower)) {
    out.days = { value: 2, origin: "stated" };
  }

  if (/\bweekend\b/.test(lower) && out.days && out.days.value > 3) {
    out.issues.push({
      code: "duration-contradiction",
      severity: "warning",
      field: "days",
      message: `You mentioned a weekend but also ${out.days.value} days. We went with ${out.days.value} days.`,
    });
  }
}

function extractTravelers(lower: string, out: ExtractedFields): void {
  const adults = /(-?\d{1,4}|\b(?:one|two|three|four|five|six|seven|eight|nine|ten)\b)\s*(?:adults?|grown-?ups?)\b/.exec(lower);
  const kids = /(\d{1,2}|\b(?:one|two|three|four|five|six)\b)\s*(?:kids?|children|child|toddlers?)\b/.exec(lower);
  const explicit = /(-?\d{1,4}|\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b)\s*(?:people|persons?|pax|travell?ers?|friends|members|guests|of us)\b/.exec(lower);
  const group = /\b(?:family|group|gang|party)\s+of\s+(-?\d{1,4}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/.exec(lower);
  const solo = /\b(solo|alone|by myself|just me|only me|myself)\b/.test(lower);
  const couple = /\b(couple|my (?:wife|husband|partner|girlfriend|boyfriend|fianc[ée]e?)|honeymoon|the two of us|both of us)\b/.test(lower);

  let travelers: Extracted<number> | undefined;
  if (adults) {
    travelers = { value: toNumber(adults[1]) + (kids ? toNumber(kids[1]) : 0), origin: "stated" };
  } else if (explicit) {
    travelers = { value: toNumber(explicit[1]), origin: "stated" };
  } else if (group) {
    travelers = { value: toNumber(group[1]), origin: "stated" };
  } else if (couple) {
    travelers = { value: 2, origin: "inferred" };
  } else if (solo) {
    travelers = { value: 1, origin: "inferred" };
  } else {
    const forN = /\bfor\s+(\d{1,2})\b(?!\s*(?:days?|nights?|weeks?|k\b|lakhs?|lacs?|thousand|%|rs|inr|₹|am|pm))/.exec(lower);
    if (forN) travelers = { value: Number(forN[1]), origin: "inferred" };
  }

  if (travelers && solo && travelers.value > 1) {
    out.issues.push({
      code: "travelers-contradiction",
      severity: "warning",
      field: "travelers",
      message: `You mentioned travelling solo but also ${travelers.value} people. We planned for ${travelers.value}.`,
    });
  }
  if (travelers) out.travelers = travelers;
}

function extractBudget(text: string, lower: string, out: ExtractedFields): void {
  const pattern = /(-\s*)?(₹|rs\.?|inr|rupees?)?\s*(\d+(?:[,.]\d+)*)\s*(k|thousand|l|lakhs?|lacs?|lakh|cr|crores?)?\b\s*(rupees|rs|inr|\/-)?/gi;
  const budgetCue = /\b(budget|under|within|below|less than|max(?:imum)?|up ?to|upto|spend|spending|around|about|cap|limit|costs?|afford)\b/;

  for (const match of text.matchAll(pattern)) {
    const [, minus, prefix, digits, suffix, postfix] = match;
    const index = match.index ?? 0;
    const context = lower.slice(Math.max(0, index - 20), index);
    const after = lower.slice(index + match[0].length, index + match[0].length + 12);
    const hasCurrency = Boolean(prefix || postfix);
    const multiplierKey = suffix?.toLowerCase();

    // Skip numbers that are clearly durations or headcounts.
    if (!hasCurrency && !multiplierKey && /^\s*-?\s*(days?|nights?|weeks?|people|persons?|adults?|kids?|travell?ers?|of us|pax)/.test(after)) continue;
    if (!hasCurrency && !multiplierKey && !budgetCue.test(context)) continue;

    let amount = Number(digits.replace(/,/g, ""));
    if (multiplierKey === "k" || multiplierKey === "thousand") amount *= 1_000;
    else if (multiplierKey && /^(l|lakhs?|lacs?|lakh)$/.test(multiplierKey)) amount *= 100_000;
    else if (multiplierKey && multiplierKey.startsWith("cr")) amount *= 10_000_000;

    if (!hasCurrency && !multiplierKey && amount < 1_000) continue;

    const negative = Boolean(minus) || /\b(minus|negative)\s*$/.test(context);
    out.budgetInr = { value: negative ? -amount : Math.round(amount), origin: "stated" };
    out.budgetPerPerson = /^\s*(?:\/\s*person|per (?:person|head|pax)|each|pp\b|a head)/.test(after);
    return;
  }
}

function extractInterests(lower: string, out: ExtractedFields): void {
  const found: { interest: Interest; index: number }[] = [];
  const excluded: Interest[] = [];

  for (const interest of INTERESTS) {
    let bestIndex = -1;
    let negated = false;
    for (const keyword of INTEREST_KEYWORDS[interest]) {
      const regex = new RegExp(wordRegex(keyword).source, "gi");
      for (const match of lower.matchAll(regex)) {
        if (isNegated(lower, match.index ?? 0)) negated = true;
        else if (bestIndex === -1 || (match.index ?? 0) < bestIndex) bestIndex = match.index ?? 0;
      }
    }
    if (bestIndex >= 0) found.push({ interest, index: bestIndex });
    else if (negated) excluded.push(interest);
  }

  if (found.length > 0) {
    out.interests = { value: found.sort((a, b) => a.index - b.index).map((f) => f.interest), origin: "stated" };
  }
  if (excluded.length > 0) out.excludedInterests = excluded;
}

function extractPace(lower: string, out: ExtractedFields): void {
  const hits = (Object.keys(PACE_KEYWORDS) as Pace[]).filter((pace) =>
    PACE_KEYWORDS[pace].some((keyword) => wordRegex(keyword).test(lower)),
  );
  if (hits.length === 1) {
    out.pace = { value: hits[0], origin: "stated" };
  } else if (hits.includes("relaxed") && hits.includes("packed")) {
    out.pace = { value: "balanced", origin: "inferred" };
    out.issues.push({
      code: "pace-contradiction",
      severity: "warning",
      field: "pace",
      message: "You asked for both a relaxed and a packed trip. We went with a balanced pace — switch it anytime.",
    });
  } else if (hits.length > 1) {
    out.pace = { value: hits[0], origin: "inferred" };
  }
}

function extractStartDate(lower: string, today: string, out: ExtractedFields): void {
  const year = Number(today.slice(0, 4));

  const iso = /\b(\d{4}-\d{2}-\d{2})\b/.exec(lower);
  if (iso && isValidIsoDate(iso[1])) {
    out.startDate = { value: iso[1], origin: "stated" };
    return;
  }

  const monthPattern = `(${MONTHS.join("|")}|${MONTH_ABBR.join("|")})`;
  const dayMonth = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${monthPattern}\\b`).exec(lower);
  const monthDay = new RegExp(`\\b${monthPattern}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`).exec(lower);
  const monthOnly = new RegExp(`\\b(?:in|during|this|next|early|mid|late|around)\\s+${monthPattern}\\b`).exec(lower);

  const monthFrom = (token: string) => MONTH_ABBR.indexOf(token.slice(0, 3));
  const build = (month: number, day: number): string | null => {
    for (const y of [year, year + 1]) {
      const candidate = `${y}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      if (isValidIsoDate(candidate) && daysBetween(today, candidate) >= 1) return candidate;
    }
    return null;
  };

  let candidate: string | null = null;
  let origin: "stated" | "inferred" = "stated";
  if (dayMonth) candidate = build(monthFrom(dayMonth[2]), Number(dayMonth[1]));
  else if (monthDay) candidate = build(monthFrom(monthDay[1]), Number(monthDay[2]));
  else if (monthOnly) {
    candidate = build(monthFrom(monthOnly[1]), 10);
    origin = "inferred";
  } else if (/\btomorrow\b/.test(lower)) candidate = addDays(today, 1);
  else if (/\bnext week\b/.test(lower)) candidate = addDays(today, 7);
  else if (/\bnext month\b/.test(lower)) {
    candidate = addDays(today, 30);
    origin = "inferred";
  } else if (/\bthis weekend\b/.test(lower)) {
    const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
    candidate = addDays(today, ((6 - weekday + 7) % 7) || 7);
  }

  if (candidate) out.startDate = { value: candidate, origin };
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export function extractFields(rawText: string, options: ParseOptions = {}): ExtractedFields & { cleanText: string } {
  const today = options.today ?? toIsoDate(new Date());
  const { text, truncated, injectionDetected } = sanitizeUserText(rawText);
  const lower = text.toLowerCase();
  const out: ExtractedFields = { issues: [] };

  if (injectionDetected) {
    out.issues.push({
      code: "instructions-ignored",
      severity: "warning",
      message: "Part of your message looked like instructions to the planner rather than trip details, so we ignored it.",
    });
  }
  if (truncated) {
    out.issues.push({
      code: "request-truncated",
      severity: "info",
      message: `Your request was long, so we only read the first ${LIMITS.requestMaxChars} characters.`,
    });
  }

  extractPlaces(text, lower, out);
  extractDays(lower, out);
  extractTravelers(lower, out);
  extractBudget(text, lower, out);
  extractInterests(lower, out);
  extractPace(lower, out);
  extractStartDate(lower, today, out);

  return { ...out, cleanText: text };
}

/**
 * Applies defaults, validates ranges and records every assumption, turning raw
 * findings into constraints the planner can use.
 */
export function finalizeConstraints(fields: ExtractedFields, rawText: string, options: ParseOptions = {}): Omit<ParsedRequest, "extractor"> {
  const today = options.today ?? toIsoDate(new Date());
  const issues: ParseIssue[] = [...fields.issues];
  const origins = {} as ConstraintOrigins;
  const set = <K extends ConstraintField>(field: K, origin: ValueOrigin) => {
    origins[field] = origin;
  };

  const statedCount = [
    fields.originId, fields.destinationId, fields.travelers, fields.days, fields.budgetInr, fields.interests, fields.pace, fields.startDate,
  ].filter(Boolean).length;

  if (rawText.trim().length === 0) {
    issues.push({ code: "empty", severity: "blocking", message: "Tell us a little about the trip you have in mind to get started." });
  } else if (statedCount === 0 && !fields.unknownDestination && !fields.unknownOrigin) {
    issues.push({
      code: "too-vague",
      severity: "blocking",
      message: "We couldn't find any trip details in that. Try something like “5 days from Mumbai for 2, under ₹40K, beaches and food”.",
    });
  }

  // Origin
  let originId: string = DEFAULTS.originId;
  if (fields.originId) {
    originId = fields.originId.value;
    set("originId", fields.originId.origin);
  } else {
    set("originId", "default");
    if (fields.unknownOrigin) {
      issues.push({
        code: "unsupported-origin",
        severity: "blocking",
        field: "originId",
        message: `We can't plan departures from “${fields.unknownOrigin}” yet. Pick one of ${ORIGINS.map((o) => o.name).join(", ")}.`,
      });
    } else if (statedCount > 0) {
      issues.push({
        code: "origin-assumed",
        severity: "warning",
        field: "originId",
        message: `You didn't say where you're starting from, so we assumed ${ORIGINS.find((o) => o.id === originId)?.name}.`,
      });
    }
  }

  // Destination
  let destinationId: string | null = null;
  if (fields.destinationId) {
    destinationId = fields.destinationId.value;
    set("destinationId", fields.destinationId.origin);
  } else {
    set("destinationId", "default");
    if (fields.unknownDestination) {
      issues.push({
        code: "unsupported-destination",
        severity: "blocking",
        field: "destinationId",
        message: `We don't have reliable data for “${fields.unknownDestination}”, so we won't guess. Choose one of our destinations, or let us pick one that fits.`,
      });
    }
  }

  // Travelers
  let travelers: number = DEFAULTS.travelers;
  if (fields.travelers) {
    const value = fields.travelers.value;
    if (!Number.isInteger(value) || value < LIMITS.minTravelers || value > LIMITS.maxTravelers) {
      set("travelers", "default");
      issues.push({
        code: "invalid-travelers",
        severity: "blocking",
        field: "travelers",
        message:
          value < LIMITS.minTravelers
            ? `A trip needs at least one traveller — we read “${value}”.`
            : `We plan for groups of up to ${LIMITS.maxTravelers}. For ${value} people you'd want a group-travel specialist.`,
      });
    } else {
      travelers = value;
      set("travelers", fields.travelers.origin);
    }
  } else {
    set("travelers", "default");
    if (statedCount > 0) {
      issues.push({ code: "travelers-assumed", severity: "info", field: "travelers", message: `We assumed ${travelers} travellers.` });
    }
  }

  // Duration
  let days: number = DEFAULTS.days;
  if (fields.days) {
    const value = fields.days.value;
    if (!Number.isInteger(value) || value < LIMITS.minDays || value > LIMITS.maxDays) {
      set("days", "default");
      issues.push({
        code: "invalid-duration",
        severity: "blocking",
        field: "days",
        message:
          value < LIMITS.minDays
            ? `A trip can't last ${value} days. Choose between ${LIMITS.minDays} and ${LIMITS.maxDays} days.`
            : `We plan trips of up to ${LIMITS.maxDays} days — ${value} days is longer than we can plan reliably.`,
      });
    } else {
      days = value;
      set("days", fields.days.origin);
    }
  } else {
    set("days", "default");
    if (statedCount > 0) {
      issues.push({ code: "duration-assumed", severity: "warning", field: "days", message: `You didn't mention how long, so we planned ${days} days.` });
    }
  }

  // Budget
  let budgetInr = travelers * days * DEFAULTS.budgetPerPersonPerDayInr;
  if (fields.budgetInr) {
    const raw = fields.budgetInr.value;
    const value = fields.budgetPerPerson ? raw * travelers : raw;
    if (value <= 0) {
      set("budgetInr", "default");
      issues.push({ code: "invalid-budget", severity: "blocking", field: "budgetInr", message: "The budget needs to be a positive amount." });
    } else if (value < LIMITS.minBudgetInr) {
      set("budgetInr", "default");
      issues.push({
        code: "invalid-budget",
        severity: "blocking",
        field: "budgetInr",
        message: `₹${value.toLocaleString("en-IN")} won't cover a trip. The smallest budget we plan with is ₹${LIMITS.minBudgetInr.toLocaleString("en-IN")}.`,
      });
    } else if (value > LIMITS.maxBudgetInr) {
      set("budgetInr", "default");
      issues.push({
        code: "invalid-budget",
        severity: "blocking",
        field: "budgetInr",
        message: `That budget is above what we plan for (₹${LIMITS.maxBudgetInr.toLocaleString("en-IN")}).`,
      });
    } else {
      budgetInr = Math.round(value);
      set("budgetInr", fields.budgetInr.origin);
      if (fields.budgetPerPerson) {
        issues.push({
          code: "budget-per-person",
          severity: "info",
          field: "budgetInr",
          message: `Read as ₹${raw.toLocaleString("en-IN")} per person — ₹${budgetInr.toLocaleString("en-IN")} for the group.`,
        });
      }
    }
  } else {
    set("budgetInr", "default");
    if (statedCount > 0) {
      issues.push({
        code: "budget-assumed",
        severity: "warning",
        field: "budgetInr",
        message: `No budget mentioned, so we used a mid-range ₹${budgetInr.toLocaleString("en-IN")}. Set your own to get a tighter plan.`,
      });
    }
  }

  // Interests
  let interests: Interest[] = ["nature", "food", "culture"];
  if (fields.interests && fields.interests.value.length > 0) {
    interests = fields.interests.value;
    set("interests", fields.interests.origin);
  } else {
    if (fields.excludedInterests?.length) interests = interests.filter((i) => !fields.excludedInterests?.includes(i));
    if (interests.length === 0) interests = ["culture"];
    set("interests", "default");
    if (statedCount > 0) {
      issues.push({ code: "interests-assumed", severity: "info", field: "interests", message: "No interests mentioned, so we planned a mix of nature, food and culture." });
    }
  }
  if (fields.excludedInterests?.length) {
    issues.push({
      code: "interests-excluded",
      severity: "info",
      field: "interests",
      message: `Noted — we'll keep ${fields.excludedInterests.join(" and ")} out of the plan where we can.`,
    });
  }

  // Pace
  let pace: Pace = DEFAULTS.pace;
  if (fields.pace) {
    pace = fields.pace.value;
    set("pace", fields.pace.origin);
  } else {
    set("pace", "default");
  }

  // Start date
  let startDate = addDays(today, LIMITS.defaultLeadDays);
  if (fields.startDate && !isValidIsoDate(fields.startDate.value)) {
    set("startDate", "default");
  } else if (fields.startDate) {
    const lead = daysBetween(today, fields.startDate.value);
    if (lead < 0) {
      set("startDate", "default");
      issues.push({ code: "date-in-past", severity: "warning", field: "startDate", message: "That date has already passed, so we moved the trip three weeks out." });
    } else if (lead > LIMITS.maxLeadDays) {
      set("startDate", "default");
      issues.push({ code: "date-too-far", severity: "warning", field: "startDate", message: "We can only plan up to a year ahead, so we moved the trip three weeks out." });
    } else {
      startDate = fields.startDate.value;
      set("startDate", fields.startDate.origin);
    }
  } else {
    set("startDate", "default");
  }

  // Cross-field contradictions
  const lower = rawText.toLowerCase();
  const perPersonPerDay = budgetInr / (travelers * days);
  if (/\b(luxury|luxurious|5[- ]star|five[- ]star|premium|lavish)\b/.test(lower) && perPersonPerDay < 3_000) {
    issues.push({
      code: "style-budget-contradiction",
      severity: "warning",
      field: "budgetInr",
      message: `Luxury stays don't fit ₹${Math.round(perPersonPerDay).toLocaleString("en-IN")} per person per day. We'll plan the most comfortable option the budget allows.`,
    });
  }

  const constraints: TripConstraints = { originId, destinationId, travelers, days, budgetInr, interests, pace, startDate };
  return { constraints, origins, issues: dedupeIssues(issues) };
}

function dedupeIssues(issues: ParseIssue[]): ParseIssue[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    if (seen.has(issue.code)) return false;
    seen.add(issue.code);
    return true;
  });
}

export function parseTripRequest(rawText: string, options: ParseOptions = {}): ParsedRequest {
  const fields = extractFields(rawText, options);
  return { ...finalizeConstraints(fields, fields.cleanText, options), extractor: "rules" };
}

export function hasBlockingIssues(issues: ParseIssue[]): boolean {
  return issues.some((issue) => issue.severity === "blocking");
}
