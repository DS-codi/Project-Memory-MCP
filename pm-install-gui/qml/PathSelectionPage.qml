import QtQuick 2.15
import QtQuick.Controls 2.15

Item {
    id: root
    signal next()
    signal back()

    Component.onCompleted: {
        installPathInput.text = "C:\\Users\\" + "User" + "\\AppData\\Local\\ProjectMemory"
        dataPathInput.text = "C:\\Users\\" + "User" + "\\AppData\\Roaming\\ProjectMemory"
    }

    Column {
        anchors.centerIn: parent
        spacing: 25
        width: parent.width * 0.75

        Text {
            text: "PATHS"
            font.pointSize: 24
            font.weight: Font.Black
            color: "#60a5fa"
            anchors.horizontalCenter: parent.horizontalCenter
        }

        Column {
            width: parent.width
            spacing: 8
            Text { text: "INSTALLATION DIRECTORY"; color: "#94a3b8"; font.pointSize: 10; font.weight: Font.Bold }
            Row {
                width: parent.width
                spacing: 10
                TextField {
                    id: installPathInput
                    width: parent.width - 110
                    color: "white"
                    placeholderText: "Select install directory..."
                    background: Rectangle { color: "#22000000"; border.color: "#3360a5fa"; radius: 4; height: 40 }
                }
                Button {
                    text: "BROWSE"
                    width: 100
                    background: Rectangle { color: "#1e3a8a"; radius: 4; height: 40 }
                    contentItem: Text { text: parent.text; color: "white"; font.pointSize: 9; horizontalAlignment: Text.AlignHCenter; verticalAlignment: Text.AlignVCenter }
                }
            }
        }

        Column {
            width: parent.width
            spacing: 8
            Text { text: "DATA ROOT (DATABASE & LOGS)"; color: "#94a3b8"; font.pointSize: 10; font.weight: Font.Bold }
            Row {
                width: parent.width
                spacing: 10
                TextField {
                    id: dataPathInput
                    width: parent.width - 110
                    color: "white"
                    placeholderText: "Select data directory..."
                    background: Rectangle { color: "#22000000"; border.color: "#3360a5fa"; radius: 4; height: 40 }
                }
                Button {
                    text: "BROWSE"
                    width: 100
                    background: Rectangle { color: "#1e3a8a"; radius: 4; height: 40 }
                    contentItem: Text { text: parent.text; color: "white"; font.pointSize: 9; horizontalAlignment: Text.AlignHCenter; verticalAlignment: Text.AlignVCenter }
                }
            }
        }

        Row {
            anchors.horizontalCenter: parent.horizontalCenter
            spacing: 20
            
            Button {
                text: "BACK"
                onClicked: root.back()
                background: Rectangle { implicitWidth: 100; implicitHeight: 40; color: "transparent"; border.color: "#334155"; radius: 4 }
                contentItem: Text { text: parent.text; color: "#94a3b8"; horizontalAlignment: Text.AlignHCenter; verticalAlignment: Text.AlignVCenter }
            }

            Button {
                text: "CONTINUE"
                onClicked: {
                    wizard.installPath = installPathInput.text
                    wizard.dataPath = dataPathInput.text
                    root.next()
                }
                background: Rectangle { 
                    implicitWidth: 150; implicitHeight: 40
                    gradient: Gradient { 
                        GradientStop { position: 0; color: "#3b82f6" } 
                        GradientStop { position: 1; color: "#1e40af" } 
                    }
                    radius: 4 
                }
                contentItem: Text { text: parent.text; color: "white"; font.weight: Font.Bold; horizontalAlignment: Text.AlignHCenter; verticalAlignment: Text.AlignVCenter }
            }
        }
    }
}
