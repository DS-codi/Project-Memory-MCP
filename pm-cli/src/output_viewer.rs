// output_viewer.rs — Scrollable command output viewer (test/lint commands).

use crate::animations::{AnimStyle, BannerRenderer, BANNER, PALETTE_ERROR, PALETTE_SUCCESS};
use crate::utils::copy_to_clipboard;
use crossterm::event::{self, Event, KeyCode, KeyEvent, KeyEventKind};
use ratatui::{
    backend::CrosstermBackend,
    layout::Rect,
    style::{Color, Style},
    text::{Line, Span},
    widgets::{Block, Borders, Clear, Paragraph},
    Terminal,
};
use std::io;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

pub fn run_streaming_command(
    terminal: &mut Terminal<CrosstermBackend<io::Stdout>>,
    title: &str,
    args: &[&str],
    anim_style: AnimStyle,
) -> io::Result<()> {
    let output = Command::new(args[0])
        .args(&args[1..])
        .current_dir(".")
        .stdin(Stdio::null())
        .output()?;

    let exit_ok = output.status.success();
    let lines: Vec<String> = String::from_utf8_lossy(&output.stdout)
        .lines()
        .chain(String::from_utf8_lossy(&output.stderr).lines())
        .map(|l| l.to_string())
        .collect();

    let palette = if exit_ok {
        &PALETTE_SUCCESS
    } else {
        &PALETTE_ERROR
    };
    let box_title = if exit_ok {
        format!(" {} — OK ", title)
    } else {
        format!(" {} — FAILED ", title)
    };

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

            let banner_h = BANNER.len() as u16;
            let box_y = area.height.min(banner_h);
            let box_h = area.height.saturating_sub(box_y + 1);

            if area.height > box_y + 2 {
                let visible = box_h.saturating_sub(2) as usize;
                let display_lines: Vec<Line> = lines
                    .iter()
                    .skip(scroll)
                    .take(visible)
                    .map(|l| {
                        let lower = l.to_lowercase();
                        let color = if lower.contains("error") {
                            Color::LightRed
                        } else if lower.contains("warning") {
                            Color::Yellow
                        } else if lower.contains(" ok")
                            || lower.contains("pass")
                            || lower.starts_with("finished")
                        {
                            Color::LightGreen
                        } else {
                            Color::Reset
                        };
                        Line::from(Span::styled(l.clone(), Style::default().fg(color)))
                    })
                    .collect();
                f.render_widget(
                    Paragraph::new(display_lines)
                        .block(Block::default().title(box_title.clone()).borders(Borders::ALL)),
                    Rect::new(0, box_y, area.width, box_h),
                );
            }

            let footer_y = area.height.saturating_sub(1);
            f.render_widget(
                Paragraph::new("  j/k scroll · C copy · Esc/Enter return")
                    .style(Style::default().fg(Color::DarkGray)),
                Rect::new(0, footer_y, area.width, 1),
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
                        let _ = copy_to_clipboard(&lines.join("\n"));
                    }
                    KeyCode::Esc
                    | KeyCode::Enter
                    | KeyCode::Char('r')
                    | KeyCode::Char('R') => return Ok(()),
                    _ => {}
                }
            }
        }
    }
}
