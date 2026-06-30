/**
 * v0.5.0-security — strict-TDD test suite.
 *
 * Tests run BEFORE the implementation lands. Coverage:
 *   - assertPublicUrl: scheme, hostname, IP-literal, dns-resolve, override
 *   - isPrivateAddress: IPv4 + IPv6 ranges incl. IPv4-mapped
 *   - PrivateNetworkError: shape (code, target)
 *   - redactHeaders: case-insensitive, default + extra sensitive keys
 *   - redactBody: JSON (top-level + nested subtree), form-urlencoded, unknown CT
 *   - redactWebhookAction / redactShellAction: idempotent shape
 *
 * Module-state mock for dns.lookup: _setResolverForTests/resetResolverForTests.
 */
import { describe, it, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import {
  assertPublicUrl,
  isPrivateAddress,
  PrivateNetworkError,
  _setResolverForTests,
  _resetResolverForTests,
} from "./ssrf.js";
import {
  redactHeaders,
  redactBody,
  redactWebhookAction,
  redactShellAction,
} from "./secrets.js";
import type { WebhookConfig, ShellConfig } from "../types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a mock resolver that returns the given address list. */
function mockResolve(addrs: Array<{ address: string; family: 4 | 6 }>) {
  _setResolverForTests(async (_hostname: string) => addrs);
}

/** Mock resolver that throws (simulates dns.lookup failure). */
function mockResolveThrowing(err: Error) {
  _setResolverForTests(async () => {
    throw err;
  });
}

// ===========================================================================
// assertPublicUrl — IP-literal deny (S1–S5, S7)
// ===========================================================================

describe("assertPublicUrl — IP literal deny list", () => {
  beforeEach(() => _resetResolverForTests());
  after(() => _resetResolverForTests());

  it("S1 rejects http://127.0.0.1/ (loopback)", async () => {
    await assert.rejects(
      () => assertPublicUrl("http://127.0.0.1/"),
      (err: unknown) => {
        assert.ok(err instanceof PrivateNetworkError);
        assert.equal((err as PrivateNetworkError).code, "ERR_PRIVATE_NETWORK");
        assert.equal((err as PrivateNetworkError).target, "http://127.0.0.1/");
        return true;
      },
    );
  });

  it("rejects http://127.255.255.254/ (still in 127.0.0.0/8)", async () => {
    await assert.rejects(() => assertPublicUrl("http://127.255.255.254/"), PrivateNetworkError);
  });

  it("S2 rejects http://localhost/ (hostname pre-check)", async () => {
    await assert.rejects(() => assertPublicUrl("http://localhost/"), PrivateNetworkError);
  });

  it("rejects http://foo.localhost/ (subdomain of localhost)", async () => {
    await assert.rejects(() => assertPublicUrl("http://foo.localhost/"), PrivateNetworkError);
  });

  it("rejects http://printer.local/ (.local TLD)", async () => {
    await assert.rejects(() => assertPublicUrl("http://printer.local/"), PrivateNetworkError);
  });

  it("rejects http://intranet.internal/ (.internal TLD)", async () => {
    await assert.rejects(() => assertPublicUrl("http://intranet.internal/"), PrivateNetworkError);
  });

  it("S3 rejects http://169.254.169.254/ (AWS metadata link-local)", async () => {
    await assert.rejects(
      () => assertPublicUrl("http://169.254.169.254/"),
      PrivateNetworkError,
    );
  });

  it("S4 rejects http://10.0.0.1/ (RFC1918 10/8)", async () => {
    await assert.rejects(() => assertPublicUrl("http://10.0.0.1/"), PrivateNetworkError);
  });

  it("rejects http://10.255.255.255/ (top of 10/8)", async () => {
    await assert.rejects(() => assertPublicUrl("http://10.255.255.255/"), PrivateNetworkError);
  });

  it("S5 rejects http://192.168.0.1/ (RFC1918 192.168/16)", async () => {
    await assert.rejects(() => assertPublicUrl("http://192.168.0.1/"), PrivateNetworkError);
  });

  it("rejects http://172.16.0.1/ (RFC1918 172.16/12 lower bound)", async () => {
    await assert.rejects(() => assertPublicUrl("http://172.16.0.1/"), PrivateNetworkError);
  });

  it("rejects http://172.31.255.255/ (RFC1918 172.16/12 upper bound)", async () => {
    await assert.rejects(() => assertPublicUrl("http://172.31.255.255/"), PrivateNetworkError);
  });

  it("accepts http://172.15.0.1/ (just outside 172.16/12)", async () => {
    // Public IP; the SSRF guard should NOT throw.
    await assert.doesNotReject(() => assertPublicUrl("http://172.15.0.1/"));
  });

  it("accepts http://172.32.0.1/ (just outside 172.16/12)", async () => {
    await assert.doesNotReject(() => assertPublicUrl("http://172.32.0.1/"));
  });

  it("rejects http://0.0.0.0/ (unspecified address)", async () => {
    await assert.rejects(() => assertPublicUrl("http://0.0.0.0/"), PrivateNetworkError);
  });

  it("rejects http://224.0.0.1/ (IPv4 multicast)", async () => {
    await assert.rejects(() => assertPublicUrl("http://224.0.0.1/"), PrivateNetworkError);
  });

  it("rejects http://[::1]/ (IPv6 loopback)", async () => {
    await assert.rejects(() => assertPublicUrl("http://[::1]/"), PrivateNetworkError);
  });

  it("rejects http://[fe80::1]/ (IPv6 link-local)", async () => {
    await assert.rejects(() => assertPublicUrl("http://[fe80::1]/"), PrivateNetworkError);
  });

  it("rejects http://[fc00::1]/ (IPv6 ULA)", async () => {
    await assert.rejects(() => assertPublicUrl("http://[fc00::1]/"), PrivateNetworkError);
  });

  it("rejects http://[::ffff:127.0.0.1]/ (IPv4-mapped IPv6 of loopback)", async () => {
    await assert.rejects(
      () => assertPublicUrl("http://[::ffff:127.0.0.1]/"),
      PrivateNetworkError,
    );
  });

  it("rejects http://[::ffff:10.0.0.1]/ (IPv4-mapped IPv6 of 10/8)", async () => {
    await assert.rejects(
      () => assertPublicUrl("http://[::ffff:10.0.0.1]/"),
      PrivateNetworkError,
    );
  });
});

// ===========================================================================
// assertPublicUrl — scheme deny (S7)
// ===========================================================================

describe("assertPublicUrl — scheme", () => {
  beforeEach(() => _resetResolverForTests());
  after(() => _resetResolverForTests());

  it("rejects ftp://example.com/", async () => {
    await assert.rejects(() => assertPublicUrl("ftp://example.com/"), PrivateNetworkError);
  });

  it("rejects file:///etc/passwd", async () => {
    await assert.rejects(() => assertPublicUrl("file:///etc/passwd"), PrivateNetworkError);
  });

  it("rejects gopher://example.com/", async () => {
    await assert.rejects(() => assertPublicUrl("gopher://example.com/"), PrivateNetworkError);
  });

  it("rejects javascript:alert(1) (no host)", async () => {
    await assert.rejects(() => assertPublicUrl("javascript:alert(1)"), PrivateNetworkError);
  });
});

// ===========================================================================
// assertPublicUrl — allow paths (S6)
// ===========================================================================

describe("assertPublicUrl — allow paths", () => {
  beforeEach(() => _resetResolverForTests());
  after(() => _resetResolverForTests());

  it("S6 accepts https://example.com/ (mocked public)", async () => {
    mockResolve([{ address: "93.184.216.34", family: 4 }]);
    await assert.doesNotReject(() => assertPublicUrl("https://example.com/"));
  });

  it("accepts http://1.1.1.1/ (literal public IP)", async () => {
    await assert.doesNotReject(() => assertPublicUrl("http://1.1.1.1/"));
  });

  it("accepts http://8.8.8.8/ (literal public IP, no DNS needed)", async () => {
    await assert.doesNotReject(() => assertPublicUrl("http://8.8.8.8/"));
  });

  it("rejects when DNS resolves to a private address", async () => {
    mockResolve([{ address: "10.0.0.1", family: 4 }]);
    await assert.rejects(
      () => assertPublicUrl("http://example.com/"),
      (err: unknown) => {
        assert.ok(err instanceof PrivateNetworkError);
        assert.match((err as Error).message, /10\.0\.0\.1/);
        return true;
      },
    );
  });

  it("rejects when ANY of multiple A records is private", async () => {
    mockResolve([
      { address: "1.1.1.1", family: 4 },
      { address: "10.0.0.5", family: 4 },
    ]);
    await assert.rejects(() => assertPublicUrl("http://multi.example/"), PrivateNetworkError);
  });

  it("accepts when all of multiple A records are public", async () => {
    mockResolve([
      { address: "1.1.1.1", family: 4 },
      { address: "8.8.8.8", family: 4 },
    ]);
    await assert.doesNotReject(() => assertPublicUrl("http://multi.example/"));
  });
});

// ===========================================================================
// assertPublicUrl — override (S8)
// ===========================================================================

describe("assertPublicUrl — override", () => {
  beforeEach(() => _resetResolverForTests());
  after(() => _resetResolverForTests());

  it("S8 accepts http://10.0.0.1/ with allowPrivateNetworks:true (no DNS call needed)", async () => {
    await assert.doesNotReject(() =>
      assertPublicUrl("http://10.0.0.1/", { allowPrivateNetworks: true }),
    );
  });

  it("override still respects scheme check (ftp:// always rejected)", async () => {
    await assert.rejects(
      () => assertPublicUrl("ftp://example.com/", { allowPrivateNetworks: true }),
      PrivateNetworkError,
    );
  });

  it("override accepts http://localhost/ via option", async () => {
    await assert.doesNotReject(() =>
      assertPublicUrl("http://localhost/", { allowPrivateNetworks: true }),
    );
  });
});

// ===========================================================================
// isPrivateAddress — pure-function table
// ===========================================================================

describe("isPrivateAddress — pure IP classification", () => {
  const cases: Array<[string, boolean]> = [
    // IPv4 loopback
    ["127.0.0.1", true],
    ["127.255.255.254", true],
    ["127.0.0.0", true],
    // IPv4 RFC1918
    ["10.0.0.1", true],
    ["10.255.255.255", true],
    ["172.16.0.1", true],
    ["172.20.1.1", true],
    ["172.31.255.255", true],
    ["172.15.0.1", false],
    ["172.32.0.1", false],
    ["192.168.0.1", true],
    ["192.168.255.255", true],
    // IPv4 link-local (AWS metadata)
    ["169.254.0.1", true],
    ["169.254.169.254", true],
    // IPv4 unspecified
    ["0.0.0.0", true],
    // IPv4 multicast
    ["224.0.0.1", true],
    ["239.255.255.255", true],
    // IPv4 public
    ["8.8.8.8", false],
    ["1.1.1.1", false],
    ["93.184.216.34", false],
    ["172.15.255.255", false],
    ["172.32.0.1", false],
    // IPv6 loopback
    ["::1", true],
    // IPv6 link-local
    ["fe80::1", true],
    ["fe80::abcd:ef01:2345:6789", true],
    // IPv6 ULA
    ["fc00::1", true],
    ["fd00::1", true],
    // IPv4-mapped IPv6 (loopback)
    ["::ffff:127.0.0.1", true],
    ["::ffff:10.0.0.1", true],
    ["::ffff:192.168.0.1", true],
    // IPv4-mapped IPv6 (public)
    ["::ffff:8.8.8.8", false],
    // IPv6 multicast
    ["ff00::1", true],
    ["ff02::1", true],
    // Invalid / garbage
    ["not-an-ip", false],
    ["", false],
  ];

  for (const [ip, expected] of cases) {
    it(`classifies ${ip || "<empty>"} as ${expected ? "private" : "public"}`, () => {
      assert.equal(isPrivateAddress(ip), expected);
    });
  }
});

// ===========================================================================
// PrivateNetworkError shape
// ===========================================================================

describe("PrivateNetworkError — error shape", () => {
  it("has code=ERR_PRIVATE_NETWORK and target fields", () => {
    const e = new PrivateNetworkError("http://10.0.0.1/", "resolved to private address 10.0.0.1");
    assert.equal(e.code, "ERR_PRIVATE_NETWORK");
    assert.equal(e.target, "http://10.0.0.1/");
    assert.equal(e.name, "PrivateNetworkError");
    assert.match(e.message, /10\.0\.0\.1/);
    assert.ok(e instanceof Error);
  });

  it("is catchable via instanceof check", () => {
    const e: unknown = new PrivateNetworkError("http://x/", "test");
    try {
      if (!(e instanceof PrivateNetworkError)) throw new Error("not a PrivateNetworkError");
      assert.equal(e.code, "ERR_PRIVATE_NETWORK");
    } catch (caught) {
      assert.fail(`expected to recognise PrivateNetworkError, got ${caught}`);
    }
  });
});

// ===========================================================================
// redactHeaders (S9, S10)
// ===========================================================================

describe("redactHeaders — sensitive-key masking", () => {
  it("S9 masks x-api-key by default", () => {
    const r = redactHeaders({ "x-api-key": "sk-abc" });
    assert.equal(r["x-api-key"], "***");
  });

  it("masks Authorization case-insensitively (S10 adjacent)", () => {
    const r = redactHeaders({ Authorization: "Bearer foo" });
    assert.equal(r["Authorization"], "***");
  });

  it("masks 'authorization' lowercase", () => {
    const r = redactHeaders({ authorization: "Bearer foo" });
    assert.equal(r["authorization"], "***");
  });

  it("masks 'AUTHORIZATION' uppercase", () => {
    const r = redactHeaders({ AUTHORIZATION: "Bearer foo" });
    assert.equal(r["AUTHORIZATION"], "***");
  });

  it("masks X-Auth-Token, X-CSRF-Token, X-Access-Token", () => {
    const r = redactHeaders({
      "X-Auth-Token": "a",
      "X-CSRF-Token": "b",
      "X-Access-Token": "c",
    });
    assert.equal(r["X-Auth-Token"], "***");
    assert.equal(r["X-CSRF-Token"], "***");
    assert.equal(r["X-Access-Token"], "***");
  });

  it("masks Cookie and Set-Cookie", () => {
    const r = redactHeaders({ Cookie: "session=abc", "Set-Cookie": "sid=xyz" });
    assert.equal(r["Cookie"], "***");
    assert.equal(r["Set-Cookie"], "***");
  });

  it("masks api-key / apikey variants", () => {
    const r = redactHeaders({ "api-key": "k1", apikey: "k2" });
    assert.equal(r["api-key"], "***");
    assert.equal(r["apikey"], "***");
  });

  it("S10 leaves Content-Type intact", () => {
    const r = redactHeaders({ "Content-Type": "application/json" });
    assert.equal(r["Content-Type"], "application/json");
  });

  it("leaves X-Forwarded-For intact (not a secret by default)", () => {
    const r = redactHeaders({ "X-Forwarded-For": "1.2.3.4" });
    assert.equal(r["X-Forwarded-For"], "1.2.3.4");
  });

  it("honours extra sensitive keys", () => {
    const r = redactHeaders({ "X-My-Secret": "shh" }, ["x-my-secret"]);
    assert.equal(r["X-My-Secret"], "***");
  });

  it("does not mutate the input object", () => {
    const input = { "x-api-key": "sk-abc", other: "ok" };
    redactHeaders(input);
    assert.equal(input["x-api-key"], "sk-abc");
    assert.equal(input["other"], "ok");
  });

  it("returns {} for undefined input", () => {
    assert.deepEqual(redactHeaders(undefined), {});
  });

  it("preserves keys that are not sensitive", () => {
    const r = redactHeaders({ "Content-Type": "application/json", Accept: "*/*" });
    assert.equal(r["Content-Type"], "application/json");
    assert.equal(r["Accept"], "*/*");
  });
});

// ===========================================================================
// redactBody — JSON path (D5)
// ===========================================================================

describe("redactBody — JSON content-type", () => {
  it("masks top-level sensitive key value", () => {
    const out = redactBody(
      '{"x-api-key":"sk-abc","other":"x"}',
      "application/json",
    );
    const obj = JSON.parse(out!);
    assert.equal(obj["x-api-key"], "***");
    assert.equal(obj.other, "x");
  });

  it("D5 — masks whole subtree when a sensitive key is nested", () => {
    const out = redactBody(
      '{"outer":{"x-api-key":"sk-abc","keep":"value"}}',
      "application/json",
    );
    const obj = JSON.parse(out!);
    assert.equal(obj.outer["x-api-key"], "***");
  });

  it("returns the original body unchanged when JSON is invalid (defensive)", () => {
    const bad = "{not valid json";
    assert.equal(redactBody(bad, "application/json"), bad);
  });

  it("handles Content-Type with charset suffix", () => {
    const out = redactBody('{"x-api-key":"k"}', "application/json; charset=utf-8");
    const obj = JSON.parse(out!);
    assert.equal(obj["x-api-key"], "***");
  });

  it("masks multiple top-level sensitive keys", () => {
    const out = redactBody(
      '{"authorization":"Bearer x","x-api-key":"y","keep":"z"}',
      "application/json",
    );
    const obj = JSON.parse(out!);
    assert.equal(obj.authorization, "***");
    assert.equal(obj["x-api-key"], "***");
    assert.equal(obj.keep, "z");
  });

  it("returns undefined for undefined input", () => {
    assert.equal(redactBody(undefined, "application/json"), undefined);
  });

  it("leaves non-sensitive keys untouched at top level", () => {
    const out = redactBody('{"event":"heartbeat","count":3}', "application/json");
    assert.equal(out, '{"event":"heartbeat","count":3}');
  });
});

// ===========================================================================
// redactBody — form-urlencoded (D6)
// ===========================================================================

describe("redactBody — form-urlencoded content-type", () => {
  it("D6 — masks x-api-key=sk-abc but leaves other=y", () => {
    const out = redactBody(
      "x-api-key=sk-abc&other=y",
      "application/x-www-form-urlencoded",
    );
    assert.match(out!, /x-api-key=\*\*\*/);
    assert.match(out!, /other=y/);
    assert.doesNotMatch(out!, /sk-abc/);
  });

  it("preserves order of form fields", () => {
    const out = redactBody(
      "a=1&x-api-key=k&b=2",
      "application/x-www-form-urlencoded",
    );
    assert.equal(out!.startsWith("a=1&"), true);
    assert.match(out!, /x-api-key=\*\*\*/);
    assert.equal(out!.endsWith("&b=2"), true);
  });

  it("handles URL-encoded values", () => {
    const out = redactBody(
      "api-key=hello%20world&name=foo",
      "application/x-www-form-urlencoded",
    );
    assert.match(out!, /api-key=\*\*\*/);
    assert.match(out!, /name=foo/);
  });

  it("returns empty string for empty body", () => {
    assert.equal(redactBody("", "application/x-www-form-urlencoded"), "");
  });
});

// ===========================================================================
// redactBody — unknown content-type
// ===========================================================================

describe("redactBody — unknown content-type", () => {
  it("returns body unchanged for application/xml", () => {
    const body = "<x-api-key>sk-abc</x-api-key>";
    assert.equal(redactBody(body, "application/xml"), body);
  });

  it("returns body unchanged for text/plain", () => {
    const body = "sk-abc is my secret";
    assert.equal(redactBody(body, "text/plain"), body);
  });

  it("returns body unchanged when content-type is missing", () => {
    const body = "sk-abc";
    assert.equal(redactBody(body, undefined), body);
  });
});

// ===========================================================================
// redactWebhookAction — composition
// ===========================================================================

describe("redactWebhookAction", () => {
  it("redacts headers and body for JSON content-type", () => {
    const input: WebhookConfig = {
      method: "POST",
      url: "https://example.com/hook",
      headers: { "x-api-key": "sk-abc", "Content-Type": "application/json" },
      body: '{"x-api-key":"sk-real","other":"x"}',
    };
    const out = redactWebhookAction(input);
    assert.equal(out.headers!["x-api-key"], "***");
    assert.equal(out.headers!["Content-Type"], "application/json");
    const parsed = JSON.parse(out.body!);
    assert.equal(parsed["x-api-key"], "***");
    assert.equal(parsed.other, "x");
  });

  it("redacts form-urlencoded body", () => {
    const input: WebhookConfig = {
      method: "POST",
      url: "https://example.com/hook",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "x-api-key=sk-real&name=ben",
    };
    const out = redactWebhookAction(input);
    assert.match(out.body!, /x-api-key=\*\*\*/);
    assert.match(out.body!, /name=ben/);
    assert.doesNotMatch(out.body!, /sk-real/);
  });

  it("is idempotent (running twice produces same result)", () => {
    const input: WebhookConfig = {
      method: "POST",
      url: "https://example.com/",
      headers: { "x-api-key": "sk-abc" },
      body: "x=1",
    };
    const a = redactWebhookAction(input);
    const b = redactWebhookAction(a);
    assert.deepEqual(a, b);
  });

  it("does not mutate the input object", () => {
    const input: WebhookConfig = {
      method: "POST",
      url: "https://example.com/",
      headers: { "x-api-key": "sk-abc" },
      body: "x-api-key=sk-abc",
    };
    redactWebhookAction(input);
    assert.equal(input.headers!["x-api-key"], "sk-abc");
    assert.equal(input.body, "x-api-key=sk-abc");
  });
});

// ===========================================================================
// redactShellAction (D13 — command stays plaintext)
// ===========================================================================

describe("redactShellAction", () => {
  it("D13 — command stays plaintext", () => {
    const input: ShellConfig = { command: "rm -rf /" };
    const out = redactShellAction(input);
    assert.equal(out.command, "rm -rf /");
  });

  it("passes through cwd, timeoutMs, allowedPaths unchanged", () => {
    const input: ShellConfig = {
      command: "echo hi",
      cwd: "/tmp",
      timeoutMs: 5000,
      allowedPaths: ["/tmp"],
    };
    const out = redactShellAction(input);
    assert.deepEqual(out, input);
  });

  it("is idempotent", () => {
    const input: ShellConfig = { command: "ls -la" };
    assert.deepEqual(redactShellAction(redactShellAction(input)), input);
  });
});