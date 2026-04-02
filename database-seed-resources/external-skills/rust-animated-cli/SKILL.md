---
name: rust-animated-cli
description: "Use this skill when building animated interactive CLI launchers in Rust using crossterm + ratatui. Covers project setup with multi-module architecture, TerminalGuard for safe cleanup, 4-style animated banner (wave/pulse/scan/sparkle) with swappable colour palettes, multi-tab layout (Menu/Output/Logs/Queue), keyboard-driven menus with number/arrow/modifier navigation, real-time build progress with mpsc channel streaming, warning capture with false-positive filtering, warning summary with severity-coloured banners, scrollable command output viewers with clipboard copy, command queue with status lifecycle, JSON-backed command history, TCP agent gateway for MCP integration, SSH/SCP system binary delegation, PowerShell fallback for unported commands, and service catalog with dependency graph."
metadata:
  category: devops
  tags:
    - rust
    - cli
    - animation
    - interactive
    - build
    - tui
    - crossterm
    - ratatui
    - windows
    - mcp
    - ssh
    - podman
  language_targets:
    - rust
  framework_targets:
    - crossterm
    - ratatui
---

# Animated Interactive Rust CLI (crossterm + ratatui)

A production-grade interactive terminal launcher for multi-component projects, written in Rust. Provides an animated ASCII banner with 4 animation styles, multi-tab layout, keyboard-driven menus, real-time build progress with streamed output, warning summary, scrollable command viewers, command queue, JSON history, MCP agent gateway, SSH delegation, and PowerShell fallback — using crossterm, ratatui, and serde.

## When to Use This Skill

- Creating a developer CLI that wraps build/test/deploy/launch operations for a project
- When you want animated feedback during long build/deploy processes
- When the project has multiple independently-operable components
- When you need a command queue and history for repeated operations
- When integrating with MCP agents via a local TCP gateway
- When targeting Windows terminals (handles key-release ghost events)
- When needing a native compiled binary instead of a PowerShell/shell script

---

## Dependencies

```toml
[dependencies]
crossterm = { version = "0.27", features = ["event-stream"] }
ratatui = "0.26"
serde = { version = "1", features = ["derive"] }
serde_json = "1"

[profile.release]
strip = true   # Smaller binary — removes debug symbols
lto = true     # Link-time optimisation
```

```toml
[[bin]]
name = "bd"
path = "src/main.rs"
```

---

## build.rs Isolation (Multi-Binary Projects)

When the project has a `build.rs` with heavy toolchain steps (CxxQt codegen, protobuf, etc.), those steps run when building the CLI binary too — even though the CLI doesn't use them. Gate with `CARGO_BIN_NAME` to skip **only** for the CLI binary:

```rust
fn main() {
    if std::env::var("CARGO_BIN_NAME").as_deref() != Ok("bd") {
        // CxxQt / protobuf codegen — skipped only for the CLI binary
    }
    // Shared steps (e.g. winresource) stay outside the gate
}
```

---

## File Layout (Production Scale)

```
<project-root>/
├── src/
│   ├── main.rs                  ← TUI entry point, rendering, event loop (~4900 lines)
│   ├── agent.rs                 ← TCP agent gateway (MCP integration, 127.0.0.1:7422)
│   ├── cli.rs                   ← CLI arg routing (args → TUI or dispatch)
│   ├── command_registry.rs      ← Command normalization, alias resolution, dispatch
│   ├── commands/
│   │   ├── mod.rs
│   │   ├── build.rs             ← Build command entry point
│   │   ├── build_mcp.rs
│   │   ├── deploy.rs
│   │   ├── health.rs
│   │   ├── log.rs
│   │   ├── ops.rs               ← restart, stop, compose-push
│   │   ├── schema_*.rs          ← analyze, generate, refresh, validate
│   │   ├── ship.rs              ← Full pipeline (schema → build → deploy)
│   │   └── start.rs
│   ├── config/
│   │   ├── mod.rs               ← RuntimeEnvironment enum, BdConfig constants
│   │   └── paths.rs             ← Path resolution (cli_root, repo_root, python)
│   ├── domain/
│   │   ├── services.rs          ← ServiceMetadata catalog, routing topology
│   │   └── deps.rs              ← Dependency graph, topological sort, soft gate
│   ├── fallback/
│   │   └── powershell.rs        ← PowerShell delegation adapter
│   ├── health/
│   │   └── mod.rs               ← Health probe, readiness checks via curl/podman
│   ├── orchestration/
│   │   ├── build.rs             ← Build orchestration (~1500 lines)
│   │   ├── deploy.rs
│   │   ├── ops.rs
│   │   ├── ship.rs
│   │   └── start.rs
│   ├── remote/
│   │   ├── ssh.rs               ← SSH command execution (system binary)
│   │   ├── scp.rs               ← SCP file transfer (system binary)
│   │   └── logs.rs              ← Remote log retrieval
│   ├── runtime/
│   │   └── process.rs           ← Process spawning, streaming, capture
│   ├── schema/
│   │   ├── analyze.rs, gate.rs, generate.rs, paths.rs
│   │   ├── refresh.rs, report.rs, validate.rs
│   └── storage/
│       ├── history.rs           ← JSON-backed command history
│       └── logs.rs              ← Log file management, 7-day retention
├── Cargo.toml
└── build.rs
```

