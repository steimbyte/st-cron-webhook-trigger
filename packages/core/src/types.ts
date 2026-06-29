// Shared types for Cronboard core.

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
  /** Absolute paths only; empty = allow anything (with confirmation warning in UI). */
  allowedPaths?: string[];
}

export type ActionConfig =
  | ({ type: "webhook" } & WebhookConfig)
  | ({ type: "shell" } & ShellConfig);

export interface ActionBase {
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
  timezone: string; // IANA, e.g. "Europe/Berlin"
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
