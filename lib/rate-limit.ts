/**
 * Minimal in-memory sliding-window rate limiter, per key (IP).
 * Good enough for a single-instance demo; not shared across serverless
 * instances, which is acceptable here because the model loop itself is
 * bounded and the database role is read-only.
 */

export interface RateLimiter {
  /** Returns whether the call is allowed and when the window resets. */
  check(key: string, now?: number): { allowed: boolean; retryAfterMs: number };
}

export function createRateLimiter(
  limit: number,
  windowMs: number,
): RateLimiter {
  const hits = new Map<string, number[]>();

  return {
    check(key, now = Date.now()) {
      const since = now - windowMs;
      const recent = (hits.get(key) ?? []).filter((t) => t > since);
      if (recent.length >= limit) {
        hits.set(key, recent);
        return { allowed: false, retryAfterMs: recent[0]! + windowMs - now };
      }
      recent.push(now);
      hits.set(key, recent);
      // Opportunistic cleanup so the map does not grow forever.
      if (hits.size > 10_000) {
        for (const [k, v] of hits) {
          if (v.every((t) => t <= since)) hits.delete(k);
        }
      }
      return { allowed: true, retryAfterMs: 0 };
    },
  };
}
