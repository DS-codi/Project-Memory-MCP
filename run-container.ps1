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
    [ValidateSet('build', 'clean-build', 'run', 'stop', 'logs', 'status')]
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

function Get-HostBridgeIP {
    <#
    .SYNOPSIS
        Detect the host IP that Podman containers can reach.

    .DESCRIPTION
        Podman on Windows runs containers inside WSL2. The 'host-gateway' extra_hosts
        directive resolves to the Podman bridge gateway (10.88.0.1), NOT the Windows host.
        The WSL2 vEthernet adapter has a separate Hyper-V firewall that blocks inbound
        traffic, so the vEthernet IP (172.x.x.x) is also unreachable.

        This function discovers the host's primary non-loopback, non-virtual IPv4 address
        (typically the physical Ethernet/Wi-Fi adapter) which IS reachable from containers
        because traffic routes through the physical NIC, bypassing the Hyper-V firewall.

        Override: Set $env:PM_INTERACTIVE_TERMINAL_HOST_IP to skip detection.
    #>

    # Allow explicit override
    if ($env:PM_INTERACTIVE_TERMINAL_HOST_IP) {
        return $env:PM_INTERACTIVE_TERMINAL_HOST_IP
    }

    # Get all Up, non-loopback, non-tunnel IPv4 addresses
    $candidates = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object {
            $_.IPAddress -ne '127.0.0.1' -and
            $_.PrefixOrigin -ne 'WellKnown' -and
            $_.AddressState -eq 'Preferred'
        } |
        ForEach-Object {
            $adapter = Get-NetAdapter -InterfaceIndex $_.InterfaceIndex -ErrorAction SilentlyContinue
            if ($adapter -and $adapter.Status -eq 'Up') {
                [PSCustomObject]@{
                    IP          = $_.IPAddress
                    Prefix      = $_.PrefixLength
                    Name        = $adapter.Name
                    Description = $adapter.InterfaceDescription
                    IsVirtual   = ($adapter.Name -match 'vEthernet|Loopback|WSL|Hyper-V|VPN')
                    IsPhysical  = ($adapter.InterfaceDescription -match 'Ethernet|Wi-Fi|Wireless|Intel|Realtek|Broadcom|Killer')
                }
            }
        }

    # Prefer physical adapters over virtual ones
    $physical = $candidates | Where-Object { $_.IsPhysical -and -not $_.IsVirtual }
    if ($physical) {
        $selected = ($physical | Select-Object -First 1).IP
        Write-Host "  Host bridge IP:  $selected (auto-detected, physical adapter)" -ForegroundColor DarkCyan
        return $selected
    }

    # Fallback: any non-virtual adapter
    $nonVirtual = $candidates | Where-Object { -not $_.IsVirtual }
    if ($nonVirtual) {
        $selected = ($nonVirtual | Select-Object -First 1).IP
        Write-Host "  Host bridge IP:  $selected (auto-detected, non-virtual adapter)" -ForegroundColor DarkCyan
        return $selected
    }

    # Last resort: any address that isn't loopback
    if ($candidates) {
        $selected = ($candidates | Select-Object -First 1).IP
        Write-Host "  Host bridge IP:  $selected (auto-detected, fallback)" -ForegroundColor Yellow
        return $selected
    }

    Write-Host "  Host bridge IP:  FAILED - Could not detect host IP, falling back to host-gateway" -ForegroundColor Red
    return $null
}

function Convert-WindowsPathToPodmanVmPath {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    if ($Path -notmatch '^([A-Za-z]):\\(.*)$') {
        return $null
    }

    $drive = $Matches[1].ToLower()
    $rest = $Matches[2] -replace '\\', '/'
    return "/mnt/$drive/$rest"
}

