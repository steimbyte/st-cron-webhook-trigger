# Development guide

How to set up cronboard locally, run the test suite, follow the SDD workflow for a change, and ship a release. Companion to the top-level `README.md` (which covers the user-facing pitch) and `openspec/config.yaml` (the governance single source of truth).

## Prerequisites

- **Node.js ≥ 20** (engines field enforces this; v0.5.0+ removes any pretense of older-node support).
- **npm ≥ 10** (workspaces + `tsx` watch).
- **PowerShell** (for the smoke scripts). On Linux/macOS the `*.ps1` scripts can be re-implemented in `bash`; the cross-platform approach is to call `node --test` and `tsx` directly.
- A POSIX-y shell for the inline shell examples below (bash on Linux/macOS, Git Bash on Windows).

## Setup

```bash
git clone https://github.com/steimbyte/st-cron-webhook-trigger.git
cd st-cron-webhook-trigger
npm install                # 341 packages, ~30s
npm run typecheck          # tsc on both packages
```

## Day-to-day commands

```bash
# Dev mode (Vite :5173 + tsx watch backend :3737, side by side)
npm run dev

# Production build (output: packages/core/dist/web/ for Fastify to serve)
npm run build

# Run the daemon (detached by default; PID file at ~/.config/cronboard/cronboard.pid)
npm start
# foreground (no detach):
npm start -- --no-detach
# custom port + token:
npm start -- --port 8080 --host 0.0.0.0 --token YOUR_SECRET

# Stop the daemon
npm run stop

# Inspect status + recent runs
npm run status

# Tail the structured log
npm run logs -- -n 200
npm run logs -- -f       # follow
```

CLI flags (full set): `--port`, `--host`, `--data`, `--token`, `--detach|--no-detach`, `--allow-private-networks`. The `--allow-private-networks` flag sets `CRONBOARD_ALLOW_PRIVATE_NETWORKS=1` in the environment for the detached child.

## Tests

```bash
# All unit tests
node --test --import tsx packages/core/src/scheduler/cronExpr.test.ts
node --test --import tsx packages/core/src/stats/aggregations.test.ts
node --test --import tsx packages/core/src/security/security.test.ts
node --test --import tsx packages/core/src/security/curl.test.ts

# Or via npm:
npm test
# (currently 208 tests, all green at HEAD)

# Typecheck (both packages)
npm run typecheck

# End-to-end smoke
powershell -ExecutionPolicy Bypass -File scripts/smoke.ps1

# Security audit
npm audit --omit=dev
# 0 HIGH/CRITICAL expected.
```

## Project layout

```
st-cron-webhook-trigger/
├── package.json              # workspace root (npm workspaces)
├── tsconfig.base.json
├── openspec/                 # SDD governance (see below)
│   ├── config.yaml          # single source of truth (rules, gates, pipeline)
│   └── changes/             # in-flight + archive of SDD changes
├── packages/
│   ├── core/                # CLI + scheduler + server + storage + actions + security helpers
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/             # see docs/ARCHITECTURE.md for module map
│   └── web/                 # Vite + React + DaisyUI (Gruvbox dark)
│       ├── package.json
│       ├── tsconfig.json
│       ├── vite.config.ts
│       ├── .env.example
│       └── src/             # see docs/ARCHITECTURE.md for module map
├── docs/                     # this folder
│   ├── API.md
│   ├── ARCHITECTURE.md
│   ├── SECURITY.md
│   └── DEVELOPMENT.md
├── scripts/
│   ├── typecheck.ps1
│   ├── typecheck-web.ps1
│   ├── smoke.ps1
│   ├── smoke-ui.ps1
│   ├── start-for-user.ps1   # safe restart (kills only :3737 listener)
│   ├── diag.ps1
│   └── health-probe.ps1
└── CHANGELOG.md
```

## SDD workflow

cronboard uses OpenSpec / Spec-Driven Development. **Every change — feature, refactor, dependency bump — goes through the SDD pipeline**. The pipeline has 5 phases:

