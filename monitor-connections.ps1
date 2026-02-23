<#
.SYNOPSIS
    Monitors Project Memory MCP and Dashboard connection health over time.

.DESCRIPTION
    Polls the MCP server and Dashboard health endpoints on configurable intervals,
    logs every connection state transition to a timestamped log file, and shows a
    live color-coded status in the console.

    Designed for diagnosing intermittent connection-drop issues — run this BEFORE
    reproducing the problem, then review the log file for exactly when and what
    dropped.

    Also tests:
    - HTTP response latency for each endpoint
    - Whether the Supervisor SSE heartbeat stream is reachable
    - Whether the ports are even open (separate from the /api/health check)

.PARAMETER McpPort
    Port the MCP server listens on. Default: 3457

.PARAMETER DashboardPort
    Port the Dashboard server listens on. Default: 3001

.PARAMETER IntervalSeconds
    How often to poll in seconds. Default: 5

.PARAMETER LogFile
    Path to the log file. Default: connection-monitor.log (next to this script)

.PARAMETER NoFile
    If set, suppress log file output (console only).

.PARAMETER DurationMinutes
    Run for this many minutes then stop. 0 = run forever (until Ctrl+C). Default: 0

.EXAMPLE
    # Run with defaults — logs to connection-monitor.log next to the script
    .\monitor-connections.ps1

.EXAMPLE
    # Run for 30 minutes, log to a custom path
    .\monitor-connections.ps1 -DurationMinutes 30 -LogFile "C:\Temp\pm-monitor.log"

.EXAMPLE
    # Fast polling, console only
    .\monitor-connections.ps1 -IntervalSeconds 2 -NoFile
#>
[CmdletBinding()]
param(
    [int]    $McpPort         = 3457,
    [int]    $DashboardPort   = 3011,
    [int]    $IntervalSeconds = 5,
    [string] $LogFile         = "",
    [switch] $NoFile,
    [int]    $DurationMinutes = 0
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'SilentlyContinue'

# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------

if ($LogFile -eq "") {
    $LogFile = Join-Path $PSScriptRoot "connection-monitor.log"
}

# State tracking — detect transitions
$script:prevMcpOk        = $null
$script:prevDashboardOk  = $null
$script:prevHeartbeatOk  = $null

$script:mcpFailCount     = 0
$script:dashFailCount    = 0
$script:heartbeatFailCount = 0

$script:mcpOkCount       = 0
$script:dashOkCount      = 0
$script:heartbeatOkCount = 0

$script:sessionStart     = Get-Date
$script:pollCount        = 0
$script:eventCount       = 0

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

function Get-Timestamp {
    return (Get-Date -Format "yyyy-MM-dd HH:mm:ss.fff")
}

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $line = "$(Get-Timestamp) [$Level] $Message"
    if (-not $NoFile) {
        Add-Content -Path $LogFile -Value $line -Encoding UTF8
    }
}

function Write-Event {
    param([string]$Message, [ConsoleColor]$Color = "White")
    $ts = Get-Timestamp
    $line = "$ts [EVENT] $Message"
    Write-Host $line -ForegroundColor $Color
    if (-not $NoFile) {
        Add-Content -Path $LogFile -Value $line -Encoding UTF8
    }
    $script:eventCount++
}

function Test-HttpHealth {
    <#
    .DESCRIPTION
        Returns a hashtable: @{ ok = $true/$false; latencyMs = N; error = "..." }
        Hits /api/health and expects { "status": "ok" } in the response body.
    #>
    param(
        [string] $Url,
        [int]    $TimeoutMs = 4000
    )

    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    try {
        $req = [System.Net.HttpWebRequest]::Create($Url)
        $req.Method    = "GET"
        $req.Timeout   = $TimeoutMs
        $req.UserAgent = "PM-ConnectionMonitor/1.0"

        $resp = $req.GetResponse()
        try {
            $stream = $resp.GetResponseStream()
            $reader = [System.IO.StreamReader]::new($stream)
            $body   = $reader.ReadToEnd()
            $reader.Dispose()
        } finally {
            $resp.Dispose()
        }

        $sw.Stop()
        $latency = $sw.ElapsedMilliseconds

        # Parse JSON — expect { "status": "ok" }
        $parsed = $body | ConvertFrom-Json -ErrorAction SilentlyContinue
        $statusOk = ($parsed -and $parsed.PSObject.Properties["status"] -ne $null -and $parsed.status -eq "ok")

        if ($statusOk) {
            return @{ ok = $true; latencyMs = $latency; error = $null }
        } else {
            return @{ ok = $false; latencyMs = $latency; error = "Unexpected body: $body" }
        }
    }
    catch [System.Net.WebException] {
        $sw.Stop()
        $errMsg = $_.Exception.Message
        # Extract HTTP status code if available
        if ($_.Exception.Response -ne $null) {
            $code = [int]$_.Exception.Response.StatusCode
            $errMsg = "HTTP $code"
        }
        return @{ ok = $false; latencyMs = $sw.ElapsedMilliseconds; error = $errMsg }
    }
    catch {
        $sw.Stop()
        return @{ ok = $false; latencyMs = $sw.ElapsedMilliseconds; error = $_.Exception.Message }
    }
}

