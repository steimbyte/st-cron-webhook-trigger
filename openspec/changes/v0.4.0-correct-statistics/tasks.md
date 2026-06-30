# Tasks: v0.4.0-correct-statistics

> **Reihenfolge:** T0 → T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8 → T9. Jeder Task endet mit einem Gate, das vor dem nächsten Task grün sein muss.
> **TDD-Postur:** `strict_tdd: true` und `test-coverage-gap-disclosed` sind in `config.yaml` aktiv. **T1 muss zwingend RED laufen**, bevor T2 grün werden darf. Tests-first.
> **Datei-Konvention:** jeder Task listet die Dateien, die er anfasst (R = lesen, M = schreiben, C = anlegen). Diese Tasks sind für **`sdd-apply`**, nicht für `sdd-propose` — `sdd-propose` ist mit dem Schreiben dieser Datei fertig.

---

## T0 — Pre-flight: Baseline-Messung & Code-Audit

> **Status:** Vom Parent bereits durchgeführt (Recherche im Chat-Kontext). Dieser Task **misst einmalig den heutigen Stand**, damit `sdd-apply` eine reproduzierbare Vergleichsbasis hat.

- **R** `packages/web/src/pages/Dashboard.tsx` — bestätige, dass die `timezone`-Prop **nicht existiert** (das steht heute nur in `App.tsx` als `onNavigate`). Audit-Notiz in den sdd-apply-Log: „Dashboard nimmt keine `timezone`-Prop; v0.4.0 liest die TZ aus `Intl.DateTimeFormat().resolvedOptions().timeZone`."
- **R** `packages/core/src/server.ts` — bestätige die Version-Zeile 47 `version: "0.3.0"` (wird in T9 zu `"0.4.0"`).
- **R** `packages/core/src/cli.ts` — bestätige die Version-Zeile 28 (gleiches Schema).
- **R** `packages/core/src/scheduler/cronExpr.test.ts` — Anzahl vorhandener Tests protokollieren (Erwartung: 63, laut v0.3.0-Commit-Kontext).
- **R** `packages/web/src/lib/api.ts` — bestätige, dass heute kein `api.stats`-Namespace existiert.
- Ausführen:
  ```powershell
  # heutige Bundle-Größe messen (Baseline für R5 / S10):
  npm run build
  Get-ChildItem packages/web/dist/assets/*.js | Measure-Object -Property Length -Sum
  # Test-Count baseline:
  node --test --import tsx packages/core/src/scheduler/cronExpr.test.ts 2>&1 | Select-String "tests"
  ```
