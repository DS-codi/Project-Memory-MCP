/// Central application state — replaces all CxxQt qproperty bindings on
/// SupervisorGuiBridge.  Every panel reads from this struct; mutations are
/// driven by `Message` variants in `main.rs`.

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub enum ServiceStatus {
    #[default]
    Unknown,
    Running,
    Starting,
    Stopping,
    Stopped,
    Error,
}

impl ServiceStatus {
    pub fn from_str(s: &str) -> Self {
        match s {
            "Running"  => Self::Running,
            "Starting" => Self::Starting,
            "Stopping" => Self::Stopping,
            "Stopped"  => Self::Stopped,
            "Error"    => Self::Error,
            _          => Self::Unknown,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Running  => "Running",
            Self::Starting => "Starting",
            Self::Stopping => "Stopping",
            Self::Stopped  => "Stopped",
            Self::Error    => "Error",
            Self::Unknown  => "Unknown",
        }
    }

    pub fn color(&self) -> iced::Color {
        match self {
            Self::Running             => iced::Color::from_rgb8(0x3f, 0xb9, 0x50),
            Self::Starting
            | Self::Stopping         => iced::Color::from_rgb8(0xff, 0xeb, 0x3b),
            Self::Error
            | Self::Stopped          => iced::Color::from_rgb8(0xf8, 0x51, 0x49),
            Self::Unknown            => iced::Color::from_rgb8(0x9e, 0x9e, 0x9e),
        }
    }
}

// ── Per-service enrichment ────────────────────────────────────────────────────
#[derive(Debug, Clone, Default)]
pub struct ServiceInfo {
    pub status:      ServiceStatus,
    pub port:        i32,
    pub pid:         i32,
    pub uptime_secs: i32,
    pub runtime:     String,
}

// ── Activity-feed entry ───────────────────────────────────────────────────────
#[derive(Debug, Clone)]
pub struct ActivityEntry {
    pub agent:  String,
    pub event:  String,
    pub time:   String,
}

// ── Active-session entry ──────────────────────────────────────────────────────
#[derive(Debug, Clone)]
pub struct SessionEntry {
    pub session_id:  String,
    pub agent_type:  String,
    pub session_key: String,
}

// ── Plan entry ────────────────────────────────────────────────────────────────
#[derive(Debug, Clone)]
pub struct PlanEntry {
    pub plan_id:          String,
    pub title:            String,
    pub status:           String,
    pub category:         String,
    pub steps_done:       i32,
    pub steps_total:      i32,
    pub workspace_id:     String,
    pub next_step_task:   String,
    pub next_step_phase:  String,
    pub next_step_agent:  String,
    pub next_step_status: String,
    pub recommended:      String,
    pub expanded:         bool,
}

// ── Sprint / Goal entries ─────────────────────────────────────────────────────
#[derive(Debug, Clone)]
pub struct SprintEntry {
    pub sprint_id:   String,
    pub name:        String,
    pub status:      String,
    pub start_date:  String,
    pub end_date:    String,
    pub goal_count:  i32,
}

#[derive(Debug, Clone)]
pub struct GoalEntry {
    pub goal_id:     String,
    pub description: String,
    pub completed:   bool,
    pub plan_id:     String,
}

// ── Workspace entry ───────────────────────────────────────────────────────────
#[derive(Debug, Clone)]
pub struct WorkspaceEntry {
    pub id:   String,
    pub name: String,
}

// ── Chat message ──────────────────────────────────────────────────────────────
#[derive(Debug, Clone)]
pub struct ChatMessage {
    pub role:        String,   // "user" | "assistant" | "tool"
    pub content:     String,
    pub is_tool_call: bool,
}

// ── Custom service ────────────────────────────────────────────────────────────
#[derive(Debug, Clone)]
pub struct CustomService {
    pub name:    String,
    pub display: String,
    pub status:  ServiceStatus,
    pub port:    Option<i32>,
}

// ── Active panel / overlay ─────────────────────────────────────────────────────
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub enum Overlay {
    #[default]
    None,
    Settings,
    ConfigEditor,
    About,
    PairingDialog,
}

// ─────────────────────────────────────────────────────────────────────────────
/// Master application state.
// ─────────────────────────────────────────────────────────────────────────────
#[derive(Debug, Clone, Default)]
pub struct AppState {
    // ── Window visibility ─────────────────────────────────────────────────────
    pub window_visible: bool,
    pub quitting:       bool,

