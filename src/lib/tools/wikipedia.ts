/**
 * Wikipedia page summaries (REST API, no key required).
 * Used to ground destination descriptions and link attractions to a public reference.
 */
import { z } from "zod";
import { createLimiter, fetchJson, sanitizeExternalText, toolFailure, TtlCache, type FetchLike, type ToolOutcome } from "./core";

const API_BASE = "https://en.wikipedia.org/api/rest_v1/page/summary/";
const ALLOWED_PAGE_HOST = "en.wikipedia.org";
const ALLOWED_IMAGE_HOSTS = new Set(["upload.wikimedia.org", "thumb.wikimedia.org"]);
const MAX_EXTRACT_CHARS = 420;
const MAX_IMAGE_WIDTH = 5_000;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
/** Wikimedia rate-limits bursts; a few parallel requests is plenty. */
const MAX_CONCURRENT_REQUESTS = 3;

const summarySchema = z.object({
  type: z.string(),
  title: z.string().max(300),
  extract: z.string().max(20_000),
  content_urls: z.object({ desktop: z.object({ page: z.string().url() }) }),
  coordinates: z.object({ lat: z.number(), lon: z.number() }).optional(),
  thumbnail: z.object({ source: z.string().url() }).optional(),
  originalimage: z.object({ source: z.string().url(), width: z.number() }).optional(),
});

export interface WikiSummary {
  title: string;
  extract: string;
  url: string;
  imageUrl: string | null;
  coordinates: { lat: number; lng: number } | null;
  /** True when part of the text was dropped for looking like instructions. */
  filtered: boolean;
}

/** Only allow images from Wikimedia, and drop tracking query strings. */
function safeImageUrl(candidate: string | undefined): string | null {
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" || !ALLOWED_IMAGE_HOSTS.has(url.hostname)) return null;
    return `${url.origin}${url.pathname}`;
  } catch {
    return null;
  }
}

export type WikipediaTool = (title: string) => Promise<ToolOutcome<WikiSummary>>;

export function createWikipediaTool(fetchImpl: FetchLike, cache = new TtlCache<WikiSummary>(CACHE_TTL_MS)): WikipediaTool {
  const limit = createLimiter(MAX_CONCURRENT_REQUESTS);
  return async (title) => {
    const cached = cache.get(title);
    if (cached) return { ok: true, data: cached, retrievedAt: new Date().toISOString(), cached: true };

    const response = await limit(() => fetchJson(`${API_BASE}${encodeURIComponent(title.replace(/ /g, "_"))}`, fetchImpl));
    if (!response.ok) return toolFailure(response.reason, response.message);

    const parsed = summarySchema.safeParse(response.json);
    if (!parsed.success) return toolFailure("malformed", "Unexpected response shape");
    if (parsed.data.type !== "standard") return toolFailure("not-found", "Not a standard article");

    let pageUrl: URL;
    try {
      pageUrl = new URL(parsed.data.content_urls.desktop.page);
    } catch {
      return toolFailure("malformed", "Invalid page URL");
    }
    if (pageUrl.protocol !== "https:" || pageUrl.hostname !== ALLOWED_PAGE_HOST) {
      return toolFailure("malformed", "Unexpected page host");
    }

    const { text, filtered } = sanitizeExternalText(parsed.data.extract, MAX_EXTRACT_CHARS);
    if (!text) return toolFailure("malformed", "No usable text");

    const original = parsed.data.originalimage;
    const summary: WikiSummary = {
      title: parsed.data.title,
      extract: text,
      url: pageUrl.toString(),
      imageUrl: safeImageUrl(original && original.width <= MAX_IMAGE_WIDTH ? original.source : parsed.data.thumbnail?.source),
      coordinates: parsed.data.coordinates ? { lat: parsed.data.coordinates.lat, lng: parsed.data.coordinates.lon } : null,
      filtered,
    };
    cache.set(title, summary);
    return { ok: true, data: summary, retrievedAt: new Date().toISOString(), cached: false };
  };
}
