// Unit tests for the canonical parse / build helpers in cronExpr.ts.
// Run with: npm test   (the root `test` script in package.json wires this
// to `node --test --import tsx packages/core/src/**/*.test.ts`).
//
// This is the FIRST `*.test.ts` file under packages/core/src/ — it lands
// here to close the strict-TDD coverage gap that `rule:
// test-coverage-gap-disclosed` in openspec/config.yaml was guarding.
//
// TDD posture: each test below names a contract from the proposal's
// tasks.md (A5) and the design's per-tab UI states. The implementation
// must pass every test below.

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  buildCron,
  parseCron,
  cronRoundTrip,
  defaultCronState,
  clamp,
  clampInterval,
  MINUTE_INTERVAL_OPTIONS,
  HOUR_INTERVAL_OPTIONS,
  type CronExpressionState,
} from "./cronExpr.js";

describe("parseCron — minute interval", () => {
  it("'*/5 * * * *' → minute every 5", () => {
    assert.deepEqual(parseCron("*/5 * * * *"), { kind: "minute", minuteInterval: 5 });
  });

  it("'*/10 * * * *' → minute every 10", () => {
    assert.deepEqual(parseCron("*/10 * * * *"), { kind: "minute", minuteInterval: 10 });
  });

  it("'*/7 * * * *' clamps to default (5) since 7 is not in the allowed list", () => {
    assert.deepEqual(parseCron("*/7 * * * *"), { kind: "minute", minuteInterval: 5 });
  });
});

describe("parseCron — hourly", () => {
  it("'30 */2 * * *' → hour with minute=30, hourInterval=2", () => {
    assert.deepEqual(parseCron("30 */2 * * *"), { kind: "hour", minute: 30, hourInterval: 2 });
  });

  it("'0 */4 * * *' → hour with minute=0, hourInterval=4", () => {
    assert.deepEqual(parseCron("0 */4 * * *"), { kind: "hour", minute: 0, hourInterval: 4 });
  });
});

describe("parseCron — daily", () => {
  it("'0 9 * * *' → day at 09:00", () => {
    assert.deepEqual(parseCron("0 9 * * *"), { kind: "day", hour: 9, minute: 0 });
  });

  it("'30 17 * * *' → day at 17:30", () => {
    assert.deepEqual(parseCron("30 17 * * *"), { kind: "day", hour: 17, minute: 30 });
  });
});

describe("parseCron — weekly", () => {
  it("'0 9 * * 1-5' → weekdays 09:00", () => {
    assert.deepEqual(parseCron("0 9 * * 1-5"), {
      kind: "week",
      hour: 9,
      minute: 0,
      days: [1, 2, 3, 4, 5],
    });
  });

  it("'0 9 * * 1,3,5' → individual days", () => {
    assert.deepEqual(parseCron("0 9 * * 1,3,5"), {
      kind: "week",
      hour: 9,
      minute: 0,
      days: [1, 3, 5],
    });
  });

  it("'30 8 * * 0,6' → weekend days sorted ascending", () => {
    assert.deepEqual(parseCron("30 8 * * 6,0"), {
      kind: "week",
      hour: 8,
      minute: 30,
      days: [0, 6],
    });
  });
});

describe("parseCron — monthly", () => {
  it("'15 14 1 * *' → 1st of the month at 14:15", () => {
    assert.deepEqual(parseCron("15 14 1 * *"), {
      kind: "month",
      hour: 14,
      minute: 15,
      dayOfMonth: 1,
    });
  });

  it("'0 0 15 * *' → 15th of the month at 00:00", () => {
    assert.deepEqual(parseCron("0 0 15 * *"), {
      kind: "month",
      hour: 0,
      minute: 0,
      dayOfMonth: 15,
    });
  });
});

describe("parseCron — rejections", () => {
  it("garbage 'a b c d e f' → null", () => {
    assert.equal(parseCron("a b c d e f"), null);
  });

  it("six-field expression '0 0 12 * * *' → null", () => {
    assert.equal(parseCron("0 0 12 * * *"), null);
  });

  it("four-field expression '0 9 * *' → null", () => {
    assert.equal(parseCron("0 9 * *"), null);
  });

  it("non-`*` month '0 9 * 6 *' → null (we don't support month-field expressions yet)", () => {
    assert.equal(parseCron("0 9 * 6 *"), null);
  });

  it("wildcard weekday '0 9 * * *' is recognised as daily, not weekly", () => {
    const r = parseCron("0 9 * * *");
    assert.notEqual(r, null);
    assert.equal(r?.kind, "day");
  });

  it("empty string → null", () => {
    assert.equal(parseCron(""), null);
  });

  it("non-`*` minute without `*/N` hour is not the hour pattern", () => {
    // The hour pattern requires `*/N` in the hour field, not bare `*`.
    // '15 * * * *' is not in our recognised pattern set, so the UI must
    // fall back to "custom" (the original CronBuilder behaviour).
    assert.equal(parseCron("15 * * * *"), null);
  });
});

