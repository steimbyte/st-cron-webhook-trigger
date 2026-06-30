# Proposal: v0.5.0-security — Security-Härtung des Cronboard-Kerns

- **Phase:** sdd-propose → wartet auf Freigabe → sdd-apply
- **Autor:** sdd-proposal sub-agent (parent: gentle-pi harness)
- **Datum:** 2026-06-30
- **Projekt:** `cronboard` (aktuell v0.4.0; v0.4.0-correct-statistics wurde gerade abgeschlossen)
- **Governance:** `openspec/config.yaml`, `AGENTS.md` (Regeln in §2 / §4 haben Vorrang)
- **Audit-Quelle:** `security-reviewer` sub-agent (Befunde paraphrasiert; siehe Anhang A)

---

## 1. Executive Summary (≤ 200 Wörter)

Ein frischer `security-reviewer`-Sweep über `packages/core/` hat **15 Befunde** (4 High, 5 Medium, 6 Low, 2 Info) aufgedeckt. Vier davon sind echte Sicherheitslücken (SSRF in Webhooks, Timing-Oracle auf Bearer-Token, execArgv-Pivot auf `--inspect=0.0.0.0:9229`, fünf transitive CVEs in `fastify@^4.28`), fünf sind robustheitskritisch (CORS-allow-all mit Credentials, `stripJobSecrets`-No-op leakt Webhook-Header/Body & Shell-Kommandos, Shell-Action ohne harte `allowedPaths`-Anker, fehlender Server-Default-Token-Check, fehlendes `return reply` nach 401). Die restlichen sechs sind Low/Info und bilden eine bewusste OUT-Scope-Liste für v0.6+.

v0.5.0 schließt die vier Sicherheitslücken und die fünf Robustheits-Punkte in einer einzigen, semver-majoren Änderung:

1. **`assertPublicUrl`** in `packages/core/src/security/ssrf.ts` lehnt RFC1918-, Loopback-, Link-Local-, IPv4-mapped-IPv6-, Multicast- und `.local`/`.internal`-Targets ab; per `dns.lookup({ all: true })` werden A/AAAA-Records aufgelöst. Webhook-Action bekommt ein optionales `allowPrivateNetworks: boolean` als expliziten Escape-Hatch.
2. **`crypto.timingSafeEqual`** ersetzt den `!==`-Token-Vergleich im `onRequest`-Hook.
3. **`fastify` 4.28 → 5.9.x** (plus `@fastify/cors@^11`, `@fastify/static@^8`).
4. **`execArgv`-Sanitizer** deny-listed `--inspect*`/`--debug*`/`--heap-prof*` beim Detach-Spawn.
5. **`stripJobSecrets`** wird implementiert (Header-Redaction, JSON-Body-Redaction, Form-URL-Body-Redaction); `GET /api/jobs` und `GET /api/jobs/:id` reichen die redacted Version an den Client.
6. CORS auf `origin: false` (same-origin only); Shell-`allowedPaths` enforced cwd+command; Server weigert sich an `0.0.0.0` ohne Token; `return reply` nach 401; `cronExpression.max(256)`.

Tests-first: ≥ 10 neue Unit-Tests in `security.test.ts`. Akzeptanz S1–S14 ist maschinenprüfbar. Migration für bestehende v0.4.0-User mit Webhooks auf `127.0.0.1`/AWS-Metadaten: einmalig `allowPrivateNetworks: true` in der Webhook-Action setzen.

---

## 2. Intent

