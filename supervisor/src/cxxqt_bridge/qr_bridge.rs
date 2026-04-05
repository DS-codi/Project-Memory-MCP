//! CXX-Qt bridge exposing QR-code pairing data to QML.
//!
//! `QrPairingBridge` is a QML element that provides:
//! - `pairingQrSvg` — SVG string of the QR code encoding
//!   `pmobile://<host>:<http_port>?key=<api_key>&ws_port=<ws_port>`
//! - `apiKeyText` — the raw API key for manual display
//! - `refreshPairingQr()` — regenerates the QR SVG (does not rotate the key;
//!   key rotation with persistence is a TODO for a follow-up)
//!
//! Before the QML engine loads `PairingDialog.qml`, the supervisor must call
//! `set_pairing_config()` from main.rs with the resolved port/key values.

use std::sync::{Mutex, OnceLock};

// ── Global pairing config ──────────────────────────────────────────────────────

struct PairingConfig {
    http_port: u16,
    ws_port: u16,
    api_key: String,
}

// Initialised once from main.rs after config loads and the API key is resolved.
static PAIRING_CONFIG: OnceLock<Mutex<PairingConfig>> = OnceLock::new();

/// Must be called from main.rs **before** the QML engine instantiates
/// `PairingDialog.qml`.  Safe to call from the Tokio background thread.
pub fn set_pairing_config(http_port: u16, ws_port: u16, api_key: String) {
    let _ = PAIRING_CONFIG.set(Mutex::new(PairingConfig {
        http_port,
        ws_port,
        api_key,
    }));
}

pub fn get_monitors_json() -> String {
    use windows_sys::Win32::Graphics::Gdi::{EnumDisplayMonitors, HMONITOR, HDC};
    use windows_sys::Win32::Foundation::{LPARAM, RECT, TRUE, BOOL};

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
    serde_json::to_string(&monitors).unwrap_or_else(|_| "[]".to_string())
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

// ── Helpers ────────────────────────────────────────────────────────────────────

fn get_hostname() -> String {
    // COMPUTERNAME is always set on Windows; HOSTNAME on Linux/macOS.
    std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .unwrap_or_else(|_| "localhost".to_string())
}

fn build_pairing_url(apps: &str, monitor: i32) -> String {
    let host = get_hostname();
    if let Some(lock) = PAIRING_CONFIG.get() {
        if let Ok(cfg) = lock.lock() {
            return format!(
                "pmobile://{}:{}?key={}&ws_port={}&apps={}&monitor={}",
                host, cfg.http_port, cfg.api_key, cfg.ws_port, apps, monitor
            );
        }
    }
    // Fallback: ports not yet set — produce a placeholder URL.
    format!("pmobile://{}:3464?key=&ws_port=3458&apps={}&monitor={}", host, apps, monitor)
}

fn get_api_key_display() -> String {
    if let Some(lock) = PAIRING_CONFIG.get() {
        if let Ok(cfg) = lock.lock() {
            return cfg.api_key.clone();
        }
    }
    "(not yet set)".to_string()
}

/// Generate an SVG string from the given URL using the `qrcode` crate.
fn generate_qr_svg(url: &str) -> String {
    use qrcode::render::svg;
    use qrcode::QrCode;

    match QrCode::new(url.as_bytes()) {
        Ok(code) => code
            .render::<svg::Color>()
            .min_dimensions(200, 200)
            .build(),
        Err(e) => {
            tracing::warn!("QR generation failed: {e}");
            // Return a minimal inline SVG error placeholder.
            // Hex color literals (#rrggbb) confuse the cxx-qt proc-macro scanner
            // when they appear inside raw string literals in bridge files.
            // Use rgb() equivalents to avoid the false-positive parse error.
            "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"200\" height=\"200\">\
  <rect width=\"200\" height=\"200\" fill=\"rgb(28,33,40)\"/>\
  <text x=\"100\" y=\"100\" fill=\"rgb(248,81,73)\" font-size=\"12\" text-anchor=\"middle\">QR Error</text>\
</svg>".to_string()
        }
    }
}

// ── CXX-Qt bridge ──────────────────────────────────────────────────────────────

#[cxx_qt::bridge]
pub mod ffi {
    unsafe extern "C++" {
        include!("cxx-qt-lib/qstring.h");
        type QString = cxx_qt_lib::QString;
    }

    unsafe extern "RustQt" {
        /// QML-exposed QObject providing QR pairing data.
        #[qobject]
        #[qml_element]
        /// SVG markup of the QR code encoding the pairing URL.
        #[qproperty(QString, pairing_qr_svg, cxx_name = "pairingQrSvg")]
        /// Raw API key string for manual display.
        #[qproperty(QString, api_key_text, cxx_name = "apiKeyText")]
        /// Random 6-digit PIN for alternative manual pairing.
        #[qproperty(QString, pairing_pin, cxx_name = "pairingPin")]
        type QrPairingBridge = super::QrPairingBridgeRust;

        /// Regenerate the QR SVG from the current pairing config.
        /// TODO: also rotate the API key and persist it to supervisor.toml.
        #[qinvokable]
        #[cxx_name = "refreshPairingQr"]
        fn refresh_pairing_qr(self: Pin<&mut QrPairingBridge>, apps: &QString, monitor: i32);
    }

    impl cxx_qt::Initialize for QrPairingBridge {}
}

pub struct QrPairingBridgeRust {
    pub pairing_qr_svg: cxx_qt_lib::QString,
    pub api_key_text: cxx_qt_lib::QString,
    pub pairing_pin: cxx_qt_lib::QString,
}

impl Default for QrPairingBridgeRust {
    fn default() -> Self {
        let url = build_pairing_url("terminal,files,dashboard,supervisor", 0);
        let svg = generate_qr_svg(&url);
        let key = get_api_key_display();
        Self {
            pairing_qr_svg: cxx_qt_lib::QString::from(svg.as_str()),
            api_key_text: cxx_qt_lib::QString::from(key.as_str()),
            pairing_pin: cxx_qt_lib::QString::default(),
        }
    }
}

impl cxx_qt::Initialize for ffi::QrPairingBridge {
    fn initialize(self: std::pin::Pin<&mut Self>) {
        // No additional initialization needed beyond the Default impl.
    }
}

impl ffi::QrPairingBridge {
    /// Rebuild the QR SVG from the current pairing config and push both
    /// `pairingQrSvg` and `apiKeyText` property-change signals to QML.
    fn refresh_pairing_qr(mut self: std::pin::Pin<&mut Self>, apps: &cxx_qt_lib::QString, monitor: i32) {
        let url = build_pairing_url(&apps.to_string(), monitor);
        let svg = generate_qr_svg(&url);
        let key = get_api_key_display();
        self.as_mut()
            .set_pairing_qr_svg(cxx_qt_lib::QString::from(svg.as_str()));
        self.as_mut()
            .set_api_key_text(cxx_qt_lib::QString::from(key.as_str()));
    }
}
