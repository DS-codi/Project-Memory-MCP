#Requires -Version 5.1
<#
.SYNOPSIS
    Globally registers Project Memory MCP with Claude Code CLI.

.DESCRIPTION
    Makes Project Memory MCP tools and agent definitions available in every
    Claude Code CLI session, regardless of working directory. Safe to re-run
    -- all steps are idempotent.

    Steps performed:
      1. Copies mandatory agent files (Hub, PromptAnalyst, Shell, Architect)
         from agents/ to ~/.claude/agents/ so they are globally available.
      2. Registers the project-memory-cli MCP server in ~/.claude/settings.json
         so Claude Code connects to it in every session.
      3. Adds mcp__project-memory-cli__* tool permissions to the global allowlist.
      4. (Optional) Creates a Windows Task Scheduler entry to autostart the
         supervisor-iced binary at user login. Pass -SkipAutostart to skip.

.PARAMETER SkipAutostart
    Skip the Task Scheduler autostart registration step.

.PARAMETER Force
    Re-copy agent files even if the destination already matches the source.

.EXAMPLE
    .\scripts\install-global-claude.ps1

.EXAMPLE
    .\scripts\install-global-claude.ps1 -SkipAutostart
#>
param(
    [switch]$SkipAutostart,
    [switch]$Force
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot

# ── Helpers -------------------------------------------------------------------

function Write-Step ([string]$msg) { Write-Host "`n-- $msg" -ForegroundColor Cyan }
function Write-Ok   ([string]$msg) { Write-Host "   [ok] $msg" -ForegroundColor Green }
function Write-Skip ([string]$msg) { Write-Host "   [--] $msg" -ForegroundColor DarkGray }
function Write-Warn ([string]$msg) { Write-Host "   [!]  $msg" -ForegroundColor Yellow }
function Write-Fail ([string]$msg) { Write-Host "   [x]  $msg" -ForegroundColor Red }

function Read-JsonFile ([string]$Path) {
    $raw = Get-Content -Path $Path -Raw -Encoding UTF8
    return $raw | ConvertFrom-Json
}

function Write-JsonFile ([string]$Path, [object]$Data) {
    $json = $Data | ConvertTo-Json -Depth 20
    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($Path, $json, $utf8NoBom)
}

# ── Paths ---------------------------------------------------------------------

$ClaudeDir    = Join-Path $env:USERPROFILE '.claude'
$AgentsDir    = Join-Path $ClaudeDir 'agents'
$SettingsPath = Join-Path $ClaudeDir 'settings.json'
$SourceAgentsDir = Join-Path $Root 'agents'

$McpServerName = 'project-memory-cli'
$McpServerUrl  = 'http://127.0.0.1:3466/mcp'

$AllowlistTools = @(
    'mcp__project-memory-cli__memory_agent',
    'mcp__project-memory-cli__memory_plan',
    'mcp__project-memory-cli__memory_session',
    'mcp__project-memory-cli__memory_filesystem',
    'mcp__project-memory-cli__memory_steps',
    'mcp__project-memory-cli__memory_workspace',
    'mcp__project-memory-cli__memory_context',
    'mcp__project-memory-cli__memory_cartographer',
    'mcp__project-memory-cli__memory_brainstorm',
    'mcp__project-memory-cli__memory_instructions',
    'mcp__project-memory-cli__memory_sprint',
    'mcp__project-memory-cli__memory_terminal',
    'mcp__project-memory-cli__memory_task'
)

$AgentFiles = @(
    'hub.agent.md',
    'prompt-analyst.agent.md',
    'shell.agent.md',
    'architect.agent.md'
)

$SupervisorExeRelease = Join-Path $Root 'target\release\supervisor-iced.exe'
$SupervisorExeDebug   = Join-Path $Root 'supervisor-iced\target\debug\supervisor-iced.exe'
$TaskName = 'ProjectMemorySupervisor'

# ── Banner --------------------------------------------------------------------

Write-Host ""
Write-Host "Project Memory MCP -- Global Claude Code Install" -ForegroundColor Magenta
Write-Host "  Project root : $Root" -ForegroundColor DarkGray
Write-Host "  Claude dir   : $ClaudeDir" -ForegroundColor DarkGray
Write-Host "  Autostart    : $(-not $SkipAutostart)" -ForegroundColor DarkGray

# ── Step 1: Copy agent files to ~/.claude/agents/ ----------------------------

Write-Step "Agent Files -> ~/.claude/agents/"

if (-not (Test-Path $SourceAgentsDir)) {
    Write-Fail "Source agents directory not found: $SourceAgentsDir"
    exit 1
}

if (-not (Test-Path $AgentsDir)) {
    New-Item -ItemType Directory -Path $AgentsDir -Force | Out-Null
    Write-Ok "Created $AgentsDir"
}

$copied  = 0
$skipped = 0

foreach ($file in $AgentFiles) {
    $src = Join-Path $SourceAgentsDir $file
    $dst = Join-Path $AgentsDir $file

    if (-not (Test-Path $src)) {
        Write-Warn "Source file missing, skipping: $file"
        continue
    }

    $srcContent = [System.IO.File]::ReadAllText($src)
    $dstContent = if (Test-Path $dst) { [System.IO.File]::ReadAllText($dst) } else { $null }
    $needsCopy  = $Force -or ($srcContent -ne $dstContent)

    if ($needsCopy) {
        Copy-Item -Path $src -Destination $dst -Force
        Write-Ok "Copied $file"
        $copied++
    } else {
        Write-Skip "$file (already up to date)"
        $skipped++
    }
}

Write-Host "   $copied copied, $skipped already up to date" -ForegroundColor DarkGray

# ── Step 2: Register MCP server in ~/.claude/settings.json -------------------

Write-Step "MCP Server Registration -> ~/.claude/settings.json"

if (-not (Test-Path $SettingsPath)) {
    Write-Warn "settings.json not found -- creating minimal file"
    $minimal = [PSCustomObject]@{ permissions = [PSCustomObject]@{ allow = @() } }
    Write-JsonFile $SettingsPath $minimal
}

$settings = Read-JsonFile $SettingsPath

if (-not ($settings.PSObject.Properties.Name -contains 'mcpServers')) {
    $settings | Add-Member -NotePropertyName 'mcpServers' -NotePropertyValue ([PSCustomObject]@{})
}

$existing = $settings.mcpServers.PSObject.Properties[$McpServerName]
if ($existing -and $existing.Value.url -eq $McpServerUrl) {
    Write-Skip "$McpServerName already registered at $McpServerUrl"
} else {
    $serverEntry = [PSCustomObject]@{ type = 'http'; url = $McpServerUrl }
    $settings.mcpServers | Add-Member -NotePropertyName $McpServerName -NotePropertyValue $serverEntry -Force
    Write-JsonFile $SettingsPath $settings
    Write-Ok "Registered $McpServerName -> $McpServerUrl"
}

# ── Step 3: Add MCP tool permissions to allowlist ----------------------------

Write-Step "MCP Tool Allowlist -> ~/.claude/settings.json"

$settings = Read-JsonFile $SettingsPath

if (-not ($settings.PSObject.Properties.Name -contains 'permissions')) {
    $settings | Add-Member -NotePropertyName 'permissions' -NotePropertyValue ([PSCustomObject]@{ allow = @() })
}
if (-not ($settings.permissions.PSObject.Properties.Name -contains 'allow')) {
    $settings.permissions | Add-Member -NotePropertyName 'allow' -NotePropertyValue @()
}

$currentAllow = [System.Collections.Generic.List[string]]@($settings.permissions.allow)
$added = 0

foreach ($tool in $AllowlistTools) {
    if (-not $currentAllow.Contains($tool)) {
        $currentAllow.Add($tool)
        $added++
    }
}

if ($added -gt 0) {
    $settings.permissions.allow = $currentAllow.ToArray()
    Write-JsonFile $SettingsPath $settings
    Write-Ok "Added $added tool permission(s) to allowlist"
} else {
    Write-Skip "All $($AllowlistTools.Count) tool permissions already present"
}

# ── Step 4: Windows Task Scheduler autostart ---------------------------------

if ($SkipAutostart) {
    Write-Step "Autostart (skipped by -SkipAutostart)"
    Write-Skip "Task Scheduler registration skipped"
} else {
    Write-Step "Autostart -> Task Scheduler ($TaskName)"

    $exeToRegister = $null
    if (Test-Path $SupervisorExeRelease) {
        $exeToRegister = $SupervisorExeRelease
        Write-Host "   Using release build: $SupervisorExeRelease" -ForegroundColor DarkGray
    } elseif (Test-Path $SupervisorExeDebug) {
        $exeToRegister = $SupervisorExeDebug
        Write-Warn "Release build not found -- using debug build"
        Write-Warn "Run .\scripts\cli-build-supervisor-iced.ps1 for a production build"
    } else {
        Write-Warn "supervisor-iced.exe not found at expected paths:"
        Write-Warn "  Release : $SupervisorExeRelease"
        Write-Warn "  Debug   : $SupervisorExeDebug"
        Write-Warn "Build first with: .\scripts\cli-build-supervisor-iced.ps1"
        Write-Warn "Skipping autostart registration -- re-run after building."
    }

    if ($null -ne $exeToRegister) {
        $existingTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
        $needsRegister = $true

        if ($existingTask) {
            $existingExe = $existingTask.Actions[0].Execute
            if ($existingExe -eq $exeToRegister) {
                Write-Skip "Task '$TaskName' already registered -> $exeToRegister"
                $needsRegister = $false
            } else {
                Write-Host "   Updating task (path changed)" -ForegroundColor DarkGray
                Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
            }
        }

        if ($needsRegister) {
            try {
                $action      = New-ScheduledTaskAction -Execute $exeToRegister -WorkingDirectory (Split-Path $exeToRegister)
                $trigger     = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
                $taskSettings = New-ScheduledTaskSettingsSet `
                    -ExecutionTimeLimit (New-TimeSpan -Hours 0) `
                    -RestartCount 3 `
                    -RestartInterval (New-TimeSpan -Minutes 1) `
                    -StartWhenAvailable

                Register-ScheduledTask `
                    -TaskName $TaskName `
                    -Action $action `
                    -Trigger $trigger `
                    -Settings $taskSettings `
                    -RunLevel Limited `
                    -Force | Out-Null

                Write-Ok "Task '$TaskName' registered -- supervisor-iced will start at login"
                Write-Host "   Exe: $exeToRegister" -ForegroundColor DarkGray
            } catch {
                Write-Warn "Failed to register scheduled task: $($_.Exception.Message)"
                Write-Warn "Re-run as Administrator if permission is required."
            }
        }
    }
}

# ── Summary ------------------------------------------------------------------

Write-Host ""
Write-Host "Global install complete." -ForegroundColor Magenta
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Ensure supervisor-iced is running (it serves the MCP on port 3466):"
Write-Host "     Release build: .\scripts\cli-build-supervisor-iced.ps1  (builds release)"
Write-Host "     Then launch:   .\target\release\supervisor-iced.exe"
Write-Host "  2. Open a new Claude Code session in any directory -- the"
Write-Host "     project-memory-cli MCP tools and Hub/PromptAnalyst/Shell/Architect"
Write-Host "     agents will be available in every session."
Write-Host ""
