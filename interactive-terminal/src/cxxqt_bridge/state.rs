use super::{monotonic_millis, AppState, SessionRuntimeContext, SessionTabView};
use crate::protocol::{CommandRequest, Message};
use cxx_qt_lib::QString;

impl AppState {
    fn session_display_name_for(&self, session_id: &str) -> String {
        self.session_display_names
            .get(session_id)
            .cloned()
            .filter(|name| !name.trim().is_empty())
            .unwrap_or_else(|| session_id.to_string())
    }

    pub(crate) fn has_session(&self, session_id: &str) -> bool {
        self.pending_commands_by_session.contains_key(session_id)
            || self.session_context_by_id.contains_key(session_id)
    }

    pub(crate) fn session_ids_sorted(&self) -> Vec<String> {
        let mut ids: Vec<String> = self.pending_commands_by_session.keys().cloned().collect();

        for session_id in self.session_context_by_id.keys() {
            if !ids.contains(session_id) {
                ids.push(session_id.clone());
            }
        }

        if !self.selected_session_id.trim().is_empty() && !ids.contains(&self.selected_session_id) {
            ids.push(self.selected_session_id.clone());
        }

        ids.sort_by(|left, right| match (left == "default", right == "default") {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => left.cmp(right),
        });

        ids
    }

    pub(crate) fn session_tabs_to_json(&self) -> QString {
        let tabs = self
            .session_ids_sorted()
            .into_iter()
            .map(|session_id| SessionTabView {
                label: self.session_display_name_for(&session_id),
                pending_count: self
                    .pending_commands_by_session
                    .get(&session_id)
                    .map(|queue| queue.len() as i32)
                    .unwrap_or(0),
                is_active: session_id == self.selected_session_id,
                can_close: session_id != "default"
                    && self
                        .pending_commands_by_session
                        .get(&session_id)
                        .map(|queue| queue.is_empty())
                        .unwrap_or(true),
                session_id,
            })
            .collect::<Vec<_>>();

        let json = serde_json::to_string(&tabs).unwrap_or_else(|_| "[]".to_string());
        QString::from(&json)
    }

    pub(crate) fn create_session(&mut self) -> String {
        let mut suffix = monotonic_millis();

        loop {
            let candidate = format!("session-{suffix}");
            if !self.has_session(&candidate) {
                self.pending_commands_by_session
                    .insert(candidate.clone(), Vec::new());
                self.session_display_names
                    .insert(candidate.clone(), candidate.clone());
                self.session_context_by_id.entry(candidate.clone()).or_default();
                self.selected_session_id = candidate.clone();
                return candidate;
            }

            suffix += 1;
        }
    }

    pub(crate) fn switch_session(&mut self, session_id: &str) -> Result<(), String> {
        let selected = session_id.trim();
        if selected.is_empty() {
            return Err("session_id is required".to_string());
        }

        if !self.has_session(selected) {
            return Err(format!("session not found: {selected}"));
        }

        self.pending_commands_by_session
            .entry(selected.to_string())
            .or_default();
        self.selected_session_id = selected.to_string();
        Ok(())
    }

    pub(crate) fn close_session(&mut self, session_id: &str) -> Result<(), String> {
        let target = session_id.trim();
        if target.is_empty() {
            return Err("session_id is required".to_string());
        }

        if target == "default" {
            return Err("default session cannot be closed".to_string());
        }

        if !self.has_session(target) {
            return Err(format!("session not found: {target}"));
        }

        let has_pending = self
            .pending_commands_by_session
            .get(target)
            .map(|queue| !queue.is_empty())
            .unwrap_or(false);
        if has_pending {
            return Err("cannot close session with pending approvals".to_string());
        }

        self.pending_commands_by_session.remove(target);
        self.session_display_names.remove(target);
        self.session_context_by_id.remove(target);

        if self.selected_session_id == target {
            if self.pending_commands_by_session.contains_key("default") {
                self.selected_session_id = "default".to_string();
            } else if let Some(fallback) = self.session_ids_sorted().into_iter().next() {
                self.selected_session_id = fallback;
            } else {
                self.pending_commands_by_session
                    .insert("default".to_string(), Vec::new());
                self.selected_session_id = "default".to_string();
            }
        }

        self.pending_commands_by_session
            .entry(self.selected_session_id.clone())
            .or_default();

        Ok(())
    }

    pub(crate) fn rename_session(&mut self, session_id: &str, display_name: &str) -> Result<(), String> {
        let target = session_id.trim();
        if target.is_empty() {
            return Err("session_id is required".to_string());
        }
        if !self.has_session(target) {
            return Err(format!("session not found: {target}"));
        }

        let next_name = display_name.trim();
        if next_name.is_empty() {
            return Err("session display name cannot be empty".to_string());
        }

        self.session_display_names
            .insert(target.to_string(), next_name.to_string());
        Ok(())
    }

    pub(crate) fn selected_session_context(&self) -> SessionRuntimeContext {
        self.session_context_by_id
            .get(&self.selected_session_id)
            .cloned()
            .unwrap_or_default()
    }

