import QtQuick 2.15
import QtQuick.Controls 2.15
import QtQuick.Controls.Material 2.15
import QtQuick.Layouts 1.15
import com.projectmemory.terminal 1.0

ApplicationWindow {
    id: root
    visible: true
    width: 1100
    height: 760
    minimumWidth: 900
    minimumHeight: 620
    title: "Interactive Terminal"
    color: "#1e1e1e"
    Material.theme: Material.Dark
    Material.accent: Material.Blue

    property var sessionTabs: []
    property var savedCommands: []
    property string selectedSavedCommandId: ""
    property string pendingSessionDisplayName: ""
    property var approvalDialogRequest: ({})
    property bool hasActiveTerminalSession: {
        const current = (terminalApp.currentSessionId || "").trim()
        if (!current) {
            return false
        }
        return sessionTabs.some(function(tab) { return tab.sessionId === current })
    }

    function syncSessionDisplayName() {
        const current = (terminalApp.currentSessionId || "").trim()
        if (!current) {
            pendingSessionDisplayName = ""
            return
        }

        const match = sessionTabs.find(function(tab) { return tab.sessionId === current })
        pendingSessionDisplayName = match && match.label ? match.label : current
    }

    function refreshSessionTabs() {
        try {
            const parsed = JSON.parse(terminalApp.sessionTabsJson || "[]")
            sessionTabs = Array.isArray(parsed) ? parsed : []
        } catch (e) {
            sessionTabs = []
        }
        syncSessionDisplayName()
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

    function parseContextInfo(contextInfo) {
        if (!contextInfo || !contextInfo.trim().length) {
            return ({})
        }

        try {
            const parsed = JSON.parse(contextInfo)
            if (parsed && typeof parsed === "object") {
                return parsed
            }
        } catch (e) {
            // no-op: context info may be plain text
        }

        return ({})
    }

    function syncApprovalDialog() {
        if (terminalApp.pendingCount <= 0 || !terminalApp.currentRequestId) {
            approvalDialog.visible = false
            approvalDialogRequest = ({})
            return
        }

        const parsedContext = parseContextInfo(terminalApp.contextInfo || "")
        const correlation = parsedContext.correlation || {}
        const approval = parsedContext.approval || {}
        const source = parsedContext.source || {}

        const requestId = correlation.request_id || terminalApp.currentRequestId
        const looksChatOrigin = parsedContext.origin === "chat" || /^req[_-]/.test(requestId || "")
        const approvalRequired = approval.required === undefined ? true : !!approval.required

        if (!looksChatOrigin || !approvalRequired) {
            approvalDialog.visible = false
            approvalDialogRequest = ({})
            return
        }

        approvalDialogRequest = {
            command: source.command || terminalApp.commandText,
            args: Array.isArray(source.args) ? source.args : [],
            mode: source.mode || "interactive",
            workspaceId: source.workspace_id || "",
            sessionId: source.session_id || terminalApp.currentSessionId,
            requestId: requestId,
            traceId: correlation.trace_id || "",
            clientRequestId: correlation.client_request_id || "",
            contextId: approval.context_id || "",
        }

        approvalDialog.visible = true
        approvalDialog.raise()
        approvalDialog.requestActivate()
    }

    TerminalApp {
        id: terminalApp

        onSessionTabsJsonChanged: root.refreshSessionTabs()
    }

    Connections {
        target: terminalApp

        function onCurrentSessionIdChanged() {
            root.syncSessionDisplayName()
        }

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

        function onPendingCountChanged() {
            root.syncApprovalDialog()
        }

        function onCurrentRequestIdChanged() {
            root.syncApprovalDialog()
        }

        function onContextInfoChanged() {
            root.syncApprovalDialog()
        }
    }

    Component.onCompleted: {
        refreshSessionTabs()
        refreshSavedCommands()
        terminalApp.showSessionStartup()
        root.syncApprovalDialog()
        root.raise()
        root.requestActivate()
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
            Layout.preferredHeight: 128
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
            Layout.preferredHeight: 38
            color: "#2d2d30"

            RowLayout {
                anchors.fill: parent
                anchors.leftMargin: 12
                anchors.rightMargin: 12
                spacing: 8

                Button {
                    text: "+"
                    Layout.preferredWidth: 56
                    Layout.preferredHeight: 34
                    onClicked: {
                        const createdId = terminalApp.createSession()
                        if (createdId) {
                            terminalApp.showSessionStartup()
                        }
                        root.refreshSessionTabs()
                    }
                }

                Button {
                    text: "Saved Commands"
                    Layout.preferredWidth: 164
                    Layout.preferredHeight: 34
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
                    Layout.preferredWidth: 104
                    Layout.preferredHeight: 34
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
                        implicitHeight: 34
                        implicitWidth: Math.max(112, tabLabel.implicitWidth + closeButton.implicitWidth + 18)

                        Row {
                            anchors.fill: parent
                            anchors.leftMargin: 8
                            anchors.rightMargin: 6
                            spacing: 6

                            Button {
                                id: tabLabel
                                flat: true
                                anchors.verticalCenter: parent.verticalCenter
                                font.pixelSize: 13
                                padding: 0
                                leftPadding: 0
                                rightPadding: 0
                                text: tabData.pendingCount > 0
                                    ? tabData.label + " (" + tabData.pendingCount + ")"
                                    : tabData.label
                                display: AbstractButton.TextOnly
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
                                anchors.verticalCenter: parent.verticalCenter
                                width: 18
                                height: 18
                                font.pixelSize: 14
                                padding: 0
                                leftPadding: 0
                                rightPadding: 0
                                onClicked: {
                                    terminalApp.closeSession(tabData.sessionId)
                                    root.refreshSessionTabs()
                                }
                            }
                        }
                    }
                }

                TextField {
                    id: sessionNameInput
                    Layout.preferredWidth: 160
                    Layout.preferredHeight: 30
                    placeholderText: "Session name"
                    text: root.pendingSessionDisplayName
                    onTextChanged: root.pendingSessionDisplayName = text
                    onAccepted: {
                        if (terminalApp.renameSession(terminalApp.currentSessionId || "default", text)) {
                            root.refreshSessionTabs()
                        }
                    }
                }

                Button {
                    text: "Rename"
                    Layout.preferredWidth: 86
                    Layout.preferredHeight: 30
                    onClicked: {
                        if (terminalApp.renameSession(terminalApp.currentSessionId || "default", sessionNameInput.text)) {
                            root.refreshSessionTabs()
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
                SplitView.preferredWidth: Math.max(260, root.width * 0.35)
                SplitView.minimumWidth: 240
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
                SplitView.preferredWidth: Math.max(420, root.width * 0.65)
                SplitView.minimumWidth: 200
                outputText: terminalApp.outputText
                terminalApp: terminalApp
            }
        }

        Rectangle { Layout.fillWidth: true; height: 1; color: "#3c3c3c" }

        Rectangle {
            Layout.fillWidth: true
            Layout.preferredHeight: 64
            color: "#252526"

            RowLayout {
                anchors.fill: parent
                anchors.topMargin: 8
                anchors.bottomMargin: 8
                anchors.leftMargin: 12
                anchors.rightMargin: 12
                spacing: 8

                TextField {
                    id: manualCommandInput
                    Layout.fillWidth: true
                    Layout.minimumWidth: 280
                    enabled: root.hasActiveTerminalSession
                    opacity: enabled ? 1.0 : 0.55
                    placeholderText: enabled
                        ? "Enter command for current session"
                        : "No active terminal session"
                    onAccepted: {
                        if (terminalApp.runCommand(text)) {
                            text = ""
                        }
                    }
                }

                Button {
                    text: "Run"
                    Layout.preferredWidth: 92
                    enabled: root.hasActiveTerminalSession
                    onClicked: {
                        if (terminalApp.runCommand(manualCommandInput.text)) {
                            manualCommandInput.text = ""
                        }
                    }
                }
            }
        }
    }

    // Decline dialog (modal)
    DeclineDialog {
        id: declineDialog
    }

    Window {
        id: approvalDialog
        width: 700
        height: 430
        minimumWidth: 640
        minimumHeight: 380
        visible: false
        modality: Qt.ApplicationModal
        title: "Terminal Approval Required"
        color: "#1e1e1e"
        flags: Qt.Dialog | Qt.WindowTitleHint | Qt.CustomizeWindowHint | Qt.WindowStaysOnTopHint

        onVisibleChanged: {
            if (visible) {
                raise()
                requestActivate()
            }
        }

        ColumnLayout {
            anchors.fill: parent
            anchors.margins: 16
            spacing: 10

            Text {
                text: "Approval Required for Chat Terminal Request"
                color: "#d4d4d4"
                font.pixelSize: 18
                font.bold: true
            }

            Rectangle {
                Layout.fillWidth: true
                Layout.preferredHeight: 1
                color: "#3c3c3c"
            }

            GridLayout {
                Layout.fillWidth: true
                columns: 2
                columnSpacing: 12
                rowSpacing: 8

                Text { text: "Command"; color: "#808080"; font.pixelSize: 12 }
                Text { text: approvalDialogRequest.command || ""; color: "#d4d4d4"; font.pixelSize: 12; wrapMode: Text.WrapAnywhere }

                Text { text: "Args"; color: "#808080"; font.pixelSize: 12 }
                Text {
                    text: Array.isArray(approvalDialogRequest.args) && approvalDialogRequest.args.length
                        ? approvalDialogRequest.args.join(" ")
                        : "(none)"
                    color: "#d4d4d4"
                    font.pixelSize: 12
                    wrapMode: Text.WrapAnywhere
                }

                Text { text: "Mode"; color: "#808080"; font.pixelSize: 12 }
                Text { text: approvalDialogRequest.mode || "interactive"; color: "#d4d4d4"; font.pixelSize: 12 }

                Text { text: "Workspace ID"; color: "#808080"; font.pixelSize: 12 }
                Text { text: approvalDialogRequest.workspaceId || ""; color: "#d4d4d4"; font.pixelSize: 12; wrapMode: Text.WrapAnywhere }

                Text { text: "Session ID"; color: "#808080"; font.pixelSize: 12 }
                Text { text: approvalDialogRequest.sessionId || ""; color: "#d4d4d4"; font.pixelSize: 12; wrapMode: Text.WrapAnywhere }

                Text { text: "Request ID"; color: "#808080"; font.pixelSize: 12 }
                Text { text: approvalDialogRequest.requestId || ""; color: "#d4d4d4"; font.pixelSize: 12; wrapMode: Text.WrapAnywhere }

                Text { text: "Trace ID"; color: "#808080"; font.pixelSize: 12 }
                Text { text: approvalDialogRequest.traceId || ""; color: "#d4d4d4"; font.pixelSize: 12; wrapMode: Text.WrapAnywhere }

                Text { text: "Client Request ID"; color: "#808080"; font.pixelSize: 12 }
                Text { text: approvalDialogRequest.clientRequestId || ""; color: "#d4d4d4"; font.pixelSize: 12; wrapMode: Text.WrapAnywhere }

                Text { text: "Approval Context ID"; color: "#808080"; font.pixelSize: 12 }
                Text { text: approvalDialogRequest.contextId || ""; color: "#d4d4d4"; font.pixelSize: 12; wrapMode: Text.WrapAnywhere }
            }

            Item { Layout.fillHeight: true }

            RowLayout {
                Layout.alignment: Qt.AlignRight
                spacing: 8

                Button {
                    text: "Deny"
                    onClicked: {
                        terminalApp.declineCommand(
                            terminalApp.currentRequestId,
                            "Denied by user in topmost approval dialog"
                        )
                        approvalDialog.visible = false
                    }
                }

                Button {
                    text: "Approve"
                    onClicked: {
                        terminalApp.approveCommand(terminalApp.currentRequestId)
                        approvalDialog.visible = false
                    }
                }
            }
        }
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
