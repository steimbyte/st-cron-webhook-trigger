import { z } from "zod";

export const webhookConfigSchema = z.object({
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("POST"),
  url: z.string().url(),
  headers: z.record(z.string()).optional(),
  body: z.string().optional(),
  timeoutMs: z.number().int().positive().max(120_000).optional(),
  retries: z
    .object({
      count: z.number().int().min(0).max(10),
      backoffMs: z.number().int().positive().max(60_000),
    })
    .optional(),
  // v0.5.0 — SSRF guard bypass for this single action.
  allowPrivateNetworks: z.boolean().default(false),
});

export const shellConfigSchema = z.object({
  command: z.string().min(1),
  cwd: z.string().optional(),
  timeoutMs: z.number().int().positive().max(3_600_000).optional(),
  allowedPaths: z.array(z.string()).optional(),
});

export const actionSchema = z.discriminatedUnion("type", [
  z.object({
    id: z.string(),
    jobId: z.string(),
    position: z.number().int().min(0),
    continueOnError: z.boolean().default(false),
    type: z.literal("webhook"),
    config: webhookConfigSchema,
  }),
  z.object({
    id: z.string(),
    jobId: z.string(),
    position: z.number().int().min(0),
    continueOnError: z.boolean().default(false),
    type: z.literal("shell"),
    config: shellConfigSchema,
  }),
]);

export const jobSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  // v0.5.0 — bound cron expressions to prevent abuse (e.g. multi-MB inputs).
  cronExpression: z.string().min(1).max(256),
  timezone: z.string().default("UTC"),
  enabled: z.boolean().default(true),
  actions: z.array(actionSchema).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
  nextRunAt: z.string().optional(),
  lastRunAt: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export const createJobSchema = jobSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  nextRunAt: true,
  lastRunAt: true,
});

export const updateJobSchema = createJobSchema.partial();

export const runSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  jobName: z.string(),
  trigger: z.enum(["schedule", "manual"]),
  startedAt: z.string(),
  finishedAt: z.string().optional(),
  status: z.enum(["running", "success", "partial", "failed", "timeout"]),
  durationMs: z.number().optional(),
  error: z.string().optional(),
  actionRuns: z.array(z.any()).default([]),
});

export type CreateJobInput = z.infer<typeof createJobSchema>;
export type UpdateJobInput = z.infer<typeof updateJobSchema>;
