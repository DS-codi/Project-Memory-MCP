use crate::protocol::SavedCommandRecord;
use crate::protocol::TerminalProfile;
use crate::saved_commands::SavedCommand;
use std::time::{SystemTime, UNIX_EPOCH};

pub(crate) fn monotonic_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}

pub(crate) fn timestamp_now() -> String {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    format!("{}.{:03}Z", now.as_secs(), now.subsec_millis())
}

pub(crate) fn saved_command_to_record(command: SavedCommand) -> SavedCommandRecord {
    SavedCommandRecord {
        id: command.id,
        name: command.name,
        command: command.command,
        created_at: command.created_at,
        updated_at: command.updated_at,
        last_used_at: command.last_used_at,
    }
}

pub(crate) fn terminal_profile_to_key(profile: &TerminalProfile) -> &'static str {
    match profile {
        TerminalProfile::PowerShell => "powershell",
        TerminalProfile::Pwsh => "pwsh",
        TerminalProfile::Cmd => "cmd",
        TerminalProfile::Bash => "bash",
        TerminalProfile::System => "system",
    }
}

pub(crate) fn terminal_profile_from_key(value: &str) -> Option<TerminalProfile> {
    match value.trim().to_ascii_lowercase().as_str() {
        "powershell" => Some(TerminalProfile::PowerShell),
        "pwsh" => Some(TerminalProfile::Pwsh),
        "cmd" => Some(TerminalProfile::Cmd),
        "bash" => Some(TerminalProfile::Bash),
        "system" => Some(TerminalProfile::System),
        _ => None,
    }
}
