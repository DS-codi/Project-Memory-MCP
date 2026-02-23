---
plan_id: plan_mlgbe4zs_41f944e1
created_at: 2026-02-10T08:07:47.217Z
sanitized: false
injection_attempts: 0
warnings: 0
---

# Issue 3: Workspace Context Usability & Integration

## Current Workspace Context Architecture

### Data Model (`WorkspaceContext`)
Stored at: `<MBS_DATA_ROOT>/<workspace_id>/workspace.context.json`

```typescript
interface WorkspaceContext {
  schema_version: string;
  workspace_id: string;
  workspace_path: string;
  identity_file_path?: string;
  name: string;
  created_at: string;
  updated_at: string;
  sections: Record<string, WorkspaceContextSection>;
  update_log?: { ... };   // Tracking changes
  audit_log?: { ... };    // Merge/migration history
}

interface WorkspaceContextSection {
  summary?: string;
  items?: WorkspaceContextSectionItem[];
}

interface WorkspaceContextSectionItem {
  title: string;
  description?: string;
  links?: string[];
}
```

### Three Access Points

#### 1. MCP Server (`memory_context` tool, workspace_get/set/update/delete actions)
- **File**: `server/src/tools/workspace-context.tools.ts` (445 lines) + `server/src/tools/consolidated/memory_context.ts`
- **Auth**: Full identity validation chain (fails cross-machine — Issue 1)
- **Features**: CRUD with merge support, size limit (1MB), sanitization, audit logging
- **Used by**: Agents via `memory_context` (action: workspace_get/set/update/delete)

#### 2. Dashboard REST API
- **File**: `dashboard/server/src/routes/workspaces.ts` (GET/PUT `/:id/context`)
- **Auth**: None — reads workspace meta by ID directly, no identity validation
- **Features**: Basic GET/PUT with section normalization, auto-creates empty context on GET
- **Used by**: Dashboard frontend `WorkspaceContextPanel.tsx`

#### 3. VS Code Extension (`/context` command)
- **File**: `vscode-extension/src/chat/ChatParticipant.ts`, `handleContextCommand()` (line 329-375)
- **What it does**: Calls `memory_workspace` (action: info) which returns workspace info + codebase profile
- **What it does NOT do**: It does NOT read `workspace.context.json` at all! It only shows workspace_id, path, languages, frameworks, and file_count from the codebase profile.
- **Missing**: No integration with the actual workspace context sections

### Dashboard Section Definitions

The `WorkspaceContextPanel.tsx` defines 7 fixed sections:

| Key | Label | Description |
|-----|-------|-------------|
| `project_details` | Project Details | High-level details such as stack, ownership, and scope |
| `purpose` | Purpose | What this workspace exists to deliver |
| `dependencies` | Dependencies | Key services, packages, or systems this project relies on |
| `modules` | Modules | Core modules and how responsibilities are divided |
| `test_confirmations` | Test Confirmations | Required test suites, validations, and completion checks |
| `dev_patterns` | Dev Patterns | Preferred development patterns, conventions, and workflows |
| `resources` | Resources | Docs, dashboards, and reference material for the team |

These are hardcoded in the frontend. The MCP server accepts any section key.

### Agent Usage of Workspace Context

From `coordinator.agent.md`:
- Step 1b after init: **"Always fetch workspace context"** via `memory_context` (action: workspace_get)
- If missing/stale: Deploy Architect as subagent with prompt "Populate the workspace context..."
- Staleness criteria: `updated_at` > 7 days ago, or missing key sections, or workspace path changed

From `architect.agent.md`:
- Has a "context-population mode" where it reads the codebase and writes workspace context
- Uses `memory_context` (action: workspace_set) to create context with sections: overview, architecture, conventions, key_directories, dependencies

**Note: The Architect's sections (overview, architecture, conventions, key_directories, dependencies) are DIFFERENT from the dashboard's sections (project_details, purpose, dependencies, modules, test_confirmations, dev_patterns, resources).** This is a schema mismatch.

### Key Findings

1. **VS Code Extension `/context` command is disconnected** — it doesn't show workspace context sections at all, only codebase profile data from workspace indexing

2. **Section schema mismatch** between dashboard (7 hardcoded sections) and agents (5 ad-hoc sections defined in agent instructions). The MCP server accepts any section key, so both work independently but produce different section sets.

3. **No section schema defined server-side** — the server stores whatever sections the caller provides. There's no canonical list, no validation of section keys, no schema enforcement.

4. **Context population is manual** — the Coordinator checks if context is stale and deploys an Architect subagent. There's no automatic population triggered by workspace registration.

5. **The dashboard panel is view-only by default** — users must click "Edit" to modify sections. There's no indication of which sections agents care about.

6. **No agent auto-injection** — workspace context is NOT automatically included in agent init responses. Agents must separately call `memory_context` (action: workspace_get) to access it. This means agents often skip reading it.

## Opportunities for Improvement

1. **Unify section schema** — define a canonical set of sections that both the dashboard and agents use
2. **Auto-inject relevant context into init** — include a compact workspace context summary in `InitialiseAgentResult`
3. **VS Code `/context` command should show workspace context sections** — not just codebase profile
4. **Add "agent hints" to sections** — mark which agents benefit from which sections
5. **Auto-populate on registration** — when a workspace is registered, trigger codebase analysis and create initial context
6. **Add section-level freshness tracking** — track `updated_at` per section, not just globally
7. **Custom sections** — allow users to define custom sections via dashboard, not just the hardcoded 7
