//! Supervisor configuration — loaded from TOML, all sections optional with sensible defaults.
//!
//! Ported from `supervisor/src/config.rs`.  All QML/cxx_qt and control-protocol
//! dependencies have been removed; this module depends only on:
//! `serde`, `serde_json`, `toml`, `anyhow`, and `std`.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fmt;
use std::io;
use std::path::{Path, PathBuf};

// ---------------------------------------------------------------------------
// Control-transport selector
// ---------------------------------------------------------------------------

/// Which transport the control API binds on.
#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum ControlTransport {
    /// Windows named pipe (default; fastest, no port conflicts).
    #[default]
    NamedPipe,
    /// Plain TCP loopback — cross-platform fallback.
    Tcp,
}

// ---------------------------------------------------------------------------
// Restart policy
// ---------------------------------------------------------------------------

/// Per-service restart policy, controlling how the supervisor responds when
/// a service exits or fails.
#[derive(Debug, Clone, Deserialize, Default, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum RestartPolicy {
    /// Always attempt reconnect regardless of how the service stopped.
    #[default]
    AlwaysRestart,
    /// Only reconnect if the service exited with an error.
    RestartOnFailure,
    /// Never reconnect — once stopped, the service stays stopped.
    NeverRestart,
}

// ---------------------------------------------------------------------------
// Top-level config
// ---------------------------------------------------------------------------

/// Full supervisor configuration, deserialized from `supervisor.toml`.
#[derive(Debug, Deserialize, Default)]
pub struct SupervisorConfig {
    #[serde(default)]
    pub supervisor: SupervisorSection,

    #[serde(default)]
    pub discovery: DiscoverySection,

    #[serde(default)]
    pub reconnect: ReconnectSection,

    #[serde(default)]
    pub mcp: McpSection,

    #[serde(default)]
    pub interactive_terminal: InteractiveTerminalSection,

    #[serde(default)]
    pub dashboard: DashboardSection,

    #[serde(default)]
    pub fallback_api: FallbackApiSection,

    #[serde(default)]
    pub cli_mcp: CliMcpSection,

    #[serde(default)]
    pub approval: ApprovalSection,

    #[serde(default)]
    pub brainstorm_gui: BrainstormGuiSection,

    #[serde(default)]
    pub approval_gui: ApprovalGuiSection,

    #[serde(default)]
    pub events: EventsSection,

    #[serde(default)]
    pub gui_server: GuiServerSection,

    #[serde(default)]
    pub runtime_output: RuntimeOutputSection,

    #[serde(default)]
    pub chatbot: ChatbotSection,

    #[serde(default)]
    pub auth: AuthSection,

    #[serde(default)]
    pub mdns: MdnsSection,

    /// Zero or more managed server definitions.
    #[serde(default)]
    pub servers: Vec<ServerDefinition>,
}

// ---------------------------------------------------------------------------
// Section structs
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(default)]
pub struct SupervisorSection {
    /// Minimum log level: "trace" | "debug" | "info" | "warn" | "error".
    pub log_level: String,
    /// Directory for lock files, state, and runtime artefacts.
    pub data_dir: PathBuf,
    /// Address the supervisor HTTP/IPC API binds to.
    pub bind_address: String,
    /// Which control-plane transport to use: named_pipe (Windows default) or tcp.
    pub control_transport: ControlTransport,
    /// Named-pipe path for the control API (Windows only).
    pub control_pipe: String,
    /// TCP port for the control API when control_transport = "tcp".
    pub control_tcp_port: u16,
}