---

## Imports

```rust
use crossterm::{
    cursor,
    event::{self, Event, KeyCode, KeyEvent, KeyEventKind, KeyModifiers},
    execute,
    terminal,
};
use ratatui::{
    backend::CrosstermBackend,
    layout::{Constraint, Rect},
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, Cell, Gauge, Paragraph, Row, Table, Wrap},
    Terminal,
};
use std::collections::HashMap;
use std::io::{self, BufRead, BufReader, Write};
use std::process::{Command, Stdio};
use std::sync::{atomic::{AtomicBool, AtomicUsize, Ordering}, Mutex};
use std::time::{Duration, Instant};
```

---

## Terminal Setup & Cleanup

### TerminalGuard (Drop-based cleanup)

**Always** use a Drop guard so the terminal is restored even on panic:

```rust
struct TerminalGuard;

impl Drop for TerminalGuard {
    fn drop(&mut self) {
        let _ = execute!(
            io::stdout(),
            terminal::LeaveAlternateScreen,
            cursor::Show
        );
        let _ = terminal::disable_raw_mode();
    }
}
```

### main()

```rust
fn main() -> io::Result<()> {
    // CLI mode: if args provided, dispatch and exit immediately
    let args: Vec<String> = std::env::args().skip(1).collect();
    if let Some(code) = handle_args(args) {
        std::process::exit(code);
    }

    // TUI mode
    terminal::enable_raw_mode()?;
    let mut stdout = io::stdout();
    execute!(stdout, terminal::EnterAlternateScreen, cursor::Hide)?;
    let backend = CrosstermBackend::new(stdout);
    let mut term = Terminal::new(backend)?;
    let _guard = TerminalGuard;  // Restored on ANY exit path

    // CRITICAL: Drain stale input events (the Enter used to launch the exe)
    while event::poll(Duration::from_millis(50))? {
        let _ = event::read()?;
    }

    run_app(&mut term)
}
```

### Windows Key Event Filtering (CRITICAL)

On Windows, crossterm delivers both `Press` and `Release` key events. **Every** event loop MUST filter for `KeyEventKind::Press` only:

```rust
// CORRECT
if let Event::Key(KeyEvent { code, kind: KeyEventKind::Press, modifiers, .. }) = event::read()? {
    match code { /* ... */ }
}

// WRONG — fires on both Press and Release
if let Event::Key(KeyEvent { code, .. }) = event::read()? { }
```

This applies to ALL event loops (main menu, sub-menus, viewers, streaming). Missing it on even one causes ghost double-actions.

### Key Modifier Helpers

```rust
fn is_ctrl_enter(code: KeyCode, modifiers: KeyModifiers) -> bool {
    matches!(code, KeyCode::Enter) && modifiers.contains(KeyModifiers::CONTROL)
}

fn is_shift_enter(code: KeyCode, modifiers: KeyModifiers) -> bool {
    matches!(code, KeyCode::Enter) && modifiers.contains(KeyModifiers::SHIFT)
}
```

---

## ASCII Banner Animation

### Banner Definition

```rust
const BANNER: &[&str] = &[
    "  __  __         ____            _  ",
    " |  \\/  |_   _  |  _ \\ _ __ ___ (_) ",
    " | |\\/| | | | | | |_) | '__/ _ \\| | ",
    " | |  | | |_| | |  __/| | | (_) | | ",
    " |_|  |_|\\__, | |_|   |_|  \\___// | ",
    "         |___/                |__/  ",
];
```

### Colour Palettes

```rust
const PALETTE_DEFAULT: [Color; 6] = [
    Color::White, Color::Cyan, Color::Blue,
    Color::DarkGray, Color::Green, Color::LightGreen,
];
const PALETTE_SUCCESS: [Color; 6] = [
    Color::Green, Color::LightGreen, Color::Cyan,
    Color::Green, Color::LightGreen, Color::White,
];
const PALETTE_WARN: [Color; 6] = [
    Color::Yellow, Color::LightYellow, Color::White,
    Color::Yellow, Color::LightYellow, Color::DarkGray,
];
const PALETTE_ERROR: [Color; 6] = [
    Color::Red, Color::LightRed, Color::Yellow,
    Color::Red, Color::LightRed, Color::DarkGray,
];
```

### 4 Animation Styles

```rust
enum AnimStyle {
    Wave,     // Rippling sine-wave colour sweep
    Pulse,    // Row-based brightness pulsing
    Scan,     // Single scanning line passes through rows
    Sparkle,  // Random glitter (deterministic PRNG, LCG-based)
}
```

Custom LCG for deterministic pseudo-random (avoids rand crate dependency):
```rust
fn lcg_next(state: u64) -> u64 {
    state.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407)
}
```

