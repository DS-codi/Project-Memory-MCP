#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Refreshes GUI icon assets across Project Memory MCP.

.DESCRIPTION
    This script enforces two icon rules for all GUI app icon sets:
    1. No white canvas background outside icon shapes (transparent outer area).
    2. Icon glyphs are scaled to the largest size that fits within icon bounds.

    For each configured icon set, the script:
    - Removes an SVG full-canvas white <rect> when present.
    - Regenerates PNG from SVG with transparent background and trim+fit scaling.
    - Regenerates ICO from the PNG (16..256 sizes).

.PARAMETER RepoRoot
    Repository root path. Defaults to the parent of this script directory.

.PARAMETER EdgePaddingPx
    Transparent padding on each side when fitting into 512x512.
    Use 0 for maximum fill (default).

.PARAMETER DryRun
    Prints planned changes/commands without writing files.

.EXAMPLE
    .\scripts\refresh-gui-icons.ps1

.EXAMPLE
    .\scripts\refresh-gui-icons.ps1 -EdgePaddingPx 4

.EXAMPLE
    .\scripts\refresh-gui-icons.ps1 -DryRun
#>
[CmdletBinding()]
param(
    [string]$RepoRoot = (Split-Path -Parent $PSScriptRoot),
    [ValidateRange(0, 128)]
    [int]$EdgePaddingPx = 0,
    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Write-Section([string]$Text) {
    Write-Host "`n== $Text" -ForegroundColor Cyan
}

function Write-Info([string]$Text) {
    Write-Host "  [INFO] $Text" -ForegroundColor Gray
}

function Write-Changed([string]$Text) {
    Write-Host "  [CHANGED] $Text" -ForegroundColor Green
}

function Write-WarnLine([string]$Text) {
    Write-Host "  [WARN] $Text" -ForegroundColor Yellow
}

function Resolve-MagickPath {
    $command = Get-Command magick -ErrorAction SilentlyContinue
    if ($command) {
        return $command.Source
    }

    $fallback = 'C:\Program Files\ImageMagick-7.1.2-Q16-HDRI\magick.exe'
    if (Test-Path $fallback) {
        return $fallback
    }

    throw "ImageMagick 'magick' was not found. Install ImageMagick 7+ or add 'magick' to PATH."
}

function Remove-FullCanvasWhiteRect {
    param(
        [Parameter(Mandatory)]
        [string]$SvgPath,
        [switch]$DryRunMode
    )

    if (-not (Test-Path $SvgPath)) {
        throw "SVG not found: $SvgPath"
    }

    $raw = Get-Content -Path $SvgPath -Raw
    $pattern = @'
(?im)^\s*<rect\b(?=[^>]*\bwidth\s*=\s*(?:"(?:512|100%)"|'(?:512|100%)'))(?=[^>]*\bheight\s*=\s*(?:"(?:512|100%)"|'(?:512|100%)'))(?=[^>]*\bfill\s*=\s*(?:"(?:#fff|#ffffff|white)"|'(?:#fff|#ffffff|white)'))(?![^>]*\bstroke\s*=)[^>]*/>\s*\r?\n?
'@
    $updated = [regex]::Replace($raw, $pattern, '')

    if ($updated -ne $raw) {
        if ($DryRunMode) {
            Write-Info "Would remove canvas white rect from: $SvgPath"
        }
        else {
            Set-Content -Path $SvgPath -Value $updated -Encoding UTF8 -NoNewline
            Write-Changed "Removed canvas white rect from: $SvgPath"
        }
        return $true
    }

    Write-Info "No canvas white rect found: $SvgPath"
    return $false
}

function Invoke-Magick {
    param(
        [Parameter(Mandatory)]
        [string]$MagickPath,
        [Parameter(Mandatory)]
        [string[]]$Arguments,
        [switch]$DryRunMode
    )

    if ($DryRunMode) {
        Write-Info ("magick " + ($Arguments -join ' '))
        return
    }

    & $MagickPath @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "magick failed with exit code $LASTEXITCODE. Args: $($Arguments -join ' ')"
    }
}

function Update-IconSet {
    param(
        [Parameter(Mandatory)]
        [hashtable]$IconSet,
        [Parameter(Mandatory)]
        [string]$RepoRootPath,
        [Parameter(Mandatory)]
        [string]$MagickPath,
        [Parameter(Mandatory)]
        [int]$FitSize,
        [switch]$DryRunMode
    )

    $svgPath = Join-Path $RepoRootPath $IconSet.Svg
    $pngPath = Join-Path $RepoRootPath $IconSet.Png
    $icoPath = Join-Path $RepoRootPath $IconSet.Ico

    Remove-FullCanvasWhiteRect -SvgPath $svgPath -DryRunMode:$DryRunMode | Out-Null

    $pngArgs = @(
        $svgPath,
        '-background', 'none',
        '-trim', '+repage',
        '-filter', 'Lanczos',
        '-resize', "${FitSize}x${FitSize}",
        '-gravity', 'center',
        '-extent', '512x512',
        "PNG32:$pngPath"
    )
    Invoke-Magick -MagickPath $MagickPath -Arguments $pngArgs -DryRunMode:$DryRunMode

    $icoArgs = @(
        $pngPath,
        '-define', 'icon:auto-resize=256,128,64,48,32,24,16',
        $icoPath
    )
    Invoke-Magick -MagickPath $MagickPath -Arguments $icoArgs -DryRunMode:$DryRunMode

    if ($DryRunMode) {
        Write-Info "Would refresh: $($IconSet.Name)"
    }
    else {
        Write-Changed "Refreshed: $($IconSet.Name)"
    }
}

