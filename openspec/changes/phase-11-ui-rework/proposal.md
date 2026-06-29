# Proposal: phase-11-ui-rework — Radix + Glass UI rework with real Calendar & Clock

- **Phase:** sdd-propose → awaiting approval → sdd-apply
- **Author:** sdd-proposal sub-agent (parent: gentle-pi harness)
- **Date:** 2026-06-29
- **Project:** `cronboard` (v0.1.0, shipped in commit `eb5d972`)
- **Governance:** `openspec/config.yaml`, `AGENTS.md` (rules in §2 / §4 take precedence over anything below)

---

## 1. Intent

Promote the Web UI from a functional-but-flat cron dashboard (Phase 1–10, commit `eb5d972`) into a cohesive, modern interface that:

1. **Replaces the text+cron+dropdowns CronBuilder** with a **real visual calendar and clock** for picking date/time, on top of an explicit, screen-reader-friendly cron text input.
2. **Adds a deliberate visual identity** — Radix Themes tokens + a translucent "glass" surface system + a slow ambient gradient background — without violating the `radix-themes-only` rule.
3. **Closes the strict-TDD coverage gap** by landing the first `*.test.ts` for the canonical cron parse/build helpers as part of this same change (gates `sdd-apply`).
4. **Keeps the visual preview instant** so the Web UX is not coupled to a network roundtrip through `/api/cron/*` for every keystroke.

The user asked for "a full Radix UI + glass transmorphism UI rework" + a "calendar and clock UI for picking cron timing", executed as SDD. This proposal is the formal version of that ask.

---

## 2. Scope

### In-scope

| Area | Change |
|---|---|
| Foundations | New workspace deps for `@radix-ui/react-popover`, `react-day-picker` v9, `react-aria-components`, `date-fns`. Wire `@cronboard/core` as a workspace dep of `packages/web` so the UI can import canonical pure helpers. |
| Strict-TDD gap closure (Phase 1) | Extract `parseCron` / `buildCron` out of `CronBuilder.tsx` and into `packages/core/src/scheduler/cronExpr.ts`; add `packages/core/src/scheduler/cronExpr.test.ts` as the very first `*.test.ts` under `packages/core/src/`. |
| Design tokens | New `--cb-glass-*` and `--cb-mesh-*` CSS variables in `packages/web/src/styles.css`. Radix Themes variables remain the source of truth; glass tokens are derived. |
| Reusable glass primitives | New `packages/web/src/components/GlassCard.tsx`, `BackgroundMesh.tsx`. Both consume Radix Themes tokens, never introduce a second design system. |
| Calendar | New `packages/web/src/components/Calendar.tsx` (Radix Popover trigger + `react-day-picker` v9). Accessible (`role="application"` on the grid), themable via CSS variables, supports min/max date constraints inferred from recurrence. |
| Clock | New `packages/web/src/components/Clock.tsx` (Radix Popover trigger + `react-aria-components` `TimeField`). Segmented HH:MM with full keyboard nav, arrow-key increments, 12/24h toggle. |
| CronBuilder | Rewrite `packages/web/src/components/CronBuilder.tsx` from text+dropdowns to a tab-driven recurrence model (Minute / Hourly / Daily / Weekly / Monthly / Custom) where Daily / Weekly / Monthly tabs use Calendar + Clock. Reverse parse round-trips unchanged. |
| Page restyle | Touch-up of `packages/web/src/pages/{Dashboard,JobsPage,JobEditor,RunsPage,SettingsPage}.tsx` + `packages/web/src/App.tsx` — replace bare `<Card>` with `<GlassCard>`, add `<BackgroundMesh>` behind the layout, keep semantic markup identical so screen-reader behavior is preserved. |
| Accessibility | WCAG AA contrast audit of glass surfaces (`--cb-glass-bg` + `--gray-12` text). `prefers-reduced-motion` short-circuit on `BackgroundMesh`. Focus rings on every interactive glass element. `@supports not (backdrop-filter)` fallback to solid `var(--gray-2)` panel. |
| Bundle budget | Net delta ≤ **80 KB gzipped** for `packages/web` (target ≤ 60 KB). Enforced via size snapshot test in `tasks.md`. |
| Test infrastructure | The first `*.test.ts` lands in this change (gate `test-coverage-gap-disclosed`). No React component test infra is added; web UI tests are out of scope (config decision: see `AGENTS.md §4`). |
| Smoke test | `scripts/test-cron-builder.ps1` extended to verify the new Calendar / Clock components render in the built bundle. |

