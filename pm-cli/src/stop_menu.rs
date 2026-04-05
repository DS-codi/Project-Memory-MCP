// stop_menu.rs — Check and stop running pm-cli-managed components.

use crate::animations::{AnimStyle, BannerRenderer, PALETTE_DEFAULT};
use crossterm::event::{self, Event, KeyCode, KeyEvent, KeyEventKind};
use ratatui::{
    backend::CrosstermBackend,
    layout::Rect,
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Clear, Paragraph},
    Terminal,
};
use std::io;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

const MENU_Y: u16 = 9;

/// Every process pm-cli knows how to build/manage, paired with its exe image name.
/// (label, exe_name)
const TRACKED: &[(&str, &str)] = &[
    ("Supervisor (QML)",          "supervisor.exe"),
    ("Supervisor Iced",           "supervisor-iced.exe"),
    ("Interactive Terminal Iced", "interactive-terminal-iced.exe"),
    ("Client Proxy",              "client-proxy.exe"),
    ("Cartographer Core",         "cartographer-core.exe"),
    ("PM Approval GUI",           "pm-approval-gui.exe"),
    ("PM Brainstorm GUI",         "pm-brainstorm-gui.exe"),
    ("PM Install GUI",            "pm-install-gui.exe"),
];

// ── Process helpers ──────────────────────────────────────────────────────────

/// Returns true if any process with this image name is currently running.
fn is_running(exe: &str) -> bool {
    Command::new("tasklist")
        .args(["/FI", &format!("IMAGENAME eq {exe}"), "/FO", "CSV", "/NH"])
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .output()
        .map(|o| {
            let out = String::from_utf8_lossy(&o.stdout);
            out.to_lowercase().contains(&exe.to_lowercase())
        })
        .unwrap_or(false)
}

