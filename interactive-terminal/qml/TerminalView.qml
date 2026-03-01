import QtQuick
import QtWebView

Item {
    id: terminalView

    // Must be provided by the parent (main.qml passes terminalApp).
    required property var terminalApp
    property bool suppressWebView: false
    property bool hasActiveSession: true

    Rectangle {
        anchors.fill: parent
        color: "#1e1e1e"
    }

    Loader {
        id: webViewLoader
        anchors.fill: parent
        active: terminalView.hasActiveSession

        sourceComponent: WebView {
            anchors.fill: parent
            visible: !terminalView.suppressWebView

            // Load the terminal page from the local Rust WebSocket server.
            // Port 0 means the server has not started yet — show a blank page.
            url: terminalApp.terminalWsPort > 0
                ? "http://127.0.0.1:" + terminalApp.terminalWsPort + "/"
                : "about:blank"
        }
    }

    Rectangle {
        anchors.fill: parent
        color: "#1e1e1e"
        visible: !terminalView.hasActiveSession

        Text {
            anchors.centerIn: parent
            text: "No active terminal session. Create or select a tab to start a shell."
            color: "#808080"
            font.pixelSize: 13
            horizontalAlignment: Text.AlignHCenter
            wrapMode: Text.WordWrap
            width: Math.min(parent.width * 0.8, 540)
        }
    }
}
