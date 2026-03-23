---
name: rust-animated-cli
description: "Use this skill when building animated interactive CLI launchers in Rust using crossterm + ratatui. Covers project setup with build.rs isolation, TerminalGuard for safe cleanup, multi-style animated banner (Wave/Pulse/Scan/Sparkle) with swappable colour palettes, Tab-to-cycle animation, keyboard-driven menus with number and arrow navigation, phase-based build orchestration with PhaseResult structs and component_build_plan helpers, real-time build progress with mpsc channel streaming, live output ring-buffer, phase detection, precise starts_with diagnostic capture with error+warning counting, elapsed timers, severity-aware gauge colouring, Table-based warning summary with per-phase breakdown, scrollable command output viewers with exit-status palette and output colourisation, detached process launching, clipboard integration via PowerShell on Windows."
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

An interactive terminal launcher for multi-component projects, written in Rust. Provides a multi-style animated ASCII banner (Wave, Pulse, Scan, Sparkle — switchable live with Tab), keyboard-driven menu with number shortcuts, phase-based build orchestration with per-phase diagnostics, real-time build progress with streamed output, a live output ring-buffer, a `Table`-based warning/error summary screen, colourised scrollable command viewers, detached process launching, and clipboard support — using only `crossterm` and `ratatui`.

## When to Use This Skill

- Creating a developer CLI that wraps build/test/launch operations for a project
- When you want animated feedback during long build processes
- When the project has multiple independently-buildable components, each with multiple phases (e.g. QML lint → Rust build → npm build)
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

## build.rs Isolation

If the project has a complex `build.rs` (e.g. CxxQt code generation), gate it so it only runs for the main binary:

```rust
fn main() {
    // Only run heavy build steps for the main binary, not for the CLI
    if std::env::var("CARGO_BIN_NAME").as_deref() != Ok("my-cli") {
        // ... CxxQt / protobuf / other code generation here ...
    }

    // Shared steps that apply to all binaries (e.g. winresource) go outside the gate
}
```

This prevents the CLI binary from needing Qt/protobuf toolchains installed.

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
use std::collections::VecDeque;
use std::fs::OpenOptions;
use std::io::{self, BufRead, BufReader, Write};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};
```

`VecDeque` is used for the live output ring-buffer. `SystemTime`/`UNIX_EPOCH` are not needed — `Instant::now()` is sufficient for all timing. `HashMap` is not needed if the warning summary uses a `PhaseResult` slice instead of log-file parsing.

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

Use raw string literals (`r"..."`) so backslashes don't need escaping:

```rust
const BANNER: &[&str] = &[
    r"  __  __         ____            _  ",
    r" |  \/  |_   _  |  _ \ _ __ ___ (_) ",
    r" | |\/| | | | | | |_) | '__/ _ \| | ",
    r" | |  | | |_| | |  __/| | | (_) | | ",
    r" |_|  |_|\__, | |_|   |_|  \___// | ",
    r"         |___/                |__/  ",
    r"",
    r"  My Project — command line launcher",  // Optional subtitle line
];
```

### Colour Palettes

Define multiple palettes as `[Color; 6]` arrays for contextual banner colouring:

```rust
const PALETTE_DEFAULT: [Color; 6] = [Color::White, Color::Cyan, Color::Blue, Color::DarkGray, Color::Green, Color::LightGreen];
const PALETTE_SUCCESS: [Color; 6] = [Color::Green, Color::LightGreen, Color::Cyan, Color::Green, Color::LightGreen, Color::White];
const PALETTE_WARN:    [Color; 6] = [Color::Yellow, Color::LightYellow, Color::White, Color::Yellow, Color::LightYellow, Color::DarkGray];
const PALETTE_ERROR:   [Color; 6] = [Color::Red, Color::LightRed, Color::Yellow, Color::Red, Color::LightRed, Color::DarkGray];
```

### Animation Styles (Enum)

Define the styles as an enum with cycling methods:

```rust
#[derive(Clone, Copy, PartialEq)]
enum AnimStyle {
    Wave,
    Pulse,
    Scan,
    Sparkle,
}

