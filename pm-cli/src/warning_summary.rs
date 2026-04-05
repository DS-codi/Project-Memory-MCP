// warning_summary.rs — Post-build summary with tabs: Summary | Changelog | Diagnostics.
//
// Keys:
//   Tab / 1-3  switch tabs
//   j/k / ↑↓   scroll (Changelog + Diagnostics tabs)
//   PgDn/PgUp  fast scroll
//   C          copy full structured report (changelog + errors + warnings) to clipboard
//   S          save full report to timestamped file
//   Esc/Enter  return to menu

use crate::animations::{AnimStyle, BannerRenderer, BANNER, PALETTE_ERROR, PALETTE_SUCCESS, PALETTE_WARN};
use crate::build_phase::PhaseResult;
use crate::code_index::{self, ChangeLog, LineKind};
use crate::utils::{copy_to_clipboard, save_logs_to_file};
use crossterm::{
    cursor,
    event::{self, Event, KeyCode, KeyEvent, KeyEventKind},
    execute, terminal,
};
use ratatui::{
    backend::CrosstermBackend,
    layout::{Constraint, Direction, Layout},
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, Cell, Clear, Paragraph, Row, Table},
    Terminal,
};
use std::io;
use std::time::{Duration, Instant};

#[derive(Clone, Copy, PartialEq)]
enum Tab {
    Summary,
    Changelog,
    Diagnostics,
}

pub fn show_warning_summary(
    terminal: &mut Terminal<CrosstermBackend<io::Stdout>>,
    results: &[PhaseResult],
    changelogs: &[(String, ChangeLog)],
    anim_style: AnimStyle,
) -> io::Result<()> {
    if results.is_empty() {
        return Ok(());
    }

    let has_error = results.iter().any(|r| r.err_count > 0);
    let total: usize = results.iter().map(|r| r.warn_count + r.err_count).sum();
    let warning_log = std::fs::read_to_string("build_warnings.log").unwrap_or_default();
    let palette = if has_error {
        &PALETTE_ERROR
    } else if total > 0 {
        &PALETTE_WARN
    } else {
        &PALETTE_SUCCESS
    };

    // Pre-compute rendered lines for Changelog and Diagnostics tabs.
    let mut changelog_lines: Vec<(String, LineKind)> = Vec::new();
    for (comp, cl) in changelogs {
        changelog_lines.extend(cl.to_lines(comp));
        changelog_lines.push(("".to_string(), LineKind::Neutral));
    }

    let diag_blocks = code_index::extract_diagnostics(&warning_log);
    let diag_lines = code_index::diag_to_lines(&diag_blocks);

    // Full report for copy/save.
    let report = code_index::build_report(changelogs, &warning_log);

    let mut active_tab = Tab::Summary;
    let mut scroll: usize = 0;
    let mut banner = BannerRenderer::new(anim_style);
    let mut last_frame = Instant::now();
    let tick_rate = Duration::from_millis(40);

    loop {
        let elapsed = last_frame.elapsed();
        last_frame = Instant::now();

        terminal.draw(|f| {
            f.render_widget(Clear, f.area());
            banner.render_with_palette(f, elapsed, palette);
            let area = f.area();

            let chunks = Layout::default()
                .direction(Direction::Vertical)
                .margin(0)
                .constraints([
                    Constraint::Length(BANNER.len() as u16 + 1),
                    Constraint::Length(1), // status line
                    Constraint::Length(1), // tab bar
                    Constraint::Min(4),    // content
                    Constraint::Length(1), // footer
                ])
                .split(area);

            // Status line
            let (status_text, status_col) = if has_error {
                ("  ✖ Build finished with ERRORS", Color::LightRed)
            } else if total > 0 {
                ("  ⚠ Build finished with warnings", Color::Yellow)
            } else {
                ("  ✔ Build finished — clean!", Color::LightGreen)
            };
            f.render_widget(
                Paragraph::new(status_text)
                    .style(Style::default().fg(status_col).add_modifier(Modifier::BOLD)),
                chunks[1],
            );

            // Tab bar
            let tabs: &[(&str, Tab)] = &[
                (" 1 Summary ", Tab::Summary),
                (" 2 Changelog ", Tab::Changelog),
                (" 3 Diagnostics ", Tab::Diagnostics),
            ];
            let tab_spans: Vec<Span> = tabs
                .iter()
                .flat_map(|(label, t)| {
                    let style = if *t == active_tab {
                        Style::default().fg(Color::Black).bg(Color::Cyan).add_modifier(Modifier::BOLD)
                    } else {
                        Style::default().fg(Color::DarkGray)
                    };
                    vec![Span::styled(*label, style), Span::raw(" ")]
                })
                .collect();
            f.render_widget(
                Paragraph::new(Line::from(tab_spans))
                    .style(Style::default()),
                chunks[2],
            );

            // Content area
            match active_tab {
                Tab::Summary => render_summary(f, chunks[3], results, has_error, total),
                Tab::Changelog => render_scroll(f, chunks[3], &changelog_lines, scroll, " Changelog "),
                Tab::Diagnostics => render_scroll(f, chunks[3], &diag_lines, scroll, " Diagnostics "),
            }

            // Footer
            f.render_widget(
                Paragraph::new("  Tab/1-3 switch  j/k scroll  C copy report  S save  Esc return")
                    .style(Style::default().fg(Color::DarkGray)),
                chunks[4],
            );
        })?;

        let timeout = tick_rate.checked_sub(last_frame.elapsed()).unwrap_or(Duration::ZERO);
        if event::poll(timeout)? {
            if let Event::Key(KeyEvent { code, kind: KeyEventKind::Press, .. }) = event::read()? {
                let scroll_len = match active_tab {
                    Tab::Summary => 0,
                    Tab::Changelog => changelog_lines.len(),
                    Tab::Diagnostics => diag_lines.len(),
                };

                match code {
                    KeyCode::Tab => {
                        active_tab = match active_tab {
                            Tab::Summary     => Tab::Changelog,
                            Tab::Changelog   => Tab::Diagnostics,
                            Tab::Diagnostics => Tab::Summary,
                        };
                        scroll = 0;
                    }
                    KeyCode::Char('1') => { active_tab = Tab::Summary; scroll = 0; }
                    KeyCode::Char('2') => { active_tab = Tab::Changelog; scroll = 0; }
                    KeyCode::Char('3') => { active_tab = Tab::Diagnostics; scroll = 0; }
                    KeyCode::Down | KeyCode::Char('j') => {
                        if scroll + 1 < scroll_len { scroll += 1; }
                    }
                    KeyCode::Up | KeyCode::Char('k') => {
                        if scroll > 0 { scroll -= 1; }
                    }
                    KeyCode::PageDown => {
                        scroll = (scroll + 20).min(scroll_len.saturating_sub(1));
                    }
                    KeyCode::PageUp => {
                        scroll = scroll.saturating_sub(20);
                    }
                    KeyCode::Char('c') | KeyCode::Char('C') => {
                        let _ = copy_to_clipboard(&report);
                    }
                    KeyCode::Char('s') | KeyCode::Char('S') => {
                        let _ = terminal::disable_raw_mode();
                        let _ = execute!(io::stdout(), terminal::LeaveAlternateScreen, cursor::Show);
                        match save_logs_to_file(&report) {
                            Ok(name) => println!("Saved to {}", name),
                            Err(e)   => println!("Error saving: {e}"),
                        }
                        std::thread::sleep(Duration::from_millis(1500));
                        let _ = terminal::enable_raw_mode();
                        let _ = execute!(io::stdout(), terminal::EnterAlternateScreen, cursor::Hide);
                        let _ = terminal.clear();
                    }
                    KeyCode::Esc | KeyCode::Enter | KeyCode::Char('q') => return Ok(()),
                    _ => {}
                }
            }
        }
    }
}

