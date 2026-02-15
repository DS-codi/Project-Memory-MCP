param(
    [switch]$Clean,
    [switch]$Test,
    [switch]$Run,
    [switch]$Deploy,
    [int]$Port = 9100,
    [ValidateSet('debug', 'release')]
    [string]$Profile = 'release',
    [string]$QtDir = 'C:\Qt\6.10.2\msvc2022_64'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

$qtBin = Join-Path $QtDir 'bin'
$qmakePath = Join-Path $qtBin 'qmake6.exe'

if (-not (Test-Path $qmakePath)) {
    throw "qmake6.exe not found at: $qmakePath"
}

$env:QMAKE = $qmakePath
$env:PATH = "$qtBin;$env:PATH"

Write-Host '=== Interactive Terminal Build ===' -ForegroundColor Cyan
Write-Host "QtDir:   $QtDir" -ForegroundColor Gray
Write-Host "QMAKE:   $env:QMAKE" -ForegroundColor Gray
Write-Host "Profile: $Profile" -ForegroundColor Gray

$doDeploy = ($Profile -eq 'release') -or $Deploy.IsPresent
Write-Host "Deploy:  $doDeploy" -ForegroundColor Gray

& $env:QMAKE --version
if ($LASTEXITCODE -ne 0) {
    throw 'qmake version check failed.'
}

if ($Clean) {
    Write-Host 'Cleaning build artifacts...' -ForegroundColor Yellow
    cargo clean
    if ($LASTEXITCODE -ne 0) {
        throw 'cargo clean failed.'
    }
}

if ($Test) {
    Write-Host 'Running tests...' -ForegroundColor Cyan
    cargo test
    if ($LASTEXITCODE -ne 0) {
        throw 'cargo test failed.'
    }
}

$buildArgs = @('build')
if ($Profile -eq 'release') {
    $buildArgs += '--release'
}

Write-Host "Running: cargo $($buildArgs -join ' ')" -ForegroundColor Cyan
& cargo @buildArgs
if ($LASTEXITCODE -ne 0) {
    throw 'cargo build failed.'
}

$exeName = 'interactive-terminal.exe'
$targetDir = if ($Profile -eq 'release') { 'release' } else { 'debug' }
$exePath = Join-Path $scriptDir "target\$targetDir\$exeName"

if (Test-Path $exePath) {
    Write-Host "Build output: $exePath" -ForegroundColor Green
} else {
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

        & $deployTool @deployArgs
        if ($LASTEXITCODE -ne 0) {
            throw 'windeployqt deployment failed.'
        }

        $requiredDlls = @('Qt6Core.dll', 'Qt6Gui.dll', 'Qt6Qml.dll', 'Qt6Quick.dll')
        $missingDlls = @()
        foreach ($dll in $requiredDlls) {
            $dllPath = Join-Path (Split-Path -Parent $exePath) $dll
            if (-not (Test-Path $dllPath)) {
                $missingDlls += $dll
            }
        }

        if ($missingDlls.Count -gt 0) {
            throw "Qt deployment incomplete. Missing DLLs: $($missingDlls -join ', ')"
        }

        Write-Host 'Qt runtime deployment verified.' -ForegroundColor Green
    } else {
        Write-Host 'Deploy requested, but non-Windows OS detected; skipping windeployqt.' -ForegroundColor Yellow
    }
}

if ($Run) {
    if (-not (Test-Path $exePath)) {
        throw "Cannot run app; executable not found at $exePath"
    }

    Write-Host "Launching interactive-terminal on port $Port..." -ForegroundColor Cyan
    & $exePath --port $Port
}

Write-Host 'Done.' -ForegroundColor Green
