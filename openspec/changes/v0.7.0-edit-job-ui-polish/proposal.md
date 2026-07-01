# Proposal: v0.7.0-edit-job-ui-polish — glance-able JobEditor

- **Phase:** sdd-propose → wartet auf Freigabe → sdd-apply
- **Autor:** sdd-proposal sub-agent (parent: gentle-pi harness)
- **Datum:** 2026-07-01
- **Projekt:** `cronboard` (aktuell v0.6.0; v0.6.0-edit-curl-export wurde abgeschlossen, v0.5.0-security liegt davor)
- **Governance:** `openspec/config.yaml`, `AGENTS.md` (Regeln in §2 / §4 haben Vorrang)
- **Skill resolution:** `none` — keine parent-injected Skill-Pfade, kein `.atl/skill-registry.md` (siehe §11)
- **Auto-mode:** Eltern-Harness fährt auto-Pipeline (Back-to-back-Phasen erlaubt); dieser Proposer entscheidet im Sinne des Briefings und listet alle Override-Punkte in §10.

---

## 1. Executive Summary (≤ 200 Wörter)

Der `JobEditor` (`packages/web/src/pages/JobEditor.tsx`) ist heute **funktional vollständig**, aber **optisch nicht scanbar**: jede Action-Karte öffnet ihre volle Form (Method/URL/Body/Headers/cwd/timeout) sofort; Methode und URL sind hinter Input-Feldern vergraben; es gibt keine sichtbare Reihenfolge-Kontrolle (obwohl das `position`-Feld existiert und vom Runner sortiert wird); und es fehlt jeder Hinweis darauf, ob eine Action gerade **läuft / erfolgreich war / fehlgeschlagen ist / noch nie gelaufen ist**. Für ein Tool, das „scan in 1–2 Sekunden, wisse was jeder Job tut" verspricht, ist das ein blinder Fleck.

v0.7.0 poliert den Editor rein **visuell/UX** — **keine Datenmodell-Änderung**. Pro Action-Card: ein neuartiger **Summary-Header** (Webhook: `POST https://…`, Shell: `$ cmd (cwd, timeout)`), ein **farbcodiertes Icon** (Globe/Code) statt Text-Badge, ein **Status-Badge** rechts oben (Latest-Run-Zustand aus dem vorhandenen `/api/runs?jobId=…&limit=50`-Endpoint, kein neuer Endpoint, kein neues Polling), **auf/ab Pfeile + Drag-Handle-Symbol** (visuell, ohne echtes DnD) zum Tauschen der `position`, und ein **collapsibles `<details>`**-Feld für die Form. Ein neuer **Empty-State** zeigt zwei große „Add Webhook / Add Shell"-Cards. Reordering ruft `PATCH /api/jobs/:id` debounced (250 ms) mit renummerierten Positionen (0…n-1, dense).

Akzeptanz S1–S8 ist maschinenprüfbar (siehe §3). Keine neuen npm-Deps, keine Backend-Änderung, keine Storage-Migration. Version `0.6.0 → 0.7.0` (UI-Feature, semver-minor).

---

## 2. Intent

Heute zeigt der Editor eine Action-Karte als **flaches Stapel-Form** mit einem Text-Badge (`webhook #1`, `shell #2`) als einzigem visuellen Anker. Drei konkrete Schmerzen, die das Glance-Goal verfehlen:

1. **Method + URL sind in Form-Feldern vergraben.** Um zu wissen, was die Action tut, muss der User scrollen, fokussieren, lesen. Bei einem 4-Action-Job sind das 4× Method-Dropdowns + 4× URL-Inputs, die mental sequenziell durchgegangen werden müssen.
2. **Reihenfolge ist unsichtbar.** Das `position`-Feld existiert (`packages/core/src/types.ts → ActionBase.position`, `runner.ts` sortiert aufsteigend), aber im Editor gibt es kein UI, das `position` ausdrückt oder ändert. Wenn ein User die Reihenfolge korrigieren will, muss er heute die Actions **löschen und neu hinzufügen** (siehe `removeAction` in `JobEditor.tsx` Zeile 102 — die renummeriert 0..n-1, aber das ist nicht sichtbar).
3. **Keine „ist es gerade kaputt"-Anzeige.** Der User kann die Job-Liste sehen (mit p95-Chip und Status-Strip), aber im **Editor** sieht er nur die Soll-Konfiguration, nicht die Ist-Lage. Die einzelne Action kann seit gestern Abend kaputt sein, ohne dass das auffällt, bevor er auf „Save / Test run" klickt.

Ziel dieser Änderung: **eine Action-Karte ist in 1–2 Sekunden scanbar**. Method/URL/Command stehen oben. Reihenfolge ist explizit. Letzte-Run-Status ist immer sichtbar (auch ohne Polling — die Daten werden on-load einmal pro Job geholt und sind ein API-Aufruf, keine Websocket-Subscription). Form-Felder sind nicht im Default-Sichtbereich, aber mit einem Klick da.

