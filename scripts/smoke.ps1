# Cronboard smoke test - starts dev backend, hits API, kills it.

$ErrorActionPreference = "Stop"
$root = "C:\Users\benjamin.steimer\workspace\cronboard"
$dataDir = Join-Path $root ".smoke"
$log = Join-Path $root "smoke.log"

# Clean up
Remove-Item -Recurse -Force -ErrorAction SilentlyContinue $dataDir
Remove-Item -ErrorAction SilentlyContinue $log

# Kill any leftover server processes from previous runs (avoid port conflict EADDRINUSE)
Get-NetTCPConnection -LocalPort 3738 -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object {
        Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue | Stop-Process -Force
    }
Start-Sleep -Milliseconds 300

"" | Out-File -FilePath $log -Encoding utf8
"=== smoke test $(Get-Date -Format o) ===" | Out-File -FilePath $log -Append -Encoding utf8
"data dir: $dataDir" | Out-File -FilePath $log -Append -Encoding utf8

# Set up: build frontend first so dist/web exists
Set-Location $root
"--- build web ---" | Out-File -FilePath $log -Append -Encoding utf8
npm run build 2>&1 | Out-File -FilePath $log -Append -Encoding utf8
if ($LASTEXITCODE -ne 0) { "FAIL: web build" | Out-File -FilePath $log -Append -Encoding utf8; exit 2 }
"--- copy web ---" | Out-File -FilePath $log -Append -Encoding utf8
node bin/copy-web.mjs 2>&1 | Out-File -FilePath $log -Append -Encoding utf8

# Start backend in background, listening on a non-default port
"--- start server ---" | Out-File -FilePath $log -Append -Encoding utf8
$proc = Start-Process -FilePath "node.exe" `
    -ArgumentList "--import","tsx/esm","packages/core/src/cli.ts","start","--no-detach","--data",$dataDir,"--port","3738","--host","127.0.0.1" `
    -WorkingDirectory $root `
    -RedirectStandardOutput (Join-Path $root "server.out.log") `
    -RedirectStandardError (Join-Path $root "server.err.log") `
    -PassThru

$serverPid = $proc.Id
"server pid: $serverPid" | Out-File -FilePath $log -Append -Encoding utf8

# Wait for server to be ready (poll /api/health)
$base = "http://127.0.0.1:3738"
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    try {
        $r = Invoke-WebRequest -Uri "$base/api/health" -UseBasicParsing -TimeoutSec 2
        if ($r.StatusCode -eq 200) { $ready = $true; break }
    } catch { }
}
if (-not $ready) {
    "FAIL: server did not come up" | Out-File -FilePath $log -Append -Encoding utf8
    Get-Content (Join-Path $root "server.err.log") -ErrorAction SilentlyContinue | Out-File -FilePath $log -Append -Encoding utf8
    Stop-Process -Id $serverPid -Force -ErrorAction SilentlyContinue
    exit 3
}
"server up" | Out-File -FilePath $log -Append -Encoding utf8

try {
    # Health
    $h = Invoke-WebRequest -Uri "$base/api/health" -UseBasicParsing | ConvertFrom-Json
    "health: $($h.status) v$($h.version)" | Out-File -FilePath $log -Append -Encoding utf8

    # Empty jobs list
    $jobs = Invoke-WebRequest -Uri "$base/api/jobs" -UseBasicParsing | ConvertFrom-Json
    "jobs (empty): $($jobs.jobs.Count)" | Out-File -FilePath $log -Append -Encoding utf8

    # Create a test webhook job (using local echo endpoint via httpbin or just doesn't matter)
    # To make this truly offline-safe, let's use a webhook to localhost:9999 (will fail but that exercises the path)
    $jobBody = @{
        name = "smoke-test"
        cronExpression = "* * * * *"
        timezone = "UTC"
        enabled = $true
        actions = @(
            @{
                type = "webhook"
                position = 0
                continueOnError = $false
                config = @{
                    method = "POST"
                    url = "http://127.0.0.1:9999/ping"
                    timeoutMs = 1000
                }
            }
        )
    } | ConvertTo-Json -Depth 8
    $created = Invoke-WebRequest -Uri "$base/api/jobs" -Method POST -ContentType "application/json" -Body $jobBody -UseBasicParsing | ConvertFrom-Json
    "created job: $($created.id)" | Out-File -FilePath $log -Append -Encoding utf8
    "actions: $($created.actions.Count)" | Out-File -FilePath $log -Append -Encoding utf8

    # Manually trigger
    $runRes = Invoke-WebRequest -Uri "$base/api/jobs/$($created.id)/run" -Method POST -ContentType 'application/json' -Body '{}' -UseBasicParsing
    "manual run: $($runRes.StatusCode)" | Out-File -FilePath $log -Append -Encoding utf8

    # Wait briefly and read runs
    Start-Sleep -Seconds 2
    $runs = Invoke-WebRequest -Uri "$base/api/runs" -UseBasicParsing | ConvertFrom-Json
    "runs total: $($runs.runs.Count)" | Out-File -FilePath $log -Append -Encoding utf8
    if ($runs.runs.Count -gt 0) {
        $first = $runs.runs[0]
        "first run: status=$($first.status) actions=$($first.actionRuns.Count) duration=$($first.durationMs)ms" | Out-File -FilePath $log -Append -Encoding utf8
        $ar = $first.actionRuns[0]
        "  action: status=$($ar.status) error=$($ar.error)" | Out-File -FilePath $log -Append -Encoding utf8
    }

    # Toggle off
    $toggled = Invoke-WebRequest -Uri "$base/api/jobs/$($created.id)/toggle" -Method POST -ContentType 'application/json' -Body '{}' -UseBasicParsing | ConvertFrom-Json
    "toggled enabled: $($toggled.enabled)" | Out-File -FilePath $log -Append -Encoding utf8

    # Delete
    $rm = Invoke-WebRequest -Uri "$base/api/jobs/$($created.id)" -Method DELETE -UseBasicParsing | ConvertFrom-Json
    "deleted: $($rm.ok)" | Out-File -FilePath $log -Append -Encoding utf8

    # Final jobs
    $final = Invoke-WebRequest -Uri "$base/api/jobs" -UseBasicParsing | ConvertFrom-Json
    "jobs (final): $($final.jobs.Count)" | Out-File -FilePath $log -Append -Encoding utf8

    # Static UI smoke (root should now serve index.html)
    try {
        $ui = Invoke-WebRequest -Uri "$base/" -UseBasicParsing
        "ui served: $($ui.StatusCode), content-type=$($ui.Headers.'Content-Type'), has root=$($ui.Content -match '<div id=.root.')" | Out-File -FilePath $log -Append -Encoding utf8
    } catch {
        "ui not served: $_" | Out-File -FilePath $log -Append -Encoding utf8
    }
}
finally {
    Stop-Process -Id $serverPid -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
}
"=== smoke test done ===" | Out-File -FilePath $log -Append -Encoding utf8
exit 0
