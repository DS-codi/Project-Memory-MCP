---
name: rust-animated-cli
description: "Use this skill when building animated interactive CLI launchers in Rust using crossterm + ratatui. Covers project setup with build.rs isolation, TerminalGuard for safe cleanup, sine-wave banner animation with swappable colour palettes, keyboard-driven menus with number and arrow navigation, real-time build progress with mpsc channel streaming, warning capture with false-positive filtering, warning summary with severity-coloured banners, scrollable command output viewers with clipboard copy, sub-menus, and clipboard integration via PowerShell on Windows."
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
  language_targets:
    - rust
  framework_targets:
    - crossterm
    - ratatui
---

# Animated Interactive Rust CLI (crossterm + ratatui)

An interactive terminal launcher for multi-component projects, written in Rust. Provides a sine-wave animated ASCII banner, keyboard-driven menu with number shortcuts, real-time build progress with streamed output, a warning summary screen with severity colours, scrollable command viewers, and clipboard support — using only `crossterm` and `ratatui`.

## When to Use This Skill

- Creating a developer CLI that wraps build/test/launch operations for a project
- When you want animated feedback during long build processes
- When the project has multiple independently-buildable components (e.g. Rust + Python + linting)
- When you want a native compiled binary instead of a PowerShell script for the CLI launcher
- When targeting Windows terminals (handles key-release ghost events)

---

## Dependencies

```toml
[dependencies]
crossterm = { version = "0.27", features = ["event-stream"] }
ratatui = "0.26"
```

The binary MUST NOT depend on the parent crate's library. It is a self-contained `[[bin]]` target.

```toml
[[bin]]
name = "my-cli"
path = "src/bin/cli.rs"
```

---

## build.rs Isolation (CLI Binary Only)

When the project has a `build.rs` that runs CxxQt code generation (or similar heavy toolchain steps), those steps will also run when building the CLI binary — even though the CLI doesn't use Qt at all. This causes unnecessary build failures if the Qt SDK isn't on `PATH`, and adds significant compile time.

Fix: wrap the CxxQt-specific block in a `CARGO_BIN_NAME` check so it **skips only when building the CLI binary**. All other binaries (including the main CxxQt app) are unaffected:

```rust
fn main() {
    // CxxQt code generation — runs for the main binary and all others,
    // skipped ONLY for the lightweight CLI binary
    if std::env::var("CARGO_BIN_NAME").as_deref() != Ok("my-cli") {
        // ... CxxQtBuilder, protobuf codegen, etc. ...
    }

    // Shared steps (e.g. winresource icon embedding) stay outside the gate
    // so they apply to every binary including the CLI
}
```

**What this does NOT do:** It does not disable CxxQt for your main application. `cargo build` and `cargo build --bin my-app` still run the full CxxQt pipeline. Only `cargo build --bin my-cli` skips it.

---

## File Layout

```
<project-root>/
├── src/
│   └── bin/
│       └── cli.rs           ← Self-contained CLI binary
├── scripts/
│   ├── build.ps1            ← Component build logic
│   ├── test.ps1             ← Component test runner
│   ├── launch.ps1           ← App launcher
│   └── qmllint.ps1          ← (Optional) Linting
├── build-cli.ps1            ← One-liner: cargo build + copy exe to root
├── Cargo.toml
└── build.rs
```

---

## Imports

All functionality comes from the standard library plus two crates:

```rust
use crossterm::{
    cursor,
    event::{self, Event, KeyCode, KeyEvent, KeyEventKind},
    execute,
    terminal,
};
use ratatui::{
    backend::CrosstermBackend,
    layout::{Constraint, Rect},
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, Cell, Gauge, Paragraph, Row, Table},
    Terminal,
};
use std::collections::HashMap;
use std::fs::OpenOptions;
use std::io::{self, BufRead, BufReader, Write};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
```

---

## Terminal Setup & Cleanup

### TerminalGuard (Drop-based cleanup)

**Always** use a Drop guard so the terminal is restored even on panic:

