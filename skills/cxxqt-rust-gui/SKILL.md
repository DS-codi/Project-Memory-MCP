---
name: cxxqt-rust-gui
description: "Use this skill when building Qt-based GUI applications in Rust using CxxQt. Covers project structure, QObject integration, QML bindings, signal/slot patterns, and build configuration with cxx-qt-build."
---

# CxxQt Rust GUI Development Instructions

Guidelines for building Qt-based GUI applications in Rust using CxxQt.

## Architecture Overview

```
┌─────────────────────────────────────────┐
│           QML UI Layer                  │
│  (main.qml, components/*.qml)           │
└──────────────────┬──────────────────────┘
                   │ Properties, Signals, Invokables
┌──────────────────▼──────────────────────┐
│         CxxQt Bridge Module             │
│  (cxxqt_bridge.rs - #[cxx_qt::bridge])  │
└──────────────────┬──────────────────────┘
                   │
┌──────────────────▼──────────────────────┐
│        Rust Business Logic              │
│  (lib.rs, modules/*.rs)                 │
└─────────────────────────────────────────┘
```

## Project Structure

```
my-app/
├── Cargo.toml              # Dependencies
├── build.rs                # CxxQt build config
├── .qmlls.ini              # QML language server
├── qml/
│   ├── main.qml            # Main window
│   └── components/         # Reusable QML components
├── resources/
│   ├── app.manifest        # Windows manifest
│   ├── app.ico             # Windows icon
│   └── icon.svg            # App icon
└── src/
    ├── main.rs             # Entry point
    ├── cxxqt_bridge.rs     # Bridge definitions
    └── *.rs                # Business logic
```

## Required Dependencies

### Cargo.toml

```toml
[dependencies]
cxx = "1.0.95"
cxx-qt = "0.8"
cxx-qt-lib = { version = "0.8", features = ["qt_full"] }

[build-dependencies]
cxx-qt-build = { version = "0.8", features = ["link_qt_object_files"] }

[target.'cfg(windows)'.build-dependencies]
winresource = "0.1"
```

### Environment

Set `QT_DIR` to your Qt installation (e.g., `C:\Qt\6.7.0\msvc2019_64`).

## Build Configuration (build.rs)

```rust
use cxx_qt_build::{CxxQtBuilder, QmlModule};

fn main() {
    #[cfg(windows)]
    {
        let mut res = winresource::WindowsResource::new();
        res.set_icon("resources/app.ico");
        res.set_manifest_file("resources/app.manifest");
        res.compile().expect("Failed to compile Windows resources");
    }

    CxxQtBuilder::new_qml_module(
        QmlModule::new("com.mycompany.myapp")
            .qml_files(["qml/main.qml"]),
    )
    .file("src/cxxqt_bridge.rs")
    .qrc_resources(["resources/icon.svg"])
    .build();
}
```

## CxxQt Bridge Pattern

### Bridge Structure (cxxqt_bridge.rs)

```rust
use cxx_qt_lib::QString;
use std::pin::Pin;

#[cxx_qt::bridge]
pub mod ffi {
    // Import Qt types
    unsafe extern "C++" {
        include!("cxx-qt-lib/qstring.h");
        type QString = cxx_qt_lib::QString;
    }

    // Define QObject with properties
    unsafe extern "RustQt" {
        #[qobject]
        #[qml_element]
        #[qproperty(QString, status_message, cxx_name = "statusMessage")]
        #[qproperty(bool, is_busy, cxx_name = "isBusy")]
        #[qproperty(i32, progress)]
        type MyApp = super::MyAppRust;

        #[qinvokable]
        #[cxx_name = "doWork"]
        fn do_work(self: Pin<&mut MyApp>, input: QString);
    }

    // Define signals
    unsafe extern "RustQt" {
        #[qsignal]
        #[cxx_name = "workComplete"]
        fn work_complete(self: Pin<&mut MyApp>, success: bool);
    }

    // Enable threading
    impl cxx_qt::Threading for MyApp {}
}

// Rust backing struct
#[derive(Default)]
pub struct MyAppRust {
    status_message: QString,
    is_busy: bool,
    progress: i32,
}

// Method implementations
impl ffi::MyApp {
    pub fn do_work(mut self: Pin<&mut Self>, input: QString) {
        self.as_mut().set_is_busy(true);
        // ... implementation
    }
}
```

## Naming Conventions

| Context | Convention | Example |
|---------|------------|---------|
| Rust fields | snake_case | `status_message` |
| C++/QML names | camelCase via `cxx_name` | `statusMessage` |
| Rust methods | snake_case | `do_work` |
| QML invokables | camelCase via `cxx_name` | `doWork` |

