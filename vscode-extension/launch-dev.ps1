<#
.SYNOPSIS
    Launch a VS Code instance with the dev extension loaded (does NOT affect stable install).

.DESCRIPTION
    Uses --extensionDevelopmentPath to side-load the extension into a NEW VS Code window
    under a dedicated "ProjectMemoryDev" profile. The stable extension remains untouched.

    The profile isolates:
      - Extensions (only this dev ext loads in the profile)
      - Settings (projectMemoryDev.* / supervisorDev.*)
      - Global state

.PARAMETER WorkspacePath
    Optional path to a workspace or folder to open in the dev instance.
    Defaults to the Project Memory MCP project root.

.PARAMETER SkipCompile
    Skip npm compilation before launch.

.EXAMPLE
    .\launch-dev.ps1
    .\launch-dev.ps1 -WorkspacePath "C:\MyProject"
    .\launch-dev.ps1 -SkipCompile
#>
param(
    [string]$WorkspacePath = "",
    [switch]$SkipCompile
)

$ErrorActionPreference = "Stop"
$extDir = $PSScriptRoot

# Compile the extension
if (-not $SkipCompile) {
    Write-Host "Compiling extension..." -ForegroundColor Cyan
    Push-Location $extDir
    npm run compile
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Compile failed!" -ForegroundColor Red
        Pop-Location
        exit 1
    }
    Pop-Location
    Write-Host "Compile succeeded." -ForegroundColor Green
}

# Build the code command
$codeArgs = @(
    "--extensionDevelopmentPath=$extDir",
    "--profile=ProjectMemoryDev"
)

if ($WorkspacePath) {
    $resolved = Resolve-Path $WorkspacePath -ErrorAction Stop
    $codeArgs += $resolved.Path
} else {
    # Default: open the project root (parent of vscode-extension)
    $projectRoot = Split-Path $extDir -Parent
    $codeArgs += $projectRoot
}

Write-Host "`nLaunching VS Code dev instance..." -ForegroundColor Cyan
Write-Host "  Profile: ProjectMemoryDev" -ForegroundColor DarkGray
Write-Host "  Extension: $extDir" -ForegroundColor DarkGray
Write-Host "  Workspace: $($codeArgs[-1])" -ForegroundColor DarkGray
Write-Host ""

code @codeArgs