Wir verändern das Datenmodell **nicht**. Der Storage bleibt byte-identisch. Die Action-IDs, `position`, `continueOnError`, `config` — alles bleibt. Wir nutzen den vorhandenen `GET /api/runs?jobId=X&limit=50`-Endpoint, der `actionRuns` enthält mit `actionId`, `status`, `finishedAt`. Kein neuer Endpoint, kein neues Schema.

---

## 3. Acceptance Criteria (S1–S8)

Diese Kriterien sind die Vertragsbasis für `sdd-apply` und werden in `sdd-verify` automatisiert geprüft.

| #    | Kriterium | Messverfahren |
|------|-----------|--------------|
| S1   | Wenn der Editor einen existierenden Job lädt, zeigt jede Action-Karte oben eine **einzeilige Summary**: `POST  https://example.com/webhook` (Webhook, URL truncated auf 47 + `…`) bzw. `$ backup.sh  (cwd: /srv/cron, timeout 60s)` (Shell). | DOM-Assertion: `document.querySelectorAll('[data-testid="action-summary"]').length === actions.length`; Text-Inhalt matched Regex `^(POST|GET|PUT|PATCH|DELETE)\s+https?://` bzw. `^\$\s.+\(.*\)`. `data-testid` wird in jedem Summary-Element gepflegt. |
| S2   | Der Action-Typ wird durch ein **Icon + farbigen Hintergrund-Tint** kommuniziert (Globe auf `bg-primary/15` für Webhook, Code auf `bg-secondary/15` für Shell), nicht durch ein Text-Badge. | DOM-Assertion: kein Element mit Klasse `badge` und Text `webhook #N`/`shell #N` mehr vorhanden; stattdessen `<svg>` mit Data-Attribut `data-action-icon="webhook"|"shell"`. |
| S3   | Jede Action-Karte hat sichtbare **auf/ab-Pfeile**, die die `position` mit dem Nachbarn tauschen. | DOM-Assertion: `document.querySelectorAll('[data-testid="reorder-up"]').length === actions.length`, `[data-testid="reorder-down"]` ebenso. Erstes Element hat `disabled` auf Up, letztes auf Down. |
| S4   | Jede Action-Karte zeigt rechts oben ein **Status-Badge** mit dem Zustand des letzten Runs für die jeweilige `actionId` (`✓ ok 12ms ago`, `✗ failed 3m ago`, `⋯ running`, `— never run`). | DOM-Assertion: `data-testid="status-badge"` mit `data-status="success"|"failed"|"running"|"never"`; Text matched `^(✓|✗|⋯|—)\s`. Für jede `actionId` mit mindestens einem `ActionRun` in den letzten 50 Runs wird `status !== "never"` erwartet. |
| S5   | Form-Felder (Method/URL/Body/Headers für Webhook; Command/cwd/timeout für Shell) sind in ein `<details>`-Element gewrappt, das für existierende Jobs **collapsed by default** ist, für den „Add new"-Pfad **expanded by default**. | DOM-Assertion: `document.querySelector('details[data-testid="action-form"]').open === false` für `jobId !== undefined`, `=== true` für `jobId === undefined`. |
| S6   | Empty-State zeigt zwei große „Add Webhook / Add Shell"-Cards (mit Icon + Beschreibung) statt eines Text-Blocks. | DOM-Assertion: bei `actions.length === 0` exakt 2 Buttons mit `data-testid="add-webhook-cta"` und `data-testid="add-shell-cta"`; kein Element mit Text `No actions yet.` mehr im Tree. |
| S7   | Reordering eines Jobs mit 3 Actions produziert ein `PATCH /api/jobs/:id` mit `actions: [...]`, in dem die neuen Positionen `0, 1, 2` (in dieser Reihenfolge) sind. | Smoke-Test: POST-Seed eines 3-Action-Jobs, dann JS-Click-Sequenz `reorder-down` auf Action #2 (Position 0 → 1) und `reorder-up` auf Action #2 (Position 1 → 0), dann Inspect `PATCH /api/jobs/:id`-Payload. **Achtung**: das ist visuelles Klicken; das Smoke prüft den debounced PATCH-Payload, nicht den Klick selbst. Alternative: Ein **direkter Pure-Function-Test** für `reorder(arr, idx, direction)` in `packages/web/src/lib/actionOrder.ts`. Siehe `tasks.md → T6`. |
| S8   | `npm run typecheck` exit 0, `npm run build` exit 0, `scripts/smoke.ps1` exit 0. Keine neuen Dependencies. | Wie v0.5.0/v0.6.0. |

