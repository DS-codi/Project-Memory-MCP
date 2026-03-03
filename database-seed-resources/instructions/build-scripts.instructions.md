---
applyTo: "**/*"
---

# Build Scripts Reference

This workspace has registered build scripts via the Project Memory MCP system. **Always check for existing build scripts before running ad-hoc commands.**

## Default Build Entry Point (Required)

For this workspace, the canonical build/install entry point is:

```
.\install.ps1
```

Run it from:

```
./Project-Memory-MCP
```

When adding new build scripts, prefer `./install.ps1 -Component ...` over raw `cargo`, `npm`, or `podman` commands unless a task explicitly requires direct invocation.

## Default Test Entry Point (Required)

For this workspace, the canonical test entry point is:

```
.\run-tests.ps1
```

Run it from:

```
./Project-Memory-MCP
```

For component-scoped test runs, use `./run-tests.ps1 -Component ...` before any direct test command.

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
  script_name: "Install Interactive Terminal",
  script_command: ".\\install.ps1 -Component InteractiveTerminal",
  script_directory: "./Project-Memory-MCP",
  script_description: "Build/install Interactive Terminal via workspace installer"
)
```

Optional parameters:
- `plan_id` — scope the script to a specific plan (omit for workspace-level)
- `script_mcp_handle` — programmatic identifier for agent automation

## This Workspace's Standard Build Scripts (Installer-First)

Register these installer-based commands first. Use raw component-local build commands only for debugging or targeted validation.

| Task | Command | Directory |
|------|---------|-----------|
| Install All Core Components | `.\install.ps1` | `./Project-Memory-MCP` |
| Install Interactive Terminal | `.\install.ps1 -Component InteractiveTerminal` | `./Project-Memory-MCP` |
| Install Supervisor | `.\install.ps1 -Component Supervisor` | `./Project-Memory-MCP` |
| Install GUI Forms | `.\install.ps1 -Component GuiForms` | `./Project-Memory-MCP` |
| Install Server | `.\install.ps1 -Component Server` | `./Project-Memory-MCP` |
| Install Dashboard | `.\install.ps1 -Component Dashboard` | `./Project-Memory-MCP` |
| Install Extension | `.\install.ps1 -Component Extension` | `./Project-Memory-MCP` |
| Install Container | `.\install.ps1 -Component Container` | `./Project-Memory-MCP` |
| Extension Install Only (No Rebuild) | `.\install.ps1 -Component Extension -InstallOnly` | `./Project-Memory-MCP` |
| Extension Package Only (Skip VS Code Install) | `.\install.ps1 -Component Extension -SkipInstall` | `./Project-Memory-MCP` |
| Force Reinstall Extension / No-Cache Container | `.\install.ps1 -Component Extension -Force` | `./Project-Memory-MCP` |
| Fresh DB + Server Rebuild | `.\install.ps1 -Component Server -NewDatabase` | `./Project-Memory-MCP` |

## Targeted Test Wrapper Presets (Preferred for Focused Runs)

When a task needs focused test coverage, prefer these registered `run-tests.ps1` presets before creating new ad-hoc direct test commands:

| Task | Command | Directory |
|------|---------|-----------|
| Server targeted context tools | `.\run-tests.ps1 -Component Server -TestArg 'Server=src/__tests__/tools/memory-context-actions.test.ts src/__tests__/tools/context-search.tools.test.ts'` | `./Project-Memory-MCP` |
| Supervisor targeted dispatcher | `.\run-tests.ps1 -Component Supervisor -TestArg 'Supervisor=control::runtime::dispatcher::tests:: -- --nocapture'` | `./Project-Memory-MCP` |
| Dashboard targeted useMCPEvents | `.\run-tests.ps1 -Component Dashboard -TestArg 'Dashboard=src/__tests__/hooks/useMCPEvents.test.tsx'` | `./Project-Memory-MCP` |
| Extension targeted plan routing | `.\run-tests.ps1 -Component Extension -TestArg 'Extension=out/test/suite/dashboard-client-helpers.test.js out/test/suite/dashboard-plan-selection-routing.test.js'` | `./Project-Memory-MCP` |
| Server full output on failure | `.\run-tests.ps1 -Component Server -FullOutputOnFailure` | `./Project-Memory-MCP` |

If no preset matches, register a new `run-tests.ps1` preset via `memory_plan(action: "add_build_script")` before falling back to direct test commands.

## Direct Commands (Fallback / Diagnostics Only)

Use these only after checking for a `run-tests.ps1` wrapper script (or when wrapper behavior is being diagnosed) and only when a plan explicitly requests low-level commands.

### Server (fallback)

| Task | Command | Directory |
|------|---------|-----------|
| Build | `npm run build` | `./Project-Memory-MCP/server` |
| Test | `npx vitest run` | `./Project-Memory-MCP/server` |

### Dashboard (fallback)

| Task | Command | Directory |
|------|---------|-----------|
| Build | `npx vite build` | `./Project-Memory-MCP/dashboard` |
| Test | `npx vitest run` | `./Project-Memory-MCP/dashboard` |

### Interactive Terminal (fallback)

| Task | Command | Directory |
|------|---------|-----------|
| Build | `cargo build` | `./Project-Memory-MCP/interactive-terminal` |
| Test | `cargo test` | `./Project-Memory-MCP/interactive-terminal` |

### Container (fallback)

| Task | Command | Directory |
|------|---------|-----------|
| Build image | `podman build -t project-memory-mcp-project-memory:latest .` | `./Project-Memory-MCP` |

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
2. If none exist for the task, `memory_plan(action: "add_build_script")` — register installer-based script first (`.\install.ps1 -Component ...`)
3. `memory_plan(action: "run_build_script")` — resolve the script
4. Run the resolved command in terminal
5. Report result via `memory_agent(action: "handoff")` — recommend Reviewer on success, Revisionist on failure

## Migration Rule for Existing Scripts

If an existing script uses raw component-local build commands and there is an equivalent `install.ps1` component flow:

1. Add new installer-based workspace script
2. Update plan references to use the installer-based script id
3. Keep old script temporarily only if actively used for diagnostics
4. Delete obsolete direct-build script once no plan depends on it

## Deleting Scripts

```
memory_plan(action: "delete_build_script", workspace_id: "<id>", script_id: "<script_id>")
```

Delete plan-level scripts when a plan is archived. Keep workspace-level scripts persistent.
