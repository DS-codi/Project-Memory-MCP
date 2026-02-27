use cxx_qt_build::{CxxQtBuilder, QmlModule};

fn main() {
    CxxQtBuilder::new_qml_module(
        QmlModule::new("com.projectmemory.supervisor").qml_files(["qml/main.qml"]),
    )
    .file("src/cxxqt_bridge/mod.rs")
    .build();
}