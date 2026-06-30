# Design: v0.3.0-cleanup-ui-deps

> Begleitend zu `proposal.md` und `tasks.md`. Diese Datei ist die technische Quelle der Wahrheit für die nicht-trivialen Entscheidungen in diesem Change (Semver-Major-Setzung, Bundle-Erwartung, Regel-Nachfolger). Behandle sie als `sdd-verify`-Checkliste.

---

## 1. Warum Semver-Major (0.2.0 → 0.3.0)?

Streng nach Semver-Spezifikation ist diese Änderung **keine** Major-Bump-qualifizierende Änderung: Es werden Dependencies entfernt, ohne dass eine **öffentliche** API (HTTP-Endpoints, CLI-Subcommands, JSON-Schemas für Storage) gebrochen wird. Eigentlich wäre `0.2.1` (Patch bei reiner Cleanup-Arbeit) oder `0.3.0` (Minor) korrekt.

**Trotzdem heben wir auf `0.3.0`.** Gründe:

1. **Nutzer-Setzung.** Der Nutzer hat im Briefing explizit „next major version" gefordert. Diese Entscheidung respektieren wir.
2. **Privates Tool, keine externen Konsumenten.** Cronboard ist ein lokal-first Werkzeug ohne NPM-Publish und ohne externe API-Konsumenten. Der Semver-Major-Vertrag ist daher de facto leer — er richtet sich an niemanden außer an den Nutzer selbst, und der hat den Bump gewünscht.
3. **Marketing-Klarheit.** v0.3.0 kommuniziert deutlich, dass eine Cleanup-Pass stattgefunden hat. Wenn jemand später zurückschaut, ist `0.2.0 → 0.3.0` ein klarer Marker, an dem die Dependency-Lage signifikant geändert wurde.

**Was wir in `sdd-apply` und im Tag-/Release-Kommentar explizit dokumentieren sollten:**

> „v0.3.0 ist eine Major-Version-Bump per Nutzer-Setzung. Es gibt **keine** Breaking-Änderung an der öffentlichen CLI-Subcommand-Schnittstelle, den HTTP-Endpoints `/api/*`, oder dem JSON-Storage-Schema. Entfernt wurden ausschließlich transitive UI-Framework-Dependencies, die seit v0.2.0 nicht mehr im Quellcode referenziert werden."

Diese Notiz schützt davor, dass ein zukünftiger Reviewer fälschlicherweise Backward-Compatibility-Check anhand der Major-Bump-Stelle erwartet und nichts findet.

---

## 2. Erwarteter Bundle-Size-Drop

Die fünf entfernten Pakete tragen — vor Treeshaking — ungefähr dieses Gewicht in den finalen Bundle:

| Paket | min.gz (Schätzung) | Hinweis |
|---|---:|---|
| `@radix-ui/themes` | 25–40 KB | Theming-Layer mit allen Komponenten — selbst bei nicht-Import weiter im Bundle, wenn transitiv über `Box`, `Card` etc. gepullt. Aktuell nicht im Einsatz, also vollständig tree-shakable. |
| `@radix-ui/react-popover` | 5–8 KB | Popover-State-Primitive + Positionierungs-Engine. |
| `react-aria-components` | 25–35 KB | Ganzes Adobe-A11y-Framework; wurde nur für TimeField genutzt, jetzt komplett ungenutzt. |
| `date-fns` | 6–12 KB | Hängt davon ab, ob transitive Helper über `react-day-picker`/`react-aria-components` gezogen wurden; im Worst-Case als Peer. |
| `react-router-dom` | 8–12 KB | Router-Bundle; wurde nie importiert, also komplett tree-shakable. |
| **Summe (Schätzung Bandbreite)** | **~70–110 KB roh** → **~30–60 KB gzipped** | |

**Realistische Erwartung: 30–60 KB gzipped Einsparung.** Das wird im sdd-apply-Commit-Body **nicht** fest versprochen — wir messen die echten Zahlen aus `packages/web/dist/assets/*.js` **vor** und **nach** dem Dep-Removal und schreiben das Delta in einen Kommentar an diese Sektion.

Mess-Methode für `sdd-apply`:

