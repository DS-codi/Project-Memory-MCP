import QtQuick 2.15
import QtQuick.Controls 2.15
import QtQuick.Controls.Material 2.15
import QtQuick.Layouts 1.15
import Qt.labs.settings 1.1

/// Full-window settings overlay — replaces the raw TOML editor with
/// organised toggles, sliders, spinboxes, and VS Code extension controls.
Rectangle {
    id: panel

    // ── Public API ────────────────────────────────────────────────────────────
    /// Emitted when the user clicks "Edit TOML" — parent should show the raw editor.
    signal openRawEditorRequested()

    /// Pass `supervisorGuiBridge` from main.qml.
    property var bridge: null

    // ── Overlay chrome ────────────────────────────────────────────────────────
    visible: false
    anchors.fill: parent
    color: "#0d1117"
    z: 10

    Material.theme: Material.Dark
    Material.accent: Material.Blue

    // ── Active category index (0-4) ───────────────────────────────────────────
    property int activeCat: 0

    // ── Persisted UI preferences (not stored in TOML config) ─────────────────
    Settings {
        id: _uiPrefs
        category: "supervisor_ui"
        property bool showChatbotPanel: true
    }
    /// Whether the AI chatbot panel is visible. Persisted across restarts.
    property alias showChatbotPanel: _uiPrefs.showChatbotPanel

    // ── Auto-load on show ─────────────────────────────────────────────────────
    onVisibleChanged: { if (visible) _loadSettings() }

    // ── Load all config into controls ─────────────────────────────────────────
    function _loadSettings() {
        errLabel.text = ""

        // Supervisor config (TOML → JSON)
        var raw = bridge.loadSettingsJson()
        var cfg = {}
        try { if (raw !== "") cfg = JSON.parse(raw) } catch (_e) {}
        var s    = cfg.supervisor            || {}
        var mcp  = cfg.mcp                   || {}
        var pool = mcp.pool                  || {}
        var term = cfg.interactive_terminal  || {}
        var dash = cfg.dashboard             || {}
        var evts = cfg.events                || {}
        var rc   = cfg.reconnect             || {}
        var appr = cfg.approval              || {}

        // General
        logLevelBox.currentIndex = Math.max(0, ["trace","debug","info","warn","error"].indexOf(s.log_level || "info"))
        bindAddrField.text       = s.bind_address || "127.0.0.1:3456"

        // MCP server
        mcpSwitch.checked        = mcp.enabled !== false
        mcpPortSpin.value        = mcp.port || 3457
        mcpHealthSlider.value    = Math.min(10000, Math.max(300, mcp.health_timeout_ms || 1500))
        poolMinSpin.value        = pool.min_instances              || 1
        poolMaxSpin.value        = pool.max_instances              || 4
        poolConnSpin.value       = pool.max_connections_per_instance || 5

        // Interactive terminal
        termSwitch.checked       = term.enabled !== false
        termPortSpin.value       = term.port || 3458

        // Dashboard
        dashSwitch.checked       = dash.enabled !== false
        dashPortSpin.value       = dash.port || 3459
        dashMcpSwitch.checked    = dash.requires_mcp !== false
        dashVariantCombo.currentIndex = Math.max(0, ["classic","solid"].indexOf(dash.variant || "classic"))

        // Events
        evtsSwitch.checked       = evts.enabled !== false

        // Reconnect back-off
        rcInitSpin.value         = Math.min(10000, Math.max(100,    rc.initial_delay_ms || 500))
        rcMaxSpin.value          = Math.min(120000, Math.max(1000,  rc.max_delay_ms     || 30000))
        rcMultSlider.value       = Math.min(5.0, Math.max(1.0,      rc.multiplier       || 2.0))
        rcAttemptsSpin.value     = Math.min(1000, Math.max(0,       rc.max_attempts     || 0))
        rcJitterSlider.value     = Math.min(1.0, Math.max(0.0,      rc.jitter_ratio     || 0.2))

        // Approval gateway
        apprCountSpin.value        = Math.min(300, Math.max(5, appr.default_countdown_seconds || 60))
        apprTimeoutBox.currentIndex = (appr.default_on_timeout === "reject") ? 1 : 0
        apprTopSwitch.checked      = appr.always_on_top !== false

        // VS Code settings (flat JSON)
        var vsraw = bridge.loadVscodeSettingsJson()
        var vs = {}
        try { if (vsraw !== "") vs = JSON.parse(vsraw) } catch (_e) {}

        vsMcpSpin.value              = vs["projectMemory.mcpPort"]                     || 3457
        vsDashSpin.value             = vs["projectMemory.serverPort"]                  || 3459
        vsAgentsField.text           = vs["projectMemory.agentsRoot"]                  || ""
        vsSkillsField.text           = vs["projectMemory.skillsRoot"]                  || ""
        vsInstrField.text            = vs["projectMemory.instructionsRoot"]            || ""
        vsNotifSwitch.checked        = vs["projectMemory.notifications.enabled"]       !== false
        vsHandoffSwitch.checked      = vs["projectMemory.notifications.agentHandoffs"] !== false
        vsCompleteSwitch.checked     = vs["projectMemory.notifications.planComplete"]  !== false
        vsBlockedSwitch.checked      = vs["projectMemory.notifications.stepBlocked"]   !== false
        vsDashSwitch.checked         = vs["projectMemory.dashboard.enabled"]           !== false
        vsAutoDeploySwitch.checked   = vs["projectMemory.autoDeployOnWorkspaceOpen"]   === true
        vsSkillDeploySwitch.checked  = vs["projectMemory.autoDeploySkills"]            === true
        vsContainerBox.currentIndex  = Math.max(0, ["auto","local","container"].indexOf(vs["projectMemory.containerMode"] || "auto"))
        vsStartupBox.currentIndex    = Math.max(0, ["off","prompt","auto"].indexOf(vs["supervisor.startupMode"] || "auto"))
        vsLauncherField.text         = vs["supervisor.launcherPath"]                   || ""
        vsDetectSpin.value           = vs["supervisor.detectTimeoutMs"]                || 1000
        vsStartupSpin.value          = vs["supervisor.startupTimeoutMs"]               || 15000
    }

    // ── Write controls to configs ─────────────────────────────────────────────
    function _saveSettings() {
        errLabel.text = ""

        var supDelta = {
            supervisor: {
                log_level:    ["trace","debug","info","warn","error"][logLevelBox.currentIndex],
                bind_address: bindAddrField.text
            },
            mcp: {
                enabled:           mcpSwitch.checked,
                port:              mcpPortSpin.value,
                health_timeout_ms: Math.round(mcpHealthSlider.value),
                pool: {
                    min_instances:                poolMinSpin.value,
                    max_instances:                poolMaxSpin.value,
                    max_connections_per_instance: poolConnSpin.value
                }
            },
            interactive_terminal: { enabled: termSwitch.checked,  port: termPortSpin.value },
            dashboard:            { enabled: dashSwitch.checked,   port: dashPortSpin.value, requires_mcp: dashMcpSwitch.checked, variant: dashVariantCombo.currentText },
            events:               { enabled: evtsSwitch.checked },
            reconnect: {
                initial_delay_ms: rcInitSpin.value,
                max_delay_ms:     rcMaxSpin.value,
                multiplier:       rcMultSlider.value,
                max_attempts:     rcAttemptsSpin.value,
                jitter_ratio:     rcJitterSlider.value
            },
            approval: {
                default_countdown_seconds: apprCountSpin.value,
                default_on_timeout:        ["approve","reject"][apprTimeoutBox.currentIndex],
                always_on_top:             apprTopSwitch.checked
            }
        }

        if (!bridge.saveSettingsJson(JSON.stringify(supDelta))) {
            errLabel.text = bridge.configEditorError || "Failed to save supervisor config"
            return
        }

        // VS Code settings (best-effort, no blocking error on failure)
        var vsDelta = {
            "projectMemory.mcpPort":                     vsMcpSpin.value,
            "projectMemory.serverPort":                  vsDashSpin.value,
            "projectMemory.agentsRoot":                  vsAgentsField.text,
            "projectMemory.skillsRoot":                  vsSkillsField.text,
            "projectMemory.instructionsRoot":            vsInstrField.text,
            "projectMemory.notifications.enabled":       vsNotifSwitch.checked,
            "projectMemory.notifications.agentHandoffs": vsHandoffSwitch.checked,
            "projectMemory.notifications.planComplete":  vsCompleteSwitch.checked,
            "projectMemory.notifications.stepBlocked":   vsBlockedSwitch.checked,
            "projectMemory.dashboard.enabled":           vsDashSwitch.checked,
            "projectMemory.autoDeployOnWorkspaceOpen":   vsAutoDeploySwitch.checked,
            "projectMemory.autoDeploySkills":            vsSkillDeploySwitch.checked,
            "projectMemory.containerMode":    ["auto","local","container"][vsContainerBox.currentIndex],
            "supervisor.startupMode":         ["off","prompt","auto"][vsStartupBox.currentIndex],
            "supervisor.launcherPath":        vsLauncherField.text,
            "supervisor.detectTimeoutMs":     vsDetectSpin.value,
            "supervisor.startupTimeoutMs":    vsStartupSpin.value
        }
        bridge.saveVscodeSettingsJson(JSON.stringify(vsDelta))

        panel.visible = false
    }

    // ── Layout ────────────────────────────────────────────────────────────────
    ColumnLayout {
        anchors.fill: parent
        anchors.margins: 16
        spacing: 10

        // ── Header ────────────────────────────────────────────────────────────
        RowLayout {
            Layout.fillWidth: true
            Label {
                text: "\u2699  Settings"
                font.pixelSize: 18; font.bold: true; color: "#c9d1d9"
                Layout.fillWidth: true
            }
            Button {
                text: "Edit TOML"; flat: true
                onClicked: { panel.visible = false; panel.openRawEditorRequested() }
            }
        }

        // ── Body: sidebar + content ───────────────────────────────────────────
        RowLayout {
            Layout.fillWidth: true
            Layout.fillHeight: true
            spacing: 10

            // ── Sidebar ───────────────────────────────────────────────────────
            Rectangle {
                Layout.preferredWidth: 150; Layout.fillHeight: true
                color: "#0f1319"; radius: 6; border.color: "#30363d"

                Column {
                    anchors { fill: parent; margins: 6 }
                    spacing: 2

                    ItemDelegate {
                        width: parent.width; height: 36
                        text: "General"; font.pixelSize: 13
                        highlighted: panel.activeCat === 0
                        onClicked: panel.activeCat = 0
                    }
                    ItemDelegate {
                        width: parent.width; height: 36
                        text: "Services"; font.pixelSize: 13
                        highlighted: panel.activeCat === 1
                        onClicked: panel.activeCat = 1
                    }
                    ItemDelegate {
                        width: parent.width; height: 36
                        text: "Reconnect"; font.pixelSize: 13
                        highlighted: panel.activeCat === 2
                        onClicked: panel.activeCat = 2
                    }
                    ItemDelegate {
                        width: parent.width; height: 36
                        text: "Approval"; font.pixelSize: 13
                        highlighted: panel.activeCat === 3
                        onClicked: panel.activeCat = 3
                    }
                    ItemDelegate {
                        width: parent.width; height: 36
                        text: "VS Code"; font.pixelSize: 13
                        highlighted: panel.activeCat === 4
                        onClicked: panel.activeCat = 4
                    }
                }
            }

            // ── Content area ──────────────────────────────────────────────────
            Rectangle {
                Layout.fillWidth: true; Layout.fillHeight: true
                color: "#0f1319"; radius: 6; border.color: "#30363d"; clip: true

                StackLayout {
                    anchors.fill: parent
                    currentIndex: panel.activeCat

                    // ─────────────────────── 0: GENERAL ──────────────────────
                    Flickable {
                        clip: true
                        contentWidth: width
                        contentHeight: _genCol.implicitHeight + 32
                        boundsBehavior: Flickable.StopAtBounds
                        ScrollBar.vertical: ScrollBar { policy: ScrollBar.AsNeeded }

                        ColumnLayout {
                            id: _genCol
                            width: parent.width - 32
                            anchors { left: parent.left; top: parent.top; leftMargin: 16; topMargin: 12 }
                            spacing: 0

                            Label { text: "SUPERVISOR"; color: "#8b949e"; font.pixelSize: 10; font.letterSpacing: 1.0; Layout.topMargin: 4 }
                            Rectangle { Layout.fillWidth: true; Layout.preferredHeight: 1; color: "#30363d"; Layout.bottomMargin: 6 }

                            RowLayout {
                                Layout.fillWidth: true; implicitHeight: 44; spacing: 8
                                Label { text: "Log Level"; color: "#c9d1d9"; font.pixelSize: 13; Layout.preferredWidth: 180 }
                                ComboBox { id: logLevelBox; model: ["trace","debug","info","warn","error"]; implicitWidth: 150 }
                                Label { text: "Minimum log verbosity written to console and log file"; color: "#8b949e"; font.pixelSize: 11; Layout.fillWidth: true; wrapMode: Text.Wrap }
                            }
                            RowLayout {
                                Layout.fillWidth: true; implicitHeight: 44; spacing: 8
                                Label { text: "Bind Address"; color: "#c9d1d9"; font.pixelSize: 13; Layout.preferredWidth: 180 }
                                TextField {
                                    id: bindAddrField; implicitWidth: 210; implicitHeight: 34
                                    placeholderText: "127.0.0.1:3456"; color: "#c9d1d9"
                                    background: Rectangle { color: "#1c2128"; radius: 4; border.color: "#444" }
                                }
                                Label { text: "HTTP bind address for the supervisor REST API"; color: "#8b949e"; font.pixelSize: 11; Layout.fillWidth: true; wrapMode: Text.Wrap }
                            }
                            RowLayout {
                                Layout.fillWidth: true; implicitHeight: 44; spacing: 8
                                Label { text: "Show AI Chatbot"; color: "#c9d1d9"; font.pixelSize: 13; Layout.preferredWidth: 180 }
                                Switch { id: chatbotPanelSwitch; checked: _uiPrefs.showChatbotPanel; onCheckedChanged: _uiPrefs.showChatbotPanel = checked }
                                Label { text: "Show the AI chatbot sidebar panel"; color: "#8b949e"; font.pixelSize: 11; Layout.fillWidth: true; wrapMode: Text.Wrap }
                            }
                            Item { implicitHeight: 8 }
                        }
                    }

                    // ─────────────────────── 1: SERVICES ─────────────────────
                    Flickable {
                        clip: true
                        contentWidth: width
                        contentHeight: _svcCol.implicitHeight + 32
                        boundsBehavior: Flickable.StopAtBounds
                        ScrollBar.vertical: ScrollBar { policy: ScrollBar.AsNeeded }

                        ColumnLayout {
                            id: _svcCol
                            width: parent.width - 32
                            anchors { left: parent.left; top: parent.top; leftMargin: 16; topMargin: 12 }
                            spacing: 0

                            // ─ MCP Server ─────────────────────────────────────
                            Label { text: "MCP SERVER"; color: "#8b949e"; font.pixelSize: 10; font.letterSpacing: 1.0; Layout.topMargin: 4 }
                            Rectangle { Layout.fillWidth: true; Layout.preferredHeight: 1; color: "#30363d"; Layout.bottomMargin: 6 }

                            RowLayout {
                                Layout.fillWidth: true; implicitHeight: 44; spacing: 8
                                Label { text: "Enabled"; color: "#c9d1d9"; font.pixelSize: 13; Layout.preferredWidth: 180 }
                                Switch { id: mcpSwitch; checked: true }
                                Label { text: "Manage the MCP server process"; color: "#8b949e"; font.pixelSize: 11; Layout.fillWidth: true }
                            }
                            RowLayout {
                                Layout.fillWidth: true; implicitHeight: 44; spacing: 8
                                Label { text: "Port"; color: "#c9d1d9"; font.pixelSize: 13; Layout.preferredWidth: 180 }
                                SpinBox { id: mcpPortSpin; from: 1; to: 65535; value: 3457 }
                                Label { text: "TCP port for the MCP proxy (default 3457)"; color: "#8b949e"; font.pixelSize: 11; Layout.fillWidth: true }
                            }
                            RowLayout {
                                Layout.fillWidth: true; implicitHeight: 44; spacing: 8
                                Label { text: "Health Timeout"; color: "#c9d1d9"; font.pixelSize: 13; Layout.preferredWidth: 180 }
                                Slider { id: mcpHealthSlider; from: 300; to: 10000; stepSize: 100; value: 1500; implicitWidth: 160 }
                                Label { text: Math.round(mcpHealthSlider.value) + " ms"; color: "#c9d1d9"; font.pixelSize: 12; Layout.preferredWidth: 56 }
                                Label { text: "HTTP health probe timeout"; color: "#8b949e"; font.pixelSize: 11; Layout.fillWidth: true }
                            }

                            // ─ MCP Instance Pool ──────────────────────────────
                            Label { text: "INSTANCE POOL"; color: "#8b949e"; font.pixelSize: 10; font.letterSpacing: 1.0; Layout.topMargin: 12 }
                            Rectangle { Layout.fillWidth: true; Layout.preferredHeight: 1; color: "#30363d"; Layout.bottomMargin: 6 }

                            RowLayout {
                                Layout.fillWidth: true; implicitHeight: 44; spacing: 8
                                Label { text: "Min Instances"; color: "#c9d1d9"; font.pixelSize: 13; Layout.preferredWidth: 180 }
                                SpinBox { id: poolMinSpin; from: 1; to: 16; value: 1 }
                                Label { text: "Minimum MCP instances kept running at all times"; color: "#8b949e"; font.pixelSize: 11; Layout.fillWidth: true }
                            }
                            RowLayout {
                                Layout.fillWidth: true; implicitHeight: 44; spacing: 8
                                Label { text: "Max Instances"; color: "#c9d1d9"; font.pixelSize: 13; Layout.preferredWidth: 180 }
                                SpinBox { id: poolMaxSpin; from: 1; to: 32; value: 4 }
                                Label { text: "Hard cap on simultaneous MCP instances"; color: "#8b949e"; font.pixelSize: 11; Layout.fillWidth: true }
                            }
                            RowLayout {
                                Layout.fillWidth: true; implicitHeight: 44; spacing: 8
                                Label { text: "Max Conns / Instance"; color: "#c9d1d9"; font.pixelSize: 13; Layout.preferredWidth: 180 }
                                SpinBox { id: poolConnSpin; from: 1; to: 200; value: 5 }
                                Label { text: "Threshold that triggers a pool scale-up"; color: "#8b949e"; font.pixelSize: 11; Layout.fillWidth: true }
                            }

                            // ─ Interactive Terminal ────────────────────────────
                            Label { text: "INTERACTIVE TERMINAL"; color: "#8b949e"; font.pixelSize: 10; font.letterSpacing: 1.0; Layout.topMargin: 12 }
                            Rectangle { Layout.fillWidth: true; Layout.preferredHeight: 1; color: "#30363d"; Layout.bottomMargin: 6 }

                            RowLayout {
                                Layout.fillWidth: true; implicitHeight: 44; spacing: 8
                                Label { text: "Enabled"; color: "#c9d1d9"; font.pixelSize: 13; Layout.preferredWidth: 180 }
                                Switch { id: termSwitch; checked: true }
                                Label { text: "Manage the interactive terminal service"; color: "#8b949e"; font.pixelSize: 11; Layout.fillWidth: true }
                            }
                            RowLayout {
                                Layout.fillWidth: true; implicitHeight: 44; spacing: 8
                                Label { text: "Port"; color: "#c9d1d9"; font.pixelSize: 13; Layout.preferredWidth: 180 }
                                SpinBox { id: termPortSpin; from: 1; to: 65535; value: 3458 }
                                Label { text: "TCP port for terminal service (default 3458)"; color: "#8b949e"; font.pixelSize: 11; Layout.fillWidth: true }
                            }

                            // ─ Dashboard ──────────────────────────────────────
                            Label { text: "DASHBOARD"; color: "#8b949e"; font.pixelSize: 10; font.letterSpacing: 1.0; Layout.topMargin: 12 }
                            Rectangle { Layout.fillWidth: true; Layout.preferredHeight: 1; color: "#30363d"; Layout.bottomMargin: 6 }

                            RowLayout {
                                Layout.fillWidth: true; implicitHeight: 44; spacing: 8
                                Label { text: "Enabled"; color: "#c9d1d9"; font.pixelSize: 13; Layout.preferredWidth: 180 }
                                Switch { id: dashSwitch; checked: true }
                                Label { text: "Manage the dashboard server process"; color: "#8b949e"; font.pixelSize: 11; Layout.fillWidth: true }
                            }
                            RowLayout {
                                Layout.fillWidth: true; implicitHeight: 44; spacing: 8
                                Label { text: "Port"; color: "#c9d1d9"; font.pixelSize: 13; Layout.preferredWidth: 180 }
                                SpinBox { id: dashPortSpin; from: 1; to: 65535; value: 3459 }
                                Label { text: "TCP port for dashboard server (default 3459)"; color: "#8b949e"; font.pixelSize: 11; Layout.fillWidth: true }
                            }
                            RowLayout {
                                Layout.fillWidth: true; implicitHeight: 44; spacing: 8
                                Label { text: "Requires MCP"; color: "#c9d1d9"; font.pixelSize: 13; Layout.preferredWidth: 180 }
                                Switch { id: dashMcpSwitch; checked: true }
                                Label { text: "Enter degraded mode when MCP becomes unavailable"; color: "#8b949e"; font.pixelSize: 11; Layout.fillWidth: true; wrapMode: Text.Wrap }
                            }
                            RowLayout {
                                Layout.fillWidth: true; implicitHeight: 44; spacing: 8
                                Label { text: "Variant"; color: "#c9d1d9"; font.pixelSize: 13; Layout.preferredWidth: 180 }
                                ComboBox {
                                    id: dashVariantCombo
                                    model: ["classic", "solid"]
                                    implicitHeight: 32
                                }
                                Label { text: "Dashboard variant to run (classic = Node server, solid = Vite/SolidJS build)"; color: "#8b949e"; font.pixelSize: 11; Layout.fillWidth: true; wrapMode: Text.Wrap }
                            }

                            // ─ Event Broadcast ────────────────────────────────
                            Label { text: "EVENT BROADCAST"; color: "#8b949e"; font.pixelSize: 10; font.letterSpacing: 1.0; Layout.topMargin: 12 }
                            Rectangle { Layout.fillWidth: true; Layout.preferredHeight: 1; color: "#30363d"; Layout.bottomMargin: 6 }

                            RowLayout {
                                Layout.fillWidth: true; implicitHeight: 44; spacing: 8
                                Label { text: "Enabled"; color: "#c9d1d9"; font.pixelSize: 13; Layout.preferredWidth: 180 }
                                Switch { id: evtsSwitch; checked: true }
                                Label { text: "Enable the /supervisor/events SSE endpoint"; color: "#8b949e"; font.pixelSize: 11; Layout.fillWidth: true }
                            }
                            Item { implicitHeight: 8 }
                        }
                    }

                    // ─────────────────────── 2: RECONNECT ────────────────────
                    Flickable {
                        clip: true
                        contentWidth: width
                        contentHeight: _rcCol.implicitHeight + 32
                        boundsBehavior: Flickable.StopAtBounds
                        ScrollBar.vertical: ScrollBar { policy: ScrollBar.AsNeeded }

                        ColumnLayout {
                            id: _rcCol
                            width: parent.width - 32
                            anchors { left: parent.left; top: parent.top; leftMargin: 16; topMargin: 12 }
                            spacing: 0

                            Label { text: "BACK-OFF POLICY"; color: "#8b949e"; font.pixelSize: 10; font.letterSpacing: 1.0; Layout.topMargin: 4 }
                            Rectangle { Layout.fillWidth: true; Layout.preferredHeight: 1; color: "#30363d"; Layout.bottomMargin: 6 }

                            RowLayout {
                                Layout.fillWidth: true; implicitHeight: 44; spacing: 8
                                Label { text: "Initial Delay"; color: "#c9d1d9"; font.pixelSize: 13; Layout.preferredWidth: 180 }
                                SpinBox { id: rcInitSpin; from: 100; to: 10000; stepSize: 100; value: 500 }
                                Label { text: "ms \u2013 delay before the first reconnect attempt"; color: "#8b949e"; font.pixelSize: 11; Layout.fillWidth: true }
                            }
                            RowLayout {
                                Layout.fillWidth: true; implicitHeight: 44; spacing: 8
                                Label { text: "Max Delay"; color: "#c9d1d9"; font.pixelSize: 13; Layout.preferredWidth: 180 }
                                SpinBox { id: rcMaxSpin; from: 1000; to: 120000; stepSize: 1000; value: 30000 }
                                Label { text: "ms \u2013 cap on exponential back-off wait"; color: "#8b949e"; font.pixelSize: 11; Layout.fillWidth: true }
                            }
                            RowLayout {
                                Layout.fillWidth: true; implicitHeight: 44; spacing: 8
                                Label { text: "Multiplier"; color: "#c9d1d9"; font.pixelSize: 13; Layout.preferredWidth: 180 }
                                Slider { id: rcMultSlider; from: 1.0; to: 5.0; stepSize: 0.1; value: 2.0; implicitWidth: 160 }
                                Label { text: rcMultSlider.value.toFixed(1) + "\u00d7"; color: "#c9d1d9"; font.pixelSize: 12; Layout.preferredWidth: 38 }
                                Label { text: "Exponential back-off factor per attempt"; color: "#8b949e"; font.pixelSize: 11; Layout.fillWidth: true }
                            }
                            RowLayout {
                                Layout.fillWidth: true; implicitHeight: 44; spacing: 8
                                Label { text: "Max Attempts"; color: "#c9d1d9"; font.pixelSize: 13; Layout.preferredWidth: 180 }
                                SpinBox { id: rcAttemptsSpin; from: 0; to: 1000; stepSize: 1; value: 0 }
                                Label { text: "0 = unlimited retries"; color: "#8b949e"; font.pixelSize: 11; Layout.fillWidth: true }
                            }
                            RowLayout {
                                Layout.fillWidth: true; implicitHeight: 44; spacing: 8
                                Label { text: "Jitter Ratio"; color: "#c9d1d9"; font.pixelSize: 13; Layout.preferredWidth: 180 }
                                Slider { id: rcJitterSlider; from: 0.0; to: 1.0; stepSize: 0.05; value: 0.2; implicitWidth: 160 }
                                Label { text: (rcJitterSlider.value * 100).toFixed(0) + "%"; color: "#c9d1d9"; font.pixelSize: 12; Layout.preferredWidth: 38 }
                                Label { text: "Random jitter fraction added to each delay"; color: "#8b949e"; font.pixelSize: 11; Layout.fillWidth: true }
                            }
                            Item { implicitHeight: 8 }
                        }
                    }

                    // ─────────────────────── 3: APPROVAL ─────────────────────
                    Flickable {
                        clip: true
                        contentWidth: width
                        contentHeight: _apprCol.implicitHeight + 32
                        boundsBehavior: Flickable.StopAtBounds
                        ScrollBar.vertical: ScrollBar { policy: ScrollBar.AsNeeded }

                        ColumnLayout {
                            id: _apprCol
                            width: parent.width - 32
                            anchors { left: parent.left; top: parent.top; leftMargin: 16; topMargin: 12 }
                            spacing: 0

                            Label { text: "AUTO-APPROVAL GATE"; color: "#8b949e"; font.pixelSize: 10; font.letterSpacing: 1.0; Layout.topMargin: 4 }
                            Rectangle { Layout.fillWidth: true; Layout.preferredHeight: 1; color: "#30363d"; Layout.bottomMargin: 6 }

                            RowLayout {
                                Layout.fillWidth: true; implicitHeight: 44; spacing: 8
                                Label { text: "Countdown (s)"; color: "#c9d1d9"; font.pixelSize: 13; Layout.preferredWidth: 180 }
                                SpinBox { id: apprCountSpin; from: 5; to: 300; stepSize: 5; value: 60 }
                                Label { text: "Seconds before the timer fires the default action"; color: "#8b949e"; font.pixelSize: 11; Layout.fillWidth: true; wrapMode: Text.Wrap }
                            }
                            RowLayout {
                                Layout.fillWidth: true; implicitHeight: 44; spacing: 8
                                Label { text: "Timeout Action"; color: "#c9d1d9"; font.pixelSize: 13; Layout.preferredWidth: 180 }
                                ComboBox { id: apprTimeoutBox; model: ["approve", "reject"]; implicitWidth: 150 }
                                Label { text: "Action taken automatically when the countdown expires"; color: "#8b949e"; font.pixelSize: 11; Layout.fillWidth: true; wrapMode: Text.Wrap }
                            }
                            RowLayout {
                                Layout.fillWidth: true; implicitHeight: 44; spacing: 8
                                Label { text: "Always on Top"; color: "#c9d1d9"; font.pixelSize: 13; Layout.preferredWidth: 180 }
                                Switch { id: apprTopSwitch; checked: true }
                                Label { text: "Keep the approval dialog above all other windows"; color: "#8b949e"; font.pixelSize: 11; Layout.fillWidth: true; wrapMode: Text.Wrap }
                            }
                            Item { implicitHeight: 8 }
                        }
                    }

                    // ─────────────────────── 4: VS CODE ──────────────────────
                    Flickable {
                        clip: true
                        contentWidth: width
                        contentHeight: _vsCol.implicitHeight + 32
                        boundsBehavior: Flickable.StopAtBounds
                        ScrollBar.vertical: ScrollBar { policy: ScrollBar.AsNeeded }

                        ColumnLayout {
                            id: _vsCol
                            width: parent.width - 32
                            anchors { left: parent.left; top: parent.top; leftMargin: 16; topMargin: 12 }
                            spacing: 0

                            // Info banner
                            Rectangle {
                                Layout.fillWidth: true; implicitHeight: 34; radius: 4
                                color: "#0d2016"; border.color: "#3fb950"
                                Layout.topMargin: 4; Layout.bottomMargin: 10
                                Label {
                                    anchors { fill: parent; leftMargin: 10; rightMargin: 10 }
                                    text: "These settings are written to your VS Code user settings.json"
                                    color: "#3fb950"; font.pixelSize: 11
                                    verticalAlignment: Text.AlignVCenter
                                }
                            }

                            // ─ Connection ─────────────────────────────────────
                            Label { text: "CONNECTION"; color: "#8b949e"; font.pixelSize: 10; font.letterSpacing: 1.0 }
                            Rectangle { Layout.fillWidth: true; Layout.preferredHeight: 1; color: "#30363d"; Layout.bottomMargin: 6 }

                            RowLayout {
                                Layout.fillWidth: true; implicitHeight: 44; spacing: 8
                                Label { text: "MCP Port"; color: "#c9d1d9"; font.pixelSize: 13; Layout.preferredWidth: 180 }
                                SpinBox { id: vsMcpSpin; from: 1; to: 65535; value: 3457 }
                                Label { text: "Port VS Code uses to reach the MCP server"; color: "#8b949e"; font.pixelSize: 11; Layout.fillWidth: true }
                            }
                            RowLayout {
                                Layout.fillWidth: true; implicitHeight: 44; spacing: 8
                                Label { text: "Dashboard Port"; color: "#c9d1d9"; font.pixelSize: 13; Layout.preferredWidth: 180 }
                                SpinBox { id: vsDashSpin; from: 1; to: 65535; value: 3459 }
                                Label { text: "Port VS Code uses to reach the dashboard API"; color: "#8b949e"; font.pixelSize: 11; Layout.fillWidth: true }
                            }
                            RowLayout {
                                Layout.fillWidth: true; implicitHeight: 44; spacing: 8
                                Label { text: "Container Mode"; color: "#c9d1d9"; font.pixelSize: 13; Layout.preferredWidth: 180 }
                                ComboBox { id: vsContainerBox; model: ["auto","local","container"]; implicitWidth: 150 }
                                Label { text: "How VS Code connects to backend services"; color: "#8b949e"; font.pixelSize: 11; Layout.fillWidth: true }
                            }
                            RowLayout {
                                Layout.fillWidth: true; implicitHeight: 44; spacing: 8
                                Label { text: "Dashboard Panel"; color: "#c9d1d9"; font.pixelSize: 13; Layout.preferredWidth: 180 }
                                Switch { id: vsDashSwitch; checked: true }
                                Label { text: "Enable dashboard panel connection from VS Code"; color: "#8b949e"; font.pixelSize: 11; Layout.fillWidth: true }
                            }

                            // ─ Paths ──────────────────────────────────────────
                            Label { text: "PATHS"; color: "#8b949e"; font.pixelSize: 10; font.letterSpacing: 1.0; Layout.topMargin: 12 }
                            Rectangle { Layout.fillWidth: true; Layout.preferredHeight: 1; color: "#30363d"; Layout.bottomMargin: 6 }

                            RowLayout {
                                Layout.fillWidth: true; implicitHeight: 44; spacing: 8
                                Label { text: "Agents Root"; color: "#c9d1d9"; font.pixelSize: 13; Layout.preferredWidth: 180 }
                                TextField {
                                    id: vsAgentsField; implicitWidth: 300; implicitHeight: 34; color: "#c9d1d9"
                                    placeholderText: "Path to agent templates (MBS_AGENTS_ROOT)"
                                    background: Rectangle { color: "#1c2128"; radius: 4; border.color: "#444" }
                                }
                            }
                            RowLayout {
                                Layout.fillWidth: true; implicitHeight: 44; spacing: 8
                                Label { text: "Skills Root"; color: "#c9d1d9"; font.pixelSize: 13; Layout.preferredWidth: 180 }
                                TextField {
                                    id: vsSkillsField; implicitWidth: 300; implicitHeight: 34; color: "#c9d1d9"
                                    placeholderText: "Path to skills directory"
                                    background: Rectangle { color: "#1c2128"; radius: 4; border.color: "#444" }
                                }
                            }
                            RowLayout {
                                Layout.fillWidth: true; implicitHeight: 44; spacing: 8
                                Label { text: "Instructions Root"; color: "#c9d1d9"; font.pixelSize: 13; Layout.preferredWidth: 180 }
                                TextField {
                                    id: vsInstrField; implicitWidth: 300; implicitHeight: 34; color: "#c9d1d9"
                                    placeholderText: "Path to instruction files (MBS_INSTRUCTIONS_ROOT)"
                                    background: Rectangle { color: "#1c2128"; radius: 4; border.color: "#444" }
                                }
                            }

                            // ─ Auto-Deploy ────────────────────────────────────
                            Label { text: "AUTO-DEPLOY"; color: "#8b949e"; font.pixelSize: 10; font.letterSpacing: 1.0; Layout.topMargin: 12 }
                            Rectangle { Layout.fillWidth: true; Layout.preferredHeight: 1; color: "#30363d"; Layout.bottomMargin: 6 }

                            RowLayout {
                                Layout.fillWidth: true; implicitHeight: 44; spacing: 8
                                Label { text: "Deploy on Open"; color: "#c9d1d9"; font.pixelSize: 13; Layout.preferredWidth: 180 }
                                Switch { id: vsAutoDeploySwitch; checked: false }
                                Label { text: "Auto-deploy agents and instructions when a workspace opens"; color: "#8b949e"; font.pixelSize: 11; Layout.fillWidth: true; wrapMode: Text.Wrap }
                            }
                            RowLayout {
                                Layout.fillWidth: true; implicitHeight: 44; spacing: 8
                                Label { text: "Auto-Deploy Skills"; color: "#c9d1d9"; font.pixelSize: 13; Layout.preferredWidth: 180 }
                                Switch { id: vsSkillDeploySwitch; checked: false }
                                Label { text: "Deploy skills on open even when full auto-deploy is off"; color: "#8b949e"; font.pixelSize: 11; Layout.fillWidth: true; wrapMode: Text.Wrap }
                            }

                            // ─ Notifications ──────────────────────────────────
                            Label { text: "NOTIFICATIONS"; color: "#8b949e"; font.pixelSize: 10; font.letterSpacing: 1.0; Layout.topMargin: 12 }
                            Rectangle { Layout.fillWidth: true; Layout.preferredHeight: 1; color: "#30363d"; Layout.bottomMargin: 6 }

                            RowLayout {
                                Layout.fillWidth: true; implicitHeight: 44; spacing: 8
                                Label { text: "Notifications"; color: "#c9d1d9"; font.pixelSize: 13; Layout.preferredWidth: 180 }
                                Switch { id: vsNotifSwitch; checked: true }
                                Label { text: "Master switch for all Project Memory toast notifications"; color: "#8b949e"; font.pixelSize: 11; Layout.fillWidth: true }
                            }
                            RowLayout {
                                Layout.fillWidth: true; implicitHeight: 44; spacing: 8
                                Label { text: "Agent Handoffs"; color: "#c9d1d9"; font.pixelSize: 13; Layout.preferredWidth: 180 }
                                Switch { id: vsHandoffSwitch; checked: true }
                                Label { text: "Show notification when an agent hands off"; color: "#8b949e"; font.pixelSize: 11; Layout.fillWidth: true }
                            }
                            RowLayout {
                                Layout.fillWidth: true; implicitHeight: 44; spacing: 8
                                Label { text: "Plan Complete"; color: "#c9d1d9"; font.pixelSize: 13; Layout.preferredWidth: 180 }
                                Switch { id: vsCompleteSwitch; checked: true }
                                Label { text: "Show notification when a plan is archived"; color: "#8b949e"; font.pixelSize: 11; Layout.fillWidth: true }
                            }
                            RowLayout {
                                Layout.fillWidth: true; implicitHeight: 44; spacing: 8
                                Label { text: "Step Blocked"; color: "#c9d1d9"; font.pixelSize: 13; Layout.preferredWidth: 180 }
                                Switch { id: vsBlockedSwitch; checked: true }
                                Label { text: "Show notification when a plan step becomes blocked"; color: "#8b949e"; font.pixelSize: 11; Layout.fillWidth: true }
                            }

                            // ─ Supervisor Launcher ────────────────────────────
                            Label { text: "SUPERVISOR LAUNCHER"; color: "#8b949e"; font.pixelSize: 10; font.letterSpacing: 1.0; Layout.topMargin: 12 }
                            Rectangle { Layout.fillWidth: true; Layout.preferredHeight: 1; color: "#30363d"; Layout.bottomMargin: 6 }

                            RowLayout {
                                Layout.fillWidth: true; implicitHeight: 44; spacing: 8
                                Label { text: "Startup Mode"; color: "#c9d1d9"; font.pixelSize: 13; Layout.preferredWidth: 180 }
                                ComboBox { id: vsStartupBox; model: ["off","prompt","auto"]; implicitWidth: 150 }
                                Label { text: "When VS Code detects or launches the supervisor"; color: "#8b949e"; font.pixelSize: 11; Layout.fillWidth: true }
                            }
                            RowLayout {
                                Layout.fillWidth: true; implicitHeight: 44; spacing: 8
                                Label { text: "Launcher Path"; color: "#c9d1d9"; font.pixelSize: 13; Layout.preferredWidth: 180 }
                                TextField {
                                    id: vsLauncherField; implicitWidth: 300; implicitHeight: 34; color: "#c9d1d9"
                                    placeholderText: "Path to start-supervisor.ps1 or supervisor.exe"
                                    background: Rectangle { color: "#1c2128"; radius: 4; border.color: "#444" }
                                }
                            }
                            RowLayout {
                                Layout.fillWidth: true; implicitHeight: 44; spacing: 8
                                Label { text: "Detect Timeout"; color: "#c9d1d9"; font.pixelSize: 13; Layout.preferredWidth: 180 }
                                SpinBox { id: vsDetectSpin; from: 100; to: 10000; stepSize: 100; value: 1000 }
                                Label { text: "ms \u2013 timeout detecting an already-running supervisor"; color: "#8b949e"; font.pixelSize: 11; Layout.fillWidth: true }
                            }
                            RowLayout {
                                Layout.fillWidth: true; implicitHeight: 44; spacing: 8
                                Label { text: "Startup Timeout"; color: "#c9d1d9"; font.pixelSize: 13; Layout.preferredWidth: 180 }
                                SpinBox { id: vsStartupSpin; from: 1000; to: 60000; stepSize: 1000; value: 15000 }
                                Label { text: "ms \u2013 max wait for supervisor to reach ready state"; color: "#8b949e"; font.pixelSize: 11; Layout.fillWidth: true }
                            }
                            Item { implicitHeight: 8 }
                        }
                    }

                } // end StackLayout
            } // end content Rectangle
        } // end body RowLayout

        // ── Footer ────────────────────────────────────────────────────────────
        RowLayout {
            Layout.fillWidth: true
            spacing: 8
            Label {
                id: errLabel
                visible: text !== ""; text: ""
                color: "#f44336"; font.pixelSize: 12
                wrapMode: Text.Wrap; Layout.fillWidth: true
            }
            Button {
                text: "Cancel"
                onClicked: panel.visible = false
            }
            Button {
                text: "Save"
                highlighted: true
                onClicked: panel._saveSettings()
            }
        }

    } // end main ColumnLayout
} // end panel Rectangle
