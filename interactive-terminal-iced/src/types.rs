use serde::{Deserialize, Serialize};

// ─── Session / Tab ────────────────────────────────────────────────────────────

/// A single session tab (mirrors sessionTabsJson entries)
#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionTab {
    pub session_id: String,
    pub label: String,
    pub is_active: bool,
    pub is_gemini: bool,
    pub pending_count: usize,
    pub can_close: bool,
    pub is_agent_session: bool,
    pub provider: Option<String>,
}

// ─── Workspace ───────────────────────────────────────────────────────────────

/// Workspace / venv path suggestion (mirrors availableWorkspacesJson entries)
#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
pub struct WorkspaceEntry {
    pub label: String,
    pub path: String,
    pub subtitle: String,
}

// ─── Pending commands ────────────────────────────────────────────────────────

/// A pending command awaiting approval (mirrors pendingCommandsJson entries)
#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingCommand {
    pub request_id: String,
    pub command_text: String,
    pub working_directory: String,
    pub context_info: String,
    pub is_allowlisted: bool,
}

// ─── Saved commands ──────────────────────────────────────────────────────────

/// Saved command record (mirrors savedCommandsJson entries)
#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedCommand {
    pub id: String,
    pub name: String,
    pub command: String,
}

// ─── Allowlist ───────────────────────────────────────────────────────────────

/// Allowlist pattern entry
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AllowlistPattern {
    pub pattern: String,
    pub is_builtin: bool,
}

// ─── Overlay ─────────────────────────────────────────────────────────────────

/// Which overlay/drawer is visible
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub enum ActiveOverlay {
    #[default]
    None,
    ApprovalDialog,
    SavedCommands,
    Allowlist,
    ProviderSettings,
    CrashAlert { message: String, log_path: String },
}

// ─── Connection state ────────────────────────────────────────────────────────

/// TCP connection state
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub enum ConnectionState {
    #[default]
    Disconnected,
    Listening,
    Connected,
}

impl ConnectionState {
    pub fn status_text(&self) -> &'static str {
        match self {
            Self::Disconnected => "Disconnected",
            Self::Listening => "Listening...",
            Self::Connected => "Connected",
        }
    }
}

// ─── CLI provider ────────────────────────────────────────────────────────────

/// Which CLI provider is selected
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub enum CliProvider {
    #[default]
    Gemini,
    Copilot,
    Claude,
}

impl CliProvider {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Gemini => "gemini",
            Self::Copilot => "copilot",
            Self::Claude => "claude",
        }
    }

    pub fn from_str(s: &str) -> Self {
        match s {
            "copilot" => Self::Copilot,
            "claude" => Self::Claude,
            _ => Self::Gemini,
        }
    }

    pub fn label(&self) -> &'static str {
        match self {
            Self::Gemini => "Gemini",
            Self::Copilot => "Copilot",
            Self::Claude => "Claude",
        }
    }
}

// ─── Risk tier ───────────────────────────────────────────────────────────────

/// Risk tier for approval dialog (tier 1 = low, 2 = medium, 3 = high)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum RiskTier {
    #[default]
    Low,    // tier 1 — green
    Medium, // tier 2 — yellow
    High,   // tier 3 — red
}

impl RiskTier {
    pub fn from_u32(n: u32) -> Self {
        match n {
            3 => Self::High,
            2 => Self::Medium,
            _ => Self::Low,
        }
    }

    pub fn as_u32(&self) -> u32 {
        match self {
            Self::Low => 1,
            Self::Medium => 2,
            Self::High => 3,
        }
    }

    pub fn label(&self) -> &'static str {
        match self {
            Self::Low => "Low Risk",
            Self::Medium => "Medium Risk",
            Self::High => "High Risk",
        }
    }
}

// ─── Approval session / autonomy / output ────────────────────────────────────

/// Session mode chosen at approval time
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub enum ApprovalSessionMode {
    #[default]
    New,
    Resume,
}

impl ApprovalSessionMode {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::New => "new",
            Self::Resume => "resume",
        }
    }
}

/// Output format for agent sessions
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub enum OutputFormat {
    #[default]
    Text,
    Json,
    StreamJson,
}

impl OutputFormat {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Text => "text",
            Self::Json => "json",
            Self::StreamJson => "stream-json",
        }
    }

    pub fn from_str(s: &str) -> Self {
        match s {
            "json" => Self::Json,
            "stream-json" => Self::StreamJson,
            _ => Self::Text,
        }
    }
}

/// Autonomy mode for approval
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub enum AutonomyMode {
    #[default]
    Guided,
    Autonomous,
}

impl AutonomyMode {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Guided => "guided",
            Self::Autonomous => "autonomous",
        }
    }

    pub fn from_str(s: &str) -> Self {
        match s {
            "autonomous" => Self::Autonomous,
            _ => Self::Guided,
        }
    }
}

// ─── Approval dialog composite state ─────────────────────────────────────────

/// All transient state for the approval dialog
#[derive(Debug, Clone, Default)]
pub struct ApprovalDialogState {
    pub provider: CliProvider,
    pub autonomy_mode: AutonomyMode,
    pub session_mode: ApprovalSessionMode,
    pub resume_session_id: String,
    pub output_format: OutputFormat,
    pub risk_tier: RiskTier,
    pub trusted_scope_confirmed: bool,
    pub trusted_scope_text: String,
    pub budget_max_commands: u32,
    pub budget_max_duration_secs: u32,
    pub budget_max_files: u32,
    pub gemini_screen_reader: bool,
    pub copilot_minimal_ui: bool,
    pub decline_reason: String,
    pub showing_decline_prompt: bool,
}

// ─── Tray actions ─────────────────────────────────────────────────────────────

/// Actions forwarded from the system tray icon
#[derive(Debug, Clone)]
pub enum TrayAction {
    Show,
    ToggleStartWithWindows,
    Quit,
}
