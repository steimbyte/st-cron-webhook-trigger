import { request } from "undici";
import type { ActionExecutor } from "./registry.js";
import type { JobAction, WebhookConfig, ActionRun } from "../types.js";
import { randomUUID } from "node:crypto";

type WebhookAction = {
  type: "webhook";
  config: WebhookConfig;
  id: string;
  jobId: string;
  position: number;
  continueOnError: boolean;
};

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

const executor: ActionExecutor = {
  type: "webhook",

  async run(ctx, action): Promise<Partial<ActionRun>> {
    const a = action as WebhookAction;
    const cfg = a.config;
    const id = randomUUID();
    const startedAt = new Date();
    const timeoutMs = cfg.timeoutMs ?? 30_000;
    const retries = cfg.retries ?? { count: 0, backoffMs: 1000 };

    let attempt = 0;
    let lastErr: unknown;

    while (attempt <= retries.count) {
      try {
        const res = await request(cfg.url, {
          method: cfg.method,
          headers: { "user-agent": "cronboard/0.1 (+webhook)", ...(cfg.headers ?? {}) },
          body: cfg.method === "GET" ? undefined : cfg.body,
          headersTimeout: timeoutMs,
          bodyTimeout: timeoutMs,
        });
        const status = res.statusCode;
        const headers: Record<string, string> = {};
        for (const [k, v] of Object.entries(res.headers)) {
          if (typeof v === "string") headers[k] = v;
          else if (Array.isArray(v)) headers[k] = v.join(", ");
        }
        const body = await res.body.text();

        const finishedAt = new Date();
        const ok = status >= 200 && status < 300;
        const result: Partial<ActionRun> = {
          id,
          runId: ctx.runId,
          actionId: a.id,
          status: ok ? "success" : "failed",
          startedAt: startedAt.toISOString(),
          finishedAt: finishedAt.toISOString(),
          durationMs: finishedAt.getTime() - startedAt.getTime(),
          request: { method: cfg.method, url: cfg.url, body: cfg.body },
          response: { status, headers, body: body.slice(0, 8192) },
        };
        if (ok) return result;
        lastErr = new Error(`HTTP ${status}`);
      } catch (err: any) {
        lastErr = err;
      }
      attempt++;
      if (attempt <= retries.count) await sleep(retries.backoffMs);
    }

    const finishedAt = new Date();
    return {
      id,
      runId: ctx.runId,
      actionId: a.id,
      status: "failed",
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      error: lastErr instanceof Error ? lastErr.message : String(lastErr),
    };
  },
};

export default executor;
