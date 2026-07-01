# Tasks: v0.7.0-edit-job-ui-polish

> **Reihenfolge:** T0 → T1 → T2 → T3 → T4 → T5 → T6. Jeder Task endet mit einem Gate, das vor dem nächsten Task grün sein muss.
> **TDD-Postur:** Web hat heute **keine** Test-Infrastruktur (`AGENTS.md §4`). v0.7.0 ist die erste sinnvolle Gelegenheit, eine **Pure-Function-Test-Suite** für die vier neuen Lib-Helper aufzubauen (siehe D4). Komponenten-Tests (React/JSX) bleiben out-of-scope.
> **Datei-Konvention:** jeder Task listet die Dateien, die er anfasst (R = lesen, M = schreiben, C = anlegen). Diese Tasks sind für **`sdd-apply`**, nicht für `sdd-propose` — `sdd-propose` ist mit dem Schreiben dieser Datei fertig.

---

## T0 — Pre-flight: Baseline-Messung & Code-Audit

> **Status:** Vom Parent bereits angestoßen (Briefing). Dieser Task misst einmalig den heutigen Stand, damit `sdd-apply` eine reproduzierbare Vergleichsbasis hat.

- **R** `packages/web/src/pages/JobEditor.tsx`:
  - Aktuelle `ActionCard` ist Zeile ~250–290: `<div className="card …"><div className="card-body p-4 space-y-3"><div className="flex items-center gap-3"><span className="badge ${action.type === "webhook" ? "badge-primary" : "badge-secondary"}">{action.type} #{index + 1}</span>…</div>{action.type === "webhook" ? <WebhookFields …/> : <ShellFields …/>}</div></div>`.
  - `addWebhook()` (Zeile ~96) setzt `position: actions.length`, `config: { method: "POST", url: "https://example.com/webhook", timeoutMs: 30000 }`.
  - `addShell()` (Zeile ~106) setzt `position: actions.length`, `config: { command: 'echo "hello"', timeoutMs: 60000 }`.
  - `removeAction(idx)` (Zeile ~117) `setActions(actions.filter((_, i) => i !== idx).map((a, i) => ({ ...a, position: i })))` — **dense renumbering ist bereits etabliert** (Bestätigung D1).
- **R** `packages/core/src/types.ts`:
  - `JobAction` hat `id`, `jobId`, `type`, `position`, `continueOnError`, `config`. Kein neuer Typ nötig.
  - `Run.actionRuns[]` hat `actionId`, `status: "running"|"success"|"failed"`, `startedAt`, `finishedAt`, `durationMs`, `error`. Genug für Status-Badge.
- **R** `packages/web/src/lib/api.ts`:
  - `api.runs.list({ jobId, limit })` ist bereits da. `limit=50` ist der Maximum-Wert, den wir brauchen.
- **R** `@radix-ui/react-icons`:
  - Verfügbare Icons: `GlobeIcon`, `CodeIcon`, `ChevronUpIcon`, `ChevronDownIcon`, `DragHandleDots2Icon`, `CheckCircledIcon`, `CrossCircledIcon`, `ReloadIcon`, `MinusIcon`, `PlusIcon`, `TrashIcon`. Alle bereits im Bundle (v0.6.0 nutzt `CircleBackslashIcon`, `PlayIcon`, `PlusIcon`, `TrashIcon`).
- **R** `docs/API.md` Zeile 14: `/api/health` Response enthält `"version": "0.6.0"` — wird auf `"0.7.0"` geändert.
- **R** `package.json` (Root): `version: "0.6.0"`, `packages/web/package.json`: `version: "0.6.0"`, `packages/core/package.json`: `version: "0.6.0"`. Alle drei müssen auf `0.7.0`.
- **R** `packages/core/src/cli.ts` Zeile ~28: `.version("0.6.0")` muss auf `.version("0.7.0")`.
- **R** `openspec/config.yaml` Zeile ~14: `project.version: 0.6.0` muss auf `0.7.0`.
- Ausführen:
  ```powershell
  # Bundle-Größe Baseline:
  npm run build 2>&1 | Select-String "dist"
  # Aktuelle Web-Version:
  Select-String -Path packages/core/src/server.ts,packages/core/src/cli.ts,package.json,packages/*/package.json,openspec/config.yaml -Pattern "0\.6\.0"
  # Aktuelle Icon-Nutzung im JobEditor:
  Select-String -Path packages/web/src/pages/JobEditor.tsx -Pattern "from \"@radix-ui/react-icons\""
  # Anzahl der vorhandenen Core-Tests:
  npm test 2>&1 | Select-String "tests"
  ```
- **Gate 0.1:** Notiz mit Bundle-Größe (vor T-Endzustand), Versions-Treffern (mind. 5 für `0.6.0`), Icon-Import-Liste.
- **Gate 0.2:** Bestätigung, dass `removeAction` bereits dense renumberiert (D1-Cross-Check).

