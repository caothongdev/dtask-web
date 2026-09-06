# Design Document: dtask-web Redesign & Gamification Engine Upgrade

**Date:** 2026-09-06  
**Status:** Approved  
**Author:** Antigravity  
**Target Repository:** `/home/caothongdev/dtask-web`  
**Reference Implementations:** `/home/caothongdev/dtask` (CLI & Core Logic), `/home/caothongdev/Downloads/stitch_dtask_gamified_task_dashboard` (Design System & UI Templates)

---

## 1. Overview & Goals

`dtask-web` is being redesigned and upgraded from a basic task dashboard into a developer-grade, gamified command dashboard based on:
1. **Design System**: The *"Neutrals for Balance"* aesthetic from Stitch (`Space Mono`, `Geist`, `JetBrains Mono`, pure obsidian `#090A0C`, 0px razor-sharp borders, btop-style segmented ASCII meters, and terminal telemetry readouts).
2. **View Architecture**: A unified Single-Page Application (SPA) with 5 interconnected views:
   - `[1] Dashboard / Tasks`
   - `[2] Daily Timeline`
   - `[3] Focus Engine (Timer)`
   - `[4] Rewards Shop & Loot`
   - `[5] Telemetry & Stats`
3. **Core Logic**: Upgrading the Bun + SQLite backend to mirror `dtask`'s RPG progression mechanics:
   - Tasks supporting time tasks (`mins`, `time_spent`), book reading (`book_title`, `page`, `pages`), and daily scheduling (`at`).
   - Experience (XP), Level progression formula ($100 + (L-1) \times 20$), and Rank titles (*Apprentice* to *Grandmaster*).
   - Coin economy with $+50$ bonus coins per level, $+10$ coins per task, and $+0.5$ coins/min for focus sessions.
   - Rewards shop catalog with timed/instant rewards, coin purchases, and transaction ledger.
   - Dual-mode timers: Focus Engine with live XP/coin accruals, and Relax Daemon countdown timer for purchased rewards.

---

## 2. Architecture & Tech Stack

### 2.1 Backend: Bun & SQLite
- **Runtime**: Bun (`server.ts`), single-process native HTTP server.
- **Database**: SQLite via `bun:sqlite` (`BTASK_DB` or `./db.sqlite`).
- **Real-Time Sync**: Server-Sent Events (SSE) via `/api/events` to broadcast task mutations, wallet changes, and focus events across open clients and CLI companions.

### 2.2 Frontend: Modular Zero-Build Vanilla SPA + Tailwind CSS
- **Styling**: Tailwind CSS configured via `tailwind.config` with the exact *Neutrals for Balance* tokens, dark mode default, zero border-radius (`roundedness: 0`), and custom typography fonts:
  - `Space Mono` for display headers, ASCII banners, and rank tags.
  - `Geist` for body copy, form inputs, and modal text.
  - `JetBrains Mono` for tabular metrics, keyboard hints, time readouts, and ASCII progress meters.
  - Google Material Symbols Outlined for iconography.
- **Client Architecture**:
  - `public/index.html`: Shell page containing the top header, navigation tabs, SPA view container, and modal dialogs.
  - `public/js/store.js`: Central reactive state manager holding current user, tasks, wallet, active timer, rewards, and SSE subscriber.
  - `public/js/api.js`: Type-safe HTTP client communicating with `/api/*`.
  - `public/js/audio.js`: Synthesizer using the native Web Audio API for zero-dependency chimes (session complete, coin tick, bell).
  - `public/js/views/`:
    - `tasks.js`: Task management, quick add, category filters, and mode dispatching.
    - `timeline.js`: 24-hour chronological timeline grid, `► NOW` marker, and mini-calendar matrix.
    - `focus.js`: Live focus engine terminal HUD, digital clock, btop ASCII fill bar, and pause/bank/complete controls.
    - `shop.js`: Rewards catalog, coin balances, custom reward creation, and transaction audit ledger.
    - `telemetry.js`: RPG level pathway, XP velocity histogram, economy meters, and streak tracker.
    - `reader.js`: Hybrid book reader modal with page stepper, reading timer, and text viewport.

---

## 3. Data Model & Database Migrations

### 3.1 SQLite Tables & Schema Migrations
An automatic non-destructive migration runner executes on server startup in `server.ts`. It queries `PRAGMA table_info` before applying `ALTER TABLE` statements:

