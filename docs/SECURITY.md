# Security

This document describes cronboard's security model, the threats it does and doesn't defend against, and the concrete mitigations in place. It's the deep-cut companion to the **🔒 Security model** section of `README.md`.

## Threat model

### In scope (v0.6.0)

| Threat | Status |
|---|---|
| Local user (single-trust-zone) reads jobs.json | Expected behaviour — they own the data dir. |
| Webhook action requests a private network address (127.0.0.1, 169.254.169.254, etc.) | **Blocked** by `assertPublicUrl` unless explicitly overridden. |
| Bearer-token timing oracle on a non-loopback bind | **Mitigated** by `crypto.timingSafeEqual` with length normalization (v0.5.0+). |
| fastify transitive CVEs (host confusion, body-validation bypass, etc.) | **Patched** by bumping to `fastify@^5.9.0` (v0.5.0+). |
| `process.execArgv` pivot to a long-lived Node inspector | **Sanitized** by `sanitizeExecArgv` allowlist (v0.5.0+). |
| Bulk-list endpoint leaks secrets via copy-paste | **Redacted** by `stripJobSecrets` (v0.5.0+). |
| Editor can't see the saved API key → user can't edit | **Fixed** in v0.6.0 by removing `stripJobSecrets` from the single-item `:id` endpoint. |
| CORS: malicious cross-origin browser request reads data | **Mitigated** by `origin: false` (no CORS headers; same-origin only). |
| Path traversal in `jobs.json` / `runs.json` filename | **N/A** — paths are hard-coded by the data dir, not user-controlled. |
| Daemon PID-file TOCTOU | **Low impact** — file contents are `{pid, host, port}` only, not executable. |
| `cronExpression` regex-backtracking DoS | **Mitigated** by `z.string().min(1).max(256)`. |
| Job-name log-injection via pino | **Safe** — pino serializes all string values as JSON (escaped). |

### Out of scope (intentional)

| Threat | Reason | Workaround |
|---|---|---|
| Multi-user / multi-trust-zone access | Single-user design. v0.6.1+ may add per-job rate limiting + audit log. | Run cronboard inside a container or VM with strict isolation. |
| Untrusted code on disk tampering with `jobs.json` | Single-user — they're already root. | File permissions / full-disk encryption. |
| `jobs.json` plaintext at rest | v0.5.0 design; v0.7+ adds at-rest encryption. | OS-level disk encryption (FileVault, BitLocker, LUKS). |
| DNS rebinding TOCTOU between SSRF check and HTTP request | Out of scope for v0.5.0; v0.6.1+ adds IP pinning. | Use a public resolver that doesn't rebind; or run on a network where the threat doesn't apply. |
| SSRF via redirects | **Mitigated** by `undici`'s `maxRedirections: 0` (v0.5.0+). | Use a target that doesn't redirect. |
| Inbound webhook (cronboard receives triggers) | Out of scope; cronboard only sends. | Add a separate receiver process. |

## Concrete mitigations

### Bearer auth (v0.5.0+)

`packages/core/src/server.ts`:

```ts
if (auth !== null && deps.token) {
    const expected = Buffer.from(`Bearer ${deps.token}`, "utf8");
    const got = Buffer.from(auth, "utf8");
    if (got.length !== expected.length || !crypto.timingSafeEqual(got, expected)) {
        reply.code(401).send({ error: "unauthorized" });
        return reply;
    }
}
```

- Length-mismatch short-circuit is fine: `timingSafeEqual` requires equal lengths, so leaking the comparison result on a length mismatch is a non-issue.
- `buildServer` itself throws when bound to a non-loopback without `--token` — belt-and-braces with the CLI check in `cli.ts`.
- A `?reveal=true` opt-in for multi-origin deployments is tracked in v0.6.1.

### SSRF guard (v0.5.0+)

`assertPublicUrl` in `packages/core/src/security/ssrf.ts`:

1. Reject non-`http`/`https` schemes.
2. Reject hostname literals: `localhost`, `*.local`, `*.internal`, `0.0.0.0`.
3. `dns.lookup(hostname, { all: true })` to resolve both A and AAAA records.
4. For each resolved address, check:
   - IPv4 in 127/8, 10/8, 172.16/12, 192.168/16, 169.254/16 → reject.
   - IPv4 in 0.0.0.0/8 → reject.
   - IPv6 `::1`, `fe80::/10`, `fc00::/7`, multicast `ff00::/8` → reject.
   - IPv4-mapped IPv6 (`::ffff:a.b.c.d`) → unwrap and re-check against IPv4 rules.
