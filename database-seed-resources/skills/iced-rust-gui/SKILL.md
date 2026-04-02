---
name: iced-rust-gui
description: "Use this skill when building native GUI applications in Rust with the iced framework (v0.13). Covers the functional application architecture (AppState / Message / update / view), Task-based async, widget composition, canvas drawing, overlay/z-stack patterns, dark-theme constants, and Windows-specific setup. Based on the supervisor-iced port of Project Memory Supervisor."
category: general
tags:
  - rust
  - iced
  - gui
  - native
  - desktop
language_targets:
  - rust
framework_targets:
  - iced
---

# Iced Rust GUI Development

Guidelines for building native desktop GUI applications in Rust using iced 0.13.  
Based on the Project Memory Supervisor (`supervisor-iced`) ported from QML/CxxQt.

---

## Architecture Overview

```
┌─────────────────────────────────────────┐
│            AppState struct              │
│  (central state — replaces all binding) │
└──────────────┬──────────────────────────┘
               │ read-only borrow
┌──────────────▼──────────────────────────┐
│         view(&AppState)                 │
│  Pure function — builds Element tree    │
└─────────────────────────────────────────┘
               ↑ user interactions produce
┌──────────────┴──────────────────────────┐
│              Message enum               │
│  All events + async results in one type │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│     update(&mut AppState, Message)      │
│  Mutates state; returns Task<Message>   │
└─────────────────────────────────────────┘
               │ async work
┌──────────────▼──────────────────────────┐
│          Task<Message>                  │
│  Wraps reqwest / tokio async calls      │
└─────────────────────────────────────────┘
```

**No Application trait.** iced 0.13 uses the functional API: three free functions passed to `iced::application(...)`.

---

## Cargo.toml

```toml
[package]
name = "my-app"
version = "0.1.0"
edition = "2021"

[[bin]]
name = "my-app"
path = "src/main.rs"

[dependencies]
iced = { version = "0.13", features = ["tokio", "image", "svg", "canvas"] }
tokio = { version = "1", features = ["full"] }
serde       = { version = "1", features = ["derive"] }
serde_json  = "1"
reqwest     = { version = "0.12", features = ["json"] }
rand        = "0.8"
open        = "5"   # open URLs / files in OS default app
tracing     = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter"] }

[target.'cfg(windows)'.dependencies]
windows-sys = { version = "0.59", features = [
    "Win32_Foundation",
    "Win32_UI_WindowsAndMessaging",
    "Win32_System_Console",
] }
```

Feature flags:
- `tokio` — run async Tasks on a Tokio runtime (required for `Task::perform`)
- `canvas` — custom 2-D drawing (e.g. status rings, gauges)
- `image` / `svg` — image and SVG widget support

---

## Project Structure

```
my-app/
├── Cargo.toml
└── src/
    ├── main.rs          # Message enum, init/update/view, main()
    ├── app_state.rs     # AppState struct + sub-types
    └── ui/
        ├── mod.rs       # pub mod declarations + shared theme constants
        ├── panel_a.rs   # Panel A widget (free function returning Element)
        ├── panel_b.rs   # Panel B widget
        └── ...
```

---

## AppState

Central single struct. No reactive bindings — every field is plain Rust. UI reads it via `view(&AppState)`.

```rust
// src/app_state.rs

#[derive(Debug, Clone, Default)]
pub struct AppState {
    // Service status
    pub server_status: ServiceStatus,
    pub server_port:   i32,
    pub server_pid:    i32,
    pub server_uptime: i32,

    // Activity feed
    pub activity: Vec<ActivityEntry>,

    // UI state
    pub selected_tab:  usize,
    pub filter_text:   String,
    pub overlay:       Overlay,
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub enum ServiceStatus {
    #[default] Unknown,
    Running, Starting, Stopping, Stopped, Error,
}

impl ServiceStatus {
    pub fn from_str(s: &str) -> Self { /* … */ }
    pub fn as_str(&self) -> &'static str { /* … */ }
    pub fn color(&self) -> iced::Color {
        match self {
            Self::Running  => iced::Color::from_rgb8(0x3f, 0xb9, 0x50),
            Self::Stopped
            | Self::Error  => iced::Color::from_rgb8(0xf8, 0x51, 0x49),
            Self::Starting
            | Self::Stopping => iced::Color::from_rgb8(0xff, 0xeb, 0x3b),
            Self::Unknown  => iced::Color::from_rgb8(0x9e, 0x9e, 0x9e),
        }
    }
}

/// Panels rendered as overlays above the main layout.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub enum Overlay { #[default] None, Settings, About, Pairing }
```

