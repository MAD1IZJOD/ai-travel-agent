import { getLlmAssistant } from "@/lib/agent/llm";
import { parseRequestSchema } from "@/lib/agent/schema";
import { understandRequest } from "@/lib/agent/understand";
import { HttpError, assertSameOrigin, clientKey, jsonError, readJsonBody } from "@/lib/server/http";
import { logEvent, newRequestId } from "@/lib/server/log";
import { understandLimiter } from "@/lib/server/rateLimit";

export async function POST(request: Request): Promise<Response> {
  const requestId = newRequestId();
  try {
    assertSameOrigin(request);
    const limit = understandLimiter.check(clientKey(request));
    if (!limit.allowed) {
      throw new HttpError(429, "Too many requests. Try again in a moment.", { "Retry-After": String(limit.retryAfterSeconds) });
    }

    const parsed = parseRequestSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) throw new HttpError(400, "Please send your trip description as text (up to 1,200 characters).");

    const started = Date.now();
    const result = await understandRequest(parsed.data.text, { llm: getLlmAssistant() });
    logEvent("info", "understand.done", {
      requestId,
      ms: Date.now() - started,
      assisted: Boolean(result.assistedBy),
      blocking: result.issues.some((i) => i.severity === "blocking"),
      injectionFiltered: result.issues.some((i) => i.code === "instructions-ignored"),
    });
    return Response.json(result, { headers: { "X-Request-Id": requestId } });
  } catch (error) {
    const httpError = error instanceof HttpError ? error : new HttpError(500, "Something went wrong reading your request. Please try again.");
    logEvent(httpError.status >= 500 ? "error" : "warn", "understand.rejected", { requestId, status: httpError.status });
    return jsonError(httpError, requestId);
  }
}
