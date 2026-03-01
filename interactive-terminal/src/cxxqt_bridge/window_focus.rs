#[cfg(windows)]
pub(crate) fn focus_window() {
    use std::ptr;
    use windows_sys::Win32::System::Threading::{AttachThreadInput, GetCurrentThreadId};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        AllowSetForegroundWindow, GetForegroundWindow, GetWindowThreadProcessId,
        SetForegroundWindow, ASFW_ANY,
    };

    unsafe {
        let foreground = GetForegroundWindow();
        if foreground == ptr::null_mut() {
            let _ = AllowSetForegroundWindow(ASFW_ANY);
            return;
        }

        let current_thread = GetCurrentThreadId();
        let foreground_thread = GetWindowThreadProcessId(foreground, ptr::null_mut());

        if foreground_thread != 0 && foreground_thread != current_thread {
            let _ = AttachThreadInput(foreground_thread, current_thread, 1);
        }

        let _ = AllowSetForegroundWindow(ASFW_ANY);
        let _ = SetForegroundWindow(foreground);

        if foreground_thread != 0 && foreground_thread != current_thread {
            let _ = AttachThreadInput(foreground_thread, current_thread, 0);
        }
    }
}

#[cfg(not(windows))]
pub(crate) fn focus_window() {}