---

## T1 — Tests-first für die vier Pure-Helper (RED)

> **Erste Web-Test-Suite.** Vor jeder Produktiv-Zeile in `packages/web/src/lib/{actionSummary,actionStatus,actionOrder,formatRelative}.ts` steht ein Test, der fehlschlägt. Erfüllt `rule: test-coverage-gap-disclosed` für die Web-Surface.

### T1.1 — `actionSummary.test.ts`

- **C** `packages/web/src/lib/actionSummary.test.ts`
- Imports:
  ```ts
  import { describe, it } from "node:test";
  import assert from "node:assert/strict";
  import { summary, truncateUrl } from "./actionSummary.js";
  import type { JobAction } from "./types.js";
  ```
- **Mindestens 8 Test-Fälle**:

  | Block | Test |
  |---|---|
  | `truncateUrl` | (a) `"https://example.com/short"` (≤ 50) → unverändert; (b) 60-Zeichen-URL → 47 + `…`; (c) exakt 50 → unverändert; (d) exakt 51 → 47 + `…`; (e) `null`/`undefined` → `""`. |
  | `summary` Webhook GET | `summary(webhook({ method: "GET", url: "https://api.example.com/v1/x" }))` matched `^GET\s+https://api\.example\.com/v1/x$`. |
  | `summary` Webhook POST | `summary(webhook({ method: "POST", url: "https://x.com/y" }))` matched `^POST\s+https://x\.com/y$`. |
  | `summary` Webhook PUT/PATCH/DELETE | Alle fünf HTTP-Methoden getestet. |
  | `summary` Webhook long-URL | 80-Zeichen-URL → `summary` enthält `…` und matched `^POST\s+https://.{43}…$`. |
  | `summary` Shell einfach | `summary(shell({ command: "backup.sh" }))` matched `^\$\sbackup\.sh\s+\(.*\)$`. |
  | `summary` Shell mit cwd | `summary(shell({ command: "backup.sh", cwd: "/srv/cron" }))` enthält `cwd: /srv/cron`. |
  | `summary` Shell mit timeout | `summary(shell({ command: "x.sh", timeoutMs: 60000 }))` enthält `timeout 60s`. |
  | `summary` Shell multi-line command | `summary(shell({ command: "echo a\necho b" }))` enthält nur die erste Zeile. |

- **Gate 1.1 (RED erwartet):** `node --test --import tsx packages/web/src/lib/actionSummary.test.ts` → ImportError (Datei `actionSummary.js` existiert noch nicht). Ausgabe in den Log.

### T1.2 — `actionStatus.test.ts`

- **C** `packages/web/src/lib/actionStatus.test.ts`
- Imports:
  ```ts
  import { describe, it } from "node:test";
  import assert from "node:assert/strict";
  import { statusForAction } from "./actionStatus.js";
  import type { ActionRun } from "../../core/src/types.js";
  ```
- **Mindestens 5 Test-Fälle**:

  | Block | Test |
  |---|---|
  | never | `statusForAction([], "abc")` → `{ color: "neutral", icon: "minus", label: "— never run" }`. |
  | success | `statusForAction([{ actionId: "abc", status: "success", finishedAt: "2026-07-01T12:00:00Z", durationMs: 150 }], "abc")` → `{ color: "success", icon: "check", label: startsWith("✓") }`. |
  | failed | `statusForAction([{ actionId: "abc", status: "failed", finishedAt: "2026-07-01T12:00:00Z", error: "x" }], "abc")` → `{ color: "error", icon: "cross", label: startsWith("✗") }`. |
  | running | `statusForAction([{ actionId: "abc", status: "running", startedAt: "2026-07-01T12:00:00Z" }], "abc")` → `{ color: "info", icon: "reload", label: startsWith("⋯") }`. |
  | wrong actionId | `statusForAction([{ actionId: "xyz", status: "success" }], "abc")` → `never`. |

- **Gate 1.2 (RED):** ImportError.

### T1.3 — `actionOrder.test.ts`

- **C** `packages/web/src/lib/actionOrder.test.ts`
- Imports:
  ```ts
  import { describe, it } from "node:test";
  import assert from "node:assert/strict";
  import { reorder } from "./actionOrder.js";
  import type { JobAction } from "./types.js";
  ```
- **Mindestens 6 Test-Fälle**:

  | Block | Test |
  |---|---|
  | down at idx 0 | `reorder([a,b,c], 0, "down")` → `[b,a,c]` mit `position` `[0,1,2]` und stabilen `id`s. |
  | up at idx 2 | `reorder([a,b,c], 2, "up")` → `[a,c,b]` mit `position` `[0,1,2]`. |
  | up at idx 0 | `reorder([a,b,c], 0, "up")` → unverändert (idempotent, kein out-of-bounds). |
  | down at last | `reorder([a,b,c], 2, "down")` → unverändert. |
  | 1-element array | `reorder([a], 0, "up")` und `("down")` → beide unverändert. |
  | empty array | `reorder([], 0, "down")` → `[]`. |

