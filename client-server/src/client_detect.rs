//! Detect which client (Claude CLI vs VS Code) is using this proxy session.

use serde_json::Value;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ClientType {
    ClaudeCli,
    VsCode,
    Unknown(String),
}

impl ClientType {
    pub fn as_str(&self) -> &str {
        match self {
            ClientType::ClaudeCli     => "claude-cli",
            ClientType::VsCode        => "vscode",
            ClientType::Unknown(s)    => s.as_str(),
        }
    }
}

/// Derived from the MCP `initialize` clientInfo and environment variables.
#[derive(Debug, Clone)]
pub struct ClientProfile {
    pub client_type: ClientType,
    pub client_name: String,
    pub client_version: String,
}

impl Default for ClientProfile {
    fn default() -> Self {
        Self {
            client_type: detect_from_env(),
            client_name: "unknown".into(),
            client_version: "0.0.0".into(),
        }
    }
}

/// Parse a client profile from the `clientInfo` field of an MCP `initialize` request.
pub fn from_initialize_params(params: &Value) -> ClientProfile {
    let info = &params["clientInfo"];
    let name = info["name"].as_str().unwrap_or("").to_string();
    let version = info["version"].as_str().unwrap_or("0.0.0").to_string();

    let client_type = classify_name(&name);

    ClientProfile { client_type, client_name: name, client_version: version }
}

fn classify_name(name: &str) -> ClientType {
    let lower = name.to_ascii_lowercase();
    if lower.starts_with("claude-code") || lower.starts_with("claude_code") {
        ClientType::ClaudeCli
    } else if lower.starts_with("vscode")
        || lower.starts_with("vs-code")
        || lower.contains("continue")
        || lower.contains("cline")
        || lower.contains("copilot")
    {
        ClientType::VsCode
    } else if !lower.is_empty() {
        // Fall back to env detection if we don't recognise the name.
        let from_env = detect_from_env();
        if from_env != ClientType::Unknown(String::new()) {
            from_env
        } else {
            ClientType::Unknown(name.to_string())
        }
    } else {
        detect_from_env()
    }
}

fn detect_from_env() -> ClientType {
    // VS Code sets VSCODE_PID or VSCODE_IPC_HOOK in its terminal environment.
    if std::env::var_os("VSCODE_PID").is_some()
        || std::env::var_os("VSCODE_IPC_HOOK").is_some()
        || std::env::var("TERM_PROGRAM").ok().as_deref() == Some("vscode")
    {
        return ClientType::VsCode;
    }
    // Claude Code sets CLAUDE_CODE_ENTRYPOINT or similar markers.
    if std::env::var_os("CLAUDE_CODE_ENTRYPOINT").is_some()
        || std::env::var_os("CLAUDE_CODE_VERSION").is_some()
    {
        return ClientType::ClaudeCli;
    }
    ClientType::Unknown(String::new())
}
