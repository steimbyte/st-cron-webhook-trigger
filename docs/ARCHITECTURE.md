# Architecture

Single Node process that runs three things concurrently. This document is the deeper cut — see `README.md` for the 5-second elevator pitch and `openspec/config.yaml` for the governance single source of truth.

## High-level

```
┌────────────────────────────────────────────────────────────┐
│ cronboard (one Node process)                                │
│                                                            │
│   ┌──────────────┐  ┌──────────────────┐  ┌─────────────┐  │
│   │  Croner      │  │  Fastify HTTP     │  │  Action     │  │
│   │  Scheduler   │  │  :3737            │  │  Runners    │  │
│   │  + mtime     │  │  + CORS (strict)  │  │  - webhook  │  │
│   │    cache     │  │  + bearer auth    │  │  - shell    │  │
│   │  + 80ms      │  │  + static UI      │  │  + SSRF     │  │
│   │    debounce   │  │    (SPA)          │  │    guard    │  │
│   │  + re-entry  │  │  + /api/* routes  │  │  + secrets  │  │
│   │    guard     │  │    (JSON)         │  │    redact   │  │
│   └──────┬───────┘  └────────┬─────────┘  └──────┬──────┘  │
│          │                   │                   │          │
│          └───────────────────┴───────────────────┘          │
│                              │                            │
│                              ▼                            │
│   ┌─────────────────────────────────────────────────────┐ │
│   │ JSON store (atomic writes, per-file mutex)           │ │
│   │   jobs.json  (array of jobs, secrets at rest)       │ │
│   │   runs.json  (last 1000 runs)                       │ │
│   │   cronboard.log  (structured pino)                  │ │
│   │   cronboard.pid  (daemon PID + start metadata)      │ │
│   └─────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────┘
```

## Module map

### Backend — `packages/core/src/`

| File | Responsibility | Key deps |
|---|---|---|
| `cli.ts` | Commander entry point. Spawns the daemon (detached by default). Sanitizes `process.execArgv` before forwarding. | `commander`, `tsx` |
| `server.ts` | Fastify app factory. Registers all `/api/*` routes. Bearer-auth hook (timing-safe). CORS `origin: false`. Static-UI fallback to `index.html`. | `fastify@5.9`, `@fastify/cors`, `@fastify/static` |
| `daemon.ts` | PID-file lock + SIGTERM → 3 s SIGKILL fallback. | — |
| `config.ts` | `resolveConfig(opts)` reads CLI flags, env, defaults. Computes the data dir, log path, pid path, host, port. | — |
| `logger.ts` | `pino` factory. Multistream (file + optional TTY-pretty). | `pino`, `pino-pretty` |
| `schemas.ts` | Zod schemas for `Job`, `Run`, `Action`. `cronExpression: z.string().min(1).max(256)`. | `zod` |
| `types.ts` | Shared types: `Job`, `Run`, `Action`, `WebhookConfig`, `ShellConfig`. | — |
| `scheduler/index.ts` | Croner wrapper. File-watch reload (mtime cache + 80 ms debounce + re-entry guard). Manual trigger via `scheduler.trigger(id)`. | `croner` |
| `scheduler/runner.ts` | Executes one job: iterates actions in order, aggregates status, persists the `Run` record. | — |
| `store/db.ts` | Atomic JSON writer. Temp + `rename()` with 5× exponential-backoff EPERM retry. Last-resort direct overwrite. | `node:fs/promises` |
| `store/jobs.ts` | `JobsRepo`: `list`, `get`, `findByName`, `create`, `update`, `toggle`, `delete`, `setRunMeta`. | — |
| `store/runs.ts` | `RunsRepo`: `list({ jobId, limit })`, `get`, `create`, `update`. Capped at 1000 entries. | — |
| `actions/webhook.ts` | `undici` POST/GET/etc. SSRF guard via `assertPublicUrl`. Per-action `allowPrivateNetworks` override. `maxRedirections: 0`. | `undici` |
| `actions/shell.ts` | `child_process.exec`. Optional `allowedPaths` cwd constraint. Privileged-cwd warning. | `node:child_process` |
| `actions/registry.ts` | `registerActionExecutor`, `getActionExecutor`, `listActionTypes`. | — |
| `security/ssrf.ts` | `assertPublicUrl(url, opts)`, `PrivateNetworkError`. Deny-list: 127/8, 10/8, 172.16/12, 192.168/16, 169.254/16, ::1, IPv4-mapped IPv6, multicast, broadcast, `0.0.0.0`, `localhost`, `.local`, `.internal`. | `node:dns` |
| `security/secrets.ts` | `redactHeaders`, `redactBody` (JSON + form-urlencoded), `redactWebhookAction`, `redactShellAction` (no-op per D13). | — |
| `security/execArgv.ts` | `sanitizeExecArgv(argv)`: allowlist-first, with denylist for `--inspect*` / `--debug*` / `--heap-prof*` / `--cpu-prof*`. | — |
| `security/curl.ts` | `toCurl(action)`, `shellQuote(s)`. Single-quote escaping via `'\''`. | — |
| `security/security.test.ts` | 14 unit tests for SSRF + secrets. | — |
| `security/curl.test.ts` | 17 unit tests for `toCurl`. | — |
| `stats/aggregations.ts` | `successRate(runs)`, `summarizeRunDurations(runs)` (p50/p95/p99 via linear interpolation), `runsByHour(runs, hours, tz)`, `lastN(runs, n)`, `weekdayInTimezone`, `dayOfMonthInTimezone`, `dateForDayOfMonth`. | `Intl.DateTimeFormat` |
| `stats/aggregations.test.ts` | 15 unit tests covering empty-state, percentiles, DST, timezone boundaries. | — |
| `scheduler/cronExpr.ts` | `parseCron`, `buildCron`, `defaultCronState`, `MINUTE_INTERVAL_OPTIONS`, `HOUR_INTERVAL_OPTIONS`, `weekdayInTimezone`, `dayOfMonthInTimezone`, `datesForWeekdaysInMonth`, `dateForDayOfMonth`, `clamp`, `clampInterval`. Single source of truth for cron ↔ UI state. | — |
| `scheduler/cronExpr.test.ts` | 63 unit tests covering the cron ↔ UI round-trip. | — |

