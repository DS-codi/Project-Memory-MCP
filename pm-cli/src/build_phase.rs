// build_phase.rs — Phase-based build orchestration with real-time TUI progress streaming.
//
// run_build_component  – orchestrates all phases for a component, then shows summary
// run_build_phase      – spawns one build command, streams its output into the TUI
// run_native_streaming – re-invokes this binary as a CLI subcommand (Phase 2+ native builds)

use crate::animations::{AnimStyle, BannerRenderer, BANNER, PALETTE_DEFAULT};
use crate::code_index;
use crate::command_registry::CommandRegistry;
use crate::utils::project_root;
use crossterm::event::{self, Event, KeyCode, KeyEvent, KeyEventKind};
use ratatui::{
    backend::CrosstermBackend,
    layout::Rect,
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, Clear, Gauge, Paragraph},
    Terminal,
};
use std::collections::VecDeque;
use std::fs::OpenOptions;
use std::io::{self, BufRead, BufReader, Write};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

// ─── PhaseResult ─────────────────────────────────────────────────────────────

pub struct PhaseResult {
    pub component: String,
    pub phase: String,
    pub warn_count: usize,
    pub err_count: usize,
}

// ─── Build Component ─────────────────────────────────────────────────────────

pub fn run_build_component(
    terminal: &mut Terminal<CrosstermBackend<io::Stdout>>,
    component: &str,
    anim_style: AnimStyle,
) -> io::Result<()> {
    let _ = std::fs::write("build_warnings.log", "");

    let sub_components: Vec<&str> = if component == "All" {
        vec![
            "Supervisor",
            "SupervisorIced",
            "GuiForms",
            "InteractiveTerminal",
            "Server",
            "Dashboard",
            "Extension",
            "Cartographer",
            "ClientProxy",
            "GlobalClaude",
        ]
    } else {
        vec![component]
    };

    let root = project_root();

    // Snapshot current source state for each sub-component, diff against last build.
    let mut changelogs: Vec<(String, code_index::ChangeLog)> = Vec::new();
    for comp in &sub_components {
        let old = code_index::load(comp, &root).unwrap_or_default();
        let current = code_index::snapshot(comp, &root);
        let cl = code_index::diff(&old, &current);
        code_index::save(comp, &current, &root);
        changelogs.push((comp.to_string(), cl));
    }

    let mut results: Vec<PhaseResult> = Vec::new();

    for comp in &sub_components {
        let phases = CommandRegistry::build_phases(comp);
        for (phase_label, args) in &phases {
            let header = format!("{} - {}", comp, phase_label);
            let (warns, errs) = run_build_phase(terminal, &header, args, anim_style)?;
            results.push(PhaseResult {
                component: comp.to_string(),
                phase: phase_label.clone(),
                warn_count: warns,
                err_count: errs,
            });
        }
    }

    crate::warning_summary::show_warning_summary(terminal, &results, &changelogs, anim_style)
}

// ─── Build Phase ─────────────────────────────────────────────────────────────

