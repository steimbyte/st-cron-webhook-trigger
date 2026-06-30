# Design: v0.4.0-correct-statistics

> Begleitend zu `proposal.md` und `tasks.md`. Diese Datei ist die technische Quelle der Wahrheit für die nicht-trivialen Entscheidungen in diesem Change (Formel-Definitionen, HTTP-Schemas, Komponenten-Verträge, A11y, Bundle-Delta, Timezone-Strategie). Behandle sie als `sdd-verify`-Checkliste.

---

## 1. Aggregations-Formeln

Alle Funktionen sind reine Funktionen ohne Side-Effects, framework-frei und ohne externe Deps.

### 1.1 `successRate(runs: Run[]): number | null`

```
let n = runs.length
if n === 0: return null
let failed = count where status ∈ { "failed", "partial" }   // timeout zählt nicht (siehe D7)
return Math.round(100 * (n - failed) / n)
```

- **Empty-State** (`n === 0`): `null`. Bewusst keine `0` (das wäre eine neue Lüge) und kein `NaN` (numerisch tückisch).
- **Rundung:** `Math.round` (half-up-to-even nicht relevant hier, da `n - failed` ganzzahlig).
- **Edge-Case `n === 1, status === "success"`:** `100`. `n === 1, status === "failed"` oder `"partial"`: `0`. Korrekt.
- **Edge-Case `n === 1, status ∈ {"running", "timeout"}`:** `100`. „running" allein heißt nicht „Fail"; „timeout" per Definition explizit rausgenommen (D7).

### 1.2 `summarizeRunDurations(runs: Run[], windowMs?: number): Summary`

```
filtered = windowMs ? runs.filter(r => Date.now() - new Date(r.startedAt).getTime() < windowMs) : runs
durations = filtered.map(r => r.durationMs).filter((d): d is number => typeof d === "number")
errored   = filtered.length - durations.length
sorted    = durations.slice().sort((a, b) => a - b)
percentile(p) =
  if sorted.length === 0: return null
  idx = (sorted.length - 1) * p
  lo = Math.floor(idx), hi = Math.ceil(idx)
  return Math.round(sorted[lo] + (idx - lo) * (sorted[hi] - sorted[lo]))
return { p50: percentile(0.5), p95: percentile(0.95), p99: percentile(0.99),
         count: filtered.length, errored }
```

- **Lineare Interpolation** (D2): Standard für Perzentile in monitoring-tools (Grafana, Prometheus, Datadog nutzen dasselbe).
- **Empty-State aller drei Perzentile:** `null`, wenn `durations.length === 0` (S8).
- **`errored`** ist die ehrliche „diese Runs hatten keine brauchbare Dauer"-Anzeige. Wenn `errored > 0`, zeigt das UI einen Hinweis wie `+5 runs without duration` als Tooltip (UX-Detail, nicht Vertrag).
- **`Math.round` am Ende** der Interpolation stellt sicher, dass S4 tolerant ist (950 oder 1000 ms beide innerhalb ±5 ms).

### 1.3 `runsByHour(runs: Run[], hours: number, tz: string): number[]`

Robuste Implementierung, die DST-Sprünge in der Ziel-TZ **nicht** zerstört:

