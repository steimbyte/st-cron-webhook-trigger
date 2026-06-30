# Proposal: v0.3.0-cleanup-ui-deps — UI-Framework konsolidieren auf DaisyUI

- **Phase:** sdd-propose → wartet auf Freigabe → sdd-apply
- **Autor:** sdd-proposal sub-agent (parent: gentle-pi harness)
- **Datum:** 2026-06-30
- **Projekt:** `cronboard` (aktuell v0.2.0, steht nach v0.2.0-Redesign auf DaisyUI)
- **Governance:** `openspec/config.yaml`, `AGENTS.md` (Regeln in §2 / §4 haben Vorrang)

---

## 1. Intent

Mit v0.2.0 hat das Projekt auf **DaisyUI + Tailwind 4 + Radix-Icons (nur als Glyphen)** umgestellt. Aus der historisch gewachsenen `packages/web/package.json` sind jedoch noch **fünf UI-Framework-Dependencies** übrig, die seit dem Redesign **nirgendwo mehr im Quellcode verwendet werden**. Diese ziehen Bundle-Größe, Installationszeit, Audit-Oberfläche und kognitive Last mit, ohne Mehrwert zu liefern.

Diese Änderung entfernt die fünf toten Dependencies und hebt die Version als Konsequenz auf **v0.3.0 (Semver-Major)**, weil der Nutzer das explizit als „next major version" gerahmt hat.

**Gleichzeitig geschieht:**

1. **Dependencies aufräumen** — fünf ungenutzte UI-Pakete fliegen raus, DaisyUI ist danach die einzige UI-Library.
2. **Version bump 0.2.0 → 0.3.0** — Semver-Major laut Nutzer-Setzung, keine API-Änderung an CLI/HTTP (siehe `design.md §3`).
3. **Regel-Anpassung vorbereiten** — die Regel `radix-themes-only` in `openspec/config.yaml → rules` ist obsolet; die Nachfolgeregel `daisyui-only` ist im `design.md §4` dokumentiert. **Das eigentliche Ändern von `config.yaml` ist `sdd-apply`-Arbeit** und gehört ausdrücklich nicht in `sdd-propose`.

Das Audit wurde vom Parent bereits durchgeführt (Zero-Match über `grep` gegen `packages/web/src/**`). Details in `tasks.md → T0`.

---

## 2. Scope

### In-Scope

| Bereich | Änderung |
|---|---|
| Dependency-Bereinigung | Entfernung der fünf ungenutzten Pakete aus `packages/web/package.json` (siehe Tabelle unten). |
| Version bump | `0.2.0` → `0.3.0` in drei `package.json`-Dateien + zwei TypeScript-Quellen (siehe `tasks.md → T6`). |
| Lockfile | `package-lock.json` wandert mit der Dep-Änderung als Teil des einzigen `sdd-apply`-Commits. |
| Tests & Gates | Bestehende Unit-Tests (insbesondere `cronExpr.test.ts` mit 63/63) bleiben grün. Smoke (`scripts/smoke-ui.ps1`) bleibt grün. Typecheck (beide Pakete) bleibt grün. |
| Build | `npm run build` baut weiterhin; UI-Bundle wird kleiner. |

**Zu entfernende Pakete** (Audit-Ergebnis des Parents, siehe `tasks.md → T0`):

| Paket | Aktuell | Grund für Entfernung |
|---|---|---|
| `@radix-ui/themes` | `^3.1.3` | Wurde beim v0.2.0-Redesign durch DaisyUI ersetzt. |
| `@radix-ui/react-popover` | `^1.1.17` | War Popover-Wrapper für den alten Kalender; `Calendar.tsx` rendert seit v0.2.0 inline. |
| `react-router-dom` | `^6.23.0` | War nie verdrahtet — die App schaltet Views per React-State. |
| `react-aria-components` | `^1.19.0` | War Backbone der alten `Clock`-`TimeField`; `Clock.tsx` wurde in v0.2.0 gelöscht. |
| `date-fns` | `^3.6.0` | War Peer der `react-aria-components` `TimeField`; sonst nicht verwendet. |

**Was bleibt unverändert** (laut Parent-Audit):

- `react-day-picker@^9.14.0` — `Calendar.tsx` braucht es weiterhin (Monats-Grid, **ohne** Popover).
- `@radix-ui/react-icons@^1.3.0` — wird projektweit als Glyphen-Lieferant genutzt (DaisyUI hat keine äquivalente Icon-Komponente).
- Alle übrigen Deps von `packages/web/package.json`: `react`, `react-dom`, `cronstrue`, `tailwindcss`, `@tailwindcss/vite`, `daisyui`, `vite`, `@vitejs/plugin-react`, `typescript`, `@types/react`, `@types/react-dom`.

### Explicit out-of-scope (Nutzer kann jetzt widersprechen)

