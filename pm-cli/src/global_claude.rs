// global_claude.rs — Native Rust implementation of the Global Claude Code install step.
//
// Performs the same operations as scripts/install-global-claude.ps1 without
// shelling out to PowerShell:
//
//   1. Copies mandatory agent files from agents/ to ~/.claude/agents/
//   2. Registers project-memory-cli and project-memory MCP servers in
//      ~/.claude/settings.json
//   3. Adds all mcp__project-memory*__ tool permissions to the allowlist
//   4. Registers supervisor-iced as a Windows Task Scheduler logon task
//
// Called from command_registry::dispatch("global-claude", …) which is in turn
// spawned as a subprocess by run_build_phase so its stdout is streamed live
// into the TUI progress view.

use std::path::{Path, PathBuf};

// ---------------------------------------------------------------------------
// build_args — returns the argv for run_build_phase to spawn
// ---------------------------------------------------------------------------

/// Returns the command vector that run_build_phase should spawn:
/// `[<current_exe>, "global-claude"]`
///
/// Using the current exe path means this works from any working directory
/// without requiring pm-cli to be on PATH.
pub fn build_args() -> Vec<String> {
    let exe = std::env::current_exe()
        .unwrap_or_else(|_| PathBuf::from("pm-cli"))
        .to_string_lossy()
        .to_string();
    vec![exe, "global-claude".to_string()]
}

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

/// Resolves the project root from the running binary location.
/// Expected: <root>/target/{release,debug}/pm-cli[.exe]
fn project_root() -> PathBuf {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().and_then(|p| p.parent()).map(|p| p.to_path_buf()))
        .unwrap_or_else(|| PathBuf::from("."))
}

/// Returns `~/.claude`.
fn claude_dir() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".claude")
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AGENT_FILES: &[&str] = &[
    "hub.agent.md",
    "prompt-analyst.agent.md",
    "shell.agent.md",
    "architect.agent.md",
    "hub-claude.agent.md",
    "prompt-analyst-claude.agent.md",
    "shell-claude.agent.md",
];

/// Each MCP server entry: (name, upstream_mcp_url).
/// Written as stdio entries pointing at client-proxy.exe so sessions have
/// graceful degradation when the supervisor is restarting.
const MCP_SERVERS: &[(&str, &str)] = &[
    ("project-memory-cli",    "http://127.0.0.1:3466/mcp"),
    ("project-memory",        "http://127.0.0.1:3457/mcp"),
    ("project-memory-claude", "http://127.0.0.1:3467/mcp"),
];

const ALLOWLIST_TOOLS: &[&str] = &[
    "mcp__project-memory-cli__memory_agent",
    "mcp__project-memory-cli__memory_plan",
    "mcp__project-memory-cli__memory_session",
    "mcp__project-memory-cli__memory_filesystem",
    "mcp__project-memory-cli__memory_steps",
    "mcp__project-memory-cli__memory_workspace",
    "mcp__project-memory-cli__memory_context",
    "mcp__project-memory-cli__memory_cartographer",
    "mcp__project-memory-cli__memory_brainstorm",
    "mcp__project-memory-cli__memory_instructions",
    "mcp__project-memory-cli__memory_sprint",
    "mcp__project-memory-cli__memory_terminal",
    "mcp__project-memory-cli__memory_task",
    "mcp__project-memory-cli__runtime_mode",
    "mcp__project-memory-cli__ping",
    "mcp__project-memory__memory_agent",
    "mcp__project-memory__memory_plan",
    "mcp__project-memory__memory_session",
    "mcp__project-memory__memory_filesystem",
    "mcp__project-memory__memory_steps",
    "mcp__project-memory__memory_workspace",
    "mcp__project-memory__memory_context",
    "mcp__project-memory__memory_cartographer",
    "mcp__project-memory__memory_brainstorm",
    "mcp__project-memory__memory_instructions",
    "mcp__project-memory__memory_sprint",
    "mcp__project-memory__memory_terminal",
    "mcp__project-memory__memory_task",
    "mcp__project-memory__runtime_mode",
    "mcp__project-memory__ping",
    "mcp__project-memory-claude__memory_agent",
    "mcp__project-memory-claude__memory_plan",
    "mcp__project-memory-claude__memory_session",
    "mcp__project-memory-claude__memory_steps",
    "mcp__project-memory-claude__memory_workspace",
    "mcp__project-memory-claude__memory_context",
    "mcp__project-memory-claude__memory_cartographer",
    "mcp__project-memory-claude__memory_instructions",
    "mcp__project-memory-claude__memory_sprint",
    "mcp__project-memory-claude__memory_terminal",
    "mcp__project-memory-claude__memory_task",
    "mcp__project-memory-claude__runtime_mode",
    "mcp__project-memory-claude__ping",
];

