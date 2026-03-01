param(
    [switch]$Clean,
    [switch]$Test,
    [switch]$Run,
    [switch]$Deploy,
    [string]$WarningsImportsLogPath = '',
    [int]$Port = 9100,
    [ValidateSet('debug', 'release')]
    [string]$Profile = 'release',
    [string]$QtDir = $(if ($env:QT_DIR) { $env:QT_DIR } else { 'C:\Qt\6.10.2\msvc2022_64' })
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$PSNativeCommandUseErrorActionPreference = $false

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

function Invoke-NativeCommandCapture {
    param(
        [Parameter(Mandatory = $true)]
        [string]$FilePath,
        [string[]]$Arguments = @(),
        [string]$WorkingDirectory = $scriptDir
    )

    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $FilePath
    $psi.WorkingDirectory = $WorkingDirectory
    $psi.UseShellExecute = $false
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.CreateNoWindow = $true

    $escapedArgs = $Arguments | ForEach-Object {
        if ($_ -match '[\s"]') {
            '"' + ($_ -replace '"', '\\"') + '"'
        } else {
            $_
        }
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

    $stdoutLines = @()
    if (-not [string]::IsNullOrEmpty($stdout)) {
        $stdoutLines = $stdout -split "`r?`n" | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
    }

    $stderrLines = @()
    if (-not [string]::IsNullOrEmpty($stderr)) {
        $stderrLines = $stderr -split "`r?`n" | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
    }

    return [PSCustomObject]@{
        ExitCode = $process.ExitCode
        StdOut = $stdout
        StdErr = $stderr
        StdOutLines = $stdoutLines
        StdErrLines = $stderrLines
        AllLines = @($stdoutLines + $stderrLines)
    }
}

function Invoke-CargoBuildWithWarningProgress {
    param(
        [string[]]$Arguments = @(),
        [string]$WorkingDirectory = $scriptDir,
        [int]$PollIntervalMs = 1500,
        [int]$HeartbeatSeconds = 5
    )

    $escapedArgs = $Arguments | ForEach-Object {
        if ($_ -match '[\s"]') {
            '"' + ($_ -replace '"', '\\"') + '"'
        } else {
            $_
        }
    }
    $argumentsString = [string]::Join(' ', $escapedArgs)

    $stdoutFile = [System.IO.Path]::GetTempFileName()
    $stderrFile = [System.IO.Path]::GetTempFileName()

    try {
        $processFilePath = 'cargo'
        $processArguments = $argumentsString
        if ($env:OS -eq 'Windows_NT') {
            $processFilePath = 'cmd.exe'
            $processArguments = "/c cargo $argumentsString"
        }

        $process = Start-Process -FilePath $processFilePath `
            -ArgumentList $processArguments `
            -WorkingDirectory $WorkingDirectory `
            -NoNewWindow `
            -PassThru `
            -RedirectStandardOutput $stdoutFile `
            -RedirectStandardError $stderrFile

        $lastWarningCount = -1
        $lastHeartbeat = [DateTime]::UtcNow.AddSeconds(-1 * [Math]::Max(1, $HeartbeatSeconds))

        while (-not $process.HasExited) {
            $warningCount = 0
            if (Test-Path $stderrFile) {
                try {
                    $warningCount = (Select-String -Path $stderrFile -Pattern '^warning:' -SimpleMatch:$false).Count
                } catch {
                    $warningCount = $lastWarningCount
                    if ($warningCount -lt 0) { $warningCount = 0 }
                }
            }

            $now = [DateTime]::UtcNow
            if ($warningCount -ne $lastWarningCount -or ($now - $lastHeartbeat).TotalSeconds -ge $HeartbeatSeconds) {
                Write-Host ("cargo build in progress... warnings so far: {0}" -f $warningCount) -ForegroundColor DarkGray
                $lastWarningCount = $warningCount
                $lastHeartbeat = $now
            }

            Start-Sleep -Milliseconds ([Math]::Max(200, $PollIntervalMs))
        }

        $process.WaitForExit()

        $stdout = if (Test-Path $stdoutFile) { Get-Content -Path $stdoutFile -Raw -ErrorAction SilentlyContinue } else { '' }
        $stderr = if (Test-Path $stderrFile) { Get-Content -Path $stderrFile -Raw -ErrorAction SilentlyContinue } else { '' }

        if ($null -eq $stdout) { $stdout = '' }
        if ($null -eq $stderr) { $stderr = '' }

        $stdoutLines = @()
        if (-not [string]::IsNullOrEmpty($stdout)) {
            $stdoutLines = $stdout -split "`r?`n" | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
        }

        $stderrLines = @()
        if (-not [string]::IsNullOrEmpty($stderr)) {
            $stderrLines = $stderr -split "`r?`n" | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
        }

        $exitCode = -1
        if ($process.HasExited) {
            $process.Refresh()
            $exitCode = $process.ExitCode
        }

        return [PSCustomObject]@{
            ExitCode = $exitCode
            StdOut = $stdout
            StdErr = $stderr
            StdOutLines = $stdoutLines
            StdErrLines = $stderrLines
            AllLines = @($stdoutLines + $stderrLines)
        }
    }
    finally {
        if (Test-Path $stdoutFile) {
            Remove-Item -Path $stdoutFile -Force -ErrorAction SilentlyContinue
        }
        if (Test-Path $stderrFile) {
            Remove-Item -Path $stderrFile -Force -ErrorAction SilentlyContinue
        }
    }
}

function Resolve-WarningsImportsLogPath {
    param(
        [string]$RequestedPath,
        [string]$DefaultDirectory
    )

    if ([string]::IsNullOrWhiteSpace($RequestedPath)) {
        return $null
    }

    $trimmed = $RequestedPath.Trim()
    $isDirectoryHint = $trimmed.EndsWith('\') -or $trimmed.EndsWith('/')

    if ($isDirectoryHint -or (Test-Path $trimmed -PathType Container)) {
        if (-not (Test-Path $trimmed)) {
            New-Item -ItemType Directory -Force -Path $trimmed | Out-Null
        }
        return Join-Path $trimmed ("warnings-imports-{0}.txt" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
    }

    $parent = Split-Path -Parent $trimmed
    if (-not [string]::IsNullOrWhiteSpace($parent) -and -not (Test-Path $parent)) {
        New-Item -ItemType Directory -Force -Path $parent | Out-Null
    }

    if ([string]::IsNullOrWhiteSpace($parent)) {
        return Join-Path $DefaultDirectory $trimmed
    }

    return $trimmed
}

function Stop-InteractiveTerminalProcesses {
    param()

    $stoppedCount = 0

    $candidateProcesses = @(Get-Process -Name 'interactive-terminal', 'interactive_terminal' -ErrorAction SilentlyContinue)
    foreach ($proc in $candidateProcesses) {
        $procPath = ''
        try {
            $procPath = $proc.Path
        }
        catch {
            $procPath = ''
        }

        if ([string]::IsNullOrWhiteSpace($procPath)) {
            Write-Host "Stopping locked process: $($proc.ProcessName) (PID $($proc.Id))" -ForegroundColor Yellow
        }
        else {
            Write-Host "Stopping locked process: $($proc.ProcessName) (PID $($proc.Id)) at $procPath" -ForegroundColor Yellow
        }

        Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
        $stoppedCount += 1
    }

    return $stoppedCount
}

function Invoke-CargoCleanWithLockRecovery {
    param(
        [int]$MaxAttempts = 3,
        [string]$WorkingDirectory = $scriptDir,
        # When non-empty, run 'cargo clean -p <Package>' instead of a full 'cargo clean'.
        # This is faster and avoids discarding unrelated workspace build artifacts.
        [string]$Package = ''
    )

    $preStopped = Stop-InteractiveTerminalProcesses
    if ($preStopped -gt 0) {
        Write-Host "Pre-clean sweep stopped $preStopped interactive-terminal process(es)." -ForegroundColor Yellow
        Start-Sleep -Seconds 1
    }

    $cleanArgs = if ($Package) { @('clean', '-p', $Package) } else { @('clean') }

    for ($attempt = 1; $attempt -le [Math]::Max(1, $MaxAttempts); $attempt++) {
        $cleanResult = Invoke-NativeCommandCapture -FilePath 'cargo' -Arguments $cleanArgs -WorkingDirectory $WorkingDirectory
        foreach ($line in $cleanResult.AllLines) {
            Write-Host $line
        }

        if ([int]$cleanResult.ExitCode -eq 0) {
            return
        }

        $cleanOutput = @($cleanResult.AllLines) -join "`n"
        $isLockedFileError = $cleanOutput -match 'Access is denied|os error 5|failed to remove file'

        if (-not $isLockedFileError -or $attempt -ge $MaxAttempts) {
            throw 'cargo clean failed.'
        }

        Write-Host "cargo clean attempt $attempt failed due to locked files. Attempting recovery..." -ForegroundColor Yellow
        $stopped = Stop-InteractiveTerminalProcesses
        if ($stopped -eq 0) {
            Write-Host 'No interactive-terminal process found to stop. Retrying clean anyway...' -ForegroundColor Yellow
        }
        Start-Sleep -Seconds 2
    }
}

function Get-DependencyCountFromLine {
    param([string]$DependencyLine)

    if ([string]::IsNullOrWhiteSpace($DependencyLine)) {
        return 0
    }

    return (($DependencyLine -split '\s+') | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }).Count
}

$capturedWarnings = New-Object 'System.Collections.Generic.List[string]'
$capturedQmlImports = New-Object 'System.Collections.Generic.List[string]'

if (-not (Test-Path $QtDir)) {
    throw "Qt directory not found at: $QtDir. Set `$env:QT_DIR` to your Qt installation path (e.g. 'C:\Qt\6.10.2\msvc2022_64')."
}

$qtBin = Join-Path $QtDir 'bin'
$qmakePath = Join-Path $qtBin 'qmake6.exe'

if (-not (Test-Path $qmakePath)) {
    throw "qmake6.exe not found at: $qmakePath"
}

$env:QMAKE = $qmakePath
$env:PATH = "$qtBin;$env:PATH"

# Cargo network stability defaults for Windows environments where certificate
# revocation checks are blocked by corporate/firewall policy.
if (-not $env:CARGO_HTTP_CHECK_REVOKE) {
    $env:CARGO_HTTP_CHECK_REVOKE = 'false'
}
if (-not $env:CARGO_REGISTRIES_CRATES_IO_PROTOCOL) {
    $env:CARGO_REGISTRIES_CRATES_IO_PROTOCOL = 'sparse'
}
if (-not $env:CARGO_NET_GIT_FETCH_WITH_CLI) {
    $env:CARGO_NET_GIT_FETCH_WITH_CLI = 'true'
}

Write-Host '=== Interactive Terminal Build ===' -ForegroundColor Cyan
Write-Host "QtDir:   $QtDir" -ForegroundColor Gray
Write-Host "QMAKE:   $env:QMAKE" -ForegroundColor Gray
Write-Host "Profile: $Profile" -ForegroundColor Gray
Write-Host "Cargo SSL revoke check: $env:CARGO_HTTP_CHECK_REVOKE" -ForegroundColor Gray
Write-Host "Cargo registry protocol: $env:CARGO_REGISTRIES_CRATES_IO_PROTOCOL" -ForegroundColor Gray
Write-Host "Cargo git fetch via CLI: $env:CARGO_NET_GIT_FETCH_WITH_CLI" -ForegroundColor Gray

$doDeploy = ($Profile -eq 'release') -or $Deploy.IsPresent
Write-Host "Deploy:  $doDeploy" -ForegroundColor Gray

& $env:QMAKE --version
if ($LASTEXITCODE -ne 0) {
    throw 'qmake version check failed.'
}

if ($Clean) {
    Write-Host 'Cleaning build artifacts...' -ForegroundColor Yellow
    Invoke-CargoCleanWithLockRecovery
}

if ($Test) {
    Write-Host 'Running tests...' -ForegroundColor Cyan
    cargo test
    if ($LASTEXITCODE -ne 0) {
        throw 'cargo test failed.'
    }

    # Qt deployment validation: verify required DLLs are present in the build
    # output directory.  This runs after cargo test and only when -Test is
    # specified, ensuring the deployment artifacts are present for release
    # builds.
    $testTargetDir = if ($Profile -eq 'release') { 'release' } else { 'debug' }
    $testExePath   = Join-Path $scriptDir "target\$testTargetDir\interactive-terminal.exe"
    $testOutputDir = Split-Path -Parent $testExePath

    if (Test-Path $testExePath) {
        Write-Host 'Validating Qt deployment artifacts...' -ForegroundColor Cyan

        $deployRequiredDlls = @('Qt6Core.dll', 'Qt6Gui.dll', 'Qt6Qml.dll', 'Qt6Quick.dll')
        $deployMissingDlls  = @()

        foreach ($dll in $deployRequiredDlls) {
            $dllPath = Join-Path $testOutputDir $dll
            if (-not (Test-Path $dllPath)) {
                $deployMissingDlls += $dll
            }
        }

        # Check for the platform plugin
        $platformPlugin = Join-Path $testOutputDir 'platforms\qwindows.dll'
        if (-not (Test-Path $platformPlugin)) {
            $deployMissingDlls += 'platforms\qwindows.dll'
        }

        if ($deployMissingDlls.Count -gt 0) {
            Write-Host "Qt deployment validation WARNING: Missing DLLs: $($deployMissingDlls -join ', ')" -ForegroundColor Yellow
            Write-Host 'Run with -Deploy or build in release mode to deploy Qt runtime.' -ForegroundColor Yellow
        } else {
            Write-Host 'Qt deployment validation PASSED — all required DLLs present.' -ForegroundColor Green
        }
    } else {
        Write-Host 'Skipping Qt deployment validation (executable not found; build first).' -ForegroundColor Yellow
    }
}

# ── QML freshness detection ──────────────────────────────────────────────────
# CxxQtBuilder emits cargo:rerun-if-changed for QML files, but cargo's
# incremental fingerprint cache can still skip build.rs in some configurations
# (e.g. after a workspace binary path change or after manual edits to .qml
# without a corresponding Rust source change).  When any .qml or build.rs is
# newer than the current binary we run a package-scoped clean so that the next
# build is guaranteed to re-embed the updated QML resources.
if (-not $Clean) {
    $earlyTargetDir = if ($Profile -eq 'release') { 'release' } else { 'debug' }
    $earlyBinPath   = Join-Path $scriptDir "target\$earlyTargetDir\interactive-terminal.exe"
    if (-not (Test-Path $earlyBinPath)) {
        $earlyWsRoot = Split-Path -Parent $scriptDir
        $earlyBinPath = Join-Path $earlyWsRoot "target\$earlyTargetDir\interactive-terminal.exe"
    }
    if (Test-Path $earlyBinPath) {
        $binTime     = (Get-Item $earlyBinPath).LastWriteTime
        $buildRsPath = Join-Path $scriptDir 'build.rs'
        $qmlRoot     = Join-Path $scriptDir 'qml'
        $changedSources = @()
        $qmlFiles = Get-ChildItem -Path $qmlRoot -Recurse -Include '*.qml' -ErrorAction SilentlyContinue
        foreach ($f in $qmlFiles) {
            if ($f.LastWriteTime -gt $binTime) { $changedSources += $f.Name }
        }
        if ((Test-Path $buildRsPath) -and ((Get-Item $buildRsPath).LastWriteTime -gt $binTime)) {
            $changedSources += 'build.rs'
        }
        if ($changedSources.Count -gt 0) {
            Write-Host "QML source changes detected ($($changedSources -join ', ')) — running package-scoped clean to guarantee fresh embed..." -ForegroundColor Yellow
            Invoke-CargoCleanWithLockRecovery -Package 'interactive-terminal'
        }
    }
}

$buildArgs = @('build')
if ($Profile -eq 'release') {
    $buildArgs += '--release'
}

Write-Host "Running: cargo $($buildArgs -join ' ')" -ForegroundColor Cyan
$cargoResult = Invoke-CargoBuildWithWarningProgress -Arguments $buildArgs -WorkingDirectory $scriptDir

foreach ($line in $cargoResult.StdOutLines) {
    $trimmed = $line.Trim()
    if ($trimmed -match '^warning[:\[]') {
        [void]$capturedWarnings.Add($line)
        Write-Host $line -ForegroundColor Yellow
    } elseif ($trimmed -match '^error[:\[]') {
        Write-Host $line -ForegroundColor Red
    } else {
        Write-Host $line
    }
}

foreach ($line in $cargoResult.StdErrLines) {
    $trimmed = $line.Trim()
    if ($trimmed -match '^warning[:\[]') {
        [void]$capturedWarnings.Add($line)
        Write-Host $line -ForegroundColor Yellow
    } elseif ($trimmed -match '^error[:\[]') {
        Write-Host $line -ForegroundColor Red
    } else {
        Write-Host $line
    }
}

$cargoExitCode = if ($null -eq $cargoResult.ExitCode) { -1 } else { [int]$cargoResult.ExitCode }
$cargoFinishedMarker = @($cargoResult.AllLines | Where-Object { $_ -match '^\s*Finished\s+`?(debug|release)`?\s+profile\s+\[.*\]\s+target\(s\)\s+in\s+' }).Count -gt 0

if ($cargoExitCode -ne 0 -and -not $cargoFinishedMarker) {
    $cargoText = @($cargoResult.AllLines) -join "`n"
    if ($cargoText -match 'CRYPT_E_NO_REVOCATION_CHECK|SSL connect error') {
        Write-Host '' -ForegroundColor Yellow
        Write-Host 'Detected Windows certificate revocation check failure (schannel).' -ForegroundColor Yellow
        Write-Host 'The script sets CARGO_HTTP_CHECK_REVOKE=false for this session.' -ForegroundColor Yellow
        Write-Host 'To persist system-wide for your user profile:' -ForegroundColor Yellow
        Write-Host '  setx CARGO_HTTP_CHECK_REVOKE false' -ForegroundColor Yellow
    }
    throw 'cargo build failed.'
}

$exeName = 'interactive-terminal.exe'
$targetDir = if ($Profile -eq 'release') { 'release' } else { 'debug' }

# For standalone builds we expect the binary in crate-local target/.  Keep a
# workspace-root fallback for environments with an explicit shared target dir.
$workspaceRoot = Split-Path -Parent $scriptDir
$exePathWorkspace = Join-Path $workspaceRoot "target\$targetDir\$exeName"
$exePathLocal     = Join-Path $scriptDir     "target\$targetDir\$exeName"

if (Test-Path $exePathLocal) {
    $exePath = $exePathLocal
    Write-Host "Build output (local):     $exePath" -ForegroundColor Green
} elseif (Test-Path $exePathWorkspace) {
    $exePath = $exePathWorkspace
    Write-Host "Build output (workspace): $exePath" -ForegroundColor Green
} else {
    $exePath = $exePathLocal
    Write-Host "Warning: expected output not found at $exePath" -ForegroundColor Yellow
}

if ($doDeploy) {
    if (-not (Test-Path $exePath)) {
        throw "Cannot deploy Qt runtime; executable not found at $exePath"
    }

    if ($env:OS -eq 'Windows_NT') {
        $deployTool = Join-Path $qtBin 'windeployqt.exe'
        if (-not (Test-Path $deployTool)) {
            throw "windeployqt.exe not found at: $deployTool"
        }

        Write-Host "Deploying Qt runtime with: $deployTool" -ForegroundColor Cyan
        $deployArgs = @()
        if ($Profile -eq 'release') {
            $deployArgs += '--release'
        } else {
            $deployArgs += '--debug'
        }
        $deployArgs += @('--qmldir', $scriptDir, $exePath)

        $deployResult = Invoke-NativeCommandCapture -FilePath $deployTool -Arguments $deployArgs -WorkingDirectory $scriptDir

        $inQmlImports = $false
        $upToDateLineCount = 0
        $translationCreateCount = 0
        $localDependencyCount = 0
        $pluginTypeAddCount = 0
        $pluginResolvedDependencyCount = 0
        $skippedPluginCount = 0
        $additionalPassCount = 0
        $scannedPathCount = 0
        $binaryDescriptorCount = 0
        $directDependenciesLine = ''
        $allDependenciesLine = ''
        $toBeDeployedLine = ''
        foreach ($line in $deployResult.AllLines) {
            $trimmedRight = $line.TrimEnd()
            $trimmed = $trimmedRight.Trim()

            if ($trimmed -eq 'QML imports:') {
                $inQmlImports = $true
                continue
            }

            if ($inQmlImports) {
                if ($trimmed -match "^'[^']+'\s+") {
                    [void]$capturedQmlImports.Add($trimmed)
                    continue
                }
                $inQmlImports = $false
            }

            if ($trimmed -match '^Warning:') {
                [void]$capturedWarnings.Add($trimmedRight)
                Write-Host $trimmedRight -ForegroundColor Yellow
            } elseif ($trimmed -match '^Error:|^ERROR\b') {
                Write-Host $trimmedRight -ForegroundColor Red
            } elseif ($trimmed -match '^Adding local dependency') {
                $localDependencyCount += 1
            } elseif ($trimmed -match 'interactive-terminal\.exe\s+.*executable\s+\[QML\]$') {
                $binaryDescriptorCount += 1
            } elseif ($trimmed -match '^Scanning\s+') {
                $scannedPathCount += 1
            } elseif ($trimmed -match '^Adding in plugin type\s+') {
                $pluginTypeAddCount += 1
            } elseif ($trimmed -match '^Adding\s+\S+\s+for\s+\S+\s+from plugin type:\s+') {
                $pluginResolvedDependencyCount += 1
            } elseif ($trimmed -match '^Skipping plugin\s+') {
                $skippedPluginCount += 1
            } elseif ($trimmed -match '^Performing additional pass of finding Qt plugins') {
                $additionalPassCount += 1
            } elseif ($trimmed -match '^Direct dependencies:\s*(.+)$') {
                $directDependenciesLine = $Matches[1]
            } elseif ($trimmed -match '^All dependencies\s*:\s*(.+)$') {
                $allDependenciesLine = $Matches[1]
            } elseif ($trimmed -match '^To be deployed\s*:\s*(.+)$') {
                $toBeDeployedLine = $Matches[1]
            } elseif ($trimmed -match ' is up to date\.$') {
                $upToDateLineCount += 1
            } elseif ($trimmed -match '^Creating qt_[A-Za-z_]+\.qm\.\.\.$') {
                $translationCreateCount += 1
            } elseif (-not [string]::IsNullOrWhiteSpace($trimmedRight)) {
                Write-Host $trimmedRight
            }
        }

        if ($upToDateLineCount -gt 0) {
            Write-Host ("windeployqt up-to-date items: {0}" -f $upToDateLineCount) -ForegroundColor DarkGray
        }

        if ($translationCreateCount -gt 0) {
            Write-Host ("windeployqt translation files created: {0}" -f $translationCreateCount) -ForegroundColor DarkGray
        }

        if ($binaryDescriptorCount -gt 0 -or $scannedPathCount -gt 0 -or $localDependencyCount -gt 0 -or $pluginTypeAddCount -gt 0 -or $pluginResolvedDependencyCount -gt 0 -or $skippedPluginCount -gt 0 -or $additionalPassCount -gt 0) {
            Write-Host (
                "windeployqt dependency summary: binary={0}, scanPaths={1}, localDeps={2}, pluginTypes={3}, resolvedDeps={4}, skippedPlugins={5}, additionalPasses={6}" -f
                $binaryDescriptorCount, $scannedPathCount, $localDependencyCount, $pluginTypeAddCount, $pluginResolvedDependencyCount, $skippedPluginCount, $additionalPassCount
            ) -ForegroundColor DarkGray
        }

        $directDependencyCount = Get-DependencyCountFromLine -DependencyLine $directDependenciesLine
        $allDependencyCount = Get-DependencyCountFromLine -DependencyLine $allDependenciesLine
        $deployDependencyCount = Get-DependencyCountFromLine -DependencyLine $toBeDeployedLine

        if ($directDependencyCount -gt 0 -or $allDependencyCount -gt 0 -or $deployDependencyCount -gt 0) {
            Write-Host (
                "Qt dependency sets: direct={0}, all={1}, deploy={2}" -f
                $directDependencyCount, $allDependencyCount, $deployDependencyCount
            ) -ForegroundColor DarkGray
        }

        if ($capturedQmlImports.Count -gt 0) {
            Write-Host ("QML imports discovered: {0}" -f $capturedQmlImports.Count) -ForegroundColor DarkGray
            for ($pct = 10; $pct -le 100; $pct += 10) {
                $processed = [Math]::Ceiling(($capturedQmlImports.Count * $pct) / 100.0)
                if ($processed -gt $capturedQmlImports.Count) {
                    $processed = $capturedQmlImports.Count
                }
                Write-Host ("QML import scan progress: {0}% ({1}/{2})" -f $pct, $processed, $capturedQmlImports.Count) -ForegroundColor DarkGray
            }
        }

        if ($deployResult.ExitCode -ne 0) {
            throw 'windeployqt deployment failed.'
        }

        # ---------------------------------------------------------------
        # Comprehensive DLL verification + fallback copy from Qt bin
        # ---------------------------------------------------------------
        $outputDir = Split-Path -Parent $exePath

        $requiredDlls = @(
            # Core Qt runtime
            'Qt6Core.dll',
            'Qt6Gui.dll',
            'Qt6Network.dll',
            'Qt6OpenGL.dll',
            'Qt6Qml.dll',
            'Qt6QmlMeta.dll',
            'Qt6QmlModels.dll',
            'Qt6QmlWorkerScript.dll',
            'Qt6Quick.dll',
            'Qt6QuickControls2.dll',
            'Qt6QuickControls2Impl.dll',
            'Qt6QuickTemplates2.dll',
            'Qt6QuickLayouts.dll',
            'Qt6QuickShapes.dll',
            'Qt6QuickEffects.dll',
            'Qt6Svg.dll',
            # Controls style plugins
            'Qt6QuickControls2Basic.dll',
            'Qt6QuickControls2BasicStyleImpl.dll',
            'Qt6QuickControls2Fusion.dll',
            'Qt6QuickControls2FusionStyleImpl.dll',
            'Qt6QuickControls2Material.dll',
            'Qt6QuickControls2MaterialStyleImpl.dll',
            'Qt6QuickControls2Universal.dll',
            'Qt6QuickControls2UniversalStyleImpl.dll',
            'Qt6QuickControls2WindowsStyleImpl.dll',
            'Qt6QuickControls2Imagine.dll',
            'Qt6QuickControls2ImagineStyleImpl.dll',
            'Qt6QuickControls2FluentWinUI3StyleImpl.dll',
            # Labs
            'Qt6LabsQmlModels.dll',
            # Rendering support
            'D3Dcompiler_47.dll',
            'opengl32sw.dll'
        )

        $missingDlls  = @()
        $copiedDlls   = @()

        foreach ($dll in $requiredDlls) {
            $dllDest = Join-Path $outputDir $dll
            if (-not (Test-Path $dllDest)) {
                # Try to copy from Qt bin directory
                $dllSrc = Join-Path $qtBin $dll
                if (Test-Path $dllSrc) {
                    Copy-Item $dllSrc $dllDest -Force
                    $copiedDlls += $dll
                } else {
                    $missingDlls += $dll
                }
            }
        }

        # Verify platform plugin
        $platformDir = Join-Path $outputDir 'platforms'
        if (-not (Test-Path (Join-Path $platformDir 'qwindows.dll'))) {
            $srcPlatform = Join-Path $QtDir 'plugins\platforms\qwindows.dll'
            if (Test-Path $srcPlatform) {
                New-Item -ItemType Directory -Force -Path $platformDir | Out-Null
                Copy-Item $srcPlatform (Join-Path $platformDir 'qwindows.dll') -Force
                $copiedDlls += 'platforms\qwindows.dll'
            } else {
                $missingDlls += 'platforms\qwindows.dll'
            }
        }

        # Verify QML module directories exist (windeployqt should have created these)
        $requiredQmlDirs = @(
            'qml\QtQuick',
            'qml\QtQuick\Controls',
            'qml\QtQuick\Layouts',
            'qml\QtQml'
        )
        foreach ($qmlDir in $requiredQmlDirs) {
            $qmlPath = Join-Path $outputDir $qmlDir
            if (-not (Test-Path $qmlPath)) {
                Write-Host "WARNING: QML module directory missing: $qmlDir" -ForegroundColor Yellow
                $missingDlls += "qml-dir:$qmlDir"
            }
        }

        if ($copiedDlls.Count -gt 0) {
            Write-Host "Copied $($copiedDlls.Count) missing DLL(s) from Qt:" -ForegroundColor Yellow
            $copiedDlls | ForEach-Object { Write-Host "  + $_" -ForegroundColor Yellow }
        }

        if ($missingDlls.Count -gt 0) {
            throw "Qt deployment incomplete. Missing: $($missingDlls -join ', ')"
        }

        Write-Host 'Qt runtime deployment verified.' -ForegroundColor Green

        if ($Profile -eq 'release') {
            $workspaceReleaseDir = Join-Path $workspaceRoot 'target\release'
            New-Item -ItemType Directory -Force -Path $workspaceReleaseDir | Out-Null

            $runningInteractiveTerminal = @(Get-Process -Name 'interactive-terminal' -ErrorAction SilentlyContinue)
            if ($runningInteractiveTerminal.Count -gt 0) {
                Write-Host "Stopping running interactive-terminal process(es) before staging..." -ForegroundColor Yellow
                foreach ($proc in $runningInteractiveTerminal) {
                    try {
                        Stop-Process -Id $proc.Id -Force -ErrorAction Stop
                        Write-Host "  Stopped interactive-terminal (PID $($proc.Id))" -ForegroundColor DarkGray
                    }
                    catch {
                        Write-Host "  Could not stop interactive-terminal (PID $($proc.Id)): $($_.Exception.Message)" -ForegroundColor Yellow
                    }
                }
                Start-Sleep -Milliseconds 500
            }

            Write-Host "Staging interactive-terminal artifacts to: $workspaceReleaseDir" -ForegroundColor Cyan
            $stagingSkipped = New-Object 'System.Collections.Generic.List[string]'
            try {
                Copy-Item $exePath -Destination (Join-Path $workspaceReleaseDir $exeName) -Force -ErrorAction Stop
            }
            catch {
                if ($_.Exception.Message -match 'being used by another process') {
                    [void]$stagingSkipped.Add($exeName)
                    Write-Host "Staging warning: locked destination for $exeName; keeping existing file." -ForegroundColor Yellow
                }
                else {
                    throw
                }
            }

            foreach ($dllFile in (Get-ChildItem -Path $outputDir -Filter '*.dll' -File -ErrorAction SilentlyContinue)) {
                try {
                    Copy-Item $dllFile.FullName -Destination $workspaceReleaseDir -Force -ErrorAction Stop
                }
                catch {
                    if ($_.Exception.Message -match 'being used by another process') {
                        [void]$stagingSkipped.Add($dllFile.Name)
                        Write-Host "Staging warning: locked destination for $($dllFile.Name); keeping existing file." -ForegroundColor Yellow
                    }
                    else {
                        throw
                    }
                }
            }

            foreach ($artifactDir in @('platforms', 'imageformats', 'iconengines', 'qml', 'QtQuick', 'Qt6Quick_layouts')) {
                $sourcePath = Join-Path $outputDir $artifactDir
                if (Test-Path $sourcePath) {
                    try {
                        Copy-Item $sourcePath -Destination (Join-Path $workspaceReleaseDir $artifactDir) -Recurse -Force -ErrorAction Stop
                    }
                    catch {
                        if ($_.Exception.Message -match 'being used by another process') {
                            [void]$stagingSkipped.Add($artifactDir)
                            Write-Host "Staging warning: locked destination under $artifactDir; keeping existing files." -ForegroundColor Yellow
                        }
                        else {
                            throw
                        }
                    }
                }
            }

            if ($stagingSkipped.Count -gt 0) {
                Write-Host "Staging completed with locked-file skips: $($stagingSkipped.Count) item(s)." -ForegroundColor Yellow
            }

            Write-Host 'Staging complete: interactive-terminal artifacts copied next to supervisor output.' -ForegroundColor Green
        }
    } else {
        Write-Host 'Deploy requested, but non-Windows OS detected; skipping windeployqt.' -ForegroundColor Yellow
    }
}

$warningsImportsLogFile = Resolve-WarningsImportsLogPath -RequestedPath $WarningsImportsLogPath -DefaultDirectory $scriptDir
if ($warningsImportsLogFile) {
    $logLines = New-Object 'System.Collections.Generic.List[string]'
    [void]$logLines.Add('Interactive Terminal Build: warnings and QML imports report')
    [void]$logLines.Add(("Generated: {0}" -f (Get-Date).ToString('o')))
    [void]$logLines.Add('')
    [void]$logLines.Add(("Warnings ({0})" -f $capturedWarnings.Count))

    if ($capturedWarnings.Count -eq 0) {
        [void]$logLines.Add('  (none)')
    } else {
        foreach ($warningLine in $capturedWarnings) {
            [void]$logLines.Add(("  {0}" -f $warningLine))
        }
    }

    [void]$logLines.Add('')
    [void]$logLines.Add(("QML Imports ({0})" -f $capturedQmlImports.Count))

    if ($capturedQmlImports.Count -eq 0) {
        [void]$logLines.Add('  (none)')
    } else {
        foreach ($importLine in $capturedQmlImports) {
            [void]$logLines.Add(("  {0}" -f $importLine))
        }
    }

    Set-Content -Path $warningsImportsLogFile -Value $logLines -Encoding UTF8
    Write-Host ("Warnings/imports report written: {0}" -f $warningsImportsLogFile) -ForegroundColor Green
}

if ($Run) {
    if (-not (Test-Path $exePath)) {
        throw "Cannot run app; executable not found at $exePath"
    }

    Write-Host "Launching interactive-terminal on port $Port..." -ForegroundColor Cyan
    & $exePath --port $Port
}

Write-Host 'Done.' -ForegroundColor Green