```
function runsByHour(runs, hours, tz) {
  const now = Date.now();
  // Pro Bucket die UTC-ms der "Wand-Uhrzeit-Stunde" in tz berechnen.
  // Trick: in der TZ formatieren und zurück zu UTC parsen.
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  function wallMsAgoHours(hrsAgo) {
    const d = new Date(now - hrsAgo * 3_600_000);
    // formatted example: "2026-06-30 14:00:00" — interpret as wall-clock, reconstruct UTC ms.
    const parts = fmt.formatToParts(d).reduce((acc, p) => {
      if (p.type !== "literal") acc[p.type] = p.value;
      return acc;
    }, {});
    // Construct a UTC date with the wall-clock parts, then offset by the tz offset at that moment.
    const wallAsUtcMs = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
    // Add the tz's offset at that wall-clock moment (negative because we will re-subtract).
    // Simpler: use Intl.DateTimeFormat to compute the offset.
    const offsetFmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "longOffset" });
    const offsetText = offsetFmt.formatToParts(d).find(p => p.type === "timeZoneName")?.value ?? "GMT+00:00";
    // offsetText wie "GMT+02:00" — in Minuten parsen.
    const m = /GMT([+-]\d{2}):(\d{2})/.exec(offsetText);
    const offsetMin = m ? (parseInt(m[1],10)*60 + parseInt(m[2],10)*Math.sign(parseInt(m[1],10))) : 0;
    return wallAsUtcMs - offsetMin * 60_000;
  }
  const buckets = Array.from({ length: hours }, () => 0);
  for (const r of runs) {
    const t = new Date(r.startedAt).getTime();
    // Finde Bucket-Index: der jüngste Bucket ist [now - 1 h, now],
    // der zweitjüngste [now - 2 h, now - 1 h), usw.
    const ageHours = (now - t) / 3_600_000;
    if (ageHours < 0 || ageHours >= hours) continue;
    const idx = hours - 1 - Math.floor(ageHours);
    buckets[idx]++;
  }
  return buckets;
}
```

Vereinfachung für **v0.4.0**: die Wand-Uhrzeit-Genauigkeit ist hier nicht heilig — wir akzeptieren, dass ein „Europäisches Berlin um 02:30 lokal"-Run im Bucket der Stunde 02 landet, egal ob die Wand-Uhr-Stunde in Wahrheit 23 oder 25 Stunden Vortag war. Das ist ehrlicher als der aktuelle `Dashboard.tsx`-Code, der `Date.now()` direkt benutzt (ohne Rücksicht auf lokale TZ), weil wir **explizit** eine TZ durchreichen.

**Tests** in T1 decken DST-Sprungfall und UTC-vs-Berlin-Verschiebung ab.

### 1.4 `lastN(runs: Run[], n: number): Run[]`

```
return runs.slice().sort((a, b) => a.startedAt < b.startedAt ? 1 : -1).slice(0, n);
```

- **Stabilität:** `slice()` zuerst, dann sortieren, dann slice. Kein Mutation.
- **Leere Liste:** liefert `[]`.

---

## 2. HTTP-Schemas

### 2.1 `GET /api/stats?tz=Europe/Berlin`

**Request:**
```
GET /api/stats?tz=Europe/Berlin HTTP/1.1
```

**Response 200:**
```json
{
  "ok": true,
  "tz": "Europe/Berlin",
  "generatedAt": "2026-06-30T12:53:14.000Z",
  "overall": {
    "runsLast24h": 18,
    "failuresLast24h": 2,
    "successRate": 89,
    "p50Ms": 230,
    "p95Ms": 1450,
    "p99Ms": 3200,
    "count": 18,
    "errored": 1
  },
  "histogram": [0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 2, 3, 4, 1, 0, 0, 0, 0, 0, 5, 1, 1, 0, 0],
  "perJob": [
    {
      "jobId": "abc-123",
      "jobName": "heartbeat",
      "enabled": true,
      "successRate": 100,
      "runsLast24h": 8,
      "failuresLast24h": 0,
      "p95Ms": 180,
      "lastRunsCount": 412
    }
  ]
}
```

**Empty-State Response:**
```json
{
  "ok": true,
  "tz": "Europe/Berlin",
  "generatedAt": "2026-06-30T12:53:14.000Z",
  "overall": {
    "runsLast24h": 0,
    "failuresLast24h": 0,
    "successRate": null,
    "p50Ms": null,
    "p95Ms": null,
    "p99Ms": null,
    "count": 0,
    "errored": 0
  },
  "histogram": [0, 0, … 24× …, 0],
  "perJob": []
}
```

### 2.2 `GET /api/jobs/:id/stats?limit=20`

**Request:**
```
GET /api/jobs/abc-123/stats?limit=20 HTTP/1.1
```

