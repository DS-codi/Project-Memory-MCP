//! Tray tooltip formatting and system-tray lifecycle utilities.
//!
//! [`build_tooltip`] is a pure function – it takes service summaries and a
//! client count and returns the multi-line string that should be shown in the
//! system-tray icon tooltip.

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

/// System-tray lifecycle handle.  The Qt GUI owns the tray icon, so this
/// is a lightweight no-op wrapper used only to satisfy call sites in main.rs.
pub struct TrayLifecycle;

impl TrayLifecycle {
    pub fn install(_initial_tooltip: &str) -> Self {
        Self
    }

    pub fn update_icon_for_health_snapshot(
        &mut self,
        _snapshot: &crate::control::protocol::HealthSnapshot,
    ) {
    }

    pub fn update_tooltip_text(&mut self, _tooltip: &str) {}

    pub fn poll_action(&mut self) -> Option<TrayAction> {
        None
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