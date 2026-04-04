use std::io::{BufRead as _, Write as _};

use crate::fallback::powershell::PowerShellFallback;

/// Routes commands to native Rust handlers or the PowerShell fallback.
///
/// Source of truth for migration status:
/// - Native arm in `dispatch`        = command is fully ported
/// - `PowerShellFallback::run*` call = still delegating to PowerShell
/// - `// TODO Phase 3` comment       = explicit escape hatch pending Qt resolver port
pub struct CommandRegistry;

impl CommandRegistry {
    /// Normalise component name aliases to canonical TitleCase form.
    /// Used in CLI dispatch so callers can pass lower-case or hyphenated names.
    pub fn normalize_component(name: &str) -> String {
        let lower = name.to_lowercase();
        match lower.as_str() {
            "supervisor"                                   => "Supervisor",
            "supervisoriced" | "supervisor-iced"           => "SupervisorIced",
            "guiforms"                                     => "GuiForms",
            "interactiveterminal" | "interactive-terminal" => "InteractiveTerminal",
            "server"                                       => "Server",
            "fallbackserver" | "fallback-server"           => "FallbackServer",
            "dashboard"                                    => "Dashboard",
            "extension"                                    => "Extension",
            "cartographer"                                 => "Cartographer",
            "mobile"                                       => "Mobile",
            "container"                                    => "Container",
            "globalclaude" | "global-claude" | "global-claude-code" => "GlobalClaude",
            "all"                                          => "All",
            _                                              => name,
        }
        .to_string()
    }

    /// Returns `[current_exe, subcommand]` for a self-referential native build phase.
    /// The TUI spawns this as a subprocess; `dispatch` routes `subcommand` to the
    /// corresponding `crate::builds` function.
    fn native_phase_args(subcommand: &str) -> Vec<String> {
        let exe = std::env::current_exe()
            .unwrap_or_else(|_| std::path::PathBuf::from("pm-cli"))
            .to_string_lossy()
            .to_string();
        vec![exe, subcommand.to_string()]
    }

    /// Returns the ordered build phases for a component.
    /// Each entry is `(phase_label, [program, args…])`.
    ///
    /// Native phases use `Self::native_phase_args(subcommand)` — the TUI spawns
    /// the current binary with the subcommand, which routes through `dispatch`.
    ///
    /// Remaining PowerShell phases (Supervisor, GuiForms, InteractiveTerminal, QML Lint)
    /// are explicit escape hatches pending the Qt resolver port (Phase 3).
    pub fn build_phases(component: &str) -> Vec<(String, Vec<String>)> {
        match component {
            // ── Phase 3 TODO: port Qt resolver (cli-qt-resolve.ps1 → Rust) ─────────
            // Once Find-QtBin, Find-QmakePath, and Initialize-WinDeployQtEnvironment
            // are ported, replace the PS fallbacks below with native_phase_args calls.
            "Supervisor" => vec![
                // TODO Phase 3 — QML Lint: needs Qt resolver port
                ("QML Lint".to_string(),   PowerShellFallback::build_args("scripts/cli-qmllint.ps1",                    &["-Component", "supervisor"])),
                // TODO Phase 3 — Rust Build: needs Qt resolver + windeployqt port
                ("Rust Build".to_string(), PowerShellFallback::build_args("scripts/cli-build-supervisor.ps1",           &[])),
            ],
            // ── Phase 3 TODO: port Qt resolver ───────────────────────────────────────
            "GuiForms" => vec![
                // TODO Phase 3 — QML Lint
                ("QML Lint".to_string(),   PowerShellFallback::build_args("scripts/cli-qmllint.ps1",                    &["-Component", "guiforms"])),
                // TODO Phase 3 — Rust Build: needs Qt resolver + windeployqt ×2
                ("Rust Build".to_string(), PowerShellFallback::build_args("scripts/cli-build-guiforms.ps1",             &[])),
            ],
            // ── Phase 3 TODO: port Qt resolver + nested build-interactive-terminal.ps1
            "InteractiveTerminal" => vec![
                // TODO Phase 3 — QML Lint
                ("QML Lint".to_string(),   PowerShellFallback::build_args("scripts/cli-qmllint.ps1",                    &["-Component", "interactive-terminal"])),
                // TODO Phase 3 — Build: Qt resolver + nested PS script
                ("Build".to_string(),      PowerShellFallback::build_args("scripts/cli-build-interactive-terminal.ps1", &["-NoWebEnginePlugin"])),
            ],

            // ── Native (Phase 2 complete) ─────────────────────────────────────────
            "SupervisorIced" => vec![
                ("Rust Build".to_string(), Self::native_phase_args("build-supervisor-iced")),
            ],
            "Cartographer" => vec![
                ("Rust Build".to_string(), Self::native_phase_args("build-cartographer")),
            ],
            "Server" | "FallbackServer" => vec![
                ("Build".to_string(), Self::native_phase_args("build-server")),
            ],
            "Dashboard" => vec![
                ("Build".to_string(), Self::native_phase_args("build-dashboard")),
            ],
            "Extension" => vec![
                ("Build".to_string(), Self::native_phase_args("build-extension")),
            ],
            "Mobile" => vec![
                ("Build".to_string(), Self::native_phase_args("build-mobile")),
            ],
            "Container" => vec![
                // Container builds a registry image via podman/docker — no file artifact.
                // Build is invoked externally; there is no ps1 script to delegate to.
                ("Build".to_string(), Self::native_phase_args("build-container")),
            ],
            "GlobalClaude" => vec![
                ("Install".to_string(), crate::global_claude::build_args()),
            ],
            _ => vec![],
        }
    }

