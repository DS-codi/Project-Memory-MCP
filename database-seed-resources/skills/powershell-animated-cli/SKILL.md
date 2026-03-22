---
name: powershell-animated-cli
description: Use this skill when building animated interactive PowerShell CLI launchers for multi-component projects. Covers ASCII banner animation with sine-wave colour cycling, keyboard-driven menus with number and arrow navigation, animated build progress spinners, parallel stdout/stderr capture to a shared warning log, warning summary by component, post-action menus, launch sub-menus with beacon-based crash detection, and the companion scripts (build.ps1, deploy.ps1, test.ps1, launch.ps1) that the CLI delegates to. Based on the general-dev-utilities cli.ps1 pattern.
metadata:
  category: devops
  tags:
    - powershell
    - cli
    - animation
    - interactive
    - build
    - windows
    - terminal
  language_targets:
    - powershell
  framework_targets:
    - windows-terminal
    - pwsh
---

# Animated Interactive PowerShell CLI

An interactive terminal launcher for multi-component projects. Provides an animated ASCII banner, keyboard-driven menu, animated build spinners, and structured companion scripts — all in pure PowerShell, no external dependencies.

## When to Use This Skill

- Creating a developer CLI that wraps build/test/launch operations for a project
- When you want animated feedback during long build processes
- When the project has multiple independently-buildable components (e.g. Rust + Python, frontend + backend)
- When you want keyboard navigation (arrows + number shortcuts) without a framework like Spectre.Console

---

## File Layout

Every CLI of this pattern uses the following file layout:

```
<project-root>/
├── cli.ps1                  ← Main entry point (animated menu)
└── scripts/
    ├── build.ps1            ← Component build logic
    ├── deploy.ps1           ← Post-build artifact deployment (DLLs, assets)
    ├── test.ps1             ← Component test runner
    └── launch.ps1           ← App launcher with beacon crash detection
```

`cli.ps1` always lives at the project root. All companion scripts live under `scripts/`. The CLI invokes companions via `pwsh -NoProfile -File "$Root\scripts\<name>.ps1"`.

---

## cli.ps1 — Structure

```powershell
[CmdletBinding()]
param(
    [string]$Action = ""   # Optional: pass action directly to skip interactive menu
)

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot      # Always resolve relative to cli.ps1 location
```

### Top-level sections (in order)

1. **ASCII Banner array** — multi-line string array `$banner`
2. **Colour palette** — `$colors` array for wave animation
3. **`Show-BannerAnim`** — renders banner with sine-wave colour sweep
4. **`Invoke-AnimatedBuild`** — spawns build as subprocess, shows spinner
5. **`Invoke-RawBuild`** — plain build (no animation) for debugging
6. **`Show-WarningSummary`** — reads warning log, groups by component
7. **Main try/finally loop** — interactive menu, action dispatch, post-action menu
8. **`finally` block** — always restores `[console]::CursorVisible = $true` and calls `Clear-Host`

---

## ASCII Banner Animation

### Banner Definition

Define the banner as a plain string array. Use only printable ASCII — no escape codes or colour markup inside the strings.

```powershell
$banner = @(
    '   __  ___         ____             _  ',
    '  /  |/  /_ __    / __ \_______    (_) ',
    ' / /|_/ / // /   / /_/ / __/ _ \  / /  ',
    '/_/  /_/\_, /   / .___/_/  \___/_/ /   ',
    '       /___/   /_/             /___/   '
)

$colors = @("White", "Cyan", "Blue", "DarkCyan", "Green", "DarkGreen")
```

### `Show-BannerAnim` Implementation

