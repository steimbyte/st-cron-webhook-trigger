# Tasks: phase-11-ui-rework

> **Order:** A → B → C → D → E → F. Each phase ends with a self-check gate that must pass before the next phase starts.
> **TDD posture:** Phase A2 lands the first `*.test.ts` (gates `sdd-apply → test-coverage-gap-disclosed`). Every later pure helper introduced by this change gets its test FIRST.
> **File convention:** each task lists the files it touches (R = read, M = modify, C = create).

---

## Phase A — Foundations (deps, tokens, gate wiring)

### A1. Add workspace dependencies
- **R** `packages/web/package.json`
- **M** `packages/web/package.json` — add:
  - `"@cronboard/core": "workspace:*"` (so the UI can import canonical helpers)
  - `"@radix-ui/react-popover": "^1.1.2"` (popovers for Calendar/Clock triggers)
  - `"react-day-picker": "^9.4.0"` (the calendar)
  - `"react-aria-components": "^1.4.1"` (TimeField, DateField)
  - `"date-fns": "^3.6.0"` (formatting for the calendar footer)
- **M** `package.json` (root) — no edit; workspace resolution is already wired.
- **Gate:** `npm install` clean, no peer-dep warnings about React 18.

> `npm install` is **sdd-apply's job**, not this proposal. The task list records the change so sdd-apply knows what to install; nothing is executed during sdd-propose.

### A2. Wire `packages/web` TS path + Vite alias to core
- **M** `packages/web/tsconfig.json` — add `paths: { "@cronboard/core/*": ["../core/src/*"] }` and ensure `baseUrl` is set.
- **M** `packages/web/vite.config.ts` — add `resolve.alias["@cronboard/core"] = path.resolve(__dirname, "../core/src")`.
- **Gate:** `npm run typecheck -w packages/web` passes with a dummy `import { foo } from "@cronboard/core/scheduler/cronExpr"` consumer; remove the dummy before commit.

### A3. Add glass tokens + BackgroundMesh keyframes to `styles.css`
- **M** `packages/web/src/styles.css` — add:
  ```
  :root {
    --cb-glass-bg:        rgba(20, 24, 36, 0.55);   /* dark-theme tuned; light-theme variant in @media (prefers-color-scheme: light) */
    --cb-glass-bg-hover:  rgba(28, 34, 50, 0.65);
    --cb-glass-border:    rgba(255, 255, 255, 0.10);
    --cb-glass-blur:      14px;
    --cb-glass-shadow:    0 8px 24px rgba(0, 0, 0, 0.18);
    --cb-mesh-1: radial-gradient(...);  /* gradient stop list — see design.md */
    --cb-mesh-2: radial-gradient(...);
    --cb-mesh-blur: 60px;
  }

  @supports not (backdrop-filter: blur(8px)) {
    .cb-glass { background: var(--color-panel-solid); }
  }

  @keyframes cb-mesh-drift { ... } /* slow 60s linear */
  @media (prefers-reduced-motion: reduce) {
    .cb-mesh { animation: none; }
  }
  ```
- **Gate:** visual regression: light theme matches existing contrast on the existing Login card.

### A4. Add `@cronboard/core` exports surface (no behavior change)
- **R** `packages/core/src/scheduler/index.ts` (if it exists) or create `packages/core/src/scheduler/cronExpr.ts` and re-export.
- **M** `packages/core/src/scheduler/cronExpr.ts` — declare but **do not yet implement** `parseCron`, `buildCron`, `cronExprRoundTrip`. (Implementation lands in A5.)

### A5. FIRST UNIT TEST (strict-TDD gate) — cronExpr.test.ts
- **C** `packages/core/src/scheduler/cronExpr.ts`
  - Move the parser/builder functions from `packages/web/src/components/CronBuilder.tsx` (verbatim, refactored to remove React types).
  - Discriminated-union `CronExpression` type: `{ kind: 'minute' | 'hour' | 'day' | 'week' | 'month' | 'custom', ... }`.
  - Exports: `parseCron(expr: string): Partial<CronExpression> | null`, `buildCron(state: CronExpression): string`, `cronRoundTrip(expr: string): string | null`.
