# Tasks: v0.5.0-security

> **Reihenfolge:** T0 → T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8 → T9 → T10 → T11 → T12 → T13 → T14. Jeder Task endet mit einem Gate, das vor dem nächsten Task grün sein muss.
> **TDD-Postur:** `strict_tdd: true` und `test-coverage-gap-disclosed` sind in `config.yaml` aktiv. **T1 muss zwingend RED laufen**, bevor T2 grün werden darf. Tests-first.
> **Datei-Konvention:** jeder Task listet die Dateien, die er anfasst (R = lesen, M = schreiben, C = anlegen). Diese Tasks sind für **`sdd-apply`**, nicht für `sdd-propose` — `sdd-propose` ist mit dem Schreiben dieser Datei fertig.

---

## T0 — Pre-flight: Baseline-Messung & Code-Audit

> **Status:** Vom Parent teilweise durchgeführt (security-reviewer Sweep). Dieser Task **misst einmalig den heutigen Stand**, damit `sdd-apply` eine reproduzierbare Vergleichsbasis hat.

- **R** `packages/core/src/actions/webhook.ts` — bestätige, dass `request(cfg.url, …)` heute keinen URL-Guard hat und keine `maxRedirections`-Option gesetzt ist. Audit-Notiz: „webhook.ts:24-25 — undici ohne Guard; S1–S8 fallen heute durch."
- **R** `packages/core/src/actions/shell.ts` — bestätige, dass der `allowedPaths`-Check nur den `cwd` prüft, nicht den Command.
- **R** `packages/core/src/server.ts` — bestätige:
  - Zeile ~32 `origin: (origin, cb) => cb(null, true), credentials: true` (M1).
  - Zeile ~37 `if (auth !== \`Bearer ${deps.token}\`)` ohne `crypto.timingSafeEqual` (H2).
  - Zeile ~38 kein `return reply` nach 401 (M5).
  - Zeile ~60 `function stripJobSecrets<T extends Record<string, any>>(job: T): T { return job; }` (M2).
  - Zeile ~269 `return job;` im GET /api/jobs/:id (auch kein Redaction).
- **R** `packages/core/src/cli.ts` Zeile 78 — bestätige `[...process.execArgv, …]` an `spawn(...)` (H4).
- **R** `packages/core/src/schemas.ts` Zeile ~62 — bestätige `cronExpression: z.string().min(1)` ohne max (L4).
- **R** `packages/core/package.json` — bestätige `fastify: ^4.28.0`, `@fastify/cors: ^9.0.1`, `@fastify/static: ^7.0.4` (H3).
- **R** `packages/core/src/scheduler/cronExpr.test.ts` — Anzahl vorhandener Tests protokollieren (Erwartung: 63).
- **R** `packages/core/src/stats/aggregations.test.ts` — Anzahl vorhandener Tests protokollieren (Erwartung: 12+ aus v0.4.0).
- Ausführen:
  ```powershell
  # Test-Count baseline:
  node --test --import tsx 'packages/core/src/**/*.test.ts' 2>&1 | Select-String "tests"
  # npm audit (zur H3-Evidenz):
  npm audit --json | ConvertFrom-Json | Select-Object -ExpandProperty vulnerabilities | Where-Object { $_.name -in "fastify","fast-uri","fast-json-stringify","sendWebStream" }
  # grep-basierte Bestandsaufnahme:
  Select-String -Path packages/core/src/**/*.ts -Pattern "execArgv|stripJobSecrets|timingSafeEqual|allowPrivateNetworks|maxRedirections"
  ```
- **Gate 0.1:** Bestandsaufnahme als kleine Notiz ans Ende dieses Tasks; insb. die exakte Zeilenzahl in `server.ts` und `cli.ts`, an denen der Eingriff stattfindet.

---

## T1 — Tests-first für `security/ssrf.ts` und `security/secrets.ts` (RED)

> **Dieser Task ist die Pflicht-Erfüllung von `rule: test-coverage-gap-disclosed`.** Vor jeder Produktiv-Zeile in `packages/core/src/security/{ssrf,secrets}.ts` steht ein Test, der fehlschlägt.

- **C** `packages/core/src/security/security.test.ts`
- Imports:
  ```ts
  import { describe, it, before, after, beforeEach } from "node:test";
  import assert from "node:assert/strict";
  import {
    assertPublicUrl,
    isPrivateAddress,
    PrivateNetworkError,
  } from "./ssrf.js";
  import {
    redactHeaders,
    redactBody,
    redactWebhookAction,
    redactShellAction,
  } from "./secrets.js";
  import type { WebhookConfig, ShellConfig } from "../types.js";
  ```
