import QtQuick 2.15
import QtQuick.Controls 2.15
import QtQuick.Controls.Material 2.15
import QtQuick.Layouts 1.15
import Qt.labs.platform 1.1 as Platform
import com.projectmemory.supervisor

pragma ComponentBehavior: Bound

ApplicationWindow {
    id: root
    width: 1080
    height: 960
    // Window starts hidden — tray icon is the entry point.
    visible: supervisorGuiBridge.windowVisible
    minimumWidth: 640
    minimumHeight: 620
    title: "Project Memory Supervisor"

    Material.theme: Material.Dark
    Material.accent: Material.Blue

    // ── Theme palette ────────────────────────────────────────────────────────
    readonly property color bgWindow:      "#0f1319"
    readonly property color bgPanel:       "#161b22"
    readonly property color bgCard:        "#1c2128"
    readonly property color bgTerminal:    "#0d1117"
    readonly property color borderSubtle:  "#30363d"
    readonly property color textPrimary:   "#c9d1d9"
    readonly property color textSecondary: "#8b949e"
    readonly property color textAccent:    "#58a6ff"
    readonly property color clrRunning:    "#3fb950"
    readonly property color clrStopped:    "#f85149"
    readonly property color clrYellow:     "#ffeb3b"
    color: root.bgWindow

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
        if (s === "Running")                      return root.clrRunning
        if (s === "Starting" || s === "Stopping") return root.clrYellow
        if (s === "Error"    || s === "Stopped")  return root.clrStopped
        return "#9e9e9e"
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
                        var now = new Date().getTime();
                        var staleThresholdMs = 10 * 60 * 1000; // 10 minutes
                        for (var i = 0; i < keys.length && i < 20; i++) {
                            var s = raw[keys[i]];
                            // Skip sessions that haven't had a tool call in 10+ minutes —
                            // these are orphans where clearLiveSession was never called.
                            if (s.lastCallAt) {
                                var lastCall = new Date(s.lastCallAt).getTime();
                                if (now - lastCall > staleThresholdMs) continue;
                            }
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

        // ── Header ────────────────────────────────────────────────────────────
        RowLayout {
            spacing: 14
            Layout.fillWidth: true

            Canvas {
                Layout.preferredWidth: 48; Layout.preferredHeight: 48
                onPaint: {
                    var ctx = getContext("2d")
                    ctx.clearRect(0, 0, 48, 48)
                    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, 48, 48)
                    ctx.strokeStyle = "#ffde59"; ctx.lineWidth = 2; ctx.strokeRect(1, 1, 46, 46)
                    ctx.beginPath()
                    ctx.moveTo(24, 5); ctx.lineTo(43, 24); ctx.lineTo(24, 43); ctx.lineTo(5, 24)
                    ctx.closePath()
                    ctx.strokeStyle = "#000000"; ctx.lineWidth = 3; ctx.stroke()
                    ctx.strokeStyle = "#000000"; ctx.lineWidth = 2
                    ctx.beginPath(); ctx.moveTo(24, 7); ctx.lineTo(24, 41); ctx.stroke()
                    ctx.beginPath(); ctx.moveTo(7, 24); ctx.lineTo(41, 24); ctx.stroke()
                    ctx.fillStyle = "#000000"; ctx.fillRect(18, 18, 12, 12)
                    ctx.fillStyle = "#ffffff"; ctx.fillRect(22, 22, 5, 5)
                    ctx.fillStyle = "#000000"; ctx.fillRect(26, 30, 20, 16)
                    ctx.fillStyle = "#ffffff"; ctx.font = "bold 9px monospace"
                    ctx.textAlign = "center"; ctx.fillText("pm", 36, 42)
                }
            }

            Label {
                text: "PROJECT MEMORY SUPERVISOR"
                font.pixelSize: 20
                font.bold: true
                font.letterSpacing: 1.2
                color: root.textPrimary
            }
        }

        // ── Scrollable content ────────────────────────────────────────────────
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
                spacing: 16

                // ── CORE SERVICES ──────────────────────────────────────────────
                Label {
                    text: "CORE SERVICES"
                    font.pixelSize: 10; font.letterSpacing: 1.0
                    color: root.textSecondary
                }

                GridLayout {
                    Layout.fillWidth: true
                    columns: 2
                    rowSpacing: 12; columnSpacing: 12

                    // ── MCP Server ────────────────────────────────────────────
                    Rectangle {
                        Layout.fillWidth: true
                        implicitHeight: mcpCardCol.implicitHeight + 32
                        color: root.bgPanel; radius: 10; border.color: root.borderSubtle
                        ColumnLayout {
                            id: mcpCardCol
                            anchors { left: parent.left; right: parent.right; top: parent.top; margins: 16 }
                            spacing: 12
                            RowLayout {
                                Layout.fillWidth: true; spacing: 8
                                Rectangle {
                                    Layout.preferredWidth: 32; Layout.preferredHeight: 32; radius: 6; color: "#1a1628"
                                    Canvas {
                                        anchors.fill: parent
                                        onPaint: {
                                            var c = getContext("2d")
                                            c.clearRect(0, 0, 32, 32)
                                            c.save(); c.scale(32/512, 32/512)
                                            c.beginPath(); c.arc(256, 256, 144, 0, Math.PI * 2)
                                            c.strokeStyle = "#ff90e8"; c.lineWidth = 28; c.stroke()
                                            c.beginPath()
                                            c.moveTo(320, 40); c.lineTo(120, 280); c.lineTo(260, 280)
                                            c.lineTo(160, 480); c.lineTo(440, 200); c.lineTo(280, 200)
                                            c.closePath(); c.fillStyle = "#ff90e8"; c.fill()
                                            c.restore()
                                        }
                                    }
                                }
                                Label { text: "MCP Server"; font.bold: true; font.pixelSize: 13; color: root.textPrimary; Layout.fillWidth: true }
                                RowLayout {
                                    spacing: 5
                                    Rectangle { Layout.preferredWidth: 8; Layout.preferredHeight: 8; radius: 4; color: root.statusColor(supervisorGuiBridge.mcpStatus) }
                                    Label { text: supervisorGuiBridge.mcpStatus; font.pixelSize: 12; color: root.statusColor(supervisorGuiBridge.mcpStatus) }
                                }
                            }
                            RowLayout {
                                Layout.fillWidth: true; spacing: 12
                                Canvas {
                                    Layout.preferredWidth: 48; Layout.preferredHeight: 48
                                    property string svc: supervisorGuiBridge.mcpStatus
                                    onSvcChanged: requestPaint()
                                    Component.onCompleted: requestPaint()
                                    onPaint: {
                                        var c = getContext("2d")
                                        c.clearRect(0, 0, 48, 48)
                                        c.beginPath(); c.arc(24, 24, 18, 0, Math.PI * 2)
                                        c.strokeStyle = root.borderSubtle; c.lineWidth = 4; c.stroke()
                                        if (svc === "Running") {
                                            c.beginPath(); c.arc(24, 24, 18, -Math.PI / 2, 3 * Math.PI / 2)
                                            c.strokeStyle = "#ff90e8"; c.lineWidth = 4; c.stroke()
                                        } else if (svc === "Error" || svc === "Starting" || svc === "Stopping") {
                                            c.beginPath(); c.arc(24, 24, 18, -Math.PI / 2, Math.PI / 2)
                                            c.strokeStyle = "#ff90e8"; c.lineWidth = 4; c.stroke()
                                        }
                                    }
                                }
                                ColumnLayout {
                                    Layout.fillWidth: true; spacing: 3
                                    Label {
                                        text: "PID: " + supervisorGuiBridge.mcpPid + "   Port: " + supervisorGuiBridge.mcpPort
                                        font.pixelSize: 11; color: root.textSecondary
                                        visible: supervisorGuiBridge.mcpStatus === "Running"
                                    }
                                    Label {
                                        text: "Runtime: " + supervisorGuiBridge.mcpRuntime + "   Up: " + supervisorGuiBridge.mcpUptimeSecs + "s"
                                        font.pixelSize: 11; color: root.textSecondary
                                        visible: supervisorGuiBridge.mcpStatus === "Running"
                                    }
                                    Label {
                                        text: "Service offline"
                                        font.pixelSize: 11; color: root.textSecondary
                                        visible: supervisorGuiBridge.mcpStatus !== "Running"
                                    }
                                }
                                RowLayout {
                                    spacing: 8
                                    Button { text: "Manage"; implicitHeight: 32; leftPadding: 12; rightPadding: 12; font.pixelSize: 12 }
                                    Button { text: "Restart"; implicitHeight: 32; leftPadding: 12; rightPadding: 12; font.pixelSize: 12; onClicked: supervisorGuiBridge.restartService("mcp") }
                                }
                            }
                        }
                    }

                    // ── Interactive Terminal ──────────────────────────────────
                    Rectangle {
                        Layout.fillWidth: true
                        implicitHeight: termCardCol.implicitHeight + 32
                        color: root.bgPanel; radius: 10; border.color: root.borderSubtle
                        ColumnLayout {
                            id: termCardCol
                            anchors { left: parent.left; right: parent.right; top: parent.top; margins: 16 }
                            spacing: 12
                            RowLayout {
                                Layout.fillWidth: true; spacing: 8
                                Rectangle {
                                    Layout.preferredWidth: 32; Layout.preferredHeight: 32; radius: 6; color: "#0d1f30"
                                    Canvas {
                                        anchors.fill: parent
                                        onPaint: {
                                            var c = getContext("2d")
                                            c.clearRect(0, 0, 32, 32)
                                            c.save(); c.scale(32/512, 32/512)
                                            c.strokeStyle = "#38b6ff"; c.lineWidth = 28
                                            c.strokeRect(56, 112, 400, 288)
                                            c.fillStyle = "#38b6ff"; c.globalAlpha = 0.4
                                            c.fillRect(56, 112, 400, 68); c.globalAlpha = 1.0
                                            c.beginPath()
                                            c.moveTo(100, 224); c.lineTo(148, 272); c.lineTo(100, 320)
                                            c.lineJoin = "miter"; c.lineCap = "square"
                                            c.strokeStyle = "#38b6ff"; c.lineWidth = 26; c.stroke()
                                            c.fillStyle = "#38b6ff"
                                            c.fillRect(180, 296, 80, 22)
                                            c.fillRect(100, 350, 160, 22)
                                            c.restore()
                                        }
                                    }
                                }
                                Label { text: "Interactive Terminal"; font.bold: true; font.pixelSize: 13; color: root.textPrimary; Layout.fillWidth: true }
                                RowLayout {
                                    spacing: 5
                                    Rectangle { Layout.preferredWidth: 8; Layout.preferredHeight: 8; radius: 4; color: root.statusColor(supervisorGuiBridge.terminalStatus) }
                                    Label { text: supervisorGuiBridge.terminalStatus; font.pixelSize: 12; color: root.statusColor(supervisorGuiBridge.terminalStatus) }
                                }
                            }
                            RowLayout {
                                Layout.fillWidth: true; spacing: 12
                                Canvas {
                                    Layout.preferredWidth: 48; Layout.preferredHeight: 48
                                    property string svc: supervisorGuiBridge.terminalStatus
                                    onSvcChanged: requestPaint()
                                    Component.onCompleted: requestPaint()
                                    onPaint: {
                                        var c = getContext("2d")
                                        c.clearRect(0, 0, 48, 48)
                                        c.beginPath(); c.arc(24, 24, 18, 0, Math.PI * 2)
                                        c.strokeStyle = root.borderSubtle; c.lineWidth = 4; c.stroke()
                                        if (svc === "Running") {
                                            c.beginPath(); c.arc(24, 24, 18, -Math.PI / 2, 3 * Math.PI / 2)
                                            c.strokeStyle = "#38b6ff"; c.lineWidth = 4; c.stroke()
                                        } else if (svc === "Error" || svc === "Starting" || svc === "Stopping") {
                                            c.beginPath(); c.arc(24, 24, 18, -Math.PI / 2, Math.PI / 2)
                                            c.strokeStyle = "#38b6ff"; c.lineWidth = 4; c.stroke()
                                        }
                                    }
                                }
                                ColumnLayout {
                                    Layout.fillWidth: true; spacing: 3
                                    Label {
                                        text: "PID: " + supervisorGuiBridge.terminalPid + "   Port: " + supervisorGuiBridge.terminalPort
                                        font.pixelSize: 11; color: root.textSecondary
                                        visible: supervisorGuiBridge.terminalStatus === "Running"
                                    }
                                    Label {
                                        text: "Runtime: " + supervisorGuiBridge.terminalRuntime + "   Up: " + supervisorGuiBridge.terminalUptimeSecs + "s"
                                        font.pixelSize: 11; color: root.textSecondary
                                        visible: supervisorGuiBridge.terminalStatus === "Running"
                                    }
                                }
                                RowLayout {
                                    spacing: 8
                                    Button {
                                        text: "Open"; implicitHeight: 32; leftPadding: 12; rightPadding: 12; font.pixelSize: 12
                                        enabled: supervisorGuiBridge.terminalUrl !== ""
                                        onClicked: supervisorGuiBridge.openTerminal()
                                    }
                                    Button {
                                        text: supervisorGuiBridge.terminalStatus === "Running" ? "Stop" : "Start"
                                        implicitHeight: 32; leftPadding: 12; rightPadding: 12; font.pixelSize: 12
                                        enabled: supervisorGuiBridge.terminalStatus !== "Starting" && supervisorGuiBridge.terminalStatus !== "Stopping"
                                        onClicked: supervisorGuiBridge.terminalStatus === "Running"
                                                   ? supervisorGuiBridge.stopService("terminal")
                                                   : supervisorGuiBridge.startService("terminal")
                                    }
                                }
                            }
                            // Runtime info strip
                            Rectangle {
                                Layout.fillWidth: true; implicitHeight: 36
                                color: root.bgTerminal; radius: 4; border.color: root.borderSubtle
                                RowLayout {
                                    anchors { fill: parent; leftMargin: 10; rightMargin: 10 }
                                    Label { text: "runtime"; font.pixelSize: 10; color: root.textSecondary }
                                    Label {
                                        text: supervisorGuiBridge.terminalStatus === "Running" ? supervisorGuiBridge.terminalRuntime : "\u2014"
                                        font.pixelSize: 11; color: root.textPrimary; font.family: "Consolas"
                                        Layout.fillWidth: true; elide: Text.ElideRight
                                    }
                                }
                            }
                        }
                    }

                    // ── Dashboard ─────────────────────────────────────────────
                    Rectangle {
                        Layout.fillWidth: true
                        implicitHeight: dashCardCol.implicitHeight + 32
                        color: root.bgPanel; radius: 10; border.color: root.borderSubtle
                        ColumnLayout {
                            id: dashCardCol
                            anchors { left: parent.left; right: parent.right; top: parent.top; margins: 16 }
                            spacing: 12
                            RowLayout {
                                Layout.fillWidth: true; spacing: 8
                                Rectangle {
                                    Layout.preferredWidth: 32; Layout.preferredHeight: 32; radius: 6; color: "#0d1f2e"
                                    Canvas {
                                        anchors.fill: parent
                                        onPaint: {
                                            var c = getContext("2d")
                                            c.clearRect(0, 0, 32, 32)
                                            c.save(); c.scale(32/24, 32/24)
                                            c.fillStyle = "#42a5f5"
                                            c.fillRect(3, 3, 7, 9)
                                            c.fillRect(14, 3, 7, 5)
                                            c.fillRect(14, 12, 7, 9)
                                            c.fillRect(3, 16, 7, 5)
                                            c.restore()
                                        }
                                    }
                                }
                                Label { text: "Dashboard"; font.bold: true; font.pixelSize: 13; color: root.textPrimary; Layout.fillWidth: true }
                                RowLayout {
                                    spacing: 5
                                    Rectangle { Layout.preferredWidth: 8; Layout.preferredHeight: 8; radius: 4; color: root.statusColor(supervisorGuiBridge.dashboardStatus) }
                                    Label { text: supervisorGuiBridge.dashboardStatus; font.pixelSize: 12; color: root.statusColor(supervisorGuiBridge.dashboardStatus) }
                                }
                            }
                            RowLayout {
                                Layout.fillWidth: true; spacing: 12
                                Canvas {
                                    Layout.preferredWidth: 48; Layout.preferredHeight: 48
                                    property string svc: supervisorGuiBridge.dashboardStatus
                                    onSvcChanged: requestPaint()
                                    Component.onCompleted: requestPaint()
                                    onPaint: {
                                        var c = getContext("2d")
                                        c.clearRect(0, 0, 48, 48)
                                        c.beginPath(); c.arc(24, 24, 18, 0, Math.PI * 2)
                                        c.strokeStyle = root.borderSubtle; c.lineWidth = 4; c.stroke()
                                        if (svc === "Running") {
                                            c.beginPath(); c.arc(24, 24, 18, -Math.PI / 2, 3 * Math.PI / 2)
                                            c.strokeStyle = "#42a5f5"; c.lineWidth = 4; c.stroke()
                                        } else if (svc === "Error" || svc === "Starting" || svc === "Stopping") {
                                            c.beginPath(); c.arc(24, 24, 18, -Math.PI / 2, Math.PI / 2)
                                            c.strokeStyle = "#42a5f5"; c.lineWidth = 4; c.stroke()
                                        }
                                    }
                                }
                                ColumnLayout {
                                    Layout.fillWidth: true; spacing: 3
                                    Label {
                                        text: "PID: " + supervisorGuiBridge.dashboardPid + "   Port: " + supervisorGuiBridge.dashboardPort
                                        font.pixelSize: 11; color: root.textSecondary
                                        visible: supervisorGuiBridge.dashboardStatus === "Running"
                                    }
                                    Label {
                                        text: "Runtime: " + supervisorGuiBridge.dashboardRuntime + "   Up: " + supervisorGuiBridge.dashboardUptimeSecs + "s"
                                        font.pixelSize: 11; color: root.textSecondary
                                        visible: supervisorGuiBridge.dashboardStatus === "Running"
                                    }
                                    Label {
                                        text: "Service offline"
                                        font.pixelSize: 11; color: root.textSecondary
                                        visible: supervisorGuiBridge.dashboardStatus !== "Running"
                                    }
                                }
                                RowLayout {
                                    spacing: 8
                                    Button {
                                        text: "Visit"; implicitHeight: 32; leftPadding: 12; rightPadding: 12; font.pixelSize: 12
                                        enabled: supervisorGuiBridge.dashboardUrl !== ""
                                        onClicked: supervisorGuiBridge.openDashboard()
                                    }
                                    Button { text: "Restart"; implicitHeight: 32; leftPadding: 12; rightPadding: 12; font.pixelSize: 12; onClicked: supervisorGuiBridge.restartService("dashboard") }
                                }
                            }
                        }
                    }

                    // ── Fallback API ──────────────────────────────────────────
                    Rectangle {
                        Layout.fillWidth: true
                        implicitHeight: fallbackCardCol.implicitHeight + 32
                        color: root.bgPanel; radius: 10; border.color: root.borderSubtle
                        ColumnLayout {
                            id: fallbackCardCol
                            anchors { left: parent.left; right: parent.right; top: parent.top; margins: 16 }
                            spacing: 12
                            RowLayout {
                                Layout.fillWidth: true; spacing: 8
                                Rectangle {
                                    Layout.preferredWidth: 32; Layout.preferredHeight: 32; radius: 6; color: "#2a0d0d"
                                    Canvas {
                                        anchors.fill: parent
                                        onPaint: {
                                            var c = getContext("2d")
                                            c.clearRect(0, 0, 32, 32)
                                            c.save(); c.scale(32/512, 32/512)
                                            c.strokeStyle = "#ef5350"; c.lineWidth = 30
                                            c.strokeRect(108, 88, 296, 344)
                                            c.fillStyle = "#ef5350"; c.fillRect(180, 56, 152, 60)
                                            c.beginPath()
                                            c.moveTo(140, 300); c.lineTo(240, 400); c.lineTo(460, 170)
                                            c.lineJoin = "miter"; c.lineCap = "square"
                                            c.strokeStyle = "#ef5350"; c.lineWidth = 40; c.stroke()
                                            c.restore()
                                        }
                                    }
                                }
                                Label { text: "Fallback API"; font.bold: true; font.pixelSize: 13; color: root.textPrimary; Layout.fillWidth: true }
                                RowLayout {
                                    spacing: 5
                                    Rectangle { Layout.preferredWidth: 8; Layout.preferredHeight: 8; radius: 4; color: root.statusColor(supervisorGuiBridge.fallbackStatus) }
                                    Label { text: supervisorGuiBridge.fallbackStatus; font.pixelSize: 12; color: root.statusColor(supervisorGuiBridge.fallbackStatus) }
                                }
                            }
                            RowLayout {
                                Layout.fillWidth: true; spacing: 12
                                Canvas {
                                    Layout.preferredWidth: 48; Layout.preferredHeight: 48
                                    property string svc: supervisorGuiBridge.fallbackStatus
                                    onSvcChanged: requestPaint()
                                    Component.onCompleted: requestPaint()
                                    onPaint: {
                                        var c = getContext("2d")
                                        c.clearRect(0, 0, 48, 48)
                                        c.beginPath(); c.arc(24, 24, 18, 0, Math.PI * 2)
                                        c.strokeStyle = root.borderSubtle; c.lineWidth = 4; c.stroke()
                                        if (svc === "Running") {
                                            c.beginPath(); c.arc(24, 24, 18, -Math.PI / 2, 3 * Math.PI / 2)
                                            c.strokeStyle = "#ef5350"; c.lineWidth = 4; c.stroke()
                                        } else if (svc === "Error" || svc === "Starting" || svc === "Stopping") {
                                            c.beginPath(); c.arc(24, 24, 18, -Math.PI / 2, Math.PI / 2)
                                            c.strokeStyle = "#ef5350"; c.lineWidth = 4; c.stroke()
                                        }
                                    }
                                }
                                ColumnLayout {
                                    Layout.fillWidth: true; spacing: 3
                                    Label { text: "Proxy route: /api/fallback/*"; font.pixelSize: 11; color: root.textSecondary }
                                    Label {
                                        text: "Service offline"
                                        font.pixelSize: 11; color: root.textSecondary
                                        visible: supervisorGuiBridge.fallbackStatus !== "Running"
                                    }
                                }
                                Button { text: "Restart"; implicitHeight: 32; leftPadding: 12; rightPadding: 12; font.pixelSize: 12; onClicked: supervisorGuiBridge.restartService("fallback_api") }
                            }
                        }
                    }

                } // end GridLayout (service cards)

                // ── ACTIVE SESSIONS + RECENT ACTIVITY ────────────────────────
                RowLayout {
                    Layout.fillWidth: true
                    spacing: 12

                    Rectangle {
                        Layout.fillWidth: true
                        implicitHeight: 230
                        color: root.bgPanel; radius: 10; border.color: root.borderSubtle
                        ColumnLayout {
                            anchors.fill: parent; anchors.margins: 14; spacing: 8
                            Label { text: "ACTIVE SESSIONS"; font.pixelSize: 10; font.letterSpacing: 1.0; color: root.textSecondary }
                            RowLayout {
                                spacing: 0; Layout.fillWidth: true
                                Label { text: "SESSION ID";  font.pixelSize: 10; color: root.textSecondary; Layout.preferredWidth: 140 }
                                Label { text: "AGENT";       font.pixelSize: 10; color: root.textSecondary; Layout.fillWidth: true }
                                Label { text: "STATUS";      font.pixelSize: 10; color: root.textSecondary; Layout.preferredWidth: 70 }
                                Label { text: "ACTIONS";     font.pixelSize: 10; color: root.textSecondary; Layout.preferredWidth: 85 }
                            }
                            Rectangle { Layout.fillWidth: true; Layout.preferredHeight: 1; color: root.borderSubtle }
                            ScrollView {
                                Layout.fillWidth: true; Layout.fillHeight: true; clip: true; contentWidth: availableWidth
                                ColumnLayout {
                                    width: parent.width; spacing: 2
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
                                            Layout.fillWidth: true; spacing: 0; implicitHeight: 34
                                            Label { text: sessionRow.sessionId.slice(0, 14); font.pixelSize: 11; font.family: "Consolas"; color: root.textPrimary; Layout.preferredWidth: 140; elide: Text.ElideRight }
                                            Label { text: sessionRow.agentType; font.pixelSize: 11; color: root.textPrimary; Layout.fillWidth: true }
                                            Rectangle {
                                                Layout.preferredWidth: 70; Layout.preferredHeight: 20; color: "#0e2318"; radius: 10
                                                Label { anchors.centerIn: parent; text: "ACTIVE"; font.pixelSize: 9; font.bold: true; color: root.clrRunning }
                                            }
                                            Button {
                                                text: "Stop"; implicitHeight: 28; leftPadding: 10; rightPadding: 10; font.pixelSize: 11; Layout.preferredWidth: 85
                                                onClicked: sessionRow.requestStop()
                                            }
                                        }
                                    }
                                    Label {
                                        visible: sessionsRepeater.count === 0
                                        text: "No active sessions"; color: root.textSecondary; font.pixelSize: 12; Layout.fillWidth: true
                                    }
                                }
                            }
                        }
                    }

                    Rectangle {
                        Layout.fillWidth: true
                        implicitHeight: 230
                        color: root.bgPanel; radius: 10; border.color: root.borderSubtle
                        ColumnLayout {
                            anchors.fill: parent; anchors.margins: 14; spacing: 8
                            Label { text: "RECENT ACTIVITY"; font.pixelSize: 10; font.letterSpacing: 1.0; color: root.textSecondary }
                            Rectangle { Layout.fillWidth: true; Layout.preferredHeight: 1; color: root.borderSubtle }
                            Rectangle {
                                Layout.fillWidth: true; Layout.fillHeight: true
                                color: root.bgTerminal; radius: 4; border.color: root.borderSubtle; clip: true
                                ScrollView {
                                    anchors.fill: parent; anchors.margins: 8; contentWidth: availableWidth
                                    ListView {
                                        id: activityView
                                        model: activityList
                                        spacing: 4
                                        delegate: Label {
                                            required property string evType
                                            required property string evTimestamp
                                            width: ListView.view ? ListView.view.width : 0
                                            text: evType + " \u00b7 " + evTimestamp
                                            font.pixelSize: 11; font.family: "Consolas"
                                            color: evType.indexOf("handoff") >= 0 ? root.clrRunning
                                                 : (evType.indexOf("error") >= 0 ? root.clrStopped
                                                 : root.textSecondary)
                                            wrapMode: Text.WordWrap
                                        }
                                        Label {
                                            anchors.centerIn: parent; visible: activityView.count === 0
                                            text: "No recent activity"; color: root.textSecondary; font.pixelSize: 12
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                // ── WORKSPACE CARTOGRAPHER + MCP PROXY + EVENTS ──────────────
                RowLayout {
                    Layout.fillWidth: true
                    spacing: 12

                    Rectangle {
                        Layout.fillWidth: true
                        implicitHeight: 214
                        color: root.bgPanel; radius: 10; border.color: root.borderSubtle
                        ColumnLayout {
                            anchors.fill: parent; anchors.margins: 14; spacing: 10
                            RowLayout {
                                spacing: 8
                                Canvas {
                                    Layout.preferredWidth: 26; Layout.preferredHeight: 26
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
                                        c.beginPath(); c.moveTo(60, 256); c.lineTo(452, 256); c.stroke()
                                        c.fillStyle = "#cc3333"; c.fillRect(200, 200, 112, 112)
                                        c.fillStyle = "#1c2128"; c.fillRect(224, 224, 64, 64)
                                        c.restore()
                                    }
                                }
                                Label { text: "WORKSPACE CARTOGRAPHER"; font.pixelSize: 10; font.letterSpacing: 1.0; color: root.textSecondary; Layout.fillWidth: true }
                            }
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
                                color: text.startsWith("Total") ? root.clrRunning
                                     : (text.startsWith("Error") || text.startsWith("HTTP") ? root.clrStopped : root.textSecondary)
                                Layout.fillWidth: true; wrapMode: Text.WordWrap
                            }
                        }
                    }

                    ColumnLayout {
                        Layout.fillWidth: true
                        spacing: 12

                        // MCP Proxy
                        Rectangle {
                            Layout.fillWidth: true
                            implicitHeight: 120
                            color: root.bgPanel; radius: 10; border.color: root.borderSubtle
                            ColumnLayout {
                                anchors.fill: parent; anchors.margins: 14; spacing: 8
                                Label { text: "MCP PROXY"; font.pixelSize: 10; font.letterSpacing: 1.0; color: root.textSecondary }
                                RowLayout {
                                    spacing: 24; Layout.fillWidth: true
                                    ColumnLayout {
                                        spacing: 2
                                        Label { text: "" + supervisorGuiBridge.totalMcpConnections; font.pixelSize: 26; font.bold: true; color: root.textPrimary }
                                        Label { text: "Total Connections"; font.pixelSize: 10; color: root.textSecondary }
                                    }
                                    ColumnLayout {
                                        spacing: 2
                                        Label { text: "" + supervisorGuiBridge.activeMcpInstances; font.pixelSize: 26; font.bold: true; color: root.textPrimary }
                                        Label { text: "Active Instances"; font.pixelSize: 10; color: root.textSecondary }
                                    }
                                    Canvas {
                                        Layout.fillWidth: true; implicitHeight: 40
                                        property int connCount: supervisorGuiBridge.totalMcpConnections
                                        onConnCountChanged: requestPaint()
                                        Component.onCompleted: requestPaint()
                                        onPaint: {
                                            var c = getContext("2d")
                                            c.clearRect(0, 0, width, height)
                                            c.strokeStyle = root.textAccent; c.lineWidth = 1.5
                                            c.beginPath()
                                            var pts = [0.9, 0.7, 0.8, 0.3, 0.5, 0.1]
                                            for (var i = 0; i < pts.length; i++) {
                                                var px = i * width / (pts.length - 1)
                                                var py = (1.0 - pts[i]) * (height - 4) + 2
                                                if (i === 0) c.moveTo(px, py); else c.lineTo(px, py)
                                            }
                                            c.stroke()
                                        }
                                    }
                                    Label {
                                        text: supervisorGuiBridge.mcpInstanceDistribution
                                        font.pixelSize: 11; color: root.textSecondary
                                        visible: supervisorGuiBridge.totalMcpConnections > 0
                                        wrapMode: Text.WordWrap
                                    }
                                }
                            }
                        }

                        // Event Broadcast
                        Rectangle {
                            Layout.fillWidth: true
                            implicitHeight: 100
                            color: root.bgPanel; radius: 10; border.color: root.borderSubtle
                            RowLayout {
                                anchors.fill: parent; anchors.margins: 14; spacing: 12
                                ColumnLayout {
                                    spacing: 4; Layout.fillWidth: true
                                    Label { text: "EVENT BROADCAST"; font.pixelSize: 10; font.letterSpacing: 1.0; color: root.textSecondary }
                                    Label {
                                        text: supervisorGuiBridge.eventBroadcastEnabled
                                            ? supervisorGuiBridge.eventsTotalEmitted + " event(s) relayed from MCP"
                                            : "Broadcast channel disabled"
                                        font.pixelSize: 11; color: root.textSecondary
                                    }
                                    Label {
                                        text: supervisorGuiBridge.eventSubscriberCount + " subscriber(s) on /supervisor/events"
                                        font.pixelSize: 10
                                        color: supervisorGuiBridge.eventSubscriberCount > 0 ? root.clrRunning : root.textSecondary
                                        visible: supervisorGuiBridge.eventBroadcastEnabled
                                    }
                                }
                                // Animated toggle indicator
                                Rectangle {
                                    Layout.preferredWidth: 40; Layout.preferredHeight: 22; radius: 11
                                    color: supervisorGuiBridge.eventBroadcastEnabled ? root.clrRunning : root.borderSubtle
                                    Behavior on color { ColorAnimation { duration: 150 } }
                                    Rectangle {
                                        width: 18; height: 18; radius: 9; color: "white"
                                        anchors.verticalCenter: parent.verticalCenter
                                        x: supervisorGuiBridge.eventBroadcastEnabled ? parent.width - width - 2 : 2
                                        Behavior on x { NumberAnimation { duration: 150 } }
                                    }
                                }
                            }
                        }

                    } // end right ColumnLayout
                }

                Label {
                    Layout.fillWidth: true
                    visible: supervisorGuiBridge.actionFeedback !== ""
                    text: supervisorGuiBridge.actionFeedback
                    color: root.textSecondary
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
