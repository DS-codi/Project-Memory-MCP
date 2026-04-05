# Project Memory Supervisor (iced) — UI Features & Components Reference

> **Scope:** Every feature and UI element of the `supervisor-iced` application (`supervisor-iced/src/`), a pure-Rust rewrite of the QML supervisor using the [iced](https://github.com/iced-rs/iced) GUI framework.

---

## Table of Contents

1. [Application Shell](#1-application-shell)
2. [Shared Components](#2-shared-components)
   - [ServiceCard](#21-servicecard)
   - [StatusRing](#22-statusring)
   - [ServiceIcon](#23-serviceicon)
   - [PairingDialog](#24-pairingdialog)
3. [Plans Panel](#3-plans-panel-plans_panelrs)
4. [Sprints Panel](#4-sprints-panel-sprints_panelrs)
5. [Sessions Panel](#5-sessions-panel-sessions_panelrs)
6. [Chatbot Panel](#6-chatbot-panel-chatbot_panelrs)
7. [Activity Panel](#7-activity-panel-activity_panelrs)
8. [Cartographer Panel](#8-cartographer-panel-cartographer_panelrs)
9. [Settings Panel](#9-settings-panel-settings_panelrs)
10. [MCP Proxy Panel](#10-mcp-proxy-panel-mcp_proxy_panelrs)
11. [Event Broadcast Panel](#11-event-broadcast-panel-event_broadcast_panelrs)
12. [About Panel](#12-about-panel-about_panelrs)
13. [System Tray](#13-system-tray)
14. [App State & Message Architecture](#14-app-state--message-architecture)
15. [Backend Modules](#15-backend-modules)
16. [REST API Endpoints Used](#16-rest-api-endpoints-used)

---

## 1. Application Shell

### Technology Stack

| Item | Value |
|---|---|
| Framework | iced 0.13 |
| iced features | `tokio`, `image`, `svg`, `canvas` |
| Async runtime | tokio 1.x (full features) |
| HTTP client | reqwest 0.12 + JSON |
| System tray | tray-icon 0.19 |
| Notifications | notify-rust 4 |
| System info | sysinfo 0.29 |
| QR codes | qrcode 0.14 (pure Rust — no CxxQt bridge) |
| mDNS | mdns-sd 0.13 |
| Windows integration | windows-sys 0.59 (Job Objects, console) |

### Window Configuration

| Property | Primary window | Chat pop-out window |
|---|---|---|
| Initial size | 1080 × 960 px | 480 × 720 px |
| Minimum size | 640 × 620 px | — |
| Resizable | yes | yes |
| Icon | `supervisor_blue.png` | none |
| Mode | Windowed / Hidden (for tray) | Windowed |

### Colour Palette

| Name | RGB | Role |
|---|---|---|
| `BG_WINDOW` | `(15, 19, 25)` | Main background |
| `BG_PANEL` | `(22, 27, 34)` | Panel/sidebar backgrounds |
| `BG_CARD` | `(28, 33, 40)` | Card backgrounds |
| `BORDER_SUBTLE` | `(48, 54, 61)` | Borders |
| `TEXT_PRIMARY` | `(201, 209, 217)` | Main body text |
| `TEXT_SECONDARY` | `(139, 148, 158)` | Labels / secondary text |
| `TEXT_ACCENT` | `(88, 166, 255)` | Links / accent text |
| `CLR_RUNNING` | `(63, 185, 80)` | Green — service running |
| `CLR_STOPPED` | `(248, 81, 73)` | Red — service stopped / error |
| `CLR_YELLOW` | `(255, 235, 59)` | Yellow — transitional |
| `CLR_BLUE` | `(56, 139, 250)` | Info / accents / borders |

### Window Layout

```
ApplicationWindow (1080 × 960)
├── HEADER row
│   ├── PM logo canvas (36×36)
│   ├── "PROJECT MEMORY SUPERVISOR" title
│   └── [Shut Down] button
├── BODY row
│   ├── PlansPanel      (44 px collapsed ↔ 460 px expanded, animated)
│   ├── Scrollable content column
│   │   ├── MCP Servers grid    (2 columns)
│   │   ├── Services grid       (2 columns)
│   │   ├── Configured Servers  (dynamic, 2-column grid)
│   │   ├── Active Sessions + Recent Activity row
│   │   ├── Sessions Dashboard  (not present in iced version)
│   │   ├── Cartographer + MCP Proxy + Event Broadcast row
│   │   └── Action Feedback label
│   └── ChatbotPanel    (44 px collapsed ↔ 380 px expanded, animated)
└── FOOTER row
    ├── [⚙ Settings] button
    └── [Minimize to Tray] button
```

**Note:** The "Virtual Monitor" button and `SessionsDashboardPanel` present in the QML version are absent.

### Overlay Stack

All overlays are rendered as modal layers over the main window (centered, with a 60% black backdrop):

1. About panel overlay
2. Pairing QR dialog overlay
3. Settings panel overlay
4. Config editor overlay (raw TOML)
5. Shutdown confirmation overlay

### Animation System

The iced version uses a **tick-based interpolation** system for smooth panel animations:

- Tick interval: 16 ms (60 FPS)
- Interpolation factor (EASE): 0.25 per tick
- `animation_running` flag: subscription only active when `true` (avoids idle CPU usage)
- **Plans sidebar:** interpolates `plans_panel_width` → `plans_panel_target_width` (44 ↔ 460)
- **Chat sidebar:** interpolates `chat_panel_width` → `chat_panel_target_width` (44 ↔ 380)
- **Plan cards:** each plan has an `expanded_height` field (0.0 ↔ 180.0) animated per tick
- Panels use `clip(true)` to prevent overflow during mid-animation states

### Subscriptions

| Subscription | Condition | Purpose |
|---|---|---|
| `AnimationTick` (16 ms) | only when `animation_running = true` | Drives sidebar/plan expand animations |
| `WindowCloseRequested` | always | Intercepts OS close → hide to tray |

### Polling (self-scheduling Tasks)

| Poll | Interval | Source |
|---|---|---|
| Status update | 3 s (success) / 5 s (error) | `GET /api/supervisor-status` via fallback API |
| Tray events | 200 ms | Non-blocking `try_recv()` on sync channel |

### Keyboard Shortcuts

**None.** The application is entirely mouse-driven. No key press handlers exist anywhere.

### Startup Sequence

1. Initialize tracing
2. Initialize Windows Job Objects (process lifecycle)
3. Parse CLI args (`--config <path>`)
4. Load `supervisor.toml`
5. Load persisted chatbot state
6. Validate MCP runner configuration
7. Start `ProcessManager` (spawn all services)
8. Acquire single-instance lock (PID file)
9. Start lock heartbeat (5 s interval)
10. Initialize system tray (4-item menu)
11. Launch iced daemon → open main window

---

## 2. Shared Components

### 2.1 ServiceCard

**File:** `supervisor-iced/src/ui/service_card.rs`

Stateless function component. Takes a `ServiceCardConfig` and a set of `Message` callbacks; returns an `Element`.

#### ServiceCardConfig Fields

| Field | Type | Purpose |
|---|---|---|
| `name` | `&str` | Service display name |
| `status` | `ServiceStatus` | Current status enum |
| `accent` | `Color` | Ring and icon accent colour |
| `icon_bg` | `Color` | Icon box background colour |
| `icon` | `ServiceIcon` | Which icon variant to draw |
| `info1` | `Option<&str>` | Primary info line (only when Running) |
| `info2` | `Option<&str>` | Secondary info line (only when Running) |
| `info_always` | `Option<&str>` | Info always shown |
| `offline_text` | `Option<&str>` | Offline message (when not Running) |
| `primary_label` | `&str` | Primary button label |
| `primary_enabled` | `bool` | Primary button enabled state |
| `secondary_label` | `Option<&str>` | Secondary button label (hidden when `None`) |
| `secondary_enabled` | `bool` | Secondary button enabled state |
| `show_runtime_strip` | `bool` | Show optional runtime metrics strip |
| `runtime_strip_label` | `&str` | Runtime strip label text |
| `runtime_strip_value` | `&str` | Runtime strip value text |

#### Message Callbacks

| Callback | Triggered when |
|---|---|
| `on_primary: Message` | Primary button clicked |
| `on_secondary: Option<Message>` | Secondary button clicked |

#### Status → Colour Mapping

| Status | Colour |
|---|---|
| `Running` | `CLR_RUNNING` (#3fb950) |
| `Starting` / `Stopping` | `CLR_YELLOW` (#ffeb3b) |
| `Error` / `Stopped` | `CLR_STOPPED` (#f85149) |
| Other | `TEXT_SECONDARY` (#8b949e) |

#### Visual Structure

```
container (card)
├── row (header)
│   ├── container (icon box 28×28) → ServiceIcon canvas
│   ├── text: name (bold)
│   └── row: status dot + status text
├── row (body)
│   ├── StatusRing canvas (38×38)
│   ├── column (info lines, conditional)
│   └── column (buttons)
└── row (runtime strip, optional)
    └── label + monospace value
```

#### Service-specific accent colours

| Service | `accent` | `icon_bg` |
|---|---|---|
| MCP Server | `#FF90E8` (pink) | `#1A1628` |
| CLI MCP Server | `#26C6DA` (cyan) | `#0A1E25` |
| Interactive Terminal | `#38B6FF` (blue) | `#0D1F30` |
| Dashboard | `#42A5F5` (blue) | `#0D1F2E` |
| Fallback API | `#EF5350` (red) | `#2A0D0D` |

---

### 2.2 StatusRing

**File:** `supervisor-iced/src/ui/status_ring.rs`

Canvas-based circular progress ring. Implements `iced::widget::canvas::Program`.

#### Properties

| Field | Type | Purpose |
|---|---|---|
| `status` | `ServiceStatus` | Determines arc extent |
| `accent` | `Color` | Fill arc colour |
| `track` | `Color` | Background track colour (default `BORDER_SUBTLE`) |

#### Status → Ring

| Status | Arc |
|---|---|
| `Running` | Full 360° |
| `Error` / `Starting` / `Stopping` | Top 180° |
| `Stopped` / other | Track only |

#### Dimensions

- Canvas: 38 × 38 px
- Ring radius: 14 px
- Stroke width: 3 px
- Pure geometry; no animations

---

### 2.3 ServiceIcon

**File:** `supervisor-iced/src/ui/service_icon.rs`

Five icon variants, each drawn with iced Canvas 2D geometry.

| Variant | Used by |
|---|---|
| `Mcp` | MCP Server — lightning bolt geometry |
| `CliMcp` | CLI MCP Server — chevron geometry |
| `Terminal` | Interactive Terminal — terminal window geometry |
| `Dashboard` | Dashboard — grid geometry |
| `Process` | Fallback API + custom servers — bars geometry |

All icons are monochromatic using the card's `accent` colour with opacity variation. Coordinates are hardcoded per variant.

---

### 2.4 PairingDialog

**File:** `supervisor-iced/src/ui/pairing_dialog.rs`

Modal overlay for pairing a mobile device.

**Key difference from QML:** QR code is generated entirely in Rust using the `qrcode` crate — no C++ bridge required.

#### UI Elements

| Element | Description |
|---|---|
| Instruction text | "Scan this QR code with the Project Memory mobile app" |
| QR image | SVG rendered via iced `svg` widget; 220 × 220 px |
| Loading placeholder | Shown while SVG is being generated |
| API key label | Monospace display of raw key |
| Refresh button | Emits `RefreshPairingQr` message |
| Close button | Emits `ClosePairingDialog` message |

#### Behaviour

- QR encodes `pmobile://<host>:<http_port>?key=<api_key>&ws_port=<ws_port>`
- Auto-refreshes QR when dialog is opened (`ShowPairingDialog` message)
- State: `pairing_qr_svg: String`, `pairing_api_key: String` on `AppState`

---

## 3. Plans Panel (`plans_panel.rs`)

### Expansion States

| State | Width | Visual |
|---|---|---|
| Collapsed | 44 px | "►" button + "PLANS" label |
| Animating | 44–460 px | Expanded layout clipped via `container.clip(true)` |
| Expanded | 460 px | Full panel |

Panel uses `state.plans_panel_width` (animated) for `Length::Fixed(...)`. The border colour is always `CLR_BLUE` (unlike QML which animates border colour separately).

### Header Row (expanded)

- Title label: "PLANS" or "SPRINTS" depending on active main tab
- **Workspace `pick_list`** (160 px) — loaded from `/admin/workspaces`
- `↻` refresh button
- `◄` close button

### Main Tab Bar

Two tab buttons: **Plans** | **Sprints**. Active tab has `BG_CARD` background + `CLR_BLUE` border.

### Plans Tab — Toolbar

| Element | Type | Action |
|---|---|---|
| Open in IDE | Button | Emits `PlansOpenInIde` |
| Create Plan | Button | Emits `PlansCreatePlan` |
| Provider badge | Read-only display container | Shows "Gemini" or "Claude CLI" (not interactive) |

**Missing vs QML:** Register WS button, Backup button. Provider is not a selectable ComboBox.

### Plans Tab — Sub-tabs

Two tab buttons: **Active** | **All Plans**.

### Plan Cards

Each card has a clickable header and an animated detail section:

**Header (button, full width):**
- `+`/`−` toggle indicator
- Plan title (fills width)
- Step counter: `X/Y` (shown when `steps_total > 0`)
- Status badge (coloured pill)
- Progress bar: 3 px high, `CLR_BLUE` fill, shown when `steps_total > 0`

Background: `#1c2128` when expanded, `#0d1117` when collapsed.

**Detail section (animated height via `Length::Fixed(plan.expanded_height)` + `clip(true)`):**
- Category + recommended agent row (if non-empty)
- Next step block:
  - "IN PROGRESS" / "NEXT STEP" label + phase
  - Task description (14 px, `#e6edf3`)
  - Agent name (`TEXT_ACCENT`)
- "All steps complete" or "No steps defined" fallbacks
- **Open in Dashboard** button (blue, `#0d2547` bg)
- Row: **Copy Details** button (green) + **Launch Agent** / **Launch Claude CLI** button (purple/orange)

**Note:** The launch button has no state machine in the iced version (no idle→sending→ok/error feedback). It simply emits `LaunchAgent` immediately.

### Sprints Tab

When main tab is "Sprints", the panel body renders `sprints_panel::view_embedded()` in place of the plans content.

### Missing vs QML

- No "Register WS" popup
- No "Backup Plans" popup
- Provider selector is display-only (not interactive)
- No launch button state machine (no colour feedback on send/ok/error)

---

## 4. Sprints Panel (`sprints_panel.rs`)

Rendered **embedded** inside PlansPanel (no separate shell). Function: `view_embedded()`.

### Header

- "SPRINTS" label
- `↻` refresh button

### Sprint Cards

**Sprint button (full width):**
- `+`/`−` toggle
- Sprint name (fills width)
- "X goals" goal count label
- Status badge (coloured pill: active/completed/planned)

**Note:** Date range (`startDate → endDate`) is **not shown** — date fields are not in the sprint data model.

**Expanded goals section (`if is_selected`):**
- "GOALS" label
- Goal rows:
  - `checkbox("")` — toggles completion (PATCH sprint goal endpoint)
  - Description text (green when completed, normal when not; no strikethrough in iced)
  - **No plan badge (📋)** — linked plan indicator absent
- "No goals defined" empty state

### Missing vs QML

- No "Create Sprint" button / popup
- No "Add Goal" button / popup
- No date range display
- No plan badge on goals
- No strikethrough on completed goals (iced text widget does not support strikethrough natively)

---

## 5. Sessions Panel (`sessions_panel.rs`)

Fixed-height panel (200 px). Shows live active MCP sessions.

### Header Row

- "ACTIVE SESSIONS" label (fills width)
- **Live dot** (8 × 8 px): green when `mcp.port > 0`, red otherwise (not in QML)
- **Count badge** `[N]` in `TEXT_ACCENT` (not in QML)

### Column Headers

SESSION ID (120 px) | AGENT (fill) | STATUS (60 px) | ACTIONS (65 px)

### Session Rows (height 28 px)

| Element | Details |
|---|---|
| Session ID | First 14 chars, `TEXT_ACCENT` colour, `120 px` fixed |
| Agent type | `TEXT_PRIMARY`, fills width |
| ACTIVE badge | `#0e2318` bg, `#3fb950` text, radius 9 |
| Stop button | `"Stop"` label, 65 px wide |

### Empty State

"No active sessions" centered label.

### Data

- `state.sessions: Vec<SessionInfo>` — populated from `GET /sessions/live` every 5 s
- Maximum entries: no hard limit (QML caps at 20)
- Filters: QML filters stale sessions (>10 min); iced version includes all returned entries

---

## 6. Chatbot Panel (`chatbot_panel.rs`)

AI assistant sidebar with optional pop-out window.

### States

| State | Visual |
|---|---|
| Collapsed (sidebar) | 44 px: `◄` button, "AI" label, provider dot, key-configured dot |
| Popped-out placeholder | 44 px: `↙` dock button, "AI" label, key-configured dot |
| Expanded | Full panel (380 px animated width in sidebar; fills window when standalone) |

### Header Row (expanded)

| Element | Description |
|---|---|
| `►` collapse button | Hidden in standalone/pop-out mode |
| "[AI] AI ASSISTANT" | Label |
| Provider badge pill | "Gemini" (blue) or "Copilot" (dark blue) — read-only |
| `…` busy indicator | Shown during `chat_busy = true` |
| `↗` pop-out button | Opens chat in separate 480 × 720 window; hidden in standalone |
| `⚙` settings button | Toggles inline settings sub-panel |
| `⎚` clear button | Disabled when `chat_messages` is empty |

### API Key Warning

If `chat_key_configured = false`: amber warning text `"⚠ No API key configured — click ⚙ to add one"`.

### Settings Sub-panel (toggled, ~94 px)

| Element | Description |
|---|---|
| API Key text_input | Placeholder: "••••••••••••••••" if configured, "Paste key here" if not |
| Save button | Saves key; emits `ChatSaveSettings` |

**Note:** Only API key is editable here. There is no model selector, no workspace selector, and no temperature control.

### Message Area

- Scrollable `Column` of message bubbles
- **User bubble:** `#1f6feb` (blue) background, `BORDER_SUBTLE` border on assistant
- **Assistant bubble:** `#21262d` background
- **Tool-call chip:** `▸ {content}` in `#79c0ff` on `#21262d` bg with `CLR_BLUE` border, radius 10

### Input Row

- Single-line `text_input` ("Ask the AI about your plans…")
- `↑ Send` button — disabled when `chat_busy` or input is empty/whitespace

**Note:** Input is single-line only (no multi-line / Shift+Enter). Send cannot be triggered by keyboard Enter.

### Missing vs QML

- No workspace context selector
- No model / temperature controls in settings
- No provider toggle (provider shown but not interactively changeable from the panel)
- Single-line input only (no multi-line)
- No Enter-to-send keyboard shortcut
- No message history persistence on disk in the panel itself (persisted at app state level)

---

## 7. Activity Panel (`activity_panel.rs`)

Read-only activity feed, fixed height 200 px.

### Header Row

- "RECENT ACTIVITY" label (fills width)
- **Live dot** (8 × 8 px): green when `dashboard.port > 0`, red otherwise
- **Count badge** `[N]`

### Feed

Scrollable `Column` of plain text entries (11 px):

Format: `[agent_type] event_type timestamp` (or `event_type timestamp` when agent is empty)

### Event → Colour Mapping

| Prefix / keyword | Colour |
|---|---|
| `plan_*` | `CLR_RUNNING` (green) |
| `session_*` | `TEXT_ACCENT` (blue) |
| `step_*` / `task_*` | `#e3b341` (amber) |
| `error_*` | `CLR_STOPPED` (red) |
| `*handoff*` | `CLR_RUNNING` |
| `*complete*` | `TEXT_ACCENT` |
| `*error*` / `*blocked*` | `CLR_STOPPED` |
| `*active*` | `CLR_YELLOW` |
| Other | `TEXT_PRIMARY` |

### Data

- Source: `GET /api/events?limit=15` on dashboard port, every 3 s
- Up to 15 events displayed

---

## 8. Cartographer Panel (`cartographer_panel.rs`)

Workspace scanner panel.

### UI Elements

| Element | Description |
|---|---|
| "WORKSPACE CARTOGRAPHER" label | Section header |
| Workspace `pick_list` | Loaded from `/admin/workspaces`; fills width |
| `↻` refresh button | Reloads workspace list |
| **Scan Project** button | Disabled when no workspaces or MCP not running; emits `CartoScan` |
| Status label | Idle / Scanning… / result summary / error (colour-coded) |
| Stats section | Conditional: shown when `carto_stats_visible = true` |

**Note:** No compass canvas icon (present in QML version).

### Stats Section (conditional)

When `carto_stats_visible`:
- 1 px divider
- `carto_files_label` text (green, `CLR_RUNNING`)
- `carto_when_label` text (secondary colour)

**Fewer stats than QML:** No separate timing, cache status, or multi-field breakdown — just two text labels.

### Data

- `carto_workspaces: Vec<WorkspaceItem>`
- `carto_workspace_index: usize`
- `carto_status: String`
- `carto_stats_visible: bool`
- `carto_files_label: String`
- `carto_when_label: String`

---

## 9. Settings Panel (`settings_panel.rs`)

Full-window overlay with 5-category sidebar.

### SettingsState

```rust
pub struct SettingsState {
    pub visible:    bool,
    pub active_cat: usize,  // 0=General 1=Services 2=Reconnect 3=Approval 4=VS Code
}
```

### Layout

Same structure as QML: header + sidebar (150 px) + scrollable content area.

### Categories & Controls

Each category renders a column of `setting_row()` entries. **All controls are visual placeholders (`placeholder_ctrl()`) — empty styled boxes.** No values are loaded from config and nothing is saved on "Save".

| Category | Settings shown |
|---|---|
| 0 General | Log Level, Bind Address |
| 1 Services | MCP: Enabled, Port, Health Timeout; Instance Pool: Min/Max Instances, Max Conns; Terminal: Enabled, Port; Dashboard: Enabled, Port, Requires MCP; Events: Enabled |
| 2 Reconnect | Initial Delay, Max Delay, Multiplier, Max Attempts, Jitter Ratio |
| 3 Approval | Countdown (secs), On Timeout, Always on Top |
| 4 VS Code | Server Ports: MCP Port, Dashboard Port; Paths; Notifications; Deployment; Supervisor Extension |

### Header Buttons

| Button | Action |
|---|---|
| Edit TOML | Emits `openRawEditorRequested` signal |
| Close | Emits `on_close`; sets `settings.visible = false` |

### Critical Gap

**The settings panel is a UI scaffold only.** All input controls are non-functional placeholder boxes (`placeholder_ctrl()` returns a styled empty `Space`). Values are not read from `supervisor.toml` and the Save button (`_on_save`) is unused. The only functional path is "Edit TOML" → raw config editor overlay.

---

## 10. MCP Proxy Panel (`mcp_proxy_panel.rs`)

Read-only stats panel. Fixed height 100 px.

### UI Elements

| Element | Description |
|---|---|
| "MCP PROXY" label | 10 px, `TEXT_SECONDARY` |
| Total connections counter | 22 px bold, `TEXT_ACCENT` (blue) |
| Active instances counter | 22 px bold, `TEXT_PRIMARY` |
| Sparkline canvas | Fills remaining width; 32 px height |
| Distribution label | 9 px, `TEXT_SECONDARY`; visible when `mcp_instance_distribution` is non-empty |

### Sparkline (Canvas)

Improvements over QML version:
- **Filled area** under the line (alpha 0.15) in addition to the stroke line
- Flat center line shown when history has fewer than 2 samples

Data: `state.mcp_connection_history: Vec<i32>` (rolling 40-sample buffer, same as QML).

---

## 11. Event Broadcast Panel (`event_broadcast_panel.rs`)

Status panel with **interactive** toggle. Fixed height 72 px.

### UI Elements

| Element | Description |
|---|---|
| "EVENT BROADCAST" label | 10 px, `TEXT_SECONDARY` |
| Status label | "Broadcasting · N subscribers · N events" (green) or "Disabled" (gray) |
| Pill toggle button | 40 × 22 px; **clickable** — emits `ToggleBroadcast` message |

### Pill Toggle

- Enabled state: green background (`#3fb950`), knob at right (`x=20`)
- Disabled state: `BORDER_SUBTLE` background, knob at left (`x=2`)
- No animation (knob position switches instantaneously, unlike QML's 150 ms transition)

**Key difference from QML:** The toggle is **interactive** in iced — clicking it emits `ToggleBroadcast` which calls the backend to enable/disable the event broadcast channel. In QML the toggle was read-only.

---

## 12. About Panel (`about_panel.rs`)

Full-window overlay, scrollable.

### Cards

| Card | Contents |
|---|---|
| Version | "Project Memory Supervisor v{version}", runtime: "Rust + iced" |
| Service Port Map | 6 service rows: name, port, runtime label |
| Fallback REST API | 12 endpoint strings |
| Notes | 6 operational tip bullets |

### Service Port Map

| Service | Port | Runtime |
|---|---|---|
| MCP Server | (dynamic) | node dist/index.js |
| CLI MCP Server | 3466 | node dist/index-cli.js |
| Interactive Terminal | (dynamic) | interactive-terminal.exe |
| Dashboard | (dynamic) | node dist/index.js |
| Fallback REST API | 3465 | node dist/fallback-rest-main.js |
| Supervisor GUI | 3464 | **supervisor-iced.exe (Rust/iced)** |

### Missing vs QML

- **No upgrade report card** — the last upgrade report section is entirely absent
- No "Dismiss" button (no upgrade report to dismiss)
- Runtime string says "Rust + iced" instead of "Rust + Qt/QML (CxxQt)"

---

## 13. System Tray

**Crate:** `tray-icon 0.19`

| Property | Value |
|---|---|
| Icon | 32 × 32 RGBA; purple border `#441C8A`, purple fill `#7C3AF5` |
| Tooltip | "Project Memory Supervisor" (static) |
| Channel | Non-blocking `sync_mpsc`, capacity 64 |

### Context Menu (4 items)

| Item | Action |
|---|---|
| Show | Make window visible (Windowed mode) |
| Minimize to Tray | Hide window (Hidden mode) |
| Restart Services | POST restart to `/api/fallback/services/all/restart` |
| Quit | Set `quitting = true`; close window |

### Missing vs QML

- No per-service restart items (MCP, Terminal, Dashboard, Fallback individually)
- No "Open Focused Workspace in VS Code" item
- No "Show Pairing QR" item
- No dynamic tooltip (workspace name, event count)
- No tray balloon notifications

---

## 14. App State & Message Architecture

### Architecture Pattern

- **Monolithic state:** All UI state in one `AppState` struct (~50+ fields)
- **Pure functional view:** `view()` is deterministic from `AppState` — no component-level state
- **Message-driven updates:** All mutations via `update(state, message) → Task<Message>`
- **Async via Tasks:** HTTP calls wrapped in `Task::perform(async {}, |result| Message)`

### Key AppState Field Groups

| Group | Key fields |
|---|---|
| Window | `window_visible`, `quitting`, `overlay: Overlay` |
| Services | `mcp`, `terminal`, `dashboard`, `fallback`, `cli_mcp` (each: `port`, `status`, `pid`, `runtime`, `uptime_secs`) |
| MCP stats | `total_mcp_connections`, `active_mcp_instances`, `mcp_instance_distribution`, `mcp_connection_history` |
| Events | `event_broadcast_enabled`, `event_subscriber_count`, `events_total_emitted` |
| Plans | `plans_panel_expanded`, `plans_main_tab`, `plans_tab`, `plans_workspaces`, `plans_workspace_index`, `plans`, `plans_provider` |
| Sprints | `sprints`, `selected_sprint_id`, `sprint_goals` |
| Sessions | `sessions` |
| Activity | `activity` |
| Cartographer | `carto_workspaces`, `carto_workspace_index`, `carto_status`, `carto_stats_visible`, `carto_files_label`, `carto_when_label` |
| Chatbot | `chat_expanded`, `chat_busy`, `chat_input`, `chat_messages`, `chat_provider`, `chat_key_configured`, `chat_show_settings`, `chat_api_key_input`, `chat_popped_out` |
| Animation | `plans_panel_width`, `plans_panel_target_width`, `chat_panel_width`, `chat_panel_target_width`, `animation_running` |
| Windows | `main_window_id`, `chat_popped_out`, `chat_popout_window_id` |
| Config/About | `supervisor_version`, `config_editor_text`, `config_editor_error` |
| QR pairing | `pairing_qr_svg`, `pairing_api_key` |
| UI misc | `shutdown_dialog_visible`, `settings_active_cat`, `action_feedback` |

### Message Enum (67 variants — key ones)

| Domain | Notable variants |
|---|---|
| Polling | `StatusTick`, `StatusUpdated`, `ActivityLoaded`, `SessionsLoaded` |
| Plans | `PlansPanelToggle`, `PlansWorkspaceSelected`, `PlanToggle`, `PlansLoaded`, `LaunchAgent`, `PlansOpenInIde`, `PlansCreatePlan` |
| Sprints | `SprintSelected`, `SprintsLoaded`, `GoalsLoaded`, `ToggleGoal` |
| Chatbot | `ChatToggle`, `ChatInputChanged`, `ChatSend`, `ChatClear`, `ChatShowSettings`, `ChatApiKeyChanged`, `ChatSaveSettings`, `ChatReplyReceived`, `OpenChatPopout` |
| Service control | `RestartService(String)`, `StartService(String)`, `StopService(String)` |
| Overlays | `ShowSettings`, `CloseSettings`, `ShowAbout`, `CloseAbout`, `ShowPairingDialog`, `ClosePairingDialog`, `RefreshPairingQr` |
| Config editor | `OpenRawConfigEditor`, `ConfigEditorTextChanged`, `SaveConfig`, `ConfigSaved` |
| Tray | `TrayPoll`, `TrayShow`, `MinimizeToTray`, `TrayQuit` |
| Animation | `AnimationTick` |
| Window | `WindowCloseRequested` |
| Event broadcast | `ToggleBroadcast` |

---

## 15. Backend Modules

### `backend/config.rs`

Loads and parses `supervisor.toml` using `toml` crate. Config struct mirrors the QML supervisor's TOML schema (services, reconnect, approval, VS Code extension settings). Used at startup; re-read on config save.

### `backend/process_manager.rs`

Manages all service processes (MCP, Terminal, Dashboard, Fallback API, CLI MCP, custom servers). Exposes:
- `start_service(name)` / `stop_service(name)` / `restart_service(name)`
- `ServiceStatus` enum: `Stopped`, `Starting`, `Running`, `Stopping`, `Error`
- Tracks PID, port, runtime label, uptime start time per service

### `backend/runner/`

Individual async runner tasks per service type. Each runner:
- Spawns the child process
- Monitors stdout/stderr (fed to `runtime_output`)
- Reports status changes via async channel to `AppState`
- Implements reconnect back-off (initial delay, max delay, multiplier, jitter, max attempts)

### `backend/runtime_output.rs`

Ring-buffer for recent stdout/stderr lines per service. Used by the raw config editor error display and potentially future log panel.

### `backend/lock.rs`

PID file single-instance lock. Prevents two supervisor instances running simultaneously. Heartbeat refreshed every 5 s.

### `backend/logging.rs`

Initializes `tracing_subscriber` with level from config. Writes to both console and file.

### State Flow: Backend → UI

Backend runners communicate with the iced `update()` loop via:
1. `tokio::sync::mpsc` channel → produces `Message::StatusUpdated` etc.
2. `Task::perform(async { ... }, |result| Message)` wrappers
3. `AppState` is mutated directly in `update()` when messages arrive

---

## 16. REST API Endpoints Used

| Panel | Method | Endpoint | Purpose |
|---|---|---|---|
| App shell (poll) | GET | `http://127.0.0.1:3465/api/supervisor-status` | All service statuses |
| Service control | POST | `http://127.0.0.1:3465/api/fallback/services/{name}/{action}` | start / stop / restart |
| Plans | GET | `http://127.0.0.1:{mcp_port}/admin/workspaces` | Workspace list |
| Plans | GET | `http://127.0.0.1:{mcp_port}/admin/plans?workspace_id=&status=` | Plan list |
| Plans | POST | `http://127.0.0.1:{mcp_port}/api/agent-session/launch` | Launch Gemini agent |
| Plans | POST | `http://127.0.0.1:{mcp_port}/terminal/launch-claude` | Launch Claude CLI |
| Sprints | GET | `http://127.0.0.1:{dashboard_port}/api/sprints/workspace/{id}` | Sprint list |
| Sprints | GET | `http://127.0.0.1:{dashboard_port}/api/sprints/{id}` | Sprint goals |
| Sprints | PATCH | `http://127.0.0.1:{dashboard_port}/api/sprints/{id}/goals/{id}` | Toggle goal |
| Sessions | GET | `http://127.0.0.1:{mcp_port}/sessions/live` | Live sessions |
| Sessions | POST | `http://127.0.0.1:{mcp_port}/sessions/stop` | Stop session |
| Activity | GET | `http://127.0.0.1:{dashboard_port}/api/events?limit=15` | Activity feed |
| Cartographer | GET | `http://127.0.0.1:{mcp_port}/admin/memory_cartographer/summary` | Scan summary |
| Cartographer | POST | `http://127.0.0.1:{mcp_port}/admin/memory_cartographer` | Trigger scan |
| Chatbot | POST | `http://127.0.0.1:3464/chatbot/chat` | AI chat request |
