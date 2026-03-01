use super::AppState;
use crate::command_executor::{self, OutputLine};
use crate::cxxqt_bridge::completed_outputs::CompletedOutput;
use crate::cxxqt_bridge::ffi;
use crate::cxxqt_bridge::terminal_profile_to_key;
use crate::integration::hosted_session_adapter;
use crate::perf_monitor::PerfMonitor;
use crate::protocol::{
    CommandRequest, CommandResponse, Message, ResponseStatus, SavedCommandsAction,
    SavedCommandsResponse,
};
use crate::tcp_server::{ConnectionEvent, TcpServer};
use cxx_qt_lib::QString;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tokio::sync::broadcast;
use tokio::time::{sleep, Duration, Instant};

#[cfg(windows)]
#[derive(Clone)]
struct WsTerminalSessionHandle {
    writer: Arc<std::sync::Mutex<Box<dyn std::io::Write + Send>>>,
    master: Arc<std::sync::Mutex<Box<dyn portable_pty::MasterPty + Send>>>,
    child: Arc<std::sync::Mutex<Box<dyn portable_pty::Child + Send + Sync>>>,
}

#[cfg(windows)]
async fn ensure_ws_terminal_session(
    session_id: &str,
    state: &Arc<Mutex<AppState>>,
    session_handles: &Arc<tokio::sync::Mutex<HashMap<String, WsTerminalSessionHandle>>>,
    session_output_tx: &tokio::sync::mpsc::Sender<(String, Vec<u8>)>,
) -> Result<(), String> {
    {
        let map = session_handles.lock().await;
        if map.contains_key(session_id) {
            return Ok(());
        }
    }

    use crate::terminal_core::conpty_backend::spawn_conpty_raw_session;

    let workspace_path = {
        let s = state.lock().unwrap();
        s.session_context_by_id
            .get(session_id)
            .map(|ctx| ctx.workspace_path.clone())
            .unwrap_or_default()
    };
    let cwd = if workspace_path.trim().is_empty() {
        std::path::PathBuf::from(std::env::var("USERPROFILE").unwrap_or_else(|_| "C:\\".to_string()))
    } else {
        std::path::PathBuf::from(workspace_path)
    };

    let session = spawn_conpty_raw_session("powershell.exe", &[], &cwd, &[], 200, 50)?;
    let (mut raw_rx, writer, master, child) = session.into_task_parts();

    {
        let mut map = session_handles.lock().await;
        map.insert(
            session_id.to_string(),
            WsTerminalSessionHandle {
                writer,
                master,
                child,
            },
        );
    }

    let session_id_for_pump = session_id.to_string();
    let output_tx = session_output_tx.clone();
    tokio::spawn(async move {
        while let Some(chunk) = raw_rx.recv().await {
            if output_tx
                .send((session_id_for_pump.clone(), chunk))
                .await
                .is_err()
            {
                break;
            }
        }
    });

    Ok(())
}

#[cfg(windows)]
async fn terminate_ws_terminal_session(handle: WsTerminalSessionHandle) {
    let child = handle.child.clone();
    let _ = tokio::task::spawn_blocking(move || {
        if let Ok(mut lock) = child.lock() {
            let _ = lock.kill();
        }
    })
    .await;
}

#[cfg(windows)]
async fn prune_closed_ws_terminal_sessions(
    state: &Arc<Mutex<AppState>>,
    session_handles: &Arc<tokio::sync::Mutex<HashMap<String, WsTerminalSessionHandle>>>,
) {
    let valid_ids = {
        let s = state.lock().unwrap();
        s.session_ids_sorted()
    };

    let stale_ids = {
        let map = session_handles.lock().await;
        map.keys()
            .filter(|id| !valid_ids.iter().any(|valid| valid == *id))
            .cloned()
            .collect::<Vec<_>>()
    };

    for stale_id in stale_ids {
        let removed = {
            let mut map = session_handles.lock().await;
            map.remove(&stale_id)
        };
        if let Some(handle) = removed {
            terminate_ws_terminal_session(handle).await;
        }
    }
}

impl hosted_session_adapter::HostedSessionAdapter for AppState {
    fn hydrate_request_with_session_context(&mut self, request: &mut CommandRequest) {
        self.hydrate_request_with_session_context(request);
    }

    fn queue_command(&mut self, request: CommandRequest) -> Result<(), String> {
        self.command_tx
            .as_ref()
            .ok_or_else(|| "Command runtime is not ready".to_string())
            .and_then(|tx| {
                tx.try_send(request)
                    .map_err(|error| format!("Failed to queue agent session command: {error}"))
            })
    }

    fn register_running_output(&mut self, request_id: &str) {
        self.output_tracker.store(CompletedOutput {
            request_id: request_id.to_string(),
            stdout: String::new(),
            stderr: String::new(),
            exit_code: None,
            running: true,
            completed_at: Instant::now(),
        });
    }

    fn start_hosted_session(
        &mut self,
        response_id: &str,
        session_id: &str,
        request_id: &str,
    ) -> Message {
        self.output_tracker
            .start_hosted_session(response_id, session_id, request_id)
    }

    fn fail_hosted_session_start(
        &mut self,
        response_id: &str,
        session_id: &str,
        runtime_session_id: &str,
        error_code: &str,
        error: &str,
        fallback_reason: &str,
    ) -> Message {
        self.output_tracker.fail_hosted_session_start(
            response_id,
            session_id,
            runtime_session_id,
            error_code,
            error,
            fallback_reason,
        )
    }

    fn build_read_hosted_session_output_response(
        &self,
        response_id: &str,
        session_id: &str,
    ) -> Message {
        self.output_tracker
            .build_read_hosted_session_output_response(response_id, session_id)
    }

    fn stop_hosted_session(
        &mut self,
        response_id: &str,
        session_id: &str,
        escalation_level: u8,
    ) -> Message {
        self.output_tracker
            .stop_hosted_session(response_id, session_id, escalation_level)
    }

    fn list_hosted_sessions(&self, response_id: &str, status_filter: &str) -> Message {
        self.output_tracker
            .list_hosted_sessions(response_id, status_filter)
    }

    fn get_hosted_session(&self, response_id: &str, session_id: &str) -> Message {
        self.output_tracker
            .get_hosted_session(response_id, session_id)
    }
}

