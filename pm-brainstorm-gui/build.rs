use cxx_qt_build::{CxxQtBuilder, QmlModule};
use std::path::Path;

fn resolve_qt_dir() -> String {
    if let Ok(qt_dir) = std::env::var("QT_DIR") {
        if !qt_dir.trim().is_empty() {
            return qt_dir;
        }
    }

    if let Ok(qmake_path) = std::env::var("QMAKE") {
        let qmake = Path::new(&qmake_path);
        if let Some(bin_dir) = qmake.parent() {
            if let Some(qt_dir) = bin_dir.parent() {
                return qt_dir.to_string_lossy().to_string();
            }
        }
    }

    panic!("Could not resolve Qt include root. Set QT_DIR or QMAKE.");
}

fn main() {
    #[cfg(windows)]
    {
        let mut res = winresource::WindowsResource::new();
        res.set_icon("resources/app_icon.ico");
        res.set_manifest_file("resources/app.manifest");
        res.compile().expect("Failed to compile Windows resources");
    }

    let manifest = std::env::var("CARGO_MANIFEST_DIR").unwrap();
    let src_dir = Path::new(&manifest).join("../pm-gui-forms/qml");
    let dst_dir = Path::new(&manifest).join("qml");

    // Copy shared QML files from pm-gui-forms into this crate's qml/ directory.
    // Direct ../relative paths in qml_files() produce un-normalized QRC aliases
    // (e.g. "brainstorm/../pm-gui-forms/qml/CountdownBar.qml") that Qt's resource
    // system cannot resolve via exact-string lookup — local copies avoid this.
    for file in &[
        "RadioSelector.qml",
        "QuestionCard.qml",
        "FreeTextInput.qml",
        "FormShell.qml",
        "CountdownBar.qml",
        "ConfirmRejectCard.qml",
        "ActionButtons.qml",
    ] {
        std::fs::copy(src_dir.join(file), dst_dir.join(file))
            .unwrap_or_else(|e| panic!("Failed to copy shared QML file {file}: {e}"));
        println!("cargo:rerun-if-changed=../pm-gui-forms/qml/{file}");
    }

    let mut builder = CxxQtBuilder::new_qml_module(
        QmlModule::new("com.projectmemory.brainstorm")
            .qml_files([
                "qml/RadioSelector.qml",
                "qml/QuestionCard.qml",
                "qml/FreeTextInput.qml",
                "qml/FormShell.qml",
                "qml/CountdownBar.qml",
                "qml/ConfirmRejectCard.qml",
                "qml/ActionButtons.qml",
                "qml/ChatPanel.qml",
                "qml/main.qml",
            ]),
    )
    .qrc_resources([
        "resources/app_icon.ico",
        "resources/app_icon.png",
        "resources/app_icon.svg",
    ])
    .file("src/cxxqt_bridge/mod.rs");

    #[cfg(windows)]
    {
        builder = unsafe {
            builder.cc_builder(|cc| {
                let qt_dir = resolve_qt_dir();
                cc.include(format!("{qt_dir}/include"));
                cc.include(format!("{qt_dir}/include/QtCore"));
                cc.include(format!("{qt_dir}/include/QtGui"));
                cc.file("src/app_icon.cpp");
            })
        };
    }

    builder.build();
}
