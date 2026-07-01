// v0.7.1-ui-dropdown — strict-TDD test suite for `formatDescription`.
//
// This is the FIRST test file for the v0.7.1 change; the matching
// `cronDescription.ts` does NOT exist yet at the time this file is written,
// so all tests below must fail with `Cannot find module './cronDescription.js'`
// in the RED step (T1). T2 lands the implementation; the lock-in is here.
//
// Contract source: openspec/changes/v0.7.1-ui-dropdown/design.md §2.1 + §2.2.
// Mirrors the v0.7.0 pattern (actionSummary.test.ts) so `npm run test:web`
// picks it up automatically once we extend the script in T2.2.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatDescription } from "./cronDescription.js";
import { defaultCronState } from "../../../core/src/scheduler/cronExpr.js";
import type { CronExpressionState } from "../../../core/src/scheduler/cronExpr.js";

// ---------------------------------------------------------------------------
// Test fixture helpers — each builder returns a fully-populated CronExpressionState
// derived from defaultCronState() so adding a new field tomorrow only requires a
// single edit in cronExpr.ts, not 14 edits in this file.
// ---------------------------------------------------------------------------

function state(overrides: Partial<CronExpressionState>): CronExpressionState {
  return { ...defaultCronState(), ...overrides };
}

// ===========================================================================
// minute
// ===========================================================================

describe("formatDescription (minute)", () => {
  it("renders 'Every N minutes' for standard minute interval", () => {
    assert.equal(
      formatDescription(state({ kind: "minute", minuteInterval: 5 })),
      "Every 5 minutes",
    );
  });

  it("renders singular 'Every minute' when interval is 1", () => {
    assert.equal(
      formatDescription(state({ kind: "minute", minuteInterval: 1 })),
      "Every minute",
    );
  });

  it("handles 30 minutes", () => {
    assert.equal(
      formatDescription(state({ kind: "minute", minuteInterval: 30 })),
      "Every 30 minutes",
    );
  });
});

// ===========================================================================
// hour
// ===========================================================================

describe("formatDescription (hour)", () => {
  it("renders 'minute M of every N hours' for standard hour interval", () => {
    assert.equal(
      formatDescription(state({ kind: "hour", minute: 30, hourInterval: 2 })),
      "Fires at minute 30 of every 2 hours",
    );
  });

  it("renders singular 'every hour' when hourInterval is 1", () => {
    assert.equal(
      formatDescription(state({ kind: "hour", minute: 0, hourInterval: 1 })),
      "Fires at minute 0 of every hour",
    );
  });

  it("handles 15 minutes of every 4 hours", () => {
    assert.equal(
      formatDescription(state({ kind: "hour", minute: 15, hourInterval: 4 })),
      "Fires at minute 15 of every 4 hours",
    );
  });
});

// ===========================================================================
// day
// ===========================================================================

describe("formatDescription (day)", () => {
  it("renders 'Fires at HH:MM every day' for a standard 09:00", () => {
    assert.equal(
      formatDescription(state({ kind: "day", hour: 9, minute: 0 })),
      "Fires at 09:00 every day",
    );
  });

  it("renders midnight as 00:00", () => {
    assert.equal(
      formatDescription(state({ kind: "day", hour: 0, minute: 0 })),
      "Fires at 00:00 every day",
    );
  });

  it("renders 17:30 with two-digit pad", () => {
    assert.equal(
      formatDescription(state({ kind: "day", hour: 17, minute: 30 })),
      "Fires at 17:30 every day",
    );
  });
});

// ===========================================================================
// week
// ===========================================================================

describe("formatDescription (week)", () => {
  it("renders 'on weekdays' for [1,2,3,4,5]", () => {
    assert.equal(
      formatDescription(state({ kind: "week", days: [1, 2, 3, 4, 5], hour: 9, minute: 0 })),
      "Fires at 09:00 on weekdays",
    );
  });

  it("renders 'on weekends' for [0,6]", () => {
    assert.equal(
      formatDescription(state({ kind: "week", days: [0, 6], hour: 10, minute: 30 })),
      "Fires at 10:30 on weekends",
    );
  });

  it("renders an explicit list 'on Mon, Wed, Fri' for [1,3,5]", () => {
    assert.equal(
      formatDescription(state({ kind: "week", days: [1, 3, 5], hour: 14, minute: 15 })),
      "Fires at 14:15 on Mon, Wed, Fri",
    );
  });

  it("falls back to 'every day' when days is empty", () => {
    assert.equal(
      formatDescription(state({ kind: "week", days: [], hour: 9, minute: 0 })),
      "Fires at 09:00 every day",
    );
  });

  it("sorts out-of-order weekdays before rendering", () => {
    assert.equal(
      formatDescription(state({ kind: "week", days: [5, 1, 3], hour: 9, minute: 0 })),
      "Fires at 09:00 on Mon, Wed, Fri",
    );
  });
});

// ===========================================================================
// month
// ===========================================================================

describe("formatDescription (month)", () => {
  it("renders 'on day N of every month' for standard day 15", () => {
    assert.equal(
      formatDescription(state({ kind: "month", dayOfMonth: 15, hour: 9, minute: 0 })),
      "Fires at 09:00 on day 15 of every month",
    );
  });

  it("renders 'on day 1 of every month' for the first of the month", () => {
    assert.equal(
      formatDescription(state({ kind: "month", dayOfMonth: 1, hour: 8, minute: 30 })),
      "Fires at 08:30 on day 1 of every month",
    );
  });

  it("renders 'on day 31 of every month' for the last day", () => {
    assert.equal(
      formatDescription(state({ kind: "month", dayOfMonth: 31, hour: 23, minute: 59 })),
      "Fires at 23:59 on day 31 of every month",
    );
  });
});

// ===========================================================================
// custom
// ===========================================================================

describe("formatDescription (custom)", () => {
  it("renders 'Custom: <expression>' for a standard cron string", () => {
    const out = formatDescription(state({ kind: "custom", custom: "*/5 * * * *" }));
    assert.ok(out.startsWith("Custom: "), `expected 'Custom: ' prefix, got: ${out}`);
    assert.ok(out.includes("*/5 * * * *"), `expected expression in output, got: ${out}`);
  });

  it("renders 'Custom: <expression>' for a 09:00 weekdays cron", () => {
    const out = formatDescription(state({ kind: "custom", custom: "0 9 * * 1-5" }));
    assert.equal(out, "Custom: 0 9 * * 1-5");
  });

  it("renders 'Custom: (empty)' for an empty expression", () => {
    assert.equal(
      formatDescription(state({ kind: "custom", custom: "" })),
      "Custom: (empty)",
    );
  });

  it("renders 'Custom: (empty)' for whitespace-only expression", () => {
    assert.equal(
      formatDescription(state({ kind: "custom", custom: "   " })),
      "Custom: (empty)",
    );
  });
});
