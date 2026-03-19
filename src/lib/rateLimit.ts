// Simple in-memory rate limiter
// Tracks request timestamps per key (IP or route)

const buckets = new Map<string, number[]>();

export function rateLimit(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
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
