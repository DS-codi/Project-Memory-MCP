# Project Memory Dashboard - VS Code Extension

A Visual Studio Code extension that provides a dashboard for monitoring and managing the Project Memory MCP server, with deep integration for VS Code Copilot.

## Features

### Dashboard & Monitoring
- **Dashboard View**: Visual overview of workspaces, plans, and agent activity
- **Plan Tracking**: Monitor plan progress, steps, and handoffs
- **Live Updates**: Real-time activity feed from MCP events
- **Quick Actions**: Create plans, deploy agents, and navigate to code

### VS Code Copilot Integration
- **Agent Deployment**: Deploy agent instruction files to `.github/agents/`
- **Prompt Management**: Deploy and manage prompt templates (`.prompt.md` files)
- **Instruction Files**: Deploy global instruction files to `.github/instructions/`
- **Auto-Deploy**: Automatically deploy changes when agent files are saved
- **Copilot Status**: View deployment status for each workspace

### Copilot Chat Integration (NEW)
- **@memory Chat Participant**: Conversational access to plans and workflows
- **Slash Commands**: `/plan`, `/status`, `/context`, `/handoff`
- **Language Model Tools**: Tools Copilot can use autonomously during conversations
- **MCP Bridge**: Connects chat to the MCP server via stdio JSON-RPC

## Installation

### From VSIX

1. Download the `.vsix` file from releases
2. In VS Code, open Extensions view (Ctrl+Shift+X)
3. Click the `...` menu and select "Install from VSIX..."
4. Select the downloaded file

### From Source

```bash
cd vscode-extension
npm install
npm run compile
```

Then press F5 in VS Code to launch the extension development host.

## Configuration

| Setting | Description | Default |
|---------|-------------|---------|
| `projectMemory.dataRoot` | Path to MBS_DATA_ROOT directory | Auto-detect |
| `projectMemory.agentsRoot` | Path to agent templates directory | Auto-detect |
| `projectMemory.promptsRoot` | Path to prompt templates directory | Auto-detect |
| `projectMemory.instructionsRoot` | Path to instruction files directory | Auto-detect |
| `projectMemory.autoRefresh` | Enable auto-refresh on file changes | `true` |
| `projectMemory.autoDeployAgents` | Auto-deploy agents on template save | `false` |
| `projectMemory.apiPort` | Dashboard API server port | `3001` |
| `projectMemory.chat.serverMode` | MCP server mode: `bundled`, `podman`, `external` | `bundled` |
| `projectMemory.chat.autoConnect` | Auto-connect to MCP server on activation | `true` |
| `projectMemory.chat.podmanImage` | Podman image for MCP server | `project-memory-mcp:latest` |
| `projectMemory.chat.externalServerPath` | Path to external MCP server | - |

## Commands

### General
- **Project Memory: Show Dashboard** - Open the dashboard sidebar
- **Project Memory: Refresh Dashboard** - Force refresh dashboard data

### Plan Management
- **Project Memory: Create New Plan** - Create a new plan in the current workspace

### Copilot Integration
- **Project Memory: Deploy Agents** - Deploy agent templates to workspaces
- **Project Memory: Deploy Prompts** - Deploy prompt templates to workspaces  
- **Project Memory: Deploy Instructions** - Deploy instruction files to workspaces
- **Project Memory: Deploy All Copilot Config** - Deploy agents, prompts, and instructions
- **Project Memory: Open Agent File** - Open a specific agent for editing
- **Project Memory: Open Prompt File** - Open a specific prompt for editing
- **Project Memory: Show Copilot Status** - View deployment status for all workspaces

### Chat Integration
- **Project Memory: Reconnect Chat to MCP Server** - Reconnect to MCP server

## @memory Chat Participant

The extension provides a `@memory` chat participant for Copilot Chat:

```
@memory /plan list          # List all plans
@memory /plan create <title> # Create a new plan
@memory /status             # Check plan progress
@memory /context            # Get workspace context
@memory /handoff Executor plan_id  # Hand off to an agent
```

### Language Model Tools

Copilot can autonomously use these tools during conversations:

| Tool | Description |
|------|-------------|
| `memory_getPlanState` | Get current plan state |
| `memory_updateStep` | Update step status |
| `memory_createPlan` | Create a new plan |
| `memory_getWorkspaceContext` | Get workspace info |
| `memory_handoff` | Initiate agent handoff |
| `memory_addNote` | Add note to plan |

See [CHAT_INTEGRATION.md](../docs/CHAT_INTEGRATION.md) for detailed documentation.

## VS Code Copilot Workflow

### Hub-and-Spoke Pattern

The extension enables a hub-and-spoke AI workflow:

```
                    Coordinator
                        │
        ┌───────────────┼───────────────┐
        │               │               │
   Researcher      Architect        Executor
        │               │               │
        └───────────────┴───────────────┘
                        │
                    Reviewer
                        │
                    Archivist
```

### Using with Copilot Chat

1. **Deploy agents** to your workspace using the command palette
2. **Invoke agents** in chat using `@AgentName` syntax
3. **Use prompts** by typing `#prompt-name` in chat
4. **Track progress** via the dashboard sidebar

## Development

### Structure

```
vscode-extension/
├── src/
│   ├── extension.ts          # Extension entry point
│   ├── providers/
│   │   └── DashboardViewProvider.ts  # Webview provider
│   ├── watchers/
│   │   ├── AgentWatcher.ts   # Agent file watcher
│   │   └── CopilotFileWatcher.ts  # Prompts/instructions watcher
│   └── ui/
│       └── StatusBarManager.ts  # Status bar integration
├── webview/                   # React dashboard (bundled)
├── resources/                 # Icons and assets
└── package.json              # Extension manifest
```

### Building the Webview

The webview contains a bundled version of the React dashboard:

```bash
cd webview
npm install
npm run build
```

### Publishing

```bash
npm run package  # Creates .vsix file
```

## Message Protocol

The extension and webview communicate via `postMessage`:

### Webview → Extension

- `openFile`: Open a file in the editor
- `revealInExplorer`: Show file in Explorer
- `showNotification`: Display VS Code notification
- `getConfig`: Request configuration

### Extension → Webview

- `init`: Initial configuration
- `config`: Configuration response
- `refresh`: Trigger data refresh
- `createPlan`: Create plan request
- `deployAgents`: Deploy agents request
