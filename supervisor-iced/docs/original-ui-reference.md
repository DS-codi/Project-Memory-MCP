# Project Memory Supervisor — Original QML UI Reference

Complete itemised inventory of every UI element and feature in the original QML supervisor.
Source files: `ref/*.qml`. Used as a fidelity guide for the iced port.

---

## 1. Window / Application Shell (`main.qml`)

### Window
- `ApplicationWindow`, initial size **1080 × 960**, minimumWidth **640**, minimumHeight **620**
- Background colour: `#0f1319`
- Title: `"Project Memory Supervisor"`
- Closing the X hides to tray (does **not** quit)
- Window width animates `NumberAnimation { duration: 200; easing: OutCubic }` when AI/Plans panels expand
- Auto-widens +380 px when ChatbotPanel expands, +416 px (expandedPanelWidth–44) when PlansPanel expands

### Theme palette
| Constant | Hex |
|---|---|
| bgWindow | `#0f1319` |
| bgPanel | `#161b22` |
| bgCard | `#1c2128` |
| bgTerminal | `#0d1117` |
| borderSubtle | `#30363d` |
| textPrimary | `#c9d1d9` |
| textSecondary | `#8b949e` |
| textAccent | `#58a6ff` |
| clrRunning | `#3fb950` |
| clrStopped | `#f85149` |
| clrYellow | `#ffeb3b` |

### System Tray Icon
- Visible when not quitting
- Tooltip shows status text + focused workspace name (last path component) + events relay count
- Left-click / double-click: show window
- Context menu items:
  1. "Show Supervisor"
  2. "Open Focused Workspace in VS Code" (hidden when no workspace)
  3. Separator
  4. "MCP Server — Restart"
  5. "Interactive Terminal — Restart"
  6. "Dashboard — Restart"
  7. "Fallback API — Restart"
  8. Separator
  9. "Quit Supervisor"
  10. Separator
  11. "Show Pairing QR"

### Header (top row, `anchors.margins: 12`)
- **Logo canvas** — 36×36 px; draws a white-filled square with yellow border `#ffde59`, black diamond outline + crosshair lines, black centre square with white inner square, black "pm" tag bottom-right; scale 36/48
- **Title label** — "PROJECT MEMORY SUPERVISOR", `pixelSize: 16`, bold, letterSpacing 1.0, colour `textPrimary`
- **Spacer** (fills width)
- **"Shut Down" button** — Material bg `#3a0e0e`, fg `#f85149`; opens `shutdownDialog`

### Shutdown Dialog
- Modal dialog, centred in overlay
- Title: "Shut Down Supervisor?"
- Background: `#1c2128`, border `#f85149` 1px, radius 4
- Body text: "This will stop all managed services…", pixelSize 13, colour `#c9d1d9`
- Buttons: "Cancel" | "Shut Down" (bg `#3a0e0e`, fg `#f85149`)

### Main layout (below header)
`RowLayout`, spacing 0, fills width+height:
1. **PlansPanel** (left side, collapsible strip/expanded panel)
2. **Flickable** (scrollable main content, fills width)
3. **ChatbotPanel** (right side, collapsible strip/expanded panel)

### Content sections (inside Flickable, ColumnLayout spacing 8)
| Section label | Contents |
|---|---|
| "MCP SERVERS" | 2-column GridLayout: MCP Server card, CLI MCP Server card |
| "SERVICES" | 2-column GridLayout: Interactive Terminal card, Dashboard card, Fallback API card |
| "CONFIGURED SERVERS" | (hidden when none) 2-column GridLayout with Repeater for custom servers |
| Sessions + Activity | RowLayout: SessionsPanel (left) + ActivityPanel (right) |
| Carto + MCP Proxy + Events | RowLayout: CartographerPanel (left) + [McpProxyPanel above EventBroadcastPanel] (right) |
| Action feedback | Label (textSecondary, visible only when non-empty) |

### Footer (bottom row, right-aligned)
- **"⚙  Settings"** button — opens `settingsOverlay`
- **"Minimize to Tray"** button

---

## 2. ServiceCard (`ServiceCard.qml`)

Each service is rendered as a card. The card is a `Rectangle` with:
- Background: `#161b22`, border `#30363d` 1px, radius 10
- Internal padding: 12 px all sides

### Card structure (ColumnLayout, spacing 10)