function Test-SseHeartbeat {
    <#
    .DESCRIPTION
        Does a quick probe to see if the SSE heartbeat endpoint accepts connections.
        We don't actually subscribe — just check if the server responds with 200
        and Content-Type: text/event-stream.
    #>
    param([int]$Port, [int]$TimeoutMs = 3000)

    try {
        $req = [System.Net.HttpWebRequest]::Create("http://localhost:$Port/supervisor/heartbeat")
        $req.Method  = "GET"
        $req.Timeout = $TimeoutMs
        $req.Headers.Add("Accept", "text/event-stream")
        $req.Headers.Add("Cache-Control", "no-cache")

        $resp = $req.GetResponse()
        $ct   = $resp.ContentType
        $code = [int]$resp.StatusCode
        # Abort immediately — we only wanted the headers
        $req.Abort()
        $resp.Dispose()

        return @{ ok = ($code -eq 200 -and $ct -like "*event-stream*"); statusCode = $code; contentType = $ct }
    }
    catch {
        return @{ ok = $false; statusCode = 0; contentType = "" }
    }
}

function Test-TcpPort {
    <#  Returns $true if a TCP connection can be established (port is open).  #>
    param([int]$Port, [int]$TimeoutMs = 1000)

    try {
        $client = [System.Net.Sockets.TcpClient]::new()
        $result = $client.BeginConnect("127.0.0.1", $Port, $null, $null)
        $waited = $result.AsyncWaitHandle.WaitOne($TimeoutMs, $false)
        if ($waited) {
            $client.EndConnect($result)
            $client.Dispose()
            return $true
        }
        $client.Dispose()
        return $false
    }
    catch {
        return $false
    }
}

function Format-Uptime {
    param([TimeSpan]$Span)
    if ($Span.TotalHours -ge 1) { return "{0:0.0}h" -f $Span.TotalHours }
    if ($Span.TotalMinutes -ge 1) { return "{0:0.0}m" -f $Span.TotalMinutes }
    return "{0}s" -f [int]$Span.TotalSeconds
}

# ---------------------------------------------------------------------------
# Header
# ---------------------------------------------------------------------------

