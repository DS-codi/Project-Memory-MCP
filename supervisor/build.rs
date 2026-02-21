#[cfg(feature = "supervisor_qml_gui")]
use cxx_qt_build::{CxxQtBuilder, QmlModule};

fn main() {
    #[cfg(not(feature = "supervisor_qml_gui"))]
    {
        return;
    }

    #[cfg(feature = "supervisor_qml_gui")]
    {
    CxxQtBuilder::new_qml_module(
        QmlModule::new("com.projectmemory.supervisor").qml_files(["qml/main.qml"]),
    )
    .file("src/cxxqt_bridge/mod.rs")
    .build();
    }
}