pub fn run_build_phase(
    terminal: &mut Terminal<CrosstermBackend<io::Stdout>>,
    section_header: &str,
    args: &[String],
    anim_style: AnimStyle,
) -> io::Result<(usize, usize)> {
    if args.is_empty() {
        return Ok((0, 0));
    }

    // Append section separator to the persistent warning log.
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

    let (tx, rx) = std::sync::mpsc::channel::<String>();
    let tx2 = tx.clone();

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let _t1 = std::thread::spawn(move || {
        if let Some(pipe) = stdout {
            for line in BufReader::new(pipe).lines().flatten() {
                let _ = tx.send(line);
            }
        }
    });
    let _t2 = std::thread::spawn(move || {
        if let Some(pipe) = stderr {
            for line in BufReader::new(pipe).lines().flatten() {
                let _ = tx2.send(line);
            }
        }
    });

    let tick_rate = Duration::from_millis(40);
    let start_time = Instant::now();
    let mut last_frame = Instant::now();

    let mut lines_read: u64 = 0;
    let mut warn_count: usize = 0;
    let mut err_count: usize = 0;
    let mut live_log: VecDeque<String> = VecDeque::new();
    let mut current_phase = String::from("Initialising…");
    let mut done = false;
    let mut cancelled = false;
    let mut progress: u16 = 0;

    let mut banner = BannerRenderer::new(anim_style);

    loop {
        // Drain one line per tick to keep the UI responsive.
        match rx.recv_timeout(tick_rate) {
            Ok(line) => {
                lines_read += 1;
                let lower = line.to_lowercase();

                // Update the live phase label shown in the TUI.
                for key in &[
                    "compiling", "installing", "building", "linking",
                    "packaging", "bundling", "generating", "running",
                    "finished", "info:",
                ] {
                    if lower.contains(key) {
                        let trimmed = line.trim().chars().take(65).collect::<String>();
                        if !trimmed.is_empty() {
                            current_phase = trimmed;
                        }
                        break;
                    }
                }

                // Precise diagnostic capture:
                //   rustc/cargo:  starts_with("warning:") / "error:" / "-->"
                //   tsc:          contains("): error TS") / "): warning TS"
                // starts_with guards prevent false positives ("0 warnings emitted").
                let tl = line.trim().to_lowercase();
                let is_tsc_err = tl.contains("): error ts");
                let is_tsc_warn = tl.contains("): warning ts");
                let is_diag = tl.starts_with("warning:")
                    || tl.starts_with("warning[")
                    || tl.starts_with("error:")
                    || tl.starts_with("error[")
                    || tl.starts_with("-->")
                    || is_tsc_err
                    || is_tsc_warn;
                let is_fp = tl.contains("no warning")
                    || tl.contains("0 warning")
                    || tl.contains("no error");
                if is_diag && !is_fp {
                    if tl.starts_with("error") || is_tsc_err {
                        err_count += 1;
                    } else if tl.starts_with("warning") || is_tsc_warn {
                        warn_count += 1;
                    }
                }
                if !line.trim().is_empty() {
                    let _ = writeln!(log_file, "{}", line);
                }

                // 6-line ring buffer for the live output box.
                let tag = if tl.starts_with("error") || is_tsc_err {
                    "E"
                } else if tl.starts_with("warning") || is_tsc_warn {
                    "W"
                } else {
                    " "
                };
                live_log.push_back(format!("{} {}", tag, line));
                if live_log.len() > 6 {
                    live_log.pop_front();
                }
            }
            Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
                done = true;
            }
            Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {}
        }

        // Progress: max(line-based, time-based) prevents stalling during long link steps.
        if !done {
            let elapsed_secs = start_time.elapsed().as_secs();
            let line_pct = ((lines_read.min(200) as f64 / 200.0) * 99.0) as u16;
            let time_pct = (elapsed_secs.min(300) as f64 / 300.0 * 99.0) as u16;
            progress = line_pct.max(time_pct);
        }

        let elapsed = last_frame.elapsed();
        last_frame = Instant::now();

        let wall = start_time.elapsed().as_secs();
        let elapsed_str = format!("{:02}:{:02}", wall / 60, wall % 60);
        let phase_snap = current_phase.clone();
        let live_snap: Vec<String> = live_log.iter().cloned().collect();
        let wc = warn_count;
        let ec = err_count;
        let lc = lines_read;
        let prog = if done { 100 } else { progress };
        let is_cancelled = cancelled;
        let hdr = format!("  \u{25b6} {}   \u{23f1} {}", section_header, elapsed_str);

        terminal.draw(|f| {
            f.render_widget(Clear, f.area());
            banner.render_with_palette(f, elapsed, &PALETTE_DEFAULT);
            let area = f.area();
            let start_y = BANNER.len() as u16 + 1;

            if area.height > start_y {
                f.render_widget(
                    Paragraph::new(hdr.clone()).style(
                        Style::default()
                            .fg(Color::Cyan)
                            .add_modifier(Modifier::BOLD),
                    ),
                    Rect::new(0, start_y, area.width, 1),
                );
            }

            let phase_y = start_y + 1;
            if area.height > phase_y {
                f.render_widget(
                    Paragraph::new(format!("  {}", phase_snap))
                        .style(Style::default().fg(Color::White)),
                    Rect::new(0, phase_y, area.width, 1),
                );
            }

            let box_y = phase_y + 1;
            let box_h: u16 = 8;
            if area.height > box_y + box_h {
                let log_lines: Vec<Line> = live_snap
                    .iter()
                    .map(|l| {
                        let color = if l.starts_with("E ") {
                            Color::LightRed
                        } else if l.starts_with("W ") {
                            Color::Yellow
                        } else {
                            Color::DarkGray
                        };
                        let text = if l.len() > 2 { &l[2..] } else { l.as_str() };
                        Line::from(Span::styled(
                            text.to_string(),
                            Style::default().fg(color),
                        ))
                    })
                    .collect();
                f.render_widget(
                    Paragraph::new(log_lines)
                        .block(Block::default().title(" Live output ").borders(Borders::ALL)),
                    Rect::new(0, box_y, area.width, box_h),
                );
            }

            let counts_y = box_y + box_h;
            if area.height > counts_y {
                f.render_widget(
                    Paragraph::new(format!(
                        "  Warnings: {}   Errors: {}   Lines: {}",
                        wc, ec, lc
                    ))
                    .style(Style::default().fg(Color::DarkGray)),
                    Rect::new(0, counts_y, area.width, 1),
                );
            }

            let gauge_y = counts_y + 1;
            if area.height > gauge_y {
                let gauge_color = if is_cancelled {
                    Color::DarkGray
                } else if ec > 0 {
                    Color::Red
                } else if wc > 0 {
                    Color::Yellow
                } else {
                    Color::Cyan
                };
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

            let hint_y = counts_y + 2;
            if area.height > hint_y {
                f.render_widget(
                    Paragraph::new("  Esc / Q  cancel build")
                        .style(Style::default().fg(Color::DarkGray)),
                    Rect::new(0, hint_y, area.width, 1),
                );
            }
        })?;

        if !done {
            if event::poll(Duration::ZERO)? {
                if let Event::Key(KeyEvent {
                    code,
                    kind: KeyEventKind::Press,
                    ..
                }) = event::read()?
                {
                    if matches!(
                        code,
                        KeyCode::Esc | KeyCode::Char('q') | KeyCode::Char('Q')
                    ) {
                        let _ = child.kill();
                        cancelled = true;
                        done = true;
                    }
                }
            }
        }

        if done {
            break;
        }
    }

    let _ = child.wait();
    if cancelled {
        std::thread::sleep(Duration::from_millis(200));
        return Ok((warn_count, err_count));
    }
    std::thread::sleep(Duration::from_millis(400));
    Ok((warn_count, err_count))
}

// ─── Native streaming helper ──────────────────────────────────────────────────
//
// Re-invokes this binary with a subcommand so the TUI can stream a native
// build handler through run_build_phase. Use this once a command has a
// native arm in CommandRegistry.
//
// Example (Phase 2+):
//   run_native_streaming(terminal, "Supervisor — Rust Build", "install", &["supervisor"], style)

#[allow(dead_code)]
pub fn run_native_streaming(
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
