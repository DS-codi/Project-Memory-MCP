pragma ComponentBehavior: Bound

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
    color: "#090d14"
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
    property string approvalSessionMode: "new"
    property string approvalResumeSessionId: ""
    property string approvalOutputFormat: "text"
    // ── Risk-aware approval policy (Steps 29–31) ─────────────────────────────
    // Risk tier computed reactively from autonomy mode + budget selections.
    // Tier 1 = Low (guided), Tier 2 = Medium (autonomous, capped), Tier 3 = High (autonomous, uncapped).
    property int approvalRiskTier: root.approvalSelectedAutonomyMode === "autonomous"
        ? (root.approvalBudgetMaxCommands > 0 || root.approvalBudgetMaxDurationSecs > 0 || root.approvalBudgetMaxFiles > 0 ? 2 : 3)
        : 1
    property bool approvalTrustedScopeConfirmed: false
    property int approvalBudgetMaxCommands: 0
    property int approvalBudgetMaxDurationSecs: 0
    property int approvalBudgetMaxFiles: 0
    // ── CLI load-reduction flags (Phase 3) ────────────────────────────────────
    // Unchecked by default (opt-in): keep provider launches in full visual mode
    // unless the approver explicitly enables an accessibility flag.
    property bool approvalGeminiScreenReader: false
    property bool approvalCopilotMinimalUi: false
    property bool quitRequested: false
    property bool popupOverlayVisible: providerSettingsDialog.visible
        || approvalDialog.visible
        || savedCommandsDrawer.visible
        || allowlistDrawer.visible
        || crashAlertDialog.visible
    property string crashAlertMessage: ""
    property string crashAlertLogPath: ""
    property bool hasActiveTerminalSession: (terminalApp.currentSessionId || "").trim().length > 0
    // Selected provider for the Launch CLI split button ("gemini" or "copilot")
    property string selectedCliProvider: "gemini"

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

    function workspaceLabelFromPath(pathText) {
        const raw = (pathText || "").toString().trim()
        if (!raw.length) {
            return ""
        }

        const trimmed = raw.replace(/[\\/]+$/, "")
        if (!trimmed.length) {
            return raw
        }

        const parts = trimmed.split(/[\\/]/).filter(function(part) { return part.length > 0 })
        if (!parts.length) {
            return trimmed
        }

        return parts[parts.length - 1]
    }

    function normalizeWorkspaceSuggestion(entry) {
        if (typeof entry === "string") {
            const path = entry.trim()
            if (!path.length) {
                return null
            }
            return {
                label: workspaceLabelFromPath(path),
                path: path,
                subtitle: path
            }
        }

        if (!entry || typeof entry !== "object") {
            return null
        }

        const candidatePath = (entry.path || entry.workspacePath || entry.subtitle || "").toString().trim()
        const candidateLabel = (entry.label || entry.name || "").toString().trim()
        const path = candidatePath.length ? candidatePath : candidateLabel
        if (!path.length) {
            return null
        }

        return {
            label: candidateLabel.length ? candidateLabel : workspaceLabelFromPath(path),
            path: path,
            subtitle: path
        }
    }

    function workspaceSuggestionAt(index) {
        if (index < 0 || index >= availableWorkspaces.length) {
            return { label: "", path: "", subtitle: "" }
        }

        const normalized = normalizeWorkspaceSuggestion(availableWorkspaces[index])
        return normalized || { label: "", path: "", subtitle: "" }
    }

    function refreshAvailableWorkspaces() {
        try {
            const parsed = JSON.parse(terminalApp.availableWorkspacesJson || "[]")
            if (!Array.isArray(parsed)) {
                availableWorkspaces = []
                return
            }

            const deduped = []
            const seen = {}
            for (let i = 0; i < parsed.length; i++) {
                const normalized = normalizeWorkspaceSuggestion(parsed[i])
                if (!normalized || !normalized.path.length) {
                    continue
                }

                const key = normalized.path.toLowerCase()
                if (seen[key]) {
                    continue
                }

                seen[key] = true
                deduped.push(normalized)
            }

            availableWorkspaces = deduped
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

        if (root.approvalDialogRequest.providerSelectionRequired) {
            if (!(root.approvalSelectedProvider || "").trim().length) {
                return false
            }
        }

        // Resume requires a non-empty session ID
        if (root.approvalSessionMode === "resume" && !(root.approvalResumeSessionId || "").trim().length) {
            return false
        }

        // Trusted-scope confirmation required for risk tier >= 2 (Step 30)
        if (root.approvalRiskTier >= 2 && !root.approvalTrustedScopeConfirmed) {
            return false
        }

        return true
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
            root.approvalDialogRequest = ({})
            root.approvalSelectedAutonomyMode = "guided"
            root.approvalSessionMode = "new"
            root.approvalResumeSessionId = ""
            root.approvalOutputFormat = "text"
            root.approvalTrustedScopeConfirmed = false
            root.approvalBudgetMaxCommands = 0
            root.approvalBudgetMaxDurationSecs = 0
            root.approvalBudgetMaxFiles = 0
            root.approvalGeminiScreenReader = false
            root.approvalCopilotMinimalUi = false
            return
        }

        const parsedContext = parseContextInfo(terminalApp.contextInfo || "")
        const correlation = parsedContext.correlation || {}
        const source = parsedContext.source || {}

        if (terminalApp.currentAllowlisted) {
            approvalDialog.close()
            root.approvalDialogRequest = ({})
            root.approvalSelectedAutonomyMode = "guided"
            root.approvalSessionMode = "new"
            root.approvalResumeSessionId = ""
            root.approvalOutputFormat = "text"
            root.approvalTrustedScopeConfirmed = false
            root.approvalBudgetMaxCommands = 0
            root.approvalBudgetMaxDurationSecs = 0
            root.approvalBudgetMaxFiles = 0
            root.approvalGeminiScreenReader = false
            root.approvalCopilotMinimalUi = false
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

        root.approvalSelectedProvider = prefilledProvider
        root.approvalSelectedAutonomyMode = requestedAutonomyMode

        // ── Pre-fill session lifecycle + output format from context JSON ──────
        const srcSessionMode = (source.session_mode || "new").toString().toLowerCase()
        const srcResumeSessionId = (source.resume_session_id || "").toString()
        const srcOutputFormat = (source.output_format || "text").toString().toLowerCase()

        root.approvalSessionMode = (srcSessionMode === "resume") ? "resume" : "new"
        root.approvalResumeSessionId = srcResumeSessionId
        root.approvalOutputFormat = (srcOutputFormat === "json" || srcOutputFormat === "stream-json")
            ? srcOutputFormat
            : "text"

        root.approvalDialogRequest = {
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

        function onCrashAlert(message, logPath) {
            root.crashAlertMessage = message
            root.crashAlertLogPath = logPath
            root.showMainWindow()
            crashAlertDialog.open()
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
            Layout.preferredHeight: 36
            color: "#0d1117"

            RowLayout {
                anchors.fill: parent
                anchors.leftMargin: 16
                anchors.rightMargin: 16

                // Connection/status indicator
                Rectangle {
                    implicitWidth: 8; implicitHeight: 8; radius: 4
                    color: terminalApp.isConnected
                        ? "#22c55e"
                        : ((terminalApp.statusText || "").toLowerCase().indexOf("listening") >= 0 ? "#f97316" : "#ef4444")
                    // Subtle glow effect via border
                    border.color: terminalApp.isConnected ? "#16a34a60" : "#dc262660"
                    border.width: 3
                }

                Text {
                    text: terminalApp.isConnected
                        ? "Connected"
                        : ((terminalApp.statusText || "").toLowerCase().indexOf("listening") >= 0 ? "Listening" : "Disconnected")
                    color: "#6b7280"
                    font.pixelSize: 11
                }

                Text {
                    text: "CPU " + terminalApp.cpuUsagePercent.toFixed(1) + "% | RAM " + terminalApp.memoryUsageMb.toFixed(1) + " MB"
                    color: "#4b5563"
                    font.pixelSize: 11
                }

                // PTY mode badge — compile-time indicator (pty-host vs in-process)
                Rectangle {
                    visible: (terminalApp.terminalModeLabel || "").length > 0
                    implicitHeight: 16
                    implicitWidth: modeLabelText.implicitWidth + 12
                    radius: 3
                    color: (terminalApp.terminalModeLabel || "") === "pty-host" ? "#0c2a47" : "#1a1f28"
                    border.color: (terminalApp.terminalModeLabel || "") === "pty-host" ? "#1d4ed8" : "#374151"
                    border.width: 1
                    Text {
                        id: modeLabelText
                        anchors.centerIn: parent
                        text: "PTY: " + (terminalApp.terminalModeLabel || "")
                        color: (terminalApp.terminalModeLabel || "") === "pty-host" ? "#60a5fa" : "#6b7280"
                        font.pixelSize: 10
                    }
                }

                Item { Layout.fillWidth: true }

                Text {
                    text: "Interactive Terminal"
                    color: "#e5e7eb"
                    font.pixelSize: 13
                    font.bold: true
                }

                Item { Layout.fillWidth: true }

                // Pending count badge
                Rectangle {
                    visible: terminalApp.pendingCount > 0
                    implicitWidth: 20; implicitHeight: 20; radius: 10
                    color: "#dc2626"
                    border.color: "#ef4444"
                    border.width: 1
                    Text {
                        anchors.centerIn: parent
                        text: terminalApp.pendingCount
                        color: "white"
                        font.pixelSize: 10
                        font.bold: true
                    }
                }
            }
        }

        // Separator
        Rectangle { Layout.fillWidth: true; Layout.preferredHeight: 1; color: "#1f2937" }

        // Session runtime controls
        Rectangle {
            Layout.fillWidth: true
            implicitHeight: sessionControlsCol.implicitHeight + 14
            color: "#161b27"

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
                    spacing: 6

                    // Session badge
                    Rectangle {
                        implicitHeight: 18
                        implicitWidth: sessionLabel.implicitWidth + 16
                        radius: 9
                        color: "#1e2a3a"
                        border.color: "#2d3f55"
                        border.width: 1
                        visible: (terminalApp.currentSessionId || "").length > 0
                        Text {
                            id: sessionLabel
                            anchors.centerIn: parent
                            text: terminalApp.currentSessionId || ""
                            color: "#93c5fd"
                            font.pixelSize: 10
                        }
                    }

                    Item { Layout.fillWidth: true }
                }

                RowLayout {
                    Layout.fillWidth: true
                    spacing: 8

                    Text {
                        text: "Working Dir"
                        color: "#6b7280"
                        font.pixelSize: root.uiInputFontPx
                    }

                    ComboBox {
                        id: workspacePathField
                        editable: true
                        model: root.availableWorkspaces
                        textRole: "label"
                        Layout.preferredWidth: 240
                        Layout.preferredHeight: 28
                        font.pixelSize: root.uiInputFontPx
                        enabled: root.hasActiveTerminalSession
                        editText: terminalApp.currentWorkspacePath
                        onAccepted: terminalApp.setSessionWorkspacePath(editText)
                        onActivated: function(index) {
                            const entry = root.workspaceSuggestionAt(index)
                            const selectedPath = (entry.path || currentText || "").toString()
                            editText = selectedPath
                            terminalApp.setSessionWorkspacePath(selectedPath)
                        }
                        delegate: ItemDelegate {
                            id: workspacePathSuggestionDelegate
                            required property int index
                            required property var modelData
                            width: workspacePathField.width
                            implicitHeight: 42
                            highlighted: workspacePathField.highlightedIndex === index

                            contentItem: Column {
                                spacing: 1

                                Text {
                                    text: workspacePathSuggestionDelegate.modelData && workspacePathSuggestionDelegate.modelData.label
                                        ? workspacePathSuggestionDelegate.modelData.label
                                        : ""
                                    color: "#e8e8e8"
                                    font.pixelSize: root.uiInputFontPx
                                    elide: Text.ElideRight
                                }

                                Text {
                                    text: workspacePathSuggestionDelegate.modelData && workspacePathSuggestionDelegate.modelData.subtitle
                                        ? workspacePathSuggestionDelegate.modelData.subtitle
                                        : ""
                                    color: "#8a8a8a"
                                    font.pixelSize: Math.max(9, root.uiInputFontPx - 1)
                                    elide: Text.ElideRight
                                }
                            }
                        }
                        Component.onCompleted: {
                            popup.popupType = Popup.Window
                            popup.z = 3000
                        }
                    }

                    Text {
                        text: "Venv"
                        color: "#6b7280"
                        font.pixelSize: root.uiInputFontPx
                        visible: activateVenvCheck.checked
                    }

                    ComboBox {
                        id: venvPathField
                        editable: true
                        model: root.availableWorkspaces
                        textRole: "label"
                        Layout.preferredWidth: 220
                        Layout.preferredHeight: 28
                        font.pixelSize: root.uiInputFontPx
                        visible: activateVenvCheck.checked
                        enabled: root.hasActiveTerminalSession && activateVenvCheck.checked
                        editText: terminalApp.currentVenvPath
                        onAccepted: terminalApp.setSessionVenvPath(editText)
                        onActivated: function(index) {
                            const entry = root.workspaceSuggestionAt(index)
                            const selectedPath = (entry.path || currentText || "").toString()
                            editText = selectedPath
                            terminalApp.setSessionVenvPath(selectedPath)
                        }
                        delegate: ItemDelegate {
                            id: venvPathSuggestionDelegate
                            required property int index
                            required property var modelData
                            width: venvPathField.width
                            implicitHeight: 42
                            highlighted: venvPathField.highlightedIndex === index

                            contentItem: Column {
                                spacing: 1

                                Text {
                                    text: venvPathSuggestionDelegate.modelData && venvPathSuggestionDelegate.modelData.label
                                        ? venvPathSuggestionDelegate.modelData.label
                                        : ""
                                    color: "#e8e8e8"
                                    font.pixelSize: root.uiInputFontPx
                                    elide: Text.ElideRight
                                }

                                Text {
                                    text: venvPathSuggestionDelegate.modelData && venvPathSuggestionDelegate.modelData.subtitle
                                        ? venvPathSuggestionDelegate.modelData.subtitle
                                        : ""
                                    color: "#8a8a8a"
                                    font.pixelSize: Math.max(9, root.uiInputFontPx - 1)
                                    elide: Text.ElideRight
                                }
                            }
                        }
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

                        // ── Split button: [Launch CLI] [▾ Provider] ──────────
                        RowLayout {
                            spacing: 0

                            Button {
                                id: launchCliBtn
                                text: "Launch CLI"
                                font.pixelSize: root.uiControlFontPx
                                Layout.preferredHeight: 30
                                highlighted: true
                                onClicked: {
                                    terminalApp.setSessionWorkspacePath(workspacePathField.editText || "")
                                    if (root.selectedCliProvider === "copilot") {
                                        terminalApp.launchCopilotInTab()
                                    } else if (root.selectedCliProvider === "claude") {
                                        terminalApp.launchClaudeInTab()
                                    } else {
                                        terminalApp.launchGeminiInTab()
                                    }
                                }
                            }

                            ComboBox {
                                id: cliProviderCombo
                                model: ["Gemini", "Copilot", "Claude"]
                                implicitWidth: 110
                                implicitHeight: 30
                                font.pixelSize: root.uiControlFontPx
                                Component.onCompleted: {
                                    currentIndex = root.selectedCliProvider === "copilot" ? 1
                                        : root.selectedCliProvider === "claude" ? 2 : 0
                                    popup.popupType = Popup.Window
                                    popup.z = 3000
                                }
                                onCurrentIndexChanged: {
                                    if (currentIndex === 1) root.selectedCliProvider = "copilot"
                                    else if (currentIndex === 2) root.selectedCliProvider = "claude"
                                    else root.selectedCliProvider = "gemini"
                                }
                            }
                        }

                        // Key status for the selected provider
                        Text {
                            text: root.selectedCliProvider === "gemini"
                                ? (terminalApp.geminiKeyPresent ? "\u2714 key" : "oauth")
                                : root.selectedCliProvider === "claude"
                                    ? (terminalApp.claudeKeyPresent ? "\u2714 key" : "not set")
                                    : (terminalApp.copilotKeyPresent ? "\u2714 active" : "not set")
                            color: (root.selectedCliProvider === "gemini"
                                ? terminalApp.geminiKeyPresent
                                : root.selectedCliProvider === "claude"
                                    ? terminalApp.claudeKeyPresent
                                    : terminalApp.copilotKeyPresent)
                                ? "#22c55e" : "#f97316"
                            font.pixelSize: 11
                            verticalAlignment: Text.AlignVCenter
                        }

                        // Provider settings
                        Button {
                            text: "Provider Settings"
                            font.pixelSize: root.uiControlFontPx
                            Layout.preferredHeight: 30
                            onClicked: providerSettingsDialog.open()
                        }

                        Item { Layout.fillWidth: true }

                        Button {
                            text: "Saved Commands"
                            font.pixelSize: root.uiControlFontPx
                            Layout.minimumWidth: 148
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
                            Layout.minimumWidth: 90
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

                        Item { Layout.fillWidth: true }
                    }
                }
            }
        }

        Rectangle { Layout.fillWidth: true; Layout.preferredHeight: 1; color: "#1f2937" }

        // Session tabs
        Rectangle {
            Layout.fillWidth: true
            Layout.preferredHeight: 38
            color: "#0d1117"

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
                            id: sessionTabDelegate
                            required property var modelData
                            readonly property var tabData: modelData
                            readonly property int tabCount: Math.max(root.sessionTabs.length, 1)
                            readonly property real availablePerTab: (sessionTabsList.width - (sessionTabsList.spacing * Math.max(tabCount - 1, 0))) / tabCount
                            readonly property real minPreferred: tabText.implicitWidth + 46
                            radius: 4
                            color: tabData.isGemini
                                ? (tabData.isActive ? "#1a1030" : "#110b20")
                                : (tabData.isActive ? "#1a2234" : "#0d1117")
                            border.color: tabData.isGemini
                                ? (tabData.isActive ? "#7c3aed" : "#3b1f6e")
                                : (tabData.isActive ? "#1d4ed8" : "#1f2937")
                            border.width: 1
                            height: 32
                            width: Math.max(118, Math.min(260, Math.max(minPreferred, availablePerTab)))

                            // Active tab accent bar (bottom border)
                            Rectangle {
                                visible: sessionTabDelegate.tabData.isActive
                                anchors.bottom: parent.bottom
                                anchors.left: parent.left
                                anchors.right: parent.right
                                anchors.leftMargin: 1
                                anchors.rightMargin: 1
                                height: 2
                                color: sessionTabDelegate.tabData.isGemini ? "#a855f7" : "#3b82f6"
                                radius: 1
                            }

                            MouseArea {
                                anchors.fill: parent
                                anchors.rightMargin: closeArea.width + 10
                                onClicked: {
                                    terminalApp.switchSession(sessionTabDelegate.tabData.sessionId)
                                    root.refreshSessionTabs()
                                }
                            }

                            Text {
                                id: tabText
                                anchors.left: parent.left
                                anchors.leftMargin: sessionTabDelegate.tabData.isGemini ? 8 : 10
                                anchors.verticalCenter: parent.verticalCenter
                                anchors.right: closeRect.left
                                anchors.rightMargin: 4
                                text: {
                                    const base = sessionTabDelegate.tabData.isGemini
                                        ? "✦ " + sessionTabDelegate.tabData.label
                                        : sessionTabDelegate.tabData.label
                                    return sessionTabDelegate.tabData.pendingCount > 0
                                        ? base + " (" + sessionTabDelegate.tabData.pendingCount + ")"
                                        : base
                                }
                                color: sessionTabDelegate.tabData.isGemini
                                    ? (sessionTabDelegate.tabData.isActive ? "#c084fc" : "#7c3aed")
                                    : (sessionTabDelegate.tabData.isActive ? "#e5e7eb" : "#6b7280")
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
                                opacity: sessionTabDelegate.tabData.canClose ? 1.0 : 0.3
                                color: closeArea.pressed
                                    ? "#7f1d1d"
                                    : (closeArea.containsMouse ? "#3b1515" : "transparent")
                                border.color: closeArea.containsMouse ? "#6b7280" : "transparent"
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
                                    enabled: sessionTabDelegate.tabData.canClose
                                    hoverEnabled: true
                                    onClicked: {
                                        terminalApp.closeSession(sessionTabDelegate.tabData.sessionId)
                                        root.refreshSessionTabs()
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        Rectangle { Layout.fillWidth: true; Layout.preferredHeight: 1; color: "#1f2937" }

        // Main content: terminal view
        Rectangle {
            Layout.fillWidth: true
            Layout.fillHeight: true
            color: "#090d14"

            TerminalView {
                anchors.fill: parent
                terminalApp: terminalApp
                hasActiveSession: root.hasActiveTerminalSession
            }
        }

        // Bottom bar separator
        Rectangle { Layout.fillWidth: true; Layout.preferredHeight: 1; color: "#1f2937" }

        // Bottom action bar: copy + restart + profile selectors
        Rectangle {
            Layout.fillWidth: true
            Layout.preferredHeight: 34
            color: "#0d1117"

            RowLayout {
                anchors.fill: parent
                anchors.leftMargin: 8
                anchors.rightMargin: 8
                spacing: 2

                Button {
                    text: "Copy All"
                    font.pixelSize: root.uiControlFontPx
                    Layout.preferredHeight: 28
                    Material.foreground: "#e5e7eb"
                    onClicked: terminalApp.copyCurrentOutput()
                }

                Button {
                    text: "Copy Last"
                    font.pixelSize: root.uiControlFontPx
                    Layout.preferredHeight: 28
                    Material.foreground: "#e5e7eb"
                    enabled: root.hasActiveTerminalSession
                    onClicked: terminalApp.copyLastCommandOutput()
                }

                Button {
                    text: "Restart"
                    font.pixelSize: root.uiControlFontPx
                    Layout.preferredHeight: 28
                    Material.foreground: "#e5e7eb"
                    enabled: root.hasActiveTerminalSession
                    onClicked: {
                        if (root.hasActiveTerminalSession) {
                            terminalApp.switchSession(terminalApp.currentSessionId)
                        }
                    }
                }

                // Vertical divider
                Rectangle {
                    implicitWidth: 1; implicitHeight: 16
                    color: "#1f2937"
                }

                Item { Layout.fillWidth: true }

                Text {
                    text: "Profile"
                    color: "#4b5563"
                    font.pixelSize: 10
                }

                ComboBox {
                    id: terminalProfileSelector
                    model: ["system", "powershell", "pwsh", "cmd", "bash"]
                    implicitWidth: 118
                    implicitHeight: 26
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
                    color: "#4b5563"
                    font.pixelSize: 10
                }

                ComboBox {
                    id: defaultTerminalProfileSelector
                    model: ["system", "powershell", "pwsh", "cmd", "bash"]
                    implicitWidth: 118
                    implicitHeight: 26
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
            }
        }
    }

    Dialog {
        id: providerSettingsDialog
        popupType: Popup.Window
        modal: true
        anchors.centerIn: Overlay.overlay
        width: 520
        title: "Provider Settings"
        standardButtons: Dialog.Close
        padding: 0
        z: 4000

        Overlay.modal: Rectangle {
            color: "#70000000"
        }

        background: Rectangle {
            color: "#111827"
            border.color: "#1f2937"
            border.width: 1
            radius: 8
        }

        ColumnLayout {
            anchors.fill: parent
            anchors.margins: 20
            spacing: 16

            // ── Default provider ──────────────────────────────────────────────
            RowLayout {
                Layout.fillWidth: true
                spacing: 10

                Text {
                    text: "Default provider"
                    color: "#9ca3af"
                    font.pixelSize: root.uiControlFontPx
                    verticalAlignment: Text.AlignVCenter
                }

                ComboBox {
                    id: defaultProviderCombo
                    model: ["Gemini", "Copilot", "Claude"]
                    implicitWidth: 140
                    implicitHeight: 30
                    font.pixelSize: root.uiControlFontPx
                    Component.onCompleted: {
                        currentIndex = root.selectedCliProvider === "copilot" ? 1
                            : root.selectedCliProvider === "claude" ? 2 : 0
                        popup.popupType = Popup.Window
                        popup.z = 5000
                    }
                    onCurrentIndexChanged: {
                        if (currentIndex === 1) root.selectedCliProvider = "copilot"
                        else if (currentIndex === 2) root.selectedCliProvider = "claude"
                        else root.selectedCliProvider = "gemini"
                    }
                }

                Item { Layout.fillWidth: true }
            }

            // ── Separator ─────────────────────────────────────────────────────
            Rectangle { Layout.fillWidth: true; Layout.preferredHeight: 1; color: "#1f2937" }

            // ── Gemini section ────────────────────────────────────────────────
            Text {
                text: "Gemini"
                color: "#e5e7eb"
                font.pixelSize: root.uiControlFontPx
                font.bold: true
            }

            RowLayout {
                Layout.fillWidth: true
                spacing: 8

                TextField {
                    id: geminiApiKeyField
                    Layout.fillWidth: true
                    placeholderText: "API key (stored locally)"
                    echoMode: TextInput.Password
                    font.pixelSize: root.uiInputFontPx
                }

                Button {
                    text: "Save"
                    font.pixelSize: root.uiControlFontPx
                    Layout.preferredHeight: 30
                    onClicked: {
                        if (terminalApp.setGeminiApiKey(geminiApiKeyField.text)) {
                            geminiApiKeyField.text = ""
                        }
                    }
                }

                Button {
                    text: "Remove"
                    font.pixelSize: root.uiControlFontPx
                    Layout.preferredHeight: 30
                    enabled: terminalApp.geminiKeyPresent
                    onClicked: terminalApp.clearGeminiApiKey()
                }
            }

            RowLayout {
                Layout.fillWidth: true
                spacing: 16

                Text {
                    text: terminalApp.geminiKeyPresent ? "\u2713 API key stored" : "No API key set"
                    color: terminalApp.geminiKeyPresent ? "#22c55e" : "#6b7280"
                    font.pixelSize: 11
                    verticalAlignment: Text.AlignVCenter
                }

                CheckBox {
                    text: "Inject key into next launch"
                    font.pixelSize: root.uiControlFontPx
                    enabled: terminalApp.geminiKeyPresent
                    checked: terminalApp.geminiInjectionRequested
                    onClicked: terminalApp.geminiInjectionRequested = checked
                }

                Item { Layout.fillWidth: true }
            }

            // ── Separator ─────────────────────────────────────────────────────
            Rectangle { Layout.fillWidth: true; Layout.preferredHeight: 1; color: "#1f2937" }

            // ── Copilot section ───────────────────────────────────────────────
            Text {
                text: "GitHub Copilot"
                color: "#e5e7eb"
                font.pixelSize: root.uiControlFontPx
                font.bold: true
            }

            RowLayout {
                Layout.fillWidth: true
                spacing: 10

                Text {
                    text: terminalApp.copilotKeyPresent ? "\u2714 Active" : "Not authenticated"
                    color: terminalApp.copilotKeyPresent ? "#22c55e" : "#f97316"
                    font.pixelSize: 11
                    verticalAlignment: Text.AlignVCenter
                }

                Text {
                    text: "Copilot uses GitHub OAuth \u2014 run \u2018gh auth login\u2019 in terminal to authenticate."
                    color: "#6b7280"
                    font.pixelSize: 10
                    wrapMode: Text.WordWrap
                    Layout.fillWidth: true
                }
            }

            // ── Separator ─────────────────────────────────────────────────────
            Rectangle { Layout.fillWidth: true; Layout.preferredHeight: 1; color: "#1f2937" }

            // ── Claude section ────────────────────────────────────────────────
            Text {
                text: "Claude (Anthropic)"
                color: "#e5e7eb"
                font.pixelSize: root.uiControlFontPx
                font.bold: true
            }

            RowLayout {
                Layout.fillWidth: true
                spacing: 8

                TextField {
                    id: claudeApiKeyField
                    Layout.fillWidth: true
                    placeholderText: "ANTHROPIC_API_KEY (stored locally)"
                    echoMode: TextInput.Password
                    font.pixelSize: root.uiInputFontPx
                }

                Button {
                    text: "Save"
                    font.pixelSize: root.uiControlFontPx
                    Layout.preferredHeight: 30
                    onClicked: {
                        if (terminalApp.setClaudeApiKey(claudeApiKeyField.text)) {
                            claudeApiKeyField.text = ""
                        }
                    }
                }

                Button {
                    text: "Remove"
                    font.pixelSize: root.uiControlFontPx
                    Layout.preferredHeight: 30
                    enabled: terminalApp.claudeKeyPresent
                    onClicked: terminalApp.clearClaudeApiKey()
                }
            }

            RowLayout {
                Layout.fillWidth: true
                spacing: 16

                Text {
                    text: terminalApp.claudeKeyPresent ? "\u2714 API key stored" : "No API key set"
                    color: terminalApp.claudeKeyPresent ? "#22c55e" : "#6b7280"
                    font.pixelSize: 11
                    verticalAlignment: Text.AlignVCenter
                }

                Item { Layout.fillWidth: true }
            }

            Item { Layout.fillHeight: true }
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
            color: "#111827"
            border.color: "#1f2937"
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
                visible: (root.approvalDialogRequest.sessionId || "").trim().length > 0
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
                        text: root.approvalDialogRequest.sessionId || ""
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

            // ── Risk tier badge (Step 29) ─────────────────────────────────────
            Rectangle {
                visible: root.approvalDialogRequest.providerPolicyApplies
                Layout.fillWidth: false
                Layout.preferredHeight: 26
                radius: 13
                color: root.approvalRiskTier === 3 ? "#4f1a1a"
                    : root.approvalRiskTier === 2 ? "#3d2e00"
                    : "#1a3a1a"
                border.color: root.approvalRiskTier === 3 ? "#f87171"
                    : root.approvalRiskTier === 2 ? "#fbbf24"
                    : "#4ade80"
                border.width: 1

                Row {
                    anchors.fill: parent
                    anchors.leftMargin: 10
                    anchors.rightMargin: 10
                    spacing: 6

                    Text {
                        anchors.verticalCenter: parent.verticalCenter
                        text: root.approvalRiskTier === 3 ? "\u26a0" : root.approvalRiskTier === 2 ? "\u25cf" : "\u2713"
                        color: root.approvalRiskTier === 3 ? "#f87171"
                            : root.approvalRiskTier === 2 ? "#fbbf24"
                            : "#4ade80"
                        font.pixelSize: 13
                    }

                    Text {
                        anchors.verticalCenter: parent.verticalCenter
                        text: root.approvalRiskTier === 3 ? "Risk: High \u2014 autonomous / unrestricted"
                            : root.approvalRiskTier === 2 ? "Risk: Medium \u2014 autonomous / capped"
                            : "Risk: Low \u2014 guided mode"
                        color: root.approvalRiskTier === 3 ? "#f87171"
                            : root.approvalRiskTier === 2 ? "#fbbf24"
                            : "#4ade80"
                        font.pixelSize: 12
                        font.bold: true
                    }
                }
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

                    Text { text: "Command"; color: "#6b7280"; font.pixelSize: 12 }
                    Text { text: root.approvalDialogRequest.command || ""; color: "#d4d4d4"; font.pixelSize: 12; wrapMode: Text.WrapAnywhere }

                    Text { text: "Args"; color: "#6b7280"; font.pixelSize: 12 }
                    Text {
                        text: Array.isArray(root.approvalDialogRequest.args) && root.approvalDialogRequest.args.length
                            ? root.approvalDialogRequest.args.join(" ")
                            : "(none)"
                        color: "#d4d4d4"
                        font.pixelSize: 12
                        wrapMode: Text.WrapAnywhere
                    }

                    Text { text: "Mode"; color: "#6b7280"; font.pixelSize: 12 }
                    Text { text: root.approvalDialogRequest.mode || "interactive"; color: "#d4d4d4"; font.pixelSize: 12 }

                    Text { text: "Workspace ID"; color: "#6b7280"; font.pixelSize: 12 }
                    Text { text: root.approvalDialogRequest.workspaceId || ""; color: "#d4d4d4"; font.pixelSize: 12; wrapMode: Text.WrapAnywhere }

                    Text { text: "Workspace Path"; color: "#6b7280"; font.pixelSize: 12 }
                    Text { text: root.approvalDialogRequest.workspacePath || ""; color: "#d4d4d4"; font.pixelSize: 12; wrapMode: Text.WrapAnywhere }

                    Text { text: "Working Directory"; color: "#6b7280"; font.pixelSize: 12 }
                    Text { text: root.approvalDialogRequest.workingDirectory || ""; color: "#d4d4d4"; font.pixelSize: 12; wrapMode: Text.WrapAnywhere }

                    Text { text: "Session ID"; color: "#6b7280"; font.pixelSize: 12 }
                    Text { text: root.approvalDialogRequest.sessionId || ""; color: "#d4d4d4"; font.pixelSize: 12; wrapMode: Text.WrapAnywhere }

                    Text { text: "Request ID"; color: "#6b7280"; font.pixelSize: 12 }
                    Text { text: root.approvalDialogRequest.requestId || ""; color: "#d4d4d4"; font.pixelSize: 12; wrapMode: Text.WrapAnywhere }

                    Text { text: "Trace ID"; color: "#6b7280"; font.pixelSize: 12 }
                    Text { text: root.approvalDialogRequest.traceId || ""; color: "#d4d4d4"; font.pixelSize: 12; wrapMode: Text.WrapAnywhere }

                    Text { text: "Client Request ID"; color: "#6b7280"; font.pixelSize: 12 }
                    Text { text: root.approvalDialogRequest.clientRequestId || ""; color: "#d4d4d4"; font.pixelSize: 12; wrapMode: Text.WrapAnywhere }

                    Text { text: "Approval Context ID"; color: "#6b7280"; font.pixelSize: 12 }
                    Text { text: root.approvalDialogRequest.contextId || ""; color: "#d4d4d4"; font.pixelSize: 12; wrapMode: Text.WrapAnywhere }

                    Text {
                        visible: root.approvalDialogRequest.providerPolicyApplies
                        text: "CLI Provider"
                        color: "#6b7280"
                        font.pixelSize: 12
                    }
                    Text {
                        visible: root.approvalDialogRequest.providerPolicyApplies
                        text: root.approvalDialogRequest.prefilledProvider || "(manual selection required)"
                        color: "#d4d4d4"
                        font.pixelSize: 12
                        wrapMode: Text.WrapAnywhere
                    }

                    Text {
                        visible: root.approvalDialogRequest.providerPolicyApplies
                        text: "Provider Source"
                        color: "#6b7280"
                        font.pixelSize: 12
                    }
                    Text {
                        visible: root.approvalDialogRequest.providerPolicyApplies
                        text: root.approvalDialogRequest.providerPrefillSource || "none"
                        color: "#d4d4d4"
                        font.pixelSize: 12
                        wrapMode: Text.WrapAnywhere
                    }

                    Text {
                        visible: root.approvalDialogRequest.providerPolicyApplies
                        text: "Provider Chooser"
                        color: "#6b7280"
                        font.pixelSize: 12
                    }
                    Text {
                        visible: root.approvalDialogRequest.providerPolicyApplies
                        text: root.approvalDialogRequest.providerChooserVisible ? "visible" : "hidden"
                        color: "#d4d4d4"
                        font.pixelSize: 12
                        wrapMode: Text.WrapAnywhere
                    }

                    Text {
                        visible: root.approvalDialogRequest.providerPolicyApplies
                        text: "Autonomy Selector"
                        color: "#6b7280"
                        font.pixelSize: 12
                    }
                    Text {
                        visible: root.approvalDialogRequest.providerPolicyApplies
                        text: root.approvalDialogRequest.autonomySelectorVisible ? "visible" : "hidden"
                        color: "#d4d4d4"
                        font.pixelSize: 12
                        wrapMode: Text.WrapAnywhere
                    }

                    // ── Context-Pack rows (step 9) ──────────────────────────
                    Text {
                        visible: !!(root.approvalDialogRequest.contextPack
                            && root.approvalDialogRequest.contextPack.requesting_agent)
                        text: "Requesting Agent"
                        color: "#6b7280"
                        font.pixelSize: 12
                    }
                    Text {
                        visible: !!(root.approvalDialogRequest.contextPack
                            && root.approvalDialogRequest.contextPack.requesting_agent)
                        text: (root.approvalDialogRequest.contextPack
                            && root.approvalDialogRequest.contextPack.requesting_agent) || ""
                        color: "#4ec9b0"
                        font.pixelSize: 12
                        wrapMode: Text.WrapAnywhere
                    }

                    Text {
                        visible: !!(root.approvalDialogRequest.contextPack
                            && root.approvalDialogRequest.contextPack.step_notes)
                        text: "Step Notes"
                        color: "#6b7280"
                        font.pixelSize: 12
                    }
                    Text {
                        visible: !!(root.approvalDialogRequest.contextPack
                            && root.approvalDialogRequest.contextPack.step_notes)
                        text: (root.approvalDialogRequest.contextPack
                            && root.approvalDialogRequest.contextPack.step_notes) || ""
                        color: "#d4d4d4"
                        font.pixelSize: 12
                        wrapMode: Text.WordWrap
                        maximumLineCount: 4
                        elide: Text.ElideRight
                    }

                    Text {
                        visible: !!(root.approvalDialogRequest.contextPack
                            && root.approvalDialogRequest.contextPack.relevant_files
                            && root.approvalDialogRequest.contextPack.relevant_files.length > 0)
                        text: "Context Files"
                        color: "#6b7280"
                        font.pixelSize: 12
                    }
                    Text {
                        visible: !!(root.approvalDialogRequest.contextPack
                            && root.approvalDialogRequest.contextPack.relevant_files
                            && root.approvalDialogRequest.contextPack.relevant_files.length > 0)
                        text: {
                            const files = (root.approvalDialogRequest.contextPack
                                && root.approvalDialogRequest.contextPack.relevant_files) || []
                            const names = files.slice(0, 3).map(function(f) { return f.path })
                            return files.length + " file(s): " + names.join(", ")
                                + (files.length > 3 ? " …" : "")
                        }
                        color: "#d4d4d4"
                        font.pixelSize: 12
                        wrapMode: Text.WrapAnywhere
                    }

                    Text {
                        visible: !!(root.approvalDialogRequest.contextPack
                            && root.approvalDialogRequest.contextPack.custom_instructions)
                        text: "Custom Instructions"
                        color: "#6b7280"
                        font.pixelSize: 12
                    }
                    Text {
                        visible: !!(root.approvalDialogRequest.contextPack
                            && root.approvalDialogRequest.contextPack.custom_instructions)
                        text: "\u2713 provided"
                        color: "#4ec9b0"
                        font.pixelSize: 12
                    }
                }
            }

            Text {
                visible: root.approvalDialogRequest.providerSelectionRequired
                text: "Provider selection is required before approval."
                color: "#f48771"
                font.pixelSize: 12
            }

            RowLayout {
                visible: root.approvalDialogRequest.providerChooserVisible
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
                    model: root.approvalDialogRequest.providerSelectionRequired
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
                        const selected = (root.approvalSelectedProvider || "").toLowerCase()
                        if (selected === "gemini") {
                            return root.approvalDialogRequest.providerSelectionRequired ? 1 : 0
                        }
                        if (selected === "copilot") {
                            return root.approvalDialogRequest.providerSelectionRequired ? 2 : 1
                        }
                        return 0
                    }
                    onActivated: {
                        const choice = (model[currentIndex] || "").toString().toLowerCase()
                        if (choice === "gemini") {
                            root.approvalSelectedProvider = "gemini"
                        } else if (choice === "copilot") {
                            root.approvalSelectedProvider = "copilot"
                        } else {
                            root.approvalSelectedProvider = ""
                        }
                    }
                }
            }

            RowLayout {
                visible: root.approvalDialogRequest.autonomySelectorVisible
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
                    currentIndex: (root.approvalSelectedAutonomyMode || "guided") === "autonomous" ? 1 : 0
                    onActivated: {
                        const choice = (model[currentIndex] || "").toString().toLowerCase()
                        root.approvalSelectedAutonomyMode = (choice === "autonomous") ? "autonomous" : "guided"
                    }
                }
            }

            // ── Session lifecycle selector (Step 27) ─────────────────────────
            RowLayout {
                visible: root.approvalDialogRequest.providerPolicyApplies
                spacing: 8

                Label {
                    text: "Session"
                    color: "#c8c8c8"
                    font.pixelSize: 12
                }

                ComboBox {
                    id: approvalSessionModeChooser
                    Layout.preferredWidth: 160
                    font.pixelSize: root.uiControlFontPx
                    model: ["New session", "Resume session"]
                    currentIndex: root.approvalSessionMode === "resume" ? 1 : 0
                    onActivated: {
                        const choice = (model[currentIndex] || "").toString().toLowerCase()
                        root.approvalSessionMode = choice.indexOf("resume") >= 0 ? "resume" : "new"
                    }
                }

                TextField {
                    id: approvalResumeSessionIdField
                    visible: root.approvalSessionMode === "resume"
                    Layout.preferredWidth: 200
                    font.pixelSize: root.uiInputFontPx
                    placeholderText: "Session ID to resume"
                    text: root.approvalResumeSessionId
                    onTextChanged: root.approvalResumeSessionId = text
                }
            }

            Text {
                visible: root.approvalDialogRequest.providerPolicyApplies
                    && root.approvalSessionMode === "resume"
                    && !(root.approvalResumeSessionId || "").trim().length
                text: "Resume requires a session ID."
                color: "#f48771"
                font.pixelSize: 12
            }

            // ── Output format selector (Step 28) ─────────────────────────────
            RowLayout {
                visible: root.approvalDialogRequest.providerPolicyApplies
                spacing: 8

                Label {
                    text: "Output format"
                    color: "#c8c8c8"
                    font.pixelSize: 12
                }

                ComboBox {
                    id: approvalOutputFormatChooser
                    Layout.preferredWidth: 160
                    font.pixelSize: root.uiControlFontPx
                    model: ["Text", "JSON", "Stream JSON"]
                    currentIndex: {
                        const fmt = root.approvalOutputFormat || "text"
                        if (fmt === "json") return 1
                        if (fmt === "stream-json") return 2
                        return 0
                    }
                    onActivated: {
                        const choice = (model[currentIndex] || "").toString().toLowerCase()
                        if (choice === "json") {
                            root.approvalOutputFormat = "json"
                        } else if (choice === "stream json") {
                            root.approvalOutputFormat = "stream-json"
                        } else {
                            root.approvalOutputFormat = "text"
                        }
                    }
                }
            }

            // ── CLI load-reduction flags (Phase 3) ───────────────────────────
            // Controls are opt-in: no load-reduction flags are injected unless
            // the approver explicitly enables them.
            ColumnLayout {
                visible: root.approvalDialogRequest.providerPolicyApplies
                spacing: 2

                CheckBox {
                    id: geminiScreenReaderCheckbox
                    // Only show when Gemini is the selected/prefilled provider
                    visible: (root.approvalSelectedProvider || "").toLowerCase() === "gemini"
                        || (root.approvalDialogRequest.prefilledProvider || "").toLowerCase() === "gemini"
                    text: "Enable screen reader mode (--screen-reader)"
                    font.pixelSize: root.uiControlFontPx
                    checked: root.approvalGeminiScreenReader
                    onCheckedChanged: root.approvalGeminiScreenReader = checked
                }

                Text {
                    // Show a plain note for Copilot so visible controls only map
                    // to launch flags that actually exist at runtime.
                    visible: (root.approvalSelectedProvider || "").toLowerCase() === "copilot"
                        || (root.approvalDialogRequest.prefilledProvider || "").toLowerCase() === "copilot"
                    text: "Copilot CLI v1.x has no screen-reader/minimal-UI launch flag."
                    color: "#a0a7b4"
                    font.pixelSize: root.uiControlFontPx
                    wrapMode: Text.WordWrap
                    Layout.fillWidth: true
                }
            }

            // ── Autonomy budget controls (Step 31) ───────────────────────────
            ColumnLayout {
                visible: root.approvalSelectedAutonomyMode === "autonomous"
                spacing: 6

                Rectangle {
                    Layout.fillWidth: true
                    Layout.preferredHeight: 1
                    color: "#3c3c3c"
                }

                Text {
                    text: "Autonomy Budget (0 = unlimited)"
                    color: "#c8c8c8"
                    font.pixelSize: 12
                    font.bold: true
                }

                RowLayout {
                    spacing: 8
                    Label { text: "Max commands"; color: "#c8c8c8"; font.pixelSize: 11 }
                    SpinBox {
                        id: budgetMaxCommandsBox
                        from: 0; to: 99999
                        value: root.approvalBudgetMaxCommands
                        font.pixelSize: root.uiControlFontPx
                        onValueModified: root.approvalBudgetMaxCommands = value
                    }
                }

                RowLayout {
                    spacing: 8
                    Label { text: "Max duration (secs)"; color: "#c8c8c8"; font.pixelSize: 11 }
                    SpinBox {
                        id: budgetMaxDurationSecsBox
                        from: 0; to: 99999
                        value: root.approvalBudgetMaxDurationSecs
                        font.pixelSize: root.uiControlFontPx
                        onValueModified: root.approvalBudgetMaxDurationSecs = value
                    }
                }

                RowLayout {
                    spacing: 8
                    Label { text: "Max files"; color: "#c8c8c8"; font.pixelSize: 11 }
                    SpinBox {
                        id: budgetMaxFilesBox
                        from: 0; to: 99999
                        value: root.approvalBudgetMaxFiles
                        font.pixelSize: root.uiControlFontPx
                        onValueModified: root.approvalBudgetMaxFiles = value
                    }
                }
            }

            // ── Trusted-scope confirmation gate (Step 30) ────────────────────
            ColumnLayout {
                visible: root.approvalRiskTier >= 2
                spacing: 6

                Rectangle {
                    Layout.fillWidth: true
                    Layout.preferredHeight: 1
                    color: root.approvalRiskTier === 3 ? "#f87171" : "#fbbf24"
                    opacity: 0.6
                }

                RowLayout {
                    spacing: 6
                    Text {
                        text: "\u26a0"
                        color: root.approvalRiskTier === 3 ? "#f87171" : "#fbbf24"
                        font.pixelSize: 14
                    }
                    Text {
                        text: root.approvalRiskTier === 3
                            ? "High-risk launch: autonomous mode, unrestricted scope"
                            : "Medium-risk launch: autonomous mode with budget limits"
                        color: root.approvalRiskTier === 3 ? "#f87171" : "#fbbf24"
                        font.pixelSize: 12
                        font.bold: true
                    }
                }

                Text {
                    text: root.approvalRiskTier === 3
                        ? "I confirm this autonomous agent may operate across the full workspace without command, time, or file restrictions."
                        : "I confirm this autonomous agent may access files and run commands within this workspace (within the stated budget limits)."
                    color: "#d4d4d4"
                    font.pixelSize: 11
                    wrapMode: Text.WordWrap
                    Layout.fillWidth: true
                }

                CheckBox {
                    id: trustedScopeCheck
                    text: "I understand and accept the risk"
                    font.pixelSize: root.uiControlFontPx
                    checked: root.approvalTrustedScopeConfirmed
                    onCheckedChanged: root.approvalTrustedScopeConfirmed = checked
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
                        // Sync approval-time selections to bridge before approving
                        terminalApp.approvalSessionMode = root.approvalSessionMode
                        terminalApp.approvalOutputFormat = root.approvalOutputFormat
                        if (root.approvalSessionMode === "resume") {
                            terminalApp.approvalResumeSessionId = root.approvalResumeSessionId
                        }
                        // Sync risk/budget/trusted-scope (Steps 29–31)
                        terminalApp.approvalRiskTier = root.approvalRiskTier
                        terminalApp.approvalTrustedScopeConfirmed = root.approvalTrustedScopeConfirmed
                        terminalApp.approvalBudgetMaxCommands = root.approvalBudgetMaxCommands
                        terminalApp.approvalBudgetMaxDurationSecs = root.approvalBudgetMaxDurationSecs
                        terminalApp.approvalBudgetMaxFiles = root.approvalBudgetMaxFiles
                        // Sync CLI load-reduction flags (Phase 3)
                        terminalApp.approvalGeminiScreenReader = root.approvalGeminiScreenReader
                        terminalApp.approvalCopilotMinimalUi = root.approvalCopilotMinimalUi
                        terminalApp.approveCommand(terminalApp.currentRequestId, root.approvalSelectedAutonomyMode)
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
            color: "#161b27"
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
                color: "#6b7280"
                font.pixelSize: 11
            }

            TextField {
                id: savedCommandsWorkspaceField
                Layout.fillWidth: true
                placeholderText: "Workspace ID"
                font.pixelSize: root.uiInputFontPx
                focus: true
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
                    id: savedCommandDelegate
                    required property var modelData
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
                                text: savedCommandDelegate.entry.name
                                color: "#d4d4d4"
                                font.pixelSize: 12
                                elide: Text.ElideRight
                                width: parent.width
                            }

                            Text {
                                text: savedCommandDelegate.entry.command
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
                                terminalApp.deriveAllowlistPattern(savedCommandDelegate.entry.command)
                            }
                        }
                    }

                    MouseArea {
                        anchors.fill: parent
                        anchors.rightMargin: addToAllowlistBtn.width + 10
                        onClicked: root.selectedSavedCommandId = savedCommandDelegate.entry.id
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
                        color: "#6b7280"
                        font.pixelSize: 10
                        elide: Text.ElideRight
                        Layout.fillWidth: true
                    }

                    // Option A: Exact (low risk)
                    Rectangle {
                        Layout.fillWidth: true
                        implicitHeight: 34
                        radius: 3
                        color: (terminalApp.proposedAllowlistPattern === terminalApp.proposedExactPattern)
                            ? "#1a3a1a" : "#1a2234"
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
                                color: "#6b7280"
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
                        implicitHeight: 34
                        radius: 3
                        visible: (terminalApp.proposedGeneralPattern || "") !== (terminalApp.proposedExactPattern || "")
                        color: (terminalApp.proposedAllowlistPattern === terminalApp.proposedGeneralPattern)
                            ? "#2a1a00" : "#1a2234"
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
                                color: "#6b7280"
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

    // ── pty-host Crash Alert Dialog ──────────────────────────────────────
    Dialog {
        id: crashAlertDialog
        popupType: Popup.Window
        modal: true
        anchors.centerIn: Overlay.overlay
        width: 480
        title: "\u26A0 Interactive Terminal — PTY Host Crashed"
        standardButtons: Dialog.Ok
        padding: 0
        z: 5000

        Overlay.modal: Rectangle {
            color: "#80000000"
        }

        background: Rectangle {
            color: "#1a1a2e"
            border.color: "#ef4444"
            border.width: 1
            radius: 8
        }

        ColumnLayout {
            anchors.fill: parent
            anchors.margins: 20
            spacing: 12

            Text {
                Layout.fillWidth: true
                text: root.crashAlertMessage || "The pty-host process has stopped."
                color: "#f9fafb"
                font.pixelSize: 13
                wrapMode: Text.WordWrap
            }

            Text {
                Layout.fillWidth: true
                text: "Active terminal sessions are no longer running. " +
                      "Restart the Interactive Terminal to reconnect."
                color: "#9ca3af"
                font.pixelSize: 11
                wrapMode: Text.WordWrap
            }

            Rectangle {
                Layout.fillWidth: true
                Layout.preferredHeight: 1
                color: "#374151"
            }

            RowLayout {
                Layout.fillWidth: true
                spacing: 8

                Text {
                    text: "Log:"
                    color: "#6b7280"
                    font.pixelSize: 11
                }

                Text {
                    Layout.fillWidth: true
                    text: root.crashAlertLogPath || "(unavailable)"
                    color: "#60a5fa"
                    font.pixelSize: 11
                    elide: Text.ElideLeft
                    wrapMode: Text.NoWrap

                    MouseArea {
                        anchors.fill: parent
                        cursorShape: Qt.PointingHandCursor
                        onClicked: Qt.openUrlExternally("file:///" + root.crashAlertLogPath)
                    }
                }
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
            color: "#161b27"
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
                color: "#6b7280"
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
                    focus: true
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
                    id: allowlistPatternDelegate
                    required property var modelData
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
                            text: allowlistPatternDelegate.modelData
                            color: "#d4d4d4"
                            font.pixelSize: 12
                            font.family: "Consolas,Courier New,monospace"
                            elide: Text.ElideRight
                            verticalAlignment: Text.AlignVCenter
                        }

                        Rectangle {
                            implicitWidth: 22
                            implicitHeight: 22
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
                                onClicked: terminalApp.removeAllowlistPattern(allowlistPatternDelegate.modelData)
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
                implicitHeight: 30
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
