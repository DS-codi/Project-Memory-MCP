#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Install script for Project Memory MCP components.

.DESCRIPTION
    Builds and installs one or more components of the Project Memory MCP system.
    Components: Supervisor, GuiForms, InteractiveTerminal, Server, FallbackServer,
    Dashboard, Extension, Container.

.PARAMETER Component
    Which component(s) to build and install. Accepts an array.
    Valid values: Supervisor, GuiForms, InteractiveTerminal, Server,
    FallbackServer, Dashboard, Extension, Container, All
    Default: All

.PARAMETER InstallOnly
    For the Extension component: skip the build/package step and install the
    most recently generated .vsix file directly.

.PARAMETER SkipInstall
    Build and package only — do not call `code --install-extension`.

.PARAMETER Force
    Pass --force to `code --install-extension` (reinstall even if version matches).

.PARAMETER NoBuild
    Alias for -InstallOnly (kept for back-compat with build-and-install.ps1 usage).

.PARAMETER NoLaunchPrompt
    Suppress the final optional "launch supervisor now" prompt.

.PARAMETER LintVerbose
    Print all qmllint output during QML pre-build validation, not just errors.

.PARAMETER LintLog
    Optional path to a file where qmllint output is appended (one entry per validated package).

.PARAMETER SkipOutdatedAudit
    Skip the post-install audit that checks for outdated Project Memory settings
    and workspace-level files based on project-memory.db registrations.

.PARAMETER ApplyOutdatedAuditFixes
    Apply safe fixes during the post-install outdated audit (for example stale
    port values and missing/mismatched .projectmemory/identity.json files).
    Port migrations are confirmation-gated and require user approval before write.

.EXAMPLE
    # Build and install everything
    .\install.ps1

.EXAMPLE
    # Build and install only the VS Code extension
    .\install.ps1 -Component Extension

.EXAMPLE
    # Build only the server (no extension or container)
    .\install.ps1 -Component Server

.EXAMPLE
    # Install the already-packaged extension without rebuilding
    .\install.ps1 -Component Extension -InstallOnly

.EXAMPLE
    # Build server + extension, skip container
    .\install.ps1 -Component Server, Extension

.EXAMPLE
    # Full build but do not install extension (package only)
    .\install.ps1 -Component Extension -SkipInstall

.EXAMPLE
    # Rebuild with a fresh database (archives the existing one)
    .\install.ps1 -NewDatabase

.EXAMPLE
    # Fresh database + server only
    .\install.ps1 -Component Server -NewDatabase

.EXAMPLE
    # Build only the fallback REST server entrypoint
    .\install.ps1 -Component FallbackServer
#>

