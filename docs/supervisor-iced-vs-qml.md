# supervisor-iced vs supervisor (QML) — Differences & Gaps

> This document compares the **iced** rewrite (`supervisor-iced/`) against the **QML** original (`supervisor/`) panel by panel. It covers features present in one but not the other, behavioural differences, and items that exist in name only (stubs / placeholders).
>
> Reference docs:
> - QML original: [`docs/supervisor-ui-features.md`](./supervisor-ui-features.md)
> - Iced rewrite: [`docs/supervisor-iced-ui-features.md`](./supervisor-iced-ui-features.md)

---

## Summary Table

| Area | QML | Iced | Gap |
|---|---|---|---|
| **Technology** | Qt 6 / QML / CxxQt | Rust / iced 0.13 | Different stack; QML requires C++ bridge |
| **QR generation** | CxxQt bridge → JS lib | Pure Rust (`qrcode` crate) | Iced is simpler / more portable |
| **Settings — functional controls** | ✅ All controls live, load & save | ❌ All controls are placeholder boxes | **Critical gap** |
| **Settings — VS Code sub-panel** | ✅ Full load/save | ❌ Stub labels only | **Critical gap** |
| **About — upgrade report** | ✅ Full card with steps, dismiss | ❌ Entirely absent | Major gap |
| **Plans — Register WS popup** | ✅ | ❌ Missing | Gap |
| **Plans — Backup Plans popup** | ✅ | ❌ Missing | Gap |
| **Plans — provider selector** | ✅ Interactive ComboBox | ❌ Read-only badge | Gap |
| **Plans — launch state machine** | ✅ idle→sending→ok/error colours | ❌ Fire-and-forget | Gap |
| **Sprints — Create Sprint popup** | ✅ | ❌ Missing | Gap |
| **Sprints — Add Goal popup** | ✅ | ❌ Missing | Gap |
| **Sprints — date range display** | ✅ | ❌ Missing | Gap |
| **Sprints — plan badge on goals** | ✅ 📋 indicator | ❌ Missing | Minor gap |
| **Sprints — strikethrough on done** | ✅ | ❌ iced text lacks strikethrough | Minor |
| **Sessions Dashboard Panel** | ✅ Full panel (pin, CRUD, notes) | ❌ **Entirely absent** | **Major gap** |
| **Chatbot — workspace selector** | ✅ | ❌ Missing | Gap |
| **Chatbot — model/temp controls** | ✅ Model ComboBox in settings | ❌ API key only | Gap |
| **Chatbot — provider toggle** | ✅ Interactive | ❌ Read-only badge | Gap |
| **Chatbot — multi-line input** | ✅ Up to 4 lines, Enter to send | ❌ Single-line only, no Enter | Gap |
| **Chatbot — tool-call polling** | ✅ 600 ms polling | ❌ Not polled separately | Minor |
| **Event Broadcast — toggle** | ❌ Read-only visual | ✅ **Clickable**, calls backend | Iced improvement |
| **MCP Proxy — sparkline** | Line only | Line + filled area | Iced improvement |
| **Activity — live dot + count** | ❌ | ✅ Live dot + count badge | Iced improvement |
| **Sessions — live dot + count** | ❌ | ✅ Live dot + count badge | Iced improvement |
| **Tray — per-service restart items** | ✅ 4 separate items | ❌ Single "Restart Services" | Gap |
| **Tray — Open Focused Workspace** | ✅ Conditional item | ❌ Missing | Gap |
| **Tray — Show Pairing QR** | ✅ | ❌ Missing | Gap |
| **Tray — dynamic tooltip** | ✅ workspace + events | ❌ Static text | Gap |
| **Tray — balloon notifications** | ✅ | ❌ Missing | Gap |
| **Tray menu size** | 9+ items | 4 items | Gap |
| **Footer — Virtual Monitor button** | ✅ | ❌ Missing | Minor gap |
| **Animations — sidebar** | ✅ 200 ms OutCubic | ✅ 16 ms tick interpolation | Equivalent |
| **Animations — plan cards** | ✅ 180 ms OutCubic | ✅ Tick-based clip | Equivalent |
| **Animations — panel border** | ✅ 120 ms colour fade | ❌ Instant | Minor difference |
| **Animations — toggle pill** | ✅ 150 ms smooth | ❌ Instant | Minor difference |
| **Keyboard shortcuts** | ❌ None | ❌ None | Both lack |
| **Session stale filter** | ✅ Filters >10 min sessions | ❌ No filter | Iced gap |

