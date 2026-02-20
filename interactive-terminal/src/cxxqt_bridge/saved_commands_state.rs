use super::{saved_command_to_record, timestamp_now, AppState, UseSavedCommandResult};
use crate::protocol::{CommandRequest, SavedCommandRecord};
use crate::saved_commands::{normalize_workspace_id, SavedCommand, WorkspaceSavedCommands};

impl AppState {
    pub(crate) fn workspace_model_mut(
        &mut self,
        workspace_id: &str,
    ) -> Result<&mut WorkspaceSavedCommands, String> {
        let normalized = normalize_workspace_id(workspace_id)
            .ok_or_else(|| "workspace_id is required and must be normalized".to_string())?;

        if !self.saved_commands_by_workspace.contains_key(&normalized) {
            let loaded = self.saved_commands_repository.load_workspace(&normalized);
            self.saved_commands_by_workspace
                .insert(normalized.clone(), loaded);
        }

        self.saved_commands_by_workspace
            .get_mut(&normalized)
            .ok_or_else(|| "workspace state unavailable".to_string())
    }

    pub(crate) fn persist_workspace(&mut self, workspace_id: &str) -> Result<(), String> {
        let model = self.workspace_model_mut(workspace_id)?.clone();
        self.saved_commands_repository
            .save_workspace(&model)
            .map_err(|err| format!("failed to persist saved commands: {err}"))
    }

    pub(crate) fn list_saved_commands(
        &mut self,
        workspace_id: &str,
    ) -> Result<Vec<SavedCommandRecord>, String> {
        let mut commands = self
            .workspace_model_mut(workspace_id)?
            .commands
            .iter()
            .cloned()
            .map(saved_command_to_record)
            .collect::<Vec<_>>();
        commands.sort_by(|left, right| left.name.cmp(&right.name).then(left.id.cmp(&right.id)));
        Ok(commands)
    }

    pub(crate) fn save_saved_command(
        &mut self,
        workspace_id: &str,
        name: &str,
        command: &str,
    ) -> Result<SavedCommandRecord, String> {
        let normalized_name = name.trim();
        let normalized_command = command.trim();

        if normalized_name.is_empty() {
            return Err("name is required".to_string());
        }

        if normalized_command.is_empty() {
            return Err("command is required".to_string());
        }

        let now = timestamp_now();
        let new_id = format!("cmd-{}", super::monotonic_millis());

        {
            let model = self.workspace_model_mut(workspace_id)?;
            model.commands.push(SavedCommand {
                id: new_id,
                name: normalized_name.to_string(),
                command: normalized_command.to_string(),
                created_at: now.clone(),
                updated_at: now,
                last_used_at: None,
            });
        }

        self.persist_workspace(workspace_id)?;

        let entry = self
            .workspace_model_mut(workspace_id)?
            .commands
            .last()
            .cloned()
            .ok_or_else(|| "saved command was not persisted".to_string())?;

        Ok(saved_command_to_record(entry))
    }

    pub(crate) fn delete_saved_command(
        &mut self,
        workspace_id: &str,
        command_id: &str,
    ) -> Result<(), String> {
        if command_id.trim().is_empty() {
            return Err("command_id is required".to_string());
        }

        {
            let model = self.workspace_model_mut(workspace_id)?;
            let before = model.commands.len();
            model.commands.retain(|entry| entry.id != command_id);
            if model.commands.len() == before {
                return Err("saved command not found".to_string());
            }
        }

        self.persist_workspace(workspace_id)
    }

    pub(crate) fn use_saved_command(
        &mut self,
        workspace_id: &str,
        command_id: &str,
        requested_session_id: &str,
    ) -> Result<UseSavedCommandResult, String> {
        if command_id.trim().is_empty() {
            return Err("command_id is required".to_string());
        }

        let selected_session_id = self.selected_session_id.clone();
        let requested = requested_session_id.trim();
        if !requested.is_empty() && requested != selected_session_id {
            return Err(format!(
                "session_id must match selected session: {selected_session_id}"
            ));
        }

        let saved_entry = {
            let model = self.workspace_model_mut(workspace_id)?;
            let Some(saved) = model
                .commands
                .iter_mut()
                .find(|entry| entry.id == command_id)
            else {
                return Err("saved command not found".to_string());
            };

            let now = timestamp_now();
            saved.updated_at = now.clone();
            saved.last_used_at = Some(now);
            saved.clone()
        };

        self.persist_workspace(workspace_id)?;

        let context = self
            .session_context_by_id
            .get(&selected_session_id)
            .cloned()
            .unwrap_or_default();

        let request = CommandRequest {
            id: format!("saved-{}", super::monotonic_millis()),
            command: saved_entry.command.clone(),
            working_directory: context.workspace_path.clone(),
            context: format!("Saved command: {}", saved_entry.name),
            session_id: selected_session_id.clone(),
            terminal_profile: context.selected_terminal_profile,
            workspace_path: context.workspace_path,
            venv_path: context.selected_venv_path,
            activate_venv: context.activate_venv,
            timeout_seconds: 300,
            args: Vec::new(),
            env: std::collections::HashMap::new(),
            workspace_id: workspace_id.to_string(),
            allowlisted: false,
        };

        let (_, count, json, selected_cmd) = self.enqueue_pending_request(request.clone());

        Ok(UseSavedCommandResult {
            command_entry: saved_command_to_record(saved_entry),
            queued_request: request,
            targeted_session_id: selected_session_id,
            pending_count: count,
            pending_json: json,
            selected_cmd,
        })
    }
}
