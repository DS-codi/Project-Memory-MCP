---
plan_id: plan_ml72da5d_09189d1a
created_at: 2026-02-03T20:46:06.253Z
sanitized: false
injection_attempts: 0
warnings: 0
---

# Implementation Recommendations

## Summary of Research Findings

All five research areas have been thoroughly investigated:
1. ✅ Agent system architecture and `.agent.md` format
2. ✅ Data storage for workspaces and plans  
3. ✅ Frontend dashboard tab implementation
4. ✅ MCP tool system and consolidation pattern
5. ✅ Build system and script configurations

## Recommended Implementation Approach

### Phase 1: Data Layer (Foundation)

**1.1 Extend Type Definitions**
- File: `server/src/types/index.ts`
- Add `Builder` to `AgentType` union
- Add `Builder` entry to `AGENT_BOUNDARIES`
- Define `BuildScript` interface
- Extend `PlanState` to include `build_scripts?: BuildScript[]`
- Optionally extend `WorkspaceMeta` for workspace-level scripts
- Add `goals?: string[]` and `success_criteria?: string[]` to `PlanState`

**1.2 Extend Storage Layer**
- File: `server/src/storage/file-store.ts`
- Add functions:
  - `addBuildScript(workspaceId, planId, script)`
  - `getBuildScripts(workspaceId, planId?)`
  - `updateBuildScript(workspaceId, planId, scriptId, updates)`
  - `deleteBuildScript(workspaceId, planId, scriptId)`
  - `executeBuildScript(workspaceId, planId, scriptId)` (optional)

**1.3 Update MCP Tools**
- Option A (Recommended): Extend `memory_plan` tool
  - Add actions: `add_build_script`, `list_build_scripts`, `update_build_script`, `delete_build_script`
  - File: `server/src/tools/consolidated/memory_plan.ts`
- Option B: Create new `memory_builds` consolidated tool
  - Follows same pattern as other consolidated tools
  - File: `server/src/tools/consolidated/memory_builds.ts`

### Phase 2: Builder Agent Definition

**2.1 Create Agent File**
- File: `agents/builder.agent.md`
- Frontmatter configuration:
  ```yaml
  name: Builder
  description: 'Builds and compiles projects, troubleshoots build failures'
  tools: ['execute', 'read', 'edit', 'search', 'agent', 'filesystem/*', 'project-memory/*']
  handoffs:
    - label: "🎯 Return to Coordinator"
      agent: Coordinator
      prompt: "Build complete or blocked."
  ```
- Markdown instructions following pattern from other agents
- Include build troubleshooting strategies

**2.2 Update Type System**
- `server/src/types/index.ts`:
  ```typescript
  Builder: {
    agent_type: 'Builder',
    can_implement: true,  // Can modify build configs
    can_finalize: false,
    must_handoff_to: ['Archivist', 'Revisionist'],
    forbidden_actions: [],
    primary_responsibility: 'Compile projects, troubleshoot build issues, verify builds'
  }
  ```

### Phase 3: Frontend Implementation

**3.1 Add Goals/Success Criteria Tab**
- Update `PlanDetailPage.tsx`:
  - Add `'goals'` to `Tab` type
  - Add tab definition to `tabs` array
  - Add tab content rendering
- Create component `GoalsTab.tsx` in `components/plan/`
- Display from `plan.goals` and `plan.success_criteria` arrays

**3.2 Add Build Scripts Tab**
- Update `PlanDetailPage.tsx`:
  - Add `'scripts'` to `Tab` type
  - Add tab definition with `<Terminal />` icon
- Create components in `components/plan/`:
  - `BuildScriptsTable.tsx` - Display scripts table
  - `AddBuildScriptForm.tsx` - Form to add scripts
  - `BuildScriptEditor.tsx` - Edit existing scripts
- Create hook: `hooks/useBuildScripts.ts`
- Add API endpoint: `GET /api/build-scripts/:workspaceId/:planId`

**3.3 API Integration**
- Add backend routes (dashboard server or main server)
- Implement CRUD operations for build scripts
- Return data in format matching `BuildScript` interface

### Phase 4: Testing & Documentation

**4.1 Add Tests**
- Storage layer tests: `server/src/storage/__tests__/build-scripts.test.ts`
- MCP tool tests: Test new actions in `memory_plan` or `memory_builds`
- Frontend component tests: Test forms and tables

**4.2 Update Documentation**
- Add Builder agent to agent list in README
- Document build script schema
- Add examples of using build scripts
- Update API documentation

### Phase 5: Optional Enhancements

**5.1 MCP Tool Exposure**
- Register build scripts as callable MCP tools
- Use `mcp_handle` field to create tool names like `build_server`
- Implement dynamic tool registration or single `execute_build_script` tool

**5.2 Build Output Tracking**
- Store build results in plan logs
- Track success/failure rates
- Display build history in frontend

**5.3 Workspace-Level Scripts**
- Implement workspace-level script storage (reusable across plans)
- Add UI toggle for workspace vs. plan scripts

## Implementation Risks & Mitigation

### Risk 1: Breaking Changes
**Mitigation**: All changes are additive (optional fields, new tools)

### Risk 2: Frontend API Mismatch
**Mitigation**: Define TypeScript types shared between frontend and backend

### Risk 3: Agent Conflicts
**Mitigation**: Builder agent has clear role boundaries, only runs when needed

### Risk 4: Build Script Security
**Mitigation**: 
- Sanitize commands before execution
- Run in sandboxed environment
- User confirmation before execution
- Log all executions

## Next Steps for Architect

### High Priority:
1. Define exact schema for `BuildScript` type
2. Decide: Extend `memory_plan` or create `memory_builds` tool
3. Specify API endpoints for frontend
4. Design Goals/Success Criteria storage (array of strings vs. structured objects)

### Medium Priority:
5. Plan migration strategy for existing plans (add empty arrays)
6. Design Builder agent workflow (when to deploy, how to handle failures)
7. Specify build script execution model (direct vs. queued)

### Low Priority:
8. Plan workspace-level script sharing
9. Design build history tracking
10. Consider MCP tool exposure implementation

## Files to Modify (Summary)

### Server:
- `server/src/types/index.ts` - Add types
- `server/src/storage/file-store.ts` - Add storage functions
- `server/src/tools/consolidated/memory_plan.ts` - Add tool actions
- Optional: Create `server/src/tools/consolidated/memory_builds.ts`

### Frontend:
- `dashboard/src/pages/PlanDetailPage.tsx` - Add tabs
- `dashboard/src/components/plan/GoalsTab.tsx` - NEW
- `dashboard/src/components/plan/BuildScriptsTable.tsx` - NEW
- `dashboard/src/components/plan/AddBuildScriptForm.tsx` - NEW
- `dashboard/src/hooks/useBuildScripts.ts` - NEW
- `dashboard/src/types/index.ts` - Import/export types

### Agent:
- `agents/builder.agent.md` - NEW

### Build:
- No changes to build system itself
- Build scripts are stored as data, not code
