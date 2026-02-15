import QtQuick 2.15
import QtQuick.Controls 2.15
import QtQuick.Layouts 1.15
import com.projectmemory.terminal 1.0

ApplicationWindow {
    id: root
    visible: true
    width: 800
    height: 600
    minimumWidth: 600
    minimumHeight: 400
    title: "Interactive Terminal"
    color: "#1e1e1e"

    property var sessionTabs: []
    property var savedCommands: []
    property string selectedSavedCommandId: ""

    function refreshSessionTabs() {
        try {
            const parsed = JSON.parse(terminalApp.sessionTabsJson || "[]")
            sessionTabs = Array.isArray(parsed) ? parsed : []
        } catch (e) {
            sessionTabs = []
        }
    }

    function refreshSavedCommands() {
        try {
            const parsed = JSON.parse(terminalApp.savedCommandsJson() || "[]")
            savedCommands = Array.isArray(parsed) ? parsed : []
        } catch (e) {
            savedCommands = []
        }

        if (!savedCommands.some(function(entry) { return entry.id === selectedSavedCommandId })) {
            selectedSavedCommandId = ""
        }
    }

    TerminalApp {
        id: terminalApp

        onSessionTabsJsonChanged: root.refreshSessionTabs()
    }

    Connections {
        target: terminalApp

        function onCurrentTerminalProfileChanged() {
            if (terminalProfileSelector) {
                terminalProfileSelector.syncFromBridge()
            }
        }

        function onCurrentWorkspacePathChanged() {
            if (workspacePathField && !workspacePathField.activeFocus) {
                workspacePathField.text = terminalApp.currentWorkspacePath
            }
        }

        function onCurrentVenvPathChanged() {
            if (venvPathField && !venvPathField.activeFocus) {
                venvPathField.text = terminalApp.currentVenvPath
            }
        }

        function onCurrentActivateVenvChanged() {
            if (activateVenvCheck) {
                activateVenvCheck.checked = terminalApp.currentActivateVenv
            }
        }
    }

    Component.onCompleted: {
        refreshSessionTabs()
        refreshSavedCommands()
    }

    ColumnLayout {
        anchors.fill: parent
        spacing: 0

        // Header bar
        Rectangle {
            Layout.fillWidth: true
            Layout.preferredHeight: 48
            color: "#252526"

            RowLayout {
                anchors.fill: parent
                anchors.leftMargin: 16
                anchors.rightMargin: 16

                // Connection status dot
                Rectangle {
                    width: 10; height: 10; radius: 5
                    color: terminalApp.isConnected ? "#4caf50" : "#f44336"
                }

                Text {
                    text: terminalApp.isConnected ? "Connected" : "Disconnected"
                    color: "#808080"
                    font.pixelSize: 12
                }

                Item { Layout.fillWidth: true }

                Text {
                    text: "Interactive Terminal"
                    color: "#d4d4d4"
                    font.pixelSize: 16
                    font.bold: true
                }

                Item { Layout.fillWidth: true }

                // Pending count badge
                Rectangle {
                    visible: terminalApp.pendingCount > 0
                    width: 24; height: 24; radius: 12
                    color: "#ff9800"
                    Text {
                        anchors.centerIn: parent
                        text: terminalApp.pendingCount
                        color: "white"
                        font.pixelSize: 12
                        font.bold: true
                    }
                }
            }
        }

        // Separator
        Rectangle { Layout.fillWidth: true; height: 1; color: "#3c3c3c" }

        // Session runtime controls
        Rectangle {
            Layout.fillWidth: true
            Layout.preferredHeight: 96
            color: "#252526"

            ColumnLayout {
                anchors.fill: parent
                anchors.leftMargin: 12
                anchors.rightMargin: 12
                spacing: 6

                RowLayout {
                    Layout.fillWidth: true
                    spacing: 8

                    Text {
                        text: "Session: " + (terminalApp.currentSessionId || "default")
                        color: "#d4d4d4"
                        font.pixelSize: 12
                    }

                    Item { Layout.fillWidth: true }

                    Text {
                        text: "Terminal Profile"
                        color: "#808080"
                        font.pixelSize: 11
                    }

                    ComboBox {
                        id: terminalProfileSelector
                        model: ["system", "powershell", "pwsh", "cmd", "bash"]
                        implicitWidth: 140

                        function syncFromBridge() {
                            const profile = terminalApp.currentTerminalProfile || "system"
                            const idx = model.indexOf(profile)
                            currentIndex = idx >= 0 ? idx : 0
                        }

                        onActivated: terminalApp.setSessionTerminalProfile(currentText)
                        Component.onCompleted: syncFromBridge()
                    }
                }

                RowLayout {
                    Layout.fillWidth: true
                    spacing: 8

                    TextField {
                        id: workspacePathField
                        Layout.fillWidth: true
                        placeholderText: "Workspace path (per session)"
                        text: terminalApp.currentWorkspacePath
                        onEditingFinished: terminalApp.setSessionWorkspacePath(text)
                    }

                    TextField {
                        id: venvPathField
                        Layout.fillWidth: true
                        placeholderText: "Venv path (optional)"
                        text: terminalApp.currentVenvPath
                        onEditingFinished: terminalApp.setSessionVenvPath(text)
                    }

                    CheckBox {
                        id: activateVenvCheck
                        text: "Activate venv"
                        checked: terminalApp.currentActivateVenv
                        onClicked: terminalApp.setSessionActivateVenv(checked)
                    }
                }
            }
        }

        Rectangle { Layout.fillWidth: true; height: 1; color: "#3c3c3c" }

        // Session tabs
        Rectangle {
            Layout.fillWidth: true
            Layout.preferredHeight: 44
            color: "#2d2d30"

            RowLayout {
                anchors.fill: parent
                anchors.leftMargin: 12
                anchors.rightMargin: 12
                spacing: 8

                Button {
                    text: "+"
                    onClicked: {
                        terminalApp.createSession()
                        root.refreshSessionTabs()
                    }
                }

                Button {
                    text: "Saved Commands"
                    onClicked: {
                        if (terminalApp.openSavedCommands(savedCommandsWorkspaceField.text)) {
                            savedCommandsWorkspaceField.text = terminalApp.savedCommandsWorkspaceId()
                            root.refreshSavedCommands()
                            savedCommandsDrawer.open()
                        }
                    }
                }

                Button {
                    text: "Reopen"
                    onClicked: {
                        if (terminalApp.reopenSavedCommands()) {
                            savedCommandsWorkspaceField.text = terminalApp.savedCommandsWorkspaceId()
                            root.refreshSavedCommands()
                            savedCommandsDrawer.open()
                        }
                    }
                }

                Repeater {
                    model: root.sessionTabs

                    delegate: Rectangle {
                        readonly property var tabData: modelData
                        radius: 6
                        color: tabData.isActive ? "#3a3d41" : "#252526"
                        border.color: tabData.isActive ? "#569cd6" : "#3c3c3c"
                        border.width: 1
                        implicitHeight: 30
                        implicitWidth: tabLabel.implicitWidth + closeButton.implicitWidth + 18

                        Row {
                            anchors.fill: parent
                            anchors.leftMargin: 8
                            anchors.rightMargin: 6
                            spacing: 6
                            verticalCenter: parent.verticalCenter

                            Button {
                                id: tabLabel
                                flat: true
                                anchors.verticalCenter: parent.verticalCenter
                                text: tabData.pendingCount > 0
                                    ? tabData.label + " (" + tabData.pendingCount + ")"
                                    : tabData.label
                                onClicked: {
                                    terminalApp.switchSession(tabData.sessionId)
                                    root.refreshSessionTabs()
                                }
                            }

                            Button {
                                id: closeButton
                                visible: tabData.sessionId !== "default"
                                enabled: tabData.canClose
                                text: "×"
                                flat: true
                                onClicked: {
                                    terminalApp.closeSession(tabData.sessionId)
                                    root.refreshSessionTabs()
                                }
                            }
                        }
                    }
                }

                Item { Layout.fillWidth: true }
            }
        }

        Rectangle { Layout.fillWidth: true; height: 1; color: "#3c3c3c" }

        // Main content: SplitView with command area and output
        SplitView {
            Layout.fillWidth: true
            Layout.fillHeight: true
            orientation: Qt.Horizontal

            // Left pane: Command cards
            Rectangle {
                SplitView.preferredWidth: 400
                SplitView.minimumWidth: 300
                color: "#1e1e1e"

                ScrollView {
                    anchors.fill: parent
                    anchors.margins: 8

                    ColumnLayout {
                        width: parent.width - 16

                        // Status text when no commands
                        Text {
                            visible: terminalApp.pendingCount === 0
                            text: terminalApp.statusText || "Waiting for commands..."
                            color: "#808080"
                            font.pixelSize: 14
                            Layout.alignment: Qt.AlignHCenter
                            Layout.topMargin: 40
                        }

                        // Current command card
                        CommandCard {
                            visible: terminalApp.pendingCount > 0
                            commandText: terminalApp.commandText
                            workingDir: terminalApp.workingDirectory
                            contextInfo: terminalApp.contextInfo
                            requestId: terminalApp.currentRequestId
                            Layout.fillWidth: true
                        }
                    }
                }
            }

            // Right pane: Output
            OutputView {
                SplitView.preferredWidth: 400
                SplitView.minimumWidth: 200
                outputText: terminalApp.outputText
            }
        }
    }

    // Decline dialog (modal)
    DeclineDialog {
        id: declineDialog
    }

    Drawer {
        id: savedCommandsDrawer
        edge: Qt.RightEdge
        width: Math.max(320, root.width * 0.38)
        height: root.height
        onOpened: {
            savedCommandsWorkspaceField.text = terminalApp.savedCommandsWorkspaceId()
            root.refreshSavedCommands()
        }

        ColumnLayout {
            anchors.fill: parent
            anchors.margins: 12
            spacing: 8

            Text {
                text: "Saved Commands"
                color: "#d4d4d4"
                font.pixelSize: 16
                font.bold: true
            }

            Text {
                text: "Selected session: " + (terminalApp.currentSessionId || "default")
                color: "#808080"
                font.pixelSize: 11
            }

            TextField {
                id: savedCommandsWorkspaceField
                Layout.fillWidth: true
                placeholderText: "Workspace ID"
                text: terminalApp.savedCommandsWorkspaceId()
                onEditingFinished: {
                    terminalApp.openSavedCommands(text)
                    savedCommandsWorkspaceField.text = terminalApp.savedCommandsWorkspaceId()
                    root.refreshSavedCommands()
                }
            }

            RowLayout {
                Layout.fillWidth: true

                Button {
                    text: "Open"
                    onClicked: {
                        terminalApp.openSavedCommands(savedCommandsWorkspaceField.text)
                        savedCommandsWorkspaceField.text = terminalApp.savedCommandsWorkspaceId()
                        root.refreshSavedCommands()
                    }
                }

                Button {
                    text: "Reopen"
                    onClicked: {
                        terminalApp.reopenSavedCommands()
                        savedCommandsWorkspaceField.text = terminalApp.savedCommandsWorkspaceId()
                        root.refreshSavedCommands()
                    }
                }

                Item { Layout.fillWidth: true }
            }

            ListView {
                Layout.fillWidth: true
                Layout.fillHeight: true
                clip: true
                model: root.savedCommands

                delegate: Rectangle {
                    readonly property var entry: modelData
                    width: ListView.view.width
                    height: 58
                    radius: 4
                    color: root.selectedSavedCommandId === entry.id ? "#3a3d41" : "#2d2d30"
                    border.color: root.selectedSavedCommandId === entry.id ? "#569cd6" : "#3c3c3c"
                    border.width: 1

                    Column {
                        anchors.fill: parent
                        anchors.leftMargin: 8
                        anchors.rightMargin: 8
                        anchors.topMargin: 6
                        spacing: 2

                        Text {
                            text: entry.name
                            color: "#d4d4d4"
                            font.pixelSize: 12
                            elide: Text.ElideRight
                        }

                        Text {
                            text: entry.command
                            color: "#9da0a6"
                            font.pixelSize: 11
                            elide: Text.ElideRight
                        }
                    }

                    MouseArea {
                        anchors.fill: parent
                        onClicked: root.selectedSavedCommandId = entry.id
                    }
                }
            }

            RowLayout {
                Layout.fillWidth: true

                Button {
                    text: "Run In Selected Session"
                    enabled: root.selectedSavedCommandId !== ""
                    onClicked: {
                        if (terminalApp.executeSavedCommand(root.selectedSavedCommandId)) {
                            root.refreshSavedCommands()
                            savedCommandsDrawer.close()
                        }
                    }
                }

                Item { Layout.fillWidth: true }
            }
        }
    }
}