```sql
-- 1. Users table extension
ALTER TABLE users ADD COLUMN coins INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN lifetime_earned INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN lifetime_spent INTEGER DEFAULT 0;

-- 2. Tasks table extension
ALTER TABLE tasks ADD COLUMN at TEXT;                   -- "09:00", "14:30"
ALTER TABLE tasks ADD COLUMN mins INTEGER DEFAULT 0;   -- Target duration in mins
ALTER TABLE tasks ADD COLUMN time_spent INTEGER DEFAULT 0; -- Seconds tracked
ALTER TABLE tasks ADD COLUMN book_title TEXT;
ALTER TABLE tasks ADD COLUMN book_text TEXT;
ALTER TABLE tasks ADD COLUMN page INTEGER DEFAULT 0;
ALTER TABLE tasks ADD COLUMN pages INTEGER DEFAULT 0;
ALTER TABLE tasks ADD COLUMN xp INTEGER DEFAULT 10;
ALTER TABLE tasks ADD COLUMN coins INTEGER DEFAULT 10;
ALTER TABLE tasks ADD COLUMN running_since INTEGER;
ALTER TABLE tasks ADD COLUMN prev_time_spent INTEGER;
ALTER TABLE tasks ADD COLUMN prev_page INTEGER;
ALTER TABLE tasks ADD COLUMN prev_progress INTEGER;

-- 3. Rewards table
CREATE TABLE IF NOT EXISTS rewards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER, -- NULL for default catalog, user_id for custom
  name TEXT NOT NULL,
  cost INTEGER NOT NULL,
  mins INTEGER DEFAULT 0,
  type TEXT CHECK(type IN ('timed', 'instant')),
  icon TEXT DEFAULT '🎁',
  created_at TEXT DEFAULT (datetime('now'))
);

-- 4. Transactions table
CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  type TEXT CHECK(type IN ('earn', 'spend', 'revert')),
  amount INTEGER NOT NULL,
  reason TEXT,
  reward_id INTEGER,
  ts TEXT DEFAULT (datetime('now')),
  FOREIGN KEY(user_id) REFERENCES users(id)
);
```

### 3.2 Category & Data Migration
- Allowed categories: `learn`, `code`, `health`, `read`, `build`.
- Migration mapping for legacy databases:
  - `work` → `build`
  - `personal` → `health`
  - `maintenance` → `code`
- Default rewards pre-seeded for all users upon creation:
  1. `20 min Anime / Show` (20🪙, 20m, timed, 🍿)
  2. `Coffee & Snack Break` (15🪙, 15m, timed, ☕)
  3. `45 min Video Games` (45🪙, 45m, timed, 🎮)
  4. `15 min Social Media` (15🪙, 15m, timed, 📱)
  5. `1 Movie / 2 Episodes` (60🪙, 60m, timed, 🎬)
  6. `Cheat Meal / Treat` (100🪙, 0m, instant, 🍕)
  7. `Wishlist Item Purchase` (250🪙, 0m, instant, 🎁)

---

## 4. Gamification & Progression Mechanics

### 4.1 XP and Level Calculation
- XP required to advance from Level $L$ to $L+1$:
  $$\text{XP}_{\text{needed}}(L) = 100 + (L - 1) \times 20$$
- Rank Titles:
  - Level 1–9: **Apprentice**
  - Level 10–19: **Practitioner** / **Journeyman**
  - Level 20–29: **Adept** / **Adventurer**
  - Level 30–39: **Veteran**
  - Level 40–49: **Champion**
  - Level 50+: **Grandmaster**
- **Level-Up Bonus**: Advancing a level automatically deposits $+50$ bonus coins into `users.coins` and logs an `earn` entry in `transactions`.

### 4.2 Economy Accrual & Reversion Rules
- Task completion:
  - If `mins` set: ensures `time_spent = mins * 60`.
  - If `pages` set: ensures `page = pages`.
  - Marks `status = 'done'`, `progress = 100`.
  - Awards `xp` (default $+10$) and `coins` (default $+10$).
- Task reopening:
  - Restores previous `time_spent`, `page`, and `progress`.
  - Reverts awarded `xp` and `coins`, recording a `revert` transaction.
- Focus sessions:
  - Logging focus session (`POST /api/stats/focus`) awards $+1$ XP per minute and $+1$ coin per 2 minutes ($+0.5$ coins/min).

---

## 5. API Endpoints Specification

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Healthcheck & system telemetry |
| `POST` | `/api/users` | Register / login user by username |
| `GET` | `/api/me` | Current user info, wallet summary, rank, and XP progress |
| `PATCH` | `/api/me` | Update handle or toggle public board visibility |
| `GET` | `/api/tasks` | List tasks with filters (`category`, `status`, `at`, `q`) |
| `POST` | `/api/tasks` | Create task (`title`, `category`, `at?`, `mins?`, `book_title?`, `pages?`) |
| `PATCH` | `/api/tasks/:id` | Update task attributes |
| `DELETE` | `/api/tasks/:id` | Soft-archive or hard-delete task |
| `POST` | `/api/tasks/:id/done` | Mark task done, trigger XP & coin accrual |
| `POST` | `/api/tasks/:id/undone` | Reopen task, safely revert XP & coins |
| `POST` | `/api/tasks/:id/timer` | Sync live timer action (`start`, `pause`, `bank`) |
| `POST` | `/api/tasks/:id/book` | Update reading progress (`page`, `pages`, `book_text?`) |
| `GET` | `/api/timeline` | Get chronological slots, active task, and next upcoming task |
| `GET` | `/api/rewards` | List available rewards and current lock status |
| `POST` | `/api/rewards` | Add custom reward (`name`, `cost`, `mins`, `type`, `icon`) |
| `POST` | `/api/rewards/:id/buy` | Purchase reward, deduct coins, trigger relax timer |
| `GET` | `/api/transactions` | Fetch coin transaction audit ledger |
| `GET` | `/api/stats` | 7-day XP velocity histogram, streaks, focus totals, rank info |
| `POST` | `/api/stats/focus` | Log completed focus session minutes |
| `GET` | `/api/events` | SSE real-time event stream |
| `GET` | `/u/:username` | Public read-only profile dashboard |

