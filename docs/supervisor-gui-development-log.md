# Supervisor GUI — Development Log

> A detailed record of everything built, every bug fixed, and every design decision made while
> adding a native system-tray + QML window to the Project Memory MCP Supervisor.

---

## Overview

The Supervisor binary (`supervisor/`) manages the lifecycle of three services:

| Service | Runner | Port |
|---------|--------|------|
| MCP Server | Node.js process (or Podman container) | 3000 |
| Interactive Terminal | Standalone GUI + TCP server | 4000 |
| Dashboard | Vite dev / built static server | 5173 |

Before this work the binary had no visible presence on the desktop beyond a console window.
After this work it:

- Hides its console window on normal launch.
- Shows a coloured tray icon in the Windows system tray.
- Shows a status string on hover over the tray icon.
- Has a right-click context menu with per-service controls and a Quit item.
- Shows a QML window (dark Material theme) when the user clicks the tray icon or chooses
  "Show Supervisor" from the menu.
- Updates the status label in that window live as services start/stop/fail.

---

## Architecture

### Thread model

CxxQt requires Qt to own the **main thread**.  Tokio (async runtime) cannot be on the main thread
at the same time.  The solution:

```
main() [Qt main thread]
│
├─── std::thread::spawn(|| { ... })    ← background Tokio thread
│        wait for SUPERVISOR_QT (OnceLock)
│        tokio::Runtime::new().block_on(supervisor_main())
│            start Node / Terminal / Dashboard services
│            poll health
│            push status updates via SUPERVISOR_QT.queue()
│
├─── QGuiApplication::new()
├─── QQmlApplicationEngine::new()
├─── engine.load("qrc:/qt/qml/.../main.qml")
└─── app.exec()     ← Qt event loop — blocks until Qt.quit()
```

### Rust ↔ Qt bridge

`cxx-qt` generates a C++ QObject from a Rust struct.  Properties declared with `#[qproperty]`
become real Qt bindable properties that QML reads reactively.

```rust
// supervisor/src/cxxqt_bridge/mod.rs
#[cxx_qt::bridge]
pub mod ffi {
    unsafe extern "RustQt" {
        #[qobject]
        #[qml_element]
        #[qproperty(bool,    window_visible, cxx_name = "windowVisible")]
        #[qproperty(QString, status_text,    cxx_name = "statusText")]
        #[qproperty(QString, tray_icon_url,  cxx_name = "trayIconUrl")]
        type SupervisorGuiBridge = super::SupervisorGuiBridgeRust;

        #[qinvokable]
        #[cxx_name = "showWindow"]
        fn show_window(self: Pin<&mut SupervisorGuiBridge>);

        #[qinvokable]
        #[cxx_name = "hideWindow"]
        fn hide_window(self: Pin<&mut SupervisorGuiBridge>);
    }
    impl cxx_qt::Initialize for SupervisorGuiBridge {}
    impl cxx_qt::Threading for SupervisorGuiBridge {}
}
```

`impl cxx_qt::Threading` generates `qt_thread()` on the object so the background Tokio thread
can hold a `CxxQtThread<SupervisorGuiBridge>` handle and call `.queue(closure)` to run code
on the Qt main thread safely.

### OnceLock handshake

```rust
// supervisor/src/cxxqt_bridge/initialize.rs
pub static SUPERVISOR_QT: OnceLock<CxxQtThread<SupervisorGuiBridge>> = OnceLock::new();

impl cxx_qt::Initialize for ffi::SupervisorGuiBridge {
    fn initialize(mut self: Pin<&mut Self>) {
        let _ = SUPERVISOR_QT.set(self.qt_thread());   // ← deposit handle
        self.as_mut().set_status_text(QString::from("Supervisor starting…"));
        self.as_mut().set_window_visible(false);
        self.as_mut().set_tray_icon_url(resolve_tray_icon_url());
    }
}
```

