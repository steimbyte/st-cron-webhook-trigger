// Bootstraps the scheduler from the jobs file. Re-loads on file change.
import { Cron } from "croner";
import fs from "node:fs";
import path from "node:path";
import { EventEmitter } from "node:events";
import type { Job } from "../types.js";
import type { JobsRepo } from "../store/jobs.js";
import type { RunsRepo } from "../store/runs.js";
import { runJob, type RunnerDeps } from "./runner.js";
import type { Logger } from "pino";

export class Scheduler extends EventEmitter {
  private tasks = new Map<string, Cron>();
  private watcher?: fs.FSWatcher;
  private runningJobs = new Set<string>();
  private syncInFlight = false;
  private syncPending = false;
  /** Cached mtime of jobs.json so we can ignore the change events we triggered. */
  private lastJobsMtime = 0;
  private pollTimer?: NodeJS.Timeout;

  constructor(
    private deps: RunnerDeps,
    private jobsFile: string,
    private logger: Logger,
  ) {
    super();
  }

  async start(): Promise<void> {
    await this.sync();
    // Poll-based reload is reliable cross-platform. We also keep an fs.watch
    // for low-latency changes; either trigger funnels through runSyncGuarded().
    try {
      this.lastJobsMtime = fs.statSync(this.jobsFile).mtimeMs;
    } catch {
      // file doesn't exist yet
    }
    try {
      this.watcher = fs.watch(path.dirname(this.jobsFile), () => this.maybeReloadFromWatcher());
    } catch (err: any) {
      this.logger.warn({ err: err.message }, "fs.watch unavailable, falling back to poll");
    }
    // Fallback / primary: poll every 2s.
    this.pollTimer = setInterval(() => this.maybeReloadFromPoll(), 2000);
    this.logger.info({ jobsFile: this.jobsFile }, "scheduler started");
  }

  async stop(): Promise<void> {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.watcher?.close();
    for (const c of this.tasks.values()) c.stop();
    this.tasks.clear();
    this.logger.info("scheduler stopped");
  }

  private maybeReloadFromWatcher() {
    try {
      const m = fs.statSync(this.jobsFile).mtimeMs;
      this.scheduleSyncIfChanged(m);
    } catch {
      // file might not exist yet
    }
  }

  private maybeReloadFromPoll() {
    try {
      const m = fs.statSync(this.jobsFile).mtimeMs;
      this.scheduleSyncIfChanged(m);
    } catch {
      // ignore
    }
  }

  private scheduleSyncIfChanged(m: number) {
    if (m === this.lastJobsMtime) return;
    this.lastJobsMtime = m;
    if (this.syncInFlight) {
      this.syncPending = true;
      return;
    }
    // Tiny debounce coalesces multi-event bursts (fs.watch sometimes fires twice
    // per save on some platforms) and prevents self-trigger loops.
    setTimeout(() => {
      if (!this.syncInFlight) this.runSyncGuarded();
      else this.syncPending = true;
    }, 80);
  }

  private async runSyncGuarded() {
    this.syncInFlight = true;
    try {
      do {
        this.syncPending = false;
        await this.sync();
      } while (this.syncPending);
    } catch (err) {
      this.logger.error({ err }, "scheduler sync failed");
    } finally {
      this.syncInFlight = false;
    }
  }

  async sync(): Promise<void> {
    const jobs = await this.deps.jobs.list();
    const wantedIds = new Set(jobs.filter((j) => j.enabled).map((j) => j.id));
    // Stop tasks that no longer exist or are disabled.
    for (const [id, task] of Array.from(this.tasks)) {
      if (!wantedIds.has(id)) {
        task.stop();
        this.tasks.delete(id);
        this.logger.info({ jobId: id }, "scheduler: unscheduled");
      }
    }
    // Add or update tasks.
    let wroteSomething = false;
    for (const job of jobs) {
      if (!job.enabled) continue;
      const existing = this.tasks.get(job.id);
      if (existing) {
        existing.stop();
        this.tasks.delete(job.id);
      }
      const task = this.scheduleJob(job);
      if (task) this.tasks.set(job.id, task);

      // Persist nextRunAt only when it changed (avoids self-trigger loops).
      const next = this.computeNext(job);
      if (next && next !== job.nextRunAt) {
        await this.deps.jobs.setRunMeta(job.id, { nextRunAt: next });
        wroteSomething = true;
      }
    }
    if (wroteSomething) {
      // After our own write, refresh cached mtime so the file watcher skips.
      try {
        this.lastJobsMtime = fs.statSync(this.jobsFile).mtimeMs;
      } catch {}
    }
  }

  private computeNext(job: Job): string | undefined {
    try {
      const t = new Cron(job.cronExpression, { timezone: job.timezone });
      const n = t.nextRun();
      return n ? n.toISOString() : undefined;
    } catch {
      return undefined;
    }
  }

  private scheduleJob(job: Job): Cron | undefined {
    try {
      const task = new Cron(
        job.cronExpression,
        { timezone: job.timezone, name: `job:${job.name}` },
        async () => {
          if (this.runningJobs.has(job.id)) {
            this.logger.warn({ jobId: job.id }, "scheduler: previous run still in progress, skipping tick");
            return;
          }
          this.runningJobs.add(job.id);
          try {
            const latest = (await this.deps.jobs.get(job.id)) ?? job;
            if (!latest.enabled) return;
            await runJob(this.deps, latest, "schedule");
          } catch (err) {
            this.logger.error({ err, jobId: job.id }, "run failed");
          } finally {
            this.runningJobs.delete(job.id);
          }
        },
      );
      this.logger.info({ jobId: job.id, cron: job.cronExpression, tz: job.timezone }, "scheduler: scheduled");
      return task;
    } catch (err: any) {
      this.logger.error({ jobId: job.id, err: err?.message }, "scheduler: invalid cron expression");
      return undefined;
    }
  }

  /** Manually trigger a job (used by API and CLI). */
  async trigger(jobId: string): Promise<void> {
    const job = await this.deps.jobs.get(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);
    if (this.runningJobs.has(jobId)) throw new Error("Job is already running");
    this.runningJobs.add(jobId);
    try {
      await runJob(this.deps, job, "manual");
    } finally {
      this.runningJobs.delete(jobId);
    }
  }
}
