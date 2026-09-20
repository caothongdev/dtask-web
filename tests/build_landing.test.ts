import { test, expect } from "bun:test";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

test("Task 4: Landing page source entrypoints exist", () => {
  expect(existsSync(join(process.cwd(), "src/landing/main.tsx"))).toBe(true);
  expect(existsSync(join(process.cwd(), "src/landing/landing.css"))).toBe(true);
  expect(existsSync(join(process.cwd(), "scripts/build-landing.ts"))).toBe(true);
});

test("Task 4: Bun bundle build outputs public/dist/landing.js and css", async () => {
  const proc = Bun.spawnSync(["bun", "run", "build:landing"]);
  expect(proc.exitCode).toBe(0);

  const jsPath = join(process.cwd(), "public/dist/landing.js");
  const cssPath = join(process.cwd(), "public/dist/landing.css");
  const htmlPath = join(process.cwd(), "public/landing.html");

  expect(existsSync(jsPath)).toBe(true);
  expect(existsSync(cssPath)).toBe(true);
  expect(existsSync(htmlPath)).toBe(true);

  expect(statSync(jsPath).size).toBeGreaterThan(1000);
  expect(statSync(cssPath).size).toBeGreaterThan(500);

  const html = readFileSync(htmlPath, "utf-8");
  expect(html).toContain('id="root"');
  expect(html).toContain("dist/landing.js");
  expect(html).toContain("dist/landing.css");
});
