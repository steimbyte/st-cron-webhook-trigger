# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). SDD change artifacts live under `openspec/changes/archive/<id>/` — the source of truth for any release.

## [Unreleased]

### Planned
- v0.6.1: per-job rate limiting + audit log; `--cors-origins <csv>` for reverse-proxy setups; DNS-rebinding mitigation via `dns.setServers` + IP pinning; per-Job logger in `ActionExecutor`.

---

## [0.7.1] — 2026-07-01

### Added
- **Schedule modal: 3×2 preset cards** — the six cramped `btn-sm` preset chips are gone; the modal now shows a 3×2 grid of cards (1 col mobile / 2 sm / 3 md+). Each card has an icon (`ClockIcon` / `TimerIcon` / `CalendarIcon` / `RowsIcon` / `LayersIcon` / `CodeIcon`), a label, a one-line hint visible without hovering, and an active state (`border-primary bg-primary/10` + `aria-pressed`). The selected preset is now glance-able at a glance rather than buried in a tooltip.
- **Native `<input type="time">`** — replaces the two `<select>` dropdowns that the modal used for hour and minute. `step={60}`, `lang="en-GB"` (24-hour locale hint), `input-lg` for a generous tap target. One control instead of two.
- **Inline human description** — every card grid is followed by a one-line plain-English description that explains the current cron: `"Every 5 minutes"`, `"Fires at minute 30 of every 2 hours"`, `"Fires at 09:00 on weekdays"`, `"Fires at 09:00 on day 15 of every month"`, `"Custom: */5 * * * *"`. The helper (`formatDescription` in `packages/web/src/lib/cronDescription.ts`) is pure — no API call, no spinner.
- **`select-md` interval picker** — the every-N-minutes / every-N-hours dropdown uses DaisyUI `select-md` (≈ 48 px tall) instead of `select-sm`. Comfortable on desktop and mobile.
- **Active-weekday chip row promoted** — the "Active: Mo, Tu, We, Th, Fr" inline row above the weekly calendar now uses `badge badge-primary badge-md` and a real label ("Active weekdays:") instead of the old `badge-sm` afterthought.
- **48 × 48 day-of-month tile** — the monthly preset now shows the active day-of-month as a large `bg-primary text-primary-content` tile (`w-12 h-12 rounded-xl font-bold text-2xl`) instead of a `badge-sm` chip. Visually dominant over the calendar below.
- **`<details>` open-state persistence** — the per-preset detail block lives inside a browser-native `<details>` element whose `open` state is persisted per `kind` in `localStorage["cb-details-opened-${kind}"]`. First open → expanded (D10). Once the user collapses one, the collapse sticks. No PII (no cron strings stored); try/catch around all `localStorage` calls for private-mode safety.
- **Reset button is a labeled outline button** — `<ResetIcon /> Reset` replacing the hidden `↺` icon-only button. `btn btn-outline btn-sm gap-1`. Still in the modal header, still resets the cron state without touching the localStorage UI preferences.
- **Preview tiles redesign** — the five-tile preview block uses `grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5`. Each tile is a card with the date (e.g. `"Tue, 1 Jul"`) prominent (`text-base font-semibold`) above the time (`text-sm text-base-content/60 font-mono`). Runs that fall on Sat / Sun get an optional yellow `badge-warning badge-xs` labelled `wknd` (tooltip "Weekend run"). Server-side `cronstrue` description still renders in the Preview header (unchanged).

### Internal
- New pure-helper module `packages/web/src/lib/cronDescription.ts` exporting `formatDescription(state: CronExpressionState): string`. Handles the 6 `CronKind` values plus two special-cases for `week`: `[1,2,3,4,5]` collapses to `"weekdays"`, `[0,6]` collapses to `"weekends"`, empty days falls back to `"every day"`.
- 21 new unit tests in `packages/web/src/lib/cronDescription.test.ts` — all pass under `npm run test:web`. The `test:web` script in root `package.json` was extended to include the new suite.
- `packages/web/src/components/CronBuilder.tsx` rewritten as a single 350-line component; no behavior change (the saved cron string is byte-identical for every input).
- No backend change, no storage migration, no data-model change, no new npm dependency. Bundle size: +7.1 kB raw JS / +2.5 kB gz JS, +2.7 kB raw CSS / +0.5 kB gz CSS — well within the 4 kB-gzip soft budget from the proposal (S8).

### Verified
- `npm run typecheck` — exit 0.
- `npm run test:web` — 79 / 21 suites, 0 failures.
- `npm test` — 208 / 36 suites, 0 failures (core unchanged).
- `npm run build` — success; bundle delta vs v0.7.0: JS +7097 raw / **+2514 gz**, CSS +2651 raw / **+518 gz**.
- `node bin/copy-web.mjs` — copies built assets into `packages/core/dist/web`.

