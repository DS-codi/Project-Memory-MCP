/// Central application state — replaces all CxxQt qproperty bindings on
/// SupervisorGuiBridge.  Every panel reads from this struct; mutations are
/// driven by `Message` variants in `main.rs`.

use iced::window;

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
    pub plan_id:              String,
    pub title:                String,
    pub status:               String,
    pub category:             String,
    pub steps_done:           i32,
    pub steps_total:          i32,
    pub workspace_id:         String,
    pub next_step_task:       String,
    pub next_step_phase:      String,
    pub next_step_agent:      String,
    pub next_step_status:     String,
    pub recommended:          String,
    pub expanded:             bool,
    /// Animated reveal height for the expanded details area (0.0 = hidden).
    pub expanded_height:      f32,
    /// Target height the animation is moving toward.
    pub expanded_height_target: f32,
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

// ── Proxy session entry (from /admin/connections) ─────────────────────────────
#[derive(Debug, Clone, serde::Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ProxySessionEntry {
    pub session_id:    String,
    pub client_type:   String,
    pub workspace_id:  Option<String>,
    pub call_count:    u64,
    pub connected_at:  String,
    pub last_activity: Option<String>,
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
#[derive(Debug, Clone)]
pub struct AppState {
    // ── Window visibility ─────────────────────────────────────────────────────
    pub window_visible: bool,
    pub quitting:       bool,

    // ── Core service infos ────────────────────────────────────────────────────
    pub mcp:       ServiceInfo,
    pub terminal:  ServiceInfo,
    pub dashboard: ServiceInfo,
    pub fallback:  ServiceInfo,
    // cli_mcp removed — CLI agents connect via client-proxy.exe per-session.
    pub proxy_sessions:      Vec<ProxySessionEntry>,
    pub proxy_session_count: i32,

    // ── Misc bridge properties ────────────────────────────────────────────────
    pub dashboard_url:          String,
    pub terminal_url:           String,
    pub action_feedback:        String,
    pub focused_workspace_path: String,
    pub gui_auth_key:           String,
    pub custom_services_json:   String,

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

    // ── Upgrade / About ───────────────────────────────────────────────────────
    pub supervisor_version: String,

    // ── Config editor ─────────────────────────────────────────────────────────
    pub config_editor_text:  String,
    pub config_editor_error: String,

    // ── QR pairing ────────────────────────────────────────────────────────────
    pub pairing_qr_svg: String,
    pub pairing_api_key: String,
    pub pairing_allowed_apps: Vec<String>,
    pub pairing_selected_monitor: i32,
    pub available_monitors: Vec<String>,
    pub pairing_pin: String,
    pub pairing_password: String,

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
    pub chat_key_configured:   bool,
    pub chat_show_settings:    bool,
    pub chat_api_key_input:    String,

    // ── Chatbot strip / collapsed state ──────────────────────────────────────
    /// True = chatbot shown as narrow collapsed strip instead of full panel.
    pub chatbot_collapsed:           bool,
    /// Show the api-key dot indicator on the collapsed strip.
    pub chatbot_api_key_dot_visible: bool,
    /// Animation pulse value (0.0–1.0) for the dot on the collapsed strip.
    pub chatbot_strip_pulse:         f32,

    // ── Tray last-action feedback ─────────────────────────────────────────────
    /// Label of the last tray menu item activated (for feedback display).
    pub tray_last_action:            Option<String>,

    // ── Panel animation ───────────────────────────────────────────────────────
    /// Current animated width of the Plans sidebar (px).
    pub plans_panel_width:        f32,
    /// Target width the plans sidebar is animating toward.
    pub plans_panel_width_target: f32,
    /// Current animated width of the Chat sidebar (px).
    pub chat_panel_width:         f32,
    /// Target width the chat sidebar is animating toward.
    pub chat_panel_width_target:  f32,
    /// True while any animation is still moving — drives the 16ms tick subscription.
    pub animation_running:        bool,

    // ── Window IDs (daemon mode — no MAIN constant) ───────────────────────────
    /// ID of the primary supervisor window, set immediately in init().
    pub main_window_id:           Option<window::Id>,

    // ── Chat pop-out window ───────────────────────────────────────────────────
    /// True when the chat panel has been opened in a separate OS window.
    pub chat_popped_out:          bool,
    /// Window ID of the chat pop-out, if open.
    pub chat_popout_window_id:    Option<window::Id>,

    // ── Notification dedup ────────────────────────────────────────────────────
    /// Key of the most-recently seen (and notified-on) activity entry.
    pub last_activity_key:        String,

    // ── Shutdown confirmation visible ─────────────────────────────────────────
    pub shutdown_dialog_visible: bool,

