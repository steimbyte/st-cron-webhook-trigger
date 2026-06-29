# Cronboard

A **local-first cron scheduler** with a clean **Radix Themes** web frontend. Add cron jobs visually, attach one or multiple actions (webhooks, shell commands), and watch runs in real time.

> Built fresh; Phase 1–10 done, research-driven hardening applied. See "Production hardening" below for what's been done.

## Why

- Cron has a steep learning curve; visual editing is faster.
- Off-the-shelf schedulers (cron, systemd timers) lack a built-in UI.
- Local-first: your jobs and runs stay on your machine, no cloud account needed.
- Designed for the common cases: hitting a webhook every N minutes, kicking off a backup script on schedule.
- All UI: Radix Themes only — no Tailwind, no shadcn, no design bleed.

## Tech stack

| Layer | Choice |
|---|---|
| Language | TypeScript (strict, ESM) |
| Runtime | Node 20+, executed through `tsx` (no build step in dev) |
| Backend / HTTP | Fastify + @fastify/static |
| Cron parsing & scheduling | Croner (modern, TS-native) |
| Storage | JSON files in `~/.config/cronboard/` (atomic writes with Windows-aware retry) |
| CLI | Commander |
| Frontend | Vite + React 18 + **Radix Themes** (themes only, no Tailwind) + Radix Icons |
| Logging | pino (structured) |

## Quick start

```bash
npm install
npm run dev
```

Open <http://localhost:5173> for the web UI (Vite dev server with /api proxied to the backend).
The backend also serves the built UI at <http://localhost:3737> in production mode.

For production:

```bash
npm run build
npm start -- --port 3737
```

## CLI

```bash
# Start daemon (default: detached, writes pid + log to ~/.config/cronboard/)
npm start                              # default flags
npm start -- --port 8080 --host 0.0.0.0 --token s3cret
npm start -- --no-detach               # foreground (for systemd / dev)
npm start -- --data /tmp/cron         # alternate storage location

# Inspect / control
npm run status                         # pid, url, job count, recent runs
npm run stop                           # SIGTERM with 3s SIGKILL fallback
npm run logs -- -n 200 -f             # tail the log file

# One-off job management (writes JSON directly, no daemon required)
npm run ls
npm run add my-heartbeat --cron '*/5 * * * *' --url 'https://example.com/ping' --method POST
npm run rm my-heartbeat
npm run run my-heartbeat               # manual trigger via CLI
```

## Web UI

Open <http://localhost:5173> (dev) or <http://localhost:3737> (prod):
- **Dashboard** — active jobs, runs in last 24h, upcoming runs, recent runs, CLI quick start
- **Jobs** — table with name, cron expression, timezone, on/off toggle, last/next run. Inline toggle and delete with confirmation.
- **Job Editor** — name, description, cron expression with live human-readable preview (powered by `cronstrue`), timezone picker, **one or more actions** of two types:
  - **Webhook** — method, URL, headers (key=value), body, timeout
  - **Shell** — command, working directory, timeout (with a soft warning)
  - "Continue on error" toggle per action, additive ordering, drag-friendly reorder buttons
  - **Test run** button triggers an immediate run
- **Runs** — filterable table, click for a detail dialog with per-action Request/Response/Error tabs (JSON pretty-printed, scroll-truncated)
- **Settings** — server info, how the daemon was started, storage paths

## Architecture

```
┌────────────────────────────────────────────┐
│ Node Process (cronboard)                   │
│                                            │
│   ┌──────────────┐  ┌──────────────────┐   │
│   │  Scheduler   │  │  Fastify HTTP    │   │
│   │  Croner +    │  │  /api/* + static │   │
│   │  watcher     │  │  UI under /      │   │
│   └──────┬───────┘  └────────┬─────────┘   │
│          │                   │             │
│          ▼                   ▼             │
│   ┌──────────────────────────────┐         │
│   │ jobs.json / runs.json / log  │         │
│   │ (atomic write + per-file     │         │
│   │  mutex)                      │         │
│   └──────────────────────────────┘         │
│                                            │
└────────────────────────────────────────────┘
            ▲
            │  Browser (React + Radix Themes)
            └──── http://localhost:5173 (dev) / :3737 (prod)
```

## Repository layout