function Mount-NetworkDriveInWSL {
    <#
    .SYNOPSIS
        Mounts a mapped Windows network drive into the Podman WSL machine using drvfs.
        Returns $true if the mount is already present or was created successfully.
    #>
    param(
        [Parameter(Mandatory = $true)]
        [string]$DriveLetter   # e.g. "S"
    )

    $letter = $DriveLetter.ToLower()
    $mountPoint = "/mnt/$letter"

    # Check if already mounted
    try {
        $null = podman machine ssh "mount | grep -q 'on $mountPoint '" 2>$null
        if ($LASTEXITCODE -eq 0) {
            return $true
        }
    } catch {}

    # Create mount point and mount via drvfs
    try {
        podman machine ssh "sudo mkdir -p '$mountPoint'" 2>$null
        podman machine ssh "sudo mount -t drvfs '${DriveLetter}:' '$mountPoint'" 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  Mounted network drive ${DriveLetter}: -> $mountPoint (drvfs)" -ForegroundColor DarkCyan
            return $true
        } else {
            Write-Host "  Warning: Failed to mount ${DriveLetter}: in WSL (exit code $LASTEXITCODE)" -ForegroundColor Yellow
            return $false
        }
    } catch {
        Write-Host "  Warning: Failed to mount ${DriveLetter}: in WSL: $_" -ForegroundColor Yellow
        return $false
    }
}

