# Design: v0.5.0-security

> Begleitend zu `proposal.md` und `tasks.md`. Diese Datei ist die technische Quelle der Wahrheit für die nicht-trivialen Entscheidungen in diesem Change: SSRF-Algorithmus mit Begründung, Timing-Safe-Auth-Snippet, Redaktions-Algorithmus (Header/JSON/Form), `allowPrivateNetworks`-UX, execArgv-Denylist, fastify-4→5-Migration, v0.4→v0.5-Migrations-Notizen. Behandle sie als `sdd-verify`-Checkliste.

---

## 1. SSRF-Algorithmus

### 1.1 Ablauf

`assertPublicUrl(url, { allowPrivateNetworks })` führt **vier** sequentielle Prüfungen durch:

```
parse(URL) ─┬─ ParseError ───────────► throw TypeError
            │
            ▼
scheme ──── nicht in {http, https} ──► throw PrivateNetworkError("scheme not allowed")
            │
            ▼
hostname  ─ "localhost" / ".local" / ".internal" / IP-Literal privat
            │                                  ─► throw PrivateNetworkError("hostname denied")
            ▼
dns.lookup(hostname, { all: true })
            │
            ▼
for each addr in result:
    isPrivateAddress(addr.address)?
        ja + override=true ─► Logger-Warning, weiter
        ja + override=false ► throw PrivateNetworkError("resolved to private <ip>")
        nein ─► weiter
            │
            ▼
return (resolve OK, URL ist public)
```

### 1.2 Begründung „Submit-Time-Resolve" statt „Request-Time-Pinning"

Der Algorithmus resolvet den Hostnamen **einmal vor dem Request** und prüft die Adressen gegen die Denylist. Das schließt **nicht** DNS-Rebinding-Angriffe aus: ein Angreifer, der einen DNS-Server kontrolliert, kann zwischen Submit-Time-Resolve und undici's internem Resolve wechseln und so den Check umgehen.

**Warum akzeptieren wir das für v0.5.0?**

1. **Bedrohungsmodell**: cronboard ist **lokal**, bindet per Default `127.0.0.1` und benutzt kein Token. Der Job-Editor ist nur auf Localhost erreichbar; ein Angreifer, der den DNS-Server des Hosts kontrolliert, hat bereits gewonnen (kein Defense-in-Depth-Gap mehr).
2. **Standard-Anwendungsfall**: ein Cronboard-User, der `https://hooks.example.com/abc` als Webhook setzt, hat einen festen DNS-Eintrag und kein Rebinding.
3. **Komplexität**: Request-Time-Pinning erfordert `dns.setServers([...])` (vertrauenswürdigen Resolver erzwingen) und Auflösung mit Cache (`dns.promises.lookup` vs. `dns.promises.resolve4`/`resolve6` für explizites Pinning). Das ist eine API-Erweiterung, die v0.5.0 unnötig kompliziert macht.

**v0.6+ Hardening-Option**: `assertPublicUrl` um einen `pinAddress?: boolean`-Parameter erweitern, der den resolved Addresseintrag in den `RequestInit` (undici unterstützt `lookup`-Hook) als Pin zurückgibt. Out-of-scope für v0.5.0.

### 1.3 `isPrivateAddress(ip)` — vollständige Tabelle

| Range | Typ | Erfasst |
|---|---|---|
| `127.0.0.0/8` | IPv4 Loopback | ja |
| `10.0.0.0/8` | IPv4 Private | ja |
| `172.16.0.0/12` | IPv4 Private | ja (172.16.0.0 – 172.31.255.255) |
| `192.168.0.0/16` | IPv4 Private | ja |
| `169.254.0.0/16` | IPv4 Link-Local | ja (AWS-Metadaten!) |
| `0.0.0.0` | IPv4 unspecified | ja |
| `224.0.0.0/4` | IPv4 Multicast | ja |
| `::1/128` | IPv6 Loopback | ja |
| `fe80::/10` | IPv6 Link-Local | ja |
| `fc00::/7` | IPv6 ULA (Unique-Local) | ja |
| `::ffff:0:0/96` | IPv4-mapped IPv6 | ja, dann rekursiv IPv4-Teil prüfen |
| `ff00::/8` | IPv6 Multicast | ja |

**Edge-Cases**:
- `172.32.0.0` und höher → **nicht** privat (außerhalb 172.16/12). Häufige Verwechslung.
- `172.15.255.255` → nicht privat (knapp drunter).
- `100.64.0.0/10` (CGNAT) → **nicht** erfasst in v0.5.0. Bewusste Auslassung — CGNAT-Range ist Carrier-Grade-NAT, nicht klassisch „privat"; manche Cloud-Provider nutzen sie als öffentliche IPs. v0.6+ kann das hinzufügen.
- `198.18.0.0/15` (Benchmarking) → **nicht** erfasst. Standard-RFC, irrelevant für SSRF.

### 1.4 Scheme-Check vor DNS

Der Scheme-Check kommt **vor** dem DNS-Lookup. Das ist wichtig, weil:

