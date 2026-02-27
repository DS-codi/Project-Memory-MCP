use crate::protocol::{CommandRequest, TerminalProfile};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex as StdMutex};
use std::time::Duration;
use tokio::io::AsyncBufReadExt;
use tokio::io::AsyncWriteExt;
use tokio::process::Command;
use tokio::process::{Child, ChildStdin};
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

pub struct PersistentShellManager {
    shells: HashMap<String, PersistentShell>,
}

struct PersistentShell {
    profile: TerminalProfile,
    stdin: ChildStdin,
    output_rx: mpsc::Receiver<OutputLine>,
    child: Child,
}

impl Default for PersistentShellManager {
    fn default() -> Self {
        Self {
            shells: HashMap::new(),
        }
    }
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
    apply_request_environment(&mut cmd, request);
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
            let _ = output_tx
                .send(OutputLine::Stderr(timeout_msg.clone()))
                .await;

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

impl PersistentShellManager {
    pub async fn execute_command_with_timeout(
        &mut self,
        request: &CommandRequest,
        output_tx: mpsc::Sender<OutputLine>,
    ) -> Result<ExecutionResult, String> {
        let timeout_dur = Duration::from_secs(request.timeout_seconds);

        match tokio::time::timeout(timeout_dur, self.execute_command(request, output_tx.clone()))
            .await
        {
            Ok(result) => result,
            Err(_) => {
                self.terminate_session_shell(&request.session_id).await;

                let timeout_msg = format!(
                    "Command timed out after {} seconds",
                    request.timeout_seconds,
                );
                let _ = output_tx
                    .send(OutputLine::Stderr(timeout_msg.clone()))
                    .await;

                Ok(ExecutionResult {
                    request_id: request.id.clone(),
                    exit_code: Some(-1),
                    output: timeout_msg,
                })
            }
        }
    }

    pub async fn terminate_session_shell(&mut self, session_id: &str) {
        if let Some(mut shell) = self.shells.remove(session_id) {
            let _ = shell.child.kill().await;
        }
    }

    async fn execute_command(
        &mut self,
        request: &CommandRequest,
        output_tx: mpsc::Sender<OutputLine>,
    ) -> Result<ExecutionResult, String> {
        self.ensure_shell(request).await?;

        let marker = format!("__PM_DONE_{}__", request.id.replace('-', "_"));
        let wrapped_command = build_wrapped_shell_command(request, &marker);

        let shell = self
            .shells
            .get_mut(&request.session_id)
            .ok_or_else(|| "Failed to resolve session shell".to_string())?;

        shell
            .stdin
            .write_all(wrapped_command.as_bytes())
            .await
            .map_err(|e| format!("Failed to write command to shell: {e}"))?;
        shell
            .stdin
            .write_all(b"\n")
            .await
            .map_err(|e| format!("Failed to write newline to shell: {e}"))?;
        shell
            .stdin
            .flush()
            .await
            .map_err(|e| format!("Failed to flush shell input: {e}"))?;

        let accumulated = Arc::new(StdMutex::new(String::new()));
        let exit_code = loop {
            let line = shell
                .output_rx
                .recv()
                .await
                .ok_or_else(|| "Shell process terminated unexpectedly".to_string())?;

            match line {
                OutputLine::Stdout(text) => {
                    if let Some(code) = parse_marker_exit_code(&text, &marker) {
                        break Some(code);
                    }

                    push_line(&accumulated, &text, false);
                    let _ = output_tx.send(OutputLine::Stdout(text)).await;
                }
                OutputLine::Stderr(text) => {
                    if let Some(code) = parse_marker_exit_code(&text, &marker) {
                        break Some(code);
                    }

                    push_line(&accumulated, &text, true);
                    let _ = output_tx.send(OutputLine::Stderr(text)).await;
                }
            }
        };

        let output = accumulated.lock().unwrap().clone();

        Ok(ExecutionResult {
            request_id: request.id.clone(),
            exit_code,
            output,
        })
    }

    async fn ensure_shell(&mut self, request: &CommandRequest) -> Result<(), String> {
        let needs_new_shell = match self.shells.get(&request.session_id) {
            Some(shell) => shell.profile != request.terminal_profile,
            None => true,
        };

        if !needs_new_shell {
            return Ok(());
        }

        self.terminate_session_shell(&request.session_id).await;
        let shell = spawn_persistent_shell(request).await?;
        self.shells.insert(request.session_id.clone(), shell);
        Ok(())
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
            TerminalProfile::Bash => ("bash".to_string(), vec!["-lc".to_string(), command]),
            TerminalProfile::Cmd | TerminalProfile::System => {
                ("cmd".to_string(), vec!["/C".to_string(), command])
            }
        }
    } else {
        match request.terminal_profile {
            TerminalProfile::Bash => ("bash".to_string(), vec!["-lc".to_string(), command]),
            _ => ("sh".to_string(), vec!["-c".to_string(), command]),
        }
    }
}

