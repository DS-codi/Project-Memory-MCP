use crate::saved_commands::{normalize_workspace_id, WorkspaceSavedCommands};
use std::collections::HashMap;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

const SAVED_COMMANDS_FILE_NAME: &str = "saved-commands.v1.json";
const LEGACY_SAVED_COMMANDS_FILE_NAME: &str = "saved-commands.json";
const INTERACTIVE_TERMINAL_DIR_NAME: &str = "interactive-terminal";
static TEMP_FILE_COUNTER: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, Clone)]
pub struct SavedCommandsRepository {
    data_root: PathBuf,
}

impl SavedCommandsRepository {
    pub fn from_env_or_default() -> Self {
        if let Ok(env_data_root) = std::env::var("MBS_DATA_ROOT") {
            let root = PathBuf::from(env_data_root.trim());
            if !root.as_os_str().is_empty() {
                return Self { data_root: root };
            }
        }

        let current_dir = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));

        if let Some(discovered_data_root) = Self::discover_data_root(&current_dir) {
            return Self {
                data_root: discovered_data_root,
            };
        }

        let local_data = current_dir.join("data");
        if local_data.exists() {
            return Self {
                data_root: local_data,
            };
        }

        let parent_data = current_dir
            .parent()
            .map(|p| p.join("data"))
            .unwrap_or_else(|| current_dir.join("data"));
        Self {
            data_root: parent_data,
        }
    }

    pub fn new(data_root: PathBuf) -> Self {
        Self { data_root }
    }

    pub fn data_root(&self) -> &Path {
        &self.data_root
    }

    pub fn load_workspace(&self, workspace_id: &str) -> WorkspaceSavedCommands {
        let Some(normalized_workspace_id) = normalize_workspace_id(workspace_id) else {
            return WorkspaceSavedCommands::empty_for_workspace("default")
                .expect("default workspace id is always valid");
        };

        let path = self
            .existing_workspace_commands_path(&normalized_workspace_id)
            .or_else(|| self.workspace_legacy_commands_path(&normalized_workspace_id));

        let Some(path) = path else {
            return WorkspaceSavedCommands::empty_for_workspace(&normalized_workspace_id)
                .expect("workspace id was normalized");
        };

        let Ok(raw) = fs::read_to_string(&path) else {
            return WorkspaceSavedCommands::empty_for_workspace(&normalized_workspace_id)
                .expect("workspace id was normalized");
        };

        let parsed = WorkspaceSavedCommands::from_json_str(&raw, &normalized_workspace_id)
            .unwrap_or_else(|| {
                WorkspaceSavedCommands::empty_for_workspace(&normalized_workspace_id)
                    .expect("workspace id was normalized")
            });

        if path
            .file_name()
            .is_some_and(|name| name == LEGACY_SAVED_COMMANDS_FILE_NAME)
        {
            let _ = self.save_workspace(&parsed);
        }

        parsed
    }

    pub fn load_all_workspaces(&self) -> HashMap<String, WorkspaceSavedCommands> {
        let mut loaded = HashMap::new();
        let Ok(entries) = fs::read_dir(&self.data_root) else {
            return loaded;
        };

        for entry in entries.flatten() {
            let Ok(metadata) = entry.metadata() else {
                continue;
            };

            if !metadata.is_dir() {
                continue;
            }

            let workspace_id = entry.file_name().to_string_lossy().to_string();
            if normalize_workspace_id(&workspace_id).is_none() {
                continue;
            }

            if self
                .existing_workspace_commands_path(&workspace_id)
                .is_none()
                && self.workspace_legacy_commands_path(&workspace_id).is_none()
            {
                continue;
            }

            let model = self.load_workspace(&workspace_id);
            loaded.insert(workspace_id, model);
        }

        loaded
    }

    pub fn save_workspace(&self, model: &WorkspaceSavedCommands) -> io::Result<()> {
        let normalized = model
            .clone()
            .normalize(&model.workspace_id)
            .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "invalid workspace_id"))?;

        let path = self.workspace_commands_path(&normalized.workspace_id);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }

        let payload = serde_json::to_string_pretty(&normalized)
            .map_err(|err| io::Error::new(io::ErrorKind::InvalidData, err.to_string()))?;

        let temp_path = Self::temp_path_for(&path);
        if let Some(parent) = temp_path.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(&temp_path, payload)?;

        if path.exists() {
            let _ = fs::remove_file(&path);
        }
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::rename(temp_path, path)
    }

    pub fn workspace_commands_path(&self, workspace_id: &str) -> PathBuf {
        let normalized_workspace_id =
            normalize_workspace_id(workspace_id).unwrap_or_else(|| "default".to_string());

        Self::workspace_commands_path_for(
            &self.data_root,
            &normalized_workspace_id,
            SAVED_COMMANDS_FILE_NAME,
        )
    }

    fn existing_workspace_commands_path(&self, workspace_id: &str) -> Option<PathBuf> {
        let path = self.workspace_commands_path(workspace_id);
        if path.exists() {
            Some(path)
        } else {
            None
        }
    }

    fn workspace_legacy_commands_path(&self, workspace_id: &str) -> Option<PathBuf> {
        let normalized_workspace_id = normalize_workspace_id(workspace_id)?;
        let legacy_path = Self::workspace_commands_path_for(
            &self.data_root,
            &normalized_workspace_id,
            LEGACY_SAVED_COMMANDS_FILE_NAME,
        );

        if legacy_path.exists() {
            Some(legacy_path)
        } else {
            None
        }
    }

    fn workspace_commands_path_for(
        data_root: &Path,
        workspace_id: &str,
        file_name: &str,
    ) -> PathBuf {
        data_root
            .join(workspace_id)
            .join(INTERACTIVE_TERMINAL_DIR_NAME)
            .join(file_name)
    }

    fn discover_data_root(start: &Path) -> Option<PathBuf> {
        for candidate in start.ancestors() {
            let data_dir = candidate.join("data");
            if data_dir.join("workspace-registry.json").exists() {
                return Some(data_dir);
            }
        }

        None
    }

    fn temp_path_for(path: &Path) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        let pid = std::process::id();
        let counter = TEMP_FILE_COUNTER.fetch_add(1, Ordering::Relaxed);

        let mut temp_name = path
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
            .unwrap_or_else(|| "saved-commands.v1.json".to_string());
        temp_name.push_str(&format!(".{pid}.{nanos}.{counter}.tmp"));

        path.with_file_name(temp_name)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::saved_commands::SavedCommand;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn unique_temp_dir() -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("interactive-terminal-test-{nanos}"))
    }

    #[test]
    fn load_missing_workspace_returns_safe_default() {
        let repo = SavedCommandsRepository::new(unique_temp_dir());
        let model = repo.load_workspace("project-memory-mcp-40f6678f5a9b");

        assert_eq!(model.workspace_id, "project-memory-mcp-40f6678f5a9b");
        assert!(model.commands.is_empty());
    }

    #[test]
    fn save_and_reload_roundtrip() {
        let root = unique_temp_dir();
        let repo = SavedCommandsRepository::new(root.clone());

        let mut model =
            WorkspaceSavedCommands::empty_for_workspace("project-memory-mcp-40f6678f5a9b").unwrap();
        model.commands.push(SavedCommand {
            id: "build".into(),
            name: "Build".into(),
            command: "npm run build".into(),
            created_at: "2026-02-15T00:00:00Z".into(),
            updated_at: "2026-02-15T00:00:00Z".into(),
            last_used_at: None,
        });

        repo.save_workspace(&model).expect("save should work");
        let loaded = repo.load_workspace("project-memory-mcp-40f6678f5a9b");

        assert_eq!(loaded.commands.len(), 1);
        assert_eq!(loaded.commands[0].command, "npm run build");

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn startup_preload_reads_workspace_dirs() {
        let root = unique_temp_dir();
        let repo = SavedCommandsRepository::new(root.clone());

        fs::create_dir_all(
            root.join("project-memory-mcp-40f6678f5a9b")
                .join(INTERACTIVE_TERMINAL_DIR_NAME),
        )
        .unwrap();

        let legacy_payload = r#"{
          "workspace_id": "project-memory-mcp-40f6678f5a9b",
          "commands": [{"command": "npx vitest run"}]
        }"#;
        fs::write(
            root.join("project-memory-mcp-40f6678f5a9b")
                .join(INTERACTIVE_TERMINAL_DIR_NAME)
                .join(SAVED_COMMANDS_FILE_NAME),
            legacy_payload,
        )
        .unwrap();

        let all = repo.load_all_workspaces();
        assert!(all.contains_key("project-memory-mcp-40f6678f5a9b"));
        assert_eq!(
            all["project-memory-mcp-40f6678f5a9b"].commands[0].name,
            "npx vitest run"
        );

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn loads_legacy_filename_and_migrates_to_v1_path() {
        let root = unique_temp_dir();
        let repo = SavedCommandsRepository::new(root.clone());

        let workspace_dir = root
            .join("project-memory-mcp-40f6678f5a9b")
            .join(INTERACTIVE_TERMINAL_DIR_NAME);
        fs::create_dir_all(&workspace_dir).unwrap();

        let legacy_payload = r#"{
          "workspace_id": "project-memory-mcp-40f6678f5a9b",
          "commands": [{"command": "cargo test"}]
        }"#;

        let legacy_path = workspace_dir.join(LEGACY_SAVED_COMMANDS_FILE_NAME);
        fs::write(&legacy_path, legacy_payload).unwrap();

        let loaded = repo.load_workspace("project-memory-mcp-40f6678f5a9b");
        assert_eq!(loaded.commands.len(), 1);
        assert_eq!(loaded.commands[0].command, "cargo test");

        let v1_path = workspace_dir.join(SAVED_COMMANDS_FILE_NAME);
        assert!(v1_path.exists());

        let _ = fs::remove_dir_all(root);
    }
}
