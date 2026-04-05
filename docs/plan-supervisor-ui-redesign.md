# Plan: Supervisor UI Layout Redesign — QML then Iced

**Priority:** High
**Workspace:** project-memory-mcp-40f6678f5a9b

## Goals
- Components tab: 2×2 service card grid (MCP Server, Dashboard, Interactive Terminal, Fallback API) with no separate section labels
- Proxy Sessions and Active Sessions combined into a single tabbed widget below the grid
- My Sessions tab: Pinned Plans, Saved Commands, Bookmarked Directories stacked vertically — each is a pure user-bookmark panel with Add/Delete/Launch(Open) buttons and local persistence via QML Settings
- Iced app receives identical layout changes after QML is complete

## Success Criteria
- `supervisor/qml/main.qml` Components tab shows a clean 2×2 grid with no section label noise
- Proxy Sessions and Active Sessions share a TabBar — no side-by-side layout
- `MySessionsPanel.qml` contains zero XHR/polling code; all data is user-managed and persisted via `Qt.labs.settings`
- Iced sessions panel mirrors the bookmark panel design with file-based persistence

## Steps

### Phase: QML — Components Tab
1. Remove `MCP SERVERS` and `SERVICES` section labels from `main.qml` Components tab
2. Replace the two separate GridLayouts with a single 2-column GridLayout: MCP Server (top-left), Dashboard (top-right), Interactive Terminal (bottom-left), Fallback API (bottom-right)
3. Replace side-by-side Active Sessions / Proxy Sessions row with a `TabBar`+`StackLayout` tabbed widget ("Proxy Sessions" tab 0, "Active Sessions" tab 1)

### Phase: QML — My Sessions Tab
4. Remove all XHR polling timers, ListModels, and MCP fetch functions from `MySessionsPanel.qml`
5. Implement **Pinned Plans** panel: vertical list of user-added plan name/ID entries with Add (inline input) and per-row Delete + Launch buttons; persist via `Qt.labs.settings`
6. Implement **Saved Commands** panel: vertical list of user-added shell command strings with Add (inline input) and per-row Delete + Copy button; persist via `Qt.labs.settings`
7. Implement **Bookmarked Directories** panel: vertical list of user-added directory paths with Add (inline input) and per-row Delete + Open-in-Explorer button; persist via `Qt.labs.settings`

### Phase: Iced — Components Tab
8. Update Iced components panel to a 2-column grid matching the QML redesign (MCP Server, Dashboard, Interactive Terminal, Fallback API)
9. Replace Iced side-by-side sessions display with a tab selector toggling between Proxy Sessions and Active Sessions views

### Phase: Iced — My Sessions Tab
10. Rewrite Iced sessions panel: three vertically-stacked bookmark panels (Pinned Plans, Saved Commands, Bookmarked Directories) with Add/Delete/action buttons
11. Implement file-based persistence for Iced bookmark panels (JSON or TOML sidecar, no MCP calls)