- **Konfigurationsregel `radix-themes-only` → `daisyui-only` umschreiben.** Der Vorschlag steht in `design.md §4`. Die tatsächliche Änderung an `openspec/config.yaml` ist `sdd-apply`-Arbeit (Constraint vom Parent).
- **`openspec/config.yaml → project.version` von `0.1.0` auf `0.3.0` mitziehen.** Diese Datei wurde bereits beim v0.2.0-Ship nicht aktualisiert. Ebenfalls `sdd-apply`-Arbeit — wird in diesem Proposal nur als Beobachtung dokumentiert, nicht behoben.
- **`README.md` Tech-Stack-Tabelle aktualisieren.** Sollte mit der Regel-Änderung in `config.yaml` mitlaufen. Ebenfalls `sdd-apply`.
- **Quellcode-Änderungen in `packages/`.** Diese Änderung berührt ausschließlich `packages/web/package.json` (+ Lockfile) und fünf Versionsstrings. **Kein** TS/TSX/CSS wird angefasst.
- **Neue Features, UI-Polish, Migration auf DaisyUI 6.** Außerhalb dieses Scopes.
- **Codemod / automatisches Aufräumen weiterer ungenutzter transitive Deps.** Nicht im Audit; kann ein eigenes Follow-up werden.

---

## 3. Affected areas (für `sdd-apply` — dieses Proposal ist read-only)

### Dateien, die `sdd-apply` modifiziert

```
packages/web/package.json           # 5 Deps entfernen
package.json                        # "version": "0.2.0" → "0.3.0"
packages/web/package.json           # "version": "0.2.0" → "0.3.0"
packages/core/package.json          # "version": "0.2.0" → "0.3.0"
packages/core/src/cli.ts            # .version("0.2.0") → .version("0.3.0")   (Zeile 28)
packages/core/src/server.ts         # version: "0.2.0" → version: "0.3.0"     (Zeile 47)
package-lock.json                   # regeneriert durch `npm install`
```

### Dateien, die `sdd-apply` zur Disposition hat (nicht in diesem Change)

```
openspec/config.yaml                # Regel radix-themes-only → daisyui-only
                                    # project.version: 0.1.0 → 0.3.0 (Aufräumarbeit)
README.md                           # Tech-Stack-Tabelle ggf. anpassen
```

### Unverändert

- `packages/web/src/**`, `packages/core/src/**` (außer den beiden literalen Versionsstrings), `scripts/**`, `bin/**`, `tsconfig*.json`, `.atl/**`, `AGENTS.md`.

---

## 4. Risiken & Gegenmaßnahmen

| # | Risiko | Wahrscheinlichkeit | Impact | Gegenmaßnahme |
|---|---|---|---|---|
| R1 | Eine der fünf „ungenutzten" Deps wird doch irgendwo indirekt gebraucht (z. B. transitive Type-Hilfe, `vite` Plugin, Side-Effect-Import). | Niedrig | Mittel | `sdd-apply` durchsucht **vor** dem `npm install` erneut mit `grep -RIn "<dep-name>" packages/web/src` (siehe `tasks.md → T1`). Bei einem Match: `sdd-apply` stoppt und eskaliert. |
| R2 | `npm install` produziert einen Lockfile-Konflikt im Monorepo (Workspaces). | Niedrig | Niedrig | `npm install` mit `--install-strategy=hoisted` falls nötig; Lockfile als Teil des einzigen Commits (siehe `tasks.md → T2`). Keine separate Lockfile-PR. |
| R3 | `cronExpr.test.ts` bricht, weil eine `date-fns`-Helferfunktion transitiv erwartet wird, die ich nicht sehe. | Sehr niedrig | Hoch | Tests laufen in `tasks.md → T4` direkt **nach** `npm install` und **vor** dem Commit. Bei Rot: stoppen, Ursache analysieren. |
| R4 | Versionsstring an einer übersehenen Stelle. | Mittel | Niedrig | `sdd-apply` durchsucht vor dem abschließenden Commit mit `grep -RIn "0\.2\.0" packages/ package.json bin/ scripts/` und erwartet 0 Treffer (die fünf zu ändernden Stellen sind danach alle `0.3.0`). |
| R5 | Smoke-Test (`scripts/smoke-ui.ps1`) braucht eine der entfernten Deps zur Laufzeit. | Sehr niedrig | Mittel | Smoke läuft in `tasks.md → T5` **nach** Build, **vor** Commit. Bei Rot: Ursache analysieren — wahrscheinlich war die Annahme „ungenutzt" falsch → R1-Variante. |
| R6 | Semver-Major-Bump ohne echten API-Bruch irritiert Nutzer. | Niedrig | Niedrig | Im Tag-/Release-Kommentar dokumentieren: „Major per Nutzer-Setzung; **keine** Public-API-Änderung — `cronboard` ist ein lokales Tool ohne externe Konsumenten." Siehe `design.md §1`. |
| R7 | Bundle-Size-Vergleich fällt kleiner aus als erwartet (treeshaking war besser als gedacht). | Niedrig | Sehr niedrig | Erwartung wird in `design.md §2` als 30–60 KB gz dokumentiert. Wenn der tatsächliche Drop kleiner ist, ist das eine positive Überraschung — keine Aktion nötig. |

---

## 5. Rollback

Diese Änderung ist **rein additiv rückbaubar** in einer Schicht:

