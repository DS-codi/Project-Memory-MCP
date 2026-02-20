import QtQuick 2.15
import QtQuick.Controls 2.15
import QtQuick.Controls.Material 2.15
import QtQuick.Layouts 1.15

// ActionButtons.qml — Submit / Cancel / Use All Recommendations button bar.
//
// Horizontal row of action buttons with keyboard shortcuts and
// disabled states when the form has already been submitted.

Rectangle {
    id: btnBar
    height: 64
    color: "#252526"

    property var formApp: null

    RowLayout {
        anchors.fill: parent
        anchors.margins: 12
        spacing: 12

        // "Use All Recommendations" shortcut
        Button {
            id: autoFillBtn
            text: "⚡ Use All Recommendations"
            font.pixelSize: 12
            flat: true
            enabled: formApp ? !formApp.formSubmitted : false
            Material.foreground: "#4ec9b0"

            onClicked: {
                if (formApp) formApp.useAllRecommendations();
            }

            ToolTip.text: "Auto-fill all unanswered questions with agent recommendations"
            ToolTip.visible: hovered
            ToolTip.delay: 500
        }

        Item { Layout.fillWidth: true } // spacer

        // "Request Refinement" — visible when brainstorm questions are marked
        Button {
            id: refinementBtn
            text: "\uD83D\uDD04 Request Refinement"
            font.pixelSize: 12
            flat: true
            // Show when formApp exposes refinement support (refinementCount property exists)
            visible: formApp && (typeof formApp.refinementCount !== "undefined")
            enabled: formApp ? (!formApp.formSubmitted && !formApp.refinementPending) : false
            Material.foreground: Material.Orange

            onClicked: {
                if (formApp) formApp.requestRefinement();
            }

            ToolTip.text: "Ask the agent to regenerate options for marked questions"
            ToolTip.visible: hovered
            ToolTip.delay: 500
        }

        // Cancel button
        Button {
            id: cancelBtn
            text: "Cancel"
            font.pixelSize: 13
            flat: true
            enabled: formApp ? !formApp.formSubmitted : false
            Material.foreground: "#cccccc"

            onClicked: {
                if (formApp) formApp.cancelForm();
            }

            Shortcut {
                sequence: "Escape"
                onActivated: cancelBtn.clicked()
            }
        }

        // Submit button
        Button {
            id: submitBtn
            text: "Submit"
            font.pixelSize: 13
            highlighted: true
            enabled: formApp ? !formApp.formSubmitted : false
            Material.background: Material.Blue
            Material.foreground: "#ffffff"

            onClicked: {
                if (formApp) formApp.submitForm();
            }

            Shortcut {
                sequence: "Ctrl+Return"
                onActivated: submitBtn.clicked()
            }
        }
    }
}
