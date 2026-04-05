// builds.rs — Native Rust build implementations for pm-cli components.
//
// Each public function is the target of a self-referential dispatch arm:
//   build_phases("SupervisorIced") → [current_exe, "build-supervisor-iced"]
//   dispatch("build-supervisor-iced", []) → builds::supervisor_iced()
//
// Output is printed to stdout so the TUI's run_build_phase pipeline
// captures and streams it live.
//
// Phase 3 (Qt-dependent) builds — Supervisor, GuiForms, InteractiveTerminal,
// and QML Lint — remain PS-backed until the Qt resolver is ported to Rust.
// They are marked with explicit TODO comments in command_registry::build_phases.

use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/// Returns the project root by walking up from the exe until a `Cargo.toml` is found.
///
/// Handles two layouts:
/// * `<root>/target/{release,debug}/pm-cli[.exe]` — standard cargo output
/// * `<root>/pm-cli[.exe]`                        — copied to project root by build-cli.ps1
///
/// Falls back to the current working directory if no `Cargo.toml` is found
/// (e.g. when pm-cli is run from an installed location outside the repo).
fn project_root() -> PathBuf {
    let exe = match std::env::current_exe() {
        Ok(p) => p,
        Err(_) => return std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")),
    };

    let mut candidate = exe.parent().map(|p| p.to_path_buf());
    while let Some(dir) = candidate {
        if dir.join("Cargo.toml").exists() {
            return dir;
        }
        candidate = dir.parent().map(|p| p.to_path_buf());
    }

    std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
}

/// Spawns `program` with `args` in `dir`, forwarding its stdout and stderr
/// through to our own streams so the TUI pipeline captures the output.
fn run_in(program: &str, args: &[&str], dir: &Path) -> Result<(), String> {
    let status = Command::new(program)
        .args(args)
        .current_dir(dir)
        .stdin(Stdio::null())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .status()
        .map_err(|e| format!("Failed to spawn '{program}': {e}"))?;

    if status.success() {
        Ok(())
    } else {
        Err(format!(
            "'{program}' exited with code {}",
            status.code().unwrap_or(1)
        ))
    }
}

/// Kills all processes with the given image name on Windows (non-fatal).
/// Used to release a locked binary before overwriting it.
fn kill_by_name(image_name: &str) {
    let _ = Command::new("taskkill")
        .args(["/F", "/IM", image_name, "/T"])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();
}

/// Runs an npm command in `dir`, clearing NODE_OPTIONS first to prevent
/// VS Code preloads (win-ca etc.) from crashing the CLI build.
fn npm(args: &[&str], dir: &Path) -> Result<(), String> {
    let status = Command::new("npm")
        .args(args)
        .current_dir(dir)
        .env_remove("NODE_OPTIONS")
        .stdin(Stdio::null())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .status()
        .map_err(|e| format!("npm: {e}"))?;

    if status.success() {
        Ok(())
    } else {
        Err(format!(
            "npm {} failed (exit {})",
            args.join(" "),
            status.code().unwrap_or(1)
        ))
    }
}

/// Runs an npx command in `dir`, clearing NODE_OPTIONS first.
fn npx(args: &[&str], dir: &Path) -> Result<(), String> {
    let status = Command::new("npx")
        .args(args)
        .current_dir(dir)
        .env_remove("NODE_OPTIONS")
        .stdin(Stdio::null())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .status()
        .map_err(|e| format!("npx: {e}"))?;

    if status.success() {
        Ok(())
    } else {
        Err(format!(
            "npx {} failed (exit {})",
            args.join(" "),
            status.code().unwrap_or(1)
        ))
    }
}

/// Runs a `node` command in `dir`, clearing NODE_OPTIONS first.
fn node_run(args: &[&str], dir: &Path) -> Result<(), String> {
    let status = Command::new("node")
        .args(args)
        .current_dir(dir)
        .env_remove("NODE_OPTIONS")
        .stdin(Stdio::null())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .status()
        .map_err(|e| format!("node: {e}"))?;

    if status.success() {
        Ok(())
    } else {
        Err(format!(
            "node {} failed (exit {})",
            args.join(" "),
            status.code().unwrap_or(1)
        ))
    }
}

// ---------------------------------------------------------------------------
// Rust builds
// ---------------------------------------------------------------------------

/// Builds supervisor-iced:
///   1. Kills any running supervisor-iced process (releases the locked .exe).
///   2. Runs `cargo build --release -p supervisor-iced`.
///   3. Copies tray icon assets from supervisor/assets/icons/ → target/release/.
pub fn supervisor_iced() -> Result<(), String> {
    println!("-- Building supervisor-iced");

    kill_by_name("supervisor-iced.exe");

    println!("Building supervisor-iced...");
    run_in("cargo", &["build", "--release", "-p", "supervisor-iced"], Path::new("."))?;

    // Copy tray icon assets (non-fatal — may not exist on all machines)
    let root = project_root();
    let icons_src = root.join("supervisor/assets/icons");
    let icons_dst = root.join("target/release");
    if icons_src.exists() {
        let mut copied = 0usize;
        if let Ok(entries) = std::fs::read_dir(&icons_src) {
            for entry in entries.flatten() {
                if entry.path().extension().and_then(|s| s.to_str()) == Some("ico") {
                    let dst = icons_dst.join(entry.file_name());
                    if std::fs::copy(entry.path(), &dst).is_ok() {
                        copied += 1;
                    }
                }
            }
        }
        if copied > 0 {
            println!("Tray icons copied to target/release ({copied} file(s))");
        }
    }

    println!("supervisor-iced built OK -> target/release/supervisor-iced.exe");
    Ok(())
}

