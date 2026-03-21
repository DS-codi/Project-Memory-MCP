<#
.SYNOPSIS
    Run qmllint on QML files.

.PARAMETER File
    A specific .qml file to lint (relative or absolute path). Overrides -Dir/-Recurse.

.PARAMETER Dir
    Directory to search for .qml files. Defaults to the qml/ folder next to this script.
    Pass any absolute or relative path, e.g. "." or "C:\MyProject\qml".

.PARAMETER Recurse
    Search Dir and all its subdirectories (like Get-ChildItem -Recurse).

.PARAMETER QtPath
    Path to qmllint.exe. Defaults to the Qt 6.10.2 MSVC installation.

.PARAMETER Verbose
    Pass --verbose to qmllint for detailed output even on passing files.

.PARAMETER ShowWarnings
    Print the Warning: detail lines emitted by qmllint for files that exit 0.
    Warning counts are always shown in the summary regardless of this flag.

.PARAMETER Auto
    Lint all known QML components in the project automatically.
    Scans: supervisor, interactive-terminal, pm-approval-gui, pm-brainstorm-gui,
    pm-gui-forms, pm-install-gui.
    Each component is shown as a separate section with its own pass/fail summary.
    Combines with -ShowWarnings and -Verbose. Ignores -File, -Dir, -Recurse.

.EXAMPLE
    # Lint all files in ./qml/
    .\lint-qml.ps1

    # Lint all files in ./qml/ and every sub-folder
    .\lint-qml.ps1 -Recurse

    # Lint a whole project tree
    .\lint-qml.ps1 -Dir "C:\MyProject" -Recurse

    # Lint a single file
    .\lint-qml.ps1 -File qml\PlansPanel.qml

    # Single file with verbose qmllint output
    .\lint-qml.ps1 -File qml\PlansPanel.qml -Verbose

    # Show warnings (qmllint exits 0 for warnings, so -ShowWarnings is needed to surface them)
    .\lint-qml.ps1 -ShowWarnings

    # Show warnings for a single file
    .\lint-qml.ps1 -File qml\ChatbotPanel.qml -ShowWarnings

    # Lint every QML component in the project
    .\lint-qml.ps1 -Auto

    # Lint every component and surface warnings
    .\lint-qml.ps1 -Auto -ShowWarnings
#>
param(
    [string]$File         = "",
    [string]$Dir          = "",
    [switch]$Recurse,
    [string]$QtPath       = "C:\Qt\6.10.2\msvc2022_64\bin\qmllint.exe",
    [switch]$Verbose,
    [switch]$ShowWarnings,
    [switch]$Auto
)

Set-StrictMode -Version Latest

# ── Locate qmllint ───────────────────────────────────────────────────────────
if (-not (Test-Path $QtPath)) {
    Write-Host "qmllint not found at '$QtPath', searching C:\Qt ..." -ForegroundColor Yellow
    $found = Get-ChildItem "C:\Qt" -Filter "qmllint.exe" -Recurse -ErrorAction SilentlyContinue |
             Where-Object { $_.FullName -match "msvc2022_64" } |
             Select-Object -First 1
    if ($found) {
        $QtPath = $found.FullName
        Write-Host "Found: $QtPath" -ForegroundColor Cyan
    } else {
        Write-Error "qmllint.exe not found. Use -QtPath to specify the location."
        exit 1
    }
}

# ── Resolve target files ──────────────────────────────────────────────────────
$scriptDir  = Split-Path $MyInvocation.MyCommand.Path -Parent
$projectRoot = Split-Path $scriptDir -Parent   # one level up from supervisor/

# Paths for --import-path so qmllint can resolve custom QML modules from the build
# and Qt's own QML modules (e.g. QtWebEngine).
$qmlModulesDir = Join-Path $projectRoot "target\cxxqt\qml_modules"
$qtQmlDir      = Join-Path (Split-Path (Split-Path $QtPath)) "qml"

