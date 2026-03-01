import QtQuick 2.15
import QtQuick.Controls 2.15
import QtQuick.Controls.Material 2.15
import QtQuick.Layouts 1.15
import Qt.labs.platform 1.1 as Platform
import com.projectmemory.terminal 1.0

ApplicationWindow {
    id: root
    visible: true
    width: 1100
    height: 760
    x: 80
    y: 80
    minimumWidth: 480
    minimumHeight: 400
    title: "Interactive Terminal"
    color: "#1e1e1e"
    Material.theme: Material.Dark
    Material.accent: Material.Blue
    property int uiControlFontPx: 11
    property int uiInputFontPx: 11

    property var sessionTabs: []
    property var savedCommands: []
    property string selectedSavedCommandId: ""
    property string pendingSessionDisplayName: ""
    property var approvalDialogRequest: ({})
    property bool quitRequested: false
    property bool popupOverlayVisible: geminiSettingsDialog.visible
        || approvalDialog.visible
        || savedCommandsDrawer.visible
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

    function showMainWindow() {
        root.visible = true
        root.showNormal()
        root.raise()
        root.requestActivate()
        Qt.callLater(function() {
            root.raise()
            root.requestActivate()
        })
    }

    function savedCommandsWorkspaceOrDefault(rawValue) {
        const v = (rawValue || "").trim()
        return v.length > 0 ? v : "default"
    }

    function hideToTray() {
        root.visible = false
    }

    function requestQuit() {
        quitRequested = true
        Qt.quit()
    }

    function syncApprovalDialog() {
        if (terminalApp.pendingCount <= 0 || !terminalApp.currentRequestId) {
            approvalDialog.close()
            approvalDialogRequest = ({})
            return
        }

        const parsedContext = parseContextInfo(terminalApp.contextInfo || "")
        const correlation = parsedContext.correlation || {}
        const source = parsedContext.source || {}

        if (terminalApp.currentAllowlisted) {
            approvalDialog.close()
            approvalDialogRequest = ({})
            return
        }

        const requestId = correlation.request_id || terminalApp.currentRequestId

        approvalDialogRequest = {
            command: source.command || terminalApp.commandText,
            args: Array.isArray(source.args) ? source.args : [],
            mode: source.mode || "interactive",
            workspaceId: source.workspace_id || "",
            workspacePath: terminalApp.currentWorkspacePath || "",
            workingDirectory: terminalApp.workingDirectory || "",
            sessionId: source.session_id || terminalApp.currentSessionId,
            requestId: requestId,
            traceId: correlation.trace_id || "",
            clientRequestId: correlation.client_request_id || "",
            contextId: (parsedContext.approval || {}).context_id || "",
        }

        root.showMainWindow()
        if (!approvalDialog.visible) {
            approvalDialog.open()
        }
        approvalDialog.forceActiveFocus()
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

        function onCurrentDefaultTerminalProfileChanged() {
            if (defaultTerminalProfileSelector) {
                defaultTerminalProfileSelector.syncFromBridge()
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

        function onCommandReceived() {
            if (!terminalApp.currentAllowlisted) {
                root.showMainWindow()
            }
            root.syncApprovalDialog()
        }
    }

    Component.onCompleted: {
        refreshSessionTabs()
        refreshSavedCommands()
        terminalApp.showSessionStartup()
        root.syncApprovalDialog()
        root.showMainWindow()
        Qt.callLater(function() { root.showMainWindow() })
    }

    onClosing: function(close) {
        if (quitRequested) {
            close.accepted = true
            return
        }

        if (trayIcon.available) {
            close.accepted = false
            root.hideToTray()
        } else {
            close.accepted = true
        }
    }

    Platform.SystemTrayIcon {
        id: trayIcon
        visible: true
        icon.source: terminalApp.trayIconUrl
        tooltip: "Interactive Terminal | Pending: " + terminalApp.pendingCount
            + " | CPU: " + terminalApp.cpuUsagePercent.toFixed(1) + "%"
            + " | RAM: " + terminalApp.memoryUsageMb.toFixed(1) + " MB"

        onActivated: function(reason) {
            if (reason === Platform.SystemTrayIcon.Trigger || reason === Platform.SystemTrayIcon.DoubleClick) {
                root.showMainWindow()
            }
        }

        menu: Platform.Menu {
            Platform.MenuItem {
                text: "Show"
                onTriggered: root.showMainWindow()
            }
            Platform.MenuItem {
                text: "Start with Windows"
                checkable: true
                checked: terminalApp.startWithWindows
                onTriggered: {
                    const next = !terminalApp.startWithWindows
                    terminalApp.setStartWithWindowsEnabled(next)
                    checked = terminalApp.startWithWindows
                }
            }
            Platform.MenuSeparator {}
            Platform.MenuItem {
                text: "Quit"
                onTriggered: root.requestQuit()
            }
        }
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

                // Connection/status indicator
                Rectangle {
                    width: 10; height: 10; radius: 5
                    color: terminalApp.isConnected
                        ? "#4caf50"
                        : ((terminalApp.statusText || "").toLowerCase().indexOf("listening") >= 0 ? "#ff9800" : "#f44336")
                }

                Text {
                    text: terminalApp.isConnected
                        ? "Connected"
                        : ((terminalApp.statusText || "").toLowerCase().indexOf("listening") >= 0 ? "Listening" : "Disconnected")
                    color: "#808080"
                    font.pixelSize: 12
                }

                Text {
                    text: "CPU " + terminalApp.cpuUsagePercent.toFixed(1) + "% | RAM " + terminalApp.memoryUsageMb.toFixed(1) + " MB"
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
            implicitHeight: sessionControlsCol.implicitHeight + 16
            color: "#252526"

            ColumnLayout {
                id: sessionControlsCol
                anchors.top: parent.top
                anchors.left: parent.left
                anchors.right: parent.right
                anchors.topMargin: 8
                anchors.leftMargin: 12
                anchors.rightMargin: 12
                spacing: 6

                RowLayout {
                    Layout.fillWidth: true
                    spacing: 8

                    Text {
                        text: "Session: " + ((terminalApp.currentSessionId || "").length > 0 ? terminalApp.currentSessionId : "(none)")
                        color: "#d4d4d4"
                        font.pixelSize: 12
                    }

                    Text {
                        text: "Profile"
                        color: "#808080"
                        font.pixelSize: 11
                    }

                    ComboBox {
                        id: terminalProfileSelector
                        model: ["system", "powershell", "pwsh", "cmd", "bash"]
                        implicitWidth: 130
                        implicitHeight: 28
                        font.pixelSize: root.uiControlFontPx
                        enabled: root.hasActiveTerminalSession

                        function syncFromBridge() {
                            const profile = terminalApp.currentTerminalProfile || "system"
                            const idx = model.indexOf(profile)
                            currentIndex = idx >= 0 ? idx : 0
                        }

                        onActivated: terminalApp.setSessionTerminalProfile(currentText)
                        Component.onCompleted: {
                            syncFromBridge()
                            popup.z = 3000
                        }
                    }

                    Text {
                        text: "Default"
                        color: "#808080"
                        font.pixelSize: 11
                    }

                    ComboBox {
                        id: defaultTerminalProfileSelector
                        model: ["system", "powershell", "pwsh", "cmd", "bash"]
                        implicitWidth: 130
                        implicitHeight: 28
                        font.pixelSize: root.uiControlFontPx
                        enabled: root.hasActiveTerminalSession

                        function syncFromBridge() {
                            const profile = terminalApp.currentDefaultTerminalProfile || "system"
                            const idx = model.indexOf(profile)
                            currentIndex = idx >= 0 ? idx : 0
                        }

                        onActivated: terminalApp.setDefaultTerminalProfile(currentText)
                        Component.onCompleted: {
                            syncFromBridge()
                            popup.z = 3000
                        }
                    }

                    Item { Layout.fillWidth: true }
                }

                RowLayout {
                    Layout.fillWidth: true
                    spacing: 8

                    TextField {
                        id: workspacePathField
                        Layout.preferredWidth: 240
                        placeholderText: "Workspace path (per session)"
                        font.pixelSize: root.uiInputFontPx
                        enabled: root.hasActiveTerminalSession
                        text: terminalApp.currentWorkspacePath
                        onEditingFinished: terminalApp.setSessionWorkspacePath(text)
                    }

                    TextField {
                        id: venvPathField
                        Layout.preferredWidth: 220
                        placeholderText: "Venv path (optional)"
                        font.pixelSize: root.uiInputFontPx
                        enabled: root.hasActiveTerminalSession
                        text: terminalApp.currentVenvPath
                        onEditingFinished: terminalApp.setSessionVenvPath(text)
                    }

                    CheckBox {
                        id: activateVenvCheck
                        text: "Activate venv"
                        font.pixelSize: root.uiControlFontPx
                        enabled: root.hasActiveTerminalSession
                        checked: terminalApp.currentActivateVenv
                        onClicked: terminalApp.setSessionActivateVenv(checked)
                    }
                }

                RowLayout {
                    Layout.fillWidth: true
                    spacing: 8

                    Button {
                        text: "Launch Gemini CLI"
                        font.pixelSize: root.uiControlFontPx
                        enabled: terminalApp.geminiKeyPresent
                        onClicked: {
                            terminalApp.launchGeminiInTab()
                            geminiSettingsDialog.close()
                        }
                    }

                    Button {
                        text: "Gemini \u2699"
                        font.pixelSize: root.uiControlFontPx
                        highlighted: terminalApp.geminiKeyPresent
                        onClicked: geminiSettingsDialog.open()
                    }

                    Text {
                        text: terminalApp.geminiKeyPresent ? "Key: stored" : "Key: not set"
                        color: terminalApp.geminiKeyPresent ? "#4caf50" : "#808080"
                        font.pixelSize: 11
                    }

                    Item { Layout.fillWidth: true }

                    Button {
                        text: "New Tab"
                        font.pixelSize: root.uiControlFontPx
                        Layout.preferredWidth: 92
                        Layout.preferredHeight: 30
                        onClicked: {
                            terminalApp.createSession()
                            root.refreshSessionTabs()
                        }
                    }

                    Button {
                        text: "Saved Commands"
                        font.pixelSize: root.uiControlFontPx
                        Layout.preferredWidth: 148
                        Layout.preferredHeight: 30
                        onClicked: {
                            if (savedCommandsDrawer.visible) {
                                savedCommandsDrawer.close()
                                return
                            }

                            const workspaceId = root.savedCommandsWorkspaceOrDefault(savedCommandsWorkspaceField.text)
                            if (terminalApp.openSavedCommands(workspaceId)) {
                                savedCommandsWorkspaceField.text = terminalApp.savedCommandsWorkspaceId()
                                root.refreshSavedCommands()
                                savedCommandsDrawer.open()
                                Qt.callLater(function() {
                                    savedCommandsWorkspaceField.forceActiveFocus()
                                    savedCommandsWorkspaceField.selectAll()
                                })
                            }
                        }
                    }

                    TextField {
                        id: sessionNameInput
                        Layout.preferredWidth: 150
                        Layout.preferredHeight: 30
                        placeholderText: "Session name"
                        font.pixelSize: root.uiInputFontPx
                        enabled: root.hasActiveTerminalSession
                        text: root.pendingSessionDisplayName
                        onTextChanged: root.pendingSessionDisplayName = text
                        onAccepted: {
                            if (root.hasActiveTerminalSession && terminalApp.renameSession(terminalApp.currentSessionId, text)) {
                                root.refreshSessionTabs()
                            }
                        }
                    }

                    Button {
                        text: "Rename"
                        Layout.preferredWidth: 92
                        Layout.preferredHeight: 30
                        font.pixelSize: root.uiControlFontPx
                        enabled: root.hasActiveTerminalSession
                        onClicked: {
                            if (root.hasActiveTerminalSession && terminalApp.renameSession(terminalApp.currentSessionId, sessionNameInput.text)) {
                                root.refreshSessionTabs()
                            }
                        }
                    }

                    Button {
                        text: "Restart"
                        Layout.preferredWidth: 82
                        Layout.preferredHeight: 30
                        font.pixelSize: root.uiControlFontPx
                        enabled: root.hasActiveTerminalSession
                        onClicked: {
                            if (root.hasActiveTerminalSession) {
                                terminalApp.switchSession(terminalApp.currentSessionId)
                            }
                        }
                    }

                    Button {
                        text: "Copy All"
                        Layout.preferredWidth: 90
                        Layout.preferredHeight: 30
                        font.pixelSize: root.uiControlFontPx
                        onClicked: terminalApp.copyCurrentOutput()
                    }

                    Button {
                        text: "Copy Last"
                        Layout.preferredWidth: 90
                        Layout.preferredHeight: 30
                        font.pixelSize: root.uiControlFontPx
                        enabled: root.hasActiveTerminalSession
                        onClicked: terminalApp.copyLastCommandOutput()
                    }
                }
            }
        }

        Rectangle { Layout.fillWidth: true; height: 1; color: "#3c3c3c" }

        // Session tabs
        Rectangle {
            Layout.fillWidth: true
            Layout.preferredHeight: 40
            color: "#2d2d30"

            RowLayout {
                anchors.fill: parent
                anchors.leftMargin: 12
                anchors.rightMargin: 12
                spacing: 8
                Item {
                    Layout.fillWidth: true
                    Layout.preferredHeight: 34
                    clip: true

                    ListView {
                        id: sessionTabsList
                        anchors.fill: parent
                        orientation: ListView.Horizontal
                        spacing: 8
                        model: root.sessionTabs
                        interactive: contentWidth > width
                        boundsBehavior: Flickable.StopAtBounds

                        WheelHandler {
                            target: null
                            onWheel: function(event) {
                                if (!sessionTabsList.interactive) {
                                    return
                                }
                                const delta = event.angleDelta.y !== 0
                                    ? event.angleDelta.y
                                    : event.angleDelta.x
                                sessionTabsList.contentX = Math.max(
                                    0,
                                    Math.min(
                                        sessionTabsList.contentWidth - sessionTabsList.width,
                                        sessionTabsList.contentX - (delta / 2)
                                    )
                                )
                                event.accepted = true
                            }
                        }

                        delegate: Rectangle {
                            readonly property var tabData: modelData
                            readonly property int tabCount: Math.max(root.sessionTabs.length, 1)
                            readonly property real availablePerTab: (sessionTabsList.width - (sessionTabsList.spacing * Math.max(tabCount - 1, 0))) / tabCount
                            readonly property real minPreferred: tabText.implicitWidth + (closeButton.visible ? 46 : 20)
                            radius: 6
                            color: tabData.isActive ? "#3a3d41" : "#252526"
                            border.color: tabData.isActive ? "#569cd6" : "#3c3c3c"
                            border.width: 1
                            height: 34
                            width: Math.max(118, Math.min(260, Math.max(minPreferred, availablePerTab)))

                            MouseArea {
                                anchors.fill: parent
                                anchors.rightMargin: closeButton.visible ? (closeButton.width + 10) : 0
                                onClicked: {
                                    terminalApp.switchSession(tabData.sessionId)
                                    root.refreshSessionTabs()
                                }
                            }

                            Row {
                                anchors.fill: parent
                                anchors.leftMargin: 10
                                anchors.rightMargin: 6
                                spacing: 6

                                Text {
                                    id: tabText
                                    anchors.verticalCenter: parent.verticalCenter
                                    text: tabData.pendingCount > 0
                                        ? tabData.label + " (" + tabData.pendingCount + ")"
                                        : tabData.label
                                    color: "#d4d4d4"
                                    font.pixelSize: root.uiControlFontPx
                                    elide: Text.ElideRight
                                    width: closeButton.visible ? parent.width - closeButton.width - 26 : parent.width - 14
                                    horizontalAlignment: Text.AlignLeft
                                    verticalAlignment: Text.AlignVCenter
                                }

                                Button {
                                    id: closeButton
                                    visible: true
                                    enabled: tabData.canClose
                                    anchors.verticalCenter: parent.verticalCenter
                                    width: 24
                                    height: 24
                                    text: "✕"
                                    font.pixelSize: 13
                                    opacity: enabled ? 1.0 : 0.45
                                    background: Rectangle {
                                        radius: 5
                                        color: closeButton.enabled
                                            ? (closeButton.pressed ? "#9f3434" : "#4a4a4a")
                                            : "#4a4a4a"
                                        border.color: "#707070"
                                        border.width: 1
                                    }
                                    contentItem: Text {
                                        text: closeButton.text
                                        color: "#ffffff"
                                        font.pixelSize: closeButton.font.pixelSize
                                        font.bold: false
                                        horizontalAlignment: Text.AlignHCenter
                                        verticalAlignment: Text.AlignVCenter
                                    }
                                    onClicked: {
                                        terminalApp.closeSession(tabData.sessionId)
                                        root.refreshSessionTabs()
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        Rectangle { Layout.fillWidth: true; height: 1; color: "#3c3c3c" }

        // Main content: single terminal panel
        Rectangle {
            Layout.fillWidth: true
            Layout.fillHeight: true
            color: "#1e1e1e"

            Loader {
                anchors.fill: parent
                active: root.hasActiveTerminalSession

                sourceComponent: TerminalView {
                    anchors.fill: parent
                    terminalApp: terminalApp
                    suppressWebView: root.popupOverlayVisible
                    hasActiveSession: root.hasActiveTerminalSession
                }
            }

            Rectangle {
                anchors.fill: parent
                color: "#1e1e1e"
                visible: !root.hasActiveTerminalSession

                Text {
                    anchors.centerIn: parent
                    text: "No active terminal session. Create or select a tab to start a shell."
                    color: "#808080"
                    font.pixelSize: 13
                    horizontalAlignment: Text.AlignHCenter
                    wrapMode: Text.WordWrap
                    width: Math.min(parent.width * 0.8, 540)
                }
            }
        }
    }

    Dialog {
        id: geminiSettingsDialog
        modal: true
        anchors.centerIn: Overlay.overlay
        width: 480
        title: "Gemini Settings"
        standardButtons: Dialog.Close
        padding: 0
        z: 4000

        Overlay.modal: Rectangle {
            color: "#70000000"
        }

        background: Rectangle {
            color: "#1e1e1e"
            border.color: "#3c3c3c"
            border.width: 1
            radius: 8
        }

        ColumnLayout {
            anchors.fill: parent
            anchors.margins: 16
            spacing: 10

            RowLayout {
                Layout.fillWidth: true
                spacing: 8

                TextField {
                    id: geminiApiKeyField
                    Layout.fillWidth: true
                    placeholderText: "Gemini API key (stored locally)"
                    echoMode: TextInput.Password
                    font.pixelSize: root.uiInputFontPx
                }

                Button {
                    text: "Save"
                    font.pixelSize: root.uiControlFontPx
                    onClicked: {
                        if (terminalApp.setGeminiApiKey(geminiApiKeyField.text)) {
                            geminiApiKeyField.text = ""
                        }
                    }
                }

                Button {
                    text: "Remove"
                    font.pixelSize: root.uiControlFontPx
                    enabled: terminalApp.geminiKeyPresent
                    onClicked: terminalApp.clearGeminiApiKey()
                }
            }

            Text {
                text: terminalApp.geminiKeyPresent ? "\u2713 API key stored" : "No API key set"
                color: terminalApp.geminiKeyPresent ? "#4caf50" : "#808080"
                font.pixelSize: 12
            }

            RowLayout {
                Layout.fillWidth: true
                spacing: 8

                CheckBox {
                    text: "Inject stored key into next run"
                    font.pixelSize: root.uiControlFontPx
                    enabled: terminalApp.geminiKeyPresent
                    checked: terminalApp.geminiInjectionRequested
                    onClicked: terminalApp.geminiInjectionRequested = checked
                }

                Item { Layout.fillWidth: true }
            }

            RowLayout {
                Layout.fillWidth: true
                spacing: 8

                Button {
                    text: "Launch Gemini CLI"
                    font.pixelSize: root.uiControlFontPx
                    enabled: terminalApp.geminiKeyPresent
                    onClicked: {
                        terminalApp.launchGeminiInTab()
                        geminiSettingsDialog.close()
                    }
                }

                Button {
                    text: "Launch Gemini (Window)"
                    font.pixelSize: root.uiControlFontPx
                    enabled: terminalApp.geminiKeyPresent
                    onClicked: {
                        terminalApp.launchGeminiSession()
                        geminiSettingsDialog.close()
                    }
                }

                Button {
                    text: "Launch Copilot CLI"
                    font.pixelSize: root.uiControlFontPx
                    onClicked: {
                        terminalApp.runCommand("copilot")
                        geminiSettingsDialog.close()
                    }
                }

                Item { Layout.fillWidth: true }
            }
        }
    }

    Dialog {
        id: approvalDialog
        modal: true
        anchors.centerIn: Overlay.overlay
        width: Math.min(root.width * 0.8, 760)
        height: Math.min(root.height * 0.75, 460)
        closePolicy: Popup.NoAutoClose
        visible: false
        title: "Terminal Approval Required"
        padding: 0
        z: 4000

        Overlay.modal: Rectangle {
            color: "#70000000"
        }

        onVisibleChanged: {
            if (visible) {
                forceActiveFocus()
            }
        }

        background: Rectangle {
            color: "#1e1e1e"
            border.color: "#3c3c3c"
            border.width: 1
            radius: 8
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

            ScrollView {
                Layout.fillWidth: true
                Layout.fillHeight: true
                clip: true

                GridLayout {
                    width: approvalDialog.width - 48
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

                    Text { text: "Workspace Path"; color: "#808080"; font.pixelSize: 12 }
                    Text { text: approvalDialogRequest.workspacePath || ""; color: "#d4d4d4"; font.pixelSize: 12; wrapMode: Text.WrapAnywhere }

                    Text { text: "Working Directory"; color: "#808080"; font.pixelSize: 12 }
                    Text { text: approvalDialogRequest.workingDirectory || ""; color: "#d4d4d4"; font.pixelSize: 12; wrapMode: Text.WrapAnywhere }

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
            }

            RowLayout {
                Layout.alignment: Qt.AlignRight
                spacing: 8

                Button {
                    text: "Deny"
                    font.pixelSize: root.uiControlFontPx
                    onClicked: {
                        terminalApp.declineCommand(terminalApp.currentRequestId, "")
                        approvalDialog.close()
                    }
                }

                Button {
                    text: "Approve"
                    font.pixelSize: root.uiControlFontPx
                    onClicked: {
                        terminalApp.approveCommand(terminalApp.currentRequestId)
                        approvalDialog.close()
                    }
                }
            }
        }
    }

    Drawer {
        id: savedCommandsDrawer
        edge: Qt.RightEdge
        modal: true
        width: Math.max(320, root.width * 0.38)
        height: root.height
        onOpened: {
            savedCommandsWorkspaceField.text = root.savedCommandsWorkspaceOrDefault(terminalApp.savedCommandsWorkspaceId())
            terminalApp.openSavedCommands(savedCommandsWorkspaceField.text)
            root.refreshSavedCommands()
            Qt.callLater(function() {
                savedCommandsWorkspaceField.forceActiveFocus()
                savedCommandsWorkspaceField.selectAll()
            })
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
                font.pixelSize: root.uiInputFontPx
                text: terminalApp.savedCommandsWorkspaceId()
                onEditingFinished: {
                    const workspaceId = root.savedCommandsWorkspaceOrDefault(text)
                    terminalApp.openSavedCommands(workspaceId)
                    savedCommandsWorkspaceField.text = terminalApp.savedCommandsWorkspaceId()
                    root.refreshSavedCommands()
                }
            }

            RowLayout {
                Layout.fillWidth: true

                Button {
                    text: "Open"
                    font.pixelSize: root.uiControlFontPx
                    onClicked: {
                        const workspaceId = root.savedCommandsWorkspaceOrDefault(savedCommandsWorkspaceField.text)
                        terminalApp.openSavedCommands(workspaceId)
                        savedCommandsWorkspaceField.text = terminalApp.savedCommandsWorkspaceId()
                        root.refreshSavedCommands()
                    }
                }

                Item { Layout.fillWidth: true }
            }

            TextField {
                id: saveCommandNameField
                Layout.fillWidth: true
                placeholderText: "Command name"
                font.pixelSize: root.uiInputFontPx
            }

            TextField {
                id: saveCommandTextField
                Layout.fillWidth: true
                placeholderText: "Command text"
                font.pixelSize: root.uiInputFontPx
            }

            RowLayout {
                Layout.fillWidth: true

                Button {
                    text: "Save"
                    font.pixelSize: root.uiControlFontPx
                    onClicked: {
                        const workspaceId = root.savedCommandsWorkspaceOrDefault(savedCommandsWorkspaceField.text)
                        savedCommandsWorkspaceField.text = workspaceId
                        terminalApp.openSavedCommands(workspaceId)
                        if (terminalApp.saveSavedCommand(saveCommandNameField.text, saveCommandTextField.text)) {
                            saveCommandNameField.text = ""
                            saveCommandTextField.text = ""
                            root.refreshSavedCommands()
                        }
                    }
                }

                Button {
                    text: "Delete Selected"
                    font.pixelSize: root.uiControlFontPx
                    enabled: root.selectedSavedCommandId !== ""
                    onClicked: {
                        if (terminalApp.deleteSavedCommand(root.selectedSavedCommandId)) {
                            root.selectedSavedCommandId = ""
                            root.refreshSavedCommands()
                        }
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
                    font.pixelSize: root.uiControlFontPx
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
