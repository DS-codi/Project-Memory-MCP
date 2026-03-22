#!/usr/bin/env pwsh
<#
.SYNOPSIS
    First-time install and migration script for Project Memory MCP.

.DESCRIPTION
    Sets up the canonical data root, delegates all component build/install to
    install.ps1, optionally migrates plans from an old data root, and optionally
    imports distributed skills/instructions from other workspaces.

    The data root directory is the single source of truth for all components.
    PM_DATA_ROOT is set to this directory; the database is always created as
    project-memory.db inside it.

.PARAMETER DataRoot
    Directory to use as the Project Memory data root (PM_DATA_ROOT).
    Default: %APPDATA%\ProjectMemory

.PARAMETER OldDataRoot
    Optional path to an old Project Memory data root to migrate plans from.

.PARAMETER SkipDistributedImport
    Skip the optional step that discovers skills/instructions from other workspaces.

.PARAMETER SkipComponentInstall
    Run only the data-setup steps (DB init, migration, artifact import).
    Do not call install.ps1 for remaining components.

.PARAMETER NonInteractive
    Run with all defaults, no prompts.
#>
[CmdletBinding()]
param(
    [string]$DataRoot,
    [string]$OldDataRoot,
    [switch]$SkipDistributedImport,
    [switch]$SkipComponentInstall,
    [switch]$NonInteractive
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$RepoRoot = $PSScriptRoot
$ServerDir = Join-Path $RepoRoot 'server'
$InstallScript = Join-Path $RepoRoot 'install.ps1'

function Write-Section([string]$Text) {
    Write-Host "`n== $Text" -ForegroundColor Cyan
}

function Write-Ok([string]$Text) {
    Write-Host "  [OK] $Text" -ForegroundColor Green
}

function Write-Warn([string]$Text) {
    Write-Host "  [WARN] $Text" -ForegroundColor Yellow
}

function Write-Info([string]$Text) {
    Write-Host "  [INFO] $Text" -ForegroundColor DarkGray
}

function Invoke-Checked([string]$Description, [scriptblock]$Block) {
    Write-Host "  -> $Description" -ForegroundColor Gray
    # Use child scope with ErrorActionPreference = Continue to avoid NativeCommandError in PS 5.1
    & {
        $ErrorActionPreference = 'Continue'
        & $Block
    }
    if ($LASTEXITCODE -ne 0) {
        throw "$Description failed (exit $LASTEXITCODE)"
    }
}

function Resolve-AbsolutePath([string]$InputPath) {
    if ([string]::IsNullOrWhiteSpace($InputPath)) { return $null }
    return [System.IO.Path]::GetFullPath($InputPath)
}

function Get-DefaultDataRoot {
    $base = if ($env:APPDATA) { $env:APPDATA } else { Join-Path $HOME 'AppData\Roaming' }
    return (Join-Path $base 'ProjectMemory')
}

function Read-OptionalPath([string]$Prompt) {
    $value = Read-Host $Prompt
    if ([string]::IsNullOrWhiteSpace($value)) { return $null }
    return (Resolve-AbsolutePath $value)
}

function Ensure-IdentityFilesFromDataRoot {
    param(
        [Parameter(Mandatory)] [string]$DataRoot
    )

    if (-not (Test-Path $DataRoot)) {
        Write-Warn "Data root not found for identity refresh: $DataRoot"
        return 0
    }

    $updated = 0
    $workspaceDirs = Get-ChildItem -Path $DataRoot -Directory -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -notin @('events', 'logs') }

    foreach ($dir in $workspaceDirs) {
        $metaPath = Join-Path $dir.FullName 'workspace.meta.json'
        if (-not (Test-Path $metaPath)) { continue }

        try {
            $meta = Get-Content $metaPath -Raw | ConvertFrom-Json
        } catch {
            Write-Warn "Skipping unreadable workspace meta: $metaPath"
            continue
        }

        $workspaceId = [string]$meta.workspace_id
        $workspacePath = if ($meta.workspace_path) { [string]$meta.workspace_path } else { [string]$meta.path }

        if ([string]::IsNullOrWhiteSpace($workspaceId) -or [string]::IsNullOrWhiteSpace($workspacePath)) {
            Write-Warn "Skipping workspace with missing workspace_id/path in $metaPath"
            continue
        }

        if (-not (Test-Path $workspacePath)) {
            Write-Warn "Workspace path not found for identity refresh: $workspacePath"
            continue
        }

        $identityDir = Join-Path $workspacePath '.projectmemory'
        $identityPath = Join-Path $identityDir 'identity.json'
        New-Item -Path $identityDir -ItemType Directory -Force | Out-Null

        $now = (Get-Date).ToString('o')
        $existing = $null
        if (Test-Path $identityPath) {
            try {
                $existing = Get-Content $identityPath -Raw | ConvertFrom-Json
            } catch {
                $existing = $null
            }
        }

        $payload = [ordered]@{
            schema_version = '1.0.0'
            workspace_id = $workspaceId
            workspace_path = $workspacePath
            data_root = $DataRoot
            created_at = if ($existing -and $existing.created_at) { [string]$existing.created_at } else { $now }
            updated_at = $now
        }

        $payload | ConvertTo-Json -Depth 5 | Set-Content -Path $identityPath -Encoding UTF8
        $updated++
    }

    return $updated
}