### Sine-Wave Renderer (Wave style)

Each character gets a colour from the palette based on a sine function of `(tick, column, row)`:

```rust
fn render_animated_banner(f: &mut ratatui::Frame, tick: f64, palette: &[Color; 6], style: AnimStyle) {
    let banner_lines: Vec<Line> = BANNER
        .iter()
        .enumerate()
        .map(|(row, &line)| {
            let spans: Vec<Span> = line
                .chars()
                .enumerate()
                .map(|(col, ch)| {
                    let color = match style {
                        AnimStyle::Wave => {
                            let v = (tick * 0.4 + col as f64 * 0.5 + row as f64 * 0.2).sin();
                            let idx = (v * 2.0).round().abs() as usize;
                            palette[idx % palette.len()]
                        }
                        AnimStyle::Pulse => {
                            let brightness = ((tick * 0.05 + row as f64 * 0.3).sin() + 1.0) / 2.0;
                            let idx = (brightness * (palette.len() - 1) as f64) as usize;
                            palette[idx.min(palette.len() - 1)]
                        }
                        AnimStyle::Scan => {
                            let scan_row = (tick as usize / 4) % BANNER.len();
                            if row == scan_row { Color::White } else { palette[row % palette.len()] }
                        }
                        AnimStyle::Sparkle => {
                            let seed = (tick as u64).wrapping_add(col as u64 * 31 + row as u64 * 97);
                            let rng = lcg_next(seed);
                            palette[(rng % palette.len() as u64) as usize]
                        }
                    };
                    Span::styled(ch.to_string(), Style::default().fg(color))
                })
                .collect();
            Line::from(spans)
        })
        .collect();
    let area = f.size();
    let banner_area = Rect::new(0, 0, area.width, area.height.min(BANNER.len() as u16));
    f.render_widget(Paragraph::new(banner_lines), banner_area);
}
```

---

## Multi-Tab Layout

### Tab Enum

```rust
#[derive(Clone, Copy, PartialEq)]
enum AppTab { Menu, Output, Logs, Queue }

impl AppTab {
    fn next(self) -> Self {
        match self {
            Self::Menu => Self::Output,
            Self::Output => Self::Logs,
            Self::Logs => Self::Queue,
            Self::Queue => Self::Menu,
        }
    }
    fn prev(self) -> Self { /* reverse order */ }
    fn index(self) -> usize { self as usize }
    fn title(self) -> &'static str {
        match self { Self::Menu => "Menu", Self::Output => "Output", Self::Logs => "Logs", Self::Queue => "Queue" }
    }
}
```

### Tab-Switch Signaling (Cross-Handler Communication)

When a command handler needs to trigger a tab switch in the main event loop:

```rust
static PENDING_TAB_SWITCH: Mutex<Option<AppTab>> = Mutex::new(None);

fn set_tab_switch(tab: AppTab) {
    if let Ok(mut s) = PENDING_TAB_SWITCH.lock() { *s = Some(tab); }
}

fn take_tab_switch() -> Option<AppTab> {
    if let Ok(mut s) = PENDING_TAB_SWITCH.lock() { s.take() } else { None }
}
```

In the main loop, after handling events:
```rust
if let Some(tab) = take_tab_switch() {
    current_tab = tab;
}
```

### Panel View Rotation (within a tab)

```rust
#[derive(Clone, Copy)]
enum PanelView { RecentCommands, ImagesBuilt, ContainersDeployed }

impl PanelView {
    fn next(self) -> Self { /* cycle through variants */ }
    fn title(self) -> &'static str { /* panel header text */ }
}
```

---

## Global State

Use statics for state shared between the event loop and background threads:

```rust
static COMMAND_RUNNING: AtomicBool = AtomicBool::new(false);
static NEXT_QUEUE_ID:   AtomicUsize = AtomicUsize::new(1);
static NEXT_AGENT_ID:   AtomicUsize = AtomicUsize::new(1);
static QUEUE_ON_CONFIRM: AtomicBool = AtomicBool::new(false);

static COMMAND_QUEUE:   Mutex<Vec<QueuedCommand>> = Mutex::new(Vec::new());
static COMMAND_HISTORY: Mutex<Vec<HistoryEntry>>  = Mutex::new(Vec::new());
static AGENT_REQUESTS:  Mutex<Vec<AgentRequest>>  = Mutex::new(Vec::new());
static PENDING_TAB_SWITCH: Mutex<Option<AppTab>>  = Mutex::new(None);
```

Lock poisoning: always use `if let Ok(mut guard) = MUTEX.lock()` and silently continue if poisoned.

---

## Main Menu Loop

### Layout Constants

```rust
const MENU_Y: u16 = 12;    // Row where menu items start (below banner)
const STATUS_Y: u16 = 18;  // Row for status text / progress gauge
```

Adjust `MENU_Y` based on banner height (banner rows + 2 blank rows).

### Event Loop Pattern

