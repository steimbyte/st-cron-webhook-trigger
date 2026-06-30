# Tasks: v0.3.0-cleanup-ui-deps

> **Reihenfolge:** T0 → T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8. Jeder Task endet mit einem Gate, das vor dem nächsten Task grün sein muss.
> **TDD-Postur:** Kein neuer Quellcode, also keine neuen Tests nötig. Aber die **Regressionstests** in T3 / T4 / T5 / T7 sind harte Gates — wenn sie brechen, ist die Annahme „ungenutzt" falsch (siehe `proposal.md → R1, R3, R5`).
> **Datei-Konvention:** jeder Task listet die Dateien, die er anfasst (R = lesen, M = schreiben, C = anlegen). Diese Tasks sind für **`sdd-apply`**, nicht für `sdd-propose` — `sdd-propose` ist mit dem Schreiben dieser Datei fertig.

---

## T0 — Pre-flight: Audit-Bestätigung & Re-Verifikation

> **Status:** Vom Parent bereits durchgeführt (siehe Chat-Kontext). Dieser Task dokumentiert nur das Ergebnis und führt **eine** letzte `grep`-Re-Verifikation durch, damit `sdd-apply` auf einer frischen Master-Spur startet.

- **R** `packages/web/package.json` — bestätige die fünf Deps sind tatsächlich noch drin (aktuell ja: `@radix-ui/themes`, `@radix-ui/react-popover`, `react-router-dom`, `react-aria-components`, `date-fns`).
- **R** `packages/web/src/**/*.{ts,tsx,css}`
- **R** `packages/core/src/**/*.{ts,tsx}`
- **R** `packages/web/vite.config.ts`
- **R** `packages/web/tsconfig.json`
- Ausführen:
  ```bash
  # muss jeweils 0 Treffer liefern
  grep -RIn --include='*.ts' --include='*.tsx' --include='*.css' \
    -E '@radix-ui/themes|@radix-ui/react-popover|react-router-dom|react-aria-components|date-fns' \
    packages/ || echo "OK: keine Treffer"
  ```
- **Gate:** Befehl exit 0 mit `OK: keine Treffer` im Output. Eine Zero-Match-Notiz in die sdd-apply-Commit-Message aufnehmen.

> Begründung des Eltern-Audits (für die Übergabe):
> - `@radix-ui/themes`: ersetzt durch DaisyUI im v0.2.0-Redesign.
> - `@radix-ui/react-popover`: Popover-Wrapper für die alte Calendar; Calendar rendert jetzt inline.
> - `react-router-dom`: nie verdrahtet — Views werden per React-State geschaltet.
> - `react-aria-components`: Backbone der alten Clock (TimeField); Clock wurde in v0.2.0 gelöscht.
> - `date-fns`: Peer der `react-aria-components` TimeField; sonst nicht verwendet.

---

## T1 — Fünf Deps aus `packages/web/package.json` entfernen

- **M** `packages/web/package.json`
- Konkret: in `dependencies` diese fünf Einträge entfernen, **Reihenfolge im File** wird durch das Aufräumen der Kommata sauber gehalten:
  - `"@radix-ui/themes": "^3.1.3",`
  - `"@radix-ui/react-popover": "^1.1.17",`
  - `"react-router-dom": "^6.23.0",`
  - `"react-aria-components": "^1.19.0",`
  - `"date-fns": "^3.6.0",`
- Verbleibend in `dependencies` (laut Parent): `react`, `react-dom`, `cronstrue`, `react-day-picker`, `@radix-ui/react-icons`.
- **Gate 1.1:** `python -c "import json; json.load(open('packages/web/package.json'))"` oder `node -e "JSON.parse(require('fs').readFileSync('packages/web/package.json'))"` exit 0 (JSON valid).
- **Gate 1.2:** `grep -E '@radix-ui/themes|@radix-ui/react-popover|react-router-dom|react-aria-components|date-fns' packages/web/package.json` liefert 0 Treffer.
- **Gate 1.3:** `grep "react-day-picker" packages/web/package.json` und `grep "@radix-ui/react-icons" packages/web/package.json` liefern jeweils 1 Treffer.

> T1 ändert **nur** die `package.json`. Keine Quelle, kein Lockfile — das passiert in T2.

---

## T2 — `npm install` und Lockfile-Regeneration

- **M** `package-lock.json` (regeneriert)
- Kein `M` an Quellcode.
- Ausführen (PowerShell, im Repo-Root):
  ```powershell
  npm install
  # falls Peer-Konflikte auftauchen:
  # npm install --install-strategy=hoisted
  ```
- **Gate 2.1:** Exit 0, keine Konsolen-Fehler. Warning-Level-Meldungen über fehlende Peer-Deps sind OK (sollten aber 0 sein).
- **Gate 2.2:** `git diff --stat package-lock.json` zeigt nur **eine** Datei. Keine versehentliche Änderung an `packages/*/package-lock.json` oder `packages/*/node_modules/**` indiziert.
- **Gate 2.3:** Sanity-Check — `git diff package.json packages/*/package.json` muss nach T2 weiterhin leer sein (T1-Änderungen sind schon drin).

