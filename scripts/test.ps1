#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Test runner wrapper. Delegates to run-tests.ps1.

.PARAMETER Include
    Component(s) to test. Default: All
#>
[CmdletBinding()]
param(
    [string]$Include = "All"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

& "$Root\run-tests.ps1" -Component $Include
