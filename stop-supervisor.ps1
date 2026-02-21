#!/usr/bin/env pwsh
#Requires -Version 7
<#
.SYNOPSIS
    Stop the Project Memory MCP Supervisor and all child processes it manages.

.DESCRIPTION
    Performs a layered teardown:
      1. Requests graceful shutdown via the supervisor control named-pipe API.
      2. Waits up to -GraceSeconds for the supervisor to exit on its own.
      3. If still alive, resolves every descendent process in the PID tree
         (via WMI) and forcibly terminates children before the supervisor.
      4. As a belt-and-suspenders pass, kills any surviving processes that
         match the well-known child executable names listed in $KnownChildren.

    Child executables targeted (names only, not paths):
      node                  — MCP server (Node.js backend)
      interactive-terminal  — Interactive Terminal GUI
      pm-brainstorm-gui     — Brainstorm form GUI
      pm-approval-gui       — Approval form GUI
      vite                  — Dashboard dev server
      npx                   — Dashboard launcher shim

.PARAMETER GraceSeconds
    How long to wait after a graceful shutdown request before force-killing.
    Default: 5

.PARAMETER Force
    Skip the graceful shutdown request and go straight to force-kill. Useful
    when the supervisor is hung and not responding to the control pipe.

.PARAMETER WhatIf
    Dry-run: discover and report what would be killed without killing anything.

.EXAMPLE
    .\stop-supervisor.ps1

.EXAMPLE
    .\stop-supervisor.ps1 -Force

.EXAMPLE
    .\stop-supervisor.ps1 -GraceSeconds 10

.EXAMPLE
    .\stop-supervisor.ps1 -WhatIf
