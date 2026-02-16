//! Runtime check for Qt DLL availability (Windows only).
//!
//! When the interactive terminal is built with `cargo build` without running
//! `build-interactive-terminal.ps1`, the Qt runtime DLLs will not be deployed
//! next to the executable. This module detects that condition early and panics
//! with a clear message instead of letting the process silently fail.

/// Verify that essential Qt runtime DLLs are present next to the executable.
///
/// On Windows, checks for `Qt6Core.dll` in the same directory as the running
/// binary.  Panics with an actionable error message if the DLL is absent.
///
/// On non-Windows platforms this is a no-op.
pub fn verify_qt_runtime() {
    #[cfg(windows)]
    {
        let exe_path = match std::env::current_exe() {
            Ok(p) => p,
            Err(e) => {
                eprintln!("Warning: could not determine executable path for Qt DLL check: {e}");
                return;
            }
        };

        let exe_dir = match exe_path.parent() {
            Some(d) => d,
            None => {
                eprintln!("Warning: executable path has no parent directory");
                return;
            }
        };

        let qt6core = exe_dir.join("Qt6Core.dll");
        if !qt6core.exists() {
            panic!(
                "Qt runtime DLLs not found (expected {} next to executable at {}). \
                 Run build-interactive-terminal.ps1 instead of bare `cargo build`.",
                qt6core.display(),
                exe_path.display(),
            );
        }
    }
}