---

## 1. Application Shell

### Present in QML, absent in iced

| Feature | Notes |
|---|---|
| Virtual Monitor button (footer) | Opens `monitorUrl` externally; not in iced footer |
| Config "Open in Editor" path | QML has a dedicated button; iced raw editor has no "open in system editor" |

### Present in both but different

| Aspect | QML | Iced |
|---|---|---|
| Window hide | `supervisorGuiBridge.hideWindow()` | Toggle window to `Hidden` iced mode |
| Window activation | `raise(); requestActivate()` on `visibleChanged` | Not implemented — window just becomes `Windowed` |
| Config editor | Consolas 13 px, error label, save/cancel buttons, Open in Editor button | Same structure minus "Open in Editor" |

---

## 2. Settings Panel — Critical Gap

This is the largest functional gap in the iced version.

### QML Settings Panel

- All 5 categories have **live controls** (Switch, SpinBox, Slider, ComboBox, TextField)
- On open: `_loadSettings()` reads `supervisor.toml` via `bridge.loadSettingsJson()` and populates every control
- On save: `_saveSettings()` serialises all controls to JSON, calls `bridge.saveSettingsJson()` → persists to disk
- VS Code category: also loads/saves `projectMemory.*` keys in VS Code `settings.json` via `bridge.loadVscodeSettingsJson()` / `bridge.saveVscodeSettingsJson()`
- Error label shown on save failure

### Iced Settings Panel

- All 5 categories render **placeholder controls**: `placeholder_ctrl()` returns a styled empty `Space` (120 × 26 px box)
- No values are read from config
- `_on_save: Message` parameter is unused (prefixed `_`)
- No load/save logic exists in `settings_panel.rs`
- The only functional action is **"Edit TOML"** → opens the raw TOML text editor

### Specific controls that are stubs in iced

Every control listed in the QML settings doc is a placeholder. This includes:

- Log Level ComboBox
- Bind Address TextField
- All Enabled switches (MCP, Terminal, Dashboard, Events)
- All Port SpinBoxes
- Health Timeout, Instance Pool, Reconnect sliders/spinboxes
- Approval countdown, timeout action, always-on-top
- All VS Code fields (ports, paths, notifications, deployment, launcher)

---

## 3. Plans Panel

### Missing in iced

| Feature | QML | Iced |
|---|---|---|
| Register Workspace popup | ✅ TextField → `bridge.registerWorkspace()` | ❌ Button absent |
| Backup Plans popup | ✅ Dir TextField → `bridge.backupWorkspacePlans()` | ❌ Button absent |
| Provider selector | ✅ ComboBox: Gemini / Claude CLI | ❌ Read-only display badge |
| Launch button state machine | ✅ idle→sending→ok/error with colour feedback + 3 s reset | ❌ Fires `LaunchAgent` immediately, no feedback |
| Create Plan popup | ✅ TextArea prompt → `bridge.createPlanFromPrompt()` | ✅ `PlansCreatePlan` message — present but popup UI not shown in panel |

### Behavioural differences

| Aspect | QML | Iced |
|---|---|---|
| Plan card animation | Height animates via QML Behavior (180 ms OutCubic) | Tick-based `expanded_height` + `clip(true)` — same visual result |
| Border colour on expand | Animated (120 ms) | Instant colour switch |
| Plan list auto-refresh | Timer: 15 s | Self-scheduling `Task` at same interval |
| Workspace picker | ComboBox | `pick_list` — equivalent |
| Provider label | "Gemini" / "Claude CLI" in ComboBox | Same strings, non-interactive badge |