#### Header row (RowLayout, spacing 8)
1. **Icon box** — 28×28 Rectangle, radius 4, background `iconBgColor`; contains a `Canvas` (32×32, the `iconDelegate` component) centred inside
2. **Service name label** — pixelSize 12, colour `textPrimary`, fills width
3. **Status indicator** — RowLayout spacing 4:
   - 7×7 dot, radius 3.5, filled with `statusColor`
   - Status text, pixelSize 11, colour `statusColor`

#### Body row (RowLayout, spacing 8)
1. **StatusRing** (38×38 canvas — see §3)
2. **Info column** (ColumnLayout, spacing 3, fills width):
   - `infoLine1` shown when Running (pixelSize 11, `textSecondary`)
   - `infoLine2` shown when Running (pixelSize 11, `textSecondary`)
   - `infoAlways` always shown (pixelSize 11, `textSecondary`)
   - `offlineText` shown when not Running (pixelSize 11, `textSecondary`)
3. **Action buttons** (RowLayout, spacing 6):
   - Optional secondary action button
   - Primary action button

#### Runtime strip (optional, at bottom)
- Background `#0d1117`, border `#30363d` 1px, radius 4, padding `[0, 8]`
- Shows `runtimeStripLabel` (pixelSize 10, `textSecondary`) + `runtimeStripValue` (pixelSize 11, `textPrimary`) in a row spacing 8

---

## 3. StatusRing (`StatusRing.qml`)

- Canvas **38×38 px**
- Centre: (19, 19), radius 14, lineWidth 3
- Track arc: full 360°, colour `#30363d`
- Status arc: colour per status, 270° span starting at −90° (top)
  - Running: `#3fb950` (green)
  - Starting / Stopping: `#ffeb3b` (yellow)
  - Error / Stopped: `#f85149` (red)
  - Unknown: no arc drawn (only track visible)

---

## 4. Service Icons (`ServiceCard.qml` → Canvas iconDelegate)

All icons are **32×32 Canvas** elements inside the 28×28 icon box.

### MCP Server — accent `#ff90e8`, bg `#1a1628`
- Scale 32/512
- Full ring: `arc(256,256,144,0,2π)`, strokeStyle accent, lineWidth 28
- Lightning bolt fill: polygon `(320,40)→(120,280)→(260,280)→(160,480)→(440,200)→(280,200)→close`

### CLI MCP Server — accent `#26c6da`, bg `#0a1e25`
- Scale 32/512
- Chevron `>`: `(80,140)→(220,256)→(80,372)`, lineWidth 36, lineCap/Join round
- Underscore `_`: `(240,372)→(420,372)`, same stroke
- Small bolt (alpha 0.85): `(370,60)→(300,185)→(345,185)→(285,320)→(440,175)→(385,175)→close`, fill

### Interactive Terminal — accent `#38b6ff`, bg `#0d1f30`
- Scale 32/512
- Outer rect stroke: `(56,112,400,288)`, lineWidth 28
- Title bar fill: `(56,112,400,68)`, globalAlpha 0.4
- Prompt chevron: `(100,224)→(148,272)→(100,320)`, lineJoin miter, lineCap square, lineWidth 26
- Text bars: fill `(180,296,80,22)` + fill `(100,350,160,22)`

### Dashboard — accent `#42a5f5`, bg `#0d1f2e`
- Scale 32/24
- Four filled rectangles: `(3,3,7,9)`, `(14,3,7,5)`, `(14,12,7,9)`, `(3,16,7,5)`

### Fallback API — accent `#ef5350`, bg `#2a0d0d`
- Scale 32/512
- Clipboard body: `strokeRect(108,88,296,344)`, lineWidth 30
- Top tab: `fillRect(180,56,152,60)`
- Check mark: `(140,300)→(240,400)→(460,170)`, lineJoin miter, lineCap square, lineWidth 40

### Custom Servers — accent `#a8d8ea`, bg `#0d1e25`
- Scale 28/512
- Three horizontal bars: `fillRect(80,120,352,48)`, `fillRect(80,232,256,48)`, `fillRect(80,344,192,48)`

---

## 5. Service card data by service

