# Rust Build Target Directories

Generated: 2026-03-06  
This workspace has **two** separate Rust/CxxQt build target directories, both excluded from git by `.gitignore`.

---

## 1. `/target/` — Workspace-level Cargo target

**Gitignore rule:** `/target/`  
**Total size (approx):** ~4 GB  
**Location:** `C:\Users\User\Project_Memory_MCP\Project-Memory-MCP\target\`

This is the primary Cargo workspace target used by the `supervisor`, `pm-approval-gui`, and `pm-brainstorm-gui` crates.

### Subdirectory Summary

| Directory | Files | Size |
|-----------|-------|------|
| `debug/` | ~4,151 | ~2,604 MB |
| `release/` | ~7,531 | ~1,420 MB |
| `cxxqt/` | ~19 | ~0.1 MB |

### `target/release/` — Top-level artifacts

These are the deployed/runnable outputs:

| File | Size (MB) | Built | Description |
|------|-----------|-------|-------------|
| `supervisor.exe` | 10.4 | 2026-03-06 05:49 | Main supervisor process |
| `supervisor.pdb` | 4.5 | 2026-03-06 05:49 | Debug symbols for supervisor |
| `supervisor.d` | ~0 | 2026-03-06 05:49 | Dependency file |
| `libsupervisor.rlib` | 13.7 | 2026-03-06 05:47 | Supervisor library (rlib) |
| `libsupervisor.d` | ~0 | 2026-03-06 05:49 | Dependency file for rlib |
| `pm-approval-gui.exe` | 1.5 | 2026-02-28 14:11 | Approval GUI executable |
| `pm_approval_gui.pdb` | 2.8 | 2026-02-28 14:11 | Debug symbols |
| `pm-approval-gui.d` | ~0 | 2026-03-06 05:50 | Dependency file |
| `pm-brainstorm-gui.exe` | 1.7 | 2026-02-28 14:12 | Brainstorm GUI executable |
| `pm_brainstorm_gui.pdb` | 2.9 | 2026-02-28 14:12 | Debug symbols |
| `pm-brainstorm-gui.d` | ~0 | 2026-03-06 05:50 | Dependency file |
| `libpm_gui_forms.rlib` | 2.8 | 2026-02-27 01:27 | GUI forms library (rlib) |
| `interactive-terminal.exe` | 5.4 | 2026-03-06 18:04 | Interactive terminal executable |
| `interactive_terminal.pdb` | 3.6 | 2026-02-28 09:47 | Debug symbols |

### `target/release/` — Qt6 DLL dependencies (deployed by windeployqt)

| DLL | Size (MB) | Version date |
|-----|-----------|--------------|
| `Qt6Core.dll` | 9.8 | 2026-01-20 |
| `Qt6Gui.dll` | 9.1 | 2026-01-20 |
| `Qt6Widgets.dll` | 6.3 | 2026-01-20 |
| `Qt6Quick.dll` | 6.2 | 2026-01-22 |
| `Qt6Qml.dll` | 5.1 | 2026-01-22 |
| `Qt6QuickControls2.dll` + style variants | ~15 total | 2026-01-22 |
| `Qt6QuickTemplates2.dll` | 1.9 | 2026-01-22 |
| `Qt6Network.dll` | 1.7 | 2026-01-20 |
| `Qt6OpenGL.dll` | 1.9 | 2026-01-20 |
| `Qt6Svg.dll` | 0.6 | 2026-01-20 |
| `Qt6Lottie.dll` | 0.35 | 2026-01-23 |
| `Qt6VirtualKeyboard.dll` | 0.4 | 2026-01-23 |
| `Qt6WebView.dll` + `Qt6WebViewQuick.dll` | ~0.15 | 2026-01-25 |
| `opengl32sw.dll` | 19.7 | 2022-11-29 |
| `D3Dcompiler_47.dll` | 4.0 | 2014-03-11 |
| `dxcompiler.dll` | 13.4 | 2025-03-22 |
| `dxil.dll` | 1.4 | 2025-03-22 |
| `icuuc.dll` | ~0 | 2020-10-16 |

### `target/release/` — Icon resources

| File | Description |
|------|-------------|
| `supervisor_blue.ico` | Tray icon — idle/default |
| `supervisor_green.ico` | Tray icon — running |
| `supervisor_purple.ico` | Tray icon — alt state |
| `supervisor_red.ico` | Tray icon — error/stopped |

### `target/release/` — Qt plugin subdirectories

| Directory | Purpose |
|-----------|---------|
| `platforms/` | `qwindows.dll` + platform plugins |
| `styles/` | Qt window style plugins |
| `imageformats/` | PNG, JPEG, SVG image format plugins |
| `iconengines/` | SVG icon engine |
| `qml/` | QML module tree (QtQuick, Controls, etc.) |
| `qmltooling/` | QML debugging tools |
| `tls/` | TLS backend plugins |
| `translations/` | Qt locale translation files |
| `networkinformation/` | Network status plugins |
| `platforminputcontexts/` | Input method plugins |
| `vectorimageformats/` | Vector image format plugins |
| `generic/` | Generic plugins |
| `.fingerprint/` | Cargo build fingerprint data |
| `build/` | Build script outputs |
| `deps/` | Dependency artifacts (`.rlib`, `.d`, `.pdb`) |
| `incremental/` | Incremental compilation data |
| `examples/` | Example binary outputs |

### `target/debug/` — Debug artifacts

| Directory | Files | Size | Notes |
|-----------|-------|------|-------|
| `.fingerprint/` | — | — | Build fingerprints |
| `build/` | — | — | Build script outputs |
| `deps/` | — | — | Debug `.rlib`, `.pdb`, `.d` files |
| `incremental/` | — | — | Incremental compilation cache |
| `examples/` | — | — | Debug example binaries |

Top-level `target/debug/` currently contains only `.cargo-lock` (no debug binary built at root level — debug builds go into `interactive-terminal/target/debug/`).

### `target/cxxqt/` — CxxQt bridge artifacts

~19 files, ~0.1 MB. Contains intermediate CxxQt code-generation outputs used during the C++/Rust bridge compilation.

---

## 2. `interactive-terminal/target/` — Interactive Terminal Cargo target

**Gitignore rule:** `interactive-terminal/target/`  
**Total size (approx):** ~2.9 GB  
**Location:** `C:\Users\User\Project_Memory_MCP\Project-Memory-MCP\interactive-terminal\target\`

This is the dedicated Cargo target for the `interactive-terminal` crate (separate because it has its own `Cargo.toml` at `interactive-terminal/`).

### Subdirectory Summary

| Directory | Files | Size |
|-----------|-------|------|
| `debug/` | ~4,014 | ~2,006 MB |
| `release/` | ~4,123 | ~877 MB |
| `cxxqt/` | ~7 | ~0.1 MB |

### `interactive-terminal/target/release/` — Top-level artifacts

| File | Size (MB) | Built | Description |
|------|-----------|-------|-------------|
| `interactive-terminal.exe` | 5.42 | 2026-03-06 18:04 | **Primary GUI executable** |
| `interactive-terminal.d` | ~0 | 2026-03-06 18:04 | Dependency tracking file |
| `interactive_terminal.pdb` | 5.71 | 2026-03-06 18:04 | Full debug symbols |

**Note:** This is the build most recently modified (18:04 today). The `supervisor.exe` in workspace-level `target/release/` references this executable via `supervisor.launch.toml`.

### `interactive-terminal/target/release/` — Qt6 DLLs

Same Qt6 DLL set as the workspace-level `target/release/` (copied by windeployqt during build). Same subdirectory structure: `platforms/`, `qml/`, `styles/`, `imageformats/`, etc.

### `interactive-terminal/target/debug/` — Debug artifacts

~4,014 files, ~2,006 MB — full incremental debug build. Subdirectory structure mirrors release: `.fingerprint/`, `build/`, `deps/`, `incremental/`, `examples/`.

### `interactive-terminal/target/cxxqt/`

~7 files, ~0.1 MB — CxxQt intermediate generated C++ sources.

---

## Notes for Work Machine Setup

When setting up on another machine:

1. **Do not copy the `target/` directories** — they contain machine-specific paths baked into `.d` dependency files and PDB debug info, and are extremely large (~7 GB total).
2. **Run `.\install.ps1`** from the workspace root — this rebuilds everything from source.
3. Qt6 DLLs are deployed automatically by `windeployqt` during the install script; they do **not** need to be manually copied.
4. If the interactive terminal GUI does not appear, verify:
   - Qt6 DLLs are present next to `interactive-terminal.exe` (check `target/release/` for `Qt6Core.dll` etc.)
   - `platforms/qwindows.dll` exists under `target/release/platforms/`
   - `qml/` tree is present under `target/release/qml/`
   - The supervisor's `supervisor.launch.toml` entry for `interactive-terminal` points to the correct path
   - `C:\Users\User\AppData\Roaming\ProjectMemory\interactive-terminal\tray-settings.json` exists and is valid