### Frontend — `packages/web/src/`

| File | Responsibility | Key deps |
|---|---|---|
| `main.tsx` | React 18 entry. Mounts `<App />` into `#root`. | `react`, `react-dom` |
| `App.tsx` | Layout shell. Sidebar (3 sections: Overview / Schedule / System) + topbar (breadcrumb, search placeholder, theme toggle, New-job button) + content slot. State-based view switching (no router). | `@radix-ui/react-icons` |
| `styles.css` | DaisyUI 5 Gruvbox theme + custom solid color tokens (no glass, no transparency). | `tailwindcss@4`, `daisyui@5` |
| `lib/api.ts` | Typed fetch wrapper. `api.health`, `api.jobs.{list, get, create, update, remove, toggle, run, curl, stats}`, `api.runs.{list, get}`, `api.cron.{describe, next}`. | — |
| `lib/curlParser.ts` | `tokenize` + `parseCurl` for the "Import from curl" feature. | — |
| `lib/types.ts` | Mirrored subset of the core types. | — |
| `components/CronBuilder.tsx` | Modal-trigger schedule picker. Preset chips (Every minute / Hourly / Daily / Weekly / Monthly / Custom) + inline detail fields + live preview. | `react-aria-components`, `react-day-picker` |
| `components/Calendar.tsx` | Controlled date picker. Wraps `react-day-picker` v9 inline. Supports `mode="single"` and `mode="multiple"`. | `react-day-picker` |
| `pages/Dashboard.tsx` | KPI cards (active jobs / runs 24h / failures / success rate / p95 latency) + upcoming runs list + recent runs table + activity feed. | `Intl.DateTimeFormat` |
| `pages/JobsPage.tsx` | Searchable + filterable table. Inline toggle. Delete confirmation (DaisyUI modal). Per-row status strip + p95 chip. | `navigator.clipboard` |
| `pages/JobEditor.tsx` | Schedule + action cards + "Copy as curl" button. Pre-fills the action's `config` from `GET /api/jobs/:id` (unredacted). | `crypto.randomUUID` |
| `pages/RunsPage.tsx` | Filterable table + detail drawer (DaisyUI modal with Request/Response/Error tabs). | `navigator.clipboard` |
| `pages/SettingsPage.tsx` | Server info + how-to-start + storage paths. | — |
| `screenshots/dashboard.png` | Static screenshot used by the README. | — |
| `.env.example` | Template for `packages/core/.env.local` (gitignored). Documents `LANGFLOW_DEMO_URL` / `_API_KEY` / `_BODY` for the optional seed-demo feature. | — |

### Governance

- `openspec/config.yaml` — single source of truth (rules, gates, phase pipeline, tech stack). The `rule:` section is enforced via `sdd-apply` gates.
- `openspec/changes/<id>/{proposal,tasks,design,apply-progress,verify-report,verify-report}.md` — append-only per-change artifacts. After `sdd-archive`, the whole directory moves to `archive/<id>/`.
- `AGENTS.md` — root-level governance mirror of `config.yaml → rules`. Quick human reference.

## Data flow

### Scheduled run (Croner tick)

