/**
 * v0.5.0-security — Secrets redaction for outbound-bound Job configurations.
 *
 * redactHeaders(h, extraKeys?) — mask values for sensitive header keys.
 * redactBody(b, contentType?, extraKeys?) — mask secrets in JSON or
 *   application/x-www-form-urlencoded bodies.
 * redactWebhookAction(cfg) — compose for WebhookConfig (redacts headers + body).
 * redactShellAction(cfg) — pass-through (D13: shell command stays plaintext).
 *
 * All functions are PURE (no IO), do not mutate input objects, and are idempotent.
 */
import type { WebhookConfig, ShellConfig } from "../types.js";

/** Default sensitive keys (case-insensitive match). */
const DEFAULT_SENSITIVE_KEYS: ReadonlySet<string> = new Set([
  "authorization",
  "x-api-key",
  "x-auth-token",
  "x-csrf-token",
  "x-access-token",
  "cookie",
  "set-cookie",
  "api-key",
  "apikey",
]);

const MASK = "***";

// ---------------------------------------------------------------------------
// redactHeaders
// ---------------------------------------------------------------------------

/**
 * Returns a new object with values for sensitive keys replaced by "***".
 * `extraKeys` augments the default sensitive set for this call only.
 */
export function redactHeaders(
  h: Record<string, string> | undefined,
  extraKeys?: string[],
): Record<string, string> {
  if (!h) return {};
  const sensitive = new Set(DEFAULT_SENSITIVE_KEYS);
  if (extraKeys) for (const k of extraKeys) sensitive.add(k.toLowerCase());

  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(h)) {
    if (sensitive.has(key.toLowerCase())) {
      out[key] = MASK;
    } else {
      out[key] = value;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// redactBody
// ---------------------------------------------------------------------------

/**
 * Mask secrets in a request body.
 * - application/json: parse, walk, mask values for sensitive keys
 *   (top-level + subtree per D5). Invalid JSON returned unchanged.
 * - application/x-www-form-urlencoded: parse via URLSearchParams,
 *   mask values for sensitive keys, re-serialise.
 * - anything else: returned unchanged.
 */
export function redactBody(
  body: string | undefined,
  contentType: string | undefined,
  extraKeys?: string[],
): string | undefined {
  if (body === undefined) return undefined;
  if (body === "") return body;

  const ct = (contentType ?? "").toLowerCase();
  if (ct.startsWith("application/json")) {
    return redactJsonBody(body, extraKeys);
  }
  if (ct.startsWith("application/x-www-form-urlencoded")) {
    return redactFormBody(body, extraKeys);
  }
  return body;
}

function redactJsonBody(body: string, extraKeys?: string[]): string {
  const sensitive = new Set(DEFAULT_SENSITIVE_KEYS);
  if (extraKeys) for (const k of extraKeys) sensitive.add(k.toLowerCase());

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    // defensive — invalid JSON returned unchanged
    return body;
  }
  const masked = maskJsonValue(parsed, sensitive);
  return JSON.stringify(masked);
}

function maskJsonValue(value: unknown, sensitive: Set<string>): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    return value.map((v) => maskJsonValue(v, sensitive));
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (sensitive.has(k.toLowerCase())) {
        // D5: mask the whole subtree of a sensitive key.
        out[k] = MASK;
      } else {
        out[k] = maskJsonValue(v, sensitive);
      }
    }
    return out;
  }
  // primitives (string, number, boolean)
  return value;
}

function redactFormBody(body: string, extraKeys?: string[]): string {
  const sensitive = new Set(DEFAULT_SENSITIVE_KEYS);
  if (extraKeys) for (const k of extraKeys) sensitive.add(k.toLowerCase());

  const params = new URLSearchParams(body);
  const out = new URLSearchParams();
  // URLSearchParams iteration order is insertion order in modern Node.
  for (const [k, v] of params.entries()) {
    if (sensitive.has(k.toLowerCase())) {
      out.append(k, MASK);
    } else {
      out.append(k, v);
    }
  }
  return out.toString();
}

// ---------------------------------------------------------------------------
// redactWebhookAction / redactShellAction
// ---------------------------------------------------------------------------

/**
 * Returns a redacted copy of the webhook action config.
 * Mutates neither `headers` nor `body` of the input; safe to call repeatedly.
 */
export function redactWebhookAction(cfg: WebhookConfig): WebhookConfig {
  const ct = cfg.headers?.["Content-Type"] ?? cfg.headers?.["content-type"];
  return {
    ...cfg,
    headers: redactHeaders(cfg.headers),
    body:
      cfg.body !== undefined
        ? redactBody(cfg.body, ct ?? "application/json")
        : cfg.body,
  };
}

/**
 * Shell actions keep their `command` plaintext (D13 — user wrote it, user can see it).
 * Pass-through that exists for API symmetry and to give a single seam to extend later.
 */
export function redactShellAction(cfg: ShellConfig): ShellConfig {
  return { ...cfg };
}