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
