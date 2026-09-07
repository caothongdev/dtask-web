# dtask-web

Gamified minimalist task dashboard + JSON API, hosted at **<https://dtask.hoangkaothong.com>**.

A high-performance Bun server (`server.ts`) serving an obsidian-styled zero-build SPA (`public/`) and a full-featured gamification REST & SSE API. Storage is SQLite at `DTASK_DB` (default `./db.sqlite`). Designed for multi-user use: anyone can claim a handle, get an API key, track tasks across 5 distinct views, earn XP/coins, level up through RPG ranks, and buy rewards.

## Stack

- **Backend:** Bun + `bun:sqlite`
- **Frontend:** Zero-build SPA (ES modules, Tailwind CDN with obsidian theme tokens, Web Audio API synthesizer, Server-Sent Events sync)
- **Deploy:** Runs as a local process on port `DTASK_PORT` (default 8787), fronted by a Cloudflare tunnel (DNS `dtask.hoangkaothong.com`)
- **Auth:** API-key bearer tokens, auto-issued on first request via `X-Dtask-User: <username>` header (with backward-compatible fallback to `X-Btask-User`)

## Local dev

```bash
bun server.ts                         # listens on 0.0.0.0:8787
DTASK_PORT=9000 bun server.ts
DTASK_DB=/tmp/custom.sqlite bun server.ts
bun test                              # runs all 10 test suites
```

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
  server.ts                  Bun server: routing, SQLite gamification engine, SSE
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
  tests/                     10 comprehensive test suites (80 tests)
```

## License

Personal project, no license declared.