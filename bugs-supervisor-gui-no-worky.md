PowerShell 7.5.4

   A new PowerShell stable release is available: v7.6.0
   Upgrade now, or check out the release page at:
     https://aka.ms/PowerShell-Release?tag=v7.6.0

PS C:\Users\User> cd "C:\Users\User\Project_Memory_MCP\Project-Memory-MCP\target\release"; .\supervisor.exe --debug
[supervisor] another instance is already running — aborting.
PS C:\Users\User\Project_Memory_MCP\Project-Memory-MCP\target\release> cd "C:\Users\User\Project_Memory_MCP\Project-Memory-MCP\target\release"; .\supervisor.exe --debug
[supervisor:debug] setting Qt env vars...
[supervisor:debug] spawning background Tokio thread...
[supervisor:debug] creating QGuiApplication...
[supervisor:debug] background thread started, waiting for QML bridge...
[supervisor:debug] creating QQmlApplicationEngine...
qt.qml.import: addImportPath: "C:/Users/User/Project_Memory_MCP/Project-Memory-MCP/target/release/qml"
qt.qml.import: addImportPath: "qrc:/qt/qml"
qt.qml.import: addImportPath: "qrc:/qt-project.org/imports"
qt.qml.import: addImportPath: "C:/Users/User/Project_Memory_MCP/Project-Memory-MCP/target/release"
[supervisor:debug] loading QML: qrc:/qt/qml/com/projectmemory/supervisor/qml/main.qml
qt.qml.import: addLibraryImport: qrc:/qt/qml/com/projectmemory/supervisor/qml/main.qml "QtQuick" version "2.15" as ""
qt.qml.import: importExtension: qrc:/qt/qml/com/projectmemory/supervisor/qml/main.qml loaded "C:/Users/User/Project_Memory_MCP/Project-Memory-MCP/target/release/qml/QtQuick/qmldir"
qt.qml.import: loading dependent import "QtQml" version 2.15 as ""
qt.qml.import: addLibraryImport: qrc:/qt/qml/com/projectmemory/supervisor/qml/main.qml "QtQml" version "2.15" as ""
qt.qml.import: importExtension: qrc:/qt/qml/com/projectmemory/supervisor/qml/main.qml loaded ":/qt-project.org/imports/QtQml/qmldir"
qt.qml.import: resolvePlugin Could not resolve dynamic plugin with base name "qmlplugin" in ":/qt-project.org/imports/QtQml"  file does not exist
qt.qml.import: loading dependent import "QML" version 1.0 as ""
qt.qml.import: addLibraryImport: qrc:/qt/qml/com/projectmemory/supervisor/qml/main.qml "QML" version "1.0" as ""
qt.qml.import: loading dependent import "QtQml.Models" version 2.15 as ""
qt.qml.import: addLibraryImport: qrc:/qt/qml/com/projectmemory/supervisor/qml/main.qml "QtQml.Models" version "2.15" as ""
qt.qml.import: importExtension: qrc:/qt/qml/com/projectmemory/supervisor/qml/main.qml loaded ":/qt-project.org/imports/QtQml/Models/qmldir"
qt.qml.import: resolvePlugin Could not resolve dynamic plugin with base name "modelsplugin" in ":/qt-project.org/imports/QtQml/Models"  file does not exist
qt.qml.import: locateLocalQmldir: QtQml.Models module's qmldir found at "C:/Users/User/Project_Memory_MCP/Project-Memory-MCP/target/release/qml/QtQml/Models/qmldir"
qt.qml.import: loading dependent import "QtQml.WorkerScript" version 2.15 as ""
qt.qml.import: addLibraryImport: qrc:/qt/qml/com/projectmemory/supervisor/qml/main.qml "QtQml.WorkerScript" version "2.15" as ""
qt.qml.import: importExtension: qrc:/qt/qml/com/projectmemory/supervisor/qml/main.qml loaded ":/qt-project.org/imports/QtQml/WorkerScript/qmldir"
qt.qml.import: resolvePlugin Could not resolve dynamic plugin with base name "workerscriptplugin" in ":/qt-project.org/imports/QtQml/WorkerScript"  file does not exist
qt.qml.import: locateLocalQmldir: QtQml.WorkerScript module's qmldir found at "C:/Users/User/Project_Memory_MCP/Project-Memory-MCP/target/release/qml/QtQml/WorkerScript/qmldir"
qt.qml.import: locateLocalQmldir: QtQml module's qmldir found at "C:/Users/User/Project_Memory_MCP/Project-Memory-MCP/target/release/qml/QtQml/qmldir"
qt.qml.import: locateLocalQmldir: QtQuick module's qmldir found at "C:/Users/User/Project_Memory_MCP/Project-Memory-MCP/target/release/qml/QtQuick/qmldir"
qt.qml.import: addLibraryImport: qrc:/qt/qml/com/projectmemory/supervisor/qml/main.qml "QtQuick.Controls" version "2.15" as ""
qt.qml.import: importExtension: qrc:/qt/qml/com/projectmemory/supervisor/qml/main.qml loaded "C:/Users/User/Project_Memory_MCP/Project-Memory-MCP/target/release/qml/QtQuick/Controls/qmldir"
qt.qml.import: loading dependent import "QtQuick.Controls.Windows" version 2.15 as ""
qt.qml.import: addLibraryImport: qrc:/qt/qml/com/projectmemory/supervisor/qml/main.qml "QtQuick.Controls.Windows" version "2.15" as ""
qt.qml.import: importExtension: qrc:/qt/qml/com/projectmemory/supervisor/qml/main.qml loaded "C:/Users/User/Project_Memory_MCP/Project-Memory-MCP/target/release/qml/QtQuick/Controls/Windows/qmldir"
qt.qml.import: loading dependent import "QtQuick.Controls.Basic" version 2.15 as ""
qt.qml.import: addLibraryImport: qrc:/qt/qml/com/projectmemory/supervisor/qml/main.qml "QtQuick.Controls.Basic" version "2.15" as ""
qt.qml.import: importExtension: qrc:/qt/qml/com/projectmemory/supervisor/qml/main.qml loaded "C:/Users/User/Project_Memory_MCP/Project-Memory-MCP/target/release/qml/QtQuick/Controls/Basic/qmldir"
qt.qml.import: locateLocalQmldir: QtQuick.Controls.Basic module's qmldir found at "C:/Users/User/Project_Memory_MCP/Project-Memory-MCP/target/release/qml/QtQuick/Controls/Basic/qmldir"
qt.qml.import: loading dependent import "QtQuick.Controls.Fusion" version 2.15 as ""
qt.qml.import: addLibraryImport: qrc:/qt/qml/com/projectmemory/supervisor/qml/main.qml "QtQuick.Controls.Fusion" version "2.15" as ""
qt.qml.import: importExtension: qrc:/qt/qml/com/projectmemory/supervisor/qml/main.qml loaded "C:/Users/User/Project_Memory_MCP/Project-Memory-MCP/target/release/qml/QtQuick/Controls/Fusion/qmldir"
qt.qml.import: loading dependent import "QtQuick.Controls.Basic" version 2.15 as ""
qt.qml.import: addLibraryImport: qrc:/qt/qml/com/projectmemory/supervisor/qml/main.qml "QtQuick.Controls.Basic" version "2.15" as ""
qt.qml.import: importExtension: qrc:/qt/qml/com/projectmemory/supervisor/qml/main.qml loaded "C:/Users/User/Project_Memory_MCP/Project-Memory-MCP/target/release/qml/QtQuick/Controls/Basic/qmldir"
qt.qml.import: locateLocalQmldir: QtQuick.Controls.Fusion module's qmldir found at "C:/Users/User/Project_Memory_MCP/Project-Memory-MCP/target/release/qml/QtQuick/Controls/Fusion/qmldir"
qt.qml.import: locateLocalQmldir: QtQuick.Controls.Windows module's qmldir found at "C:/Users/User/Project_Memory_MCP/Project-Memory-MCP/target/release/qml/QtQuick/Controls/Windows/qmldir"
qt.qml.import: locateLocalQmldir: QtQuick.Controls module's qmldir found at "C:/Users/User/Project_Memory_MCP/Project-Memory-MCP/target/release/qml/QtQuick/Controls/qmldir"
qt.qml.import: addLibraryImport: qrc:/qt/qml/com/projectmemory/supervisor/qml/main.qml "QtQuick.Controls.Material" version "2.15" as ""
qt.qml.import: importExtension: qrc:/qt/qml/com/projectmemory/supervisor/qml/main.qml loaded "C:/Users/User/Project_Memory_MCP/Project-Memory-MCP/target/release/qml/QtQuick/Controls/Material/qmldir"
qt.qml.import: loading dependent import "QtQuick.Controls.Basic" version 2.15 as ""
qt.qml.import: addLibraryImport: qrc:/qt/qml/com/projectmemory/supervisor/qml/main.qml "QtQuick.Controls.Basic" version "2.15" as ""
qt.qml.import: importExtension: qrc:/qt/qml/com/projectmemory/supervisor/qml/main.qml loaded "C:/Users/User/Project_Memory_MCP/Project-Memory-MCP/target/release/qml/QtQuick/Controls/Basic/qmldir"
qt.qml.import: locateLocalQmldir: QtQuick.Controls.Material module's qmldir found at "C:/Users/User/Project_Memory_MCP/Project-Memory-MCP/target/release/qml/QtQuick/Controls/Material/qmldir"
qt.qml.import: addLibraryImport: qrc:/qt/qml/com/projectmemory/supervisor/qml/main.qml "QtQuick.Layouts" version "1.15" as ""
qt.qml.import: importExtension: qrc:/qt/qml/com/projectmemory/supervisor/qml/main.qml loaded "C:/Users/User/Project_Memory_MCP/Project-Memory-MCP/target/release/qml/QtQuick/Layouts/qmldir"
qt.qml.import: locateLocalQmldir: QtQuick.Layouts module's qmldir found at "C:/Users/User/Project_Memory_MCP/Project-Memory-MCP/target/release/qml/QtQuick/Layouts/qmldir"
qt.qml.import: addLibraryImport: qrc:/qt/qml/com/projectmemory/supervisor/qml/main.qml "Qt.labs.platform" version "1.1" as "Platform"
qt.qml.import: importExtension: qrc:/qt/qml/com/projectmemory/supervisor/qml/main.qml loaded "C:/Users/User/Project_Memory_MCP/Project-Memory-MCP/target/release/qml/Qt/labs/platform/qmldir"
qt.qml.import: locateLocalQmldir: Qt.labs.platform module's qmldir found at "C:/Users/User/Project_Memory_MCP/Project-Memory-MCP/target/release/qml/Qt/labs/platform/qmldir"
qt.qml.import: addLibraryImport: qrc:/qt/qml/com/projectmemory/supervisor/qml/main.qml "com.projectmemory.supervisor" version "(latest)" as ""
qt.qml.import: importExtension: qrc:/qt/qml/com/projectmemory/supervisor/qml/main.qml loaded ":/qt/qml/com/projectmemory/supervisor/qmldir"
qt.qml.import: resolvePlugin Could not resolve dynamic plugin with base name "com_projectmemory_supervisor" in ":/qt/qml/com/projectmemory/supervisor"  file does not exist
qt.qml.import: locateLocalQmldir: com.projectmemory.supervisor module's qmldir found at ""
qt.qml.import: addImplicitImport: qrc:/qt/qml/com/projectmemory/supervisor/qml/main.qml
qt.qml.import: addFileImport: qrc:/qt/qml/com/projectmemory/supervisor/qml/main.qml "." version "(latest)" as ""
qt.qml.import: resolveType: qrc:/qt/qml/com/projectmemory/supervisor/qml/main.qml "ScrollView"  =>  ""   QUrl("qrc:/qt-project.org/imports/QtQuick/Controls/Material/ScrollView.qml")  TYPE/URL
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ScrollView.qml "QtQuick" version "(latest)" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ScrollView.qml loaded ":/qt-project.org/imports/QtQuick/qmldir"
qt.qml.import: loading dependent import "QtQml" version 6.10 as ""
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ScrollView.qml "QtQml" version "6.10" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ScrollView.qml loaded ":/qt-project.org/imports/QtQml/qmldir"
qt.qml.import: loading dependent import "QML" version 1.0 as ""
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ScrollView.qml "QML" version "1.0" as ""
qt.qml.import: loading dependent import "QtQml.Models" version 6.10 as ""
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ScrollView.qml "QtQml.Models" version "6.10" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ScrollView.qml loaded ":/qt-project.org/imports/QtQml/Models/qmldir"
qt.qml.import: locateLocalQmldir: QtQml.Models module's qmldir found at "C:/Users/User/Project_Memory_MCP/Project-Memory-MCP/target/release/qml/QtQml/Models/qmldir"
qt.qml.import: loading dependent import "QtQml.WorkerScript" version 6.10 as ""
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ScrollView.qml "QtQml.WorkerScript" version "6.10" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ScrollView.qml loaded ":/qt-project.org/imports/QtQml/WorkerScript/qmldir"
qt.qml.import: locateLocalQmldir: QtQml.WorkerScript module's qmldir found at "C:/Users/User/Project_Memory_MCP/Project-Memory-MCP/target/release/qml/QtQml/WorkerScript/qmldir"
qt.qml.import: locateLocalQmldir: QtQml module's qmldir found at "C:/Users/User/Project_Memory_MCP/Project-Memory-MCP/target/release/qml/QtQml/qmldir"
qt.qml.import: locateLocalQmldir: QtQuick module's qmldir found at "C:/Users/User/Project_Memory_MCP/Project-Memory-MCP/target/release/qml/QtQuick/qmldir"
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ScrollView.qml "QtQuick.Controls.impl" version "(latest)" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ScrollView.qml loaded "C:/Users/User/Project_Memory_MCP/Project-Memory-MCP/target/release/qml/QtQuick/Controls/impl/qmldir"
qt.qml.import: locateLocalQmldir: QtQuick.Controls.impl module's qmldir found at "C:/Users/User/Project_Memory_MCP/Project-Memory-MCP/target/release/qml/QtQuick/Controls/impl/qmldir"
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ScrollView.qml "QtQuick.Templates" version "(latest)" as "T"
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ScrollView.qml loaded ":/qt-project.org/imports/QtQuick/Templates/qmldir"
qt.qml.import: resolvePlugin Could not resolve dynamic plugin with base name "qtquicktemplates2plugin" in ":/qt-project.org/imports/QtQuick/Templates"  file does not exist
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ScrollView.qml "QtQuick.Templates" version "(latest)" as "T"
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ScrollView.qml loaded "C:/Users/User/Project_Memory_MCP/Project-Memory-MCP/target/release/qml/QtQuick/Templates/qmldir"
qt.qml.import: locateLocalQmldir: QtQuick.Templates module's qmldir found at "C:/Users/User/Project_Memory_MCP/Project-Memory-MCP/target/release/qml/QtQuick/Templates/qmldir"
qt.qml.import: addImplicitImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ScrollView.qml
qt.qml.import: addFileImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ScrollView.qml "." version "(latest)" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ScrollView.qml loaded ":/qt-project.org/imports/QtQuick/Controls/Material/qmldir"
qt.qml.import: loading dependent import "QtQuick.Controls.Basic" version invalid as ""
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ScrollView.qml "QtQuick.Controls.Basic" version "(latest)" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ScrollView.qml loaded ":/qt-project.org/imports/QtQuick/Controls/Basic/qmldir"
qt.qml.import: locateLocalQmldir: QtQuick.Controls.Basic module's qmldir found at "C:/Users/User/Project_Memory_MCP/Project-Memory-MCP/target/release/qml/QtQuick/Controls/Basic/qmldir"
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ScrollView.qml "Calendar"  =>  "Calendar"   QUrl("qrc:/qt-project.org/imports/QtQuick/Controls/Basic/Calendar.qml")  TYPE/URL-SINGLETON
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Basic/Calendar.qml "QtQuick.Templates" version "(latest)" as "T"
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Basic/Calendar.qml loaded ":/qt-project.org/imports/QtQuick/Templates/qmldir"
qt.qml.import: addImplicitImport: qrc:/qt-project.org/imports/QtQuick/Controls/Basic/Calendar.qml
qt.qml.import: addFileImport: qrc:/qt-project.org/imports/QtQuick/Controls/Basic/Calendar.qml "." version "(latest)" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Basic/Calendar.qml loaded ":/qt-project.org/imports/QtQuick/Controls/Basic/qmldir"
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Basic/Calendar.qml "T.Calendar"  =>  "QQuickCalendar"  TYPE
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ScrollView.qml "ScrollBar"  =>  ""   QUrl("qrc:/qt-project.org/imports/QtQuick/Controls/Material/ScrollBar.qml")  TYPE/URL
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ScrollBar.qml "QtQuick" version "(latest)" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ScrollBar.qml loaded ":/qt-project.org/imports/QtQuick/qmldir"
qt.qml.import: loading dependent import "QtQml" version 6.10 as ""
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ScrollBar.qml "QtQml" version "6.10" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ScrollBar.qml loaded ":/qt-project.org/imports/QtQml/qmldir"
qt.qml.import: loading dependent import "QML" version 1.0 as ""
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ScrollBar.qml "QML" version "1.0" as ""
qt.qml.import: loading dependent import "QtQml.Models" version 6.10 as ""
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ScrollBar.qml "QtQml.Models" version "6.10" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ScrollBar.qml loaded ":/qt-project.org/imports/QtQml/Models/qmldir"
qt.qml.import: loading dependent import "QtQml.WorkerScript" version 6.10 as ""
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ScrollBar.qml "QtQml.WorkerScript" version "6.10" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ScrollBar.qml loaded ":/qt-project.org/imports/QtQml/WorkerScript/qmldir"
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ScrollBar.qml "QtQuick.Templates" version "(latest)" as "T"
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ScrollBar.qml loaded ":/qt-project.org/imports/QtQuick/Templates/qmldir"
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ScrollBar.qml "QtQuick.Controls.Material" version "(latest)" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ScrollBar.qml loaded ":/qt-project.org/imports/QtQuick/Controls/Material/qmldir"
qt.qml.import: loading dependent import "QtQuick.Controls.Basic" version 6.10 as ""
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ScrollBar.qml "QtQuick.Controls.Basic" version "6.10" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ScrollBar.qml loaded "C:/Users/User/Project_Memory_MCP/Project-Memory-MCP/target/release/qml/QtQuick/Controls/Basic/qmldir"
qt.qml.import: locateLocalQmldir: QtQuick.Controls.Material module's qmldir found at "C:/Users/User/Project_Memory_MCP/Project-Memory-MCP/target/release/qml/QtQuick/Controls/Material/qmldir"
qt.qml.import: addImplicitImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ScrollBar.qml
qt.qml.import: addFileImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ScrollBar.qml "." version "(latest)" as ""
qt.qml.import: loading dependent import "QtQuick.Controls.Basic" version invalid as ""
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ScrollBar.qml "QtQuick.Controls.Basic" version "(latest)" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ScrollBar.qml loaded ":/qt-project.org/imports/QtQuick/Controls/Basic/qmldir"
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ScrollBar.qml "Calendar"  =>  "Calendar"   QUrl("qrc:/qt-project.org/imports/QtQuick/Controls/Basic/Calendar.qml")  TYPE/URL-SINGLETON
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ScrollBar.qml "Calendar"  =>  "Calendar"   QUrl("qrc:/qt-project.org/imports/QtQuick/Controls/Basic/Calendar.qml")  TYPE/URL-SINGLETON
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ScrollBar.qml "PauseAnimation"  =>  "QQuickPauseAnimation"  TYPE
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ScrollBar.qml "Transition"  =>  "QQuickTransition"  TYPE
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ScrollBar.qml "PropertyAction"  =>  "QQuickPropertyAction"  TYPE
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ScrollBar.qml "NumberAnimation"  =>  "QQuickNumberAnimation"  TYPE
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ScrollBar.qml "T.ScrollBar"  =>  "QQuickScrollBar"  TYPE
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ScrollBar.qml "State"  =>  "QQuickState"  TYPE
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ScrollBar.qml "SequentialAnimation"  =>  "QQuickSequentialAnimation"  TYPE
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ScrollBar.qml "Rectangle"  =>  "QQuickRectangle"  TYPE
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ScrollView.qml "T.ScrollView"  =>  "QQuickScrollView"  TYPE
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ScrollView.qml "ScrollBar"  =>  ""   QUrl("qrc:/qt-project.org/imports/QtQuick/Controls/Material/ScrollBar.qml")  TYPE/URL
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ScrollView.qml "ScrollBar"  =>  ""   QUrl("qrc:/qt-project.org/imports/QtQuick/Controls/Material/ScrollBar.qml")  TYPE/URL
qt.qml.import: resolveType: qrc:/qt/qml/com/projectmemory/supervisor/qml/main.qml "SupervisorGuiBridge"  =>  "SupervisorGuiBridge"  TYPE
qt.qml.import: resolveType: qrc:/qt/qml/com/projectmemory/supervisor/qml/main.qml "Platform.MenuItem"  =>  "QQuickLabsPlatformMenuItem"  TYPE
qt.qml.import: resolveType: qrc:/qt/qml/com/projectmemory/supervisor/qml/main.qml "CartographerPanel"  =>  ""   QUrl("qrc:/qt/qml/com/projectmemory/supervisor/qml/CartographerPanel.qml")  TYPE/URL
qt.qml.import: addLibraryImport: qrc:/qt/qml/com/projectmemory/supervisor/qml/CartographerPanel.qml "QtQuick" version "2.15" as ""
qt.qml.import: importExtension: qrc:/qt/qml/com/projectmemory/supervisor/qml/CartographerPanel.qml loaded "C:/Users/User/Project_Memory_MCP/Project-Memory-MCP/target/release/qml/QtQuick/qmldir"
qt.qml.import: loading dependent import "QtQml" version 2.15 as ""
qt.qml.import: addLibraryImport: qrc:/qt/qml/com/projectmemory/supervisor/qml/CartographerPanel.qml "QtQml" version "2.15" as ""
qt.qml.import: importExtension: qrc:/qt/qml/com/projectmemory/supervisor/qml/CartographerPanel.qml loaded ":/qt-project.org/imports/QtQml/qmldir"
qt.qml.import: loading dependent import "QML" version 1.0 as ""
qt.qml.import: addLibraryImport: qrc:/qt/qml/com/projectmemory/supervisor/qml/CartographerPanel.qml "QML" version "1.0" as ""
qt.qml.import: loading dependent import "QtQml.Models" version 2.15 as ""
qt.qml.import: addLibraryImport: qrc:/qt/qml/com/projectmemory/supervisor/qml/CartographerPanel.qml "QtQml.Models" version "2.15" as ""
qt.qml.import: importExtension: qrc:/qt/qml/com/projectmemory/supervisor/qml/CartographerPanel.qml loaded ":/qt-project.org/imports/QtQml/Models/qmldir"
qt.qml.import: loading dependent import "QtQml.WorkerScript" version 2.15 as ""
qt.qml.import: addLibraryImport: qrc:/qt/qml/com/projectmemory/supervisor/qml/CartographerPanel.qml "QtQml.WorkerScript" version "2.15" as ""
qt.qml.import: importExtension: qrc:/qt/qml/com/projectmemory/supervisor/qml/CartographerPanel.qml loaded ":/qt-project.org/imports/QtQml/WorkerScript/qmldir"
qt.qml.import: addLibraryImport: qrc:/qt/qml/com/projectmemory/supervisor/qml/CartographerPanel.qml "QtQuick.Controls" version "2.15" as ""
qt.qml.import: importExtension: qrc:/qt/qml/com/projectmemory/supervisor/qml/CartographerPanel.qml loaded "C:/Users/User/Project_Memory_MCP/Project-Memory-MCP/target/release/qml/QtQuick/Controls/qmldir"
qt.qml.import: loading dependent import "QtQuick.Controls.Windows" version 2.15 as ""
qt.qml.import: addLibraryImport: qrc:/qt/qml/com/projectmemory/supervisor/qml/CartographerPanel.qml "QtQuick.Controls.Windows" version "2.15" as ""
qt.qml.import: importExtension: qrc:/qt/qml/com/projectmemory/supervisor/qml/CartographerPanel.qml loaded "C:/Users/User/Project_Memory_MCP/Project-Memory-MCP/target/release/qml/QtQuick/Controls/Windows/qmldir"
qt.qml.import: loading dependent import "QtQuick.Controls.Basic" version 2.15 as ""
qt.qml.import: addLibraryImport: qrc:/qt/qml/com/projectmemory/supervisor/qml/CartographerPanel.qml "QtQuick.Controls.Basic" version "2.15" as ""
qt.qml.import: importExtension: qrc:/qt/qml/com/projectmemory/supervisor/qml/CartographerPanel.qml loaded "C:/Users/User/Project_Memory_MCP/Project-Memory-MCP/target/release/qml/QtQuick/Controls/Basic/qmldir"
qt.qml.import: loading dependent import "QtQuick.Controls.Fusion" version 2.15 as ""
qt.qml.import: addLibraryImport: qrc:/qt/qml/com/projectmemory/supervisor/qml/CartographerPanel.qml "QtQuick.Controls.Fusion" version "2.15" as ""
qt.qml.import: importExtension: qrc:/qt/qml/com/projectmemory/supervisor/qml/CartographerPanel.qml loaded "C:/Users/User/Project_Memory_MCP/Project-Memory-MCP/target/release/qml/QtQuick/Controls/Fusion/qmldir"
qt.qml.import: loading dependent import "QtQuick.Controls.Basic" version 2.15 as ""
qt.qml.import: addLibraryImport: qrc:/qt/qml/com/projectmemory/supervisor/qml/CartographerPanel.qml "QtQuick.Controls.Basic" version "2.15" as ""
qt.qml.import: importExtension: qrc:/qt/qml/com/projectmemory/supervisor/qml/CartographerPanel.qml loaded "C:/Users/User/Project_Memory_MCP/Project-Memory-MCP/target/release/qml/QtQuick/Controls/Basic/qmldir"
qt.qml.import: addLibraryImport: qrc:/qt/qml/com/projectmemory/supervisor/qml/CartographerPanel.qml "QtQuick.Controls.Material" version "2.15" as ""
qt.qml.import: importExtension: qrc:/qt/qml/com/projectmemory/supervisor/qml/CartographerPanel.qml loaded "C:/Users/User/Project_Memory_MCP/Project-Memory-MCP/target/release/qml/QtQuick/Controls/Material/qmldir"
qt.qml.import: loading dependent import "QtQuick.Controls.Basic" version 2.15 as ""
qt.qml.import: addLibraryImport: qrc:/qt/qml/com/projectmemory/supervisor/qml/CartographerPanel.qml "QtQuick.Controls.Basic" version "2.15" as ""
qt.qml.import: importExtension: qrc:/qt/qml/com/projectmemory/supervisor/qml/CartographerPanel.qml loaded "C:/Users/User/Project_Memory_MCP/Project-Memory-MCP/target/release/qml/QtQuick/Controls/Basic/qmldir"
qt.qml.import: addLibraryImport: qrc:/qt/qml/com/projectmemory/supervisor/qml/CartographerPanel.qml "QtQuick.Layouts" version "1.15" as ""
qt.qml.import: importExtension: qrc:/qt/qml/com/projectmemory/supervisor/qml/CartographerPanel.qml loaded "C:/Users/User/Project_Memory_MCP/Project-Memory-MCP/target/release/qml/QtQuick/Layouts/qmldir"
qt.qml.import: addImplicitImport: qrc:/qt/qml/com/projectmemory/supervisor/qml/CartographerPanel.qml
qt.qml.import: addFileImport: qrc:/qt/qml/com/projectmemory/supervisor/qml/CartographerPanel.qml "." version "(latest)" as ""
qt.qml.import: resolveType: qrc:/qt/qml/com/projectmemory/supervisor/qml/CartographerPanel.qml "Canvas"  =>  "QQuickCanvasItem"  TYPE
qt.qml.import: resolveType: qrc:/qt/qml/com/projectmemory/supervisor/qml/CartographerPanel.qml "ComboBox"  =>  ""   QUrl("qrc:/qt-project.org/imports/QtQuick/Controls/Material/ComboBox.qml")  TYPE/URL
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ComboBox.qml "QtQuick" version "(latest)" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ComboBox.qml loaded ":/qt-project.org/imports/QtQuick/qmldir"
qt.qml.import: loading dependent import "QtQml" version 6.10 as ""
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ComboBox.qml "QtQml" version "6.10" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ComboBox.qml loaded ":/qt-project.org/imports/QtQml/qmldir"
qt.qml.import: loading dependent import "QML" version 1.0 as ""
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ComboBox.qml "QML" version "1.0" as ""
qt.qml.import: loading dependent import "QtQml.Models" version 6.10 as ""
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ComboBox.qml "QtQml.Models" version "6.10" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ComboBox.qml loaded ":/qt-project.org/imports/QtQml/Models/qmldir"
qt.qml.import: loading dependent import "QtQml.WorkerScript" version 6.10 as ""
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ComboBox.qml "QtQml.WorkerScript" version "6.10" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ComboBox.qml loaded ":/qt-project.org/imports/QtQml/WorkerScript/qmldir"
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ComboBox.qml "QtQuick.Window" version "(latest)" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ComboBox.qml loaded "C:/Users/User/Project_Memory_MCP/Project-Memory-MCP/target/release/qml/QtQuick/Window/qmldir"
qt.qml.import: loading dependent import "QtQuick" version 6.10 as ""
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ComboBox.qml "QtQuick" version "6.10" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ComboBox.qml loaded "C:/Users/User/Project_Memory_MCP/Project-Memory-MCP/target/release/qml/QtQuick/qmldir"
qt.qml.import: loading dependent import "QtQml" version 6.10 as ""
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ComboBox.qml "QtQml" version "6.10" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ComboBox.qml loaded ":/qt-project.org/imports/QtQml/qmldir"
qt.qml.import: loading dependent import "QML" version 1.0 as ""
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ComboBox.qml "QML" version "1.0" as ""
qt.qml.import: loading dependent import "QtQml.Models" version 6.10 as ""
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ComboBox.qml "QtQml.Models" version "6.10" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ComboBox.qml loaded ":/qt-project.org/imports/QtQml/Models/qmldir"
qt.qml.import: loading dependent import "QtQml.WorkerScript" version 6.10 as ""
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ComboBox.qml "QtQml.WorkerScript" version "6.10" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ComboBox.qml loaded ":/qt-project.org/imports/QtQml/WorkerScript/qmldir"
qt.qml.import: locateLocalQmldir: QtQuick.Window module's qmldir found at "C:/Users/User/Project_Memory_MCP/Project-Memory-MCP/target/release/qml/QtQuick/Window/qmldir"
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ComboBox.qml "QtQuick.Controls.impl" version "(latest)" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ComboBox.qml loaded "C:/Users/User/Project_Memory_MCP/Project-Memory-MCP/target/release/qml/QtQuick/Controls/impl/qmldir"
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ComboBox.qml "QtQuick.Templates" version "(latest)" as "T"
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ComboBox.qml loaded ":/qt-project.org/imports/QtQuick/Templates/qmldir"
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ComboBox.qml "QtQuick.Controls.Material" version "(latest)" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ComboBox.qml loaded ":/qt-project.org/imports/QtQuick/Controls/Material/qmldir"
qt.qml.import: loading dependent import "QtQuick.Controls.Basic" version 6.10 as ""
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ComboBox.qml "QtQuick.Controls.Basic" version "6.10" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ComboBox.qml loaded "C:/Users/User/Project_Memory_MCP/Project-Memory-MCP/target/release/qml/QtQuick/Controls/Basic/qmldir"
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ComboBox.qml "QtQuick.Controls.Material.impl" version "(latest)" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ComboBox.qml loaded "C:/Users/User/Project_Memory_MCP/Project-Memory-MCP/target/release/qml/QtQuick/Controls/Material/impl/qmldir"
qt.qml.import: locateLocalQmldir: QtQuick.Controls.Material.impl module's qmldir found at "C:/Users/User/Project_Memory_MCP/Project-Memory-MCP/target/release/qml/QtQuick/Controls/Material/impl/qmldir"
qt.qml.import: addImplicitImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ComboBox.qml
qt.qml.import: addFileImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ComboBox.qml "." version "(latest)" as ""
qt.qml.import: loading dependent import "QtQuick.Controls.Basic" version invalid as ""
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ComboBox.qml "QtQuick.Controls.Basic" version "(latest)" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ComboBox.qml loaded ":/qt-project.org/imports/QtQuick/Controls/Basic/qmldir"
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ComboBox.qml "Calendar"  =>  "Calendar"   QUrl("qrc:/qt-project.org/imports/QtQuick/Controls/Basic/Calendar.qml")  TYPE/URL-SINGLETON
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ComboBox.qml "Calendar"  =>  "Calendar"   QUrl("qrc:/qt-project.org/imports/QtQuick/Controls/Basic/Calendar.qml")  TYPE/URL-SINGLETON
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ComboBox.qml "CursorDelegate"  =>  ""   QUrl("qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/CursorDelegate.qml")  TYPE/URL
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/CursorDelegate.qml "QtQuick" version "(latest)" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/CursorDelegate.qml loaded ":/qt-project.org/imports/QtQuick/qmldir"
qt.qml.import: loading dependent import "QtQml" version 6.10 as ""
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/CursorDelegate.qml "QtQml" version "6.10" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/CursorDelegate.qml loaded ":/qt-project.org/imports/QtQml/qmldir"
qt.qml.import: loading dependent import "QML" version 1.0 as ""
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/CursorDelegate.qml "QML" version "1.0" as ""
qt.qml.import: loading dependent import "QtQml.Models" version 6.10 as ""
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/CursorDelegate.qml "QtQml.Models" version "6.10" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/CursorDelegate.qml loaded ":/qt-project.org/imports/QtQml/Models/qmldir"
qt.qml.import: loading dependent import "QtQml.WorkerScript" version 6.10 as ""
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/CursorDelegate.qml "QtQml.WorkerScript" version "6.10" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/CursorDelegate.qml loaded ":/qt-project.org/imports/QtQml/WorkerScript/qmldir"
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/CursorDelegate.qml "QtQuick.Controls.Material" version "(latest)" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/CursorDelegate.qml loaded ":/qt-project.org/imports/QtQuick/Controls/Material/qmldir"
qt.qml.import: loading dependent import "QtQuick.Controls.Basic" version 6.10 as ""
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/CursorDelegate.qml "QtQuick.Controls.Basic" version "6.10" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/CursorDelegate.qml loaded "C:/Users/User/Project_Memory_MCP/Project-Memory-MCP/target/release/qml/QtQuick/Controls/Basic/qmldir"
qt.qml.import: addImplicitImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/CursorDelegate.qml
qt.qml.import: addFileImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/CursorDelegate.qml "." version "(latest)" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/CursorDelegate.qml loaded ":/qt-project.org/imports/QtQuick/Controls/Material/impl/qmldir"
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/CursorDelegate.qml "Calendar"  =>  "Calendar"   QUrl("qrc:/qt-project.org/imports/QtQuick/Controls/Basic/Calendar.qml")  TYPE/URL-SINGLETON
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/CursorDelegate.qml "Connections"  =>  "QQmlConnections"  TYPE
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/CursorDelegate.qml "Rectangle"  =>  "QQuickRectangle"  TYPE
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/CursorDelegate.qml "Timer"  =>  "QQmlTimer"  TYPE
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ComboBox.qml "Rectangle"  =>  "QQuickRectangle"  TYPE
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ComboBox.qml "ColorImage"  =>  "QQuickColorImage"  TYPE
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ComboBox.qml "T.Popup"  =>  "QQuickPopup"  TYPE
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ComboBox.qml "Transition"  =>  "QQuickTransition"  TYPE
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ComboBox.qml "T.TextField"  =>  "QQuickTextField"  TYPE
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ComboBox.qml "ListView"  =>  "QQuickListView"  TYPE
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ComboBox.qml "MenuItem"  =>  ""   QUrl("qrc:/qt-project.org/imports/QtQuick/Controls/Material/MenuItem.qml")  TYPE/URL
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/MenuItem.qml "QtQuick" version "(latest)" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/MenuItem.qml loaded ":/qt-project.org/imports/QtQuick/qmldir"
qt.qml.import: loading dependent import "QtQml" version 6.10 as ""
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/MenuItem.qml "QtQml" version "6.10" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/MenuItem.qml loaded ":/qt-project.org/imports/QtQml/qmldir"
qt.qml.import: loading dependent import "QML" version 1.0 as ""
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/MenuItem.qml "QML" version "1.0" as ""
qt.qml.import: loading dependent import "QtQml.Models" version 6.10 as ""
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/MenuItem.qml "QtQml.Models" version "6.10" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/MenuItem.qml loaded ":/qt-project.org/imports/QtQml/Models/qmldir"
qt.qml.import: loading dependent import "QtQml.WorkerScript" version 6.10 as ""
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/MenuItem.qml "QtQml.WorkerScript" version "6.10" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/MenuItem.qml loaded ":/qt-project.org/imports/QtQml/WorkerScript/qmldir"
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/MenuItem.qml "QtQuick.Templates" version "(latest)" as "T"
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/MenuItem.qml loaded ":/qt-project.org/imports/QtQuick/Templates/qmldir"
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/MenuItem.qml "QtQuick.Controls.impl" version "(latest)" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/MenuItem.qml loaded "C:/Users/User/Project_Memory_MCP/Project-Memory-MCP/target/release/qml/QtQuick/Controls/impl/qmldir"
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/MenuItem.qml "QtQuick.Controls.Material" version "(latest)" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/MenuItem.qml loaded ":/qt-project.org/imports/QtQuick/Controls/Material/qmldir"
qt.qml.import: loading dependent import "QtQuick.Controls.Basic" version 6.10 as ""
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/MenuItem.qml "QtQuick.Controls.Basic" version "6.10" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/MenuItem.qml loaded "C:/Users/User/Project_Memory_MCP/Project-Memory-MCP/target/release/qml/QtQuick/Controls/Basic/qmldir"
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/MenuItem.qml "QtQuick.Controls.Material.impl" version "(latest)" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/MenuItem.qml loaded "C:/Users/User/Project_Memory_MCP/Project-Memory-MCP/target/release/qml/QtQuick/Controls/Material/impl/qmldir"
qt.qml.import: addImplicitImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/MenuItem.qml
qt.qml.import: addFileImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/MenuItem.qml "." version "(latest)" as ""
qt.qml.import: loading dependent import "QtQuick.Controls.Basic" version invalid as ""
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/MenuItem.qml "QtQuick.Controls.Basic" version "(latest)" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/MenuItem.qml loaded ":/qt-project.org/imports/QtQuick/Controls/Basic/qmldir"
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/MenuItem.qml "Calendar"  =>  "Calendar"   QUrl("qrc:/qt-project.org/imports/QtQuick/Controls/Basic/Calendar.qml")  TYPE/URL-SINGLETON
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/MenuItem.qml "Calendar"  =>  "Calendar"   QUrl("qrc:/qt-project.org/imports/QtQuick/Controls/Basic/Calendar.qml")  TYPE/URL-SINGLETON
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/MenuItem.qml "Rectangle"  =>  "QQuickRectangle"  TYPE
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/MenuItem.qml "IconLabel"  =>  "QQuickIconLabel"  TYPE
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/MenuItem.qml "Ripple"  =>  "QQuickMaterialRipple"  TYPE
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/MenuItem.qml "T.MenuItem"  =>  "QQuickMenuItem"  TYPE
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/MenuItem.qml "CheckIndicator"  =>  ""   QUrl("qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/CheckIndicator.qml")  TYPE/URL
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/CheckIndicator.qml "QtQuick" version "(latest)" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/CheckIndicator.qml loaded ":/qt-project.org/imports/QtQuick/qmldir"
qt.qml.import: loading dependent import "QtQml" version 6.10 as ""
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/CheckIndicator.qml "QtQml" version "6.10" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/CheckIndicator.qml loaded ":/qt-project.org/imports/QtQml/qmldir"
qt.qml.import: loading dependent import "QML" version 1.0 as ""
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/CheckIndicator.qml "QML" version "1.0" as ""
qt.qml.import: loading dependent import "QtQml.Models" version 6.10 as ""
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/CheckIndicator.qml "QtQml.Models" version "6.10" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/CheckIndicator.qml loaded ":/qt-project.org/imports/QtQml/Models/qmldir"
qt.qml.import: loading dependent import "QtQml.WorkerScript" version 6.10 as ""
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/CheckIndicator.qml "QtQml.WorkerScript" version "6.10" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/CheckIndicator.qml loaded ":/qt-project.org/imports/QtQml/WorkerScript/qmldir"
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/CheckIndicator.qml "QtQuick.Controls.Material" version "(latest)" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/CheckIndicator.qml loaded ":/qt-project.org/imports/QtQuick/Controls/Material/qmldir"
qt.qml.import: loading dependent import "QtQuick.Controls.Basic" version 6.10 as ""
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/CheckIndicator.qml "QtQuick.Controls.Basic" version "6.10" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/CheckIndicator.qml loaded "C:/Users/User/Project_Memory_MCP/Project-Memory-MCP/target/release/qml/QtQuick/Controls/Basic/qmldir"
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/CheckIndicator.qml "QtQuick.Controls.Material.impl" version "(latest)" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/CheckIndicator.qml loaded "C:/Users/User/Project_Memory_MCP/Project-Memory-MCP/target/release/qml/QtQuick/Controls/Material/impl/qmldir"
qt.qml.import: addImplicitImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/CheckIndicator.qml
qt.qml.import: addFileImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/CheckIndicator.qml "." version "(latest)" as ""
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/CheckIndicator.qml "Calendar"  =>  "Calendar"   QUrl("qrc:/qt-project.org/imports/QtQuick/Controls/Basic/Calendar.qml")  TYPE/URL-SINGLETON
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/CheckIndicator.qml "Rectangle"  =>  "QQuickRectangle"  TYPE
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/CheckIndicator.qml "NumberAnimation"  =>  "QQuickNumberAnimation"  TYPE
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/CheckIndicator.qml "Item"  =>  "QQuickItem"  TYPE
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/CheckIndicator.qml "Behavior"  =>  "QQuickBehavior"  TYPE
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/CheckIndicator.qml "SequentialAnimation"  =>  "QQuickSequentialAnimation"  TYPE
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/CheckIndicator.qml "ColorAnimation"  =>  "QQuickColorAnimation"  TYPE
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/CheckIndicator.qml "State"  =>  "QQuickState"  TYPE
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/CheckIndicator.qml "Image"  =>  "QQuickImage"  TYPE
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/CheckIndicator.qml "Transition"  =>  "QQuickTransition"  TYPE
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/CheckIndicator.qml "Item"  =>  "QQuickItem"  TYPE
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/MenuItem.qml "ColorImage"  =>  "QQuickColorImage"  TYPE
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ComboBox.qml "T.ComboBox"  =>  "QQuickComboBox"  TYPE
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ComboBox.qml "NumberAnimation"  =>  "QQuickNumberAnimation"  TYPE
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ComboBox.qml "T.ScrollIndicator"  =>  "QQuickScrollIndicator"  TYPE
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ComboBox.qml "ScrollIndicator"  =>  ""   QUrl("qrc:/qt-project.org/imports/QtQuick/Controls/Material/ScrollIndicator.qml")  TYPE/URL
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ScrollIndicator.qml "QtQuick" version "(latest)" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ScrollIndicator.qml loaded ":/qt-project.org/imports/QtQuick/qmldir"
qt.qml.import: loading dependent import "QtQml" version 6.10 as ""
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ScrollIndicator.qml "QtQml" version "6.10" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ScrollIndicator.qml loaded ":/qt-project.org/imports/QtQml/qmldir"
qt.qml.import: loading dependent import "QML" version 1.0 as ""
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ScrollIndicator.qml "QML" version "1.0" as ""
qt.qml.import: loading dependent import "QtQml.Models" version 6.10 as ""
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ScrollIndicator.qml "QtQml.Models" version "6.10" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ScrollIndicator.qml loaded ":/qt-project.org/imports/QtQml/Models/qmldir"
qt.qml.import: loading dependent import "QtQml.WorkerScript" version 6.10 as ""
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ScrollIndicator.qml "QtQml.WorkerScript" version "6.10" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ScrollIndicator.qml loaded ":/qt-project.org/imports/QtQml/WorkerScript/qmldir"
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ScrollIndicator.qml "QtQuick.Templates" version "(latest)" as "T"
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ScrollIndicator.qml loaded ":/qt-project.org/imports/QtQuick/Templates/qmldir"
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ScrollIndicator.qml "QtQuick.Controls.Material" version "(latest)" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ScrollIndicator.qml loaded ":/qt-project.org/imports/QtQuick/Controls/Material/qmldir"
qt.qml.import: loading dependent import "QtQuick.Controls.Basic" version 6.10 as ""
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ScrollIndicator.qml "QtQuick.Controls.Basic" version "6.10" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ScrollIndicator.qml loaded "C:/Users/User/Project_Memory_MCP/Project-Memory-MCP/target/release/qml/QtQuick/Controls/Basic/qmldir"
qt.qml.import: addImplicitImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ScrollIndicator.qml
qt.qml.import: addFileImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ScrollIndicator.qml "." version "(latest)" as ""
qt.qml.import: loading dependent import "QtQuick.Controls.Basic" version invalid as ""
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ScrollIndicator.qml "QtQuick.Controls.Basic" version "(latest)" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ScrollIndicator.qml loaded ":/qt-project.org/imports/QtQuick/Controls/Basic/qmldir"
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ScrollIndicator.qml "Calendar"  =>  "Calendar"   QUrl("qrc:/qt-project.org/imports/QtQuick/Controls/Basic/Calendar.qml")  TYPE/URL-SINGLETON
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ScrollIndicator.qml "Calendar"  =>  "Calendar"   QUrl("qrc:/qt-project.org/imports/QtQuick/Controls/Basic/Calendar.qml")  TYPE/URL-SINGLETON
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ScrollIndicator.qml "PauseAnimation"  =>  "QQuickPauseAnimation"  TYPE
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ScrollIndicator.qml "PropertyChanges"  =>  "QQuickPropertyChanges"  TYPE
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ScrollIndicator.qml "NumberAnimation"  =>  "QQuickNumberAnimation"  TYPE
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ScrollIndicator.qml "Transition"  =>  "QQuickTransition"  TYPE
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ScrollIndicator.qml "Rectangle"  =>  "QQuickRectangle"  TYPE
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ScrollIndicator.qml "SequentialAnimation"  =>  "QQuickSequentialAnimation"  TYPE
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ScrollIndicator.qml "T.ScrollIndicator"  =>  "QQuickScrollIndicator"  TYPE
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ScrollIndicator.qml "State"  =>  "QQuickState"  TYPE
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ComboBox.qml "RoundedElevationEffect"  =>  ""   QUrl("qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/RoundedElevationEffect.qml")  TYPE/URL
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/RoundedElevationEffect.qml "QtQuick.Controls.Material" version "(latest)" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/RoundedElevationEffect.qml loaded ":/qt-project.org/imports/QtQuick/Controls/Material/qmldir"
qt.qml.import: loading dependent import "QtQuick.Controls.Basic" version 6.10 as ""
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/RoundedElevationEffect.qml "QtQuick.Controls.Basic" version "6.10" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/RoundedElevationEffect.qml loaded "C:/Users/User/Project_Memory_MCP/Project-Memory-MCP/target/release/qml/QtQuick/Controls/Basic/qmldir"
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/RoundedElevationEffect.qml "QtQuick.Controls.Material.impl" version "(latest)" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/RoundedElevationEffect.qml loaded "C:/Users/User/Project_Memory_MCP/Project-Memory-MCP/target/release/qml/QtQuick/Controls/Material/impl/qmldir"
qt.qml.import: addImplicitImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/RoundedElevationEffect.qml
qt.qml.import: addFileImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/RoundedElevationEffect.qml "." version "(latest)" as ""
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/RoundedElevationEffect.qml "Calendar"  =>  "Calendar"   QUrl("qrc:/qt-project.org/imports/QtQuick/Controls/Basic/Calendar.qml")  TYPE/URL-SINGLETON
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/RoundedElevationEffect.qml "ElevationEffect"  =>  ""   QUrl("qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/ElevationEffect.qml")  TYPE/URL
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/ElevationEffect.qml "QtQuick" version "(latest)" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/ElevationEffect.qml loaded ":/qt-project.org/imports/QtQuick/qmldir"
qt.qml.import: loading dependent import "QtQml" version 6.10 as ""
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/ElevationEffect.qml "QtQml" version "6.10" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/ElevationEffect.qml loaded ":/qt-project.org/imports/QtQml/qmldir"
qt.qml.import: loading dependent import "QML" version 1.0 as ""
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/ElevationEffect.qml "QML" version "1.0" as ""
qt.qml.import: loading dependent import "QtQml.Models" version 6.10 as ""
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/ElevationEffect.qml "QtQml.Models" version "6.10" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/ElevationEffect.qml loaded ":/qt-project.org/imports/QtQml/Models/qmldir"
qt.qml.import: loading dependent import "QtQml.WorkerScript" version 6.10 as ""
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/ElevationEffect.qml "QtQml.WorkerScript" version "6.10" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/ElevationEffect.qml loaded ":/qt-project.org/imports/QtQml/WorkerScript/qmldir"
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/ElevationEffect.qml "QtQuick.Controls.Material" version "(latest)" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/ElevationEffect.qml loaded ":/qt-project.org/imports/QtQuick/Controls/Material/qmldir"
qt.qml.import: loading dependent import "QtQuick.Controls.Basic" version 6.10 as ""
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/ElevationEffect.qml "QtQuick.Controls.Basic" version "6.10" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/ElevationEffect.qml loaded "C:/Users/User/Project_Memory_MCP/Project-Memory-MCP/target/release/qml/QtQuick/Controls/Basic/qmldir"
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/ElevationEffect.qml "QtQuick.Controls.Material.impl" version "(latest)" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/ElevationEffect.qml loaded "C:/Users/User/Project_Memory_MCP/Project-Memory-MCP/target/release/qml/QtQuick/Controls/Material/impl/qmldir"
qt.qml.import: addImplicitImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/ElevationEffect.qml
qt.qml.import: addFileImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/ElevationEffect.qml "." version "(latest)" as ""
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/ElevationEffect.qml "Calendar"  =>  "Calendar"   QUrl("qrc:/qt-project.org/imports/QtQuick/Controls/Basic/Calendar.qml")  TYPE/URL-SINGLETON
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/ElevationEffect.qml "BoxShadow"  =>  ""   QUrl("qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/BoxShadow.qml")  TYPE/URL
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/BoxShadow.qml "QtQuick" version "(latest)" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/BoxShadow.qml loaded ":/qt-project.org/imports/QtQuick/qmldir"
qt.qml.import: loading dependent import "QtQml" version 6.10 as ""
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/BoxShadow.qml "QtQml" version "6.10" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/BoxShadow.qml loaded ":/qt-project.org/imports/QtQml/qmldir"
qt.qml.import: loading dependent import "QML" version 1.0 as ""
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/BoxShadow.qml "QML" version "1.0" as ""
qt.qml.import: loading dependent import "QtQml.Models" version 6.10 as ""
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/BoxShadow.qml "QtQml.Models" version "6.10" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/BoxShadow.qml loaded ":/qt-project.org/imports/QtQml/Models/qmldir"
qt.qml.import: loading dependent import "QtQml.WorkerScript" version 6.10 as ""
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/BoxShadow.qml "QtQml.WorkerScript" version "6.10" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/BoxShadow.qml loaded ":/qt-project.org/imports/QtQml/WorkerScript/qmldir"
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/BoxShadow.qml "QtQuick.Controls.Material" version "(latest)" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/BoxShadow.qml loaded ":/qt-project.org/imports/QtQuick/Controls/Material/qmldir"
qt.qml.import: loading dependent import "QtQuick.Controls.Basic" version 6.10 as ""
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/BoxShadow.qml "QtQuick.Controls.Basic" version "6.10" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/BoxShadow.qml loaded "C:/Users/User/Project_Memory_MCP/Project-Memory-MCP/target/release/qml/QtQuick/Controls/Basic/qmldir"
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/BoxShadow.qml "QtQuick.Controls.Material.impl" version "(latest)" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/BoxShadow.qml loaded "C:/Users/User/Project_Memory_MCP/Project-Memory-MCP/target/release/qml/QtQuick/Controls/Material/impl/qmldir"
qt.qml.import: addImplicitImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/BoxShadow.qml
qt.qml.import: addFileImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/BoxShadow.qml "." version "(latest)" as ""
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/BoxShadow.qml "Calendar"  =>  "Calendar"   QUrl("qrc:/qt-project.org/imports/QtQuick/Controls/Basic/Calendar.qml")  TYPE/URL-SINGLETON
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/BoxShadow.qml "RectangularGlow"  =>  ""   QUrl("qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/RectangularGlow.qml")  TYPE/URL
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/RectangularGlow.qml "QtQuick" version "(latest)" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/RectangularGlow.qml loaded ":/qt-project.org/imports/QtQuick/qmldir"
qt.qml.import: loading dependent import "QtQml" version 6.10 as ""
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/RectangularGlow.qml "QtQml" version "6.10" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/RectangularGlow.qml loaded ":/qt-project.org/imports/QtQml/qmldir"
qt.qml.import: loading dependent import "QML" version 1.0 as ""
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/RectangularGlow.qml "QML" version "1.0" as ""
qt.qml.import: loading dependent import "QtQml.Models" version 6.10 as ""
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/RectangularGlow.qml "QtQml.Models" version "6.10" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/RectangularGlow.qml loaded ":/qt-project.org/imports/QtQml/Models/qmldir"
qt.qml.import: loading dependent import "QtQml.WorkerScript" version 6.10 as ""
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/RectangularGlow.qml "QtQml.WorkerScript" version "6.10" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/RectangularGlow.qml loaded ":/qt-project.org/imports/QtQml/WorkerScript/qmldir"
qt.qml.import: addImplicitImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/RectangularGlow.qml
qt.qml.import: addFileImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/RectangularGlow.qml "." version "(latest)" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/RectangularGlow.qml loaded ":/qt-project.org/imports/QtQuick/Controls/Material/impl/qmldir"
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/RectangularGlow.qml "ShaderEffectSource"  =>  "QQuickShaderEffectSource"  TYPE
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/RectangularGlow.qml "color"  =>  ""  TYPE
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/RectangularGlow.qml "Item"  =>  "QQuickItem"  TYPE
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/RectangularGlow.qml "ShaderEffect"  =>  "QQuickShaderEffect"  TYPE
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/RectangularGlow.qml "color"  =>  ""  TYPE
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/RectangularGlow.qml "color"  =>  ""  TYPE
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/BoxShadow.qml "Item"  =>  "QQuickItem"  TYPE
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/BoxShadow.qml "Item"  =>  "QQuickItem"  TYPE
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/ElevationEffect.qml "Item"  =>  "QQuickItem"  TYPE
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/ElevationEffect.qml "ShaderEffect"  =>  "QQuickShaderEffect"  TYPE
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/ElevationEffect.qml "Item"  =>  "QQuickItem"  TYPE
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ComboBox.qml "MaterialTextContainer"  =>  "QQuickMaterialTextContainer"  TYPE
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ComboBox.qml "Material"  =>  "QQuickMaterialStyle"  TYPE
qt.qml.import: resolveType: qrc:/qt/qml/com/projectmemory/supervisor/qml/CartographerPanel.qml "Label"  =>  ""   QUrl("qrc:/qt-project.org/imports/QtQuick/Controls/Material/Label.qml")  TYPE/URL
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/Label.qml "QtQuick" version "(latest)" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/Label.qml loaded ":/qt-project.org/imports/QtQuick/qmldir"
qt.qml.import: loading dependent import "QtQml" version 6.10 as ""
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/Label.qml "QtQml" version "6.10" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/Label.qml loaded ":/qt-project.org/imports/QtQml/qmldir"
qt.qml.import: loading dependent import "QML" version 1.0 as ""
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/Label.qml "QML" version "1.0" as ""
qt.qml.import: loading dependent import "QtQml.Models" version 6.10 as ""
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/Label.qml "QtQml.Models" version "6.10" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/Label.qml loaded ":/qt-project.org/imports/QtQml/Models/qmldir"
qt.qml.import: loading dependent import "QtQml.WorkerScript" version 6.10 as ""
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/Label.qml "QtQml.WorkerScript" version "6.10" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/Label.qml loaded ":/qt-project.org/imports/QtQml/WorkerScript/qmldir"
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/Label.qml "QtQuick.Templates" version "(latest)" as "T"
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/Label.qml loaded ":/qt-project.org/imports/QtQuick/Templates/qmldir"
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/Label.qml "QtQuick.Controls.Material" version "(latest)" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/Label.qml loaded ":/qt-project.org/imports/QtQuick/Controls/Material/qmldir"
qt.qml.import: loading dependent import "QtQuick.Controls.Basic" version 6.10 as ""
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/Label.qml "QtQuick.Controls.Basic" version "6.10" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/Label.qml loaded "C:/Users/User/Project_Memory_MCP/Project-Memory-MCP/target/release/qml/QtQuick/Controls/Basic/qmldir"
qt.qml.import: addImplicitImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/Label.qml
qt.qml.import: addFileImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/Label.qml "." version "(latest)" as ""
qt.qml.import: loading dependent import "QtQuick.Controls.Basic" version invalid as ""
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/Label.qml "QtQuick.Controls.Basic" version "(latest)" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/Label.qml loaded ":/qt-project.org/imports/QtQuick/Controls/Basic/qmldir"
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/Label.qml "Calendar"  =>  "Calendar"   QUrl("qrc:/qt-project.org/imports/QtQuick/Controls/Basic/Calendar.qml")  TYPE/URL-SINGLETON
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/Label.qml "Calendar"  =>  "Calendar"   QUrl("qrc:/qt-project.org/imports/QtQuick/Controls/Basic/Calendar.qml")  TYPE/URL-SINGLETON
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/Label.qml "T.Label"  =>  "QQuickLabel"  TYPE
qt.qml.import: resolveType: qrc:/qt/qml/com/projectmemory/supervisor/qml/CartographerPanel.qml "Component"  =>  "QQmlComponent"  TYPE
qt.qml.import: resolveType: qrc:/qt/qml/com/projectmemory/supervisor/qml/CartographerPanel.qml "Button"  =>  ""   QUrl("qrc:/qt-project.org/imports/QtQuick/Controls/Material/Button.qml")  TYPE/URL
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/Button.qml "QtQuick" version "(latest)" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/Button.qml loaded ":/qt-project.org/imports/QtQuick/qmldir"
qt.qml.import: loading dependent import "QtQml" version 6.10 as ""
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/Button.qml "QtQml" version "6.10" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/Button.qml loaded ":/qt-project.org/imports/QtQml/qmldir"
qt.qml.import: loading dependent import "QML" version 1.0 as ""
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/Button.qml "QML" version "1.0" as ""
qt.qml.import: loading dependent import "QtQml.Models" version 6.10 as ""
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/Button.qml "QtQml.Models" version "6.10" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/Button.qml loaded ":/qt-project.org/imports/QtQml/Models/qmldir"
qt.qml.import: loading dependent import "QtQml.WorkerScript" version 6.10 as ""
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/Button.qml "QtQml.WorkerScript" version "6.10" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/Button.qml loaded ":/qt-project.org/imports/QtQml/WorkerScript/qmldir"
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/Button.qml "QtQuick.Templates" version "(latest)" as "T"
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/Button.qml loaded ":/qt-project.org/imports/QtQuick/Templates/qmldir"
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/Button.qml "QtQuick.Controls.impl" version "(latest)" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/Button.qml loaded "C:/Users/User/Project_Memory_MCP/Project-Memory-MCP/target/release/qml/QtQuick/Controls/impl/qmldir"
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/Button.qml "QtQuick.Controls.Material" version "(latest)" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/Button.qml loaded ":/qt-project.org/imports/QtQuick/Controls/Material/qmldir"
qt.qml.import: loading dependent import "QtQuick.Controls.Basic" version 6.10 as ""
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/Button.qml "QtQuick.Controls.Basic" version "6.10" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/Button.qml loaded "C:/Users/User/Project_Memory_MCP/Project-Memory-MCP/target/release/qml/QtQuick/Controls/Basic/qmldir"
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/Button.qml "QtQuick.Controls.Material.impl" version "(latest)" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/Button.qml loaded "C:/Users/User/Project_Memory_MCP/Project-Memory-MCP/target/release/qml/QtQuick/Controls/Material/impl/qmldir"
qt.qml.import: addImplicitImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/Button.qml
qt.qml.import: addFileImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/Button.qml "." version "(latest)" as ""
qt.qml.import: loading dependent import "QtQuick.Controls.Basic" version invalid as ""
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/Button.qml "QtQuick.Controls.Basic" version "(latest)" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/Button.qml loaded ":/qt-project.org/imports/QtQuick/Controls/Basic/qmldir"
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/Button.qml "Calendar"  =>  "Calendar"   QUrl("qrc:/qt-project.org/imports/QtQuick/Controls/Basic/Calendar.qml")  TYPE/URL-SINGLETON
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/Button.qml "Calendar"  =>  "Calendar"   QUrl("qrc:/qt-project.org/imports/QtQuick/Controls/Basic/Calendar.qml")  TYPE/URL-SINGLETON
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/Button.qml "Ripple"  =>  "QQuickMaterialRipple"  TYPE
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/Button.qml "T.Button"  =>  "QQuickButton"  TYPE
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/Button.qml "IconLabel"  =>  "QQuickIconLabel"  TYPE
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/Button.qml "Material"  =>  "QQuickMaterialStyle"  TYPE
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/Button.qml "RoundedElevationEffect"  =>  ""   QUrl("qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/RoundedElevationEffect.qml")  TYPE/URL
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/Button.qml "Rectangle"  =>  "QQuickRectangle"  TYPE
qt.qml.import: resolveType: qrc:/qt/qml/com/projectmemory/supervisor/qml/CartographerPanel.qml "ColumnLayout"  =>  "QQuickColumnLayout"  TYPE
qt.qml.import: resolveType: qrc:/qt/qml/com/projectmemory/supervisor/qml/CartographerPanel.qml "RowLayout"  =>  "QQuickRowLayout"  TYPE
qt.qml.import: resolveType: qrc:/qt/qml/com/projectmemory/supervisor/qml/CartographerPanel.qml "Material"  =>  "QQuickMaterialStyle"  TYPE
qt.qml.import: resolveType: qrc:/qt/qml/com/projectmemory/supervisor/qml/CartographerPanel.qml "ListModel"  =>  "QQmlListModel"  TYPE
qt.qml.import: resolveType: qrc:/qt/qml/com/projectmemory/supervisor/qml/CartographerPanel.qml "Rectangle"  =>  "QQuickRectangle"  TYPE
qt.qml.import: resolveType: qrc:/qt/qml/com/projectmemory/supervisor/qml/CartographerPanel.qml "ToolTip"  =>  ""   QUrl("qrc:/qt-project.org/imports/QtQuick/Controls/Material/ToolTip.qml")  TYPE/URL
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ToolTip.qml "QtQuick" version "(latest)" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ToolTip.qml loaded ":/qt-project.org/imports/QtQuick/qmldir"
qt.qml.import: loading dependent import "QtQml" version 6.10 as ""
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ToolTip.qml "QtQml" version "6.10" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ToolTip.qml loaded ":/qt-project.org/imports/QtQml/qmldir"
qt.qml.import: loading dependent import "QML" version 1.0 as ""
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ToolTip.qml "QML" version "1.0" as ""
qt.qml.import: loading dependent import "QtQml.Models" version 6.10 as ""
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ToolTip.qml "QtQml.Models" version "6.10" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ToolTip.qml loaded ":/qt-project.org/imports/QtQml/Models/qmldir"
qt.qml.import: loading dependent import "QtQml.WorkerScript" version 6.10 as ""
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ToolTip.qml "QtQml.WorkerScript" version "6.10" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ToolTip.qml loaded ":/qt-project.org/imports/QtQml/WorkerScript/qmldir"
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ToolTip.qml "QtQuick.Templates" version "(latest)" as "T"
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ToolTip.qml loaded ":/qt-project.org/imports/QtQuick/Templates/qmldir"
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ToolTip.qml "QtQuick.Controls.Material" version "(latest)" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ToolTip.qml loaded ":/qt-project.org/imports/QtQuick/Controls/Material/qmldir"
qt.qml.import: loading dependent import "QtQuick.Controls.Basic" version 6.10 as ""
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ToolTip.qml "QtQuick.Controls.Basic" version "6.10" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ToolTip.qml loaded "C:/Users/User/Project_Memory_MCP/Project-Memory-MCP/target/release/qml/QtQuick/Controls/Basic/qmldir"
qt.qml.import: addImplicitImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ToolTip.qml
qt.qml.import: addFileImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ToolTip.qml "." version "(latest)" as ""
qt.qml.import: loading dependent import "QtQuick.Controls.Basic" version invalid as ""
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ToolTip.qml "QtQuick.Controls.Basic" version "(latest)" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ToolTip.qml loaded ":/qt-project.org/imports/QtQuick/Controls/Basic/qmldir"
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ToolTip.qml "Calendar"  =>  "Calendar"   QUrl("qrc:/qt-project.org/imports/QtQuick/Controls/Basic/Calendar.qml")  TYPE/URL-SINGLETON
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ToolTip.qml "Calendar"  =>  "Calendar"   QUrl("qrc:/qt-project.org/imports/QtQuick/Controls/Basic/Calendar.qml")  TYPE/URL-SINGLETON
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ToolTip.qml "Rectangle"  =>  "QQuickRectangle"  TYPE
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ToolTip.qml "NumberAnimation"  =>  "QQuickNumberAnimation"  TYPE
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ToolTip.qml "Material"  =>  "QQuickMaterialStyle"  TYPE
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ToolTip.qml "T.ToolTip"  =>  "QQuickToolTip"  TYPE
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ToolTip.qml "Transition"  =>  "QQuickTransition"  TYPE
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/ToolTip.qml "Text"  =>  "QQuickText"  TYPE
qt.qml.import: resolveType: qrc:/qt/qml/com/projectmemory/supervisor/qml/CartographerPanel.qml "Layout"  =>  "QQuickLayout"  TYPE
qt.qml.import: resolveType: qrc:/qt/qml/com/projectmemory/supervisor/qml/CartographerPanel.qml "ToolTip"  =>  ""   QUrl("qrc:/qt-project.org/imports/QtQuick/Controls/Material/ToolTip.qml")  TYPE/URL
qt.qml.import: resolveType: qrc:/qt/qml/com/projectmemory/supervisor/qml/CartographerPanel.qml "ToolTip"  =>  ""   QUrl("qrc:/qt-project.org/imports/QtQuick/Controls/Material/ToolTip.qml")  TYPE/URL
qt.qml.import: resolveType: qrc:/qt/qml/com/projectmemory/supervisor/qml/main.qml "ColumnLayout"  =>  "QQuickColumnLayout"  TYPE
qt.qml.import: resolveType: qrc:/qt/qml/com/projectmemory/supervisor/qml/main.qml "RowLayout"  =>  "QQuickRowLayout"  TYPE
qt.qml.import: resolveType: qrc:/qt/qml/com/projectmemory/supervisor/qml/main.qml "PairingDialog"  =>  ""   QUrl("qrc:/qt/qml/com/projectmemory/supervisor/qml/PairingDialog.qml")  TYPE/URL
qt.qml.import: addLibraryImport: qrc:/qt/qml/com/projectmemory/supervisor/qml/PairingDialog.qml "QtQuick" version "2.15" as ""
qt.qml.import: importExtension: qrc:/qt/qml/com/projectmemory/supervisor/qml/PairingDialog.qml loaded "C:/Users/User/Project_Memory_MCP/Project-Memory-MCP/target/release/qml/QtQuick/qmldir"
qt.qml.import: loading dependent import "QtQml" version 2.15 as ""
qt.qml.import: addLibraryImport: qrc:/qt/qml/com/projectmemory/supervisor/qml/PairingDialog.qml "QtQml" version "2.15" as ""
qt.qml.import: importExtension: qrc:/qt/qml/com/projectmemory/supervisor/qml/PairingDialog.qml loaded ":/qt-project.org/imports/QtQml/qmldir"
qt.qml.import: loading dependent import "QML" version 1.0 as ""
qt.qml.import: addLibraryImport: qrc:/qt/qml/com/projectmemory/supervisor/qml/PairingDialog.qml "QML" version "1.0" as ""
qt.qml.import: loading dependent import "QtQml.Models" version 2.15 as ""
qt.qml.import: addLibraryImport: qrc:/qt/qml/com/projectmemory/supervisor/qml/PairingDialog.qml "QtQml.Models" version "2.15" as ""
qt.qml.import: importExtension: qrc:/qt/qml/com/projectmemory/supervisor/qml/PairingDialog.qml loaded ":/qt-project.org/imports/QtQml/Models/qmldir"
qt.qml.import: loading dependent import "QtQml.WorkerScript" version 2.15 as ""
qt.qml.import: addLibraryImport: qrc:/qt/qml/com/projectmemory/supervisor/qml/PairingDialog.qml "QtQml.WorkerScript" version "2.15" as ""
qt.qml.import: importExtension: qrc:/qt/qml/com/projectmemory/supervisor/qml/PairingDialog.qml loaded ":/qt-project.org/imports/QtQml/WorkerScript/qmldir"
qt.qml.import: addLibraryImport: qrc:/qt/qml/com/projectmemory/supervisor/qml/PairingDialog.qml "QtQuick.Controls" version "2.15" as ""
qt.qml.import: importExtension: qrc:/qt/qml/com/projectmemory/supervisor/qml/PairingDialog.qml loaded "C:/Users/User/Project_Memory_MCP/Project-Memory-MCP/target/release/qml/QtQuick/Controls/qmldir"
qt.qml.import: loading dependent import "QtQuick.Controls.Windows" version 2.15 as ""
qt.qml.import: addLibraryImport: qrc:/qt/qml/com/projectmemory/supervisor/qml/PairingDialog.qml "QtQuick.Controls.Windows" version "2.15" as ""
qt.qml.import: importExtension: qrc:/qt/qml/com/projectmemory/supervisor/qml/PairingDialog.qml loaded "C:/Users/User/Project_Memory_MCP/Project-Memory-MCP/target/release/qml/QtQuick/Controls/Windows/qmldir"
qt.qml.import: loading dependent import "QtQuick.Controls.Basic" version 2.15 as ""
qt.qml.import: addLibraryImport: qrc:/qt/qml/com/projectmemory/supervisor/qml/PairingDialog.qml "QtQuick.Controls.Basic" version "2.15" as ""
qt.qml.import: importExtension: qrc:/qt/qml/com/projectmemory/supervisor/qml/PairingDialog.qml loaded "C:/Users/User/Project_Memory_MCP/Project-Memory-MCP/target/release/qml/QtQuick/Controls/Basic/qmldir"
qt.qml.import: loading dependent import "QtQuick.Controls.Fusion" version 2.15 as ""
qt.qml.import: addLibraryImport: qrc:/qt/qml/com/projectmemory/supervisor/qml/PairingDialog.qml "QtQuick.Controls.Fusion" version "2.15" as ""
qt.qml.import: importExtension: qrc:/qt/qml/com/projectmemory/supervisor/qml/PairingDialog.qml loaded "C:/Users/User/Project_Memory_MCP/Project-Memory-MCP/target/release/qml/QtQuick/Controls/Fusion/qmldir"
qt.qml.import: loading dependent import "QtQuick.Controls.Basic" version 2.15 as ""
qt.qml.import: addLibraryImport: qrc:/qt/qml/com/projectmemory/supervisor/qml/PairingDialog.qml "QtQuick.Controls.Basic" version "2.15" as ""
qt.qml.import: importExtension: qrc:/qt/qml/com/projectmemory/supervisor/qml/PairingDialog.qml loaded "C:/Users/User/Project_Memory_MCP/Project-Memory-MCP/target/release/qml/QtQuick/Controls/Basic/qmldir"
qt.qml.import: addLibraryImport: qrc:/qt/qml/com/projectmemory/supervisor/qml/PairingDialog.qml "QtQuick.Controls.Material" version "2.15" as ""
qt.qml.import: importExtension: qrc:/qt/qml/com/projectmemory/supervisor/qml/PairingDialog.qml loaded "C:/Users/User/Project_Memory_MCP/Project-Memory-MCP/target/release/qml/QtQuick/Controls/Material/qmldir"
qt.qml.import: loading dependent import "QtQuick.Controls.Basic" version 2.15 as ""
qt.qml.import: addLibraryImport: qrc:/qt/qml/com/projectmemory/supervisor/qml/PairingDialog.qml "QtQuick.Controls.Basic" version "2.15" as ""
qt.qml.import: importExtension: qrc:/qt/qml/com/projectmemory/supervisor/qml/PairingDialog.qml loaded "C:/Users/User/Project_Memory_MCP/Project-Memory-MCP/target/release/qml/QtQuick/Controls/Basic/qmldir"
qt.qml.import: addLibraryImport: qrc:/qt/qml/com/projectmemory/supervisor/qml/PairingDialog.qml "QtQuick.Layouts" version "1.15" as ""
qt.qml.import: importExtension: qrc:/qt/qml/com/projectmemory/supervisor/qml/PairingDialog.qml loaded "C:/Users/User/Project_Memory_MCP/Project-Memory-MCP/target/release/qml/QtQuick/Layouts/qmldir"
qt.qml.import: addLibraryImport: qrc:/qt/qml/com/projectmemory/supervisor/qml/PairingDialog.qml "com.projectmemory.supervisor" version "(latest)" as ""
qt.qml.import: importExtension: qrc:/qt/qml/com/projectmemory/supervisor/qml/PairingDialog.qml loaded ":/qt/qml/com/projectmemory/supervisor/qmldir"
qt.qml.import: addImplicitImport: qrc:/qt/qml/com/projectmemory/supervisor/qml/PairingDialog.qml
qt.qml.import: addFileImport: qrc:/qt/qml/com/projectmemory/supervisor/qml/PairingDialog.qml "." version "(latest)" as ""
qt.qml.import: resolveType: qrc:/qt/qml/com/projectmemory/supervisor/qml/PairingDialog.qml "RowLayout"  =>  "QQuickRowLayout"  TYPE
qt.qml.import: resolveType: qrc:/qt/qml/com/projectmemory/supervisor/qml/PairingDialog.qml "QrPairingBridge"  =>  "QrPairingBridge"  TYPE
qt.qml.import: resolveType: qrc:/qt/qml/com/projectmemory/supervisor/qml/PairingDialog.qml "Material"  =>  "QQuickMaterialStyle"  TYPE
qt.qml.import: resolveType: qrc:/qt/qml/com/projectmemory/supervisor/qml/PairingDialog.qml "Image"  =>  "QQuickImage"  TYPE
qt.qml.import: resolveType: qrc:/qt/qml/com/projectmemory/supervisor/qml/PairingDialog.qml "Item"  =>  "QQuickItem"  TYPE
qt.qml.import: resolveType: qrc:/qt/qml/com/projectmemory/supervisor/qml/PairingDialog.qml "ColumnLayout"  =>  "QQuickColumnLayout"  TYPE
qt.qml.import: resolveType: qrc:/qt/qml/com/projectmemory/supervisor/qml/PairingDialog.qml "Layout"  =>  "QQuickLayout"  TYPE
qt.qml.import: resolveType: qrc:/qt/qml/com/projectmemory/supervisor/qml/PairingDialog.qml "Dialog"  =>  ""   QUrl("qrc:/qt-project.org/imports/QtQuick/Controls/Material/Dialog.qml")  TYPE/URL
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/Dialog.qml "QtQuick" version "(latest)" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/Dialog.qml loaded ":/qt-project.org/imports/QtQuick/qmldir"
qt.qml.import: loading dependent import "QtQml" version 6.10 as ""
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/Dialog.qml "QtQml" version "6.10" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/Dialog.qml loaded ":/qt-project.org/imports/QtQml/qmldir"
qt.qml.import: loading dependent import "QML" version 1.0 as ""
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/Dialog.qml "QML" version "1.0" as ""
qt.qml.import: loading dependent import "QtQml.Models" version 6.10 as ""
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/Dialog.qml "QtQml.Models" version "6.10" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/Dialog.qml loaded ":/qt-project.org/imports/QtQml/Models/qmldir"
qt.qml.import: loading dependent import "QtQml.WorkerScript" version 6.10 as ""
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/Dialog.qml "QtQml.WorkerScript" version "6.10" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/Dialog.qml loaded ":/qt-project.org/imports/QtQml/WorkerScript/qmldir"
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/Dialog.qml "QtQuick.Templates" version "(latest)" as "T"
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/Dialog.qml loaded ":/qt-project.org/imports/QtQuick/Templates/qmldir"
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/Dialog.qml "QtQuick.Controls.impl" version "(latest)" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/Dialog.qml loaded "C:/Users/User/Project_Memory_MCP/Project-Memory-MCP/target/release/qml/QtQuick/Controls/impl/qmldir"
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/Dialog.qml "QtQuick.Controls.Material" version "(latest)" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/Dialog.qml loaded ":/qt-project.org/imports/QtQuick/Controls/Material/qmldir"
qt.qml.import: loading dependent import "QtQuick.Controls.Basic" version 6.10 as ""
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/Dialog.qml "QtQuick.Controls.Basic" version "6.10" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/Dialog.qml loaded "C:/Users/User/Project_Memory_MCP/Project-Memory-MCP/target/release/qml/QtQuick/Controls/Basic/qmldir"
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/Dialog.qml "QtQuick.Controls.Material.impl" version "(latest)" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/Dialog.qml loaded "C:/Users/User/Project_Memory_MCP/Project-Memory-MCP/target/release/qml/QtQuick/Controls/Material/impl/qmldir"
qt.qml.import: addImplicitImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/Dialog.qml
qt.qml.import: addFileImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/Dialog.qml "." version "(latest)" as ""
qt.qml.import: loading dependent import "QtQuick.Controls.Basic" version invalid as ""
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/Dialog.qml "QtQuick.Controls.Basic" version "(latest)" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/Dialog.qml loaded ":/qt-project.org/imports/QtQuick/Controls/Basic/qmldir"
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/Dialog.qml "Calendar"  =>  "Calendar"   QUrl("qrc:/qt-project.org/imports/QtQuick/Controls/Basic/Calendar.qml")  TYPE/URL-SINGLETON
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/Dialog.qml "Calendar"  =>  "Calendar"   QUrl("qrc:/qt-project.org/imports/QtQuick/Controls/Basic/Calendar.qml")  TYPE/URL-SINGLETON
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/Dialog.qml "T.Overlay"  =>  "QQuickOverlay"  TYPE
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/Dialog.qml "Material"  =>  "QQuickMaterialStyle"  TYPE
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/Dialog.qml "Behavior"  =>  "QQuickBehavior"  TYPE
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/Dialog.qml "Transition"  =>  "QQuickTransition"  TYPE
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/Dialog.qml "Label"  =>  ""   QUrl("qrc:/qt-project.org/imports/QtQuick/Controls/Material/Label.qml")  TYPE/URL
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/Dialog.qml "PaddedRectangle"  =>  "QQuickPaddedRectangle"  TYPE
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/Dialog.qml "T.Dialog"  =>  "QQuickDialog"  TYPE
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/Dialog.qml "RoundedElevationEffect"  =>  ""   QUrl("qrc:/qt-project.org/imports/QtQuick/Controls/Material/impl/RoundedElevationEffect.qml")  TYPE/URL
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/Dialog.qml "NumberAnimation"  =>  "QQuickNumberAnimation"  TYPE
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/Dialog.qml "DialogButtonBox"  =>  ""   QUrl("qrc:/qt-project.org/imports/QtQuick/Controls/Material/DialogButtonBox.qml")  TYPE/URL
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/DialogButtonBox.qml "QtQuick" version "(latest)" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/DialogButtonBox.qml loaded ":/qt-project.org/imports/QtQuick/qmldir"
qt.qml.import: loading dependent import "QtQml" version 6.10 as ""
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/DialogButtonBox.qml "QtQml" version "6.10" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/DialogButtonBox.qml loaded ":/qt-project.org/imports/QtQml/qmldir"
qt.qml.import: loading dependent import "QML" version 1.0 as ""
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/DialogButtonBox.qml "QML" version "1.0" as ""
qt.qml.import: loading dependent import "QtQml.Models" version 6.10 as ""
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/DialogButtonBox.qml "QtQml.Models" version "6.10" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/DialogButtonBox.qml loaded ":/qt-project.org/imports/QtQml/Models/qmldir"
qt.qml.import: loading dependent import "QtQml.WorkerScript" version 6.10 as ""
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/DialogButtonBox.qml "QtQml.WorkerScript" version "6.10" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/DialogButtonBox.qml loaded ":/qt-project.org/imports/QtQml/WorkerScript/qmldir"
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/DialogButtonBox.qml "QtQuick.Templates" version "(latest)" as "T"
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/DialogButtonBox.qml loaded ":/qt-project.org/imports/QtQuick/Templates/qmldir"
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/DialogButtonBox.qml "QtQuick.Controls.impl" version "(latest)" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/DialogButtonBox.qml loaded "C:/Users/User/Project_Memory_MCP/Project-Memory-MCP/target/release/qml/QtQuick/Controls/impl/qmldir"
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/DialogButtonBox.qml "QtQuick.Controls.Material" version "(latest)" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/DialogButtonBox.qml loaded ":/qt-project.org/imports/QtQuick/Controls/Material/qmldir"
qt.qml.import: loading dependent import "QtQuick.Controls.Basic" version 6.10 as ""
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/DialogButtonBox.qml "QtQuick.Controls.Basic" version "6.10" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/DialogButtonBox.qml loaded "C:/Users/User/Project_Memory_MCP/Project-Memory-MCP/target/release/qml/QtQuick/Controls/Basic/qmldir"
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/DialogButtonBox.qml "QtQuick.Controls.Material.impl" version "(latest)" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/DialogButtonBox.qml loaded "C:/Users/User/Project_Memory_MCP/Project-Memory-MCP/target/release/qml/QtQuick/Controls/Material/impl/qmldir"
qt.qml.import: addImplicitImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/DialogButtonBox.qml
qt.qml.import: addFileImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/DialogButtonBox.qml "." version "(latest)" as ""
qt.qml.import: loading dependent import "QtQuick.Controls.Basic" version invalid as ""
qt.qml.import: addLibraryImport: qrc:/qt-project.org/imports/QtQuick/Controls/Material/DialogButtonBox.qml "QtQuick.Controls.Basic" version "(latest)" as ""
qt.qml.import: importExtension: qrc:/qt-project.org/imports/QtQuick/Controls/Material/DialogButtonBox.qml loaded ":/qt-project.org/imports/QtQuick/Controls/Basic/qmldir"
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/DialogButtonBox.qml "Calendar"  =>  "Calendar"   QUrl("qrc:/qt-project.org/imports/QtQuick/Controls/Basic/Calendar.qml")  TYPE/URL-SINGLETON
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/DialogButtonBox.qml "Calendar"  =>  "Calendar"   QUrl("qrc:/qt-project.org/imports/QtQuick/Controls/Basic/Calendar.qml")  TYPE/URL-SINGLETON
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/DialogButtonBox.qml "ListView"  =>  "QQuickListView"  TYPE
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/DialogButtonBox.qml "PaddedRectangle"  =>  "QQuickPaddedRectangle"  TYPE
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/DialogButtonBox.qml "Material"  =>  "QQuickMaterialStyle"  TYPE
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/DialogButtonBox.qml "T.DialogButtonBox"  =>  "QQuickDialogButtonBox"  TYPE
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/DialogButtonBox.qml "Button"  =>  ""   QUrl("qrc:/qt-project.org/imports/QtQuick/Controls/Material/Button.qml")  TYPE/URL
qt.qml.import: resolveType: qrc:/qt-project.org/imports/QtQuick/Controls/Material/Dialog.qml "Rectangle"  =>  "QQuickRectangle"  TYPE
qt.qml.import: resolveType: qrc:/qt/qml/com/projectmemory/supervisor/qml/PairingDialog.qml "Rectangle"  =>  "QQuickRectangle"  TYPE
qt.qml.import: resolveType: qrc:/qt/qml/com/projectmemory/supervisor/qml/PairingDialog.qml "Label"  =>  ""   QUrl("qrc:/qt-project.org/imports/QtQuick/Controls/Material/Label.qml")  TYPE/URL
qt.qml.import: resolveType: qrc:/qt/qml/com/projectmemory/supervisor/qml/PairingDialog.qml "ToolTip"  =>  ""   QUrl("qrc:/qt-project.org/imports/QtQuick/Controls/Material/ToolTip.qml")  TYPE/URL
qt.qml.import: resolveType: qrc:/qt/qml/com/projectmemory/supervisor/qml/PairingDialog.qml "Button"  =>  ""   QUrl("qrc:/qt-project.org/imports/QtQuick/Controls/Material/Button.qml")  TYPE/URL
qt.qml.import: resolveType: qrc:/qt/qml/com/projectmemory/supervisor/qml/PairingDialog.qml "ToolTip"  =>  ""   QUrl("qrc:/qt-project.org/imports/QtQuick/Controls/Material/ToolTip.qml")  TYPE/URL
qt.qml.import: resolveType: qrc:/qt/qml/com/projectmemory/supervisor/qml/PairingDialog.qml "ToolTip"  =>  ""   QUrl("qrc:/qt-project.org/imports/QtQuick/Controls/Material/ToolTip.qml")  TYPE/URL
qt.qml.import: resolveType: qrc:/qt/qml/com/projectmemory/supervisor/qml/main.qml "ActivityPanel"  =>  ""   QUrl("qrc:/qt/qml/com/projectmemory/supervisor/qml/ActivityPanel.qml")  TYPE/URL
qt.qml.import: addLibraryImport: qrc:/qt/qml/com/projectmemory/supervisor/qml/ActivityPanel.qml "QtQuick" version "2.15" as ""
qt.qml.import: importExtension: qrc:/qt/qml/com/projectmemory/supervisor/qml/ActivityPanel.qml loaded "C:/Users/User/Project_Memory_MCP/Project-Memory-MCP/target/release/qml/QtQuick/qmldir"
qt.qml.import: loading dependent import "QtQml" version 2.15 as ""
qt.qml.import: addLibraryImport: qrc:/qt/qml/com/projectmemory/supervisor/qml/ActivityPanel.qml "QtQml" version "2.15" as ""
qt.qml.import: importExtension: qrc:/qt/qml/com/projectmemory/supervisor/qml/ActivityPanel.qml loaded ":/qt-project.org/imports/QtQml/qmldir"
qt.qml.import: loading dependent import "QML" version 1.0 as ""
qt.qml.import: addLibraryImport: qrc:/qt/qml/com/projectmemory/supervisor/qml/ActivityPanel.qml "QML" version "1.0" as ""
qt.qml.import: loading dependent import "QtQml.Models" version 2.15 as ""
qt.qml.import: addLibraryImport: qrc:/qt/qml/com/projectmemory/supervisor/qml/ActivityPanel.qml "QtQml.Models" version "2.15" as ""
qt.qml.import: importExtension: qrc:/qt/qml/com/projectmemory/supervisor/qml/ActivityPanel.qml loaded ":/qt-project.org/imports/QtQml/Models/qmldir"
qt.qml.import: loading dependent import "QtQml.WorkerScript" version 2.15 as ""
qt.qml.import: addLibraryImport: qrc:/qt/qml/com/projectmemory/supervisor/qml/ActivityPanel.qml "QtQml.WorkerScript" version "2.15" as ""
qt.qml.import: importExtension: qrc:/qt/qml/com/projectmemory/supervisor/qml/ActivityPanel.qml loaded ":/qt-project.org/imports/QtQml/WorkerScript/qmldir"
qt.qml.import: addLibraryImport: qrc:/qt/qml/com/projectmemory/supervisor/qml/ActivityPanel.qml "QtQuick.Controls" version "2.15" as ""
qt.qml.import: importExtension: qrc:/qt/qml/com/projectmemory/supervisor/qml/ActivityPanel.qml loaded "C:/Users/User/Project_Memory_MCP/Project-Memory-MCP/target/release/qml/QtQuick/Controls/qmldir"
qt.qml.import: loading dependent import "QtQuick.Controls.Windows" version 2.15 as ""
qt.qml.import: addLibraryImport: qrc:/qt/qml/com/projectmemory/supervisor/qml/ActivityPanel.qml "QtQuick.Controls.Windows" version "2.15" as ""
qt.qml.import: importExtension: qrc:/qt/qml/com/projectmemory/supervisor/qml/ActivityPanel.qml loaded "C:/Users/User/Project_Memory_MCP/Project-Memory-MCP/target/release/qml/QtQuick/Controls/Windows/qmldir"
qt.qml.import: loading dependent import "QtQuick.Controls.Basic" version 2.15 as ""
qt.qml.import: addLibraryImport: qrc:/qt/qml/com/projectmemory/supervisor/qml/ActivityPanel.qml "QtQuick.Controls.Basic" version "2.15" as ""
qt.qml.import: importExtension: qrc:/qt/qml/com/projectmemory/supervisor/qml/ActivityPanel.qml loaded "C:/Users/User/Project_Memory_MCP/Project-Memory-MCP/target/release/qml/QtQuick/Controls/Basic/qmldir"
qt.qml.import: loading dependent import "QtQuick.Controls.Fusion" version 2.15 as ""
qt.qml.import: addLibraryImport: qrc:/qt/qml/com/projectmemory/supervisor/qml/ActivityPanel.qml "QtQuick.Controls.Fusion" version "2.15" as ""
qt.qml.import: importExtension: qrc:/qt/qml/com/projectmemory/supervisor/qml/ActivityPanel.qml loaded "C:/Users/User/Project_Memory_MCP/Project-Memory-MCP/target/release/qml/QtQuick/Controls/Fusion/qmldir"
qt.qml.import: loading dependent import "QtQuick.Controls.Basic" version 2.15 as ""
qt.qml.import: addLibraryImport: qrc:/qt/qml/com/projectmemory/supervisor/qml/ActivityPanel.qml "QtQuick.Controls.Basic" version "2.15" as ""
qt.qml.import: importExtension: qrc:/qt/qml/com/projectmemory/supervisor/qml/ActivityPanel.qml loaded "C:/Users/User/Project_Memory_MCP/Project-Memory-MCP/target/release/qml/QtQuick/Controls/Basic/qmldir"
qt.qml.import: addLibraryImport: qrc:/qt/qml/com/projectmemory/supervisor/qml/ActivityPanel.qml "QtQuick.Controls.Material" version "2.15" as ""
qt.qml.import: importExtension: qrc:/qt/qml/com/projectmemory/supervisor/qml/ActivityPanel.qml loaded "C:/Users/User/Project_Memory_MCP/Project-Memory-MCP/target/release/qml/QtQuick/Controls/Material/qmldir"
qt.qml.import: loading dependent import "QtQuick.Controls.Basic" version 2.15 as ""
qt.qml.import: addLibraryImport: qrc:/qt/qml/com/projectmemory/supervisor/qml/ActivityPanel.qml "QtQuick.Controls.Basic" version "2.15" as ""
qt.qml.import: importExtension: qrc:/qt/qml/com/projectmemory/supervisor/qml/ActivityPanel.qml loaded "C:/Users/User/Project_Memory_MCP/Project-Memory-MCP/target/release/qml/QtQuick/Controls/Basic/qmldir"
qt.qml.import: addLibraryImport: qrc:/qt/qml/com/projectmemory/supervisor/qml/ActivityPanel.qml "QtQuick.Layouts" version "1.15" as ""
qt.qml.import: importExtension: qrc:/qt/qml/com/projectmemory/supervisor/qml/ActivityPanel.qml loaded "C:/Users/User/Project_Memory_MCP/Project-Memory-MCP/target/release/qml/QtQuick/Layouts/qmldir"
qt.qml.import: addImplicitImport: qrc:/qt/qml/com/projectmemory/supervisor/qml/ActivityPanel.qml
qt.qml.import: addFileImport: qrc:/qt/qml/com/projectmemory/supervisor/qml/ActivityPanel.qml "." version "(latest)" as ""
qt.qml.import: resolveType: qrc:/qt/qml/com/projectmemory/supervisor/qml/ActivityPanel.qml "ListModel"  =>  "QQmlListModel"  TYPE
qt.qml.import: resolveType: qrc:/qt/qml/com/projectmemory/supervisor/qml/ActivityPanel.qml "ColumnLayout"  =>  "QQuickColumnLayout"  TYPE
qt.qml.import: resolveType: qrc:/qt/qml/com/projectmemory/supervisor/qml/ActivityPanel.qml "Label"  =>  ""   QUrl("qrc:/qt-project.org/imports/QtQuick/Controls/Material/Label.qml")  TYPE/URL
qt.qml.import: resolveType: qrc:/qt/qml/com/projectmemory/supervisor/qml/ActivityPanel.qml "ScrollView"  =>  ""   QUrl("qrc:/qt-project.org/imports/QtQuick/Controls/Material/ScrollView.qml")  TYPE/URL
qt.qml.import: resolveType: qrc:/qt/qml/com/projectmemory/supervisor/qml/ActivityPanel.qml "Material"  =>  "QQuickMaterialStyle"  TYPE
qt.qml.import: resolveType: qrc:/qt/qml/com/projectmemory/supervisor/qml/ActivityPanel.qml "Rectangle"  =>  "QQuickRectangle"  TYPE
qt.qml.import: resolveType: qrc:/qt/qml/com/projectmemory/supervisor/qml/ActivityPanel.qml "Timer"  =>  "QQmlTimer"  TYPE
qt.qml.import: resolveType: qrc:/qt/qml/com/projectmemory/supervisor/qml/ActivityPanel.qml "ListView"  =>  "QQuickListView"  TYPE
qt.qml.import: resolveType: qrc:/qt/qml/com/projectmemory/supervisor/qml/ActivityPanel.qml "Layout"  =>  "QQuickLayout"  TYPE
qt.qml.import: resolveType: qrc:/qt/qml/com/projectmemory/supervisor/qml/main.qml "Canvas"  =>  "QQuickCanvasItem"  TYPE
qt.qml.import: resolveType: qrc:/qt/qml/com/projectmemory/supervisor/qml/main.qml "Repeater"  =>  "QQuickRepeater"  TYPE
qt.qml.import: resolveType: qrc:/qt/qml/com/projectmemory/supervisor/qml/main.qml "Platform.Menu"  =>  "QQuickLabsPlatformMenu"  TYPE
qt.qml.diskcache: "qrc:/qt/qml/com/projectmemory/supervisor/qml/main.qml:774:5: AboutPanel is not a type"
QQmlApplicationEngine failed to load component
qrc:/qt/qml/com/projectmemory/supervisor/qml/main.qml:774:5: AboutPanel is not a type
[supervisor:debug] QML load call returned
[supervisor:debug] entering Qt event loop (app.exec())...
[supervisor:debug] still waiting for QML bridge... (2.0s elapsed)
[supervisor:debug] still waiting for QML bridge... (4.0s elapsed)
[supervisor:debug] still waiting for QML bridge... (6.1s elapsed)
[supervisor:debug] still waiting for QML bridge... (8.1s elapsed)
[supervisor] WARNING: timed out waiting for QML bridge — continuing anyway
[supervisor:debug] creating Tokio runtime...
[supervisor:debug] entering supervisor_main()...
[job] SetInformationJobObject failed — orphans may survive supervisor exit
[supervisor:debug] logging initialised at DEBUG level
[debug] loading config from: C:\Users\User\AppData\Roaming\ProjectMemory\supervisor.toml
Supervisor starting...
[debug] resolved config: SupervisorConfig {
    supervisor: SupervisorSection {
        log_level: "info",
        data_dir: "C:\\Users\\User\\AppData\\Roaming\\ProjectMemory",
        bind_address: "127.0.0.1:3456",
        control_transport: NamedPipe,
        control_pipe: "\\\\.\\pipe\\project-memory-supervisor",
        control_tcp_port: 45470,
    },
    discovery: DiscoverySection {
        methods: [
            "local",
        ],
        advertise: true,
    },
    reconnect: ReconnectSection {
        initial_delay_ms: 500,
        max_delay_ms: 30000,
        multiplier: 2.0,
        max_attempts: 0,
        jitter_ratio: 0.2,
        cooldown_after_attempts: 0,
        cooldown_child_local_ms: 0,
        cooldown_dependency_group_ms: 0,
        cooldown_global_ms: 0,
    },
    mcp: McpSection {
        enabled: true,
        port: 3457,
        socket_path: None,
        health_timeout_ms: 1500,
        backend: Node,
        node: NodeRunnerConfig {
            command: "node",
            args: [
                "dist/index.js",
                "--transport",
                "streamable-http",
                "--port",
                "3457",
            ],
            working_dir: Some(
                "C:\\Users\\User\\Project_Memory_MCP\\Project-Memory-MCP\\server",
            ),
            env: {
                "MBS_AGENTS_ROOT": "C:\\Users\\User\\Project_Memory_MCP\\Project-Memory-MCP\\agents",
                "MBS_DATA_ROOT": "C:\\Users\\User\\Project_Memory_MCP\\Project-Memory-MCP\\data",
            },
        },
        container: ContainerRunnerConfig {
            engine: "podman",
            image: "project-memory-mcp:latest",
            container_name: "project-memory-mcp",
            ports: [
                "3000:3000",
            ],
            labels: {
                "project-memory.mcp": "true",
            },
        },
        restart_policy: AlwaysRestart,
        pool: PoolConfig {
            min_instances: 1,
            max_instances: 4,
            max_connections_per_instance: 5,
            base_port: 3460,
        },
    },
    interactive_terminal: InteractiveTerminalSection {
        enabled: false,
        executable_path: None,
        port: 3458,
        command: "C:\\Users\\User\\Project_Memory_MCP\\Project-Memory-MCP\\interactive-terminal\\target\\release\\interactive-terminal.exe",
        args: [],
        working_dir: None,
        env: {},
        restart_policy: AlwaysRestart,
    },
    dashboard: DashboardSection {
        enabled: true,
        port: 3459,
        static_dir: None,
        command: "node",
        args: [
            "dist/index.js",
        ],
        working_dir: Some(
            "C:\\Users\\User\\Project_Memory_MCP\\Project-Memory-MCP\\dashboard\\server",
        ),
        env: {
            "PORT": "3459",
        },
        requires_mcp: true,
        restart_policy: AlwaysRestart,
    },
    fallback_api: FallbackApiSection {
        enabled: true,
        port: 3465,
        command: "node",
        args: [
            "dist/fallback-rest-main.js",
        ],
        working_dir: None,
        env: {},
        restart_policy: AlwaysRestart,
    },
    cli_mcp: CliMcpSection {
        enabled: true,
        port: 3466,
        command: "node",
        args: [
            "dist/index-cli.js",
        ],
        working_dir: Some(
            "C:\\Users\\User\\Project_Memory_MCP\\Project-Memory-MCP\\server",
        ),
        env: {},
        restart_policy: AlwaysRestart,
    },
    approval: ApprovalSection {
        default_countdown_seconds: 60,
        default_on_timeout: "approve",
        always_on_top: true,
    },
    brainstorm_gui: BrainstormGuiSection(
        FormAppConfig {
            enabled: true,
            command: "C:\\Users\\User\\Project_Memory_MCP\\Project-Memory-MCP\\target\\release\\pm-brainstorm-gui.exe",
            args: [],
            working_dir: None,
            env: {},
            launch_mode: OnDemand,
            timeout_seconds: 300,
            window_width: 720,
            window_height: 640,
            always_on_top: false,
        },
    ),
    approval_gui: ApprovalGuiSection(
        FormAppConfig {
            enabled: true,
            command: "C:\\Users\\User\\Project_Memory_MCP\\Project-Memory-MCP\\target\\release\\pm-approval-gui.exe",
            args: [],
            working_dir: None,
            env: {},
            launch_mode: OnDemand,
            timeout_seconds: 60,
            window_width: 480,
            window_height: 320,
            always_on_top: true,
        },
    ),
    events: EventsSection {
        enabled: true,
        buffer_size: 256,
        heartbeat_interval: 30,
        replay_buffer_size: 100,
    },
    gui_server: GuiServerSection {
        enabled: true,
        port: 3464,
        bind_address: "0.0.0.0",
    },
    runtime_output: RuntimeOutputSection {
        enabled: true,
    },
    chatbot: ChatbotSection {
        enabled: true,
        provider: Gemini,
        api_key: "",
        model: "",
    },
    auth: AuthSection {
        api_key: Some(
            "65598539d7610eb35544d6be7639c18b316651796b2bbebbcb0f81067902c3ad",
        ),
    },
    mdns: MdnsSection {
        enabled: true,
        instance_name: "ProjectMemory",
    },
    servers: [],
}
[debug] control transport: NamedPipe, pipe: \\.\pipe\project-memory-supervisor, tcp_port: 45470
[debug] mcp: backend=Node, port=3457, enabled=true
[debug] terminal: port=3458, enabled=false
[debug] dashboard: port=3459, enabled=true
[debug] fallback_api: port=3465, enabled=true
[debug] cli_mcp: port=3466, enabled=true
[debug] runtime_output: enabled=true
[supervisor] runtime output capture: enabled
[supervisor] MCP subprocess runtime control available (disabled by policy; use SetMcpRuntimePolicy to enable in-process)
[supervisor] clearing orphan processes on ports: [3457, 3459, 3458, 3465, 3466, 3460, 3461, 3462, 3463]
[supervisor] killed orphan PID 39484 (port 3459)
[supervisor] killed orphan PID 31488 (port 3465)
[supervisor] killed orphan PID 35932 (port 3466)
[supervisor] killed orphan PID 31300 (port 3460)
[debug] installing tray lifecycle...
[supervisor] approval_gui summonability: enabled (resolved_command="\\?\C:\Users\User\Project_Memory_MCP\Project-Memory-MCP\target\release\pm-approval-gui.exe")
Supervisor control API started.
[supervisor] MCP subprocess runtime control available (use McpRuntimeExec / SetMcpRuntimePolicy).
[supervisor] mDNS broadcast error: [supervisor] starting MCP pool + proxy (Node backend)...
Hostname must end with '.local.': DESKTOP-JH0D9AD.
[supervisor] GUI HTTP server listening on http://0.0.0.0:3464
←[2m2026-03-21T01:31:18.813108Z←[0m ←[34mDEBUG←[0m ←[2mreqwest::connect←[0m←[2m:←[0m starting new connection: http://127.0.0.1:3460/
←[2m2026-03-21T01:31:18.813680Z←[0m ←[34mDEBUG←[0m ←[2mhyper_util::client::legacy::connect::http←[0m←[2m:←[0m connecting to 127.0.0.1:3460
←[2m2026-03-21T01:31:19.432638Z←[0m ←[34mDEBUG←[0m ←[2mreqwest::connect←[0m←[2m:←[0m starting new connection: http://127.0.0.1:3460/
←[2m2026-03-21T01:31:19.433488Z←[0m ←[34mDEBUG←[0m ←[2mhyper_util::client::legacy::connect::http←[0m←[2m:←[0m connecting to 127.0.0.1:3460
←[2m2026-03-21T01:31:19.436127Z←[0m ←[34mDEBUG←[0m ←[2mhyper_util::client::legacy::connect::http←[0m←[2m:←[0m connected to 127.0.0.1:3460
←[2m2026-03-21T01:31:19.442663Z←[0m ←[34mDEBUG←[0m ←[2mhyper_util::client::legacy::pool←[0m←[2m:←[0m pooling idle connection for ("http", 127.0.0.1:3460)
[pool] MCP instance started on port 3460
[supervisor] MCP pool initialised (1 instance(s) on port(s) 3460+)
[supervisor] interactive terminal disabled — skipping.
[proxy] MCP proxy listening on ←[2m2026-03-21T01:31:19.443853Z←[0m ←[34mDEBUG←[0m ←[2mreqwest::connect←[0m←[2m:←[0m starting new connection: http://127.0.0.1:3459/
127.0.0.1:3457[supervisor] starting dashboard...
 → dispatch base_port=←[2m2026-03-21T01:31:19.444492Z←[0m ←[34mDEBUG←[0m ←[2mhyper_util::client::legacy::connect::http←[0m←[2m:←[0m connecting to 127.0.0.1:3459
3460
[debug] calling dashboard_runner.start() (port=3459)...
←[2m2026-03-21T01:31:19.448738Z←[0m ←[34mDEBUG←[0m ←[2mreqwest::connect←[0m←[2m:←[0m starting new connection: http://127.0.0.1:3460/
[supervisor] dashboard started.
[debug] dashboard_runner.start() returned Ok
←[2m2026-03-21T01:31:19.451334Z←[0m ←[34mDEBUG←[0m ←[2mhyper_util::client::legacy::connect::http←[0m←[2m:←[0m connecting to 127.0.0.1:3460
[supervisor] starting fallback API...
←[2m2026-03-21T01:31:19.453223Z←[0m ←[34mDEBUG←[0m ←[2mhyper_util::client::legacy::connect::http←[0m←[2m:←[0m connected to 127.0.0.1:3460
←[2m2026-03-21T01:31:19.455043Z←[0m ←[34mDEBUG←[0m ←[2mhyper_util::client::legacy::pool←[0m←[2m:←[0m pooling idle connection for ("http", 127.0.0.1:3460)
←[2m2026-03-21T01:31:19.455258Z←[0m ←[34mDEBUG←[0m ←[2mreqwest::connect←[0m←[2m:←[0m starting new connection: http://127.0.0.1:3460/
←[2m2026-03-21T01:31:19.455592Z←[0m ←[34mDEBUG←[0m ←[2mhyper_util::client::legacy::connect::http←[0m←[2m:←[0m connecting to 127.0.0.1:3460
←[2m2026-03-21T01:31:19.456273Z←[0m ←[34mDEBUG←[0m ←[2mhyper_util::client::legacy::connect::http←[0m←[2m:←[0m connected to 127.0.0.1:3460
←[2m2026-03-21T01:31:19.457600Z←[0m ←[34mDEBUG←[0m ←[2mreqwest::connect←[0m←[2m:←[0m starting new connection: http://127.0.0.1:3465/
←[2m2026-03-21T01:31:19.457698Z←[0m ←[34mDEBUG←[0m ←[2mhyper_util::client::legacy::pool←[0m←[2m:←[0m pooling idle connection for ("http", 127.0.0.1:3460)
←[2m2026-03-21T01:31:19.457825Z←[0m ←[34mDEBUG←[0m ←[2mhyper_util::client::legacy::connect::http←[0m←[2m:←[0m connecting to 127.0.0.1:3465
←[2m2026-03-21T01:31:19.949758Z←[0m ←[34mDEBUG←[0m ←[2mhyper_util::client::legacy::connect::http←[0m←[2m:←[0m connected to 127.0.0.1:3459
[events/ingestion] connected to http://127.0.0.1:3459/api/events/stream
←[2m2026-03-21T01:31:20.072353Z←[0m ←[34mDEBUG←[0m ←[2mreqwest::connect←[0m←[2m:←[0m starting new connection: http://127.0.0.1:3465/
←[2m2026-03-21T01:31:20.072595Z←[0m ←[34mDEBUG←[0m ←[2mhyper_util::client::legacy::connect::http←[0m←[2m:←[0m connecting to 127.0.0.1:3465
←[2m2026-03-21T01:31:20.075872Z←[0m ←[34mDEBUG←[0m ←[2mhyper_util::client::legacy::connect::http←[0m←[2m:←[0m connected to 127.0.0.1:3465
←[2m2026-03-21T01:31:20.082733Z←[0m ←[34mDEBUG←[0m ←[2mhyper_util::client::legacy::pool←[0m←[2m:←[0m pooling idle connection for ("http", 127.0.0.1:3465)
[supervisor] fallback API started.
[supervisor] starting CLI MCP...
←[2m2026-03-21T01:31:20.088527Z←[0m ←[34mDEBUG←[0m ←[2mreqwest::connect←[0m←[2m:←[0m starting new connection: http://127.0.0.1:3466/
←[2m2026-03-21T01:31:20.090710Z←[0m ←[34mDEBUG←[0m ←[2mhyper_util::client::legacy::connect::http←[0m←[2m:←[0m connecting to 127.0.0.1:3466
←[2m2026-03-21T01:31:20.711014Z←[0m ←[34mDEBUG←[0m ←[2mreqwest::connect←[0m←[2m:←[0m starting new connection: http://127.0.0.1:3466/
←[2m2026-03-21T01:31:20.711306Z←[0m ←[34mDEBUG←[0m ←[2mhyper_util::client::legacy::connect::http←[0m←[2m:←[0m connecting to 127.0.0.1:3466
←[2m2026-03-21T01:31:20.713768Z←[0m ←[34mDEBUG←[0m ←[2mhyper_util::client::legacy::connect::http←[0m←[2m:←[0m connected to 127.0.0.1:3466
←[2m2026-03-21T01:31:20.721952Z←[0m ←[34mDEBUG←[0m ←[2mhyper_util::client::legacy::pool←[0m←[2m:←[0m pooling idle connection for ("http", 127.0.0.1:3466)
[supervisor] CLI MCP started.
[supervisor] all services started. Press Ctrl-C to stop.
[supervisor] ports manifest written: C:\Users\User\AppData\Roaming\ProjectMemory\ports.json
←[2m2026-03-21T01:31:22.459725Z←[0m ←[34mDEBUG←[0m ←[2mreqwest::connect←[0m←[2m:←[0m starting new connection: http://127.0.0.1:3460/
←[2m2026-03-21T01:31:22.459945Z←[0m ←[34mDEBUG←[0m ←[2mhyper_util::client::legacy::connect::http←[0m←[2m:←[0m connecting to 127.0.0.1:3460
←[2m2026-03-21T01:31:22.462014Z←[0m ←[34mDEBUG←[0m ←[2mhyper_util::client::legacy::connect::http←[0m←[2m:←[0m connected to 127.0.0.1:3460
←[2m2026-03-21T01:31:22.463709Z←[0m ←[34mDEBUG←[0m ←[2mhyper_util::client::legacy::pool←[0m←[2m:←[0m pooling idle connection for ("http", 127.0.0.1:3460)
[migrations] Could not verify migration status (non-fatal): failed to deserialise response from http://127.0.0.1:3460/admin/migrations
←[2m2026-03-21T01:31:24.456018Z←[0m ←[34mDEBUG←[0m ←[2mreqwest::connect←[0m←[2m:←[0m starting new connection: http://127.0.0.1:3460/
←[2m2026-03-21T01:31:24.457063Z←[0m ←[34mDEBUG←[0m ←[2mhyper_util::client::legacy::connect::http←[0m←[2m:←[0m connecting to 127.0.0.1:3460
←[2m2026-03-21T01:31:24.457686Z←[0m ←[34mDEBUG←[0m ←[2mhyper_util::client::legacy::connect::http←[0m←[2m:←[0m connected to 127.0.0.1:3460
←[2m2026-03-21T01:31:24.459309Z←[0m ←[34mDEBUG←[0m ←[2mhyper_util::client::legacy::pool←[0m←[2m:←[0m pooling idle connection for ("http", 127.0.0.1:3460)
←[2m2026-03-21T01:31:24.459509Z←[0m ←[34mDEBUG←[0m ←[2mreqwest::connect←[0m←[2m:←[0m starting new connection: http://127.0.0.1:3460/
←[2m2026-03-21T01:31:24.459871Z←[0m ←[34mDEBUG←[0m ←[2mhyper_util::client::legacy::connect::http←[0m←[2m:←[0m connecting to 127.0.0.1:3460
←[2m2026-03-21T01:31:24.460588Z←[0m ←[34mDEBUG←[0m ←[2mhyper_util::client::legacy::connect::http←[0m←[2m:←[0m connected to 127.0.0.1:3460
←[2m2026-03-21T01:31:24.461378Z←[0m ←[34mDEBUG←[0m ←[2mhyper_util::client::legacy::pool←[0m←[2m:←[0m pooling idle connection for ("http", 127.0.0.1:3460)
←[2m2026-03-21T01:31:29.448794Z←[0m ←[34mDEBUG←[0m ←[2mreqwest::connect←[0m←[2m:←[0m starting new connection: http://127.0.0.1:3460/
←[2m2026-03-21T01:31:29.449018Z←[0m ←[34mDEBUG←[0m ←[2mhyper_util::client::legacy::connect::http←[0m←[2m:←[0m connecting to 127.0.0.1:3460
←[2m2026-03-21T01:31:29.451533Z←[0m ←[34mDEBUG←[0m ←[2mhyper_util::client::legacy::connect::http←[0m←[2m:←[0m connected to 127.0.0.1:3460
←[2m2026-03-21T01:31:29.453141Z←[0m ←[34mDEBUG←[0m ←[2mhyper_util::client::legacy::pool←[0m←[2m:←[0m pooling idle connection for ("http", 127.0.0.1:3460)
←[2m2026-03-21T01:31:29.453334Z←[0m ←[34mDEBUG←[0m ←[2mreqwest::connect←[0m←[2m:←[0m starting new connection: http://127.0.0.1:3460/
←[2m2026-03-21T01:31:29.453702Z←[0m ←[34mDEBUG←[0m ←[2mhyper_util::client::legacy::connect::http←[0m←[2m:←[0m connecting to 127.0.0.1:3460
←[2m2026-03-21T01:31:29.454221Z←[0m ←[34mDEBUG←[0m ←[2mhyper_util::client::legacy::connect::http←[0m←[2m:←[0m connected to 127.0.0.1:3460
←[2m2026-03-21T01:31:29.454990Z←[0m ←[34mDEBUG←[0m ←[2mhyper_util::client::legacy::pool←[0m←[2m:←[0m pooling idle connection for ("http", 127.0.0.1:3460)
←[2m2026-03-21T01:31:34.447010Z←[0m ←[34mDEBUG←[0m ←[2mreqwest::connect←[0m←[2m:←[0m starting new connection: http://127.0.0.1:3460/
←[2m2026-03-21T01:31:34.448080Z←[0m ←[34mDEBUG←[0m ←[2mhyper_util::client::legacy::connect::http←[0m←[2m:←[0m connecting to 127.0.0.1:3460
←[2m2026-03-21T01:31:34.448413Z←[0m ←[34mDEBUG←[0m ←[2mhyper_util::client::legacy::connect::http←[0m←[2m:←[0m connected to 127.0.0.1:3460
←[2m2026-03-21T01:31:34.449870Z←[0m ←[34mDEBUG←[0m ←[2mhyper_util::client::legacy::pool←[0m←[2m:←[0m pooling idle connection for ("http", 127.0.0.1:3460)
←[2m2026-03-21T01:31:34.450063Z←[0m ←[34mDEBUG←[0m ←[2mreqwest::connect←[0m←[2m:←[0m starting new connection: http://127.0.0.1:3460/
←[2m2026-03-21T01:31:34.450163Z←[0m ←[34mDEBUG←[0m ←[2mhyper_util::client::legacy::connect::http←[0m←[2m:←[0m connecting to 127.0.0.1:3460
←[2m2026-03-21T01:31:34.450357Z←[0m ←[34mDEBUG←[0m ←[2mhyper_util::client::legacy::connect::http←[0m←[2m:←[0m connected to 127.0.0.1:3460
←[2m2026-03-21T01:31:34.451182Z←[0m ←[34mDEBUG←[0m ←[2mhyper_util::client::legacy::pool←[0m←[2m:←[0m pooling idle connection for ("http", 127.0.0.1:3460)
[supervisor] control request: AttachClient { pid: 26728, window_id: "c:\\Users\\User\\Project_Memory_MCP|bc053c90f34be1a8dd1ba261a94dbb0e22955506ba78d53dd864f12644d589ae|pid:26728|bf1ef0a3-f3ab-42d5-9645-4191411e7dec" }
←[2m2026-03-21T01:31:39.452643Z←[0m ←[34mDEBUG←[0m ←[2mreqwest::connect←[0m←[2m:←[0m starting new connection: http://127.0.0.1:3460/
←[2m2026-03-21T01:31:39.452898Z←[0m ←[34mDEBUG←[0m ←[2mhyper_util::client::legacy::connect::http←[0m←[2m:←[0m connecting to 127.0.0.1:3460
←[2m2026-03-21T01:31:39.455187Z←[0m ←[34mDEBUG←[0m ←[2mhyper_util::client::legacy::connect::http←[0m←[2m:←[0m connected to 127.0.0.1:3460
←[2m2026-03-21T01:31:39.456181Z←[0m ←[34mDEBUG←[0m ←[2mhyper_util::client::legacy::pool←[0m←[2m:←[0m pooling idle connection for ("http", 127.0.0.1:3460)
←[2m2026-03-21T01:31:39.456377Z←[0m ←[34mDEBUG←[0m ←[2mreqwest::connect←[0m←[2m:←[0m starting new connection: http://127.0.0.1:3460/
←[2m2026-03-21T01:31:39.456701Z←[0m ←[34mDEBUG←[0m ←[2mhyper_util::client::legacy::connect::http←[0m←[2m:←[0m connecting to 127.0.0.1:3460
←[2m2026-03-21T01:31:39.457192Z←[0m ←[34mDEBUG←[0m ←[2mhyper_util::client::legacy::connect::http←[0m←[2m:←[0m connected to 127.0.0.1:3460
←[2m2026-03-21T01:31:39.458001Z←[0m ←[34mDEBUG←[0m ←[2mhyper_util::client::legacy::pool←[0m←[2m:←[0m pooling idle connection for ("http", 127.0.0.1:3460)
[supervisor] ctrl-c received.
[supervisor] shutting down...
[events/ingestion] stream error: reading SSE chunk: error decoding response body: error reading a body from connection: An existing connection was forcibly closed by the remote host. (os error 10054) — reconnecting in 1s
[supervisor] dashboard stopped.
[supervisor] fallback API stopped.
[supervisor] CLI MCP stopped.
[supervisor] MCP server stopped.
Supervisor stopped.
PS C:\Users\User\Project_Memory_MCP\Project-Memory-MCP\target\release>