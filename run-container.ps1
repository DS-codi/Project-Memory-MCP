<#
.SYNOPSIS
    Build and run the Project Memory container using Podman.

.DESCRIPTION
    Builds the container image from the Containerfile and optionally runs it
    with appropriate port mappings and volume mounts.

.PARAMETER Action
    build   — Build the container image only
    run     — Run the container (builds first if image missing)
    stop    — Stop the running container
    logs    — Follow container logs
    status  — Show container status and health

.EXAMPLE
    .\run-container.ps1 build
    .\run-container.ps1 run
    .\run-container.ps1 stop

.NOTES
    Phase 6B.6 of infrastructure-improvement-plan.md
#>

param(
    [Parameter(Position = 0)]
    [ValidateSet('build', 'run', 'stop', 'logs', 'status')]
    [string]$Action = 'run'
)

$ErrorActionPreference = 'Stop'
$ImageName = 'project-memory'
$ContainerName = 'project-memory'
$ScriptRoot = $PSScriptRoot

# Resolve workspace root (script is at repo root)
$WorkspaceRoot = if ($ScriptRoot) { $ScriptRoot } else { Get-Location }

$BridgeHostAlias = if ($env:PM_INTERACTIVE_TERMINAL_HOST_ALIAS) { $env:PM_INTERACTIVE_TERMINAL_HOST_ALIAS } else { 'host.containers.internal' }
$BridgeFallbackAlias = if ($env:PM_INTERACTIVE_TERMINAL_HOST_FALLBACK_ALIAS) { $env:PM_INTERACTIVE_TERMINAL_HOST_FALLBACK_ALIAS } else { 'host.docker.internal' }
$bridgePortCandidate = 0
$BridgePort = if (
    $env:PM_INTERACTIVE_TERMINAL_HOST_PORT -and
    [int]::TryParse($env:PM_INTERACTIVE_TERMINAL_HOST_PORT, [ref]$bridgePortCandidate)
) { $bridgePortCandidate } else { 45459 }

$bridgeConnectTimeoutCandidate = 0
$BridgeConnectTimeoutMs = if (
    $env:PM_INTERACTIVE_TERMINAL_CONNECT_TIMEOUT_MS -and
    [int]::TryParse($env:PM_INTERACTIVE_TERMINAL_CONNECT_TIMEOUT_MS, [ref]$bridgeConnectTimeoutCandidate)
) { $bridgeConnectTimeoutCandidate } else { 3000 }

$bridgeRequestTimeoutCandidate = 0
$BridgeRequestTimeoutMs = if (
    $env:PM_INTERACTIVE_TERMINAL_REQUEST_TIMEOUT_MS -and
    [int]::TryParse($env:PM_INTERACTIVE_TERMINAL_REQUEST_TIMEOUT_MS, [ref]$bridgeRequestTimeoutCandidate)
) { $bridgeRequestTimeoutCandidate } else { 30000 }
$BridgeTrace = if ($env:PM_INTERACTIVE_TERMINAL_TRACE_BRIDGE) { $env:PM_INTERACTIVE_TERMINAL_TRACE_BRIDGE } else { '0' }

function Test-HostGuiBridge {
    param(
        [int]$Port,
        [int]$TimeoutMs
    )

    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $connectTask = $client.ConnectAsync('127.0.0.1', $Port)
        $connected = $connectTask.Wait([Math]::Max($TimeoutMs, 250))
        if (-not $connected -or -not $client.Connected) {
            return $false
        }
        return $true
    }
    catch {
        return $false
    }
    finally {
        try { $client.Dispose() } catch {}
    }
}

# ---------------------------------------------------------------------------
# Workspace Mount Discovery
# ---------------------------------------------------------------------------

