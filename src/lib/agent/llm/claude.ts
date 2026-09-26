import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { EXTRACTION_SYSTEM_PROMPT, extractionUserMessage, llmFieldsSchema, type LlmExtractor } from "./fields";

/** Claude-assisted extraction. Only used when ANTHROPIC_API_KEY is set on the server. */

const REQUEST_TIMEOUT_MS = 8_000;

export const extractWithClaude: LlmExtractor = async (text, today) => {
  const client = new Anthropic({ timeout: REQUEST_TIMEOUT_MS, maxRetries: 1 });
  try {
    const response = await client.messages.parse({
      model: process.env.ANTHROPIC_MODEL || "claude-opus-5",
      max_tokens: 4_000,
      output_config: { effort: "low", format: zodOutputFormat(llmFieldsSchema) },
      system: EXTRACTION_SYSTEM_PROMPT,
      messages: [{ role: "user", content: extractionUserMessage(text, today) }],
    });
    if (response.stop_reason === "refusal") return null;
    return response.parsed_output ?? null;
  } catch (error) {
    // Any API failure falls back to the rule-based result; never surface provider details.
    if (error instanceof Anthropic.APIError) {
      console.warn(`[wayfare] Claude extraction unavailable (status ${error.status ?? "n/a"})`);
    } else {
      console.warn("[wayfare] Claude extraction failed");
    }
    return null;
  }
};
