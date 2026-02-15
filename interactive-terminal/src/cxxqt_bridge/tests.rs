use super::*;
use crate::protocol::{CommandRequest, TerminalProfile};
use crate::saved_commands_repository::SavedCommandsRepository;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

static TEST_TEMP_COUNTER: AtomicU64 = AtomicU64::new(0);

fn unique_temp_dir() -> PathBuf {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let pid = std::process::id();
    let counter = TEST_TEMP_COUNTER.fetch_add(1, Ordering::Relaxed);

    std::env::temp_dir().join(format!(
        "interactive-terminal-bridge-test-{pid}-{nanos}-{counter}"
    ))
}

fn test_state() -> AppState {
    AppState {
        pending_commands_by_session: HashMap::from([("default".to_string(), Vec::new())]),
        session_context_by_id: HashMap::new(),
        selected_session_id: "default".to_string(),
        saved_commands_ui_workspace_id: String::new(),
        saved_commands_by_workspace: HashMap::new(),
        saved_commands_repository: SavedCommandsRepository::new(unique_temp_dir()),
        response_tx: None,
        command_tx: None,
    }
}

fn test_state_with_repo(repo_root: PathBuf) -> AppState {
    AppState {
        pending_commands_by_session: HashMap::from([("default".to_string(), Vec::new())]),
        session_context_by_id: HashMap::new(),
        selected_session_id: "default".to_string(),
        saved_commands_ui_workspace_id: String::new(),
        saved_commands_by_workspace: HashMap::new(),
        saved_commands_repository: SavedCommandsRepository::new(repo_root),
        response_tx: None,
        command_tx: None,
    }
}

#[test]
fn saved_command_crud_is_workspace_scoped() {
    let mut state = test_state();

    let ws1 = "project-memory-mcp-40f6678f5a9b";
    let ws2 = "project-memory-mcp-40f6678f5a9c";

    let first = state
        .save_saved_command(ws1, "Build", "npm run build")
        .expect("save in ws1 should succeed");
    let _second = state
        .save_saved_command(ws2, "Test", "npx vitest run")
        .expect("save in ws2 should succeed");

    let ws1_list = state.list_saved_commands(ws1).expect("list ws1");
    let ws2_list = state.list_saved_commands(ws2).expect("list ws2");

    assert_eq!(ws1_list.len(), 1);
    assert_eq!(ws2_list.len(), 1);
    assert_eq!(ws1_list[0].command, "npm run build");
    assert_eq!(ws2_list[0].command, "npx vitest run");

    state
        .delete_saved_command(ws1, &first.id)
        .expect("delete in ws1 should succeed");

    let ws1_after_delete = state.list_saved_commands(ws1).expect("list ws1 after delete");
    let ws2_after_delete = state.list_saved_commands(ws2).expect("list ws2 after delete");

    assert!(ws1_after_delete.is_empty());
    assert_eq!(ws2_after_delete.len(), 1);
}

#[test]
fn use_saved_command_enforces_selected_session_targeting() {
    let mut state = test_state();
    let ws = "project-memory-mcp-40f6678f5a9b";

    state.selected_session_id = "session-a".to_string();
    state
        .pending_commands_by_session
        .insert("session-a".to_string(), Vec::new());

    let saved = state
        .save_saved_command(ws, "Build", "npm run build")
        .expect("save should succeed");

    let wrong_session = state
        .use_saved_command(ws, &saved.id, "session-b")
        .expect_err("use should reject non-selected session target");
    assert!(wrong_session.contains("selected session"));

    let used = state
        .use_saved_command(ws, &saved.id, "")
        .expect("use should target selected session");

    assert_eq!(used.targeted_session_id, "session-a");
    assert_eq!(used.queued_request.session_id, "session-a");

    let queued = state
        .pending_commands_by_session
        .get("session-a")
        .expect("selected session queue exists");
    assert_eq!(queued.len(), 1);
    assert_eq!(queued[0].command, "npm run build");
}

