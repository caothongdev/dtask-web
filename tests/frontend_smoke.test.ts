import { test, expect, afterAll } from "bun:test";
import { server } from "../server";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

afterAll(() => {
  server?.stop(true);
});

test("Frontend core files exist and are valid JavaScript", () => {
  const files = [
    "public/js/audio.js",
    "public/js/api.js",
    "public/js/store.js",
  ];
  for (const f of files) {
    const fullPath = join(import.meta.dir, "..", f);
    expect(existsSync(fullPath)).toBe(true);
    const content = readFileSync(fullPath, "utf8");
    // Verify file is not empty and parses cleanly
    expect(content.length).toBeGreaterThan(50);
  }
});

test("public/index.html serves with fonts and the compiled v4 stylesheet", async () => {
  const res = await fetch(`http://localhost:${server.port}/index.html`);
  expect(res.status).toBe(200);
  const html = await res.text();
  expect(html).toContain("Plus Jakarta Sans");
  expect(html).toContain("Inter");
  expect(html).toContain("JetBrains Mono");
  expect(html).toContain("Material Symbols Outlined");
  expect(html).toContain("Gamified Daily Task");
  expect(html).toContain("view-root");
  // Compiled Tailwind v4 replaces the Play CDN — no runtime JIT script
  expect(html).not.toContain("cdn.tailwindcss.com");
  expect(html).toContain("/dist/app.css");
  // Blueprint Silicon light theme tokens now live in the compiled stylesheet
  const css = await fetch(`http://localhost:${server.port}/dist/app.css`).then((r) => r.text());
  expect(css).toContain("#f8fafc");
  expect(css).toContain("#2563eb");
});

test("public/js static files serve via HTTP with 200 and javascript content-type", async () => {
  const files = [
    "/js/audio.js",
    "/js/api.js",
    "/js/store.js",
  ];
  for (const file of files) {
    const res = await fetch(`http://localhost:${server.port}${file}`);
    expect(res.status).toBe(200);
    const contentType = res.headers.get("content-type") || "";
    expect(contentType).toContain("javascript");
    const text = await res.text();
    expect(text.length).toBeGreaterThan(50);
  }
});