    // ── Settings panel ────────────────────────────────────────────────────────
    pub settings_active_cat:  usize,  // 0=General 1=Services 2=Reconnect 3=Approval 4=VS Code

    // --- Settings Panel ---

    // General
    pub settings_log_level:         String,
    pub settings_bind_address:      String,
    /// Whether the AI chatbot sidebar panel is visible.
    pub settings_show_chatbot:      bool,

    // Services — MCP
    pub settings_mcp_enabled:       bool,
    pub settings_mcp_port:          u16,
    pub settings_health_timeout:    u32,
    pub settings_mcp_max_instances: u32,
    pub settings_mcp_max_conns:     u32,

    // Services — Interactive Terminal
    pub settings_terminal_enabled:  bool,
    pub settings_terminal_port:     u16,

    // Services — Dashboard
    pub settings_dashboard_enabled:      bool,
    pub settings_dashboard_port:         u16,
    pub settings_dashboard_requires_mcp: bool,
    pub settings_dashboard_variant:      String,

    // Services — Events
    pub settings_events_enabled: bool,
    pub settings_events_port:    u16,

    // Health / pool (from task spec)
    pub settings_instance_pool:      u32,
    pub settings_reconnect_interval: u32,

    // Reconnect back-off
    pub settings_reconnect_initial_delay: u32,
    pub settings_reconnect_max_delay:     u32,
    /// Stored as String so it can be displayed/edited in a text_input.
    pub settings_reconnect_multiplier:    String,
    pub settings_reconnect_max_attempts:  u32,
    /// Stored as String so it can be displayed/edited in a text_input.
    pub settings_reconnect_jitter_ratio:  String,

    // Approval
    pub settings_approval_countdown: u32,
    /// "approve" or "deny"
    pub settings_timeout_action:     String,
    pub settings_always_on_top:      bool,

    // VS Code
    pub settings_vscode_mcp_port:              u16,
    pub settings_vscode_api_port:              u16,
    pub settings_vscode_terminal_port:         u16,
    pub settings_vscode_data_path:             String,
    pub settings_vscode_notifications_enabled: bool,
    pub settings_vscode_auto_deploy:           bool,
    pub settings_vscode_agents_root:           String,
    pub settings_vscode_skills_root:           String,
    pub settings_vscode_instructions_root:     String,
    pub settings_vscode_agent_handoffs:        bool,
    pub settings_vscode_plan_complete:         bool,
    pub settings_vscode_step_blocked:          bool,
    /// "auto" / "local" / "container"
    pub settings_vscode_container_mode:        String,
    /// "off" / "prompt" / "auto"
    pub settings_vscode_startup_mode:          String,
    pub settings_vscode_launcher_path:         String,
    pub settings_vscode_detect_timeout:        u32,
    pub settings_vscode_startup_timeout:       u32,

    // Settings panel UI state
    pub settings_loading:    bool,
    pub settings_save_error: Option<String>,
    /// True when any field has been edited since the last successful save.
    pub settings_dirty:      bool,

    // ── Sessions Live Panel ───────────────────────────────────────────────────
    pub sessions_live_active_plans: Vec<serde_json::Value>,
    pub sessions_live_commands:     Vec<serde_json::Value>,
    pub sessions_live_dirs:         Vec<String>,
    pub sessions_live_loading:      bool,
    pub sessions_live_error:        Option<String>,
    /// 0 = Components, 1 = My Sessions
    pub sessions_tab:               usize,
    /// Sub-tab on the Components tab: 0 = Proxy Sessions, 1 = Active Sessions, 2 = Recent Activity
    pub components_sessions_tab:    usize,

    // ── My Sessions Bookmark Panels ───────────────────────────────────────────
    pub bookmarks_pinned_plans:     Vec<String>,
    pub bookmarks_saved_commands:   Vec<String>,
    pub bookmarks_dirs:             Vec<String>,
    /// 0 = no add in progress, 1 = adding to pinned plans, 2 = saved commands, 3 = dirs
    pub bookmarks_add_panel:        u8,
    pub bookmarks_add_input:        String,

    // ── About Panel — Upgrade Report Card ────────────────────────────────────
    /// "up-to-date" | "update-available" | "checking" | None
    pub about_upgrade_status:  Option<String>,
    pub about_upgrade_version: Option<String>,
    pub about_upgrade_notes:   Option<String>,
    pub about_upgrade_loading: bool,
    pub about_upgrade_error:   Option<String>,
    /// ISO timestamp of last upgrade check
    pub about_last_checked:    Option<String>,

