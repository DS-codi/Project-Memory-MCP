---
name: rust-animated-cli
description: "Use this skill when building animated interactive CLI launchers in Rust using crossterm + ratatui. Covers project setup with build.rs isolation, TerminalGuard for safe cleanup, tachyonfx-powered animations (Wave/Pulse/Scan/Sparkle) with EffectManager, ratatui-explorer for interactive directory selection, keyboard-driven menus, phase-based build orchestration, real-time build progress with mpsc channel streaming, live output ring-buffer, precise starts_with diagnostic capture, Table-based warning summary, scrollable command output viewers, detached process launching, clipboard integration, and auto-saving logs to file."
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
    - tachyonfx
    - ratatui-explorer
    - windows
  language_targets:
    - rust
  framework_targets:
    - crossterm
    - ratatui
    - tachyonfx
    - ratatui-explorer
---

# Animated Interactive Rust CLI (crossterm + ratatui + tachyonfx)

An interactive terminal launcher for multi-component projects, upgraded for modern Ratatui. Provides a multi-style animated ASCII banner powered by `tachyonfx`, an interactive file explorer via `ratatui-explorer`, keyboard-driven menu navigation, phase-based build orchestration with per-phase diagnostics, real-time progress streaming, log persistence, and clipboard support.

## When to Use This Skill

- Creating a visually polished developer CLI that wraps build/test/launch operations
- When you want "shader-like" animated feedback during long build processes
- When you need an interactive UI for choosing installation or deployment directories
- When you want a native compiled binary with advanced logging and clipboard integration
- When targeting modern terminals with high-quality character support

---

## Dependencies

```toml
[dependencies]
crossterm = { version = "0.27", features = ["event-stream"] }
ratatui = "0.30"
tachyonfx = "0.25"
ratatui-explorer = "0.3"
```

The binary should be self-contained and isolated from the main project's heavy toolchain dependencies.

---

## Imports

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
    widgets::{Block, Borders, Clear, Paragraph, Row, Table, WidgetRef},
    Terminal,
};
use tachyonfx::{fx, Effect, EffectManager, Interpolation, RepeatMode, Shader};
use ratatui_explorer::{FileExplorerBuilder, Theme};
use std::collections::VecDeque;
use std::fs::OpenOptions;
use std::io::{self, BufRead, BufReader, Write};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};
```

---

## Terminal Setup & Safety

### TerminalGuard (Drop-based cleanup)

**Always** use a Drop guard to ensure the terminal is restored (raw mode disabled, alternate screen left) even on panics.

```rust
struct TerminalGuard;
impl Drop for TerminalGuard {
    fn drop(&mut self) {
        let _ = terminal::disable_raw_mode();
        let _ = execute!(io::stdout(), cursor::Show, terminal::LeaveAlternateScreen);
    }
}
```

### Input Draining

Draining stale input (like the Enter key used to launch the app) is critical to prevent immediate menu activation.

```rust
while event::poll(Duration::from_millis(50))? {
    let _ = event::read()?;
}
```

---

## ASCII Banner Animation (tachyonfx)

### EffectManager Pattern

In `tachyonfx` 0.25+, use an `EffectManager` to store and process active effects across frames.

```rust
struct EffectManager {
    effects: Vec<Effect>,
}