The menu loop renders at 40ms intervals (25fps) and polls for input with a timeout:

```rust
fn run_app(terminal: &mut Terminal<CrosstermBackend<io::Stdout>>) -> io::Result<()> {
    let mut tick: f64 = 0.0;
    let tick_rate = Duration::from_millis(40);
    let mut selected: usize = 0;
    let mut current_tab = AppTab::Menu;
    let mut last_tick = Instant::now();

    loop {
        // Check for cross-handler tab switch signal
        if let Some(tab) = take_tab_switch() { current_tab = tab; }

        terminal.draw(|f| {
            render_animated_banner(f, tick, &PALETTE_DEFAULT, AnimStyle::Wave);
            // Render tabs, content based on current_tab
        })?;

        tick += 1.0;

        let timeout = tick_rate.checked_sub(last_tick.elapsed()).unwrap_or(Duration::ZERO);
        if event::poll(timeout)? {
            if let Event::Key(KeyEvent { code, kind: KeyEventKind::Press, modifiers, .. }) = event::read()? {
                match code {
                    KeyCode::Tab => { current_tab = current_tab.next(); }
                    KeyCode::BackTab => { current_tab = current_tab.prev(); }
                    KeyCode::Up | KeyCode::Char('k') => {
                        if selected > 0 { selected -= 1; }
                        else { selected = MENU_ITEMS.len() - 1; }
                    }
                    KeyCode::Down | KeyCode::Char('j') => {
                        selected = (selected + 1) % MENU_ITEMS.len();
                    }
                    KeyCode::Char(c) if c.is_ascii_digit() => {
                        let n = c as usize - '1' as usize;
                        if n < MENU_ITEMS.len() { selected = n; }
                    }
                    KeyCode::Char('q') | KeyCode::Char('Q') | KeyCode::Esc => return Ok(()),
                    KeyCode::Enter => handle_action(terminal, selected)?,
                    _ => {}
                }
            }
        }

        if last_tick.elapsed() >= tick_rate { last_tick = Instant::now(); }
    }
}
```

---

## CLI Arg Routing

```rust
// src/cli.rs
pub fn handle_args(args: Vec<String>) -> Option<i32> {
    if args.is_empty() {
        return None;  // Enter TUI mode
    }
    let cmd = args[0].clone();
    let rest = args[1..].to_vec();
    Some(CommandRegistry::dispatch(&cmd, &rest))
}

// src/command_registry.rs
impl CommandRegistry {
    pub fn normalize(cmd: &str) -> String {
        match cmd {
            "validate" => "schema-validate".to_string(),
            "mcp"      => "build-mcp".to_string(),
            // ... other aliases
            _ => cmd.to_string(),
        }
    }

    pub fn dispatch(cmd: &str, args: &[String]) -> i32 {
        let normalized = Self::normalize(cmd);
        match normalized.as_str() {
            "build"           => commands::build::run(args),
            "deploy"          => commands::deploy::run(args),
            "health"          => commands::health::run(args),
            "schema-validate" => commands::schema_validate::run(args),
            // ... other native commands
            _ => PowerShellFallback::run(&normalized, args)
                    .map(|s| s.code().unwrap_or(1))
                    .unwrap_or(1),
        }
    }
}
```

### PowerShell Fallback

For commands not yet ported to Rust, delegate to the original PowerShell script:

```rust
// src/fallback/powershell.rs
pub struct PowerShellFallback;

impl PowerShellFallback {
    pub fn run(cmd: &str, args: &[String]) -> io::Result<ExitStatus> {
        Command::new("pwsh")
            .args(["-NoProfile", "-File", "scripts/bd.ps1", cmd])
            .args(args)
            .stdin(Stdio::inherit())
            .stdout(Stdio::inherit())
            .stderr(Stdio::inherit())
            .status()
    }
}
```

---

## Build System with Real-Time Streaming

### Process Spawning (runtime/process.rs)

```rust
pub fn spawn_streaming(args: &[&str], cwd: &str) -> io::Result<(Child, Receiver<String>)> {
    let mut child = Command::new(args[0])
        .args(&args[1..])
        .current_dir(cwd)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?;

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    let (tx, rx) = std::sync::mpsc::channel::<String>();
    let tx2 = tx.clone();

    std::thread::spawn(move || {
        let Some(pipe) = stdout else { return };
        for line in BufReader::new(pipe).lines().flatten() {
            let _ = tx.send(line);
        }
    });
    std::thread::spawn(move || {
        let Some(pipe) = stderr else { return };
        for line in BufReader::new(pipe).lines().flatten() {
            let _ = tx2.send(line);
        }
    });

    Ok((child, rx))
}
```

### mpsc Render Loop (CRITICAL)

**Never** use `Command::output()` for long tasks — it freezes the UI. Consume via `recv_timeout`:

