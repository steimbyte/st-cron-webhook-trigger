# HTTP API Reference

All endpoints return JSON. When bound to non-localhost (`--host 0.0.0.0`), every `/api/*` call requires `Authorization: Bearer <token>`. The default `127.0.0.1` bind needs no auth.

The static SPA bundle is served at `/` (every non-`/api/*` path falls back to `index.html`).

---

## Health

### `GET /api/health`
```json
{ "status": "ok", "version": "0.6.0", "time": "2026-07-01T07:41:45.068Z" }
```

---

## Jobs

### `GET /api/jobs`
List all jobs. **Secrets are redacted** in this view (`x-api-key`, `authorization`, `cookie`, `set-cookie`, etc. are masked to `***`).
```json
{
  "jobs": [
    {
      "id": "5812c0c0-82c5-4029-b734-f4a04e5e7625",
      "name": "langflow-demo (every minute)",
      "description": "Demo: triggers the Langflow webhook from LANGFLOW_DEMO_URL every minute.",
      "cronExpression": "*/1 * * * *",
      "timezone": "Europe/Berlin",
      "enabled": true,
      "createdAt": "2026-06-30T11:15:00.000Z",
      "updatedAt": "2026-06-30T11:15:00.000Z",
      "nextRunAt": "2026-07-01T10:00:00.000Z",
      "actions": [
        {
          "id": "1f4e...",
          "jobId": "5812c0c0-...",
          "type": "webhook",
          "position": 0,
          "continueOnError": false,
          "config": {
            "method": "POST",
            "url": "https://langflow.steimercloud.xyz/api/v1/webhook/64071921-b716-4b4e-835d-cdf74279902d",
            "headers": { "Content-Type": "application/json", "x-api-key": "***" },
            "body": "{\"any\":\"data\"}",
            "timeoutMs": 30000
          }
        }
      ]
    }
  ]
}
```

### `POST /api/jobs`
Create a job. Body shape:
```json
{
  "name": "heartbeat",
  "description": "optional",
  "cronExpression": "*/5 * * * *",
  "timezone": "Europe/Berlin",
  "enabled": true,
  "actions": [
    { "type": "webhook", "position": 0, "continueOnError": false, "config": { "method": "POST", "url": "https://example.com/ping", "headers": { "Content-Type": "application/json" }, "body": "{\"event\":\"heartbeat\"}", "timeoutMs": 30000 } }
  ]
}
```
Returns `201 Created` with the full job. Returns `400` with `{ error: "..." }` on validation failure.

### `GET /api/jobs/:id`
Fetch one job. **Secrets are NOT redacted in this view** (single-item trust model: the editor needs to show what was actually saved).
```json
{
  "id": "5812c0c0-...",
  "name": "langflow-demo (every minute)",
  "cronExpression": "*/1 * * * *",
  "actions": [
    {
      "type": "webhook",
      "config": {
        "url": "https://langflow.steimercloud.xyz/api/v1/webhook/64071921-...",
        "headers": { "Content-Type": "application/json", "x-api-key": "sk-KjKZJ2ZOh7lc9adnXgRDiaY_PWSaIEmWKAI05rtuOT4" },
        "body": "{\"any\":\"data\"}"
      }
    }
  ]
}
```
Returns `404` if the job doesn't exist.

### `PATCH /api/jobs/:id`
Partial update. Body shape is the same as POST (all fields optional).
Returns `200 OK` with the full job, or `400` / `404`.

### `DELETE /api/jobs/:id`
Delete. Run history is preserved. Returns `200 { "ok": true }`.

### `POST /api/jobs/:id/toggle`
Flip the `enabled` flag. Returns the full job.

### `POST /api/jobs/:id/run`
Manually trigger a run. The scheduler still owns scheduled runs; this is an extra fire-and-forget execution. Returns `{ "ok": true }` on success, `404` if the job doesn't exist.

### `GET /api/jobs/:id/runs`
List runs for one job. Same response shape as `GET /api/runs` but filtered.

### `GET /api/jobs/:id/curl`
**v0.6.0+.** Returns the equivalent `curl` command (or `shell` snippet) for the job's first action.
```json
{
  "curl": "curl -X POST 'https://langflow.steimercloud.xyz/api/v1/webhook/64071921-b716-4b4e-835d-cdf74279902d' -H 'Content-Type: application/json' -H 'x-api-key: sk-KjKZJ2ZOh7lc9adnXgRDiaY_PWSaIEmWKAI05rtuOT4' -d '{\"any\":\"data\"}'"
}
```
For shell actions:
```json
{ "shell": "echo \"hello at $(date)\"" }
```
The `curl` is single-line and uses POSIX shell single-quote escaping (`'\''` to embed a single quote). Returns `400` on missing required fields.

### `GET /api/jobs/:id/stats?limit=20`
**v0.4.0+.** Per-job statistics + last N runs.
```json
{
  "jobId": "5812c0c0-...",
  "successRate": 100,
  "p50": 152,
  "p95": 178,
  "p99": 198,
  "last20": [ /* Run, most-recent first */ ]
}
```
- `successRate` is `null` if there are no runs in the last 1000 (never lies `100%`).
- `p50` / `p95` / `p99` are the run-duration percentiles in milliseconds. `null` if no runs have a `durationMs`.
- `last20` are the most-recent N runs (default 20, max 100), including the full `actionRuns[].request` / `response` for diagnosis.

