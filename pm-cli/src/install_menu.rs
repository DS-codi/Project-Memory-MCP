// install_menu.rs — Install component submenu and post-build deploy confirmation.

use crate::animations::{AnimStyle, BannerRenderer, BANNER, PALETTE_DEFAULT, PALETTE_SUCCESS};
use crate::build_phase::run_build_component;
use crate::install_config;
use crossterm::{cursor, event::{self, Event, KeyCode, KeyEvent, KeyEventKind}, execute, terminal};
use ratatui::{
    backend::CrosstermBackend,
    layout::Rect,
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Clear, Paragraph},
    Terminal,
};
use std::io::{self, Write};
use std::time::{Duration, Instant};

const MENU_Y: u16 = 9;
const STATUS_Y: u16 = 18;

const COMPONENT_NAMES: &[&str] = &[
    "All",
    "Supervisor",
    "SupervisorIced",
    "GuiForms",
    "InteractiveTerminal",
    "Server",
    "FallbackServer",
    "Dashboard",
    "Extension",
    "Cartographer",
    "Mobile",
    "Container",
    "GlobalClaude",
];

pub fn show_install_submenu(
    terminal: &mut Terminal<CrosstermBackend<io::Stdout>>,
    anim_style: AnimStyle,
) -> io::Result<()> {
    let mut selected: usize = 0;
    let mut install_cfg = install_config::load_or_default();
    let mut banner = BannerRenderer::new(anim_style);
    let mut last_frame = Instant::now();
    let tick_rate = Duration::from_millis(40);

    loop {
        let elapsed = last_frame.elapsed();
        last_frame = Instant::now();
        let dir_str = install_cfg.install_dir.display().to_string();

        terminal.draw(|f| {
            f.render_widget(Clear, f.area());
            banner.render_with_palette(f, elapsed, &PALETTE_DEFAULT);
            let area = f.area();

            if area.height > MENU_Y {
                let items: Vec<Line> = COMPONENT_NAMES
                    .iter()
                    .enumerate()
                    .map(|(i, &name)| {
                        if i == selected {
                            Line::from(Span::styled(
                                format!("> Build & Install: {}", name),
                                Style::default()
                                    .fg(Color::Cyan)
                                    .add_modifier(Modifier::BOLD),
                            ))
                        } else {
                            Line::from(format!("  Build & Install: {}", name))
                        }
                    })
                    .collect();
                f.render_widget(
                    Paragraph::new(items),
                    Rect::new(
                        2,
                        MENU_Y,
                        area.width.saturating_sub(4),
                        COMPONENT_NAMES.len() as u16,
                    ),
                );
            }

            if area.height > STATUS_Y + 1 {
                f.render_widget(
                    Paragraph::new(vec![
                        Line::from(Span::styled(
                            format!("  Install dir: {}", dir_str),
                            Style::default().fg(Color::Cyan),
                        )),
                        Line::from(Span::styled(
                            "  Enter build · D change dir · Esc back",
                            Style::default().fg(Color::DarkGray),
                        )),
                    ]),
                    Rect::new(0, STATUS_Y, area.width, 2),
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
                            selected = COMPONENT_NAMES.len() - 1;
                        }
                    }
                    KeyCode::Down | KeyCode::Char('j') => {
                        selected = (selected + 1) % COMPONENT_NAMES.len();
                    }
                    KeyCode::Esc | KeyCode::Char('q') => return Ok(()),
                    KeyCode::Char('d') | KeyCode::Char('D') => {
                        // Leave TUI, open the ratatui-explorer directory picker, re-enter TUI.
                        let _ = terminal::disable_raw_mode();
                        let _ = execute!(
                            io::stdout(),
                            terminal::LeaveAlternateScreen,
                            cursor::Show
                        );
                        if let Some(new_dir) =
                            install_config::prompt_install_dir(&install_cfg.install_dir)
                        {
                            install_cfg.install_dir = new_dir;
                            let _ = install_config::save_config(&install_cfg);
                        }
                        let _ = terminal::enable_raw_mode();
                        let _ = execute!(
                            io::stdout(),
                            terminal::EnterAlternateScreen,
                            cursor::Hide
                        );
                        let _ = terminal.clear();
                    }
                    KeyCode::Enter => {
                        let component = COMPONENT_NAMES[selected];
                        run_build_component(terminal, component, anim_style)?;
                        run_deploy_after_build(terminal, component, &install_cfg, anim_style)?;
                        let _ = terminal.clear();
                    }
                    _ => {}
                }
            }
        }
    }
}

pub fn run_deploy_after_build(
    terminal: &mut Terminal<CrosstermBackend<io::Stdout>>,
    component: &str,
    config: &install_config::InstallConfig,
    anim_style: AnimStyle,
) -> io::Result<()> {
    let dir = config.install_dir.display().to_string();
    let mut banner = BannerRenderer::new(anim_style);
    let mut last_frame = Instant::now();
    let tick_rate = Duration::from_millis(40);

    loop {
        let elapsed = last_frame.elapsed();
        last_frame = Instant::now();
        let comp = component.to_string();
        let d = dir.clone();

        terminal.draw(|f| {
            f.render_widget(Clear, f.area());
            banner.render_with_palette(f, elapsed, &PALETTE_SUCCESS);
            let area = f.area();
            let start_y = BANNER.len() as u16 + 1;

            if area.height > start_y + 3 {
                f.render_widget(
                    Paragraph::new(vec![
                        Line::from(Span::styled(
                            format!("  Deploy {} to install directory?", comp),
                            Style::default().fg(Color::White).add_modifier(Modifier::BOLD),
                        )),
                        Line::from(Span::styled(
                            format!("  → {}", d),
                            Style::default().fg(Color::Cyan),
                        )),
                        Line::from(""),
                        Line::from(Span::styled(
                            "  Y deploy   N skip   Esc skip",
                            Style::default().fg(Color::DarkGray),
                        )),
                    ]),
                    Rect::new(
                        0,
                        start_y,
                        area.width,
                        area.height.saturating_sub(start_y),
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
                    KeyCode::Char('y') | KeyCode::Char('Y') | KeyCode::Enter => {
                        let _ = terminal::disable_raw_mode();
                        let _ = execute!(
                            io::stdout(),
                            terminal::LeaveAlternateScreen,
                            cursor::Show
                        );
                        println!(
                            "\nDeploying {} to {} ...",
                            component,
                            config.install_dir.display()
                        );
                        match install_config::deploy(component, Some(&config.install_dir)) {
                            Ok(()) => println!("\n  Deploy complete."),
                            Err(e) => println!("\n  Deploy failed: {e}"),
                        }
                        println!("\n  Press Enter to return...");
                        let _ = io::stdout().flush();
                        let _ = io::stdin().read_line(&mut String::new());
                        let _ = terminal::enable_raw_mode();
                        let _ = execute!(
                            io::stdout(),
                            terminal::EnterAlternateScreen,
                            cursor::Hide
                        );
                        return Ok(());
                    }
                    KeyCode::Char('n') | KeyCode::Char('N') | KeyCode::Esc => return Ok(()),
                    _ => {}
                }
            }
        }
    }
}
