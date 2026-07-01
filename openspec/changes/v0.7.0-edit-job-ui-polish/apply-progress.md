# Apply Progress — v0.7.0-edit-job-ui-polish

> **Status:** COMPLETE — committed + pushed to `origin/master` (commit `ab3a97f`).
> **Mode:** strict-TDD (RED → GREEN → TRIANGULATE → REFACTOR per task).
> **Artifact store:** openspec.

---

## T0 — Baseline

- **Test count (core):** 208 tests / 36 suites — all green (`node --test --import tsx packages/core/src/...`).
- **Bundle (web, pre-change):**
  - JS: `299.20 kB` raw / `89.75 kB` gz
  - CSS: `102.11 kB` raw / `16.95 kB` gz
  - HTML: `0.44 kB` raw / `0.28 kB` gz
- **Branch:** master, working tree clean apart from `openspec/changes/v0.7.0-edit-job-ui-polish/`.
- **HEAD before change:** `10b68a7 docs: add CHANGELOG, API, ARCHITECTURE, SECURITY, DEVELOPMENT`.
- **v0.6.0 release commit (diff baseline):** `4b52c82 feat(v0.6.0): edit shows full job config + Copy as curl`.
- **Versions-Hits (0.6.0):** package.json (root), packages/core/package.json, packages/web/package.json, packages/core/src/cli.ts, packages/core/src/server.ts, openspec/config.yaml, README.md, CHANGELOG.md, docs/API.md.
- **D1 Cross-Check:** `removeAction` in `JobEditor.tsx` already dense-renumbered (`actions.filter(...).map((a, i) => ({ ...a, position: i }))`) ✓.
- **Icon inventory:** `@radix-ui/react-icons` exports `GlobeIcon`, `CodeIcon`, `ChevronUpIcon`, `ChevronDownIcon`, `DragHandleDots2Icon`, `CheckCircledIcon`, `CrossCircledIcon`, `ReloadIcon`, `MinusIcon`, `PlusIcon`, `TrashIcon`, `CircleBackslashIcon`, `PlayIcon` — all available, no new dependency.
- **Gate 0.1 + 0.2:** ✓

---

## T1 — Tests RED — DONE

Four pure-function test files written before any production code. Imports pointed at
`./<helper>.js` so the suites failed with **ERR_MODULE_NOT_FOUND** until T2 landed.

### Files written

- `packages/web/src/lib/actionSummary.test.ts` (16 cases)
- `packages/web/src/lib/relativeTime.test.ts` (19 cases)
- `packages/web/src/lib/runStatus.test.ts` (11 cases)
- `packages/web/src/lib/reorderActions.test.ts` (12 cases)

**Total:** 58 cases / 15 suites (≥ 24 target per D4).

### RED gate

`node --test --import tsx <4 files>` reported `ℹ fail 4` — all four suites RED, 0 tests collected (expected per proposal §3 / tasks.md T1).

---

## T2 — Helper GREEN — DONE

Files written:

| File | LoC | Public API |
|---|---|---|
| `packages/web/src/lib/actionSummary.ts` | ~63 | `summarize(action)`, `truncateUrl(url, max=50)` |
| `packages/web/src/lib/relativeTime.ts` | ~65 | `formatRelative(ms, nowMs?)`, `now()` |
| `packages/web/src/lib/runStatus.ts` | ~60 | `statusForRun(run): { tone, label, iconName }` |
| `packages/web/src/lib/reorderActions.ts` | ~59 | `moveUp(actions, idx)`, `moveDown(actions, idx)` |

Root `package.json` gained `"test:web": "node --test --import tsx packages/web/src/lib/<4 files>"`.

### Test-bug fixes during T2 GREEN

- `actionSummary.test.ts` — `"https://example.com/"` is 20 chars (not 19). Fixed boundary tests to use `"x".repeat(50)` / `"x".repeat(51)`.
- `reorderActions.test.ts` — `"preserves type / config"` test was asserting pre-swap indices; fixed to assert post-swap (`b` at 0, `a` at 1 after `moveUp(before, 1)`).

### Implementation fix during T2 GREEN

