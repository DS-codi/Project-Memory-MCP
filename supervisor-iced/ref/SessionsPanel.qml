pragma ComponentBehavior: Bound
import QtQuick 2.15
import QtQuick.Controls 2.15
import QtQuick.Controls.Material 2.15
import QtQuick.Layouts 1.15

/// Active agent sessions panel — polls /sessions/live every 5 seconds.
Rectangle {
    id: sessionsPanel
    Material.theme: Material.Dark

    property string mcpBaseUrl: ""
    property int    mcpPort:    0

    color:        "#161b22"
    radius:       10
    border.color: "#30363d"
    Layout.fillWidth: true
    implicitHeight: 200

    // ── Data & helpers ───────────────────────────────────────────────────────
    ListModel { id: sessionsList }

    function stopSession(sessionKey) {
        var xhr = new XMLHttpRequest()
        xhr.open("POST", sessionsPanel.mcpBaseUrl + "/sessions/stop")
        xhr.setRequestHeader("Content-Type", "application/json")
        xhr.send(JSON.stringify({ sessionKey: sessionKey }))
    }

    Timer {
        interval: 5000; running: true; repeat: true
        onTriggered: {
            if (sessionsPanel.mcpPort <= 0) return
            var xhr = new XMLHttpRequest()
            xhr.onreadystatechange = function() {
                if (xhr.readyState !== XMLHttpRequest.DONE || xhr.status !== 200) return
                try {
                    var raw  = JSON.parse(xhr.responseText)
                    var keys = Object.keys(raw)
                    var now  = new Date().getTime()
                    var staleMs = 10 * 60 * 1000
                    sessionsList.clear()
                    for (var i = 0; i < keys.length && i < 20; i++) {
                        var s = raw[keys[i]]
                        if (s.lastCallAt) {
                            if (now - new Date(s.lastCallAt).getTime() > staleMs) continue
                        }
                        sessionsList.append({
                            agentType:  s.agentType || "?",
                            sessionId:  s.serverSessionId || keys[i],
                            sessionKey: (s.workspaceId || "") + "::" +
                                        (s.planId     || "") + "::" +
                                        (s.serverSessionId || keys[i])
                        })
                    }
                } catch(e) {}
            }
            xhr.open("GET", sessionsPanel.mcpBaseUrl + "/sessions/live")
            xhr.send()
        }
    }

    // ── UI ───────────────────────────────────────────────────────────────────
    ColumnLayout {
        anchors.fill: parent; anchors.margins: 10; spacing: 6

        Label {
            text: "ACTIVE SESSIONS"
            font.pixelSize: 10; font.letterSpacing: 1.0; color: "#8b949e"
        }

        RowLayout {
            spacing: 0; Layout.fillWidth: true
            Label { text: "SESSION ID"; font.pixelSize: 10; color: "#8b949e"; Layout.preferredWidth: 120 }
            Label { text: "AGENT";      font.pixelSize: 10; color: "#8b949e"; Layout.fillWidth: true }
            Label { text: "STATUS";     font.pixelSize: 10; color: "#8b949e"; Layout.preferredWidth: 60 }
            Label { text: "ACTIONS";    font.pixelSize: 10; color: "#8b949e"; Layout.preferredWidth: 65 }
        }

        Rectangle { Layout.fillWidth: true; Layout.preferredHeight: 1; color: "#30363d" }

        ScrollView {
            Layout.fillWidth: true; Layout.fillHeight: true; clip: true; contentWidth: availableWidth

            ColumnLayout {
                width: parent.width; spacing: 2

                Repeater {
                    id: sessionsRepeater
                    model: sessionsList
                    delegate: RowLayout {
                        id: sessionRow
                        required property string sessionId
                        required property string agentType
                        required property string sessionKey

                        function requestStop() { sessionsPanel.stopSession(sessionKey) }

                        Layout.fillWidth: true; spacing: 0; implicitHeight: 28

                        Label {
                            text: sessionRow.sessionId.slice(0, 14)
                            font.pixelSize: 11; font.family: "Consolas"; color: "#c9d1d9"
                            Layout.preferredWidth: 120; elide: Text.ElideRight
                        }
                        Label {
                            text: sessionRow.agentType
                            font.pixelSize: 11; color: "#c9d1d9"; Layout.fillWidth: true
                        }
                        Rectangle {
                            Layout.preferredWidth: 60; Layout.preferredHeight: 18
                            color: "#0e2318"; radius: 10
                            Label {
                                anchors.centerIn: parent
                                text: "ACTIVE"; font.pixelSize: 9; font.bold: true; color: "#3fb950"
                            }
                        }
                        Button {
                            text: "Stop"
                            implicitHeight: 24; leftPadding: 8; rightPadding: 8
                            font.pixelSize: 11; Layout.preferredWidth: 65
                            onClicked: sessionRow.requestStop()
                        }
                    }
                }

                Label {
                    visible: sessionsRepeater.count === 0
                    text: "No active sessions"
                    color: "#8b949e"; font.pixelSize: 12; Layout.fillWidth: true
                }
            }
        }
    }
}