impl EffectManager {
    fn default() -> Self { Self { effects: Vec::new() } }
    fn add_effect(&mut self, effect: Effect) { self.effects.push(effect); }
    fn process_effects(&mut self, duration: Duration, buf: &mut ratatui::buffer::Buffer, area: Rect) {
        for effect in &mut self.effects {
            let _ = effect.process(duration.into(), buf, area);
        }
    }
}
```

### Effect Definitions (DSL)

```rust
fn get_effect_for_style(style: AnimStyle) -> Effect {
    match style {
        AnimStyle::Wave => fx::repeat(
            fx::hsl_shift(Some([0.0, 360.0, 0.0]), None, (3000, Interpolation::Linear)),
            RepeatMode::Forever,
        ),
        AnimStyle::Pulse => fx::repeat(
            fx::ping_pong(fx::fade_to(Color::Cyan, Color::Blue, (1000, Interpolation::SineInOut))),
            RepeatMode::Forever,
        ),
        AnimStyle::Scan => fx::repeat(
            fx::ping_pong(fx::fade_to(Color::White, Color::DarkGray, (1500, Interpolation::Linear))),
            RepeatMode::Forever,
        ),
        AnimStyle::Sparkle => fx::repeat(
            fx::fade_to(Color::White, Color::DarkGray, (500, Interpolation::CubicIn)),
            RepeatMode::Forever,
        ),
    }
}
```

---

## Interactive File Explorer (ratatui-explorer)

Use `ratatui-explorer` for directory selection. Note the use of `WidgetRef` and `render_ref` for rendering the internal widget.

```rust
pub fn prompt_install_dir(current: &std::path::Path) -> Option<std::path::PathBuf> {
    // ... terminal setup ...
    let theme = Theme::default()
        .theme(Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD));
    
    let mut explorer = FileExplorerBuilder::default()
        .theme(theme)
        .build().ok()?;

    if current.exists() { let _ = explorer.set_cwd(current); }

    loop {
        terminal.draw(|f| {
            f.render_widget(Clear, f.area());
            // ... layout ...
            explorer.widget().render_ref(chunks[1], f.buffer_mut());
        })?;

        if let Ok(Event::Key(key)) = event::read() {
            if key.kind != KeyEventKind::Press { continue; }
            match key.code {
                KeyCode::Esc => break,
                KeyCode::Enter => return Some(explorer.cwd().to_path_buf()),
                _ => { let _ = explorer.handle(&Event::Key(key)); }
            }
        }
    }
    None
}
```

---

## Logging & Clipboard Integration

### Save Logs to File

Generate timestamped logs for build sessions.

```rust
fn save_logs_to_file(text: &str) -> io::Result<String> {
    use std::time::{SystemTime, UNIX_EPOCH};
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs();
    let filename = format!("pm-log-{}.txt", now);
    std::fs::write(&filename, text)?;
    Ok(filename)
}
```

### Clipboard (Windows PowerShell)

```rust
fn copy_to_clipboard(text: &str) -> io::Result<()> {
    let mut child = Command::new("powershell")
        .args(["-NoProfile", "-Command", "$input | Set-Clipboard"])
        .stdin(Stdio::piped()).spawn()?;
    if let Some(mut stdin) = child.stdin.take() {
        let _ = stdin.write_all(text.as_bytes());
    }
    let _ = child.wait();
    Ok(())
}
```

---

## Lessons Learned / Gotchas

### 1. `f.area()` over `f.size()`
In Ratatui 0.30+, `f.size()` is deprecated. Use `f.area()` to get the current frame dimensions.

### 2. WidgetRef and `render_ref`
Many modern widgets (like those in `ratatui-explorer`) implement `WidgetRef`. Call `render_ref(area, f.buffer_mut())` if `render_widget` complains about trait bounds.

### 3. Duration Conversion for tachyonfx
`tachyonfx::Effect::process` expects its own `Duration` type. Convert standard library durations using `.into()`: `effect.process(elapsed.into(), buf, area)`.

### 4. RepeatMode Import
`RepeatMode` is located in `tachyonfx::fx::RepeatMode`.

### 5. Render `Clear` First
Always call `f.render_widget(Clear, f.area())` as the first step in `terminal.draw`. This prevents visual artifacts (stale cells) when switching between screens.

### 6. Precise Diagnostic Capture
Use `starts_with("warning:")` or `starts_with("error:")` to avoid false positives from lines like "0 warnings found".

---

## Checklist for New CLI

1. [ ] Upgrade Rust to latest stable (`rustup update stable`).
2. [ ] Add `ratatui`, `tachyonfx`, and `ratatui-explorer` to dependencies.
3. [ ] Implement `TerminalGuard` for safe cleanup.
4. [ ] Drain input buffer before the main loop.
5. [ ] Use `EffectManager` to handle `tachyonfx` animations.
6. [ ] Update all `f.size()` calls to `f.area()`.
7. [ ] Implement `FileExplorerBuilder` for directory prompts.
8. [ ] Wire **`C`** key for "Copy to Clipboard" using PowerShell.
9. [ ] Wire **`S`** key for "Save Logs to File" with timestamps.
10. [ ] Ensure `KeyEventKind::Press` filter is on **all** event loops.
11. [ ] Add `Clear` as the first widget in every frame.
12. [ ] Use `max(line_pct, time_pct)` for progress gauges to prevent stalls during linking.