function Get-WorkspacePathsFromDataRoot {
    param(
        [Parameter(Mandatory)] [string]$DataRoot
    )

    $paths = New-Object System.Collections.Generic.List[string]
    if (-not (Test-Path $DataRoot)) { return @() }

    $workspaceDirs = Get-ChildItem -Path $DataRoot -Directory -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -notin @('events', 'logs') }

    foreach ($dir in $workspaceDirs) {
        $metaPath = Join-Path $dir.FullName 'workspace.meta.json'
        if (-not (Test-Path $metaPath)) { continue }

        try {
            $meta = Get-Content $metaPath -Raw | ConvertFrom-Json
            $workspacePath = if ($meta.workspace_path) { [string]$meta.workspace_path } else { [string]$meta.path }
            if (-not [string]::IsNullOrWhiteSpace($workspacePath) -and (Test-Path $workspacePath)) {
                $full = Resolve-AbsolutePath $workspacePath
                if (-not $paths.Contains($full)) {
                    $paths.Add($full)
                }
            }
        } catch {
            continue
        }
    }

    return @($paths)
}

function Get-FileSha256([string]$Path) {
    return (Get-FileHash -Algorithm SHA256 -Path $Path).Hash
}

function New-UniqueFileName {
    param(
        [Parameter(Mandatory)] [string]$Directory,
        [Parameter(Mandatory)] [string]$BaseName
    )

    $name = [System.IO.Path]::GetFileNameWithoutExtension($BaseName)
    $ext = [System.IO.Path]::GetExtension($BaseName)
    $candidate = Join-Path $Directory ($name + $ext)
    $counter = 1

    while (Test-Path $candidate) {
        $candidate = Join-Path $Directory ("$name-$counter$ext")
        $counter++
    }

    return $candidate
}

