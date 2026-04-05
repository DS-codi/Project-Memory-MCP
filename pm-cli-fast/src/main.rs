// pm-cli-fast: same as pm-cli but without tachyonfx for faster compile times.
// animations.rs is a local stub; all other modules are sourced directly from
// pm-cli/src/ via #[path] so there is no duplicated code to maintain.

mod animations; // local stub — no tachyonfx

#[path = "../../pm-cli/src/build_phase.rs"]     mod build_phase;
#[path = "../../pm-cli/src/builds.rs"]          mod builds;
#[path = "../../pm-cli/src/command_registry.rs"] mod command_registry;
#[path = "../../pm-cli/src/fallback/mod.rs"]    mod fallback;
#[path = "../../pm-cli/src/global_claude.rs"]   mod global_claude;
#[path = "../../pm-cli/src/install_config.rs"]  mod install_config;
#[path = "../../pm-cli/src/install_menu.rs"]    mod install_menu;
#[path = "../../pm-cli/src/launch_menu.rs"]     mod launch_menu;
#[path = "../../pm-cli/src/output_viewer.rs"]   mod output_viewer;
#[path = "../../pm-cli/src/utils.rs"]           mod utils;
#[path = "../../pm-cli/src/warning_summary.rs"] mod warning_summary;

use animations::{AnimStyle, BannerRenderer};
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
    layout::Rect,
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Clear, Paragraph},
    Terminal,
};
use std::io;
use std::time::{Duration, Instant};

// ─── Menu constants ───────────────────────────────────────────────────────────

const MENU_ITEMS: &[&str] = &[
    "Install Components",
    "Test Components",
    "Launch Application",
    "Lint QML Files",
    "Stream Command Output",
    "Quit",
];

const MENU_Y: u16 = 9;
const STATUS_Y: u16 = 18;

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
    let cli_args: Vec<String> = std::env::args().skip(1).collect();
    if !cli_args.is_empty() {
        let code = CommandRegistry::dispatch(&cli_args[0], &cli_args[1..]);
        std::process::exit(code);
    }

    let _config = install_config::load_or_prompt();

    terminal::enable_raw_mode()?;
    let mut stdout = io::stdout();
    execute!(stdout, terminal::EnterAlternateScreen, cursor::Hide)?;
    let backend = CrosstermBackend::new(stdout);
    let mut term = Terminal::new(backend)?;
    let _guard = TerminalGuard;

    while event::poll(Duration::from_millis(50))? {
        let _ = event::read()?;
    }

    run_app(&mut term)
}

// ─── Main application loop ────────────────────────────────────────────────────

fn run_app(terminal: &mut Terminal<CrosstermBackend<io::Stdout>>) -> io::Result<()> {
    let mut selected: usize = 0;
    let mut anim_style = AnimStyle::Wave;
    let mut banner = BannerRenderer::new(anim_style);
    let mut last_frame = Instant::now();
    let tick_rate = Duration::from_millis(40);

    loop {
        let elapsed = last_frame.elapsed();
        last_frame = Instant::now();

        terminal.draw(|f| {
            f.render_widget(Clear, f.area());
            banner.render(f, elapsed);
            let area = f.area();

            if area.height > MENU_Y {
                let menu_lines: Vec<Line> = MENU_ITEMS
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
                    Paragraph::new(menu_lines),
                    Rect::new(
                        2,
                        MENU_Y,
                        area.width.saturating_sub(4),
                        MENU_ITEMS.len() as u16,
                    ),
                );
            }

            if area.height > STATUS_Y {
                let hint = format!(
                    "  Arrows/1-{n} select · Enter confirm · Tab cycle anim [{anim}] · Q quit",
                    n = MENU_ITEMS.len(),
                    anim = anim_style.name(),
                );
                f.render_widget(
                    Paragraph::new(hint).style(Style::default().fg(Color::DarkGray)),
                    Rect::new(0, STATUS_Y, area.width, 1),
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
                            selected = MENU_ITEMS.len() - 1;
                        }
                    }
                    KeyCode::Down | KeyCode::Char('j') => {
                        selected = (selected + 1) % MENU_ITEMS.len();
                    }
                    KeyCode::Char(c) if c.is_ascii_digit() => {
                        let n = c as usize - b'1' as usize;
                        if n < MENU_ITEMS.len() {
                            selected = n;
                        }
                    }
                    KeyCode::Tab => {
                        anim_style = anim_style.next();
                        banner.set_style(anim_style);
                    }
                    KeyCode::BackTab => {
                        anim_style = anim_style.prev();
                        banner.set_style(anim_style);
                    }
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
    }
}

// ─── Action dispatcher ────────────────────────────────────────────────────────

fn handle_action(
    terminal: &mut Terminal<CrosstermBackend<io::Stdout>>,
    action: usize,
    anim_style: AnimStyle,
) -> io::Result<()> {
    match action {
        0 => install_menu::show_install_submenu(terminal, anim_style)?,
        1 => {
            let args = PowerShellFallback::build_args("scripts/test.ps1", &[]);
            let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
            output_viewer::run_streaming_command(terminal, "Run Tests", &refs, anim_style)?;
        }
        2 => launch_menu::show_launch_submenu(terminal, anim_style)?,
        3 => {
            let args = PowerShellFallback::build_args("scripts/qmllint.ps1", &[]);
            let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
            output_viewer::run_streaming_command(terminal, "QML Lint", &refs, anim_style)?;
        }
        4 => {
            let args = PowerShellFallback::build_args(
                "scripts/cli-qmllint.ps1",
                &["-Component", "all"],
            );
            let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
            output_viewer::run_streaming_command(terminal, "QML Lint (all)", &refs, anim_style)?;
        }
        _ => {}
    }
    Ok(())
}
