<#
.SYNOPSIS
    Detects outdated Project Memory settings and workspace files.

.DESCRIPTION
    Connects to the user's Project Memory SQLite DB (project-memory.db), reads
    registered workspaces from the workspaces table, and scans workspace-level
    files for stale settings or identity mismatches.

    Also reads canonical port values from supervisor.toml (or falls back to
    built-in defaults) and checks the global VS Code user settings
    (%APPDATA%\Code\User\settings.json) for projectMemory port values that
    don't match. This catches stale ports in global settings even when the
    workspace-level .vscode/settings.json is correct.

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
        [Parameter(Mandatory)][bool]$ApplyFixes,
        [Parameter(Mandatory)][hashtable]$CanonicalPorts
    )

    if (-not (Test-Path $FilePath)) {
        return
    }

    $script:ScannedFileCount++
    $content = Get-Content -Path $FilePath -Raw

    # Patterns match any value that isn't the canonical port so stale values
    # like 3000, 3001, 3467, etc. are all caught regardless of their origin.
    $mcpPort  = $CanonicalPorts.McpPort
    $dashPort = $CanonicalPorts.DashboardPort
    $replacements = @(
        @{
            Pattern = "`"projectMemory\.serverPort`"\s*:\s*(?!${dashPort}\b)\d+"
            Replace = "`"projectMemory.serverPort`": ${dashPort}"
            Type    = 'stale-server-port'
            Message = "projectMemory.serverPort is wrong (expected ${dashPort} for supervisor-managed runtime)."
        },
        @{
            Pattern = "`"projectMemory\.apiPort`"\s*:\s*(?!${dashPort}\b)\d+"
            Replace = "`"projectMemory.apiPort`": ${dashPort}"
            Type    = 'stale-api-port'
            Message = "projectMemory.apiPort is wrong (expected ${dashPort})."
        },
        @{
            Pattern = "`"projectMemory\.mcpPort`"\s*:\s*(?!${mcpPort}\b)\d+"
            Replace = "`"projectMemory.mcpPort`": ${mcpPort}"
            Type    = 'stale-mcp-port'
            Message = "projectMemory.mcpPort is wrong (expected ${mcpPort} for supervisor proxy)."
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
        [Parameter(Mandatory)][bool]$ApplyFixes,
        [Parameter(Mandatory)][hashtable]$CanonicalPorts
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
    Update-FileContentIfNeeded -FilePath $settingsPath -WorkspaceId $workspaceId -WorkspacePath $workspacePath -ApplyFixes:$ApplyFixes -CanonicalPorts $CanonicalPorts

    $workspaceFiles = @(Get-ChildItem -Path $workspacePath -Filter '*.code-workspace' -File -ErrorAction SilentlyContinue)
    foreach ($file in $workspaceFiles) {
        Update-FileContentIfNeeded -FilePath $file.FullName -WorkspaceId $workspaceId -WorkspacePath $workspacePath -ApplyFixes:$ApplyFixes -CanonicalPorts $CanonicalPorts
    }
}

function Get-CanonicalPorts {
    # Defaults mirror New-SupervisorToml in launch-supervisor.ps1
    $ports = @{
        McpPort       = 3457
        DashboardPort = 3459
    }

    $tomlPath = Join-Path $env:APPDATA 'ProjectMemory\supervisor.toml'
    if (-not (Test-Path $tomlPath)) {
        return $ports
    }

    try {
        $toml = Get-Content -Path $tomlPath -Raw
        # [^\[]* stops at the next section header, so we only read within [mcp]
        if ($toml -match '\[mcp\][^\[]*\bport\s*=\s*(\d+)') {
            $ports.McpPort = [int]$Matches[1]
        }
        if ($toml -match '\[dashboard\][^\[]*\bport\s*=\s*(\d+)') {
            $ports.DashboardPort = [int]$Matches[1]
        }
    } catch {
        Write-WarnLine "Could not read supervisor.toml for canonical ports; using defaults. Error: $($_.Exception.Message)"
    }

    return $ports
}

function Check-GlobalVscodeSettings {
    param(
        [Parameter(Mandatory)][hashtable]$CanonicalPorts,
        [Parameter(Mandatory)][bool]$ApplyFixes
    )

    if ([string]::IsNullOrWhiteSpace($env:APPDATA)) {
        return
    }

    $globalSettingsPath = Join-Path $env:APPDATA 'Code\User\settings.json'
    if (-not (Test-Path $globalSettingsPath)) {
        return
    }

    $script:ScannedFileCount++
    $content = Get-Content -Path $globalSettingsPath -Raw
    $hadFinding = $false

    # Check projectMemory.mcpPort — match any value that isn't the canonical port
    $mcpPattern = '"projectMemory\.mcpPort"\s*:\s*(\d+)'
    if ($content -match $mcpPattern) {
        $currentValue = [int]$Matches[1]
        if ($currentValue -ne $CanonicalPorts.McpPort) {
            $hadFinding = $true
            Add-Finding `
                -Type 'global-settings-stale-mcp-port' `
                -WorkspaceId '' `
                -WorkspacePath '<global-user-settings>' `
                -FilePath $globalSettingsPath `
                -Message "Global VS Code user settings: projectMemory.mcpPort is $currentValue but supervisor uses $($CanonicalPorts.McpPort). The extension will fail to connect." `
                -Severity 'warning'
        }
    }

    # Check projectMemory.serverPort — match any value that isn't the canonical port
    $serverPattern = '"projectMemory\.serverPort"\s*:\s*(\d+)'
    if ($content -match $serverPattern) {
        $currentValue = [int]$Matches[1]
        if ($currentValue -ne $CanonicalPorts.DashboardPort) {
            $hadFinding = $true
            Add-Finding `
                -Type 'global-settings-stale-server-port' `
                -WorkspaceId '' `
                -WorkspacePath '<global-user-settings>' `
                -FilePath $globalSettingsPath `
                -Message "Global VS Code user settings: projectMemory.serverPort is $currentValue but supervisor uses $($CanonicalPorts.DashboardPort)." `
                -Severity 'warning'
        }
    }

    # Check for legacy projectMemory.apiPort key
    $hasLegacyApiPort = $content -match '"projectMemory\.apiPort"\s*:'
    if ($hasLegacyApiPort) {
        $hadFinding = $true
        Add-Finding `
            -Type 'global-settings-legacy-api-port-key' `
            -WorkspaceId '' `
            -WorkspacePath '<global-user-settings>' `
            -FilePath $globalSettingsPath `
            -Message 'Global VS Code user settings: projectMemory.apiPort is legacy; prefer projectMemory.serverPort.' `
            -Severity 'info'
    }

    if (-not $hadFinding) {
        return
    }

    $applyFix = $false
    if ($ApplyFixes) {
        $applyFix = Request-PortMigrationApproval -FirstFilePath $globalSettingsPath
        if (-not $applyFix -and -not $script:PortMigrationDeclinedRecorded) {
            Add-Finding `
                -Type 'port-migration-skipped-by-user' `
                -WorkspaceId '' `
                -WorkspacePath '<global-user-settings>' `
                -FilePath $globalSettingsPath `
                -Message 'Port migration declined by user. No changes applied to global VS Code user settings.' `
                -Severity 'info'
            $script:PortMigrationDeclinedRecorded = $true
        }
    }

    if (-not $applyFix) {
        return
    }

    # Apply fixes with regex to preserve JSONC formatting and comments
    $updated = $content

    if ($content -match $mcpPattern -and [int]$Matches[1] -ne $CanonicalPorts.McpPort) {
        $updated = [regex]::Replace($updated, $mcpPattern, "`"projectMemory.mcpPort`": $($CanonicalPorts.McpPort)")
    }

    if ($content -match $serverPattern -and [int]$Matches[1] -ne $CanonicalPorts.DashboardPort) {
        $updated = [regex]::Replace($updated, $serverPattern, "`"projectMemory.serverPort`": $($CanonicalPorts.DashboardPort)")
    }

    if ($hasLegacyApiPort) {
        $migrationResult = Try-MigrateLegacyApiPortKey -JsonText $updated
        if ($migrationResult.Success -and $migrationResult.Changed) {
            $updated = [string]$migrationResult.UpdatedContent
            Add-Finding `
                -Type 'global-settings-legacy-api-port-migrated' `
                -WorkspaceId '' `
                -WorkspacePath '<global-user-settings>' `
                -FilePath $globalSettingsPath `
                -Message 'Migrated projectMemory.apiPort to projectMemory.serverPort in global VS Code user settings.' `
                -Severity 'info' `
                -Fixed $true
        } elseif (-not $migrationResult.Success) {
            Add-Finding `
                -Type 'global-settings-legacy-api-port-migration-failed' `
                -WorkspaceId '' `
                -WorkspacePath '<global-user-settings>' `
                -FilePath $globalSettingsPath `
                -Message "Could not auto-migrate legacy apiPort key in global settings (file may use JSONC): $($migrationResult.Error)" `
                -Severity 'info'
        }
    }

    if ($updated -ne $content) {
        Set-Content -Path $globalSettingsPath -Value $updated -NoNewline -Encoding UTF8
        $script:AppliedFixCount++
        Add-Finding `
            -Type 'global-settings-autofix-applied' `
            -WorkspaceId '' `
            -WorkspacePath '<global-user-settings>' `
            -FilePath $globalSettingsPath `
            -Message 'Applied port fixes to global VS Code user settings.' `
            -Severity 'info' `
            -Fixed $true
    }
}

function Check-GlobalMcpJson {
    param(
        [Parameter(Mandatory)][hashtable]$CanonicalPorts,
        [Parameter(Mandatory)][bool]$ApplyFixes
    )

    if ([string]::IsNullOrWhiteSpace($env:APPDATA)) {
        return
    }

    $mcpJsonPath = Join-Path $env:APPDATA 'Code\User\mcp.json'
    if (-not (Test-Path $mcpJsonPath)) {
        return
    }

    $script:ScannedFileCount++
    $content = Get-Content -Path $mcpJsonPath -Raw

    # Match the project-memory server URL to extract current port
    $urlPattern = '("project-memory"\s*:\s*\{[^}]*"url"\s*:\s*"http://localhost:)(\d+)(/mcp")'
    if (-not ($content -match $urlPattern)) {
        return
    }

    $currentPort = [int]$Matches[2]
    if ($currentPort -eq $CanonicalPorts.McpPort) {
        return
    }

    Add-Finding `
        -Type 'global-mcp-json-stale-port' `
        -WorkspaceId '' `
        -WorkspacePath '<global-mcp-config>' `
        -FilePath $mcpJsonPath `
        -Message "VS Code user mcp.json: project-memory URL uses port $currentPort but supervisor runs on $($CanonicalPorts.McpPort). VS Code built-in MCP client will fail to connect." `
        -Severity 'warning'

    if (-not $ApplyFixes) {
        return
    }

    $applyFix = Request-PortMigrationApproval -FirstFilePath $mcpJsonPath
    if (-not $applyFix) {
        if (-not $script:PortMigrationDeclinedRecorded) {
            Add-Finding `
                -Type 'port-migration-skipped-by-user' `
                -WorkspaceId '' `
                -WorkspacePath '<global-mcp-config>' `
                -FilePath $mcpJsonPath `
                -Message 'Port migration declined by user. No changes applied to VS Code user mcp.json.' `
                -Severity 'info'
            $script:PortMigrationDeclinedRecorded = $true
        }
        return
    }

    $updated = [regex]::Replace($content, $urlPattern, "`${1}$($CanonicalPorts.McpPort)`${3}")
    if ($updated -ne $content) {
        Set-Content -Path $mcpJsonPath -Value $updated -NoNewline -Encoding UTF8
        $script:AppliedFixCount++
        Add-Finding `
            -Type 'global-mcp-json-autofix-applied' `
            -WorkspaceId '' `
            -WorkspacePath '<global-mcp-config>' `
            -FilePath $mcpJsonPath `
            -Message "Updated project-memory URL in VS Code user mcp.json from port $currentPort to $($CanonicalPorts.McpPort)." `
            -Severity 'info' `
            -Fixed $true
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

Write-Section 'Global VS Code User Settings'
$canonicalPorts = Get-CanonicalPorts
$tomlPath = Join-Path $env:APPDATA 'ProjectMemory\supervisor.toml'
if (Test-Path $tomlPath) {
    Write-Detail "Ports read from: $tomlPath"
} else {
    Write-Detail 'supervisor.toml not found; using built-in defaults'
}
Write-Detail "Canonical MCP port:       $($canonicalPorts.McpPort)"
Write-Detail "Canonical dashboard port: $($canonicalPorts.DashboardPort)"
Check-GlobalVscodeSettings -CanonicalPorts $canonicalPorts -ApplyFixes:$Apply
Check-GlobalMcpJson -CanonicalPorts $canonicalPorts -ApplyFixes:$Apply

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
    Scan-Workspace -Workspace $workspace -ResolvedDataRoot $resolvedDataRoot -ApplyFixes:$Apply -CanonicalPorts $canonicalPorts
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
