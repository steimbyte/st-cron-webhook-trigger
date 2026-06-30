import { useEffect, useState } from "react";
import {
  CircleBackslashIcon as CircleBackslash,
  PlayIcon as Play,
  PlusIcon as Plus,
  TrashIcon as Trash,
} from "@radix-ui/react-icons";
import CronBuilder from "../components/CronBuilder";
import { api } from "../lib/api";
import { parseCurl } from "../lib/curlParser";
import type { Job, JobAction, WebhookConfig, ShellConfig } from "../types";

interface Props {
  jobId?: string;
  onDone: () => void;
}

const COMMON_TZ = [
  "UTC", "Europe/Berlin", "Europe/London", "Europe/Paris",
  "America/New_York", "America/Los_Angeles", "America/Chicago",
  "Asia/Tokyo", "Asia/Shanghai", "Asia/Kolkata", "Australia/Sydney",
];

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

  useEffect(() => {
    if (jobId) {
      api.jobs.get(jobId).then((j) => {
        hydrate(j);
        setLoading(false);
      }).catch((e) => setError(e.message));
    }
  }, [jobId]);

  function hydrate(j: Job) {
    setName(j.name);
    setDescription(j.description ?? "");
    setCronExpression(j.cronExpression);
    setTimezone(j.timezone);
    setEnabled(j.enabled);
    setActions(j.actions);
  }

  async function save() {
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
    setActions(actions.filter((_, i) => i !== idx).map((a, i) => ({ ...a, position: i })));
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
            <div className="text-center py-8 text-base-content/50">
              <CircleBackslash className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No actions yet. Add a webhook or shell command above.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {actions.map((a, i) => (
                <ActionCard
                  key={(a as any).id ?? i}
                  action={a}
                  index={i}
                  onChange={(patch) => updateAction(i, patch)}
                  onRemove={() => removeAction(i)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ActionCard({
  action,
  index,
  onChange,
  onRemove,
}: {
  action: JobAction;
  index: number;
  onChange: (patch: Partial<JobAction>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="card bg-base-100/60 border border-base-300/40">
      <div className="card-body p-4 space-y-3">
        <div className="flex items-center gap-3">
          <span className={`badge ${action.type === "webhook" ? "badge-primary" : "badge-secondary"}`}>
            {action.type === "webhook" ? "webhook" : "shell"} #{index + 1}
          </span>
          <label className="label cursor-pointer gap-2 py-0">
            <span className="label-text text-xs text-base-content/60">continue on error</span>
            <input
              type="checkbox"
              className="toggle toggle-sm"
              checked={action.continueOnError}
              onChange={(e) => onChange({ continueOnError: e.target.checked })}
            />
          </label>
          <button
            type="button"
            className="btn btn-ghost btn-xs btn-square ml-auto text-error"
            onClick={onRemove}
          >
            <Trash />
          </button>
        </div>
        {action.type === "webhook" ? (
          <WebhookFields
            config={action.config as WebhookConfig}
            onChange={(cfg) => onChange({ config: cfg } as any)}
          />
        ) : (
          <ShellFields
            config={action.config as ShellConfig}
            onChange={(cfg) => onChange({ config: cfg } as any)}
          />
        )}
      </div>
    </div>
  );
}

/* ─── WebhookFields ───────────────────────────────────────────────────── */

function WebhookFields({
  config,
  onChange,
}: {
  config: WebhookConfig;
  onChange: (cfg: WebhookConfig) => void;
}) {
  const [header, setHeader] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [curlInput, setCurlInput] = useState("");
  const [importError, setImportError] = useState<string | null>(null);

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
        </div>
        <input
          type="text"
          className="input input-sm input-bordered bg-base-100/60 font-mono"
          value={config.url}
          onChange={(e) => onChange({ ...config, url: e.target.value })}
          placeholder="https://example.com/webhook"
        />
      </label>
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