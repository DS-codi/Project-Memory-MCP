import QtQuick 2.15
import QtQuick.Controls 2.15

Item {
    id: root
    signal next()
    signal close()

    Column {
        anchors.centerIn: parent
        spacing: 30
        width: parent.width * 0.7

        Text {
            text: "PROJECT MEMORY"
            font.pointSize: 48
            font.weight: Font.Black
            color: "#60a5fa"
            anchors.horizontalCenter: parent.horizontalCenter
            style: Text.Outline
            styleColor: "#1e40af"
            
            SequentialAnimation on opacity {
                loops: Animation.Infinite
                NumberAnimation { from: 0.7; to: 1.0; duration: 2000; easing.type: Easing.InOutSine }
                NumberAnimation { from: 1.0; to: 0.7; duration: 2000; easing.type: Easing.InOutSine }
            }
        }

        Rectangle {
            width: parent.width
            height: descriptionText.height + 40
            color: "#22000000"
            radius: 12
            border.color: "#3360a5fa"
            border.width: 1

            Text {
                id: descriptionText
                anchors.centerIn: parent
                width: parent.width - 40
                text: "Welcome to the Project Memory installation wizard.\n\nThis utility will guide you through setting up the Model Context Protocol (MCP) server, dashboard, and desktop runtime components on your system."
                font.pointSize: 14
                color: "white"
                horizontalAlignment: Text.AlignHCenter
                wrapMode: Text.WordWrap
            }
        }
        
        Row {
            anchors.horizontalCenter: parent.horizontalCenter
            spacing: 20
            
            Button {
                id: cancelBtn
                text: "CANCEL"
                contentItem: Text {
                    text: cancelBtn.text
                    color: cancelBtn.hovered ? "#60a5fa" : "#94a3b8"
                    font.weight: Font.Bold
                    horizontalAlignment: Text.AlignHCenter
                    verticalAlignment: Text.AlignVCenter
                }
                background: Rectangle {
                    implicitWidth: 120
                    implicitHeight: 45
                    color: "transparent"
                    border.color: cancelBtn.hovered ? "#60a5fa" : "#334155"
                    border.width: 2
                    radius: 4
                }
                onClicked: root.close()
            }

            Button {
                id: startBtn
                text: "GET STARTED"
                contentItem: Text {
                    text: startBtn.text
                    color: "white"
                    font.weight: Font.Bold
                    horizontalAlignment: Text.AlignHCenter
                    verticalAlignment: Text.AlignVCenter
                }
                background: Rectangle {
                    implicitWidth: 180
                    implicitHeight: 45
                    gradient: Gradient {
                        GradientStop { position: 0.0; color: "#3b82f6" }
                        GradientStop { position: 1.0; color: "#1e40af" }
                    }
                    radius: 4
                    scale: startBtn.pressed ? 0.95 : (startBtn.hovered ? 1.05 : 1.0)
                    Behavior on scale { NumberAnimation { duration: 100 } }
                }
                onClicked: root.next()
            }
        }
    }
}
