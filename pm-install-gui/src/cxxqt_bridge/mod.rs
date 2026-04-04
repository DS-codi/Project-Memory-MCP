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
    /// Whether to run the global Claude Code integration step during install.
    pub(crate) global_claude: bool,
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
            global_claude: true,
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
        #[qproperty(bool, global_claude, cxx_name = "globalClaude")]
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
        self.as_mut().set_is_installing(true);
        self.as_mut().set_progress(0.0);
        self.as_mut().set_status_text(QString::from("Initializing..."));

        // Run the global Claude Code integration step immediately if selected.
        // This is fast (file copies + JSON edits, ~1s) so blocking here is acceptable.
        if *self.as_ref().global_claude() {
            self.as_mut().set_status_text(QString::from("Registering Claude Code integration..."));
            run_global_claude_install();
        }
    }

    pub fn update_simulation(mut self: Pin<&mut Self>) {
        let current = *self.as_ref().progress();
        if current < 100.0 {
            let next = current + 0.5;
            self.as_mut().set_progress(next);

            if next < 30.0 {
                self.as_mut().set_status_text(QString::from("Building components (Supervisor, Server)..."));
            } else if next < 60.0 {
                self.as_mut().set_status_text(QString::from("Deploying binaries and runtime DLLs..."));
            } else if next < 90.0 {
                self.as_mut().set_status_text(QString::from("Configuring PM_DATA_ROOT and PATH..."));
            } else {
                self.as_mut().set_status_text(QString::from("Finishing setup..."));
            }

            if next >= 100.0 {
                self.as_mut().set_is_finished(true);
            }
        }
    }

    pub fn select_path(self: Pin<&mut Self>, _title: QString) -> QString {
        QString::from("")
    }

}

/// Locate the project root relative to this binary and invoke the global
/// Claude install PowerShell script. Runs synchronously; errors are logged
/// to stderr but do not abort the wizard.
fn run_global_claude_install() {
    // Binary is at <root>/target/{profile}/pm-install-gui.exe — walk up to root.
    let exe = match std::env::current_exe() {
        Ok(p) => p,
        Err(e) => { eprintln!("[global-claude] could not locate exe: {e}"); return; }
    };
    // exe -> target/<profile>/pm-install-gui.exe; parent×2 = target, parent×3 = root
    let project_root = match exe.parent().and_then(|p| p.parent()).and_then(|p| p.parent()) {
        Some(p) => p.to_path_buf(),
        None => { eprintln!("[global-claude] could not resolve project root from {:?}", exe); return; }
    };

    let script = project_root.join("scripts").join("install-global-claude.ps1");
    if !script.exists() {
        eprintln!("[global-claude] script not found: {:?}", script);
        return;
    }

    let status = std::process::Command::new("powershell")
        .args([
            "-NoProfile",
            "-ExecutionPolicy", "Bypass",
            "-File", script.to_str().unwrap_or(""),
            "-SkipAutostart",
        ])
        .status();

    match status {
        Ok(s) if s.success() => eprintln!("[global-claude] install-global-claude.ps1 completed OK"),
        Ok(s) => eprintln!("[global-claude] install-global-claude.ps1 exited with {s}"),
        Err(e) => eprintln!("[global-claude] failed to launch powershell: {e}"),
    }
}