$resolvedRepoRoot = (Resolve-Path -Path $RepoRoot).Path
$fitSize = 512 - ($EdgePaddingPx * 2)
if ($fitSize -lt 1) {
    throw "EdgePaddingPx ($EdgePaddingPx) is too large. Fit size must remain >= 1."
}

$iconSets = @(
    @{ Name = 'Supervisor app icon'; Svg = 'supervisor/resources/app_icon.svg'; Png = 'supervisor/resources/app_icon.png'; Ico = 'supervisor/resources/app_icon.ico' },
    @{ Name = 'Interactive Terminal app icon'; Svg = 'interactive-terminal/resources/app_icon.svg'; Png = 'interactive-terminal/resources/app_icon.png'; Ico = 'interactive-terminal/resources/app_icon.ico' },
    @{ Name = 'Interactive Terminal tray icon'; Svg = 'interactive-terminal/resources/itpm-icon.svg'; Png = 'interactive-terminal/resources/itpm-icon.png'; Ico = 'interactive-terminal/resources/itpm-icon.ico' },
    @{ Name = 'Approval GUI app icon'; Svg = 'pm-approval-gui/resources/app_icon.svg'; Png = 'pm-approval-gui/resources/app_icon.png'; Ico = 'pm-approval-gui/resources/app_icon.ico' },
    @{ Name = 'Brainstorm GUI app icon'; Svg = 'pm-brainstorm-gui/resources/app_icon.svg'; Png = 'pm-brainstorm-gui/resources/app_icon.png'; Ico = 'pm-brainstorm-gui/resources/app_icon.ico' },
    @{ Name = 'Install GUI app icon'; Svg = 'pm-install-gui/resources/app_icon.svg'; Png = 'pm-install-gui/resources/app_icon.png'; Ico = 'pm-install-gui/resources/app_icon.ico' },
    @{ Name = 'Install GUI tray icon'; Svg = 'pm-install-gui/resources/itpm-icon.svg'; Png = 'pm-install-gui/resources/itpm-icon.png'; Ico = 'pm-install-gui/resources/itpm-icon.ico' },
    @{ Name = 'Supervisor status icon (green)'; Svg = 'supervisor/assets/icons/supervisor_green.svg'; Png = 'supervisor/assets/icons/supervisor_green.png'; Ico = 'supervisor/assets/icons/supervisor_green.ico' },
    @{ Name = 'Supervisor status icon (blue)'; Svg = 'supervisor/assets/icons/supervisor_blue.svg'; Png = 'supervisor/assets/icons/supervisor_blue.png'; Ico = 'supervisor/assets/icons/supervisor_blue.ico' },
    @{ Name = 'Supervisor status icon (purple)'; Svg = 'supervisor/assets/icons/supervisor_purple.svg'; Png = 'supervisor/assets/icons/supervisor_purple.png'; Ico = 'supervisor/assets/icons/supervisor_purple.ico' },
    @{ Name = 'Supervisor status icon (red)'; Svg = 'supervisor/assets/icons/supervisor_red.svg'; Png = 'supervisor/assets/icons/supervisor_red.png'; Ico = 'supervisor/assets/icons/supervisor_red.ico' }
)

Write-Section 'Refresh GUI Icons'
Write-Info "Repo root: $resolvedRepoRoot"
Write-Info "Edge padding (px): $EdgePaddingPx"
Write-Info "Fit size: ${fitSize}x${fitSize} into 512x512"
if ($DryRun) {
    Write-WarnLine 'Dry run mode: no files will be written.'
}

$magickPath = Resolve-MagickPath
Write-Info "ImageMagick: $magickPath"

Write-Section 'Processing Icon Sets'
foreach ($iconSet in $iconSets) {
    Update-IconSet -IconSet $iconSet -RepoRootPath $resolvedRepoRoot -MagickPath $magickPath -FitSize $fitSize -DryRunMode:$DryRun
}

Write-Section 'Done'
if ($DryRun) {
    Write-Host 'Dry run complete.' -ForegroundColor Green
}
else {
    Write-Host 'GUI icon assets refreshed successfully.' -ForegroundColor Green
}