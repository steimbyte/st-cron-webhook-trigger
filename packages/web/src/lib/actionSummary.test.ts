/**
 * v0.7.0-edit-job-ui-polish — strict-TDD test suite for the `summarize` /
 * `truncateUrl` helpers.
 *
 * Covers proposal S1 (one-line action summary: "POST  https://…", "$ cmd (cwd,
 * timeout)") and design §2.1 / §2.2. The implementation file `actionSummary.ts`
 * is intentionally NOT created at the time this test file is written — it must
 * fail with `Cannot find module './actionSummary.js'` first. T2 lands the
 * implementation; this file is the lock-in for the contract.
 *
 * Run with: `node --test --import tsx packages/web/src/lib/actionSummary.test.ts`
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { summarize, truncateUrl } from "./actionSummary.js";
import type { JobAction, WebhookConfig, ShellConfig } from "../types.js";

// ---------------------------------------------------------------------------
// Minimal helper builders
// ---------------------------------------------------------------------------

function webhook(overrides: Partial<WebhookConfig> = {}): JobAction {
  return {
    id: "act-webhook",
    jobId: "job-1",
    type: "webhook",
    position: 0,
    continueOnError: false,
    config: {
      method: "POST",
      url: "https://example.com/ping",
      ...overrides,
    },
  } as JobAction;
}

function shell(overrides: Partial<ShellConfig> = {}): JobAction {
  return {
    id: "act-shell",
    jobId: "job-1",
    type: "shell",
    position: 0,
    continueOnError: false,
    config: {
      command: "backup.sh",
      ...overrides,
    },
  } as JobAction;
}

// ===========================================================================
// truncateUrl — S1, D13 (URL > 50 chars truncates to 47 + "…")
// ===========================================================================

describe("truncateUrl", () => {
  it("returns short URLs unchanged", () => {
    assert.equal(truncateUrl("https://example.com/short"), "https://example.com/short");
  });

  it("returns 50-char URLs unchanged (boundary)", () => {
    const url = "x".repeat(50); // exactly 50 chars
    assert.equal(url.length, 50);
    assert.equal(truncateUrl(url), url);
  });

  it("truncates 51-char URLs to 47 + '…' (boundary)", () => {
    const url = "x".repeat(51); // 51 chars
    assert.equal(url.length, 51);
    const out = truncateUrl(url);
    assert.equal(out.length, 48); // 47 + ellipsis char
    assert.ok(out.endsWith("…"));
    assert.equal(out.slice(0, 47), url.slice(0, 47));
  });

  it("truncates 80-char URLs and keeps the '…' marker", () => {
    const url = "https://hooks.example.com/api/v1/webhook/" + "x".repeat(80 - 45);
    const out = truncateUrl(url);
    assert.ok(out.length <= 50);
    assert.ok(out.endsWith("…"));
  });

  it("returns empty string for undefined input", () => {
    assert.equal(truncateUrl(undefined), "");
  });

  it("returns empty string for empty string input", () => {
    assert.equal(truncateUrl(""), "");
  });
});

// ===========================================================================
// summarize — Webhook (S1)
// ===========================================================================

describe("summarize (webhook)", () => {
  it("renders GET + URL with two-space separator", () => {
    const out = summarize(webhook({ method: "GET", url: "https://api.example.com/v1/x" }));
    assert.equal(out, "GET  https://api.example.com/v1/x");
  });

  it("renders POST + URL", () => {
    const out = summarize(webhook({ method: "POST", url: "https://x.com/y" }));
    assert.equal(out, "POST  https://x.com/y");
  });

  it("renders PUT + URL", () => {
    const out = summarize(webhook({ method: "PUT", url: "https://x.com/z" }));
    assert.match(out, /^PUT\s+https:\/\/x\.com\/z$/);
  });

  it("renders PATCH + URL", () => {
    const out = summarize(webhook({ method: "PATCH", url: "https://x.com/a" }));
    assert.match(out, /^PATCH\s+https:\/\/x\.com\/a$/);
  });

  it("renders DELETE + URL", () => {
    const out = summarize(webhook({ method: "DELETE", url: "https://x.com/b" }));
    assert.match(out, /^DELETE\s+https:\/\/x\.com\/b$/);
  });

  it("truncates long URLs in the summary and keeps the ellipsis", () => {
    const longUrl = "https://hooks.example.com/api/v1/webhook/" + "z".repeat(60);
    const out = summarize(webhook({ method: "POST", url: longUrl }));
    assert.ok(out.includes("…"), `expected '…' in ${out}`);
    assert.match(out, /^POST\s+https:\/\/.+…$/);
  });

  it("degrades gracefully when url is undefined (empty fallback)", () => {
    const out = summarize(webhook({ url: undefined as unknown as string }));
    // safe fallback: still contains the method and a separator
    assert.match(out, /^POST\s*$/);
  });
});

// ===========================================================================
// summarize — Shell (S1)
// ===========================================================================

describe("summarize (shell)", () => {
  it("renders the $ prompt + first line + (cwd, timeout) when both present", () => {
    const out = summarize(shell({ command: "backup.sh", cwd: "/srv/cron", timeoutMs: 60000 }));
    assert.match(out, /^\$\sbackup\.sh/);
    assert.ok(out.includes("cwd: /srv/cron"));
    assert.ok(out.includes("timeout 60s"));
  });

  it("renders only the command when no cwd/timeout are set", () => {
    const out = summarize(shell({ command: "echo hi" }));
    assert.equal(out, "$ echo hi");
  });

  it("renders cwd alone when only cwd is set", () => {
    const out = summarize(shell({ command: "ls", cwd: "/tmp" }));
    assert.equal(out, "$ ls  (cwd: /tmp)");
  });

  it("renders timeout alone when only timeout is set", () => {
    const out = summarize(shell({ command: "sleep 5", timeoutMs: 5000 }));
    assert.equal(out, "$ sleep 5  (timeout 5s)");
  });

  it("shows only the first line of a multi-line command", () => {
    const out = summarize(shell({ command: "echo a\necho b\necho c" }));
    assert.ok(out.startsWith("$ echo a"), `expected first line, got: ${out}`);
    assert.ok(!out.includes("echo b"), `must not leak later lines: ${out}`);
  });
});