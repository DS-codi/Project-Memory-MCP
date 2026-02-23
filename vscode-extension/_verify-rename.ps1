Set-Location $PSScriptRoot
Write-Host "=== EXTENSION RENAME AUDIT ===" -ForegroundColor Cyan

$files = Get-ChildItem -Path . -Include *.ts,*.json -Recurse -File |
    Where-Object { $_.FullName -notmatch 'node_modules|\.replay|out\\|goldens|package-lock' }

$stale = 0

Write-Host "`n[1] Checking for OLD identifiers in .ts files..." -ForegroundColor Yellow
$tsFiles = $files | Where-Object { $_.Extension -eq '.ts' }

# Old projectMemory. (not projectMemoryDev.)
$m = $tsFiles | Select-String -Pattern 'projectMemory\.(?!Dev)' -AllMatches
if ($m.Count -gt 0) {
    Write-Host "  STALE: projectMemory. (not Dev) = $($m.Count) hits" -ForegroundColor Red
    $m | Select-Object -First 5 | ForEach-Object {
        Write-Host "    $($_.Filename):$($_.LineNumber)" -ForegroundColor DarkYellow
    }
    $stale += $m.Count
} else {
    Write-Host "  OK: No old projectMemory. references" -ForegroundColor Green
}

# Old project-memory. (not project-memory-dev.)
$m = $tsFiles | Select-String -Pattern 'project-memory\.(?!dev)' -AllMatches
if ($m.Count -gt 0) {
    Write-Host "  STALE: project-memory. (not -dev.) = $($m.Count) hits" -ForegroundColor Red
    $m | Select-Object -First 5 | ForEach-Object {
        Write-Host "    $($_.Filename):$($_.LineNumber): $($_.Line.Trim().Substring(0,[Math]::Min(100,$_.Line.Trim().Length)))" -ForegroundColor DarkYellow
    }
    $stale += $m.Count
} else {
    Write-Host "  OK: No old project-memory. command refs" -ForegroundColor Green
}

# Old getConfiguration('projectMemory') — not Dev
$m = $tsFiles | Select-String -Pattern "getConfiguration\(['""]projectMemory['""]" -AllMatches
if ($m.Count -gt 0) {
    Write-Host "  STALE: getConfiguration('projectMemory') = $($m.Count)" -ForegroundColor Red
    $m | ForEach-Object { Write-Host "    $($_.Filename):$($_.LineNumber)" -ForegroundColor DarkYellow }
    $stale += $m.Count
} else {
    Write-Host "  OK: No old getConfiguration('projectMemory')" -ForegroundColor Green
}

# Old getConfiguration('supervisor') — not Dev
$m = $tsFiles | Select-String -Pattern "getConfiguration\(['""]supervisor['""]" -AllMatches
if ($m.Count -gt 0) {
    Write-Host "  STALE: getConfiguration('supervisor') = $($m.Count)" -ForegroundColor Red
    $m | ForEach-Object { Write-Host "    $($_.Filename):$($_.LineNumber)" -ForegroundColor DarkYellow }
    $stale += $m.Count
} else {
    Write-Host "  OK: No old getConfiguration('supervisor')" -ForegroundColor Green
}

Write-Host "`n[2] Checking package.json..." -ForegroundColor Yellow
$pj = Get-Content ".\package.json" -Raw

# Double -dev
if ($pj -match 'dev-dev') {
    Write-Host "  STALE: Double '-dev-dev' found in package.json" -ForegroundColor Red
    $stale++
} else {
    Write-Host "  OK: No double -dev" -ForegroundColor Green
}

# Old setting keys in configuration
$pjSettingOld = ([regex]::Matches($pj, '"projectMemory\.(?!Dev)')).Count
if ($pjSettingOld -gt 0) {
    Write-Host "  STALE: $pjSettingOld old projectMemory. setting keys" -ForegroundColor Red
    $stale += $pjSettingOld
} else {
    Write-Host "  OK: All settings use projectMemoryDev." -ForegroundColor Green
}

# Old supervisor. setting keys  
$pjSuperOld = ([regex]::Matches($pj, '"supervisor\.(?!Dev)')).Count
if ($pjSuperOld -gt 0) {
    Write-Host "  STALE: $pjSuperOld old supervisor. setting keys" -ForegroundColor Red
    $stale += $pjSuperOld
} else {
    Write-Host "  OK: All supervisor settings use supervisorDev." -ForegroundColor Green
}

# Old command category
$pjCatOld = ([regex]::Matches($pj, '"Project Memory"(?! Dev)')).Count
if ($pjCatOld -gt 0) {
    Write-Host "  STALE: $pjCatOld old 'Project Memory' categories (missing Dev)" -ForegroundColor Red
    $stale += $pjCatOld
} else {
    Write-Host "  OK: All categories say 'Project Memory Dev'" -ForegroundColor Green
}

Write-Host "`n[3] Verifying NEW identifiers exist..." -ForegroundColor Yellow
$checks = @(
    @{P='project-memory-dashboard-dev"'; D='Extension name (-dev)'; Min=1}
    @{P='project-memory-dev\.memory'; D='Chat participant ID'; Min=1}
    @{P='projectMemoryDev\.'; D='projectMemoryDev. (commands+settings)'; Min=10}
    @{P='supervisorDev\.'; D='supervisorDev. settings'; Min=1}
    @{P='Project Memory Dev'; D='Command category labels'; Min=5}
    @{P="getConfiguration\(['""]projectMemoryDev"; D='getConfig(projectMemoryDev)'; Min=1}
    @{P="getConfiguration\(['""]supervisorDev"; D='getConfig(supervisorDev)'; Min=1}
)
foreach ($c in $checks) {
    $m = $files | Select-String -Pattern $c.P -AllMatches
    $count = $m.Count
    $ok = $count -ge $c.Min
    $icon = if ($ok) { "OK" } else { "MISSING" }
    $color = if ($ok) { "Green" } else { "Red" }
    Write-Host "  ${icon}: $($c.D) ($count hits, need>=$($c.Min))" -ForegroundColor $color
}

Write-Host "`n=== RESULT ===" -ForegroundColor Cyan
if ($stale -eq 0) {
    Write-Host "  ALL CLEAN - No stale references detected" -ForegroundColor Green
} else {
    Write-Host "  $stale stale references remain - needs fixing" -ForegroundColor Red
}
