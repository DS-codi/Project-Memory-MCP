<#
.SYNOPSIS
    Detects outdated Project Memory settings and workspace files.

.DESCRIPTION
    Connects to the user's Project Memory SQLite DB (project-memory.db), reads
    registered workspaces from the workspaces table, and scans workspace-level
    files for stale settings or identity mismatches.

    By default this script only reports findings. Use -Apply to auto-fix known,
    safe remediations.

.PARAMETER DataRoot
    Optional explicit Project Memory data root. Defaults to PM_DATA_ROOT, then
    platform default (%APPDATA%\ProjectMemory on Windows, ~/.local/share/ProjectMemory on non-Windows).

.PARAMETER Apply
    Apply safe automatic fixes:
    - Replace stale port values in JSON settings files (after user confirmation)
    - Migrate legacy projectMemory.apiPort key to projectMemory.serverPort (after user confirmation)
    - Create/update .projectmemory/identity.json when missing/mismatched

.EXAMPLE
    .\scripts\audit-outdated-settings-and-files.ps1

.EXAMPLE
    .\scripts\audit-outdated-settings-and-files.ps1 -Apply
#>

[CmdletBinding()]
param(
    [string]$DataRoot,
    [switch]$Apply
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$script:Findings = [System.Collections.Generic.List[pscustomobject]]::new()
$script:AppliedFixCount = 0
$script:ScannedFileCount = 0
$script:PortMigrationConsentResolved = $false
$script:PortMigrationApproved = $false
$script:PortMigrationDeclinedRecorded = $false

function Write-Section {
    param([string]$Message)
    Write-Host "`n=== $Message ===" -ForegroundColor Cyan
}

function Write-Detail {
    param([string]$Message)
    Write-Host "  $Message" -ForegroundColor DarkGray
}

function Write-WarnLine {
    param([string]$Message)
    Write-Host "  [WARN] $Message" -ForegroundColor Yellow
}

function Add-Finding {
    param(
        [string]$Type,
        [string]$WorkspaceId,
        [string]$WorkspacePath,
        [string]$FilePath,
        [string]$Message,
        [string]$Severity = 'warning',
        [bool]$Fixed = $false
    )

    $script:Findings.Add([pscustomobject]@{
        Type          = $Type
        Severity      = $Severity
        WorkspaceId   = $WorkspaceId
        WorkspacePath = $WorkspacePath
        FilePath      = $FilePath
        Message       = $Message
        Fixed         = $Fixed
    }) | Out-Null
}

function Request-PortMigrationApproval {
    param(
        [string]$FirstFilePath = ''
    )

    if ($script:PortMigrationConsentResolved) {
        return $script:PortMigrationApproved
    }

    $script:PortMigrationConsentResolved = $true

    if (-not $Apply) {
        $script:PortMigrationApproved = $false
        return $false
    }

    if (-not [Environment]::UserInteractive) {
        Write-WarnLine 'Port migration requires confirmation, but no interactive terminal is available. Skipping port migration fixes.'
        $script:PortMigrationApproved = $false
        return $false
    }

    Write-Host ''
    Write-Host 'Port migration confirmation required.' -ForegroundColor Yellow
    Write-Host '  Legacy/stale Project Memory port settings were detected.' -ForegroundColor DarkGray
    if (-not [string]::IsNullOrWhiteSpace($FirstFilePath)) {
        Write-Host "  Example file: $FirstFilePath" -ForegroundColor DarkGray
    }
    Write-Host '  Proposed changes:' -ForegroundColor DarkGray
    Write-Host '    - update legacy port values to current defaults' -ForegroundColor DarkGray
    Write-Host '    - migrate projectMemory.apiPort to projectMemory.serverPort' -ForegroundColor DarkGray

    try {
        $response = Read-Host 'Apply automatic port migration now? (Y/N)'
    } catch {
        Write-WarnLine "Could not read user input for port migration confirmation: $($_.Exception.Message)"
        $script:PortMigrationApproved = $false
        return $false
    }

    $script:PortMigrationApproved = $response -match '^(?i)y(?:es)?$'
    if ($script:PortMigrationApproved) {
        Write-Host '  Port migration approved.' -ForegroundColor Green
    } else {
        Write-Host '  Port migration declined by user.' -ForegroundColor Yellow
    }

    return $script:PortMigrationApproved
}

function Move-LegacyApiPortInMap {
    param(
        [System.Collections.IDictionary]$Map
    )

    if ($null -eq $Map -or -not $Map.Contains('projectMemory.apiPort')) {
        return $false
    }

    $apiPortValue = $Map['projectMemory.apiPort']
    if (-not $Map.Contains('projectMemory.serverPort')) {
        $Map['projectMemory.serverPort'] = $apiPortValue
    }

    [void]$Map.Remove('projectMemory.apiPort')
    return $true
}

function Try-MigrateLegacyApiPortKey {
    param(
        [Parameter(Mandatory)][string]$JsonText
    )

    try {
        $parsed = $JsonText | ConvertFrom-Json -AsHashtable
    } catch {
        return [pscustomobject]@{
            Success        = $false
            Changed        = $false
            UpdatedContent = $JsonText
            Error          = $_.Exception.Message
        }
    }

    if (-not ($parsed -is [System.Collections.IDictionary])) {
        return [pscustomobject]@{
            Success        = $false
            Changed        = $false
            UpdatedContent = $JsonText
            Error          = 'Parsed JSON root is not an object.'
        }
    }

    $changed = $false

    if (Move-LegacyApiPortInMap -Map $parsed) {
        $changed = $true
    }

    if (
        $parsed.Contains('settings') -and
        ($parsed['settings'] -is [System.Collections.IDictionary]) -and
        (Move-LegacyApiPortInMap -Map $parsed['settings'])
    ) {
        $changed = $true
    }

    if (-not $changed) {
        return [pscustomobject]@{
            Success        = $true
            Changed        = $false
            UpdatedContent = $JsonText
            Error          = ''
        }
    }

    return [pscustomobject]@{
        Success        = $true
        Changed        = $true
        UpdatedContent = ($parsed | ConvertTo-Json -Depth 100)
        Error          = ''
    }
}

function Resolve-DataRoot {
    param([string]$ExplicitDataRoot)

    if (-not [string]::IsNullOrWhiteSpace($ExplicitDataRoot)) {
        return $ExplicitDataRoot
    }

    if (-not [string]::IsNullOrWhiteSpace($env:PM_DATA_ROOT)) {
        return $env:PM_DATA_ROOT
    }

    if ($IsWindows) {
        if ([string]::IsNullOrWhiteSpace($env:APPDATA)) {
            throw 'APPDATA is not set; provide -DataRoot explicitly.'
        }
        return (Join-Path $env:APPDATA 'ProjectMemory')
    }

    if ([string]::IsNullOrWhiteSpace($env:HOME)) {
        throw 'HOME is not set; provide -DataRoot explicitly.'
    }

    return (Join-Path (Join-Path $env:HOME '.local') 'share/ProjectMemory')
}

function Get-RegisteredWorkspacesFromDb {
    param(
        [Parameter(Mandatory)][string]$RepoRoot,
        [Parameter(Mandatory)][string]$DbPath
    )

    $node = Get-Command node -ErrorAction SilentlyContinue
    if (-not $node) {
        throw 'node is required to query project-memory.db but was not found in PATH.'
    }

    $betterSqlitePath = Join-Path $RepoRoot 'server\node_modules\better-sqlite3'
    if (-not (Test-Path $betterSqlitePath)) {
        throw "better-sqlite3 module not found at $betterSqlitePath. Run install.ps1 -Component Server first."
    }

    $dbPathJson = ConvertTo-Json -Compress $DbPath
    $modulePathJson = ConvertTo-Json -Compress $betterSqlitePath

    $nodeScript = @"
const Database = require($modulePathJson);
const db = new Database($dbPathJson, { readonly: true });
let rows = [];
try {
  rows = db.prepare('SELECT id, path, name FROM workspaces ORDER BY registered_at DESC').all();
} finally {
  db.close();
}
process.stdout.write(JSON.stringify(rows));
"@

    $json = & node -e $nodeScript 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "DB query failed: $json"
    }

    if ([string]::IsNullOrWhiteSpace($json)) {
        return @()
    }

    $parsed = $json | ConvertFrom-Json
    if ($null -eq $parsed) { return @() }
    if ($parsed -is [System.Array]) { return $parsed }
    return @($parsed)
}

