---
name: qml-cxxqt-to-iced-refactor
description: "Use this skill when migrating a Qt/QML + CxxQt Rust application to native iced Rust. Covers the full mapping from CxxQt #[qproperty] / #[qinvokable] constructs to AppState fields / Message variants, QML layouts to iced widget trees, QML Canvas to iced canvas::Program, the copy-first workflow, and a one-file-at-a-time porting strategy. Based on the Project Memory Supervisor port (QML+CxxQt → supervisor-iced)."
category: general
tags:
  - rust
  - iced
  - qml
  - cxxqt
  - refactoring
  - migration
language_targets:
  - rust
framework_targets:
  - iced
  - cxxqt
  - qml
---

# QML + CxxQt → Iced Rust: Migration Skill

A step-by-step guide for porting a Rust application backed by CxxQt + QML to a fully native iced 0.13 GUI — based on the supervisor port inside the Project Memory codebase.

---

## Key Principle: Copy First, Refactor Second

**Never modify the live application.** Before touching anything:

1. Copy the entire QML source tree to a `ref/qml/` folder inside the new crate: it becomes your read-only reference.
2. Copy the CxxQt bridge files to `ref/bridge/`: these map to your new Message variants.
3. Keep the live crate untouched until the port is complete and validated.

```
new-crate/
├── ref/
│   ├── qml/                # frozen copy of all .qml files
│   └── bridge/             # frozen copy of cxxqt_bridge/
└── src/
    ├── main.rs             # new iced entry point
    ├── app_state.rs
    └── ui/
        └── ...             # one .rs file per QML component
```

---

## Architecture Mapping

```
┌─────────────────────────────────┬──────────────────────────────────────┐
│ CxxQt / QML                     │ iced Rust equivalent                 │
├─────────────────────────────────┼──────────────────────────────────────┤
│ SupervisorGuiBridge QObject      │ AppState struct                      │
│ #[qproperty(T, some_prop)]       │ pub some_prop: T  in AppState        │
│ #[qinvokable] fn do_action()     │ Message::DoAction variant            │
│                                  │  + handler in update()               │
│ Qt signal (property changed)     │ Message variant + update() mutation  │
│ async slot / C++ worker thread   │ Task::perform(async { … }, Message)  │
│ QML Connections { onXChanged }   │ update() match arm                   │
│ QML property binding (≈ computed)│ computed in view() from AppState     │
│ CxxQt bridge module              │ eliminated — no bridge needed        │
│ build.rs (CxxQt C++ gen)         │ simple Cargo.toml, no build.rs       │
├─────────────────────────────────┼──────────────────────────────────────┤
│ QML ApplicationWindow            │ iced::application("title", upd, view)│
│ MaterialDark theme               │ .theme(|_| Theme::Dark)              │
│ Window.onClosing → hide          │ Message::CloseRequested handler       │
│                                  │  → `iced::window::close(id)` or hide │
├─────────────────────────────────┼──────────────────────────────────────┤
│ QML RowLayout / Row              │ row![…] / Row::new().push(…)         │
│ QML ColumnLayout / Column        │ column![…] / Column::new().push(…)   │
│ QML Item { Layout.fillWidth }    │ .width(Length::Fill)                 │
│ QML ScrollView + ListView/Rep.   │ scrollable(Column::new().extend(…))  │
│ QML StackLayout / StackView      │ iced::widget::stack(vec![base, ovl]) │
│ QML Loader (conditional panel)   │ `if cond { some_panel.into() } else` │
│ QML Component.onCompleted        │ Task::done(Message::Init) from init()│
├─────────────────────────────────┼──────────────────────────────────────┤
│ QML Canvas + Context2D           │ canvas::Program + Frame + Path       │
│ QML NumberAnimation / Behavior   │ iced Subscription (timer tick)       │
│                                  │  + interpolated state field          │
│ QML Rectangle (background box)   │ container(…).style(background: …)   │
│ QML Text / Label                 │ text("…").size(n).color(c)           │
│ QML Button                       │ button(text("…")).on_press(Message)  │
│ QML ComboBox                     │ pick_list(&OPTIONS, selected, Msg)   │
│ QML TextField                    │ text_input("placeholder", &val)      │
│                                   │  .on_change(Message::FieldChanged)  │
│ QML CheckBox                     │ checkbox("label", checked, Message)  │
│ QML Image                        │ image(Handle::from_path("…"))        │
│ QML Image (SVG)                  │ svg(Handle::from_path("…"))          │
└─────────────────────────────────┴──────────────────────────────────────┘
```

