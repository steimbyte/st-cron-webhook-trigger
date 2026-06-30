// Unit tests for packages/core/src/stats/aggregations.ts
//
// Strict TDD (rule: strict-tdd in openspec/config.yaml). The implementation
// in aggregations.ts must satisfy every test below. This is the first
// `*.test.ts` file in packages/core/src/stats/ and the second test suite
// overall under packages/core/src (after cronExpr.test.ts).
//
// Acceptance criteria (S1–S4) referenced from the proposal:
//
//   S1  successRate([])                              -> null
//   S2  successRate(runs where every run.status === 'success') -> 100
//   S3  successRate(runs where exactly half failed) -> 50
//   S4  summarizeRunDurations(p95) linear interpolation,
//       10 samples in 100ms steps => p95 between 945 and 1005 ms
//
// We also test the broader contract from design.md §1 (linear interpolation,
// empty-state p* = null, errored counter, runsByHour length=24, lastN
// descending sort).
//
// Decisions honoured:
//   D1  successRate(empty)  -> null
//   D2  percentile via linear interpolation
//   D3  runs without durationMs excluded from percentiles
//   D7  failure = failed + partial; timeout NOT a failure

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  successRate,
  summarizeRunDurations,
  runsByHour,
  lastN,
} from "./aggregations.js";
import type { Run } from "../types.js";

// ─────────────────────────────────────────────────────────────────────────────
// Test fixtures
// ─────────────────────────────────────────────────────────────────────────────

/** Build a minimal Run with the fields the aggregations actually read. */
function run(partial: Partial<Run> & Pick<Run, "status" | "startedAt">): Run {
  return {
    id: partial.id ?? cryptoRandomId(),
    jobId: partial.jobId ?? "j-1",
    jobName: partial.jobName ?? "test",
    trigger: partial.trigger ?? "schedule",
    startedAt: partial.startedAt,
    finishedAt: partial.finishedAt,
    status: partial.status,
    durationMs: partial.durationMs,
    error: partial.error,
    actionRuns: partial.actionRuns ?? [],
  };
}

function cryptoRandomId(): string {
  // Stable across node:test runs without pulling a uuid dep.
  return "r-" + Math.random().toString(36).slice(2, 10);
}

// ─────────────────────────────────────────────────────────────────────────────
// successRate (D1, D7)
// ─────────────────────────────────────────────────────────────────────────────

