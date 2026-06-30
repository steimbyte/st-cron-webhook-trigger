# Restart cronboard for v0.3.0 verification
$root = "C:\Users\benjamin.steimer\workspace\cronboard"
$dataDir = "$root\.daisy-data"

# Kill anything on :3737
Get-NetTCPConnection -LocalPort 3737 -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object { Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue | Stop-Process -Force }
Start-Sleep -Milliseconds 400

# Start with new build
$env:CRONBOARD_DATA_DIR = $dataDir
$daemon = Start-Process -FilePath "node.exe" `
    -ArgumentList "--import","tsx/esm","packages/core/src/cli.ts","start","--no-detach","--port","3737","--host","127.0.0.1" `
    -WorkingDirectory $root `
    -RedirectStandardOutput (Join-Path $root "daemon.out.log") `
    -RedirectStandardError (Join-Path $root "daemon.err.log") `
    -PassThru
Remove-Item Env:CRONBOARD_DATA_DIR -ErrorAction SilentlyContinue

# Wait for health
$ready = $false
for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Milliseconds 500
    try {
        $r = Invoke-WebRequest -Uri "http://127.0.0.1:3737/api/health" -UseBasicParsing -TimeoutSec 2
        if ($r.StatusCode -eq 200) { $ready = $true; break }
    } catch { }
}
if (-not $ready) {
    Stop-Process -Id $daemon.Id -Force
    Write-Host "FAIL: server did not come up"
    exit 3
}

$h = (Invoke-WebRequest -Uri "http://127.0.0.1:3737/api/health" -UseBasicParsing | ConvertFrom-Json)
Write-Host "READY  pid=$($daemon.Id)  version=$($h.version)  time=$($h.time)"

# Quick CRUD smoke
$body = '{"name":"v030-smoke","cronExpression":"*/5 * * * *","timezone":"UTC","enabled":true,"actions":[{"type":"webhook","position":0,"continueOnError":false,"config":{"method":"POST","url":"https://example.com/ping","timeoutMs":5000}}]}'
$c = Invoke-WebRequest -Uri "http://127.0.0.1:3737/api/jobs" -Method POST -ContentType 'application/json' -Body $body -UseBasicParsing
Write-Host "create: $($c.StatusCode) id=$(($c.Content | ConvertFrom-Json).id)"

Invoke-WebRequest -Uri "http://127.0.0.1:3737/api/jobs/$((($c.Content | ConvertFrom-Json).id))" -Method DELETE -UseBasicParsing | Out-Null
Write-Host "delete: ok"

$next = Invoke-WebRequest -Uri "http://127.0.0.1:3737/api/cron/next?expr=*/1+*+*+*+*&count=5" -UseBasicParsing | ConvertFrom-Json
Write-Host "next 5 runs for */1:"
foreach ($r in $next.runs) {
    Write-Host "  " (Get-Date -Date $r).ToString("yyyy-MM-dd HH:mm:ss")
}

# UI smoke
$ui = Invoke-WebRequest -Uri "http://127.0.0.1:3737/" -UseBasicParsing
Write-Host "ui: HTTP $($ui.StatusCode)"

Stop-Process -Id $daemon.Id -Force -ErrorAction SilentlyContinue
Write-Host "=== done ==="