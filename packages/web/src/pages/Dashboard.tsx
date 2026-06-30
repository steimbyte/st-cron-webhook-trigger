import { useEffect, useState } from "react";
import {
  ArrowTopRightIcon,
  CalendarIcon,
  CheckCircledIcon,
  CircleBackslashIcon,
  ClockIcon,
  CrossCircledIcon,
  LightningBoltIcon,
  PlayIcon as PlayIcon,
} from "@radix-ui/react-icons";
import { api } from "../lib/api";
import type { Job, Run } from "../types";

interface Props {
  onNavigate: (v: any) => void;
}

function MiniSparkline({ values, color = "var(--color-primary)" }: { values: number[]; color?: string }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const w = 80, h = 24;
  const step = w / (values.length - 1);
  const points = values
    .map((v, i) => `${i * step},${h - ((v - min) / range) * h}`)
    .join(" ");
  return (
    <svg width={w} height={h} className="opacity-80">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}

function StatCard({
  label,
  value,
  delta,
  deltaTone = "up",
  sparkline,
  icon,
}: {
  label: string;
  value: string | number;
  delta?: string;
  deltaTone?: "up" | "down";
  sparkline?: number[];
  icon?: React.ReactNode;
}) {
  return (
    <div className="card bg-base-200/60 border border-base-300/60 shadow-sm">
      <div className="card-body p-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs uppercase tracking-wide text-base-content/50 font-medium">
              {label}
            </div>
            <div className="text-2xl font-bold mt-1.5 text-base-content">{value}</div>
          </div>
          {icon ? (
            <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              {icon}
            </div>
          ) : null}
        </div>
        <div className="flex items-center justify-between mt-2">
          {delta ? (
            <span className={`text-xs font-medium flex items-center gap-1 ${deltaTone === "up" ? "text-success" : "text-error"}`}>
              <ArrowTopRightIcon className={deltaTone === "down" ? "rotate-180" : ""} />
              {delta}
            </span>
          ) : (
            <span />
          )}
          {sparkline ? <MiniSparkline values={sparkline} color={deltaTone === "down" ? "var(--color-error)" : "var(--color-success)"} /> : null}
        </div>
      </div>
    </div>
  );
}

export default function Dashboard({ onNavigate }: Props) {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [runs, setRuns] = useState<Run[] | null>(null);

  useEffect(() => {
    Promise.all([api.jobs.list(), api.runs.list({ limit: 50 })]).then(([j, r]) => {
      setJobs(j);
      setRuns(r);
    });
  }, []);

  const active = jobs?.filter((j) => j.enabled).length ?? 0;
  const total = jobs?.length ?? 0;
  const last24h = runs?.filter((r) => Date.now() - new Date(r.startedAt).getTime() < 86400000).length ?? 0;
  const failed24h = runs?.filter(
    (r) => (r.status === "failed" || r.status === "partial") && Date.now() - new Date(r.startedAt).getTime() < 86400000,
  ).length ?? 0;
  const successRate =
    last24h > 0 ? Math.round((100 * (last24h - failed24h)) / last24h) : 100;

  // Build a per-hour success/failure histogram for the last 24h
  const histogram = Array.from({ length: 24 }, (_, h) => {
    const cutoff = Date.now() - (23 - h) * 3600000;
    const inHour = (runs ?? []).filter((r) => {
      const t = new Date(r.startedAt).getTime();
      return t >= cutoff && t < cutoff + 3600000;
    });
    return inHour.length;
  });

  const upcoming = (jobs ?? [])
    .filter((j) => j.enabled && j.nextRunAt)
    .sort((a, b) => (a.nextRunAt! < b.nextRunAt! ? -1 : 1))
    .slice(0, 5);

  const recentRuns = (runs ?? []).slice(0, 8);
  const recentFailures = (runs ?? []).filter((r) => r.status === "failed").slice(0, 5);

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex items-end justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-base-content/60">
            Real-time overview of all your scheduled jobs.
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-ghost btn-sm" onClick={() => onNavigate({ kind: "runs" })}>
            View runs
          </button>
          <button className="btn btn-primary btn-sm gap-1" onClick={() => onNavigate({ kind: "editor" })}>
            <LightningBoltIcon />
            New job
          </button>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label="Active jobs"
          value={jobs === null ? "…" : active}
          delta={jobs === null ? undefined : `${total} total`}
          icon={<LightningBoltIcon />}
        />
        <StatCard
          label="Runs (24h)"
          value={runs === null ? "…" : last24h}
          delta={last24h > 0 ? `+${last24h} today` : "—"}
          sparkline={histogram}
          icon={<ClockIcon />}
        />
        <StatCard
          label="Failures (24h)"
          value={runs === null ? "…" : failed24h}
          delta={failed24h > 0 ? "needs attention" : "all green"}
          deltaTone={failed24h > 0 ? "down" : "up"}
          icon={<CrossCircledIcon />}
        />
        <StatCard
          label="Success rate"
          value={`${successRate}%`}
          delta={successRate === 100 ? "perfect" : "stable"}
          sparkline={histogram}
          icon={<CheckCircledIcon />}
        />
      </div>

      {/* Two-column main */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* Left column: upcoming + recent */}
        <div className="xl:col-span-2 space-y-5">
          <div className="card bg-base-200/60 border border-base-300/60">
            <div className="card-body p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold">Upcoming runs</h2>
                <span className="badge badge-ghost text-xs">next 5</span>
              </div>
              {upcoming.length === 0 ? (
                <div className="text-center py-10">
                  <CircleBackslashIcon className="w-10 h-10 text-base-content/20 mx-auto mb-2" />
                  <p className="text-base-content/50 text-sm">No upcoming runs</p>
                  <button className="btn btn-primary btn-sm mt-3" onClick={() => onNavigate({ kind: "editor" })}>
                    Create a job
                  </button>
                </div>
              ) : (
                <ul className="divide-y divide-base-300/50">
                  {upcoming.map((j) => (
                    <li key={j.id} className="flex items-center gap-3 py-3">
                      <div className="w-9 h-9 rounded-lg bg-primary/15 text-primary flex items-center justify-center">
                        <ClockIcon />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{j.name}</div>
                        <div className="text-xs text-base-content/60 truncate">
                          <code className="font-mono">{j.cronExpression}</code> · {j.timezone}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium">
                          {j.nextRunAt && new Date(j.nextRunAt).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}
                        </div>
                        <div className="text-xs text-base-content/50">
                          {j.nextRunAt && new Date(j.nextRunAt).toLocaleString(undefined, { weekday: "short" })}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="card bg-base-200/60 border border-base-300/60">
            <div className="card-body p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold">Recent runs</h2>
                <button className="btn btn-ghost btn-xs" onClick={() => onNavigate({ kind: "runs" })}>
                  View all
                </button>
              </div>
              {recentRuns.length === 0 ? (
                <p className="text-base-content/50 text-sm py-6 text-center">No runs yet.</p>
              ) : (
                <div className="overflow-x-auto -mx-2">
                  <table className="table table-sm">
                    <thead>
                      <tr className="text-xs uppercase text-base-content/50">
                        <th>Status</th>
                        <th>Job</th>
                        <th>Trigger</th>
                        <th>Started</th>
                        <th className="text-right">Duration</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentRuns.map((r) => (
                        <tr key={r.id} className="hover">
                          <td>
                            <RunBadge status={r.status} />
                          </td>
                          <td className="font-medium">{r.jobName}</td>
                          <td>
                            <span className="badge badge-ghost badge-sm">{r.trigger}</span>
                          </td>
                          <td className="text-xs text-base-content/60">{new Date(r.startedAt).toLocaleString()}</td>
                          <td className="text-right text-xs font-mono">
                            {r.durationMs ? `${r.durationMs}ms` : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right column: failures feed + tips */}
        <div className="space-y-5">
          <div className="card bg-base-200/60 border border-base-300/60">
            <div className="card-body p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <CrossCircledIcon className="text-error" />
                  Failures
                </h2>
              </div>
              {recentFailures.length === 0 ? (
                <div className="text-center py-6">
                  <CheckCircledIcon className="w-10 h-10 text-success mx-auto mb-2" />
                  <p className="text-success font-medium text-sm">No failures — everything's green</p>
                </div>
              ) : (
                <ul className="space-y-2">
                  {recentFailures.map((r) => (
                    <li key={r.id} className="flex gap-3 items-start p-2 rounded-lg hover:bg-base-300/40 cursor-pointer"
                        onClick={() => onNavigate({ kind: "runs", jobId: r.jobId })}>
                      <div className="w-2 h-2 mt-2 rounded-full bg-error shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{r.jobName}</div>
                        <div className="text-xs text-base-content/60 truncate">{r.error || "see run details"}</div>
                      </div>
                      <div className="text-xs text-base-content/40 shrink-0">
                        {new Date(r.startedAt).toLocaleTimeString()}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="card bg-base-200/60 border border-base-300/60">
            <div className="card-body p-5">
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <CalendarIcon />
                Quick start
              </h2>
              <ul className="text-sm space-y-2 text-base-content/70">
                <li>
                  <code className="text-xs px-1.5 py-0.5 rounded bg-base-300/60 font-mono">npm run add heartbeat --cron '*/5 * * * *' --url https://example.com/ping</code>
                </li>
                <li>
                  <code className="text-xs px-1.5 py-0.5 rounded bg-base-300/60 font-mono">npm run add backup --cron '0 3 * * *' --command 'backup.sh'</code>
                </li>
                <li className="text-xs text-base-content/50 pt-1">Or click <strong>New job</strong> in the topbar.</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function RunBadge({ status }: { status: Run["status"] }) {
  const map: Record<Run["status"], { cls: string; label: string }> = {
    success: { cls: "badge-success", label: "ok" },
    failed: { cls: "badge-error", label: "failed" },
    partial: { cls: "badge-warning", label: "partial" },
    timeout: { cls: "badge-warning", label: "timeout" },
    running: { cls: "badge-info", label: "running" },
  };
  const { cls, label } = map[status];
  return <span className={`badge ${cls} badge-sm`}>{label}</span>;
}