[CmdletBinding()]
param(
    [ValidateSet("Server", "FallbackServer", "Extension", "Container", "Supervisor", "InteractiveTerminal", "Dashboard", "GuiForms", "InstallWizard", "All", "--help")]
    [string[]]$Component = @("All"),

    [switch]$InstallOnly,
    [switch]$SkipInstall,
    [switch]$Force,
    [switch]$NoBuild,  # alias for InstallOnly
    [switch]$NewDatabase,  # archive old DB and create a fresh one
    [switch]$NoLaunchPrompt,  # suppress interactive launch prompt (for subprocess callers)
    [switch]$LintVerbose,     # print all qmllint output, not just errors
    [string]$LintLog = '',    # append qmllint output to this log file (optional)
    [switch]$SkipOutdatedAudit,
    [switch]$ApplyOutdatedAuditFixes,
    [Alias('h')]
    [switch]$Help,
    [string[]]$RemainingArgs
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$script:CurrentComponent = 'General'
$script:InstallStatusVisible = $false
$script:InstallAnimTick = 0
$script:InstallStatusLastWidth = 0
$script:WarningMessages = [System.Collections.Generic.List[string]]::new()

function Show-HelpBanner {
    if (-not (Get-Variable -Scope Script -Name InstallAnimTick -ErrorAction SilentlyContinue)) {
        $script:InstallAnimTick = 0
    }

    $title = "Project Memory MCP — Install (Animated)"
    $banner = @(
        "    ____             _           __     __  ___                              ",
        "   / __ \_________  (_)__  _____/ /_   /  |/  /___  ____ ___  ____  _______  __",
        "  / /_/ / ___/ __ \/ / _ \/ ___/ __/  / /|_/ / _ \/ __ `__ \/ __ \/ ___/ / / /",
        " / ____/ /  / /_/ / /  __/ /__/ /_   / /  / /  __/ / / / / / /_/ / /  / /_/ / ",
        "/_/   /_/   \____/ /\___/\___/\__/  /_/  /_/\___/_/ /_/ /_/\____/_/   \__, /  ",
        "              /___/                                                  /____/   "
    )

    $frames = @('◜', '◠', '◝', '◞', '◡', '◟')
    $baseColor = 'DarkCyan'
    $highlight0 = 'White'
    $highlight1 = 'Cyan'
    $highlight2 = 'DarkCyan'

    $maxWidth = ($banner | ForEach-Object { $_.Length } | Measure-Object -Maximum).Maximum
    $titleRow = 0
    $promptRow = 1
    $bannerStartRow = 3
    $lastScanPos = -1

    [console]::CursorVisible = $false
    try {
        Clear-Host

        [console]::SetCursorPosition(0, $promptRow)
        Write-Host "Press ENTER to continue..." -ForegroundColor DarkGray

        for ($row = 0; $row -lt $banner.Count; $row++) {
            $line = $banner[$row]
            [console]::SetCursorPosition(0, $bannerStartRow + $row)
            for ($col = 0; $col -lt $line.Length; $col++) {
                Write-Host $line[$col] -NoNewline -ForegroundColor $baseColor
            }
        }

        while ($true) {
            if ([console]::KeyAvailable) {
                $key = [console]::ReadKey($true)
                if ($key.Key -eq 'Enter') {
                    break
                }
            }

            $tick = $script:InstallAnimTick

            $titleChars = $title.ToCharArray()
            for ($i = 0; $i -lt $titleChars.Length; $i++) {
                if ([char]::IsLetter($titleChars[$i])) {
                    $wave = [math]::Sin(($tick * 0.5) + ($i * 0.7))
                    $titleChars[$i] = if ($wave -ge 0) { [char]::ToUpperInvariant($titleChars[$i]) } else { [char]::ToLowerInvariant($titleChars[$i]) }
                }
            }

            [console]::SetCursorPosition(0, $titleRow)
            $titleFrame = $frames[$tick % $frames.Count]
            $scanTitlePos = ($tick * 2) % [math]::Max(1, $titleChars.Length)
            Write-Host "$titleFrame " -NoNewline -ForegroundColor Magenta
            for ($i = 0; $i -lt $titleChars.Length; $i++) {
                $d = [math]::Abs($i - $scanTitlePos)
                $tColor = if ($d -eq 0) { $highlight0 } elseif ($d -eq 1) { $highlight1 } elseif ($d -le 3) { $highlight2 } else { 'Magenta' }
                Write-Host $titleChars[$i] -NoNewline -ForegroundColor $tColor
            }
            Write-Host "  " -NoNewline

            $scanPos = $tick % [math]::Max(1, $maxWidth)

            if ($lastScanPos -ge 0) {
                for ($row = 0; $row -lt $banner.Count; $row++) {
                    $line = $banner[$row]
                    if ($lastScanPos -lt $line.Length) {
                        $ch = $line[$lastScanPos]
                        if ($ch -ne ' ') {
                            [console]::SetCursorPosition($lastScanPos, $bannerStartRow + $row)
                            Write-Host $ch -NoNewline -ForegroundColor $baseColor
                        }
                    }
                }
            }

            for ($row = 0; $row -lt $banner.Count; $row++) {
                $line = $banner[$row]
                for ($offset = -2; $offset -le 2; $offset++) {
                    $col = $scanPos + $offset
                    if ($col -lt 0 -or $col -ge $line.Length) { continue }

                    $ch = $line[$col]
                    if ($ch -eq ' ') { continue }

                    $color = if ($offset -eq 0) { $highlight0 } elseif ([math]::Abs($offset) -eq 1) { $highlight1 } else { $highlight2 }
                    [console]::SetCursorPosition($col, $bannerStartRow + $row)
                    Write-Host $ch -NoNewline -ForegroundColor $color
                }
            }

            $lastScanPos = $scanPos
            $script:InstallAnimTick = $script:InstallAnimTick + 1
            Start-Sleep -Milliseconds 70
        }
    } finally {
        [console]::CursorVisible = $true
        Clear-Host
    }
}

function Show-InstallHelp {
    Show-HelpBanner
    Write-Host ""
    Write-Host "Usage:" -ForegroundColor Cyan
    Write-Host "  .\install-animated.ps1 [-Component <list>] [-InstallOnly] [-SkipInstall] [-Force] [-NoBuild] [-NewDatabase] [-SkipOutdatedAudit] [-ApplyOutdatedAuditFixes] [-h|-Help|--help]"
    Write-Host ""
    Write-Host "Components:" -ForegroundColor Cyan
    Write-Host "  Supervisor, GuiForms, InteractiveTerminal, Server, FallbackServer, Dashboard, Extension, Container, All"
    Write-Host ""
    Write-Host "Flags:" -ForegroundColor Cyan
    Write-Host "  -InstallOnly   Extension only: install latest .vsix without rebuilding"
    Write-Host "  -SkipInstall   Extension only: build/package but skip code --install-extension"
    Write-Host "  -Force         Pass --force for extension install; use --no-cache for container build"
    Write-Host "  -NoBuild       Alias for -InstallOnly"
    Write-Host "  -NewDatabase   Archive existing SQLite DB and create a fresh one during server setup"
    Write-Host "  -NoLaunchPrompt  Suppress final supervisor launch prompt"
    Write-Host "  -LintVerbose   Print all qmllint output during QML pre-build validation (default: errors only)"
    Write-Host "  -LintLog <path>  Append qmllint output to a log file"
    Write-Host "  -SkipOutdatedAudit  Skip post-install outdated settings/files audit"
    Write-Host "  -ApplyOutdatedAuditFixes  Apply safe fixes in the post-install outdated audit"
    Write-Host "  -h, -Help      Show this help message"
    Write-Host "  --help         Also accepted"
}

function Show-Banner {
    $banner = @(
        "    ____             _           __     __  ___                              ",
        "   / __ \_________  (_)__  _____/ /_   /  |/  /___  ____ ___  ____  _______  __",
        "  / /_/ / ___/ __ \/ / _ \/ ___/ __/  / /|_/ / _ \/ __ `__ \/ __ \/ ___/ / / /",
        " / ____/ /  / /_/ / /  __/ /__/ /_   / /  / /  __/ / / / / / /_/ / /  / /_/ / ",
        "/_/   /_/   \____/ /\___/\___/\__/  /_/  /_/\___/_/ /_/ /_/\____/_/   \__, /  ",
        "              /___/                                                  /____/   "
    )

    $baseColor = 'DarkCyan'
    $highlight0 = 'White'
    $highlight1 = 'Cyan'
    $highlight2 = 'DarkCyan'
    $maxWidth = ($banner | ForEach-Object { $_.Length } | Measure-Object -Maximum).Maximum
    $bannerStartRow = 0
    $lastScanPos = -1

    Clear-Host
    [console]::CursorVisible = $false
    try {
        for ($row = 0; $row -lt $banner.Count; $row++) {
            [console]::SetCursorPosition(0, $bannerStartRow + $row)
            $line = $banner[$row]
            for ($col = 0; $col -lt $line.Length; $col++) {
                Write-Host $line[$col] -NoNewline -ForegroundColor $baseColor
            }
        }

        for ($scanPos = 0; $scanPos -lt $maxWidth; $scanPos++) {
            if ($lastScanPos -ge 0) {
                for ($row = 0; $row -lt $banner.Count; $row++) {
                    $line = $banner[$row]
                    if ($lastScanPos -lt $line.Length) {
                        $ch = $line[$lastScanPos]
                        if ($ch -ne ' ') {
                            [console]::SetCursorPosition($lastScanPos, $bannerStartRow + $row)
                            Write-Host $ch -NoNewline -ForegroundColor $baseColor
                        }
                    }
                }
            }

            for ($row = 0; $row -lt $banner.Count; $row++) {
                $line = $banner[$row]
                for ($offset = -2; $offset -le 2; $offset++) {
                    $col = $scanPos + $offset
                    if ($col -lt 0 -or $col -ge $line.Length) { continue }

                    $ch = $line[$col]
                    if ($ch -eq ' ') { continue }

                    $color = if ($offset -eq 0) { $highlight0 } elseif ([math]::Abs($offset) -eq 1) { $highlight1 } else { $highlight2 }
                    [console]::SetCursorPosition($col, $bannerStartRow + $row)
                    Write-Host $ch -NoNewline -ForegroundColor $color
                }
            }

            $lastScanPos = $scanPos
            Start-Sleep -Milliseconds 16
        }
    } finally {
        [console]::CursorVisible = $true
    }

    [console]::SetCursorPosition(0, $bannerStartRow + $banner.Count)
    Write-Host "=========================================================================" -ForegroundColor DarkGray
    Write-Host " Initializing..." -ForegroundColor Green
    Write-Host ""
}

if ($Help -or ($RemainingArgs -contains '--help') -or ($Component -contains '--help')) {
    Show-InstallHelp
    exit 0
}

# Resolve root relative to this script's location
$Root = $PSScriptRoot

# Normalise component list
if ($Component -contains "All") {
    $Components = @("Supervisor", "GuiForms", "InteractiveTerminal", "Server", "Dashboard", "Extension")
} else {
    $Components = $Component
}

$EffectiveInstallOnly = $InstallOnly -or $NoBuild

$CanonicalInstallScript = Join-Path $Root 'install.ps1'
if (-not (Test-Path $CanonicalInstallScript)) {
    Write-Error "Canonical installer not found at $CanonicalInstallScript"
    exit 1
}

# ──────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────

# Returns the flag arguments to forward to install.ps1 based on current params.
function Get-InstallFlags {
    $flags = [System.Collections.Generic.List[string]]::new()
    if ($InstallOnly)  { [void]$flags.Add('-InstallOnly') }
    if ($SkipInstall)  { [void]$flags.Add('-SkipInstall') }
    if ($Force)        { [void]$flags.Add('-Force') }
    if ($NoBuild)      { [void]$flags.Add('-NoBuild') }
    if ($NewDatabase)  { [void]$flags.Add('-NewDatabase') }
    if ($LintVerbose)  { [void]$flags.Add('-LintVerbose') }
    if ($LintLog)      { [void]$flags.Add('-LintLog'); [void]$flags.Add($LintLog) }
    if ($ApplyOutdatedAuditFixes) { [void]$flags.Add('-ApplyOutdatedAuditFixes') }
    # install-animated delegates component-by-component; suppress nested audit and run once at end.
    [void]$flags.Add('-SkipOutdatedAudit')
    # Avoid nested launch prompts when delegating to canonical installer.
    [void]$flags.Add('-NoLaunchPrompt')
    return $flags.ToArray()
}

function Write-Step([string]$msg) {
    Reset-InstallStatusLine
    Write-Host "`n── $msg" -ForegroundColor Cyan
}

function Write-Ok([string]$msg) {
    Reset-InstallStatusLine
    Write-Host "   ✓ $msg" -ForegroundColor Green
}

function Write-Fail([string]$msg) {
    Reset-InstallStatusLine
    Write-Host "   ✗ $msg" -ForegroundColor Red
}

function Write-Warn([string]$msg) {
    Reset-InstallStatusLine
    Write-Host "   ⚠ $msg" -ForegroundColor Yellow
}

function Invoke-OutdatedSettingsAudit {
    param(
        [switch]$ApplyFixes
    )

    $auditScript = Join-Path $Root 'scripts\audit-outdated-settings-and-files.ps1'
    if (-not (Test-Path $auditScript)) {
        Write-Warn "Outdated settings/files audit script not found: $auditScript"
        return
    }

    Write-Step "Outdated Settings and Workspace File Audit"

    try {
        if ($ApplyFixes) {
            & $auditScript -Apply
        } else {
            & $auditScript
        }
    } catch {
        Write-Warn "Audit script error: $($_.Exception.Message)"
        return
    }

    if ($LASTEXITCODE -ne 0) {
        Write-Warn "Audit script exited with code $LASTEXITCODE"
    } else {
        Write-Ok "Outdated settings/files audit completed"
    }
}

function Set-CurrentComponent([string]$Name) {
    $script:CurrentComponent = $Name
}

function Add-WarningsFromLines {
    param(
        [string[]]$Lines,
        [string]$Source = ''
    )

    foreach ($line in @($Lines)) {
        if ([string]::IsNullOrWhiteSpace($line)) { continue }
        $trimmed = $line.Trim()
        if ($trimmed -match '(?i)^warning[:\[]|\bwarning\b') {
            $entry = if ([string]::IsNullOrWhiteSpace($Source)) { $trimmed } else { "[$Source] $trimmed" }
            if (-not $script:WarningMessages.Contains($entry)) {
                $script:WarningMessages.Add($entry)
            }
        }
    }
}

function Set-AnimationCursorHidden([bool]$Hidden) {
    try {
        [console]::CursorVisible = -not $Hidden
    } catch {
        # Ignore environments where cursor visibility cannot be changed.
    }
}

function Reset-InstallStatusLine {
    if ($script:InstallStatusVisible) {
        Write-Host ""
        $script:InstallStatusVisible = $false
        $script:InstallStatusLastWidth = 0
    }
    Set-AnimationCursorHidden -Hidden $false
}

function Get-AnimatedText {
    param(
        [Parameter(Mandatory)][string]$Text,
        [Parameter(Mandatory)][string]$Style,
        [int]$Tick
    )

    if ([string]::IsNullOrWhiteSpace($Text)) {
        return $Text
    }

    switch ($Style) {
        'Wave' {
            $chars = $Text.ToCharArray()
            for ($j = 0; $j -lt $chars.Length; $j++) {
                if ([char]::IsLetter($chars[$j])) {
                    $wave = [math]::Sin(($Tick * 0.55) + ($j * 0.8))
                    $chars[$j] = if ($wave -ge 0) { [char]::ToUpperInvariant($chars[$j]) } else { [char]::ToLowerInvariant($chars[$j]) }
                }
            }
            return -join $chars
        }
        'Pulse' {
            $chars = $Text.ToCharArray()
            for ($j = 0; $j -lt $chars.Length; $j++) {
                if ([char]::IsLetter($chars[$j])) {
                    $pulse = [math]::Sin(($Tick * 0.35) + ($j * 0.45))
                    $chars[$j] = if ($pulse -ge 0) { [char]::ToUpperInvariant($chars[$j]) } else { [char]::ToLowerInvariant($chars[$j]) }
                }
            }
            return -join $chars
        }
        default {
            $chars = $Text.ToCharArray()
            if ($chars.Length -eq 0) { return $Text }
            $pos = $Tick % $chars.Length
            $chars[$pos] = [char]::ToUpperInvariant($chars[$pos])
            return -join $chars
        }
    }
}

function Write-InstallStatus {
    param(
        [string]$Stage,
        [int]$Warnings = 0,
        [int]$QmlImports = 0,
        [string]$Style = 'Scanner'
    )

    $frames = @('◜', '◠', '◝', '◞', '◡', '◟')
    $tick = $script:InstallAnimTick
    $frame = $frames[$tick % $frames.Count]
    $animatedStage = Get-AnimatedText -Text $Stage -Style $Style -Tick $tick
    $warningsLabel = if ($Warnings -le 0) { 'no' } else { "$Warnings" }

    $dotStep = $tick % 8
    $dotCount = if ($dotStep -le 4) { $dotStep + 1 } else { 9 - $dotStep }
    $dotTrail = '.' * $dotCount
    $linePrefix = "   $frame [$($script:CurrentComponent)] | qml imports: $QmlImports | warnings: $warningsLabel | "
    $lineTail = "$animatedStage$dotTrail"
    $line = "$linePrefix$lineTail"

    $maxWidth = [Math]::Max($script:InstallStatusLastWidth, $line.Length)
    $tailLength = [Math]::Max(1, $lineTail.Length)
    $scanPosInTail = $tick % $tailLength
    $tailStartIndex = $linePrefix.Length

    Set-AnimationCursorHidden -Hidden $true
    Write-Host "`r" -NoNewline
    for ($index = 0; $index -lt $maxWidth; $index++) {
        $char = if ($index -lt $line.Length) { $line[$index] } else { ' ' }

        if ($index -ge $line.Length) {
            Write-Host $char -NoNewline
            continue
        }

        if ($index -lt $tailStartIndex) {
            Write-Host $char -NoNewline -ForegroundColor DarkCyan
            continue
        }

        $tailIndex = $index - $tailStartIndex
        $distance = [Math]::Abs($tailIndex - $scanPosInTail)
        $color = if     ($distance -eq 0) { 'White' }
                 elseif ($distance -eq 1) { 'Cyan' }
                 elseif ($distance -le 3) { 'DarkCyan' }
                 else                     { 'Blue' }

        Write-Host $char -NoNewline -ForegroundColor $color
    }

    $script:InstallStatusLastWidth = $line.Length
    $script:InstallAnimTick = $script:InstallAnimTick + 1
    $script:InstallStatusVisible = $true
}

function Stop-SupervisorRuntimeProcesses {
    param(
        [string]$WorkspaceRoot
    )

    Write-Host "   Stopping Supervisor runtime processes (full teardown)..." -ForegroundColor Yellow

    $workspaceNeedle = $WorkspaceRoot.ToLowerInvariant() -replace '/', '\\'
    $targets = [System.Collections.Generic.List[object]]::new()

    $all = @(Get-CimInstance -ClassName Win32_Process -ErrorAction SilentlyContinue)
    foreach ($proc in $all) {
        $name = [string]$proc.Name
        $processId = [int]$proc.ProcessId
        $cmd = [string]$proc.CommandLine

        if (-not $name) { continue }

        $nameLower = $name.ToLowerInvariant()
        $cmdLower  = if ($cmd) { $cmd.ToLowerInvariant() -replace '/', '\\' } else { '' }
        $isMatch   = $false

        if ($nameLower -in @('supervisor.exe', 'supervisor', 'interactive-terminal.exe', 'interactive-terminal', 'pm-approval-gui.exe', 'pm-approval-gui', 'pm-brainstorm-gui.exe', 'pm-brainstorm-gui')) {
            $isMatch = $true
        } elseif ($nameLower -in @('node.exe', 'node', 'npx.exe', 'npx', 'vite.exe', 'vite')) {
            if ($cmdLower -and $cmdLower.Contains($workspaceNeedle)) {
                $isMatch = $true
            }
        }

        if ($isMatch) {
            $targets.Add([pscustomobject]@{ Name = $name; PID = $processId; CommandLine = $cmd })
        }
    }

    $uniqueTargets = @($targets | Sort-Object PID -Unique)
    if ($uniqueTargets.Count -eq 0) {
        Write-Host "   (no matching runtime processes found)" -ForegroundColor DarkGray
        return
    }

    foreach ($t in $uniqueTargets) {
        try {
            Stop-Process -Id $t.PID -Force -ErrorAction Stop
            Write-Host "   ✓ Stopped $($t.Name) (PID $($t.PID))" -ForegroundColor Green
        } catch {
            Write-Host "   ⚠ Could not stop $($t.Name) (PID $($t.PID)): $($_.Exception.Message)" -ForegroundColor Yellow
        }
    }

    Start-Sleep -Milliseconds 900
}

function Invoke-CheckedCommand {
    param(
        [Parameter(Mandatory)][string]$Description,
        [Parameter(Mandatory)][string]$FilePath,
        [string[]]$Arguments = @(),
        [string]$WorkingDirectory = $Root,
        [string]$Stage = 'installing',
        [string]$Style = 'Pulse'
    )

    $stdoutFile = [System.IO.Path]::GetTempFileName()
    $stderrFile = [System.IO.Path]::GetTempFileName()

    try {
        $process = Start-Process -FilePath $FilePath `
            -ArgumentList $Arguments `
            -WorkingDirectory $WorkingDirectory `
            -NoNewWindow -PassThru `
            -RedirectStandardOutput $stdoutFile `
            -RedirectStandardError $stderrFile

        while (-not $process.HasExited) {
            $warnCount = 0
            if (Test-Path $stdoutFile) {
                try {
                    $warnCount += (Select-String -Path $stdoutFile -Pattern '(?i)\bwarning\b' -ErrorAction SilentlyContinue).Count
                } catch {}
            }
            if (Test-Path $stderrFile) {
                try {
                    $warnCount += (Select-String -Path $stderrFile -Pattern '(?i)\bwarning\b' -ErrorAction SilentlyContinue).Count
                } catch {}
            }

            Write-InstallStatus -Stage $Stage -Warnings $warnCount -Style $Style
            Start-Sleep -Milliseconds 120
        }
        $process.WaitForExit()

        $stdoutLines = if (Test-Path $stdoutFile) { Get-Content $stdoutFile -ErrorAction SilentlyContinue } else { @() }
        $stderrLines = if (Test-Path $stderrFile) { Get-Content $stderrFile -ErrorAction SilentlyContinue } else { @() }
        Add-WarningsFromLines -Lines @($stdoutLines + $stderrLines) -Source $Description

        if ($process.ExitCode -ne 0) {
            Reset-InstallStatusLine
            Write-Fail "$Description failed (exit $($process.ExitCode))"
            exit $process.ExitCode
        }
    } finally {
        Reset-InstallStatusLine
        Remove-Item $stdoutFile, $stderrFile -Force -ErrorAction SilentlyContinue
    }
}

# ──────────────────────────────────────────────────────────────
# Component installers — each delegates to install.ps1
# ──────────────────────────────────────────────────────────────

function Install-Supervisor {
    Set-CurrentComponent 'Supervisor'
    Write-Step "Supervisor (Rust + Qt QML)"
    # Tear down managed runtime before rebuild to avoid orphan processes.
    Stop-SupervisorRuntimeProcesses -WorkspaceRoot $Root
    Invoke-CheckedCommand -Description 'install.ps1 -Component Supervisor' `
        -FilePath 'pwsh' `
        -Arguments (@('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $CanonicalInstallScript, '-Component', 'Supervisor') + (Get-InstallFlags)) `
        -WorkingDirectory $Root
    Write-Ok "supervisor built → target/release/supervisor.exe"
}

function Install-InteractiveTerminal {
    Set-CurrentComponent 'InteractiveTerminal'
    Write-Step "Interactive Terminal (Rust + Qt)"
    Invoke-CheckedCommand -Description 'install.ps1 -Component InteractiveTerminal' `
        -FilePath 'pwsh' `
        -Arguments (@('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $CanonicalInstallScript, '-Component', 'InteractiveTerminal') + (Get-InstallFlags)) `
        -WorkingDirectory $Root
    Write-Ok "interactive-terminal built → target/release/interactive-terminal.exe"
}

function Install-InstallWizard {
    Set-CurrentComponent 'InstallWizard'
    Write-Step "Project Memory Install Wizard (GUI)"
    Invoke-CheckedCommand -Description 'install.ps1 -Component InstallWizard' `
        -FilePath 'pwsh' `
        -Arguments (@('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $CanonicalInstallScript, '-Component', 'InstallWizard') + (Get-InstallFlags)) `
        -WorkingDirectory $Root
    Write-Ok "Install Wizard built → target/release/pm-install-gui.exe"
}

# ──────────────────────────────────────────────────────────────
# PM GUI Binaries  (pm-approval-gui, pm-brainstorm-gui)
# ──────────────────────────────────────────────────────────────

function Install-GuiForms {
    Set-CurrentComponent 'GuiForms'
    Write-Step "PM GUI Binaries (pm-approval-gui, pm-brainstorm-gui)"
    Invoke-CheckedCommand -Description 'install.ps1 -Component GuiForms' `
        -FilePath 'pwsh' `
        -Arguments (@('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $CanonicalInstallScript, '-Component', 'GuiForms') + (Get-InstallFlags)) `
        -WorkingDirectory $Root
    Write-Ok "pm-approval-gui + pm-brainstorm-gui built → target/release/"
}

# ──────────────────────────────────────────────────────────────
# Server
# ──────────────────────────────────────────────────────────────

function Install-Server {
    Set-CurrentComponent 'Server'
    Write-Step "Server"
    Invoke-CheckedCommand -Description "install.ps1 -Component Server" `
        -FilePath 'pwsh' `
        -Arguments (@('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $CanonicalInstallScript, '-Component', 'Server') + (Get-InstallFlags)) `
        -WorkingDirectory $Root
    if ($NewDatabase) {
        Write-Ok "Server built + fresh database created at %APPDATA%\ProjectMemory\project-memory.db"
    } else {
        Write-Ok "Server built + database seeded at %APPDATA%\ProjectMemory\project-memory.db"
    }
}

function Install-FallbackServer {
    Set-CurrentComponent 'FallbackServer'
    Write-Step "Fallback Server"
    Invoke-CheckedCommand -Description "install.ps1 -Component FallbackServer" `
        -FilePath 'pwsh' `
        -Arguments (@('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $CanonicalInstallScript, '-Component', 'FallbackServer') + (Get-InstallFlags)) `
        -WorkingDirectory $Root
    Write-Ok "Fallback server built → server/dist/fallback-rest-main.js"
}

# ──────────────────────────────────────────────────────────────
# VS Code Extension
# ──────────────────────────────────────────────────────────────

function Install-Extension {
    Set-CurrentComponent 'Extension'
    Write-Step "VS Code Extension"
    Invoke-CheckedCommand -Description 'install.ps1 -Component Extension' `
        -FilePath 'pwsh' `
        -Arguments (@('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $CanonicalInstallScript, '-Component', 'Extension') + (Get-InstallFlags)) `
        -WorkingDirectory $Root
    if ($SkipInstall) {
        Write-Ok "Extension packaged (install skipped)"
    } elseif ($EffectiveInstallOnly) {
        Write-Ok "Extension installed (build skipped)"
    } else {
        Write-Ok "Extension built, packaged, and installed"
        Write-Host ""
        Write-Host "   Reload VS Code to activate the updated extension:" -ForegroundColor Yellow
        Write-Host "   Ctrl+Shift+P → Developer: Reload Window" -ForegroundColor DarkGray
    }
}

# ──────────────────────────────────────────────────────────────
# Dashboard
# ──────────────────────────────────────────────────────────────

function Install-Dashboard {
    Set-CurrentComponent 'Dashboard'
    Write-Step "Dashboard"
    Invoke-CheckedCommand -Description 'install.ps1 -Component Dashboard' `
        -FilePath 'pwsh' `
        -Arguments (@('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $CanonicalInstallScript, '-Component', 'Dashboard') + (Get-InstallFlags)) `
        -WorkingDirectory $Root
    Write-Ok "Dashboard frontend + server built"
}

# ──────────────────────────────────────────────────────────────
# Container
# ──────────────────────────────────────────────────────────────

function Install-Container {
    Set-CurrentComponent 'Container'
    Write-Step "Container (podman)"
    Invoke-CheckedCommand -Description 'install.ps1 -Component Container' `
        -FilePath 'pwsh' `
        -Arguments (@('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $CanonicalInstallScript, '-Component', 'Container') + (Get-InstallFlags)) `
        -WorkingDirectory $Root
    Write-Ok "Container image built: project-memory-mcp-project-memory:latest"
}

# ──────────────────────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────────────────────

$StartTime = Get-Date
Show-Banner
Write-Host "Project Memory MCP — Install" -ForegroundColor Magenta
Write-Host "  Components : $($Components -join ', ')" -ForegroundColor DarkGray
Write-Host "  InstallOnly: $EffectiveInstallOnly" -ForegroundColor DarkGray
Write-Host "  SkipInstall: $SkipInstall" -ForegroundColor DarkGray
Write-Host "  Force      : $Force" -ForegroundColor DarkGray
Write-Host "  NewDatabase: $NewDatabase" -ForegroundColor DarkGray
Write-Host "  SkipAudit  : $SkipOutdatedAudit" -ForegroundColor DarkGray
Write-Host "  ApplyAudit : $ApplyOutdatedAuditFixes" -ForegroundColor DarkGray

foreach ($comp in $Components) {
    switch ($comp) {
        "Supervisor"          { Install-Supervisor }
        "GuiForms"            { Install-GuiForms }
        "InstallWizard"       { Install-InstallWizard }
        "InteractiveTerminal" { Install-InteractiveTerminal }
        "Server"              { Install-Server }
        "FallbackServer"      { Install-FallbackServer }
        "Dashboard"           { Install-Dashboard }
        "Extension"           { Install-Extension }
        "Container"           { Install-Container }
    }
}

if (-not $SkipOutdatedAudit) {
    Invoke-OutdatedSettingsAudit -ApplyFixes:$ApplyOutdatedAuditFixes
} else {
    Write-Step "Outdated Settings and Workspace File Audit"
    Write-Host "   (skipped by -SkipOutdatedAudit)" -ForegroundColor DarkGray
}

$Elapsed = (Get-Date) - $StartTime
Write-Host ""
Write-Host "Done in $([math]::Round($Elapsed.TotalSeconds, 1))s" -ForegroundColor Magenta

Write-Host ""
Write-Host "Warnings Summary" -ForegroundColor Yellow
if ($script:WarningMessages.Count -eq 0) {
    Write-Host "  (no warnings captured)" -ForegroundColor DarkGray
} else {
    foreach ($warning in $script:WarningMessages) {
        Write-Host "  - $warning" -ForegroundColor Yellow
    }
}

# ── Optional supervisor launch prompt (no automatic launch) ─────────────────
if ($Components -contains "Supervisor") {
    $launchScript = Join-Path $Root 'launch-supervisor.ps1'
    $supervisorExe = Join-Path $Root 'target\release\supervisor.exe'
    Write-Host ""
    $canLaunchViaScript = Test-Path $launchScript
    $canLaunchDirect = Test-Path $supervisorExe

    if (-not ($canLaunchViaScript -or $canLaunchDirect)) {
        Write-Host "   [warn] no supervisor launch target found." -ForegroundColor Yellow
        Write-Host "   Missing script: $launchScript" -ForegroundColor DarkGray
        Write-Host "   Missing executable: $supervisorExe" -ForegroundColor DarkGray
    } elseif ($NoLaunchPrompt) {
        Write-Host "   Supervisor launch prompt suppressed (-NoLaunchPrompt)." -ForegroundColor DarkGray
        if ($canLaunchViaScript) {
            Write-Host "   Launch command (script):" -ForegroundColor DarkGray
            Write-Host "   & '$launchScript'" -ForegroundColor DarkGray
        }
        if ($canLaunchDirect) {
            Write-Host "   Launch command (direct):" -ForegroundColor DarkGray
            Write-Host "   & '$supervisorExe'" -ForegroundColor DarkGray
        }
    } else {
        $launchNow = Read-Host 'Build complete. Launch supervisor now? (Y/N)'
        if ($launchNow -match '^(?i)y(?:es)?$') {
            $launched = $false

            if ($canLaunchViaScript) {
                try {
                    Write-Host "── Launching Supervisor via launch script" -ForegroundColor Cyan
                    & $launchScript
                    $launched = $true
                } catch {
                    Write-Host "   [warn] launch script failed: $($_.Exception.Message)" -ForegroundColor Yellow
                }
            }

            if (-not $launched -and $canLaunchDirect) {
                try {
                    Write-Host "── Launching Supervisor directly from build output" -ForegroundColor Cyan
                    Start-Process -FilePath $supervisorExe -WorkingDirectory (Split-Path -Parent $supervisorExe) | Out-Null
                    Write-Ok "Supervisor launched: $supervisorExe"
                    $launched = $true
                } catch {
                    Write-Host "   [warn] direct supervisor launch failed: $($_.Exception.Message)" -ForegroundColor Yellow
                }
            }

            if (-not $launched) {
                Write-Host "   [warn] Supervisor build succeeded, but no launch method worked." -ForegroundColor Yellow
                if ($canLaunchViaScript) {
                    Write-Host "   Try manually: & '$launchScript'" -ForegroundColor DarkGray
                }
                if ($canLaunchDirect) {
                    Write-Host "   Or manually: & '$supervisorExe'" -ForegroundColor DarkGray
                }
            }
        } else {
            Write-Host "   Supervisor was not launched." -ForegroundColor Yellow
            if ($canLaunchViaScript) {
                Write-Host "   Launch command (script):" -ForegroundColor DarkGray
                Write-Host "   & '$launchScript'" -ForegroundColor DarkGray
            }
            if ($canLaunchDirect) {
                Write-Host "   Launch command (direct):" -ForegroundColor DarkGray
                Write-Host "   & '$supervisorExe'" -ForegroundColor DarkGray
            }
        }
    }
}
