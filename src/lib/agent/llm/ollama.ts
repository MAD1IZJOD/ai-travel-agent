/**
 * Local-model extraction through Ollama (e.g. Qwen3 8B running on the same
 * machine). No data leaves the computer and no API key is needed.
 *
 * Uses Ollama's structured outputs (a JSON schema in `format`) and validates
 * the reply again with zod — a local model is still untrusted output.
 */
import { z } from "zod";
import type { FetchLike } from "@/lib/tools/core";
import { EXTRACTION_SYSTEM_PROMPT, extractionUserMessage, llmFieldsSchema, type LlmExtractor } from "./fields";

/** Covers a cold model load on a laptop; warm requests take a few seconds. */
const DEFAULT_TIMEOUT_MS = 25_000;
const MAX_RESPONSE_CHARS = 20_000;

const chatResponseSchema = z.object({
  message: z.object({ content: z.string().max(MAX_RESPONSE_CHARS) }),
});

const OUTPUT_SCHEMA = z.toJSONSchema(llmFieldsSchema);

export interface OllamaOptions {
  baseUrl: string;
  model: string;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}

/** Only plain http(s) URLs are accepted for the Ollama endpoint. */
export function parseOllamaBaseUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function createOllamaExtractor({ baseUrl, model, fetchImpl = (input, init) => fetch(input, init), timeoutMs = DEFAULT_TIMEOUT_MS }: OllamaOptions): LlmExtractor {
  return async (text, today) => {
    try {
      const response = await fetchImpl(`${baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(timeoutMs),
        body: JSON.stringify({
          model,
          stream: false,
          // Qwen3 is a reasoning model; extraction doesn't need its thinking pass.
          think: false,
          format: OUTPUT_SCHEMA,
          options: { temperature: 0 },
          keep_alive: "15m",
          messages: [
            { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
            { role: "user", content: extractionUserMessage(text, today) },
          ],
        }),
      });
      if (!response.ok) {
        console.warn(`[wayfare] Local model unavailable (status ${response.status})`);
        return null;
      }
      const envelope = chatResponseSchema.safeParse(await response.json());
      if (!envelope.success) return null;
      const fields = llmFieldsSchema.safeParse(JSON.parse(envelope.data.message.content));
      return fields.success ? fields.data : null;
    } catch {
      // Timeouts, connection refused (Ollama not running) and bad JSON all fall back to the rules.
      console.warn("[wayfare] Local model extraction failed");
      return null;
    }
  };
}
