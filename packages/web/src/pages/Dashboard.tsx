import { useEffect, useState } from "react";
import {
  ArrowTopRightIcon,
  CalendarIcon,
  CheckCircledIcon,
  CircleBackslashIcon,
  ClockIcon,
  CrossCircledIcon,
  LightningBoltIcon,
} from "@radix-ui/react-icons";
import { api } from "../lib/api";
import type { Job, OverallStats, Run } from "../types";
import { TimeseriesChart } from "../components/TimeseriesChart";

interface Props {
  onNavigate: (v: any) => void;
}

function browserTz(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Etc/UTC";
  } catch {
    return "Etc/UTC";
  }
}

function StatCard({
  label,
  value,
  delta,
  deltaTone = "up",
  sparkline,
  icon,
  valueIsNull,
  nullHint,
}: {
  label: string;
  value: React.ReactNode;
  delta?: string;
  deltaTone?: "up" | "down";
  sparkline?: React.ReactNode;
  icon?: React.ReactNode;
  /** When true, the value should render as an em-dash with a tooltip. */
  valueIsNull?: boolean;
  nullHint?: string;
}) {
  return (
    <div className="card bg-base-200/60 border border-base-300/60 shadow-sm">
      <div className="card-body p-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs uppercase tracking-wide text-base-content/50 font-medium">
              {label}
            </div>
            <div
              className={`text-2xl font-bold mt-1.5 text-base-content ${
                valueIsNull ? "italic text-base-content/40" : ""
              }`}
              title={valueIsNull ? nullHint : undefined}
            >
              {valueIsNull ? "—" : value}
            </div>
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
          {sparkline ? <div className="opacity-90">{sparkline}</div> : null}
        </div>
      </div>
    </div>
  );
}

export default function Dashboard({ onNavigate }: Props) {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [stats, setStats] = useState<OverallStats | null>(null);
  const [recentRuns, setRecentRuns] = useState<Run[] | null>(null);

  useEffect(() => {
    const tz = browserTz();
    let cancelled = false;
    const load = () => {
      Promise.all([
        api.jobs.list(),
        api.stats.overall(tz),
        api.runs.list({ limit: 8 }),
      ]).then(([j, s, r]) => {
        if (cancelled) return;
        setJobs(j);
        setStats(s);
        setRecentRuns(r);
      });
    };
    load();
    const i = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(i);
    };
  }, []);

  const upcoming = (jobs ?? [])
    .filter((j) => j.enabled && j.nextRunAt)
    .sort((a, b) => (a.nextRunAt! < b.nextRunAt! ? -1 : 1))
    .slice(0, 5);

  const recentFailures = (recentRuns ?? []).filter((r) => r.status === "failed").slice(0, 5);

  const successRateNull = stats !== null && stats.successRate24h === null;
  const p95Null = stats !== null && stats.durationP95 === null;

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

      {/* KPI row — 5 cards including the new P95 LATENCY */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <StatCard
          label="Active jobs"
          value={jobs === null ? "…" : (jobs.filter((j) => j.enabled).length)}
          delta={jobs === null ? undefined : `${jobs.length} total`}
          icon={<LightningBoltIcon />}
        />
        <StatCard
          label="Runs (24h)"
          value={stats === null ? "…" : stats.runs24h}
          delta={stats && stats.runs24h > 0 ? `+${stats.runs24h} today` : "—"}
          sparkline={stats ? <TimeseriesChart values={stats.runsByHour} width={120} height={32} /> : undefined}
          icon={<ClockIcon />}
        />
        <StatCard
          label="Failures (24h)"
          value={stats === null ? "…" : stats.failures24h}
          delta={stats && stats.failures24h > 0 ? "needs attention" : "all green"}
          deltaTone={stats && stats.failures24h > 0 ? "down" : "up"}
          icon={<CrossCircledIcon />}
        />
        <StatCard
          label="Success rate (24h)"
          value={stats === null ? "…" : `${stats.successRate24h}%`}
          delta={stats && stats.successRate24h === 100 ? "perfect" : "live"}
          valueIsNull={successRateNull}
          nullHint="No runs in the last 24h"
          icon={<CheckCircledIcon />}
        />
        <StatCard
          label="P95 latency (24h)"
          value={stats === null ? "…" : `${stats.durationP95} ms`}
          delta={stats && stats.durationP95 != null ? "live" : "—"}
          valueIsNull={p95Null}
          nullHint="No completed runs in the last 24h"
          icon={<ClockIcon />}
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
              {recentRuns === null || recentRuns.length === 0 ? (
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
