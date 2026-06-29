# Round-trip test of cron-related endpoints
$base = "http://127.0.0.1:3737"
$log  = "C:\Users\benjamin.steimer\workspace\cronboard\cron-test.log"

"" | Out-File -FilePath $log -Encoding utf8
"=== cron builder endpoint test $(Get-Date -Format o) ===" | Out-File -FilePath $log -Append -Encoding utf8

function Test-Endpoint($label, $path) {
    $r = Invoke-WebRequest -Uri "$base$path" -UseBasicParsing
    $j = $r.Content | ConvertFrom-Json
    Write-Host "[$label] HTTP $($r.StatusCode)"
    $j | ConvertTo-Json -Depth 4 | Write-Host
    "  [$label] HTTP $($r.StatusCode)" | Out-File -FilePath $log -Append -Encoding utf8
    $j | ConvertTo-Json -Depth 4 | Out-File -FilePath $log -Append -Encoding utf8
}

# 1. /api/cron/next for a few patterns
Write-Host "==== /api/cron/next ====" -ForegroundColor Cyan
Test-Endpoint "every-5-min"  "/api/cron/next?expr=*/5+*+*+*+*&count=5"
Test-Endpoint "daily-noon-utc" "/api/cron/next?expr=0+12+*+*+*&count=5"
Test-Endpoint "weekdays-9am-berlin" "/api/cron/next?expr=0+9+*+*+1-5&tz=Europe/Berlin&count=5"
Test-Endpoint "monthly-day-15-midnight" "/api/cron/next?expr=0+0+15+*+*&count=5"
Test-Endpoint "invalid-expr" "/api/cron/next?expr=invalid+cron&count=5"

# 2. /api/cron/describe
Write-Host "" -ForegroundColor Cyan
Write-Host "==== /api/cron/describe ====" -ForegroundColor Cyan
Test-Endpoint "describe-weekdays" "/api/cron/describe?expr=30+9+*+*+1-5"
Test-Endpoint "describe-monthly" "/api/cron/describe?expr=0+0+1+*+*"

# 3. Round-trip: create a job, fetch it back, edit, fetch again
Write-Host "" -ForegroundColor Cyan
Write-Host "==== job round-trip ====" -ForegroundColor Cyan

$body = @{
    name = "roundtrip-test"
    cronExpression = "0 12 * * 1-5"
    timezone = "Europe/Berlin"
    enabled = $false
    description = "round-trip test"
    actions = @(
        @{
            type = "webhook"
            position = 0
            continueOnError = $false
            config = @{
                method = "POST"
                url = "https://example.com/ping"
                timeoutMs = 5000
            }
        }
    )
} | ConvertTo-Json -Depth 8

$r = Invoke-WebRequest -Uri "$base/api/jobs" -Method POST -ContentType 'application/json' -Body $body -UseBasicParsing
$created = $r.Content | ConvertFrom-Json
"created job id: $($created.id), cron: $($created.cronExpression), tz: $($created.timezone)" | Out-File -FilePath $log -Append -Encoding utf8
Write-Host "[created] id=$($created.id) cron=$($created.cronExpression) tz=$($created.timezone)" -ForegroundColor Green

# Verify the cron builder would parse it back
$r2 = Invoke-WebRequest -Uri "$base/api/cron/describe?expr=$([uri]::EscapeDataString('0 12 * * 1-5'))&tz=Europe/Berlin" -UseBasicParsing
$d = $r2.Content | ConvertFrom-Json
"describe-roundtrip: ok=$($d.ok) text=$($d.text)" | Out-File -FilePath $log -Append -Encoding utf8
Write-Host "[describe back] $($d.text)"

# List and cleanup
$list = Invoke-WebRequest -Uri "$base/api/jobs" -UseBasicParsing | ConvertFrom-Json
"total jobs after create: $($list.jobs.Count)" | Out-File -FilePath $log -Append -Encoding utf8

Invoke-WebRequest -Uri "$base/api/jobs/$($created.id)" -Method DELETE -UseBasicParsing | Out-Null
"deleted $($created.id)" | Out-File -FilePath $log -Append -Encoding utf8

$final = Invoke-WebRequest -Uri "$base/api/jobs" -UseBasicParsing | ConvertFrom-Json
"final jobs: $($final.jobs.Count)" | Out-File -FilePath $log -Append -Encoding utf8
Write-Host "final jobs count: $($final.jobs.Count)" -ForegroundColor Green
"=== done ===" | Out-File -FilePath $log -Append -Encoding utf8
exit 0
