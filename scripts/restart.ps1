# Restart cronboard with the freshly-built UI.
$root = "C:\Users\benjamin.steimer\workspace\cronboard"
$dataDir = "$root\.demo-data"
$log = "$root\start.log"

"" | Out-File -FilePath $log -Encoding utf8
"=== restart $(Get-Date -Format o) ===" | Out-File -FilePath $log -Append -Encoding utf8

# Kill anything on :3737
Get-NetTCPConnection -LocalPort 3737 -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object { Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue | Stop-Process -Force }
Start-Sleep -Milliseconds 500

# Start daemon via Start-Process so this script can return
Set-Location $root
$env:CRONBOARD_DATA_DIR = $dataDir
$daemon = Start-Process -FilePath "node.exe" `
    -ArgumentList "--import","tsx/esm","packages/core/src/cli.ts","start","--no-detach","--port","3737","--host","127.0.0.1" `
    -WorkingDirectory $root `
    -RedirectStandardOutput (Join-Path $root "daemon.out.log") `
    -RedirectStandardError (Join-Path $root "daemon.err.log") `
    -PassThru

Remove-Item Env:CRONBOARD_DATA_DIR -ErrorAction SilentlyContinue
"daemon pid: $($daemon.Id)" | Out-File -FilePath $log -Append -Encoding utf8

# Wait for health
for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Milliseconds 500
    try {
        $r = Invoke-WebRequest -Uri "http://127.0.0.1:3737/api/health" -UseBasicParsing -TimeoutSec 2
        if ($r.StatusCode -eq 200) {
            $h = $r.Content | ConvertFrom-Json
            "ready: $($h.status) v$($h.version)" | Out-File -FilePath $log -Append -Encoding utf8
            Write-Host "READY  url=http://127.0.0.1:3737  pid=$($daemon.Id)" -ForegroundColor Green
            exit 0
        }
    } catch { }
}
"FAIL: timeout waiting for :3737" | Out-File -FilePath $log -Append -Encoding utf8
exit 3
