// Simple in-memory rate limiter
// Tracks request timestamps per key (IP or route)

const buckets = new Map<string, number[]>();

// Prune keys whose window has fully expired (called periodically to prevent unbounded growth)
function pruneExpired(windowMs: number) {
  const now = Date.now();
  for (const [key, timestamps] of buckets) {
    if (timestamps.every((t) => now - t >= windowMs)) buckets.delete(key);
  }
}
let lastPrune = 0;

export function rateLimit(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  // Prune at most once per window to avoid O(n) on every request
  if (now - lastPrune > windowMs) { pruneExpired(windowMs); lastPrune = now; }
  const timestamps = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (timestamps.length >= maxRequests) return false;
  timestamps.push(now);
  buckets.set(key, timestamps);
  return true;
}

// Convenience: 10 requests per 10 seconds per key
export function defaultRateLimit(key: string): boolean {
  return rateLimit(key, 10, 10_000);
}