### Explicitly out-of-scope (the user can object now)

- **Sun / sunset auto-fill.** Requires lat/long + timezone DST offset math; not requested in the current ask. Tracked as Phase 12 candidate.
- **Multi-tenant themes** (per-user accent-color override, white-label). Conflicts with `local-first-default-bind` posture; Phase 13+ candidate.
- **Animation library** (Framer Motion, react-spring). We stay on CSS keyframes + View Transitions where supported.
- **Migration off Radix Themes.** Glass tokens are *additive* layers on top of Radix; Radix remains the single design system per `config.yaml → radix-themes-only`.
- **Tailwind / shadcn utility framework.** Forbidden by rule `radix-themes-only`.
- **Cross-workspace de-duplication of cron helpers** beyond the explicit `@cronboard/core` import. We do **not** introduce a third package or a shared types workspace yet.
- **React component test infra for `packages/web`** (jsdom + @testing-library/react). Out of scope until at least one meaningful web unit is isolable.
- **Cron expression generation for ranges / lists / `L`, `W`, `#`** beyond what the current parser already round-trips. The Custom tab still accepts raw cron strings; advanced patterns remain "advanced".
- **Database / backend changes.** This is a front-end-only change. No edits to `packages/core/src/` outside the new pure-helper module + its test.

---

## 3. Affected areas

### Files to be added (sdd-apply only — proposal is read-only)

```
packages/web/src/components/
  Calendar.tsx            # react-day-picker v9 in a Radix Popover
  Clock.tsx               # react-aria-components TimeField in a Radix Popover
  GlassCard.tsx           # translucent surface primitive
  BackgroundMesh.tsx      # slow ambient gradient layer (CSS-only)
packages/web/src/lib/
  glassTokens.ts          # tiny token reader (parses --cb-glass-* computed style)
packages/core/src/scheduler/
  cronExpr.ts             # canonical parseCron / buildCron / roundTrip helpers
  cronExpr.test.ts        # FIRST *.test.ts — gates strict_tdd
openspec/changes/phase-11-ui-rework/
  proposal.md             # this file
  tasks.md
  design.md
```

### Files to be modified (sdd-apply only)

```
packages/web/package.json                # add: @radix-ui/react-popover, @radix-ui/react-icons (already there),
                                         #      react-day-picker, react-aria-components, date-fns,
                                         #      @cronboard/core (workspace:*)
packages/web/tsconfig.json               # paths: { "@cronboard/core/*": ["../core/src/*"] }
packages/web/vite.config.ts              # alias "@cronboard/core" → "../core/src"
packages/web/src/styles.css              # --cb-glass-*, --cb-mesh-*, @supports fallback, keyframes
packages/web/src/components/CronBuilder.tsx     # rewrite to use Calendar/Clock/GlassCard; import helpers from core
packages/web/src/main.tsx                # unchanged (Radix styles still imported via App.tsx)
packages/web/src/App.tsx                 # BackgroundMesh + GlassCard sidebar/header
packages/web/src/pages/Dashboard.tsx     # GlassCard on every panel; restyle cards
packages/web/src/pages/JobsPage.tsx      # GlassCard; sticky glass filter bar
packages/web/src/pages/JobEditor.tsx     # GlassCard around CronBuilder; glass actions panel
packages/web/src/pages/RunsPage.tsx      # GlassCard; empty-state glass plate
packages/web/src/pages/SettingsPage.tsx   # GlassCard; code blocks remain monospace on solid bg
package.json                             # test script stays ("node --test --import tsx ..."), CI-friendly
scripts/test-cron-builder.ps1            # add a Calendar / Clock render assertion in the built bundle
```

### Files unchanged

