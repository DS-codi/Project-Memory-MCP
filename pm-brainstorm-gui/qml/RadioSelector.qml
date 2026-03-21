import QtQuick 2.15
import QtQuick.Controls 2.15
import QtQuick.Controls.Material 2.15
import QtQuick.Layouts 1.15

// RadioSelector.qml — Radio-select question widget.
//
// Renders radio buttons for each option with recommendation badges,
// pros/cons lists, and an optional free-text override field.

ColumnLayout {
    id: radioRoot
    spacing: 6

    property var question: ({})
    property var answer: null
    property var formApp: null

    // Derived: which option id is currently selected.
    property string selectedId: {
        if (answer) {
            try {
                var parsed = (typeof answer === "string") ? JSON.parse(answer) : answer;
                return parsed.selected || "";
            } catch (e) { return ""; }
        }
        // Pre-select recommended option if no answer yet.
        var opts = question.options || [];
        for (var i = 0; i < opts.length; i++) {
            if (opts[i].recommended) return opts[i].id;
        }
        return "";
    }

    property string freeTextValue: {
        if (answer) {
            try {
                var parsed = (typeof answer === "string") ? JSON.parse(answer) : answer;
                return parsed.free_text || "";
            } catch (e) { return ""; }
        }
        return "";
    }

    ButtonGroup { id: radioGroup }

    Repeater {
        model: radioRoot.question.options || []

        delegate: Rectangle {
            id: optionDelegate
            required property var modelData
            required property int index

            Layout.fillWidth: true
            radius: 6
            color: radioBtn.checked ? "#1a3a5c" : "#252526"
            border.color: radioBtn.checked ? "#569cd6" : "#3e3e42"
            border.width: 1
            implicitHeight: optLayout.implicitHeight + 16

            ColumnLayout {
                id: optLayout
                anchors.fill: parent
                anchors.margins: 8
                spacing: 4

                RowLayout {
                    Layout.fillWidth: true
                    spacing: 8

                    RadioButton {
                        id: radioBtn
                        // qmllint disable unqualified
                        ButtonGroup.group: radioGroup
                        checked: optionDelegate.modelData.id === radioRoot.selectedId
                        // qmllint enable unqualified
                        text: optionDelegate.modelData.label || ""
                        font.pixelSize: 13

                        onCheckedChanged: {
                            if (checked) {
                                // qmllint disable unqualified
                                radioRoot.emitAnswer(optionDelegate.modelData.id, radioRoot.freeTextValue);
                                // qmllint enable unqualified
                            }
                        }
                    }

                    // Recommendation badge
                    Rectangle {
                        visible: optionDelegate.modelData.recommended === true
                        radius: 3
                        color: "#2e7d32"
                        implicitWidth: recLabel.implicitWidth + 12
                        implicitHeight: recLabel.implicitHeight + 4

                        Label {
                            id: recLabel
                            anchors.centerIn: parent
                            text: "★ Recommended"
                            font.pixelSize: 10
                            font.bold: true
                            color: "#ffffff"
                        }
                    }
                }

                // Description
                Label {
                    text: optionDelegate.modelData.description || ""
                    font.pixelSize: 11
                    color: "#bbbbbb"
                    wrapMode: Text.WordWrap
                    visible: (optionDelegate.modelData.description || "").length > 0
                    Layout.fillWidth: true
                    Layout.leftMargin: 32
                }

                // Pros
                Repeater {
                    model: optionDelegate.modelData.pros || []
                    Label {
                        id: proLabel
                        required property string modelData
                        text: "  ✓ " + modelData
                        font.pixelSize: 11
                        color: "#4ec9b0"
                        Layout.fillWidth: true
                        Layout.leftMargin: 32
                    }
                }

                // Cons
                Repeater {
                    model: optionDelegate.modelData.cons || []
                    Label {
                        id: conLabel
                        required property string modelData
                        text: "  ✗ " + modelData
                        font.pixelSize: 11
                        color: "#f48771"
                        Layout.fillWidth: true
                        Layout.leftMargin: 32
                    }
                }
            }

            MouseArea {
                anchors.fill: parent
                z: -1
                onClicked: radioBtn.checked = true
            }
        }
    }

    // ── Free-text override field ────────────────────────────────
    TextField {
        id: freeTextField
        Layout.fillWidth: true
        visible: radioRoot.question.allow_free_text !== false
        placeholderText: radioRoot.question.free_text_placeholder || "Free-text override or annotation..."
        text: radioRoot.freeTextValue
        font.pixelSize: 12
        color: "#ffffff"
        Material.accent: Material.Blue

        onTextChanged: {
            if (radioRoot.selectedId) {
                radioRoot.emitAnswer(radioRoot.selectedId, text);
            }
        }
    }

    // ── Helper to emit the answer ───────────────────────────────
    function emitAnswer(optionId, freeText) {
        if (!radioRoot.formApp || !radioRoot.question.id) return;
        var answerObj = { "type": "radio_select_answer", "selected": optionId };
        if (freeText && freeText.length > 0) {
            answerObj.free_text = freeText;
        }
        radioRoot.formApp.setAnswer(radioRoot.question.id, JSON.stringify(answerObj));
    }
}
