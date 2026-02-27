---
applyTo: "**/*"
---

# Build Scripts Reference

This workspace has registered build scripts via the Project Memory MCP system. **Always check for existing build scripts before running ad-hoc commands.**

## Retrieving Build Scripts

```
memory_plan(action: "list_build_scripts", workspace_id: "<workspace_id>")
```

This returns all workspace-level and plan-level scripts merged together.

## Running a Build Script

1. **Resolve** the script via MCP:
   ```
   memory_plan(action: "run_build_script", workspace_id: "<id>", script_id: "<script_id>")
   ```
2. **Execute** the returned `command` in the terminal using the returned `directory_path` as the working directory.

> `run_build_script` does NOT execute the command — it resolves paths and returns them. You must run the command yourself.

## Registering New Build Scripts

When you discover a repeatable build/test/deploy step, register it:

```
memory_plan(action: "add_build_script",
  workspace_id: "<id>",
  script_name: "Build Server",
  script_command: "npm run build",
  script_directory: "./server",
  script_description: "Compile TypeScript server code"
)
```

Optional parameters:
- `plan_id` — scope the script to a specific plan (omit for workspace-level)
- `script_mcp_handle` — programmatic identifier for agent automation

## This Workspace's Build Commands

These are the standard build/test commands. Register them as build scripts when starting a new plan.

### Server

| Task | Command | Directory |
|------|---------|-----------|
| Build | `npm run build` | `./server` |
| Test | `npx vitest run` | `./server` |
| Test (watch) | `npx vitest` | `./server` |

### Dashboard

| Task | Command | Directory |
|------|---------|-----------|
| Dev server | `npx vite` | `./dashboard` |
| Build | `npx vite build` | `./dashboard` |
| Test | `npx vitest run` | `./dashboard` |
| Test (watch) | `npx vitest` | `./dashboard` |

### VS Code Extension

| Task | Command | Directory |
|------|---------|-----------|
| Install deps | `npm install` | `./vscode-extension` |
| Compile | `npm run compile` | `./vscode-extension` |
| Package | `npx @vscode/vsce package` | `./vscode-extension` |
| Install | `code --install-extension *.vsix` | `./vscode-extension` |

### Container

| Task | Command | Directory |
|------|---------|-----------|
| Build image | `podman build -t project-memory-mcp-project-memory:latest .` | `.` |
| Build (no cache) | `podman build --no-cache -t project-memory-mcp-project-memory:latest .` | `.` |
| Run container | `.\run-container.ps1 run` | `.` |
| Stop container | `.\run-container.ps1 stop` | `.` |
| Container logs | `.\run-container.ps1 logs` | `.` |
| Container status | `.\run-container.ps1 status` | `.` |

### Full Build + Install

| Task | Command | Directory |
|------|---------|-----------|
| Build all + install extension | `.\build-and-install.ps1` | `.` |

## Script Scope: Workspace vs Plan

| Scope | When to use | Storage |
|-------|-------------|---------|
| **Workspace** | Shared commands (build, test, deploy) that apply to all plans | `workspace.json` |
| **Plan** | One-off scripts for a specific task (e.g., migration, data fix) | `state.json` under plan |

## Agent Responsibilities

| Agent | Build Script Usage |
|-------|--------------------|
| **Reviewer** | Primary consumer — lists, creates, resolves, and runs scripts during build-check; reports pass/fail |
| **Executor** | May create scripts when implementing build-related steps |
| **Tester** | Lists and runs test scripts |
| **Archivist** | May clean up plan-level scripts during archival |

## Workflow: Reviewer Agent (Build-Check Mode)

1. `memory_plan(action: "list_build_scripts")` — check existing scripts
2. If none exist for the task, `memory_plan(action: "add_build_script")` — register one
3. `memory_plan(action: "run_build_script")` — resolve the script
4. Run the resolved command in terminal
5. Report result via `memory_agent(action: "handoff")` — recommend Reviewer on success, Revisionist on failure

## Deleting Scripts

```
memory_plan(action: "delete_build_script", workspace_id: "<id>", script_id: "<script_id>")
```

Delete plan-level scripts when a plan is archived. Keep workspace-level scripts persistent.
