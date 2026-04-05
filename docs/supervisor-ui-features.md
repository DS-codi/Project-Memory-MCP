# Project Memory Supervisor — UI Features & Components Reference

> **Scope:** This document covers every feature and UI element of the main QML supervisor application (`supervisor/qml/`), including the Rust backend bindings exposed to QML.

---

## Table of Contents

1. [Application Shell (`main.qml`)](#1-application-shell-maingqml)
2. [Shared Components](#2-shared-components)
   - [ServiceCard](#21-servicecard)
   - [StatusRing](#22-statusring)
   - [PairingDialog](#23-pairingdialog)
3. [Plans Panel](#3-plans-panel-planspanelqml)
4. [Sprints Panel](#4-sprints-panel-sprintspanelqml)
5. [Sessions Panel](#5-sessions-panel-sessionspanelqml)
6. [Sessions Dashboard Panel](#6-sessions-dashboard-panel-sessionsdashboardpanelqml)
7. [Chatbot Panel](#7-chatbot-panel-chatbotpanelqml)
8. [Activity Panel](#8-activity-panel-activitypanelqml)
9. [Cartographer Panel](#9-cartographer-panel-cartographerpanelqml)
10. [Settings Panel](#10-settings-panel-settingspanelqml)
11. [MCP Proxy Panel](#11-mcp-proxy-panel-mcpproxypanelqml)
12. [Event Broadcast Panel](#12-event-broadcast-panel-eventbroadcastpanelqml)
13. [About Panel](#13-about-panel-aboutpanelqml)
14. [System Tray](#14-system-tray)
15. [Backend Bindings (Rust → QML)](#15-backend-bindings-rust--qml)

---

## 1. Application Shell (`main.qml`)

### Window

| Property | Value |
|---|---|
| Type | `ApplicationWindow` |
| Default size | 1080 × 960 px |
| Minimum size | 640 × 620 px |
| Title | "Project Memory Supervisor" |
| Visibility | Controlled by `supervisorGuiBridge.windowVisible` |
| Theme | `Material.Dark`, accent `Material.Blue` |

The window hides to the system tray instead of closing (`onClosing` intercepts the close event and calls `supervisorGuiBridge.hideWindow()`). When the window becomes visible it raises and requests activation.

### Colour Palette

| Token | Hex | Role |
|---|---|---|
| `bgWindow` | `#0f1319` | Darkest background (window chrome) |
| `bgPanel` | `#161b22` | Panel/card backgrounds |
| `bgCard` | `#1c2128` | Card backgrounds |
| `bgTerminal` | `#0d1117` | Terminal widget background |
| `borderSubtle` | `#30363d` | Subtle borders |
| `textPrimary` | `#c9d1d9` | Main body text |
| `textSecondary` | `#8b949e` | Labels / secondary text |
| `textAccent` | `#58a6ff` | Accent text / links |
| `clrRunning` | `#3fb950` | Green — service running |
| `clrStopped` | `#f85149` | Red — service stopped / error |
| `clrYellow` | `#ffeb3b` | Yellow — transitional states |

### Layout Structure

The window uses a horizontal three-column layout, all always rendered (no panel switching):

```
ApplicationWindow
└── RowLayout
    ├── PlansPanel          (left sidebar, collapsible 44 px → 460 px)
    ├── ColumnLayout        (centre — fills remaining width)
    │   ├── Header Row
    │   ├── Flickable       (scrollable main content)
    │   │   ├── MCP SERVERS grid      (2 columns)
    │   │   ├── SERVICES grid         (2 columns)
    │   │   ├── CONFIGURED SERVERS    (dynamic, 2-column grid)
    │   │   ├── ACTIVE SESSIONS + RECENT ACTIVITY row
    │   │   ├── MY SESSIONS (SessionsDashboardPanel)
    │   │   ├── WORKSPACE CARTOGRAPHER + MCP PROXY + EVENTS row
    │   │   └── Action Feedback label
    │   └── Footer Row
    └── ChatbotPanel        (right sidebar, collapsible 44 px → 380 px)
```

### Header

| Element | Description |
|---|---|
| Canvas logo | 36 × 36 px; custom-drawn Project Memory icon (hand, diamond, "pm" text) |
| Title label | "PROJECT MEMORY SUPERVISOR" — 16 px bold, letter-spaced |
| Shut Down button | Red-themed; opens `shutdownDialog` |

### Centre Content — Service Cards

#### MCP Servers (2-column grid)

| Card | `accentColor` | Actions |
|---|---|---|
| MCP Server | `#ff90e8` (magenta) | Restart → `restartService("mcp")` |
| CLI MCP Server | `#90caf9` (light blue) | Restart → `restartService("cli_mcp")` |

Each card shows: status, PID, port, runtime label, uptime seconds.

#### Services (2-column grid)

| Card | `accentColor` | Primary Action | Secondary Action |
|---|---|---|---|
| Interactive Terminal | `#80cbc4` (teal) | Toggle start/stop | `openTerminal()` |
| Dashboard | `#ce93d8` (purple) | Restart | Open in browser |
| Fallback API | `#ef9a9a` (pink-red) | Restart | — |

#### Configured Servers (dynamic)

Parsed from `supervisorGuiBridge.customServicesJson` (JSON array of `{name, display, status, port}` objects). Rendered via a `Repeater` inside a `Loader`:

- Each entry gets a generic "process" icon ServiceCard.
- Primary action: toggle stop/start.
- Secondary action: restart.

### Footer

| Element | Description |
|---|---|
| Virtual Monitor button | Opens `supervisorGuiBridge.monitorUrl` externally; has tooltip |
| Settings button | Opens `settingsOverlay` (SettingsPanel) |
| Minimize to Tray button | Calls `supervisorGuiBridge.hideWindow()` |

### Overlays & Dialogs

| Overlay | Trigger | Notes |
|---|---|---|
| `settingsOverlay` (SettingsPanel) | Footer Settings button | Full-window overlay, z:10 |
| `configEditorOverlay` | "Edit TOML" from SettingsPanel | Raw TOML text editor, Consolas 13 px; Save / Cancel / "Open in Editor" buttons |
| `shutdownDialog` | Header Shut Down button | Confirmation dialog with red border; "Shut Down" → `quitSupervisor()` |
| `pairingDialog` (PairingDialog) | Tray menu "Show Pairing QR" | Modal dialog for mobile device pairing |
| `aboutOverlay` (AboutPanel) | — | Full-window overlay (opened from tray or menu) |

### Window Resize Animation

When either sidebar expands or collapses, the root `ApplicationWindow.width` animates:
- Duration: 200 ms
- Easing: `Easing.OutCubic`
- Plans panel adds `expandedPanelWidth − 44` px.
- Chat panel adds / removes 380 px.

### Status Helper Function

```qml
function statusColor(s) {
    if (s === "Running")                    return root.clrRunning   // #3fb950
    if (s === "Starting" || "Stopping")     return root.clrYellow    // #ffeb3b
    if (s === "Error"    || "Stopped")      return root.clrStopped   // #f85149
    return "#9e9e9e"
}
```

---

## 2. Shared Components

### 2.1 ServiceCard

**File:** `supervisor/qml/ServiceCard.qml`

Reusable dashboard card used for every managed service. Displays identity, live status, contextual info lines, and action buttons.

#### Properties

| Property | Type | Default | Purpose |
|---|---|---|---|
| `serviceName` | `string` | `""` | Display name |
| `status` | `string` | `""` | Current status (Running / Starting / Stopping / Error / Stopped) |
| `accentColor` | `color` | `#ffffff` | Ring and accent elements colour |
| `iconBgColor` | `color` | `#1c2128` | Icon box background |
| `iconDelegate` | `Component` | `null` | Canvas component rendering the service icon |
| `infoLine1` | `string` | `""` | Primary info (only shown when Running) |
| `infoLine2` | `string` | `""` | Secondary info (only shown when Running) |
| `infoAlways` | `string` | `""` | Info always visible regardless of status |
| `offlineText` | `string` | `"Service offline"` | Message when not Running; set `""` to suppress |
| `primaryActionLabel` | `string` | `"Restart"` | Primary button label |
| `primaryActionEnabled` | `bool` | `true` | Enable/disable primary button |
| `secondaryActionLabel` | `string` | `""` | Secondary button label (button hidden when empty) |
| `secondaryActionEnabled` | `bool` | `true` | Enable/disable secondary button |
| `showRuntimeStrip` | `bool` | `false` | Show/hide runtime metrics strip at bottom |
| `runtimeStripLabel` | `string` | `"runtime"` | Runtime strip label text |
| `runtimeStripValue` | `string` | `"--"` | Runtime strip value text |

#### Signals

| Signal | Emitted when |
|---|---|
| `primaryActionClicked()` | Primary button pressed |
| `secondaryActionClicked()` | Secondary button pressed |

#### Status → Colour Mapping

| Status | Colour |
|---|---|
| `"Running"` | `#3fb950` (green) |
| `"Starting"` / `"Stopping"` | `#ffeb3b` (yellow) |
| `"Error"` / `"Stopped"` | `#f85149` (red) |
| Other | `#9e9e9e` (gray) |

#### Visual Structure

```
Rectangle (card)
├── Header Row
│   ├── Icon Box (28×28, rounded) — iconDelegate rendered here
│   ├── Service name label (bold, 12 px)
│   └── Status dot + status text label
├── Body Row
│   ├── StatusRing (38×38)
│   ├── Info Column
│   │   ├── infoLine1 (visible only when Running)
│   │   ├── infoLine2 (visible only when Running)
│   │   ├── infoAlways (always visible)
│   │   └── offlineText (visible when NOT Running)
│   └── Button Column
│       ├── secondaryActionButton (hidden when label empty)
│       └── primaryActionButton
└── Runtime Strip (optional, full width)
    └── Label + monospace value
```

---

### 2.2 StatusRing

**File:** `supervisor/qml/StatusRing.qml`

Canvas-based circular ring gauge used inside `ServiceCard`. Read-only; no user interaction.

#### Properties

| Property | Type | Default | Purpose |
|---|---|---|---|
| `status` | `string` | `""` | Service status string |
| `accentColor` | `color` | `#ffffff` | Fill arc colour |
| `trackColor` | `color` | `#30363d` | Background track colour |

#### Status → Ring Mapping

| Status | Ring shape |
|---|---|
| `"Running"` | Full circle (360°) |
| `"Error"` / `"Starting"` / `"Stopping"` | Half circle (top 180°) |
| `"Stopped"` / unknown | Track only (empty) |

#### Dimensions

- Canvas size: 38 × 38 px
- Ring radius: 14 px
- Stroke width: 3 px
- Repaints on `statusChanged` and `accentColorChanged`

---

### 2.3 PairingDialog

**File:** `supervisor/qml/PairingDialog.qml`

Modal dialog for pairing a mobile device with the Project Memory app via QR code.

#### Dimensions

400 × 460 px, modal (blocks main window interaction).

#### UI Elements

| Element | Description |
|---|---|
| Instruction label | "Scan this QR code with the Project Memory mobile app" — 13 px, word-wrapped |
| QR code image | 220 × 220 px; SVG rendered via data URI; `smooth: false` for crisp pixels |
| Loading placeholder | Dark rectangle with "Generating QR…" text; visible while image is not ready |
| API Key label | Monospace (Courier New, 10 px); displays raw key for manual entry fallback |
| Refresh Key button | Calls `qrPairingBridge.refreshPairingQr()`; has tooltip |
| Close button | Closes dialog |

#### Behaviour

- On `onOpened`: automatically calls `qrPairingBridge.refreshPairingQr()` to generate a fresh QR.
- QR SVG encoded as `"data:image/svg+xml," + encodeURIComponent(svg)`.
- Placeholder swaps to image automatically when `Image.status === Image.Ready`.

---

## 3. Plans Panel (`PlansPanel.qml`)

Primary navigation panel for workspace and plan management. Collapsible left sidebar.

### Expansion States

| State | Width | Trigger |
|---|---|---|
| Collapsed | 44 px | Shows "►" open button and rotated "PLANS" label |
| Expanded | 460 px | Full panel visible |

Width animates 200 ms, `Easing.OutCubic`. Border colour animates 120 ms.

### Header (expanded)

- Tab switcher label: "PLANS" or "SPRINTS"
- **Workspace ComboBox** (160 px) — loaded from `/admin/workspaces`
- Refresh button (`⟳`) — reloads workspace list
- Close button (`◄`) — collapses panel

### Plans Tab — Toolbar

| Button | Enabled when | Action |
|---|---|---|
| Open in IDE | Bridge available + workspace selected | `bridge.openInIde(workspaceId)` |
| Register WS | Always | Opens Register Workspace popup |
| Backup | Always | Opens Backup Plans popup |
| Create Plan | Always | Opens Create Plan popup |
| Provider ComboBox | — | Selects "Gemini" or "Claude CLI" for agent launch |

### Plans Tab — Filter Tabs

Two sub-tabs: **Active** (default) | **All Plans**. Changing tab triggers `fetchPlans()`.

### Plan Cards (Repeater, expandable)

Each card has two sections:

**Header row (54 px, always visible):**
- Toggle indicator: `+` / `–`
- Plan title (fills available width, elided)
- Step counter: `X/Y` (hidden when no steps)
- Status badge (coloured rectangle):
  - Active → `#0e2318` background, `#3fb950` text
  - Paused → `#1f1a0e` / yellow text
  - Blocked → `#2d0f0f` / red text
- Progress bar (shown when `stepsTotal > 0`)

**Detail section (animated height, 180 ms OutCubic):**
- Category label + Recommended Agent (hidden if empty)
- Next / Active step block:
  - Status label: "IN PROGRESS" or "NEXT STEP"
  - Phase label (with `•` separator)
  - Full task description
  - Agent name (if available)
- "All steps complete" / "No steps defined" fallbacks

**Action buttons (detail section):**

| Button | Style | Action |
|---|---|---|
| Open in Dashboard | Blue | Opens `{dashBaseUrl}/workspace/{wsId}/plan/{planId}` externally |
| Copy Details | Green | Copies formatted plan info to clipboard |
| Launch Agent | Purple → green/red feedback | Gemini: POST `/api/agent-session/launch`; Claude CLI: POST `/terminal/launch-claude` |

**Launch button state machine:**
`idle` → `sending` → `ok` (green, 3 s) or `error` (red, 3 s) → back to `idle`

### Popups

| Popup | Fields | Action |
|---|---|---|
| Register Workspace | Path TextField | `bridge.registerWorkspace(path)` |
| Backup Plans | Output dir TextField | `bridge.backupWorkspacePlans(wsId, dir)` |
| Create Plan | Prompt TextArea (80 px height) | `bridge.createPlanFromPrompt(prompt, wsId)` |

### Auto-Refresh

Timer: 15 s interval while panel is expanded. Also refreshes on workspace selection change and tab change.

### Data Model (`plansModel`)

Per-item fields: `planId`, `planTitle`, `planStatus`, `planCategory`, `stepsDone`, `stepsTotal`, `workspaceId`, `nextStepTask`, `nextStepPhase`, `nextStepAgent`, `nextStepStatus`, `recommendedAgent`, `expanded`.

---

## 4. Sprints Panel (`SprintsPanel.qml`)

Sprint management interface, lazy-loaded inside PlansPanel's "SPRINTS" tab.

### Expansion States

Same 44 px / full-width animation as PlansPanel.

### Toolbar

| Button | Enabled when | Action |
|---|---|---|
| Create Sprint | `workspaceId` set | Opens Create Sprint popup |
| Add Goal | Sprint selected | Opens Add Goal popup |

### Sprint Cards (Repeater, expandable)

**Header row (48 px):**
- Toggle `+` / `–`
- Sprint name (fills width, elided)
- Goal count badge: "X goals"
- Status badge: active / completed / planned colours
- Date range label: `startDate → endDate` (when available)

**Expanded goals section (animated height, 180 ms):**
- "GOALS" section label
- Goals Repeater per item:
  - CheckBox — toggles completion (PATCH `/api/sprints/{sprintId}/goals/{goalId}`)
  - Description label (strikethrough + green when completed)
  - 📋 plan badge (tooltip: plan ID if linked)
- "No goals defined" empty state

### Popups

| Popup | Fields | Action |
|---|---|---|
| Create Sprint | Name TextField; Duration SpinBox (1–365 days, optional) | POST `/api/sprints` |
| Add Goal | Description TextArea (60 px height) | POST `/api/sprints/{sprintId}/goals` |

### State

- `selectedSprintId` property — only one sprint expanded at a time; goals list populated on selection.
- Auto-refresh: 15 s timer while expanded.
- Refreshes on `workspaceId` change.

---

## 5. Sessions Panel (`SessionsPanel.qml`)

Real-time monitor of active MCP server sessions. Read-polling every 5 seconds.

### Layout

```
Rectangle (dark panel)
├── "ACTIVE SESSIONS" header label
├── Column headers: SESSION ID | AGENT | STATUS | ACTIONS
├── 1 px divider
└── ScrollView
    └── Repeater (max 20 rows)
        └── Row: session ID (14 chars, monospace) | agent type | "ACTIVE" badge | Stop button
```

### Elements

| Element | Description |
|---|---|
| SESSION ID column | 120 px; first 14 chars of ID, monospace, right-elided |
| AGENT column | fills width |
| STATUS badge | Green rectangle (`#0e2318` bg, `#3fb950` text) showing "ACTIVE" |
| Stop button | 24 × 65 px; POST `/sessions/stop` with session key |
| Empty state | "No active sessions" label |

### Data & Polling

- Source: GET `/sessions/live` every 5 s (only when `mcpPort > 0`)
- Filters out sessions with `lastCallAt` older than 10 minutes
- Maximum 20 entries rendered

---

## 6. Sessions Dashboard Panel (`SessionsDashboardPanel.qml`)

Two-pane panel for managing user-defined custom session configurations.

### Layout

```
Rectangle
└── RowLayout (10 px margins)
    ├── Left pane (220 px)   — session list + new button
    ├── 1 px separator
    └── Right pane (fillWidth) — detail view or placeholder
```

### Left Pane

- **"MY SESSIONS"** header label
- Blue count badge (`#58a6ff`)
- **Session list** (ScrollView, Repeater, 34 px rows):
  - 📌 pin indicator (if pinned)
  - Session name (fills width, elided)
  - Agent count badge (green, visible when > 0)
  - Selected row highlighted `#21262d`
- **"+ New Session"** button (fills width, highlighted style)

### Right Pane

**Placeholder:** "Select a session to view details" (when nothing selected)

**Detail view (when session selected):**

*Header row:*

| Element | Action |
|---|---|
| Session name (15 px bold) | — |
| Pin / Unpin button | `togglePin()` → PUT with `pinned` flag |
| Edit button | Opens session dialog in edit mode |
| Delete button (red) | Opens delete confirmation dialog |

*Content sections (ScrollView):*

| Section | Shown when | Features |
|---|---|---|
| WORKING DIRECTORIES | Array length > 0 | Monospace middle-elided paths; Copy button per item |
| COMMANDS | Array length > 0 | Monospace right-elided; `#79c0ff` text; Copy button per item |
| NOTES | Always | 80 px TextArea; auto-saves on `editingFinished` |
| LINKED AGENT SESSIONS | Array length > 0 | Live dot (green / gray), 20-char session ID, agent type or "offline" |

### Dialogs

**Session dialog (Create / Edit):**
- Title: "New Session" or "Edit Session"
- Fields: Name (TextField), Working Directories (TextArea, no-wrap), Commands (TextArea, no-wrap), Notes (TextArea)
- Buttons: Cancel / Create (POST `/admin/user-sessions`) or Save (PUT `/admin/user-sessions/{id}`)

**Delete confirmation dialog:**
- "Delete "{name}"? This cannot be undone."
- Buttons: Cancel / Delete (red) → DELETE `/admin/user-sessions/{id}`

### Auto-Refresh

Timer: 10 s interval.

---

## 7. Chatbot Panel (`ChatbotPanel.qml`)

Multi-modal AI assistant sidebar. Supports Gemini and GitHub Copilot (Claude) providers.

### Expansion States

| State | Width | Collapsed indicator |
|---|---|---|
| Collapsed | 44 px | `◄` button + rotated "AI ASSISTANT" label |
| Expanded | 380 px | Full chat UI |

Additionally supports **pop-out** into a separate detachable window.

### Header (expanded)

- Provider badge (coloured pill: Gemini vs Copilot)
- Workspace context selector ComboBox
- Settings toggle button
- Pop-out / dock button
- Clear chat button

### Message Area

- Scrollable message list
- **User message bubbles:** Right-aligned, accent background
- **Assistant message bubbles:** Left-aligned, dark card background, Markdown-rendered text
- **Tool-call chips:** Compact inline indicators showing active tool invocations (polled every 600 ms)
- Busy indicator visible during processing

### Input Area

- Multi-line TextField (expands up to 4 lines)
- Send button (also triggered by Enter; Shift+Enter for newline)
- API key warning banner (shown when key is not configured)

### Settings Sub-panel

Toggled within the panel:
- API key field (masked)
- Model selector ComboBox
- Temperature / parameter controls

### Key Behaviours

- Message history persisted across sessions
- Workspace context passed with each request
- Live tool-call polling interval: 600 ms while waiting for a response
- Provider switching clears in-progress requests

---

## 8. Activity Panel (`ActivityPanel.qml`)

Read-only live feed of recent agent activity events.

### Layout

```
Rectangle (dark panel)
├── "RECENT ACTIVITY" header label
├── 1 px divider
└── ScrollView
    └── ListView (last 15 events, newest at top)
        └── Event chip: icon + event type + description
```

### Event Type → Colour Mapping

| Event type | Colour |
|---|---|
| `handoff` | `#3fb950` (green) |
| `complete` | `#58a6ff` (blue) |
| `error` / `blocked` | `#f85149` (red) |
| `active` | `#ffeb3b` (yellow) |
| Other | `#8b949e` (gray) |

### Data & Polling

- Source: GET `/api/events` every 3 s
- Displays last 15 events
- No user interaction; purely a monitoring display

---

## 9. Cartographer Panel (`CartographerPanel.qml`)

Workspace project scanner that analyses file structure and populates the memory cartographer index.

### UI Elements

| Element | Description |
|---|---|
| Compass icon | Custom Canvas drawing (38 × 38 px) in panel header |
| Workspace ComboBox | Loaded from `/admin/workspaces`; triggers summary load on change |
| Refresh button | Reloads workspace list |
| **Scan Project** button | POST `/admin/memory_cartographer`; disabled while scan in progress |
| Status label | Idle / Scanning… / result summary |
| Stats section (conditional) | Shown after successful scan |

### Stats Section

Appears only after a scan or on summary load:

| Stat | Description |
|---|---|
| File count | Number of files indexed |
| Timing | Scan duration in ms |
| Cache status | Hit / Miss indicator |
| Last scan time | Timestamp of most recent scan |

### State

- Auto-loads workspace list when `mcpPort` changes to a valid port
- Auto-loads scan summary when workspace selection changes
- Scan button disabled during active scan

---

## 10. Settings Panel (`SettingsPanel.qml`)

Full-window overlay providing a structured GUI editor for `supervisor.toml` and VS Code `settings.json`. Replaces the raw TOML editor for most configuration tasks.

### Layout

```
Rectangle (overlay, z:10, fills parent)
├── Header: "⚙ Settings" title + "Edit TOML" button
└── RowLayout (body)
    ├── Sidebar (150 px) — 5 category ItemDelegates
    └── Content area (fillWidth)
        └── StackLayout (currentIndex = activeCat)
            ├── [0] General
            ├── [1] Services
            ├── [2] Reconnect
            ├── [3] Approval
            └── [4] VS Code
```

### Category 0 — General

| Control | Type | Options / Range |
|---|---|---|
| Log Level | ComboBox | trace, debug, info, warn, error |
| Bind Address | TextField | Placeholder "127.0.0.1:3456" |

### Category 1 — Services

**MCP SERVER**

| Control | Type | Range |
|---|---|---|
| Enabled | Switch | — |
| Port | SpinBox | 1–65535 |
| Health Timeout | Slider | 300–10 000 ms (value label shown) |

**INSTANCE POOL**

| Control | Type | Range |
|---|---|---|
| Min Instances | SpinBox | 1–16 |
| Max Instances | SpinBox | 1–32 |
| Max Conns / Instance | SpinBox | 1–200 |

**INTERACTIVE TERMINAL**

| Control | Type | Range |
|---|---|---|
| Enabled | Switch | — |
| Port | SpinBox | 1–65535 |

**DASHBOARD**

| Control | Type | Range |
|---|---|---|
| Enabled | Switch | — |
| Port | SpinBox | 1–65535 |
| Requires MCP | Switch | — |

**EVENT BROADCAST**

| Control | Type |
|---|---|
| Enabled | Switch |

### Category 2 — Reconnect

| Control | Type | Range |
|---|---|---|
| Initial Delay | SpinBox | 100–10 000 ms, step 100 |
| Max Delay | SpinBox | 1 000–120 000 ms, step 1 000 |
| Multiplier | Slider | 1.0–5.0, step 0.1 (shows `.toFixed(1)`) |
| Max Attempts | SpinBox | 0–1 000 |
| Jitter Ratio | Slider | 0.0–1.0, step 0.05 (shown as %) |

### Category 3 — Approval

| Control | Type | Range / Options |
|---|---|---|
| Countdown | SpinBox | 5–300 s, step 5 |
| Timeout Action | ComboBox | approve, reject |
| Always on Top | Switch | — |

### Category 4 — VS Code

**CONNECTION**

| Control | Type | Options |
|---|---|---|
| MCP Port | SpinBox | 1–65535 |
| Dashboard Port | SpinBox | 1–65535 |
| Container Mode | ComboBox | auto, local, container |
| Dashboard Panel | Switch | — |

**PATHS**

| Control | Type |
|---|---|
| Agents Root | TextField |
| Skills Root | TextField |
| Instructions Root | TextField |

**AUTO-DEPLOY**

| Control | Type |
|---|---|
| Deploy on Open | Switch |
| Auto-Deploy Skills | Switch |

**NOTIFICATIONS**

| Control | Type |
|---|---|
| Notifications (master) | Switch |
| Agent Handoffs | Switch |
| Plan Complete | Switch |
| Step Blocked | Switch |

**SUPERVISOR LAUNCHER**

| Control | Type | Range / Options |
|---|---|---|
| Startup Mode | ComboBox | off, prompt, auto |
| Launcher Path | TextField | — |
| Detect Timeout | SpinBox | 100–10 000 ms |
| Startup Timeout | SpinBox | 1 000–60 000 ms |

### Footer

| Element | Description |
|---|---|
| Error label | Red (`#f44336`), conditional; shows save error message |
| Cancel button | Closes overlay without saving |
| Save button | Calls `_saveSettings()` — serialises all controls to JSON, sends to bridge; closes on success |

### Signals

| Signal | Emitted when |
|---|---|
| `openRawEditorRequested()` | "Edit TOML" button clicked |

---

## 11. MCP Proxy Panel (`McpProxyPanel.qml`)

Read-only status panel for the MCP proxy layer. Embedded in the bottom row of the main scroll content.

### UI Elements

| Element | Description |
|---|---|
| "MCP PROXY" label | 10 px, gray, uppercase |
| Total Connections counter | Large 22 px bold number |
| Active Instances counter | Large 22 px bold number |
| Sparkline canvas | Rolling 40-sample history; blue stroke `#58a6ff`; fills available width |
| Distribution label | Conditional (`visible: totalConnections > 0`); shows instance distribution text |

### Data

- `totalConnections` — updates on every bridge property change; new values appended to internal 40-slot history array, which triggers `sparklineCanvas.requestPaint()`.
- `activeInstances` — displayed directly.
- `distribution` — text description of instance load distribution.

No user interaction; read-only.

---

## 12. Event Broadcast Panel (`EventBroadcastPanel.qml`)

Visual indicator for the supervisor's event relay channel.

### UI Elements

| Element | Description |
|---|---|
| "EVENT BROADCAST" label | 10 px, gray, uppercase |
| Status label | "X events relayed" when enabled; "Broadcast channel disabled" when not |
| Subscriber count label | Green (`#3fb950`) when > 0, otherwise gray; visible only when `enabled` |
| Animated toggle | 40 × 22 px pill with inner 18 × 18 px ball |

### Animated Toggle

- Active: green background (`#3fb950`), ball on right
- Inactive: dark background (`#30363d`), ball on left
- Both colour and position animate over 150 ms on `enabled` change
- **Read-only visual indicator** — does not control the enabled state

---

## 13. About Panel (`AboutPanel.qml`)

Full-window overlay providing version information, service reference, REST API reference, and upgrade report.

### Layout

```
Rectangle (overlay, z:10)
├── Header: "About Project Memory Supervisor" + Close button
└── Flickable (scrollable)
    └── ColumnLayout (body cards)
        ├── Version Card
        ├── Service Port Map Card
        ├── Fallback REST API Card
        ├── Upgrade Report Card (conditional)
        └── Notes Card
```

### Version Card

- Version string: "Project Memory Supervisor v{version}" (15 px bold, `#58a6ff`)
- Runtime info: "Runtime: Rust + Qt/QML (CxxQt)" (12 px gray)

### Service Port Map Card

Repeater of 6 rows, each with tooltip on hover:

| Service | Port | Runtime |
|---|---|---|
| MCP Server | (dynamic) | node dist/index.js |
| CLI MCP Server | 3466 | node dist/index-cli.js |
| Interactive Terminal | (dynamic) | interactive-terminal.exe |
| Dashboard | (dynamic) | node dist/index.js |
| Fallback REST API | 3465 | node dist/fallback-rest-main.js |
| Supervisor GUI | 3464 | supervisor.exe (Qt) |

### Fallback REST API Card

12 endpoint rows (monospace), covering: health checks, service listing, per-service start/stop/restart, MCP and supervisor upgrade triggers, runtime log retrieval, workspace listing, and GUI launch.

### Upgrade Report Card

Visible only when `bridge.upgradeReportJson` is populated. Border colour reflects outcome:

| Outcome | Border |
|---|---|
| success | `#3fb950` (green) |
| partial | `#ffeb3b` (yellow) |
| failed | `#f85149` (red) |

**Contents:**
- Header row: "LAST UPGRADE REPORT" + **Dismiss** button (`bridge.dismissUpgradeReport()`)
- Status row: ✓/⚠/✗ icon + timestamp
- Steps Repeater: icon (✓/✗/?), step name, elapsed ms, detail text
- Services-after Repeater: green/red badges per service showing name and port
- Build log path (conditional)

### Notes Card

Six bullet points covering operational tips:
1. Window close minimises to tray
2. Right-click tray for shortcuts
3. Fallback REST API reachable when minimised
4. Upgrade reports cleared on dismiss
5. Config file path
6. Ports manifest path

---

## 14. System Tray

**Component:** `Platform.SystemTrayIcon` (`Qt.labs.platform`)

| Property | Value |
|---|---|
| Visibility | `!supervisorGuiBridge.quitting` |
| Icon | `supervisorGuiBridge.trayIconUrl` |

### Tooltip

Dynamic multi-line string:
```
Project Memory Supervisor
{statusText}
[Workspace: {workspaceName}]   (only when focused workspace set)
Events: [on] {totalEmitted} relayed   OR   Events: [off]
```

### Activation

Single-click or double-click → `supervisorGuiBridge.showWindow()`

### Context Menu (11 items)

| Item | Condition | Action |
|---|---|---|
| Show Supervisor | Always | `showWindow()` |
| Open Focused Workspace in VS Code | Only when `focusedWorkspacePath !== ""` | `openFocusedWorkspace()` |
| *(separator)* | | |
| MCP Server — Restart | Always | `restartService("mcp")` |
| Interactive Terminal — Restart | Always | `restartService("terminal")` |
| Dashboard — Restart | Always | `restartService("dashboard")` |
| Fallback API — Restart | Always | `restartService("fallback_api")` |
| *(separator)* | | |
| Quit Supervisor | Always | `quitSupervisor()` |
| *(separator)* | | |
| Show Pairing QR | Always | `pairingDialog.open()` |

### Tray Notifications

When `supervisorGuiBridge.trayNotificationText` changes to a non-empty string, the tray icon shows an information balloon:
- Title: "Focused Workspace Generated"
- Body: notification text
- Duration: 5 000 ms

---

## 15. Backend Bindings (Rust → QML)

### 15.1 `SupervisorGuiBridge`

The central CXX-Qt bridge object (`#[qml_element]`, threaded). Available in QML as `supervisorGuiBridge`.

#### Properties

| QML Name | Type | Description |
|---|---|---|
| `windowVisible` | `bool` | Main window visibility |
| `statusText` | `QString` | General status message |
| `trayIconUrl` | `QString` | Tray icon image path/URL |
| `mcpStatus` | `QString` | MCP service status string |
| `cliMcpStatus` | `QString` | CLI MCP service status string |
| `terminalStatus` | `QString` | Interactive Terminal status string |
| `dashboardStatus` | `QString` | Dashboard status string |
| `fallbackStatus` | `QString` | Fallback API status string |
| `mcpPort` | `i32` | MCP service port number |
| `mcpPid` | `i32` | MCP OS process ID |
| `mcpRuntime` | `QString` | MCP runtime label |
| `mcpUptimeSecs` | `i32` | MCP service uptime in seconds |
| `terminalPort` | `i32` | Terminal service port |
| `terminalPid` | `i32` | Terminal OS process ID |
| `terminalRuntime` | `QString` | Terminal runtime label |
| `terminalUptimeSecs` | `i32` | Terminal uptime in seconds |
| `dashboardPort` | `i32` | Dashboard service port |
| `dashboardPid` | `i32` | Dashboard OS process ID |
| `dashboardRuntime` | `QString` | Dashboard runtime label |
| `dashboardUptimeSecs` | `i32` | Dashboard uptime in seconds |
| `dashboardUrl` | `QString` | Dashboard web interface URL |
| `terminalUrl` | `QString` | Terminal web interface URL |
| `monitorUrl` | `QString` | Monitoring interface URL (default: `http://127.0.0.1:5173/monitor`) |
| `totalMcpConnections` | `i32` | Total MCP proxy connections ever |
| `activeMcpInstances` | `i32` | Currently active MCP instances |
| `mcpInstanceDistribution` | `QString` | JSON string: per-instance connection distribution |
| `eventSubscriberCount` | `i32` | Current `/supervisor/events` subscribers |
| `eventBroadcastEnabled` | `bool` | Whether event relay is active |
| `eventsTotalEmitted` | `i32` | Lifetime event count |
| `trayNotificationText` | `QString` | Pending tray balloon message (cleared after display) |
| `focusedWorkspacePath` | `QString` | Path to last generated `.code-workspace` file |
| `actionFeedback` | `QString` | Result of last async user action |
| `configEditorError` | `QString` | Error from config load/save operations |
| `quitting` | `bool` | Set immediately before process exit |
| `guiAuthKey` | `QString` | `X-PM-API-Key` value for chatbot requests |
| `customServicesJson` | `QString` | JSON array of `[[servers]]` entries: `[{name, display, status, port}]` |
| `upgradeReportJson` | `QString` | JSON of last upgrade report; empty when dismissed |

#### Invokable Methods

| QML Method | Parameters | Returns | Description |
|---|---|---|---|
| `showWindow()` | — | void | Show the main GUI window |
| `hideWindow()` | — | void | Hide to system tray |
| `quitSupervisor()` | — | void | Graceful shutdown (stops child services, then exits) |
| `openDashboard()` | — | void | Open dashboard URL in system browser |
| `openTerminal()` | — | void | Launch / show the interactive terminal window |
| `restartService(service)` | `service: QString` | void | Restart named service |
| `stopService(service)` | `service: QString` | void | Stop named service |
| `startService(service)` | `service: QString` | void | Start named service |
| `openConfig()` | — | void | Open `supervisor.toml` in the system default editor |
| `loadConfigToml()` | — | `QString` | Load raw TOML file as text; sets `configEditorError` on failure |
| `saveConfigToml(content)` | `content: QString` | `bool` | Validate and save TOML; sets `configEditorError` on failure |
| `loadSettingsJson()` | — | `QString` | Load `supervisor.toml` serialised as JSON for structured UI |
| `saveSettingsJson(json)` | `json: QString` | `bool` | Apply JSON delta onto `supervisor.toml`, preserving unshown fields |
| `loadVscodeSettingsJson()` | — | `QString` | Load `projectMemory.*` / `supervisor.*` VS Code settings as flat JSON; returns `"{}"` when VS Code not detected |
| `saveVscodeSettingsJson(json)` | `json: QString` | `bool` | Merge flat JSON into VS Code `settings.json`; best-effort |
| `openInIde(workspaceId)` | `workspaceId: QString` | void | Resolve workspace path via MCP admin API and open in VS Code |
| `backupWorkspacePlans(wsId, dir)` | two `QString` | void | Backup all plans to JSON files; posts count to `actionFeedback` |
| `createPlanFromPrompt(prompt, wsId)` | two `QString` | void | Spawn brainstorm-agent; posts result to `actionFeedback` |
| `registerWorkspace(path)` | `path: QString` | void | Register workspace with MCP server; posts result to `actionFeedback` |
| `openFocusedWorkspace()` | — | void | Open the most recently generated `.code-workspace` file |
| `dismissUpgradeReport()` | — | void | Clear the upgrade report card |

### 15.2 `QrPairingBridge`

CXX-Qt bridge for mobile pairing (`#[qml_element]`, threaded). Available in QML as `qrPairingBridge`.

#### Properties

| QML Name | Type | Description |
|---|---|---|
| `pairingQrSvg` | `QString` | SVG markup for the QR code (`pmobile://` URI) |
| `apiKeyText` | `QString` | Raw API key; `"(not yet set)"` before initialisation |

#### Invokable Methods

| QML Method | Description |
|---|---|
| `refreshPairingQr()` | Regenerate QR SVG from current pairing config; updates both properties |

---

## Appendix — REST API Endpoints Used by QML

| Panel | Method | Endpoint | Purpose |
|---|---|---|---|
| Plans | GET | `/admin/workspaces` | Load workspace list |
| Plans | GET | `/admin/plans?workspace_id=&status=` | Load plans |
| Plans | POST | `/api/agent-session/launch` | Launch Gemini agent |
| Plans | POST | `/terminal/launch-claude` | Launch Claude CLI agent |
| Sprints | GET | `/api/sprints/workspace/{id}` | Load sprint list |
| Sprints | GET | `/api/sprints/{id}` | Load goals for sprint |
| Sprints | POST | `/api/sprints` | Create sprint |
| Sprints | POST | `/api/sprints/{id}/goals` | Add goal |
| Sprints | PATCH | `/api/sprints/{id}/goals/{goalId}` | Toggle goal completion |
| Sessions | GET | `/sessions/live` | Live session list |
| Sessions | POST | `/sessions/stop` | Stop a session |
| User Sessions | GET | `/admin/user-sessions` | Load user session list |
| User Sessions | POST | `/admin/user-sessions` | Create user session |
| User Sessions | PUT | `/admin/user-sessions/{id}` | Update user session |
| User Sessions | DELETE | `/admin/user-sessions/{id}` | Delete user session |
| Activity | GET | `/api/events` | Recent activity events |
| Cartographer | GET | `/admin/memory_cartographer/summary` | Load scan summary |
| Cartographer | POST | `/admin/memory_cartographer` | Trigger project scan |