```rust
let build_tick_rate = Duration::from_millis(40);

loop {
    match rx.recv_timeout(build_tick_rate) {
        Ok(line) => {
            // Process line — filter warnings, update counter
            lines_read += 1;
        }
        Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
            // No output — re-render banner to keep it animating
        }
        Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
            break; // Both pipes closed — process done
        }
    }

    // Re-render banner + status bar every iteration
    terminal.draw(|f| { /* ... */ })?;
}

child.wait()?;
```

**Why `recv_timeout(40ms)`:** This is the render tick rate. Without it, the banner freezes while the subprocess has no output (e.g. compiling a large crate).

### Warning Capture with False-Positive Filtering

```rust
let lower = line.to_lowercase();
let is_diagnostic = lower.contains("warning")
    || lower.contains("error")
    || lower.starts_with("info:");
let is_false_positive = lower.contains("no warning")
    || lower.contains("0 warning")
    || lower.contains("no error");
if is_diagnostic && !is_false_positive {
    writeln!(log_file, "[{}] {}", component, line)?;
}
```

### Smooth Progress Bar

```rust
let base_pct = (step_idx as f64 / total as f64 * 100.0) as u16;
let step_weight = (100.0 / total as f64) as u16;
// Inside recv loop:
let inner_pct = (lines_read.min(300) as f64 / 300.0 * step_weight as f64) as u16;
let progress = (base_pct + inner_pct).min(99);
// Show 100% only after all components complete
```

### Status Bar Line Classification

```rust
enum LineKind { Noise, Info, Warning, Error }

fn classify_line(line: &str) -> LineKind {
    let l = line.to_lowercase();
    if l.contains("error") && !l.contains("no error") && !l.contains("0 error") {
        LineKind::Error
    } else if l.contains("warning") && !l.contains("no warning") && !l.contains("0 warning") {
        LineKind::Warning
    } else if l.starts_with("info:") {
        LineKind::Info
    } else {
        LineKind::Noise
    }
}
```

Status bar colours: Running → Cyan, Done clean → Green (`✓ DONE`), Done warnings → Yellow (`⚠ DONE`), Failed → Red (`✗ FAILED`).

---

## Command Queue

### Queue Item

```rust
#[derive(Clone)]
enum QueueItemStatus { Pending, Running, Done, Failed, Cancelled }

#[derive(Clone)]
enum QueuedExecMode {
    Streaming,      // Live output as lines arrive (build, deploy)
    Scrollable,     // Full output after completion (logs)
    RawStreaming,   // Direct pwsh command (migrations)
}

struct QueuedCommand {
    id: u64,
    title: String,
    command: String,
    args: Vec<String>,
    mode: QueuedExecMode,
    status: QueueItemStatus,
}
```

### Queue Operations

```rust
fn enqueue(cmd: QueuedCommand) {
    if let Ok(mut q) = COMMAND_QUEUE.lock() {
        q.push(cmd);
    }
}

fn next_queue_id() -> u64 {
    NEXT_QUEUE_ID.fetch_add(1, Ordering::SeqCst) as u64
}
```

---

## Warning Summary Screen

```rust
fn show_warning_summary(terminal: &mut Terminal<...>) -> io::Result<()> {
    let content = std::fs::read_to_string("build_warnings.log").unwrap_or_default();

    let mut counts: HashMap<String, usize> = HashMap::new();
    let mut warning_lines: Vec<String> = Vec::new();
    for line in content.lines() {
        if let Some(rest) = line.strip_prefix('[') {
            if let Some(end) = rest.find(']') {
                let component = rest[..end].to_string();
                *counts.entry(component).or_insert(0) += 1;
                warning_lines.push(line.to_string());
            }
        }
    }

    let total_warnings: usize = counts.values().sum();
    let has_error = warning_lines.iter().any(|l| l.to_lowercase().contains("error"));
    let banner_palette = if has_error {
        &PALETTE_ERROR
    } else if total_warnings > 0 {
        &PALETTE_WARN
    } else {
        &PALETTE_SUCCESS
    };

    // Render: animated banner + Table of component → count rows
    // Footer: "C = copy warnings to clipboard | Esc / Enter = return"
}
```

---

## Scrollable Command Viewer

