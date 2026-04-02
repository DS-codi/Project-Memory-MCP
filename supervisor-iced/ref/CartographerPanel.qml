import QtQuick 2.15
import QtQuick.Controls 2.15
import QtQuick.Controls.Material 2.15
import QtQuick.Layouts 1.15

/// Workspace Cartographer panel — workspace selector + Scan Project button.
Rectangle {
    id: cartoPanel
    Material.theme: Material.Dark

    property string mcpBaseUrl: ""
    property int    mcpPort:    0
    property string mcpStatus:  ""

    color:        "#161b22"
    radius:       10
    border.color: "#30363d"
    Layout.fillWidth: true
    implicitHeight: statsRow.visible ? 242 : 185

    // ── Internal state ───────────────────────────────────────────────────────
    ListModel { id: workspaceModel }
    property string selectedWorkspaceId: ""

    // Auto-load workspaces whenever the MCP port becomes available.
    onMcpPortChanged: if (mcpPort > 0) cartoPanel.loadWorkspaces()
    onSelectedWorkspaceIdChanged: cartoPanel.loadSummary()

    function loadSummary() {
        if (cartoPanel.selectedWorkspaceId === "" || cartoPanel.mcpPort <= 0) {
            statsRow.visible = false
            return
        }
        var wsId = cartoPanel.selectedWorkspaceId
        var xhr  = new XMLHttpRequest()
        xhr.onreadystatechange = function() {
            if (xhr.readyState !== XMLHttpRequest.DONE || xhr.status !== 200) return
            try {
                var r = JSON.parse(xhr.responseText)
                if (r.success && r.has_data && r.data) {
                    var d = r.data
                    var files   = d.files_total   !== null ? d.files_total   : "?"
                    var elapsed = d.elapsed_ms     !== null ? d.elapsed_ms    : "?"
                    var cached  = d.cache_hit === true ? " \u00b7 cached" : (d.cache_hit === false ? " \u00b7 fresh scan" : "")
                    var when    = d.scanned_at ? d.scanned_at.substring(0, 16).replace("T", " ") : "\u2014"
                    statsFilesLabel.text  = files + " files \u00b7 " + elapsed + "ms" + cached
                    statsWhenLabel.text   = "Last scan: " + when
                    statsRow.visible = true
                } else {
                    statsRow.visible = false
                }
            } catch(e) {
                statsRow.visible = false
            }
        }
        xhr.open("GET", cartoPanel.mcpBaseUrl + "/admin/cartographer_summary/" + wsId)
        xhr.send()
    }

    function loadWorkspaces() {
        if (cartoPanel.mcpPort <= 0) return
        var xhr = new XMLHttpRequest()
        xhr.onreadystatechange = function() {
            if (xhr.readyState !== XMLHttpRequest.DONE || xhr.status !== 200) return
            try {
                var parsed = JSON.parse(xhr.responseText)
                var list   = parsed.workspaces || []
                var prevId = cartoPanel.selectedWorkspaceId
                workspaceModel.clear()
                for (var i = 0; i < list.length; i++) {
                    workspaceModel.append({
                        workspaceId:  list[i].id,
                        displayText:  list[i].name || list[i].id
                    })
                }
                var restored = false
                if (prevId !== "") {
                    for (var j = 0; j < workspaceModel.count; j++) {
                        if (workspaceModel.get(j).workspaceId === prevId) {
                            workspaceCombo.currentIndex = j
                            restored = true
                            break
                        }
                    }
                }
                if (!restored && workspaceModel.count > 0) {
                    workspaceCombo.currentIndex = 0
                    cartoPanel.selectedWorkspaceId = workspaceModel.get(0).workspaceId
                }
            } catch(e) {}
        }
        xhr.open("GET", cartoPanel.mcpBaseUrl + "/admin/workspaces")
        xhr.send()
    }

    // ── UI ───────────────────────────────────────────────────────────────────
    ColumnLayout {
        id: _cartoCol
        anchors { left: parent.left; right: parent.right; top: parent.top; margins: 10 }
        spacing: 8

        // Header
        RowLayout {
            spacing: 8
            Canvas {
                Layout.preferredWidth: 26; Layout.preferredHeight: 26
                Component.onCompleted: requestPaint()
                onPaint: {
                    var c = getContext("2d")
                    c.clearRect(0, 0, 26, 26)
                    c.save(); c.scale(26/512, 26/512)
                    c.beginPath()
                    c.moveTo(48, 256); c.lineTo(256, 96); c.lineTo(464, 256); c.lineTo(256, 416)
                    c.closePath()
                    c.strokeStyle = "#cc3333"; c.lineWidth = 32; c.stroke()
                    c.strokeStyle = "#cc3333"; c.lineWidth = 16
                    c.beginPath(); c.moveTo(256, 108); c.lineTo(256, 404); c.stroke()
                    c.beginPath(); c.moveTo(60,  256); c.lineTo(452, 256); c.stroke()
                    c.fillStyle = "#cc3333"; c.fillRect(200, 200, 112, 112)
                    c.fillStyle = "#1c2128"; c.fillRect(224, 224,  64,  64)
                    c.restore()
                }
            }
            Label {
                text: "WORKSPACE CARTOGRAPHER"
                font.pixelSize: 10; font.letterSpacing: 1.0; color: "#8b949e"
                Layout.fillWidth: true
            }
        }

        // Workspace selector row
        RowLayout {
            Layout.fillWidth: true; spacing: 8
            ComboBox {
                id: workspaceCombo
                model: workspaceModel
                textRole: "displayText"
                Layout.fillWidth: true
                enabled: workspaceModel.count > 0
                onCurrentIndexChanged: {
                    if (currentIndex >= 0 && currentIndex < workspaceModel.count)
                        cartoPanel.selectedWorkspaceId = workspaceModel.get(currentIndex).workspaceId
                }
                displayText: workspaceModel.count === 0
                    ? (cartoPanel.mcpStatus === "Running" ? "No workspaces registered" : "MCP offline")
                    : currentText
            }
            Button {
                text: "\u21bb"; implicitWidth: 32; flat: true
                enabled: cartoPanel.mcpPort > 0
                onClicked: cartoPanel.loadWorkspaces()
                ToolTip.visible: hovered; ToolTip.text: "Refresh workspace list"; ToolTip.delay: 600
            }
        }

        // Scan button
        Button {
            id: cartographerBtn
            text: "Scan Project"
            Layout.fillWidth: true
            enabled: cartoPanel.selectedWorkspaceId !== "" && cartoPanel.mcpStatus === "Running"
            onClicked: {
                cartographerStatus.text = "Scanning\u2026"
                cartographerBtn.enabled = false
                var wsId = cartoPanel.selectedWorkspaceId
                var xhr  = new XMLHttpRequest()
                xhr.onreadystatechange = function() {
                    if (xhr.readyState !== XMLHttpRequest.DONE) return
                    cartographerBtn.enabled =
                        cartoPanel.selectedWorkspaceId !== "" &&
                        cartoPanel.mcpStatus === "Running"
                    if (xhr.status === 200) {
                        try {
                            var r     = JSON.parse(xhr.responseText)
                            if (r.success) {
                                var inner   = r.data && r.data.data ? r.data.data : {}
                                var res     = inner.result  || {}
                                var summary = res.summary   || {}
                                var files   = summary.files_total !== undefined ? summary.files_total : "?"
                                var elapsed = inner.elapsed_ms    !== undefined ? inner.elapsed_ms    : "?"
                                cartographerStatus.text = "Scan complete"
                                cartoPanel.loadSummary()
                            } else {
                                cartographerStatus.text = "Error: " + (r.error || "scan failed")
                            }
                        } catch(e) {
                            cartographerStatus.text = "Scan complete"
                        }
                    } else {
                        cartographerStatus.text = "HTTP " + xhr.status
                    }
                }
                xhr.open("POST", cartoPanel.mcpBaseUrl + "/admin/memory_cartographer")
                xhr.setRequestHeader("Content-Type", "application/json")
                xhr.send(JSON.stringify({ workspace_id: wsId }))
            }
        }

        // Scan result label
        Label {
            id: cartographerStatus
            text: ""
            font.pixelSize: 11
            color: text.startsWith("Scan") ? "#3fb950"
                 : (text.startsWith("Error") || text.startsWith("HTTP") ? "#f85149"
                 : "#8b949e")
            Layout.fillWidth: true; wrapMode: Text.WordWrap
        }

        // Stats section — auto-populated from stored scan data
        ColumnLayout {
            id: statsRow
            Layout.fillWidth: true
            visible: false
            spacing: 2

            Rectangle {
                Layout.fillWidth: true
                implicitHeight: 1
                color: "#30363d"
            }

            Label {
                id: statsFilesLabel
                text: ""
                font.pixelSize: 11
                color: "#3fb950"
                Layout.fillWidth: true
                wrapMode: Text.WordWrap
            }

            Label {
                id: statsWhenLabel
                text: ""
                font.pixelSize: 10
                color: "#8b949e"
                Layout.fillWidth: true
            }
        }
    }
}
