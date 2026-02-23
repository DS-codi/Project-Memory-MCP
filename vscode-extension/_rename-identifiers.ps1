# Bulk rename extension identifiers to create a separate "Dev" extension identity
# This allows both stable and dev versions to coexist in VS Code

Set-Location $PSScriptRoot

$files = @(Get-ChildItem -Path src -Recurse -Filter *.ts | ForEach-Object { $_.FullName })
$files += (Resolve-Path package.json).Path

Write-Host "Total files to process: $($files.Count)"

# Replacements applied IN ORDER — most specific patterns first to prevent double-replacing
$replacements = @(
    # 1. Full publisher.name extension ID
    @{ find = 'project-memory.project-memory-dashboard'; replace = 'project-memory-dev.project-memory-dashboard-dev' },
    # 2. Extension name standalone
    @{ find = 'project-memory-dashboard'; replace = 'project-memory-dashboard-dev' },
    # 3. Hyphenated command: supervisor
    @{ find = 'project-memory.startSupervisor'; replace = 'project-memory-dev.startSupervisor' },
    # 4. Chat participant ID
    @{ find = 'project-memory.memory'; replace = 'project-memory-dev.memory' },
    # 5. Dotted command/settings prefix
    @{ find = 'projectMemory.'; replace = 'projectMemoryDev.' },
    # 6. Double-quoted view container / config section
    @{ find = '"projectMemory"'; replace = '"projectMemoryDev"' },
    # 7. Single-quoted getConfiguration calls
    @{ find = "'projectMemory'"; replace = "'projectMemoryDev'" },
    # 8. Supervisor settings keys in package.json
    @{ find = '"supervisor.'; replace = '"supervisorDev.' },
    # 9. getConfiguration('supervisor') in source
    @{ find = "'supervisor'"; replace = "'supervisorDev'" },
    # 10. Command category label
    @{ find = '"Project Memory"'; replace = '"Project Memory Dev"' },
    # 11. Fix display name (the "Dashboard" string got -dev appended by step 2)
    @{ find = 'Project Memory Dashboard-dev'; replace = 'Project Memory Dashboard (Dev)' }
)

$totalChanges = 0

foreach ($file in $files) {
    $content = Get-Content -Path $file -Raw -Encoding UTF8
    $original = $content
    $fileChanges = 0

    foreach ($r in $replacements) {
        $count = ([regex]::Matches($content, [regex]::Escape($r.find))).Count
        if ($count -gt 0) {
            $content = $content.Replace($r.find, $r.replace)
            $fileChanges += $count
        }
    }

    if ($content -ne $original) {
        Set-Content -Path $file -Value $content -NoNewline -Encoding UTF8
        $rel = $file.Replace((Get-Location).Path + '\', '')
        Write-Host "  Modified: $rel ($fileChanges replacements)"
        $totalChanges += $fileChanges
    }
}

Write-Host "`nTotal replacements made: $totalChanges"
