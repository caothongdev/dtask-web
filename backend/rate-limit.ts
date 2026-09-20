// Sliding-window rate limiter — pure, clock-injectable, no IO.
// Buckets are pruned lazily so memory stays bounded under key churn.

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
}

export class SlidingWindowLimiter {
  private hits = new Map<string, number[]>();

  constructor(
    private windowMs: number,
    private max: number,
    private maxKeys = 10_000
  ) {}

  take(key: string, now: number = Date.now()): RateLimitResult {
    const cutoff = now - this.windowMs;

    // Occasionally prune stale buckets so key churn can't grow the map forever.
    if (this.hits.size > this.maxKeys) {
      for (const [k, arr] of this.hits) {
        if (arr.length === 0 || arr[arr.length - 1] <= cutoff) this.hits.delete(k);
      }
    }

    let arr = this.hits.get(key);
    if (!arr) {
      arr = [];
      this.hits.set(key, arr);
    }
    while (arr.length && arr[0] <= cutoff) arr.shift();

    if (arr.length >= this.max) {
      const retryAfterSec = Math.max(1, Math.ceil((arr[0] + this.windowMs - now) / 1000));
      return { allowed: false, remaining: 0, retryAfterSec };
    }

    arr.push(now);
    return { allowed: true, remaining: this.max - arr.length, retryAfterSec: 0 };
  }
}
