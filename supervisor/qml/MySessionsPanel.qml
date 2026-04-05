pragma ComponentBehavior: Bound
import QtQuick 2.15
import QtQuick.Controls 2.15
import QtQuick.Controls.Material 2.15
import QtQuick.Layouts 1.15
import Qt.labs.settings 1.1

/// My Sessions tab — user-managed bookmark panels.
///
/// Three vertically-stacked panels:
///   • Pinned Plans       — plan IDs / titles to return to quickly
///   • Saved Commands     — shell / Claude commands to reuse
///   • Bookmarked Dirs    — working directory paths to keep handy
///
/// All data persists via Qt.labs.settings (no HTTP, no XHR).
/// Each item has a Copy button and a Delete button.
Rectangle {
    id: mySessionsPanel
    Material.theme: Material.Dark

    color:             "#0d1117"
    Layout.fillWidth:  true
    Layout.fillHeight: true

    // ── Clipboard helper ─────────────────────────────────────────────────────
    // Delegates cannot access outer-scope IDs (pragma ComponentBehavior:Bound),
    // so clipboard writes are routed via the enclosing ListView method, which
    // then calls this helper.
    TextEdit {
        id: clipHelper
        visible: false
        function copyText(txt) {
            clipHelper.text = txt
            clipHelper.selectAll()
            clipHelper.copy()
        }
    }

    // ── Persistence ──────────────────────────────────────────────────────────
    Settings {
        id: bmSettings
        category: "MySessionsBookmarks"
        property string pinnedPlansJson:    "[]"
        property string savedCommandsJson:  "[]"
        property string bookmarkedDirsJson: "[]"
    }

    // ── Data models ──────────────────────────────────────────────────────────
    ListModel { id: pinnedPlansList }
    ListModel { id: savedCommandsList }
    ListModel { id: bookmarkedDirsList }

    Component.onCompleted: {
        loadFromJson(pinnedPlansList,    bmSettings.pinnedPlansJson)
        loadFromJson(savedCommandsList,  bmSettings.savedCommandsJson)
        loadFromJson(bookmarkedDirsList, bmSettings.bookmarkedDirsJson)
    }

    function loadFromJson(model, jsonStr) {
        model.clear()
        try {
            var arr = JSON.parse(jsonStr)
            for (var i = 0; i < arr.length; i++)
                model.append({ itemLabel: arr[i] })
        } catch(e) {}
    }

    function dumpToJson(model) {
        var arr = []
        for (var i = 0; i < model.count; i++)
            arr.push(model.get(i).itemLabel)
        return JSON.stringify(arr)
    }

    // ── Layout ───────────────────────────────────────────────────────────────
    ColumnLayout {
        anchors.fill: parent
        anchors.margins: 10
        spacing: 8

        // ── Pinned Plans ──────────────────────────────────────────────────────
        Rectangle {
            id: pinnedPlansRect
            Layout.fillWidth: true
            Layout.fillHeight: true
            color: "#161b22"; radius: 8; border.color: "#30363d"

            property bool   addMode: false
            property string addText: ""

            ColumnLayout {
                anchors.fill: parent; anchors.margins: 10; spacing: 6

                // Header row
                RowLayout {
                    Layout.fillWidth: true
                    Label {
                        text: "Pinned Plans"
                        font.pixelSize: 12; font.bold: true; color: "#58a6ff"
                        Layout.fillWidth: true
                    }
                    Button {
                        text: "+"; flat: true; font.pixelSize: 14
                        implicitWidth: 28; implicitHeight: 24
                        onClicked: {
                            pinnedPlansRect.addText  = ""
                            pinnedPlansRect.addMode  = true
                        }
                    }
                }
                Rectangle { Layout.fillWidth: true; Layout.preferredHeight: 1; color: "#30363d" }

                // Item list
                ListView {
                    id: pinnedPlansView
                    Layout.fillWidth: true; Layout.fillHeight: true; clip: true
                    model: pinnedPlansList
                    spacing: 2

                    // Called by delegate buttons (delegates cannot access outer IDs directly).
                    function removeAndSave(idx) {
                        pinnedPlansList.remove(idx)
                        bmSettings.pinnedPlansJson = mySessionsPanel.dumpToJson(pinnedPlansList)
                    }
                    function copyItem(label) { clipHelper.copyText(label) }

                    delegate: RowLayout {
                        id: pinnedItem
                        required property string itemLabel
                        required property int    index
                        width: pinnedPlansView.width; spacing: 4
                        Label {
                            text: pinnedItem.itemLabel
                            font.pixelSize: 12; color: "#c9d1d9"
                            Layout.fillWidth: true; elide: Text.ElideRight
                        }
                        Button {
                            text: "Copy"; flat: true; font.pixelSize: 10
                            implicitHeight: 22; implicitWidth: 44
                            // qmllint disable missing-property
                            onClicked: pinnedItem.ListView.view.copyItem(pinnedItem.itemLabel)
                            // qmllint enable missing-property
                        }
                        Button {
                            text: "×"; flat: true; font.pixelSize: 13
                            implicitHeight: 22; implicitWidth: 24
                            Material.foreground: "#f85149"
                            // qmllint disable missing-property
                            onClicked: pinnedItem.ListView.view.removeAndSave(pinnedItem.index)
                            // qmllint enable missing-property
                        }
                    }

                    Label {
                        anchors.centerIn: parent
                        visible: pinnedPlansView.count === 0 && !pinnedPlansRect.addMode
                        text: "No pinned plans"
                        color: "#8b949e"; font.pixelSize: 12
                    }
                }

                // Inline add row
                RowLayout {
                    visible: pinnedPlansRect.addMode
                    Layout.fillWidth: true; spacing: 4
                    TextField {
                        Layout.fillWidth: true
                        placeholderText: "Plan title or ID…"; font.pixelSize: 12
                        text: pinnedPlansRect.addText
                        onTextEdited:       pinnedPlansRect.addText = text
                        Keys.onReturnPressed: pinnedAddBtn.clicked()
                        Keys.onEscapePressed: { pinnedPlansRect.addMode = false }
                    }
                    Button {
                        id: pinnedAddBtn
                        text: "Add"; font.pixelSize: 11
                        implicitHeight: 28; implicitWidth: 44
                        enabled: pinnedPlansRect.addText.trim() !== ""
                        onClicked: {
                            var v = pinnedPlansRect.addText.trim()
                            if (v !== "") {
                                pinnedPlansList.append({ itemLabel: v })
                                bmSettings.pinnedPlansJson = mySessionsPanel.dumpToJson(pinnedPlansList)
                            }
                            pinnedPlansRect.addMode = false
                            pinnedPlansRect.addText = ""
                        }
                    }
                    Button {
                        text: "Cancel"; flat: true; font.pixelSize: 11; implicitHeight: 28
                        onClicked: pinnedPlansRect.addMode = false
                    }
                }
            }
        }

        // ── Saved Commands ────────────────────────────────────────────────────
        Rectangle {
            id: savedCommandsRect
            Layout.fillWidth: true
            Layout.fillHeight: true
            color: "#161b22"; radius: 8; border.color: "#30363d"

            property bool   addMode: false
            property string addText: ""

            ColumnLayout {
                anchors.fill: parent; anchors.margins: 10; spacing: 6

                RowLayout {
                    Layout.fillWidth: true
                    Label {
                        text: "Saved Commands"
                        font.pixelSize: 12; font.bold: true; color: "#3fb950"
                        Layout.fillWidth: true
                    }
                    Button {
                        text: "+"; flat: true; font.pixelSize: 14
                        implicitWidth: 28; implicitHeight: 24
                        onClicked: {
                            savedCommandsRect.addText = ""
                            savedCommandsRect.addMode = true
                        }
                    }
                }
                Rectangle { Layout.fillWidth: true; Layout.preferredHeight: 1; color: "#30363d" }

                ListView {
                    id: savedCommandsView
                    Layout.fillWidth: true; Layout.fillHeight: true; clip: true
                    model: savedCommandsList
                    spacing: 2

                    function removeAndSave(idx) {
                        savedCommandsList.remove(idx)
                        bmSettings.savedCommandsJson = mySessionsPanel.dumpToJson(savedCommandsList)
                    }
                    function copyItem(label) { clipHelper.copyText(label) }

                    delegate: RowLayout {
                        id: cmdItem
                        required property string itemLabel
                        required property int    index
                        width: savedCommandsView.width; spacing: 4
                        Label {
                            text: cmdItem.itemLabel
                            font.pixelSize: 11; font.family: "Consolas"; color: "#c9d1d9"
                            Layout.fillWidth: true; elide: Text.ElideRight
                        }
                        Button {
                            text: "Copy"; flat: true; font.pixelSize: 10
                            implicitHeight: 22; implicitWidth: 44
                            // qmllint disable missing-property
                            onClicked: cmdItem.ListView.view.copyItem(cmdItem.itemLabel)
                            // qmllint enable missing-property
                        }
                        Button {
                            text: "×"; flat: true; font.pixelSize: 13
                            implicitHeight: 22; implicitWidth: 24
                            Material.foreground: "#f85149"
                            // qmllint disable missing-property
                            onClicked: cmdItem.ListView.view.removeAndSave(cmdItem.index)
                            // qmllint enable missing-property
                        }
                    }

                    Label {
                        anchors.centerIn: parent
                        visible: savedCommandsView.count === 0 && !savedCommandsRect.addMode
                        text: "No saved commands"
                        color: "#8b949e"; font.pixelSize: 12
                    }
                }

                RowLayout {
                    visible: savedCommandsRect.addMode
                    Layout.fillWidth: true; spacing: 4
                    TextField {
                        Layout.fillWidth: true
                        placeholderText: "Command…"; font.pixelSize: 12
                        text: savedCommandsRect.addText
                        onTextEdited:       savedCommandsRect.addText = text
                        Keys.onReturnPressed: cmdAddBtn.clicked()
                        Keys.onEscapePressed: { savedCommandsRect.addMode = false }
                    }
                    Button {
                        id: cmdAddBtn
                        text: "Add"; font.pixelSize: 11
                        implicitHeight: 28; implicitWidth: 44
                        enabled: savedCommandsRect.addText.trim() !== ""
                        onClicked: {
                            var v = savedCommandsRect.addText.trim()
                            if (v !== "") {
                                savedCommandsList.append({ itemLabel: v })
                                bmSettings.savedCommandsJson = mySessionsPanel.dumpToJson(savedCommandsList)
                            }
                            savedCommandsRect.addMode = false
                            savedCommandsRect.addText = ""
                        }
                    }
                    Button {
                        text: "Cancel"; flat: true; font.pixelSize: 11; implicitHeight: 28
                        onClicked: savedCommandsRect.addMode = false
                    }
                }
            }
        }

        // ── Bookmarked Directories ────────────────────────────────────────────
        Rectangle {
            id: bookmarkedDirsRect
            Layout.fillWidth: true
            Layout.fillHeight: true
            color: "#161b22"; radius: 8; border.color: "#30363d"

            property bool   addMode: false
            property string addText: ""

            ColumnLayout {
                anchors.fill: parent; anchors.margins: 10; spacing: 6

                RowLayout {
                    Layout.fillWidth: true
                    Label {
                        text: "Bookmarked Directories"
                        font.pixelSize: 12; font.bold: true; color: "#e5b84b"
                        Layout.fillWidth: true
                    }
                    Button {
                        text: "+"; flat: true; font.pixelSize: 14
                        implicitWidth: 28; implicitHeight: 24
                        onClicked: {
                            bookmarkedDirsRect.addText = ""
                            bookmarkedDirsRect.addMode = true
                        }
                    }
                }
                Rectangle { Layout.fillWidth: true; Layout.preferredHeight: 1; color: "#30363d" }

                ListView {
                    id: bookmarkedDirsView
                    Layout.fillWidth: true; Layout.fillHeight: true; clip: true
                    model: bookmarkedDirsList
                    spacing: 2

                    function removeAndSave(idx) {
                        bookmarkedDirsList.remove(idx)
                        bmSettings.bookmarkedDirsJson = mySessionsPanel.dumpToJson(bookmarkedDirsList)
                    }
                    function copyItem(label) { clipHelper.copyText(label) }

                    delegate: RowLayout {
                        id: dirItem
                        required property string itemLabel
                        required property int    index
                        width: bookmarkedDirsView.width; spacing: 4
                        Label {
                            text: dirItem.itemLabel
                            font.pixelSize: 11; font.family: "Consolas"; color: "#c9d1d9"
                            Layout.fillWidth: true; elide: Text.ElideRight
                        }
                        Button {
                            text: "Copy"; flat: true; font.pixelSize: 10
                            implicitHeight: 22; implicitWidth: 44
                            // qmllint disable missing-property
                            onClicked: dirItem.ListView.view.copyItem(dirItem.itemLabel)
                            // qmllint enable missing-property
                        }
                        Button {
                            text: "×"; flat: true; font.pixelSize: 13
                            implicitHeight: 22; implicitWidth: 24
                            Material.foreground: "#f85149"
                            // qmllint disable missing-property
                            onClicked: dirItem.ListView.view.removeAndSave(dirItem.index)
                            // qmllint enable missing-property
                        }
                    }

                    Label {
                        anchors.centerIn: parent
                        visible: bookmarkedDirsView.count === 0 && !bookmarkedDirsRect.addMode
                        text: "No bookmarked directories"
                        color: "#8b949e"; font.pixelSize: 12
                    }
                }

                RowLayout {
                    visible: bookmarkedDirsRect.addMode
                    Layout.fillWidth: true; spacing: 4
                    TextField {
                        Layout.fillWidth: true
                        placeholderText: "Directory path…"; font.pixelSize: 12
                        text: bookmarkedDirsRect.addText
                        onTextEdited:       bookmarkedDirsRect.addText = text
                        Keys.onReturnPressed: dirsAddBtn.clicked()
                        Keys.onEscapePressed: { bookmarkedDirsRect.addMode = false }
                    }
                    Button {
                        id: dirsAddBtn
                        text: "Add"; font.pixelSize: 11
                        implicitHeight: 28; implicitWidth: 44
                        enabled: bookmarkedDirsRect.addText.trim() !== ""
                        onClicked: {
                            var v = bookmarkedDirsRect.addText.trim()
                            if (v !== "") {
                                bookmarkedDirsList.append({ itemLabel: v })
                                bmSettings.bookmarkedDirsJson = mySessionsPanel.dumpToJson(bookmarkedDirsList)
                            }
                            bookmarkedDirsRect.addMode = false
                            bookmarkedDirsRect.addText = ""
                        }
                    }
                    Button {
                        text: "Cancel"; flat: true; font.pixelSize: 11; implicitHeight: 28
                        onClicked: bookmarkedDirsRect.addMode = false
                    }
                }
            }
        }

    } // end ColumnLayout
}
