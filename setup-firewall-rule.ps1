<#
.SYNOPSIS
    Creates a Windows Firewall inbound rule to allow container-to-host TCP
    connections on the interactive terminal host bridge port (default 45459).

.DESCRIPTION
    The MCP server running inside a Podman/WSL2 container needs to reach the
    Interactive Terminal GUI on the Windows host via its bridge listener
    (0.0.0.0:45459).  WSL2 and Podman virtual networks use subnets in
    172.16.0.0/12, 10.0.0.0/8, and sometimes 192.168.0.0/16.

    This script is **idempotent**: it checks whether the firewall rule already
    exists before attempting to create it.  If the rule exists, it reports the
    current state and exits.

    Requires elevation (Run as Administrator).

.PARAMETER Port
    The TCP port to allow.  Defaults to 45459.

.PARAMETER RuleName
    The display name for the firewall rule.
    Defaults to "ProjectMemory-InteractiveTerminal-HostBridge".

.PARAMETER RemoveRule
    If specified, removes the rule instead of creating it.

.EXAMPLE
    # Create the rule (run as Administrator)
    .\setup-firewall-rule.ps1

.EXAMPLE
    # Remove the rule
    .\setup-firewall-rule.ps1 -RemoveRule

.EXAMPLE
    # Use a custom port
    .\setup-firewall-rule.ps1 -Port 9200

.NOTES
    Part of the Interactive Terminal container-to-host connectivity setup.
    Container always runs on the same physical machine as the host — no
    remote-host scenarios are supported.
#>

param(
    [int]$Port = 45459,

    [string]$RuleName = "ProjectMemory-InteractiveTerminal-HostBridge",

    [switch]$RemoveRule
)

$ErrorActionPreference = 'Stop'

# ---------------------------------------------------------------------------
# Elevation check
# ---------------------------------------------------------------------------

function Test-IsElevated {
    $identity  = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]$identity
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-IsElevated)) {
    Write-Host ""
    Write-Host "ERROR: This script must be run as Administrator." -ForegroundColor Red
    Write-Host "  Right-click PowerShell -> 'Run as administrator', then re-run:" -ForegroundColor Yellow
    Write-Host "    .\setup-firewall-rule.ps1" -ForegroundColor White
    Write-Host ""
    exit 1
}

# ---------------------------------------------------------------------------
# Remove mode
# ---------------------------------------------------------------------------

if ($RemoveRule) {
    $existing = Get-NetFirewallRule -DisplayName $RuleName -ErrorAction SilentlyContinue
    if ($existing) {
        Remove-NetFirewallRule -DisplayName $RuleName
        Write-Host "Firewall rule '$RuleName' removed." -ForegroundColor Green
    } else {
        Write-Host "Firewall rule '$RuleName' does not exist — nothing to remove." -ForegroundColor Yellow
    }
    exit 0
}

# ---------------------------------------------------------------------------
# Check if rule already exists
# ---------------------------------------------------------------------------

Write-Host ""
Write-Host "Checking for existing firewall rule '$RuleName'..." -ForegroundColor Cyan

$existing = Get-NetFirewallRule -DisplayName $RuleName -ErrorAction SilentlyContinue

if ($existing) {
    Write-Host "  Rule already exists." -ForegroundColor Green

    # Show current configuration
    $portFilter = $existing | Get-NetFirewallPortFilter
    $addrFilter = $existing | Get-NetFirewallAddressFilter

    Write-Host "  Status:          $($existing.Enabled)" -ForegroundColor White
    Write-Host "  Direction:       $($existing.Direction)" -ForegroundColor White
    Write-Host "  Action:          $($existing.Action)" -ForegroundColor White
    Write-Host "  Protocol:        $($portFilter.Protocol)" -ForegroundColor White
    Write-Host "  Local Port:      $($portFilter.LocalPort)" -ForegroundColor White
    Write-Host "  Remote Address:  $($addrFilter.RemoteAddress -join ', ')" -ForegroundColor White
    Write-Host ""
    Write-Host "No changes needed." -ForegroundColor Green
    exit 0
}

# ---------------------------------------------------------------------------
# Create the inbound rule
# ---------------------------------------------------------------------------

# WSL2 and Podman use virtual network subnets that can fall in these ranges:
#   - 172.16.0.0/12  (typical WSL2 vEthernet subnet)
#   - 10.0.0.0/8     (Podman default bridge)
#   - 192.168.0.0/16 (alternative subnets / user bridge networks)
$remoteSubnets = @(
    "172.16.0.0/12",
    "10.0.0.0/8",
    "192.168.0.0/16"
)

Write-Host ""
Write-Host "Creating firewall rule:" -ForegroundColor Cyan
Write-Host "  Name:            $RuleName" -ForegroundColor White
Write-Host "  Direction:       Inbound" -ForegroundColor White
Write-Host "  Protocol:        TCP" -ForegroundColor White
Write-Host "  Local Port:      $Port" -ForegroundColor White
Write-Host "  Remote Subnets:  $($remoteSubnets -join ', ')" -ForegroundColor White
Write-Host "  Action:          Allow" -ForegroundColor White
Write-Host ""

New-NetFirewallRule `
    -DisplayName $RuleName `
    -Description "Allow inbound TCP on port $Port from WSL2/Podman virtual network subnets for the Interactive Terminal host bridge." `
    -Direction Inbound `
    -Action Allow `
    -Protocol TCP `
    -LocalPort $Port `
    -RemoteAddress $remoteSubnets `
    -Profile Private, Domain `
    -Enabled True | Out-Null

Write-Host "Firewall rule '$RuleName' created successfully." -ForegroundColor Green
Write-Host ""

# ---------------------------------------------------------------------------
# Verify
# ---------------------------------------------------------------------------

$verify = Get-NetFirewallRule -DisplayName $RuleName -ErrorAction SilentlyContinue
if ($verify) {
    $verifyPort = $verify | Get-NetFirewallPortFilter
    $verifyAddr = $verify | Get-NetFirewallAddressFilter
    Write-Host "Verification:" -ForegroundColor Cyan
    Write-Host "  Status:          $($verify.Enabled)" -ForegroundColor Green
    Write-Host "  Protocol:        $($verifyPort.Protocol)" -ForegroundColor White
    Write-Host "  Local Port:      $($verifyPort.LocalPort)" -ForegroundColor White
    Write-Host "  Remote Address:  $($verifyAddr.RemoteAddress -join ', ')" -ForegroundColor White
} else {
    Write-Host "WARNING: Rule creation appeared to succeed but verification failed." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Done. The container should now be able to reach the host bridge on port $Port." -ForegroundColor Green
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Start the Interactive Terminal GUI on the host" -ForegroundColor White
Write-Host "  2. Run the container with: .\run-container.ps1 run" -ForegroundColor White
Write-Host "  3. Verify from inside the container:" -ForegroundColor White
Write-Host "     podman exec project-memory nc -z host.containers.internal $Port" -ForegroundColor DarkGray
Write-Host ""