1. `file://`, `gopher://`, `dict://`, `ldap://`, `ftp://` würden sonst eventuell DNS-mäßig validieren und einen `dns.lookup` triggern — vergeudete Aufrufe und ungewollte Resolver-Effekte.
2. Die Fehlermeldung ist klarer: `scheme "file:" not allowed` statt `hostname "" is private` (was bei einem leeren `URL("file:///etc/passwd").hostname` passieren würde).

### 1.5 `maxRedirections: 0` als zweite Verteidigung

undici folgt Redirects **standardmäßig bis 5-mal** (siehe `https://undici.nodejs.org/#/?id=parameter-redactmaxredirections`). Ein SSRF-Schutz, der nur die initiale URL prüft, ist ausgehebelt, wenn der erste Hop `302` auf `http://10.0.0.1/` antwortet.

**v0.5.0 disabliert Redirects komplett** (`maxRedirections: 0`). Das ist eine **Breaking Change** für jeden, der einen Webhook-Provider nutzt, der auf eine andere URL weiterleitet. Migrations-Hinweis: explizit die Final-URL im Webhook setzen, oder in v0.6+ eine Allowlist „Redirect-Hops erlaubt zu: host1, host2, …" einführen.

### 1.6 `allowPrivateNetworks: true` UX

**Wo wird der Toggle exponiert?**

Im `JobEditor` (Webhook-Tab) als Checkbox direkt unter dem URL-Feld:

```tsx
<label className="label cursor-pointer">
  <span className="label-text">Allow private networks</span>
  <input type="checkbox" className="checkbox checkbox-sm" {...register("allowPrivateNetworks")} />
</label>
{allowPrivateNetworks && (
  <p className="text-xs text-warning">
    ⚠ SSRF protection disabled for this webhook. Use only for trusted internal targets.
  </p>
)}
```

**Log-Level**: `console.warn` mit Job-ID und URL. Reicht für v0.5.0; strukturierte Logger-Ausgabe ist v0.6+, wenn der ActionExecutor einen Logger bekommt.

**Empfohlene Copy** (UI):
> „Allow private networks. **Warning**: SSRF protection is disabled. Only enable for trusted internal targets (e.g. chaining back to your own API on `127.0.0.1`)."

### 1.7 Sonderfall: Hostname ist bereits eine IP

`URL("http://127.0.0.1/").hostname === "127.0.0.1"` — also greift der Pre-Check `isPrivateAddress` direkt ohne DNS-Lookup. Spart einen Resolver-Aufruf und ist klarer im Error-Trace.

### 1.8 Sonderfall: leerer Hostname

`URL("file:///etc/passwd").hostname === ""` — wird durch den Scheme-Check abgefangen, bevor wir zum Hostname-Pre-Check kommen.

### 1.9 Sonderfall: IDN-Hostnames

`URL("http://пример.рф/").hostname` ist nach `URL`-Parse bereits in Punycode (`xn--e1afmkfd.xn--p1ai`). `dns.lookup` nimmt Punycode nativ. Kein Sonderfall-Code nötig.

### 1.10 Test-Strategie für DNS-Mocking

`assertPublicUrl` ruft intern ein Modul-State-Pattern auf:

```ts
// ssrf.ts (intern)
type Resolver = (hostname: string, options: { all: true }) => Promise<Array<{ address: string; family: 4 | 6 }>>;
let _resolver: Resolver = (h, opts) => dns.promises.lookup(h, opts);
export function _setResolverForTests(fn: Resolver | null) { _resolver = fn ?? ((h, opts) => dns.promises.lookup(h, opts)); }
```

Tests:
```ts
import { _setResolverForTests } from "./ssrf.js";

beforeEach(() => _setResolverForTests(async (h) => [{ address: "10.0.0.1", family: 4 }]));
afterEach(() => _setResolverForTests(null));
```

Das ist **kein** Public-API (Underscore-Prefix) und nur für Tests. Eine zukünftige Refaktorierung mit Dependency-Injection ist möglich, aber YAGNI für v0.5.0.

---

## 2. Timing-Safe Auth — vollständiges Snippet

### 2.1 Vorher / Nachher

```ts
// packages/core/src/server.ts

import { timingSafeEqual } from "node:crypto";

// onRequest-Hook:
app.addHook("onRequest", async (req, reply) => {
  const url = req.routeOptions?.url ?? req.url;
  if (!url.startsWith("/api/")) return;
  if (!deps.token) return; // kein Token gesetzt → keine Auth nötig (Default-Modus)

  const auth = req.headers.authorization ?? "";
  const expected = `Bearer ${deps.token}`;

  // Längen-Normalisierung: timingSafeEqual wirft, wenn Längen ungleich sind.
  // Wir wollen einen sauberen 401, nicht einen 500.
  if (auth.length !== expected.length) {
    return reply.code(401).send({ error: "unauthorized" });
  }

  const a = Buffer.from(auth, "utf8");
  const b = Buffer.from(expected, "utf8");

  // timingSafeEqual ist in Node's "node:crypto" verfügbar und O(n) in der Länge.
  // Laufzeitunterschiede hängen nur von der Länge ab, NICHT von der Position
  // des ersten ungleichen Bytes.
  if (!timingSafeEqual(a, b)) {
    return reply.code(401).send({ error: "unauthorized" });
  }
});
```

