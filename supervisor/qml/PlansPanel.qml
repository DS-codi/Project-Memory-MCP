pragma ComponentBehavior: Bound
import QtQuick 2.15
import QtQuick.Controls 2.15
import QtQuick.Controls.Material 2.15
import QtQuick.Layouts 1.15

/// Active plans panel — polls /admin/plans every 15 seconds.
Rectangle {
    id: plansPanel
    Material.theme: Material.Dark

    property string mcpBaseUrl: ""
    property string dashBaseUrl: ""
    property int    mcpPort:    0

    color:        "#161b22"
    radius:       10
    border.color: "#30363d"
    Layout.fillWidth: true
    implicitHeight: 260

    // ── Data ────────────────────────────────────────────────────────────────
    ListModel { id: workspacesModel }
    ListModel { id: plansList }

    function fetchWorkspaces() {
        if (plansPanel.mcpPort <= 0) return
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
            } catch(e) {}
        }
        xhr.open("GET", plansPanel.mcpBaseUrl + "/admin/workspaces")
        xhr.send()
    }

    function fetchPlans() {
        if (plansPanel.mcpPort <= 0) return
        if (workspaceCombo.currentIndex < 0) return
        var wsId = workspacesModel.get(workspaceCombo.currentIndex).wsId
        var xhr = new XMLHttpRequest()
        xhr.onreadystatechange = function() {
            if (xhr.readyState !== XMLHttpRequest.DONE || xhr.status !== 200) return
            try {
                var raw = JSON.parse(xhr.responseText)
                plansList.clear()
                for (var i = 0; i < raw.plans.length; i++) {
                    var p = raw.plans[i]
                    plansList.append({
                        planId:      p.id,
                        planTitle:   p.title,
                        planStatus:  p.status,
                        planCategory: p.category || "",
                        stepsDone:   p.steps_done  || 0,
                        stepsTotal:  p.steps_total || 0,
                        workspaceId: p.workspace_id || wsId
                    })
                }
            } catch(e) {}
        }
        var wsId2 = workspacesModel.get(workspaceCombo.currentIndex).wsId
        xhr.open("GET", plansPanel.mcpBaseUrl + "/admin/plans?workspace_id=" + wsId2)
        xhr.send()
    }

    Component.onCompleted: fetchWorkspaces()

    Timer {
        interval: 15000; running: true; repeat: true
        onTriggered: plansPanel.fetchPlans()
    }

    // ── UI ───────────────────────────────────────────────────────────────────
    ColumnLayout {
        anchors.fill: parent; anchors.margins: 10; spacing: 6

        // Header
        RowLayout {
            Layout.fillWidth: true; spacing: 6
            Label {
                text: "ACTIVE PLANS"
                font.pixelSize: 10; font.letterSpacing: 1.0; color: "#8b949e"
            }
            Item { Layout.fillWidth: true }
            ComboBox {
                id: workspaceCombo
                Layout.preferredWidth: 160
                implicitHeight: 26
                font.pixelSize: 11
                model: workspacesModel
                textRole: "wsName"
                onCurrentIndexChanged: plansPanel.fetchPlans()
            }
            ToolButton {
                text: "\u21BB"
                implicitWidth: 26; implicitHeight: 26
                font.pixelSize: 14
                ToolTip.visible: hovered; ToolTip.text: "Refresh"
                onClicked: plansPanel.fetchPlans()
            }
        }

        // Column headers
        RowLayout {
            spacing: 0; Layout.fillWidth: true
            Label { text: "PLAN";     font.pixelSize: 10; color: "#8b949e"; Layout.fillWidth: true }
            Label { text: "PROGRESS"; font.pixelSize: 10; color: "#8b949e"; Layout.preferredWidth: 64 }
            Label { text: "STATUS";   font.pixelSize: 10; color: "#8b949e"; Layout.preferredWidth: 56 }
            Label { text: "CAT";      font.pixelSize: 10; color: "#8b949e"; Layout.preferredWidth: 40 }
            Label { text: "";         font.pixelSize: 10; color: "#8b949e"; Layout.preferredWidth: 50 }
        }

        Rectangle { Layout.fillWidth: true; Layout.preferredHeight: 1; color: "#30363d" }

        ScrollView {
            Layout.fillWidth: true; Layout.fillHeight: true; clip: true; contentWidth: availableWidth

            ColumnLayout {
                width: parent.width; spacing: 2

                Repeater {
                    id: plansRepeater
                    model: plansList
                    delegate: RowLayout {
                        id: planRow
                        required property string planId
                        required property string planTitle
                        required property string planStatus
                        required property string planCategory
                        required property int    stepsDone
                        required property int    stepsTotal
                        required property string workspaceId

                        Layout.fillWidth: true; spacing: 4; implicitHeight: 32

                        Label {
                            text: planRow.planTitle
                            font.pixelSize: 11; color: "#c9d1d9"
                            Layout.fillWidth: true; elide: Text.ElideRight
                        }
                        ProgressBar {
                            Layout.preferredWidth: 60
                            implicitHeight: 6
                            visible: planRow.stepsTotal > 0
                            value: planRow.stepsTotal > 0 ? planRow.stepsDone / planRow.stepsTotal : 0
                        }
                        Rectangle {
                            Layout.preferredWidth: 52; Layout.preferredHeight: 18; radius: 10
                            color: planRow.planStatus === "active"  ? "#0e2318" :
                                   planRow.planStatus === "paused"  ? "#1f1a0e" :
                                   planRow.planStatus === "blocked" ? "#2d0f0f" : "#21262d"
                            Label {
                                anchors.centerIn: parent
                                text: planRow.planStatus.toUpperCase()
                                font.pixelSize: 8; font.bold: true
                                color: planRow.planStatus === "active"  ? "#3fb950" :
                                       planRow.planStatus === "paused"  ? "#d29922" :
                                       planRow.planStatus === "blocked" ? "#f85149" : "#8b949e"
                            }
                        }
                        Label {
                            text: planRow.planCategory
                            font.pixelSize: 9; color: "#8b949e"
                            Layout.preferredWidth: 40; elide: Text.ElideRight
                        }
                        Button {
                            text: "Open"
                            implicitHeight: 24; leftPadding: 6; rightPadding: 6
                            font.pixelSize: 11; Layout.preferredWidth: 50
                            onClicked: Qt.openUrlExternally(
                                plansPanel.dashBaseUrl + "/workspace/" + planRow.workspaceId + "/plan/" + planRow.planId
                            )
                        }
                    }
                }

                Label {
                    visible: plansRepeater.count === 0
                    text: "No active plans"
                    color: "#8b949e"; font.pixelSize: 12; Layout.fillWidth: true
                }
            }
        }
    }
}