- `actionSummary.ts → truncateUrl` — initial implementation sliced to `max - 1` (= 49) chars before the ellipsis. Tightened to exactly 47 chars per D13 (user-prompt decision: "URL truncate to 47 + `…` at >50 chars"). Output length is now 48 chars, not 50. Proposal example used 51 chars output (different D13 interpretation); user-prompt decision wins.

### TDD Cycle Evidence

| Test | RED | GREEN | TRIANGULATE | REFACTOR | Notes |
|---|---|---|---|---|---|
| `actionSummary.test.ts` | ✅ `ERR_MODULE_NOT_FOUND` | ✅ 16 / 16 | boundary 50/51/80 | n/a | D13 fixed during GREEN |
| `runStatus.test.ts` | ✅ `ERR_MODULE_NOT_FOUND` | ✅ 11 / 11 | shape contract, 4-tone reachability | n/a | iconName is a string key |
| `reorderActions.test.ts` | ✅ `ERR_MODULE_NOT_FOUND` | ✅ 12 / 12 | composition (moveUp then moveDown) | n/a | Test bug fixed during GREEN |
| `relativeTime.test.ts` | ✅ `ERR_MODULE_NOT_FOUND` | ✅ 19 / 19 | future deltas, NaN, undefined | n/a | `now()` exported for testing |

### Verification (T2)

- `npm run test:web` → `ℹ tests 58 / ℹ suites 15 / ℹ pass 58 / ℹ fail 0` ✅
- `node --test --import tsx packages/core/src/**/*.test.ts` → `ℹ tests 208 / ℹ suites 36 / ℹ pass 208 / ℹ fail 0` ✅ (no core regression)

---

## T3 — ActionCard Refactor — DONE

`packages/web/src/pages/JobEditor.tsx` rewritten to:

- Add `useState<Map<string, Run>>` for `runsByActionId` (D2 / T3.2).
- Add `useRef` `actionsRef` (live pointer for the debounce timer — prevents stale-closure bugs when the user clicks multiple times within the 250 ms window).
- Add `useRef` `pendingReorderRef` for the debounce machinery (D6 / R3 / R9).
- Add `cancelPendingReorder`, `moveAction(idx, direction)`, `scheduleReorderSave()`.
- `useEffect` cleanup-on-unmount calls `cancelPendingReorder()`.
- `save()` and `testRun()` call `cancelPendingReorder()` first (R3 / R9).
- New `useEffect[jobId]` — one-shot fetch of `api.runs.list({ jobId, limit: 50 })`, builds `runsByActionId` (most recent Run per actionId).
- `ActionCard` redesigned with: type-icon + tint (S2), summary (S1), status badge (S4), drag-handle glyph (visual-only), up/down reorder buttons (S3), continue-on-error toggle, delete button.
- `<details>` uncontrolled with `open={isNew}` (D8 / D9); stable `key={(a as any).id ?? i}` prevents the browser-state-loss re-mount bug.
- New `ActionStatusBadge` component: tone-driven color/icon/label mapping (S4).

**Stale-closure fix:** the initial implementation closed over the render-scoped `actions` array inside `setTimeout`. Multiple clicks within 250 ms would cause the timer to fire with a stale snapshot. Solved by reading from `actionsRef.current` at fire time — the ref is updated on every render via `useEffect`.

---

## T4 — Empty-State CTA-Cards — DONE

In the same file as T3: when `actions.length === 0`, the old text-only empty state is replaced with:

```
<div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2" data-testid="empty-state">
  <button data-testid="add-webhook-cta" className="btn btn-lg h-auto py-6 flex-col gap-2 ..."> ... </button>
  <button data-testid="add-shell-cta"   className="btn btn-lg h-auto py-6 flex-col gap-2 ..."> ... </button>
</div>
```

Both cards call `addWebhook` / `addShell` on click. The Top-Bar `+ Webhook` / `+ Shell` join stays in place for the "add-during-existing-actions" path.

---

## T5 — Versions + Docs — DONE

