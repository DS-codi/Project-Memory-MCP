import QtQuick 2.15
import QtQuick.Controls 2.15
import QtQuick.Controls.Material 2.15
import QtQuick.Layouts 1.15

// ConfirmRejectCard.qml — Approve / reject decision widget.
//
// Two large buttons (Approve / Reject) with configurable labels,
// optional notes text area, and visual feedback on selection state.

ColumnLayout {
    id: crRoot
    spacing: 8

    property var question: ({})
    property var answer: null
    property var formApp: null

    property string selectedAction: {
        if (answer) {
            try {
                var parsed = (typeof answer === "string") ? JSON.parse(answer) : answer;
                return parsed.action || "";
            } catch (e) { return ""; }
        }
        return "";
    }

    property string notesValue: {
        if (answer) {
            try {
                var parsed = (typeof answer === "string") ? JSON.parse(answer) : answer;
                return parsed.notes || "";
            } catch (e) { return ""; }
        }
        return "";
    }

    RowLayout {
        Layout.fillWidth: true
        spacing: 12

        // Approve button
        Button {
            id: approveBtn
            text: question.approve_label || "Approve"
            font.pixelSize: 13
            flat: false
            Layout.fillWidth: true
            highlighted: crRoot.selectedAction === "approve"

            Material.background: crRoot.selectedAction === "approve" ? "#2e7d32" : "#333333"
            Material.foreground: "#ffffff"

            onClicked: {
                crRoot.emitAnswer("approve", notesField.text);
            }
        }

        // Reject button
        Button {
            id: rejectBtn
            text: question.reject_label || "Reject"
            font.pixelSize: 13
            flat: false
            Layout.fillWidth: true
            highlighted: crRoot.selectedAction === "reject"

            Material.background: crRoot.selectedAction === "reject" ? "#c62828" : "#333333"
            Material.foreground: "#ffffff"

            onClicked: {
                crRoot.emitAnswer("reject", notesField.text);
            }
        }
    }

    // Optional notes text area
    TextField {
        id: notesField
        Layout.fillWidth: true
        visible: question.allow_notes !== false
        placeholderText: question.notes_placeholder || "Optional notes..."
        text: crRoot.notesValue
        font.pixelSize: 12
        color: "#ffffff"
        Material.accent: Material.Blue

        onTextChanged: {
            if (crRoot.selectedAction) {
                crRoot.emitAnswer(crRoot.selectedAction, text);
            }
        }
    }

    function emitAnswer(action, notes) {
        if (!formApp || !question.id) return;
        var answerObj = { "type": "confirm_reject_answer", "action": action };
        if (notes && notes.length > 0) {
            answerObj.notes = notes;
        }
        formApp.setAnswer(question.id, JSON.stringify(answerObj));
    }
}