### 2.2 Warum Längen-Normalisierung nötig ist

`crypto.timingSafeEqual` dokumentiert: „If `a` and `b` have different byte lengths, an error will be thrown." Wir wollen:

1. **Kein 500** auf einen Mismatch (UX-Problem: legitime Clients mit kaputten Tokens sehen Server-Fehler).
2. **Konstante Laufzeit** für den Vergleich selbst (das macht `timingSafeEqual`).
3. **Sofortiger Abbruch** bei offensichtlichem Längen-Mismatch — die Länge ist per Design eine bekannte Konstante (`Bearer ` ist 7 Zeichen + Token-Länge).

Die `if (auth.length !== expected.length)` ist **deterministisch** (kein zusätzliches Timing-Oracle), weil sie nicht vom Inhalt abhängt. Sie ist eine reine „ist die Form korrekt"-Prüfung, die ohnehin nie unterschiedlich lang sein kann, wenn das Token gleich lang ist und der Header korrekt aufgebaut ist.

### 2.3 Edge-Cases

- `req.headers.authorization === undefined` → `auth = ""`. `""` vs. `"Bearer XYZ"` → Längen-Mismatch → 401. Korrekt.
- `req.headers.authorization === "Bearer "` (kein Token) → 401.
- `req.headers.authorization === "Bearer X"` (Token kürzer) → Längen-Mismatch → 401.
- `req.headers.authorization === "Bearer XXXX"` (Token anders, gleiche Länge) → `timingSafeEqual` → false → 401, **konstante Laufzeit**.

### 2.4 Performance

`timingSafeEqual` ist in V8/Node eine intrinsische SIMD-Operation auf den Buffern. Für typische Token-Längen (16–64 Zeichen) ist der Vergleich < 100 ns. Vernachlässigbar gegenüber Fastify-Routing-Overhead.

---

## 3. Redaktions-Algorithmus

### 3.1 `redactHeaders` — Header-Set

```ts
const DEFAULT_SENSITIVE_KEYS = new Set([
  "authorization", "x-api-key", "x-auth-token", "x-csrf-token",
  "x-access-token", "cookie", "set-cookie", "api-key", "apikey",
]);

export function redactHeaders(
  h: Record<string, string> | undefined,
  extraKeys: string[] = []
): Record<string, string> {
  if (!h) return {};
  const sensitive = new Set(DEFAULT_SENSITIVE_KEYS);
  for (const k of extraKeys) sensitive.add(k.toLowerCase());
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(h)) {
    out[key] = sensitive.has(key.toLowerCase()) ? "***" : value;
  }
  return out;
}
```

**Warum case-insensitive?** HTTP-Header-Namen sind per RFC 7230 case-insensitive. `Authorization` und `authorization` sind dasselbe. Wir normalisieren auf Lowercase vor dem Vergleich.

**Custom-Keys**: `redactHeaders(h, ["x-my-secret", "x-team-token"])` erweitert das Set für diesen einen Aufruf. Wenn der User konsistent Custom-Keys hat, könnte er eine Helper-Funktion mit erweitertem Set bauen — out-of-scope für v0.5.0.

### 3.2 `redactBody` — JSON

```ts
function redactJsonStringValue(key: string, sensitive: Set<string>): boolean {
  return sensitive.has(key.toLowerCase());
}

export function redactBody(
  body: string | undefined,
  contentType: string | undefined,
  extraKeys: string[] = []
): string | undefined {
  if (body === undefined) return undefined;
  if (!contentType) return body;

  const sensitive = new Set(DEFAULT_SENSITIVE_KEYS);
  for (const k of extraKeys) sensitive.add(k.toLowerCase());

  if (contentType.toLowerCase().startsWith("application/json")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      // Parse-Fehler: gib Body unverändert zurück. Logging ist Sache des Callers.
      return body;
    }
    const redacted = redactJsonValue(parsed, sensitive);
    return JSON.stringify(redacted);
  }

  if (contentType.toLowerCase().startsWith("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams(body);
    for (const key of Array.from(params.keys())) {
      if (sensitive.has(key.toLowerCase())) {
        params.set(key, "***");
      }
    }
    return params.toString();
  }

  return body;
}

function redactJsonValue(node: unknown, sensitive: Set<string>): unknown {
  if (Array.isArray(node)) {
    return node.map((item) => redactJsonValue(item, sensitive));
  }
  if (node && typeof node === "object") {
    const obj = node as Record<string, unknown>;
    const hasSensitiveKey = Object.keys(obj).some((k) => sensitive.has(k.toLowerCase()));
    if (hasSensitiveKey) {
      // Konservativ: maskiere ALLE String-Werte im Subtree.
      // D5: ein Secret-Key macht den ganzen Subtree heikel.
      const masked: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(obj)) {
        masked[k] = typeof v === "string" ? "***" : v; // nested objects/arrays bleiben Struktur
      }
      return masked;
    }
    // Kein sensitiver Key: rekursiv durchsuchen.
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      result[k] = redactJsonValue(v, sensitive);
    }
    return result;
  }
  return node;
}
```