---

## Step 1 — Inventory CxxQt Properties → AppState Fields

Open `supervisor/src/cxxqt_bridge/mod.rs`. Every `#[qproperty]` becomes one field in `AppState`.

**CxxQt bridge (before):**
```rust
// cxxqt_bridge/mod.rs
#[qobject]
#[qml_element]
pub struct SupervisorGuiBridge {
    base: qobject::SupervisorGuiBridge,

    #[qproperty(bool, window_visible)]
    window_visible: bool,

    #[qproperty(QString, mcp_server_status)]
    mcp_server_status: QString,

    #[qproperty(i32, mcp_server_port)]
    mcp_server_port: i32,

    #[qproperty(i32, mcp_server_pid)]
    mcp_server_pid: i32,

    #[qproperty(i32, total_mcp_connections)]
    total_mcp_connections: i32,

    // … 25+ more properties
}
```

**iced AppState (after):**
```rust
// app_state.rs
#[derive(Debug, Clone, Default)]
pub struct AppState {
    pub window_visible:        bool,
    pub mcp_server_status:     ServiceStatus,
    pub mcp_server_port:       i32,
    pub mcp_server_pid:        i32,
    pub total_mcp_connections: i32,
    // … one field per qproperty
}
```

`QString` → `String`.  `bool` → `bool`.  `i32` → `i32`.  Enum-like `QString` → custom Rust enum.

---

## Step 2 — Inventory CxxQt Invokables → Message Variants

Every `#[qinvokable]` method on the bridge becomes a `Message` variant + corresponding `update()` match arm.

**CxxQt (before):**
```rust
#[qinvokable]
pub fn restart_mcp_server(self: Pin<&mut Self>) { /* … spawn process … */ }

#[qinvokable]
pub fn open_dashboard_url(self: Pin<&mut Self>) { open::that("http://…").ok(); }
```

**iced Message + update (after):**
```rust
// Message enum
Message::RestartMcpServer,
Message::OpenDashboardUrl,

// update() handler
Message::RestartMcpServer => {
    Task::perform(
        async { restart_server_api_call().await },
        Message::RestartCompleted,
    )
}
Message::OpenDashboardUrl => {
    let _ = open::that("http://localhost:3000");
    Task::none()
}
```

---

## Step 3 — Map QML Layouts to iced Widgets

Translate each QML file to a Rust free function in `src/ui/`.

### ApplicationWindow → iced::application

**QML (before):**
```qml
ApplicationWindow {
    id:      root
    title:   "Project Memory Supervisor"
    width:   1080
    height:  960
    visible: true

    Material.theme:  Material.Dark
    Material.accent: Material.Blue

    onClosing: {
        close.accepted = false
        supervisorGuiBridge.hideWindow()
    }
    // …
}
```

**iced main.rs (after):**
```rust
fn main() -> iced::Result {
    iced::application("Project Memory Supervisor", update, view)
        .window(iced::window::Settings {
            size:     iced::Size { width: 1080.0, height: 960.0 },
            min_size: Some(iced::Size { width: 640.0, height: 620.0 }),
            ..Default::default()
        })
        .theme(|_| iced::Theme::Dark)
        .run_with(init)
}
// Window close → intercept in update():
// Message::WindowCloseRequest => {
//     // Hide to tray or actually close
//     iced::window::close(id)
// }
```

---

### RowLayout / ColumnLayout → row! / column!

**QML (before):**
```qml
RowLayout {
    anchors.fill: parent
    spacing: 8

    Text { text: serviceInfo.name; color: textPrimary }
    Item  { Layout.fillWidth: true }
    Button { text: "Restart"; onClicked: bridge.restartService() }
}
```