> `--install-strategy=hoisted` ist die im Bestand laufende Strategie. Falls ohne Flag Konflikte auftreten, wird das `--install-strategy=hoisted` gemäß Parent-Anweisung nachgereicht.

---

## T3 — Typecheck und Build (beide Pakete)

- **R** `tsconfig.base.json`, `packages/core/tsconfig.json`, `packages/web/tsconfig.json`
- Ausführen (im Repo-Root):
  ```powershell
  npm run typecheck    # beide Pakete
  npm run build:web    # Web baut via Vite
  ```
- `npm run build` ist optional als End-to-End-Check; `:web` reicht, weil `packages/core` nur Typecheck hat.
- **Gate 3.1:** `typecheck-web.log` zeigt `exit 0` (oder direkt `echo $LASTEXITCODE` nach `npm run typecheck`).
- **Gate 3.2:** `web-build.log` zeigt `vite build` erfolgreich; `packages/web/dist/index.html` und `packages/web/dist/assets/*.js` existieren.
- **Gate 3.3 (Regression):** keine `tsc`-Fehler, die vor T1 nicht da waren (Diff-Vergleich mit dem Log-Stand **vor** dem Branch — sollte trivial passen, weil wir keinen Quellcode anfassen).

> T3 ist die erste Stelle, an der ein „die Annahme war falsch"-Risiko (R1, R3) praktisch sichtbar wird. Wenn `tsc` nach T1 Fehler zeigt, die vor T1 nicht da waren, **stoppen** und den ursprünglichen `grep` aus T0 erweitern (transitive Importe prüfen).

---

## T4 — Unit-Tests (Regression)

- **R** `packages/core/src/scheduler/cronExpr.test.ts`
- Ausführen (im Repo-Root):
  ```powershell
  node --test --import tsx packages/core/src/scheduler/cronExpr.test.ts
  ```
- **Gate 4.1:** Tests sind weiterhin **63/63 grün**. Eine abweichende Anzahl ist sofort zu eskalieren — das wäre ein echtes Bug-Signal (entweder hat das Deinstallieren doch eine Hilfsfunktion weggerissen, oder das Test-Setup hat sich verändert).
- **Gate 4.2 (optional, falls weitere `*.test.ts` existieren):** `npm test` (im Root) läuft ebenfalls grün. Glob ist `packages/core/src/**/*.test.ts`. Falls der Glob nichts findet, ist das OK — wir ändern ja nichts daran.

---

## T5 — Smoke `scripts/smoke-ui.ps1` (UI-Schicht)

- **R** `scripts/smoke-ui.ps1`
- **R** `scripts/smoke.ps1` (zur Sicherheit, ob es auch relevant ist — Parent hat explizit `smoke-ui.ps1` genannt)
- Ausführen:
  ```powershell
  powershell -ExecutionPolicy Bypass -File scripts/smoke-ui.ps1
  ```
- **Gate 5.1:** Exit 0. Smoke-Log (z. B. `smoke-quick.log` oder ein frischer Run-Output) zeigt alle API-Endpoints antworten + UI wird serviert + Daemon wird sauber abgeräumt.
- **Gate 5.2:** Falls es einen Fehler gibt, der eine **entfernte** Dep vermuten lässt: `sdd-apply` **stoppen**, R1-Variante eskalieren, Original-Grep aus T0 erneut ausführen.

---

## T6 — Version bump `0.2.0` → `0.3.0`

> **Bewusst nicht enthalten** (laut Parent-Constraint):
> - `openspec/config.yaml → project.version` (steht noch auf 0.1.0 — Beobachtung für `sdd-apply` Folge-Tasks).
> - `README.md` Tech-Stack-Tabelle.

- **M** `package.json` (Root) — `"version": "0.2.0"` → `"0.3.0"`
- **M** `packages/web/package.json` — `"version": "0.2.0"` → `"0.3.0"`
- **M** `packages/core/package.json` — `"version": "0.2.0"` → `"0.3.0"`
- **M** `packages/core/src/cli.ts` (Zeile 28) — `.version("0.2.0")` → `.version("0.3.0")`
- **M** `packages/core/src/server.ts` (Zeile 47) — `version: "0.2.0"` → `version: "0.3.0"`
- Ausführen zur Verifikation:
  ```bash
  grep -RIn "0\.2\.0" package.json packages/*/package.json packages/core/src/cli.ts packages/core/src/server.ts
  # erwartet: 0 Treffer
  grep -RIn "0\.3\.0" package.json packages/*/package.json packages/core/src/cli.ts packages/core/src/server.ts
  # erwartet: 5 Treffer (Root pkg, web pkg, core pkg, cli.ts:28, server.ts:47)
  grep -RIn "0\.2\.0" packages/ package.json bin/ scripts/
  # erwartet: 0 Treffer in den genannten Bereichen
  ```
- **Gate 6.1:** Alle drei `grep`-Befehle exit 0 mit den erwarteten Trefferanzahlen.

