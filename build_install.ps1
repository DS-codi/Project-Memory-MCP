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
    Build only — skip all install/post-build actions.

.PARAMETER AutoInstall
    Skip the confirmation prompt and run install/post-build actions automatically
    after all selected components finish building.

.PARAMETER LogFile
    Optional path to a log file. When provided, all script output is written
    to that file via Start-Transcript.

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
    # Build selected components, then auto-install without prompt
    .\build_install.ps1 -Component Server,Extension -AutoInstall

.EXAMPLE
    # Build selected components and write full output to a log file
    .\build_install.ps1 -Component Dashboard -LogFile .\logs\build_install.log

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
    [switch]$AutoInstall,
    [switch]$Force,
    [switch]$NoBuild,  # alias for InstallOnly
    [switch]$NewDatabase,  # archive old DB and create a fresh one

    # Optional path to a local Gemini secrets file (key=value lines).
    # If omitted, defaults to ./secrets/gemini.pmtsa.env when present.
    [string]$GeminiEnvFile,

    # Optional transcript log file path
    [string]$LogFile
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# Resolve root relative to this script's location
$Root = $PSScriptRoot
$script:TranscriptStarted = $false

if ($LogFile) {
    if (-not [System.IO.Path]::IsPathRooted($LogFile)) {
        $LogFile = Join-Path $Root $LogFile
    }

    $logDir = Split-Path -Path $LogFile -Parent
    if ($logDir -and -not (Test-Path $logDir)) {
        New-Item -Path $logDir -ItemType Directory -Force | Out-Null
    }

    Start-Transcript -Path $LogFile -Force | Out-Null
    $script:TranscriptStarted = $true
}

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

function Parse-DotEnvFile {
    param(
        [Parameter(Mandatory)][string]$Path
    )

    $result = @{}
    if (-not (Test-Path $Path)) {
        return $result
    }

    $lines = Get-Content -Path $Path -Encoding UTF8 -ErrorAction Stop
    foreach ($raw in $lines) {
        if ($null -eq $raw) { continue }
        $line = $raw.Trim()
        if ([string]::IsNullOrWhiteSpace($line)) { continue }
        if ($line.StartsWith('#')) { continue }

        $idx = $line.IndexOf('=')
        if ($idx -lt 1) { continue }

        $key = $line.Substring(0, $idx).Trim()
        $value = $line.Substring($idx + 1).Trim()

        if ([string]::IsNullOrWhiteSpace($key)) { continue }

        if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
            if ($value.Length -ge 2) {
                $value = $value.Substring(1, $value.Length - 2)
            }
        }

        $result[$key] = $value
    }

    return $result
}

