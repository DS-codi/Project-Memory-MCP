# Memory Observer Dashboard - User Guide

> A comprehensive guide to using the Memory Observer Dashboard for monitoring and managing Project Memory MCP workflows.

---

## Table of Contents

1. [Overview](#overview)
2. [Installation](#installation)
3. [Getting Started](#getting-started)
4. [Dashboard Features](#dashboard-features)
   - [Workspaces](#workspaces)
   - [Plans](#plans)
   - [Agents](#agents)
   - [Activity Feed](#activity-feed)
   - [Metrics](#metrics)
5. [VS Code Extension](#vs-code-extension)
6. [Keyboard Shortcuts](#keyboard-shortcuts)
7. [Configuration](#configuration)
8. [Troubleshooting](#troubleshooting)

---

## Overview

The Memory Observer Dashboard provides a visual interface for the Project Memory MCP Server, allowing you to:

- **Monitor** active plans and agent workflows in real-time
- **Track** handoffs between agents and step completion progress
- **Manage** agent templates and deployments across workspaces
- **Analyze** performance metrics and workflow statistics
- **Create** new plans and configure agent behaviors

![Dashboard Overview](./screenshots/dashboard-overview.png)

---

## Installation

### Prerequisites

- Node.js 18.x or higher
- npm 9.x or higher
- VS Code 1.85 or higher (for extension)

### Installing the Dashboard

```bash
# Clone the repository
git clone https://github.com/your-org/project-memory-mcp.git
cd project-memory-mcp/dashboard

# Install dependencies
npm install

# Start the development server
npm run dev:all
```

### Installing the VS Code Extension

1. Open VS Code
2. Navigate to the Extensions view (`Ctrl+Shift+X`)
3. Search for "Project Memory Dashboard"
4. Click **Install**

Or install from VSIX:

```bash
cd vscode-extension
npm run package
# Then install the .vsix file in VS Code
```

---

## Getting Started

### First Launch

1. Start the dashboard server:
   ```bash
   cd dashboard
   npm run dev:all
   ```

2. Open your browser to `http://localhost:5173`

3. The dashboard will automatically detect workspaces in your data directory

![First Launch](./screenshots/first-launch.png)

### Registering a Workspace

If no workspaces appear, register one using the MCP server:

```typescript
// Use the register_workspace tool
mcp_project-memor_register_workspace({
  workspace_path: "/path/to/your/project"
})
```

---

## Dashboard Features

### Workspaces

The home page displays all registered workspaces with health indicators.

![Workspaces List](./screenshots/workspaces-list.png)

**Health Indicators:**
- 🟢 **Active** - Recent activity on an active plan
- 🟡 **Stale** - No activity in 24+ hours
- 🔴 **Blocked** - A step is marked as blocked
- ⚪ **Idle** - No active plans

**Actions:**
- Click a workspace to view its plans
- See plan counts and last activity time

---

### Plans

The Plans page shows all plans across workspaces with filtering options.

![Plans List](./screenshots/plans-list.png)

**Features:**
- **Filter by status**: Active, Completed, Paused, Archived
- **Filter by category**: Feature, Bug, Change, Analysis, etc.
- **Filter by priority**: Critical, High, Medium, Low
- **Search**: Find plans by title or description

**Plan Detail View:**

![Plan Detail](./screenshots/plan-detail.png)

The plan detail page includes:
- **Overview**: Title, description, status, category, priority
- **Steps**: Kanban-style step tracking with status indicators
- **Timeline**: Visual handoff history between agents
- **Agent Sessions**: Detailed logs of each agent's work
- **Audit Log**: Full audit trail of all changes
- **Research Notes**: Markdown files from research phase

**Exporting Plans:**

Use the Export button to:
- 📄 **Download Markdown** - Full report with Mermaid diagrams
- 📋 **Copy JSON** - Raw plan data for integrations

---

### Agents

The Agents page manages agent templates and deployments.

![Agents List](./screenshots/agents-list.png)

**Agent Types:**
| Agent | Icon | Role |
|-------|------|------|
| Coordinator | 🎯 | Analyzes requests, creates plans |
| Researcher | 🔬 | Gathers information and context |
| Architect | 📐 | Designs solutions and architecture |
| Executor | ⚙️ | Implements code changes |
| Reviewer | 🔍 | Reviews code quality |
| Tester | 🧪 | Writes and runs tests |
| Revisionist | 🔄 | Handles failures and adjustments |
| Archivist | 📦 | Archives completed plans |

**Sync Status Badges:**
- ✅ **Synced** - Deployed copy matches template
- ⚠️ **Outdated** - Template updated, needs sync
- 🔧 **Customized** - Deployed copy has local modifications
- ❌ **Missing** - Not deployed to this workspace

**Agent Detail View:**

![Agent Detail](./screenshots/agent-detail.png)

From the detail view you can:
- Edit the agent template markdown
- View deployment status across workspaces
- Deploy to selected workspaces
- Sync outdated copies with the template
- Pull customizations back to template

---

### Activity Feed

The Activity page shows real-time events from the MCP server.

![Activity Feed](./screenshots/activity-feed.png)

**Event Types:**
- `tool:invoked` - Any MCP tool call
- `plan:created` - New plan created
- `step:updated` - Step status changed
- `handoff` - Agent handoff occurred
- `agent:completed` - Agent session finished

**Features:**
- Real-time SSE streaming
- Connection status indicator
- Event filtering by type
- Event history (last 100 events)

---

### Metrics

The Metrics page displays performance analytics.

![Metrics Dashboard](./screenshots/metrics-dashboard.png)

**Available Metrics:**
- **Plan Statistics**: Total, active, completed, archived
- **Step Completion**: Overall progress across all plans
- **Agent Performance**: Sessions and handoffs per agent
- **Category Breakdown**: Plans by category (feature, bug, etc.)
- **Priority Distribution**: Plans by priority level
- **Handoff Transitions**: Agent-to-agent handoff patterns

**Auto-Refresh:**
Metrics automatically refresh every 60 seconds.

---

## VS Code Extension

The extension integrates the dashboard directly into VS Code.

### Opening the Dashboard

1. Click the Project Memory icon in the Activity Bar
2. Or run `Project Memory: Show Dashboard` from Command Palette

![VS Code Sidebar](./screenshots/vscode-sidebar.png)

### Commands

| Command | Description |
|---------|-------------|
| `Project Memory: Show Dashboard` | Open the dashboard panel |
| `Project Memory: Create New Plan` | Start a new plan |
| `Project Memory: Deploy Agents` | Deploy agents to workspace |
| `Project Memory: Refresh Dashboard` | Force data refresh |

### Context Menu Actions

**Right-click on a file in Explorer:**
- **Add to Plan** - Add file as a step in the active plan

**Right-click with text selected:**
- **Add to Plan** - Add selected code as a step with context

![Context Menu](./screenshots/context-menu.png)

### Agent Hot-Reload

When you save an `*.agent.md` file:
- If auto-deploy is enabled, agents sync automatically
- Otherwise, you'll see a notification to deploy

### Status Bar

The status bar shows the current active plan and agent.

![Status Bar](./screenshots/status-bar.png)

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+K` / `Cmd+K` | Open global search |
| `Ctrl+/` / `Cmd+/` | Toggle keyboard shortcuts help |
| `J` | Navigate to next item in list |
| `K` | Navigate to previous item in list |
| `Enter` | Open selected item |
| `Esc` | Close modal or search |
| `?` | Show keyboard shortcuts |

---

## Configuration

### Dashboard Server

Configure via environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `MBS_DATA_ROOT` | Path to data storage | `./data` |
| `MBS_AGENTS_ROOT` | Path to agent templates | `./agents` |
| `PORT` | API server port | `3001` |
| `WS_PORT` | WebSocket port | `3002` |

### VS Code Extension Settings

Access via `Settings > Extensions > Project Memory`:

| Setting | Description | Default |
|---------|-------------|---------|
| `projectMemory.dataRoot` | Data directory path | Auto-detect |
| `projectMemory.agentsRoot` | Agents directory path | Auto-detect |
| `projectMemory.autoRefresh` | Enable auto-refresh | `true` |
| `projectMemory.autoDeployAgents` | Auto-deploy on save | `false` |
| `projectMemory.apiPort` | Dashboard API port | `3001` |

---

## Troubleshooting

### Dashboard won't load

1. Check that the API server is running:
   ```bash
   curl http://localhost:3001/api/workspaces
   ```

2. Verify `MBS_DATA_ROOT` points to valid data:
   ```bash
   ls $MBS_DATA_ROOT
   ```

### No workspaces showing

- Ensure at least one workspace is registered via MCP tools
- Check the data directory has proper permissions

### Extension not activating

1. Check VS Code version (requires 1.85+)
2. Reload VS Code (`Developer: Reload Window`)
3. Check Output panel for errors (`Project Memory Dashboard`)

### Events not streaming

- Verify the MCP server is running and emitting events
- Check browser console for SSE connection errors
- Ensure no firewall blocking WebSocket connections

### Agent sync failing

- Check file permissions on agents directory
- Verify agent files are valid markdown
- Review the error message in the notification

---

## Getting Help

- **Documentation**: [Project Memory Docs](https://docs.project-memory.dev)
- **Issues**: [GitHub Issues](https://github.com/your-org/project-memory-mcp/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-org/project-memory-mcp/discussions)

---

*Last updated: January 2026*
