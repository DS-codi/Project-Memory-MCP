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

    let mut builder = CxxQtBuilder::new_qml_module(
        QmlModule::new("com.projectmemory.installer")
            .qml_files([
                "qml/main.qml",
                "qml/WelcomePage.qml",
                "qml/PathSelectionPage.qml",
                "qml/ComponentSelectionPage.qml",
                "qml/ProgressPage.qml",
                "qml/FinishPage.qml",
                "../pm-gui-forms/qml/ActionButtons.qml",
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
