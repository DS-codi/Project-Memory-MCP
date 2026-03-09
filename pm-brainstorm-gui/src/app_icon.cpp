#include <QFileInfo>
#include <QGuiApplication>
#include <QIcon>
#include <QStringList>

extern "C" void set_app_icon() {
    const QString exePath = QGuiApplication::applicationDirPath();

    const QStringList iconPaths = {
        exePath + "/app_icon.png",
        exePath + "/resources/app_icon.png",
        exePath + "/../resources/app_icon.png",
        ":/qt/qml/com/projectmemory/brainstorm/resources/app_icon.png",
        ":/qt/qml/com/projectmemory/brainstorm/resources/app_icon.svg",
        ":/qt/qml/com/projectmemory/brainstorm/resources/app_icon.ico",
    };

    for (const QString& iconPath : iconPaths) {
        if (QFileInfo::exists(iconPath) || iconPath.startsWith(":/")) {
            QIcon icon(iconPath);
            if (!icon.isNull()) {
                QGuiApplication::setWindowIcon(icon);
                return;
            }
        }
    }
}
