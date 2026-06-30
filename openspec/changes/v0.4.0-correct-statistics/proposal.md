# Proposal: v0.4.0-correct-statistics — ehrliche, korrekte Cron-Statistik

- **Phase:** sdd-propose → wartet auf Freigabe → sdd-apply
- **Autor:** sdd-proposal sub-agent (parent: gentle-pi harness)
- **Datum:** 2026-06-30
- **Projekt:** `cronboard` (aktuell v0.3.0, steht nach v0.3.0-cleanup-ui-deps auf DaisyUI-only)
- **Governance:** `openspec/config.yaml`, `AGENTS.md` (Regeln in §2 / §4 haben Vorrang)

---

## 1. Executive Summary (≤ 200 Wörter)

v0.3.0 hat das UI auf DaisyUI konsolidiert, aber die **angezeigten Statistiken auf dem Dashboard und der Jobs-Seite sind statistisch falsch**: `successRate` zeigt bei null Runs `100%` (Empty-State-Lüge), das „Sparkline" ist ein Histogramm, das als Liniendiagramm gerendert wird, es fehlen Latenz-Perzentile (p50/p95/p99) — der wichtigste Cron-Monitor-Wert überhaupt —, die Jobs-Seite zeigt pro Job weder Erfolgsquote noch Latenz noch den kompakten Status-Strip der letzten 20 Runs, und die 24-h-Aggregation ignoriert die eingestellte Zeitzone.

v0.4.0 räumt das ehrlich auf: ein neues, reines, **getestetes** `@cronboard/core`-Statistik-Modul (`packages/core/src/stats/aggregations.ts`) liefert `successRate`, `summarizeRunDurations` (mit p50/p95/p99), `runsByHour` und `lastN` mit ausdrücklichem `null`-Empty-State. Zwei neue HTTP-Endpoints (`/api/stats`, `/api/jobs/:id/stats`) ziehen die Aggregation auf den Server. Dashboard und JobsPage werden so umgebaut, dass sie diese Endpoints benutzen, `null` als „—" rendern, einen echten Time-Series-Area-Chart zeigen und pro Job eine kompakte `<StatusStrip />` der letzten 20 Runs anzeigen. Bundles-Delta: ≤ 5 KB gzip.

---

## 2. Intent

Cronboard-Nutzer verlassen sich auf das Dashboard als „Gesundheitsübersicht". Aktuell führt die UI in vier konkrete Irreführungen, die in kleinen Teams fatale Folgen haben können:

1. **Empty-State-Lüge**: ein frisch installiertes cronboard zeigt `100% Success Rate` und `perfect`, obwohl es **keine Daten** gibt. Ein Operator kann daraus fälschlich „alles grün" ableiten und einen ausgefallenen Job übersehen.
2. **Histogramm als Liniendiagramm missverstanden**: `MiniSparkline` interpoliert 24 Stunden-Bucket-Counts zu einer glatten Linie. Das suggeriert einen Verlauf, der nicht existiert — die Zwischenwerte zwischen den Stunden sind reine Füllmasse.
3. **Keine Latenz-Aussage**: ein Job, der „success"-Runs produziert aber seit drei Wochen still von 200 ms auf 12 s gekrochen ist, sieht auf dem Dashboard unverändert grün aus. p50/p95/p99 sind die erste Verteidigungslinie gegen schleichende Regression.
4. **Keine Per-Job-Sicht**: die Jobs-Seite listet jeden Job isoliert von seinen Run-Ausgängen. Eine 80-Jobs-Tabelle braucht eine kompakte „war letzte 20 Runs so"-Anzeige pro Zeile — genau dafür ist der Status-Strip erfunden.

Ziel dieser Änderung: jede auf dem Dashboard und der Jobs-Seite dargestellte Zahl ist **wahr, getestet und korrekt etikettiert**. Empty States sind explizit „keine Daten", nicht „100%". Latenz wird in drei Perzentilen ausgedrückt. Die Zeitzone, die der Nutzer pro Job setzt, wird in den Zeitfenstern respektiert.

---

## 3. Acceptance Criteria (S1–S11)

Diese Kriterien sind die Vertragsbasis für `sdd-apply` und werden in `sdd-verify` automatisiert geprüft.