- **Gate 1.3 (RED):** ImportError.

### T1.4 — `formatRelative.test.ts`

- **C** `packages/web/src/lib/formatRelative.test.ts`
- Imports:
  ```ts
  import { describe, it } from "node:test";
  import assert from "node:assert/strict";
  import { formatRelativeTime } from "./formatRelative.js";
  ```
- **Mindestens 5 Test-Fälle**:

  | Block | Test |
  |---|---|
  | 12 ms | `formatRelativeTime("2026-07-01T12:00:00.000Z", new Date("2026-07-01T12:00:00.012Z"))` → `"12ms ago"`. |
  | 5 s | `formatRelativeTime("2026-07-01T12:00:00Z", new Date("2026-07-01T12:00:05Z"))` → `"5s ago"`. |
  | 3 min | `…3 min` → `"3m ago"`. |
  | 2 h | `…2 h` → `"2h ago"`. |
  | yesterday | `…25 h` → `"yesterday"`. |
  | 5 days | `…5 days` → `"Jul 1"` (oder ähnliches, locale-aware). |
  | invalid input | `formatRelativeTime(undefined)` → `"—"`; `formatRelativeTime("not-a-date")` → `"—"`. |
  | future date | `formatRelativeTime(<now+5s>, <now>)` → `"in 5s"` (defensiv; sollte nicht passieren, aber definiertes Verhalten). |

- **Gate 1.4 (RED):** ImportError.

> Hinweis: alle vier `*.test.ts` schlagen in T1 fehl, weil die `*.ts`-Module noch nicht existieren. Das ist beabsichtigt (RED-Phase).

---

## T2 — Implementierung der vier Pure-Helper (GREEN)

### T2.1 — `actionSummary.ts`

- **C** `packages/web/src/lib/actionSummary.ts`
- `truncateUrl(url: string, max = 50): string`:
  ```ts
  export function truncateUrl(url: string | undefined, max = 50): string {
    if (!url) return "";
    if (url.length <= max) return url;
    return url.slice(0, max - 1) + "…";
  }
  ```
- `summary(action: JobAction): string`:
  ```ts
  export function summary(action: JobAction): string {
    if (action.type === "webhook") {
      const cfg = action.config;
      const url = truncateUrl(cfg.url, 50);
      return `${cfg.method}  ${url}`;
    }
    // shell
    const cfg = action.config;
    const firstLine = cfg.command.split("\n")[0].trim();
    const details: string[] = [];
    if (cfg.cwd) details.push(`cwd: ${cfg.cwd}`);
    if (cfg.timeoutMs) details.push(`timeout ${Math.round(cfg.timeoutMs / 1000)}s`);
    const tail = details.length ? `  (${details.join(", ")})` : "";
    return `$ ${firstLine}${tail}`;
  }
  ```
- **Gate 2.1 (GREEN):** `node --test --import tsx packages/web/src/lib/actionSummary.test.ts` exit 0.

### T2.2 — `actionStatus.ts`

- **C** `packages/web/src/lib/actionStatus.ts`
- `statusForAction(runs: ActionRun[], actionId: string): { color, icon, label }`:
  ```ts
  export type StatusColor = "success" | "error" | "info" | "neutral";
  export type StatusIcon = "check" | "cross" | "reload" | "minus";

  export interface ActionStatus {
    color: StatusColor;
    icon: StatusIcon;
    label: string;
  }

  export function statusForAction(runs: ActionRun[], actionId: string): ActionStatus {
    // Neueste zuerst (Annahme: runs sind bereits sortiert; falls nicht,
    // sortiere hier nochmal). Vergleiche actionId strikt (case-sensitive UUID).
    const sorted = [...runs].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    const latest = sorted.find((r) => r.actionId === actionId);
    if (!latest) return { color: "neutral", icon: "minus", label: "— never run" };
    if (latest.status === "running") return { color: "info", icon: "reload", label: "⋯ running" };
    if (latest.status === "success") {
      const ago = latest.finishedAt ? formatRelativeTime(latest.finishedAt) : "";
      return { color: "success", icon: "check", label: `✓ ok${ago ? " " + ago : ""}` };
    }
    // failed
    const ago = latest.finishedAt ? formatRelativeTime(latest.finishedAt) : "";
    return { color: "error", icon: "cross", label: `✗ failed${ago ? " " + ago : ""}` };
  }
  ```
- **Gate 2.2 (GREEN):** Tests grün.

### T2.3 — `actionOrder.ts`