Cronboard ist **local-first**, bindet per Default `127.0.0.1` und benutzt im Default-Modus kein Token — daraus entsteht ein trügerisches Sicherheitsgefühl. Der Audit zeigt, dass genau diese Annahme („ich laufe ja eh nur lokal") in **mehreren Dimensionen** nicht hält:

1. **SSRF in Webhooks** (H1): `undici.request(cfg.url, …)` in `actions/webhook.ts` schickt die Anfrage an jeden URL-String, den der Nutzer in den Job legt. Das ist ein klassischer Server-Side-Request-Forgery-Vektor, weil das Webhook-Target **intern** liegen kann (`http://127.0.0.1:3737/api/jobs` → SSRF-Chaining auf die eigene Admin-API; `http://169.254.169.254/latest/meta-data/` → AWS-Metadaten-IPMI; `http://10.0.0.1/` → Heimnetz). Undici folgt Redirects per Default, was den Vektor erweitert.
2. **Timing-Oracle auf Bearer** (H2): `auth !== \`Bearer ${deps.token}\`` in `server.ts:onRequest` ist non-constant-time. Ein lokaler Angreifer mit der Fähigkeit, viele Auth-Header zu schicken, kann das Token Zeichen für Zeichen extrahieren. Besonders relevant in Umgebungen, in denen Cronboard versehentlich an einer nicht-loopback-Adresse gebunden ist (H+M4).
3. **execArgv-Pivot** (H4): in `cli.ts` Zeile 78 wird `[...process.execArgv, ...]` an den Detach-Spawn weitergegeben. Wer Cronboard mit `tsx watch --inspect=0.0.0.0:9229 src/cli.ts start` startet, gibt den Node-Inspector am öffentlichen Interface frei — der Detach-Spawn erbt das Argument. Klassischer Dev-/Prod-Drift-Bug mit hoher Eskalationswirkung.
4. **Transitive CVEs** (H3): fünf HIGH in `fast-uri`, `fast-json-stringify`, `sendWebStream` (siehe `npm audit` Output-Anhang A). Fix = `fastify` 4.28 → 5.9.x.
5. **`stripJobSecrets`-No-op** (M2): `GET /api/jobs` schickt heute `WebhookConfig.headers` (Authorization, X-API-Key, Cookie, …) und `WebhookConfig.body` (Roh-Body, ggf. mit Secrets) 1:1 an den Client. Same für `ShellConfig.command`. Das ist ein **Daten-Leak**, der in v0.4.0 dokumentiert, aber nie implementiert wurde. Auf `127.0.0.1` und ohne Token ist das „nur" lokal; sobald jemand das Backend exponiert (H+M1-M4-Combo), leakt es alle Credentials der gesamten Job-Fleet an den UI-Client.
6. **CORS `allow-all` + credentials** (M1): `@fastify/cors` mit `origin: (origin, cb) => cb(null, true), credentials: true`. Der UI-Client sendet heute zwar keine Credentials, aber die Kombination ist eine Landmine, falls das je geändert wird.
7. **Shell-Action ohne harten Anker** (M3): `allowedPaths` ist opt-in; default = `process.cwd()`. Wer Cronboard als root laufen lässt, hat `cwd === /root` und damit vollen Schreibzugriff.
8. **Server bindet ohne Auth, wenn Modul standalone** (M4): Token-Check existiert nur im CLI; `buildServer({ token: undefined })` startet die API ohne Auth.

Ziel dieser Änderung: jede dieser Klassen ist **eliminiert, mit Tests nachgewiesen und in der Doku erwähnt**. Bestandsjobs, die heute `127.0.0.1` als Webhook-Target benutzen, funktionieren weiter — wenn der Nutzer explizit `allowPrivateNetworks: true` setzt. Die Telemetrie/Logging-Hooks sind so gestaltet, dass ein versehenliches `true` sichtbar bleibt.

---

## 3. Acceptance Criteria (S1–S14)

Diese Kriterien sind die Vertragsbasis für `sdd-apply` und werden in `sdd-verify` automatisiert geprüft.

| #    | Kriterium | Messverfahren |
|------|-----------|--------------|
| S1   | `assertPublicUrl("http://127.0.0.1/")` wirft `PrivateNetworkError`. | Unit-Test in `security.test.ts`: `assert.throws(...)` mit Code `ERR_PRIVATE_NETWORK`. |
| S2   | `assertPublicUrl("http://localhost/")` wirft `PrivateNetworkError`. | Unit-Test. |
| S3   | `assertPublicUrl("http://169.254.169.254/")` wirft `PrivateNetworkError`. | Unit-Test. |
| S4   | `assertPublicUrl("http://10.0.0.1/")` wirft `PrivateNetworkError`. | Unit-Test. |
| S5   | `assertPublicUrl("http://192.168.0.1/")` wirft `PrivateNetworkError`. | Unit-Test. |
| S6   | `assertPublicUrl("https://example.com/")` wirft **nicht**. | Unit-Test: `assert.doesNotThrow(...)`. |
| S7   | `assertPublicUrl("ftp://example.com/")` wirft (scheme). | Unit-Test. |
| S8   | `assertPublicUrl("http://example.com/", { allowPrivateNetworks: true })` wirft nicht (Override-Pfad). | Unit-Test. |
| S9   | `redactHeaders({ "x-api-key": "sk-abc" })["x-api-key"] === "***"`. | Unit-Test. |
| S10  | `redactHeaders({ "Content-Type": "application/json" })["Content-Type"] === "application/json"` (unverändert). | Unit-Test. |
| S11  | `crypto.timingSafeEqual` wird in `server.ts` für den Token-Vergleich benutzt. | `grep -RIn "timingSafeEqual" packages/core/src/server.ts` liefert ≥ 1 Treffer. |
| S12  | `GET /api/jobs` Response-Body enthält **keinen** String, der mit `sk-`, `Bearer `, oder bekannten Secret-Prefixes beginnt (über alle `headers`-/`body`-/`command`-Felder). | Smoke-Test mit `curl http://127.0.0.1:3737/api/jobs | jq '.jobs[] | .. | objects | select(has("headers") or has("body") or has("command"))'`; Assert: keine Werte matchen das Regex `^(sk-|sk_|ghp_|gho_|xox[abp]-|Bearer\s)`. |
| S13  | `npm run typecheck` exit 0. | Wie v0.4.0. |
| S14  | `node --test --import tsx 'packages/core/src/**/*.test.ts'` ist grün; die Suite enthält die existierenden 63 `cronExpr.test.ts`-Tests + die `stats/aggregations.test.ts` aus v0.4.0 + ≥ 10 neue Tests in `security.test.ts`. | Test-Run; Differenz zur Baseline (vor T1) ≥ 10. |

> Hinweis S12: der Test wird **gegen ein Seed-Job** mit `headers: { "X-API-Key": "sk-test-abc" }` und `body: "token=sk-real-secret"` gefahren. Vor `T5` schlägt der Test fehl, nach `T5` ist er grün — das ist die maschinenprüfbare Evidenz, dass `stripJobSecrets` greift.

---

## 4. Scope

### 4.1 In-Scope

| Bereich | Änderung |
|---|---|
| SSRF-Modul | Neu: `packages/core/src/security/ssrf.ts` mit `assertPublicUrl(url, { allowPrivateNetworks?: boolean })` und der Helper `isPrivateAddress(ip: string): boolean`. Wirft `PrivateNetworkError` (extends `Error`, `code = "ERR_PRIVATE_NETWORK"`, `target = url`). |
| Secrets-Modul | Neu: `packages/core/src/security/secrets.ts` mit `redactHeaders(h)`, `redactBody(b, contentType)`, `redactWebhookAction(a)`, `redactShellAction(a)`. Pure functions, keine IO. |
| Webhook-Action | `packages/core/src/actions/webhook.ts`: vor `undici.request` `assertPublicUrl` aufrufen; Redirect-Folgen deaktivieren (`maxRedirections: 0`); bei `allowPrivateNetworks: true` Logger-Warning. |
| Webhook-Config | `packages/core/src/schemas.ts → webhookConfigSchema` um `allowPrivateNetworks: z.boolean().default(false)` erweitern; `WebhookConfig` in `types.ts` spiegeln; Web-UI (`JobEditor.tsx`) zeigt einen Toggle mit Tooltip-Hinweis. |
| Server-Auth-Hook | `packages/core/src/server.ts`: `crypto.timingSafeEqual` mit Längen-Normalisierung; `return reply` nach 401. |
| `stripJobSecrets` | `packages/core/src/server.ts`: implementieren mit den neuen Helpern; in `GET /api/jobs` und `GET /api/jobs/:id` einsetzen. |
| CLI execArgv | `packages/core/src/cli.ts`: `sanitizeExecArgv(process.execArgv)` einführen; Denylist siehe `design.md §5`. |
| Server-Default-Token | `packages/core/src/server.ts → buildServer`: wenn `host` nicht loopback/lokal und `token` undefined → `throw new Error("refusing to bind non-loopback without token")`. CLI prüft das schon; der Server prüft es zusätzlich (belt-and-braces). |
| Shell-Action | `packages/core/src/actions/shell.ts`: wenn `allowedPaths` non-empty → `cfg.cwd` muss in einem erlaubten Root liegen (bereits implementiert, **plus** Logger-Warning wenn `process.cwd()` ein privileged-user-Home ist und `allowedPaths` leer). |
| CORS | `packages/core/src/server.ts`: `origin: false` (same-origin only). Doku-Hinweis: `--cors-origins <csv>` als v0.6+ Follow-up. |
| Schema-Maxe | `packages/core/src/schemas.ts`: `cronExpression: z.string().min(1).max(256)`. |
| Dep-Upgrade | `packages/core/package.json`: `fastify: ^5.9.0`, `@fastify/cors: ^11`, `@fastify/static: ^8`. `npm install` aktualisiert Lockfile. |
| Tests | `packages/core/src/security/security.test.ts` (neu, strict TDD, ≥ 10 Tests über ssrf + secrets). |
| Version-Bump | `0.4.0` → `0.5.0` in den sechs bekannten Stellen. |
| Doku | `README.md` Sicherheits-Abschnitt (neu); Migrations-Hinweis für `127.0.0.1`-Targets. |

### 4.2 Explicit out-of-scope (Nutzer kann jetzt widersprechen)

| Punkt | Begründung |
|---|---|
| **`jobs.json` / `runs.json` at-rest-Verschlüsselung** (L2) | Würde das Storage-Format ändern, Migration brechen, Key-Management erfordern. v0.6+. |
| **Per-Job-Rate-Limiting** | Keine UX-Anforderung, kein Per-Customer-Bedarf heute. |
| **MFA / RBAC** | Single-User-Design. Storage-Modell-Wurf. |
| **Audit-Log / Activity-Log** | Eigenständiges Feature, nicht „Security-Fix". |
| **CSRF-Tokens** | Same-Origin, Bearer-less SPA; nicht anwendbar. |
| **CSP-Header auf der SPA-HTML** | Defense-in-depth, gehört zu v0.6+. |
| **WebSocket / SSE Live-Updates** | Dashboard-Architektur-Wurf. Bereits in v0.4.0-Proposal als OUT. |
| **JSON-Storage-Migration** | Storage-Format bleibt byte-identisch. |
| **`stripJobSecrets` für Run-Outputs** | Runs redigieren bereits per Display-Time-Logik in v0.4.0. Webhook-Body bleibt aus v0.4.0 verbatim in `runs.json` für Debugging (L1 akzeptiert). |
| **DaisyUI / Tailwind-Ablösung** | v0.3.0 abgeschlossen. |

---

## 5. Affected areas (read-only — `sdd-apply` modifiziert diese)

```
packages/core/src/security/ssrf.ts              (NEU, ~80 Zeilen)
packages/core/src/security/ssrf.test.ts         (Teil von security.test.ts; siehe T1)
packages/core/src/security/secrets.ts           (NEU, ~70 Zeilen)
packages/core/src/security/secrets.test.ts      (Teil von security.test.ts; siehe T1)
packages/core/src/security/security.test.ts     (NEU, ≥ 10 Tests, strict TDD)
packages/core/src/actions/webhook.ts            (M — assertPublicUrl-Aufruf, maxRedirections)
packages/core/src/actions/shell.ts              (M — cwd-Anker-Warning)
packages/core/src/server.ts                     (M — timingSafeEqual, stripJobSecrets, return reply, CORS, default-token)
packages/core/src/cli.ts                        (M — sanitizeExecArgv, Version "0.4.0" → "0.5.0")
packages/core/src/schemas.ts                    (M — webhookConfigSchema.allowPrivateNetworks, cronExpression.max(256))
packages/core/src/types.ts                      (M — WebhookConfig.allowPrivateNetworks, Code-Errors)
packages/core/package.json                      (M — fastify@^5.9, @fastify/cors@^11, @fastify/static@^8, version 0.5.0)
packages/web/src/pages/JobEditor.tsx           (M — Toggle "Allow private networks" im Webhook-Form)
packages/web/src/lib/api.ts                     (M — WebhookConfig-Type um allowPrivateNetworks)
packages/web/src/types.ts                       (M — gleiche Erweiterung)
package.json                                    (M — version 0.5.0)
package-lock.json                               (M — durch npm install)
openspec/config.yaml                            (M — project.version 0.5.0)
README.md                                       (M — Security-Abschnitt + Migrations-Hinweis)
```

**Unverändert:** `packages/core/src/scheduler/`, `packages/core/src/store/`, `packages/core/src/daemon.ts`, `packages/core/src/config.ts`, `packages/core/src/logger.ts`, `packages/core/src/stats/`, `bin/`, `scripts/`, `tsconfig*.json`, `docs/`. Storage-Format (`jobs.json`, `runs.json`) bleibt byte-identisch.

---

## 6. Risiken & Gegenmaßnahmen

| #   | Risiko | Wahrsch. | Impact | Gegenmaßnahme |
|-----|--------|---------:|-------:|---------------|
| R1  | Bestehende Jobs mit Webhooks auf `127.0.0.1` oder `10.x.x.x` brechen nach Upgrade. | Hoch (sicher) | Mittel | (a) Bei Job-Load (`store/jobs.ts → get/list`) **einmalig** loggen, wenn `WebhookConfig.url` privat ist UND `allowPrivateNetworks !== true` — gibt dem Nutzer eine Liste der betroffenen Jobs. (b) README-Migrations-Abschnitt. (c) `allowPrivateNetworks: true` ist ein Toggle in der UI; Default `false`. |
| R2  | SSRF-Guard via `dns.lookup` deckt nur den Submit-Time-Resolve ab, nicht den Request-Time-Resolve (TOCTOU). | Mittel | Niedrig | Dokumentiert in `design.md §1`. Mitigation: bei hochsensiblen Deploys (`host !== 127.0.0.1`) zusätzlich `dns.lookup` mit `verbatim: true` und IP-Pinning für die Laufzeit des Requests. **v0.6+**. Für v0.5.0 akzeptieren wir die Lücke, weil der Standard-Anwendungsfall (lokal, kein Token) keine Request-Time-Rebinding-Bedrohung hat. |
| R3  | `crypto.timingSafeEqual` mit Buffer-Vergleich wirft bei Längen-Mismatch eine Exception. | Niedrig | Niedrig | Code-Snippet im `design.md §2` macht `if (a.length !== b.length) return reply.code(401)` **vor** dem Vergleich. Test S11 deckt das ab. |
| R4  | `fastify` 4 → 5 bringt Breaking Changes, die wir nicht in unserer schmalen Usage-Surface haben. | Niedrig | Mittel | (a) Vor T7 die offiziellen Migrations-Notes lesen (https://fastify.dev/docs/v5.0/migration/). (b) Smoke-Skript läuft auf v5.9, alle Endpoints antworten. (c) Bei unerwarteter Inkompatibilität: v0.5.0-RC1 vor Release. (d) Lockfile-Diff muss **nur** Fastify-Tree betreffen; sonst Rejection. |
| R5  | CORS `origin: false` bricht die Vite-Dev-Proxy-Konfiguration? | Niedrig | Niedrig | Vite-Dev-Proxy ist **server-side** (`vite.config.ts` proxy von `:5173` → `:3737`), nicht browser-CORS. Bei `npm run dev` ruft der Browser `localhost:5173` auf, Vite proxied intern — keine CORS-Header involviert. Smoke bestätigt. |
| R6  | `redactWebhookAction` muss auch custom-Header-Namen wie `X-Api-Token` maskieren. | Mittel | Mittel | Set ist case-insensitive, enthält die in der Sektion §4.1 des Briefings genannten Namen. Wenn Nutzer unbekannte Secret-Header haben: `redactHeaders` reicht einen `additionalSensitiveKeys`-Parameter. **Default-Set** reicht für v0.5.0. |
| R7  | `assertPublicUrl` blockiert Webhooks auf `https://internal.company.local/`. | Mittel | Mittel | Override-Pfad `allowPrivateNetworks: true` löst das; im UI mit Warnhinweis. Bei vielen internen Hosts ist das Configuration-Bulk (v0.6+ CIDR-Allowlist als v0.5.1-Patch möglich). |
| R8  | Stripping der `Authorization`-Header in `GET /api/jobs` macht die UI-Anzeige leer. | Hoch (sicher) | Niedrig | Per Design: UI zeigt den Header-Namen, aber maskiert den Wert. Optional Toggle „Show values" mit Re-Auth. v0.5.0 zeigt **immer** maskiert. |
| R9  | Shell-Warning bei privileged-user-Home nervt („Always warns because I'm root"). | Mittel | Niedrig | Warning ist einmal pro Job-Load, nicht pro Run. Konfigurierbar via `cronExpression`-Tabelle mit `silenceShellWarning: true` (Out-of-scope; dokumentiert als v0.6+). |
| R10 | `sanitizeExecArgv` killt `--enable-source-maps`, das der Dev-Flow braucht. | Niedrig | Niedrig | `--enable-source-maps` ist in der Allowlist. Test: `sanitizeExecArgv(['--inspect=0.0.0.0:9229', '--enable-source-maps'])` → nur `--enable-source-maps`. |
| R11 | `return reply` nach 401 ist bereits implizit; v0.4.0-Style ignoriert es. | Niedrig | Niedrig | S11 + Reviewer-Blick. Fix in T11 trivial. |
| R12 | Cron-Expression-Maxe 256 ist zu klein für 6-Feld-Cron mit Kommentaren. | Niedrig | Niedrig | croner-Cron ist 5- oder 6-Feld; 256 deckt `@every 1h30m` mit Prefix locker ab. |

---

## 7. Rollback

Weich-Rollback (ein `git revert`):

1. `fastify@^5.9` zurück auf `^4.28`. Lockfile-Reset (`npm install`).
2. `packages/core/src/security/*` löschen — werden durch Soft-Rollback ungenutzt.
3. `assertPublicUrl`-Aufruf in `actions/webhook.ts` entfernen.
4. `crypto.timingSafeEqual` → `!==` zurück (klar: nur Dev-Hilfe, in Produktion nie).
5. CORS `origin: false` → `(origin, cb) => cb(null, true)` (alter allow-all).
6. `stripJobSecrets`-Implementierung → No-op (`return job`).
7. Versionsstrings zurück auf `0.4.0`.

Hart-Rollback (zusätzlich, wenn Storage-Format betroffen wäre): nicht nötig — Format bleibt byte-identisch.

**Breaking Change für Bestandsjobs:** das ist explizit gewollt (semver-major). Wenn ein Nutzer nach dem Upgrade Jobs findet, die nicht mehr laufen, ist `allowPrivateNetworks: true` die Migration (siehe `design.md §8`).

---

## 8. Entscheidungen ohne explizite Nutzernachfrage (bitte bestätigen oder überschreiben)

Der Parent-Briefing war sehr detailliert, aber an mehreren Stellen nicht eindeutig. Diese Punkte hat der Proposer entschieden — sie stehen alle zur Disposition:

| #   | Entscheidung | Begründung | Override-Pfad |
|-----|-------------|-----------|---------------|
| D1  | `assertPublicUrl` resolvet per `dns.lookup(url.hostname, { all: true })` (A + AAAA), iteriert über die Ergebnisse und lehnt ab, wenn **eine** privat ist. | TOCTOU-Anfälligkeit akzeptiert (R2); der häufigste Anwendungsfall (lokal, kein Token) hat keine Rebinding-Bedrohung. v0.6+ kann auf IP-Pinning eskalieren. | `sdd-apply` darf auf `dns.promises.lookup` mit `verbatim: true` und `dns.setServers([...])` für Locked-Down-Mode umstellen. |
| D2  | `PrivateNetworkError` ist eine eigene Klasse mit `code: "ERR_PRIVATE_NETWORK"` und `target: string`. | Strukturierte Fehler-API für Logging und UI („URL `http://10.x` rejected (private network) — enable 'Allow private networks' to override"). | Plain `Error` mit Message ist akzeptabel, aber dann verliert S12 ihre Struktur. |
| D3  | `redactHeaders` setzt die Default-Secret-Keys auf `{authorization, x-api-key, cookie, x-auth-token, x-csrf-token, x-access-token}` (case-insensitive). | Briefing-Aufzählung + Standard-Secrets-Liste. Custom-Keys via zusätzlichen Parameter. | Liste beliebig erweiterbar; `redactHeaders(h, ["x-my-secret"])` ist möglich. |
| D4  | Sensitive Header `set-cookie` wird ebenfalls maskiert. | Briefing nennt `cookie`, aber `set-cookie` ist ein verwandtes Risiko. Konsistent. | `false` setzen, falls jemand das absichtlich als „nicht-secret" loggen will. |
| D5  | `redactBody` für JSON: nur **top-level** String-Werte werden maskiert, deren Schlüssel im Sensitive-Set ist. Verschachtelte Objekte werden rekursiv gescannt, aber **alle** String-Werte dort werden ersetzt — nicht selektiv. | Einfacher, sicherer Default. Wenn ein verschachteltes Objekt einen Secret-Key hat, ist der ganze Subtree als heikel zu betrachten. | Top-level-only-Modus ist eine sinnvolle Alternative; D5 ist die konservative Wahl. |
| D6  | `redactBody` für Form-URL-Encoded: parst mit `URLSearchParams`, prüft jeden Key, ersetzt Wert mit `***`. | Standard, robust, eine Zeile. | Raw-Regex-Ersatz (`/key=([^&]*)/gi`) ist die Alternative, aber fehleranfälliger. |
| D7  | `allowPrivateNetworks` ist ein **per-Action**-Toggle, nicht global. | Eine globale Whitelist ist einfacher zu konfigurieren, aber ein per-Job-Toggle ist die ehrlichste Aussage „dieser eine Job braucht das". Globale Allowlist (`--cors-origins`-Analogie) ist v0.6+. | Globaler Toggle via CLI-Flag denkbar. |
| D8  | CORS auf `origin: false` (keine CORS-Header). | Same-origin-only ist das Maximum an Schutz. Cross-Origin ist v0.6+ als explizite `--cors-origins <csv>` geplant. | `--cors-origins` als v0.5.0.1-Patch. |
| D9  | `fastify@^5.9` (Minor-Range, kein Pin auf 5.9.0). | Lockfile wird durch `npm install` festgezurrt. Minor-Updates innerhalb 5.x sind kompatibel. | Pin auf exakte Version, falls Striktness gewünscht. |
| D10 | `buildServer` wirft statt `app.listen` mit Error-Callback, wenn Host nicht loopback und kein Token. | Klares Signal, sauberes Test-Verhalten. CLI fängt den Wurf ab. | Exit-Code 2 statt Wurf. |
| D11 | `cronExpression.max(256)` ohne Sonderbehandlung für Kommentare. | croner-Cron-Expressions passen locker in 256 Zeichen. | 1024 oder unlimited, falls Befürchtung besteht. |
| D12 | Strict-TDD: Tests werden vor Implementierung geschrieben und der Test-Run muss **zuerst rot** sein. `tasks.md → T1` listet das explizit. | `strict_tdd: true` und `test-coverage-gap-disclosed` in `config.yaml`. | Falls Reviewer die Tests später nachreicht: `sdd-verify` muss das ablehnen. |
| D13 | `redactShellAction` maskiert `command` **nicht** — die Shell-Action ist per Design explizit (User hat sie selbst konfiguriert). Aber `GET /api/jobs` zeigt `command` so wie es ist (User will es sehen), während Headers/Body der Webhook-Action maskiert werden. | Konsistent: Shell-Command ist „das ist mein Code", Webhook-Headers sind „das ist meine Infrastruktur-Geheimnisse". Asymmetrie ist Absicht. | Falls durchgehend Redaction gewünscht: `redactShellAction` maskiert `command` ebenfalls (z. B. erste 8 Zeichen + `***`). v0.6+. |
| D14 | `sanitizeExecArgv` ist eine **Allowlist** + **Denylist** (Allowlist-first). Erlaubt: `--import`, `--import=…`, `--require`, `--require=…`, `--experimental-*`, `--no-warnings`, `--no-deprecation`, `--enable-source-maps`, `--title`, `--heap-snapshot-signal`, `--use-strict`. Verboten: `--inspect*`, `--debug*`, `--heap-prof*`, `--cpu-prof*`. | Allowlist-first ist konservativ. Liste in `design.md §5`. | Denylist-only ist möglich, aber Allowlist-first ist die bessere Default-Sicherheits-Posture. |

Siehe `design.md` für die technische Begründung jeder Entscheidung und `tasks.md` für die TDD-geordnete Schritt-für-Schritt-Liste.

---

## 9. Migration: v0.4.0 → v0.5.0

| Situation | Migrations-Pfad |
|---|---|
| Job mit Webhook auf `https://hooks.example.com/abc` (öffentlich) | **Keine Aktion.** Funktioniert unverändert. |
| Job mit Webhook auf `http://127.0.0.1:3737/api/...` (Chaining auf eigenes API) | In der UI im JobEditor: „Allow private networks" aktivieren. Einmalig. |
| Job mit Webhook auf `http://169.254.169.254/latest/meta-data/` (AWS-IMDS) | Toggle aktivieren **und** in AWS die IMDSv2-Pflicht aktivieren (außerhalb cronboard). |
| Job mit Shell-Command, der private Files liest | **Keine Aktion**, solange `allowedPaths` leer. Wenn `allowedPaths` gesetzt: prüfen, ob der absolute `cwd` noch matched. |
| Server lief mit `--host 0.0.0.0 --token XYZ` | **Keine Aktion.** Token-Check greift. |
| Server lief mit `--host 0.0.0.0` **ohne** Token | Server weigert sich zu binden (`buildServer` wirft). CLI fängt das mit Exit-Code 2 ab. |
| Server-UI wird über Reverse-Proxy angesprochen (Nginx, Caddy) | **Keine Aktion** — der Proxy macht Same-Origin-Header. Browser sieht `Origin: https://cron.example.com`, das ist fine. |
| Server-UI wird von einem anderen Origin aus aufgerufen | CORS blockt. Workaround: Reverse-Proxy so konfigurieren, dass Cronboard unter derselben Origin erreichbar ist (empfohlen) oder `--cors-origins <csv>` in v0.6+ abwarten. |

Der `cli.ts start`-Befehl erkennt beim **ersten Lauf nach Upgrade** Jobs mit privaten Webhook-URLs und loggt eine Liste (`logger.warn({ jobs: [...] }, "private webhook targets detected — enable allowPrivateNetworks to keep them running")`). Das ist **keine Migration** im Storage-Sinne, nur eine Sichtbarmachung.

---

## 10. Anhang A — Audit-Befunde-Index (zur Referenz)

Die folgenden Befunde sind paraphrasiert aus dem `security-reviewer`-Sweep vom 2026-06-30. Sie sind **nicht** wörtlich zitiert; die Original-Befunde liegen im Parent-Chat-Kontext.

| ID | Severity | Bereich | Status in v0.5.0 |
|----|----------|---------|------------------|
| H1 | High | SSRF in `actions/webhook.ts` | **Fixed** via `assertPublicUrl` + `maxRedirections: 0` |
| H2 | High | Timing-Oracle in `server.ts` | **Fixed** via `crypto.timingSafeEqual` |
| H3 | High | `fastify` 4.x transitive CVEs | **Fixed** via Bump auf 5.9.x |
| H4 | High | `execArgv`-Pivot in `cli.ts` | **Fixed** via `sanitizeExecArgv` |
| M1 | Medium | CORS allow-all + credentials | **Fixed** via `origin: false` |
| M2 | Medium | `stripJobSecrets` no-op | **Fixed** via Implementierung in `security/secrets.ts` |
| M3 | Medium | Shell `allowedPaths` schwach | **Hardened** (cwd-Anker-Warning) |
| M4 | Medium | Server bindet ohne Token | **Fixed** via `buildServer`-Pre-Check |
| M5 | Medium | `return reply` nach 401 fehlt | **Fixed** |
| L1 | Low | Webhook-Response-Body verbatim | **Accepted** (Debug-Use-Case) |
| L2 | Low | `runs.json` plaintext at rest | **Out** (v0.6+) |
| L3 | Low | PID-File-Symlink-TOCTOU | **Accepted** (low-impact) |
| L4 | Low | `cronExpression` ohne max | **Fixed** (`.max(256)`) |
| I1 | Info | Frontend XSS clean | **N/A** |
| I2 | Info | Frontend token storage clean | **N/A** |

**Frontend-Surface** (L1, I1, I2) bleibt unverändert; keine Frontend-Änderungen außer dem neuen Toggle im JobEditor.

---

## 11. Glossar

- **SSRF (Server-Side Request Forgery):** ein Server schickt auf Veranlassung eines (semi-)böswilligen Nutzers Anfragen an interne Ressourcen.
- **Private Network:** RFC1918 (10/8, 172.16/12, 192.168/16), Loopback (127/8, ::1), Link-Local (169.254/16, fe80::/10), IPv4-mapped IPv6 von diesen, Multicast, Broadcast, `0.0.0.0`, `localhost`, `.local`, `.internal`.
- **Timing-Oracle:** ein Seitenkanal, der aus der gemessenen Zeitdauer einer Vergleichsoperation auf den verglichenen Wert schließen lässt.
- **DNS-Rebinding:** ein Angriff, bei dem der DNS-Resolve eines Hostnamens zwischen Submit-Time und Request-Time wechselt.
- **`maxRedirections: 0`:** undici-Option, die HTTP-Redirects nicht folgt.
- **`crypto.timingSafeEqual`:** Node-API für einen Vergleich mit konstanter Laufzeit, unabhängig von der Position des ersten ungleichen Bytes.
- **`allowPrivateNetworks`:** per-Action-Toggle, der den SSRF-Guard für einen einzelnen Job umgeht (Logger-Warning).
- **`execArgv`:** Liste der Node-CLI-Argumente, die das aktuelle Skript starten — z. B. `--inspect=0.0.0.0:9229` aus dem Dev-Flow.
- **`stripJobSecrets`:** Funktion, die sensitive Felder (Authorization-Header, Body-Tokens, …) aus einem Job vor der Client-Übertragung entfernt.