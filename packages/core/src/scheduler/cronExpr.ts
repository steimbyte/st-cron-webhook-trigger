// Canonical parse / build helpers for the 5-field cron expressions used by
// cronboard. This module is intentionally pure (no React, no DOM, no I/O) so
// it can be unit-tested with `node --test` and consumed by both the
// scheduler (server-side) and the web UI (via the Vite path alias
// `@cronboard/core/scheduler/cronExpr`).
//
// Behaviour is preserved verbatim from the previous in-component
// implementation in `packages/web/src/components/CronBuilder.tsx`; only the
// shape of the returned/accepted state was tightened into a discriminated
// union so we can round-trip through the tab-driven UI.

export type CronKind = "minute" | "hour" | "day" | "week" | "month" | "custom";

/**
 * Shape of the cron-builder UI state. Each tab reads/writes the fields it
 * cares about; `buildCron` only inspects the fields relevant to the active
 * `kind`. Switching tabs preserves compatible fields.
 */
export interface CronExpressionState {
  kind: CronKind;
  /** Every N minutes (1, 2, 5, 10, 15, 20, 30). */
  minuteInterval: number;
  /** Every N hours (1, 2, 3, 4, 6, 8, 12). */
  hourInterval: number;
  /** 0-23 */
  hour: number;
  /** 0-59 */
  minute: number;
  /** 0=Sun..6=Sat, for "week" */
  days: number[];
  /** 1-31, for "month" */
  dayOfMonth: number;
  /** Raw expression, for "custom" */
  custom: string;
}

/**
 * The default UI state. The UI starts on the "Daily" tab at 12:00 with
 * Mon-Fri weekdays pre-selected so a new job is immediately useful.
 */
export function defaultCronState(): CronExpressionState {
  return {
    kind: "day",
    minuteInterval: 5,
    hourInterval: 1,
    hour: 12,
    minute: 0,
    days: [1, 2, 3, 4, 5],
    dayOfMonth: 1,
    custom: "",
  };
}

/**
 * The minute-interval options surfaced in the UI. Used by the parser to
 * validate star-slash-N values: anything outside this list is rejected
 * (we fall back to 5) so a stray star-slash-7 doesn't get silently accepted.
 */
export const MINUTE_INTERVAL_OPTIONS: readonly number[] = [1, 2, 5, 10, 15, 20, 30];

/** The hour-interval options surfaced in the UI. */
export const HOUR_INTERVAL_OPTIONS: readonly number[] = [1, 2, 3, 4, 6, 8, 12];

/**
 * Clamp a number into an inclusive range. Used for hour/minute/dayOfMonth
 * fields so a malformed `25` doesn't crash the UI.
 */
export function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Round an interval value to the nearest allowed option. If `n` is not in
 * `allowed`, return 5 (the safest default for both minutes and hours).
 */
export function clampInterval(n: number, allowed: readonly number[] = MINUTE_INTERVAL_OPTIONS): number {
  if (!Number.isFinite(n)) return 5;
  return allowed.includes(n) ? n : 5;
}

/**
 * Build a canonical 5-field cron expression from a UI state. Pure: same
 * input -> same output, no side effects, no clock reads.
 *
 * The `kind` switch determines which fields are inspected. For "custom"
 * the raw string is passed through verbatim, trimmed.
 */
export function buildCron(s: CronExpressionState): string {
  const m = String(s.minute);
  const h = String(s.hour);
  switch (s.kind) {
    case "minute":
      return `*/${s.minuteInterval} * * * *`;
    case "hour":
      return `${m} */${s.hourInterval} * * *`;
    case "day":
      return `${m} ${h} * * *`;
    case "week": {
      const days = s.days.length > 0 ? [...s.days].sort((a, b) => a - b).join(",") : "*";
      return `${m} ${h} * * ${days}`;
    }
    case "month":
      return `${m} ${h} ${s.dayOfMonth} * *`;
    case "custom":
      return s.custom.trim();
  }
}

