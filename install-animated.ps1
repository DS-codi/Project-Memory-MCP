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
    [ValidateSet("Server", "Extension", "Container", "Supervisor", "InteractiveTerminal", "Dashboard", "GuiForms", "All", "--help")]
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
    Write-Host "  .\install-animated.ps1 [-Component <list>] [-InstallOnly] [-SkipInstall] [-Force] [-NoBuild] [-NewDatabase] [-h|-Help|--help]"
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

function Show-Banner {
    $banner = @'
    ____             _           __     __  ___                              
   / __ \_________  (_)__  _____/ /_   /  |/  /___  ____ ___  ____  _______  __
  / /_/ / ___/ __ \/ / _ \/ ___/ __/  / /|_/ / _ \/ __ `__ \/ __ \/ ___/ / / /
 / ____/ /  / /_/ / /  __/ /__/ /_   / /  / /  __/ / / / / / /_/ / /  / /_/ / 
/_/   /_/   \____/ /\___/\___/\__/  /_/  /_/\___/_/ /_/ /_/\____/_/   \__, /  
              /___/                                                  /____/   
'@

    Clear-Host
    Write-Host $banner -ForegroundColor Cyan
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

# ──────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────

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
    Write-InstallStatus -Stage "installing" -Style 'Pulse'
    $tmpOut = [System.IO.Path]::GetTempFileName()
    try {
        & $block *> $tmpOut
        Add-WarningsFromLines -Lines (Get-Content $tmpOut -ErrorAction SilentlyContinue) -Source $description
    } finally {
        Remove-Item $tmpOut -Force -ErrorAction SilentlyContinue
    }
    Reset-InstallStatusLine
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "$description failed (exit $LASTEXITCODE)"
        exit $LASTEXITCODE
    }
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
    Write-InstallStatus -Stage "deploying qml" -QmlImports 0 -Warnings 0 -Style 'Scanner'

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
                Write-InstallStatus -Stage "deploying qml" -QmlImports $qmlImportCount -Warnings 0 -Style 'Scanner'
                continue
            }
            $inQmlImports = $false
        }

        if     ($trimmed -match '^Warning:')                                      { }
        elseif ($trimmed -match '^Error:|^ERROR\b')                               { }
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

        if (($qmlImportCount -gt 0) -and (($qmlImportCount % 8) -eq 0)) {
            Write-InstallStatus -Stage "deploying qml" -QmlImports $qmlImportCount -Warnings 0 -Style 'Scanner'
        }
    }

    Reset-InstallStatusLine
    Add-WarningsFromLines -Lines $result.AllLines -Source $displayLabel

    $null = $upToDateCount
    $null = $translationCount
    $null = $localDependencyCount
    $null = $binaryDescriptorCount
    $null = $scannedPathCount
    $null = $pluginTypeAddCount
    $null = $pluginResolvedCount
    $null = $skippedPluginCount
    $null = $additionalPassCount
    $null = $directDependenciesLine
    $null = $allDependenciesLine
    $null = $toBeDeployedLine

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
    Write-InstallStatus -Stage "compiling" -Warnings 0 -Style 'Wave'

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
                Write-InstallStatus -Stage "compiling" -Warnings $warnCount -Style 'Wave'
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

        # Collect warnings without replaying compiler output.
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
        }
        if ($warnBlockCount -gt 0) {
            Add-WarningsFromLines -Lines @("suppressed $warnBlockCount rust warning block(s)") -Source $label
        }
        Add-WarningsFromLines -Lines $allLines -Source $label

        $exitCode = $process.ExitCode
        $finished = @($allLines | Where-Object { $_ -match '^\s*Finished\s+`?(debug|release)`?' }).Count -gt 0

        if ($exitCode -ne 0 -and -not $finished) {
            Write-Fail "$label failed (exit $exitCode)"
            exit $exitCode
        }
    } finally {
        Reset-InstallStatusLine
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
    Set-CurrentComponent 'Supervisor'
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
    Set-CurrentComponent 'InteractiveTerminal'
    Write-Step "Interactive Terminal (Rust + Qt)"

    $CanonicalInstallScript = Join-Path $Root 'install.ps1'
    if (-not (Test-Path $CanonicalInstallScript)) {
        Write-Fail "Canonical installer not found at $CanonicalInstallScript"
        exit 1
    }

    Invoke-CheckedCommand -Description 'install.ps1 -Component InteractiveTerminal' `
        -FilePath 'pwsh' `
        -Arguments @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $CanonicalInstallScript, '-Component', 'InteractiveTerminal') `
        -WorkingDirectory $Root `
        -Stage 'installing' `
        -Style 'Pulse'

    Write-Ok "interactive-terminal built via canonical install.ps1 path"
}

