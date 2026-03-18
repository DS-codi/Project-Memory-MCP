import QtQuick 2.15
import QtQuick.Controls 2.15
import QtQuick.Controls.Material 2.15
import QtQuick.Layouts 1.15
import com.projectmemory.supervisor

// QrPairingBridge is a C++ QObject registered at runtime — qmllint cannot
// resolve it from source, so the import and all bridge member accesses are
// suppressed here. The warnings are non-fatal and do not affect runtime.
// qmllint disable import missing-property

Dialog {
    id: pairingDialog
    title: "Pair Mobile Device"
    modal: true
    width: 360
    height: 460

    anchors.centerIn: Overlay.overlay

    Material.theme: Material.Dark
    Material.accent: Material.Blue

    background: Rectangle {
        color: "#1c2128"
        border.color: "#30363d"
        border.width: 1
        radius: 6
    }

    // Bridge instance — provides pairingQrSvg and apiKeyText properties.
    QrPairingBridge {
        id: qrPairingBridge
    }

    // Regenerate QR when dialog becomes visible so it is always fresh.
    onOpened: qrPairingBridge.refreshPairingQr()

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: 16
        spacing: 12

        Label {
            Layout.fillWidth: true
            text: "Scan this QR code with the Project Memory mobile app"
            wrapMode: Text.WordWrap
            color: "#c9d1d9"
            font.pixelSize: 13
        }

        // QR code rendered from SVG data URI.
        // Qt 5.15+ and Qt 6.x support inline SVG via "data:image/svg+xml,<svg...>"
        Image {
            id: qrImage
            Layout.alignment: Qt.AlignHCenter
            Layout.preferredWidth: 220
            Layout.preferredHeight: 220
            fillMode: Image.PreserveAspectFit
            sourceSize.width: 220
            sourceSize.height: 220
            source: qrPairingBridge.pairingQrSvg.length > 0
                ? "data:image/svg+xml," + encodeURIComponent(qrPairingBridge.pairingQrSvg)
                : ""
            smooth: false   // keep QR crisp — no bilinear filtering

            // Fallback placeholder when SVG is not yet available.
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

        Label {
            id: keyLabel
            Layout.fillWidth: true
            text: "API Key: " + qrPairingBridge.apiKeyText
            color: "#8b949e"
            font.family: "Courier New"
            font.pixelSize: 10
            wrapMode: Text.WrapAnywhere
        }

        RowLayout {
            Layout.fillWidth: true
            spacing: 8

            Button {
                text: "Refresh Key"
                ToolTip.visible: hovered
                ToolTip.text: "Regenerate QR code"
                onClicked: qrPairingBridge.refreshPairingQr()
            }

            Item { Layout.fillWidth: true }

            Button {
                text: "Close"
                onClicked: pairingDialog.close()
            }
        }
    }
}
