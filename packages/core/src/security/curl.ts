/**
 * v0.6.0-edit-curl-export — `toCurl(action)` pure function.
 *
 * Converts a WebhookConfig into a single-line, paste-ready `curl` command.
 * Single-quote escaping uses the `'…'\''…'` trick (POSIX-shell safe for any
 * ASCII body, including newlines / tabs / `=`). URL is treated like body —
 * shell-quoted — because URLs can contain `&`, `?`, `=`, spaces, etc.
 *
 * Exports:
 *   - `toCurl(cfg)`: throws `TypeError` if `method` or `url` is missing.
 *   - `shellQuote(s)`: helper exported for tests / future re-use.
 *
 * Out of scope (D4): does not emit `--max-time` / `--retry`. Timeouts /
 * retries stay in the scheduler / executor path.
 */
import type { WebhookConfig } from "../types.js";

/**
 * Wrap an arbitrary string in POSIX-shell single quotes.
 *
 * The `'…'\''…'` trick: to literalize a `'` inside a single-quoted string,
 * close the quotes, emit an escaped single quote (`\'`), then reopen. The
 * four bytes `' \ ' ' '` together read as one literal `'` to Bash.
 *
 * @param s The string to quote. Empty string returns `''`.
 * @returns Single-quoted POSIX-safe representation.
 */
export function shellQuote(s: string): string {
  if (s === "") return "''";
  if (!s.includes("'")) return `'${s}'`;
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

/**
 * Build a `curl` command line that reproduces the given webhook action.
 *
 * Output shape (D7 / S1–S4):
 *   curl -X <METHOD> [-H '<K>: <V>']… [-d '<body>'] '<url>'
 *
 * Header order: insertion order of `cfg.headers` (D5, JS guarantees for
 * string keys).
 *
 * @param cfg The webhook configuration to serialise.
 * @returns Single-line shell command.
 * @throws {TypeError} if `cfg.method` or `cfg.url` is missing.
 */
export function toCurl(cfg: WebhookConfig): string {
  if (!cfg.method) throw new TypeError("toCurl: cfg.method is required");
  if (!cfg.url) throw new TypeError("toCurl: cfg.url is required");

  const parts: string[] = ["curl", "-X", cfg.method];

  for (const [k, v] of Object.entries(cfg.headers ?? {})) {
    parts.push("-H", shellQuote(`${k}: ${v}`));
  }

  if (cfg.body !== undefined && cfg.body !== "") {
    parts.push("-d", shellQuote(cfg.body));
  }

  parts.push(shellQuote(cfg.url));
  return parts.join(" ");
}
