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

const PALETTE_DEFAULT: [Color; 6] = [
    Color::White,
    Color::Cyan,
    Color::Blue,
    Color::DarkGray,
    Color::Green,
    Color::LightGreen,
];

const PALETTE_SUCCESS: [Color; 6] = [
    Color::Green,
    Color::LightGreen,
    Color::Cyan,
    Color::Green,
    Color::LightGreen,
    Color::White,
];

const PALETTE_WARN: [Color; 6] = [
    Color::Yellow,
    Color::LightYellow,
    Color::White,
    Color::Yellow,
    Color::LightYellow,
    Color::DarkGray,
];

const PALETTE_ERROR: [Color; 6] = [
    Color::Red,
    Color::LightRed,
    Color::Yellow,
    Color::Red,
    Color::LightRed,
    Color::DarkGray,
];

// ─── Layout constants ─────────────────────────────────────────────────────────

const MENU_Y: u16 = 9; // banner rows (7) + 2 padding
const STATUS_Y: u16 = 18; // MENU_Y + 6 items + 3 padding

// ─── Menus ────────────────────────────────────────────────────────────────────

const MENU_ITEMS: &[&str] = &[
    "Install All Components",
    "Install Component...",
    "Run Tests",
    "Lint QML Files",
    "Launch Supervisor",
    "Quit",
];

const COMPONENT_NAMES: &[&str] = &[
    "Supervisor",
    "GuiForms",
    "InteractiveTerminal",
    "Server",
    "FallbackServer",
    "Dashboard",
    "Extension",
    "Mobile",
    "Back",
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
    terminal::enable_raw_mode()?;
    let mut stdout = io::stdout();
    execute!(stdout, terminal::EnterAlternateScreen, cursor::Hide)?;
    let backend = CrosstermBackend::new(stdout);
    let mut term = Terminal::new(backend)?;
    let _guard = TerminalGuard;

    // Drain stale input events (the Enter key used to launch the exe)
    while event::poll(Duration::from_millis(50))? {
        let _ = event::read()?;
    }

    run_app(&mut term)
}

// ─── Banner rendering ─────────────────────────────────────────────────────────

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

// ─── Main menu loop ───────────────────────────────────────────────────────────

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
                                format!("> [{}] {}", i + 1, item),
                                Style::default()
                                    .fg(Color::Yellow)
                                    .add_modifier(Modifier::BOLD),
                            ))
                        } else {
                            Line::from(Span::styled(
                                format!("  [{}] {}", i + 1, item),
                                Style::default().fg(Color::White),
                            ))
                        }
                    })
                    .collect();
                let menu_area = Rect::new(
                    2,
                    MENU_Y,
                    area.width.saturating_sub(4),
                    MENU_ITEMS.len() as u16,
                );
                f.render_widget(Paragraph::new(menu_lines), menu_area);
            }

            if area.height > STATUS_Y {
                let status = Paragraph::new(
                    "  \u{2191}\u{2193} or 1-6 to navigate  |  Enter to select  |  Q / Esc to quit",
                )
                .style(Style::default().fg(Color::DarkGray));
                f.render_widget(status, Rect::new(0, STATUS_Y, area.width, 1));
            }
        })?;

        tick += 1.0;

        let timeout = tick_rate
            .checked_sub(last_tick.elapsed())
            .unwrap_or(Duration::ZERO);
        if event::poll(timeout)? {
            if let Event::Key(KeyEvent {
                code,
                kind: KeyEventKind::Press,
                ..
            }) = event::read()?
            {
                match code {
                    KeyCode::Up | KeyCode::Char('k') => {
                        if selected > 0 {
                            selected -= 1;
                        } else {
                            selected = MENU_ITEMS.len() - 1;
                        }
                    }
                    KeyCode::Down | KeyCode::Char('j') => {
                        selected = (selected + 1) % MENU_ITEMS.len();
                    }
                    KeyCode::Char(c) if c.is_ascii_digit() => {
                        let n = c as usize - '1' as usize;
                        if n < MENU_ITEMS.len() {
                            selected = n;
                        }
                    }
                    KeyCode::Char('q') | KeyCode::Char('Q') | KeyCode::Esc => return Ok(()),
                    KeyCode::Enter => {
                        if selected == MENU_ITEMS.len() - 1 {
                            return Ok(());
                        }
                        handle_action(terminal, selected)?;
                    }
                    _ => {}
                }
            }
        }

        if last_tick.elapsed() >= tick_rate {
            last_tick = Instant::now();
        }
    }
}