#>
[CmdletBinding(SupportsShouldProcess)]
param(
    [int]   $GraceSeconds = 5,
    [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ── Constants ─────────────────────────────────────────────────────────────────

$PipeName = 'project-memory-supervisor'
$PipePath = "\\.\pipe\$PipeName"

# Well-known names spawned by the supervisor's managed runners.
# These are matched as process Name (no .exe suffix, case-insensitive).
$KnownChildren = @(
    'node'                  # NodeRunner  — MCP server (Node.js)
    'interactive-terminal'  # InteractiveTerminalRunner
    'pm-brainstorm-gui'     # FormAppRunner — Brainstorm GUI
    'pm-approval-gui'       # FormAppRunner — Approval GUI
    'vite'                  # DashboardRunner — Vite dev server
    'npx'                   # DashboardRunner — npx shim
)

# ── Helpers ───────────────────────────────────────────────────────────────────

function Write-Section([string]$Text) {
    Write-Host ''
    Write-Host $Text -ForegroundColor Cyan
}

function Write-Ok([string]$Text) {
    Write-Host "  ✓ $Text" -ForegroundColor Green
}

function Write-Warn([string]$Text) {
    Write-Host "  ⚠ $Text" -ForegroundColor Yellow
}

function Write-Info([string]$Text) {
    Write-Host "  · $Text" -ForegroundColor DarkGray
}

function Write-Err([string]$Text) {
    Write-Host "  ✗ $Text" -ForegroundColor Red
}

# Return all descendant PIDs of $RootPid in bottom-up order (leaves first).
function Get-DescendantPids([int]$RootPid) {
    # Build a parent→children map from a single WMI query (one round-trip).
    $allProcs = Get-CimInstance -ClassName Win32_Process -Property ProcessId, ParentProcessId
    $childMap = @{}   # [parentPid] -> [list of childPids]
    foreach ($p in $allProcs) {
        if (-not $childMap.ContainsKey($p.ParentProcessId)) {
            $childMap[$p.ParentProcessId] = [System.Collections.Generic.List[int]]::new()
        }
        $childMap[$p.ParentProcessId].Add($p.ProcessId)
    }

    # BFS from $RootPid; collect in visit order (parents before children).
    $ordered  = [System.Collections.Generic.List[int]]::new()
    $queue    = [System.Collections.Generic.Queue[int]]::new()
    $queue.Enqueue($RootPid)

    while ($queue.Count -gt 0) {
        $current = $queue.Dequeue()
        $ordered.Add($current)
        if ($childMap.ContainsKey($current)) {
            foreach ($child in $childMap[$current]) {
                $queue.Enqueue($child)
            }
        }
    }

    # Reverse so deepest descendants come first (kill leaves before parents).
    $ordered.Reverse()
    # Exclude the root itself — caller handles that.
    return $ordered | Where-Object { $_ -ne $RootPid }
}

function Stop-PidSafely([int]$Pid, [string]$Label) {
    $proc = Get-Process -Id $Pid -ErrorAction SilentlyContinue
    if (-not $proc) { return }

    if ($PSCmdlet.ShouldProcess("$Label (PID $Pid)", 'Stop-Process')) {
        try {
            Stop-Process -Id $Pid -Force -ErrorAction Stop
            Write-Ok "Killed $Label (PID $Pid)"
        } catch {
            Write-Warn "Could not kill $Label (PID $Pid): $_"
        }
    } else {
        Write-Info "[WhatIf] Would kill $Label (PID $Pid)"
    }
}

# ── 1. Find supervisor ────────────────────────────────────────────────────────

Write-Section 'Locating supervisor...'

$supProcs = @(Get-Process -Name 'supervisor' -ErrorAction SilentlyContinue)
$pipeAlive = Test-Path $PipePath

if ($supProcs.Count -eq 0 -and -not $pipeAlive) {
    Write-Info 'Supervisor is not running.'
    exit 0
}

if ($supProcs.Count -eq 0) {
    Write-Warn "Control pipe exists at $PipePath but no supervisor.exe found."
    Write-Info 'Nothing to kill.'
    exit 0
}

if ($supProcs.Count -gt 1) {
    Write-Warn "Multiple supervisor processes found (PIDs: $($supProcs.Id -join ', ')). Targeting all."
}

foreach ($sp in $supProcs) {
    Write-Info "supervisor.exe  PID=$($sp.Id)  Started=$($sp.StartTime)"
}

# ── 2. Graceful shutdown via named-pipe control API ───────────────────────────

$requestedGraceful = $false

if (-not $Force -and $pipeAlive) {
    Write-Section 'Requesting graceful shutdown via control API...'
    try {
        $client = [System.IO.Pipes.NamedPipeClientStream]::new(
            '.', $PipeName,
            [System.IO.Pipes.PipeDirection]::InOut,
            [System.IO.Pipes.PipeOptions]::None
        )
        $client.Connect(1500)   # 1.5 s connect timeout

        $writer = [System.IO.StreamWriter]::new($client)
        $writer.AutoFlush = $true
        $reader = [System.IO.StreamReader]::new($client)

        $writer.WriteLine('{"type":"ShutdownSupervisor"}')
        $response = $reader.ReadLine()

        if ($response) {
            Write-Ok "Shutdown request accepted. Response: $response"
            $requestedGraceful = $true
        } else {
            Write-Warn 'No response from control API; will force-kill.'
        }
    } catch {
        Write-Warn "Control pipe request failed ($_); will force-kill."
    } finally {
        if ($null -ne $client) { $client.Dispose() }
    }
}

# ── 3. Wait for graceful exit ─────────────────────────────────────────────────

if ($requestedGraceful) {
    Write-Section "Waiting up to ${GraceSeconds}s for supervisor to exit..."
    $deadline = (Get-Date).AddSeconds($GraceSeconds)
    while ((Get-Date) -lt $deadline) {
        $alive = @($supProcs | Where-Object { Get-Process -Id $_.Id -ErrorAction SilentlyContinue })
        if ($alive.Count -eq 0) {
            Write-Ok 'Supervisor exited gracefully.'
            break
        }
        Start-Sleep -Milliseconds 200
    }
}

# ── 4. Force-kill: PID-tree walk ──────────────────────────────────────────────

$supProcs = @(Get-Process -Name 'supervisor' -ErrorAction SilentlyContinue)
if ($supProcs.Count -gt 0) {
    Write-Section 'Force-killing supervisor and its process tree...'

    foreach ($sp in $supProcs) {
        Write-Info "Resolving process tree for supervisor PID $($sp.Id)..."
        $childPids = Get-DescendantPids -RootPid $sp.Id

        if ($childPids.Count -gt 0) {
            Write-Info "  Child PIDs (deepest first): $($childPids -join ', ')"
        } else {
            Write-Info '  No child processes found in PID tree.'
        }

        # Kill children first (deepest/leaves already first from Get-DescendantPids).
        foreach ($childPid in $childPids) {
            $childProc = Get-Process -Id $childPid -ErrorAction SilentlyContinue
            $label = if ($childProc) { $childProc.Name } else { 'unknown' }
            Stop-PidSafely -Pid $childPid -Label $label
        }

        # Now kill supervisor itself.
        Stop-PidSafely -Pid $sp.Id -Label 'supervisor'
    }
}

# ── 5. Belt-and-suspenders: named child process names ─────────────────────────

Write-Section 'Checking for orphaned child processes by name...'
$foundOrphan = $false
foreach ($name in $KnownChildren) {
    $procs = @(Get-Process -Name $name -ErrorAction SilentlyContinue)
    foreach ($p in $procs) {
        $foundOrphan = $true
        Write-Warn "Orphaned child still running: $name (PID $($p.Id))"
        Stop-PidSafely -Pid $p.Id -Label $name
    }
}
if (-not $foundOrphan) {
    Write-Info 'No orphaned child processes found.'
}

# ── 6. Verify ────────────────────────────────────────────────────────────────

Write-Section 'Verifying...'
Start-Sleep -Milliseconds 400

$survivors = @()
$survivors += @(Get-Process -Name 'supervisor' -ErrorAction SilentlyContinue)
foreach ($name in $KnownChildren) {
    $survivors += @(Get-Process -Name $name -ErrorAction SilentlyContinue)
}

if ($survivors.Count -gt 0) {
    Write-Host ''
    Write-Warn 'The following processes are still running:'
    foreach ($s in $survivors) {
        Write-Warn "  $($s.Name)  PID=$($s.Id)"
    }
    Write-Host ''
    exit 1
} else {
    Write-Host ''
    Write-Ok 'All supervisor processes stopped.'
    Write-Host ''
    exit 0
}
