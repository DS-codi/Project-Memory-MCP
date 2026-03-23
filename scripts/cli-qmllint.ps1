#Requires -Version 5.1
<#
.SYNOPSIS
    Run qmllint for one named component.
    Output goes to stdout so the Rust CLI can capture it for warning detection.
    qmllint Warning:/Error: lines are output verbatim -- the CLI filter
    matches them with starts_with("warning:") / starts_with("error:").
.PARAMETER Component
    One of: supervisor | guiforms | interactive-terminal
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)]
    [ValidateSet('supervisor','guiforms','interactive-terminal')]
    [string]$Component
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot

. "$PSScriptRoot\cli-qt-resolve.ps1"

$QtBin = Find-QtBin
if (-not $QtBin) {
    Write-Host "  qmllint: Qt not found -- skipping lint for $Component"
    exit 0
}

$qmllintExe = Join-Path $QtBin 'qmllint.exe'
$qtQmlRoot  = Join-Path (Split-Path -Parent $QtBin) 'qml'

# Map component name to one or more QML directories
$qmlDirs = @()
switch ($Component) {
    'supervisor' {
        $qmlDirs = @(Join-Path $Root 'supervisor')
    }
    'guiforms' {
        $qmlDirs = @(
            (Join-Path $Root 'pm-approval-gui'),
            (Join-Path $Root 'pm-brainstorm-gui')
        )
    }
    'interactive-terminal' {
        $qmlDirs = @(Join-Path $Root 'interactive-terminal\qml')
    }
}

$totalErrors   = 0
$totalWarnings = 0
$qmlModulesPath = Join-Path $Root 'target\cxxqt\qml_modules'

foreach ($qmlDir in $qmlDirs) {
    if (-not (Test-Path $qmlDir)) {
        Write-Host "  qmllint: $qmlDir not found, skipping"
        continue
    }

    $qmlFiles = @(Get-ChildItem $qmlDir -Filter '*.qml' -Recurse -File -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -notmatch '\\tests?\\' })

    if ($qmlFiles.Count -eq 0) {
        Write-Host "  qmllint: no .qml files in $(Split-Path -Leaf $qmlDir)"
        continue
    }

    $dirLabel = Split-Path -Leaf $qmlDir
    Write-Host "  qmllint $dirLabel -- $($qmlFiles.Count) file(s)"

    $lintArgs = @('-I', $qtQmlRoot)
    if (Test-Path $qmlModulesPath) {
        $lintArgs += @('-I', $qmlModulesPath)
    }
    $lintArgs += @('-I', $qmlDir) + $qmlFiles.FullName

    # Capture all qmllint output and reprint to stdout.
    # qmllint warning lines look like:  Warning: file.qml:N:M: message
    #                               or: file.qml:N:M: Warning (kind): ...
    # Both start with "Warning" which lowercases to "warning:" -- matched by CLI.
    $output = & $qmllintExe @lintArgs 2>&1
    foreach ($item in $output) {
        $line = "$item"
        if ([string]::IsNullOrWhiteSpace($line)) { continue }

        # Count and reprint
        if ($line -match '^\s*Error:' -or $line -match ':\s*Error\b') {
            Write-Host $line
            $totalErrors++
        } elseif ($line -match '^\s*Warning:' -or $line -match ':\s*Warning\b') {
            Write-Host $line
            $totalWarnings++
        } else {
            # Context / note lines -- print but don't count
            Write-Host $line
        }
    }
}

if ($totalErrors -gt 0) {
    Write-Host "  qmllint result: $totalErrors error(s), $totalWarnings warning(s)"
    exit 1
} elseif ($totalWarnings -gt 0) {
    Write-Host "  qmllint result: $totalWarnings warning(s), 0 errors"
} else {
    Write-Host "  qmllint result: clean"
}
