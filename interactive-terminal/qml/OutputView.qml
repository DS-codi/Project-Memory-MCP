import QtQuick 2.15
import QtQuick.Controls 2.15
import QtQuick.Layouts 1.15

/**
 * OutputView — scrollable panel displaying command output.
 *
 * Properties:
 *   outputText – bound to terminalApp.outputText
 *
 * Auto-scrolls to bottom when new content arrives.
 */
Rectangle {
    id: outputRoot

    // --- public property -----------------------------------------------------
    property string outputText: ""
    property var terminalApp: null
    property bool hasActiveTerminalSession: true
    property int controlFontPx: 11
    property int inputFontPx: 11
    property string activePath: {
        if (!terminalApp) {
            return "~"
        }
        const working = (terminalApp.workingDirectory || "").trim()
        if (working.length > 0) {
            return working
        }
        const workspace = (terminalApp.currentWorkspacePath || "").trim()
        return workspace.length > 0 ? workspace : "~"
    }

    color: "#1a1a1a"

    ColumnLayout {
        anchors.fill: parent
        spacing: 0

        // Header bar
        Rectangle {
            Layout.fillWidth: true
            Layout.preferredHeight: 66
            color: "#252526"

            ColumnLayout {
                anchors.fill: parent
                anchors.leftMargin: 12
                anchors.rightMargin: 12
                anchors.topMargin: 6
                anchors.bottomMargin: 6
                spacing: 4

                RowLayout {
                    Layout.fillWidth: true

                    Text {
                        text: "Output"
                        color: "#d4d4d4"
                        font.pixelSize: 13
                        font.bold: true
                    }

                    Item { Layout.fillWidth: true }

                    Button {
                        id: copyBtn
                        text: "Copy"
                        implicitWidth: 58
                        implicitHeight: 26
                        font.pixelSize: outputRoot.controlFontPx

                    contentItem: Text {
                        text: copyBtn.text
                        color: "#d4d4d4"
                        font.pixelSize: 11
                        horizontalAlignment: Text.AlignHCenter
                        verticalAlignment: Text.AlignVCenter
                    }

                    background: Rectangle {
                        color: copyBtn.down ? "#404040" : (copyBtn.hovered ? "#383838" : "transparent")
                        border.color: "#555555"
                        border.width: 1
                        radius: 3
                    }

                        onClicked: {
                            outputArea.selectAll()
                            outputArea.copy()
                            outputArea.deselect()
                        }
                    }

                    Button {
                        id: saveTxtBtn
                        text: "Save TXT"
                        implicitWidth: 78
                        implicitHeight: 26
                        font.pixelSize: outputRoot.controlFontPx

                    contentItem: Text {
                        text: saveTxtBtn.text
                        color: "#d4d4d4"
                        font.pixelSize: 11
                        horizontalAlignment: Text.AlignHCenter
                        verticalAlignment: Text.AlignVCenter
                    }

                    background: Rectangle {
                        color: saveTxtBtn.down ? "#404040" : (saveTxtBtn.hovered ? "#383838" : "transparent")
                        border.color: "#555555"
                        border.width: 1
                        radius: 3
                    }

                        onClicked: {
                            if (terminalApp) {
                                terminalApp.exportOutputText(terminalApp.currentWorkspacePath || "")
                            }
                        }
                    }

                    Button {
                        id: saveJsonBtn
                        text: "Save JSON"
                        implicitWidth: 82
                        implicitHeight: 26
                        font.pixelSize: outputRoot.controlFontPx

                    contentItem: Text {
                        text: saveJsonBtn.text
                        color: "#d4d4d4"
                        font.pixelSize: 11
                        horizontalAlignment: Text.AlignHCenter
                        verticalAlignment: Text.AlignVCenter
                    }

                    background: Rectangle {
                        color: saveJsonBtn.down ? "#404040" : (saveJsonBtn.hovered ? "#383838" : "transparent")
                        border.color: "#555555"
                        border.width: 1
                        radius: 3
                    }

                        onClicked: {
                            if (terminalApp) {
                                terminalApp.exportOutputJson(terminalApp.currentWorkspacePath || "")
                            }
                        }
                    }

                    Button {
                        id: clearBtn
                        text: "Clear"
                        implicitWidth: 56
                        implicitHeight: 26
                        font.pixelSize: outputRoot.controlFontPx

                    contentItem: Text {
                        text: clearBtn.text
                        color: "#d4d4d4"
                        font.pixelSize: 11
                        horizontalAlignment: Text.AlignHCenter
                        verticalAlignment: Text.AlignVCenter
                    }

                    background: Rectangle {
                        color: clearBtn.down ? "#404040" : (clearBtn.hovered ? "#383838" : "transparent")
                        border.color: "#555555"
                        border.width: 1
                        radius: 3
                    }

                        onClicked: {
                            if (terminalApp) {
                                terminalApp.clearOutput()
                            }
                        }
                    }
                }

                Text {
                    Layout.fillWidth: true
                    text: terminalApp
                        ? ((terminalApp.statusText || "") + (terminalApp.commandText ? " | Request: " + terminalApp.commandText : ""))
                        : ""
                    color: "#9da0a6"
                    font.pixelSize: 11
                    elide: Text.ElideRight
                }
            }
        }

        // Separator
        Rectangle { Layout.fillWidth: true; height: 1; color: "#3c3c3c" }

        // Scrollable output area
        ScrollView {
            id: scrollView
            Layout.fillWidth: true
            Layout.fillHeight: true
            clip: true

            TextArea {
                id: outputArea
                text: outputRoot.outputText
                readOnly: true
                color: "#d4d4d4"
                font.family: "Consolas"
                font.pixelSize: Math.max(11, Math.floor(outputRoot.width / 60))
                wrapMode: TextEdit.Wrap
                selectByMouse: true

                placeholderText: "No output yet"

                background: Rectangle {
                    color: "transparent"
                }

                // Auto-scroll to bottom when new content arrives
                onTextChanged: {
                    cursorPosition = text.length
                }

                leftPadding: 10
                rightPadding: 10
                topPadding: 8
                bottomPadding: 8
            }
        }

        Rectangle { Layout.fillWidth: true; height: 1; color: "#3c3c3c" }

        Rectangle {
            Layout.fillWidth: true
            Layout.preferredHeight: 56
            color: "#1a1a1a"

            RowLayout {
                anchors.fill: parent
                anchors.leftMargin: 10
                anchors.rightMargin: 10
                anchors.topMargin: 8
                anchors.bottomMargin: 8
                spacing: 6

                Text {
                    Layout.maximumWidth: Math.max(180, outputRoot.width * 0.45)
                    text: outputRoot.activePath + " >"
                    color: "#9da0a6"
                    elide: Text.ElideLeft
                    font.family: "Consolas"
                    font.pixelSize: outputRoot.inputFontPx
                    verticalAlignment: Text.AlignVCenter
                }

                TextField {
                    id: manualCommandInput
                    Layout.fillWidth: true
                    Layout.minimumWidth: 100
                    enabled: outputRoot.hasActiveTerminalSession
                    opacity: enabled ? 1.0 : 0.55
                    placeholderText: enabled
                        ? "Type command and press Enter"
                        : "No active terminal session"
                    font.family: "Consolas"
                    font.pixelSize: outputRoot.inputFontPx
                    onAccepted: {
                        if (terminalApp && terminalApp.runCommand(text)) {
                            text = ""
                        }
                    }

                    background: Rectangle {
                        color: "transparent"
                        border.color: "transparent"
                    }
                }
            }
        }
    }
}