    /// Prompts the user interactively about shortcut creation after a successful deploy.
    /// Only runs for components that support shortcuts (Supervisor, SupervisorIced).
    /// For "All", prompts for SupervisorIced (the primary launcher).
    fn prompt_shortcuts_after_deploy(component: &str) {
        let shortcut_component = match component {
            "Supervisor"     => "Supervisor",
            "SupervisorIced" => "SupervisorIced",
            "All"            => "SupervisorIced",
            _                => return, // not a shortcut-capable component
        };

        println!();
        println!("Create shortcuts for {}?", shortcut_component);
        println!("  [1] Desktop + Start Menu (default)");
        println!("  [2] Desktop only");
        println!("  [3] Start Menu only");
        println!("  [4] Skip");
        print!("Choice [1]: ");
        let _ = std::io::stdout().flush();

        let choice = std::io::stdin()
            .lock()
            .lines()
            .next()
            .and_then(|l| l.ok())
            .unwrap_or_default();

        let (desktop, start_menu) = match choice.trim() {
            "2" => (true,  false),
            "3" => (false, true),
            "4" => { println!("Skipping shortcuts."); return; }
            _   => (true,  true),  // default: both
        };

        let config = crate::install_config::load_or_default();
        match crate::install_config::create_shortcut(&config, shortcut_component, desktop, start_menu) {
            Ok(())  => {}
            Err(e)  => eprintln!("pm-cli shortcut: {e}"),
        }
    }

