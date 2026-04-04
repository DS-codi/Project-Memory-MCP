// install_config.rs — Core install configuration for pm-cli.
// Handles persisted user preferences, binary deployment, and Qt dependency
// copying for all Project Memory components.
//
// Dependencies required in pm-cli/Cargo.toml (add from workspace):
//   serde  = { workspace = true }
//   toml   = { workspace = true }

use std::path::{Path, PathBuf};

// ---------------------------------------------------------------------------
// Public constants
// ---------------------------------------------------------------------------

/// Explicit list of Qt6 DLL names to copy alongside Qt-dependent binaries.
pub const QT_DLL_PATTERNS: &[&str] = &[
    "Qt6Core.dll",
    "Qt6Gui.dll",
    "Qt6Widgets.dll",
    "Qt6Qml.dll",
    "Qt6Quick.dll",
    "Qt6Network.dll",
    "Qt6OpenGL.dll",
    "Qt6Svg.dll",
];

// ---------------------------------------------------------------------------
// InstallConfig struct
// ---------------------------------------------------------------------------

/// Persisted install preferences for pm-cli.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct InstallConfig {
    /// Directory where compiled binaries (and their dependencies) are copied.
    pub install_dir: PathBuf,
    /// When true the user chose a permanent installation; when false a
    /// portable / temporary layout is used.
    pub use_permanent_install: bool,
}

// ---------------------------------------------------------------------------
// Directory helpers
// ---------------------------------------------------------------------------

/// Returns the default binary installation directory:
/// `<data_dir>/ProjectMemory/bin`
pub fn default_install_dir() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("ProjectMemory")
        .join("bin")
}

/// Returns the path of the saved configuration file:
/// `<data_dir>/ProjectMemory/pm-cli-config.toml`
pub fn config_file_path() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("ProjectMemory")
        .join("pm-cli-config.toml")
}

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

/// Loads a previously saved [`InstallConfig`] from disk, if one exists.
/// Returns `None` if the file is absent or cannot be parsed.
pub fn load_saved_config() -> Option<InstallConfig> {
    let path = config_file_path();
    if !path.exists() {
        return None;
    }
    let contents = std::fs::read_to_string(&path).ok()?;
    toml::from_str(&contents).ok()
}

/// Serialises `config` and writes it to [`config_file_path()`].
/// Parent directories are created automatically.
pub fn save_config(config: &InstallConfig) -> std::io::Result<()> {
    let path = config_file_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let contents = toml::to_string(config).map_err(|e| {
        std::io::Error::new(
            std::io::ErrorKind::Other,
            format!("Failed to serialise config: {e}"),
        )
    })?;
    std::fs::write(&path, contents)
}

/// Returns the saved config, falling back to sensible defaults when none
/// exists on disk.
pub fn load_or_default() -> InstallConfig {
    load_saved_config().unwrap_or_else(|| InstallConfig {
        install_dir: default_install_dir(),
        use_permanent_install: true,
    })
}

// ---------------------------------------------------------------------------
// Binary extension helper
// ---------------------------------------------------------------------------

/// Returns the platform binary extension (`.exe` on Windows, `""` elsewhere).
fn bin_ext() -> &'static str {
    #[cfg(windows)]
    {
        ".exe"
    }
    #[cfg(not(windows))]
    {
        ""
    }
}

/// Appends the platform binary extension to `name`.
fn binary_name(name: &str) -> String {
    format!("{}{}", name, bin_ext())
}

// ---------------------------------------------------------------------------
// copy_binaries
// ---------------------------------------------------------------------------

