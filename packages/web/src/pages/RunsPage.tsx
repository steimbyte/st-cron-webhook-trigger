import { useEffect, useState } from "react";
import { ActivityLogIcon as ActivityLogIcon } from "@radix-ui/react-icons";
import { api } from "../lib/api";
import type { Run, RunStatus } from "../types";
import { RunBadge } from "./Dashboard";

const STATUSES: ("all" | RunStatus)[] = ["all", "success", "partial", "failed", "timeout", "running"];

export default function RunsPage() {
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [filter, setFilter] = useState<"all" | RunStatus>("all");
  const [openRun, setOpenRun] = useState<Run | null>(null);

  useEffect(() => {
    const refresh = () => api.runs.list({ limit: 200 }).then(setRuns);
    refresh();
    const i = setInterval(refresh, 2000);
    return () => clearInterval(i);
  }, []);

  const filtered = runs?.filter((r) => filter === "all" || r.status === filter);

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Run history</h1>
          <p className="text-sm text-base-content/60">Latest executions across all jobs.</p>
        </div>
      </div>

      <div className="card bg-base-200/60 border border-base-300/60">
        <div className="card-body p-4 flex flex-row items-center gap-3">
          <select
            className="select select-bordered select-sm bg-base-100/60"
            value={filter}
            onChange={(e) => setFilter(e.target.value as any)}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>Filter: {s}</option>
            ))}
          </select>
          <span className="text-xs text-base-content/50 ml-auto">
            {runs === null ? "loading…" : `${filtered?.length ?? 0} of ${runs.length}`}
          </span>
        </div>
      </div>

      <div className="card bg-base-200/60 border border-base-300/60 overflow-hidden">
        {runs === null ? (
          <div className="p-12 text-center text-base-content/50">
            <span className="loading loading-spinner loading-md" />
          </div>
        ) : (filtered ?? []).length === 0 ? (
          <div className="p-12 text-center">
            <ActivityLogIcon className="w-12 h-12 text-base-content/20 mx-auto mb-3" />
            <p className="text-base-content/50 mb-1">No runs yet.</p>
            <p className="text-xs text-base-content/40">Trigger a job manually or wait for its scheduled tick.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table table-sm">
              <thead>
                <tr className="text-xs uppercase text-base-content/50 bg-base-300/30">
                  <th>Status</th>
                  <th>Job</th>
                  <th>Trigger</th>
                  <th>Started</th>
                  <th className="text-right">Duration</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {(filtered ?? []).map((r) => (
                  <tr key={r.id} className="hover">
                    <td><RunBadge status={r.status} /></td>
                    <td className="font-medium">{r.jobName}</td>
                    <td><span className="badge badge-ghost badge-sm">{r.trigger}</span></td>
                    <td className="text-xs text-base-content/60">{new Date(r.startedAt).toLocaleString()}</td>
                    <td className="text-right text-xs font-mono">{r.durationMs ? `${r.durationMs}ms` : "—"}</td>
                    <td>
                      <button className="btn btn-ghost btn-xs" onClick={() => setOpenRun(r)}>Details</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <dialog open={!!openRun} className="modal">
        {openRun ? (
          <div className="modal-box max-w-3xl bg-base-200 border border-base-300/60">
            <h3 className="text-lg font-semibold">{openRun.jobName}</h3>
            <p className="text-sm text-base-content/60 mt-1">
              {openRun.trigger} · {new Date(openRun.startedAt).toLocaleString()} · {openRun.durationMs ?? "—"} ms
            </p>
            {openRun.error ? (
              <div role="alert" className="alert alert-error mt-3">
                <span className="text-sm">{openRun.error}</span>
              </div>
            ) : null}
            <div className="mt-4 space-y-3 max-h-[60vh] overflow-y-auto pr-1">
              {openRun.actionRuns.map((ar, i) => (
                <div key={ar.id} className="card bg-base-100/60 border border-base-300/40">
                  <div className="card-body p-4">
                    <div role="tablist" className="tabs tabs-bordered">
                      <a role="tab" className="tab tab-active text-xs">Request</a>
                      <a role="tab" className="tab text-xs">Response</a>
                      {ar.error ? <a role="tab" className="tab text-xs text-error">Error</a> : null}
                    </div>
                    <div className="mt-3">
                      <pre className="cb-code">{JSON.stringify(ar.request ?? {}, null, 2)}</pre>
                    </div>
                    <div className="mt-3 flex items-center gap-3 text-xs">
                      <span className={`badge badge-sm ${ar.status === "success" ? "badge-success" : "badge-error"}`}>
                        {ar.status}
                      </span>
                      <span className="text-base-content/60">action #{i + 1}</span>
                      <span className="text-base-content/40 ml-auto">{ar.durationMs ?? "—"} ms</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="modal-action">
              <button className="btn btn-ghost" onClick={() => setOpenRun(null)}>Close</button>
            </div>
          </div>
        ) : null}
      </dialog>
    </div>
  );
}