import QtQuick 2.15
import QtQuick.Controls 2.15
import QtQuick.Controls.Material 2.15
import QtQuick.Layouts 1.15

/// Reusable service-card panel used by the supervisor grid.
///
/// Usage:
///   ServiceCard {
///       serviceName:  "MCP Server"
///       status:       bridge.mcpStatus
///       accentColor:  "#ff90e8"
///       iconBgColor:  "#1a1628"
///       iconDelegate: Component { Canvas { anchors.fill: parent; onPaint: { … } } }
///       infoLine1: "PID: " + bridge.mcpPid + "   Port: " + bridge.mcpPort
///       infoLine2: "Runtime: …"
///       primaryActionLabel: "Restart"
///       onPrimaryActionClicked: bridge.restartService("mcp")
///       secondaryActionLabel: "Manage"
///   }
Rectangle {
    id: card
    Material.theme: Material.Dark

    // ── Identity & state ────────────────────────────────────────────────────
    property string serviceName:  ""
    property string status:       ""
    property color  accentColor:  "#ffffff"
    property color  iconBgColor:  "#1c2128"

    // ── Icon ─────────────────────────────────────────────────────────────────
    /// Supply a Component whose root item draws the 32×32 service icon.
    /// Example: Component { Canvas { anchors.fill: parent; onPaint: { … } } }
    property Component iconDelegate: null

    // ── Info labels ──────────────────────────────────────────────────────────
    property string infoLine1:   ""                // visible when Running
    property string infoLine2:   ""                // visible when Running
    property string infoAlways:  ""                // always visible (e.g. proxy route)
    property string offlineText: "Service offline" // visible when NOT Running; set "" to suppress

    // ── Primary action button (always shown) ──────────────────────────────────
    property string primaryActionLabel:   "Restart"
    property bool   primaryActionEnabled: true
    signal primaryActionClicked()

    // ── Secondary action button (hidden when label is "") ─────────────────────
    property string secondaryActionLabel:   ""
    property bool   secondaryActionEnabled: true
    signal secondaryActionClicked()

    // ── Optional runtime info strip (e.g. Interactive Terminal) ──────────────
    property bool   showRuntimeStrip:  false
    property string runtimeStripLabel: "runtime"
    property string runtimeStripValue: "--"

    // ── Appearance ────────────────────────────────────────────────────────────
    color:        "#161b22"
    radius:       10
    border.color: "#30363d"
    Layout.fillWidth: true
    implicitHeight: _cardCol.implicitHeight + 20

    // ── Derived status colour ─────────────────────────────────────────────────
    readonly property color _statusColor: {
        if (card.status === "Running")                           return "#3fb950"
        if (card.status === "Starting" || card.status === "Stopping") return "#ffeb3b"
        if (card.status === "Error"    || card.status === "Stopped")  return "#f85149"
        return "#9e9e9e"
    }

    ColumnLayout {
        id: _cardCol
        anchors { left: parent.left; right: parent.right; top: parent.top; margins: 12 }
        spacing: 8

        // ── Header row ────────────────────────────────────────────────────────
        RowLayout {
            Layout.fillWidth: true; spacing: 8

            // Icon box
            Rectangle {
                Layout.preferredWidth: 28; Layout.preferredHeight: 28
                radius: 4; color: card.iconBgColor
                Loader {
                    anchors.fill: parent
                    sourceComponent: card.iconDelegate
                }
            }

            Label {
                text: card.serviceName
                font.bold: true; font.pixelSize: 12; color: "#c9d1d9"
                Layout.fillWidth: true
            }

            // Status indicator
            RowLayout {
                spacing: 4
                Rectangle {
                    Layout.preferredWidth: 7; Layout.preferredHeight: 7; radius: 3
                    color: card._statusColor
                }
                Label { text: card.status; font.pixelSize: 11; color: card._statusColor }
            }
        }

        // ── Body row ──────────────────────────────────────────────────────────
        RowLayout {
            Layout.fillWidth: true; spacing: 8

            StatusRing {
                status:      card.status
                accentColor: card.accentColor
            }

            ColumnLayout {
                Layout.fillWidth: true; spacing: 3

                Label {
                    text: card.infoLine1; font.pixelSize: 11; color: "#8b949e"
                    visible: card.status === "Running" && card.infoLine1 !== ""
                }
                Label {
                    text: card.infoLine2; font.pixelSize: 11; color: "#8b949e"
                    visible: card.status === "Running" && card.infoLine2 !== ""
                }
                Label {
                    text: card.infoAlways; font.pixelSize: 11; color: "#8b949e"
                    visible: card.infoAlways !== ""
                }
                Label {
                    text: card.offlineText; font.pixelSize: 11; color: "#8b949e"
                    visible: card.status !== "Running" && card.offlineText !== ""
                }
            }

            RowLayout {
                spacing: 6
                Button {
                    text:    card.secondaryActionLabel
                    visible: card.secondaryActionLabel !== ""
                    enabled: card.secondaryActionEnabled
                    implicitHeight: 32; leftPadding: 12; rightPadding: 12; font.pixelSize: 12
                    onClicked: card.secondaryActionClicked()
                }
                Button {
                    text:    card.primaryActionLabel
                    enabled: card.primaryActionEnabled
                    implicitHeight: 32; leftPadding: 12; rightPadding: 12; font.pixelSize: 12
                    onClicked: card.primaryActionClicked()
                }
            }
        }

        // ── Runtime strip (optional) ──────────────────────────────────────────
        Rectangle {
            visible: card.showRuntimeStrip
            Layout.fillWidth: true; implicitHeight: 26
            color: "#0d1117"; radius: 4; border.color: "#30363d"
            RowLayout {
                anchors { fill: parent; leftMargin: 8; rightMargin: 8 }
                Label { text: card.runtimeStripLabel; font.pixelSize: 10; color: "#8b949e" }
                Label {
                    text: card.runtimeStripValue
                    font.pixelSize: 11; color: "#c9d1d9"; font.family: "Consolas"
                    Layout.fillWidth: true; elide: Text.ElideRight
                }
            }
        }
    }
}
