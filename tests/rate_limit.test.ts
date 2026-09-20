import { test, expect } from "bun:test";
import { SlidingWindowLimiter } from "../server";

test("limiter allows up to max requests then denies with a retry-after", () => {
  const limiter = new SlidingWindowLimiter(60_000, 3);
  const t0 = 1_000_000;

  expect(limiter.take("k", t0).allowed).toBe(true);
  expect(limiter.take("k", t0 + 1).allowed).toBe(true);
  expect(limiter.take("k", t0 + 2).allowed).toBe(true);
  expect(limiter.take("k", t0 + 2).remaining).toBe(0);

  const denied = limiter.take("k", t0 + 3);
  expect(denied.allowed).toBe(false);
  expect(denied.retryAfterSec).toBeGreaterThan(0);

  // different keys are isolated
  expect(limiter.take("other", t0 + 4).allowed).toBe(true);
});

test("limiter lets requests through again once they age out of the window", () => {
  const limiter = new SlidingWindowLimiter(60_000, 2);
  const t0 = 2_000_000;

  limiter.take("k", t0);
  limiter.take("k", t0 + 1000);
  expect(limiter.take("k", t0 + 2000).allowed).toBe(false);

  // past the window, the earliest hits expire and capacity returns
  const back = limiter.take("k", t0 + 60_001);
  expect(back.allowed).toBe(true);
  expect(back.retryAfterSec).toBe(0);
});
