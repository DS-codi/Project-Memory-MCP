// launch_menu.rs — Launch application submenu (QML Supervisor primary).

use crate::animations::{AnimStyle, BannerRenderer, PALETTE_DEFAULT};
use crate::fallback::powershell::PowerShellFallback;
use crate::utils::run_detached;
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
use std::time::{Duration, Instant};

const MENU_Y: u16 = 9;

pub fn show_launch_submenu(
    terminal: &mut Terminal<CrosstermBackend<io::Stdout>>,
    anim_style: AnimStyle,
) -> io::Result<()> {
    const LAUNCH_ITEMS: &[&str] = &["Launch Supervisor", "Back"];
    let mut selected: usize = 0;
    let mut banner = BannerRenderer::new(anim_style);
    let mut last_frame = Instant::now();
    let tick_rate = Duration::from_millis(40);

    loop {
        let elapsed = last_frame.elapsed();
        last_frame = Instant::now();

        terminal.draw(|f| {
            f.render_widget(Clear, f.area());
            banner.render_with_palette(f, elapsed, &PALETTE_DEFAULT);
            let area = f.area();

            if area.height > MENU_Y {
                let items: Vec<Line> = LAUNCH_ITEMS
                    .iter()
                    .enumerate()
                    .map(|(i, &item)| {
                        if i == selected {
                            Line::from(Span::styled(
                                format!("> {}", item),
                                Style::default()
                                    .fg(Color::Yellow)
                                    .add_modifier(Modifier::BOLD),
                            ))
                        } else {
                            Line::from(format!("  {}", item))
                        }
                    })
                    .collect();
                f.render_widget(
                    Paragraph::new(items),
                    Rect::new(
                        2,
                        MENU_Y,
                        area.width.saturating_sub(4),
                        LAUNCH_ITEMS.len() as u16,
                    ),
                );
            }
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
                    KeyCode::Esc | KeyCode::Char('q') => return Ok(()),
                    KeyCode::Enter => match selected {
                        0 => {
                            // QML Supervisor is the primary app — launch via PowerShell.
                            run_detached(&PowerShellFallback::build_args(
                                "scripts/launch.ps1",
                                &[],
                            ));
                            return Ok(());
                        }
                        _ => return Ok(()),
                    },
                    _ => {}
                }
            }
        }
    }
}
