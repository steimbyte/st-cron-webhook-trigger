import { request } from "undici";
import type { ActionExecutor } from "./registry.js";
import type { JobAction, WebhookConfig, ActionRun } from "../types.js";
import { randomUUID } from "node:crypto";
import { assertPublicUrl, PrivateNetworkError } from "../security/ssrf.js";

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

/**
 * v0.5.0 — global SSRF override.
 * Resolves allowPrivateNetworks from (per-action) || (env: CRONBOARD_ALLOW_PRIVATE_NETWORKS)
 * Used both as a per-request guard fallback and to short-circuit if env is set.
 */
export function shouldAllowPrivateNetworks(perAction: boolean | undefined): boolean {
  if (perAction === true) return true;
  const env = process.env.CRONBOARD_ALLOW_PRIVATE_NETWORKS;
  return env === "1" || env === "true";
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
    const allowPrivate = shouldAllowPrivateNetworks(cfg.allowPrivateNetworks);

    // v0.5.0 — SSRF guard runs BEFORE the request. PrivateNetworkError → failed run,
    // no undici call, no redirect amplification (maxRedirections: 0 below).
    try {
      await assertPublicUrl(cfg.url, { allowPrivateNetworks: allowPrivate });
    } catch (err) {
      const finishedAt = new Date();
      const target = err instanceof PrivateNetworkError ? err.target : cfg.url;
      return {
        id,
        runId: ctx.runId,
        actionId: a.id,
        status: "failed",
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        request: { method: cfg.method, url: cfg.url, body: cfg.body },
        error: `SSRF blocked: ${target} is a private network address (set allowPrivateNetworks to override)`,
      };
    }

    let attempt = 0;
    let lastErr: unknown;
    let lastResponse: { status: number; headers?: Record<string, string>; body?: string } | undefined;

    while (attempt <= retries.count) {
      try {
        const res = await request(cfg.url, {
          method: cfg.method,
          headers: { "user-agent": "cronboard/0.5 (+webhook)", ...(cfg.headers ?? {}) },
          body: cfg.method === "GET" ? undefined : cfg.body,
          headersTimeout: timeoutMs,
          bodyTimeout: timeoutMs,
          // v0.5.0 — disable HTTP redirect following. Without this, an SSRF
          // guard on the initial URL is moot if the first hop returns 302 to
          // a private address.
          maxRedirections: 0,
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
        lastResponse = { status, headers, body: body.slice(0, 8192) };
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
      request: { method: cfg.method, url: cfg.url, body: cfg.body },
      response: lastResponse,
      error: lastErr instanceof Error ? lastErr.message : String(lastErr),
    };
  },
};

export default executor;