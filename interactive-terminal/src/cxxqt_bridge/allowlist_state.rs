//! Allowlist management for the Interactive Terminal GUI.
//!
//! Reads/writes `terminal-allowlist.json` in the same format used by the
//! server-side `terminal-auth.ts`, so changes made here are visible to the
//! MCP server and vice-versa.
//!
//! File location: `{data_root}/default/terminal-allowlist.json`
//! File format  : `{ "patterns": ["...", ...], "updated_at": "ISO-8601" }`

use super::AppState;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

/// Default built-in patterns that are always available even when no file exists.
pub(crate) const DEFAULT_PATTERNS: &[&str] = &[
    "git status",
    "git log",
    "git diff",
    "git branch",
    "git show",
    "npm test",
    "npm run build",
    "npm run lint",
    "npx tsc",
    "npx vitest",
    "npx jest",
    "ls",
    "dir",
    "cat",
    "type",
    "echo",
    "pwd",
    "Get-ChildItem",
    "Get-Content",
    "Get-Location",
    "node --version",
    "npm --version",
    "git --version",
];

const ALLOWLIST_FILENAME: &str = "terminal-allowlist.json";
const DEFAULT_WORKSPACE_ID: &str = "default";

#[derive(Serialize, Deserialize, Default)]
struct AllowlistFile {
    patterns: Vec<String>,
    #[serde(default)]
    updated_at: Option<String>,
}

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

/// Discover the project data root by walking up from the executable directory,
/// looking for a `data/workspace-registry.json` file.
fn discover_data_root() -> Option<PathBuf> {
    // Try the current working directory first.
    let cwd = std::env::current_dir().ok()?;
    for candidate in cwd.ancestors() {
        let data_dir = candidate.join("data");
        if data_dir.join("workspace-registry.json").exists() {
            return Some(data_dir);
        }
    }

    // Try the executable path.
    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            for candidate in exe_dir.ancestors() {
                let data_dir = candidate.join("data");
                if data_dir.join("workspace-registry.json").exists() {
                    return Some(data_dir);
                }
            }
        }
    }

    None
}

fn allowlist_file_path(data_root: &Path) -> PathBuf {
    data_root
        .join(DEFAULT_WORKSPACE_ID)
        .join(ALLOWLIST_FILENAME)
}

// ---------------------------------------------------------------------------
// File I/O (sync — called from GUI thread, patterns are small)
// ---------------------------------------------------------------------------

fn load_from_file(data_root: &Path) -> Option<Vec<String>> {
    let path = allowlist_file_path(data_root);
    let raw = std::fs::read_to_string(&path).ok()?;
    let data: AllowlistFile = serde_json::from_str(&raw).ok()?;
    let cleaned = sanitize_patterns(data.patterns);
    if cleaned.is_empty() {
        None
    } else {
        Some(cleaned)
    }
}

fn save_to_file(data_root: &Path, patterns: &[String]) -> Result<(), String> {
    let path = allowlist_file_path(data_root);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("failed to create allowlist directory: {e}"))?;
    }
    let secs_since_epoch = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    // Use a minimal RFC 3339–like string to avoid pulling in chrono.
    let updated_at = format!("{secs_since_epoch}");
    let file = AllowlistFile {
        patterns: patterns.to_vec(),
        updated_at: Some(updated_at),
    };
    let json = serde_json::to_string_pretty(&file)
        .map_err(|e| format!("failed to serialize allowlist: {e}"))?;
    std::fs::write(&path, &json).map_err(|e| format!("failed to write allowlist file: {e}"))
}

fn sanitize_patterns(raw: Vec<String>) -> Vec<String> {
    let mut seen = std::collections::HashSet::new();
    let mut result = Vec::new();
    for value in raw {
        let trimmed = value.trim().to_string();
        if trimmed.is_empty() {
            continue;
        }
        let key = trimmed.to_ascii_lowercase();
        if seen.insert(key) {
            result.push(trimmed);
        }
    }
    result
}

// ---------------------------------------------------------------------------
// AppState impl
// ---------------------------------------------------------------------------