impl Default for SupervisorSection {
    fn default() -> Self {
        Self {
            log_level: "info".to_string(),
            data_dir: default_data_dir(),
            bind_address: "127.0.0.1:3456".to_string(),
            control_transport: ControlTransport::NamedPipe,
            control_pipe: r"\\.\pipe\project-memory-supervisor".to_string(),
            control_tcp_port: 45470,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(default)]
pub struct DiscoverySection {
    /// Discovery methods to use, e.g. ["local", "mdns"].
    pub methods: Vec<String>,
    /// Whether to advertise this supervisor to peers.
    pub advertise: bool,
}

impl Default for DiscoverySection {
    fn default() -> Self {
        Self {
            methods: vec!["local".to_string()],
            advertise: true,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(default)]
pub struct ReconnectSection {
    /// Initial back-off delay in milliseconds.
    pub initial_delay_ms: u64,
    /// Maximum back-off delay in milliseconds.
    pub max_delay_ms: u64,
    /// Exponential multiplier applied on each retry.
    pub multiplier: f64,
    /// Maximum number of reconnect attempts (0 = unlimited).
    pub max_attempts: u32,
    /// Fraction of the current base delay added as random jitter (default: 0.2).
    pub jitter_ratio: f64,
    /// Apply cooldown when attempt_count reaches this value (0 = disabled).
    pub cooldown_after_attempts: u32,
    /// Extra cooldown delay for child-local failures.
    pub cooldown_child_local_ms: u64,
    /// Extra cooldown delay for dependency-group failures.
    pub cooldown_dependency_group_ms: u64,
    /// Extra cooldown delay for global failures.
    pub cooldown_global_ms: u64,
}

impl Default for ReconnectSection {
    fn default() -> Self {
        Self {
            initial_delay_ms: 500,
            max_delay_ms: 30_000,
            multiplier: 2.0,
            max_attempts: 0,
            jitter_ratio: 0.2,
            cooldown_after_attempts: 0,
            cooldown_child_local_ms: 0,
            cooldown_dependency_group_ms: 0,
            cooldown_global_ms: 0,
        }
    }
}

// ---------------------------------------------------------------------------
// MCP backend selector
// ---------------------------------------------------------------------------

/// Which backend manages the MCP process.
#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum McpBackend {
    /// Spawn a local Node.js process (default).
    #[default]
    Node,
    /// Run a Podman/Docker container.
    Container,
}

// ---------------------------------------------------------------------------
// NodeRunnerConfig
// ---------------------------------------------------------------------------

/// Configuration for the Node.js MCP process runner (`[mcp.node]` section).
#[derive(Debug, Clone, Deserialize)]
#[serde(default)]
pub struct NodeRunnerConfig {
    /// Executable to invoke (default: `"node"`).
    pub command: String,
    /// Arguments passed to the command (default: `["dist/server.js"]`).
    pub args: Vec<String>,
    /// Working directory for the process.
    pub working_dir: Option<PathBuf>,
    /// Extra environment variables to inject.
    pub env: HashMap<String, String>,
}

impl Default for NodeRunnerConfig {
    fn default() -> Self {
        Self {
            command: default_node_command(),
            args: default_node_args(),
            working_dir: None,
            env: HashMap::new(),
        }
    }
}

// ---------------------------------------------------------------------------
// ContainerRunnerConfig
// ---------------------------------------------------------------------------

/// Configuration for the Podman/Docker container runner (`[mcp.container]` section).
#[derive(Debug, Deserialize, Clone)]
#[serde(default)]
pub struct ContainerRunnerConfig {
    /// Container engine command to invoke (default: `"podman"`).
    pub engine: String,
    /// Container image (default: `"project-memory-mcp:latest"`).
    pub image: String,
    /// Name to assign to the running container (default: `"project-memory-mcp"`).
    pub container_name: String,
    /// Port mappings in `"host:container"` format (default: `["3000:3000"]`).
    pub ports: Vec<String>,
    /// Labels to attach to the container (default: `{"project-memory.mcp": "true"}`).
    pub labels: HashMap<String, String>,
}

impl Default for ContainerRunnerConfig {
    fn default() -> Self {
        let mut labels = HashMap::new();
        labels.insert("project-memory.mcp".to_string(), "true".to_string());
        Self {
            engine: "podman".to_string(),
            image: "project-memory-mcp:latest".to_string(),
            container_name: "project-memory-mcp".to_string(),
            ports: vec!["3000:3000".to_string()],
            labels,
        }
    }
}

// ---------------------------------------------------------------------------
// PoolConfig
// ---------------------------------------------------------------------------

/// Configuration for the MCP instance pool (`[mcp.pool]` subsection).
///
/// When `max_connections_per_instance` is reached on all running instances the
/// supervisor spawns a new instance (up to `max_instances`) on the next
/// available port starting at `base_port`.
#[derive(Debug, Clone, Deserialize)]
#[serde(default)]
pub struct PoolConfig {
    /// Minimum number of MCP instances to keep running (default: 1).
    pub min_instances: u16,
    /// Hard cap on the number of MCP instances (default: 4).
    pub max_instances: u16,
    /// Connections per instance that triggers a scale-up (default: 5).
    pub max_connections_per_instance: usize,
    /// First port assigned to pool worker instances (default: 3460).
    /// The supervisor proxy occupies the primary MCP port (e.g. 3457).
    pub base_port: u16,
}

impl Default for PoolConfig {
    fn default() -> Self {
        Self {
            min_instances: 1,
            max_instances: 4,
            max_connections_per_instance: 5,
            base_port: 3460,
        }
    }
}

// ---------------------------------------------------------------------------
// McpSection
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(default)]
pub struct McpSection {
    pub enabled: bool,
    pub port: u16,
    /// Optional Unix/Windows named-pipe socket path.
    pub socket_path: Option<String>,
    /// Timeout (ms) for the HTTP health probe (default: 1500).
    pub health_timeout_ms: u64,
    /// Which backend manages the MCP process.
    pub backend: McpBackend,
    /// Node.js runner configuration (`[mcp.node]` subsection).
    pub node: NodeRunnerConfig,
    /// Container runner configuration (`[mcp.container]` subsection).
    pub container: ContainerRunnerConfig,
    /// Restart policy for the MCP service.
    #[serde(default)]
    pub restart_policy: RestartPolicy,
    /// Instance pool configuration (`[mcp.pool]` subsection).
    #[serde(default)]
    pub pool: PoolConfig,
}

impl Default for McpSection {
    fn default() -> Self {
        Self {
            enabled: true,
            port: 3457,
            socket_path: None,
            health_timeout_ms: 1500,
            backend: McpBackend::default(),
            node: NodeRunnerConfig::default(),
            container: ContainerRunnerConfig::default(),
            restart_policy: RestartPolicy::default(),
            pool: PoolConfig::default(),
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(default)]
pub struct InteractiveTerminalSection {
    pub enabled: bool,
    /// Path to the `interactive-terminal` executable (deprecated; prefer `command`).
    pub executable_path: Option<PathBuf>,
    pub port: u16,
    /// Executable to invoke for each terminal process (default: `"interactive-terminal"`).
    pub command: String,
    /// Arguments passed to the command (default: `[]`).
    pub args: Vec<String>,
    /// Working directory for spawned terminal processes.
    pub working_dir: Option<PathBuf>,
    /// Extra environment variables injected into each terminal process.
    pub env: HashMap<String, String>,
    /// Restart policy for the interactive terminal service.
    #[serde(default)]
    pub restart_policy: RestartPolicy,
}

impl Default for InteractiveTerminalSection {
    fn default() -> Self {
        Self {
            enabled: true,
            executable_path: None,
            port: 3458,
            command: "interactive-terminal".to_string(),
            args: Vec::new(),
            working_dir: None,
            env: HashMap::new(),
            restart_policy: RestartPolicy::default(),
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(default)]
pub struct DashboardSection {
    pub enabled: bool,
    pub port: u16,
    /// Directory containing compiled dashboard static files.
    pub static_dir: Option<PathBuf>,
    /// Executable to invoke for the dashboard process (default: `"node"`).
    pub command: String,
    /// Arguments passed to the command (default: `["dist/dashboard.js"]`).
    pub args: Vec<String>,
    /// Working directory for the dashboard process.
    pub working_dir: Option<PathBuf>,
    /// Extra environment variables injected into the dashboard process.
    pub env: HashMap<String, String>,
    /// When `true`, the dashboard enters degraded state if MCP becomes unavailable,
    /// but the process is NOT killed (default: `true`).
    pub requires_mcp: bool,
    /// Restart policy for the dashboard service.
    #[serde(default)]
    pub restart_policy: RestartPolicy,
}

impl Default for DashboardSection {
    fn default() -> Self {
        Self {
            enabled: true,
            port: 3459,
            static_dir: None,
            command: "node".to_string(),
            args: vec!["dist/dashboard.js".to_string()],
            working_dir: None,
            env: HashMap::new(),
            requires_mcp: true,
            restart_policy: RestartPolicy::default(),
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(default)]
pub struct FallbackApiSection {
    pub enabled: bool,
    pub port: u16,
    /// Executable to invoke for the fallback API process (default: "node").
    pub command: String,
    /// Arguments passed to the command (default: ["dist/fallback-rest-main.js"]).
    pub args: Vec<String>,
    /// Working directory for the fallback API process.
    pub working_dir: Option<PathBuf>,
    /// Extra environment variables injected into the fallback API process.
    pub env: HashMap<String, String>,
    /// Restart policy for the fallback API service.
    #[serde(default)]
    pub restart_policy: RestartPolicy,
}

impl Default for FallbackApiSection {
    fn default() -> Self {
        Self {
            enabled: true,
            port: 3465,
            command: "node".to_string(),
            args: vec!["dist/fallback-rest-main.js".to_string()],
            working_dir: None,
            env: HashMap::new(),
            restart_policy: RestartPolicy::default(),
        }
    }
}

/// Configuration for the CLI MCP server (port 3466 — HTTP-only, for CLI agents).
#[derive(Debug, Clone, Deserialize)]
#[serde(default)]
pub struct CliMcpSection {
    pub enabled: bool,
    pub port: u16,
    /// Executable to invoke (default: "node").
    pub command: String,
    /// Arguments passed to the command (default: ["dist/index-cli.js"]).
    pub args: Vec<String>,
    /// Working directory for the CLI MCP process.
    pub working_dir: Option<PathBuf>,
    /// Extra environment variables injected into the CLI MCP process.
    pub env: HashMap<String, String>,
    /// Restart policy for the CLI MCP service.
    #[serde(default)]
    pub restart_policy: RestartPolicy,
}

impl Default for CliMcpSection {
    fn default() -> Self {
        Self {
            enabled: true,
            port: 3466,
            command: "node".to_string(),
            args: vec!["dist/index-cli.js".to_string()],
            working_dir: None,
            env: HashMap::new(),
            restart_policy: RestartPolicy::default(),
        }
    }
}

/// Configuration for the approval-gate dialog.
#[derive(Debug, Deserialize)]
#[serde(default)]
pub struct ApprovalSection {
    /// Default countdown duration in seconds before auto-action (default: 60).
    pub default_countdown_seconds: u32,
    /// Action to take when the timer expires: `"approve"` or `"reject"` (default: `"approve"`).
    pub default_on_timeout: String,
    /// Whether the approval dialog should stay on top of other windows (default: `true`).
    pub always_on_top: bool,
}

impl Default for ApprovalSection {
    fn default() -> Self {
        Self {
            default_countdown_seconds: 60,
            default_on_timeout: "approve".to_string(),
            always_on_top: true,
        }
    }
}

// ---------------------------------------------------------------------------
// Launch mode for on-demand GUI apps
// ---------------------------------------------------------------------------

/// How and when a form-app process is started.
#[derive(Debug, Clone, Deserialize, Default, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum LaunchMode {
    /// Spawned when a request arrives and terminated after a response (default).
    #[default]
    OnDemand,
    /// Kept running as long as the supervisor is alive (future use).
    Persistent,
}

// ---------------------------------------------------------------------------
// FormAppConfig — shared config for on-demand GUI app processes
// ---------------------------------------------------------------------------

/// Configuration for an on-demand GUI form application.
///
/// Both the brainstorm GUI and approval GUI share this shape. Each is stored
/// under its own TOML section (`[brainstorm_gui]`, `[approval_gui]`).
#[derive(Debug, Clone, Deserialize)]
#[serde(default)]
pub struct FormAppConfig {
    /// Whether this app is available to launch (default: `true`).
    pub enabled: bool,
    /// Executable command (default: crate binary name).
    pub command: String,
    /// Arguments passed to the command (default: `[]`).
    pub args: Vec<String>,
    /// Working directory for the spawned process.
    pub working_dir: Option<PathBuf>,
    /// Extra environment variables injected into the process.
    pub env: HashMap<String, String>,
    /// Launch mode — how the process lifecycle is managed (default: `on_demand`).
    pub launch_mode: LaunchMode,
    /// Default timeout in seconds for waiting for the GUI to respond (default: 300 = 5 min).
    pub timeout_seconds: u64,
    /// Default window width in pixels (default: 720).
    pub window_width: u32,
    /// Default window height in pixels (default: 640).
    pub window_height: u32,
    /// Whether the window should stay on top of other windows (default: `false`).
    pub always_on_top: bool,
}

/// Create a default [`FormAppConfig`] with the given binary name as `command`.
fn default_form_app_config(binary_name: &str) -> FormAppConfig {
    FormAppConfig {
        enabled: true,
        command: binary_name.to_string(),
        args: Vec::new(),
        working_dir: None,
        env: HashMap::new(),
        launch_mode: LaunchMode::OnDemand,
        timeout_seconds: 300,
        window_width: 720,
        window_height: 640,
        always_on_top: false,
    }
}

impl Default for FormAppConfig {
    fn default() -> Self {
        default_form_app_config("form-app")
    }
}

// ---------------------------------------------------------------------------
// Form-app summonability diagnostics
// ---------------------------------------------------------------------------

/// High-level readiness result for a command string.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CommandDiagnosticStatus {
    Ready,
    MissingCommand,
    UnresolvedExecutablePath,
}

/// Result of resolving a command before any spawn attempt.
#[derive(Debug, Clone)]
pub struct CommandDiagnostic {
    pub status: CommandDiagnosticStatus,
    pub command: String,
    pub resolved_command: Option<PathBuf>,
    pub detail: String,
}

/// Summonability status for a form app at config/runtime-map registration time.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FormAppSummonabilityStatus {
    Enabled,
    DisabledByConfig,
    MissingCommand,
    UnresolvedExecutablePath,
}

/// Diagnostic payload used by startup/runtime-map gating.
#[derive(Debug, Clone)]
pub struct FormAppSummonabilityDiagnostic {
    pub app_name: String,
    pub status: FormAppSummonabilityStatus,
    pub command: String,
    pub resolved_command: Option<PathBuf>,
    pub detail: String,
}

impl FormAppSummonabilityDiagnostic {
    pub fn is_launchable(&self) -> bool {
        matches!(self.status, FormAppSummonabilityStatus::Enabled)
    }
}

/// Diagnose whether a form-app config is launchable before registering it in
/// the runtime map.
pub fn diagnose_form_app_summonability(
    app_name: &str,
    cfg: &FormAppConfig,
) -> FormAppSummonabilityDiagnostic {
    if !cfg.enabled {
        return FormAppSummonabilityDiagnostic {
            app_name: app_name.to_string(),
            status: FormAppSummonabilityStatus::DisabledByConfig,
            command: cfg.command.trim().to_string(),
            resolved_command: None,
            detail: format!(
                "form app \"{app_name}\" is disabled in config (enabled=false)"
            ),
        };
    }

    let command_diag = diagnose_command(&cfg.command, cfg.working_dir.as_ref());
    let status = match command_diag.status {
        CommandDiagnosticStatus::Ready => FormAppSummonabilityStatus::Enabled,
        CommandDiagnosticStatus::MissingCommand => FormAppSummonabilityStatus::MissingCommand,
        CommandDiagnosticStatus::UnresolvedExecutablePath => {
            FormAppSummonabilityStatus::UnresolvedExecutablePath
        }
    };

    FormAppSummonabilityDiagnostic {
        app_name: app_name.to_string(),
        status,
        command: command_diag.command,
        resolved_command: command_diag.resolved_command,
        detail: command_diag.detail,
    }
}

/// Resolve a command string to an executable path and classify failure causes.
pub fn diagnose_command(command: &str, working_dir: Option<&PathBuf>) -> CommandDiagnostic {
    let trimmed = command.trim();
    if trimmed.is_empty() {
        return CommandDiagnostic {
            status: CommandDiagnosticStatus::MissingCommand,
            command: String::new(),
            resolved_command: None,
            detail: "command is empty after trimming".to_string(),
        };
    }

    if let Some(resolved_command) = resolve_command_path(trimmed, working_dir) {
        return CommandDiagnostic {
            status: CommandDiagnosticStatus::Ready,
            command: trimmed.to_string(),
            resolved_command: Some(resolved_command.clone()),
            detail: format!("resolved executable path: {}", resolved_command.display()),
        };
    }

    let detail = if looks_like_explicit_path(trimmed) {
        let candidate = explicit_command_candidate(trimmed, working_dir);
        format!("executable path \"{}\" does not exist", candidate.display())
    } else {
        format!("command \"{trimmed}\" was not found on PATH")
    };

    CommandDiagnostic {
        status: CommandDiagnosticStatus::UnresolvedExecutablePath,
        command: trimmed.to_string(),
        resolved_command: None,
        detail,
    }
}

fn resolve_command_path(command: &str, working_dir: Option<&PathBuf>) -> Option<PathBuf> {
    if looks_like_explicit_path(command) {
        return canonical_existing_file(explicit_command_candidate(command, working_dir));
    }

    resolve_command_on_path(command)
}

fn explicit_command_candidate(command: &str, working_dir: Option<&PathBuf>) -> PathBuf {
    let base = PathBuf::from(command);
    if base.is_absolute() {
        base
    } else if let Some(dir) = working_dir {
        dir.join(base)
    } else {
        base
    }
}

fn resolve_command_on_path(command: &str) -> Option<PathBuf> {
    let path_env = std::env::var_os("PATH")?;
    let has_extension = Path::new(command).extension().is_some();

    for dir in std::env::split_paths(&path_env) {
        let direct_candidate = dir.join(command);
        if let Some(found) = canonical_existing_file(direct_candidate) {
            return Some(found);
        }

        if has_extension {
            continue;
        }

        #[cfg(windows)]
        {
            for ext in windows_pathexts() {
                let with_ext = dir.join(format!("{command}{ext}"));
                if let Some(found) = canonical_existing_file(with_ext) {
                    return Some(found);
                }
            }
        }
    }

    None
}

fn canonical_existing_file(path: PathBuf) -> Option<PathBuf> {
    if !path.is_file() {
        return None;
    }

    Some(path.canonicalize().unwrap_or(path))
}

fn looks_like_explicit_path(command: &str) -> bool {
    Path::new(command).is_absolute()
        || command.starts_with('.')
        || command.contains('/')
        || command.contains('\\')
}

#[cfg(windows)]
fn windows_pathexts() -> Vec<String> {
    let raw =
        std::env::var("PATHEXT").unwrap_or_else(|_| ".COM;.EXE;.BAT;.CMD".to_string());

    raw.split(';')
        .filter_map(|ext| {
            let trimmed = ext.trim();
            if trimmed.is_empty() {
                None
            } else if trimmed.starts_with('.') {
                Some(trimmed.to_ascii_lowercase())
            } else {
                Some(format!(".{}", trimmed.to_ascii_lowercase()))
            }
        })
        .collect()
}

// ---------------------------------------------------------------------------
// BrainstormGuiSection / ApprovalGuiSection
// ---------------------------------------------------------------------------

/// Configuration for the brainstorm decision-surface GUI (`[brainstorm_gui]`).
#[derive(Debug, Deserialize)]
#[serde(default)]
pub struct BrainstormGuiSection(pub FormAppConfig);

impl Default for BrainstormGuiSection {
    fn default() -> Self {
        Self(default_form_app_config("pm-brainstorm-gui"))
    }
}

impl std::ops::Deref for BrainstormGuiSection {
    type Target = FormAppConfig;
    fn deref(&self) -> &Self::Target { &self.0 }
}

/// Configuration for the approval-gate dialog GUI (`[approval_gui]`).
#[derive(Debug, Deserialize)]
#[serde(default)]
pub struct ApprovalGuiSection(pub FormAppConfig);

impl Default for ApprovalGuiSection {
    fn default() -> Self {
        let mut cfg = default_form_app_config("pm-approval-gui");
        cfg.always_on_top = true;
        cfg.timeout_seconds = 60;
        cfg.window_width = 480;
        cfg.window_height = 360;
        Self(cfg)
    }
}

impl std::ops::Deref for ApprovalGuiSection {
    type Target = FormAppConfig;
    fn deref(&self) -> &Self::Target { &self.0 }
}

/// Configuration for the data-change event broadcast channel (`[events]` section).
#[derive(Debug, Deserialize)]
#[serde(default)]
pub struct EventsSection {
    /// Master switch.  When `false` the `/supervisor/events` endpoint returns 503.
    pub enabled: bool,
    /// `tokio::sync::broadcast` buffer capacity.  Slow consumers lag and skip forward.
    pub buffer_size: usize,
    /// SSE keep-alive ping interval in seconds.
    pub heartbeat_interval: u64,
    /// Ring-buffer size for `Last-Event-Id` replay on reconnect.
    pub replay_buffer_size: usize,
}

impl Default for EventsSection {
    fn default() -> Self {
        Self {
            enabled: true,
            buffer_size: 256,
            heartbeat_interval: 30,
            replay_buffer_size: 100,
        }
    }
}

/// Configuration for the GUI HTTP launcher server (`[gui_server]` section).
///
/// This server listens on a dedicated TCP port so the MCP container (which
/// cannot access the Windows named pipe) can send GUI-launch requests.
#[derive(Debug, Deserialize)]
#[serde(default)]
pub struct GuiServerSection {
    /// Whether to start the GUI HTTP server (default: `true`).
    pub enabled: bool,
    /// TCP port to listen on (default: `3464`).
    /// Must not conflict with MCP proxy (3457), interactive terminal (3458),
    /// dashboard (3459), or MCP worker pool (3460-3463).
    pub port: u16,
    /// Address to bind on (default: `"0.0.0.0"`).
    /// Use `"0.0.0.0"` (default) so the server is reachable from Podman/Docker
    /// containers via `host.containers.internal`.  Set to `"127.0.0.1"` to
    /// restrict to loopback only.
    pub bind_address: String,
    /// Extra filesystem paths the virtual monitor's file browser is allowed to
    /// read.  Workspace paths registered in the MCP database are always included.
    /// Defaults to empty (only workspace paths are exposed).
    #[serde(default)]
    pub monitor_allowed_paths: Vec<String>,
    /// URL opened in the system browser when the "Virtual Monitor" button is
    /// clicked in the supervisor GUI.
    /// Defaults to the mobile Vite dev server at http://127.0.0.1:5173/monitor.
    #[serde(default = "default_monitor_url")]
    pub monitor_url: String,
}

fn default_monitor_url() -> String {
    "http://127.0.0.1:5173/monitor".to_string()
}

impl Default for GuiServerSection {
    fn default() -> Self {
        Self {
            enabled: true,
            port: 3464,
            bind_address: "0.0.0.0".to_string(),
            monitor_allowed_paths: Vec::new(),
            monitor_url: default_monitor_url(),
        }
    }
}

/// Runtime output capture controls (`[runtime_output]` section).
#[derive(Debug, Deserialize)]
#[serde(default)]
pub struct RuntimeOutputSection {
    /// When `false`, runtime output events are not buffered or broadcast.
    /// Subprocess stdout/stderr is still drained to avoid pipe backpressure.
    pub enabled: bool,
}

impl Default for RuntimeOutputSection {
    fn default() -> Self {
        Self { enabled: true }
    }
}

// ---------------------------------------------------------------------------
// AuthSection
// ---------------------------------------------------------------------------

/// API-key authentication for the GUI HTTP server (`[auth]` section).
#[derive(Debug, Clone, Deserialize, Default)]
#[serde(default)]
pub struct AuthSection {
    /// Secret key expected in the `X-PM-API-Key` request header.
    /// Auto-generated on first startup if not set; stored back to
    /// `supervisor.toml` under `[auth] api_key`.
    pub api_key: Option<String>,
}

// ---------------------------------------------------------------------------
// MdnsSection
// ---------------------------------------------------------------------------

/// mDNS service advertisement configuration (`[mdns]` section).
#[derive(Debug, Clone, Deserialize)]
#[serde(default)]
pub struct MdnsSection {
    /// Whether to advertise the supervisor via mDNS-SD (default: `true`).
    pub enabled: bool,
    /// mDNS-SD service name (default: `"ProjectMemory"`).
    pub instance_name: String,
}

impl Default for MdnsSection {
    fn default() -> Self {
        Self {
            enabled: true,
            instance_name: "ProjectMemory".to_string(),
        }
    }
}

// ---------------------------------------------------------------------------
// ChatbotSection
// ---------------------------------------------------------------------------

/// Which AI provider to use for the chatbot.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, Default, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ChatbotProvider {
    #[default]
    Gemini,
    Copilot,
    /// Anthropic Claude via the Messages API.
    /// Requires `api_key` or the `ANTHROPIC_API_KEY` environment variable.
    /// Falls back to Gemini then Copilot when no key is available.
    Claude,
}

/// Configuration for the in-supervisor AI chatbot panel (`[chatbot]` section).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct ChatbotSection {
    pub enabled: bool,
    pub provider: ChatbotProvider,
    /// API key for the chosen provider (stored in plain text; redacted in logs).
    pub api_key: String,
    /// Model name override.  Empty = use defaults (gemini-2.0-flash / gpt-4o).
    pub model: String,
}

impl Default for ChatbotSection {
    fn default() -> Self {
        Self {
            enabled: true,
            provider: ChatbotProvider::Gemini,
            api_key: String::new(),
            model: String::new(),
        }
    }
}

// ---------------------------------------------------------------------------
// ServerDefinition
// ---------------------------------------------------------------------------

/// A single externally-managed server definition.
#[derive(Debug, Clone, Deserialize, Default)]
pub struct ServerDefinition {
    /// Unique name for this server (used in logs and IPC).
    pub name: String,
    /// Executable path or command.
    pub command: String,
    /// Arguments passed to the command.
    #[serde(default)]
    pub args: Vec<String>,
    /// Working directory for the process.
    pub working_dir: Option<PathBuf>,
    /// Extra environment variables for the process.
    #[serde(default)]
    pub env: std::collections::HashMap<String, String>,
    /// Optional port used for startup readiness and liveness probes.
    pub port: Option<u16>,
    /// Restart policy for this server.
    #[serde(default)]
    pub restart_policy: RestartPolicy,
}

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

#[derive(Debug)]
pub enum ConfigError {
    Io(io::Error),
    Parse(toml::de::Error),
}

impl fmt::Display for ConfigError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ConfigError::Io(e) => write!(f, "config I/O error: {e}"),
            ConfigError::Parse(e) => write!(f, "config parse error: {e}"),
        }
    }
}

