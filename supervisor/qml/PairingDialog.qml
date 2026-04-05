import QtQuick 2.15
import QtQuick.Controls 2.15
import QtQuick.Controls.Material 2.15
import QtQuick.Layouts 1.15
// QrPairingBridge is a C++ QObject registered at runtime — qmllint cannot
// resolve it from source, so the import and all bridge member accesses are
// suppressed here. The warnings are non-fatal and do not affect runtime.
// qmllint disable unused-imports import missing-property
import com.projectmemory.supervisor

Dialog {
    id: pairingDialog
    title: "Pair Mobile Device"
    modal: true
    width: 480
    height: 520

    anchors.centerIn: Overlay.overlay

    Material.theme: Material.Dark
    Material.accent: Material.Blue

    background: Rectangle {
        color: "#1c2128"
        border.color: "#30363d"
        border.width: 1
        radius: 8
    }

    // Bridge instance — provides pairingQrSvg and apiKeyText properties.
    QrPairingBridge {
        id: qrPairingBridge
    }

    function refreshQr() {
        let apps = [];
        if (checkTerminal.checked) apps.push("terminal");
        if (checkFiles.checked) apps.push("files");
        if (checkDash.checked) apps.push("dashboard");
        if (checkSup.checked) apps.push("supervisor");
        qrPairingBridge.refreshPairingQr(apps.join(","), monitorCombo.currentIndex);
    }

    // Regenerate QR when dialog becomes visible so it is always fresh.
    onOpened: refreshQr()

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: 20
        spacing: 16

        RowLayout {
            Layout.fillWidth: true
            spacing: 20

            // QR code rendered from SVG data URI.
            Image {
                id: qrImage
                Layout.preferredWidth: 200
                Layout.preferredHeight: 200
                fillMode: Image.PreserveAspectFit
                source: qrPairingBridge.pairingQrSvg.length > 0
                    ? "data:image/svg+xml," + encodeURIComponent(qrPairingBridge.pairingQrSvg)
                    : ""
                smooth: false

                Rectangle {
                    anchors.fill: parent
                    visible: parent.status !== Image.Ready
                    color: "#0d1117"
                    border.color: "#30363d"
                    Label {
                        anchors.centerIn: parent
                        text: "Generating QR…"
                        color: "#8b949e"
                        font.pixelSize: 11
                    }
                }
            }

            ColumnLayout {
                Layout.fillWidth: true
                spacing: 8

                Label {
                    text: "Allowed Apps"
                    color: "#c9d1d9"
                    font.pixelSize: 12
                    font.bold: true
                }

                CheckBox {
                    id: checkTerminal
                    text: "Terminal"
                    checked: true
                    Material.accent: Material.Blue
                    onCheckedChanged: pairingDialog.refreshQr()
                }
                CheckBox {
                    id: checkFiles
                    text: "Files"
                    checked: true
                    Material.accent: Material.Blue
                    onCheckedChanged: pairingDialog.refreshQr()
                }
                CheckBox {
                    id: checkDash
                    text: "Dashboard"
                    checked: true
                    Material.accent: Material.Blue
                    onCheckedChanged: pairingDialog.refreshQr()
                }
                CheckBox {
                    id: checkSup
                    text: "Supervisor"
                    checked: true
                    Material.accent: Material.Blue
                    onCheckedChanged: pairingDialog.refreshQr()
                }

                Label {
                    text: "Remote Monitor"
                    color: "#c9d1d9"
                    font.pixelSize: 12
                    font.bold: true
                    Layout.topMargin: 8
                }

                ComboBox {
                    id: monitorCombo
                    Layout.fillWidth: true
                    model: JSON.parse(supervisorGuiBridge.availableMonitors || "[]")
                    currentIndex: 0
                    onCurrentIndexChanged: pairingDialog.refreshQr()
                }
            }
        }

        Label {
            id: keyLabel
            Layout.fillWidth: true
            text: "Key: " + qrPairingBridge.apiKeyText
            color: "#8b949e"
            font.family: "Consolas"
            font.pixelSize: 9
            wrapMode: Text.WrapAnywhere
        }

        Label {
            text: "6-digit PIN: " + qrPairingBridge.pairingPin
            color: "#58a6ff"
            font.pixelSize: 14
            font.bold: true
            Layout.alignment: Qt.AlignHCenter
        }

        RowLayout {
            Layout.fillWidth: true
            spacing: 8

            Button {
                text: "Refresh"
                onClicked: refreshQr()
            }

            Item { Layout.fillWidth: true }

            Button {
                text: "Close"
                onClicked: pairingDialog.close()
            }
        }
    }
}
