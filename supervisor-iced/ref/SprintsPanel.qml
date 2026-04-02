pragma ComponentBehavior: Bound
import QtQuick 2.15
import QtQuick.Controls 2.15
import QtQuick.Controls.Material 2.15
import QtQuick.Layouts 1.15

/// Sprints panel — displays sprint list with goals for the selected workspace.
/// Communicates with dashboard REST API at /api/sprints/*.
Rectangle {
    id: panel
    Material.theme: Material.Dark

    property string dashBaseUrl: "http://127.0.0.1:3456"
    property string workspaceId: ""

    property bool   expanded:   true
    property int    expandedPanelWidth: 460

    color:        "#161b22"
    radius:       0
    border.color: expanded ? "#388bfd" : "#30363d"
    border.width: 1
    Layout.fillHeight: true
    implicitWidth: expanded ? expandedPanelWidth : 44

    property bool _animReady: false
    Component.onCompleted: _animReady = true

    Behavior on implicitWidth { enabled: panel._animReady; NumberAnimation { duration: 200; easing.type: Easing.OutCubic } }
    Behavior on border.color  { ColorAnimation  { duration: 120 } }

    // ── Data ────────────────────────────────────────────────────────────────
    ListModel { id: sprintsModel }
    ListModel { id: goalsModel }

    property string selectedSprintId: ""

    // Hidden helper for clipboard writes
    TextEdit { id: clipHelper; visible: false; width: 0; height: 0 }
    function copyToClipboard(txt) {
        clipHelper.text = txt
        clipHelper.selectAll()
        clipHelper.copy()
    }

    // ── Create Sprint popup ──────────────────────────────────────────────────
    Popup {
        id: createSprintPopup
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
            Label { text: "Create Sprint"; font.pixelSize: 13; font.bold: true; color: "#c9d1d9" }
            Label { text: "Sprint name:"; font.pixelSize: 11; color: "#8b949e" }
            TextField {
                id: sprintNameField
                Layout.fillWidth: true
                placeholderText: "e.g. Sprint 1 - MVP Features"
                font.pixelSize: 11
                Material.theme: Material.Dark
            }
            Label { text: "Duration (days, optional):"; font.pixelSize: 11; color: "#8b949e" }
            TextField {
                id: sprintDurationField
                Layout.fillWidth: true
                placeholderText: "14"
                font.pixelSize: 11
                validator: IntValidator { bottom: 1; top: 365 }
                Material.theme: Material.Dark
            }
            RowLayout {
                Layout.fillWidth: true
                spacing: 8
                Item { Layout.fillWidth: true }
                Button {
                    text: "Cancel"; font.pixelSize: 11; implicitHeight: 28; leftPadding: 12; rightPadding: 12
                    onClicked: createSprintPopup.close()
                }
                Button {
                    text: "Create"; highlighted: true; font.pixelSize: 11; implicitHeight: 28; leftPadding: 12; rightPadding: 12
                    enabled: sprintNameField.text.trim() !== ""
                    onClicked: {
                        panel.createSprint(sprintNameField.text.trim(), sprintDurationField.text.trim())
                        sprintNameField.text = ""
                        sprintDurationField.text = ""
                        createSprintPopup.close()
                    }
                }
            }
        }
    }

    // ── Add Goal popup ───────────────────────────────────────────────────────
    Popup {
        id: addGoalPopup
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
            Label { text: "Add Goal"; font.pixelSize: 13; font.bold: true; color: "#c9d1d9" }
            Label { text: "Goal description:"; font.pixelSize: 11; color: "#8b949e" }
            TextArea {
                id: goalDescField
                Layout.fillWidth: true
                implicitHeight: 60
                placeholderText: "e.g. Complete user authentication module"
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
                    onClicked: addGoalPopup.close()
                }
                Button {
                    text: "Add"; highlighted: true; font.pixelSize: 11; implicitHeight: 28; leftPadding: 12; rightPadding: 12
                    enabled: goalDescField.text.trim() !== "" && panel.selectedSprintId !== ""
                    onClicked: {
                        panel.addGoal(panel.selectedSprintId, goalDescField.text.trim())
                        goalDescField.text = ""
                        addGoalPopup.close()
                    }
                }
            }
        }
    }

    onWorkspaceIdChanged: {
        if (panel.workspaceId !== "") {
            fetchSprints()
        }
    }

    onExpandedChanged: {
        if (expanded && panel.workspaceId !== "") {
            fetchSprints()
        }
    }

    Timer {
        interval: 15000; running: panel.expanded && panel.workspaceId !== ""; repeat: true
        onTriggered: panel.fetchSprints()
    }

    // ── API Functions ────────────────────────────────────────────────────────
    function fetchSprints() {
        if (panel.workspaceId === "") return
        var xhr = new XMLHttpRequest()
        xhr.onreadystatechange = function() {
            if (xhr.readyState !== XMLHttpRequest.DONE) return
            if (xhr.status !== 200) {
                console.error('[SprintsPanel] fetchSprints failed:', xhr.status, xhr.statusText)
                return
            }
            try {
                var raw = JSON.parse(xhr.responseText)
                var sprints = raw.sprints || raw || []
                sprintsModel.clear()
                for (var i = 0; i < sprints.length; i++) {
                    var s = sprints[i]
                    sprintsModel.append({
                        sprintId:    s.id || s.sprint_id || "",
                        sprintName:  s.name || s.title || "Untitled Sprint",
                        status:      s.status || "active",
                        startDate:   s.start_date || s.startDate || "",
                        endDate:     s.end_date || s.endDate || "",
                        goalCount:   (s.goals && s.goals.length) || s.goal_count || 0,
                        expanded:    false
                    })
                }
                // Auto-select first sprint if none selected
                if (sprintsModel.count > 0 && panel.selectedSprintId === "") {
                    panel.selectedSprintId = sprintsModel.get(0).sprintId
                    fetchGoals(panel.selectedSprintId)
                }
            } catch(e) { console.error('[SprintsPanel] fetchSprints parse error:', e) }
        }
        xhr.open("GET", panel.dashBaseUrl + "/api/sprints/workspace/" + panel.workspaceId)
        xhr.send()
    }

    function fetchGoals(sprintId) {
        if (sprintId === "") return
        var xhr = new XMLHttpRequest()
        xhr.onreadystatechange = function() {
            if (xhr.readyState !== XMLHttpRequest.DONE) return
            if (xhr.status !== 200) {
                console.error('[SprintsPanel] fetchGoals failed:', xhr.status)
                return
            }
            try {
                var raw = JSON.parse(xhr.responseText)
                var goals = raw.goals || raw || []
                goalsModel.clear()
                for (var i = 0; i < goals.length; i++) {
                    var g = goals[i]
                    goalsModel.append({
                        goalId:      g.id || g.goal_id || "",
                        description: g.description || g.title || "",
                        completed:   g.completed || g.status === "completed" || false,
                        planId:      g.plan_id || g.planId || ""
                    })
                }
            } catch(e) { console.error('[SprintsPanel] fetchGoals parse error:', e) }
        }
        // Fetch sprint details which includes goals
        xhr.open("GET", panel.dashBaseUrl + "/api/sprints/" + sprintId)
        xhr.send()
    }

    function createSprint(name, durationDays) {
        if (panel.workspaceId === "") return
        var xhr = new XMLHttpRequest()
        xhr.onreadystatechange = function() {
            if (xhr.readyState !== XMLHttpRequest.DONE) return
            if (xhr.status === 200 || xhr.status === 201) {
                fetchSprints()
            } else {
                console.error('[SprintsPanel] createSprint failed:', xhr.status)
            }
        }
        xhr.open("POST", panel.dashBaseUrl + "/api/sprints")
        xhr.setRequestHeader("Content-Type", "application/json")
        var body = {
            workspace_id: panel.workspaceId,
            name: name
        }
        if (durationDays && parseInt(durationDays) > 0) {
            body.duration_days = parseInt(durationDays)
        }
        xhr.send(JSON.stringify(body))
    }

    function addGoal(sprintId, description) {
        if (sprintId === "") return
        var xhr = new XMLHttpRequest()
        xhr.onreadystatechange = function() {
            if (xhr.readyState !== XMLHttpRequest.DONE) return
            if (xhr.status === 200 || xhr.status === 201) {
                fetchGoals(sprintId)
            } else {
                console.error('[SprintsPanel] addGoal failed:', xhr.status)
            }
        }
        xhr.open("POST", panel.dashBaseUrl + "/api/sprints/" + sprintId + "/goals")
        xhr.setRequestHeader("Content-Type", "application/json")
        xhr.send(JSON.stringify({ description: description }))
    }

    function toggleGoalComplete(sprintId, goalId, completed) {
        var xhr = new XMLHttpRequest()
        xhr.onreadystatechange = function() {
            if (xhr.readyState !== XMLHttpRequest.DONE) return
            if (xhr.status === 200) {
                fetchGoals(sprintId)
            } else {
                console.error('[SprintsPanel] toggleGoalComplete failed:', xhr.status)
            }
        }
        xhr.open("PATCH", panel.dashBaseUrl + "/api/sprints/" + sprintId + "/goals/" + goalId)
        xhr.setRequestHeader("Content-Type", "application/json")
        xhr.send(JSON.stringify({ completed: completed }))
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
                ToolTip.text: "Open Sprints"
                ToolTip.visible: hovered
                onClicked: panel.expanded = true
            }
            Label {
                anchors.horizontalCenter: parent.horizontalCenter
                text: "SPRINTS"
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
                text: "SPRINTS"
                font.pixelSize: 11; font.bold: true; font.letterSpacing: 1.2
                color: "#c9d1d9"
            }
            Item { Layout.fillWidth: true }
            ToolButton {
                text: "\u21BB"
                implicitWidth: 26; implicitHeight: 26
                font.pixelSize: 14
                ToolTip.visible: hovered; ToolTip.text: "Refresh"
                onClicked: panel.fetchSprints()
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
                text: "Create Sprint"
                highlighted: true
                topPadding: 4; bottomPadding: 4
                leftPadding: 10; rightPadding: 10
                font.pixelSize: 10
                enabled: panel.workspaceId !== ""
                ToolTip.visible: hovered; ToolTip.text: "Create a new sprint"
                onClicked: createSprintPopup.open()
            }
            Button {
                text: "Add Goal"
                topPadding: 4; bottomPadding: 4
                leftPadding: 10; rightPadding: 10
                font.pixelSize: 10
                enabled: panel.selectedSprintId !== ""
                ToolTip.visible: hovered; ToolTip.text: "Add a goal to the selected sprint"
                onClicked: addGoalPopup.open()
            }

            Item { Layout.fillWidth: true }
        }

        // ── Sprints list (expandable cards) ─────────────────────────────────
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
                    id: sprintsRepeater
                    model: sprintsModel

                    delegate: ColumnLayout {
                        id: sprintCard
                        required property string sprintId
                        required property string sprintName
                        required property string status
                        required property string startDate
                        required property string endDate
                        required property int    goalCount

                        Layout.fillWidth: true
                        spacing: 0
                        property bool expanded: panel.selectedSprintId === sprintCard.sprintId

                        // ── Header strip ───────────────────────────────────
                        Rectangle {
                            Layout.fillWidth: true
                            implicitHeight: 48
                            radius: sprintCard.expanded ? 0 : 6
                            color: sprintCard.expanded ? "#1c2128" : "#0d1117"
                            border.color: sprintCard.expanded ? "#388bfd" : "#30363d"
                            border.width: 1
                            clip: true

                            Behavior on color       { ColorAnimation { duration: 100 } }
                            Behavior on border.color { ColorAnimation { duration: 100 } }

                            MouseArea {
                                anchors.fill: parent
                                cursorShape: Qt.PointingHandCursor
                                onClicked: {
                                    if (panel.selectedSprintId === sprintCard.sprintId) {
                                        panel.selectedSprintId = ""
                                        goalsModel.clear()
                                    } else {
                                        panel.selectedSprintId = sprintCard.sprintId
                                        panel.fetchGoals(sprintCard.sprintId)
                                    }
                                }
                            }

                            ColumnLayout {
                                anchors {
                                    left: parent.left; right: parent.right
                                    top: parent.top; bottom: parent.bottom
                                    leftMargin: 10; rightMargin: 10
                                    topMargin: 7; bottomMargin: 7
                                }
                                spacing: 3

                                RowLayout {
                                    Layout.fillWidth: true
                                    spacing: 6

                                    Label {
                                        text: sprintCard.expanded ? "-" : "+"
                                        font.pixelSize: 11; color: "#8b949e"
                                        Layout.preferredWidth: 12
                                    }
                                    Label {
                                        text: sprintCard.sprintName
                                        font.pixelSize: 13; color: "#c9d1d9"
                                        Layout.fillWidth: true
                                        elide: Text.ElideRight
                                    }
                                    Label {
                                        text: sprintCard.goalCount + " goals"
                                        font.pixelSize: 10; color: "#8b949e"
                                    }
                                    Rectangle {
                                        implicitWidth: 60; implicitHeight: 18; radius: 9
                                        color: sprintCard.status === "active"    ? "#0e2318" :
                                               sprintCard.status === "completed" ? "#0d2547" :
                                               sprintCard.status === "planned"   ? "#1f1a0e" : "#21262d"
                                        Label {
                                            anchors.centerIn: parent
                                            text: sprintCard.status.toUpperCase()
                                            font.pixelSize: 9; font.bold: true
                                            color: sprintCard.status === "active"    ? "#3fb950" :
                                                   sprintCard.status === "completed" ? "#388bfd" :
                                                   sprintCard.status === "planned"   ? "#d29922" : "#8b949e"
                                        }
                                    }
                                }

                                // Date range (if available)
                                Label {
                                    visible: sprintCard.startDate !== "" || sprintCard.endDate !== ""
                                    text: (sprintCard.startDate || "?") + " → " + (sprintCard.endDate || "?")
                                    font.pixelSize: 10; color: "#6e7681"
                                    Layout.leftMargin: 18
                                }
                            }
                        }

                        // ── Expanded detail with goals ─────────────────────
                        Rectangle {
                            Layout.fillWidth: true
                            implicitHeight: sprintCard.expanded
                                            ? (goalsLayout.implicitHeight + 20) : 0
                            clip: true
                            color: "#1c2128"
                            border.color: "#388bfd"; border.width: 1

                            Behavior on implicitHeight {
                                NumberAnimation { duration: 180; easing.type: Easing.OutCubic }
                            }

                            ColumnLayout {
                                id: goalsLayout
                                anchors {
                                    left: parent.left; right: parent.right; top: parent.top
                                    leftMargin: 12; rightMargin: 12; topMargin: 10
                                }
                                spacing: 6

                                Label {
                                    text: "GOALS"
                                    font.pixelSize: 10; font.bold: true; font.letterSpacing: 0.8
                                    color: "#8b949e"
                                }

                                // Goals list
                                Repeater {
                                    model: sprintCard.expanded ? goalsModel : null

                                    delegate: Rectangle {
                                        id: goalItem
                                        required property string goalId
                                        required property string description
                                        required property bool   completed
                                        required property string planId

                                        Layout.fillWidth: true
                                        implicitHeight: goalRow.implicitHeight + 12
                                        radius: 4
                                        color: goalItem.completed ? "#0a1f14" : "#0d1117"
                                        border.color: goalItem.completed ? "#3fb950" : "#30363d"
                                        border.width: 1

                                        RowLayout {
                                            id: goalRow
                                            anchors {
                                                left: parent.left; right: parent.right
                                                verticalCenter: parent.verticalCenter
                                                leftMargin: 8; rightMargin: 8
                                            }
                                            spacing: 8

                                            CheckBox {
                                                checked: goalItem.completed
                                                Material.theme: Material.Dark
                                                onClicked: {
                                                    panel.toggleGoalComplete(
                                                        panel.selectedSprintId,
                                                        goalItem.goalId,
                                                        !goalItem.completed
                                                    )
                                                }
                                            }
                                            Label {
                                                text: goalItem.description
                                                font.pixelSize: 12
                                                color: goalItem.completed ? "#3fb950" : "#c9d1d9"
                                                font.strikeout: goalItem.completed
                                                wrapMode: Text.WordWrap
                                                Layout.fillWidth: true
                                            }
                                            Label {
                                                visible: goalItem.planId !== ""
                                                text: "📋"
                                                font.pixelSize: 12
                                                ToolTip.visible: goalMa.containsMouse
                                                ToolTip.text: "Linked to plan: " + goalItem.planId

                                                MouseArea {
                                                    id: goalMa
                                                    anchors.fill: parent
                                                    hoverEnabled: true
                                                }
                                            }
                                        }
                                    }
                                }

                                Label {
                                    visible: goalsModel.count === 0 && sprintCard.expanded
                                    text: "No goals defined"
                                    font.pixelSize: 11; color: "#6e7681"
                                    Layout.fillWidth: true
                                    horizontalAlignment: Text.AlignHCenter
                                    topPadding: 8
                                }

                                Item { Layout.preferredHeight: 4 }
                            }
                        }
                    }
                }

                Label {
                    visible: sprintsRepeater.count === 0
                    text: panel.workspaceId === "" ? "Select a workspace" : "No sprints"
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
