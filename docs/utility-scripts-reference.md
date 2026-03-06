# Utility Scripts Reference

This document lists the currently supported utility scripts for Project Memory MCP.

## Supported scripts

1. `install.ps1`
2. `install-animated.ps1`
3. `run-tests.ps1`
4. `interactive-terminal/build-interactive-terminal.ps1`
5. `new-install.ps1`
6. `scripts/preflight-machine.ps1`

Legacy helper scripts are archived and not part of the active workflow.

---

## 1) `install.ps1`

Builds and installs one or more components.

### Install parameters

- `-Component <string[]>`
  - Valid: `Server`, `Extension`, `Container`, `Supervisor`, `InteractiveTerminal`, `Dashboard`, `GuiForms`, `All`, `--help`
  - Default: `All`
- `-InstallOnly`
  - Extension only: install latest VSIX without rebuilding.
- `-SkipInstall`
  - Extension only: build/package but skip `code --install-extension`.
- `-Force`
  - Extension install uses `--force`; container build uses `--no-cache`.
- `-NoBuild`
  - Alias for `-InstallOnly`.
- `-NewDatabase`
  - Server only: archives existing DB and creates/seeds a fresh one.
- `-Help`, `-h`, `--help`
  - Shows help.

### Install use cases

- Normal build/install: `./install.ps1`
- Build specific components: `./install.ps1 -Component Server,Extension`
- Reinstall extension quickly: `./install.ps1 -Component Extension -InstallOnly -Force`
- Recreate server database: `./install.ps1 -Component Server -NewDatabase`

---

## 2) `install-animated.ps1`

Functional equivalent of `install.ps1` with animated terminal UX and warning aggregation.

### Animated install parameters

- `-Component <string[]>`
  - Valid: `Server`, `Extension`, `Container`, `Supervisor`, `InteractiveTerminal`, `Dashboard`, `GuiForms`, `All`, `--help`
  - Default: `All`
- `-InstallOnly`
- `-SkipInstall`
- `-Force`
- `-NoBuild`
- `-NewDatabase`
- `-Help`, `-h`, `--help`

### Animated install use cases

- Same jobs as `install.ps1` when you want progress animation and summarized warnings.
- Good for long interactive local builds where visual progress is useful.

---

## 3) `run-tests.ps1`

Runs tests for selected components with Qt environment bootstrapping for Rust/Qt crates.

### Test runner parameters

- `-Component <string[]>`
  - Valid: `Supervisor`, `GuiForms`, `InteractiveTerminal`, `Server`, `Dashboard`, `Extension`, `All`, `--help`
  - Default: `All`
- `-TailLines <int>`
  - Number of filtered output lines to print per command.
  - Default: `20`
- `-Pattern <string>`
  - Regex filter for output lines.
  - Default: `^(error|warning:|test |running|FAILED|ok|ignored|test result)`
- `-TestArg <string[]>`
  - Per-component extra test args in `Component=...` form.
  - Repeatable.
- `-FullOutputOnFailure`
  - Print full command output on failures.
- `-KeepRustTestBinaries`
  - Prevents Rust cleanup (`cargo clean`) after tests.
- `-KeepJsTestArtifacts`
  - Prevents JS/TS artifact cleanup (such as `.vitest`, extension `out/`).
- `-Help`, `-h`, `--help`

### Test runner use cases

- Run all tests: `./run-tests.ps1`
- Run focused components: `./run-tests.ps1 -Component Supervisor,InteractiveTerminal`
- Run targeted files/tests: `./run-tests.ps1 -Component Server -TestArg 'Server=src/__tests__/tools/memory-context-actions.test.ts'`
- Increase troubleshooting detail: `./run-tests.ps1 -TailLines 180 -FullOutputOnFailure`

---

## 4) `interactive-terminal/build-interactive-terminal.ps1`

Builds the Rust interactive terminal, optionally tests/runs/deploys Qt runtime, and can emit warnings/import logs.

### Interactive terminal build parameters

- `-Clean`
  - Cleans build artifacts first (with lock-recovery).
- `-Test`
  - Runs `cargo test`.
- `-Run`
  - Launches executable after build.
- `-Deploy`
  - Forces Qt runtime deployment (release profile deploys by default).
- `-WarningsImportsLogPath <string>`
  - Path or directory to write warnings + QML import report.
- `-Port <int>`
  - Launch port when `-Run` is set.
  - Default: `9100`
- `-Profile <debug|release>`
  - Build profile.
  - Default: `release`
- `-QtDir <string>`
  - Qt kit path.
  - Default: `$env:QT_DIR` or `C:\Qt\6.10.2\msvc2022_64`

### Interactive terminal build use cases

- Standard release build/deploy: `./build-interactive-terminal.ps1`
- Debug build and run: `./build-interactive-terminal.ps1 -Profile debug -Run -Port 9100`
- Clean + test + build: `./build-interactive-terminal.ps1 -Clean -Test`
- Capture warning/import report: `./build-interactive-terminal.ps1 -WarningsImportsLogPath ./logs/`

---

## Supervisor launch recommendation

Use direct launch from build output:

```powershell
cd "C:\Users\<username>\Project-Memory-MCP\Project-Memory-MCP\target\release\"
.\supervisor.exe
```

This is the preferred supervisor startup path instead of `launch-supervisor.ps1`.

---

## 5) `new-install.ps1`

Interactive first-time install + migration flow for a fresh or replacement machine.

### What it does

1. Prompts for the **data root directory** (default: `%APPDATA%\ProjectMemory`) — this is `PM_DATA_ROOT`, the single canonical location recognised by all components. The database is always `project-memory.db` inside this directory.
2. Delegates server build + DB initialisation to `install.ps1 -Component Server`.
3. Refreshes `.projectmemory/identity.json` for every workspace discovered in the data root.
4. Optionally migrates plans/context from an old data root via `dist/migration/migrate.js`.
5. Optionally discovers and imports distributed skills and instruction files from other workspaces (SHA256-deduplicated).
6. Re-seeds the DB if new artifacts were imported.
7. Delegates remaining component builds to `install.ps1 -Component Extension,Dashboard,Supervisor,InteractiveTerminal`.

### Parameters

- `-DataRoot <string>`
  - Data root directory override (skips the prompt).
- `-OldDataRoot <string>`
  - Optional old data root path to migrate from.
- `-SkipDistributedImport`
  - Skip scanning/importing distributed skills/instructions.
- `-SkipComponentInstall`
  - Run data-setup steps only; do not call `install.ps1` for remaining components.
- `-NonInteractive`
  - Use defaults/provided parameters without prompts.

### Use cases

- Interactive first-time setup:

```powershell
.\new-install.ps1
```

- Non-interactive scripted migration:

```powershell
.\new-install.ps1 -DataRoot "$env:APPDATA\ProjectMemory" -OldDataRoot "D:\old-projectmemory-data" -NonInteractive
```

- Data-setup only (skip component builds):

```powershell
.\new-install.ps1 -SkipComponentInstall
```

---

## 6) `scripts/preflight-machine.ps1`

Runs a fast clean-machine readiness check before first build/install.

### What it checks

- Required commands and major versions (`node`, `npm`, `rustc`, `cargo`)
- Optional but recommended tools (`code`, Qt kit path)
- Required repo files/lockfiles and reproducibility directory scaffolding

### Use case

- Before onboarding on a new machine, run:

```powershell
.\scripts\preflight-machine.ps1
```

Exit code is `1` when blocking requirements are missing.
