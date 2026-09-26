import { runAgent } from "@/lib/agent/agent";
import { toIsoDate } from "@/lib/agent/dates";
import { normalizeSnapshot } from "@/lib/agent/replan";
import { planRequestSchema } from "@/lib/agent/schema";
import type { AgentEvent } from "@/lib/agent/types";
import { getResearchTools } from "@/lib/tools";

/**
 * Runs the agent and streams its progress as newline-delimited JSON:
 * one `stage` event per real step, then a single `result` (or `error`).
 */
export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "The request body must be JSON." }, { status: 400 });
  }

  const parsed = planRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Some trip details are missing or out of range. Please review them and try again." }, { status: 400 });
  }

  const { constraints, previous } = parsed.data;
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: AgentEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        await runAgent(
          { constraints, previous: previous ? normalizeSnapshot(previous) : undefined },
          { tools: getResearchTools(), today: toIsoDate(new Date()), emit },
        );
      } catch (error) {
        console.error("[wayfare] planning failed", error instanceof Error ? error.message : "unknown error");
        emit({ type: "error", message: "Something went wrong while planning. Please try again." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