```rust
struct TerminalGuard;

impl Drop for TerminalGuard {
    fn drop(&mut self) {
        let _ = terminal::disable_raw_mode();
        let _ = execute!(io::stdout(), cursor::Show, terminal::LeaveAlternateScreen);
    }
}
```

### main()

```rust
fn main() -> io::Result<()> {
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

On Windows, crossterm delivers both `Press` and `Release` key events. **Every** event loop MUST filter for `KeyEventKind::Press` only, otherwise each keypress triggers the handler twice:

```rust
// CORRECT — filter for Press only
if let Event::Key(KeyEvent { code, kind: KeyEventKind::Press, .. }) = event::read()? {
    match code { /* ... */ }
}

// WRONG — will fire on both Press and Release
if let Event::Key(KeyEvent { code, .. }) = event::read()? {
    match code { /* ... */ }
}
```

This applies to ALL event loops — main menu, sub-menus, build viewer, streaming command viewer. Missing this filter on even one loop causes ghost double-actions.

---

## ASCII Banner Animation

### Banner Definition

Define the banner as a `const` string-slice array. Double all backslashes for Rust string literals:

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

Define multiple palettes as `[Color; 6]` arrays for contextual banner colouring:

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

### Sine-Wave Renderer

Each character gets a colour from the palette based on a sine function of `(tick, column, row)`:

```rust
fn render_banner_with_palette(f: &mut ratatui::Frame, tick: f64, palette: &[Color; 6]) {
    let area = f.size();
    let banner_lines: Vec<Line> = BANNER
        .iter()
        .enumerate()
        .map(|(row, &line)| {
            let spans: Vec<Span> = line
                .chars()
                .enumerate()
                .map(|(col, ch)| {
                    let v = (tick * 0.4 + col as f64 * 0.5 + row as f64 * 0.2).sin();
                    let idx = (v * 2.0).round().abs() as usize;
                    let color = palette[idx % palette.len()];
                    Span::styled(ch.to_string(), Style::default().fg(color))
                })
                .collect();
            Line::from(spans)
        })
        .collect();
    let banner_widget = Paragraph::new(banner_lines);
    let banner_area = Rect::new(0, 0, area.width, area.height.min(BANNER.len() as u16));
    f.render_widget(banner_widget, banner_area);
}

