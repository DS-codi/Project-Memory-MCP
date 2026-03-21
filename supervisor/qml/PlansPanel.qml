pragma ComponentBehavior: Bound
import QtQuick 2.15
import QtQuick.Controls 2.15
import QtQuick.Controls.Material 2.15
import QtQuick.Layouts 1.15

/// Plans side panel — collapses to a 44px strip on the left edge.
/// Expands to show tabbed plan lists (Active / All) for a selected workspace.
Rectangle {
    id: panel
    Material.theme: Material.Dark

    property string mcpBaseUrl:  ""
    property string dashBaseUrl: ""
    property string guiBaseUrl:  "http://127.0.0.1:3464"
    property int    mcpPort:     0
    /// Bridge object passed from main.qml — used by toolbar actions that call
    /// Rust invokables (e.g. openInIde).  Optional; buttons are disabled when null.
    property var    bridge:      null
    /// Currently selected agent provider for per-plan "Launch Agent" button.
    /// 0 = Gemini, 1 = Claude CLI
    property int    selectedProvider: 0

    property bool   expanded:   false
    property int    currentTab: 0   // 0 = Active, 1 = All Plans
    property int    expandedPanelWidth: 460

    color:        "#161b22"
    radius:       0
    border.color: expanded ? "#388bfd" : "#30363d"
    border.width: 1
    Layout.fillHeight: true
    implicitWidth: expanded ? expandedPanelWidth : 44

    // Guard prevents the Behavior from animating the initial 0 → 44 transition
    // that occurs during component construction, which caused a startup layout flash.
    property bool _animReady: false
    Component.onCompleted: _animReady = true

    Behavior on implicitWidth { enabled: panel._animReady; NumberAnimation { duration: 200; easing.type: Easing.OutCubic } }
    Behavior on border.color  { ColorAnimation  { duration: 120 } }

    // ── Data ────────────────────────────────────────────────────────────────
    ListModel { id: workspacesModel }
    ListModel { id: plansModel }

    // Hidden helper for clipboard writes
    TextEdit { id: clipHelper; visible: false; width: 0; height: 0 }
    function copyToClipboard(txt) {
        clipHelper.text = txt
        clipHelper.selectAll()
        clipHelper.copy()
    }

    // ── Register Workspace popup ─────────────────────────────────────────────
    Popup {
        id: registerWsPopup
        x: 10; y: 50
        width: panel.width - 20
        padding: 16
        modal: true
        focus: true
        Material.theme: Material.Dark
        background: Rectangle { color: "#161b22"; border.color: "#30363d"; border.width: 1; radius: 6 }
        ColumnLayout {
            width: parent.width
            spacing: 10
            Label { text: "Register Workspace"; font.pixelSize: 13; font.bold: true; color: "#c9d1d9" }
            Label { text: "Enter the full path to the workspace folder:"; font.pixelSize: 11; color: "#8b949e"; wrapMode: Text.WordWrap; Layout.fillWidth: true }
            TextField {
                id: registerWsPathField
                Layout.fillWidth: true
                placeholderText: "C:\\path\\to\\workspace"
                font.pixelSize: 11
                Material.theme: Material.Dark
            }
            RowLayout {
                Layout.fillWidth: true
                spacing: 8
                Item { Layout.fillWidth: true }
                Button {
                    text: "Cancel"; font.pixelSize: 11; implicitHeight: 28; leftPadding: 12; rightPadding: 12
                    onClicked: registerWsPopup.close()
                }
                Button {
                    text: "Register"; highlighted: true; font.pixelSize: 11; implicitHeight: 28; leftPadding: 12; rightPadding: 12
                    enabled: registerWsPathField.text.trim() !== ""
                    onClicked: {
                        if (panel.bridge) panel.bridge.registerWorkspace(registerWsPathField.text.trim())
                        registerWsPopup.close()
                    }
                }
            }
        }
    }

    // ── Backup Plans popup ───────────────────────────────────────────────────
    Popup {
        id: backupPlansPopup
        x: 10; y: 50
        width: panel.width - 20
        padding: 16
        modal: true
        focus: true
        Material.theme: Material.Dark
        background: Rectangle { color: "#161b22"; border.color: "#30363d"; border.width: 1; radius: 6 }
        ColumnLayout {
            width: parent.width
            spacing: 10
            Label { text: "Backup Plans"; font.pixelSize: 13; font.bold: true; color: "#c9d1d9" }
            Label { text: "Output directory for JSON backup files:"; font.pixelSize: 11; color: "#8b949e"; wrapMode: Text.WordWrap; Layout.fillWidth: true }
            TextField {
                id: backupDirField
                Layout.fillWidth: true
                text: ""
                placeholderText: "C:\\Users\\User\\Desktop\\plans-backup"
                font.pixelSize: 11
                Material.theme: Material.Dark
            }
            RowLayout {
                Layout.fillWidth: true
                spacing: 8
                Item { Layout.fillWidth: true }
                Button {
                    text: "Cancel"; font.pixelSize: 11; implicitHeight: 28; leftPadding: 12; rightPadding: 12
                    onClicked: backupPlansPopup.close()
                }
                Button {
                    text: "Backup"; highlighted: true; font.pixelSize: 11; implicitHeight: 28; leftPadding: 12; rightPadding: 12
                    enabled: backupDirField.text.trim() !== "" && workspacesModel.count > 0
                    onClicked: {
                        if (panel.bridge && workspacesModel.count > 0) {
                            panel.bridge.backupWorkspacePlans(
                                workspacesModel.get(workspaceCombo.currentIndex).wsId,
                                backupDirField.text.trim()
                            )
                        }
                        backupPlansPopup.close()
                    }
                }
            }
        }
    }

    // ── Create Plan from Prompt popup ────────────────────────────────────────
    Popup {
        id: createPlanPopup
        x: 10; y: 50
        width: panel.width - 20
        padding: 16
        modal: true
        focus: true
        Material.theme: Material.Dark
        background: Rectangle { color: "#161b22"; border.color: "#30363d"; border.width: 1; radius: 6 }
        ColumnLayout {
            width: parent.width
            spacing: 10
            Label { text: "Create Plan from Prompt"; font.pixelSize: 13; font.bold: true; color: "#c9d1d9" }
            Label { text: "Describe the feature or task for the AI agent to plan:"; font.pixelSize: 11; color: "#8b949e"; wrapMode: Text.WordWrap; Layout.fillWidth: true }
            TextArea {
                id: createPlanPromptField
                Layout.fillWidth: true
                implicitHeight: 80
                placeholderText: "e.g. Add a dark-mode toggle to the settings panel..."
                font.pixelSize: 11
                wrapMode: TextArea.Wrap
                Material.theme: Material.Dark
                background: Rectangle { color: "#0d1117"; border.color: "#30363d"; border.width: 1; radius: 4 }
            }
            RowLayout {
                Layout.fillWidth: true
                spacing: 8
                Item { Layout.fillWidth: true }
                Button {
                    text: "Cancel"; font.pixelSize: 11; implicitHeight: 28; leftPadding: 12; rightPadding: 12
                    onClicked: createPlanPopup.close()
                }
                Button {
                    text: "Start Agent"; highlighted: true; font.pixelSize: 11; implicitHeight: 28; leftPadding: 12; rightPadding: 12
                    enabled: createPlanPromptField.text.trim() !== "" && workspacesModel.count > 0
                    onClicked: {
                        if (panel.bridge && workspacesModel.count > 0) {
                            panel.bridge.createPlanFromPrompt(
                                createPlanPromptField.text.trim(),
                                workspacesModel.get(workspaceCombo.currentIndex).wsId
                            )
                        }
                        createPlanPromptField.text = ""
                        createPlanPopup.close()
                    }
                }
            }
        }
    }

    onExpandedChanged: {
        if (expanded) {
            if (workspacesModel.count === 0) fetchWorkspaces()
            else fetchPlans()
        }
    }

    onCurrentTabChanged: { if (panel.expanded) fetchPlans() }

    Timer {
        interval: 15000; running: panel.expanded; repeat: true
        onTriggered: panel.fetchPlans()
    }

    function fetchWorkspaces() {
        if (panel.mcpPort <= 0) return
        var xhr = new XMLHttpRequest()
        xhr.onreadystatechange = function() {
            if (xhr.readyState !== XMLHttpRequest.DONE || xhr.status !== 200) return
            try {
                var raw = JSON.parse(xhr.responseText)
                workspacesModel.clear()
                for (var i = 0; i < raw.workspaces.length; i++) {
                    workspacesModel.append({
                        wsId:   raw.workspaces[i].id,
                        wsName: raw.workspaces[i].name || raw.workspaces[i].id
                    })
                }
                if (workspacesModel.count > 0) {
                    workspaceCombo.currentIndex = 0
                    fetchPlans()
                }
            } catch(e) { console.error('[PlansPanel] fetchWorkspaces failed:', e) }
        }
        xhr.open("GET", panel.mcpBaseUrl + "/admin/workspaces")
        xhr.send()
    }

    function fetchPlans() {
        if (panel.mcpPort <= 0 || workspaceCombo.currentIndex < 0 || workspacesModel.count === 0) return
        var wsId   = workspacesModel.get(workspaceCombo.currentIndex).wsId
        var filter = panel.currentTab === 0 ? "&status=active" : "&status=all"
        var xhr = new XMLHttpRequest()
        xhr.onreadystatechange = function() {
            if (xhr.readyState !== XMLHttpRequest.DONE || xhr.status !== 200) return
            try {
                var raw = JSON.parse(xhr.responseText)
                plansModel.clear()
                for (var i = 0; i < raw.plans.length; i++) {
                    var p = raw.plans[i]
                    plansModel.append({
                        planId:           p.id,
                        planTitle:        p.title,
                        planStatus:       p.status,
                        planCategory:     p.category              || "",
                        stepsDone:        p.steps_done            || 0,
                        stepsTotal:       p.steps_total           || 0,
                        workspaceId:      p.workspace_id          || wsId,
                        nextStepTask:     p.next_step_task        || "",
                        nextStepPhase:    p.next_step_phase       || "",
                        nextStepAgent:    p.next_step_agent       || "",
                        nextStepStatus:   p.next_step_status      || "",
                        recommendedAgent: p.recommended_next_agent || ""
                    })
                }
            } catch(e) { console.error('[PlansPanel] fetchPlans failed:', e) }
        }
        xhr.open("GET", panel.mcpBaseUrl + "/admin/plans?workspace_id=" + wsId + filter)
        xhr.send()
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
                text: "\u25BA"   // ► open
                font.pixelSize: 14
                padding: 4
                ToolTip.text: "Open Plans"
                ToolTip.visible: hovered
                onClicked: panel.expanded = true
            }
            Label {
                anchors.horizontalCenter: parent.horizontalCenter
                text: "PLANS"
                font.pixelSize: 9
                color: "#8b949e"
                font.letterSpacing: 1.5
                rotation: 90
            }
        }
    }

    // ── Expanded panel ───────────────────────────────────────────────────────
    ColumnLayout {
        visible: panel.expanded
        anchors.fill: parent
        spacing: 0

        // ── Header row ──────────────────────────────────────────────────────
        RowLayout {
            Layout.fillWidth: true
            Layout.topMargin: 10
            Layout.leftMargin: 10
            Layout.rightMargin: 6
            spacing: 6

            Label {
                text: "PLANS"
                font.pixelSize: 11; font.bold: true; font.letterSpacing: 1.2
                color: "#c9d1d9"
            }
            Item { Layout.fillWidth: true }
            ComboBox {
                id: workspaceCombo
                Layout.preferredWidth: 160
                implicitHeight: 26
                font.pixelSize: 11
                model: workspacesModel
                textRole: "wsName"
                onCurrentIndexChanged: panel.fetchPlans()
            }
            ToolButton {
                text: "\u21BB"
                implicitWidth: 26; implicitHeight: 26
                font.pixelSize: 14
                ToolTip.visible: hovered; ToolTip.text: "Refresh"
                onClicked: panel.fetchPlans()
            }
            ToolButton {
                text: "\u25C4"   // ◄ close
                implicitWidth: 26; implicitHeight: 26
                font.pixelSize: 14
                ToolTip.visible: hovered; ToolTip.text: "Close"
                onClicked: panel.expanded = false
            }
        }

        // ── Toolbar ─────────────────────────────────────────────────────────
        RowLayout {
            Layout.fillWidth: true
            Layout.leftMargin: 10
            Layout.rightMargin: 10
            Layout.topMargin: 4
            spacing: 5

            Button {
                text: "Open in IDE"
                highlighted: true
                implicitHeight: 26
                leftPadding: 10; rightPadding: 10
                font.pixelSize: 10
                enabled: panel.bridge !== null
                         && workspacesModel.count > 0
                         && workspaceCombo.currentIndex >= 0
                ToolTip.visible: hovered; ToolTip.text: "Open workspace in VS Code"
                onClicked: {
                    if (panel.bridge && workspacesModel.count > 0) {
                        panel.bridge.openInIde(
                            workspacesModel.get(workspaceCombo.currentIndex).wsId
                        )
                    }
                }
            }
            Button {
                text: "Register WS"
                implicitHeight: 26
                leftPadding: 10; rightPadding: 10
                font.pixelSize: 10
                enabled: panel.bridge !== null
                ToolTip.visible: hovered; ToolTip.text: "Register a workspace with the MCP server"
                onClicked: registerWsPopup.open()
            }
            Button {
                text: "Backup"
                implicitHeight: 26
                leftPadding: 10; rightPadding: 10
                font.pixelSize: 10
                enabled: panel.bridge !== null
                         && workspacesModel.count > 0
                         && workspaceCombo.currentIndex >= 0
                ToolTip.visible: hovered; ToolTip.text: "Backup all plans for this workspace to JSON"
                onClicked: backupPlansPopup.open()
            }
            Button {
                text: "Create Plan"
                implicitHeight: 26
                leftPadding: 10; rightPadding: 10
                font.pixelSize: 10
                enabled: panel.bridge !== null
                         && workspacesModel.count > 0
                         && workspaceCombo.currentIndex >= 0
                ToolTip.visible: hovered; ToolTip.text: "Create a new plan from a prompt using an AI agent"
                onClicked: createPlanPopup.open()
            }

            Item { Layout.fillWidth: true }

            // Provider selector for Launch Agent buttons
            ComboBox {
                id: providerCombo
                model: ["Gemini", "Claude CLI"]
                implicitHeight: 26
                implicitWidth: 92
                font.pixelSize: 10
                ToolTip.visible: hovered; ToolTip.text: "Agent provider for Launch"
                onCurrentIndexChanged: panel.selectedProvider = currentIndex
            }
        }

        // ── Tab bar ─────────────────────────────────────────────────────────
        TabBar {
            id: tabBar
            Layout.fillWidth: true
            Layout.leftMargin: 10
            Layout.rightMargin: 10
            Layout.topMargin: 6
            currentIndex: panel.currentTab
            onCurrentIndexChanged: panel.currentTab = currentIndex

            TabButton {
                text: "Active"
                font.pixelSize: 11
                implicitHeight: 28
            }
            TabButton {
                text: "All Plans"
                font.pixelSize: 11
                implicitHeight: 28
            }
        }

        // ── Plans list (expandable cards) ───────────────────────────────────
        ScrollView {
            Layout.fillWidth: true
            Layout.fillHeight: true
            Layout.leftMargin: 8; Layout.rightMargin: 8
            Layout.topMargin: 6
            clip: true
            contentWidth:  availableWidth
            contentHeight: scrollContent.implicitHeight

            ColumnLayout {
                id: scrollContent
                width: parent.width
                spacing: 6

                Repeater {
                    id: plansRepeater
                    model: plansModel

                    // Each card is a ColumnLayout: fixed-height header + animated detail.
                    // The header NEVER has implicitHeight 0 so ScrollView always sees content.
                    delegate: ColumnLayout {
                        id: planCard
                        required property string planId
                        required property string planTitle
                        required property string planStatus
                        required property string planCategory
                        required property int    stepsDone
                        required property int    stepsTotal
                        required property string workspaceId
                        required property string nextStepTask
                        required property string nextStepPhase
                        required property string nextStepAgent
                        required property string nextStepStatus
                        required property string recommendedAgent

                        Layout.fillWidth: true
                        spacing: 0
                        property bool cardExpanded: false

                        // ── Header strip (always 54 px — never zero) ───────
                        Rectangle {
                            Layout.fillWidth: true
                            implicitHeight: 54
                            radius: planCard.cardExpanded ? 0 : 6
                            color: planCard.cardExpanded ? "#1c2128" : "#0d1117"
                            border.color: planCard.cardExpanded ? "#388bfd" : "#30363d"
                            border.width: 1
                            clip: true

                            Behavior on color       { ColorAnimation { duration: 100 } }
                            Behavior on border.color { ColorAnimation { duration: 100 } }

                            MouseArea {
                                anchors.fill: parent
                                cursorShape: Qt.PointingHandCursor
                                onClicked: planCard.cardExpanded = !planCard.cardExpanded
                            }

                            ColumnLayout {
                                anchors {
                                    left: parent.left; right: parent.right
                                    top: parent.top; bottom: parent.bottom
                                    leftMargin: 10; rightMargin: 10
                                    topMargin: 7; bottomMargin: 7
                                }
                                spacing: 5

                                RowLayout {
                                    Layout.fillWidth: true
                                    spacing: 6

                                    Label {
                                        text: planCard.cardExpanded ? "-" : "+"
                                        font.pixelSize: 11; color: "#8b949e"
                                        Layout.preferredWidth: 12
                                    }
                                    Label {
                                        text: planCard.planTitle
                                        font.pixelSize: 13; color: "#c9d1d9"
                                        Layout.fillWidth: true
                                        elide: Text.ElideRight
                                    }
                                    Label {
                                        visible: planCard.stepsTotal > 0
                                        text: planCard.stepsDone + "/" + planCard.stepsTotal
                                        font.pixelSize: 11; color: "#8b949e"
                                    }
                                    Rectangle {
                                        implicitWidth: 60; implicitHeight: 20; radius: 9
                                        color: planCard.planStatus === "active"  ? "#0e2318" :
                                               planCard.planStatus === "paused"  ? "#1f1a0e" :
                                               planCard.planStatus === "blocked" ? "#2d0f0f" : "#21262d"
                                        Label {
                                            anchors.centerIn: parent
                                            text: planCard.planStatus.toUpperCase()
                                            font.pixelSize: 10; font.bold: true
                                            color: planCard.planStatus === "active"  ? "#3fb950" :
                                                   planCard.planStatus === "paused"  ? "#d29922" :
                                                   planCard.planStatus === "blocked" ? "#f85149" : "#8b949e"
                                        }
                                    }
                                }

                                ProgressBar {
                                    visible: planCard.stepsTotal > 0
                                    Layout.fillWidth: true
                                    implicitHeight: 3
                                    value: planCard.stepsTotal > 0
                                           ? planCard.stepsDone / planCard.stepsTotal : 0
                                }
                            }
                        }

                        // ── Expanded detail (animates height, starts at 0) ─
                        Rectangle {
                            Layout.fillWidth: true
                            implicitHeight: planCard.cardExpanded
                                            ? (detailLayout.implicitHeight + 20) : 0
                            clip: true
                            color: "#1c2128"
                            border.color: "#388bfd"; border.width: 1

                            Behavior on implicitHeight {
                                NumberAnimation { duration: 180; easing.type: Easing.OutCubic }
                            }

                            ColumnLayout {
                                id: detailLayout
                                anchors {
                                    left: parent.left; right: parent.right; top: parent.top
                                    leftMargin: 12; rightMargin: 12; topMargin: 10
                                }
                                spacing: 8

                                // Category + next-agent badge
                                RowLayout {
                                    Layout.fillWidth: true; spacing: 8
                                    visible: planCard.planCategory !== "" || planCard.recommendedAgent !== ""

                                    Label {
                                        visible: planCard.planCategory !== ""
                                        text: planCard.planCategory.toUpperCase()
                                        font.pixelSize: 10; font.letterSpacing: 0.8; color: "#58a6ff"
                                    }
                                    Rectangle {
                                        visible: planCard.planCategory !== "" && planCard.recommendedAgent !== ""
                                        implicitWidth: 1; implicitHeight: 12; color: "#30363d"
                                    }
                                    Label {
                                        visible: planCard.recommendedAgent !== ""
                                        text: planCard.recommendedAgent
                                        font.pixelSize: 10; color: "#8b949e"
                                        Layout.fillWidth: true
                                    }
                                }

                                // Next / active step block
                                ColumnLayout {
                                    Layout.fillWidth: true; spacing: 4
                                    visible: planCard.nextStepTask !== ""

                                    RowLayout {
                                        spacing: 6
                                        Label {
                                            text: planCard.nextStepStatus === "active"
                                                  ? "IN PROGRESS" : "NEXT STEP"
                                            font.pixelSize: 9; font.bold: true; font.letterSpacing: 0.6
                                            color: planCard.nextStepStatus === "active" ? "#3fb950" : "#d29922"
                                        }
                                        Label {
                                            visible: planCard.nextStepPhase !== ""
                                            text: "\u00B7 " + planCard.nextStepPhase
                                            font.pixelSize: 9; color: "#6e7681"
                                            elide: Text.ElideRight; Layout.fillWidth: true
                                        }
                                    }

                                    Label {
                                        text: planCard.nextStepTask
                                        font.pixelSize: 13; color: "#e6edf3"
                                        wrapMode: Text.WordWrap
                                        Layout.fillWidth: true
                                    }

                                    Label {
                                        visible: planCard.nextStepAgent !== ""
                                        text: planCard.nextStepAgent
                                        font.pixelSize: 10; color: "#58a6ff"
                                    }
                                }

                                Label {
                                    visible: planCard.nextStepTask === "" && planCard.stepsTotal > 0
                                    text: "All steps complete"
                                    font.pixelSize: 11; color: "#3fb950"
                                }
                                Label {
                                    visible: planCard.stepsTotal === 0
                                    text: "No steps defined"
                                    font.pixelSize: 11; color: "#6e7681"
                                }

                                // Open in Dashboard button
                                Rectangle {
                                    Layout.fillWidth: true; implicitHeight: 36
                                    radius: 6
                                    color: openBtn.pressed       ? "#1e4a8c" :
                                           openBtn.containsMouse ? "#1c3d78" : "#0d2547"
                                    border.color: "#388bfd"; border.width: 1
                                    Behavior on color { ColorAnimation { duration: 80 } }

                                    MouseArea {
                                        id: openBtn
                                        anchors.fill: parent
                                        hoverEnabled: true; cursorShape: Qt.PointingHandCursor
                                        onClicked: Qt.openUrlExternally(
                                            panel.dashBaseUrl + "/workspace/"
                                            + planCard.workspaceId + "/plan/" + planCard.planId
                                        )
                                    }
                                    Row {
                                        anchors.centerIn: parent; spacing: 8
                                        Label {
                                            text: "Open in Dashboard"
                                            font.pixelSize: 13; font.bold: true; color: "#c9d1d9"
                                        }
                                    }
                                }

                                // Secondary action buttons
                                RowLayout {
                                    Layout.fillWidth: true
                                    spacing: 6

                                    Rectangle {
                                        Layout.fillWidth: true; implicitHeight: 30; radius: 6
                                        color: copyBtn.pressed       ? "#0a1f14" :
                                               copyBtn.containsMouse ? "#0d2a1b" : "#091710"
                                        border.color: "#3fb950"; border.width: 1
                                        Behavior on color { ColorAnimation { duration: 80 } }
                                        MouseArea {
                                            id: copyBtn
                                            anchors.fill: parent
                                            hoverEnabled: true; cursorShape: Qt.PointingHandCursor
                                            onClicked: {
                                                var txt = "Plan: " + planCard.planTitle + "\n"
                                                    + "Plan ID: " + planCard.planId + "\n"
                                                    + "Workspace: " + planCard.workspaceId + "\n"
                                                    + "Status: " + planCard.planStatus
                                                    + (planCard.stepsTotal > 0
                                                        ? " (" + planCard.stepsDone + "/" + planCard.stepsTotal + " steps)" : "") + "\n"
                                                    + (planCard.nextStepTask !== ""
                                                        ? "Next step: " + planCard.nextStepTask + "\n" : "")
                                                    + (planCard.nextStepAgent !== ""
                                                        ? "Agent: " + planCard.nextStepAgent + "\n" : "")
                                                    + (planCard.recommendedAgent !== ""
                                                        ? "Recommended: " + planCard.recommendedAgent : "")
                                                panel.copyToClipboard(txt)
                                            }
                                        }
                                        Label {
                                            anchors.centerIn: parent
                                            text: "Copy Details"
                                            font.pixelSize: 12; font.bold: true; color: "#3fb950"
                                        }
                                    }

                                    Rectangle {
                                        id: launchRect
                                        Layout.fillWidth: true; implicitHeight: 30; radius: 6
                                        property string launchState: "idle"  // idle | sending | ok | error
                                        color: launchBtn.pressed       ? "#150b30" :
                                               launchBtn.containsMouse ? "#1c1140" : "#0f0820"
                                        border.color: launchRect.launchState === "ok"    ? "#3fb950" :
                                                      launchRect.launchState === "error" ? "#f85149" : "#8957e5"
                                        border.width: 1
                                        Behavior on color        { ColorAnimation { duration: 80 } }
                                        Behavior on border.color { ColorAnimation { duration: 120 } }
                                        MouseArea {
                                            id: launchBtn
                                            anchors.fill: parent
                                            hoverEnabled: true; cursorShape: Qt.PointingHandCursor
                                            enabled: launchRect.launchState !== "sending"
                                            onClicked: {
                                                launchRect.launchState = "sending"
                                                var xhr = new XMLHttpRequest()
                                                if (panel.selectedProvider === 1) {
                                                    // Claude CLI via GUI server
                                                    xhr.open("POST", panel.guiBaseUrl + "/terminal/launch-claude")
                                                    xhr.setRequestHeader("Content-Type", "application/json")
                                                    xhr.onreadystatechange = function() {
                                                        if (xhr.readyState !== XMLHttpRequest.DONE) return
                                                        if (!launchRect || !launchResetTimer) return
                                                        launchRect.launchState = xhr.status === 200 ? "ok" : "error"
                                                        launchResetTimer.restart()
                                                    }
                                                    xhr.send(JSON.stringify({
                                                        workspace_id: planCard.workspaceId,
                                                        plan_id:      planCard.planId
                                                    }))
                                                } else {
                                                    // Gemini via dashboard API
                                                    if (panel.dashBaseUrl === "http://127.0.0.1:0" || panel.dashBaseUrl === "") {
                                                        launchRect.launchState = "error"
                                                        launchResetTimer.restart()
                                                        return
                                                    }
                                                    xhr.open("POST", panel.dashBaseUrl + "/api/agent-session/launch")
                                                    xhr.setRequestHeader("Content-Type", "application/json")
                                                    xhr.onreadystatechange = function() {
                                                        if (xhr.readyState !== XMLHttpRequest.DONE) return
                                                        if (!launchRect || !launchResetTimer) return
                                                        launchRect.launchState = xhr.status === 200 ? "ok" : "error"
                                                        launchResetTimer.restart()
                                                    }
                                                    xhr.send(JSON.stringify({
                                                        workspaceId: planCard.workspaceId,
                                                        planId:      planCard.planId,
                                                        provider:    "gemini",
                                                        phase:       planCard.nextStepPhase,
                                                        stepTask:    planCard.nextStepTask
                                                    }))
                                                }
                                            }
                                        }
                                        Timer {
                                            id: launchResetTimer; interval: 3000
                                            onTriggered: launchRect.launchState = "idle"
                                        }
                                        Label {
                                            anchors.centerIn: parent
                                            text: launchRect.launchState === "sending" ? "Launching..." :
                                                  launchRect.launchState === "ok"      ? "Launched"     :
                                                  launchRect.launchState === "error"   ? "Failed"       :
                                                  panel.selectedProvider === 1         ? "Launch Claude CLI"
                                                                                       : "Launch Agent"
                                            font.pixelSize: 12; font.bold: true
                                            color: launchRect.launchState === "ok"    ? "#3fb950" :
                                                   launchRect.launchState === "error" ? "#f85149" :
                                                   panel.selectedProvider === 1       ? "#d97706" : "#a371f7"
                                        }
                                    }
                                }

                                Item { Layout.preferredHeight: 2 }
                            }
                        }
                    }
                }

                Label {
                    visible: plansRepeater.count === 0
                    text: panel.currentTab === 0 ? "No active plans" : "No plans"
                    color: "#8b949e"; font.pixelSize: 12
                    Layout.fillWidth: true
                    topPadding: 20
                    horizontalAlignment: Text.AlignHCenter
                }

                Item { Layout.preferredHeight: 4 }
            }
        }

        Item { Layout.preferredHeight: 8 }
    }
}