```bash
# vorher (Master, vor T1):
Get-ChildItem packages/web/dist/assets/*.js | ForEach-Object { (gzip -9 $_).Length }
# nach T7:
Get-ChildItem packages/web/dist/assets/*.js | ForEach-Object { (gzip -9 $_).Length }
```

Delta = „nachher minus vorher" (negativ = kleiner geworden, das ist gut). Wenn das Delta < 10 KB gz ausfällt, war das Treeshaking aggressiver als gedacht → positive Überraschung, keine Aktion.

---

## 3. Keine Public-API-Änderung

Diese Änderung berührt **keinen** Punkt, an dem `cronboard` ein öffentliches Versprechen abgegeben hat:

| API-Fläche | Status |
|---|---|
| CLI-Subcommands (`start`, `stop`, `status`, `logs`, `ls`, …) | unverändert |
| HTTP-Endpoints (`/api/jobs`, `/api/runs`, `/api/cron/*`, …) | unverändert |
| JSON-Storage-Schema (`<dataDir>/jobs.json`, `<dataDir>/runs.json`, …) | unverändert |
| Fastify-Server-Konfiguration (CORS, Static-Serving, Auth-Gates) | unverändert |
| Watcher- und Daemon-Verhalten | unverändert |
| `.env` / Config-Dateien | unverändert |

Die einzige sichtbare Änderung für Endnutzer ist **kleinerer Installations-Footprint** (schnellerer `npm install`, kleinerer `node_modules/`, kleinerer `dist/` Ordner). Das ist reine Verbesserung.

---

## 4. Regel-Update: `radix-themes-only` → `daisyui-only`

### 4.1 Aktueller Zustand (veraltet)

```yaml
# openspec/config.yaml → rules
- id: radix-themes-only
  description: >-
    Single design system: @radix-ui/themes v3 + @radix-ui/react-icons.
    No Tailwind, no shadcn, no other utility-CSS framework, no parallel
    component library. CSS lives in packages/web/src/styles.css.
  enforced_by: code-review
```

Diese Regel ist seit v0.2.0 (DaisyUI-Gruvbox-Redesign) **technisch obsolet**: `@radix-ui/themes` ist nicht mehr im Bundle, die App nutzt DaisyUI 5 + Tailwind 4 + Radix-Icons (nur als Glyphen). Die Regel stimmt nicht mehr mit der Realität überein und führt Reviewer in die Irre.

### 4.2 Vorgeschlagene Nachfolgeregel (für `sdd-apply`)

Genauer Wortlaut, der in `openspec/config.yaml → rules` die alte Regel **ersetzt**:

```yaml
- id: daisyui-only
  description: >-
    Single UI / design system: DaisyUI 5 (on Tailwind 4) as the component and
    theming layer. @radix-ui/react-icons is permitted as the sole icon glyph
    source (DaisyUI has no equivalent icon component). No Radix Themes, no
    shadcn, no Material/Chakra/Mantine, no parallel component library.
    Utility CSS beyond Tailwind 4 + DaisyUI is forbidden. CSS lives in
    packages/web/src/styles.css.
  enforced_by: code-review
```

### 4.3 Was bewusst **nicht** in der neuen Regel steht

- **Keine** Tailwind-Klassen außerhalb DaisyUI-Komponenten-Klassen — wir wollen die Utility-Nutzung nicht fördern, aber auch nicht explizit verbieten, weil DaisyUI-Klassen unter der Haube Tailwind-Klassen sind. Grauzone, deshalb nicht in die Regel.
- **Keine Forderung nach explizitem Theme-File.** DaisyUI 5 nutzt CSS-Variablen; Themen werden via Tailwind-Config gesetzt. Daumenregel: ein Theme-File pro Design-System-Wechsel, nicht pro Feature.
- **`@radix-ui/react-icons` bleibt erlaubt** — das ist der einzige „Radix"-Import, der überleben darf, weil er nicht zur Themes-Library gehört und DaisyUI keine Icon-Komponente mitbringt.

### 4.4 Was `sdd-apply` mit dieser Information tun soll

Die **tatsächliche** Änderung an `openspec/config.yaml` ist nicht Teil von `sdd-propose` und nicht Teil der Tasks T1–T8. Sie ist eine **Empfehlung** für den `sdd-apply`-Schritt (oder für einen eigenständigen Folge-Change). Begründung: das Config-File ist als Governance-File ausgewiesen und hat einen anderen Änderungspfad als Source-Code.