```powershell
function Show-BannerAnim {
    param([int]$Tick)
    for ($row = 0; $row -lt $banner.Count; $row++) {
        $line = $banner[$row]
        [console]::SetCursorPosition(0, $row)
        for ($col = 0; $col -lt $line.Length; $col++) {
            $ch = $line[$col]
            if ($ch -ne ' ') {
                $wave = [math]::Sin(($Tick * 0.4) + ($col * 0.5) + ($row * 0.2))
                $colorIndex = [math]::Abs([math]::Round($wave * 2)) % $colors.Count
                Write-Host $ch -NoNewline -ForegroundColor $colors[$colorIndex]
            } else {
                Write-Host " " -NoNewline
            }
        }
    }
}
```

**Key parameters to tune:**
- `$Tick * 0.4` — animation speed (lower = slower wave)
- `$col * 0.5` — horizontal wave frequency
- `$row * 0.2` — vertical wave offset per row
- `$colors.Count` — uses modulo so any palette length works

---

## Menu System

### Menu Items Definition

```powershell
$menuItems = @(
    @{ Label = "Build All Components"; Action = "build";    Color = "Cyan"    },
    @{ Label = "Test Components";      Action = "test";     Color = "Cyan"    },
    @{ Label = "Launch Application";   Action = "launch";   Color = "Cyan"    },
    @{ Label = "Raw Build (No Anim)";  Action = "rawbuild"; Color = "Magenta" },
    @{ Label = "Quit";                 Action = "quit";     Color = "DarkGray"},
)
$selectedIndex = 0
```

### Keyboard Input Loop

The menu loop polls `[console]::KeyAvailable` so it can animate the banner while waiting for input. **Never use `Read-Host` or `ReadKey` without checking `KeyAvailable` first** — both block and freeze animation.

```powershell
while ($keepRunning) {
    if ([console]::KeyAvailable) {
        $key = [console]::ReadKey($true)   # $true = suppress echo
        if ($key.Key -eq "UpArrow") {
            $selectedIndex = ($selectedIndex - 1 + $menuItems.Count) % $menuItems.Count
        } elseif ($key.Key -eq "DownArrow") {
            $selectedIndex = ($selectedIndex + 1) % $menuItems.Count
        } elseif ($key.Key -eq "Enter") {
            $Action = $menuItems[$selectedIndex].Action
            $keepRunning = $false
        } else {
            # Number shortcuts — index into $menuItems by position
            switch ($key.KeyChar) {
                '1' { $selectedIndex = 0; $Action = "build";    $keepRunning = $false }
                '2' { $selectedIndex = 1; $Action = "test";     $keepRunning = $false }
                '3' { $selectedIndex = 2; $Action = "launch";   $keepRunning = $false }
                '4' { $selectedIndex = 3; $Action = "rawbuild"; $keepRunning = $false }
                '5' { $selectedIndex = 4; $Action = "quit";     $keepRunning = $false }
                'q' { $selectedIndex = 4; $Action = "quit";     $keepRunning = $false }
                'Q' { $selectedIndex = 4; $Action = "quit";     $keepRunning = $false }
            }
        }
    }

    Show-BannerAnim -Tick $tick

    $menuY = $banner.Count + 2   # Leave a blank line after banner
    for ($i = 0; $i -lt $menuItems.Count; $i++) {
        $item = $menuItems[$i]
        [console]::SetCursorPosition(0, $menuY + $i)
        if ($i -eq $selectedIndex) {
            Write-Host " > [$($i+1)] $($item.Label) < " -ForegroundColor Yellow -NoNewline
            Write-Host (" " * 10)   # Erase trailing characters from longer items
        } else {
            Write-Host "   [$($i+1)] $($item.Label)   " -ForegroundColor $item.Color -NoNewline
            Write-Host (" " * 10)
        }
    }

    $tick++
    Start-Sleep -Milliseconds 40   # ~25 fps
}
```

**Rules:**
- Always show `[$i+1]` number labels next to each item — users learn them quickly
- Always handle both `'q'` and `'Q'` for Quit
- Keep `Start-Sleep -Milliseconds 40` or faster — slower makes the animation visibly choppy
- Use `[console]::SetCursorPosition` for all rendering — never `Write-Host` raw newlines inside animation loops

