#!/usr/bin/env node
// Cronboard CLI — entry point.
import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { resolveConfig, ensureDataDir } from "./config.js";
import { createLogger } from "./logger.js";
import { JobsRepo } from "./store/jobs.js";
import { RunsRepo } from "./store/runs.js";
import { Scheduler } from "./scheduler/index.js";
import { buildServer } from "./server.js";
import { acquireLock, releaseLock, readLock, isProcessRunning } from "./daemon.js";
import webhookExec from "./actions/webhook.js";
import shellExec from "./actions/shell.js";
import { registerActionExecutor } from "./actions/registry.js";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { jobSchema } from "./schemas.js";
import { sanitizeExecArgv } from "./security/execArgv.js";

registerActionExecutor(webhookExec);
registerActionExecutor(shellExec);

const program = new Command();
program
  .name("cronboard")
  .description("Local-first cron scheduler with Radix UI web frontend")
  .version("0.7.1");

// ---------- start ----------
program
  .command("start", { isDefault: true })
  .description("Start scheduler and web UI")
  .option("-H, --host <host>", "Bind address", "127.0.0.1")
  .option("-p, --port <port>", "Port", "3737")
  .option("-d, --data <dir>", "Data directory")
  .option("--token <token>", "Bearer token (required when binding to non-localhost)")
  .option("--detach", "Run as background daemon", true)
  .option("--no-detach", "Run in foreground (for dev/debug)")
  .option("--no-scheduler", "Skip starting the scheduler (web UI only)")
      .option(
        "--allow-private-networks",
        "Allow webhook targets on private networks (e.g. 127.0.0.1, 10.x). Sets CRONBOARD_ALLOW_PRIVATE_NETWORKS=1.",
        false,
      )
  .action(async (opts) => {
    const cfg = resolveConfig(opts);

    // v0.5.0 — propagate --allow-private-networks into the env so the
    // detached child (and the SSRF guard) see the same override.
    if (opts.allowPrivateNetworks === true) {
      process.env.CRONBOARD_ALLOW_PRIVATE_NETWORKS = "1";
    }

    if (
      cfg.host !== "127.0.0.1" &&
      cfg.host !== "localhost" &&
      cfg.host !== "::1" &&
      !cfg.token
    ) {
      console.error("ERROR: --token is required when binding to a non-localhost address.");
      process.exit(2);
    }

    const alreadyDetached = !!process.env.CRONBOARD_DETACHED;

    if (cfg.detach && !alreadyDetached) {
      // Spawn detached child writing output to log file
      const out = fs.openSync(cfg.logFile, "a");
      const err = fs.openSync(cfg.logFile, "a");
      const child = spawn(
        process.execPath,
        ["--import", "tsx/esm", ...sanitizeExecArgv(process.execArgv), process.argv[1], ...process.argv.slice(2), "--no-detach"],
        {
          detached: true,
          stdio: ["ignore", out, err],
          env: { ...process.env, CRONBOARD_DETACHED: "1" },
        },
      );
      child.unref();
      // Wait briefly so the child can write its pid file
      await new Promise((r) => setTimeout(r, 700));
      const lock = readLock(cfg.pidFile);
      console.log(`cronboard detached (pid ${child.pid}).`);
      console.log(`web UI: http://${cfg.host}:${cfg.port}`);
      if (lock) console.log(`pid file: ${cfg.pidFile}`);
      process.exit(0);
    }

    const lockResult = acquireLock(cfg.pidFile, {
      startedAt: new Date().toISOString(),
      host: cfg.host,
      port: cfg.port,
    });
    if (lockResult && "existing" in lockResult && lockResult.existing) {
      console.error(`Another cronboard instance is already running (pid ${lockResult.pid}).`);
      process.exit(1);
    }

    const logger = createLogger(cfg.logFile);
    const jobs = new JobsRepo(cfg.dataDir);
    const runs = new RunsRepo(cfg.dataDir);

    logger.info({ host: cfg.host, port: cfg.port, detached: alreadyDetached }, "starting cronboard");

    const scheduler = new Scheduler(
      { jobs, runs, logger },
      path.join(cfg.dataDir, "jobs.json"),
      logger,
    );

    // Server expects a "scheduler" handle for /api/jobs/:id/run
    const deps: any = { jobs, runs, logger, token: cfg.token, host: cfg.host };
    const app = await buildServer(deps);
    deps.scheduler = scheduler;

    if (opts.scheduler !== false) {
      await scheduler.start();
    }
    await app.listen({ host: cfg.host, port: cfg.port });
    logger.info(
      { url: `http://${cfg.host}:${cfg.port}`, detached: alreadyDetached },
      "cronboard ready",
    );

    let stopping = false;
    const shutdown = async (signal: string) => {
      if (stopping) return;
      stopping = true;
      logger.info({ signal }, "shutting down");
      try { await scheduler.stop(); } catch {}
      try { await app.close(); } catch {}
      releaseLock(cfg.pidFile);
      process.exit(0);
    };
    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
  });

