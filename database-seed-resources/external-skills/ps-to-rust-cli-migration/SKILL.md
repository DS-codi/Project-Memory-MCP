---
name: ps-to-rust-cli-migration
description: "Use this skill when incrementally migrating a PowerShell CLI to Rust. Covers audit and phase planning, hybrid fallback architecture (CommandRegistry + PowerShellFallback), alias normalisation, incremental porting phases (TUI wiring → per-command porting → fallback removal → PS cleanup), run_native_streaming pattern for wiring TUI to native handlers, parity boundary documentation, escape-hatch patterns, RefreshEntry/ServiceEntry extension for multi-phase pipelines, --dry-run strategy for high-risk phases, and validation policy (cargo check vs operational runs)."
metadata:
  category: devops
  tags:
    - rust
    - powershell
    - migration
    - refactor
    - cli
    - incremental
    - hybrid
  language_targets:
    - rust
    - powershell
  framework_targets:
    - crossterm
    - ratatui
---

# PowerShell → Rust CLI Migration

A field-tested methodology for incrementally replacing a PowerShell CLI (`bd.ps1`) with a native Rust binary, without a big-bang cutover. The Rust binary starts as a thin TUI wrapper, builds a fallback bridge to the existing PS scripts, and ports commands one at a time until the PS dependency is eliminated.

## When to Use This Skill

- You have a working PowerShell CLI and want to replace it with a native Rust binary
- You need the CLI running in production during the migration (zero downtime cutover)
- You want to port commands incrementally, validating parity before removing PS
- You're building a TUI on top of an existing command-line tool

---

## Phase Overview

```
Phase 1  — TUI wiring (wire existing TUI calls to native handlers)   [low risk, 1–2 hours]
Phase 2  — Port simple commands (status, health, logs)               [medium, 2–3 hours each]
Phase 3  — Port complex multi-phase pipelines                        [high risk, 1–2 days]
Phase 4  — Remove fallback module entirely                           [cleanup, 1 hour]
Phase 5  — Archive or shim the original PS scripts                   [30 min]
```

Start Phase 1 immediately — it requires zero new logic and unlocks the most value.

---

## Step 1: Audit the Existing PS CLI

Before writing any Rust, map the full command surface:

```
bd.ps1 <command> [args]
```

For each command, record:

| Command | Aliases | Complexity | Dependencies | Side Effects |
|---------|---------|------------|--------------|--------------|
| build | — | High | schema-gate, podman | Remote images |
| deploy | release | High | SSH, podman-compose | Running containers |
| health | hc | Low | curl, podman inspect | None |
| status | — | Low | SSH, podman ps | None |
| container-refresh | refresh, redeploy | Very High | 7-phase pipeline | Full container cycle |

Classify each command:
- **Low complexity** (SSH + format output): port in Phase 2
- **High complexity** (multi-phase with rollback): port in Phase 3
- **Permanently thin** (just a shell wrapper): keep as alias

---

## Step 2: Hybrid Architecture

The Rust binary owns the entry point from day one. PS scripts remain on disk as the fallback for unported commands.

### CommandRegistry

```rust
// src/command_registry.rs
pub struct CommandRegistry;

impl CommandRegistry {
    /// Normalize aliases before dispatch
    pub fn normalize(cmd: &str) -> String {
        match cmd {
            "validate"           => "schema-validate".to_string(),
            "mcp"                => "build-mcp".to_string(),
            "release"            => "ship".to_string(),
            "refresh" | "redeploy" => "container-refresh".to_string(),
            "logs"               => "log".to_string(),
            "hc"                 => "health".to_string(),
            "up"                 => "start".to_string(),
            _                    => cmd.to_string(),
        }
    }

    pub fn dispatch(cmd: &str, args: &[String]) -> i32 {
        let normalized = Self::normalize(cmd);
        match normalized.as_str() {
            // Native handlers — grow this list over time
            "build"           => commands::build::run(args),
            "deploy"          => commands::deploy::run(args),
            "health"          => commands::health::run(args),
            "log"             => commands::log::run(args),
            "schema-generate" => commands::schema_generate::run(args),
            "schema-analyze"  => commands::schema_analyze::run(args),
            "schema-validate" => commands::schema_validate::run(args),
            "schema-refresh"  => commands::schema_refresh::run(args),
            "start"           => commands::start::run(args),
            "ship"            => commands::ship::run(args),

            // Not yet ported — delegate to PS
            _ => PowerShellFallback::run(&normalized, args)
                     .map(|s| s.code().unwrap_or(1))
                     .unwrap_or_else(|e| { eprintln!("bd: {}", e); 1 }),
        }
    }
}
```

