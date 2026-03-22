# Project Memory VS Code Extension - Complete Setup Guide

This guide walks you through setting up the Project Memory Dashboard VS Code extension for managing multi-agent AI workflows with VS Code Copilot.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Architecture Overview](#architecture-overview)
- [Installation Methods](#installation-methods)
  - [Method 1: Install Pre-built VSIX](#method-1-install-pre-built-vsix-recommended)
  - [Method 2: Build from Source](#method-2-build-from-source)
- [MCP Server Setup](#mcp-server-setup)
- [Dashboard Server Setup](#dashboard-server-setup)
- [Copilot Chat Integration](#copilot-chat-integration)
- [Configuration](#configuration)
- [Deploying Agents to Your Workspace](#deploying-agents-to-your-workspace)
- [Workspace Sync Monitoring](#workspace-sync-monitoring)
- [Protected Mandatory Files](#protected-mandatory-files)
- [Frontmatter Metadata Contract](#frontmatter-metadata-contract)
- [Verification & Testing](#verification--testing)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

Before starting, ensure you have:

| Requirement | Version | Notes |
|-------------|---------|-------|
| **Node.js** | v18+ | Required for building and running servers |
| **VS Code** | v1.85+ | Required for extension compatibility |
| **npm** | v9+ | Comes with Node.js |
| **Git** | Any | For cloning the repository |

Optional but recommended:
- **Python 3.10+** with `uvx` - For `mcp-server-git` and `markitdown-mcp`
- **VS Code Copilot** - For full agent workflow integration

---

## Architecture Overview

The Project Memory system consists of three main components:

```
┌─────────────────────────────────────────────────────────────────┐
│                        VS Code                                   │
│  ┌──────────────────┐    ┌──────────────────────────────────┐   │
│  │  VS Code         │    │  Project Memory Extension        │   │
│  │  Copilot Chat    │◄──►│  - Dashboard sidebar view        │   │
│  │  (@AgentName)    │    │  - Agent deployment              │   │
│  └────────┬─────────┘    │  - Plan tracking                 │   │
│           │              └──────────────┬───────────────────┘   │
└───────────┼─────────────────────────────┼───────────────────────┘
            │                             │
            ▼                             ▼
┌───────────────────────┐     ┌───────────────────────────────────┐
│  MCP Server           │     │  Dashboard API Server             │
│  (stdio transport)    │     │  (HTTP :3001)                     │
│  - Plan management    │◄───►│  - REST API                       │
│  - Context storage    │     │  - SSE real-time events           │
│  - Agent validation   │     │  - Workspace data                 │
└───────────────────────┘     └───────────────────────────────────┘
            │
            ▼
┌───────────────────────┐
│  Data Directory       │
│  data/                │
│  ├── workspace_id/    │
│  │   ├── plans/       │
│  │   └── meta.json    │
│  └── events/          │
└───────────────────────┘
```

---

## Installation Methods

### Method 1: Install Pre-built VSIX (Recommended)

The quickest way to get started:

1. **Locate the VSIX file**
   ```
   vscode-extension/project-memory-dashboard-0.2.0.vsix
   ```

2. **Install in VS Code**
   - Open VS Code
   - Press `Ctrl+Shift+X` to open Extensions
   - Click the `...` menu (top-right of Extensions panel)
   - Select **"Install from VSIX..."**
   - Navigate to and select the `.vsix` file

3. **Reload VS Code**
   - Press `Ctrl+Shift+P` → "Developer: Reload Window"

### Method 2: Build from Source

For development or to get the latest changes:

#### Step 1: Clone the Repository

```powershell
git clone https://github.com/DS-codi/Project-Memory-MCP.git
cd Project-Memory-MCP
```

#### Step 2: Build the MCP Server

```powershell
cd server
npm install
npm run build
```

This compiles TypeScript to `server/dist/index.js`.

#### Step 3: Build the Dashboard (Optional)

If you want the full dashboard with real-time updates:

```powershell
cd dashboard
npm install
npm run build
```

#### Step 4: Build the VS Code Extension

```powershell
cd vscode-extension
npm install
npm run compile
```

#### Step 5: Package or Run in Development

**Option A: Package as VSIX**
```powershell
npm install -g @vscode/vsce
cd vscode-extension
vsce package
```
Then install the generated `.vsix` file.

**Option B: Run in Development Mode**
1. Open the `vscode-extension` folder in VS Code
2. Press `F5` to launch Extension Development Host
3. Test the extension in the new VS Code window

---

## MCP Server Setup

The MCP server must be configured in VS Code for Copilot to use Project Memory tools.

### Step 1: Create MCP Configuration

Create or edit `.vscode/mcp.json` in your workspace (or configure globally in VS Code settings):

```json
{
  "servers": {
    "project-memory": {
      "type": "stdio",
      "command": "node",
      "args": ["C:\\path\\to\\Project-Memory-MCP\\server\\dist\\index.js"],
      "env": {
        "MBS_DATA_ROOT": "C:\\path\\to\\Project-Memory-MCP\\data",
        "MBS_AGENTS_ROOT": "C:\\path\\to\\Project-Memory-MCP\\agents"
      }
    }
  }
}
```

### Step 2: Add Companion MCP Servers (Recommended)

For full agent capabilities, add these additional MCP servers:

```json
{
  "servers": {
    "project-memory": {
      "type": "stdio",
      "command": "node",
      "args": ["C:\\path\\to\\Project-Memory-MCP\\server\\dist\\index.js"],
      "env": {
        "MBS_DATA_ROOT": "C:\\path\\to\\Project-Memory-MCP\\data",
        "MBS_AGENTS_ROOT": "C:\\path\\to\\Project-Memory-MCP\\agents"
      }
    },
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "${workspaceFolder}"]
    },
    "git": {
      "command": "uvx",
      "args": ["--native-tls", "mcp-server-git"]
    },
    "markitdown": {
      "command": "uvx",
      "args": ["--native-tls", "markitdown-mcp"]
    }
  }
}
```

### Step 3: Verify MCP Connection

1. Open VS Code Copilot Chat
2. Type: "List available MCP tools"
3. You should see `mcp_project-memor_*` tools listed

---

## Dashboard Server Setup

The dashboard server provides the REST API and real-time events for the extension.

### Start the Dashboard Server

```powershell
cd dashboard
npm run server
```

The server starts on `http://localhost:3001` by default.

### Run Both Frontend and Backend (Development)

```powershell
cd dashboard
npm run dev:all
```

This starts:
- Vite dev server on `http://localhost:5173`
- API server on `http://localhost:3001`

---

## Copilot Chat Integration

The extension provides a `@memory` chat participant that enables conversational access to Project Memory features directly in Copilot Chat.

### Requirements

- VS Code 1.99.0 or higher
- GitHub Copilot Chat extension installed
- MCP server running (bundled, Podman, or external)

### Quick Start

1. **Ensure MCP server is connected** - Check the status bar for "$(plug) MCP"
2. **Open Copilot Chat** - Press `Ctrl+Shift+I`
3. **Use @memory participant**:

```
@memory /status              # Check connection and plan status
@memory /plan list           # List all plans
@memory /plan create <title> # Create a new plan
@memory /context             # Get workspace context
@memory /handoff Executor plan_id  # Hand off to an agent
```

### Available Commands

| Command | Description |
|---------|-------------|
| `/plan` | View, create, or manage plans |
| `/status` | Show MCP connection and plan progress |
| `/context` | Get workspace context and codebase profile |
| `/handoff` | Execute agent handoff |

### Language Model Tools

Copilot can also autonomously use these tools during conversations:

- `memory_getPlanState` - Get current plan state
- `memory_updateStep` - Update step status
- `memory_createPlan` - Create a new plan
- `memory_getWorkspaceContext` - Get workspace info
- `memory_handoff` - Initiate agent handoff
- `memory_addNote` - Add note to plan

### Server Modes

Configure how the MCP server is run via `projectMemory.chat.serverMode`:

- **bundled** (default): Extension spawns the MCP server automatically
- **podman**: Run MCP server in a Podman container
- **external**: Connect to an externally running server

### Troubleshooting Chat Integration

1. **Check status bar** - Look for "MCP" indicator
2. **Reconnect** - Run "Project Memory: Reconnect Chat to MCP Server" command
3. **View logs** - Check "Project Memory MCP Bridge" output channel

For detailed documentation, see [CHAT_INTEGRATION.md](./CHAT_INTEGRATION.md).

---

## Configuration

### Extension Settings

Open VS Code Settings (`Ctrl+,`) and search for "Project Memory":

| Setting | Description | Default |
|---------|-------------|---------|
| `projectMemory.dataRoot` | Path to data directory | Auto-detect from env |
| `projectMemory.agentsRoot` | Path to agent templates | Auto-detect |
| `projectMemory.autoRefresh` | Auto-refresh on file changes | `true` |
| `projectMemory.autoDeployAgents` | Auto-deploy on template save | `false` |
| `projectMemory.apiPort` | Dashboard API port | `3001` |

### Environment Variables

Set these in your shell or system:

```powershell
# PowerShell - Add to your profile
$env:MBS_DATA_ROOT = "C:\path\to\Project-Memory-MCP\data"
$env:MBS_AGENTS_ROOT = "C:\path\to\Project-Memory-MCP\agents"
```

---

## Deploying Agents to Your Workspace

Agents are AI personas with specific roles. Deploy them to enable the multi-agent workflow.

### Deploy via Command Palette

1. Press `Ctrl+Shift+P`
2. Run: **"Project Memory: Deploy All Copilot Config"**
3. Select your workspace
4. Files are copied to `.github/agents/`, `.github/instructions/`, and `.github/prompts/`

### Deploy Specific Components

| Command | Deploys |
|---------|---------|
| `Deploy Agents to Workspace` | Agent files to `.github/agents/` |
| `Deploy Prompts to Workspace` | Prompt templates to `.github/prompts/` |
| `Deploy Instructions to Workspace` | Instructions to `.github/instructions/` |
| `Deploy Default Agents & Instructions` | Core agent files only |

### Deployed File Structure

After deployment, your workspace will have:

```
your-project/
├── .github/
│   ├── agents/
│   │   ├── coordinator.agent.md
│   │   ├── researcher.agent.md
│   │   ├── architect.agent.md
│   │   ├── executor.agent.md
│   │   ├── reviewer.agent.md
│   │   ├── revisionist.agent.md
│   │   ├── tester.agent.md
│   │   └── archivist.agent.md
│   ├── instructions/
│   │   └── *.instructions.md
│   └── prompts/
│       └── *.prompt.md
└── ...
```

### Manual Remediation Commands

The following commands address sync issues reported by the passive watcher:

| Command | When to use |
|---------|-------------|
| `Project Memory: Show Workspace Sync Report` | Display the full formatted sync report in the Output channel |
| `Project Memory: Import Context File to Database` | Explicitly import a single `import_candidate` file (requires user confirmation) |
| `Project Memory: Redeploy Mandatory PM Files from Canonical Source` | Restore `protected_drift` files from their canonical seed content |

All commands are accessible via `Ctrl+Shift+P` → **"Project Memory: ..."**.

---

## Workspace Sync Monitoring

The extension includes a **passive, read-only watcher** that monitors `.github/agents/` and `.github/instructions/` for file changes. On each change or MCP connection event, it calls `memory_workspace(action: check_context_sync)` — a read-only operation that compares local workspace files against the database.

> **The watcher never writes to the database and never auto-deploys or auto-imports files.**

### How It Appears

- **Status bar**: A sync indicator shows the current state for the active workspace.
- **Diagnostics tree view**: The Project Memory sidebar shows a sync report tree with per-file statuses.

### Sync Report Statuses

| Status | Meaning |
|--------|--------|
| `in_sync` | File matches the database record (and canonical seed for PM-controlled files) |
| `ignored_local` | No frontmatter opt-in; the watcher ignores this file |
| `local_only` | Opt-in file exists locally but has no database record; not import-eligible |
| `db_only` | Database record exists but the workspace copy is missing |
| `content_mismatch` | Local and database versions differ (non-PM-controlled file) |
| `protected_drift` | A mandatory PM-controlled file is missing, out of sync with its DB record, or differs from the canonical seed |
| `import_candidate` | File has `pm_import_mode: manual` and has no database record — eligible for explicit import |

For a full guide, see [docs/workspace-config-sync.md](workspace-config-sync.md).

---

## Protected Mandatory Files

Certain files are designated as **PM-controlled mandatory**. They are seeded from `database-seed-resources/` and must not be edited in workspace copies. If a mandatory file is missing or differs from the canonical seed, it appears as `protected_drift` in the sync report.

**Mandatory agents** (`.github/agents/`):
- `hub.agent.md`
- `prompt-analyst.agent.md`
- `shell.agent.md`

**Mandatory instructions** (`.github/instructions/`):
- `mcp-usage.instructions.md`
- `hub.instructions.md`
- `prompt-analyst.instructions.md`
- `subagent-recovery.instructions.md`

To fix a `protected_drift` entry, use **"Project Memory: Redeploy Mandatory PM Files from Canonical Source"** from the Command Palette. This restores the file to its canonical seed content.

> Do not edit these files locally — local changes will be overwritten when mandatory files are redeployed from the canonical source.

---

## Frontmatter Metadata Contract

Agent (`.agent.md`), instruction (`.instructions.md`), and skill (`SKILL.md`) files can include YAML frontmatter fields to control how the sync watcher treats them.

### Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `pm_file_kind` | `agent \| instruction \| skill` | Derived from file extension | Explicitly declares the file type |
| `pm_sync_managed` | `true \| false` | `false` | Opts the file into sync checks; unmanaged files show as `ignored_local` |
| `pm_controlled` | `true \| false` | `false` | Marks as PM-controlled; workspace copy is report-only, not importable |
| `pm_import_mode` | `never \| manual` | `never` | Set to `manual` to allow explicit import of unregistered files |
| `pm_canonical_source` | `none \| database_seed_resources` | `none` | Required for PM-controlled files; names the authoritative seed source |
| `pm_canonical_path` | string | — | Path relative to `database-seed-resources/`; required when `pm_controlled: true` |
| `pm_required_workspace_copy` | `true \| false` | `false` | Marks bootstrap files that must exist on disk in the workspace |

### Example: Custom File Opted into Sync

```yaml
---
pm_file_kind: instruction
pm_sync_managed: true
pm_import_mode: manual
---
```

With this frontmatter the file appears in the sync report and shows as `import_candidate` if it has no database record, allowing import via **"Project Memory: Import Context File to Database"**.

For full details, see [docs/workspace-config-sync.md](workspace-config-sync.md).

---

## Verification & Testing

### 1. Check Extension is Active

- Look for "Project Memory" icon in the Activity Bar (left sidebar)
- Click it to open the Dashboard view

### 2. Test MCP Server

In Copilot Chat, try:
```
@Coordinator Create a new plan for adding a login feature
```

### 3. Test Dashboard API

```powershell
# List workspaces
Invoke-RestMethod http://localhost:3001/api/workspaces

# Check health
Invoke-RestMethod http://localhost:3001/api/health
```

### 4. Verify Agent Deployment

Run: `Project Memory: Show Copilot Status`

This shows which workspaces have agents deployed.

---

## Troubleshooting

### Extension Not Appearing

1. Check Output panel → "Project Memory" channel for errors
2. Ensure VS Code version is 1.85+
3. Try: `Developer: Reload Window`

### MCP Tools Not Available

1. Check `.vscode/mcp.json` syntax
2. Verify server path exists: `server/dist/index.js`
3. Check Output → "MCP" for connection errors
4. Rebuild: `cd server && npm run build`

### Dashboard Not Loading

1. Ensure dashboard server is running: `npm run server`
2. Check port 3001 is not in use
3. Verify `projectMemory.apiPort` setting matches

### "Cannot find module" Errors

```powershell
# Rebuild everything
cd server && npm install && npm run build
cd ../dashboard && npm install && npm run build
cd ../vscode-extension && npm install && npm run compile
```

### Agents Not Working in Copilot

1. Deploy agents: `Project Memory: Deploy Agents to Workspace`
2. Check `.github/agents/` folder exists
3. Ensure Copilot extension is active
4. Restart Copilot: `GitHub Copilot: Restart`

---

## Quick Reference: Key Commands

| Command | Shortcut | Description |
|---------|----------|-------------|
| Show Dashboard | - | Open Project Memory sidebar |
| Open Full Dashboard (PMD Tab) | - | Open dashboard in editor tab |
| Create New Plan | - | Start a new plan in workspace |
| Deploy All Copilot Config | - | Deploy agents, prompts, instructions |
| Refresh Dashboard | - | Force refresh all data |
| Show Server Logs | - | View MCP server output |
| Toggle Server | - | Start/stop dashboard server |

Access all commands via `Ctrl+Shift+P` → "Project Memory: ..."

---

## Next Steps

1. **Read the Agent Docs**: See `agents/*.agent.md` for each agent's capabilities
2. **Try a Workflow**: Ask Coordinator to create a plan, then watch agents work
3. **Customize Agents**: Edit templates in `agents/` and redeploy
4. **Monitor Progress**: Use the Dashboard sidebar to track plan status

For more details, see:
- [Main README](../README.md) - Full project documentation
- [Dashboard User Guide](../dashboard/docs/USER_GUIDE.md) - Dashboard features
- [API Specification](../dashboard/docs/api-spec.yaml) - REST API reference