- **C** `packages/core/src/scheduler/cronExpr.test.ts` — the **first** `*.test.ts` under `packages/core/src/`. Uses `node --test`. Cases:
  - parse `'*/5 * * * *'` → `{ kind: 'minute', minuteInterval: 5 }`
  - parse `'30 */2 * * *'` → `{ kind: 'hour', minute: 30, hourInterval: 2 }`
  - parse `'0 9 * * *'` → `{ kind: 'day', hour: 9, minute: 0 }`
  - parse `'0 9 * * 1-5'` → `{ kind: 'week', hour: 9, minute: 0, days: [1,2,3,4,5] }`
  - parse `'15 14 1 * *'` → `{ kind: 'month', ... }`
  - parse `'*/7 * * * *'` → `{ kind: 'minute', minuteInterval: 7 }` (out-of-list but allowed)
  - parse `'a b c d e f'` → `null`
  - parse `'5-field'` → `null`
  - build: for each known kind, the round-trip `parseCron(buildCron(x))` returns the same canonical state.
  - build + parse round-trip for `'0 9 * * 1,3,5'` and `'*/10 * * * *'`.
- **Gate:** `npm test` exits 0 from the repo root (the runner already exists, see `config.yaml → testing.unit`). This is the test-coverage-gap-disclosed gate.

### A6. Replace CronBuilder-local parseCron/buildCron with @cronboard/core imports
- **M** `packages/web/src/components/CronBuilder.tsx` — replace local `parseCron`/`buildCron` with `import { parseCron, buildCron } from "@cronboard/core/scheduler/cronExpr"`. Behavior preserved; smoke test still passes.
- **Gate:** `npm run typecheck -w packages/web` clean; `scripts/test-cron-builder.ps1` still green.

---

## Phase B — Calendar component (Radix Popover + react-day-picker v9)

> Visual mock-up: see `design.md §3.2`.

### B1. Bare Calendar shell
- **C** `packages/web/src/components/Calendar.tsx`
  - Props: `{ value: Date | null; onChange: (d: Date) => void; minDate?: Date; maxDate?: Date; label?: string; }`.
  - Internal: `@radix-ui/react-popover` Root/Trigger/Portal/Content wrapping `react-day-picker` v9's `DayPicker`.
  - Trigger is a Radix `Button` showing the formatted date (or "Pick a date" placeholder).
  - `react-day-picker` configured with `mode="single"`, `selected={value}`, `onSelect={onChange}`, `showOutsideDays`, `weekStartsOn={1}`.
  - `aria-label` on the trigger; the grid inherits `react-day-picker`'s `role="grid"`.
- **M** `packages/web/src/styles.css` — add `--rdp-*` overrides that read from Radix Themes tokens (only the small set `react-day-picker` exposes).

### B2. Calendar UX polish
- **M** `packages/web/src/components/Calendar.tsx` — add Today button, Clear button, footer caption with formatted selected date in user locale + timezone.
- **Gate:** manual visual review. Lighthouse a11y score on the page containing Calendar ≥ 95 (existing baseline ~98).

### B3. Snapshot contrast check for the glass surface
- **C** `packages/web/src/lib/glassTokens.test.ts` (pure Node — reads `styles.css` via `fs.readFileSync` and parses CSS custom properties; asserts `--cb-glass-bg` value matches the documented rgba in `styles.css`).
  - Also asserts the `@supports not (backdrop-filter)` rule exists.
- **Gate:** `node --test --import tsx packages/web/src/lib/glassTokens.test.ts` exits 0.

> **Note:** this test does NOT render React — it reads the stylesheet as text. Sits in `packages/web/` because it's web-only. Web test infra is still not set up; this file is the seed for it.

---

## Phase C — Clock component (Radix Popover + react-aria-components TimeField)

> Visual mock-up: see `design.md §3.3`.

### C1. Bare Clock shell
- **C** `packages/web/src/components/Clock.tsx`
  - Props: `{ value: { hour: number; minute: number }; onChange: (t: { hour: number; minute: number }) => void; hour12?: boolean; label?: string; }`.
  - Popover wrapping `react-aria-components` `TimeField` + `DateInput` + `Time` segments.
  - Trigger is a Radix `Button` showing `'HH:MM'` or `'HH:MM AM/PM'`.
  - Keyboard: Tab through segments, Arrow up/down to increment by 1, PageUp/PageDown by 10.
  - `aria-label="Pick a time"` on the trigger.