// ─── Action dispatch ──────────────────────────────────────────────────────────

fn handle_action(
    terminal: &mut Terminal<CrosstermBackend<io::Stdout>>,
    action: usize,
) -> io::Result<()> {
    match action {
        0 => {
            // Install All
            run_build_component(terminal, "All")?;
            show_warning_summary(terminal)?;
        }
        1 => show_install_submenu(terminal)?,
        2 => run_streaming_command(
            terminal,
            "Run Tests",
            &["pwsh", "-NoProfile", "-File", "run-tests.ps1"],
        )?,
        3 => run_streaming_command(
            terminal,
            "Lint QML Files",
            &["pwsh", "-NoProfile", "-File", "scripts/qmllint.ps1"],
        )?,
        4 => show_launch_submenu(terminal)?,
        _ => {}
    }
    Ok(())
}

// ─── Build / install ──────────────────────────────────────────────────────────

fn run_build_component(
    terminal: &mut Terminal<CrosstermBackend<io::Stdout>>,
    component: &str,
) -> io::Result<()> {
    let label = if component == "All" {
        "All Components".to_string()
    } else {
        component.to_string()
    };
    run_build_impl(terminal, &label, &[
        "pwsh",
        "-NoProfile",
        "-File",
        "scripts/build.ps1",
        "-Include",
        component,
    ])
}

fn run_build_impl(
    terminal: &mut Terminal<CrosstermBackend<io::Stdout>>,
    label: &str,
    args: &[&str],
) -> io::Result<()> {
    // Truncate / create the warnings log for this run
    let log_path = "build_warnings.log";
    let mut log_file = OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .open(log_path)?;

    let label_owned = label.to_string();

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

    let tick_rate = Duration::from_millis(40);
    let mut tick: f64 = 0.0;
    let mut lines_read: u64 = 0;
    let mut diag_count: usize = 0;

    loop {
        match rx.recv_timeout(tick_rate) {
            Ok(line) => {
                lines_read += 1;
                let lower = line.to_lowercase();
                let is_diagnostic = lower.contains("warning")
                    || lower.contains("error")
                    || lower.starts_with("info:");
                let is_false_positive = lower.contains("no warning")
                    || lower.contains("0 warning")
                    || lower.contains("no error");
                if is_diagnostic && !is_false_positive {
                    let _ = writeln!(log_file, "[{}] {}", label_owned, line);
                    diag_count += 1;
                }
            }
            Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {}
            Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => break,
        }

        // Smooth progress estimate: ~500 lines per component
        let progress = (lines_read.min(500) as f64 / 500.0 * 99.0) as u16;

        terminal.draw(|f| {
            render_animated_banner(f, tick);
            let area = f.size();

            if area.height > MENU_Y {
                let label_line =
                    Paragraph::new(format!("  \u{25b6} Installing: {}", label_owned))
                        .style(Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD));
                f.render_widget(label_line, Rect::new(0, MENU_Y, area.width, 1));
            }
            if area.height > MENU_Y + 2 {
                let diag_line =
                    Paragraph::new(format!("  Diagnostics captured: {}", diag_count))
                        .style(Style::default().fg(Color::DarkGray));
                f.render_widget(diag_line, Rect::new(0, MENU_Y + 2, area.width, 1));
            }
            if area.height > MENU_Y + 4 {
                let gauge = Gauge::default()
                    .block(Block::default().borders(Borders::NONE))
                    .gauge_style(Style::default().fg(Color::Cyan))
                    .percent(progress);
                f.render_widget(
                    gauge,
                    Rect::new(2, MENU_Y + 4, area.width.saturating_sub(4), 1),
                );
            }
        })?;

        tick += 1.0;
    }

    child.wait()?;

    // Final frame: 100% + success palette
    terminal.draw(|f| {
        render_banner_with_palette(f, tick, &PALETTE_SUCCESS);
        let area = f.size();
        if area.height > MENU_Y {
            let done = Paragraph::new(format!(
                "  \u{2714} Done: {}  ({} diagnostic(s))",
                label_owned, diag_count
            ))
            .style(Style::default().fg(Color::Green).add_modifier(Modifier::BOLD));
            f.render_widget(done, Rect::new(0, MENU_Y, area.width, 1));
        }
        if area.height > MENU_Y + 4 {
            let gauge = Gauge::default()
                .block(Block::default().borders(Borders::NONE))
                .gauge_style(Style::default().fg(Color::Green))
                .percent(100);
            f.render_widget(
                gauge,
                Rect::new(2, MENU_Y + 4, area.width.saturating_sub(4), 1),
            );
        }
    })?;

    std::thread::sleep(Duration::from_millis(700));
    Ok(())
}

