---
category: gui
tags: [rust, cxxqt, qml, tray-icon, windows, cxx-qt, qt6, system-tray, desktop-app]
language_targets: [rust]
framework_targets: [cxx-qt, qt6, qml]
description: >
  Build a Windows (cross-platform-capable) desktop application in Rust with a native system
  tray icon, right-click context menu, and a QML window that can be shown/hidden from the
  tray — all without the Qt widgets stack.  Covers the CxxQt bridge pattern, the Qt/Tokio
  thread-split, live property updates from an async runtime to the Qt main thread, console
  window management, and the correct deploy steps for Qt6LabsPlatform.
---

# SKILL: Rust + QML Tray Icon Application

## When to use this skill

Use when you need to:

- Add a system tray icon to a Rust binary.
- Show a QML window that the user can open/close from the tray.
- Push property updates from an async Tokio thread to QML widgets in real time.
- Hide the console window on normal launch but keep it for a `--debug` mode.
- Deploy a CxxQt + Qt.labs.platform app on Windows.

---

## 1. Cargo setup

```toml
# Cargo.toml
[features]
default = ["qml_gui"]
qml_gui = ["dep:cxx", "dep:cxx-qt", "dep:cxx-qt-lib"]

[dependencies]
cxx         = { version = "1.0.95", optional = true }
cxx-qt      = { version = "0.8",    optional = true }
cxx-qt-lib  = { version = "0.8", features = ["qt_full"], optional = true }

[build-dependencies]
cxx-qt-build = { version = "0.8", features = ["link_qt_object_files"] }

# Windows-only for console-hide and tray APIs (if needed)
[target.'cfg(windows)'.dependencies]
windows-sys = { version = "0.59", features = [
    "Win32_Foundation",
    "Win32_UI_WindowsAndMessaging",
    "Win32_System_Console",
] }
```

**Note:** Do NOT set `windows_subsystem = "windows"`.  Keep the console subsystem so
stdout/stderr always work.  Suppress the window programmatically instead (see §6).

---

## 2. build.rs — embed QML into QRC

```rust
// build.rs
#[cfg(feature = "qml_gui")]
use cxx_qt_build::{CxxQtBuilder, QmlModule};

fn main() {
    #[cfg(not(feature = "qml_gui"))]
    { return; }

    #[cfg(feature = "qml_gui")]
    {
        CxxQtBuilder::new_qml_module(
            // URI must match the `import` statement in QML.
            QmlModule::new("com.example.myapp")
                .qml_files(["qml/main.qml"]),
        )
        // All Rust files that contain #[cxx_qt::bridge] blocks.
        .file("src/bridge/mod.rs")
        .build();
    }
}
```

This embeds `qml/main.qml` in a QRC bundle accessible at
`qrc:/qt/qml/com/example/myapp/qml/main.qml`.

---

## 3. The CxxQt bridge — declaring a QObject

Create a module that declares the Rust struct, its Qt properties, and its invokable methods.  
The bridge lives in `src/bridge/mod.rs`.

```rust
// src/bridge/mod.rs
pub mod initialize;
pub use initialize::APP_QT;

use cxx_qt_lib::QString;
use std::pin::Pin;

#[cxx_qt::bridge]
pub mod ffi {
    unsafe extern "C++" {
        include!("cxx-qt-lib/qstring.h");
        type QString = cxx_qt_lib::QString;
    }

    unsafe extern "RustQt" {
        #[qobject]
        #[qml_element]
        // Properties — automatically become Q_PROPERTY with NOTIFY signals.
        #[qproperty(bool,    window_visible, cxx_name = "windowVisible")]
        #[qproperty(QString, status_text,    cxx_name = "statusText")]
        #[qproperty(QString, tray_icon_url,  cxx_name = "trayIconUrl")]
        type AppBridge = super::AppBridgeRust;

        // Methods callable from QML via id.showWindow() etc.
        #[qinvokable]
        #[cxx_name = "showWindow"]
        fn show_window(self: Pin<&mut AppBridge>);

        #[qinvokable]
        #[cxx_name = "hideWindow"]
        fn hide_window(self: Pin<&mut AppBridge>);
    }

    // Threading enables qt_thread() → CxxQtThread handle for cross-thread updates.
    impl cxx_qt::Initialize for AppBridge {}
    impl cxx_qt::Threading for AppBridge {}
}

// The plain Rust backing struct — all fields become Qt properties.
pub struct AppBridgeRust {
    pub window_visible: bool,
    pub status_text:    QString,
    pub tray_icon_url:  QString,
}

impl Default for AppBridgeRust {
    fn default() -> Self {
        Self {
            window_visible: false,
            status_text:    QString::from("Starting…"),
            tray_icon_url:  QString::default(),
        }
    }
}

// Invokable implementations.
impl ffi::AppBridge {
    pub fn show_window(mut self: Pin<&mut Self>) {
        self.as_mut().set_window_visible(true);
    }
    pub fn hide_window(mut self: Pin<&mut Self>) {
        self.as_mut().set_window_visible(false);
    }
}
```

---

## 4. Initialize impl — OnceLock handshake