#[test]
fn create_session_switch_session_and_close_session_follow_runtime_model() {
    let mut state = test_state();

    let created = state.create_session();
    assert!(created.starts_with("session-"));
    assert_eq!(state.selected_session_id, created);
    assert!(state.pending_commands_by_session.contains_key(&created));

    state
        .switch_session("default")
        .expect("switch to default should succeed");
    assert_eq!(state.selected_session_id, "default");

    state
        .close_session(&created)
        .expect("close created session should succeed");
    assert!(!state.pending_commands_by_session.contains_key(&created));
}

#[test]
fn close_session_rejects_pending_approval_queue() {
    let mut state = test_state();
    let session_id = state.create_session();

    state
        .pending_commands_by_session
        .entry(session_id.clone())
        .or_default()
        .push(CommandRequest {
            id: "req-1".to_string(),
            command: "echo blocked".to_string(),
            working_directory: String::new(),
            context: String::new(),
            session_id: session_id.clone(),
            terminal_profile: TerminalProfile::System,
            workspace_path: String::new(),
            venv_path: String::new(),
            activate_venv: false,
            timeout_seconds: 60,
        });

    let err = state
        .close_session(&session_id)
        .expect_err("close must be rejected for pending approvals");
    assert!(err.contains("pending approvals"));
    assert!(state.pending_commands_by_session.contains_key(&session_id));
}

#[test]
fn selected_session_selector_values_hydrate_incoming_request() {
    let mut state = test_state();
    let session_id = state.create_session();

    state.set_selected_terminal_profile(TerminalProfile::Pwsh);
    state.set_selected_workspace_path("C:/workspace/demo".to_string());
    state.set_selected_venv_path("C:/workspace/demo/.venv".to_string());
    state.set_selected_activate_venv(true);

    let mut incoming = CommandRequest {
        id: "req-hydrate-1".to_string(),
        command: "python --version".to_string(),
        working_directory: String::new(),
        context: String::new(),
        session_id,
        terminal_profile: TerminalProfile::System,
        workspace_path: String::new(),
        venv_path: String::new(),
        activate_venv: false,
        timeout_seconds: 60,
    };

    state.hydrate_request_with_session_context(&mut incoming);

    assert_eq!(incoming.terminal_profile, TerminalProfile::Pwsh);
    assert_eq!(incoming.workspace_path, "C:/workspace/demo");
    assert_eq!(incoming.venv_path, "C:/workspace/demo/.venv");
    assert!(incoming.activate_venv);
}

#[test]
fn use_saved_command_uses_selected_session_terminal_profile() {
    let mut state = test_state();
    let ws = "project-memory-mcp-40f6678f5a9b";

    let session_id = state.create_session();
    state.set_selected_terminal_profile(TerminalProfile::Bash);

    let saved = state
        .save_saved_command(ws, "List", "ls")
        .expect("save should succeed");

    let used = state
        .use_saved_command(ws, &saved.id, &session_id)
        .expect("use should succeed");

    assert_eq!(used.queued_request.terminal_profile, TerminalProfile::Bash);
}

#[test]
fn session_context_values_are_isolated_per_session() {
    let mut state = test_state();

    let first_session = state.create_session();
    state.set_selected_terminal_profile(TerminalProfile::Pwsh);
    state.set_selected_workspace_path("C:/workspace/one".to_string());
    state.set_selected_venv_path("C:/workspace/one/.venv".to_string());
    state.set_selected_activate_venv(true);

    state
        .switch_session("default")
        .expect("switching to default should succeed");

    let second_session = state.create_session();
    state.set_selected_terminal_profile(TerminalProfile::Bash);
    state.set_selected_workspace_path("C:/workspace/two".to_string());
    state.set_selected_venv_path("C:/workspace/two/.venv".to_string());
    state.set_selected_activate_venv(false);

    state
        .switch_session(&first_session)
        .expect("switching back to first session should succeed");
    let first_ctx = state.selected_session_context();
    assert_eq!(first_ctx.selected_terminal_profile, TerminalProfile::Pwsh);
    assert_eq!(first_ctx.workspace_path, "C:/workspace/one");
    assert_eq!(first_ctx.selected_venv_path, "C:/workspace/one/.venv");
    assert!(first_ctx.activate_venv);

    state
        .switch_session(&second_session)
        .expect("switching to second session should succeed");
    let second_ctx = state.selected_session_context();
    assert_eq!(second_ctx.selected_terminal_profile, TerminalProfile::Bash);
    assert_eq!(second_ctx.workspace_path, "C:/workspace/two");
    assert_eq!(second_ctx.selected_venv_path, "C:/workspace/two/.venv");
    assert!(!second_ctx.activate_venv);
}