/// Builds interactive-terminal-iced:
///   1. Kills any running interactive-terminal-iced process.
///   2. Runs `cargo build --release -p interactive-terminal-iced`.
pub fn interactive_terminal_iced() -> Result<(), String> {
    println!("-- Building interactive-terminal-iced");

    kill_by_name("interactive-terminal-iced.exe");

    println!("Building interactive-terminal-iced...");
    run_in("cargo", &["build", "--release", "-p", "interactive-terminal-iced"], Path::new("."))?;

    println!("interactive-terminal-iced built OK -> target/release/interactive-terminal-iced.exe");
    Ok(())
}

/// Builds client-proxy: `cargo build --release -p client-proxy`.
pub fn client_proxy() -> Result<(), String> {
    println!("-- Building client-proxy");
    run_in("cargo", &["build", "--release", "-p", "client-proxy"], Path::new("."))?;
    println!("client-proxy built OK -> target/release/client-proxy.exe");
    Ok(())
}

/// Builds cartographer-core: `cargo build --release -p cartographer-core`.
pub fn cartographer() -> Result<(), String> {
    println!("-- Building cartographer-core");
    run_in("cargo", &["build", "--release", "-p", "cartographer-core"], Path::new("."))?;
    println!("cartographer-core built OK -> target/release/cartographer-core.exe");
    Ok(())
}

// ---------------------------------------------------------------------------
// Node.js builds
// ---------------------------------------------------------------------------

/// Builds the MCP server (TypeScript/Node.js):
///   npm install → npm run build → node seed.js (DB init, idempotent).
pub fn server() -> Result<(), String> {
    let root = project_root();
    let server_dir = root.join("server");

    if !server_dir.exists() {
        return Err(format!(
            "server/ directory not found: {}",
            server_dir.display()
        ));
    }

    println!("npm install (server)...");
    npm(&["install"], &server_dir)?;

    println!("npm run build (server)...");
    npm(&["run", "build"], &server_dir)?;

    // Verify the fallback entry point was produced
    let fallback_entry = server_dir.join("dist/fallback-rest-main.js");
    if !fallback_entry.exists() {
        return Err(format!(
            "fallback-rest-main.js not found after build: {}",
            fallback_entry.display()
        ));
    }

    // Seed / initialise the database (idempotent)
    let seed_js = server_dir.join("dist/db/seed.js");
    if seed_js.exists() {
        println!("node seed.js (DB init)...");
        node_run(&[seed_js.to_string_lossy().as_ref()], &server_dir)?;
    }

    println!("server built OK -> {}/dist", server_dir.display());
    Ok(())
}

/// Builds the dashboard (React frontend + optional Node.js server):
///   npm install → npx vite build → optional server/: npm install + npm run build.
pub fn dashboard() -> Result<(), String> {
    let root = project_root();
    let dash_dir = root.join("dashboard");

    if !dash_dir.exists() {
        return Err(format!(
            "dashboard/ directory not found: {}",
            dash_dir.display()
        ));
    }

    println!("npm install (dashboard frontend)...");
    npm(&["install"], &dash_dir)?;

    println!("npx vite build (dashboard frontend)...");
    npx(&["vite", "build"], &dash_dir)?;

    println!("Dashboard frontend built OK -> {}/dist", dash_dir.display());

    // Optional dashboard server
    let dash_server_dir = dash_dir.join("server");
    if dash_server_dir.exists() {
        println!("npm install (dashboard server)...");
        npm(&["install"], &dash_server_dir)?;

        println!("npm run build (dashboard server)...");
        npm(&["run", "build"], &dash_server_dir)?;

        println!("Dashboard server built OK -> {}/dist", dash_server_dir.display());
    }

    Ok(())
}

/// Builds the dashboard-solid (SolidJS SPA):
///   npm install → npx vite build.
pub fn dashboard_solid() -> Result<(), String> {
    println!("-- Building dashboard-solid");
    let root = project_root();
    let dash_solid_dir = root.join("dashboard-solid");

    if !dash_solid_dir.exists() {
        return Err(format!(
            "dashboard-solid/ directory not found: {}",
            dash_solid_dir.display()
        ));
    }

    npm(&["install"], &dash_solid_dir)?;
    npx(&["vite", "build"], &dash_solid_dir)?;

    println!("dashboard-solid built OK -> {}/dist", dash_solid_dir.display());

    Ok(())
}

/// Builds the mobile app (Capacitor/npm):
///   npm install → npm run build.
///   Non-fatal if mobile/ does not exist — gracefully skips.
pub fn mobile() -> Result<(), String> {
    let root = project_root();
    let mobile_dir = root.join("mobile");

    if !mobile_dir.exists() {
        println!("Mobile directory not found at {} -- skipping", mobile_dir.display());
        return Ok(());
    }

    println!("npm install (mobile)...");
    npm(&["install"], &mobile_dir)?;

    println!("npm run build (mobile)...");
    npm(&["run", "build"], &mobile_dir)?;

    println!("Mobile built OK");
    Ok(())
}

