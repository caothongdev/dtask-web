# dtask-web — Project Upgrade Roadmap (2026-09-20)

Status: Phases 1, 3, 4 SHIPPED; Phase 2 (ops) deferred.
Baseline: backend modularized + hardened (`b09fb23`), 129 tests / 22 files green, repo public with CI.

## Phase 1 — Repo & docs hygiene  `[quick win, ~half a session]`

- [x] **README refresh**: backend architecture section (backend/ module map), env-var table
      (`DTASK_PORT`, `DTASK_DB`, `DTASK_CORS_ORIGIN`, `DTASK_RATE_LIMIT_PER_MIN`,
      `DTASK_AUTH_LIMIT_PER_MIN`), correct test counts, CI badge + Discussions link.
- [x] **`.env.example`** listing every knob with safe defaults.
- [x] **LICENSE** — MIT chosen by owner (2026 caothongdev).
- [x] **GitHub polish**: description + topics (`bun`, `sqlite`, `gamification`, `productivity`,
      `task-manager`, `sse`, `rpg`) via `gh repo edit`.

## Phase 2 — Ops & reliability  `[protects the hosted instance]`

- [ ] **SQLite backups**: `scripts/backup-db.sh` using `VACUUM INTO` (consistent snapshot
      under WAL) + retention policy + restore instructions in README. Optional: litestream.
- [ ] **Dockerfile + compose**: multi-stage (bun install → slim runtime), `/data` volume for
      `DTASK_DB`, healthcheck against `/api/health`.
- [ ] **Structured request logging**: method, path, status, duration_ms per request;
      `DTASK_LOG_FORMAT=json|text` knob (off-by-default verbosity preserved).
- [ ] **Health enrichment**: db size + schema version in `/api/health` (no user counts).

## Phase 3 — Frontend upgrades

- [x] **Tailwind 3.4 → v4** for the landing build: CSS-first `@theme` config, scoped
      sources, `shadow-sm`→`shadow-xs` rename, guarded by a class-coverage test
      (`tests/landing_css_coverage.test.ts`). SPA keeps CDN tokens.
- [x] **PWA for /app**: generated PNG icons (zero-dep PNG encoder in
      `scripts/gen-icons.ts`), manifest with `/app` start_url + maskable icon,
      service worker (`public/sw.js` — network-first HTML, cache-first static,
      `/api` never cached), tested in `tests/pwa.test.ts`.
- [x] **Accessibility pass**: global `:focus-visible` ring, FAQ accordion
      `aria-controls`/`role=region`/`aria-labelledby` wiring, footnote contrast bump.

## Phase 4 — Test & quality expansion

- [x] **SPA core unit tests**: `api.js` fetch client (auth headers, error shapes, token
      persistence) and `store.js` (event bus, SSE task upserts, timers, loadAll) —
      `tests/spa_core.test.ts` with localStorage/fetch shims.
- [x] **Load script**: `scripts/load-test.ts` — N concurrent users, register → CRUD →
      focus → stats, latency percentiles; smoke-verified (55 req, 0 failures, p95 48 ms).
- [x] **CI addition**: upload `public/dist` artifact on main builds for deploy diffing.

## Phase 5 — Product features  `[needs product decisions]`

- [ ] **Recurring tasks** (daily/weekly rules) — schema + UI + timeline integration.
- [ ] **Completion webhooks** — per-user Discord/Telegram webhook on task done / coin earn.
- [ ] **API versioning** — `/api/v1` alias + generated OpenAPI spec from route table.
- [ ] **i18n groundwork** — extract landing copy to a locale map.

## Execution order recommendation

1 → 2 → 4 → 3 → 5. Phase 1 is pure documentation win on a public repo; Phase 2 protects
real user data; Phase 4 raises confidence before touching product surface in 5.

**Outcome:** 1 ✓, 4 ✓, 3 ✓ shipped; 2 (backups/Docker/logging) and 5 (product features)
remain open — Phase 2 next.
