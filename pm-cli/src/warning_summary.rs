// warning_summary.rs — Post-build summary table with per-component/phase diagnostics.

use crate::animations::{AnimStyle, BannerRenderer, BANNER, PALETTE_ERROR, PALETTE_SUCCESS, PALETTE_WARN};
use crate::build_phase::PhaseResult;
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
    widgets::{Block, Borders, Cell, Clear, Paragraph, Row, Table},
    Terminal,
};
use std::io;
use std::time::{Duration, Instant};

pub fn show_warning_summary(
    terminal: &mut Terminal<CrosstermBackend<io::Stdout>>,
    results: &[PhaseResult],
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
                    Constraint::Length(1),
                    Constraint::Min(5),
                    Constraint::Length(1),
                ])
                .split(area);

            let (header_text, header_col) = if has_error {
                ("  Build finished with ERRORS", Color::LightRed)
            } else if total > 0 {
                ("  Build finished with warnings", Color::Yellow)
            } else {
                ("  Build finished — clean!", Color::LightGreen)
            };

            f.render_widget(
                Paragraph::new(header_text)
                    .style(Style::default().fg(header_col).add_modifier(Modifier::BOLD)),
                chunks[1],
            );

            let header_row = Row::new(vec![
                Cell::from("Component")
                    .style(Style::default().add_modifier(Modifier::BOLD)),
                Cell::from("Phase")
                    .style(Style::default().add_modifier(Modifier::BOLD)),
                Cell::from("Warns")
                    .style(Style::default().fg(Color::Yellow).add_modifier(Modifier::BOLD)),
                Cell::from("Errors")
                    .style(Style::default().fg(Color::LightRed).add_modifier(Modifier::BOLD)),
            ])
            .height(1);

            let rows: Vec<Row> = results
                .iter()
                .map(|r| {
                    let ws = if r.warn_count > 0 {
                        Style::default().fg(Color::Yellow)
                    } else {
                        Style::default().fg(Color::DarkGray)
                    };
                    let es = if r.err_count > 0 {
                        Style::default().fg(Color::LightRed)
                    } else {
                        Style::default().fg(Color::DarkGray)
                    };
                    Row::new(vec![
                        Cell::from(r.component.clone()),
                        Cell::from(r.phase.clone()),
                        Cell::from(r.warn_count.to_string()).style(ws),
                        Cell::from(r.err_count.to_string()).style(es),
                    ])
                })
                .collect();

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

            f.render_widget(table, chunks[2]);

            f.render_widget(
                Paragraph::new(
                    "  C copy to clipboard  S save to file  Esc / Enter return",
                )
                .style(Style::default().fg(Color::DarkGray)),
                chunks[3],
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
                    KeyCode::Char('c') | KeyCode::Char('C') => {
                        let _ = copy_to_clipboard(&warning_log);
                    }
                    KeyCode::Char('s') | KeyCode::Char('S') => {
                        let _ = terminal::disable_raw_mode();
                        let _ = execute!(
                            io::stdout(),
                            terminal::LeaveAlternateScreen,
                            cursor::Show
                        );
                        match save_logs_to_file(&warning_log) {
                            Ok(name) => println!("Saved to {}", name),
                            Err(e) => println!("Error saving log: {e}"),
                        }
                        std::thread::sleep(Duration::from_millis(1500));
                        let _ = terminal::enable_raw_mode();
                        let _ = execute!(
                            io::stdout(),
                            terminal::EnterAlternateScreen,
                            cursor::Hide
                        );
                        let _ = terminal.clear();
                    }
                    KeyCode::Esc | KeyCode::Enter | KeyCode::Char('q') => return Ok(()),
                    _ => {}
                }
            }
        }
    }
}