describe("buildCron", () => {
  it("minute: */5", () => {
    const s: CronExpressionState = { ...defaultCronState(), kind: "minute", minuteInterval: 5 };
    assert.equal(buildCron(s), "*/5 * * * *");
  });

  it("hour: minute=30 every 2 hours", () => {
    const s: CronExpressionState = {
      ...defaultCronState(),
      kind: "hour",
      minute: 30,
      hourInterval: 2,
    };
    assert.equal(buildCron(s), "30 */2 * * *");
  });

  it("day: 09:00 every day", () => {
    const s: CronExpressionState = { ...defaultCronState(), kind: "day", hour: 9, minute: 0 };
    assert.equal(buildCron(s), "0 9 * * *");
  });

  it("week: 09:00 Mon-Fri → canonical comma list", () => {
    const s: CronExpressionState = {
      ...defaultCronState(),
      kind: "week",
      hour: 9,
      minute: 0,
      days: [1, 2, 3, 4, 5],
    };
    assert.equal(buildCron(s), "0 9 * * 1,2,3,4,5");
  });

  it("week: unsorted days are sorted", () => {
    const s: CronExpressionState = {
      ...defaultCronState(),
      kind: "week",
      hour: 9,
      minute: 0,
      days: [5, 1, 3],
    };
    assert.equal(buildCron(s), "0 9 * * 1,3,5");
  });

  it("week: empty days falls back to '*'", () => {
    const s: CronExpressionState = {
      ...defaultCronState(),
      kind: "week",
      hour: 9,
      minute: 0,
      days: [],
    };
    assert.equal(buildCron(s), "0 9 * * *");
  });

  it("month: 1st at 14:15", () => {
    const s: CronExpressionState = {
      ...defaultCronState(),
      kind: "month",
      hour: 14,
      minute: 15,
      dayOfMonth: 1,
    };
    assert.equal(buildCron(s), "15 14 1 * *");
  });

  it("custom: passes through raw expression", () => {
    const s: CronExpressionState = { ...defaultCronState(), kind: "custom", custom: "0 12 * * *" };
    assert.equal(buildCron(s), "0 12 * * *");
  });

  it("custom: trims surrounding whitespace", () => {
    const s: CronExpressionState = {
      ...defaultCronState(),
      kind: "custom",
      custom: "   0 12 * * *   ",
    };
    assert.equal(buildCron(s), "0 12 * * *");
  });
});

describe("round-trip", () => {
  const cases: ReadonlyArray<{ name: string; input: string; expected: string }> = [
    { name: "every 5 minutes", input: "*/5 * * * *", expected: "*/5 * * * *" },
    { name: "weekdays 09:00", input: "0 9 * * 1-5", expected: "0 9 * * 1,2,3,4,5" },
    { name: "15th of month 00:00", input: "0 0 15 * *", expected: "0 0 15 * *" },
    { name: "30 */2 hours", input: "30 */2 * * *", expected: "30 */2 * * *" },
    { name: "09:00 daily", input: "0 9 * * *", expected: "0 9 * * *" },
    { name: "1st at 14:15", input: "15 14 1 * *", expected: "15 14 1 * *" },
    { name: "every 10 minutes", input: "*/10 * * * *", expected: "*/10 * * * *" },
  ];

  for (const c of cases) {
    it(`${c.name}: '${c.input}' → '${c.expected}'`, () => {
      assert.equal(cronRoundTrip(c.input), c.expected);
    });
  }

  it("garbage does not round-trip", () => {
    assert.equal(cronRoundTrip("nope nope"), null);
  });

  it("six-field does not round-trip", () => {
    assert.equal(cronRoundTrip("0 0 12 * * *"), null);
  });
});

describe("clamp helpers", () => {
  it("clamp(5, 0, 10) === 5", () => assert.equal(clamp(5, 0, 10), 5));
  it("clamp(-1, 0, 10) === 0", () => assert.equal(clamp(-1, 0, 10), 0));
  it("clamp(11, 0, 10) === 10", () => assert.equal(clamp(11, 0, 10), 10));
  it("clamp(NaN, 0, 10) === 0", () => assert.equal(clamp(NaN, 0, 10), 0));

  it("clampInterval(5) === 5", () => assert.equal(clampInterval(5), 5));
  it("clampInterval(7) === 5 (fallback)", () => assert.equal(clampInterval(7), 5));
  it("clampInterval(3, HOUR_INTERVAL_OPTIONS) === 3", () =>
    assert.equal(clampInterval(3, HOUR_INTERVAL_OPTIONS), 3));
  it("clampInterval(5, HOUR_INTERVAL_OPTIONS) === 5 (fallback)", () =>
    assert.equal(clampInterval(5, HOUR_INTERVAL_OPTIONS), 5));
});

describe("option lists are non-empty and ascending", () => {
  it("MINUTE_INTERVAL_OPTIONS is a non-empty ascending list", () => {
    assert.ok(MINUTE_INTERVAL_OPTIONS.length > 0);
    for (let i = 1; i < MINUTE_INTERVAL_OPTIONS.length; i++) {
      assert.ok(MINUTE_INTERVAL_OPTIONS[i] > MINUTE_INTERVAL_OPTIONS[i - 1]);
    }
  });

  it("HOUR_INTERVAL_OPTIONS is a non-empty ascending list", () => {
    assert.ok(HOUR_INTERVAL_OPTIONS.length > 0);
    for (let i = 1; i < HOUR_INTERVAL_OPTIONS.length; i++) {
      assert.ok(HOUR_INTERVAL_OPTIONS[i] > HOUR_INTERVAL_OPTIONS[i - 1]);
    }
  });
});
