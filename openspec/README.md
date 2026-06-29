# openspec/

OpenSpec-Artefakte für das `cronboard`-Projekt. Dieser Ordner ist die
Single Source of Truth für die SDD-Pipeline (Spec-Driven Development)
und enthält keine Anwendungslogik.

## Inhalt

| Pfad | Zweck |
|---|---|
| `config.yaml` | Projekt-Metadaten, Tech-Stack, Test-Kommandos, Rules, Phasen-Pipeline. Wird von jeder SDD-Phase gelesen. |
| `changes/` | Laufende und abgeschlossene Changes. Jeder Change liegt in `changes/<change-id>/` mit `proposal.md`, `tasks.md` und optional `design.md`. |
| `changes/archive/` | Abgeschlossene Changes (von `sdd-archive` verschoben). Wird nicht gelöscht (Rule: `append-only-sdd-artifacts`). |
| `README.md` | Diese Datei. |

## Pflege

- **Lokal editieren** — `config.yaml` ist die einzige Datei, die von Hand
  aktualisiert wird, wenn sich Stack, Tests oder Regeln ändern.
- **Nicht in `packages/` schreiben** — Init / Propose / Archive fassen
  den Quellcode nicht an. Nur `sdd-apply` darf dort Änderungen
  vornehmen, und nur im Rahmen eines freigegebenen Changes
  (`Rule: no-source-touch-in-sdd-init`).
- **Phase-Pipeline** siehe `config.yaml` → `phases.pipeline`.

## Erste Schritte nach diesem Init

1. `git add openspec/ AGENTS.md .atl/`
2. Einen ersten `sdd-propose`-Lauf für eine geplante Änderung
   starten — der Runner liest `config.yaml` und legt
   `openspec/changes/<change-id>/` an.
3. Vor dem ersten Feature-Change in `packages/core/`: mindestens
   eine `*.test.ts` ergänzen, damit `strict_tdd: true` tatsächlich
   greift (siehe `Rule: test-coverage-gap-disclosed`).