1. **Weich-Rollback** (ein Commit): `git revert <merge-commit>`. Die fünf Deps kehren in `packages/web/package.json` zurück, die Versionsstrings zurück auf `0.2.0`, der Lockfile wird regeneriert. Keine Datenmigration, keine Schema-Änderung, keine Config-Änderung.
2. **Hart-Rollback** (zusätzlich): falls auch `openspec/config.yaml` (Regel + `project.version`) angefasst wurde, wird sie ebenfalls zurückgesetzt.

**Keine** Runtime-Config, **keine** Storage-Format-Änderung, **keine** HTTP- oder CLI-API-Änderung. Der Rollback ist eine reine Git-Operation.

---

## 6. Erfolgskriterien

| # | Kriterium | Messverfahren |
|---|---|---|
| S1 | Die fünf Deps sind aus `packages/web/package.json` entfernt. | `grep -E "@radix-ui/themes|@radix-ui/react-popover|react-router-dom|react-aria-components|date-fns" packages/web/package.json` liefert 0 Treffer. |
| S2 | `react-day-picker` und `@radix-ui/react-icons` bleiben vorhanden. | `grep` zeigt beide Pakete weiterhin in `packages/web/package.json`. |
| S3 | `npm install` läuft im Monorepo ohne Peer-Dep-Konflikte (insb. React 18). | Exit 0. |
| S4 | `npm run typecheck` (beide Pakete) ist grün. | Exit 0 für `packages/core` und `packages/web`. |
| S5 | `npm run build` baut die Web-App erfolgreich. | Exit 0; `packages/web/dist/` enthält frische Assets. |
| S6 | Unit-Tests sind grün — insbesondere `cronExpr.test.ts` weiter **63/63**. | `node --test --import tsx packages/core/src/scheduler/cronExpr.test.ts` Exit 0. |
| S7 | Smoke `scripts/smoke-ui.ps1` ist grün, sowohl **vor** als auch **nach** dem Versionsbump (Regression-Check). | Exit 0 in `tasks.md → T5` und `T7`. |
| S8 | Versionsstring ist an allen fünf Stellen auf `0.3.0`. | `grep -RIn "0\.3\.0" package.json packages/*/package.json packages/core/src/cli.ts packages/core/src/server.ts` listet genau fünf Treffer; analog liefert `grep -RIn "0\.2\.0" packages/ package.json bin/ scripts/` 0 Treffer in den genannten Bereichen. |
| S9 | Einziger Commit auf `master` mit der vereinbarten Message. | `git log -1 --pretty=%s` zeigt `chore(v0.3.0): remove unused UI-framework deps — DaisyUI only`. |
| S10 | `openspec/config.yaml` bleibt in diesem Change **unangetastet**. | `git diff openspec/config.yaml` ist leer. Folgeänderungen (Regel `daisyui-only`, `project.version`) sind explizit Folge-Tasks für `sdd-apply` oder ein nachgelagertes Change. |
| S11 | Keine Quellcode-Änderungen unter `packages/{web,core}/src/`. | `git diff --stat packages/*/src/` zeigt nur die fünf geplanten **Versionsstring-Änderungen** in `cli.ts` + `server.ts`, sonst 0. |

---

## 7. Ein-Satz-Zusammenfassung

v0.3.0 entfernt fünf seit dem v0.2.0-DaisyUI-Redesign ungenutzte UI-Framework-Dependencies aus `packages/web/package.json`, lässt Tests, Typecheck, Build und Smoke unangetastet, hebt die Version per Nutzer-Setzung auf `0.3.0` (Semver-Major, aber **keine** Public-API-Änderung), und bereitet in `design.md` die Regel-Umstellung `radix-themes-only` → `daisyui-only` als sauberen `sdd-apply`-Follow-up vor.

---

## 8. Entscheidungen ohne explizite Nutzernachfrage (bitte bestätigen oder überschreiben)

1. **Kein Quellcode-Touch.** Diese Änderung ist strikt „Dependencies + Versionsstring". Wenn der Nutzer gleichzeitig `config.yaml` umgestellt haben möchte, gehört das in einen **zweiten** Change oder in den sdd-apply-Schritt (siehe S10).
2. **Version-Bump-Scope = die vom Parent genannten fünf Stellen.** Nicht enthalten: `openspec/config.yaml → project.version` (steht seit v0.2.0 auf dem falschen Wert `0.1.0` — `sdd-apply` Beobachtung).
3. **Lockfile im selben Commit.** Kein zweiter „chore: lockfile" PR — das würde das Review verdoppeln.
4. **Kein neues Package, kein neues Tooling.** Alles wird mit `npm install` (Standard) erledigt; `--install-strategy=hoisted` nur bei Bedarf.
5. **Smoke-Skript unverändert.** Wir nutzen das bestehende `scripts/smoke-ui.ps1` (laut Parent), nicht ein neues.
6. **Regel `daisyui-only` wird nur dokumentiert, nicht geschrieben.** Parent-Constraint; siehe `design.md §4` für den exakten Wortlaut, den `sdd-apply` dann übernehmen kann.

Siehe `design.md` für die technische Begründung und `tasks.md` für die TDD-geordnete Schritt-für-Schritt-Liste.
