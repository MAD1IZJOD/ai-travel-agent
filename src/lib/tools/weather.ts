/**
 * Weather from Open-Meteo (no key required).
 *
 * Trips starting within the forecast horizon use the live forecast. Trips
 * further out use observed weather for the same dates last year — clearly
 * labelled as such, never presented as a forecast.
 */
import { z } from "zod";
import { addDays, daysBetween } from "@/lib/agent/dates";
import { fetchJson, toolFailure, TtlCache, type FetchLike, type ToolOutcome } from "./core";

const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive";
/** Open-Meteo forecasts 16 days ahead; we stay a little inside that. */
const FORECAST_HORIZON_DAYS = 14;
const WET_DAY_MM = 2;
const CACHE_TTL_MS = 60 * 60 * 1000;

const dailySchema = z.object({
  daily: z.object({
    time: z.array(z.string()).min(1).max(40),
    temperature_2m_max: z.array(z.number().nullable()),
    temperature_2m_min: z.array(z.number().nullable()),
    precipitation_sum: z.array(z.number().nullable()),
  }),
});

export interface WeatherData {
  basis: "forecast" | "last-year";
  days: number;
  avgHighC: number;
  avgLowC: number;
  wetDays: number;
  totalRainMm: number;
  periodStart: string;
  periodEnd: string;
}

export interface WeatherQuery {
  lat: number;
  lng: number;
  startDate: string;
  days: number;
  today: string;
}

export type WeatherTool = (query: WeatherQuery) => Promise<ToolOutcome<WeatherData>>;

function average(values: number[]): number {
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
}

export function createWeatherTool(fetchImpl: FetchLike, cache = new TtlCache<WeatherData>(CACHE_TTL_MS)): WeatherTool {
  return async ({ lat, lng, startDate, days, today }) => {
    const lead = daysBetween(today, startDate);
    const useForecast = lead >= 0 && lead + days - 1 <= FORECAST_HORIZON_DAYS;
    const periodStart = useForecast ? startDate : addDays(startDate, -364);
    const periodEnd = addDays(periodStart, days - 1);
    const key = `${lat.toFixed(2)},${lng.toFixed(2)},${periodStart},${periodEnd},${useForecast}`;

    const cached = cache.get(key);
    if (cached) return { ok: true, data: cached, retrievedAt: new Date().toISOString(), cached: true };

    const params = new URLSearchParams({
      latitude: lat.toFixed(4),
      longitude: lng.toFixed(4),
      start_date: periodStart,
      end_date: periodEnd,
      daily: "temperature_2m_max,temperature_2m_min,precipitation_sum",
      timezone: "Asia/Kolkata",
    });
    const response = await fetchJson(`${useForecast ? FORECAST_URL : ARCHIVE_URL}?${params}`, fetchImpl);
    if (!response.ok) return toolFailure(response.reason, response.message);

    const parsed = dailySchema.safeParse(response.json);
    if (!parsed.success) return toolFailure("malformed", "Unexpected response shape");

    const { temperature_2m_max: highs, temperature_2m_min: lows, precipitation_sum: rain } = parsed.data.daily;
    const validHighs = highs.filter((v): v is number => v !== null && v > -60 && v < 60);
    const validLows = lows.filter((v): v is number => v !== null && v > -60 && v < 60);
    const validRain = rain.filter((v): v is number => v !== null && v >= 0 && v < 1_000);
    if (validHighs.length === 0 || validLows.length === 0) return toolFailure("malformed", "No usable temperatures");

    const data: WeatherData = {
      basis: useForecast ? "forecast" : "last-year",
      days: validHighs.length,
      avgHighC: average(validHighs),
      avgLowC: average(validLows),
      wetDays: validRain.filter((mm) => mm >= WET_DAY_MM).length,
      totalRainMm: Math.round(validRain.reduce((a, b) => a + b, 0)),
      periodStart,
      periodEnd,
    };
    cache.set(key, data);
    return { ok: true, data, retrievedAt: new Date().toISOString(), cached: false };
  };
}
