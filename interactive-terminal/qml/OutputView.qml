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

    color: "#1a1a1a"

    ColumnLayout {
        anchors.fill: parent
        spacing: 0

        // Header bar
        Rectangle {
            Layout.fillWidth: true
            Layout.preferredHeight: 36
            color: "#252526"

            RowLayout {
                anchors.fill: parent
                anchors.leftMargin: 12
                anchors.rightMargin: 12

                Text {
                    text: "Output"
                    color: "#d4d4d4"
                    font.pixelSize: 13
                    font.bold: true
                }

                Item { Layout.fillWidth: true }

                Button {
                    id: clearBtn
                    text: "Clear"
                    implicitWidth: 56
                    implicitHeight: 26

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

                    onClicked: terminalApp.clearOutput()
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
                font.pixelSize: 12
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
    }
}