---

## Animated Build Spinner

### `Invoke-AnimatedBuild`

Runs the build script as a **separate process** (not `Invoke-Expression` or `&`) so stdout/stderr can be redirected to temp files and read non-exclusively while the build runs.

```powershell
function Invoke-AnimatedBuild {
    param([string]$Component)
    $stdoutFile = [System.IO.Path]::GetTempFileName()
    $stderrFile = [System.IO.Path]::GetTempFileName()
    $logFile    = Join-Path $Root "build_warnings.log"
    $psExe      = (Get-Process -Id $PID).Path   # Current pwsh/powershell exe

    $process = Start-Process -FilePath $psExe `
        -ArgumentList "-NoProfile", "-File", "$Root\scripts\build.ps1", "-Include", $Component `
        -NoNewWindow -PassThru `
        -RedirectStandardOutput $stdoutFile `
        -RedirectStandardError  $stderrFile

    $tick   = 0
    $frames = @('◜', '◠', '◝', '◞', '◡', '◟')   # Unicode spinner frames
    $statusY = $banner.Count + 8

    while (-not $process.HasExited) {
        $warnCount = 0
        try {
            foreach ($file in @($stdoutFile, $stderrFile)) {
                if (Test-Path $file) {
                    $content = Get-Content $file -ErrorAction SilentlyContinue
                    if ($content) { $warnCount += @($content | Where-Object { $_ -match "warning" }).Count }
                }
            }
        } catch {}

        $frame = $frames[$tick % $frames.Count]

        # Animate the stage text: upper-case one letter at a time (scanning effect)
        $stageText = "Building $Component"
        $chars = $stageText.ToCharArray()
        $scanPos = $tick % [math]::Max(1, $chars.Count)
        $chars[$scanPos] = [char]::ToUpperInvariant($chars[$scanPos])
        $animatedStage = -join $chars

        $dotCount = ($tick % 4) + 1
        $dots = "." * $dotCount + " " * (4 - $dotCount)
        $line = "   $frame [$Component] | warnings: $warnCount | $animatedStage$dots"

        [console]::SetCursorPosition(0, $statusY)
        Write-Host "`r$line" -NoNewline -ForegroundColor Cyan

        Show-BannerAnim -Tick $tick
        $tick++
        Start-Sleep -Milliseconds 70
    }

    # Flush warnings to the shared log
    foreach ($file in @($stdoutFile, $stderrFile)) {
        if (Test-Path $file) {
            foreach ($line in (Get-Content $file -ErrorAction SilentlyContinue)) {
                if ($line -match "warning") {
                    "[$Component] $line" | Out-File -FilePath $logFile -Append -Encoding utf8
                }
            }
        }
    }

    [console]::SetCursorPosition(0, $statusY)
    if ($process.ExitCode -eq 0) {
        Write-Host "`r   ✓ Built $Component successfully!                     " -ForegroundColor Green
    } else {
        Write-Host "`r   ✗ Build $Component failed! (Exit: $($process.ExitCode))" -ForegroundColor Red
        # Show last 10 stderr lines for quick diagnosis
        $errLines = Get-Content $stderrFile -ErrorAction SilentlyContinue
        if ($errLines) { $errLines | Select-Object -Last 10 | Write-Host -ForegroundColor Red }
    }
    Remove-Item $stdoutFile, $stderrFile -Force -ErrorAction SilentlyContinue
}
```

**Critical details:**
- `(Get-Process -Id $PID).Path` — gets the actual `pwsh.exe` or `powershell.exe` path, not a hardcoded string. Required when running from VS Code terminals or custom launchers.
- `-NoNewWindow` is required; `-WindowStyle Hidden` causes async redirect issues on some Windows versions.
- Read temp files with `Get-Content -ErrorAction SilentlyContinue` (not `ReadAllText`) — this works while the build process has them open.
- Always delete temp files in a `finally` or after the loop.

### `Invoke-RawBuild` (non-animated fallback)

Used for debugging or when the user needs to see raw compiler output. Uses `2>&1` inline capture instead of file redirection.

```powershell
function Invoke-RawBuild {
    param([string]$Component)
    $logFile = Join-Path $Root "build_warnings.log"
    Write-Host "--- Starting Raw Build for $Component ---" -ForegroundColor Magenta
    $psExe = (Get-Process -Id $PID).Path
    $out = & $psExe -NoProfile -File "$Root\scripts\build.ps1" -Include $Component 2>&1
    $out | Write-Host
    foreach ($line in $out) {
        $lineStr = "$line"
        if ($lineStr -match 'warning') {
            "[$Component] $lineStr" | Out-File -FilePath $logFile -Append -Encoding utf8
        }
    }
    if ($LASTEXITCODE -ne 0) {
        Write-Host "   ✗ Raw Build $Component failed! (Exit: $LASTEXITCODE)" -ForegroundColor Red
        return $false
    }
    Write-Host "   ✓ Raw Build $Component successful!" -ForegroundColor Green
    return $true
}
```

**Note:** Always suppress the boolean return when calling: `$null = Invoke-RawBuild -Component "PythonUI"`. PowerShell prints uncaptured return values to the pipeline.

---

## Warning Log Pattern

### Log file format

One line per warning, tagged with the component name:
```
[RustCore] warning: unused variable `x` [unused_variables]
[PythonUI] warning: module 'foo' imported but unused
```

### Initialising the log before each build run

Always truncate/re-create the log at the start of a build action so stale warnings from previous runs don't accumulate:

```powershell
"--- Build Warnings Log: $(Get-Date) ---`r`n" | Out-File -FilePath $logFile -Encoding utf8
```

### `Show-WarningSummary`

```powershell
function Show-WarningSummary {
    $logFile = Join-Path $Root "build_warnings.log"
    if (-not (Test-Path $logFile)) { return }

    $lines = Get-Content $logFile -ErrorAction SilentlyContinue |
             Where-Object { $_ -match '\[' -and $_ -match 'warning' }

    $total = ($lines | Measure-Object).Count
    Write-Host ""
    if ($total -eq 0) {
        Write-Host "  ✓ No warnings." -ForegroundColor Green
        return
    }

    Write-Host "  ─── Build Warning Summary ($total warning$(if($total -ne 1){'s'})) ───" -ForegroundColor Yellow

    $groups = $lines | Group-Object { if ($_ -match '^\[([^\]]+)\]') { $Matches[1] } else { 'Other' } }
    foreach ($grp in $groups) {
        Write-Host "  [$($grp.Name)] — $($grp.Count) warning$(if($grp.Count -ne 1){'s'})" -ForegroundColor DarkYellow
        foreach ($w in $grp.Group) {
            $msg = $w -replace '^\[[^\]]+\]\s*', ''
            if ($msg.Length -gt 120) { $msg = '...' + $msg.Substring($msg.Length - 117) }
            Write-Host "    $msg" -ForegroundColor DarkGray
        }
    }
    Write-Host "  Full log: build_warnings.log" -ForegroundColor DarkGray
}
```

Call `Show-WarningSummary` at the end of every build action (both animated and raw).

### Suppressing known-irrelevant warnings

If a tool (e.g. `windeployqt`) emits a warning for a missing optional component that is genuinely non-actionable, suppress it at write time — not with a filter in `Show-WarningSummary`:

```powershell
$ignorablePatterns = @('dxcompiler\.dll', 'dxil\.dll')
foreach ($line in $out) {
    $lineStr = "$line"
    if ($lineStr -match 'warning') {
        $skip = $false
        foreach ($pat in $ignorablePatterns) { if ($lineStr -match $pat) { $skip = $true; break } }
        if (-not $skip) {
            "[$Component] $lineStr" | Out-File -FilePath $logFile -Append -Encoding utf8
        }
    }
}
```

**Prefer fixing the root cause** (e.g. adding the optional DLL to PATH before the tool runs) over suppression. Only suppress when the warning is genuinely non-actionable on all machines.

---

## Sub-Menu Pattern (Launch Mode)

Actions that have multiple modes (e.g. "launch with UI", "launch headless", "launch with console") use an inline sub-menu with the same arrow/number navigation:

```powershell
$launchModes = @(
    @{ Label = "Tray only (no UI window)";            ShowUI = $false; Console = $false },
    @{ Label = "Show UI window immediately";          ShowUI = $true;  Console = $false },
    @{ Label = "Launch with console (debug output)"; ShowUI = $true;  Console = $true  },
    @{ Label = "Back to main menu";                  ShowUI = $null;  Console = $false }
)
$lIdx = 0
$lRunning = $true