---

## Runs

### `GET /api/runs?jobId=...&limit=...`
List recent runs across all jobs (or filtered to one job). Default `limit` is 100, max 1000.
```json
{
  "runs": [
    {
      "id": "...",
      "jobId": "5812c0c0-...",
      "jobName": "langflow-demo (every minute)",
      "trigger": "schedule",                  // or "manual"
      "startedAt": "2026-07-01T07:00:00.000Z",
      "finishedAt": "2026-07-01T07:00:00.162Z",
      "status": "success",                     // running | success | partial | failed | timeout
      "durationMs": 162,
      "actionRuns": [
        {
          "id": "...",
          "runId": "...",
          "actionId": "...",
          "status": "success",
          "startedAt": "2026-07-01T07:00:00.000Z",
          "finishedAt": "2026-07-01T07:00:00.162Z",
          "durationMs": 162,
          "request": { "method": "POST", "url": "https://...", "body": "..." },
          "response": { "status": 202, "headers": { ... }, "body": "{\"message\":\"Task started...\"}" }
        }
      ]
    }
  ]
}
```
Runs are sorted by `startedAt` descending (most-recent first). Up to the last 1000 runs are stored on disk; older ones are dropped.

### `GET /api/runs/:id`
Fetch one run with full action details.

---

## Statistics (v0.4.0+)

### `GET /api/stats`
Overall statistics across all jobs.
```json
{
  "activeJobs": 1,
  "totalJobs": 1,
  "runs24h": 142,
  "failures24h": 0,
  "successRate24h": 100,                      // null if runs24h == 0
  "durationP50": 152,                         // ms, null if no durations
  "durationP95": 178,
  "durationP99": 198,
  "runsByHour": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]
}
```
- `runs24h` uses a sliding 24-hour window based on the user's configured timezone.
- `runsByHour` is a 24-bucket array, index 0 = 23 hours ago, index 23 = the current hour. Useful for the dashboard area chart.

---

## Cron utilities

### `GET /api/cron/describe?expr=...`
Human-readable description of a cron expression (powered by `cronstrue`).
```
?expr=0 9 * * 1-5&tz=Europe/Berlin
→ { "ok": true, "text": "At 09:00 AM, Monday through Friday" }
```
On parse error: `{ "ok": false, "error": "..." }`.

### `GET /api/cron/next?expr=...&tz=...&count=...`
Next N future runs.
```
?expr=*/1 * * * *&tz=UTC&count=5
→ { "ok": true, "runs": ["2026-07-01T08:00:00.000Z", "2026-07-01T08:01:00.000Z", ...] }
```

---

## Static UI

Any path not matching `/api/*` falls back to `index.html` (SPA routing). Served by `@fastify/static` from `packages/core/dist/web/`.

---

## Error responses

| Status | Body shape | When |
|---|---|---|
| `400` | `{ "error": "..." }` | validation failure (Zod parse, missing required field) |
| `404` | `{ "error": "not found" }` | unknown job / run id |
| `401` | `{ "error": "unauthorized" }` | missing or wrong bearer token (only when bound to non-loopback) |
| `500` | `{ "error": "..." }` | unexpected error; see `~/.config/cronboard/cronboard.log` for stack |

---

## Examples (curl)

```bash
# Create a webhook job (Linux/PowerShell)
curl -X POST http://127.0.0.1:3737/api/jobs \
  -H 'Content-Type: application/json' \
  -d '{"name":"heartbeat","cronExpression":"*/5 * * * *","timezone":"UTC","enabled":true,"actions":[{"type":"webhook","position":0,"continueOnError":false,"config":{"method":"POST","url":"https://example.com/ping","timeoutMs":5000}}]}'

# List jobs (redacted)
curl http://127.0.0.1:3737/api/jobs

# Get a job (unredacted) + copy the curl
JOB_ID=...
curl http://127.0.0.1:3737/api/jobs/$JOB_ID
curl http://127.0.0.1:3737/api/jobs/$JOB_ID/curl

# Trigger a manual run
curl -X POST http://127.0.0.1:3737/api/jobs/$JOB_ID/run

# With a bearer token (only when bound to 0.0.0.0)
curl -H 'Authorization: Bearer YOUR_TOKEN' http://YOUR_HOST:3737/api/jobs
```

---

## HTTP API changelog

- **v0.6.0** — `GET /api/jobs/:id/curl` added. `GET /api/jobs/:id` no longer redacts.
- **v0.5.0** — `stripJobSecrets` is now real (was a no-op). CORS tightened to `origin: false`. `undici` redirect-following disabled. Auth uses `crypto.timingSafeEqual`.
- **v0.4.0** — `GET /api/stats` and `GET /api/jobs/:id/stats` added.
- **v0.2.0** — failure-path in `actionRuns[].response` now includes `body` (8 KB cap).
- **v0.1.0** — initial release.
