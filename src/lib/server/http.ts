import "server-only";

/**
 * Request guards shared by the API routes. Every route treats the browser as
 * untrusted: size, type and origin are checked before any parsing happens.
 */

export const MAX_BODY_BYTES = 32 * 1024;

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly headers: Record<string, string> = {},
  ) {
    super(message);
  }
}

export function jsonError(error: HttpError, requestId: string): Response {
  return Response.json({ error: error.message }, { status: error.status, headers: { ...error.headers, "X-Request-Id": requestId } });
}

/**
 * Rejects cross-site POSTs. Browsers always send `Origin` on cross-origin
 * requests, so a mismatch with our own host means another site is calling us.
 */
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) return; // Same-origin fetches from older browsers and server-to-server calls omit it.
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    if (!host || new URL(origin).host !== host) throw new HttpError(403, "Requests from other sites aren't allowed.");
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(403, "Requests from other sites aren't allowed.");
  }
}

/** Reads a JSON body with a hard size cap, without trusting Content-Length. */
export async function readJsonBody(request: Request, maxBytes = MAX_BODY_BYTES): Promise<unknown> {
  const type = request.headers.get("content-type") ?? "";
  if (!type.toLowerCase().startsWith("application/json")) throw new HttpError(415, "Send the request as JSON.");

  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw new HttpError(413, "That request is too large.");
  if (!request.body) throw new HttpError(400, "The request body is empty.");

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel();
      throw new HttpError(413, "That request is too large.");
    }
    chunks.push(value);
  }

  const text = new TextDecoder().decode(Buffer.concat(chunks));
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "The request body must be valid JSON.");
  }
}

/** Best-effort client identifier for rate limiting (behind a proxy, the first forwarded address). */
export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "local";
}
