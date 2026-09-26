/**
 * In-memory sliding-window rate limiter. Enough for a single instance; a
 * multi-instance deployment would swap this for a shared store.
 */
export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export interface RateLimiter {
  check(key: string, now?: number): RateLimitResult;
}

const MAX_TRACKED_CLIENTS = 5_000;

export function createRateLimiter(limit: number, windowMs: number): RateLimiter {
  const hits = new Map<string, number[]>();

  return {
    check(key, now = Date.now()) {
      const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
      if (recent.length >= limit) {
        hits.set(key, recent);
        return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((windowMs - (now - recent[0])) / 1000)) };
      }
      recent.push(now);
      hits.delete(key); // Re-insert so the map stays ordered by recency.
      hits.set(key, recent);
      if (hits.size > MAX_TRACKED_CLIENTS) {
        const oldest = hits.keys().next().value;
        if (oldest !== undefined) hits.delete(oldest);
      }
      return { allowed: true, retryAfterSeconds: 0 };
    },
  };
}

/** Planning runs several live lookups, so it gets a tighter budget than request parsing. */
export const planLimiter = createRateLimiter(12, 60_000);
export const understandLimiter = createRateLimiter(30, 60_000);
