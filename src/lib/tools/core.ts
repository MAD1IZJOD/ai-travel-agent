/**
 * Shared plumbing for external tools: typed outcomes, a hardened JSON fetch,
 * a small TTL cache, and sanitisation for text we did not write.
 */
import { HIDDEN_CHARACTERS, containsInjection } from "@/lib/agent/safety";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type ToolFailure = "offline" | "timeout" | "http-error" | "rate-limited" | "not-found" | "malformed" | "network" | "too-large";

export type ToolOutcome<T> =
  | { ok: true; data: T; retrievedAt: string; cached: boolean }
  | { ok: false; reason: ToolFailure; message: string };

const DEFAULT_TIMEOUT_MS = 4_000;
const MAX_RESPONSE_BYTES = 256_000;
/** Wikimedia asks API clients to identify themselves with a contact URL. */
export const USER_AGENT = "Wayfare-TravelAgent/0.1 (https://github.com/MAD1IZJOD/ai-travel-agent)";
/** Longest we will wait before retrying a rate-limited request once. */
const MAX_RETRY_WAIT_MS = 1_500;

export function toolFailure(reason: ToolFailure, message: string): ToolOutcome<never> {
  return { ok: false, reason, message };
}

type FetchJsonResult = { ok: true; json: unknown } | { ok: false; reason: ToolFailure; message: string; retryAfterMs?: number };

/** Fetches JSON with a timeout and a size cap. Retries a rate-limited request once. Never throws. */
export async function fetchJson(url: string, fetchImpl: FetchLike, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<FetchJsonResult> {
  const first = await fetchJsonOnce(url, fetchImpl, timeoutMs);
  if (first.ok || first.reason !== "rate-limited") return first;
  const waitMs = Math.min(MAX_RETRY_WAIT_MS, first.retryAfterMs ?? MAX_RETRY_WAIT_MS);
  await new Promise((resolve) => setTimeout(resolve, waitMs));
  const second = await fetchJsonOnce(url, fetchImpl, timeoutMs);
  return second.ok || second.reason !== "rate-limited" ? second : { ok: false, reason: "rate-limited", message: "Rate limited by the service" };
}

async function fetchJsonOnce(url: string, fetchImpl: FetchLike, timeoutMs: number): Promise<FetchJsonResult> {
  try {
    const response = await fetchImpl(url, {
      headers: { Accept: "application/json", "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
    if (response.status === 429) {
      const retryAfterSeconds = Number(response.headers.get("retry-after"));
      return {
        ok: false,
        reason: "rate-limited",
        message: "Rate limited by the service",
        retryAfterMs: Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0 ? retryAfterSeconds * 1000 : undefined,
      };
    }
    if (response.status === 404) return { ok: false, reason: "not-found", message: "Not found" };
    if (!response.ok) return { ok: false, reason: "http-error", message: `HTTP ${response.status}` };
    const text = await response.text();
    if (text.length > MAX_RESPONSE_BYTES) return { ok: false, reason: "too-large", message: "Response too large" };
    try {
      return { ok: true, json: JSON.parse(text) };
    } catch {
      return { ok: false, reason: "malformed", message: "Response was not valid JSON" };
    }
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      return { ok: false, reason: "timeout", message: `No response within ${timeoutMs / 1000}s` };
    }
    return { ok: false, reason: "network", message: "Network error" };
  }
}

/** Limits how many requests to one service run at once. */
export function createLimiter(maxConcurrent: number) {
  let active = 0;
  const queue: (() => void)[] = [];
  return async function limit<T>(task: () => Promise<T>): Promise<T> {
    // A released slot is handed straight to the next waiter, so the count never overshoots.
    if (active >= maxConcurrent) await new Promise<void>((resolve) => queue.push(resolve));
    else active += 1;
    try {
      return await task();
    } finally {
      const next = queue.shift();
      if (next) next();
      else active -= 1;
    }
  };
}

export class TtlCache<V> {
  private readonly entries = new Map<string, { value: V; expires: number }>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries = 500,
  ) {}

  get(key: string): V | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expires < Date.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: V): void {
    if (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    this.entries.set(key, { value, expires: Date.now() + this.ttlMs });
  }
}

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " " };

/**
 * External text is data, never instructions. Strip markup and hidden
 * characters, drop any sentence that reads like an instruction to an AI or
 * contains a link, and cap the length.
 */
export function sanitizeExternalText(raw: string, maxChars: number): { text: string; filtered: boolean } {
  const plain = raw
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITIES[m] ?? " ")
    .replace(HIDDEN_CHARACTERS, " ")
    .replace(/\s+/g, " ")
    .trim();

  const sentences = plain.split(/(?<=[.!?])\s+/).filter(Boolean);
  let filtered = false;
  const kept = sentences.filter((sentence) => {
    const unsafe = containsInjection(sentence) || /(https?:\/\/|www\.)\S+/i.test(sentence) || /\b(assistant|chatbot|language model|ai model|llm)\b/i.test(sentence);
    if (unsafe) filtered = true;
    return !unsafe;
  });

  let text = "";
  for (const sentence of kept) {
    const next = `${text}${text ? " " : ""}${sentence.trim()}`;
    if (next.length > maxChars) break;
    text = next;
  }
  return { text, filtered };
}
