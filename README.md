# btask-web

Minimalist task dashboard + JSON API, hosted at **<https://btask.hoangkaothong.com>**.

A small Bun server (`server.ts`) serves a static dashboard (`public/`) and a JSON
API. Storage is SQLite at `BTASK_DB` (default `./db.sqlite`). Designed for
multi-user use: anyone can claim a handle, get an API key, and start tracking.

## Stack

- **Backend:** Bun + bun:sqlite (single file)
- **Frontend:** vanilla HTML/CSS/JS, no build step, no framework
- **Deploy:** runs as a local process on port `BTASK_PORT` (default 8787),
  fronted by a Cloudflare tunnel (DNS `btask.hoangkaothong.com`)
- **Auth:** API-key bearer tokens, auto-issued on first request via
  `X-Btask-User: <username>` header

## Local dev

```bash
bun server.ts              # listens on 0.0.0.0:8787
BTASK_PORT=9000 bun server.ts
BTASK_DB=/tmp/x.sqlite bun server.ts
```

## API

Base URL: `https://btask.hoangkaothong.com/api`

All routes accept `Authorization: Bearer <api_key>` header.
For first-time setup, send `X-Btask-User: <username>` instead — the server
auto-creates an account and returns an API key.

### Identity

| Method | Path | Body | Description |
|---|---|---|---|
| `GET` | `/health` | — | Liveness check |
| `POST` | `/users` | `{username}` | Register / fetch by username |
| `GET` | `/me` | — | Current user info |

### Tasks

| Method | Path | Body | Description |
|---|---|---|---|
| `GET` | `/tasks?category=&status=&archived=0\|1` | — | List user's tasks |
| `POST` | `/tasks` | `{title, category, progress?, status?, time_estimate?}` | Create task |
| `PATCH` | `/tasks/:id` | any subset of `{title, category, progress, status, time_estimate, archived}` | Update |
| `DELETE` | `/tasks/:id` | — | Soft archive (use `?hard=1` to remove permanently) |
| `POST` | `/tasks/:id/done` | — | Mark done (idempotent, sets progress=100, records timestamp) |
| `POST` | `/tasks/:id/progress` | `{progress: 0–100}` | Update progress only |

Categories: `code | read | health | personal | work | maintenance`
Statuses:   `open | done | review | dev | idle | run`

### Stats

| Method | Path | Body | Description |
|---|---|---|---|
| `GET` | `/stats` | — | Totals, focus minutes, streak (days), XP, 7-day activity |
| `POST` | `/stats/focus` | `{minutes}` | Log a focus session (1–600 min) |
| `GET` | `/activity` | — | Last 7 days of activity counts |

## CLI quickstart (curl)

```bash
# 1. claim handle, get api key
KEY=$(curl -sX POST https://btask.hoangkaothong.com/api/users \
       -H 'Content-Type: application/json' \
       -d '{"username":"my-handle"}' \
     | python3 -c 'import json,sys; print(json.load(sys.stdin)["user"]["api_key"])')
echo "$KEY" > ~/.btask_key

# 2. add a task
curl -X POST https://btask.hoangkaothong.com/api/tasks \
  -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \
  -d '{"title":"Refactor auth middleware","category":"code","progress":65}'

# 3. mark done
curl -X POST https://btask.hoangkaothong.com/api/tasks/1/done \
  -H "Authorization: Bearer $KEY"

# 4. log focus
curl -X POST https://btask.hoangkaothong.com/api/stats/focus \
  -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \
  -d '{"minutes":25}'

# 5. view dashboard
open https://btask.hoangkaothong.com/
```

## CLI companion

The intended CLI is **[btask](https://github.com/caothongdev/btask)** — this
web app is the API backend it talks to.

## Endpoints

| URL | Purpose |
|---|---|
| `https://btask.hoangkaothong.com/` | Web dashboard (light + dark themes) |
| `https://btask.hoangkaothong.com/api/health` | Liveness |
| `https://btask.hoangkaothong.com/api/tasks` | Tasks CRUD |
| `https://btask.hoangkaothong.com/api/stats` | Aggregate stats |

CORS is wide-open (`*`) so any browser or CLI client can use the API.

## Layout

```
btask-web/
  server.ts              Bun server: static + API + SQLite
  public/
    index.html           Dashboard markup
    style.css            Monochrome light/dark themes
    app.js               Client logic (login, render, polling)
  db.sqlite              (gitignored — created on first run)
```

## License

Personal project, no license declared.