// ─── Warning summary screen ───────────────────────────────────────────────────

fn show_warning_summary(
    terminal: &mut Terminal<CrosstermBackend<io::Stdout>>,
) -> io::Result<()> {
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

    let total: usize = counts.values().sum();
    let has_error = warning_lines
        .iter()
        .any(|l| l.to_lowercase().contains("error"));
    let palette = if has_error {
        &PALETTE_ERROR
    } else if total > 0 {
        &PALETTE_WARN
    } else {
        &PALETTE_SUCCESS
    };

    let mut scroll: usize = 0;
    let mut tick: f64 = 0.0;

    loop {
        terminal.draw(|f| {
            render_banner_with_palette(f, tick, palette);
            let area = f.size();

            if area.height > MENU_Y {
                let header = if has_error {
                    Paragraph::new("  \u{2716} Build finished \u{2014} ERRORS detected")
                        .style(Style::default().fg(Color::Red).add_modifier(Modifier::BOLD))
                } else if total > 0 {
                    Paragraph::new(format!(
                        "  \u{26a0} Build finished \u{2014} {} diagnostic(s)",
                        total
                    ))
                    .style(Style::default().fg(Color::Yellow).add_modifier(Modifier::BOLD))
                } else {
                    Paragraph::new("  \u{2714} Build finished \u{2014} Clean!")
                        .style(Style::default().fg(Color::Green).add_modifier(Modifier::BOLD))
                };
                f.render_widget(header, Rect::new(0, MENU_Y, area.width, 1));
            }

            if !counts.is_empty() && area.height > MENU_Y + 3 {
                let mut sorted: Vec<(&String, &usize)> = counts.iter().collect();
                sorted.sort_by_key(|(k, _)| k.as_str());

                let table_height = area.height.saturating_sub(MENU_Y + 6) as usize;
                let rows: Vec<Row> = sorted
                    .iter()
                    .skip(scroll)
                    .take(table_height)
                    .map(|(comp, cnt)| {
                        let has_err = warning_lines.iter().any(|l| {
                            l.contains(comp.as_str()) && l.to_lowercase().contains("error")
                        });
                        let color = if has_err { Color::Red } else { Color::Yellow };
                        Row::new(vec![
                            Cell::from(comp.as_str()).style(Style::default().fg(Color::White)),
                            Cell::from(cnt.to_string())
                                .style(Style::default().fg(color)),
                        ])
                    })
                    .collect();

                let table = Table::new(
                    rows,
                    [Constraint::Length(26), Constraint::Length(12)],
                )
                .header(
                    Row::new(vec!["Component", "Diagnostics"]).style(
                        Style::default()
                            .fg(Color::Cyan)
                            .add_modifier(Modifier::BOLD),
                    ),
                );

                let table_area = Rect::new(
                    2,
                    MENU_Y + 3,
                    area.width.saturating_sub(4),
                    table_height as u16,
                );
                f.render_widget(table, table_area);
            }

            let footer_y = area.height.saturating_sub(1);
            let footer = Paragraph::new(
                "  C = copy to clipboard  |  \u{2191}\u{2193} scroll  |  Esc / Enter = return",
            )
            .style(Style::default().fg(Color::DarkGray));
            f.render_widget(footer, Rect::new(0, footer_y, area.width, 1));
        })?;

        tick += 1.0;

        if event::poll(Duration::from_millis(40))? {
            if let Event::Key(KeyEvent {
                code,
                kind: KeyEventKind::Press,
                ..
            }) = event::read()?
            {
                match code {
                    KeyCode::Char('c') | KeyCode::Char('C') => {
                        copy_to_clipboard(&warning_lines.join("\n"));
                    }
                    KeyCode::Down | KeyCode::Char('j') => {
                        if scroll + 1 < counts.len() {
                            scroll += 1;
                        }
                    }
                    KeyCode::Up | KeyCode::Char('k') => {
                        if scroll > 0 {
                            scroll -= 1;
                        }
                    }
                    KeyCode::Esc | KeyCode::Enter => return Ok(()),
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

    let title_owned = title.to_string();
    let mut scroll: usize = 0;

    loop {
        terminal.draw(|f| {
            let area = f.size();
            let visible_height = area.height.saturating_sub(4) as usize;

            let display_lines: Vec<Line> = lines
                .iter()
                .skip(scroll)
                .take(visible_height)
                .map(|l| Line::from(l.as_str()))
                .collect();

            let para = Paragraph::new(display_lines).block(
                Block::default()
                    .title(format!(" {} ", title_owned))
                    .borders(Borders::ALL),
            );
            f.render_widget(
                para,
                Rect::new(0, 0, area.width, area.height.saturating_sub(2)),
            );

            let footer = Paragraph::new(
                "  \u{2191}\u{2193} / j k  PgUp PgDn to scroll  |  C = copy  |  Esc / Enter = return",
            )
            .style(Style::default().fg(Color::DarkGray));
            f.render_widget(
                footer,
                Rect::new(0, area.height.saturating_sub(1), area.width, 1),
            );
        })?;

        if event::poll(Duration::from_millis(100))? {
            if let Event::Key(KeyEvent {
                code,
                kind: KeyEventKind::Press,
                ..
            }) = event::read()?
            {
                match code {
                    KeyCode::Down | KeyCode::Char('j') => {
                        if scroll + 1 < lines.len() {
                            scroll += 1;
                        }
                    }
                    KeyCode::Up | KeyCode::Char('k') => {
                        if scroll > 0 {
                            scroll -= 1;
                        }
                    }
                    KeyCode::PageDown => {
                        scroll = (scroll + 20).min(lines.len().saturating_sub(1));
                    }
                    KeyCode::PageUp => {
                        scroll = scroll.saturating_sub(20);
                    }
                    KeyCode::Char('c') | KeyCode::Char('C') => {
                        copy_to_clipboard(&lines.join("\n"));
                    }
                    KeyCode::Esc
                    | KeyCode::Enter
                    | KeyCode::Char('r')
                    | KeyCode::Char('R') => {
                        return Ok(());
                    }
                    _ => {}
                }
            }
        }
    }
}

// ─── Install component sub-menu ───────────────────────────────────────────────

fn show_install_submenu(
    terminal: &mut Terminal<CrosstermBackend<io::Stdout>>,
) -> io::Result<()> {
    let mut selected: usize = 0;
    let mut tick: f64 = 0.0;
    let tick_rate = Duration::from_millis(40);
    let mut last_tick = Instant::now();

    loop {
        terminal.draw(|f| {
            render_animated_banner(f, tick);
            let area = f.size();

            if area.height > MENU_Y {
                let title =
                    Paragraph::new("  Select component to install:").style(
                        Style::default()
                            .fg(Color::Cyan)
                            .add_modifier(Modifier::BOLD),
                    );
                f.render_widget(
                    title,
                    Rect::new(0, MENU_Y.saturating_sub(2), area.width, 1),
                );

                let menu_lines: Vec<Line> = COMPONENT_NAMES
                    .iter()
                    .enumerate()
                    .map(|(i, &item)| {
                        let key = if i < 9 { (i + 1).to_string() } else { "0".to_string() };
                        if i == selected {
                            Line::from(Span::styled(
                                format!("> [{}] {}", key, item),
                                Style::default()
                                    .fg(Color::Yellow)
                                    .add_modifier(Modifier::BOLD),
                            ))
                        } else {
                            Line::from(Span::styled(
                                format!("  [{}] {}", key, item),
                                Style::default().fg(Color::White),
                            ))
                        }
                    })
                    .collect();
                let menu_area = Rect::new(
                    2,
                    MENU_Y,
                    area.width.saturating_sub(4),
                    COMPONENT_NAMES.len() as u16,
                );
                f.render_widget(Paragraph::new(menu_lines), menu_area);
            }

            if area.height > STATUS_Y {
                let status = Paragraph::new(
                    "  \u{2191}\u{2193} or 1-9 to navigate  |  Enter to install  |  Esc = back",
                )
                .style(Style::default().fg(Color::DarkGray));
                f.render_widget(status, Rect::new(0, STATUS_Y, area.width, 1));
            }
        })?;

        tick += 1.0;

        let timeout = tick_rate
            .checked_sub(last_tick.elapsed())
            .unwrap_or(Duration::ZERO);
        if event::poll(timeout)? {
            if let Event::Key(KeyEvent {
                code,
                kind: KeyEventKind::Press,
                ..
            }) = event::read()?
            {
                match code {
                    KeyCode::Up | KeyCode::Char('k') => {
                        if selected > 0 {
                            selected -= 1;
                        } else {
                            selected = COMPONENT_NAMES.len() - 1;
                        }
                    }
                    KeyCode::Down | KeyCode::Char('j') => {
                        selected = (selected + 1) % COMPONENT_NAMES.len();
                    }
                    KeyCode::Char(c) if c.is_ascii_digit() => {
                        let n = c as usize - '1' as usize;
                        if n < COMPONENT_NAMES.len() {
                            selected = n;
                        }
                    }
                    KeyCode::Esc | KeyCode::Char('b') | KeyCode::Char('B') => return Ok(()),
                    KeyCode::Enter => {
                        // Last item is "Back"
                        if selected == COMPONENT_NAMES.len() - 1 {
                            return Ok(());
                        }
                        let component = COMPONENT_NAMES[selected];
                        run_build_component(terminal, component)?;
                        show_warning_summary(terminal)?;
                        return Ok(());
                    }
                    _ => {}
                }
            }
        }

        if last_tick.elapsed() >= tick_rate {
            last_tick = Instant::now();
        }
    }
}

// ─── Launch sub-menu ─────────────────────────────────────────────────────────

fn show_launch_submenu(
    terminal: &mut Terminal<CrosstermBackend<io::Stdout>>,
) -> io::Result<()> {
    const LAUNCH_ITEMS: &[&str] = &[
        "Launch Supervisor (default)",
        "Launch + auto-kill existing processes",
        "Write config only (no launch)",
        "Back",
    ];

    const LAUNCH_ARGS: &[&[&str]] = &[
        &["pwsh", "-NoProfile", "-File", "launch-supervisor.ps1"],
        &[
            "pwsh",
            "-NoProfile",
            "-File",
            "launch-supervisor.ps1",
            "-AutoKillExisting",
        ],
        &[
            "pwsh",
            "-NoProfile",
            "-File",
            "launch-supervisor.ps1",
            "-WriteConfigOnly",
        ],
        &[], // Back
    ];

    let mut selected: usize = 0;
    let mut tick: f64 = 0.0;
    let tick_rate = Duration::from_millis(40);
    let mut last_tick = Instant::now();

    loop {
        terminal.draw(|f| {
            render_animated_banner(f, tick);
            let area = f.size();

            if area.height > MENU_Y {
                let title = Paragraph::new("  Launch Supervisor:").style(
                    Style::default()
                        .fg(Color::Cyan)
                        .add_modifier(Modifier::BOLD),
                );
                f.render_widget(
                    title,
                    Rect::new(0, MENU_Y.saturating_sub(2), area.width, 1),
                );

                let menu_lines: Vec<Line> = LAUNCH_ITEMS
                    .iter()
                    .enumerate()
                    .map(|(i, &item)| {
                        if i == selected {
                            Line::from(Span::styled(
                                format!("> [{}] {}", i + 1, item),
                                Style::default()
                                    .fg(Color::Yellow)
                                    .add_modifier(Modifier::BOLD),
                            ))
                        } else {
                            Line::from(Span::styled(
                                format!("  [{}] {}", i + 1, item),
                                Style::default().fg(Color::White),
                            ))
                        }
                    })
                    .collect();
                let menu_area = Rect::new(
                    2,
                    MENU_Y,
                    area.width.saturating_sub(4),
                    LAUNCH_ITEMS.len() as u16,
                );
                f.render_widget(Paragraph::new(menu_lines), menu_area);
            }

            if area.height > STATUS_Y {
                let status = Paragraph::new(
                    "  \u{2191}\u{2193} or 1-4 to navigate  |  Enter to confirm  |  Esc = back",
                )
                .style(Style::default().fg(Color::DarkGray));
                f.render_widget(status, Rect::new(0, STATUS_Y, area.width, 1));
            }
        })?;

        tick += 1.0;

        let timeout = tick_rate
            .checked_sub(last_tick.elapsed())
            .unwrap_or(Duration::ZERO);
        if event::poll(timeout)? {
            if let Event::Key(KeyEvent {
                code,
                kind: KeyEventKind::Press,
                ..
            }) = event::read()?
            {
                match code {
                    KeyCode::Up | KeyCode::Char('k') => {
                        if selected > 0 {
                            selected -= 1;
                        } else {
                            selected = LAUNCH_ITEMS.len() - 1;
                        }
                    }
                    KeyCode::Down | KeyCode::Char('j') => {
                        selected = (selected + 1) % LAUNCH_ITEMS.len();
                    }
                    KeyCode::Char(c) if c.is_ascii_digit() => {
                        let n = c as usize - '1' as usize;
                        if n < LAUNCH_ITEMS.len() {
                            selected = n;
                        }
                    }
                    KeyCode::Esc | KeyCode::Char('b') | KeyCode::Char('B') => return Ok(()),
                    KeyCode::Enter => {
                        if selected == LAUNCH_ITEMS.len() - 1 {
                            return Ok(());
                        }
                        let args = LAUNCH_ARGS[selected];
                        if !args.is_empty() {
                            run_detached(terminal, LAUNCH_ITEMS[selected], args)?;
                        }
                        return Ok(());
                    }
                    _ => {}
                }
            }
        }

        if last_tick.elapsed() >= tick_rate {
            last_tick = Instant::now();
        }
    }
}

/// Spawns a process detached (fire-and-forget) and shows a confirmation.
fn run_detached(
    terminal: &mut Terminal<CrosstermBackend<io::Stdout>>,
    label: &str,
    args: &[&str],
) -> io::Result<()> {
    let _child = Command::new(args[0])
        .args(&args[1..])
        .current_dir(".")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()?;

    let label_owned = label.to_string();
    let mut tick: f64 = 0.0;
    let deadline = Instant::now() + Duration::from_secs(2);

    loop {
        terminal.draw(|f| {
            render_banner_with_palette(f, tick, &PALETTE_SUCCESS);
            let area = f.size();
            if area.height > MENU_Y {
                let msg = Paragraph::new(format!("  \u{2714} Launched: {}", label_owned))
                    .style(Style::default().fg(Color::Green).add_modifier(Modifier::BOLD));
                f.render_widget(msg, Rect::new(0, MENU_Y, area.width, 1));

                let hint = Paragraph::new("  Press any key to return to menu.")
                    .style(Style::default().fg(Color::DarkGray));
                f.render_widget(hint, Rect::new(0, MENU_Y + 2, area.width, 1));
            }
        })?;

        tick += 1.0;

        if Instant::now() >= deadline {
            return Ok(());
        }

        if event::poll(Duration::from_millis(40))? {
            if let Event::Key(KeyEvent {
                kind: KeyEventKind::Press,
                ..
            }) = event::read()?
            {
                return Ok(());
            }
        }
    }
}

// ─── Clipboard ───────────────────────────────────────────────────────────────

fn copy_to_clipboard(text: &str) {
    let _ = Command::new("powershell")
        .args(["-NoProfile", "-Command", "$input | Set-Clipboard"])
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .and_then(|mut child| {
            if let Some(ref mut stdin) = child.stdin {
                let _ = stdin.write_all(text.as_bytes());
            }
            child.wait()
        });
}