| Service | Primary action | Secondary action | infoLine1 | infoLine2 | infoAlways | offlineText | runtimeStrip |
|---|---|---|---|---|---|---|---|
| MCP Server | "Restart" | "Manage" | "PID: X   Port: Y" | "Runtime: Z   Up: Ns" | — | — | No |
| CLI MCP Server | "Restart" | — | "Port: 3466" | "HTTP-only · CLI agents" | URL when offline | — | No |
| Interactive Terminal | "Stop"/"Start" | "Open" | "PID: X   Port: Y" | "Runtime: Z   Up: Ns" | — | — | Yes (runtime value) |
| Dashboard | "Restart" | "Visit" | "PID: X   Port: Y" | "Runtime: Z   Up: Ns" | — | — | No |
| Fallback API | "Restart" | — | — | — | "Proxy route: /api/fallback/*" | — | No |
| Custom servers | "Stop"/"Start" | "Restart" | "Port: X" (if set) | — | — | — | No |

---

## 6. ActivityPanel (`ActivityPanel.qml`)

- Background: `#161b22`, radius 10, border `#30363d` 1px, `Layout.fillWidth`, `implicitHeight: 200`
- Polls `GET /api/events?limit=15` every **3000 ms** (timer starts when `dashboardPort > 0`)

### Header row
- **Canvas** 18×18 (activity feed icon): lightning bolt, scale 18/32, strokeStyle `#ff9800`, lineWidth 2.5
- **Label** "RECENT ACTIVITY", pixelSize 10, letterSpacing 1.0, `textSecondary`, fills width
- **Live dot** — 8×8 circle, radius 4; green `#3fb950` when polling, red `#f85149` when not
- **Count badge** — rounded rect `implicitWidth: countLabel.implicitWidth + 12`, height 18, radius 9; bg `#21262d`; text "[N]", pixelSize 10, colour `textAccent`

### Body
- `ScrollView` with `ListView`, spacing 3, clip true
- Each row: `implicitHeight: eventText.implicitHeight + 8`
- Event text: `font.family: "Consolas"`, pixelSize 11, wrapMode `Text.NoWrap`, colour per type:
  - `plan_*` → `#3fb950` (green)
  - `session_*` → `#58a6ff` (blue)
  - `step_*` / `task_*` → `#e3b341` (yellow)
  - `error_*` → `#f85149` (red)
  - other → `#c9d1d9` (default)
- No events: centred label "No recent activity", pixelSize 11, `textSecondary`

---

## 7. SessionsPanel (`SessionsPanel.qml`)

- Background: `#161b22`, radius 10, border `#30363d` 1px, `Layout.fillWidth`, `implicitHeight: 200`
- Polls `GET /sessions/live` every **5000 ms** (timer starts when `mcpPort > 0`)

### Header row
- **Canvas** 20×20 (sessions icon): two overlapping person circles + connecting line
- **Label** "ACTIVE SESSIONS", pixelSize 10, letterSpacing 1.0, `textSecondary`, fills width
- **Live dot** — 8×8 circle; green when polling
- **Count badge** — same style as ActivityPanel badge

### Column headers row (spacing 0, no dividers)
- "SESSION ID" — pixelSize 10, `textSecondary`, preferredWidth 120
- "AGENT" — pixelSize 10, `textSecondary`, fills width
- "STATUS" — pixelSize 10, `textSecondary`, preferredWidth 60
- "ACTIONS" — pixelSize 10, `textSecondary`, preferredWidth 65

### Session rows (ListView, spacing 2)
- Height: 32 px per row
- SESSION ID: pixelSize 10, `font.family: "Consolas"`, `textAccent`, preferredWidth 120, elide Right
- AGENT: pixelSize 11, `textPrimary`, fills width, elide Right
- STATUS column:
  - If "active": pill badge — bg `#0e2318`, text `#3fb950`, pixelSize 9 bold, radius 9, `implicitWidth: badge.implicitWidth + 8`, height 18
  - Other: plain label, pixelSize 10, `textSecondary`
- ACTIONS column:
  - "Stop" button — pixelSize 9, preferredWidth 60, height 26; calls POST `/sessions/{id}/stop`
- No sessions: centred label "No active sessions", pixelSize 11, `textSecondary`

---

## 8. McpProxyPanel (`McpProxyPanel.qml`)

- Background: `#161b22`, radius 10, border `#30363d` 1px, `Layout.fillWidth`, `implicitHeight: 100`