function Update-FileContentIfNeeded {
    param(
        [Parameter(Mandatory)][string]$FilePath,
        [Parameter(Mandatory)][string]$WorkspaceId,
        [Parameter(Mandatory)][string]$WorkspacePath,
        [Parameter(Mandatory)][bool]$ApplyFixes
    )

    if (-not (Test-Path $FilePath)) {
        return
    }

    $script:ScannedFileCount++
    $content = Get-Content -Path $FilePath -Raw

    $replacements = @(
        @{
            Pattern = '"projectMemory\.serverPort"\s*:\s*3001'
            Replace = '"projectMemory.serverPort": 3459'
            Type    = 'stale-server-port'
            Message = 'projectMemory.serverPort uses legacy value 3001 (expected 3459 for supervisor-managed runtime).'
        },
        @{
            Pattern = '"projectMemory\.apiPort"\s*:\s*3001'
            Replace = '"projectMemory.apiPort": 3459'
            Type    = 'stale-api-port'
            Message = 'projectMemory.apiPort uses legacy value 3001.'
        },
        @{
            Pattern = '"projectMemory\.mcpPort"\s*:\s*3000'
            Replace = '"projectMemory.mcpPort": 3457'
            Type    = 'stale-mcp-port'
            Message = 'projectMemory.mcpPort uses legacy value 3000 (expected 3457 for supervisor proxy).'
        }
    )

    $updated = $content
    $hadPortFinding = $false
    $hasLegacyApiPortKey = $content -match '"projectMemory\.apiPort"\s*:'

    foreach ($rule in $replacements) {
        if ($content -match $rule.Pattern) {
            $hadPortFinding = $true
            Add-Finding -Type $rule.Type -WorkspaceId $WorkspaceId -WorkspacePath $WorkspacePath -FilePath $FilePath -Message $rule.Message
        }
    }

    if ($hasLegacyApiPortKey) {
        $hadPortFinding = $true
        Add-Finding -Type 'legacy-api-port-key' -WorkspaceId $WorkspaceId -WorkspacePath $WorkspacePath -FilePath $FilePath -Message 'projectMemory.apiPort is legacy; prefer projectMemory.serverPort.' -Severity 'info'
    }

    $applyPortFixes = $false
    if ($ApplyFixes -and $hadPortFinding) {
        $applyPortFixes = Request-PortMigrationApproval -FirstFilePath $FilePath

        if (-not $applyPortFixes -and -not $script:PortMigrationDeclinedRecorded) {
            Add-Finding -Type 'port-migration-skipped-by-user' -WorkspaceId $WorkspaceId -WorkspacePath $WorkspacePath -FilePath $FilePath -Message 'Port migration was declined by user. No port changes were applied.' -Severity 'info'
            $script:PortMigrationDeclinedRecorded = $true
        }
    }

    if ($applyPortFixes) {
        foreach ($rule in $replacements) {
            if ($updated -match $rule.Pattern) {
                $updated = [regex]::Replace($updated, $rule.Pattern, $rule.Replace)
            }
        }

        if ($hasLegacyApiPortKey) {
            $migrationResult = Try-MigrateLegacyApiPortKey -JsonText $updated
            if ($migrationResult.Success) {
                if ($migrationResult.Changed) {
                    $updated = [string]$migrationResult.UpdatedContent
                    Add-Finding -Type 'legacy-api-port-key-migrated' -WorkspaceId $WorkspaceId -WorkspacePath $WorkspacePath -FilePath $FilePath -Message 'Migrated projectMemory.apiPort to projectMemory.serverPort and removed legacy key.' -Severity 'info' -Fixed $true
                }
            } else {
                Add-Finding -Type 'legacy-api-port-migration-failed' -WorkspaceId $WorkspaceId -WorkspacePath $WorkspacePath -FilePath $FilePath -Message "Could not migrate legacy apiPort key automatically: $($migrationResult.Error)" -Severity 'warning'
            }
        }
    }

    if ($ApplyFixes -and $applyPortFixes -and $updated -ne $content) {
        Set-Content -Path $FilePath -Value $updated -NoNewline -Encoding UTF8
        $script:AppliedFixCount++
        Add-Finding -Type 'autofix-applied' -WorkspaceId $WorkspaceId -WorkspacePath $WorkspacePath -FilePath $FilePath -Message 'Applied approved Project Memory port migrations.' -Severity 'info' -Fixed $true
    }
}

