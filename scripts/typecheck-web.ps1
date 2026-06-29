Set-Location "C:\Users\benjamin.steimer\workspace\cronboard"
$log = "C:\Users\benjamin.steimer\workspace\cronboard\typecheck-web.log"
"=== web typecheck $(Get-Date -Format o) ===" | Out-File -FilePath $log -Encoding utf8
Set-Location "packages/web"
npm run typecheck 2>&1 | Out-File -FilePath $log -Append -Encoding utf8
"=== exit: $LASTEXITCODE ===" | Out-File -FilePath $log -Append -Encoding utf8
exit $LASTEXITCODE