- Anything under `packages/core/src/{cli,server,scheduler/index,scheduler/runner,store,actions/shell,actions/webhook,daemon,config,logger,types,schemas}.ts`. The repo's `protected_roots: [packages/]` still shields these, and we touch only the new `cronExpr.ts` + its test.
- `openspec/config.yaml` (governance).
- `AGENTS.md` (the rules mirror; if Phase 11 reveals a new rule, we add it in a later, separate change per `append-only-sdd-artifacts`).
- `bin/copy-web.mjs`, `scripts/smoke.ps1` logic — only an additive assertion is appended to `test-cron-builder.ps1`.

---

## 4. Risks & mitigations

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | `react-aria-components` is large (~30 KB gz) and may push the bundle over budget. | Medium | Medium | Use `TimeField` + `DateField` composition only; tree-shake via individual imports; document bundle delta in design.md; add a `size-limit`-style assertion in `tasks.md`. |
| R2 | Glassmorphism over a complex background can drop contrast below WCAG AA. | High | High (accessibility regression) | Pin `--cb-glass-bg` to a value measured against `--gray-12` with `colorjs.io`-style contrast verification; add a contrast checker test in `cronExpr.test.ts`'s sibling `glassTokens.test.ts` (in `packages/web`, NOT a React component test — pure CSS): read computed style and assert ratio ≥ 4.5:1. Falls back to solid `var(--color-panel-solid)` if `backdrop-filter` is unsupported. |
| R3 | Animation on the BackgroundMesh adds repaints and reduces battery on low-end devices. | Medium | Medium | 60s linear keyframe, `will-change: transform`, `prefers-reduced-motion: reduce` → static gradient. Optional per-page toggle (not in scope for v1, but the CSS hook is in place). |
| R4 | `react-day-picker` v9 styling uses its own class names; clashes with Radix Themes if we copy-paste CSS. | Medium | Low | Import only the bare `react-day-picker/style.css` and override the small set of class names (`--rdp-*`) with our own CSS-variable overrides that read from Radix Themes tokens. |
| R5 | Users on Firefox ESR / Safari < 18 lack `backdrop-filter`. | Low | Low | `@supports not (backdrop-filter: blur(8px))` fallback → solid `var(--gray-2)` panel. Tested via a snapshot test that toggles `@supports`. |
| R6 | Extracting `parseCron` / `buildCron` into core changes import paths and could break the renderer. | Low | High | The rewrite of `CronBuilder.tsx` (task D1) explicitly imports the helpers; existing `/api/cron/describe` is unaffected because the helpers remain identical behaviorally. Existing round-trip in the cron preview smoke test must still pass. |
| R7 | `react-aria-components` indirectly pulls `react-aria` and `@react-stately/*`. Heavy dependency chain. | Medium | Medium | Pin exact minor version (^3.x), accept the dep, document. Monitor with the bundle-size assertion. |
| R8 | The change touches every page; visual regression is possible. | Medium | Medium | Page restyle is structural (Card → GlassCard) — semantic tree preserved, no JSX reorganization. Visual review in `sdd-verify` against design.md mockup. |
| R9 | Strict-TDD gap is closed by writing tests for *new* behavior (`cronExpr.ts`) but a reviewer might want existing helpers migrated too. | Low | Low | The proposal explicitly names the canonical source: `packages/core/src/scheduler/cronExpr.ts`. Both copies (core canonical + web consumer) are tied by the same test contract. Phase 12 candidate: mirror into web with a Vite-alias symlink. |
| R10 | Adding `@cronboard/core` to `packages/web` as a workspace dep changes `package-lock.json` for the whole monorepo. | Low | Low | Use `workspace:*` protocol; commit `package-lock.json` in the sdd-apply commit. |

---

## 5. Rollback

This change is structured so it can be reverted in two layers:

1. **Soft rollback** (single PR): revert the `phase-11-ui-rework` commit on `master`. The component API surface (`CronBuilder`, `Calendar`, `Clock`, `GlassCard`) is contained inside `packages/web/src/components/` and the new `packages/web/src/lib/glassTokens.ts`. Reverting removes the new components and restores the old `CronBuilder.tsx` verbatim (committed in eb5d972). API calls `/api/cron/describe` and `/api/cron/next` are unaffected.
2. **Hard rollback** (deps): `npm uninstall` the five new packages and remove `@cronboard/core` from `packages/web` deps. The repo returns to v0.1.0 dependency surface.

