#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Install script for Project Memory MCP components.

.DESCRIPTION
    Builds and installs one or more components of the Project Memory MCP system.
    Components: Server, Extension, Container.

.PARAMETER Component
    Which component(s) to build and install. Accepts an array.
    Valid values: Server, Extension, Container, All
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
#>

[CmdletBinding()]
param(
    [ValidateSet("Server", "Extension", "Container", "Supervisor", "InteractiveTerminal", "Dashboard", "GuiForms", "All")]
    [string[]]$Component = @("All"),

    [switch]$InstallOnly,
    [switch]$SkipInstall,
    [switch]$Force,
    [switch]$NoBuild,  # alias for InstallOnly
    [switch]$NewDatabase,  # archive old DB and create a fresh one
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
    Write-Host "  Supervisor, GuiForms, InteractiveTerminal, Server, Dashboard, Extension, Container, All"
    Write-Host ""
    Write-Host "Flags:" -ForegroundColor Cyan
    Write-Host "  -InstallOnly   Extension only: install latest .vsix without rebuilding"
    Write-Host "  -SkipInstall   Extension only: build/package but skip code --install-extension"
    Write-Host "  -Force         Pass --force for extension install; use --no-cache for container build"
    Write-Host "  -NoBuild       Alias for -InstallOnly"
    Write-Host "  -NewDatabase   Archive existing SQLite DB and create a fresh one during server setup"
    Write-Host "  -h, -Help      Show this help message"
    Write-Host "  --help         Also accepted"
}

if ($Help -or ($RemainingArgs -contains '--help')) {
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
        Invoke-CargoBuild -Arguments @('build', '--release', '-p', 'supervisor') -WorkingDirectory $Root

        $deployTool = Join-Path $Qt.QtBin 'windeployqt.exe'
        $supervisorQmlDir = Join-Path $Root 'supervisor'
        $supervisorExe = Join-Path $Root 'target\release\supervisor.exe'
        Invoke-WinDeployQt -ToolPath $deployTool -ExePath $supervisorExe -QmlDir $supervisorQmlDir -Label 'supervisor'

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
        Invoke-CargoBuild -Arguments @('build', '--release', '-p', 'pm-approval-gui')   -WorkingDirectory $Root
        $deployTool = Join-Path $Qt.QtBin 'windeployqt.exe'
        $approvalQmlDir = Join-Path $Root 'pm-approval-gui'
        $approvalExe = Join-Path $Root 'target\release\pm-approval-gui.exe'
        Invoke-WinDeployQt -ToolPath $deployTool -ExePath $approvalExe -QmlDir $approvalQmlDir -Label 'pm-approval-gui'
        Write-Ok "pm-approval-gui built → target/release/pm-approval-gui.exe"

        Invoke-CargoBuild -Arguments @('build', '--release', '-p', 'pm-brainstorm-gui') -WorkingDirectory $Root
        $brainstormQmlDir = Join-Path $Root 'pm-brainstorm-gui'
        $brainstormExe = Join-Path $Root 'target\release\pm-brainstorm-gui.exe'
        Invoke-WinDeployQt -ToolPath $deployTool -ExePath $brainstormExe -QmlDir $brainstormQmlDir -Label 'pm-brainstorm-gui'
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
        Invoke-Checked "npm run build" { npm run build 2>&1 | Write-Host }
        Write-Ok "Server built → $ServerDir\dist"

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

# ──────────────────────────────────────────────────────────────
# VS Code Extension
# ──────────────────────────────────────────────────────────────

function Install-Extension {
    Write-Step "VS Code Extension"
    $ExtDir = Join-Path $Root "vscode-extension"

    Push-Location $ExtDir
    try {
        if (-not $EffectiveInstallOnly) {
            Invoke-Checked "npm install" { npm install 2>&1 | Write-Host }
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
        Invoke-Checked "npx vite build" { npx vite build 2>&1 | Write-Host }
        Write-Ok "Dashboard frontend built → $DashDir\dist"
    } finally {
        Pop-Location
    }

    # Build Node.js server
    $ServerDir = Join-Path $DashDir "server"
    Push-Location $ServerDir
    try {
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
        "InteractiveTerminal" { Install-InteractiveTerminal }
        "Server"              { Install-Server }
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
    Write-Host ""
    if (Test-Path $launchScript) {
        $launchNow = Read-Host 'Build complete. Launch supervisor now? (Y/N)'
        if ($launchNow -match '^(?i)y(?:es)?$') {
            Write-Host "── Launching Supervisor via launch script" -ForegroundColor Cyan
            & $launchScript
        } else {
            Write-Host "   Supervisor was not launched." -ForegroundColor Yellow
            Write-Host "   Launch command:" -ForegroundColor DarkGray
            Write-Host "   & '$launchScript'" -ForegroundColor DarkGray
        }
    } else {
        Write-Host "   [warn] launch script not found: $launchScript" -ForegroundColor Yellow
    }
}
