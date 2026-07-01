// v0.7.1-ui-dropdown — pure helper: turn a `CronExpressionState` into a
// single English sentence that says what the cron means ("Fires at 09:00 on
// weekdays", "Every 5 minutes", …).
//
// Lives entirely client-side, no API roundtrip (D4). Used in the CronBuilder
// modal directly under the preset card grid so the user can verify the
// meaning of the cron they're about to save without parsing the raw string.
//
// Companion to `actionSummary.ts` (v0.7.0) and `relativeTime.ts` / `runStatus.ts`
// in the same directory. Pure: no React, no DOM, no I/O. Tested by
// `cronDescription.test.ts`.

import type { CronExpressionState } from "../../../core/src/scheduler/cronExpr.js";

const WEEKDAY_NAMES_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Pad a non-negative integer to two digits ("9" → "09"). */
function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Format hour:minute as zero-padded 24-hour HH:MM. */
function timeString(hour: number, minute: number): string {
  return `${pad2(hour)}:${pad2(minute)}`;
}

/**
 * Render the weekday list as a short English phrase. Special-cases:
 *  - weekdays: [1,2,3,4,5] → "weekdays"
 *  - weekends: [0,6]       → "weekends"
 *  - empty:                → "every day" (fallback for `week` with no days)
 *  - otherwise: comma-separated short names sorted ascending.
 */
function describeDays(days: number[]): string {
  const sorted = [...days].sort((a, b) => a - b);
  const set = new Set(sorted);
  if (set.size === 5 && [1, 2, 3, 4, 5].every((d) => set.has(d))) return "weekdays";
  if (set.size === 2 && set.has(0) && set.has(6)) return "weekends";
  if (sorted.length === 0) return "every day";
  return sorted.map((d) => WEEKDAY_NAMES_SHORT[d]).join(", ");
}

/**
 * Return a single-sentence English description of `state` suitable for
 * inline display next to the active preset in the CronBuilder modal.
 *
 * Examples:
 *   formatDescription({ kind: "minute", minuteInterval: 5, ... }) === "Every 5 minutes"
 *   formatDescription({ kind: "day", hour: 9, minute: 0, ... })    === "Fires at 09:00 every day"
 *   formatDescription({ kind: "week", hour: 9, minute: 0, days: [1,2,3,4,5], ... })
 *     === "Fires at 09:00 on weekdays"
 *   formatDescription({ kind: "custom", custom: "every-five-minutes-cron", ... }) ===
 *     "Custom: every-five-minutes-cron"   // (placeholder, see tests for real cron strings)
 *
 * Pure / synchronous / no side effects.
 */
export function formatDescription(state: CronExpressionState): string {
  const t = timeString(state.hour, state.minute);
  switch (state.kind) {
    case "minute":
      return state.minuteInterval === 1
        ? "Every minute"
        : `Every ${state.minuteInterval} minutes`;
    case "hour":
      return `Fires at minute ${state.minute} of every ${
        state.hourInterval === 1 ? "hour" : `${state.hourInterval} hours`
      }`;
    case "day":
      return `Fires at ${t} every day`;
    case "week": {
      // When no weekdays are picked, fall back to "every day" (matches the
      // day-kind phrasing) rather than "on every day" — see design §2.2.
      if (state.days.length === 0) return `Fires at ${t} every day`;
      return `Fires at ${t} on ${describeDays(state.days)}`;
    }
    case "month":
      return `Fires at ${t} on day ${state.dayOfMonth} of every month`;
    case "custom": {
      const trimmed = state.custom.trim();
      if (!trimmed) return "Custom: (empty)";
      return `Custom: ${trimmed}`;
    }
  }
}
