---
name: cxxqt-windows-icon
description: Use this skill when setting Windows executable, taskbar, window, and tray icons in a Rust+CxxQt QML application. Covers the three-layer icon strategy used by ds-viewer-gui — compile-time Win32 PE embedding, QRC embedding for in-QML use, and optional runtime C++ setter — plus the windows_subsystem attribute and app.manifest DPI awareness.
metadata:
  category: desktop
  tags:
    - windows
    - icon
    - taskbar
    - qml
    - cxxqt
    - rust
    - winresource
    - qrc
  language_targets:
    - rust
    - cpp
    - qml
  framework_targets:
    - qt6
    - cxxqt
---

# Windows Icon for Rust+CxxQt QML Applications (Taskbar + Window + QML + Tray)

This skill documents the layered approach used by `ds-viewer-gui` to reliably show the correct icon on Windows across all surfaces (taskbar, Alt+Tab, title bar, in-QML display). The canonical reference implementation is `ds-render/ds-viewer-gui`.

---

## The Three Icon Layers

### Layer 1 — Compile-time Win32 PE resource (reliable, required)

The Icon is compiled directly into the `.exe` binary using the `winresource` crate. This is the only mechanism that reliably sets the **taskbar button**, **Alt+Tab entry**, and **title-bar icon** without any runtime file system dependency.

**`Cargo.toml`** (build-dependency):
```toml
[build-dependencies]
winresource = "0.1"
```

**`build.rs`** (run for every Windows build):
```rust
#[cfg(windows)]
{
    let mut res = winresource::WindowsResource::new();
    res.set_icon("resources/app_icon.ico");
    res.set_manifest_file("resources/app.manifest");
    res.compile().expect("Failed to compile Windows resources");
}
```

- `app.manifest` sets DPI awareness (see below for template).
- The `.ico` must be kept under source control at `resources/`.
- The icon is embedded at compile time — no deployment of `.ico` files is needed for taskbar/window display.

### Layer 2 — QRC-embedded icons for in-QML use

Icon variants (`.svg`, `.png`) are embedded into the QRC bundle so QML files can reference them at runtime via `qrc:` paths. This is needed for any `Image { source: ... }` or `QGuiApplication::setWindowIcon()` call that occurs after app startup.

**`build.rs`** — add to `CxxQtBuilder::qrc_resources`:
```rust
let builder = CxxQtBuilder::new_qml_module(QmlModule::new("com.myapp.module")
    // ... qml_files ...
)
.qrc_resources([
    "resources/app_icon.svg",
    "resources/app_icon.png",
]);
```

**QML access** — the QRC path follows the pattern:
```
qrc:/qt/qml/{module.uri.as.path}/resources/{filename}
```

Example for module URI `com.dsviewer.gui`:
```qml
Image {
    source: "qrc:/qt/qml/com/dsviewer/gui/resources/dsviewer_icon.svg"
}
```

Replace `.` with `/` in the module URI to get the path component.

### Layer 3 — Runtime C++ setter (optional, reinforcement)

A small C++ file calls `QGuiApplication::setWindowIcon()` after the app object is created. This is a supplementary layer — Layer 1 already handles the PE icon — but it ensures any path that bypasses the PE resourcee (e.g. some Wine/Proton flows, certain Qt platform plugins) also gets the right icon.

**`src/app_icon.cpp`**:
```cpp
#include <QGuiApplication>
#include <QIcon>
#include <QFileInfo>
#include <QStringList>

extern "C" void set_app_icon() {
    QString exePath = QGuiApplication::applicationDirPath();

    // Probe multiple paths: exe-dir neighbour, QRC (always available)
    QStringList iconPaths = {
        exePath + "/app_icon.png",
        exePath + "/../resources/app_icon.png",   // cargo dev layout
        ":/qt/qml/com/myapp/module/resources/app_icon.png",
        ":/qt/qml/com/myapp/module/resources/app_icon.svg",
    };

    for (const QString& iconPath : iconPaths) {
        if (QFileInfo::exists(iconPath) || iconPath.startsWith(":/")) {
            QIcon icon(iconPath);
            if (!icon.isNull()) {
                QGuiApplication::setWindowIcon(icon);
                break;
            }
        }
    }
}
```

**`build.rs`** — compile it in:
```rust
let builder = unsafe {
    builder.cc_builder(|cc| {
        let qt_dir = std::env::var("QT_DIR").expect("QT_DIR not set");
        cc.include(format!("{}/include", qt_dir));
        cc.include(format!("{}/include/QtCore", qt_dir));
        cc.include(format!("{}/include/QtGui", qt_dir));
        cc.file("src/app_icon.cpp");
    })
};
```

**`src/main.rs`** — declare the FFI and call it after `QGuiApplication::new()`:
```rust
extern "C" {
    fn set_app_icon();
}

fn main() {
    // ... env vars, etc. ...
    let mut app = QGuiApplication::new();

    // Set the application icon (Windows taskbar, Alt-Tab, etc.)
    unsafe {
        set_app_icon();
    }

    // ... rest of startup ...
}
```

> The C++ file probes disk paths first, then falls back to the always-available QRC paths. The QRC fallback means icon display is correct even in a fresh `cargo run` without any deployment step.

---

## `windows_subsystem` Attribute