### C2. Clock face (optional analog view)
- **C** `packages/web/src/components/ClockFace.tsx` — a small SVG clock with draggable hour/minute hands. Hover-only; the `TimeField` remains the SR + keyboard backbone (progressive enhancement, not a replacement).
- Pure presentation; no new deps.

### C3. Clock UX polish
- **M** `packages/web/src/components/Clock.tsx` — Now button (sets to current local time, rounded down to nearest 5 minutes), 12h/24h toggle persisted in `localStorage` per-user.

---

## Phase D — CronBuilder rewrite (consumes Calendar + Clock + GlassCard)

> User flow: see `design.md §4`. Per-tab UI states documented there.

### D1. Tab model + state hoist
- **M** `packages/web/src/components/CronBuilder.tsx`
  - Remove `BuilderState`, the four `Select.Root` dropdowns, and the seven `Button`s for day-of-week.
  - New state: `{ kind: 'minute'|'hour'|'day'|'week'|'month'|'custom', date: Date|null, time: { hour: number; minute: number }, days: number[], custom: string }`.
  - On every state change call `buildCron(state)` from `@cronboard/core/scheduler/cronExpr`. **Cron string remains the single source of truth on the wire** — same input/output contract.
  - The existing `CronPreview` is preserved verbatim (semantic for screen readers, used as a live confirmation panel).

### D2. Daily / Weekly / Monthly / Hourly / Minute tabs use Clock
- **M** `packages/web/src/components/CronBuilder.tsx`
  - All tabs use `<Clock value={state.time} onChange={...} label="Pick a time" />`.
  - Custom tab keeps the raw cron `<TextField>` — same as before.

### D3. Weekly tab uses Calendar + weekday chips
- **M** `packages/web/src/components/CronBuilder.tsx`
  - `<Calendar value={state.date} onChange={...} minDate={startOfThisWeek} />` — picks the *reference* date for the weekly schedule; the weekday (Mon/Tue/...) is computed from the picked date and added to `state.days`.
  - Below: an ordered list of selected weekdays as removable chips.

### D4. Monthly tab uses Calendar
- **M** `packages/web/src/components/CronBuilder.tsx`
  - `<Calendar value={state.date} onChange={...} />` — the day-of-month is derived from `state.date.getDate()`.

### D5. Custom tab stays raw — but now lives inside a GlassCard
- **M** `packages/web/src/components/CronBuilder.tsx`
  - Wrap the whole Tab.Root content in `<GlassCard>`. Raw cron textfield remains, accessible, monospace.
  - **NEW**: a small "explain" `Callout` below the input: "Standard 5-field cron. Tip: `?` is not supported; use `*`."

### D6. CronBuilder round-trip test
- **M** `packages/core/src/scheduler/cronExpr.test.ts` — add a `// Phase D round-trip` test block:
  - `parseCron('0 9 * * 1-5')` then `buildCron(...)` round-trips back to `'0 9 * * 1,2,3,4,5'` (canonical comma-list form).
  - `parseCron('15 14 1 * *')` round-trips unchanged.
- **Gate:** `npm test` still green after every D-task.

### D7. CronBuilder accessibility audit
- **M** `packages/web/src/components/CronBuilder.tsx`
  - Tabs keep `aria-controls` references; Calendar and Clock add `aria-describedby` to their respective tabs.
  - The `CronPreview` panel gets `aria-live="polite"` so the human-readable description updates without stealing focus.
- **Gate:** manual a11y review (no React test infra).

---

## Phase E — Page restyle (glass system applied)

### E1. App shell — BackgroundMesh + glass sidebar/header
- **M** `packages/web/src/App.tsx`
  - Add `<BackgroundMesh />` at the top of the layout (under the Theme but above the body).
  - Sidebar content stays on a Radix surface (`var(--color-panel-solid)`), but the existing server-status card swaps to `<GlassCard size="1">`.
  - Main content `<Container>` stays; the page-level surfaces below become GlassCard.

### E2. Dashboard
- **M** `packages/web/src/pages/Dashboard.tsx`
  - KPI cards → `<GlassCard>`. Upcoming / Recent runs panels → `<GlassCard>`.

### E3. JobsPage
- **M** `packages/web/src/pages/JobsPage.tsx`
  - Filter bar → GlassCard. Table → contained in a GlassCard with sticky header.
  - Empty-state → centered glass plate.