### Header row (spacing 8)
- **Icon canvas** 16×16: three small horizontal bars (relay/proxy icon), scale 16/24, fill `#58a6ff`
- **Label** "MCP PROXY", pixelSize 10, letterSpacing 1.0, `textSecondary`, fills width

### Stats row (spacing 16)
- **Total connections column**:
  - Number: pixelSize 22, bold, colour `#58a6ff` (textAccent)
  - Label: "total conns", pixelSize 9, `textSecondary`
- **Active instances column**:
  - Number: pixelSize 22, bold, colour `textPrimary`
  - Label: "active inst.", pixelSize 9, `textSecondary`
- **Sparkline canvas** (fills width, height 32):
  - Background: `#0d1117` (bgTerminal)
  - Line: strokeStyle `#58a6ff`, lineWidth 1.5, lineCap round, lineJoin round
  - Filled area: same colour with alpha 0.15
  - Draws the last N connection history samples
- **Distribution label** (fills width): pixelSize 9, `textSecondary`, `text: distribution`, elide Right

---

## 9. EventBroadcastPanel (`EventBroadcastPanel.qml`)

- Background: `#161b22`, radius 10, border `#30363d` 1px, `Layout.fillWidth`, `implicitHeight: 72`

### Header row (spacing 8)
- **Icon canvas** 16×16: two concentric arcs (broadcast icon), scale 16/32, strokeStyle `#3fb950`, lineWidth 2, lineCap round
- **Label** "EVENT BROADCAST", pixelSize 10, letterSpacing 1.0, `textSecondary`

### Content row (spacing 12, vertical-centred)
- **Pill toggle** (MouseArea):
  - Outer pill: 40×22 Rectangle, radius 11
    - Background: `#3fb950` when enabled, `#30363d` when disabled
    - Colour animates: `ColorAnimation { duration: 150 }`
    - Click: calls `supervisorGuiBridge.setEventBroadcast(!enabled)`
  - Inner knob: 18×18 Rectangle, radius 9
    - Background: `#ffffff`
    - x = 20 when enabled, x = 2 when disabled
    - Animates: `NumberAnimation { duration: 150; easing: OutCubic }`
- **Status label** (fills width):
  - When enabled: "Broadcasting · N subscribers · N events", pixelSize 10, colour `#3fb950`
  - When disabled: "Disabled", pixelSize 10, colour `textSecondary`

---

## 10. PlansPanel (`PlansPanel.qml`)

### Collapsed strip (44 px wide)
- ► button (text `\u25BA`, pixelSize 14, tooltip "Open Plans"): expands panel
- "PLANS" label, pixelSize 9, `#8b949e`, letterSpacing 1.5, rotation 90°

### Expanded panel (460 px wide, animates 200 ms OutCubic)
- Background: `#161b22`, border `#388bfd` 1px when expanded (else `#30363d`)
- Border animates: `ColorAnimation { duration: 120 }`

#### Header row
- Title label: "PLANS" or "SPRINTS", pixelSize 11, bold, letterSpacing 1.2, `#c9d1d9`
- **Workspace ComboBox**: preferredWidth 160, height 26, pixelSize 11
- **↻ Refresh** ToolButton: 26×26, pixelSize 14
- **◄ Close** ToolButton: 26×26, pixelSize 14

#### Main tab bar (Plans / Sprints)
- Two TabButtons: "Plans", "Sprints", pixelSize 11, height 28

#### Plans content (tab 0)

**Toolbar row** (spacing 5):
- "Open in IDE" button — highlighted, pixelSize 10, padding `[4,10,4,10]`
- "Register WS" button — pixelSize 10
- "Backup" button — pixelSize 10
- "Create Plan" button — pixelSize 10
- Spacer
- **Provider ComboBox** — model `["Gemini","Claude CLI"]`, width 92, height 26, pixelSize 10

**Sub-tab bar** (Active / All Plans):
- Two TabButtons: "Active", "All Plans", pixelSize 11, height 28

