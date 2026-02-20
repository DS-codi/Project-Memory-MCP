import QtQuick 2.15
import QtQuick.Controls 2.15
import QtQuick.Controls.Material 2.15
import QtQuick.Layouts 1.15
import com.projectmemory.approval 1.0

ApplicationWindow {
    id: root
    visible: true
    width: 500
    height: 350
    title: approvalApp.title
    color: "#1e1e1e"
    flags: Qt.Window | Qt.WindowStaysOnTopHint

    Material.theme: Material.Dark
    Material.accent: Material.Blue

    ApprovalApp {
        id: approvalApp

        onFormCompleted: {
            closeTimer.start();
        }
    }

    Timer {
        id: closeTimer
        interval: 500
        repeat: false
        onTriggered: Qt.quit()
    }

    // Pause timer on any mouse interaction inside the window.
    MouseArea {
        anchors.fill: parent
        hoverEnabled: true
        propagateComposedEvents: true
        acceptedButtons: Qt.NoButton

        onEntered: {
            if (!approvalApp.formSubmitted) approvalApp.pauseTimer();
        }
        onExited: {
            if (!approvalApp.formSubmitted) approvalApp.resumeTimer();
        }
    }

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: 0
        spacing: 0

        // ── Countdown bar (top) ─────────────────────────────────
        CountdownBar {
            Layout.fillWidth: true
            remainingSeconds: approvalApp.remainingSeconds
            totalSeconds: approvalApp.totalSeconds
            paused: approvalApp.timerPaused
        }

        // ── Urgency badge + title ───────────────────────────────
        Rectangle {
            Layout.fillWidth: true
            Layout.preferredHeight: headerCol.implicitHeight + 24
            color: "#252526"

            ColumnLayout {
                id: headerCol
                anchors.fill: parent
                anchors.margins: 16
                spacing: 6

                RowLayout {
                    spacing: 8

                    // Urgency badge
                    Rectangle {
                        width: urgencyLabel.implicitWidth + 16
                        height: 22
                        radius: 4
                        color: {
                            var u = approvalApp.urgency.toString();
                            if (u === "critical") return "#c62828";
                            if (u === "high") return "#e65100";
                            if (u === "medium") return "#f9a825";
                            return "#2e7d32";
                        }

                        Label {
                            id: urgencyLabel
                            anchors.centerIn: parent
                            text: approvalApp.urgency.toString().toUpperCase()
                            font.pixelSize: 10
                            font.bold: true
                            color: "#ffffff"
                        }
                    }

                    Label {
                        text: approvalApp.title
                        font.pixelSize: 16
                        font.bold: true
                        color: "#ffffff"
                        Layout.fillWidth: true
                        elide: Text.ElideRight
                    }
                }

                // Plan + phase context
                Label {
                    text: approvalApp.planTitle
                    font.pixelSize: 12
                    color: "#8888aa"
                    visible: text.length > 0
                    elide: Text.ElideRight
                    Layout.fillWidth: true
                }

                Label {
                    text: approvalApp.phase
                    font.pixelSize: 11
                    color: "#666688"
                    visible: text.length > 0
                    elide: Text.ElideRight
                    Layout.fillWidth: true
                }
            }
        }

        // ── Step task description ───────────────────────────────
        Rectangle {
            Layout.fillWidth: true
            Layout.preferredHeight: stepTaskLabel.implicitHeight + 24
            color: "#1e1e1e"

            Label {
                id: stepTaskLabel
                anchors.fill: parent
                anchors.margins: 16
                text: "Step " + (approvalApp.stepIndex + 1) + ": " + approvalApp.stepTask
                font.pixelSize: 13
                color: "#cccccc"
                wrapMode: Text.WordWrap
            }
        }

        // ── Spacer ──────────────────────────────────────────────
        Item { Layout.fillHeight: true }

        // ── Notes field ─────────────────────────────────────────
        TextField {
            id: notesField
            Layout.fillWidth: true
            Layout.leftMargin: 16
            Layout.rightMargin: 16
            placeholderText: "Add notes about your decision (optional)"
            font.pixelSize: 12
            color: "#ffffff"
            enabled: !approvalApp.formSubmitted
            Material.accent: Material.Blue

            onTextChanged: {
                approvalApp.setNotes(text);
            }
        }

        // ── Approve / Reject buttons ────────────────────────────
        Rectangle {
            Layout.fillWidth: true
            Layout.preferredHeight: 56
            color: "#252526"

            RowLayout {
                anchors.fill: parent
                anchors.margins: 12
                spacing: 12

                Item { Layout.fillWidth: true }

                Button {
                    id: rejectBtn
                    text: "Reject"
                    font.pixelSize: 13
                    flat: true
                    enabled: !approvalApp.formSubmitted
                    Material.foreground: "#F44336"

                    onClicked: approvalApp.reject()

                    Shortcut {
                        sequence: "Escape"
                        onActivated: rejectBtn.clicked()
                    }
                }

                Button {
                    id: approveBtn
                    text: "Approve"
                    font.pixelSize: 13
                    highlighted: true
                    enabled: !approvalApp.formSubmitted
                    Material.background: "#2e7d32"
                    Material.foreground: "#ffffff"

                    onClicked: approvalApp.approve()

                    Shortcut {
                        sequence: "Return"
                        onActivated: approveBtn.clicked()
                    }
                }
            }
        }
    }
}
