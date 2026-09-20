import { test, expect } from "bun:test";
import { server, db } from "../server";

const base = `http://localhost:${server.port}/api`;

test("security headers ride on API responses", async () => {
  const r = await fetch(`${base}/health`);
  expect(r.status).toBe(200);
  expect(r.headers.get("x-content-type-options")).toBe("nosniff");
  expect(r.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
  expect(r.headers.get("x-frame-options")).toBe("SAMEORIGIN");
  expect(r.headers.get("access-control-allow-origin")).toBe("*");
});

test("security headers ride on static HTML too", async () => {
  const r = await fetch(`http://localhost:${server.port}/`);
  expect(r.status).toBe(200);
  expect(r.headers.get("x-content-type-options")).toBe("nosniff");
  expect(r.headers.get("x-frame-options")).toBe("SAMEORIGIN");
});

test("static assets expose ETag and revalidate with 304", async () => {
  const first = await fetch(`http://localhost:${server.port}/dist/landing.css`);
  expect(first.status).toBe(200);
  const etag = first.headers.get("etag");
  expect(etag).toBeTruthy();
  expect(first.headers.get("cache-control")).toContain("max-age=3600");

  const second = await fetch(`http://localhost:${server.port}/dist/landing.css`, {
    headers: { "if-none-match": etag! },
  });
  expect(second.status).toBe(304);
  expect(second.headers.get("etag")).toBe(etag);

  // a mismatched validator must get the full response again
  const third = await fetch(`http://localhost:${server.port}/dist/landing.css`, {
    headers: { "if-none-match": 'W/"stale"' },
  });
  expect(third.status).toBe(200);
});

test("API keys are stored hashed, still authenticate, and are never re-disclosed", async () => {
  const username = "hashcheck_" + Date.now();

  // 1. creation returns the raw key exactly once (48 hex chars)
  const reg = await fetch(`${base}/users`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username }),
  });
  const { user } = await reg.json();
  expect(user.api_key).toMatch(/^[a-f0-9]{48}$/);

  // 2. at rest the DB holds the 64-hex digest, never the raw key
  const row = db.query("SELECT api_key FROM users WHERE username = ?").get(username) as any;
  expect(row.api_key).toMatch(/^[a-f0-9]{64}$/);
  expect(row.api_key).not.toBe(user.api_key);

  // 3. the raw key still authenticates
  const me = await fetch(`${base}/me`, {
    headers: { authorization: `Bearer ${user.api_key}` },
  });
  expect(me.status).toBe(200);

  // 4. regression: re-registering an existing username must not leak key material
  const again = await fetch(`${base}/users`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username }),
  });
  const body = await again.json();
  expect(body.created).toBe(false);
  expect(body.user.api_key).toBeUndefined();
});

test("hot-path indexes exist after migrations", () => {
  const names = new Set(
    (db.query("SELECT name FROM sqlite_master WHERE type = 'index'").all() as any[]).map(r => r.name)
  );
  expect(names.has("idx_tasks_user_archived_created")).toBe(true);
  expect(names.has("idx_transactions_user")).toBe(true);
  expect(names.has("idx_focus_user")).toBe(true);
});