impl std::error::Error for ConfigError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            ConfigError::Io(e) => Some(e),
            ConfigError::Parse(e) => Some(e),
        }
    }
}

impl From<io::Error> for ConfigError {
    fn from(e: io::Error) -> Self {
        ConfigError::Io(e)
    }
}

impl From<toml::de::Error> for ConfigError {
    fn from(e: toml::de::Error) -> Self {
        ConfigError::Parse(e)
    }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Return the default config file path:
/// `%APPDATA%\ProjectMemory\supervisor.toml` on Windows,
/// `~/.config/ProjectMemory/supervisor.toml` on other platforms.
pub fn default_config_path() -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        let appdata = std::env::var("APPDATA").unwrap_or_else(|_| {
            dirs_from_env().unwrap_or_else(|| "C:\\Users\\Default\\AppData\\Roaming".to_string())
        });
        PathBuf::from(appdata).join("ProjectMemory").join("supervisor.toml")
    }
    #[cfg(not(target_os = "windows"))]
    {
        let home = std::env::var("HOME").unwrap_or_else(|_| "/root".to_string());
        PathBuf::from(home)
            .join(".config")
            .join("ProjectMemory")
            .join("supervisor.toml")
    }
}

/// Resolve the config path: use `override_path` when provided, otherwise fall
/// back to [`default_config_path`].
pub fn get_config_path(override_path: Option<&PathBuf>) -> PathBuf {
    override_path
        .cloned()
        .unwrap_or_else(default_config_path)
}