// ---------------------------------------------------------------------------
// Qt resolver (port of scripts/cli-qt-resolve.ps1)
// ---------------------------------------------------------------------------

/// Locates the Qt bin directory containing qmake[6].exe and windeployqt.exe.
/// Search order mirrors Find-QtBin in cli-qt-resolve.ps1:
///   1. QMAKE env var (path to qmake binary → its parent)
///   2. QT_DIR / QTDIR / Qt6_DIR env vars
///   3. C:\Qt, D:\Qt, E:\Qt — newest versioned msvc*_64 kit
///   4. Hard-coded fallback: C:\Qt\6.10.2\msvc2022_64\bin
fn find_qt_bin() -> Option<PathBuf> {
    let mut candidates: Vec<PathBuf> = Vec::new();

    if let Ok(qmake_path) = std::env::var("QMAKE") {
        if let Some(dir) = Path::new(&qmake_path).parent() {
            candidates.push(dir.to_path_buf());
        }
    }

    for var in &["QT_DIR", "QTDIR", "Qt6_DIR"] {
        if let Ok(val) = std::env::var(var) {
            candidates.push(PathBuf::from(&val));
            candidates.push(PathBuf::from(&val).join("bin"));
        }
    }

    for root in &["C:\\Qt", "D:\\Qt", "E:\\Qt"] {
        let root_path = Path::new(root);
        if !root_path.exists() {
            continue;
        }
        if let Ok(entries) = std::fs::read_dir(root_path) {
            let mut versions: Vec<_> = entries
                .filter_map(|e| e.ok())
                .filter(|e| {
                    e.file_name()
                        .to_string_lossy()
                        .chars()
                        .next()
                        .map(|c| c.is_ascii_digit())
                        .unwrap_or(false)
                })
                .collect();
            versions.sort_by(|a, b| b.file_name().cmp(&a.file_name()));
            for ver in versions.iter().take(4) {
                if let Ok(kits) = std::fs::read_dir(ver.path()) {
                    let mut msvc_kits: Vec<_> = kits
                        .filter_map(|e| e.ok())
                        .filter(|e| {
                            let n = e.file_name().to_string_lossy().to_lowercase();
                            n.starts_with("msvc") && n.ends_with("_64")
                        })
                        .collect();
                    msvc_kits.sort_by(|a, b| b.file_name().cmp(&a.file_name()));
                    for kit in msvc_kits {
                        candidates.push(kit.path().join("bin"));
                    }
                }
            }
        }
    }

    candidates.push(PathBuf::from("C:\\Qt\\6.10.2\\msvc2022_64\\bin"));

    candidates
        .into_iter()
        .find(|p| p.join("qmllint.exe").exists())
}

/// Returns the path to qmake6.exe or qmake.exe inside `qt_bin`.
fn find_qmake(qt_bin: &Path) -> Option<PathBuf> {
    let q6 = qt_bin.join("qmake6.exe");
    if q6.exists() {
        return Some(q6);
    }
    let q = qt_bin.join("qmake.exe");
    if q.exists() {
        return Some(q);
    }
    None
}

/// Returns the VCINSTALLDIR path (for windeployqt to locate MSVC CRT DLLs).
/// Uses vswhere if VCINSTALLDIR is not already set in the environment.
fn find_vc_install_dir() -> Option<String> {
    if let Ok(v) = std::env::var("VCINSTALLDIR") {
        if !v.is_empty() {
            return Some(v);
        }
    }
    let prog_files_x86 = std::env::var("ProgramFiles(x86)")
        .unwrap_or_else(|_| "C:\\Program Files (x86)".to_string());
    let vswhere = PathBuf::from(&prog_files_x86)
        .join("Microsoft Visual Studio\\Installer\\vswhere.exe");
    if !vswhere.exists() {
        return None;
    }
    let out = Command::new(&vswhere)
        .args([
            "-latest",
            "-products",
            "*",
            "-requires",
            "Microsoft.VisualStudio.Component.VC.Tools.x86.x64",
            "-property",
            "installationPath",
        ])
        .output()
        .ok()?;
    if out.status.success() {
        let path = String::from_utf8_lossy(&out.stdout).trim().to_string();
        if !path.is_empty() {
            let vc = PathBuf::from(&path).join("VC");
            if vc.exists() {
                let mut s = vc.to_string_lossy().to_string();
                if !s.ends_with('\\') {
                    s.push('\\');
                }
                return Some(s);
            }
        }
    }
    None
}

/// Recursively copies `src` into `dst` (dst must already exist).
fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<(), String> {
    for entry in
        std::fs::read_dir(src).map_err(|e| format!("read_dir {}: {e}", src.display()))?
    {
        let entry = entry.map_err(|e| e.to_string())?;
        let dest = dst.join(entry.file_name());
        if entry
            .file_type()
            .map(|t| t.is_dir())
            .unwrap_or(false)
        {
            std::fs::create_dir_all(&dest).map_err(|e| e.to_string())?;
            copy_dir_recursive(&entry.path(), &dest)?;
        } else {
            std::fs::copy(entry.path(), &dest)
                .map_err(|e| format!("copy {}: {e}", entry.path().display()))?;
        }
    }
    Ok(())
}

