# Proposal: v0.7.1-ui-dropdown — glance-able Schedule modal

- **Phase:** sdd-propose → wartet auf Freigabe → sdd-apply
- **Autor:** sdd-proposal sub-agent (parent: gentle-pi harness)
- **Datum:** 2026-07-01
- **Projekt:** `cronboard` (aktuell v0.7.0 — `edit-job-ui-polish` ist abgeschlossen)
- **Governance:** `openspec/config.yaml`, `AGENTS.md` (Regeln in §2 / §4 haben Vorrang)
- **Skill resolution:** `none` — keine parent-injected Skill-Pfade, kein `.atl/skill-registry.md` (siehe §11)
- **Auto-mode:** Eltern-Harness fährt auto-Pipeline (Back-to-back-Phasen erlaubt); dieser Proposer entscheidet im Sinne des Briefings und listet alle Override-Punkte in §8.

---

## 1. Executive Summary (≤ 200 Wörter)

Das `Schedule`-Modal in `packages/web/src/components/CronBuilder.tsx` (≈ 270 Zeilen) ist heute **funktional vollständig**, aber **visuell unübersichtlich**: sechs kleine `btn-sm`-Preset-Chips in einer Reihe, darunter ein Inline-Feld-Block, der je nach Preset variiert (Intervall-`<select>`, zwei separate Time-`<select>`s, Kalender für Woche, Kalender für Monat). Der User findet das Innere des Modals „cramped" und wünscht mehr visuelle Hierarchie — insbesondere die nativen `<select>`s (Stunde + Minute) und die kleinen `btn-sm`-Chip-Reihen.

v0.7.1 poliert das Modal **rein visuell/UX** — **keine Datenmodell-Änderung**, keine Backend-Änderung, keine Storage-Migration. Sechs Preset-**Cards in einem 3×2-Grid** (Icon + Label + sichtbarer Hint, Active-Highlight) ersetzen die Chip-Reihe; ein einziges nativen `<input type="time">` ersetzt die zwei `<select>`s; ein neuer Pure-Helper `formatDescription(state)` zeigt inline, was die Cron-Regel **bedeutet** („Fires at 09:00 on weekdays"), ohne API-Roundtrip; fünf Preview-Tiles werden zu großen Karten mit prominentem Datum und Weekend-Indikator. Der Reset-Button wird ein beschrifteter Outline-Button. Das `<details>`-Open-State-Persistenz wird per `localStorage["cb-details-opened-${kind}"]` heuristisch pro Preset gemerkt (nur 6 mögliche Keys, keine PII).

Akzeptanz S1–S8 ist maschinenprüfbar (siehe §3). Keine neuen npm-Deps, keine Backend-Änderung, kein Storage-Diff. Version `0.7.0 → 0.7.1` (semver-patch, da UI-only).

---

## 2. Intent

Heute ist das Schedule-Modal ein **flacher 270-Zeilen-Single-Screen** mit vier konkreten UX-Schmerzen, die das „Scan in 1–2 Sekunden, wisse was jeder Cron macht"-Ziel verfehlen:

1. **Sechs kleine Chip-Buttons in einer Reihe** sind auf einem `max-w-3xl`-Modal gequetscht. Jeder Chip ist `btn-sm` (≈ 32 px hoch), die Hint-Texte sind nur als `title`-Tooltip versteckt. Der User kann auf einen Blick nicht erkennen, **welcher Preset was tut** — er muss jeden Tooltip lesen.
2. **Zwei separate `<select>`-Dropdowns** (Stunde + Minute) sind als kleine `select-sm` (≈ 32 px hoch, 80 px breit) inline mit Text platziert. Die resultierende Zeit ist visuell als „`09` : `00`" gelesen, was im 24h-Format mehrdeutig ist („09 Uhr morgens oder abends?").
3. **Intervall-Picker ist `select-sm`** und vom Zeit-Picker durch Text getrennt. Die Bedeutung der Kombination (z. B. „alle 30 Minuten" oder „jede 4. Stunde zur Minute 0") erschließt sich nur, wenn der User die Cron-Syntax im Hinterkopf parst.
4. **Preview ist eine vertikale Liste mit fünf Zeilen** ohne visuelle Trennung zwischen den einzelnen Runs. Wochenend-Runs unterscheiden sich nicht von Wochentag-Runs — das ist relevant, weil Cron-Jobs oft „nur unter der Woche" laufen sollen.