---

## Message Enum

Every user interaction and every async result is a single variant. Group them with comments.

```rust
#[derive(Debug, Clone)]
pub enum Message {
    // ── Polling ───────────────────────────────────────────────────────────────
    StatusTick,
    StatusUpdated(Result<StatusPayload, String>),

    // ── UI interactions ────────────────────────────────────────────────────────
    TabSelected(usize),
    FilterChanged(String),
    ButtonClicked(String),

    // ── Async results ──────────────────────────────────────────────────────────
    DataLoaded(Result<Vec<MyEntry>, String>),

    // ── Overlays ──────────────────────────────────────────────────────────────
    ShowSettings, CloseSettings,
    ShowAbout,    CloseAbout,

    // ── Misc ──────────────────────────────────────────────────────────────────
    Noop,
}
```

---

## init / update / view + main

```rust
// src/main.rs

mod app_state;
mod ui;

use app_state::AppState;
use iced::{Element, Task, Theme};

// ── init ──────────────────────────────────────────────────────────────────────
fn init() -> (AppState, Task<Message>) {
    let state = AppState { ..Default::default() };
    // Kick off initial data fetch immediately
    (state, Task::done(Message::StatusTick))
}

// ── update ────────────────────────────────────────────────────────────────────
fn update(state: &mut AppState, msg: Message) -> Task<Message> {
    match msg {
        Message::StatusTick => Task::perform(
            async { fetch_status().await },
            Message::StatusUpdated,
        ),

        Message::StatusUpdated(Ok(payload)) => {
            apply_payload(state, &payload);
            // Schedule next poll
            Task::perform(
                async { tokio::time::sleep(std::time::Duration::from_secs(3)).await; },
                |_| Message::StatusTick,
            )
        }
        Message::StatusUpdated(Err(_)) => {
            Task::perform(
                async { tokio::time::sleep(std::time::Duration::from_secs(5)).await; },
                |_| Message::StatusTick,
            )
        }

        Message::TabSelected(idx) => { state.selected_tab = idx; Task::none() }
        Message::FilterChanged(s)  => { state.filter_text  = s;   Task::none() }
        Message::Noop              => Task::none(),
        // …
    }
}

// ── view ──────────────────────────────────────────────────────────────────────
fn view(state: &AppState) -> Element<'_, Message> {
    use iced::widget::{column, container, row, Space};
    use iced::{Background, Length};
    use ui::theme;

    let header  = /* build header row */;
    let content = /* build main content */;
    let footer  = /* build footer row */;

    let root = container(
        column![header, content, footer]
            .spacing(8)
            .padding(12)
            .width(Length::Fill)
            .height(Length::Fill),
    )
    .width(Length::Fill)
    .height(Length::Fill)
    .style(|_| iced::widget::container::Style {
        background: Some(Background::Color(theme::BG_WINDOW)),
        ..Default::default()
    });

    // Overlay layer (see Overlay / Z-Stack section below)
    if matches!(state.overlay, Overlay::None) {
        root.into()
    } else {
        let overlay_el = build_overlay(state);
        iced::widget::stack(vec![root.into(), overlay_el]).into()
    }
}

// ── main ──────────────────────────────────────────────────────────────────────
fn main() -> iced::Result {
    tracing_subscriber::fmt::init();

    iced::application("My App", update, view)
        .window(iced::window::Settings {
            size:     iced::Size { width: 1024.0, height: 768.0 },
            min_size: Some(iced::Size { width: 640.0, height: 480.0 }),
            ..Default::default()
        })
        .theme(|_| Theme::Dark)
        .run_with(init)
}
```

---

## Task (Async)

`Task<Message>` replaces Tokio threads calling back into a Qt bridge.

```rust
// One-shot async HTTP call
Task::perform(
    async move { reqwest::get(&url).await?.json::<Payload>().await },
    Message::DataLoaded,           // wraps Result<Payload, reqwest::Error>
)

// Delayed re-trigger (polling)
Task::perform(
    async { tokio::time::sleep(Duration::from_secs(3)).await; },
    |_| Message::StatusTick,
)

// Immediate message (no async needed)
Task::done(Message::Noop)

// Nothing to do
Task::none()
```

