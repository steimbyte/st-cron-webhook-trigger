/**
 * v0.7.0-edit-job-ui-polish — strict-TDD test suite for `moveUp` / `moveDown`.
 *
 * Covers proposal S7 (reorder produces dense 0..n-1 positions, stable IDs)
 * and design §2.4. The implementation file `reorderActions.ts` is
 * intentionally NOT created at the time this test file is written — it must
 * fail with `Cannot find module './reorderActions.js'` first. T2 lands the
 * implementation; this file is the lock-in for the contract.
 *
 * Run with: `node --test --import tsx packages/web/src/lib/reorderActions.test.ts`
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { moveUp, moveDown } from "./reorderActions.js";
import type { JobAction } from "../types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mkAction(id: string, position: number, type: "webhook" | "shell" = "webhook"): JobAction {
  return {
    id,
    jobId: "job-1",
    type,
    position,
    continueOnError: false,
    config:
      type === "webhook"
        ? { method: "POST", url: "https://x.com/" + id }
        : { command: "echo " + id },
  } as JobAction;
}

function isStable<T extends { id: string }>(before: T[], after: T[]): boolean {
  if (before.length !== after.length) return false;
  const beforeIds = before.map((a) => a.id).sort();
  const afterIds = after.map((a) => a.id).sort();
  return beforeIds.every((id, i) => id === afterIds[i]);
}

// ===========================================================================
// moveUp
// ===========================================================================

describe("moveUp", () => {
  it("swaps index 1 with index 0 and dense-renumbers positions to 0..n-1", () => {
    const before = [mkAction("a", 0), mkAction("b", 1), mkAction("c", 2)];
    const after = moveUp(before, 1);
    assert.deepEqual(
      after.map((a) => a.id),
      ["b", "a", "c"],
    );
    assert.deepEqual(
      after.map((a) => a.position),
      [0, 1, 2],
    );
    assert.ok(isStable(before, after), "IDs must remain stable");
  });

  it("is a no-op at the top (idx 0)", () => {
    const before = [mkAction("a", 0), mkAction("b", 1), mkAction("c", 2)];
    const after = moveUp(before, 0);
    assert.deepEqual(
      after.map((a) => a.id),
      ["a", "b", "c"],
    );
    assert.deepEqual(
      after.map((a) => a.position),
      [0, 1, 2],
    );
  });

  it("is a no-op on a 1-element array", () => {
    const before = [mkAction("a", 0)];
    const after = moveUp(before, 0);
    assert.deepEqual(after.map((a) => a.id), ["a"]);
    assert.deepEqual(after.map((a) => a.position), [0]);
  });

  it("is a no-op on an empty array", () => {
    assert.deepEqual(moveUp([], 0), []);
  });

  it("returns a new array; does not mutate the input", () => {
    const before = [mkAction("a", 0), mkAction("b", 1)];
    const snapshot = before.map((a) => a.id);
    moveUp(before, 1);
    assert.deepEqual(before.map((a) => a.id), snapshot, "input must remain unchanged");
  });

  it("preserves type / config on every swapped action", () => {
    // before: index 0 = "a" (webhook), index 1 = "b" (shell)
    // after moveUp(idx=1): swap b<->a -> index 0 = "b" (shell), index 1 = "a" (webhook)
    const before = [mkAction("a", 0, "webhook"), mkAction("b", 1, "shell")];
    const after = moveUp(before, 1);
    assert.equal((after[0] as any).type, "shell", "b moved to index 0");
    assert.equal((after[0] as any).config.command, "echo b");
    assert.equal((after[1] as any).type, "webhook", "a moved to index 1");
    assert.equal((after[1] as any).config.url, "https://x.com/a");
  });
});

// ===========================================================================
// moveDown
// ===========================================================================

describe("moveDown", () => {
  it("swaps index 0 with index 1 and dense-renumbers positions", () => {
    const before = [mkAction("a", 0), mkAction("b", 1), mkAction("c", 2)];
    const after = moveDown(before, 0);
    assert.deepEqual(
      after.map((a) => a.id),
      ["b", "a", "c"],
    );
    assert.deepEqual(
      after.map((a) => a.position),
      [0, 1, 2],
    );
  });

  it("moves the last-1 item down by one with dense positions", () => {
    const before = [mkAction("a", 0), mkAction("b", 1), mkAction("c", 2)];
    const after = moveDown(before, 1);
    assert.deepEqual(
      after.map((a) => a.id),
      ["a", "c", "b"],
    );
    assert.deepEqual(
      after.map((a) => a.position),
      [0, 1, 2],
    );
  });

  it("is a no-op at the bottom (idx n-1)", () => {
    const before = [mkAction("a", 0), mkAction("b", 1), mkAction("c", 2)];
    const after = moveDown(before, 2);
    assert.deepEqual(
      after.map((a) => a.id),
      ["a", "b", "c"],
    );
    assert.deepEqual(
      after.map((a) => a.position),
      [0, 1, 2],
    );
  });

  it("is a no-op on a 1-element array", () => {
    const before = [mkAction("a", 0)];
    const after = moveDown(before, 0);
    assert.deepEqual(after.map((a) => a.id), ["a"]);
  });

  it("is a no-op on an empty array", () => {
    assert.deepEqual(moveDown([], 0), []);
  });

  it("returns a new array; does not mutate the input", () => {
    const before = [mkAction("a", 0), mkAction("b", 1)];
    const snapshot = before.map((a) => a.id);
    moveDown(before, 0);
    assert.deepEqual(before.map((a) => a.id), snapshot);
  });
});

// ===========================================================================
// Cross-direction symmetry (S7)
// ===========================================================================

describe("moveUp/moveDown composition", () => {
  it("moveUp then moveDown returns the original order (for non-edge swaps)", () => {
    const before = [mkAction("a", 0), mkAction("b", 1), mkAction("c", 2)];
    const upOnce = moveUp(before, 1); // [b, a, c]
    const back = moveDown(upOnce, 1); // b's index 1 goes down → [b, c, a]
    assert.deepEqual(
      back.map((a) => a.id),
      ["b", "c", "a"],
    );
    assert.deepEqual(
      back.map((a) => a.position),
      [0, 1, 2],
    );
  });
});