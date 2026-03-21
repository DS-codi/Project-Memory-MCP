import QtQuick 2.15
import QtQuick.Controls 2.15
import QtQuick.Controls.Material 2.15
import QtQuick.Layouts 1.15

// ChatPanel.qml — Interactive chat side-panel for brainstorm refinement.
Rectangle {
    id: chatPanel
    color: "#161b22"
    border.color: "#30363d"
    border.width: 1

    property var formApp
    property var messages: []

    onFormAppChanged: {
        if (formApp) {
            updateMessages()
        }
    }

    Connections {
        target: formApp
        function onChatHistoryJsonChanged() { updateMessages() }
    }

    function updateMessages() {
        try {
            messages = JSON.parse(formApp.chatHistoryJson)
        } catch (e) {
            console.error("Failed to parse chat history:", e)
        }
    }

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: 10
        spacing: 10

        Label {
            text: "Agent Discussion"
            font.pixelSize: 14; font.bold: true
            color: "#c9d1d9"
        }

        ScrollView {
            id: chatScroll
            Layout.fillWidth: true
            Layout.fillHeight: true
            clip: true

            ListView {
                id: chatList
                model: chatPanel.messages
                spacing: 8
                delegate: ColumnLayout {
                    width: chatList.width
                    spacing: 4

                    Rectangle {
                        Layout.alignment: modelData.role === "user" ? Qt.AlignRight : Qt.AlignLeft
                        Layout.maximumWidth: parent.width * 0.8
                        implicitWidth: msgText.implicitWidth + 20
                        implicitHeight: msgText.implicitHeight + 16
                        radius: 8
                        color: modelData.role === "user" ? "#238636" : "#21262d"
                        border.color: modelData.role === "user" ? "transparent" : "#30363d"

                        Label {
                            id: msgText
                            anchors.fill: parent
                            anchors.margins: 8
                            text: modelData.content
                            wrapMode: Text.WordWrap
                            color: "#ffffff"
                            font.pixelSize: 12
                        }
                    }

                    Label {
                        Layout.alignment: modelData.role === "user" ? Qt.AlignRight : Qt.AlignLeft
                        text: (modelData.role === "user" ? "You" : "Agent") + " • " + new Date(modelData.timestamp).toLocaleTimeString()
                        font.pixelSize: 9
                        color: "#8b949e"
                    }
                }
                onCountChanged: chatScroll.ScrollBar.vertical.position = 1.0
            }
        }

        RowLayout {
            Layout.fillWidth: true
            spacing: 8

            TextField {
                id: chatInput
                Layout.fillWidth: true
                placeholderText: "Type a message..."
                font.pixelSize: 12
                background: Rectangle {
                    color: "#0d1117"
                    border.color: chatInput.activeFocus ? "#58a6ff" : "#30363d"
                    radius: 4
                }
                onAccepted: sendBtn.clicked()
            }

            Button {
                id: sendBtn
                text: "Send"
                flat: false
                highlighted: true
                onClicked: {
                    if (chatInput.text.trim() !== "") {
                        formApp.sendChatMessage(chatInput.text)
                        chatInput.text = ""
                    }
                }
            }
        }
    }
}
