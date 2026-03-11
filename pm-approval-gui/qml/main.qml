import QtQuick 2.15
import QtQuick.Controls 2.15
import QtQuick.Controls.Material 2.15
import QtQuick.Layouts 1.15
import com.projectmemory.approval 1.0

ApplicationWindow {
    id: root
    visible: true
    width: 500
    height: root.multiSessionMode ? 560 : (approvalApp.multipleChoiceMode ? 520 : 350)
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

    property var parsedChoicePayload: {
        var raw = approvalApp.choiceOptionsJson.toString();
        if (!raw || raw.length === 0) {
            return null;
        }
        try {
            return JSON.parse(raw);
        } catch (e) {
            return null;
        }
    }

    property bool multiSessionMode: {
        var payload = root.parsedChoicePayload;
        return payload
            && payload.multi_session === true
            && payload.items
            && payload.items.length > 0;
    }

    property var choiceOptions: {
        if (root.multiSessionMode) {
            return [];
        }
        var payload = root.parsedChoicePayload;
        return Array.isArray(payload) ? payload : [];
    }

    property var sessionItems: root.multiSessionMode ? root.parsedChoicePayload.items : []
    property int currentItemIndex: 0
    property var sessionDecisions: ({})
    property string currentBinaryDecision: ""
    property string currentSelectedOption: ""
    property string currentNotes: ""
    property string singleNotesText: ""
    property string validationMessage: ""
    property bool currentItemIsMultipleChoice: root.multiSessionMode && root.currentSessionItemMode() === "multiple_choice"

    function currentSessionItem() {
        if (!root.multiSessionMode || !root.sessionItems || root.sessionItems.length === 0) {
            return null;
        }

        var boundedIndex = Math.max(0, Math.min(root.currentItemIndex, root.sessionItems.length - 1));
        return root.sessionItems[boundedIndex];
    }

    function currentSessionItemMode() {
        var item = root.currentSessionItem();
        if (!item || !item.mode) {
            return "binary";
        }
        return item.mode;
    }

    function currentItemSupportsNotes() {
        var item = root.currentSessionItem();
        if (!item) {
            return false;
        }

        if (root.currentSessionItemMode() === "multiple_choice") {
            return item.allow_free_text !== false;
        }

        return item.allow_notes !== false;
    }

    function currentItemNotesPlaceholder() {
        var item = root.currentSessionItem();
        if (!item) {
            return "Add notes (optional)";
        }

        if (root.currentSessionItemMode() === "multiple_choice") {
            return item.notes_placeholder || "Optional context for your selection";
        }

        return item.notes_placeholder || "Add notes about your decision (optional)";
    }

    function currentItemOptions() {
        var item = root.currentSessionItem();
        if (!item || !item.options) {
            return [];
        }
        return item.options;
    }

    function decisionKeyForIndex(index) {
        if (!root.sessionItems || index < 0 || index >= root.sessionItems.length) {
            return "item_" + (index + 1);
        }

        var item = root.sessionItems[index];
        if (item.item_id && item.item_id.length > 0) {
            return item.item_id;
        }
        if (item.question_id && item.question_id.length > 0) {
            return item.question_id;
        }
        return "item_" + (index + 1);
    }

    function resetMultiSessionState() {
        root.currentItemIndex = 0;
        root.sessionDecisions = ({});
        root.currentBinaryDecision = "";
        root.currentSelectedOption = "";
        root.currentNotes = "";
        root.validationMessage = "";
    }

    function syncCurrentDraftFromSession() {
        if (!root.multiSessionMode) {
            return;
        }

        var item = root.currentSessionItem();
        if (!item) {
            root.currentBinaryDecision = "";
            root.currentSelectedOption = "";
            root.currentNotes = "";
            return;
        }

        var key = root.decisionKeyForIndex(root.currentItemIndex);
        var existing = root.sessionDecisions[key];

        root.currentBinaryDecision = existing
            && (existing.decision === "approve" || existing.decision === "reject")
            ? existing.decision
            : "";
        root.currentSelectedOption = existing && existing.selected
            ? existing.selected
            : (item.default_selected_option_id || "");
        root.currentNotes = existing && existing.notes ? existing.notes : "";
        root.validationMessage = "";
    }

    function persistCurrentDraft(requireDecision) {
        if (!root.multiSessionMode) {
            return true;
        }

        var item = root.currentSessionItem();
        if (!item) {
            return false;
        }

        var decisionState = "no_decision";
        var selected = "";

        if (root.currentSessionItemMode() === "multiple_choice") {
            selected = root.currentSelectedOption || "";
            if (selected.length > 0) {
                decisionState = "approve";
            } else if (requireDecision) {
                root.validationMessage = "Select an option before continuing.";
                return false;
            }
        } else {
            if (root.currentBinaryDecision === "approve" || root.currentBinaryDecision === "reject") {
                decisionState = root.currentBinaryDecision;
            } else if (requireDecision) {
                root.validationMessage = "Choose Approve or Reject before continuing.";
                return false;
            }
        }

        var key = root.decisionKeyForIndex(root.currentItemIndex);
        var updated = Object.assign({}, root.sessionDecisions);
        var entry = {
            item_id: key,
            decision: decisionState
        };

        if (selected.length > 0) {
            entry.selected = selected;
        }

        if (root.currentNotes && root.currentNotes.length > 0) {
            entry.notes = root.currentNotes;
        }

        updated[key] = entry;
        root.sessionDecisions = updated;
        root.validationMessage = "";
        return true;
    }

    function submitMultiSession() {
        if (!root.multiSessionMode) {
            return;
        }

        root.persistCurrentDraft(false);

        var decisions = [];
        for (var index = 0; index < root.sessionItems.length; index++) {
            var key = root.decisionKeyForIndex(index);
            var stored = root.sessionDecisions[key];
            var normalized = {
                item_id: key,
                decision: "no_decision"
            };

            if (stored && stored.decision) {
                normalized.decision = stored.decision;
            }
            if (stored && stored.selected && stored.selected.length > 0) {
                normalized.selected = stored.selected;
            }
            if (stored && stored.notes && stored.notes.length > 0) {
                normalized.notes = stored.notes;
            }

            decisions.push(normalized);
        }

        var sessionId = root.parsedChoicePayload
            && root.parsedChoicePayload.session_id
            && root.parsedChoicePayload.session_id.length > 0
            ? root.parsedChoicePayload.session_id
            : approvalApp.decisionQuestionId.toString();

        var payload = {
            mode: "multi_approval_session",
            session_id: sessionId,
            decisions: decisions
        };

        approvalApp.setNotes(JSON.stringify(payload));
        approvalApp.submitSelection();
    }

    onParsedChoicePayloadChanged: {
        if (root.multiSessionMode) {
            root.resetMultiSessionState();
            root.syncCurrentDraftFromSession();
        }
    }

    onMultiSessionModeChanged: {
        if (root.multiSessionMode) {
            root.resetMultiSessionState();
            root.syncCurrentDraftFromSession();
        }
    }

    onCurrentItemIndexChanged: {
        if (root.multiSessionMode) {
            root.syncCurrentDraftFromSession();
        }
    }

    Timer {
        id: closeTimer
        interval: 500
        repeat: false
        onTriggered: Qt.quit()
    }

    MouseArea {
        anchors.fill: parent
        hoverEnabled: true
        propagateComposedEvents: true
        acceptedButtons: Qt.NoButton

        onEntered: {
            if (!approvalApp.formSubmitted) {
                approvalApp.pauseTimer();
            }
        }

        onExited: {
            if (!approvalApp.formSubmitted) {
                approvalApp.resumeTimer();
            }
        }
    }

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: 0
        spacing: 0

        CountdownBar {
            Layout.fillWidth: true
            remainingSeconds: approvalApp.remainingSeconds
            totalSeconds: approvalApp.totalSeconds
            paused: approvalApp.timerPaused
        }

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

        Rectangle {
            Layout.fillWidth: true
            Layout.preferredHeight: decisionCol.implicitHeight + 20
            Layout.leftMargin: 12
            Layout.rightMargin: 12
            color: "#1e1e1e"
            border.color: "#333333"
            border.width: 1
            radius: 6
            visible: !root.multiSessionMode && approvalApp.multipleChoiceMode

            ColumnLayout {
                id: decisionCol
                anchors.fill: parent
                anchors.margins: 12
                spacing: 8

                Label {
                    Layout.fillWidth: true
                    text: approvalApp.decisionLabel
                    font.pixelSize: 13
                    font.bold: true
                    color: "#ffffff"
                    wrapMode: Text.WordWrap
                    visible: text.length > 0
                }

                Label {
                    Layout.fillWidth: true
                    text: approvalApp.decisionDescription
                    font.pixelSize: 11
                    color: "#bbbbbb"
                    wrapMode: Text.WordWrap
                    visible: text.length > 0
                }

                Repeater {
                    model: root.choiceOptions

                    delegate: Rectangle {
                        required property var modelData

                        Layout.fillWidth: true
                        implicitHeight: optionLayout.implicitHeight + 14
                        radius: 5
                        color: approvalApp.selectedOptionId === (modelData.id || "") ? "#1a3a5c" : "#252526"
                        border.color: approvalApp.selectedOptionId === (modelData.id || "") ? "#569cd6" : "#3e3e42"
                        border.width: 1

                        ColumnLayout {
                            id: optionLayout
                            anchors.fill: parent
                            anchors.margins: 8
                            spacing: 4

                            RowLayout {
                                Layout.fillWidth: true
                                spacing: 8

                                RadioButton {
                                    checked: approvalApp.selectedOptionId === (modelData.id || "")
                                    text: modelData.label || ""
                                    font.pixelSize: 12

                                    onClicked: {
                                        approvalApp.setSelectedOption(modelData.id || "");
                                    }
                                }

                                Rectangle {
                                    visible: modelData.recommended === true
                                    radius: 3
                                    color: "#2e7d32"
                                    implicitWidth: recommendationLabel.implicitWidth + 10
                                    implicitHeight: recommendationLabel.implicitHeight + 4

                                    Label {
                                        id: recommendationLabel
                                        anchors.centerIn: parent
                                        text: "Recommended"
                                        font.pixelSize: 10
                                        font.bold: true
                                        color: "#ffffff"
                                    }
                                }
                            }

                            Label {
                                Layout.fillWidth: true
                                Layout.leftMargin: 24
                                text: modelData.description || ""
                                font.pixelSize: 10
                                color: "#bcbcbc"
                                wrapMode: Text.WordWrap
                                visible: text.length > 0
                            }
                        }

                        MouseArea {
                            anchors.fill: parent
                            onClicked: {
                                approvalApp.setSelectedOption(modelData.id || "");
                            }
                        }
                    }
                }
            }
        }

        Rectangle {
            Layout.fillWidth: true
            Layout.preferredHeight: multiDecisionCol.implicitHeight + 20
            Layout.leftMargin: 12
            Layout.rightMargin: 12
            color: "#1e1e1e"
            border.color: "#333333"
            border.width: 1
            radius: 6
            visible: root.multiSessionMode

            ColumnLayout {
                id: multiDecisionCol
                anchors.fill: parent
                anchors.margins: 12
                spacing: 10

                Label {
                    Layout.fillWidth: true
                    text: "Item " + (root.currentItemIndex + 1) + " of " + root.sessionItems.length
                    font.pixelSize: 11
                    color: "#8ab4f8"
                    font.bold: true
                }

                Label {
                    Layout.fillWidth: true
                    text: {
                        var item = root.currentSessionItem();
                        return item && item.label ? item.label : "Approval decision";
                    }
                    font.pixelSize: 13
                    font.bold: true
                    color: "#ffffff"
                    wrapMode: Text.WordWrap
                }

                Label {
                    Layout.fillWidth: true
                    text: {
                        var item = root.currentSessionItem();
                        return item && item.description ? item.description : "";
                    }
                    font.pixelSize: 11
                    color: "#bbbbbb"
                    wrapMode: Text.WordWrap
                    visible: text.length > 0
                }

                RowLayout {
                    Layout.fillWidth: true
                    spacing: 10
                    visible: !root.currentItemIsMultipleChoice

                    Button {
                        text: {
                            var item = root.currentSessionItem();
                            return item && item.approve_label ? item.approve_label : "Approve";
                        }
                        highlighted: root.currentBinaryDecision === "approve"
                        Layout.fillWidth: true
                        Material.background: root.currentBinaryDecision === "approve" ? "#2e7d32" : "#333333"
                        Material.foreground: "#ffffff"

                        onClicked: {
                            root.currentBinaryDecision = "approve";
                            root.validationMessage = "";
                        }
                    }

                    Button {
                        text: {
                            var item = root.currentSessionItem();
                            return item && item.reject_label ? item.reject_label : "Reject";
                        }
                        highlighted: root.currentBinaryDecision === "reject"
                        Layout.fillWidth: true
                        Material.background: root.currentBinaryDecision === "reject" ? "#c62828" : "#333333"
                        Material.foreground: "#ffffff"

                        onClicked: {
                            root.currentBinaryDecision = "reject";
                            root.validationMessage = "";
                        }
                    }
                }

                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: 8
                    visible: root.currentItemIsMultipleChoice

                    Repeater {
                        model: root.currentItemOptions()

                        delegate: Rectangle {
                            required property var modelData

                            Layout.fillWidth: true
                            implicitHeight: sessionOptionLayout.implicitHeight + 14
                            radius: 5
                            color: root.currentSelectedOption === (modelData.id || "") ? "#1a3a5c" : "#252526"
                            border.color: root.currentSelectedOption === (modelData.id || "") ? "#569cd6" : "#3e3e42"
                            border.width: 1

                            ColumnLayout {
                                id: sessionOptionLayout
                                anchors.fill: parent
                                anchors.margins: 8
                                spacing: 4

                                RowLayout {
                                    Layout.fillWidth: true
                                    spacing: 8

                                    RadioButton {
                                        checked: root.currentSelectedOption === (modelData.id || "")
                                        text: modelData.label || ""
                                        font.pixelSize: 12

                                        onClicked: {
                                            root.currentSelectedOption = modelData.id || "";
                                            root.validationMessage = "";
                                        }
                                    }

                                    Rectangle {
                                        visible: modelData.recommended === true
                                        radius: 3
                                        color: "#2e7d32"
                                        implicitWidth: sessionRecLabel.implicitWidth + 10
                                        implicitHeight: sessionRecLabel.implicitHeight + 4

                                        Label {
                                            id: sessionRecLabel
                                            anchors.centerIn: parent
                                            text: "Recommended"
                                            font.pixelSize: 10
                                            font.bold: true
                                            color: "#ffffff"
                                        }
                                    }
                                }

                                Label {
                                    Layout.fillWidth: true
                                    Layout.leftMargin: 24
                                    text: modelData.description || ""
                                    font.pixelSize: 10
                                    color: "#bcbcbc"
                                    wrapMode: Text.WordWrap
                                    visible: text.length > 0
                                }
                            }

                            MouseArea {
                                anchors.fill: parent
                                onClicked: {
                                    root.currentSelectedOption = modelData.id || "";
                                    root.validationMessage = "";
                                }
                            }
                        }
                    }
                }
            }
        }

        Item { Layout.fillHeight: true }

        TextField {
            id: notesField
            Layout.fillWidth: true
            Layout.leftMargin: 16
            Layout.rightMargin: 16
            visible: root.multiSessionMode ? root.currentItemSupportsNotes() : approvalApp.allowNotes
            placeholderText: root.multiSessionMode ? root.currentItemNotesPlaceholder() : approvalApp.notesPlaceholder
            text: root.multiSessionMode ? root.currentNotes : root.singleNotesText
            font.pixelSize: 12
            color: "#ffffff"
            enabled: !approvalApp.formSubmitted
            Material.accent: Material.Blue

            onTextChanged: {
                if (root.multiSessionMode) {
                    root.currentNotes = text;
                } else {
                    root.singleNotesText = text;
                    approvalApp.setNotes(text);
                }
            }
        }

        Rectangle {
            Layout.fillWidth: true
            Layout.preferredHeight: 56
            color: "#252526"

            RowLayout {
                anchors.fill: parent
                anchors.margins: 12
                spacing: 12

                Label {
                    text: root.validationMessage
                    color: "#f28b82"
                    font.pixelSize: 11
                    visible: root.validationMessage.length > 0
                    Layout.fillWidth: true
                    elide: Text.ElideRight
                }

                Item { Layout.fillWidth: true }

                Button {
                    id: rejectBtn
                    text: approvalApp.rejectLabel
                    font.pixelSize: 13
                    flat: true
                    enabled: !approvalApp.formSubmitted
                    Material.foreground: "#F44336"
                    visible: !root.multiSessionMode && !approvalApp.multipleChoiceMode

                    onClicked: approvalApp.reject()

                    Shortcut {
                        sequence: "Escape"
                        onActivated: rejectBtn.clicked()
                    }
                }

                Button {
                    id: cancelBtn
                    text: approvalApp.rejectLabel
                    font.pixelSize: 13
                    flat: true
                    enabled: !approvalApp.formSubmitted
                    Material.foreground: "#cccccc"
                    visible: !root.multiSessionMode && approvalApp.multipleChoiceMode

                    onClicked: approvalApp.reject()

                    Shortcut {
                        sequence: "Escape"
                        onActivated: cancelBtn.clicked()
                    }
                }

                Button {
                    id: approveBtn
                    text: approvalApp.approveLabel
                    font.pixelSize: 13
                    highlighted: true
                    enabled: !approvalApp.formSubmitted
                        && (!approvalApp.multipleChoiceMode || approvalApp.selectedOptionId.length > 0)
                    Material.background: "#2e7d32"
                    Material.foreground: "#ffffff"
                    visible: !root.multiSessionMode

                    onClicked: {
                        if (approvalApp.multipleChoiceMode) {
                            approvalApp.submitSelection();
                        } else {
                            approvalApp.approve();
                        }
                    }

                    Shortcut {
                        sequence: "Return"
                        onActivated: approveBtn.clicked()
                    }
                }

                Button {
                    id: multiCancelBtn
                    text: "Cancel Session"
                    font.pixelSize: 13
                    flat: true
                    enabled: !approvalApp.formSubmitted
                    Material.foreground: "#cccccc"
                    visible: root.multiSessionMode

                    onClicked: approvalApp.reject()

                    Shortcut {
                        sequence: "Escape"
                        onActivated: multiCancelBtn.clicked()
                    }
                }

                Button {
                    id: previousBtn
                    text: "Previous"
                    font.pixelSize: 13
                    flat: true
                    enabled: root.multiSessionMode && !approvalApp.formSubmitted && root.currentItemIndex > 0
                    visible: root.multiSessionMode

                    onClicked: {
                        root.persistCurrentDraft(false);
                        if (root.currentItemIndex > 0) {
                            root.currentItemIndex = root.currentItemIndex - 1;
                        }
                    }
                }

                Button {
                    id: nextOrSubmitBtn
                    text: root.currentItemIndex < root.sessionItems.length - 1 ? "Next Item" : "Submit All"
                    font.pixelSize: 13
                    highlighted: true
                    enabled: root.multiSessionMode && !approvalApp.formSubmitted && root.sessionItems.length > 0
                    Material.background: "#2e7d32"
                    Material.foreground: "#ffffff"
                    visible: root.multiSessionMode

                    onClicked: {
                        if (!root.persistCurrentDraft(true)) {
                            return;
                        }

                        if (root.currentItemIndex < root.sessionItems.length - 1) {
                            root.currentItemIndex = root.currentItemIndex + 1;
                            return;
                        }

                        root.submitMultiSession();
                    }

                    Shortcut {
                        sequence: "Return"
                        onActivated: nextOrSubmitBtn.clicked()
                    }
                }
            }
        }
    }
}