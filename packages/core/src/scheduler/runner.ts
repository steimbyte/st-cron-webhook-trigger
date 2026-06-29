// Executes a Job's actions in sequence or parallel, persists run results.
import { randomUUID } from "node:crypto";
import { getActionExecutor } from "../actions/registry.js";
import type { Job, Run, ActionRun } from "../types.js";
import type { JobsRepo } from "../store/jobs.js";
import type { RunsRepo } from "../store/runs.js";
import type { Logger } from "pino";

export interface RunnerDeps {
  jobs: JobsRepo;
  runs: RunsRepo;
  logger: Logger;
  /** If true, actions within a run execute in parallel; default false (sequence) */
  parallelActions?: boolean;
}

export async function runJob(
  deps: RunnerDeps,
  job: Job,
  trigger: "schedule" | "manual" = "schedule",
): Promise<Run> {
  const runId = randomUUID();
  const run: Run = {
    id: runId,
    jobId: job.id,
    jobName: job.name,
    trigger,
    startedAt: new Date().toISOString(),
    status: "running",
    actionRuns: [],
  };
  await deps.runs.create(run);
  deps.logger.info({ runId, jobId: job.id, name: job.name, trigger }, "run:start");

  const startedAtMs = Date.now();
  const sortedActions = [...job.actions].sort((a, b) => a.position - b.position);

  let aggregated: ActionRun[] = [];

  if (deps.parallelActions) {
    const results = await Promise.allSettled(
      sortedActions.map((a) => executeAction(runId, a)),
    );
    aggregated = results.map((r, i) =>
      r.status === "fulfilled"
        ? r.value
        : ({
            id: randomUUID(),
            runId,
            actionId: sortedActions[i].id,
            status: "failed",
            startedAt: new Date().toISOString(),
            finishedAt: new Date().toISOString(),
            error: r.reason instanceof Error ? r.reason.message : String(r.reason),
          } as ActionRun),
    );
  } else {
    aggregated = [];
    for (const a of sortedActions) {
      try {
        const ar = await executeAction(runId, a);
        aggregated.push(ar);
        if (ar.status === "failed" && !a.continueOnError) {
          break;
        }
      } catch (err) {
        aggregated.push({
          id: randomUUID(),
          runId,
          actionId: a.id,
          status: "failed",
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          error: err instanceof Error ? err.message : String(err),
        });
        if (!a.continueOnError) break;
      }
    }
  }

  const finishedAt = new Date();
  const durationMs = finishedAt.getTime() - startedAtMs;
  const anyFailed = aggregated.some((a) => a.status === "failed");
  const allFailed = aggregated.length > 0 && aggregated.every((a) => a.status === "failed");
  const status: Run["status"] =
    allFailed ? "failed" : anyFailed ? "partial" : "success";

  const final: Partial<Run> = {
    finishedAt: finishedAt.toISOString(),
    durationMs,
    status,
    actionRuns: aggregated,
  };
  await deps.runs.update(runId, final);

  deps.logger.info(
    { runId, jobId: job.id, status, durationMs, actions: aggregated.length },
    "run:done",
  );

  // Update job meta
  await deps.jobs.setRunMeta(job.id, { lastRunAt: finishedAt.toISOString() });

  return { ...run, ...final } as Run;
}

async function executeAction(runId: string, action: import("../types.js").JobAction): Promise<ActionRun> {
  const exec = getActionExecutor(action.type);
  const partial = await exec.run(
    { runId, job: { id: action.jobId, name: "" }, trigger: "schedule" },
    action,
  );
  return {
    id: partial.id ?? randomUUID(),
    runId,
    actionId: action.id,
    status: partial.status ?? "success",
    startedAt: partial.startedAt ?? new Date().toISOString(),
    finishedAt: partial.finishedAt ?? new Date().toISOString(),
    durationMs: partial.durationMs ?? 0,
    request: partial.request,
    response: partial.response,
    error: partial.error,
  };
}