**Plan list** (ScrollView, spacing 6):
Each plan card (ColumnLayout):
- **Header strip** (always 54 px high):
  - Background: `#1c2128` when expanded, `#0d1117` when collapsed; border `#388bfd`/`#30363d`
  - `+` / `–` prefix label, pixelSize 11, `#8b949e`, preferredWidth 12
  - Plan title, pixelSize 13, `#c9d1d9`, fills width, elide Right
  - Steps counter "N/M", pixelSize 11, `#8b949e`
  - Status badge (60×20, radius 9):
    - active: bg `#0e2318`, text `#3fb950`
    - paused: bg `#1f1a0e`, text `#d29922`
    - blocked: bg `#2d0f0f`, text `#f85149`
    - other: bg `#21262d`, text `#8b949e`
  - ProgressBar: height 3, value = stepsDone/stepsTotal

- **Expanded detail** (animated height, `NumberAnimation 180 ms OutCubic`):
  - Background `#1c2128`, border `#388bfd`
  - Category + recommended agent row (pixelSize 10): category in `#58a6ff`, divider dot, agent in `#8b949e`
  - Next/active step block:
    - "IN PROGRESS" / "NEXT STEP" label (pixelSize 9, bold, `#3fb950`/`#d29922`) + phase dot (pixelSize 9, `#6e7681`)
    - Step task (pixelSize 13, `#e6edf3`, wordWrap, fills width)
    - Agent name (pixelSize 10, `#58a6ff`)
  - "All steps complete" (pixelSize 11, `#3fb950`) or "No steps defined" (pixelSize 11, `#6e7681`)
  - **"Open in Dashboard"** button (36 px high, radius 6, bg `#0d2547`→hover `#1c3d78`→press `#1e4a8c`, border `#388bfd`, label pixelSize 13 bold, `#c9d1d9`)
  - Secondary actions row:
    - **"Copy Details"** (fills half width, 30 px high, radius 6, bg `#091710`, border `#3fb950`, label pixelSize 12 bold, `#3fb950`)
    - **"Launch Agent"** / **"Launch Claude CLI"** (fills half width, 30 px high, radius 6, bg `#0f0820`, border `#8957e5`; state ok→`#3fb950`, error→`#f85149`)

Polled every **15 seconds** when expanded.

#### Popups
- **Register Workspace**: title, path TextField, Cancel / Register buttons
- **Backup Plans**: title, output-dir TextField, Cancel / Backup buttons
- **Create Plan from Prompt**: title, 80 px TextArea prompt field, Cancel / Start Agent buttons

---

## 11. SprintsPanel (`SprintsPanel.qml`)

Embedded inside PlansPanel (tab 1), same 460 px width.

### Header row
- "SPRINTS" label, pixelSize 11, bold, letterSpacing 1.2
- ↻ Refresh ToolButton (26×26)
- ◄ Close ToolButton (26×26)

### Toolbar row
- "Create Sprint" button (highlighted), "Add Goal" button; spacing 5

### Sprint list (ScrollView, spacing 6):
Each sprint card (ColumnLayout):
- **Header strip** (48 px high):
  - `+`/`–` prefix, sprint name (pixelSize 13, `#c9d1d9`), goal count (pixelSize 10, `#8b949e`)
  - Status badge (60×18, radius 9): active `#0e2318`/`#3fb950`, completed `#0d2547`/`#388bfd`, planned `#1f1a0e`/`#d29922`
  - Date range (pixelSize 10, `#6e7681`, leftMargin 18)
- **Expanded detail** (animated 180 ms, bg `#1c2128`, border `#388bfd`):
  - "GOALS" section header (pixelSize 10, bold, `#8b949e`)
  - Goals Repeater — each goal item:
    - Height: `goalRow.implicitHeight + 12`, radius 4
    - Completed: bg `#0a1f14`, border `#3fb950`; not completed: bg `#0d1117`, border `#30363d`
    - CheckBox + description label (pixelSize 12; completed: `#3fb950` + strikeout; incomplete: `#c9d1d9`) + optional plan link emoji `📋`
  - "No goals defined" fallback (pixelSize 11, `#6e7681`)

Polled every **15 seconds** when expanded. Popups: Create Sprint (name + optional duration days), Add Goal (description TextArea).

---

## 12. CartographerPanel (`CartographerPanel.qml`)

- Background: `#161b22`, radius 10, border `#30363d` 1px, `Layout.fillWidth`
- `implicitHeight`: 242 when stats visible, 185 when not