**Beispiel**:
- Input: `'{"a":"sk-abc","b":2,"nested":{"x":"secret","y":1},"safe":"public"}'` mit Content-Type `application/json`.
- Sensitive-Keys: `{authorization, x-api-key, …}`.
- „a" ist KEIN sensitiver Key → rekursiv, String `"sk-abc"` bleibt.
- „nested" hat keinen sensitiven Key → rekursiv, `{x: "secret", y: 1}` bleibt.
- „safe" ist nicht sensitiv → bleibt.
- Output: `'{"a":"sk-abc","b":2,"nested":{"x":"secret","y":1},"safe":"public"}'` (unverändert, weil kein sensitiver Top-Level-Key).

Wenn `headers: { "Authorization": "Bearer xyz", "body": '{"token": "sk-real"}' }`:
- Body JSON ist `'{"token": "sk-real"}'` mit Content-Type `application/json`.
- „token" ist nicht im Default-Set → bleibt **unverändert** in v0.5.0.
- **Caveat**: das ist eine Designentscheidung. Wir können den Secret-Set erweitern, aber das Default-Set ist bewusst klein gehalten, um False-Positives zu vermeiden. Wer `token` als sensitive Flag braucht, gibt `redactBody(body, ct, ["token"])` mit.

**Konservativer Modus** (D5): wenn ein sensitiver Key direkt im Subtree vorkommt, wird der ganze Subtree maskiert. Beispiel:
- Input: `'{"meta":{"authorization":"Bearer xyz","id":42}}'`.
- „meta" hat sensitiven Key „authorization" → ganzes Subtree maskiert: `'{"meta":{"authorization":"***","id":42}}'`.
- Beachte: `id: 42` bleibt sichtbar (kein String). Nur String-Werte werden durch `***` ersetzt; die Struktur bleibt.

### 3.3 `redactBody` — Form-URL-Encoded

```ts
const params = new URLSearchParams(body);
for (const key of Array.from(params.keys())) {
  if (sensitive.has(key.toLowerCase())) {
    params.set(key, "***");
  }
}
return params.toString();
```

**Beispiel**:
- Input: `"token=sk-real&name=ben"` mit Content-Type `application/x-www-form-urlencoded`.
- „token" ist im Sensitive-Set → maskiert.
- Output: `"token=***&name=ben"`.

### 3.4 Unbekannte Content-Types

`text/plain`, `application/octet-stream`, `application/xml`, … → Body **unverändert** zurück. Wer XML mit Secrets schickt, ist selbst schuld. Akzeptiert (siehe Beobachtungen §3 in `tasks.md`).

### 3.5 `redactWebhookAction` — Vertrag

```ts
export function redactWebhookAction(a: WebhookConfig): WebhookConfig {
  return {
    ...a,
    headers: redactHeaders(a.headers),
    body: redactBody(a.body, /* contentType */ deriveContentType(a)),
  };
}
```

**`deriveContentType`**: aus `a.headers["Content-Type"]` oder `a.headers["content-type"]`. Wenn nicht vorhanden, `undefined` (Body bleibt unverändert).

### 3.6 `redactShellAction` — Vertrag (D13: keine Command-Maskierung)

```ts
export function redactShellAction(a: ShellConfig): ShellConfig {
  // Bewusst: Shell-Command wird NICHT maskiert, weil der User die Action
  // selbst konfiguriert hat. Asymmetrie zu Webhook-Action ist gewollt.
  return { ...a };
}
```

**Begründung**: der User hat `command: "rm -rf /"` selbst eingegeben und will es in der UI sehen, um den Job zu verstehen. Headers/Body sind „Infrastruktur-Geheimnisse", die der User typischerweise **kopiert** hat und nicht im Klartext sehen muss.

### 3.7 Idempotenz

Alle `redact*`-Funktionen sind **idempotent**: `redactHeaders(redactHeaders(h)) === redactHeaders(h)`. Der String `"***"` ist nicht im Sensitive-Set, also bleibt er nach dem zweiten Aufruf `"***"`.

---

## 4. `allowPrivateNetworks` UX

### 4.1 Toggle-Position

Im `JobEditor`, Tab „Webhook", direkt unter dem URL-Feld:

```
┌──────────────────────────────────────────────────────────┐
│ URL *                                                     │
│ [https://hooks.example.com/abc                    ]       │
│                                                           │
│ ☐ Allow private networks                                  │
│   ⚠ SSRF protection disabled. Only enable for trusted    │
│   internal targets.                                       │
└──────────────────────────────────────────────────────────┘
```

### 4.2 Tooltip / Help-Text

- Default-Tooltip: „Wenn aktiviert, umgeht dieser Webhook den Schutz gegen private Netzwerke (z. B. `127.0.0.1`, AWS-Metadaten)."
- Active-Tooltip (wenn angekreuzt): „SSRF-Schutz ist deaktiviert. Verwende diese Option nur, wenn du dem Webhook-Target vertraust."

### 4.3 Log-Output bei aktiver Override

