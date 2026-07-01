/**
 * v0.7.0-edit-job-ui-polish — strict-TDD test suite for `statusForRun`.
 *
 * Covers proposal S4 (status badge: success/failed/running/never) and D5
 * (partial → failed bucket). The implementation file `runStatus.ts` is
 * intentionally NOT created at the time this test file is written — it must
 * fail with `Cannot find module './runStatus.js'` first. T2 lands the
 * implementation; this file is the lock-in for the contract.
 *
 * Run with: `node --test --import tsx packages/web/src/lib/runStatus.test.ts`
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { statusForRun } from "./runStatus.js";
import type { Run } from "../types.js";

// ---------------------------------------------------------------------------
// Helper builders
// ---------------------------------------------------------------------------

function run(overrides: Partial<Run> = {}): Run {
  return {
    id: "run-1",
    jobId: "job-1",
    jobName: "heartbeat",
    trigger: "manual",
    startedAt: "2026-07-01T12:00:00.000Z",
    finishedAt: "2026-07-01T12:00:00.150Z",
    status: "success",
    durationMs: 150,
    actionRuns: [],
    ...overrides,
  } as Run;
}

// ===========================================================================
// statusForRun — neutral (never-run)
// ===========================================================================

describe("statusForRun (never-run)", () => {
  it("returns neutral/never for null", () => {
    const out = statusForRun(null);
    assert.equal(out.tone, "neutral");
    assert.match(out.label, /never/i);
    assert.equal(out.iconName, "minus");
  });
});

// ===========================================================================
// statusForRun — running
// ===========================================================================

describe("statusForRun (running)", () => {
  it("returns info/running for an in-progress run", () => {
    const out = statusForRun(run({ status: "running", finishedAt: undefined }));
    assert.equal(out.tone, "info");
    assert.match(out.label, /running/i);
    assert.equal(out.iconName, "reload");
  });
});

// ===========================================================================
// statusForRun — success
// ===========================================================================

describe("statusForRun (success)", () => {
  it("returns success/ok for a successful run", () => {
    const out = statusForRun(run({ status: "success" }));
    assert.equal(out.tone, "success");
    assert.match(out.label, /^ok\b/);
    assert.equal(out.iconName, "check");
  });
});

// ===========================================================================
// statusForRun — failed / partial / timeout (D5: all → error bucket)
// ===========================================================================

describe("statusForRun (failed family)", () => {
  it("returns error/failed for status='failed'", () => {
    const out = statusForRun(run({ status: "failed", error: "boom" }));
    assert.equal(out.tone, "error");
    assert.match(out.label, /failed/i);
    assert.equal(out.iconName, "cross");
  });

  it("returns error for status='partial' (D5 → failed bucket)", () => {
    const out = statusForRun(run({ status: "partial" }));
    assert.equal(out.tone, "error");
    assert.equal(out.iconName, "cross");
  });

  it("returns error for status='timeout'", () => {
    const out = statusForRun(run({ status: "timeout" }));
    assert.equal(out.tone, "error");
    assert.equal(out.iconName, "cross");
  });
});

// ===========================================================================
// statusForRun — shape contract
// ===========================================================================

describe("statusForRun (shape)", () => {
  it("returns exactly three keys: tone, label, iconName", () => {
    const out = statusForRun(run());
    assert.deepEqual(Object.keys(out).sort(), ["iconName", "label", "tone"]);
  });

  it("all four non-null tones are reachable across the input matrix", () => {
    const tones = new Set([
      statusForRun(null).tone,
      statusForRun(run({ status: "running", finishedAt: undefined })).tone,
      statusForRun(run({ status: "success" })).tone,
      statusForRun(run({ status: "failed" })).tone,
    ]);
    assert.equal(tones.size, 4, `expected 4 distinct tones, got: ${[...tones].join(",")}`);
  });
});