while ($lRunning) {
    [console]::SetCursorPosition(0, $banner.Count + 2)
    Write-Host "  How would you like to launch?   " -ForegroundColor Cyan
    Write-Host ""
    for ($i = 0; $i -lt $launchModes.Count; $i++) {
        if ($i -eq $lIdx) {
            Write-Host "  > [$($i+1)] $($launchModes[$i].Label) <  " -ForegroundColor Yellow
        } else {
            Write-Host "    [$($i+1)] $($launchModes[$i].Label)    " -ForegroundColor Gray
        }
    }
    if ([console]::KeyAvailable) {
        $lKey = [console]::ReadKey($true)
        if ($lKey.Key -eq "UpArrow")    { $lIdx = ($lIdx - 1 + $launchModes.Count) % $launchModes.Count }
        elseif ($lKey.Key -eq "DownArrow") { $lIdx = ($lIdx + 1) % $launchModes.Count }
        elseif ($lKey.Key -eq "Enter")  { $lRunning = $false }
        else {
            switch ($lKey.KeyChar) {
                '1' { $lIdx = 0; $lRunning = $false }
                '2' { $lIdx = 1; $lRunning = $false }
                '3' { $lIdx = 2; $lRunning = $false }
                '4' { $lIdx = 3; $lRunning = $false }
            }
        }
    }
    Start-Sleep -Milliseconds 40
}