- **Mindestens 14 Test-Fälle** (über die vom Parent geforderten 10 hinaus, weil `strict_tdd` mehrere Edge-Cases pro Funktion verlangt):

  | Block | Test |
  |---|---|
  | `assertPublicUrl` IP-Deny (S1–S5, S7) | (a) `http://127.0.0.1/` wirft; (b) `http://localhost/` wirft; (c) `http://169.254.169.254/` wirft; (d) `http://10.0.0.1/` wirft; (e) `http://192.168.0.1/` wirft; (f) `http://172.16.0.1/` wirft (Bonus); (g) `ftp://example.com/` wirft (scheme); (h) `http://[::1]/` wirft (IPv6 loopback); (i) `http://[fe80::1]/` wirft (IPv6 link-local); (j) `http://[::ffff:127.0.0.1]/` wirft (IPv4-mapped IPv6). |
  | `assertPublicUrl` Allow | (a) `https://example.com/` wirft nicht (S6); (b) `http://8.8.8.8/` wirft nicht; (c) `http://1.1.1.1/` wirft nicht. |
  | `assertPublicUrl` Override (S8) | (a) `assertPublicUrl("http://10.0.0.1/", { allowPrivateNetworks: true })` wirft nicht. |
  | `isPrivateAddress` | (a) `"127.0.0.1"` → true; (b) `"10.0.0.5"` → true; (c) `"172.20.1.1"` → true (172.16/12 inkl.); (d) `"172.15.0.1"` → false (außerhalb); (e) `"8.8.8.8"` → false; (f) `"::1"` → true; (g) `"fe80::1"` → true; (h) `"::ffff:10.0.0.1"` → true (IPv4-mapped); (i) `"224.0.0.1"` → true (multicast). |
  | `redactHeaders` (S9, S10) | (a) `{ "x-api-key": "sk-abc" }` → Wert `"***"`; (b) `{ "Authorization": "Bearer xyz" }` → `"***"` (case-insensitive); (c) `{ "Content-Type": "application/json" }` → unverändert; (d) `{ "X-CSRF-Token": "abc" }` → `"***"`; (e) `{ "Cookie": "session=foo" }` → `"***"`; (f) `{ "X-Forwarded-For": "1.2.3.4" }` → unverändert; (g) Custom-sensitive-Set via `redactHeaders(h, ["x-my-secret"])`. |
  | `redactBody` JSON | (a) `'{"a":"sk-abc","b":2}'` → `{"a":"***","b":2}`; (b) verschachteltes Objekt mit Secret-Key → ganzer Subtree maskiert (D5); (c) ungültiges JSON → unverändert zurückgeben (defensiv); (d) `Content-Type: application/json` Pfad. |
  | `redactBody` Form-URL | (a) `"token=sk-real&name=ben"` → `"token=***&name=ben"`; (b) `Content-Type: application/x-www-form-urlencoded` Pfad. |
  | `redactWebhookAction` | (a) Input-`WebhookConfig` mit `headers: { "X-Api-Key": "sk-abc" }, body: "key=sk-real"` → Output-`headers["x-api-key"] === "***"`, `body === "key=***"` (für form-CT); (b) JSON-CT: Body-String wird zu JSON-String mit maskierten Werten. |
  | `redactShellAction` | (a) Input-`ShellConfig { command: "rm -rf /" }` → Output identisch (D13, command wird **nicht** maskiert). |

- **Hinweis zu `dns.lookup`-Tests**: für die `isPrivateAddress`-Tests ist kein Netzwerk nötig (die Funktion nimmt einen IP-String entgegen). Für `assertPublicUrl` mit öffentlichen Hostnamen mocken wir `dns.lookup` via `node:test`'s `mock` oder per Dependency-Injection (siehe T2 für die Implementierungs-Form). Alternative: ein eigenes `resolveAddresses(hostname)`-Helper, der in Tests überschrieben wird.
- **Gate 1.1 (RED erwartet):** `node --test --import tsx packages/core/src/security/security.test.ts` → ImportError oder Failures, weil `ssrf.ts`/`secrets.ts` noch nicht existieren. Ausgabe in den Log kopieren.
- **Gate 1.2:** Test-Datei kompiliert mit `tsc -p packages/core/tsconfig.json --noEmit` ohne Fehler.

> T1 ist die einzige Stelle, an der `sdd-apply` Code **vor** dem Produktiv-Code anlegen darf. Wenn der Runner aus irgendeinem Grund grün durchläuft, hat `sdd-apply` geschlampt und muss es wieder rot machen.

---

## T2 — Implementierung `security/ssrf.ts` und `security/secrets.ts` (GREEN)

- **C** `packages/core/src/security/ssrf.ts`
- **C** `packages/core/src/security/secrets.ts`

### T2.1 — `ssrf.ts`

- **`PrivateNetworkError`**:
  ```ts
  export class PrivateNetworkError extends Error {
    readonly code = "ERR_PRIVATE_NETWORK";
    constructor(public readonly target: string, reason: string) {
      super(`refused to fetch private target ${target}: ${reason}`);
      this.name = "PrivateNetworkError";
    }
  }
  ```
- **`isPrivateAddress(ip: string): boolean`** (pure):
  - Akzeptiert IPv4 und IPv6.
  - IPv4:
    - `127.0.0.0/8` (Loopback)
    - `10.0.0.0/8`
    - `172.16.0.0/12` (172.16.0.0 – 172.31.255.255)
    - `192.168.0.0/16`
    - `169.254.0.0/16` (Link-Local)
    - `224.0.0.0/4` (Multicast)
    - `0.0.0.0`
  - IPv6:
    - `::1/128` (Loopback)
    - `fe80::/10` (Link-Local)
    - `fc00::/7` (Unique-Local; v0.5.0 inkludiert)
    - `::ffff:0:0/96` (IPv4-mapped — dann den IPv4-Teil rekursiv prüfen)
  - Optional: `ff00::/8` (IPv6 Multicast).
