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

    # Discover workspace mounts from registry
    Write-Host "Discovering workspace mounts..." -ForegroundColor Cyan
    $mounts = Get-WorkspaceMounts

    $hostMcpUrl = if ($env:MBS_HOST_MCP_URL) { $env:MBS_HOST_MCP_URL } else { "" }

    # Build the podman run command with dynamic workspace mounts
    $podmanArgs = @(
        "run", "-d",
        "--name", $ContainerName,
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
        "-e", "NODE_ENV=production"
    )

    $podmanArgs += $ImageName

    podman @podmanArgs

    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to start container"
        exit 1
    }

    Write-Host "" -ForegroundColor Green
    Write-Host "Container started. Services:" -ForegroundColor Green
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