The `Initialize` trait is called by the CxxQt runtime when the QObject is first constructed
(on the Qt main thread).  Use it to store the cross-thread handle.

```rust
// src/bridge/initialize.rs
use crate::bridge::ffi;
use cxx_qt::Threading;
use cxx_qt_lib::QString;
use std::pin::Pin;
use std::sync::OnceLock;

/// Cross-thread handle deposited by the Qt main thread during Initialize.
/// The background async thread spin-waits on this and then calls .queue().
pub static APP_QT: OnceLock<cxx_qt::CxxQtThread<ffi::AppBridge>> = OnceLock::new();

fn resolve_icon_url() -> QString {
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()));

    let Some(dir) = exe_dir else { return QString::default(); };

    for name in &["app_green.ico", "app.ico"] {
        let path = dir.join(name);
        if path.exists() {
            // Qt requires forward slashes and file:/// prefix.
            let s = path.to_string_lossy().replace('\\', "/");
            return QString::from(&format!("file:///{s}"));
        }
    }
    QString::default()
}

impl cxx_qt::Initialize for ffi::AppBridge {
    fn initialize(mut self: Pin<&mut Self>) {
        // Deposit handle FIRST — background thread may already be waiting.
        let _ = APP_QT.set(self.qt_thread());

        self.as_mut().set_status_text(QString::from("Starting…"));
        self.as_mut().set_window_visible(false);
        self.as_mut().set_tray_icon_url(resolve_icon_url());
    }
}
```

---

## 5. main.rs — Qt main thread + async background thread

**Critical rule:** Qt owns the main thread. Everything else goes on a spawned thread.

```rust
// src/main.rs
#[cfg(feature = "qml_gui")]
fn main() {
    let debug_mode = std::env::args().any(|a| a == "--debug");

    // §6: hide console window when not debugging
    #[cfg(windows)]
    hide_console_unless_debug(debug_mode);

    // Qt environment (Windows-specific tuning)
    #[cfg(windows)]
    std::env::set_var("QT_QPA_PLATFORM", "windows:darkmode=2");
    std::env::set_var("QT_QUICK_CONTROLS_STYLE", "Material");

    // Background thread: wait for bridge, then run async work.
    std::thread::spawn(move || {
        // Spin-wait for Initialize::initialize() to deposit the handle.
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(10);
        loop {
            if crate::bridge::APP_QT.get().is_some() { break; }
            if std::time::Instant::now() > deadline {
                eprintln!("[app] WARNING: timed out waiting for QML bridge");
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(50));
        }

        let rt = tokio::runtime::Runtime::new().expect("tokio");
        rt.block_on(async_main());
    });

    // Qt owns the main thread from here.
    use cxx_qt_lib::{QGuiApplication, QQmlApplicationEngine, QUrl};
    let mut app    = QGuiApplication::new();
    let mut engine = QQmlApplicationEngine::new();
    if let Some(e) = engine.as_mut() {
        e.load(&QUrl::from(
            "qrc:/qt/qml/com/example/myapp/qml/main.qml",
        ));
    }
    if let Some(a) = app.as_mut() { a.exec(); }
}

#[cfg(not(feature = "qml_gui"))]
fn main() {
    // Headless fallback.
    tokio::runtime::Runtime::new().unwrap().block_on(async_main());
}
```

---

## 6. Console window management (Windows)

Keep the binary as a console-subsystem exe (default).  Suppress the window with Win32:

```rust
#[cfg(windows)]
fn hide_console_unless_debug(debug_mode: bool) {
    if debug_mode { return; }
    // SAFETY: pure Win32 calls, no UB.
    extern "system" {
        fn GetConsoleWindow() -> *mut std::ffi::c_void;
        fn ShowWindow(hwnd: *mut std::ffi::c_void, n_cmd_show: i32) -> i32;
    }
    unsafe {
        let hwnd = GetConsoleWindow();
        if !hwnd.is_null() {
            ShowWindow(hwnd, 0 /* SW_HIDE */);
        }
    }
}
```

**Why not `windows_subsystem = "windows"` + `AllocConsole()`?**  
`AllocConsole()` opens a *new detached* console window — it does not attach back to the
terminal the user launched from.  Keeping the console subsystem and hiding the window is
the correct pattern.

---

## 7. Pushing updates from async thread to Qt

```rust
// In your async runtime — call from any thread at any time.
fn push_status_text(text: String) {
    if let Some(qt) = crate::bridge::APP_QT.get() {
        // .queue() schedules the closure on the Qt main thread.
        let _ = qt.queue(move |mut obj| {
            obj.as_mut().set_status_text(cxx_qt_lib::QString::from(&text));
        });
    }
}
```

Pattern: build the data you want to show, move it into the closure, call `.queue()`.  
The closure runs on the Qt main thread — safe to call any `set_*` property setter there.

---

## 8. QML — tray icon + hidden window