- **`assertPublicUrl(url: string | URL, opts?: { allowPrivateNetworks?: boolean }): Promise<void>`**:
  - Parse URL; bei Parse-Error → `throw new TypeError(...)`.
  - **Scheme-Check**: erlaubt sind `http:` und `https:`. Sonst `throw new PrivateNetworkError(url, "scheme not allowed")`.
  - **Hostname-Pre-Check** (syntaktisch, kein DNS): wenn `hostname === "localhost"` oder mit `.local`/`.internal` endet → throw.
  - **DNS-Lookup**: `const addrs = await dns.promises.lookup(new URL(url).hostname, { all: true })`. Erwartet ein Array von `{ address: string, family: 4 | 6 }`. Wenn `addrs.length === 0` → throw (keine Resolutions).
  - **Iterate**: für jedes `addr`, prüfe `isPrivateAddress(addr.address)`. Wenn privat:
    - Wenn `opts?.allowPrivateNetworks === true` → **erlauben**, aber Logger-Warning ausgeben (Logger als Dependency übergeben oder optional; wenn nicht übergeben, `console.warn`).
    - Sonst → `throw new PrivateNetworkError(url, \`resolved to private address ${addr.address}\`)`.
- **Export für Tests**: `resolveAddresses` als interner Helper, der in Tests durch ein eigenes `resolveAddresses = (hostname) => Promise.resolve([{address: "127.0.0.1", family: 4}])` überschrieben werden kann. Implementierungs-Detail: Modul-internes `let _resolver = dns.promises.lookup` mit `setResolverForTests(fn)` und `resetResolverForTests()`. Tests rufen `setResolverForTests(...)` in `beforeEach` auf und `resetResolverForTests()` in `after`.

### T2.2 — `secrets.ts`

- **Default-Sensitive-Keys**:
  ```ts
  const DEFAULT_SENSITIVE_KEYS = new Set([
    "authorization", "x-api-key", "x-auth-token", "x-csrf-token",
    "x-access-token", "cookie", "set-cookie", "api-key", "apikey",
  ]);
  ```
- **`redactHeaders(h: Record<string, string> | undefined, extraKeys?: string[]): Record<string, string>`**:
  - Wenn `h === undefined` → `{}`.
  - Sonst: für jeden Eintrag: wenn `key.toLowerCase()` im (Default ∪ extraKeys) Set → Wert `"***"`. Sonst Wert unverändert.
  - Rückgabe: **neues** Objekt, Original nicht mutieren.
- **`redactBody(b: string | undefined, contentType: string | undefined, extraKeys?: string[]): string | undefined`**:
  - Wenn `b === undefined` → `undefined`.
  - Wenn `contentType?.startsWith("application/json")`:
    - `JSON.parse(b)` (in `try`/`catch`); bei Parse-Fehler → `b` unverändert zurück.
    - Walk rekursiv: für jeden String-Wert an einem Schlüssel im Sensitive-Set → `"***"`. Für **beliebige** String-Werte in einem **Objekt**, das einen Sensitive-Key direkt enthält → der gesamte Subtree wird ersetzt durch `{ [sensitiveKey]: "***" }`. Top-level primitive oder leeres Objekt → unverändert.
    - `JSON.stringify(result)`.
  - Wenn `contentType?.startsWith("application/x-www-form-urlencoded")`:
    - `URLSearchParams` parsen; sensitive Keys ersetzen; `URLSearchParams.toString()`.
  - Sonst: `b` unverändert.
- **`redactWebhookAction(a: WebhookConfig): WebhookConfig`**:
  - Spread + neue `headers` + neuen `body`. Idempotent.
- **`redactShellAction(a: ShellConfig): ShellConfig`**:
  - Spread, kein Eingriff in `command` (D13).
- **Gate 2.1 (GREEN erwartet):** `node --test --import tsx packages/core/src/security/security.test.ts` → alle Tests grün.
- **Gate 2.2:** `npm run typecheck -w packages/core` exit 0.
- **Gate 2.3:** `node --test --import tsx 'packages/core/src/**/*.test.ts'` zeigt 0 Failures, Test-Number-Diff vs. Baseline ≥ 14 (aus T1).

> Hinweis: `ssrf.ts` darf **keine** neuen Imports über das hinaus, was bereits in `packages/core/src/**` genutzt wird (`node:dns`, `node:url`). `secrets.ts` ebenfalls keine neuen Deps.

---

## T3 — Wire `assertPublicUrl` in `actions/webhook.ts`

