import QtQuick 2.15
import QtQuick.Controls 2.15
import QtQuick.Controls.Material 2.15
import QtQuick.Layouts 1.15
import Qt.labs.platform 1.1 as Platform
import com.projectmemory.supervisor

pragma ComponentBehavior: Bound

ApplicationWindow {
    id: root
    width: 1080
    height: 960
    // Window starts hidden — tray icon is the entry point.
    visible: supervisorGuiBridge.windowVisible
    minimumWidth: 640
    minimumHeight: 620
    title: "Project Memory Supervisor"

    // Animate width changes so the window expands in sync with
    // ChatbotPanel / PlansPanel's 200 ms implicitWidth animation.
    // User-initiated resize drags bypass QML Behavior and are unaffected.
    Behavior on width { NumberAnimation { duration: 200; easing.type: Easing.OutCubic } }

    Material.theme: Material.Dark
    Material.accent: Material.Blue

    // ── Theme palette ────────────────────────────────────────────────────────
    readonly property color bgWindow:      "#0f1319"
    readonly property color bgPanel:       "#161b22"
    readonly property color bgCard:        "#1c2128"
    readonly property color bgTerminal:    "#0d1117"
    readonly property color borderSubtle:  "#30363d"
    readonly property color textPrimary:   "#c9d1d9"
    readonly property color textSecondary: "#8b949e"
    readonly property color textAccent:    "#58a6ff"
    readonly property color clrRunning:    "#3fb950"
    readonly property color clrStopped:    "#f85149"
    readonly property color clrYellow:     "#ffeb3b"
    color: root.bgWindow

    // Hide to tray when the user clicks the window's X button.
    onClosing: function(close) {
        close.accepted = false
        supervisorGuiBridge.hideWindow()
    }

    // Bring the window to the front once Qt has actually made it visible.
    // We use Qt.callLater() to defer until after the current binding
    // evaluation completes and Qt has a chance to create the native handle.
    // Calling raise()/requestActivate() synchronously inside onVisibleChanged
    // can fire before the HWND exists, causing an access violation in Qt6Core.
    onVisibleChanged: {
        if (visible) {
            Qt.callLater(function() { raise(); requestActivate() })
        }
    }

    // Auto-widen the window when the AI panel expands; restore when collapsed.
    Connections {
        target: chatPanel
        function onExpandedChanged() {
            if (chatPanel.expanded)
                root.width += 380
            else
                root.width = Math.max(640, root.width - 380)
        }
    }

    // Auto-widen the window when the Plans panel expands.
    Connections {
        target: plansPanel
        function onExpandedChanged() {
            var delta = plansPanel.expandedPanelWidth - 44
            if (plansPanel.expanded)
                root.width += delta
            else
                root.width = Math.max(640, root.width - delta)
        }
    }

    /// Returns a dot colour that reflects the current service state string.
    function statusColor(s) {
        if (s === "Running")                      return root.clrRunning
        if (s === "Starting" || s === "Stopping") return root.clrYellow
        if (s === "Error"    || s === "Stopped")  return root.clrStopped
        return "#9e9e9e"
    }

    SupervisorGuiBridge {
        id: supervisorGuiBridge
    }

    // ── Base URLs (passed to child panels) ────────────────────────────────────
    property string mcpBaseUrl:  "http://127.0.0.1:" + supervisorGuiBridge.mcpPort
    property string dashBaseUrl: "http://127.0.0.1:" + supervisorGuiBridge.dashboardPort

    // ── System tray icon (Qt.labs.platform) ─────────────────────────────────
    Platform.SystemTrayIcon {
        id: trayIcon
        visible: !supervisorGuiBridge.quitting
        icon.source: supervisorGuiBridge.trayIconUrl
        tooltip: "Project Memory Supervisor\n" + supervisorGuiBridge.statusText
            + (supervisorGuiBridge.eventBroadcastEnabled
                ? "\nEvents: [on] " + supervisorGuiBridge.eventsTotalEmitted + " relayed"
                : "\nEvents: [off]")

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
            Platform.MenuItem {
                text: "Fallback API — Restart"
                onTriggered: supervisorGuiBridge.restartService("fallback_api")
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
            Platform.MenuSeparator {}
            Platform.MenuItem {
                text: "Show Pairing QR"
                onTriggered: pairingDialog.open()
            }
        }
    }

    // ── Shutdown confirmation dialog ─────────────────────────────────────────
    Dialog {
        id: shutdownDialog
        parent: Overlay.overlay
        anchors.centerIn: parent
        title: "Shut Down Supervisor?"
        modal: true
        standardButtons: Dialog.NoButton
        background: Rectangle { color: "#1c2128"; border.color: "#f85149"; border.width: 1; radius: 4 }

        ColumnLayout {
            spacing: 16
            width: 360

            Label {
                text: "This will stop all managed services (MCP Server, CLI MCP,\nDashboard, Terminal, Fallback API) and close the supervisor."
                wrapMode: Text.WordWrap
                Layout.fillWidth: true
                color: "#c9d1d9"
                font.pixelSize: 13
            }

            RowLayout {
                Layout.fillWidth: true
                spacing: 8
                Item { Layout.fillWidth: true }
                Button {
                    text: "Cancel"
                    onClicked: shutdownDialog.close()
                }
                Button {
                    text: "Shut Down"
                    Material.background: "#3a0e0e"
                    Material.foreground: "#f85149"
                    onClicked: {
                        shutdownDialog.close()
                        supervisorGuiBridge.quitSupervisor()
                    }
                }
            }
        }
    }

    // ── Pairing QR dialog ────────────────────────────────────────────────────
    PairingDialog {
        id: pairingDialog
    }

    // ── Window content ───────────────────────────────────────────────────────
    ColumnLayout {
        anchors.fill: parent
        anchors.margins: 12
        spacing: 8

        // ── Header ────────────────────────────────────────────────────────────
        RowLayout {
            spacing: 10
            Layout.fillWidth: true

            Canvas {
                Layout.preferredWidth: 36; Layout.preferredHeight: 36
                onPaint: {
                    var ctx = getContext("2d")
                    ctx.clearRect(0, 0, 36, 36)
                    ctx.save(); ctx.scale(36/48, 36/48)
                    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, 48, 48)
                    ctx.strokeStyle = "#ffde59"; ctx.lineWidth = 2; ctx.strokeRect(1, 1, 46, 46)
                    ctx.beginPath()
                    ctx.moveTo(24, 5); ctx.lineTo(43, 24); ctx.lineTo(24, 43); ctx.lineTo(5, 24)
                    ctx.closePath()
                    ctx.strokeStyle = "#000000"; ctx.lineWidth = 3; ctx.stroke()
                    ctx.strokeStyle = "#000000"; ctx.lineWidth = 2
                    ctx.beginPath(); ctx.moveTo(24, 7); ctx.lineTo(24, 41); ctx.stroke()
                    ctx.beginPath(); ctx.moveTo(7, 24); ctx.lineTo(41, 24); ctx.stroke()
                    ctx.fillStyle = "#000000"; ctx.fillRect(18, 18, 12, 12)
                    ctx.fillStyle = "#ffffff"; ctx.fillRect(22, 22, 5, 5)
                    ctx.fillStyle = "#000000"; ctx.fillRect(26, 30, 20, 16)
                    ctx.fillStyle = "#ffffff"; ctx.font = "bold 9px monospace"
                    ctx.textAlign = "center"; ctx.fillText("pm", 36, 42)
                    ctx.restore()
                }
            }

            Label {
                text: "PROJECT MEMORY SUPERVISOR"
                font.pixelSize: 16
                font.bold: true
                font.letterSpacing: 1.0
                color: root.textPrimary
            }

            Item { Layout.fillWidth: true }

            Button {
                text: "Shut Down"
                Material.background: "#3a0e0e"
                Material.foreground: "#f85149"
                onClicked: shutdownDialog.open()
            }
        }

        // ── Scrollable content + AI sidebar ─────────────────────────────────
        RowLayout {
            Layout.fillWidth: true
            Layout.fillHeight: true
            spacing: 0

        PlansPanel {
            id: plansPanel
            Layout.fillHeight: true
            mcpBaseUrl:  root.mcpBaseUrl
            dashBaseUrl: root.dashBaseUrl
            mcpPort:     supervisorGuiBridge.mcpPort
        }

        Flickable {
            Layout.fillWidth: true
            Layout.fillHeight: true
            clip: true
            boundsBehavior: Flickable.StopAtBounds
            contentHeight: scrollContent.implicitHeight
            ScrollBar.vertical: ScrollBar { policy: ScrollBar.AsNeeded }

            ColumnLayout {
                id: scrollContent
                width: parent.width
                spacing: 8

                // ── MCP SERVERS ────────────────────────────────────────────
                Label {
                    text: "MCP SERVERS"
                    font.pixelSize: 10; font.letterSpacing: 1.0
                    color: root.textSecondary
                }

                GridLayout {
                    Layout.fillWidth: true
                    columns: 2
                    rowSpacing: 8; columnSpacing: 8

                    // ── MCP Server (VS Code proxy) ────────────────────────────
                    ServiceCard {
                        serviceName:  "MCP Server"
                        status:       supervisorGuiBridge.mcpStatus
                        accentColor:  "#ff90e8"
                        iconBgColor:  "#1a1628"
                        iconDelegate: Component {
                            Canvas {
                                anchors.fill: parent
                                onPaint: {
                                    var c = getContext("2d")
                                    c.clearRect(0, 0, 32, 32)
                                    c.save(); c.scale(32/512, 32/512)
                                    c.beginPath(); c.arc(256, 256, 144, 0, Math.PI * 2)
                                    c.strokeStyle = "#ff90e8"; c.lineWidth = 28; c.stroke()
                                    c.beginPath()
                                    c.moveTo(320, 40); c.lineTo(120, 280); c.lineTo(260, 280)
                                    c.lineTo(160, 480); c.lineTo(440, 200); c.lineTo(280, 200)
                                    c.closePath(); c.fillStyle = "#ff90e8"; c.fill()
                                    c.restore()
                                }
                            }
                        }
                        infoLine1: "PID: " + supervisorGuiBridge.mcpPid + "   Port: " + supervisorGuiBridge.mcpPort
                        infoLine2: "Runtime: " + supervisorGuiBridge.mcpRuntime + "   Up: " + supervisorGuiBridge.mcpUptimeSecs + "s"
                        primaryActionLabel: "Restart"
                        onPrimaryActionClicked: supervisorGuiBridge.restartService("mcp")
                        secondaryActionLabel: "Manage"
                    }

                    // ── CLI MCP Server ────────────────────────────────────────
                    ServiceCard {
                        serviceName:  "CLI MCP Server"
                        status:       supervisorGuiBridge.cliMcpStatus
                        accentColor:  "#26c6da"
                        iconBgColor:  "#0a1e25"
                        iconDelegate: Component {
                            Canvas {
                                anchors.fill: parent
                                onPaint: {
                                    var c = getContext("2d")
                                    c.clearRect(0, 0, 32, 32)
                                    c.save(); c.scale(32/512, 32/512)
                                    // Chevron '>'
                                    c.strokeStyle = "#26c6da"; c.lineWidth = 36
                                    c.lineCap = "round"; c.lineJoin = "round"
                                    c.beginPath()
                                    c.moveTo(80, 140); c.lineTo(220, 256); c.lineTo(80, 372)
                                    c.stroke()
                                    // Underscore cursor '_'
                                    c.beginPath()
                                    c.moveTo(240, 372); c.lineTo(420, 372)
                                    c.stroke()
                                    // Small MCP bolt (top-right)
                                    c.fillStyle = "#26c6da"; c.globalAlpha = 0.85
                                    c.beginPath()
                                    c.moveTo(370, 60); c.lineTo(300, 185); c.lineTo(345, 185)
                                    c.lineTo(285, 320); c.lineTo(440, 175); c.lineTo(385, 175)
                                    c.closePath(); c.fill()
                                    c.restore()
                                }
                            }
                        }
                        infoLine1:  "Port: 3466"
                        infoLine2:  "HTTP-only · CLI agents"
                        infoAlways: supervisorGuiBridge.cliMcpStatus !== "Running" ? "http://127.0.0.1:3466/mcp" : ""
                        primaryActionLabel: "Restart"
                        onPrimaryActionClicked: supervisorGuiBridge.restartService("cli_mcp")
                    }

                } // end GridLayout (MCP servers)

                // ── SERVICES ───────────────────────────────────────────────────
                Label {
                    text: "SERVICES"
                    font.pixelSize: 10; font.letterSpacing: 1.0
                    color: root.textSecondary
                }

                GridLayout {
                    Layout.fillWidth: true
                    columns: 2
                    rowSpacing: 8; columnSpacing: 8

                    // ── Interactive Terminal ──────────────────────────────────
                    ServiceCard {
                        serviceName:  "Interactive Terminal"
                        status:       supervisorGuiBridge.terminalStatus
                        accentColor:  "#38b6ff"
                        iconBgColor:  "#0d1f30"
                        iconDelegate: Component {
                            Canvas {
                                anchors.fill: parent
                                onPaint: {
                                    var c = getContext("2d")
                                    c.clearRect(0, 0, 32, 32)
                                    c.save(); c.scale(32/512, 32/512)
                                    c.strokeStyle = "#38b6ff"; c.lineWidth = 28
                                    c.strokeRect(56, 112, 400, 288)
                                    c.fillStyle = "#38b6ff"; c.globalAlpha = 0.4
                                    c.fillRect(56, 112, 400, 68); c.globalAlpha = 1.0
                                    c.beginPath()
                                    c.moveTo(100, 224); c.lineTo(148, 272); c.lineTo(100, 320)
                                    c.lineJoin = "miter"; c.lineCap = "square"
                                    c.strokeStyle = "#38b6ff"; c.lineWidth = 26; c.stroke()
                                    c.fillStyle = "#38b6ff"
                                    c.fillRect(180, 296, 80, 22)
                                    c.fillRect(100, 350, 160, 22)
                                    c.restore()
                                }
                            }
                        }
                        infoLine1: "PID: " + supervisorGuiBridge.terminalPid + "   Port: " + supervisorGuiBridge.terminalPort
                        infoLine2: "Runtime: " + supervisorGuiBridge.terminalRuntime + "   Up: " + supervisorGuiBridge.terminalUptimeSecs + "s"
                        offlineText: ""
                        primaryActionLabel:   supervisorGuiBridge.terminalStatus === "Running" ? "Stop" : "Start"
                        primaryActionEnabled: supervisorGuiBridge.terminalStatus !== "Starting" && supervisorGuiBridge.terminalStatus !== "Stopping"
                        onPrimaryActionClicked: {
                            if (supervisorGuiBridge.terminalStatus === "Running")
                                supervisorGuiBridge.stopService("terminal")
                            else
                                supervisorGuiBridge.startService("terminal")
                        }
                        secondaryActionLabel:   "Open"
                        secondaryActionEnabled: supervisorGuiBridge.terminalUrl !== ""
                        onSecondaryActionClicked: supervisorGuiBridge.openTerminal()
                        showRuntimeStrip:  true
                        runtimeStripValue: supervisorGuiBridge.terminalStatus === "Running" ? supervisorGuiBridge.terminalRuntime : "--"
                    }

                    // ── Dashboard ─────────────────────────────────────────────
                    ServiceCard {
                        serviceName:  "Dashboard"
                        status:       supervisorGuiBridge.dashboardStatus
                        accentColor:  "#42a5f5"
                        iconBgColor:  "#0d1f2e"
                        iconDelegate: Component {
                            Canvas {
                                anchors.fill: parent
                                onPaint: {
                                    var c = getContext("2d")
                                    c.clearRect(0, 0, 32, 32)
                                    c.save(); c.scale(32/24, 32/24)
                                    c.fillStyle = "#42a5f5"
                                    c.fillRect(3, 3, 7, 9)
                                    c.fillRect(14, 3, 7, 5)
                                    c.fillRect(14, 12, 7, 9)
                                    c.fillRect(3, 16, 7, 5)
                                    c.restore()
                                }
                            }
                        }
                        infoLine1: "PID: " + supervisorGuiBridge.dashboardPid + "   Port: " + supervisorGuiBridge.dashboardPort
                        infoLine2: "Runtime: " + supervisorGuiBridge.dashboardRuntime + "   Up: " + supervisorGuiBridge.dashboardUptimeSecs + "s"
                        primaryActionLabel: "Restart"
                        onPrimaryActionClicked: supervisorGuiBridge.restartService("dashboard")
                        secondaryActionLabel:   "Visit"
                        secondaryActionEnabled: supervisorGuiBridge.dashboardUrl !== ""
                        onSecondaryActionClicked: supervisorGuiBridge.openDashboard()
                    }

                    // ── Fallback API ──────────────────────────────────────────
                    ServiceCard {
                        serviceName: "Fallback API"
                        status:      supervisorGuiBridge.fallbackStatus
                        accentColor: "#ef5350"
                        iconBgColor: "#2a0d0d"
                        iconDelegate: Component {
                            Canvas {
                                anchors.fill: parent
                                onPaint: {
                                    var c = getContext("2d")
                                    c.clearRect(0, 0, 32, 32)
                                    c.save(); c.scale(32/512, 32/512)
                                    c.strokeStyle = "#ef5350"; c.lineWidth = 30
                                    c.strokeRect(108, 88, 296, 344)
                                    c.fillStyle = "#ef5350"; c.fillRect(180, 56, 152, 60)
                                    c.beginPath()
                                    c.moveTo(140, 300); c.lineTo(240, 400); c.lineTo(460, 170)
                                    c.lineJoin = "miter"; c.lineCap = "square"
                                    c.strokeStyle = "#ef5350"; c.lineWidth = 40; c.stroke()
                                    c.restore()
                                }
                            }
                        }
                        infoAlways:         "Proxy route: /api/fallback/*"
                        primaryActionLabel: "Restart"
                        onPrimaryActionClicked: supervisorGuiBridge.restartService("fallback_api")
                    }

                } // end GridLayout (services)

                // ── CONFIGURED SERVERS ([[servers]] entries) ──────────────────
                // Parsed from supervisorGuiBridge.customServicesJson each time it
                // changes.  Hidden when there are no configured servers.
                Loader {
                    id: customServicesLoader
                    Layout.fillWidth: true
                    property var parsedServices: {
                        try { return JSON.parse(supervisorGuiBridge.customServicesJson) }
                        catch(e) { return [] }
                    }
                    active: parsedServices.length > 0
                    sourceComponent: Component {
                        ColumnLayout {
                            spacing: 6

                            Label {
                                text: "CONFIGURED SERVERS"
                                font.pixelSize: 10; font.letterSpacing: 1.0
                                color: root.textSecondary
                            }

                            GridLayout {
                                Layout.fillWidth: true
                                columns: 2
                                rowSpacing: 8; columnSpacing: 8

                                Repeater {
                                    model: customServicesLoader.parsedServices
                                    ServiceCard {
                                        required property var modelData
                                        serviceName:  modelData.display || modelData.name
                                        status:       modelData.status || "Stopped"
                                        accentColor:  "#a8d8ea"
                                        iconBgColor:  "#0d1e25"
                                        iconDelegate: Component {
                                            Canvas {
                                                anchors.fill: parent
                                                onPaint: {
                                                    var c = getContext("2d")
                                                    c.clearRect(0, 0, 28, 28)
                                                    c.save(); c.scale(28/512, 28/512)
                                                    // Generic "process" icon: three horizontal bars
                                                    c.fillStyle = "#a8d8ea"
                                                    c.fillRect(80, 120, 352, 48)
                                                    c.fillRect(80, 232, 256, 48)
                                                    c.fillRect(80, 344, 192, 48)
                                                    c.restore()
                                                }
                                            }
                                        }
                                        infoLine1: modelData.port ? "Port: " + modelData.port : ""
                                        infoLine2: ""
                                        primaryActionLabel: modelData.status === "Running" ? "Stop" : "Start"
                                        primaryActionEnabled: modelData.status !== "Starting" && modelData.status !== "Stopping"
                                        onPrimaryActionClicked: {
                                            if (modelData.status === "Running")
                                                supervisorGuiBridge.stopService(modelData.name)
                                            else
                                                supervisorGuiBridge.startService(modelData.name)
                                        }
                                        secondaryActionLabel: "Restart"
                                        onSecondaryActionClicked: supervisorGuiBridge.restartService(modelData.name)
                                    }
                                }
                            }
                        }
                    }
                }

                // ── ACTIVE SESSIONS + RECENT ACTIVITY ────────────────────────
                RowLayout {
                    Layout.fillWidth: true
                    spacing: 8

                    SessionsPanel {
                        mcpBaseUrl: root.mcpBaseUrl
                        mcpPort:    supervisorGuiBridge.mcpPort
                    }

                    ActivityPanel {
                        dashBaseUrl:   root.dashBaseUrl
                        dashboardPort: supervisorGuiBridge.dashboardPort
                    }
                }

                // ── WORKSPACE CARTOGRAPHER + MCP PROXY + EVENTS ──────────────
                RowLayout {
                    Layout.fillWidth: true
                    spacing: 8

                    CartographerPanel {
                        mcpBaseUrl: root.mcpBaseUrl
                        mcpPort:    supervisorGuiBridge.mcpPort
                        mcpStatus:  supervisorGuiBridge.mcpStatus
                    }

                    ColumnLayout {
                        Layout.fillWidth: true
                        spacing: 8

                        McpProxyPanel {
                            totalConnections: supervisorGuiBridge.totalMcpConnections
                            activeInstances:  supervisorGuiBridge.activeMcpInstances
                            distribution:     supervisorGuiBridge.mcpInstanceDistribution
                        }

                        EventBroadcastPanel {
                            enabled:         supervisorGuiBridge.eventBroadcastEnabled
                            subscriberCount: supervisorGuiBridge.eventSubscriberCount
                            totalEmitted:    supervisorGuiBridge.eventsTotalEmitted
                        }

                    } // end right ColumnLayout
                }

                Label {
                    Layout.fillWidth: true
                    visible: supervisorGuiBridge.actionFeedback !== ""
                    text: supervisorGuiBridge.actionFeedback
                    color: root.textSecondary
                    wrapMode: Text.Wrap
                }

            } // end scrollContent ColumnLayout
        } // end Flickable

        ChatbotPanel {
            id: chatPanel
            Layout.fillHeight: true
            mcpBaseUrl:  root.mcpBaseUrl
            guiBaseUrl:  "http://127.0.0.1:3464"
            mcpPort:     supervisorGuiBridge.mcpPort
            guiAuthKey:  supervisorGuiBridge.guiAuthKey
        }

        } // end content+sidebar RowLayout

        // ── Footer ────────────────────────────────────────────────────────────
        RowLayout {
            spacing: 8
            Layout.alignment: Qt.AlignRight

            Button {
                text: "\u2699  Settings"
                onClicked: settingsOverlay.visible = true
            }
            Button {
                text: "Minimize to Tray"
                onClicked: supervisorGuiBridge.hideWindow()
            }
        }
    }

    // ── In-app config editor overlay ─────────────────────────────────────────
    Rectangle {
        id: configEditorOverlay
        visible: false
        anchors.fill: parent
        color: "#212121"
        z: 10

        ColumnLayout {
            anchors.fill: parent
            anchors.margins: 20
            spacing: 12

            // Header
            RowLayout {
                Layout.fillWidth: true
                spacing: 8

                Label {
                    text: "Edit supervisor.toml"
                    font.pixelSize: 18
                    font.bold: true
                    Layout.fillWidth: true
                }
                Button {
                    text: "Open in Editor"
                    flat: true
                    onClicked: supervisorGuiBridge.openConfig()
                }
            }

            // TOML text area
            Rectangle {
                Layout.fillWidth: true
                Layout.fillHeight: true
                color: "#1a1a1a"
                border.color: "#444444"
                radius: 4
                clip: true

                ScrollView {
                    id: configScrollView
                    anchors.fill: parent
                    anchors.margins: 2
                    ScrollBar.horizontal.policy: ScrollBar.AsNeeded
                    ScrollBar.vertical.policy: ScrollBar.AsNeeded

                    TextArea {
                        id: configTextArea
                        font.family: "Consolas"
                        font.pixelSize: 13
                        wrapMode: TextEdit.NoWrap
                        color: "#e0e0e0"
                        selectByMouse: true
                        background: Item {}
                        padding: 8
                    }
                }
            }

            // Validation error label
            Label {
                id: configSaveError
                visible: text !== ""
                color: "#f44336"
                wrapMode: Text.WordWrap
                Layout.fillWidth: true
            }

            // Action buttons
            RowLayout {
                Layout.alignment: Qt.AlignRight
                spacing: 8

                Button {
                    text: "Save"
                    highlighted: true
                    onClicked: {
                        configSaveError.text = ""
                        if (supervisorGuiBridge.saveConfigToml(configTextArea.text)) {
                            configEditorOverlay.visible = false
                        } else {
                            configSaveError.text = supervisorGuiBridge.configEditorError
                        }
                    }
                }
                Button {
                    text: "Cancel"
                    onClicked: configEditorOverlay.visible = false
                }
            }
        }
    }

    // ── Structured settings overlay ───────────────────────────────────────────
    SettingsPanel {
        id: settingsOverlay
        bridge: supervisorGuiBridge
        onOpenRawEditorRequested: {
            configSaveError.text = ""
            configTextArea.text = supervisorGuiBridge.loadConfigToml()
            configEditorOverlay.visible = true
        }
    }
}