pub(crate) fn spawn_runtime_tasks(
    mut server: TcpServer,
    incoming_rx: tokio::sync::mpsc::Receiver<Message>,
    mut event_rx: tokio::sync::broadcast::Receiver<ConnectionEvent>,
    command_rx: tokio::sync::mpsc::Receiver<CommandRequest>,
    state_for_msg: Arc<Mutex<AppState>>,
    state_for_exec: Arc<Mutex<AppState>>,
    qt_thread_msg: cxx_qt::CxxQtThread<ffi::TerminalApp>,
    qt_thread_evt: cxx_qt::CxxQtThread<ffi::TerminalApp>,
    qt_thread_exec: cxx_qt::CxxQtThread<ffi::TerminalApp>,
    qt_thread_perf: cxx_qt::CxxQtThread<ffi::TerminalApp>,
) {
    // Clone a qt_thread handle for setting terminalWsPort on the QML object.
    let qt_thread_terminal = qt_thread_perf.clone();

    std::thread::spawn(move || {
        let rt = tokio::runtime::Runtime::new().expect("Failed to create tokio runtime");
        rt.block_on(async move {
            // ── Terminal WebSocket server + ConPTY bridge ─────────────────────────────
            let terminal_ws_port: u16 = 9101;
            let (input_tx, input_rx) = tokio::sync::mpsc::channel::<Vec<u8>>(64);
            let (ws_server, ws_output_tx) =
                crate::terminal_core::ws_server::TerminalWsServer::new(terminal_ws_port, input_tx.clone());
            tokio::spawn(ws_server.serve());
            let _ = qt_thread_terminal.queue(move |mut obj| {
                obj.as_mut().set_terminal_ws_port(terminal_ws_port as i32);
            });

            // Wire ConPTY ↔ WebSocket (Windows only; no-op on other platforms).
            #[cfg(windows)]
            {
                use crate::terminal_core::conpty_backend::{resize_conpty, try_parse_resize_json};

                let session_handles: Arc<tokio::sync::Mutex<HashMap<String, WsTerminalSessionHandle>>> =
                    Arc::new(tokio::sync::Mutex::new(HashMap::new()));
                let (session_output_tx, mut session_output_rx) =
                    tokio::sync::mpsc::channel::<(String, Vec<u8>)>(256);

                let initial_session_id = {
                    let s = state_for_msg.lock().unwrap();
                    s.selected_session_id.clone()
                };
                if let Err(error) = ensure_ws_terminal_session(
                    &initial_session_id,
                    &state_for_msg,
                    &session_handles,
                    &session_output_tx,
                )
                .await
                {
                    eprintln!("[WsTerminal] failed to initialize session {initial_session_id}: {error}");
                }

                // Output fan-out: forward only active session output to the visible xterm client.
                let state_for_output = state_for_msg.clone();
                let ws_output_for_visible = ws_output_tx.clone();
                tokio::spawn(async move {
                    while let Some((session_id, chunk)) = session_output_rx.recv().await {
                        let selected_session_id = {
                            let s = state_for_output.lock().unwrap();
                            s.selected_session_id.clone()
                        };
                        if selected_session_id == session_id {
                            let _ = ws_output_for_visible.send(chunk);
                        }
                    }
                });

                // Input pump: route xterm input to currently selected session shell.
                let mut inlet = input_rx;
                let state_for_input = state_for_msg.clone();
                let handles_for_input = session_handles.clone();
                let output_tx_for_input = session_output_tx.clone();
                tokio::spawn(async move {
                    while let Some(data) = inlet.recv().await {
                        let selected_session_id = {
                            let s = state_for_input.lock().unwrap();
                            s.selected_session_id.clone()
                        };

                        if let Err(error) = ensure_ws_terminal_session(
                            &selected_session_id,
                            &state_for_input,
                            &handles_for_input,
                            &output_tx_for_input,
                        )
                        .await
                        {
                            eprintln!(
                                "[WsTerminal] failed to ensure session {}: {}",
                                selected_session_id, error
                            );
                            continue;
                        }

                        prune_closed_ws_terminal_sessions(&state_for_input, &handles_for_input).await;

                        let handle = {
                            let map = handles_for_input.lock().await;
                            map.get(&selected_session_id).cloned()
                        };

                        let Some(handle) = handle else {
                            continue;
                        };

                        if let Some((cols, rows)) = try_parse_resize_json(&data) {
                            resize_conpty(&handle.master, cols, rows);
                        } else {
                            let writer = handle.writer.clone();
                            let _ = tokio::task::spawn_blocking(move || {
                                if let Ok(mut lock) = writer.lock() {
                                    let _ = std::io::Write::write_all(&mut *lock, &data);
                                    let _ = std::io::Write::flush(&mut *lock);
                                }
                            })
                            .await;
                        }
                    }
                });

                // Session monitor: proactively ensure selected session has a live shell,
                // even before first keypress, and clean up closed sessions.
                let state_for_monitor = state_for_msg.clone();
                let handles_for_monitor = session_handles.clone();
                let output_tx_for_monitor = session_output_tx.clone();
                tokio::spawn(async move {
                    loop {
                        let selected_session_id = {
                            let s = state_for_monitor.lock().unwrap();
                            s.selected_session_id.clone()
                        };

                        if let Err(error) = ensure_ws_terminal_session(
                            &selected_session_id,
                            &state_for_monitor,
                            &handles_for_monitor,
                            &output_tx_for_monitor,
                        )
                        .await
                        {
                            eprintln!(
                                "[WsTerminal] failed to ensure selected session {}: {}",
                                selected_session_id, error
                            );
                        }

                        prune_closed_ws_terminal_sessions(&state_for_monitor, &handles_for_monitor)
                            .await;

                        sleep(Duration::from_millis(250)).await;
                    }
                });
            }
            #[cfg(not(windows))]
            drop(input_rx);

            // Store the broadcast sender so exec_task (and append_output_line) can
            // forward output lines to xterm.js over the WebSocket connection.
            {
                let mut s = state_for_msg.lock().unwrap();
                s.ws_terminal_tx = Some(ws_output_tx.clone());
            }

            // Clone state for the idle-timeout task before msg_task moves the original.
            let state_for_idle = state_for_msg.clone();

            let server_task = async move {
                loop {
                    if let Err(e) = server.start().await {
                        eprintln!("TCP server error: {e}");
                        sleep(Duration::from_millis(500)).await;
                        continue;
                    }
                    break;
                }
            };

            let msg_task = {
                let qt = qt_thread_msg;
                let state = state_for_msg;
                async move {
                    let mut rx = incoming_rx;
                    while let Some(msg) = rx.recv().await {
                        match msg {
                            Message::CommandRequest(req) => {
                                if req.allowlisted {
                                    let (send_result, tabs_json, selected_session_id, hydrated) = {
                                        let mut s = state.lock().unwrap();
                                        let mut hydrated = req.clone();
                                        s.hydrate_request_with_session_context(&mut hydrated);
                                        s.selected_session_id = hydrated.session_id.clone();
                                        let sender = s.command_tx.clone();
                                        let send_result = sender
                                            .ok_or_else(|| "Command runtime is not ready".to_string())
                                            .and_then(|tx| {
                                                tx.try_send(hydrated.clone())
                                                    .map_err(|error| format!("Failed to queue command: {error}"))
                                            });
                                        let tabs_json = s.session_tabs_to_json();
                                        let selected_session_id = s.selected_session_id.clone();
                                        (send_result, tabs_json, selected_session_id, hydrated)
                                    };

                                    let req_clone = hydrated;
                                    let _ = qt.queue(move |mut obj| {
                                        obj.as_mut().set_session_tabs_json(tabs_json);
                                        obj.as_mut().set_current_session_id(QString::from(&selected_session_id));
                                        obj.as_mut().set_command_text(QString::from(&*req_clone.command));
                                        obj.as_mut().set_working_directory(QString::from(&*req_clone.working_directory));
                                        obj.as_mut().set_context_info(QString::from(&*req_clone.context));
                                        obj.as_mut().set_current_request_id(QString::from(&*req_clone.id));
                                        obj.as_mut().set_current_terminal_profile(QString::from(
                                            terminal_profile_to_key(&req_clone.terminal_profile),
                                        ));
                                        obj.as_mut().set_current_workspace_path(QString::from(&*req_clone.workspace_path));
                                        obj.as_mut().set_current_venv_path(QString::from(&*req_clone.venv_path));
                                        obj.as_mut().set_current_activate_venv(req_clone.activate_venv);
                                        obj.as_mut().set_current_allowlisted(true);

                                        match send_result {
                                            Ok(()) => obj
                                                .as_mut()
                                                .set_status_text(QString::from("Allowlisted command auto-approved")),
                                            Err(error) => obj.as_mut().set_status_text(QString::from(
                                                &format!("Failed to queue allowlisted command: {error}"),
                                            )),
                                        }
                                    });
                                } else {
                                    let (is_first, count, json, selected_cmd, tabs_json, selected_session_id) = {
                                        let mut s = state.lock().unwrap();
                                        let (is_first, count, json, selected_cmd) =
                                            s.enqueue_pending_request(req.clone());
                                        let tabs_json = s.session_tabs_to_json();
                                        let selected_session_id = s.selected_session_id.clone();
                                        (is_first, count, json, selected_cmd, tabs_json, selected_session_id)
                                    };

                                    let req_clone = req.clone();
                                    let _ = qt.queue(move |mut obj| {
                                        obj.as_mut().set_pending_count(count);
                                        obj.as_mut().set_pending_commands_json(json);
                                        obj.as_mut().set_session_tabs_json(tabs_json);
                                        obj.as_mut().set_current_session_id(QString::from(&selected_session_id));

                                        if is_first {
                                            if let Some(cmd) = selected_cmd.as_ref() {
                                                obj.as_mut().set_command_text(QString::from(&*cmd.command));
                                                obj.as_mut().set_working_directory(QString::from(
                                                    &*cmd.working_directory,
                                                ));
                                                obj.as_mut().set_context_info(QString::from(&*cmd.context));
                                                obj.as_mut().set_current_request_id(QString::from(&*cmd.id));
                                                obj.as_mut().set_current_session_id(QString::from(
                                                    &*cmd.session_id,
                                                ));
                                                obj.as_mut().set_current_terminal_profile(QString::from(
                                                    terminal_profile_to_key(&cmd.terminal_profile),
                                                ));
                                                obj.as_mut().set_current_workspace_path(QString::from(
                                                    &*cmd.workspace_path,
                                                ));
                                                obj.as_mut().set_current_venv_path(QString::from(
                                                    &*cmd.venv_path,
                                                ));
                                                obj.as_mut().set_current_activate_venv(cmd.activate_venv);
                                                obj.as_mut().set_current_allowlisted(cmd.allowlisted);
                                            }
                                        }

                                        obj.as_mut()
                                            .set_status_text(QString::from("Command pending approval"));

                                        let id = QString::from(&*req_clone.id);
                                        obj.as_mut().command_received(id);
                                    });
                                }
                            }
                            Message::SavedCommandsRequest(req) => {
                                let mut notify_command_received: Option<String> = None;
                                let mut selected_cmd: Option<CommandRequest> = None;
                                let mut pending_count = 0;
                                let mut pending_json = QString::from("[]");
                                let mut status = String::from("Saved command action complete");
                                let action = req.action.clone();
                                let request_id = req.id.clone();
                                let workspace_id = req.workspace_id.clone();

                                let response = {
                                    let mut s = state.lock().unwrap();
                                    s.saved_commands_ui_workspace_id = workspace_id.clone();

                                    let to_error_response = |message: String| SavedCommandsResponse {
                                        id: request_id.clone(),
                                        action: action.clone(),
                                        workspace_id: workspace_id.clone(),
                                        success: false,
                                        commands: Vec::new(),
                                        command_entry: None,
                                        targeted_session_id: None,
                                        error: Some(message),
                                    };

                                    let operation = match action.clone() {
                                        SavedCommandsAction::Save => s
                                            .save_saved_command(&workspace_id, &req.name, &req.command)
                                            .map(|entry| SavedCommandsResponse {
                                                id: request_id.clone(),
                                                action: SavedCommandsAction::Save,
                                                workspace_id: workspace_id.clone(),
                                                success: true,
                                                commands: Vec::new(),
                                                command_entry: Some(entry),
                                                targeted_session_id: None,
                                                error: None,
                                            }),
                                        SavedCommandsAction::List => s
                                            .list_saved_commands(&workspace_id)
                                            .map(|entries| SavedCommandsResponse {
                                                id: request_id.clone(),
                                                action: SavedCommandsAction::List,
                                                workspace_id: workspace_id.clone(),
                                                success: true,
                                                commands: entries,
                                                command_entry: None,
                                                targeted_session_id: None,
                                                error: None,
                                            }),
                                        SavedCommandsAction::Delete => s
                                            .delete_saved_command(&workspace_id, &req.command_id)
                                            .map(|_| SavedCommandsResponse {
                                                id: request_id.clone(),
                                                action: SavedCommandsAction::Delete,
                                                workspace_id: workspace_id.clone(),
                                                success: true,
                                                commands: Vec::new(),
                                                command_entry: None,
                                                targeted_session_id: None,
                                                error: None,
                                            }),
                                        SavedCommandsAction::Use => s
                                            .use_saved_command(
                                                &workspace_id,
                                                &req.command_id,
                                                &req.session_id,
                                            )
                                            .map(|use_result| {
                                                pending_count = use_result.pending_count;
                                                pending_json = use_result.pending_json.clone();
                                                selected_cmd = use_result.selected_cmd.clone();
                                                notify_command_received =
                                                    Some(use_result.queued_request.id.clone());
                                                status =
                                                    "Saved command queued for approval".to_string();

                                                SavedCommandsResponse {
                                                    id: request_id.clone(),
                                                    action: SavedCommandsAction::Use,
                                                    workspace_id: workspace_id.clone(),
                                                    success: true,
                                                    commands: Vec::new(),
                                                    command_entry: Some(use_result.command_entry),
                                                    targeted_session_id: Some(
                                                        use_result.targeted_session_id,
                                                    ),
                                                    error: None,
                                                }
                                            }),
                                    };

                                    let response = operation.unwrap_or_else(to_error_response);
                                    s.send_response(Message::SavedCommandsResponse(response.clone()));
                                    response
                                };

                                if response.action == SavedCommandsAction::Use && response.success {
                                    let (tabs_json, selected_session_id) = {
                                        let s = state.lock().unwrap();
                                        (s.session_tabs_to_json(), s.selected_session_id.clone())
                                    };

                                    let _ = qt.queue(move |mut obj| {
                                        obj.as_mut().set_pending_count(pending_count);
                                        obj.as_mut().set_pending_commands_json(pending_json);
                                        obj.as_mut().set_session_tabs_json(tabs_json);
                                        obj.as_mut().set_current_session_id(QString::from(
                                            &selected_session_id,
                                        ));

                                        if let Some(cmd) = selected_cmd.as_ref() {
                                            if notify_command_received.is_some() {
                                                obj.as_mut().set_command_text(QString::from(&*cmd.command));
                                                obj.as_mut().set_working_directory(QString::from(
                                                    &*cmd.working_directory,
                                                ));
                                                obj.as_mut().set_context_info(QString::from(
                                                    &*cmd.context,
                                                ));
                                                obj.as_mut().set_current_request_id(QString::from(
                                                    &*cmd.id,
                                                ));
                                                obj.as_mut().set_current_session_id(QString::from(
                                                    &*cmd.session_id,
                                                ));
                                                obj.as_mut().set_current_terminal_profile(QString::from(
                                                    terminal_profile_to_key(&cmd.terminal_profile),
                                                ));
                                                obj.as_mut().set_current_workspace_path(QString::from(
                                                    &*cmd.workspace_path,
                                                ));
                                                obj.as_mut().set_current_venv_path(QString::from(
                                                    &*cmd.venv_path,
                                                ));
                                                obj.as_mut().set_current_activate_venv(
                                                    cmd.activate_venv,
                                                );
                                                obj.as_mut().set_current_allowlisted(cmd.allowlisted);
                                            }
                                        }

                                        obj.as_mut().set_status_text(QString::from(&status));

                                        if let Some(request_id) = notify_command_received {
                                            obj.as_mut().command_received(QString::from(&request_id));
                                        }
                                    });
                                }
                            }
                            Message::ReadOutputRequest(req) => {
                                let response = {
                                    let s = state.lock().unwrap();
                                    s.output_tracker.build_read_output_response(&req.id, &req.session_id)
                                };
                                let s = state.lock().unwrap();
                                s.send_response(response);
                            }
                            Message::StartAgentSessionRequest(req) => {
                                let response = {
                                    let mut s = state.lock().unwrap();
                                    hosted_session_adapter::handle_start_session(&mut *s, &req)
                                };

                                let s = state.lock().unwrap();
                                s.send_response(response);
                            }
                            Message::ReadAgentSessionOutputRequest(req) => {
                                let response = {
                                    let s = state.lock().unwrap();
                                    hosted_session_adapter::handle_read_session_output(&*s, &req)
                                };
                                let s = state.lock().unwrap();
                                s.send_response(response);
                            }
                            Message::StopAgentSessionRequest(req) => {
                                let response = {
                                    let mut s = state.lock().unwrap();
                                    hosted_session_adapter::handle_stop_session(&mut *s, &req)
                                };
                                let s = state.lock().unwrap();
                                s.send_response(response);
                            }
                            Message::ListAgentSessionsRequest(req) => {
                                let response = {
                                    let s = state.lock().unwrap();
                                    hosted_session_adapter::handle_list_sessions(&*s, &req)
                                };
                                let s = state.lock().unwrap();
                                s.send_response(response);
                            }
                            Message::GetAgentSessionRequest(req) => {
                                let response = {
                                    let s = state.lock().unwrap();
                                    hosted_session_adapter::handle_get_session(&*s, &req)
                                };
                                let s = state.lock().unwrap();
                                s.send_response(response);
                            }
                            Message::KillSessionRequest(req) => {
                                let response = {
                                    let mut s = state.lock().unwrap();
                                    s.output_tracker.try_kill(&req.id, &req.session_id)
                                };
                                let s = state.lock().unwrap();
                                s.send_response(response);
                            }
                            Message::Heartbeat(_) => {}
                            _ => {}
                        }
                    }
                }
            };

            // Shared flags so the idle-timeout task can observe connection state.
            let idle_connected = Arc::new(AtomicBool::new(false));
            // Track whether any client has ever connected — idle timeout only
            // starts counting after the first client connects and disconnects,
            // so the tray app can wait indefinitely for its first client.
            let has_ever_connected = Arc::new(AtomicBool::new(false));

            let evt_task = {
                let qt = qt_thread_evt;
                let idle_connected = idle_connected.clone();
                let has_ever_connected = has_ever_connected.clone();
                async move {
                    loop {
                        match event_rx.recv().await {
                            Ok(event) => {
                                let (connected, status) = match &event {
                                    ConnectionEvent::Connected(addr) => {
                                        (true, format!("Client connected from {addr}"))
                                    }
                                    ConnectionEvent::Disconnected => {
                                        (false, "Client disconnected".into())
                                    }
                                    ConnectionEvent::HeartbeatLost => {
                                        (false, "Heartbeat lost".into())
                                    }
                                };

                                idle_connected.store(connected, Ordering::Relaxed);
                                if connected {
                                    has_ever_connected.store(true, Ordering::Relaxed);
                                }

                                let _ = qt.queue(move |mut obj| {
                                    obj.as_mut().set_is_connected(connected);
                                    obj.as_mut().set_status_text(QString::from(&*status));
                                    obj.as_mut().connection_status_changed(connected);
                                });
                            }
                            Err(broadcast::error::RecvError::Lagged(n)) => {
                                eprintln!("Event receiver lagged by {n} messages");
                            }
                            Err(broadcast::error::RecvError::Closed) => break,
                        }
                    }
                }
            };

            let exec_task = {
                let qt = qt_thread_exec;
                let state = state_for_exec;
                let ws_input_for_exec = input_tx.clone();
                let ws_output_for_exec = ws_output_tx.clone();
                async move {
                    let mut cmd_rx = command_rx;
                    let mut shell_manager = command_executor::PersistentShellManager::default();
                    while let Some(req) = cmd_rx.recv().await {
                        let selected_session_id = {
                            let s = state.lock().unwrap();
                            s.selected_session_id.clone()
                        };
                        let route_via_ws_terminal =
                            should_route_via_ws_terminal(&req) && req.session_id == selected_session_id;

                        // (A) Create kill channel and register with OutputTracker
                        let (kill_tx, kill_rx) = tokio::sync::oneshot::channel::<()>();
                        {
                            let mut s = state.lock().unwrap();
                            s.output_tracker.store(CompletedOutput {
                                request_id: req.id.clone(),
                                stdout: String::new(),
                                stderr: String::new(),
                                exit_code: None,
                                running: true,
                                completed_at: Instant::now(),
                            });
                            s.output_tracker.register_kill_sender(&req.id, kill_tx);
                        }

                        let started_at_ms = crate::output_persistence::now_epoch_millis();
                        let (output_tx, mut output_rx) = tokio::sync::mpsc::channel::<OutputLine>(64);
                        let persisted_lines = Arc::new(Mutex::new(Vec::<crate::output_persistence::PersistedOutputLine>::new()));

                        let qt_output = qt.clone();
                        let persisted_lines_for_task = persisted_lines.clone();
                        let state_for_fwd = state.clone();
                        let output_forward = tokio::spawn(async move {
                            // Grab the broadcast sender once before the loop.
                            let ws_tx = {
                                state_for_fwd
                                    .lock()
                                    .unwrap()
                                    .ws_terminal_tx
                                    .clone()
                            };
                            while let Some(line) = output_rx.recv().await {
                                let (stream, text, ui_line) = match &line {
                                    OutputLine::Stdout(l) => (
                                        "stdout".to_string(),
                                        l.clone(),
                                        l.clone(),
                                    ),
                                    OutputLine::Stderr(l) => (
                                        "stderr".to_string(),
                                        l.clone(),
                                        format!("[stderr] {l}"),
                                    ),
                                };

                                {
                                    let mut lines = persisted_lines_for_task.lock().unwrap();
                                    lines.push(crate::output_persistence::PersistedOutputLine {
                                        timestamp_ms: crate::output_persistence::now_epoch_millis(),
                                        stream,
                                        text,
                                    });
                                }

                                // Forward to xterm.js over WebSocket.
                                if !route_via_ws_terminal {
                                    if let Some(ref tx) = ws_tx {
                                    let bytes = format!("{ui_line}\r\n").into_bytes();
                                    let _ = tx.send(bytes);
                                    }
                                }

                                let _ = qt_output.queue(move |mut obj| {
                                    let cur = obj.as_ref().output_text().to_string();
                                    let new_text = if cur.is_empty() {
                                        ui_line
                                    } else {
                                        format!("{cur}\n{ui_line}")
                                    };
                                    obj.as_mut().set_output_text(QString::from(&new_text));
                                });
                            }
                        });

                        // (B) Race command execution against kill signal
                        tokio::select! {
                            result = async {
                                if route_via_ws_terminal {
                                    execute_command_via_ws_terminal(
                                        &req,
                                        output_tx,
                                        ws_input_for_exec.clone(),
                                        ws_output_for_exec.clone(),
                                    ).await
                                } else {
                                    shell_manager.execute_command_with_timeout(&req, output_tx).await
                                }
                            } => {
                                let _ = output_forward.await;
                                let completed_at_ms = crate::output_persistence::now_epoch_millis();
                                let captured_lines = persisted_lines.lock().unwrap().clone();

                                // (C) Mark completed with separated stdout/stderr
                                let (separated_stdout, separated_stderr) = separate_stdout_stderr(&captured_lines);
                                {
                                    let exit_code = match &result {
                                        Ok(r) => r.exit_code,
                                        Err(_) => Some(-1),
                                    };
                                    let mut s = state.lock().unwrap();
                                    s.output_tracker.mark_completed(
                                        &req.id, exit_code,
                                        separated_stdout, separated_stderr,
                                    );
                                }

                                match result {
                                    Ok(exec_result) => {
                                        let persisted_path = match crate::output_persistence::write_command_output_file(
                                            &req,
                                            &ResponseStatus::Approved,
                                            &captured_lines,
                                            exec_result.exit_code,
                                            started_at_ms,
                                            completed_at_ms,
                                        ) {
                                            Ok(path) => Some(path),
                                            Err(error) => {
                                                eprintln!("Failed to persist command output: {error}");
                                                None
                                            }
                                        };

                                        let response = Message::CommandResponse(CommandResponse {
                                            id: exec_result.request_id.clone(),
                                            status: ResponseStatus::Approved,
                                            output: Some(exec_result.output),
                                            exit_code: exec_result.exit_code,
                                            reason: None,
                                            output_file_path: persisted_path,
                                        });

                                        {
                                            let s = state.lock().unwrap();
                                            s.send_response(response);
                                        }

                                        let id_str = exec_result.request_id;
                                        let success = exec_result.exit_code == Some(0);
                                        let _ = qt.queue(move |mut obj| {
                                            let msg = if success {
                                                "Command completed successfully"
                                            } else {
                                                "Command failed"
                                            };
                                            obj.as_mut().set_status_text(QString::from(msg));
                                            obj.as_mut().command_completed(QString::from(&id_str), success);
                                        });
                                    }
                                    Err(err) => {
                                        let mut error_lines = captured_lines;
                                        if error_lines.is_empty() {
                                            error_lines.push(crate::output_persistence::PersistedOutputLine {
                                                timestamp_ms: completed_at_ms,
                                                stream: "stderr".to_string(),
                                                text: err.clone(),
                                            });
                                        }

                                        let persisted_path = match crate::output_persistence::write_command_output_file(
                                            &req,
                                            &ResponseStatus::Approved,
                                            &error_lines,
                                            Some(-1),
                                            started_at_ms,
                                            completed_at_ms,
                                        ) {
                                            Ok(path) => Some(path),
                                            Err(error) => {
                                                eprintln!("Failed to persist command output after error: {error}");
                                                None
                                            }
                                        };

                                        let response = Message::CommandResponse(CommandResponse {
                                            id: req.id.clone(),
                                            status: ResponseStatus::Approved,
                                            output: Some(err.clone()),
                                            exit_code: Some(-1),
                                            reason: None,
                                            output_file_path: persisted_path,
                                        });

                                        {
                                            let s = state.lock().unwrap();
                                            s.send_response(response);
                                        }

                                        let id_str = req.id.clone();
                                        let _ = qt.queue(move |mut obj| {
                                            obj.as_mut()
                                                .set_status_text(QString::from(&format!("Error: {err}")));
                                            obj.as_mut().command_completed(QString::from(&id_str), false);
                                        });
                                    }
                                }
                            }
                            _ = kill_rx => {
                                // (D) Kill signal received — execution future is dropped,
                                // which drops output_tx and terminates output_forward.
                                let _ = output_forward.await;
                                shell_manager.terminate_session_shell(&req.session_id).await;
                                let completed_at_ms = crate::output_persistence::now_epoch_millis();
                                let captured_lines = persisted_lines.lock().unwrap().clone();

                                let (separated_stdout, separated_stderr) = separate_stdout_stderr(&captured_lines);
                                {
                                    let mut s = state.lock().unwrap();
                                    s.output_tracker.mark_completed(
                                        &req.id, Some(-1),
                                        separated_stdout, separated_stderr,
                                    );
                                }

                                // Persist output for killed process
                                let persisted_path = match crate::output_persistence::write_command_output_file(
                                    &req,
                                    &ResponseStatus::Approved,
                                    &captured_lines,
                                    Some(-1),
                                    started_at_ms,
                                    completed_at_ms,
                                ) {
                                    Ok(path) => Some(path),
                                    Err(error) => {
                                        eprintln!("Failed to persist command output after kill: {error}");
                                        None
                                    }
                                };

                                let response = Message::CommandResponse(CommandResponse {
                                    id: req.id.clone(),
                                    status: ResponseStatus::Approved,
                                    output: Some("Process killed by user request".to_string()),
                                    exit_code: Some(-1),
                                    reason: Some("Process killed by user request".to_string()),
                                    output_file_path: persisted_path,
                                });

                                {
                                    let s = state.lock().unwrap();
                                    s.send_response(response);
                                }

                                let id_str = req.id.clone();
                                let _ = qt.queue(move |mut obj| {
                                    obj.as_mut()
                                        .set_status_text(QString::from("Process killed"));
                                    obj.as_mut().command_completed(QString::from(&id_str), false);
                                });
                            }
                        }
                    }
                }
            };

            // Idle timeout task — periodically checks whether the app is
            // idle (no connected client AND no pending commands) for longer
            // than the configured idle timeout, then exits the process.
            let idle_timeout_task = {
                let state = state_for_idle;
                let connected = idle_connected;
                let ever_connected = has_ever_connected;
                async move {
                    let idle_secs = *crate::IDLE_TIMEOUT.get().unwrap_or(&300);
                    if idle_secs == 0 {
                        // Idle timeout disabled — park forever.
                        std::future::pending::<()>().await;
                        return;
                    }
                    let timeout = Duration::from_secs(idle_secs);
                    // Check interval: every 10 seconds or half the timeout, whichever is smaller.
                    let check_interval = Duration::from_secs(
                        (idle_secs / 2).max(1).min(10),
                    );
                    let mut idle_since: Option<Instant> = None;

                    loop {
                        sleep(check_interval).await;

                        let is_connected = connected.load(Ordering::Relaxed);
                        let has_pending = {
                            let s = state.lock().unwrap();
                            s.pending_commands_by_session
                                .values()
                                .any(|cmds| !cmds.is_empty())
                        };

                        if is_connected || has_pending {
                            // Activity present — reset idle timer.
                            idle_since = None;
                        } else if !ever_connected.load(Ordering::Relaxed) {
                            // No client has ever connected — don't start the
                            // idle timer yet (tray app waiting for first client).
                            idle_since = None;
                        } else {
                            // No client, no pending commands, but a client
                            // connected at least once before.
                            let start = *idle_since.get_or_insert_with(Instant::now);
                            if start.elapsed() >= timeout {
                                eprintln!(
                                    "Idle timeout ({idle_secs}s) reached with no connected \
                                     client and no pending commands. Exiting."
                                );
                                std::process::exit(0);
                            }
                        }
                    }
                }
            };

            let perf_task = {
                let qt = qt_thread_perf;
                async move {
                    let mut monitor = PerfMonitor::new();
                    loop {
                        let snapshot = monitor.sample();
                        let _ = qt.queue(move |mut obj| {
                            obj.as_mut().set_cpu_usage_percent(snapshot.cpu_usage_percent);
                            obj.as_mut().set_memory_usage_mb(snapshot.memory_usage_mb);
                        });
                        sleep(Duration::from_secs(5)).await;
                    }
                }
            };

            tokio::select! {
                _ = server_task => {}
                _ = msg_task => {}
                _ = evt_task => {}
                _ = exec_task => {}
                _ = idle_timeout_task => {}
                _ = perf_task => {}
            }
        });
    });
}

