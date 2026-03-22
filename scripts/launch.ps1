#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Launch wrapper. Delegates to launch-supervisor.ps1.

.PARAMETER AutoKillExisting
    Automatically kill detected running component processes.

.PARAMETER WriteConfigOnly
    Write supervisor.toml and exit without launching.

.PARAMETER Console
    Keep the PowerShell window open (useful for debug output).
#>
[CmdletBinding()]
param(
    [switch]$AutoKillExisting,
    [switch]$WriteConfigOnly,
    [switch]$Console
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

$launchArgs = @()
if ($AutoKillExisting) { $launchArgs += '-AutoKillExisting' }
if ($WriteConfigOnly)  { $launchArgs += '-WriteConfigOnly' }

& "$Root\launch-supervisor.ps1" @launchArgs