/// Copies the compiled binary (or binaries) for `component` from
/// `target/release/` into `config.install_dir`.
///
/// Supported component names:
/// * `"Supervisor"` – supervisor
/// * `"SupervisorIced"` – supervisor-iced
/// * `"GuiForms"` – pm-approval-gui + pm-brainstorm-gui
/// * `"Cartographer"` – cartographer-core
/// * `"InteractiveTerminal"` – from `interactive-terminal/target/release/`
/// * `"All"` – all of the above
pub fn copy_binaries(config: &InstallConfig, component: &str) -> std::io::Result<()> {
    std::fs::create_dir_all(&config.install_dir)?;

    match component {
        "Supervisor" => {
            copy_single_binary(
                Path::new("target/release"),
                &binary_name("supervisor"),
                &config.install_dir,
            )?;
        }
        "SupervisorIced" => {
            copy_single_binary(
                Path::new("target/release"),
                &binary_name("supervisor-iced"),
                &config.install_dir,
            )?;
        }
        "GuiForms" => {
            copy_single_binary(
                Path::new("target/release"),
                &binary_name("pm-approval-gui"),
                &config.install_dir,
            )?;
            copy_single_binary(
                Path::new("target/release"),
                &binary_name("pm-brainstorm-gui"),
                &config.install_dir,
            )?;
        }
        "Cartographer" => {
            copy_single_binary(
                Path::new("target/release"),
                &binary_name("cartographer-core"),
                &config.install_dir,
            )?;
        }
        "InteractiveTerminal" => {
            let src_dir = Path::new("interactive-terminal/target/release");
            copy_single_binary(
                src_dir,
                &binary_name("interactive-terminal"),
                &config.install_dir,
            )?;
        }
        "All" => {
            for sub in &[
                "Supervisor",
                "SupervisorIced",
                "GuiForms",
                "Cartographer",
                "InteractiveTerminal",
            ] {
                copy_binaries(config, sub)?;
            }
        }
        // Non-Rust-binary components — their artifacts are handled by dedicated
        // copy functions (copy_node_artifacts, copy_extension_artifact,
        // copy_mobile_artifacts) or install to a different target (GlobalClaude).
        // Container builds a registry image with no file artifact to copy.
        "Server" | "FallbackServer" | "Dashboard" | "Extension"
        | "Mobile" | "Container" | "GlobalClaude" => {}

        other => {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                format!("Unknown component: {other}"),
            ));
        }
    }

    Ok(())
}

/// Copies a single binary `file_name` from `src_dir` to `dst_dir`, printing
/// the source → destination path on success.
fn copy_single_binary(src_dir: &Path, file_name: &str, dst_dir: &Path) -> std::io::Result<()> {
    let src = src_dir.join(file_name);
    let dst = dst_dir.join(file_name);
    std::fs::copy(&src, &dst)?;
    println!("Copied: {} → {}", src.display(), dst.display());
    Ok(())
}

// ---------------------------------------------------------------------------
// copy_node_artifacts
// ---------------------------------------------------------------------------

/// Copies Node/web build artifacts into a sibling folder of `install_dir`:
/// * `server/dist/`    → `<install_dir>/../server/dist/`
/// * `dashboard/dist/` → `<install_dir>/../dashboard/dist/` (if present)
pub fn copy_node_artifacts(config: &InstallConfig) -> std::io::Result<()> {
    let base = config
        .install_dir
        .parent()
        .unwrap_or(&config.install_dir);

    // server/dist → <base>/server/dist/
    let server_src = Path::new("server/dist");
    if server_src.exists() {
        let server_dst = base.join("server").join("dist");
        std::fs::create_dir_all(&server_dst)?;
        copy_dir_all(server_src, &server_dst)?;
        println!(
            "Copied: {} → {}",
            server_src.display(),
            server_dst.display()
        );
    }

    // dashboard/dist → <base>/dashboard/dist/ (optional)
    let dashboard_src = Path::new("dashboard/dist");
    if dashboard_src.exists() {
        let dashboard_dst = base.join("dashboard").join("dist");
        std::fs::create_dir_all(&dashboard_dst)?;
        copy_dir_all(dashboard_src, &dashboard_dst)?;
        println!(
            "Copied: {} → {}",
            dashboard_src.display(),
            dashboard_dst.display()
        );
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// copy_extension_artifact
// ---------------------------------------------------------------------------

/// Copies the most recently packaged `.vsix` from `vscode-extension/` into
/// `config.install_dir`.
pub fn copy_extension_artifact(config: &InstallConfig) -> std::io::Result<()> {
    std::fs::create_dir_all(&config.install_dir)?;

    let ext_dir = Path::new("vscode-extension");
    if !ext_dir.exists() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            "vscode-extension/ directory not found",
        ));
    }

    let vsix = std::fs::read_dir(ext_dir)?
        .filter_map(|e| e.ok())
        .filter(|e| e.path().extension().and_then(|s| s.to_str()) == Some("vsix"))
        .max_by_key(|e| e.metadata().and_then(|m| m.modified()).ok());

    match vsix {
        None => Err(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            "no .vsix file found in vscode-extension/ — run build first",
        )),
        Some(entry) => {
            let src = entry.path();
            let dst = config.install_dir.join(entry.file_name());
            std::fs::copy(&src, &dst)?;
            println!("Copied: {} → {}", src.display(), dst.display());
            Ok(())
        }
    }
}