- **M** `packages/core/src/actions/webhook.ts`
- **M** `packages/core/src/schemas.ts` — `webhookConfigSchema` um `allowPrivateNetworks: z.boolean().default(false)` erweitern.
- **M** `packages/core/src/types.ts` — `WebhookConfig.allowPrivateNetworks?: boolean` hinzufügen.
- **M** `packages/web/src/types.ts` und `packages/web/src/pages/JobEditor.tsx` — Toggle im Webhook-Form (Checkbox + Tooltip-Hinweis).
- **M** `packages/web/src/lib/api.ts` — `WebhookConfig`-Type-Spiegelung mitziehen.
- Änderungen in `webhook.ts`:
  ```ts
  import { assertPublicUrl, PrivateNetworkError } from "../security/ssrf.js";
  import { createLogger } from "../logger.js";
  // ...
  // Logger einmalig per Modul-Lazy-Init (oder via ctx — siehe Anmerkung):
  // Pragmatisch: console.warn, weil der ActionExecutor keinen Logger injiziert bekommt.
  // Optional: Logger als Konstruktor-Argument; später.

  async run(ctx, action): Promise<Partial<ActionRun>> {
    const a = action as WebhookAction;
    const cfg = a.config;
    const allowPrivate = cfg.allowPrivateNetworks === true;
    if (allowPrivate) {
      // bewusst laut — R7-Mitigation
      console.warn(`[cronboard] webhook job ${a.jobId}: allowPrivateNetworks=true — SSRF guard disabled for ${cfg.url}`);
    }
    try {
      await assertPublicUrl(cfg.url, { allowPrivateNetworks: allowPrivate });
    } catch (err) {
      if (err instanceof PrivateNetworkError) {
        const finishedAt = new Date();
        return {
          id, runId: ctx.runId, actionId: a.id,
          status: "failed",
          startedAt: startedAt.toISOString(),
          finishedAt: finishedAt.toISOString(),
          durationMs: finishedAt.getTime() - startedAt.getTime(),
          error: `private network target rejected: ${err.message}`,
        };
      }
      throw err;
    }

    // Im undici.request-Options-Objekt:
    const res = await request(cfg.url, {
      method: cfg.method,
      headers: { "user-agent": "cronboard/0.5 (+webhook)", ...(cfg.headers ?? {}) },
      body: cfg.method === "GET" ? undefined : cfg.body,
      headersTimeout: timeoutMs,
      bodyTimeout: timeoutMs,
      maxRedirections: 0,        // <-- H1-Fix
    });
    // Rest unverändert.
  ```
- **Anmerkung zu `redirects`**: undici folgt Redirects **standardmäßig**; `maxRedirections: 0` deaktiviert das. Document in `design.md §1` als „Breaking change for users who relied on 3xx-redirects".
- **Anmerkung zu `assertPublicUrl`**: das `await` muss VOR dem `request`-Call stehen. Im Tests-Pfad ist `assertPublicUrl` async — der Action-Run ist bereits async, also kein Problem.
- **Gate 3.1:** neuer `security.test.ts`-Fall: `assertPublicUrl("http://10.0.0.1/")` wirft mit `code === "ERR_PRIVATE_NETWORK"` und `target === "http://10.0.0.1/"`.
- **Gate 3.2:** `actions/webhook.ts`-Aufruf von `assertPublicUrl` ist via `grep -n assertPublicUrl packages/core/src/actions/webhook.ts` sichtbar.

---

## T4 — Timing-safe Auth in `server.ts`

- **M** `packages/core/src/server.ts` (Zeile ~37–41, im `onRequest`-Hook)
- Vorher:
  ```ts
  app.addHook("onRequest", async (req, reply) => {
    const url = req.routeOptions?.url ?? req.url;
    if (url.startsWith("/api/") && deps.token) {
      const auth = req.headers.authorization;
      if (auth !== `Bearer ${deps.token}`) {
        reply.code(401).send({ error: "unauthorized" });
      }
    }
  });
  ```
- Nachher:
  ```ts
  import { timingSafeEqual } from "node:crypto";
  // ...
  app.addHook("onRequest", async (req, reply) => {
    const url = req.routeOptions?.url ?? req.url;
    if (url.startsWith("/api/") && deps.token) {
      const auth = req.headers.authorization ?? "";
      const expected = `Bearer ${deps.token}`;
      const a = Buffer.from(auth);
      const b = Buffer.from(expected);
      // Längen-Mismatch früh raus (timingSafeEqual wirft sonst) — siehe D3.
      const ok = a.length === b.length && timingSafeEqual(a, b);
      if (!ok) {
        return reply.code(401).send({ error: "unauthorized" });
      }
    }
  });
  ```
- **Gate 4.1 (S11):** `grep -RIn "timingSafeEqual" packages/core/src/server.ts` → ≥ 1 Treffer.
- **Gate 4.2 (M5):** nach `return reply.code(401)` folgt ein expliziter `return` (durch das `return reply.code(401)` selbst).

> Hinweis: `timingSafeEqual` wirft einen `TypeError`, wenn die Buffer-Längen ungleich sind. Der `a.length === b.length`-Vorab-Check ist **explizit nötig** und in `design.md §2` als „Längen-Normalisierung" dokumentiert. Reviewer-Blick: Manche Implementierungen ziehen vor, absichtlich unterschiedlich-lange Inputs als Mismatch zu werten — der Branch ist deterministisch und keine zusätzliche Timing-Information.

---

## T5 — `stripJobSecrets` implementieren mit den neuen Helpern