function Import-DistributedArtifacts {
    param(
        [Parameter(Mandatory)] [string[]]$WorkspacePaths,
        [Parameter(Mandatory)] [string]$RepoRoot
    )

    $instrTarget = Join-Path $RepoRoot '.github\instructions'
    $skillTarget = Join-Path $RepoRoot '.github\skills'

    New-Item -Path $instrTarget -ItemType Directory -Force | Out-Null
    New-Item -Path $skillTarget -ItemType Directory -Force | Out-Null

    $repoRootFull = Resolve-AbsolutePath $RepoRoot
    $existingInstructionHashes = New-Object 'System.Collections.Generic.HashSet[string]'
    $existingSkillHashes = New-Object 'System.Collections.Generic.HashSet[string]'

    Get-ChildItem -Path $instrTarget -File -Filter '*.md' -ErrorAction SilentlyContinue | ForEach-Object {
        [void]$existingInstructionHashes.Add((Get-FileSha256 $_.FullName))
    }

    Get-ChildItem -Path $skillTarget -Recurse -File -Filter 'SKILL.md' -ErrorAction SilentlyContinue | ForEach-Object {
        [void]$existingSkillHashes.Add((Get-FileSha256 $_.FullName))
    }

    $importedInstructions = 0
    $importedSkills = 0

    foreach ($workspacePath in $WorkspacePaths) {
        $fullWorkspace = Resolve-AbsolutePath $workspacePath
        if ($fullWorkspace -eq $repoRootFull) { continue }

        $workspaceSlug = (Split-Path $fullWorkspace -Leaf) -replace '[^a-zA-Z0-9_-]', '-'

        $instructionsDir = Join-Path $fullWorkspace '.github\instructions'
        if (Test-Path $instructionsDir) {
            $instructionFiles = Get-ChildItem -Path $instructionsDir -File -Filter '*.md' -ErrorAction SilentlyContinue
            foreach ($file in $instructionFiles) {
                $hash = Get-FileSha256 $file.FullName
                if ($existingInstructionHashes.Contains($hash)) { continue }

                $baseName = "imported-$workspaceSlug-$($file.Name)"
                $destination = New-UniqueFileName -Directory $instrTarget -BaseName $baseName
                Copy-Item -Path $file.FullName -Destination $destination -Force
                [void]$existingInstructionHashes.Add($hash)
                $importedInstructions++
            }
        }

        $skillsDir = Join-Path $fullWorkspace '.github\skills'
        if (Test-Path $skillsDir) {
            $skillFiles = Get-ChildItem -Path $skillsDir -Recurse -File -Filter 'SKILL.md' -ErrorAction SilentlyContinue
            foreach ($skillFile in $skillFiles) {
                $hash = Get-FileSha256 $skillFile.FullName
                if ($existingSkillHashes.Contains($hash)) { continue }

                $sourceSkillSlug = Split-Path (Split-Path $skillFile.FullName -Parent) -Leaf
                $targetSkillSlug = ("imported-$workspaceSlug-$sourceSkillSlug") -replace '[^a-zA-Z0-9_-]', '-'
                $targetSkillDir = Join-Path $skillTarget $targetSkillSlug
                $suffix = 1
                while (Test-Path $targetSkillDir) {
                    $targetSkillDir = Join-Path $skillTarget ("$targetSkillSlug-$suffix")
                    $suffix++
                }

                New-Item -Path $targetSkillDir -ItemType Directory -Force | Out-Null
                Copy-Item -Path $skillFile.FullName -Destination (Join-Path $targetSkillDir 'SKILL.md') -Force
                [void]$existingSkillHashes.Add($hash)
                $importedSkills++
            }
        }
    }

    return [PSCustomObject]@{
        ImportedInstructions = $importedInstructions
        ImportedSkills = $importedSkills
    }
}