impl AppState {
    /// Load the allowlist from disk (or fall back to defaults) and cache it.
    pub(crate) fn refresh_allowlist(&mut self) {
        if self.allowlist_data_root.is_none() {
            self.allowlist_data_root = discover_data_root();
        }

        if let Some(root) = &self.allowlist_data_root.clone() {
            if let Some(patterns) = load_from_file(root) {
                self.allowlist_patterns = patterns;
                return;
            }
        }

        // Fall back to built-in defaults.
        self.allowlist_patterns = DEFAULT_PATTERNS
            .iter()
            .map(|s| s.to_string())
            .collect();
    }

    /// Persist the current pattern list to disk.
    fn persist_allowlist(&self) -> Result<(), String> {
        let root = self
            .allowlist_data_root
            .as_ref()
            .ok_or_else(|| "data root not discovered; cannot persist allowlist".to_string())?;
        save_to_file(root, &self.allowlist_patterns)
    }

    /// Add a pattern. Returns an error string on validation failure or duplicate.
    pub(crate) fn add_allowlist_pattern(&mut self, pattern: &str) -> Result<(), String> {
        let trimmed = pattern.trim().to_string();
        if trimmed.is_empty() {
            return Err("pattern must not be empty".to_string());
        }

        let key = trimmed.to_ascii_lowercase();
        let exists = self
            .allowlist_patterns
            .iter()
            .any(|p| p.to_ascii_lowercase() == key);
        if exists {
            return Err(format!("pattern \"{trimmed}\" is already in the allowlist"));
        }

        self.allowlist_patterns.push(trimmed);
        self.persist_allowlist()
    }

    /// Remove a pattern. Returns an error if not found.
    pub(crate) fn remove_allowlist_pattern(&mut self, pattern: &str) -> Result<(), String> {
        let trimmed = pattern.trim();
        let key = trimmed.to_ascii_lowercase();

        let before = self.allowlist_patterns.len();
        self.allowlist_patterns
            .retain(|p| p.to_ascii_lowercase() != key);
        let after = self.allowlist_patterns.len();

        if before == after {
            return Err(format!("pattern \"{trimmed}\" not found in allowlist"));
        }

        self.persist_allowlist()
    }

    /// Serialize the current allowlist to a compact JSON array string.
    pub(crate) fn allowlist_patterns_to_json(&self) -> String {
        serde_json::to_string(&self.allowlist_patterns).unwrap_or_else(|_| "[]".to_string())
    }
}

// ---------------------------------------------------------------------------
// Pattern derivation (step 23 + 24)
// ---------------------------------------------------------------------------

/// Derive an exact and a generalized allowlist pattern from a saved command.
///
/// Returns `(exact_pattern, generalized_pattern, risk_hint)`.
///
/// * `exact_pattern` — the command string as-is (risk: "low")
/// * `generalized_pattern` — a widened pattern using a trailing `*` wildcard
///   (risk: "medium" for simple prefix, "high" for very broad patterns)
/// * `risk_hint` — one of "low", "medium", "high"
pub(crate) fn derive_allowlist_patterns(command: &str) -> (String, String, &'static str) {
    let trimmed = command.trim();

    if trimmed.is_empty() {
        return (String::new(), String::new(), "low");
    }

    // Split into tokens.
    let tokens: Vec<&str> = trimmed.splitn(3, ' ').collect();

    let exact = trimmed.to_string();

    match tokens.as_slice() {
        // Single-word command – no useful generalisation.
        [_cmd] => (exact.clone(), exact, "low"),

        // Two tokens — "cmd arg": generalize to "cmd *"
        [cmd, _arg] => {
            let general = format!("{cmd} *");
            (exact, general, "medium")
        }

        // Three or more tokens — "cmd sub_cmd rest…": generalize to "cmd sub_cmd *"
        [cmd, sub, _rest] => {
            let general = format!("{cmd} {sub} *");
            (exact, general, "medium")
        }

        // Should not happen given splitn(3), but handle gracefully.
        _ => (exact.clone(), exact, "low"),
    }
}
