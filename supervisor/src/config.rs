//! Supervisor configuration — loaded from TOML, all sections optional with sensible defaults.

use serde::Deserialize;
use std::collections::HashMap;
use std::fmt;
use std::io;
use std::path::PathBuf;

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
}

impl Default for ReconnectSection {
    fn default() -> Self {
        Self {
            initial_delay_ms: 500,
            max_delay_ms: 30_000,
            multiplier: 2.0,
            max_attempts: 0,
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
#[derive(Debug, Deserialize)]
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
        }
    }
}

#[derive(Debug, Deserialize)]
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
        }
    }
}

#[derive(Debug, Deserialize)]
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
    /// Whether the supervisor should auto-restart this server on crash.
    #[serde(default = "default_true")]
    pub auto_restart: bool,
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

const fn default_true() -> bool {
    true
}

fn default_node_command() -> String {
    "node".to_string()
}

fn default_node_args() -> Vec<String> {
    vec!["dist/server.js".to_string()]
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
auto_restart = false
"#;
        let cfg: SupervisorConfig = toml::from_str(toml).expect("parse");
        assert_eq!(cfg.servers.len(), 2);
        assert_eq!(cfg.servers[0].name, "mcp-local");
        assert!(cfg.servers[0].auto_restart); // default = true
        assert!(!cfg.servers[1].auto_restart);
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

    /// A [[servers]] entry that omits auto_restart must default to true.
    #[test]
    fn server_auto_restart_defaults_to_true() {
        let toml = r#"
[[servers]]
name = "my-server"
command = "/usr/bin/node"
"#;
        let (_dir, path) = write_tmp(toml);
        let cfg = load(&path).expect("parse");
        assert_eq!(cfg.servers.len(), 1);
        assert!(
            cfg.servers[0].auto_restart,
            "auto_restart should default to true for a server that omits it"
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