function Resolve-GeminiSupervisorEnv {
    param(
        [string]$RequestedPath,
        [string]$WorkspaceRoot
    )

    $resolvedPath = $null
    if ($RequestedPath) {
        $resolvedPath = $RequestedPath
        if (-not [System.IO.Path]::IsPathRooted($resolvedPath)) {
            $resolvedPath = Join-Path $WorkspaceRoot $resolvedPath
        }
    } else {
        $defaultPath = Join-Path $WorkspaceRoot 'secrets\gemini.pmtsa.env'
        if (Test-Path $defaultPath) {
            $resolvedPath = $defaultPath
        }
    }

    if (-not $resolvedPath -or -not (Test-Path $resolvedPath)) {
        return [pscustomobject]@{
            Path = $resolvedPath
            Env  = @{}
        }
    }

    $parsed = Parse-DotEnvFile -Path $resolvedPath

    $candidateKey = $null
    foreach ($name in @('GEMINI_API_KEY', 'GOOGLE_API_KEY', 'PMTA-key', 'PMTA_KEY')) {
        if ($parsed.ContainsKey($name) -and -not [string]::IsNullOrWhiteSpace($parsed[$name])) {
            $candidateKey = $parsed[$name]
            break
        }
    }

    if (-not $candidateKey) {
        return [pscustomobject]@{
            Path = $resolvedPath
            Env  = @{}
        }
    }

    # Publish canonical names for downstream runtime/tool compatibility.
    $envMap = @{
        'GEMINI_API_KEY' = $candidateKey
        'GOOGLE_API_KEY' = $candidateKey
    }

    return [pscustomobject]@{
        Path = $resolvedPath
        Env  = $envMap
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

function Push-MsvcQtCompilerFlags {
    if (-not $IsWindows) {
        return [pscustomobject]@{
            CxxFlags = $null
            Cflags   = $null
        }
    }

    $previous = [pscustomobject]@{
        CxxFlags = $env:CXXFLAGS
        Cflags   = $env:CFLAGS
    }

    $requiredFlags = @('/permissive-', '/Zc:__cplusplus')

    foreach ($flag in $requiredFlags) {
        if (-not ($env:CXXFLAGS -match [regex]::Escape($flag))) {
            $env:CXXFLAGS = ((@($env:CXXFLAGS, $flag) | Where-Object { $_ -and $_.Trim() -ne '' }) -join ' ').Trim()
        }
        if (-not ($env:CFLAGS -match [regex]::Escape($flag))) {
            $env:CFLAGS = ((@($env:CFLAGS, $flag) | Where-Object { $_ -and $_.Trim() -ne '' }) -join ' ').Trim()
        }
    }

    Write-Host "   MSVC flags: CXXFLAGS='$env:CXXFLAGS'" -ForegroundColor DarkGray
    return $previous
}

function Pop-MsvcQtCompilerFlags {
    param($Previous)

    if ($null -eq $Previous) {
        return
    }

    $env:CXXFLAGS = $Previous.CxxFlags
    $env:CFLAGS = $Previous.Cflags
}

function Install-Supervisor {
    Write-Step "Supervisor (Rust + Qt QML)"
    Set-CargoNetworkEnv

    # Kill any running supervisor process so the linker can overwrite the exe.
    $running = Get-Process -Name 'supervisor' -ErrorAction SilentlyContinue
    if ($running) {
        Write-Host "   Stopping running supervisor process(es)..." -ForegroundColor Yellow
        $running | Stop-Process -Force -ErrorAction SilentlyContinue
        Start-Sleep -Milliseconds 800
    }

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
    $prevFlags = Push-MsvcQtCompilerFlags
    $env:QMAKE = $Qt.QmakePath
    $env:PATH  = "$($Qt.QtBin);$env:PATH"

    try {
        Invoke-CargoBuild -Arguments @('build', '--release', '-p', 'supervisor', '--features', 'supervisor_qml_gui') -WorkingDirectory $Root

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
        Pop-MsvcQtCompilerFlags -Previous $prevFlags
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
    $prevFlags = Push-MsvcQtCompilerFlags

    try {
        Write-Host "   › Delegating to build-interactive-terminal.ps1 (QtDir=$QtDir)" -ForegroundColor Gray
        & $BuildScript -Profile release -QtDir $QtDir
        if ($LASTEXITCODE -ne 0) {
            Write-Fail "build-interactive-terminal.ps1 failed (exit $LASTEXITCODE)"
            exit $LASTEXITCODE
        }
    } finally {
        Pop-MsvcQtCompilerFlags -Previous $prevFlags
    }

    Write-Ok "interactive-terminal built + Qt runtime deployed → interactive-terminal\target\release\"
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
    $prevFlags = Push-MsvcQtCompilerFlags
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
        Pop-MsvcQtCompilerFlags -Previous $prevFlags
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

function Build-Server {
    Write-Step "Server"
    $ServerDir = Join-Path $Root "server"

    Push-Location $ServerDir
    try {
        Invoke-Checked "npm run build" { npm run build 2>&1 | Write-Host }
        Write-Ok "Server built → $ServerDir\dist"

        Write-Host "   (database init/seed deferred to install phase)" -ForegroundColor DarkGray
    } finally {
        Pop-Location
    }
}

function Install-Server {
    Write-Step "Server Install"
    $ServerDir = Join-Path $Root "server"

    Push-Location $ServerDir
    try {

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
    Write-Step "VS Code Extension Install"
    $ExtDir = Join-Path $Root "vscode-extension"

    Push-Location $ExtDir
    try {
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
    } finally {
        Pop-Location
    }
}

function Build-Extension {
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
        Write-Ok "Extension build complete (installation deferred)"
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

    Push-Location $DashDir
    try {
        Invoke-Checked "npx vite build" { npx vite build 2>&1 | Write-Host }
        Write-Ok "Dashboard built → $DashDir\dist"
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

function Install-SupervisorRuntime {
    $supervisorExe = Join-Path $Root 'target\release\supervisor.exe'
    if (Test-Path $supervisorExe) {
        $stale = Get-Process -Name 'supervisor' -ErrorAction SilentlyContinue
        if ($stale) {
            Write-Host "   Stopping stale supervisor process(es)..." -ForegroundColor Yellow
            $stale | Stop-Process -Force -ErrorAction SilentlyContinue
            Start-Sleep -Milliseconds 600
        }

        Write-Host ""
        Write-Host "── Launching Supervisor" -ForegroundColor Cyan
        $geminiRuntimeEnv = Resolve-GeminiSupervisorEnv -RequestedPath $GeminiEnvFile -WorkspaceRoot $Root
        if ($geminiRuntimeEnv.Env.Count -gt 0) {
            Write-Host "   › Injecting Gemini API credentials into Supervisor process environment" -ForegroundColor Gray
            if ($geminiRuntimeEnv.Path) {
                Write-Host "     source: $($geminiRuntimeEnv.Path)" -ForegroundColor DarkGray
            }
            Start-Process -FilePath $supervisorExe -WorkingDirectory (Split-Path $supervisorExe) -Environment $geminiRuntimeEnv.Env
        } else {
            if ($geminiRuntimeEnv.Path) {
                Write-Host "   [warn] Gemini env file found but no recognized key names (expected GEMINI_API_KEY / GOOGLE_API_KEY / PMTA-key)" -ForegroundColor Yellow
            } else {
                Write-Host "   › No Gemini env file detected; launching Supervisor without Gemini API env overrides" -ForegroundColor Gray
            }
            Start-Process -FilePath $supervisorExe -WorkingDirectory (Split-Path $supervisorExe)
        }
        Write-Host "   ✓ supervisor launched" -ForegroundColor Green
    } else {
        Write-Host "   [warn] supervisor.exe not found — skipping launch" -ForegroundColor Yellow
    }
}

try {
    $StartTime = Get-Date
    Write-Host "Project Memory MCP — Build + Install" -ForegroundColor Magenta
    Write-Host "  Components : $($Components -join ', ')" -ForegroundColor DarkGray
    Write-Host "  InstallOnly: $EffectiveInstallOnly" -ForegroundColor DarkGray
    Write-Host "  AutoInstall: $AutoInstall" -ForegroundColor DarkGray
    Write-Host "  SkipInstall: $SkipInstall" -ForegroundColor DarkGray
    Write-Host "  Force      : $Force" -ForegroundColor DarkGray
    Write-Host "  NewDatabase: $NewDatabase" -ForegroundColor DarkGray
    if ($GeminiEnvFile) {
        Write-Host "  GeminiEnv : $GeminiEnvFile" -ForegroundColor DarkGray
    }
    if ($LogFile) {
        Write-Host "  LogFile   : $LogFile" -ForegroundColor DarkGray
    }

    Write-Host ""
    Write-Host "== Build phase ==" -ForegroundColor Cyan
    foreach ($comp in $Components) {
        switch ($comp) {
            "Supervisor"          { Install-Supervisor }
            "GuiForms"            { Install-GuiForms }
            "InteractiveTerminal" { Install-InteractiveTerminal }
            "Server"              { Build-Server }
            "Dashboard"           { Install-Dashboard }
            "Extension"           { Build-Extension }
            "Container"           { Install-Container }
        }
    }

    $InstallableComponents = New-Object System.Collections.Generic.List[string]
    if ($Components -contains "Server") { $InstallableComponents.Add("Server") }
    if ($Components -contains "Extension") { $InstallableComponents.Add("Extension") }
    if ($Components -contains "Supervisor") { $InstallableComponents.Add("Supervisor") }

    $DoInstall = $false
    if ($SkipInstall) {
        Write-Host ""
        Write-Host "Install phase skipped by -SkipInstall." -ForegroundColor Yellow
    } elseif ($InstallableComponents.Count -eq 0) {
        Write-Host ""
        Write-Host "No install actions are defined for the selected components." -ForegroundColor DarkGray
    } elseif ($AutoInstall) {
        $DoInstall = $true
        Write-Host ""
        Write-Host "AutoInstall enabled — running install phase without prompt." -ForegroundColor DarkGray
    } else {
        Write-Host ""
        $installResponse = Read-Host "Install components now (y/N) ?"
        if ($installResponse -match '^(?i:y|yes)$') {
            $DoInstall = $true
        }
    }

    if ($DoInstall) {
        Write-Host ""
        Write-Host "== Install phase ==" -ForegroundColor Cyan
        foreach ($comp in $InstallableComponents) {
            switch ($comp) {
                "Server" { Install-Server }
                "Extension" { Install-Extension }
                "Supervisor" { Install-SupervisorRuntime }
            }
        }
    }

    $Elapsed = (Get-Date) - $StartTime
    Write-Host ""
    Write-Host "Done in $([math]::Round($Elapsed.TotalSeconds, 1))s" -ForegroundColor Magenta
}
finally {
    if ($script:TranscriptStarted) {
        Stop-Transcript | Out-Null
    }
}
