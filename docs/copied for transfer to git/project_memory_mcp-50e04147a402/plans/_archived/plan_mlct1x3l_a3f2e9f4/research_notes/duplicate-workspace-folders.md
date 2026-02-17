---
plan_id: plan_mlct1x3l_a3f2e9f4
created_at: 2026-02-07T21:12:18.107Z
sanitized: false
injection_attempts: 0
warnings: 0
---

# Duplicate workspace folders - findings

## Likely causes
- Workspace ID derivation mismatch across surfaces:
  - MCP server uses normalized lowercase path + sha256 + hyphenated basename. [server/src/storage/file-store.ts](server/src/storage/file-store.ts#L77-L86)
  - Extension DashboardViewProvider matches server format. [vscode-extension/src/providers/DashboardViewProvider.ts](vscode-extension/src/providers/DashboardViewProvider.ts#L52-L63)
  - Extension command for plan creation uses md5 + underscore name + non-normalized path. [vscode-extension/src/extension.ts](vscode-extension/src/extension.ts#L578-L586)
  - McpBridge fallback uses sha256 of raw path (no normalize/lowercase) and does not actually register with server when missing in /api/workspaces. [vscode-extension/src/chat/McpBridge.ts](vscode-extension/src/chat/McpBridge.ts#L278-L309)
- Dashboard server plan creation creates plan folders even if workspace meta is missing, then only tries to update meta (warning if not found). This can create new workspace folders in data root for mismatched workspace IDs. [dashboard/server/src/routes/plans.ts](dashboard/server/src/routes/plans.ts#L520-L588)
- Data root can diverge by process working dir or env:
  - MCP server uses MBS_DATA_ROOT or process.cwd() + "../data". [server/src/storage/file-store.ts](server/src/storage/file-store.ts#L24-L26)
  - Dashboard server defaults to a fixed path for MBS_DATA_ROOT. [dashboard/server/src/index.ts](dashboard/server/src/index.ts#L14-L24)

## Workspace ID + data path derivation
- Workspace ID algorithm (MCP server): normalized lowercase path -> sha256 -> first 12 hex, plus basename. [server/src/storage/file-store.ts](server/src/storage/file-store.ts#L77-L86)
- Workspace data root path is computed from DATA_ROOT + workspaceId (MCP server). [server/src/storage/file-store.ts](server/src/storage/file-store.ts#L116-L145)

## Storage patterns
- Plan-level storage is under data/{workspaceId}/plans/{planId} with state.json, context jsons, research_notes. [server/src/storage/file-store.ts](server/src/storage/file-store.ts#L116-L155)
- memory_context APIs are plan-scoped only (workspace_id + plan_id required). [server/src/tools/consolidated/memory_context.ts](server/src/tools/consolidated/memory_context.ts#L22-L60)
- Workspace-level data lives in workspace.meta.json; dashboard uses it for build scripts. [dashboard/server/src/routes/workspaces.ts](dashboard/server/src/routes/workspaces.ts#L74-L130)
- Workspace philosophy is stored in the repo (.github/project-philosophy.md) and is resolved using workspace.meta.json path. [dashboard/server/src/routes/workspaces.ts](dashboard/server/src/routes/workspaces.ts#L24-L71)

## UI + extension touchpoints
- Dashboard reads workspaces by scanning data root and workspace.meta.json. [dashboard/server/src/services/fileScanner.ts](dashboard/server/src/services/fileScanner.ts#L43-L118)
- Extension uses multiple workspace ID derivations (DashboardViewProvider vs plan creation command). [vscode-extension/src/providers/DashboardViewProvider.ts](vscode-extension/src/providers/DashboardViewProvider.ts#L52-L63) and [vscode-extension/src/extension.ts](vscode-extension/src/extension.ts#L578-L586)

## Implications
- If a client computes workspaceId differently, dashboard server will create plan directories for a workspaceId that does not correspond to the registered workspace.meta.json, creating "duplicate" workspace folders under data root.
- Mismatch between MCP server data root and dashboard server data root can split storage across different data directories (appears as duplicates depending on which service you inspect).

## Suggested update surfaces
- Server: unify workspace ID derivation utilities (single source), add workspace-level context storage path(s), and add guardrails for plan creation when workspace meta missing.
- Dashboard server: avoid creating plan directories if workspace meta missing or add an explicit register/create endpoint that writes workspace.meta.json first.
- Extension: remove md5 workspaceId logic; rely on server-generated or shared workspaceId function; normalize path consistently.
- Agents/instructions: document workspace-level context vs plan-level context and preferred APIs.
