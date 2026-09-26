import { extractWithClaude, isLlmConfigured } from "@/lib/agent/llmExtractor";
import { parseRequestSchema } from "@/lib/agent/schema";
import { understandRequest } from "@/lib/agent/understand";

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "The request body must be JSON." }, { status: 400 });
  }

  const parsed = parseRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Please send your trip description as text (up to 1,200 characters)." }, { status: 400 });
  }

  const result = await understandRequest(parsed.data.text, {
    llmExtract: isLlmConfigured() ? extractWithClaude : undefined,
  });
  return Response.json(result);
}