/// Separate persisted output lines into distinct stdout and stderr strings.
fn separate_stdout_stderr(
    lines: &[crate::output_persistence::PersistedOutputLine],
) -> (String, String) {
    let mut stdout = String::new();
    let mut stderr = String::new();
    for line in lines {
        let target = if line.stream == "stderr" {
            &mut stderr
        } else {
            &mut stdout
        };
        if !target.is_empty() {
            target.push('\n');
        }
        target.push_str(&line.text);
    }
    (stdout, stderr)
}

fn should_route_via_ws_terminal(request: &CommandRequest) -> bool {
    #[cfg(target_os = "windows")]
    {
        matches!(
            request.terminal_profile,
            crate::protocol::TerminalProfile::PowerShell
                | crate::protocol::TerminalProfile::Pwsh
                | crate::protocol::TerminalProfile::System
        )
    }
    #[cfg(not(target_os = "windows"))]
    {
        false
    }
}

fn is_safe_env_key(key: &str) -> bool {
    let mut chars = key.chars();
    let Some(first) = chars.next() else {
        return false;
    };
    if !(first.is_ascii_alphabetic() || first == '_') {
        return false;
    }
    chars.all(|c| c.is_ascii_alphanumeric() || c == '_')
}

fn escape_powershell_single_quoted(input: &str) -> String {
    input.replace('\'', "''")
}

