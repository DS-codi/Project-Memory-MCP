# Artifact Reference Boundary Specification

> Created: 2026-03-24
> Governs: `server/src/types/db-ref.types.ts`, `server/src/storage/db-store.ts`

## Core Rule

**If it's stored in SQLite, it gets a `DbRef`. If it's a real file on disk, it gets a `FileRef`. Never mix.**

---

## DB-Backed Artifacts → `DbRef`

These artifact families live in the SQLite database. Any helper that locates or returns one of these MUST return a `DbRef` (or include `_ref: DbRef` in its response object during the migration period).

| Artifact Kind      | SQLite Table(s)                          | `DbArtifactKind` | Notes |
|--------------------|------------------------------------------|-------------------|-------|
| Plans              | `plans`, `steps`, `phases`, `sessions`, `lineage` | `'plan'`     | `getPlanState()`, `savePlanState()`, `createPlan()` |
| Context items      | `context_items` (parent_type='plan')     | `'context'`       | `getPlanContextFromDb()`, `writeJson()` via virtual paths |
| Research notes     | `context_items` (type='research_note:*') | `'context'`       | Virtual-path intercepted in `writeText()`/`readText()` |
| Workspace context  | `context_items` (type='workspace_context') | `'context'`     | `getWorkspaceContextFromDb()`, `saveWorkspaceContextToDb()` |
| Handoffs/lineage   | `lineage`                                | `'handoff'`       | Part of plan state assembly |
| Knowledge files    | `knowledge`                              | `'knowledge'`     | `knowledge.tools.ts` — already has DB table |
| Workspaces         | `workspaces`                             | `'workspace'`     | `getWorkspace()`, `saveWorkspace()`, `createWorkspace()` |
| Sessions           | `sessions`                               | `'session'`       | Part of plan state assembly |
| Skills             | `context_items` (type='skill') or dedicated | `'skill'`      | Managed by instruction/skill tools |
| Instructions       | `context_items` (type='instruction') or dedicated | `'instruction'` | Managed by instruction tools |
| Events             | `events`                                 | `'event'`         | Event log table |
| Programs           | `programs`, `program_plans`, `program_risks`, `dependencies` | `'plan'` | Program operations in db-store.ts |
| Build scripts      | `build_scripts`                          | `'plan'`          | `addBuildScript()`, `getBuildScripts()` |
| Terminal allowlist  | `context_items` (type='terminal_allowlist') | `'context'`    | Migrated from file, still dual-written for compat |

### Synthetic Path Helpers (DB-backed, returning paths today)

These functions currently return `data/{workspaceId}/...` filesystem paths, but the underlying data is in SQLite. They are candidates for `_ref` augmentation:

- `getWorkspacePath(workspaceId)` → synthetic data-folder path
- `getWorkspaceMetaPath(workspaceId)` → `workspace.meta.json` (data in `workspaces` table)
- `getWorkspaceContextPath(workspaceId)` → `workspace.context.json` (data in `context_items`)
- `getPlansPath(workspaceId)` → plans directory
- `getPlanPath(workspaceId, planId)` → plan directory
- `getPlanStatePath(workspaceId, planId)` → `state.json` (data in `plans`+`steps`+`sessions`+`lineage`)
- `getPlanMdPath(workspaceId, planId)` → `plan.md` (legacy, no longer generated)
- `getResearchNotesPath(workspaceId, planId)` → research notes directory (data in `context_items`)
- `getContextPath(workspaceId, planId, contextType)` → context JSON (data in `context_items`)

These are used by the **virtual path system** (`tryParseVirtualPlanPath`) to intercept file I/O and redirect to SQLite. During migration, they continue to return paths for backward compatibility, but callers should prefer the `_ref` field.

---

## Filesystem Artifacts → `FileRef`

These artifacts exist as actual files on the local filesystem. They are NOT stored in SQLite. Helpers that return paths to these MUST continue returning filesystem paths (optionally wrapped in `FileRef` for type safety).

