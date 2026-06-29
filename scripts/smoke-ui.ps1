# Quick API verification — runs server, hits endpoints, kills server.
$root = "C:\Users\benjamin.steimer\workspace\cronboard"
$dataDir = "$root\.smoke-quick"
$log = "$root\smoke-quick.log"
"" | Out-File -FilePath $log -Encoding utf8
"=== quick smoke $(Get-Date -Format o) ===" | Out-File -FilePath $log -Append -Encoding utf8

# Build first
Set-Location $root
$env:CRONBOARD_DATA_DIR = $dataDir
"build..." | Out-File -FilePath $log -Append -Encoding utf8
npm run build 2>&1 | Out-File -FilePath $log -Append -Encoding utf8
if ($LASTEXITCODE -ne 0) { "FAIL: build"; exit 2 }

# Start
"start server..." | Out-File -FilePath $log -Append -Encoding utf8
$daemon = Start-Process -FilePath "node.exe" `
    -ArgumentList "--import","tsx/esm","packages/core/src/cli.ts","start","--no-detach","--port","3738","--host","127.0.0.1" `
    -WorkingDirectory $root `
    -RedirectStandardOutput (Join-Path $root "daemon-smoke.out.log") `
    -RedirectStandardError (Join-Path $root "daemon-smoke.err.log") `
    -PassThru

# Wait for health
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Milliseconds 500
    try {
        $r = Invoke-WebRequest -Uri "http://127.0.0.1:3738/api/health" -UseBasicParsing -TimeoutSec 2
        if ($r.StatusCode -eq 200) { $ready = $true; break }
    } catch { }
}
if (-not $ready) {
    "FAIL: not ready"
    Stop-Process -Id $daemon.Id -Force
    exit 3
}
"server ready" | Out-File -FilePath $log -Append -Encoding utf8

# Hit endpoints
try {
    $h = Invoke-WebRequest -Uri "http://127.0.0.1:3738/api/health" -UseBasicParsing | ConvertFrom-Json
    "health: $($h.status) v$($h.version)" | Out-File -FilePath $log -Append -Encoding utf8

    $body = @{
        name = "smoke-quick"
        cronExpression = "0 9 * * 1-5"
        timezone = "Europe/Berlin"
        enabled = $true
        actions = @(@{ type = "webhook"; position = 0; continueOnError = $false;
            config = @{ method = "POST"; url = "https://httpbin.org/post"; timeoutMs = 5000 }})
    } | ConvertTo-Json -Depth 8
    $created = Invoke-WebRequest -Uri "http://127.0.0.1:3738/api/jobs" -Method POST -ContentType 'application/json' -Body $body -UseBasicParsing | ConvertFrom-Json
    "created: $($created.id) cron=$($created.cronExpression)" | Out-File -FilePath $log -Append -Encoding utf8

    # Parse round-trip via /api/cron/next
    $next = Invoke-WebRequest -Uri "http://127.0.0.1:3738/api/cron/next?expr=0+9+*+*+1-5&tz=Europe/Berlin&count=3" -UseBasicParsing | ConvertFrom-Json
    "next 3 runs:" | Out-File -FilePath $log -Append -Encoding utf8
    foreach ($r in $next.runs) {
        "  " + (Get-Date -Date $r).ToString("ddd yyyy-MM-dd HH:mm zzz") | Out-File -FilePath $log -Append -Encoding utf8
    }

    # Static UI served
    $ui = Invoke-WebRequest -Uri "http://127.0.0.1:3738/" -UseBasicParsing
    "ui: HTTP $($ui.StatusCode), content-type=$($ui.Headers.'Content-Type')" | Out-File -FilePath $log -Append -Encoding utf8

    # Cleanup
    Invoke-WebRequest -Uri "http://127.0.0.1:3738/api/jobs/$($created.id)" -Method DELETE -UseBasicParsing | Out-Null
    "deleted" | Out-File -FilePath $log -Append -Encoding utf8
}
finally {
    Stop-Process -Id $daemon.Id -Force -ErrorAction SilentlyContinue
}
Remove-Item Env:CRONBOARD_DATA_DIR -ErrorAction SilentlyContinue
"=== done ===" | Out-File -FilePath $log -Append -Encoding utf8
exit 0