import QtQuick 2.15
import QtQuick.Controls 2.15

Item {
    id: root
    signal next()
    signal back()

    ListModel {
        id: componentModel
        ListElement { name: "Supervisor (Tray App)"; desc: "Main orchestration application"; selected: true }
        ListElement { name: "Interactive Terminal"; desc: "Bridge for terminal workflows"; selected: true }
        ListElement { name: "PM GUI Forms"; desc: "Desktop approval/brainstorm dialogs"; selected: true }
        ListElement { name: "MCP Server"; desc: "Core tool server & data engine"; selected: true }
        ListElement { name: "Dashboard"; desc: "Local React-based observer UI"; selected: true }
        ListElement { name: "VS Code Extension"; desc: "IDE integration & chat host"; selected: true }
    }

    Column {
        anchors.centerIn: parent
        spacing: 20
        width: parent.width * 0.8

        Text {
            text: "COMPONENTS"
            font.pointSize: 24
            font.weight: Font.Black
            color: "#60a5fa"
            anchors.horizontalCenter: parent.horizontalCenter
        }

        ListView {
            id: listView
            width: parent.width
            height: 280
            model: componentModel
            clip: true
            spacing: 5
            delegate: Rectangle {
                id: compDelegate
                // qmllint disable unqualified
                required property string name
                required property string desc
                required property bool selected
                width: parent.width
                height: 45
                color: "#22000000"
                border.color: "#3360a5fa"
                radius: 4

                Row {
                    anchors.fill: parent
                    anchors.leftMargin: 15
                    spacing: 15
                    CheckBox {
                        anchors.verticalCenter: parent.verticalCenter
                        checked: compDelegate.selected
                        onToggled: compDelegate.selected = checked
                    }
                    Column {
                        anchors.verticalCenter: parent.verticalCenter
                        Text { text: compDelegate.name; color: "white"; font.weight: Font.Bold; font.pointSize: 11 }
                        Text { text: compDelegate.desc; color: "#94a3b8"; font.pointSize: 9 }
                    }
                }
                // qmllint enable unqualified
            }
        }

        Row {
            anchors.horizontalCenter: parent.horizontalCenter
            spacing: 20
            
            Button {
                id: backBtn
                text: "BACK"
                onClicked: root.back()
                background: Rectangle { implicitWidth: 100; implicitHeight: 40; color: "transparent"; border.color: "#334155"; radius: 4 }
                contentItem: Text { text: backBtn.text; color: "#94a3b8"; horizontalAlignment: Text.AlignHCenter; verticalAlignment: Text.AlignVCenter }
            }

            Button {
                id: installBtn
                text: "INSTALL NOW"
                onClicked: root.next()
                background: Rectangle { 
                    implicitWidth: 150; implicitHeight: 40; 
                    gradient: Gradient { 
                        GradientStop { position: 1; color: "#1e40af" }
                        GradientStop { position: 0; color: "#3b82f6" } 
                    }
                    radius: 4 
                    border.color: "#ffffff"
                    border.width: installBtn.hovered ? 2 : 0
                }
                contentItem: Text { text: installBtn.text; color: "white"; font.weight: Font.Black; horizontalAlignment: Text.AlignHCenter; verticalAlignment: Text.AlignVCenter }
            }
        }
    }
}