---

## 4. Sprints Panel

### Missing in iced

| Feature | QML | Iced |
|---|---|---|
| Create Sprint button + popup | ✅ Name + duration fields, POST `/api/sprints` | ❌ Entirely absent |
| Add Goal button + popup | ✅ Description TextArea, POST `/api/sprints/{id}/goals` | ❌ Entirely absent |
| Date range on sprint header | ✅ `startDate → endDate` | ❌ Not in data model |
| Plan badge on goals | ✅ 📋 emoji with tooltip linking to plan | ❌ Not rendered |
| Strikethrough on completed goals | ✅ CSS strikethrough | ❌ iced `text` widget has no strikethrough |

### Equivalent

- Sprint selection (one at a time)
- Goal completion toggle (checkbox → PATCH)
- Status badges (active/completed/planned colours match exactly)
- Empty state labels

---

## 5. Sessions Panel

### Present in iced but not in QML

| Feature | Notes |
|---|---|
| Live dot | Green/red 8 × 8 px dot showing polling state |
| Count badge | `[N]` badge showing session count |

### Differences

| Aspect | QML | Iced |
|---|---|---|
| Max entries | Capped at 20 | No cap |
| Stale filter | Excludes sessions with `lastCallAt` > 10 min | No filter applied |
| Session ID colour | `#c9d1d9` (TEXT_PRIMARY) | `#58a6ff` (TEXT_ACCENT) |

---

## 6. Sessions Dashboard Panel — Major Gap

**The Sessions Dashboard Panel (`SessionsDashboardPanel.qml`) has no equivalent in the iced version.**

This panel provides:
- Two-pane session manager (list + detail)
- Create / edit / delete user sessions
- Pin/unpin sessions
- Per-session working directories, commands, notes (editable)
- Linked agent session tracking with live status dots
- Copy-to-clipboard for paths and commands
- Auto-refresh every 10 s

None of this functionality exists in `supervisor-iced`. The main scroll content area simply omits this section.

---

## 7. Chatbot Panel

### Missing in iced

| Feature | QML | Iced |
|---|---|---|
| Workspace context selector | ✅ ComboBox (loaded from `/admin/workspaces`) | ❌ Not present |
| Provider toggle | ✅ Implicit via provider ComboBox | ❌ Provider badge is read-only |
| Model selector | ✅ In settings sub-panel | ❌ No model control at all |
| Temperature / parameters | ✅ In settings sub-panel | ❌ Not present |
| Multi-line input | ✅ TextArea (up to 4 lines), Shift+Enter = newline | ❌ Single `text_input` only |
| Enter-to-send | ✅ | ❌ Must click Send button |
| Tool-call polling | ✅ 600 ms `XMLHttpRequest` loop while busy | ❌ Tool-call chips come via chat reply only |
| History persistence | ✅ QML binds to bridge state | ✅ Saved to `AppState`, persisted on disk at app level |

### Present in iced, not in QML

| Feature | Notes |
|---|---|
| API key configuration dot on collapsed strip | Yellow/green 8 px dot on 44 px collapsed sidebar |

### Behavioural differences

| Aspect | QML | Iced |
|---|---|---|
| Settings trigger | ⚙ button opens sub-panel inside chat | Same — `chat_show_settings` toggle |
| Clear button | Enabled if messages exist | `on_press_maybe` pattern — same semantics |
| Send button | Disabled when empty or busy | `on_press_maybe` — equivalent |
| Busy indicator | Animated spinner or "…" | Static "…" text |

---

## 8. Activity Panel

### Present in iced, not in QML

| Feature | Notes |
|---|---|
| Live polling dot | Green/red 8 × 8 px dot |
| Count badge | `[N]` in `TEXT_ACCENT` |
| Agent name in entry | `[agent_type] event time` format |

### Differences

