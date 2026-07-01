import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import type { Logger } from "pino";
import type { JobsRepo } from "./store/jobs.js";
import type { RunsRepo } from "./store/runs.js";
import { createJobSchema, updateJobSchema } from "./schemas.js";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { redactWebhookAction, redactShellAction } from "./security/secrets.js";
import { toCurl } from "./security/curl.js";
import { isPrivateAddress } from "./security/ssrf.js";
import type { JobAction, WebhookConfig, ShellConfig } from "./types.js";
import cronstrue from "cronstrue";
const cronstrueDescribe = (cronstrue as unknown as { toString: (e: string, o?: { locale?: string; tz?: string }) => string }).toString;
import { Cron } from "croner";
import {
  successRate,
  summarizeRunDurations,
  runsByHour,
  lastN,
} from "./stats/aggregations.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface BuildServerDeps {
  jobs: JobsRepo;
  runs: RunsRepo;
  logger: Logger;
  token?: string;
  /** v0.5.0 — host the server will bind to. Used for the non-loopback + no-token pre-check. */
  host?: string;
}

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

export async function buildServer(deps: BuildServerDeps): Promise<FastifyInstance> {
  // v0.5.0 — T10: refuse to build a server bound to a non-loopback address
  // without a token. Belt-and-braces with the CLI's own check.
  if (
    deps.host &&
    !LOOPBACK_HOSTS.has(deps.host) &&
    !deps.token
  ) {
    throw new Error(
      `refusing to build server for non-loopback host "${deps.host}" without a token. ` +
        `Either bind to 127.0.0.1 (default) or pass --token <secret>.`,
    );
  }

  // v0.5.0 — R1: warn at startup if any loaded job has a webhook targeting a
  // private network without the override set. No automatic migration.
  try {
    const loaded = await deps.jobs.list();
    const privates = loaded.filter((j) =>
      j.actions.some(
        (a: JobAction) =>
          a.type === "webhook" &&
          a.config &&
          a.config.url &&
          isPrivateWebhookUrl(a.config.url) &&
          a.config.allowPrivateNetworks !== true,
      ),
    );
    if (privates.length > 0) {
      deps.logger.warn(
        {
          jobs: privates.map((j) => ({
            id: j.id,
            name: j.name,
            targets: j.actions
              .filter(
                (a) =>
                  a.type === "webhook" &&
                  isPrivateWebhookUrl(a.config.url) &&
                  a.config.allowPrivateNetworks !== true,
              )
              .map((a) => (a.type === "webhook" ? a.config.url : "")),
          })),
        },
        `${privates.length} job(s) target private networks — set allowPrivateNetworks:true to keep them running`,
      );
    }
  } catch (err: any) {
    deps.logger.warn({ err: err.message }, "startup private-target scan failed");
  }

  const app = Fastify({
    logger: false,
    disableRequestLogging: true,
  });

  // v0.5.0 — T8: same-origin only. Cross-origin requests get no CORS headers.
  // For multi-origin deployments, run cronboard behind a reverse proxy
  // (recommended) or wait for v0.6+ --cors-origins <csv> flag.
  await app.register(cors, { origin: false });

  // Optional token auth (when set).
  // v0.5.0 — T4: timingSafeEqual + length normalization; T11: defensive return.
  app.addHook("onRequest", async (req, reply) => {
    const url = req.routeOptions?.url ?? req.url;
    if (!url.startsWith("/api/")) return;
    if (!deps.token) return;
    const auth = req.headers.authorization ?? "";
    const expected = `Bearer ${deps.token}`;
    if (auth.length !== expected.length) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const a = Buffer.from(auth, "utf8");
    const b = Buffer.from(expected, "utf8");
    if (!timingSafeEqual(a, b)) {
      return reply.code(401).send({ error: "unauthorized" });
    }
  });

  app.get("/api/health", async () => ({
    status: "ok",
    version: "0.7.1",
    time: new Date().toISOString(),
  }));

  // ----- Jobs -----
  app.get("/api/jobs", async () => {
    const jobs = await deps.jobs.list();
    return { jobs: jobs.map(stripJobSecrets) };
  });

  app.get("/api/jobs/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const job = await deps.jobs.get(id);
    if (!job) return reply.code(404).send({ error: "not found" });
    // v0.6.0 — single-item exception: unredacted. List endpoint keeps
    // stripJobSecrets() (v0.5.0 M2): bulk-view / publishing channel.
    // Threat-model details: proposal.md §2, design.md §4.
    return job;
  });

  // v0.6.0 — paste-ready export of the first action. webhook -> { curl },
  // shell -> { shell } (literal, no echo-wrap per D3).
  app.get("/api/jobs/:id/curl", async (req, reply) => {
    const { id } = req.params as { id: string };
    const job = await deps.jobs.get(id);
    if (!job || !Array.isArray(job.actions) || job.actions.length === 0) {
      return reply.code(404).send({ error: "not found" });
    }
    const a = job.actions[0];
    try {
      if (a.type === "webhook") {
        return { curl: toCurl(a.config as WebhookConfig) };
      }
      if (a.type === "shell") {
        return { shell: (a.config as ShellConfig).command };
      }
      return reply.code(422).send({ error: "first action has no exportable form" });
    } catch (err: any) {
      return reply.code(400).send({ error: `toCurl: ${err.message ?? String(err)}` });
    }
  });

  app.post("/api/jobs", async (req, reply) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      // Default actions always have an id
      const actions = Array.isArray(body.actions)
        ? (body.actions as any[]).map((a, i) => ({ ...a, id: a.id ?? randomUUID(), position: a.position ?? i, jobId: "x" }))
        : [];
      const parsed = createJobSchema.parse({
        ...body,
        actions,
      });
      const job = await deps.jobs.create(parsed);
      return reply.code(201).send(job);
    } catch (err: any) {
      deps.logger.warn({ err: err.message }, "create job failed");
      return reply.code(400).send({ error: err.message });
    }
  });

  app.patch("/api/jobs/:id", async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const patch = updateJobSchema.parse(req.body ?? {});
      const job = await deps.jobs.update(id, patch);
      return job;
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    }
  });

  app.delete("/api/jobs/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    await deps.jobs.delete(id);
    return { ok: true };
  });

  app.post("/api/jobs/:id/toggle", async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const job = await deps.jobs.toggle(id);
      return job;
    } catch (err: any) {
      return reply.code(404).send({ error: err.message });
    }
  });

  app.post("/api/jobs/:id/run", async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const job = await deps.jobs.get(id);
      if (!job) return reply.code(404).send({ error: "not found" });
      const scheduler = (deps as any).scheduler;
      if (!scheduler || typeof scheduler.trigger !== "function") {
        return reply.code(500).send({ error: "scheduler unavailable" });
      }
      await scheduler.trigger(id);
      return { ok: true };
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    }
  });

  // ----- Runs -----
  app.get("/api/runs", async (req) => {
    const q = z
      .object({ jobId: z.string().optional(), limit: z.coerce.number().max(1000).optional() })
      .parse(req.query ?? {});
    return { runs: await deps.runs.list(q) };
  });

  app.get("/api/runs/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const run = await deps.runs.get(id);
    if (!run) return reply.code(404).send({ error: "not found" });
    return run;
  });

  // ----- Aggregated stats (v0.4.0) -----
  // Sliding 24h window. Server is the source of truth; the dashboard re-fetches
  // every 30s rather than re-aggregating client-side.
  app.get("/api/stats", async (req) => {
    const q = z
      .object({ tz: z.string().optional() })
      .parse(req.query ?? {});
    const tz = q.tz ?? "Etc/UTC";

    const allRuns = await deps.runs.list({ limit: 1000 });
    const jobs = await deps.jobs.list();
    const now = Date.now();
    const last24h = allRuns.filter(
      (r) => now - new Date(r.startedAt).getTime() < 86_400_000,
    );

    const summary = summarizeRunDurations(last24h);
    return {
      activeJobs: jobs.filter((j) => j.enabled).length,
      totalJobs: jobs.length,
      runs24h: last24h.length,
      failures24h: last24h.filter(
        (r) => r.status === "failed" || r.status === "partial",
      ).length,
      successRate24h: successRate(last24h), // null on empty per D1
      durationP50: summary.p50,
      durationP95: summary.p95,
      durationP99: summary.p99,
      runsByHour: runsByHour(last24h, 24, tz, now), // length 24, index 0 = 23h ago
    };
  });

  app.get("/api/jobs/:id/stats", async (req, reply) => {
    const { id } = req.params as { id: string };
    const q = z
      .object({
        limit: z.coerce.number().int().min(1).max(100).optional().default(20),
      })
      .parse(req.query ?? {});
    const job = await deps.jobs.get(id);
    if (!job) return reply.code(404).send({ error: "not found" });
    const runs = await deps.runs.list({ jobId: id });
    const now = Date.now();
    const last24 = runs.filter(
      (r) => now - new Date(r.startedAt).getTime() < 86_400_000,
    );
    const summary = summarizeRunDurations(last24);
    return {
      jobId: id,
      successRate: successRate(last24),
      p50: summary.p50,
      p95: summary.p95,
      p99: summary.p99,
      last20: lastN(runs, q.limit), // most-recent `limit` runs (default 20, max 100)
    };
  });

  // ----- Cron utility (for UI live-preview) -----
  app.get("/api/cron/describe", async (req) => {
    const q = z.object({ expr: z.string(), tz: z.string().optional() }).parse(req.query ?? {});
    try {
      const text = cronstrueDescribe(q.expr, { locale: "en", tz: q.tz });
      return { ok: true, text };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  });

  // Next N upcoming runs — used by the visual CronBuilder preview.
  app.get("/api/cron/next", async (req) => {
    const q = z
      .object({
        expr: z.string(),
        tz: z.string().optional(),
        count: z.coerce.number().int().min(1).max(20).optional().default(5),
      })
      .parse(req.query ?? {});
    try {
      const t = new Cron(q.expr, { timezone: q.tz });
      const runs: string[] = [];
      // Croner doesn't auto-advance: every nextRun() (without explicit fromDate)
      // returns the first slot after "now". We have to step "from" forward each iteration.
      let cursor = new Date();
      for (let i = 0; i < q.count; i++) {
        const n = t.nextRun(cursor);
        if (!n) break;
        runs.push(n.toISOString());
        cursor = new Date(n.getTime() + 1000);
      }
      return { ok: true, runs };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  });

  // ----- Static UI (built frontend) -----
  // Try multiple locations so dev (tsx from src) and prod (built dist) both work.
  const webCandidates = [
    path.resolve(__dirname, "web"),                          // packages/core/dist/web (after copy)
    path.resolve(__dirname, "..", "..", "..", "web", "dist"), // monorepo root/web/dist
    path.resolve(__dirname, "..", "..", "web", "dist"),     // packages/web/dist (workspace-relative)
    path.resolve(__dirname, "..", "web"),                    // packages/core/src/web
  ];
  const webDist = webCandidates.find((p) => fs.existsSync(p));
  if (webDist) {
    await app.register(fastifyStatic, {
      root: webDist,
      prefix: "/",
      index: ["index.html"],
    });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith("/api/")) {
        return reply.code(404).send({ error: "not found" });
      }
      return reply.sendFile("index.html");
    });
  }

  return app;
}

/** v0.5.0 — mask Authorization / x-api-key / cookie headers and JSON /
 *  form-urlencoded bodies in webhook actions before they leave the server.
 *  Shell actions keep `command` plaintext (D13: user-authored, user-visible).
 */
function stripJobSecrets<T extends { actions?: any[] }>(job: T): T {
  if (!job || !Array.isArray(job.actions)) return job;
  return {
    ...job,
    actions: job.actions.map((a) => {
      if (a?.type === "webhook" && a.config) {
        return { ...a, config: redactWebhookAction(a.config) };
      }
      if (a?.type === "shell" && a.config) {
        return { ...a, config: redactShellAction(a.config) };
      }
      return a;
    }),
  };
}

/** R1 helper: cheap private-target check for the startup warning. */
function isPrivateWebhookUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".localhost")) return true;
    if (host.endsWith(".local") || host.endsWith(".internal")) return true;
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":")) {
      return isPrivateAddress(host);
    }
    // for dns hostnames we can't resolve cheaply; defer to false
    // (startup scan is best-effort, runtime guard catches the rest).
    return false;
  } catch {
    return false;
  }
}
