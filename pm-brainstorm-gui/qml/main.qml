import QtQuick 2.15
import QtQuick.Controls 2.15
import QtQuick.Controls.Material 2.15
import QtQuick.Layouts 1.15
import com.projectmemory.brainstorm 1.0

ApplicationWindow {
    id: root
    visible: true
    width: 900
    height: 700
    title: formApp.title
    color: "#1e1e1e"

    Material.theme: Material.Dark
    Material.accent: Material.Blue

    FormApp {
        id: formApp

        onFormCompleted: {
            // Close the window after a brief delay so the user sees the state.
            closeTimer.start();
        }
    }

    Timer {
        id: closeTimer
        interval: 500
        repeat: false
        onTriggered: Qt.quit()
    }

    FormShell {
        anchors.fill: parent
        formApp: formApp
    }
}