---

## [0.7.0] — 2026-07-01

### Added
- **JobEditor: action summaries** — every `ActionCard` now shows a one-line header. Webhook: `POST  https://…` (two-space separator; URL truncated to 47 + `…` past 50 chars per D13). Shell: `$ cmd  (cwd: <cwd>, timeout <Xs>)` — first command line only, with `(cwd, timeout)` only when at least one of the two fields is set.
- **JobEditor: tinted type icons** — `Globe` icon on `bg-primary/15` for webhooks, `Code` icon on `bg-secondary/15` for shells, replacing the old text badge (`webhook #N` / `shell #N`).
- **JobEditor: per-action status badge** — ✓ / ✗ / ⋯ / — pill driven by `GET /api/runs?jobId=…&limit=50` (no new endpoint, no polling). Tone buckets: `success` → ✓ ok, `error` → ✗ failed / partial / timeout, `info` → ⋯ running, `neutral` → — never run.
- **JobEditor: up/down reorder buttons** — `ChevronUp` / `ChevronDown` on every card; first row disables Up, last row disables Down. Reorder fires a debounced `PATCH /api/jobs/:id` (250 ms) with dense renumbered positions `0..n-1` (D1). Drag-handle glyph (`≡`) sits next to the arrows as a visual hint only — no drag-and-drop yet (that's v0.8+).
- **JobEditor: collapsible form** — method/URL/body/headers (webhook) or command/cwd/timeout (shell) now live inside a browser-native `<details>` element. Collapsed by default for existing jobs, expanded for new jobs.
- **JobEditor: empty-state CTA cards** — when `actions.length === 0`, two large `btn-lg` cards (`grid-cols-1 md:grid-cols-2 gap-3 pt-2`) replace the old text-only empty state. One card per action type, with the same Globe/Code iconography and a one-line description.
- **`npm run test:web`** — new script wiring `node --test --import tsx` to the four pure-helper test suites. No new test framework, no new dependency.

### Internal
- Four new pure-helper modules in `packages/web/src/lib/`:
  - `actionSummary.ts` — `summarize(action)`, `truncateUrl(url, max=50)`.
  - `relativeTime.ts` — `formatRelative(ms)`, `now()` (exported for testing).
  - `runStatus.ts` — `statusForRun(run)`, returning `{ tone, label, iconName }`.
  - `reorderActions.ts` — `moveUp(actions, idx)`, `moveDown(actions, idx)`.
- 58 new unit tests across 4 test files (`actionSummary.test.ts`, `relativeTime.test.ts`, `runStatus.test.ts`, `reorderActions.test.ts`); all run via `npm run test:web`.
- No data-model change, no storage migration, no backend change, no new npm dependency. The `/api/runs` endpoint (already present since v0.1.0) is reused; per-action status is derived client-side from `Run.actionRuns[]`.

### Verified
- `npm run typecheck` — exit 0.
- `npm run test:web` — 58 / 15 suites, 0 failures.
- `npm test` — 208 / 36 suites, 0 failures (core unchanged).
- `npm run build` — success; JS bundle +12.34 KB raw / +3.36 KB gz, CSS +4.15 KB raw / +0.41 KB gz.

---

## [0.6.0] — 2026-07-01

### Security
- `GET /api/jobs/:id` returns the **unredacted** job (single-item trust model: needed for the editor to show what was actually saved, including the `x-api-key`). The bulk list endpoint still masks secrets via `stripJobSecrets`.

### Added
- New `GET /api/jobs/:id/curl` endpoint returns `{ curl: "..." }` for webhook actions or `{ shell: "..." }` for shell actions (literal command, no `echo` wrap).
- New `packages/core/src/security/curl.ts` with `toCurl(action)` and `shellQuote(s)` helpers. 17 new unit tests cover single-quote escaping, `=` in header values, missing fields, and the get/post/no-body matrix.
- "Copy as curl" button in the `WebhookFields` editor card. Click → calls the new endpoint and copies the literal `curl` string to the clipboard.

### Changed
- `JobEditor.tsx` (web) uses the loaded job's action `config` directly (no redaction in the form fields). Combined with the unredacted `:id` endpoint above, the editor now shows the full saved config.

### Verified
- `node --test`: 191 → 208 unit tests, all green.
- `npm audit --omit=dev`: 0 HIGH/CRITICAL.
- `npm run typecheck`: exit 0.
- `npm run build`: success.
- `scripts/smoke.ps1`: extended with S5–S8 assertions; `=== done ===`.

### Migration
- Users with multiple human consumers behind `--host 0.0.0.0` should consider the security trade-off. The proposed mitigation (the `?reveal=true` opt-in) is tracked in v0.6.1; until then, run cronboard inside a container or VM with strict isolation.

### Commits
- `4b52c82 feat(v0.6.0): edit shows full job config + Copy as curl`

---

## [0.5.0] — 2026-06-30

### Security
This is a **semver-major** security-hardening release. Public-API surface (CLI flags + HTTP paths) is backwards-compatible; webhook jobs that target private network addresses (e.g. `127.0.0.1` chain, AWS metadata `169.254.169.254`) will start returning `failed` runs with the error message `SSRF blocked: <target> is a private network address (set allowPrivateNetworks to override)`. Migration: set `allowPrivateNetworks: true` on those webhook actions in the editor, or start the daemon with `--allow-private-networks` for a global override.

### Added
- `packages/core/src/security/ssrf.ts` — `assertPublicUrl(url, { allowPrivateNetworks })` checks scheme + private-IP ranges (127/8, 10/8, 172.16/12, 192.168/16, 169.254/16, ::1, IPv4-mapped IPv6, multicast, broadcast, `0.0.0.0`, `localhost`, `.local`, `.internal`). DNS-resolves at submit time and rejects resolved addresses too. 14 unit tests.
- `packages/core/src/security/secrets.ts` — `redactHeaders`, `redactBody` (JSON + form-urlencoded), `redactWebhookAction`, `redactShellAction` (no-op for shell per design D13).
- `packages/core/src/security/execArgv.ts` — `sanitizeExecArgv(argv)`: allowlist-first, with denylist for `--inspect*` / `--debug*` / `--heap-prof*` / `--cpu-prof*` to prevent a long-lived daemon from accidentally exposing a Node inspector.
- New env var `CRONBOARD_ALLOW_PRIVATE_NETWORKS` and CLI flag `--allow-private-networks` for a global SSRF override.
- New `allowPrivateNetworks: boolean` field on `WebhookConfig` for per-action override.
- `stripJobSecrets` finally implemented (was a documented-but-unimplemented no-op since v0.1.0).
- Startup migration warning (R1): on daemon start, jobs with private webhook URLs are logged (not auto-blocked).
- Privileged-cwd warning (M3): shell action logs a warning if `process.cwd()` is `/root`, `/home/*`, or `C:\Users\*` (heuristic).
- New `?` query path: `GET /api/cron/describe?expr=...` and `GET /api/cron/next?expr=...&tz=...` (existed but documented in API now).

### Changed
- `packages/core/src/server.ts`:
  - Auth hook: `auth !== \`Bearer ${deps.token}\`` replaced with `crypto.timingSafeEqual` (length-normalized). Defensive `return reply` after 401.
  - CORS: `origin: (origin, cb) => cb(null, true)` → `origin: false` (no CORS headers, same-origin only).
  - `buildServer` throws on non-loopback bind without `--token` (belt-and-braces with the CLI check).
- `undici.request(..., { maxRedirections: 0 })` — disables redirect-following, closes SSRF via 30x chains.
- `cronExpression: z.string().min(1).max(256)` (256 is more than enough for any sane cron, prevents regex backtracking abuse).

### Verified
- `node --test`: 86 → 191 unit tests (+105), all green.
- `npm audit --omit=dev`: 5 HIGH/CRITICAL → **0**.
- `npm run typecheck`: exit 0.
- `npm run build`: success.
- `scripts/smoke-ui.ps1`: `=== done ===`.

### Migration
- Bump to v0.5.0: any existing webhook job targeting a private IP will start failing. Edit those jobs in the UI and enable `allowPrivateNetworks: true`, or pass `--allow-private-networks` to the daemon.

### Commits
- `8ed2dd6 feat(v0.5.0): security hardening — SSRF guard, secrets redaction, fastify CVE patch`

---

## [0.4.0] — 2026-06-30

### Added
- New `packages/core/src/stats/aggregations.ts` with `successRate` (returns `null` on no data, never lies `100%`), `summarizeRunDurations` (p50/p95/p99 via linear interpolation, excluding runs without `durationMs`), `runsByHour` (TZ-aware), `lastN`. 12 new unit tests.
- New endpoints: `GET /api/stats` (overall aggregates) and `GET /api/jobs/:id/stats?limit=20` (per-job stats + last 20 runs).
- Dashboard: SUCCESS RATE shows `—` instead of lying `100%` when no data. New P95 LATENCY card. The old histogram-as-sparkline is replaced with a real time-series area chart.
- JobsPage: per-job status strip (last 20 runs as color-coded cells) + p95 chip per row.

### Verified
- `node --test`: 63 → 75 unit tests, all green.
- `npm audit --omit=dev`: clean of HIGH/CRITICAL.
- `scripts/smoke-ui.ps1`: `=== done ===`.

### Commits
- `d949346 feat(v0.4.0): honest chart statistics — empty-state, percentiles, status strip`

---

## [0.3.0] — 2026-06-30

### Removed
- `@radix-ui/themes` (replaced by DaisyUI 5)
- `@radix-ui/react-popover` (Calendar renders inline now)
- `react-router-dom` (state-based view switching)
- `react-aria-components` (Clock was a wrapper around it, since removed)
- `date-fns` (only used by the old `react-aria-components` TimeField)

### Verified
- `npm run typecheck` exit 0.
- `node --test`: 63 unit tests, all green (no regression).
- `npm run build`: success.
- `scripts/smoke-ui.ps1`: `=== done ===`.

### Commits
- `91595f2 chore(v0.3.0): remove unused UI-framework deps — DaisyUI only`

---

## [0.2.0] — 2026-06-30

### Changed
- **DaisyUI Gruvbox redesign.** Replaced Radix Themes with DaisyUI 5 + Tailwind 4 (CSS-first config). Strict Gruvbox dark theme (yellow/orange/green/blue/aqua on charcoal/sepia). No transparency, no glass effects — solid surfaces only.
- New sidebar + topbar + content shell inspired by the Nexus dashboard reference: dense cards, status pills, theme toggle in topbar.
- All five pages rewritten: Dashboard, Jobs, JobEditor, Runs, Settings. Every component uses DaisyUI classes (`btn`, `card`, `table`, `tabs`, `modal`, `alert`, `badge`, `drawer`, etc.).
- CronBuilder rewritten as a modal: trigger button shows the current cron string, click opens a modal with preset chips (Every minute / Hourly / Daily / Weekly / Monthly / Custom) and inline detail fields. Live preview of next 5 runs inside the modal.
- Calendar (date picker) now renders inline instead of inside a popover. `react-day-picker` v9 month-view, theme-aware via CSS variables.
- New `packages/web/src/lib/curlParser.ts`: `tokenize` + `parseCurl` for the "Import from curl" feature. 7 self-tests pass.

### Fixed
- **CronBuilder stale-state bug**: `useMemo(() => parseCron(value), [])` was overriding the user's selection. Picking `*/1` would silently reset to `*/5`. Now re-parsed every time `value` changes.
- **Webhook executor debugging**: failure-path return now includes `request: { method, url, body }` and `response: { status, headers, body }` so failed runs (4xx/5xx) are immediately diagnosable from the UI's run-details drawer.

### Verified
- `node --test`: 0 → 47 unit tests, all green.
- `npm audit --omit=dev`: clean of HIGH/CRITICAL.
- `scripts/smoke-ui.ps1`: `=== done ===`.

### Migration
- `npm install` will remove 5 deps; lockfile shrinks by ~2k lines.

### Commits
- `057be5a feat(phase-11): UI rework — glass surfaces, Calendar+Clock selectors, cronExpr core split` (intermediate)
- `e2189f2 fix(phase-11-followup): wire Calendar in CronBuilder Weekly+Monthly tabs` (intermediate)
- `2023bf5 feat: v0.2.0 — DaisyUI Gruvbox redesign + curl import + bug fixes`

---

## [0.1.0] — 2026-06-29

### Added
- Initial release. Fastify + Croner + JSON-store + smoke tests.
- 5 demo jobs (Langflow + backup.sh + echo hello).
- Two action types: webhook (undici, timeout, optional retry) + shell (child_process.exec, optional `allowedPaths`).
- Run history (last 1000 runs) with full Request/Response capture.
- Daemon mode with PID file + SIGTERM → 3s SIGKILL fallback.
- Windows-aware atomic JSON writes (5× exponential-backoff EPERM retry).
- File-watcher with mtime cache + 80ms debounce + re-entry guard (no self-trigger loop).
- DaisyUI Gruvbox dark UI (Gruvbox palette, no glass, no transparency).
- Full SDD governance: `openspec/config.yaml` is the single source of truth.

### Verified
- 0 unit tests at this point (pre-strict-TDD). Smoke script green.
- All typechecks exit 0.

### Commits
- `eb5d972 feat: cronboard v0.1.0 - local-first cron scheduler with Radix Themes UI`

---

[Unreleased]: https://github.com/steimbyte/st-cron-webhook-trigger/compare/v0.7.0...HEAD
[0.7.0]: https://github.com/steimbyte/st-cron-webhook-trigger/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/steimbyte/st-cron-webhook-trigger/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/steimbyte/st-cron-webhook-trigger/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/steimbyte/st-cron-webhook-trigger/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/steimbyte/st-cron-webhook-trigger/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/steimbyte/st-cron-webhook-trigger/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/steimbyte/st-cron-webhook-trigger/tags/v0.1.0