> Hinweis zu S1/S4: die exakte Zeit-Angabe (`12ms ago`, `3m ago`) ist relativ; das Smoke prüft die Form (`^\d+(ms|s|m|h)\s+ago$`) nicht den exakten Wert. Solange der Relativ-Formatter die korrekte Einheit wählt, ist S1/S4 erfüllt.

> Hinweis zu S7: der Pure-Function-Test `reorder(arr, 1, "down")` und `reorder(arr, 1, "up")` sind die **kanonische** S7-Evidence — sie sind billig, deterministisch und brauchen kein Browser-Setup. Der Smoke-Grep ist die zusätzliche End-to-End-Absicherung.

---

## 4. Scope

### 4.1 In-Scope

| Bereich | Änderung |
|---|---|
| `packages/web/src/lib/actionSummary.ts` | **NEU** — pure function `summary(action): string`, plus `truncateUrl(url, max=50)` und `formatRelativeTime(iso): string`. |
| `packages/web/src/lib/actionStatus.ts` | **NEU** — `statusForAction(runs, actionId): { color, icon, label }`. Mapping `ActionRunStatus → DaisyUI`-Klasse + Icon-Name + Anzeige-Text. |
| `packages/web/src/lib/actionOrder.ts` | **NEU** — `reorder(actions, idx, direction: "up"\|"down"): actions[]` (pure, returns new array mit renummerierten Positionen 0..n-1). |
| `packages/web/src/lib/formatRelative.ts` | **NEU** — `formatRelativeTime(iso: string, now?: Date): string` (`12ms ago`, `3m ago`, `2h ago`, `yesterday`, `Jul 1`). Pure. |
| `packages/web/src/pages/JobEditor.tsx` | **M** — `ActionCard`-Layout komplett umbauen: neuer Header (Icon + Summary + Status-Badge + Reorder + Continue-on-error + Delete). Form-Felder in `<details>`. Empty-State durch zwei CTA-Cards ersetzen. `addWebhook`/`addShell`-Funktionen bleiben (rufen CTA-Cards onClick). `removeAction` bleibt, wird zu `moveAction(idx, direction)` ergänzt (ohne PATCH), `reorder` baut das neue Array. |
| `packages/web/src/pages/JobEditor.tsx` | **M** — `useEffect` beim `jobId`-Load: zusätzlich `api.runs.list({ jobId, limit: 50 })` einmalig holen, in `useState<RunsByActionId>` indizieren. Bei `save()` oder `testRun()`-Erfolg: `runs`-State revalidieren. |
| `packages/web/src/pages/JobEditor.tsx` | **M** — Reorder debounced: bei Klick auf Up/Down erst nur lokales State-Update; nach 250 ms Idle (oder bei Save/Test run): ein `api.jobs.update(jobId, { actions })`-PATCH senden. Während des Debounce-Fensters sind weitere Klicks erlaubt und mergen. Cancel-on-unmount. |
| `package.json` (root) | **M** — `"version": "0.6.0"` → `"0.7.0"`; ggf. neuer Script `test:web` (siehe Decision D4). |
| `packages/web/package.json` | **M** — `"version": "0.6.0"` → `"0.7.0"`. |
| `packages/core/package.json` | **M** — `"version": "0.6.0"` → `"0.7.0"` (Versions-Spiegelung, keine API-Änderung). |
| `packages/core/src/cli.ts` | **M** — `.version("0.6.0")` → `.version("0.7.0")`. |
| `packages/core/src/server.ts` | **M** — `version: "0.6.0"` → `"0.7.0"` in der `/api/health`-Response (siehe `docs/API.md`). |
| `packages/web/src/lib/api.ts` | **M** — User-Agent oder Default-Header bleibt unverändert; nur Re-Exports, falls nötig. |
| `openspec/config.yaml` | **M** — `project.version: 0.6.0` → `0.7.0`. |
| `README.md` | **M** — Status-Line `v0.6.0 — …` → `v0.7.0 — …` plus kurzer neuer Absatz „Action-Karten: Summary + Status-Badge + Reorder". |
| `CHANGELOG.md` | **M** — Neue Sektion `[0.7.0]` mit den User-Visible-Changes (Summary-Header, Status-Badge, Reorder-Buttons, Empty-State). |
| `openspec/changes/v0.7.0-edit-job-ui-polish/` | **NEU** — diese drei Dateien (`proposal.md`, `tasks.md`, `design.md`). |

### 4.2 Explicit out-of-scope (Nutzer kann jetzt widersprechen)

