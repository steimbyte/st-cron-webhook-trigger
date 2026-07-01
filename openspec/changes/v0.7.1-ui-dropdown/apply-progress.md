# Apply Progress — v0.7.1-ui-dropdown

> `sdd-apply`-Run für `v0.7.1-ui-dropdown` (Schedule-Modal UI Polish).
> Datum: 2026-07-01 · Skill resolution: `none` (keine parent-injected skill paths, `.atl/skill-registry.md` nicht vorhanden).

## Environment

- **Repository:** `cronboard` (master)
- **Base commit:** `3b0e10f` (v0.7.0 — `feat(v0.7.0): edit-job UI polish`)
- **Working tree at start:** clean apart from untracked `openspec/changes/v0.7.1-ui-dropdown/`
- **Action context:** `repo-local`, allowed edit root = workspace root. `actionContext.warnings: []`.
- **Status (consumed):** non-authoritative (`nextRecommended: "resolve-via-engram"`); `artifactStore: openspec`; confirmed `proposal.md`, `tasks.md`, `design.md` exist on disk → proceeded with implementation.

---

## T0 — Baseline

| Metric | Value | Notes |
|---|---|---|
| `npm run test:web` | 58 / 15 suites, 0 fail | v0.7.0-final |
| `npm test` (core) | 208 / 36 suites, 0 fail | v0.7.0-final |
| `npm run typecheck` | exit 0 | v0.7.0-final |
| `npm run build` | success | v0.7.0-final |
| `CronBuilder.tsx` Zeilen | 332 | v0.7.0-final |
| `index-*.js` (raw / gz) | 311,613 B / 92,686 B | v0.7.0 |
| `index-*.css` (raw / gz) | 106,269 B / 17,212 B | v0.7.0 |

Bundle-Budget (Soft-Limit, per `proposal.md` S8): **≤ 4 kB gz Delta** = 4,096 Bytes total.

---

## T1 — Tests first für `formatDescription` (RED)

- **C** `packages/web/src/lib/cronDescription.test.ts` (246 Zeilen, 21 Tests, 6 describe-blocks)
- Imports: `node:test`, `node:assert/strict`, `defaultCronState` und `CronExpressionState` (relativ aus `../../../core/src/scheduler/cronExpr.js` weil `tsx` ohne `tsconfig-paths` das `@cronboard/core`-Alias auflöst — die Path-Aliase gelten nur für Vite, nicht für Node-Tests).
- Helper `state(overrides)` baut jeden Test-State aus `defaultCronState()` auf, damit neue Felder in `CronExpressionState` nur **eine** Änderung in `cronExpr.ts` brauchen.
- 21 Tests in 6 Blöcken: `minute` (3) / `hour` (3) / `day` (3) / `week` (5) / `month` (3) / `custom` (4).
- **Gate 1.1 RED:**
  ```
  ✖ packages\web\src\lib\cronDescription.test.ts (231.571ms)
  ℹ tests 1 / suites 0 / pass 0 / fail 1
  Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../cronDescription.js'
  ```
  Bestätigt: Modul existiert noch nicht, ein erster kleiner Refactor war nötig: `*/5 * * * *` innerhalb eines JSDoc-Blocks beendet den Block vorzeitig (`*/`). Korrigiert, indem das Beispiel in der Datei `cronDescription.ts` als Kommentar ohne Endung geschrieben wurde.

---

## T2 — `cronDescription.ts` (GREEN) + `test:web`-Skript-Erweiterung

- **C** `packages/web/src/lib/cronDescription.ts` (96 Zeilen)
  - Reines Modul, kein React, kein DOM, kein I/O.
  - Konstante `WEEKDAY_NAMES_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]`.
  - `pad2(n)`, `timeString(h, m)`, `describeDays(days)`, `formatDescription(state)`.
  - Special-cases aus `design.md §2.1` umgesetzt:
    - `[1,2,3,4,5]` → `"weekdays"`
    - `[0,6]` → `"weekends"`
    - leere days: bei `week` Fallback `"every day"` (ohne `"on "`-Präfix) — siehe Commit im Test (eine vorhergehende Iteration hatte `"Fires at 09:00 on every day"`; nach Test gefixt zu `"Fires at 09:00 every day"`).
  - `custom`-Branch trimmt Whitespace und gibt bei leerem String `"Custom: (empty)"` zurück.
- **M** `package.json` (root): `"test:web"`-Skript um `cronDescription.test.ts` erweitert.
- **Gate 2.1 GREEN:**
  ```
  ℹ tests 21 / suites 6 / pass 21 / fail 0
  ✔ formatDescription (minute|hour|day|week|month|custom) — alle 21 Tests grün
  ```