    pub(crate) fn set_selected_terminal_profile(
        &mut self,
        profile: crate::protocol::TerminalProfile,
    ) {
        self.session_context_by_id
            .entry(self.selected_session_id.clone())
            .or_default()
            .selected_terminal_profile = profile;
    }

    pub(crate) fn set_selected_workspace_path(&mut self, workspace_path: String) {
        let ctx = self
            .session_context_by_id
            .entry(self.selected_session_id.clone())
            .or_default();
        ctx.workspace_path = workspace_path.trim().to_string();

        if ctx.activate_venv && ctx.selected_venv_path.trim().is_empty() && !ctx.workspace_path.is_empty() {
            if let Some(detected) = crate::command_executor::detect_default_venv(&ctx.workspace_path)
            {
                ctx.selected_venv_path = detected;
            }
        }
    }

    pub(crate) fn set_selected_venv_path(&mut self, venv_path: String) {
        self.session_context_by_id
            .entry(self.selected_session_id.clone())
            .or_default()
            .selected_venv_path = venv_path.trim().to_string();
    }

    pub(crate) fn set_selected_activate_venv(&mut self, activate: bool) {
        let ctx = self
            .session_context_by_id
            .entry(self.selected_session_id.clone())
            .or_default();
        ctx.activate_venv = activate;

        if activate && ctx.selected_venv_path.trim().is_empty() && !ctx.workspace_path.is_empty() {
            if let Some(detected) = crate::command_executor::detect_default_venv(&ctx.workspace_path)
            {
                ctx.selected_venv_path = detected;
            }
        }
    }

    pub(crate) fn hydrate_request_with_session_context(&mut self, req: &mut CommandRequest) {
        let session_id = req.session_id.clone();
        let ctx = self.session_context_by_id.entry(session_id).or_default();

        if matches!(req.terminal_profile, crate::protocol::TerminalProfile::System) {
            req.terminal_profile = ctx.selected_terminal_profile.clone();
        } else {
            ctx.selected_terminal_profile = req.terminal_profile.clone();
        }

        if req.workspace_path.trim().is_empty() {
            req.workspace_path = ctx.workspace_path.clone();
        } else {
            ctx.workspace_path = req.workspace_path.clone();
        }

        if req.activate_venv {
            ctx.activate_venv = true;
        } else if ctx.activate_venv && !req.workspace_path.trim().is_empty() {
            req.activate_venv = true;
        }

        if req.venv_path.trim().is_empty() {
            req.venv_path = ctx.selected_venv_path.clone();
        } else {
            ctx.selected_venv_path = req.venv_path.clone();
        }

        if req.activate_venv && req.venv_path.trim().is_empty() && !req.workspace_path.trim().is_empty() {
            if let Some(detected) = crate::command_executor::detect_default_venv(&req.workspace_path)
            {
                req.venv_path = detected.clone();
                ctx.selected_venv_path = detected;
            }
        }
    }

    pub(crate) fn selected_pending_commands(&self) -> Vec<CommandRequest> {
        self.pending_commands_by_session
            .get(&self.selected_session_id)
            .cloned()
            .unwrap_or_default()
    }

    pub(crate) fn selected_first_command(&self) -> Option<CommandRequest> {
        self.pending_commands_by_session
            .get(&self.selected_session_id)
            .and_then(|queue| queue.first().cloned())
    }

    pub(crate) fn selected_pending_count(&self) -> i32 {
        self.pending_commands_by_session
            .get(&self.selected_session_id)
            .map(|queue| queue.len() as i32)
            .unwrap_or(0)
    }

    pub(crate) fn enqueue_pending_request(
        &mut self,
        mut req: CommandRequest,
    ) -> (bool, i32, QString, Option<CommandRequest>) {
        self.hydrate_request_with_session_context(&mut req);

        if !self
            .pending_commands_by_session
            .contains_key(&self.selected_session_id)
        {
            let selected_session_id = self.selected_session_id.clone();
            self.pending_commands_by_session
                .insert(selected_session_id, Vec::new());
        }

        let selected_is_empty = self
            .pending_commands_by_session
            .get(&self.selected_session_id)
            .map(|queue| queue.is_empty())
            .unwrap_or(true);

        if selected_is_empty && req.session_id != self.selected_session_id {
            self.selected_session_id = req.session_id.clone();
        }

        let selected_id = self.selected_session_id.clone();
        let queue = self
            .pending_commands_by_session
            .entry(req.session_id.clone())
            .or_default();
        let target_was_empty = queue.is_empty();
        queue.push(req.clone());

        let is_first = req.session_id == selected_id && target_was_empty;
        let count = self.selected_pending_count();
        let json = self.pending_commands_to_json();
        let selected_cmd = self.selected_first_command();
        (is_first, count, json, selected_cmd)
    }

    pub(crate) fn pending_commands_to_json(&self) -> QString {
        let json = serde_json::to_string(&self.selected_pending_commands())
            .unwrap_or_else(|_| "[]".into());
        QString::from(&json)
    }

    pub(crate) fn send_response(&self, msg: Message) {
        if let Some(tx) = self.response_tx.as_ref() {
            let _ = tx.try_send(msg);
        }
    }
}
