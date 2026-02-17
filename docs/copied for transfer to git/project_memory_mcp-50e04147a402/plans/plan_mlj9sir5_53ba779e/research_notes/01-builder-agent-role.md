---
plan_id: plan_mlj9sir5_53ba779e
created_at: 2026-02-12T09:45:46.446Z
sanitized: false
injection_attempts: 0
warnings: 0
---

# Research Area 1: Builder Agent Current Role

## Current Builder Agent Instructions (agents/builder.agent.md)
- **Mission**: Verify builds and diagnose build failures
- **Position in workflow**: Deployed after Executor implementation
- **Can implement**: `false` — cannot create/edit code files
- **Handoff targets**: Tester (on success), Revisionist (on failure)

### Current Responsibilities
1. Ensure build scripts exist; create via `memory_plan(action: add_build_script)` if missing
2. List available build scripts via `memory_plan(action: list_build_scripts)`
3. Run build scripts in terminal
4. Analyze build output (success or failure)
5. On failure: parse errors, mark steps as blocked, store build_failure_analysis context, handoff to Revisionist
6. On success: mark build step done, handoff to Reviewer

### Build Script Management
- Builder manages build scripts stored in plan state (`BuildScript` type in types/index.ts)
- Scripts have: id, name, description, command, directory, workspace_id, optional plan_id
- `run_build_script` resolves command+directory, then Builder runs in terminal
- `add_build_script` creates new scripts
- Scripts are stored in `PlanState.build_scripts[]` or `WorkspaceMeta.workspace_build_scripts[]`

### Builder in Coordinator Workflow
The Coordinator deploys Builder at two points:
1. **After each Executor phase**: "Verify build succeeds after implementation"
2. **Final build verification**: "Final build verification before release" (after all tests pass)

### What Needs to Change (per user request)
- Builder should **no longer run builds** — its role changes to:
  1. Create build scripts
  2. Ensure project is ready to build
  3. Only deployed at end of plan lifecycle for final compilation check
  4. Include user-facing instructions and optimization suggestions in handoff

### Code References
- `AGENT_BOUNDARIES.Builder` in `server/src/types/index.ts` (line ~320)
  - `can_implement: false`
  - `primary_responsibility: 'Run build scripts and terminal commands, verify builds succeed, diagnose build failures'`
  - `must_handoff_to: ['Tester', 'Revisionist']`
- Build script types: `BuildScript`, `AddBuildScriptResult`, `ListBuildScriptsResult`, `RunBuildScriptResult` in types/index.ts
- Build script utils in `server/src/storage/build-script-utils.ts`
- Plan tools handle build scripts: `memory_plan.ts` (actions: add_build_script, list_build_scripts, run_build_script, delete_build_script)
- Coordinator workflow references Builder in two places in the WORKFLOW SEQUENCE and ORCHESTRATION LOOP sections