try {
    Write-Section 'Project Memory — First-time Install & Migration'

    # ── 1. Resolve data root ──────────────────────────────────────────────────
    if ([string]::IsNullOrWhiteSpace($DataRoot)) {
        $default = Get-DefaultDataRoot
        if ($NonInteractive) {
            $DataRoot = $default
        } else {
            $input = Read-Host "Data root directory [default: $default]"
            $DataRoot = if ([string]::IsNullOrWhiteSpace($input)) { $default } else { $input }
        }
    }

    $dataRoot = Resolve-AbsolutePath $DataRoot
    New-Item -Path $dataRoot -ItemType Directory -Force | Out-Null

    # PM_DATA_ROOT is the single canonical configuration recognised by all components.
    # The database is always project-memory.db inside this directory.
    $env:PM_DATA_ROOT = $dataRoot
    Write-Info "PM_DATA_ROOT = $dataRoot"
    Write-Info "Database     = $(Join-Path $dataRoot 'project-memory.db')"

    # ── 2. Build server + initialise DB (delegated to install.ps1) ───────────
    Write-Section 'Build server + initialise database'
    Write-Info 'Delegating to install.ps1 -Component Server ...'
    & $InstallScript -Component Server
    if ($LASTEXITCODE -ne 0) { throw "install.ps1 -Component Server failed (exit $LASTEXITCODE)" }

    # ── 3. Refresh identity files from data root ──────────────────────────────
    $identityCount = Ensure-IdentityFilesFromDataRoot -DataRoot $dataRoot
    Write-Ok "Identity refresh: $identityCount workspace identity file(s) updated"

    # ── 4. Optional: migrate from old data root ───────────────────────────────
    if ([string]::IsNullOrWhiteSpace($OldDataRoot) -and -not $NonInteractive) {
        $shouldMigrate = Read-Host 'Migrate plans from an old Project Memory data root? (y/N)'
        if ($shouldMigrate -match '^(y|yes)$') {
            $OldDataRoot = Read-OptionalPath 'Enter old data root folder path'
        }
    }

    if (-not [string]::IsNullOrWhiteSpace($OldDataRoot)) {
        $resolvedOldDataRoot = Resolve-AbsolutePath $OldDataRoot
        if (-not (Test-Path $resolvedOldDataRoot)) {
            throw "Old data root does not exist: $resolvedOldDataRoot"
        }

        Write-Section 'Migrate plans/context from old data root'
        Push-Location $ServerDir
        try {
            Write-Host "  -> node dist/migration/migrate.js --data-root `"$resolvedOldDataRoot`"" -ForegroundColor Gray
            & {
                $ErrorActionPreference = 'Continue'
                node (Join-Path $ServerDir 'dist\migration\migrate.js') --data-root $resolvedOldDataRoot 2>&1 | Write-Host
            }
            if ($LASTEXITCODE -ne 0) {
                Write-Warn "Migration completed with errors (exit $LASTEXITCODE). Some plans may not have been migrated — see report above. Continuing install."
            } else {
                Write-Ok 'Migration completed successfully.'
            }
        } finally {
            Pop-Location
        }

        $postMigrateCount = Ensure-IdentityFilesFromDataRoot -DataRoot $dataRoot
        Write-Ok "Post-migration identity refresh: $postMigrateCount workspace identity file(s) updated"
    }

    # ── 5. Optional: import distributed skills/instructions ───────────────────
    if (-not $SkipDistributedImport) {
        $doImport = $true
        if (-not $NonInteractive) {
            $importAnswer = Read-Host 'Import distributed skills/instructions from other workspaces? (Y/n)'
            if ($importAnswer -match '^(n|no)$') { $doImport = $false }
        }

        if ($doImport) {
            Write-Section 'Discover + import distributed skills/instructions'

            $workspacePaths = New-Object System.Collections.Generic.List[string]
            foreach ($path in (Get-WorkspacePathsFromDataRoot -DataRoot $dataRoot)) {
                if (-not $workspacePaths.Contains($path)) { $workspacePaths.Add($path) }
            }
            if (-not [string]::IsNullOrWhiteSpace($OldDataRoot)) {
                foreach ($path in (Get-WorkspacePathsFromDataRoot -DataRoot (Resolve-AbsolutePath $OldDataRoot))) {
                    if (-not $workspacePaths.Contains($path)) { $workspacePaths.Add($path) }
                }
            }

            if ($workspacePaths.Count -eq 0) {
                Write-Warn 'No workspace paths discovered — skipping distributed artifact import.'
            } else {
                $importResult = Import-DistributedArtifacts -WorkspacePaths @($workspacePaths) -RepoRoot $RepoRoot
                Write-Ok "Imported instructions: $($importResult.ImportedInstructions)"
                Write-Ok "Imported skills:       $($importResult.ImportedSkills)"

                if ($importResult.ImportedInstructions -gt 0 -or $importResult.ImportedSkills -gt 0) {
                    # Re-seed to pick up newly imported artifacts (data operation only — no rebuild needed).
                    Write-Info 'Re-seeding database with imported artifacts...'
                    Push-Location $ServerDir
                    try {
                        Invoke-Checked 'node dist/db/seed.js' {
                            node (Join-Path $ServerDir 'dist\db\seed.js') 2>&1 | Write-Host
                        }
                    } finally {
                        Pop-Location
                    }
                }
            }
        }
    }

    # ── 6. Install remaining components (delegated to install.ps1) ───────────
    if (-not $SkipComponentInstall) {
        $installRemaining = $true
        if (-not $NonInteractive) {
            $installAnswer = Read-Host 'Install remaining components (Extension, Dashboard, Supervisor, InteractiveTerminal)? (Y/n)'
            if ($installAnswer -match '^(n|no)$') { $installRemaining = $false }
        }

        if ($installRemaining) {
            Write-Section 'Install remaining components'
            Write-Info 'Delegating to install.ps1 -Component Extension,Dashboard,Supervisor,InteractiveTerminal ...'
            & $InstallScript -Component Extension, Dashboard, Supervisor, InteractiveTerminal
            if ($LASTEXITCODE -ne 0) { throw "install.ps1 failed for remaining components (exit $LASTEXITCODE)" }
        }
    }

    Write-Section 'Done'
    Write-Ok 'First-time install and migration completed successfully.'
    Write-Info "Data root : $dataRoot"
    Write-Info "Database  : $(Join-Path $dataRoot 'project-memory.db')"
    exit 0
}
catch {
    Write-Host "`n[ERROR] $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
