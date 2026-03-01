use super::*;
use crate::cxxqt_bridge::completed_outputs::OutputTracker;
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
        session_display_names: HashMap::from([("default".to_string(), "default".to_string())]),
        session_context_by_id: HashMap::new(),
        session_lifecycle_by_id: HashMap::from([(
            "default".to_string(),
            SessionLifecycleState::Active,
        )]),
        default_terminal_profile: crate::protocol::TerminalProfile::default(),
        selected_session_id: "default".to_string(),
        saved_commands_ui_workspace_id: String::new(),
        saved_commands_by_workspace: HashMap::new(),
        saved_commands_repository: SavedCommandsRepository::new(unique_temp_dir()),
        response_tx: None,
        command_tx: None,
        output_tracker: OutputTracker::default(),
        ws_terminal_tx: None,
    }
}

fn test_state_with_repo(repo_root: PathBuf) -> AppState {
    AppState {
        pending_commands_by_session: HashMap::from([("default".to_string(), Vec::new())]),
        session_display_names: HashMap::from([("default".to_string(), "default".to_string())]),
        session_context_by_id: HashMap::new(),
        session_lifecycle_by_id: HashMap::from([(
            "default".to_string(),
            SessionLifecycleState::Active,
        )]),
        default_terminal_profile: crate::protocol::TerminalProfile::default(),
        selected_session_id: "default".to_string(),
        saved_commands_ui_workspace_id: String::new(),
        saved_commands_by_workspace: HashMap::new(),
        saved_commands_repository: SavedCommandsRepository::new(repo_root),
        response_tx: None,
        command_tx: None,
        output_tracker: OutputTracker::default(),
        ws_terminal_tx: None,
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

    let ws1_after_delete = state
        .list_saved_commands(ws1)
        .expect("list ws1 after delete");
    let ws2_after_delete = state
        .list_saved_commands(ws2)
        .expect("list ws2 after delete");

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
    assert_eq!(
        state.session_lifecycle_by_id.get(&created),
        Some(&SessionLifecycleState::Active)
    );
    assert_eq!(
        state.session_lifecycle_by_id.get("default"),
        Some(&SessionLifecycleState::Inactive)
    );

    state
        .switch_session("default")
        .expect("switch to default should succeed");
    assert_eq!(state.selected_session_id, "default");
    assert_eq!(
        state.session_lifecycle_by_id.get("default"),
        Some(&SessionLifecycleState::Active)
    );
    assert_eq!(
        state.session_lifecycle_by_id.get(&created),
        Some(&SessionLifecycleState::Inactive)
    );

    state
        .close_session(&created)
        .expect("close created session should succeed");
    assert!(!state.pending_commands_by_session.contains_key(&created));
    assert!(!state.session_lifecycle_by_id.contains_key(&created));
}

#[test]
fn close_session_allows_pending_approval_queue() {
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
            args: Vec::new(),
            env: HashMap::new(),
            workspace_id: String::new(),
            allowlisted: false,
        });

    state
        .close_session(&session_id)
        .expect("close should be allowed even when approvals are pending");
    assert!(!state.pending_commands_by_session.contains_key(&session_id));
}

