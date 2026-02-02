# Copilot Chat Integration

This document describes the Copilot Chat integration for Project Memory, enabling conversational access to plans, context, and agent workflows through the `@memory` chat participant and Language Model Tools.

## Overview

The chat integration provides two ways to interact with Project Memory:

1. **Chat Participant (`@memory`)** - Direct conversational interface with slash commands
2. **Language Model Tools** - Tools that Copilot can autonomously invoke during conversations

## Requirements

- VS Code version 1.99.0 or higher
- GitHub Copilot Chat extension installed
- Project Memory MCP server (bundled, Podman, or external)

## Quick Start

1. Open a workspace in VS Code
2. The extension will automatically attempt to connect to the MCP server
3. Open Copilot Chat and type `@memory` to start using the participant
4. Use slash commands like `/plan`, `/status`, `/context`, or `/handoff`

## Chat Participant Commands

### `/plan` - Manage Plans

View, create, or manage project plans.

```
@memory /plan list          # List all plans in workspace
@memory /plan create <title> # Create a new plan
@memory /plan show <plan-id> # View plan details
```

### `/status` - Check Status

Show current plan progress and MCP connection state.

```
@memory /status
```

### `/context` - Get Workspace Context

Retrieve workspace information and codebase profile.

```
@memory /context
```

### `/handoff` - Execute Agent Handoff

Transfer work to another agent.

```
@memory /handoff <agent-type> <plan-id> [summary]

# Examples:
@memory /handoff Executor plan_abc123 Ready for implementation
@memory /handoff Reviewer plan_abc123 Code complete, needs review
```

**Available Agents:**
- `Coordinator` - Orchestrates the workflow
- `Researcher` - Gathers external information
- `Architect` - Creates implementation plans
- `Executor` - Implements the plan
- `Revisionist` - Handles plan pivots
- `Reviewer` - Validates completed work
- `Tester` - Writes and runs tests
- `Archivist` - Finalizes and archives

## Language Model Tools (Consolidated v2.0)

Copilot can autonomously use these consolidated tools during conversations:

### `memory_plan`
Manage plans - list, get, create, or archive.

**Parameters:**
- `action` (required): One of `list`, `get`, `create`, `archive`
- `planId`: The plan ID (required for `get`, `archive`)
- `title`: Title of the plan (for `create`)
- `description`: Detailed description (for `create`)
- `category`: Type of plan - `feature`, `bug`, `change`, `analysis`, `debug`, `refactor`, `documentation` (for `create`)

### `memory_steps`
Manage plan steps - update individual or batch update multiple.

**Parameters:**
- `action` (required): One of `update`, `batch_update`, `add`
- `planId` (required): The plan ID
- `stepIndex`: Index of step to update (for `update`)
- `status`: New status - `pending`, `active`, `done`, `blocked` (for `update`)
- `updates`: Array of `{stepIndex, status}` (for `batch_update`)
- `steps`: Array of new steps (for `add`)

### `memory_context`
Manage context - add notes, get briefing, perform handoffs, or get workspace info.

**Parameters:**
- `action` (required): One of `add_note`, `briefing`, `handoff`, `workspace`
- `planId`: The plan ID (for `add_note`, `briefing`, `handoff`)
- `note`: Note content (for `add_note`)
- `noteType`: Note type - `info`, `warning`, `instruction` (for `add_note`)
- `targetAgent`: Target agent type (for `handoff`)
- `summary`: Summary of work done (for `handoff`)

## Configuration

### Server Mode

Configure how the MCP server is run:

```json
{
  "projectMemory.chat.serverMode": "bundled"  // Options: bundled, podman, external
}
```

- **bundled** (default): Spawns the bundled MCP server automatically
- **podman**: Runs MCP server in a Podman container
- **external**: Connects to an externally running server

### Podman Mode Settings

```json
{
  "projectMemory.chat.podmanImage": "project-memory-mcp:latest"
}
```

### External Mode Settings

```json
{
  "projectMemory.chat.externalServerPath": "/path/to/mcp-server"
}
```

### Auto-Connect

```json
{
  "projectMemory.chat.autoConnect": true  // Connect on extension activation
}
```

## Status Bar

The extension shows MCP connection status in the status bar:

- `$(plug) MCP` - Connected
- `$(debug-disconnect) MCP` - Disconnected

Click the status bar item to reconnect.

## Commands

| Command | Description |
|---------|-------------|
| `Project Memory: Reconnect Chat to MCP Server` | Manually reconnect to the MCP server |

## Troubleshooting

### Connection Issues

1. Check the status bar for connection state
2. Use "Project Memory: Reconnect Chat to MCP Server" command
3. Check the "Project Memory MCP Bridge" output channel for logs

### Server Not Starting

1. Verify the server mode configuration matches your setup
2. For bundled mode, ensure the server files are present
3. For Podman mode, ensure the container image exists
4. For external mode, verify the server path is correct

### Chat Participant Not Appearing

1. Ensure VS Code version is 1.99.0 or higher
2. Verify GitHub Copilot Chat extension is installed
3. Reload VS Code window

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  VS Code Extension                                                   │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  Chat Participant (@memory)                                     │ │
│  │  ├─ /plan    → View/create/manage plans                        │ │
│  │  ├─ /context → Get workspace context                           │ │
│  │  ├─ /handoff → Execute agent handoff                           │ │
│  │  └─ /status  → Show plan progress                              │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                    │                                 │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  LM Tools Provider                                              │ │
│  │  ├─ memory_getPlanState      ├─ memory_createPlan              │ │
│  │  ├─ memory_updateStep        ├─ memory_handoff                 │ │
│  │  └─ memory_getWorkspaceContext └─ memory_addNote               │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                    │                                 │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  MCP Bridge (stdio JSON-RPC)                                    │ │
│  │  ├─ Bundled server spawn (default)                             │ │
│  │  ├─ Podman container mode                                      │ │
│  │  └─ External server connection                                 │ │
│  └────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────┬────────────────────────────────┘
                                     │ stdio
                                     ▼
                        ┌─────────────────────────┐
                        │  MCP Server             │
                        │  ├─ plan tools          │
                        │  ├─ handoff tools       │
                        │  ├─ context tools       │
                        │  └─ workspace tools     │
                        └─────────────────────────┘
```

## API Reference

### McpBridge

The MCP Bridge manages the connection to the MCP server.

```typescript
interface McpBridge {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  callTool<T>(name: string, args: Record<string, unknown>): Promise<T>;
  listTools(): Promise<ToolDefinition[]>;
  reconnect(): Promise<void>;
  onConnectionChange: Event<boolean>;
}
```

### ChatParticipant

Provides the `@memory` chat participant with slash commands.

### ToolProvider

Registers Language Model Tools that Copilot can invoke autonomously.

## Related Documentation

- [VS Code Chat API](https://code.visualstudio.com/api/extension-guides/chat)
- [Language Model Tools API](https://code.visualstudio.com/api/extension-guides/language-model-tool)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [Project Memory MCP Server](../server/README.md)