### Header row (spacing 8)
- **Cartographer icon canvas** (26×26, scale 26/512):
  - Diamond outline (strokeStyle `#cc3333`, lineWidth 32): `(48,256)→(256,96)→(464,256)→(256,416)→close`
  - Crosshair lines (lineWidth 16): vertical `(256,108)→(256,404)`, horizontal `(60,256)→(452,256)`
  - Outer square fill `#cc3333`: `(200,200,112,112)`
  - Inner square fill `#1c2128` (cutout): `(224,224,64,64)`
- **"WORKSPACE CARTOGRAPHER"** label — pixelSize 10, letterSpacing 1.0, `#8b949e`, fills width

### Workspace selector row
- **ComboBox** (fills width): shows workspace names, "No workspaces registered" or "MCP offline" when unavailable
- **↻ Refresh** flat button (implicitWidth 32)

### Scan button
- "Scan Project" — full width, enabled when workspace selected and MCP running

### Status label
- Colour: green (`#3fb950`) on "Scan…", red (`#f85149`) on "Error…"/"HTTP…", grey `#8b949e` otherwise

### Stats section (hidden until first scan)
- 1px horizontal divider `#30363d`
- Files count + elapsed ms label (pixelSize 11, `#3fb950`)
- "Last scan: YYYY-MM-DD HH:MM" label (pixelSize 10, `#8b949e`)

---

## 13. ChatbotPanel (`ChatbotPanel.qml`)

### Collapsed strip (44 px wide, right side)
- ◄ button (pixelSize 14, tooltip "Open AI Assistant")
- "AI" label — pixelSize 11, bold, colour `#58a6ff`, letterSpacing 0.8
- **Provider colour dot** (8×8, radius 4): Copilot `#1f6feb`, Gemini `#388bfd`
- **API-key status dot** (8×8, radius 4): configured `#3fb950`, missing `#e3b341`

### Expanded panel (380 px wide, animates 200 ms OutCubic)
- Background: `#161b22`, border `#388bfd` when expanded

#### Expanded header row
- ► Collapse ToolButton (pixelSize 12)
- "[AI] AI ASSISTANT" label — pixelSize 11, bold, letterSpacing 0.6, `#c9d1d9`, fills width
- Provider badge pill — height 18, radius 9; Copilot `#1f6feb`, Gemini `#388bfd`; white text pixelSize 10
- BusyIndicator (18×18, visible when busy)
- ⚙ Settings ToolButton (pixelSize 13) — toggles settings panel
- ⎚ Clear ToolButton (pixelSize 13) — clears messages (opacity 0.35 when disabled)
- ⊞ Pop-out ToolButton (pixelSize 13) — opens separate window, collapses panel

#### Separator: 1px line `#30363d`

#### Toolbar row
- **Workspace ComboBox** (fills width): custom dark bg `#0d1117`, border `#30363d`, pixelSize 11
- **Provider ComboBox** (110 px): "Gemini" / "Copilot", pixelSize 11

#### API-key warning
- "⚠ No API key configured — click ⚙ to add one", pixelSize 10, `#e3b341`, visible when key not configured

#### Settings panel (94 px, `#0d1117`, radius 6, border `#30363d`, visible when showSettings)
- **API Key row**: "API Key:" label (preferredWidth 56, `#8b949e`), password TextField (bg `#161b22`)
- **Model row**: "Model:" label, ComboBox with Gemini or Copilot model lists, "Save" button

#### Chat message list (ScrollView + ListView, spacing 6)
Message types:
- **Tool call chip**: centred, `(chipLabel.width+16) × 20`, radius 10, bg `#21262d`, border `#388bfd`, `▸ toolCallName` in `#79c0ff`, pixelSize 10
- **Chat bubble**: 88% of list width, radius 8
  - User: bg `#1f6feb`, border `#388bfd`, anchored right
  - Assistant: bg `#21262d`, border `#30363d`, anchored left
  - Content: `TextEdit` (readOnly, selectByMouse), pixelSize 12, `#c9d1d9`

#### Input row (spacing 6)
- **TextArea** (fills width, minHeight 72, bg `#0d1117` radius 6 border `#30363d`):
  - Placeholder: "Ask the AI about your plans…", `#6e7681`, pixelSize 12
  - Enter key sends (Shift+Enter = newline)
- **"↑ Send" button** — pixelSize 11, disabled when busy or empty

Live tool-call polling: `Timer { interval: 600 }` while a request is in-flight — appends tool call chips incrementally.
Request timeout: 20 000 ms.

