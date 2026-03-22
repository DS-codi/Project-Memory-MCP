#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Standalone QML lint runner for all Qt-based components.

.DESCRIPTION
    Resolves the Qt toolchain (via env vars or common install paths), then
    runs qmllint.exe over every .qml file in each Qt component directory.
    Silently skips if qmllint.exe is not found — never blocks.

.PARAMETER Verbose
    Print all qmllint output lines, not just warnings and errors.

.PARAMETER LogFile
    Optional path to append full qmllint output for each component.
#>
[CmdletBinding()]
param(
    [switch]$Verbose,
    [string]$LogFile = ''
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

# ── Qt resolution ─────────────────────────────────────────────────────────────

function Find-QtBin {
    $candidates = [System.Collections.Generic.List[string]]::new()

    # Highest priority: QMAKE env var pointing directly at qmake6.exe / qmake.exe
    if ($env:QMAKE -and (Test-Path $env:QMAKE)) {
        $candidates.Add((Split-Path -Parent $env:QMAKE))
    }

    # Qt dir env vars (may point to kit root or bin)
    foreach ($envVar in @('QT_DIR', 'QTDIR', 'Qt6_DIR')) {
        $val = [System.Environment]::GetEnvironmentVariable($envVar)
        if ($val) {
            $candidates.Add($val)
            $candidates.Add((Join-Path $val 'bin'))
        }
    }

    # Common Windows install roots
    foreach ($qtRoot in @('C:\Qt', 'D:\Qt', 'E:\Qt')) {
        if (-not (Test-Path $qtRoot)) { continue }
        Get-ChildItem $qtRoot -Directory -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -match '^\d+\.\d+' } |
            Sort-Object Name -Descending |
            Select-Object -First 4 |
            ForEach-Object {
                Get-ChildItem $_.FullName -Directory -Filter 'msvc*_64' -ErrorAction SilentlyContinue |
                    ForEach-Object { $candidates.Add((Join-Path $_.FullName 'bin')) }
            }
    }

    # Last-resort fallback
    $candidates.Add('C:\Qt\6.10.2\msvc2022_64\bin')

    foreach ($dir in ($candidates | Select-Object -Unique)) {
        if (-not $dir) { continue }
        $exe = Join-Path $dir 'qmllint.exe'
        if (Test-Path $exe) { return $dir }
    }
    return $null
}

# ── Lint helper ───────────────────────────────────────────────────────────────

function Invoke-ComponentLint {
    param(
        [string]$QtBin,
        [string]$QmlDir,
        [string]$Label
    )

    $qmllintExe = Join-Path $QtBin 'qmllint.exe'

    if (-not (Test-Path $QmlDir)) {
        Write-Host "   ($Label: directory not found — skipping)" -ForegroundColor DarkGray
        return @{ Errors = 0; Warnings = 0 }
    }

    $qmlFiles = @(Get-ChildItem $QmlDir -Filter '*.qml' -Recurse -File -ErrorAction SilentlyContinue |
                    Where-Object { $_.FullName -notmatch '\\tests?\\' })
    if ($qmlFiles.Count -eq 0) {
        Write-Host "   ($Label: no .qml files found — skipping)" -ForegroundColor DarkGray
        return @{ Errors = 0; Warnings = 0 }
    }

    Write-Host ""
    Write-Host "── $Label ($($qmlFiles.Count) file(s))" -ForegroundColor Cyan

    $qtQmlRoot  = Join-Path (Split-Path -Parent $QtBin) 'qml'
    $lintArgs   = @('-I', $qtQmlRoot, '-I', $QmlDir) + $qmlFiles.FullName

    $output = & $qmllintExe @lintArgs 2>&1
    $lines  = @($output | ForEach-Object { "$_" } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })

    $errorPattern   = '^\s*Error:|:\s*Error\b'
    $warningPattern = '^\s*Warning:|:\s*Warning\b'

    $errCount  = 0
    $warnCount = 0

    foreach ($line in $lines) {
        if ($line -match $errorPattern) {
            Write-Host "  $line" -ForegroundColor Red
            $errCount++
        } elseif ($line -match $warningPattern) {
            Write-Host "  $line" -ForegroundColor Yellow
            $warnCount++
        } elseif ($Verbose) {
            Write-Host "  $line" -ForegroundColor DarkGray
        }
    }

    if ($LogFile -ne '') {
        "=== $Label ===" | Out-File $LogFile -Encoding utf8 -Append
        $lines | Out-File $LogFile -Encoding utf8 -Append
    }

    return @{ Errors = $errCount; Warnings = $warnCount }
}

# ── Main ──────────────────────────────────────────────────────────────────────

$QtBin = Find-QtBin
if (-not $QtBin) {
    Write-Host ""
    Write-Host "  qmllint.exe not found." -ForegroundColor Yellow
    Write-Host "  Set QT_DIR (or QTDIR) to your Qt kit directory, e.g.:" -ForegroundColor DarkGray
    Write-Host "    `$env:QT_DIR = 'C:\Qt\6.10.2\msvc2022_64'" -ForegroundColor DarkGray
    Write-Host ""
    exit 0
}

Write-Host "Qt bin: $QtBin" -ForegroundColor DarkGray

# Component QML directories (each is the crate root — qmllint scans recursively)
$components = @(
    @{ Label = 'supervisor';             Dir = Join-Path $Root 'supervisor' },
    @{ Label = 'interactive-terminal';   Dir = Join-Path $Root 'interactive-terminal\qml' },
    @{ Label = 'pm-install-gui';         Dir = Join-Path $Root 'pm-install-gui' },
    @{ Label = 'pm-approval-gui';        Dir = Join-Path $Root 'pm-approval-gui' },
    @{ Label = 'pm-brainstorm-gui';      Dir = Join-Path $Root 'pm-brainstorm-gui' },
    @{ Label = 'pm-gui-forms';           Dir = Join-Path $Root 'pm-gui-forms' }
)

$totalErrors   = 0
$totalWarnings = 0

foreach ($comp in $components) {
    $result = Invoke-ComponentLint -QtBin $QtBin -QmlDir $comp.Dir -Label $comp.Label
    $totalErrors   += $result.Errors
    $totalWarnings += $result.Warnings
}

Write-Host ""
Write-Host ('─' * 50) -ForegroundColor DarkGray

if ($totalErrors -gt 0) {
    Write-Host "  QML Lint: $totalErrors error(s), $totalWarnings warning(s)" -ForegroundColor Red
    exit 1
} elseif ($totalWarnings -gt 0) {
    Write-Host "  QML Lint: $totalWarnings warning(s), 0 errors (non-fatal)" -ForegroundColor Yellow
} else {
    Write-Host "  QML Lint: Clean!" -ForegroundColor Green
}
