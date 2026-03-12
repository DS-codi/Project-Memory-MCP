import QtQuick 2.15
import QtQuick.Controls 2.15
import QtQuick.Controls.Material 2.15
import QtQuick.Layouts 1.15
import Qt.labs.platform 1.1 as Platform
import com.projectmemory.supervisor

pragma ComponentBehavior: Bound

ApplicationWindow {
    id: root
    width: 1000
    height: 960
    // Window starts hidden — tray icon is the entry point.
    visible: supervisorGuiBridge.windowVisible
    minimumWidth: 500
    minimumHeight: 600
    title: "Project Memory Supervisor"

    Material.theme: Material.Dark
    Material.accent: Material.Blue

    // Hide to tray when the user clicks the window's X button.
    onClosing: function(close) {
        close.accepted = false
        supervisorGuiBridge.hideWindow()
    }

    // Bring the window to the front once Qt has actually made it visible.
    // We use Qt.callLater() to defer until after the current binding
    // evaluation completes and Qt has a chance to create the native handle.
    // Calling raise()/requestActivate() synchronously inside onVisibleChanged
    // can fire before the HWND exists, causing an access violation in Qt6Core.
    onVisibleChanged: {
        if (visible) {
            Qt.callLater(function() { raise(); requestActivate() })
        }
    }

    /// Returns a dot colour that reflects the current service state string.
    function statusColor(s) {
        if (s === "Running")                      return "#4caf50"  // green
        if (s === "Starting" || s === "Stopping") return "#ffeb3b"  // yellow
        if (s === "Error"    || s === "Stopped")  return "#f44336"  // red
        return "#9e9e9e"                                             // grey (unknown)
    }

    SupervisorGuiBridge {
        id: supervisorGuiBridge
    }

    // ── Session / activity data models ───────────────────────────────────────
    ListModel { id: sessionsList }
    ListModel { id: activityList }
    ListModel { id: workspaceModel }

    property string mcpBaseUrl: "http://127.0.0.1:" + supervisorGuiBridge.mcpPort
    property string dashBaseUrl: "http://127.0.0.1:" + supervisorGuiBridge.dashboardPort
    property string selectedWorkspaceId: ""

    // ── Load registered workspaces from MCP admin API ─────────────────────
    function loadWorkspaces() {
        if (supervisorGuiBridge.mcpPort <= 0) return;
        var xhr = new XMLHttpRequest();
        xhr.onreadystatechange = function() {
            if (xhr.readyState === XMLHttpRequest.DONE && xhr.status === 200) {
                try {
                    var parsed = JSON.parse(xhr.responseText);
                    var list = parsed.workspaces || [];
                    var prevId = root.selectedWorkspaceId;
                    workspaceModel.clear();
                    for (var i = 0; i < list.length; i++) {
                        workspaceModel.append({
                            workspaceId: list[i].id,
                            displayText: list[i].name || list[i].id
                        });
                    }
                    // Restore previous selection or fall back to first entry
                    var restored = false;
                    if (prevId !== "") {
                        for (var j = 0; j < workspaceModel.count; j++) {
                            if (workspaceModel.get(j).workspaceId === prevId) {
                                workspaceCombo.currentIndex = j;
                                restored = true;
                                break;
                            }
                        }
                    }
                    if (!restored && workspaceModel.count > 0) {
                        workspaceCombo.currentIndex = 0;
                        root.selectedWorkspaceId = workspaceModel.get(0).workspaceId;
                    }
                } catch(e) {}
            }
        };
        xhr.open("GET", mcpBaseUrl + "/admin/workspaces");
        xhr.send();
    }

    // Auto-load workspaces when MCP port becomes available
    Connections {
        target: supervisorGuiBridge
        function onMcpPortChanged() {
            if (supervisorGuiBridge.mcpPort > 0) root.loadWorkspaces()
        }
    }

    function stopSession(sessionKey) {
        var xhr = new XMLHttpRequest();
        xhr.open("POST", mcpBaseUrl + "/sessions/stop");
        xhr.setRequestHeader("Content-Type", "application/json");
        xhr.send(JSON.stringify({ sessionKey: sessionKey }));
    }

    Timer {
        id: sessionsPollTimer
        interval: 5000
        running: true
        repeat: true
        onTriggered: {
            if (supervisorGuiBridge.mcpPort <= 0) return;
            var xhr = new XMLHttpRequest();
            xhr.onreadystatechange = function() {
                if (xhr.readyState === XMLHttpRequest.DONE && xhr.status === 200) {
                    try {
                        var raw = JSON.parse(xhr.responseText);
                        sessionsList.clear();
                        // Response is an object keyed by serverSessionId
                        var keys = Object.keys(raw);
                        for (var i = 0; i < keys.length && i < 20; i++) {
                            var s = raw[keys[i]];
                            sessionsList.append({
                                agentType: s.agentType || "?",
                                sessionId: s.serverSessionId || keys[i],
                                status: "active",
                                sessionKey: (s.workspaceId || "") + "::" + (s.planId || "") + "::" + (s.serverSessionId || keys[i])
                            });
                        }
                    } catch(e) {}
                }
            };
            xhr.open("GET", root.mcpBaseUrl + "/sessions/live");
            xhr.send();
        }
    }

    Timer {
        id: activityPollTimer
        interval: 10000
        running: true
        repeat: true
        onTriggered: {
            if (supervisorGuiBridge.dashboardPort <= 0) return;
            var xhr = new XMLHttpRequest();
            xhr.onreadystatechange = function() {
                if (xhr.readyState === XMLHttpRequest.DONE && xhr.status === 200) {
                    try {
                        var parsed = JSON.parse(xhr.responseText);
                        var list = Array.isArray(parsed) ? parsed : (parsed.events || []);
                        activityList.clear();
                        for (var i = 0; i < list.length && i < 10; i++) {
                            var ev = list[i];
                            activityList.append({
                                evType: ev.type || ev.event_type || "event",
                                evTimestamp: ev.timestamp || ev.created_at || ""
                            });
                        }
                    } catch(e) {}
                }
            };
            xhr.open("GET", root.dashBaseUrl + "/api/events?limit=10");
            xhr.send();
        }
    }

    // ── System tray icon (Qt.labs.platform) ─────────────────────────────────
    Platform.SystemTrayIcon {
        id: trayIcon
        visible: !supervisorGuiBridge.quitting
        icon.source: supervisorGuiBridge.trayIconUrl
        tooltip: "Project Memory Supervisor\n" + supervisorGuiBridge.statusText
            + (supervisorGuiBridge.eventBroadcastEnabled
                ? "\nEvents: [on] " + supervisorGuiBridge.eventsTotalEmitted + " relayed"
                : "\nEvents: [off]")

        onActivated: function(reason) {
            if (reason === Platform.SystemTrayIcon.Trigger ||
                reason === Platform.SystemTrayIcon.DoubleClick) {
                supervisorGuiBridge.showWindow()
            }
        }

        menu: Platform.Menu {
            Platform.MenuItem {
                text: "Show Supervisor"
                onTriggered: {
                    supervisorGuiBridge.showWindow()
                }
            }
            Platform.MenuSeparator {}
            Platform.MenuItem {
                text: "MCP Server — Restart"
                onTriggered: supervisorGuiBridge.restartService("mcp")
            }
            Platform.MenuItem {
                text: "Interactive Terminal — Restart"
                onTriggered: supervisorGuiBridge.restartService("terminal")
            }
            Platform.MenuItem {
                text: "Dashboard — Restart"
                onTriggered: supervisorGuiBridge.restartService("dashboard")
            }
            Platform.MenuItem {
                text: "Fallback API — Restart"
                onTriggered: supervisorGuiBridge.restartService("fallback_api")
            }
            Platform.MenuSeparator {}
            Platform.MenuItem {
                text: "Quit Supervisor"
                // Route through the bridge so the Tokio runtime can stop all
                // child processes (Node, Vite, terminal) before we exit.
                // Never call Qt.quit() directly — it would kill the Qt event
                // loop before services are shut down.
                onTriggered: supervisorGuiBridge.quitSupervisor()
            }
        }
    }

    // ── Window content ───────────────────────────────────────────────────────
    ColumnLayout {
        anchors.fill: parent
        anchors.margins: 20
        spacing: 16

        Label {
            text: "PROJECT MEMORY SUPERVISOR"
            font.pixelSize: 22
            font.bold: true
            font.letterSpacing: 1.0
        }

        // ── Scrollable content area ───────────────────────────────────────────
        Flickable {
            Layout.fillWidth: true
            Layout.fillHeight: true
            clip: true
            boundsBehavior: Flickable.StopAtBounds
            contentHeight: scrollContent.implicitHeight
            ScrollBar.vertical: ScrollBar { policy: ScrollBar.AsNeeded }

            ColumnLayout {
                id: scrollContent
                width: parent.width
                spacing: 14

                Label { text: "Core Services"; font.pixelSize: 12; color: "#888888" }

                // ── Service cards (2×2 grid) ──────────────────────────────────
                GridLayout {
                    Layout.fillWidth: true
                    columns: 2
                    rowSpacing: 10
                    columnSpacing: 10

                    // ── MCP Server ────────────────────────────────────────────
                    Rectangle {
                        Layout.fillWidth: true
                        implicitHeight: 130
                        color: "#1a1a1a"; radius: 8; border.color: "#2d2d2d"
                        RowLayout {
                            anchors.fill: parent; anchors.margins: 14; spacing: 14
                            Rectangle {
                                Layout.preferredWidth: 48; Layout.preferredHeight: 48
                                radius: 8; color: "#162a1e"
                                Label { anchors.centerIn: parent; text: "\u2699"; font.pixelSize: 22; color: "#4caf50" }
                            }
                            ColumnLayout {
                                Layout.fillWidth: true; spacing: 4
                                RowLayout {
                                    spacing: 6
                                    Label { text: "MCP Server"; font.bold: true; font.pixelSize: 13 }
                                    Rectangle {
                                        Layout.preferredWidth: 8; Layout.preferredHeight: 8
                                        radius: 4
                                        color: root.statusColor(supervisorGuiBridge.mcpStatus)
                                        Layout.alignment: Qt.AlignVCenter
                                    }
                                    Label { text: supervisorGuiBridge.mcpStatus; font.pixelSize: 12; color: root.statusColor(supervisorGuiBridge.mcpStatus) }
                                }
                                Label {
                                    text: "PID: " + supervisorGuiBridge.mcpPid + "   Port: " + supervisorGuiBridge.mcpPort + "   Runtime: " + supervisorGuiBridge.mcpRuntime + "   Up: " + supervisorGuiBridge.mcpUptimeSecs + "s"
                                    font.pixelSize: 10; color: "#666666"
                                    visible: supervisorGuiBridge.mcpStatus === "Running"
                                }
                                RowLayout {
                                    spacing: 6
                                    Button { text: "Restart"; implicitHeight: 36; leftPadding: 14; rightPadding: 14; onClicked: supervisorGuiBridge.restartService("mcp") }
                                }
                            }
                        }
                    }

                    // ── Interactive Terminal ──────────────────────────────────
                    Rectangle {
                        Layout.fillWidth: true
                        implicitHeight: 130
                        color: "#1a1a1a"; radius: 8; border.color: "#2d2d2d"
                        RowLayout {
                            anchors.fill: parent; anchors.margins: 14; spacing: 14
                            Rectangle {
                                Layout.preferredWidth: 48; Layout.preferredHeight: 48
                                radius: 8; color: "#0d2a2a"
                                Label { anchors.centerIn: parent; text: ">_"; font.pixelSize: 16; font.bold: true; color: "#26c6da" }
                            }
                            ColumnLayout {
                                Layout.fillWidth: true; spacing: 4
                                RowLayout {
                                    spacing: 6
                                    Label { text: "Interactive Terminal"; font.bold: true; font.pixelSize: 13 }
                                    Rectangle {
                                        Layout.preferredWidth: 8; Layout.preferredHeight: 8
                                        radius: 4
                                        color: root.statusColor(supervisorGuiBridge.terminalStatus)
                                        Layout.alignment: Qt.AlignVCenter
                                    }
                                    Label { text: supervisorGuiBridge.terminalStatus; font.pixelSize: 12; color: root.statusColor(supervisorGuiBridge.terminalStatus) }
                                }
                                Label {
                                    text: "PID: " + supervisorGuiBridge.terminalPid + "   Port: " + supervisorGuiBridge.terminalPort + "   Runtime: " + supervisorGuiBridge.terminalRuntime + "   Up: " + supervisorGuiBridge.terminalUptimeSecs + "s"
                                    font.pixelSize: 10; color: "#666666"
                                    visible: supervisorGuiBridge.terminalStatus === "Running"
                                }
                                RowLayout {
                                    spacing: 6
                                    Button {
                                        text: "Open"; implicitHeight: 36; leftPadding: 14; rightPadding: 14
                                        enabled: supervisorGuiBridge.terminalUrl !== ""
                                        onClicked: supervisorGuiBridge.openTerminal()
                                    }
                                    Button {
                                        text: supervisorGuiBridge.terminalStatus === "Running" ? "Stop" : "Start"
                                        implicitHeight: 36; leftPadding: 14; rightPadding: 14
                                        enabled: supervisorGuiBridge.terminalStatus !== "Starting" && supervisorGuiBridge.terminalStatus !== "Stopping"
                                        onClicked: supervisorGuiBridge.terminalStatus === "Running"
                                                   ? supervisorGuiBridge.stopService("terminal")
                                                   : supervisorGuiBridge.startService("terminal")
                                    }
                                }
                            }
                        }
                    }

                    // ── Dashboard ─────────────────────────────────────────────
                    Rectangle {
                        Layout.fillWidth: true
                        implicitHeight: 130
                        color: "#1a1a1a"; radius: 8; border.color: "#2d2d2d"
                        RowLayout {
                            anchors.fill: parent; anchors.margins: 14; spacing: 14
                            Rectangle {
                                Layout.preferredWidth: 48; Layout.preferredHeight: 48
                                radius: 8; color: "#0d1f2e"
                                Label { anchors.centerIn: parent; text: "\u229e"; font.pixelSize: 22; color: "#42a5f5" }
                            }
                            ColumnLayout {
                                Layout.fillWidth: true; spacing: 4
                                RowLayout {
                                    spacing: 6
                                    Label { text: "Dashboard"; font.bold: true; font.pixelSize: 13 }
                                    Rectangle {
                                        Layout.preferredWidth: 8; Layout.preferredHeight: 8
                                        radius: 4
                                        color: root.statusColor(supervisorGuiBridge.dashboardStatus)
                                        Layout.alignment: Qt.AlignVCenter
                                    }
                                    Label { text: supervisorGuiBridge.dashboardStatus; font.pixelSize: 12; color: root.statusColor(supervisorGuiBridge.dashboardStatus) }
                                }
                                Label {
                                    text: "PID: " + supervisorGuiBridge.dashboardPid + "   Port: " + supervisorGuiBridge.dashboardPort + "   Runtime: " + supervisorGuiBridge.dashboardRuntime + "   Up: " + supervisorGuiBridge.dashboardUptimeSecs + "s"
                                    font.pixelSize: 10; color: "#666666"
                                    visible: supervisorGuiBridge.dashboardStatus === "Running"
                                }
                                RowLayout {
                                    spacing: 6
                                    Button {
                                        text: "Visit"; implicitHeight: 36; leftPadding: 14; rightPadding: 14
                                        enabled: supervisorGuiBridge.dashboardUrl !== ""
                                        onClicked: supervisorGuiBridge.openDashboard()
                                    }
                                    Button { text: "Restart"; implicitHeight: 36; leftPadding: 14; rightPadding: 14; onClicked: supervisorGuiBridge.restartService("dashboard") }
                                }
                            }
                        }
                    }

                    // ── Fallback API ──────────────────────────────────────────
                    Rectangle {
                        Layout.fillWidth: true
                        implicitHeight: 130
                        color: "#1a1a1a"; radius: 8; border.color: "#2d2d2d"
                        RowLayout {
                            anchors.fill: parent; anchors.margins: 14; spacing: 14
                            Rectangle {
                                Layout.preferredWidth: 48; Layout.preferredHeight: 48
                                radius: 8; color: "#2a0d0d"
                                Label { anchors.centerIn: parent; text: "{}"; font.pixelSize: 15; font.bold: true; color: "#ef5350" }
                            }
                            ColumnLayout {
                                Layout.fillWidth: true; spacing: 4
                                RowLayout {
                                    spacing: 6
                                    Label { text: "Fallback API"; font.bold: true; font.pixelSize: 13 }
                                    Rectangle {
                                        Layout.preferredWidth: 8; Layout.preferredHeight: 8
                                        radius: 4
                                        color: root.statusColor(supervisorGuiBridge.fallbackStatus)
                                        Layout.alignment: Qt.AlignVCenter
                                    }
                                    Label { text: supervisorGuiBridge.fallbackStatus; font.pixelSize: 12; color: root.statusColor(supervisorGuiBridge.fallbackStatus) }
                                }
                                Label { text: "Proxy route: /api/fallback/*"; font.pixelSize: 10; color: "#666666" }
                                RowLayout {
                                    spacing: 6
                                    Button { text: "Restart"; implicitHeight: 36; leftPadding: 14; rightPadding: 14; onClicked: supervisorGuiBridge.restartService("fallback_api") }
                                }
                            }
                        }
                    }

                } // end GridLayout (service cards)

                // ── Active Sessions + Recent Activity ─────────────────────────
                RowLayout {
                    Layout.fillWidth: true
                    spacing: 10

                    Rectangle {
                        Layout.fillWidth: true
                        implicitHeight: 220
                        color: "#1a1a1a"; radius: 8; border.color: "#2d2d2d"
                        ColumnLayout {
                            anchors.fill: parent; anchors.margins: 14; spacing: 8
                            Label { text: "Active Sessions"; font.bold: true; font.pixelSize: 13 }
                            RowLayout {
                                spacing: 0
                                Label { text: "Session ID";  font.pixelSize: 10; color: "#666666"; Layout.preferredWidth: 130 }
                                Label { text: "Type";        font.pixelSize: 10; color: "#666666"; Layout.fillWidth: true }
                                Label { text: "Status";      font.pixelSize: 10; color: "#666666"; Layout.preferredWidth: 58 }
                                Label { text: "Actions";     font.pixelSize: 10; color: "#666666"; Layout.preferredWidth: 80 }
                            }
                            Rectangle { Layout.fillWidth: true; Layout.preferredHeight: 1; color: "#2a2a2a" }
                            ScrollView {
                                Layout.fillWidth: true; Layout.fillHeight: true; clip: true; contentWidth: availableWidth
                                ColumnLayout {
                                    width: parent.width; spacing: 6
                                    Repeater {
                                        id: sessionsRepeater
                                        model: sessionsList
                                        delegate: RowLayout {
                                            id: sessionRow
                                            required property string sessionId
                                            required property string agentType
                                            required property string sessionKey
                                            function requestStop() {
                                                root.stopSession(sessionKey)
                                            }
                                            Layout.fillWidth: true; spacing: 0
                                            Label { text: sessionRow.sessionId.slice(0, 16); font.pixelSize: 11; Layout.preferredWidth: 130; color: "#cccccc"; elide: Text.ElideRight }
                                            Label { text: sessionRow.agentType; font.pixelSize: 11; Layout.fillWidth: true; color: "#cccccc" }
                                            Rectangle {
                                                Layout.preferredWidth: 58; Layout.preferredHeight: 18
                                                radius: 9; color: "#1b3a1e"
                                                Label { anchors.centerIn: parent; text: "ACTIVE"; font.pixelSize: 9; font.bold: true; color: "#66bb6a" }
                                            }
                                            Button {
                                                text: "Stop"
                                                implicitHeight: 32
                                                leftPadding: 12
                                                rightPadding: 12
                                                Layout.preferredWidth: 80
                                                onClicked: sessionRow.requestStop()
                                            }
                                        }
                                    }
                                    Label {
                                        visible: sessionsRepeater.count === 0
                                        text: "No active sessions"; color: "#555555"; font.pixelSize: 12; Layout.fillWidth: true
                                    }
                                }
                            }
                        }
                    }

                    Rectangle {
                        Layout.fillWidth: true
                        implicitHeight: 220
                        color: "#1a1a1a"; radius: 8; border.color: "#2d2d2d"
                        ColumnLayout {
                            anchors.fill: parent; anchors.margins: 14; spacing: 8
                            Label { text: "Recent Activity"; font.bold: true; font.pixelSize: 13 }
                            Rectangle { Layout.fillWidth: true; Layout.preferredHeight: 1; color: "#2a2a2a" }
                            ScrollView {
                                Layout.fillWidth: true; Layout.fillHeight: true; clip: true; contentWidth: availableWidth
                                ListView {
                                    id: activityView
                                    model: activityList
                                    spacing: 4
                                    delegate: Label {
                                        required property string evType
                                        required property string evTimestamp
                                        width: ListView.view ? ListView.view.width : 0
                                        text: evType + " \u00b7 " + evTimestamp
                                        font.pixelSize: 11; color: "#aaaaaa"; wrapMode: Text.WordWrap
                                    }
                                    Label {
                                        anchors.centerIn: parent; visible: activityView.count === 0
                                        text: "No recent activity"; color: "#555555"; font.pixelSize: 12
                                    }
                                }
                            }
                        }
                    }
                }

                // ── Workspace Cartographer + MCP Proxy + Events ───────────────
                RowLayout {
                    Layout.fillWidth: true
                    spacing: 10

                    Rectangle {
                        Layout.fillWidth: true
                        implicitHeight: 210
                        color: "#1a1a1a"; radius: 8; border.color: "#2d2d2d"
                        ColumnLayout {
                            anchors.fill: parent; anchors.margins: 14; spacing: 10
                            Label { text: "Workspace Cartographer"; font.bold: true; font.pixelSize: 13 }
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
                                            root.selectedWorkspaceId = workspaceModel.get(currentIndex).workspaceId
                                    }
                                    displayText: workspaceModel.count === 0
                                        ? (supervisorGuiBridge.mcpStatus === "Running" ? "No workspaces registered" : "MCP offline")
                                        : currentText
                                }
                                Button {
                                    text: "\u21bb"; implicitWidth: 32; flat: true
                                    enabled: supervisorGuiBridge.mcpPort > 0
                                    onClicked: root.loadWorkspaces()
                                    ToolTip.visible: hovered; ToolTip.text: "Refresh workspace list"; ToolTip.delay: 600
                                }
                            }
                            Button {
                                id: cartographerBtn
                                text: "Scan Project"
                                Layout.fillWidth: true
                                enabled: root.selectedWorkspaceId !== "" && supervisorGuiBridge.mcpStatus === "Running"
                                onClicked: {
                                    cartographerStatus.text = "Scanning\u2026"
                                    cartographerBtn.enabled = false
                                    var wsId = root.selectedWorkspaceId;
                                    var xhr = new XMLHttpRequest();
                                    xhr.onreadystatechange = function() {
                                        if (xhr.readyState === XMLHttpRequest.DONE) {
                                            cartographerBtn.enabled = root.selectedWorkspaceId !== ""
                                                && supervisorGuiBridge.mcpStatus === "Running";
                                            if (xhr.status === 200) {
                                                try {
                                                    var r = JSON.parse(xhr.responseText);
                                                    if (r.success) {
                                                        var inner = r.data && r.data.data ? r.data.data : {};
                                                        var res = inner.result || {};
                                                        var summary = res.summary || {};
                                                        var files = summary.files_total !== undefined ? summary.files_total : "?";
                                                        var elapsed = inner.elapsed_ms !== undefined ? inner.elapsed_ms : "?";
                                                        cartographerStatus.text = "Total: " + files + " files   Scan time: " + elapsed + "ms";
                                                    } else {
                                                        cartographerStatus.text = "Error: " + (r.error || "scan failed");
                                                    }
                                                } catch(e) {
                                                    cartographerStatus.text = "Scan complete";
                                                }
                                            } else {
                                                cartographerStatus.text = "HTTP " + xhr.status;
                                            }
                                        }
                                    };
                                    xhr.open("POST", root.mcpBaseUrl + "/admin/memory_cartographer");
                                    xhr.setRequestHeader("Content-Type", "application/json");
                                    xhr.send(JSON.stringify({ workspace_id: wsId }));
                                }
                            }
                            Label {
                                id: cartographerStatus
                                text: ""
                                font.pixelSize: 11
                                color: text.startsWith("Total") ? "#4caf50"
                                     : (text.startsWith("Error") || text.startsWith("HTTP") ? "#f44336" : "#888888")
                                Layout.fillWidth: true; wrapMode: Text.WordWrap
                            }
                        }
                    }

                    ColumnLayout {
                        Layout.fillWidth: true
                        spacing: 10

                        Rectangle {
                            Layout.fillWidth: true
                            implicitHeight: 120
                            color: "#1a1a1a"; radius: 8; border.color: "#2d2d2d"
                            ColumnLayout {
                                anchors.fill: parent; anchors.margins: 14; spacing: 8
                                Label { text: "MCP Proxy"; font.bold: true; font.pixelSize: 13 }
                                RowLayout {
                                    spacing: 28
                                    ColumnLayout {
                                        spacing: 2
                                        Label { text: supervisorGuiBridge.totalMcpConnections; font.pixelSize: 26; font.bold: true; color: "#e0e0e0" }
                                        Label { text: "Total Connections"; font.pixelSize: 10; color: "#666666" }
                                    }
                                    ColumnLayout {
                                        spacing: 2
                                        Label { text: supervisorGuiBridge.activeMcpInstances; font.pixelSize: 26; font.bold: true; color: "#e0e0e0" }
                                        Label { text: "Active Instances"; font.pixelSize: 10; color: "#666666" }
                                    }
                                    Label {
                                        text: supervisorGuiBridge.mcpInstanceDistribution
                                        font.pixelSize: 11; color: "#888888"; Layout.fillWidth: true
                                        visible: supervisorGuiBridge.totalMcpConnections > 0
                                        wrapMode: Text.WordWrap
                                    }
                                }
                            }
                        }

                        Rectangle {
                            Layout.fillWidth: true
                            implicitHeight: 96
                            color: "#1a1a1a"; radius: 8; border.color: "#2d2d2d"
                            RowLayout {
                                anchors.fill: parent; anchors.margins: 14; spacing: 12
                                ColumnLayout {
                                    spacing: 4; Layout.fillWidth: true
                                    Label { text: "Event Relay"; font.bold: true; font.pixelSize: 13 }
                                    Label {
                                        text: supervisorGuiBridge.eventBroadcastEnabled
                                            ? supervisorGuiBridge.eventsTotalEmitted + " event(s) relayed from MCP"
                                            : "Disabled"
                                        font.pixelSize: 11; color: "#888888"
                                    }
                                    Label {
                                        text: supervisorGuiBridge.eventBroadcastEnabled
                                            ? supervisorGuiBridge.eventSubscriberCount + " ext. subscriber(s) on /supervisor/events"
                                            : ""
                                        font.pixelSize: 10
                                        color: supervisorGuiBridge.eventSubscriberCount > 0 ? "#888888" : "#555555"
                                        visible: supervisorGuiBridge.eventBroadcastEnabled
                                    }
                                }
                                Rectangle {
                                    Layout.preferredWidth: 10; Layout.preferredHeight: 10
                                    radius: 5
                                    color: supervisorGuiBridge.eventBroadcastEnabled
                                        ? (supervisorGuiBridge.eventsTotalEmitted > 0 ? "#4caf50" : "#888888")
                                        : "#555555"
                                    Layout.alignment: Qt.AlignVCenter
                                }
                            }
                        }

                    } // end right ColumnLayout
                }

                Label {
                    Layout.fillWidth: true
                    visible: supervisorGuiBridge.actionFeedback !== ""
                    text: supervisorGuiBridge.actionFeedback
                    color: "#b0bec5"
                    wrapMode: Text.Wrap
                }

            } // end scrollContent ColumnLayout
        } // end Flickable

        // ── Footer ────────────────────────────────────────────────────────────
        RowLayout {
            spacing: 8
            Layout.alignment: Qt.AlignRight

            Button {
                text: "\u2699  Configuration"
                onClicked: {
                    configSaveError.text = ""
                    configTextArea.text = supervisorGuiBridge.loadConfigToml()
                    configEditorOverlay.visible = true
                }
            }
            Button {
                text: "Minimize to Tray"
                onClicked: supervisorGuiBridge.hideWindow()
            }
        }
    }

    // ── In-app config editor overlay ─────────────────────────────────────────
    Rectangle {
        id: configEditorOverlay
        visible: false
        anchors.fill: parent
        color: "#212121"
        z: 10

        ColumnLayout {
            anchors.fill: parent
            anchors.margins: 20
            spacing: 12

            // Header
            RowLayout {
                Layout.fillWidth: true
                spacing: 8

                Label {
                    text: "Edit supervisor.toml"
                    font.pixelSize: 18
                    font.bold: true
                    Layout.fillWidth: true
                }
                Button {
                    text: "Open in Editor"
                    flat: true
                    onClicked: supervisorGuiBridge.openConfig()
                }
            }

            // TOML text area
            Rectangle {
                Layout.fillWidth: true
                Layout.fillHeight: true
                color: "#1a1a1a"
                border.color: "#444444"
                radius: 4
                clip: true

                ScrollView {
                    id: configScrollView
                    anchors.fill: parent
                    anchors.margins: 2
                    ScrollBar.horizontal.policy: ScrollBar.AsNeeded
                    ScrollBar.vertical.policy: ScrollBar.AsNeeded

                    TextArea {
                        id: configTextArea
                        font.family: "Consolas"
                        font.pixelSize: 13
                        wrapMode: TextEdit.NoWrap
                        color: "#e0e0e0"
                        selectByMouse: true
                        background: Item {}
                        padding: 8
                    }
                }
            }

            // Validation error label
            Label {
                id: configSaveError
                visible: text !== ""
                color: "#f44336"
                wrapMode: Text.WordWrap
                Layout.fillWidth: true
            }

            // Action buttons
            RowLayout {
                Layout.alignment: Qt.AlignRight
                spacing: 8

                Button {
                    text: "Save"
                    highlighted: true
                    onClicked: {
                        configSaveError.text = ""
                        if (supervisorGuiBridge.saveConfigToml(configTextArea.text)) {
                            configEditorOverlay.visible = false
                        } else {
                            configSaveError.text = supervisorGuiBridge.configEditorError
                        }
                    }
                }
                Button {
                    text: "Cancel"
                    onClicked: configEditorOverlay.visible = false
                }
            }
        }
    }
}
