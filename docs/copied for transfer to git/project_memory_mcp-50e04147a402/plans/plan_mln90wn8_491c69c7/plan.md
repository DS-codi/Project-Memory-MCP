# Fix extension workspace identity canonicalization for legacy workspace IDs

**Plan ID:** plan_mln90wn8_491c69c7
**Status:** active
**Priority:** high
**Current Phase:** complete
**Current Agent:** Coordinator

## Description

Patch vscode-extension workspace identity resolution to canonicalize stale legacy workspace_id values via workspace-registry lookup and repair local stale identity.json files.

## Progress

- [x] **Implementation:** [analysis] Inspect workspace identity utility and registry schema used by extension
  - _Inspected vscode-extension/src/utils/workspace-identity.ts and data/workspace-registry.json; confirmed identity.json is trusted directly with no canonicalization and stale IDs in both targeted identity files._
- [x] **Implementation:** [code] Implement canonicalization of identity workspace_id against workspace-registry.json with legacy ID fallback
  - _Added canonicalizeWorkspaceId in workspace-identity.ts. It reads data_root/workspace-registry.json, treats registered IDs as valid, and remaps legacy IDs via legacy_workspace_ids/legacyWorkspaceIds when available. Falls back to original ID on missing/unreadable registry._
- [x] **Implementation:** [fix] Repair stale identity.json workspace_id values in parent and nested workspace folders
  - _Updated workspace_id in both target identity.json files to canonical project_memory_mcp-50e04147a402; no other fields changed._
- [x] **Validation:** [validation] Compile vscode extension and verify canonical identity resolution behavior
  - _Ran required compile command `npx tsc -p .` in vscode-extension (failed due pre-existing errors in src/test/replay/core/MigrationResolver.ts, unrelated to this change). Also ran targeted runtime check by compiling src/utils/workspace-identity.ts to temp and invoking resolveWorkspaceIdentity('c:/Users/User/Project_Memory_MCP'), which returned canonical workspaceId project_memory_mcp-50e04147a402._

## Agent Lineage

- **2026-02-15T04:37:33.404Z**: Executor → Coordinator — _Implementation and validation complete for workspace identity canonicalization and stale identity-file repair._