// ---------------------------------------------------------------------------
// copy_mobile_artifacts
// ---------------------------------------------------------------------------

/// Copies the mobile web build output from `mobile/dist/` into a `mobile/dist/`
/// sibling of `config.install_dir`.
///
/// Non-fatal when `mobile/dist/` does not exist (component may be skipped on
/// this machine).
pub fn copy_mobile_artifacts(config: &InstallConfig) -> std::io::Result<()> {
    let src = Path::new("mobile/dist");
    if !src.exists() {
        return Ok(());
    }

    let base = config.install_dir.parent().unwrap_or(&config.install_dir);
    let dst = base.join("mobile").join("dist");
    std::fs::create_dir_all(&dst)?;
    copy_dir_all(src, &dst)?;
    println!("Copied: {} → {}", src.display(), dst.display());
    Ok(())
}

/// Recursively copies every file and sub-directory from `src` into `dst`.
/// `dst` must already exist (or be created by the caller).
fn copy_dir_all(src: &Path, dst: &Path) -> std::io::Result<()> {
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let file_type = entry.file_type()?;
        let dest_path = dst.join(entry.file_name());

        if file_type.is_dir() {
            std::fs::create_dir_all(&dest_path)?;
            copy_dir_all(&entry.path(), &dest_path)?;
        } else {
            std::fs::copy(entry.path(), &dest_path)?;
        }
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Qt helpers
// ---------------------------------------------------------------------------

/// Returns `true` when `component` requires Qt runtime libraries.
pub fn is_qt_component(component: &str) -> bool {
    matches!(component, "Supervisor" | "GuiForms" | "InteractiveTerminal")
}

/// Copies Qt DLL files and supporting plugin directories from the component's
/// `target/release/` directory into `config.install_dir`.
///
/// Skips any file or directory that does not exist (non-fatal).
pub fn copy_qt_dependencies(config: &InstallConfig, component: &str) -> std::io::Result<()> {
    let src_dir: PathBuf = if component == "InteractiveTerminal" {
        PathBuf::from("interactive-terminal/target/release")
    } else {
        PathBuf::from("target/release")
    };

    std::fs::create_dir_all(&config.install_dir)?;

    // ── Individual Qt DLL files ──────────────────────────────────────────
    for dll in QT_DLL_PATTERNS {
        let src = src_dir.join(dll);
        if src.exists() {
            let dst = config.install_dir.join(dll);
            std::fs::copy(&src, &dst)?;
            println!("Copied Qt DLL: {} → {}", src.display(), dst.display());
        }
    }

    // ── Qt plugin / QML directories ──────────────────────────────────────
    let qt_dirs = ["platforms", "qml", "imageformats", "iconengines", "tls"];
    for dir_name in &qt_dirs {
        let src = src_dir.join(dir_name);
        if src.exists() {
            let dst = config.install_dir.join(dir_name);
            std::fs::create_dir_all(&dst)?;
            copy_dir_all(&src, &dst)?;
            println!(
                "Copied Qt dir: {} → {}",
                src.display(),
                dst.display()
            );
        }
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// TUI install-directory prompt (Ratatui-Explorer)
// ---------------------------------------------------------------------------

/// Prompt the user for an install directory via a TUI file explorer.
/// Pre-fills with the current/default install_dir.
/// Returns the chosen path, or None if the user pressed Esc.
pub fn prompt_install_dir(current: &std::path::Path) -> Option<std::path::PathBuf> {
    use ratatui::{
        backend::CrosstermBackend,
        crossterm::{
            event::{self, Event, KeyCode, KeyEventKind},
            execute,
            terminal::{self, EnterAlternateScreen, LeaveAlternateScreen},
        },
        layout::{Constraint, Direction, Layout},
        style::{Color, Modifier, Style},
        text::Line,
        widgets::{Block, Borders, Clear, Paragraph, WidgetRef},
        Terminal,
    };
    use ratatui_explorer::{FileExplorerBuilder, Theme};
    use std::io;

    let _ = terminal::enable_raw_mode();
    let mut stdout = io::stdout();
    let _ = execute!(stdout, EnterAlternateScreen);
    let backend = CrosstermBackend::new(stdout);
    let mut terminal = Terminal::new(backend).ok()?;

    let theme = Theme::default()
        .with_highlight_item_style(Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD))
        .with_highlight_symbol("> ".into());
    
    let mut explorer = FileExplorerBuilder::default()
        .theme(theme)
        .build()
        .ok()?;

    // Try to start at the current directory if it exists
    if current.exists() {
        let _ = explorer.set_cwd(current);
    }

    let mut result = None;

    loop {
        let _ = terminal.draw(|f| {
            f.render_widget(Clear, f.area());
            
            let chunks = Layout::default()
                .direction(Direction::Vertical)
                .constraints([
                    Constraint::Length(3),
                    Constraint::Min(0),
                    Constraint::Length(3),
                ])
                .split(f.area());

            // Header
            let header = Paragraph::new(vec![
                Line::from("  Select Installation Directory"),
                Line::from(format!("  Current: {}", explorer.cwd().display())),
            ])
            .block(Block::default().borders(Borders::BOTTOM));
            f.render_widget(header, chunks[0]);

            // Explorer
            explorer.widget().render_ref(chunks[1], f.buffer_mut());

            // Footer
            let footer = Paragraph::new("  Enter to choose · Esc to cancel · Arrows to navigate")
                .block(Block::default().borders(Borders::TOP))
                .style(Style::default().fg(Color::DarkGray));
            f.render_widget(footer, chunks[2]);
        });

        if let Ok(Event::Key(key)) = event::read() {
            if key.kind != KeyEventKind::Press {
                continue;
            }
            match key.code {
                KeyCode::Esc => break,
                KeyCode::Enter => {
                    // Choose the current directory shown in the explorer
                    result = Some(explorer.cwd().to_path_buf());
                    break;
                }
                _ => {
                    let _ = explorer.handle(&Event::Key(key));
                }
            }
        }
    }

    let _ = terminal::disable_raw_mode();
    let _ = execute!(io::stdout(), LeaveAlternateScreen);

    result
}

/// Loads a saved config, or interactively prompts for the install directory.
///
/// 1. Tries [`load_saved_config()`].
/// 2. If not found, calls [`prompt_install_dir()`] with the default path.
/// 3. If the user confirms a path, persists it and returns the new config.
/// 4. Falls back to [`load_or_default()`] if the prompt is cancelled.
pub fn load_or_prompt() -> InstallConfig {
    if let Some(saved) = load_saved_config() {
        return saved;
    }
    let default = default_install_dir();
    if let Some(chosen) = prompt_install_dir(&default) {
        let config = InstallConfig {
            install_dir: chosen,
            use_permanent_install: true,
        };
        let _ = save_config(&config);
        return config;
    }
    load_or_default()
}

// ---------------------------------------------------------------------------
// deploy — public high-level entry point
// ---------------------------------------------------------------------------

/// Deploys a component by:
/// 1. Loading (or defaulting) the saved [`InstallConfig`].
/// 2. Optionally overriding `install_dir` with `install_dir_override`.
/// 3. Copying the component's binaries to `install_dir`.
/// 4. If the component is Qt-based, copying Qt runtime dependencies.
/// 5. Printing a confirmation line on success.
pub fn deploy(
    component: &str,
    install_dir_override: Option<&Path>,
) -> std::io::Result<()> {
    // If an explicit --dir was given, load (or default) and override.
    // Otherwise, prompt the user with the TUI directory picker so they can
    // choose (or confirm) the install location on every first-time deploy.
    let mut config = if install_dir_override.is_some() {
        load_or_default()
    } else {
        load_or_prompt()
    };

    if let Some(override_path) = install_dir_override {
        config.install_dir = override_path.to_path_buf();
    }

    copy_binaries(&config, component)?;

    if is_qt_component(component) {
        copy_qt_dependencies(&config, component)?;
    }

    if matches!(component, "Server" | "FallbackServer" | "Dashboard" | "All") {
        copy_node_artifacts(&config)?;
    }

    if matches!(component, "Extension" | "All") {
        copy_extension_artifact(&config)?;
    }

    if matches!(component, "Mobile" | "All") {
        copy_mobile_artifacts(&config)?;
    }

    println!(
        "Deployed {} to {}",
        component,
        config.install_dir.display()
    );

    Ok(())
}

// ---------------------------------------------------------------------------
// create_shortcut
// ---------------------------------------------------------------------------

/// Creates `.lnk` shortcuts for `component` at one or both standard locations.
///
/// * `desktop`    — user's Desktop (`~/Desktop/`)
/// * `start_menu` — Start Menu Programs (`%APPDATA%/Microsoft/Windows/Start Menu/Programs/`)
///
/// When neither flag is set, both locations are used.
/// Returns an error if the target binary is absent from `install_dir` — deploy first.
#[cfg(windows)]
pub fn create_shortcut(
    config: &InstallConfig,
    component: &str,
    desktop: bool,
    start_menu: bool,
) -> std::io::Result<()> {
    let (binary_name, friendly_name) = match component {
        "Supervisor"     => ("supervisor.exe",      "Project Memory Supervisor"),
        "SupervisorIced" => ("supervisor-iced.exe", "Project Memory"),
        _ => return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            format!("Shortcuts are only supported for Supervisor and SupervisorIced, not '{component}'"),
        )),
    };

    let target_exe = config.install_dir.join(binary_name);
    if !target_exe.exists() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            format!(
                "{binary_name} not found at {} — run `pm-cli deploy {component}` first",
                config.install_dir.display()
            ),
        ));
    }

    let lnk_name = format!("{friendly_name}.lnk");

    let mut link = mslnk::ShellLink::new(&target_exe)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e.to_string()))?;
    link.set_working_dir(Some(config.install_dir.to_string_lossy().into_owned()));
    link.set_name(Some(friendly_name.to_string()));

    // Default: both locations when neither flag is explicitly set
    let do_desktop    = desktop    || !start_menu;
    let do_start_menu = start_menu || !desktop;

    let mut written = 0usize;

    if do_desktop {
        if let Some(dir) = dirs::desktop_dir() {
            let path = dir.join(&lnk_name);
            link.create_lnk(&path)
                .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e.to_string()))?;
            println!("   [ok] Desktop shortcut: {}", path.display());
            written += 1;
        }
    }

    if do_start_menu {
        if let Some(data) = dirs::data_dir() {
            let programs = data.join("Microsoft/Windows/Start Menu/Programs");
            if programs.exists() {
                let path = programs.join(&lnk_name);
                link.create_lnk(&path)
                    .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e.to_string()))?;
                println!("   [ok] Start Menu shortcut: {}", path.display());
                written += 1;
            }
        }
    }

    if written == 0 {
        println!("   [!] No shortcut locations resolved — check user profile directories");
    }

    Ok(())
}

#[cfg(not(windows))]
pub fn create_shortcut(
    _config: &InstallConfig,
    _component: &str,
    _desktop: bool,
    _start_menu: bool,
) -> std::io::Result<()> {
    Err(std::io::Error::new(
        std::io::ErrorKind::Unsupported,
        "Shortcut creation is only supported on Windows",
    ))
}
