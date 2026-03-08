use cxx_qt_build::{CxxQtBuilder, QmlModule};
use std::path::Path;

fn main() {
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

    CxxQtBuilder::new_qml_module(
        QmlModule::new("com.projectmemory.brainstorm")
            .qml_files([
                "qml/RadioSelector.qml",
                "qml/QuestionCard.qml",
                "qml/FreeTextInput.qml",
                "qml/FormShell.qml",
                "qml/CountdownBar.qml",
                "qml/ConfirmRejectCard.qml",
                "qml/ActionButtons.qml",
                "qml/main.qml",
            ]),
    )
    .file("src/cxxqt_bridge/mod.rs")
    .build();
}
