import { test, expect } from "bun:test";
import { server } from "../server";

const base = `http://localhost:${server.port}`;

test("manifest is served as JSON with /app start_url and PNG icons", async () => {
  const res = await fetch(`${base}/manifest.json`);
  expect(res.status).toBe(200);
  const manifest = await res.json();
  expect(manifest.start_url).toBe("/app");
  expect(manifest.display).toBe("standalone");
  const pngIcons = manifest.icons.filter((i: any) => i.type === "image/png");
  expect(pngIcons.length).toBeGreaterThanOrEqual(2);
  expect(pngIcons.some((i: any) => i.purpose === "maskable")).toBe(true);
});

test("service worker is served with JavaScript content type", async () => {
  const res = await fetch(`${base}/sw.js`);
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("javascript");
  const src = await res.text();
  expect(src).toContain("dtask-static-v1");
  // API traffic must never be intercepted
  expect(src).toContain("/api/");
});

test("generated PNG icons are valid and served with an image content type", async () => {
  for (const size of [192, 512]) {
    const res = await fetch(`${base}/icons/icon-${size}.png`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("image/png");
    const bytes = new Uint8Array(await res.arrayBuffer());
    // PNG signature
    expect([...bytes.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(bytes.length).toBeGreaterThan(500);
  }
});

test("app shell wires up the manifest and service worker registration", async () => {
  const res = await fetch(`${base}/app`);
  expect(res.status).toBe(200);
  const html = await res.text();
  expect(html).toContain("/manifest.json");
  expect(html).toContain("serviceWorker");
  expect(html).toContain("/sw.js");
});
