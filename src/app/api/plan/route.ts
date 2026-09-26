import { runAgent } from "@/lib/agent/agent";
import { toIsoDate } from "@/lib/agent/dates";
import { normalizeSnapshot } from "@/lib/agent/replan";
import { planRequestSchema } from "@/lib/agent/schema";
import type { AgentEvent } from "@/lib/agent/types";
import { HttpError, assertSameOrigin, clientKey, jsonError, readJsonBody } from "@/lib/server/http";
import { logEvent, newRequestId } from "@/lib/server/log";
import { planLimiter } from "@/lib/server/rateLimit";
import { getResearchTools } from "@/lib/tools";

/** Hard ceiling on one planning run, however slow the live lookups are. */
const PLAN_DEADLINE_MS = 45_000;

/**
 * Runs the agent and streams its progress as newline-delimited JSON:
 * one `stage` event per real step, then a single `result` (or `error`).
 */
export async function POST(request: Request): Promise<Response> {
  const requestId = newRequestId();
  let body: unknown;
  try {
    assertSameOrigin(request);
    const limit = planLimiter.check(clientKey(request));
    if (!limit.allowed) {
      throw new HttpError(429, "You're planning faster than we can keep up. Try again in a moment.", { "Retry-After": String(limit.retryAfterSeconds) });
    }
    body = await readJsonBody(request);
  } catch (error) {
    const httpError = error instanceof HttpError ? error : new HttpError(400, "We couldn't read that request.");
    logEvent("warn", "plan.rejected", { requestId, status: httpError.status });
    return jsonError(httpError, requestId);
  }

  const parsed = planRequestSchema.safeParse(body);
  if (!parsed.success) {
    logEvent("warn", "plan.invalid", { requestId, issues: parsed.error.issues.length });
    return jsonError(new HttpError(400, "Some trip details are missing or out of range. Please review them and try again."), requestId);
  }

  const { constraints, previous } = parsed.data;
  const encoder = new TextEncoder();
  const started = Date.now();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const emit = (event: AgentEvent) => {
        if (!closed) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      let timer: ReturnType<typeof setTimeout> | undefined;
      const deadline = new Promise<"timeout">((resolve) => {
        timer = setTimeout(() => resolve("timeout"), PLAN_DEADLINE_MS);
      });

      try {
        const outcome = await Promise.race([
          runAgent(
            { constraints, previous: previous ? normalizeSnapshot(previous) : undefined },
            { tools: getResearchTools(), today: toIsoDate(new Date()), emit },
          ).then(() => "done" as const),
          deadline,
        ]);
        if (outcome === "timeout") {
          emit({ type: "error", message: "Planning took too long. Please try again." });
          logEvent("warn", "plan.timeout", { requestId });
        } else {
          logEvent("info", "plan.done", { requestId, replan: Boolean(previous), ms: Date.now() - started });
        }
      } catch (error) {
        logEvent("error", "plan.failed", { requestId, error: error instanceof Error ? error.name : "unknown" });
        emit({ type: "error", message: "Something went wrong while planning. Please try again." });
      } finally {
        clearTimeout(timer);
        closed = true;
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Request-Id": requestId,
    },
  });
}