$header = @"
======================================================
  Project Memory Connection Monitor
  Started: $(Get-Timestamp)
  MCP port:       $McpPort   (http://localhost:$McpPort/api/health)
  Dashboard port: $DashboardPort (http://localhost:$DashboardPort/api/health)
  Heartbeat SSE:  http://localhost:$McpPort/supervisor/heartbeat
  Poll interval:  ${IntervalSeconds}s
  Log file:       $(if ($NoFile) { "(console only)" } else { $LogFile })
  Duration:       $(if ($DurationMinutes -eq 0) { "until Ctrl+C" } else { "$DurationMinutes minutes" })
======================================================
"@

Write-Host $header -ForegroundColor Cyan
Write-Log "=== Monitor session started ===" "SESSION"
Write-Log "McpPort=$McpPort DashboardPort=$DashboardPort IntervalSeconds=$IntervalSeconds"

# ---------------------------------------------------------------------------
# Main polling loop
# ---------------------------------------------------------------------------

$stopTime = if ($DurationMinutes -gt 0) { (Get-Date).AddMinutes($DurationMinutes) } else { $null }

try {
    while ($true) {
        if ($stopTime -ne $null -and (Get-Date) -ge $stopTime) {
            Write-Event "Duration limit reached ($DurationMinutes min) — stopping." Cyan
            break
        }

        $script:pollCount++
        $pollTs = Get-Timestamp

        # --- 1. TCP port probe (fast, before HTTP) ---
        $mcpPortOpen  = Test-TcpPort -Port $McpPort  -TimeoutMs 1000
        $dashPortOpen = Test-TcpPort -Port $DashboardPort -TimeoutMs 1000

        # --- 2. HTTP health checks ---
        $mcpResult  = Test-HttpHealth -Url "http://localhost:$McpPort/api/health"  -TimeoutMs 4000
        $dashResult = Test-HttpHealth -Url "http://localhost:$DashboardPort/api/health" -TimeoutMs 4000

        # --- 3. SSE heartbeat probe ---
        $hbResult = Test-SseHeartbeat -Port $McpPort -TimeoutMs 3000

        $mcpOk  = $mcpResult.ok
        $dashOk = $dashResult.ok
        $hbOk   = $hbResult.ok

        # --- Count stats ---
        if ($mcpOk)  { $script:mcpOkCount++;  $script:mcpFailCount = 0   }
        else         { $script:mcpFailCount++; $script:mcpOkCount = 0     }
        if ($dashOk) { $script:dashOkCount++; $script:dashFailCount = 0  }
        else         { $script:dashFailCount++; $script:dashOkCount = 0  }
        if ($hbOk)   { $script:heartbeatOkCount++; $script:heartbeatFailCount = 0 }
        else         { $script:heartbeatFailCount++; $script:heartbeatOkCount = 0 }

        # --- Detect state transitions and emit events ---
        if ($script:prevMcpOk -ne $null -and $script:prevMcpOk -ne $mcpOk) {
            if ($mcpOk) {
                Write-Event "MCP SERVER   RESTORED  (port $McpPort) — was down for $($script:mcpFailCount) polls, latency=$($mcpResult.latencyMs)ms" Green
            } else {
                $portStatus = if ($mcpPortOpen) { "port OPEN but /api/health failed" } else { "port NOT open" }
                Write-Event "MCP SERVER   LOST      (port $McpPort) — $portStatus | prior error: $($mcpResult.error)" Red
            }
        }

        if ($script:prevDashboardOk -ne $null -and $script:prevDashboardOk -ne $dashOk) {
            if ($dashOk) {
                Write-Event "DASHBOARD    RESTORED  (port $DashboardPort) — was down for $($script:dashFailCount) polls, latency=$($dashResult.latencyMs)ms" Green
            } else {
                $portStatus = if ($dashPortOpen) { "port OPEN but /api/health failed" } else { "port NOT open" }
                Write-Event "DASHBOARD    LOST      (port $DashboardPort) — $portStatus | prior error: $($dashResult.error)" Red
            }
        }

        if ($script:prevHeartbeatOk -ne $null -and $script:prevHeartbeatOk -ne $hbOk) {
            if ($hbOk) {
                Write-Event "SSE HEARTBEAT RESTORED (port $McpPort/supervisor/heartbeat)" DarkGreen
            } else {
                Write-Event "SSE HEARTBEAT LOST     (port $McpPort/supervisor/heartbeat) HTTP=$($hbResult.statusCode)" DarkYellow
            }
        }

        # --- On first poll, log initial state ---
        if ($script:prevMcpOk -eq $null) {
            Write-Event ("INITIAL STATE — MCP={0} ({1}ms) | Dashboard={2} ({3}ms) | Heartbeat={4}" -f `
                $(if ($mcpOk) { "UP" } else { "DOWN" }), $mcpResult.latencyMs,
                $(if ($dashOk) { "UP" } else { "DOWN" }), $dashResult.latencyMs,
                $(if ($hbOk) { "UP" } else { "DOWN" })
            ) Cyan
        }

        # Log detailed poll data at DEBUG level (file only, not console)
        Write-Log ("poll#$($script:pollCount) MCP=$($mcpOk):$($mcpResult.latencyMs)ms dash=$($dashOk):$($dashResult.latencyMs)ms hb=$hbOk mcpPort=$mcpPortOpen dashPort=$dashPortOpen") "POLL"

        # --- Update previous state ---
        $script:prevMcpOk       = $mcpOk
        $script:prevDashboardOk = $dashOk
        $script:prevHeartbeatOk = $hbOk

        # --- Live status line (overwrites same console line) ---
        $elapsed = Format-Uptime -Span ((Get-Date) - $script:sessionStart)
        $mcpIcon  = if ($mcpOk)  { "[OK ]" } else { "[ERR]" }
        $dashIcon = if ($dashOk) { "[OK ]" } else { "[ERR]" }
        $hbIcon   = if ($hbOk)   { "[OK ]" } else { "[---]" }
        $mcpColor  = if ($mcpOk)  { "Green" } else { "Red" }
        $dashColor = if ($dashOk) { "Green" } else { "Red" }

        Write-Host ("`r  {0}  MCP:{1}({2}ms)  Dash:{3}({4}ms)  HB:{5}  polls:{6}  events:{7}  up:{8}  " -f `
            $pollTs.Substring(11),
            $mcpIcon, $mcpResult.latencyMs,
            $dashIcon, $dashResult.latencyMs,
            $hbIcon,
            $script:pollCount, $script:eventCount, $elapsed
        ) -NoNewline -ForegroundColor $(if ($mcpOk -and $dashOk) { "Green" } elseif ($mcpOk -or $dashOk) { "Yellow" } else { "Red" })

        Start-Sleep -Seconds $IntervalSeconds
    }
}
finally {
    Write-Host ""  # New line after the live status
    $sessionDuration = Format-Uptime -Span ((Get-Date) - $script:sessionStart)

    $summary = @"

=== SESSION SUMMARY ===
Duration:    $sessionDuration
Total polls: $($script:pollCount)
Events:      $($script:eventCount)

Final state:
  MCP ($McpPort):       $(if ($script:prevMcpOk) { "UP" } else { "DOWN" })
  Dashboard ($DashboardPort): $(if ($script:prevDashboardOk) { "UP" } else { "DOWN" })
  SSE Heartbeat:     $(if ($script:prevHeartbeatOk) { "UP" } else { "DOWN" })

$(if (-not $NoFile) { "Log saved to: $LogFile" } else { "(no log file — console only mode)" })
"@

    Write-Host $summary -ForegroundColor Cyan
    Write-Log "=== Session ended. Duration=$sessionDuration polls=$($script:pollCount) events=$($script:eventCount) ===" "SESSION"
}
