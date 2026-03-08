import QtQuick 2.15
import QtQuick.Controls 2.15

Item {
    id: root
    signal close()

    Column {
        anchors.centerIn: parent
        spacing: 30
        width: parent.width * 0.7

        Rectangle {
            width: 100
            height: 100
            radius: 50
            color: "#1e3a8a"
            anchors.horizontalCenter: parent.horizontalCenter
            border.color: "#60a5fa"
            border.width: 4

            Text {
                text: "✓"
                color: "#60a5fa"
                font.pointSize: 48
                font.weight: Font.Bold
                anchors.centerIn: parent
            }
        }

        Text {
            text: "INSTALLATION COMPLETE"
            font.pointSize: 24
            font.weight: Font.Black
            color: "#60a5fa"
            anchors.horizontalCenter: parent.horizontalCenter
        }

        Text {
            text: "Project Memory MCP has been successfully installed on your system. You can now start using it via the Supervisor tray application."
            font.pointSize: 14
            color: "white"
            horizontalAlignment: Text.AlignHCenter
            wrapMode: Text.WordWrap
            width: parent.width
        }

        Button {
            text: "LAUNCH SYSTEM"
            anchors.horizontalCenter: parent.horizontalCenter
            contentItem: Text {
                text: parent.text
                color: "white"
                font.weight: Font.Black
                horizontalAlignment: Text.AlignHCenter
                verticalAlignment: Text.AlignVCenter
            }
            background: Rectangle {
                implicitWidth: 200
                implicitHeight: 50
                gradient: Gradient {
                    GradientStop { position: 0.0; color: "#3b82f6" }
                    GradientStop { position: 1.0; color: "#1e40af" }
                }
                radius: 4
                border.color: "#ffffff"
                border.width: parent.hovered ? 2 : 0
            }
            onClicked: root.close()
        }
    }
}
