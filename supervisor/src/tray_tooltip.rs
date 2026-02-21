//! Tray tooltip formatting and system-tray lifecycle utilities.
//!
//! [`build_tooltip`] is a pure function – it takes service summaries and a
//! client count and returns the multi-line string that should be shown in the
//! system-tray icon tooltip.

#[cfg(all(windows, not(feature = "supervisor_qml_gui")))]
use std::os::windows::ffi::OsStrExt;

pub struct ServiceSummary {
    pub name: String,
    pub state: String,
    pub backend: Option<String>,
    pub endpoint: Option<String>,
}

pub fn build_tooltip(services: &[ServiceSummary], client_count: usize) -> String {
    let mut lines: Vec<String> = services.iter().map(format_service_line).collect();

    let client_line = match client_count {
        1 => "Client: 1 attached".to_owned(),
        n => format!("Clients: {} attached", n),
    };
    lines.push(client_line);

    lines.join("\n")
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TrayComponent {
    Mcp,
    InteractiveTerminal,
    Dashboard,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TrayComponentAction {
    Launch,
    Restart,
    Shutdown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TrayAction {
    ShowSupervisorGui,
    HideSupervisorGui,
    QuitSupervisor,
    Component {
        component: TrayComponent,
        action: TrayComponentAction,
    },
}

#[cfg(all(windows, not(feature = "supervisor_qml_gui")))]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum TrayHealthBucket {
    Healthy,
    Degraded,
    ErrorOffline,
    Unknown,
}

#[cfg(all(windows, not(feature = "supervisor_qml_gui")))]
#[derive(Debug, Clone)]
enum TrayCommand {
    UpdateTooltip(String),
    UpdateIcon(TrayHealthBucket),
    Shutdown,
}

#[cfg(all(windows, not(feature = "supervisor_qml_gui")))]
const CALLBACK_MSG: u32 = 0x8000 + 42;
#[cfg(all(windows, not(feature = "supervisor_qml_gui")))]
const ACTION_SHOW_GUI: usize = 1_001;
#[cfg(all(windows, not(feature = "supervisor_qml_gui")))]
const ACTION_HIDE_GUI: usize = 1_002;
#[cfg(all(windows, not(feature = "supervisor_qml_gui")))]
const ACTION_QUIT: usize = 1_003;
#[cfg(all(windows, not(feature = "supervisor_qml_gui")))]
const ACTION_BASE_MCP: usize = 2_000;
#[cfg(all(windows, not(feature = "supervisor_qml_gui")))]
const ACTION_MCP_RESTART: usize = 2_001;
#[cfg(all(windows, not(feature = "supervisor_qml_gui")))]
const ACTION_MCP_SHUTDOWN: usize = 2_002;
#[cfg(all(windows, not(feature = "supervisor_qml_gui")))]
const ACTION_BASE_TERMINAL: usize = 2_010;
#[cfg(all(windows, not(feature = "supervisor_qml_gui")))]
const ACTION_TERMINAL_RESTART: usize = 2_011;
#[cfg(all(windows, not(feature = "supervisor_qml_gui")))]
const ACTION_TERMINAL_SHUTDOWN: usize = 2_012;
#[cfg(all(windows, not(feature = "supervisor_qml_gui")))]
const ACTION_BASE_DASHBOARD: usize = 2_020;
#[cfg(all(windows, not(feature = "supervisor_qml_gui")))]
const ACTION_DASHBOARD_RESTART: usize = 2_021;
#[cfg(all(windows, not(feature = "supervisor_qml_gui")))]
const ACTION_DASHBOARD_SHUTDOWN: usize = 2_022;

#[cfg(all(windows, not(feature = "supervisor_qml_gui")))]
pub struct TrayLifecycle {
    command_tx: std::sync::mpsc::Sender<TrayCommand>,
    action_rx: std::sync::mpsc::Receiver<TrayAction>,
}

#[cfg(any(not(windows), feature = "supervisor_qml_gui"))]
pub struct TrayLifecycle;

impl TrayLifecycle {
    #[cfg(all(windows, not(feature = "supervisor_qml_gui")))]
    pub fn install(initial_tooltip: &str) -> Self {
        let (command_tx, command_rx) = std::sync::mpsc::channel::<TrayCommand>();
        let (action_tx, action_rx) = std::sync::mpsc::channel::<TrayAction>();
        let initial = initial_tooltip.to_owned();

        std::thread::spawn(move || {
            run_tray_message_loop(initial, command_rx, action_tx);
        });

        Self {
            command_tx,
            action_rx,
        }
    }

    #[cfg(any(not(windows), feature = "supervisor_qml_gui"))]
    pub fn install(_initial_tooltip: &str) -> Self {
        Self
    }

    #[cfg(all(windows, not(feature = "supervisor_qml_gui")))]
    pub fn update_icon_for_health_snapshot(
        &mut self,
        snapshot: &crate::control::protocol::HealthSnapshot,
    ) {
        let bucket = map_snapshot_to_bucket(snapshot);
        let _ = self.command_tx.send(TrayCommand::UpdateIcon(bucket));
    }

    #[cfg(any(not(windows), feature = "supervisor_qml_gui"))]
    pub fn update_icon_for_health_snapshot(
        &mut self,
        _snapshot: &crate::control::protocol::HealthSnapshot,
    ) {
    }

    #[cfg(all(windows, not(feature = "supervisor_qml_gui")))]
    pub fn update_tooltip_text(&mut self, tooltip: &str) {
        let _ = self
            .command_tx
            .send(TrayCommand::UpdateTooltip(tooltip.to_owned()));
    }

    #[cfg(any(not(windows), feature = "supervisor_qml_gui"))]
    pub fn update_tooltip_text(&mut self, _tooltip: &str) {}

    #[cfg(all(windows, not(feature = "supervisor_qml_gui")))]
    pub fn poll_action(&mut self) -> Option<TrayAction> {
        self.action_rx.try_recv().ok()
    }

    #[cfg(any(not(windows), feature = "supervisor_qml_gui"))]
    pub fn poll_action(&mut self) -> Option<TrayAction> {
        None
    }
}

#[cfg(all(windows, not(feature = "supervisor_qml_gui")))]
impl Drop for TrayLifecycle {
    fn drop(&mut self) {
        let _ = self.command_tx.send(TrayCommand::Shutdown);
    }
}

fn format_service_line(svc: &ServiceSummary) -> String {
    match (&svc.backend, &svc.endpoint) {
        (Some(b), Some(e)) => format!("{}: {} ({}) @ {}", svc.name, svc.state, b, e),
        (Some(b), None) => format!("{}: {} ({})", svc.name, svc.state, b),
        (None, Some(e)) => format!("{}: {} @ {}", svc.name, svc.state, e),
        (None, None) => format!("{}: {}", svc.name, svc.state),
    }
}

#[cfg(all(windows, not(feature = "supervisor_qml_gui")))]
fn map_snapshot_to_bucket(snapshot: &crate::control::protocol::HealthSnapshot) -> TrayHealthBucket {
    let has_error = snapshot.children.iter().any(|child| child.last_health_error.is_some())
        || snapshot.connection.last_error.is_some();
    if has_error {
        return TrayHealthBucket::ErrorOffline;
    }

    match snapshot.connection.state.as_str() {
        "connected" => TrayHealthBucket::Healthy,
        "reconnecting" => TrayHealthBucket::Degraded,
        "disconnected" => TrayHealthBucket::ErrorOffline,
        _ => {
            let any_transitioning = snapshot
                .children
                .iter()
                .any(|child| child.status == "starting" || child.status == "stopping");
            if any_transitioning {
                TrayHealthBucket::Degraded
            } else {
                TrayHealthBucket::Unknown
            }
        }
    }
}

#[cfg(all(windows, not(feature = "supervisor_qml_gui")))]
fn run_tray_message_loop(
    initial_tooltip: String,
    command_rx: std::sync::mpsc::Receiver<TrayCommand>,
    action_tx: std::sync::mpsc::Sender<TrayAction>,
) {
    use windows_sys::Win32::Foundation::{HWND, POINT};
    use windows_sys::Win32::UI::Shell::{
        NIF_ICON, NIF_MESSAGE, NIF_TIP, NIM_ADD, NIM_DELETE, NIM_MODIFY, NOTIFYICONDATAW,
        Shell_NotifyIconW,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        AppendMenuW, CreatePopupMenu, CreateWindowExW, DefWindowProcW, DestroyMenu, DispatchMessageW,
        GetCursorPos, IDI_APPLICATION, LoadIconW, MF_SEPARATOR, MSG,
        PM_REMOVE, PeekMessageW, PostMessageW, RegisterClassW, SetForegroundWindow, TPM_NONOTIFY,
        TPM_RETURNCMD, TrackPopupMenu, TranslateMessage, WINDOW_EX_STYLE, WM_CONTEXTMENU,
        WM_NULL, WM_RBUTTONUP, WNDCLASSW, WS_POPUP,
    };

    let class_name = wide_string("ProjectMemorySupervisorTray");
    let window_name = wide_string("ProjectMemorySupervisorTrayWindow");

    let wnd = WNDCLASSW {
        lpfnWndProc: Some(DefWindowProcW),
        lpszClassName: class_name.as_ptr(),
        ..unsafe { std::mem::zeroed() }
    };

    unsafe {
        RegisterClassW(&wnd);
    }

    let hwnd: HWND = unsafe {
        CreateWindowExW(
            0 as WINDOW_EX_STYLE,
            class_name.as_ptr(),
            window_name.as_ptr(),
            WS_POPUP,
            0,
            0,
            0,
            0,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            std::ptr::null_mut(),
        )
    };

    if hwnd.is_null() {
        return;
    }

    let mut nid: NOTIFYICONDATAW = unsafe { std::mem::zeroed() };
    nid.cbSize = std::mem::size_of::<NOTIFYICONDATAW>() as u32;
    nid.hWnd = hwnd;
    nid.uID = 1;
    nid.uFlags = NIF_ICON | NIF_TIP | NIF_MESSAGE;
    nid.uCallbackMessage = CALLBACK_MSG;
    nid.hIcon = unsafe { LoadIconW(std::ptr::null_mut(), IDI_APPLICATION) };
    set_nid_tip(&mut nid, &initial_tooltip);

    unsafe {
        let _ = Shell_NotifyIconW(NIM_ADD, &nid as *const _);
    }

    let mut current_bucket: Option<TrayHealthBucket> = None;
    let mut running = true;

    while running {
        while let Ok(command) = command_rx.try_recv() {
            match command {
                TrayCommand::UpdateTooltip(text) => {
                    set_nid_tip(&mut nid, &text);
                    nid.uFlags = NIF_TIP;
                    unsafe {
                        let _ = Shell_NotifyIconW(NIM_MODIFY, &nid as *const _);
                    }
                }
                TrayCommand::UpdateIcon(bucket) => {
                    if current_bucket == Some(bucket) {
                        continue;
                    }

                    let primary_icon = match bucket {
                        TrayHealthBucket::Healthy => Some("supervisor_green.ico"),
                        TrayHealthBucket::Degraded => Some("supervisor_blue.ico"),
                        TrayHealthBucket::ErrorOffline => Some("supervisor_red.ico"),
                        TrayHealthBucket::Unknown => None,
                    };

                    let loaded_icon = primary_icon
                        .and_then(try_load_icon_by_name)
                        .or_else(|| try_load_icon_by_name("supervisor_purple.ico"));

                    if let Some(icon) = loaded_icon {
                        nid.hIcon = icon;
                        nid.uFlags = NIF_ICON;
                        unsafe {
                            let _ = Shell_NotifyIconW(NIM_MODIFY, &nid as *const _);
                        }
                        current_bucket = Some(bucket);
                    }
                }
                TrayCommand::Shutdown => {
                    running = false;
                }
            }
        }

        let mut msg: MSG = unsafe { std::mem::zeroed() };
        loop {
            let has_message = unsafe {
                PeekMessageW(&mut msg, std::ptr::null_mut(), 0, 0, PM_REMOVE) != 0
            };
            if !has_message {
                break;
            }

            if msg.message == CALLBACK_MSG {
                let callback = msg.lParam as u32;
                if callback == WM_RBUTTONUP || callback == WM_CONTEXTMENU {
                    let menu = unsafe { CreatePopupMenu() };
                    if !menu.is_null() {
                        append_menu_text(menu, ACTION_SHOW_GUI, "Show Supervisor GUI");
                        append_menu_text(menu, ACTION_HIDE_GUI, "Hide Supervisor GUI");
                        append_menu_text(menu, ACTION_QUIT, "Quit Supervisor");
                        unsafe {
                            AppendMenuW(menu, MF_SEPARATOR, 0, std::ptr::null());
                        }

                        let mcp_menu = unsafe { CreatePopupMenu() };
                        append_menu_text(mcp_menu, ACTION_BASE_MCP, "Launch");
                        append_menu_text(mcp_menu, ACTION_MCP_RESTART, "Restart");
                        append_menu_text(mcp_menu, ACTION_MCP_SHUTDOWN, "Shutdown");
                        append_submenu(menu, mcp_menu, "MCP");

                        let terminal_menu = unsafe { CreatePopupMenu() };
                        append_menu_text(terminal_menu, ACTION_BASE_TERMINAL, "Launch");
                        append_menu_text(terminal_menu, ACTION_TERMINAL_RESTART, "Restart");
                        append_menu_text(terminal_menu, ACTION_TERMINAL_SHUTDOWN, "Shutdown");
                        append_submenu(menu, terminal_menu, "Interactive Terminal");

                        let dashboard_menu = unsafe { CreatePopupMenu() };
                        append_menu_text(dashboard_menu, ACTION_BASE_DASHBOARD, "Launch");
                        append_menu_text(dashboard_menu, ACTION_DASHBOARD_RESTART, "Restart");
                        append_menu_text(dashboard_menu, ACTION_DASHBOARD_SHUTDOWN, "Shutdown");
                        append_submenu(menu, dashboard_menu, "Dashboard");

                        let mut point = POINT { x: 0, y: 0 };
                        unsafe {
                            let _ = GetCursorPos(&mut point as *mut POINT);
                            let _ = SetForegroundWindow(hwnd);
                        }

                        let selected = unsafe {
                            TrackPopupMenu(
                                menu,
                                TPM_RETURNCMD | TPM_NONOTIFY,
                                point.x,
                                point.y,
                                0,
                                hwnd,
                                std::ptr::null(),
                            )
                        } as usize;

                        if let Some(action) = map_menu_id_to_action(selected) {
                            let _ = action_tx.send(action);
                        }

                        unsafe {
                            // Required so the hidden helper window properly
                            // relinquishes foreground status; without this,
                            // SetForegroundWindow silently fails on every
                            // subsequent right-click and the menu never shows.
                            PostMessageW(hwnd, WM_NULL, 0, 0);
                            DestroyMenu(menu);
                        }
                    }
                }
            }

            unsafe {
                TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
        }

        std::thread::sleep(std::time::Duration::from_millis(30));
    }

    unsafe {
        let _ = Shell_NotifyIconW(NIM_DELETE, &nid as *const _);
    }
}

#[cfg(all(windows, not(feature = "supervisor_qml_gui")))]
fn append_menu_text(menu: *mut core::ffi::c_void, id: usize, text: &str) {
    use windows_sys::Win32::UI::WindowsAndMessaging::{AppendMenuW, MF_STRING};
    let text_w = wide_string(text);
    unsafe {
        AppendMenuW(menu, MF_STRING, id, text_w.as_ptr());
    }
}

#[cfg(all(windows, not(feature = "supervisor_qml_gui")))]
fn append_submenu(menu: *mut core::ffi::c_void, submenu: *mut core::ffi::c_void, text: &str) {
    use windows_sys::Win32::UI::WindowsAndMessaging::{AppendMenuW, MF_POPUP};
    let text_w = wide_string(text);
    unsafe {
        AppendMenuW(menu, MF_POPUP, submenu as usize, text_w.as_ptr());
    }
}

#[cfg(all(windows, not(feature = "supervisor_qml_gui")))]
fn map_menu_id_to_action(menu_id: usize) -> Option<TrayAction> {
    match menu_id {
        ACTION_SHOW_GUI => Some(TrayAction::ShowSupervisorGui),
        ACTION_HIDE_GUI => Some(TrayAction::HideSupervisorGui),
        ACTION_QUIT => Some(TrayAction::QuitSupervisor),
        ACTION_BASE_MCP => Some(TrayAction::Component {
            component: TrayComponent::Mcp,
            action: TrayComponentAction::Launch,
        }),
        ACTION_MCP_RESTART => Some(TrayAction::Component {
            component: TrayComponent::Mcp,
            action: TrayComponentAction::Restart,
        }),
        ACTION_MCP_SHUTDOWN => Some(TrayAction::Component {
            component: TrayComponent::Mcp,
            action: TrayComponentAction::Shutdown,
        }),
        ACTION_BASE_TERMINAL => Some(TrayAction::Component {
            component: TrayComponent::InteractiveTerminal,
            action: TrayComponentAction::Launch,
        }),
        ACTION_TERMINAL_RESTART => Some(TrayAction::Component {
            component: TrayComponent::InteractiveTerminal,
            action: TrayComponentAction::Restart,
        }),
        ACTION_TERMINAL_SHUTDOWN => Some(TrayAction::Component {
            component: TrayComponent::InteractiveTerminal,
            action: TrayComponentAction::Shutdown,
        }),
        ACTION_BASE_DASHBOARD => Some(TrayAction::Component {
            component: TrayComponent::Dashboard,
            action: TrayComponentAction::Launch,
        }),
        ACTION_DASHBOARD_RESTART => Some(TrayAction::Component {
            component: TrayComponent::Dashboard,
            action: TrayComponentAction::Restart,
        }),
        ACTION_DASHBOARD_SHUTDOWN => Some(TrayAction::Component {
            component: TrayComponent::Dashboard,
            action: TrayComponentAction::Shutdown,
        }),
        _ => None,
    }
}

#[cfg(all(windows, not(feature = "supervisor_qml_gui")))]
fn set_nid_tip(nid: &mut windows_sys::Win32::UI::Shell::NOTIFYICONDATAW, text: &str) {
    nid.szTip.fill(0);
    let mut tip_utf16: Vec<u16> = text.encode_utf16().collect();
    tip_utf16.truncate(nid.szTip.len().saturating_sub(1));
    for (index, code_unit) in tip_utf16.into_iter().enumerate() {
        nid.szTip[index] = code_unit;
    }
}

#[cfg(all(windows, not(feature = "supervisor_qml_gui")))]
fn wide_string(value: &str) -> Vec<u16> {
    std::ffi::OsStr::new(value)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect()
}

#[cfg(all(windows, not(feature = "supervisor_qml_gui")))]
fn try_load_icon_by_name(file_name: &str) -> Option<*mut core::ffi::c_void> {
    icon_candidates(file_name)
        .into_iter()
        .find_map(|candidate| load_icon_from_file(&candidate))
}

#[cfg(all(windows, not(feature = "supervisor_qml_gui")))]
fn icon_candidates(file_name: &str) -> Vec<std::path::PathBuf> {
    vec![
        std::path::PathBuf::from("supervisor")
            .join("assets")
            .join("icons")
            .join(file_name),
        std::path::PathBuf::from("assets").join("icons").join(file_name),
        std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("assets")
            .join("icons")
            .join(file_name),
    ]
}

#[cfg(all(windows, not(feature = "supervisor_qml_gui")))]
fn load_icon_from_file(path: &std::path::Path) -> Option<*mut core::ffi::c_void> {
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        IMAGE_ICON, LR_DEFAULTSIZE, LR_LOADFROMFILE, LoadImageW,
    };

    let mut path_utf16: Vec<u16> = path.as_os_str().encode_wide().collect();
    path_utf16.push(0);

    let handle = unsafe {
        LoadImageW(
            std::ptr::null_mut(),
            path_utf16.as_ptr(),
            IMAGE_ICON,
            0,
            0,
            LR_LOADFROMFILE | LR_DEFAULTSIZE,
        )
    };

    if handle.is_null() {
        None
    } else {
        Some(handle)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn svc(name: &str, state: &str, backend: Option<&str>, endpoint: Option<&str>) -> ServiceSummary {
        ServiceSummary {
            name: name.to_owned(),
            state: state.to_owned(),
            backend: backend.map(str::to_owned),
            endpoint: endpoint.map(str::to_owned),
        }
    }

    #[test]
    fn format_backend_and_endpoint() {
        let services = [svc("MCP", "Connected", Some("node"), Some("tcp://localhost:3000"))];
        let tt = build_tooltip(&services, 2);
        let lines: Vec<&str> = tt.lines().collect();
        assert_eq!(lines[0], "MCP: Connected (node) @ tcp://localhost:3000");
    }

    #[test]
    fn format_backend_only() {
        let services = [svc("MCP", "Connected", Some("container"), None)];
        let tt = build_tooltip(&services, 0);
        let lines: Vec<&str> = tt.lines().collect();
        assert_eq!(lines[0], "MCP: Connected (container)");
    }

    #[test]
    fn format_endpoint_only() {
        let services = [svc("Terminal", "Connected", None, Some("tcp://localhost:4000"))];
        let tt = build_tooltip(&services, 0);
        let lines: Vec<&str> = tt.lines().collect();
        assert_eq!(lines[0], "Terminal: Connected @ tcp://localhost:4000");
    }

    #[test]
    fn format_neither_backend_nor_endpoint() {
        let services = [svc("Dashboard", "Disconnected", None, None)];
        let tt = build_tooltip(&services, 0);
        let lines: Vec<&str> = tt.lines().collect();
        assert_eq!(lines[0], "Dashboard: Disconnected");
    }

    #[test]
    fn pluralisation_zero_clients() {
        let services = [svc("MCP", "Connected", None, None)];
        let tt = build_tooltip(&services, 0);
        assert!(tt.ends_with("Clients: 0 attached"), "got: {tt}");
    }

    #[test]
    fn pluralisation_one_client() {
        let services = [svc("MCP", "Connected", None, None)];
        let tt = build_tooltip(&services, 1);
        assert!(tt.ends_with("Client: 1 attached"), "got: {tt}");
    }

    #[test]
    fn pluralisation_many_clients() {
        let services = [svc("MCP", "Connected", None, None)];
        let tt = build_tooltip(&services, 5);
        assert!(tt.ends_with("Clients: 5 attached"), "got: {tt}");
    }

    #[test]
    fn multiple_services_line_count() {
        let services = [
            svc("MCP", "Connected", Some("node"), Some("tcp://localhost:3000")),
            svc("Terminal", "Connected", None, None),
            svc("Dashboard", "Disconnected", None, None),
        ];
        let tt = build_tooltip(&services, 2);
        let lines: Vec<&str> = tt.lines().collect();
        assert_eq!(lines.len(), 4);
        assert_eq!(lines[0], "MCP: Connected (node) @ tcp://localhost:3000");
        assert_eq!(lines[1], "Terminal: Connected");
        assert_eq!(lines[2], "Dashboard: Disconnected");
        assert_eq!(lines[3], "Clients: 2 attached");
    }

    #[test]
    fn example_from_spec() {
        let services = [
            svc("MCP", "Connected", Some("node"), Some("tcp://localhost:3000")),
            svc("Terminal", "Connected", None, None),
            svc("Dashboard", "Disconnected", None, None),
        ];
        let tt = build_tooltip(&services, 2);
        let expected = "MCP: Connected (node) @ tcp://localhost:3000\nTerminal: Connected\nDashboard: Disconnected\nClients: 2 attached";
        assert_eq!(tt, expected);
    }
}