| Aspect | QML | Iced |
|---|---|---|
| Entry format | Chip: coloured rectangle with event text | Plain text line in matching colour |
| Prefix-based colouring | keyword matching (handoff, complete, error, active) | Prefix-based (`plan_*`, `session_*`, `step_*`, `task_*`, `error_*`) + legacy keywords |

---

## 9. Cartographer Panel

### Missing in iced

| Feature | QML | Iced |
|---|---|---|
| Compass canvas icon | ✅ 38 × 38 custom Canvas icon | ❌ Absent |
| Detailed stats section | ✅ File count, timing, cache status, last scan time (separate fields) | ❌ Two text labels only (`files_label`, `when_label`) |

### Equivalent

- Workspace pick_list (equivalent to QML ComboBox)
- Refresh button
- Scan button (disabled when MCP not running or no workspaces)
- Status label with colour (scanning=green, error=red, other=gray)

---

## 10. MCP Proxy Panel

### Present in iced, improved over QML

| Feature | QML | Iced |
|---|---|---|
| Sparkline fill area | ❌ Line only | ✅ Filled area (alpha 0.15) under line |
| Empty history display | Blank canvas | Flat centre line at alpha 0.25 |

### Differences

| Aspect | QML | Iced |
|---|---|---|
| Panel height | Flexible | Fixed 100 px |
| Total conns colour | `#58a6ff` (TEXT_ACCENT) | `TEXT_ACCENT` — same |

---

## 11. Event Broadcast Panel

### Present in iced, improved over QML

| Feature | QML | Iced |
|---|---|---|
| Toggle interactivity | ❌ Read-only visual indicator | ✅ Clickable button (`ToggleBroadcast`) |
| Status label | Separate relay count + subscriber labels | Single combined label |

### Differences

| Aspect | QML | Iced |
|---|---|---|
| Toggle animation | ✅ 150 ms smooth colour + position | ❌ Instant (no animation) |
| Subscriber label visibility | Only when enabled | Combined into one label always |

---

## 12. About Panel

### Missing in iced

| Feature | QML | Iced |
|---|---|---|
| **Upgrade report card** | ✅ Full card: status, per-step results, service health badges, build log path, Dismiss button | ❌ **Entirely absent** |
| Service row tooltips | ✅ Hover tooltip with description | ❌ No tooltips in iced |

### Differences

| Aspect | QML | Iced |
|---|---|---|
| Runtime string | "Rust + Qt/QML (CxxQt)" | "Rust + iced" |
| Cards present | Version, Services, API, Upgrade Report, Notes | Version, Services, API, Notes |

---

## 13. System Tray

### Missing in iced

| QML tray item | Status in iced |
|---|---|
| MCP Server — Restart | ❌ Replaced by single "Restart Services" |
| Interactive Terminal — Restart | ❌ Same |
| Dashboard — Restart | ❌ Same |
| Fallback API — Restart | ❌ Same |
| Open Focused Workspace in VS Code | ❌ Absent |
| Show Pairing QR | ❌ Absent |

### Differences

| Aspect | QML | Iced |
|---|---|---|
| Tooltip content | Dynamic: status + workspace + events count | Static: "Project Memory Supervisor" |
| Balloon notifications | ✅ On `trayNotificationText` change | ❌ Not implemented |
| Menu item count | 9+ items (+ separators) | 4 items (no separators) |
| Icon design | Embedded in tray icon URL (from bridge) | 32 × 32 RGBA hardcoded purple gradient |

---

## 14. Cross-Cutting Differences

### Theming & Appearance

| Aspect | QML | Iced |
|---|---|---|
| Theme system | Qt Material.Dark | Custom hardcoded colour constants |
| Button hover effects | ✅ Material ripple / hover states | ❌ No hover states on most buttons |
| Tooltips | ✅ Throughout (buttons, tray, service rows) | ❌ Not used anywhere |
| Text input multi-line | ✅ TextArea available | ❌ Only single-line `text_input` |
| Strikethrough text | ✅ CSS property | ❌ Not supported by iced text widget |

