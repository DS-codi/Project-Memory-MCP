use crate::cxxqt_bridge::ffi;
use cxx_qt::CxxQtType;
use cxx_qt::Threading;
use cxx_qt_lib::QString;
use std::pin::Pin;
use std::time::Duration;

impl cxx_qt::Initialize for ffi::TerminalApp {
    fn initialize(mut self: Pin<&mut Self>) {
        use crate::tcp_server::TcpServer;

        let port = *crate::SERVER_PORT.get().unwrap_or(&9100);
        let heartbeat_secs = *crate::HEARTBEAT_INTERVAL.get().unwrap_or(&5);
        let mut server = TcpServer::new(port, Duration::from_secs(heartbeat_secs));

        let outgoing_tx = server.outgoing_tx.clone();

        let (_, dummy_rx) = tokio::sync::mpsc::channel(1);
        let incoming_rx = std::mem::replace(&mut server.incoming_rx, dummy_rx);

        let event_rx = server.event_subscriber();

        {
            let state_arc = self.rust().state.clone();
            let mut state = state_arc.lock().unwrap();
            state.response_tx = Some(outgoing_tx);
            state.saved_commands_by_workspace =
                state.saved_commands_repository.load_all_workspaces();

            let initial_workspace_id = state
                .saved_commands_by_workspace
                .keys()
                .min()
                .cloned()
                .unwrap_or_else(|| "default".to_string());
            state.saved_commands_ui_workspace_id = initial_workspace_id;

            self.as_mut()
                .set_session_tabs_json(state.session_tabs_to_json());
        }

        match crate::system_tray::sync_startup_with_settings(port) {
            Ok(settings) => {
                self.as_mut()
                    .set_start_with_windows(settings.start_with_windows);
            }
            Err(error) => {
                self.as_mut().set_status_text(QString::from(&format!(
                    "Listening on port {port} (startup setting warning: {error})"
                )));
            }
        }

        self.as_mut()
            .set_status_text(QString::from(&format!("Listening on port {port}")));

        let (command_tx, command_rx) =
            tokio::sync::mpsc::channel::<crate::protocol::CommandRequest>(16);

        {
            let state_arc = self.rust().state.clone();
            let mut state = state_arc.lock().unwrap();
            state.command_tx = Some(command_tx);
        }

        let qt_thread_msg = self.qt_thread();
        let qt_thread_evt = self.qt_thread();
        let qt_thread_exec = self.qt_thread();
        let qt_thread_perf = self.qt_thread();

        let state_for_msg = self.rust().state.clone();
        let state_for_exec = self.rust().state.clone();

        super::runtime_tasks::spawn_runtime_tasks(
            server,
            incoming_rx,
            event_rx,
            command_rx,
            state_for_msg,
            state_for_exec,
            qt_thread_msg,
            qt_thread_evt,
            qt_thread_exec,
            qt_thread_perf,
        );
    }
}