function Get-WorkspaceMounts {
    <#
    .SYNOPSIS
        Reads workspace-registry.json and generates volume mount args + env mapping
        so the container can access registered workspace directories.
    #>
    $registryPath = Join-Path $WorkspaceRoot "data" "workspace-registry.json"
    $volumeArgs = @()
    $mountMap = @{}

    if (-not (Test-Path $registryPath)) {
        Write-Host "  No workspace registry found — skipping workspace mounts" -ForegroundColor DarkGray
        return @{ VolumeArgs = $volumeArgs; MountMap = '{}' }
    }

    try {
        $registry = Get-Content $registryPath -Raw | ConvertFrom-Json
        $entries = $registry.entries.PSObject.Properties

        foreach ($entry in $entries) {
            $hostPath = $entry.Name    # normalised path, e.g. c:/users/user/project
            $wsId     = $entry.Value   # workspace id

            # Convert normalised registry path back to a native Windows path
            $nativePath = $hostPath -replace '/', '\'
            # Capitalise drive letter for display
            if ($nativePath -match '^([a-z]):') {
                $nativePath = $nativePath.Substring(0,1).ToUpper() + $nativePath.Substring(1)
            }

            if (-not (Test-Path $nativePath -PathType Container)) {
                Write-Host "  Skip (not found): $nativePath" -ForegroundColor DarkGray
                continue
            }

            $containerMount = "/workspaces/$wsId"
            $volumeArgs += "-v"
            $volumeArgs += "${nativePath}:${containerMount}:ro"
            $mountMap[$hostPath] = $containerMount

            Write-Host "  Mount: $nativePath -> $containerMount" -ForegroundColor DarkGray
        }
    } catch {
        Write-Host "  Warning: Could not parse workspace registry: $_" -ForegroundColor Yellow
    }

    $mountJson = ($mountMap | ConvertTo-Json -Compress)
    # Escape for podman env passing
    if (-not $mountJson) { $mountJson = '{}' }

    return @{ VolumeArgs = $volumeArgs; MountMap = $mountJson }
}

function Build-Container {
    Write-Host "Building container image '$ImageName'..." -ForegroundColor Cyan
    podman build -t $ImageName -f "$WorkspaceRoot\Containerfile" $WorkspaceRoot
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Container build failed"
        exit 1
    }
    Write-Host "Build complete." -ForegroundColor Green
}

