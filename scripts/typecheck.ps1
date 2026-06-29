Set-Location "C:\Users\benjamin.steimer\workspace\cronboard\packages\core"
$log = "C:\Users\benjamin.steimer\workspace\cronboard\typecheck.log"
"=== typecheck $(Get-Date -Format o) ===" | Out-File -FilePath $log -Encoding utf8
npm run typecheck 2>&1 | Out-File -FilePath $log -Append -Encoding utf8
"=== exit: $LASTEXITCODE ===" | Out-File -FilePath $log -Append -Encoding utf8
exit $LASTEXITCODE
