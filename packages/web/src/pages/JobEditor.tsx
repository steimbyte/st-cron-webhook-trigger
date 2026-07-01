import { useEffect, useRef, useState } from "react";
import {
  GlobeIcon,
  CodeIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  DragHandleDots2Icon,
  CheckCircledIcon,
  CrossCircledIcon,
  ReloadIcon,
  MinusIcon,
  PlayIcon as Play,
  PlusIcon as Plus,
  TrashIcon as Trash,
} from "@radix-ui/react-icons";
import CronBuilder from "../components/CronBuilder";
import { api } from "../lib/api";
import { parseCurl } from "../lib/curlParser";
import { summarize } from "../lib/actionSummary";
import { moveUp, moveDown } from "../lib/reorderActions";
import { statusForRun } from "../lib/runStatus";
import { formatRelative } from "../lib/relativeTime";
import type { ActionStatus } from "../lib/runStatus";
import type { Job, JobAction, WebhookConfig, ShellConfig, Run } from "../types";

interface Props {
  jobId?: string;
  onDone: () => void;
}

const COMMON_TZ = [
  "UTC", "Europe/Berlin", "Europe/London", "Europe/Paris",
  "America/New_York", "America/Los_Angeles", "America/Chicago",
  "Asia/Tokyo", "Asia/Shanghai", "Asia/Kolkata", "Australia/Sydney",
];

// v0.7.0 — debounce window for reorder PATCH (D6). Each new click within the
// window resets the timer; save()/testRun()/unmount cancels immediately (R3).
const REORDER_DEBOUNCE_MS = 250;