| Punkt | Begründung |
|---|---|
| **Drag-and-Drop-Reordering** | Briefing OUT-Liste. v0.7.0 Up/Down-Buttons reichen; DnD ist v0.8+ (mit Tastatur-Bedienung, ARIA-Live-Region, Touch-Support). |
| **Inline-Editing der Summary** | Briefing OUT. Summary ist derived; Edit passiert im Form-`<details>`. |
| **Per-Action-Run-History im Editor** | Briefing OUT. Status-Badge zeigt nur den letzten Run; History ist auf der `RunsPage` (`packages/web/src/pages/RunsPage.tsx`) bereits da. |
| **Collapse-All-vs-First-Expanded** | Briefing OUT. User kann selbst entscheiden. |
| **Per-Action „Test run"-Button** | Briefing OUT. Page-Level „Test run" reicht; per-Action ist v0.8+ Convenience. |
| **Polling / WebSocket / SSE für Live-Status** | Auto-Modus des Parents (kein Live-Update geplant). `api.runs.list` wird on-load einmal geholt; nach `save`/`testRun` revalidiert. Eine echte Live-Subscription ist v0.8+. |
| **Auto-Expand der ersten Action beim Load** | Bewusste Entscheidung (siehe D8): alles collapsed by default für existierende Jobs. Auto-Expand der ersten ist eine sinnvolle v0.8+ UX. |
| **Bundle-Delta-Optimierung** | v0.7.0 ist UI-only, kleines Bundle-Plus (eine Handvoll neue Komponenten + 3 Lib-Helper). Keine Bundle-Analyse verlangt. |
| **Mobile-Specific-Layout** | Editor ist auf Desktop-Tailwind-Grid gebaut; Mobile ist nicht der primäre Use-Case. Keine speziellen Mobile-Optimierungen. |
| **`api.runs.list` Pagination-Erhöhung** | `limit: 50` reicht für typische 1–10-Action-Jobs. Bei >50 Actions / mehreren Jobs wäre der Run-History-Datensatz sowieso nicht „latest" — anders modellieren in v0.8+. |
| **`GET /api/jobs/:id/runs` neuer Endpoint** | Bewusste Entscheidung: der existierende `/api/runs?jobId=X` reicht. Ein dedizierter `/jobs/:id/runs`-Endpoint wäre ein API-Diff und v0.8+. |
| **Neue DaisyUI-Theme-Tokens** | Theme bleibt Gruvbox; neue Komponenten nutzen existierende Tokens (`bg-primary/15`, `bg-secondary/15`, `text-success`, `text-error`, `text-info`, `text-base-content/50`). |
| **Per-User-Customization (Card-Sichtbarkeit pro User)** | Single-User-Tool. Out-of-scope. |

### 4.3 Was unverändert bleibt (Klarstellung)

- **Backend:** kein Code-Change in `packages/core/src/**`. Keine neuen Routes, keine neuen Schemas, keine neuen Storage-Felder.
- **Storage:** `jobs.json`, `runs.json` byte-identisch. Keine Migration.
- **DaisyUI 5 / Tailwind 4 / `@radix-ui/react-icons`:** keine neuen Dependencies.
- **Croner, undici, pino, fastify, croner, cronstrue:** unverändert.
- **`scheduler/runner.ts`-Sortierung nach `position` ascending:** unverändert (sie ist die Quelle der Wahrheit).

---

## 5. Affected areas (read-only — `sdd-apply` modifiziert diese)

```
packages/web/src/lib/actionSummary.ts              (NEU, ~40 Zeilen)
packages/web/src/lib/actionSummary.test.ts         (NEU, ≥ 8 Tests)
packages/web/src/lib/actionStatus.ts               (NEU, ~30 Zeilen)
packages/web/src/lib/actionStatus.test.ts          (NEU, ≥ 5 Tests)
packages/web/src/lib/actionOrder.ts                (NEU, ~25 Zeilen)
packages/web/src/lib/actionOrder.test.ts           (NEU, ≥ 6 Tests)
packages/web/src/lib/formatRelative.ts             (NEU, ~30 Zeilen)
packages/web/src/lib/formatRelative.test.ts        (NEU, ≥ 5 Tests)
packages/web/src/pages/JobEditor.tsx               (M — komplettes ActionCard-Layout, Empty-State, Reorder-Debounce)
package.json                                      (M — version 0.7.0, optional test:web-Script)
packages/web/package.json                          (M — version 0.7.0)
packages/core/package.json                         (M — version 0.7.0)
packages/core/src/cli.ts                           (M — .version("0.7.0"))
packages/core/src/server.ts                        (M — /api/health version "0.7.0")
openspec/config.yaml                               (M — project.version 0.7.0)
README.md                                          (M — Status-Line, Feature-Bullet)
CHANGELOG.md                                       (M — [0.7.0]-Sektion)
openspec/changes/v0.7.0-edit-job-ui-polish/        (NEU — diese 3 Dateien)
```

