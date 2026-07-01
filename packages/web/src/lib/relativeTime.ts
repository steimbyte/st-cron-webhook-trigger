// v0.7.0-edit-job-ui-polish — Relative-time formatter (pure, no React).
//
// `formatRelative(ms)` returns a short, human-readable delta between the
// reference "now" and a target moment. The contract:
//
//   - `undefined` or `NaN`  →  "—"
//   - < 0 (future)          →  "in <n>s"  (n ≥ 1 for |ms| ≥ 1000; "in 1s" for tiny)
//   - 0..999 ms             →  "<n>ms ago"
//   - 1..59 s               →  "<n>s ago"
//   - 1..59 m               →  "<n>m ago"
//   - 1..23 h               →  "<n>h ago"
//   - 24..47 h              →  "yesterday"
//   - ≥ 48 h                →  "MMM D"  (en-US, locale-formatted short month + day)
//
// `now()` is exported for tests so the time anchor can be deterministic.

/**
 * Returns the current wall-clock millisecond timestamp. Exported so tests
 * can compute deterministic `ms` deltas without reaching for `Date.now()`
 * directly.
 */
export function now(): number {
  return Date.now();
}

/**
 * Format a `ms` difference (positive = past, negative = future) as a
 * human-readable relative timestamp.
 *
 * The `nowMs` parameter is a small seam for deterministic testing — production
 * callers should omit it and rely on `Date.now()`.
 */
export function formatRelative(
  ms: number | undefined,
  nowMs: number = now(),
): string {
  if (ms === undefined || Number.isNaN(ms)) return "—";

  const diff = ms; // already a delta, but for clarity keep the name "ms" on the signature
  if (diff < 0) {
    const absMs = Math.abs(diff);
    if (absMs < 1000) return "in 1s";
    return `in ${Math.round(absMs / 1000)}s`;
  }

  if (diff < 1000) return `${diff}ms ago`;

  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;

  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;

  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;

  const days = Math.floor(hr / 24);
  if (days === 1) return "yesterday";

  // ≥ 2 days: anchor an absolute date. Use en-US short month + day, no year.
  // Compute the absolute epoch of "now - ms" so the displayed date is the
  // point in time being described, not the present moment.
  const anchor = new Date(nowMs - diff);
  return anchor.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}