/**
 * Best-effort reverse parse. Returns a `Partial<CronExpressionState>`
 * describing what the expression *looks like*, or `null` if the expression
 * doesn't match one of the recognised patterns. The caller (the UI) then
 * either pre-fills the matching tab or falls back to the "custom" tab.
 *
 * Patterns recognised (in order):
 *   - star-slash-N * * * *            → minute
 *   - M star-slash-N * * *            → hour
 *   - M H * * *                       → day
 *   - M H D * *                       → month
 *   - M H * * D[,D][-D]               → week  (single, list, or range)
 *
 * Anything else (6-field, month != *, ?-syntax, named days, ...) returns
 * `null` and the UI switches to "custom".
 */
export function parseCron(expr: string): Partial<CronExpressionState> | null {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [m, h, dom, mon, dow] = parts;
  if (mon !== "*") return null;

  // */N * * * *
  const mMin = m.match(/^\*\/(\d+)$/);
  if (mMin && h === "*" && dom === "*" && dow === "*") {
    return { kind: "minute", minuteInterval: clampInterval(parseInt(mMin[1], 10)) };
  }

  // M */N * * *
  const hMin = h.match(/^\*\/(\d+)$/);
  if (hMin && dom === "*" && dow === "*" && /^\d+$/.test(m)) {
    return {
      kind: "hour",
      hourInterval: clampInterval(parseInt(hMin[1], 10), HOUR_INTERVAL_OPTIONS),
      minute: clamp(parseInt(m, 10), 0, 59),
    };
  }

  // M H * * *
  if (/^\d+$/.test(m) && /^\d+$/.test(h) && dom === "*" && dow === "*") {
    return {
      kind: "day",
      minute: clamp(parseInt(m, 10), 0, 59),
      hour: clamp(parseInt(h, 10), 0, 23),
    };
  }

  // M H D * *
  if (/^\d+$/.test(m) && /^\d+$/.test(h) && /^\d+$/.test(dom) && dow === "*") {
    return {
      kind: "month",
      minute: clamp(parseInt(m, 10), 0, 59),
      hour: clamp(parseInt(h, 10), 0, 23),
      dayOfMonth: clamp(parseInt(dom, 10), 1, 31),
    };
  }

  // M H * * D...  (single, list, or range like 1-5)
  if (
    /^\d+$/.test(m) &&
    /^\d+$/.test(h) &&
    dom === "*" &&
    /^[0-6,\-*]+$/.test(dow) &&
    !/^\*\/(\d+)$/.test(dow) &&
    dow !== "*"
  ) {
    const daySet = new Set<number>();
    for (const part of dow.split(",")) {
      if (part.includes("-")) {
        const [a, b] = part.split("-").map((x) => parseInt(x, 10));
        if (!isNaN(a) && !isNaN(b)) {
          for (let i = a; i <= b; i++) daySet.add(i);
        }
      } else {
        const d = parseInt(part, 10);
        if (!isNaN(d)) daySet.add(d);
      }
    }
    if (daySet.size > 0) {
      return {
        kind: "week",
        minute: clamp(parseInt(m, 10), 0, 59),
        hour: clamp(parseInt(h, 10), 0, 23),
        days: [...daySet].sort((a, b) => a - b),
      };
    }
  }

  return null;
}

/**
 * Convenience: round-trip a cron string through the parser and the builder.
 * Returns the canonical string (sorted weekday lists, normalised spacing)
 * or `null` if the input isn't recognisable. Useful for tests and the
 * CronBuilder's "did the user actually change anything?" check.
 */
export function cronRoundTrip(expr: string): string | null {
  const parsed = parseCron(expr);
  if (!parsed || !parsed.kind) return null;
  // Merge parsed partial into defaults so buildCron has every field.
  const merged: CronExpressionState = { ...defaultCronState(), ...parsed } as CronExpressionState;
  return buildCron(merged);
}

