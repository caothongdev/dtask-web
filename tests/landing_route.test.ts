import { test, expect } from "bun:test";
import { server } from "../server";

test("Task 5: GET /landing returns HTTP 200 with text/html and root container", async () => {
  const res = await fetch(`http://localhost:${server.port}/landing`);
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("text/html");
  expect(res.headers.get("cache-control")).toBe("no-cache");
  const html = await res.text();
  expect(html).toContain('id="root"');
  expect(html).toContain("dist/landing.js");
});

test("Task 5: GET /landing/ (trailing slash) returns HTTP 200 with text/html and no-cache header", async () => {
  const res = await fetch(`http://localhost:${server.port}/landing/`);
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("text/html");
  expect(res.headers.get("cache-control")).toBe("no-cache");
  const html = await res.text();
  expect(html).toContain('id="root"');
  expect(html).toContain("dist/landing.js");
});

test("Task 5: GET /dist/landing.js serves the compiled bundle", async () => {
  const res = await fetch(`http://localhost:${server.port}/dist/landing.js`);
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("javascript");
});

test("Task 5: Existing SPA / still returns 200 index.html", async () => {
  const res = await fetch(`http://localhost:${server.port}/`);
  expect(res.status).toBe(200);
  const html = await res.text();
  expect(html).toContain("dtask");
});
