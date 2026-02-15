use crate::cxxqt_bridge::ffi;
use crate::cxxqt_bridge::{terminal_profile_from_key, terminal_profile_to_key};
use crate::protocol::{CommandRequest, CommandResponse, Message, ResponseStatus};
use cxx_qt::CxxQtType;
use cxx_qt_lib::QString;
use std::pin::Pin;

impl ffi::TerminalApp {
    fn refresh_saved_commands_for_workspace(this: &mut Pin<&mut Self>, workspace_id: &str) -> Result<String, String> {
        let state_arc = this.rust().state.clone();
        let mut state = state_arc.lock().unwrap();
        state.saved_commands_ui_workspace_id = workspace_id.to_string();
        let commands = state.list_saved_commands(workspace_id)?;
        serde_json::to_string(&commands)
            .map_err(|err| format!("failed to serialize saved commands: {err}"))
    }

    fn sync_selected_session_context(this: &mut Pin<&mut Self>) {
        let state_arc = this.rust().state.clone();
        let (selected_session_id, context) = {
            let state = state_arc.lock().unwrap();
            (state.selected_session_id.clone(), state.selected_session_context())
        };

        this.as_mut()
            .set_current_session_id(QString::from(&selected_session_id));
        this.as_mut().set_current_terminal_profile(QString::from(
            terminal_profile_to_key(&context.selected_terminal_profile),
        ));
        this.as_mut()
            .set_current_workspace_path(QString::from(&context.workspace_path));
        this.as_mut()
            .set_current_venv_path(QString::from(&context.selected_venv_path));
        this.as_mut().set_current_activate_venv(context.activate_venv);
    }

    pub fn approve_command(mut self: Pin<&mut Self>, id: QString) {
        let id_str = id.to_string();

        let state_arc = self.rust().state.clone();
        let (next_cmd, count, json, tabs_json, selected_session_id) = {
            let mut state = state_arc.lock().unwrap();
            let selected_session = state.selected_session_id.clone();
            let queue = state
                .pending_commands_by_session
                .entry(selected_session)
                .or_default();

            let cmd = queue.iter().find(|c| c.id == id_str).cloned();
            queue.retain(|c| c.id != id_str);

            if let (Some(tx), Some(cmd)) = (&state.command_tx, cmd) {
                let _ = tx.try_send(cmd);
            }

            let next = state.selected_first_command();
            let count = state.selected_pending_count();
            let json = state.pending_commands_to_json();
            let tabs_json = state.session_tabs_to_json();
            let selected_session_id = state.selected_session_id.clone();
            (next, count, json, tabs_json, selected_session_id)
        };

        self.as_mut().set_pending_count(count);
        self.as_mut().set_pending_commands_json(json);
        self.as_mut().set_session_tabs_json(tabs_json);
        self.as_mut()
            .set_current_session_id(QString::from(&selected_session_id));
        self.as_mut()
            .set_status_text(QString::from("Executing command..."));
        self.as_mut().set_output_text(QString::default());

        Self::show_command(&mut self, next_cmd.as_ref());
    }

    pub fn decline_command(mut self: Pin<&mut Self>, id: QString, reason: QString) {
        let id_str = id.to_string();
        let reason_str = reason.to_string();

        let response = Message::CommandResponse(CommandResponse {
            id: id_str.clone(),
            status: ResponseStatus::Declined,
            output: None,
            exit_code: None,
            reason: Some(reason_str),
        });

        let state_arc = self.rust().state.clone();
        let (next_cmd, count, json, tabs_json, selected_session_id) = {
            let mut state = state_arc.lock().unwrap();
            state.send_response(response);
            let selected_session = state.selected_session_id.clone();
            let queue = state
                .pending_commands_by_session
                .entry(selected_session)
                .or_default();
            queue.retain(|c| c.id != id_str);
            let next = state.selected_first_command();
            let count = state.selected_pending_count();
            let json = state.pending_commands_to_json();
            let tabs_json = state.session_tabs_to_json();
            let selected_session_id = state.selected_session_id.clone();
            (next, count, json, tabs_json, selected_session_id)
        };

        self.as_mut().set_pending_count(count);
        self.as_mut().set_pending_commands_json(json);
        self.as_mut().set_session_tabs_json(tabs_json);
        self.as_mut()
            .set_current_session_id(QString::from(&selected_session_id));
        self.as_mut().set_status_text(QString::from("Command declined"));

        Self::show_command(&mut self, next_cmd.as_ref());
        self.as_mut().command_completed(id, false);
    }