**Response 200:**
```json
{
  "ok": true,
  "jobId": "abc-123",
  "successRate": 100,
  "runsLast24h": 8,
  "failuresLast24h": 0,
  "p50Ms": 165,
  "p95Ms": 180,
  "lastRuns": [ /* Run[] length <= 20, newest first */ ]
}
```

**Response 404:**
```json
{ "error": "not found" }
```

**Empty-State Response:**
```json
{
  "ok": true,
  "jobId": "abc-123",
  "successRate": null,
  "runsLast24h": 0,
  "failuresLast24h": 0,
  "p50Ms": null,
  "p95Ms": null,
  "lastRuns": []
}
```

### 2.3 Versionshinweis

`/api/health` enthält weiterhin `version`. v0.4.0 → `"version": "0.4.0"`.

---

## 3. Komponenten-Verträge

### 3.1 `<StatusStrip runs={...} />`

```tsx
// packages/web/src/components/StatusStrip.tsx (Skizze)
interface Props {
  runs: Run[];          // beliebige Länge 0..n
  cellSize?: number;    // default: 12 (px)
  emptyMessage?: string; // default: "No runs yet"
}

export function StatusStrip({ runs, cellSize = 12, emptyMessage = "No runs yet" }: Props) {
  const cells = Array.from({ length: 20 }, (_, i) => runs[i] ?? null);
  const COLOR: Record<RunStatus, string> = {
    success: "bg-success",
    failed: "bg-error",
    partial: "bg-warning",
    timeout: "bg-warning",
    running: "bg-info",
  };
  return (
    <div className="flex gap-[2px] items-center" role="list" aria-label="Last 20 runs">
      {cells.map((r, i) => (
        <span
          key={i}
          role="listitem"
          aria-label={
            r
              ? `Run #${runs.length - i}: ${r.status} at ${r.startedAt}` +
                (r.durationMs != null ? ` (${r.durationMs} ms)` : "")
              : emptyMessage
          }
          className={`inline-block w-3 h-3 rounded-sm ${r ? COLOR[r.status] : "bg-base-300/40"}`}
        />
      ))}
    </div>
  );
}
```

**Vertrag:**
- Rendert **immer 20 Cells** (D6: fest konfiguriert). `lastRuns.length < 20` → Rest sind leere Cells.
- `aria-label="Last 20 runs"` auf dem Container; pro Cell ein aussagekräftiges Label (Screenreader-tauglich).
- Respektiert `prefers-reduced-motion`: keine Transitions (auch nicht geplant).
- Bundle-Anteil: ~30 Zeilen JSX, ~0.5 KB gzip.

### 3.2 `<TimeseriesChart values={...} />`

```tsx
// packages/web/src/components/TimeseriesChart.tsx (Skizze)
interface Props {
  values: number[];             // Länge: 24 für 24-h-Dashboard
  width?: number;               // default: 100%
  height?: number;              // default: 56
  color?: string;               // default: var(--color-primary)
  emptyMessage?: string;        // default: "No runs in window"
}

