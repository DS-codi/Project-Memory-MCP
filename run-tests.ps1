#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Test runner for Project Memory MCP components.

.DESCRIPTION
    Runs tests for one or more components with environment bootstrapping for
    Qt/cxx-qt Rust crates (Supervisor, GuiForms, InteractiveTerminal).

.PARAMETER Component
    Which component(s) to test. Accepts an array.
    Valid values: Supervisor, GuiForms, InteractiveTerminal, Server, Dashboard, Extension, All
    Default: All

.PARAMETER TailLines
    Number of filtered output lines to show from each command.
    Default: 20

.PARAMETER Pattern
    Regex pattern used to filter output lines.
    Default: ^(error|warning:|test |running|FAILED|ok|ignored|test result)

.PARAMETER TestArg
        Per-component extra test arguments, in the form:
            Component=arg1 arg2 ...
        Repeat this parameter to target multiple components.
        Examples:
            -TestArg 'Supervisor=control::runtime::dispatcher::tests:: -- --nocapture'
            -TestArg 'Server=src/__tests__/tools/memory-context-actions.test.ts'
            -TestArg 'InteractiveTerminal=-- --nocapture'

.PARAMETER FullOutputOnFailure
    If set, prints full command output when a test command fails.

.PARAMETER KeepRustTestBinaries
    By default, Rust test artifacts are cleaned after each Rust component test
    run (via cargo clean for tested package(s)). Set this flag to keep them.

.PARAMETER KeepJsTestArtifacts
    By default, JS/TS test/build artifacts created by this script are cleaned
    after component runs (for example .vitest caches and extension out/).
    Set this flag to keep them.

.PARAMETER Help
    Show help.

.EXAMPLE
    .\run-tests.ps1

.EXAMPLE
    .\run-tests.ps1 -Component Supervisor,InteractiveTerminal

.EXAMPLE
    .\run-tests.ps1 -Component Supervisor -TailLines 40

.EXAMPLE
    .\run-tests.ps1 -Component Server -TestArg 'Server=src/__tests__/tools/memory-context-actions.test.ts src/__tests__/tools/context-search.tools.test.ts'

.EXAMPLE
    .\run-tests.ps1 -Component Supervisor -TestArg 'Supervisor=control::runtime::dispatcher::tests:: -- --nocapture'
#>