/// Ensures `target/release/qml/Qt/labs/settings` is present after windeployqt.
///
/// windeployqt scans QML source files for imports but can miss Qt.labs.settings
/// when QML is embedded in resources or when the labs module is not indexed.
/// This function copies it from the Qt installation as a guaranteed fallback.
fn ensure_qt_labs_settings(qt_bin: &Path, root: &Path) -> Result<(), String> {
    let deploy_dir = root.join("target/release/qml/Qt/labs/settings");
    if deploy_dir.exists() {
        println!("Qt.labs.settings already present in deployment");
        return Ok(());
    }
    let qt_root = qt_bin
        .parent()
        .ok_or_else(|| format!("Cannot determine Qt root from {}", qt_bin.display()))?;
    let src = qt_root.join("qml/Qt/labs/settings");
    if !src.exists() {
        return Err(format!(
            "Qt.labs.settings not found in Qt installation at {}. \
             Ensure the Qt Quick module is installed for your kit.",
            src.display()
        ));
    }
    println!(
        "Copying Qt.labs.settings: {} -> {}",
        src.display(),
        deploy_dir.display()
    );
    std::fs::create_dir_all(&deploy_dir).map_err(|e| e.to_string())?;
    copy_dir_recursive(&src, &deploy_dir)?;
    println!("Qt.labs.settings deployed OK");
    Ok(())
}

// ---------------------------------------------------------------------------
// Supervisor build (port of scripts/cli-build-supervisor.ps1)
// ---------------------------------------------------------------------------

/// Builds the QML supervisor:
///   1. Resolves Qt bin / qmake (port of cli-qt-resolve.ps1).
///   2. Kills any running supervisor.exe (releases the locked binary).
///   3. `cargo build --release -p supervisor` with QMAKE set.
///   4. `windeployqt --release --qmldir supervisor supervisor.exe`.
///   5. Ensures Qt.labs.settings is deployed (windeployqt sometimes misses it).
///   6. Copies tray icon assets.
pub fn supervisor() -> Result<(), String> {
    println!("-- Building supervisor");

    let qt_bin = find_qt_bin()
        .ok_or_else(|| "Qt not found. Set QT_DIR or QMAKE environment variable.".to_string())?;
    println!("Qt bin: {}", qt_bin.display());

    let qmake = find_qmake(&qt_bin)
        .ok_or_else(|| format!("qmake not found in {}", qt_bin.display()))?;
    println!("QMAKE:  {}", qmake.display());

    // Prepend Qt bin to PATH so windeployqt can locate Qt DLLs.
    let base_path = std::env::var("PATH").unwrap_or_default();
    let qt_bin_str = qt_bin.to_string_lossy();
    let new_path = if base_path
        .to_lowercase()
        .contains(&qt_bin_str.to_lowercase())
    {
        base_path
    } else {
        format!("{};{}", qt_bin_str, base_path)
    };

    kill_by_name("supervisor.exe");

    println!("Building supervisor...");
    let status = Command::new("cargo")
        .args(["build", "--release", "-p", "supervisor"])
        .current_dir(".")
        .env("QMAKE", &qmake)
        .env("PATH", &new_path)
        .stdin(Stdio::null())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .status()
        .map_err(|e| format!("Failed to spawn cargo: {e}"))?;

    if !status.success() {
        return Err(format!(
            "cargo build failed (exit {})",
            status.code().unwrap_or(1)
        ));
    }

    let root = project_root();
    let windeployqt = qt_bin.join("windeployqt.exe");
    let supervisor_exe = root.join("target/release/supervisor.exe");
    let qml_dir = root.join("supervisor");

    if windeployqt.exists() && supervisor_exe.exists() {
        println!("Running windeployqt for supervisor...");

        let mut cmd = Command::new(&windeployqt);
        cmd.args([
            "--release",
            "--qmldir",
            qml_dir.to_string_lossy().as_ref(),
            supervisor_exe.to_string_lossy().as_ref(),
        ])
        .current_dir(&root)
        .env("PATH", &new_path)
        .stdin(Stdio::null())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit());

        if let Some(vc) = find_vc_install_dir() {
            cmd.env("VCINSTALLDIR", vc);
        }

        let wdq_status = cmd
            .status()
            .map_err(|e| format!("Failed to spawn windeployqt: {e}"))?;

        if !wdq_status.success() {
            println!(
                "warning: windeployqt exited {} — continuing",
                wdq_status.code().unwrap_or(1)
            );
        }

        // windeployqt sometimes misses Qt.labs.settings even when it is
        // imported in QML source files. Copy it explicitly as a safety net.
        ensure_qt_labs_settings(&qt_bin, &root)?;
    } else {
        println!(
            "note: windeployqt ({}) or supervisor.exe ({}) not found — skipping Qt deployment",
            windeployqt.display(),
            supervisor_exe.display()
        );
    }

    // Copy tray icon assets so QML SystemTrayIcon can resolve them.
    let icons_src = root.join("supervisor/assets/icons");
    let icons_dst = root.join("target/release");
    if icons_src.exists() {
        let mut copied = 0usize;
        if let Ok(entries) = std::fs::read_dir(&icons_src) {
            for entry in entries.flatten() {
                if entry.path().extension().and_then(|s| s.to_str()) == Some("ico") {
                    let dst = icons_dst.join(entry.file_name());
                    if std::fs::copy(entry.path(), &dst).is_ok() {
                        copied += 1;
                    }
                }
            }
        }
        if copied > 0 {
            println!("Tray icons copied to target/release ({copied} file(s))");
        }
    }

    println!("supervisor built OK -> target/release/supervisor.exe");
    Ok(())
}