### E4. JobEditor
- **M** `packages/web/src/pages/JobEditor.tsx`
  - `<CronBuilder>` already returns a GlassCard wrapper from D5; in JobEditor wrap the name + description + actions cards as GlassCard.
  - Action list items keep their existing Card for legibility, but the outer list becomes a GlassCard.

### E5. RunsPage
- **M** `packages/web/src/pages/RunsPage.tsx`
  - Header bar + table → GlassCard. Detail Dialog keeps solid panel (Radix Theme `Dialog.Content`) for contrast.

### E6. SettingsPage
- **M** `packages/web/src/pages/SettingsPage.tsx`
  - GlassCard around each section. `<pre className="cb-code">` retains solid background (already in `styles.css`).

### E7. Bundle size delta check
- **M** `scripts/test-cron-builder.ps1` — append a snapshot line `wc -c packages/web/dist/assets/*.js` and assert ≤ baseline + 80 KB gz equivalent. Specifically log:
  - `dist/assets/index-*.js` size
  - Document delta in the sdd-apply commit body.
- **Gate:** exit 0.

---

## Phase F — Polish & accessibility audit

### F1. Focus rings on glass surfaces
- **M** `packages/web/src/styles.css` — every `.cb-glass` and its `:focus-within` gets a 2px outline using `var(--accent-8)`. No `:focus-visible` outline removal.

### F2. Reduced-motion short-circuit
- **M** `packages/web/src/components/BackgroundMesh.tsx`
  - Inspect `window.matchMedia('(prefers-reduced-motion: reduce)')` once on mount; render a static gradient for users with reduced motion.
- **M** `packages/web/src/styles.css` — CSS-level fallback (already in A3) plus the JS-level nudge in case the user toggles mid-session.

### F3. Contrast checker script (one-shot, manual)
- **C** `scripts/check-contrast.mjs` — a quick standalone Node script (no deps) that reads `--cb-glass-bg` and `--gray-12` from `styles.css`, computes relative luminance, and asserts ratio ≥ 4.5:1. Documented in `design.md §5`. **Not** a test, not wired into CI — just a manual verification tool. Gate sdd-apply includes its result in the commit body.

### F4. Smoke script update for Calendar/Clock presence
- **M** `scripts/test-cron-builder.ps1` — after the build step, assert that `packages/web/dist/assets/index-*.js` contains the strings `react-day-picker` class hashes AND `react-aria-components` chunks (string match is sufficient and stable).
- **Gate:** script exits 0.

### F5. Visual regression snippet
- **C** `openspec/changes/phase-11-ui-rework/snapshot-notes.md` — short markdown describing the *expected* look (3-5 bullets). Used in `sdd-verify` review.
- Not committed into source; lives next to the proposal.

---

## Cross-phase checks (run before declaring sdd-apply done)

- [ ] `npm run typecheck` exit 0 (both packages)
- [ ] `npm test` exit 0 (the new `cronExpr.test.ts` passes)
- [ ] `node --test --import tsx packages/web/src/lib/glassTokens.test.ts` exit 0
- [ ] `scripts/test-cron-builder.ps1` exit 0 — including the new Calendar/Clock presence assertion
- [ ] `scripts/smoke.ps1` exit 0 — `/api/cron/describe` + `/api/cron/next` unchanged
- [ ] `scripts/check-contrast.mjs` exit 0
- [ ] Bundle delta ≤ 80 KB gz (logged)
- [ ] `radix-themes-only` preserved — `grep -R "tailwind\|shadcn" packages/` returns nothing
- [ ] Existing Phase 1-10 functionality preserved (JobsPage CRUD, RunsPage filter, JobEditor save, SettingsPage read)

---

## Sequenced summary (read top-to-bottom)

```
A1 deps → A2 alias → A3 tokens → A4 cronExpr scaffold → A5 first test → A6 consume test
  → B1 Calendar shell → B2 polish → B3 token contrast test
  → C1 Clock shell → C2 analog face → C3 polish
  → D1 CronBuilder tab hoist → D2 Clock in tabs → D3 Calendar in week → D4 Calendar in month → D5 Glass wrap + Custom Callout → D6 round-trip tests → D7 a11y labels
  → E1 App shell → E2 Dashboard → E3 JobsPage → E4 JobEditor → E5 RunsPage → E6 SettingsPage → E7 bundle check
  → F1 focus → F2 reduced-motion → F3 contrast script → F4 smoke script → F5 snapshot notes
```