### PowerShell Fallback Adapter

```rust
// src/fallback/powershell.rs
pub struct PowerShellFallback;

impl PowerShellFallback {
    pub fn run(cmd: &str, args: &[String]) -> io::Result<ExitStatus> {
        Command::new("pwsh")
            .args(["-NoProfile", "-File", "bd.ps1", cmd])
            .args(args)
            .stdin(Stdio::inherit())
            .stdout(Stdio::inherit())
            .stderr(Stdio::inherit())
            .status()
    }

    /// Build args for TUI streaming — wraps the binary re-invocation path
    pub fn build_args(cmd: &str, extra: &[&str]) -> Vec<String> {
        let mut v = vec![
            "pwsh".to_string(),
            "-NoProfile".to_string(),
            "-File".to_string(),
            "bd.ps1".to_string(),
            cmd.to_string(),
        ];
        v.extend(extra.iter().map(|s| s.to_string()));
        v
    }
}
```

**Key principle:** `src/fallback/powershell.rs` is a hard indicator that PowerShell is still in the runtime path. Its presence or absence tells you the migration status at a glance. Never suppress it silently — treat it as a visible technical debt marker.

---

## Phase 1: Wire TUI to Native Handlers (No New Logic)

The most common trap: you port a command to Rust, but the TUI still calls PowerShell because it was hard-coded to use `run_bd_streaming`. Fix this without writing any new business logic.

### The Problem

```rust
// BEFORE — TUI invokes PowerShell even for already-native commands
fn handle_build(terminal: &mut Terminal<...>) -> io::Result<()> {
    run_bd_streaming(terminal, "build", &["--target", "all"])
    // ^ calls: pwsh -File bd.ps1 build --target all
    // Even though orchestration/build.rs is fully native!
}
```

### run_native_streaming Pattern

Re-invoke the `bd` binary itself instead of PowerShell. Routes through `CommandRegistry` → native handler:

```rust
fn run_native_streaming(
    terminal: &mut Terminal<CrosstermBackend<io::Stdout>>,
    cmd: &str,
    extra_args: &[&str],
) -> io::Result<()> {
    let exe = std::env::current_exe()?;
    let mut args = vec![cmd.to_string()];
    args.extend(extra_args.iter().map(|s| s.to_string()));
    run_streaming_command(terminal, cmd, &exe.to_string_lossy(), &args)
}
```

```rust
// AFTER — TUI invokes the Rust native handler
fn handle_build(terminal: &mut Terminal<...>) -> io::Result<()> {
    run_native_streaming(terminal, "build", &["--target", "all"])
    // ^ calls: bd build --target all  → CommandRegistry → orchestration/build.rs
}
```

### Migration Table (Phase 1)

Go through every TUI handler and replace `run_bd_streaming` / `run_bd_scrollable` calls for commands that already have native handlers:

| TUI handler | Command | Before | After |
|-------------|---------|--------|-------|
| `handle_build` | `build` | `run_bd_streaming` | `run_native_streaming` |
| `handle_deploy` | `deploy` | `run_bd_streaming` | `run_native_streaming` |
| `handle_ship` | `ship` | `run_bd_streaming` | `run_native_streaming` |
| `handle_start` | `start` | `run_bd_streaming` | `run_native_streaming` |
| `handle_logs` | `log` | `run_bd_scrollable` | `run_native_streaming` |
| `handle_health` | `health` | custom PS args | `run_native_streaming` |
| `handle_schema_*` | `schema-*` | `run_bd_streaming` | `run_native_streaming` |

**Only change `src/main.rs`.** This is mechanical substitution — validate by running each TUI menu item.

---

## Phase 2: Port a Simple Command

Template for a low-complexity command (SSH → format output → display).

### New files

```
src/commands/status.rs       ← thin entry point, parse args
src/orchestration/status.rs  ← business logic
```

### Entry point (commands/status.rs)

```rust
pub struct StatusCommand;

impl StatusCommand {
    pub fn run(args: &[String]) -> i32 {
        let opts = StatusOptions::from_args(args);
        match crate::orchestration::status::run_status(&opts) {
            Ok(0) | Ok(_) => 0,
            Err(e) => { eprintln!("status: {}", e); 1 }
        }
    }
}
```

### Orchestration (orchestration/status.rs)

```rust
pub struct StatusOptions {
    pub env: RuntimeEnvironment,
    pub filter: Option<String>,
}

pub fn run_status(opts: &StatusOptions) -> io::Result<i32> {
    let target = DEFAULT.ssh_target;
    let cmd = format!(
        r#"podman ps --format "table {{{{.Names}}}}\t{{{{.Status}}}}\t{{{{.Ports}}}}""#
    );
    ssh_exec_streaming(target, &cmd)
        .map(|s| s.code().unwrap_or(1))
}
```

### Register in CommandRegistry

```rust
"status" => commands::status::StatusCommand::run(args),
```

### Update TUI handler

```rust
fn handle_status(terminal: &mut Terminal<...>) -> io::Result<()> {
    run_native_streaming(terminal, "status", &[])
}
```

---

## Phase 3: Port a Complex Multi-Phase Pipeline

For commands like `container-refresh` with 7 phases, rollback semantics, and multiple remote operations.

### Read the PS Script First

Before writing a single line of Rust, read the PS script in full and document each phase:

```
Phase 1: Discovery   — SSH: podman ps, schema alignment check
Phase 2: Build       — podman build locally for each service
Phase 3: Tag + Push  — podman tag + podman push to registry
Phase 4: Teardown    — SSH: compose stop + rm in reverse dep order
Phase 5: Startup     — SSH: compose pull + up -d in dep order
Phase 6: Health      — reuse health::ReadinessCheck
Phase 7: Report      — write markdown run log
```

Extract the implicit data model from the PS script into a Rust struct:

```rust
// Extend domain/services.rs or create a companion struct
pub struct RefreshEntry {
    pub image: &'static str,              // local image name
    pub compose_service_prod: &'static str,
    pub compose_service_test: &'static str,
    pub container_name_suffix: &'static str,
    pub build_on_vm: bool,                // some services build remotely
    pub stock_image: bool,                // skip build/push for vendor images
}
```

### --dry-run First

Implement `--dry-run` mode before any real execution. Print what would happen without doing it:

```rust
if opts.dry_run {
    println!("[dry-run] Would SSH to {} and run: {}", target, cmd);
    return Ok(0);
}
// real execution below
```

Test every phase with `--dry-run` before removing the PowerShell fallback. Only remove the fallback for a phase after it has run successfully in production at least once.

### Incremental Phase Activation

Don't port all phases at once. Add a `--phases` flag for selective execution during development:

```rust
pub struct RefreshOptions {
    pub dry_run: bool,
    pub skip_build: bool,
    pub phases: Option<Vec<u8>>,  // None = all phases
}

// In orchestration:
if opts.phases.as_ref().map_or(true, |p| p.contains(&2)) {
    run_build_phase(&entries, opts)?;
}
```

### Escape Hatches (Intentional PowerShell Delegation)