// ---------------------------------------------------------------------------
// QML Lint (port of scripts/cli-qmllint.ps1 and scripts/qmllint.ps1)
// ---------------------------------------------------------------------------

/// Recursively collects all `.qml` files under `dir`, skipping any directories
/// named `test` or `tests` (case-insensitive).
fn collect_qml_files(dir: &Path) -> Vec<PathBuf> {
    let mut files = Vec::new();
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                let name = path
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_lowercase();
                if name == "tests" || name == "test" {
                    continue;
                }
                files.extend(collect_qml_files(&path));
            } else if path.extension().and_then(|s| s.to_str()) == Some("qml") {
                files.push(path);
            }
        }
    }
    files
}

/// Runs `qmllint.exe` over a single QML directory, inheriting stdout/stderr.
/// Returns `Ok(())` if qmllint exits 0 or the directory is empty/missing.
/// Returns `Err(msg)` if qmllint exits non-zero.
fn run_qmllint_dir(qt_bin: &Path, qml_dir: &Path) -> Result<(), String> {
    if !qml_dir.exists() {
        println!("qmllint: directory not found, skipping: {}", qml_dir.display());
        return Ok(());
    }

    let files = collect_qml_files(qml_dir);
    if files.is_empty() {
        println!("qmllint: no .qml files in {}", qml_dir.display());
        return Ok(());
    }

    let root = project_root();
    let qt_qml_root = qt_bin
        .parent()
        .map(|p| p.join("qml"))
        .unwrap_or_else(|| qt_bin.join("../qml"));
    let qml_modules = root.join("target/cxxqt/qml_modules");

    let mut cmd_args: Vec<String> = vec![
        "-I".to_string(),
        qt_qml_root.to_string_lossy().to_string(),
    ];
    if qml_modules.exists() {
        cmd_args.extend([
            "-I".to_string(),
            qml_modules.to_string_lossy().to_string(),
        ]);
    }
    cmd_args.extend([
        "-I".to_string(),
        qml_dir.to_string_lossy().to_string(),
    ]);
    for f in &files {
        cmd_args.push(f.to_string_lossy().to_string());
    }

    println!(
        "qmllint: linting {} file(s) in {}",
        files.len(),
        qml_dir.display()
    );

    let status = Command::new(qt_bin.join("qmllint.exe"))
        .args(&cmd_args)
        .current_dir(&root)
        .stdin(Stdio::null())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .status()
        .map_err(|e| format!("Failed to run qmllint: {e}"))?;

    if status.success() {
        Ok(())
    } else {
        Err(format!(
            "qmllint reported errors in {}",
            qml_dir.display()
        ))
    }
}

/// Lints QML files for a single component (port of `scripts/cli-qmllint.ps1`).
///
/// Component -> QML dir(s) mapping:
/// - `supervisor`            -> `<root>/supervisor`
/// - `guiforms`              -> `<root>/pm-approval-gui` and `<root>/pm-brainstorm-gui`
/// - `interactive-terminal`  -> `<root>/interactive-terminal/qml`
///
/// Returns `Ok(())` if Qt is not found (graceful skip) or all linting passes.
/// Returns `Err` if any directory has qmllint errors.
pub fn qml_lint_component(component: &str) -> Result<(), String> {
    let qt_bin = match find_qt_bin() {
        Some(p) => p,
        None => {
            println!("qmllint: Qt not found -- skipping");
            return Ok(());
        }
    };

    let root = project_root();

    let qml_dirs: Vec<PathBuf> = match component {
        "supervisor" => vec![root.join("supervisor")],
        "guiforms" => vec![
            root.join("pm-approval-gui"),
            root.join("pm-brainstorm-gui"),
        ],
        "interactive-terminal" => vec![root.join("interactive-terminal/qml")],
        other => {
            // Fallback: treat the component name as a directory under root
            vec![root.join(other)]
        }
    };

    let mut errors: Vec<String> = Vec::new();
    for qml_dir in &qml_dirs {
        if let Err(e) = run_qmllint_dir(&qt_bin, qml_dir) {
            errors.push(e);
        }
    }

    if errors.is_empty() {
        Ok(())
    } else {
        Err(errors.join("; "))
    }
}

/// Lints QML files for all components (port of `scripts/qmllint.ps1`).
///
/// Components linted: supervisor, interactive-terminal, pm-install-gui,
/// pm-approval-gui, pm-brainstorm-gui, pm-gui-forms.
///
/// Non-existent directories are skipped non-fatally.
/// Returns `Err` if any component had qmllint errors.
pub fn qml_lint_all() -> Result<(), String> {
    let qt_bin = match find_qt_bin() {
        Some(p) => p,
        None => {
            println!("qmllint: Qt not found -- skipping");
            return Ok(());
        }
    };

    let root = project_root();

    // (label, relative_qml_dir)
    let components: &[(&str, &str)] = &[
        ("supervisor",           "supervisor"),
        ("interactive-terminal", "interactive-terminal/qml"),
        ("pm-install-gui",       "pm-install-gui"),
        ("pm-approval-gui",      "pm-approval-gui"),
        ("pm-brainstorm-gui",    "pm-brainstorm-gui"),
        ("pm-gui-forms",         "pm-gui-forms"),
    ];

    let mut errors: Vec<String> = Vec::new();
    for (label, rel_dir) in components {
        let qml_dir = root.join(rel_dir);
        println!("-- QML Lint: {label}");
        if let Err(e) = run_qmllint_dir(&qt_bin, &qml_dir) {
            errors.push(format!("{label}: {e}"));
        }
    }

    if errors.is_empty() {
        println!("qmllint: all components OK");
        Ok(())
    } else {
        Err(format!("qmllint errors: {}", errors.join("; ")))
    }
}