---

## T7 — Build + Smoke Re-Run (Regression nach Versionsbump)

> Der Versionsbump berührt zwei TypeScript-Quellen. Wenn `tsc` oder das Smoke-Skript daraus einen String-Vergleich bauen, könnte das brechen.

- **R** `packages/core/src/cli.ts`, `packages/core/src/server.ts`
- Ausführen:
  ```powershell
  npm run typecheck
  powershell -ExecutionPolicy Bypass -File scripts/smoke-ui.ps1
  ```
- **Gate 7.1:** Beide Exit 0.
- **Gate 7.2:** Falls ein Fehler mit dem Versionsstring zusammenhängt (z. B. ein Snapshot, der hart auf `0.2.0` vergleicht), **nicht** versuchen zu „reparieren" — stattdessen eskalieren. Sehr unwahrscheinlich, aber das Gate ist genau dafür da.

---

## T8 — Commit und Push

> Commit-Message-Format ist vom Parent vorgegeben — bitte exakt übernehmen, damit Git-Log-Filter („v0.x.y" Suche) weiter funktioniert.

- **M** `packages/web/package.json`
- **M** `package.json`, `packages/web/package.json`, `packages/core/package.json`
- **M** `packages/core/src/cli.ts`, `packages/core/src/server.ts`
- **M** `package-lock.json`
- Ausführen (PowerShell):
  ```powershell
  git add package.json packages/web/package.json packages/core/package.json packages/core/src/cli.ts packages/core/src/server.ts package-lock.json
  git status           # Sanity: nur diese 6 Dateien + ggf. neue Files
  git commit -m "chore(v0.3.0): remove unused UI-framework deps - DaisyUI only"
  git push origin master
  ```
- **Gate 8.1:** `git log -1 --pretty=%s` → `chore(v0.3.0): remove unused UI-framework deps - DaisyUI only`.
- **Gate 8.2:** `git diff master@{1} master --stat` zeigt exakt die oben genannten Dateien (plus ggf. ein neuer `openspec/changes/v0.3.0-cleanup-ui-deps/*.md` Block, der durch das Setup bereits Teil des Commits sein kann).
- **Gate 8.3:** `git diff master@{1} master -- packages/*/src/` darf **nur** die zwei Versionsstring-Änderungen in `cli.ts` + `server.ts` zeigen, sonst nichts. Das ist die wichtigste Review-Schutz-Klausel.

> Hinweis zur Commit-Message: das `chore()`-Präfix wird im Repo für Aufräumarbeiten verwendet (siehe v0.2.0-Historie als Referenz). Major-Bumps ohne API-Bruch sind unüblich, aber durch die Nutzer-Setzung gerechtfertigt — `design.md §1` dokumentiert das.

---

## Cross-Phase-Checkliste (bevor `sdd-apply` als erfolgreich gilt)

- [ ] T0 Audit-Re-Grep grün
- [ ] T1 `package.json` JSON-valid, fünf Deps raus, `react-day-picker` + `@radix-ui/react-icons` drin
- [ ] T2 `npm install` Exit 0, Lockfile sauber
- [ ] T3 `npm run typecheck` + `npm run build:web` Exit 0
- [ ] T4 `cronExpr.test.ts` 63/63 grün
- [ ] T5 `scripts/smoke-ui.ps1` Exit 0
- [ ] T6 fünf Versionsstrings aktualisiert, `grep` zeigt das erwartete Bild
- [ ] T7 typecheck + smoke **nach** Versionsbump weiterhin grün
- [ ] T8 einziger Commit mit der vorgegebenen Message, Push erfolgreich
- [ ] `openspec/config.yaml` ist **nicht** Teil des Diffs (S10 aus Proposal)
- [ ] `git diff packages/*/src/` zeigt nur die zwei Versionsstring-Änderungen
- [ ] Bundle-Size-Drop wird im Commit-Body **nicht** fest verdrahtet — vermessen und in einem Kommentar an `design.md §2` festhalten

---

## Beobachtungen für `sdd-apply` (keine T-Tasks, Empfehlungen)

Diese sind **nicht** Teil dieses Changes, gehören aber in die Köpfe der Anwender:

1. **`openspec/config.yaml → project.version` steht noch auf `0.1.0`.** Beim v0.2.0-Redesign wurde das offenbar nicht mitgezogen. Sollte im sdd-apply-Schritt (oder einem Folge-Change) auf `0.3.0` mitgezogen werden, zusammen mit der Regel-Umstellung.
2. **Regel `radix-themes-only` ist obsolet.** Genauer Wortlaut für die Nachfolgeregel `daisyui-only` liegt in `design.md §4`.
3. **`README.md` Tech-Stack-Tabelle** sollte analog angepasst werden, falls der Nutzer das möchte.

Diese drei Punkte sind bewusst **außerhalb** des hier definierten Tasks-Scopes und bilden entweder einen Folge-Change oder werden im sdd-apply-Schritt zusätzlich erledigt — die Entscheidung liegt beim Nutzer / beim Parent.
