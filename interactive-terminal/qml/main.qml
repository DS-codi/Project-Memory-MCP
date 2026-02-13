import QtQuick 2.15
import QtQuick.Controls 2.15
import QtQuick.Layouts 1.15
import com.projectmemory.terminal 1.0

ApplicationWindow {
    id: root
    visible: true
    width: 800
    height: 600
    title: "Interactive Terminal"
    color: "#1e1e1e"

    TerminalApp {
        id: terminalApp
    }

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: 16

        Text {
            text: "Interactive Terminal"
            font.pixelSize: 24
            font.bold: true
            color: "#d4d4d4"
            Layout.alignment: Qt.AlignHCenter
        }

        Text {
            text: terminalApp.statusMessage || "Waiting for connection..."
            font.pixelSize: 14
            color: "#808080"
            Layout.alignment: Qt.AlignHCenter
        }

        Item {
            Layout.fillHeight: true
        }
    }
}
