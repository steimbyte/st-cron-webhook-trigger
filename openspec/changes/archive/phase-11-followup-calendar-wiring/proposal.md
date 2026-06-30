# Proposal — phase-11-followup-calendar-wiring

## Change ID
`phase-11-followup-calendar-wiring`

## What
Wire the Calendar component in `packages/web/src/components/CronBuilder.tsx` so it is the actual date selector for **Weekly** (clicking a date toggles that weekday) and **Monthly** (clicking a date sets the day-of-month) instead of the current no-op placeholder.

## Why
`sdd-verify` flagged this as **MEDIUM**: the original `design.md §4.1` for `phase-11-ui-rework` described Calendar in Weekly/Monthly as the day-selection UI, but the executor left the Calendar wired to `value={null}` with an empty `onChange`. Two of seven tabs in the builder render an interactive-looking control that does nothing. That is a real UX defect, not a nit.

## Scope

### IN
- `packages/core/src/scheduler/cronExpr.ts` — add two pure helpers:
  - `datesForWeekdaysInMonth(weekdays: number[], month: Date, timezone: string): Date[]`
  - `dayOfMonthInTimezone(d: Date, timezone: string): number`
- `packages/core/src/scheduler/cronExpr.test.ts` — test cases for both helpers (positive + edge cases: empty weekdays → `[]`, weekday `0..6`, day-of-month `1..31`, timezone offset at boundary days).
- `packages/web/src/components/Calendar.tsx` — extend to support `mode="multiple"` (DayPicker already supports it; surface as new `multiValue: Date[] | null` + `onMultiChange: (dates: Date[] | null) => void` props; keep `value`/`onChange` for single mode).
- `packages/web/src/components/CronBuilder.tsx` — rewrite the Weekly tab to use Calendar as the primary weekday picker (replace the 7-button row with an interactive Calendar whose clicks toggle `state.days`); rewrite the Monthly tab to use Calendar as the day-of-month picker (replace the Select with an interactive Calendar whose clicks set `state.dayOfMonth`). Keep a small textual readout of the current selection (e.g., `Weekdays: Mo, Tu, We, Th, Fr` and `Day: 15`) so the UI is still self-describing.

### OUT
- No new dependencies.
- No API/storage/scheduler changes.
- No glassmorphism or color-token changes.
- No `CronPreview` changes.
- No new tabs (Daily stays untouched).

## Risks
- **Calendar component becomes more complex.** Mitigated by keeping the single-mode API backwards-compatible (`value`/`onChange` still work as before).
- **Wrong-weekday-from-UTC bug.** Naive `getDay()` returns the weekday in the server's local timezone, not the user's. The new helpers explicitly take a `timezone: string` arg and use `Intl.DateTimeFormat({ timeZone })` for the weekday and day-of-month extraction. Tests cover this.

## Acceptance criteria
- Typecheck: `npm run typecheck` exits 0 on both packages.
- Unit: `node --test --import tsx packages/core/src/scheduler/cronExpr.test.ts` passes including the new cases.
- Smoke: `powershell -ExecutionPolicy Bypass -File scripts/smoke-ui.ps1` still completes with HTTP 200 on /api/health, /api/jobs CRUD, /api/cron/next, and the static UI.
- Manual (post-merge, captured in commit message): a screenshot or quick description of the Weekly tab with `Mon-Fri` highlighted in the calendar grid.
- `sdd-verify` for this change may be inline (single PR, ≤ 200 LOC net diff); full ceremony not required for a micro-follow-up.

## How to test
1. `npm run typecheck` (both packages).
2. `node --test --import tsx packages/core/src/scheduler/cronExpr.test.ts`.
3. `npm run build && powershell -ExecutionPolicy Bypass -File scripts/smoke-ui.ps1`.
4. Open `http://localhost:3737/`, edit any job, switch to the Weekly tab: clicking a date in the calendar should toggle that weekday in the readout (and in the chip row if retained). Switch to the Monthly tab: clicking a date should set the day-of-month readout and the next-runs preview should reflect the new day.

## Rollback
Revert the single commit. No data migration needed (cron strings are unchanged on the wire).