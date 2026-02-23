---
plan_id: plan_mlmx6bns_4f8352c2
created_at: 2026-02-14T23:37:22.931Z
sanitized: false
injection_attempts: 0
warnings: 0
---

## Migration Workflow Audit (workspace.context.json)

### Scope
- Traced migrate/merge path in server code for workspace consolidation.
- Focus: where workspace.context.json can be dropped, overwritten, or left empty.

### Code Path Trace
1. `memory_workspace` migrate action routes directly to `migrateWorkspace(workspacePath)` in `server/src/tools/consolidated/memory_workspace.ts`.
2. `migrateWorkspace` in `server/src/storage/workspace-identity.ts`:
   - Resolves canonical workspace id.
   - Creates/updates canonical `workspace.meta.json`.
   - Scans matching ghost folders.
   - Moves plan directories and merges logs.
   - Deletes ghost folders.
   - Updates canonical `workspace.meta.json` plan arrays and writes identity file.
3. `mergeWorkspace` in `server/src/storage/workspace-identity.ts`:
   - Moves plans and logs from source to target.
   - Updates target `workspace.meta.json` legacy ids.
   - Writes audit entry to target `workspace.context.json`.
   - Deletes source folder if references are clear.

### Decision Points Where Context Can Be Lost or Empty
1. **Source context is never merged in migrate flow**
   - `migrateWorkspace` merges plans/logs only, never reads or merges source `workspace.context.json`.
   - If ghost/source had rich sections, deleting source folder can drop that context entirely.

2. **Source context is never merged in merge flow**
   - `mergeWorkspace` merges plans/logs only; source context is ignored.
   - If source is deleted, its context data is lost.

3. **Empty context creation during merge audit write**
   - In `mergeWorkspace`, writing audit log uses `modifyJsonLocked` on target context path.
   - If target context file is missing, it creates a new context object with `sections: {}`.
   - This preserves audit trail but leaves semantic sections empty.

4. **Ghost folders with no plans still get deleted**
   - In `migrateWorkspace`, matching ghosts are deleted after processing regardless of whether they only contained context/meta-like data.
   - For ghosts with `workspace.context.json` but no unique plans, deletion can still remove context information.

### Migration Copy/Merge of workspace.context.json
- No explicit copy or merge logic for `workspace.context.json` from source/ghost to canonical in either:
  - `migrateWorkspace`
  - `mergeWorkspace`

### Post-merge repopulation hook from plan/research artifacts
- No automatic repopulation hook detected.
- Existing mechanisms:
  - `registerWorkspace` auto-seeds context from profile **only on first registration with profile**.
  - `appendWorkspaceFileUpdate` can create a minimal context with `sections: {}` if missing (for logs/audit), but does not reconstruct semantic sections from plans/research notes.
- No code path found that rebuilds workspace context sections from active plans or `research_notes` after migrate/merge.

### Root Cause Hypotheses
1. **Primary (high confidence): Context merge omission in migration primitives**
   - migrate/merge treat workspace context as non-authoritative sidecar and only migrate plans/logs.
2. **Secondary (high confidence): Empty context bootstrap path masks data loss**
   - Logging/audit append creates valid but semantically empty context when missing.
3. **Secondary (medium confidence): Context-only ghost deletion**
   - Ghost matching/deletion logic can remove ghost folder even when only context data remains useful.

### Minimal-risk Design Options (for Architect/Executor)
1. **Preserve canonical sections first**
   - If canonical context exists with non-empty sections, keep it as source of truth.
   - Only append logs/audit/metadata updates.
2. **Merge source sections when canonical empty/missing**
   - During merge/migrate, if canonical sections are empty and source has non-empty sections, promote source sections.
   - If both non-empty, perform additive merge by section key, preserving canonical summaries unless empty.
3. **Fallback repopulation from artifacts**
   - If resulting sections remain empty after merge, build summary sections from:
     - active plan state metadata (titles/phases/categories)
     - research note headers/titles
     - available context JSON files
   - Keep this fallback deterministic and tagged as generated.
4. **Deletion guardrail**
   - Before deleting source/ghost, ensure source context was either merged or intentionally ignored with a warning note.

### Concrete Files / Symbols for Later Change
- `server/src/storage/workspace-identity.ts`
  - `mergeWorkspace(...)`
  - `migrateWorkspace(...)`
  - (add helpers for context read/merge/preserve decision)
- `server/src/logging/workspace-update-log.ts`
  - `appendWorkspaceFileUpdate(...)` (avoid forcing empty sections context without merge check)
- `server/src/tools/workspace.tools.ts`
  - `registerWorkspace(...)` / `seedWorkspaceContext(...)` (optional fallback trigger post-migrate if context empty)
- Tests:
  - `server/src/__tests__/storage/workspace-identity.test.ts` (add migrate/merge context preservation cases)
  - Possibly add/extend dedicated tests for context fallback generation.

### Validation Scenarios for Fix
1. Canonical has rich sections, source has different sections -> canonical preserved, source merged without loss.
2. Canonical missing context, source has context -> canonical gains source sections after migrate/merge.
3. Canonical exists with empty sections, source non-empty -> source promoted/merged; no empty final sections.
4. Both canonical and source missing context -> fallback generation from plans/research creates minimum non-empty summaries.
5. Ghost with no plans but with context -> source not deleted until context handling decision logged/applied.
6. Dry-run mode reports context merge decisions without modifying files.
