import { toolFailure, type FetchLike } from "./core";
import { createWeatherTool, type WeatherTool } from "./weather";
import { createWikipediaTool, type WikipediaTool } from "./wikipedia";

export interface ResearchTools {
  wikipedia: WikipediaTool;
  weather: WeatherTool;
  /** True when live lookups are switched off; the UI says so instead of pretending. */
  offline: boolean;
}

function offlineTools(): ResearchTools {
  const unavailable = async () => toolFailure("offline", "Live lookups are switched off");
  return { wikipedia: unavailable, weather: unavailable, offline: true };
}

let shared: ResearchTools | null = null;

/** Live tools backed by fetch. Pass `fetchImpl` in tests to simulate responses and failures. */
export function createResearchTools(options: { fetchImpl?: FetchLike; offline?: boolean } = {}): ResearchTools {
  if (options.offline) return offlineTools();
  const fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
  return { wikipedia: createWikipediaTool(fetchImpl), weather: createWeatherTool(fetchImpl), offline: false };
}

/** Process-wide tools (shares caches across requests). */
export function getResearchTools(): ResearchTools {
  if (!shared) shared = createResearchTools({ offline: process.env.WAYFARE_OFFLINE === "1" });
  return shared;
}