1. Croner fires a job's tick at the scheduled time.
2. The scheduler's tick callback (in `scheduler/index.ts`) looks up the latest job state via `JobsRepo.get(id)`, runs `setRunMeta({ lastRunAt })`, and calls `runJob()`.
3. `runJob` (`scheduler/runner.ts`) iterates the job's actions in `position` order. For each action it:
   - Calls the registered executor (`actions/webhook.ts` or `actions/shell.ts`).
   - Collects the executor's `Partial<ActionRun>` result.
4. When all actions complete (or fail with `continueOnError=false`), `runJob` aggregates the run's status (`success` / `partial` / `failed` / `timeout`) and persists the run via `RunsRepo.update`.
5. The next tick is rescheduled by Croner automatically (since the task is recurring).

### API request (e.g. `GET /api/jobs`)

1. Fastify receives the request.
2. The bearer-auth hook runs: if `auth !== \`Bearer ${token}\`` it returns 401. Comparison is `crypto.timingSafeEqual` with length normalization (v0.5.0+).
3. CORS hook: with `origin: false`, no CORS headers are added. The dev server (Vite :5173) proxies `/api/*` to :3737 server-side, so the browser sees a same-origin request.
4. The route handler runs. For `GET /api/jobs`, it calls `JobsRepo.list()` and applies `stripJobSecrets` to each job before serializing.
5. Fastify serializes the response and the auth/CORS hooks add any required response headers (none in our case).

### Manual run (`POST /api/jobs/:id/run`)

1. Auth + CORS hooks.
2. The route validates the job exists (`JobsRepo.get(id)`).
3. Returns the route's stored closure: `scheduler.trigger(id)` (a method on the `Scheduler` instance passed in at startup).
4. `Scheduler.trigger` runs the same `runJob` flow as a scheduled tick, but with `trigger: "manual"` in the persisted `Run` record.

## Concurrency model

- **Scheduler ↔ API**: the scheduler writes to `JobsRepo` (mtime + lastRunAt / nextRunAt) and `RunsRepo`. The API reads from both. There is no in-process locking between scheduler writes and API reads — the per-file mutex in `store/db.ts` is the serialization point.
- **Actions within a job**: actions within one job run serially in `position` order. Parallelism across jobs is a v0.7+ candidate (today a slow action blocks the next tick of the same job, but not other jobs — Croner is multi-task).
- **WebSocket/SSE updates**: not implemented. The dashboard polls every 2–3 s (or 30 s for the stats card). v0.7+ would replace polling with an SSE channel.

## File-watcher loop prevention (v0.2.0+)

`Scheduler.start()` sets up a `fs.watch` on the data directory. Naive implementation would create a self-trigger loop: the scheduler writes `lastRunAt` to `jobs.json` → watcher fires → scheduler re-loads → ... — infinite loop.

Prevention:
- `mtime` cache tracks the last value we wrote.
- 80 ms debounce coalesces multi-event bursts (some platforms fire twice per save).
- `syncInFlight` flag prevents re-entry.
- `setRunMeta` only writes when `nextRunAt` actually changed.
- The "user-edited jobs.json" case still works: mtime differs from cache, sync runs.

## Build / run model

- **Dev**: `npm run dev` runs `concurrently`: Vite on :5173 (with HMR) + `tsx watch` on :3737. The Vite dev server proxies `/api/*` to :3737 server-side.
- **Production**: `npm run build` → `tsc --noEmit` + `vite build` (output `packages/web/dist/`) + `bin/copy-web.mjs` (copies into `packages/core/dist/web/`). `npm start` → `tsx packages/core/src/cli.ts start` which can either run inline (`--no-detach`) or spawn a detached daemon (default).
- **Daemon protocol**: a child node process with `CRONBOARD_DETACHED=1` env var. The child takes the `--no-detach` path to ensure it's a fresh process tree. PID file at `~/.config/cronboard/cronboard.pid` for `npm stop`.

## Deployment model

cronboard is designed to run on a single machine you control (laptop, homelab, VPS, k8s pod). It is **not** designed for multi-tenant SaaS. The right way to scale is one instance per trust zone (per user, per project). For multi-trust-zone deployments, run multiple instances with separate data dirs (`--data DIR`).

## Open design decisions

- **No DB**: jobs and runs are JSON files. This is a deliberate choice for simplicity. v0.7+ may add SQLite for queryability.
- **No queueing**: actions run synchronously in the scheduler tick. A long webhook blocks the next tick. v0.7+ may add a job queue.
- **No streaming logs**: logs go to file + structured pino. No live-tail UI yet (v0.7+).
- **No Webhooks inbound**: cronboard only sends webhooks (outbound), not receives. Inbound would be a v0.8+ feature.

## Where the change history lives

- `openspec/changes/archive/` — append-only. Each subdirectory is one shipped change.
- `CHANGELOG.md` — release-history view (one entry per version), auto-derivable from the archive.

See `openspec/README.md` for the SDD governance summary.