#[test]
fn enabling_venv_activation_auto_detects_workspace_default_venv() {
    let workspace = unique_temp_dir().join("workspace");
    let scripts_dir = workspace.join(".venv").join("Scripts");
    std::fs::create_dir_all(&scripts_dir).expect("should create scripts dir");
    std::fs::write(scripts_dir.join("python.exe"), "").expect("should create python marker");

    let mut state = test_state();
    state.set_selected_workspace_path(workspace.to_string_lossy().to_string());
    state.set_selected_activate_venv(true);

    let selected_ctx = state.selected_session_context();
    assert!(selected_ctx.activate_venv);
    assert_eq!(
        selected_ctx.selected_venv_path,
        workspace.join(".venv").to_string_lossy().to_string()
    );

    let mut incoming = CommandRequest {
        id: "req-venv-detect-1".to_string(),
        command: "python --version".to_string(),
        working_directory: String::new(),
        context: String::new(),
        session_id: "default".to_string(),
        terminal_profile: TerminalProfile::System,
        workspace_path: workspace.to_string_lossy().to_string(),
        venv_path: String::new(),
        activate_venv: true,
        timeout_seconds: 60,
    };

    state.hydrate_request_with_session_context(&mut incoming);
    assert_eq!(
        incoming.venv_path,
        workspace.join(".venv").to_string_lossy().to_string()
    );

    let _ = std::fs::remove_dir_all(workspace.parent().expect("workspace has parent"));
}

#[test]
fn saved_commands_persist_across_app_state_restart_for_workspace() {
    let repo_root = unique_temp_dir();
    let workspace_id = "project-memory-mcp-40f6678f5a9b";

    let saved_id = {
        let mut first_runtime_state = test_state_with_repo(repo_root.clone());
        let saved = first_runtime_state
            .save_saved_command(workspace_id, "Build", "npm run build")
            .expect("save should succeed");
        saved.id
    };

    let mut restarted_state = test_state_with_repo(repo_root.clone());
    let listed = restarted_state
        .list_saved_commands(workspace_id)
        .expect("list after restart should succeed");

    assert_eq!(listed.len(), 1);
    assert_eq!(listed[0].id, saved_id);
    assert_eq!(listed[0].name, "Build");
    assert_eq!(listed[0].command, "npm run build");

    let _ = std::fs::remove_dir_all(repo_root);
}

#[test]
fn saved_commands_stay_workspace_isolated_after_restart() {
    let repo_root = unique_temp_dir();
    let ws1 = "project-memory-mcp-40f6678f5a9b";
    let ws2 = "project-memory-mcp-40f6678f5a9c";

    {
        let mut first_runtime_state = test_state_with_repo(repo_root.clone());
        first_runtime_state
            .save_saved_command(ws1, "Build", "npm run build")
            .expect("ws1 save should succeed");
        first_runtime_state
            .save_saved_command(ws2, "Test", "npx vitest run")
            .expect("ws2 save should succeed");
    }

    let mut restarted_state = test_state_with_repo(repo_root.clone());
    let ws1_list = restarted_state
        .list_saved_commands(ws1)
        .expect("ws1 list after restart should succeed");
    let ws2_list = restarted_state
        .list_saved_commands(ws2)
        .expect("ws2 list after restart should succeed");

    assert_eq!(ws1_list.len(), 1);
    assert_eq!(ws2_list.len(), 1);
    assert_eq!(ws1_list[0].command, "npm run build");
    assert_eq!(ws2_list[0].command, "npx vitest run");

    let _ = std::fs::remove_dir_all(repo_root);
}
