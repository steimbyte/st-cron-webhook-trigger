# Start cronboard locally for user testing.
# Uses Start-Process (detached) so this script returns immediately
# while the daemon keeps running independently.

$root = "C:\Users\benjamin.steimer\workspace\cronboard"
$dataDir = "$root\.demo-data"
$log = "$root\start.log"

"" | Out-File -FilePath $log -Encoding utf8
"=== start for user test: $(Get-Date -Format o) ===" | Out-File -FilePath $log -Append -Encoding utf8

function Step($msg) { Write-Host $msg -ForegroundColor Cyan; $msg | Out-File -FilePath $log -Append -Encoding utf8 }

# 1. Cleanup
Step "1/5 Cleanup port 3737 + data dir"
Get-NetTCPConnection -LocalPort 3737 -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object { Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue | Stop-Process -Force }
Start-Sleep -Milliseconds 400
Remove-Item -Recurse -Force -ErrorAction SilentlyContinue $dataDir

# 2. Build
Step "2/5 Building web"
Set-Location $root
$env:CRONBOARD_DATA_DIR = $dataDir
$buildOut = npm run build 2>&1
$buildOut | Out-File -FilePath $log -Append -Encoding utf8
if ($LASTEXITCODE -ne 0) {
    "FAIL: build (exit $LASTEXITCODE)"
    exit 2
}

# 3. Seed demo jobs directly via the CLI (doesn't need daemon running yet)
Step "3/5 Seeding demo jobs"
Set-Location packages/core
npx tsx src/cli.ts add demo-webhook --cron '*/5 * * * *' --tz 'Europe/Berlin' `
    --url 'https://httpbin.org/anything' --method POST `
    --header 'X-Demo=cronboard' `
    --body '{"hello":"world","ts":"now"}' `
    --description 'Demo webhook POST to httpbin every 5 minutes' `
    --data $dataDir 2>&1 | Out-File -FilePath $log -Append -Encoding utf8

npx tsx src/cli.ts add demo-shell --cron '0 * * * *' --tz 'UTC' `
    --command 'echo "[demo-shell] hello at $(date -u)Z"' `
    --description 'Demo shell echo on every hour (UTC)' `
    --data $dataDir 2>&1 | Out-File -FilePath $log -Append -Encoding utf8
Set-Location $root

# 4. Start daemon (detached via Start-Process — returns immediately)
Step "4/5 Starting daemon detached on :3737"
$env:CRONBOARD_DATA_DIR = $dataDir
$daemonProc = Start-Process -FilePath "node.exe" `
    -ArgumentList "--import","tsx/esm","packages/core/src/cli.ts","start","--no-detach","--port","3737","--host","127.0.0.1" `
    -WorkingDirectory $root `
    -RedirectStandardOutput (Join-Path $root "daemon.out.log") `
    -RedirectStandardError (Join-Path $root "daemon.err.log") `
    -PassThru
Remove-Item Env:CRONBOARD_DATA_DIR -ErrorAction SilentlyContinue
"daemon pid: $($daemonProc.Id)" | Out-File -FilePath $log -Append -Encoding utf8

# 5. Wait for health
Step "5/5 Waiting for /api/health (up to 10s)"
$ready = $false
for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Milliseconds 500
    try {
        $r = Invoke-WebRequest -Uri "http://127.0.0.1:3737/api/health" -UseBasicParsing -TimeoutSec 2
        if ($r.StatusCode -eq 200) { $ready = $true; break }
    } catch { }
}
if (-not $ready) {
    "FAIL: server did not come up in 10s"
    Get-Content (Join-Path $root "daemon.err.log") -ErrorAction SilentlyContinue
    exit 3
}

# Report
$jobs = Invoke-WebRequest -Uri "http://127.0.0.1:3737/api/jobs" -UseBasicParsing | ConvertFrom-Json
"" | Out-File -FilePath $log -Append -Encoding utf8
"  -> server: http://127.0.0.1:3737  (pid $($daemonProc.Id))" | Out-File -FilePath $log -Append -Encoding utf8
"  -> data dir: $dataDir" | Out-File -FilePath $log -Append -Encoding utf8
"  -> $jobCount jobs loaded:" -f $jobs.jobs.Count | Out-File -FilePath $log -Append -Encoding utf8
foreach ($j in $jobs.jobs) {
    "       - $($j.name) | $($j.cronExpression) | $($j.timezone) | enabled=$($j.enabled) | actions=$($j.actions.Count)" |
        Out-File -FilePath $log -Append -Encoding utf8
}
"=== started OK ===" | Out-File -FilePath $log -Append -Encoding utf8
Write-Host ""
Write-Host "READY." -ForegroundColor Green
Write-Host "  URL:      http://127.0.0.1:3737" -ForegroundColor Green
Write-Host "  Daemon:   pid $($daemonProc.Id)" -ForegroundColor Green
Write-Host "  Data dir: $dataDir" -ForegroundColor Green
Write-Host "  Jobs:     $($jobs.jobs.Count) seeded" -ForegroundColor Green
exit 0