No data migrations, no DB schema changes, no runtime config changes. Rollback is purely additive.

---

## 6. Success criteria

| # | Criterion | How we measure |
|---|---|---|
| S1 | First `*.test.ts` lands in `packages/core/src/` and passes. | `npm test` exit code 0; the new file is the only file matched by `packages/core/src/**/*.test.ts`. |
| S2 | CronBuilder no longer relies on three `Select.Root` dropdowns for time entry; time entry uses `<Clock />`. | Visual review + `git diff` shows removal of the HH/MM selects for daily/weekly/monthly. |
| S3 | CronBuilder week tab no longer relies on three-or-seven `Button`s for day-of-week; it uses `<Calendar />` for date picking, with a sidebar list of weekday chips. | Visual review; a11y tree shows `role="grid"` from `react-day-picker`. |
| S4 | Every page uses `<GlassCard>` instead of `<Card>` for content panels. | `git diff` shows `Card` → `GlassCard` with 0 raw `Card` imports left in `pages/`. Sidebar still uses a Radix-native surface (preserved). |
| S5 | BackgroundMesh renders behind the layout and respects `prefers-reduced-motion`. | Manual check + `pnpm dev` + DevTools reduced-motion toggle. |
| S6 | WCAG AA contrast on glass surfaces against `--gray-12` text. | A contrast assertion (no React infra required — see R2) reads `--cb-glass-bg` computed style and asserts ≥ 4.5:1. |
| S7 | `npm run typecheck` exits 0 on both packages. | CI gate (`testing.typecheck.all`). |
| S8 | `scripts/test-cron-builder.ps1` passes against the rebuilt bundle, including a new assertion that `Calendar` and `Clock` are in the built JS. | Smoke exit code 0; assertion logged. |
| S9 | Bundle size delta ≤ 80 KB gzipped (target ≤ 60 KB). | Reported in the sdd-apply commit message; mismatch triggers a `chained-pr` slice (per Gentle-AI skill). |
| S10 | `radix-themes-only` rule is preserved. | No new CSS framework dep in `package.json`; no new `tailwind`/`@shadcn/*` import. Code review. |
| S11 | The pre-existing `/api/cron/describe` and `/api/cron/next` happy paths are unchanged. | Smoke test still passes against the prior screenshots (script unchanged). |

---

## 7. Success criteria summary in one sentence

Phase 11 ships a **real** calendar + clock in CronBuilder, an additive Radix-compatible glass system, and the **first** strict-TDD unit test — within a 80 KB gzipped bundle budget — without violating any rule in `openspec/config.yaml`.

---

## 8. Decisions made without explicit user input (please confirm or override)

1. **Calendar library:** `react-day-picker` v9 (matches the parent's research pin).
2. **Time picker library:** `react-aria-components` `TimeField` (parent's research pin). Optional analog-face library `react-clock` deferred — accessibility comes first.
3. **Glass system scope:** only top-level page surfaces use glass; sidebar + header keep Radix-native solid panels to avoid visual noise (`≤ 8` active glass elements rule).
4. **Strict-TDD gap closer:** extract `parseCron` + `buildCron` from `CronBuilder.tsx` into canonical `packages/core/src/scheduler/cronExpr.ts` and write the first test there. The web keeps its own thin re-export via Vite alias `@cronboard/core/scheduler/cronExpr`.
5. **No new workspace package.** All imports stay inside the two existing workspaces.
6. **No design-system migration.** Radix Themes v3 stays the single design system; glass tokens are CSS variables only.
7. **Bundle budget: 80 KB gz cap.** If we blow it, Phase 11 ships in a chained PR (per `auto-forecast` in preflight).
8. **BackgroundMesh uses CSS keyframes only** — no Framer Motion, no `react-spring`.

See `design.md` for the technical details and `tasks.md` for the TDD-ordered work plan.