fn normalize_ws_request_env(request: &CommandRequest) -> Vec<(String, String)> {
    const GEMINI_SENTINEL_TOKEN: &str = "{{stored}}";
    const GEMINI_INJECT_FLAG_ENV: &str = "PM_GEMINI_INJECT";

    let mut env_map: HashMap<String, String> = request.env.clone();

    let has_sentinel_request = request
        .env
        .get("GEMINI_API_KEY")
        .map(|value| value.trim() == GEMINI_SENTINEL_TOKEN)
        .unwrap_or(false)
        || request
            .env
            .get("GOOGLE_API_KEY")
            .map(|value| value.trim() == GEMINI_SENTINEL_TOKEN)
            .unwrap_or(false);

    env_map.remove("GEMINI_API_KEY");
    env_map.remove("GOOGLE_API_KEY");
    env_map.remove(GEMINI_INJECT_FLAG_ENV);

    if has_sentinel_request {
        if let Some(stored_key) = crate::system_tray::load_gemini_api_key() {
            env_map.insert("GEMINI_API_KEY".to_string(), stored_key.clone());
            env_map.insert("GOOGLE_API_KEY".to_string(), stored_key);
        }
    }

    env_map.into_iter().collect()
}

fn build_ws_env_prefix(request: &CommandRequest) -> String {
    normalize_ws_request_env(request)
        .iter()
        .filter(|(k, _)| is_safe_env_key(k))
        .map(|(k, v)| format!("$env:{} = '{}'; ", k, escape_powershell_single_quoted(v)))
        .collect()
}

