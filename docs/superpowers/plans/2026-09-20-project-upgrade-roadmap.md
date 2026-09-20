# dtask-web — Project Upgrade Roadmap (2026-09-20)

Status: Phases 1, 3, 4 SHIPPED (incl. full Tailwind v4 cutover for landing, /app SPA and
/u public profile). Phase 2 (ops & reliability) is the next phase.
Baseline: backend modularized + hardened (`b09fb23`), 132 tests / 23 files green, repo
public with CI, zero Play-CDN Tailwind anywhere in the repo.

## Phase 1 — Repo & docs hygiene  `[quick win, ~half a session]`

- [x] **README refresh**: backend architecture section (backend/ module map), env-var table
      (`DTASK_PORT`, `DTASK_DB`, `DTASK_CORS_ORIGIN`, `DTASK_RATE_LIMIT_PER_MIN`,
      `DTASK_AUTH_LIMIT_PER_MIN`), correct test counts, CI badge + Discussions link.
- [x] **`.env.example`** listing every knob with safe defaults.
- [x] **LICENSE** — MIT chosen by owner (2026 caothongdev).
- [x] **GitHub polish**: description + topics (`bun`, `sqlite`, `gamification`, `productivity`,
      `task-manager`, `sse`, `rpg`) via `gh repo edit`.

## Phase 2 — Ops & reliability  `[NEXT — protects the hosted instance]`

Goal: nothing user-visible changes; the hosted instance at dtask.hoangkaothong.com gains
recoverability, repeatable deploys, and observability. Every item is independently
shippable; acceptance criteria in brackets.

- [ ] **SQLite backups** — `scripts/backup-db.sh`:
      1. `VACUUM INTO` to a timestamped file (consistent snapshot under WAL, no lock).
      2. Retention: keep 7 daily + 4 weekly, prune older on each run.
      3. Restore drill documented in README (`sqlite3 restore < snapshot` + integrity
         `PRAGMA integrity_check`).
      4. Cron example (`0 */6 * * *`) in README; optional litestream section for S3 offsite.
      [Accept: a fresh clone + script run produces a restorable snapshot; restore drill
      documented and exercised once locally.]
- [ ] **Dockerfile + compose** — multi-stage:
      1. `oven/bun:1.4.1` base (matches the CI/engines pin), `bun install --production`.
      2. Runtime stage on `oven/bun:1.4.1-slim`; non-root user; `EXPOSE $DTASK_PORT`.
      3. `/data` volume for `DTASK_DB`; healthcheck hits `/api/health`.
      4. `compose.yaml` with the healthcheck + volume wired, `.dockerignore` for
         `node_modules`, `db.sqlite*`, `.git`.
      [Accept: `docker compose up` serves `/` and `/app` with health passing; DB persists
      across `down`/`up`.]
- [ ] **Structured request logging** — one middleware in `backend/app.ts`:
      1. Log line per request: method, path, status, duration_ms (and key id prefix, never
         the raw key).
      2. `DTASK_LOG_FORMAT=json|text` knob, default `text`; `json` for log shippers.
      3. Skip `/api/health` noise (or sample it) to keep logs readable.
      [Accept: tests for both formats; default output stays quiet in dev.]
- [ ] **Health enrichment** — `/api/health` returns db size bytes + schema version
      (from `PRAGMA user_version` / migration table), **no** user counts or PII.
      [Accept: response schema documented in README; still returns 200 with no DB rows.]

## Phase 3 — Frontend upgrades

- [x] **Tailwind 3.4 → v4** for the landing build: CSS-first `@theme` config, scoped
      sources, `shadow-sm`→`shadow-xs` rename, guarded by a class-coverage test
      (`tests/landing_css_coverage.test.ts`).
