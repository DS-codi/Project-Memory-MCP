import QtQuick 2.15
import QtQuick.Controls 2.15
import QtQuick.Controls.Material 2.15
import QtQuick.Layouts 1.15

/// MCP Proxy stats panel with real connection-count sparkline.
Rectangle {
    id: proxyPanel
    Material.theme: Material.Dark

    property int    totalConnections: 0
    property int    activeInstances:  0
    property string distribution:     ""

    color:        "#161b22"
    radius:       10
    border.color: "#30363d"
    Layout.fillWidth: true
    implicitHeight: 100

    // ── Real connection history for sparkline ────────────────────────────────
    // Stores up to 40 samples of totalConnections; updated on every change.
    property var _history: []

    onTotalConnectionsChanged: {
        var h = _history.slice()
        h.push(totalConnections)
        if (h.length > 40) h = h.slice(h.length - 40)
        _history = h
        sparklineCanvas.requestPaint()
    }

    // ── UI ───────────────────────────────────────────────────────────────────
    ColumnLayout {
        anchors { left: parent.left; right: parent.right; top: parent.top; margins: 10 }
        spacing: 6

        Label {
            text: "MCP PROXY"
            font.pixelSize: 10; font.letterSpacing: 1.0; color: "#8b949e"
        }

        RowLayout {
            spacing: 16; Layout.fillWidth: true

            // Total connections counter
            ColumnLayout {
                spacing: 2
                Label {
                    text: "" + proxyPanel.totalConnections
                    font.pixelSize: 22; font.bold: true; color: "#c9d1d9"
                }
                Label { text: "Total Connections"; font.pixelSize: 10; color: "#8b949e" }
            }

            // Active instances counter
            ColumnLayout {
                spacing: 2
                Label {
                    text: "" + proxyPanel.activeInstances
                    font.pixelSize: 22; font.bold: true; color: "#c9d1d9"
                }
                Label { text: "Active Instances"; font.pixelSize: 10; color: "#8b949e" }
            }

            // Sparkline — drawn from real _history samples
            Canvas {
                id: sparklineCanvas
                Layout.fillWidth: true; implicitHeight: 30

                Component.onCompleted: requestPaint()

                onPaint: {
                    var ctx = getContext("2d")
                    ctx.clearRect(0, 0, width, height)

                    var h = proxyPanel._history
                    ctx.strokeStyle = "#58a6ff"
                    ctx.lineWidth   = 1.5

                    if (h.length < 2) {
                        // Not enough data yet — draw a dim flat baseline
                        ctx.globalAlpha = 0.25
                        ctx.beginPath()
                        ctx.moveTo(0, height / 2)
                        ctx.lineTo(width, height / 2)
                        ctx.stroke()
                        return
                    }

                    ctx.globalAlpha = 1.0
                    var maxVal = Math.max.apply(null, h)
                    if (maxVal === 0) maxVal = 1

                    ctx.beginPath()
                    for (var i = 0; i < h.length; i++) {
                        var px = i * width  / (h.length - 1)
                        var py = (1.0 - h[i] / maxVal) * (height - 4) + 2
                        if (i === 0) ctx.moveTo(px, py)
                        else         ctx.lineTo(px, py)
                    }
                    ctx.stroke()
                }
            }

            // Instance distribution label
            Label {
                text: proxyPanel.distribution
                font.pixelSize: 11; color: "#8b949e"
                visible: proxyPanel.totalConnections > 0
                wrapMode: Text.WordWrap
            }
        }
    }
}
