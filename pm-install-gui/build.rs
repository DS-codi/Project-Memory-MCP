use cxx_qt_build::{CxxQtBuilder, QmlModule};

fn main() {
    CxxQtBuilder::new_qml_module(
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
    .file("src/cxxqt_bridge/mod.rs")
    .build();
}
