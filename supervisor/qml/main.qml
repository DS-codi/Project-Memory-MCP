import QtQuick
import QtQuick.Controls
import QtQuick.Controls.Material
import QtQuick.Layouts
import Qt.labs.platform 1.1 as Platform
import com.projectmemory.supervisor

ApplicationWindow {
    id: root
    width: 720
    height: 480
    // Window starts hidden — tray icon is the entry point.
    visible: supervisorGuiBridge.windowVisible
    title: "Project Memory Supervisor"

    Material.theme: Material.Dark
    Material.accent: Material.Blue

    // Hide to tray when the user clicks the window's X button.
    onClosing: function(close) {
        close.accepted = false
        supervisorGuiBridge.hideWindow()
    }

    // Bring the window to the front once Qt has actually made it visible.
    // (Calling raise()/requestActivate() before the native window handle exists
    //  causes an access violation in Qt6Core — so we defer until here.)
    onVisibleChanged: {
        if (visible) {
            raise()
            requestActivate()
        }
    }

    SupervisorGuiBridge {
        id: supervisorGuiBridge
    }

    // ── System tray icon (Qt.labs.platform) ─────────────────────────────────
    Platform.SystemTrayIcon {
        id: trayIcon
        visible: true
        icon.source: supervisorGuiBridge.trayIconUrl
        tooltip: "Project Memory Supervisor\n" + supervisorGuiBridge.statusText

        onActivated: function(reason) {
            if (reason === Platform.SystemTrayIcon.Trigger ||
                reason === Platform.SystemTrayIcon.DoubleClick) {
                supervisorGuiBridge.showWindow()
            }
        }

        menu: Platform.Menu {
            Platform.MenuItem {
                text: "Show Supervisor"
                onTriggered: {
                    supervisorGuiBridge.showWindow()
                }
            }
            Platform.MenuSeparator {}
            Platform.MenuItem {
                text: "MCP Server — Restart"
                onTriggered: { /* TODO: invoke service control */ }
            }
            Platform.MenuItem {
                text: "Interactive Terminal — Restart"
                onTriggered: { /* TODO: invoke service control */ }
            }
            Platform.MenuItem {
                text: "Dashboard — Restart"
                onTriggered: { /* TODO: invoke service control */ }
            }
            Platform.MenuSeparator {}
            Platform.MenuItem {
                text: "Quit Supervisor"
                // Route through the bridge so the Tokio runtime can stop all
                // child processes (Node, Vite, terminal) before we exit.
                // Never call Qt.quit() directly — it would kill the Qt event
                // loop before services are shut down.
                onTriggered: supervisorGuiBridge.quitSupervisor()
            }
        }
    }

    // ── Window content ───────────────────────────────────────────────────────
    ColumnLayout {
        anchors.fill: parent
        anchors.margins: 20
        spacing: 12

        Label {
            text: "Project Memory Supervisor"
            font.pixelSize: 22
            font.bold: true
        }

        Label {
            text: supervisorGuiBridge.statusText
            wrapMode: Text.Wrap
            Layout.fillWidth: true
            color: Material.foreground
        }

        Item { Layout.fillHeight: true }

        RowLayout {
            spacing: 8
            Layout.alignment: Qt.AlignRight

            Button {
                text: "Hide to Tray"
                onClicked: supervisorGuiBridge.hideWindow()
            }
        }
    }
}
