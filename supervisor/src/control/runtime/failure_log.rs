use std::fs::OpenOptions;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

const FAILURE_LOG_FILE: &str = "tool-call-failures.ndjson";
const DEFAULT_MAX_FAILURE_LOG_LINES: usize = 500;

pub async fn append_failed_tool_call(
    payload: &serde_json::Value,
    error_message: &str,
    error_envelope: &serde_json::Value,
) -> std::io::Result<PathBuf> {
    let workspace_root = resolve_workspace_root(payload).unwrap_or_else(|| {
        std::env::current_dir()
            .unwrap_or_else(|_| PathBuf::from("."))
    });

    let projectmemory_dir = workspace_root.join(".projectmemory");
    std::fs::create_dir_all(&projectmemory_dir)?;

    let log_path = projectmemory_dir.join(FAILURE_LOG_FILE);
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)?;

    let timestamp_unix_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);

    let record = serde_json::json!({
        "timestamp_unix_ms": timestamp_unix_ms,
        "source": "supervisor.mcp_runtime_exec",
        "workspace_root": workspace_root.to_string_lossy().to_string(),
        "workspace_id": extract_optional_string(payload, &["runtime", "workspace_id"]) 
            .or_else(|| extract_optional_string(payload, &["workspace_id"])),
        "runtime_session_id": extract_optional_string(payload, &["runtime", "session_id"]),
        "request_id": extract_optional_string(payload, &["correlation", "request_id"]),
        "trace_id": extract_optional_string(payload, &["correlation", "trace_id"]),
        "runtime_op": extract_optional_string(payload, &["runtime", "op"]),
        "action": extract_optional_string(payload, &["action"]),
        "error": {
            "message": error_message,
            "envelope": error_envelope,
        },
        "payload": payload,
    });

    writeln!(file, "{}", serde_json::to_string(&record).unwrap_or_else(|_| "{}".to_string()))?;
    drop(file);

    let _ = trim_failure_log(&log_path, failure_log_max_lines());

    Ok(log_path)
}

fn failure_log_max_lines() -> usize {
    std::env::var("PM_TOOL_FAILURE_LOG_MAX_LINES")
        .ok()
        .and_then(|raw| raw.trim().parse::<usize>().ok())
        .filter(|value| *value > 0)
        .unwrap_or(DEFAULT_MAX_FAILURE_LOG_LINES)
}

fn trim_failure_log(path: &Path, max_lines: usize) -> std::io::Result<()> {
    if max_lines == 0 {
        return Ok(());
    }

    let content = std::fs::read_to_string(path)?;
    let lines: Vec<&str> = content
        .lines()
        .filter(|line| !line.trim().is_empty())
        .collect();

    if lines.len() <= max_lines {
        return Ok(());
    }

    let start = lines.len() - max_lines;
    let trimmed = lines[start..].join("\n");
    std::fs::write(path, format!("{trimmed}\n"))
}

fn resolve_workspace_root(payload: &serde_json::Value) -> Option<PathBuf> {
    for key_path in [
        &["runtime", "workspace_path"][..],
        &["workspace_path"][..],
    ] {
        if let Some(s) = extract_optional_string(payload, key_path) {
            if !s.trim().is_empty() {
                let normalized = absolutize(PathBuf::from(s));
                if let Some(found_root) = find_workspace_root_with_projectmemory(&normalized) {
                    return Some(found_root);
                }
                return Some(normalized);
            }
        }
    }

    for key_path in [&["runtime", "cwd"][..], &["cwd"][..]] {
        if let Some(s) = extract_optional_string(payload, key_path) {
            if !s.trim().is_empty() {
                let normalized = absolutize(PathBuf::from(s));

                if let Some(found_root) = find_workspace_root_with_projectmemory(&normalized) {
                    return Some(found_root);
                }

                if let Some(inferred_root) = infer_workspace_root_from_cwd(&normalized) {
                    return Some(inferred_root);
                }

                return Some(normalized);
            }
        }
    }

    if let Ok(from_env) = std::env::var("PM_WORKSPACE_PATH") {
        if !from_env.trim().is_empty() {
            let normalized = absolutize(PathBuf::from(from_env));

            if let Some(found_root) = find_workspace_root_with_projectmemory(&normalized) {
                return Some(found_root);
            }

            if normalized.exists() {
                return Some(normalized);
            }
        }
    }

    None
}

