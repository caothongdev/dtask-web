// Response helpers shared by every route. All responses carry the security
// headers; JSON additionally carries the CORS policy and no-store caching.
import { CORS_ORIGIN } from "./config";

// Applied to every response the server emits (API and static).
export const securityHeaders: Record<string, string> = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-frame-options": "SAMEORIGIN",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
};

export function corsHeaders(): Record<string, string> {
  return CORS_ORIGIN === "*"
    ? { "access-control-allow-origin": "*" }
    : { "access-control-allow-origin": CORS_ORIGIN, vary: "Origin" };
}

export function json(data: any, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      ...securityHeaders,
      ...corsHeaders(),
      ...extraHeaders,
    },
  });
}

export function err(msg: string, status = 400) {
  return json({ error: msg }, status);
}
