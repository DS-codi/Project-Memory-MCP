import QtQuick 2.15
import QtQuick.Controls 2.15

Item {
    id: root
    signal finished()

    Column {
        anchors.centerIn: parent
        spacing: 30
        width: parent.width * 0.7

        Text {
            text: "INSTALLING..."
            font.pointSize: 24
            font.weight: Font.Black
            color: "#60a5fa"
            anchors.horizontalCenter: parent.horizontalCenter
        }

        ProgressBar {
            id: progressBar
            width: parent.width
            value: wizard.progress / 100.0
            
            background: Rectangle {
                implicitWidth: 200
                implicitHeight: 12
                color: "#22000000"
                radius: 6
                border.color: "#3360a5fa"
            }

            contentItem: Item {
                implicitWidth: 200
                implicitHeight: 12

                Rectangle {
                    width: progressBar.visualPosition * parent.width
                    height: parent.height
                    radius: 6
                    gradient: Gradient {
                        orientation: Gradient.Horizontal
                        GradientStop { position: 0.0; color: "#3b82f6" }
                        GradientStop { position: 1.0; color: "#60a5fa" }
                    }
                    
                    // Glow effect
                    layer.enabled: true
                    Rectangle {
                        anchors.fill: parent
                        color: "transparent"
                        border.color: "#ffffff"
                        opacity: 0.3
                        radius: 6
                    }
                }
            }
        }

        Text {
            text: wizard.statusText
            font.pointSize: 12
            color: "white"
            anchors.horizontalCenter: parent.horizontalCenter
        }

        Text {
            text: Math.floor(wizard.progress) + "%"
            font.pointSize: 18
            font.weight: Font.Bold
            color: "#60a5fa"
            anchors.horizontalCenter: parent.horizontalCenter
        }
    }

    Connections {
        target: wizard
        function onProgressChanged() {
            if (wizard.progress >= 100) {
                timer.start()
            }
        }
    }

    Timer {
        id: simulationTimer
        interval: 100
        running: wizard.isInstalling && !wizard.isFinished
        repeat: true
        onTriggered: wizard.updateSimulation()
    }

    Timer {
        id: timer
        interval: 1500
        running: wizard.isFinished
        onTriggered: root.finished()
    }
}