1. **`sdd-propose`** (or `sdd-status` if you're picking up an in-flight change) — writes `openspec/changes/<id>/{proposal,tasks,design}.md` describing what, why, and how. Decisions are documented as D1, D2, ... so you can override later. The `rules:` section in `openspec/config.yaml` is enforced.
2. **`sdd-apply`** — implements TDD-first: tests first (RED), then code (GREEN), then refactor. The agent verifies gates at the end: typecheck, all tests, `npm audit`, smoke.
3. **`sdd-verify`** — independent reviewer (often a fresh subagent) checks the change against the proposal + tasks + design. Outputs `verify-report.md`.
4. **`sdd-archive`** — moves the entire `openspec/changes/<id>/` directory to `openspec/changes/archive/<id>/`. Append-only.
5. **`sdd-sync`** (rare) — merges spec deltas into the canonical specs in `openspec/specs/`. We haven't needed this yet because the project is small enough that the change artifacts themselves are the spec.

Subagent types available: `sdd-init`, `sdd-propose`, `sdd-apply`, `sdd-verify`, `sdd-archive`, `sdd-sync`, `sdd-status`, `sdd-onboard`, `sdd-spec`, `sdd-design`, `sdd-tasks`. Plus non-SDD: `general-purpose`, `Explore`, `Plan`, `statusline-setup`, `security-reviewer`.

### Example: adding a new feature

User: "I want a status-strip per job in the Jobs table."

1. Run `sdd-status` to check if anything is in flight.
2. Run `sdd-propose` with the feature description. It writes:
   - `openspec/changes/<next-id>-status-strip/proposal.md` — what + why + IN/OUT scope + S-criteria.
   - `tasks.md` — TDD-ordered task list.
   - `design.md` — component contracts, API shape, edge cases.
3. User reviews artifacts, overrides any D-decisions the agent made.
4. Run `sdd-apply` to implement. Agent does:
   - T1: write tests (RED).
   - T2: implement code (GREEN).
   - T3+: wire UI, run gates, commit, push.
5. Run `sdd-verify` for an independent review.
6. Run `sdd-archive` to move the change into `archive/`.

### The `rules:` block is enforced

If a `rule:` in `openspec/config.yaml` forbids an approach you're considering, **change the rule first** (via an SDD change) before doing the approach. Don't try to sneak around rules.

Current rules: see `openspec/config.yaml → rules` (also mirrored in `AGENTS.md` at the repo root).

## Testing strategy

- **Unit tests** for every pure helper: cron parsing, statistics, SSRF, secrets, toCurl. Co-located with the source in `*.test.ts` next to `*.ts`.
- **Integration tests** in the smoke script: real HTTP server on an isolated port, real data dir, hits every endpoint, asserts S5–S8 plus a manifest of pre-defined S-criteria from the current change.
- **No end-to-end browser tests** yet (Playwright/Chromium is overkill for a single-user local-first app). The smoke script is the contract.
- **Security audit** via `npm audit --omit=dev` is part of every `sdd-apply` gate. 0 HIGH/CRITICAL is the bar.

### Test counts (at v0.6.0)

- 63 — `cronExpr.test.ts` (cron parsing, weekly/monthly TZ math, DST)
- 15 — `aggregations.test.ts` (percentiles, empty-state, TZ boundaries)
- 14 — `security.test.ts` (SSRF + secrets redaction)
- 17 — `curl.test.ts` (toCurl edge cases)
- 100 — `security.test.ts` + `curl.test.ts` (the v0.5.0 + v0.6.0 security helpers)
- **Total: 208**

The "**strict TDD**" rule in `config.yaml` means: every new helper lands with a failing test that turns green on implementation, then refactor. No "we'll add tests later" — the test goes in **before** the implementation.

## Committing

Single commit per SDD change. Commit message format:

```
<type>(<scope>): <subject>

- bullet 1
- bullet 2
```

Where `<type>` is one of: `feat`, `chore`, `fix`, `docs`, `refactor`. `<scope>` is the version (e.g. `v0.6.0`) or the affected module.

Example (the actual v0.6.0 commit message):
```
feat(v0.6.0): edit shows full job config + Copy as curl

- packages/core/src/security/curl.ts: toCurl() helper with proper
  single-quote / `=` / newline escaping. 191 → ~196 unit tests, all green.
- GET /api/jobs/:id/curl: returns { curl } for webhook actions,
  { shell } for shell actions (no echo wrap, literal command).
- GET /api/jobs/:id: returns the unredacted job (single-item trust
  model — list endpoint still masks via stripJobSecrets; this is the
  only divergence from the v0.5.0 redaction contract, documented
  in proposal.md §2).
- JobEditor: "Copy as curl" button next to the webhook URL field,
  copies the equivalent curl to clipboard.
- scripts/smoke.ps1: extended with S5–S8 assertions.
- Bump version 0.5.0 → 0.6.0 across all manifests, config.yaml,
  cli.ts, server.ts, README Status line.

Single commit. Bulk list endpoint stays redacted. UI is unchanged
except for the new button.
```

## Releasing

cronboard uses a manual semver bump + `git push origin master`. There is no CI yet (the project is single-author, single-trust-zone). The release flow:

1. Land the SDD change (commit on master, pushed).
2. (Optional) tag the commit: `git tag v0.6.0`.
3. Update `CHANGELOG.md` if not already (the SDD apply agent should have done this).
4. Bump the version in **6 files** (use `npm version minor|major|patch` from the root, or do it by hand):
   - `package.json`
   - `packages/core/package.json`
   - `packages/web/package.json`
   - `packages/core/src/cli.ts` (`.version("0.X.0")`)
   - `packages/core/src/server.ts` (`version: "0.X.0"`)
   - `openspec/config.yaml` (`project.version`)
5. Update `README.md` Status line.

## Future plans (v0.6.1+)

- Per-job rate limiting + audit log.
- `--cors-origins <csv>` for reverse-proxy setups.
- DNS-rebinding mitigation (`dns.setServers` + IP pinning).
- Per-Job logger in `ActionExecutor` (replaces `console.warn`).
- At-rest encryption for `jobs.json` (OS keychain / DPAPI / libsecret).
- Inbound webhook receiver.
- SQLite-backed query layer for v0.7+.
- Job queue (move action execution off the scheduler tick).

## How to ask for help

- Open an issue at https://github.com/steimbyte/st-cron-webhook-trigger/issues.
- Or contact the project owner via the email in their GitHub profile.

## See also

- [`README.md`](../README.md) — user-facing overview.
- [`CHANGELOG.md`](../CHANGELOG.md) — release history.
- [`docs/API.md`](./API.md) — full HTTP API reference.
- [`docs/ARCHITECTURE.md`](./ARCHITECTURE.md) — module map + data flow.
- [`docs/SECURITY.md`](./SECURITY.md) — threat model + hardening details.
- [`openspec/config.yaml`](../openspec/config.yaml) — SDD governance single source of truth.
