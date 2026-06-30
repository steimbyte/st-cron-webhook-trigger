import { useEffect, useState } from "react";
import { CheckCircledIcon, ClockIcon, GearIcon, PersonIcon } from "@radix-ui/react-icons";
import { api } from "../lib/api";

export default function SettingsPage() {
  const [info, setInfo] = useState<any>(null);

  useEffect(() => {
    fetch("/api/health").then((r) => r.json()).then(setInfo);
  }, []);

  return (
    <div className="space-y-5 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-base-content/60">Server status and runtime information.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="stat-card bg-base-200/60 border border-base-300/60 rounded-box p-4">
          <div className="text-xs uppercase text-base-content/50">Server status</div>
          <div className="mt-2 flex items-center gap-2">
            {info?.status === "ok" ? (
              <CheckCircledIcon className="text-success" />
            ) : (
              <span className="loading loading-spinner loading-sm" />
            )}
            <span className="text-xl font-semibold capitalize">{info?.status ?? "…"}</span>
          </div>
        </div>
        <div className="stat-card bg-base-200/60 border border-base-300/60 rounded-box p-4">
          <div className="text-xs uppercase text-base-content/50">Version</div>
          <div className="mt-2 text-xl font-semibold font-mono">v{info?.version ?? "…"}</div>
        </div>
        <div className="stat-card bg-base-200/60 border border-base-300/60 rounded-box p-4">
          <div className="text-xs uppercase text-base-content/50">Server time</div>
          <div className="mt-2 text-sm font-mono">{info?.time ?? "…"}</div>
        </div>
      </div>

      <div className="card bg-base-200/60 border border-base-300/60">
        <div className="card-body p-5">
          <div className="flex items-center gap-2 mb-3">
            <GearIcon className="text-base-content/70" />
            <h2 className="text-lg font-semibold">How to start cronboard</h2>
          </div>
          <p className="text-sm text-base-content/70 mb-3">
            The daemon was started by running <code className="px-1.5 py-0.5 rounded bg-base-300/60 font-mono">npm start</code> in the repo root.
            Override host/port via flags:
          </p>
          <pre className="cb-code">{`npm start -- --port 8080 --host 0.0.0.0 --token YOUR_SECRET`}</pre>
          <p className="text-xs text-base-content/50 mt-3">
            Binding to non-localhost requires <code className="px-1 rounded bg-base-300/60">--token</code>.
          </p>
        </div>
      </div>

      <div className="card bg-base-200/60 border border-base-300/60">
        <div className="card-body p-5">
          <div className="flex items-center gap-2 mb-3">
            <ClockIcon className="text-base-content/70" />
            <h2 className="text-lg font-semibold">Storage</h2>
          </div>
          <p className="text-sm text-base-content/70 mb-3">
            Jobs and runs are persisted as JSON in your user config directory:
          </p>
          <pre className="cb-code">{`~/.config/cronboard/jobs.json
~/.config/cronboard/runs.json
~/.config/cronboard/cronboard.log
~/.config/cronboard/cronboard.pid`}</pre>
          <p className="text-xs text-base-content/50 mt-3">
            Override via env <code className="px-1 rounded bg-base-300/60">CRONBOARD_DATA_DIR</code>.
          </p>
        </div>
      </div>

      <div role="alert" className="alert">
        <PersonIcon />
        <div>
          <h3 className="font-semibold">Single-user mode</h3>
          <p className="text-xs text-base-content/60">
            Cronboard is local-first. There is no multi-user auth in v0.1.
          </p>
        </div>
      </div>
    </div>
  );
}