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
// TUI install-directory prompt
// ---------------------------------------------------------------------------

/// Prompt the user for an install directory via a simple terminal input.
/// Pre-fills with the current/default install_dir.
/// Returns the chosen path, or None if the user pressed Esc.
pub fn prompt_install_dir(current: &std::path::Path) -> Option<std::path::PathBuf> {
    use crossterm::{
        cursor,
        event::{self, Event, KeyCode, KeyEventKind},
        execute,
        terminal,
    };
    use std::io::Write;

    let _ = terminal::enable_raw_mode();
    let mut stdout = std::io::stdout();

    let mut input = current.to_string_lossy().to_string();
    let mut cursor_pos = input.len();

    print!("\r\n  Install directory: ");
    print!("{}", input);
    let _ = stdout.flush();

    loop {
        if let Ok(Event::Key(key)) = event::read() {
            if key.kind != KeyEventKind::Press {
                continue;
            }
            match key.code {
                KeyCode::Enter => {
                    let _ = terminal::disable_raw_mode();
                    println!();
                    if input.trim().is_empty() {
                        return Some(current.to_path_buf());
                    }
                    return Some(std::path::PathBuf::from(input.trim()));
                }
                KeyCode::Esc => {
                    let _ = terminal::disable_raw_mode();
                    println!();
                    return None;
                }
                KeyCode::Backspace => {
                    if cursor_pos > 0 {
                        input.remove(cursor_pos - 1);
                        cursor_pos -= 1;
                        // Redraw
                        let _ = execute!(stdout, cursor::MoveToColumn(0));
                        print!("\r  Install directory: {:<width$}", input, width = input.len() + 5);
                        let col = (22 + cursor_pos) as u16;
                        let _ = execute!(stdout, cursor::MoveToColumn(col));
                        let _ = stdout.flush();
                    }
                }
                KeyCode::Char(c) => {
                    input.insert(cursor_pos, c);
                    cursor_pos += 1;
                    let _ = execute!(stdout, cursor::MoveToColumn(0));
                    print!("\r  Install directory: {}", input);
                    let col = (22 + cursor_pos) as u16;
                    let _ = execute!(stdout, cursor::MoveToColumn(col));
                    let _ = stdout.flush();
                }
                _ => {}
            }
        }
    }
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
    let mut config = load_or_default();

    if let Some(override_path) = install_dir_override {
        config.install_dir = override_path.to_path_buf();
    }

    copy_binaries(&config, component)?;

    if is_qt_component(component) {
        copy_qt_dependencies(&config, component)?;
    }

    println!(
        "Deployed {} to {}",
        component,
        config.install_dir.display()
    );

    Ok(())
}
