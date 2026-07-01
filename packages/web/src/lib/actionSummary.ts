// v0.7.0-edit-job-ui-polish — Action summary helpers (pure, no React).
//
// `summarize(action)` returns the one-line preview shown on the ActionCard
// header (S1 / D7):
//   - webhook: "<METHOD>  <url>"  (two-space separator; URL truncated to 50)
//   - shell:   "$ <first line>  (cwd: <cwd>, timeout <Xs>)"
//
// `truncateUrl(url, max=50)` is exposed so tests can pin the truncation rule
// (D13: 47 chars + "…" when length > 50).

import type { JobAction, ShellConfig, WebhookConfig } from "../types";

// D13 — trigger threshold: lengths ≤ this are returned unchanged.
const DEFAULT_MAX = 50;
// D13 — keep exactly this many characters of the original URL before the
// ellipsis when truncating. Output length is therefore `KEEP_CHARS + 1` = 48.
const KEEP_CHARS = 47;

/**
 * Truncate a URL to `max` characters. When the input is longer than `max`,
 * return the first `KEEP_CHARS` (47) characters followed by the ellipsis
 * "…" — per D13 / S1.
 *
 * - `undefined` / empty string → `""`
 * - length ≤ max → returned verbatim
 * - length > max → first 47 chars + "…" (48 chars total)
 *
 * Idempotent for inputs that already triggered truncation once: the second
 * call sees a string of length 48 (≤ 50) and returns it unchanged.
 */
export function truncateUrl(url: string | undefined, max: number = DEFAULT_MAX): string {
  if (!url) return "";
  if (url.length <= max) return url;
  return url.slice(0, KEEP_CHARS) + "…";
}

/**
 * One-line summary for the ActionCard header.
 *
 * Webhook: `"POST  https://example.com/ping"` (two-space separator; URL
 * truncated via `truncateUrl`).
 *
 * Shell: `"$ backup.sh  (cwd: /srv/cron, timeout 60s)"`. The first line of
 * `command` is shown; the trailing `(cwd, timeout)` is appended only when at
 * least one of the two fields is set.
 */
export function summarize(action: JobAction): string {
  if (action.type === "webhook") {
    const cfg = action.config as WebhookConfig;
    const url = truncateUrl(cfg.url);
    // Two-space separator is intentional (matches proposal §1.1 mockup and
    // S1 / D7) — visually distinguishes method from URL when rendered in a
    // monospace font.
    return `${cfg.method}  ${url}`;
  }
  const cfg = action.config as ShellConfig;
  const firstLine = (cfg.command ?? "").split("\n")[0].trim();
  const details: string[] = [];
  if (cfg.cwd) details.push(`cwd: ${cfg.cwd}`);
  if (cfg.timeoutMs) details.push(`timeout ${Math.round(cfg.timeoutMs / 1000)}s`);
  const tail = details.length ? `  (${details.join(", ")})` : "";
  return `$ ${firstLine}${tail}`;
}