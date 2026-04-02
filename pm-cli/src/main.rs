mod command_registry;
mod fallback;

use command_registry::CommandRegistry;
use fallback::powershell::PowerShellFallback;

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
    widgets::{Block, Borders, Cell, Clear, Gauge, Paragraph, Row, Table},
    Terminal,
};
use std::collections::VecDeque;
use std::fs::OpenOptions;
use std::io::{self, BufRead, BufReader, Write};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

// ─── Banner ──────────────────────────────────────────────────────────────────

const BANNER: &[&str] = &[
    r"  ____  __  __     ____  _     ___  ",
    r" |  _ \|  \/  |   / ___|| |   |_ _| ",
    r" | |_) | |\/| |  | |    | |    | |  ",
    r" |  __/| |  | |  | |___ | |___ | |  ",
    r" |_|   |_|  |_|   \____||_____|___| ",
    r"",
    r"  Project Memory MCP — command line launcher",
];

const PALETTE_DEFAULT: [Color; 6] = [Color::White, Color::Cyan, Color::Blue, Color::DarkGray, Color::Green, Color::LightGreen];
const PALETTE_SUCCESS: [Color; 6] = [Color::Green, Color::LightGreen, Color::Cyan, Color::Green, Color::LightGreen, Color::White];
const PALETTE_WARN:    [Color; 6] = [Color::Yellow, Color::LightYellow, Color::White, Color::Yellow, Color::LightYellow, Color::DarkGray];
const PALETTE_ERROR:   [Color; 6] = [Color::Red, Color::LightRed, Color::Yellow, Color::Red, Color::LightRed, Color::DarkGray];

// ─── Animation Style ─────────────────────────────────────────────────────────

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

/// Deterministic pseudo-random f64 in [0,1) from a u64 seed. No external crates needed.
fn prng(seed: u64) -> f64 {
    let mut x = seed.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
    x ^= x >> 33;
    x = x.wrapping_mul(0xff51afd7ed558ccd);
    x ^= x >> 33;
    x = x.wrapping_mul(0xc4ceb9fe1a85ec53);
    x ^= x >> 33;
    (x as f64) / (u64::MAX as f64)
}

// ─── Layout constants ────────────────────────────────────────────────────────

const MENU_Y:   u16 = 9;
const STATUS_Y: u16 = 18;

// ─── Menu / Component definitions ────────────────────────────────────────────

const MENU_ITEMS: &[&str] = &[
    "Install Components",
    "Test Components",
    "Launch Application",
    "Lint QML Files",
    "Stream Command Output",
    "Quit",
];

const COMPONENT_NAMES: &[&str] = &[
    "All",
    "Supervisor",
    "GuiForms",
    "InteractiveTerminal",
    "Server",
    "FallbackServer",
    "Dashboard",
    "Extension",
    "Cartographer",
    "Mobile",
    "Container",
];

// ─── Terminal cleanup guard ───────────────────────────────────────────────────

struct TerminalGuard;
impl Drop for TerminalGuard {
    fn drop(&mut self) {
        let _ = terminal::disable_raw_mode();
        let _ = execute!(io::stdout(), cursor::Show, terminal::LeaveAlternateScreen);
    }
}

// ─── Entry point ─────────────────────────────────────────────────────────────

fn main() -> io::Result<()> {
    // CLI dispatch mode — entered when pm-cli is invoked with arguments.
    // run_native_streaming re-invokes this binary with a subcommand so the TUI can stream
    // output through run_build_phase without launching the interactive UI.
    let cli_args: Vec<String> = std::env::args().skip(1).collect();
    if !cli_args.is_empty() {
        let code = CommandRegistry::dispatch(&cli_args[0], &cli_args[1..]);
        std::process::exit(code);
    }

    // TUI launcher mode
    terminal::enable_raw_mode()?;
    let mut stdout = io::stdout();
    execute!(stdout, terminal::EnterAlternateScreen, cursor::Hide)?;
    let backend = CrosstermBackend::new(stdout);
    let mut term = Terminal::new(backend)?;
    let _guard = TerminalGuard;

    // Drain the Enter that launched us (prevents double-fire on Windows)
    while event::poll(Duration::from_millis(50))? {
        let _ = event::read()?;
    }

    run_app(&mut term)
}