- **C** `packages/web/src/lib/actionOrder.ts`
- `reorder(actions: JobAction[], idx: number, direction: "up" | "down"): JobAction[]`:
  ```ts
  export function reorder(actions: JobAction[], idx: number, direction: "up" | "down"): JobAction[] {
    if (idx < 0 || idx >= actions.length) return actions;
    const swapWith = direction === "up" ? idx - 1 : idx + 1;
    if (swapWith < 0 || swapWith >= actions.length) return actions; // idempotent an den Rändern
    const next = actions.slice();
    [next[idx], next[swapWith]] = [next[swapWith], next[idx]];
    // Dense renumbering (D1).
    return next.map((a, i) => ({ ...a, position: i }));
  }
  ```
- **Gate 2.3 (GREEN):** Tests grün.

### T2.4 — `formatRelative.ts`

- **C** `packages/web/src/lib/formatRelative.ts`
- `formatRelativeTime(iso: string | undefined, now: Date = new Date()): string`:
  ```ts
  export function formatRelativeTime(iso: string | undefined, now: Date = new Date()): string {
    if (!iso) return "—";
    const t = new Date(iso).getTime();
    if (Number.isNaN(t)) return "—";
    const diffMs = now.getTime() - t;
    if (diffMs < 0) {
      // future
      const absMs = Math.abs(diffMs);
      if (absMs < 1000) return "in 1s";
      return `in ${Math.round(absMs / 1000)}s`;
    }
    if (diffMs < 1000) return `${diffMs}ms ago`;
    const sec = Math.floor(diffMs / 1000);
    if (sec < 60) return `${sec}s ago`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const dayDiff = Math.floor(hr / 24);
    if (dayDiff === 1) return "yesterday";
    // ≥ 2 days: use locale date
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  ```
- **Gate 2.4 (GREEN):** Tests grün.

### T2.5 — Skript-Erweiterung `package.json` (D4)

- **M** `package.json` (Root) — neuer Script:
  ```json
  "test:web": "node --test --import tsx 'packages/web/src/lib/**/*.test.ts'"
  ```
- **Gate 2.5:** `npm run test:web` exit 0; alle 4 Suites grün.

> Hinweis: `npm test` (root) bleibt unverändert (`packages/core/src/**/*.test.ts` only). Web-Tests sind ein separates `test:web`-Skript, bis die Web-Test-Strategie weiter reift.

---

## T3 — `ActionCard`-Redesign: Header + Status-Badge + Reorder

> **Der eigentliche UI-Refactor.** Diese Task modifiziert `packages/web/src/pages/JobEditor.tsx` substanziell. Die Pure-Helper sind die kanonische Logik; ActionCard ist dünnes Markup.

- **M** `packages/web/src/pages/JobEditor.tsx`
- **M** `useEffect`-Cleanup-Block hinzufügen (für Cancel-on-Unmount).

#### T3.1 — Neue Imports

- **M** `packages/web/src/pages/JobEditor.tsx` — am File-Anfang:
  ```tsx
  import {
    GlobeIcon, CodeIcon,
    ChevronUpIcon, ChevronDownIcon,
    DragHandleDots2Icon,
    CheckCircledIcon, CrossCircledIcon, ReloadIcon, MinusIcon,
    TrashIcon,
  } from "@radix-ui/react-icons";
  import { summary } from "../lib/actionSummary.js";
  import { statusForAction } from "../lib/actionStatus.js";
  import type { ActionStatus } from "../lib/actionStatus.js";
  import { reorder } from "../lib/actionOrder.js";
  import { formatRelativeTime } from "../lib/formatRelative.js";
  import type { ActionRun } from "../types.js";
  ```

#### T3.2 — `runsByActionId`-State + Run-Fetch

- **M** `JobEditor.tsx` — neuer State:
  ```tsx
  const [runsByActionId, setRunsByActionId] = useState<Map<string, ActionRun[]>>(new Map());
  ```
- **M** `JobEditor.tsx` — `useEffect` erweitern:
  ```tsx
  useEffect(() => {
    if (jobId) {
      api.jobs.get(jobId)
        .then((j) => { hydrate(j); setLoading(false); })
        .catch((e) => setError(e.message));
      // NEU: einmaliger Run-Fetch für die Status-Badges (R2).
      api.runs.list({ jobId, limit: 50 })
        .then((runs) => {
          const m = new Map<string, ActionRun[]>();
          for (const run of runs) {
            for (const ar of run.actionRuns ?? []) {
              const list = m.get(ar.actionId) ?? [];
              list.push(ar);
              m.set(ar.actionId, list);
            }
          }
          setRunsByActionId(m);
        })
        .catch(() => { /* silent — Badge fällt auf "never run" zurück */ });
    }
  }, [jobId]);
  ```

#### T3.3 — Debounced Reorder

