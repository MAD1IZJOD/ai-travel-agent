/**
 * Research: gathers external evidence for a destination and attaches it to a
 * plan with honest labels.
 *
 * - Wikipedia grounds the destination description and links attractions to a
 *   public article — but only when the article was actually fetched now.
 * - Open-Meteo supplies a forecast (near trips) or last year's observed weather.
 * - Every lookup is recorded, including failures, and nothing is invented to
 *   fill a gap.
 */
import { getGuide } from "@/lib/data/guides";
import { getDestination } from "@/lib/data/places";
import type { ResearchTools } from "@/lib/tools";
import type { WeatherData } from "@/lib/tools/weather";
import type { WikiSummary } from "@/lib/tools/wikipedia";
import { haversineKm } from "./geo";
import type { SourceRef, ToolCallRecord, TripConstraints, TripPlan, WeatherSummary } from "./types";

/** An article further than this from our coordinates is probably about somewhere else. */
const MAX_ARTICLE_DISTANCE_KM = 60;
const MAX_ATTRACTION_LOOKUPS = 10;
const HOT_DAY_C = 37;
const COLD_NIGHT_C = 3;

export interface ResearchData {
  destinationId: string;
  destinationSummary: (WikiSummary & { retrievedAt: string }) | null;
  attractionSummaries: Map<string, WikiSummary & { retrievedAt: string }>;
  weather: (WeatherData & { retrievedAt: string }) | null;
  calls: ToolCallRecord[];
  notices: string[];
}

async function timed<T>(run: () => Promise<T>): Promise<{ result: T; ms: number }> {
  const started = Date.now();
  const result = await run();
  return { result, ms: Date.now() - started };
}

function failureDetail(reason: string, message: string): string {
  switch (reason) {
    case "offline":
      return "Live lookups are switched off";
    case "rate-limited":
      return "The service is busy right now";
    case "timeout":
      return "The service didn't respond in time";
    case "not-found":
      return "No matching article";
    case "malformed":
      return "The response didn't look right, so we ignored it";
    default:
      return message;
  }
}

export async function gatherResearch(constraints: TripConstraints, destinationId: string, tools: ResearchTools, today: string): Promise<ResearchData> {
  const place = getDestination(destinationId);
  const guide = getGuide(destinationId);
  const calls: ToolCallRecord[] = [];
  const notices: string[] = [];
  const attractionPoints = new Map(guide.attractions.flatMap((a) => (a.wikiTitle ? [[a.wikiTitle, { lat: a.lat, lng: a.lng }] as const] : [])));
  const attractionTitles = [...attractionPoints.keys()].slice(0, MAX_ATTRACTION_LOOKUPS);

  const [destinationLookup, attractionLookups, weatherLookup] = await Promise.all([
    timed(() => tools.wikipedia(place.wikiTitle)),
    Promise.all(attractionTitles.map((title) => timed(() => tools.wikipedia(title)).then((r) => ({ title, ...r })))),
    timed(() => tools.weather({ lat: place.lat, lng: place.lng, startDate: constraints.startDate, days: constraints.days, today })),
  ]);

  // Destination article
  let destinationSummary: ResearchData["destinationSummary"] = null;
  const dest = destinationLookup.result;
  if (dest.ok) {
    const coords = dest.data.coordinates;
    const distance = coords ? haversineKm(coords, place) : 0;
    if (distance > MAX_ARTICLE_DISTANCE_KM) {
      calls.push({ tool: "wikipedia", target: place.wikiTitle, status: "filtered", detail: `Article location is ${Math.round(distance)} km from ${place.name}, so we didn't use it`, durationMs: destinationLookup.ms });
    } else {
      destinationSummary = { ...dest.data, retrievedAt: dest.retrievedAt };
      calls.push({
        tool: "wikipedia",
        target: place.wikiTitle,
        status: dest.data.filtered ? "filtered" : "ok",
        detail: dest.data.filtered ? "Fetched the article; dropped text that looked like instructions" : dest.cached ? "Article summary (cached)" : "Article summary fetched",
        durationMs: destinationLookup.ms,
      });
    }
  } else {
    calls.push({ tool: "wikipedia", target: place.wikiTitle, status: dest.reason === "offline" ? "skipped" : "failed", detail: failureDetail(dest.reason, dest.message), durationMs: destinationLookup.ms });
  }

  // Attraction articles
  const attractionSummaries: ResearchData["attractionSummaries"] = new Map();
  let attractionOk = 0;
  let attractionFailed = 0;
  let attractionFiltered = 0;
  let slowest = 0;
  for (const lookup of attractionLookups) {
    slowest = Math.max(slowest, lookup.ms);
    if (lookup.result.ok) {
      const coords = lookup.result.data.coordinates;
      const expected = attractionPoints.get(lookup.title);
      // Same-name articles about other places must not be used as evidence.
      if (coords && expected && haversineKm(coords, expected) > MAX_ARTICLE_DISTANCE_KM) {
        attractionFiltered += 1;
        continue;
      }
      attractionSummaries.set(lookup.title, { ...lookup.result.data, retrievedAt: lookup.result.retrievedAt });
      attractionOk += 1;
      if (lookup.result.data.filtered) attractionFiltered += 1;
    } else attractionFailed += 1;
  }
  if (attractionTitles.length > 0) {
    const offline = attractionLookups.every((l) => !l.result.ok && l.result.reason === "offline");
    calls.push({
      tool: "wikipedia",
      target: `${attractionTitles.length} places to visit`,
      status: offline ? "skipped" : attractionOk === 0 ? "failed" : attractionFiltered > 0 ? "filtered" : "ok",
      detail: offline
        ? "Live lookups are switched off"
        : `${attractionOk} found${attractionFailed ? `, ${attractionFailed} unavailable` : ""}${attractionFiltered ? `, ${attractionFiltered} set aside (wrong place or unsafe text)` : ""}`,
      durationMs: slowest,
    });
  }

  // Weather
  let weather: ResearchData["weather"] = null;
  const w = weatherLookup.result;
  if (w.ok) {
    weather = { ...w.data, retrievedAt: w.retrievedAt };
    calls.push({
      tool: "weather",
      target: place.name,
      status: "ok",
      detail: w.data.basis === "forecast" ? "Forecast for your dates" : "Observed weather for the same dates last year",
      durationMs: weatherLookup.ms,
    });
  } else {
    calls.push({ tool: "weather", target: place.name, status: w.reason === "offline" ? "skipped" : "failed", detail: failureDetail(w.reason, w.message), durationMs: weatherLookup.ms });
    notices.push(
      w.reason === "offline"
        ? "Live lookups are off, so this plan has no weather check and uses our own destination notes."
        : "We couldn't reach the weather service, so this plan has no weather check. The rest of the plan is unaffected.",
    );
  }

  return { destinationId, destinationSummary, attractionSummaries, weather, calls, notices };
}