// ─── Banner renderer ──────────────────────────────────────────────────────────

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
                            // Slowed-down sine wave (tick 0.12, col 0.25, row 0.18)
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
                            // A bright scanline sweeps downward through the banner
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
                            // Dim wave base with random character flares
                            let v = (tick * 0.08 + col as f64 * 0.2 + row as f64 * 0.15).sin();
                            let base_idx = ((v * 2.0).round().abs() as usize + 3) % palette.len();
                            let seed = row as u64 * 997 + col as u64 + tick_bin * 137;
                            if prng(seed) < 0.04 {
                                Color::White
                            } else {
                                palette[base_idx]
                            }
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

// ─── Main application loop ────────────────────────────────────────────────────

fn run_app(terminal: &mut Terminal<CrosstermBackend<io::Stdout>>) -> io::Result<()> {
    let mut tick: f64 = 0.0;
    let tick_rate = Duration::from_millis(40);
    let mut selected: usize = 0;
    let mut last_tick = Instant::now();
    let mut anim_style = AnimStyle::Wave;

    loop {
        let style = anim_style;
        terminal.draw(|f| {
            f.render_widget(Clear, f.size());
            render_animated_banner(f, tick, style);
            let area = f.size();

            // Menu items
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

            // Help + anim style hint
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
                    KeyCode::Tab => { anim_style = anim_style.next(); }
                    KeyCode::BackTab => { anim_style = anim_style.prev(); }
                    KeyCode::Char('q') | KeyCode::Char('Q') | KeyCode::Esc => return Ok(()),
                    KeyCode::Enter => {
                        if selected == MENU_ITEMS.len() - 1 {
                            return Ok(());
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

// ─── Action dispatcher ────────────────────────────────────────────────────────

fn handle_action(
    terminal: &mut Terminal<CrosstermBackend<io::Stdout>>,
    action: usize,
    anim_style: AnimStyle,
) -> io::Result<()> {
    match action {
        0 => show_install_submenu(terminal, anim_style)?,
        1 => {
            // Test Components — PowerShell fallback (not yet ported to native)
            let args = PowerShellFallback::build_args("scripts/test.ps1", &[]);
            let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
            run_streaming_command(terminal, "Run Tests", &refs, anim_style)?;
        }
        2 => show_launch_submenu(terminal, anim_style)?,
        3 => {
            // Lint QML Files — PowerShell fallback (not yet ported to native)
            let args = PowerShellFallback::build_args("scripts/qmllint.ps1", &[]);
            let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
            run_streaming_command(terminal, "QML Lint", &refs, anim_style)?;
        }
        4 => {
            // Stream Command Output — demonstrates run_native_streaming.
            // Once a command has a native handler in CommandRegistry, wire it here
            // using: run_native_streaming(terminal, "label", "cmd", &[args], anim_style)
            let args = PowerShellFallback::build_args("scripts/cli-qmllint.ps1", &["-Component", "all"]);
            let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
            run_streaming_command(terminal, "QML Lint (all)", &refs, anim_style)?;
        }
        _ => {}
    }
    Ok(())
}

// ─── Install sub-menu ─────────────────────────────────────────────────────────

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
            f.render_widget(Clear, f.size());
            render_banner_with_palette(f, tick, &PALETTE_DEFAULT, style);
            let area = f.size();

            if area.height > MENU_Y {
                let items: Vec<Line> = COMPONENT_NAMES
                    .iter()
                    .enumerate()
                    .map(|(i, &name)| {
                        if i == selected {
                            Line::from(Span::styled(
                                format!("> Install: {}", name),
                                Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD),
                            ))
                        } else {
                            Line::from(format!("  Install: {}", name))
                        }
                    })
                    .collect();
                f.render_widget(
                    Paragraph::new(items),
                    Rect::new(2, MENU_Y, area.width.saturating_sub(4), COMPONENT_NAMES.len() as u16),
                );
            }
            if area.height > STATUS_Y + 2 {
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
                        let component = COMPONENT_NAMES[selected];
                        run_build_component(terminal, component, anim_style)?;
                    }
                    _ => {}
                }
            }
        }
        if last_tick.elapsed() >= tick_rate { last_tick = Instant::now(); }
    }
}