// ---------- stop ----------
program
  .command("stop")
  .description("Stop the running daemon")
  .option("-d, --data <dir>", "Data directory")
  .action(async (opts) => {
    const cfg = resolveConfig(opts);
    const lock = readLock(cfg.pidFile);
    if (!lock) {
      console.log("cronboard is not running.");
      return;
    }
    try {
      // Node maps SIGTERM to TerminateProcess on Windows; the daemon's SIGTERM handler
      // closes the server, releases the lock file, then exits. If that doesn't work
      // within ~3s, fall back to SIGKILL (forceful) which Windows maps to exit immediately.
      process.kill(lock.pid, "SIGTERM");
      const start = Date.now();
      while (Date.now() - start < 3000) {
        if (!isProcessRunning(lock.pid)) break;
        await new Promise((r) => setTimeout(r, 100));
      }
      if (isProcessRunning(lock.pid)) {
        console.warn(`Process ${lock.pid} did not exit in 3s; sending SIGKILL`);
        process.kill(lock.pid, "SIGKILL");
      }
      console.log(`stopped ${lock.pid}`);
    } catch (err: any) {
      if (err.code === "ESRCH") {
        console.log("stale pid file; removing.");
        releaseLock(cfg.pidFile);
      } else {
        throw err;
      }
    }
  });

// ---------- status ----------
program
  .command("status")
  .description("Show daemon status")
  .option("-d, --data <dir>", "Data directory")
  .action(async (opts) => {
    const cfg = resolveConfig(opts);
    const lock = readLock(cfg.pidFile);
    if (!lock) {
      console.log("cronboard: not running");
      return;
    }
    const jobs = await new JobsRepo(cfg.dataDir).list();
    const runs = await new RunsRepo(cfg.dataDir).list({ limit: 5 });
    console.log(`pid:      ${lock.pid}`);
    console.log(`started:  ${lock.startedAt}`);
    console.log(`url:      http://${lock.host}:${lock.port}`);
    console.log(`data dir: ${cfg.dataDir}`);
    console.log(`jobs:     ${jobs.length} (${jobs.filter((j) => j.enabled).length} enabled)`);
    console.log(`recent runs: ${runs.length}`);
  });

// ---------- logs ----------
program
  .command("logs")
  .description("Tail logs")
  .option("-d, --data <dir>", "Data directory")
  .option("-n, --lines <n>", "Lines to show", "50")
  .option("-f, --follow", "Follow new lines", false)
  .action(async (opts) => {
    const cfg = resolveConfig(opts);
    if (!fs.existsSync(cfg.logFile)) {
      console.log(`(no log file at ${cfg.logFile})`);
      return;
    }
    const lines = parseInt(opts.lines, 10);
    if (opts.follow) {
      // tail -f equivalent
      console.log(`tailing ${cfg.logFile} (Ctrl+C to stop)`);
      fs.watchFile(cfg.logFile, { interval: 300 }, () => {
        const data = fs.readFileSync(cfg.logFile, "utf8");
        const tail = data.split("\n").slice(-lines).join("\n");
        process.stdout.write(tail + "\n");
      });
      process.on("SIGINT", () => process.exit(0));
    } else {
      const data = fs.readFileSync(cfg.logFile, "utf8");
      console.log(data.split("\n").slice(-lines).join("\n"));
    }
  });

// ---------- ls ----------
program
  .command("ls")
  .alias("list")
  .description("List jobs")
  .option("-d, --data <dir>", "Data directory")
  .action(async (opts) => {
    const cfg = resolveConfig(opts);
    const jobs = await new JobsRepo(cfg.dataDir).list();
    if (jobs.length === 0) {
      console.log("(no jobs)");
      return;
    }
    for (const j of jobs) {
      const status = j.enabled ? "✓" : " ";
      const last = j.lastRunAt ?? "—";
      const next = j.nextRunAt ?? "—";
      console.log(
        `[${status}] ${j.id.slice(0, 8)}  ${j.name.padEnd(28)}  ${j.cronExpression.padEnd(14)} (${j.timezone})  last: ${last}  next: ${next}`,
      );
    }
  });

