import QtQuick 2.15
import QtQuick.Controls 2.15
import QtQuick.Controls.Material 2.15
import QtQuick.Layouts 1.15

// FreeTextInput.qml — Free-text question widget.
//
// Multi-line text area with placeholder, default value, character
// counter, and required-field indicator.

ColumnLayout {
    id: freeTextRoot
    spacing: 4

    property var question: ({})
    property var answer: null
    property var formApp: null

    property int maxLength: question.max_length || 2000

    property string currentValue: {
        if (answer) {
            try {
                var parsed = (typeof answer === "string") ? JSON.parse(answer) : answer;
                return parsed.value || "";
            } catch (e) { return ""; }
        }
        return question.default_value || "";
    }

    ScrollView {
        Layout.fillWidth: true
        Layout.preferredHeight: Math.min(textArea.implicitHeight + 16, 200)

        TextArea {
            id: textArea
            text: freeTextRoot.currentValue
            placeholderText: question.placeholder || "Enter your response..."
            font.pixelSize: 13
            color: "#ffffff"
            wrapMode: TextArea.Wrap
            Material.accent: Material.Blue

            onTextChanged: {
                // Enforce max length.
                if (text.length > freeTextRoot.maxLength) {
                    text = text.substring(0, freeTextRoot.maxLength);
                }

                if (formApp && question.id) {
                    var answerObj = { "type": "free_text_answer", "value": text };
                    formApp.setAnswer(question.id, JSON.stringify(answerObj));
                }
            }
        }
    }

    // Character counter
    Label {
        text: textArea.text.length + " / " + freeTextRoot.maxLength
        font.pixelSize: 10
        color: textArea.text.length > freeTextRoot.maxLength * 0.9 ? "#f48771" : "#666666"
        Layout.alignment: Qt.AlignRight
    }
}
