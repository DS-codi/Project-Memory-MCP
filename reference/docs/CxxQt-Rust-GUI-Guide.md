# Building Rust Applications with CxxQt UIs

A comprehensive guide to creating Qt-based GUI applications in Rust using CxxQt, based on the `ds-viewer-gui` and `ds-converter-gui` modules in this project.

## Table of Contents

1. [Overview](#overview)
2. [Project Structure](#project-structure)
3. [Dependencies Setup](#dependencies-setup)
4. [Build Configuration](#build-configuration)
5. [The CxxQt Bridge](#the-cxxqt-bridge)
6. [QML Integration](#qml-integration)
7. [Main Entry Point](#main-entry-point)
8. [Properties and Signals](#properties-and-signals)
9. [Threading and Background Work](#threading-and-background-work)
10. [Resources and Assets](#resources-and-assets)
11. [Complete Example](#complete-example)
12. [Best Practices](#best-practices)

---

## Overview

CxxQt is a Rust crate that provides safe Qt bindings, allowing you to:
- Expose Rust structs as QObjects usable in QML
- Define Qt properties that automatically generate getters/setters/change signals
- Implement invokable methods callable from QML
- Emit custom signals from Rust
- Use Qt's threading model for safe background work

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        QML UI Layer                         │
│  (main.qml, components/*.qml)                               │
└──────────────────────────┬──────────────────────────────────┘
                           │ Properties, Signals, Invokables
┌──────────────────────────▼──────────────────────────────────┐
│                    CxxQt Bridge Module                       │
│  (cxxqt_bridge.rs - #[cxx_qt::bridge])                      │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                    Rust Business Logic                       │
│  (conversion.rs, scanner.rs, renderer.rs, etc.)             │
└─────────────────────────────────────────────────────────────┘
```

---

## Project Structure

A typical CxxQt project follows this structure:

```
my-app/
├── Cargo.toml              # Rust dependencies
├── build.rs                # CxxQt build configuration
├── .qmlls.ini              # QML language server config
├── qml/                    # QML UI files
│   ├── main.qml            # Main application window
│   └── components/         # Reusable QML components
├── resources/              # Icons, images, manifest
│   ├── app.manifest        # Windows app manifest
│   ├── app.ico             # Windows icon
│   └── icon.svg            # App icon for QML
└── src/
    ├── main.rs             # Application entry point
    ├── lib.rs              # Library crate (optional)
    ├── cxxqt_bridge.rs     # CxxQt bridge definitions
    └── *.rs                # Business logic modules
```

### Example from ds-converter-gui:

```
ds-converter-gui/
├── Cargo.toml
├── build.rs
├── qml/
│   ├── main.qml
│   ├── DropZone.qml
│   ├── FileStatsPanel.qml
│   ├── ConversionDialog.qml
│   └── BatchWarning.qml
├── resources/
│   ├── app.manifest
│   ├── dsconverter.ico
│   └── dsconverter_icon.svg
└── src/
    ├── main.rs
    ├── cxxqt_bridge.rs
    ├── conversion.rs
    ├── detection.rs
    ├── scanner.rs
    └── settings.rs
```

---

## Dependencies Setup

### Cargo.toml

```toml
[package]
name = "my-app"
version = "0.1.0"
edition = "2021"

[[bin]]
name = "my-app"
path = "src/main.rs"

[dependencies]
# CXX-Qt core dependencies
cxx = "1.0.95"
cxx-qt = "0.8"
cxx-qt-lib = { version = "0.8", features = ["qt_full"] }

# Common useful crates
anyhow = "1.0"          # Error handling
thiserror = "1.0"       # Custom error types
serde = { version = "1.0", features = ["derive"] }  # Serialization
serde_json = "1.0"      # JSON support
log = "0.4"             # Logging facade
env_logger = "0.11"     # Logging implementation

[build-dependencies]
cxx-qt-build = { version = "0.8", features = ["link_qt_object_files"] }

# Windows-specific: embed icon and manifest
[target.'cfg(windows)'.build-dependencies]
winresource = "0.1"

[features]
default = []
```

### Required Environment

Set the `QT_DIR` environment variable to your Qt installation:

```powershell
# Windows (PowerShell)
$env:QT_DIR = "C:\Qt\6.7.0\msvc2019_64"

# Or add to your .cargo/config.toml
```

---

## Build Configuration

### build.rs

The build script configures CxxQt to process your bridge module and QML files:

```rust
use cxx_qt_build::{CxxQtBuilder, QmlModule};

fn main() {
    // Windows: Compile icon and manifest into the executable
    #[cfg(windows)]
    {
        let mut res = winresource::WindowsResource::new();
        res.set_icon("resources/app.ico");
        res.set_manifest_file("resources/app.manifest");
        res.compile().expect("Failed to compile Windows resources");
    }

    // Create builder with QML module
    CxxQtBuilder::new_qml_module(
        QmlModule::new("com.mycompany.myapp")  // QML import URI
            .qml_files([
                "qml/main.qml",
                "qml/MyComponent.qml",
                // Add all QML files here
            ]),
    )
    // Add Rust source files containing #[cxx_qt::bridge] modules
    .file("src/cxxqt_bridge.rs")
    // Add QRC resources (accessible via qrc:/ URLs in QML)
    .qrc_resources([
        "resources/icon.svg",
        "resources/icon.png",
    ])
    // Build with Qt6
    .build();
}
```

### Advanced: Adding C++ Files

If you need custom C++ code (e.g., for QQuickImageProvider):

```rust
// In build.rs
let builder = unsafe {
    builder.cc_builder(|cc| {
        let qt_dir = std::env::var("QT_DIR").expect("QT_DIR not set");
        cc.include(format!("{}/include", qt_dir));
        cc.include(format!("{}/include/QtCore", qt_dir));
        cc.include(format!("{}/include/QtGui", qt_dir));
        cc.include(format!("{}/include/QtQuick", qt_dir));
        cc.file("src/image_provider.cpp");
    })
};
```

---

## The CxxQt Bridge

The bridge module (`cxxqt_bridge.rs`) defines the QObject that connects QML and Rust.

### Basic Structure

```rust
use cxx_qt::CxxQtType;
use cxx_qt_lib::{QString, QStringList};
use std::pin::Pin;

#[cxx_qt::bridge]
pub mod ffi {
    // Import Qt types
    unsafe extern "C++" {
        include!("cxx-qt-lib/qstring.h");
        type QString = cxx_qt_lib::QString;
        
        include!("cxx-qt-lib/qstringlist.h");
        type QStringList = cxx_qt_lib::QStringList;
    }

    // Define the QObject
    unsafe extern "RustQt" {
        #[qobject]
        #[qml_element]  // Makes it available in QML
        #[qproperty(QString, status_message, cxx_name = "statusMessage")]
        #[qproperty(bool, is_busy, cxx_name = "isBusy")]
        #[qproperty(i32, progress)]
        type MyApp = super::MyAppRust;

        // Invokable methods (callable from QML)
        #[qinvokable]
        #[cxx_name = "doSomething"]
        fn do_something(self: Pin<&mut MyApp>, input: QString);

        #[qinvokable]
        #[cxx_name = "getValue"]
        fn get_value(self: &MyApp) -> QString;
    }

    // Define signals
    unsafe extern "RustQt" {
        #[qsignal]
        #[cxx_name = "operationComplete"]
        fn operation_complete(self: Pin<&mut MyApp>, success: bool, message: QString);

        #[qsignal]
        #[cxx_name = "errorOccurred"]
        fn error_occurred(self: Pin<&mut MyApp>, error: QString);
    }
}

// Rust struct backing the QObject
#[derive(Default)]
pub struct MyAppRust {
    // Properties must match qproperty declarations
    status_message: QString,
    is_busy: bool,
    progress: i32,
    
    // Internal state (not exposed to QML)
    internal_data: Option<String>,
}

// Implement invokable methods
impl ffi::MyApp {
    pub fn do_something(mut self: Pin<&mut Self>, input: QString) {
        let input_str = input.to_string();
        
        self.as_mut().set_is_busy(true);
        self.as_mut().set_status_message(QString::from("Working..."));
        
        // Do work here...
        
        self.as_mut().set_is_busy(false);
        self.as_mut().operation_complete(true, QString::from("Done!"));
    }

    pub fn get_value(self: &Self) -> QString {
        QString::from("Hello from Rust!")
    }
}
```

### Key Concepts

#### Properties

Properties create a Qt property with:
- A getter method
- A setter method
- An automatic `<propertyName>Changed` signal

```rust
#[qproperty(QString, status_message, cxx_name = "statusMessage")]
```

- `QString` - the Qt type
- `status_message` - the Rust field name
- `cxx_name = "statusMessage"` - the name in C++/QML (camelCase)

#### Invokable Methods

Methods marked with `#[qinvokable]` can be called from QML:

```rust
#[qinvokable]
#[cxx_name = "processFiles"]  // QML will use this name
fn process_files(self: Pin<&mut MyApp>, files: QStringList);
```

#### Signals

Signals are declared but implemented by CxxQt. You just emit them:

```rust
// Declaration
#[qsignal]
#[cxx_name = "dataReady"]
fn data_ready(self: Pin<&mut MyApp>, count: i32);

// Usage in method
self.as_mut().data_ready(42);
```

---

## QML Integration

### Importing Your Module

In QML files, import using the URI from `QmlModule::new()`:

```qml
import QtQuick 2.15
import QtQuick.Controls 2.15
import com.mycompany.myapp 1.0  // Your module URI

ApplicationWindow {
    visible: true
    width: 800
    height: 600
    title: "My App"

    // Instantiate the Rust QObject
    MyApp {
        id: myApp
        
        // React to signals
        onOperationComplete: function(success, message) {
            console.log("Operation result:", success, message)
        }
        
        onErrorOccurred: function(error) {
            errorDialog.text = error
            errorDialog.open()
        }
    }

    // Use properties and methods
    Button {
        text: myApp.isBusy ? "Working..." : "Start"
        enabled: !myApp.isBusy
        onClicked: myApp.doSomething("Hello!")
    }

    Label {
        text: myApp.statusMessage
    }

    ProgressBar {
        value: myApp.progress / 100.0
    }
}
```

### Accessing Resources

Resources added via `.qrc_resources()` are available at:
```
qrc:/qt/qml/<uri-as-path>/resources/<filename>
```

For example, with `QmlModule::new("com.mycompany.myapp")`:
```qml
Image {
    source: "qrc:/qt/qml/com/mycompany/myapp/resources/icon.svg"
}
```

---

## Main Entry Point

### Simple main.rs

```rust
// Hide console window on Windows in release builds
#![windows_subsystem = "windows"]

mod cxxqt_bridge;
// mod other_modules;

use cxx_qt_lib::{QGuiApplication, QQmlApplicationEngine, QUrl};

fn main() {
    // Optional: Set dark mode on Windows
    #[cfg(windows)]
    {
        std::env::set_var("QT_QPA_PLATFORM", "windows:darkmode=2");
    }
    
    // Initialize the Qt application
    let mut app = QGuiApplication::new();
    
    // Create the QML engine
    let mut engine = QQmlApplicationEngine::new();
    
    // Load the main QML file
    if let Some(engine) = engine.as_mut() {
        engine.load(&QUrl::from("qrc:/qt/qml/com/mycompany/myapp/qml/main.qml"));
    }
    
    // Run the application event loop
    if let Some(app) = app.as_mut() {
        app.exec();
    }
}
```

### With Debug Console Option

```rust
#![windows_subsystem = "windows"]

use cxx_qt_lib::{QGuiApplication, QQmlApplicationEngine, QUrl};

/// Allocate a console window on Windows for debug output
#[cfg(windows)]
fn maybe_attach_console() {
    let args: Vec<String> = std::env::args().collect();
    if args.iter().any(|a| a == "--debug" || a == "-d") {
        unsafe {
            #[link(name = "kernel32")]
            extern "system" {
                fn AllocConsole() -> i32;
            }
            AllocConsole();
        }
        eprintln!("=== Debug Mode Enabled ===");
    }
}

#[cfg(not(windows))]
fn maybe_attach_console() {}

fn main() {
    maybe_attach_console();
    
    // ... rest of initialization
}
```

---

## Properties and Signals

### Property Types

Common Qt types available in `cxx_qt_lib`:

| Qt Type | Rust Type | Notes |
|---------|-----------|-------|
| `QString` | `QString` | Unicode strings |
| `QStringList` | `QStringList` | List of strings |
| `bool` | `bool` | Boolean |
| `int` | `i32` | 32-bit integer |
| `double` | `f64` | 64-bit float |
| `QUrl` | `QUrl` | URLs and file paths |
| `QColor` | `QColor` | Colors |

### Working with QStringList

```rust
use cxx_qt_lib::QStringList;

// Create a new list
let mut list = QStringList::default();
list.append(QString::from("item1"));
list.append(QString::from("item2"));

// Get length
let count = list.len();

// Access items
if let Some(item) = list.get(0) {
    println!("First item: {}", item.to_string());
}

// Convert to Rust Vec
let items: Vec<String> = (0..list.len())
    .filter_map(|i| list.get(i).map(|s| s.to_string()))
    .collect();
```

### Auto-Generated Signals

Every `#[qproperty]` automatically gets a `<propertyName>Changed` signal:

```qml
MyApp {
    id: myApp
    
    // Automatically available:
    onStatusMessageChanged: console.log("Status changed:", statusMessage)
    onIsBusyChanged: console.log("Busy state:", isBusy)
    onProgressChanged: progressBar.value = progress / 100.0
}
```

---

## Threading and Background Work

CxxQt provides safe threading via the `Threading` trait.

### Enabling Threading

```rust
#[cxx_qt::bridge]
pub mod ffi {
    // ... QObject definition ...

    // Enable threading support
    impl cxx_qt::Threading for MyApp {}
}
```

### Background Work Pattern

```rust
impl ffi::MyApp {
    pub fn do_heavy_work(mut self: Pin<&mut Self>) {
        // Capture qt_thread handle (must be done on Qt thread)
        let qt_thread = self.qt_thread();
        
        // Set UI to busy state before spawning
        self.as_mut().set_is_busy(true);
        self.as_mut().set_progress(0);
        
        // Spawn background thread
        std::thread::spawn(move || {
            // Do heavy work here...
            for i in 0..100 {
                std::thread::sleep(std::time::Duration::from_millis(50));
                
                // Send progress update back to Qt thread
                let qt_clone = qt_thread.clone();
                let _ = qt_clone.queue(move |mut qobject| {
                    qobject.as_mut().set_progress(i);
                });
            }
            
            // Send final result back to Qt thread
            qt_thread.queue(move |mut qobject| {
                qobject.as_mut().set_is_busy(false);
                qobject.as_mut().set_progress(100);
                qobject.as_mut().operation_complete(
                    true,
                    QString::from("Work completed!")
                );
            }).expect("Failed to queue result");
        });
    }
}
```

### Cancellation Pattern

```rust
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

#[derive(Default)]
pub struct MyAppRust {
    // ... other fields ...
    cancel_flag: Arc<AtomicBool>,
}

impl ffi::MyApp {
    pub fn start_work(mut self: Pin<&mut Self>) {
        // Reset cancel flag
        self.as_ref().rust().cancel_flag.store(false, Ordering::SeqCst);
        
        let cancel_flag = self.as_ref().rust().cancel_flag.clone();
        let qt_thread = self.qt_thread();
        
        std::thread::spawn(move || {
            for i in 0..100 {
                // Check for cancellation
                if cancel_flag.load(Ordering::SeqCst) {
                    qt_thread.queue(move |mut qobject| {
                        qobject.as_mut().set_is_busy(false);
                        qobject.as_mut().set_status_message(QString::from("Cancelled"));
                    }).ok();
                    return;
                }
                
                // Do work...
                std::thread::sleep(std::time::Duration::from_millis(50));
            }
            
            // Completed
            qt_thread.queue(move |mut qobject| {
                qobject.as_mut().set_is_busy(false);
                qobject.as_mut().operation_complete(true, QString::from("Done"));
            }).ok();
        });
    }
    
    pub fn cancel_work(mut self: Pin<&mut Self>) {
        self.as_ref().rust().cancel_flag.store(true, Ordering::SeqCst);
    }
}
```

---

## Resources and Assets

### Windows Manifest (resources/app.manifest)

```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<assembly manifestVersion="1.0" xmlns="urn:schemas-microsoft-com:asm.v1">
  <assemblyIdentity
    name="com.mycompany.myapp"
    processorArchitecture="*"
    type="win32"
    version="1.0.0.0"/>
  <description>My Application</description>
  <dependency>
    <dependentAssembly>
      <assemblyIdentity
        language="*"
        name="Microsoft.Windows.Common-Controls"
        processorArchitecture="*"
        publicKeyToken="6595b64144ccf1df"
        type="win32"
        version="6.0.0.0"/>
    </dependentAssembly>
  </dependency>
  <application xmlns="urn:schemas-microsoft-com:asm.v3">
    <windowsSettings>
      <dpiAware xmlns="http://schemas.microsoft.com/SMI/2005/WindowsSettings">true/pm</dpiAware>
      <dpiAwareness xmlns="http://schemas.microsoft.com/SMI/2016/WindowsSettings">PerMonitorV2</dpiAwareness>
    </windowsSettings>
  </application>
</assembly>
```

### QML Language Server Config (.qmlls.ini)

For IDE support:

```ini
[General]
buildDir=target/debug
```

---

## Complete Example

Here's a minimal but complete CxxQt application:

### Cargo.toml

```toml
[package]
name = "hello-cxxqt"
version = "0.1.0"
edition = "2021"

[[bin]]
name = "hello-cxxqt"
path = "src/main.rs"

[dependencies]
cxx = "1.0.95"
cxx-qt = "0.8"
cxx-qt-lib = { version = "0.8", features = ["qt_full"] }

[build-dependencies]
cxx-qt-build = { version = "0.8", features = ["link_qt_object_files"] }
```

### build.rs

```rust
use cxx_qt_build::{CxxQtBuilder, QmlModule};

fn main() {
    CxxQtBuilder::new_qml_module(
        QmlModule::new("com.example.hello")
            .qml_files(["qml/main.qml"]),
    )
    .file("src/cxxqt_bridge.rs")
    .build();
}
```

### src/cxxqt_bridge.rs

```rust
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
        #[qproperty(QString, greeting)]
        #[qproperty(i32, counter)]
        type HelloApp = super::HelloAppRust;

        #[qinvokable]
        #[cxx_name = "incrementCounter"]
        fn increment_counter(self: Pin<&mut HelloApp>);

        #[qinvokable]
        #[cxx_name = "setName"]
        fn set_name(self: Pin<&mut HelloApp>, name: QString);
    }

    unsafe extern "RustQt" {
        #[qsignal]
        #[cxx_name = "counterReachedTen"]
        fn counter_reached_ten(self: Pin<&mut HelloApp>);
    }
}

#[derive(Default)]
pub struct HelloAppRust {
    greeting: QString,
    counter: i32,
    name: String,
}

impl ffi::HelloApp {
    pub fn increment_counter(mut self: Pin<&mut Self>) {
        let new_count = *self.as_ref().counter() + 1;
        self.as_mut().set_counter(new_count);
        
        // Update greeting
        let name = &self.as_ref().rust().name;
        let greeting = if name.is_empty() {
            format!("Hello! Count: {}", new_count)
        } else {
            format!("Hello, {}! Count: {}", name, new_count)
        };
        self.as_mut().set_greeting(QString::from(greeting.as_str()));
        
        // Emit signal when counter reaches 10
        if new_count == 10 {
            self.as_mut().counter_reached_ten();
        }
    }

    pub fn set_name(mut self: Pin<&mut Self>, name: QString) {
        self.as_mut().rust_mut().name = name.to_string();
        let greeting = format!("Hello, {}!", self.as_ref().rust().name);
        self.as_mut().set_greeting(QString::from(greeting.as_str()));
    }
}
```

### src/main.rs

```rust
#![windows_subsystem = "windows"]

mod cxxqt_bridge;

use cxx_qt_lib::{QGuiApplication, QQmlApplicationEngine, QUrl};

fn main() {
    let mut app = QGuiApplication::new();
    let mut engine = QQmlApplicationEngine::new();
    
    if let Some(engine) = engine.as_mut() {
        engine.load(&QUrl::from("qrc:/qt/qml/com/example/hello/qml/main.qml"));
    }
    
    if let Some(app) = app.as_mut() {
        app.exec();
    }
}
```

### qml/main.qml

```qml
import QtQuick 2.15
import QtQuick.Controls 2.15
import QtQuick.Layouts 1.15
import com.example.hello 1.0

ApplicationWindow {
    visible: true
    width: 400
    height: 300
    title: "Hello CxxQt"

    HelloApp {
        id: helloApp
        
        Component.onCompleted: {
            greeting = "Welcome! Click the button."
        }
        
        onCounterReachedTen: {
            celebrationLabel.visible = true
        }
    }

    ColumnLayout {
        anchors.centerIn: parent
        spacing: 20

        TextField {
            id: nameField
            placeholderText: "Enter your name"
            Layout.preferredWidth: 200
            onTextChanged: helloApp.setName(text)
        }

        Label {
            text: helloApp.greeting
            font.pixelSize: 18
            Layout.alignment: Qt.AlignHCenter
        }

        Button {
            text: "Click Me!"
            Layout.alignment: Qt.AlignHCenter
            onClicked: helloApp.incrementCounter()
        }

        Label {
            id: celebrationLabel
            text: "🎉 You reached 10! 🎉"
            font.pixelSize: 24
            visible: false
            Layout.alignment: Qt.AlignHCenter
        }
    }
}
```

---

## Best Practices

### 1. Naming Conventions

- Use `snake_case` for Rust field/method names
- Use `cxx_name` attribute for `camelCase` C++/QML names
- Keep property names consistent between Rust struct and `#[qproperty]`

### 2. Error Handling

- Store error messages in a property for QML display
- Emit error signals for important failures
- Never panic in methods called from Qt

```rust
pub fn load_file(mut self: Pin<&mut Self>, path: QString) {
    match std::fs::read_to_string(path.to_string()) {
        Ok(content) => {
            self.as_mut().set_content(QString::from(content.as_str()));
            self.as_mut().set_error_message(QString::default());
        }
        Err(e) => {
            self.as_mut().set_error_message(QString::from(e.to_string().as_str()));
            self.as_mut().error_occurred(QString::from(e.to_string().as_str()));
        }
    }
}
```

### 3. Threading Safety

- Always capture `qt_thread()` on the Qt thread before spawning
- Use `queue()` to send all updates back to Qt thread
- Use `Arc<AtomicBool>` for cancellation flags
- Never access Qt objects directly from worker threads

### 4. Library vs Binary Crate

For complex applications, use a library crate structure:

```rust
// src/lib.rs
pub mod cxxqt_bridge;
pub mod business_logic;
pub mod utils;

// Re-exports
pub use cxxqt_bridge::MyAppRust;
```

```rust
// src/main.rs
use my_app::cxxqt_bridge;
// ... rest of main
```

### 5. QML Component Organization

- Keep `main.qml` focused on window structure
- Extract reusable components to separate files
- Pass the bridge object as a required property:

```qml
// MyComponent.qml
Rectangle {
    required property var myApp  // Type is the bridge object
    
    Button {
        onClicked: myApp.doSomething()
    }
}
```

### 6. Initialize Trait for Default Values

Use the Initialize trait when Default::default() isn't sufficient:

```rust
#[cxx_qt::bridge]
pub mod ffi {
    // ... QObject definition ...
    
    impl cxx_qt::Initialize for MyApp {}
}

impl cxx_qt::Initialize for ffi::MyApp {
    fn initialize(mut self: Pin<&mut Self>) {
        // Called after construction, set proper initial values
        self.as_mut().set_some_property(QString::from("Initial value"));
        self.as_mut().set_dpi(72.0);
    }
}
```

---

## References

- [CxxQt Documentation](https://kdab.github.io/cxx-qt/book/)
- [CxxQt GitHub](https://github.com/KDAB/cxx-qt)
- [Qt QML Documentation](https://doc.qt.io/qt-6/qtqml-index.html)
- [cxx-qt-lib API](https://docs.rs/cxx-qt-lib)

---

## Project Examples in This Repository

- **ds-viewer-gui**: Complex viewer with threading, image providers, layer controls
  - Location: `ds-render/ds-viewer-gui/`
  - Features: Background rendering, progress reporting, cancellation, custom QQuickImageProvider

- **ds-converter-gui**: File converter with drag-drop, search, batch operations
  - Location: `ds-render/ds-converter-gui/`
  - Features: File handling, async search, settings persistence