// ─── Phase results (accumulated during a multi-phase build) ──────────────────

struct PhaseResult {
    component:  String,
    phase:      String,
    warn_count: usize,
    err_count:  usize,
}


// ─── Build / install a component ─────────────────────────────────────────────

fn run_build_component(
    terminal: &mut Terminal<CrosstermBackend<io::Stdout>>,
    component: &str,
    anim_style: AnimStyle,
) -> io::Result<()> {
    // Truncate the warning log for a fresh build session.
    let _ = std::fs::write("build_warnings.log", "");

    let sub_components: Vec<&str> = if component == "All" {
        vec!["Supervisor", "GuiForms", "InteractiveTerminal", "Server", "Dashboard", "Extension", "Cartographer"]
    } else {
        vec![component]
    };

    let mut results: Vec<PhaseResult> = Vec::new();

    for comp in &sub_components {
        let phases = CommandRegistry::build_phases(comp);
        for (phase_label, args) in &phases {
            let section_header = format!("{} - {}", comp, phase_label);
            let (warns, errs) = run_build_phase(terminal, &section_header, args, anim_style)?;
            results.push(PhaseResult {
                component:  comp.to_string(),
                phase:      phase_label.clone(),
                warn_count: warns,
                err_count:  errs,
            });
        }
    }

    show_warning_summary(terminal, &results, anim_style)?;
    Ok(())
}