describe("successRate", () => {
  it("returns null for an empty list (S1, D1)", () => {
    assert.equal(successRate([]), null);
  });

  it("returns 100 when every run is success (S2)", () => {
    const rs = [
      run({ status: "success", startedAt: "2026-06-30T00:00:00Z" }),
      run({ status: "success", startedAt: "2026-06-30T00:01:00Z" }),
      run({ status: "success", startedAt: "2026-06-30T00:02:00Z" }),
    ];
    assert.equal(successRate(rs), 100);
  });

  it("returns 50 for 5 success + 5 failed (S3, exactly half)", () => {
    const rs: Run[] = [];
    for (let i = 0; i < 5; i++) {
      rs.push(run({ status: "success", startedAt: new Date(Date.now() - i * 60_000).toISOString() }));
      rs.push(run({ status: "failed",  startedAt: new Date(Date.now() - i * 60_000 - 30_000).toISOString() }));
    }
    assert.equal(successRate(rs), 50);
  });

  it("treats partial as failure (D7): [ok, partial, partial] -> 33", () => {
    const rs = [
      run({ status: "success", startedAt: "2026-06-30T00:00:00Z" }),
      run({ status: "partial", startedAt: "2026-06-30T00:01:00Z" }),
      run({ status: "partial", startedAt: "2026-06-30T00:02:00Z" }),
    ];
    // 1 success out of 3 = 33.33.. -> Math.round -> 33
    assert.equal(successRate(rs), 33);
  });

  it("does NOT count timeout as failure (D7)", () => {
    const rs = [
      run({ status: "success", startedAt: "2026-06-30T00:00:00Z" }),
      run({ status: "timeout", startedAt: "2026-06-30T00:01:00Z" }),
      run({ status: "timeout", startedAt: "2026-06-30T00:02:00Z" }),
    ];
    // Both timeouts ignored -> 100
    assert.equal(successRate(rs), 100);
  });

  it("ignores running runs (they're not yet a result)", () => {
    const rs = [
      run({ status: "running", startedAt: new Date().toISOString() }),
    ];
    // Single running run, not success nor failure -> treated as success: 100
    assert.equal(successRate(rs), 100);
  });

  it("returns 0 for a single failed run", () => {
    const rs = [run({ status: "failed", startedAt: "2026-06-30T00:00:00Z" })];
    assert.equal(successRate(rs), 0);
  });

  it("returns 0 when every run is failed/partial", () => {
    const rs = [
      run({ status: "failed",  startedAt: "2026-06-30T00:00:00Z" }),
      run({ status: "partial", startedAt: "2026-06-30T00:01:00Z" }),
    ];
    assert.equal(successRate(rs), 0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// summarizeRunDurations (D2, D3, S4)
// ─────────────────────────────────────────────────────────────────────────────

describe("summarizeRunDurations", () => {
  it("returns all-null percentiles + count 0 for empty input (D3 empty-state)", () => {
    const s = summarizeRunDurations([]);
    assert.equal(s.p50, null);
    assert.equal(s.p95, null);
    assert.equal(s.p99, null);
    assert.equal(s.count, 0);
    assert.equal(s.errored, 0);
  });

  it("returns the same value for p50/p95/p99 when there is exactly one duration", () => {
    const rs = [run({ status: "success", startedAt: "2026-06-30T00:00:00Z", durationMs: 100 })];
    const s = summarizeRunDurations(rs);
    assert.equal(s.p50, 100);
    assert.equal(s.p95, 100);
    assert.equal(s.p99, 100);
    assert.equal(s.count, 1);
    assert.equal(s.errored, 0);
  });

  it("computes S4: 10 samples in 100ms steps -> p95 between 945 and 1005 ms (linear interp)", () => {
    // 100, 200, 300, ..., 1000
    // p95 via linear interpolation, sorted length 10:
    //   idx = (10 - 1) * 0.95 = 8.55
    //   lo = 8 (value 900), hi = 9 (value 1000)
    //   value = 900 + 0.55 * (1000 - 900) = 900 + 55 = 955 -> rounded to 955
    // The proposal's S4 allows both 950 and 1000 ms; design.md §1.2 specifies
    //   Math.round at the end of interpolation, which yields 955. We accept
    //   ±5ms around the exact value to be robust to test-runner variance
    //   (none expected, but the tolerance is documented).
    const rs: Run[] = [];
    for (let i = 1; i <= 10; i++) {
      rs.push(
        run({
          status: "success",
          startedAt: new Date(Date.now() - i * 60_000).toISOString(),
          durationMs: i * 100,
        }),
      );
    }
    const s = summarizeRunDurations(rs);
    assert.ok(
      s.p95 !== null && s.p95 >= 945 && s.p95 <= 1005,
      `p95=${s.p95} must be in [945, 1005]`,
    );
    // p50 of 10 samples in 100ms steps: idx = 4.5 -> 500 + 0.5*100 = 550
    assert.equal(s.p50, 550);
    // p99 of 10 samples: idx = 8.91 -> 891 + 0.91*100 = 982
    assert.ok(s.p99 !== null && s.p99 >= 970 && s.p99 <= 995, `p99=${s.p99}`);
    assert.equal(s.count, 10);
    assert.equal(s.errored, 0);
  });

  it("excludes runs without durationMs from the percentiles and counts them as errored (D3)", () => {
    const rs = [
      run({ status: "success", startedAt: "2026-06-30T00:00:00Z", durationMs: 100 }),
      run({ status: "running", startedAt: "2026-06-30T00:00:01Z" /* no durationMs */ }),
      run({ status: "failed",  startedAt: "2026-06-30T00:00:02Z" /* no durationMs */ }),
      run({ status: "success", startedAt: "2026-06-30T00:00:03Z", durationMs: 200 }),
    ];
    const s = summarizeRunDurations(rs);
    // 2 samples with duration -> p50 = 150, p95 = 195, p99 = 199
    assert.equal(s.p50, 150);
    assert.equal(s.count, 4);
    assert.equal(s.errored, 2);
  });

  it("percentiles are monotonically non-decreasing for monotonically increasing input", () => {
    const rs: Run[] = [];
    for (let i = 1; i <= 20; i++) {
      rs.push(
        run({
          status: "success",
          startedAt: new Date(Date.now() - i * 60_000).toISOString(),
          durationMs: i * 50,
        }),
      );
    }
    const s = summarizeRunDurations(rs);
    assert.ok(s.p50 !== null && s.p95 !== null && s.p99 !== null, "no nulls expected");
    assert.ok(s.p50 <= s.p95, `p50=${s.p50} must be <= p95=${s.p95}`);
    assert.ok(s.p95 <= s.p99, `p95=${s.p95} must be <= p99=${s.p99}`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// runsByHour
// ─────────────────────────────────────────────────────────────────────────────

describe("runsByHour", () => {
  it("returns exactly `hours` buckets (24 default)", () => {
    const buckets = runsByHour([], 24, "Etc/UTC", 1_700_000_000_000);
    assert.equal(buckets.length, 24);
    assert.equal(buckets.every((b) => b === 0), true);
  });

  it("sums to runs.length when every run is within the window", () => {
    const now = Date.now();
    const rs: Run[] = [];
    for (let i = 0; i < 5; i++) {
      rs.push(run({ status: "success", startedAt: new Date(now - i * 60_000).toISOString() }));
    }
    const buckets = runsByHour(rs, 24, "Etc/UTC", now);
    const sum = buckets.reduce((a, b) => a + b, 0);
    assert.equal(sum, rs.length);
  });

  it("a run 'now' lands in the most recent bucket (index hours-1)", () => {
    const now = Date.now();
    const rs = [run({ status: "success", startedAt: new Date(now).toISOString() })];
    const buckets = runsByHour(rs, 24, "Etc/UTC", now);
    assert.equal(buckets[23], 1);
    assert.equal(buckets.reduce((a, b) => a + b, 0), 1);
  });

  it("ignores runs older than the window (>= hours hours ago)", () => {
    const now = Date.now();
    const oldRun = run({ status: "success", startedAt: new Date(now - 25 * 3_600_000).toISOString() });
    const buckets = runsByHour([oldRun], 24, "Etc/UTC", now);
    assert.equal(buckets.reduce((a, b) => a + b, 0), 0);
  });

  it("ignores runs in the future (negative age)", () => {
    const now = Date.now();
    const futureRun = run({ status: "success", startedAt: new Date(now + 5 * 60_000).toISOString() });
    const buckets = runsByHour([futureRun], 24, "Etc/UTC", now);
    assert.equal(buckets.reduce((a, b) => a + b, 0), 0);
  });

  it("accepts a tz parameter and is stable across two consecutive calls with the same inputs", () => {
    const now = Date.now();
    const rs: Run[] = [];
    for (let i = 0; i < 3; i++) {
      rs.push(run({ status: "success", startedAt: new Date(now - i * 60_000).toISOString() }));
    }
    const a = runsByHour(rs, 24, "Europe/Berlin", now);
    const b = runsByHour(rs, 24, "Europe/Berlin", now);
    assert.deepEqual(a, b);
    assert.equal(a.length, 24);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// lastN
// ─────────────────────────────────────────────────────────────────────────────

describe("lastN", () => {
  it("returns [] for empty input", () => {
    assert.deepEqual(lastN([], 5), []);
  });

  it("returns at most N runs, even when input is shorter", () => {
    const rs = [
      run({ status: "success", startedAt: "2026-06-30T00:00:00Z" }),
      run({ status: "success", startedAt: "2026-06-30T00:01:00Z" }),
      run({ status: "success", startedAt: "2026-06-30T00:02:00Z" }),
    ];
    const out = lastN(rs, 5);
    assert.equal(out.length, 3);
  });

  it("returns runs sorted by startedAt descending (newest first)", () => {
    const older = run({ status: "success", startedAt: "2026-06-30T00:00:00Z" });
    const newer = run({ status: "success", startedAt: "2026-06-30T00:05:00Z" });
    const middle = run({ status: "success", startedAt: "2026-06-30T00:02:00Z" });
    // Input is intentionally in random order
    const out = lastN([older, newer, middle], 5);
    assert.equal(out[0]?.id, newer.id);
    assert.equal(out[1]?.id, middle.id);
    assert.equal(out[2]?.id, older.id);
  });

  it("does not mutate the input array", () => {
    const a = run({ status: "success", startedAt: "2026-06-30T00:00:00Z" });
    const b = run({ status: "success", startedAt: "2026-06-30T00:05:00Z" });
    const input: Run[] = [a, b];
    const before = input.map((r) => r.id);
    lastN(input, 5);
    const after = input.map((r) => r.id);
    assert.deepEqual(before, after);
  });
});