/// Load and deserialise the supervisor config from `path`.
///
/// If the file does not exist, `Ok(SupervisorConfig::default())` is returned
/// so the process can start with defaults without requiring a config file.
pub fn load(path: &PathBuf) -> Result<SupervisorConfig, ConfigError> {
    match std::fs::read_to_string(path) {
        Ok(contents) => {
            let config: SupervisorConfig = toml::from_str(&contents)?;
            Ok(config)
        }
        Err(e) if e.kind() == io::ErrorKind::NotFound => {
            // Missing config is not fatal — use all defaults.
            Ok(SupervisorConfig::default())
        }
        Err(e) => Err(ConfigError::Io(e)),
    }
}

/// Load and deserialise the supervisor config from `path`, returning an
/// `anyhow::Result`.  Missing files are treated as defaults (not an error).
///
/// This is the primary entry-point for `supervisor-iced`.
pub fn load_config(path: &Path) -> anyhow::Result<SupervisorConfig> {
    match std::fs::read_to_string(path) {
        Ok(contents) => {
            let config: SupervisorConfig = toml::from_str(&contents)
                .map_err(|e| anyhow::anyhow!("failed to parse {}: {e}", path.display()))?;
            Ok(config)
        }
        Err(e) if e.kind() == io::ErrorKind::NotFound => {
            // Missing config is not fatal — use all defaults.
            Ok(SupervisorConfig::default())
        }
        Err(e) => Err(anyhow::anyhow!(
            "failed to read config file {}: {e}",
            path.display()
        )),
    }
}

