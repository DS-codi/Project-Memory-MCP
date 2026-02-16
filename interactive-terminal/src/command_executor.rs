use crate::protocol::{CommandRequest, TerminalProfile};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex as StdMutex};
use std::time::Duration;
use tokio::io::AsyncBufReadExt;
use tokio::process::Command;
use tokio::sync::mpsc;

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

/// A single line of output from an executing command.
#[derive(Debug, Clone)]
pub enum OutputLine {
    /// A line captured from the child process's stdout.
    Stdout(String),
    /// A line captured from the child process's stderr.
    Stderr(String),
}

/// The final result of a command execution.
pub struct ExecutionResult {
    /// Correlates back to the originating `CommandRequest.id`.
    pub request_id: String,
    /// The process exit code (`None` if the process was killed / signaled).
    pub exit_code: Option<i32>,
    /// All accumulated stdout + stderr output.
    pub output: String,
}

// ---------------------------------------------------------------------------
// Core executor
// ---------------------------------------------------------------------------

/// Execute a command asynchronously.
///
/// * Spawns the command through the platform shell (`cmd /C` on Windows,
///   `sh -c` elsewhere).
/// * Streams stdout/stderr line-by-line through `output_tx`.
/// * Accumulates output into a shared buffer (`accumulated`) so that
///   callers can inspect partial output on timeout.
/// * Returns an [`ExecutionResult`] on normal completion.
pub async fn execute_command(
    request: &CommandRequest,
    output_tx: mpsc::Sender<OutputLine>,
    accumulated: Arc<StdMutex<String>>,
) -> Result<ExecutionResult, String> {
    let mut cmd = build_shell_command(request);

    cmd.current_dir(resolve_working_directory(request));
    apply_venv_environment(&mut cmd, request);
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());

    // Prevent a visible console window from flashing on Windows.
    #[cfg(windows)]
    {
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn process: {e}"))?;

    let stdout = child.stdout.take().expect("stdout piped");
    let stderr = child.stderr.take().expect("stderr piped");

    let mut stdout_lines = tokio::io::BufReader::new(stdout).lines();
    let mut stderr_lines = tokio::io::BufReader::new(stderr).lines();

    // Read stdout and stderr concurrently until both are closed.
    loop {
        tokio::select! {
            result = stdout_lines.next_line() => {
                match result {
                    Ok(Some(line)) => {
                        push_line(&accumulated, &line, false);
                        let _ = output_tx.send(OutputLine::Stdout(line)).await;
                    }
                    Ok(None) => {
                        // stdout closed — drain remaining stderr
                        drain_stderr(
                            &mut stderr_lines,
                            &output_tx,
                            &accumulated,
                        ).await;
                        break;
                    }
                    Err(e) => {
                        let msg = format!("stdout read error: {e}");
                        let _ = output_tx.send(OutputLine::Stderr(msg)).await;
                        break;
                    }
                }
            }
            result = stderr_lines.next_line() => {
                match result {
                    Ok(Some(line)) => {
                        push_line(&accumulated, &line, true);
                        let _ = output_tx.send(OutputLine::Stderr(line)).await;
                    }
                    Ok(None) => {
                        // stderr closed — drain remaining stdout
                        drain_stdout(
                            &mut stdout_lines,
                            &output_tx,
                            &accumulated,
                        ).await;
                        break;
                    }
                    Err(_) => break,
                }
            }
        }
    }

    // Wait for the child process to exit.
    let status = child
        .wait()
        .await
        .map_err(|e| format!("Wait failed: {e}"))?;

    let output = accumulated.lock().unwrap().clone();

    Ok(ExecutionResult {
        request_id: request.id.clone(),
        exit_code: status.code(),
        output,
    })
}

// ---------------------------------------------------------------------------
// Timeout wrapper
// ---------------------------------------------------------------------------