# ── Auto mode — lint all known QML components ─────────────────────────────────
if ($Auto) {
    # Component name → qml directory (relative to project root)
    $components = [ordered]@{
        "supervisor"           = "supervisor\qml"
        "interactive-terminal" = "interactive-terminal\qml"
        "pm-approval-gui"      = "pm-approval-gui\qml"
        "pm-brainstorm-gui"    = "pm-brainstorm-gui\qml"
        "pm-gui-forms"         = "pm-gui-forms\qml"
        "pm-install-gui"       = "pm-install-gui\qml"
    }

    $lintArgs = @()
    if ($Verbose)                  { $lintArgs += "--verbose" }
    if (Test-Path $qmlModulesDir)  { $lintArgs += "-I"; $lintArgs += $qmlModulesDir }
    if (Test-Path $qtQmlDir)       { $lintArgs += "-I"; $lintArgs += $qtQmlDir }

    $totalPass  = 0
    $totalWarn  = 0
    $totalFail  = 0
    $anyMissing = $false

    foreach ($entry in $components.GetEnumerator()) {
        $compName = $entry.Key
        $compDir  = Join-Path $projectRoot $entry.Value

        if (-not (Test-Path $compDir -PathType Container)) {
            Write-Host ""
            Write-Host "  [skip] $compName  (directory not found: $compDir)" -ForegroundColor DarkGray
            $anyMissing = $true
            continue
        }

        $files = Get-ChildItem -Path $compDir -Filter "*.qml" |
                 Sort-Object { $_.FullName } |
                 Select-Object -ExpandProperty FullName

        Write-Host ""
        Write-Host "── $compName  ($($files.Count) file$(if ($files.Count -ne 1){'s'}))" -ForegroundColor Cyan
        Write-Host ("-" * 60)

        if ($files.Count -eq 0) {
            Write-Host "  (no .qml files)" -ForegroundColor DarkGray
            continue
        }

        $compPass = 0; $compWarn = 0; $compFail = 0

        foreach ($f in $files) {
            $displayName = Split-Path $f -Leaf
            $output = & $QtPath @lintArgs $f 2>&1 | Out-String

            if ($LASTEXITCODE -eq 0) {
                # Always count warnings; display detail lines only when -ShowWarnings is set
                $warnLines = @($output -split "`r?`n" | Where-Object { $_ -match 'Warning:' })
                if ($warnLines.Count -gt 0) {
                    Write-Host ("  {0,-6} {1}" -f "WARN", $displayName) -ForegroundColor Yellow
                    if ($ShowWarnings) {
                        $warnLines | ForEach-Object { Write-Host "         $_" -ForegroundColor Yellow }
                    }
                    $compWarn++
                } else {
                    Write-Host ("  {0,-6} {1}" -f "PASS", $displayName) -ForegroundColor Green
                    if ($Verbose -and $output.Trim()) {
                        Write-Host $output.Trim() -ForegroundColor DarkGray
                    }
                    $compPass++
                }
            } else {
                Write-Host ("  {0,-6} {1}" -f "FAIL", $displayName) -ForegroundColor Red
                if ($output.Trim()) {
                    $output.Trim() -split "`n" | ForEach-Object { Write-Host "         $_" -ForegroundColor Yellow }
                }
                $compFail++
            }
        }

        $compSummary = "$compPass passed, $compWarn warnings, $compFail failed"
        if ($compFail -gt 0)      { Write-Host $compSummary -ForegroundColor Red    }
        elseif ($compWarn -gt 0)  { Write-Host $compSummary -ForegroundColor Yellow }
        else                      { Write-Host $compSummary -ForegroundColor Green  }

        $totalPass += $compPass
        $totalWarn += $compWarn
        $totalFail += $compFail
    }

    Write-Host ""
    Write-Host ("=" * 60)
    $totalSummary = "TOTAL  $totalPass passed, $totalWarn warnings, $totalFail failed"
    if ($totalFail -gt 0)      { Write-Host $totalSummary -ForegroundColor Red    }
    elseif ($totalWarn -gt 0)  { Write-Host $totalSummary -ForegroundColor Yellow }
    else                       { Write-Host $totalSummary -ForegroundColor Green  }
    Write-Host ""

    exit $totalFail
}