```rust
fn run_streaming_command(
    terminal: &mut Terminal<CrosstermBackend<io::Stdout>>,
    title: &str,
    args: &[&str],
) -> io::Result<()> {
    let output = Command::new(args[0]).args(&args[1..]).output()?;

    let lines: Vec<String> = String::from_utf8_lossy(&output.stdout)
        .lines()
        .chain(String::from_utf8_lossy(&output.stderr).lines())
        .map(|l| l.to_string())
        .collect();

    let mut scroll: usize = 0;

    loop {
        terminal.draw(|f| {
            let area = f.size();
            let visible_height = area.height.saturating_sub(4) as usize;
            let display_lines: Vec<Line> = lines.iter()
                .skip(scroll).take(visible_height)
                .map(|l| Line::from(l.as_str()))
                .collect();
            let para = Paragraph::new(display_lines)
                .block(Block::default().title(format!(" {} ", title)).borders(Borders::ALL));
            f.render_widget(para, Rect::new(0, 0, area.width, area.height.saturating_sub(2)));

            let footer = Paragraph::new("  j/k or Up/Down — scroll | PageUp/Down — jump | C — copy | Esc/R — return")
                .style(Style::default().fg(Color::DarkGray));
            f.render_widget(footer, Rect::new(0, area.height.saturating_sub(1), area.width, 1));
        })?;

        if event::poll(Duration::from_millis(100))? {
            if let Event::Key(KeyEvent { code, kind: KeyEventKind::Press, .. }) = event::read()? {
                match code {
                    KeyCode::Down | KeyCode::Char('j') => { if scroll + 1 < lines.len() { scroll += 1; } }
                    KeyCode::Up | KeyCode::Char('k') => { if scroll > 0 { scroll -= 1; } }
                    KeyCode::PageDown => { scroll = (scroll + 20).min(lines.len().saturating_sub(1)); }
                    KeyCode::PageUp => { scroll = scroll.saturating_sub(20); }
                    KeyCode::Char('c') | KeyCode::Char('C') => { let _ = copy_to_clipboard(&lines.join("\n")); }
                    KeyCode::Esc | KeyCode::Char('r') | KeyCode::Char('R') | KeyCode::Enter => return Ok(()),
                    _ => {}
                }
            }
        }
    }
}
```

---

## Clipboard Integration (Windows)

```rust
fn copy_to_clipboard(text: &str) {
    let _ = Command::new("powershell")
        .args(["-NoProfile", "-Command", "$input | Set-Clipboard"])
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .and_then(|mut child| {
            if let Some(ref mut stdin) = child.stdin {
                stdin.write_all(text.as_bytes())?;
            }
            child.wait()
        });
}
```

`$input` reads from PowerShell's stdin pipe — no temp file needed.

---

## TCP Agent Gateway (MCP Integration)

Listen on a local TCP port in a background thread for MCP agent requests:

```rust
// src/agent.rs
pub fn start_agent_server() {
    std::thread::Builder::new()
        .name("agent-gateway".into())
        .spawn(|| {
            let listener = match TcpListener::bind("127.0.0.1:7422") {
                Ok(l) => l,
                Err(_) => return,  // Silent failure — port may already be in use
            };
            for stream in listener.incoming() {
                if let Ok(stream) = stream {
                    handle_agent_connection(stream);
                }
            }
        })
        .ok();
}
```

**HTTP endpoints (raw TCP, no HTTP framework):**
- `POST /request` → parse JSON body → push to `AGENT_REQUESTS`, return `{"id": N}`
- `GET /status/{id}` → look up in `AGENT_REQUESTS`, return `{"status": "Pending|Approved|Declined"}`
- `GET /health` → `{"ok": true}`

Approved requests auto-enqueue via `enqueue()` and trigger a Queue tab switch via `set_tab_switch(AppTab::Queue)`.

---

## Service Catalog & Dependency Graph

### Service Metadata (domain/services.rs)

```rust
pub struct ServiceMetadata {
    pub key: &'static str,
    pub aliases: &'static [&'static str],
    pub compose_name: &'static str,
    pub container_name: &'static str,
    pub build_context: Option<&'static str>,
    pub dependencies: &'static [&'static str],
    pub health_endpoint: Option<&'static str>,
}

pub struct ServiceCatalog;

impl ServiceCatalog {
    pub fn all() -> &'static [ServiceMetadata] { /* static slice */ }
    pub fn find(key_or_alias: &str) -> Option<&'static ServiceMetadata> { /* lookup */ }
}
```

### Dependency Graph (domain/deps.rs)

```rust
pub struct ServiceDependencies;

impl ServiceDependencies {
    /// Returns transitive dependencies for a list of services
    pub fn dependencies_for_services(services: &[&str]) -> Vec<&'static str> { /* DFS */ }

    /// Topological sort for startup ordering
    pub fn ordered_services(services: &[&str]) -> Vec<&'static str> { /* Kahn's algorithm */ }

    /// When excluding a service, what else must be excluded too?
    pub fn exclusion_closure(excluded: &str) -> Vec<&'static str> { /* reverse dep traversal */ }
}

/// Soft interactive gate — prompts user to refresh deps before proceeding
pub fn dependency_gate(service: &str) -> io::Result<bool> {
    eprintln!("⚠  {} requires dependency refresh. Continue? [y/N]", service);
    let mut input = String::new();
    io::stdin().read_line(&mut input)?;
    Ok(input.trim().eq_ignore_ascii_case("y"))
}
```

---

## SSH/SCP Delegation (System Binary)

No SSH crate — delegate to system `ssh`/`scp` binaries:

```rust
// src/remote/ssh.rs
pub fn ssh_exec_streaming(host: &str, remote_cmd: &str) -> io::Result<ExitStatus> {
    Command::new("ssh")
        .args(["-o", "BatchMode=yes", host, remote_cmd])
        .stdin(Stdio::inherit())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .status()
}

pub fn ssh_exec_output(host: &str, remote_cmd: &str) -> io::Result<std::process::Output> {
    Command::new("ssh")
        .args(["-o", "BatchMode=yes", host, remote_cmd])
        .output()
}
```

