#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Build/install a single component. Delegates to install.ps1.

.PARAMETER Include
    Component to build. Valid values match install.ps1 -Component.
    Default: All
#>
[CmdletBinding()]
param(
    [string]$Include = "All"
)

$ErrorActionPreference = "Stop"

# Resolve the project root from this script's location (scripts/ sub-dir)
$Root = Split-Path -Parent $PSScriptRoot

& "$Root\install.ps1" -Component $Include