/// Execute a command with a timeout.
///
/// If the command exceeds its configured `timeout_seconds`, the child
/// process is killed (dropped), partial output is captured, and a result
/// with `exit_code = Some(-1)` is returned.
pub async fn execute_command_with_timeout(
    request: &CommandRequest,
    output_tx: mpsc::Sender<OutputLine>,
) -> Result<ExecutionResult, String> {
    let timeout_dur = Duration::from_secs(request.timeout_seconds);
    let accumulated = Arc::new(StdMutex::new(String::new()));

    match tokio::time::timeout(
        timeout_dur,
        execute_command(request, output_tx.clone(), accumulated.clone()),
    )
    .await
    {
        Ok(result) => result,
        Err(_) => {
            // Timeout — the child is killed when its future is dropped.
            let timeout_msg = format!(
                "Command timed out after {} seconds",
                request.timeout_seconds,
            );
            let _ = output_tx.send(OutputLine::Stderr(timeout_msg.clone())).await;

            let partial = accumulated.lock().unwrap().clone();
            let output = if partial.is_empty() {
                timeout_msg
            } else {
                format!("{partial}\n{timeout_msg}")
            };

            Ok(ExecutionResult {
                request_id: request.id.clone(),
                exit_code: Some(-1),
                output,
            })
        }
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Build the platform-appropriate shell command.
fn build_shell_command(request: &CommandRequest) -> Command {
    let (program, args) = shell_invocation(request);
    let mut c = Command::new(program);
    c.args(args);
    c
}

fn shell_invocation(request: &CommandRequest) -> (String, Vec<String>) {
    let command = request.command.clone();

    if cfg!(target_os = "windows") {
        match request.terminal_profile {
            TerminalProfile::PowerShell => (
                "powershell".to_string(),
                vec!["-NoProfile".to_string(), "-Command".to_string(), command],
            ),
            TerminalProfile::Pwsh => (
                "pwsh".to_string(),
                vec!["-NoProfile".to_string(), "-Command".to_string(), command],
            ),
            TerminalProfile::Bash => (
                "bash".to_string(),
                vec!["-lc".to_string(), command],
            ),
            TerminalProfile::Cmd | TerminalProfile::System => (
                "cmd".to_string(),
                vec!["/C".to_string(), command],
            ),
        }
    } else {
        match request.terminal_profile {
            TerminalProfile::Bash => (
                "bash".to_string(),
                vec!["-lc".to_string(), command],
            ),
            _ => (
                "sh".to_string(),
                vec!["-c".to_string(), command],
            ),
        }
    }
}

fn resolve_working_directory(request: &CommandRequest) -> PathBuf {
    let requested = request.working_directory.trim();
    if is_existing_directory(requested) {
        return PathBuf::from(requested);
    }

    let workspace = request.workspace_path.trim();
    if is_existing_directory(workspace) {
        return PathBuf::from(workspace);
    }

    std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
}

fn is_existing_directory(path: &str) -> bool {
    if path.is_empty() {
        return false;
    }
    let as_path = Path::new(path);
    as_path.exists() && as_path.is_dir()
}

fn apply_venv_environment(cmd: &mut Command, request: &CommandRequest) {
    if !request.activate_venv {
        return;
    }

    let selected = select_venv_path(request);
    let Some(venv_root) = selected else {
        return;
    };

    let bin_dir = if cfg!(target_os = "windows") {
        venv_root.join("Scripts")
    } else {
        venv_root.join("bin")
    };

    if !bin_dir.exists() || !bin_dir.is_dir() {
        return;
    }

    let old_path = std::env::var_os("PATH").unwrap_or_default();
    let mut combined_paths = vec![bin_dir.clone()];
    combined_paths.extend(std::env::split_paths(&old_path));

    if let Ok(new_path) = std::env::join_paths(combined_paths) {
        cmd.env("PATH", new_path);
    }

    cmd.env("VIRTUAL_ENV", venv_root.as_os_str());
}

fn select_venv_path(request: &CommandRequest) -> Option<PathBuf> {
    let requested = request.venv_path.trim();
    if is_valid_venv_path(requested) {
        return Some(PathBuf::from(requested));
    }

    detect_default_venv(&request.workspace_path).map(PathBuf::from)
}

fn is_valid_venv_path(path: &str) -> bool {
    if path.is_empty() {
        return false;
    }

    let root = Path::new(path);
    if !root.exists() || !root.is_dir() {
        return false;
    }

    if cfg!(target_os = "windows") {
        root.join("Scripts").join("python.exe").exists()
            || root.join("Scripts").join("activate.bat").exists()
    } else {
        root.join("bin").join("python").exists()
            || root.join("bin").join("activate").exists()
    }
}

pub fn detect_default_venv(workspace_path: &str) -> Option<String> {
    let workspace = workspace_path.trim();
    if !is_existing_directory(workspace) {
        return None;
    }

    for folder in [".venv", "venv"] {
        let candidate = Path::new(workspace).join(folder);
        if is_valid_venv_path(candidate.to_string_lossy().as_ref()) {
            return Some(candidate.to_string_lossy().to_string());
        }
    }

    None
}

/// Append a line to the shared accumulated output buffer.
fn push_line(buf: &Arc<StdMutex<String>>, line: &str, is_stderr: bool) {
    let mut b = buf.lock().unwrap();
    if is_stderr {
        b.push_str("[stderr] ");
    }
    b.push_str(line);
    b.push('\n');
}

/// Drain remaining stdout lines after stderr has closed.
async fn drain_stdout(
    reader: &mut tokio::io::Lines<tokio::io::BufReader<tokio::process::ChildStdout>>,
    tx: &mpsc::Sender<OutputLine>,
    accumulated: &Arc<StdMutex<String>>,
) {
    while let Ok(Some(line)) = reader.next_line().await {
        push_line(accumulated, &line, false);
        let _ = tx.send(OutputLine::Stdout(line)).await;
    }
}

/// Drain remaining stderr lines after stdout has closed.
async fn drain_stderr(
    reader: &mut tokio::io::Lines<tokio::io::BufReader<tokio::process::ChildStderr>>,
    tx: &mpsc::Sender<OutputLine>,
    accumulated: &Arc<StdMutex<String>>,
) {
    while let Ok(Some(line)) = reader.next_line().await {
        push_line(accumulated, &line, true);
        let _ = tx.send(OutputLine::Stderr(line)).await;
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn execute_echo_command() {
        let request = CommandRequest {
            id: "test-001".into(),
            command: if cfg!(target_os = "windows") {
                "echo hello world".into()
            } else {
                "echo hello world".into()
            },
            working_directory: std::env::current_dir()
                .unwrap()
                .to_string_lossy()
                .into(),
            context: String::new(),
            session_id: "default".into(),
            terminal_profile: TerminalProfile::System,
            workspace_path: String::new(),
            venv_path: String::new(),
            activate_venv: false,
            timeout_seconds: 10,
            args: Vec::new(),
            env: std::collections::HashMap::new(),
            workspace_id: String::new(),
            allowlisted: false,
        };

        let (tx, mut rx) = mpsc::channel(64);
        let accumulated = Arc::new(StdMutex::new(String::new()));

        let result = execute_command(&request, tx, accumulated).await.unwrap();

        assert_eq!(result.request_id, "test-001");
        assert_eq!(result.exit_code, Some(0));
        assert!(result.output.contains("hello world"));

        // Should have received at least one output line.
        let line = rx.try_recv().unwrap();
        match line {
            OutputLine::Stdout(s) => assert!(s.contains("hello world")),
            _ => panic!("Expected stdout line"),
        }
    }

    #[tokio::test]
    async fn execute_failing_command() {
        let request = CommandRequest {
            id: "test-fail".into(),
            command: if cfg!(target_os = "windows") {
                "cmd /C exit 42".into()
            } else {
                "exit 42".into()
            },
            working_directory: std::env::current_dir()
                .unwrap()
                .to_string_lossy()
                .into(),
            context: String::new(),
            session_id: "default".into(),
            terminal_profile: TerminalProfile::System,
            workspace_path: String::new(),
            venv_path: String::new(),
            activate_venv: false,
            timeout_seconds: 10,
            args: Vec::new(),
            env: std::collections::HashMap::new(),
            workspace_id: String::new(),
            allowlisted: false,
        };

        let (tx, _rx) = mpsc::channel(64);
        let accumulated = Arc::new(StdMutex::new(String::new()));

        let result = execute_command(&request, tx, accumulated).await.unwrap();

        assert_eq!(result.request_id, "test-fail");
        assert_ne!(result.exit_code, Some(0));
    }

    #[tokio::test]
    async fn timeout_kills_long_running_command() {
        let request = CommandRequest {
            id: "test-timeout".into(),
            command: if cfg!(target_os = "windows") {
                "ping -n 60 127.0.0.1".into()
            } else {
                "sleep 60".into()
            },
            working_directory: std::env::current_dir()
                .unwrap()
                .to_string_lossy()
                .into(),
            context: String::new(),
            session_id: "default".into(),
            terminal_profile: TerminalProfile::System,
            workspace_path: String::new(),
            venv_path: String::new(),
            activate_venv: false,
            timeout_seconds: 1, // 1 second timeout
            args: Vec::new(),
            env: std::collections::HashMap::new(),
            workspace_id: String::new(),
            allowlisted: false,
        };

        let (tx, _rx) = mpsc::channel(64);

        let result = execute_command_with_timeout(&request, tx).await.unwrap();

        assert_eq!(result.request_id, "test-timeout");
        assert_eq!(result.exit_code, Some(-1));
        assert!(result.output.contains("timed out"));
    }

    #[tokio::test]
    async fn timeout_wrapper_passes_through_on_fast_command() {
        let request = CommandRequest {
            id: "test-fast".into(),
            command: if cfg!(target_os = "windows") {
                "echo fast".into()
            } else {
                "echo fast".into()
            },
            working_directory: std::env::current_dir()
                .unwrap()
                .to_string_lossy()
                .into(),
            context: String::new(),
            session_id: "default".into(),
            terminal_profile: TerminalProfile::System,
            workspace_path: String::new(),
            venv_path: String::new(),
            activate_venv: false,
            timeout_seconds: 30,
            args: Vec::new(),
            env: std::collections::HashMap::new(),
            workspace_id: String::new(),
            allowlisted: false,
        };

        let (tx, _rx) = mpsc::channel(64);

        let result = execute_command_with_timeout(&request, tx).await.unwrap();

        assert_eq!(result.request_id, "test-fast");
        assert_eq!(result.exit_code, Some(0));
        assert!(result.output.contains("fast"));
    }

    #[test]
    fn shell_invocation_uses_windows_profile_routing() {
        if !cfg!(target_os = "windows") {
            return;
        }

        let request = CommandRequest {
            id: "profile-001".into(),
            command: "echo hello".into(),
            working_directory: "C:/".into(),
            context: String::new(),
            session_id: "session-1".into(),
            terminal_profile: TerminalProfile::Pwsh,
            workspace_path: String::new(),
            venv_path: String::new(),
            activate_venv: false,
            timeout_seconds: 10,
            args: Vec::new(),
            env: std::collections::HashMap::new(),
            workspace_id: String::new(),
            allowlisted: false,
        };

        let (program, args) = shell_invocation(&request);
        assert_eq!(program, "pwsh");
        assert_eq!(args[0], "-NoProfile");
        assert_eq!(args[1], "-Command");
    }

    #[test]
    fn resolve_working_directory_falls_back_to_workspace() {
        let temp = std::env::temp_dir().join(format!(
            "iterm-ws-fallback-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&temp);
        std::fs::create_dir_all(&temp).unwrap();
        let request = CommandRequest {
            id: "cwd-fallback".into(),
            command: "echo hi".into(),
            working_directory: "./definitely-missing-dir".into(),
            context: String::new(),
            session_id: "default".into(),
            terminal_profile: TerminalProfile::System,
            workspace_path: temp.to_string_lossy().to_string(),
            venv_path: String::new(),
            activate_venv: false,
            timeout_seconds: 5,
            args: Vec::new(),
            env: std::collections::HashMap::new(),
            workspace_id: String::new(),
            allowlisted: false,
        };

        let resolved = resolve_working_directory(&request);
        assert_eq!(resolved, temp);
        let _ = std::fs::remove_dir_all(&resolved);
    }

    #[test]
    fn detect_default_venv_prefers_dot_venv() {
        let temp = std::env::temp_dir().join(format!(
            "iterm-venv-detect-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&temp);
        std::fs::create_dir_all(&temp).unwrap();
        let dot_venv = temp.join(".venv");
        let scripts = if cfg!(target_os = "windows") {
            dot_venv.join("Scripts")
        } else {
            dot_venv.join("bin")
        };
        std::fs::create_dir_all(&scripts).unwrap();
        if cfg!(target_os = "windows") {
            std::fs::write(scripts.join("python.exe"), "").unwrap();
        } else {
            std::fs::write(scripts.join("python"), "").unwrap();
        }

        let detected = detect_default_venv(temp.to_string_lossy().as_ref());
        assert_eq!(
            detected,
            Some(dot_venv.to_string_lossy().to_string())
        );
        let _ = std::fs::remove_dir_all(&temp);
    }
}