fn render_animated_banner(f: &mut ratatui::Frame, tick: f64) {
    render_banner_with_palette(f, tick, &PALETTE_DEFAULT);
}
```

---

## Main Menu Loop

### Layout Constants

```rust
const MENU_Y: u16 = 12;    // Row where menu items start (below banner)
const STATUS_Y: u16 = 18;  // Row for status text / progress gauge
```

Adjust `MENU_Y` based on your banner height (banner rows + 2 blank rows).

### Menu Definition

```rust
const MENU_ITEMS: &[&str] = &[
    "Build All Components",
    "Test Components",
    "Launch Application",
    "Lint QML Files",
    "Raw Build (No Anim)",
    "Quit",
];
```

### Event Loop Pattern

The menu loop renders at 40ms intervals (25fps) and polls for input with a timeout:

```rust
fn run_app(terminal: &mut Terminal<CrosstermBackend<io::Stdout>>) -> io::Result<()> {
    let mut tick: f64 = 0.0;
    let tick_rate = Duration::from_millis(40);
    let mut selected: usize = 0;
    let mut last_tick = Instant::now();

    loop {
        terminal.draw(|f| {
            render_animated_banner(f, tick);
            let area = f.size();

            if area.height > MENU_Y {
                let menu_lines: Vec<Line> = MENU_ITEMS
                    .iter()
                    .enumerate()
                    .map(|(i, &item)| {
                        if i == selected {
                            Line::from(Span::styled(
                                format!("> {}", item),
                                Style::default().fg(Color::Yellow).add_modifier(Modifier::BOLD),
                            ))
                        } else {
                            Line::from(format!("  {}", item))
                        }
                    })
                    .collect();
                let menu_widget = Paragraph::new(menu_lines);
                let menu_area = Rect::new(2, MENU_Y, area.width.saturating_sub(4), MENU_ITEMS.len() as u16);
                f.render_widget(menu_widget, menu_area);
            }

            if area.height > STATUS_Y {
                let status = Paragraph::new("  Use arrows or 1-6 to select, Enter to confirm, Q to quit")
                    .style(Style::default().fg(Color::DarkGray));
                f.render_widget(status, Rect::new(0, STATUS_Y, area.width, 1));
            }
        })?;

        tick += 1.0;

        let timeout = tick_rate.checked_sub(last_tick.elapsed()).unwrap_or(Duration::ZERO);
        if event::poll(timeout)? {
            if let Event::Key(KeyEvent { code, kind: KeyEventKind::Press, .. }) = event::read()? {
                match code {
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
                    KeyCode::Enter => match selected {
                        n if n == MENU_ITEMS.len() - 1 => return Ok(()),
                        n => handle_action(terminal, n)?,
                    },
                    _ => {}
                }
            }
        }

        if last_tick.elapsed() >= tick_rate { last_tick = Instant::now(); }
    }
}
```

Key patterns:
- **Arrow + j/k navigation** with wrap-around
- **Number shortcuts** (1-N) for direct selection
- **Q / Esc** always exits
- **Enter** dispatches to `handle_action()`

---

## Build System with Real-Time Streaming

### Component Definition

Build components are tuples of `(name, command_args)`:

```rust
fn run_build(
    terminal: &mut Terminal<CrosstermBackend<io::Stdout>>,
    components: &[(&str, &[&str])],
    animated: bool,
) -> io::Result<()> { /* ... */ }
```

Called like:

```rust
run_build(terminal, &[
    ("RustCore", &["pwsh", "-NoProfile", "-File", "scripts/build.ps1", "-Include", "RustCore"] as &[&str]),
    ("PythonUI", &["pwsh", "-NoProfile", "-File", "scripts/build.ps1", "-Include", "PythonUI"]),
    ("QmlLint", &["pwsh", "-NoProfile", "-File", "scripts/qmllint.ps1"]),
], true)?;
```

The `as &[&str]` cast is needed on the first tuple element to help Rust infer the array type.

### mpsc Channel Streaming (CRITICAL)

**Never** use `Command::output()` for build commands — it blocks entirely until the process finishes, freezing the UI. Instead, pipe both stdout and stderr into background threads that feed a single `mpsc::channel`:

```rust
let mut child = Command::new(args[0])
    .args(&args[1..])
    .current_dir(".")
    .stdout(Stdio::piped())
    .stderr(Stdio::piped())
    .spawn()?;

let stdout = child.stdout.take();
let stderr = child.stderr.take();

let (tx, rx) = std::sync::mpsc::channel::<String>();
let tx2 = tx.clone();

let _stdout_thread = std::thread::spawn(move || {
    let Some(pipe) = stdout else { return };
    for line in BufReader::new(pipe).lines().flatten() {
        let _ = tx.send(line);
    }
});
let _stderr_thread = std::thread::spawn(move || {
    let Some(pipe) = stderr else { return };
    for line in BufReader::new(pipe).lines().flatten() {
        let _ = tx2.send(line);
    }
});
```

Then consume with `recv_timeout` to keep the UI animating:

```rust
let build_tick_rate = Duration::from_millis(40);

loop {
    match rx.recv_timeout(build_tick_rate) {
        Ok(line) => {
            // Process line (filter warnings, update counter)
        }
        Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
            // No output yet — re-render to keep banner animating
        }
        Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
            break; // Both pipes closed — component done
        }
    }

    // Re-render banner + progress gauge
}

child.wait()?;
```

**Why `recv_timeout(40ms)`:** This is the render tick rate. Without it, the banner animation freezes while waiting for build output. The timeout ensures the draw loop runs at ~25fps regardless of subprocess output frequency.

### Warning Capture with False-Positive Filtering

Write warnings to a log file tagged by component name. Filter out summary lines that mention "warning" in a negative context:

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

Without the false-positive filter, summary lines like `" No warnings."` from linter scripts get captured as warnings.

### Smooth Progress Bar

Progress is estimated per-component based on lines read (not just component boundaries):

```rust
let base_pct = (step_idx as f64 / total as f64 * 100.0) as u16;
let step_weight = (100.0 / total as f64) as u16;