### Architecture

| Aspect | QML | Iced |
|---|---|---|
| State model | Distributed (each QML component owns its state) | Monolithic `AppState` struct |
| Bridge layer | CxxQt FFI (`SupervisorGuiBridge`, `QrPairingBridge`) | No bridge needed; pure Rust |
| Overlay management | QML `Dialog` + visibility flags | `Overlay` enum in AppState |
| HTTP calls | `XMLHttpRequest` in QML | `reqwest` in async Tasks |
| Config persistence | Bridge methods (`saveSettingsJson`, `saveVscodeSettingsJson`) | Raw TOML editor only (settings panel is a stub) |
| Animations | Qt `Behavior` + `NumberAnimation` (declarative) | Manual tick-based interpolation |

### Missing globally in iced

| Feature | Notes |
|---|---|
| Sessions Dashboard Panel | Full CRUD panel for user sessions — absent entirely |
| Functional Settings Panel | All settings controls are placeholder stubs |
| Upgrade Report section | In About panel — absent entirely |
| Tray balloon notifications | No notification system |
| Per-service tray restart | Only "Restart all" exists |
| Focused workspace tray item | Not in tray menu |
| Virtual Monitor footer button | Minor — links to external monitor URL |
| Tooltips | Not used anywhere in iced |
| Multi-line text input | iced `text_input` is single-line |
| Session stale filtering | Active sessions list includes all returned entries |

### Present in iced but not in QML (improvements)

| Feature | Notes |
|---|---|
| Event Broadcast toggle is interactive | QML was read-only; iced calls backend |
| Sparkline filled area | MCP Proxy sparkline has fill under the line |
| Live dot on Sessions panel | Visual polling status indicator |
| Live dot on Activity panel | Visual polling status indicator |
| Count badge on Sessions panel | `[N]` count badge |
| Count badge on Activity panel | `[N]` count badge |
| Pure-Rust QR generation | No CxxQt/C++ dependency |
| Chat pop-out state on collapsed strip | API key configured dot + pop-in button |

---

## Gap Priority Summary

### P0 — Blocking (settings are non-functional)

| Gap | Impact |
|---|---|
| Settings panel controls are all stubs | Cannot change any configuration from the GUI except via raw TOML editor |
| VS Code settings load/save absent | VS Code extension integration completely non-configurable |

### P1 — Major feature gaps

| Gap | Impact |
|---|---|
| Sessions Dashboard Panel entirely absent | No user session management at all |
| About — upgrade report card absent | No visibility into upgrade outcomes |
| Sprints — no Create/Add Goal actions | Cannot create sprints or add goals from the iced UI |
| Plans — no Register WS / Backup actions | Cannot register workspaces or backup plans |
| Tray — limited menu (4 vs 9+ items) | No per-service restart from tray; no workspace/pairing actions |

### P2 — Functional gaps

| Gap | Impact |
|---|---|
| Plans provider selector is read-only | Cannot switch AI provider from the panel |
| Plans launch button has no feedback | No visual confirmation of launch success/failure |
| Chatbot workspace context missing | Chatbot sends without workspace scoping |
| Chatbot provider not switchable | Stuck on whatever provider was last set |
| Chatbot multi-line input absent | Cannot compose multi-line messages |
| Tray dynamic tooltip absent | Cannot see workspace/event status from tray |
| Tray balloon notifications absent | No desktop alerts |
| Session stale filter absent | Stale sessions may appear in active list |

### P3 — Polish / minor

| Gap | Impact |
|---|---|
| Toggle pill animation absent | Instant vs smooth — cosmetic |
| Panel border colour animation absent | Cosmetic |
| Strikethrough on completed goals | Cosmetic |
| Sprints date range absent | Informational |
| Sprint goal plan badge absent | Informational |
| Cartographer stats detail reduced | Informational |
| Tooltips absent throughout | Discoverability |
| Button hover effects absent | Polish |
| Virtual Monitor footer button absent | Minor feature |