// ─────────────────────────────────────────────────────────────────────────────
// Date helpers used by the visual Calendar in CronBuilder (Weekly + Monthly
// tabs). All helpers are timezone-aware via Intl.DateTimeFormat so a job
// scheduled in Europe/Berlin picks the right weekday / day-of-month for the
// user, not for the server.
// ─────────────────────────────────────────────────────────────────────────────

const WEEKDAY_SHORT_MAP: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

/**
 * Return the weekday (0=Sun..6=Sat) of the given Date *interpreted in the
 * given IANA timezone*. Without `timezone`, the server's local timezone
 * would be used, which is wrong if the user is in a different tz than the
 * daemon.
 */
export function weekdayInTimezone(d: Date, timezone: string): number {
  const text = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
  }).format(d);
  return WEEKDAY_SHORT_MAP[text] ?? 0;
}

/**
 * Return the day-of-month (1..31) of the given Date *interpreted in the
 * given IANA timezone*. Same reasoning as `weekdayInTimezone`.
 */
export function dayOfMonthInTimezone(d: Date, timezone: string): number {
  const text = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    day: "numeric",
  }).format(d);
  const n = parseInt(text, 10);
  return Number.isFinite(n) ? n : 1;
}

/**
 * Return the (year, month 1-12) of `d` interpreted in `timezone`.
 */
function yearMonthInTimezone(d: Date, timezone: string): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(d);
  const year = parseInt(parts.find((p) => p.type === "year")?.value ?? "1970", 10);
  const month = parseInt(parts.find((p) => p.type === "month")?.value ?? "1", 10);
  return { year, month };
}

/**
 * Return every Date in the calendar month containing `month` whose weekday
 * (in `timezone`) is in the `weekdays` list. Each returned Date is anchored
 * at noon UTC on the corresponding calendar day so DST boundaries cannot
 * push it into the previous or next day.
 *
 * `weekdays` uses 0=Sun..6=Sat to match the rest of this module.
 *
 * Examples (in `Europe/Berlin`):
 *   datesForWeekdaysInMonth([1, 2, 3, 4, 5], new Date("2026-06-15"), "Europe/Berlin")
 *     → [Date for Mon 1 Jun, Tue 2 Jun, Wed 3 Jun, Thu 4 Jun, Fri 5 Jun,
 *        Mon 8 Jun, Tue 9 Jun, Wed 10 Jun, Thu 11 Jun, Fri 12 Jun,
 *        Mon 15 Jun, Tue 16 Jun, Wed 17 Jun, Thu 18 Jun, Fri 19 Jun,
 *        Mon 22 Jun, Tue 23 Jun, Wed 24 Jun, Thu 25 Jun, Fri 26 Jun,
 *        Mon 29 Jun, Tue 30 Jun]
 */
export function datesForWeekdaysInMonth(
  weekdays: number[],
  month: Date,
  timezone: string,
): Date[] {
  if (weekdays.length === 0) return [];
  const wanted = new Set(weekdays.filter((w) => Number.isFinite(w) && w >= 0 && w <= 6));
  if (wanted.size === 0) return [];

  const { year, month: m } = yearMonthInTimezone(month, timezone);
  // Last day of the month: day 0 of the next month in UTC.
  const daysInMonth = new Date(Date.UTC(year, m, 0)).getUTCDate();

  const out: Date[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    // Anchor at noon UTC to stay clear of DST edges in any timezone.
    const candidate = new Date(Date.UTC(year, m - 1, d, 12));
    const wd = weekdayInTimezone(candidate, timezone);
    if (wanted.has(wd)) out.push(candidate);
  }
  return out;
}

/**
 * Convenience: build a Date that, when interpreted in `timezone`, falls on
 * day-of-month `day` of the month containing `reference`. Returns the first
 * valid occurrence (capped to the last day of the month, so day=31 in
 * February returns Feb 28/29).
 */
export function dateForDayOfMonth(day: number, reference: Date, timezone: string): Date {
  const { year, month } = yearMonthInTimezone(reference, timezone);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const safeDay = clamp(day, 1, daysInMonth);
  return new Date(Date.UTC(year, month - 1, safeDay, 12));
}