### Pop-out window (520×640, bg `#0f1319`)
- Same message model shared with panel
- "Dock" button to return, ⎚ clear button
- Same chat list and input as panel

---

## 14. SettingsPanel (`SettingsPanel.qml`)

Full-window overlay (`anchors.fill: parent`, `z: 10`, bg `#0d1117`), visible when `settingsOverlay.visible`.

### Header row
- "⚙  Settings" label, pixelSize 18, bold, `#c9d1d9`
- "Edit TOML" flat button — closes overlay and opens raw TOML editor

### Layout: sidebar + content (RowLayout)

#### Sidebar (150 px wide, bg `#0f1319`, radius 6, border `#30363d`)
Five `ItemDelegate` rows (each 36 px high, pixelSize 13):
0. General
1. Services
2. Reconnect
3. Approval
4. VS Code

#### Content area (bg `#0f1319`, radius 6, border `#30363d`, fills width + height)
`StackLayout` driven by active category:

**0 — General** (Flickable + ColumnLayout):
- Section "SUPERVISOR": Log Level ComboBox `["trace","debug","info","warn","error"]` (width 150); Bind Address TextField (width 210, placeholder `127.0.0.1:3456`)

**1 — Services** (Flickable + ColumnLayout):
- Section "MCP SERVER": Enabled Switch; Port SpinBox (default 3457); Health Timeout Slider (300–10000 ms, default 1500); Pool: Min Instances SpinBox (default 1), Max Instances (default 4), Max Conns/Instance (default 5)
- Section "INTERACTIVE TERMINAL": Enabled Switch; Port SpinBox (default 3458)
- Section "DASHBOARD": Enabled Switch; Port SpinBox (default 3459); Requires MCP Switch

**2 — Reconnect** (Flickable + ColumnLayout):
- Initial Delay (ms) SpinBox (100–10000, default 500)
- Max Delay (ms) SpinBox (1000–120000, default 30000)
- Multiplier Slider (1.0–5.0, default 2.0)
- Max Attempts SpinBox (0–1000, default 0)
- Jitter Ratio Slider (0.0–1.0, default 0.2)

**3 — Approval** (Flickable + ColumnLayout):
- Countdown Seconds SpinBox (5–300, default 60)
- On Timeout ComboBox `["approve","reject"]`
- Always on Top Switch

**4 — VS Code** (Flickable + ColumnLayout):
- MCP Port SpinBox (default 3457)
- Server Port SpinBox (default 3459)
- Agents Root TextField
- Skills Root TextField
- Instructions Root TextField
- Notifications: Enabled / Agent Handoffs / Plan Complete / Step Blocked — Switches
- Dashboard Enabled Switch
- Auto-Deploy on Open Switch
- Auto-Deploy Skills Switch
- Container Mode ComboBox `["auto","local","container"]`
- Startup Mode ComboBox `["off","prompt","auto"]`
- Launcher Path TextField
- Detect Timeout SpinBox (default 1000 ms)
- Startup Timeout SpinBox (default 15000 ms)

#### Footer row (right-aligned)
- Error label (red, visible when non-empty)
- "Save" button (highlighted)
- "Cancel" button

---

## 15. PairingDialog (`PairingDialog.qml`)

Modal Dialog, 360×460, centred in overlay.
- Title: "Pair Mobile Device"
- Background: `#1c2128`, border `#30363d`, radius 6
- Body:
  - Instructions label (pixelSize 13, `#c9d1d9`, wordWrap)
  - **QR image** (220×220): rendered from SVG data URI via `QrPairingBridge.pairingQrSvg`; `smooth: false` to keep QR crisp
  - Fallback: dark rectangle with "Generating QR…" label when not ready
  - **API Key label**: "API Key: XXXXX…", `font.family: "Courier New"`, pixelSize 10, `#8b949e`, wrapAnywhere
- Buttons row:
  - "Refresh Key" button — regenerates QR
  - Spacer
  - "Close" button

---

## 16. AboutPanel (`AboutPanel.qml`)

Full-window overlay (`anchors.fill: parent`, `z: 10`, bg `#0f1319`), visible when clicked from footer.

### Header row
- "About Project Memory Supervisor" label, pixelSize 20, bold, `textPrimary`
- "Close" flat button