## Property Types

| Qt Type | Rust Type | Usage |
|---------|-----------|-------|
| `QString` | `QString` | Text |
| `QStringList` | `QStringList` | String arrays |
| `bool` | `bool` | Flags |
| `int` | `i32` | Integers |
| `double` | `f64` | Decimals |
| `QUrl` | `QUrl` | File paths, URLs |

## Threading Pattern

Always use `qt_thread()` for background work:

```rust
pub fn heavy_work(mut self: Pin<&mut Self>) {
    let qt_thread = self.qt_thread();
    self.as_mut().set_is_busy(true);

    std::thread::spawn(move || {
        // Background work here...
        
        // Send updates back to Qt thread
        qt_thread.queue(move |mut qobject| {
            qobject.as_mut().set_is_busy(false);
            qobject.as_mut().work_complete(true);
        }).expect("Failed to queue");
    });
}
```

### Cancellation Pattern

```rust
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

#[derive(Default)]
pub struct MyAppRust {
    cancel_flag: Arc<AtomicBool>,
}

impl ffi::MyApp {
    pub fn cancel(self: Pin<&mut Self>) {
        self.rust().cancel_flag.store(true, Ordering::SeqCst);
    }
}
```

## QML Integration

### Importing the Module

```qml
import QtQuick 2.15
import QtQuick.Controls 2.15
import com.mycompany.myapp 1.0

ApplicationWindow {
    visible: true
    width: 800
    height: 600

    MyApp {
        id: myApp
        onWorkComplete: console.log("Done:", success)
    }

    Button {
        text: myApp.isBusy ? "Working..." : "Start"
        enabled: !myApp.isBusy
        onClicked: myApp.doWork("input")
    }
}
```

### Resource Access

Resources via `qrc:/qt/qml/<uri-path>/resources/<file>`:

```qml
Image {
    source: "qrc:/qt/qml/com/mycompany/myapp/resources/icon.svg"
}
```

## Main Entry Point

```rust
#![windows_subsystem = "windows"]

mod cxxqt_bridge;

use cxx_qt_lib::{QGuiApplication, QQmlApplicationEngine, QUrl};

fn main() {
    #[cfg(windows)]
    std::env::set_var("QT_QPA_PLATFORM", "windows:darkmode=2");

    let mut app = QGuiApplication::new();
    let mut engine = QQmlApplicationEngine::new();

    if let Some(engine) = engine.as_mut() {
        engine.load(&QUrl::from("qrc:/qt/qml/com/mycompany/myapp/qml/main.qml"));
    }

    if let Some(app) = app.as_mut() {
        app.exec();
    }
}
```

## Error Handling

Store errors in properties and emit signals:

```rust
pub fn load_file(mut self: Pin<&mut Self>, path: QString) {
    match std::fs::read_to_string(path.to_string()) {
        Ok(content) => {
            self.as_mut().set_content(QString::from(content.as_str()));
            self.as_mut().set_error_message(QString::default());
        }
        Err(e) => {
            let msg = QString::from(e.to_string().as_str());
            self.as_mut().set_error_message(msg.clone());
            self.as_mut().error_occurred(msg);
        }
    }
}
```

## Best Practices

1. **Never panic** in methods called from Qt - always handle errors gracefully
2. **Capture `qt_thread()`** on the Qt thread before spawning background threads
3. **Use `queue()`** to send all updates back to the Qt thread
4. **Keep QML files focused** - extract reusable components
5. **Use `Arc<AtomicBool>`** for cancellation flags
6. **Initialize properties** via the `Initialize` trait when `Default` isn't sufficient

## Windows Resources

### app.manifest

```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<assembly manifestVersion="1.0" xmlns="urn:schemas-microsoft-com:asm.v1">
  <application xmlns="urn:schemas-microsoft-com:asm.v3">
    <windowsSettings>
      <dpiAware xmlns="http://schemas.microsoft.com/SMI/2005/WindowsSettings">true/pm</dpiAware>
      <dpiAwareness xmlns="http://schemas.microsoft.com/SMI/2016/WindowsSettings">PerMonitorV2</dpiAwareness>
    </windowsSettings>
  </application>
</assembly>
```

### .qmlls.ini

```ini
[General]
buildDir=target/debug
```

## References

- [CxxQt Documentation](https://kdab.github.io/cxx-qt/book/)
- [CxxQt GitHub](https://github.com/KDAB/cxx-qt)
- [Qt QML Documentation](https://doc.qt.io/qt-6/qtqml-index.html)
- [cxx-qt-lib API](https://docs.rs/cxx-qt-lib)