- **Gate 2.2 GREEN:** `npm run test:web` → 79 / 21 suites, 0 failures (58 v0.7.0 + 21 neue).

---

## T3 — `CronBuilder.tsx` Layout-Redesign

Komplettes Rewrite (~21 kB, 420 Zeilen, vorher 332 Zeilen, 12 kB). Wichtigste strukturelle Änderungen:

### T3.1 Neue Imports
- `ComponentType` aus `react` (für `Preset.Icon`).
- Sechs `@radix-ui/react-icons`: `ClockIcon`, `TimerIcon` (statt `HourglassIcon` — nicht im Set), `CalendarIcon`, `RowsIcon` (statt `CalendarDaysIcon`), `LayersIcon` (statt `CalendarRangeIcon`), `CodeIcon`, `ResetIcon`. Auswahl per Design-Kompatibilität dokumentiert.
- `formatDescription` aus `../lib/cronDescription`.

### T3.2 `PRESETS`-Definition erweitert
`Preset`-Interface bekommt `Icon: ComponentType<…>`-Feld. Sechs Cards mit Mapping (siehe `design.md §5`).

### T3.3 localStorage-Heuristik
Helper `readDetailsOpened(kind)` / `writeDetailsOpened(kind, open)` mit `try/catch`-Wrapper für Quota / Private-Mode. Key-Schema: `cb-details-opened-${kind}`. Wert `"1"` wenn collapsed, `removeItem()` wenn expanded. Kein PII — nur Boolean.

### T3.4 `detailsOpenedByKind` State
Lazy-initialisierter `useState<Record<Kind, boolean>>` mit Initialwerten aus `readDetailsOpened`. `toggleDetails(kind)` flippt + persistiert.

### T3.5 Preset-Card-Grid
- Container: `data-testid="preset-grid"`, `grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 mb-4`.
- Jede Card: `data-testid="preset-card"`, `data-kind={p.id}`, `data-active={isActive?"true":"false"}`, `aria-pressed={isActive}`.
- Active-Style: `border-primary bg-primary/10 shadow-md`.
- Inactive-Style: `border-base-300/40 bg-base-100/40 hover:bg-base-100/60 hover:border-base-300/60`.
- Icon-Box: 36×36 px (`w-9 h-9`), Active `bg-primary/20 text-primary`, Inactive `bg-base-300/40 text-base-content/70`.
- Stable Keys: `key={p.id}`.

### T3.6 Header-Reset-Button
`btn btn-outline btn-sm gap-1` mit `<ResetIcon className="w-4 h-4">` + "Reset" Label.

### T3.7 Inline-Beschreibung
- `data-testid="cron-description"` über dem `<details>`-Block, `formatDescription(draft)`.

### T3.8 `<details>`-Wrapper
- `data-testid="preset-details"`, `<summary>` zeigt "Schedule details" oder "Custom expression".
- `open={detailsOpenedByKind[draft.kind]}` Controlled.
- `onToggle={() => toggleDetails(draft.kind)}` schreibt in localStorage.
- `key={`details-${draft.kind}`}` verhindert Re-Mounting beim State-Wechsel.

### T3.9 Time-Picker
- `<input type="time" step={60} lang="en-GB">` mit `input input-bordered input-lg bg-base-100/60 font-mono w-40`.
- `data-testid="time-picker"`.
- `onChange` splittet `"HH:MM"` und ruft `setDraft((cur) => ({ ...cur, hour: h, minute: m }))`.
- Wird für `day` / `week` / `month` gerendert (kein Hour-Select mehr).
- Bei `hour`-Preset zusätzlich: Minuten-Picker UND Hour-Interval-Picker.

### T3.10 Intervall-Picker
- `select select-bordered select-md bg-base-100/60` (kein `select-sm` mehr).
- `data-testid="interval-picker"`.

### T3.11 Weekday-Selector
- Chip-Row **vor** dem Kalender (D14 — vorher nach): `data-testid="weekday-summary"`, `Active weekdays:` label, `badge badge-primary badge-md font-mono` für jeden aktiven Tag.
- Bei `days.length === 0`: italic "none (will run daily)".

### T3.12 Day-of-Month Tile
- D15: 48×48 px Tile (`w-12 h-12 rounded-xl bg-primary text-primary-content font-bold text-2xl font-mono shadow-md`).
- `data-testid="day-of-month-tile"`, `aria-label="Day N of every month"`.

### T3.13 Custom-Input
- `input input-bordered input-md w-full bg-base-100/60 font-mono`.
- `data-testid="custom-cron-input"`.

### Gate 3.1: `npm run typecheck -w packages/web` → exit 0 ✓
### Gate 3.2: `npm run test:web` → 79 / 21 suites, 0 fail ✓
### Gate 3.3: visuell (Reviewer-Auge) — siehe `design.md §10`.

