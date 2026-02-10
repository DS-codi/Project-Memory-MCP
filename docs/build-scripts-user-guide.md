# Build Scripts - Dashboard User Guide

## Overview

Build scripts let you define reusable shell commands for building, testing, and deploying your project. They can be managed through the dashboard UI or via MCP tool calls from agents.

## Accessing Build Scripts

1. Open the dashboard (default: `http://localhost:3001`)
2. Navigate to a workspace
3. Click on a plan to open the plan detail page
4. Select the **Build Scripts** tab

## Managing Build Scripts

### Adding a Build Script

1. In the Build Scripts tab, find the **Add Build Script** form
2. Fill in:
   - **Name** — A descriptive name (e.g., "Build Server", "Run Tests")
   - **Command** — The shell command to execute (e.g., `npm run build`)
   - **Directory** — Working directory relative to workspace root (e.g., `./server`)
   - **Description** — Optional explanation of what the script does
   - **MCP Handle** — Optional identifier for programmatic execution
3. Click **Add** to save

The script will appear immediately in the table below (optimistic update).

### Viewing Build Scripts

The Build Scripts table shows all scripts for the current plan, including:

| Column | Description |
|--------|-------------|
| Name | Script identifier |
| Command | Shell command to run |
| Directory | Working directory |
| Created | When the script was added |
| Actions | Run and Delete buttons |

### Running a Build Script

1. Click the **Run** button (play icon) next to a script
2. The script is resolved by the MCP server, returning the full command and absolute directory path
3. The output is displayed in a collapsible panel below the table
4. Success/failure is indicated in the output display

> **Note:** In the dashboard context, "running" a script means resolving it through the API. Agents execute the resolved command in their terminal. The dashboard displays the resolution result.

### Deleting a Build Script

1. Click the **Delete** button (trash icon) next to a script
2. The script is removed immediately (optimistic update)
3. If the deletion fails on the server, the script reappears

## Workspace vs. Plan Scripts

| Type | Scope | Storage |
|------|-------|---------|
| **Plan-level** | Visible only on the associated plan | Stored in plan state file |
| **Workspace-level** | Available to all plans | Stored in workspace metadata |

When listing scripts, both workspace-level and plan-level scripts are merged and displayed together.

## Agent Integration

Agents interact with build scripts through the `memory_plan` MCP tool:

```
memory_plan(action: "add_build_script")     → Create a script
memory_plan(action: "list_build_scripts")   → List all scripts
memory_plan(action: "run_build_script")     → Resolve for terminal execution
memory_plan(action: "delete_build_script")  → Remove a script
```

The **Builder** agent is the primary consumer of build scripts. It:
1. Checks for existing scripts when activated
2. Creates scripts if none exist for the current build task
3. Resolves and runs scripts in the terminal
4. Reports build success/failure back to the Coordinator

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Script not appearing after add | Refresh the page; check browser console for API errors |
| "Failed to run build script" | Verify the script ID exists; check MCP server connection |
| Wrong directory path | Ensure the directory is relative to the workspace root |
| Script runs but fails | Check the command syntax and verify dependencies are installed |