// ---------- add ----------
program
  .command("add")
  .description("Add a job from CLI")
  .argument("<name>", "Job name")
  .requiredOption("-c, --cron <expr>", "Cron expression (5-field)")
  .option("-u, --url <url>", "Webhook URL")
  .option("--method <m>", "HTTP method", "POST")
  .option("--body <body>", "Webhook body (string or @filepath)")
  .option("--header <kv...>", "Add header (key=value), repeatable")
  .option("--command <cmd>", "Shell command (alternative to webhook)")
  .option("--tz <tz>", "IANA timezone", "UTC")
  .option("--description <desc>", "Job description")
  .option("--no-enable", "Create disabled")
  .option("-d, --data <dir>", "Data directory")
  .action(async (name, opts) => {
    const cfg = resolveConfig(opts);
    const jobs = new JobsRepo(cfg.dataDir);

    if (!opts.url && !opts.command) {
      console.error("ERROR: provide either --url (webhook) or --command (shell)");
      process.exit(2);
    }

    const headers: Record<string, string> = {};
    if (Array.isArray(opts.header)) {
      for (const h of opts.header as string[]) {
        const [k, ...rest] = h.split("=");
        if (!k || rest.length === 0) {
          console.error(`bad --header: ${h}`);
          process.exit(2);
        }
        headers[k] = rest.join("=");
      }
    }

    const body = opts.body?.startsWith("@")
      ? fs.readFileSync(opts.body.slice(1), "utf8")
      : opts.body;

    const actions: any[] = [];
    if (opts.url) {
      actions.push({
        id: randomUUID(),
        jobId: "x",
        type: "webhook" as const,
        position: 0,
        continueOnError: false,
        config: { method: opts.method, url: opts.url, headers, body, timeoutMs: 30_000 },
      });
    }
    if (opts.command) {
      actions.push({
        id: randomUUID(),
        jobId: "x",
        type: "shell" as const,
        position: actions.length,
        continueOnError: false,
        config: { command: opts.command, timeoutMs: 60_000 },
      });
    }

    try {
      const job = await jobs.create({
        name,
        description: opts.description,
        cronExpression: opts.cron,
        timezone: opts.tz,
        enabled: opts.enable,
        actions,
      } as any);
      console.log(`created job ${job.id} (${job.name})`);
    } catch (err: any) {
      console.error(`failed: ${err.message}`);
      process.exit(1);
    }
  });

// ---------- rm ----------
program
  .command("rm")
  .alias("remove")
  .description("Remove a job (by id or name)")
  .argument("<selector>", "Job id (full or prefix) or name")
  .option("-d, --data <dir>", "Data directory")
  .action(async (selector, opts) => {
    const cfg = resolveConfig(opts);
    const jobs = new JobsRepo(cfg.dataDir);
    const all = await jobs.list();
    const match =
      all.find((j) => j.id === selector) ??
      all.find((j) => j.id.startsWith(selector)) ??
      all.find((j) => j.name === selector);
    if (!match) {
      console.error(`no job matches "${selector}"`);
      process.exit(1);
    }
    await jobs.delete(match.id);
    console.log(`removed ${match.name} (${match.id})`);
  });

// ---------- run ----------
program
  .command("run")
  .description("Manually trigger a job (writes a run record)")
  .argument("<selector>", "Job id or name")
  .option("-d, --data <dir>", "Data directory")
  .action(async (selector, opts) => {
    const cfg = resolveConfig(opts);
    const jobs = new JobsRepo(cfg.dataDir);
    const all = await jobs.list();
    const match =
      all.find((j) => j.id === selector) ?? all.find((j) => j.name === selector);
    if (!match) {
      console.error(`no job matches "${selector}"`);
      process.exit(1);
    }
    const logger = createLogger(cfg.logFile);
    const runs = new RunsRepo(cfg.dataDir);
    const { runJob } = await import("./scheduler/runner.js");
    console.log(`running ${match.name}...`);
    const r = await runJob({ jobs, runs, logger }, match, "manual");
    console.log(`done: ${r.status} in ${r.durationMs}ms`);
  });

// Catch-all: `npm start` without args should also start the daemon.
program.parseAsync(process.argv).catch((err) => {
  console.error(err?.message ?? err);
  process.exit(1);
});
