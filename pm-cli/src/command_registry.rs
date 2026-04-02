use crate::fallback::powershell::PowerShellFallback;

/// Routes commands to native Rust handlers or the PowerShell fallback.
///
/// Source of truth for migration status:
/// - Native arm in `dispatch` = command is fully ported
/// - `PowerShellFallback::run*` call = still delegating to PowerShell
pub struct CommandRegistry;

impl CommandRegistry {
    /// Normalise component name aliases to canonical TitleCase form.
    /// Used in CLI dispatch so callers can pass lower-case or hyphenated names.
    pub fn normalize_component(name: &str) -> String {
        let lower = name.to_lowercase();
        match lower.as_str() {
            "supervisor"                              => "Supervisor",
            "guiforms"                               => "GuiForms",
            "interactiveterminal" | "interactive-terminal" => "InteractiveTerminal",
            "server"                                 => "Server",
            "fallbackserver" | "fallback-server"     => "FallbackServer",
            "dashboard"                              => "Dashboard",
            "extension"                              => "Extension",
            "cartographer"                           => "Cartographer",
            "mobile"                                 => "Mobile",
            "container"                              => "Container",
            "all"                                    => "All",
            _                                        => name,
        }
        .to_string()
    }

    /// Return the ordered build phases for a component.
    /// Each entry is `(phase_label, [program, args…])`.
    ///
    /// All phases currently delegate to PowerShell (Phase 1).
    /// Replace `PowerShellFallback::build_args(…)` with native args as each command is ported.
    pub fn build_phases(component: &str) -> Vec<(String, Vec<String>)> {
        match component {
            "Supervisor" => vec![
                ("QML Lint".to_string(),   PowerShellFallback::build_args("scripts/cli-qmllint.ps1",                   &["-Component", "supervisor"])),
                ("Rust Build".to_string(), PowerShellFallback::build_args("scripts/cli-build-supervisor.ps1",          &[])),
            ],
            "GuiForms" => vec![
                ("QML Lint".to_string(),   PowerShellFallback::build_args("scripts/cli-qmllint.ps1",                   &["-Component", "guiforms"])),
                ("Rust Build".to_string(), PowerShellFallback::build_args("scripts/cli-build-guiforms.ps1",            &[])),
            ],
            "InteractiveTerminal" => vec![
                ("QML Lint".to_string(),   PowerShellFallback::build_args("scripts/cli-qmllint.ps1",                   &["-Component", "interactive-terminal"])),
                ("Build".to_string(),      PowerShellFallback::build_args("scripts/cli-build-interactive-terminal.ps1", &["-NoWebEnginePlugin"])),
            ],
            "Server" | "FallbackServer" => vec![
                ("Build".to_string(), PowerShellFallback::build_args("scripts/cli-build-server.ps1",    &[])),
            ],
            "Dashboard" => vec![
                ("Build".to_string(), PowerShellFallback::build_args("scripts/cli-build-dashboard.ps1", &[])),
            ],
            "Extension" => vec![
                ("Build".to_string(), PowerShellFallback::build_args("scripts/cli-build-extension.ps1", &[])),
            ],
            "Mobile" => vec![
                ("Build".to_string(), PowerShellFallback::build_args("scripts/cli-build-mobile.ps1",    &[])),
            ],
            "Container" => vec![
                ("Build".to_string(), PowerShellFallback::build_args("scripts/cli-build-container.ps1", &[])),
            ],
            "Cartographer" => vec![
                ("Rust Build".to_string(), PowerShellFallback::build_args("scripts/cli-build-cartographer.ps1", &[])),
            ],
            _ => vec![],
        }
    }

    /// CLI dispatch — entered when pm-cli is invoked with arguments (headless mode).
    ///
    /// Native handlers will replace `PowerShellFallback` calls as commands are ported (Phase 2+).
    /// Add native arms here first; remove the corresponding `PowerShellFallback` call afterward.
    pub fn dispatch(cmd: &str, args: &[String]) -> i32 {
        match cmd {
            // ── install <component> ────────────────────────────────────────────
            // Not yet ported — delegates to PowerShell for each build phase.
            "install" => {
                let raw = args.first().map(|s| s.as_str()).unwrap_or("all");
                let component = Self::normalize_component(raw);
                let targets: Vec<String> = if component == "All" {
                    vec!["Supervisor", "GuiForms", "InteractiveTerminal", "Server",
                         "Dashboard", "Extension", "Cartographer"]
                        .into_iter().map(|s| s.to_string()).collect()
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

            // ── test ───────────────────────────────────────────────────────────
            // Not yet ported — delegates to PowerShell.
            "test" => match PowerShellFallback::run("scripts/test.ps1", &[]) {
                Ok(s) => s.code().unwrap_or(1),
                Err(e) => { eprintln!("pm-cli: {e}"); 1 }
            },

            // ── lint [component] ───────────────────────────────────────────────
            // Not yet ported — delegates to PowerShell.
            "lint" => {
                let component = args.first().map(|s| s.as_str()).unwrap_or("all");
                match PowerShellFallback::run("scripts/cli-qmllint.ps1", &["-Component", component]) {
                    Ok(s) => s.code().unwrap_or(1),
                    Err(e) => { eprintln!("pm-cli: {e}"); 1 }
                }
            }

            _ => {
                eprintln!("pm-cli: unknown command '{cmd}'");
                eprintln!("Usage: pm-cli <install|test|lint> [args]");
                1
            }
        }
    }
}
