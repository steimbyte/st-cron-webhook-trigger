// v0.7.0-edit-job-ui-polish — Reorder helpers (pure, no React).
//
// `moveUp(actions, idx)` / `moveDown(actions, idx)` swap the action at `idx`
// with its neighbour (idx-1 / idx+1 respectively) and dense-renumber every
// `position` to `0..n-1` (D1, R4). They are pure: the input array is never
// mutated; a fresh array is returned. Out-of-bounds and edge indices are
// no-ops so the UI can blindly call them without bounds-checks.
//
// The mapping in tests:
//   - moveUp([a,b,c], 1)   → [b, a, c]   positions [0,1,2]
//   - moveUp([a,b,c], 0)   → [a, b, c]   (no-op, already at top)
//   - moveDown([a,b,c], 0) → [b, a, c]   positions [0,1,2]
//   - moveDown([a,b,c], 1) → [a, c, b]   positions [0,1,2]
//   - moveDown([a,b,c], 2) → [a, b, c]   (no-op, already at bottom)

import type { JobAction } from "../types";

/**
 * Move the action at `idx` one slot towards the start of the array.
 *
 * - Out-of-range `idx` (negative or `>= actions.length`) → returns the array unchanged.
 * - `idx === 0` → returns the array unchanged (already at the top).
 * - Otherwise: swaps the action at `idx` with the one at `idx - 1`, then
 *   dense-renumbers `position` to `0..n-1`.
 *
 * The returned array is always a fresh object; the input is never mutated
 * (R4 — IDs stay stable, only `position` changes).
 */
export function moveUp(actions: JobAction[], idx: number): JobAction[] {
  if (idx <= 0 || idx >= actions.length) return actions.slice();
  return swap(actions, idx, idx - 1);
}

/**
 * Move the action at `idx` one slot towards the end of the array.
 *
 * - Out-of-range `idx` → returns the array unchanged.
 * - `idx === actions.length - 1` → returns the array unchanged (already at the bottom).
 * - Otherwise: swaps the action at `idx` with the one at `idx + 1`, then
 *   dense-renumbers `position` to `0..n-1`.
 */
export function moveDown(actions: JobAction[], idx: number): JobAction[] {
  if (idx < 0 || idx >= actions.length - 1) return actions.slice();
  return swap(actions, idx, idx + 1);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function swap(actions: JobAction[], a: number, b: number): JobAction[] {
  const next = actions.slice();
  const tmp = next[a];
  next[a] = next[b];
  next[b] = tmp;
  // Dense renumbering (D1). Spread first to keep every other field untouched;
  // only `position` is overwritten, so IDs / type / config are stable.
  return next.map((act, i) => ({ ...act, position: i }) as JobAction);
}