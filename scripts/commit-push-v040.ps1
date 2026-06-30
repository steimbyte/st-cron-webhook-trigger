Set-Location "C:\Users\benjamin.steimer\workspace\cronboard"
git add -A
git -c commit.gpgsign=false commit -q -F .git/COMMIT_EDITMSG --no-verify
Write-Host ""
Write-Host "---log---"
git log --oneline -n 3
Write-Host ""
Write-Host "---push---"
git push
if ($LASTEXITCODE -eq 0) {
    Write-Host "PUSH OK"
} else {
    Write-Host "PUSH FAILED"
}