5. Throw `PrivateNetworkError { code: "ERR_PRIVATE_NETWORK", target }` on any failure.
6. The action executor catches the error and returns a failed run with `error: "SSRF blocked: <target> is a private network address (set allowPrivateNetworks to override)"`.

**Override paths**:
- Per-action: set `config.allowPrivateNetworks: true` in the webhook config (toggle in the editor UI).
- Global: `CRONBOARD_ALLOW_PRIVATE_NETWORKS=1` env var, or `--allow-private-networks` CLI flag at daemon startup.

**Trade-offs**:
- DNS-rebinding TOCTOU: address resolved at submit time, attacker could rebind before HTTP. v0.6.1+ adds IP pinning.
- IPv6 ULA (`fc00::/7`): blocked (might break link-local testing on some IPv6 setups).
- `*.local` mDNS: blocked (matches Chromium's `.local` mDNS resolution, but might break legitimate `.local` setups).

### Secrets redaction (v0.5.0+)

`packages/core/src/security/secrets.ts`:

```ts
// Default sensitive-header set (case-insensitive)
const DEFAULT_SENSITIVE = new Set([
    "authorization", "x-api-key", "cookie", "set-cookie",
    "x-auth-token", "x-csrf-token", "x-access-token",
    "api-key", "apikey",
]);
```

- `redactHeaders(h)`: replaces values for sensitive keys with `***`, leaves other keys intact.
- `redactBody(b, contentType)`:
  - For `application/json`: walks the parsed object, masks any subtree whose key matches the sensitive set (the entire subtree, conservative).
  - For `application/x-www-form-urlencoded`: parses via `URLSearchParams`, masks matching keys, serializes back.
  - For unknown content types: returns the body unchanged.
- `redactWebhookAction(cfg)`: applies both.
- `redactShellAction(cfg)`: no-op (shell command is user-authored plaintext per design D13).

**Endpoint-level**:
- `GET /api/jobs` (list): applies `stripJobSecrets` → secrets masked in the response.
- `GET /api/jobs/:id` (single): **no** redaction (single-item trust model — the editor needs to show the saved config).
- `GET /api/jobs/:id/curl`: **no** redaction (literal curl, including the `x-api-key` value).

**The single-vs-bulk split is the entire security rationale for v0.6.0**. The list endpoint is a publishing channel (copy-pasted into chat, status banners, log forwarders); the single endpoint is consumed by the same user who started the daemon. Both are accessed through the same bearer token, but the single-item view is the only one that lets the user actually see what they configured.

### CORS hardening (v0.5.0+)

```ts
await app.register(cors, { origin: false, credentials: false });
```

- No CORS headers are added at all. Same-origin only.
- The dev server (Vite :5173) proxies `/api/*` to :3737 **server-side** (Vite config), so the browser sees a same-origin request to :5173 that hits the API at :3737 transparently.
- For reverse-proxy setups (e.g. nginx + multiple humans), a future `--cors-origins <csv>` flag will allow explicit origin whitelisting without changing the default.

### `execArgv` sanitization (v0.5.0+)

`packages/core/src/security/execArgv.ts`:

- **Allowlist**: any flag that starts with `--import`, `--require`, `--experimental-`, `--no-warnings`, `--title`, `--use-strict`, etc.
- **Denylist** (stripped from the forwarded argv even if they passed the allowlist):
  - `--inspect`, `--inspect-brk`, `--inspect-port`, `--inspect-publish-uid`, `--inspect-wait`, `--inspect-publish-uid-http`
  - `--debug`, `--debug-brk`, `--debug-port`
  - `--heap-prof`, `--heap-prof-`* (any subflag)
  - `--cpu-prof`, `--cpu-prof-`*
- Anything else gets dropped (conservative).

This prevents the attack: launch the parent with `node --inspect=0.0.0.0:9229 dist/cli.js start …` → a long-lived daemon with the Node inspector open on `0.0.0.0:9229`, ready to be attached by anyone on the network.

### `undici` redirect-following disabled (v0.5.0+)

```ts
const res = await request(cfg.url, {
    method: cfg.method,
    headers: { ... },
    body: cfg.method === "GET" ? undefined : cfg.body,
    headersTimeout: timeoutMs,
    bodyTimeout: timeoutMs,
    maxRedirections: 0,   // ← key change
});
```

- A `30x` response is now treated as a non-2xx result (i.e. `failed` run), not silently followed to a redirect target. Closes the SSRF-via-redirect vector.

### Webhook failure-path capture (v0.2.0+)

The action executor captures `request: { method, url, body }` AND `response: { status, headers, body }` on **both** success and failure paths. Failed runs are immediately diagnosable from the UI's run-details drawer (Request/Response/Error tabs).

This means a 403 from Langflow's `x-api-key required` is shown right next to the exact `x-api-key: sk-…` that was sent.

### `cronExpression` bounded (v0.5.0+)

```ts
cronExpression: z.string().min(1).max(256)
```

256 chars is more than enough for any sane cron. Prevents regex-backtracking abuse via pathological cron strings.

### Atomic file writes (v0.1.0+)

`packages/core/src/store/db.ts`:

- Write to temp file in the same directory.
- `rename()` over the destination.
- 5× exponential-backoff retry (50ms → 400ms) on `EPERM`/`EACCES`/`EBUSY` (the standard transient Windows antivirus / indexer lock).
- Last-resort: direct overwrite if all retries fail.

### Per-file mutex (v0.1.0+)

Reads and writes go through `withLock(file, fn)` — a single in-process mutex per file path. Prevents torn writes when the scheduler's `setRunMeta` races with the API's `GET /api/jobs`.

### File-watcher loop prevention (v0.2.0+)

`Scheduler.start()` sets up a `fs.watch` on the data directory. Naive implementation would create a self-trigger loop: scheduler writes `lastRunAt` → watcher fires → scheduler re-loads → ... — infinite loop.

Prevention:
- `mtime` cache tracks the last value we wrote.
- 80 ms debounce coalesces multi-event bursts (some platforms fire twice per save).
- `syncInFlight` flag prevents re-entry.
- `setRunMeta` only writes when `nextRunAt` actually changed.

### Log injection

`packages/core/src/logger.ts` uses pino, which serializes all string values as JSON (escaped). A job name with `\n[ERROR] fake log line` cannot forge log lines because the newline and brackets get JSON-escaped to `\\n[ERROR]`. Safe.

### PID file (v0.1.0+)

`packages/core/src/daemon.ts` writes `{pid, host, port}` to `cronboard.pid`. Symlink TOCTOU is theoretically possible (an attacker could place a symlink at the pid-file path before the daemon creates it), but the file contents are JSON metadata only, not executable. The attack surface is limited to a denial-of-service (the daemon can't start) rather than code execution. v0.6.1+ may harden by writing the pid file with `O_NOFOLLOW` and using `flock` for inter-process lock.

## What you can do to harden further

- **Run inside a container or VM** with strict isolation. cronboard is single-trust-zone; the right scaling is one instance per trust zone.
- **OS-level disk encryption** (FileVault, BitLocker, LUKS) — `jobs.json` and `runs.json` are plaintext on disk, so a stolen laptop or a backup tape leak exposes all secrets. OS-level encryption makes those unreadable without the user's login key.
- **File permissions**: `chmod 600 ~/.config/cronboard/*.json` so only your user can read the data dir.
- **Reverse proxy + TLS** if you bind to `0.0.0.0` (not the default). The daemon itself speaks plain HTTP; TLS terminates at the proxy.
- **Bump `--allow-private-networks` only when needed**. The default-deny SSRF guard is the strongest default we can ship without breaking legitimate loopback usage.

## Reporting a vulnerability

Open an issue at https://github.com/steimbyte/st-cron-webhook-trigger/issues. For sensitive disclosures, contact the project owner directly via the email in their GitHub profile.

## Threat model drift

The threat model in this document was last reviewed in v0.6.0 (2026-07-01). If you change the deployment model (e.g. add a reverse proxy, expose a public dashboard, integrate with a cloud secret manager), re-read this document and update the mitigations in the affected components.
