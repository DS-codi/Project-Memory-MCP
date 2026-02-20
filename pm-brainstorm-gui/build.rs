use cxx_qt_build::{CxxQtBuilder, QmlModule};

fn main() {
    CxxQtBuilder::new_qml_module(
        QmlModule::new("com.projectmemory.brainstorm")
            .qml_files([
                // Shared form components from pm-gui-forms
                "../pm-gui-forms/qml/RadioSelector.qml",
                "../pm-gui-forms/qml/QuestionCard.qml",
                "../pm-gui-forms/qml/FreeTextInput.qml",
                "../pm-gui-forms/qml/FormShell.qml",
                "../pm-gui-forms/qml/CountdownBar.qml",
                "../pm-gui-forms/qml/ConfirmRejectCard.qml",
                "../pm-gui-forms/qml/ActionButtons.qml",
                // Brainstorm-specific entry point
                "qml/main.qml",
            ]),
    )
    .file("src/cxxqt_bridge/mod.rs")
    .build();
}