[CmdletBinding()]
param(
    [ValidateSet("Supervisor", "GuiForms", "InteractiveTerminal", "Server", "Dashboard", "Extension", "All", "--help")]
    [string[]]$Component = @("All"),

    [ValidateRange(1, 500)]
    [int]$TailLines = 20,

    [string]$Pattern = "^(error|warning:|test |running|FAILED|ok|ignored|test result)",

    [string[]]$TestArg = @(),

    [switch]$FullOutputOnFailure,
    [switch]$KeepRustTestBinaries,
    [switch]$KeepJsTestArtifacts,

    [Alias('h')]
    [switch]$Help,

    [string[]]$RemainingArgs
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Show-TestHelp {
    Write-Host "Project Memory MCP — Test Runner" -ForegroundColor Magenta
    Write-Host ""
    Write-Host "Usage:" -ForegroundColor Cyan
    Write-Host "  .\run-tests.ps1 [-Component <list>] [-TailLines <n>] [-Pattern <regex>] [-TestArg <Component=args>] [-FullOutputOnFailure] [-KeepRustTestBinaries] [-KeepJsTestArtifacts] [-h|-Help|--help]"
    Write-Host ""
    Write-Host "Components:" -ForegroundColor Cyan
    Write-Host "  Supervisor, GuiForms, InteractiveTerminal, Server, Dashboard, Extension, All"
    Write-Host ""
    Write-Host "Notes:" -ForegroundColor Cyan
    Write-Host "  - Rust GUI components auto-configure Qt/QMAKE/PATH before cargo test"
    Write-Host "  - Output is filtered and tailed per command (similar to Select-String + Select-Object -Last N)"
    Write-Host "  - Use -TestArg 'Component=...args...' to pass test filters/files without editing this script"
    Write-Host "  - Rust test artifacts are cleaned by default; use -KeepRustTestBinaries to keep them"
    Write-Host "  - JS/TS test artifacts are cleaned by default; use -KeepJsTestArtifacts to keep them"
}

if ($Help -or ($RemainingArgs -contains '--help') -or ($Component -contains '--help')) {
    Show-TestHelp
    exit 0
}

$Root = $PSScriptRoot

if ($Component -contains "All") {
    $Components = @("Supervisor", "GuiForms", "InteractiveTerminal", "Server", "Dashboard", "Extension")
} else {
    $Components = $Component
}

function Write-Step([string]$msg) {
    Write-Host "`n── $msg" -ForegroundColor Cyan
}

function Write-Ok([string]$msg) {
    Write-Host "   ✓ $msg" -ForegroundColor Green
}

function Write-Fail([string]$msg) {
    Write-Host "   ✗ $msg" -ForegroundColor Red
}

function Set-CargoNetworkEnv {
    if (-not $env:CARGO_HTTP_CHECK_REVOKE)             { $env:CARGO_HTTP_CHECK_REVOKE = 'false' }
    if (-not $env:CARGO_REGISTRIES_CRATES_IO_PROTOCOL) { $env:CARGO_REGISTRIES_CRATES_IO_PROTOCOL = 'sparse' }
    if (-not $env:CARGO_NET_GIT_FETCH_WITH_CLI)        { $env:CARGO_NET_GIT_FETCH_WITH_CLI = 'true' }
}

function Resolve-QtToolchain {
    param(
        [string]$PreferredQtDir
    )

    $candidates = New-Object System.Collections.Generic.List[string]

    if ($env:QMAKE -and (Test-Path $env:QMAKE)) {
        $qmakeBin = Split-Path -Path $env:QMAKE -Parent
        $qtFromQmake = Split-Path -Path $qmakeBin -Parent
        if ($qtFromQmake) { $candidates.Add($qtFromQmake) }
    }

    if ($PreferredQtDir) { $candidates.Add($PreferredQtDir) }
    if ($env:QT_DIR) { $candidates.Add($env:QT_DIR) }
    $candidates.Add('C:\Qt\6.10.2\msvc2022_64')

    if (Test-Path 'C:\Qt') {
        $discovered = Get-ChildItem -Path 'C:\Qt' -Directory -ErrorAction SilentlyContinue |
            Sort-Object Name -Descending |
            ForEach-Object {
                Get-ChildItem -Path $_.FullName -Directory -Filter 'msvc*_64' -ErrorAction SilentlyContinue |
                    ForEach-Object { $_.FullName }
            }
        foreach ($dir in $discovered) {
            $candidates.Add($dir)
        }
    }

    foreach ($qtDir in ($candidates | Select-Object -Unique)) {
        if (-not (Test-Path $qtDir)) { continue }
        $qtBin = Join-Path $qtDir 'bin'
        $qmake6 = Join-Path $qtBin 'qmake6.exe'
        $qmake = Join-Path $qtBin 'qmake.exe'

        if (Test-Path $qmake6) {
            return [pscustomobject]@{ QtDir = $qtDir; QtBin = $qtBin; QmakePath = $qmake6 }
        }
        if (Test-Path $qmake) {
            return [pscustomobject]@{ QtDir = $qtDir; QtBin = $qtBin; QmakePath = $qmake }
        }
    }

    throw "Qt/qmake not found. Set `$env:QT_DIR to your Qt kit path (example: C:\Qt\6.10.2\msvc2022_64) or set `$env:QMAKE to qmake6.exe."
}

function Invoke-NativeCommandCapture {
    param(
        [Parameter(Mandatory)][string]$FilePath,
        [string[]]$Arguments = @(),
        [string]$WorkingDirectory = $Root
    )

    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $FilePath
    $psi.WorkingDirectory = $WorkingDirectory
    $psi.UseShellExecute = $false
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.CreateNoWindow = $true

    $escapedArgs = $Arguments | ForEach-Object {
        if ($_ -match '[\s"]') { '"' + ($_ -replace '"', '\"') + '"' } else { $_ }
    }
    $psi.Arguments = [string]::Join(' ', $escapedArgs)

    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $psi
    [void]$process.Start()

    $stdoutTask = $process.StandardOutput.ReadToEndAsync()
    $stderrTask = $process.StandardError.ReadToEndAsync()
    $process.WaitForExit()

    $stdout = $stdoutTask.GetAwaiter().GetResult()
    $stderr = $stderrTask.GetAwaiter().GetResult()
    if ($null -eq $stdout) { $stdout = '' }
    if ($null -eq $stderr) { $stderr = '' }

    $stdoutLines = if (-not [string]::IsNullOrEmpty($stdout)) {
        $stdout -split "`r?`n" | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
    } else { @() }

    $stderrLines = if (-not [string]::IsNullOrEmpty($stderr)) {
        $stderr -split "`r?`n" | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
    } else { @() }

    return [PSCustomObject]@{
        ExitCode    = $process.ExitCode
        StdOut      = $stdout
        StdErr      = $stderr
        StdOutLines = $stdoutLines
        StdErrLines = $stderrLines
        AllLines    = @($stdoutLines + $stderrLines)
    }
}

function Invoke-FilteredCommand {
    param(
        [Parameter(Mandatory)][string]$Command,
        [string[]]$Arguments = @(),
        [Parameter(Mandatory)][string]$WorkingDirectory,
        [Parameter(Mandatory)][string]$Label
    )

    Write-Host "   › $Label" -ForegroundColor Gray

    $stdoutFile = [System.IO.Path]::GetTempFileName()
    $stderrFile = [System.IO.Path]::GetTempFileName()

    try {
        $startFile = $Command
        $startArgs = @($Arguments)

        if ($IsWindows -and ($Command -in @('npm', 'npx'))) {
            $escaped = @($Arguments | ForEach-Object {
                if ($_ -match '[\s"]') {
                    '"' + ($_ -replace '"', '\\"') + '"'
                } else {
                    $_
                }
            })
            $startFile = 'cmd.exe'
            $startArgs = @('/d', '/s', '/c', "$Command $($escaped -join ' ')")
        }

        $process = Start-Process -FilePath $startFile `
            -ArgumentList $startArgs `
            -WorkingDirectory $WorkingDirectory `
            -NoNewWindow -PassThru `
            -RedirectStandardOutput $stdoutFile `
            -RedirectStandardError $stderrFile

        $startTime = Get-Date
        $lastHeartbeat = (Get-Date).AddSeconds(-5)

        while (-not $process.HasExited) {
            $now = Get-Date
            if (($now - $lastHeartbeat).TotalSeconds -ge 5) {
                $matchCount = 0
                if (Test-Path $stdoutFile) {
                    try { $matchCount += @(Select-String -Path $stdoutFile -Pattern $Pattern).Count } catch {}
                }
                if (Test-Path $stderrFile) {
                    try { $matchCount += @(Select-String -Path $stderrFile -Pattern $Pattern).Count } catch {}
                }

                $elapsed = [math]::Round(($now - $startTime).TotalSeconds, 0)
                Write-Host ("   ...running ({0}s) matches={1}" -f $elapsed, $matchCount) -ForegroundColor DarkGray
                $lastHeartbeat = $now
            }
            Start-Sleep -Milliseconds 500
        }

        $result = [PSCustomObject]@{
            ExitCode = $process.ExitCode
            AllLines = @(
                (Get-Content $stdoutFile -ErrorAction SilentlyContinue),
                (Get-Content $stderrFile -ErrorAction SilentlyContinue)
            ) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
        }
    } finally {
        Remove-Item $stdoutFile, $stderrFile -Force -ErrorAction SilentlyContinue
    }

    $allLines = @($result.AllLines)
    $filtered = @($allLines | Where-Object { $_ -match $Pattern })
    $tail = if ($filtered.Count -gt $TailLines) {
        @($filtered | Select-Object -Last $TailLines)
    } else {
        @($filtered)
    }

    $tailLines = @($tail)
    if ($tailLines.Count -gt 0) {
        foreach ($line in $tailLines) {
            if ($line -match '^error|FAILED') {
                Write-Host $line -ForegroundColor Red
            } elseif ($line -match '^warning:') {
                Write-Host $line -ForegroundColor Yellow
            } else {
                Write-Host $line
            }
        }
    } else {
        Write-Host "   (no filtered lines matched pattern)" -ForegroundColor DarkGray
    }

    if ($result.ExitCode -ne 0) {
        if ($FullOutputOnFailure) {
            Write-Host "" 
            Write-Host "   Full output (failure context):" -ForegroundColor Yellow
            foreach ($line in $result.AllLines) { Write-Host $line }
        }
        $script:LastFailureExitCode = $result.ExitCode
        Write-Fail "$Label failed (exit $($result.ExitCode))"
        throw "COMMAND_FAILED"
    }

    Write-Ok "$Label passed"
}

function Invoke-CargoCleanup {
    param(
        [Parameter(Mandatory)][string]$WorkingDirectory,
        [string]$PackageName
    )

    $args = @('clean')
    if (-not [string]::IsNullOrWhiteSpace($PackageName)) {
        $args += @('-p', $PackageName)
    }

    $label = if ($PackageName) { "cargo clean -p $PackageName" } else { 'cargo clean' }
    Write-Host "   › $label (cleanup test artifacts)" -ForegroundColor DarkGray

    $result = Invoke-NativeCommandCapture -FilePath 'cargo' -Arguments $args -WorkingDirectory $WorkingDirectory
    if ($result.ExitCode -ne 0) {
        Write-Host "   ⚠ Cleanup failed for $label (exit $($result.ExitCode))" -ForegroundColor Yellow
        return
    }

    Write-Host "   cleanup complete" -ForegroundColor DarkGray
}

function Remove-ArtifactPath {
    param(
        [Parameter(Mandatory)][string]$Path
    )

    if (-not (Test-Path $Path)) { return }

    try {
        Remove-Item -Path $Path -Recurse -Force -ErrorAction Stop
        Write-Host "   removed: $Path" -ForegroundColor DarkGray
    } catch {
        Write-Host "   ⚠ Could not remove ${Path}: $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

function Invoke-JsArtifactCleanup {
    param(
        [Parameter(Mandatory)][string]$ComponentName,
        [Parameter(Mandatory)][string[]]$Paths
    )

    $allPaths = @($Paths)
    if ($allPaths.Count -eq 0) { return }

    Write-Host "   › JS/TS cleanup for $ComponentName" -ForegroundColor DarkGray
    foreach ($path in $allPaths) {
        Remove-ArtifactPath -Path $path
    }
}

function Split-TestArgString {
    param(
        [Parameter(Mandatory)][string]$InputText
    )

    $tokens = New-Object System.Collections.Generic.List[string]
    if ([string]::IsNullOrWhiteSpace($InputText)) {
        return @()
    }

    $current = New-Object System.Text.StringBuilder
    $quote = [char]0
    $escape = $false

    foreach ($ch in $InputText.ToCharArray()) {
        if ($escape) {
            [void]$current.Append($ch)
            $escape = $false
            continue
        }

        if ($ch -eq '\\') {
            $escape = $true
            continue
        }

        if ($quote -ne [char]0) {
            if ($ch -eq $quote) {
                $quote = [char]0
            } else {
                [void]$current.Append($ch)
            }
            continue
        }

        if ($ch -eq '"' -or $ch -eq "'") {
            $quote = $ch
            continue
        }

        if ([char]::IsWhiteSpace($ch)) {
            if ($current.Length -gt 0) {
                $tokens.Add($current.ToString())
                [void]$current.Clear()
            }
            continue
        }

        [void]$current.Append($ch)
    }

    if ($current.Length -gt 0) {
        $tokens.Add($current.ToString())
    }

    return @($tokens)
}

function Parse-ComponentTestArgs {
    param(
        [string[]]$Entries,
        [string[]]$AllowedComponents
    )

    $map = @{}
    foreach ($entry in $Entries) {
        if ([string]::IsNullOrWhiteSpace($entry)) { continue }

        $split = $entry -split '=', 2
        if ($split.Count -ne 2) {
            throw "Invalid -TestArg entry '$entry'. Expected format: Component=arg1 arg2"
        }

        $componentName = $split[0].Trim()
        $argsText = $split[1].Trim()

        if (-not ($AllowedComponents -contains $componentName)) {
            throw "Invalid component '$componentName' in -TestArg. Allowed: $($AllowedComponents -join ', ')"
        }

        $parsedArgs = Split-TestArgString -InputText $argsText
        if ($map.ContainsKey($componentName)) {
            $map[$componentName] = @($map[$componentName] + $parsedArgs)
        } else {
            $map[$componentName] = @($parsedArgs)
        }
    }

    return $map
}

function Get-ComponentTestArgs {
    param(
        [Parameter(Mandatory)][string]$ComponentName,
        [Parameter(Mandatory)][hashtable]$Map
    )

    if ($Map.ContainsKey($ComponentName)) {
        return @($Map[$ComponentName])
    }
    return @()
}

function Initialize-RustQtEnvironment {
    Set-CargoNetworkEnv

    try {
        $Qt = Resolve-QtToolchain
    } catch {
        Write-Fail $_.Exception.Message
        exit 1
    }

    Write-Host "   Qt:    $($Qt.QtDir)" -ForegroundColor DarkGray
    Write-Host "   QMAKE: $($Qt.QmakePath)" -ForegroundColor DarkGray

    return $Qt
}

function Test-Supervisor {
    Write-Step "Supervisor"
    $componentArgs = Get-ComponentTestArgs -ComponentName 'Supervisor' -Map $ComponentTestArgsMap
    $args = @('test', '-p', 'supervisor') + $componentArgs
    try {
        Invoke-FilteredCommand -Command 'cargo' -Arguments $args -WorkingDirectory $Root -Label 'cargo test -p supervisor'
    } finally {
        if (-not $KeepRustTestBinaries) {
            Invoke-CargoCleanup -WorkingDirectory $Root -PackageName 'supervisor'
        }
    }
}

function Test-GuiForms {
    Write-Step "GuiForms"
    $componentArgs = Get-ComponentTestArgs -ComponentName 'GuiForms' -Map $ComponentTestArgsMap
    try {
        $formsArgs = @('test', '-p', 'pm-gui-forms') + $componentArgs
        Invoke-FilteredCommand -Command 'cargo' -Arguments $formsArgs -WorkingDirectory $Root -Label 'cargo test -p pm-gui-forms'

        $approvalArgs = @('test', '-p', 'pm-approval-gui') + $componentArgs
        Invoke-FilteredCommand -Command 'cargo' -Arguments $approvalArgs -WorkingDirectory $Root -Label 'cargo test -p pm-approval-gui'

        $brainstormArgs = @('test', '-p', 'pm-brainstorm-gui') + $componentArgs
        Invoke-FilteredCommand -Command 'cargo' -Arguments $brainstormArgs -WorkingDirectory $Root -Label 'cargo test -p pm-brainstorm-gui'
    } finally {
        if (-not $KeepRustTestBinaries) {
            Invoke-CargoCleanup -WorkingDirectory $Root -PackageName 'pm-gui-forms'
            Invoke-CargoCleanup -WorkingDirectory $Root -PackageName 'pm-approval-gui'
            Invoke-CargoCleanup -WorkingDirectory $Root -PackageName 'pm-brainstorm-gui'
        }
    }
}

function Test-InteractiveTerminal {
    Write-Step "InteractiveTerminal"
    $InteractiveDir = Join-Path $Root 'interactive-terminal'
    $componentArgs = Get-ComponentTestArgs -ComponentName 'InteractiveTerminal' -Map $ComponentTestArgsMap
    $args = @('test') + $componentArgs
    try {
        Invoke-FilteredCommand -Command 'cargo' -Arguments $args -WorkingDirectory $InteractiveDir -Label 'cargo test (interactive-terminal)'
    } finally {
        if (-not $KeepRustTestBinaries) {
            Invoke-CargoCleanup -WorkingDirectory $InteractiveDir -PackageName 'interactive-terminal'
        }
    }
}

function Test-Server {
    Write-Step "Server"
    $ServerDir = Join-Path $Root 'server'
    $componentArgs = Get-ComponentTestArgs -ComponentName 'Server' -Map $ComponentTestArgsMap
    $args = @('vitest', 'run') + $componentArgs
    try {
        Invoke-FilteredCommand -Command 'npx' -Arguments $args -WorkingDirectory $ServerDir -Label 'npx vitest run (server)'
    } finally {
        if (-not $KeepJsTestArtifacts) {
            Invoke-JsArtifactCleanup -ComponentName 'Server' -Paths @(
                (Join-Path $ServerDir '.vitest')
            )
        }
    }
}

function Test-Dashboard {
    Write-Step "Dashboard"
    $DashDir = Join-Path $Root 'dashboard'
    $DashServerDir = Join-Path $DashDir 'server'
    $componentArgs = Get-ComponentTestArgs -ComponentName 'Dashboard' -Map $ComponentTestArgsMap

    try {
        $frontArgs = @('vitest', 'run') + $componentArgs
        Invoke-FilteredCommand -Command 'npx' -Arguments $frontArgs -WorkingDirectory $DashDir -Label 'npx vitest run (dashboard frontend)'

        $serverArgs = @('vitest', 'run') + $componentArgs
        Invoke-FilteredCommand -Command 'npx' -Arguments $serverArgs -WorkingDirectory $DashServerDir -Label 'npx vitest run (dashboard server)'
    } finally {
        if (-not $KeepJsTestArtifacts) {
            Invoke-JsArtifactCleanup -ComponentName 'Dashboard' -Paths @(
                (Join-Path $DashDir '.vitest'),
                (Join-Path $DashServerDir '.vitest')
            )
        }
    }
}

function Test-Extension {
    Write-Step "Extension"
    $ExtDir = Join-Path $Root 'vscode-extension'
    $componentArgs = Get-ComponentTestArgs -ComponentName 'Extension' -Map $ComponentTestArgsMap
    $componentArgsList = @($componentArgs)
    $testArgs = @('run', 'test')
    if ($componentArgsList.Count -gt 0) {
        $testArgs += '--'
        $testArgs += $componentArgsList
    }

    try {
        Invoke-FilteredCommand -Command 'npm' -Arguments @('run', 'compile') -WorkingDirectory $ExtDir -Label 'npm run compile (extension)'
        Invoke-FilteredCommand -Command 'npm' -Arguments $testArgs -WorkingDirectory $ExtDir -Label 'npm run test (extension)'
    } finally {
        if (-not $KeepJsTestArtifacts) {
            Invoke-JsArtifactCleanup -ComponentName 'Extension' -Paths @(
                (Join-Path $ExtDir 'out'),
                (Join-Path $ExtDir '.vitest')
            )
        }
    }
}

$StartTime = Get-Date
Write-Host "Project Memory MCP — Test Runner" -ForegroundColor Magenta
Write-Host "  Components : $($Components -join ', ')" -ForegroundColor DarkGray
Write-Host "  TailLines  : $TailLines" -ForegroundColor DarkGray
Write-Host "  Pattern    : $Pattern" -ForegroundColor DarkGray
Write-Host "  KeepRust   : $KeepRustTestBinaries" -ForegroundColor DarkGray
Write-Host "  KeepJs     : $KeepJsTestArtifacts" -ForegroundColor DarkGray

$AllowedTestArgComponents = @('Supervisor', 'GuiForms', 'InteractiveTerminal', 'Server', 'Dashboard', 'Extension')
$ComponentTestArgsMap = Parse-ComponentTestArgs -Entries $TestArg -AllowedComponents $AllowedTestArgComponents

if ($ComponentTestArgsMap.Count -gt 0) {
    $entries = @()
    foreach ($k in $ComponentTestArgsMap.Keys | Sort-Object) {
        $entries += "$k=[$(($ComponentTestArgsMap[$k] -join ' '))]"
    }
    Write-Host "  TestArg    : $($entries -join '; ')" -ForegroundColor DarkGray
}

$requiresRustQt = @(@('Supervisor', 'GuiForms', 'InteractiveTerminal') | Where-Object { $Components -contains $_ })
$prevQmake = $env:QMAKE
$prevPath  = $env:PATH
$qtConfigured = $false

if ($requiresRustQt.Count -gt 0) {
    $qt = Initialize-RustQtEnvironment
    $env:QMAKE = $qt.QmakePath
    $env:PATH  = "$($qt.QtBin);$env:PATH"
    $qtConfigured = $true
}

try {
    $script:LastFailureExitCode = 1
    $script:RunFailed = $false

    foreach ($comp in $Components) {
        switch ($comp) {
            'Supervisor'          { Test-Supervisor }
            'GuiForms'            { Test-GuiForms }
            'InteractiveTerminal' { Test-InteractiveTerminal }
            'Server'              { Test-Server }
            'Dashboard'           { Test-Dashboard }
            'Extension'           { Test-Extension }
        }
    }
} catch {
    $script:RunFailed = $true
    if ($_.Exception.Message -ne 'COMMAND_FAILED') {
        Write-Fail $_.Exception.Message
        if ($_.InvocationInfo -and $_.InvocationInfo.PositionMessage) {
            Write-Host $_.InvocationInfo.PositionMessage -ForegroundColor DarkGray
        }
        if ($_.ScriptStackTrace) {
            Write-Host $_.ScriptStackTrace -ForegroundColor DarkGray
        }
    }
} finally {
    if ($qtConfigured) {
        $env:QMAKE = $prevQmake
        $env:PATH  = $prevPath
    }
}

$Elapsed = (Get-Date) - $StartTime
Write-Host ""
if ($script:RunFailed) {
    Write-Host "Test run failed in $([math]::Round($Elapsed.TotalSeconds, 1))s" -ForegroundColor Red
    exit $script:LastFailureExitCode
}

Write-Host "All selected tests passed in $([math]::Round($Elapsed.TotalSeconds, 1))s" -ForegroundColor Magenta