When parity is incomplete for a sub-path, make the fallback explicit rather than silent:

```rust
pub fn run_build(opts: &BuildOptions) -> io::Result<i32> {
    // Native path for the common case
    if let Some(schema_gate) = resolve_schema_gate(opts)? {
        return run_native_build(schema_gate, opts);
    }

    // Explicit escape hatch — parity gap documented
    // TODO: port schema-gate override semantics (tracked in MIGRATION_PLAN.md Phase 3)
    eprintln!("bd: schema gate metadata missing — delegating to PowerShell");
    PowerShellFallback::run("build", &opts.to_ps_args())
        .map(|s| s.code().unwrap_or(1))
}
```

Escape hatches should:
1. Print a message so they're visible in logs
2. Have a comment with a TODO pointing to the migration phase
3. Be searchable — `grep -r "PowerShellFallback"` should list all remaining gaps

---

## Parity Boundary Documentation

Maintain a current-state doc (`RUST_CLI_CURRENT_STATE.md`) alongside the migration plan. Keep them separate:

- **Migration plan** = target state, phases, file changes
- **Current state** = what actually exists today, parity gaps, escape hatches

Template for a command entry:

```markdown
### `build`

Native for the main orchestration path. Still delegates to PowerShell when:
- `-ShowOutput` streaming parity is incomplete
- Schema-gate metadata is missing or unparsable
- Schema-gate override semantics are not yet ported

Best described as: "native-first, with PowerShell escape hatches for schema-gate gaps."
```

### Source of Truth

> Treat `src/command_registry.rs` as the source of truth for whether a command is native or PS-backed.
> Treat any `PowerShellFallback::run(...)` call as a hard indicator that PS is still in the runtime path.

---

## Phase 4: Remove the Fallback Module

Only after every command in `CommandRegistry` dispatches to a native handler:

1. Replace the `_ =>` fallback arm with a proper error:
   ```rust
   _ => { eprintln!("bd: unknown command '{}'", normalized); 1 }
   ```

2. Remove from `src/main.rs`:
   - `run_bd_streaming`
   - `run_bd_scrollable`
   - `run_bd_streaming_inner`
   - `run_bd_scrollable_inner`
   - `mod fallback;`

3. Delete:
   - `src/fallback/powershell.rs`
   - `src/fallback/mod.rs`

4. Remove `use crate::fallback::powershell::PowerShellFallback;` from all orchestration files.

5. Run `cargo check` — fix any remaining references.

---

## Phase 5: Archive PS Scripts

Three options — choose based on stability confidence:

| Option | When | How |
|--------|------|-----|
| **Archive** | Always safe | Move `commands/*.ps1` to `reference/`. Keeps audit trail. |
| **Thin shim** | Muscle memory / CI scripts | Replace `bd.ps1` with one-liner: `& "$PSScriptRoot/rust-cli/bd.exe" @args` |
| **Delete** | After 2–4 weeks stable in production | `git rm bd.ps1 commands/*.ps1 lib/` |

Recommended: thin shim for `bd.ps1` + archive `commands/*.ps1` to `reference/`.

```powershell
# bd.ps1 (thin shim — replaces the original entry point)
& "$PSScriptRoot\build-deploy-cli\rust-cli\bd.exe" @args
exit $LASTEXITCODE
```

---

## Validation Policy

During migration, keep validation lightweight to avoid accidental side effects:

| Validation type | Allowed in editor | Notes |
|-----------------|------------------|-------|
| `cargo check` | Yes | Safe — type checks only, no execution |
| `cargo build` | Yes | Compiles; does not run operational code |
| `cargo test` | Yes for unit tests | Only if tests are pure logic, no SSH/podman |
| Build commands | External only | Must run through the real terminal |
| Deploy commands | External only | Never invoke from editor tools |
| Schema refresh | External only | Modifies production schema files |
| Full pipelines (ship, container-refresh) | External only | Always run from terminal |