fn persistent_shell_invocation(profile: &TerminalProfile) -> (String, Vec<String>) {
    if cfg!(target_os = "windows") {
        match profile {
            TerminalProfile::PowerShell => (
                "powershell".to_string(),
                vec!["-NoLogo".to_string(), "-NoProfile".to_string()],
            ),
            TerminalProfile::Pwsh => (
                "pwsh".to_string(),
                vec!["-NoLogo".to_string(), "-NoProfile".to_string()],
            ),
            TerminalProfile::Bash => ("bash".to_string(), Vec::new()),
            TerminalProfile::Cmd | TerminalProfile::System => (
                "cmd".to_string(),
                vec!["/Q".to_string()],
            ),
        }
    } else {
        match profile {
            TerminalProfile::Bash => ("bash".to_string(), Vec::new()),
            _ => ("sh".to_string(), Vec::new()),
        }
    }
}

async fn spawn_persistent_shell(request: &CommandRequest) -> Result<PersistentShell, String> {
    let profile = request.terminal_profile.clone();
    let (program, args) = persistent_shell_invocation(&profile);
    let mut cmd = Command::new(program);
    cmd.args(args);
    cmd.current_dir(resolve_working_directory(request));
    apply_venv_environment(&mut cmd, request);
    apply_request_environment(&mut cmd, request);
    cmd.stdin(std::process::Stdio::piped());
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());

    #[cfg(windows)]
    {
        cmd.creation_flags(0x08000000);
    }

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn persistent shell: {e}"))?;

    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| "Failed to capture shell stdin".to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Failed to capture shell stdout".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "Failed to capture shell stderr".to_string())?;

    let (output_tx, output_rx) = mpsc::channel::<OutputLine>(256);

    let out_tx = output_tx.clone();
    tokio::spawn(async move {
        let mut lines = tokio::io::BufReader::new(stdout).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            if out_tx.send(OutputLine::Stdout(line)).await.is_err() {
                break;
            }
        }
    });

    tokio::spawn(async move {
        let mut lines = tokio::io::BufReader::new(stderr).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            if output_tx.send(OutputLine::Stderr(line)).await.is_err() {
                break;
            }
        }
    });

    Ok(PersistentShell {
        profile,
        stdin,
        output_rx,
        child,
    })
}

fn build_wrapped_shell_command(request: &CommandRequest, marker: &str) -> String {
    let cwd = resolve_working_directory(request).to_string_lossy().to_string();
    let env_prefix = build_shell_env_prefix(request);

    if cfg!(target_os = "windows") {
        match request.terminal_profile {
            TerminalProfile::PowerShell | TerminalProfile::Pwsh => {
                let escaped_cwd = escape_powershell_single_quoted(&cwd);
                format!(
                    "{env_prefix}Set-Location -LiteralPath '{escaped_cwd}'; & {{ {}; $code=$LASTEXITCODE; if ($null -eq $code) {{ $code=0 }}; Write-Output '{}'+$code }}",
                    request.command,
                    marker
                )
            }
            TerminalProfile::Bash => {
                let escaped_cwd = escape_single_quoted_shell(&cwd);
                format!(
                    "{env_prefix}cd '{escaped_cwd}' 2>/dev/null; {}; printf '{}%s\\n' \"$?\"",
                    request.command, marker
                )
            }
            TerminalProfile::Cmd | TerminalProfile::System => {
                let escaped_cwd = cwd.replace('"', "\"\"");
                format!(
                    "{env_prefix}cd /d \"{escaped_cwd}\" >nul 2>nul & {} & echo {}%ERRORLEVEL%",
                    request.command, marker
                )
            }
        }
    } else {
        let escaped_cwd = escape_single_quoted_shell(&cwd);
        format!(
            "{env_prefix}cd '{escaped_cwd}' 2>/dev/null; {}; printf '{}%s\\n' \"$?\"",
            request.command, marker
        )
    }
}

fn apply_request_environment(cmd: &mut Command, request: &CommandRequest) {
    let normalized = normalized_request_env(request);
    if normalized.is_empty() {
        return;
    }

    for (key, value) in normalized {
        cmd.env(key, value);
    }
}

fn build_shell_env_prefix(request: &CommandRequest) -> String {
    let normalized = normalized_request_env(request);
    if normalized.is_empty() {
        return String::new();
    }

    if cfg!(target_os = "windows") {
        match request.terminal_profile {
            TerminalProfile::PowerShell | TerminalProfile::Pwsh => normalized
                .iter()
                .filter(|(k, _)| is_safe_env_key(k))
                .map(|(k, v)| {
                    format!(
                        "$env:{} = '{}'; ",
                        k,
                        escape_powershell_single_quoted(v)
                    )
                })
                .collect(),
            TerminalProfile::Bash => normalized
                .iter()
                .filter(|(k, _)| is_safe_env_key(k))
                .map(|(k, v)| format!("export {}='{}'; ", k, escape_single_quoted_shell(v)))
                .collect(),
            TerminalProfile::Cmd | TerminalProfile::System => normalized
                .iter()
                .filter(|(k, _)| is_safe_env_key(k))
                .map(|(k, v)| {
                    let escaped_value = v.replace('"', "\"\"");
                    format!("set \"{}={}\" & ", k, escaped_value)
                })
                .collect(),
        }
    } else {
        normalized
            .iter()
            .filter(|(k, _)| is_safe_env_key(k))
            .map(|(k, v)| format!("export {}='{}'; ", k, escape_single_quoted_shell(v)))
            .collect()
    }
}

