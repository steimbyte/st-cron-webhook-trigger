/**
 * v0.6.0-edit-curl-export — strict-TDD test suite for `toCurl`.
 *
 * Covers proposal S1–S4 (and a stability/multi-header bonus). The implementation
 * file `curl.ts` is intentionally NOT created at the time this test file is
 * written — it must fail with `Cannot find module './curl.js'` first. T2 lands
 * the implementation; T1 stays as the lock-in for the contract.
 *
 * Run with: `node --test --import tsx packages/core/src/security/curl.test.ts`
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { toCurl } from "./curl.js";
import type { WebhookConfig } from "../types.js";

// ---------------------------------------------------------------------------
// Minimal helper builders
// ---------------------------------------------------------------------------

function cfg(overrides: Partial<WebhookConfig> = {}): WebhookConfig {
  return {
    method: "GET",
    url: "https://x/y",
    ...overrides,
  } as WebhookConfig;
}

// ===========================================================================
// S1 — GET, no body, no headers
// ===========================================================================

describe("toCurl — S1 GET no body", () => {
  it("emits 'curl -X GET <quoted-url>' exactly", () => {
    const out = toCurl(cfg({ method: "GET", url: "https://x/y" }));
    assert.equal(out, "curl -X GET 'https://x/y'");
  });

  it("single line (no \\n continuation characters)", () => {
    const out = toCurl(cfg({ method: "GET", url: "https://x/y" }));
    assert.equal(out.includes("\n"), false);
    assert.equal(out.includes("\r"), false);
  });
});

// ===========================================================================
// S2 — POST JSON with headers + body, exact single-line
// ===========================================================================

describe("toCurl — S2 POST JSON, headers, body", () => {
  it("emits the exact single-line curl with insertion-order headers and single-quoted body", () => {
    const out = toCurl(
      cfg({
        method: "POST",
        url: "https://x/y",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": "sk-abc",
        },
        body: '{"a":1}',
      }),
    );
    assert.equal(
      out,
      "curl -X POST " +
        `-H 'Content-Type: application/json' ` +
        `-H 'x-api-key: sk-abc' ` +
        `-d '{"a":1}' ` +
        `'https://x/y'`,
    );
  });

  it("body comes after headers in the output", () => {
    const out = toCurl(
      cfg({
        method: "POST",
        url: "https://x/y",
        headers: { "x-api-key": "sk-abc" },
        body: '{"a":1}',
      }),
    );
    const idxH = out.indexOf("-H");
    const idxD = out.indexOf("-d");
    assert.ok(idxH >= 0, "expected -H in output");
    assert.ok(idxD >= 0, "expected -d in output");
    assert.ok(idxH < idxD, "-H must come before -d");
  });

  it("URL is the last positional argument (right of -d)", () => {
    const out = toCurl(
      cfg({
        method: "POST",
        url: "https://x/y",
        headers: { "x-api-key": "sk-abc" },
        body: '{"a":1}',
      }),
    );
    assert.equal(out.endsWith("'https://x/y'"), true);
  });
});

// ===========================================================================
// S3 — body with a single quote
// ===========================================================================

describe("toCurl — S3 single-quote escaping in body", () => {
  it("escapes a single quote with the '\\'' trick", () => {
    const out = toCurl(
      cfg({
        method: "POST",
        url: "https://x/y",
        body: "abc'def",
      }),
    );
    assert.ok(
      out.includes(`-d 'abc'\\''def'`),
      `expected '-d 'abc'\\''def'' substring in:\n${out}`,
    );
  });

  it("escapes multiple single quotes the same way", () => {
    const out = toCurl(
      cfg({
        method: "POST",
        url: "https://x/y",
        body: "it's a 'test'",
      }),
    );
    assert.ok(out.includes(`-d 'it'`));
    assert.ok(out.includes(`s a `));
    assert.ok(out.includes(`'test'`));
  });
});

// ===========================================================================
// S4 — header value with '='
// ===========================================================================

describe("toCurl — S4 header value with '='", () => {
  it("keeps 'a=b' as a single -H token", () => {
    const out = toCurl(
      cfg({
        method: "POST",
        url: "https://x/y",
        headers: { "X-Foo": "a=b" },
      }),
    );
    assert.equal(out.includes(`-H 'X-Foo: a=b'`), true);
  });

  it("preserves 'Authorization: Bearer abc=def' literally", () => {
    const out = toCurl(
      cfg({
        method: "POST",
        url: "https://x/y",
        headers: { Authorization: "Bearer abc=def" },
      }),
    );
    assert.equal(out.includes(`-H 'Authorization: Bearer abc=def'`), true);
  });
});

// ===========================================================================
// S5–S8 are HTTP-surface acceptance; lives in scripts/smoke.ps1 per D11.
// ===========================================================================

describe("toCurl — robustness (not strictly S-criterion, but lock-in)", () => {
  it("preserves header iteration order (insertion-order, per D5)", () => {
    const out = toCurl(
      cfg({
        method: "GET",
        url: "u",
        headers: { b: "2", a: "1" },
      }),
    );
    const idxB = out.indexOf("-H 'b: 2'");
    const idxA = out.indexOf("-H 'a: 1'");
    assert.ok(idxB >= 0 && idxA >= 0, "both headers should appear");
    assert.ok(idxB < idxA, "b must come before a in output");
  });

  it("omits -d when body is undefined", () => {
    const out = toCurl(cfg({ method: "POST", url: "https://x/y" }));
    assert.equal(out.includes("-d"), false);
  });

  it("omits -d when body is the empty string", () => {
    const out = toCurl(
      cfg({ method: "POST", url: "https://x/y", body: "" }),
    );
    assert.equal(out.includes("-d"), false);
  });

  it("quotes a URL containing spaces", () => {
    const out = toCurl(cfg({ method: "GET", url: "https://x/y a b" }));
    assert.equal(out, `curl -X GET 'https://x/y a b'`);
  });

  it("quotes a URL with a query string literally (no shell splitting of &)", () => {
    const out = toCurl(
      cfg({ method: "GET", url: "https://x/y?a=1&b=2" }),
    );
    assert.equal(out, `curl -X GET 'https://x/y?a=1&b=2'`);
  });
});

// ===========================================================================
// Missing fields — D12: throws TypeError
// ===========================================================================

describe("toCurl — missing-field behaviour (D12)", () => {
  it("throws TypeError when method is missing", () => {
    assert.throws(
      () =>
        toCurl({
          url: "https://x/y",
        } as unknown as WebhookConfig),
      TypeError,
    );
  });

  it("throws TypeError when url is missing", () => {
    assert.throws(
      () =>
        toCurl({
          method: "GET",
        } as unknown as WebhookConfig),
      TypeError,
    );
  });

  it("throws TypeError when cfg is empty", () => {
    assert.throws(() => toCurl({} as unknown as WebhookConfig), TypeError);
  });
});
