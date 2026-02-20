use crate::integration::agent_session_protocol::{
    HostedSessionKind, ReadAgentSessionOutputRequest, StartAgentSessionRequest,
    StopAgentSessionRequest,
};
use crate::protocol::{CommandRequest, Message, TerminalProfile};
use serde_json::json;

#[derive(Debug)]
struct StartContractError {
    code: &'static str,
    message: String,
    fallback_reason: &'static str,
}

pub trait HostedSessionAdapter {
    fn hydrate_request_with_session_context(&mut self, request: &mut CommandRequest);
    fn queue_command(&mut self, request: CommandRequest) -> Result<(), String>;
    fn register_running_output(&mut self, request_id: &str);
    fn start_hosted_session(
        &mut self,
        response_id: &str,
        session_id: &str,
        request_id: &str,
    ) -> Message;
    fn fail_hosted_session_start(
        &mut self,
        response_id: &str,
        session_id: &str,
        runtime_session_id: &str,
        error_code: &str,
        error: &str,
        fallback_reason: &str,
    ) -> Message;
    fn build_read_hosted_session_output_response(
        &self,
        response_id: &str,
        session_id: &str,
    ) -> Message;
    fn stop_hosted_session(
        &mut self,
        response_id: &str,
        session_id: &str,
        escalation_level: u8,
    ) -> Message;
}

fn effective_runtime_session_id(req: &StartAgentSessionRequest) -> String {
    let runtime_id = req.runtime_session_id.trim();
    if runtime_id.is_empty() {
        req.session_id.clone()
    } else {
        runtime_id.to_string()
    }
}

fn append_metadata_projection(req: &StartAgentSessionRequest, command_context: &str) -> String {
    let metadata_projection = json!({
        "session_kind": "agent_cli_specialized",
        "session_id": req.session_id,
        "runtime_session_id": effective_runtime_session_id(req),
        "workspace_id": req.workspace_id,
        "plan_id": req.plan_id,
        "agent_type": req.agent_type,
        "parent_session_id": req.parent_session_id,
        "owner_client_id": req.owner_client_id,
        "source_mode": req.source_mode,
        "stop_control": {
            "escalation_level": req.stop_control.escalation_level,
            "inject_enabled": req.stop_control.inject_enabled,
        },
        "scope_boundaries": {
            "files_allowed": req.prompt_payload.scope_boundaries.files_allowed,
            "directories_allowed": req.prompt_payload.scope_boundaries.directories_allowed,
        },
    });

    let projection =
        serde_json::to_string(&metadata_projection).unwrap_or_else(|_| "{}".to_string());
    if command_context.trim().is_empty() {
        format!("[specialized_session_projection] {projection}")
    } else {
        format!("{command_context}\n[specialized_session_projection] {projection}")
    }
}

fn validate_specialized_start_request(
    req: &StartAgentSessionRequest,
) -> Result<String, StartContractError> {
    if !matches!(req.session_kind, HostedSessionKind::AgentCliSpecialized) {
        return Err(StartContractError {
            code: "SPAWN_REJECTED",
            message: "specialized host contract requires session_kind=agent_cli_specialized"
                .to_string(),
            fallback_reason: "contract_invalid",
        });
    }

    if req.session_id.trim().is_empty() {
        return Err(StartContractError {
            code: "SPAWN_REJECTED",
            message: "session_id is required".to_string(),
            fallback_reason: "contract_invalid",
        });
    }

    let runtime_session_id = effective_runtime_session_id(req);
    if runtime_session_id != req.session_id {
        return Err(StartContractError {
            code: "SPAWN_REJECTED",
            message: "runtime_session_id must match session_id in Phase 3 specialized mode"
                .to_string(),
            fallback_reason: "contract_invalid",
        });
    }

    if req.workspace_id.trim().is_empty()
        || req.plan_id.trim().is_empty()
        || req.agent_type.trim().is_empty()
        || req.owner_client_id.trim().is_empty()
    {
        return Err(StartContractError {
            code: "SPAWN_REJECTED",
            message: "workspace_id, plan_id, agent_type, and owner_client_id are required"
                .to_string(),
            fallback_reason: "contract_invalid",
        });
    }

    Ok(runtime_session_id)
}

pub fn start_request_to_command(req: &StartAgentSessionRequest) -> CommandRequest {
    let runtime_session_id = effective_runtime_session_id(req);
    CommandRequest {
        id: runtime_session_id,
        command: req.command.clone(),
        working_directory: req.working_directory.clone(),
        context: req.context.clone(),
        session_id: req.session_id.clone(),
        terminal_profile: TerminalProfile::System,
        workspace_path: req.working_directory.clone(),
        venv_path: String::new(),
        activate_venv: false,
        timeout_seconds: req.timeout_seconds,
        args: req.args.clone(),
        env: req.env.clone(),
        workspace_id: req.workspace_id.clone(),
        allowlisted: true,
    }
}

pub fn handle_start_session(
    adapter: &mut impl HostedSessionAdapter,
    req: &StartAgentSessionRequest,
) -> Message {
    let runtime_session_id = match validate_specialized_start_request(req) {
        Ok(runtime_session_id) => runtime_session_id,
        Err(error) => {
            return adapter.fail_hosted_session_start(
                &req.id,
                &req.session_id,
                &effective_runtime_session_id(req),
                error.code,
                &error.message,
                error.fallback_reason,
            );
        }
    };

    let mut command_request = start_request_to_command(req);
    command_request.context = append_metadata_projection(req, &command_request.context);
    adapter.hydrate_request_with_session_context(&mut command_request);
    let request_id = command_request.id.clone();

    match adapter.queue_command(command_request) {
        Ok(()) => {
            adapter.register_running_output(&request_id);
            adapter.start_hosted_session(&req.id, &req.session_id, &runtime_session_id)
        }
        Err(error) => adapter.fail_hosted_session_start(
            &req.id,
            &req.session_id,
            &runtime_session_id,
            "TRANSPORT_UNREACHABLE",
            &error,
            "host_unavailable",
        ),
    }
}

pub fn handle_read_session_output(
    adapter: &impl HostedSessionAdapter,
    req: &ReadAgentSessionOutputRequest,
) -> Message {
    adapter.build_read_hosted_session_output_response(&req.id, &req.session_id)
}

pub fn handle_stop_session(
    adapter: &mut impl HostedSessionAdapter,
    req: &StopAgentSessionRequest,
) -> Message {
    adapter.stop_hosted_session(&req.id, &req.session_id, req.escalation_level)
}