**iced (after):**
```rust
let row = row![
    text(&state.service_name).color(theme::TEXT_PRIMARY),
    Space::new(Length::Fill, 0.0),
    button(text("Restart").size(12)).on_press(Message::RestartService),
]
.spacing(8)
.align_y(Alignment::Center)
.width(Length::Fill);
```

---

### ScrollView + Repeater → scrollable + Column loop

**QML (before):**
```qml
ScrollView {
    ListView {
        model: activityModel
        delegate: ActivityRow { text: model.label }
    }
}
```

**iced (after):**
```rust
let mut list = iced::widget::Column::new().spacing(4).width(Length::Fill);
for entry in &state.activity {
    list = list.push(
        text(format!("{}: {}", entry.agent, entry.event))
            .size(11)
            .color(theme::TEXT_SECONDARY),
    );
}
scrollable(list).height(Length::Fill)
```

---

### Rectangle with border → container with style

**QML (before):**
```qml
Rectangle {
    color:        "#1c2128"
    radius:       6
    border.color: "#30363d"
    border.width: 1
}
```

**iced (after):**
```rust
container(content)
    .padding(10)
    .style(|_| iced::widget::container::Style {
        background: Some(Background::Color(theme::BG_CARD)),
        border: iced::Border {
            color:  Color::from_rgb8(0x30, 0x36, 0x3d),
            width:  1.0,
            radius: 6.0.into(),
        },
        ..Default::default()
    })
```

---

## Step 4 — Replace CxxQt Canvas Widgets with canvas::Program

**QML Canvas (before):**
```qml
Canvas {
    width: 38; height: 38
    onPaint: {
        var ctx = getContext("2d")
        ctx.beginPath()
        ctx.arc(19, 19, 14, 0, 2 * Math.PI)
        ctx.strokeStyle = accentColor
        ctx.lineWidth   = 3
        ctx.stroke()
    }
}
```

**iced canvas (after):**
```rust
use iced::widget::canvas::{self, Frame, Path, Stroke};

struct StatusRing { status: ServiceStatus }

impl<Message> canvas::Program<Message> for StatusRing {
    type State = ();
    fn draw(&self, _: &(), renderer: &iced::Renderer, _: &iced::Theme,
            bounds: iced::Rectangle, _: iced::mouse::Cursor) -> Vec<canvas::Geometry> {
        let mut frame = Frame::new(renderer, bounds.size());
        let center = iced::Point::new(19.0, 19.0);
        frame.stroke(
            &Path::circle(center, 14.0),
            Stroke::default().with_color(self.status.color()).with_width(3.0),
        );
        vec![frame.into_geometry()]
    }
}

// Render it:
iced::widget::canvas(StatusRing { status: state.server_status.clone() })
    .width(Length::Fixed(38.0)).height(Length::Fixed(38.0)).into()
```

---

## Step 5 — Replace QML Animations with iced Subscriptions

QML `Behavior on width { NumberAnimation { duration: 200 } }` has no direct equivalent. Options:

1. **Skip animation** — snap to final value. Acceptable for most panel expand/collapse.
2. **Tick-based subscription** — emit `Message::AnimTick` on a short interval, interpolate a `f32` field in AppState.

```rust
// AppState
pub panel_width: f32,           // current animated width
pub panel_target_width: f32,    // target after toggle

// update()
Message::PanelToggle => {
    state.panel_target_width = if state.panel_expanded { 380.0 } else { 0.0 };
    Task::none()
}
Message::AnimTick => {
    let diff = state.panel_target_width - state.panel_width;
    if diff.abs() < 1.0 { state.panel_width = state.panel_target_width; }
    else { state.panel_width += diff * 0.25; }
    Task::none()
}

// subscription (in fn subscription(state: &AppState))
iced::time::every(Duration::from_millis(16)).map(|_| Message::AnimTick)
```

For most panel toggles, option 1 (no animation) is correct — simpler, no subscription needed.

---

## Step 6 — Eliminate the CxxQt Bridge Module

The bridge typically lives in `supervisor/src/cxxqt_bridge/` with files like:

```
mod.rs            → delete (qproperty declarations)
ffi.rs            → delete (unsafe extern blocks)
initialize.rs     → port async init logic to init() + Task::done(Message::Init)
qr_bridge.rs      → port as Task::perform(async { generate_qr(…) }, Message::QrReady)
plans_actions.rs  → port each invokable to a Message variant + async Task
```

None of these files carry over. Each `#[qinvokable]` becomes a `Task::perform` in `update()`.

---

## Step 7 — Drop `build.rs`

CxxQt requires a `build.rs` that runs the C++ code generator. An iced port needs none of this.

**Delete `build.rs` entirely.** If there are legitimate build steps (e.g. embedding version), replace with a minimal `build.rs` that uses `println!("cargo:rustc-env=…")`.

---

## Cargo.toml Changes

**Before (CxxQt):**
```toml
[build-dependencies]
cxx-qt-build = "0.7"

[dependencies]
cxx = "1"
cxx-qt = "0.7"
cxx-qt-lib = "0.7"
# … Qt system deps
```

**After (iced):**
```toml
[dependencies]
iced   = { version = "0.13", features = ["tokio", "image", "svg", "canvas"] }
tokio  = { version = "1", features = ["full"] }
serde      = { version = "1", features = ["derive"] }
serde_json = "1"
reqwest    = { version = "0.12", features = ["json"] }
open       = "5"

# No [build-dependencies] unless you need one
```

---

## One-Component-at-a-Time Strategy

Port in this order to ensure the app runs (and is reviewable) at each stage:

1. `AppState` struct + `ServiceStatus` enum — no UI yet, just data model
2. `main.rs` skeleton — `iced::application(…)` with empty `view()` that returns a `text("placeholder")`
3. Port top-level layout (`main.qml` → `view()` in main.rs) with stubbed panel calls
4. Port each panel file in isolation, one per PR/commit:
   - Start with read-only panels (no callbacks) — simplest
   - Then panels with simple callbacks (`Message::X` passed as value)
   - Then panels with closure callbacks (`impl Fn(String) -> Message + 'a`)
5. Port canvas widgets last — they require the most careful lifetime handling
6. Wire up all async tasks (`fetch_*` helpers) once panels are stable
7. Final: confirm `ref/qml/` and `ref/bridge/` are only referenced, never modified

---

## Common Migration Mistakes

| Problem | Cause | Fix |
|---------|-------|-----|
| Compiler error on `Element<'_, Message>` lifetime | Callback closure not annotated `+ 'a` | Add `'a` to the closure bound and function signature |
| `QString` not found | CxxQt removed from deps | Replace all `QString` with `String` |
| `build.rs` fails | Stale CxxQt build script | Delete `build.rs` and remove `[build-dependencies]` |
| Property change not reflecting in UI | Forgot to mutate AppState in update() | Every `#[qproperty]` setter call → must become a state mutation in the right `Message` arm |
| QML `color` as hex string vs iced Color | Type mismatch | Use `Color::from_rgb8(0xRR, 0xGG, 0xBB)` or the theme constant |
| Scrollable has zero height | Parent container has no `Length::Fill` | Propagate `Length::Fill` up the widget tree |

---

## Quick Reference: qproperty Type Mapping

| CxxQt type | iced / Rust type |
|------------|-----------------|
| `bool` | `bool` |
| `i32` | `i32` |
| `QString` | `String` |
| `QStringList` | `Vec<String>` |
| `f64` / `f32` | `f64` / `f32` |
| Enum-coded `QString` | Custom Rust `enum` with `from_str` / `as_str` |
| `QVariantMap` (JSON data) | Custom `#[derive(Deserialize)]` struct |
| Per-service structs | `ServiceInfo { status, port, pid, uptime_secs, runtime }` |

---

## References

- Source of truth for patterns: `D:\2026\ProjectMemory-NewGoo\supervisor-iced\`
- Live QML+CxxQt source (read-only reference): `c:\Users\User\Project_Memory_MCP\Project-Memory-MCP\supervisor\`
- Plan for the full port: plan `mn62jd5e_fe0133db`
- Companion skill: `iced-rust-gui` (iced architecture fundamentals)