    // ── Sprints Panel — Create Sprint + Add Goal ──────────────────────────────
    pub sprints_new_title:      String,
    pub sprints_new_goal:       String,
    pub sprints_creating:       bool,
    pub sprints_create_error:   Option<String>,
    pub sprints_adding_goal:    bool,
    pub sprints_add_goal_error: Option<String>,
    pub sprints_selected_id:    Option<String>,

    // ── Plans Toolbar — Register WS + Backup ─────────────────────────────────
    pub plans_register_ws_path:   String,
    pub plans_register_ws_name:   String,
    pub plans_register_ws_open:   bool,
    pub plans_registering_ws:     bool,
    pub plans_register_ws_error:  Option<String>,
    pub plans_backup_running:     bool,
    pub plans_backup_error:       Option<String>,
    pub plans_backup_last_result: Option<String>,
    pub plans_provider_input:     String,
    pub plans_provider_active:    Option<String>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            // ── Window visibility ─────────────────────────────────────────────
            window_visible: false,
            quitting:       false,

            // ── Core service infos ────────────────────────────────────────────
            mcp:       ServiceInfo::default(),
            terminal:  ServiceInfo::default(),
            dashboard: ServiceInfo::default(),
            fallback:  ServiceInfo::default(),
            proxy_sessions:      Vec::new(),
            proxy_session_count: 0,

            // ── Misc bridge properties ────────────────────────────────────────
            dashboard_url:          String::new(),
            terminal_url:           String::new(),
            action_feedback:        String::new(),
            focused_workspace_path: String::new(),
            gui_auth_key:           String::new(),
            custom_services_json:   String::new(),

            // ── MCP proxy stats ───────────────────────────────────────────────
            total_mcp_connections:     0,
            active_mcp_instances:      0,
            mcp_instance_distribution: String::new(),
            mcp_connection_history:    Vec::new(),

            // ── Event broadcast ───────────────────────────────────────────────
            event_broadcast_enabled: false,
            event_subscriber_count:  0,
            events_total_emitted:    0,

            // ── Upgrade / About ───────────────────────────────────────────────
            supervisor_version: String::new(),

            // ── Config editor ─────────────────────────────────────────────────
            config_editor_text:  String::new(),
            config_editor_error: String::new(),

            // ── QR pairing ────────────────────────────────────────────────────
            pairing_qr_svg:  String::new(),
            pairing_api_key: String::new(),
            pairing_allowed_apps: vec![
                "terminal".to_owned(),
                "files".to_owned(),
                "dashboard".to_owned(),
                "supervisor".to_owned(),
            ],
            pairing_selected_monitor: 0,
            available_monitors: Vec::new(),
            pairing_pin: String::new(),
            pairing_password: String::new(),

            // ── Active overlay ────────────────────────────────────────────────
            overlay: Overlay::None,

            // ── PlansPanel state ──────────────────────────────────────────────
            plans_panel_expanded:  false,
            plans_main_tab:        0,
            plans_tab:             0,
            plans_workspaces:      Vec::new(),
            plans_workspace_index: 0,
            plans:                 Vec::new(),
            plans_provider:        0,

            // ── SprintsPanel state ────────────────────────────────────────────
            sprints:            Vec::new(),
            selected_sprint_id: String::new(),
            sprint_goals:       Vec::new(),

            // ── SessionsPanel state ───────────────────────────────────────────
            sessions: Vec::new(),

            // ── ActivityPanel state ───────────────────────────────────────────
            activity: Vec::new(),

            // ── CartographerPanel state ───────────────────────────────────────
            carto_workspaces:      Vec::new(),
            carto_workspace_index: 0,
            carto_status:          String::new(),
            carto_stats_visible:   false,
            carto_files_label:     String::new(),
            carto_when_label:      String::new(),

            // ── ChatbotPanel state ────────────────────────────────────────────
            chat_expanded:        false,
            chat_busy:            false,
            chat_input:           String::new(),
            chat_messages:        Vec::new(),
            chat_workspaces:      Vec::new(),
            chat_workspace_index: 0,
            chat_provider:        0,
            chat_key_configured:  false,
            chat_show_settings:   false,
            chat_api_key_input:   String::new(),

            // ── Chatbot strip / collapsed state ───────────────────────────────
            chatbot_collapsed:           false,
            chatbot_api_key_dot_visible: false,
            chatbot_strip_pulse:         0.0,

            // ── Tray last-action feedback ──────────────────────────────────────
            tray_last_action: None,

            // ── Panel animation ───────────────────────────────────────────────
            plans_panel_width:        0.0,
            plans_panel_width_target: 0.0,
            chat_panel_width:         0.0,
            chat_panel_width_target:  0.0,
            animation_running:        false,

            // ── Window IDs ────────────────────────────────────────────────────
            main_window_id:        None,
            chat_popped_out:       false,
            chat_popout_window_id: None,