function Test-PodmanMountablePath {
    param(
        [Parameter(Mandatory = $true)]
        [string]$WindowsPath
    )

    # UNC paths and non-drive paths are not reliably mountable in podman machine.
    if ($WindowsPath -match '^\\\\') {
        return $false
    }

    # Detect mapped network drives (e.g. S:\ mapped to \\server\share).
    # WSL cannot natively see these — mount them via drvfs before allowing.
    if ($WindowsPath -match '^([A-Za-z]):') {
        $driveLetter = $Matches[1].ToUpper()
        $isNetworkDrive = $false

        try {
            $disk = Get-CimInstance -ClassName Win32_LogicalDisk -Filter "DeviceID='${driveLetter}:'" -ErrorAction Stop
            # DriveType 4 = Network Drive
            if ($disk -and $disk.DriveType -eq 4) {
                $isNetworkDrive = $true
            }
        } catch {
            # If CIM query fails, fall back to checking if 'net use' knows the drive
            try {
                $netUse = net use "${driveLetter}:" 2>&1
                if ($netUse -match 'Remote name') {
                    $isNetworkDrive = $true
                }
            } catch {
                # Can't determine — allow the VM path probe below to decide
            }
        }

        if ($isNetworkDrive) {
            # Attempt to mount the network drive into WSL via drvfs
            if (-not (Mount-NetworkDriveInWSL -DriveLetter $driveLetter)) {
                return $false
            }
            # Fall through to the VM path probe below
        }
    }

    $vmPath = Convert-WindowsPathToPodmanVmPath -Path $WindowsPath
    if (-not $vmPath) {
        return $false
    }

    try {
        $null = podman machine ssh "test -d '$vmPath'" 2>$null
        return ($LASTEXITCODE -eq 0)
    } catch {
        # If machine probe is unavailable, be permissive to avoid false negatives.
        return $true
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

            if (-not (Test-PodmanMountablePath -WindowsPath $nativePath)) {
                Write-Host "  Skip (not mountable in podman VM): $nativePath" -ForegroundColor Yellow
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

function Clean-BuildContainer {
    Write-Host "Running clean rebuild for image '$ImageName'..." -ForegroundColor Cyan

    # Stop and remove container if present
    $existing = podman ps -a --filter "name=$ContainerName" --format "{{.Names}}" 2>$null
    if ($existing) {
        Write-Host "  Removing existing container '$ContainerName'..." -ForegroundColor DarkGray
        podman rm -f $ContainerName 2>$null | Out-Null
    }

    # Remove image if present
    $imageExists = podman images --filter "reference=$ImageName" --format "{{.Repository}}" 2>$null
    if ($imageExists) {
        Write-Host "  Removing existing image '$ImageName'..." -ForegroundColor DarkGray
        podman rmi -f $ImageName 2>$null | Out-Null
    }

    # Remove dangling layers to maximize cleanliness
    Write-Host "  Pruning dangling images..." -ForegroundColor DarkGray
    podman image prune -f 2>$null | Out-Null

    # No-cache rebuild
    Write-Host "  Building with --no-cache..." -ForegroundColor DarkGray
    podman build --no-cache -t $ImageName -f "$WorkspaceRoot\Containerfile" $WorkspaceRoot
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Clean container build failed"
        exit 1
    }

    Write-Host "Clean build complete." -ForegroundColor Green
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

    # -----------------------------------------------------------------------
    # Auto-detect host IP for container bridge
    # -----------------------------------------------------------------------
    # Podman on Windows (WSL2): host-gateway resolves to the Podman bridge
    # gateway (10.88.0.1), NOT the Windows host. The WSL2 vEthernet adapter
    # has a Hyper-V firewall blocking inbound traffic. The physical NIC IP
    # works because container traffic routes through it, bypassing Hyper-V.
    $HostBridgeIP = Get-HostBridgeIP
    $addHostValue = if ($HostBridgeIP) { $HostBridgeIP } else { 'host-gateway' }

    Write-Host "Interactive-terminal bridge config:" -ForegroundColor Cyan
    Write-Host "  Adapter mode:    container_bridge" -ForegroundColor White
    Write-Host "  Host bridge IP:  $addHostValue$(if ($HostBridgeIP) { '' } else { ' (fallback - may not work on WSL2)' })" -ForegroundColor $(if ($HostBridgeIP) { 'White' } else { 'Yellow' })
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

    # -----------------------------------------------------------------------
    # Firewall rule verification (informational — not required when using
    # physical NIC IP, but helps if the user overrides to a virtual adapter)
    # -----------------------------------------------------------------------
    $fwRuleName = "ProjectMemory-InteractiveTerminal-HostBridge"
    Write-Host "  Firewall rule:   " -NoNewline -ForegroundColor White
    try {
        $fwRule = Get-NetFirewallRule -DisplayName $fwRuleName -ErrorAction SilentlyContinue
        if ($fwRule) {
            $fwPort = $fwRule | Get-NetFirewallPortFilter -ErrorAction SilentlyContinue
            if ($fwPort -and ($fwPort.LocalPort -contains "$BridgePort" -or $fwPort.LocalPort -eq "$BridgePort")) {
                Write-Host "OK - '$fwRuleName' exists for port $BridgePort" -ForegroundColor Green
            } else {
                Write-Host "WARNING - Rule exists but port filter may not match $BridgePort" -ForegroundColor Yellow
            }
        } else {
            Write-Host "INFO - No inbound firewall rule found (not required for physical NIC routing)" -ForegroundColor DarkGray
        }
    } catch {
        Write-Host "SKIP - Could not query firewall rules: $_" -ForegroundColor DarkGray
    }

    # -----------------------------------------------------------------------
    # Container-to-host connectivity test (disposable container)
    # -----------------------------------------------------------------------
    if ($bridgeReady) {
        Write-Host "  Container reach: " -NoNewline -ForegroundColor White
        try {
            $null = podman run --rm "--add-host=${BridgeHostAlias}:${addHostValue}" alpine nc -z -w 3 $BridgeHostAlias $BridgePort 2>&1
            if ($LASTEXITCODE -eq 0) {
                Write-Host "OK - Container can reach ${BridgeHostAlias}:$BridgePort ($addHostValue)" -ForegroundColor Green
            } else {
                Write-Host "FAIL - Container cannot reach ${BridgeHostAlias}:$BridgePort ($addHostValue)" -ForegroundColor Red
                Write-Host "                   Override with `$env:PM_INTERACTIVE_TERMINAL_HOST_IP=<ip> or check networking." -ForegroundColor Yellow
            }
        } catch {
            Write-Host "SKIP - Could not run connectivity test: $_" -ForegroundColor DarkGray
        }
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
        "--add-host=${BridgeHostAlias}:${addHostValue}",
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
    'clean-build' { Clean-BuildContainer }
    'run'    { Start-Container }
    'stop'   { Stop-Container }
    'logs'   { Show-Logs }
    'status' { Show-Status }
}