- **M** `JobEditor.tsx` — neuer Ref + Helpers:
  ```tsx
  const pendingReorderRef = useRef<{ timer: number | null; dirty: boolean }>({ timer: null, dirty: false });

  function cancelPendingReorder() {
    if (pendingReorderRef.current.timer != null) {
      clearTimeout(pendingReorderRef.current.timer);
      pendingReorderRef.current = { timer: null, dirty: false };
    }
  }

  function moveAction(idx: number, direction: "up" | "down") {
    setActions((prev) => reorder(prev, idx, direction));
    scheduleReorderSave();
  }

  function scheduleReorderSave() {
    pendingReorderRef.current.dirty = true;
    if (pendingReorderRef.current.timer != null) clearTimeout(pendingReorderRef.current.timer);
    pendingReorderRef.current.timer = window.setTimeout(async () => {
      pendingReorderRef.current.timer = null;
      if (!pendingReorderRef.current.dirty || !jobId) return;
      pendingReorderRef.current.dirty = false;
      try {
        await api.jobs.update(jobId, { actions });
      } catch (err: any) {
        setError(err.message);
      }
    }, 250);
  }
  ```
- **M** `JobEditor.tsx` — Cleanup-Effect:
  ```tsx
  useEffect(() => () => cancelPendingReorder(), []);
  ```
- **M** `JobEditor.tsx` — `save()` und `testRun()` rufen **zuerst** `cancelPendingReorder()` auf (vor `setSaving(true)` bzw. `setTestRunning(true)`).

#### T3.4 — `ActionCard`-JSX ersetzen

- **M** `JobEditor.tsx` — komplette `ActionCard`-Komponente umbauen:
  ```tsx
  function ActionCard({
    action, index, totalCount, isFirst, jobId, saving, isNew, runsByActionId,
    onChange, onRemove, moveAction,
  }: {
    action: JobAction;
    index: number;
    totalCount: number;
    isFirst: boolean;
    jobId?: string;
    saving: boolean;
    isNew: boolean;
    runsByActionId: Map<string, ActionRun[]>;
    onChange: (patch: Partial<JobAction>) => void;
    onRemove: () => void;
    moveAction: (idx: number, direction: "up" | "down") => void;
  }) {
    const status = statusForAction(runsByActionId.get(action.id) ?? [], action.id);
    return (
      <div className="card bg-base-100/60 border border-base-300/40">
        <div className="card-body p-4 space-y-3">
          {/* Header */}
          <div className="flex items-center gap-3">
            {/* Icon + Tint */}
            <span
              data-testid="action-icon"
              data-action-icon={action.type}
              className={`flex items-center justify-center w-9 h-9 rounded-lg shrink-0 ${
                action.type === "webhook" ? "bg-primary/15 text-primary" : "bg-secondary/15 text-secondary"
              }`}
              aria-hidden="true"
            >
              {action.type === "webhook" ? <GlobeIcon /> : <CodeIcon />}
            </span>

            {/* Summary */}
            <span data-testid="action-summary" className="font-mono text-sm truncate flex-1">
              {summary(action)}
            </span>

            {/* Status-Badge */}
            <ActionStatusBadge status={status} />

            {/* Drag-Handle (visual hint only, no DnD) */}
            <DragHandleDots2Icon className="text-base-content/30" aria-hidden="true" />

            {/* Reorder */}
            <div className="join">
              <button
                type="button"
                className="btn btn-xs btn-ghost join-item"
                data-testid="reorder-up"
                aria-label={`Move action ${index + 1} up`}
                disabled={isFirst}
                onClick={() => moveAction(index, "up")}
              >
                <ChevronUpIcon />
              </button>
              <button
                type="button"
                className="btn btn-xs btn-ghost join-item"
                data-testid="reorder-down"
                aria-label={`Move action ${index + 1} down`}
                disabled={index === totalCount - 1}
                onClick={() => moveAction(index, "down")}
              >
                <ChevronDownIcon />
              </button>
            </div>

            {/* Continue-on-error */}
            <label className="label cursor-pointer gap-1 py-0" title="Continue if this action fails">
              <input
                type="checkbox"
                className="toggle toggle-xs"
                checked={action.continueOnError}
                onChange={(e) => onChange({ continueOnError: e.target.checked })}
              />
            </label>

            {/* Delete */}
            <button
              type="button"
              className="btn btn-ghost btn-xs btn-square text-error"
              aria-label={`Remove action ${index + 1}`}
              onClick={onRemove}
            >
              <TrashIcon />
            </button>
          </div>

          {/* Collapsible Form */}
          <details
            data-testid="action-form"
            open={isNew}
            className="rounded-md border border-base-300/30 bg-base-100/40"
          >
            <summary className="cursor-pointer select-none px-3 py-1.5 text-xs uppercase text-base-content/60 hover:text-base-content/90">
              Edit fields
            </summary>
            <div className="px-3 pb-3 pt-1">
              {action.type === "webhook" ? (
                <WebhookFields
                  config={action.config as WebhookConfig}
                  onChange={(cfg) => onChange({ config: cfg } as any)}
                  jobId={jobId}
                  isFirstAction={isFirst}
                  saving={saving}
                />
              ) : (
                <ShellFields
                  config={action.config as ShellConfig}
                  onChange={(cfg) => onChange({ config: cfg } as any)}
                />
              )}
            </div>
          </details>
        </div>
      </div>
    );
  }
  ```