fn run_build_phase(
    terminal: &mut Terminal<CrosstermBackend<io::Stdout>>,
    section_header: &str,
    args: &[String],
    anim_style: AnimStyle,
) -> io::Result<(usize, usize)> {
    if args.is_empty() { return Ok((0, 0)); }

    // Append section header to warning log so each phase is clearly delimited.
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
    let mut live_log: VecDeque<String> = VecDeque::new();
    let mut current_phase = String::from("Initialising…");
    let mut done = false;
    let mut cancelled = false;
    let mut progress: u16 = 0;

    loop {
        // Process one pending line per tick (keeps UI responsive)
        match rx.recv_timeout(tick_rate) {
            Ok(line) => {
                lines_read += 1;
                let lower = line.to_lowercase();

                // Phase detection — updates the sub-line shown under the header
                let phase_keys = ["compiling", "installing", "building", "linking",
                                   "packaging", "bundling", "generating", "running",
                                   "finished", "info:"];
                for key in &phase_keys {
                    if lower.contains(key) {
                        let trimmed = line.trim().chars().take(65).collect::<String>();
                        if !trimmed.is_empty() { current_phase = trimmed; }
                        break;
                    }
                }

                // Diagnostic capture: rustc / cargo / qmllint / tsc / TypeScript diagnostics.
                // starts_with guards prevent counting status messages that mention
                // "warning" mid-sentence (e.g. install wrappers, progress lines).
                // tsc format:  src/file.ts(10,5): error TS2304: ...
                //             src/file.ts(10,5): warning TS6133: ...
                let tl = line.trim().to_lowercase();
                let is_tsc_err  = tl.contains("): error ts");
                let is_tsc_warn = tl.contains("): warning ts");
                let is_diag = tl.starts_with("warning:")
                    || tl.starts_with("warning[")
                    || tl.starts_with("error:")
                    || tl.starts_with("error[")
                    || tl.starts_with("-->")    // rustc source location context (trimmed from "  --> ")
                    || is_tsc_err
                    || is_tsc_warn;
                let is_fp = tl.contains("no warning")
                    || tl.contains("0 warning")
                    || tl.contains("no error");
                if is_diag && !is_fp {
                    if tl.starts_with("error") || is_tsc_err { err_count += 1; }
                    else if tl.starts_with("warning") || is_tsc_warn { warn_count += 1; }
                    let _ = writeln!(log_file, "{}", line.trim());
                }

                // Live output ring-buffer (6 lines)
                let line_color_tag = if tl.starts_with("error") || is_tsc_err { "E" }
                                     else if tl.starts_with("warning") || is_tsc_warn { "W" }
                                     else { " " };
                let tagged = format!("{} {}", line_color_tag, line);
                live_log.push_back(tagged);
                if live_log.len() > 6 { live_log.pop_front(); }

                // Progress updated below after the match (time-based fallback)
            }
            Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => { done = true; }
            Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {}
        }

        // Progress: max(line-based, time-based) so long linking phases don't stall at ~4%.
        // Line estimate: ~200 lines per phase. Time estimate: ~300 s per phase.
        if !done {
            let elapsed_secs = start_time.elapsed().as_secs();
            let line_pct = ((lines_read.min(200) as f64 / 200.0) * 99.0) as u16;
            let time_pct = (elapsed_secs.min(300) as f64 / 300.0 * 99.0) as u16;
            progress = line_pct.max(time_pct);
        }

        // Render frame
        let elapsed = start_time.elapsed();
        let elapsed_str = format!("{:02}:{:02}", elapsed.as_secs() / 60, elapsed.as_secs() % 60);
        let phase_snap = current_phase.clone();
        let live_snap: Vec<String> = live_log.iter().cloned().collect();
        let wc = warn_count;
        let ec = err_count;
        let lc = lines_read;
        let prog = if done { 100 } else { progress };
        let style = anim_style;
        let is_cancelled = cancelled;
        let hdr = format!("  \u{25b6} {}   \u{23f1} {}", section_header, elapsed_str);

        terminal.draw(|f| {
            f.render_widget(Clear, f.size());
            render_banner_with_palette(f, tick, &PALETTE_DEFAULT, style);
            let area = f.size();
            let start_y = BANNER.len() as u16 + 1;

            // ── Header ──────────────────────────────────────────────
            if area.height > start_y {
                f.render_widget(
                    Paragraph::new(hdr.clone()).style(Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD)),
                    Rect::new(0, start_y, area.width, 1),
                );
            }

            // ── Current phase ────────────────────────────────────────
            let phase_y = start_y + 1;
            if area.height > phase_y {
                f.render_widget(
                    Paragraph::new(format!("  {}", phase_snap))
                        .style(Style::default().fg(Color::White)),
                    Rect::new(0, phase_y, area.width, 1),
                );
            }

            // ── Live output box (6 rows + border = 8) ────────────────
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
                    Paragraph::new(log_lines).block(
                        Block::default().title(" Live output ").borders(Borders::ALL)
                    ),
                    Rect::new(0, box_y, area.width, box_h),
                );
            }

            // ── Counts row ───────────────────────────────────────────
            let counts_y = box_y + box_h;
            if area.height > counts_y {
                let counts = format!("  Warnings: {}   Errors: {}   Lines read: {}", wc, ec, lc);
                f.render_widget(
                    Paragraph::new(counts).style(Style::default().fg(Color::DarkGray)),
                    Rect::new(0, counts_y, area.width, 1),
                );
            }

            // ── Progress gauge ───────────────────────────────────────
            let gauge_y = counts_y + 1;
            if area.height > gauge_y {
                let gauge_color = if is_cancelled { Color::DarkGray }
                                  else if ec > 0 { Color::Red }
                                  else if wc > 0 { Color::Yellow }
                                  else { Color::Cyan };
                let gauge_label = if is_cancelled {
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
                        .label(gauge_label),
                    Rect::new(0, gauge_y, area.width, 1),
                );
            }

            // ── Cancel hint ──────────────────────────────────────────
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

        // Check for cancel keypress (non-blocking)
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

    let _ = child.wait(); // may already be dead (cancelled or finished)
    if cancelled {
        std::thread::sleep(Duration::from_millis(200));
        return Ok((warn_count, err_count));
    }
    std::thread::sleep(Duration::from_millis(400));
    Ok((warn_count, err_count))
}

