use cxx_qt_lib::QString;
use std::pin::Pin;

/// Rust struct backing the InstallWizard QObject.
pub struct InstallWizardRust {
    pub(crate) install_path: QString,
    pub(crate) data_path: QString,
    pub(crate) is_installing: bool,
    pub(crate) progress: f32,
    pub(crate) status_text: QString,
    pub(crate) error_message: QString,
    pub(crate) is_finished: bool,
}

impl Default for InstallWizardRust {
    fn default() -> Self {
        Self {
            install_path: QString::from(""),
            data_path: QString::from(""),
            is_installing: false,
            progress: 0.0,
            status_text: QString::from("Ready"),
            error_message: QString::from(""),
            is_finished: false,
        }
    }
}

#[cxx_qt::bridge]
pub mod ffi {
    unsafe extern "C++" {
        include!("cxx-qt-lib/qstring.h");
        type QString = cxx_qt_lib::QString;
    }

    unsafe extern "RustQt" {
        #[qobject]
        #[qml_element]
        #[qproperty(QString, install_path, cxx_name = "installPath")]
        #[qproperty(QString, data_path, cxx_name = "dataPath")]
        #[qproperty(bool, is_installing, cxx_name = "isInstalling")]
        #[qproperty(f32, progress)]
        #[qproperty(QString, status_text, cxx_name = "statusText")]
        #[qproperty(QString, error_message, cxx_name = "errorMessage")]
        #[qproperty(bool, is_finished, cxx_name = "isFinished")]
        type InstallWizard = super::InstallWizardRust;

        #[qinvokable]
        #[cxx_name = "startInstall"]
        fn start_install(self: Pin<&mut InstallWizard>);

        #[qinvokable]
        #[cxx_name = "updateSimulation"]
        fn update_simulation(self: Pin<&mut InstallWizard>);

        #[qinvokable]
        #[cxx_name = "selectPath"]
        fn select_path(self: Pin<&mut InstallWizard>, title: QString) -> QString;
    }
}

impl ffi::InstallWizard {
    pub fn start_install(mut self: Pin<&mut Self>) {
        self.set_is_installing(true);
        self.set_progress(0.0);
        self.set_status_text(QString::from("Initializing..."));
    }

    pub fn update_simulation(mut self: Pin<&mut Self>) {
        let current = self.progress();
        if current < 100.0 {
            let next = current + 0.5;
            self.set_progress(next);
            
            if next < 30.0 {
                self.set_status_text(QString::from("Building components (Supervisor, Server)..."));
            } else if next < 60.0 {
                self.set_status_text(QString::from("Deploying binaries and runtime DLLs..."));
            } else if next < 90.0 {
                self.set_status_text(QString::from("Configuring PM_DATA_ROOT and PATH..."));
            } else {
                self.set_status_text(QString::from("Finishing setup..."));
            }

            if next >= 100.0 {
                self.set_is_finished(true);
            }
        }
    }

    pub fn select_path(self: Pin<&mut Self>, _title: QString) -> QString {
        QString::from("")
    }
}
