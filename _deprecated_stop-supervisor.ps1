#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Stop the Project Memory MCP Supervisor.

.DESCRIPTION
    Attempts app-owned graceful shutdown via the supervisor control named pipe
    (`ShutdownSupervisor` request). If graceful shutdown cannot be requested,
    falls back to stopping supervisor.exe only.

.PARAMETER Force
    Skip graceful-wait behavior and terminate supervisor process immediately.

.PARAMETER ChildTimeout
    Seconds to wait after graceful shutdown request before fallback termination.
    Default: 3.

.EXAMPLE
    .\stop-supervisor.ps1

.EXAMPLE
    .\stop-supervisor.ps1 -Force

.EXAMPLE
    .\stop-supervisor.ps1 -ChildTimeout 10
#>

[CmdletBinding()]
param(
    [switch]$Force,
    [int]$ChildTimeout = 3
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# ── Locate the supervisor ─────────────────────────────────────────────────────

$PipePath = '\\.\pipe\project-memory-supervisor'
$PipeAlive = Test-Path $PipePath

$SupProc = Get-Process -Name supervisor -ErrorAction SilentlyContinue

if (-not $SupProc -and -not $PipeAlive) {
    Write-Host 'Supervisor is not running.' -ForegroundColor DarkGray
    exit 0
}

if (-not $SupProc) {
    # Pipe exists but process not found by name — unusual state
    Write-Host '⚠ Named pipe exists but no supervisor.exe process found.' -ForegroundColor Yellow
    Write-Host '  Nothing to kill.' -ForegroundColor DarkGray
    exit 0
}

Write-Host ''
Write-Host 'Stopping supervisor...' -ForegroundColor Cyan
Write-Host "  PID:   $($SupProc.Id)" -ForegroundColor DarkGray
Write-Host "  CPU:   $([math]::Round($SupProc.CPU, 2))s" -ForegroundColor DarkGray
Write-Host ''

# ── Request graceful app-owned shutdown via control pipe ─────────────────────

$requestedGraceful = $false
if (-not $Force -and $PipeAlive) {
    try {
        $pipeClient = New-Object System.IO.Pipes.NamedPipeClientStream('.', 'project-memory-supervisor', [System.IO.Pipes.PipeDirection]::InOut)
        $pipeClient.Connect(1000)

        $writer = New-Object System.IO.StreamWriter($pipeClient)
        $writer.AutoFlush = $true
        $reader = New-Object System.IO.StreamReader($pipeClient)

        $writer.WriteLine('{"type":"ShutdownSupervisor"}')
        $responseLine = $reader.ReadLine()
        if ($responseLine) {
            Write-Host '✓ Shutdown request sent via control API.' -ForegroundColor Green
            $requestedGraceful = $true
        }

        $reader.Dispose()
        $writer.Dispose()
        $pipeClient.Dispose()
    } catch {
        Write-Host "⚠ Graceful shutdown request failed: $_" -ForegroundColor Yellow
    }
}

if ($requestedGraceful) {
    Write-Host "  Waiting up to ${ChildTimeout}s for graceful exit..." -ForegroundColor DarkGray
    $deadline = (Get-Date).AddSeconds($ChildTimeout)
    while ((Get-Date) -lt $deadline) {
        $stillRunning = Get-Process -Id $SupProc.Id -ErrorAction SilentlyContinue
        if (-not $stillRunning) {
            Write-Host '✓ Supervisor exited gracefully.' -ForegroundColor Green
            break
        }
        Start-Sleep -Milliseconds 200
    }
}

# ── Fallback termination (supervisor process only) ──────────────────────────

$stillRunning = Get-Process -Id $SupProc.Id -ErrorAction SilentlyContinue
if ($stillRunning) {
    try {
        Stop-Process -Id $SupProc.Id -Force
        Write-Host "✓ Supervisor (PID $($SupProc.Id)) terminated." -ForegroundColor Green
    } catch {
        Write-Host "✗ Failed to stop supervisor: $_" -ForegroundColor Red
        exit 1
    }
}

# ── Verify pipe is gone ───────────────────────────────────────────────────────

$DelayMs = 500
Start-Sleep -Milliseconds $DelayMs
if (Test-Path $PipePath) {
    Write-Host ''
    Write-Host '⚠ Named pipe still exists — another supervisor instance may be running.' -ForegroundColor Yellow
} else {
    Write-Host ''
    Write-Host 'Supervisor stopped.' -ForegroundColor Green
}