// ---------------------------------------------------------------------------
// Public entry points
// ---------------------------------------------------------------------------

/// Read-only status check.  Prints per-item state without making any changes.
/// Exit code semantics: Ok(true) = fully installed, Ok(false) = partially/not installed.
pub fn status() -> Result<bool, String> {
    let root      = project_root();
    let claude_dir = claude_dir();

    println!("-- Global Claude Code install status");
    println!();

    let agents_ok    = check_agents(&root, &claude_dir);
    let servers_ok   = check_mcp_servers(&claude_dir)?;
    let autostart_ok = check_autostart();

    println!();
    if agents_ok && servers_ok && autostart_ok {
        println!("[ok] Fully installed — nothing to do.");
        Ok(true)
    } else {
        println!("[!!] Incomplete — run `pm-cli global-claude` to install missing pieces.");
        Ok(false)
    }
}

/// Runs the full global Claude Code install, printing progress to stdout.
/// All output is suitable for streaming in the TUI via run_build_phase.
/// Idempotent: skips items already in place and reports "already up to date" if
/// nothing needed changing.
pub fn install() -> Result<(), String> {
    let root       = project_root();
    let claude_dir = claude_dir();

    let agents_changed  = step1_copy_agents(&root, &claude_dir)?;
    let servers_changed = step2_register_mcp_servers(&claude_dir)?;
    let autostart_done  = step3_autostart()?;

    println!();
    if !agents_changed && !servers_changed && !autostart_done {
        println!("Global Claude Code install — already up to date.");
    } else {
        println!("Global Claude Code install complete.");
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Read-only checks (used by status())
// ---------------------------------------------------------------------------

fn check_agents(root: &Path, claude_dir: &Path) -> bool {
    let src_dir = root.join("agents");
    let dst_dir = claude_dir.join("agents");
    let mut all_ok = true;

    for file in AGENT_FILES {
        let src = src_dir.join(file);
        let dst = dst_dir.join(file);

        if !src.exists() {
            println!("   [!] Source missing : {file}");
            all_ok = false;
            continue;
        }
        if !dst.exists() {
            println!("   [!!] Not installed  : {file}");
            all_ok = false;
            continue;
        }
        let src_c = std::fs::read_to_string(&src).unwrap_or_default();
        let dst_c = std::fs::read_to_string(&dst).unwrap_or_default();
        if src_c != dst_c {
            println!("   [~~] Outdated       : {file}");
            all_ok = false;
        } else {
            println!("   [ok] Up to date     : {file}");
        }
    }
    all_ok
}

fn check_mcp_servers(claude_dir: &Path) -> Result<bool, String> {
    let settings_path = claude_dir.join("settings.json");
    if !settings_path.exists() {
        println!("   [!!] settings.json not found — MCP servers not registered");
        return Ok(false);
    }

    let raw = std::fs::read_to_string(&settings_path)
        .map_err(|e| format!("Read settings.json: {e}"))?;
    let s: serde_json::Value = serde_json::from_str(&raw)
        .map_err(|e| format!("Parse settings.json: {e}"))?;

    let mut all_ok = true;

    for (name, mcp_url) in MCP_SERVERS {
        let entry = s.get("mcpServers").and_then(|m| m.get(name));
        let is_stdio = entry.and_then(|v| v.get("type")).and_then(|v| v.as_str()) == Some("stdio");
        let has_proxy_url = entry
            .and_then(|v| v.get("env"))
            .and_then(|e| e.get("PM_MCP_URL"))
            .and_then(|v| v.as_str()) == Some(mcp_url);
        if is_stdio && has_proxy_url {
            println!("   [ok] MCP server     : {name} -> stdio proxy -> {mcp_url}");
        } else {
            println!("   [!!] Not registered : {name} -> stdio proxy -> {mcp_url}");
            all_ok = false;
        }
    }

    let allow = s.get("permissions")
        .and_then(|p| p.get("allow"))
        .and_then(|a| a.as_array())
        .map(|a| a.iter().filter_map(|v| v.as_str()).collect::<Vec<_>>())
        .unwrap_or_default();

    let missing_tools: Vec<_> = ALLOWLIST_TOOLS.iter()
        .filter(|&&t| !allow.contains(&t))
        .copied()
        .collect();

    if missing_tools.is_empty() {
        println!("   [ok] Allowlist      : {} tools present", ALLOWLIST_TOOLS.len());
    } else {
        println!("   [!!] Allowlist      : {} tool(s) missing", missing_tools.len());
        for t in &missing_tools {
            println!("          - {t}");
        }
        all_ok = false;
    }

    Ok(all_ok)
}

fn check_autostart() -> bool {
    // Query Task Scheduler for the task without modifying anything.
    let output = std::process::Command::new("schtasks")
        .args(["/Query", "/TN", "ProjectMemorySupervisor", "/FO", "LIST"])
        .output();

    match output {
        Ok(o) if o.status.success() => {
            println!("   [ok] Autostart      : Task 'ProjectMemorySupervisor' registered");
            true
        }
        _ => {
            println!("   [!!] Autostart      : Task 'ProjectMemorySupervisor' not found");
            false
        }
    }
}

// ---------------------------------------------------------------------------
// Step 1 — Copy agent files
// ---------------------------------------------------------------------------

/// Returns `Ok(true)` if any files were written, `Ok(false)` if all already up to date.
fn step1_copy_agents(root: &Path, claude_dir: &Path) -> Result<bool, String> {
    println!("-- Agent Files -> ~/.claude/agents/");

    let src_dir = root.join("agents");
    if !src_dir.exists() {
        return Err(format!("agents/ directory not found: {}", src_dir.display()));
    }

    let dst_dir = claude_dir.join("agents");
    std::fs::create_dir_all(&dst_dir)
        .map_err(|e| format!("Create agents dir: {e}"))?;

    let mut copied = 0usize;
    let mut skipped = 0usize;

    for file in AGENT_FILES {
        let src = src_dir.join(file);
        let dst = dst_dir.join(file);

        if !src.exists() {
            println!("   [!] Missing source: {file}");
            continue;
        }

        let src_content = std::fs::read_to_string(&src)
            .map_err(|e| format!("Read {file}: {e}"))?;

        let needs_copy = if dst.exists() {
            std::fs::read_to_string(&dst).unwrap_or_default() != src_content
        } else {
            true
        };

        if needs_copy {
            std::fs::write(&dst, &src_content)
                .map_err(|e| format!("Write {file}: {e}"))?;
            println!("   [ok] Copied {file}");
            copied += 1;
        } else {
            println!("   [--] {file} already up to date");
            skipped += 1;
        }
    }

    println!("   {copied} copied, {skipped} already up to date");
    Ok(copied > 0)
}

// ---------------------------------------------------------------------------
// Step 2 — MCP server registration + allowlist
// ---------------------------------------------------------------------------

/// Returns `Ok(true)` if settings.json was written (new servers or tools added).
fn step2_register_mcp_servers(claude_dir: &Path) -> Result<bool, String> {
    println!("-- MCP Servers + Allowlist -> ~/.claude/settings.json");

    let settings_path = claude_dir.join("settings.json");

    let raw = if settings_path.exists() {
        std::fs::read_to_string(&settings_path)
            .map_err(|e| format!("Read settings.json: {e}"))?
    } else {
        r#"{"permissions":{"allow":[]}}"#.to_string()
    };

    let mut s: serde_json::Value = serde_json::from_str(&raw)
        .map_err(|e| format!("Parse settings.json: {e}"))?;

    // Resolve the path to client-proxy.exe from the install config.
    let install_cfg  = crate::install_config::load_or_default();
    let proxy_exe    = install_cfg.install_dir.join(crate::install_config::binary_name("client-proxy"));
    let proxy_path   = proxy_exe.to_string_lossy().to_string();

    // ── MCP servers (stdio proxy) ─────────────────────────────────────────────
    if s.get("mcpServers").is_none() {
        s["mcpServers"] = serde_json::json!({});
    }

    let mut any_server_written = false;
    for (name, mcp_url) in MCP_SERVERS {
        let entry = s["mcpServers"].get(name);
        let is_current = entry
            .and_then(|v| v.get("type")).and_then(|v| v.as_str()) == Some("stdio")
            && entry
                .and_then(|v| v.get("env"))
                .and_then(|e| e.get("PM_MCP_URL"))
                .and_then(|v| v.as_str()) == Some(mcp_url);

        if is_current {
            println!("   [--] {name} already registered (stdio proxy)");
        } else {
            s["mcpServers"][name] = serde_json::json!({
                "type":    "stdio",
                "command": proxy_path,
                "args":    [],
                "env":     { "PM_MCP_URL": mcp_url }
            });
            println!("   [ok] Registered {name} -> stdio:{proxy_path} (PM_MCP_URL={mcp_url})");
            any_server_written = true;
        }
    }

    // ── Allowlist ────────────────────────────────────────────────────────────
    if s.get("permissions").is_none() {
        s["permissions"] = serde_json::json!({"allow": []});
    }
    if s["permissions"].get("allow").is_none() {
        s["permissions"]["allow"] = serde_json::json!([]);
    }

    let allow = s["permissions"]["allow"]
        .as_array_mut()
        .ok_or("permissions.allow is not an array")?;

    let mut added = 0usize;
    for tool in ALLOWLIST_TOOLS {
        if !allow.iter().any(|v| v.as_str() == Some(tool)) {
            allow.push(serde_json::json!(tool));
            added += 1;
        }
    }

    if added > 0 {
        println!("   [ok] Added {added} tool permission(s) to allowlist");
    } else {
        println!("   [--] All {} tool permissions already present", ALLOWLIST_TOOLS.len());
    }

    let changed = any_server_written || added > 0;

    // Only write back if something changed
    if changed {
        let output = serde_json::to_string_pretty(&s)
            .map_err(|e| format!("Serialise settings.json: {e}"))?;
        std::fs::write(&settings_path, output)
            .map_err(|e| format!("Write settings.json: {e}"))?;
    }

    Ok(changed)
}

// ---------------------------------------------------------------------------
// Step 3 — Windows Task Scheduler autostart
// ---------------------------------------------------------------------------

/// Writes `supervisor.toml` to the install base directory (sibling of `bin/`).
///
/// All paths are derived from `install_dir` — the directory where binaries were
/// deployed (e.g. `%APPDATA%\ProjectMemory\bin\`).  The parent of that directory
/// is the install *base* and holds server/, dashboard/, data/, and agents/ as
/// siblings, matching the layout written by `install_config::copy_node_artifacts`.
fn write_supervisor_toml(install_dir: &std::path::Path) -> Result<std::path::PathBuf, String> {
    // base = parent of install_dir, e.g. %APPDATA%\ProjectMemory\
    let base = install_dir.parent().unwrap_or(install_dir);
    std::fs::create_dir_all(base)
        .map_err(|e| format!("Create install base dir: {e}"))?;

    let config_path   = base.join("supervisor.toml");
    let server_dir    = base.join("server");
    let dashboard_dir = base.join("dashboard");
    let data_dir      = base.join("data");
    let agents_dir    = base.join("agents");
    let terminal_exe  = install_dir.join("interactive-terminal.exe");
    let brainstorm_exe = install_dir.join("pm-brainstorm-gui.exe");
    let approval_exe  = install_dir.join("pm-approval-gui.exe");

    // Paths in TOML as forward-slash strings to avoid backslash escaping issues.
    let s = |p: &std::path::Path| p.to_string_lossy().replace('\\', "/");

    let content = format!(
        r#"# Project Memory MCP — Supervisor Configuration
# Auto-generated by pm-cli global-claude

[supervisor]
log_level         = "info"
control_transport = "named_pipe"
control_pipe      = "\\\\.\\pipe\\project-memory-supervisor"

[mcp]
enabled = true
port    = 3457
backend = "node"

[mcp.node]
command     = "node"
args        = ["dist/index.js", "--transport", "streamable-http", "--port", "3457"]
working_dir = "{server}"

[mcp.node.env]
MBS_DATA_ROOT   = "{data}"
MBS_AGENTS_ROOT = "{agents}"

[interactive_terminal]
enabled = false
port    = 3458
command = "{terminal}"

[brainstorm_gui]
enabled        = true
command        = "{brainstorm}"
timeout_seconds = 300
window_width   = 720
window_height  = 640

[approval_gui]
enabled        = true
command        = "{approval}"
timeout_seconds = 60
window_width   = 480
window_height  = 320
always_on_top  = true

[dashboard]
enabled      = true
port         = 3459
requires_mcp = true
command      = "node"
args         = ["dist/index.js"]
working_dir  = "{dashboard}"

[dashboard.env]
PORT = "3459"

[approval]
default_countdown_seconds = 60
default_on_timeout        = "approve"

[cli_mcp]
enabled     = true
port        = 3466
command     = "node"
args        = ["dist/index-cli.js"]
working_dir = "{server}"

[claude_mcp]
enabled     = true
port        = 3467
command     = "node"
args        = ["dist/index-claude.js"]
working_dir = "{server}"
"#,
        server    = s(&server_dir),
        data      = s(&data_dir),
        agents    = s(&agents_dir),
        terminal  = s(&terminal_exe),
        brainstorm = s(&brainstorm_exe),
        approval  = s(&approval_exe),
        dashboard = s(&dashboard_dir),
    );

    std::fs::write(&config_path, &content)
        .map_err(|e| format!("Write supervisor.toml: {e}"))?;

    Ok(config_path)
}

fn step3_autostart() -> Result<bool, String> {
    println!("-- Autostart -> Task Scheduler (ProjectMemorySupervisor)");

    // Resolve the install directory from the saved InstallConfig.
    let install_config = crate::install_config::load_or_default();
    let install_dir = &install_config.install_dir;

    println!("   Install dir: {}", install_dir.display());

    // supervisor.exe lives in the install directory alongside all other binaries.
    let supervisor_exe = install_dir.join("supervisor.exe");
    if supervisor_exe.exists() {
        println!("   Found: {}", supervisor_exe.display());
    } else {
        println!("   [!] supervisor.exe not found at {}", supervisor_exe.display());
        println!("   [!] Run: pm-cli deploy supervisor  to copy the built binary.");
        println!("   [!] Registering the task anyway -- it will work once deployed.");
    }

    // Write supervisor.toml into the install base dir (parent of install_dir).
    let toml_path = write_supervisor_toml(install_dir)?;
    println!("   Config written: {}", toml_path.display());

    let exe_str  = supervisor_exe.to_string_lossy().to_string();
    let toml_str = toml_path.to_string_lossy().to_string();
    let work_dir = install_dir.to_string_lossy().to_string();

    // Build a minimal Task Scheduler XML (UTF-16 LE with BOM, as schtasks requires).
    // The action runs supervisor.exe --config <toml> directly — no PowerShell involved.
    let xml = format!(
        r#"<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <Triggers>
    <LogonTrigger><Enabled>true</Enabled></LogonTrigger>
  </Triggers>
  <Actions Context="Author">
    <Exec>
      <Command>{exe_str}</Command>
      <Arguments>--config "{toml_str}"</Arguments>
      <WorkingDirectory>{work_dir}</WorkingDirectory>
    </Exec>
  </Actions>
  <Settings>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <RestartOnFailure><Interval>PT1M</Interval><Count>3</Count></RestartOnFailure>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
  </Settings>
  <Principals>
    <Principal id="Author">
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>LeastPrivilege</RunLevel>
    </Principal>
  </Principals>
</Task>"#
    );

    let tmp = std::env::temp_dir().join("pm_supervisor_task.xml");
    let utf16: Vec<u16> = std::iter::once(0xFEFF_u16).chain(xml.encode_utf16()).collect();
    let bytes: Vec<u8> = utf16.iter().flat_map(|c| c.to_le_bytes()).collect();
    std::fs::write(&tmp, &bytes).map_err(|e| format!("Write task XML: {e}"))?;

    let status = std::process::Command::new("schtasks")
        .args(["/Create", "/F", "/TN", "ProjectMemorySupervisor", "/XML"])
        .arg(&tmp)
        .status()
        .map_err(|e| format!("schtasks: {e}"))?;

    let _ = std::fs::remove_file(&tmp);

    if status.success() {
        println!("   [ok] Task 'ProjectMemorySupervisor' registered");
        println!("   Exe: {exe_str}");
    } else {
        println!("   [!] schtasks returned non-zero (exit {})", status.code().unwrap_or(-1));
        println!("   [!] Try running pm-cli as Administrator if permission is required");
    }

    Ok(status.success())
}