impl AnimStyle {
    fn next(self) -> Self {
        match self {
            AnimStyle::Wave    => AnimStyle::Pulse,
            AnimStyle::Pulse   => AnimStyle::Scan,
            AnimStyle::Scan    => AnimStyle::Sparkle,
            AnimStyle::Sparkle => AnimStyle::Wave,
        }
    }
    fn prev(self) -> Self {
        match self {
            AnimStyle::Wave    => AnimStyle::Sparkle,
            AnimStyle::Pulse   => AnimStyle::Wave,
            AnimStyle::Scan    => AnimStyle::Pulse,
            AnimStyle::Sparkle => AnimStyle::Scan,
        }
    }
    fn name(self) -> &'static str {
        match self {
            AnimStyle::Wave    => "Wave",
            AnimStyle::Pulse   => "Pulse",
            AnimStyle::Scan    => "Scan",
            AnimStyle::Sparkle => "Sparkle",
        }
    }
}
```

### PRNG Helper (no external crates)

Sparkle mode needs per-character randomness. Use a cheap deterministic hash — no `rand` crate needed:

```rust
fn prng(seed: u64) -> f64 {
    let mut x = seed.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
    x ^= x >> 33;
    x = x.wrapping_mul(0xff51afd7ed558ccd);
    x ^= x >> 33;
    x = x.wrapping_mul(0xc4ceb9fe1a85ec53);
    x ^= x >> 33;
    (x as f64) / (u64::MAX as f64)
}
```

### Multi-Style Banner Renderer

`render_banner_with_palette` now takes `AnimStyle`. Use **slowed-down tick multipliers** (`0.12`, not `0.4`) for smooth animation:

```rust
fn render_banner_with_palette(
    f: &mut ratatui::Frame,
    tick: f64,
    palette: &[Color; 6],
    style: AnimStyle,
) {
    let banner_rows = BANNER.len() as f64;
    let tick_bin = tick as u64;

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
                            // Slowed sine wave (0.12 tick, 0.25 col, 0.18 row)
                            let v = (tick * 0.12 + col as f64 * 0.25 + row as f64 * 0.18).sin();
                            let idx = (v * 2.0).round().abs() as usize;
                            palette[idx % palette.len()]
                        }
                        AnimStyle::Pulse => {
                            // Entire banner breathes together
                            let brightness = (tick * 0.04).sin() * 0.5 + 0.5;
                            let idx = (brightness * (palette.len() - 1) as f64).round() as usize;
                            palette[idx.min(palette.len() - 1)]
                        }
                        AnimStyle::Scan => {
                            // Bright scanline sweeps downward
                            let period = banner_rows + 6.0;
                            let scanline = (tick * 0.18) % period;
                            let dist = (row as f64 - scanline).abs();
                            if dist < 1.5 {
                                Color::White
                            } else {
                                let v = (tick * 0.08 + col as f64 * 0.2 + row as f64 * 0.15).sin();
                                let idx = (v * 2.0).round().abs() as usize;
                                palette[idx % palette.len()]
                            }
                        }
                        AnimStyle::Sparkle => {
                            // Dim wave base with random character flares (4% chance)
                            let v = (tick * 0.08 + col as f64 * 0.2 + row as f64 * 0.15).sin();
                            let base_idx = ((v * 2.0).round().abs() as usize + 3) % palette.len();
                            let seed = row as u64 * 997 + col as u64 + tick_bin * 137;
                            if prng(seed) < 0.04 { Color::White } else { palette[base_idx] }
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

fn render_animated_banner(f: &mut ratatui::Frame, tick: f64, style: AnimStyle) {
    render_banner_with_palette(f, tick, &PALETTE_DEFAULT, style);
}
```

**Key tick multiplier rationale:**

| Mode | Tick factor | Why |
|------|-------------|-----|
| Wave | `0.12` | Visibly smooth left-to-right ripple |
| Pulse | `0.04` | Slow breath; faster looks frantic |
| Scan | `0.18` | Scanline speed relative to banner height |
| Sparkle | `0.08` | Wave base; sparkles are tick-bin gated |

The original `tick * 0.4` was too fast — all characters cycle through palette colours faster than the eye can track.

---

## Main Menu Loop

### Layout Constants

```rust
const MENU_Y:   u16 = 9;     // Row where menu items start (below banner + subtitle)
const STATUS_Y: u16 = 18;    // Row for hint / status text
```

Adjust `MENU_Y` based on your banner height (banner rows + subtitle + 1 blank row).

### Menu Definition

```rust
const MENU_ITEMS: &[&str] = &[
    "Install Components",
    "Test Components",
    "Launch Application",
    "Lint QML Files",
    "Stream Command Output",
    "Quit",
];
```

### Event Loop Pattern

The menu loop renders at 40ms intervals (25fps), polls for input with a timeout, and holds `anim_style` as mutable state so Tab can cycle it live:

```rust
fn run_app(terminal: &mut Terminal<CrosstermBackend<io::Stdout>>) -> io::Result<()> {
    let mut tick: f64 = 0.0;
    let tick_rate = Duration::from_millis(40);
    let mut selected: usize = 0;
    let mut last_tick = Instant::now();
    let mut anim_style = AnimStyle::Wave;

    loop {
        let style = anim_style;
        terminal.draw(|f| {
            render_animated_banner(f, tick, style);
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
                f.render_widget(
                    Paragraph::new(menu_lines),
                    Rect::new(2, MENU_Y, area.width.saturating_sub(4), MENU_ITEMS.len() as u16),
                );
            }

            // Hint text shows current anim style name
            if area.height > STATUS_Y {
                let hint = format!(
                    "  Arrows/1-{n} select · Enter confirm · Tab cycle anim [{anim}] · Q quit",
                    n = MENU_ITEMS.len(),
                    anim = style.name(),
                );
                f.render_widget(
                    Paragraph::new(hint).style(Style::default().fg(Color::DarkGray)),
                    Rect::new(0, STATUS_Y, area.width, 1),
                );
            }
        })?;

        tick += 1.0;

        let timeout = tick_rate.checked_sub(last_tick.elapsed()).unwrap_or(Duration::ZERO);
        if event::poll(timeout)? {
            if let Event::Key(KeyEvent { code, kind: KeyEventKind::Press, .. }) = event::read()? {
                match code {
                    KeyCode::Up | KeyCode::Char('k') => {
                        if selected > 0 { selected -= 1; } else { selected = MENU_ITEMS.len() - 1; }
                    }
                    KeyCode::Down | KeyCode::Char('j') => {
                        selected = (selected + 1) % MENU_ITEMS.len();
                    }
                    KeyCode::Char(c) if c.is_ascii_digit() => {
                        let n = c as usize - b'1' as usize;
                        if n < MENU_ITEMS.len() { selected = n; }
                    }
                    KeyCode::Tab     => { anim_style = anim_style.next(); }
                    KeyCode::BackTab => { anim_style = anim_style.prev(); }
                    KeyCode::Char('q') | KeyCode::Char('Q') | KeyCode::Esc => return Ok(()),
                    KeyCode::Enter => {
                        if selected == MENU_ITEMS.len() - 1 {
                            return Ok(());  // Last item is always Quit
                        }
                        handle_action(terminal, selected, anim_style)?;
                    }
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
- **Tab / Shift+Tab** cycles animation style forward/backward live
- **Hint text** shows `[Wave]` / `[Pulse]` etc. so the user can see the current style
- **Q / Esc** always exits
- **Enter** dispatches to `handle_action()` (last item returns immediately as Quit)

---

## Phase-Based Build Architecture

The build system is structured as three layers: component list → phases per component → one `run_build_phase` call per phase. This gives per-phase warning/error counts, per-phase elapsed timers, and a clean summary table.

### PhaseResult Struct

Accumulate results across all phases before showing the summary:

```rust
struct PhaseResult {
    component:  String,
    phase:      String,
    warn_count: usize,
    err_count:  usize,
}
```

### component_build_plan Helper

Map component names to their ordered phases. Each phase is a `(label, Vec<String>)` pair:

```rust
fn component_build_plan(component: &str) -> Vec<(String, Vec<String>)> {
    fn ps(script: &str, extra: &[&str]) -> Vec<String> {
        let mut v = vec!["pwsh".to_string(), "-NoProfile".to_string(),
                         "-File".to_string(), script.to_string()];
        v.extend(extra.iter().map(|s| s.to_string()));
        v
    }
    match component {
        "FrontEnd" => vec![
            ("QML Lint".to_string(),  ps("scripts/cli-qmllint.ps1", &["-Component", "frontend"])),
            ("Rust Build".to_string(), ps("scripts/cli-build-frontend.ps1", &[])),
        ],
        "Backend" => vec![
            ("Build".to_string(), ps("scripts/cli-build-backend.ps1", &[])),
        ],
        "Dashboard" => vec![
            ("Build".to_string(), ps("scripts/cli-build-dashboard.ps1", &[])),
        ],
        _ => vec![],
    }
}
```

### Component Runner (with "All" support)

```rust
fn run_build_component(
    terminal: &mut Terminal<CrosstermBackend<io::Stdout>>,
    component: &str,
    anim_style: AnimStyle,
) -> io::Result<()> {
    // Truncate warning log for a fresh build session
    let _ = std::fs::write("build_warnings.log", "");

    let sub_components: Vec<&str> = if component == "All" {
        vec!["FrontEnd", "Backend", "Dashboard"]
    } else {
        vec![component]
    };

    let mut results: Vec<PhaseResult> = Vec::new();

    for comp in &sub_components {
        for (phase_label, args) in component_build_plan(comp) {
            let section_header = format!("{} - {}", comp, phase_label);
            let (warns, errs) = run_build_phase(terminal, &section_header, &args, anim_style)?;
            results.push(PhaseResult {
                component:  comp.to_string(),
                phase:      phase_label,
                warn_count: warns,
                err_count:  errs,
            });
        }
    }

    show_warning_summary(terminal, &results, anim_style)
}
```

### run_build_phase — mpsc Streaming + Live Output Box + Cancellation

**Never** use `Command::output()` — it blocks entirely. Pipe both stdout and stderr into background threads feeding a single `mpsc::channel`. Use `VecDeque` for the visible ring-buffer:

```rust
fn run_build_phase(
    terminal: &mut Terminal<CrosstermBackend<io::Stdout>>,
    section_header: &str,
    args: &[String],
    anim_style: AnimStyle,
) -> io::Result<(usize, usize)> {
    if args.is_empty() { return Ok((0, 0)); }

    // Append section delimiter to log
    let log_path = "build_warnings.log";
    {
        let mut lf = OpenOptions::new().create(true).append(true).open(log_path)?;
        let _ = writeln!(lf, "\n=== {} ===", section_header);
    }
    let mut log_file = OpenOptions::new().create(true).append(true).open(log_path)?;

    let mut child = Command::new(&args[0])
        .args(&args[1..])
        .current_dir(".")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?;

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let (tx, rx) = std::sync::mpsc::channel::<String>();
    let tx2 = tx.clone();

    let _t1 = std::thread::spawn(move || {
        if let Some(pipe) = stdout {
            for line in BufReader::new(pipe).lines().flatten() { let _ = tx.send(line); }
        }
    });
    let _t2 = std::thread::spawn(move || {
        if let Some(pipe) = stderr {
            for line in BufReader::new(pipe).lines().flatten() { let _ = tx2.send(line); }
        }
    });

    let tick_rate = Duration::from_millis(40);
    let mut tick: f64 = 0.0;
    let mut last_tick = Instant::now();
    let start_time = Instant::now();

    let mut lines_read: u64 = 0;
    let mut warn_count: usize = 0;
    let mut err_count: usize = 0;
    let mut live_log: VecDeque<String> = VecDeque::new();   // 6-line ring buffer
    let mut current_phase = String::from("Initialising…");
    let mut done = false;
    let mut cancelled = false;
    let mut progress: u16 = 0;

    loop {
        match rx.recv_timeout(tick_rate) {
            Ok(line) => {
                lines_read += 1;
                let lower = line.to_lowercase();

                // Phase detection — show a human-readable sub-line
                for key in &["compiling", "installing", "building", "linking",
                              "packaging", "bundling", "generating", "running",
                              "finished", "info:"] {
                    if lower.contains(key) {
                        let trimmed = line.trim().chars().take(65).collect::<String>();
                        if !trimmed.is_empty() { current_phase = trimmed; }
                        break;
                    }
                }

                // Precise diagnostic capture — use starts_with, NOT contains
                // contains("warning") fires on lines like "No warnings found."
                let tl = line.trim().to_lowercase();
                let is_diag = tl.starts_with("warning:")
                    || tl.starts_with("warning[")
                    || tl.starts_with("error:")
                    || tl.starts_with("error[")
                    || tl.starts_with("  --> ");  // source location context lines
                let is_fp = tl.contains("no warning")
                    || tl.contains("0 warning")
                    || tl.contains("no error");
                if is_diag && !is_fp {
                    if tl.starts_with("error") { err_count += 1; }
                    else { warn_count += 1; }
                    let _ = writeln!(log_file, "{}", line.trim());
                }

                // Live ring-buffer with E/W color tags
                let tag = if tl.starts_with("error") { "E" }
                          else if tl.starts_with("warning") { "W" }
                          else { " " };
                live_log.push_back(format!("{} {}", tag, line));
                if live_log.len() > 6 { live_log.pop_front(); }

                // Progress updated below (time-based fallback handles sparse output)
            }
            Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => { done = true; }
            Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {}
        }

        // Progress: max(line-based, time-based) — prevents stalling at low % during
        // long linking/codegen phases that produce very few output lines.
        // Line estimate: ~200 lines per phase. Time estimate: ~300 s per phase.
        if !done {
            let elapsed_secs = start_time.elapsed().as_secs();
            let line_pct = ((lines_read.min(200) as f64 / 200.0) * 99.0) as u16;
            let time_pct = (elapsed_secs.min(300) as f64 / 300.0 * 99.0) as u16;
            progress = line_pct.max(time_pct);
        }

        // Build the render frame
        let elapsed = start_time.elapsed();
        let elapsed_str = format!("{:02}:{:02}", elapsed.as_secs() / 60, elapsed.as_secs() % 60);
        let hdr = format!("  ▶ {}   ⏱ {}", section_header, elapsed_str);
        let phase_snap = current_phase.clone();
        let live_snap: Vec<String> = live_log.iter().cloned().collect();
        let prog = if done { 100 } else { progress };
        let wc = warn_count; let ec = err_count; let lc = lines_read;
        let style = anim_style;
        let is_cancelled = cancelled;

        terminal.draw(|f| {
            render_banner_with_palette(f, tick, &PALETTE_DEFAULT, style);
            let area = f.size();
            let start_y = BANNER.len() as u16 + 1;

            // Header with elapsed timer
            if area.height > start_y {
                f.render_widget(
                    Paragraph::new(hdr.clone())
                        .style(Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD)),
                    Rect::new(0, start_y, area.width, 1),
                );
            }

            // Current phase sub-line
            let phase_y = start_y + 1;
            if area.height > phase_y {
                f.render_widget(
                    Paragraph::new(format!("  {}", phase_snap))
                        .style(Style::default().fg(Color::White)),
                    Rect::new(0, phase_y, area.width, 1),
                );
            }

            // Live output box (6 rows + border = 8 rows total)
            let box_y = phase_y + 1;
            let box_h: u16 = 8;
            if area.height > box_y + box_h {
                let log_lines: Vec<Line> = live_snap.iter().map(|l| {
                    let color = if l.starts_with("E ") { Color::LightRed }
                                else if l.starts_with("W ") { Color::Yellow }
                                else { Color::DarkGray };
                    let text = if l.len() > 2 { &l[2..] } else { l.as_str() };
                    Line::from(Span::styled(text.to_string(), Style::default().fg(color)))
                }).collect();
                f.render_widget(
                    Paragraph::new(log_lines)
                        .block(Block::default().title(" Live output ").borders(Borders::ALL)),
                    Rect::new(0, box_y, area.width, box_h),
                );
            }

            // Counts row
            let counts_y = box_y + box_h;
            if area.height > counts_y {
                f.render_widget(
                    Paragraph::new(format!(
                        "  Warnings: {}   Errors: {}   Lines read: {}", wc, ec, lc
                    )).style(Style::default().fg(Color::DarkGray)),
                    Rect::new(0, counts_y, area.width, 1),
                );
            }

            // Progress gauge — colour and label reflect state (running / done / cancelled)
            let gauge_y = counts_y + 1;
            if area.height > gauge_y {
                let gauge_color = if is_cancelled { Color::DarkGray }
                                  else if ec > 0 { Color::Red }
                                  else if wc > 0 { Color::Yellow }
                                  else { Color::Cyan };
                let label = if is_cancelled {
                    String::from("Cancelled")
                } else if done {
                    format!("Done  warnings: {}  errors: {}", wc, ec)
                } else {
                    format!("{}%", prog)
                };
                f.render_widget(
                    Gauge::default()
                        .gauge_style(Style::default().fg(gauge_color))
                        .percent(prog)
                        .label(label),
                    Rect::new(0, gauge_y, area.width, 1),
                );
            }

            // Cancel hint
            let hint_y = counts_y + 2;
            if area.height > hint_y {
                f.render_widget(
                    Paragraph::new("  Esc / Q  cancel build")
                        .style(Style::default().fg(Color::DarkGray)),
                    Rect::new(0, hint_y, area.width, 1),
                );
            }
        })?;

        tick += 1.0;
        if last_tick.elapsed() >= tick_rate { last_tick = Instant::now(); }

        // Non-blocking cancel check — kills child on Esc/Q
        if !done {
            if event::poll(Duration::ZERO)? {
                if let Event::Key(KeyEvent { code, kind: KeyEventKind::Press, .. }) = event::read()? {
                    if matches!(code, KeyCode::Esc | KeyCode::Char('q') | KeyCode::Char('Q')) {
                        let _ = child.kill();
                        cancelled = true;
                        done = true;
                    }
                }
            }
        }

        if done { break; }
    }

    let _ = child.wait(); // may already be dead (cancelled or exited naturally)
    if cancelled {
        std::thread::sleep(Duration::from_millis(200));
        return Ok((warn_count, err_count));
    }
    std::thread::sleep(Duration::from_millis(400));  // brief pause so "Done" is visible
    Ok((warn_count, err_count))
}
```

**Why `recv_timeout(40ms)`:** Matches the render tick rate. Without it the animation freezes while the subprocess isn't producing output (e.g. during Rust linking).

### Progress Formula: `max(line_pct, time_pct)` (CRITICAL)

A pure line-count formula (`lines_read / 300 * 99%`) stalls during long phases that produce very little output — Rust linking a large crate may output only ~10 lines over 3+ minutes, leaving the bar stuck at 3%.

The fix: compute both a line-based estimate and a time-based estimate, use whichever is larger:

```rust
let elapsed_secs = start_time.elapsed().as_secs();
let line_pct = ((lines_read.min(200) as f64 / 200.0) * 99.0) as u16;
let time_pct = (elapsed_secs.min(300) as f64 / 300.0 * 99.0) as u16;
progress = line_pct.max(time_pct);
```

This must be computed **outside the `Ok(line)` match arm** so it runs every tick — including `Timeout` ticks where no lines arrive. If it were inside `Ok(line)`, the bar would only advance when output is received.

| Condition | Behaviour |
|-----------|----------|
| Fast-output phase (npm, installs) | Line-based keeps up, time-based lags — `max` picks line |
| Sparse-output phase (Rust link, codegen) | Time-based advances, line-based stalls — `max` picks time |
| Phase finishes normally | `done = true` → gauge snaps to 100% and shows "Done" label |
| Phase cancelled | `cancelled = true` → gauge label shows "Cancelled", gauge grey |

Tune the denominators (`200` lines, `300` seconds) to your typical build profile.

### Cancellation Pattern

```rust
// Non-blocking event poll — does NOT block the render loop
if !done {
    if event::poll(Duration::ZERO)? {
        if let Event::Key(KeyEvent { code, kind: KeyEventKind::Press, .. }) = event::read()? {
            if matches!(code, KeyCode::Esc | KeyCode::Char('q') | KeyCode::Char('Q')) {
                let _ = child.kill();   // SIGKILL — immediate
                cancelled = true;
                done = true;
            }
        }
    }
}
```

Key points:
- Use `Duration::ZERO` (not `Duration::from_millis(40)`) — zero-timeout poll so the loop never blocks on input
- Call `child.kill()` then set `done = true` — the `Disconnected` branch will fire on the next iteration as the pipes close, but we skip it by already being done
- After the loop: `let _ = child.wait()` ignores errors (child may already be dead). This reaps the zombie on Unix and is a no-op on Windows for already-killed processes
- Cancelled builds still land on the summary screen with the partial counts, so the user sees which phases completed before the cancel

### Diagnostic Capture: `starts_with` Not `contains` (CRITICAL)

```rust
// CORRECT — only genuine rustc/cargo/qmllint diagnostics
let is_diag = tl.starts_with("warning:")
    || tl.starts_with("warning[")
    || tl.starts_with("error:")
    || tl.starts_with("error[")
    || tl.starts_with("  --> ");

// WRONG — fires on "Build finished. No warnings." etc.
let is_diag = lower.contains("warning") || lower.contains("error");
```

---

## Warning Summary Screen

After all phases complete, show a severity-coloured banner and a `Table` with per-phase breakdown. The summary takes a `&[PhaseResult]` slice — no log file parsing needed:

```rust
fn show_warning_summary(
    terminal: &mut Terminal<CrosstermBackend<io::Stdout>>,
    results: &[PhaseResult],
    anim_style: AnimStyle,
) -> io::Result<()> {
    if results.is_empty() { return Ok(()); }

    let has_error = results.iter().any(|r| r.err_count > 0);
    let total: usize = results.iter().map(|r| r.warn_count + r.err_count).sum();
    let warning_log = std::fs::read_to_string("build_warnings.log").unwrap_or_default();
    let palette = if has_error { &PALETTE_ERROR }
                  else if total > 0 { &PALETTE_WARN }
                  else { &PALETTE_SUCCESS };

    let mut tick: f64 = 0.0;
    let tick_rate = Duration::from_millis(40);
    let mut last_tick = Instant::now();

    loop {
        let p = palette;
        let style = anim_style;
        terminal.draw(|f| {
            render_banner_with_palette(f, tick, p, style);
            let area = f.size();
            let start_y = BANNER.len() as u16 + 1;

            let header_text = if has_error { "  Build finished with ERRORS" }
                              else if total > 0 { "  Build finished with warnings" }
                              else { "  Build finished -- clean!" };
            let header_col = if has_error { Color::LightRed }
                              else if total > 0 { Color::Yellow }
                              else { Color::LightGreen };
            if area.height > start_y {
                f.render_widget(
                    Paragraph::new(header_text)
                        .style(Style::default().fg(header_col).add_modifier(Modifier::BOLD)),
                    Rect::new(0, start_y, area.width, 1),
                );
            }

            // 4-column table: Component | Phase | Warns | Errors
            let table_y = start_y + 2;
            if area.height > table_y + 2 {
                let header_row = Row::new(vec![
                    Cell::from("Component").style(Style::default().add_modifier(Modifier::BOLD)),
                    Cell::from("Phase").style(Style::default().add_modifier(Modifier::BOLD)),
                    Cell::from("Warns").style(Style::default().fg(Color::Yellow).add_modifier(Modifier::BOLD)),
                    Cell::from("Errors").style(Style::default().fg(Color::LightRed).add_modifier(Modifier::BOLD)),
                ]);
                let rows: Vec<Row> = results.iter().map(|r| {
                    let ws = if r.warn_count > 0 { Style::default().fg(Color::Yellow) }
                             else { Style::default().fg(Color::DarkGray) };
                    let es = if r.err_count > 0 { Style::default().fg(Color::LightRed) }
                             else { Style::default().fg(Color::DarkGray) };
                    Row::new(vec![
                        Cell::from(r.component.clone()),
                        Cell::from(r.phase.clone()),
                        Cell::from(r.warn_count.to_string()).style(ws),
                        Cell::from(r.err_count.to_string()).style(es),
                    ])
                }).collect();
                let table_h = (results.len() as u16 + 3).min(area.height.saturating_sub(table_y + 3));
                f.render_widget(
                    Table::new(rows, [
                        Constraint::Percentage(32),
                        Constraint::Percentage(30),
                        Constraint::Percentage(18),
                        Constraint::Percentage(20),
                    ])
                    .header(header_row)
                    .block(Block::default().title(" Build Summary ").borders(Borders::ALL)),
                    Rect::new(0, table_y, area.width, table_h),
                );
            }

            let footer_y = area.height.saturating_sub(1);
            f.render_widget(
                Paragraph::new("  C copy diagnostic log  ·  Esc / Enter return")
                    .style(Style::default().fg(Color::DarkGray)),
                Rect::new(0, footer_y, area.width, 1),
            );
        })?;
        tick += 1.0;
        if last_tick.elapsed() >= tick_rate { last_tick = Instant::now(); }

        if event::poll(Duration::from_millis(5))? {
            if let Event::Key(KeyEvent { code, kind: KeyEventKind::Press, .. }) = event::read()? {
                match code {
                    KeyCode::Char('c') | KeyCode::Char('C') => {
                        let _ = copy_to_clipboard(&warning_log);
                    }
                    KeyCode::Esc | KeyCode::Enter | KeyCode::Char('q') => return Ok(()),
                    _ => {}
                }
            }
        }
    }
}
```

---

## Scrollable Command Viewer

For non-build commands (tests, linting), run the command to completion then show output in a scrollable view. The viewer picks the palette from the exit status and renders a **mini 4-row banner** above the output box so the screen stays animated:

```rust
fn run_streaming_command(
    terminal: &mut Terminal<CrosstermBackend<io::Stdout>>,
    title: &str,
    args: &[&str],
    anim_style: AnimStyle,
) -> io::Result<()> {
    let output = Command::new(args[0])
        .args(&args[1..])
        .current_dir(".")
        .output()?;

    let exit_ok = output.status.success();
    let stdout_str = String::from_utf8_lossy(&output.stdout);
    let stderr_str = String::from_utf8_lossy(&output.stderr);
    let lines: Vec<String> = stdout_str.lines()
        .chain(stderr_str.lines())
        .map(|l| l.to_string())
        .collect();

    // Palette and title reflect pass/fail
    let palette = if exit_ok { &PALETTE_SUCCESS } else { &PALETTE_ERROR };
    let box_title = if exit_ok { format!(" {} — OK ", title) }
                    else { format!(" {} — FAILED ", title) };

    let mut scroll: usize = 0;
    let mut tick: f64 = 0.0;
    let tick_rate = Duration::from_millis(40);
    let mut last_tick = Instant::now();

    loop {
        let p = palette;
        let bt = box_title.clone();
        let style = anim_style;
        terminal.draw(|f| {
            let area = f.size();

            // Mini 4-row banner at the top
            let mini_rows = 4u16.min(area.height);
            let mini_lines: Vec<Line> = BANNER[..mini_rows as usize]
                .iter()
                .enumerate()
                .map(|(row, &line)| {
                    Line::from(
                        line.chars().enumerate().map(|(col, ch)| {
                            let v = (tick * 0.12 + col as f64 * 0.25 + row as f64 * 0.18).sin();
                            let idx = (v * 2.0).round().abs() as usize;
                            let color = match style {
                                AnimStyle::Pulse => {
                                    let b = (tick * 0.04).sin() * 0.5 + 0.5;
                                    p[((b * 5.0).round() as usize).min(5)]
                                }
                                _ => p[idx % p.len()],
                            };
                            Span::styled(ch.to_string(), Style::default().fg(color))
                        }).collect::<Vec<_>>(),
                    )
                })
                .collect();
            f.render_widget(Paragraph::new(mini_lines), Rect::new(0, 0, area.width, mini_rows));

            // Scrollable output box — colour-codes error/warning/ok lines
            let box_y = mini_rows;
            let box_h = area.height.saturating_sub(box_y + 2);
            if area.height > box_y + 2 {
                let visible = box_h.saturating_sub(2) as usize;
                let display_lines: Vec<Line> = lines.iter()
                    .skip(scroll)
                    .take(visible)
                    .map(|l| {
                        let lower = l.to_lowercase();
                        let color = if lower.contains("error") { Color::LightRed }
                                    else if lower.contains("warning") { Color::Yellow }
                                    else if lower.contains(" ok") || lower.contains("pass") { Color::LightGreen }
                                    else { Color::Reset };
                        Line::from(Span::styled(l.clone(), Style::default().fg(color)))
                    })
                    .collect();
                f.render_widget(
                    Paragraph::new(display_lines)
                        .block(Block::default().title(bt.clone()).borders(Borders::ALL)),
                    Rect::new(0, box_y, area.width, box_h),
                );
            }

            f.render_widget(
                Paragraph::new("  j/k · Up/Down scroll · PgUp/PgDn · C copy · Esc/Enter return")
                    .style(Style::default().fg(Color::DarkGray)),
                Rect::new(0, area.height.saturating_sub(1), area.width, 1),
            );
        })?;

        tick += 1.0;
        if last_tick.elapsed() >= tick_rate { last_tick = Instant::now(); }

        if event::poll(Duration::from_millis(5))? {
            if let Event::Key(KeyEvent { code, kind: KeyEventKind::Press, .. }) = event::read()? {
                match code {
                    KeyCode::Down | KeyCode::Char('j') => {
                        if scroll + 1 < lines.len() { scroll += 1; }
                    }
                    KeyCode::Up | KeyCode::Char('k') => {
                        if scroll > 0 { scroll -= 1; }
                    }
                    KeyCode::PageDown => { scroll = (scroll + 20).min(lines.len().saturating_sub(1)); }
                    KeyCode::PageUp   => { scroll = scroll.saturating_sub(20); }
                    KeyCode::Char('c') | KeyCode::Char('C') => {
                        let _ = copy_to_clipboard(&lines.join("\n"));
                    }
                    KeyCode::Esc | KeyCode::Enter | KeyCode::Char('r') | KeyCode::Char('R') => {
                        return Ok(());
                    }
                    _ => {}
                }
            }
        }
    }
}
```

Note: `run_streaming_command` uses `Command::output()` (blocking) because these are short-running commands (tests, linting) whose output is shown after completion. The live-output ring-buffer pattern is only needed for long build commands where you want real-time feedback.

---

## Clipboard Integration (Windows)

### What "C" copies in each screen

| Screen | What is copied |
|--------|---------------|
| Warning summary (`show_warning_summary`) | Full contents of `build_warnings.log` — all `warning:`/`error:`/`  --> ` lines across every phase, delimited by `=== Component - Phase ===` headers |
| Scrollable command viewer (`run_streaming_command`) | Combined stdout + stderr of the completed command, joined with `\n` |

**Pattern for the summary screen:** Read the log file once before entering the loop so the string is owned and available inside the event handler. Do **not** re-read inside the loop:

```rust
let warning_log = std::fs::read_to_string("build_warnings.log").unwrap_or_default();
// ...
loop {
    // ...render...
    if event::poll(...)? {
        if let Event::Key(KeyEvent { code, kind: KeyEventKind::Press, .. }) = event::read()? {
            match code {
                KeyCode::Char('c') | KeyCode::Char('C') => {
                    let _ = copy_to_clipboard(&warning_log);
                }
                // ...
            }
        }
    }
}
```

**Pattern for the command viewer:** Copy `lines.join("\n")` — the same `Vec<String>` already built from stdout + stderr:

```rust
KeyCode::Char('c') | KeyCode::Char('C') => {
    let _ = copy_to_clipboard(&lines.join("\n"));
}
```

**Footer hints** should always advertise the keybind so users discover it:

```rust
// Warning summary footer:
Paragraph::new("  C copy diagnostic log  ·  Esc / Enter return")

// Command viewer footer:
Paragraph::new("  j/k · Up/Down scroll · C copy · Esc/Enter return")
```

### `copy_to_clipboard` implementation

Pipe text to `Set-Clipboard` via PowerShell's stdin. Use `.take()` to move stdin out of the child. Return `io::Result<()>`:

```rust
fn copy_to_clipboard(text: &str) -> io::Result<()> {
    let mut child = Command::new("powershell")
        .args(["-NoProfile", "-Command", "$input | Set-Clipboard"])
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()?;
    if let Some(mut stdin) = child.stdin.take() {
        let _ = stdin.write_all(text.as_bytes());
    }
    let _ = child.wait();
    Ok(())
}
```

The `$input` automatic variable reads from PowerShell's stdin pipe. Use `.take()` rather than `if let Some(ref mut ...)` — it moves stdin out so the child can detect EOF when the handle is dropped.

---

## Detached Process Launcher

For actions that start the application and immediately return to the menu (i.e. don't need output, don't block), use a fire-and-forget spawn:

```rust
fn run_detached(args: &[&str]) {
    let _ = Command::new(args[0])
        .args(&args[1..])
        .current_dir(".")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn();
}
```

Call it then immediately return `Ok(())` from the sub-menu. Do **not** call `.wait()` — the whole point is that the launched process outlives the CLI.

---

## Sub-Menus

For component-selection sub-menus (e.g. choose which component to build), define component names as a `const` array and reuse the same event-loop skeleton. Pass `anim_style` through so the animation continues:

```rust
const COMPONENT_NAMES: &[&str] = &[
    "All",
    "FrontEnd",
    "Backend",
    "Dashboard",
];

fn show_install_submenu(
    terminal: &mut Terminal<CrosstermBackend<io::Stdout>>,
    anim_style: AnimStyle,
) -> io::Result<()> {
    let mut selected: usize = 0;
    let mut tick: f64 = 0.0;
    let tick_rate = Duration::from_millis(40);
    let mut last_tick = Instant::now();

    loop {
        let style = anim_style;
        terminal.draw(|f| {
            render_banner_with_palette(f, tick, &PALETTE_DEFAULT, style);
            let area = f.size();
            if area.height > MENU_Y {
                let items: Vec<Line> = COMPONENT_NAMES.iter().enumerate().map(|(i, &name)| {
                    if i == selected {
                        Line::from(Span::styled(
                            format!("> Install: {}", name),
                            Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD),
                        ))
                    } else {
                        Line::from(format!("  Install: {}", name))
                    }
                }).collect();
                f.render_widget(
                    Paragraph::new(items),
                    Rect::new(2, MENU_Y, area.width.saturating_sub(4), COMPONENT_NAMES.len() as u16),
                );
            }
            if area.height > STATUS_Y {
                f.render_widget(
                    Paragraph::new("  Arrows / Enter to install · Esc to go back")
                        .style(Style::default().fg(Color::DarkGray)),
                    Rect::new(0, STATUS_Y, area.width, 1),
                );
            }
        })?;
        tick += 1.0;

        let timeout = tick_rate.checked_sub(last_tick.elapsed()).unwrap_or(Duration::ZERO);
        if event::poll(timeout)? {
            if let Event::Key(KeyEvent { code, kind: KeyEventKind::Press, .. }) = event::read()? {
                match code {
                    KeyCode::Up | KeyCode::Char('k') => {
                        if selected > 0 { selected -= 1; } else { selected = COMPONENT_NAMES.len() - 1; }
                    }
                    KeyCode::Down | KeyCode::Char('j') => {
                        selected = (selected + 1) % COMPONENT_NAMES.len();
                    }
                    KeyCode::Esc | KeyCode::Char('q') => return Ok(()),
                    KeyCode::Enter => {
                        run_build_component(terminal, COMPONENT_NAMES[selected], anim_style)?;
                    }
                    _ => {}
                }
            }
        }
        if last_tick.elapsed() >= tick_rate { last_tick = Instant::now(); }
    }
}
```

For launch sub-menus that fire a detached process:

```rust
fn show_launch_submenu(
    terminal: &mut Terminal<CrosstermBackend<io::Stdout>>,
    anim_style: AnimStyle,
) -> io::Result<()> {
    const LAUNCH_ITEMS: &[&str] = &["Launch App", "Back"];
    // ... same event loop skeleton ...
    // On Enter match 0: run_detached(&["pwsh", "-NoProfile", "-File", "scripts/launch.ps1"]); return Ok(())
    // On Enter match _: return Ok(())
}
```

---

## Action Dispatch

Pass `anim_style` through to every action so the animation style persists across sub-screens:

```rust
fn handle_action(
    terminal: &mut Terminal<CrosstermBackend<io::Stdout>>,
    action: usize,
    anim_style: AnimStyle,
) -> io::Result<()> {
    match action {
        0 => show_install_submenu(terminal, anim_style)?,
        1 => run_streaming_command(
            terminal, "Run Tests",
            &["pwsh", "-NoProfile", "-File", "scripts/test.ps1"],
            anim_style,
        )?,
        2 => show_launch_submenu(terminal, anim_style)?,
        3 => run_streaming_command(
            terminal, "QML Lint",
            &["pwsh", "-NoProfile", "-File", "scripts/qmllint.ps1"],
            anim_style,
        )?,
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
Crossterm on Windows emits both `Press` and `Release` events. Every single `event::read()` match must filter `kind: KeyEventKind::Press`. Missing this on even one event loop (main menu, sub-menus, build viewer, streaming viewer) causes double-firing.

### 3. Never Use `Command::output()` for Long Tasks
`output()` blocks the entire thread until the process exits. The UI freezes completely. Use `Stdio::piped()` + background threads + `mpsc::channel` for any command that takes more than ~1 second. `Command::output()` is acceptable only for short-running commands (tests, linting) where you collect output after completion.

### 4. Use `recv_timeout()`, Not `recv()`
`recv()` blocks until a line arrives. If the subprocess pauses output (e.g. Rust linking a large crate), the banner animation freezes. `recv_timeout(40ms)` ensures the render loop runs at a consistent framerate.

### 5. Diagnostic Capture: `starts_with` Not `contains`
`lower.contains("warning")` fires on `"Build finished. No warnings."`, `"0 warnings emitted"`, etc. Use `tl.starts_with("warning:")` / `tl.starts_with("warning[")` to capture only genuine rustc/cargo/qmllint diagnostic lines. Also captures `"  --> "` for source location context lines.

### 6. Use PhaseResult Instead of Log File Parsing for Summary
Accumulate `PhaseResult` structs during the build run. Pass the slice to `show_warning_summary`. Avoids fragile log-file prefix parsing and gives accurate per-phase counts for the summary `Table`.

### 7. Slowed-Down Tick Multipliers (Animation Speed)
The original `tick * 0.4` was too fast — characters cycle through colours faster than the eye tracks. Use `tick * 0.12` for Wave, `tick * 0.04` for Pulse, `tick * 0.18` for Scan, `tick * 0.08` for Sparkle. The difference is immediately visible.

### 8. AnimStyle Enum for Live-Switchable Styles
An enum is cleaner than a `u8` mode flag. The `next()`/`prev()` methods keep Tab/Shift+Tab cycling symmetrical. Pass `style` through as a `Copy` value — snapshot it before `terminal.draw()` closure so borrow checker doesn't complain about `anim_style` being used inside the closure.

### 9. VecDeque for Live Output Ring-Buffer
`VecDeque<String>` with a capacity cap (pop_front when > 6) is the right data structure for the scrolling live log box. Clone a snapshot before `terminal.draw()` so the render closure owns its data.

### 10. Gauge Colour Reflects Current Severity
Change `gauge_color` dynamically: `Color::Red` if any errors, `Color::Yellow` if warnings only, `Color::Cyan` for clean. Users see build health at a glance without reading counters.

### 11. build.rs Isolation for Multi-Binary Projects
If the project has a complex `build.rs` (CxxQt, protobuf, etc.), gate it with `CARGO_BIN_NAME` so the CLI binary doesn't require the full toolchain. Without this, `cargo build --bin my-cli` will fail if Qt/protobuf isn't installed.

### 12. TerminalGuard for Panic Safety
If the program panics without restoring the terminal, the user's shell is left in raw mode with no cursor. The `Drop`-based guard ensures cleanup happens on every exit path including panics.

### 13. Build Script for Quick Iteration
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

### 14. Detached Launch Must Not Call `.wait()`
`run_detached` spawns the app and returns immediately. If you call `.wait()`, the CLI blocks until the launched app exits — the opposite of what you want.

### 15. Line-Only Progress Stalls on Rust Linking
The formula `lines_read.min(300)/300 * 99%` freezes at ~4% during Rust linking because the linker produces almost no stdout/stderr output for minutes at a time. Fix: use `max(line_pct, time_pct)` computed every tick (not just inside the `Ok(line)` arm), where `time_pct` estimates 300 seconds per phase. Also move the progress update outside the match so it advances on every tick even when the channel times out.

### 16. Cancel Must Use `Duration::ZERO` Poll, Not Blocking Read
`event::read()` blocks until an event arrives — calling it unconditionally inside the render loop freezes the animation waiting for input. Use `event::poll(Duration::ZERO)` first: if it returns `true` there is an event ready to consume; if `false`, skip. This keeps the loop non-blocking and the animation smooth.

### 17. Render `Clear` First on Every Frame (CRITICAL)
Ratatui only writes cells that differ from the previous frame. When switching screens (e.g. main menu → build phase → summary), **stale cells from the previous screen remain visible** in any area the new screen doesn't explicitly overwrite. Symptoms: truncated strings from prior renders appended to current text, old gauge labels showing inside new gauges, ANSI-looking fragments in row tails.

Fix: always render `Clear` as the **very first widget** in every `terminal.draw()` closure:

```rust
use ratatui::widgets::Clear;

terminal.draw(|f| {
    f.render_widget(Clear, f.size());   // ← must be first
    render_banner_with_palette(f, tick, palette, style);
    // ... other widgets
})?;
```

Ratatui's cell diffing means `Clear` only touches cells that were non-blank, so there is **no flickering penalty**. Apply this to every `terminal.draw()` call in the program — main menu, sub-menus, build phase, summary screen, streaming viewer.

## Checklist for New CLI

1. [ ] Add `crossterm` + `ratatui` to `[dependencies]`
2. [ ] Add `[[bin]]` entry in Cargo.toml
3. [ ] Gate `build.rs` with `CARGO_BIN_NAME` check (if project has complex build.rs)
4. [ ] Create `src/main.rs` (or `src/bin/cli.rs`) with `TerminalGuard` + input drain
5. [ ] Add `AnimStyle` enum with `next()`/`prev()`/`name()` + `prng()` helper
6. [ ] Define banner `const` with raw string literals, palettes, and layout constants
7. [ ] Implement `render_banner_with_palette(f, tick, palette, style)` with all 4 styles
8. [ ] Implement `render_animated_banner(f, tick, style)` wrapper
9. [ ] Implement main menu loop with `anim_style` state, Tab/BackTab cycling, hint text
10. [ ] Ensure `KeyEventKind::Press` filter on **every** event loop
11. [ ] Define `PhaseResult` struct
12. [ ] Implement `component_build_plan()` helper mapping component → phases
13. [ ] Implement `run_build_component()` with "All" support + `PhaseResult` accumulation
14. [ ] Implement `run_build_phase()` with mpsc streaming, `VecDeque` ring-buffer, phase detection, `starts_with` diagnostics, elapsed timer, `max(line_pct, time_pct)` progress formula, severity-aware gauge, Esc/Q cancel support
15. [ ] Implement `show_warning_summary()` with `Table` widget, `PhaseResult` slice, C-to-copy
16. [ ] Implement `run_streaming_command()` with mini banner, exit-status palette, output colourisation
17. [ ] Implement `copy_to_clipboard()` returning `io::Result<()>` using `.take()`
18. [ ] Implement `run_detached()` for fire-and-forget process launching
19. [ ] Implement sub-menus passing `anim_style` through
20. [ ] Implement `handle_action()` passing `anim_style` through to all actions
21. [ ] Create `build-cli.ps1` convenience script
22. [ ] Test: banner animates, Tab cycles styles, menu navigates, build streams output, live log updates, summary shows table, clipboard works, Quit restores terminal
23. [ ] Add `f.render_widget(Clear, f.size())` as the first call in **every** `terminal.draw()` closure