Use `BatchMode=yes` to prevent SSH from hanging waiting for interactive password input.

---

## JSON-Backed History (storage/history.rs)

```rust
#[derive(Serialize, Deserialize)]
struct HistoryEntry {
    id: u64,
    command: String,
    args: Vec<String>,
    timestamp: u64,          // Unix seconds
    category: HistoryCategory,
    success: bool,
}

const HISTORY_FILE: &str = "build-deploy-cli/data/history.json";
const MAX_ENTRIES: usize = 500;
const MAX_AGE_DAYS: u64 = 30;

fn load_history() -> Vec<HistoryEntry> {
    std::fs::read_to_string(HISTORY_FILE)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save_history(entries: &[HistoryEntry]) -> io::Result<()> {
    let json = serde_json::to_string_pretty(entries)?;
    std::fs::write(HISTORY_FILE, json)
}

fn append_history(entry: HistoryEntry) {
    if let Ok(mut guard) = COMMAND_HISTORY.lock() {
        guard.push(entry);
        // Evict: cap at MAX_ENTRIES, drop entries older than MAX_AGE_DAYS
        let cutoff = unix_now() - MAX_AGE_DAYS * 86400;
        guard.retain(|e| e.timestamp > cutoff);
        guard.truncate(MAX_ENTRIES);
        let _ = save_history(&guard);
    }
}
```

---

## Log File Management (storage/logs.rs)

```rust
const LOG_DIR: &str = "build-deploy-cli/logs";
const RETENTION_DAYS: u64 = 7;

fn purge_old_logs() -> io::Result<()> {
    let cutoff = SystemTime::now() - Duration::from_secs(RETENTION_DAYS * 86400);
    for entry in std::fs::read_dir(LOG_DIR)? {
        let entry = entry?;
        if entry.metadata()?.modified()? < cutoff {
            let _ = std::fs::remove_file(entry.path());
        }
    }
    Ok(())
}
```

Auto-migrate legacy log files from older directory layouts on startup.

---

## Sub-Menus

```rust
fn show_launch_submenu(terminal: &mut Terminal<...>) -> io::Result<()> {
    let items: &[&str] = &[
        "  1. Default launch",
        "  2. Show UI immediately",
        "  3. Launch with console (debug)",
        "  4. Back to main menu",
    ];
    let launch_args: &[&[&str]] = &[
        &["pwsh", "-NoProfile", "-File", "scripts/launch.ps1"],
        &["pwsh", "-NoProfile", "-File", "scripts/launch.ps1", "-ShowUI"],
        &["pwsh", "-NoProfile", "-File", "scripts/launch.ps1", "-ShowUI", "-Console"],
    ];

    // Same event loop pattern as main menu
    // Number shortcuts + arrow nav + Enter to confirm
    // Last item returns to parent menu
}
```

---

## Action Dispatch

```rust
fn handle_action(terminal: &mut Terminal<CrosstermBackend<io::Stdout>>, action: usize) -> io::Result<()> {
    match action {
        0 => {
            run_build_phase(terminal, &[("Component", &["pwsh", "..."])])?;
            show_warning_summary(terminal)?;
        }
        1 => run_streaming_command(terminal, "Tests", &["pwsh", "-NoProfile", "-File", "scripts/test.ps1"])?,
        2 => show_launch_submenu(terminal)?,
        3 => run_streaming_command(terminal, "Deploy", &["pwsh", "-NoProfile", "-File", "scripts/deploy.ps1"])?,
        _ => {}
    }
    Ok(())
}
```

---

## Module Architecture (Layered)

```
main.rs (TUI frontend + event loop)
    ↓
cli.rs + command_registry.rs (arg parsing + dispatch)
    ├→ commands/* (command entry points, thin wrappers)
    │   ├→ orchestration/* (business logic, 100–1500 lines each)
    │   │   ├→ domain/services.rs (service catalog)
    │   │   ├→ domain/deps.rs (dependency graph)
    │   │   ├→ remote/* (SSH/SCP delegation)
    │   │   ├→ health/mod.rs (curl/podman probing)
    │   │   └→ runtime/process.rs (subprocess spawning + streaming)
    │   └→ fallback/powershell.rs (for unported commands)
    ├→ config/* (static config + path discovery)
    ├→ storage/* (history.json + log file management)
    └→ agent.rs (TCP gateway, 127.0.0.1:7422)
```

**Key principle:** Keep `main.rs` as a pure rendering/event layer. All business logic lives in `orchestration/`. Commands are thin entry points that parse args and call orchestrators.

---

## Build Script

```powershell
# build-cli.ps1
cargo build --release --bin bd 2>&1
if ($LASTEXITCODE -eq 0) {
    Copy-Item "target\release\bd.exe" ".\bd.exe" -Force
    Write-Host "bd.exe copied to project root." -ForegroundColor Green
} else {
    Write-Host "Build failed." -ForegroundColor Red
    exit 1
}
```