$selected = $launchModes[$lIdx]
if ($null -ne $selected.ShowUI) {
    $launchArgs = @("-NoProfile", "-File", "$Root\scripts\launch.ps1")
    if ($selected.ShowUI)  { $launchArgs += "-ShowUI" }
    if ($selected.Console) { $launchArgs += "-Console" }
    pwsh @launchArgs
}
```

Use `$null` as a sentinel for "Back" options so conditional launch logic is clean.

---

## Post-Action Menu

After every action completes, show a two-item post-action menu before returning to the main loop:

```powershell
Write-Host "`n"
$postIndex = 0
$postItems = @(
    @{ Label = "Return to Main Menu"; Action = "return" },
    @{ Label = "Exit CLI";            Action = "exit"   }
)
$postMenuY = [console]::CursorTop
$postRunning = $true

while ($postRunning) {
    [console]::SetCursorPosition(0, $postMenuY)
    for ($i = 0; $i -lt $postItems.Count; $i++) {
        if ($i -eq $postIndex) {
            Write-Host " > [$($i+1)] $($postItems[$i].Label) < " -ForegroundColor Yellow
        } else {
            Write-Host "   [$($i+1)] $($postItems[$i].Label)   " -ForegroundColor Gray
        }
    }
    if ([console]::KeyAvailable) {
        $key = [console]::ReadKey($true)
        if ($key.Key -eq "UpArrow")    { $postIndex = ($postIndex - 1 + $postItems.Count) % $postItems.Count }
        elseif ($key.Key -eq "DownArrow") { $postIndex = ($postIndex + 1) % $postItems.Count }
        elseif ($key.Key -eq "Enter")  {
            if ($postItems[$postIndex].Action -eq "exit") { $mainRunning = $false }
            $postRunning = $false
        } else {
            switch ($key.KeyChar) {
                '1' { $postIndex = 0; $postRunning = $false }
                '2' { $postIndex = 1; $mainRunning = $false; $postRunning = $false }
                'q' { $postIndex = 1; $mainRunning = $false; $postRunning = $false }
                'Q' { $postIndex = 1; $mainRunning = $false; $postRunning = $false }
            }
        }
    }
    Start-Sleep -Milliseconds 50
}

