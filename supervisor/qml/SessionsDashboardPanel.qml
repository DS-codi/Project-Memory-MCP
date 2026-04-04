pragma ComponentBehavior: Bound
import QtQuick 2.15
import QtQuick.Controls 2.15
import QtQuick.Controls.Material 2.15
import QtQuick.Layouts 1.15

/// User-defined sessions dashboard — polls GET /admin/user-sessions every 10 seconds.
/// Two-pane layout: left = session list, right = session detail.
Rectangle {
    id: dashPanel
    Material.theme: Material.Dark

    property string mcpBaseUrl: ""
    property int    mcpPort:    0

    color:        "#161b22"
    radius:       10
    border.color: "#30363d"
    Layout.fillWidth: true
    implicitHeight: 520

    // ── State ─────────────────────────────────────────────────────────────────
    property string selectedSessionId: ""
    property var    selectedSession:   null
    property var    agentSessionsMap:  ({})  // id → live agent session entries

    // ── Data model ────────────────────────────────────────────────────────────
    ListModel { id: sessionsList }

    // ── XHR helpers ──────────────────────────────────────────────────────────

    function fetchSessions() {
        if (dashPanel.mcpPort <= 0) return
        var xhr = new XMLHttpRequest()
        xhr.onreadystatechange = function() {
            if (xhr.readyState !== XMLHttpRequest.DONE || xhr.status !== 200) return
            try {
                var resp = JSON.parse(xhr.responseText)
                var items = resp.sessions || []
                sessionsList.clear()
                for (var i = 0; i < items.length; i++) {
                    var s = items[i]
                    sessionsList.append({
                        sid:        s.id,
                        sname:      s.name,
                        pinned:     s.pinned ? true : false,
                        agentCount: (s.linked_agent_session_ids || []).length
                    })
                }
                // Refresh selected session data if one is selected
                if (dashPanel.selectedSessionId !== "") {
                    dashPanel.fetchSelectedSession()
                }
            } catch(e) {}
        }
        xhr.open("GET", dashPanel.mcpBaseUrl + "/admin/user-sessions")
        xhr.send()
    }

    function fetchSelectedSession() {
        if (dashPanel.selectedSessionId === "" || dashPanel.mcpPort <= 0) return
        var xhr = new XMLHttpRequest()
        xhr.onreadystatechange = function() {
            if (xhr.readyState !== XMLHttpRequest.DONE || xhr.status !== 200) return
            try {
                dashPanel.selectedSession = JSON.parse(xhr.responseText)
                dashPanel.fetchAgentSessions()
            } catch(e) {}
        }
        xhr.open("GET", dashPanel.mcpBaseUrl + "/admin/user-sessions/" + dashPanel.selectedSessionId)
        xhr.send()
    }

    function fetchAgentSessions() {
        if (dashPanel.selectedSessionId === "" || dashPanel.mcpPort <= 0) return
        var xhr = new XMLHttpRequest()
        xhr.onreadystatechange = function() {
            if (xhr.readyState !== XMLHttpRequest.DONE || xhr.status !== 200) return
            try {
                var resp = JSON.parse(xhr.responseText)
                var map = {}
                var items = resp.agent_sessions || []
                for (var i = 0; i < items.length; i++) {
                    map[items[i].session_id] = items[i]
                }
                dashPanel.agentSessionsMap = map
            } catch(e) {}
        }
        xhr.open("GET", dashPanel.mcpBaseUrl + "/admin/user-sessions/" + dashPanel.selectedSessionId + "/agent-sessions")
        xhr.send()
    }

    function createSession(name, workingDirs, commands, notes) {
        if (dashPanel.mcpPort <= 0) return
        var xhr = new XMLHttpRequest()
        xhr.onreadystatechange = function() {
            if (xhr.readyState !== XMLHttpRequest.DONE) return
            if (xhr.status === 201) {
                dashPanel.fetchSessions()
            }
        }
        xhr.open("POST", dashPanel.mcpBaseUrl + "/admin/user-sessions")
        xhr.setRequestHeader("Content-Type", "application/json")
        xhr.send(JSON.stringify({
            name:        name,
            working_dirs: workingDirs,
            commands:    commands,
            notes:       notes,
            linked_agent_session_ids: [],
            pinned:      false
        }))
    }

    function saveSession(id, name, workingDirs, commands, notes) {
        if (dashPanel.mcpPort <= 0) return
        var xhr = new XMLHttpRequest()
        xhr.onreadystatechange = function() {
            if (xhr.readyState !== XMLHttpRequest.DONE) return
            if (xhr.status === 200) {
                dashPanel.fetchSessions()
            }
        }
        xhr.open("PUT", dashPanel.mcpBaseUrl + "/admin/user-sessions/" + id)
        xhr.setRequestHeader("Content-Type", "application/json")
        xhr.send(JSON.stringify({
            name:        name,
            working_dirs: workingDirs,
            commands:    commands,
            notes:       notes
        }))
    }

    function togglePin(id, currentlyPinned) {
        if (dashPanel.mcpPort <= 0) return
        var xhr = new XMLHttpRequest()
        xhr.onreadystatechange = function() {
            if (xhr.readyState !== XMLHttpRequest.DONE) return
            if (xhr.status === 200) {
                dashPanel.fetchSessions()
                if (dashPanel.selectedSessionId === id) {
                    dashPanel.fetchSelectedSession()
                }
            }
        }
        xhr.open("PUT", dashPanel.mcpBaseUrl + "/admin/user-sessions/" + id)
        xhr.setRequestHeader("Content-Type", "application/json")
        xhr.send(JSON.stringify({ pinned: !currentlyPinned }))
    }

    function deleteSession(id) {
        if (dashPanel.mcpPort <= 0) return
        var xhr = new XMLHttpRequest()
        xhr.onreadystatechange = function() {
            if (xhr.readyState !== XMLHttpRequest.DONE) return
            if (xhr.status === 204) {
                if (dashPanel.selectedSessionId === id) {
                    dashPanel.selectedSessionId = ""
                    dashPanel.selectedSession   = null
                }
                dashPanel.fetchSessions()
            }
        }
        xhr.open("DELETE", dashPanel.mcpBaseUrl + "/admin/user-sessions/" + id)
        xhr.send()
    }

    function saveNotes(id, notes) {
        if (dashPanel.mcpPort <= 0) return
        var xhr = new XMLHttpRequest()
        xhr.onreadystatechange = function() {
            if (xhr.readyState !== XMLHttpRequest.DONE) return
        }
        xhr.open("PUT", dashPanel.mcpBaseUrl + "/admin/user-sessions/" + id)
        xhr.setRequestHeader("Content-Type", "application/json")
        xhr.send(JSON.stringify({ notes: notes }))
    }

    // ── Polling timer ─────────────────────────────────────────────────────────
    Timer {
        interval: 10000; running: true; repeat: true
        onTriggered: dashPanel.fetchSessions()
    }

    Component.onCompleted: dashPanel.fetchSessions()

    // ── Add/Edit dialog ───────────────────────────────────────────────────────
    Dialog {
        id: sessionDialog
        parent: Overlay.overlay
        anchors.centerIn: parent
        modal: true
        title: editMode ? "Edit Session" : "New Session"
        width: 480

        property bool   editMode: false
        property string editId:   ""

        background: Rectangle {
            color: "#1c2128"; border.color: "#30363d"; border.width: 1; radius: 6
        }

        function openNew() {
            editMode = false
            editId   = ""
            nameField.text     = ""
            dirsArea.text      = ""
            cmdsArea.text      = ""
            notesDialogArea.text = ""
            open()
        }

        function openEdit(session) {
            editMode = true
            editId   = session.id
            nameField.text       = session.name || ""
            dirsArea.text        = (session.working_dirs || []).join("\n")
            cmdsArea.text        = (session.commands || []).join("\n")
            notesDialogArea.text = session.notes || ""
            open()
        }

        ColumnLayout {
            spacing: 10
            width: parent.width

            Label { text: "Name"; color: "#8b949e"; font.pixelSize: 11 }
            TextField {
                id: nameField
                Layout.fillWidth: true
                placeholderText: "Session name"
                color: "#c9d1d9"
                background: Rectangle { color: "#0d1117"; border.color: "#30363d"; radius: 4 }
            }

            Label { text: "Working Directories (one per line)"; color: "#8b949e"; font.pixelSize: 11 }
            Rectangle {
                Layout.fillWidth: true; Layout.preferredHeight: 80
                color: "#0d1117"; border.color: "#30363d"; radius: 4
                ScrollView {
                    anchors.fill: parent; anchors.margins: 2
                    TextArea {
                        id: dirsArea
                        wrapMode: TextEdit.NoWrap
                        color: "#c9d1d9"
                        font.family: "Consolas"; font.pixelSize: 12
                        background: Item {}
                        placeholderText: "C:\\path\\to\\project"
                    }
                }
            }

            Label { text: "Commands (one per line)"; color: "#8b949e"; font.pixelSize: 11 }
            Rectangle {
                Layout.fillWidth: true; Layout.preferredHeight: 80
                color: "#0d1117"; border.color: "#30363d"; radius: 4
                ScrollView {
                    anchors.fill: parent; anchors.margins: 2
                    TextArea {
                        id: cmdsArea
                        wrapMode: TextEdit.NoWrap
                        color: "#c9d1d9"
                        font.family: "Consolas"; font.pixelSize: 12
                        background: Item {}
                        placeholderText: "npm run dev"
                    }
                }
            }

            Label { text: "Notes"; color: "#8b949e"; font.pixelSize: 11 }
            Rectangle {
                Layout.fillWidth: true; Layout.preferredHeight: 60
                color: "#0d1117"; border.color: "#30363d"; radius: 4
                ScrollView {
                    anchors.fill: parent; anchors.margins: 2
                    TextArea {
                        id: notesDialogArea
                        wrapMode: TextEdit.Wrap
                        color: "#c9d1d9"
                        font.pixelSize: 12
                        background: Item {}
                    }
                }
            }
        }

        standardButtons: Dialog.NoButton

        footer: RowLayout {
            spacing: 8
            Item { Layout.fillWidth: true }
            Button {
                text: "Cancel"
                onClicked: sessionDialog.close()
            }
            Button {
                text: sessionDialog.editMode ? "Save" : "Create"
                highlighted: true
                onClicked: {
                    var name = nameField.text.trim()
                    if (name === "") return
                    var dirs = dirsArea.text.split("\n").map(function(s) { return s.trim() }).filter(function(s) { return s !== "" })
                    var cmds = cmdsArea.text.split("\n").map(function(s) { return s.trim() }).filter(function(s) { return s !== "" })
                    var notes = notesDialogArea.text
                    if (sessionDialog.editMode) {
                        dashPanel.saveSession(sessionDialog.editId, name, dirs, cmds, notes)
                    } else {
                        dashPanel.createSession(name, dirs, cmds, notes)
                    }
                    sessionDialog.close()
                }
            }
        }
    }

    // ── Delete confirm dialog ─────────────────────────────────────────────────
    Dialog {
        id: deleteConfirmDialog
        parent: Overlay.overlay
        anchors.centerIn: parent
        modal: true
        title: "Delete Session?"
        property string targetId:   ""
        property string targetName: ""

        background: Rectangle {
            color: "#1c2128"; border.color: "#f85149"; border.width: 1; radius: 6
        }

        Label {
            text: "Delete \"" + deleteConfirmDialog.targetName + "\"? This cannot be undone."
            color: "#c9d1d9"; wrapMode: Text.WordWrap; width: 300
        }

        standardButtons: Dialog.NoButton
        footer: RowLayout {
            spacing: 8
            Item { Layout.fillWidth: true }
            Button { text: "Cancel"; onClicked: deleteConfirmDialog.close() }
            Button {
                text: "Delete"
                Material.background: "#3a0e0e"
                Material.foreground: "#f85149"
                onClicked: {
                    dashPanel.deleteSession(deleteConfirmDialog.targetId)
                    deleteConfirmDialog.close()
                }
            }
        }
    }

    // ── Main layout ───────────────────────────────────────────────────────────
    RowLayout {
        anchors.fill: parent
        anchors.margins: 10
        spacing: 10

        // ── LEFT PANE — session list ──────────────────────────────────────────
        ColumnLayout {
            Layout.preferredWidth: 220
            Layout.fillHeight: true
            spacing: 6

            // Header row
            RowLayout {
                Layout.fillWidth: true
                spacing: 6
                Label {
                    text: "MY SESSIONS"
                    font.pixelSize: 10; font.letterSpacing: 1.0; color: "#8b949e"
                    Layout.fillWidth: true
                }
                Rectangle {
                    Layout.preferredWidth: 22; Layout.preferredHeight: 16; radius: 8
                    color: "#21262d"
                    Label {
                        anchors.centerIn: parent
                        text: sessionsList.count
                        font.pixelSize: 9; color: "#58a6ff"
                    }
                }
            }

            Rectangle { Layout.fillWidth: true; Layout.preferredHeight: 1; color: "#30363d" }

            // Session list
            ScrollView {
                Layout.fillWidth: true
                Layout.fillHeight: true
                clip: true
                contentWidth: availableWidth

                ColumnLayout {
                    width: parent.width
                    spacing: 2

                    Repeater {
                        id: sessionsRepeater
                        model: sessionsList
                        delegate: Rectangle {
                            id: sessionRow
                            required property string  sid
                            required property string  sname
                            required property bool    pinned
                            required property int     agentCount

                            Layout.fillWidth: true
                            implicitHeight: 34
                            radius: 4
                            color: dashPanel.selectedSessionId === sessionRow.sid
                                   ? "#21262d" : "transparent"

                            MouseArea {
                                anchors.fill: parent
                                onClicked: {
                                    dashPanel.selectedSessionId = sessionRow.sid
                                    dashPanel.fetchSelectedSession()
                                }
                            }

                            RowLayout {
                                anchors.fill: parent
                                anchors.leftMargin: 6
                                anchors.rightMargin: 6
                                spacing: 4

                                // Pin indicator
                                Label {
                                    visible: sessionRow.pinned
                                    text: "\uD83D\uDCCC"
                                    font.pixelSize: 10
                                }

                                // Session name
                                Label {
                                    text: sessionRow.sname
                                    font.pixelSize: 12
                                    color: dashPanel.selectedSessionId === sessionRow.sid
                                           ? "#58a6ff" : "#c9d1d9"
                                    elide: Text.ElideRight
                                    Layout.fillWidth: true
                                }

                                // Agent count badge
                                Rectangle {
                                    visible: sessionRow.agentCount > 0
                                    Layout.preferredWidth: 18; Layout.preferredHeight: 14; radius: 7
                                    color: "#0e2318"
                                    Label {
                                        anchors.centerIn: parent
                                        text: sessionRow.agentCount
                                        font.pixelSize: 9; color: "#3fb950"
                                    }
                                }
                            }
                        }
                    }

                    Label {
                        visible: sessionsRepeater.count === 0
                        text: "No sessions yet"
                        color: "#8b949e"; font.pixelSize: 12
                        Layout.fillWidth: true
                    }
                }
            }

            // New Session button
            Button {
                Layout.fillWidth: true
                text: "+ New Session"
                font.pixelSize: 12
                highlighted: true
                onClicked: sessionDialog.openNew()
            }
        }

        // Separator
        Rectangle {
            Layout.preferredWidth: 1
            Layout.fillHeight: true
            color: "#30363d"
        }

        // ── RIGHT PANE — session detail ───────────────────────────────────────
        Item {
            Layout.fillWidth: true
            Layout.fillHeight: true

            // Placeholder when nothing selected
            Label {
                visible: dashPanel.selectedSession === null
                anchors.centerIn: parent
                text: "Select a session to view details"
                color: "#8b949e"; font.pixelSize: 13
            }

            // Detail view
            ColumnLayout {
                visible: dashPanel.selectedSession !== null
                anchors.fill: parent
                spacing: 8

                // ── Detail header ─────────────────────────────────────────────
                RowLayout {
                    Layout.fillWidth: true
                    spacing: 8

                    Label {
                        text: dashPanel.selectedSession ? dashPanel.selectedSession.name : ""
                        font.pixelSize: 15; font.bold: true; color: "#c9d1d9"
                        Layout.fillWidth: true
                        elide: Text.ElideRight
                    }

                    // Pin button
                    Button {
                        text: (dashPanel.selectedSession && dashPanel.selectedSession.pinned)
                              ? "Unpin" : "Pin"
                        font.pixelSize: 11
                        implicitHeight: 26
                        leftPadding: 8; rightPadding: 8
                        onClicked: {
                            if (dashPanel.selectedSession) {
                                dashPanel.togglePin(dashPanel.selectedSession.id, dashPanel.selectedSession.pinned)
                            }
                        }
                    }

                    // Edit button
                    Button {
                        text: "Edit"
                        font.pixelSize: 11
                        implicitHeight: 26
                        leftPadding: 8; rightPadding: 8
                        onClicked: {
                            if (dashPanel.selectedSession) {
                                sessionDialog.openEdit(dashPanel.selectedSession)
                            }
                        }
                    }

                    // Delete button
                    Button {
                        text: "Delete"
                        font.pixelSize: 11
                        implicitHeight: 26
                        leftPadding: 8; rightPadding: 8
                        Material.background: "#3a0e0e"
                        Material.foreground: "#f85149"
                        onClicked: {
                            if (dashPanel.selectedSession) {
                                deleteConfirmDialog.targetId   = dashPanel.selectedSession.id
                                deleteConfirmDialog.targetName = dashPanel.selectedSession.name
                                deleteConfirmDialog.open()
                            }
                        }
                    }
                }

                Rectangle { Layout.fillWidth: true; Layout.preferredHeight: 1; color: "#30363d" }

                // ── Scrollable detail body ────────────────────────────────────
                ScrollView {
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    clip: true
                    contentWidth: availableWidth

                    ColumnLayout {
                        id: detailBody
                        width: parent.width
                        spacing: 12

                        // Working Directories
                        ColumnLayout {
                            Layout.fillWidth: true
                            spacing: 4
                            visible: dashPanel.selectedSession !== null &&
                                     dashPanel.selectedSession.working_dirs !== undefined &&
                                     dashPanel.selectedSession.working_dirs.length > 0

                            Label {
                                text: "WORKING DIRECTORIES"
                                font.pixelSize: 10; font.letterSpacing: 1.0; color: "#8b949e"
                            }

                            Repeater {
                                model: dashPanel.selectedSession ? dashPanel.selectedSession.working_dirs : []
                                delegate: RowLayout {
                                    id: dirRow
                                    required property string modelData
                                    Layout.fillWidth: true
                                    spacing: 4

                                    Rectangle {
                                        Layout.fillWidth: true
                                        implicitHeight: 26
                                        color: "#0d1117"; radius: 4; border.color: "#30363d"
                                        Label {
                                            anchors.fill: parent; anchors.leftMargin: 6; anchors.rightMargin: 6
                                            text: dirRow.modelData
                                            font.family: "Consolas"; font.pixelSize: 11
                                            color: "#c9d1d9"; elide: Text.ElideMiddle
                                            verticalAlignment: Text.AlignVCenter
                                        }
                                    }

                                    Button {
                                        text: "Copy"
                                        font.pixelSize: 10
                                        implicitHeight: 24; leftPadding: 6; rightPadding: 6
                                        ToolTip.visible: hovered
                                        ToolTip.text: "Copy path to clipboard"
                                        ToolTip.delay: 400
                                        onClicked: {
                                            clipboardHelper.text = dirRow.modelData
                                            clipboardHelper.selectAll()
                                            clipboardHelper.copy()
                                        }
                                    }
                                }
                            }
                        }

                        // Commands
                        ColumnLayout {
                            Layout.fillWidth: true
                            spacing: 4
                            visible: dashPanel.selectedSession !== null &&
                                     dashPanel.selectedSession.commands !== undefined &&
                                     dashPanel.selectedSession.commands.length > 0

                            Label {
                                text: "COMMANDS"
                                font.pixelSize: 10; font.letterSpacing: 1.0; color: "#8b949e"
                            }

                            Repeater {
                                model: dashPanel.selectedSession ? dashPanel.selectedSession.commands : []
                                delegate: RowLayout {
                                    id: cmdRow
                                    required property string modelData
                                    Layout.fillWidth: true
                                    spacing: 4

                                    Rectangle {
                                        Layout.fillWidth: true
                                        implicitHeight: 26
                                        color: "#0d1117"; radius: 4; border.color: "#21262d"
                                        Label {
                                            anchors.fill: parent; anchors.leftMargin: 6; anchors.rightMargin: 6
                                            text: cmdRow.modelData
                                            font.family: "Consolas"; font.pixelSize: 11
                                            color: "#79c0ff"; elide: Text.ElideRight
                                            verticalAlignment: Text.AlignVCenter
                                        }
                                    }

                                    Button {
                                        text: "Copy"
                                        font.pixelSize: 10
                                        implicitHeight: 24; leftPadding: 6; rightPadding: 6
                                        ToolTip.visible: hovered
                                        ToolTip.text: "Copy command to clipboard"
                                        ToolTip.delay: 400
                                        onClicked: {
                                            clipboardHelper.text = cmdRow.modelData
                                            clipboardHelper.selectAll()
                                            clipboardHelper.copy()
                                        }
                                    }
                                }
                            }
                        }

                        // Notes
                        ColumnLayout {
                            Layout.fillWidth: true
                            spacing: 4

                            Label {
                                text: "NOTES"
                                font.pixelSize: 10; font.letterSpacing: 1.0; color: "#8b949e"
                            }

                            Rectangle {
                                Layout.fillWidth: true
                                implicitHeight: 80
                                color: "#0d1117"; radius: 4; border.color: "#30363d"
                                ScrollView {
                                    anchors.fill: parent; anchors.margins: 2
                                    TextArea {
                                        id: notesArea
                                        wrapMode: TextEdit.Wrap
                                        color: "#c9d1d9"; font.pixelSize: 12
                                        background: Item {}
                                        text: dashPanel.selectedSession ? (dashPanel.selectedSession.notes || "") : ""
                                        onEditingFinished: {
                                            if (dashPanel.selectedSession) {
                                                dashPanel.saveNotes(dashPanel.selectedSession.id, text)
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        // Linked Agent Sessions
                        ColumnLayout {
                            Layout.fillWidth: true
                            spacing: 4
                            visible: dashPanel.selectedSession !== null &&
                                     dashPanel.selectedSession.linked_agent_session_ids !== undefined &&
                                     dashPanel.selectedSession.linked_agent_session_ids.length > 0

                            Label {
                                text: "LINKED AGENT SESSIONS"
                                font.pixelSize: 10; font.letterSpacing: 1.0; color: "#8b949e"
                            }

                            Repeater {
                                model: dashPanel.selectedSession ? dashPanel.selectedSession.linked_agent_session_ids : []
                                delegate: RowLayout {
                                    id: agentRow
                                    required property string modelData
                                    Layout.fillWidth: true
                                    spacing: 6

                                    // Live status dot
                                    Rectangle {
                                        Layout.preferredWidth: 8; Layout.preferredHeight: 8; radius: 4
                                        color: (dashPanel.agentSessionsMap[agentRow.modelData] &&
                                                dashPanel.agentSessionsMap[agentRow.modelData].live)
                                               ? "#3fb950" : "#8b949e"
                                    }

                                    Label {
                                        text: agentRow.modelData.slice(0, 20)
                                        font.family: "Consolas"; font.pixelSize: 11
                                        color: "#c9d1d9"; Layout.fillWidth: true
                                        elide: Text.ElideRight
                                    }

                                    Label {
                                        text: (dashPanel.agentSessionsMap[agentRow.modelData] &&
                                               dashPanel.agentSessionsMap[agentRow.modelData].live)
                                              ? (dashPanel.agentSessionsMap[agentRow.modelData].agentType || "LIVE")
                                              : "offline"
                                        font.pixelSize: 10
                                        color: (dashPanel.agentSessionsMap[agentRow.modelData] &&
                                                dashPanel.agentSessionsMap[agentRow.modelData].live)
                                               ? "#3fb950" : "#8b949e"
                                    }
                                }
                            }
                        }

                    } // end detailBody ColumnLayout
                } // end ScrollView
            } // end detail ColumnLayout
        } // end right pane Item
    } // end main RowLayout

    // Hidden TextEdit used as clipboard helper
    TextEdit {
        id: clipboardHelper
        visible: false
        text: ""
    }
}