- **M** `packages/core/src/server.ts` (Funktion `stripJobSecrets`, ~Zeile 269)
- Vorher:
  ```ts
  function stripJobSecrets<T extends Record<string, any>>(job: T): T {
    return job;
  }
  ```
- Nachher:
  ```ts
  import { redactWebhookAction, redactShellAction } from "./security/secrets.js";
  // ...
  function stripJobSecrets<T extends { actions?: any[] }>(job: T): T {
    if (!job || !Array.isArray(job.actions)) return job;
    return {
      ...job,
      actions: job.actions.map((a) => {
        if (a?.type === "webhook" && a.config) {
          return { ...a, config: redactWebhookAction(a.config) };
        }
        if (a?.type === "shell" && a.config) {
          return { ...a, config: redactShellAction(a.config) };
        }
        return a;
      }),
    };
  }
  ```
- **M** `packages/core/src/server.ts` — `GET /api/jobs/:id` ebenfalls durch `stripJobSecrets` schicken (vorher Zeile ~73 `return job;`):
  ```ts
  app.get("/api/jobs/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const job = await deps.jobs.get(id);
    if (!job) return reply.code(404).send({ error: "not found" });
    return stripJobSecrets(job);
  });
  ```
- **M** `packages/core/src/store/jobs.ts` — beim `list()` optional ein **einmaliges** Logging beim Service-Start einbauen, wenn ein geladener Job `WebhookConfig.url` privat hat und `allowPrivateNetworks !== true`. Genauer: in `buildServer` (T10-Slot) ein einziger Pass nach `deps.jobs.list()`:
  ```ts
  const jobs = await deps.jobs.list();
  const privateJobs = jobs.filter((j) =>
    j.actions.some((a) =>
      a.type === "webhook" && a.config.url &&
      /^(https?:\/\/)?(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|::1|fe80|localhost)/i.test(new URL(a.config.url).host)
    )
  );
  if (privateJobs.length > 0) {
    deps.logger.warn(
      { jobs: privateJobs.map((j) => ({ id: j.id, name: j.name })) },
      `${privateJobs.length} job(s) target private networks — set allowPrivateNetworks:true to keep them running`
    );
  }
  ```
  **Das ist eine bewusste Sichtbarmachung**, kein Hard-Block beim Job-Load — Jobs bleiben lauffähig, nur die Webhook-Action wird fehlschlagen.
- **Gate 5.1 (S12):** Smoke-Skript-Erweiterung: nach Seed eines Jobs mit `headers: { "X-Api-Key": "sk-test-abc" }, body: "key=sk-real-secret"`, dann `curl /api/jobs | jq '.jobs[0].actions[0].config'`. **Erwartung**: `headers["x-api-key"] === "***"`, `body` enthält kein `sk-`.
- **Gate 5.2:** `GET /api/jobs/:id` analog.

---

## T6 — `execArgv`-Sanitizer in `cli.ts`

- **C** `packages/core/src/security/execArgv.ts` (oder inline in `cli.ts`, YAGNI; vorerst inline)
- In `cli.ts` Zeile 78 ersetzen:
  ```ts
  const child = spawn(
    process.execPath,
    [...process.execArgv, process.argv[1], ...process.argv.slice(2), "--no-detach"],
    // ...
  );
  ```
  durch:
  ```ts
  import { sanitizeExecArgv } from "./security/execArgv.js"; // oder inline unten
  // ...
  const safeExecArgv = sanitizeExecArgv(process.execArgv);
  const child = spawn(
    process.execPath,
    [...safeExecArgv, process.argv[1], ...process.argv.slice(2), "--no-detach"],
    // ...
  );
  ```
- **`sanitizeExecArgv` Definition**:
  ```ts
  // Allowlist-first: behalte nur Flags, die in der Allowlist sind.
  // Denylist als zweite Verteidigung für nicht-aufgelistete aber gefährliche Flags.
  const ALLOWED = /^(?:-?-(?:import(?:=\S+)?|require(?:=\S+)?|experimental-[\w-]+|no-warnings|no-deprecation|enable-source-maps|title=\S*|heap-snapshot-signal=\S+|use-strict)\b|--)$/;
  const DENIED = /^(?:-?-(?:inspect(?:=\S+)?|inspect-brk(?:=\S+)?|inspect-port=\S+|inspect-publish-uid=\S+|inspect-wait(?:=\S+)?|debug(?:=\S+)?|debug-brk(?:=\S+)?|cpu-prof(?:=\S+)?|cpu-prof-dir=\S+|heap-prof(?:=\S+)?|heap-prof-dir=\S+|prof(?:=\S+)?))$/;

  export function sanitizeExecArgv(args: string[]): string[] {
    const out: string[] = [];
    for (const arg of args) {
      if (DENIED.test(arg)) continue;       // hard deny
      if (ALLOWED.test(arg)) out.push(arg); // soft allow
      // sonst: skip (defensiv)
    }
    return out;
  }
  ```
