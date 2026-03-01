# Utility Scripts Reference

This document lists the currently supported utility scripts for Project Memory MCP.

## Supported scripts

1. `install.ps1`
2. `install-animated.ps1`
3. `run-tests.ps1`
4. `interactive-terminal/build-interactive-terminal.ps1`

Legacy helper scripts are archived and not part of the active workflow.

---

## 1) `install.ps1`

Builds and installs one or more components.

### Parameters

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

### Use cases

- Normal build/install: `./install.ps1`
- Build specific components: `./install.ps1 -Component Server,Extension`
- Reinstall extension quickly: `./install.ps1 -Component Extension -InstallOnly -Force`
- Recreate server database: `./install.ps1 -Component Server -NewDatabase`

---

## 2) `install-animated.ps1`

Functional equivalent of `install.ps1` with animated terminal UX and warning aggregation.

### Parameters

- `-Component <string[]>`
  - Valid: `Server`, `Extension`, `Container`, `Supervisor`, `InteractiveTerminal`, `Dashboard`, `GuiForms`, `All`, `--help`
  - Default: `All`
- `-InstallOnly`
- `-SkipInstall`
- `-Force`
- `-NoBuild`
- `-NewDatabase`
- `-Help`, `-h`, `--help`

### Use cases

- Same jobs as `install.ps1` when you want progress animation and summarized warnings.
- Good for long interactive local builds where visual progress is useful.

---

## 3) `run-tests.ps1`

Runs tests for selected components with Qt environment bootstrapping for Rust/Qt crates.

### Parameters

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

### Use cases

- Run all tests: `./run-tests.ps1`
- Run focused components: `./run-tests.ps1 -Component Supervisor,InteractiveTerminal`
- Run targeted files/tests: `./run-tests.ps1 -Component Server -TestArg 'Server=src/__tests__/tools/memory-context-actions.test.ts'`
- Increase troubleshooting detail: `./run-tests.ps1 -TailLines 180 -FullOutputOnFailure`

---

## 4) `interactive-terminal/build-interactive-terminal.ps1`

Builds the Rust interactive terminal, optionally tests/runs/deploys Qt runtime, and can emit warnings/import logs.

### Parameters

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

### Use cases

- Standard release build/deploy: `./build-interactive-terminal.ps1`
- Debug build and run: `./build-interactive-terminal.ps1 -Profile debug -Run -Port 9100`
- Clean + test + build: `./build-interactive-terminal.ps1 -Clean -Test`
- Capture warning/import report: `./build-interactive-terminal.ps1 -WarningsImportsLogPath ./logs/`

---

## Supervisor launch recommendation

Use direct launch from build output:

```powershell
cd "C:\Users\User\Project_Memory_MCP\Project-Memory-MCP\target\release\"
.\supervisor.exe
```

This is the preferred supervisor startup path instead of `launch-supervisor.ps1`.