function Start-Container {
    # Check if already running
    $existing = podman ps -a --filter "name=$ContainerName" --format "{{.Status}}" 2>$null
    if ($existing -match 'Up') {
        Write-Host "Container '$ContainerName' is already running." -ForegroundColor Yellow
        return
    }

    # Remove stopped container with same name
    if ($existing) {
        podman rm -f $ContainerName 2>$null
    }

    # Build if image doesn't exist
    $imageExists = podman images --filter "reference=$ImageName" --format "{{.Repository}}" 2>$null
    if (-not $imageExists) {
        Build-Container
    }

    Write-Host "Starting container '$ContainerName'..." -ForegroundColor Cyan

    Write-Host "Interactive-terminal bridge config:" -ForegroundColor Cyan
    Write-Host "  Adapter mode:    container_bridge" -ForegroundColor White
    Write-Host "  Host alias:      $BridgeHostAlias" -ForegroundColor White
    Write-Host "  Fallback alias:  $BridgeFallbackAlias" -ForegroundColor White
    Write-Host "  Host port:       $BridgePort" -ForegroundColor White
    Write-Host "  Connect timeout: $BridgeConnectTimeoutMs ms" -ForegroundColor White
    Write-Host "  Request timeout: $BridgeRequestTimeoutMs ms" -ForegroundColor White

    $bridgeReady = Test-HostGuiBridge -Port $BridgePort -TimeoutMs $BridgeConnectTimeoutMs
    if (-not $bridgeReady) {
        Write-Host "  Preflight:       WARNING - No listener on localhost:$BridgePort" -ForegroundColor Yellow
        Write-Host "                   Start the host interactive-terminal GUI bridge or set PM_INTERACTIVE_TERMINAL_HOST_PORT." -ForegroundColor Yellow
    } else {
        Write-Host "  Preflight:       OK - Host bridge listener detected on localhost:$BridgePort" -ForegroundColor Green
    }

    # Discover workspace mounts from registry
    Write-Host "Discovering workspace mounts..." -ForegroundColor Cyan
    $mounts = Get-WorkspaceMounts

    $hostMcpUrl = if ($env:MBS_HOST_MCP_URL) { $env:MBS_HOST_MCP_URL } else { "" }

    # Build the podman run command with dynamic workspace mounts
    $podmanArgs = @(
        "run", "-d",
        "--name", $ContainerName,
        "--restart=on-failure:5",
        "--health-cmd", "node -e `"const h=require('http');const r=h.get('http://localhost:3000/health',s=>{process.exit(s.statusCode===200?0:1)});r.on('error',()=>process.exit(1));r.setTimeout(3000,()=>{r.destroy();process.exit(1)})`"",
        "--health-interval", "30s",
        "--health-timeout", "10s",
        "--health-start-period", "15s",
        "--health-retries", "3",
        "-p", "3000:3000",
        "-p", "3001:3001",
        "-p", "3002:3002",
        "-v", "${WorkspaceRoot}\data:/data",
        "-v", "${WorkspaceRoot}\agents:/agents:ro"
    )

    # Add workspace volume mounts
    $podmanArgs += $mounts.VolumeArgs

    # Environment variables
    $podmanArgs += @(
        "-e", "MBS_DATA_ROOT=/data",
        "-e", "MBS_AGENTS_ROOT=/agents",
        "-e", "MBS_HOST_MCP_URL=$hostMcpUrl",
        "-e", "MBS_WORKSPACE_MOUNTS=$($mounts.MountMap)",
        "-e", "PM_RUNNING_IN_CONTAINER=true",
        "-e", "PM_TERM_ADAPTER_MODE=container_bridge",
        "-e", "PM_INTERACTIVE_TERMINAL_HOST_ALIAS=$BridgeHostAlias",
        "-e", "PM_INTERACTIVE_TERMINAL_HOST_FALLBACK_ALIAS=$BridgeFallbackAlias",
        "-e", "PM_INTERACTIVE_TERMINAL_HOST_PORT=$BridgePort",
        "-e", "PM_INTERACTIVE_TERMINAL_CONNECT_TIMEOUT_MS=$BridgeConnectTimeoutMs",
        "-e", "PM_INTERACTIVE_TERMINAL_REQUEST_TIMEOUT_MS=$BridgeRequestTimeoutMs",
        "-e", "PM_INTERACTIVE_TERMINAL_TRACE_BRIDGE=$BridgeTrace",
        "-e", "NODE_ENV=production"
    )

    $podmanArgs += $ImageName

    podman @podmanArgs

    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to start container"
        exit 1
    }

    # Wait for container health before declaring success
    Write-Host "Waiting for container readiness..." -ForegroundColor Cyan
    $ready = $false
    for ($i = 0; $i -lt 30; $i++) {
        try {
            $health = Invoke-RestMethod -Uri "http://localhost:3000/health" -TimeoutSec 3 -ErrorAction Stop
            if ($health.status -eq 'ok') {
                $ready = $true
                break
            }
        } catch {
            # Not ready yet
        }
        Start-Sleep -Seconds 1
    }

    if ($ready) {
        Write-Host "" -ForegroundColor Green
        Write-Host "Container started and healthy." -ForegroundColor Green
    } else {
        Write-Host "" -ForegroundColor Yellow
        Write-Host "Container started but health check not yet passing." -ForegroundColor Yellow
    }

    Write-Host "  MCP Server:    http://localhost:3000/health" -ForegroundColor White
    Write-Host "  Dashboard API: http://localhost:3001/api/health" -ForegroundColor White
    Write-Host "  WebSocket:     ws://localhost:3002" -ForegroundColor White
}

function Stop-Container {
    Write-Host "Stopping container '$ContainerName'..." -ForegroundColor Yellow
    podman stop $ContainerName 2>$null
    podman rm $ContainerName 2>$null
    Write-Host "Container stopped." -ForegroundColor Green
}

function Show-Logs {
    Write-Host "Following logs for '$ContainerName'..." -ForegroundColor Cyan
    podman logs -f $ContainerName
}

function Show-Status {
    $status = podman ps -a --filter "name=$ContainerName" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>$null
    if ($status) {
        Write-Host $status
    } else {
        Write-Host "Container '$ContainerName' not found." -ForegroundColor Yellow
    }

    # Probe health endpoints
    Write-Host ""
    Write-Host "Health probes:" -ForegroundColor Cyan
    try {
        $mcpHealth = Invoke-RestMethod -Uri "http://localhost:3000/health" -TimeoutSec 3 -ErrorAction Stop
        Write-Host "  MCP Server:    OK (uptime: $($mcpHealth.uptime)s, sessions: $($mcpHealth.activeSessions))" -ForegroundColor Green
    } catch {
        Write-Host "  MCP Server:    UNREACHABLE" -ForegroundColor Red
    }
    try {
        $dashHealth = Invoke-RestMethod -Uri "http://localhost:3001/api/health" -TimeoutSec 3 -ErrorAction Stop
        Write-Host "  Dashboard API: OK (uptime: $($dashHealth.uptime)s, clients: $($dashHealth.connectedClients))" -ForegroundColor Green
    } catch {
        Write-Host "  Dashboard API: UNREACHABLE" -ForegroundColor Red
    }
}

# Dispatch
switch ($Action) {
    'build'  { Build-Container }
    'run'    { Start-Container }
    'stop'   { Stop-Container }
    'logs'   { Show-Logs }
    'status' { Show-Status }
}
