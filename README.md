# dtask-web

[![CI](https://github.com/caothongdev/dtask-web/actions/workflows/ci.yml/badge.svg)](https://github.com/caothongdev/dtask-web/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE) [![Discussions](https://img.shields.io/badge/Discussions-join%20us-blue)](https://github.com/caothongdev/dtask-web/discussions)

Gamified minimalist task dashboard + JSON API, hosted at **<https://dtask.hoangkaothong.com>**.

A high-performance modular Bun server (entry: `server.ts`, implementation in [`backend/`](#project-structure)) serving an obsidian-styled zero-build SPA (`public/`) and a full-featured gamification REST & SSE API. Storage is SQLite at `DTASK_DB` (default `./db.sqlite`) with hashed API keys at rest and per-key rate limiting. Designed for multi-user use: anyone can claim a handle, get an API key, track tasks across 5 distinct views, earn XP/coins, level up through RPG ranks, and buy rewards.

Questions, feedback, and roadmap talk: [GitHub Discussions](https://github.com/caothongdev/dtask-web/discussions).

## Stack

- **Backend:** Bun + `bun:sqlite`
- **Frontend:** Zero-build SPA (ES modules, compiled Tailwind v4 stylesheets for the app, public profile, and landing, Web Audio API synthesizer, Server-Sent Events sync)
- **Deploy:** Runs as a local process on port `DTASK_PORT` (default 8787), fronted by a Cloudflare tunnel (DNS `dtask.hoangkaothong.com`)
- **Auth:** API-key bearer tokens, auto-issued on first request via `X-Dtask-User: <username>` header (with backward-compatible fallback to `X-Btask-User`)

## Local dev

```bash
bun server.ts                         # listens on 0.0.0.0:8787
DTASK_PORT=9000 bun server.ts
DTASK_DB=/tmp/custom.sqlite bun server.ts
bun test                              # runs the full suite (22 files, 129 tests)
```

### Environment variables

See [.env.example](.env.example) for a copy-paste starting point.

| Variable | Default | Description |
|---|---|---|
| `DTASK_PORT` | `8787` | HTTP listen port (legacy `BTASK_PORT` accepted) |
| `DTASK_DB` | `./db.sqlite` | SQLite database file (WAL mode enabled) |
| `DTASK_CORS_ORIGIN` | `*` | Allowed origin for browser clients; set your site origin to lock `/api` to same-origin |
| `DTASK_RATE_LIMIT_PER_MIN` | `600` | API requests per minute per bearer key (IP fallback) |
| `DTASK_AUTH_LIMIT_PER_MIN` | `30` | Per-IP limit for `POST /api/users` self-registration |

## 5 Application Views

1. **`[1] Dashboard / Tasks` (`#tasks`)**: Quick add command bar (`--mins 25`, `--at 14:00`, `--book`), category filters, search bar, mode cards (Timer, Book reader, Standard check), and in-place task edit modal.
2. **`[2] Daily Timeline` (`#timeline`)**: 24-hour visual schedule grid, category quotas, active slot banner, interactive slot scheduler, mini ASCII calendar matrix, and live-moving `► NOW` marker line.
3. **`[3] Focus Engine` (`#focus`)**: Live focus daemon with btop segmented ASCII meters, XP & coin accrual cards, auto-break handover, Relax Daemon cooldown mode with ambient warm glow, and hotkeys (`[Space]`, `[Enter]`, `[Ctrl+C]`, `[Shift+Tab]`).
4. **`[4] Rewards Shop` (`#shop`)**: RPG economy catalog with live coin purchasing, cooldown unlock timers, custom reward creation drawer, and real-time transaction audit ledger.
5. **`[5] Telemetry & Stats` (`#stats`)**: RPG rank progression pathway (Apprentice → Practitioner → Adept → Champion → Grandmaster), EXP buffer gauge, 7-day XP velocity histogram bar chart, and category time allocation breakdown.

## API

Base URL: `https://dtask.hoangkaothong.com/api` (or `http://localhost:8787/api`)

All routes accept `Authorization: Bearer <api_key>` or `X-Dtask-User: <username>`.

### Identity & Wallet

| Method | Path | Body | Description |
|---|---|---|---|
| `GET` | `/health` | — | Service liveness, version, and uptime |
| `POST` | `/users` | `{"username":"..."}` | Register / login by username |
| `GET` | `/me` | — | Current user, wallet (coins, lifetime earned/spent), and level info |
| `PATCH` | `/me` | `{"username":"...", "is_public":0\|1}` | Update profile or toggle public board visibility |
| `GET` | `/u/:username` | — | Public profile view and task board (requires `is_public=1`) |
| `GET` | `/events` | — | Server-Sent Events (SSE) live push stream |

### Tasks & Modes

| Method | Path | Body | Description |
|---|---|---|---|
| `GET` | `/tasks?category=&status=&archived=0\|1&q=` | — | Filter and search tasks |
| `POST` | `/tasks` | `{title, category, progress?, status?, at?, mins?, book_title?, pages?}` | Create task |
| `PATCH` | `/tasks/:id` | `{title?, category?, progress?, status?, at?, mins?, book_title?, pages?, page?, archived?}` | Update task properties |
| `DELETE` | `/tasks/:id` | — | Soft archive task (`?hard=1` to permanently delete) |
| `POST` | `/tasks/:id/done` | — | Mark task complete (+XP and coins awarded based on mode and time) |
| `POST` | `/tasks/:id/undone` | — | Reopen completed task (reverts XP/coin grants) |
| `POST` | `/tasks/:id/timer` | `{"action":"start"\|"stop"}` | Start or stop task timer; banks elapsed time and awards XP/coins |
| `POST` | `/tasks/:id/book` | `{"action":"page"\|"read", "page"?:num, "pages_read"?:num, "mins"?:num}` | Advance reader page or log read session |
| `GET` | `/timeline` | — | 24-hour timeline slots and scheduled task items |

### Rewards & Economy

| Method | Path | Body | Description |
|---|---|---|---|
| `GET` | `/rewards` | — | List catalog of active rewards |
| `POST` | `/rewards` | `{"title":"...", "cost":50, "icon":"☕", "cooldown_mins":60}` | Create custom reward item |
| `POST` | `/rewards/:id/buy` | — | Purchase reward (deducts coins, creates transaction, sets cooldown) |
| `GET` | `/transactions` | — | Audit feed of all coin earnings and reward redemptions |

### Stats & Activity

| Method | Path | Body | Description |
|---|---|---|---|
| `GET` | `/stats` | — | Totals, focus minutes, streak, XP, level info, 7-day activity |
| `POST` | `/stats/focus` | `{"minutes":25}` | Log standalone focus session (+XP and coins) |
| `GET` | `/activity` | — | Last 7 days of daily activity counts |

## CLI Quickstart (curl)

```bash
# 1. Claim handle and get api key
KEY=$(curl -sX POST https://dtask.hoangkaothong.com/api/users \
       -H 'Content-Type: application/json' \
       -d '{"username":"my-handle"}' \
     | python3 -c 'import json,sys; print(json.load(sys.stdin)["user"]["api_key"])')
echo "$KEY" > ~/.dtask_key

# 2. Add a timed task scheduled for 14:00
curl -X POST https://dtask.hoangkaothong.com/api/tasks \
  -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \
  -d '{"title":"Implement audio synth","category":"code","at":"14:00","mins":45}'

# 3. Mark done (awards XP + coins)
curl -X POST https://dtask.hoangkaothong.com/api/tasks/1/done \
  -H "Authorization: Bearer $KEY"

# 4. Purchase a reward
curl -X POST https://dtask.hoangkaothong.com/api/rewards/1/buy \
  -H "Authorization: Bearer $KEY"

# 5. Open dashboard
open https://dtask.hoangkaothong.com/
```

## CLI Companion

The companion command-line client is **[dtask](https://github.com/caothongdev/dtask)**.

## Project Structure

```
dtask-web/
  server.ts                  Entry point: composes backend/, re-exports the public API
  backend/
    config.ts                Env-driven knobs (port, paths, CORS, rate limits)
    db.ts                    SQLite connection, schema, migrations, prepared statements
    keys.ts                  API key generation + SHA-256 hashing
    auth.ts                  Bearer-key auth + username auto-registration
    sse.ts                   In-process pub/sub for the event stream
    gamification.ts          XP / levels / coins / streaks
    timeline.ts              Pure schedule helpers
    routes/                  Handlers grouped by domain (users, tasks, rewards, misc)
    app.ts                   Bun.serve composition (rate limiting, static, ETag)
  run.sh                     Startup wrapper
  scripts/
    dtask-supervisor.sh      Auto-healing supervisor cron
  public/
    index.html               Core SPA container (obsidian tokens, HUD, view mounts)
    public.html              Public read-only portfolio board (/u/:username)
    app.js                   Global controller, keyboard router (1-5, A, ?), modal manager
    js/
      api.js                 Fetch client, bearer token & X-Dtask-User headers
      store.js               Reactive store, background timer tickers, SSE sync
      audio.js               Zero-dependency Web Audio API synthesizer chimes
      views/
        tasks.js             [1] Tasks & command bar view
        timeline.js          [2] Daily 24h timeline view
        focus.js             [3] Live Focus Daemon & Relax Daemon view
        shop.js              [4] Rewards catalog & transaction ledger view
        telemetry.js         [5] RPG telemetry & XP velocity histogram view
        reader.js            Hybrid book reader modal
  tests/                     22 comprehensive test suites (129 tests)
```

## License

[MIT](LICENSE) — use it, fork it, build on it.