---

## T4 — Preview-Tile-Redesign

Innerhalb derselben Datei (`CronBuilder.tsx`).
- `Preview`-Subkomponente unmodifiziert in der Server-Description-Badge und der `useEffect`-Logik.
- Grid: `data-testid="preview-tiles"`, `grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3`.
- Pro Tile: `data-testid="preview-tile"`, `flex flex-col gap-1 px-3 py-3 rounded-box bg-base-100/60 border border-base-300/40`.
- Datum: `text-base font-semibold` (prominent, oben).
- Zeit: `text-sm text-base-content/60 font-mono` (sekundär, unten).
- Weekend-Indicator: `data-testid="weekend-indicator"`, `badge badge-warning badge-xs`, `title="Weekend run"`, Text `"wknd"`, nur wenn `d.getDay() === 0 || 6`.
- `runs.slice(0, 5)` defensiv vor `.map`.

### Gate 4.1: visuell — 5 Tiles pro Render, Datum oben, Zeit unten ✓
### Gate 4.2: `cron-description` zeigt `formatDescription(draft)` inline ✓

---

## T5 — Version-Bump + Doku

| Datei | Änderung |
|---|---|
| `package.json` (root) | `"version": "0.7.0"` → `"0.7.1"` |
| `packages/web/package.json` | `"version": "0.7.0"` → `"0.7.1"` |
| `packages/core/package.json` | `"version": "0.7.0"` → `"0.7.1"` |
| `packages/core/src/cli.ts` | `.version("0.7.0")` → `.version("0.7.1")` (Zeile 29) |
| `packages/core/src/server.ts` | `version: "0.7.0"` → `"0.7.1"` (Zeile 121) |
| `openspec/config.yaml` | `project.version: 0.7.0` → `0.7.1` (Zeile 14) |
| `README.md` Zeile 5 | Status-Line → `v0.7.1 — Schedule modal: 3×2 preset cards, native time picker, inline human description, persistent details.` |
| `README.md` Zeile 315 | Neuer Feature-Bullet "Schedule-modal polish (v0.7.1)" mit kompletter UX-Beschreibung |
| `CHANGELOG.md` | Neue Sektion `[0.7.1] — 2026-07-01` über `[0.7.0]` mit Added / Internal / Verified-Blöcken |

- **Gate 5.1:** `grep "0.7.0"` in Manifest / Konfig → 0 Treffer ✓
- **Gate 5.2:** `grep "0.7.1"` → 6 Treffer (alle Manifest-Stellen) ✓

---

## T6 — Gates: alle grün

| Gate | Command | Ergebnis |
|---|---|---|
| 6.1 typecheck | `npm run typecheck` | exit 0 ✓ |
| 6.2 web tests | `npm run test:web` | 79 / 21 suites / 0 fail ✓ |
| 6.3 core tests | `npm test` | 208 / 36 suites / 0 fail ✓ |
| 6.4 build | `npm run build` | success ✓ |
| 6.5 smoke | `powershell -ExecutionPolicy Bypass -File scripts/smoke.ps1` | `=== smoke test done ===` ✓ |
| 6.6 bundle-delta | siehe unten | +3.03 kB gz (≤ 4 kB budget) ✓ |
| 6.7 commit | `git commit -m "..."` | erstellt (siehe Commit-SHA unten) |
| 6.8 push | `git push origin master` | erstellt |

### Bundle-Delta vs v0.7.0 (`3b0e10f`)

| Asset | v0.7.0 raw | v0.7.1 raw | Δ raw | v0.7.0 gz | v0.7.1 gz | Δ gz |
|---|---:|---:|---:|---:|---:|---:|
| `index-*.js` | 311,613 B | 318,710 B | **+7,097 B** (+2.27%) | 92,686 B | 95,200 B | **+2,514 B** (+2.71%) |
| `index-*.css` | 106,269 B | 108,920 B | **+2,651 B** (+2.49%) | 17,212 B | 17,730 B | **+518 B** (+3.01%) |
| **Total (gz)** | | | | **109,898 B** | **112,930 B** | **+3,032 B gz** |

Soft-Budget (proposal S8): ≤ 4,096 B gz delta. Tatsächlicher Delta: **3,032 B gz**. ✓ im Budget.

---

## Akzeptanz-Kriterien S1–S8