**Multiple tasks:** `Task::batch(vec![task1, task2])`.  
Tasks run concurrently; results arrive as separate `Message` variants.

---

## Widget Building

### Basic primitives

```rust
use iced::widget::{button, column, container, row, scrollable, text, Space};
use iced::{Alignment, Length};

// Row of evenly spaced elements
let header = row![
    text("Title").size(16).color(theme::TEXT_PRIMARY),
    Space::new(Length::Fill, 0.0),   // push next item to the right
    button(text("Action").size(12)).on_press(Message::ButtonClicked("action".into())),
]
.spacing(8)
.align_y(Alignment::Center)
.width(Length::Fill);

// Vertical scroll with a dynamic list
let mut list = iced::widget::Column::new().spacing(4).width(Length::Fill);
for item in &state.items {
    list = list.push(text(item.label.clone()).size(12));
}
let scroll = scrollable(list).height(Length::Fill);
```

### Container styling

```rust
use iced::{Background, Border};

container(content)
    .padding(12)
    .width(Length::Fill)
    .style(|_| iced::widget::container::Style {
        background: Some(Background::Color(theme::BG_CARD)),
        border: Border {
            color:  theme::BORDER_SUBTLE,
            width:  1.0,
            radius: 6.0.into(),
        },
        ..Default::default()
    })
```

### Button styling (custom colour)

```rust
button(text("Restart").size(12))
    .on_press(Message::RestartService)
    .style(|_, _| iced::widget::button::Style {
        background: Some(Background::Color(Color::from_rgb8(0x21, 0x62, 0x2e))),
        border:     Border { radius: 4.0.into(), ..Default::default() },
        text_color: Color::WHITE,
        ..Default::default()
    })
```

---

## Panel Composition (Free Functions)

Each panel is a free function — no structs, no `impl Widget`. Panels accept `&AppState` + message constructors and return `Element<'a, Message>`.

```rust
// src/ui/my_panel.rs

use iced::{widget::{column, text}, Element, Length};
use crate::app_state::AppState;
use super::theme;

pub fn view<'a, Message: Clone + 'a>(
    state:     &'a AppState,
    on_action: impl Fn(String) -> Message + 'a,
    on_close:  Message,
) -> Element<'a, Message> {
    column![
        text("Panel Title").size(14).color(theme::TEXT_PRIMARY),
        // …
    ]
    .spacing(8)
    .width(Length::Fill)
    .into()
}
```

Call from `view()`:

```rust
let panel = my_panel::view(
    state,
    |id| Message::ItemSelected(id),
    Message::ClosePanel,
);
```

### Config struct pattern (for complex widgets)

When a panel has many parameters, use a config struct instead of a long argument list:

```rust
pub struct CardConfig<'a, Message> {
    pub title:       &'a str,
    pub status:      &'a ServiceStatus,
    pub accent:      Color,
    pub on_action:   Message,
    pub secondary:   Option<Message>,
}

pub fn view<'a, Message: Clone + 'a>(cfg: CardConfig<'a, Message>) -> Element<'a, Message> { … }
```

---

## Canvas (Custom Drawing)

```rust
// src/ui/status_ring.rs
use iced::{
    widget::canvas::{self, Frame, Path, Stroke},
    Color, Element, Length, Point,
};
use std::f32::consts::PI;

#[derive(Debug, Clone)]
pub struct StatusRing { pub status: ServiceStatus, pub accent: Color }

impl<Message> canvas::Program<Message> for StatusRing {
    type State = ();

    fn draw(&self, _: &(), renderer: &iced::Renderer, _: &iced::Theme,
            bounds: iced::Rectangle, _: iced::mouse::Cursor) -> Vec<canvas::Geometry> {
        let mut frame = Frame::new(renderer, bounds.size());
        let center = Point::new(38.0 / 2.0, 38.0 / 2.0);

        // Background track
        frame.stroke(
            &Path::circle(center, 14.0),
            Stroke::default().with_color(TRACK_COLOR).with_width(3.0),
        );

        // Fill arc based on status
        if matches!(self.status, ServiceStatus::Running) {
            let arc = Path::new(|b| b.arc(canvas::path::Arc {
                center,
                radius: 14.0,
                start_angle: iced::Radians(-PI / 2.0),
                end_angle:   iced::Radians(3.0 * PI / 2.0),
            }));
            frame.stroke(&arc, Stroke::default().with_color(self.accent).with_width(3.0));
        }
        vec![frame.into_geometry()]
    }
}

// Render in a view function:
pub fn view<Message: 'static>(ring: StatusRing) -> Element<'static, Message> {
    iced::widget::canvas(ring)
        .width(Length::Fixed(38.0))
        .height(Length::Fixed(38.0))
        .into()
}
```

