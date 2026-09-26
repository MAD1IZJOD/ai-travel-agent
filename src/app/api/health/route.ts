import { getLlmAssistant } from "@/lib/agent/llm";
import { getResearchTools } from "@/lib/tools";

/** Liveness and configuration summary. Reports which features are on — never keys or URLs. */
export function GET(): Response {
  return Response.json(
    {
      status: "ok",
      liveLookups: !getResearchTools().offline,
      requestAssistant: getLlmAssistant() ? "enabled" : "rules-only",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