/// Path of the small JSON sidecar that persists only the chatbot runtime
/// settings (api_key, provider, model).  Stored alongside `supervisor.toml`
/// as `chatbot_state.json` so it survives TOML rewrites.
pub fn chatbot_state_path(config_path: &PathBuf) -> PathBuf {
    config_path
        .parent()
        .unwrap_or_else(|| std::path::Path::new("."))
        .join("chatbot_state.json")
}

/// Load the persisted chatbot state sidecar.  Returns `None` when the file
/// does not exist (first run or file was deleted).
pub fn load_chatbot_state(path: &PathBuf) -> Option<ChatbotSection> {
    let text = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&text).ok()
}

/// Persist the chatbot section to the sidecar JSON file.
/// Creates the parent directory if it does not exist.
/// Silently ignores write errors (non-critical UX path).
pub fn save_chatbot_state(path: &PathBuf, section: &ChatbotSection) {
    if let Ok(json) = serde_json::to_string_pretty(section) {
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let _ = std::fs::write(path, json);
    }
}

// ---------------------------------------------------------------------------
// apply_workspace_relative_defaults
// ---------------------------------------------------------------------------

/// Apply executable/workspace-relative defaults for managed subprocesses.
///
/// This lets the native supervisor launch directly without first depending on
/// an external script to materialize every working directory into
/// `supervisor.toml`.
pub fn apply_workspace_relative_defaults(cfg: &mut SupervisorConfig, workspace_root: &Path) {
    let server_dir = workspace_root.join("server");
    assign_working_dir_if_present(&mut cfg.mcp.node.working_dir, server_dir.clone(), "dist/server.js");
    assign_working_dir_if_present(
        &mut cfg.fallback_api.working_dir,
        server_dir.clone(),
        "dist/fallback-rest-main.js",
    );
    assign_working_dir_if_present(&mut cfg.cli_mcp.working_dir, server_dir, "dist/index-cli.js");

    let dashboard_dir = workspace_root.join("dashboard").join("server");
    assign_working_dir_if_present(&mut cfg.dashboard.working_dir, dashboard_dir, "dist/index.js");
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

fn default_data_dir() -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        let appdata = std::env::var("APPDATA").unwrap_or_else(|_| {
            "C:\\Users\\Default\\AppData\\Roaming".to_string()
        });
        PathBuf::from(appdata).join("ProjectMemory")
    }
    #[cfg(not(target_os = "windows"))]
    {
        let home = std::env::var("HOME").unwrap_or_else(|_| "/root".to_string());
        PathBuf::from(home).join(".local").join("share").join("ProjectMemory")
    }
}

fn default_node_command() -> String {
    "node".to_string()
}

fn default_node_args() -> Vec<String> {
    vec!["dist/server.js".to_string()]
}

fn assign_working_dir_if_present(slot: &mut Option<PathBuf>, candidate: PathBuf, marker: &str) {
    if slot.is_none() && candidate.join(marker).exists() {
        *slot = Some(candidate);
    }
}

/// Fallback for %APPDATA% when the env var is absent (should rarely happen).
#[cfg(target_os = "windows")]
fn dirs_from_env() -> Option<String> {
    std::env::var("USERPROFILE")
        .ok()
        .map(|p| format!("{p}\\AppData\\Roaming"))
}
