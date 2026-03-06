<#
.SYNOPSIS
    Fixes stale projectMemory.serverPort / apiPort values across all registered workspaces.

.DESCRIPTION
    Scans every workspace registered in Project Memory for .code-workspace files and
    .vscode/settings.json that contain projectMemory.serverPort or projectMemory.apiPort
    set to the old default (3001). Updates them to the correct port (3459).

    Also checks the VS Code user-level settings.json.

.PARAMETER DataRoot
    Path to the Project Memory data root. Auto-detected from user settings if omitted.

.PARAMETER OldPort
    The stale port value to replace (default: 3001).

.PARAMETER NewPort
    The correct port value (default: 3459).

.PARAMETER DryRun
    Preview changes without writing files.

.EXAMPLE
    .\fix-workspace-ports.ps1
    .\fix-workspace-ports.ps1 -DryRun
#>

param(
    [string]$DataRoot,
    [int]$OldPort = 3001,
    [int]$NewPort = 3459,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

# --- Resolve data root ---
if (-not $DataRoot) {
    $userSettings = Join-Path $env:APPDATA "Code\User\settings.json"
    if (Test-Path $userSettings) {
        $raw = Get-Content $userSettings -Raw
        if ($raw -match '"projectMemory\.dataRoot"\s*:\s*"([^"]+)"') {
            $DataRoot = $Matches[1] -replace '\\\\', '\'
        }
    }
    if (-not $DataRoot) {
        $DataRoot = Join-Path (Split-Path $PSScriptRoot -Parent) "data"
    }
}

if (-not (Test-Path $DataRoot)) {
    Write-Error "Data root not found: $DataRoot"
    return
}

Write-Host "`n=== Project Memory Port Fix ===" -ForegroundColor Cyan
Write-Host "Data root : $DataRoot"
Write-Host "Old port  : $OldPort"
Write-Host "New port  : $NewPort"
if ($DryRun) { Write-Host "Mode      : DRY RUN (no files will be modified)" -ForegroundColor Yellow }
Write-Host ""

$fixCount = 0
$scanCount = 0

function Update-PortInJsonFile {
    param(
        [string]$FilePath,
        [string]$Label
    )

    if (-not (Test-Path $FilePath)) { return }

    $script:scanCount++
    $content = Get-Content $FilePath -Raw

    $patterns = @(
        @{ Find = """projectMemory.serverPort""\s*:\s*$OldPort"; Replace = """projectMemory.serverPort"": $NewPort" },
        @{ Find = """projectMemory.apiPort""\s*:\s*$OldPort";    Replace = """projectMemory.apiPort"": $NewPort" }
    )

    $modified = $false
    foreach ($p in $patterns) {
        if ($content -match $p.Find) {
            $content = $content -replace $p.Find, $p.Replace
            $modified = $true
            Write-Host "  [FIX] $($p.Find -replace '\\s\*:\\s\*', ': ') => $NewPort" -ForegroundColor Green
        }
    }

    if ($modified) {
        $script:fixCount++
        if (-not $DryRun) {
            Set-Content -Path $FilePath -Value $content -NoNewline -Encoding UTF8
            Write-Host "  [SAVED] $FilePath" -ForegroundColor Green
        } else {
            Write-Host "  [DRY RUN] Would update: $FilePath" -ForegroundColor Yellow
        }
    } else {
        Write-Host "  [OK] $Label - no stale ports" -ForegroundColor DarkGray
    }
}

# --- 1. Scan user-level settings ---
Write-Host "--- VS Code User Settings ---" -ForegroundColor Cyan
$userSettingsPath = Join-Path $env:APPDATA "Code\User\settings.json"
Update-PortInJsonFile -FilePath $userSettingsPath -Label "User settings.json"
Write-Host ""

# --- 2. Collect workspace paths from meta files ---
$workspacePaths = @()
Get-ChildItem $DataRoot -Filter "workspace.meta.json" -Recurse -Depth 1 -ErrorAction SilentlyContinue | ForEach-Object {
    try {
        $meta = Get-Content $_.FullName -Raw | ConvertFrom-Json
        if ($meta.path -and (Test-Path $meta.path)) {
            $workspacePaths += $meta.path
        } elseif ($meta.path) {
            Write-Host "  [SKIP] $($meta.path) - path not accessible" -ForegroundColor DarkYellow
        }
    } catch {
        Write-Host "  [WARN] Failed to parse $($_.FullName): $_" -ForegroundColor Yellow
    }
}

Write-Host "--- Registered Workspaces ($($workspacePaths.Count)) ---" -ForegroundColor Cyan

foreach ($wsPath in $workspacePaths) {
    Write-Host "`n  Workspace: $wsPath" -ForegroundColor White

    # Check .code-workspace files (root level)
    Get-ChildItem $wsPath -Filter "*.code-workspace" -File -ErrorAction SilentlyContinue | ForEach-Object {
        Write-Host "    Checking: $($_.Name)"
        Update-PortInJsonFile -FilePath $_.FullName -Label $_.Name
    }

    # Check .vscode/settings.json
    $vsSettings = Join-Path $wsPath ".vscode\settings.json"
    if (Test-Path $vsSettings) {
        Write-Host "    Checking: .vscode/settings.json"
        Update-PortInJsonFile -FilePath $vsSettings -Label ".vscode/settings.json"
    }
}

# --- 3. Summary ---
Write-Host "`n--- Summary ---" -ForegroundColor Cyan
Write-Host "Files scanned : $scanCount"
Write-Host "Files fixed   : $fixCount"
if ($DryRun -and $fixCount -gt 0) {
    Write-Host "`nRe-run without -DryRun to apply changes." -ForegroundColor Yellow
} elseif ($fixCount -gt 0) {
    Write-Host "`nAll stale ports updated. Reload affected VS Code windows to apply." -ForegroundColor Green
} else {
    Write-Host "`nNo stale ports found." -ForegroundColor Green
}