    /// CLI dispatch — entered when pm-cli is invoked with arguments (headless mode).
    ///
    /// `PowerShellFallback` calls are hard indicators that PS is still in the
    /// runtime path. `grep -r PowerShellFallback` lists all remaining gaps.
    pub fn dispatch(cmd: &str, args: &[String]) -> i32 {
        match cmd {
            // ── install <component> ───────────────────────────────────────────────
            // Runs each component's build phases in order.
            // Native phases self-invoke this binary; PS phases shell out to pwsh.
            "install" => {
                let raw = args.first().map(|s| s.as_str()).unwrap_or("all");
                let component = Self::normalize_component(raw);
                let targets: Vec<String> = if component == "All" {
                    vec![
                        "Supervisor", "SupervisorIced", "GuiForms", "InteractiveTerminal",
                        "Server", "Dashboard", "Extension", "Cartographer", "GlobalClaude",
                    ]
                    .into_iter()
                    .map(|s| s.to_string())
                    .collect()
                } else {
                    vec![component]
                };
                for target in &targets {
                    for (_, phase_args) in Self::build_phases(target) {
                        match PowerShellFallback::run_args(&phase_args) {
                            Ok(s) if s.success() => {}
                            Ok(s) => return s.code().unwrap_or(1),
                            Err(e) => { eprintln!("pm-cli: {e}"); return 1; }
                        }
                    }
                }
                0
            }

            // ── deploy <component> [--dir PATH] [--no-shortcuts] ─────────────────
            // Copies pre-built artifacts to the permanent install directory.
            // Does NOT rebuild — use `install` first.
            // After copying, prompts whether to create Desktop/Start Menu shortcuts
            // for components that support them (Supervisor, SupervisorIced).
            // Pass --no-shortcuts to skip the prompt non-interactively.
            "deploy" => {
                let raw = args.first().map(|s| s.as_str()).unwrap_or("all");
                let component = Self::normalize_component(raw);

                let dir_override = args.windows(2)
                    .find(|w| w[0] == "--dir")
                    .map(|w| std::path::PathBuf::from(&w[1]));

                let skip_shortcuts = args.iter().any(|a| a == "--no-shortcuts");

                match crate::install_config::deploy(&component, dir_override.as_deref()) {
                    Ok(()) => {
                        if !skip_shortcuts {
                            Self::prompt_shortcuts_after_deploy(&component);
                        }
                        0
                    }
                    Err(e) => { eprintln!("pm-cli deploy: {e}"); 1 }
                }
            }

            // ── launch [supervisor|supervisor-iced] ──────────────────────────────
            "launch" => {
                let target = args.first().map(|s| s.as_str()).unwrap_or("supervisor-iced");
                let normalized = Self::normalize_component(target);
                let config = crate::install_config::load_or_default();

                match normalized.as_str() {
                    "SupervisorIced" => {
                        let binary = config.install_dir.join("supervisor-iced.exe");
                        let binary = if binary.exists() { binary } else {
                            std::path::PathBuf::from("target/release/supervisor-iced.exe")
                        };
                        let config_path = {
                            let in_install = config.install_dir.parent()
                                .map(|p| p.join("supervisor.toml"))
                                .filter(|p| p.exists());
                            let in_root = std::path::PathBuf::from("supervisor.toml");
                            in_install.unwrap_or(in_root)
                        };
                        match std::process::Command::new(&binary)
                            .arg("--config").arg(&config_path)
                            .stdin(std::process::Stdio::null())
                            .stdout(std::process::Stdio::null())
                            .stderr(std::process::Stdio::null())
                            .spawn()
                        {
                            Ok(_)  => { println!("Launched supervisor-iced from {:?}", binary); 0 }
                            Err(e) => { eprintln!("pm-cli launch: failed to spawn supervisor-iced: {e}"); 1 }
                        }
                    }
                    "Supervisor" => {
                        // TODO Phase 3 — port launch-supervisor.ps1 to Rust:
                        // writes supervisor.toml, detects running components,
                        // waits for ports manifest, syncs VS Code config files.
                        eprintln!("pm-cli launch: delegating QML supervisor launch to PowerShell (Phase 3 pending)");
                        match PowerShellFallback::run_args(&PowerShellFallback::build_args(
                            "launch-supervisor.ps1", &[]
                        )) {
                            Ok(s) => s.code().unwrap_or(1),
                            Err(e) => { eprintln!("pm-cli launch: {e}"); 1 }
                        }
                    }
                    _ => {
                        eprintln!("pm-cli launch: unknown target '{target}'. Use: supervisor, supervisor-iced");
                        1
                    }
                }
            }

            // ── Native build subcommands (Phase 2) ───────────────────────────────
            // These are spawned by the TUI via build_phases → native_phase_args.
            // Each runs a build and prints progress to stdout for TUI capture.

            "build-supervisor-iced" => match crate::builds::supervisor_iced() {
                Ok(()) => 0,
                Err(e) => { eprintln!("pm-cli build-supervisor-iced: {e}"); 1 }
            },

            "build-cartographer" => match crate::builds::cartographer() {
                Ok(()) => 0,
                Err(e) => { eprintln!("pm-cli build-cartographer: {e}"); 1 }
            },

            "build-server" => match crate::builds::server() {
                Ok(()) => 0,
                Err(e) => { eprintln!("pm-cli build-server: {e}"); 1 }
            },

            "build-dashboard" => match crate::builds::dashboard() {
                Ok(()) => 0,
                Err(e) => { eprintln!("pm-cli build-dashboard: {e}"); 1 }
            },

            "build-extension" => match crate::builds::extension() {
                Ok(()) => 0,
                Err(e) => { eprintln!("pm-cli build-extension: {e}"); 1 }
            },

            "build-mobile" => match crate::builds::mobile() {
                Ok(()) => 0,
                Err(e) => { eprintln!("pm-cli build-mobile: {e}"); 1 }
            },

            "build-container" => {
                // Container builds a registry image via podman/docker — no file to compile.
                // The Containerfile lives at the project root; run podman build externally.
                eprintln!("pm-cli build-container: container images are built with `podman build` — no automated build phase");
                1
            }

            // ── shortcut <component> [--desktop] [--start-menu] ──────────────────
            "shortcut" => {
                let raw = args.first().map(|s| s.as_str()).unwrap_or("supervisor-iced");
                let component = Self::normalize_component(raw);
                let has_desktop    = args.iter().any(|a| a == "--desktop");
                let has_start_menu = args.iter().any(|a| a == "--start-menu");
                let config = crate::install_config::load_or_default();
                match crate::install_config::create_shortcut(&config, &component, has_desktop, has_start_menu) {
                    Ok(()) => 0,
                    Err(e) => { eprintln!("pm-cli shortcut: {e}"); 1 }
                }
            }

            // ── global-claude [check] ─────────────────────────────────────────────
            // Native Rust: copies agent files, registers MCP servers, adds allowlist
            // entries, registers Task Scheduler autostart. No PowerShell required.
            // `check` subcommand is read-only; exits 0 if fully installed, 1 if not.
            "global-claude" => {
                let subcmd = args.first().map(|s| s.as_str()).unwrap_or("");
                match subcmd {
                    "check" => match crate::global_claude::status() {
                        Ok(true)  => 0,
                        Ok(false) => 1,
                        Err(e) => { eprintln!("pm-cli global-claude check: {e}"); 1 }
                    },
                    _ => match crate::global_claude::install() {
                        Ok(()) => 0,
                        Err(e) => { eprintln!("pm-cli global-claude: {e}"); 1 }
                    },
                }
            }

            // ── test ──────────────────────────────────────────────────────────────
            // TODO Phase 3+ — port run-tests.ps1 test runner to Rust.
            "test" => {
                eprintln!("pm-cli test: delegating to PowerShell test runner (not yet ported)");
                match PowerShellFallback::run("scripts/test.ps1", &[]) {
                    Ok(s) => s.code().unwrap_or(1),
                    Err(e) => { eprintln!("pm-cli: {e}"); 1 }
                }
            }

            // ── lint [component] ──────────────────────────────────────────────────
            // TODO Phase 3 — port cli-qt-resolve.ps1 + qmllint invocation to Rust.
            "lint" => {
                let component = args.first().map(|s| s.as_str()).unwrap_or("all");
                eprintln!("pm-cli lint: delegating to PowerShell qmllint wrapper (Qt resolver not yet ported)");
                match PowerShellFallback::run("scripts/cli-qmllint.ps1", &["-Component", component]) {
                    Ok(s) => s.code().unwrap_or(1),
                    Err(e) => { eprintln!("pm-cli: {e}"); 1 }
                }
            }

            _ => {
                eprintln!("pm-cli: unknown command '{cmd}'");
                eprintln!("Usage: pm-cli <install|deploy|launch|shortcut|test|lint|global-claude> [args]");
                1
            }
        }
    }
}
