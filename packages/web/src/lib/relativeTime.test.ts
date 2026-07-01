/**
 * v0.7.0-edit-job-ui-polish — strict-TDD test suite for `formatRelative`.
 *
 * Covers proposal S1/S4 (relative timestamps like "12ms ago", "3m ago",
 * "2h ago", "yesterday", "Jul 1") and design §2.5. The implementation file
 * `relativeTime.ts` is intentionally NOT created at the time this test file is
 * written — it must fail with `Cannot find module './relativeTime.js'` first.
 * T2 lands the implementation; this file is the lock-in for the contract.
 *
 * Run with: `node --test --import tsx packages/web/src/lib/relativeTime.test.ts`
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatRelative } from "./relativeTime.js";

// ===========================================================================
// Sub-second bucket
// ===========================================================================

describe("formatRelative (sub-second)", () => {
  it("returns '12ms ago' for a 12 ms diff", () => {
    assert.equal(formatRelative(12), "12ms ago");
  });

  it("returns '0ms ago' for a 0 ms diff", () => {
    assert.equal(formatRelative(0), "0ms ago");
  });

  it("returns '999ms ago' for a 999 ms diff (boundary)", () => {
    assert.equal(formatRelative(999), "999ms ago");
  });
});

// ===========================================================================
// Seconds / Minutes / Hours buckets
// ===========================================================================

describe("formatRelative (seconds/minutes/hours)", () => {
  it("returns '1s ago' for 1_000 ms (boundary)", () => {
    assert.equal(formatRelative(1_000), "1s ago");
  });

  it("returns '5s ago' for 5_000 ms", () => {
    assert.equal(formatRelative(5_000), "5s ago");
  });

  it("returns '59s ago' for 59_000 ms (boundary)", () => {
    assert.equal(formatRelative(59_000), "59s ago");
  });

  it("returns '1m ago' for 60_000 ms (boundary)", () => {
    assert.equal(formatRelative(60_000), "1m ago");
  });

  it("returns '3m ago' for 3 * 60_000 ms", () => {
    assert.equal(formatRelative(3 * 60_000), "3m ago");
  });

  it("returns '59m ago' for 59 * 60_000 ms (boundary)", () => {
    assert.equal(formatRelative(59 * 60_000), "59m ago");
  });

  it("returns '1h ago' for 60 * 60_000 ms (boundary)", () => {
    assert.equal(formatRelative(60 * 60_000), "1h ago");
  });

  it("returns '2h ago' for 2 * 3_600_000 ms", () => {
    assert.equal(formatRelative(2 * 3_600_000), "2h ago");
  });

  it("returns '23h ago' for 23 * 3_600_000 ms (boundary)", () => {
    assert.equal(formatRelative(23 * 3_600_000), "23h ago");
  });
});

// ===========================================================================
// Days bucket — yesterday / MMM D
// ===========================================================================

describe("formatRelative (days)", () => {
  it("returns 'yesterday' for 24h diff (24*3600_000 ms)", () => {
    assert.equal(formatRelative(24 * 3_600_000), "yesterday");
  });

  it("returns 'yesterday' for ~36h diff (between 24h and 48h)", () => {
    assert.equal(formatRelative(36 * 3_600_000), "yesterday");
  });

  it("returns an MMM D format for >= 48h", () => {
    const out = formatRelative(5 * 86_400_000);
    // matches e.g. "Jun 26" / "Jul 1" — short month + day, no year
    assert.match(out, /^[A-Z][a-z]{2}\s+\d{1,2}$/);
  });
});

// ===========================================================================
// Edge cases (defensive)
// ===========================================================================

describe("formatRelative (edge cases)", () => {
  it("returns '—' for undefined", () => {
    assert.equal(formatRelative(undefined), "—");
  });

  it("returns '—' for NaN", () => {
    assert.equal(formatRelative(Number.NaN), "—");
  });

  it("returns 'in 5s' for a small future diff (-5000 ms)", () => {
    assert.equal(formatRelative(-5_000), "in 5s");
  });

  it("returns 'in 1s' for a 1 ms future diff", () => {
    assert.equal(formatRelative(-1), "in 1s");
  });
});