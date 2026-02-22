import QtQuick
import QtQuick.Controls
import QtQuick.Controls.Material
import QtQuick.Layouts
import Qt.labs.platform 1.1 as Platform
import com.projectmemory.supervisor

ApplicationWindow {
    id: root
    width: 720
    height: 480
    // Window starts hidden — tray icon is the entry point.
    visible: supervisorGuiBridge.windowVisible
    title: "Project Memory Supervisor"

    Material.theme: Material.Dark
    Material.accent: Material.Blue

    // Hide to tray when the user clicks the window's X button.
    onClosing: function(close) {
        close.accepted = false
        supervisorGuiBridge.hideWindow()
    }

    // Bring the window to the front once Qt has actually made it visible.
    // (Calling raise()/requestActivate() before the native window handle exists
    //  causes an access violation in Qt6Core — so we defer until here.)
    onVisibleChanged: {
        if (visible) {
            raise()
            requestActivate()
        }
    }

    /// Returns a dot colour that reflects the current service state string.
    function statusColor(s) {
        if (s === "Running")                      return "#4caf50"  // green
        if (s === "Starting" || s === "Stopping") return "#ffeb3b"  // yellow
        if (s === "Error"    || s === "Stopped")  return "#f44336"  // red
        return "#9e9e9e"                                             // grey (unknown)
    }

    SupervisorGuiBridge {
        id: supervisorGuiBridge
    }

    // ── System tray icon (Qt.labs.platform) ─────────────────────────────────
    Platform.SystemTrayIcon {
        id: trayIcon
        visible: true
        icon.source: supervisorGuiBridge.trayIconUrl
        tooltip: "Project Memory Supervisor\n" + supervisorGuiBridge.statusText

        onActivated: function(reason) {
            if (reason === Platform.SystemTrayIcon.Trigger ||
                reason === Platform.SystemTrayIcon.DoubleClick) {
                supervisorGuiBridge.showWindow()
            }
        }

        menu: Platform.Menu {
            Platform.MenuItem {
                text: "Show Supervisor"
                onTriggered: {
                    supervisorGuiBridge.showWindow()
                }
            }
            Platform.MenuSeparator {}
            Platform.MenuItem {
                text: "MCP Server — Restart"
                onTriggered: supervisorGuiBridge.restartService("mcp")
            }
            Platform.MenuItem {
                text: "Interactive Terminal — Restart"
                onTriggered: supervisorGuiBridge.restartService("terminal")
            }
            Platform.MenuItem {
                text: "Dashboard — Restart"
                onTriggered: supervisorGuiBridge.restartService("dashboard")
            }
            Platform.MenuSeparator {}
            Platform.MenuItem {
                text: "Quit Supervisor"
                // Route through the bridge so the Tokio runtime can stop all
                // child processes (Node, Vite, terminal) before we exit.
                // Never call Qt.quit() directly — it would kill the Qt event
                // loop before services are shut down.
                onTriggered: supervisorGuiBridge.quitSupervisor()
            }
        }
    }

    // ── Window content ───────────────────────────────────────────────────────
    ColumnLayout {
        anchors.fill: parent
        anchors.margins: 20
        spacing: 12

        Label {
            text: "Project Memory Supervisor"
            font.pixelSize: 22
            font.bold: true
        }

        // ── MCP row ──────────────────────────────────────────────────────────
        RowLayout {
            spacing: 10
            Layout.fillWidth: true

            Rectangle {
                width: 12; height: 12
                radius: 6
                color: root.statusColor(supervisorGuiBridge.mcpStatus)
            }
            Label {
                text: "MCP"
                font.bold: true
                Layout.minimumWidth: 160
            }
            Label {
                text: supervisorGuiBridge.mcpStatus
                Layout.fillWidth: true
            }
            Button {
                text: "Restart"
                onClicked: supervisorGuiBridge.restartService("mcp")
            }
        }

        // ── Interactive Terminal row ──────────────────────────────────────────
        RowLayout {
            spacing: 10
            Layout.fillWidth: true

            Rectangle {
                width: 12; height: 12
                radius: 6
                color: root.statusColor(supervisorGuiBridge.terminalStatus)
            }
            Label {
                text: "Interactive Terminal"
                font.bold: true
                Layout.minimumWidth: 160
            }
            Label {
                text: supervisorGuiBridge.terminalStatus
                Layout.fillWidth: true
            }
            Button {
                text: "Open"
                enabled: supervisorGuiBridge.terminalUrl !== ""
                onClicked: supervisorGuiBridge.openTerminal()
            }
            Button {
                text: "Restart"
                onClicked: supervisorGuiBridge.restartService("terminal")
            }
        }

        // ── Dashboard row ─────────────────────────────────────────────────────
        RowLayout {
            spacing: 10
            Layout.fillWidth: true

            Rectangle {
                width: 12; height: 12
                radius: 6
                color: root.statusColor(supervisorGuiBridge.dashboardStatus)
            }
            Label {
                text: "Dashboard"
                font.bold: true
                Layout.minimumWidth: 160
            }
            Label {
                text: supervisorGuiBridge.dashboardStatus
                Layout.fillWidth: true
            }
            Button {
                text: "Visit"
                enabled: supervisorGuiBridge.dashboardUrl !== ""
                onClicked: supervisorGuiBridge.openDashboard()
            }
            Button {
                text: "Restart"
                onClicked: supervisorGuiBridge.restartService("dashboard")
            }
        }

        // ── MCP proxy monitoring ────────────────────────────────────────────
        Rectangle {
            Layout.fillWidth: true
            color: "transparent"
            border.color: "#3a3a3a"
            radius: 6
            implicitHeight: monitorLayout.implicitHeight + 16

            ColumnLayout {
                id: monitorLayout
                anchors.fill: parent
                anchors.margins: 8
                spacing: 4

                Label {
                    text: "MCP Proxy Monitoring"
                    font.bold: true
                }

                Label {
                    text: "Total MCP connections: " + supervisorGuiBridge.totalMcpConnections
                }

                Label {
                    text: "Active MCP instances: " + supervisorGuiBridge.activeMcpInstances
                }

                Label {
                    visible: supervisorGuiBridge.totalMcpConnections > 0
                    text: "Distribution: " + supervisorGuiBridge.mcpInstanceDistribution
                }

                Label {
                    visible: supervisorGuiBridge.totalMcpConnections === 0
                    text: "No active MCP sessions"
                    color: "#9e9e9e"
                }
            }
        }

        Item { Layout.fillHeight: true }

        // ── Footer ────────────────────────────────────────────────────────────
        RowLayout {
            spacing: 8
            Layout.alignment: Qt.AlignRight

            Button {
                text: "Open Config"
                onClicked: supervisorGuiBridge.openConfig()
            }
            Button {
                text: "Hide to Tray"
                onClicked: supervisorGuiBridge.hideWindow()
            }
        }
    }
}
