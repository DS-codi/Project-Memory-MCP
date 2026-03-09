use super::{
    monotonic_millis, AppState, SessionLifecycleState, SessionRuntimeContext, SessionTabView,
};
use crate::protocol::{CommandRequest, Message};
use cxx_qt_lib::QString;
use tokio::sync::mpsc::error::TrySendError;

impl AppState {
    fn set_selected_session_lifecycle(&mut self) {
        for state in self.session_lifecycle_by_id.values_mut() {
            if *state != SessionLifecycleState::Closed {
                *state = SessionLifecycleState::Inactive;
            }
        }

        if !self.selected_session_id.trim().is_empty() {
            self.session_lifecycle_by_id
                .insert(self.selected_session_id.clone(), SessionLifecycleState::Active);
        }
    }

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

        ids.sort_by(
            |left, right| match (left == "default", right == "default") {
                (true, false) => std::cmp::Ordering::Less,
                (false, true) => std::cmp::Ordering::Greater,
                _ => left.cmp(right),
            },
        );

        ids
    }

    pub(crate) fn session_tabs_to_json(&self) -> QString {
        let tabs = self
            .session_ids_sorted()
            .into_iter()
            .map(|session_id| {
                let is_agent = self.agent_session_ids.contains(&session_id);
                let meta = self.agent_session_meta.get(&session_id);
                SessionTabView {
                    is_gemini: self.gemini_session_ids.contains(&session_id),
                    label: self.session_display_name_for(&session_id),
                    pending_count: self
                        .pending_commands_by_session
                        .get(&session_id)
                        .map(|queue| queue.len() as i32)
                        .unwrap_or(0),
                    is_active: session_id == self.selected_session_id,
                    can_close: true,
                    lifecycle_state: self
                        .session_lifecycle_by_id
                        .get(&session_id)
                        .copied()
                        .unwrap_or(SessionLifecycleState::Inactive),
                    is_agent_session: is_agent,
                    provider: meta.map(|m| m.provider.clone()),
                    requesting_agent: meta.and_then(|m| m.requesting_agent.clone()),
                    plan_session_id: meta.and_then(|m| m.plan_session_id.clone()),
                    session_id,
                }
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
                let inherited_context = if self.selected_session_id.trim().is_empty() {
                    None
                } else {
                    self.session_context_by_id
                        .get(&self.selected_session_id)
                        .cloned()
                };

                if !self.selected_session_id.trim().is_empty() {
                    self.session_lifecycle_by_id.insert(
                        self.selected_session_id.clone(),
                        SessionLifecycleState::Inactive,
                    );
                }

                self.pending_commands_by_session
                    .insert(candidate.clone(), Vec::new());
                self.session_output_by_id
                    .insert(candidate.clone(), String::new());
                self.session_display_names
                    .insert(candidate.clone(), candidate.clone());
                self.session_context_by_id.insert(
                    candidate.clone(),
                    inherited_context.unwrap_or_else(|| SessionRuntimeContext {
                        selected_terminal_profile: self.default_terminal_profile.clone(),
                        ..SessionRuntimeContext::default()
                    }),
                );
                self.selected_session_id = candidate.clone();
                self.set_selected_session_lifecycle();
                return candidate;
            }

            suffix += 1;
        }
    }

    /// Classify a session into provider-specific TUI guard sets.
    ///
    /// Agent-launched and manual sessions must share the same classification so
    /// tab-switch replay logic can consistently avoid stale VT frame replays.
    pub(crate) fn register_provider_session(&mut self, session_id: &str, provider: &str) {
        let normalized = crate::launch_builder::normalize_provider_token(provider);
        if session_id.trim().is_empty() {
            return;
        }

        match normalized.as_str() {
            "gemini" => {
                self.gemini_session_ids.insert(session_id.to_string());
                self.copilot_session_ids.remove(session_id);
            }
            "copilot" => {
                self.copilot_session_ids.insert(session_id.to_string());
                self.gemini_session_ids.remove(session_id);
            }
            _ => {}
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
        self.set_selected_session_lifecycle();
        Ok(())
    }

    pub(crate) fn close_session(&mut self, session_id: &str) -> Result<(), String> {
        let target = session_id.trim();
        if target.is_empty() {
            return Err("session_id is required".to_string());
        }

        if !self.has_session(target) {
            return Err(format!("session not found: {target}"));
        }

        self.pending_commands_by_session.remove(target);
        self.session_output_by_id.remove(target);
        self.session_display_names.remove(target);
        self.session_context_by_id.remove(target);
        self.gemini_session_ids.remove(target);
        self.copilot_session_ids.remove(target);
        self.session_lifecycle_by_id
            .insert(target.to_string(), SessionLifecycleState::Closed);
        self.session_lifecycle_by_id.remove(target);

        if self.selected_session_id == target {
            if let Some(fallback) = self.session_ids_sorted().into_iter().next() {
                self.selected_session_id = fallback;
            } else {
                self.selected_session_id.clear();
            }
        }

        self.set_selected_session_lifecycle();

        Ok(())
    }

    pub(crate) fn rename_session(
        &mut self,
        session_id: &str,
        display_name: &str,
    ) -> Result<(), String> {
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
            .unwrap_or(SessionRuntimeContext {
                selected_terminal_profile: self.default_terminal_profile.clone(),
                ..SessionRuntimeContext::default()
            })
    }

    pub(crate) fn selected_session_output(&self) -> String {
        self.session_output_by_id
            .get(&self.selected_session_id)
            .cloned()
            .unwrap_or_default()
    }

    pub(crate) fn append_output_line_for_session(
        &mut self,
        session_id: &str,
        line: &str,
    ) -> Option<String> {
        let target = session_id.trim();
        if target.is_empty() {
            return None;
        }

        let dedup_active = self.is_ai_cli_output_dedup_active(target);
        let entry = self
            .session_output_by_id
            .entry(target.to_string())
            .or_default();

        if dedup_active {
            let incoming = line.trim_end_matches('\r');
            let mut lines = entry
                .lines()
                .map(|existing| existing.to_string())
                .collect::<Vec<String>>();

            // Keep only the most recent copy of duplicate lines while AI CLI
            // sessions are active (Gemini/Copilot output often reprints status lines).
            lines.retain(|existing| existing != incoming);
            lines.push(incoming.to_string());
            *entry = lines.join("\n");
        } else {
            if !entry.is_empty() {
                entry.push('\n');
            }
            entry.push_str(line);
        }

        if self.selected_session_id == target {
            Some(entry.clone())
        } else {
            None
        }
    }

    fn is_ai_cli_output_dedup_active(&self, session_id: &str) -> bool {
        if self.gemini_session_ids.contains(session_id) || self.copilot_session_ids.contains(session_id) {
            return true;
        }

        self.agent_session_meta
            .get(session_id)
            .map(|meta| {
                let provider = meta.provider.trim().to_ascii_lowercase();
                provider == "gemini" || provider == "copilot"
            })
            .unwrap_or(false)
    }

    pub(crate) fn clear_selected_session_output(&mut self) {
        let selected = self.selected_session_id.clone();
        self.session_output_by_id
            .insert(selected, String::new());
    }

    pub(crate) fn set_selected_terminal_profile(
        &mut self,
        profile: crate::protocol::TerminalProfile,
    ) {
        if self.selected_session_id.trim().is_empty() {
            return;
        }

        self.session_context_by_id
            .entry(self.selected_session_id.clone())
            .or_default()
            .selected_terminal_profile = profile;
    }

    pub(crate) fn set_default_terminal_profile(
        &mut self,
        profile: crate::protocol::TerminalProfile,
    ) {
        self.default_terminal_profile = profile;
    }

    pub(crate) fn set_selected_workspace_path(&mut self, workspace_path: String) {
        if self.selected_session_id.trim().is_empty() {
            return;
        }

        let ctx = self
            .session_context_by_id
            .entry(self.selected_session_id.clone())
            .or_default();
        ctx.workspace_path = workspace_path.trim().to_string();

        if ctx.activate_venv
            && ctx.selected_venv_path.trim().is_empty()
            && !ctx.workspace_path.is_empty()
        {
            if let Some(detected) =
                crate::command_executor::detect_default_venv(&ctx.workspace_path)
            {
                ctx.selected_venv_path = detected;
            }
        }
    }

    pub(crate) fn set_selected_venv_path(&mut self, venv_path: String) {
        if self.selected_session_id.trim().is_empty() {
            return;
        }

        self.session_context_by_id
            .entry(self.selected_session_id.clone())
            .or_default()
            .selected_venv_path = venv_path.trim().to_string();
    }

    pub(crate) fn set_selected_activate_venv(&mut self, activate: bool) {
        if self.selected_session_id.trim().is_empty() {
            return;
        }

        let ctx = self
            .session_context_by_id
            .entry(self.selected_session_id.clone())
            .or_default();
        ctx.activate_venv = activate;

        if activate && ctx.selected_venv_path.trim().is_empty() && !ctx.workspace_path.is_empty() {
            if let Some(detected) =
                crate::command_executor::detect_default_venv(&ctx.workspace_path)
            {
                ctx.selected_venv_path = detected;
            }
        }
    }

    pub(crate) fn hydrate_request_with_session_context(&mut self, req: &mut CommandRequest) {
        if req.session_id.trim().is_empty() {
            if !self.selected_session_id.trim().is_empty() {
                req.session_id = self.selected_session_id.clone();
            } else {
                req.session_id = "default".to_string();
            }
        }

        let session_id = req.session_id.clone();
        let ctx = self.session_context_by_id.entry(session_id).or_default();

        if matches!(
            req.terminal_profile,
            crate::protocol::TerminalProfile::System
        ) {
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

        if req.activate_venv
            && req.venv_path.trim().is_empty()
            && !req.workspace_path.trim().is_empty()
        {
            if let Some(detected) =
                crate::command_executor::detect_default_venv(&req.workspace_path)
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
            match tx.try_send(msg) {
                Ok(()) => {}
                Err(TrySendError::Full(msg)) => {
                    let tx_clone = tx.clone();
                    if let Ok(handle) = tokio::runtime::Handle::try_current() {
                        handle.spawn(async move {
                            let _ = tx_clone.send(msg).await;
                        });
                    } else {
                        eprintln!("[interactive-terminal] response channel full and no runtime handle; dropping response");
                    }
                }
                Err(TrySendError::Closed(_)) => {
                    eprintln!("[interactive-terminal] response channel closed; dropping response");
                }
            }
        }
    }
}
