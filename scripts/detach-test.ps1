# Test npm start (which calls detach internally)
$root = "C:\Users\benjamin.steimer\workspace\cronboard"
$dataDir = "$root\.detach-test"
$log = "$root\detach-test.log"

"" | Out-File -FilePath $log -Encoding utf8
"=== detach test $(Get-Date -Format o) ===" | Out-File -FilePath $log -Append -Encoding utf8

# Kill leftover on :3739
Get-NetTCPConnection -LocalPort 3739 -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object { Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue | Stop-Process -Force }
Remove-Item -Recurse -Force -ErrorAction SilentlyContinue $dataDir
Start-Sleep -Milliseconds 300

# Build first
"--- build ---" | Out-File -FilePath $log -Append -Encoding utf8
Set-Location $root
npm run build 2>&1 | Out-File -FilePath $log -Append -Encoding utf8
if ($LASTEXITCODE -ne 0) { "FAIL: build" | Out-File -FilePath $log -Append -Encoding utf8; exit 2 }

# Start via npm start (with detached flag)
"--- npm start ---" | Out-File -FilePath $log -Append -Encoding utf8
$env:CRONBOARD_DATA_DIR = $dataDir
$startProc = Start-Process -FilePath "npm.cmd" -ArgumentList "start","--","--port","3739","--host","127.0.0.1" `
    -WorkingDirectory $root `
    -RedirectStandardOutput (Join-Path $root "detach-out.log") `
    -RedirectStandardError (Join-Path $root "detach-err.log") `
    -PassThru
Start-Sleep -Seconds 4

# Find the cronboard pid (npm starts node which starts cronboard)
$cbPid = (Get-CimInstance Win32_Process -Filter "Name='node.exe' AND CommandLine LIKE '%cronboard%cli.ts%'" | Select-Object -First 1 -ExpandProperty ProcessId)
"cronboard pid: $cbPid" | Out-File -FilePath $log -Append -Encoding utf8

# Hit health
try {
    $h = Invoke-WebRequest -Uri "http://127.0.0.1:3739/api/health" -UseBasicParsing -TimeoutSec 3 | ConvertFrom-Json
    "health: $($h.status) v$($h.version)" | Out-File -FilePath $log -Append -Encoding utf8
} catch {
    "health FAIL: $_" | Out-File -FilePath $log -Append -Encoding utf8
    Get-Content (Join-Path $root "detach-err.log") -ErrorAction SilentlyContinue | Out-File -FilePath $log -Append -Encoding utf8
}

# Stop via cli
"--- npm stop ---" | Out-File -FilePath $log -Append -Encoding utf8
Set-Location $root
$env:CRONBOARD_DATA_DIR = $dataDir
Set-Location packages/core
npx tsx src/cli.ts stop --data $dataDir 2>&1 | Out-File -FilePath $log -Append -Encoding utf8
Set-Location $root

# Verify gone
Start-Sleep -Seconds 1
$stillThere = Get-CimInstance Win32_Process -Filter "Name='node.exe' AND CommandLine LIKE '%cronboard%cli.ts%'" -ErrorAction SilentlyContinue
if ($stillThere) {
    "FAIL: still running (pid $($stillThere.ProcessId))" | Out-File -FilePath $log -Append -Encoding utf8
} else {
    "OK: stopped" | Out-File -FilePath $log -Append -Encoding utf8
}

Remove-Item Env:CRONBOARD_DATA_DIR -ErrorAction SilentlyContinue
"=== done ===" | Out-File -FilePath $log -Append -Encoding utf8
exit 0