```
[2026-06-30T14:00:00.000Z] [cronboard] webhook job abc-123: allowPrivateNetworks=true — SSRF guard disabled for http://127.0.0.1:3737/api/jobs
```

Log-Level: `console.warn` (nicht `error` — bewusste Nutzeraktion).

### 4.4 Validierung beim Job-Update

Wenn der User `allowPrivateNetworks: true` setzt, **warnt** die UI (gelbes Banner), **blockiert** aber nicht. Der Submit bleibt möglich.

### 4.5 Persistenz

`allowPrivateNetworks` ist Teil von `WebhookConfig` und wird in `jobs.json` gespeichert. Bestandsjobs haben den Wert nicht → `z.boolean().default(false)` greift → SSRF-Guard aktiv. Explizites `true` muss der User setzen.

---

## 5. execArgv-Denylist — vollständige Liste mit Begründung

### 5.1 Allowlist (was bleibt)

| Pattern | Begründung |
|---|---|
| `--import`, `--import=…` | TypeScript-Loader (`tsx`), Node-Test-Loader. |
| `--require`, `--require=…` | Dev-Hooks, Instrumentierung. |
| `--experimental-*` | Alle experimentellen Flags; unkritisch. |
| `--no-warnings`, `--no-deprecation` | Output-Steuerung. |
| `--enable-source-maps` | Stack-Trace-Quality. |
| `--title=…` | Process-Title für Monitoring. |
| `--heap-snapshot-signal=…` | Diagnose. |
| `--use-strict` | Strenger Modus (nicht gefährlich). |
| `--` | Argument-Separator. |

### 5.2 Denylist (was rausfliegt)

| Pattern | Gefahr | Beispiel |
|---|---|---|
| `--inspect`, `--inspect=…` | Node-Inspector offen (RCE via DevTools-Protokoll). | `--inspect=0.0.0.0:9229` |
| `--inspect-brk`, `--inspect-brk=…` | Wie oben + Breakpoint auf erstem Statement. | `--inspect-brk=0.0.0.0:9229` |
| `--inspect-port=…` | Port-Konflikt, ggf. Collide mit `--inspect`. | `--inspect-port=9229` |
| `--inspect-publish-uid=…` | Inspector-UID-Konfiguration (HTTP-Server). | (Edge) |
| `--inspect-wait`, `--inspect-wait=…` | Wie `--inspect-brk`, aber ohne Breakpoint. | `--inspect-wait=0.0.0.0:9229` |
| `--debug`, `--debug=…` | Legacy V8-Debugger. | `--debug=5858` |
| `--debug-brk`, `--debug-brk=…` | Legacy V8-Debugger mit Breakpoint. | `--debug-brk=5858` |
| `--cpu-prof`, `--cpu-prof=…` | CPU-Profiling-Output schreiben (kann Disk voll schreiben). | `--cpu-prof` |
| `--cpu-prof-dir=…` | Pfad-Konfiguration für CPU-Prof. | `--cpu-prof-dir=/etc` |
| `--heap-prof`, `--heap-prof=…` | Heap-Profiling-Output. | `--heap-prof` |
| `--heap-prof-dir=…` | Pfad-Konfiguration für Heap-Prof. | `--heap-prof-dir=/etc` |
| `--prof`, `--prof=…` | Legacy-Profiler. | `--prof` |

### 5.3 Allowlist-First-Strategie

Die Allowlist wird **vor** der Denylist angewendet: wenn ein Flag weder erlaubt noch verboten ist, fällt es durch (wird gestrippt). Das ist konservativer als „nur Denylist", weil unbekannte neue Flags (z. B. `--inspect-*` in Node 24) per Default ebenfalls gestrippt werden.

```ts
export function sanitizeExecArgv(args: string[]): string[] {
  const ALLOWED = /^(?:-?-(?:import(?:=\S+)?|require(?:=\S+)?|experimental-[\w-]+|no-warnings|no-deprecation|enable-source-maps|title=\S*|heap-snapshot-signal=\S+|use-strict)\b|--)$/;
  const DENIED = /^(?:-?-(?:inspect(?:=\S+)?|inspect-brk(?:=\S+)?|inspect-port=\S+|inspect-publish-uid=\S+|inspect-wait(?:=\S+)?|debug(?:=\S+)?|debug-brk(?:=\S+)?|cpu-prof(?:=\S+)?|cpu-prof-dir=\S+|heap-prof(?:=\S+)?|heap-prof-dir=\S+|prof(?:=\S+)?))$/;
  return args.filter((arg) => !DENIED.test(arg) && ALLOWED.test(arg));
}
```

### 5.4 Test-Cases

| Input | Erwartung |
|---|---|
| `['--inspect=0.0.0.0:9229']` | `[]` |
| `['--inspect=0.0.0.0:9229', '--enable-source-maps']` | `['--enable-source-maps']` |
| `['--heap-prof']` | `[]` |
| `['--import=tsx', '--require=./hook.js', '--no-warnings']` | unverändert |
| `['--cpu-prof-dir=/etc']` | `[]` |
| `['--experimental-vm-modules', '--title=cronboard']` | unverändert |

---

## 6. CORS-Migration