---

## Overlay / Z-Stack Pattern

Use `iced::widget::stack(vec![base, overlay])` to layer elements. Last element renders on top.

```rust
fn view(state: &AppState) -> Element<'_, Message> {
    let base = build_main_layout(state);

    match &state.overlay {
        Overlay::None => base.into(),
        Overlay::Settings => {
            let dim = container(Space::new(Length::Fill, Length::Fill))
                .width(Length::Fill).height(Length::Fill)
                .style(|_| iced::widget::container::Style {
                    background: Some(Background::Color(Color { r: 0.0, g: 0.0, b: 0.0, a: 0.6 })),
                    ..Default::default()
                });
            let dialog = settings_panel::view(state, Message::CloseSettings);
            iced::widget::stack(vec![base.into(), dim.into(), dialog]).into()
        }
        // …
    }
}
```

---

## Theme Constants

Centralise colour tokens in `src/ui/mod.rs`:

```rust
pub mod theme {
    use iced::Color;
    // Backgrounds
    pub const BG_WINDOW:     Color = Color { r: 0.059, g: 0.075, b: 0.098, a: 1.0 };
    pub const BG_PANEL:      Color = Color { r: 0.086, g: 0.106, b: 0.133, a: 1.0 };
    pub const BG_CARD:       Color = Color { r: 0.110, g: 0.129, b: 0.157, a: 1.0 };
    // Borders
    pub const BORDER_SUBTLE: Color = Color { r: 0.188, g: 0.212, b: 0.239, a: 1.0 };
    // Text
    pub const TEXT_PRIMARY:  Color = Color { r: 0.788, g: 0.820, b: 0.851, a: 1.0 };
    pub const TEXT_SECONDARY:Color = Color { r: 0.545, g: 0.580, b: 0.620, a: 1.0 };
    pub const TEXT_ACCENT:   Color = Color { r: 0.345, g: 0.651, b: 1.000, a: 1.0 };
    // Status
    pub const CLR_RUNNING:   Color = Color { r: 0.247, g: 0.725, b: 0.314, a: 1.0 };
    pub const CLR_STOPPED:   Color = Color { r: 0.973, g: 0.318, b: 0.286, a: 1.0 };
    pub const CLR_YELLOW:    Color = Color { r: 1.000, g: 0.922, b: 0.231, a: 1.0 };
}
```

Reference: `theme::BG_WINDOW`, `theme::TEXT_PRIMARY`, etc.

---

## Async HTTP (reqwest + serde)

```rust
#[derive(Debug, Clone, serde::Deserialize, Default)]
pub struct StatusPayload {
    pub server_status: Option<String>,
    pub server_port:   Option<i32>,
}

async fn fetch_status() -> Result<StatusPayload, String> {
    reqwest::Client::new()
        .get("http://127.0.0.1:3000/api/status")
        .send().await
        .map_err(|e| e.to_string())?
        .json::<StatusPayload>().await
        .map_err(|e| e.to_string())
}
```

---

## Windows Setup

Hide console window for release builds and set DPI-aware manifest:

```rust
// src/main.rs — top level
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
```

If you need to force the console always (even release) for debugging:
```toml
# Cargo.toml
[[bin]]
name = "my-app"
# Remove any windows_subsystem annotation
```

---

## Common Pitfalls

| Issue | Fix |
|-------|-----|
| `Element` lifetime errors | Ensure closures are `+ 'a` and all refs are `'a` |
| Button pressed with `None` never enabled | Use `button(…).on_press_maybe(opt_msg)` or guard with `if enabled` |
| Canvas not repainting | iced caches canvas; change `StatusRing` state to trigger a redraw |
| Scrollable doesn't fill height | Set `.height(Length::Fill)` on the scrollable and its parent container |
| `Task::perform` closure not `Send` | All captured values must implement `Send`; avoid `Rc`, `Cell` |

---

## References

- [iced GitHub](https://github.com/iced-rs/iced)
- [iced 0.13 guide](https://book.iced.rs/)
- [iced API docs](https://docs.rs/iced/0.13)
- Canonical implementation: `D:\2026\ProjectMemory-NewGoo\supervisor-iced\`