| #    | Kriterium | Messverfahren |
|------|-----------|--------------|
| S1   | `successRate([])` (kein Input) gibt `null` zurück. | Unit-Test in `aggregations.test.ts`: `assert.equal(successRate([]), null)` ist grün. |
| S2   | `successRate(runs where every run.status === 'success')` gibt `100` zurück. | Unit-Test: gemischte Input-Suite, alle Status `success` → Erwartung `100`. |
| S3   | `successRate(runs where exactly half failed)` gibt `50` zurück. | Unit-Test: 10 Runs, 5 success + 5 failed → Erwartung `50` (mathematisch exakt; kein Rounding-Edge-Case nötig). |
| S4   | `summarizeRunDurations([100,200,...,1000]ms).p95` liegt im 95. Perzentil (innerhalb linearer Interpolation). | Unit-Test: 10 Samples in 100-ms-Schritten → p95 exakt oder innerhalb ±5 ms um 950 ms (`ceil(0.95*N) ≈ Index 9 → 1000`, mit linearer Interpolation Index 8.5 → 950; Test akzeptiert beide). |
| S5   | `GET /api/stats` liefert valides JSON der Form `{ overall: {...}, last24h: {...}, perJob: [...] }`. | `curl -fsS http://127.0.0.1:3737/api/stats` exit 0, JSON-Shape via `node -e` validiert (Pflicht-Keys vorhanden, Typen passen). |
| S6   | `GET /api/jobs/:id/stats?limit=20` liefert `lastRuns: Run[]` mit `length <= 20`. | Smoke-Aufruf + Längen-Assert; Reihenfolge absteigend nach `startedAt`. |
| S7   | Dashboard rendert `—` für SUCCESS RATE, wenn 0 Runs in den letzten 24 h existieren. | Smoke-Assertion: leerer Datensatz → `textContent` enthält `—` und nicht `100%`. |
| S8   | Dashboard rendert `—` für P95 LATENCY, wenn keine Runs mit `durationMs` in den letzten 24 h existieren. | Smoke-Assertion: nur `running`-Runs, kein `durationMs` → `—` im P95-Slot. |
| S9   | JobsPage rendert eine `<StatusStrip />` pro Zeile, wenn der Job Runs hat; leerer Strip (Platzhalter-Struktur), wenn nicht. | Smoke: in einer Tabelle mit mindestens einem Job mit Runs und einem ohne ist die Strip-Cell beider Zeilen vorhanden und visuell unterscheidbar (CSS-Klasse `cb-strip-empty` vs. belegte Zellen). |
| S10  | `npm run typecheck` exit 0; `node --test --import tsx 'packages/core/src/**/*.test.ts'` ist grün und enthält **mindestens 6 neue Tests** zusätzlich zur bestehenden `cronExpr.test.ts`-Suite. | `npm run typecheck` → 0. Test-Run: `cronExpr.test.ts`-Tests (existierend) + neue `aggregations.test.ts`-Tests; Differenz ≥ 6. |
| S11  | End-to-End-Smoke (`scripts/smoke.ps1`) druckt abschließend `=== done ===` und exit 0. | Siehe `tasks.md → T8`. |

> Hinweis S10: das Projekt hat heute 0 aktive Unit-Tests unter `packages/core/src` außer `cronExpr.test.ts` (63 Tests, der in v0.3.0 referenziert wurde). Die ursprüngliche Vorgabe des Parents „≥ current count + 6" bezieht sich auf **die Suite als Ganzes**; mit dieser Änderung wird `aggregations.test.ts` zur ersten neuen Suite. Wir liefern mehr als 6 Tests ab, weil `strict_tdd: true` und `test-coverage-gap-disclosed` das verlangen — siehe `tasks.md → T1` und `design.md §8`.

---

## 4. Scope

### In-Scope

