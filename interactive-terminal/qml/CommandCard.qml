import QtQuick 2.15
import QtQuick.Controls 2.15
import QtQuick.Layouts 1.15

/**
 * CommandCard — displays a pending command with approve/decline actions.
 *
 * Properties exposed to parent:
 *   commandText  – the shell command string
 *   workingDir   – working directory for the command
 *   contextInfo  – optional context / description
 *   requestId    – unique ID used when approving or declining
 */
Rectangle {
    id: card

    // --- public properties ---------------------------------------------------
    property string commandText: ""
    property string workingDir: ""
    property string contextInfo: ""
    property string requestId: ""

    // --- appearance ----------------------------------------------------------
    color: "#2d2d2d"
    radius: 8
    border.color: "#3c3c3c"
    border.width: 1
    implicitHeight: cardLayout.implicitHeight + 32

    ColumnLayout {
        id: cardLayout
        anchors.fill: parent
        anchors.margins: 16
        spacing: 12

        // Label
        Text {
            text: "Pending Command"
            color: "#ff9800"
            font.pixelSize: 12
            font.bold: true
            Layout.fillWidth: true
        }

        // Command text in highlighted box
        Rectangle {
            Layout.fillWidth: true
            color: "#1a1a2e"
            radius: 4
            implicitHeight: commandLabel.implicitHeight + 16

            Text {
                id: commandLabel
                anchors.fill: parent
                anchors.margins: 8
                text: card.commandText
                color: "#d4d4d4"
                font.family: "Consolas"
                font.pixelSize: 13
                wrapMode: Text.WrapAnywhere
            }
        }

        // Working directory
        RowLayout {
            spacing: 6
            Layout.fillWidth: true

            Text {
                text: "Directory:"
                color: "#808080"
                font.pixelSize: 11
            }
            Text {
                text: card.workingDir
                color: "#b0b0b0"
                font.pixelSize: 11
                elide: Text.ElideMiddle
                Layout.fillWidth: true
            }
        }

        // Context info (shown only when non-empty)
        Text {
            visible: card.contextInfo.length > 0
            text: card.contextInfo
            color: "#808080"
            font.pixelSize: 11
            font.italic: true
            wrapMode: Text.WordWrap
            Layout.fillWidth: true
        }

        // Action buttons
        RowLayout {
            Layout.fillWidth: true
            spacing: 12

            Button {
                id: approveBtn
                text: "Approve"
                Layout.fillWidth: true
                implicitHeight: 36
                font.pixelSize: 11

                contentItem: Text {
                    text: approveBtn.text
                    color: "white"
                    font.pixelSize: 11
                    font.bold: true
                    horizontalAlignment: Text.AlignHCenter
                    verticalAlignment: Text.AlignVCenter
                }

                background: Rectangle {
                    color: approveBtn.down ? "#388e3c" : (approveBtn.hovered ? "#66bb6a" : "#4caf50")
                    radius: 4
                }

                onClicked: terminalApp.approveCommand(card.requestId)
            }

            Button {
                id: declineBtn
                text: "Decline"
                Layout.fillWidth: true
                implicitHeight: 36
                font.pixelSize: 11

                contentItem: Text {
                    text: declineBtn.text
                    color: "white"
                    font.pixelSize: 11
                    font.bold: true
                    horizontalAlignment: Text.AlignHCenter
                    verticalAlignment: Text.AlignVCenter
                }

                background: Rectangle {
                    color: declineBtn.down ? "#c62828" : (declineBtn.hovered ? "#ef5350" : "#f44336")
                    radius: 4
                }

                onClicked: {
                    declineDialog.open(card.requestId, card.commandText)
                }
            }
        }
    }
}