            // ── Notification dedup ────────────────────────────────────────────
            last_activity_key: String::new(),

            // ── Shutdown confirmation ─────────────────────────────────────────
            shutdown_dialog_visible: false,

            // ── Settings panel navigation ─────────────────────────────────────
            settings_active_cat: 0,

            // --- Settings Panel — sensible defaults --------------------------

            // General
            settings_log_level:     "info".to_owned(),
            settings_bind_address:  "127.0.0.1".to_owned(),
            settings_show_chatbot:  true,

            // Services — MCP
            settings_mcp_enabled:       true,
            settings_mcp_port:          3457,
            settings_health_timeout:    5000,
            settings_mcp_max_instances: 5,
            settings_mcp_max_conns:     3,

            // Services — Terminal
            settings_terminal_enabled: true,
            settings_terminal_port:    3458,

            // Services — Dashboard
            settings_dashboard_enabled:      true,
            settings_dashboard_port:         3459,
            settings_dashboard_requires_mcp: false,
            settings_dashboard_variant:      "classic".to_string(),

            // Services — Events
            settings_events_enabled: true,
            settings_events_port:    3460,

            // Health / pool
            settings_instance_pool:      1,
            settings_reconnect_interval: 5000,

            // Reconnect
            settings_reconnect_initial_delay: 1000,
            settings_reconnect_max_delay:     30000,
            settings_reconnect_multiplier:    "2.0".to_owned(),
            settings_reconnect_max_attempts:  0,
            settings_reconnect_jitter_ratio:  "0.2".to_owned(),

            // Approval
            settings_approval_countdown: 60,
            settings_timeout_action:     "approve".to_owned(),
            settings_always_on_top:      false,

            // VS Code
            settings_vscode_mcp_port:              3466,
            settings_vscode_api_port:              3465,
            settings_vscode_terminal_port:         3468,
            settings_vscode_data_path:             String::new(),
            settings_vscode_notifications_enabled: true,
            settings_vscode_auto_deploy:           true,
            settings_vscode_agents_root:           String::new(),
            settings_vscode_skills_root:           String::new(),
            settings_vscode_instructions_root:     String::new(),
            settings_vscode_agent_handoffs:        true,
            settings_vscode_plan_complete:         true,
            settings_vscode_step_blocked:          true,
            settings_vscode_container_mode:        "auto".to_owned(),
            settings_vscode_startup_mode:          "prompt".to_owned(),
            settings_vscode_launcher_path:         String::new(),
            settings_vscode_detect_timeout:        5000,
            settings_vscode_startup_timeout:       30000,

            // UI state
            settings_loading:    false,
            settings_save_error: None,
            settings_dirty:      false,

            // ── Sessions Live Panel ───────────────────────────────────────────
            sessions_live_active_plans: Vec::new(),
            sessions_live_commands:     Vec::new(),
            sessions_live_dirs:         Vec::new(),
            sessions_live_loading:      false,
            sessions_live_error:        None,
            sessions_tab:               0,
            components_sessions_tab:    0,

            // ── My Sessions Bookmark Panels ─────────────────────────────────────
            bookmarks_pinned_plans:     Vec::new(),
            bookmarks_saved_commands:   Vec::new(),
            bookmarks_dirs:             Vec::new(),
            bookmarks_add_panel:        0,
            bookmarks_add_input:        String::new(),

            // ── About Panel — Upgrade Report Card ─────────────────────────────
            about_upgrade_status:  None,
            about_upgrade_version: None,
            about_upgrade_notes:   None,
            about_upgrade_loading: false,
            about_upgrade_error:   None,
            about_last_checked:    None,

            // ── Sprints Panel — Create Sprint + Add Goal ──────────────────────
            sprints_new_title:      String::new(),
            sprints_new_goal:       String::new(),
            sprints_creating:       false,
            sprints_create_error:   None,
            sprints_adding_goal:    false,
            sprints_add_goal_error: None,
            sprints_selected_id:    None,

            // ── Plans Toolbar — Register WS + Backup ──────────────────────────
            plans_register_ws_path:   String::new(),
            plans_register_ws_name:   String::new(),
            plans_register_ws_open:   false,
            plans_registering_ws:     false,
            plans_register_ws_error:  None,
            plans_backup_running:     false,
            plans_backup_error:       None,
            plans_backup_last_result: None,
            plans_provider_input:     String::new(),
            plans_provider_active:    None,
        }
    }
}

impl AppState {
    pub fn mcp_base_url(&self) -> String {
        format!("http://127.0.0.1:{}", self.mcp.port)
    }

    pub fn dash_base_url(&self) -> String {
        format!("http://127.0.0.1:{}", self.dashboard.port)
    }
}