if ($File) {
    # Single-file mode — resolve against cwd first, then scriptDir/qml
    $defaultQmlDir = Join-Path $scriptDir "qml"
    if (Test-Path $File) {
        $targets = @((Resolve-Path $File).Path)
    } elseif (Test-Path (Join-Path $defaultQmlDir $File)) {
        $targets = @((Resolve-Path (Join-Path $defaultQmlDir $File)).Path)
    } else {
        Write-Error "File not found: $File"
        exit 1
    }
} else {
    # Directory mode
    if ($Dir) {
        # Resolve relative Dir paths against cwd
        $searchRoot = if ([System.IO.Path]::IsPathRooted($Dir)) { $Dir } `
                      else { Join-Path (Get-Location) $Dir }
    } else {
        $searchRoot = Join-Path $scriptDir "qml"
    }

    if (-not (Test-Path $searchRoot -PathType Container)) {
        Write-Error "Directory not found: $searchRoot"
        exit 1
    }

    $gcArgs = @{ Path = $searchRoot; Filter = "*.qml" }
    if ($Recurse) { $gcArgs["Recurse"] = $true }

    $targets = Get-ChildItem @gcArgs |
               Sort-Object { $_.FullName } |
               Select-Object -ExpandProperty FullName

    if ($targets.Count -eq 0) {
        $recurseNote = if ($Recurse) { " (recursively)" } else { "" }
        Write-Host "No .qml files found in $searchRoot$recurseNote" -ForegroundColor Yellow
        exit 0
    }
}

# ── Run lint ──────────────────────────────────────────────────────────────────
$passCount = 0
$warnCount = 0
$failCount = 0
$lintArgs  = @()
if ($Verbose)                  { $lintArgs += "--verbose" }
if (Test-Path $qmlModulesDir)  { $lintArgs += "-I"; $lintArgs += $qmlModulesDir }
if (Test-Path $qtQmlDir)       { $lintArgs += "-I"; $lintArgs += $qtQmlDir }

$recurseNote = if ($Recurse -and -not $File) { " (recursive)" } else { "" }
Write-Host ""
Write-Host "qmllint  ($($targets.Count) file$(if ($targets.Count -ne 1){'s'})$recurseNote)" -ForegroundColor Cyan
Write-Host ("-" * 60)

foreach ($f in $targets) {
    # Show path relative to searchRoot when linting a directory, otherwise just filename
    if ($File) {
        $displayName = Split-Path $f -Leaf
    } else {
        $displayName = $f.Substring($searchRoot.Length).TrimStart('\', '/')
    }

    $output = & $QtPath @lintArgs $f 2>&1 | Out-String

    if ($LASTEXITCODE -eq 0) {
        # Always count warnings; display detail lines only when -ShowWarnings is set
        $warnLines = @($output -split "`r?`n" | Where-Object { $_ -match 'Warning:' })

        if ($warnLines.Count -gt 0) {
            Write-Host ("  {0,-6} {1}" -f "WARN", $displayName) -ForegroundColor Yellow
            if ($ShowWarnings) {
                $warnLines | ForEach-Object { Write-Host "         $_" -ForegroundColor Yellow }
            }
            $warnCount++
        } else {
            Write-Host ("  {0,-6} {1}" -f "PASS", $displayName) -ForegroundColor Green
            if ($Verbose -and $output.Trim()) {
                Write-Host $output.Trim() -ForegroundColor DarkGray
            }
            $passCount++
        }
    } else {
        Write-Host ("  {0,-6} {1}" -f "FAIL", $displayName) -ForegroundColor Red
        if ($output.Trim()) {
            $output.Trim() -split "`n" | ForEach-Object { Write-Host "         $_" -ForegroundColor Yellow }
        }
        $failCount++
    }
}

Write-Host ("-" * 60)
$summary = "$passCount passed, $warnCount warnings, $failCount failed"
if ($failCount -gt 0) {
    Write-Host $summary -ForegroundColor Red
} elseif ($warnCount -gt 0) {
    Write-Host $summary -ForegroundColor Yellow
} else {
    Write-Host $summary -ForegroundColor Green
}
Write-Host ""

exit $failCount
