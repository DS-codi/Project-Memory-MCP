// utils.rs — Clipboard integration, timestamped log saving, detached process launcher.

use std::io::{self, Write};
use std::path::PathBuf;
use std::process::{Command, Stdio};

/// Returns the project root by walking up from the exe until a `Cargo.toml` is found.
/// Falls back to the current working directory.
pub fn project_root() -> PathBuf {
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

/// Copies `text` to the Windows clipboard via PowerShell's Set-Clipboard.
pub fn copy_to_clipboard(text: &str) -> io::Result<()> {
    let mut child = Command::new("powershell")
        .args(["-NoProfile", "-Command", "$input | Set-Clipboard"])
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()?;
    if let Some(mut stdin) = child.stdin.take() {
        let _ = stdin.write_all(text.as_bytes());
    }
    let _ = child.wait();
    Ok(())
}

/// Writes `text` to a timestamped log file in the current directory.
/// Returns the filename on success.
pub fn save_logs_to_file(text: &str) -> io::Result<String> {
    use std::time::{SystemTime, UNIX_EPOCH};
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let filename = format!("pm-log-{}.txt", now);
    std::fs::write(&filename, text)?;
    Ok(filename)
}

/// Spawns `args[0]` with `args[1..]` fully detached (all streams null).
/// Errors are silently ignored — fire-and-forget.
pub fn run_detached(args: &[String]) {
    if args.is_empty() {
        return;
    }
    let _ = Command::new(&args[0])
        .args(&args[1..])
        .current_dir(".")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn();
}