- **Gate 6.1:** `sanitizeExecArgv(['--inspect=0.0.0.0:9229', '--enable-source-maps'])` → `['--enable-source-maps']`.
- **Gate 6.2:** `sanitizeExecArgv(['--heap-prof'])` → `[]`.
- **Gate 6.3:** `sanitizeExecArgv(['--import=tsx', '--require=./hook.js', '--no-warnings'])` → unverändert.
- **Gate 6.4:** `cli.ts`-Aufruf von `sanitizeExecArgv` via `grep -n sanitizeExecArgv packages/core/src/cli.ts`.

> Detail: `tsx watch` setzt `--import=tsx`; das ist erlaubt. `tsx watch --inspect=…` wird beim Detach-Spawn zu `--import=tsx` (inspect rausgefiltert). Dev-Flow bleibt funktional, Inspector wird beim Daemon aber nicht exposed. Korrekt.

---

## T7 — `fastify` Upgrade auf 5.9.x

- **M** `packages/core/package.json`:
  ```json
  {
    "dependencies": {
      "fastify": "^5.9.0",
      "@fastify/cors": "^11.0.0",
      "@fastify/static": "^8.0.0",
      // Rest unverändert
    }
  }
  ```
- **M** `package-lock.json` via `npm install` (das ist `sdd-apply`-Hoheit, hier nur Plan).
- **R** Migrations-Notes: https://fastify.dev/docs/v5.0/migration/ — insbesondere:
  - **Default `bodyLimit`**: bleibt 1 MiB.
  - **Default `logger`**: false ist weiter erlaubt (wir nutzen pino separat).
  - **`reply.send({ error: "..." })`**: unverändert.
  - **`cors`-Plugin**: `origin: false` ist die korrekte „Same-Origin-only"-Variante in v5 (siehe T8).
  - **`fastifyStatic`**: `prefix: "/"` und `root: webDist` unverändert; v8 unterstützt Node 20.
- **M** Bei `npm install` auftretende Peer-Dep-Warnungen (insb. `undici@^6.18.0` ist bereits kompatibel mit fastify 5) dokumentieren.
- **Gate 7.1:** `npm run typecheck -w packages/core` exit 0 nach dem Bump.
- **Gate 7.2:** `npm run build` (root) exit 0.
- **Gate 7.3:** `scripts/smoke.ps1` exit 0 — alle Endpoints antworten.

> Risiko R4: wenn ein Endpoint nach v5 nicht antwortet, **kein Fallback auf v4**. Stattdessen: Bug-Report und Patch im selben Change (v0.5.0 darf nicht raus, wenn Smoke rot ist).

---

## T8 — CORS auf `origin: false`

- **M** `packages/core/src/server.ts` (Zeile ~32):
  ```ts
  await app.register(cors, { origin: false });
  ```
- **Doku-Kommentar** im Code:
  ```ts
  // Same-origin only. Cross-origin requests are blocked at the browser layer.
  // For multi-origin deployments, run cronboard behind a reverse proxy (recommended)
  // or wait for v0.6+ --cors-origins <csv> flag.
  ```
- **Gate 8.1:** `curl -H "Origin: https://evil.example" -i http://127.0.0.1:3737/api/health` → kein `access-control-allow-origin`-Header in der Response.
- **Gate 8.2:** `curl -i http://127.0.0.1:3737/api/health` (ohne Origin) → 200 OK, kein CORS-Header involviert.

> Anmerkung: `credentials: true` entfällt komplett, weil `origin: false` bereits implizit „keine Credentials" ist.

---

## T9 — Shell `allowedPaths` hardening

- **M** `packages/core/src/actions/shell.ts`:
  ```ts
  // Bestehender Check bleibt (cwd-Anker), plus:
  if (cfg.allowedPaths && cfg.allowedPaths.length > 0) {
    const absCwd = cfg.cwd ? path.resolve(cfg.cwd) : process.cwd();
    const allowed = cfg.allowedPaths.some((p) => absCwd.startsWith(path.resolve(p) + path.sep));
    if (!allowed) {
      throw new Error(`cwd "${absCwd}" is outside allowed paths: ${cfg.allowedPaths.join(", ")}`);
    }
  } else {
    // Doku-Warning: kein allowedPaths → cwd ist effektiv unrestricted.
    const cwd = process.cwd();
    const privilegedHome = /^(\/root|\/home\/[^\/]+|\/Users\/[^\/]+|[A-Z]:\\Users\\[^\\]+)$/;
    if (privilegedHome.test(cwd)) {
      console.warn(`[cronboard] shell job ${a.jobId}: running in ${cwd} with no allowedPaths set. Consider setting allowedPaths to restrict impact.`);
    }
  }
  ```
- **Anmerkung**: das ist eine Warning, kein Block. Der User hat die Shell-Action explizit konfiguriert; ein Hard-Block wäre zu invasiv.
- **Gate 9.1:** ein Test in `security.test.ts` (oder neuer `shell-allowedPaths.test.ts`, falls umfangreich): `actions/shell.ts` mit `cfg.cwd: "/etc"` und `allowedPaths: ["/tmp"]` → wirft. Mit `cfg.cwd: "/tmp/sub"` und `allowedPaths: ["/tmp"]` → ok.
- **Gate 9.2:** Warning wird **nicht** im Test verifiziert (Logger-Capture ist out-of-scope); Reviewer-Blick: `console.warn`-Aufruf sichtbar im Diff.

