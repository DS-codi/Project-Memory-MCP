use std::io;
use std::process::{Command, ExitStatus, Stdio};

/// Adapter that delegates unported commands to PowerShell scripts.
///
/// The presence of this file is a hard indicator that PowerShell is still in the runtime path.
/// When all commands have native Rust handlers, remove this module entirely (Phase 4).
pub struct PowerShellFallback;

impl PowerShellFallback {
    /// Run a PowerShell script with inherited stdio. Used in CLI dispatch mode.
    pub fn run(script: &str, extra: &[&str]) -> io::Result<ExitStatus> {
        Command::new("pwsh")
            .args(["-NoProfile", "-File", script])
            .args(extra)
            .stdin(Stdio::inherit())
            .stdout(Stdio::inherit())
            .stderr(Stdio::inherit())
            .status()
    }

    /// Run a pre-built arg list (args[0] = program) with inherited stdio. Used in CLI dispatch mode.
    pub fn run_args(args: &[String]) -> io::Result<ExitStatus> {
        if args.is_empty() {
            return Err(io::Error::new(io::ErrorKind::InvalidInput, "empty args"));
        }
        Command::new(&args[0])
            .args(&args[1..])
            .stdin(Stdio::inherit())
            .stdout(Stdio::inherit())
            .stderr(Stdio::inherit())
            .status()
    }

    /// Build a [program, args…] Vec for use with run_build_phase / run_streaming_command.
    /// The first element is "pwsh"; the rest are the -NoProfile -File script flags and extras.
    pub fn build_args(script: &str, extra: &[&str]) -> Vec<String> {
        let mut v = vec![
            "pwsh".to_string(),
            "-NoProfile".to_string(),
            "-File".to_string(),
            script.to_string(),
        ];
        v.extend(extra.iter().map(|s| s.to_string()));
        v
    }
}
