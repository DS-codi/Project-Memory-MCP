<#
.SYNOPSIS
    Run qmllint on supervisor QML files.

.PARAMETER File
    Specific .qml file to lint (relative or absolute). Omit to lint all files in qml/.

.PARAMETER QtPath
    Path to qmllint.exe. Defaults to the Qt 6.10.2 MSVC installation.

.PARAMETER Verbose
    Pass --verbose to qmllint for detailed output even on passing files.

.EXAMPLE
    .\lint-qml.ps1
    .\lint-qml.ps1 -File qml\PlansPanel.qml
    .\lint-qml.ps1 -File qml\PlansPanel.qml -Verbose
#>
param(
    [string]$File     = "",
    [string]$QtPath   = "C:\Qt\6.10.2\msvc2022_64\bin\qmllint.exe",
    [switch]$Verbose
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
$scriptDir = Split-Path $MyInvocation.MyCommand.Path -Parent
$qmlDir    = Join-Path $scriptDir "qml"

if ($File) {
    # Accept relative paths (resolve against cwd, then scriptDir/qml)
    if (Test-Path $File) {
        $targets = @((Resolve-Path $File).Path)
    } elseif (Test-Path (Join-Path $qmlDir $File)) {
        $targets = @((Resolve-Path (Join-Path $qmlDir $File)).Path)
    } else {
        Write-Error "File not found: $File"
        exit 1
    }
} else {
    $targets = Get-ChildItem $qmlDir -Filter "*.qml" | Sort-Object Name |
               Select-Object -ExpandProperty FullName
    if ($targets.Count -eq 0) {
        Write-Host "No .qml files found in $qmlDir" -ForegroundColor Yellow
        exit 0
    }
}

# ── Run lint ──────────────────────────────────────────────────────────────────
$passCount = 0
$failCount = 0
$lintArgs  = @()
if ($Verbose) { $lintArgs += "--verbose" }

Write-Host ""
Write-Host "qmllint  ($($targets.Count) file$(if ($targets.Count -ne 1){'s'}))" -ForegroundColor Cyan
Write-Host ("-" * 60)

foreach ($f in $targets) {
    $name   = Split-Path $f -Leaf
    $output = & $QtPath @lintArgs $f 2>&1 | Out-String

    if ($LASTEXITCODE -eq 0) {
        Write-Host ("  {0,-6} {1}" -f "PASS", $name) -ForegroundColor Green
        if ($Verbose -and $output.Trim()) {
            Write-Host $output.Trim() -ForegroundColor DarkGray
        }
        $passCount++
    } else {
        Write-Host ("  {0,-6} {1}" -f "FAIL", $name) -ForegroundColor Red
        if ($output.Trim()) {
            # Indent output for readability
            $output.Trim() -split "`n" | ForEach-Object { Write-Host "         $_" -ForegroundColor Yellow }
        }
        $failCount++
    }
}

Write-Host ("-" * 60)
$summary = "$passCount passed, $failCount failed"
if ($failCount -eq 0) {
    Write-Host $summary -ForegroundColor Green
} else {
    Write-Host $summary -ForegroundColor Red
}
Write-Host ""

exit $failCount