#### T3.5 — Neue Sub-Component `ActionStatusBadge`

- **M** `JobEditor.tsx` — am File-Ende (neben `ShellFields`):
  ```tsx
  function ActionStatusBadge({ status }: { status: ActionStatus }) {
    const colorClass = {
      success: "text-success bg-success/10",
      error: "text-error bg-error/10",
      info: "text-info bg-info/10",
      neutral: "text-base-content/40 bg-base-content/5",
    }[status.color];
    const Icon = {
      check: CheckCircledIcon,
      cross: CrossCircledIcon,
      reload: ReloadIcon,
      minus: MinusIcon,
    }[status.icon];
    return (
      <span
        data-testid="status-badge"
        data-status={status.color}
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${colorClass}`}
        title={status.label}
      >
        <Icon className="w-3.5 h-3.5" aria-hidden="true" />
        <span>{status.label}</span>
      </span>
    );
  }
  ```

#### T3.6 — `ActionCard`-Aufruf-Site

- **M** `JobEditor.tsx` — innerhalb von `actions.map((a, i) => …)`:
  ```tsx
  <ActionCard
    key={(a as any).id ?? i}
    action={a}
    index={i}
    isFirst={i === 0}
    totalCount={actions.length}
    jobId={jobId}
    saving={saving}
    isNew={isNew}
    runsByActionId={runsByActionId}
    onChange={(patch) => updateAction(i, patch)}
    onRemove={() => removeAction(i)}
    moveAction={moveAction}
  />
  ```

- **Gate 3.1:** `npm run typecheck -w packages/web` exit 0.
- **Gate 3.2:** `npm run test:web` exit 0 (vier Helper-Suites grün).
- **Gate 3.3:** S1–S5, S8 visuell — Reviewer-Auge; siehe `design.md §11` für die `data-testid`-Erwartungen.

---

## T4 — Empty-State mit zwei CTA-Cards

- **M** `packages/web/src/pages/JobEditor.tsx` — Empty-State-Block ersetzen (im `actions`-Card-Body):
  ```tsx
  {actions.length === 0 ? (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2" data-testid="empty-state">
      <button
        type="button"
        className="btn btn-lg h-auto py-6 flex-col gap-2 bg-base-100/60 border border-base-300/40 hover:bg-base-100/80"
        data-testid="add-webhook-cta"
        onClick={addWebhook}
      >
        <span className="flex items-center justify-center w-12 h-12 rounded-xl bg-primary/15 text-primary">
          <GlobeIcon className="w-7 h-7" aria-hidden="true" />
        </span>
        <span className="font-semibold">Add a Webhook</span>
        <span className="text-xs text-base-content/60 font-normal">HTTP request to any URL with headers and body</span>
      </button>
      <button
        type="button"
        className="btn btn-lg h-auto py-6 flex-col gap-2 bg-base-100/60 border border-base-300/40 hover:bg-base-100/80"
        data-testid="add-shell-cta"
        onClick={addShell}
      >
        <span className="flex items-center justify-center w-12 h-12 rounded-xl bg-secondary/15 text-secondary">
          <CodeIcon className="w-7 h-7" aria-hidden="true" />
        </span>
        <span className="font-semibold">Add a Shell Command</span>
        <span className="text-xs text-base-content/60 font-normal">Local command with cwd, timeout, and allowed-paths guard</span>
      </button>
    </div>
  ) : (
    <div className="space-y-3">
      {actions.map((a, i) => (
        <ActionCard …/>
      ))}
    </div>
  )}
  ```

- **M** — Sicherstellen, dass die Top-Bar-Buttons (`+ Webhook`, `+ Shell`) im Join bleiben, weil sie für den „add-during-existing-actions"-Pfad sinnvoll sind (Empty-State ist nur bei `actions.length === 0`).

- **Gate 4.1:** S6 visuell — Reviewer-Auge; `data-testid="add-webhook-cta"` und `data-testid="add-shell-cta"` vorhanden im DOM.

---

## T5 — Version-Bump + Doku + README/CHANGELOG

- **M** `package.json` (Root): `"version": "0.6.0"` → `"0.7.0"`.
- **M** `packages/web/package.json`: `"version": "0.6.0"` → `"0.7.0"`.
- **M** `packages/core/package.json`: `"version": "0.6.0"` → `"0.7.0"`.
- **M** `packages/core/src/cli.ts` Zeile ~28: `.version("0.6.0")` → `.version("0.7.0")`.
- **M** `packages/core/src/server.ts`: in der `/api/health`-Route `version: "0.6.0"` → `version: "0.7.0"`.
- **M** `openspec/config.yaml`: `project.version: 0.6.0` → `0.7.0`.
- **M** `README.md` Zeile 5: `> **Status:** v0.6.0 — …` → `> **Status:** v0.7.0 — …, edit screen shows action summaries, status badges, and reorder buttons`.
- **M** `README.md` Feature-Liste: neuer Bullet „**Action-Karten mit Summary-Header** — jede Action zeigt oben `POST https://…` oder `$ cmd (cwd, timeout)` plus ein Status-Badge (✓/✗/⋯/—) und Reorder-Pfeile."
- **M** `CHANGELOG.md`: neue Top-Sektion nach `[Unreleased]`:
  ```markdown
  ## [0.7.0] — 2026-07-XX

  ### Added
  - **JobEditor: Action-Cards mit Summary-Header** — jede Card zeigt oben einzeilig `POST https://…` (Webhook) bzw. `$ cmd (cwd, timeout)` (Shell).
  - **JobEditor: Status-Badge pro Action** — farbcodiert (success/error/info/neutral), basiert auf dem letzten `ActionRun` für die `actionId`. Quelle: `GET /api/runs?jobId=X&limit=50`, einmaliger Fetch beim Job-Load, kein Live-Polling.
  - **JobEditor: Reorder-Buttons + Drag-Handle-Symbol** — Up/Down-Pfeile tauschen die `position` mit dem Nachbarn; visuelles `≡`-Symbol als Hinweis (kein echtes Drag-and-Drop, das ist v0.8+).
  - **JobEditor: neuer Empty-State** — zwei große „Add Webhook / Add Shell"-Cards ersetzen den bisherigen Text-Block.
  - **JobEditor: Form-Felder in `<details>`** — für existierende Jobs collapsed by default; für neue Jobs expanded by default.

  ### Internal
  - Vier neue Pure-Helper in `packages/web/src/lib/`: `actionSummary.ts`, `actionStatus.ts`, `actionOrder.ts`, `formatRelative.ts`.
  - Neuer Skript `npm run test:web` für die Web-Helper-Tests (kein neues Test-Framework; `node --test --import tsx`).
  - Keine Datenmodell-Änderung; `position`-Field bleibt, wird dichter renummeriert bei jedem Reorder.
  ```

- Verifikation:
  ```powershell
  Select-String -Path package.json,packages/*/package.json,packages/core/src/cli.ts,packages/core/src/server.ts,openspec/config.yaml -Pattern "0\.6\.0"
  # erwartet: 0 Treffer (oder ausschließlich in CHANGELOG.md / docs/)
  Select-String -Path package.json,packages/*/package.json,packages/core/src/cli.ts,packages/core/src/server.ts,openspec/config.yaml -Pattern "0\.7\.0"
  # erwartet: ≥ 6 Treffer
  ```
- **Gate 5.1:** `grep -RIn "0.6.0" package.json packages/*/package.json packages/core/src/cli.ts packages/core/src/server.ts openspec/config.yaml` → 0 Treffer.
- **Gate 5.2:** gleicher Befehl für `"0.7.0"` → ≥ 6 Treffer.

---

## T6 — Gates: typecheck + tests + build + smoke + commit + push

- **R** Alle Quellen seit T0.
- Ausführen:
  ```powershell
  npm run typecheck
  npm run test:web
  npm test
  npm run build
  powershell -ExecutionPolicy Bypass -File scripts/smoke.ps1
  ```
- **Gate 6.1 (S8 typecheck):** `npm run typecheck` exit 0.
- **Gate 6.2 (S8 build):** `npm run build` exit 0; Lockfile-Diff betrifft nur ggf. dokumentierte Deps (sollte leer sein — keine neuen Deps).
- **Gate 6.3 (S8 smoke):** `scripts/smoke.ps1` exit 0; im Smoke-Output `=== done ===` oder etablierte Erfolgsmeldung.
- **Gate 6.4 (S7):** Pure-Function-Test in `actionOrder.test.ts` zeigt: `reorder([a,b,c], 1, "down")` ergibt `[{id:a,position:0},{id:b,position:1},{id:c,position:2}]` mit stabilen IDs und dichter Position-Reihenfolge.
- **Gate 6.5:** `npm run test:web` zeigt ≥ 24 Tests (8 + 5 + 6 + 5), 0 Failures.
- **Gate 6.6:** Bundle-Diff vs. v0.6.0 dokumentiert im PR-Body (gzip + raw bytes).
- Commit + Push:
  ```powershell
  git status
  git add \
    openspec/changes/v0.7.0-edit-job-ui-polish/ \
    package.json packages/web/package.json packages/core/package.json \
    packages/web/src/lib/ \
    packages/web/src/pages/JobEditor.tsx \
    packages/core/src/cli.ts packages/core/src/server.ts \
    openspec/config.yaml README.md CHANGELOG.md
  git status
  git commit -m "feat(v0.7.0): edit-job-ui-polish - summary header, status badge, reorder buttons, empty-state cards"
  git push origin master
  ```
- **Gate 6.7:** `git log -1 --pretty=%s` → exakt der vorgegebene Subject.
- **Gate 6.8:** `git diff master@{1} master --stat` zeigt nur die oben `git add`-eten Pfade.
- **Gate 6.9:** Re-Run `npm run typecheck && npm run test:web && powershell -ExecutionPolicy Bypass -File scripts/smoke.ps1` — alles grün.

> Commit-Message-Konvention: v0.5.0/v0.6.0 nutzten `feat(v0.X.Y): …`. v0.7.0 setzt das mit `feat(v0.7.0):` fort.

---

## Cross-Phase-Checkliste (bevor `sdd-apply` als erfolgreich gilt)

- [ ] T0 Baseline-Analyse geschrieben (Bundle-Size, Versions-Hits, Icon-Inventar)
- [ ] T1 Vier `*.test.ts` **RED** nachweisbar (ImportError in allen vier Suiten)
- [ ] T2 Vier `*.ts`-Helper machen die Tests **GREEN**; `npm run test:web` läuft
- [ ] T3 `ActionCard` ist redesigned: Icon + Summary + Status-Badge + Reorder-Buttons + `<details>`-Form; `runsByActionId` Map-State + Debounced-PATCH
- [ ] T4 Empty-State zeigt zwei CTA-Cards mit `data-testid="add-webhook-cta"` / `add-shell-cta"`
- [ ] T5 Versionsstrings vollständig von `0.6.0` auf `0.7.0`; README + CHANGELOG aktualisiert
- [ ] T6 Typecheck + Web-Tests + Core-Tests + Build + Smoke + Commit + Push — alle grün
- [ ] **Acceptance Criteria S1–S8** alle erfüllt (Tabelle in `proposal.md §3`)
- [ ] **Decisions D1–D14** aus `proposal.md §8` sind in der Implementierung erkennbar
- [ ] **Risiken R1–R12** aus `proposal.md §6` sind mitigiert (insb. R2, R3, R4, R9)
- [ ] `git diff packages/*/src/` zeigt nur die geplanten Änderungen (T6 `git add`-Liste); sonst nichts Unerwartetes
- [ ] **Keine neuen npm-Dependencies** in `package.json` oder `packages/*/package.json` (Constraint des Parents)

---

## Beobachtungen für `sdd-apply` (kein T-Task, Empfehlungen)

1. **Bundle-Delta**: v0.7.0 ist UI-only. Erwartetes Bundle-Plus: < 2 KB gzip. Die vier neuen Lib-Helper sind trivial (~30–50 Zeilen jeder). ActionCard wächst um ~50 Zeilen Markup. Im PR-Body dokumentieren.
2. **Test-Runner-Initialisierung**: `node --test --import tsx` muss `tsx` korrekt laden. Falls Web-Tests in einer Windows-Sandbox ohne `tsx`-Binary fehlschlagen: `npm install` muss vorher laufen (nicht Teil von v0.7.0, aber Gate).
3. **`formatRelativeTime` Locale**: das Proposal nutzt `toLocaleDateString("en-US", …)`. Wenn der User später `de-DE` möchte, ist das eine Zwei-Zeilen-Änderung in `formatRelative.ts`. Out-of-scope für v0.7.0.
4. **`statusForAction` und `partial`-Status**: aktuell wird `partial` wie `failed` behandelt (D5/Q4). Wenn der User einen eigenen Status möchte: `actionStatus.ts` Mapping-Update + zusätzliche `ActionStatusColor = "warning"`-Variante. Out-of-scope.
5. **`api.runs.list({ jobId, limit: 50 })` Performance**: bei großen Run-Historien (>1000 Runs, weil `runs.json` auf 1000 cappt) ist `limit=50` immer noch „die letzten 50" — gut. Worst-Case-Render-Zeit ist Map-Build + 5–10 Action-Lookups = < 1 ms.
6. **Zukünftige Web-Tests**: `npm run test:web` ist der Einstieg. Wenn das Component-Testing dazukommt (z. B. mit Vitest + @testing-library/react), ist das ein eigener Change. Out-of-scope für v0.7.0.
7. **Folge-Changes (eigene Change-IDs)**:
   - Drag-and-Drop-Reordering (v0.8+)
   - Per-Action-Run-History im Editor (v0.8+)
   - Live-Status via WebSocket/SSE (v0.8+)
   - Per-Action „Test run"-Button (v0.8+)
   - Auto-Expand der ersten Action für **alle** Jobs (Toggle-Setting, v0.8+)
   - React-Component-Test-Setup (Vitest, v0.8+)
   - `data-testid`-Snapshot-Smoke als separater v0.8+-Change