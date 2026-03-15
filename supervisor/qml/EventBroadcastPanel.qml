import QtQuick 2.15
import QtQuick.Controls 2.15
import QtQuick.Controls.Material 2.15
import QtQuick.Layouts 1.15

/// Event broadcast status panel — shows relay count, subscriber count, and
/// an animated on/off toggle indicator.  Read-only; the toggle just reflects
/// the bridge-side state (enabled/disabled).
Rectangle {
    id: evtPanel
    Material.theme: Material.Dark

    property bool   enabled:         false
    property int    subscriberCount: 0
    property int    totalEmitted:    0

    color:        "#161b22"
    radius:       10
    border.color: "#30363d"
    Layout.fillWidth: true
    implicitHeight: 82

    RowLayout {
        anchors { left: parent.left; right: parent.right; top: parent.top; bottom: parent.bottom; margins: 10 }
        spacing: 12

        ColumnLayout {
            spacing: 4; Layout.fillWidth: true

            Label {
                text: "EVENT BROADCAST"
                font.pixelSize: 10; font.letterSpacing: 1.0; color: "#8b949e"
            }
            Label {
                text: evtPanel.enabled
                    ? evtPanel.totalEmitted + " event(s) relayed from MCP"
                    : "Broadcast channel disabled"
                font.pixelSize: 11; color: "#8b949e"
            }
            Label {
                text: evtPanel.subscriberCount + " subscriber(s) on /supervisor/events"
                font.pixelSize: 10
                color: evtPanel.subscriberCount > 0 ? "#3fb950" : "#8b949e"
                visible: evtPanel.enabled
            }
        }

        // Animated toggle indicator (read-only)
        Rectangle {
            Layout.preferredWidth: 40; Layout.preferredHeight: 22; radius: 11
            color: evtPanel.enabled ? "#3fb950" : "#30363d"
            Behavior on color { ColorAnimation { duration: 150 } }

            Rectangle {
                width: 18; height: 18; radius: 9; color: "white"
                anchors.verticalCenter: parent.verticalCenter
                x: evtPanel.enabled ? parent.width - width - 2 : 2
                Behavior on x { NumberAnimation { duration: 150 } }
            }
        }
    }
}
