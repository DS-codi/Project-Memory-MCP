#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Opens Windows Firewall inbound rules for Project Memory mobile LAN access.
.DESCRIPTION
    Creates Windows Defender Firewall inbound rules to allow LAN connections
    from the Project Memory mobile app to:
      - Port 3464 (Supervisor HTTP/REST API)
      - Port 3458 (Interactive Terminal WebSocket)
    Run this script once as Administrator before using the mobile app.
.EXAMPLE
    .\setup-firewall-mobile.ps1
#>

$rules = @(
    @{
        Name        = "Project Memory - Supervisor HTTP (3464)"
        Port        = 3464
        Description = "Allows the Project Memory mobile app to reach the Supervisor REST API on this machine"
    },
    @{
        Name        = "Project Memory - Terminal WS (3458)"
        Port        = 3458
        Description = "Allows the Project Memory mobile app to reach the Interactive Terminal WebSocket on this machine"
    }
)

foreach ($rule in $rules) {
    $existing = Get-NetFirewallRule -DisplayName $rule.Name -ErrorAction SilentlyContinue
    if ($existing) {
        Write-Host "Rule already exists: $($rule.Name)" -ForegroundColor Yellow
    } else {
        New-NetFirewallRule `
            -DisplayName    $rule.Name `
            -Description    $rule.Description `
            -Direction      Inbound `
            -Protocol       TCP `
            -LocalPort      $rule.Port `
            -Action         Allow `
            -Profile        Private, Domain `
            -Enabled        True | Out-Null
        Write-Host "Created rule: $($rule.Name)  (port $($rule.Port))" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "Done. Project Memory mobile firewall rules are configured." -ForegroundColor Cyan
Write-Host "The mobile app can now reach this machine on the local network."
