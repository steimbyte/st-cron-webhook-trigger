// Frontend API client. Uses fetch with same-origin.
import type { Job, OverallStats, JobStats, Run } from "../types";

const BASE = ""; // same origin (Vite dev proxies /api, prod served by core)

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`${method} ${path} -> ${res.status}: ${err}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  health: () => request<{ status: string; version: string; time: string }>("GET", "/api/health"),
  jobs: {
    list: () => request<{ jobs: Job[] }>("GET", "/api/jobs").then((d) => d.jobs),
    get: (id: string) => request<Job>("GET", `/api/jobs/${id}`),
    create: (input: Partial<Job>) => request<Job>("POST", "/api/jobs", input),
    update: (id: string, patch: Partial<Job>) => request<Job>("PATCH", `/api/jobs/${id}`, patch),
    remove: (id: string) => request<{ ok: true }>("DELETE", `/api/jobs/${id}`),
    toggle: (id: string) => request<Job>("POST", `/api/jobs/${id}/toggle`),
    run: (id: string) => request<{ ok: true }>("POST", `/api/jobs/${id}/run`),
  },
  runs: {
    list: (params?: { jobId?: string; limit?: number }) => {
      const q = new URLSearchParams();
      if (params?.jobId) q.set("jobId", params.jobId);
      if (params?.limit) q.set("limit", String(params.limit));
      const qs = q.toString();
      return request<{ runs: Run[] }>("GET", `/api/runs${qs ? `?${qs}` : ""}`).then((d) => d.runs);
    },
    get: (id: string) => request<Run>("GET", `/api/runs/${id}`),
  },
  cron: {
    describe: (expr: string, tz?: string) => {
      const q = new URLSearchParams({ expr });
      if (tz) q.set("tz", tz);
      return request<{ ok: boolean; text?: string; error?: string }>("GET", `/api/cron/describe?${q}`);
    },
    next: (expr: string, tz?: string, count = 5) => {
      const q = new URLSearchParams({ expr, count: String(count) });
      if (tz) q.set("tz", tz);
      return request<{ ok: boolean; runs?: string[]; error?: string }>("GET", `/api/cron/next?${q}`);
    },
  },
  stats: {
    // Server-side aggregations. tz defaults to "Etc/UTC" on the server
    // when omitted; the dashboard passes its browser-TZ explicitly.
    overall: (tz?: string) => {
      const q = tz ? `?${new URLSearchParams({ tz })}` : "";
      return request<OverallStats>("GET", `/api/stats${q}`);
    },
    job: (id: string, limit = 20) =>
      request<JobStats>("GET", `/api/jobs/${id}/stats?limit=${limit}`),
  },
};