#[test]
fn close_last_default_session_leaves_no_active_session() {
    let mut state = test_state();

    state
        .close_session("default")
        .expect("closing the last default session should be allowed");

    assert!(state.pending_commands_by_session.is_empty());
    assert!(state.session_context_by_id.is_empty());
    assert!(state.session_lifecycle_by_id.is_empty());
    assert!(state.selected_session_id.is_empty());

    let created = state.create_session();
    assert!(created.starts_with("session-"));
    assert_eq!(state.selected_session_id, created);
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
        args: Vec::new(),
        env: HashMap::new(),
        workspace_id: String::new(),
        allowlisted: false,
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
        args: Vec::new(),
        env: HashMap::new(),
        workspace_id: String::new(),
        allowlisted: false,
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

// ---------------------------------------------------------------------------
// Extended saved-commands coverage (Step #13)
// ---------------------------------------------------------------------------

/// Mirrors the `open_saved_commands` invokable: setting the workspace ID on
/// state and loading workspace data on demand via `workspace_model_mut`.
#[test]
fn open_saved_commands_loads_workspace_data() {
    let repo_root = unique_temp_dir();
    let workspace_id = "project-memory-mcp-40f6678f5a9b";

    // Pre-populate the repo with a saved command.
    {
        let mut setup_state = test_state_with_repo(repo_root.clone());
        setup_state
            .save_saved_command(workspace_id, "Build", "npm run build")
            .expect("setup save should succeed");
    }

    // New state simulating a fresh app launch.
    let mut state = test_state_with_repo(repo_root.clone());

    // Simulate open_saved_commands: set the UI workspace ID and load data.
    state.saved_commands_ui_workspace_id = workspace_id.to_string();
    let model = state.workspace_model_mut(workspace_id);
    assert!(model.is_ok(), "workspace_model_mut should succeed");

    let commands = state
        .list_saved_commands(workspace_id)
        .expect("list should succeed");
    assert_eq!(commands.len(), 1, "Should load the pre-saved command");
    assert_eq!(commands[0].name, "Build");
    assert_eq!(commands[0].command, "npm run build");

    let _ = std::fs::remove_dir_all(repo_root);
}

/// Mirrors the `saved_commands_json` invokable: verify list_saved_commands
/// output serializes to valid JSON.
#[test]
fn saved_commands_json_returns_valid_json() {
    let mut state = test_state();
    let workspace_id = "project-memory-mcp-40f6678f5a9b";

    state
        .save_saved_command(workspace_id, "Build", "npm run build")
        .expect("save should succeed");
    state
        .save_saved_command(workspace_id, "Test", "npx vitest run")
        .expect("save should succeed");

    let commands = state
        .list_saved_commands(workspace_id)
        .expect("list should succeed");
    let json = serde_json::to_string(&commands).expect("JSON serialization should succeed");

    // Verify it's valid JSON and round-trips.
    let parsed: Vec<serde_json::Value> =
        serde_json::from_str(&json).expect("JSON should parse back");
    assert_eq!(parsed.len(), 2, "Should have 2 saved commands in JSON");

    // Verify key fields are present.
    for entry in &parsed {
        assert!(entry.get("id").is_some(), "Each entry should have 'id'");
        assert!(entry.get("name").is_some(), "Each entry should have 'name'");
        assert!(
            entry.get("command").is_some(),
            "Each entry should have 'command'"
        );
        assert!(
            entry.get("created_at").is_some(),
            "Each entry should have 'created_at'"
        );
        assert!(
            entry.get("updated_at").is_some(),
            "Each entry should have 'updated_at'"
        );
    }
}

/// Mirrors the `saved_commands_workspace_id` invokable: verify the
/// `saved_commands_ui_workspace_id` field is correctly get/set.
#[test]
fn saved_commands_workspace_id_returns_set_value() {
    let mut state = test_state();

    assert_eq!(state.saved_commands_ui_workspace_id, "", "Initially empty");

    state.saved_commands_ui_workspace_id = "my-workspace-abc123".to_string();
    assert_eq!(
        state.saved_commands_ui_workspace_id, "my-workspace-abc123",
        "Should return the value that was set"
    );
}

/// Mirrors the `reopen_saved_commands` invokable: verify that reloading
/// picks up externally-added commands.
#[test]
fn reopen_saved_commands_refreshes_data() {
    let repo_root = unique_temp_dir();
    let workspace_id = "project-memory-mcp-40f6678f5a9b";

    // First session: save a command.
    {
        let mut first = test_state_with_repo(repo_root.clone());
        first
            .save_saved_command(workspace_id, "Build", "npm run build")
            .expect("save should succeed");
    }

    // Second session: load and verify 1 command.
    let mut state = test_state_with_repo(repo_root.clone());
    state.saved_commands_ui_workspace_id = workspace_id.to_string();
    let commands_before = state
        .list_saved_commands(workspace_id)
        .expect("list should succeed");
    assert_eq!(commands_before.len(), 1);

    // Simulate external addition: use a separate state to add another command
    // directly to the repository file.
    {
        let mut external = test_state_with_repo(repo_root.clone());
        external
            .save_saved_command(workspace_id, "Test", "npx vitest run")
            .expect("external save should succeed");
    }

    // "Reopen": clear in-memory cache and reload from disk.
    state.saved_commands_by_workspace.remove(workspace_id);
    let commands_after = state
        .list_saved_commands(workspace_id)
        .expect("list should succeed");
    assert_eq!(
        commands_after.len(),
        2,
        "Reopen should pick up the externally-added command"
    );

    let _ = std::fs::remove_dir_all(repo_root);
}

/// Mirrors the `execute_saved_command` invokable: verify that using a saved
/// command enqueues it in the selected session's pending queue.
#[test]
fn execute_saved_command_queues_in_selected_session() {
    let mut state = test_state();
    let workspace_id = "project-memory-mcp-40f6678f5a9b";

    let session_id = state.create_session();
    let saved = state
        .save_saved_command(workspace_id, "Deploy", "npm run deploy")
        .expect("save should succeed");

    let result = state
        .use_saved_command(workspace_id, &saved.id, &session_id)
        .expect("execute should succeed");

    // Verify the command was queued.
    assert_eq!(result.targeted_session_id, session_id);
    assert_eq!(result.queued_request.command, "npm run deploy");
    assert_eq!(result.pending_count, 1);

    // Verify it's actually in the pending queue.
    let queue = state
        .pending_commands_by_session
        .get(&session_id)
        .expect("queue should exist");
    assert_eq!(queue.len(), 1);
    assert_eq!(queue[0].command, "npm run deploy");
    assert_eq!(queue[0].session_id, session_id);
}

// ---------------------------------------------------------------------------
// Bridge parity test — verifies ffi.rs and mod.rs declare the same
// set of #[qinvokable] functions.  Moved from tests/bridge_parity.rs
// to avoid integration-test linker errors with CxxQt.
// ---------------------------------------------------------------------------

/// Extract all Rust function names annotated with `#[qinvokable]`.
fn extract_qinvokable_names(source: &str) -> std::collections::BTreeSet<String> {
    let re = regex::Regex::new(r"(?s)#\[qinvokable\].*?fn\s+([a-z_][a-z0-9_]*)").unwrap();
    re.captures_iter(source)
        .map(|cap| cap[1].to_string())
        .collect()
}

#[test]
fn ffi_and_mod_have_identical_qinvokable_sets() {
    let ffi_path = concat!(env!("CARGO_MANIFEST_DIR"), "/src/cxxqt_bridge/ffi.rs");
    let mod_path = concat!(env!("CARGO_MANIFEST_DIR"), "/src/cxxqt_bridge/mod.rs");

    let ffi_src = std::fs::read_to_string(ffi_path)
        .unwrap_or_else(|e| panic!("Failed to read {ffi_path}: {e}"));
    let mod_src = std::fs::read_to_string(mod_path)
        .unwrap_or_else(|e| panic!("Failed to read {mod_path}: {e}"));

    let ffi_names = extract_qinvokable_names(&ffi_src);
    let mod_names = extract_qinvokable_names(&mod_src);

    assert!(
        !ffi_names.is_empty(),
        "ffi.rs contains zero #[qinvokable] declarations — regex may need updating"
    );
    assert!(
        !mod_names.is_empty(),
        "mod.rs contains zero #[qinvokable] declarations — regex may need updating"
    );

    let only_in_ffi: std::collections::BTreeSet<_> = ffi_names.difference(&mod_names).collect();
    let only_in_mod: std::collections::BTreeSet<_> = mod_names.difference(&ffi_names).collect();

    let mut failures = Vec::new();
    if !only_in_ffi.is_empty() {
        failures.push(format!(
            "Invokables in ffi.rs but MISSING from mod.rs: {:?}",
            only_in_ffi
        ));
    }
    if !only_in_mod.is_empty() {
        failures.push(format!(
            "Invokables in mod.rs but MISSING from ffi.rs: {:?}",
            only_in_mod
        ));
    }

    assert!(
        failures.is_empty(),
        "Bridge parity failure!\n{}\n\nffi.rs invokables ({count_ffi}): {ffi_names:?}\nmod.rs invokables ({count_mod}): {mod_names:?}",
        failures.join("\n"),
        count_ffi = ffi_names.len(),
        count_mod = mod_names.len(),
    );

    eprintln!(
        "Bridge parity OK — {} invokables match in both ffi.rs and mod.rs",
        ffi_names.len()
    );
}
