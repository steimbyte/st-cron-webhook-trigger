# Cronboard

A **local-first cron scheduler** with a **Gruvbox-themed web UI** for triggering webhooks, scripts, and shell commands on a schedule. Built as a single small Node.js process — no cloud account, no telemetry, your jobs and run history live in `~/.config/cronboard/`.

> **Status:** v0.7.1 — Schedule modal: 3×2 preset cards, native time picker, inline human description, persistent details.

---

## 🤔 Why this exists

I built this because I needed to **trigger [Langflow](https://www.langflow.org/) workflows on a cron schedule via webhook** — and there was no good local-first way to do that.

Langflow itself has no scheduler. Hosted cron services (cron-job.org, EasyCron, GitHub Actions cron, etc.) all work, but they require you to push your webhook URLs and secrets into someone else's cloud. For a workflow that's already running on **my** infrastructure (Langflow at `langflow.steimercloud.xyz`), handing the trigger to a third party felt wrong — and the third parties also charge per execution.

`st-cron-webhook-trigger` is the missing piece: a tiny cron daemon I run on my own machine that fires the webhook at the right moment. It stores everything (jobs, runs, logs) in `~/.config/cronboard/` as plain JSON, runs the schedule with Croner, and ships every webhook request with full request/response capture so I can debug failures locally without leaving the terminal.

### Concrete flow

```
┌────────────────┐      ┌───────────────────────┐      ┌─────────────────────┐
│   cronboard    │      │      Langflow         │      │  Langflow workflow   │
│  (this repo)   │ ───► │   langflow.steimer-   │ ───► │  "summarize-emails" │
│  */5 * * * *  │ POST │   cloud.xyz           │      │  (LLM chain, tools, │
│                │      │   /api/v1/webhook/…   │      │   memory, etc.)      │
└────────────────┘      └───────────────────────┘      └─────────────────────┘
        ▲                                                    │
        └──────── 200 OK / 403 / 500 (with full body) ──────┘
```

Same pattern works for any web-accessible automation: n8n, Pipedream triggers, your own FastAPI/Express/Go service, a Discord/Slack webhook, an OpenAI Assistants endpoint, a Grafana annotated event, etc. The point is: **the schedule stays on your machine, the trigger goes wherever you want**.

---

## 📸 Dashboard

![Cronboard dashboard — Gruvbox dark theme with KPI cards (active jobs, runs/24h, failures, success rate), upcoming runs list, and recent-runs table](./docs/screenshots/dashboard.png)

*Captured from a live `v0.6.0` instance with the Langflow demo job running every minute (HTTP 202 from Langflow, 100% success rate, ~150 ms per webhook).*

---

## ✨ Features

- **Visual schedule builder** — pick *Every minute / Hourly / Daily / Weekly / Monthly / Custom* in a modal with live preview of the next 5 runs. **Real calendar picker** (`react-day-picker` v9) for weekly/monthly. **Real time picker** (`react-aria-components` TimeField) for HH:MM.
- **Edit screen shows full config** — when you open an existing job, every field is pre-filled with what's actually saved, including the literal `x-api-key` and other headers.
- **"Copy as curl" button** in the editor — generates the equivalent `curl` command from the saved config and copies it to clipboard.
- **Two action types**:
  - **Webhook** — HTTP method/URL/headers/body with timeout + optional retry/backoff + per-action SSRF override.
  - **Shell** — local command with cwd + timeout + optional `allowedPaths` allowlist.
- **Honest chart statistics** — Dashboard cards with empty-state handling (no lying `100%` when no data), p50/p95/p99 latency, per-job status strip, real time-series (not a histogram masquerading as a sparkline).
- **Security hardening** — SSRF guard (denies private IPs, can be overridden per-action or globally), timing-safe bearer-token comparison, secrets redaction in bulk views, `undici` redirect-following disabled, `execArgv` sanitization, `fastify@5.9` (CVE patch).
- **Run history** — last 1000 runs with status, duration, full Request/Response/Error details.
- **Daemon mode** — `npm start` detaches with a PID file; `npm stop` sends SIGTERM with a 3-second SIGKILL fallback.
- **Local-first** — default bind `127.0.0.1`, no auth required; `--host 0.0.0.0` requires `--token`.
- **Hardened for Windows** — atomic JSON writes via temp+rename with 5× exponential-backoff retry (handles antivirus locking).
- **Full SDD governance** under `openspec/` with append-only change history.

---

## 🚀 Quick Start

```bash
git clone https://github.com/steimbyte/st-cron-webhook-trigger.git
cd st-cron-webhook-trigger
npm install                # 341 packages, ~30s

# Dev mode (Vite :5173 + tsx watch backend :3737)
npm run dev

# Production mode
npm run build              # builds the web bundle into packages/core/dist/web
npm start                  # starts the daemon on :3737 (detached)
```

Open <http://127.0.0.1:3737> in your browser. The dashboard shows your jobs, upcoming runs, recent runs, and a quick-start card with example CLI commands.

### CLI

```bash
npm start [--port 3737] [--host 127.0.0.1] [--token SECRET]
          [--data DIR] [--detach|--no-detach]
          [--allow-private-networks]                   # global SSRF override (v0.6+)

npm run stop                              # SIGTERM with 3s SIGKILL fallback
npm run status                            # pid, url, job count, recent runs
npm run logs [-n 200] [-f]                # tail the structured log file

# One-off job management (does not require a running daemon)
npm run add NAME --cron '*/5 * * * *' --url https://example.com/ping
npm run add NAME --cron '0 9 * * 1-5' --command 'backup.sh'
npm run ls
npm run rm ID_OR_NAME
npm run run ID_OR_NAME                     # manual trigger
```

Default data directory: `~/.config/cronboard/` (override via `CRONBOARD_DATA_DIR` env or `--data DIR`).

---

## 🔒 Security model

Cronboard is a **local-first, single-user, single-trust-zone** tool. The security model assumes:

- The default bind is `127.0.0.1` (no auth needed for the same machine).
- When bound to `0.0.0.0`, a `--token` is required and bearer-auth is enforced on every `/api/*` call (`crypto.timingSafeEqual` with length normalization).
- The list endpoint (`GET /api/jobs`) redacts `x-api-key` / `authorization` / `cookie` / `set-cookie` headers and bodies — it's a publishing channel (copy-pasted into chat, log forwarders, etc.).
- The single-item endpoint (`GET /api/jobs/:id`) returns the unredacted config — needed for the editor to show what was actually saved.
- The new `GET /api/jobs/:id/curl` endpoint returns the literal curl-formatted command, no masking — same trust model.
- Webhook actions go through `assertPublicUrl` which rejects private IP ranges (127/8, 10/8, 172.16/12, 192.168/16, 169.254/16, ::1, IPv4-mapped IPv6) unless the action config sets `allowPrivateNetworks: true` or the daemon is started with `--allow-private-networks`.
- The CLI's detach-spawn sanitizes `process.execArgv` to prevent `--inspect*` / `--debug*` pivot attacks.
- `jobs.json` / `runs.json` are plaintext on disk. Anyone with read access to the data dir can dump all secrets. v0.6.0+ will add at-rest encryption.

If you need a multi-user / multi-trust-zone setup, the right answer is to run cronboard inside a container or VM with strict isolation. v0.6.1+ may add per-job rate limiting and audit logs.

---

## 🏗️ Architecture

Single Node process that runs three things concurrently:

```
┌─────────────────────────────────────────────┐
│ cronboard (one Node process, optionally     │
│ detached as a daemon)                       │
│                                             │
│   ┌──────────────┐  ┌──────────────────┐     │
│   │  Croner      │  │  Fastify HTTP    │     │
│   │  Scheduler   │  │  + Static UI     │     │
│   │  - mtime cache  │  :3737            │     │
│   │  - 80ms debounce │                  │     │
│   │  - re-entry     │                  │     │
│   │    guard       │                  │     │
│   └──────┬───────┘  └────────┬─────────┘     │
│          │                   │             │
│          ▼                   ▼             │
│   ┌──────────────────────────────┐         │
│   │ JSON store (atomic writes,    │         │
│   │ EPERM retry, per-file mutex)  │         │
│   │ jobs.json / runs.json / log   │         │
│   └──────────────────────────────┘         │
│                                             │
│   Actions:  webhook (undici, SSRF-guarded)   │
│             shell (child_process exec)     │
└─────────────────────────────────────────────┘
```

### Stack

| Layer | Choice |
|---|---|
| Language | TypeScript (strict, ESM) |
| Backend | Node 20+ · Fastify 5.9 · @fastify/cors 11 · @fastify/static 8 |
| Cron | Croner (TS-native Job API) |
| HTTP client (webhooks) | undici 6 (no auto-redirect) |
| Validation | Zod |
| CLI | Commander |
| Logging | pino (structured) |
| Cron text → English | cronstrue |
| Storage | JSON files in `~/.config/cronboard/` (atomic write + Windows EPERM retry) |
| Frontend | Vite 5 · React 18 · **DaisyUI 5** (Gruvbox dark theme) · Radix Icons |
| Date picker | react-day-picker v9 |
| Time picker | react-aria-components TimeField |

---

## 📦 Storage

JSON files in `~/.config/cronboard/`:

```
~/.config/cronboard/jobs.json          # array of jobs
~/.config/cronboard/runs.json          # array of runs (capped at 1000, oldest dropped)
~/.config/cronboard/cronboard.log      # structured pino logs
~/.config/cronboard/cronboard.pid      # daemon PID + start metadata
```

Writes go through `temp file → rename()` with **5× exponential-backoff retry** (50ms → 400ms) on Windows `EPERM`/`EACCES`/`EBUSY` (the standard transient antivirus / indexer lock). Last resort falls back to direct overwrite. Reads are guarded by a per-file mutex to prevent torn writes.

---

## 📡 HTTP API

All endpoints return JSON. When bound to non-localhost, an `Authorization: Bearer <token>` header is required.

| Method | Path | Description |
|---|---|---|
| `GET`    | `/api/health` | `{ status, version, time }` |
| `GET`    | `/api/jobs` | list jobs (redacted) |
| `POST`   | `/api/jobs` | create (body: `{ name, cronExpression, timezone, enabled, actions }`) |
| `GET`    | `/api/jobs/:id` | fetch one (unredacted) |
| `PATCH`  | `/api/jobs/:id` | update |
| `DELETE` | `/api/jobs/:id` | delete (run history preserved) |
| `POST`   | `/api/jobs/:id/toggle` | flip enabled flag |
| `POST`   | `/api/jobs/:id/run` | manual trigger |
| `GET`    | `/api/jobs/:id/runs` | list runs for one job |
| `GET`    | `/api/jobs/:id/curl` | `{ curl: "..." }` or `{ shell: "..." }` |
| `GET`    | `/api/runs` | list recent runs (?jobId=, ?limit=) |
| `GET`    | `/api/runs/:id` | fetch one run with action details |
| `GET`    | `/api/cron/describe?expr=...` | human description via cronstrue |
| `GET`    | `/api/cron/next?expr=...&tz=...` | next N run times for a cron expression |
| `GET`    | `/api/stats` | overall stats (activeJobs, runs24h, successRate, p50/p95/p99, runsByHour) |
| `GET`    | `/api/jobs/:id/stats?limit=20` | per-job stats + last 20 runs |

Full request/response examples: see [`docs/API.md`](./docs/API.md).

---

## 🛠️ Development

```bash
npm install             # 341 packages, ~30s
npm run dev             # Vite :5173 + tsx watch :3737 (concurrently)
npm run build           # tsc (web) --noEmit + vite build + copy-web into core/dist/web
npm start               # tsx packages/core/src/cli.ts start (detached)
```

### Tests

```bash
node --test --import tsx packages/core/src/scheduler/cronExpr.test.ts    # 63 unit tests
node --test --import tsx packages/core/src/stats/aggregations.test.ts   # ~15 unit tests
node --test --import tsx packages/core/src/security/security.test.ts    # ~14 unit tests (SSRF + secrets)
node --test --import tsx packages/core/src/security/curl.test.ts         # ~17 unit tests (toCurl)
powershell -ExecutionPolicy Bypass -File scripts/smoke.ps1             # end-to-end (incl. S5–S8)
npm run typecheck                                                       # core + web
npm audit --omit=dev                                                    # 0 HIGH/CRITICAL expected
```

### Layout

```
st-cron-webhook-trigger/
├── package.json              # workspace root (npm workspaces)
├── tsconfig.base.json
├── openspec/                 # SDD change history (append-only)
│   ├── config.yaml          # single source of truth (rules, gates, pipeline)
│   ├── AGENTS.md             # (at root) governance mirror
│   └── changes/
│       └── archive/         # completed changes
├── packages/
│   ├── core/                 # CLI + scheduler + server + storage + actions + security helpers
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── cli.ts        # commander entry point
│   │       ├── server.ts     # Fastify app factory
│   │       ├── scheduler/    # Croner wrapper + runner
│   │       ├── store/        # JSON-file repo
│   │       ├── actions/      # webhook + shell executors
│   │       ├── security/     # ssrf + secrets + curl + execArgv
│   │       ├── stats/        # aggregations (p50/p95/p99, successRate)
│   │       ├── schemas.ts
│   │       ├── types.ts
│   │       ├── config.ts
│   │       ├── logger.ts
│   │       └── daemon.ts
│   └── web/                  # Vite + React + DaisyUI
│       ├── package.json
│       ├── tsconfig.json
│       ├── vite.config.ts
│       ├── index.html
│       ├── .env.example      # template for the seed-demo feature
│       └── src/
│           ├── main.tsx
│           ├── App.tsx
│           ├── styles.css
│           ├── lib/
│           │   ├── api.ts
│           │   ├── curlParser.ts   # import-from-curl helper
│           │   └── types.ts
│           ├── components/
│           │   ├── CronBuilder.tsx
│           │   ├── Calendar.tsx
│           │   └── TimeseriesChart.tsx + StatusStrip.tsx
│           └── pages/        # Dashboard, Jobs, JobEditor, Runs, Settings
├── docs/                     # extended documentation
│   ├── API.md                # full HTTP API reference
│   ├── ARCHITECTURE.md       # deeper design + module map
│   ├── SECURITY.md           # threat model + hardening details
│   ├── DEVELOPMENT.md        # contributor guide
│   └── screenshots/dashboard.png
├── scripts/                  # typecheck + smoke PowerShell scripts
└── CHANGELOG.md
```

---

## 📐 SDD Governance

This project follows OpenSpec / Spec-Driven Development. The single source of truth is `openspec/config.yaml`. SDD-enforced rules:

- `daisyui-only` — DaisyUI 5 + Tailwind 4 + Radix Icons for glyphs only; no Tailwind utility classes, no other component framework.
- `windows-aware-storage` — temp+rename with EPERM retry + per-file mutex.
- `private-monorepo` — both packages `private: true`; no `npm publish`.
- `node-20-only` — `engines.node >= 20`.
- `local-first-default-bind` — `127.0.0.1` unless `--token` provided.
- `strict-typescript` — strict + ESM; no unjustified `any`, no `// @ts-ignore` without a linked issue.
- `test-coverage-gap-disclosed` — every change adds the first test for new behavior; cumulative `*.test.ts` count must never drop.

Archived changes live under `openspec/changes/archive/` — append-only.

---

## 🤖 AI-Generated Code — Disclosure

This codebase was **written predominantly by an AI coding assistant** (Pi, powered by a frontier model) under the direction of the project owner. Specifically:

- **Initial scaffolding (v0.1.0)** — Radix Themes + Fastify + Croner + JSON-store + smoke tests.
- **Phase 11 redesign (v0.1.0 → v0.2.0)** — DaisyUI Gruvbox rewrite of every UI component and page; calendar/clock pickers; cron-state machine refactor.
- **Cleanup (v0.3.0)** — removed unused UI-framework deps (Radix Themes, popover, react-router-dom, react-aria-components, date-fns).
- **Honest statistics (v0.4.0)** — p50/p95/p99 percentile helper, successRate returning `null` on no data, per-job status strip, real time-series.
- **Security hardening (v0.5.0)** — SSRF guard, timing-safe auth, secrets redaction, execArgv sanitization, fastify 5.9 CVE patch, bearer-token redaction policy.
- **Edit full config (v0.6.0)** — unredacted `GET /api/jobs/:id` for the editor, new `GET /api/jobs/:id/curl` endpoint, "Copy as curl" button in the UI.
- **Glance-able action cards (v0.7.0)** — each `ActionCard` now shows a one-line summary (`POST https://…` or `$ cmd (cwd, timeout)`), a tinted type icon (Globe for webhook, Code for shell), a status badge (✓ ok / ✗ failed / ⋯ running / — never run) sourced from `/api/runs`, up/down reorder buttons (debounced 250 ms PATCH, dense renumbering 0..n-1), and collapsible `<details>` form fields (expanded for new jobs, collapsed for existing ones). Empty state shows two large `Add Webhook` / `Add Shell` CTA cards.
- **Schedule-modal polish (v0.7.1)** — the six cramped `btn-sm` preset chips are now a 3×2 grid of cards (icon + label + visible hint + active highlight); the two `<select>`-based time pickers are replaced with a single native `<input type="time" step={60} lang="en-GB">` (24-hour clock, accessibility built-in, mobile-keyboard-friendly); a new inline human-readable description line (e.g. `"Fires at 09:00 on weekdays"` / `"Every 5 minutes"`) sits below the cards so the user can sanity-check the cron without parsing the raw string; the per-preset form lives inside a `<details>` whose open-state is persisted per `kind` in `localStorage` (`cb-details-opened-${kind}`, no PII); the Reset button is now a labeled `btn btn-outline btn-sm` instead of a hidden `↺` icon; the Preview block renders five large tiles with date prominent and time secondary, plus an optional yellow weekend-indicator badge.
The project owner reviewed, approved, and shipped every change. **All code is provided as-is**, with no warranty. Use at your own risk, especially for production cron jobs — always test schedules manually before relying on them for critical workloads.

---

## 📚 Extended documentation

- [`CHANGELOG.md`](./CHANGELOG.md) — release history
- [`docs/API.md`](./docs/API.md) — full HTTP API reference with request/response examples
- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — module map + data flow
- [`docs/SECURITY.md`](./docs/SECURITY.md) — threat model + hardening details
- [`docs/DEVELOPMENT.md`](./docs/DEVELOPMENT.md) — contributor guide (SDD workflow, testing, releasing)
- [`openspec/config.yaml`](./openspec/config.yaml) — SDD governance single source of truth

---

## 📜 License

MIT — see [LICENSE](./LICENSE).

Copyright (c) 2026 steimbyte