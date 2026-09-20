// Central configuration — every knob comes from env with a sane default.
// Note: import.meta.dir here is backend/, so project-root paths go up one.
import { join } from "node:path";

function isTest() {
  return process.env.NODE_ENV === "test";
}

export const IS_TEST = isTest();

export const PORT = parseInt(
  process.env.DTASK_PORT || process.env.BTASK_PORT || (isTest() ? "0" : "8787")
);

export const DB_PATH =
  process.env.DTASK_DB ||
  process.env.BTASK_DB ||
  (isTest() ? `/tmp/dtask-test-${process.pid}.sqlite` : join(import.meta.dir, "..", "db.sqlite"));

export const STATIC_DIR = join(import.meta.dir, "..", "public");

// Allowed origins for browser clients. "*" keeps the CLI-first posture;
// set DTASK_CORS_ORIGIN to a concrete origin to lock browsers out of /api.
export const CORS_ORIGIN = process.env.DTASK_CORS_ORIGIN || "*";

// Rate limits (requests per minute). The API limiter is keyed by bearer key
// (falling back to client IP); the auth limiter throttles user-creation per IP.
export const RATE_LIMIT_API_PER_MIN = parseInt(process.env.DTASK_RATE_LIMIT_PER_MIN || "600");
export const RATE_LIMIT_AUTH_PER_MIN = parseInt(process.env.DTASK_AUTH_LIMIT_PER_MIN || "30");