fn infer_workspace_root_from_cwd(cwd: &Path) -> Option<PathBuf> {
    let dir = if cwd.is_dir() {
        cwd
    } else {
        cwd.parent()?
    };

    let name = dir.file_name().and_then(|n| n.to_str()).map(|n| n.to_ascii_lowercase());
    let should_use_parent = matches!(
        name.as_deref(),
        Some(
            "server"
                | "dashboard"
                | "supervisor"
                | "container"
                | "interactive-terminal"
                | "vscode-extension"
                | "pm-approval-gui"
                | "pm-brainstorm-gui"
        )
    );

    if should_use_parent {
        return dir.parent().map(Path::to_path_buf);
    }

    Some(dir.to_path_buf())
}

fn find_workspace_root_with_projectmemory(path: &Path) -> Option<PathBuf> {
    let mut current = if path.is_dir() {
        path.to_path_buf()
    } else {
        path.parent()?.to_path_buf()
    };

    loop {
        let identity = current.join(".projectmemory").join("identity.json");
        if identity.exists() {
            return Some(current);
        }

        if !current.pop() {
            break;
        }
    }

    None
}

fn absolutize(path: PathBuf) -> PathBuf {
    if path.is_absolute() {
        return path;
    }

    std::env::current_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join(path)
}

fn extract_optional_string(payload: &serde_json::Value, path: &[&str]) -> Option<String> {
    let mut cursor = payload;
    for key in path {
        cursor = cursor.get(*key)?;
    }
    cursor.as_str().map(|s| s.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_workspace_root_prefers_payload_cwd_with_projectmemory_ancestor() {
        let temp = tempfile::tempdir().expect("tempdir");
        let workspace_root = temp.path().join("workspace");
        let nested = workspace_root.join("server").join("src");
        let projectmemory = workspace_root.join(".projectmemory");

        std::fs::create_dir_all(&projectmemory).expect("mk .projectmemory");
        std::fs::write(projectmemory.join("identity.json"), "{}")
            .expect("write identity marker");
        std::fs::create_dir_all(&nested).expect("mk nested");

        let payload = serde_json::json!({
            "runtime": {
                "cwd": nested.to_string_lossy().to_string()
            }
        });

        let resolved = resolve_workspace_root(&payload).expect("resolved workspace root");
        assert_eq!(resolved, workspace_root);
    }

    #[test]
    fn trim_failure_log_keeps_newest_lines_only() {
        let temp = tempfile::tempdir().expect("tempdir");
        let log_path = temp.path().join("tool-call-failures.ndjson");

        let content = [
            r#"{"id":1}"#,
            r#"{"id":2}"#,
            r#"{"id":3}"#,
            r#"{"id":4}"#,
            r#"{"id":5}"#,
        ]
        .join("\n");

        std::fs::write(&log_path, format!("{content}\n")).expect("write log seed");
        trim_failure_log(&log_path, 3).expect("trim log");

        let after = std::fs::read_to_string(&log_path).expect("read trimmed log");
        let ids: Vec<i32> = after
            .lines()
            .map(|line| {
                serde_json::from_str::<serde_json::Value>(line)
                    .expect("line should be json")["id"]
                    .as_i64()
                    .expect("id should be i64") as i32
            })
            .collect();

        assert_eq!(ids, vec![3, 4, 5]);
    }

    #[test]
    fn resolve_workspace_root_infers_parent_for_known_service_cwd() {
        let temp = tempfile::tempdir().expect("tempdir");
        let workspace_root = temp.path().join("workspace");
        let server_dir = workspace_root.join("server");

        std::fs::create_dir_all(&server_dir).expect("mk server dir");

        let payload = serde_json::json!({
            "runtime": {
                "cwd": server_dir.to_string_lossy().to_string()
            }
        });

        let resolved = resolve_workspace_root(&payload).expect("resolved workspace root");
        assert_eq!(resolved, workspace_root);
    }
}