---

## Common Pitfalls

### TUI Still Calling PowerShell After Porting
**Symptom:** You ported a command to Rust but TUI logs show `pwsh -File bd.ps1`.
**Cause:** TUI handler still uses `run_bd_streaming` instead of `run_native_streaming`.
**Fix:** Phase 1 — mechanical swap in `src/main.rs`.

### Silent Parity Gaps
**Symptom:** Rust handler runs but silently skips a sub-behaviour PS had.
**Cause:** The PS script had an implicit feature not in the Rust port.
**Fix:** Add an explicit escape hatch with a log message and TODO comment. Don't silently degrade.

### Fallback Masking Errors
**Symptom:** Native handler returns an error, PS fallback runs and "succeeds", masking the Rust bug.
**Cause:** Over-eager fallback trigger — falls back on any error, not just parity gaps.
**Fix:** Only trigger fallback for *known* parity gaps, not generic errors. A Rust error is a bug to fix, not a reason to silently delegate.

### Removing Fallback Too Early
**Symptom:** Phase 3 command fails in production because a code path wasn't tested.
**Fix:** Keep fallback active per-command until each has run successfully in production at least once. Remove fallback per-command, not all at once.

### Lock Step With TUI
**Symptom:** `run_native_streaming` re-invokes `bd` but the TUI tries to re-enter raw mode.
**Cause:** The child `bd` process inherits the parent's terminal and tries to set raw mode again.
**Fix:** `run_native_streaming` runs the child with inherited stdio (no TUI re-entry). The parent TUI renders the child's stdout as streaming output — the child should be invoked as a plain CLI, not a TUI.

---

## Files to Create Per Command Port

| File | Purpose |
|------|---------|
| `src/commands/<cmd>.rs` | Thin entry point: parse args, call orchestrator, return exit code |
| `src/orchestration/<cmd>.rs` | Business logic: subprocess calls, SSH, formatting |

### Boilerplate: commands/<cmd>.rs

```rust
pub struct FooCommand;

impl FooCommand {
    pub fn run(args: &[String]) -> i32 {
        let opts = match FooOptions::parse(args) {
            Ok(o) => o,
            Err(e) => { eprintln!("foo: {}", e); return 1; }
        };
        match crate::orchestration::foo::run_foo(&opts) {
            Ok(code) => code,
            Err(e) => { eprintln!("foo: {}", e); 1 }
        }
    }
}
```

### Boilerplate: orchestration/<cmd>.rs

```rust
pub struct FooOptions {
    pub env: RuntimeEnvironment,
    // command-specific fields
}

impl FooOptions {
    pub fn parse(args: &[String]) -> Result<Self, String> {
        // parse --flags and positional args
        Ok(Self { env: RuntimeEnvironment::Production })
    }
}

pub fn run_foo(opts: &FooOptions) -> io::Result<i32> {
    // business logic here
    Ok(0)
}
```

---

## Checklist for Each Command Port

1. [ ] Read the PS script in full before writing any Rust
2. [ ] Document phases/steps and implicit data structures
3. [ ] Create `src/commands/<cmd>.rs` (thin entry point)
4. [ ] Create `src/orchestration/<cmd>.rs` (business logic)
5. [ ] Register in `src/command_registry.rs`
6. [ ] Add `--dry-run` support for any command with side effects
7. [ ] Test native path with `--dry-run` first
8. [ ] Add explicit escape hatches (with log message + TODO) for known gaps
9. [ ] Update `src/main.rs` TUI handler to use `run_native_streaming`
10. [ ] Test TUI path — confirm output streams correctly
11. [ ] Run command in production at least once before removing PS fallback for this command
12. [ ] Update `RUST_CLI_CURRENT_STATE.md` — remove from "still delegating" table
13. [ ] When all commands ported: execute Phase 4 (remove fallback module)
14. [ ] When stable in production: execute Phase 5 (archive PS scripts)