```
cronboard/
├── package.json              # workspace root
├── tsconfig.base.json
├── packages/
│   ├── core/                 # CLI + scheduler + server + storage + actions
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── cli.ts        # commander entry point
│   │       ├── server.ts     # Fastify app factory
│   │       ├── scheduler/
│   │       │   ├── index.ts  # polling + fs.watch with mtime cache + debounce
│   │       │   └── runner.ts # execute actions, persist run
│   │       ├── store/
│   │       │   ├── db.ts     # atomic JSON write (EPERM retry on Windows)
│   │       │   ├── jobs.ts   # job repo (Zod-validated)
│   │       │   └── runs.ts   # run repo (cap 1000)
│   │       ├── actions/
│   │       │   ├── registry.ts
│   │       │   ├── webhook.ts (undici, retries, timeout)
│   │       │   └── shell.ts  (child_process exec, allowedPaths opt-in)
│   │       ├── schemas.ts    # Zod schemas
│   │       ├── types.ts
│   │       ├── config.ts
│   │       ├── logger.ts
│   │       └── daemon.ts
│   └── web/                  # React + Radix Themes UI
│       ├── package.json
│       ├── tsconfig.json
│       ├── vite.config.ts
│       ├── index.html
│       └── src/
│           ├── main.tsx
│           ├── App.tsx
│           ├── lib/api.ts
│           ├── pages/        # Dashboard, Jobs, Editor, Runs, Settings
│           ├── styles.css
│           └── types.ts      # mirrored from core for Vite
├── bin/copy-web.mjs          # copies built web into packages/core/dist/web
└── scripts/                  # typecheck & smoke-test scripts
```

## Storage

JSON files in your user-config directory:

```
~/.config/cronboard/jobs.json
~/.config/cronboard/runs.json
~/.config/cronboard/cronboard.log
~/.config/cronboard/cronboard.pid
```

Override the directory via `CRONBOARD_DATA_DIR` env var or `--data` flag.

Writes go through:
1. Write to a unique temp file in the same directory
2. `rename()` over the target
3. On Windows EPERM/EACCES/EBUSY (antivirus lock): retry up to 5× with exponential backoff (50, 100, 200, 400ms)
4. Last resort: direct overwrite (acceptable for local config)

Reads are guarded by a per-file mutex to prevent torn writes.

## Auth / security

- **Default bind: `127.0.0.1`. No auth needed for local-only.**
- Binding to `0.0.0.0` requires `--token`; the server then requires `Authorization: Bearer <token>` on all `/api/*` calls.
- Webhook actions:
  - Default 30s timeout (configurable per action)
  - Optional `retries: { count, backoffMs }`
  - User-Agent `cronboard/0.1 (+webhook)`
- Shell actions:
  - Default 60s timeout
  - Optional `allowedPaths` array — if set, the cwd must be inside one of them
  - UI shows a soft warning before adding a shell action

## Production hardening (what was researched & applied)

| Topic | Source of risk | Fix applied |
|---|---|---|
| Atomic file writes on Windows | Antivirus/indexer transient EPERM | Temp+rename with 5× exponential-backoff retry, fallback to direct write |
| `fs.watch` self-trigger loop | Poll/cronner sync writing back its own mtime changes | `mtime` cache + 80ms debounce + guarded re-entry (`syncInFlight` flag); `setRunMeta` only writes when `nextRunAt` actually changed |
| Detached child on Windows | `spawn(...).detach` semantics differ across platforms | `unref()` + redirected stdio; `cronboard stop` does SIGTERM → 3s wait → SIGKILL |
| Method destructuring loses `this` | Route handler did `const { trigger } = scheduler; trigger()` | Call as `scheduler.trigger(...)` directly |
| Signal handling on Windows | Limited signal vocabulary | Documented Windows mapping (SIGTERM/SIGKILL); poll-and-wait in `cronboard stop` |
| TypeScript interface extending union | Compile error | Replaced with intersection types |

## Limitations / known gaps

- No job-level retry / catch-up (if the daemon was down at a tick, that tick is skipped).
- Runs are capped at the last 1000 (older ones are dropped).
- Tailwind was removed in favor of Radix Themes only — no utility CSS framework.
- Shell actions: cwd is the only sandbox dimension. Command-level sandboxing (e.g., firejail, container) is not implemented.
- No multi-user / RBAC. Single-user local-first only.

## Roadmap

- V1.1: more actions (HTTP generic + Slack/Discord/ntfy format helpers), per-action retry strategies
- V2: plugin registry for user-defined actions; multi-user auth; HTTP basic auth fallback

## Development

```bash
npm install                # 307 packages, ~30s
npm run typecheck          # tsc on both packages
npm run dev                # vite (5173) + tsx watch (3737) via concurrently
npm run build              # tsc + vite build + copy to core/dist/web
npm run start              # tsx packages/core/src/cli.ts start --detach
```

Smoke test:

```bash
powershell -ExecutionPolicy Bypass -File scripts/smoke.ps1
```

Builds the web, starts a backend on :3738 with an isolated `.smoke/` data dir, hits every API endpoint, asserts the UI is served, then tears down.

## License

MIT — see [LICENSE](./LICENSE).
