# Design: v0.7.0-edit-job-ui-polish

> Begleitend zu `proposal.md` und `tasks.md`. Diese Datei ist die technische Quelle der Wahrheit für die nicht-trivialen Entscheidungen in diesem Change: visuelle Layout-Mockups, der genaue `summary()`-Algorithmus, das `statusForAction`-Mapping, die Reorder-State-Machine, die `<details>`-Constraints und die data-testid-Vertragsoberfläche. Behandle sie als `sdd-verify`-Checkliste.

---

## 1. Visueller Layout-Mockup

### 1.1 ActionCard — Header (v0.7.0)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ┌───┐                                                                       ✕│
│ │ 🌐│ POST  https://hooks.example.com/api/v1/webhook              ✓ ok 2m  │
│ └───┘                                                          ≡ ▲ ▼ ⚪ │  <- Continue-on-error toggle
│   ▲                                                                    │
│   └─ primary/15 bg, primary text                                            │
│                                                                              │
│ ▶ Edit fields                                                                │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Layout-Specs** (DaisyUI 5 + Tailwind 4):

| Element | Class | data-testid |
|---|---|---|
| Outer Card | `card bg-base-100/60 border border-base-300/40` | — |
| Icon-Box | `flex items-center justify-center w-9 h-9 rounded-lg shrink-0` + type-tint | `action-icon` |
| Summary-Span | `font-mono text-sm truncate flex-1` | `action-summary` |
| Status-Badge | `inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium` + status-color | `status-badge` |
| Drag-Handle | `<DragHandleDots2Icon className="text-base-content/30" aria-hidden="true" />` | — |
| Up-Button | `btn btn-xs btn-ghost join-item` + `disabled` wenn `isFirst` | `reorder-up` |
| Down-Button | `btn btn-xs btn-ghost join-item` + `disabled` wenn `index === totalCount - 1` | `reorder-down` |
| Continue-Toggle | `toggle toggle-xs` (Label nur als Tooltip) | — |
| Delete-Button | `btn btn-ghost btn-xs btn-square text-error` | — |
| Form-Details | `<details>` mit `data-testid="action-form"` und `open={isNew}` | `action-form` |

