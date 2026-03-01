#!/usr/bin/env pwsh
[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Write-Section([string]$Text) {
    Write-Host "`n== $Text" -ForegroundColor Cyan
}

function Write-Pass([string]$Text) {
    Write-Host "  [PASS] $Text" -ForegroundColor Green
}

function Write-Warn([string]$Text) {
    Write-Host "  [WARN] $Text" -ForegroundColor Yellow
}

function Write-Fail([string]$Text) {
    Write-Host "  [FAIL] $Text" -ForegroundColor Red
}

function Get-MajorVersion([string]$VersionText) {
    if ($VersionText -match '([0-9]+)') {
        return [int]$matches[1]
    }

    return $null
}

function Test-CommandVersion {
    param(
        [Parameter(Mandatory)] [string]$Name,
        [Parameter(Mandatory)] [string]$VersionCommand,
        [int]$MinMajor = 0,
        [switch]$Optional,
        [string]$Hint = ''
    )

    $result = [PSCustomObject]@{
        Name = $Name
        IsHardFail = (-not $Optional)
        Passed = $false
        Message = ''
    }

    $command = Get-Command $Name -ErrorAction SilentlyContinue
    if (-not $command) {
        $result.Message = if ($Hint) { "$Name not found. $Hint" } else { "$Name not found in PATH." }
        return $result
    }

    $versionText = ''
    try {
        $versionText = (Invoke-Expression $VersionCommand | Select-Object -First 1).ToString()
    } catch {
        $result.Message = "Could not read $Name version: $($_.Exception.Message)"
        return $result
    }

    if ([string]::IsNullOrWhiteSpace($versionText)) {
        $result.Message = "Could not read $Name version output."
        return $result
    }

    $major = Get-MajorVersion -VersionText $versionText
    if ($null -eq $major) {
        $result.Message = "$Name version '$versionText' is not parseable."
        return $result
    }

    if ($major -lt $MinMajor) {
        $result.Message = "$Name version '$versionText' is below required major version $MinMajor."
        return $result
    }

    $result.Passed = $true
    $result.Message = "$Name version '$versionText'"
    return $result
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$checks = New-Object System.Collections.Generic.List[object]

Write-Section 'Project Memory MCP - Machine Preflight'
Write-Host "Repository root: $repoRoot" -ForegroundColor DarkGray

Write-Section 'Toolchain checks'

$checks.Add((Test-CommandVersion -Name 'node' -VersionCommand 'node --version' -MinMajor 20 -Hint 'Install Node.js 20+'))
$checks.Add((Test-CommandVersion -Name 'npm' -VersionCommand 'npm --version' -MinMajor 9 -Hint 'npm 9+ is required'))
$checks.Add((Test-CommandVersion -Name 'rustc' -VersionCommand 'rustc --version' -MinMajor 1 -Hint 'Install rustup and Rust toolchain'))
$checks.Add((Test-CommandVersion -Name 'cargo' -VersionCommand 'cargo --version' -MinMajor 1 -Hint 'Install rustup and Rust toolchain'))
$checks.Add((Test-CommandVersion -Name 'code' -VersionCommand 'code --version' -MinMajor 1 -Optional -Hint 'Needed for extension install from script'))

$qtHint = 'Set QT_DIR to a Qt 6 MSVC kit path (for example C:\Qt\6.10.2\msvc2022_64).'
if ($env:QT_DIR -and (Test-Path $env:QT_DIR)) {
    $checks.Add([PSCustomObject]@{
            Name = 'QT_DIR'
            IsHardFail = $false
            Passed = $true
            Message = "QT_DIR set to '$($env:QT_DIR)'"
        })
} else {
    $defaultQtPath = 'C:\Qt\6.10.2\msvc2022_64'
    if (Test-Path $defaultQtPath) {
        $checks.Add([PSCustomObject]@{
                Name = 'QT_DIR'
                IsHardFail = $false
                Passed = $true
                Message = "Default Qt path found at '$defaultQtPath'"
            })
    } else {
        $checks.Add([PSCustomObject]@{
                Name = 'QT_DIR'
                IsHardFail = $false
                Passed = $false
                Message = "Qt kit not found. $qtHint"
            })
    }
}

foreach ($check in $checks) {
    if ($check.Passed) {
        Write-Pass $check.Message
    } elseif ($check.IsHardFail) {
        Write-Fail $check.Message
    } else {
        Write-Warn $check.Message
    }
}

Write-Section 'Repository file checks'

$requiredPaths = @(
    'install.ps1',
    'run-tests.ps1',
    'README.md',
    'server/package.json',
    'server/package-lock.json',
    'dashboard/package-lock.json',
    'vscode-extension/package-lock.json',
    'Cargo.lock',
    'interactive-terminal/Cargo.lock',
    'database-seed-resources/reproducibility/README.md'
)

$missingRequired = New-Object System.Collections.Generic.List[string]
foreach ($relativePath in $requiredPaths) {
    $fullPath = Join-Path $repoRoot $relativePath
    if (Test-Path $fullPath) {
        Write-Pass "Found $relativePath"
    } else {
        $missingRequired.Add($relativePath)
        Write-Fail "Missing $relativePath"
    }
}

Write-Section 'Summary'

$hardFailures = @($checks | Where-Object { -not $_.Passed -and $_.IsHardFail }).Count + $missingRequired.Count
$warnings = @($checks | Where-Object { -not $_.Passed -and -not $_.IsHardFail }).Count

if ($hardFailures -gt 0) {
    Write-Fail "Preflight failed with $hardFailures blocking issue(s) and $warnings warning(s)."
    exit 1
}

if ($warnings -gt 0) {
    Write-Warn "Preflight passed with $warnings warning(s)."
    exit 0
}

Write-Pass 'Preflight passed with no blocking issues.'
exit 0
