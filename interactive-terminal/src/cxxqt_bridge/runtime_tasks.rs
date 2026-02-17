use crate::command_executor::{self, OutputLine};
use crate::cxxqt_bridge::completed_outputs::CompletedOutput;
use crate::cxxqt_bridge::terminal_profile_to_key;
use crate::cxxqt_bridge::ffi;
use crate::protocol::{
    CommandRequest, CommandResponse, Message, ResponseStatus, SavedCommandsAction,
    SavedCommandsResponse,
};
use crate::perf_monitor::PerfMonitor;
use super::AppState;
use crate::tcp_server::{ConnectionEvent, TcpServer};
use cxx_qt_lib::QString;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tokio::sync::broadcast;
use tokio::time::{sleep, Duration, Instant};

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
    std::thread::spawn(move || {
        let rt = tokio::runtime::Runtime::new().expect("Failed to create tokio runtime");
        rt.block_on(async move {
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
                                    let (send_result, tabs_json, selected_session_id) = {
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
                                        (send_result, tabs_json, selected_session_id)
                                    };

                                    let req_clone = req.clone();
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
                                            Err(error) => obj
                                                .as_mut()
                                                .set_status_text(QString::from(&error)),
                                        }
                                    });
                                    continue;
                                }

                                let (is_first, count, json, tabs_json, selected_session_id, selected_cmd) = {
                                    let mut s = state.lock().unwrap();
                                    let (is_first, count, json, selected_cmd) =
                                        s.enqueue_pending_request(req.clone());
                                    let tabs_json = s.session_tabs_to_json();
                                    let selected_session_id = s.selected_session_id.clone();
                                    (
                                        is_first,
                                        count,
                                        json,
                                        tabs_json,
                                        selected_session_id,
                                        selected_cmd,
                                    )
                                };

                                let _ = qt.queue(move |mut obj| {
                                    obj.as_mut().set_pending_count(count);
                                    obj.as_mut().set_pending_commands_json(json);
                                    obj.as_mut().set_session_tabs_json(tabs_json);
                                    obj.as_mut()
                                        .set_current_session_id(QString::from(&selected_session_id));

                                    if is_first {
                                        if let Some(cmd) = selected_cmd.as_ref() {
                                            obj.as_mut().set_command_text(QString::from(&*cmd.command));
                                            obj.as_mut().set_working_directory(QString::from(
                                                &*cmd.working_directory,
                                            ));
                                            obj.as_mut().set_context_info(QString::from(&*cmd.context));
                                            obj.as_mut()
                                                .set_current_request_id(QString::from(&*cmd.id));
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

                                    let id = QString::from(&*req.id);
                                    obj.as_mut().command_received(id);
                                });
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
                            Message::Heartbeat(_) => {}
                            Message::ReadOutputRequest(req) => {
                                let response = {
                                    let s = state.lock().unwrap();
                                    s.output_tracker.build_read_output_response(&req.id, &req.session_id)
                                };
                                {
                                    let s = state.lock().unwrap();
                                    s.send_response(response);
                                }
                            }
                            Message::KillSessionRequest(req) => {
                                let response = {
                                    let mut s = state.lock().unwrap();
                                    s.output_tracker.try_kill(&req.id, &req.session_id)
                                };
                                {
                                    let s = state.lock().unwrap();
                                    s.send_response(response);
                                }
                            }
                            _ => {}
                        }
                    }
                }
            };

            // Shared flag so the idle-timeout task can observe connection state.
            let idle_connected = Arc::new(AtomicBool::new(false));

            let evt_task = {
                let qt = qt_thread_evt;
                let idle_connected = idle_connected.clone();
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
                async move {
                    let mut cmd_rx = command_rx;
                    while let Some(req) = cmd_rx.recv().await {
                        let (output_tx, mut output_rx) = tokio::sync::mpsc::channel::<OutputLine>(64);

                        // --- OutputTracker: register running entry and kill channel ---
                        let (kill_tx, kill_rx) = tokio::sync::oneshot::channel::<()>();
                        {
                            let mut s = state.lock().unwrap();
                            s.output_tracker.store(CompletedOutput {
                                request_id: req.id.clone(),
                                stdout: String::new(),
                                stderr: String::new(),
                                exit_code: None,
                                running: true,
                                completed_at: tokio::time::Instant::now(),
                            });
                            s.output_tracker.register_kill_sender(&req.id, kill_tx);
                        }

                        // Shared buffers for accumulating output to store in the tracker.
                        let stdout_buf = Arc::new(Mutex::new(String::new()));
                        let stderr_buf = Arc::new(Mutex::new(String::new()));

                        let qt_output = qt.clone();
                        let stdout_buf_fwd = stdout_buf.clone();
                        let stderr_buf_fwd = stderr_buf.clone();
                        let output_forward = tokio::spawn(async move {
                            while let Some(line) = output_rx.recv().await {
                                let text = match &line {
                                    OutputLine::Stdout(l) => {
                                        {
                                            let mut buf = stdout_buf_fwd.lock().unwrap();
                                            if !buf.is_empty() {
                                                buf.push('\n');
                                            }
                                            buf.push_str(l);
                                        }
                                        l.clone()
                                    }
                                    OutputLine::Stderr(l) => {
                                        {
                                            let mut buf = stderr_buf_fwd.lock().unwrap();
                                            if !buf.is_empty() {
                                                buf.push('\n');
                                            }
                                            buf.push_str(l);
                                        }
                                        format!("[stderr] {l}")
                                    }
                                };
                                let _ = qt_output.queue(move |mut obj| {
                                    let cur = obj.as_ref().output_text().to_string();
                                    let new_text = if cur.is_empty() {
                                        text
                                    } else {
                                        format!("{cur}\n{text}")
                                    };
                                    obj.as_mut().set_output_text(QString::from(&new_text));
                                    let line_q = QString::from(&new_text);
                                    obj.as_mut().output_line_received(line_q);
                                });
                            }
                        });

                        // Race execution against the kill signal.
                        let req_id_for_kill = req.id.clone();
                        let result = tokio::select! {
                            res = command_executor::execute_command_with_timeout(&req, output_tx) => Some(res),
                            _ = kill_rx => {
                                // Kill signal received — log and treat as killed.
                                eprintln!("Kill signal received for request {req_id_for_kill}");
                                None
                            }
                        };

                        let _ = output_forward.await;

                        // Collect accumulated output.
                        let final_stdout = stdout_buf.lock().unwrap().clone();
                        let final_stderr = stderr_buf.lock().unwrap().clone();

                        match result {
                            Some(Ok(exec_result)) => {
                                // --- OutputTracker: mark completed ---
                                {
                                    let mut s = state.lock().unwrap();
                                    s.output_tracker.mark_completed(
                                        &exec_result.request_id,
                                        exec_result.exit_code,
                                        final_stdout,
                                        final_stderr,
                                    );
                                }

                                let response = Message::CommandResponse(CommandResponse {
                                    id: exec_result.request_id.clone(),
                                    status: ResponseStatus::Approved,
                                    output: Some(exec_result.output),
                                    exit_code: exec_result.exit_code,
                                    reason: None,
                                    output_file_path: None,
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
                            Some(Err(err)) => {
                                // --- OutputTracker: mark completed with error ---
                                {
                                    let mut s = state.lock().unwrap();
                                    s.output_tracker.mark_completed(
                                        &req.id,
                                        Some(-1),
                                        final_stdout,
                                        final_stderr,
                                    );
                                }

                                let response = Message::CommandResponse(CommandResponse {
                                    id: req.id.clone(),
                                    status: ResponseStatus::Approved,
                                    output: Some(err.clone()),
                                    exit_code: Some(-1),
                                    reason: None,
                                    output_file_path: None,
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
                            None => {
                                // Killed by remote signal.
                                {
                                    let mut s = state.lock().unwrap();
                                    s.output_tracker.mark_completed(
                                        &req.id,
                                        Some(-9),
                                        final_stdout,
                                        final_stderr,
                                    );
                                }

                                let response = Message::CommandResponse(CommandResponse {
                                    id: req.id.clone(),
                                    status: ResponseStatus::Approved,
                                    output: Some("Process killed by remote request".to_string()),
                                    exit_code: Some(-9),
                                    reason: None,
                                    output_file_path: None,
                                });

                                {
                                    let s = state.lock().unwrap();
                                    s.send_response(response);
                                }

                                let id_str = req.id.clone();
                                let _ = qt.queue(move |mut obj| {
                                    obj.as_mut()
                                        .set_status_text(QString::from("Process killed by remote request"));
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
                        } else {
                            // No client, no pending commands.
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