// ---------------------------------------------------------------------------
// GuiForms build helper — shared by gui_forms()
// ---------------------------------------------------------------------------

fn build_gui_component(
    crate_name: &str,
    qml_dir_name: &str,
    exe_name: &str,
    root: &Path,
    qmake: &Path,
    new_path: &str,
    windeployqt: &Path,
    vc_install_dir: &Option<String>,
) -> Result<(), String> {
    kill_by_name(&format!("{}.exe", exe_name));

    println!("Building {}...", crate_name);
    let status = Command::new("cargo")
        .args(["build", "--release", "-p", crate_name])
        .current_dir(root)
        .env("QMAKE", qmake)
        .env("PATH", new_path)
        .stdin(Stdio::null())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .status()
        .map_err(|e| format!("Failed to spawn cargo: {e}"))?;

    if !status.success() {
        return Err(format!(
            "cargo build -p {} failed (exit {})",
            crate_name,
            status.code().unwrap_or(1)
        ));
    }

    let exe = root.join(format!("target/release/{}.exe", exe_name));
    let qml_dir = root.join(qml_dir_name);

    if windeployqt.exists() && exe.exists() {
        println!("Running windeployqt for {}...", crate_name);
        let mut cmd = Command::new(windeployqt);
        cmd.args([
            "--release",
            "--qmldir",
            qml_dir.to_string_lossy().as_ref(),
            exe.to_string_lossy().as_ref(),
        ])
        .current_dir(root)
        .env("PATH", new_path)
        .stdin(Stdio::null())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit());

        if let Some(vc) = vc_install_dir {
            cmd.env("VCINSTALLDIR", vc);
        }

        let wdq = cmd
            .status()
            .map_err(|e| format!("Failed to spawn windeployqt: {e}"))?;

        if !wdq.success() {
            println!(
                "warning: windeployqt exited {} — continuing",
                wdq.code().unwrap_or(1)
            );
        }
    } else {
        println!(
            "note: windeployqt ({}) or {}.exe ({}) not found — skipping Qt deployment",
            windeployqt.display(),
            exe_name,
            exe.display()
        );
    }

    println!("{} built OK -> target/release/{}.exe", crate_name, exe_name);
    Ok(())
}

/// Builds both GuiForms Qt/QML crates:
///   1. Resolves Qt bin + qmake (mirrors Find-QtBin / Find-QmakePath).
///   2. Prepends Qt bin to PATH.
///   3. `cargo build --release -p pm-approval-gui`   + windeployqt.
///   4. `cargo build --release -p pm-brainstorm-gui` + windeployqt.
pub fn gui_forms() -> Result<(), String> {
    println!("-- Building GuiForms (pm-approval-gui + pm-brainstorm-gui)");

    let qt_bin = find_qt_bin()
        .ok_or_else(|| "Qt not found. Set QT_DIR or QMAKE environment variable.".to_string())?;
    println!("Qt bin: {}", qt_bin.display());

    let qmake = find_qmake(&qt_bin)
        .ok_or_else(|| format!("qmake not found in {}", qt_bin.display()))?;
    println!("QMAKE:  {}", qmake.display());

    // Prepend Qt bin to PATH so windeployqt can locate Qt DLLs.
    let base_path = std::env::var("PATH").unwrap_or_default();
    let qt_bin_str = qt_bin.to_string_lossy();
    let new_path = if base_path
        .to_lowercase()
        .contains(&qt_bin_str.to_lowercase())
    {
        base_path
    } else {
        format!("{};{}", qt_bin_str, base_path)
    };

    let root = project_root();
    let windeployqt = qt_bin.join("windeployqt.exe");
    let vc_install_dir = find_vc_install_dir();

    build_gui_component(
        "pm-approval-gui",
        "pm-approval-gui",
        "pm-approval-gui",
        &root,
        &qmake,
        &new_path,
        &windeployqt,
        &vc_install_dir,
    )?;

    build_gui_component(
        "pm-brainstorm-gui",
        "pm-brainstorm-gui",
        "pm-brainstorm-gui",
        &root,
        &qmake,
        &new_path,
        &windeployqt,
        &vc_install_dir,
    )?;

    Ok(())
}