| Artifact Kind               | Physical Location                                     | `FileArtifactKind`     |
|-----------------------------|-------------------------------------------------------|------------------------|
| Agent deploy files          | `.projectmemory/active_agents/{agent}/`               | `'agent_file'`         |
| Context bundles             | `.projectmemory/active_agents/{agent}/context-bundle.json` | `'agent_file'`    |
| Init context files          | `.projectmemory/active_agents/{agent}/init-context.json`   | `'agent_file'`    |
| Agent instruction files     | `.projectmemory/active_agents/{agent}/instructions/`       | `'agent_file'`    |
| Focused workspace files     | `.projectmemory/workspaces/*.code-workspace`          | `'config_file'`        |
| Identity file               | `.projectmemory/identity.json`                        | `'config_file'`        |
| workspace-registry.json     | `data/workspace-registry.json` (compat shim)          | `'config_file'`        |
| Investigation state files   | `data/{wsId}/plans/{planId}/investigations/*/state.json` | `'investigation_file'` |
| Reviewed queue files        | `.projectmemory/reviewed_queue/`                      | `'agent_file'`         |
| Terminal allowlist (compat) | `data/{wsId}/terminal-allowlist.json` (dual-written)  | `'terminal_allowlist'` |

### Real-Path Helpers (filesystem, returning paths correctly)

These functions return paths to actual files on disk and should NOT be converted to DbRef:

- `getProjectMemoryDir(workspacePath)`
- `getFocusedWorkspacesDir(workspacePath)`
- `getFocusedWorkspacePath(workspacePath, planId, filename?)`
- `getActiveAgentsDir(workspacePath)`
- `getAgentDeployDir(workspacePath, agentName)`
- `getDeployedAgentFile(workspacePath, agentName)`
- `getContextBundlePath(workspacePath, agentName)`
- `getManifestPath(workspacePath, agentName)`
- `getInitContextPath(workspacePath, agentName)`
- `getAgentContextDir(workspacePath, agentName)`
- `getAgentPullStagingDir(workspacePath, agentName)`
- `getAgentPullSessionDir(workspacePath, agentName, sessionId)`
- `getAgentPullManifestPath(workspacePath, agentName, sessionId)`
- `getAgentInstructionsDir(workspacePath, agentName)`
- `getAgentExecutionNotesDir(workspacePath, agentName)`
- `getAgentToolResponsesDir(workspacePath, agentName)`
- `getReviewedQueueDir(workspacePath)`
- `getReviewedAgentDir(workspacePath, planId, agentName, timestamp)`
- `getIdentityPath(workspacePath)`
- `getInvestigationDir(dataRoot, workspaceId, planId, investigationId)`

---

## Passthrough Functions (No Path Returns)

These functions read/write DB rows but don't return paths or artifact locators. No change needed:

- `readJson()` / `writeJson()` / `writeJsonLocked()` / `modifyJsonLocked()` — generic I/O (virtual-path intercepted)
- `readText()` / `writeText()` — generic I/O (virtual-path intercepted)
- `exists()` — boolean check
- `ensureDir()` / `listDirs()` — directory operations
- `savePlanState()` / `saveWorkspace()` — write-only, no locator returned
- `saveProgramState()` / `saveRisks()` / `saveDependencies()` / `saveManifest()` — write-only
- `deletePlan()` / `deleteProgram()` / `deleteBuildScript()` — destructive, no locator returned
- `generateWorkspaceId()` / `generatePlanId()` / `generateSessionId()` — ID generators
- `normalizeWorkspacePath()` / `getWorkspaceIdFromPath()` / `getWorkspaceDisplayName()` — path utilities
- `parseCommandTokens()` — pure utility
- `lookupByPath()` / `upsertRegistryEntry()` — registry compat shims
- `initDataRoot()` — DB bootstrap
- `getDataRoot()` / `resolveWorkspaceRoot()` / `safeResolvePath()` — infrastructure

---

## Migration Strategy

### Phase 9 (current): Additive `_ref` field
DB-backed helpers that return data objects gain an additional `_ref: DbRef` field. Existing path fields remain unchanged. Zero breakage.

### Phase 11 (future): Compatibility rollout  
Callers transition from reading path fields to reading `_ref`. Legacy path fields are deprecated.

### Never:
Filesystem-path helpers are NOT migrated. They continue returning `string` paths (optionally typed as `FileRef`).
