# Project Memory Dashboard - VS Code Extension

This extension provides the Project Memory sidebar/dashboard experience in VS Code and deployment helpers for agents, instructions, and skills.

## Current Scope (Important)

This extension has been intentionally simplified:

- Dashboard host (webview + tree views)
- Deployment and workspace utility commands
- Diagnostics and supervisor lifecycle helpers

Archived from active runtime:

- Chat participant runtime integration
- Language model tool bridge/orchestration inside the extension
- Legacy watcher-heavy integration paths

For current behavior, treat `src/extension.ts` as the source of truth.

## Features

- Activity bar container: **Project Memory**
- Views:
  - Dashboard (`projectMemory.dashboardView`)
  - Plans (`projectMemory.planExplorer`)
  - Diagnostics (`projectMemory.diagnosticsView`)
- Commands for plan creation, deployment, diagnostics, workspace migration, and supervisor management
- Status indicators for health and deploy actions
- Operations tab cards for Prompt Analyst visibility, Build Gate script awareness, and plan intelligence summaries

## Install (Development)

```bash
cd vscode-extension
npm install
npm run compile
```

Press `F5` in VS Code to launch an Extension Development Host.

## Build & Package

```bash
# Compile extension
npm run compile

# Build embedded dashboard webview assets
npm run build-webview

# Package VSIX
npm run package
```

## Test & Lint

```bash
npm test
npm run lint
```

## Key Commands

Representative commands contributed by the extension:

- `projectMemory.showDashboard`
- `projectMemory.openDashboardPanel`
- `projectMemory.createPlan`
- `projectMemory.viewPrograms`
- `projectMemory.deployAgents`
- `projectMemory.deploySkills`
- `projectMemory.deployInstructions`
- `projectMemory.deployCopilotConfig`
- `projectMemory.deployDefaults`
- `projectMemory.updateDefaults`
- `projectMemory.refreshData`
- `projectMemory.migrateWorkspace`
- `projectMemory.showDiagnostics`
- `project-memory.startSupervisor`
- `projectMemory.showMcpSessions`
- `projectMemory.showMcpInstances`
- `projectMemory.scaleUpMcp`

See `package.json` for the full and authoritative list.

## Settings

High-use settings include:

- `projectMemory.dataRoot`
- `projectMemory.agentsRoot`
- `projectMemory.skillsRoot`
- `projectMemory.instructionsRoot`
- `projectMemory.serverPort`
- `projectMemory.mcpPort`
- `projectMemory.dashboard.enabled`
- `projectMemory.alwaysProvidedNotes`
- `projectMemory.containerMode`
- `projectMemory.notifications.enabled`
- `supervisor.startupMode`
- `supervisor.launcherPath`

Use VS Code Settings UI and search for **Project Memory** or **supervisor**.

## Architecture

Top-level structure:

```text
vscode-extension/
├── src/
│   ├── extension.ts
│   ├── commands/
│   ├── providers/
│   ├── services/
│   ├── supervisor/
│   ├── server/
│   ├── deployer/
│   └── _archive/
├── webview/
└── package.json
```

## Operational Notes

- The extension can run in local or container-oriented connection modes (`projectMemory.containerMode`).
- Dashboard auto-connection is controlled by `projectMemory.dashboard.enabled`.
- Supervisor auto-start behavior is controlled by `supervisor.startupMode`.

## Keeping Docs Accurate

When changing extension behavior, update this README based on:

1. `vscode-extension/package.json` (commands, settings, views)
2. `vscode-extension/src/extension.ts` (actual runtime behavior)