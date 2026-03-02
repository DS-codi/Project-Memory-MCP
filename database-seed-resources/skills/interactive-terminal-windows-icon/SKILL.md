---
name: interactive-terminal-windows-icon
description: Use this skill to understand and replicate how Project Memory's interactive terminal sets its Windows executable/taskbar/window icon and tray icon fallback behavior.
metadata:
  category: desktop
  tags:
    - windows
    - icon
    - taskbar
    - qml
    - cxxqt
    - rust
    - winresource
    - interactive-terminal
  language_targets:
    - rust
    - qml
    - powershell
  framework_targets:
    - qt6
    - cxxqt
---

# Interactive Terminal Windows Icon (Taskbar + Window + Tray)

This skill documents the exact mechanism used by Project Memory's interactive terminal to show the correct icon in Windows.

## What Actually Sets the Icon

The app uses a two-layer approach:

1. **Executable icon (compile-time, Win32 resource)**
   - Source: `interactive-terminal/resources/itpm-icon.ico`
   - Embedded by `interactive-terminal/build.rs` using `winresource`:
     - `set_icon("resources/itpm-icon.ico")`
     - `set_manifest_file("resources/app.manifest")`
   - Result: Windows uses this embedded icon for:
     - taskbar button
     - Alt+Tab entry
     - default window icon (when no explicit per-window icon is set)

2. **Tray icon (runtime, QML SystemTrayIcon)**
   - QML binds tray icon to `terminalApp.trayIconUrl` in `interactive-terminal/qml/main.qml`:
     - `Platform.SystemTrayIcon { icon.source: terminalApp.trayIconUrl }`
   - Rust resolves a `file:///` icon URL in `interactive-terminal/src/cxxqt_bridge/session_runtime.rs` via `resolve_tray_icon_url()`.
   - Search order (simplified):
     - `<exe_dir>/itpm-icon.ico`
     - `<exe_dir>/resources/itpm-icon.ico`
     - `<exe_dir>/../../resources/itpm-icon.ico` (cargo dev layout)
     - with `.svg` fallbacks in the same locations

## Why the Taskbar/Window Icon Works Reliably

The taskbar/window icon does **not** depend on runtime file lookup. It works because the icon is compiled directly into the `.exe` by `winresource` in `build.rs`.

This is why icon display can remain correct even if tray icon files are missing next to the executable.

## Supporting Runtime Details

- `interactive-terminal/src/main.rs` uses:
  - `#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]`
- This suppresses console windows for release builds and aligns behavior with a GUI app.
- The application manifest (`resources/app.manifest`) sets DPI awareness and is embedded with the same `winresource` pass.

## Important Distinction

- **Window/taskbar icon**: from embedded PE resources (`build.rs`)
- **Tray icon**: from runtime-resolved file URL (`resolve_tray_icon_url` + QML `SystemTrayIcon`)

Do not assume tray icon success implies window/taskbar success, or vice versa.

## How to Replicate in Another Project Memory GUI Binary

1. Add `winresource` to Windows build-dependencies.
2. In `build.rs`, embed both icon and manifest:

```rust
#[cfg(windows)]
{
    let mut res = winresource::WindowsResource::new();
    res.set_icon("resources/itpm-icon.ico");
    res.set_manifest_file("resources/app.manifest");
    res.compile().expect("Failed to compile Windows resources");
}
```

3. Keep `resources/itpm-icon.ico` under source control.
4. If you use a tray icon, expose a runtime path/URL property and bind it in QML.
5. Ensure deployment/staging copies tray icon assets near the executable, or provide a deterministic fallback path.

## Verification Checklist (Windows)

- Build release binary.
- Launch app normally (not through an unrelated host executable).
- Confirm:
  - Taskbar icon is the branded icon.
  - Window title-bar icon matches.
  - Tray icon appears correctly.
- If tray icon is missing but taskbar/window is correct, inspect runtime icon file placement first.

## Troubleshooting

- **Taskbar/window icon wrong**
  - Verify `build.rs` is executed and `set_icon(...)` points to a valid `.ico`.
  - Perform a clean rebuild if stale artifacts are suspected.

- **Tray icon blank**
  - Confirm an icon file exists in one of the resolver's candidate paths.
  - Check stderr logs for `Tray icon resolved:` or `WARNING: No tray icon found`.

- **Icon appears inconsistent across launches**
  - Confirm you are launching the same built executable each time.
  - Validate staging/deployment did not drop icon assets required for tray resolution.

## Canonical References in This Repo

- `Project-Memory-MCP/interactive-terminal/build.rs`
- `Project-Memory-MCP/interactive-terminal/resources/itpm-icon.ico`
- `Project-Memory-MCP/interactive-terminal/resources/app.manifest`
- `Project-Memory-MCP/interactive-terminal/src/cxxqt_bridge/session_runtime.rs`
- `Project-Memory-MCP/interactive-terminal/qml/main.qml`
- `Project-Memory-MCP/interactive-terminal/src/main.rs`
