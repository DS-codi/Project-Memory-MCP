import QtQuick 2.15
import QtQuick.Layouts 1.15

/// Circular ring gauge that reflects a service status string.
/// Full ring = Running, half ring = Error/Starting/Stopping, empty track = anything else.
Canvas {
    id: ring

    Layout.preferredWidth:  38
    Layout.preferredHeight: 38

    property string status:      ""
    property color  accentColor: "#ffffff"
    property color  trackColor:  "#30363d"

    onStatusChanged:      requestPaint()
    onAccentColorChanged: requestPaint()
    Component.onCompleted: requestPaint()

    onPaint: {
        var c = getContext("2d")
        c.clearRect(0, 0, 38, 38)

        // Background track
        c.beginPath()
        c.arc(19, 19, 14, 0, Math.PI * 2)
        c.strokeStyle = ring.trackColor
        c.lineWidth   = 3
        c.stroke()

        // Filled arc
        if (ring.status === "Running") {
            // Full ring: 12 o'clock → 12 o'clock (clockwise)
            c.beginPath()
            c.arc(19, 19, 14, -Math.PI / 2, 3 * Math.PI / 2)
            c.strokeStyle = ring.accentColor
            c.lineWidth   = 3
            c.stroke()
        } else if (ring.status === "Error" || ring.status === "Starting" || ring.status === "Stopping") {
            // Half ring: 12 o'clock → 6 o'clock (clockwise)
            c.beginPath()
            c.arc(19, 19, 14, -Math.PI / 2, Math.PI / 2)
            c.strokeStyle = ring.accentColor
            c.lineWidth   = 3
            c.stroke()
        }
        // Stopped / unknown → empty track only
    }
}
