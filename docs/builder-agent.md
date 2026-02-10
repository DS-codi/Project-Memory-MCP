# Builder Agent - Capabilities & Deployment Guide

## Overview

The Builder agent verifies builds and diagnoses build failures. It sits in the workflow between Executor (implementation) and Reviewer (validation), ensuring that code compiles and builds successfully before review.

## When to Deploy

| Trigger | Description |
|---------|-------------|
| After Executor completes | Verify that new code compiles and passes build checks |
| After Revisionist fixes | Re-verify builds after code corrections |
| Build regression suspected | Diagnose why a previously passing build now fails |
| New build pipeline needed | Create build scripts for a workspace or plan |

## Capabilities

### 1. Build Script Management
- **List scripts**: Discovers existing build scripts for the workspace/plan
- **Create scripts**: Defines new reusable build scripts via `memory_plan(action: add_build_script)`
- **Resolve scripts**: Gets terminal-ready commands via `memory_plan(action: run_build_script)`
- **Delete scripts**: Removes obsolete scripts via `memory_plan(action: delete_build_script)`

### 2. Build Verification
- Runs build commands in the terminal
- Analyzes stdout/stderr for errors, warnings, and success indicators
- Reports build status back to the Coordinator

### 3. Failure Diagnosis
- Parses compiler errors and identifies root causes
- Maps errors to specific files and line numbers
- Provides actionable fix recommendations to the Revisionist

## Workflow Position

```
Executor → Builder → Reviewer (on success)
                  → Revisionist (on failure)
```

The Builder is a **spoke agent** — it never spawns subagents. It always hands off back to the Coordinator via `memory_agent(action: handoff)`.

## Handoff Patterns

| Outcome | Handoff To | Recommendation |
|---------|-----------|----------------|
| Build succeeds | Coordinator | Recommend Reviewer |
| Build fails | Coordinator | Recommend Revisionist with error analysis |
| Missing dependencies | Coordinator | Recommend Executor to install dependencies |

## Build Script Lifecycle

1. **Discovery**: Builder calls `list_build_scripts` to find existing scripts
2. **Creation** (if needed): Builder calls `add_build_script` with name, command, and directory
3. **Resolution**: Builder calls `run_build_script` to get the absolute command and directory
4. **Execution**: Builder runs the resolved command in the terminal via `run_in_terminal`
5. **Analysis**: Builder examines output and determines pass/fail
6. **Cleanup** (optional): Builder calls `delete_build_script` for one-off scripts

## Example Usage

```javascript
// 1. Check for existing scripts
memory_plan(action: "list_build_scripts", workspace_id: "ws_abc")

// 2. Create a build script if none exist
memory_plan(action: "add_build_script", workspace_id: "ws_abc",
  script_name: "Build Server",
  script_command: "npm run build",
  script_directory: "./server",
  script_description: "Compiles TypeScript server code")

// 3. Resolve and run
memory_plan(action: "run_build_script", workspace_id: "ws_abc", script_id: "bs_001")
// Returns: { command: "npm run build", directory_path: "/workspace/server" }
// Then run in terminal

// 4. Report result
memory_agent(action: "handoff", from_agent: "Builder", to_agent: "Coordinator",
  reason: "Build succeeded - recommend Reviewer")
memory_agent(action: "complete", summary: "Server build passed with 0 errors")
```

## Dashboard Integration

Build scripts are visible in the dashboard under the **Build Scripts** tab on the plan detail page. Users can:

- View all scripts with their commands and directories
- Add new scripts via the form
- Run scripts (which resolves the command for terminal execution)
- Delete scripts

The dashboard uses optimistic updates for a responsive UI experience.