# At end of main loop body:
if ($mainRunning) {
    $Action = ""   # Reset so interactive menu re-appears
    Clear-Host
}
```

---

## Cursor Visibility — Try/Finally

Always wrap the entire interactive section in `try/finally` to restore cursor visibility even on Ctrl+C:

```powershell
try {
    [console]::CursorVisible = $false
    Clear-Host
    # ... all menu and action logic ...
} finally {
    [console]::CursorVisible = $true
    Clear-Host
}
```

---

## Companion Scripts

### `scripts/build.ps1`

Accepts `-Include` (component list or `"All"`) and `-Exclude` parameters. Each section is guarded by a `Should-Build` helper:

```powershell
[CmdletBinding()]
param(
    [string[]]$Include = @("All"),
    [string[]]$Exclude = @()
)

$Root = (Resolve-Path "$PSScriptRoot\..").Path

function Should-Build([string]$Component) {
    if ($Exclude -contains $Component) { return $false }
    if ($Include -contains "All" -or $Include -contains $Component) { return $true }
    return $false
}

# Kill running instances before building (avoid locked files)
function Stop-RunningInstances {
    Stop-Process -Name "my-app" -ErrorAction SilentlyContinue
    # ... kill other component processes ...
    Start-Sleep -Milliseconds 500
}

$exitCode = 0
Stop-RunningInstances

if (Should-Build "ComponentA") {
    Push-Location $Root
    try {
        cargo build --release
        if ($LASTEXITCODE -ne 0) { $exitCode = $LASTEXITCODE }
        else {
            & "$Root\scripts\deploy.ps1" -Profile release
            if ($LASTEXITCODE -ne 0) { $exitCode = $LASTEXITCODE }
        }
    } finally { Pop-Location }
}

if (Should-Build "ComponentB") {
    Push-Location "$Root\ui"
    try {
        pip install --quiet -r requirements.txt
        if ($LASTEXITCODE -ne 0) { $exitCode = $LASTEXITCODE }
    } finally { Pop-Location }
}

exit $exitCode
```

**Rules:**
- Always `Push-Location`/`Pop-Location` in `try/finally` — never assume cwd is correct.
- Always track `$exitCode` and call `exit $exitCode` at the end — never `exit 1` directly inside loops.
- Run kill/cleanup before the build, not after, so locked files from a previous run don't cause spurious failures.

### `scripts/test.ps1`

Same `-Include` / `Should-Test` pattern as `build.ps1`:

```powershell
[CmdletBinding()]
param([string[]]$Include = @("All"))

$Root = (Resolve-Path "$PSScriptRoot\..").Path

function Should-Test([string]$Component) {
    if ($Include -contains "All" -or $Include -contains $Component) { return $true }
    return $false
}

$exitCode = 0

if (Should-Test "RustCore") {
    Push-Location $Root
    try { cargo test; if ($LASTEXITCODE -ne 0) { $exitCode = $LASTEXITCODE } }
    finally { Pop-Location }
}

if (Should-Test "PythonUI") {
    Push-Location "$Root\ui"
    try { python -m compileall src; if ($LASTEXITCODE -ne 0) { $exitCode = $LASTEXITCODE } }
    finally { Pop-Location }
}