    pub fn clear_output(mut self: Pin<&mut Self>) {
        self.as_mut().set_output_text(QString::default());
    }

    pub fn create_session(mut self: Pin<&mut Self>) -> QString {
        let state_arc = self.rust().state.clone();
        let (session_id, count, json, tabs_json, selected_cmd) = {
            let mut state = state_arc.lock().unwrap();
            let session_id = state.create_session();
            let selected_cmd = state.selected_first_command();
            let count = state.selected_pending_count();
            let json = state.pending_commands_to_json();
            let tabs_json = state.session_tabs_to_json();
            (session_id, count, json, tabs_json, selected_cmd)
        };

        self.as_mut().set_current_session_id(QString::from(&session_id));
        self.as_mut().set_pending_count(count);
        self.as_mut().set_pending_commands_json(json);
        self.as_mut().set_session_tabs_json(tabs_json);
        self.as_mut()
            .set_status_text(QString::from(&format!("Created session: {session_id}")));
        Self::show_command(&mut self, selected_cmd.as_ref());
        QString::from(&session_id)
    }

    pub fn switch_session(mut self: Pin<&mut Self>, session_id: QString) -> bool {
        let requested = session_id.to_string();
        let state_arc = self.rust().state.clone();
        let result = {
            let mut state = state_arc.lock().unwrap();
            state.switch_session(&requested).map(|_| {
                let selected_cmd = state.selected_first_command();
                let count = state.selected_pending_count();
                let json = state.pending_commands_to_json();
                let tabs_json = state.session_tabs_to_json();
                let selected_session_id = state.selected_session_id.clone();
                (selected_cmd, count, json, tabs_json, selected_session_id)
            })
        };

        match result {
            Ok((selected_cmd, count, json, tabs_json, selected_session_id)) => {
                self.as_mut()
                    .set_current_session_id(QString::from(&selected_session_id));
                self.as_mut().set_pending_count(count);
                self.as_mut().set_pending_commands_json(json);
                self.as_mut().set_session_tabs_json(tabs_json);
                self.as_mut().set_status_text(QString::from(&format!(
                    "Active session: {selected_session_id}"
                )));
                Self::show_command(&mut self, selected_cmd.as_ref());
                true
            }
            Err(err) => {
                self.as_mut().set_status_text(QString::from(&err));
                false
            }
        }
    }

    pub fn close_session(mut self: Pin<&mut Self>, session_id: QString) -> bool {
        let requested = session_id.to_string();
        let state_arc = self.rust().state.clone();
        let result = {
            let mut state = state_arc.lock().unwrap();
            state.close_session(&requested).map(|_| {
                let selected_cmd = state.selected_first_command();
                let count = state.selected_pending_count();
                let json = state.pending_commands_to_json();
                let tabs_json = state.session_tabs_to_json();
                let selected_session_id = state.selected_session_id.clone();
                (selected_cmd, count, json, tabs_json, selected_session_id)
            })
        };

        match result {
            Ok((selected_cmd, count, json, tabs_json, selected_session_id)) => {
                self.as_mut()
                    .set_current_session_id(QString::from(&selected_session_id));
                self.as_mut().set_pending_count(count);
                self.as_mut().set_pending_commands_json(json);
                self.as_mut().set_session_tabs_json(tabs_json);
                self.as_mut().set_status_text(QString::from(&format!(
                    "Closed session: {}",
                    requested.trim()
                )));
                Self::show_command(&mut self, selected_cmd.as_ref());
                true
            }
            Err(err) => {
                self.as_mut().set_status_text(QString::from(&err));
                false
            }
        }
    }

