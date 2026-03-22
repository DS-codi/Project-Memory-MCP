import QtQuick 2.15
import QtQuick.Controls 2.15
import QtQuick.Controls.Material 2.15
import QtQuick.Layouts 1.15

// QuestionCard.qml — Generic question wrapper card.
//
// Wraps any question type in a styled Material card and dynamically
// loads the appropriate input widget based on question.type.

Rectangle {
    id: card

    // Input properties set by the parent Repeater.
    property var question: ({})
    property int questionIndex: 0
    property var answer: null
    property var formApp: null

    // Per-question refinement state (tracked locally).
    // refining: true while this card triggered a still-pending refinement.
    property bool refining: false
    // hasBeenRefined: set when formApp signals that this question was updated.
    property bool hasBeenRefined: false

    // Detect when a pending global refinement completes and reset local state.
    Connections {
        target: card.formApp
        function onRefinementPendingChanged() {
            if (card.formApp && !card.formApp.refinementPending && card.refining) {
                card.refining = false;
            }
        }
        function onRefinedQuestionsJsonChanged() {
            if (!card.formApp || !card.question.id) return;
            try {
                var refined = JSON.parse(card.formApp.refinedQuestionsJson);
                if (Array.isArray(refined) && refined.some(function(q) { return q.id === card.question.id; })) {
                    card.hasBeenRefined = true;
                }
            } catch(e) {}
        }
    }

    radius: 8
    color: "#2d2d30"
    border.color: card.hasBeenRefined ? "#4ec9b0" : "#3e3e42"
    border.width: card.hasBeenRefined ? 2 : 1
    implicitHeight: cardLayout.implicitHeight + 24

    ColumnLayout {
        id: cardLayout
        anchors.fill: parent
        anchors.margins: 12
        spacing: 8

        // ── Question header ─────────────────────────────────────
        RowLayout {
            Layout.fillWidth: true
            spacing: 6

            Label {
                text: (card.questionIndex + 1) + "."
                font.pixelSize: 14
                font.bold: true
                color: "#569cd6"
            }

            Label {
                text: card.question.label || ""
                font.pixelSize: 14
                font.bold: true
                color: "#ffffff"
                wrapMode: Text.WordWrap
                Layout.fillWidth: true
            }

            // "Refined" badge — visible after a successful per-question refinement.
            Rectangle {
                visible: card.hasBeenRefined
                color: "#1e4e40"
                radius: 4
                implicitWidth: refinedLabel.implicitWidth + 10
                implicitHeight: 20
                Label {
                    id: refinedLabel
                    anchors.centerIn: parent
                    text: "✓ Refined"
                    font.pixelSize: 10
                    color: "#4ec9b0"
                }
            }

            // Required indicator
            Label {
                text: "*"
                font.pixelSize: 16
                font.bold: true
                color: Material.accent
                visible: card.question.required !== false
            }
        }

        // ── Description ─────────────────────────────────────────
        Label {
            text: card.question.description || ""
            font.pixelSize: 12
            color: "#aaaaaa"
            wrapMode: Text.WordWrap
            visible: (card.question.description || "").length > 0
            Layout.fillWidth: true
        }

        // ── Dynamic question widget ─────────────────────────────
        Loader {
            id: widgetLoader
            Layout.fillWidth: true

            sourceComponent: {
                var t = card.question.type || "";
                if (t === "radio_select") return radioComponent;
                if (t === "free_text") return freeTextComponent;
                if (t === "confirm_reject") return confirmRejectComponent;
                return null; // countdown_timer is handled by CountdownBar
            }
        }

        // ── Refinement section (brainstorm forms only) ──────────
        // Only shown for radio_select and free_text questions.
        ColumnLayout {
            visible: card.question.type === "radio_select" || card.question.type === "free_text"
            Layout.fillWidth: true
            spacing: 4

            // "Mark for refinement" checkbox (batch refinement via Action bar).
            CheckBox {
                id: refinementCheck
                text: "Mark for refinement"
                font.pixelSize: 11
                Material.accent: Material.Orange
                checked: false

                onCheckedChanged: {
                    if (card.formApp && card.question.id) {
                        card.formApp.toggleRefinement(card.question.id);
                        if (!checked) card.formApp.setRefinementFeedback(card.question.id, "");
                    }
                }
            }

            // Feedback hint — visible only when the checkbox is checked
            TextArea {
                id: refinementFeedback
                visible: refinementCheck.checked
                placeholderText: "Describe what to refine (optional)..."
                font.pixelSize: 11
                color: "#cccccc"
                wrapMode: TextEdit.Wrap
                Layout.fillWidth: true
                background: Rectangle {
                    color: "#1e1e1e"
                    border.color: Material.Orange
                    border.width: 1
                    radius: 4
                }
                onTextChanged: {
                    if (card.formApp && card.question.id) {
                        card.formApp.setRefinementFeedback(card.question.id, text);
                    }
                }
            }

            // ── Per-question "Refine Now" button ────────────────
            RowLayout {
                Layout.fillWidth: true
                spacing: 8

                Button {
                    id: refineNowBtn
                    text: card.refining ? "Refining…" : "↻ Refine This"
                    font.pixelSize: 11
                    flat: true
                    enabled: card.formApp
                            ? !card.formApp.formSubmitted && !card.formApp.refinementPending
                            : false
                    Material.foreground: "#4ec9b0"

                    onClicked: {
                        if (!card.formApp || !card.question.id) return;
                        card.refining = true;
                        var fb = refinementFeedback.visible ? refinementFeedback.text : "";
                        card.formApp.requestRefinementForQuestion(card.question.id, fb);
                    }

                    ToolTip.text: "Ask the agent to regenerate options for this question only"
                    ToolTip.visible: hovered
                    ToolTip.delay: 500
                }

                // Per-question spinner — visible only while THIS card triggered the refinement.
                BusyIndicator {
                    visible: card.refining && card.formApp && card.formApp.refinementPending
                    running: visible
                    Layout.preferredWidth: 20
                    Layout.preferredHeight: 20
                    Material.accent: "#4ec9b0"
                }

                Item { Layout.fillWidth: true }
            }
        }
    }

    // ── Inline components loaded by the Loader ──────────────────

    Component {
        id: radioComponent
        RadioSelector {
            // qmllint disable unqualified
            question: card.question
            answer: card.answer
            formApp: card.formApp
            // qmllint enable unqualified
        }
    }

    Component {
        id: freeTextComponent
        FreeTextInput {
            // qmllint disable unqualified
            question: card.question
            answer: card.answer
            formApp: card.formApp
            // qmllint enable unqualified
        }
    }

    Component {
        id: confirmRejectComponent
        ConfirmRejectCard {
            // qmllint disable unqualified
            question: card.question
            answer: card.answer
            formApp: card.formApp
            // qmllint enable unqualified
        }
    }
}