exit $exitCode
```

### `scripts/launch.ps1`

Handles: kill old instances → DLL pre-flight → delete stale beacon → start exe → optionally poll beacon for crash detection → open log stream console.

```powershell
param(
    [switch]$ShowUI,
    [switch]$Console
)

$Root    = (Resolve-Path "$PSScriptRoot\..").Path
$exePath = "$Root\target\release\my-app.exe"
$exeDir  = [System.IO.Path]::GetDirectoryName($exePath)

# 1. Kill old instances
Stop-Process -Name "my-app" -ErrorAction SilentlyContinue
# ... kill component subprocesses (python, etc.) ...
Start-Sleep -Milliseconds 500

# 2. DLL pre-flight (fast fail before launch)
$criticalDlls = @("Qt6Core.dll", "Qt6Gui.dll", "Qt6Qml.dll")
$missingDlls  = $criticalDlls | Where-Object { -not (Test-Path (Join-Path $exeDir $_)) }
if ($missingDlls) {
    Write-Warning "Missing DLLs: $($missingDlls -join ', '). Run Build first."
    exit 1
}

# 3. Build argument list
$exeArgs = @()
if ($ShowUI) { $exeArgs += "--show-ui" }

# 4. Remove stale beacon
$beaconFile = Join-Path $exeDir "startup.beacon"
Remove-Item $beaconFile -ErrorAction SilentlyContinue

# 5. Launch
$proc = Start-Process -FilePath $exePath -WorkingDirectory $Root `
    -ArgumentList $exeArgs -PassThru

# 6. Optional: beacon poll + log stream
if ($Console) {
    Write-Host "  -> Waiting for startup beacon..." -ForegroundColor DarkCyan
    $beaconFound = $false
    for ($i = 0; $i -lt 20; $i++) {
        Start-Sleep -Milliseconds 200
        if ($proc.HasExited) {
            Write-Host "CRASH: exited with code $($proc.ExitCode) before beacon" -ForegroundColor Red
            exit 1
        }
        if (Test-Path $beaconFile) { $beaconFound = $true; break }
    }
    
    if ($beaconFound) {
        Write-Host "  -> Beacon: $((Get-Content $beaconFile -Raw).Trim())" -ForegroundColor Green
    } else {
        Write-Host "  -> WARNING: Beacon absent after 4s (process alive)" -ForegroundColor Yellow
    }

    # Tail the log file
    $logFile = "$Root\logs\my-app.log.$(Get-Date -Format 'yyyy-MM-dd')"
    $psExe   = (Get-Process -Id $PID).Path
    Start-Process $psExe -ArgumentList "-NoProfile", "-Command", @"
        `$host.UI.RawUI.WindowTitle = 'Log Stream'
        Write-Host '=== Log Stream ===' -ForegroundColor Cyan
        if (Test-Path '$logFile') {
            Get-Content '$logFile' -Wait
        } else {
            Write-Host 'Log file not yet created. Waiting...' -ForegroundColor Yellow
            while (-not (Test-Path '$logFile')) { Start-Sleep -Seconds 1 }
            Get-Content '$logFile' -Wait
        }
"@
}
```

**Beacon pattern:** The application writes a `startup.beacon` file as its very first act in `main()`. This lets the launcher distinguish "exe never started" (missing DLL / OS load failure) from "exe started but crashed later". The file content can include diagnostics like the resolved base directory.

**Here-string caution:** Inside a PowerShell here-string passed to a child process, `$variables` are expanded in the **parent** shell at parse time. Use backtick-escaped `\`$varname` for variables that should be evaluated by the **child**. Literal file paths computed in the parent (like `$logFile`) must be expanded in the parent — embed them as plain strings without backticks.

### `scripts/deploy.ps1`

Runs after a successful build to deploy runtime dependencies (DLLs, plugins, etc.) next to the executable.

