// v0.7.0-edit-job-ui-polish — Status badge derivation (pure, no React).
//
// `statusForRun(run)` maps a `Run` (or null) to a `{ tone, label, iconName }`
// triple that the `ActionStatusBadge` component renders. The component itself
// owns the actual icon-name → JSX mapping; the helper only emits the string
// key (D7: "minus" | "check" | "cross" | "reload").
//
// Tone buckets per D5 / S4 / Q4:
//   - null                              → "neutral" / "never run"   / "minus"
//   - status === "running"              → "info"    / "running"      / "reload"
//   - status === "success"              → "success" / "ok"           / "check"
//   - status === "failed"               → "error"   / "failed"       / "cross"
//   - status === "partial" | "timeout"  → "error"   / "<status>"     / "cross"
//
// `partial` falls into the `error` bucket per D5/Q4 — out-of-scope for v0.7.0
// to add a dedicated warning tone. `timeout` is a separate `RunStatus` that
// is treated the same way as `failed`.

import type { Run } from "../types";

export type StatusTone = "success" | "error" | "info" | "neutral";
export type StatusIconName = "check" | "cross" | "reload" | "minus";

export interface ActionStatus {
  tone: StatusTone;
  label: string;
  iconName: StatusIconName;
}

/**
 * Derive the badge descriptor for an action's most recent run.
 *
 * @param run  The latest `Run` that contains the action's `actionId` in its
 *             `actionRuns[]`, or `null` when no run exists yet (the
 *             "never run" case).
 */
export function statusForRun(run: Run | null): ActionStatus {
  if (run === null) {
    return { tone: "neutral", label: "never run", iconName: "minus" };
  }

  switch (run.status) {
    case "running":
      return { tone: "info", label: "running", iconName: "reload" };
    case "success":
      return { tone: "success", label: "ok", iconName: "check" };
    case "failed":
      return { tone: "error", label: "failed", iconName: "cross" };
    case "partial":
      // D5/Q4 — partial collapses into the error bucket.
      return { tone: "error", label: "partial", iconName: "cross" };
    case "timeout":
      return { tone: "error", label: "timeout", iconName: "cross" };
    default: {
      // Defensive fallback for an unknown status (forward-compat).
      const _exhaustive: never = run.status;
      return { tone: "neutral", label: String(_exhaustive), iconName: "minus" };
    }
  }
}