| Bereich | Änderung |
|---|---|
| Stat-Helper-Modul | Neu: `packages/core/src/stats/aggregations.ts` mit reinen Funktionen `successRate`, `summarizeRunDurations`, `runsByHour`, `lastN`. |
| Stat-Unit-Tests | Neu: `packages/core/src/stats/aggregations.test.ts`, strict TDD, mind. 6 neue Tests über die vier Funktionen. |
| HTTP `/api/stats` | Neu in `packages/core/src/server.ts`: aggregiert `overall` (alle Jobs), `last24h` (Fenster) und `perJob` (eine Karte pro Job). |
| HTTP `/api/jobs/:id/stats` | Neu: per-Job-Sicht inkl. `lastRuns` (max 20, Query `?limit=N`). |
| API-Client-Erweiterung | `packages/web/src/lib/api.ts`: `api.stats.overall()` und `api.stats.job(id)` ergänzen, plus Typen in `packages/web/src/types.ts`. |
| Dashboard-Refactor | `packages/web/src/pages/Dashboard.tsx`: Histogramm → echter Time-Series-Area-Chart; `successRate` zeigt `—` bei null Daten; neue P95-Latency-Card; Fenster-Label wird explizit (`last 24 h`, mit Uhrzeit-Anker im Tooltip). |
| JobsPage-Erweiterung | `packages/web/src/pages/JobsPage.tsx`: pro Zeile Success-Rate-Badge, p95-Latenz-Cell und `<StatusStrip />` der letzten 20 Runs (Lazy-Load via `api.stats.job(id)`). |
| Neue Komponenten | `packages/web/src/components/StatusStrip.tsx` und `packages/web/src/components/TimeseriesChart.tsx`. |
| Timezone-Threading | Dashboard liest die Default-Zeitzone aus `Intl.DateTimeFormat().resolvedOptions().timeZone` (Browser) und propagiert sie in die Stat-Abfrage. Server-Default ist `Etc/UTC`. |
| Aria-Labels | `<StatusStrip />` trägt pro Zelle `aria-label="Run #N: <status> at <timestamp> (<duration ms>)"`. Reduzierte Animation respektiert `prefers-reduced-motion`. |
| Version-Bump | `0.3.0` → `0.4.0` in den fünf bekannten Stellen (siehe `tasks.md → T9`). |
| Bundle-Delta | ≤ 5 KB gzip Wachstum (geschätzt, siehe `design.md §5`). |
| Tests / Gates | Bestehende 63 `cronExpr.test.ts` bleiben grün. Typecheck (beide Pakete) bleibt grün. `scripts/smoke.ps1` bleibt grün. |

### Explicit out-of-scope (Nutzer kann jetzt widersprechen)

| Punkt | Begründung |
|---|---|
| **WebSocket / SSE für Live-Updates** | Würde die Dashboard-Architektur substanziell ändern (React-Subscription-Modell, Server-Push-Channel). Nächste Iteration; explizit auf die Follow-up-Liste gesetzt. |
| **Calendar-Heatmap der Run-Frequenz** | Visuell verlockend, aber für „see at a glance" überdimensioniert. Gehört in einen späteren Pro-Add-on-Change. |
| **MTTR und Schedule-Adherence** | Brauchen Semantik für „expected next run" + grace window. Eigener Folge-Change, weil das Verhalten mit User-Erwartungen an Schedule-Strenge verwoben ist. |
| **Anomalieerkennung / Alerting** | Eigenständiges Produkt-Feature mit Notification-Pfad. |
| **Multi-User / RBAC** | Cronboard ist local-first single-user. RBAC würde das gesamte Storage-Modell anfassen. |
| **DaisyUI / Tailwind-Ablösung** | Bereits in v0.3.0 abgeschlossen. |
| **Migration des `runs.json`-Storage-Formats** | Nicht nötig; die Aggregationen operieren auf der bestehenden `Run`-Shape. |
| **`openspec/config.yaml → project.version` Sync** | Beobachtung: steht seit v0.3.0-Redesign auf `0.3.0` (jetzt korrekt). Bump auf `0.4.0` ist hier enthalten, weil semantisch motiviert. |

---

## 5. Affected areas (read-only — `sdd-apply` modifiziert diese)

```
packages/core/src/stats/aggregations.ts           (NEU, ~120 Zeilen)
packages/core/src/stats/aggregations.test.ts      (NEU, strict TDD)
packages/core/src/server.ts                       (M — 2 neue Routes)
packages/core/src/cli.ts                          (M — Version "0.3.0" → "0.4.0", Zeile 28)
packages/web/src/lib/api.ts                       (M — api.stats namespace)
packages/web/src/types.ts                         (M — JobStats/OverallStats Interfaces)
packages/web/src/components/StatusStrip.tsx      (NEU)
packages/web/src/components/TimeseriesChart.tsx  (NEU)
packages/web/src/pages/Dashboard.tsx              (M — Refactor, Histogramm raus)
packages/web/src/pages/JobsPage.tsx               (M — Strip + Sparkline-Lazy-Load)
package.json                                      (M — version bump)
packages/web/package.json                         (M — version bump)
packages/core/package.json                        (M — version bump)
package-lock.json                                 (M — regeneriert nur falls indirekt nötig)
```

**Unverändert:** `openspec/config.yaml`, `AGENTS.md`, `bin/`, `scripts/`, `tsconfig*.json`, `docs/`, `README.md`. Storage-Format (`jobs.json`, `runs.json`) bleibt byte-identisch.

---

## 6. Risiken & Gegenmaßnahmen