    // ── Core service infos ────────────────────────────────────────────────────
    pub mcp:       ServiceInfo,
    pub terminal:  ServiceInfo,
    pub dashboard: ServiceInfo,
    pub fallback:  ServiceInfo,
    pub cli_mcp:   ServiceInfo,

    // ── Misc bridge properties ────────────────────────────────────────────────
    pub status_text:            String,
    pub dashboard_url:          String,
    pub terminal_url:           String,
    pub action_feedback:        String,
    pub focused_workspace_path: String,
    pub gui_auth_key:           String,
    pub custom_services_json:   String,
    pub custom_services:        Vec<CustomService>,

    // ── MCP proxy stats ───────────────────────────────────────────────────────
    pub total_mcp_connections:      i32,
    pub active_mcp_instances:       i32,
    pub mcp_instance_distribution:  String,
    /// Sparkline history for MCP connections (up to 40 samples).
    pub mcp_connection_history:     Vec<i32>,

    // ── Event broadcast ───────────────────────────────────────────────────────
    pub event_broadcast_enabled: bool,
    pub event_subscriber_count:  i32,
    pub events_total_emitted:    i32,

    // ── Tray / notifications ──────────────────────────────────────────────────
    pub tray_notification_text: String,

    // ── Upgrade / About ───────────────────────────────────────────────────────
    pub supervisor_version: String,
    pub upgrade_report_json: String,

    // ── Config editor ─────────────────────────────────────────────────────────
    pub config_editor_text:  String,
    pub config_editor_error: String,

    // ── QR pairing ────────────────────────────────────────────────────────────
    pub pairing_qr_svg: String,
    pub pairing_api_key: String,

    // ── Active overlay ────────────────────────────────────────────────────────
    pub overlay: Overlay,

    // ── PlansPanel state ──────────────────────────────────────────────────────
    pub plans_panel_expanded:  bool,
    pub plans_main_tab:        usize,   // 0 = Plans, 1 = Sprints
    pub plans_tab:             usize,   // 0 = Active, 1 = All
    pub plans_workspaces:      Vec<WorkspaceEntry>,
    pub plans_workspace_index: usize,
    pub plans:                 Vec<PlanEntry>,
    pub plans_provider:        usize,   // 0 = Gemini, 1 = Claude CLI

    // ── SprintsPanel state ────────────────────────────────────────────────────
    pub sprints:               Vec<SprintEntry>,
    pub selected_sprint_id:    String,
    pub sprint_goals:          Vec<GoalEntry>,

    // ── SessionsPanel state ───────────────────────────────────────────────────
    pub sessions:              Vec<SessionEntry>,

    // ── ActivityPanel state ───────────────────────────────────────────────────
    pub activity:              Vec<ActivityEntry>,

    // ── CartographerPanel state ───────────────────────────────────────────────
    pub carto_workspaces:      Vec<WorkspaceEntry>,
    pub carto_workspace_index: usize,
    pub carto_status:          String,
    pub carto_stats_visible:   bool,
    pub carto_files_label:     String,
    pub carto_when_label:      String,

    // ── ChatbotPanel state ────────────────────────────────────────────────────
    pub chat_expanded:         bool,
    pub chat_busy:             bool,
    pub chat_input:            String,
    pub chat_messages:         Vec<ChatMessage>,
    pub chat_workspaces:       Vec<WorkspaceEntry>,
    pub chat_workspace_index:  usize,
    pub chat_provider:         usize,   // 0 = Gemini, 1 = Copilot
    pub chat_model:            String,
    pub chat_key_configured:   bool,
    pub chat_show_settings:    bool,
    pub chat_api_key_input:    String,

    // ── Shutdown confirmation visible ─────────────────────────────────────────
    pub shutdown_dialog_visible: bool,

    // ── Settings panel ────────────────────────────────────────────────────────
    pub settings_loaded:      bool,
    pub settings_active_cat:  usize,  // 0=General 1=Services 2=Reconnect 3=Approval 4=VS Code
}

impl AppState {
    pub fn mcp_base_url(&self) -> String {
        format!("http://127.0.0.1:{}", self.mcp.port)
    }

    pub fn dash_base_url(&self) -> String {
        format!("http://127.0.0.1:{}", self.dashboard.port)
    }
}
