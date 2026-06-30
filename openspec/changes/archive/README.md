# Archived SDD changes

Each directory below is one shipped and archived OpenSpec change. Artifacts
are append-only — never edit a file in here. To supersede one, open a new
change under `openspec/changes/<new-id>/`.

## phase-11-ui-rework
UI rework: glass surfaces (GlassCard + BackgroundMesh), real Calendar
(`react-day-picker` v9 wrapped in `@radix-ui/react-popover`) and Clock
(`react-aria-components` TimeField) selectors, first `*.test.ts` (47 cases
in `cronExpr.test.ts`), CronBuilder rewrite, page-by-page glass restyle.

- Base commit: `090b7ab`
- Tip commit: `057be5a`
- Verify verdict: **APPROVED WITH FOLLOW-UPS** (1 MEDIUM, 6 LOW)
- Bundle delta: +77.79 kB gz (under 80 kB budget)

## phase-11-followup-calendar-wiring
Follow-up that closes the MEDIUM finding from `phase-11-ui-rework/verify-report.md`:
the Calendar component in CronBuilder Weekly + Monthly tabs was wired as a
no-op placeholder. Replaced with proper interactive usage (click a date in
Weekly → toggle that weekday via `weekdayInTimezone`; click a date in
Monthly → set the day-of-month via `dayOfMonthInTimezone` / `dateForDayOfMonth`).
Added 16 new unit tests in `cronExpr.test.ts` (63/63 pass).

- Tip commit: see git log for the commit immediately after `057be5a` that
  modifies `packages/web/src/components/Calendar.tsx`,
  `packages/web/src/components/CronBuilder.tsx`, and
  `packages/core/src/scheduler/cronExpr.ts`/`.test.ts`.