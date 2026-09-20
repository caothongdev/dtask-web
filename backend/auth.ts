// Authentication: bearer/param API keys + username auto-registration.
// Keys are verified by SHA-256 digest — raw keys exist only in the response
// to the request that created them.
import { db, Q } from "./db";
import { genKey, hashApiKey } from "./keys";

export function getUser(req: Request) {
  const auth = req.headers.get("authorization") || "";
  let apiKey = "";
  if (auth.toLowerCase().startsWith("bearer ")) apiKey = auth.slice(7).trim();
  else {
    try {
      const u = new URL(req.url);
      apiKey = u.searchParams.get("api_key") || "";
    } catch {}
  }
  if (!apiKey) return null;
  return Q.getUserByKey.get(hashApiKey(apiKey)) as { id: number; username: string; is_public: number; coins: number; lifetime_earned: number; lifetime_spent: number; created_at: string } | null;
}

export function getOrCreateUser(req: Request, bodyUsername?: string): { user: any; created: boolean } | null {
  let user = getUser(req);
  if (user) return { user, created: false };
  const username = (req.headers.get("x-dtask-user") || req.headers.get("x-btask-user") || bodyUsername || "").trim().toLowerCase();
  if (!username || !/^[a-z0-9_-]{2,32}$/.test(username)) return null;
  const existing = Q.getUserByName.get(username) as any;
  if (existing) return { user: existing, created: false };
  const api_key = genKey();
  const info = Q.insertUser.run(username, hashApiKey(api_key));
  return { user: { id: info.lastInsertRowid, username, api_key, is_public: 0, coins: 0, lifetime_earned: 0, lifetime_spent: 0 }, created: true };
}