---

## Lessons Learned / Gotchas

### 1. Input Drain on Startup
The Enter key that launched the exe stays in the crossterm event buffer. Without draining it, the first menu item activates immediately. Always drain with `event::poll(50ms)` + `event::read()` before the main loop.

### 2. KeyEventKind::Press is Non-Negotiable on Windows
Crossterm on Windows emits both `Press` and `Release`. Every `event::read()` match must filter `kind: KeyEventKind::Press`. Missing this on **even one** event loop causes ghost double-actions.

### 3. Never Use `Command::output()` for Long Tasks
`output()` blocks the entire thread. UI freezes — no animation, no progress. Always use `Stdio::piped()` + background threads + `mpsc::channel` for any command that takes more than ~1 second.

### 4. Use `recv_timeout()`, Not `recv()`
`recv()` blocks until a line arrives. If the subprocess pauses (compiling a large crate), the banner freezes. `recv_timeout(40ms)` keeps the render loop at ~25fps.

### 5. Warning Filter False Positives
Lines like `"No warnings."` or `"0 errors"` contain the keywords but are clean-status messages. Always exclude `"no warning"`, `"0 warning"`, `"no error"` patterns from diagnostic capture.

### 6. build.rs Gate for Multi-Binary Projects
Gate heavy toolchain steps with `CARGO_BIN_NAME` so they're skipped only for the CLI binary. The main application still runs the full pipeline.

### 7. TerminalGuard for Panic Safety
Without a Drop guard, a panic leaves the shell in raw mode with no cursor. The guard ensures cleanup on every exit path.

### 8. Lock Poisoning Resilience
Use `if let Ok(mut guard) = MUTEX.lock()` everywhere — never `.unwrap()`. Poisoned locks from panics in other threads should not crash the main TUI thread.

### 9. SSH BatchMode=yes
Without this, SSH waits interactively for a password if keys aren't configured, hanging the CLI indefinitely.

### 10. No HTTP/SSH Crates — System Binaries
Using `curl` and `ssh`/`scp` system binaries keeps the dependency count minimal and leverages the user's existing SSH key configuration without any extra setup.

### 11. Minimal Dependencies = Fast Compile
4 external crates (crossterm, ratatui, serde, serde_json). No tokio, no reqwest, no ssh2. Background work uses threads + mpsc channels. Compile time stays low for fast iteration.

### 12. Agent Gateway Silent Failure
If port 7422 is already in use (e.g. another bd instance), the agent thread silently returns. The main TUI still works — MCP integration is optional.

---

## Checklist for New CLI

1. [ ] Add `crossterm`, `ratatui`, `serde`, `serde_json` to `[dependencies]` with `strip = true` + `lto = true` in release profile
2. [ ] Add `[[bin]]` entry in Cargo.toml
3. [ ] Gate `build.rs` with `CARGO_BIN_NAME` check if applicable
4. [ ] Create layered module structure: commands/ → orchestration/ → runtime/ + remote/ + domain/
5. [ ] Implement `TerminalGuard` + input drain in `main()`
6. [ ] Implement `cli.rs` arg routing (args → TUI or dispatch)
7. [ ] Implement `CommandRegistry` with alias normalization + PowerShell fallback
8. [ ] Define `AppTab` enum + tab-switch signaling (`PENDING_TAB_SWITCH`)
9. [ ] Define global statics: `COMMAND_RUNNING`, `COMMAND_QUEUE`, `COMMAND_HISTORY`
10. [ ] Define `AnimStyle` enum + 4-style `render_animated_banner()`
11. [ ] Define banner `const`, 4 palettes, layout constants
12. [ ] Implement main event loop with `KeyEventKind::Press` filter + Tab/BackTab navigation
13. [ ] Implement `spawn_streaming()` in `runtime/process.rs`
14. [ ] Implement `run_build_phase()` with `recv_timeout` render loop
15. [ ] Implement warning capture with false-positive filtering
16. [ ] Implement `show_warning_summary()` with severity palettes
17. [ ] Implement `run_streaming_command()` with scroll + clipboard copy
18. [ ] Implement `copy_to_clipboard()` via PowerShell stdin
19. [ ] Implement `QueuedCommand` lifecycle + Queue tab rendering
20. [ ] Implement JSON history in `storage/history.rs`
21. [ ] Implement log retention in `storage/logs.rs`
22. [ ] Implement `ServiceCatalog` + `ServiceDependencies` in `domain/`
23. [ ] Implement `ssh_exec_streaming()` with `BatchMode=yes`
24. [ ] Implement TCP agent gateway in `agent.rs` (optional, for MCP)
25. [ ] Implement sub-menus as needed
26. [ ] Create `build-cli.ps1` convenience script
27. [ ] Test: banner animates, tabs switch, menu navigates, build streams, warnings captured, queue works, clipboard works, Quit restores terminal