Ziel dieser Änderung: **das Schedule-Modal ist in 1–2 Sekunden scanbar**. Die Preset-Auswahl ist ein Grid von Cards (gleicher Pattern wie der v0.7.0-JobEditor-Empty-State — konsistent). Der Zeit-Picker ist eine einzige, große Komponente (großes Tap-Target). Die menschliche Bedeutung der aktuellen Cron-Regel steht **inline im Detail-Block** in einem Satz, so dass der User die Wirkung prüfen kann, ohne den Cron-String zu parsen.

Wir verändern das Datenmodell **nicht**. Der `CronExpressionState` bleibt. `buildCron`, `parseCron`, `defaultCronState`, `MINUTE_INTERVAL_OPTIONS`, `HOUR_INTERVAL_OPTIONS` bleiben byte-identisch. Wir fügen **eine** Pure-Helper-Funktion `formatDescription(state)` in `packages/web/src/lib/cronDescription.ts` hinzu (analog zu `actionSummary.ts` aus v0.7.0), die ohne API-Roundtrip aus dem State einen englischen Klartext-Satz macht.

---

## 3. Acceptance Criteria (S1–S8)

Diese Kriterien sind die Vertragsbasis für `sdd-apply` und werden in `sdd-verify` automatisiert geprüft.

| #    | Kriterium | Messverfahren |
|------|-----------|--------------|
| S1   | Das Schedule-Modal rendert die 6 Presets in einem `grid` (nicht `flex`), jede Card mit Icon + Label + einzeiligem Hint. | DOM-Assertion: `document.querySelector('[data-testid="preset-grid"]')` ist ein Element mit `display: grid` (computed style). 6 direkte Kinder mit `data-testid="preset-card"` und `data-kind="minute|hour|day|week|month|custom"`. Jede Card enthält genau einen `<svg>` mit `data-icon`-Attribut und einen Hint-Text (≠ leer). |
| S2   | Der aktive Preset ist visuell abgehoben. | DOM-Assertion: `data-testid="preset-card"` mit `data-active="true"` hat einen `border-primary` und einen `bg-primary/10` (computed style differenz-sichtbar gegen `data-active="false"`). |
| S3   | Der Zeit-Picker ist ein einziges `<input type="time">` (oder eine 2-Segment-Stepper-Komponente), **nicht** zwei separate `<select>`-Dropdowns. | DOM-Assertion: kein `<select>`-Element mit `name="hour"` oder `name="minute"` mehr im Modal-Tree. Genau ein `<input type="time">` mit `data-testid="time-picker"`. |
| S4   | Der Intervall-Picker (`every N minutes` / `every N hours`) ist als größeres Control gerendert (kein `select-sm`). | DOM-Assertion: bei `draft.kind === "minute"` oder `"hour"` rendert genau ein `<select>` oder ein Stepper mit `data-testid="interval-picker"`. Die Klasse enthält weder `select-sm` noch `input-sm`. Computed `height` ≥ 36 px. |
| S5   | Der Preview-Block rendert 5 Tiles, jede mit Datum prominent (oben, `text-base font-semibold`) und Zeit sekundär (unten, `text-base-content/60`). | DOM-Assertion: bei nicht-leerem Preview 5 Elemente mit `data-testid="preview-tile"`. Erste Zeile matched `^(Mon\|Tue\|Wed\|Thu\|Fri\|Sat\|Sun),?\s+\d{1,2}\s+\w{3}$`. Zweite Zeile matched `^\d{2}:\d{2}$`. |
| S6   | Eine **menschliche Beschreibung** des aktuellen Crons wird inline im Detail-Block angezeigt (z. B. „Fires at 09:00 on weekdays"). | DOM-Assertion: Element mit `data-testid="cron-description"` enthält Text matched `^(Fires\|Runs\|Every\|At minute) `. Pro `kind` mindestens ein Test (siehe `design.md §2.1`). |
| S7   | `npm run typecheck`, `npm run test:web`, `npm test` (core) alle grün. | Wie v0.7.0: typecheck exit 0, test:web exit 0 (mind. 58 + N neue Tests, 0 Failures), `npm test` exit 0 (208 Tests unverändert). |
| S8   | Keine neuen npm-Deps; Bundle-Delta ≤ 4 kB gzip. | Lockfile-Diff: 0 Änderungen. Web-Bundle: gemessen via `npm run build` Output, dokumentiert im PR-Body. |

> Hinweis S1: ein Grid mit `grid-cols-3` auf `md+`, `grid-cols-2` auf `sm`, `grid-cols-1` auf Mobile ist OK — das Kriterium ist „Grid, nicht Flex".

> Hinweis S5: Wochenend-Indikator (`badge badge-warning badge-xs` wenn `d.getDay() === 0 || 6`) ist **nice-to-have**, nicht acceptance-pflichtig. Wenn sdd-apply es weglässt, ist S5 trotzdem erfüllt. Wenn es da ist, gibt es ein zusätzliches Test-Feature in der Reviewer-Checkliste.

---

## 4. Scope

### 4.1 In-Scope

| Bereich | Änderung |
|---|---|
| `packages/web/src/lib/cronDescription.ts` | **NEU** — pure function `formatDescription(state: CronExpressionState): string` (siehe `design.md §2.1`). |
| `packages/web/src/lib/cronDescription.test.ts` | **NEU** — ≥ 12 Test-Fälle (6 Kinds × 2 Varianten + 4 Edge-Cases). |
| `packages/web/src/components/CronBuilder.tsx` | **M** — komplettes Modal-Layout-Redesign: Preset-Card-Grid, native `<input type="time">`, größerer Intervall-Picker, inline-Beschreibung, Reset-Button mit Label, Preview-Tiles, `<details>`-Persistenz via localStorage. |
| `packages/web/src/components/Calendar.tsx` | **KEINE Änderung** — wird vom CronBuilder unverändert weiterbenutzt (siehe Decision D5). |
| `packages/web/src/lib/api.ts` | **KEINE Änderung** — `api.cron.describe` und `api.cron.next` bleiben unverändert. |
| `package.json` (Root) | **M** — `"version": "0.7.0"` → `"0.7.1"`. |
| `packages/web/package.json` | **M** — `"version": "0.7.0"` → `"0.7.1"`. |
| `packages/core/package.json` | **M** — `"version": "0.7.0"` → `"0.7.1"` (Versions-Spiegelung). |
| `packages/core/src/cli.ts` | **M** — `.version("0.7.0")` → `.version("0.7.1")`. |
| `packages/core/src/server.ts` | **M** — `version: "0.7.0"` → `"0.7.1"` in der `/api/health`-Response. |
| `openspec/config.yaml` | **M** — `project.version: 0.7.0` → `0.7.1`. |
| `README.md` | **M** — Status-Line `v0.7.0 — …` → `v0.7.1 — …, schedule modal shows preset cards, native time picker, and human-readable inline description`. |
| `CHANGELOG.md` | **M** — Neue Sektion `[0.7.1]` mit den User-Visible-Changes (Preset-Cards, Time-Picker, Description, Preview-Tiles, Reset-Button). |
| `openspec/changes/v0.7.1-ui-dropdown/` | **NEU** — diese drei Dateien (`proposal.md`, `tasks.md`, `design.md`). |

### 4.2 Explicit out-of-scope (Nutzer kann jetzt widersprechen)

| Punkt | Begründung |
|---|---|
| **Drag-and-Drop-Reordering** für Presets | Briefing OUT-Liste. Presets sind fest definiert; keine Reihenfolge-Änderung nötig. |
| **Eingebauter Cron-Syntax-Spickzettel** | Briefing OUT. User, die Custom brauchen, wissen, was sie tun. |
| **Theme-Switching** | Briefing OUT. Gruvbox bleibt. |
| **Animationen über DaisyUI-Defaults hinaus** | Briefing OUT. `<details>`-Toggle-Animation und Modal-Open-Fade sind bereits da. |
| **Multi-Timezone-Editor** | Briefing OUT. Modal zeigt genau eine Timezone (aus `props.timezone`). Multi-TZ ist v0.8+. |
| **Cron-Builder für 6-Feld-Cron** (mit Sekunden) | Briefing OUT. Cronboard ist 5-Feld. |
| **Presets als User-Setting speicherbar** | Briefing OUT. 6 Presets sind hartcodiert; User-Custom-Presets sind v0.8+. |
| **Tab-Navigation innerhalb des Modals** (statt sichtbarer Presets) | Bewusste Entscheidung (D9): alle 6 Presets sind auf einen Blick sichtbar; keine Tab-Bar, kein versteckter State. |
| **Light-Theme-spezifische Farb-Anpassungen** | Das Gruvbox-Theme deckt beide Modi ab; keine speziellen Light-Theme-Overrides nötig. |
| **Mobile-spezifische Bottom-Sheet-Variante** | Modal ist bereits `modal-bottom sm:modal-middle` (siehe `CronBuilder.tsx` Zeile 96); das bleibt. |
| **API-Endpoint für Beschreibung** | Bewusste Entscheidung: `api.cron.describe` existiert, wird für die Preview-Badge weiterbenutzt, aber die **inline**-Beschreibung ist eine **lokale** Pure-Funktion (instant, kein API-Wait). |
| **Internationalisierung (i18n)** der Description | Out-of-scope. Englisch-only; deutsche Beschreibung ist v0.8+ (User-Wunsch). |
| **Bundle-Delta-Hardlimit** | Briefing nennt ≤ 4 kB gzip als Soft-Budget; kein Hard-Limit, keine Bundle-Analyse-Tooling-Pflicht. |

### 4.3 Was unverändert bleibt (Klarstellung)

- **Backend:** kein Code-Change in `packages/core/src/**`. Keine neuen Routes, keine neuen Schemas, keine neuen Storage-Felder.
- **Storage:** `jobs.json`, `runs.json`, `state.json` byte-identisch. Keine Migration.
- **`CronExpressionState`:** Struktur unverändert. Keine neuen Felder.
- **`buildCron`, `parseCron`, `defaultCronState`:** unverändert.
- **`MINUTE_INTERVAL_OPTIONS`, `HOUR_INTERVAL_OPTIONS`:** unverändert (vom Core importiert).
- **`Calendar.tsx`:** unverändert.
- **DaisyUI 5 / Tailwind 4 / `@radix-ui/react-icons`:** keine neuen Dependencies.
- **`api.cron.describe`:** bleibt für die Preview-Badge erhalten (siehe `CronBuilder.tsx` Zeile 219).
- **Modal-Trigger-Button** (Zeile 73–80): unverändert — die `<button className="btn btn-outline btn-block ...">` bleibt, weil der Live-Cron-Preview dort weiter angezeigt wird.

---

## 5. Affected areas (read-only — `sdd-apply` modifiziert diese)

```
packages/web/src/lib/cronDescription.ts              (NEU, ~60 Zeilen)
packages/web/src/lib/cronDescription.test.ts         (NEU, ≥ 12 Tests)
packages/web/src/components/CronBuilder.tsx          (M — komplettes Modal-Layout-Redesign)
package.json                                         (M — version 0.7.1)
packages/web/package.json                            (M — version 0.7.1)
packages/core/package.json                           (M — version 0.7.1)
packages/core/src/cli.ts                             (M — .version("0.7.1"))
packages/core/src/server.ts                          (M — /api/health version "0.7.1")
openspec/config.yaml                                 (M — project.version 0.7.1)
README.md                                            (M — Status-Line, Feature-Bullet)
CHANGELOG.md                                         (M — [0.7.1]-Sektion)
openspec/changes/v0.7.1-ui-dropdown/                 (NEU — diese 3 Dateien)
```

**Unverändert:** `packages/core/src/actions/`, `packages/core/src/scheduler/`, `packages/core/src/store/`, `packages/core/src/security/`, `packages/core/src/stats/`, `packages/core/src/daemon.ts`, `packages/core/src/config.ts`, `packages/core/src/logger.ts`, `packages/core/src/schemas.ts`, `packages/core/src/types.ts`, `packages/web/src/components/Calendar.tsx`, `packages/web/src/lib/{actionSummary,relativeTime,runStatus,reorderActions}.ts`, `packages/web/src/lib/api.ts`, `packages/web/src/types.ts`, `packages/web/src/main.tsx`, `packages/web/src/App.tsx`, `packages/web/src/styles.css`, `bin/`, `scripts/`, `tsconfig*.json`, `docs/API.md` (kein API-Diff), `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, alle anderen `packages/web/src/pages/*` (Dashboard, Jobs, Editor (außer implizit via JobEditor-Refs), Runs, Settings). Storage-Format bleibt byte-identisch.

---

## 6. Risiken & Gegenmaßnahmen

| #   | Risiko | Wahrsch. | Impact | Gegenmaßnahme |
|-----|--------|---------:|-------:|---------------|
| R1  | **Bundle-Size-Plus** durch neue Cards, `<input type="time">`-Wrapper-Styling, `formatDescription`-Helper. | Niedrig | Niedrig | `formatDescription` ist eine reine Funktion mit einer `switch`-Anweisung (≤ 60 Zeilen). Modal-Cards wachsen um ~40 Zeilen Markup pro Card × 6 = ~240 Zeilen insgesamt, aber DaisyUI-Klassen sind trivial. Geschätzt +2 bis +3 kB gzip. Innerhalb des 4-kB-Budgets (S8). |
| R2  | **`<input type="time">` rendert Browser-spezifisch unterschiedlich** (Chrome: kleines Dropdown, Firefox: Scrollrad, Safari: native Picker). | Mittel | Niedrig | Akzeptiert: das ist genau der Punkt des nativen Pickers (Accessibility + Mobile-Tastatur). Wir stylen den Wrapper (`input-bordered input-lg`), nicht das native Popup. Test-S7 prüft nur, dass es ein `<input type="time">` ist, nicht das Popup-Verhalten. |
| R3  | **LocalStorage-Persistenz privacy implication** — Keys wie `cb-details-opened-weekday` könnten als Fingerprinting-Vektor missinterpretiert werden. | Niedrig | Niedrig | Nur 6 mögliche Keys (einer pro `kind`), Werte sind `"1"` (gesetzt) oder gar nicht gesetzt. **Keine PII**, keine Cron-Strings, keine User-Identifikation. Dokumentation in `design.md §6` erklärt das explizit. Hinweis im PR-Body. |
| R4  | **`<input type="time">` 24h-Format nicht in allen Browsern erzwungen** — Locale `de-DE` rendert z. B. `09:00` als 12h. | Niedrig | Niedrig | Wir setzen explizit `lang="en-GB"` auf das Input-Element und dokumentieren in `design.md §5`, dass die 24h-Darstellung Browser-abhängig ist. Test-S7 prüft nur das `type="time"`-Attribut, nicht den Wert-Format. |
| R5  | **Preview-Tile-Layout bricht bei `runs.length > 5`** (sollte nicht passieren, API cap ist 5). | Niedrig | Niedrig | `.slice(0, 5)` defensiv vor dem `.map`. Test in `cronDescription.test.ts` braucht das nicht; ggf. Defensive-Check in CronBuilder. |
| R6  | **`formatDescription` für `custom`-Preset zeigt internen Cron-String** statt einer Beschreibung — der User könnte denken, der String sei „die" Wahrheit, nicht der geparste State. | Niedrig | Mittel | Im `custom`-Fall zeigt die Description `"Custom: <expression>"` mit Mono-Schrift und Hinweis „5-field cron". Damit ist klar, dass das **der Input** ist, nicht die Beschreibung der Wirkung. |
| R7  | **Preset-Card-Grid kollidiert mit Modal-Box-Breite** auf `sm` (640 px): 3 Cards à ~200 px = 600 px + Gaps. | Niedrig | Niedrig | Responsive Breakpoint: `grid-cols-1` auf Mobile, `grid-cols-2` auf `sm`, `grid-cols-3` auf `md+`. Auf `sm` rendert es 3×2 (2 Spalten, 3 Zeilen). Test S1 prüft nur `display: grid`, nicht die Spalten-Anzahl. |
| R8  | **`<details>`-open-State wird vom Browser gepflegt; bei Modal-Close wird der State evtl. nicht zurückgesetzt** (User öffnet Modal wieder → Form ist noch aufgeklappt). | Niedrig | Niedrig | `<details>` wird **innerhalb** des Modals gerendert; beim Modal-Close wird der DOM-Subtree zerstört. Beim nächsten Open wird der State aus localStorage (oder `defaultOpen`) neu berechnet. Bewusst **kein** Cleanup-on-Close. |
| R9  | **`formatDescription` und `api.cron.describe` können divergieren** — die lokale Funktion beschreibt `every 2 hours` als „Fires at minute 30 of every 2 hours", `cronstrue` (server-side) sagt „Every 2 hours". | Mittel | Niedrig | Akzeptiert: die inline-Beschreibung ist **eine** von zwei möglichen Repräsentationen. Die Preview-Badge (server-side) ist die andere. Beide sind **konsistent genug**, dass der User die Bedeutung versteht. Dokumentation in `design.md §2.1` markiert das als bewusste Entscheidung. |
| R10 | **`input type="time"` mit Minuten-Schritt** — User kann keine Sekunden einstellen (gewollt, weil Cronboard 5-Feld ohne Sekunden ist), aber das `<input>` zeigt Sekunden-Feld, wenn `step` nicht gesetzt ist. | Niedrig | Niedrig | Explizit `step={60}` setzen — Sekunden-Spinner wird im nativen Picker ausgeblendet. |
| R11 | **Weekend-Indikator-Badge** könnte als „nicht ok" missinterpretiert werden. | Niedrig | Niedrig | Tooltip `title="Weekend run"`; Farbe ist `badge-warning` (gelb, nicht rot). Kein Status, sondern nur ein Hinweis. Dokumentation in `design.md §3.2`. |
| R12 | **`data-testid`-Hooks vergessen** — Smoke kann nicht greifen, Reviewer kann nicht prüfen. | Niedrig | Mittel | Reviewer-Checkliste in `design.md §10` listet die 12+ erwarteten `data-testid`-Werte. S1–S6 sind explizit gegen diese IDs formuliert. |

---

## 7. Rollback

Weich-Rollback (ein `git revert`):

1. `packages/web/src/components/CronBuilder.tsx` zurück auf die alte Chip-/Select-Variante.
2. `packages/web/src/lib/cronDescription.{ts,test.ts}` löschen — werden durch Soft-Rollback ungenutzt (keine anderen Imports).
3. `package.json` / `packages/*/package.json` Version zurück auf `0.7.0`.
4. `packages/core/src/cli.ts` und `packages/core/src/server.ts` Versionsstrings zurück auf `0.7.0`.
5. `openspec/config.yaml` Version zurück auf `0.7.0`.
6. README-Status-Line und CHANGELOG-Eintrag entfernen (oder als „experimental" markieren).

Hart-Rollback: nicht nötig — keine Datenmodell-Änderung, kein Storage-Diff, keine Backend-Änderung. Das Modal ist eine reine Client-Side-Sicht auf den vorhandenen `CronExpressionState`.

**Breaking Change für User:** keiner. Das Modal-Verhalten ändert sich (UI-Polish), aber die persistierten Cron-Strings bleiben kompatibel. Ein Job, der in v0.7.0 mit `0 9 * * 1-5` gespeichert wurde, sieht im v0.7.1-Modal genauso aus wie vorher, nur mit Cards statt Chips und einem `<input type="time">` statt zwei `<select>`s.

---

## 8. Decisions getroffen ohne explizite Nutzernachfrage (bitte bestätigen oder überschreiben)

Der Parent-Briefing war detailliert, aber an mehreren Stellen nicht eindeutig. Diese Punkte hat der Proposer entschieden — sie stehen alle zur Disposition:

| #   | Entscheidung | Begründung | Override-Pfad |
|-----|-------------|-----------|---------------|
| D1  | **Time-Picker = natives `<input type="time">`** (24h, `step={60}`). | Einfachstes der drei Briefing-Vorschläge (Stepper, Clock-Face, Native). Keine Custom-Komponente, keine State-Maschine, keine Mobile-Keyboard-Logik. Browser liefert Free-Accessibility (Screenreader, Tastatur, Locale). Trade-off: Browser-Picker-UI variiert OS-spezifisch, aber das ist akzeptabel (R2). | Custom 2-Segment-Stepper (zwei große `−`/Wert/`+`-Paare) mit `aria-live` für Announcement. Höherer Code-Aufwand (~80 Zeilen), aber konsistentes UI. |
| D2  | **Preset-Grid = 3 Spalten × 2 Zeilen** (`grid-cols-3` auf `md+`, `grid-cols-2` auf `sm`, `grid-cols-1` auf Mobile). | Passt zur `max-w-3xl`-Modal-Box (768 px ÷ 3 = ~256 px pro Card, komfortabel für Icon + Label + Hint). Konsistent mit dem v0.7.0-CTA-Card-Pattern (D14 in v0.7.0-Proposal). 6 Presets passen symmetrisch. | 2 Spalten × 3 Zeilen (vertikaler, schmaler — eher Mobile-First). 4 Spalten + 2 Zeilen mit Lücke (asymmetrisch). 6 in einer Reihe (zu schmal). |
| D3  | **Intervall-Picker = größeres `<select>` (`select select-bordered select-md`)**, gruppiert mit Time-Picker in einer horizontalen Row bei `hour`-Preset. | Konsistent mit dem v0.7.0-Pattern: „kein `select-sm` mehr" (Briefing S4). `select-md` (≈ 48 px hoch) ist komfortabel auf Desktop und Mobile. Native-Select ist schneller als Custom-Dropdown. | Custom Stepper (`−`/Wert/`+`) statt Select. Größere Touch-Targets, aber mehr Code. |
| D4  | **Inline-Beschreibung = lokale Pure-Function `formatDescription(state)`**, **nicht** `api.cron.describe`. | Instant feedback ohne API-Wait. Cron-Strings sind im UI-State vollständig beschrieben (kein Server-Roundtrip nötig). Server-Description (`cronstrue`) bleibt für die Preview-Badge daneben. | `formatDescription` durch direkten Aufruf von `api.cron.describe` ersetzen — würde Latenz in das Modal bringen. |
| D5  | **`<details>`-Persistenz via localStorage** (`cb-details-opened-${kind}`). | Briefing Q5 hat das explizit angefragt. 6 mögliche Keys, Werte sind `"1"`. Keine PII. Cleanup beim Modal-Close nicht nötig (DOM wird zerstört). | In-Memory-State (`useState`) statt localStorage — User-UX geht beim Reload verloren. Per-Tab-Persistenz (`sessionStorage`) — User-UX geht beim Tab-Close verloren. |
| D6  | **Reset-Button = `btn btn-outline btn-sm` mit Label „Reset"** statt `↺`-Icon-Button. | Briefing: „proper labeled Reset button (low-key outline style)". Outline ist „low-key" (secondary), `btn-sm` bleibt kompakt. Icon-only-Button war visuell versteckt. | Icon-only-Button beibehalten (`btn btn-ghost btn-square`). Tooltip verbessern. |
| D7  | **Preview-Tile-Grid = `grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5`**. | 5 Tiles passen bei `lg+` in einer Reihe, bei `md` in 3+2, bei `sm` in 2+2+1, bei Mobile in 5 untereinander. Responsive ohne Media-Query-Hack im JSX. | Fix `grid-cols-5` (auf `sm` zu eng). Fix 5 Zeilen untereinander (zu vertikal). |
| D8  | **Wochenend-Indikator = `badge badge-warning badge-xs` mit Tooltip „Weekend run"**, nur wenn `d.getDay() === 0 \|\| d.getDay() === 6`. | Optional, nice-to-have. `badge-warning` (gelb) unterscheidet sich von `badge-error` (rot, „kaputt"). Tooltip macht die Bedeutung klar. | Kein Wochenend-Indikator (S5 bleibt erfüllt). Andere Farbe (`badge-info`). |
| D9  | **Alle 6 Presets auf einen Blick sichtbar** (keine Tab-Bar, kein versteckter State). | Briefing: „instead of 6 cramped small buttons in a row, use a 2×3 or 3×2 grid". Karten sind die moderne Variante von Tabs, aber ohne Hide-the-others-Problem. | Tab-Bar mit aktivem Tab + Drop-Down für die anderen 5. Spart Vertical-Space, aber versteckt Optionen. |
| D10 | **`<details>` open-Default: erste Öffnung = expanded**, danach localStorage-gemerkter State. | User öffnet das Modal zum ersten Mal und sieht direkt das Formular. Beim zweiten Öffnen hat der Browser den State gemerkt. Trade-off: localStorage wird beim ersten Toggle geschrieben, nicht beim ersten Open (sonst wäre alles immer expanded). | Immer expanded (kein localStorage). Immer collapsed (User muss jedes Mal klicken — nervig). |
| D11 | **Bundle-Size-Threshold**: ≤ 4 kB gzip, dokumentiert im PR-Body. | Briefing S8. Weiches Limit; kein Hard-Cutoff. Geschätzt +2–3 kB. | Kein Threshold; nur „npm run build muss grün sein". |
| D12 | **`formatDescription` Sprache = Englisch only**, kein i18n. | Konsistent mit dem Rest der UI (Buttons, Labels). i18n ist v0.8+. | Deutsche Beschreibung mit `de-DE`-Locale. |
| D13 | **`formatDescription` sagt „on weekdays" bei `[1,2,3,4,5]` und „on weekends" bei `[0,6]`**, sonst „on Mon, Wed, Fri" etc. | Special cases verbessern die UX; User muss nicht „Mon, Tue, Wed, Thu, Fri" lesen, wenn „weekdays" gemeint ist. | Immer explizit auflisten („on Mon, Tue, Wed, Thu, Fri"). Special cases vermeiden. |
| D14 | **`week`-Preset: aktive-Tage-Reihe rutscht über den Kalender** (sichtbarer als eigene Zeile). | Briefing: „chip row showing 'Active: Mo, Tu, We, Th, Fr' more prominent above the calendar". Promotion von `text-xs` auf `text-sm` + `badge badge-primary badge-md`. | Inline-Badge bleiben, nur Hover-Highlight verbessern. |
| D15 | **`month`-Preset: Day-of-Month als 48×48-Tile** mit großer Nummer. | Briefing explizit. Tile ist visuell dominant gegenüber dem Kalender darunter. | Inline-Badge (`badge badge-primary badge-lg`) ohne Tile. |

Siehe `design.md` für die technische Begründung jeder Entscheidung (insbesondere §3 für das Icon-Mapping, §4 für die `formatDescription`-Algorithmus-Details, §5 für die `<input type="time">`-Spezifika, §6 für das localStorage-Schema).

---

## 9. Migration: v0.7.0 → v0.7.1

Keine Storage-Migration. Keine Daten-Migration. Kein Breaking Change im API-Vertrag.

**Bestandsjobs** öffnen sich automatisch im neuen Modal-Layout — die 6 Preset-Cards, der native Time-Picker, die inline-Beschreibung, die größeren Tiles. Der User **merkt** die Änderung beim ersten Modal-Open nach dem Update.

**LocalStorage-Migration:** keine. Beim ersten Open eines neuen Modals wird `cb-details-opened-${kind}` noch nicht gesetzt; default ist `defaultOpen=true` (siehe D10). Erst wenn der User das `<details>` zuklappt, wird der Key gesetzt. Beim nächsten Open wird der Key gelesen → das `<details>` startet collapsed.

**Konfigurations-Migration:** keine. Alle bestehenden Cron-Felder bleiben unverändert.

**CronExpr-Migration:** keine. `CronExpressionState` ist byte-identisch.

---

## 10. Offene Fragen an den Parent / Nutzer (vor `sdd-apply`)

Diese Fragen hat der Proposer **nicht** entschieden. Sie sind als Vorschläge markiert; bei Auto-Modus fährt der Proposer mit den Defaults aus §8 weiter, aber der Parent kann jeden Punkt überschreiben:

| #   | Frage | Default-Annahme | Override |
|-----|-------|-----------------|----------|
| Q1  | Soll der Time-Picker **12h oder 24h** rendern? | 24h (`lang="en-GB"` auf dem Input). | „12h mit AM/PM-Toggle" — würde Custom-Component bedeuten. |
| Q2  | Soll die Inline-Beschreibung **deutsch** sein? | Englisch. | „Auf Deutsch: 'Feuert um 09:00 an Wochentagen'" — i18n-Einführung. |
| Q3  | Soll der **Wochenend-Indikator** im Preview angezeigt werden? | Ja (`badge-warning` mit Tooltip). | „Nein, lass es weg — S5 ist auch ohne erfüllt." |
| Q4  | Soll die Preset-Reihenfolge **alphabetisch** sein oder die ** heutige** (minute, hour, day, week, month, custom)? | Heutige (häufigste zuerst). | Alphabetisch (custom, day, hour, minute, month, week) — ungewohnt. |
| Q5  | Soll der **`details`-open-State pro Modal-Öffnung** zurückgesetzt werden (User klickt immer alles zu beim Schließen), oder **persistent pro Kind** (User merkt sich pro Preset)? | Persistent pro Kind (localStorage, D5). | „Immer expanded bei jedem Öffnen" — würde localStorage überflüssig machen. |

Wenn der Parent keine Überschreibungen liefert, fährt `sdd-apply` mit den Defaults aus §8 + Q1–Q5 = „24h Time-Picker, englische Beschreibung, Wochenend-Indikator an, heutige Preset-Reihenfolge, persistente `<details>`-States".

---

## 11. Glossar

- **Schedule-Modal:** das DaisyUI-Modal in `CronBuilder.tsx`, das nach Klick auf den Trigger-Button im JobEditor erscheint. Lässt den User eine Cron-Regel interaktiv zusammenstellen.
- **Preset:** einer der 6 vordefinierten Cron-Typen (Minute / Hour / Daily / Weekly / Monthly / Custom). Identifiziert durch `CronKind = "minute" \| "hour" \| "day" \| "week" \| "month" \| "custom"`.
- **Preset-Card:** die v0.7.1-Kachel im Grid, die einen Preset visuell repräsentiert (Icon + Label + Hint + Active-Highlight). Ersetzt den v0.7.0-`btn-sm`-Chip.
- **`<details>`-Persistenz:** Heuristik, dass das Browser-native `<details>`-Element seinen `open`-State pro `kind` in localStorage behält, so dass der User beim erneuten Öffnen des Modals die gleichen Forms aufgeklappt vorfindet wie beim Schließen.
- **`formatDescription(state)`:** neue Pure-Function in `packages/web/src/lib/cronDescription.ts`. Nimmt `CronExpressionState` entgegen, gibt einen englischen Klartext-Satz zurück (z. B. „Fires at 09:00 on weekdays"). Läuft client-side, kein API-Call.
- **Native Time-Picker:** `<input type="time">` (HTML5). Liefert Browser-spezifisches UI (Chrome: Text + Spinner, Firefox: Text, Safari: Wheel). Accessibility out-of-the-box.
- **Skill resolution:** Status-Reporting dieses Sub-Agents an den Parent. `none` = keine Skill-Pfade vom Parent injiziert, keine `.atl/skill-registry.md` im Repo, kein Fallback-Loading versucht.

---

## 12. Empfohlene nächste Phase

Nach Freigabe durch den Parent: **`sdd-apply`** (Implementierung gemäß `tasks.md`). `sdd-verify` danach prüft S1–S8 gegen den Diff.