### Scrollable body (Flickable)
Four card sections (`#1c2128` bg, `#30363d` border, radius 6):

**1. Version card**
- "VERSION" section header (pixelSize 10, letterSpacing 1.0, `textSecondary`)
- "Project Memory Supervisor vX.Y.Z", pixelSize 15, bold, `textAccent`
- "Runtime: Rust + Qt/QML (CxxQt)", pixelSize 12, `textSecondary`

**2. Managed Services port map**
- "MANAGED SERVICES" header
- Column headers: Service (200 px) | Port (70 px) | Runtime (fills width) — pixelSize 11, bold, `textSecondary`
- 1px divider `#30363d`
- 6 rows (Repeater):
  - Service name (pixelSize 12, `textPrimary`, 200 px)
  - Port (pixelSize 12, monospace, `textAccent`, 70 px)
  - Runtime executable (pixelSize 11, `textSecondary`, fills width, elide Right; tooltip = description)

**3. Fallback REST API quick-reference**
- "FALLBACK REST API — port 3465" header
- 12 monospace labels (pixelSize 11) listing all REST endpoints

**4. Upgrade report** (visible only when a report exists)
- Border colour reflects report status: green/yellow/red
- "LAST UPGRADE REPORT" header + "Dismiss" flat button
- Status icon + label (✓ Success / ⚠ Partial / ✗ Failed) + timestamp
- Steps Repeater: ✓/✗/? icon, step number+name+elapsed ms, detail text
- 1px divider
- "Services after upgrade:" label + badge Repeater (service name + port; green/red bg based on reachability)
- Build log path (pixelSize 10, monospace, `textSecondary`)

**5. Notes card**
- 6 bullet-point labels (pixelSize 12, `textPrimary`, wordWrap)

---

## 17. Raw TOML Config Editor Overlay (`main.qml` inline)

`Rectangle`, `z: 10`, bg `#212121`, `anchors.fill: parent`, visible when editing.

### Header
- "Edit supervisor.toml", pixelSize 18, bold
- "Open in Editor" flat button (opens file in system editor)

### Text area
- `Rectangle` (`#1a1a1a`, border `#444444`, radius 4)
- `ScrollView` with `TextArea`:
  - `font.family: "Consolas"`, pixelSize 13
  - `wrapMode: NoWrap` (horizontal scroll)
  - Colour `#e0e0e0`, selectByMouse

### Footer
- Error label (`#f44336`)
- "Save" (highlighted) | "Cancel" buttons

---

## 18. Summary — Panel layout map

```
┌──────────────────────────────────────────────────────────────────────┐
│  HEADER: [logo 36×36] [PROJECT MEMORY SUPERVISOR]   [Shut Down]      │
├────────┬─────────────────────────────────────────────────────┬───────┤
│ PLANS  │  MCP SERVERS (2-col grid)                           │  AI   │
│ PANEL  │  SERVICES (2-col grid)                              │ PANEL │
│ 44px   │  CONFIGURED SERVERS (2-col grid, hidden when none)  │ 44px  │
│collapsed│ ─────────────────────────────────────────────       │collapsed│
│  or    │  [SessionsPanel]    [ActivityPanel]                  │  or   │
│ 460px  │  ─────────────────────────────────────────          │ 380px │
│expanded│  [CartographerPanel] [McpProxyPanel  ]              │expanded│
│        │                      [EventBroadcast ]              │       │
├────────┴─────────────────────────────────────────────────────┴───────┤
│  FOOTER: (right-aligned) [⚙ Settings] [Minimize to Tray]             │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 19. Colour quick-reference

| Use | Hex |
|---|---|
| Window background | `#0f1319` |
| Panel background | `#161b22` |
| Card background | `#1c2128` |
| Terminal background | `#0d1117` |
| Card border (subtle) | `#30363d` |
| Active/selected border | `#388bfd` |
| Text primary | `#c9d1d9` |
| Text secondary | `#8b949e` |
| Text accent (blue) | `#58a6ff` |
| Muted text | `#6e7681` |
| Running / success | `#3fb950` |
| Error / stopped | `#f85149` |
| Warning / paused | `#d29922` |
| Highlight yellow | `#ffeb3b` |
| Purple (launch agent) | `#8957e5` / `#a371f7` |
| User chat bubble | `#1f6feb` |
| AI chat bubble | `#21262d` |
