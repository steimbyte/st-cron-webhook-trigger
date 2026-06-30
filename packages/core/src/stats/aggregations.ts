// Pure statistical aggregation helpers for cronboard run history.
// No side-effects, no framework dependencies, no new npm packages.
//
// Decisions honoured (from openspec/changes/v0.4.0-correct-statistics/proposal.md):
//   D1  successRate(empty) -> null
//   D2  percentile via linear interpolation
//   D3  runs without durationMs excluded from percentiles (counted in `errored`)
//   D7  failure = failed + partial; timeout is NOT a failure
//   D8  zero new npm dependencies (uses only `node:` and our own types)

import type { Run } from "../types.js";

// ─────────────────────────────────────────────────────────────────────────────
// successRate
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Percentage of runs whose status is NOT one of: failed, partial.
 * Returns null when there is no input (no data == no claim).
 * `running` and `timeout` runs are treated as "not failures" (see D7).
 */
export function successRate(runs: Run[]): number | null {
  if (runs.length === 0) return null;
  const failed = runs.reduce(
    (n, r) => (r.status === "failed" || r.status === "partial" ? n + 1 : n),
    0,
  );
  return Math.round((100 * (runs.length - failed)) / runs.length);
}

// ─────────────────────────────────────────────────────────────────────────────
// summarizeRunDurations
// ─────────────────────────────────────────────────────────────────────────────

export interface RunDurationsSummary {
  /** p50 latency in ms, or null if no run had a duration. */
  p50: number | null;
  /** p95 latency in ms, or null if no run had a duration. */
  p95: number | null;
  /** p99 latency in ms, or null if no run had a duration. */
  p99: number | null;
  /** Number of runs considered (after window filter, before duration filter). */
  count: number;
  /** Runs that had no durationMs (running, or failed-without-duration). */
  errored: number;
}

/**
 * Percentiles over `runs[i].durationMs` via linear interpolation (D2).
 * Runs with `durationMs == null` are excluded from the percentiles and counted
 * in `errored` (D3). If `windowMs` is given, runs older than `Date.now() - windowMs`
 * are dropped first.
 */
export function summarizeRunDurations(
  runs: Run[],
  windowMs?: number,
): RunDurationsSummary {
  const now = Date.now();
  const filtered = windowMs
    ? runs.filter((r) => now - new Date(r.startedAt).getTime() < windowMs)
    : runs;

  const durations = filtered
    .map((r) => r.durationMs)
    .filter((d): d is number => typeof d === "number");

  const errored = filtered.length - durations.length;

  if (durations.length === 0) {
    return { p50: null, p95: null, p99: null, count: filtered.length, errored };
  }

  const sorted = durations.slice().sort((a, b) => a - b);
  return {
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    count: filtered.length,
    errored,
  };
}

function percentile(sortedAsc: number[], p: number): number {
  const n = sortedAsc.length;
  if (n === 0) return NaN;
  const idx = (n - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  const value = sortedAsc[lo]! + (idx - lo) * (sortedAsc[hi]! - sortedAsc[lo]!);
  return Math.round(value);
}

// ─────────────────────────────────────────────────────────────────────────────
// runsByHour
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Bucket counts of runs into `hours` sliding 1-hour buckets ending at `now`.
 * Bucket 0 is the oldest (now - hours hours .. now - (hours-1) hours),
 * bucket `hours-1` is the most recent (now - 1h .. now).
 * Runs outside the window are dropped. Future-dated runs are dropped.
 *
 * The `tz` parameter is accepted for forward-compatibility (per-job TZ-aware
 * bucketing is a v0.5+ feature); in v0.4.0 the algorithm is tz-agnostic
 * (sliding UTC window). See openspec/changes/v0.4.0-correct-statistics/design.md §1.3.
 *
 * `now` defaults to `Date.now()` and is exposed for deterministic tests.
 */
export function runsByHour(
  runs: Run[],
  hours: number,
  _tz: string,
  now: number = Date.now(),
): number[] {
  if (!Number.isFinite(hours) || hours <= 0) return [];
  const buckets = new Array<number>(hours).fill(0);
  const windowMs = hours * 3_600_000;
  for (const r of runs) {
    const t = new Date(r.startedAt).getTime();
    if (Number.isNaN(t)) continue;
    const age = now - t;
    if (age < 0 || age >= windowMs) continue;
    const idx = hours - 1 - Math.floor(age / 3_600_000);
    buckets[idx]!++;
  }
  return buckets;
}

// ─────────────────────────────────────────────────────────────────────────────
// lastN
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The `n` most recent runs, newest first. Does not mutate the input.
 */
export function lastN(runs: Run[], n: number): Run[] {
  if (n <= 0) return [];
  return runs
    .slice()
    .sort((a, b) => (a.startedAt < b.startedAt ? 1 : a.startedAt > b.startedAt ? -1 : 0))
    .slice(0, n);
}