**Unverändert:** `packages/core/src/actions/`, `packages/core/src/scheduler/`, `packages/core/src/store/`, `packages/core/src/security/`, `packages/core/src/stats/`, `packages/core/src/daemon.ts`, `packages/core/src/config.ts`, `packages/core/src/logger.ts`, `packages/core/src/schemas.ts`, `packages/core/src/types.ts`, `packages/web/src/types.ts`, `packages/web/src/lib/api.ts`, `packages/web/src/lib/types.ts` (außer Versions-Spiegelung, falls überhaupt nötig), `packages/web/src/main.tsx`, `packages/web/src/App.tsx`, `packages/web/src/styles.css`, `bin/`, `scripts/`, `tsconfig*.json`, `docs/API.md` (kein API-Diff), `docs/ARCHITECTURE.md`, `docs/SECURITY.md`. Storage-Format bleibt byte-identisch.

---

## 6. Risiken & Gegenmaßnahmen

| #   | Risiko | Wahrsch. | Impact | Gegenmaßnahme |
|-----|--------|---------:|-------:|---------------|
| R1  | **Bundle-Size-Plus** durch 4 neue Lib-Helper + komplexere ActionCard. | Niedrig | Niedrig | Die Lib-Helper sind trivial (`truncateUrl` ist 5 Zeilen). ActionCard wächst um ~50 Zeilen Markup. Geschätzt < 2 KB gzip extra. Bundle-Analyse optional; im Notfall Tree-Shake-friendly Exports. |
| R2  | **N+1-Status-Badge-Requests** — naive Implementierung ruft `api.runs.list` pro Action auf. | Mittel | Mittel | **Festgelegt:** ein einziger `api.runs.list({ jobId, limit: 50 })` beim Job-Load. Index `Map<actionId, ActionRun>` client-side. Status-Badge ist derived. Bei >50 Runs in der Historie wird der älteste übersehen — acceptable, weil immer die neuesten 50 zuerst relevant sind. |
| R3  | **Reorder-Debounce race mit Save** — User klickt Up, dann schnell Save; Save feuert mit alter Position, Debounce-PATCH feuert danach mit neuer. | Mittel | Niedrig | Save ruft **vor** dem PATCH ein `cancelPendingReorder()` auf (clearTimeout), so dass nur der Save-PATCH rausgeht. Save-PATCH hat das aktuelle State (Up-Klick war schon im State). Reihenfolge: Up-Klick → setState → debounce.schedule → Save → cancelDebounce + PATCH-mit-State. |
| R4  | **`position`-Renumbering ändert `id` versehentlich.** | Niedrig | Hoch | Reorder-Funktion ist explizit `arr.map((a, newPos) => ({ ...a, position: newPos }))` — IDs bleiben unverändert (Spread + nur `position` überschrieben). Pure-Function-Test in `actionOrder.test.ts` verifiziert ID-Stabilität. |
| R5  | **Status-Badge-Drift zwischen Editor und Runner-Output** — wenn der User speichert, sieht er die alten Status-Badges, obwohl die Actions jetzt umsortiert sind. | Niedrig | Niedrig | Badges sind pro `actionId` indiziert, nicht pro Position. Sortierung ändert nichts. |
| R6  | **`<details>`-State-Konflikt mit React-Renders** — Browser-native `<details>` wird vom DOM kontrolliert, nicht von React; wenn React-Re-Render das Markup ersetzt, springt der `open`-State zurück. | Mittel | Mittel | `<details>` wird **außerhalb** des Re-Renders gehalten, wo möglich (z. B. einmal pro Action-Card-Lifecycle). `defaultOpen={isNew}` als kontrollierter Default; State-Updates via `key`-Stabilität. Bei Browser-Inkonsistenz: `useState(open)` als controlled fallback (siehe D9). |
| R7  | **`formatRelativeTime` zeigt Müll bei `invalidDate`**, wenn `Run.finishedAt` mal `undefined` ist (running-Run ohne finishedAt). | Niedrig | Niedrig | Pure-Function-Test deckt `formatRelativeTime(undefined)` ab → gibt `—` zurück. Badge-Mapping entscheidet **vorher** anhand von `status === "running"` → Label `⋯ running`, nicht `never`. |
| R8  | **Reorder-Buttons ohne ARIA-Labels** — Tastatur-Nutzer und Screenreader können die Funktion nicht nutzen. | Niedrig | Mittel | `aria-label="Move action #2 up"` und `aria-label="Move action #2 down"`. Disabled-State mit `aria-disabled`. Icon ist `<svg aria-hidden="true">`. |
| R9  | **Doppel-PATCH beim Test-Run**: Test-Run speichert implizit (`save` + `run`); Reorder-Debounce kann parallel laufen. | Niedrig | Niedrig | `testRun()` ruft zuerst `await cancelPendingReorder()` auf, dann `save()`-Logik. Kein paralleler PATCH. |
| R10 | **`<details>` verliert Fokus auf Toggle-Klick** im Chromium-basierten Browser. | Niedrig | Niedrig | Native-Verhalten akzeptieren; Focus-Restoration ist nicht Teil der Anforderung. |
| R11 | **`@radix-ui/react-icons` Icon-Namen falsch geschrieben** (z. B. `DragHandleDots2Icon` vs. `DragHandleDots2`). | Niedrig | Niedrig | Icon-Set ist bekannt und klein; `grep`-Check in `tasks.md → T2` verifiziert die Import-Namen. Build-Failure bei falschem Namen ist sofort sichtbar. |
| R12 | **`data-testid`-Hooks vergessen** — Smoke kann nicht greifen, Reviewer kann nicht prüfen. | Niedrig | Mittel | Reviewer-Checkliste in `design.md §11` listet die 8 erwarteten `data-testid`-Werte. S1–S6 sind explizit gegen diese IDs formuliert. |

