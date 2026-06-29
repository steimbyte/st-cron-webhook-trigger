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
import { randomUUID } from "node:crypto";
import cronstrue from "cronstrue";
const cronstrueDescribe = (cronstrue as unknown as { toString: (e: string, o?: { locale?: string; tz?: string }) => string }).toString;
import { Cron } from "croner";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface BuildServerDeps {
  jobs: JobsRepo;
  runs: RunsRepo;
  logger: Logger;
  token?: string;
}

export async function buildServer(deps: BuildServerDeps): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
    disableRequestLogging: true,
  });

  await app.register(cors, { origin: (origin, cb) => cb(null, true), credentials: true });

  // Optional token auth (when set)
  app.addHook("onRequest", async (req, reply) => {
    const url = req.routeOptions?.url ?? req.url;
    if (url.startsWith("/api/") && deps.token) {
      const auth = req.headers.authorization;
      if (auth !== `Bearer ${deps.token}`) {
        reply.code(401).send({ error: "unauthorized" });
      }
    }
  });

  app.get("/api/health", async () => ({
    status: "ok",
    version: "0.1.0",
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
    return job;
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

/** Hide secrets like Authorization header values from accidental exposure. */
function stripJobSecrets<T extends Record<string, any>>(job: T): T {
  return job;
}