---

## T10 — Server-side Default-Token-Check (`buildServer` Pre-Check)

- **M** `packages/core/src/server.ts → buildServer`:
  ```ts
  export async function buildServer(deps: BuildServerDeps): Promise<FastifyInstance> {
    const host = (deps as any).host as string | undefined; // optional host aus CLI
    if (host && host !== "127.0.0.1" && host !== "localhost" && host !== "::1" && !deps.token) {
      throw new Error(
        `refusing to build server for non-loopback host "${host}" without a token. ` +
        `Either bind to 127.0.0.1 (default) or pass --token <secret>.`
      );
    }
    // Rest unverändert.
  }
  ```
- **M** `packages/core/src/cli.ts` — die `deps`-Konstruktion muss `host: cfg.host` mitschicken:
  ```ts
  const deps: any = { jobs, runs, logger, token: cfg.token, host: cfg.host };
  ```
- **Gate 10.1:** Unit-Test: `await expect(buildServer({ jobs, runs, logger, host: "0.0.0.0" })).rejects.toThrow(/refusing/i)`.
- **Gate 10.2:** Smoke-Test: `cronboard start --host 0.0.0.0` ohne `--token` → exit 2 mit klarer Meldung (CLI fängt den Wurf ab).

---

## T11 — Defensive `return reply` nach 401

- **M** Ist in T4 bereits erledigt. T11 ist ein expliziter Re-Review-Schritt:
  - `grep -n "return reply.code(401)" packages/core/src/server.ts` → 1 Treffer.
  - **Gate 11.1:** Reviewer-Bestätigung im PR, dass `return reply.code(401).send(...)` mit explizitem `return` aufgerufen wird (siehe T4-Snippet).

---

## T12 — `cronExpression.max(256)`

- **M** `packages/core/src/schemas.ts`:
  ```ts
  export const jobSchema = z.object({
    // ...
    cronExpression: z.string().min(1).max(256),
    // ...
  });
  ```
- **Gate 12.1:** Unit-Test in `security.test.ts` (oder neu `schemas.test.ts`): `jobSchema.parse({ ..., cronExpression: "a".repeat(257) })` wirft; `jobSchema.parse({ ..., cronExpression: "*/5 * * * *" })` ok.

---

## T13 — Version bump `0.4.0` → `0.5.0` + Doku

- **M** `package.json` (Root) — `"version": "0.4.0"` → `"0.5.0"`
- **M** `packages/web/package.json` — `"version": "0.4.0"` → `"0.5.0"`
- **M** `packages/core/package.json` — `"version": "0.4.0"` → `"0.5.0"`
- **M** `packages/core/src/cli.ts` Zeile 28 — `.version("0.4.0")` → `.version("0.5.0")`
- **M** `packages/core/src/server.ts` Zeile 47 — `version: "0.4.0"` → `version: "0.5.0"` (siehe T4-Kontext)
- **M** `openspec/config.yaml → project.version` — `0.4.0` → `0.5.0`
- **M** `README.md` — neuer Abschnitt „Security" mit den 4 Hauptfixes (SSRF, Timing, execArgv, secrets) und dem Migrations-Hinweis (siehe `design.md §8`).
- **M** User-Agent-String in `webhook.ts` — `cronboard/0.1` → `cronboard/0.5`.
- Verifikation:
  ```powershell
  Select-String -Path package.json,packages/*/package.json,packages/core/src/cli.ts,packages/core/src/server.ts,openspec/config.yaml -Pattern "0\.4\.0"
  # erwartet: 0 Treffer
  Select-String -Path package.json,packages/*/package.json,packages/core/src/cli.ts,packages/core/src/server.ts,openspec/config.yaml -Pattern "0\.5\.0"
  # erwartet: 5+1 Treffer
  ```
- **Gate 13.1:** `grep` zeigt 0 Treffer für `0.4.0`, ≥ 6 für `0.5.0`.

---

## T14 — Gates: typecheck, tests, smoke, npm audit, build, commit, push

- **R** Alle Quellen seit T1.
- Ausführen:
  ```powershell
  npm run typecheck
  node --test --import tsx 'packages/core/src/**/*.test.ts'
  npm run build
  powershell -ExecutionPolicy Bypass -File scripts/smoke.ps1
  npm audit --production
  ```
- **Gate 14.1 (S13):** `npm run typecheck` exit 0.
- **Gate 14.2 (S14):** Test-Run zeigt 0 Failures; Anzahl = (Baseline aus T0) + ≥ 14 neue in `security.test.ts`.
- **Gate 14.3 (S1–S10):** alle SSRF- und Secrets-Tests in `security.test.ts` grün.
- **Gate 14.4:** `npm audit --production` zeigt 0 HIGH/CRITICAL Vulnerabilities.
- **Gate 14.5:** `scripts/smoke.ps1` exit 0; im Smoke-Output taucht `=== done ===` (oder die etablierte Erfolgsmeldung).
- **Gate 14.6:** `npm run build` exit 0; Lockfile-Diff betrifft nur den `fastify`-Tree (Reviewer-Check).
- Commit + Push:
  ```powershell
  git status
  git add \
    openspec/changes/v0.5.0-security/ \
    package.json packages/web/package.json packages/core/package.json package-lock.json \
    packages/core/src/security/ \
    packages/core/src/actions/webhook.ts packages/core/src/actions/shell.ts \
    packages/core/src/server.ts packages/core/src/cli.ts packages/core/src/schemas.ts packages/core/src/types.ts \
    packages/web/src/lib/api.ts packages/web/src/types.ts packages/web/src/pages/JobEditor.tsx \
    openspec/config.yaml README.md
  git status
  git commit -m "feat(v0.5.0): security hardening - SSRF guard, timing-safe auth, secrets redaction, execArgv sanitizer, fastify 5"
  git push origin master
  ```
