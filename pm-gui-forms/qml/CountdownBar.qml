import QtQuick 2.15
import QtQuick.Controls 2.15
import QtQuick.Controls.Material 2.15
import QtQuick.Layouts 1.15

// CountdownBar.qml — Countdown progress bar.
//
// Animated horizontal bar that shrinks as time elapses. Colour
// transitions from blue → yellow → red. Shows remaining seconds.

Rectangle {
    id: barRoot
    height: 32
    color: "#1e1e1e"

    property int remainingSeconds: 0
    property int totalSeconds: 300
    property bool paused: false

    // Fraction of time remaining (1.0 = full, 0.0 = expired).
    property real fraction: totalSeconds > 0
        ? Math.max(0, Math.min(1, remainingSeconds / totalSeconds))
        : 0

    // Colour transitions: blue (>50%) → yellow (20-50%) → red (<20%).
    property color barColor: {
        if (fraction > 0.5) return "#2196F3";      // Blue
        if (fraction > 0.2) return "#FF9800";      // Orange / Yellow
        return "#F44336";                           // Red
    }

    Rectangle {
        id: barFill
        anchors.left: parent.left
        anchors.top: parent.top
        anchors.bottom: parent.bottom
        width: parent.width * barRoot.fraction
        color: barRoot.barColor
        radius: 0

        Behavior on width {
            NumberAnimation { duration: 900; easing.type: Easing.Linear }
        }

        Behavior on color {
            ColorAnimation { duration: 500 }
        }
    }

    // Remaining time label
    Label {
        anchors.centerIn: parent
        text: {
            if (barRoot.paused) return "⏸ " + formatTime(barRoot.remainingSeconds);
            return formatTime(barRoot.remainingSeconds) + " remaining";
        }
        font.pixelSize: 12
        font.bold: true
        color: "#ffffff"

        function formatTime(secs) {
            var m = Math.floor(secs / 60);
            var s = secs % 60;
            return m + ":" + (s < 10 ? "0" : "") + s;
        }
    }

    // Pulsing effect when time is low
    SequentialAnimation on opacity {
        running: barRoot.fraction < 0.1 && barRoot.remainingSeconds > 0
        loops: Animation.Infinite
        NumberAnimation { to: 0.6; duration: 500 }
        NumberAnimation { to: 1.0; duration: 500 }
    }
}
