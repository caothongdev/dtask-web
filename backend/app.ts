// HTTP server composition: routing, rate limiting, CORS preflight, and
// static file serving with ETag revalidation.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { PORT, STATIC_DIR, IS_TEST, RATE_LIMIT_API_PER_MIN, RATE_LIMIT_AUTH_PER_MIN } from "./config";
import { routes } from "./routes";
import { json, securityHeaders, corsHeaders } from "./http";
import { SlidingWindowLimiter } from "./rate-limit";

// One limiter for API traffic (keyed by bearer key, falling back to client IP)
// and a stricter one for the self-registration endpoint (keyed by IP).
const apiLimiter = new SlidingWindowLimiter(60_000, RATE_LIMIT_API_PER_MIN);
const authLimiter = new SlidingWindowLimiter(60_000, RATE_LIMIT_AUTH_PER_MIN);

function tooMany(retryAfterSec: number) {
  return json(
    { error: "rate limit exceeded", retry_after_s: retryAfterSec },
    429,
    { "retry-after": String(retryAfterSec) }
  );
}

function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for") || "";
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("cf-connecting-ip") || "local";
}

// Weak ETag from size + mtime — zero extra IO, perfect for revalidation.
function etagFor(file: { size: number; lastModified: number }): string {
  return `W/"${file.size.toString(36)}-${file.lastModified.toString(36)}"`;
}

function clientHasEtag(req: Request, etag: string): boolean {
  const inm = req.headers.get("if-none-match");
  if (!inm) return false;
  const bare = etag.replace(/^W\//, "");
  return inm.split(",").map(t => t.trim()).some(t => t === etag || t === bare || t === "*");
}

function staticFileResponse(full: string, contentType: string, cacheControl: string, req: Request): Response {
  const file = Bun.file(full);
  const etag = etagFor(file);
  if (clientHasEtag(req, etag)) {
    return new Response(null, {
      status: 304,
      headers: { etag, "cache-control": cacheControl, ...securityHeaders },
    });
  }
  return new Response(file, {
    headers: { "content-type": contentType, "cache-control": cacheControl, etag, ...securityHeaders },
  });
}

export function createServer() {
  return Bun.serve({
    port: PORT,
    hostname: "0.0.0.0",
    idleTimeout: 60,                       // 60s before idle TCP connection is closed
    maxRequestBodySize: 10 * 1024 * 1024,  // 10 MB cap on POST bodies
    async fetch(req) {
      const url = new URL(req.url);

      if (req.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: {
            ...securityHeaders,
            ...corsHeaders(),
            "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
            "access-control-allow-headers": "authorization, content-type, x-dtask-user, x-btask-user",
            "access-control-max-age": "86400",
          },
        });
      }

      // Rate limiting is disabled under bun test (NODE_ENV=test) so suites
      // can hammer the API freely; the limiter logic is unit-tested directly.
      if (!IS_TEST && url.pathname.startsWith("/api/")) {
        const ip = clientIp(req);
        const auth = req.headers.get("authorization") || "";
        const key = auth.toLowerCase().startsWith("bearer ")
          ? auth.slice(7).trim() || ip
          : ip;
        const api = apiLimiter.take(key);
        if (!api.allowed) return tooMany(api.retryAfterSec);
        if (req.method === "POST" && url.pathname === "/api/users") {
          const authLimit = authLimiter.take(ip);
          if (!authLimit.allowed) return tooMany(authLimit.retryAfterSec);
        }
      }

      for (const r of routes) {
        if (r.method !== req.method) continue;
        const m = url.pathname.match(r.path);
        if (m) return r.handler(req, m);
      }

      if (req.method === "GET") {
        // Root / and /landing serve landing.html
        if (url.pathname === "/" || url.pathname === "/landing" || url.pathname === "/landing/") {
          const landingPath = join(STATIC_DIR, "landing.html");
          if (existsSync(landingPath)) {
            return staticFileResponse(landingPath, "text/html", "no-cache", req);
          }
        }

        // /app serves the main gamified task dashboard SPA (index.html)
        if (url.pathname === "/app" || url.pathname === "/app/") {
          const idxPath = join(STATIC_DIR, "index.html");
          if (existsSync(idxPath)) {
            return staticFileResponse(idxPath, "text/html", "no-cache", req);
          }
        }

        let p = url.pathname === "/" ? "/index.html" : url.pathname;
        // public board at /u/<username>
        const uMatch = url.pathname.match(/^\/u\/([a-z0-9_-]+)\/?$/);
        if (uMatch) {
          const publicPath = join(STATIC_DIR, "public.html");
          if (existsSync(publicPath)) {
            return staticFileResponse(publicPath, "text/html", "no-cache", req);
          }
        }
        const full = join(STATIC_DIR, p);
        if (existsSync(full)) {
          const file = Bun.file(full);
          const isHtml = p.endsWith(".html");
          // Content-hashed bundle output can be cached hard; everything else
          // revalidates quickly. HTML = no-cache so updates roll out fast.
          const cacheControl = isHtml
            ? "no-cache"
            : p.startsWith("/dist/")
              ? "public, max-age=3600, must-revalidate"
              : "public, max-age=300";
          return staticFileResponse(full, isHtml ? "text/html" : (file.type || "application/octet-stream"), cacheControl, req);
        }
        const idx = join(STATIC_DIR, "index.html");
        if (existsSync(idx)) return staticFileResponse(idx, "text/html", "no-cache", req);
      }

      return json({ error: "not found" }, 404);
    },
  });
}