    fn show_command(this: &mut Pin<&mut Self>, cmd: Option<&CommandRequest>) {
        if let Some(c) = cmd {
            this.as_mut().set_command_text(QString::from(&*c.command));
            this.as_mut()
                .set_working_directory(QString::from(&*c.working_directory));
            this.as_mut().set_context_info(QString::from(&*c.context));
            this.as_mut().set_current_request_id(QString::from(&*c.id));
            this.as_mut().set_current_session_id(QString::from(&*c.session_id));
            this.as_mut().set_current_terminal_profile(QString::from(
                terminal_profile_to_key(&c.terminal_profile),
            ));
            this.as_mut()
                .set_current_workspace_path(QString::from(&*c.workspace_path));
            this.as_mut()
                .set_current_venv_path(QString::from(&*c.venv_path));
            this.as_mut().set_current_activate_venv(c.activate_venv);
        } else {
            this.as_mut().set_command_text(QString::default());
            this.as_mut().set_working_directory(QString::default());
            this.as_mut().set_context_info(QString::default());
            this.as_mut().set_current_request_id(QString::default());
            Self::sync_selected_session_context(this);
        }
    }

    pub fn set_session_terminal_profile(mut self: Pin<&mut Self>, profile: QString) -> bool {
        let profile_str = profile.to_string();
        let Some(parsed) = terminal_profile_from_key(&profile_str) else {
            self.as_mut().set_status_text(QString::from(&format!(
                "Invalid terminal profile: {}",
                profile_str.trim()
            )));
            return false;
        };

        let state_arc = self.rust().state.clone();
        {
            let mut state = state_arc.lock().unwrap();
            state.set_selected_terminal_profile(parsed);
        }

        Self::sync_selected_session_context(&mut self);
        self.as_mut()
            .set_status_text(QString::from("Session terminal profile updated"));
        true
    }

    pub fn set_session_workspace_path(mut self: Pin<&mut Self>, workspace_path: QString) {
        let workspace = workspace_path.to_string();
        let state_arc = self.rust().state.clone();
        {
            let mut state = state_arc.lock().unwrap();
            state.set_selected_workspace_path(workspace);
        }

        Self::sync_selected_session_context(&mut self);
        self.as_mut()
            .set_status_text(QString::from("Session workspace updated"));
    }

    pub fn set_session_venv_path(mut self: Pin<&mut Self>, venv_path: QString) {
        let venv = venv_path.to_string();
        let state_arc = self.rust().state.clone();
        {
            let mut state = state_arc.lock().unwrap();
            state.set_selected_venv_path(venv);
        }

        Self::sync_selected_session_context(&mut self);
        self.as_mut().set_status_text(QString::from("Session venv updated"));
    }

    pub fn set_session_activate_venv(mut self: Pin<&mut Self>, activate: bool) {
        let state_arc = self.rust().state.clone();
        {
            let mut state = state_arc.lock().unwrap();
            state.set_selected_activate_venv(activate);
        }

        Self::sync_selected_session_context(&mut self);
        self.as_mut().set_status_text(QString::from(if activate {
            "Session venv activation enabled"
        } else {
            "Session venv activation disabled"
        }));
    }

    pub fn open_saved_commands(mut self: Pin<&mut Self>, workspace_id: QString) -> bool {
        let workspace = workspace_id.to_string();
        let workspace = workspace.trim();
        if workspace.is_empty() {
            self.as_mut().set_status_text(QString::from(
                "workspace_id is required to open saved commands",
            ));
            return false;
        }

        match Self::refresh_saved_commands_for_workspace(&mut self, workspace) {
            Ok(_) => {
                self.as_mut().set_status_text(QString::from(&format!(
                    "Loaded saved commands for workspace: {}",
                    workspace
                )));
                true
            }
            Err(err) => {
                self.as_mut().set_status_text(QString::from(&err));
                false
            }
        }
    }

