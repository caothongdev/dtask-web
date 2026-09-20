import { test, expect } from "bun:test";
import { server } from "../server";

test("Task 6: E2E landing page serves at /, links to /app, and loads all assets", async () => {
  // 1. Root Landing HTML
  const landingRes = await fetch(`http://localhost:${server.port}/`);
  expect(landingRes.status).toBe(200);
  const landingHtml = await landingRes.text();
  expect(landingHtml).toContain("Master your daily workflow");
  expect(landingHtml).toContain('href="/app"'); // CTA navigates to main app

  // 2. CSS Bundle
  const cssRes = await fetch(`http://localhost:${server.port}/dist/landing.css`);
  expect(cssRes.status).toBe(200);
  expect(cssRes.headers.get("content-type")).toContain("css");

  // 3. JS Bundle
  const jsRes = await fetch(`http://localhost:${server.port}/dist/landing.js`);
  expect(jsRes.status).toBe(200);
  expect(jsRes.headers.get("content-type")).toContain("javascript");

  // 4. App route at /app
  const appRes = await fetch(`http://localhost:${server.port}/app`);
  expect(appRes.status).toBe(200);
  const appHtml = await appRes.text();
  expect(appHtml).toContain("dtask");

  // 5. Existing App health
  const healthRes = await fetch(`http://localhost:${server.port}/api/health`);
  expect(healthRes.status).toBe(200);
  const health = await healthRes.json();
  expect(health.status).toBe("ok");
});