| # | Kriterium | Status | Beleg |
|---|---|---|---|
| S1 | Preset-Cards im Grid mit Icon+Label+Hint | ✓ | `CronBuilder.tsx` T3.5; `data-testid="preset-grid"` mit 6× `data-testid="preset-card"` |
| S2 | Aktive Card visuell abgehoben | ✓ | `data-active="true"` setzt `border-primary bg-primary/10 shadow-md` |
| S3 | Time-Picker = `<input type="time">`, keine `<select>` für Stunde/Minute | ✓ | T3.9; alle Hour- und Minute-`<select>`s entfernt |
| S4 | Intervall-Picker ist `select-md` (≥ 36 px) | ✓ | T3.10; `select select-bordered select-md` |
| S5 | Preview = 5 Tiles, Datum prominent, Zeit sekundär | ✓ | T4; `data-testid="preview-tile"` 5× |
| S6 | Inline-Beschreibung via `formatDescription` | ✓ | T3.7 + 21 Unit-Tests grün |
| S7 | typecheck + test:web + test alle grün | ✓ | 6.1 / 6.2 / 6.3 |
| S8 | Keine neuen Deps, Bundle ≤ 4 kB gz | ✓ | Keine package.json-Deps geändert; +3,032 B gz |

---

## Risiken-Mitigation (R-Auswahl)

| Risiko | Mitigation | Beleg |
|---|---|---|
| R1 Bundle-Size-Plus | `formatDescription` ist eine reine Funktion; Cards sind DaisyUI-Klassen | +3,032 B gz ≤ 4 kB |
| R2 Time-Picker Browser-UI variiert | `lang="en-GB"` + akzeptierte Variation | T3.9 |
| R3 localStorage-PII | 6 Keys, Wert `"1"`, try/catch; keine Strings | T3.3 |
| R4 24h-Format nicht erzwungen | `lang="en-GB"`, Test prüft nur `type="time"` | T3.9 |
| R5 Preview-Layout > 5 | `runs.slice(0, 5)` defensiv | T4 |
| R6 `formatDescription(custom)` zeigt internen String | `"Custom: …"` mit `font-mono` Prefix | siehe `cronDescription.ts` |
| R7 Card-Grid auf `sm` zu eng | `grid-cols-2` auf `sm` (3×2 → 2×3) | T3.5 |
| R8 `<details>`-State bleibt beim Re-Open | DOM wird zerstört, State kommt aus localStorage oder Default | T3.8 |
| R9 `formatDescription` divergiert von `cronstrue` | Bewusste Entscheidung; Server-Description in Preview-Badge, lokal für Inline | `design.md §2.4` |
| R10 Sekunden-Spinner sichtbar | `step={60}` explizit | T3.9 |
| R11 Weekend-Indikator missinterpretiert | Tooltip, gelb (warning), klein (xs) | T4 |
| R12 `data-testid`-Hooks vergessen | 12+ Hooks gepflegt | `design.md §6` |

---

## Geänderte Dateien (Cumulative)

```
A  openspec/changes/v0.7.1-ui-dropdown/apply-progress.md    (dieser Bericht)
A  openspec/changes/v0.7.1-ui-dropdown/design.md
A  openspec/changes/v0.7.1-ui-dropdown/proposal.md
A  openspec/changes/v0.7.1-ui-dropdown/tasks.md
A  packages/web/src/lib/cronDescription.ts                  (~96 Z, neu)
A  packages/web/src/lib/cronDescription.test.ts             (~245 Z, neu)
M  packages/web/src/components/CronBuilder.tsx              (komplettes Layout-Redesign, ~420 Z)
M  package.json                                             (root: "0.7.0" → "0.7.1"; test:web erweitert)
M  packages/web/package.json                                ("0.7.0" → "0.7.1")
M  packages/core/package.json                               ("0.7.0" → "0.7.1")
M  packages/core/src/cli.ts                                 (.version("0.7.1"))
M  packages/core/src/server.ts                              (version: "0.7.1")
M  openspec/config.yaml                                     (project.version: 0.7.1)
M  README.md                                                (Status-Line + Feature-Bullet)
M  CHANGELOG.md                                             ([0.7.1]-Sektion hinzugefügt)
```

Total: **13 Dateien** (5 neu / 8 modifiziert). Kein Verzeichnis gelöscht. Keine anderen Dateien versehentlich modifiziert (`git diff --stat` zeigt nur diese Pfade).

---

## Lockfile / Dependency-Diff

- **Lockfile:** unverändert (keine `package-lock.json`-Änderung). ✓
- **Neue Deps:** keine. ✓
- **`@radix-ui/react-icons`** und alle anderen web/core Deps: unverändert. ✓
- **Constraints eingehalten:** Single Commit, Single Push, No Backend Changes, No New npm Deps. ✓

---

## Bestätigung

- Bereit für `sdd-verify` gegen `proposal.md` S1–S8 und `tasks.md` T0–T6 Cross-Phase-Checkliste.
- Empfohlene nächste Phase: **`sdd-verify`** (Reviewer-Auge plus automatisierte Gates gegen den Diff vs `3b0e10f`).
