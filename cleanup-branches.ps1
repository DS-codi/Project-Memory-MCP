# cleanup-branches.ps1
# Run this AFTER closing VS Code to avoid file-lock issues.
# Deletes local branches that are fully merged into main.
# Safe: git branch -d refuses to delete unmerged branches.

Set-Location $PSScriptRoot

Write-Host "`n=== Pre-cleanup: local branches ===" -ForegroundColor Cyan
git branch

Write-Host "`n=== Deleting merged branches ===" -ForegroundColor Yellow
$branches = @("claude/tender-saha", "dev/march-2-updates", "feat/global-claude-install-gui")

foreach ($b in $branches) {
    $exists = git branch --list $b
    if ($exists) {
        git branch -d $b
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  Deleted: $b" -ForegroundColor Green
        } else {
            Write-Host "  FAILED to delete: $b (may not be fully merged)" -ForegroundColor Red
        }
    } else {
        Write-Host "  Already gone: $b" -ForegroundColor DarkGray
    }
}

Write-Host "`n=== Post-cleanup: remaining branches ===" -ForegroundColor Cyan
git branch

Write-Host "`n=== Git status ===" -ForegroundColor Cyan
git status --short
if (-not (git status --short)) {
    Write-Host "  Working tree clean." -ForegroundColor Green
}

Write-Host "`nDone. You can delete this script now." -ForegroundColor DarkGray