---

## 6. Frontend View Architecture & Stitch Design

### 6.1 Design Tokens & CSS Styling
- **Base Canvas**: Pure Obsidian (`#090A0C`), Void Black (`#000000`), Tonal Surface (`#121315`).
- **Borders**: Razor-straight 0px radius, 1px solid `rgba(255, 255, 255, 0.08)`.
- **Accents**: Crisp Off-White (`#F4F4F0`), Stone Cream (`#D8D2C6`), Slate Gray (`#6B7280`).
- **Interactive State**: Active nav tabs and buttons highlighted with crisp contrast and subtle occlusion shadows (`0 16px 32px rgba(0, 0, 0, 0.85)`).

### 6.2 The 5 Views
1. **[1] Dashboard / Tasks**:
   - Quick Add command bar with category select, `--at` time picker, `--mins` duration input, or book tracker.
   - Filter chips: `all`, `open`, `done`, and search filter.
   - Mode-specific cards:
     - **Time Tasks**: displays target minutes, elapsed time, and interactive start/resume button.
     - **Book Tasks**: displays current page vs total, quick stepper buttons (`+1`, `-1`), and `[Read]` modal trigger.
     - **Check Tasks**: instant toggle checkbox.
2. **[2] Daily Timeline**:
   - 24-hour vertical timeline grid.
   - Dynamic `► NOW` marker highlighting the current system time.
   - Mini ASCII calendar matrix (SU MO TU WE TH FR SA) with day navigation (`◀ TODAY ▶`).
   - Category slot filters and daily allocation quotas (`5.5h / 8.0h`).
3. **[3] Focus Engine (Timer)**:
   - High-contrast digital clock (`22:08 / 60:00`) with flow-state pulse indicator.
   - Signature btop segmented ASCII fill bar (`██████████░░░░░░░░`).
   - XP reward pipeline card and Coin ledger accrual card.
   - Control triggers: `[Space] Pause`, `[Enter] Mark Complete Now`, `[Ctrl+C / Esc] Stop & Bank`.
   - Guilt-Free Break switch and instant jump to Relax Timer.
4. **[4] Rewards Shop & Loot**:
   - Rewards cards showing cost in coins 🪙, type (`timed` vs `instant`), and duration badges.
   - Unlocked vs. Locked styling (locked items show `[LOCKED] Need X more coins`).
   - `[BUY]` triggers coin deduction, ledger audit entry, and instant spin-up of the relax countdown timer.
   - Custom reward creation drawer and recent transaction feed.
5. **[5] Telemetry & Stats**:
   - RPG tier progression banner (`Apprentice → Practitioner → Adept → Champion → Grandmaster`).
   - Segmented Experience Buffer meter showing progress toward the next level threshold.
   - 7-day XP velocity histogram chart with hover details.
   - Wallet economy metrics (Current Balance, Lifetime Earned, Lifetime Spent) and category distribution.
6. **Hybrid Book Reader Modal**:
   - Fullscreen or centered reading window with current page, page jumper, text display area, reading timer, and finish chapter button.

---

## 7. Keyboard Shortcuts & Accessibility

- `1` – `5`: Switch between views (`[1] Tasks` through `[5] Telemetry`).
- `Space`: Pause / Resume active timer in the Focus Engine.
- `Enter`: Instant mark complete for active focus task.
- `Escape`: Cancel / Stop and bank active session.
- `A`: Focus quick-add input bar on the Dashboard.

---

## 8. Verification & Test Plan

- **Automated Tests (`tests/dtask_upgrade.test.ts`)**:
  1. *Database Migration*: Verify migration of legacy databases, creation of new columns, and category remapping.
  2. *Level Curve & Rank*: Validate XP required per level and correct rank string assignment.
  3. *Wallet & Economics*: Test task completion rewards, level-up $+50$ coin bonus, task reopening deduction, and shop item purchasing.
  4. *Timeline Scheduling*: Validate chronological ordering of scheduled tasks and active slot detection.
  5. *API Endpoints*: Test all new REST endpoints with Bearer auth and `X-Btask-User`.
- **E2E & Visual Verification**:
  - Run Bun server on port 8787 and verify static file serving.
  - Test view transitions across all 5 screens.
  - Verify timer persistence across view switching.
  - Test audio synth playback on task completion and level-up.