fn parse_marker_exit_code(line: &str, marker: &str) -> Option<i32> {
    let idx = line.find(marker)?;
    let value = line[idx + marker.len()..].trim();
    value.parse::<i32>().ok()
}

fn build_ws_wrapped_command(request: &CommandRequest, marker: &str) -> String {
    let cwd = if request.working_directory.trim().is_empty() {
        request.workspace_path.clone()
    } else {
        request.working_directory.clone()
    };
    let escaped_cwd = escape_powershell_single_quoted(&cwd);
    let env_prefix = build_ws_env_prefix(request);

    format!(
        "{env_prefix}Set-Location -LiteralPath '{escaped_cwd}'; & {{ {}; $code=$LASTEXITCODE; if ($null -eq $code) {{ $code=0 }}; Write-Output '{}'+$code }}",
        request.command,
        marker
    )
}

async fn execute_command_via_ws_terminal(
    request: &CommandRequest,
    output_tx: tokio::sync::mpsc::Sender<OutputLine>,
    ws_input_tx: tokio::sync::mpsc::Sender<Vec<u8>>,
    ws_output_tx: tokio::sync::broadcast::Sender<Vec<u8>>,
) -> Result<command_executor::ExecutionResult, String> {
    let marker = format!("__PM_DONE_{}__", request.id.replace('-', "_"));
    let wrapped = build_ws_wrapped_command(request, &marker);
    let mut output_rx = ws_output_tx.subscribe();

    ws_input_tx
        .send(format!("{wrapped}\r\n").into_bytes())
        .await
        .map_err(|error| format!("Failed to write command to active terminal: {error}"))?;

    let timeout = Duration::from_secs(request.timeout_seconds.max(1));
    let deadline = Instant::now() + timeout;

    let mut captured_output = String::new();
    let mut line_buffer = String::new();

    loop {
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            let timeout_msg = format!(
                "Command timed out after {} seconds",
                request.timeout_seconds
            );
            let _ = output_tx
                .send(OutputLine::Stderr(timeout_msg.clone()))
                .await;

            if !captured_output.is_empty() {
                captured_output.push('\n');
            }
            captured_output.push_str(&timeout_msg);

            return Ok(command_executor::ExecutionResult {
                request_id: request.id.clone(),
                exit_code: Some(-1),
                output: captured_output,
            });
        }

        let recv_result = tokio::time::timeout(remaining, output_rx.recv()).await;
        match recv_result {
            Ok(Ok(bytes)) => {
                if bytes.is_empty() {
                    continue;
                }

                let chunk = String::from_utf8_lossy(&bytes).to_string();
                captured_output.push_str(&chunk);
                line_buffer.push_str(&chunk);

                while let Some(newline_idx) = line_buffer.find('\n') {
                    let line = line_buffer[..newline_idx].trim_end_matches('\r').to_string();
                    line_buffer = line_buffer[newline_idx + 1..].to_string();

                    if let Some(code) = parse_marker_exit_code(&line, &marker) {
                        return Ok(command_executor::ExecutionResult {
                            request_id: request.id.clone(),
                            exit_code: Some(code),
                            output: captured_output,
                        });
                    }

                    if !line.is_empty() {
                        let _ = output_tx.send(OutputLine::Stdout(line)).await;
                    }
                }
            }
            Ok(Err(tokio::sync::broadcast::error::RecvError::Lagged(_))) => {
                continue;
            }
            Ok(Err(tokio::sync::broadcast::error::RecvError::Closed)) => {
                return Err("Active terminal output stream is unavailable".to_string());
            }
            Err(_) => {
                continue;
            }
        }
    }
}