fn normalized_request_env(request: &CommandRequest) -> Vec<(String, String)> {
    let mut env_pairs: Vec<(String, String)> = request
        .env
        .iter()
        .map(|(k, v)| (k.clone(), v.clone()))
        .collect();

    let gemini_value = request
        .env
        .get("GEMINI_API_KEY")
        .or_else(|| request.env.get("GOOGLE_API_KEY"))
        .cloned();

    if let Some(value) = gemini_value {
        if !request.env.contains_key("GEMINI_API_KEY") {
            env_pairs.push(("GEMINI_API_KEY".to_string(), value.clone()));
        }
        if !request.env.contains_key("GOOGLE_API_KEY") {
            env_pairs.push(("GOOGLE_API_KEY".to_string(), value));
        }
    }

    env_pairs
}

fn is_safe_env_key(key: &str) -> bool {
    let mut chars = key.chars();
    let Some(first) = chars.next() else {
        return false;
    };

    if !(first.is_ascii_alphabetic() || first == '_') {
        return false;
    }

    chars.all(|c| c.is_ascii_alphanumeric() || c == '_')
}

fn parse_marker_exit_code(line: &str, marker: &str) -> Option<i32> {
    let trimmed = line.trim();
    if !trimmed.starts_with(marker) {
        return None;
    }
    let value = trimmed[marker.len()..].trim();
    value.parse::<i32>().ok()
}

fn escape_single_quoted_shell(input: &str) -> String {
    input.replace('"', "\\\"").replace('\'', "'\\''")
}

fn escape_powershell_single_quoted(input: &str) -> String {
    input.replace('\'', "''")
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
        root.join("bin").join("python").exists() || root.join("bin").join("activate").exists()
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
            working_directory: std::env::current_dir().unwrap().to_string_lossy().into(),
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
            working_directory: std::env::current_dir().unwrap().to_string_lossy().into(),
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
            working_directory: std::env::current_dir().unwrap().to_string_lossy().into(),
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
            working_directory: std::env::current_dir().unwrap().to_string_lossy().into(),
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
    fn wraps_with_env_prefix_for_powershell_profile() {
        let mut env = std::collections::HashMap::new();
        env.insert("FOO".to_string(), "bar".to_string());
        env.insert("GOOGLE_API_KEY".to_string(), "test-key".to_string());

        let request = CommandRequest {
            id: "env-wrap-ps".into(),
            command: "Write-Output ok".into(),
            working_directory: std::env::current_dir().unwrap().to_string_lossy().into(),
            context: String::new(),
            session_id: "default".into(),
            terminal_profile: TerminalProfile::PowerShell,
            workspace_path: String::new(),
            venv_path: String::new(),
            activate_venv: false,
            timeout_seconds: 10,
            args: Vec::new(),
            env,
            workspace_id: String::new(),
            allowlisted: false,
        };

        let wrapped = build_wrapped_shell_command(&request, "__PM_DONE__");
        assert!(wrapped.contains("$env:FOO = 'bar';"));
        assert!(wrapped.contains("$env:GOOGLE_API_KEY = 'test-key';"));
        assert!(wrapped.contains("$env:GEMINI_API_KEY = 'test-key';"));
    }

    #[test]
    fn normalizes_gemini_and_google_aliases() {
        let mut env = std::collections::HashMap::new();
        env.insert("GOOGLE_API_KEY".to_string(), "alias-value".to_string());

        let request = CommandRequest {
            id: "env-normalize".into(),
            command: "echo ok".into(),
            working_directory: std::env::current_dir().unwrap().to_string_lossy().into(),
            context: String::new(),
            session_id: "default".into(),
            terminal_profile: TerminalProfile::System,
            workspace_path: String::new(),
            venv_path: String::new(),
            activate_venv: false,
            timeout_seconds: 10,
            args: Vec::new(),
            env,
            workspace_id: String::new(),
            allowlisted: false,
        };

        let normalized = normalized_request_env(&request);
        assert!(normalized.iter().any(|(k, v)| k == "GOOGLE_API_KEY" && v == "alias-value"));
        assert!(normalized.iter().any(|(k, v)| k == "GEMINI_API_KEY" && v == "alias-value"));
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
        let temp = std::env::temp_dir().join(format!("iterm-ws-fallback-{}", std::process::id()));
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
        let temp = std::env::temp_dir().join(format!("iterm-venv-detect-{}", std::process::id()));
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
        assert_eq!(detected, Some(dot_venv.to_string_lossy().to_string()));
        let _ = std::fs::remove_dir_all(&temp);
    }
}
