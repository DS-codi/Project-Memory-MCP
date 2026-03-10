# Interactive Terminal Stash Extract: Qt Deployment Check

Date: 2026-03-10

This note extracts the highest-value idea from the dropped stash change in `interactive-terminal/src/build_check.rs` without carrying forward the unsafe release-staging edits from the same stash.

## What Was Valuable

The stashed version upgraded the runtime validation from a single-file check to a deployment-completeness check.

Current upstream only verifies that `Qt6Core.dll` exists next to the executable.

The stashed logic instead checked a small required set:

- `Qt6Core.dll`
- `Qt6Gui.dll`
- `Qt6Qml.dll`
- `Qt6Quick.dll`
- `Qt6QuickControls2.dll`
- `Qt6Network.dll`
- `platforms/qwindows.dll`

It then collected every missing path and panicked with a single actionable message.

## Why This Is Worth Keeping

When Qt deployment is incomplete, the process can start without producing a visible window. A multi-file check gives a much better failure mode than a single `Qt6Core.dll` probe.

This is especially useful for diagnosing:

- broken `windeployqt` output
- incomplete staged release artifacts
- missing platform plugin deployment
- silent startup failures that otherwise look like a hang or tray-only launch

## Safe Adaptation For Current Upstream

This logic should only be reintroduced on top of the current release/deploy flow.

Do not pair it with the old stash change that stopped staging Qt DLLs and plugin directories into `target/release`. The current build script still stages runtime artifacts intentionally, and the stronger check would turn that old staging reduction into a startup regression.

## Suggested Implementation Shape

Use the existing structure of `verify_qt_runtime()` and replace the single-file probe with a required-path list:

```rust
let required_paths = [
    exe_dir.join("Qt6Core.dll"),
    exe_dir.join("Qt6Gui.dll"),
    exe_dir.join("Qt6Qml.dll"),
    exe_dir.join("Qt6Quick.dll"),
    exe_dir.join("Qt6QuickControls2.dll"),
    exe_dir.join("Qt6Network.dll"),
    exe_dir.join("platforms").join("qwindows.dll"),
];

let missing = required_paths
    .iter()
    .filter(|path| !path.exists())
    .map(|path| path.display().to_string())
    .collect::<Vec<_>>();

if !missing.is_empty() {
    panic!(
        "Qt runtime deployment incomplete for interactive-terminal. Missing files:\n- {}\nExecutable: {}\nRun build-interactive-terminal.ps1 (or build-and-install.ps1) so Qt runtime files are deployed next to the executable.",
        missing.join("\n- "),
        exe_path.display(),
    );
}
```

## Upstream-Aware Follow-Up

Before implementing this, compare the required-path list against the artifacts the current build script deploys today.

In particular, upstream now also stages additional runtime directories such as `webview`, icons, and other plugin folders. If startup failures are still common, extend the check to cover the exact subset that is actually required for first-window creation.

## Recommendation

This extraction is worth keeping as a future code change.

The safe path is:

1. keep current staging behavior unchanged
2. strengthen runtime validation in `build_check.rs`
3. test a release build launched by supervisor
4. only then consider expanding the required-path list further