// Inside the recv loop:
let inner_pct = (lines_read.min(300) as f64 / 300.0 * step_weight as f64) as u16;
let progress = (base_pct + inner_pct).min(99);
```

This gives smooth progress within each component's slice (estimates ~300 lines per component). Adjust 300 based on typical output volume. Final 100% is shown after all components complete.

---

## Warning Summary Screen

After a build completes, show a summary grouped by component with a severity-coloured banner:

```rust
fn show_warning_summary(terminal: &mut Terminal<...>) -> io::Result<()> {
    let content = std::fs::read_to_string("build_warnings.log").unwrap_or_default();

    // Parse [Component] lines, count per component
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

    // Choose banner palette based on severity
    let total_warnings: usize = counts.values().sum();
    let has_error = warning_lines.iter().any(|l| l.to_lowercase().contains("error"));
    let banner_palette = if has_error {
        &PALETTE_ERROR      // Red banner
    } else if total_warnings > 0 {
        &PALETTE_WARN       // Yellow banner
    } else {
        &PALETTE_SUCCESS    // Green banner
    };

    // Render: animated banner + table of component counts
    // Footer: "C = copy warnings to clipboard | Esc / Enter = return"
}
```

---

## Scrollable Command Viewer

For non-build commands (tests, linting), run the command to completion then show output in a scrollable view:

```rust
fn run_streaming_command(
    terminal: &mut Terminal<CrosstermBackend<io::Stdout>>,
    title: &str,
    args: &[&str],
) -> io::Result<()> {
    let output = Command::new(args[0])
        .args(&args[1..])
        .current_dir(".")
        .output()?;

    let stdout_str = String::from_utf8_lossy(&output.stdout);
    let stderr_str = String::from_utf8_lossy(&output.stderr);
    let lines: Vec<String> = stdout_str
        .lines()
        .chain(stderr_str.lines())
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
            let para = Paragraph::new(display_lines).block(
                Block::default().title(format!(" {} ", title)).borders(Borders::ALL),
            );
            f.render_widget(para, Rect::new(0, 0, area.width, area.height.saturating_sub(2)));

            let footer = Paragraph::new("  j/k or Up/Down to scroll | C - copy output | Esc/R to return")
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
                    KeyCode::Char('c') | KeyCode::Char('C') => {
                        let _ = copy_to_clipboard(&lines.join("\n"));
                    }
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

Pipe text to `Set-Clipboard` via PowerShell's stdin:

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

This is preferable to writing to a temp file. The `$input` automatic variable reads from PowerShell's stdin pipe.

---

## Sub-Menus

For actions with multiple variants (e.g. launch with different flags), use a sub-menu pattern:

```rust
fn show_launch_submenu(terminal: &mut Terminal<...>) -> io::Result<()> {
    let items: &[&str] = &[
        "  1. Tray only (no UI window)",
        "  2. Show UI window immediately",
        "  3. Launch with console (debug output)",
        "  4. Back to main menu",
    ];
    let launch_args: &[&[&str]] = &[
        &["pwsh", "-NoProfile", "-File", "scripts/launch.ps1"],
        &["pwsh", "-NoProfile", "-File", "scripts/launch.ps1", "-ShowUI"],
        &["pwsh", "-NoProfile", "-File", "scripts/launch.ps1", "-ShowUI", "-Console"],
    ];

    // Same event loop pattern as main menu
    // Number shortcuts + arrow nav + Enter to confirm
    // Last item always returns to parent menu
}
```

---

## Action Dispatch

Keep dispatch simple — a match on the menu index:

```rust
fn handle_action(
    terminal: &mut Terminal<CrosstermBackend<io::Stdout>>,
    action: usize,
) -> io::Result<()> {
    match action {
        0 => {
            run_build(terminal, &[/* components */], true)?;
            show_warning_summary(terminal)?;
        }
        1 => run_streaming_command(terminal, "Test Components", &["pwsh", "-NoProfile", "-File", "scripts/test.ps1"])?,
        2 => show_launch_submenu(terminal)?,
        3 => run_streaming_command(terminal, "Lint QML Files", &["pwsh", "-NoProfile", "-File", "scripts/qmllint.ps1"])?,
        4 => {
            run_build(terminal, &[/* components */], false)?;
            show_warning_summary(terminal)?;
        }
        _ => {}
    }
    Ok(())
}
```

---

## Lessons Learned / Gotchas

### 1. Input Drain on Startup
The Enter key used to launch the `.exe` from a terminal is still in the crossterm event buffer. Without draining it, the first menu item activates immediately on launch. Always drain with `event::poll(50ms)` + `event::read()` before entering the main loop.

### 2. KeyEventKind::Press is Non-Negotiable on Windows
Crossterm on Windows emits both `Press` and `Release` events. Every single `event::read()` match must filter `kind: KeyEventKind::Press`. Missing this on even one event loop causes double-firing.

### 3. Never Use `Command::output()` for Long Tasks
`output()` blocks the entire thread until the process exits. The UI freezes completely — no banner animation, no progress updates. Always use `Stdio::piped()` + background threads + `mpsc::channel` for any command that takes more than ~1 second.

### 4. Use `recv_timeout()`, Not `recv()`
`recv()` blocks until a line arrives. If the subprocess pauses output (e.g. compiling a large crate), the banner animation freezes. `recv_timeout(40ms)` ensures the render loop runs at a consistent framerate.

### 5. Warning Filter False Positives
Lines like `" No warnings."` or `"0 errors"` contain the keywords "warning" / "error" but are actually clean-status messages. Always exclude lines matching `"no warning"`, `"0 warning"`, `"no error"` from the diagnostic capture.

### 6. build.rs Isolation for Multi-Binary Projects
If the project has a `build.rs` with CxxQt/protobuf codegen, gate it with `CARGO_BIN_NAME` so those steps are skipped **only for the CLI binary**. The main application and all other binaries still run the full build pipeline. Without this gate, `cargo build --bin my-cli` fails if the Qt SDK isn't installed, even though the CLI doesn't use Qt.

### 7. TerminalGuard for Panic Safety
If the program panics without restoring the terminal, the user's shell is left in raw mode with no cursor. The `Drop`-based guard ensures cleanup happens on every exit path including panics.

### 8. Build Script for Quick Iteration
Create a one-liner `build-cli.ps1` at the project root for fast rebuilds:

```powershell
cargo build --release --bin my-cli 2>&1
if ($LASTEXITCODE -eq 0) {
    Copy-Item "target\release\my-cli.exe" ".\my-cli.exe" -Force
    Write-Host "my-cli.exe copied to project root." -ForegroundColor Green
} else {
    Write-Host "Build failed." -ForegroundColor Red
    exit 1
}
```

---

## Checklist for New CLI

1. [ ] Add `crossterm` + `ratatui` to `[dependencies]`
2. [ ] Add `[[bin]]` entry in Cargo.toml
3. [ ] Gate `build.rs` with `CARGO_BIN_NAME` check
4. [ ] Create `src/bin/cli.rs` with `TerminalGuard` + input drain
5. [ ] Define banner `const`, palettes, and layout constants
6. [ ] Implement `render_banner_with_palette()` + `render_animated_banner()`
7. [ ] Implement main menu loop with `KeyEventKind::Press` filter
8. [ ] Implement `run_build()` with mpsc channel streaming
9. [ ] Implement warning capture with false-positive filtering
10. [ ] Implement `show_warning_summary()` with severity palettes
11. [ ] Implement `run_streaming_command()` with scroll + clipboard copy
12. [ ] Implement `copy_to_clipboard()` via PowerShell
13. [ ] Implement `handle_action()` dispatch
14. [ ] Add sub-menus as needed
15. [ ] Create `build-cli.ps1` convenience script
16. [ ] Test: banner animates, menu navigates, build shows progress, warnings captured, clipboard works, Quit restores terminal
