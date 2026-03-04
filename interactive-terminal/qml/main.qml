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
    property var availableWorkspaces: []
    property var allowlistPatterns: []
    property string selectedSavedCommandId: ""
    property string pendingSessionDisplayName: ""
    property var approvalDialogRequest: ({})
    property string approvalSelectedProvider: ""
    property string approvalSelectedAutonomyMode: "guided"
    property bool quitRequested: false
    property bool popupOverlayVisible: geminiSettingsDialog.visible
        || approvalDialog.visible
        || savedCommandsDrawer.visible
        || allowlistDrawer.visible
    property bool hasActiveTerminalSession: (terminalApp.currentSessionId || "").trim().length > 0

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

    function refreshAllowlist() {
        terminalApp.refreshAllowlist()
        try {
            const parsed = JSON.parse(terminalApp.allowlistPatternsJson || "[]")
            allowlistPatterns = Array.isArray(parsed) ? parsed : []
        } catch (e) {
            allowlistPatterns = []
        }
    }

    function refreshAvailableWorkspaces() {
        try {
            const parsed = JSON.parse(terminalApp.availableWorkspacesJson || "[]")
            availableWorkspaces = Array.isArray(parsed) ? parsed : []
        } catch (e) {
            availableWorkspaces = []
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

    function normalizeProvider(value) {
        const normalized = (value || "").trim().toLowerCase()
        if (normalized === "gemini" || normalized === "gemini.cmd") {
            return "gemini"
        }
        if (normalized === "copilot" || normalized === "copilot.cmd") {
            return "copilot"
        }
        return ""
    }

    function normalizeAutonomyMode(value) {
        const normalized = (value || "").trim().toLowerCase()
        if (normalized === "autonomous") {
            return "autonomous"
        }
        return "guided"
    }

    function providerFromRequest(parsedContext, commandText) {
        const source = (parsedContext && parsedContext.source) || {}
        const fromSource = normalizeProvider(source.provider || source.cli_provider || "")
        if (fromSource.length > 0) {
            return fromSource
        }
        return normalizeProvider(commandText)
    }

    function providerPolicyApplies(parsedContext, commandText) {
        const source = (parsedContext && parsedContext.source) || {}
        const approval = (parsedContext && parsedContext.approval) || {}
        if (approval.provider_policy === "agent_cli_launch") {
            return true
        }

        const launchKind = (source.launch_kind || source.launch_type || source.intent || "")
            .toString()
            .trim()
            .toLowerCase()

        if (launchKind.indexOf("agent") >= 0
            || launchKind.indexOf("super_subagent") >= 0
            || launchKind.indexOf("provider") >= 0) {
            return true
        }

        return normalizeProvider(commandText).length > 0
    }

    function canSubmitApproval() {
        if (!approvalDialog.visible) {
            return false
        }

        if (!approvalDialogRequest.providerSelectionRequired) {
            return true
        }

        return (approvalSelectedProvider || "").trim().length > 0
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
            approvalSelectedAutonomyMode = "guided"
            return
        }

        const parsedContext = parseContextInfo(terminalApp.contextInfo || "")
        const correlation = parsedContext.correlation || {}
        const source = parsedContext.source || {}

        if (terminalApp.currentAllowlisted) {
            approvalDialog.close()
            approvalDialogRequest = ({})
            approvalSelectedAutonomyMode = "guided"
            return
        }

        const requestId = correlation.request_id || terminalApp.currentRequestId
        const commandText = source.command || terminalApp.commandText
        const providerApplies = providerPolicyApplies(parsedContext, commandText)
        const requestedAutonomyMode = normalizeAutonomyMode(source.mode || (parsedContext.approval || {}).selected_autonomy_mode || "")
        const preferredProvider = normalizeProvider(terminalApp.preferredCliProvider || "")
        const requestedProvider = providerFromRequest(parsedContext, commandText)
        let prefillPolicy = ({
            prefilled_provider: "",
            provider_prefill_source: "none",
            provider_selection_required: providerApplies,
            provider_chooser_visible: providerApplies
        })

        try {
            const resolved = JSON.parse(terminalApp.approvalProviderPrefillPolicy(
                providerApplies,
                terminalApp.preferredCliProvider || ""
            ) || "{}")
            if (resolved && typeof resolved === "object") {
                prefillPolicy = Object.assign(prefillPolicy, resolved)
            }
        } catch (e) {
            // no-op: keep fallback policy when bridge response is unavailable
        }

        const providerSelectionRequired = !!prefillPolicy.provider_selection_required
        const prefilledProvider = normalizeProvider(prefillPolicy.prefilled_provider || "")
        const providerPrefillSource = (prefillPolicy.provider_prefill_source || "none").toString()
        const providerChooserVisible = !!prefillPolicy.provider_chooser_visible

        approvalSelectedProvider = prefilledProvider
        approvalSelectedAutonomyMode = requestedAutonomyMode

        approvalDialogRequest = {
            command: commandText,
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
            providerPolicyApplies: providerApplies,
            preferredProvider: preferredProvider,
            requestedProvider: requestedProvider,
            prefilledProvider: prefilledProvider,
            providerPrefillSource: providerPrefillSource,
            providerSelectionRequired: providerSelectionRequired,
            providerChooserVisible: providerChooserVisible,
            autonomySelectorVisible: providerApplies && terminalApp.autonomyModeSelectorVisible,
            selectedAutonomyMode: requestedAutonomyMode,
            contextPack: parsedContext.context_pack || null,
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
        onAvailableWorkspacesJsonChanged: root.refreshAvailableWorkspaces()
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
                workspacePathField.editText = terminalApp.currentWorkspacePath
            }
        }

        function onCurrentVenvPathChanged() {
            if (venvPathField && !venvPathField.activeFocus) {
                venvPathField.editText = terminalApp.currentVenvPath
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

        function onAgentSessionLaunched(sessionId, label, provider) {
            root.syncSessionDisplayName()
            root.refreshSessionTabs()
        }

        function onAllowlistPatternsJsonChanged() {
            try {
                const parsed = JSON.parse(terminalApp.allowlistPatternsJson || "[]")
                root.allowlistPatterns = Array.isArray(parsed) ? parsed : []
            } catch (e) {
                root.allowlistPatterns = []
            }
        }
    }

    Component.onCompleted: {
        refreshSessionTabs()
        refreshSavedCommands()
        refreshAllowlist()
        refreshAvailableWorkspaces()
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

                // PTY mode badge — compile-time indicator (pty-host vs in-process)
                Rectangle {
                    visible: (terminalApp.terminalModeLabel || "").length > 0
                    height: 18
                    implicitWidth: modeLabelText.implicitWidth + 12
                    radius: 3
                    color: (terminalApp.terminalModeLabel || "") === "pty-host" ? "#0e3a5e" : "#2d2d2d"
                    border.color: (terminalApp.terminalModeLabel || "") === "pty-host" ? "#1e88e5" : "#555555"
                    border.width: 1
                    Text {
                        id: modeLabelText
                        anchors.centerIn: parent
                        text: "PTY: " + (terminalApp.terminalModeLabel || "")
                        color: (terminalApp.terminalModeLabel || "") === "pty-host" ? "#64b5f6" : "#808080"
                        font.pixelSize: 11
                    }
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

                    Item { Layout.fillWidth: true }
                }

                RowLayout {
                    Layout.fillWidth: true
                    spacing: 8

                    ComboBox {
                        id: workspacePathField
                        editable: true
                        model: root.availableWorkspaces
                        Layout.preferredWidth: 240
                        Layout.preferredHeight: 28
                        font.pixelSize: root.uiInputFontPx
                        enabled: root.hasActiveTerminalSession
                        editText: terminalApp.currentWorkspacePath
                        onAccepted: terminalApp.setSessionWorkspacePath(editText)
                        onActivated: terminalApp.setSessionWorkspacePath(currentText)
                        Component.onCompleted: {
                            popup.popupType = Popup.Window
                            popup.z = 3000
                        }
                    }

                    ComboBox {
                        id: venvPathField
                        editable: true
                        model: root.availableWorkspaces
                        Layout.preferredWidth: 220
                        Layout.preferredHeight: 28
                        font.pixelSize: root.uiInputFontPx
                        enabled: root.hasActiveTerminalSession
                        editText: terminalApp.currentVenvPath
                        onAccepted: terminalApp.setSessionVenvPath(editText)
                        onActivated: terminalApp.setSessionVenvPath(currentText)
                        Component.onCompleted: {
                            popup.popupType = Popup.Window
                            popup.z = 3000
                        }
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

                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: 8

                    RowLayout {
                        Layout.fillWidth: true
                        spacing: 8

                        Button {
                            text: "Launch Gemini CLI"
                            font.pixelSize: root.uiControlFontPx
                            enabled: true
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
                            text: terminalApp.geminiKeyPresent ? "Key: stored" : "Key: free tier"
                            color: terminalApp.geminiKeyPresent ? "#4caf50" : "#ff9800"
                            font.pixelSize: 11
                        }

                        Item { Layout.fillWidth: true }

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

                        Button {
                            text: "Allowlist"
                            font.pixelSize: root.uiControlFontPx
                            Layout.preferredWidth: 88
                            Layout.preferredHeight: 30
                            onClicked: {
                                if (allowlistDrawer.visible) {
                                    allowlistDrawer.close()
                                } else {
                                    root.refreshAllowlist()
                                    allowlistDrawer.open()
                                }
                            }
                        }
                    }

                    RowLayout {
                        Layout.fillWidth: true
                        spacing: 8

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
                            Layout.preferredWidth: 100
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
                            Layout.preferredWidth: 115
                            Layout.preferredHeight: 30
                            font.pixelSize: root.uiControlFontPx
                            enabled: root.hasActiveTerminalSession
                            onClicked: terminalApp.copyLastCommandOutput()
                        }

                        Item { Layout.fillWidth: true }
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
                            readonly property real minPreferred: tabText.implicitWidth + 46
                            radius: 6
                            color: tabData.isGemini
                                ? (tabData.isActive ? "#2a1b3d" : "#1c1526")
                                : (tabData.isActive ? "#3a3d41" : "#252526")
                            border.color: tabData.isGemini
                                ? (tabData.isActive ? "#9c27b0" : "#6a1b9a")
                                : (tabData.isActive ? "#569cd6" : "#3c3c3c")
                            border.width: 1
                            height: 34
                            width: Math.max(118, Math.min(260, Math.max(minPreferred, availablePerTab)))

                            MouseArea {
                                anchors.fill: parent
                                anchors.rightMargin: closeArea.width + 10
                                onClicked: {
                                    terminalApp.switchSession(tabData.sessionId)
                                    root.refreshSessionTabs()
                                }
                            }

                            Text {
                                id: tabText
                                anchors.left: parent.left
                                anchors.leftMargin: tabData.isGemini ? 8 : 10
                                anchors.verticalCenter: parent.verticalCenter
                                anchors.right: closeRect.left
                                anchors.rightMargin: 4
                                text: {
                                    const base = tabData.isGemini ? "✦ " + tabData.label : tabData.label
                                    return tabData.pendingCount > 0 ? base + " (" + tabData.pendingCount + ")" : base
                                }
                                color: tabData.isGemini
                                    ? (tabData.isActive ? "#ce93d8" : "#ab47bc")
                                    : "#d4d4d4"
                                font.pixelSize: root.uiControlFontPx
                                elide: Text.ElideRight
                                horizontalAlignment: Text.AlignLeft
                                verticalAlignment: Text.AlignVCenter
                            }

                            Rectangle {
                                id: closeRect
                                anchors.right: parent.right
                                anchors.rightMargin: 5
                                anchors.verticalCenter: parent.verticalCenter
                                width: 20
                                height: 20
                                radius: 4
                                opacity: tabData.canClose ? 1.0 : 0.3
                                color: closeArea.pressed
                                    ? "#9f3434"
                                    : (closeArea.containsMouse ? "#5a3a3a" : "#3a3a3a")
                                border.color: "#606060"
                                border.width: 1

                                Text {
                                    anchors.centerIn: parent
                                    text: "\u00D7"
                                    color: "#e0e0e0"
                                    font.pixelSize: 13
                                    font.bold: true
                                    horizontalAlignment: Text.AlignHCenter
                                    verticalAlignment: Text.AlignVCenter
                                }

                                MouseArea {
                                    id: closeArea
                                    anchors.fill: parent
                                    enabled: tabData.canClose
                                    hoverEnabled: true
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

        Rectangle {
            Layout.fillWidth: true
            Layout.preferredHeight: 36
            color: "#252526"

            RowLayout {
                anchors.fill: parent
                anchors.leftMargin: 12
                anchors.rightMargin: 12
                spacing: 8

                Text {
                    text: "Terminal Profile"
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
                        popup.popupType = Popup.Window
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
                        popup.popupType = Popup.Window
                        popup.z = 3000
                    }
                }

                Item { Layout.fillWidth: true }
            }
        }

        // Main content: single terminal panel
        Rectangle {
            Layout.fillWidth: true
            Layout.fillHeight: true
            color: "#1e1e1e"

            TerminalView {
                anchors.fill: parent
                terminalApp: terminalApp
                hasActiveSession: root.hasActiveTerminalSession
            }
        }
    }

    Dialog {
        id: geminiSettingsDialog
        popupType: Popup.Window
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
        popupType: Popup.Window
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
                visible: (approvalDialogRequest.sessionId || "").trim().length > 0
                Layout.fillWidth: false
                Layout.preferredHeight: 24
                radius: 12
                color: "#1f4f7a"
                border.color: "#569cd6"
                border.width: 1

                Row {
                    anchors.fill: parent
                    anchors.leftMargin: 10
                    anchors.rightMargin: 10
                    spacing: 6

                    Text {
                        anchors.verticalCenter: parent.verticalCenter
                        text: "From MCP agent"
                        color: "#d4d4d4"
                        font.pixelSize: 11
                        font.bold: true
                    }

                    Text {
                        anchors.verticalCenter: parent.verticalCenter
                        text: approvalDialogRequest.sessionId || ""
                        color: "#9cdcfe"
                        font.pixelSize: 11
                    }
                }
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

                    Text {
                        visible: approvalDialogRequest.providerPolicyApplies
                        text: "CLI Provider"
                        color: "#808080"
                        font.pixelSize: 12
                    }
                    Text {
                        visible: approvalDialogRequest.providerPolicyApplies
                        text: approvalDialogRequest.prefilledProvider || "(manual selection required)"
                        color: "#d4d4d4"
                        font.pixelSize: 12
                        wrapMode: Text.WrapAnywhere
                    }

                    Text {
                        visible: approvalDialogRequest.providerPolicyApplies
                        text: "Provider Source"
                        color: "#808080"
                        font.pixelSize: 12
                    }
                    Text {
                        visible: approvalDialogRequest.providerPolicyApplies
                        text: approvalDialogRequest.providerPrefillSource || "none"
                        color: "#d4d4d4"
                        font.pixelSize: 12
                        wrapMode: Text.WrapAnywhere
                    }

                    Text {
                        visible: approvalDialogRequest.providerPolicyApplies
                        text: "Provider Chooser"
                        color: "#808080"
                        font.pixelSize: 12
                    }
                    Text {
                        visible: approvalDialogRequest.providerPolicyApplies
                        text: approvalDialogRequest.providerChooserVisible ? "visible" : "hidden"
                        color: "#d4d4d4"
                        font.pixelSize: 12
                        wrapMode: Text.WrapAnywhere
                    }

                    Text {
                        visible: approvalDialogRequest.providerPolicyApplies
                        text: "Autonomy Selector"
                        color: "#808080"
                        font.pixelSize: 12
                    }
                    Text {
                        visible: approvalDialogRequest.providerPolicyApplies
                        text: approvalDialogRequest.autonomySelectorVisible ? "visible" : "hidden"
                        color: "#d4d4d4"
                        font.pixelSize: 12
                        wrapMode: Text.WrapAnywhere
                    }

                    // ── Context-Pack rows (step 9) ──────────────────────────
                    Text {
                        visible: !!(approvalDialogRequest.contextPack
                            && approvalDialogRequest.contextPack.requesting_agent)
                        text: "Requesting Agent"
                        color: "#808080"
                        font.pixelSize: 12
                    }
                    Text {
                        visible: !!(approvalDialogRequest.contextPack
                            && approvalDialogRequest.contextPack.requesting_agent)
                        text: (approvalDialogRequest.contextPack
                            && approvalDialogRequest.contextPack.requesting_agent) || ""
                        color: "#4ec9b0"
                        font.pixelSize: 12
                        wrapMode: Text.WrapAnywhere
                    }

                    Text {
                        visible: !!(approvalDialogRequest.contextPack
                            && approvalDialogRequest.contextPack.step_notes)
                        text: "Step Notes"
                        color: "#808080"
                        font.pixelSize: 12
                    }
                    Text {
                        visible: !!(approvalDialogRequest.contextPack
                            && approvalDialogRequest.contextPack.step_notes)
                        text: (approvalDialogRequest.contextPack
                            && approvalDialogRequest.contextPack.step_notes) || ""
                        color: "#d4d4d4"
                        font.pixelSize: 12
                        wrapMode: Text.WordWrap
                        maximumLineCount: 4
                        elide: Text.ElideRight
                    }

                    Text {
                        visible: !!(approvalDialogRequest.contextPack
                            && approvalDialogRequest.contextPack.relevant_files
                            && approvalDialogRequest.contextPack.relevant_files.length > 0)
                        text: "Context Files"
                        color: "#808080"
                        font.pixelSize: 12
                    }
                    Text {
                        visible: !!(approvalDialogRequest.contextPack
                            && approvalDialogRequest.contextPack.relevant_files
                            && approvalDialogRequest.contextPack.relevant_files.length > 0)
                        text: {
                            const files = (approvalDialogRequest.contextPack
                                && approvalDialogRequest.contextPack.relevant_files) || []
                            const names = files.slice(0, 3).map(function(f) { return f.path })
                            return files.length + " file(s): " + names.join(", ")
                                + (files.length > 3 ? " …" : "")
                        }
                        color: "#d4d4d4"
                        font.pixelSize: 12
                        wrapMode: Text.WrapAnywhere
                    }

                    Text {
                        visible: !!(approvalDialogRequest.contextPack
                            && approvalDialogRequest.contextPack.custom_instructions)
                        text: "Custom Instructions"
                        color: "#808080"
                        font.pixelSize: 12
                    }
                    Text {
                        visible: !!(approvalDialogRequest.contextPack
                            && approvalDialogRequest.contextPack.custom_instructions)
                        text: "\u2713 provided"
                        color: "#4ec9b0"
                        font.pixelSize: 12
                    }
                }
            }

            Text {
                visible: approvalDialogRequest.providerSelectionRequired
                text: "Provider selection is required before approval."
                color: "#f48771"
                font.pixelSize: 12
            }

            RowLayout {
                visible: approvalDialogRequest.providerChooserVisible
                spacing: 8

                Label {
                    text: "Provider"
                    color: "#c8c8c8"
                    font.pixelSize: 12
                }

                ComboBox {
                    id: approvalProviderChooser
                    Layout.preferredWidth: 220
                    font.pixelSize: root.uiControlFontPx
                    model: approvalDialogRequest.providerSelectionRequired
                        ? [
                            "Select provider…",
                            "Gemini",
                            "Copilot"
                        ]
                        : [
                            "Gemini",
                            "Copilot"
                        ]
                    currentIndex: {
                        const selected = (approvalSelectedProvider || "").toLowerCase()
                        if (selected === "gemini") {
                            return approvalDialogRequest.providerSelectionRequired ? 1 : 0
                        }
                        if (selected === "copilot") {
                            return approvalDialogRequest.providerSelectionRequired ? 2 : 1
                        }
                        return 0
                    }
                    onActivated: {
                        const choice = (model[currentIndex] || "").toString().toLowerCase()
                        if (choice === "gemini") {
                            approvalSelectedProvider = "gemini"
                        } else if (choice === "copilot") {
                            approvalSelectedProvider = "copilot"
                        } else {
                            approvalSelectedProvider = ""
                        }
                    }
                }
            }

            RowLayout {
                visible: approvalDialogRequest.autonomySelectorVisible
                spacing: 8

                Label {
                    text: "Autonomy"
                    color: "#c8c8c8"
                    font.pixelSize: 12
                }

                ComboBox {
                    id: approvalAutonomyChooser
                    Layout.preferredWidth: 220
                    font.pixelSize: root.uiControlFontPx
                    model: ["Guided", "Autonomous"]
                    currentIndex: (approvalSelectedAutonomyMode || "guided") === "autonomous" ? 1 : 0
                    onActivated: {
                        const choice = (model[currentIndex] || "").toString().toLowerCase()
                        approvalSelectedAutonomyMode = (choice === "autonomous") ? "autonomous" : "guided"
                    }
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
                    enabled: root.canSubmitApproval()
                    onClicked: {
                        terminalApp.approveCommand(terminalApp.currentRequestId, approvalSelectedAutonomyMode)
                        approvalDialog.close()
                    }
                }
            }
        }
    }

    Popup {
        id: savedCommandsDrawer
        popupType: Popup.Window
        modal: true
        width: Math.max(320, root.width * 0.38)
        height: root.height
        x: root.width - width
        y: 0
        padding: 0
        closePolicy: Popup.CloseOnEscape | Popup.CloseOnPressOutside

        Overlay.modal: Rectangle {
            color: "#70000000"
        }

        background: Rectangle {
            color: "#252526"
            border.color: "#3c3c3c"
            border.width: 1
        }

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

                    Row {
                        anchors.fill: parent
                        anchors.leftMargin: 8
                        anchors.rightMargin: 8
                        anchors.topMargin: 6
                        spacing: 2

                        Column {
                            width: parent.width - addToAllowlistBtn.width - 8
                            spacing: 2

                            Text {
                                text: entry.name
                                color: "#d4d4d4"
                                font.pixelSize: 12
                                elide: Text.ElideRight
                                width: parent.width
                            }

                            Text {
                                text: entry.command
                                color: "#9da0a6"
                                font.pixelSize: 11
                                elide: Text.ElideRight
                                width: parent.width
                            }
                        }

                        Button {
                            id: addToAllowlistBtn
                            text: "\u2192 Allowlist"
                            font.pixelSize: 9
                            implicitWidth: 76
                            implicitHeight: 22
                            anchors.verticalCenter: undefined
                            y: 8
                            onClicked: {
                                terminalApp.deriveAllowlistPattern(entry.command)
                            }
                        }
                    }

                    MouseArea {
                        anchors.fill: parent
                        anchors.rightMargin: addToAllowlistBtn.width + 10
                        onClicked: root.selectedSavedCommandId = entry.id
                    }
                }
            }

            // ── Allowlist proposal confirmation banner (step 23 + 24) ───────
            Rectangle {
                visible: (terminalApp.proposedAllowlistPattern || "").length > 0
                Layout.fillWidth: true
                implicitHeight: proposalCol.implicitHeight + 16
                color: "#1a2a1a"
                border.color: "#4caf50"
                border.width: 1
                radius: 4

                ColumnLayout {
                    id: proposalCol
                    anchors.fill: parent
                    anchors.margins: 8
                    spacing: 6

                    Text {
                        text: "Add pattern to allowlist?"
                        color: "#d4d4d4"
                        font.pixelSize: 12
                        font.bold: true
                    }

                    Text {
                        text: "From: " + (terminalApp.proposedFromCommand || "")
                        color: "#808080"
                        font.pixelSize: 10
                        elide: Text.ElideRight
                        Layout.fillWidth: true
                    }

                    // Option A: Exact (low risk)
                    Rectangle {
                        Layout.fillWidth: true
                        height: 34
                        radius: 3
                        color: (terminalApp.proposedAllowlistPattern === terminalApp.proposedExactPattern)
                            ? "#1a3a1a" : "#252526"
                        border.color: (terminalApp.proposedAllowlistPattern === terminalApp.proposedExactPattern)
                            ? "#4caf50" : "#3c3c3c"
                        border.width: 1

                        MouseArea {
                            anchors.fill: parent
                            onClicked: terminalApp.selectExactProposedPattern()
                        }

                        Row {
                            anchors.fill: parent
                            anchors.leftMargin: 8
                            anchors.rightMargin: 8
                            spacing: 6

                            Text {
                                anchors.verticalCenter: parent.verticalCenter
                                text: "Exact:"
                                color: "#808080"
                                font.pixelSize: 10
                            }

                            Text {
                                anchors.verticalCenter: parent.verticalCenter
                                text: terminalApp.proposedExactPattern || ""
                                color: "#9cdcfe"
                                font.pixelSize: 11
                                elide: Text.ElideRight
                                width: parent.width - 110
                            }

                            Rectangle {
                                anchors.verticalCenter: parent.verticalCenter
                                radius: 3
                                color: "#1a3a1a"
                                width: lowRiskLabel.implicitWidth + 8
                                height: 16

                                Text {
                                    id: lowRiskLabel
                                    anchors.centerIn: parent
                                    text: "low risk"
                                    color: "#4caf50"
                                    font.pixelSize: 9
                                }
                            }
                        }
                    }

                    // Option B: Generalized (medium/high risk) — only show when different
                    Rectangle {
                        Layout.fillWidth: true
                        height: 34
                        radius: 3
                        visible: (terminalApp.proposedGeneralPattern || "") !== (terminalApp.proposedExactPattern || "")
                        color: (terminalApp.proposedAllowlistPattern === terminalApp.proposedGeneralPattern)
                            ? "#2a1a00" : "#252526"
                        border.color: (terminalApp.proposedAllowlistPattern === terminalApp.proposedGeneralPattern)
                            ? "#ff9800" : "#3c3c3c"
                        border.width: 1

                        MouseArea {
                            anchors.fill: parent
                            onClicked: terminalApp.selectGeneralProposedPattern()
                        }

                        Row {
                            anchors.fill: parent
                            anchors.leftMargin: 8
                            anchors.rightMargin: 8
                            spacing: 6

                            Text {
                                anchors.verticalCenter: parent.verticalCenter
                                text: "Wide:"
                                color: "#808080"
                                font.pixelSize: 10
                            }

                            Text {
                                anchors.verticalCenter: parent.verticalCenter
                                text: terminalApp.proposedGeneralPattern || ""
                                color: "#ce9178"
                                font.pixelSize: 11
                                elide: Text.ElideRight
                                width: parent.width - 110
                            }

                            Rectangle {
                                anchors.verticalCenter: parent.verticalCenter
                                radius: 3
                                color: "#2a1a00"
                                width: riskHintLabel.implicitWidth + 8
                                height: 16

                                Text {
                                    id: riskHintLabel
                                    anchors.centerIn: parent
                                    text: (terminalApp.proposedRiskHint || "medium") + " risk"
                                    color: (terminalApp.proposedRiskHint || "") === "high" ? "#f44336" : "#ff9800"
                                    font.pixelSize: 9
                                }
                            }
                        }
                    }

                    RowLayout {
                        Layout.fillWidth: true
                        spacing: 8

                        Button {
                            text: "Confirm"
                            font.pixelSize: root.uiControlFontPx
                            onClicked: {
                                terminalApp.confirmAddProposedPattern()
                                root.refreshAllowlist()
                            }
                        }

                        Button {
                            text: "Cancel"
                            font.pixelSize: root.uiControlFontPx
                            onClicked: terminalApp.cancelProposedPattern()
                        }

                        Item { Layout.fillWidth: true }
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

    // ── Allowlist Drawer (Phase 4.5, steps 21–22) ─────────────────────────
    Popup {
        id: allowlistDrawer
        popupType: Popup.Window
        modal: true
        width: Math.max(320, root.width * 0.40)
        height: root.height
        x: root.width - width
        y: 0
        padding: 0
        closePolicy: Popup.CloseOnEscape | Popup.CloseOnPressOutside

        Overlay.modal: Rectangle {
            color: "#70000000"
        }

        background: Rectangle {
            color: "#252526"
            border.color: "#3c3c3c"
            border.width: 1
        }

        onOpened: {
            root.refreshAllowlist()
            Qt.callLater(function() { allowlistFilter.forceActiveFocus() })
        }

        ColumnLayout {
            anchors.fill: parent
            anchors.margins: 12
            spacing: 8

            Text {
                text: "Allowlist Patterns"
                color: "#d4d4d4"
                font.pixelSize: 16
                font.bold: true
            }

            Text {
                text: (root.allowlistPatterns.length) + " pattern(s) loaded"
                color: "#808080"
                font.pixelSize: 11
            }

            RowLayout {
                Layout.fillWidth: true
                spacing: 8

                TextField {
                    id: allowlistFilter
                    Layout.fillWidth: true
                    placeholderText: "Search patterns…"
                    font.pixelSize: root.uiInputFontPx
                    onTextChanged: terminalApp.allowlistFilter = text
                }

                Button {
                    text: "\u21bb Refresh"
                    font.pixelSize: root.uiControlFontPx
                    implicitWidth: 74
                    implicitHeight: 30
                    onClicked: root.refreshAllowlist()
                }
            }

            // Step 22 — new-pattern input row
            RowLayout {
                Layout.fillWidth: true
                spacing: 8

                TextField {
                    id: newPatternField
                    Layout.fillWidth: true
                    placeholderText: "New pattern…"
                    font.pixelSize: root.uiInputFontPx
                    onAccepted: {
                        if (text.trim().length > 0) {
                            terminalApp.addAllowlistPattern(text.trim())
                            text = ""
                        }
                    }
                }

                Button {
                    text: "Add"
                    font.pixelSize: root.uiControlFontPx
                    implicitWidth: 50
                    implicitHeight: 30
                    enabled: (newPatternField.text || "").trim().length > 0
                    onClicked: {
                        if (newPatternField.text.trim().length > 0) {
                            terminalApp.addAllowlistPattern(newPatternField.text.trim())
                            newPatternField.text = ""
                        }
                    }
                }
            }

            // Pattern list — filtered by allowlistFilter
            ListView {
                Layout.fillWidth: true
                Layout.fillHeight: true
                clip: true

                property var filteredPatterns: {
                    const filter = (terminalApp.allowlistFilter || "").toLowerCase().trim()
                    if (!filter) return root.allowlistPatterns
                    return root.allowlistPatterns.filter(function(p) {
                        return p.toLowerCase().indexOf(filter) >= 0
                    })
                }

                model: filteredPatterns

                delegate: Rectangle {
                    width: ListView.view.width
                    height: 34
                    radius: 3
                    color: removePatternArea.containsMouse ? "#35352a" : "#2d2d30"
                    border.color: "#3c3c3c"
                    border.width: 1

                    RowLayout {
                        anchors.fill: parent
                        anchors.leftMargin: 8
                        anchors.rightMargin: 4
                        spacing: 4

                        Text {
                            Layout.fillWidth: true
                            text: modelData
                            color: "#d4d4d4"
                            font.pixelSize: 12
                            font.family: "Consolas,Courier New,monospace"
                            elide: Text.ElideRight
                            verticalAlignment: Text.AlignVCenter
                        }

                        Rectangle {
                            width: 22
                            height: 22
                            radius: 4
                            color: removePatternArea.pressed ? "#9f3434"
                                : (removePatternArea.containsMouse ? "#5a3a3a" : "#3a3a3a")
                            border.color: "#606060"
                            border.width: 1

                            Text {
                                anchors.centerIn: parent
                                text: "\u00D7"
                                color: "#e0e0e0"
                                font.pixelSize: 13
                                font.bold: true
                            }

                            MouseArea {
                                id: removePatternArea
                                anchors.fill: parent
                                hoverEnabled: true
                                onClicked: terminalApp.removeAllowlistPattern(modelData)
                            }
                        }
                    }
                }
            }

            // Step 22 — status label with auto-clear timer
            Rectangle {
                visible: (terminalApp.allowlistLastOp || "").length > 0
                    || (terminalApp.allowlistLastError || "").length > 0
                Layout.fillWidth: true
                height: 30
                radius: 4
                color: (terminalApp.allowlistLastOp === "error"
                    || terminalApp.allowlistLastOp === "duplicate"
                    || terminalApp.allowlistLastOp === "not_found")
                    ? "#3a1a1a" : "#1a3a1a"
                border.color: (terminalApp.allowlistLastOp === "error"
                    || terminalApp.allowlistLastOp === "duplicate"
                    || terminalApp.allowlistLastOp === "not_found")
                    ? "#f44336" : "#4caf50"
                border.width: 1

                Text {
                    anchors.centerIn: parent
                    text: {
                        var err = terminalApp.allowlistLastError || ""
                        if (err.length > 0) return err
                        var op = terminalApp.allowlistLastOp || ""
                        if (op === "added") return "\u2713 Pattern added"
                        if (op === "removed") return "\u2713 Pattern removed"
                        return op
                    }
                    color: (terminalApp.allowlistLastOp === "error"
                        || terminalApp.allowlistLastOp === "duplicate"
                        || terminalApp.allowlistLastOp === "not_found")
                        ? "#f44336" : "#4caf50"
                    font.pixelSize: 12
                }

                Timer {
                    id: allowlistStatusClearTimer
                    interval: 3000
                    repeat: false
                    onTriggered: {
                        terminalApp.allowlistLastOp = ""
                        terminalApp.allowlistLastError = ""
                    }
                }

                Connections {
                    target: terminalApp
                    function onAllowlistLastOpChanged() {
                        if ((terminalApp.allowlistLastOp || "").length > 0) {
                            allowlistStatusClearTimer.restart()
                        }
                    }
                }
            }

            RowLayout {
                Layout.fillWidth: true

                Button {
                    text: "Close"
                    font.pixelSize: root.uiControlFontPx
                    onClicked: allowlistDrawer.close()
                }

                Item { Layout.fillWidth: true }
            }
        }
    }
}