function Ensure-WorkspaceIdentityFile {
    param(
        [Parameter(Mandatory)][string]$WorkspaceId,
        [Parameter(Mandatory)][string]$WorkspacePath,
        [Parameter(Mandatory)][string]$ResolvedDataRoot,
        [Parameter(Mandatory)][bool]$ApplyFixes
    )

    $identityDir = Join-Path $WorkspacePath '.projectmemory'
    $identityPath = Join-Path $identityDir 'identity.json'

    $nowIso = [DateTime]::UtcNow.ToString('o')

    if (-not (Test-Path $identityPath)) {
        Add-Finding -Type 'missing-identity-file' -WorkspaceId $WorkspaceId -WorkspacePath $WorkspacePath -FilePath $identityPath -Message 'Missing .projectmemory/identity.json for DB-registered workspace.'

        if ($ApplyFixes) {
            New-Item -ItemType Directory -Path $identityDir -Force | Out-Null
            $identity = [ordered]@{
                schema_version = '1.0.0'
                workspace_id   = $WorkspaceId
                workspace_path = $WorkspacePath
                data_root      = $ResolvedDataRoot
                created_at     = $nowIso
                updated_at     = $nowIso
            }
            $identity | ConvertTo-Json -Depth 4 | Set-Content -Path $identityPath -Encoding UTF8
            $script:AppliedFixCount++
            Add-Finding -Type 'identity-file-created' -WorkspaceId $WorkspaceId -WorkspacePath $WorkspacePath -FilePath $identityPath -Message 'Created missing workspace identity file.' -Severity 'info' -Fixed $true
        }

        return
    }

    try {
        $raw = Get-Content -Path $identityPath -Raw
        $identityObj = $raw | ConvertFrom-Json

        $needsRewrite = $false
        if ($identityObj.workspace_id -ne $WorkspaceId) {
            Add-Finding -Type 'identity-workspace-id-mismatch' -WorkspaceId $WorkspaceId -WorkspacePath $WorkspacePath -FilePath $identityPath -Message "identity.json workspace_id='$($identityObj.workspace_id)' does not match DB workspace_id='$WorkspaceId'."
            $needsRewrite = $true
        }

        if ($identityObj.workspace_path -ne $WorkspacePath) {
            Add-Finding -Type 'identity-workspace-path-mismatch' -WorkspaceId $WorkspaceId -WorkspacePath $WorkspacePath -FilePath $identityPath -Message "identity.json workspace_path='$($identityObj.workspace_path)' does not match DB path='$WorkspacePath'."
            $needsRewrite = $true
        }

        if ($ApplyFixes -and $needsRewrite) {
            $rewritten = [ordered]@{
                schema_version = if ($identityObj.schema_version) { [string]$identityObj.schema_version } else { '1.0.0' }
                workspace_id   = $WorkspaceId
                workspace_path = $WorkspacePath
                data_root      = if ($identityObj.data_root) { [string]$identityObj.data_root } else { $ResolvedDataRoot }
                created_at     = if ($identityObj.created_at) { [string]$identityObj.created_at } else { $nowIso }
                updated_at     = $nowIso
            }
            $rewritten | ConvertTo-Json -Depth 4 | Set-Content -Path $identityPath -Encoding UTF8
            $script:AppliedFixCount++
            Add-Finding -Type 'identity-file-updated' -WorkspaceId $WorkspaceId -WorkspacePath $WorkspacePath -FilePath $identityPath -Message 'Updated identity.json to match DB workspace record.' -Severity 'info' -Fixed $true
        }
    } catch {
        Add-Finding -Type 'identity-file-invalid-json' -WorkspaceId $WorkspaceId -WorkspacePath $WorkspacePath -FilePath $identityPath -Message "identity.json could not be parsed: $($_.Exception.Message)"
    }
}