- **Gate 14.7:** `git log -1 --pretty=%s` → exakt der vorgegebene Subject.
- **Gate 14.8:** `git diff master@{1} master --stat` zeigt nur die oben `git add`-eten Pfade.
- **Gate 14.9:** Re-Run `npm run typecheck && node --test --import tsx 'packages/core/src/**/*.test.ts' && powershell -ExecutionPolicy Bypass -File scripts/smoke.ps1` — alles grün.

> Commit-Message-Konvention: v0.4.0 nutzte `feat(v0.4.0): …`. v0.5.0 setzt das mit `feat(v0.5.0):` fort.

---

## Cross-Phase-Checkliste (bevor `sdd-apply` als erfolgreich gilt)

- [ ] T0 Baseline-Analyse geschrieben
- [ ] T1 Tests-first: `security.test.ts` **RED** nachweisbar
- [ ] T2 Implementierung: `ssrf.ts` und `secrets.ts` machen die Tests **GREEN**
- [ ] T3 `assertPublicUrl` ist in `actions/webhook.ts` verdrahtet; `maxRedirections: 0` gesetzt
- [ ] T4 `crypto.timingSafeEqual` ersetzt den `!==`-Vergleich; `return reply` (T11) implizit erledigt
- [ ] T5 `stripJobSecrets` nutzt `redactWebhookAction`/`redactShellAction`; `GET /api/jobs` und `/api/jobs/:id` sind safe; Private-Target-Warning geloggt
- [ ] T6 `sanitizeExecArgv` ist im Detach-Spawn aktiv; `cli.ts` ruft sie auf
- [ ] T7 `fastify@^5.9` in `package.json`; `npm install` ist gelaufen; Typecheck + Smoke grün
- [ ] T8 CORS auf `origin: false`; Cross-Origin-Requests erhalten keinen `Access-Control-Allow-Origin`-Header
- [ ] T9 Shell-Warning bei privileged-cwd logged; `allowedPaths`-Anker bleibt korrekt
- [ ] T10 `buildServer` wirft bei non-loopback + kein Token; CLI fängt ab
- [ ] T12 `cronExpression.max(256)` greift
- [ ] T13 Versionsstrings vollständig von `0.4.0` auf `0.5.0`
- [ ] T14 Typecheck + Tests + Smoke + npm audit + Build + Commit + Push — alle grün
- [ ] `git diff packages/*/src/` zeigt nur die geplanten Änderungen; sonst nichts Unerwartetes
- [ ] **Acceptance Criteria S1–S14** alle erfüllt (Tabelle in `proposal.md §3`)
- [ ] **Decisions D1–D14** aus `proposal.md §8` sind in der Implementierung erkennbar

---

## Beobachtungen für `sdd-apply` (keine T-Tasks, Empfehlungen)

1. **Logger im ActionExecutor**: aktuell hat `ActionExecutor` keinen `Logger`. Für v0.5.0 nutzen wir `console.warn` (siehe T3, T9). Ein `Logger`-Argument im Executor-Vertrag ist ein Refactor für v0.6+ (würde `registry.ts` berühren).
2. **`resolveAddresses`-Mock in Tests**: die Test-Mock-Strategie in T2.1 (Modul-State `setResolverForTests`) ist absichtlich simpel. Wer das nicht mag, kann `assertPublicUrl` so refactoren, dass es einen `Resolver = (hostname: string) => Promise<LookupAddress[]>` als Dependency bekommt; das ist aber YAGNI für v0.5.0.
3. **`redactBody` für unbekannte Content-Types**: gibt den Body unverändert zurück. Wenn jemand `application/xml` mit Secrets schickt, sind die ungeschützt. v0.5.0 akzeptiert das (XML-Body ist unüblich für Webhooks).
4. **Bundle-Delta**: kein Frontend-Bundle-Change durch v0.5.0 (außer dem Toggle im JobEditor, der vernachlässigbar ist). v0.5.0 ist primär ein Backend-Change.
5. **Folge-Changes (eigene Change-IDs)**:
   - `--cors-origins <csv>` (v0.5.1 Patch oder v0.6)
   - at-rest Verschlüsselung von `jobs.json`/`runs.json` (v0.6+)
   - Per-Job-Rate-Limiting
   - MFA / RBAC (eigentlich: nein, single-user-Design bleibt)
   - Audit-Log / Activity-Log
   - DNS-Rebinding-Mitigation via `dns.setServers` + IP-Pinning (v0.6+)
   - CSP-Header auf der SPA-HTML