- **Gate 0.1:** Bestandsaufnahme in eine kleine Notiz ans Ende dieses Tasks schreiben (z. B. „Bundle vor T1: 142 KB; Tests: 63/63 grün"). Keine Code-Änderung.

> Begründung des Eltern-Audits:
> - Dashboard hat **keine** `timezone`-Prop (entgegen dem Parent-Briefing).
> - `App.tsx` reicht nur `onNavigate: (v: View) => void` durch.
> - Storage-Format `runs.json` bleibt byte-identisch (Schema passt).
> - Tests laufen über `node --test --import tsx` mit Pattern `packages/core/src/**/*.test.ts`.

---

## T1 — Tests-first für `aggregations` (RED)

> **Dieser Task ist die Pflicht-Erfüllung von `rule: test-coverage-gap-disclosed`.** Vor jeder Produktiv-Zeile in `packages/core/src/stats/aggregations.ts` steht ein Test, der fehlschlägt.

- **C** `packages/core/src/stats/aggregations.test.ts`
- **R** `packages/core/src/types.ts` — Imports für `Run`, `RunStatus`.
- Imports:
  ```ts
  import { describe, it } from "node:test";
  import assert from "node:assert/strict";
  import { successRate, summarizeRunDurations, runsByHour, lastN } from "./aggregations.js";
  import type { Run } from "../types.js";
  ```
- **Mindestens 12 Test-Fälle** (über die vom Parent geforderten 6 hinaus, weil `strict_tdd` mehrere Edge-Cases pro Funktion verlangt):

  | Block | Test |
  |---|---|
  | `successRate` | (a) leerer Input → `null` (S1); (b) alle success → `100` (S2); (c) 5/5 success/failed → `50` (S3); (d) nur running → `null` (Empty-State); (e) gemischt success/failed/partial/timeout (Definition beibehalten wie aktueller Code: failed+partial zählen als Fail). |
  | `summarizeRunDurations` | (a) 10 Samples in 100-ms-Schritten → p95 zwischen 945 und 1005 (S4 mit ±5 ms Toleranz); (b) leerer Input → `{ p50: null, p95: null, p99: null, count: 0, errored: 0 }`; (c) Runs ohne `durationMs` zählen in `errored`, nicht im Perzentil; (d) p50 strikt monoton wachsend bei strikt monoton wachsendem Input. |
  | `runsByHour` | (a) 24 Buckets Länge; (b) ein Run „jetzt" landet im letzten Bucket; (c) `tz='Etc/UTC'` und `tz='Europe/Berlin'` geben bei einem Run um Mitternacht UTC unterschiedliche Bucket-Indizes; (d) DST-Sprung in `Europe/Berlin` im März produziert 23 oder 25 Stunden, je nach Richtung; (e) Bucket-Edges sind als UTC-ms stabil für aufeinanderfolgende Aufrufe. |
  | `lastN` | (a) `lastN([], 5) === []`; (b) `lastN(runs mit 3, 5).length === 3`; (c) `lastN` ist absteigend nach `startedAt` sortiert. |

- **Gate 1.1 (RED erwartet):** `node --test --import tsx packages/core/src/stats/aggregations.test.ts` → ImportError oder Failures, weil `aggregations.ts` noch nicht existiert. Ausgabe in den Log kopieren.
- **Gate 1.2:** Test-Datei kompiliert mit `tsc -p packages/core/tsconfig.json --noEmit` ohne Fehler.

> T1 ist die einzige Stelle, an der `sdd-apply` Code **vor** dem Produktiv-Code anlegen darf. Wenn der Runner aus irgendeinem Grund grün durchläuft, hat `sdd-apply` geschlampt und muss es wieder rot machen.

---

## T2 — Implementierung `aggregations.ts` (GREEN)

- **C** `packages/core/src/stats/aggregations.ts`
- **R** `packages/core/src/types.ts` — `Run`, `RunStatus`.
- **Verbindlich:**
  - `successRate(runs: Run[]): number | null`:
    - Definition wie aktueller Dashboard-Code: `failed` und `partial` zählen als Fail, `timeout` zählt **nicht** als Fail (siehe `proposal.md → D7`).
    - Bei `runs.length === 0` → `null`.
    - Sonst `Math.round(100 * (count - failed) / count)`.
  - `summarizeRunDurations(runs: Run[], windowMs?: number)`:
    - Filtert `runs` auf das Fenster (falls `windowMs` gesetzt).
    - Trennt Runs mit und ohne `durationMs`.
    - `count = runs.length` (alle Runs im Fenster), `errored = runs.filter(r => r.durationMs == null).length`.
    - Perzentile **nur** über die `durationMs`-Werte, per linearer Interpolation:
      ```ts
      const sorted = durations.slice().sort((a, b) => a - b);
      const idx = (p) => (sorted.length - 1) * p;
      const lo = Math.floor(idx), hi = Math.ceil(idx);
      const value = sorted[lo] + (idx - lo) * (sorted[hi] - sorted[lo]);
      ```
    - Rückgabe `{ p50, p95, p99, count, errored }`, wobei `p50/p95/p99 = null` wenn `sorted.length === 0` (Empty-State).
  - `runsByHour(runs: Run[], hours: number, tz: string): number[]`:
    - Länge `hours` (Default-Aufrufer verwendet 24).
    - Bucket-Edges in **UTC-Millisekunden**; die Wand-Uhrzeit pro Bucket wird über die TZ berechnet.
    - Implementierung: `now = Date.now()`; nehme `Intl.DateTimeFormat('en-CA', { timeZone: tz, hourCycle: 'h23' })` für Format‑Trick: Date.now() → „YYYY-MM-DD HH:00:00" in der TZ; dann zurück zu UTC-ms. Robust gegen DST.
    - Zähle Runs, deren `startedAt` in `[edges[i], edges[i+1])` fällt.
  - `lastN(runs: Run[], n: number): Run[]`:
    - Sortiere absteigend nach `startedAt`, slice(0, n).

- **Gate 2.1 (GREEN erwartet):** `node --test --import tsx packages/core/src/stats/aggregations.test.ts` → alle Tests grün.
- **Gate 2.2:** `npm run typecheck -w packages/core` exit 0.
- **Gate 2.3:** `node --test --import tsx packages/core/src/**/*.test.ts` zeigt 0 Failures, Test-Number-Diff vs. Baseline ≥ 12 (aus T1).

> Hinweis: `aggregations.ts` darf **keine** neuen Imports über das hinaus, was bereits in `packages/core/src/**` genutzt wird (`node:`, `zod` ist ok). Null neue npm-Deps. Siehe `proposal.md → D8`.

---

## T3 — `GET /api/stats` in `server.ts`

- **M** `packages/core/src/server.ts`
- Neue Route:
  ```ts
  app.get("/api/stats", async (req) => {
    const q = z.object({ tz: z.string().optional() }).parse(req.query ?? {});
    const tz = q.tz ?? "Etc/UTC";
    const allRuns = await deps.runs.list({ limit: 1000 }); // oder eine eigene Repo-Methode, falls vorhanden
    const jobs = await deps.jobs.list();
    const last24h = allRuns.filter((r) => Date.now() - new Date(r.startedAt).getTime() < 86_400_000);
    const summary = summarizeRunDurations(last24h);
    const overall = {
      runsLast24h: last24h.length,
      failuresLast24h: last24h.filter(r => r.status === "failed" || r.status === "partial").length,
      successRate: successRate(last24h),  // null wenn leer
      p50Ms: summary.p50, p95Ms: summary.p95, p99Ms: summary.p99,
      count: summary.count, errored: summary.errored,
    };
    const histogram = runsByHour(last24h, 24, tz);  // 24 stündliche Counts für TimeseriesChart
    const perJob = jobs.map((j) => {
      const jobRuns = allRuns.filter((r) => r.jobId === j.id);
      const last24 = jobRuns.filter((r) => Date.now() - new Date(r.startedAt).getTime() < 86_400_000);
      return {
        jobId: j.id, jobName: j.name, enabled: j.enabled,
        successRate: successRate(last24),
        runsLast24h: last24.length,
        failuresLast24h: last24.filter(r => r.status === "failed" || r.status === "partial").length,
        p95Ms: summarizeRunDurations(last24).p95,
        lastRunsCount: jobRuns.length,
      };
    });
    return { ok: true, tz, generatedAt: new Date().toISOString(), overall, histogram, perJob };
  });
  ```
- **M** Falls `RunsRepo.list({ limit: 1000 })` nicht existiert oder die Datenmenge groß ist: `tasks.md → T3.5` (s.u.) eine optionale Repo-Methode `listSince(nowMs)` ergänzen.
- **Gate 3.1:** `curl -fsS http://127.0.0.1:3737/api/stats | jq '.overall | keys'` zeigt exakt `[ "runsLast24h", "failuresLast24h", "successRate", "p50Ms", "p95Ms", "p99Ms", "count", "errored" ]`.
- **Gate 3.2:** Smoke gibt das JSON in einer separaten Datei aus, damit es in `tests/fixtures/api-stats.sample.json` landen kann (optional, später für sdd-verify-Referenz).

### T3.5 — Optional: `RunsRepo.listSince(nowMs)`

> **Nur falls T3 mit „too much data" scheitert (R4)**

- **M** `packages/core/src/store/runs.ts` (oder gleichwertig)
- Methode: `listSince(nowMs: number): Promise<Run[]>` — gibt Runs zurück, deren `startedAt >= nowMs` ist.
- Implementierung: Filter auf der bereits eingelesenen Liste (Storage ist JSON, also kein Push-Down-Filter nötig).
- **Gate:** Smoke erneut grün, Performance-Check < 100 ms bei 10 000 Runs im Storage.

---

## T4 — `GET /api/jobs/:id/stats` in `server.ts`

- **M** `packages/core/src/server.ts`
- Neue Route:
  ```ts
  app.get("/api/jobs/:id/stats", async (req, reply) => {
    const { id } = req.params as { id: string };
    const q = z.object({ limit: z.coerce.number().int().min(1).max(50).optional().default(20) }).parse(req.query ?? {});
    const job = await deps.jobs.get(id);
    if (!job) return reply.code(404).send({ error: "not found" });
    const runs = await deps.runs.list({ jobId: id });
    const recent = lastN(runs, q.limit);  // für StatusStrip
    const last24 = runs.filter((r) => Date.now() - new Date(r.startedAt).getTime() < 86_400_000);
    return {
      ok: true,
      jobId: id,
      successRate: successRate(last24),
      runsLast24h: last24.length,
      failuresLast24h: last24.filter(r => r.status === "failed" || r.status === "partial").length,
      p50Ms: summarizeRunDurations(last24).p50,
      p95Ms: summarizeRunDurations(last24).p95,
      lastRuns: recent,
    };
  });
  ```
- **Gate 4.1 (S6):** `curl -fsS 'http://127.0.0.1:3737/api/jobs/<id>/stats?limit=20' | jq '.lastRuns | length'` zeigt eine Zahl `≤ 20`.
- **Gate 4.2:** `lastRuns[].startedAt` ist absteigend sortiert (Smoke-Check oder neuer `aggregations.test.ts`-Fall).
- **Gate 4.3:** 404 für unbekannte Job-ID.

---

## T5 — `api.stats` Client-Erweiterung

- **M** `packages/web/src/lib/api.ts`
- Hinzufügen:
  ```ts
  export interface OverallStats {
    runsLast24h: number;
    failuresLast24h: number;
    successRate: number | null;
    p50Ms: number | null; p95Ms: number | null; p99Ms: number | null;
    count: number; errored: number;
  }
  export interface PerJobStat {
    jobId: string; jobName: string; enabled: boolean;
    successRate: number | null; runsLast24h: number; failuresLast24h: number;
    p95Ms: number | null; lastRunsCount: number;
  }
  export interface StatsResponse {
    ok: true; tz: string; generatedAt: string;
    overall: OverallStats;
    histogram: number[];
    perJob: PerJobStat[];
  }
  export interface JobStatsResponse {
    ok: true; jobId: string;
    successRate: number | null;
    runsLast24h: number; failuresLast24h: number;
    p50Ms: number | null; p95Ms: number | null;
    lastRuns: Run[];
  }
  // im api-Objekt:
  stats: {
    overall: (tz?: string) => {
      const q = tz ? `?${new URLSearchParams({ tz })}` : "";
      return request<StatsResponse>("GET", `/api/stats${q}`);
    },
    job: (id: string, limit = 20) =>
      request<JobStatsResponse>("GET", `/api/jobs/${id}/stats?limit=${limit}`),
  },
  ```
- **M** `packages/web/src/types.ts` — `OverallStats`, `PerJobStat`, `StatsResponse`, `JobStatsResponse` re-exportieren (oder in `api.ts` belassen und aus `Dashboard.tsx`/`JobsPage.tsx` direkt importieren).
- **Gate 5.1:** `npm run typecheck -w packages/web` exit 0.
- **Gate 5.2:** `api.stats.overall()`-Aufruf im Browser liefert valides JSON (entweder manuell oder in einem Mini-Test gegen den laufenden Daemon).

> Design-Detail `histogram`: das Dashboard empfängt vom Server fertig gebucketete 24 Werte; keine client-seitige Re-Aggregation mehr. Siehe `proposal.md → D4`.

---

## T6 — Dashboard-Refactor

> **Vorbedingung:** T1–T5 sind grün.

- **M** `packages/web/src/pages/Dashboard.tsx`
- **C** `packages/web/src/components/TimeseriesChart.tsx`
- Änderungen im Dashboard:
  1. `useEffect` ruft `api.stats.overall(Intl.DateTimeFormat().resolvedOptions().timeZone)` auf, nicht mehr `api.jobs.list()` + `api.runs.list({ limit: 50 })`. `jobs` wird weiterhin per `api.jobs.list()` geholt für die „Upcoming runs"-Liste.
  2. Karten:
     - ACTIVE JOBS — bleibt strukturell wie heute, Daten aus `api.jobs.list()`.
     - RUNS · last 24 h — nutzt `<TimeseriesChart values={stats.histogram} />` statt `MiniSparkline`. Bei `histogram.every(v => v === 0)` rendert eine Empty-Hint-Zeile („No runs in the last 24 h").
     - FAILURES · last 24 h — `stats.overall.failuresLast24h`, Empty-Anzeige „all green" wenn `failuresLast24h === 0`.
     - SUCCESS RATE — `stats.overall.successRate === null ? "—" : `${successRate}%` ` (S7). Hinweis-Tooltip: `title={successRate === null ? "No runs in the last 24 h" : ""}`.
     - **P95 LATENCY · last 24 h** (neu) — `stats.overall.p95Ms === null ? "—" : `${p95Ms} ms` ` (S8).
  3. Layout: das Grid `grid-cols-1 sm:grid-cols-2 xl:grid-cols-4` wird auf `xl:grid-cols-5` erweitert. Falls die 5 Cards auf `xl`-Breakpoint nicht passen, fällt Plan B: ein zweiter `2-spaltiger` Block darunter, beide Reihen teilen sich die Spalten.
  4. `props.timezone` — **nicht** hinzugefügt; Dashboard liest `Intl.DateTimeFormat().resolvedOptions().timeZone` selbst (siehe `proposal.md → D10`).
  5. Die alte `MiniSparkline`-Funktion **innerhalb von Dashboard.tsx** wird entfernt (wird durch `<TimeseriesChart>` ersetzt).
- **Gate 6.1 (S7):** Smoke-Assertion: leeres `runs.json` → SUCCESS RATE zeigt `—`.
- **Gate 6.2 (S8):** Smoke-Assertion: nur `running`-Runs → P95 LATENCY zeigt `—`.
- **Gate 6.3:** Time-Series-Chart rendert 24 Buckets korrekt; bei `runsLast24h === 0` ist die Empty-Hint-Zeile sichtbar.
- **Gate 6.4:** Visuelle Inspektion in Preview: 5 Cards ordnen sich auf `xl` (≥ 1280 px) sauber nebeneinander, auf kleineren Viewports umbrechen sie.

> Detail zu `<TimeseriesChart />`: reines SVG, **keine** neue npm-Dep. Siehe `design.md §3.2` für die Komponenten-Skizze und §5 für das Bundle-Delta.

---

## T7 — JobsPage: Status-Strip + Sparkline pro Zeile

> **Vorbedingung:** T1–T6 grün.

- **M** `packages/web/src/pages/JobsPage.tsx`
- **C** `packages/web/src/components/StatusStrip.tsx`
- **M** `packages/web/src/pages/Dashboard.tsx` — die exportierte `RunBadge`-Funktion **wandert** in eine eigene Datei `packages/web/src/components/RunBadge.tsx` (oder wird aus `StatusStrip` mit-exportiert), damit JobsPage sie direkt importieren kann. **Achtung:** Reihenfolge — diese Refactor passiert **vor** der JobsPage-Erweiterung.
- Änderungen:
  1. `<StatusStrip runs={...} />` rendert **20** quadratische Cells (D6), Farbe pro `Run.status` (success=success, failed=error, partial=warning, timeout=warning, running=info). Pro Cell: `aria-label="Run at <iso> (<status>, <duration ms> ms)"`.
  2. Wenn `runs.length === 0`: 20 leere Cells mit `aria-label="No runs yet"` und grauer Hintergrund (`bg-base-300/40`).
  3. Neue Tabelle-Header: `STATUS` (Column nach `Last`), `24 H` (Success-Rate-Badge), `P95` (Latenz), `RUNS` (Strip).
  4. **Lazy-Load pro Zeile:** in der Tabellen-Map zusätzlich `useState<Record<string, JobStatsResponse | 'loading'>>({})` halten, beim Row-Render einen `useEffect` mit IntersectionObserver oder einfacher „on mount" → `api.stats.job(j.id)`. **Performance-Check:** bei 50 Jobs mit jeweils 20 Run-Fetches darf das visuelle „alles grün" nicht länger als 1,5 s dauern (R4).
  5. Falls Performance ein Problem ist: Plan B — einmaliger Batch-Request an `/api/stats` und Client-seitiges Mapping per `jobId`. Diese Variante ist auch ohne T3.5 möglich und nur eine Frage der Datenleitung im Client. **Empfehlung:** mit dem Batch-Ansatz (`/api/stats.perJob` enthält bereits alles Notwendige; siehe T3) starten und Lazy-Load nur als Fallback.
- **Gate 7.1 (S9):** Smoke: Tabelle mit 2 Jobs (einer mit Runs, einer ohne) rendert zwei `<td>` mit Strip — einer belegt, einer zeigt 20 graue Cells.
- **Gate 7.2:** Performance: bei 50 simulierten Jobs ist die Tabelle in < 1,5 s interaktiv (manueller Smoke + Log-Timestamp).
- **Gate 7.3:** `aria-label` per Cell ist im DOM vorhanden (Smoke-Snapshot).

> Begründung: ein **eager** 50er-Batch spart Runden, ein **lazy** Approach spart initiale Last. v0.4.0 startet mit dem **Batch-Ansatz** (T3 liefert `perJob`-Array bereits), `JobsPage` mappt nur per `jobId`. Falls das UX langsam wird, iteriert v0.5.

---

## T8 — Gates: typecheck, tests, smoke, bundle

- **R** Alle Quellen seit T1.
- Ausführen:
  ```powershell
  npm run typecheck   # beide Pakete
  node --test --import tsx 'packages/core/src/**/*.test.ts'
  npm run build       # inkl. Bundle-Vergleich
  powershell -ExecutionPolicy Bypass -File scripts/smoke.ps1
  ```
- **Gate 8.1 (S5/S10):** `npm run typecheck` exit 0.
- **Gate 8.2 (S10):** Test-Run zeigt 0 Failures; Anzahl `cronExpr.test.ts` (Baseline) + Anzahl `aggregations.test.ts` (mindestens 12); insb. alle 5 S-Kriterien S1–S4 sind in Aggregations-Tests verankert.
- **Gate 8.3 (S11):** `scripts/smoke.ps1` druckt `=== done ===` und exit 0. (Falls das Skript das exakt so macht — falls nicht, Output entsprechend der bisherigen Konvention dokumentieren.)
- **Gate 8.4 (Bundle-Delta):** `Get-ChildItem packages/web/dist/assets/*.js | Measure-Object -Property Length -Sum` nach Build ≤ Baseline + 5 KB gzip. Mess-Methode in `design.md §5`.

---

## T9 — Version bump `0.3.0` → `0.4.0` und Commit

> **Bewusst nicht enthalten:**
> - `openspec/config.yaml → project.version` (Erinnerung: steht schon auf `0.3.0`, wird mit `0.4.0` aktualisiert).
> - `README.md` Tech-Stack-Tabelle.

- **M** `package.json` (Root) — `"version": "0.3.0"` → `"0.4.0"`
- **M** `packages/web/package.json` — `"version": "0.3.0"` → `"0.4.0"`
- **M** `packages/core/package.json` — `"version": "0.3.0"` → `"0.4.0"`
- **M** `packages/core/src/cli.ts` (Zeile 28) — `.version("0.3.0")` → `.version("0.4.0")`
- **M** `packages/core/src/server.ts` (Zeile 47) — `version: "0.3.0"` → `version: "0.4.0"`
- **M** `openspec/config.yaml → project.version` — `0.3.0` → `0.4.0`  *(in v0.3.0 nicht mitgezogen; holen wir jetzt nach, weil semantisch klar)*
- Verifikation:
  ```powershell
  grep -RIn "0\.3\.0" package.json packages/*/package.json packages/core/src/cli.ts packages/core/src/server.ts openspec/config.yaml
  # erwartet: 0 Treffer in den genannten Dateien
  grep -RIn "0\.4\.0" package.json packages/*/package.json packages/core/src/cli.ts packages/core/src/server.ts openspec/config.yaml
  # erwartet: 5+1 Treffer (Root pkg, web pkg, core pkg, cli.ts:28, server.ts:47, config.yaml:project.version)
  ```
- Commit (PowerShell):
  ```powershell
  # Status check
  git status
  git add \
    openspec/changes/v0.4.0-correct-statistics/ \
    package.json packages/web/package.json packages/core/package.json \
    packages/core/src/cli.ts packages/core/src/server.ts packages/core/src/stats/ \
    packages/web/src/lib/api.ts packages/web/src/types.ts \
    packages/web/src/components/StatusStrip.tsx packages/web/src/components/TimeseriesChart.tsx \
    packages/web/src/pages/Dashboard.tsx packages/web/src/pages/JobsPage.tsx \
    openspec/config.yaml
  git status
  git commit -m "feat(v0.4.0): honest chart statistics - p50/p95/p99, empty-state handling, per-job status strip"
  git push origin master
  ```
- **Gate 9.1:** `git log -1 --pretty=%s` → exakt der vorgegebene Subject.
- **Gate 9.2:** `git diff master@{1} master --stat` zeigt **nur** die oben `git add`-eten Pfade.
- **Gate 9.3:** Re-Run `npm run typecheck && node --test --import tsx 'packages/core/src/**/*.test.ts' && powershell -ExecutionPolicy Bypass -File scripts/smoke.ps1` — alles grün.

> Hinweis zur Commit-Message: `feat(v0.4.0):` als Präfix (siehe v0.3.0-Redeclaration: `chore(v0.3.0):`). Beide Conventions existieren; `feat` ist hier korrekter, weil neue Funktionalität dazukommt.

---

## Cross-Phase-Checkliste (bevor `sdd-apply` als erfolgreich gilt)

- [ ] T0 Baseline-Analyse geschrieben
- [ ] T1 Tests-first: `aggregations.test.ts` **RED** nachweisbar
- [ ] T2 Implementierung: `aggregations.ts` macht die Tests **GREEN**
- [ ] T3 `/api/stats` vorhanden, JSON valide (S5)
- [ ] T4 `/api/jobs/:id/stats` vorhanden, `lastRuns.length <= 20` (S6)
- [ ] T5 `api.stats.overall()` und `api.stats.job(id)` im Frontend nutzbar
- [ ] T6 Dashboard: SUCCESS RATE `—` bei null Daten (S7), P95 LATENCY `—` bei null Daten (S8), 5 Cards ordnen sich auf xl sauber
- [ ] T7 JobsPage: `<StatusStrip />` pro Zeile, lazy oder batch (S9)
- [ ] T8 Typecheck + Tests + Smoke + Bundle-Delta ≤ 5 KB (S5/S10/S11)
- [ ] T9 Versionsbump vollständig, einziger Commit
- [ ] `openspec/config.yaml → project.version` von `0.3.0` auf `0.4.0` mitgezogen
- [ ] `git diff packages/*/src/` zeigt nur die geplanten Änderungen; sonst nichts Unerwartetes

---

## Beobachtungen für `sdd-apply` (keine T-Tasks, Empfehlungen)

Diese sind **nicht** Teil dieses Changes, gehören aber in die Köpfe der Anwender:

1. **`Run.durationMs` ist optional.** Bei `running`-Runs fehlt der Wert fast immer. Der Aggregator muss das defensiv behandeln — T2 listet das explizit (`errored`-Zähler).
2. **Latenz in `Europe/Berlin` um DST-Sprung (März/Oktober):** kann 23 h oder 25 h ergeben. v0.4.0 rundet auf 24 h (UTC-basiert) und zeigt Bucket-Counts; das „fehlende"/„doppelte" Bucket ist eine Wand-Uhr-Anomalie, nicht ein Fehler. Dokumentation in `design.md §2`.
3. **`timeout`-Status zählt weiterhin nicht als Fail.** Falls die Definition geändert werden soll, ist das eine Mini-Folge-Änderung (siehe `proposal.md → D7`).
4. **Bundle-Delta wird im Commit-Body dokumentiert.** Wir messen ehrlich, nicht versprochen.
5. **Folge-Changes (eigene Change-IDs):**
   - WebSocket/SSE Live-Updates
   - Calendar-Heatmap
   - MTTR / Schedule-Adherence
   - Anomalieerkennung / Alerting