The background thread spin-waits on `SUPERVISOR_QT.get().is_some()` with a 10-second deadline.
Once the handle is there it starts the Tokio runtime and services.

---

## Features implemented

### 1. System tray icon (`Qt.labs.platform`)

**Why `Qt.labs.platform`?** The stable `QtSystemTrayIcon` in `Qt.widgets` requires a
`QApplication` (widget stack), which conflicts with a pure-QML application that uses
`QGuiApplication`.  The `Qt.labs.platform` module wraps the native platform tray API without
the widget dependency.

```qml
import Qt.labs.platform 1.1 as Platform

Platform.SystemTrayIcon {
    id: trayIcon
    visible: true
    icon.source: supervisorGuiBridge.trayIconUrl   // file:///…/supervisor_green.ico
    tooltip: "Project Memory Supervisor\n" + supervisorGuiBridge.statusText

    onActivated: function(reason) {
        if (reason === Platform.SystemTrayIcon.Trigger ||
            reason === Platform.SystemTrayIcon.DoubleClick) {
            supervisorGuiBridge.showWindow()
        }
    }

    menu: Platform.Menu {
        Platform.MenuItem { text: "Show Supervisor"; onTriggered: supervisorGuiBridge.showWindow() }
        Platform.MenuSeparator {}
        Platform.MenuItem { text: "MCP Server — Restart";           onTriggered: { /* TODO */ } }
        Platform.MenuItem { text: "Interactive Terminal — Restart";  onTriggered: { /* TODO */ } }
        Platform.MenuItem { text: "Dashboard — Restart";            onTriggered: { /* TODO */ } }
        Platform.MenuSeparator {}
        Platform.MenuItem { text: "Quit Supervisor"; onTriggered: Qt.quit() }
    }
}
```

**Required Qt module:** the `Qt6LabsPlatform` DLL and the `labsplatformplugin` plugin must be
deployed alongside the executable (see Build & Deploy section).

**Icon resolution** (`initialize.rs`):
1. Search exe directory for `supervisor_green.ico`, `supervisor_purple.ico`, `supervisor_blue.ico`,
   `supervisor_red.ico` (in that priority order).
2. Fall back to `<CARGO_MANIFEST_DIR>/assets/icons/supervisor_green.ico` for dev runs.
3. Convert backslashes to forward slashes and prefix `file:///` (Qt URL requirement).

---

### 2. QML window — show/hide from tray

```qml
ApplicationWindow {
    id: root
    width: 720
    height: 480
    visible: supervisorGuiBridge.windowVisible   // data-driven
    title: "Project Memory Supervisor"
    Material.theme: Material.Dark
    Material.accent: Material.Blue

    // Prevent closing — hide to tray instead.
    onClosing: function(close) {
        close.accepted = false
        supervisorGuiBridge.hideWindow()
    }

    // CRITICAL: raise/requestActivate MUST be deferred until the native
    // window handle exists.  Calling them synchronously when windowVisible
    // is set (before the handle is created) causes an access violation in
    // Qt6Core.dll (exception 0xc0000005).
    onVisibleChanged: {
        if (visible) {
            raise()
            requestActivate()
        }
    }
    ...
}
```

**Bug fixed:** Initial implementation called `root.raise()` and `root.requestActivate()` from
within `onActivated` and `MenuItem.onTriggered`, immediately after `supervisorGuiBridge.showWindow()`.
Those handlers run synchronously; Qt has not yet processed the visibility change event and the native
win32 HWND is still null.  Result: crash with fault address in `Qt6Core.dll`.

**Fix:** Move focus-stealing calls to `onVisibleChanged` — that handler fires after Qt has
actually created the native window.

---

### 3. Live status text

The Tokio background thread calls helpers like `set_service_status`, `set_service_error`, and
`set_service_health_ok` as services come up.  These helpers now end with:

```rust
// supervisor/src/main.rs
#[cfg(feature = "supervisor_qml_gui")]
fn push_qt_status(snapshot: &supervisor::control::protocol::HealthSnapshot) {
    let lines: Vec<String> = snapshot.children.iter()
        .map(|c| format!("{}: {}", display_name_for_service(&c.service_name), display_state_for_service(&c.status)))
        .collect();
    let text = if lines.is_empty() {
        "All services stopped".to_string()
    } else {
        lines.join("  ·  ")
    };
    if let Some(qt) = supervisor::cxxqt_bridge::SUPERVISOR_QT.get() {
        let _ = qt.queue(move |mut obj| {
            obj.as_mut().set_status_text(cxx_qt_lib::QString::from(&text));
        });
    }
}

#[cfg(not(feature = "supervisor_qml_gui"))]
fn push_qt_status(_: &supervisor::control::protocol::HealthSnapshot) {}
```

The `queue` closure crosses the thread boundary; `text` is moved into it.  The status string
format is `"MCP: Running  ·  Interactive Terminal: Running  ·  Dashboard: Running"`.

The same `supervisorGuiBridge.statusText` property is also bound to the tray icon tooltip, so
both the window label and the hover tooltip update automatically.

---

### 4. Console window behaviour

| Launch mode | Console window |
|-------------|----------------|
| `supervisor.exe` | Hidden immediately at startup (no flash) |
| `supervisor.exe --debug` | Stays visible; all debug output goes there |

Implementation:

```rust
// Detect --debug BEFORE any Qt or Tokio initialisation.
let debug_mode = std::env::args().any(|a| a == "--debug");

#[cfg(windows)]
if !debug_mode {
    extern "system" {
        fn GetConsoleWindow() -> *mut std::ffi::c_void;
        fn ShowWindow(hwnd: *mut std::ffi::c_void, nCmdShow: i32) -> i32;
    }
    unsafe {
        let hwnd = GetConsoleWindow();
        if !hwnd.is_null() {
            ShowWindow(hwnd, 0 /* SW_HIDE */);
        }
    }
}
```

The binary keeps the default `console` subsystem (not `windows`) so that stdout/stderr always
work regardless of launch mode.  `ShowWindow(SW_HIDE)` is the least-intrusive way to suppress
the console without losing the ability to write to it.

**What didn't work:** `#![cfg_attr(windows, windows_subsystem = "windows")]` + `AllocConsole()`
on `--debug`.  `AllocConsole()` opens a *new detached* console window — it doesn't attach back to
the terminal the user launched the process from.  That makes interactive `--debug` useless.

---

### 5. Verbose debug output (`--debug`)

Added `[supervisor:debug]` `eprintln!` calls throughout the startup sequence:

| Message | When |
|---------|------|
| `setting Qt env vars...` | Before env-var writes |
| `spawning background Tokio thread...` | Before `std::thread::spawn` |
| `background thread started, waiting for QML bridge...` | First line inside spawn |
| `still waiting for QML bridge... (N.Ns elapsed)` | Every 2 s during spin-wait |
| `QML bridge ready after N.NNs` | When `SUPERVISOR_QT.get().is_some()` |
| `creating Tokio runtime...` | Before `Runtime::new()` |
| `entering supervisor_main()...` | Before `block_on` |
| `creating QGuiApplication...` | Back on Qt main thread |
| `creating QQmlApplicationEngine...` | |
| `loading QML: qrc:/qt/qml/.../main.qml` | Before `engine.load()` |
| `QML load call returned` | After `engine.load()` |
| `entering Qt event loop (app.exec())...` | Before `app.exec()` |
| `Qt event loop exited` | After `app.exec()` returns |

Logging in `supervisor_main`:
- `--debug` → human-readable `tracing_subscriber::fmt()` at DEBUG level.
- Normal → structured JSON at INFO level (overridable via `RUST_LOG`).

---

## Build & Deploy

### `supervisor/Cargo.toml`