// ─── Summary tab ─────────────────────────────────────────────────────────────

fn render_summary(
    f: &mut ratatui::Frame,
    area: ratatui::layout::Rect,
    results: &[PhaseResult],
    has_error: bool,
    total: usize,
) {
    let header_row = Row::new(vec![
        Cell::from("Component").style(Style::default().add_modifier(Modifier::BOLD)),
        Cell::from("Phase").style(Style::default().add_modifier(Modifier::BOLD)),
        Cell::from("Warns").style(Style::default().fg(Color::Yellow).add_modifier(Modifier::BOLD)),
        Cell::from("Errors").style(Style::default().fg(Color::LightRed).add_modifier(Modifier::BOLD)),
    ])
    .height(1);

    let rows: Vec<Row> = results
        .iter()
        .map(|r| {
            let ws = if r.warn_count > 0 { Style::default().fg(Color::Yellow) } else { Style::default().fg(Color::DarkGray) };
            let es = if r.err_count > 0 { Style::default().fg(Color::LightRed) } else { Style::default().fg(Color::DarkGray) };
            Row::new(vec![
                Cell::from(r.component.clone()),
                Cell::from(r.phase.clone()),
                Cell::from(r.warn_count.to_string()).style(ws),
                Cell::from(r.err_count.to_string()).style(es),
            ])
        })
        .collect();

    let _ = (has_error, total); // used by caller for palette selection
    f.render_widget(
        Table::new(
            rows,
            [
                Constraint::Percentage(32),
                Constraint::Percentage(30),
                Constraint::Percentage(18),
                Constraint::Percentage(20),
            ],
        )
        .header(header_row)
        .block(Block::default().title(" Build Summary ").borders(Borders::ALL)),
        area,
    );
}

// ─── Scrollable text tab (Changelog / Diagnostics) ───────────────────────────

fn render_scroll(
    f: &mut ratatui::Frame,
    area: ratatui::layout::Rect,
    lines: &[(String, LineKind)],
    scroll: usize,
    title: &str,
) {
    let inner_h = area.height.saturating_sub(2) as usize;
    let display: Vec<Line> = lines
        .iter()
        .skip(scroll)
        .take(inner_h)
        .map(|(text, kind)| {
            let color = match kind {
                LineKind::Header   => Color::Cyan,
                LineKind::Added    => Color::LightGreen,
                LineKind::Removed  => Color::LightRed,
                LineKind::Modified => Color::Yellow,
                LineKind::Neutral  => Color::Reset,
            };
            Line::from(Span::styled(text.clone(), Style::default().fg(color)))
        })
        .collect();

    f.render_widget(
        Paragraph::new(display)
            .block(Block::default().title(title).borders(Borders::ALL)),
        area,
    );
}