### 6.1 Vorher

```ts
await app.register(cors, {
  origin: (origin, cb) => cb(null, true),
  credentials: true,
});
```

**Problem** (M1): jeder Origin wird akzeptiert; mit `credentials: true` ist die Kombination **explizit gefährlich**, weil ein bösartiger Origin-Cookie-Credentials mitsenden könnte (auch wenn unser UI das heute nicht tut).

### 6.2 Nachher

```ts
await app.register(cors, { origin: false });
```

**Effekt**: kein `Access-Control-Allow-Origin`-Header, kein `Access-Control-Allow-Credentials`. Same-Origin-Requests funktionieren (kein Preflight involviert). Cross-Origin-Requests werden vom Browser blockiert.

### 6.3 Vite-Dev-Proxy

Vite (`packages/web/vite.config.ts`) proxied im Dev-Mode von `:5173` auf `:3737` (cronboard-API). Das ist **server-side**, nicht browser-side — der Browser sieht nur `localhost:5173/api/...`, Vite proxied intern. CORS ist nicht involviert.

### 6.4 Reverse-Proxy-Szenarien

| Szenario | Verhalten |
|---|---|
| Cronboard hinter Nginx auf `cron.example.com` | Browser ruft `cron.example.com/api/...` auf, kein Cross-Origin. Funktioniert. |
| Cronboard hinter Nginx auf `internal:3737`, UI auf `cron.example.com` | **Cross-Origin**, CORS blockt. Workaround: Nginx so konfigurieren, dass Cronboard unter `cron.example.com` erreichbar ist (empfohlen), oder `v0.6+ --cors-origins <csv>` abwarten. |
| Direkter Zugriff auf `127.0.0.1:3737` von einer anderen Domain aus | **Cross-Origin**, blockiert. Korrekt. |

---

## 7. fastify 4 → 5 — was sich ändert

### 7.1 Dependency-Update

```json
{
  "fastify": "^4.28.0"      → "fastify": "^5.9.0"
  "@fastify/cors": "^9.0.1" → "@fastify/cors": "^11.0.0"
  "@fastify/static": "^7.0.4" → "@fastify/static": "^8.0.0"
}
```

### 7.2 Breaking Changes, die uns betreffen