export default function JobEditor({ jobId, onDone }: Props) {
  const isNew = !jobId;
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [testRunning, setTestRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [cronExpression, setCronExpression] = useState("*/5 * * * *");
  const [timezone, setTimezone] = useState("UTC");
  const [enabled, setEnabled] = useState(true);
  const [actions, setActions] = useState<JobAction[]>([]);

  // v0.7.0 — latest-action map for the status badges (D2). We hold the most
  // recent Run per actionId; Run.status drives the badge tone. Per-action
  // accuracy is partial (a Run with one failed action shows "failed" on
  // every action in the run); per D5 the partial bucket collapses into
  // error, so this is acceptable.
  const [runsByActionId, setRunsByActionId] = useState<Map<string, Run>>(new Map());

  // v0.7.0 — debounce machinery for reorder PATCH (D6 / R3 / R4).
  //   - `actionsRef` keeps a live pointer to the current `actions` so the
  //     timer closure never sees a stale snapshot when the user clicks
  //     multiple times within the debounce window.
  //   - `pendingReorderRef` holds the debounced timer + dirty flag.
  const actionsRef = useRef<JobAction[]>([]);
  const pendingReorderRef = useRef<{ timer: number | null; dirty: boolean }>({
    timer: null,
    dirty: false,
  });

  // Keep actionsRef synchronised with the latest state.
  useEffect(() => {
    actionsRef.current = actions;
  }, [actions]);

  // Cleanup-on-unmount: cancel any in-flight reorder timer (R3).
  useEffect(() => () => cancelPendingReorder(), []);

  useEffect(() => {
    if (!jobId) return;
    api.jobs
      .get(jobId)
      .then((j) => {
        hydrate(j);
        setLoading(false);
      })
      .catch((e) => setError(e.message));

    // v0.7.0 — one-shot runs fetch for the status badges (R2).
    api.runs
      .list({ jobId, limit: 50 })
      .then((runs) => {
        const m = new Map<string, Run>();
        // Most-recent first: iterate the array as returned by the API
        // (already sorted by startedAt desc) and only keep the FIRST
        // occurrence per actionId.
        for (const run of runs) {
          for (const ar of run.actionRuns ?? []) {
            if (!m.has(ar.actionId)) m.set(ar.actionId, run);
          }
        }
        setRunsByActionId(m);
      })
      .catch(() => {
        // Silent: every action's badge will fall back to "never run"
        // (acceptable per design §6.3).
      });
  }, [jobId]);

  function hydrate(j: Job) {
    setName(j.name);
    setDescription(j.description ?? "");
    setCronExpression(j.cronExpression);
    setTimezone(j.timezone);
    setEnabled(j.enabled);
    setActions(j.actions);
  }

  function cancelPendingReorder() {
    if (pendingReorderRef.current.timer != null) {
      clearTimeout(pendingReorderRef.current.timer);
      pendingReorderRef.current = { timer: null, dirty: false };
    }
  }

  function moveAction(idx: number, direction: "up" | "down") {
    setActions((prev) =>
      direction === "up" ? moveUp(prev, idx) : moveDown(prev, idx),
    );
    scheduleReorderSave();
  }

  function scheduleReorderSave() {
    pendingReorderRef.current.dirty = true;
    if (pendingReorderRef.current.timer != null) {
      clearTimeout(pendingReorderRef.current.timer);
    }
    pendingReorderRef.current.timer = window.setTimeout(async () => {
      pendingReorderRef.current.timer = null;
      if (!pendingReorderRef.current.dirty || !jobId) return;
      pendingReorderRef.current.dirty = false;
      try {
        // Read from the ref so we never serialise a stale snapshot.
        await api.jobs.update(jobId, { actions: actionsRef.current });
      } catch (err: any) {
        setError(err.message);
      }
    }, REORDER_DEBOUNCE_MS);
  }

  async function save() {
    cancelPendingReorder(); // R3 — single PATCH, never in parallel with reorder.
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name,
        description: description || undefined,
        cronExpression,
        timezone,
        enabled,
        actions,
      };
      if (isNew) {
        await api.jobs.create(payload);
      } else {
        await api.jobs.update(jobId!, payload);
      }
      onDone();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function testRun() {
    cancelPendingReorder(); // R9 — single PATCH, never in parallel with reorder.
    setTestRunning(true);
    setError(null);
    try {
      const payload = { name, description, cronExpression, timezone, enabled, actions };
      let targetId = jobId;
      if (!targetId) {
        const j = await api.jobs.create(payload);
        targetId = j.id;
        hydrate(j);
      } else {
        await api.jobs.update(targetId, payload);
      }
      await api.jobs.run(targetId);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setTestRunning(false);
    }
  }

  function addWebhook() {
    const newAction: JobAction = {
      id: crypto.randomUUID(),
      jobId: "",
      type: "webhook",
      position: actions.length,
      continueOnError: false,
      config: { method: "POST", url: "https://example.com/webhook", timeoutMs: 30000 },
    } as JobAction;
    setActions([...actions, newAction]);
  }

  function addShell() {
    const newAction: JobAction = {
      id: crypto.randomUUID(),
      jobId: "",
      type: "shell",
      position: actions.length,
      continueOnError: false,
      config: { command: 'echo "hello"', timeoutMs: 60000 },
    } as JobAction;
    setActions([...actions, newAction]);
  }

  function removeAction(idx: number) {
    // Dense renumbering on delete mirrors the reorder helpers (D1).
    setActions(actions.filter((_, i) => i !== idx).map((a, i) => ({ ...a, position: i } as JobAction)));
    scheduleReorderSave();
  }

  function updateAction(idx: number, patch: Partial<JobAction>) {
    setActions(actions.map((a, i) => (i === idx ? ({ ...a, ...patch } as JobAction) : a)));
  }

  if (loading) {
    return (
      <div className="p-12 text-center text-base-content/50">
        <span className="loading loading-spinner loading-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-5xl">
      <div className="flex items-end justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-semibold">{isNew ? "New job" : "Edit job"}</h1>
          <p className="text-sm text-base-content/60">
            Configure the schedule and actions for this job.
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-ghost btn-sm" onClick={onDone}>Cancel</button>
          <button className="btn btn-soft btn-sm gap-1" onClick={testRun} disabled={testRunning || !name || !cronExpression}>
            <Play />
            {testRunning ? "Running…" : "Test run"}
          </button>
          <button className="btn btn-primary btn-sm" onClick={save} disabled={saving || !name || !cronExpression}>
            {isNew ? "Create" : "Save"}
          </button>
        </div>
      </div>

      {error ? (
        <div role="alert" className="alert alert-error">
          <span>{error}</span>
        </div>
      ) : null}

      {/* Identity */}
      <div className="card bg-base-200/60 border border-base-300/60">
        <div className="card-body p-5 space-y-4">
          <div className="flex flex-wrap gap-3 items-end">
            <label className="form-control flex-1 min-w-[260px]">
              <div className="label py-1">
                <span className="label-text text-xs uppercase text-base-content/50">Name</span>
              </div>
              <input
                type="text"
                className="input input-bordered w-full bg-base-100/60"
                placeholder="e.g. heartbeat"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="form-control">
              <div className="label py-1">
                <span className="label-text text-xs uppercase text-base-content/50">Enabled</span>
              </div>
              <input
                type="checkbox"
                className="toggle toggle-primary"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
              />
            </label>
          </div>
          <label className="form-control">
            <div className="label py-1">
              <span className="label-text text-xs uppercase text-base-content/50">Description</span>
            </div>
            <textarea
              className="textarea textarea-bordered w-full bg-base-100/60"
              placeholder="optional"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
        </div>
      </div>

      {/* Schedule */}
      <div className="card bg-base-200/60 border border-base-300/60">
        <div className="card-body p-5 space-y-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[300px]">
              <div className="text-xs uppercase text-base-content/50 mb-1">Schedule</div>
              <CronBuilder value={cronExpression} onChange={setCronExpression} timezone={timezone} />
            </div>
            <label className="form-control">
              <div className="label py-1">
                <span className="label-text text-xs uppercase text-base-content/50">Timezone</span>
              </div>
              <select
                className="select select-bordered bg-base-100/60 min-w-[200px]"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
              >
                {COMMON_TZ.map((tz) => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="card bg-base-200/60 border border-base-300/60">
        <div className="card-body p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Actions</h2>
            <div className="join">
              <button type="button" className="btn btn-sm join-item" onClick={addWebhook}>
                <Plus /> Webhook
              </button>
              <button type="button" className="btn btn-sm join-item" onClick={addShell}>
                <Plus /> Shell
              </button>
            </div>
          </div>

          {actions.length === 0 ? (
            // T4 — empty state CTA cards (S6).
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
                <span className="text-xs text-base-content/60 font-normal">
                  POST to a URL on the schedule
                </span>
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
                <span className="text-xs text-base-content/60 font-normal">
                  Run a local command
                </span>
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {actions.map((a, i) => (
                <ActionCard
                  key={(a as any).id ?? i}
                  action={a}
                  index={i}
                  isFirst={i === 0}
                  isLast={i === actions.length - 1}
                  totalCount={actions.length}
                  jobId={jobId}
                  saving={saving}
                  isNew={isNew}
                  status={statusForRun(runsByActionId.get((a as any).id) ?? null)}
                  onChange={(patch) => updateAction(i, patch)}
                  onRemove={() => removeAction(i)}
                  moveAction={moveAction}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// ActionCard — v0.7.0 redesign
// ===========================================================================

function ActionCard({
  action,
  index,
  isFirst,
  isLast,
  totalCount,
  jobId,
  saving,
  isNew,
  status,
  onChange,
  onRemove,
  moveAction,
}: {
  action: JobAction;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  totalCount: number;
  jobId?: string;
  saving: boolean;
  isNew: boolean;
  status: ActionStatus;
  onChange: (patch: Partial<JobAction>) => void;
  onRemove: () => void;
  moveAction: (idx: number, direction: "up" | "down") => void;
}) {
  return (
    <div className="card bg-base-100/60 border border-base-300/40">
      <div className="card-body p-4 space-y-3">
        {/* Header (S1 / S2 / S3 / S4) */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Type icon (Globe for webhook, Code for shell) with tint (S2) */}
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

          {/* Summary (S1) */}
          <span data-testid="action-summary" className="font-mono text-sm truncate flex-1 min-w-[180px]">
            {summarize(action)}
          </span>

          {/* Status badge (S4) */}
          <ActionStatusBadge status={status} />

          {/* Drag handle (visual hint only, no DnD) */}
          <span title="Use the arrows to reorder" className="text-base-content/30 hidden sm:inline">
            <DragHandleDots2Icon aria-hidden="true" />
          </span>

          {/* Reorder buttons (S3) */}
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
              disabled={isLast}
              onClick={() => moveAction(index, "down")}
            >
              <ChevronDownIcon />
            </button>
          </div>

          {/* Continue on error */}
          <label
            className="label cursor-pointer gap-1 py-0"
            title="Continue if this action fails"
          >
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
            className="btn btn-ghost btn-xs btn-square text-error ml-auto"
            aria-label={`Remove action ${index + 1}`}
            onClick={onRemove}
          >
            <Trash />
          </button>
        </div>

        {/* Collapsible form (S5 / D8 / D9) */}
        <details
          data-testid="action-form"
          // uncontrolled (D9): native browser state is source of truth.
          // We seed the initial state from `isNew`; React won't fight the
          // user after mount because isNew is static per job-load.
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

// ===========================================================================
// ActionStatusBadge — v0.7.0 (S4)
// ===========================================================================

function ActionStatusBadge({ status }: { status: ActionStatus }) {
  const colorClass = {
    success: "text-success bg-success/10",
    error: "text-error bg-error/10",
    info: "text-info bg-info/10",
    neutral: "text-base-content/40 bg-base-content/5",
  }[status.tone];

  const Icon = {
    check: CheckCircledIcon,
    cross: CrossCircledIcon,
    reload: ReloadIcon,
    minus: MinusIcon,
  }[status.iconName];

  return (
    <span
      data-testid="status-badge"
      data-status={status.tone}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${colorClass}`}
      title={status.label}
    >
      <Icon className="w-3.5 h-3.5" aria-hidden="true" />
      <span>{status.label}</span>
    </span>
  );
}

// ===========================================================================
// (Existing v0.6.0 form sub-components — unchanged)
// ===========================================================================

/* ─── WebhookFields ───────────────────────────────────────────────────── */

function WebhookFields({
  config,
  onChange,
  jobId,
  isFirstAction,
  saving,
}: {
  config: WebhookConfig;
  onChange: (cfg: WebhookConfig) => void;
  // v0.6.0 — props for the "Copy as curl" button. Hidden when no jobId
  // (new job not yet saved) or when this card is not the first action
  // (only the first webhook action of a saved job has a curl export).
  jobId?: string;
  isFirstAction: boolean;
  saving: boolean;
}) {
  const [header, setHeader] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [curlInput, setCurlInput] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [copyOk, setCopyOk] = useState(false);
  const [copyErr, setCopyErr] = useState<string | null>(null);

  // v0.6.0 — fetch the saved curl/shell from the server and put it on the
  // clipboard. Honours R3 (no button when there's nothing to copy) and R7
  // (try/catch around navigator.clipboard.writeText).
  async function copyAsCurl() {
    if (!jobId) return;
    setCopyErr(null);
    try {
      const r = await api.jobs.curl(jobId);
      const text = r.curl ?? r.shell ?? "";
      if (!text) {
        setCopyErr("Server returned an empty export.");
        return;
      }
      await navigator.clipboard.writeText(text);
      setCopyOk(true);
      setTimeout(() => setCopyOk(false), 1500);
    } catch (err: any) {
      setCopyErr(`Clipboard blocked: ${err.message ?? err}`);
    }
  }

  function applyCurl() {
    const parsed = parseCurl(curlInput);
    if (!parsed) {
      setImportError("Could not parse — make sure the command has a URL.");
      return;
    }
    onChange({
      ...config,
      method: parsed.method as WebhookConfig["method"],
      url: parsed.url,
      headers: parsed.headers,
      body: parsed.body,
    });
    setImportError(null);
    setImportOpen(false);
    setCurlInput("");
  }

  function loadExample() {
    setCurlInput(`curl -X POST \\
      "https://<your-langflow-host.example>/api/v1/webhook/<your-webhook-id>" \\
      -H 'Content-Type: application/json' \\
      -H 'x-api-key: <your api key>' \\
      -d '{"any": "data"}'`);
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      <label className="form-control">
        <div className="label py-1"><span className="label-text text-xs uppercase text-base-content/50">Method</span></div>
        <select
          className="select select-bordered select-sm bg-base-100/60"
          value={config.method}
          onChange={(e) => onChange({ ...config, method: e.target.value as WebhookConfig["method"] })}
        >
          {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </label>
      <label className="form-control md:col-span-2">
        <div className="label py-1">
          <span className="label-text text-xs uppercase text-base-content/50">URL</span>
          <button
            type="button"
            className="btn btn-xs btn-ghost ml-auto"
            onClick={() => setImportOpen(true)}
            title="Paste a curl command to fill this webhook"
          >
            + Import from curl
          </button>
          {jobId && isFirstAction ? (
            <button
              type="button"
              className="btn btn-xs btn-ghost"
              onClick={copyAsCurl}
              disabled={saving}
              title="Copy a curl that reproduces this webhook"
            >
              {copyOk ? "Copied ✓" : "Copy as curl"}
            </button>
          ) : null}
          {copyErr ? (
            <span className="text-xs text-error ml-2">{copyErr}</span>
          ) : null}
        </div>
        <input
          type="text"
          className="input input-sm input-bordered bg-base-100/60 font-mono"
          value={config.url}
          onChange={(e) => onChange({ ...config, url: e.target.value })}
          placeholder="https://example.com/webhook"
        />
      </label>
      <div className="form-control md:col-span-3">
        <label className="label cursor-pointer justify-start gap-2 py-1">
          <input
            type="checkbox"
            className="checkbox checkbox-xs"
            checked={!!config.allowPrivateNetworks}
            onChange={(e) => onChange({ ...config, allowPrivateNetworks: e.target.checked })}
          />
          <span className="label-text text-xs">
            Allow private networks
            <span className="ml-1 text-base-content/50">(SSRF guard bypass; only for trusted internal targets)</span>
          </span>
        </label>
        {config.allowPrivateNetworks ? (
          <p className="text-xs text-warning mt-1">
            ⚠ SSRF protection disabled for this webhook. Use only for trusted internal targets (e.g. chaining back to your own API on 127.0.0.1).
          </p>
        ) : null}
      </div>
      <label className="form-control md:col-span-3">
        <div className="label py-1"><span className="label-text text-xs uppercase text-base-content/50">Body</span></div>
        <textarea
          rows={3}
          className="textarea textarea-bordered text-sm font-mono bg-base-100/60"
          value={config.body ?? ""}
          onChange={(e) => onChange({ ...config, body: e.target.value })}
          placeholder='{"event":"heartbeat"}'
        />
      </label>
      <label className="form-control md:col-span-3">
        <div className="label py-1"><span className="label-text text-xs uppercase text-base-content/50">Headers</span></div>
        <div className="flex gap-2 flex-wrap">
          {Object.entries(config.headers ?? {}).map(([k, v]) => (
            <span key={k} className="badge badge-ghost gap-1">
              <span className="font-mono">{k}: {v}</span>
              <button
                type="button"
                className="ml-1"
                onClick={() => {
                  const next = { ...(config.headers ?? {}) };
                  delete next[k];
                  onChange({ ...config, headers: next });
                }}
              >
                ✕
              </button>
            </span>
          ))}
          <input
            type="text"
            className="input input-sm input-bordered flex-1 min-w-[200px] bg-base-100/60"
            placeholder="Header-Name=header value"
            value={header}
            onChange={(e) => setHeader(e.target.value)}
          />
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => {
              if (!header.includes("=")) return;
              const idx = header.indexOf("=");
              const k = header.slice(0, idx).trim();
              const v = header.slice(idx + 1);
              if (!k) return;
              onChange({ ...config, headers: { ...(config.headers ?? {}), [k]: v } });
              setHeader("");
            }}
          >
            <Plus /> Add
          </button>
        </div>
      </label>

      {/* Import-from-curl modal */}
      <dialog open={importOpen} className="modal modal-bottom sm:modal-middle">
        <div className="modal-box max-w-2xl bg-base-200 border border-base-300/60">
          <h3 className="text-lg font-semibold">Import from curl</h3>
          <p className="text-xs text-base-content/50 mt-1">
            Paste a <code className="font-mono">curl</code> command. We extract method, URL, headers, and body.
          </p>
          <textarea
            className="textarea textarea-bordered w-full font-mono text-sm bg-base-100/60 mt-3"
            rows={9}
            value={curlInput}
            onChange={(e) => { setCurlInput(e.target.value); setImportError(null); }}
            placeholder={`curl -X POST "https://example.com/webhook" \\
      -H 'Content-Type: application/json' \\
      -d '{"event":"heartbeat"}'`}
          />
          {importError ? (
            <div role="alert" className="alert alert-error mt-3">
              <span className="text-sm">{importError}</span>
            </div>
          ) : null}
          <div className="modal-action">
            <button type="button" className="btn btn-ghost btn-sm" onClick={loadExample}>
              Load example
            </button>
            <div className="flex-1" />
            <button type="button" className="btn btn-ghost" onClick={() => { setImportOpen(false); setImportError(null); setCurlInput(""); }}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={applyCurl} disabled={!curlInput.trim()}>
              Apply
            </button>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button>close</button>
        </form>
      </dialog>
    </div>
  );
}

function ShellFields({ config, onChange }: { config: ShellConfig; onChange: (cfg: ShellConfig) => void }) {
  return (
    <div className="space-y-3">
      <label className="form-control">
        <div className="label py-1"><span className="label-text text-xs uppercase text-base-content/50">Command</span></div>
        <textarea
          rows={3}
          className="textarea textarea-bordered text-sm font-mono bg-base-100/60"
          value={config.command}
          onChange={(e) => onChange({ ...config, command: e.target.value })}
          placeholder='curl -X POST https://example.com/api -d "{}"'
        />
      </label>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="form-control">
          <div className="label py-1"><span className="label-text text-xs uppercase text-base-content/50">Working directory</span></div>
          <input
            type="text"
            className="input input-sm input-bordered bg-base-100/60 font-mono"
            value={config.cwd ?? ""}
            onChange={(e) => onChange({ ...config, cwd: e.target.value })}
          />
        </label>
        <label className="form-control">
          <div className="label py-1"><span className="label-text text-xs uppercase text-base-content/50">Timeout (ms)</span></div>
          <input
            type="number"
            className="input input-sm input-bordered bg-base-100/60 font-mono"
            value={config.timeoutMs ?? ""}
            onChange={(e) => onChange({ ...config, timeoutMs: parseInt(e.target.value, 10) || undefined })}
          />
        </label>
      </div>
      <div role="alert" className="alert alert-warning">
        <span className="text-sm">Shell actions run with your user permissions. Be careful with arbitrary input.</span>
      </div>
    </div>
  );
}

// Re-exported for typecheck; the formatRelative helper is used by callers
// that may import it from this module (kept for forward-compat).
export { formatRelative };