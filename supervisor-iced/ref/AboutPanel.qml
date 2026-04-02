import QtQuick 2.15
import QtQuick.Controls 2.15
import QtQuick.Controls.Material 2.15
import QtQuick.Layouts 1.15

// Full-window "About / Changelog" overlay.  Shown by clicking "About" in the
// footer.  Also surfaces the upgrade report (if any) with a dismiss button.
// Usage:
//   AboutPanel {
//       id: aboutOverlay
//       bridge: supervisorGuiBridge
//   }
Rectangle {
    id: root

    required property var bridge

    anchors.fill: parent
    visible: false
    color: "#0f1319"
    z: 10

    // ── Theme palette (mirrors main.qml) ─────────────────────────────────────
    readonly property color bgCard:       "#1c2128"
    readonly property color borderSubtle: "#30363d"
    readonly property color textPrimary:  "#c9d1d9"
    readonly property color textSecondary:"#8b949e"
    readonly property color textAccent:   "#58a6ff"
    readonly property color clrGreen:     "#3fb950"
    readonly property color clrRed:       "#f85149"
    readonly property color clrYellow:    "#ffeb3b"

    // ── Upgrade-report parsed once so all children read a single property ─────
    readonly property var upgradeReport: {
        var raw = bridge.upgradeReportJson
        if (!raw || raw === "") return null
        try { return JSON.parse(raw) } catch(e) { return null }
    }

    // ── Services-after key list for the upgrade report badge Repeater.
    //    Declared at root scope so qmllint can resolve the member access.
    readonly property var upgradeServiceKeys: root.upgradeReport !== null
        ? Object.keys(root.upgradeReport.services_after || {})
        : []

    // ── Port map model — computed once so the Repeater doesn't call bridge.X
    //    inside a model array literal (qmllint unqualified-access).
    readonly property var servicePortModel: [
        { svcName: "MCP Server",           port: root.bridge.mcpPort,      runtime: "node dist/index.js",             desc: "VS Code / Claude MCP endpoint" },
        { svcName: "CLI MCP Server",        port: 3466,                     runtime: "node dist/index-cli.js",           desc: "HTTP-only MCP for CLI agents" },
        { svcName: "Interactive Terminal",  port: root.bridge.terminalPort, runtime: "interactive-terminal.exe",         desc: "WebSocket terminal sessions" },
        { svcName: "Dashboard",             port: root.bridge.dashboardPort,runtime: "node dist/index.js",               desc: "Web dashboard UI" },
        { svcName: "Fallback REST API",     port: 3465,                     runtime: "node dist/fallback-rest-main.js",  desc: "REST fallback for remote control" },
        { svcName: "Supervisor GUI",        port: 3464,                     runtime: "supervisor.exe (Qt)",              desc: "GUI HTTP server + form apps" },
    ]

    // ── Layout ────────────────────────────────────────────────────────────────
    ColumnLayout {
        anchors.fill: parent
        anchors.margins: 24
        spacing: 16

        // ── Header row ───────────────────────────────────────────────────────
        RowLayout {
            Layout.fillWidth: true
            spacing: 12

            Label {
                text: "About Project Memory Supervisor"
                font.pixelSize: 20
                font.bold: true
                color: root.textPrimary
                Layout.fillWidth: true
            }

            Button {
                text: "Close"
                flat: true
                onClicked: root.visible = false
            }
        }

        // ── Scrollable body ──────────────────────────────────────────────────
        Flickable {
            Layout.fillWidth: true
            Layout.fillHeight: true
            clip: true
            boundsBehavior: Flickable.StopAtBounds
            contentHeight: bodyColumn.implicitHeight
            ScrollBar.vertical: ScrollBar { policy: ScrollBar.AsNeeded }

            ColumnLayout {
                id: bodyColumn
                width: parent.width
                spacing: 16

                // ── Version card ─────────────────────────────────────────────
                Rectangle {
                    Layout.fillWidth: true
                    color: root.bgCard
                    border.color: root.borderSubtle
                    border.width: 1
                    radius: 6
                    implicitHeight: versionCol.implicitHeight + 24

                    ColumnLayout {
                        id: versionCol
                        anchors { left: parent.left; right: parent.right; top: parent.top; margins: 12 }
                        spacing: 6

                        Label {
                            text: "VERSION"
                            font.pixelSize: 10; font.letterSpacing: 1.0
                            color: root.textSecondary
                        }

                        Label {
                            text: "Project Memory Supervisor v" + (root.bridge.supervisorVersion || "\u2014")
                            font.pixelSize: 15
                            font.bold: true
                            color: root.textAccent
                        }

                        Label {
                            text: "Runtime: Rust + Qt/QML (CxxQt)"
                            font.pixelSize: 12
                            color: root.textSecondary
                        }
                    }
                }

                // ── Service port map ─────────────────────────────────────────
                Rectangle {
                    Layout.fillWidth: true
                    color: root.bgCard
                    border.color: root.borderSubtle
                    border.width: 1
                    radius: 6
                    implicitHeight: portMapCol.implicitHeight + 24

                    ColumnLayout {
                        id: portMapCol
                        anchors { left: parent.left; right: parent.right; top: parent.top; margins: 12 }
                        spacing: 6

                        Label {
                            text: "MANAGED SERVICES"
                            font.pixelSize: 10; font.letterSpacing: 1.0
                            color: root.textSecondary
                        }

                        RowLayout {
                            Layout.fillWidth: true
                            Label { text: "Service";  font.pixelSize: 11; font.bold: true; color: root.textSecondary; Layout.preferredWidth: 200 }
                            Label { text: "Port";     font.pixelSize: 11; font.bold: true; color: root.textSecondary; Layout.preferredWidth: 70 }
                            Label { text: "Runtime";  font.pixelSize: 11; font.bold: true; color: root.textSecondary; Layout.fillWidth: true }
                        }

                        // Divider — use Layout.preferredHeight (not height) on a Layout child
                        Rectangle { Layout.fillWidth: true; Layout.preferredHeight: 1; color: root.borderSubtle }

                        Repeater {
                            model: root.servicePortModel
                            delegate: RowLayout {
                                // qmllint disable unqualified
                                id: svcRow
                                required property var modelData
                                Layout.fillWidth: true

                                Label {
                                    text: svcRow.modelData.svcName
                                    font.pixelSize: 12
                                    color: root.textPrimary
                                    Layout.preferredWidth: 200
                                }
                                Label {
                                    text: svcRow.modelData.port > 0 ? svcRow.modelData.port : "\u2014"
                                    font.pixelSize: 12
                                    font.family: "monospace"
                                    color: root.textAccent
                                    Layout.preferredWidth: 70
                                }
                                Label {
                                    text: svcRow.modelData.runtime
                                    font.pixelSize: 11
                                    color: root.textSecondary
                                    elide: Text.ElideRight
                                    Layout.fillWidth: true
                                    ToolTip.visible: svcHover.hovered
                                    ToolTip.text: svcRow.modelData.desc
                                    HoverHandler { id: svcHover }
                                }
                                // qmllint enable unqualified
                            }
                        }
                    }
                }

                // ── REST API quick-reference ──────────────────────────────────
                Rectangle {
                    Layout.fillWidth: true
                    color: root.bgCard
                    border.color: root.borderSubtle
                    border.width: 1
                    radius: 6
                    implicitHeight: apiCol.implicitHeight + 24

                    ColumnLayout {
                        id: apiCol
                        anchors { left: parent.left; right: parent.right; top: parent.top; margins: 12 }
                        spacing: 6

                        Label {
                            text: "FALLBACK REST API  \u2014  port 3465"
                            font.pixelSize: 10; font.letterSpacing: 1.0
                            color: root.textSecondary
                        }

                        Repeater {
                            model: [
                                "GET  /api/fallback/health                        \u2014 server health check",
                                "GET  /api/fallback/services                      \u2014 all service statuses",
                                "GET  /api/fallback/services/:svc/health          \u2014 per-service health",
                                "POST /api/fallback/services/:svc/start           \u2014 start a service",
                                "POST /api/fallback/services/:svc/stop            \u2014 stop a service",
                                "POST /api/fallback/services/:svc/restart         \u2014 restart a service",
                                "POST /api/fallback/services/mcp/upgrade          \u2014 zero-downtime MCP upgrade",
                                "POST /api/fallback/services/:svc/build-restart   \u2014 rebuild + restart",
                                "POST /api/fallback/services/supervisor/upgrade   \u2014 full supervisor upgrade",
                                "GET  /api/fallback/runtime/recent                \u2014 recent stdout/stderr",
                                "GET  /api/fallback/workspaces                    \u2014 list workspaces",
                                "POST /api/fallback/gui/launch                    \u2014 launch a form-app GUI",
                            ]

                            delegate: Label {
                                // qmllint disable unqualified
                                required property string modelData
                                text: modelData
                                font.pixelSize: 11
                                font.family: "monospace"
                                color: root.textPrimary
                                wrapMode: Text.NoWrap
                                // qmllint enable unqualified
                            }
                        }
                    }
                }

                // ── Upgrade report ────────────────────────────────────────────
                // Plain Rectangle with visible: — no Loader/Component so root.X stays in scope.
                Rectangle {
                    id: upgradeCard
                    Layout.fillWidth: true
                    visible: root.upgradeReport !== null
                    color: root.bgCard
                    border.color: root.upgradeReport !== null
                        ? (root.upgradeReport.status === "success" ? root.clrGreen
                           : root.upgradeReport.status === "partial" ? root.clrYellow
                           : root.clrRed)
                        : root.borderSubtle
                    border.width: 1
                    radius: 6
                    implicitHeight: visible ? rptCol.implicitHeight + 24 : 0

                    ColumnLayout {
                        id: rptCol
                        anchors { left: parent.left; right: parent.right; top: parent.top; margins: 12 }
                        spacing: 8

                        // Report header
                        RowLayout {
                            Layout.fillWidth: true
                            spacing: 8

                            Label {
                                text: "LAST UPGRADE REPORT"
                                font.pixelSize: 10; font.letterSpacing: 1.0
                                color: root.textSecondary
                                Layout.fillWidth: true
                            }

                            Button {
                                text: "Dismiss"
                                flat: true
                                font.pixelSize: 11
                                onClicked: root.bridge.dismissUpgradeReport()
                            }
                        }

                        RowLayout {
                            spacing: 8
                            Label {
                                text: {
                                    if (root.upgradeReport === null) return ""
                                    var s = root.upgradeReport.status
                                    if (s === "success") return "\u2713  Success"
                                    if (s === "partial") return "\u26a0  Partial"
                                    return "\u2717  Failed"
                                }
                                font.pixelSize: 14; font.bold: true
                                color: {
                                    if (root.upgradeReport === null) return root.textSecondary
                                    var s = root.upgradeReport.status
                                    if (s === "success") return root.clrGreen
                                    if (s === "partial") return root.clrYellow
                                    return root.clrRed
                                }
                            }
                            Label {
                                text: root.upgradeReport !== null ? root.upgradeReport.timestamp : ""
                                font.pixelSize: 11
                                color: root.textSecondary
                            }
                        }

                        // Steps
                        Repeater {
                            model: root.upgradeReport !== null ? root.upgradeReport.steps : []
                            delegate: RowLayout {
                                // qmllint disable unqualified
                                id: stepRow
                                required property var modelData
                                spacing: 6

                                Label {
                                    text: stepRow.modelData.status === "ok" ? "\u2713"
                                        : stepRow.modelData.status === "failed" ? "\u2717" : "?"
                                    font.pixelSize: 12
                                    color: stepRow.modelData.status === "ok" ? root.clrGreen
                                         : stepRow.modelData.status === "failed" ? root.clrRed
                                         : root.clrYellow
                                }
                                Label {
                                    text: "Step " + stepRow.modelData.step + ": " + stepRow.modelData.name
                                          + "  (" + stepRow.modelData.elapsed_ms + " ms)"
                                    font.pixelSize: 12
                                    color: root.textPrimary
                                    Layout.preferredWidth: 340
                                }
                                Label {
                                    text: stepRow.modelData.detail || ""
                                    font.pixelSize: 11
                                    color: root.textSecondary
                                    elide: Text.ElideRight
                                    Layout.fillWidth: true
                                }
                                // qmllint enable unqualified
                            }
                        }

                        Rectangle { Layout.fillWidth: true; Layout.preferredHeight: 1; color: root.borderSubtle }

                        Label {
                            text: "Services after upgrade:"
                            font.pixelSize: 11; font.bold: true
                            color: root.textSecondary
                        }

                        // Services-after badges — keyed from root.upgradeServiceKeys so the
                        // member resolves at root scope (avoiding unqualified-access warnings).
                        Repeater {
                            model: root.upgradeServiceKeys
                            delegate: Rectangle {
                                // qmllint disable unqualified
                                id: svcBadge
                                required property string modelData
                                readonly property var svcInfo: root.upgradeReport !== null
                                    ? (root.upgradeReport.services_after[svcBadge.modelData] || {})
                                    : ({})
                                color: svcBadge.svcInfo.reachable ? "#1a2e1a" : "#2e1a1a"
                                border.color: svcBadge.svcInfo.reachable ? root.clrGreen : root.clrRed
                                border.width: 1
                                radius: 4
                                implicitWidth: badgeLabel.implicitWidth + 16
                                implicitHeight: badgeLabel.implicitHeight + 8

                                Label {
                                    id: badgeLabel
                                    anchors.centerIn: parent
                                    text: svcBadge.modelData + " :" + (svcBadge.svcInfo.port || "?")
                                    font.pixelSize: 11
                                    font.family: "monospace"
                                    color: svcBadge.svcInfo.reachable ? root.clrGreen : root.clrRed
                                }
                                // qmllint enable unqualified
                            }
                        }

                        Label {
                            visible: root.upgradeReport !== null && root.upgradeReport.build_output_path
                            text: "Build log: " + (root.upgradeReport !== null ? (root.upgradeReport.build_output_path || "") : "")
                            font.pixelSize: 10
                            font.family: "monospace"
                            color: root.textSecondary
                            wrapMode: Text.WrapAnywhere
                            Layout.fillWidth: true
                        }
                    }
                }

                // ── Notes ────────────────────────────────────────────────────
                Rectangle {
                    Layout.fillWidth: true
                    color: root.bgCard
                    border.color: root.borderSubtle
                    border.width: 1
                    radius: 6
                    implicitHeight: notesCol.implicitHeight + 24

                    ColumnLayout {
                        id: notesCol
                        anchors { left: parent.left; right: parent.right; top: parent.top; margins: 12 }
                        spacing: 6

                        Label {
                            text: "NOTES"
                            font.pixelSize: 10; font.letterSpacing: 1.0
                            color: root.textSecondary
                        }

                        Repeater {
                            model: [
                                "\u2022 Closing the window minimises to the system tray \u2014 the supervisor keeps running.",
                                "\u2022 Right-click the tray icon for quick restart shortcuts.",
                                "\u2022 The Fallback REST API (port 3465) remains reachable even when the GUI is minimised.",
                                "\u2022 Upgrade reports are shown here once and then cleared on dismiss.",
                                "\u2022 Config file: %APPDATA%\\ProjectMemory\\supervisor.toml",
                                "\u2022 Ports manifest (live): %APPDATA%\\ProjectMemory\\ports.json",
                            ]
                            delegate: Label {
                                // qmllint disable unqualified
                                required property string modelData
                                text: modelData
                                font.pixelSize: 12
                                color: root.textPrimary
                                wrapMode: Text.WordWrap
                                Layout.fillWidth: true
                                // qmllint enable unqualified
                            }
                        }
                    }
                }

            } // end bodyColumn
        } // end Flickable
    } // end outer ColumnLayout
}