Wir prüfen die offizielle Migrations-Liste (https://fastify.dev/docs/v5.0/migration/) gegen unseren Code:

| Bereich | Breaking Change | Auswirkung auf cronboard |
|---|---|---|
| `bodyLimit` Default | bleibt 1 MiB | keine |
| `logger` Default | `info`-Level, `pino` | wir nutzen pino separat, `logger: false` in `Fastify({ logger: false })` — bleibt erlaubt |
| `reply.send()` für Buffer | strict-typed | wir senden nur JSON, unkritisch |
| `app.setNotFoundHandler` | Signatur leicht geändert | wir nutzen `(req, reply) => reply.code(404).send(...)` — kompatibel |
| `cors`-Plugin `origin: false` | explizit unterstützt in v11 | aktiv genutzt |
| `fastifyStatic` `root` | Type-Annotation `string \| string[]` | wir nutzen `string`, kompatibel |
| `removeContentLengthParser` | API-Change | wir nutzen das nicht |
| `request.routeOptions` | war v4 optional, in v5 Standard | wir nutzen es bereits (`req.routeOptions?.url ?? req.url`) |

**Erwartung**: keine Code-Änderungen außer den Dependency-Versionen. Smoke-Test bestätigt.

### 7.3 Peer-Dependencies

`undici@^6.18.0` ist bereits kompatibel mit fastify 5. `@fastify/cors@^11` und `@fastify/static@^8` peer-en auf `fastify@^5`.

### 7.4 Risiko-Mitigation

- **Smoke-Skript ist Gate** (T14.5): wenn ein Endpoint nicht antwortet, geht der Change nicht raus.
- **Lockfile-Diff prüfen**: `npm install` darf nur den `fastify`-Tree ändern, nicht andere Deps.
- **Fallback-Strategie**: wenn v5 nicht funktioniert, ist das **kein Fallback auf v4** — dann ist v0.5.0 v0.5.1 mit Patch.

---

## 8. Migration v0.4.0 → v0.5.0

### 8.1 Bestand-Jobs mit privaten Webhook-URLs

**Symptom nach Upgrade**: Webhook schlägt fehl mit `private network target rejected: http://127.0.0.1/...`.

**Diagnose**:
```powershell
# Liste Jobs, die private Webhook-URLs haben:
cronboard ls --verbose
# oder programmatisch:
curl http://127.0.0.1:3737/api/jobs | jq '.jobs[] | select(.actions[]?.config.url | test("127\\.|10\\.|192\\.168\\.|172\\.(1[6-9]|2\\d|3[01])\\.|169\\.254\\.|::1")) | { id, name, url: .actions[0].config.url }'
```

**Fix**: in der UI im JobEditor den Toggle „Allow private networks" aktivieren und speichern. Einmalig pro Job.

### 8.2 README-Migrations-Abschnitt

```markdown
## Migrating from v0.4.0 to v0.5.0

v0.5.0 is a security-focused major release. Three things may need your attention:

### 1. Webhooks targeting private networks

If your job uses a webhook to call `127.0.0.1` (e.g. chaining back to your own
cronboard API), `10.x`, `192.168.x`, `169.254.169.254` (AWS IMDS), or other
private targets, you'll need to:

1. Open the job in the editor.
2. Check **Allow private networks** under the webhook URL.
3. Save.

The first start after upgrading will log a warning with all affected jobs.

### 2. Webhooks following redirects

If your webhook provider uses 3xx redirects (e.g. `https://hooks.example.com →
https://api.example.com/v2/hooks`), update the URL to the final destination.
v0.5.0 disables redirect-following to prevent SSRF.

### 3. Cross-origin access

If you access the cronboard UI from a different origin than the API (e.g. UI
at `https://cron.example.com`, API behind reverse proxy at `https://internal:3737`),
either:

- Run cronboard behind a reverse proxy under the same origin (recommended), or
- Wait for v0.6+ which adds `--cors-origins <csv>`.

### 4. Custom cron expressions

If you have cron expressions longer than 256 characters (very unusual), v0.5.0
will reject them. Contact us if you need a higher limit.
```

### 8.3 Storage-Format

Unverändert. Keine Migration nötig.

### 8.4 Token-Setup

Wenn der User bisher `--host 0.0.0.0` ohne `--token` benutzt hat, **weigert sich v0.5.0 zu starten**. Korrekte Migrations-Reihenfolge:
```powershell
cronboard stop
cronboard start --host 0.0.0.0 --token <neues-geheimnis>
```

Das war bereits in v0.4.0 dokumentiert (`local-first-default-bind`), ist aber durch M4 jetzt auch Server-seitig enforced.

### 8.5 Frontend-Cache

Der Web-Client cached ggf. `jobs.json`-Responses. Nach Upgrade: **Hard-Refresh** (Strg+Shift+R) oder Cache leeren.

---

## 9. Reviewer-Checkliste (für `sdd-verify`)

### 9.1 Acceptance Criteria

- [ ] **S1–S10**: alle `assertPublicUrl`/`redactHeaders`-Tests in `security.test.ts` grün.
- [ ] **S11**: `grep timingSafeEqual packages/core/src/server.ts` ≥ 1 Treffer.
- [ ] **S12**: `curl /api/jobs` enthält keinen Secret-Prefix (`sk-`, `Bearer `, `ghp_`, …).
- [ ] **S13**: `npm run typecheck` exit 0.
- [ ] **S14**: Test-Run 0 Failures; Suite enthält Baseline + ≥ 14 neue Tests.

### 9.2 Code-Qualität

- [ ] **Keine `any`-Cast-Erweiterungen**: `webhook.ts`-Änderungen halten das bestehende Type-Level.
- [ ] **`console.warn` nur dort, wo spezifiziert**: T3, T9, T4. Nicht in `redact*`-Funktionen.
- [ ] **Pure-Function-Disziplin**: `redactHeaders`, `redactBody`, `isPrivateAddress` haben keine Side-Effects.
- [ ] **`assertPublicUrl` ist async**: T3 ruft sie mit `await` auf.

### 9.3 Sicherheit

- [ ] **DNS-Lookup nicht vermeidbar**: `assertPublicUrl` resolvet VOR dem `undici.request`.
- [ ] **`maxRedirections: 0`**: tatsächlich gesetzt, nicht vergessen.
- [ ] **`crypto.timingSafeEqual` mit Längen-Check**: nicht ohne.
- [ ] **`allowPrivateNetworks: true` loggt**: ja, mit URL und Job-ID.
- [ ] **`buildServer` wirft bei non-loopback + kein Token**: ja, mit klarer Message.
- [ ] **`execArgv`-Sanitizer ist Allowlist-First**: ja, siehe §5.3.
- [ ] **CORS `origin: false`**: ja, kein `access-control-allow-origin`-Header.

### 9.4 Tests

- [ ] **Strict TDD nachgewiesen**: T1 (RED) ist im PR-Log sichtbar.
- [ ] **DNS-Mocking**: in Tests via `_setResolverForTests`.
- [ ] **Public-URL-Permutation**: `https://example.com`, `http://8.8.8.8`, `http://1.1.1.1` getestet.
- [ ] **Override-Pfad**: `allowPrivateNetworks: true` getestet mit privater URL.
- [ ] **Redaction-Edge-Cases**: leerer Header, fehlender Body, ungültiges JSON, Form-URL-Encoded.

### 9.5 Build / Smoke

- [ ] **`npm run typecheck`**: exit 0.
- [ ] **`npm test`**: exit 0; Suite umfasst v0.4.0-Tests + ≥ 14 neue.
- [ ] **`npm run build`**: exit 0.
- [ ] **`scripts/smoke.ps1`**: exit 0; alle Endpoints antworten.
- [ ] **`npm audit --production`**: 0 HIGH/CRITICAL.
- [ ] **Lockfile-Diff**: nur `fastify`-Tree betroffen.

### 9.6 Doku

- [ ] **`README.md`**: Security-Abschnitt + Migrations-Hinweis (§8.2).
- [ ] **`openspec/config.yaml`**: `project.version` ist `0.5.0`.
- [ ] **`package.json` (root + beide packages)**: Version `0.5.0`.

### 9.7 Git / Commit

- [ ] **Einziger Commit**: ja (T14).
- [ ] **Subject**: `feat(v0.5.0): security hardening - SSRF guard, timing-safe auth, secrets redaction, execArgv sanitizer, fastify 5`.
- [ ] **`git diff packages/*/src/`**: zeigt nur die in T14 `git add`-eten Dateien.

---

## 10. Test-Coverage-Plan

`strict_tdd: true` und `test-coverage-gap-disclosed` sind aktiv. Diese Änderung schließt die Coverage-Lücke für `security`.

| Modul / Funktion | Anzahl Tests | Was getestet wird |
|---|---:|---|
| `assertPublicUrl` IP-Deny | 10 | 127/8, 10/8, 172.16/12, 192.168/16, 169.254/16, ::1, fe80::/10, IPv4-mapped IPv6, ftp-Schema, 172.16/12 Edge |
| `assertPublicUrl` Allow | 3 | example.com, 8.8.8.8, 1.1.1.1 |
| `assertPublicUrl` Override | 1 | `allowPrivateNetworks: true` |
| `isPrivateAddress` | 9 | IPv4 Lo/Priv/Link-Local/Multicast, IPv6 Lo/Link-Local/ULA, IPv4-mapped, CGNAT-Edge |
| `redactHeaders` | 7 | x-api-key, Authorization, Content-Type, X-CSRF-Token, Cookie, X-Forwarded-For, Custom-Keys |
| `redactBody` JSON | 4 | Top-Level-String, Nested-Obj, Parse-Error, CT-Pfad |
| `redactBody` Form-URL | 2 | Sensitive-Key, CT-Pfad |
| `redactWebhookAction` | 2 | Headers + Form-Body, Headers + JSON-Body |
| `redactShellAction` | 1 | Identität (kein Eingriff) |
| `sanitizeExecArgv` | 6 | inspect raus, enable-source-maps bleibt, heap-prof raus, import/require bleiben, cpu-prof-dir raus, experimental bleibt |
| `cronExpression.max(256)` | 2 | 257-Zeichen rejected, 256 OK |
| **Summe neue Tests** | **47** | (über S14's „≥ 14 neue" hinaus) |

> Bei `sdd-apply` darf die Anzahl nicht unter 14 fallen, sonst ist `strict_tdd` nicht erfüllt. Die 47 sind die ehrliche Schätzung über alle Edge-Cases.

---

## 11. Glossar

- **SSRF (Server-Side Request Forgery):** Angriff, bei dem ein Server durch User-Input dazu gebracht wird, Anfragen an interne Ressourcen zu schicken.
- **DNS-Rebinding:** Angriff, bei dem der DNS-Resolve eines Hostnamens zwischen Submit- und Request-Time wechselt, um SSRF-Guards zu umgehen.
- **`timingSafeEqual`:** Node-API für einen Vergleich mit konstanter Laufzeit, unabhängig von der Position des ersten ungleichen Bytes.
- **execArgv:** Liste der Node-CLI-Argumente, die das aktuelle Skript starten — z. B. `--inspect=0.0.0.0:9229` aus dem Dev-Flow.
- **Punycode:** ASCII-Repräsentation von Unicode-Hostnamen (`xn--e1afmkfd.xn--p1ai` für `пример.рф`).
- **CGNAT (Carrier-Grade NAT):** `100.64.0.0/10` — nicht erfasst in v0.5.0; bewusste Auslassung.
- **Allowlist-First:** Konservativer-Sanitizer-Ansatz: nur explizit erlaubte Flags bleiben; unbekannte fallen durch.
- **Stripping:** Reduktion sensibler Felder auf einen Platzhalter (`***`); idempotent.

---

## 12. Offene Punkte (für Folge-Changes, nicht hier)

| Punkt | Begründung für OUT |
|---|---|
| `jobs.json` / `runs.json` at-rest Verschlüsselung | Storage-Format-Migration, Key-Management. v0.6+. |
| WebSocket / SSE für Live-Updates | Dashboard-Architektur-Wurf. Bereits in v0.4.0 OUT. |
| MFA / RBAC | Single-User-Design. Storage-Modell-Wurf. |
| Audit-Log / Activity-Log | Eigenständiges Feature. |
| CSP-Header auf der SPA-HTML | Defense-in-depth. v0.6+. |
| Per-Job-Rate-Limiting | Kein UX-Bedarf heute. |
| DNS-Rebinding-Mitigation via `dns.setServers` + IP-Pinning | Edge-Case für lokale Deployments. v0.6+. |
| `--cors-origins <csv>` | Multi-Origin-Deployments. v0.6+. |
| `Logger` im `ActionExecutor` | Würde `registry.ts` berühren. v0.6+. |
| `redactShellAction` maskiert `command` | Asymmetrie ist Absicht (D13). Kein Change. |

Diese Punkte sind bewusst **außerhalb** dieses Changes.