use serde::{Deserialize, Serialize};

pub const SAVED_COMMANDS_SCHEMA_VERSION: u32 = 1;

const EPOCH_TIMESTAMP: &str = "1970-01-01T00:00:00Z";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SavedCommand {
    pub id: String,
    pub name: String,
    pub command: String,
    #[serde(default = "default_timestamp")]
    pub created_at: String,
    #[serde(default = "default_timestamp")]
    pub updated_at: String,
    #[serde(default)]
    pub last_used_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct WorkspaceSavedCommands {
    pub workspace_id: String,
    #[serde(default = "default_schema_version")]
    pub schema_version: u32,
    #[serde(default)]
    pub commands: Vec<SavedCommand>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
struct LegacySavedCommand {
    #[serde(default)]
    id: String,
    #[serde(default)]
    name: String,
    command: String,
    #[serde(default)]
    created_at: String,
    #[serde(default)]
    updated_at: String,
    #[serde(default)]
    last_used_at: Option<String>,
}

fn default_schema_version() -> u32 {
    SAVED_COMMANDS_SCHEMA_VERSION
}

fn default_timestamp() -> String {
    EPOCH_TIMESTAMP.to_string()
}

pub fn normalize_workspace_id(input: &str) -> Option<String> {
    let trimmed = input.trim();
    if trimmed.is_empty() || trimmed.len() > 128 {
        return None;
    }

    if trimmed.contains("..") || trimmed.contains('/') || trimmed.contains('\\') {
        return None;
    }

    if !trimmed
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.'))
    {
        return None;
    }

    Some(trimmed.to_string())
}

impl SavedCommand {
    fn normalize(mut self, fallback_index: usize) -> Self {
        if self.id.trim().is_empty() {
            self.id = format!("cmd-{fallback_index}");
        }

        if self.name.trim().is_empty() {
            self.name = self.command.trim().to_string();
        }

        if self.created_at.trim().is_empty() {
            self.created_at = default_timestamp();
        }

        if self.updated_at.trim().is_empty() {
            self.updated_at = self.created_at.clone();
        }

        self
    }
}

impl WorkspaceSavedCommands {
    pub fn empty_for_workspace(workspace_id: &str) -> Option<Self> {
        let normalized_workspace_id = normalize_workspace_id(workspace_id)?;
        Some(Self {
            workspace_id: normalized_workspace_id,
            schema_version: SAVED_COMMANDS_SCHEMA_VERSION,
            commands: Vec::new(),
        })
    }

    pub fn normalize(mut self, fallback_workspace_id: &str) -> Option<Self> {
        let normalized_workspace_id = normalize_workspace_id(&self.workspace_id)
            .or_else(|| normalize_workspace_id(fallback_workspace_id))?;

        self.workspace_id = normalized_workspace_id;
        self.schema_version = SAVED_COMMANDS_SCHEMA_VERSION;
        self.commands = self
            .commands
            .into_iter()
            .enumerate()
            .map(|(index, cmd)| cmd.normalize(index + 1))
            .collect();

        Some(self)
    }

    pub fn from_json_str(raw: &str, workspace_id: &str) -> Option<Self> {
        let value: serde_json::Value = serde_json::from_str(raw).ok()?;
        Self::from_json_value(value, workspace_id)
    }

    pub fn from_json_value(value: serde_json::Value, workspace_id: &str) -> Option<Self> {
        if let Ok(parsed) = serde_json::from_value::<WorkspaceSavedCommands>(value.clone()) {
            return parsed.normalize(workspace_id);
        }

        #[derive(Deserialize)]
        struct LegacyRoot {
            #[serde(default)]
            workspace_id: String,
            #[serde(default)]
            commands: Vec<LegacySavedCommand>,
        }

        if let Ok(legacy_root) = serde_json::from_value::<LegacyRoot>(value.clone()) {
            let normalized_workspace_id = normalize_workspace_id(&legacy_root.workspace_id)
                .or_else(|| normalize_workspace_id(workspace_id))?;
            let commands = legacy_root
                .commands
                .into_iter()
                .enumerate()
                .map(|(index, cmd)| SavedCommand {
                    id: cmd.id,
                    name: cmd.name,
                    command: cmd.command,
                    created_at: cmd.created_at,
                    updated_at: cmd.updated_at,
                    last_used_at: cmd.last_used_at,
                }
                .normalize(index + 1))
                .collect();

            return Some(Self {
                workspace_id: normalized_workspace_id,
                schema_version: SAVED_COMMANDS_SCHEMA_VERSION,
                commands,
            });
        }

        if let Ok(legacy_commands) = serde_json::from_value::<Vec<LegacySavedCommand>>(value) {
            let normalized_workspace_id = normalize_workspace_id(workspace_id)?;
            let commands = legacy_commands
                .into_iter()
                .enumerate()
                .map(|(index, cmd)| SavedCommand {
                    id: cmd.id,
                    name: cmd.name,
                    command: cmd.command,
                    created_at: cmd.created_at,
                    updated_at: cmd.updated_at,
                    last_used_at: cmd.last_used_at,
                }
                .normalize(index + 1))
                .collect();

            return Some(Self {
                workspace_id: normalized_workspace_id,
                schema_version: SAVED_COMMANDS_SCHEMA_VERSION,
                commands,
            });
        }

        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn workspace_id_rejects_path_traversal() {
        assert!(normalize_workspace_id("../ws").is_none());
        assert!(normalize_workspace_id("ws/child").is_none());
        assert!(normalize_workspace_id("ws\\child").is_none());
    }

    #[test]
    fn legacy_payload_is_migrated_to_current_schema() {
        let raw = r#"{
            "workspace_id": "project-memory-mcp-40f6678f5a9b",
            "commands": [{"command": "npm run build", "name": ""}]
        }"#;

        let parsed = WorkspaceSavedCommands::from_json_str(raw, "project-memory-mcp-40f6678f5a9b")
            .expect("legacy payload should parse");

        assert_eq!(parsed.schema_version, SAVED_COMMANDS_SCHEMA_VERSION);
        assert_eq!(parsed.commands.len(), 1);
        assert_eq!(parsed.commands[0].name, "npm run build");
        assert_eq!(parsed.commands[0].id, "cmd-1");
    }
}