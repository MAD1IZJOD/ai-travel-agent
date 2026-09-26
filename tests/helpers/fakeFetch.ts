import type { FetchLike } from "@/lib/tools/core";
import { GUIDES } from "@/lib/data/guides";
import { DESTINATIONS } from "@/lib/data/places";

type Responder = (url: URL) => Response | Promise<Response>;

export function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
}

/** Coordinates we know for each Wikipedia title, so fake articles sit in the right place. */
function knownPoint(title: string): { lat: number; lon: number } | undefined {
  const destination = DESTINATIONS.find((d) => d.wikiTitle === title);
  if (destination) return { lat: destination.lat, lon: destination.lng };
  for (const guide of Object.values(GUIDES)) {
    const attraction = guide.attractions.find((a) => a.wikiTitle === title);
    if (attraction) return { lat: attraction.lat, lon: attraction.lng };
  }
  return undefined;
}

export function wikiSummary(title: string, overrides: Record<string, unknown> = {}) {
  const slug = encodeURIComponent(title.replace(/ /g, "_"));
  return {
    type: "standard",
    title,
    extract: `${title} is a well-known place in India. It attracts many visitors every year.`,
    content_urls: { desktop: { page: `https://en.wikipedia.org/wiki/${slug}` } },
    coordinates: knownPoint(title),
    originalimage: { source: `https://upload.wikimedia.org/wikipedia/commons/a/ab/${slug}.jpg?utm_source=x`, width: 1600 },
    ...overrides,
  };
}

export function weatherBody(days: number, rainMm = 0) {
  return {
    daily: {
      time: Array.from({ length: days }, (_, i) => `2026-10-${String(17 + i).padStart(2, "0")}`),
      temperature_2m_max: Array.from({ length: days }, () => 24),
      temperature_2m_min: Array.from({ length: days }, () => 12),
      precipitation_sum: Array.from({ length: days }, (_, i) => (i % 2 === 0 ? rainMm : 0)),
    },
  };
}

/** A fetch that serves healthy Wikipedia and Open-Meteo responses, with per-test overrides. */
export function fakeFetch(options: { wiki?: (title: string) => Response | null; weather?: Responder } = {}): FetchLike & { calls: string[] } {
  const calls: string[] = [];
  const impl = async (input: string) => {
    calls.push(input);
    const url = new URL(input);
    if (url.hostname === "en.wikipedia.org") {
      const title = decodeURIComponent(url.pathname.split("/").pop()!).replace(/_/g, " ");
      return options.wiki?.(title) ?? jsonResponse(wikiSummary(title));
    }
    if (url.hostname.endsWith("open-meteo.com")) {
      if (options.weather) return options.weather(url);
      const start = url.searchParams.get("start_date")!;
      const end = url.searchParams.get("end_date")!;
      const days = Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) + 1;
      return jsonResponse(weatherBody(days));
    }
    return new Response("not found", { status: 404 });
  };
  return Object.assign(impl, { calls });
}
