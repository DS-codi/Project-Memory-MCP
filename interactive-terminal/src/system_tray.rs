use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

const RUN_KEY_PATH: &str = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run";
const RUN_VALUE_NAME: &str = "InteractiveTerminal";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TraySettings {
    pub start_with_windows: bool,
}

impl Default for TraySettings {
    fn default() -> Self {
        Self {
            start_with_windows: false,
        }
    }
}

fn config_path() -> PathBuf {
    #[cfg(windows)]
    {
        if let Ok(app_data) = std::env::var("APPDATA") {
            return PathBuf::from(app_data)
                .join("ProjectMemory")
                .join("interactive-terminal")
                .join("tray-settings.json");
        }
    }

    std::env::current_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join(".interactive-terminal-tray-settings.json")
}

pub fn load_settings() -> TraySettings {
    let path = config_path();
    let Ok(raw) = fs::read_to_string(path) else {
        return TraySettings::default();
    };

    serde_json::from_str::<TraySettings>(&raw).unwrap_or_default()
}

pub fn save_settings(settings: &TraySettings) -> Result<(), String> {
    let path = config_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("failed to create tray settings directory: {error}"))?;
    }

    let payload = serde_json::to_string_pretty(settings)
        .map_err(|error| format!("failed to serialize tray settings: {error}"))?;

    fs::write(path, payload).map_err(|error| format!("failed to persist tray settings: {error}"))
}

fn startup_command(port: u16) -> Result<String, String> {
    let exe = std::env::current_exe()
        .map_err(|error| format!("failed to resolve executable path: {error}"))?;

    Ok(format!("\"{}\" --port {port}", exe.display()))
}

#[cfg(windows)]
fn set_start_with_windows_windows(enabled: bool, port: u16) -> Result<(), String> {
    use std::process::Command;

    if enabled {
        let command = startup_command(port)?;
        let output = Command::new("reg")
            .args([
                "add",
                RUN_KEY_PATH,
                "/v",
                RUN_VALUE_NAME,
                "/t",
                "REG_SZ",
                "/d",
                &command,
                "/f",
            ])
            .output()
            .map_err(|error| format!("failed to execute reg add: {error}"))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("failed to register startup key: {}", stderr.trim()));
        }

        return Ok(());
    }

    let output = Command::new("reg")
        .args([
            "delete",
            RUN_KEY_PATH,
            "/v",
            RUN_VALUE_NAME,
            "/f",
        ])
        .output()
        .map_err(|error| format!("failed to execute reg delete: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_ascii_lowercase();
        if !stderr.contains("unable to find") {
            return Err(format!(
                "failed to remove startup key: {}",
                String::from_utf8_lossy(&output.stderr).trim()
            ));
        }
    }

    Ok(())
}

pub fn set_start_with_windows(enabled: bool, port: u16) -> Result<(), String> {
    #[cfg(windows)]
    {
        set_start_with_windows_windows(enabled, port)
    }

    #[cfg(not(windows))]
    {
        let _ = enabled;
        let _ = port;
        Ok(())
    }
}

pub fn sync_startup_with_settings(port: u16) -> Result<TraySettings, String> {
    let settings = load_settings();
    if settings.start_with_windows {
        set_start_with_windows(true, port)?;
    }
    Ok(settings)
}
