use cxx_qt_build::{CxxQtBuilder, QmlModule};

fn main() {
    #[cfg(windows)]
    {
        let mut res = winresource::WindowsResource::new();
        res.set_icon("resources/itpm-icon.ico");
        res.set_manifest_file("resources/app.manifest");
        res.compile().expect("Failed to compile Windows resources");
    }

    CxxQtBuilder::new_qml_module(
        QmlModule::new("com.projectmemory.terminal")
            .qml_files([
                "qml/main.qml",
                "qml/CommandCard.qml",
                "qml/DeclineDialog.qml",
                "qml/OutputView.qml",
            ]),
    )
    .file("src/cxxqt_bridge/ffi.rs")
    .build();
}