/// Kills all processes with this image name. Returns true if taskkill reported success.
fn kill_process(exe: &str) -> bool {
    Command::new("taskkill")
        .args(["/F", "/IM", exe, "/T"])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

// ── Menu ─────────────────────────────────────────────────────────────────────

pub fn show_stop_submenu(
    terminal: &mut Terminal<CrosstermBackend<io::Stdout>>,
    anim_style: AnimStyle,
) -> io::Result<()> {
    let mut selected: usize = 0;
    let mut banner = BannerRenderer::new(anim_style);
    let mut last_frame = Instant::now();
    let tick_rate = Duration::from_millis(40);

    // Snapshot running status; refreshed on R key or after a kill.
    let mut running: Vec<bool> = TRACKED.iter().map(|(_, exe)| is_running(exe)).collect();
    let mut status_msg = String::new();
    let mut status_ok = true;

    loop {
        let elapsed = last_frame.elapsed();
        last_frame = Instant::now();

        let running_count = running.iter().filter(|&&r| r).count();

        terminal.draw(|f| {
            f.render_widget(Clear, f.area());
            banner.render_with_palette(f, elapsed, &PALETTE_DEFAULT);
            let area = f.area();

            if area.height <= MENU_Y {
                return;
            }

            // ── Header ──────────────────────────────────────────────────────
            f.render_widget(
                Paragraph::new(Line::from(vec![
                    Span::styled(
                        "  Stop Running Components",
                        Style::default().fg(Color::DarkGray),
                    ),
                    Span::styled(
                        format!("  ({running_count} running)"),
                        if running_count > 0 {
                            Style::default().fg(Color::Yellow)
                        } else {
                            Style::default().fg(Color::DarkGray)
                        },
                    ),
                ])),
                Rect::new(0, MENU_Y, area.width, 1),
            );

            // ── Component list ───────────────────────────────────────────────
            let list_start = MENU_Y + 1;
            let list_height = area
                .height
                .saturating_sub(list_start + 3) // reserve hint + status rows
                .max(1) as usize;
            let visible = TRACKED.len().min(list_height);

            let items: Vec<Line> = TRACKED
                .iter()
                .zip(running.iter())
                .enumerate()
                .take(visible)
                .map(|(i, ((label, exe), &is_run))| {
                    let selected_marker = if i == selected { ">" } else { " " };
                    if is_run {
                        Line::from(vec![
                            Span::styled(
                                format!("{selected_marker} ● {label:<30}"),
                                Style::default()
                                    .fg(if i == selected { Color::Yellow } else { Color::Green })
                                    .add_modifier(if i == selected { Modifier::BOLD } else { Modifier::empty() }),
                            ),
                            Span::styled(
                                format!(" {exe}"),
                                Style::default().fg(Color::DarkGray),
                            ),
                        ])
                    } else {
                        Line::from(Span::styled(
                            format!("{selected_marker} ○ {label:<30}  {exe}"),
                            Style::default()
                                .fg(if i == selected { Color::White } else { Color::DarkGray })
                                .add_modifier(if i == selected { Modifier::BOLD } else { Modifier::empty() }),
                        ))
                    }
                })
                .collect();

            f.render_widget(
                Paragraph::new(items),
                Rect::new(2, list_start, area.width.saturating_sub(4), visible as u16),
            );

            // ── Status message ───────────────────────────────────────────────
            let status_row = area.height.saturating_sub(2);
            if !status_msg.is_empty() {
                f.render_widget(
                    Paragraph::new(Line::from(Span::styled(
                        format!("  {status_msg}"),
                        Style::default().fg(if status_ok { Color::Green } else { Color::Red }),
                    ))),
                    Rect::new(0, status_row, area.width, 1),
                );
            }

            // ── Hint bar ─────────────────────────────────────────────────────
            let hint_row = area.height.saturating_sub(1);
            f.render_widget(
                Paragraph::new(
                    "  ↑↓ select · Enter kill selected · K kill all · R refresh · Esc/Q back"
                )
                .style(Style::default().fg(Color::DarkGray)),
                Rect::new(0, hint_row, area.width, 1),
            );
        })?;

        let timeout = tick_rate
            .checked_sub(last_frame.elapsed())
            .unwrap_or(Duration::ZERO);

        if event::poll(timeout)? {
            if let Event::Key(KeyEvent {
                code,
                kind: KeyEventKind::Press,
                ..
            }) = event::read()?
            {
                match code {
                    // Navigation — vim j/k + arrow keys
                    KeyCode::Up | KeyCode::Char('k') => {
                        if selected > 0 { selected -= 1; }
                    }
                    KeyCode::Down | KeyCode::Char('j') => {
                        if selected + 1 < TRACKED.len() { selected += 1; }
                    }

                    // Kill selected process (Enter or Space)
                    KeyCode::Enter | KeyCode::Char(' ') => {
                        let (label, exe) = TRACKED[selected];
                        if running[selected] {
                            let ok = kill_process(exe);
                            status_ok = ok;
                            status_msg = if ok {
                                format!("Killed {label}")
                            } else {
                                format!("Failed to kill {label}")
                            };
                            running[selected] = is_running(exe);
                        } else {
                            status_msg = format!("{label} is not running");
                            status_ok = true;
                        }
                    }

                    // Kill ALL running (uppercase K = Shift+k)
                    KeyCode::Char('K') => {
                        let mut killed = 0usize;
                        for (i, (_, exe)) in TRACKED.iter().enumerate() {
                            if running[i] && kill_process(exe) {
                                killed += 1;
                            }
                        }
                        running = TRACKED.iter().map(|(_, exe)| is_running(exe)).collect();
                        status_msg = format!("Killed {killed} process(es)");
                        status_ok = true;
                    }

                    // Refresh status
                    KeyCode::Char('r') | KeyCode::Char('R') => {
                        running = TRACKED.iter().map(|(_, exe)| is_running(exe)).collect();
                        status_msg = "Refreshed".to_string();
                        status_ok = true;
                    }

                    KeyCode::Esc | KeyCode::Char('q') | KeyCode::Char('Q') => return Ok(()),
                    _ => {}
                }
            }
        }
    }
}
