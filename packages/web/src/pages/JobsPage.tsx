import { useEffect, useState } from "react";
import {
  CircleBackslashIcon,
  MagnifyingGlassIcon,
  Pencil1Icon as Pencil1Icon,
  PlayIcon as PlayIcon,
  PlusIcon as PlusIcon,
  TrashIcon as TrashIcon,
} from "@radix-ui/react-icons";
import { api } from "../lib/api";
import type { Job, JobStats, Run } from "../types";
import { RunBadge } from "./Dashboard";
import { StatusStrip } from "../components/StatusStrip";

interface Props {
  onEdit: (id: string) => void;
}

type StatsMap = Record<string, JobStats | undefined>;

export default function JobsPage({ onEdit }: Props) {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [statsById, setStatsById] = useState<StatsMap>({});
  const [query, setQuery] = useState("");
  const [filterEnabled, setFilterEnabled] = useState<"all" | "enabled" | "disabled">("all");
  const [confirmDelete, setConfirmDelete] = useState<Job | null>(null);

  const refresh = () => api.jobs.list().then(setJobs);
  useEffect(() => {
    refresh();
    const i = setInterval(refresh, 3000);
    return () => clearInterval(i);
  }, []);

  // Per-row stats: loaded in parallel after the job list arrives.
  // The endpoints are cheap (server-side aggregation over JSON storage) and
  // R7 (N+1) is bounded by the number of jobs the user has on this page.
  useEffect(() => {
    if (!jobs) return;
    let cancelled = false;
    Promise.all(jobs.map((j) => api.stats.job(j.id, 20).then(
      (s) => [j.id, s] as const,
    ).catch(() => [j.id, undefined] as const))).then((entries) => {
      if (cancelled) return;
      const next: StatsMap = {};
      for (const [id, s] of entries) next[id] = s;
      setStatsById(next);
    });
    return () => {
      cancelled = true;
    };
  }, [jobs]);

  const filtered = jobs?.filter((j) => {
    if (filterEnabled === "enabled" && !j.enabled) return false;
    if (filterEnabled === "disabled" && j.enabled) return false;
    if (query && !j.name.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Jobs</h1>
          <p className="text-sm text-base-content/60">All configured schedules.</p>
        </div>
        <button className="btn btn-primary btn-sm gap-1" onClick={() => onEdit("")}>
          <PlusIcon />
          New job
        </button>
      </div>

      <div className="card bg-base-200/60 border border-base-300/60">
        <div className="card-body p-4">
          <div className="flex flex-wrap gap-2 items-center">
            <label className="input input-sm w-72 bg-base-300/40 border-base-300/60 flex items-center gap-2">
              <MagnifyingGlassIcon />
              <input
                type="text"
                placeholder="Search jobs…"
                className="grow"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <div className="join">
              {(["all", "enabled", "disabled"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  className={`btn btn-sm join-item ${filterEnabled === v ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => setFilterEnabled(v)}
                >
                  {v}
                </button>
              ))}
            </div>
            <span className="text-xs text-base-content/50 ml-auto">
              {jobs === null ? "loading…" : `${filtered?.length ?? 0} of ${jobs.length}`}
            </span>
          </div>
        </div>
      </div>

      <div className="card bg-base-200/60 border border-base-300/60 overflow-hidden">
        {jobs === null ? (
          <div className="p-10 text-center text-base-content/50">
            <span className="loading loading-spinner loading-md" />
          </div>
        ) : (filtered ?? []).length === 0 ? (
          <div className="p-12 text-center">
            <CircleBackslashIcon className="w-12 h-12 text-base-content/20 mx-auto mb-3" />
            <p className="text-base-content/50 mb-3">No jobs yet.</p>
            <button className="btn btn-primary btn-sm" onClick={() => onEdit("")}>
              Create one
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table table-sm">
              <thead>
                <tr className="text-xs uppercase text-base-content/50 bg-base-300/30">
                  <th className="w-16">On</th>
                  <th>Name</th>
                  <th>Cron</th>
                  <th>TZ</th>
                  <th>Next</th>
                  <th>24h</th>
                  <th>p95</th>
                  <th>Runs</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(filtered ?? []).map((j) => {
                  const s = statsById[j.id];
                  return (
                    <tr key={j.id} className="hover">
                      <td>
                        <input
                          type="checkbox"
                          className="toggle toggle-primary toggle-sm"
                          checked={j.enabled}
                          onChange={async () => {
                            await api.jobs.toggle(j.id);
                            refresh();
                          }}
                        />
                      </td>
                      <td>
                        <div className="font-medium">{j.name}</div>
                        {j.description ? (
                          <div className="text-xs text-base-content/50">{j.description}</div>
                        ) : null}
                      </td>
                      <td>
                        <code className="text-xs px-1.5 py-0.5 rounded bg-base-300/60 font-mono">
                          {j.cronExpression}
                        </code>
                      </td>
                      <td className="text-xs text-base-content/60">{j.timezone}</td>
                      <td className="text-xs text-base-content/60">
                        {j.nextRunAt ? new Date(j.nextRunAt).toLocaleString() : "—"}
                      </td>
                      <td className="text-xs">
                        {s ? (
                          s.successRate == null ? (
                            <span className="italic text-base-content/40" title="No runs in last 24h">—</span>
                          ) : (
                            <span
                              className={
                                s.successRate >= 95 ? "text-success" :
                                s.successRate >= 80 ? "text-warning" : "text-error"
                              }
                            >
                              {s.successRate}%
                            </span>
                          )
                        ) : (
                          <span className="loading loading-spinner loading-xs" />
                        )}
                      </td>
                      <td className="text-xs">
                        {s ? (
                          s.p95 == null ? (
                            <span className="italic text-base-content/40">—</span>
                          ) : (
                            <span className="font-mono">{s.p95}ms p95</span>
                          )
                        ) : (
                          <span className="loading loading-spinner loading-xs" />
                        )}
                      </td>
                      <td>
                        <StatusStrip runs={(s?.last20 ?? []) as Run[]} cellSize={10} count={20} />
                      </td>
                      <td className="text-right">
                        <div className="join">
                          <button
                            type="button"
                            className="btn btn-ghost btn-xs join-item"
                            onClick={() => onEdit(j.id)}
                            title="Edit"
                          >
                            <Pencil1Icon />
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-xs join-item"
                            onClick={async () => {
                              await api.jobs.run(j.id);
                              refresh();
                            }}
                            title="Run now"
                          >
                            <PlayIcon />
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-xs join-item text-error"
                            onClick={() => setConfirmDelete(j)}
                            title="Delete"
                          >
                            <TrashIcon />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <dialog open={!!confirmDelete} className="modal">
        <div className="modal-box bg-base-200 border border-base-300/60">
          <h3 className="text-lg font-semibold">Delete "{confirmDelete?.name}"?</h3>
          <p className="py-3 text-sm text-base-content/70">
            This cannot be undone. Run history will be preserved.
          </p>
          <div className="modal-action">
            <button className="btn btn-ghost" onClick={() => setConfirmDelete(null)}>
              Cancel
            </button>
            <button
              className="btn btn-error"
              onClick={async () => {
                if (confirmDelete) {
                  await api.jobs.remove(confirmDelete.id);
                  setConfirmDelete(null);
                  refresh();
                }
              }}
            >
              Delete
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