function describeWeather(weather: WeatherData): { summary: string; notices: string[] } {
  const wet = `${weather.wetDays} of ${weather.days} days`;
  const summary =
    weather.basis === "forecast"
      ? `Forecast for your dates: highs around ${Math.round(weather.avgHighC)}°C, lows around ${Math.round(weather.avgLowC)}°C, rain on ${wet}.`
      : `Same dates last year: highs around ${Math.round(weather.avgHighC)}°C, lows around ${Math.round(weather.avgLowC)}°C, rain on ${wet}. This is past weather, not a forecast.`;

  const notices: string[] = [];
  if (weather.days > 0 && weather.wetDays / weather.days >= 0.5) {
    notices.push(weather.basis === "forecast" ? "Rain is forecast on most days — keep an indoor backup for outdoor plans." : "It rained on most of these dates last year — pack rain gear and keep plans flexible.");
  }
  if (weather.avgHighC >= HOT_DAY_C) notices.push("Expect very hot afternoons — the plan front-loads outdoor time into mornings and evenings where it can.");
  if (weather.avgLowC <= COLD_NIGHT_C) notices.push("Nights get close to freezing — pack warm layers.");
  return { summary, notices };
}

/** Attaches research to any version of the plan (initial, revised or replanned). */
export function applyResearch(plan: TripPlan, research: ResearchData): TripPlan {
  if (research.destinationId !== plan.destination.id) return plan;
  const sources: SourceRef[] = [...plan.sources];
  const place = getDestination(plan.destination.id);

  const destination = { ...plan.destination };
  if (research.destinationSummary) {
    destination.description = research.destinationSummary.extract;
    destination.imageUrl = research.destinationSummary.imageUrl;
    sources.unshift({
      id: `wiki:${place.wikiTitle}`,
      label: `Wikipedia: ${research.destinationSummary.title}`,
      url: research.destinationSummary.url,
      kind: "verified",
      retrievedAt: research.destinationSummary.retrievedAt,
      note: "Destination description and photo, fetched live.",
    });
  }

  const linkedTitles = new Set<string>();
  const days = plan.days.map((day) => ({
    ...day,
    activities: day.activities.map((activity) => ({
      ...activity,
      // Only keep links to articles we actually fetched during this run.
      sourceIds: activity.sourceIds.filter((id) => {
        if (!id.startsWith("wiki:")) return true;
        const title = id.slice("wiki:".length);
        const found = research.attractionSummaries.has(title);
        if (found) linkedTitles.add(title);
        return found;
      }),
    })),
  }));
  for (const title of linkedTitles) {
    const summary = research.attractionSummaries.get(title)!;
    sources.push({ id: `wiki:${title}`, label: `Wikipedia: ${summary.title}`, url: summary.url, kind: "verified", retrievedAt: summary.retrievedAt });
  }

  let weather: WeatherSummary | null = null;
  const notices = [...plan.notices, ...research.notices];
  if (research.weather) {
    const { summary, notices: weatherNotices } = describeWeather(research.weather);
    weather = {
      basis: research.weather.basis,
      avgHighC: research.weather.avgHighC,
      avgLowC: research.weather.avgLowC,
      wetDays: research.weather.wetDays,
      days: research.weather.days,
      sourceId: "weather:open-meteo",
      note: summary,
    };
    notices.push(...weatherNotices);
    sources.push({
      id: "weather:open-meteo",
      label: research.weather.basis === "forecast" ? "Open-Meteo weather forecast" : "Open-Meteo historical weather",
      url: "https://open-meteo.com/",
      kind: "verified",
      retrievedAt: research.weather.retrievedAt,
      note: research.weather.basis === "forecast" ? `Forecast for ${research.weather.periodStart} to ${research.weather.periodEnd}.` : `Observed ${research.weather.periodStart} to ${research.weather.periodEnd}; used as a guide, not a forecast.`,
    });
  }

  return { ...plan, destination, days, weather, sources, notices: [...new Set(notices)], research: research.calls };
}
