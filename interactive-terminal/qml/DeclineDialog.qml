import QtQuick 2.15
import QtQuick.Controls 2.15
import QtQuick.Layouts 1.15

/**
 * DeclineDialog — modal dialog for entering a reason when declining a command.
 *
 * Usage from parent:
 *   declineDialog.open(requestId, commandSummary)
 */
Dialog {
    id: dialog
    title: "Decline Command"
    modal: true
    anchors.centerIn: parent
    width: Math.min(parent.width * 0.8, 480)
    padding: 0

    // --- public properties ---------------------------------------------------
    property string requestId: ""
    property string commandSummary: ""

    // --- public function -----------------------------------------------------
    function open(rid, summary) {
        dialog.requestId = rid
        dialog.commandSummary = summary
        reasonInput.text = ""
        dialog.visible = true
    }

    background: Rectangle {
        color: "#2d2d2d"
        border.color: "#3c3c3c"
        border.width: 1
        radius: 8
    }

    header: Rectangle {
        color: "#252526"
        height: 44
        radius: 8

        // Flatten the bottom corners so only top is rounded
        Rectangle {
            anchors.bottom: parent.bottom
            width: parent.width
            height: 8
            color: parent.color
        }

        Text {
            anchors.centerIn: parent
            text: dialog.title
            color: "#d4d4d4"
            font.pixelSize: 15
            font.bold: true
        }
    }

    contentItem: ColumnLayout {
        spacing: 12

        Item { Layout.preferredHeight: 8 }

        // Command summary
        ColumnLayout {
            Layout.fillWidth: true
            Layout.leftMargin: 20
            Layout.rightMargin: 20
            spacing: 4

            Text {
                text: "Command:"
                color: "#808080"
                font.pixelSize: 11
            }

            Rectangle {
                Layout.fillWidth: true
                color: "#1a1a2e"
                radius: 4
                implicitHeight: summaryLabel.implicitHeight + 12

                Text {
                    id: summaryLabel
                    anchors.fill: parent
                    anchors.margins: 6
                    text: dialog.commandSummary
                    color: "#d4d4d4"
                    font.family: "Consolas"
                    font.pixelSize: 12
                    wrapMode: Text.WrapAnywhere
                    maximumLineCount: 4
                    elide: Text.ElideRight
                }
            }
        }

        // Reason input
        ColumnLayout {
            Layout.fillWidth: true
            Layout.leftMargin: 20
            Layout.rightMargin: 20
            spacing: 4

            Text {
                text: "Reason:"
                color: "#808080"
                font.pixelSize: 11
            }

            ScrollView {
                Layout.fillWidth: true
                Layout.minimumHeight: 80
                Layout.preferredHeight: 100

                TextArea {
                    id: reasonInput
                    placeholderText: "Enter reason for declining..."
                    color: "#d4d4d4"
                    font.pixelSize: 13
                    wrapMode: TextEdit.Wrap
                    selectByMouse: true

                    background: Rectangle {
                        color: "#1e1e1e"
                        border.color: reasonInput.activeFocus ? "#4a9eff" : "#3c3c3c"
                        border.width: 1
                        radius: 4
                    }
                }
            }
        }

        Item { Layout.preferredHeight: 4 }

        // Action buttons
        RowLayout {
            Layout.fillWidth: true
            Layout.leftMargin: 20
            Layout.rightMargin: 20
            Layout.bottomMargin: 16
            spacing: 12

            Item { Layout.fillWidth: true }

            Button {
                id: cancelBtn
                text: "Cancel"
                implicitWidth: 90
                implicitHeight: 34

                contentItem: Text {
                    text: cancelBtn.text
                    color: "#d4d4d4"
                    font.pixelSize: 13
                    horizontalAlignment: Text.AlignHCenter
                    verticalAlignment: Text.AlignVCenter
                }

                background: Rectangle {
                    color: cancelBtn.down ? "#404040" : (cancelBtn.hovered ? "#383838" : "#2d2d2d")
                    border.color: "#555555"
                    border.width: 1
                    radius: 4
                }

                onClicked: dialog.visible = false
            }

            Button {
                id: submitBtn
                text: "Submit"
                enabled: reasonInput.text.trim().length > 0
                implicitWidth: 90
                implicitHeight: 34

                contentItem: Text {
                    text: submitBtn.text
                    color: submitBtn.enabled ? "white" : "#606060"
                    font.pixelSize: 13
                    font.bold: true
                    horizontalAlignment: Text.AlignHCenter
                    verticalAlignment: Text.AlignVCenter
                }

                background: Rectangle {
                    color: {
                        if (!submitBtn.enabled) return "#333333"
                        if (submitBtn.down) return "#c62828"
                        if (submitBtn.hovered) return "#ef5350"
                        return "#f44336"
                    }
                    radius: 4
                }

                onClicked: {
                    terminalApp.declineCommand(dialog.requestId, reasonInput.text.trim())
                    dialog.visible = false
                }
            }
        }
    }
}