- [x] **Tailwind v4 for the /app SPA** (was: Play CDN runtime JIT, ~300 KB script, no
      offline CSS): compiled `public/css/app.css` → `dist/app.css` with the full
      "Blueprint Silicon" token set, v3→v4 compat shims (bare `rounded` = 0.5rem
      preserved via unlayered override; legacy custom CSS carried verbatim), plus
      `tests/app_css_coverage.test.ts` — a static extractor that fails the build if any
      class used by `index.html`/`public/js` is missing from the compiled CSS (replaces
      what the CDN's runtime JIT used to guarantee).
- [x] **Tailwind v4 for the /u public profile** (was: second Play CDN config): compiled
      `public/css/public.css` → `dist/public.css`, dark "Neutrals for Balance" tokens,
      strict 0-radius design rule preserved (`* { border-radius: 0 !important }`),
      dead `shadow-card` documented rather than invented.
- [x] **PWA for /app**: generated PNG icons (zero-dep PNG encoder in
      `scripts/gen-icons.ts`), manifest with `/app` start_url + maskable icon,
      service worker (`public/sw.js` — network-first HTML, cache-first static,
      `/api` never cached, v2 precache includes both compiled stylesheets), tested in
      `tests/pwa.test.ts`.
- [x] **Accessibility pass**: global `:focus-visible` ring, FAQ accordion
      `aria-controls`/`role=region`/`aria-labelledby` wiring, footnote contrast bump.

## Phase 4 — Test & quality expansion

- [x] **SPA core unit tests**: `api.js` fetch client (auth headers, error shapes, token
      persistence) and `store.js` (event bus, SSE task upserts, timers, loadAll) —
      `tests/spa_core.test.ts` with localStorage/fetch shims.
- [x] **CSS coverage guardrails**: landing + SPA + public profile extractors keep compiled
      Tailwind honest without a browser.
- [x] **Load script**: `scripts/load-test.ts` — N concurrent users, register → CRUD →
      focus → stats, latency percentiles; smoke-verified (55 req, 0 failures, p95 48 ms).
- [x] **CI addition**: upload `public/dist` artifact on main builds for deploy diffing.

## Phase 5 — Product features  `[needs product decisions — one decision each]`

Ordered by user value / implementation risk. Each starts with a decision to confirm.

- [ ] **Recurring tasks** (biggest value, biggest surface):
      1. Schema: `tasks recurrence TEXT NULL` — `daily` | `weekly:1,3,5` (cron-lite).
      2. Engine: on task done, if recurrence set → spawn next occurrence with shifted
         `date`/`at` (server-side, in the same transaction as completion).
      3. UI: recurrence picker in task add/edit (chips: none/daily/weekly-days);
         timeline shows the spawned instances.
      4. Migration: idempotent `ALTER TABLE ... ADD COLUMN recurrence TEXT`.
      [Decision: does completing a recurring task award full XP/coins every time, or a
      decayed amount for repeats within 24h?]
- [ ] **Completion webhooks** (small, high delight):
      1. `user_settings.webhook_url TEXT` (per-user, set via profile view).
      2. Server fires POST on task-done / coin-earn / level-up events with a shared
         compact payload; Discord/Telegram-compatible JSON.
      3. Fire-and-forget with 3s timeout; failures logged, never block the request.
      [Decision: which events ship in v1 — task-done only, or all three?]
- [ ] **API versioning**:
      1. `/api/v1/*` route alias (same handlers, version-aware rate-limit bucket).
      2. OpenAPI spec generated from the existing route table into `docs/openapi.json`
         in CI; rendered at `/api/docs` (static HTML, no new deps).
      [Decision: freeze current `/api/*` as-is (alias only) or deprecate header?]
- [ ] **i18n groundwork**:
      1. Extract landing copy to `src/landing/locales/en.ts` map; components read keys.
      2. `<html lang>` driven by a `?lang=` query + cookie; only `en` shipped.
      [Decision: is i18n actually wanted, or is the audience English-only? If English-only,
      drop this item.]

## Execution order

1 ✓ → 4 ✓ → 3 ✓ → **2 (next)** → 5.

Phase 2 is the only remaining non-product phase and protects real user data (backups)
and deployability (Docker). Phase 5 items each need one product decision before coding;
recommended first pick is **recurring tasks** with the XP-decay question answered.

**Outcome:** 1 ✓, 4 ✓, 3 ✓ shipped (v4 cutover complete for landing + SPA + public
profile); Phase 2 (backups/Docker/logging/health) is next; Phase 5 awaits decisions.