# ──────────────────────────────────────────────────────────────
# PM GUI Binaries  (pm-approval-gui, pm-brainstorm-gui)
# ──────────────────────────────────────────────────────────────

function Install-GuiForms {
    Set-CurrentComponent 'GuiForms'
    Write-Step "PM GUI Binaries (pm-approval-gui, pm-brainstorm-gui)"

    try {
        $Qt = Resolve-QtToolchain
    } catch {
        Write-Fail $_.Exception.Message
        exit 1
    }


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

    Write-InstallStatus -Stage "archiving database" -Style 'Pulse'

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
    Set-CurrentComponent 'Server'
    Write-Step "Server"
    $ServerDir = Join-Path $Root "server"

    Push-Location $ServerDir
    try {
        Invoke-CheckedCommand -Description 'npm run build' -FilePath 'npm' -Arguments @('run', 'build') -WorkingDirectory $ServerDir -Stage 'installing' -Style 'Pulse'
        Write-Ok "Server built → $ServerDir\dist"

        # Archive old DB if -NewDatabase was requested (before seed creates a new one)
        if ($NewDatabase) {
            Archive-Database
        }

        # Initialise the SQLite database and seed static data (tools, agents,
        # instructions, skills). Idempotent — safe to run on every install.
        # When -NewDatabase is used, this creates the schema from scratch.
        $seedScript = Join-Path $ServerDir 'dist\db\seed.js'
        Invoke-CheckedCommand -Description 'node dist/db/seed.js (DB init + seed)' -FilePath 'node' -Arguments @($seedScript) -WorkingDirectory $ServerDir -Stage 'installing' -Style 'Pulse'

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
    Set-CurrentComponent 'Extension'
    Write-Step "VS Code Extension"
    $ExtDir = Join-Path $Root "vscode-extension"

    Push-Location $ExtDir
    try {
        if (-not $EffectiveInstallOnly) {
            Invoke-CheckedCommand -Description 'npm install' -FilePath 'npm' -Arguments @('install') -WorkingDirectory $ExtDir -Stage 'installing' -Style 'Pulse'
            Invoke-CheckedCommand -Description 'npm run compile' -FilePath 'npm' -Arguments @('run', 'compile') -WorkingDirectory $ExtDir -Stage 'installing' -Style 'Pulse'
            Invoke-CheckedCommand -Description 'npm run package (vsce)' -FilePath 'npx' -Arguments @('@vscode/vsce', 'package') -WorkingDirectory $ExtDir -Stage 'installing' -Style 'Pulse'
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

            $InstallArgs = @("--install-extension", $Vsix.FullName)
            if ($Force) { $InstallArgs += "--force" }
            Invoke-CheckedCommand -Description 'code --install-extension' -FilePath 'code' -Arguments $InstallArgs -WorkingDirectory $ExtDir -Stage 'installing' -Style 'Pulse'

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
    Set-CurrentComponent 'Dashboard'
    Write-Step "Dashboard"
    $DashDir = Join-Path $Root "dashboard"

    # Build React frontend
    Push-Location $DashDir
    try {
        Invoke-CheckedCommand -Description 'npx vite build' -FilePath 'npx' -Arguments @('vite', 'build') -WorkingDirectory $DashDir -Stage 'installing' -Style 'Pulse'
        Write-Ok "Dashboard frontend built → $DashDir\dist"
    } finally {
        Pop-Location
    }

    # Build Node.js server
    $ServerDir = Join-Path $DashDir "server"
    Push-Location $ServerDir
    try {
        Invoke-CheckedCommand -Description 'npm run build (dashboard server)' -FilePath 'npm' -Arguments @('run', 'build') -WorkingDirectory $ServerDir -Stage 'installing' -Style 'Pulse'
        Write-Ok "Dashboard server built → $ServerDir\dist"
    } finally {
        Pop-Location
    }
}

# ──────────────────────────────────────────────────────────────
# Container
# ──────────────────────────────────────────────────────────────

function Install-Container {
    Set-CurrentComponent 'Container'
    Write-Step "Container (podman)"

    $Tag = "project-memory-mcp-project-memory:latest"

    Push-Location $Root
    try {
        $BuildArgs = @("build", "-t", $Tag, ".")
        if ($Force) { $BuildArgs = @("build", "--no-cache", "-t", $Tag, ".") }

        Invoke-CheckedCommand -Description 'podman build' -FilePath 'podman' -Arguments $BuildArgs -WorkingDirectory $Root -Stage 'installing' -Style 'Pulse'
        Write-Ok "Container image built: $Tag"
    } finally {
        Pop-Location
    }
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
