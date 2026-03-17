//! Supervisor configuration — loaded from TOML, all sections optional with sensible defaults.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fmt;
use std::io;
use std::path::{Path, PathBuf};

use crate::control::protocol::BackendKind;

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
// McpBackend → BackendKind conversion
// ---------------------------------------------------------------------------

/// Lossless conversion from the config-layer backend selector to the
/// control-API backend kind used by the control-plane registry.
impl From<McpBackend> for BackendKind {
    fn from(b: McpBackend) -> Self {
        match b {
            McpBackend::Node => BackendKind::Node,
            McpBackend::Container => BackendKind::Container,
        }
    }
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
}

impl Default for GuiServerSection {
    fn default() -> Self {
        Self {
            enabled: true,
            port: 3464,
            bind_address: "0.0.0.0".to_string(),
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
// ChatbotSection
// ---------------------------------------------------------------------------

/// Which AI provider to use for the chatbot.
#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ChatbotProvider {
    #[default]
    Gemini,
    Copilot,
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

/// A single externally-managed server definition.
#[derive(Debug, Deserialize, Default)]
pub struct ServerDefinition {
    /// Unique name for this server (used in logs and IPC).
    pub name: String,
    /// Executable path or command.
    pub command: String,
    /// Arguments passed to the command.
    #[serde(default)]
    pub args: Vec<String>,
    /// Extra environment variables for the process.
    #[serde(default)]
    pub env: std::collections::HashMap<String, String>,
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
/// Silently ignores write errors (non-critical UX path).
pub fn save_chatbot_state(path: &PathBuf, section: &ChatbotSection) {
    if let Ok(json) = serde_json::to_string_pretty(section) {
        let _ = std::fs::write(path, json);
    }
}

// ---------------------------------------------------------------------------
// Helpers
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

/// Fallback for %APPDATA% when the env var is absent (should rarely happen).
#[cfg(target_os = "windows")]
fn dirs_from_env() -> Option<String> {
    std::env::var("USERPROFILE")
        .ok()
        .map(|p| format!("{p}\\AppData\\Roaming"))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn write_tmp(contents: &str) -> (tempdir_like::TempDir, PathBuf) {
        let dir = tempdir_like::TempDir::new().expect("temp dir");
        let path = dir.path().join("supervisor.toml");
        std::fs::write(&path, contents).expect("write");
        (dir, path)
    }

    #[test]
    fn defaults_when_file_missing() {
        let path = PathBuf::from("/nonexistent/supervisor.toml");
        let cfg = load(&path).expect("should use defaults");
        assert_eq!(cfg.supervisor.log_level, "info");
        assert_eq!(cfg.reconnect.max_delay_ms, 30_000);
        assert!(cfg.runtime_output.enabled, "runtime output capture should be enabled by default");
        assert!(cfg.fallback_api.enabled, "fallback API should be enabled by default");
        assert_eq!(cfg.fallback_api.port, 3465);
        assert_eq!(cfg.fallback_api.args, vec!["dist/fallback-rest-main.js".to_string()]);
    }

    #[test]
    fn workspace_relative_defaults_fill_missing_working_dirs() {
        let dir = tempdir_like::TempDir::new().expect("temp dir");
        let root = dir.path();
        std::fs::create_dir_all(root.join("server").join("dist")).expect("mk server dist");
        std::fs::create_dir_all(root.join("dashboard").join("server").join("dist"))
            .expect("mk dashboard dist");
        std::fs::write(root.join("server").join("dist").join("server.js"), "")
            .expect("write server.js");
        std::fs::write(
            root.join("server").join("dist").join("fallback-rest-main.js"),
            "",
        )
        .expect("write fallback-rest-main.js");
        std::fs::write(root.join("server").join("dist").join("index-cli.js"), "")
            .expect("write index-cli.js");
        std::fs::write(
            root.join("dashboard").join("server").join("dist").join("index.js"),
            "",
        )
        .expect("write dashboard index.js");

        let mut cfg = SupervisorConfig::default();
        apply_workspace_relative_defaults(&mut cfg, root);

        assert_eq!(cfg.mcp.node.working_dir, Some(root.join("server")));
        assert_eq!(cfg.fallback_api.working_dir, Some(root.join("server")));
        assert_eq!(cfg.cli_mcp.working_dir, Some(root.join("server")));
        assert_eq!(
            cfg.dashboard.working_dir,
            Some(root.join("dashboard").join("server"))
        );
    }

    #[test]
    fn workspace_relative_defaults_preserve_explicit_working_dirs() {
        let dir = tempdir_like::TempDir::new().expect("temp dir");
        let root = dir.path();
        let explicit = root.join("custom-server");

        let mut cfg = SupervisorConfig::default();
        cfg.cli_mcp.working_dir = Some(explicit.clone());

        apply_workspace_relative_defaults(&mut cfg, root);

        assert_eq!(cfg.cli_mcp.working_dir, Some(explicit));
    }

    #[test]
    fn partial_toml_uses_defaults_for_missing_fields() {
        let toml = r#"
[supervisor]
log_level = "debug"
"#;
        let cfg: SupervisorConfig = toml::from_str(toml).expect("parse");
        assert_eq!(cfg.supervisor.log_level, "debug");
        // bind_address should still be the default
        assert_eq!(cfg.supervisor.bind_address, "127.0.0.1:3456");
        // mcp section should be default
        assert!(cfg.mcp.enabled);
    }

    #[test]
    fn invalid_toml_returns_parse_error() {
        let toml = "this is {{ not valid toml !!";
        let result: Result<SupervisorConfig, _> = toml::from_str(toml);
        assert!(result.is_err());
    }

    #[test]
    fn get_config_path_uses_override() {
        let override_path = PathBuf::from("/custom/path/supervisor.toml");
        let resolved = get_config_path(Some(&override_path));
        assert_eq!(resolved, override_path);
    }

    #[test]
    fn get_config_path_returns_default_when_no_override() {
        let resolved = get_config_path(None);
        assert!(resolved.to_string_lossy().contains("ProjectMemory"));
        assert!(resolved.to_string_lossy().ends_with("supervisor.toml"));
    }

    #[test]
    fn server_definitions_parse_correctly() {
        let toml = r#"
[[servers]]
name = "mcp-local"
command = "node"
args = ["server.js", "--port", "3001"]

[[servers]]
name = "dashboard"
command = "npx"
args = ["vite"]
restart_policy = "never_restart"
"#;
        let cfg: SupervisorConfig = toml::from_str(toml).expect("parse");
        assert_eq!(cfg.servers.len(), 2);
        assert_eq!(cfg.servers[0].name, "mcp-local");
        assert!(matches!(cfg.servers[0].restart_policy, RestartPolicy::AlwaysRestart)); // default
        assert!(matches!(cfg.servers[1].restart_policy, RestartPolicy::NeverRestart));
    }

    #[test]
    fn control_transport_named_pipe_serde() {
        let toml = "[supervisor]\ncontrol_transport = \"named_pipe\"\n";
        let cfg: SupervisorConfig = toml::from_str(toml).expect("parse");
        assert!(matches!(
            cfg.supervisor.control_transport,
            ControlTransport::NamedPipe
        ));
    }

    #[test]
    fn control_transport_tcp_serde() {
        let toml = "[supervisor]\ncontrol_transport = \"tcp\"\n";
        let cfg: SupervisorConfig = toml::from_str(toml).expect("parse");
        assert!(matches!(
            cfg.supervisor.control_transport,
            ControlTransport::Tcp
        ));
    }

    #[test]
    fn supervisor_section_defaults() {
        let section = SupervisorSection::default();
        assert_eq!(section.control_tcp_port, 45470);
        assert!(matches!(
            section.control_transport,
            ControlTransport::NamedPipe
        ));
        assert!(
            section.control_pipe.contains("project-memory-supervisor"),
            "control_pipe should contain 'project-memory-supervisor', got: {}",
            section.control_pipe
        );
    }

    // ------------------------------------------------------------------
    // Extended coverage: missing fields, invalid values, portable --config
    // override, APPDATA fallback, malformed TOML, comprehensive defaults.
    // ------------------------------------------------------------------

    /// load() from an actual temp file applies non-default values correctly.
    #[test]
    fn load_from_file_applies_values() {
        let toml = r#"
[supervisor]
log_level = "warn"
bind_address = "0.0.0.0:9999"
control_tcp_port = 12345

[mcp]
enabled = false
port = 4000

[reconnect]
initial_delay_ms = 250
max_delay_ms = 60000
multiplier = 1.5
max_attempts = 10
"#;
        let (_dir, path) = write_tmp(toml);
        let cfg = load(&path).expect("load should succeed");
        assert_eq!(cfg.supervisor.log_level, "warn");
        assert_eq!(cfg.supervisor.bind_address, "0.0.0.0:9999");
        assert_eq!(cfg.supervisor.control_tcp_port, 12345);
        assert!(!cfg.mcp.enabled);
        assert_eq!(cfg.mcp.port, 4000);
        assert_eq!(cfg.reconnect.initial_delay_ms, 250);
        assert_eq!(cfg.reconnect.max_delay_ms, 60_000);
        assert_eq!(cfg.reconnect.multiplier, 1.5);
        assert_eq!(cfg.reconnect.max_attempts, 10);
    }

    /// A partial [supervisor] section still receives defaults for every
    /// omitted field, and every other section also uses its defaults.
    #[test]
    fn load_with_partial_supervisor_section_defaults_rest() {
        let toml = r#"
[supervisor]
log_level = "error"
"#;
        let (_dir, path) = write_tmp(toml);
        let cfg = load(&path).expect("load should succeed");
        // The one provided value is applied.
        assert_eq!(cfg.supervisor.log_level, "error");
        // All other supervisor fields are still defaults.
        assert_eq!(cfg.supervisor.bind_address, "127.0.0.1:3456");
        assert_eq!(cfg.supervisor.control_tcp_port, 45470);
        // Other sections are fully defaulted.
        assert!(cfg.mcp.enabled);
        assert_eq!(cfg.mcp.port, 3457);
        assert_eq!(cfg.reconnect.initial_delay_ms, 500);
        assert!(cfg.discovery.advertise);
    }

    /// Malformed TOML written to a file must produce ConfigError::Parse,
    /// not an unwrap-panic or an IO error.
    #[test]
    fn load_malformed_toml_returns_config_error_not_panic() {
        let (_dir, path) = write_tmp("[[broken\nthis = is not = valid}}}");
        let result = load(&path);
        assert!(result.is_err(), "malformed TOML should return Err, not panic");
        match result {
            Err(ConfigError::Parse(_)) => {}
            Err(ConfigError::Io(_)) => panic!("expected ConfigError::Parse, got ConfigError::Io"),
            Ok(_) => panic!("expected error but got Ok"),
        }
    }

    /// Providing a wrong type for a numeric field (port = "string") must
    /// produce a ConfigError::Parse via load().
    #[test]
    fn load_invalid_type_for_port_returns_parse_error() {
        let (_dir, path) = write_tmp(
            r#"
[mcp]
port = "not_a_port_number"
"#,
        );
        let result = load(&path);
        assert!(result.is_err(), "invalid port type should return Err");
        assert!(
            matches!(result, Err(ConfigError::Parse(_))),
            "expected ConfigError::Parse for bad port type"
        );
    }

    /// When load() falls back to defaults (file not found), every section's
    /// default values must match the design specification exactly.
    #[test]
    fn all_section_defaults_are_correct() {
        let cfg = load(&PathBuf::from("/nonexistent/path/supervisor.toml"))
            .expect("missing file should return defaults");

        // [supervisor]
        assert_eq!(cfg.supervisor.log_level, "info");
        assert_eq!(cfg.supervisor.bind_address, "127.0.0.1:3456");
        assert_eq!(cfg.supervisor.control_tcp_port, 45470);

        // [discovery]
        assert_eq!(cfg.discovery.methods, vec!["local".to_string()]);
        assert!(cfg.discovery.advertise);

        // [reconnect]
        assert_eq!(cfg.reconnect.initial_delay_ms, 500);
        assert_eq!(cfg.reconnect.max_delay_ms, 30_000);
        assert_eq!(cfg.reconnect.multiplier, 2.0);
        assert_eq!(cfg.reconnect.max_attempts, 0);

        // [mcp]
        assert!(cfg.mcp.enabled);
        assert_eq!(cfg.mcp.port, 3457);
        assert!(cfg.mcp.socket_path.is_none());

        // [interactive_terminal]
        assert!(cfg.interactive_terminal.enabled);
        assert_eq!(cfg.interactive_terminal.port, 3458);
        assert!(cfg.interactive_terminal.executable_path.is_none());

        // [dashboard]
        assert!(cfg.dashboard.enabled);
        assert_eq!(cfg.dashboard.port, 3459);
        assert!(cfg.dashboard.static_dir.is_none());

        // no servers by default
        assert!(cfg.servers.is_empty());
    }

    /// get_config_path(Some(&path)) returns the exact override path, and
    /// that path is loadable by load().
    #[test]
    fn get_config_path_with_override_is_loadable() {
        let toml = r#"
[supervisor]
log_level = "trace"
"#;
        let (_dir, custom_path) = write_tmp(toml);
        let resolved = get_config_path(Some(&custom_path));
        assert_eq!(resolved, custom_path);
        let cfg = load(&resolved).expect("load via custom path should succeed");
        assert_eq!(cfg.supervisor.log_level, "trace");
    }

    /// default_config_path() must be rooted under the platform's standard
    /// user-data directory (%APPDATA% on Windows, $HOME/.config elsewhere)
    /// and end with the expected file name.
    #[test]
    fn default_config_path_uses_platform_env_var() {
        let path = default_config_path();
        assert!(
            path.to_string_lossy().contains("ProjectMemory"),
            "default path should contain 'ProjectMemory'; got {path:?}"
        );
        assert_eq!(
            path.file_name().and_then(|n| n.to_str()),
            Some("supervisor.toml"),
            "default path should end in 'supervisor.toml'; got {path:?}"
        );
        #[cfg(target_os = "windows")]
        {
            if let Ok(appdata) = std::env::var("APPDATA") {
                assert!(
                    path.starts_with(&appdata),
                    "Windows default path should be rooted under %APPDATA%; got {path:?}"
                );
            }
        }
        #[cfg(not(target_os = "windows"))]
        {
            if let Ok(home) = std::env::var("HOME") {
                assert!(
                    path.starts_with(&home),
                    "non-Windows default path should be rooted under $HOME; got {path:?}"
                );
            }
        }
    }

    /// An entirely empty TOML file (zero bytes) must load successfully
    /// and produce a fully-defaulted config.
    #[test]
    fn entirely_empty_toml_file_loads_all_defaults() {
        let (_dir, path) = write_tmp("");
        let cfg = load(&path).expect("empty TOML should load with defaults");
        assert_eq!(cfg.supervisor.log_level, "info");
        assert!(cfg.mcp.enabled);
        assert!(cfg.servers.is_empty());
    }

    /// A [[servers]] entry that omits restart_policy must default to AlwaysRestart.
    #[test]
    fn server_restart_policy_defaults_to_always_restart() {
        let toml = r#"
[[servers]]
name = "my-server"
command = "/usr/bin/node"
"#;
        let (_dir, path) = write_tmp(toml);
        let cfg = load(&path).expect("parse");
        assert_eq!(cfg.servers.len(), 1);
        assert!(
            matches!(cfg.servers[0].restart_policy, RestartPolicy::AlwaysRestart),
            "restart_policy should default to AlwaysRestart for a server that omits it"
        );
    }

    // ------------------------------------------------------------------
    // Phase 2: McpSection / NodeRunnerConfig defaults
    // ------------------------------------------------------------------

    /// McpSection::default() must select the Node backend.
    #[test]
    fn mcp_backend_defaults_to_node() {
        let mcp = McpSection::default();
        assert!(
            matches!(mcp.backend, McpBackend::Node),
            "McpSection default backend should be Node"
        );
    }

    /// McpSection::default() must set health_timeout_ms to 1500 ms.
    #[test]
    fn mcp_section_health_timeout_default() {
        let mcp = McpSection::default();
        assert_eq!(
            mcp.health_timeout_ms, 1500,
            "default health_timeout_ms should be 1500"
        );
    }

    /// NodeRunnerConfig::default() must produce command="node" and
    /// args=["dist/server.js"].
    #[test]
    fn node_runner_config_defaults() {
        let node = NodeRunnerConfig::default();
        assert_eq!(node.command, "node", "default command should be 'node'");
        assert_eq!(
            node.args,
            vec!["dist/server.js".to_string()],
            "default args should be ['dist/server.js']"
        );
    }

    // ------------------------------------------------------------------
    // Phase 3: ContainerRunnerConfig defaults via McpSection
    // ------------------------------------------------------------------

    /// `McpSection::default().container` must carry `ContainerRunnerConfig`
    /// defaults: engine="podman", image="project-memory-mcp:latest".
    #[test]
    fn mcp_section_container_defaults() {
        let mcp = McpSection::default();
        assert_eq!(
            mcp.container.engine, "podman",
            "McpSection default container engine should be 'podman'"
        );
        assert_eq!(
            mcp.container.image, "project-memory-mcp:latest",
            "McpSection default container image should be 'project-memory-mcp:latest'"
        );
        assert_eq!(
            mcp.container.container_name, "project-memory-mcp",
            "McpSection default container_name should be 'project-memory-mcp'"
        );
    }

    // ------------------------------------------------------------------
    // Phase 4: InteractiveTerminalSection / DashboardSection defaults
    // ------------------------------------------------------------------

    /// `InteractiveTerminalSection::default()` must produce
    /// `command = "interactive-terminal"` and empty `args`.
    #[test]
    fn interactive_terminal_section_defaults() {
        let it = InteractiveTerminalSection::default();
        assert_eq!(
            it.command, "interactive-terminal",
            "default command should be 'interactive-terminal'"
        );
        assert!(
            it.args.is_empty(),
            "default args should be empty, got: {:?}",
            it.args
        );
    }

    /// `DashboardSection::default()` must have `requires_mcp = true`
    /// and `command = "node"`.
    #[test]
    fn dashboard_section_requires_mcp_default() {
        let cfg = DashboardSection::default();
        assert!(
            cfg.requires_mcp,
            "requires_mcp should default to true"
        );
        assert_eq!(
            cfg.command, "node",
            "command should default to 'node'"
        );
    }

    #[test]
    fn diagnose_form_app_summonability_reports_disabled_by_config() {
        let mut cfg = FormAppConfig::default();
        cfg.enabled = false;

        let diag = diagnose_form_app_summonability("approval_gui", &cfg);
        assert_eq!(diag.app_name, "approval_gui");
        assert!(matches!(
            diag.status,
            FormAppSummonabilityStatus::DisabledByConfig
        ));
        assert!(!diag.is_launchable());
    }

    #[test]
    fn diagnose_form_app_summonability_reports_missing_command() {
        let mut cfg = FormAppConfig::default();
        cfg.command = "   ".to_string();

        let diag = diagnose_form_app_summonability("approval_gui", &cfg);
        assert!(matches!(
            diag.status,
            FormAppSummonabilityStatus::MissingCommand
        ));
        assert!(diag.detail.contains("empty"));
        assert!(!diag.is_launchable());
    }

    #[test]
    fn diagnose_form_app_summonability_reports_unresolved_executable_path() {
        let mut cfg = FormAppConfig::default();
        cfg.command = "this-command-should-not-exist-pm-approval-gui".to_string();

        let diag = diagnose_form_app_summonability("approval_gui", &cfg);
        assert!(matches!(
            diag.status,
            FormAppSummonabilityStatus::UnresolvedExecutablePath
        ));
        assert!(diag.detail.contains("not found") || diag.detail.contains("does not exist"));
        assert!(!diag.is_launchable());
    }

    #[test]
    fn diagnose_command_resolves_trimmed_relative_path_against_working_dir() {
        let temp = tempdir_like::TempDir::new().expect("temp dir");
        let working_dir = temp.path().to_path_buf();
        let command_path = working_dir.join("bin").join("mock-gui");
        std::fs::create_dir_all(command_path.parent().expect("parent dir")).expect("mkdir");
        std::fs::write(&command_path, "echo").expect("write placeholder binary");

        let diag = diagnose_command("  ./bin/mock-gui  ", Some(&working_dir));
        assert!(matches!(diag.status, CommandDiagnosticStatus::Ready));
        assert_eq!(diag.command, "./bin/mock-gui");
        let resolved = diag.resolved_command.expect("resolved command path");
        assert_eq!(
            resolved,
            command_path
                .canonicalize()
                .unwrap_or_else(|_| command_path.clone())
        );
    }

    #[test]
    fn diagnose_command_reports_explicit_missing_path_with_resolved_candidate_detail() {
        let temp = tempdir_like::TempDir::new().expect("temp dir");
        let working_dir = temp.path().to_path_buf();
        let expected_candidate = working_dir.join("missing").join("approval-gui");

        let diag = diagnose_command("./missing/approval-gui", Some(&working_dir));
        assert!(matches!(
            diag.status,
            CommandDiagnosticStatus::UnresolvedExecutablePath
        ));
        assert!(diag.resolved_command.is_none());
        assert!(
            diag.detail.contains(expected_candidate.file_name().and_then(|n| n.to_str()).unwrap_or("approval-gui")),
            "detail should mention the unresolved command candidate, got: {}",
            diag.detail
        );
        assert!(
            diag.detail.contains("missing"),
            "detail should include missing path context, got: {}",
            diag.detail
        );
    }

    #[test]
    fn diagnose_form_app_summonability_reports_enabled_for_existing_executable() {
        let mut cfg = FormAppConfig::default();
        let current_exe = std::env::current_exe().expect("current executable path");
        cfg.command = current_exe.to_string_lossy().to_string();

        let diag = diagnose_form_app_summonability("approval_gui", &cfg);
        assert!(matches!(diag.status, FormAppSummonabilityStatus::Enabled));
        assert!(diag.is_launchable());
        assert!(diag.resolved_command.is_some());
    }
}

// Minimal temp-dir shim used only in tests (avoids pulling in the `tempfile`
// crate as a dev-dependency). Replace with `tempfile::TempDir` if that crate
// is added to [dev-dependencies].
#[cfg(test)]
mod tempdir_like {
    use std::path::{Path, PathBuf};

    pub struct TempDir(PathBuf);

    impl TempDir {
        pub fn new() -> std::io::Result<Self> {
            use std::time::{SystemTime, UNIX_EPOCH};
            let ts = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.subsec_nanos())
                .unwrap_or(0);
            let dir = std::env::temp_dir().join(format!("pm_test_{ts}"));
            std::fs::create_dir_all(&dir)?;
            Ok(TempDir(dir))
        }
        pub fn path(&self) -> &Path {
            &self.0
        }
    }

    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }
}
