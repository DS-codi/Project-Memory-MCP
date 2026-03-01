import QtQuick
import QtWebView

Item {
    id: terminalView

    // Must be provided by the parent (main.qml passes terminalApp).
    required property var terminalApp
    property bool suppressWebView: false

    Rectangle {
        anchors.fill: parent
        color: "#1e1e1e"
    }

    Loader {
        id: webViewLoader
        anchors.fill: parent
        active: !terminalView.suppressWebView

        sourceComponent: WebView {
            anchors.fill: parent

            // Load the terminal page from the local Rust WebSocket server.
            // Port 0 means the server has not started yet — show a blank page.
            url: terminalApp.terminalWsPort > 0
                ? "http://127.0.0.1:" + terminalApp.terminalWsPort + "/"
                : "about:blank"
        }
    }
}