### 1.2 ActionCard — Form aufgelappt (collapsed-by-default für existing jobs)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ┌───┐                                                                       ✕│
│ │ 🌐│ POST  https://hooks.example.com/api/v1/webhook              ✓ ok 2m  │
│ └───┘                                                          ≡ ▲ ▼ ⚪ │
│                                                                              │
│ ▼ Edit fields                                                                │
│ ┌──────────────────────────────────────────────────────────────────────────┐│
│ │ Method [POST ▼]                                                          ││
│ │ URL     [https://hooks.example.com/api/v1/webhook                    ]  ││
│ │ ☐ Allow private networks                                                 ││
│ │ Body    [                                                    ]           ││
│ │ Headers [X-Api-Key: sk-***        ✕] [+ Add]                             ││
│ └──────────────────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────────────────┘
```

### 1.3 Empty-State (v0.7.0)

```
┌─────────────────────────────────────────────────┐ ┌─────────────────────────────────────────────────┐
│ ┌─────────┐                                      │ │ ┌─────────┐                                      │
│ │   🌐    │                                      │ │ │   </>   │                                      │
│ └─────────┘                                      │ │ └─────────┘                                      │
│ Add a Webhook                                    │ │ Add a Shell Command                             │
│ HTTP request to any URL with headers and body    │ │ Local command with cwd, timeout,                │
│                                                  │ │ and allowed-paths guard                         │
└─────────────────────────────────────────────────┘ └─────────────────────────────────────────────────┘
```

Grid: `grid-cols-1 md:grid-cols-2 gap-3 pt-2`.

### 1.4 Reihenfolge im Card-Body (bei ≥ 1 Action)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Actions                                          [ + Webhook ] [ + Shell ]  │
├──────────────────────────────────────────────────────────────────────────────┤
│ ┌──────────────────────────────────────────────────────────────────────────┐│
│ │ [ActionCard #1]                                                          ││
│ └──────────────────────────────────────────────────────────────────────────┘│
│ ┌──────────────────────────────────────────────────────────────────────────┐│
│ │ [ActionCard #2]                                                          ││
│ └──────────────────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────────────────┘
```

Die Top-Bar-Buttons bleiben für den Fall „ich will eine zweite Action einfügen, ohne durch den Empty-State zu gehen".

---

## 2. Pure-Function-Specs

### 2.1 `summary(action)` — vollständige Spec

**Webhook-Pfad**:
```
summary({
  type: "webhook",
  config: { method: "POST", url: "https://hooks.example.com/api/v1/webhook?key=abc", ... }
}) === "POST  https://hooks.example.com/api/v1/webhook?key=…"
```

- **Whitespace**: zwei Leerzeichen zwischen Method und URL — visueller Trenner, monospace-rendering-fest.
- **URL-Truncation**: bei `url.length > 50` → erste 49 Zeichen + `…`. Behält das Schema (`http://`, `https://`) intakt.
- **Edge-Cases**:
  - `config.url === undefined` → `summary` gibt `""` zurück (sicherer Fallback, kein Throw).
  - `config.method === "GET"` → `summary` beginnt mit `GET  ` (zwei Spaces).
  - Query-String bleibt im Truncation enthalten; keine separate Behandlung.

**Shell-Pfad**:
```
summary({
  type: "shell",
  config: { command: "backup.sh --daily", cwd: "/srv/cron", timeoutMs: 60000 }
}) === "$ backup.sh --daily  (cwd: /srv/cron, timeout 60s)"
```

- **`$`-Prefix**: visueller Shell-Prompt; rein typografisch (kein Icon).
- **Multi-line commands**: nur die erste Zeile (`command.split("\n")[0]`). Begründung: der User will **scannen**, nicht lesen; lange Skripte sind im `<details>` aufgehoben.
- **Whitespace**: zwei Leerzeichen vor der `(...)`-Klammer.
- **Detail-Liste**: `cwd: …` und `timeout Xs` (Sekunden, gerundet). Reihenfolge fest: `cwd` zuerst, `timeout` zuletzt.
- **Leere Details**: ohne `cwd` und ohne `timeoutMs` → kein `(...)`-Anhang, nur `$ cmd`.

### 2.2 `truncateUrl(url, max=50)` — vollständige Spec

```
truncateUrl("https://example.com") === "https://example.com"      // length 19, OK
truncateUrl("https://example.com/" + "x".repeat(50)) === "https://example.com/" + "x".repeat(30) + "…"
truncateUrl(undefined) === ""
truncateUrl("") === ""
```

**Algorithmus**:
```ts
export function truncateUrl(url: string | undefined, max = 50): string {
  if (!url) return "";
  if (url.length <= max) return url;
  return url.slice(0, max - 1) + "…";
}
```

**Property**: `truncateUrl(truncateUrl(s)) === truncateUrl(s)` (idempotent).

### 2.3 `statusForAction(runs, actionId)` — vollständige Spec

**Input**:
- `runs: ActionRun[]` — alle Runs des Jobs (typischerweise aus `api.runs.list({ jobId, limit: 50 })`).
- `actionId: string` — UUID der Action, für die der Status berechnet wird.

**Output**: `ActionStatus = { color, icon, label }`.

**Algorithmus**:
1. Sortiere `runs` nach `startedAt` **absteigend** (defensiv — die API liefert sie bereits in dieser Reihenfolge, aber wir wollen nicht davon abhängen).
2. Finde den **ersten** Run, dessen `actionId` mit der gesuchten übereinstimmt (case-sensitive UUID-Match).
3. Wenn keiner gefunden → `{ color: "neutral", icon: "minus", label: "— never run" }`.
4. Sonst: Mappe `status`:
   - `"running"` → `{ color: "info", icon: "reload", label: "⋯ running" }` (keine Zeit, weil `finishedAt` fehlt).
   - `"success"` → `{ color: "success", icon: "check", label: "✓ ok " + formatRelativeTime(finishedAt) }`.
   - `"failed"` → `{ color: "error", icon: "cross", label: "✗ failed " + formatRelativeTime(finishedAt) }`.

**Edge-Cases**:
- `runs` ist `undefined` (z. B. weil Fetch fehlgeschlagen ist) → `runsByActionId.get(action.id) ?? []` greift im Caller; `statusForAction([], id)` → `never`.
- `latest.finishedAt` ist `undefined` bei `running`-Run → Label ist `⋯ running` (kein Zeit-Anhang).
- `latest.finishedAt` ist ISO-String → `formatRelativeTime` parst und relativiert.
- `Run.actionRuns` enthält auch Runs **anderer** Jobs (bei einem Multi-Job-Fetch) — wir filtern strikt auf `r.actionId === actionId`.

### 2.4 `reorder(actions, idx, direction)` — vollständige Spec

**Algorithmus**:
```ts
export function reorder(actions: JobAction[], idx: number, direction: "up" | "down"): JobAction[] {
  if (idx < 0 || idx >= actions.length) return actions;            // OOB
  const swapWith = direction === "up" ? idx - 1 : idx + 1;
  if (swapWith < 0 || swapWith >= actions.length) return actions;  // Edge: no-op
  const next = actions.slice();
  [next[idx], next[swapWith]] = [next[swapWith], next[idx]];
  return next.map((a, i) => ({ ...a, position: i }));              // Dense renumber (D1)
}
```

**Properties** (per Test verifiziert):
1. **Idempotent an den Rändern**: `reorder([a], 0, "up") === [a]`; `reorder([a,b,c], 2, "down") === [a,b,c]`.
2. **Stabile IDs**: nur `position` ändert sich; `id`, `jobId`, `type`, `config`, `continueOnError` bleiben byte-identisch.
3. **Dense Renumbering**: nach jedem Reorder sind die Positionen genau `0..n-1` lückenlos (D1).
4. **Pure**: gibt eine **neue** Array zurück; das Input wird nicht mutiert.
5. **Kommutativ-Teil-Erhalt**: Eine Action, die nicht im Swap-Pfad ist, behält ihre ursprüngliche Position (siehe Test `reorder([a,b,c], 1, "down")` → `[a,c,b]` mit Positionen `[0,2,1]` nach Swap, dann renumbered zu `[0,1,2]`; Action `a` ist von 0 auf 0 geblieben).

### 2.5 `formatRelativeTime(iso, now=new Date())` — vollständige Spec

**Buckets**:
| Diff (ms) | Output |
|---:|---|
| < 0 (future) | `in <round(seconds)>s` |
| 0–999 | `<n>ms ago` |
| 1 000–59 999 | `<n>s ago` |
| 60 000–3 599 999 | `<n>m ago` |
| 3 600 000–86 399 999 | `<n>h ago` |
| 86 400 000 (24h+ to 48h) | `yesterday` |
| > 86 400 000 * 2 | `MMM D` (locale-aware; `Jul 1`) |

**Edge-Cases**:
- `iso === undefined` → `"—"`
- `iso === "not-a-date"` → `new Date(iso).getTime()` ist `NaN` → `"—"`
- `now` ist explizit als Parameter überschreibbar (für Tests mit deterministischer Zeit).

---

## 3. Status-Badge-Mapping-Tabelle (vollständig)

| `ActionRunStatus` | `color` | `icon` | Icon-Name | Label-Pattern | CSS-Klasse |
|---|---|---|---|---|---|
| `"success"` | `"success"` | `"check"` | `CheckCircledIcon` | `✓ ok <rel>` | `text-success bg-success/10` |
| `"failed"` | `"error"` | `"cross"` | `CrossCircledIcon` | `✗ failed <rel>` | `text-error bg-error/10` |
| `"running"` | `"info"` | `"reload"` | `ReloadIcon` | `⋯ running` | `text-info bg-info/10` |
| _kein Run_ | `"neutral"` | `"minus"` | `MinusIcon` | `— never run` | `text-base-content/40 bg-base-content/5` |

`<rel>` ist `formatRelativeTime(finishedAt)` — produziert Werte wie `12ms ago`, `3m ago`, `2h ago`, `yesterday`, `Jul 1`.

**Bewusst NICHT unterschieden**: `partial` (von `Run.status`, nicht `ActionRunStatus`) — fällt aktuell in den `failed`-Bucket, weil `ActionRunStatus` nur `running`/`success`/`failed` kennt. Wenn der User Q4-O4 mit „partial als eigener Status" beantwortet, ist die Mapping-Tabelle um eine Zeile zu erweitern und die Helper-Funktion bekommt einen weiteren `if`-Branch.

**Visuelle Konsistenz**: die gleichen Farben werden auf der `JobsPage` (`status-strip`) und im Dashboard (success-Rate-Indikator) verwendet. Das stellt sicher, dass „rot = kaputt" überall gleich aussieht.

---

## 4. Reorder-State-Machine

### 4.1 User-Aktionen

```
   ┌─────────┐  click ▲ on idx 1  ┌─────────┐  scheduleReorderSave()  ┌──────────┐
   │  IDLE   │ ─────────────────► │  QUEUED │ ──────────────────────► │  DEBOUNCED│
   │         │                    │ (timer) │                          │  (250ms)  │
   └─────────┘                    └─────────┘                          └────┬─────┘
        ▲                              ▲                                  │ timeout fires
        │                              │                                  ▼
        │           cancel             │ click again            ┌─────────────────┐
        └──────────────────────────────┘ (reschedule)          │  SAVING (PATCH) │
                                                                └────────┬────────┘
                                                                         │ 200 OK
                                                                         ▼
                                                                ┌─────────────────┐
                                                                │  IDLE (clean)   │
                                                                └─────────────────┘
```

**States**:
- **IDLE**: `pendingReorderRef = { timer: null, dirty: false }`. Kein offener PATCH.
- **QUEUED**: User hat einen Up/Down-Klick gemacht; `dirty = true`; Timer ist gesetzt.
- **DEBOUNCED**: 250 ms sind nicht um; jeder weitere Klick `clearTimeout`s den alten Timer und setzt einen neuen (Reset). Position im State ist bereits mutiert.
- **SAVING**: Timer fired; `PATCH /api/jobs/:id` mit aktuellem `actions`-Array läuft.
- **IDLE (clean)**: PATCH ist durch, `dirty = false`, Timer = null.

**Cancel-Pfade**:
- **`save()` aufgerufen**: ruft `cancelPendingReorder()` (clearTimeout + dirty=false); dann PATCH mit dem aktuellen State (Up-Klick ist bereits im State).
- **`testRun()` aufgerufen**: identisch; `cancelPendingReorder()` zuerst.
- **Component Unmount**: Cleanup-Effect ruft `cancelPendingReorder()`.
- **Save-Fehler**: `setError(err.message)`; State bleibt mutiert (lokales State ist Source of Truth für die nächste Save-Aktion).

### 4.2 Dense-vs-Sparse-Begründung

**Dense (gewählt)**:
- ✅ Passt zur bestehenden `removeAction`-Logik in `JobEditor.tsx` Zeile 117.
- ✅ Einfacher zu testen (`reorder` ist deterministisch).
- ✅ Konsistent mit dem Runner (`scheduler/runner.ts` sortiert aufsteigend; mit Dense gibt es keine „Löcher").
- ❌ Bei n=10 Actions führt jeder Klick zu 10 Mutations in der Datenbank (in der Praxis: 1 PATCH mit dem ganzen Array).

**Sparse (verworfen)**:
- ✅ Bei einem Swap ändern sich nur 2 Positionen.
- ❌ Cleanup-Pass bei jedem Save nötig, um „Löcher" zu füllen.
- ❌ Inkonsistent mit dem bestehenden `removeAction`-Code.

**Entscheidung: Dense** (siehe D1). Begründung: Konsistenz > Mikro-Optimierung. Der Performance-Unterschied bei n≤10 Actions ist vernachlässigbar.

### 4.3 PATCH-Payload-Spec

```json
{
  "name": "unchanged-job-name",
  "description": "unchanged",
  "cronExpression": "*/5 * * * *",
  "timezone": "Europe/Berlin",
  "enabled": true,
  "actions": [
    { "id": "uuid-1", "jobId": "uuid-job", "type": "webhook", "position": 0, "continueOnError": false, "config": { "method": "POST", "url": "..." } },
    { "id": "uuid-2", "jobId": "uuid-job", "type": "shell",   "position": 1, "continueOnError": false, "config": { "command": "..." } },
    { "id": "uuid-3", "jobId": "uuid-job", "type": "webhook", "position": 2, "continueOnError": false, "config": { "method": "GET",  "url": "..." } }
  ]
}
```

Der Server (`store/jobs.ts → update`) überschreibt das `actions`-Array vollständig mit dem übergebenen Array (dense-Position ist Server-seitig nicht erforderlich, weil der Runner ohnehin sortiert, aber das ist die Konvention).

---

## 5. `<details>`-Constraints

### 5.1 Browser-Native vs. Controlled

**Native (gewählt, D9)**:
- `<details open={isNew}>` mit `defaultOpen`-Verhalten.
- Browser handhabt Toggle über das `<summary>`-Element.
- React rendert das Markup, der Browser-State ist Source of Truth.

**Vorteile**:
- Keine `useState` pro Card nötig.
- Native Tastatur-Navigation (Enter/Space auf `<summary>`).
- Kein Re-Render beim Toggle.
- ARIA-Semantik out-of-the-box (`aria-expanded` wird vom Browser gepflegt).

**Nachteile**:
- Theoretischer Konflikt mit React-Re-Render, wenn das `<details>`-Element neu gemounted wird → **Lösung**: stabile `key`-Prop (`(a as any).id ?? i` in `actions.map`), so dass React die Card-Identität bewahrt.

### 5.2 Default-State

| Pfad | `open`-Wert |
|---|---|
| Neuer Job (`isNew === true`) | `open={true}` (Form ist sichtbar, der User füllt sie aus) |
| Existierender Job (`isNew === false`) | `open={false}` (Summary reicht zum Scannen; Click auf "Edit fields" zum Editieren) |

Diese Logik wird über die `isNew`-Prop an die `ActionCard` durchgereicht und einmalig beim ersten Render gesetzt. Nachträgliche Änderung von `isNew` (passiert nicht — der Wert ist statisch pro Job-Load) wird ignoriert.

### 5.3 Fallback: Controlled

Falls in `sdd-verify` Browser-Inkonsistenz beobachtet wird (z. B. Firefox rendert `open`-Attribut anders als Chrome):
```tsx
const [open, setOpen] = useState(isNew);
<details
  data-testid="action-form"
  open={open}
  onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
>
```

Diese Variante wird in `tasks.md → T3` als **nicht-Default** erwähnt; erst aktivieren, wenn ein konkretes Browser-Problem dokumentiert ist.

---

## 6. Status-Badge-Polling-Strategie

### 6.1 Warum kein Live-Polling?

**Eltern-Constraint**: „Keine neuen Dependencies" und „auto-Modus". Ein WebSocket / SSE wäre:
- Mehr Code in `server.ts` (Route + Push).
- Mehr Code in der Frontend-State-Maschine.
- Mehr Failure-Modes (Reconnect, Backoff, Message-Order).
- Latenz-Vorteil gegenüber on-load-Fetch ist im Editor-Kontext **nicht kritisch** (der User öffnet den Editor, um zu editieren — er erwartet keinen Live-Stream).

**Entscheidung**: Ein einziger `api.runs.list({ jobId, limit: 50 })` beim Job-Load. Re-Fetch nach `save()` und `testRun()` (R3, R9).

### 6.2 Map-Aufbau

```ts
// Im useEffect nach dem api.runs.list-Resolve:
const m = new Map<string, ActionRun[]>();
for (const run of runs) {
  for (const ar of run.actionRuns ?? []) {
    const list = m.get(ar.actionId) ?? [];
    list.push(ar);
    m.set(ar.actionId, list);
  }
}
setRunsByActionId(m);
```

**Komplexität**: O(R × A) wobei R = Anzahl Runs (≤ 50) und A = Anzahl ActionRuns pro Run (typischerweise 1–5). Bei 50 Runs × 5 Actions = 250 Map-Inserts. Vernachlässigbar.

**Lookup**: `runsByActionId.get(action.id) ?? []` ist O(1).

### 6.3 Edge-Cases

- **`api.runs.list` schlägt fehl**: `.catch(() => {})` (silent). Map bleibt leer → alle Badges zeigen `— never run`. Das ist **kein Fehler** — der User kann den Job trotzdem editieren.
- **Action wurde umbenannt (id-Wechsel)**: passiert nicht, weil `Action.id` eine UUID ist und nur beim Erstellen einer Action einmalig gesetzt wird. Selbst ein `reorder`-Aufruf ändert die `id` nicht.
- **Action wurde gelöscht**: `runsByActionId.get(action.id)` liefert `undefined` → Fallback `[]` → Badge `— never run`. Beim nächsten Job-Load wird die Map neu aufgebaut und tote IDs verschwinden.
- **`limit: 50` ist nicht genug**: bei >50 Runs wird der **älteste** ignoriert. Der jüngste Run pro Action (für den Badge relevant) ist immer in den letzten 50 enthalten, wenn die Actions in den letzten 50 Runs gelaufen sind. Für ein Cron-Job mit stündlichen Runs ist das ~2 Tage Historie — ausreichend.

### 6.4 Re-Fetch-Trigger

| Trigger | Re-Fetch? |
|---|---|
| Job-Load (useEffect[jobId]) | ✅ ja |
| `save()` Erfolg | ✅ ja (nach `await api.jobs.update`, vor `onDone()`) |
| `testRun()` Erfolg | ✅ ja (nach `await api.jobs.run`, vor `setTestRunning(false)`) |
| Reorder-PATCH | ❌ nein (Reihenfolge ändert nichts an Run-Status) |
| `removeAction` | ❌ nein (gelöschte Action hat keinen Status mehr) |
| Form-Field-Edit (`updateAction`) | ❌ nein (kein Status-relevant) |

---

## 7. Iconographie & Farb-Codierung

### 7.1 Action-Typ-Iconographie

| Typ | Icon | Tint-Background | Tint-Text |
|---|---|---|---|
| Webhook | `GlobeIcon` (Erdkugel) | `bg-primary/15` | `text-primary` |
| Shell | `CodeIcon` (`</>`) | `bg-secondary/15` | `text-secondary` |

**Begründung Globe für Webhook**: ein Webhook ist ein **externer Aufruf**; das Globe-Symbol ist die kanonische „Internet"-Metapher.

**Begründung Code für Shell** (nicht Terminal): `CodeIcon` ist visuell kompakter als `TerminalIcon` (eine Zeile vs. drei); semantisch passt es (Shell-Commands sind auch „Code"); weniger visuelles Gewicht in einer Header-Zeile.

### 7.2 Status-Iconographie

| Status | Icon | Symbolische Bedeutung |
|---|---|---|
| `success` | `CheckCircledIcon` (✓) | klassisches Häkchen |
| `failed` | `CrossCircledIcon` (✗) | klassisches Kreuz |
| `running` | `ReloadIcon` (rotierender Bogen) | „in Bewegung" |
| `never` | `MinusIcon` (—) | Em-Dash, kein Run = nichts da |

**Bewusst NICHT**:
- `ExclamationTriangleIcon` für failed (zu „alarmistisch"); `CrossCircledIcon` ist neutraler.
- `CircleBackslashIcon` für never (zu „deaktiviert"); `MinusIcon` kommuniziert „nichts".

### 7.3 Reorder-Iconographie

| Element | Icon | Größe |
|---|---|---|
| Up | `ChevronUpIcon` | Standard (`btn-xs`) |
| Down | `ChevronDownIcon` | Standard (`btn-xs`) |
| Drag-Handle (visuell) | `DragHandleDots2Icon` (≡) | `text-base-content/30` |

Der Drag-Handle ist **rein visuell** — kein Drag-Listener, kein ARIA-`role="button"`. Der Tooltip erklärt: „Use the arrows to reorder".

---

## 8. State-Management-Übersicht

```
┌──────────────────────────────────────────────────────────────────────────┐
│ JobEditor                                                                │
│                                                                          │
│  useState:                                                                │
│    name, description, cronExpression, timezone, enabled       (form)     │
│    actions: JobAction[]                                      (form)     │
│    saving, testRunning                                       (ui)       │
│    error                                                     (ui)       │
│    runsByActionId: Map<string, ActionRun[]>    (NEU, badge-daten)        │
│                                                                          │
│  useRef:                                                                 │
│    pendingReorderRef: { timer, dirty }         (NEU, debounce)          │
│                                                                          │
│  useEffect:                                                              │
│    [jobId] → load job + run-fetch (NEU)                                  │
│    [] → cleanup cancelPendingReorder on unmount (NEU)                    │
│                                                                          │
│  Helpers (pure, in lib/):                                                │
│    summary(action)                                                        │
│    statusForAction(runs, actionId)                                       │
│    reorder(actions, idx, direction)                                      │
│    formatRelativeTime(iso)                                               │
│    truncateUrl(url, max)                                                  │
│                                                                          │
│  ActionCard-Props:                                                       │
│    action, index, totalCount, isFirst                                    │
│    jobId, saving, isNew                                                  │
│    runsByActionId                                                        │
│    onChange, onRemove, moveAction                                        │
└──────────────────────────────────────────────────────────────────────────┘
```

`ActionCard` hält **keinen eigenen State**. Es ist eine reine Render-Funktion von Props. Das macht sie billig zu testen (in einem späteren Vitest-Setup) und konsistent über Re-Renders.

---

## 9. Acceptance-Criteria → Test-Mapping

| S# | Criterion | Wo geprüft |
|---|---|---|
| S1 | Summary-Text auf jeder Card | `actionSummary.test.ts` (8 Tests) + visuell (data-testid="action-summary") |
| S2 | Icon + Tint statt Text-Badge | Visuell; data-testid="action-icon" mit data-action-icon-Attribut |
| S3 | Up/Down-Buttons | Visuell; data-testid="reorder-up", "reorder-down"; Disabled-State an Rändern |
| S4 | Status-Badge | `actionStatus.test.ts` (5 Tests) + visuell; data-testid="status-badge" |
| S5 | `<details>` collapsed/expanded | Visuell; data-testid="action-form" + `open`-Attribut |
| S6 | Empty-State CTA-Cards | Visuell; data-testid="add-webhook-cta", "add-shell-cta" |
| S7 | Reorder → PATCH mit `0..n-1` | `actionOrder.test.ts` (6 Tests) + ggf. Smoke-Curl |
| S8 | typecheck + build + smoke | T6-Gates |

**Total Tests (T1+T2)**: ≥ 24 (8 + 5 + 6 + 5). Alle pure-function, alle in < 1 s.

---

## 10. Reviewer-Checkliste (für `sdd-verify`)

### 10.1 Acceptance Criteria

- [ ] **S1**: Mindestens ein `data-testid="action-summary"` pro Action-Card; Text matched Summary-Spec.
- [ ] **S2**: Kein `<span class="badge">…webhook #N…</span>` mehr im DOM; stattdessen `<svg data-action-icon="webhook">` oder `"shell"` mit Tint-Background.
- [ ] **S3**: `data-testid="reorder-up"` auf jeder Card, disabled auf Index 0; analog für Down auf Index n-1.
- [ ] **S4**: `data-testid="status-badge"` mit `data-status="success|failed|running|neutral"`; Text matched Label-Pattern aus §3.
- [ ] **S5**: `data-testid="action-form"` ist `<details>` mit `open={false}` für `isNew=false` und `open={true}` für `isNew=true`.
- [ ] **S6**: Bei `actions.length === 0` exakt zwei `data-testid="add-webhook-cta"` und `"add-shell-cta"`-Buttons.
- [ ] **S7**: `reorder([a,b,c], 1, "down")` ergibt `[{id:a,position:0},{id:c,position:1},{id:b,position:2}]` (test).
- [ ] **S8**: `npm run typecheck`, `npm run test:web`, `npm run build`, `scripts/smoke.ps1` alle grün.

### 10.2 Code-Qualität

- [ ] **Keine `any`-Cast-Erweiterungen** außer den bestehenden `(a as any).id ?? i` und `(cfg: WebhookConfig) as any`.
- [ ] **`useRef` für mutable state**, nicht `useState` (für den Debounce-Timer).
- [ ] **`useEffect` cleanup** für `cancelPendingReorder()` beim Unmount.
- [ ] **Pure-Function-Disziplin**: alle vier `lib/*` Helper haben keine Side-Effects.
- [ ] **Stable Keys**: `key={(a as any).id ?? i}` in `actions.map` (verhindert `<details>`-State-Verlust beim Reorder).
- [ ] **ARIA-Labels**: Reorder-Buttons, Delete-Button, Status-Badge haben `aria-label` oder `title`.

### 10.3 UX

- [ ] **Visuelle Konsistenz**: Tint-Farben passen zur bestehenden Gruvbox-DaisyUI-Theme.
- [ ] **Responsive Layout**: Empty-State ist auf Mobile (`< md`) einspaltig.
- [ ] **Tastatur-Navigation**: `<details>`-`<summary>` ist via Tab+Enter erreichbar; Reorder-Buttons sind via Tab erreichbar.
- [ ] **Fokus-Ring**: Standard-DaisyUI-Fokus-Ring auf allen interaktiven Elementen.

### 10.4 Build / Smoke

- [ ] **`npm run typecheck`**: exit 0.
- [ ] **`npm run test:web`**: exit 0; ≥ 24 Tests, 0 Failures.
- [ ] **`npm test`**: exit 0; unverändert (Core-Suite).
- [ ] **`npm run build`**: exit 0; Bundle-Plus < 5 KB gzip.
- [ ] **`scripts/smoke.ps1`**: exit 0; alle Endpoints antworten.
- [ ] **Lockfile-Diff**: keine Änderung (keine neuen Deps).
- [ ] **`git diff packages/*/src/`**: nur die in T6 `git add`-eten Dateien.

### 10.5 Doku

- [ ] **`README.md`**: Status-Line aktualisiert; Feature-Bullet hinzugefügt.
- [ ] **`CHANGELOG.md`**: `[0.7.0]`-Sektion hinzugefügt.
- [ ] **`openspec/config.yaml`**: `project.version: 0.7.0`.
- [ ] **`package.json` (root + beide packages)**: Version `0.7.0`.
- [ ] **`packages/core/src/cli.ts`**: `.version("0.7.0")`.
- [ ] **`packages/core/src/server.ts`**: `/api/health` antwortet mit `"version": "0.7.0"`.

### 10.6 Git / Commit

- [ ] **Einziger Commit**: ja (T6).
- [ ] **Subject**: `feat(v0.7.0): edit-job-ui-polish - summary header, status badge, reorder buttons, empty-state cards`.
- [ ] **`git diff master@{1} master --stat`**: zeigt nur die in T6 `git add`-eten Pfade.

---

## 11. data-testid-Vertragsoberfläche

Dies ist die **kanonische Liste** aller `data-testid`-Hooks, die in v0.7.0 gepflegt werden. Reviewer können sie für visuelle Smoke-Tests / Snapshot-Diffs nutzen.

| Hook | Element | Anzahl pro Render |
|---|---|---|
| `action-icon` | Icon-Box (Globe/Code) | 1 pro Action |
| `action-summary` | Summary-Span | 1 pro Action |
| `status-badge` | Status-Pille | 1 pro Action |
| `reorder-up` | Up-Pfeil-Button | 1 pro Action |
| `reorder-down` | Down-Pfeil-Button | 1 pro Action |
| `action-form` | `<details>`-Wrapper | 1 pro Action |
| `empty-state` | Empty-State-Container | 1 wenn `actions.length === 0` |
| `add-webhook-cta` | Webhook-CTA-Button | 1 im Empty-State |
| `add-shell-cta` | Shell-CTA-Button | 1 im Empty-State |

**Zusätzliche data-Attribute** (semantisch):
- `data-action-icon="webhook"|"shell"` auf dem Icon-Box.
- `data-status="success"|"error"|"info"|"neutral"` auf dem Status-Badge.

**Reviewer-Blick**: alle 9 Hooks müssen in der gerenderten HTML vorhanden sein, wenn die jeweilige Komponente gerendert wird. S1–S6 sind gegen diese Hooks formuliert.

---

## 12. Glossar

- **ActionCard:** innere Komponente in `JobEditor.tsx`, die eine einzelne `JobAction` als visuell eigenständige Karte rendert. Vor v0.7.0: reines Form. Ab v0.7.0: Header (Icon + Summary + Status-Badge + Reorder + Continue + Delete) + collapsible Details (Form).
- **Summary:** einzeilige Voransicht einer Action (`POST https://…` oder `$ cmd (cwd, timeout)`). Derived aus `action.type` + `action.config`.
- **Status-Badge:** rechts oben auf der ActionCard; zeigt den Zustand des letzten `ActionRun` für diese `actionId`.
- **Reorder:** UI-Aktion, die `position` zweier benachbarter Actions vertauscht. Rein client-side; persistiert via debounced `PATCH /api/jobs/:id`.
- **Dense vs Sparse Positions:** Dense = 0..n-1 lückenlos; Sparse = erlaubt Lücken. v0.7.0 ist Dense (D1).
- **`<details>`-Collapse:** browser-native; `open`-Attribut wird per Default beim ersten Render gesetzt; React re-rendert das `<details>`-Element nicht (stabile `key`-Prop).
- **Debounced PATCH:** `setTimeout(…, 250)`; jeder weitere Reorder-Klick `clearTimeout`s und setzt neu; `save()`/`testRun()`/Unmount cancelt sofort.

---

## 13. Offene Punkte (für Folge-Changes, nicht hier)

| Punkt | Begründung für OUT |
|---|---|
| Drag-and-Drop-Reordering | v0.7.0 hat Up/Down-Buttons; DnD mit Tastatur/Touch ist v0.8+. |
| Live-Status via WebSocket/SSE | Einmaliger Fetch reicht für Editor-Kontext; v0.8+. |
| Per-Action-Run-History im Editor | Status-Badge reicht; History ist auf `RunsPage`. v0.8+. |
| Per-Action „Test run"-Button | Page-Level „Test run" reicht; per-Action ist v0.8+ Convenience. |
| Auto-Expand der ersten Action für **alle** Jobs | Default-Verhalten ist „alles collapsed"; Toggle-Setting ist v0.8+. |
| React-Component-Test-Setup (Vitest) | `npm run test:web` deckt Pure-Functions ab; Component-Tests sind v0.8+. |
| LocalStorage-Persistenz der `<details>`-States | Nicht in v0.7.0; kann als UX-Toggle ergänzt werden. |
| `partial` als eigener Status im Badge | Aktuell `failed`-Bucket; Mapping-Update + neuer Farb-Token ist v0.8+. |
| `de-DE`-Locale für `formatRelativeTime` | `toLocaleDateString("en-US", …)` reicht; zwei-Zeilen-Change später. |
| Bundle-Size-Budget | Aktuell kein Hard-Limit; Dokumentation im PR-Body reicht. |

Diese Punkte sind bewusst **außerhalb** dieses Changes.