**Empfohlene Reihenfolge:**

1. **Option A (empfohlen, wenn der Nutzer das erlaubt):** `sdd-apply` macht den Regel-Swap direkt mit, im selben Commit wie T1–T8. Vorteil: Config ist sofort konsistent. Nachteil: bricht die Regel `append-only-sdd-artifacts` etwas auf, weil der ursprüngliche `proposal.md`-Scope nur Deps + Versionsstring abdeckt. **Mitigation:** Proposal §2 (Out-of-Scope) klar markiert das, und ein Hinweis im Commit-Body („also includes rule swap for config consistency").
2. **Option B:** Regel-Swap in einen **eigenständigen Folge-Change** (`v0.3.1-rules-cleanup` o. ä.). Vorteil: strikte Scope-Trennung. Nachteil: zwei Commits, zwei PRs, zwei Reviews für eine Mini-Änderung.

Die Entscheidung ist nicht Teil dieses Proposals — sie liegt beim Parent / Nutzer.

---

## 5. Dependency After-State (Soll-Zustand von `packages/web/package.json`)

Damit `sdd-verify` eine klare Diff-Erwartung hat, hier das **Soll** der Datei nach T1:

```json
{
  "name": "@cronboard/web",
  "version": "0.3.0",
  "description": "Cronboard frontend: React + DaisyUI 5 (Gruvbox) + Tailwind 4",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@radix-ui/react-icons": "^1.3.0",
    "cronstrue": "^2.28.0",
    "react": "^18.3.1",
    "react-day-picker": "^9.14.0",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@types/react": "^18.3.1",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "typescript": "^5.4.5",
    "vite": "^5.2.11"
  }
}
```

> Hinweis: Die `description`-Zeile ist ein **Vorschlag**, kein Muss. Sie kann auch unverändert bleiben. Wenn `sdd-apply` sie anpasst, ist das eine Mini-Politur; wenn nicht, auch OK.

---

## 6. Reviewer-Checkliste (für `sdd-verify`)

- [ ] Fünf Deps sind weg, DaisyUI + `react-day-picker` + `@radix-ui/react-icons` sind noch drin.
- [ ] Keine Quellcode-Änderungen außer den fünf Versionsstring-Updates in `cli.ts` + `server.ts`.
- [ ] `npm install` läuft ohne Peer-Dep-Konflikt.
- [ ] `npm run typecheck` (beide Pakete) ist grün.
- [ ] `node --test --import tsx packages/core/src/scheduler/cronExpr.test.ts` ist 63/63 grün.
- [ ] `scripts/smoke-ui.ps1` ist grün (vor **und** nach dem Versionsbump).
- [ ] Versionsstrings an **genau** den fünf Stellen aktualisiert, sonst nirgends im Repo.
- [ ] `git diff packages/*/src/` enthält **nur** die zwei Versionsstring-Änderungen.
- [ ] `openspec/config.yaml` ist **nicht** Teil dieses Diff (S10).
- [ ] Bundle-Size-Drop gemessen (realer Wert, nicht nur die Schätzung) und im Commit-Body dokumentiert.
- [ ] Commits-Message beginnt mit `chore(v0.3.0):` und folgt exakt dem vorgegebenen Format.

---

## 7. Offene Punkte (für Folge-Changes, nicht hier)

1. **`openspec/config.yaml → project.version` Sync** (steht auf `0.1.0`, sollte `0.3.0` sein).
2. **Regel `radix-themes-only` → `daisyui-only`** (siehe §4).
3. **`README.md` Tech-Stack-Tabelle** (sollte v0.3.0-Stil tragen: DaisyUI statt Radix Themes).
4. **Bundle-Size-Budget-Regel** einführen, falls Größen weiterhin relevant werden (z. B. ≤ 250 KB gz Cap für `dist/assets/*.js`).
5. **Codemod / `knip`-Pass** für transitive tote Deps (kein Bestandteil dieses Changes).

Diese Punkte sind bewusst **außerhalb** dieses Changes — würden aber jeder für sich in einem kleinen Folge-Change (`v0.3.1-rules-cleanup` o. ä.) sinnvoll aufgehoben sein.