function Scan-Workspace {
    param(
        [Parameter(Mandatory)][pscustomobject]$Workspace,
        [Parameter(Mandatory)][string]$ResolvedDataRoot,
        [Parameter(Mandatory)][bool]$ApplyFixes
    )

    $workspaceId = [string]$Workspace.id
    $workspacePath = [string]$Workspace.path

    if ([string]::IsNullOrWhiteSpace($workspacePath)) {
        Add-Finding -Type 'workspace-row-missing-path' -WorkspaceId $workspaceId -WorkspacePath '' -FilePath '' -Message 'Workspace row has empty path.'
        return
    }

    if (-not (Test-Path $workspacePath)) {
        Add-Finding -Type 'workspace-path-missing' -WorkspaceId $workspaceId -WorkspacePath $workspacePath -FilePath '' -Message 'Workspace path from DB does not exist on disk.'
        return
    }

    Ensure-WorkspaceIdentityFile -WorkspaceId $workspaceId -WorkspacePath $workspacePath -ResolvedDataRoot $ResolvedDataRoot -ApplyFixes:$ApplyFixes

    $settingsPath = Join-Path $workspacePath '.vscode\settings.json'
    Update-FileContentIfNeeded -FilePath $settingsPath -WorkspaceId $workspaceId -WorkspacePath $workspacePath -ApplyFixes:$ApplyFixes

    $workspaceFiles = @(Get-ChildItem -Path $workspacePath -Filter '*.code-workspace' -File -ErrorAction SilentlyContinue)
    foreach ($file in $workspaceFiles) {
        Update-FileContentIfNeeded -FilePath $file.FullName -WorkspaceId $workspaceId -WorkspacePath $workspacePath -ApplyFixes:$ApplyFixes
    }
}