```qml
// qml/main.qml
import QtQuick
import QtQuick.Controls
import QtQuick.Controls.Material
import QtQuick.Layouts
import Qt.labs.platform 1.1 as Platform
import com.example.myapp              // matches QmlModule URI

ApplicationWindow {
    id: root
    width: 720; height: 480
    visible: appBridge.windowVisible  // data-driven — starts false
    title: "My App"
    Material.theme: Material.Dark
    Material.accent: Material.Blue

    // Hide to tray instead of closing.
    onClosing: function(close) {
        close.accepted = false
        appBridge.hideWindow()
    }

    // ⚠ CRITICAL: defer raise/requestActivate until AFTER the native window
    // handle exists.  Calling them synchronously (e.g. inside onActivated)
    // before Qt has processed the visibility change causes an access violation
    // in Qt6Core.dll (exception 0xc0000005 / EXCEPTION_ACCESS_VIOLATION).
    onVisibleChanged: {
        if (visible) {
            raise()
            requestActivate()
        }
    }

    AppBridge { id: appBridge }

    // ── System tray ────────────────────────────────────────────────────────
    Platform.SystemTrayIcon {
        visible: true
        icon.source: appBridge.trayIconUrl
        tooltip: appBridge.statusText

        onActivated: function(reason) {
            if (reason === Platform.SystemTrayIcon.Trigger ||
                reason === Platform.SystemTrayIcon.DoubleClick) {
                appBridge.showWindow()
            }
        }

        menu: Platform.Menu {
            Platform.MenuItem { text: "Show";  onTriggered: appBridge.showWindow() }
            Platform.MenuSeparator {}
            Platform.MenuItem { text: "Quit";  onTriggered: Qt.quit() }
        }
    }

    // ── Window content ─────────────────────────────────────────────────────
    ColumnLayout {
        anchors.fill: parent; anchors.margins: 20; spacing: 12

        Label {
            text: appBridge.statusText
            wrapMode: Text.Wrap
            Layout.fillWidth: true
        }

        Item { Layout.fillHeight: true }
        Button { text: "Hide to Tray"; onClicked: appBridge.hideWindow() }
    }
}
```

### Why `Qt.labs.platform` instead of `QtWidgets.QSystemTrayIcon`?

`QSystemTrayIcon` from QtWidgets requires a `QApplication` (the full widget stack).  A QML
application created with `QGuiApplication` does not have the widget stack.  
`Qt.labs.platform 1.1` wraps the native OS tray API with no widget dependency and works
with `QGuiApplication`.

**Required Qt modules to deploy:**

| DLL / Plugin | Purpose |
|---|---|
| `Qt6LabsPlatform.dll` | Qt.labs.platform module |
| `plugins/platforms/qwindows.dll` | QPA windows platform |
| `plugins/platformthemes/labsplatformplugin.dll` | native tray + menu backend |
| `Qt6Quick.dll`, `Qt6Qml.dll`, etc. | QML runtime |

Use `windeployqt --qmldir <qml-source-dir> <exe>` to auto-discover all required files.

---

## 9. Icon files

- Format: `.ico` (multi-resolution Windows icon recommended: 16×16, 32×32, 48×48, 256×256).
- Copy to `target/release/` via install script — the icon URL resolver looks next to the exe.
- Keep at minimum one file named `app_green.ico` (or adjust `resolve_icon_url()`).
- For colour-coded health states provide `app_green.ico`, `app_yellow.ico`, `app_red.ico`.

---

## 10. Deployment checklist

```powershell
# 1. Build with the GUI feature
cargo build --release --features qml_gui

# 2. Deploy Qt DLLs (run from the Qt bin directory or with Qt in PATH)
windeployqt --release --qmldir src\qml target\release\myapp.exe

# 3. Copy icon files
Copy-Item assets\icons\*.ico target\release\

# 4. Verify Qt6LabsPlatform.dll is present
Test-Path target\release\Qt6LabsPlatform.dll   # → True
# And the platform theme plugin:
Get-ChildItem target\release\plugins\ -Recurse -Filter "labsplatformplugin.dll"
```

---

## 11. Pitfall reference

| Pitfall | Symptom | Fix |
|---------|---------|-----|
| Call `raise()` in tray `onActivated` | Crash: `c0000005` in `Qt6Core.dll` | Move to `onVisibleChanged { if (visible) { ... } }` |
| `windows_subsystem = "windows"` + `AllocConsole()` | `--debug` output goes to wrong window | Keep console subsystem; use `ShowWindow(SW_HIDE)` |
| Spin-wait before `SUPERVISOR_QT` is set | Tokio starts services before bridge ready; queue() panics | Always spin-wait on the OnceLock before calling `APP_QT.get()` |
| `QApplication` instead of `QGuiApplication` | Linker errors or runtime crash | Use `QGuiApplication` for QML-only apps |
| Missing `labsplatformplugin.dll` | Tray icon invisible; no right-click menu | Run `windeployqt` with `--qmldir`; verify plugin |
| Missing `Qt6LabsPlatform.dll` | QML import error: `module "Qt.labs.platform" not installed` | Same: `windeployqt` or manual copy |
| `QString` passed by value across thread boundary | Compile error | Build `String` in Rust, move into closure, convert with `QString::from(&s)` inside the closure |
| `impl cxx_qt::Threading` missing | `qt_thread()` method doesn't exist | Add `impl cxx_qt::Threading for AppBridge {}` in the bridge |
