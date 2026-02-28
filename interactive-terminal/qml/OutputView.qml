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

    // Local command history (QML-side, per session)
    property var cmdHistory: []
    property int cmdHistoryIndex: -1
    property string activePath: {
        if (!terminalApp) return "~"
        const working = (terminalApp.workingDirectory || "").trim()
        if (working.length > 0) return working
        const workspace = (terminalApp.currentWorkspacePath || "").trim()
        return workspace.length > 0 ? workspace : "~"
    }

    // Prompt prefix matching the active shell style
    property string promptPrefix: {
        if (!terminalApp) return "PS"
        const p = (terminalApp.currentTerminalProfile || "system").toLowerCase()
        if (p === "cmd") return ""
        if (p === "bash") return "$"
        return "PS"  // powershell / pwsh / system all show PS
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
                width: scrollView.width
                text: outputRoot.outputText
                readOnly: true
                color: "#d4d4d4"
                font.family: "Consolas"
                font.pixelSize: Math.max(11, Math.floor(outputRoot.width / 80))
                wrapMode: TextEdit.Wrap
                selectByMouse: true

                background: Rectangle { color: "transparent" }

                onTextChanged: {
                    Qt.callLater(function() {
                        const vb = scrollView.ScrollBar.vertical
                        if (vb && scrollView.visibleArea && scrollView.visibleArea.heightRatio < 1.0) {
                            vb.position = Math.max(0, 1.0 - scrollView.visibleArea.heightRatio)
                        }
                    })
                }

                leftPadding: 10
                rightPadding: 10
                topPadding: 8
                bottomPadding: 4
            }
        }

        // Separator between output and prompt
        Rectangle { Layout.fillWidth: true; height: 1; color: "#2a2a2a" }

        // Fixed prompt bar — always visible at the bottom, outside the ScrollView
        // so mouse clicks are never intercepted by scroll handling
        Rectangle {
            id: promptBar
            Layout.fillWidth: true
            height: terminalFontSize + 16
            color: "#111111"

            property int terminalFontSize: Math.max(11, Math.floor(outputRoot.width / 80))

            // Clicking anywhere in the bar focuses the input
            MouseArea {
                anchors.fill: parent
                onClicked: manualCommandInput.forceActiveFocus()
            }

            Row {
                id: promptRow
                anchors.left: parent.left
                anchors.right: parent.right
                anchors.leftMargin: 10
                anchors.rightMargin: 10
                anchors.verticalCenter: parent.verticalCenter
                spacing: 0

                Text {
                    id: promptLabel
                    // Format: "PS C:\path> " or "C:\path> " (cmd) or "$ ~/path> " (bash)
                    // Uses only ASCII so Consolas renders it cleanly on Windows
                    text: {
                        const prefix = outputRoot.promptPrefix
                        const path = outputRoot.activePath
                        if (prefix.length > 0)
                            return prefix + " " + path + "> "
                        return path + "> "
                    }
                    color: outputRoot.hasActiveTerminalSession ? "#569cd6" : "#555555"
                    font.family: "Consolas"
                    font.pixelSize: promptBar.terminalFontSize
                    height: promptBar.terminalFontSize + 4
                    verticalAlignment: Text.AlignVCenter
                }

                TextInput {
                    id: manualCommandInput
                    width: promptRow.width - promptLabel.width
                    height: promptLabel.height
                    enabled: outputRoot.hasActiveTerminalSession
                    color: outputRoot.hasActiveTerminalSession ? "#d4d4d4" : "#555555"
                    font.family: "Consolas"
                    font.pixelSize: promptBar.terminalFontSize
                    verticalAlignment: TextInput.AlignVCenter
                    padding: 0
                    leftPadding: 0
                    selectByMouse: true
                    cursorVisible: activeFocus && outputRoot.hasActiveTerminalSession

                    // Give focus on load so the user can type immediately
                    Component.onCompleted: forceActiveFocus()

                    Keys.onReturnPressed: {
                        if (terminalApp && manualCommandInput.text.trim().length > 0) {
                            const cmd = manualCommandInput.text
                            if (terminalApp.runCommand(cmd)) {
                                if (outputRoot.cmdHistory[outputRoot.cmdHistory.length - 1] !== cmd) {
                                    outputRoot.cmdHistory = outputRoot.cmdHistory.concat([cmd])
                                }
                                outputRoot.cmdHistoryIndex = outputRoot.cmdHistory.length
                                manualCommandInput.text = ""
                            }
                        }
                    }
                    Keys.onEnterPressed: Keys.returnPressed(event)

                    Keys.onUpPressed: {
                        if (outputRoot.cmdHistory.length === 0) return
                        const newIdx = Math.max(0, outputRoot.cmdHistoryIndex - 1)
                        outputRoot.cmdHistoryIndex = newIdx
                        manualCommandInput.text = outputRoot.cmdHistory[newIdx] || ""
                        manualCommandInput.cursorPosition = manualCommandInput.text.length
                    }
                    Keys.onDownPressed: {
                        const newIdx = outputRoot.cmdHistoryIndex + 1
                        if (newIdx >= outputRoot.cmdHistory.length) {
                            outputRoot.cmdHistoryIndex = outputRoot.cmdHistory.length
                            manualCommandInput.text = ""
                        } else {
                            outputRoot.cmdHistoryIndex = newIdx
                            manualCommandInput.text = outputRoot.cmdHistory[newIdx] || ""
                        }
                        manualCommandInput.cursorPosition = manualCommandInput.text.length
                    }
                }
            }
        }
    }
}
