pragma ComponentBehavior: Bound
import QtQuick 2.15
import QtQuick.Controls 2.15
import QtQuick.Controls.Material 2.15
import QtQuick.Layouts 1.15

/// Recent agent activity feed — polls /api/events every 3 seconds.
/// Displays agent name, event type, and a short HH:MM timestamp.
Rectangle {
    id: actPane
    Material.theme: Material.Dark

    property string dashBaseUrl:    ""
    property int    dashboardPort:  0

    /// Output: true when the last poll completed successfully.
    property bool pollingOk:     false
    /// Output: number of activity events from the last successful poll.
    property int  activityCount: 0

    color:        "#161b22"
    radius:       10
    border.color: "#30363d"
    Layout.fillWidth: true
    implicitHeight: 200

    // ── Data model ───────────────────────────────────────────────────────────
    ListModel { id: activityList }

    /// Condensed time string: "2026-03-12 00:21:11" → "00:21"
    function shortTime(ts) {
        if (!ts || ts.length < 16) return ts || ""
        // Works for both "2026-03-12 00:21:11" and "2026-03-12T00:21:11.000Z"
        return ts.slice(11, 16)
    }

    /// Map an event type to a display colour.
    function evColor(t) {
        if (t.indexOf("handoff")   >= 0) return "#3fb950"   // green
        if (t.indexOf("complete")  >= 0) return "#58a6ff"   // blue
        if (t.indexOf("error")     >= 0 ||
            t.indexOf("blocked")   >= 0) return "#f85149"   // red
        if (t.indexOf("active")    >= 0) return "#ffeb3b"   // yellow
        return "#8b949e"
    }

    Timer {
        interval: 3000; running: true; repeat: true
        onTriggered: {
            if (actPane.dashboardPort <= 0) return
            var xhr = new XMLHttpRequest()
            xhr.onreadystatechange = function() {
                if (xhr.readyState !== XMLHttpRequest.DONE) return
                if (xhr.status !== 200) {
                    actPane.pollingOk = false
                    return
                }
                try {
                    var parsed = JSON.parse(xhr.responseText)
                    var list = Array.isArray(parsed) ? parsed : (parsed.events || [])
                    activityList.clear()
                    for (var i = 0; i < list.length && i < 15; i++) {
                        var ev = list[i]
                        activityList.append({
                            evAgent: ev.agent_type || "",
                            evType:  ev.type || ev.event_type || "event",
                            evTime:  actPane.shortTime(ev.timestamp || ev.created_at || "")
                        })
                    }
                    actPane.pollingOk     = true
                    actPane.activityCount = activityList.count
                } catch(ex) {
                    actPane.pollingOk = false
                }
            }
            xhr.open("GET", actPane.dashBaseUrl + "/api/events?limit=15")
            xhr.send()
        }
    }

    // ── UI ───────────────────────────────────────────────────────────────────
    ColumnLayout {
        anchors.fill: parent; anchors.margins: 10; spacing: 6

        RowLayout {
            spacing: 6; Layout.fillWidth: true

            Label {
                text: "RECENT ACTIVITY"
                font.pixelSize: 10; font.letterSpacing: 1.0; color: "#8b949e"
            }

            // Live polling status dot
            Rectangle {
                Layout.preferredWidth: 8; Layout.preferredHeight: 8
                radius: 4
                color: actPane.pollingOk ? "#3fb950" : "#f85149"
                Layout.alignment: Qt.AlignVCenter
            }

            // Activity count badge
            Text {
                text: "[" + actPane.activityCount + "]"
                color: "#58a6ff"
                font.pixelSize: 12
                Layout.alignment: Qt.AlignVCenter
            }
        }

        Rectangle { Layout.fillWidth: true; Layout.preferredHeight: 1; color: "#30363d" }

        Rectangle {
            Layout.fillWidth: true; Layout.fillHeight: true
            color: "#0d1117"; radius: 4; border.color: "#30363d"; clip: true

            ScrollView {
                anchors.fill: parent; anchors.margins: 8; contentWidth: availableWidth

                ListView {
                    id: activityView
                    model: activityList
                    spacing: 3

                    delegate: Label {
                        required property string evAgent
                        required property string evType
                        required property string evTime

                        width: ListView.view ? ListView.view.width : 0
                        text: (evAgent !== "" ? "[" + evAgent + "] " : "") +
                              evType + "  " + evTime
                        font.pixelSize: 11; font.family: "Consolas"
                        color: actPane.evColor(evType)
                        wrapMode: Text.NoWrap
                        elide: Text.ElideRight
                    }

                    Label {
                        anchors.centerIn: parent
                        visible: activityView.count === 0
                        text: "No recent activity"
                        color: "#8b949e"; font.pixelSize: 12
                    }
                }
            }
        }
    }
}
