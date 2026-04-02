# Supervisor GUI: iced vs QML — Feature Gap Analysis

Last updated: 2026-04-02  
Source of truth for the iced parity plan.

---

## Overview

Both supervisor GUI implementations target identical functionality and visual design.
The QML version (Qt 6 + CxxQt bridge) is the current feature-complete reference.
The iced version (pure Rust, iced 0.13) is ~95% feature-complete.

This document records every confirmed gap, the root cause, and the implementation approach needed to close it.

---

## Gap 1 — System Tray Integration

### What QML has
- `Qt.labs.platform.SystemTrayIcon` with context menu
- Menu items: **Show**, **Minimize to Tray**, **Restart Services**, **Quit**
- Tooltip shows currently focused workspace name
- Tray notification fires when a focused-workspace generated-event occurs
- Window close button minimizes to tray instead of quitting (overrides `onClosing`)

### What iced has
- A "Minimize to Tray" button in the footer that does nothing functional
- No tray icon, no tray menu, no tray notifications
- Window close = process exit

### Root cause
`iced 0.13` has no built-in tray API. The standard approach is to pair iced with
[`tray-icon`](https://crates.io/crates/tray-icon) (maintained by the Tauri project),
which provides a platform-native tray icon and menu independent of the GUI framework,
communicating via a channel or event loop integration.

### Implementation approach
1. Add `tray-icon` crate (+ `winit` feature for Windows event loop hook)
2. Create tray icon from existing `.ico`/`.png` asset at startup
3. Build `tray-icon::menu::Menu` with the four items
4. On `MenuEvent` received via `tray_icon::menu::MenuEvent::receiver()`:
   - Show → restore window, set `app_state.window_visible = true`
   - Minimize → hide window, `window_visible = false`
   - Restart Services → dispatch `Message::RestartAllServices`
   - Quit → `std::process::exit(0)`
5. Override window close to hide rather than quit:
   - Use `iced::window::close_events()` subscription + intercept with hide logic
   - Or use platform-specific `WindowEvent::CloseRequested` handling
6. Tray tooltip: update via `tray_icon::TrayIcon::set_tooltip()` when focused workspace changes
7. Tray notification: use `notify-rust` (cross-platform) or `tray-icon`'s built-in notification to fire on `focused_workspace_generated` activity events

### Files affected
- `src/main.rs` — tray setup, event loop integration
- `src/app_state.rs` — add `window_visible: bool`, `focused_workspace_name: String`
- `src/ui/mod.rs` or new `src/tray.rs` — tray lifecycle helpers

---

## Gap 2 — Chat Pop-out Window

### What QML has
- A pop-out button (⤢) in the ChatbotPanel header
- Clicking it opens the chat as a separate OS window (`Window { }` component)
- The pop-out window is independently resizable and can be moved off-screen
- Main window chat panel collapses when pop-out is open; re-expands on close
- Pop-out inherits current workspace selection and message history

### What iced has
- Chat panel renders inline only
- No pop-out button exists

### Root cause
`iced 0.13` added multi-window support via `iced::multi_window` and `iced::window::open()`.
It's fully supported but requires restructuring the app to use the multi-window API.

### Implementation approach
1. Switch app entry point from `iced::application` to `iced::multi_window::run`
   (or use `iced::window::open` Task which works in single-window apps in iced 0.13+)
2. Add `Message::OpenChatPopout`, `Message::CloseChatPopout(window::Id)`
3. On `OpenChatPopout`:
   - Call `iced::window::open(Settings { size: (480, 720), title: "Chat", .. })`
   - Store returned `window::Id` in `AppState`
   - Set `app_state.chat_popped_out = true` → collapses inline panel
4. Render `ChatbotPanel` in the new window when `window::Id` matches
5. On pop-out close event → set `chat_popped_out = false`, clear stored `Id`
6. Add pop-out toggle button (⤢) to `ChatbotPanel` header bar

### Files affected
- `src/main.rs` — switch to multi-window, add window event handling
- `src/app_state.rs` — add `chat_popped_out: bool`, `chat_window_id: Option<window::Id>`
- `src/ui/chatbot_panel.rs` — add toggle button, conditional rendering

---

## Gap 3 — Panel Expansion Animations

### What QML has
- Left sidebar (plans) and right sidebar (chat) animate width on expand/collapse:
  `Behavior on width { NumberAnimation { duration: 180; easing.type: Easing.OutCubic } }`
- Plan card detail area animates `implicitHeight`:
  `Behavior on implicitHeight { NumberAnimation { duration: 180; easing.type: Easing.OutCubic } }`
- Smooth, polished feel — no jarring layout jumps

### What iced has
- Hard cuts: panels snap instantly to expanded/collapsed width
- Plan cards show/hide detail block with no transition

### Root cause
iced does not have a built-in animation/transition system comparable to QML `Behavior`.
Animations must be driven manually by storing interpolated values in state and advancing
them on each frame via a subscription.

### Implementation approach

**Option A — Manual lerp via subscription (recommended):**
1. Add to `AppState`:
   ```rust
   pub plans_panel_width: f32,      // current animated value (44.0–460.0)
   pub plans_panel_target: f32,     // target (44.0 or 460.0)
   pub chat_panel_width: f32,
   pub chat_panel_target: f32,
   ```
2. Add `Message::AnimationTick` driven by `iced::time::every(Duration::from_millis(16))`
   subscription (active only when any panel is mid-animation)
3. On each tick, lerp current → target at ~`(target - current) * 0.25` (approximate cubic ease-out)
4. Use the animated `plans_panel_width` / `chat_panel_width` values when sizing columns in `view()`
5. For plan card height: store `expanded_height: f32` per plan entry, animate same way

**Option B — iced `animation` crate:**
- [`iced_anim`](https://crates.io/crates/iced_anim) provides Spring/Tween animatables
  compatible with iced 0.13. Lower boilerplate than manual lerp.

### Files affected
- `src/app_state.rs` — animation fields per panel/card
- `src/main.rs` — add animation subscription
- `src/ui/plans_panel.rs` — use animated width
- `src/ui/chatbot_panel.rs` — use animated width
- `src/ui/plan_card.rs` (if split out) — use animated height per card

---

## Gap 4 — Tray Notifications

### What QML has
- `SystemTrayIcon.showMessage(title, body)` fires when a `focused_workspace_generated`
  activity event is received during activity polling
- Surfaces background AI activity to the user when the window is hidden

### What iced has
- Nothing; activity events are only visible in the in-app feed

### Root cause
Subset of Gap 1 (tray integration). Once `tray-icon` is added, notifications can be
sent via `notify-rust` or the platform notification API directly.

### Implementation approach
- After implementing Gap 1, in the `Message::ActivityUpdated` handler:
  - Check if any new event has `event_type` matching `focused_workspace_generated`
  - If `window_visible == false`, fire a desktop notification
  - Use `notify-rust` crate for cross-platform support:
    ```rust
    notify_rust::Notification::new()
        .summary("Project Memory")
        .body(&event.description)
        .show()?;
    ```

### Files affected
- `src/main.rs` or `src/app_state.rs` — notification trigger in activity update handler
- `Cargo.toml` — add `notify-rust`

---

## Summary Table

| Gap | Complexity | New Crates | Key Files |
|-----|-----------|------------|-----------|
| 1. System tray | Medium | `tray-icon`, `notify-rust` | `main.rs`, `app_state.rs` |
| 2. Chat pop-out | Medium | none (built-in iced) | `main.rs`, `chatbot_panel.rs` |
| 3. Panel animations | Low–Medium | optional `iced_anim` | `app_state.rs`, panel files |
| 4. Tray notifications | Low (depends on Gap 1) | `notify-rust` | `main.rs` |

Implementation order: **3 → 1+4 → 2**
(Animations are self-contained; tray is a prerequisite for notifications; pop-out is independent but requires multi-window refactor so save for last.)

---

## No-Gap Features (confirmed present in both)

All of the following were verified present in both implementations:

- 6-service grid with start/stop/restart/upgrade/build-restart per service
- Plans panel: Active/All tabs, workspace filter, expandable cards, progress bars,
  copy details, open in dashboard, launch Gemini/Claude CLI, create plan, backup, register WS
- Sprints panel: status tabs, expandable goals, toggle goal completion
- Sessions panel: real-time list, stop session
- Activity feed: 15 events, 3s polling, color-coded types
- AI chat: Gemini/Copilot/Claude providers, 600ms tool-call polling, API key config, clear history
- Cartographer: workspace scan, file/timing stats, disabled when MCP offline
- MCP proxy stats: counters + 40-sample sparkline
- Event broadcast: toggle + counters
- Config TOML editor: in-app edit, validation, open external
- Settings overlay: 5 categories
- About panel, pairing QR dialog, shutdown confirmation dialog
- All service icons drawn procedurally (no image assets)
- Identical dark theme color palette
