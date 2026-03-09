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

.PARAMETER LintVerbose
    Print all qmllint output during QML pre-build validation, not just errors.

.PARAMETER LintLog
    Optional path to a file where qmllint output is appended (one entry per validated package).

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
    [Alias('h')]
    [switch]$Help,
    [string[]]$RemainingArgs
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Show-InstallHelp {
    Write-Host "Project Memory MCP — Install" -ForegroundColor Magenta
    Write-Host ""
    Write-Host "Usage:" -ForegroundColor Cyan
    Write-Host "  .\install.ps1 [-Component <list>] [-InstallOnly] [-SkipInstall] [-Force] [-NoBuild] [-NewDatabase] [-h|-Help|--help]"
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
    Write-Host "  -LintVerbose   Print all qmllint output during QML pre-build validation (default: errors only)"
    Write-Host "  -LintLog <path>  Append qmllint output to a log file"
    Write-Host "  -h, -Help      Show this help message"
    Write-Host "  --help         Also accepted"
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

# ──────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────

function Write-Step([string]$msg) {
    Write-Host "`n── $msg" -ForegroundColor Cyan
}

function Write-Ok([string]$msg) {
    Write-Host "   ✓ $msg" -ForegroundColor Green
}

function Write-Fail([string]$msg) {
    Write-Host "   ✗ $msg" -ForegroundColor Red
}

function Write-Warn([string]$msg) {
    Write-Host "   ⚠ $msg" -ForegroundColor Yellow
}

# Detect whether npm needs SSL workarounds (corporate proxies / TLS interception).
# Cached for the lifetime of this script run.
$script:_NpmSslBypassNeeded = $null
function Test-NpmSslBypassNeeded {
    if ($null -ne $script:_NpmSslBypassNeeded) { return $script:_NpmSslBypassNeeded }

    Write-Host "   Checking npm registry SSL connectivity..." -ForegroundColor DarkGray
    try {
        $out = npm ping --registry https://registry.npmjs.org 2>&1 | Out-String
        if ($LASTEXITCODE -eq 0) {
            Write-Host "   SSL OK — no workarounds needed" -ForegroundColor DarkGray
            $script:_NpmSslBypassNeeded = $false
        } else {
            # npm ping failed — likely TLS interception or cert issue
            Write-Warn "npm SSL check failed — enabling --strict-ssl=false for this install"
            $script:_NpmSslBypassNeeded = $true
        }
    } catch {
        Write-Warn "npm SSL check errored — enabling --strict-ssl=false for this install"
        $script:_NpmSslBypassNeeded = $true
    }
    return $script:_NpmSslBypassNeeded
}

# Run npm install with automatic SSL workaround when needed.
function Invoke-NpmInstall {
    param([string]$Label = "npm install")
    if (Test-NpmSslBypassNeeded) {
        $prevTls = $env:NODE_TLS_REJECT_UNAUTHORIZED
        $env:NODE_TLS_REJECT_UNAUTHORIZED = '0'
        try {
            Invoke-Checked $Label { npm install --strict-ssl=false 2>&1 | Write-Host }
        } finally {
            $env:NODE_TLS_REJECT_UNAUTHORIZED = $prevTls
        }
    } else {
        Invoke-Checked $Label { npm install 2>&1 | Write-Host }
    }
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

function Resolve-QtToolchain {
    param(
        [string]$PreferredQtDir
    )

    $candidates = New-Object System.Collections.Generic.List[string]

    if ($env:QMAKE -and (Test-Path $env:QMAKE)) {
        $qmakeBin = Split-Path -Path $env:QMAKE -Parent
        $qtFromQmake = Split-Path -Path $qmakeBin -Parent
        if ($qtFromQmake) { $candidates.Add($qtFromQmake) }
    }

    if ($PreferredQtDir) { $candidates.Add($PreferredQtDir) }
    if ($env:QT_DIR) { $candidates.Add($env:QT_DIR) }
    $candidates.Add('C:\Qt\6.10.2\msvc2022_64')

    if (Test-Path 'C:\Qt') {
        $discovered = Get-ChildItem -Path 'C:\Qt' -Directory -ErrorAction SilentlyContinue |
            Sort-Object Name -Descending |
            ForEach-Object {
                Get-ChildItem -Path $_.FullName -Directory -Filter 'msvc*_64' -ErrorAction SilentlyContinue |
                    ForEach-Object { $_.FullName }
            }
        foreach ($dir in $discovered) {
            $candidates.Add($dir)
        }
    }

    foreach ($qtDir in ($candidates | Select-Object -Unique)) {
        if (-not (Test-Path $qtDir)) { continue }
        $qtBin = Join-Path $qtDir 'bin'
        $qmake6 = Join-Path $qtBin 'qmake6.exe'
        $qmake = Join-Path $qtBin 'qmake.exe'

        if (Test-Path $qmake6) {
            return [pscustomobject]@{ QtDir = $qtDir; QtBin = $qtBin; QmakePath = $qmake6 }
        }
        if (Test-Path $qmake) {
            return [pscustomobject]@{ QtDir = $qtDir; QtBin = $qtBin; QmakePath = $qmake }
        }
    }

    throw "Qt/qmake not found. Set `$env:QT_DIR to your Qt kit path (example: C:\Qt\6.10.2\msvc2022_64) or set `$env:QMAKE to qmake6.exe."
}

function Invoke-Checked([string]$description, [scriptblock]$block) {
    Write-Host "   › $description" -ForegroundColor Gray
    & $block
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "$description failed (exit $LASTEXITCODE)"
        exit $LASTEXITCODE
    }
}

# Captures stdout+stderr from a native process without going through the
# PowerShell pipeline (avoids RemoteException spam on stderr).
function Invoke-NativeCommandCapture {
    param(
        [Parameter(Mandatory)][string]$FilePath,
        [string[]]$Arguments = @(),
        [string]$WorkingDirectory = $Root
    )

    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $FilePath
    $psi.WorkingDirectory = $WorkingDirectory
    $psi.UseShellExecute = $false
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.CreateNoWindow = $true

    $escapedArgs = $Arguments | ForEach-Object {
        if ($_ -match '[\s"]') { '"' + ($_ -replace '"', '\"') + '"' } else { $_ }
    }
    $psi.Arguments = [string]::Join(' ', $escapedArgs)

    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $psi
    [void]$process.Start()

    $stdoutTask = $process.StandardOutput.ReadToEndAsync()
    $stderrTask = $process.StandardError.ReadToEndAsync()
    $process.WaitForExit()

    $stdout = $stdoutTask.GetAwaiter().GetResult()
    $stderr = $stderrTask.GetAwaiter().GetResult()
    if ($null -eq $stdout) { $stdout = '' }
    if ($null -eq $stderr) { $stderr = '' }

    $stdoutLines = if (-not [string]::IsNullOrEmpty($stdout)) {
        $stdout -split "`r?`n" | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
    } else { @() }

    $stderrLines = if (-not [string]::IsNullOrEmpty($stderr)) {
        $stderr -split "`r?`n" | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
    } else { @() }

    return [PSCustomObject]@{
        ExitCode    = $process.ExitCode
        StdOut      = $stdout
        StdErr      = $stderr
        StdOutLines = $stdoutLines
        StdErrLines = $stderrLines
        AllLines    = @($stdoutLines + $stderrLines)
    }
}

# Runs windeployqt and collapses verbose QML import / plugin scanning lines
# into compact summary counts — mirrors build-interactive-terminal.ps1 output style.
function Invoke-WinDeployQt {
    param(
        [Parameter(Mandatory)][string]$ToolPath,
        [Parameter(Mandatory)][string]$ExePath,
        [Parameter(Mandatory)][string]$QmlDir,
        [string]$Label = ''
    )

    $displayLabel = if ($Label) { "windeployqt $Label" } else { 'windeployqt' }
    Write-Host "   › $displayLabel" -ForegroundColor Gray

    if (-not (Test-Path $ToolPath)) {
        Write-Fail "windeployqt.exe not found at: $ToolPath"
        exit 1
    }

    $deployArgs = @('--release', '--qmldir', $QmlDir, $ExePath)
    $result = Invoke-NativeCommandCapture -FilePath $ToolPath -Arguments $deployArgs -WorkingDirectory (Split-Path -Parent $ExePath)

    $inQmlImports           = $false
    $qmlImportCount         = 0
    $upToDateCount          = 0
    $translationCount       = 0
    $localDependencyCount   = 0
    $binaryDescriptorCount  = 0
    $scannedPathCount       = 0
    $pluginTypeAddCount     = 0
    $pluginResolvedCount    = 0
    $skippedPluginCount     = 0
    $additionalPassCount    = 0
    $directDependenciesLine = ''
    $allDependenciesLine    = ''
    $toBeDeployedLine       = ''

    foreach ($line in $result.AllLines) {
        $trimmedRight = $line.TrimEnd()
        $trimmed      = $trimmedRight.Trim()

        if ($trimmed -eq 'QML imports:') {
            $inQmlImports = $true
            continue
        }

        if ($inQmlImports) {
            if ($trimmed -match "^'[^']+'") {
                $qmlImportCount += 1
                continue
            }
            $inQmlImports = $false
        }

        if     ($trimmed -match '^Warning:')                                      { Write-Host $trimmedRight -ForegroundColor Yellow }
        elseif ($trimmed -match '^Error:|^ERROR\b')                               { Write-Host $trimmedRight -ForegroundColor Red    }
        elseif ($trimmed -match '^Adding local dependency')                        { $localDependencyCount   += 1 }
        elseif ($trimmed -match '\.exe\s+.*executable\s+\[QML\]$')               { $binaryDescriptorCount  += 1 }
        elseif ($trimmed -match '^Scanning\s+')                                   { $scannedPathCount       += 1 }
        elseif ($trimmed -match '^Adding in plugin type\s+')                      { $pluginTypeAddCount     += 1 }
        elseif ($trimmed -match '^Adding\s+\S+\s+for\s+\S+\s+from plugin type:') { $pluginResolvedCount    += 1 }
        elseif ($trimmed -match '^Skipping plugin\s+')                            { $skippedPluginCount     += 1 }
        elseif ($trimmed -match '^Performing additional pass')                     { $additionalPassCount    += 1 }
        elseif ($trimmed -match '^Direct dependencies:\s*(.+)$')                  { $directDependenciesLine  = $Matches[1] }
        elseif ($trimmed -match '^All dependencies\s*:\s*(.+)$')                 { $allDependenciesLine     = $Matches[1] }
        elseif ($trimmed -match '^To be deployed\s*:\s*(.+)$')                   { $toBeDeployedLine        = $Matches[1] }
        elseif ($trimmed -match ' is up to date\.$')                              { $upToDateCount          += 1 }
        elseif ($trimmed -match '^Creating qt_[A-Za-z_]+\.qm\.\.\.$')            { $translationCount       += 1 }
        elseif (-not [string]::IsNullOrWhiteSpace($trimmedRight))                 { Write-Host $trimmedRight          }
    }

    if ($upToDateCount -gt 0) {
        Write-Host ("   windeployqt up-to-date: {0}" -f $upToDateCount) -ForegroundColor DarkGray
    }
    if ($translationCount -gt 0) {
        Write-Host ("   windeployqt translations: {0}" -f $translationCount) -ForegroundColor DarkGray
    }
    if ($binaryDescriptorCount -gt 0 -or $scannedPathCount -gt 0 -or $localDependencyCount -gt 0 -or
        $pluginTypeAddCount -gt 0 -or $pluginResolvedCount -gt 0 -or $skippedPluginCount -gt 0 -or $additionalPassCount -gt 0) {
        Write-Host ("   windeployqt deps: binary={0} scanPaths={1} localDeps={2} pluginTypes={3} resolved={4} skipped={5} passes={6}" -f
            $binaryDescriptorCount, $scannedPathCount, $localDependencyCount, $pluginTypeAddCount,
            $pluginResolvedCount, $skippedPluginCount, $additionalPassCount
        ) -ForegroundColor DarkGray
    }

    $directCount = ($directDependenciesLine -split '\s+' | Where-Object { $_ }).Count
    $allCount    = ($allDependenciesLine    -split '\s+' | Where-Object { $_ }).Count
    $deployCount = ($toBeDeployedLine       -split '\s+' | Where-Object { $_ }).Count
    if ($directCount -gt 0 -or $allCount -gt 0 -or $deployCount -gt 0) {
        Write-Host ("   Qt dependency sets: direct={0} all={1} deploy={2}" -f $directCount, $allCount, $deployCount) -ForegroundColor DarkGray
    }
    if ($qmlImportCount -gt 0) {
        Write-Host ("   QML imports discovered: {0}" -f $qmlImportCount) -ForegroundColor DarkGray
    }

    if ($result.ExitCode -ne 0) {
        Write-Fail "$displayLabel failed (exit $($result.ExitCode))"
        exit $result.ExitCode
    }
}

# Streams cargo output to temp files, polls for warning count as a live
# heartbeat, then replays lines with yellow/red colouring.  Avoids the
# System.Management.Automation.RemoteException spam caused by piping
# stderr through the PowerShell pipeline with 2>&1 | Write-Host.
function Invoke-CargoBuild {
    param(
        [string[]]$Arguments,
        [string]$WorkingDirectory = $Root,
        [int]$PollIntervalMs  = 1500,
        [int]$HeartbeatSeconds = 5
    )

    $label = "cargo $($Arguments -join ' ')"
    Write-Host "   › $label" -ForegroundColor Gray

    $stdoutFile = [System.IO.Path]::GetTempFileName()
    $stderrFile = [System.IO.Path]::GetTempFileName()

    try {
        $argStr = ($Arguments | ForEach-Object {
            if ($_ -match '[\s"]') { '"' + ($_ -replace '"', '\\"') + '"' } else { $_ }
        }) -join ' '

        $process = Start-Process -FilePath 'cmd.exe' `
            -ArgumentList "/c cargo $argStr" `
            -WorkingDirectory $WorkingDirectory `
            -NoNewWindow -PassThru `
            -RedirectStandardOutput $stdoutFile `
            -RedirectStandardError  $stderrFile

        $lastWarn  = -1
        $lastBeat  = [DateTime]::UtcNow.AddSeconds(-$HeartbeatSeconds)

        while (-not $process.HasExited) {
            $warnCount = 0
            if (Test-Path $stderrFile) {
                try { $warnCount = (Select-String -Path $stderrFile -Pattern '^warning:').Count }
                catch { $warnCount = [Math]::Max(0, $lastWarn) }
            }
            $now = [DateTime]::UtcNow
            if ($warnCount -ne $lastWarn -or ($now - $lastBeat).TotalSeconds -ge $HeartbeatSeconds) {
                Write-Host ("   cargo build in progress...  warnings so far: {0}" -f $warnCount) -ForegroundColor DarkGray
                $lastWarn = $warnCount
                $lastBeat = $now
            }
            Start-Sleep -Milliseconds ([Math]::Max(200, $PollIntervalMs))
        }
        $process.WaitForExit()

        $stdout = if (Test-Path $stdoutFile) { Get-Content $stdoutFile -Raw -EA SilentlyContinue } else { '' }
        $stderr = if (Test-Path $stderrFile) { Get-Content $stderrFile -Raw -EA SilentlyContinue } else { '' }
        if ($null -eq $stdout) { $stdout = '' }
        if ($null -eq $stderr) { $stderr = '' }

        $allLines = @(
            ($stdout -split "`r?`n"),
            ($stderr -split "`r?`n")
        ) | ForEach-Object { $_ } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }

        # Replay output, suppressing individual warning blocks.
        # Each warning from rustc is a multi-line indented block beginning with
        # "warning[…]: …" followed by indented source context lines.  We count
        # those headers and emit a single summary line instead of the full noise.
        # Errors and status lines (Compiling, Finished, …) are always shown.
        $warnBlockCount = 0
        $inWarnBlock    = $false
        foreach ($line in $allLines) {
            $t = $line.TrimStart()
            if ($t -match '^warning[:\[]') {
                # Cargo's end-of-build summary "warning: N warnings emitted" —
                # already captured in $warnBlockCount so just discard it.
                if ($t -notmatch '^warning: \d+ warning') { $warnBlockCount++ }
                $inWarnBlock = $true
                continue
            }
            if ($inWarnBlock) {
                # Indented source-context / note lines belonging to the warning block.
                if ($line -match '^\s') { continue }
                # First non-indented line ends the block.
                $inWarnBlock = $false
            }
            if   ($t -match '^error[:\[]|^error\[') { Write-Host $line -ForegroundColor Red }
            else                                     { Write-Host $line }
        }
        if ($warnBlockCount -gt 0) {
            Write-Host ("   ⚠ {0} warning(s) suppressed — set RUST_LOG=warn to see details" -f $warnBlockCount) -ForegroundColor Yellow
        }

        $exitCode = $process.ExitCode
        $finished = @($allLines | Where-Object { $_ -match '^\s*Finished\s+`?(debug|release)`?' }).Count -gt 0

        if ($exitCode -ne 0 -and -not $finished) {
            Write-Fail "$label failed (exit $exitCode)"
            exit $exitCode
        }
    } finally {
        Remove-Item $stdoutFile, $stderrFile -Force -EA SilentlyContinue
    }
}

# Validates QML files with qmllint before compilation.
# Returns $true if lint passed or is non-fatal (warnings only); $false on hard errors (exit >= 2).
# Silently skips when qmllint.exe is missing or there are no .qml files — never blocks a build in that case.
function Invoke-QmlLint {
    param(
        [Parameter(Mandatory)][string]$QtBin,
        [Parameter(Mandatory)][string]$QmlDir,
        [string]$Label    = '',
        [bool]$PrintAll   = $false,
        [string]$LogFile  = ''
    )

    $qmllintPath = Join-Path $QtBin 'qmllint.exe'
    if (-not (Test-Path $qmllintPath)) {
        Write-Host "   (qmllint.exe not found in Qt bin — skipping QML validation)" -ForegroundColor DarkGray
        return $true
    }

    if (-not (Test-Path $QmlDir)) {
        Write-Host "   (QML directory not found: $QmlDir — skipping lint)" -ForegroundColor DarkGray
        return $true
    }

    $qmlFiles = @(Get-ChildItem $QmlDir -Filter '*.qml' -File -Recurse |
                    Where-Object { $_.FullName -notmatch '\\tests?\\' })
    if ($qmlFiles.Count -eq 0) {
        Write-Host "   (no .qml files in $(Split-Path $QmlDir -Leaf) — skipping lint)" -ForegroundColor DarkGray
        return $true
    }

    $displayLabel = if ($Label) { "qmllint ($Label)" } else { 'qmllint' }
    Write-Host "   › $displayLabel — $($qmlFiles.Count) file(s)" -ForegroundColor Gray

    $qtQmlRoot = Join-Path (Split-Path -Parent $QtBin) 'qml'
    $output    = & $qmllintPath -I $qtQmlRoot -I $QmlDir ($qmlFiles.FullName) 2>&1
    $exitCode  = $LASTEXITCODE

    # qmllint warning/error formats vary by Qt version and codepath.
    # Handle both forms:
    #   - "Warning: file.qml:line:col: ..."
    #   - "file.qml:line:col: Warning: ..."
    $outputLines    = @($output | ForEach-Object { "$_" })
    $errorPattern   = '^\s*Error:|:\s*Error\b'
    $warningPattern = '^\s*Warning:|:\s*Warning\b'

    $errors   = @($outputLines | Where-Object { $_ -match $errorPattern })
    $warnings = @($outputLines | Where-Object { $_ -match $warningPattern })

    $warningKinds = @{}
    foreach ($warningLine in $warnings) {
        $kind = 'unknown'
        if ($warningLine -match '\[(?<kind>[^\]]+)\]\s*$') {
            $kind = $Matches.kind
        }
        if ($warningKinds.ContainsKey($kind)) {
            $warningKinds[$kind] += 1
        } else {
            $warningKinds[$kind] = 1
        }
    }

    $importWarningCount = if ($warningKinds.ContainsKey('import')) { [int]$warningKinds['import'] } else { 0 }
    $missingPropertyCount = if ($warningKinds.ContainsKey('missing-property')) { [int]$warningKinds['missing-property'] } else { 0 }
    $incompatibleTypeCount = if ($warningKinds.ContainsKey('incompatible-type')) { [int]$warningKinds['incompatible-type'] } else { 0 }

    $primaryWarningKinds = @{}
    $cascadingWarningKinds = @{}
    if ($importWarningCount -gt 0) {
        foreach ($entry in $warningKinds.GetEnumerator()) {
            if ($entry.Key -in @('missing-property', 'incompatible-type')) {
                $cascadingWarningKinds[$entry.Key] = $entry.Value
            } else {
                $primaryWarningKinds[$entry.Key] = $entry.Value
            }
        }
    } else {
        foreach ($entry in $warningKinds.GetEnumerator()) {
            $primaryWarningKinds[$entry.Key] = $entry.Value
        }
    }

    if ($LogFile -ne '') { $outputLines | Out-File $LogFile -Encoding utf8 -Append }

    if ($errors.Count -gt 0 -or $PrintAll) {
        $outputLines | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | ForEach-Object {
            $color = if ($_ -match $errorPattern) { 'Red' } elseif ($_ -match $warningPattern) { 'Yellow' } else { 'Gray' }
            Write-Host "     $_" -ForegroundColor $color
        }
    }

    if ($exitCode -ge 2 -or $errors.Count -gt 0) {
        Write-Fail "QML lint ($Label): $($errors.Count) error(s) in $($qmlFiles.Count) file(s) — fix before building"
        if (-not $PrintAll) { Write-Host "   Re-run with -LintVerbose to see full details" -ForegroundColor DarkGray }
        return $false
    }
    if ($warnings.Count -gt 0) {
        # If imports fail, qmllint often cascades into many missing-property/incompatible-type
        # diagnostics for custom bridge types. Report that split explicitly so summaries stay readable.
        $cascadingCount = 0
        if ($importWarningCount -gt 0) {
            $cascadingCount = $missingPropertyCount + $incompatibleTypeCount
        }

        $unresolvedModules = @()
        if ($importWarningCount -gt 0) {
            $unresolvedModules = @(
                $warnings |
                ForEach-Object {
                    if ($_ -match 'Failed to import\s+([A-Za-z0-9\._]+)') {
                        $Matches[1]
                    }
                } |
                Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
                Select-Object -Unique
            )
        }

        if ($cascadingCount -gt 0) {
            $primaryCount = [Math]::Max(0, $warnings.Count - $cascadingCount)
            Write-Warn "QML lint ($Label): $($warnings.Count) warning diagnostic(s) while scanning $($qmlFiles.Count) file(s) (primary=$primaryCount, cascading=$cascadingCount from unresolved imports; non-fatal)"
            if ($unresolvedModules.Count -gt 0) {
                Write-Host "   Import root cause: unresolved module(s): $($unresolvedModules -join ', ')" -ForegroundColor DarkGray
                Write-Host "   Note: import-cascade warnings are often expected before bridge/plugin artifacts are built." -ForegroundColor DarkGray
            }
        } else {
            Write-Warn "QML lint ($Label): $($warnings.Count) warning diagnostic(s) while scanning $($qmlFiles.Count) file(s) (non-fatal)"
        }

        if ($warningKinds.Count -gt 0) {
            if ($cascadingCount -gt 0) {
                $topPrimaryKinds = $primaryWarningKinds.GetEnumerator() |
                    Sort-Object -Property Value -Descending |
                    Select-Object -First 4 |
                    ForEach-Object { "$($_.Key)=$($_.Value)" }

                if ($topPrimaryKinds.Count -gt 0) {
                    Write-Host "   QML lint primary categories: $($topPrimaryKinds -join ', ')" -ForegroundColor DarkGray
                }

                $topCascadeKinds = $cascadingWarningKinds.GetEnumerator() |
                    Sort-Object -Property Value -Descending |
                    Select-Object -First 4 |
                    ForEach-Object { "$($_.Key)=$($_.Value)" }

                if ($topCascadeKinds.Count -gt 0) {
                    Write-Host "   QML lint cascading categories: $($topCascadeKinds -join ', ')" -ForegroundColor DarkGray
                }
            } else {
                $topKinds = $warningKinds.GetEnumerator() |
                    Sort-Object -Property Value -Descending |
                    Select-Object -First 4 |
                    ForEach-Object { "$($_.Key)=$($_.Value)" }

                if ($topKinds.Count -gt 0) {
                    Write-Host "   QML lint warning categories: $($topKinds -join ', ')" -ForegroundColor DarkGray
                }
            }
        }
    } else {
        Write-Host "   [OK] QML lint passed ($($qmlFiles.Count) files, 0 issues)" -ForegroundColor Green
    }
    return $true
}

# Verifies Qt DLL deployment completeness after windeployqt, copying any missing files from the Qt installation.
# Checks: core Qt DLLs, controls style plugins (frequently missed by windeployqt), the
# platform plugin (qwindows.dll — missing = no window at all), and required QML module directories.
function Invoke-QtDeployVerify {
    param(
        [Parameter(Mandatory)][string]$ExePath,
        [Parameter(Mandatory)][string]$QtDir,
        [Parameter(Mandatory)][string]$QtBin,
        [string]$Label = ''
    )

    $outputDir    = Split-Path -Parent $ExePath
    $displayLabel = if ($Label) { "Qt deploy verify ($Label)" } else { 'Qt deploy verify' }
    Write-Host "   › $displayLabel" -ForegroundColor Gray

    $requiredDlls = @(
        # Core Qt runtime
        'Qt6Core.dll', 'Qt6Gui.dll', 'Qt6Network.dll', 'Qt6OpenGL.dll',
        # QML engine
        'Qt6Qml.dll', 'Qt6QmlMeta.dll', 'Qt6QmlModels.dll', 'Qt6QmlWorkerScript.dll',
        # QtQuick rendering
        'Qt6Quick.dll', 'Qt6QuickControls2.dll', 'Qt6QuickControls2Impl.dll',
        'Qt6QuickTemplates2.dll', 'Qt6QuickLayouts.dll', 'Qt6QuickShapes.dll',
        # Controls style plugins — windeployqt regularly misses these
        'Qt6QuickControls2Basic.dll', 'Qt6QuickControls2BasicStyleImpl.dll',
        'Qt6QuickControls2Material.dll', 'Qt6QuickControls2MaterialStyleImpl.dll',
        'Qt6QuickControls2Fusion.dll', 'Qt6QuickControls2FusionStyleImpl.dll',
        'Qt6QuickControls2Universal.dll', 'Qt6QuickControls2UniversalStyleImpl.dll',
        # SVG icons + software OpenGL fallback (required for RDP/VM/headless)
        'Qt6Svg.dll', 'D3Dcompiler_47.dll', 'opengl32sw.dll'
    )

    $missingItems = @()
    $copiedItems  = @()

    foreach ($dll in $requiredDlls) {
        $dest = Join-Path $outputDir $dll
        if (-not (Test-Path $dest)) {
            $src = Join-Path $QtBin $dll
            if (Test-Path $src) {
                Copy-Item $src $dest -Force
                $copiedItems += $dll
            } else {
                $missingItems += $dll
            }
        }
    }

    # Platform plugin — without qwindows.dll Qt cannot open any window at all
    $platformDir = Join-Path $outputDir 'platforms'
    if (-not (Test-Path (Join-Path $platformDir 'qwindows.dll'))) {
        $srcPlatform = Join-Path $QtDir 'plugins\platforms\qwindows.dll'
        if (Test-Path $srcPlatform) {
            New-Item -ItemType Directory -Force -Path $platformDir | Out-Null
            Copy-Item $srcPlatform (Join-Path $platformDir 'qwindows.dll') -Force
            $copiedItems += 'platforms\qwindows.dll'
        } else {
            $missingItems += 'platforms\qwindows.dll'
        }
    }

    # QML module directories — required for import resolution at runtime
    $qtQmlRoot = Join-Path $QtDir 'qml'
    foreach ($qmlSubDir in @('qml\QtQuick', 'qml\QtQuick\Controls', 'qml\QtQuick\Layouts', 'qml\QtQml')) {
        $qmlPath = Join-Path $outputDir $qmlSubDir
        if (-not (Test-Path $qmlPath)) {
            $srcQmlPath = Join-Path $qtQmlRoot ($qmlSubDir -replace '^qml\\', '')
            if (Test-Path $srcQmlPath) {
                Copy-Item $srcQmlPath $qmlPath -Recurse -Force
                $copiedItems += $qmlSubDir
            } else {
                $missingItems += "qml-dir:$qmlSubDir"
            }
        }
    }

    if ($copiedItems.Count -gt 0) {
        Write-Warn "windeployqt missed $($copiedItems.Count) item(s) — copied from Qt:"
        $copiedItems | ForEach-Object { Write-Host "     + $_" -ForegroundColor Yellow }
    }
    if ($missingItems.Count -gt 0) {
        Write-Fail "Qt deployment incomplete ($Label) — not found in Qt install: $($missingItems -join ', ')"
        exit 1
    }
    if ($copiedItems.Count -eq 0) {
        Write-Host "   Qt deployment verified (all required items present)" -ForegroundColor DarkGray
    }
}

# ──────────────────────────────────────────────────────────────
# Rust crates
# ──────────────────────────────────────────────────────────────

function Set-CargoNetworkEnv {
    # Cargo network stability defaults for Windows environments where
    # certificate revocation checks are blocked by corporate/firewall policy.
    if (-not $env:CARGO_HTTP_CHECK_REVOKE)             { $env:CARGO_HTTP_CHECK_REVOKE = 'false' }
    if (-not $env:CARGO_REGISTRIES_CRATES_IO_PROTOCOL) { $env:CARGO_REGISTRIES_CRATES_IO_PROTOCOL = 'sparse' }
    if (-not $env:CARGO_NET_GIT_FETCH_WITH_CLI)        { $env:CARGO_NET_GIT_FETCH_WITH_CLI = 'true' }
}

function Install-Supervisor {
    Write-Step "Supervisor (Rust + Qt QML)"
    Set-CargoNetworkEnv

    # Rebuilding supervisor must tear down all managed runtime components,
    # not just supervisor.exe, to avoid orphan processes.
    Stop-SupervisorRuntimeProcesses -WorkspaceRoot $Root

    try {
        $Qt = Resolve-QtToolchain
    } catch {
        Write-Fail $_.Exception.Message
        exit 1
    }

    Write-Host "   Qt:    $($Qt.QtDir)" -ForegroundColor DarkGray
    Write-Host "   QMAKE: $($Qt.QmakePath)" -ForegroundColor DarkGray

    $prevQmake = $env:QMAKE
    $prevPath  = $env:PATH
    $env:QMAKE = $Qt.QmakePath
    $env:PATH  = "$($Qt.QtBin);$env:PATH"

    try {
        $supervisorQmlDir = Join-Path $Root 'supervisor'
        $supervisorExe    = Join-Path $Root 'target\release\supervisor.exe'
        if (-not (Invoke-QmlLint -QtBin $Qt.QtBin -QmlDir $supervisorQmlDir -Label 'supervisor' -PrintAll:($LintVerbose.IsPresent) -LogFile $LintLog)) { exit 1 }

        Invoke-CargoBuild -Arguments @('build', '--release', '-p', 'supervisor') -WorkingDirectory $Root

        $deployTool = Join-Path $Qt.QtBin 'windeployqt.exe'
        Invoke-WinDeployQt -ToolPath $deployTool -ExePath $supervisorExe -QmlDir $supervisorQmlDir -Label 'supervisor'
        Invoke-QtDeployVerify -ExePath $supervisorExe -QtDir $Qt.QtDir -QtBin $Qt.QtBin -Label 'supervisor'

        # Copy tray icons next to the exe so the QML SystemTrayIcon can resolve
        # them via the file:/// URL built in initialize.rs → resolve_tray_icon_url().
        $iconsSource = Join-Path $Root 'supervisor\assets\icons'
        $iconsTarget = Join-Path $Root 'target\release'
        if (Test-Path $iconsSource) {
            Copy-Item -Path "$iconsSource\*.ico" -Destination $iconsTarget -Force
            $iconCount = (Get-ChildItem "$iconsSource\*.ico").Count
            Write-Host "   Copied $iconCount tray icon(s) → target/release/" -ForegroundColor DarkGray
        } else {
            Write-Host "   [warn] supervisor/assets/icons not found – tray icon may be blank" -ForegroundColor Yellow
        }

        Write-Ok "supervisor built → target/release/supervisor.exe"
    } finally {
        $env:QMAKE = $prevQmake
        $env:PATH  = $prevPath
    }
}

function Install-InteractiveTerminal {
    Write-Step "Interactive Terminal (Rust + Qt)"

    $BuildScript = Join-Path $Root "interactive-terminal\build-interactive-terminal.ps1"
    if (-not (Test-Path $BuildScript)) {
        Write-Fail "build-interactive-terminal.ps1 not found at $BuildScript"
        exit 1
    }

    try {
        $Qt = Resolve-QtToolchain
    } catch {
        Write-Fail $_.Exception.Message
        exit 1
    }
    $QtDir = $Qt.QtDir

    $terminalQmlDir = Join-Path $Root 'interactive-terminal\qml'
    if (-not (Invoke-QmlLint -QtBin $Qt.QtBin -QmlDir $terminalQmlDir -Label 'interactive-terminal' -PrintAll:($LintVerbose.IsPresent) -LogFile $LintLog)) { exit 1 }

    Write-Host "   › Delegating to build-interactive-terminal.ps1 (QtDir=$QtDir)" -ForegroundColor Gray
    & $BuildScript -Profile release -QtDir $QtDir
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "build-interactive-terminal.ps1 failed (exit $LASTEXITCODE)"
        exit $LASTEXITCODE
    }

    Write-Ok "interactive-terminal built + Qt runtime deployed → target\release\  (workspace output)"
}

# ──────────────────────────────────────────────────────────────
# PM GUI Binaries  (pm-approval-gui, pm-brainstorm-gui)
# ──────────────────────────────────────────────────────────────

function Install-InstallWizard {
    Write-Step "Project Memory Install Wizard (GUI)"
    Set-CargoNetworkEnv

    try {
        $Qt = Resolve-QtToolchain
    } catch {
        Write-Fail $_.Exception.Message
        exit 1
    }

    $prevQmake = $env:QMAKE
    $prevPath  = $env:PATH
    $env:QMAKE = $Qt.QmakePath
    $env:PATH  = "$($Qt.QtBin);$env:PATH"

    try {
        $installQmlDir = Join-Path $Root 'pm-install-gui'
        $installExe    = Join-Path $Root 'target\release\pm-install-gui.exe'
        if (-not (Invoke-QmlLint -QtBin $Qt.QtBin -QmlDir $installQmlDir -Label 'install-wizard' -PrintAll:($LintVerbose.IsPresent) -LogFile $LintLog)) { exit 1 }

        Invoke-CargoBuild -Arguments @('build', '--release', '-p', 'pm-install-gui') -WorkingDirectory $Root

        $deployTool = Join-Path $Qt.QtBin 'windeployqt.exe'
        # We also need to deploy for webview/webengine if it's used
        Invoke-WinDeployQt -ToolPath $deployTool -ExePath $installExe -QmlDir $installQmlDir -Label 'install-wizard'
        Invoke-QtDeployVerify -ExePath $installExe -QtDir $Qt.QtDir -QtBin $Qt.QtBin -Label 'install-wizard'

        Write-Ok "Install Wizard built → target/release/pm-install-gui.exe"
    } finally {
        $env:QMAKE = $prevQmake
        $env:PATH  = $prevPath
    }
}

function Install-GuiForms {
    Write-Step "PM GUI Binaries (pm-approval-gui, pm-brainstorm-gui)"

    try {
        $Qt = Resolve-QtToolchain
    } catch {
        Write-Fail $_.Exception.Message
        exit 1
    }

    Write-Host "   Qt:    $($Qt.QtDir)" -ForegroundColor DarkGray
    Write-Host "   QMAKE: $($Qt.QmakePath)" -ForegroundColor DarkGray

    # cxx-qt discovers Qt via the QMAKE env var; also put Qt bin on PATH
    $prevQmake = $env:QMAKE
    $prevPath  = $env:PATH
    $env:QMAKE = $Qt.QmakePath
    $env:PATH  = "$($Qt.QtBin);$env:PATH"
    Set-CargoNetworkEnv

    try {
        $deployTool       = Join-Path $Qt.QtBin 'windeployqt.exe'
        $approvalQmlDir   = Join-Path $Root 'pm-approval-gui'
        $approvalExe      = Join-Path $Root 'target\release\pm-approval-gui.exe'
        if (-not (Invoke-QmlLint -QtBin $Qt.QtBin -QmlDir $approvalQmlDir -Label 'pm-approval-gui' -PrintAll:($LintVerbose.IsPresent) -LogFile $LintLog)) { exit 1 }
        Invoke-CargoBuild -Arguments @('build', '--release', '-p', 'pm-approval-gui')   -WorkingDirectory $Root
        Invoke-WinDeployQt -ToolPath $deployTool -ExePath $approvalExe -QmlDir $approvalQmlDir -Label 'pm-approval-gui'
        Invoke-QtDeployVerify -ExePath $approvalExe -QtDir $Qt.QtDir -QtBin $Qt.QtBin -Label 'pm-approval-gui'
        Write-Ok "pm-approval-gui built → target/release/pm-approval-gui.exe"

        $brainstormQmlDir = Join-Path $Root 'pm-brainstorm-gui'
        $brainstormExe    = Join-Path $Root 'target\release\pm-brainstorm-gui.exe'
        if (-not (Invoke-QmlLint -QtBin $Qt.QtBin -QmlDir $brainstormQmlDir -Label 'pm-brainstorm-gui' -PrintAll:($LintVerbose.IsPresent) -LogFile $LintLog)) { exit 1 }
        Invoke-CargoBuild -Arguments @('build', '--release', '-p', 'pm-brainstorm-gui') -WorkingDirectory $Root
        Invoke-WinDeployQt -ToolPath $deployTool -ExePath $brainstormExe -QmlDir $brainstormQmlDir -Label 'pm-brainstorm-gui'
        Invoke-QtDeployVerify -ExePath $brainstormExe -QtDir $Qt.QtDir -QtBin $Qt.QtBin -Label 'pm-brainstorm-gui'
        Write-Ok "pm-brainstorm-gui built → target/release/pm-brainstorm-gui.exe"
    } finally {
        $env:QMAKE = $prevQmake
        $env:PATH  = $prevPath
    }
}

# ──────────────────────────────────────────────────────────────
# Server
# ──────────────────────────────────────────────────────────────

function Archive-Database {
    <#
    .SYNOPSIS
        Renames the existing project-memory.db (and WAL/SHM files) so the
        system no longer recognises them. A fresh DB will be created on
        next server startup / seed.

        If the file is locked (e.g. by the MCP server), the function will
        attempt to stop the locking process(es) and retry.
    #>
    $DataRoot = if ($env:PM_DATA_ROOT) { $env:PM_DATA_ROOT }
                else { Join-Path $env:APPDATA 'ProjectMemory' }

    $DbPath = Join-Path $DataRoot 'project-memory.db'
    if (-not (Test-Path $DbPath)) {
        Write-Host "   (no existing database found — nothing to archive)" -ForegroundColor DarkGray
        return
    }

    $Timestamp = Get-Date -Format 'yyyy-MM-dd_HHmmss'
    $ArchiveName = "project-memory_archived_${Timestamp}.db"

    Write-Host "   › Archiving existing database" -ForegroundColor Gray
    Write-Host "     From: $DbPath" -ForegroundColor DarkGray

    # --- Helper: attempt to rename the DB, returns $true on success ----------
    function Try-RenameDb {
        try {
            Rename-Item -Path $DbPath -NewName $ArchiveName -ErrorAction Stop
            return $true
        } catch {
            return $false
        }
    }

    # --- First attempt -------------------------------------------------------
    if (Try-RenameDb) {
        Write-Ok "Database archived → $ArchiveName"
    } else {
        # File is locked — try to release it by stopping known consumers
        Write-Host "   ⚠ Database file is locked — attempting to release..." -ForegroundColor Yellow

        # Stop node processes that may hold the SQLite connection open
        # (MCP server, dashboard server, seed runners, etc.)
        $nodeProcs = @(Get-Process -Name 'node' -ErrorAction SilentlyContinue)
        if ($nodeProcs.Count -gt 0) {
            Write-Host "     Stopping $($nodeProcs.Count) node process(es)..." -ForegroundColor Yellow
            $nodeProcs | Stop-Process -Force -ErrorAction SilentlyContinue
            Start-Sleep -Milliseconds 1500
        }

        # Retry up to 3 times with a short delay
        $Renamed = $false
        for ($attempt = 1; $attempt -le 3; $attempt++) {
            if (Try-RenameDb) {
                $Renamed = $true
                break
            }
            Write-Host "     Retry $attempt/3..." -ForegroundColor DarkGray
            Start-Sleep -Milliseconds 1000
        }

        if ($Renamed) {
            Write-Ok "Database archived → $ArchiveName"
        } else {
            # Last resort: copy instead of rename, then truncate the original
            Write-Host "   ⚠ Could not rename — falling back to copy + truncate" -ForegroundColor Yellow
            $ArchivePath = Join-Path $DataRoot $ArchiveName
            Copy-Item -Path $DbPath -Destination $ArchivePath -Force
            # Truncate the original so migrations/seed will recreate schema
            [System.IO.File]::WriteAllBytes($DbPath, [byte[]]::new(0))
            Write-Ok "Database copied to $ArchiveName (original truncated)"
        }
    }

    # Also rename/copy WAL and SHM sidecar files if they exist
    $WalPath = "${DbPath}-wal"
    $ShmPath = "${DbPath}-shm"
    foreach ($sidecar in @($WalPath, $ShmPath)) {
        if (Test-Path $sidecar) {
            $suffix = if ($sidecar -eq $WalPath) { '-wal' } else { '-shm' }
            try {
                Rename-Item -Path $sidecar -NewName "${ArchiveName}${suffix}" -ErrorAction Stop
                Write-Host "     ($($suffix.TrimStart('-')) file archived)" -ForegroundColor DarkGray
            } catch {
                # If rename fails, just delete the sidecar — it's only useful
                # alongside the main DB file which we've already archived.
                Remove-Item -Path $sidecar -Force -ErrorAction SilentlyContinue
                Write-Host "     ($($suffix.TrimStart('-')) file removed)" -ForegroundColor DarkGray
            }
        }
    }
}

function Install-Server {
    Write-Step "Server"
    $ServerDir = Join-Path $Root "server"

    Push-Location $ServerDir
    try {
        Invoke-NpmInstall "npm install (server)"
        Invoke-Checked "npm run build" { npm run build 2>&1 | Write-Host }
        Write-Ok "Server built → $ServerDir\dist"

        # Ensure fallback REST transport entrypoint is present in build output.
        $fallbackEntry = Join-Path $ServerDir "dist\fallback-rest-main.js"
        if (-not (Test-Path $fallbackEntry)) {
            Write-Fail "Fallback server entrypoint missing after build: $fallbackEntry"
            exit 1
        }
        Write-Ok "Fallback server built → $fallbackEntry"

        # Archive old DB if -NewDatabase was requested (before seed creates a new one)
        if ($NewDatabase) {
            Archive-Database
        }

        # Initialise the SQLite database and seed static data (tools, agents,
        # instructions, skills). Idempotent — safe to run on every install.
        # When -NewDatabase is used, this creates the schema from scratch.
        Invoke-Checked "node dist/db/seed.js (DB init + seed)" {
            node (Join-Path $ServerDir "dist\db\seed.js") 2>&1 | Write-Host
        }

        if ($NewDatabase) {
            Write-Ok "Fresh database created at %APPDATA%\ProjectMemory\project-memory.db"
        } else {
            Write-Ok "Database initialised at %APPDATA%\ProjectMemory\project-memory.db"
        }
    } finally {
        Pop-Location
    }
}

function Install-FallbackServer {
    Write-Step "Fallback Server"
    $ServerDir = Join-Path $Root "server"

    Push-Location $ServerDir
    try {
        Invoke-NpmInstall "npm install (server)"
        Invoke-Checked "npm run build (fallback server)" { npm run build 2>&1 | Write-Host }

        $fallbackEntry = Join-Path $ServerDir "dist\fallback-rest-main.js"
        if (-not (Test-Path $fallbackEntry)) {
            Write-Fail "Fallback server entrypoint missing after build: $fallbackEntry"
            exit 1
        }

        Write-Ok "Fallback server built → $fallbackEntry"
    } finally {
        Pop-Location
    }
}

# ──────────────────────────────────────────────────────────────
# VS Code Extension
# ──────────────────────────────────────────────────────────────

function Install-Extension {
    Write-Step "VS Code Extension"
    $ExtDir = Join-Path $Root "vscode-extension"

    Push-Location $ExtDir
    try {
        if (-not $EffectiveInstallOnly) {
            Invoke-NpmInstall "npm install (extension)"
            Invoke-Checked "npm run compile" { npm run compile 2>&1 | Write-Host }
            Invoke-Checked "npm run package (vsce)" { npx @vscode/vsce package 2>&1 | Write-Host }
            Write-Ok "Extension compiled and packaged"
        } else {
            Write-Host "   (skipping build — InstallOnly mode)" -ForegroundColor DarkGray
        }

        if (-not $SkipInstall) {
            $Vsix = Get-ChildItem -Path $ExtDir -Filter "*.vsix" |
                    Sort-Object LastWriteTime -Descending |
                    Select-Object -First 1

            if ($null -eq $Vsix) {
                Write-Fail "No .vsix file found in $ExtDir"
                exit 1
            }

            Write-Host "   › Installing $($Vsix.Name)" -ForegroundColor Gray

            $InstallArgs = @("--install-extension", $Vsix.FullName)
            if ($Force) { $InstallArgs += "--force" }
            code @InstallArgs
            if ($LASTEXITCODE -ne 0) {
                Write-Fail "code --install-extension failed (exit $LASTEXITCODE)"
                exit $LASTEXITCODE
            }

            Write-Ok "Extension installed: $($Vsix.Name)"
            Write-Host ""
            Write-Host "   Reload VS Code to activate the updated extension:" -ForegroundColor Yellow
            Write-Host "   Ctrl+Shift+P → Developer: Reload Window" -ForegroundColor DarkGray
        } else {
            Write-Ok "Extension packaged (install skipped)"
        }
    } finally {
        Pop-Location
    }
}

# ──────────────────────────────────────────────────────────────
# Dashboard
# ──────────────────────────────────────────────────────────────

function Install-Dashboard {
    Write-Step "Dashboard"
    $DashDir = Join-Path $Root "dashboard"

    # Build React frontend
    Push-Location $DashDir
    try {
        Invoke-NpmInstall "npm install (dashboard)"
        Invoke-Checked "npx vite build" { npx vite build 2>&1 | Write-Host }
        Write-Ok "Dashboard frontend built → $DashDir\dist"
    } finally {
        Pop-Location
    }

    # Build Node.js server
    $ServerDir = Join-Path $DashDir "server"
    Push-Location $ServerDir
    try {
        Invoke-NpmInstall "npm install (dashboard server)"
        Invoke-Checked "npm run build (dashboard server)" { npm run build 2>&1 | Write-Host }
        Write-Ok "Dashboard server built → $ServerDir\dist"
    } finally {
        Pop-Location
    }
}

# ──────────────────────────────────────────────────────────────
# Container
# ──────────────────────────────────────────────────────────────

function Install-Container {
    Write-Step "Container (podman)"

    $NoCache = if ($Force) { "--no-cache" } else { "" }
    $Tag = "project-memory-mcp-project-memory:latest"

    Push-Location $Root
    try {
        $BuildArgs = @("build", "-t", $Tag, ".")
        if ($Force) { $BuildArgs = @("build", "--no-cache", "-t", $Tag, ".") }

        Write-Host "   › podman build $($Force ? '--no-cache ' : '')-t $Tag ." -ForegroundColor Gray
        podman @BuildArgs
        if ($LASTEXITCODE -ne 0) {
            Write-Fail "Container build failed (exit $LASTEXITCODE)"
            exit $LASTEXITCODE
        }
        Write-Ok "Container image built: $Tag"
    } finally {
        Pop-Location
    }
}

# ──────────────────────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────────────────────

$StartTime = Get-Date
Write-Host "Project Memory MCP — Install" -ForegroundColor Magenta
Write-Host "  Components : $($Components -join ', ')" -ForegroundColor DarkGray
Write-Host "  InstallOnly: $EffectiveInstallOnly" -ForegroundColor DarkGray
Write-Host "  SkipInstall: $SkipInstall" -ForegroundColor DarkGray
Write-Host "  Force      : $Force" -ForegroundColor DarkGray
Write-Host "  NewDatabase: $NewDatabase" -ForegroundColor DarkGray

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

$Elapsed = (Get-Date) - $StartTime
Write-Host ""
Write-Host "Done in $([math]::Round($Elapsed.TotalSeconds, 1))s" -ForegroundColor Magenta

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