    pub fn saved_commands_json(self: &Self) -> QString {
        let state_arc = self.rust().state.clone();
        let mut state = state_arc.lock().unwrap();
        let workspace_id = state.saved_commands_ui_workspace_id.clone();
        if workspace_id.trim().is_empty() {
            return QString::from("[]");
        }

        let commands = state.list_saved_commands(&workspace_id).unwrap_or_default();
        let json = serde_json::to_string(&commands).unwrap_or_else(|_| "[]".to_string());
        QString::from(&json)
    }

    pub fn saved_commands_workspace_id(self: &Self) -> QString {
        let state_arc = self.rust().state.clone();
        let state = state_arc.lock().unwrap();
        QString::from(&state.saved_commands_ui_workspace_id)
    }

    pub fn reopen_saved_commands(mut self: Pin<&mut Self>) -> bool {
        let workspace_id = self.as_ref().saved_commands_workspace_id().to_string();
        let workspace = workspace_id.trim();
        if workspace.is_empty() {
            self.as_mut().set_status_text(QString::from(
                "Set a workspace_id before reopening saved commands",
            ));
            return false;
        }

        match Self::refresh_saved_commands_for_workspace(&mut self, workspace) {
            Ok(_) => {
                self.as_mut().set_status_text(QString::from(&format!(
                    "Reopened saved commands for workspace: {}",
                    workspace
                )));
                true
            }
            Err(err) => {
                self.as_mut().set_status_text(QString::from(&err));
                false
            }
        }
    }

    pub fn execute_saved_command(mut self: Pin<&mut Self>, command_id: QString) -> bool {
        let command_id = command_id.to_string();
        let command_id = command_id.trim();
        if command_id.is_empty() {
            self.as_mut()
                .set_status_text(QString::from("command_id is required"));
            return false;
        }

        let workspace_id = self.as_ref().saved_commands_workspace_id().to_string();
        let workspace = workspace_id.trim();
        if workspace.is_empty() {
            self.as_mut().set_status_text(QString::from(
                "workspace_id is required before executing saved commands",
            ));
            return false;
        }

        let use_result = {
            let state_arc = self.rust().state.clone();
            let mut state = state_arc.lock().unwrap();
            let selected_session_id = state.selected_session_id.clone();
            state.use_saved_command(workspace, command_id, &selected_session_id)
        };

        let use_result = match use_result {
            Ok(result) => result,
            Err(err) => {
                self.as_mut().set_status_text(QString::from(&err));
                return false;
            }
        };

        self.as_mut().set_pending_count(use_result.pending_count);
        self.as_mut()
            .set_pending_commands_json(use_result.pending_json.clone());

        let state_arc = self.rust().state.clone();
        let tabs_json = {
            let state = state_arc.lock().unwrap();
            state.session_tabs_to_json()
        };
        self.as_mut().set_session_tabs_json(tabs_json);

        if let Some(cmd) = use_result.selected_cmd.as_ref() {
            self.as_mut().set_command_text(QString::from(&*cmd.command));
            self.as_mut()
                .set_working_directory(QString::from(&*cmd.working_directory));
            self.as_mut().set_context_info(QString::from(&*cmd.context));
            self.as_mut()
                .set_current_request_id(QString::from(&*cmd.id));
            self.as_mut()
                .set_current_session_id(QString::from(&*cmd.session_id));
            self.as_mut().set_current_terminal_profile(QString::from(
                terminal_profile_to_key(&cmd.terminal_profile),
            ));
            self.as_mut()
                .set_current_workspace_path(QString::from(&*cmd.workspace_path));
            self.as_mut()
                .set_current_venv_path(QString::from(&*cmd.venv_path));
            self.as_mut().set_current_activate_venv(cmd.activate_venv);
        }

        let _ = Self::refresh_saved_commands_for_workspace(&mut self, workspace);

        self.as_mut().set_status_text(QString::from(&format!(
            "Saved command queued for selected session: {}",
            use_result.targeted_session_id
        )));
        self.as_mut()
            .command_received(QString::from(&use_result.queued_request.id));
        true
    }
}
