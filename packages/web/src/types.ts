// Mirrored types — keep in sync with packages/core/src/types.ts.
// Vite/React apps can't import .ts from a sibling workspace package directly,
// so we duplicate the small subset we need.

export type ActionType = "webhook" | "shell";

export interface WebhookConfig {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  url: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  retries?: { count: number; backoffMs: number };
  /** v0.5.0 — Bypass SSRF guard for this webhook. Use only for trusted internal targets. */
  allowPrivateNetworks?: boolean;
}

export interface ShellConfig {
  command: string;
  cwd?: string;
  timeoutMs?: number;
  allowedPaths?: string[];
}

interface ActionBase {
  id: string;
  jobId: string;
  position: number;
  continueOnError: boolean;
}

export type JobAction =
  | (ActionBase & { type: "webhook"; config: WebhookConfig })
  | (ActionBase & { type: "shell"; config: ShellConfig });

export interface Job {
  id: string;
  name: string;
  description?: string;
  cronExpression: string;
  timezone: string;
  enabled: boolean;
  actions: JobAction[];
  createdAt: string;
  updatedAt: string;
  nextRunAt?: string;
  lastRunAt?: string;
  tags?: string[];
}

export type RunStatus = "running" | "success" | "partial" | "failed" | "timeout";
export type ActionRunStatus = "running" | "success" | "failed";

export interface ActionRun {
  id: string;
  runId: string;
  actionId: string;
  status: ActionRunStatus;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  request?: unknown;
  response?: { status: number; headers?: Record<string, string>; body?: string };
  error?: string;
}

export interface Run {
  id: string;
  jobId: string;
  jobName: string;
  trigger: "schedule" | "manual";
  startedAt: string;
  finishedAt?: string;
  status: RunStatus;
  durationMs?: number;
  error?: string;
  actionRuns: ActionRun[];
}

// Mirrored shapes of /api/stats and /api/jobs/:id/stats (v0.4.0).
// Keep in sync with packages/core/src/server.ts.
export interface OverallStats {
  activeJobs: number;
  totalJobs: number;
  runs24h: number;
  failures24h: number;
  /** 0..100, or null when runs24h === 0 (empty-state; never a lie). */
  successRate24h: number | null;
  durationP50: number | null;
  durationP95: number | null;
  durationP99: number | null;
  /** length 24, index 0 = 23 hours ago, index 23 = current hour. */
  runsByHour: number[];
}

export interface JobStats {
  jobId: string;
  /** 0..100, or null when there are no runs in the last 24h. */
  successRate: number | null;
  p50: number | null;
  p95: number | null;
  p99: number | null;
  /** most-recent `limit` runs, newest first. */
  last20: Run[];
}