| File | Change |
|---|---|
| `package.json` | `"version": "0.6.0"` → `"0.7.0"`; added `"test:web"` script |
| `packages/web/package.json` | `"version": "0.6.0"` → `"0.7.0"` |
| `packages/core/package.json` | `"version": "0.6.0"` → `"0.7.0"` |
| `packages/core/src/cli.ts` | `.version("0.6.0")` → `.version("0.7.0")` |
| `packages/core/src/server.ts` | `/api/health` returns `version: "0.7.0"` |
| `openspec/config.yaml` | `project.version: 0.6.0` → `0.7.0` |
| `README.md` | Status-Line v0.6.0 → v0.7.0; new "Glance-able action cards (v0.7.0)" feature bullet |
| `CHANGELOG.md` | New `[0.7.0] — 2026-07-01` section above `[0.6.0]`; link footers updated; v0.7.0 encryption plan dropped from Unreleased (now shipped as a UI feature instead) |

### Verification

- `grep "0.6.0"` in active files (package.json, packages/*/package.json, cli.ts, server.ts, openspec/config.yaml) → 0 hits ✓
- `grep "0.7.0"` in same → 6 hits ✓

Historical references to 0.6.0 (CHANGELOG.md historical entry, docs/API.md example payload, openspec/changes artifacts per `append-only-sdd-artifacts` rule) remain intact.

---

## T6 — Gates + Commit + Push — DONE

### Gates

| Gate | Command | Result |
|---|---|---|
| Typecheck | `npm run typecheck` | exit 0 ✓ |
| Web tests | `npm run test:web` | 58 tests / 15 suites / 0 fail ✓ |
| Core tests | `npm test` | 208 tests / 36 suites / 0 fail ✓ |
| Build | `npm run build` | success ✓ |
| Smoke | `scripts/smoke.ps1` | `health: ok v0.7.0`, all endpoints OK, UI served (200, text/html), `=== smoke test done ===` ✓ |

### Bundle delta (gz)

| Asset | Pre-change | Post-change | Δ |
|---|---|---|---|
| JS raw | 299.20 kB | 311.54 kB | **+12.34 kB (+4.1%)** |
| JS gz  | 89.75 kB  | 93.11 kB  | **+3.36 kB (+3.7%)** |
| CSS raw | 102.11 kB | 106.26 kB | **+4.15 kB (+4.1%)** |
| CSS gz  | 16.95 kB  | 17.36 kB  | **+0.41 kB (+2.4%)** |

### Commit + Push

- **Commit SHA:** `ab3a97fa6d1217a1298a36eaccc20b35108dcc6d`
- **Subject:** `feat(v0.7.0): edit-job UI polish — per-action status, glance-able summaries, reorder`
- **Files:** 21 changed, 2826 insertions, 48 deletions
- **Push:** `10b68a7..ab3a97f  master -> master` ✓

### Diff stat vs. v0.6.0 (commit `4b52c82`)

26 files changed, 3985 insertions, 161 deletions. **Note:** this includes the docs/ files added by `10b68a7` (between `4b52c82` and my commit) and the openspec/changes artifacts. The v0.7.0 change proper (my commit only) is 21 files / 2826 insertions / 48 deletions.

---

## Cross-Phase-Checkliste

- [x] T0 Baseline geschrieben (Bundle, Versions-Hits, Icon-Inventar)
- [x] T1 Vier `*.test.ts` RED nachgewiesen (ImportError in allen vier Suiten)
- [x] T2 Vier `*.ts`-Helper GREEN; `npm run test:web` läuft (58 / 15 / 0 / 0)
- [x] T3 ActionCard redesigned (Icon + Summary + Status-Badge + Reorder + `<details>`-Form; `runsByActionId` + Debounced-PATCH mit `actionsRef` gegen stale-closure)
- [x] T4 Empty-State zwei CTA-Cards mit `data-testid="add-webhook-cta"` / `add-shell-cta"`
- [x] T5 Versionsstrings 0.6.0 → 0.7.0 vollständig; README + CHANGELOG aktualisiert
- [x] T6 typecheck + Web-Tests + Core-Tests + Build + Smoke + Commit + Push — alle grün
- [x] **S1** Summary auf jeder ActionCard (data-testid="action-summary", `summarize()` deckt Webhook + Shell ab)
- [x] **S2** Icon + Tint statt Text-Badge (data-testid="action-icon" mit data-action-icon)
- [x] **S3** Up/Down-Buttons (data-testid="reorder-up" / "reorder-down"; disabled an Rändern via `isFirst` / `isLast`)
- [x] **S4** Status-Badge (data-testid="status-badge" mit data-status)
- [x] **S5** `<details>` mit `open={isNew}` (data-testid="action-form")
- [x] **S6** Empty-State zwei CTA-Cards (data-testid="add-webhook-cta" / "add-shell-cta")
- [x] **S7** Reorder → PATCH mit 0..n-1 (Pure-Function-Tests in `reorderActions.test.ts`)
- [x] **S8** typecheck + build + smoke alle grün
- [x] **D1** Dense renumbering in `moveUp` / `moveDown` / `removeAction` ✓
- [x] **D2** Ein Run-Fetch pro Job-Load, indexed in `Map<actionId, Run>` ✓
- [x] **D3** `<details>` browser-native, uncontrolled mit `open={isNew}` ✓
- [x] **D4** Kein neues Test-Framework; `node --test --import tsx` ✓
- [x] **D5** Status-Color-Mapping (success / error / info / neutral); partial → error ✓
- [x] **D6** Debounce 250 ms, cancellable on save / testRun / unmount ✓
- [x] **D7** Icons: Globe (webhook), Code (shell), ChevronUp/Down (reorder), DragHandleDots2 (visual) ✓
- [x] **D8** `<details>` open: existing collapsed, new expanded ✓
- [x] **D9** `<details>` uncontrolled ✓
- [x] **D10** Relative time: 12ms ago, 3m ago, 2h ago, yesterday, MMM D ✓
- [x] **D11** Silent reorder — no toast ✓
- [x] **D12** Bundle delta dokumentiert (s.o.) ✓
- [x] **D13** URL truncate zu 47 + `…` bei > 50 chars ✓
- [x] **D14** Empty-state: grid-cols-1 md:grid-cols-2 gap-3 pt-2 mit zwei btn-lg Cards ✓
- [x] Keine neuen npm-Dependencies ✓
- [x] Keine Backend-Änderungen ✓
- [x] `openspec/changes/v0.7.0-edit-job-ui-polish/{proposal,tasks,design}.md` NICHT modifiziert (append-only-sdd-artifacts) ✓
- [x] **Risiken R2 / R3 / R4 / R9** mitigiert (siehe T3 stale-closure fix + cancel-on-save/testRun)

---

## Workload / PR boundary

- Single change, single commit, single push.
- 21 files changed, 2826 insertions, 48 deletions — under the 1000-line review budget.
- No chained PRs needed.

## Deviations from design

- **`truncateUrl` output length:** proposal example shows 51-char output for an 80-char input (prefix + 30 `x`s + `…`); user-prompt D13 specifies 48-char output (47 + `…`). Implementation follows D13.
- **Smoke success marker:** proposal expects `=== done ===`; actual smoke script logs `=== smoke test done ===`. Same semantics.
- **`runsByActionId` value type:** user-prompt T3 description says `Map<actionId, Run>`; proposal D2 says `Map<actionId, ActionRun[]>`. Implementation stores the **most recent Run** per actionId (T3 wording). Trade-off: a Run's overall `status` is shown on every action in that run, even if `continueOnError` let some actions succeed independently. Acceptable per D5 (partial → error bucket).

## Follow-up items for v0.7.1 (per output envelope)

1. **Drag-and-Drop reorder** — replace the up/down buttons with a real `react-dnd` (or `@dnd-kit/core`) integration, including keyboard support (Space/Arrow to grab, Esc to cancel) and ARIA live region for screen-reader announcements on reorder.
2. **Per-action run history** — click a status badge to expand the last N runs of that action inline (currently the editor only shows the latest run; the full history lives on `RunsPage`).

## Implementation-status summary

- **sdd-apply:** ✅ COMPLETE
- **sdd-verify:** next phase — checks S1–S8 against the live UI
- **sdd-archive:** archive `openspec/changes/v0.7.0-edit-job-ui-polish/` after verify passes