```toml
[features]
default = ["supervisor_qml_gui"]
supervisor_qml_gui = ["dep:cxx", "dep:cxx-qt", "dep:cxx-qt-lib"]

[dependencies]
cxx         = { version = "1.0.95", optional = true }
cxx-qt      = { version = "0.8",    optional = true }
cxx-qt-lib  = { version = "0.8", features = ["qt_full"], optional = true }

[build-dependencies]
cxx-qt-build = { version = "0.8", features = ["link_qt_object_files"] }
```

### `supervisor/build.rs`

```rust
#[cfg(feature = "supervisor_qml_gui")]
use cxx_qt_build::{CxxQtBuilder, QmlModule};

fn main() {
    #[cfg(not(feature = "supervisor_qml_gui"))]
    { return; }

    #[cfg(feature = "supervisor_qml_gui")]
    {
        CxxQtBuilder::new_qml_module(
            QmlModule::new("com.projectmemory.supervisor")
                .qml_files(["qml/main.qml"]),
        )
        .file("src/cxxqt_bridge/mod.rs")
        .build();
    }
}
```

This embeds `main.qml` in a QRC resource bundle at
`qrc:/qt/qml/com/projectmemory/supervisor/qml/main.qml`.

### `install.ps1 -Component Supervisor`

1. Kills any running `supervisor.exe` process.
2. Runs `cargo build --release --features supervisor_qml_gui` in `supervisor/`.
3. Calls `windeployqt` on the built exe — auto-discovers and copies Qt DLLs including
   `Qt6LabsPlatform.dll` and the `labsplatformplugin.dll` plugin.
4. Copies `supervisor/assets/icons/*.ico` → `target/release/` (4 files).

---

## Known limitations / TODO

| Item | Notes |
|------|-------|
| Service restart buttons in tray menu | Placeholders wired (`onTriggered: { /* TODO */ }`) — need to expose a `restartService(name)` invokable on the bridge |
| Per-service status in the window | Currently a single status string; could be a `ListView` over a `QAbstractListModel` |
| Coloured tray icon changes | Icon URL is set once at init; needs a `push_qt_icon()` helper similar to `push_qt_status()` |
| Autostart on Windows login | Registry key or Task Scheduler entry not yet implemented |
| macOS / Linux tray | `Qt.labs.platform` is cross-platform but untested |
| Hide-on-minimize | Window currently only hides via X button; minimize button shrinks to taskbar |

---

## Crash reference

### c0000005 in Qt6Core.dll on Show GUI

- **Symptom:** Clicking "Show Supervisor" or the tray icon crashed the process.
- **Crash dump:** `supervisor.exe.7836.dmp`, fault in `Qt6Core.dll`, exception `0xc0000005`.
- **Root cause:** `root.raise()` called synchronously in `onActivated`/`onTriggered` before Qt
  had created the native Win32 window handle (window starts `visible: false`).
- **Fix:** Move `raise()` + `requestActivate()` to `onVisibleChanged`; the handler only fires
  after Qt has processed the visibility state change and the HWND exists.

---

## File map

```
supervisor/
├── Cargo.toml                          feature flag: supervisor_qml_gui
├── build.rs                            CxxQtBuilder wires QML into QRC bundle
├── assets/
│   └── icons/
│       ├── supervisor_green.ico
│       ├── supervisor_blue.ico
│       ├── supervisor_purple.ico
│       └── supervisor_red.ico
├── qml/
│   └── main.qml                        tray icon + hidden ApplicationWindow
└── src/
    ├── main.rs                         entry point: Qt main thread + Tokio thread split
    │                                   console hiding, --debug flag, push_qt_status()
    └── cxxqt_bridge/
        ├── mod.rs                      #[qobject] bridge: windowVisible, statusText, trayIconUrl
        └── initialize.rs               Initialize impl: SUPERVISOR_QT OnceLock, icon URL resolver
```
