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

/// Returns the project root inferred from the running binary location.
/// Expected layout: <root>/target/{release,debug}/pm-cli[.exe]
fn project_root() -> PathBuf {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().and_then(|p| p.parent()).map(|p| p.to_path_buf()))
        .unwrap_or_else(|| PathBuf::from("."))
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
