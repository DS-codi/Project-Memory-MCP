import QtQuick 2.15
import QtQuick.Controls 2.15
import QtQuick.Controls.Material 2.15
import QtQuick.Layouts 1.15

/// AI Assistant panel — horizontal sidebar chatbot backed by Gemini or GitHub Models.
/// Expands/collapses from the right edge of the supervisor window.
/// Communicates with the Rust gui_server at guiBaseUrl (/chatbot/chat, /chatbot/config).
Rectangle {
    id: panel
    Material.theme: Material.Dark

    property string mcpBaseUrl: ""
    property string guiBaseUrl: "http://127.0.0.1:3464"
    property int    mcpPort:    0

    property bool   expanded:   false
    property bool   busy:       false
    property string provider:   "gemini"
    property string aiModel:    ""
    property bool   keyConfigured: false
    property bool   showSettings:  false
    // Live tool-call tracking
    property string currentRequestId:   ""
    property int    shownToolCallCount: 0

    readonly property int requestTimeoutMs: 20000

    readonly property var geminiModels:  ["gemini-3.1-pro-preview", "gemini-3-flash-preview", "gemini-3.1-flash-lite-preview", "gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash", "gemini-2.0-flash-lite"]
    readonly property var copilotModels: ["gpt-4o", "gpt-4.1", "gpt-4o-mini", "o3-mini", "claude-3.5-sonnet"]

    color:        "#161b22"
    radius:       0
    border.color: expanded ? "#388bfd" : "#30363d"
    border.width: 1
    Layout.fillHeight: true
    implicitWidth: expanded ? 380 : 44

    Behavior on implicitWidth { NumberAnimation { duration: 200; easing.type: Easing.OutCubic } }
    Behavior on border.color  { ColorAnimation  { duration: 120 } }

    // ── Data models ─────────────────────────────────────────────────────────
    ListModel { id: messageModel }
    ListModel { id: workspaceModel }

    // ── Live tool-call polling ────────────────────────────────────────────────
    Timer {
        id: toolCallPollTimer
        interval: 600
        repeat: true
        running: false
        onTriggered: {
            if (!panel.busy || panel.currentRequestId === "") {
                running = false
                return
            }
            var xhr = new XMLHttpRequest()
            xhr.timeout = 4000
            xhr.open("GET", panel.guiBaseUrl + "/chatbot/status/" + panel.currentRequestId)
            xhr.onreadystatechange = function() {
                if (xhr.readyState !== XMLHttpRequest.DONE || xhr.status !== 200) return
                try {
                    var d = JSON.parse(xhr.responseText)
                    var calls = d.tool_calls_so_far || []
                    // Append only the new calls not yet shown
                    for (var i = panel.shownToolCallCount; i < calls.length; i++) {
                        messageModel.append({ role: "tool", content: calls[i], isToolCall: true })
                        chatView.positionViewAtEnd()
                        if (chatWindow.visible) popoutView.positionViewAtEnd()
                    }
                    panel.shownToolCallCount = calls.length
                    // Stop if the server already cleaned up the log (in_progress: false)
                    if (!d.in_progress) toolCallPollTimer.running = false
                } catch(e) {}
            }
            xhr.send()
        }
    }

    // ── Fetch config on expand ───────────────────────────────────────────────
    onExpandedChanged: {
        if (expanded) {
            fetchConfig()
            fetchWorkspaces()
        }
    }

    function appendAssistantMessage(text) {
        messageModel.append({ role: "assistant", content: text, isToolCall: false })
    }

    function finishChatRequestWithError(text) {
        panel.busy = false
        appendAssistantMessage(text)
        chatView.positionViewAtEnd()
        if (chatWindow.visible)
            popoutView.positionViewAtEnd()
    }

    function fetchConfig() {
        var xhr = new XMLHttpRequest()
        xhr.timeout = panel.requestTimeoutMs
        xhr.open("GET", panel.guiBaseUrl + "/chatbot/config")
        xhr.onreadystatechange = function() {
            if (xhr.readyState !== XMLHttpRequest.DONE || xhr.status !== 200) return
            try {
                var d = JSON.parse(xhr.responseText)
                panel.provider      = d.provider      || "gemini"
                panel.aiModel       = d.model         || ""
                panel.keyConfigured = d.key_configured || false
                if (d.api_key && d.api_key !== "") apiKeyField.text = d.api_key
                providerCombo.currentIndex = (panel.provider === "copilot") ? 1 : 0
                var modelList = panel.provider === "gemini" ? panel.geminiModels : panel.copilotModels
                var modelIdx = modelList.indexOf(panel.aiModel)
                modelCombo.currentIndex = modelIdx >= 0 ? modelIdx : (panel.provider === "gemini" ? 4 : 0)
            } catch(e) {}
        }
        xhr.onerror = function() {
            panel.keyConfigured = false
        }
        xhr.ontimeout = function() {
            panel.keyConfigured = false
        }
        xhr.send()
    }

    function fetchWorkspaces() {
        var xhr = new XMLHttpRequest()
        xhr.timeout = panel.requestTimeoutMs
        xhr.open("GET", "http://127.0.0.1:3459/api/workspaces")
        xhr.onreadystatechange = function() {
            if (xhr.readyState !== XMLHttpRequest.DONE || xhr.status !== 200) return
            try {
                var result = JSON.parse(xhr.responseText)
                var list = result.workspaces || []
                workspaceModel.clear()
                workspaceModel.append({ id: "", name: "(no workspace)" })
                for (var i = 0; i < list.length; i++) {
                    workspaceModel.append({ id: list[i].workspace_id, name: list[i].name || list[i].workspace_id })
                }
            } catch(e) {
                workspaceModel.clear()
                workspaceModel.append({ id: "", name: "(no workspace)" })
            }
        }
        xhr.onerror = function() {
            workspaceModel.clear()
            workspaceModel.append({ id: "", name: "(no workspace)" })
        }
        xhr.ontimeout = function() {
            workspaceModel.clear()
            workspaceModel.append({ id: "", name: "(no workspace)" })
        }
        xhr.send()
    }

    function sendMessage(text) {
        if (text.trim() === "" || panel.busy) return
        panel.busy = true
        messageModel.append({ role: "user", content: text.trim(), isToolCall: false })
        chatInput.text = ""
        chatView.positionViewAtEnd()

        // Generate a request ID so the polling timer can track live tool calls.
        var reqId = "req_" + Date.now() + "_" + Math.floor(Math.random() * 999999)
        panel.currentRequestId   = reqId
        panel.shownToolCallCount = 0
        toolCallPollTimer.running = true

        var wsId = workspaceModel.count > 0 ? workspaceModel.get(workspaceCombo.currentIndex).id : ""

        var history = []
        for (var i = 0; i < messageModel.count; i++) {
            var m = messageModel.get(i)
            if (!m.isToolCall) {
                history.push({ role: m.role, content: m.content })
            }
        }

        var xhr = new XMLHttpRequest()
        xhr.timeout = panel.requestTimeoutMs
        xhr.open("POST", panel.guiBaseUrl + "/chatbot/chat")
        xhr.setRequestHeader("Content-Type", "application/json")
        xhr.onreadystatechange = function() {
            if (xhr.readyState !== XMLHttpRequest.DONE) return
            toolCallPollTimer.running = false
            panel.busy = false
            if (xhr.status === 200) {
                try {
                    var resp = JSON.parse(xhr.responseText)
                    // Append any tool calls not already shown by the polling timer
                    var finalCalls = resp.tool_calls_made || []
                    for (var t = panel.shownToolCallCount; t < finalCalls.length; t++) {
                        messageModel.append({ role: "tool", content: finalCalls[t], isToolCall: true })
                    }
                    messageModel.append({ role: "assistant", content: resp.reply || "(no reply)", isToolCall: false })
                } catch(e) {
                    messageModel.append({ role: "assistant", content: "Error parsing response.", isToolCall: false })
                }
            } else {
                try {
                    var err = JSON.parse(xhr.responseText)
                    messageModel.append({ role: "assistant", content: "Error: " + (err.error || xhr.status), isToolCall: false })
                } catch(e2) {
                    messageModel.append({ role: "assistant", content: "Request failed (" + xhr.status + ")", isToolCall: false })
                }
            }
            chatView.positionViewAtEnd()
            if (chatWindow.visible)
                popoutView.positionViewAtEnd()
        }
        xhr.onerror = function() {
            toolCallPollTimer.running = false
            panel.finishChatRequestWithError("Chat request failed. The supervisor chatbot service may be unavailable.")
        }
        xhr.ontimeout = function() {
            toolCallPollTimer.running = false
            panel.finishChatRequestWithError("Chat request timed out. Please try again or restart the supervisor chatbot service.")
        }
        xhr.send(JSON.stringify({ messages: history, workspace_id: wsId === "" ? null : wsId, request_id: reqId }))
    }

    function saveConfig(provider, model, apiKey) {
        var body = {}
        if (provider !== "") body.provider = provider
        if (model !== "")    body.model    = model
        if (apiKey !== "")   body.api_key  = apiKey
        if (Object.keys(body).length === 0) return
        var xhr = new XMLHttpRequest()
        xhr.timeout = panel.requestTimeoutMs
        xhr.open("POST", panel.guiBaseUrl + "/chatbot/config")
        xhr.setRequestHeader("Content-Type", "application/json")
        xhr.onreadystatechange = function() {
            if (xhr.readyState !== XMLHttpRequest.DONE) return
            if (xhr.status === 200) {
                try {
                    var d = JSON.parse(xhr.responseText)
                    panel.keyConfigured = d.key_configured || false
                    apiKeyField.text = ""
                } catch(e) {}
            }
        }
        xhr.onerror = function() {
            panel.keyConfigured = false
        }
        xhr.ontimeout = function() {
            panel.keyConfigured = false
        }
        xhr.send(JSON.stringify(body))
    }

    // ── Collapsed strip ──────────────────────────────────────────────────────
    Item {
        visible: !panel.expanded
        width: 44
        anchors { top: parent.top; bottom: parent.bottom; left: parent.left }

        Column {
            anchors.centerIn: parent
            spacing: 14

            ToolButton {
                anchors.horizontalCenter: parent.horizontalCenter
                text: "\u25C4"   // ◄ open
                font.pixelSize: 14
                padding: 4
                ToolTip.text: "Open AI Assistant"
                ToolTip.visible: hovered
                onClicked: panel.expanded = true
            }

            Text {
                anchors.horizontalCenter: parent.horizontalCenter
                text: "AI"
                color: "#58a6ff"
                font { pixelSize: 11; bold: true; letterSpacing: 0.8 }
            }

            // Provider colour dot
            Rectangle {
                anchors.horizontalCenter: parent.horizontalCenter
                width: 8; height: 8; radius: 4
                color: panel.provider === "copilot" ? "#1f6feb" : "#388bfd"
                ToolTip.text: panel.provider === "copilot" ? "Copilot" : "Gemini"
                ToolTip.visible: stripProviderHover.hovered
                HoverHandler { id: stripProviderHover }
            }

            // Key-status dot (green = configured, yellow = missing)
            Rectangle {
                anchors.horizontalCenter: parent.horizontalCenter
                width: 8; height: 8; radius: 4
                color: panel.keyConfigured ? "#3fb950" : "#e3b341"
                ToolTip.text: panel.keyConfigured ? "API key set" : "No API key"
                ToolTip.visible: stripKeyHover.hovered
                HoverHandler { id: stripKeyHover }
            }
        }
    }

    // ── Expanded panel ──────────────────────────────────────────────────────
    ColumnLayout {
        visible: panel.expanded
        anchors {
            fill: parent
            leftMargin: 8; rightMargin: 6
            topMargin: 8; bottomMargin: 8
        }
        spacing: 6

        // ── Expanded header ─────────────────────────────────────────────────
        RowLayout {
            spacing: 4
            Layout.fillWidth: true

            ToolButton {
                text: "\u25BA"   // ► collapse
                font.pixelSize: 12; padding: 4
                ToolTip.text: "Collapse"; ToolTip.visible: hovered
                onClicked: panel.expanded = false
            }

            Text {
                text: "[AI] AI ASSISTANT"
                color: "#c9d1d9"
                font { pixelSize: 11; weight: Font.Bold; letterSpacing: 0.6 }
                elide: Text.ElideRight
                Layout.fillWidth: true
            }

            Rectangle {
                implicitWidth: expandedBadge.implicitWidth + 10
                implicitHeight: 18; radius: 9
                color: panel.provider === "copilot" ? "#1f6feb" : "#388bfd"
                Text {
                    id: expandedBadge
                    anchors.centerIn: parent
                    text: panel.provider === "copilot" ? "Copilot" : "Gemini"
                    color: "white"; font.pixelSize: 10
                }
            }

            BusyIndicator { running: panel.busy; Layout.preferredWidth: 18; Layout.preferredHeight: 18; visible: panel.busy }

            ToolButton {
                text: "\u2699"
                font.pixelSize: 13; padding: 3
                ToolTip.text: "API key & model"; ToolTip.visible: hovered
                onClicked: panel.showSettings = !panel.showSettings
            }

            ToolButton {
                text: "\u239A"   // ⎚ clear
                font.pixelSize: 13; padding: 3
                ToolTip.text: "Clear chat"; ToolTip.visible: hovered
                enabled: messageModel.count > 0
                opacity: enabled ? 1.0 : 0.35
                onClicked: {
                    messageModel.clear()
                    chatInput.text = ""
                }
            }

            ToolButton {
                text: "\u29C9"
                font.pixelSize: 13; padding: 3
                ToolTip.text: "Pop out"; ToolTip.visible: hovered
                onClicked: { chatWindow.visible = true; panel.expanded = false }
            }
        }

        Rectangle { Layout.fillWidth: true; implicitHeight: 1; color: "#30363d" }

        // ── Workspace + provider selectors ──────────────────────────────────
        // ── Toolbar row ─────────────────────────────────────────────────────
        RowLayout {
            spacing: 6
            Layout.fillWidth: true

            ComboBox {
                id: workspaceCombo
                Layout.fillWidth: true
                textRole: "name"
                model: workspaceModel
                font.pixelSize: 11

                background: Rectangle {
                    color: "#0d1117"; radius: 4; border.color: "#30363d"
                }
                contentItem: Text {
                    leftPadding: 6
                    text: workspaceCombo.displayText
                    color: "#c9d1d9"
                    font: workspaceCombo.font
                    verticalAlignment: Text.AlignVCenter
                    elide: Text.ElideRight
                }
            }

            ComboBox {
                id: providerCombo
                Layout.preferredWidth: 110
                model: ["Gemini", "Copilot"]
                font.pixelSize: 11
                background: Rectangle { color: "#0d1117"; radius: 4; border.color: "#30363d" }
                contentItem: Text {
                    leftPadding: 6
                    text: providerCombo.displayText
                    color: "#c9d1d9"
                    font: providerCombo.font
                    verticalAlignment: Text.AlignVCenter
                }
                onCurrentIndexChanged: {
                    var p = currentIndex === 1 ? "copilot" : "gemini"
                    if (p !== panel.provider) {
                        panel.provider = p
                        panel.saveConfig(p, "", "")
                        modelCombo.currentIndex = p === "gemini" ? 4 : 0
                    }
                }
            }
        }

        // ── API key warning ─────────────────────────────────────────────────
        Text {
            visible: !panel.keyConfigured
            text: "\u26A0 No API key configured — click \u2699 to add one"
            color: "#e3b341"
            font.pixelSize: 10
            Layout.fillWidth: true
        }

        // ── Settings panel ──────────────────────────────────────────────────
        Rectangle {
            visible: panel.showSettings
            Layout.fillWidth: true
            Layout.preferredHeight: 94
            color: "#0d1117"
            radius: 6
            border.color: "#30363d"

            ColumnLayout {
                anchors { fill: parent; margins: 8 }
                spacing: 6

                RowLayout {
                    spacing: 6
                    Text {
                        text: "API Key:"
                        color: "#8b949e"
                        font.pixelSize: 11
                        Layout.preferredWidth: 56
                    }
                    TextField {
                        id: apiKeyField
                        Layout.fillWidth: true
                        placeholderText: panel.keyConfigured ? "••••••••••••••••" : "Paste key here"
                        echoMode: TextInput.Password
                        font.pixelSize: 11
                        background: Rectangle { color: "#161b22"; radius: 4; border.color: "#30363d" }
                        color: "#c9d1d9"
                    }
                }
                RowLayout {
                    spacing: 6
                    Text {
                        text: "Model:"
                        color: "#8b949e"
                        font.pixelSize: 11
                        Layout.preferredWidth: 56
                    }
                    ComboBox {
                        id: modelCombo
                        Layout.fillWidth: true
                        model: panel.provider === "gemini" ? panel.geminiModels : panel.copilotModels
                        font.pixelSize: 11
                        background: Rectangle { color: "#161b22"; radius: 4; border.color: "#30363d" }
                        contentItem: Text {
                            leftPadding: 6
                            text: modelCombo.displayText
                            color: "#c9d1d9"
                            font: modelCombo.font
                            verticalAlignment: Text.AlignVCenter
                            elide: Text.ElideRight
                        }
                        Component.onCompleted: currentIndex = panel.provider === "gemini" ? 4 : 0
                        onModelChanged: currentIndex = panel.provider === "gemini" ? 4 : 0
                    }
                    Button {
                        text: "Save"
                        font.pixelSize: 11
                        padding: 4
                        onClicked: {
                            panel.saveConfig(panel.provider, modelCombo.currentText, apiKeyField.text)
                            panel.showSettings = false
                        }
                    }
                }
            }
        }

        // ── Chat message list ────────────────────────────────────────────────
        ScrollView {
            id: chatScroll
            Layout.fillWidth: true
            Layout.fillHeight: true
            clip: true

            ListView {
                id: chatView
                model: messageModel
                spacing: 6
                width: chatScroll.width

                delegate: Item {
                    id: msgItem
                    required property string role
                    required property string content
                    required property bool   isToolCall

                    width: ListView.view ? ListView.view.width : 0
                    height: msgBubble.implicitHeight + 4

                    // Tool call chip
                    Rectangle {
                        visible: msgItem.isToolCall
                        anchors.horizontalCenter: parent.horizontalCenter
                        implicitWidth: chipLabel.implicitWidth + 16
                        height: 20
                        radius: 10
                        color: "#21262d"
                        border.color: "#388bfd"
                        Text {
                            id: chipLabel
                            anchors.centerIn: parent
                            text: "\u25B8 " + msgItem.content
                            color: "#79c0ff"
                            font.pixelSize: 10
                        }
                    }

                    // Chat bubble
                    Rectangle {
                        id: msgBubble
                        visible: !msgItem.isToolCall
                        anchors.right:      msgItem.role === "user" ? parent.right       : undefined
                        anchors.left:       msgItem.role !== "user" ? parent.left        : undefined
                        anchors.rightMargin:  msgItem.role === "user" ? 4  : 0
                        anchors.leftMargin:   msgItem.role !== "user" ? 4  : 0
                        width: Math.min((ListView.view ? ListView.view.width : 300) * 0.82,
                                        msgItem.role === "user" ? msgContent.contentWidth + 32 : (ListView.view ? ListView.view.width : 300) * 0.82)
                        implicitHeight: msgContent.contentHeight + 16
                        radius: 8
                        color: msgItem.role === "user" ? "#1f6feb" : "#21262d"
                        border.color: msgItem.role === "user" ? "#388bfd" : "#30363d"

                        TextEdit {
                            id: msgContent
                            anchors { fill: parent; margins: 8 }
                            text: msgItem.content
                            color: "#c9d1d9"
                            font.pixelSize: 12
                            wrapMode: TextEdit.Wrap
                            readOnly: true
                            selectByMouse: true
                            selectedTextColor: "#0d1117"
                            selectionColor: "#79c0ff"
                            // Suppress the default white background the TextEdit control draws
                            background: null
                        }
                    }
                }
            }
        }

        // ── Input row ────────────────────────────────────────────────────────
        RowLayout {
            spacing: 6
            Layout.fillWidth: true

            TextArea {
                id: chatInput
                Layout.fillWidth: true
                Layout.minimumHeight: 72
                Layout.alignment: Qt.AlignTop
                font.pixelSize: 12
                color: "#c9d1d9"
                leftPadding: 8; rightPadding: 8; topPadding: 6; bottomPadding: 6
                background: Rectangle { color: "#0d1117"; radius: 6; border.color: "#30363d" }
                wrapMode: TextEdit.Wrap

                Text {
                    anchors { left: parent.left; top: parent.top
                              leftMargin: parent.leftPadding; topMargin: parent.topPadding }
                    text: "Ask the AI about your plans…"
                    color: "#6e7681"
                    font.pixelSize: 12
                    visible: parent.text.length === 0
                }
                Keys.onReturnPressed: (event) => {
                    if (event.modifiers & Qt.ShiftModifier) {
                        event.accepted = false
                    } else {
                        event.accepted = true
                        panel.sendMessage(chatInput.text)
                    }
                }
            }

            Button {
                text: "\u2191 Send"
                Layout.alignment: Qt.AlignBottom
                enabled: !panel.busy && chatInput.text.trim() !== ""
                font.pixelSize: 11
                onClicked: panel.sendMessage(chatInput.text)
            }
        }
    }

    // ── Pop-out window ───────────────────────────────────────────────────────
    Window {
        id: chatWindow
        title: "AI Assistant — Project Memory"
        width: 520
        height: 640
        color: "#0f1319"
        Material.theme: Material.Dark
        visible: false

        ColumnLayout {
            anchors { fill: parent; margins: 12 }
            spacing: 8

            // Header
            RowLayout {
                Text {
                    text: "[AI] AI ASSISTANT"
                    color: "#c9d1d9"
                    font { pixelSize: 13; weight: Font.Bold }
                }
                Item { Layout.fillWidth: true }
                ToolButton {
                    text: "\u239A"   // ⎚ clear
                    font.pixelSize: 13; padding: 3
                    ToolTip.text: "Clear chat"; ToolTip.visible: hovered
                    enabled: messageModel.count > 0
                    opacity: enabled ? 1.0 : 0.35
                    onClicked: {
                        messageModel.clear()
                        popoutInput.text = ""
                    }
                }
                Button {
                    text: "Dock"
                    font.pixelSize: 11
                    onClicked: {
                        chatWindow.visible = false
                        panel.expanded = true
                    }
                }
            }

            // Reuse shared messageModel
            ScrollView {
                Layout.fillWidth: true
                Layout.fillHeight: true
                clip: true

                ListView {
                    id: popoutView
                    model: messageModel
                    spacing: 6

                    delegate: Item {
                        id: popoutMsg
                        required property string role
                        required property string content
                        required property bool   isToolCall

                        width: ListView.view ? ListView.view.width : 0
                        height: popoutBubble.height + 4

                        Rectangle {
                            id: popoutBubble
                            visible: !popoutMsg.isToolCall
                            anchors.right:      popoutMsg.role === "user" ? parent.right       : undefined
                            anchors.left:       popoutMsg.role !== "user" ? parent.left        : undefined
                            anchors.rightMargin:  popoutMsg.role === "user" ? 4  : 0
                            anchors.leftMargin:   popoutMsg.role !== "user" ? 4  : 0
                            width: Math.min((ListView.view ? ListView.view.width : 300) * 0.82,
                                            popoutMsg.role === "user" ? popoutText.contentWidth + 32 : (ListView.view ? ListView.view.width : 300) * 0.82)
                            height: popoutText.contentHeight + 16
                            radius: 8
                            color: popoutMsg.role === "user" ? "#1f6feb" : "#21262d"
                            border.color: popoutMsg.role === "user" ? "#388bfd" : "#30363d"
                            TextEdit {
                                id: popoutText
                                anchors { fill: parent; margins: 8 }
                                text: popoutMsg.content
                                color: "#c9d1d9"
                                font.pixelSize: 12
                                wrapMode: TextEdit.Wrap
                                readOnly: true
                                selectByMouse: true
                                selectedTextColor: "#0d1117"
                                selectionColor: "#79c0ff"
                                background: null
                            }
                        }
                    }
                }
            }

            RowLayout {
                spacing: 6
                Layout.fillWidth: true

                TextArea {
                    id: popoutInput
                    Layout.fillWidth: true
                    font.pixelSize: 12
                    color: "#c9d1d9"
                    leftPadding: 8; rightPadding: 8; topPadding: 6; bottomPadding: 6
                    background: Rectangle { color: "#0d1117"; radius: 6; border.color: "#30363d" }
                    wrapMode: TextEdit.Wrap

                    Text {
                        anchors { left: parent.left; top: parent.top
                                  leftMargin: parent.leftPadding; topMargin: parent.topPadding }
                        text: "Ask the AI…"
                        color: "#6e7681"
                        font.pixelSize: 12
                        visible: parent.text.length === 0
                    }
                    Keys.onReturnPressed: (event) => {
                        if (event.modifiers & Qt.ShiftModifier) {
                            event.accepted = false
                        } else {
                            event.accepted = true
                            panel.sendMessage(popoutInput.text)
                            popoutInput.text = ""
                        }
                    }
                }

                Button {
                    text: "\u2191 Send"
                    enabled: !panel.busy && popoutInput.text.trim() !== ""
                    font.pixelSize: 11
                    onClicked: {
                        panel.sendMessage(popoutInput.text)
                        popoutInput.text = ""
                    }
                }
            }
        }
    }
}