// =========================================================================
// Tests
// =========================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cxxqt_bridge::completed_outputs::{CompletedOutput, OutputTracker};
    use crate::protocol::Message;
    use tokio::time::Instant;

    // ===================================================================
    // Step 7: msg_task handler scenario tests
    //
    // These test the same OutputTracker methods that msg_task calls when it
    // receives ReadOutputRequest and KillSessionRequest messages over TCP.
    // ===================================================================

    /// msg_task: ReadOutputRequest for a known completed session with both
    /// stdout and stderr → verify all fields are returned correctly.
    #[test]
    fn msg_read_output_completed_session_with_stderr() {
        let mut tracker = OutputTracker::default();
        tracker.store(CompletedOutput {
            request_id: "session-42".into(),
            stdout: "Build succeeded".into(),
            stderr: "warning: unused variable".into(),
            exit_code: Some(0),
            running: false,
            completed_at: Instant::now(),
        });

        // msg_task calls build_read_output_response(req.id, req.session_id)
        let response = tracker.build_read_output_response("resp-99", "session-42");
        match response {
            Message::ReadOutputResponse(r) => {
                assert_eq!(r.id, "resp-99");
                assert_eq!(r.session_id, "session-42");
                assert_eq!(r.stdout, "Build succeeded");
                assert_eq!(r.stderr, "warning: unused variable");
                assert_eq!(r.exit_code, Some(0));
                assert!(!r.running);
                assert!(!r.truncated);
            }
            _ => panic!("expected ReadOutputResponse"),
        }
    }

    /// msg_task: ReadOutputRequest for a session that failed (non-zero exit).
    #[test]
    fn msg_read_output_failed_session() {
        let mut tracker = OutputTracker::default();
        tracker.store(CompletedOutput {
            request_id: "session-fail".into(),
            stdout: String::new(),
            stderr: "Error: file not found".into(),
            exit_code: Some(1),
            running: false,
            completed_at: Instant::now(),
        });

        let response = tracker.build_read_output_response("r-fail", "session-fail");
        match response {
            Message::ReadOutputResponse(r) => {
                assert_eq!(r.exit_code, Some(1));
                assert!(!r.running);
                assert!(r.stdout.is_empty());
                assert_eq!(r.stderr, "Error: file not found");
            }
            _ => panic!("expected ReadOutputResponse"),
        }
    }

    /// msg_task: ReadOutputRequest for an unknown session → empty response
    /// with running=false and no exit code.
    #[test]
    fn msg_read_output_unknown_session() {
        let tracker = OutputTracker::default();
        let response = tracker.build_read_output_response("resp-1", "no-such-session");
        match response {
            Message::ReadOutputResponse(r) => {
                assert_eq!(r.id, "resp-1");
                assert_eq!(r.session_id, "no-such-session");
                assert!(!r.running);
                assert!(r.exit_code.is_none());
                assert!(r.stdout.is_empty());
                assert!(r.stderr.is_empty());
            }
            _ => panic!("expected ReadOutputResponse"),
        }
    }

    /// msg_task: ReadOutputRequest for a session still executing →
    /// running=true and no exit code.
    #[test]
    fn msg_read_output_running_session() {
        let mut tracker = OutputTracker::default();
        tracker.store(CompletedOutput {
            request_id: "session-running".into(),
            stdout: String::new(),
            stderr: String::new(),
            exit_code: None,
            running: true,
            completed_at: Instant::now(),
        });

        let response = tracker.build_read_output_response("resp-2", "session-running");
        match response {
            Message::ReadOutputResponse(r) => {
                assert!(r.running);
                assert!(r.exit_code.is_none());
                assert_eq!(r.session_id, "session-running");
            }
            _ => panic!("expected ReadOutputResponse"),
        }
    }

    /// msg_task: KillSessionRequest for a running session with a registered
    /// kill sender → killed=true and the oneshot channel actually fires.
    #[test]
    fn msg_kill_running_session() {
        let mut tracker = OutputTracker::default();
        let (tx, mut rx) = tokio::sync::oneshot::channel::<()>();
        tracker.register_kill_sender("session-active", tx);

        let response = tracker.try_kill("kill-resp-1", "session-active");
        match response {
            Message::KillSessionResponse(r) => {
                assert!(r.killed);
                assert_eq!(r.id, "kill-resp-1");
                assert_eq!(r.session_id, "session-active");
                assert!(r.message.is_some());
                assert!(r.error.is_none());
            }
            _ => panic!("expected KillSessionResponse"),
        }
        // Verify the kill signal was actually delivered to the receiver
        assert!(rx.try_recv().is_ok());
    }

    /// msg_task: KillSessionRequest for a completed session (mark_completed
    /// already removed the kill sender) → killed=false with error.
    #[test]
    fn msg_kill_completed_session() {
        let mut tracker = OutputTracker::default();
        let (tx, _rx) = tokio::sync::oneshot::channel::<()>();
        tracker.register_kill_sender("session-done", tx);

        // Simulate exec_task completing — mark_completed removes kill sender
        tracker.mark_completed("session-done", Some(0), "done".into(), String::new());

        let response = tracker.try_kill("kill-resp-2", "session-done");
        match response {
            Message::KillSessionResponse(r) => {
                assert!(!r.killed);
                assert!(r.error.is_some());
            }
            _ => panic!("expected KillSessionResponse"),
        }
    }

    /// msg_task: KillSessionRequest for an unknown session → error response
    /// with "not found".
    #[test]
    fn msg_kill_unknown_session() {
        let mut tracker = OutputTracker::default();
        let response = tracker.try_kill("kill-resp-3", "nonexistent-session");
        match response {
            Message::KillSessionResponse(r) => {
                assert!(!r.killed);
                assert_eq!(r.session_id, "nonexistent-session");
                let err = r.error.expect("should have error message");
                assert!(
                    err.contains("not found"),
                    "error should mention 'not found', got: {err}"
                );
            }
            _ => panic!("expected KillSessionResponse"),
        }
    }

    // ===================================================================
    // Step 8: exec_task OutputTracker integration scenario tests
    //
    // These test sequences that mirror the exec_task flow:
    //   (A) store running → register kill sender
    //   (B) execute command (race with kill)
    //   (C) mark completed with separated stdout/stderr
    //   (D) kill branch with exit_code=-1
    // ===================================================================

    /// exec_task step (A): store running entry, then read_output returns
    /// running=true with empty output (execution hasn't produced output yet).
    #[test]
    fn exec_store_running_then_read() {
        let mut tracker = OutputTracker::default();
        // exec_task stores running entry before execution begins
        tracker.store(CompletedOutput {
            request_id: "cmd-1".into(),
            stdout: String::new(),
            stderr: String::new(),
            exit_code: None,
            running: true,
            completed_at: Instant::now(),
        });

        let msg = tracker.build_read_output_response("read-1", "cmd-1");
        match msg {
            Message::ReadOutputResponse(r) => {
                assert!(r.running);
                assert!(r.exit_code.is_none());
                assert_eq!(r.stdout, "");
                assert_eq!(r.stderr, "");
            }
            _ => panic!("expected ReadOutputResponse"),
        }
    }

    /// exec_task step (C): after execution completes, mark_completed updates
    /// the entry with final stdout/stderr and exit code.
    #[test]
    fn exec_mark_completed_then_read() {
        let mut tracker = OutputTracker::default();
        tracker.store(CompletedOutput {
            request_id: "cmd-2".into(),
            stdout: String::new(),
            stderr: String::new(),
            exit_code: None,
            running: true,
            completed_at: Instant::now(),
        });

        tracker.mark_completed(
            "cmd-2",
            Some(0),
            "line1\nline2".into(),
            "warn: something".into(),
        );

        let msg = tracker.build_read_output_response("read-2", "cmd-2");
        match msg {
            Message::ReadOutputResponse(r) => {
                assert!(!r.running);
                assert_eq!(r.exit_code, Some(0));
                assert_eq!(r.stdout, "line1\nline2");
                assert_eq!(r.stderr, "warn: something");
            }
            _ => panic!("expected ReadOutputResponse"),
        }
    }

    /// exec_task kill channel: register_kill_sender → try_kill sends signal →
    /// verify the oneshot receiver fires (simulates tokio::select! kill branch).
    #[test]
    fn exec_kill_channel_signal_delivery() {
        let mut tracker = OutputTracker::default();
        let (tx, mut rx) = tokio::sync::oneshot::channel::<()>();

        tracker.store(CompletedOutput {
            request_id: "cmd-killable".into(),
            stdout: String::new(),
            stderr: String::new(),
            exit_code: None,
            running: true,
            completed_at: Instant::now(),
        });
        tracker.register_kill_sender("cmd-killable", tx);

        // Simulate msg_task receiving KillSessionRequest
        let response = tracker.try_kill("k-1", "cmd-killable");
        match response {
            Message::KillSessionResponse(r) => assert!(r.killed),
            _ => panic!("expected KillSessionResponse"),
        }

        // In exec_task, this would trigger the tokio::select! kill branch
        assert!(rx.try_recv().is_ok());
    }

    /// exec_task step (D): after kill signal, mark_completed stores
    /// exit_code=-1 and partial output.
    #[test]
    fn exec_killed_stores_negative_exit_code() {
        let mut tracker = OutputTracker::default();
        tracker.store(CompletedOutput {
            request_id: "cmd-killed".into(),
            stdout: String::new(),
            stderr: String::new(),
            exit_code: None,
            running: true,
            completed_at: Instant::now(),
        });

        // exec_task kill branch calls mark_completed with exit_code=-1
        tracker.mark_completed(
            "cmd-killed",
            Some(-1),
            "partial stdout".into(),
            "partial stderr".into(),
        );

        let msg = tracker.build_read_output_response("r-1", "cmd-killed");
        match msg {
            Message::ReadOutputResponse(r) => {
                assert!(!r.running);
                assert_eq!(r.exit_code, Some(-1));
                assert_eq!(r.stdout, "partial stdout");
                assert_eq!(r.stderr, "partial stderr");
            }
            _ => panic!("expected ReadOutputResponse"),
        }
    }

    /// Edge case: kill after completion returns killed=false since
    /// mark_completed removes the kill sender from the HashMap.
    #[test]
    fn exec_kill_after_completion_returns_false() {
        let mut tracker = OutputTracker::default();
        let (tx, _rx) = tokio::sync::oneshot::channel::<()>();
        tracker.store(CompletedOutput {
            request_id: "cmd-done-then-kill".into(),
            stdout: String::new(),
            stderr: String::new(),
            exit_code: None,
            running: true,
            completed_at: Instant::now(),
        });
        tracker.register_kill_sender("cmd-done-then-kill", tx);

        // exec_task normal completion removes the kill sender
        tracker.mark_completed(
            "cmd-done-then-kill",
            Some(0),
            "completed output".into(),
            String::new(),
        );

        // Now try to kill — should fail because sender was removed
        let msg = tracker.try_kill("k-late", "cmd-done-then-kill");
        match msg {
            Message::KillSessionResponse(r) => {
                assert!(!r.killed);
                assert!(r.error.is_some());
            }
            _ => panic!("expected KillSessionResponse"),
        }
    }

    /// Concurrent sessions: kill one session, verify the other is unaffected.
    #[test]
    fn exec_concurrent_sessions_independent() {
        let mut tracker = OutputTracker::default();
        let (tx_a, _rx_a) = tokio::sync::oneshot::channel::<()>();
        let (tx_b, _rx_b) = tokio::sync::oneshot::channel::<()>();

        tracker.store(CompletedOutput {
            request_id: "sess-a".into(),
            stdout: String::new(),
            stderr: String::new(),
            exit_code: None,
            running: true,
            completed_at: Instant::now(),
        });
        tracker.store(CompletedOutput {
            request_id: "sess-b".into(),
            stdout: String::new(),
            stderr: String::new(),
            exit_code: None,
            running: true,
            completed_at: Instant::now(),
        });
        tracker.register_kill_sender("sess-a", tx_a);
        tracker.register_kill_sender("sess-b", tx_b);

        // Kill only session A
        let kill_msg = tracker.try_kill("k-a", "sess-a");
        match kill_msg {
            Message::KillSessionResponse(r) => assert!(r.killed),
            _ => panic!("expected KillSessionResponse"),
        }

        // Session B should still be running and killable
        let read_b = tracker.build_read_output_response("r-b", "sess-b");
        match read_b {
            Message::ReadOutputResponse(r) => assert!(r.running),
            _ => panic!("expected ReadOutputResponse"),
        }
        assert!(tracker.core.kill_senders.contains_key("sess-b"));
        assert!(!tracker.core.kill_senders.contains_key("sess-a"));
    }

    // ===================================================================
    // Helper: separate_stdout_stderr
    // ===================================================================

    #[test]
    fn separate_stdout_stderr_mixed_lines() {
        let lines = vec![
            crate::output_persistence::PersistedOutputLine {
                timestamp_ms: 1000,
                stream: "stdout".into(),
                text: "hello".into(),
            },
            crate::output_persistence::PersistedOutputLine {
                timestamp_ms: 1001,
                stream: "stderr".into(),
                text: "warning".into(),
            },
            crate::output_persistence::PersistedOutputLine {
                timestamp_ms: 1002,
                stream: "stdout".into(),
                text: "world".into(),
            },
        ];
        let (stdout, stderr) = separate_stdout_stderr(&lines);
        assert_eq!(stdout, "hello\nworld");
        assert_eq!(stderr, "warning");
    }

    #[test]
    fn separate_stdout_stderr_empty_input() {
        let lines: Vec<crate::output_persistence::PersistedOutputLine> = vec![];
        let (stdout, stderr) = separate_stdout_stderr(&lines);
        assert!(stdout.is_empty());
        assert!(stderr.is_empty());
    }
}
