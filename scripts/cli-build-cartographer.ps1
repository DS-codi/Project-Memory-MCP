#Requires -Version 5.1
<#
.SYNOPSIS
    CLI build helper: Cartographer Core (Rust crate).
    Runs cargo build --release -p cartographer-core.
    No prompts, no interaction.
#>
param([switch]$Force)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot

Set-Location $Root

Write-Host "Building cartographer-core..."
cargo build --release -p cartographer-core
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "cartographer-core built OK -> target\release\cartographer-core.exe"
