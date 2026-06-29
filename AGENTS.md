# AGENTS.md

Regelwerk für KI-Agenten, die im `cronboard`-Repository arbeiten.
Spiegelt die in `openspec/config.yaml` deklarierten Regeln und macht
sie für jeden Agenten direkt am Repo-Root sichtbar.

> **Single Source of Truth** für verbindliche Constraints ist
> `openspec/config.yaml` → `rules`. Wenn diese Datei davon abweicht,
> gewinnt `config.yaml`.

## 1. Scope

Du arbeitest in einem **Node 20+ / TypeScript-strict / ESM-Monorepo**
mit zwei Paketen:

- `packages/core` — CLI, Scheduler, Fastify-Server, JSON-Storage,
  Actions (Webhook / Shell), Daemon
- `packages/web` — Vite + React 18 + **Radix Themes v3** UI
  (Dashboard, Jobs, Editor, Runs, Settings)

Privates Repo (`"private": true` in beiden `package.json`).
**Niemals** `npm publish` ausführen.

## 2. Stack-Constraints (nicht verhandelbar)

| # | Regel | Konsequenz |
|---|---|---|
| 2.1 | **Radix Themes only** — kein Tailwind, kein shadcn, kein anderes Utility-CSS-Framework, keine zweite Komponentenbibliothek. | CSS ausschließlich in `packages/web/src/styles.css`. Icons ausschließlich aus `@radix-ui/react-icons`. |
| 2.2 | **TypeScript strict + ESM** | Kein `any` ohne Begründung, kein `@ts-ignore` ohne Ticket, kein `verbatimModuleSyntax: true` (Projekt entscheidet sich bewusst dagegen). |
| 2.3 | **Node 20+** | Keine Node 22-only Syntax, keine Node 18-Polyfills. |
| 2.4 | **Local-first Default-Bind** | `127.0.0.1` ohne Auth. Bind auf `0.0.0.0` erzwingt `--token` und Bearer-Auth auf `/api/*`. |
| 2.5 | **Windows-aware Storage** | JSON-Writes nur über `temp + rename` mit EPERM/EACCES/EBUSY-Retry (5× exp. Backoff) und Fallback. `fs.watch` mit mtime-Cache + Debounce + Re-Entry-Guard. Per-File-Mutex auf Reads. |
| 2.6 | **Storage-Pfad** | Default `~/.config/cronboard/`, überschreibbar via `CRONBOARD_DATA_DIR` oder `--data`. |
| 2.7 | **Run-Cap** | Runs werden auf die letzten 1000 begrenzt — ältere werden verworfen. Keine "alle Runs für immer"-Behauptungen. |

## 3. Phasen-Disziplin (SDD)

| Phase | Erlaubt | Verboten |
|---|---|---|
| `sdd-init` | Dateien in `openspec/`, `AGENTS.md`, `.atl/`, `openspec/changes/.gitkeep` | Alles unter `packages/` und `bin/` |
| `sdd-propose` | Dateien unter `openspec/changes/<change-id>/` | Quellcode-Änderungen |
| `sdd-apply` | Quellcode in `packages/`, **ausschließlich** im Rahmen eines freigegebenen `proposal.md` + `tasks.md` | Scope-Drift, unbeauftragte Refactors |
| `sdd-verify` | Lesen, Review-Kommentare, Diff-Analyse | Writes |
| `sdd-archive` | Verschieben nach `openspec/changes/archive/` | Löschen früherer Artefakte |

## 4. TDD

- `strict_tdd: true` ist in `openspec/config.yaml` gesetzt.
- **Bekannter Gap:** Es existieren **keine** `*.test.ts` unter
  `packages/core/src/`. Der Runner (`node --test --import tsx`) und
  der Glob sind verdrahtet, aber ungenutzt.
- **Konsequenz:** Der erste `sdd-apply` für ein neues Feature in
  `packages/core/` muss den fehlenden Test *im selben Change*
  mitliefern. Sonst ist `strict_tdd` nicht durchsetzbar.
- Web (`packages/web/`) hat aktuell keine Test-Infrastruktur. Nur
  aufbauen, wenn die erste sinnvolle Unit isolierbar ist (kein
  React-Component-Test-Setup "auf Vorrat").

## 5. Konventionen

- **Dateinamen** PascalCase für React-Components
  (`packages/web/src/pages/JobEditor.tsx`), camelCase für alles
  andere in TS.
- **Exports** benannt, nicht default, wo möglich (Tree-Shaking
  + Refactor-Sicherheit).
- **Logging** über `pino` (`packages/core/src/logger.ts`),
  strukturiert, kein `console.log` in Produktionspfaden.
- **Konfiguration** über `zod`-Schemas in
  `packages/core/src/schemas.ts` validieren, nie blind vertrauen.
- **Fehlerbehandlung** Fastify-typisch: `reply.code(...).send({...})`,
  keine ungefangenen throws in Route-Handlern.
- **Pfade** immer via `path` aus `node:path` (Plattform-Sicherheit
  auf Windows).

## 6. Verboten

- `packages/` editieren in `sdd-init`, `sdd-propose`, `sdd-archive`.
- `openspec/config.yaml` ohne expliziten User-Auftrag ändern.
- Bestehende Phase-Artefakte löschen / umschreiben
  (Rule `append-only-sdd-artifacts`).
- Commits direkt auf `master`, wenn die Repo-Konvention später
  einen PR-Workflow etabliert (siehe `Rule: branch-pr` aus dem
  Gentle-AI-Skill-Set).
- `npm publish` — beide Pakete sind `private`.
- Frontend-Code ohne laufendes `npm run typecheck -w packages/web`
  mergen.

## 7. Vor dem Antworten prüfen

1. Welche SDD-Phase bin ich? Steht mein Schreibvorschlag in der
   richtigen Spalte von Abschnitt 3?
2. Berühre ich Quellcode, der nicht im aktiven
   `openspec/changes/<change-id>/tasks.md` steht? → Stopp, klären.
3. Habe ich die Storage-Regel (2.5) verletzt? Kein direkter
   `fs.writeFileSync` in `packages/core/src/store/`.
4. Habe ich eine Komponente oder ein Style-Token eingeführt, das
   nicht aus Radix Themes stammt? → Regel 2.1.
5. Würde mein Diff das `strict_tdd`-Gate brechen, ohne dass ein
   Test dazukommt? → Test vorher schreiben (Regel 4).