```powershell
[CmdletBinding()]
param(
    [ValidateSet('debug', 'release')]
    [string]$Profile = 'debug',
    [string]$QtDir   = $(if ($env:QT_DIR) { $env:QT_DIR } else { 'C:\Qt\6.10.2\msvc2022_64' })
)

$ErrorActionPreference = 'Stop'
$Root    = (Resolve-Path "$PSScriptRoot\..").Path
$exePath = Join-Path $Root "target\$Profile\my-app.exe"
$exeDir  = Split-Path -Parent $exePath
$qtBin   = Join-Path $QtDir 'bin'
$env:PATH = "$qtBin;$env:PATH"

# Detect MSVC install dir for windeployqt
$vswhere   = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
$vsInstall = $null
if (Test-Path $vswhere) {
    $vsInstall = (& $vswhere -latest -property installationPath 2>$null | Select-Object -First 1)
    if ($vsInstall) { $env:VCINSTALLDIR = "$vsInstall\VC\" }
}

# Add Windows SDK x64 bin to PATH so windeployqt finds DXC DLLs on its own
$sdkBin = Get-ChildItem "${env:ProgramFiles(x86)}\Windows Kits\10\bin" -Directory -ErrorAction SilentlyContinue |
          Where-Object { $_.Name -match '^10\.' } |
          Sort-Object -Property Name -Descending |
          Select-Object -First 1 -ExpandProperty FullName
if ($sdkBin) {
    $sdkX64 = Join-Path $sdkBin 'x64'
    if (Test-Path $sdkX64) { $env:PATH = "$sdkX64;$env:PATH" }
}

# Run windeployqt
& (Join-Path $qtBin 'windeployqt.exe') `
    $(if ($Profile -eq 'release') { '--release' } else { '--debug' }) `
    '--qmldir' (Join-Path $Root 'src\qml') `
    $exePath
if ($LASTEXITCODE -ne 0) { Write-Error "windeployqt failed."; exit $LASTEXITCODE }

# Fallback copy for DLLs windeployqt may miss
$outputDir    = Split-Path -Parent $exePath
$requiredDlls = @('Qt6Core.dll', 'Qt6Gui.dll', 'Qt6Qml.dll' <# add others as needed #>)
foreach ($dll in $requiredDlls) {
    $dest = Join-Path $outputDir $dll
    if (-not (Test-Path $dest)) {
        $src = Join-Path $qtBin $dll
        if (Test-Path $src) { Copy-Item $src $dest -Force }
    }
}
```

**Rule:** Always prepend SDK/tool directories to `PATH` before calling `windeployqt` — never patch warnings from output after the fact if the root cause is a missing search path.

---

## Common Pitfalls

| Problem | Cause | Fix |
|---|---|---|
| `True` printed to console after rawbuild | `Invoke-RawBuild` returns a bool that isn't captured | `$null = Invoke-RawBuild -Component "..."` |
| Cursor stays hidden after Ctrl+C | No `finally` block | Always `[console]::CursorVisible = $true` in `finally` |
| Animation flickers/tears | Using `Write-Host` with newlines in animation loop | Use `[console]::SetCursorPosition` for all positioned output |
| Build subprocess output lost on crash | Using `Invoke-Expression` instead of `Start-Process` | Use `Start-Process` with `-RedirectStandardOutput`/`-RedirectStandardError` |
| Sub-process inherit wrong cwd | No `Push-Location`/`Pop-Location` in build scripts | Always `Push-Location $Root; try {...} finally { Pop-Location }` |
| Parser error in here-string passed to child | `$(if ...)` inside `@" ... "@` evaluates in parent | Use backtick-escaped `\`$var` for child-side variables; avoid `$(...)` constructs |
| Warning log accumulates stale warnings | Not clearing before each build | Write a header line with `Out-File` (not `-Append`) at build start |
| Number key navigation doesn't update selection | Switch sets `$Action` but not `$selectedIndex` | Always update `$selectedIndex` before setting `$Action` in each switch case |