/// Builds the interactive-terminal Qt/QML crate and runs windeployqt.
pub fn interactive_terminal() -> Result<(), String> {
    println!("-- Building interactive-terminal");

    let qt_bin = find_qt_bin()
        .ok_or_else(|| "Qt not found. Set QT_DIR or QMAKE environment variable.".to_string())?;
    println!("Qt bin: {}", qt_bin.display());

    let qmake = find_qmake(&qt_bin)
        .ok_or_else(|| format!("qmake not found in {}", qt_bin.display()))?;
    println!("QMAKE:  {}", qmake.display());

    let base_path = std::env::var("PATH").unwrap_or_default();
    let qt_bin_str = qt_bin.to_string_lossy();
    let new_path = if base_path
        .to_lowercase()
        .contains(&qt_bin_str.to_lowercase())
    {
        base_path
    } else {
        format!("{};{}", qt_bin_str, base_path)
    };

    kill_by_name("interactive-terminal.exe");

    println!("Building interactive-terminal...");
    let status = Command::new("cargo")
        .args(["build", "--release", "-p", "interactive-terminal"])
        .current_dir(".")
        .env("QMAKE", &qmake)
        .env("PATH", &new_path)
        .stdin(Stdio::null())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .status()
        .map_err(|e| format!("Failed to spawn cargo: {e}"))?;

    if !status.success() {
        return Err(format!(
            "cargo build failed (exit {})",
            status.code().unwrap_or(1)
        ));
    }

    let root = project_root();
    let windeployqt = qt_bin.join("windeployqt.exe");
    let it_exe = root.join("target/release/interactive-terminal.exe");
    let qml_dir = root.join("interactive-terminal/qml");

    if windeployqt.exists() && it_exe.exists() {
        println!("Running windeployqt for interactive-terminal...");

        let mut cmd = Command::new(&windeployqt);
        cmd.args([
            "--release",
            "--qmldir",
            qml_dir.to_string_lossy().as_ref(),
            it_exe.to_string_lossy().as_ref(),
        ])
        .current_dir(&root)
        .env("PATH", &new_path)
        .stdin(Stdio::null())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit());

        if let Some(vc) = find_vc_install_dir() {
            cmd.env("VCINSTALLDIR", vc);
        }

        let wdq_status = cmd
            .status()
            .map_err(|e| format!("Failed to spawn windeployqt: {e}"))?;

        if !wdq_status.success() {
            println!(
                "warning: windeployqt exited {} — continuing",
                wdq_status.code().unwrap_or(1)
            );
        }

        // windeployqt sometimes misses Qt.labs.settings even when it is
        // imported in QML source files. Copy it explicitly as a safety net.
        ensure_qt_labs_settings(&qt_bin, &root)?;
    } else {
        println!(
            "note: windeployqt ({}) or interactive-terminal.exe ({}) not found — skipping Qt deployment",
            windeployqt.display(),
            it_exe.display()
        );
    }

    println!("interactive-terminal built OK -> target/release/interactive-terminal.exe");
    Ok(())
}

