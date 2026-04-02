# copy-to-newgoo.ps1
# Copies only the components required for the QML -> iced refactor.
# Run from: Project-Memory-MCP root
# Usage: .\copy-to-newgoo.ps1
#        .\copy-to-newgoo.ps1 -Component pm-approval-gui

param([string]$Component = "")

$SRC  = $PSScriptRoot
$DEST = "D:\2026\ProjectMemory-NewGoo"

$XD = @("target", ".git")
$XF = @("*.exe", "*.pdb")

function Copy-Component {
    param([string]$Name, [string]$SrcPath, [string]$DestPath)
    Write-Host "`n>> $Name" -ForegroundColor Cyan
    $args = @($SrcPath, $DestPath, "/E", "/NP", "/NDL") +
            ($XD | ForEach-Object { "/XD"; $_ }) +
            ($XF | ForEach-Object { "/XF"; $_ })
    robocopy @args | Out-Null
    if ($LASTEXITCODE -le 3) { Write-Host "   OK" -ForegroundColor Green }
    else { Write-Host "   ERROR (exit $LASTEXITCODE)" -ForegroundColor Red }
}

function Copy-File {
    param([string]$Name, [string]$SrcFile, [string]$DestFile)
    Write-Host "`n>> $Name" -ForegroundColor Cyan
    Copy-Item $SrcFile $DestFile -Force
    Write-Host "   OK" -ForegroundColor Green
}

# Only what the refactor actually needs
$components = [ordered]@{
    "workspace-cargo-toml"   = @{ type = "file"; src = "$SRC\Cargo.toml";                          dest = "$DEST\Cargo.toml" }
    "workspace-cargo-lock"   = @{ type = "file"; src = "$SRC\Cargo.lock";                          dest = "$DEST\Cargo.lock" }
    "cartographer-core"      = @{ type = "dir";  src = "$SRC\crates\cartographer-core";            dest = "$DEST\crates\cartographer-core" }
    "supervisor"             = @{ type = "dir";  src = "$SRC\supervisor";                          dest = "$DEST\supervisor" }
    "pm-approval-gui"        = @{ type = "dir";  src = "$SRC\pm-approval-gui";                     dest = "$DEST\pm-approval-gui" }
    "pm-brainstorm-gui"      = @{ type = "dir";  src = "$SRC\pm-brainstorm-gui";                   dest = "$DEST\pm-brainstorm-gui" }
    "pm-install-gui"         = @{ type = "dir";  src = "$SRC\pm-install-gui";                      dest = "$DEST\pm-install-gui" }
    "pm-gui-forms"           = @{ type = "dir";  src = "$SRC\pm-gui-forms";                        dest = "$DEST\pm-gui-forms" }
    "interactive-terminal"   = @{ type = "dir";  src = "$SRC\interactive-terminal";                dest = "$DEST\interactive-terminal" }
    "pm-cli"                 = @{ type = "dir";  src = "$SRC\pm-cli";                              dest = "$DEST\pm-cli" }
}

if (-not (Test-Path $DEST)) { New-Item -ItemType Directory -Path $DEST -Force | Out-Null }

$run = if ($Component) { @($Component) } else { $components.Keys }

foreach ($name in $run) {
    if (-not $components.Contains($name)) {
        Write-Host "Unknown component: $name  (available: $($components.Keys -join ', '))" -ForegroundColor Red
        exit 1
    }
    $c = $components[$name]
    if (-not (Test-Path $c.src)) { Write-Host "`n>> $name  (skipped — not found)" -ForegroundColor DarkYellow; continue }
    if ($c.type -eq "file") { Copy-File -Name $name -SrcFile $c.src -DestFile $c.dest }
    else                    { Copy-Component -Name $name -SrcPath $c.src -DestPath $c.dest }
}

Write-Host "`nDone." -ForegroundColor Green