Place this at the top of `src/main.rs` to suppress the console window on Windows GUI builds:

```rust
// Option A — always suppress console on Windows (production GUI app)
#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]

// Option B — suppress only in release builds (allows console in debug)
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
```

`ds-viewer-gui` uses Option A. Option B was used by the interactive terminal.  
If you want a `--debug` flag to conditionally reattach a console, add `AttachConsole` / `AllocConsole` logic in `main()` **after** this attribute.

---

## `app.manifest` Template (DPI Awareness)

```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0">
  <application xmlns="urn:schemas-microsoft-com:asm.v3">
    <windowsSettings>
      <dpiAware xmlns="http://schemas.microsoft.com/SMI/2005/WindowsSettings">true/PM</dpiAware>
      <dpiAwareness xmlns="http://schemas.microsoft.com/SMI/2016/WindowsSettings">PerMonitorV2</dpiAwareness>
    </windowsSettings>
  </application>
</assembly>
```

Store as `resources/app.manifest` and reference via `res.set_manifest_file(...)` in `build.rs`.

---

## Required Asset Files

| File | Format | Purpose |
|------|--------|---------|
| `resources/app_icon.ico` | `.ico` (multi-resolution) | Win32 PE resource — taskbar/window/Alt+Tab |
| `resources/app_icon.svg` | `.svg` | QRC embedding — in-QML `Image` source, runtime icon setter QRC fallback |
| `resources/app_icon.png` | `.png` (256×256 minimum) | QRC embedding — runtime icon setter, better cross-context compatibility than SVG |
| `resources/app.manifest` | XML | DPI awareness manifest, embedded via winresource |

All four files should be kept under source control. Only the `.ico` and `.manifest` are needed for taskbar/window display; `.svg`/`.png` are needed for in-QML display and the runtime C++ setter.

---

## Optional — System Tray Icon (QML SystemTrayIcon)

If the app needs a system tray presence, bind the tray icon in QML separately:

```qml
import Qt.labs.platform as Platform

Platform.SystemTrayIcon {
    visible: true
    icon.source: "qrc:/qt/qml/com/myapp/module/resources/app_icon.png"
}
```

Or resolve a `file://` path from Rust and expose it as a property:

```rust
// In your QObject bridge property getter
fn tray_icon_url(&self) -> QString {
    // Probe exe-dir/resources, fall back to QRC
    ...
}
```

Tray icon resolution is completely independent of the taskbar/window icon layers.

---

## Setup Checklist

- [ ] `winresource` in `[build-dependencies]`
- [ ] `build.rs`: `winresource` block (Icon + manifest, `#[cfg(windows)]`)
- [ ] `build.rs`: `.qrc_resources([...svg, ...png])` in `CxxQtBuilder`
- [ ] `build.rs`: `cc_builder` block compiling `src/app_icon.cpp`
- [ ] `src/app_icon.cpp` created with correct module URI QRC paths
- [ ] `src/main.rs`: `windows_subsystem` attribute
- [ ] `src/main.rs`: `extern "C" { fn set_app_icon(); }` + call after `QGuiApplication::new()`
- [ ] `resources/app_icon.ico`, `.svg`, `.png`, `app.manifest` all present

---

## Verification

1. Build release binary (`cargo build --release`).
2. Launch the `.exe` directly (not via `cargo run`) from Explorer or Taskbar.
3. Confirm:
   - Taskbar button shows the branded icon.
   - Alt+Tab entry shows the branded icon.
   - Window title bar shows the branded icon.
   - Any in-QML `Image` with a `qrc:` icon path renders correctly.

---

## Troubleshooting

**Taskbar / window icon wrong after build**
- Verify `winresource` is in `[build-dependencies]` and `build.rs` `#[cfg(windows)]` block runs.
- Confirm the `.ico` file exists at the path given to `set_icon()`.
- Run `cargo clean` and rebuild — stale artifacts can carry the old icon.

**In-QML icon blank**
- Confirm `.svg`/`.png` are listed in `.qrc_resources(...)`.
- Double-check the QRC path: dots in module URI become slashes. A typo here causes a silent load failure.
- Test the path with `console.log("icon:", Qt.resolvedUrl("qrc:/..."))` in QML.

**Runtime C++ setter has no effect**
- This is expected if Layer 1 (PE resource) is already working — both target the same win32 window icon slot; PE resource wins.
- If neither works, add `qDebug() << "Icon null?" << icon.isNull();` in `app_icon.cpp` to confirm the QRC path resolves.

**Console window appears in release build**
- Confirm `windows_subsystem = "windows"` attribute is present and the correct `cfg` condition (`target_os = "windows"` or `not(debug_assertions)`) is satisfied for the build profile in use.

---

## Canonical Reference Implementation

- `ds-render/ds-viewer-gui/build.rs` — all three layers wired together
- `ds-render/ds-viewer-gui/src/main.rs` — `windows_subsystem`, FFI declaration, post-app call
- `ds-render/ds-viewer-gui/src/app_icon.cpp` — runtime C++ setter
- `ds-render/ds-viewer-gui/resources/` — `dsviewer_icon.ico`, `.svg`, `.png`, `app.manifest`
- `ds-render/ds-viewer-gui/qml/VdfImageViewer.qml` — QRC path usage in QML
