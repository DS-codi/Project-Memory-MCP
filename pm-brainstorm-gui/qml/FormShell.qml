import QtQuick 2.15
import QtQuick.Controls 2.15
import QtQuick.Controls.Material 2.15
import QtQuick.Layouts 1.15

// FormShell.qml — Main form container layout.
//
// Top-level layout: header → countdown → scrollable questions → action buttons.
// Expects a `formApp` context property with QObject properties/invokables.

Item {
    id: shell

    // The bridge QObject driving this form.
    property var formApp: null

    // Parsed questions array (derived from formApp.questionsJson).
    property var questions: []

    // Parsed answers map (derived from formApp.answersJson).
    property var answers: ({})

    // Re-parse questions when the JSON changes.
    Connections {
        target: formApp
        function onQuestionsJsonChanged() { shell.questions = parseJson(formApp.questionsJson, []); }
        function onAnswersJsonChanged()   { shell.answers   = parseJson(formApp.answersJson, {}); }
    }

    function parseJson(str, fallback) {
        try { return JSON.parse(str); }
        catch (e) { return fallback; }
    }

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: 0
        spacing: 0

    // ── Refinement loading overlay ───────────────────────────────
    // This Rectangle sits on top of the ColumnLayout in z-order.
    // Declared here so it anchors to `shell` (the root Item).
    Rectangle {
        id: refinementOverlay
        anchors.fill: shell
        z: 10
        color: "#cc1e1e1e"
        visible: formApp ? formApp.refinementPending : false
        radius: 0

        Column {
            anchors.centerIn: parent
            spacing: 16

            BusyIndicator {
                anchors.horizontalCenter: parent.horizontalCenter
                running: refinementOverlay.visible
                Material.accent: Material.Orange
            }

            Label {
                anchors.horizontalCenter: parent.horizontalCenter
                text: "Regenerating options\u2026"
                font.pixelSize: 16
                color: "#ffffff"
            }
        }
    }

        // ── Header ──────────────────────────────────────────────
        Rectangle {
            Layout.fillWidth: true
            Layout.preferredHeight: headerCol.implicitHeight + 32
            color: "#252526"

            ColumnLayout {
                id: headerCol
                anchors.fill: parent
                anchors.margins: 16
                spacing: 4

                Label {
                    text: formApp ? formApp.title : ""
                    font.pixelSize: 22
                    font.bold: true
                    color: "#ffffff"
                    Layout.fillWidth: true
                }

                Label {
                    text: formApp ? formApp.description : ""
                    font.pixelSize: 13
                    color: "#aaaaaa"
                    wrapMode: Text.WordWrap
                    visible: text.length > 0
                    Layout.fillWidth: true
                }
            }
        }

        // ── Countdown bar ───────────────────────────────────────
        CountdownBar {
            Layout.fillWidth: true
            remainingSeconds: formApp ? formApp.remainingSeconds : 0
            totalSeconds: formApp ? formApp.totalSeconds : 300
            paused: formApp ? formApp.timerPaused : false
        }

        // ── Scrollable question list ────────────────────────────
        ScrollView {
            Layout.fillWidth: true
            Layout.fillHeight: true
            clip: true
            contentWidth: availableWidth

            ColumnLayout {
                width: parent.width
                spacing: 12

                Item { Layout.preferredHeight: 8 } // top spacer

                Repeater {
                    model: shell.questions

                    QuestionCard {
                        required property var modelData
                        required property int index
                        Layout.fillWidth: true
                        Layout.leftMargin: 16
                        Layout.rightMargin: 16

                        question: modelData
                        questionIndex: index
                        answer: {
                            var qid = modelData.id || "";
                            return shell.answers[qid] || null;
                        }
                        formApp: shell.formApp
                    }
                }

                Item { Layout.preferredHeight: 8 } // bottom spacer
            }
        }

        // ── Action buttons ──────────────────────────────────────
        ActionButtons {
            Layout.fillWidth: true
            formApp: shell.formApp
        }
    }
}
