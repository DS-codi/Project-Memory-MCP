# Interactive Terminal Stash Extract: Qt Startup Diagnostics

Date: 2026-03-10

This note extracts the useful startup-diagnostic idea from the dropped stash change in `interactive-terminal/src/main.rs`.

## What Was Valuable

The stashed version added explicit failure checks immediately after:

- `QGuiApplication::new()`
- `QQmlApplicationEngine::new()`

The intent was to fail early with a targeted message when Qt platform/plugin startup breaks instead of falling through to a later, less obvious failure mode.

## Why This Is Worth Keeping

The interactive terminal can fail in ways that look like:

- process starts but no window appears
- QML engine never loads successfully
- plugin mismatch after release staging
- platform plugin failure on Windows

An explicit panic at initialization time gives a faster and more actionable operator signal than a generic missing-window symptom.

## Stashed Logic Shape

The useful part was conceptually:

```rust
let mut app = QGuiApplication::new();
if app.as_ref().is_none() {
    panic!(
        "Failed to initialize QGuiApplication. Qt platform/plugin startup likely failed. \
         Verify deployed Qt runtime files (especially platforms/qwindows.dll)."
    );
}

let mut engine = QQmlApplicationEngine::new();
if engine.as_ref().is_none() {
    panic!(
        "Failed to initialize QQmlApplicationEngine. QML runtime startup failed; \
         verify Qt/QML deployment and plugin compatibility."
    );
}
```

## Safe Adaptation For Current Upstream

This should be added without changing the current startup order:

1. prebind runtime listener
2. spawn host bridge
3. run `build_check::verify_qt_runtime()`
4. configure Qt logging
5. construct Qt application and QML engine

The extraction is diagnostic-only. It does not depend on the discarded stash changes to command execution or release staging.

## Recommended Extra Guardrails

If this is implemented, pair it with the existing logging hooks already present in startup:

- keep `build_check::verify_qt_runtime()` before Qt construction
- keep `configure_qt_logging(debug_mode)` before Qt construction
- preserve current icon setup and QML load diagnostics

That combination gives three layers of failure visibility:

1. filesystem/runtime deployment check
2. Qt plugin/QML stderr logging
3. explicit panic when Qt objects fail to initialize

## Recommendation

This extraction is worth reintroducing as a small, targeted upstream-aware change.

It is low-risk compared with the other stashed logic because it improves observability without changing command routing, process supervision, or release artifact layout.