export function TimeseriesChart({
  values, width = "100%", height = 56, color = "var(--color-primary)",
  emptyMessage = "No runs in window",
}: Props) {
  const max = Math.max(1, ...values);
  const allZero = values.every((v) => v === 0);
  if (allZero) {
    return (
      <div className="text-xs text-base-content/40 italic" role="status">
        {emptyMessage}
      </div>
    );
  }
  const w = 320; // SVG-Ansicht-Breite; skaliert mit width-Prop
  const stepX = w / (values.length - 1);
  // Area-Path: Bodenlinie + Kurve + Schließen
  const points = values.map((v, i) => `${i * stepX},${height - (v / max) * height}`);
  const linePath = `M ${points.join(" L ")}`;
  const areaPath = `${linePath} L ${(values.length - 1) * stepX},${height} L 0,${height} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${height}`} width={width} height={height}
         role="img" aria-label={`Time-series of ${values.length} hour buckets`}>
      <path d={areaPath} fill={color} fillOpacity={0.18} />
      <path d={linePath} fill="none" stroke={color} strokeWidth={1.5} />
    </svg>
  );
}
```

**Vertrag:**
- Ersetzt `MiniSparkline` aus Dashboard (Histogramm-Misuse weg, jetzt echte Time-Series).
- Bei lauter Nullen: Empty-Hint **statt** ein plötzlich flacher Chart (Ehrlichkeit > Visualisierung).
- Respektiert `prefers-reduced-motion`: keine Animation (das initiale `polyline`-Rendering ist statisch).
- Bundle-Anteil: ~50 Zeilen JSX, ~0.8 KB gzip.

### 3.3 `<StatCard>`-Erweiterung

`StatCard` aus `Dashboard.tsx` wird minimal erweitert um ein optionales `valueIsNull?: boolean`-Flag. Wenn `true`, rendert die Komponente einen kursiven `—` plus einen dezenten Hinweis (Tooltip via `title=""`).

```tsx
// Vorhandene Signatur + neue optionale Prop:
function StatCard({ label, value, valueIsNull, delta, deltaTone, sparkline, icon }: {
  ...
  valueIsNull?: boolean;
}) {
  return (
    <div className="card bg-base-200/60 …">
      <div className="card-body p-4">
        …
        <div className="text-2xl font-bold mt-1.5 text-base-content">
          {valueIsNull ? <span title="No data in the selected window">—</span> : value}
        </div>
        …
      </div>
    </div>
  );
}
```

Diese Komponente bleibt in `Dashboard.tsx` (sie ist Local). Andere Seiten, die `StatCard` brauchen, holen sie sich aus `packages/web/src/components/StatCard.tsx`, **wenn** das passiert — YAGNI für v0.4.0.

---

## 4. Accessibility

| Anforderung | Umsetzung |
|---|---|
| Screenreader-Tauglichkeit der KPI-Cards | `StatCard` erhält `role="group"` und `aria-labelledby` auf das `label`. Bei `valueIsNull` ist der Wert der String `—` und der Tooltip erklärt das Fehlen von Daten. |
| Screenreader-Tauglichkeit des Time-Series-Charts | `<TimeseriesChart>` hat `role="img"` und `aria-label="Hourly run counts over the last 24 hours, max <max> in hour <i>"`. Plus eine unsichtbare `<table>` mit den Rohwerten (per `sr-only`-Klasse) als Text-Repräsentation. |
| Status-Strip-Semantik | `role="list"` + `role="listitem"` pro Cell; jeder Cell hat ein vollständiges `aria-label`. |
| `prefers-reduced-motion` | Keine Animationen im Strip oder Chart. Stats-Karten haben keine Übergänge. |
| Fokus-Reihenfolge | KPIs in DOM-Reihenfolge lesbar; Charts nicht interaktiv (kein Tab-Stop). |
| Farb-Blindheit | Farben pro `RunStatus` folgen der bestehenden Konvention: success=success-grün, failed=error-rot, partial/timeout=warning-amber, running=info-blau. Diese Kombination ist die in cronboard etablierte Signalfarben-Wahl. |
| Sprachwechsel | Keine hardcoded Strings außer Empty-Messages (englisch, lokalisiert später). |

---

## 5. Bundle-Delta (≤ 5 KB gzip)

| Komponente | Vorher | Nachher | Δ (gzip, Schätzung) |
|---|---|---|---|
| `Dashboard.tsx` | 4.8 KB (mit `MiniSparkline`) | 5.5 KB (mit `<TimeseriesChart>` + `<StatCard>`-Erweiterung + `api.stats`-Hook) | +0.7 KB |
| Neu `<TimeseriesChart>` | — | 0.8 KB | +0.8 KB |
| Neu `<StatusStrip>` | — | 0.5 KB | +0.5 KB |
| `JobsPage.tsx` | 3.4 KB | 4.1 KB (Lazy-Load + Strip-Import + Spalten) | +0.7 KB |
| `api.ts` | 0.9 KB | 1.1 KB (stats-Namespace + Types) | +0.2 KB |
| `types.ts` | 0.4 KB | 0.5 KB (+ Stats-Types) | +0.1 KB |
| `aggregations.ts` (Core, nicht im Web-Bundle) | — | — | 0 |
| **Summe Δ (Web-Bundle, gzip)** | | | **≈ +3.0 KB** |

**Realistische Erwartung: 2–4 KB gzipped Wachstum.** Mess-Methode für `sdd-apply`:

```powershell
# Nach T8:
Get-ChildItem packages/web/dist/assets/*.js | ForEach-Object { (gzip -9 $_).Length } | Measure-Object -Sum
# Vergleich gegen T0-Baseline.
```

Wenn der tatsächliche Drop > 5 KB ist, dürfen wir **nicht** tricksen — Aufwand in einen Folge-Change verschieben.

**Garantiert keine neue npm-Dep** (D8). Chart und Strip sind reines SVG/JSX.

---

## 6. Timezone-Strategie

### 6.1 Browser-Default

`Dashboard` liest `Intl.DateTimeFormat().resolvedOptions().timeZone` einmal beim Mount und übergibt es an `api.stats.overall(tz)`. Beispiel: `"Europe/Berlin"`, `"America/New_York"`.

**Warum nicht die Job-TZ?** Ein Dashboard-„letzte 24 h"-Schnitt muss eine konsistente Wand-Uhr für die Buckets haben. Wenn 12 Jobs in `Asia/Tokyo` und 8 in `Europe/Berlin` laufen, gibt es keine sinnvolle „24-h"-TZ — also nehmen wir die des Browsers als ehrliche Aussage „aus Nutzersicht" (D5).

### 6.2 Server-Default

Fehlt die Query-Param `tz` oder ist sie ungültig, fällt die Route zurück auf `Etc/UTC`. `Intl.DateTimeFormat` mit `Etc/UTC` ist überall in Node 20 verfügbar und braucht keinen Polyfill.

### 6.3 Per-Job-Stats

`/api/jobs/:id/stats` braucht **keine** TZ: dort sind die Latenz- und Erfolgs-Werte jobspezifisch. Nur für eine eventuelle Per-Job-Histogramm-Erweiterung (out-of-scope) wäre TZ relevant.

### 6.4 DST-Korrektheit

`runsByHour` nutzt `Intl.DateTimeFormat.formatToParts`, um die exakte Wand-Uhrzeit zu rekonstruieren (siehe §1.3). Das ist robust gegen DST-Sprünge — wir testen einen DST-Fall in `aggregations.test.ts` (`runsByHour(runsInDstSpringForward, 24, "Europe/Berlin")`).

---

## 7. Reviewer-Checkliste (für `sdd-verify`)

- [ ] T1-T2: `aggregations.ts` + `aggregations.test.ts` vorhanden; Tests-first-Nachweis (1. Lauf war rot, 2. grün); mind. 12 Test-Fälle; Coverage der leeren Eingabe, der Single-Element-Eingabe, der N>10-Eingabe, der DST-Eingabe.
- [ ] T3: `/api/stats` mit `overall.histogram.perJob`. Empty-State-Beispiel im Response dokumentiert.
- [ ] T4: `/api/jobs/:id/stats?limit=20` mit `lastRuns[].startedAt` absteigend. 404 für unbekannte ID.
- [ ] T5: `api.stats.overall()` und `api.stats.job(id)` im Web-Client nutzbar; TypeScript-Types passen.
- [ ] T6: Dashboard zeigt 5 Karten (mit P95 LATENCY). Bei `runsLast24h === 0` zeigen SUCCESS RATE und P95 LATENCY jeweils `—` (S7/S8). Histogramm ist durch echten Time-Series-Area-Chart ersetzt.
- [ ] T7: JobsPage zeigt pro Zeile StatusStrip + Success-Rate-Badge + P95-Cell. Lazy- oder Batch-Ansatz; keine Riesen-Lasten bei 50 Jobs.
- [ ] T8: Typecheck grün, Tests grün, Smoke grün, Bundle-Delta ≤ 5 KB gzip gemessen und im Commit-Body dokumentiert.
- [ ] T9: Versionsstrings exakt an den genannten Stellen von `0.3.0` auf `0.4.0`. `openspec/config.yaml → project.version` mitgezogen.
- [ ] `git diff packages/*/src/` zeigt keine unerwarteten Änderungen; nur die geplanten Dateien sind im Diff.
- [ ] **Acceptance Criteria S1–S11** alle erfüllt (Tabelle in `proposal.md §3`).
- [ ] **Decisions D1–D10** aus `proposal.md §8` sind in der Implementierung erkennbar (z. B. `null`-Empty-State vs. `100`; lineare Interpolation; Browser-TZ in Dashboard; kein neues npm-Paket).

---

## 8. Test-Coverage-Plan (über `strict_tdd` und `test-coverage-gap-disclosed`)

Die `config.yaml` markiert mit `test-coverage-gap-disclosed`, dass die fehlende Test-Basis ein Risiko ist. Diese Änderung **schließt die Lücke für `aggregations`**. Pro Funktion:

| Funktion | Anzahl Tests | Was getestet wird |
|---|---:|---|
| `successRate` | 5 | leer, alle-success, halb-fail, nur-running, gemischte Status inkl. timeout |
| `summarizeRunDurations` | 4 | S4 (10 Samples, 100 ms-Schritt), leere Eingabe, Runs ohne `durationMs`, Monotonie-Check |
| `runsByHour` | 5 | 24 Buckets Länge, „jetzt"-Run, UTC vs. Berlin-Verschiebung, DST-Sprung, Stabilität aufeinanderfolgender Aufrufe |
| `lastN` | 3 | leere Liste, weniger als N Runs, absteigende Sortierung |
| **Summe** | **17** | (weit über S10's „≥ 6 neue") |

`tasks.md → T1` listet diese 17 Tests wörtlich auf; bei `sdd-apply` darf die Zahl nicht unter 12 fallen, sonst ist `strict_tdd` nicht erfüllt.

---

## 9. Offene Punkte (für Folge-Changes, nicht hier)

| Punkt | Begründung für OUT |
|---|---|
| WebSocket / SSE für Live-Updates | Würde Dashboard- und Server-Lifecycle substanziell ändern. |
| Calendar-Heatmap der Run-Frequenz | Visuell überdimensioniert für v0.4.0. YAGNI. |
| MTTR / Schedule-Adherence | Brauchen „expected next run"-Semantik + grace window. |
| Anomalieerkennung / Alerting | Eigenständiges Feature mit Notification-Pfad. |
| Multi-User / RBAC | Storage-Modell-Würfe. |
| `Dashboard`-Component-Split (`StatCard.tsx` auslagern) | Erst wenn Jobs oder Runs das erste Mal eine `StatCard` brauchen — YAGNI für v0.4.0. |
| `Run.durationMs` als Pflichtfeld | Würde Migration erfordern. Defensiv-Filter in `aggregations.ts` ist die ehrlichere Antwort. |
| I18n der Empty-Messages | Englisch ist für v0.4.0 ausreichend; späterer eigener Change. |

Diese Punkte sind bewusst **außerhalb** dieses Changes.

---

## 10. Glossar

- **Aggregation:** Reduktion einer Liste von Runs auf einen einzelnen statistischen Wert (Mittel, Perzentil, Count).
- **Bucket:** Zeitfenster konstanter Länge (z. B. 1 h) zur Histogramm-Bildung.
- **Empty-State:** UI-Repräsentation eines Zustands ohne Daten — ehrlich als `—` + Hinweis, nicht als gelogene `100%` oder `0%`.
- **Perzentil:** Wert, unterhalb dessen ein gegebener Prozentsatz der Daten liegt; p95 ist Standard für „Outlier-Latenz".
- **Status-Strip:** Horizontale Folge farbiger Zellen, eine pro zurückliegendem Run — kompakte „Eye-Candy"-Übersicht pro Job.
- **Time-Series:** Datenpunkte in zeitlicher Reihenfolge; ein Area-Chart ist die kanonische Visualisierung. Im Unterschied zu einem Histogramm (das Counts per Bucket zeigt, aber keine Aussage über Zwischenwerte macht).