/// Builds and installs the VS Code extension:
///   npm install → npm run compile → npx vsce package → code --install-extension.
pub fn extension() -> Result<(), String> {
    let root = project_root();
    let ext_dir = root.join("vscode-extension");

    if !ext_dir.exists() {
        return Err(format!(
            "vscode-extension/ directory not found: {}",
            ext_dir.display()
        ));
    }

    println!("npm install (vscode-extension)...");
    npm(&["install"], &ext_dir)?;

    println!("npm run compile (vscode-extension)...");
    npm(&["run", "compile"], &ext_dir)?;

    println!("npx vsce package (vscode-extension)...");
    npx(&["@vscode/vsce", "package"], &ext_dir)?;

    // Find the freshly packaged .vsix and install it into VS Code
    let vsix = std::fs::read_dir(&ext_dir)
        .map_err(|e| format!("Read vscode-extension/: {e}"))?
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.path()
                .extension()
                .and_then(|s| s.to_str())
                == Some("vsix")
        })
        .max_by_key(|e| e.metadata().and_then(|m| m.modified()).ok());

    match vsix {
        None => {
            println!("note: no .vsix found after package step — packaged but not installed locally");
        }
        Some(entry) => {
            println!("Installing extension: {}", entry.file_name().to_string_lossy());
            let status = Command::new("code")
                .args(["--install-extension", &entry.path().to_string_lossy()])
                .env_remove("NODE_OPTIONS")
                .stdin(Stdio::null())
                .stdout(Stdio::inherit())
                .stderr(Stdio::inherit())
                .status()
                .map_err(|e| format!("code --install-extension: {e}"))?;

            if status.success() {
                println!("Extension installed. Reload VS Code: Ctrl+Shift+P -> Developer: Reload Window");
            } else {
                println!(
                    "note: code --install-extension returned {} \
                     (extension may be installed but VS Code is closed)",
                    status.code().unwrap_or(1)
                );
            }
        }
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------

pub fn run_tests(component: &str) -> Result<(), String> {
    println!("-- Running tests for: {}", component);

    let root = project_root();

    // Qt env setup (non-fatal if Qt not found — skip Qt components)
    let qt_env: Option<(PathBuf, String)> = find_qt_bin().and_then(|qt_bin| {
        let qmake = find_qmake(&qt_bin)?;
        let base_path = std::env::var("PATH").unwrap_or_default();
        let qt_bin_str = qt_bin.to_string_lossy().to_string();
        let new_path = if base_path.to_lowercase().contains(&qt_bin_str.to_lowercase()) {
            base_path
        } else {
            format!("{};{}", qt_bin_str, base_path)
        };
        Some((qmake, new_path))
    });

    /// Run `cargo test --release` for given `-p` flags, with optional Qt env.
    fn cargo_test(
        packages: &[&str],
        qt_env: Option<&(PathBuf, String)>,
        dir: &Path,
    ) -> Result<(), String> {
        let mut cmd = Command::new("cargo");
        cmd.arg("test").arg("--release");
        for pkg in packages {
            cmd.args(["-p", pkg]);
        }
        cmd.current_dir(dir)
            .stdin(Stdio::null())
            .stdout(Stdio::inherit())
            .stderr(Stdio::inherit());
        if let Some((qmake, path)) = qt_env {
            cmd.env("QMAKE", qmake).env("PATH", path);
        }
        let status = cmd.status().map_err(|e| format!("Failed to spawn cargo: {e}"))?;
        if status.success() {
            Ok(())
        } else {
            Err(format!("cargo test failed (exit {})", status.code().unwrap_or(1)))
        }
    }

    /// Run `npm test` in a directory (non-fatal skip if no test script in package.json).
    fn npm_test(dir: &Path) -> Result<(), String> {
        if !dir.exists() {
            println!("  Skipping {} (directory not found)", dir.display());
            return Ok(());
        }
        // Check package.json for "test" script
        let pkg_json = dir.join("package.json");
        if pkg_json.exists() {
            if let Ok(content) = std::fs::read_to_string(&pkg_json) {
                if !content.contains("\"test\"") {
                    println!("  Skipping npm test in {} (no test script)", dir.display());
                    return Ok(());
                }
            }
        }
        let status = Command::new("npm")
            .args(["test", "--", "--passWithNoTests"])
            .current_dir(dir)
            .env_remove("NODE_OPTIONS")
            .stdin(Stdio::null())
            .stdout(Stdio::inherit())
            .stderr(Stdio::inherit())
            .status()
            .map_err(|e| format!("npm test: {e}"))?;
        if status.success() {
            Ok(())
        } else {
            Err(format!(
                "npm test failed in {} (exit {})",
                dir.display(),
                status.code().unwrap_or(1)
            ))
        }
    }

    match component {
        "supervisor" | "Supervisor" => {
            if qt_env.is_none() {
                println!("warning: Qt not found — supervisor tests require QMAKE. Skipping.");
                return Ok(());
            }
            cargo_test(&["supervisor"], qt_env.as_ref(), &root)
        }
        "guiforms" | "GuiForms" => {
            if qt_env.is_none() {
                println!("warning: Qt not found — GuiForms tests require QMAKE. Skipping.");
                return Ok(());
            }
            cargo_test(&["pm-approval-gui", "pm-brainstorm-gui"], qt_env.as_ref(), &root)
        }
        "interactive-terminal" | "InteractiveTerminal" => {
            if qt_env.is_none() {
                println!(
                    "warning: Qt not found — interactive-terminal tests require QMAKE. Skipping."
                );
                return Ok(());
            }
            cargo_test(&["interactive-terminal"], qt_env.as_ref(), &root)
        }
        "supervisor-iced" | "SupervisorIced" => {
            cargo_test(&["supervisor-iced"], None, &root)
        }
        "interactive-terminal-iced" | "InteractiveTerminalIced" => {
            cargo_test(&["interactive-terminal-iced"], None, &root)
        }
        "client-proxy" | "ClientProxy" => cargo_test(&["client-proxy"], None, &root),
        "server" | "Server" => npm_test(&root.join("server")),
        "dashboard" | "Dashboard" => npm_test(&root.join("dashboard")),
        "extension" | "Extension" => npm_test(&root.join("vscode-extension")),
        "all" | "All" => {
            let mut errors: Vec<String> = Vec::new();

            // Qt-based Rust
            if let Some(ref qt) = qt_env {
                for (label, pkgs) in &[
                    ("supervisor", vec!["supervisor"]),
                    ("guiforms", vec!["pm-approval-gui", "pm-brainstorm-gui"]),
                    ("interactive-terminal", vec!["interactive-terminal"]),
                ] {
                    println!("Testing {}...", label);
                    let pkg_refs: Vec<&str> = pkgs.iter().map(|s| *s).collect();
                    if let Err(e) = cargo_test(&pkg_refs, Some(qt), &root) {
                        errors.push(e);
                    }
                }
            } else {
                println!("note: Qt not found — skipping Qt-based Rust tests (supervisor, guiforms, interactive-terminal)");
            }

            // Non-Qt Rust
            for (label, pkgs) in &[
                ("supervisor-iced", vec!["supervisor-iced"]),
                ("interactive-terminal-iced", vec!["interactive-terminal-iced"]),
                ("client-proxy", vec!["client-proxy"]),
            ] {
                println!("Testing {}...", label);
                let pkg_refs: Vec<&str> = pkgs.iter().map(|s| *s).collect();
                if let Err(e) = cargo_test(&pkg_refs, None, &root) {
                    errors.push(e);
                }
            }

            // Node.js
            for (label, subdir) in &[
                ("server", "server"),
                ("dashboard", "dashboard"),
                ("extension", "vscode-extension"),
            ] {
                println!("Testing {}...", label);
                if let Err(e) = npm_test(&root.join(subdir)) {
                    errors.push(e);
                }
            }

            if errors.is_empty() {
                println!("All tests passed.");
                Ok(())
            } else {
                Err(format!(
                    "{} test suite(s) failed:\n{}",
                    errors.len(),
                    errors.join("\n")
                ))
            }
        }
        _ => Err(format!(
            "Unknown test component: '{component}'. Valid: supervisor, guiforms, \
             interactive-terminal, supervisor-iced, interactive-terminal-iced, \
             client-proxy, server, dashboard, extension, all"
        )),
    }
}
