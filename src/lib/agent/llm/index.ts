import "server-only";
import { extractWithClaude } from "./claude";
import type { LlmAssistant } from "./fields";
import { createOllamaExtractor, parseOllamaBaseUrl } from "./ollama";

let cached: LlmAssistant | null | undefined;

/**
 * Picks the optional language-model helper for request understanding.
 *
 *   LLM_PROVIDER=ollama     → local model via Ollama (OLLAMA_MODEL, OLLAMA_BASE_URL)
 *   LLM_PROVIDER=anthropic  → Claude (ANTHROPIC_API_KEY)
 *   LLM_PROVIDER=none       → rules only
 *
 * Unset: Claude if a key is present, else a local model if OLLAMA_MODEL is set, else rules only.
 */
export function getLlmAssistant(): LlmAssistant | null {
  if (cached !== undefined) return cached;
  const provider = (process.env.LLM_PROVIDER ?? "").toLowerCase();
  const hasClaude = Boolean(process.env.ANTHROPIC_API_KEY);
  const ollamaModel = process.env.OLLAMA_MODEL;
  const ollamaUrl = parseOllamaBaseUrl(process.env.OLLAMA_BASE_URL || "http://localhost:11434");

  if ((provider === "anthropic" || (!provider && hasClaude)) && hasClaude) {
    cached = { extract: extractWithClaude, label: "Claude" };
  } else if ((provider === "ollama" || (!provider && ollamaModel)) && ollamaModel && ollamaUrl) {
    cached = { extract: createOllamaExtractor({ baseUrl: ollamaUrl, model: ollamaModel }), label: `${ollamaModel} (local)` };
  } else {
    cached = null;
  }
  return cached;
}
