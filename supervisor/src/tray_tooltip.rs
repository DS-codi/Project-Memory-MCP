//! Tray tooltip formatting for the supervisor status indicator.
//!
//! [`build_tooltip`] is a pure function – it takes service summaries and a
//! client count and returns the multi-line string that should be shown in the
//! system-tray icon tooltip.

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/// A lightweight summary of one managed service used by the tooltip renderer.
pub struct ServiceSummary {
    /// Display name, e.g. `"MCP"`, `"Terminal"`, `"Dashboard"`.
    pub name: String,
    /// Human-readable connection state, e.g. `"Connected"`, `"Reconnecting"`,
    /// `"Disconnected"`.
    pub state: String,
    /// Active backend identifier, e.g. `Some("node")` or `Some("container")`.
    /// `None` when the backend is not applicable or not yet known.
    pub backend: Option<String>,
    /// Service endpoint, e.g. `Some("tcp://localhost:3000")`.
    /// `None` when the endpoint is not applicable or not yet known.
    pub endpoint: Option<String>,
}

// ---------------------------------------------------------------------------
// Tooltip builder
// ---------------------------------------------------------------------------

/// Format the supervisor status into a tray-tooltip string.
///
/// Each service produces one line according to the rules below, followed by a
/// final "Clients" line.
///
/// | `backend` | `endpoint` | Line format |
/// |-----------|------------|-------------|
/// | Some      | Some       | `"{name}: {state} ({backend}) @ {endpoint}"` |
/// | Some      | None       | `"{name}: {state} ({backend})"` |
/// | None      | Some       | `"{name}: {state} @ {endpoint}"` |
/// | None      | None       | `"{name}: {state}"` |
///
/// Final line: `"Clients: N attached"` (or `"Client: 1 attached"` when
/// `client_count == 1`).
///
/// Lines are joined with `'\n'`.
pub fn build_tooltip(services: &[ServiceSummary], client_count: usize) -> String {
    let mut lines: Vec<String> = services.iter().map(format_service_line).collect();

    let client_line = match client_count {
        1 => "Client: 1 attached".to_owned(),
        n => format!("Clients: {} attached", n),
    };
    lines.push(client_line);

    lines.join("\n")
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

fn format_service_line(svc: &ServiceSummary) -> String {
    match (&svc.backend, &svc.endpoint) {
        (Some(b), Some(e)) => format!("{}: {} ({}) @ {}", svc.name, svc.state, b, e),
        (Some(b), None) => format!("{}: {} ({})", svc.name, svc.state, b),
        (None, Some(e)) => format!("{}: {} @ {}", svc.name, svc.state, e),
        (None, None) => format!("{}: {}", svc.name, svc.state),
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

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

    // -----------------------------------------------------------------------
    // Single-service format variants
    // -----------------------------------------------------------------------

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

    // -----------------------------------------------------------------------
    // Client count pluralisation
    // -----------------------------------------------------------------------

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

    // -----------------------------------------------------------------------
    // Multiple services produce the correct line count
    // -----------------------------------------------------------------------

    #[test]
    fn multiple_services_line_count() {
        let services = [
            svc("MCP", "Connected", Some("node"), Some("tcp://localhost:3000")),
            svc("Terminal", "Connected", None, None),
            svc("Dashboard", "Disconnected", None, None),
        ];
        let tt = build_tooltip(&services, 2);
        let lines: Vec<&str> = tt.lines().collect();
        // 3 service lines + 1 client line
        assert_eq!(lines.len(), 4);
        assert_eq!(lines[0], "MCP: Connected (node) @ tcp://localhost:3000");
        assert_eq!(lines[1], "Terminal: Connected");
        assert_eq!(lines[2], "Dashboard: Disconnected");
        assert_eq!(lines[3], "Clients: 2 attached");
    }

    #[test]
    fn example_from_spec() {
        // Reproduces the exact example in the spec.
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
