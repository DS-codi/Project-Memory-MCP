use crate::protocol::{CommandRequest, ResponseStatus};
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize)]
pub struct PersistedOutputLine {
    pub timestamp_ms: u64,
    pub stream: String,
    pub text: String,
}

#[derive(Debug, Serialize)]
struct PersistedCommandOutput {
    request_id: String,
    command: String,
    working_directory: String,
    workspace_id: String,
    status: String,
    output_lines: Vec<PersistedOutputLine>,
    exit_code: Option<i32>,
    started_at: String,
    completed_at: String,
    duration_ms: u64,
}

pub fn now_epoch_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

pub fn write_command_output_file(
    request: &CommandRequest,
    status: &ResponseStatus,
    output_lines: &[PersistedOutputLine],
    exit_code: Option<i32>,
    started_at_ms: u64,
    completed_at_ms: u64,
) -> Result<String, String> {
    let workspace_path = request.workspace_path.trim();
    if workspace_path.is_empty() {
        return Err("workspace_path is empty; cannot persist terminal output".into());
    }

    let workspace_id = if request.workspace_id.trim().is_empty() {
        "unknown-workspace"
    } else {
        request.workspace_id.trim()
    };

    let output_dir = Path::new(workspace_path)
        .join(".projectmemory")
        .join("terminal-output")
        .join(workspace_id);

    fs::create_dir_all(&output_dir).map_err(|error| {
        format!(
            "Failed to create output directory {}: {error}",
            output_dir.to_string_lossy()
        )
    })?;

    let safe_request_id = sanitize_filename_component(&request.id);
    let filename = format!("{completed_at_ms}-{safe_request_id}.json");
    let output_path = output_dir.join(filename);

    let payload = PersistedCommandOutput {
        request_id: request.id.clone(),
        command: request.command.clone(),
        working_directory: request.working_directory.clone(),
        workspace_id: workspace_id.to_string(),
        status: response_status_to_string(status),
        output_lines: output_lines.to_vec(),
        exit_code,
        started_at: started_at_ms.to_string(),
        completed_at: completed_at_ms.to_string(),
        duration_ms: completed_at_ms.saturating_sub(started_at_ms),
    };

    let serialized = serde_json::to_string_pretty(&payload)
        .map_err(|error| format!("Failed to serialize output payload: {error}"))?;

    fs::write(&output_path, serialized).map_err(|error| {
        format!(
            "Failed to write output file {}: {error}",
            output_path.to_string_lossy()
        )
    })?;

    prune_old_output_files(&output_dir, 10)?;

    Ok(output_path.to_string_lossy().to_string())
}

fn prune_old_output_files(output_dir: &Path, keep_latest: usize) -> Result<(), String> {
    let mut files: Vec<PathBuf> = fs::read_dir(output_dir)
        .map_err(|error| {
            format!(
                "Failed to read output directory {}: {error}",
                output_dir.to_string_lossy()
            )
        })?
        .filter_map(|entry| entry.ok().map(|item| item.path()))
        .filter(|path| {
            path.is_file()
                && path
                    .extension()
                    .map(|extension| extension.eq_ignore_ascii_case("json"))
                    .unwrap_or(false)
        })
        .collect();

    files.sort_by(|left, right| {
        extract_timestamp_from_path(right)
            .cmp(&extract_timestamp_from_path(left))
            .then_with(|| right.cmp(left))
    });

    if files.len() <= keep_latest {
        return Ok(());
    }

    for old_file in files.iter().skip(keep_latest) {
        fs::remove_file(old_file).map_err(|error| {
            format!(
                "Failed to remove old output file {}: {error}",
                old_file.to_string_lossy()
            )
        })?;
    }

    Ok(())
}

fn extract_timestamp_from_path(path: &Path) -> u64 {
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or_default();

    let prefix = file_name.split('-').next().unwrap_or_default();
    prefix.parse::<u64>().unwrap_or(0)
}

fn sanitize_filename_component(input: &str) -> String {
    let sanitized: String = input
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || character == '-' || character == '_' {
                character
            } else {
                '_'
            }
        })
        .collect();

    if sanitized.is_empty() {
        "request".to_string()
    } else {
        sanitized
    }
}

fn response_status_to_string(status: &ResponseStatus) -> String {
    match status {
        ResponseStatus::Approved => "approved",
        ResponseStatus::Declined => "declined",
        ResponseStatus::Timeout => "timeout",
    }
    .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::protocol::{CommandRequest, TerminalProfile};
    use std::collections::HashMap;

    fn make_request(temp_dir: &Path) -> CommandRequest {
        CommandRequest {
            id: "req_001".to_string(),
            command: "echo hello".to_string(),
            working_directory: temp_dir.to_string_lossy().to_string(),
            context: "test".to_string(),
            session_id: "default".to_string(),
            terminal_profile: TerminalProfile::System,
            workspace_path: temp_dir.to_string_lossy().to_string(),
            venv_path: String::new(),
            activate_venv: false,
            timeout_seconds: 30,
            args: vec![],
            env: HashMap::new(),
            workspace_id: "ws_test".to_string(),
            allowlisted: false,
        }
    }

    fn test_dir(name: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!(
            "interactive-terminal-output-tests-{}-{}",
            name,
            now_epoch_millis()
        ));
        let _ = fs::create_dir_all(&root);
        root
    }

    #[test]
    fn writes_structured_output_file() {
        let dir = test_dir("write");
        let request = make_request(&dir);

        let lines = vec![
            PersistedOutputLine {
                timestamp_ms: 100,
                stream: "stdout".to_string(),
                text: "hello".to_string(),
            },
            PersistedOutputLine {
                timestamp_ms: 101,
                stream: "stderr".to_string(),
                text: "warn".to_string(),
            },
        ];

        let path = write_command_output_file(
            &request,
            &ResponseStatus::Approved,
            &lines,
            Some(0),
            100,
            250,
        )
        .expect("write should succeed");

        let raw = fs::read_to_string(path).expect("file should be readable");
        assert!(raw.contains("\"request_id\": \"req_001\""));
        assert!(raw.contains("\"workspace_id\": \"ws_test\""));
        assert!(raw.contains("\"duration_ms\": 150"));

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn keeps_only_latest_ten_files() {
        let dir = test_dir("retention");
        let request = make_request(&dir);
        let lines = vec![PersistedOutputLine {
            timestamp_ms: 1,
            stream: "stdout".to_string(),
            text: "line".to_string(),
        }];

        for index in 0..12 {
            let started = 1000 + index;
            let completed = 2000 + index;
            write_command_output_file(
                &request,
                &ResponseStatus::Approved,
                &lines,
                Some(0),
                started,
                completed,
            )
            .expect("write should succeed");
        }

        let output_dir = dir
            .join(".projectmemory")
            .join("terminal-output")
            .join("ws_test");

        let json_count = fs::read_dir(output_dir)
            .expect("dir should exist")
            .filter_map(|entry| entry.ok().map(|item| item.path()))
            .filter(|path| path.extension().and_then(|ext| ext.to_str()) == Some("json"))
            .count();

        assert_eq!(json_count, 10);

        let _ = fs::remove_dir_all(dir);
    }
}