---

## 7. Rollback

Weich-Rollback (ein `git revert`):

1. `packages/web/src/pages/JobEditor.tsx` zurück auf die alte `ActionCard`-Variante (form-first, badges als Text, keine Reorder-Buttons).
2. `packages/web/src/lib/{actionSummary,actionStatus,actionOrder,formatRelative}.ts` löschen — werden durch Soft-Rollback ungenutzt.
3. Versionsstrings zurück auf `0.6.0`.
4. README-Status-Line und CHANGELOG-Eintrag entfernen (oder als „experimental" markieren).

Hart-Rollback: nicht nötig — keine Datenmodell-Änderung, kein Storage-Diff, keine Backend-Änderung. Der Editor ist eine reine Client-Side-Sicht auf die vorhandene Datenstruktur.

**Breaking Change für User:** keiner. Das Editor-Verhalten ändert sich (UI-Polish), aber die persistierten Daten bleiben kompatibel. Ein Job, der in v0.6.0 gespeichert wurde, sieht im v0.7.0-Editor genauso aus wie vorher, nur mit Summary-Header und Status-Badge on top.

---

## 8. Decisions getroffen ohne explizite Nutzernachfrage (bitte bestätigen oder überschreiben)

Der Parent-Briefing war detailliert, aber an mehreren Stellen nicht eindeutig. Diese Punkte hat der Proposer entschieden — sie stehen alle zur Disposition:

| #   | Entscheidung | Begründung | Override-Pfad |
|-----|-------------|-----------|---------------|
| D1  | **Dense Renumbering**: bei jeder Reorder-Bewegung werden alle `position`-Werte 0..n-1 renummeriert. Sparse positions (`0, 2, 5, 7`) sind verboten. | Passt zur bestehenden `removeAction`-Logik (Zeile 102 in `JobEditor.tsx`, die schon `arr.map((a, i) => ({ ...a, position: i }))` macht). Sparse hätte den Vorteil, dass nur zwei Actions pro Move ihre Position ändern, aber den Nachteil, dass eine Cleanup-Pass bei jeder Save nötig ist, um „Löcher" zu füllen. Bei n≤10 Actions ist Dense billiger. | `tasks.md → T6` kann die `reorder`-Funktion auf Sparse umstellen, wenn der User das bevorzugt. Smoke-Test in S7 muss dann entsprechend umformuliert werden. |
| D2  | **Ein einziger Run-Fetch pro Job-Load**, kein Per-Action-Polling. | Der `api.runs.list({ jobId, limit: 50 })` liefert die letzten 50 Runs des Jobs; die `actionRuns` haben `actionId`. Wir bauen client-side eine `Map<actionId, latestRun>`. Pro `ActionCard` ist die Anzeige derived. Kein Websocket, kein Polling. Bei `save()`-Erfolg: Re-Fetch (User hat gerade geändert, also lohnt der Refresh). | v0.8+ kann einen WebSocket/SSE einführen, der die Map live aktualisiert. |
| D3  | **`<details>`-Element ohne eigenen React-State** (browser-native). | React rendert `<details open={isNew}>`. Browser handhabt Toggle. Spart State + Effect. Trade-off: bei jedem Re-Render kann der State theoretisch überschrieben werden, wenn React das Element neu mounted — wird durch `key`-Stabilität (Action-ID als Key) verhindert. | `useState`-controlled fallback, falls Browser-Inkonsistenz auftritt. |
| D4  | **Keine neue Web-Test-Infrastruktur** (kein Vitest, kein `@testing-library/react`, keine JSDOM). Stattdessen: **vier reine Helper-Module mit `*.test.ts`-Dateien**, die via `node --test --import tsx` ausgeführt werden. Skript-Erweiterung in `package.json`: `"test:web": "node --test --import tsx 'packages/web/src/lib/**/*.test.ts'"`. Bestehender `npm test`-Script bleibt unverändert (core only). | Parent-Constraint: „No new dependencies". `node --test` ist Built-in. Skript-Änderung ist nicht-Dep. Die Helper sind das Risiko-tragende Element — Komponenten sind dünnes Markup über ihnen. | Verzicht auf Helper-Tests zugunsten von Reviewer-Eye-Check. Bei viel Geschäftslogik in ActionCard selbst müsste ein React-Testing-Setup her. |
| D5  | **Status-Color-Mapping:** success = `text-success` (grün), failed = `text-error` (rot), running = `text-info` (blau), never = `text-base-content/40` (grau). Icons: `CheckCircledIcon`, `CrossCircledIcon`, `ReloadIcon` (rotierender Bogen, „running"), `MinusIcon` (Em-Dash-Linie für „never"). | DaisyUI-Theme ist Gruvbox: `success` = soft-green, `error` = soft-red, `info` = soft-blue, neutral = base-content mit Opacity. Visuell unterscheidbar auf hellem und dunklem Gruvbox-Background. | Andere Icons (`CircleCheck`, `ExclamationTriangle`, `Clock`, `CircleBackslash`) sind ggf. näher an der bestehenden Iconographie. |
| D6  | **Reorder debounce 250 ms** — exakt wie im Briefing. | Üblich für UX (instant feedback + batch). Save/Test-Run kann den Debounce abbrechen (R3, R9). | 100 ms (snappier) oder 500 ms (mehr batching). |
| D7  | **Icon-Set:** Globe für Webhook (per Briefing), Code für Shell (statt Terminal — Code ist eine Zeile kürzer und semantisch passend). Up = `ChevronUpIcon`, Down = `ChevronDownIcon`. Drag-Handle (visuell, kein DnD) = `DragHandleDots2Icon` (≡-Symbol). | `@radix-ui/react-icons` hat alle vier. DragHandleDots2 ist das kanonische „drei waagerechte Punkte"-Icon und kommuniziert „du kannst das hier bewegen" ohne echte DnD-Funktionalität zu implizieren (wir dokumentieren in Tooltip, dass Klick auf Pfeile die einzige Bewegungsmöglichkeit ist). | Terminal statt Code; CaretUp/CaretDown statt Chevron; Minus statt MinusIcon. |
| D8  | **Default collapsed** für existierende Jobs (per Briefing) UND **erste Action auto-expanded** für neue Jobs (per Briefing: „expanded by default for the 'Add new' path so the user can fill it in"). | Beide Pfade werden im `ActionCard` über `defaultOpen={isNew}` gesetzt. Bestehender Job: alle collapsed. Neuer Job: alle expanded. | Bewusst alles collapsed (auch für neue Jobs) — User klickt auf Edit wenn er editieren will. |
| D9  | **`<details>` uncontrolled** mit `defaultOpen`. Browser-State ist Source of Truth. Toggle funktioniert ohne React-Re-Render. | Native-Verhalten ist robust, schnell und barrierefrei. Controlled State bräuchte `useState` pro Card + Listener auf Toggle-Event. | Controlled (`useState<boolean>` + `onToggle`) falls Browser-Inkonsistenz beobachtet wird. |
| D10 | **Status-Badge-Zeit**: relative Form (`12ms ago`, `3m ago`, `2h ago`) für < 24 h, dann `Yesterday`, dann `MMM D` (z. B. `Jul 1`). | Standard-UX. Konsistent mit anderen Stellen, wo relativ angezeigt wird (Dashboard recent-runs). |
| D11 | **Reorder ist rein visuell, kein Toast / Confirmation** — der Patch ist idempotent und speichert das, was der User sieht. | Toasts sind Lärm. Save-Button ist explizit. |
| D12  | **Bundle-Size-Threshold**: kein Hard-Limit, aber `npm run build` muss grün sein und das Web-Bundle wird im PR-Kommentar dokumentiert (Delta vs. v0.6.0). | Konsistent mit v0.5.0 / v0.6.0 Prozess. |
| D13 | **`summary()` Webhook-URL-Truncation**: bei `url.length > 50`, kürze auf 47 + `…`. Behält das Schema (http://, https://) intakt. | Visuell scannbar in einer 5xl-Card-Header. |
| D14 | **Empty-State-Platzierung**: zwei Cards nebeneinander (Grid 1×2 auf Mobile, 2×1 auf Desktop), mit `btn btn-lg` und zentriertem Icon. | Briefing erwähnt „zwei große Cards" — Grid-Layout ist Standard für „wähle eins von zwei". |

Siehe `design.md` für die technische Begründung jeder Entscheidung (insbesondere §3 für die Status-Mapping-Tabelle, §4 für die `summary()`-Funktion, §5 für die Reorder-State-Machine, §6 für die `<details>`-Constraints).

---

## 9. Migration: v0.6.0 → v0.7.0

Keine Storage-Migration. Keine Daten-Migration. Kein Breaking Change im API-Vertrag.

**Bestandsjobs** öffnen sich automatisch im neuen Layout — alle Action-Cards collapsed, Summary-Header on top, Status-Badge on top-right. Der User **merkt** die Änderung nur, wenn er eine Card aufklappt oder den Status-Badge zum ersten Mal sieht.

**Konfigurations-Migration:** keine. Alle bestehenden `WebhookConfig`/`ShellConfig`-Felder bleiben unverändert.

**Reorder-Migration:** wenn ein User in v0.6.0 Actions hinzugefügt und gelöscht hat, hat er bereits dichte `position` 0..n-1 (siehe `removeAction` in `JobEditor.tsx`). v0.7.0 setzt das fort — beim ersten Reorder werden alle Positionen auf 0..n-1 renummeriert (D1).

---

## 10. Offene Fragen an den Parent / Nutzer (vor `sdd-apply`)

Diese Fragen hat der Proposer **nicht** entschieden. Sie sind als Vorschläge markiert; bei Auto-Modus fährt der Proposer mit den Defaults aus §8 weiter, aber der Parent kann jeden Punkt überschreiben:

| #   | Frage | Default-Annahme | Override |
|-----|-------|-----------------|----------|
| Q1  | Soll die erste Action eines **neuen** Jobs auto-expanded sein (sofortige Editier-Möglichkeit), oder alle collapsed (User klickt selbst)? | Auto-expand für neue Jobs (D8). | „Alles collapsed" — dann muss der User explizit aufklappen. |
| Q2  | Soll die Status-Zeit relativ (`12ms ago`) oder absolut (`13:42:05`) sein? | Relativ für < 24 h (D10). | „Immer absolut" — dann ist die S1/S4-Regex anders. |
| Q3  | Soll das **Reorder** einen Toast / Undo-Button triggern, oder ist es stiller Direct-Save? | Stiller Save mit PATCH (D11). | „Toast mit Undo" — würde weiteres Component + State bedeuten. |
| Q4  | Soll der **Status-Badge** auch für `partial`-Runs (Action hat ggf. bei Retry-Action teilweise funktioniert) einen eigenen Zustand zeigen? | Aktuell nur `running`/`success`/`failed`/`never` (D5). | „partial" als eigener Status (gelb, `ExclamationTriangleIcon`). Erfordert Mapping-Update in `actionStatus.ts`. |
| Q5  | Soll die `<details>`-State **pro Card persistiert** werden (LocalStorage), so dass beim erneuten Öffnen des Editors die gleiche Card noch expanded ist? | Nein — beim Reopen alles auf Default. | „Ja, persist pro Job+Action" — LocalStorage-Key `cronboard.editor.expanded.<jobId>.<actionId>`. |

Wenn der Parent keine Überschreibungen liefert, fährt `sdd-apply` mit den Defaults aus §8 + Q1–Q5 = „Auto-expand für neue Jobs, relative Zeit, stiller Save, partial → failed (vereinfacht), keine Persistenz".

---

## 11. Glossar

- **ActionCard:** innere Komponente in `JobEditor.tsx`, die eine einzelne `JobAction` als visuell eigenständige Karte rendert. Vor v0.7.0: reines Form. Ab v0.7.0: Header (Summary + Status-Badge + Reorder + Continue + Delete) + collapsible Details (Form).
- **Summary:** einzeilige Voransicht einer Action (`POST https://…` oder `$ cmd (cwd, timeout)`). Derived aus `action.type` + `action.config`.
- **Status-Badge:** rechts oben auf der ActionCard; zeigt den Zustand des letzten `ActionRun` für diese `actionId`.
- **Reorder:** UI-Aktion, die `position` zweier benachbarter Actions vertauscht. Rein client-side; persistiert via debounced `PATCH /api/jobs/:id`.
- **Dense vs Sparse Positions:** Dense = 0..n-1 lückenlos; Sparse = erlaubt Lücken (`0, 2, 5`), Renumbering nur bei Cleanup. v0.7.0 ist Dense (D1).
- **Skill resolution:** Status-Reporting dieses Sub-Agents an den Parent. `none` = keine Skill-Pfade vom Parent injiziert, keine `.atl/skill-registry.md` im Repo, kein Fallback-Loading versucht.

---

## 12. Empfohlene nächste Phase

Nach Freigabe durch den Parent: **`sdd-apply`** (Implementierung gemäß `tasks.md`). `sdd-verify` danach prüft S1–S8 gegen den Diff.