# Main
$repoRoot = Split-Path -Parent $PSScriptRoot
$resolvedDataRoot = Resolve-DataRoot -ExplicitDataRoot $DataRoot
$dbPath = Join-Path $resolvedDataRoot 'project-memory.db'

Write-Section 'Project Memory Outdated Settings / Files Audit'
Write-Detail "Data root: $resolvedDataRoot"
Write-Detail "Database:  $dbPath"
Write-Detail "Apply fixes: $Apply"

if (-not (Test-Path $dbPath)) {
    Write-WarnLine "Database not found at $dbPath"
    Write-Host "Audit skipped. Build Server first or provide -DataRoot." -ForegroundColor Yellow
    exit 0
}

$workspaces = @()
try {
    $workspaces = @(Get-RegisteredWorkspacesFromDb -RepoRoot $repoRoot -DbPath $dbPath)
} catch {
    Write-WarnLine $_.Exception.Message
    Write-Host 'Audit skipped because workspaces could not be read from DB.' -ForegroundColor Yellow
    exit 0
}

Write-Detail "Registered workspaces from DB: $($workspaces.Count)"

foreach ($workspace in $workspaces) {
    Scan-Workspace -Workspace $workspace -ResolvedDataRoot $resolvedDataRoot -ApplyFixes:$Apply
}

Write-Section 'Summary'
Write-Host "  Workspace rows scanned: $($workspaces.Count)"
Write-Host "  Files scanned:          $script:ScannedFileCount"
Write-Host "  Findings:               $($script:Findings.Count)"
Write-Host "  Fixes applied:          $script:AppliedFixCount"

if ($script:Findings.Count -eq 0) {
    Write-Host 'No outdated settings or workspace-level file issues detected.' -ForegroundColor Green
    exit 0
}

$grouped = $script:Findings | Group-Object Type | Sort-Object Name
foreach ($group in $grouped) {
    Write-Host ("  - {0}: {1}" -f $group.Name, $group.Count)
}

Write-Host ''
Write-Host 'Detailed findings:' -ForegroundColor Cyan
foreach ($f in $script:Findings) {
    $scope = if ($f.WorkspacePath) { $f.WorkspacePath } else { '<no-workspace-path>' }
    $target = if ($f.FilePath) { $f.FilePath } else { '<n/a>' }
    Write-Host ("  [{0}] [{1}] {2}" -f $f.Severity.ToUpperInvariant(), $f.Type, $f.Message)
    Write-Host ("       workspace: {0}" -f $scope) -ForegroundColor DarkGray
    Write-Host ("       file:      {0}" -f $target) -ForegroundColor DarkGray
}

if (-not $Apply) {
    Write-Host ''
    Write-Host 'Run with -Apply to auto-fix safe remediations.' -ForegroundColor Yellow
}
