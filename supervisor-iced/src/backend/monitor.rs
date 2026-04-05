use windows_sys::Win32::Graphics::Gdi::{EnumDisplayMonitors, HMONITOR, HDC};
use windows_sys::Win32::Foundation::{LPARAM, RECT, TRUE, BOOL};

pub fn get_monitors() -> Vec<String> {
    let mut monitors = Vec::new();
    unsafe {
        EnumDisplayMonitors(
            0,
            std::ptr::null(),
            Some(enumerate_callback),
            &mut monitors as *mut Vec<String> as LPARAM,
        );
    }
    if monitors.is_empty() {
        monitors.push("Default Monitor".to_string());
    }
    monitors
}

unsafe extern "system" fn enumerate_callback(
    hmonitor: HMONITOR,
    _hdc: HDC,
    _rect: *mut RECT,
    lparam: LPARAM,
) -> BOOL {
    let monitors = &mut *(lparam as *mut Vec<String>);
    monitors.push(format!("Monitor {}", hmonitor));
    TRUE
}
