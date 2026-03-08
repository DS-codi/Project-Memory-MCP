import QtQuick 2.15
import QtQuick.Controls 2.15
import QtQuick.Window 2.15
import QtWebEngine 1.10

import com.projectmemory.installer 1.0

ApplicationWindow {
    id: window
    width: 800
    height: 600
    visible: true
    title: "Project Memory Installer"
    flags: Qt.Window | Qt.FramelessWindowHint
    color: "#010103"

    InstallWizard {
        id: wizard
    }

    // Modern Frameless Drag Support
    MouseArea {
        id: dragArea
        anchors.fill: parent
        property point lastMousePos: Qt.point(0, 0)
        onPressed: lastMousePos = Qt.point(mouse.x, mouse.y)
        onPositionChanged: {
            var delta = Qt.point(mouse.x - lastMousePos.x, mouse.y - lastMousePos.y)
            window.x += delta.x
            window.y += delta.y
        }
    }

    // The Background Animation Layer
    // Note: We use WebEngineView to host the HTML/SVG animation.
    WebEngineView {
        id: backgroundAnimation
        anchors.fill: parent
        url: "file:///" + Qt.resolvedUrl("../../assets/droplet-animation.html").toString().substring(8)
        settings.localContentCanAccessRemoteUrls: true
        settings.localContentCanAccessFileUrls: true
        backgroundColor: "transparent"
        opacity: 0.6
    }

    // Glassmorphism Overlay
    Rectangle {
        anchors.fill: parent
        color: "#AA010103"
        border.color: "#3360a5fa"
        border.width: 1
        radius: 8
        clip: true

        // Content Stack
        StackView {
            id: stackView
            anchors.fill: parent
            initialItem: welcomePage

            // Page transitions
            pushEnter: Transition {
                PropertyAnimation { property: "opacity"; from: 0; to: 1; duration: 400; easing.type: Easing.InOutQuad }
                PropertyAnimation { property: "x"; from: 100; to: 0; duration: 400; easing.type: Easing.OutCubic }
            }
            pushExit: Transition {
                PropertyAnimation { property: "opacity"; from: 1; to: 0; duration: 400; easing.type: Easing.InOutQuad }
                PropertyAnimation { property: "x"; from: 0; to: -100; duration: 400; easing.type: Easing.InCubic }
            }
        }
    }

    Component {
        id: welcomePage
        WelcomePage {
            onNext: stackView.push(pathSelectionPage)
            onClose: window.close()
        }
    }

    Component {
        id: pathSelectionPage
        PathSelectionPage {
            onNext: stackView.push(componentSelectionPage)
            onBack: stackView.pop()
        }
    }

    Component {
        id: componentSelectionPage
        ComponentSelectionPage {
            onNext: {
                wizard.startInstall()
                stackView.push(progressPage)
            }
            onBack: stackView.pop()
        }
    }

    Component {
        id: progressPage
        ProgressPage {
            onFinished: stackView.push(finishPage)
        }
    }

    Component {
        id: finishPage
        FinishPage {
            onClose: window.close()
        }
    }
}