// ─── Native streaming helper ─────────────────────────────────────────────────
//
// Re-invokes this binary as a CLI command so the TUI can stream its output through
// run_build_phase. Use this once a command has a native handler in CommandRegistry —
// it routes through the registry instead of calling a PowerShell script directly.
//
// Usage (Phase 2+, after porting a command):
//   run_native_streaming(terminal, "Supervisor — Rust Build", "install", &["supervisor"], style)
//
#[allow(dead_code)]
fn run_native_streaming(
    terminal: &mut Terminal<CrosstermBackend<io::Stdout>>,
    section_header: &str,
    cmd: &str,
    extra_args: &[&str],
    anim_style: AnimStyle,
) -> io::Result<(usize, usize)> {
    let exe = std::env::current_exe()?;
    let mut args = vec![exe.to_string_lossy().to_string(), cmd.to_string()];
    args.extend(extra_args.iter().map(|s| s.to_string()));
    run_build_phase(terminal, section_header, &args, anim_style)
}

// ─── Warning summary screen ───────────────────────────────────────────────────

fn show_warning_summary(
    terminal: &mut Terminal<CrosstermBackend<io::Stdout>>,
    results: &[PhaseResult],
    anim_style: AnimStyle,
) -> io::Result<()> {
    if results.is_empty() { return Ok(()); }

    let has_error = results.iter().any(|r| r.err_count > 0);
    let total: usize = results.iter().map(|r| r.warn_count + r.err_count).sum();
    let warning_log = std::fs::read_to_string("build_warnings.log").unwrap_or_default();
    let palette = if has_error { &PALETTE_ERROR } else if total > 0 { &PALETTE_WARN } else { &PALETTE_SUCCESS };

    let mut tick: f64 = 0.0;
    let tick_rate = Duration::from_millis(40);
    let mut last_tick = Instant::now();

    loop {
        let p = palette;
        let style = anim_style;

        terminal.draw(|f| {
            f.render_widget(Clear, f.size());
            render_banner_with_palette(f, tick, p, style);
            let area = f.size();
            let start_y = BANNER.len() as u16 + 1;

            let header_text = if has_error {
                "  Build finished with ERRORS"
            } else if total > 0 {
                "  Build finished with warnings"
            } else {
                "  Build finished -- clean!"
            };
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
                ]).height(1);

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
                let table = Table::new(
                    rows,
                    [
                        Constraint::Percentage(32),
                        Constraint::Percentage(30),
                        Constraint::Percentage(18),
                        Constraint::Percentage(20),
                    ],
                )
                .header(header_row)
                .block(Block::default().title(" Build Summary ").borders(Borders::ALL));

                f.render_widget(table, Rect::new(0, table_y, area.width, table_h));
            }

            let footer_y = area.height.saturating_sub(1);
            f.render_widget(
                Paragraph::new("  C copy diagnostic log  .  Esc / Enter return")
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
// ─── Scrollable command output viewer ────────────────────────────────────────

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
    let lines: Vec<String> = stdout_str
        .lines()
        .chain(stderr_str.lines())
        .map(|l| l.to_string())
        .collect();

    let palette = if exit_ok { &PALETTE_SUCCESS } else { &PALETTE_ERROR };
    let box_title = if exit_ok {
        format!(" {} — OK ", title)
    } else {
        format!(" {} — FAILED ", title)
    };

    let mut scroll: usize = 0;
    let mut tick: f64 = 0.0;
    let tick_rate = Duration::from_millis(40);
    let mut last_tick = Instant::now();

    loop {
        let p = palette;
        let bt = box_title.clone();
        let style = anim_style;
        terminal.draw(|f| {
            f.render_widget(Clear, f.size());
            let area = f.size();
            // Mini 4-row banner at top
            let mini_rows = 4u16.min(area.height);
            let mini_lines: Vec<Line> = BANNER[..mini_rows as usize]
                .iter()
                .enumerate()
                .map(|(row, &line)| {
                    Line::from(
                        line.chars()
                            .enumerate()
                            .map(|(col, ch)| {
                                let v = (tick * 0.12 + col as f64 * 0.25 + row as f64 * 0.18).sin();
                                let idx = (v * 2.0).round().abs() as usize;
                                let color = match style {
                                    AnimStyle::Pulse => {
                                        let b = (tick * 0.04).sin() * 0.5 + 0.5;
                                        let i2 = (b * 5.0).round() as usize;
                                        p[i2.min(5)]
                                    }
                                    _ => p[idx % p.len()],
                                };
                                Span::styled(ch.to_string(), Style::default().fg(color))
                            })
                            .collect::<Vec<_>>(),
                    )
                })
                .collect();
            f.render_widget(Paragraph::new(mini_lines), Rect::new(0, 0, area.width, mini_rows));

            // Scrollable output box below mini banner
            let box_y = mini_rows;
            let box_h = area.height.saturating_sub(box_y + 2);
            if area.height > box_y + 2 {
                let visible_height = box_h.saturating_sub(2) as usize;
                let display_lines: Vec<Line> = lines.iter()
                    .skip(scroll)
                    .take(visible_height)
                    .map(|l| {
                        let lower = l.to_lowercase();
                        let color = if lower.contains("error") { Color::LightRed }
                                    else if lower.contains("warning") { Color::Yellow }
                                    else if lower.contains(" ok") || lower.contains("pass") || lower.starts_with("finished") { Color::LightGreen }
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

            // Footer
            let footer_y = area.height.saturating_sub(1);
            f.render_widget(
                Paragraph::new("  j/k · Up/Down scroll · C copy · Esc/Enter return")
                    .style(Style::default().fg(Color::DarkGray)),
                Rect::new(0, footer_y, area.width, 1),
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

// ─── Launch sub-menu ──────────────────────────────────────────────────────────

fn show_launch_submenu(
    terminal: &mut Terminal<CrosstermBackend<io::Stdout>>,
    anim_style: AnimStyle,
) -> io::Result<()> {
    const LAUNCH_ITEMS: &[&str] = &["Launch Supervisor", "Back"];
    let mut selected: usize = 0;
    let mut tick: f64 = 0.0;
    let tick_rate = Duration::from_millis(40);
    let mut last_tick = Instant::now();

    loop {
        let style = anim_style;
        terminal.draw(|f| {
            f.render_widget(Clear, f.size());
            render_animated_banner(f, tick, style);
            let area = f.size();
            if area.height > MENU_Y {
                let items: Vec<Line> = LAUNCH_ITEMS
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
                    Paragraph::new(items),
                    Rect::new(2, MENU_Y, area.width.saturating_sub(4), LAUNCH_ITEMS.len() as u16),
                );
            }
        })?;
        tick += 1.0;

        let timeout = tick_rate.checked_sub(last_tick.elapsed()).unwrap_or(Duration::ZERO);
        if event::poll(timeout)? {
            if let Event::Key(KeyEvent { code, kind: KeyEventKind::Press, .. }) = event::read()? {
                match code {
                    KeyCode::Up | KeyCode::Char('k') => {
                        if selected > 0 { selected -= 1; } else { selected = LAUNCH_ITEMS.len() - 1; }
                    }
                    KeyCode::Down | KeyCode::Char('j') => {
                        selected = (selected + 1) % LAUNCH_ITEMS.len();
                    }
                    KeyCode::Esc | KeyCode::Char('q') => return Ok(()),
                    KeyCode::Enter => match selected {
                        0 => {
                            run_detached(&PowerShellFallback::build_args("scripts/launch.ps1", &[]));
                            return Ok(());
                        }
                        _ => return Ok(()),
                    },
                    _ => {}
                }
            }
        }
        if last_tick.elapsed() >= tick_rate { last_tick = Instant::now(); }
    }
}

// ─── Detached process launcher ────────────────────────────────────────────────

fn run_detached(args: &[String]) {
    if args.is_empty() { return; }
    let _ = Command::new(&args[0])
        .args(&args[1..])
        .current_dir(".")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn();
}

// ─── Clipboard helper ─────────────────────────────────────────────────────────

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