| #   | Risiko | Wahrsch. | Impact | Gegenmaßnahme |
|-----|--------|---------:|-------:|---------------|
| R1  | Prozentil-Berechnung wählt „falsche" Methode (nearest-rank vs. linear-interp vs. midpoint) — Reviews widersprechen. | Mittel | Niedrig | In `design.md §1` ist **lineare Interpolation** festgelegt. Tests in S4 akzeptieren sowohl 950 als auch 1000 ms (innerhalb ±5 ms). Reviewer-Eskalation möglich, aber Meinungsentscheidung ist dokumentiert. |
| R2  | `runsByHour` rechnet mit einer Timezone, die zur Server-Uptime verschoben wird (DST-Wechsel). | Mittel | Mittel | Wir rechnen alle Bucket-Edges in **UTC-Millisekunden**, indem wir die TZ-Offset für den jeweiligen Wand-Uhrzeit-Punkt berechnen (`Intl.DateTimeFormat`-Trick oder `Temporal`-Polyfill, falls verfügbar). Test deckt DST-Sprung ab (z. B. März-Sonntag in `Europe/Berlin`). |
| R3  | `successRate`-Semantik verschiebt sich — Jobs, die vorher 100 % zeigten, zeigen jetzt `—`. | Hoch (sicher) | Niedrig | UX-gewollt. Success-Story: „Empty State ist explizit." Wir dokumentieren das in `design.md §6` und im Commit-Body. Keine Migration nötig. |
| R4  | Per-Job-`/api/jobs/:id/stats`-Requests erzeugen N+1-Queries pro JobsPage-Render, was bei vielen Jobs langsam wird. | Mittel | Mittel | (a) Lazy-Load mit IntersectionObserver oder nur sichtbare Rows, (b) optional Batch-Endpoint `/api/stats?include=perJob` für später, (c) Smoke misst Latenz bei 50 Jobs gegen „acceptable UI feel". Detail in `tasks.md → T7`. |
| R5  | Bundle-Size wächst über die 5 KB-gzip-Grenze, falls jemand „mal eben" eine kleine Chart-Bibliothek einbaut. | Mittel | Niedrig | Verboten — `<TimeseriesChart />` wird mit nativem SVG geschrieben (≤ 50 Zeilen). `design.md §5` enthält eine Code-Skizze. Kein neues npm-Paket. |
| R6  | Strict-TDD-Postur verlangt, dass die Tests **vor** der Implementierung grün → rot → grün laufen. Wenn `sdd-apply` das nicht befolgt, bricht `sdd-verify`. | Niedrig | Niedrig | `tasks.md → T1` listet die RED/GREEN-Reihenfolge explizit. `sdd-verify` kann den Test-Diff vs. Source-Diff prüfen. |
| R7  | `<StatusStrip />` ohne `lastRuns` rendert sichtbar leer und irritiert („Job noch nie gelaufen?"). | Niedrig | Niedrig | Leere Strips rendern 20 graue Boxen mit `aria-label="No runs yet"`. Visuell konsistent, signalisiert „existiert, aber leer". Detail in `design.md §3.1`. |
| R8  | Version-Bump von 0.3.0 auf 0.4.0 ist semantisch nicht-ganz-passend (keine API-Breaking-Change), aber kommunikativ nötig. | Niedrig | Sehr niedrig | Per Nutzer-Setzung („v0.4.0 that 'correctly' displays statistics") gerechtfertigt. Keine externe API, kein NPM-Publish. |

---

## 7. Rollback

Diese Änderung ist **rein additiv rückbaubar** in einer Schicht:

1. **Weich-Rollback** (ein `git revert`): `/api/stats` und `/api/jobs/:id/stats` verschwinden, Dashboard und JobsPage kehren zur alten Inline-Berechnung zurück, Versionsstrings zurück auf `0.3.0`. Keine Datenmigration, keine Schema-Änderung.
2. **Hart-Rollback (zusätzlich)**: `packages/core/src/stats/*` löschen — wird aber durch den Soft-Rollback bereits ungenutzt.

**Keine** Storage-Format-Änderung, **keine** Migrationsroutine, **keine** Lockfile-Änderung (außer falls T9 mit npm-Lifecycle interferiert; voraussichtlich nicht).

---

## 8. Entscheidungen ohne explizite Nutzernachfrage (bitte bestätigen oder überschreiben)

Der Parent-Briefing war sehr detailliert, aber an mehreren Stellen nicht eindeutig. Diese Punkte hat der Proposer entschieden — sie stehen alle zur Disposition:

| #   | Entscheidung | Begründung | Override-Pfad |
|-----|-------------|-----------|---------------|
| D1  | `successRate(zéro Runs)` → `null` (statt z. B. `NaN` oder `0`). | `null` ist in TS das idiomatische „no data"-Signal; `NaN` ist numerisch tückisch; `0` wäre eine neue Lüge („alles schlecht"). | `sdd-apply` darf auf `undefined` wechseln, falls Konsumenten das lieber mögen. |
| D2  | Perzentil-Methode: **lineare Interpolation** (TypeScript-Rounding-Helper aus `npm:simple-statistics` ist verboten — wir wollen null neue Deps). | Definiert, deterministisch, einfach zu testen, in S4 explizit toleriert (±5 ms). | Falls Reviewer nearest-rank bevorzugt: S4-Test entsprechend anpassen, beide Werte grün. |
| D3  | `summarizeRunDurations` schließt Runs ohne `durationMs` aus der Perzentil-Berechnung aus, meldet sie aber als `errored`. | `durationMs` ist optional — die meisten `running`- und Failed-Without-Duration-Einträge hätten sonst die Perzentile vergiftet. | Wenn alle Runs gezählt werden sollen: NaN-tolerant machen; aktuell nicht gewollt. |
| D4  | Dashboard holt `/api/stats` (server-berechnete Werte) statt client-seitig zu aggregieren. | Strict TDD, eine einzige Wahrheitsquelle, einfachere Tests. Der ursprüngliche Code rechnete clientseitig — der Parent schlug das auch als Option vor, ließ die Wahl aber offen. | Client-seitige Re-Aggregation ist trivial möglich (die Pure-Funktionen sind framework-frei), aber wir würden damit die `/api/stats`-Route entwerten. Empfehlung: **Server**. |
| D5  | Zeitzone-Default: Browser nutzt `Intl.DateTimeFormat().resolvedOptions().timeZone`, Server default `Etc/UTC`. Dashboard nutzt **Browser-Zeitzone**, nicht die Job-Timezone. | Heterogene Job-Timezones ergeben keinen sinnvollen „letzte 24 h"-Schnitt; die Browser-Local-TZ ist die ehrliche Aussage „aus Nutzersicht". | Aggregations-Funktion `runsByHour(runs, hours, tz)` nimmt TZ als Parameter, Jobs-Page-Stats könnten pro Job in der Job-TZ laufen — steht in `tasks.md → T7` als Option. |
| D6  | `<StatusStrip />` zeigt **20** Zellen (fest). | 20 ist die etablierte Cron-Monitor-Konvention (letzte 20 Runs). Konfigurierbarkeit ist YAGNI für v0.4.0. | Falls Reviewer 50 oder konfigurierbar will: trivial, kein API-Bruch nötig. |
| D7  | Default-Failure-Definition: wie heute (`failed` und `partial` zählen als Fail; `timeout` zählt **nicht**). | Parent hat die Definition nicht überschrieben; current behavior bleibt. | Falls `timeout` mitgezählt werden soll: `successRate` und das Tests-Setup entsprechend anpassen. Eine-Zeilen-Änderung in `aggregations.ts`. |
| D8  | Kein neues npm-Paket (kein `chart.js`, kein `simple-statistics`, kein `d3`). Alles wird mit nativem SVG + handgeschriebenen Helpern gebaut. | Schont das Bundle-Budget (≤ 5 KB gzip ist ohnehin nur ohne neue Deps erreichbar) und respektiert `daisyui-only` / `minimal-deps`-Praxis. | Falls Reviewer denkt, ein Mini-Lib wäre sauberer: explizit als Folge-Change. |
| D9  | Strict-TDD: Tests werden vor Implementierung geschrieben und der Test-Run muss **zuerst rot** sein. `tasks.md → T1` listet das explizit. | `strict_tdd: true` und `test-coverage-gap-disclosed` in `config.yaml`. | Falls Reviewer die Tests später nachreicht: `sdd-verify` muss das ablehnen. |
| D10 | Dashboard erhält **keine** `timezone`-Prop (Stand v0.3.0), sondern liest die Default-TZ intern aus `Intl.DateTimeFormat().resolvedOptions().timeZone`. **Eltern-Briefing war hier ungenau** (`"already passed to Dashboard as `timezone` prop — currently unused"`) — `App.tsx` reicht nur `onNavigate` durch. | Ehrlicher Stand; React-Prop-Threading durch `App.tsx` ist nicht nötig, da das Dashboard die Browser-TZ ohnehin hat. | Falls die User-TZ aus dem Settings-System kommen soll (kommt mit v0.5): `SettingsPage` legt den Wert ab, `App.tsx` reicht ihn durch. Für v0.4.0 belassen wir es bei der Browser-TZ. |

Siehe `design.md` für die technische Begründung jeder Entscheidung und `tasks.md` für die TDD-geordnete Schritt-für-Schritt-Liste.
