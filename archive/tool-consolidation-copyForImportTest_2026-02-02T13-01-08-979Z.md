# Tool Consolidation Plan v2.0

> **Objective**: Reduce 39 MCP tools → 5 consolidated tools, then REMOVE old tools
> **Critical Rule**: Add new tools first, verify working, THEN remove old tools
> **Status**: 🔄 IN PROGRESS - Phase 1 & 2 COMPLETE

---

## Progress Summary

- ✅ **Phase 1**: Created 5 consolidated tools, registered in index.ts, server builds
- ✅ **Phase 2**: Created tool-tester.agent.md for verification
- ⏳ **Phase 3**: Ready for verification testing (run tool-tester agent)
- ⏳ **Phase 4-11**: Pending

---

## Overview

### Current State (39 Tools)
**Workspace Tools (4):**
1. `register_workspace` - Register a workspace directory
2. `list_workspaces` - List all registered workspaces  
3. `get_workspace_plans` - Get plans for a workspace
4. `reindex_workspace` - Re-index workspace codebase

**Plan Tools (8):**
5. `find_plan` - Find a plan by ID
6. `list_plans` - List plans in a workspace
7. `create_plan` - Create a new plan
8. `get_plan_state` - Get full plan state
9. `modify_plan` - Modify plan steps
10. `append_steps` - Add steps to a plan
11. `archive_plan` - Archive a completed plan
12. `import_plan` - Import an existing plan file

**Step Tools (2):**
13. `update_step` - Update a single step
14. `batch_update_steps` - Update multiple steps

**Agent Lifecycle Tools (3):**
15. `initialise_agent` - Initialize an agent session
16. `complete_agent` - Complete an agent session
17. `handoff` - Handoff to another agent

**Agent Validation Tools (9):**
18. `validate_coordinator`
19. `validate_researcher`
20. `validate_architect`
21. `validate_executor`
22. `validate_reviewer`
23. `validate_tester`
24. `validate_revisionist`
25. `validate_archivist`
26. `validate_analyst`

**Agent Management Tools (3):**
27. `list_agents` - List available agents
28. `deploy_agents_to_workspace` - Deploy agents to workspace
29. `get_agent_instructions` - Get agent instructions

**Context Tools (8):**
30. `get_mission_briefing` - Get mission briefing
31. `get_lineage` - Get handoff history
32. `store_initial_context` - Store initial request context
33. `store_context` - Store arbitrary context
34. `get_context` - Retrieve context
35. `list_context` - List context types
36. `append_research` - Add research notes
37. `list_research_notes` - List research files

**Other (2):**
38. `generate_plan_instructions` - Generate .instructions.md
39. `add_plan_note` - Add note to plan

### Target State (5 Tools)

| Consolidated Tool | Actions | Replaces |
|-------------------|---------|----------|
| `memory_workspace` | `register`, `list`, `info`, `reindex` | Tools 1-4 |
| `memory_plan` | `list`, `get`, `create`, `update`, `archive`, `import`, `find`, `add_note` | Tools 5-12, 39 |
| `memory_steps` | `add`, `update`, `batch_update` | Tools 13-14 |
| `memory_agent` | `init`, `complete`, `handoff`, `validate`, `list`, `get_instructions`, `deploy` | Tools 15-29 |
| `memory_context` | `get`, `store`, `list`, `add_research`, `list_research`, `briefing`, `lineage`, `generate_instructions`, `store_initial` | Tools 30-38 |

---

## Phase 1: Add Consolidated MCP Tools ✅ COMPLETE
> Add 5 new tools alongside existing 39 - DO NOT REMOVE YET

### 1.1 Create consolidated tool files
- [x] Create `server/src/tools/consolidated/` directory
- [x] Create `server/src/tools/consolidated/index.ts` - exports all consolidated tools

### 1.2 Create `memory_workspace.ts` ✅
```typescript
action: 'register' | 'list' | 'info' | 'reindex'
workspace_path?: string  // for register
workspace_id?: string    // for info, reindex
```
Routes to:
- `register` → `workspaceTools.registerWorkspace()`
- `list` → `workspaceTools.listWorkspaces()`
- `info` → `workspaceTools.getWorkspaceInfo()` (or get_workspace_plans)
- `reindex` → `workspaceTools.reindexWorkspace()`

### 1.3 Create `memory_plan.ts` ✅
```typescript
action: 'list' | 'get' | 'create' | 'update' | 'archive' | 'import' | 'find' | 'add_note'
workspace_id: string
plan_id?: string
title?: string
description?: string
category?: string
priority?: string
steps?: Step[]
include_archived?: boolean
plan_file_path?: string
note?: string
note_type?: string
```
Routes to:
- `list` → `planTools.listPlans()` / `planTools.getWorkspacePlans()`
- `get` → `planTools.getPlanState()`
- `create` → `planTools.createPlan()`
- `update` → `planTools.modifyPlan()`
- `archive` → `planTools.archivePlan()`
- `import` → `planTools.importPlan()`
- `find` → `planTools.findPlan()`
- `add_note` → `planTools.addPlanNote()`

### 1.4 Create `memory_steps.ts` ✅
```typescript
action: 'add' | 'update' | 'batch_update'
workspace_id: string
plan_id: string
steps?: Step[]           // for add
step_id?: string         // for update
step_index?: number      // for update
status?: StepStatus      // for update
updates?: UpdateItem[]   // for batch_update
```
Routes to:
- `add` → `planTools.appendSteps()`
- `update` → `store.updateStep()`
- `batch_update` → `store.batchUpdateSteps()`

### 1.5 Create `memory_agent.ts` ✅
```typescript
action: 'init' | 'complete' | 'handoff' | 'validate' | 'list' | 'get_instructions' | 'deploy'
workspace_id?: string
plan_id?: string
agent_type?: AgentType
context?: object
summary?: string
artifacts?: string[]
target_agent?: AgentType
reason?: string
agent_name?: string
workspace_path?: string
agents?: string[]
```
Routes to:
- `init` → `handoffTools.initialiseAgent()`
- `complete` → `handoffTools.completeAgent()`
- `handoff` → `handoffTools.handoff()`
- `validate` → `validationTools.validateAgent()` (unified - takes agent_type param)
- `list` → `agentTools.listAgents()`
- `get_instructions` → `agentTools.getAgentInstructions()`
- `deploy` → `agentTools.deployAgentsToWorkspace()`

### 1.6 Create `memory_context.ts` ✅
```typescript
action: 'get' | 'store' | 'list' | 'add_research' | 'list_research' | 'briefing' | 'lineage' | 'generate_instructions' | 'store_initial'
workspace_id: string
plan_id?: string
type?: string
data?: object
content?: string
filename?: string
output_path?: string
```
Routes to:
- `get` → `contextTools.getContext()`
- `store` → `contextTools.storeContext()`
- `list` → `contextTools.listContext()`
- `add_research` → `contextTools.appendResearch()`
- `list_research` → `contextTools.listResearchNotes()`
- `briefing` → `handoffTools.getMissionBriefing()`
- `lineage` → `handoffTools.getLineage()`
- `generate_instructions` → `agentTools.generatePlanInstructions()`
- `store_initial` → `contextTools.storeInitialContext()`

### 1.7 Register in index.ts ✅
- [x] Import consolidated tools
- [x] Register 5 new `memory_*` tools AFTER existing tools
- [x] Keep all 39 existing tools

### 1.8 Build and test MCP server ✅
- [x] `npm run build` succeeds
- [x] Start server and list tools (should show 44 tools: 39 old + 5 new)

---

## Phase 2: Create Testing Agent ✅ COMPLETE
> Create a temporary agent specifically for testing consolidated tools

### 2.1 Create `tool-tester.agent.md` ✅
- [x] Create agent file in `agents/` directory
- [x] Agent purpose: Systematically test each consolidated tool action
- [x] Agent outputs: Test results in structured format

### 2.2 Tool Tester Agent Specification
```markdown
# Tool Tester Agent

You are a specialized testing agent. Your ONLY purpose is to systematically 
test each consolidated MCP tool and verify it works correctly.

## Your Task
For each tool and action, you will:
1. Call the tool with valid parameters
2. Verify the response is successful
3. Report the result (PASS/FAIL + details)

## Test Sequence

### Test 1: memory_workspace
1.1 action:register → workspace_path: current workspace
1.2 action:list → expect list of workspaces
1.3 action:info → workspace_id from 1.1
1.4 action:reindex → workspace_id from 1.1

### Test 2: memory_plan  
2.1 action:create → create test plan "Tool Consolidation Test"
2.2 action:list → verify test plan appears
2.3 action:get → get test plan by ID
2.4 action:find → find test plan by ID only
2.5 action:update → add a test step
2.6 action:add_note → add note to plan
2.7 action:archive → archive test plan
2.8 action:import → (skip if no test file available)

### Test 3: memory_steps
3.1 action:add → add steps to a test plan
3.2 action:update → update step status
3.3 action:batch_update → update multiple steps

### Test 4: memory_agent
4.1 action:init → initialize as ToolTester
4.2 action:validate → validate (expect failure - no ToolTester validator)
4.3 action:list → list available agents
4.4 action:get_instructions → get coordinator instructions
4.5 action:deploy → deploy to test workspace
4.6 action:handoff → handoff to Coordinator
4.7 action:complete → complete session

### Test 5: memory_context
5.1 action:store_initial → store initial context
5.2 action:store → store test context
5.3 action:get → retrieve stored context
5.4 action:list → list context types
5.5 action:add_research → add research note
5.6 action:list_research → list research notes
5.7 action:briefing → get mission briefing
5.8 action:lineage → get lineage
5.9 action:generate_instructions → generate instructions file

## Output Format
After each test, output:
| Test | Tool | Action | Status | Response Summary |
|------|------|--------|--------|------------------|
| 1.1 | memory_workspace | register | PASS/FAIL | ... |

## Completion
When all tests complete, provide summary:
- Total tests: X
- Passed: X
- Failed: X
- Failed tests: [list]
```

### 2.3 Run Tool Tester Agent
- [ ] Deploy `@ToolTester` agent
- [ ] Agent executes all 30+ test cases
- [ ] Collect test results
- [ ] **ALL tests must pass before proceeding to Phase 3**

---

## Phase 3: Verify Test Results
> Review Tool Tester output and confirm all consolidated tools work

### 3.1 Expected Test Results - `memory_workspace`
- [ ] `action: register` with workspace_path
- [ ] `action: list` 
- [ ] `action: info` with workspace_id
- [ ] `action: reindex` with workspace_id

### 2.2 Test `memory_plan`
- [ ] `action: create` with title, description, category, priority
- [ ] `action: list` with workspace_id
- [ ] `action: get` with workspace_id, plan_id
- [ ] `action: find` with plan_id only
- [ ] `action: update` with steps
- [ ] `action: add_note` with note content
- [ ] `action: archive` with plan_id
- [ ] `action: import` with plan_file_path

### 2.3 Test `memory_steps`
- [ ] `action: add` with steps array
- [ ] `action: update` with step_id, status
- [ ] `action: batch_update` with updates array

### 2.4 Test `memory_agent`
- [ ] `action: init` with agent_type, workspace_id, plan_id
- [ ] `action: validate` with agent_type (test each: Coordinator, Executor, etc.)
- [ ] `action: handoff` with target_agent, reason
- [ ] `action: complete` with summary, artifacts
- [ ] `action: list`
- [ ] `action: get_instructions` with agent_name
- [ ] `action: deploy` with workspace_path

### 2.5 Test `memory_context`
- [ ] `action: store_initial` with initial request
- [ ] `action: store` with type, data
- [ ] `action: get` with type
- [ ] `action: list`
- [ ] `action: add_research` with content, filename
- [ ] `action: list_research`
- [ ] `action: briefing` with workspace_id, plan_id
- [ ] `action: lineage` with workspace_id, plan_id
- [ ] `action: generate_instructions` with output_path

---

## Phase 4: Update Agent Files
> Update ALL 10 agent files to use consolidated tools ONLY

### Common replacements for all agents:
| Old Reference | New Reference |
|---------------|---------------|
| `initialise_agent` | `memory_agent` action: `init` |
| `validate_coordinator` | `memory_agent` action: `validate`, agent_type: `Coordinator` |
| `validate_*` | `memory_agent` action: `validate`, agent_type: `*` |
| `get_plan_state` | `memory_plan` action: `get` |
| `handoff` | `memory_agent` action: `handoff` |
| `complete_agent` | `memory_agent` action: `complete` |
| `get_mission_briefing` | `memory_context` action: `briefing` |
| `store_context` | `memory_context` action: `store` |
| `get_context` | `memory_context` action: `get` |
| `append_research` | `memory_context` action: `add_research` |
| `update_step` | `memory_steps` action: `update` |
| `batch_update_steps` | `memory_steps` action: `batch_update` |
| `append_steps` | `memory_steps` action: `add` |
| `modify_plan` | `memory_plan` action: `update` |

### 3.1 Update `coordinator.agent.md`
- [ ] Update tool list section
- [ ] Update all tool call examples
- [ ] Update workflow descriptions

### 3.2 Update `researcher.agent.md`
- [ ] Replace `handoff` → `memory_agent action:handoff`
- [ ] Replace `complete_agent` → `memory_agent action:complete`
- [ ] Update validation references

### 3.3 Update `architect.agent.md`
- [ ] Same replacements as above

### 3.4 Update `executor.agent.md`
- [ ] Same replacements as above
- [ ] Update `update_step` references

### 3.5 Update `reviewer.agent.md`
- [ ] Same replacements as above

### 3.6 Update `revisionist.agent.md`
- [ ] Same replacements as above
- [ ] Update `modify_plan` references

### 3.7 Update `tester.agent.md`
- [ ] Same replacements as above

### 3.8 Update `archivist.agent.md`
- [ ] Same replacements as above
- [ ] Update `archive_plan` → `memory_plan action:archive`

### 3.9 Update `analyst.agent.md`
- [ ] Same replacements as above
- [ ] Already partially updated

### 3.10 Update `brainstorm.agent.md`
- [ ] Review for any tool references (mostly conversational)

---

## Phase 5: Update Instruction Files
> Update all 7 instruction files

### 4.1 Update `mcp-usage.instructions.md`
- [ ] Already partially updated - verify complete
- [ ] Add full action reference for each tool

### 4.2 Update `handoff-protocol.instructions.md`
- [ ] Replace `handoff` → `memory_agent action:handoff`
- [ ] Replace `complete_agent` → `memory_agent action:complete`
- [ ] Update flow diagrams

### 4.3 Update `plan-context.instructions.md`
- [ ] Replace `get_plan_state` → `memory_plan action:get`
- [ ] Replace `store_context` → `memory_context action:store`
- [ ] Replace `mcp_project-memor_*` references

### 4.4 Update `tests.instructions.md`
- [ ] Replace `initialise_agent` → `memory_agent action:init`
- [ ] Replace `handoff` and `complete_agent`

### 4.5 Review remaining instruction files
- [ ] `api.instructions.md` - likely no MCP tool references
- [ ] `components.instructions.md` - likely no MCP tool references
- [ ] `mvc-architecture.instructions.md` - likely no MCP tool references

---

## Phase 6: Update Prompt Files
> Check and update all 6 prompt files

- [ ] **5.1** Review `add-tests.prompt.md`
- [ ] **5.2** Review `code-review.prompt.md`
- [ ] **5.3** Review `document.prompt.md`
- [ ] **5.4** Review `fix-bug.prompt.md`
- [ ] **5.5** Review `new-feature.prompt.md`
- [ ] **5.6** Review `refactor.prompt.md`

---

## Phase 7: VS Code Extension Verification
> Extension already has consolidated tools - verify they work

- [ ] **6.1** Verify `ToolProvider.ts` uses consolidated tool names
- [ ] **6.2** Verify `McpBridge.ts` maps correctly
- [ ] **6.3** Verify `package.json` languageModelTools
- [ ] **6.4** Build extension: `npm run compile`
- [ ] **6.5** Package extension: `npx vsce package`

---

## Phase 8: Dashboard Verification
> Dashboard uses REST API - should be unaffected

- [ ] **7.1** Verify dashboard server still works
- [ ] **7.2** Run dashboard tests: `npm test`
- [ ] **7.3** Manual test: create plan, update steps

---

## Phase 9: Full Integration Test
> Test the complete agent workflow with consolidated tools

### 8.1 Test Coordinator → Researcher → Architect → Executor flow
- [ ] Start with @Coordinator
- [ ] Verify `memory_agent action:init` works
- [ ] Verify `memory_agent action:validate` works
- [ ] Verify subagent spawning works
- [ ] Verify `memory_agent action:handoff` works
- [ ] Verify `memory_agent action:complete` works

### 8.2 Test full plan lifecycle
- [ ] Create plan with `memory_plan action:create`
- [ ] Add steps with `memory_steps action:add`
- [ ] Update steps with `memory_steps action:update`
- [ ] Archive plan with `memory_plan action:archive`

---

## Phase 10: Remove Old Tools
> ONLY after Phase 9 passes completely

### 9.1 Remove old tool registrations from `index.ts`
Remove these 39 tool registrations:
- [ ] `register_workspace`
- [ ] `list_workspaces`
- [ ] `get_workspace_plans`
- [ ] `reindex_workspace`
- [ ] `find_plan`
- [ ] `list_plans`
- [ ] `create_plan`
- [ ] `get_plan_state`
- [ ] `update_step`
- [ ] `batch_update_steps`
- [ ] `modify_plan`
- [ ] `append_steps`
- [ ] `archive_plan`
- [ ] `add_plan_note`
- [ ] `import_plan`
- [ ] `initialise_agent`
- [ ] `complete_agent`
- [ ] `handoff`
- [ ] `get_mission_briefing`
- [ ] `get_lineage`
- [ ] `store_initial_context`
- [ ] `store_context`
- [ ] `get_context`
- [ ] `append_research`
- [ ] `list_context`
- [ ] `list_research_notes`
- [ ] `generate_plan_instructions`
- [ ] `list_agents`
- [ ] `deploy_agents_to_workspace`
- [ ] `get_agent_instructions`
- [ ] `validate_coordinator`
- [ ] `validate_researcher`
- [ ] `validate_architect`
- [ ] `validate_executor`
- [ ] `validate_reviewer`
- [ ] `validate_tester`
- [ ] `validate_revisionist`
- [ ] `validate_archivist`
- [ ] `validate_analyst`

### 10.2 Rebuild and verify
- [ ] `npm run build` succeeds
- [ ] List tools shows only 5 tools
- [ ] Test all 5 consolidated tools still work

---

## Phase 11: Documentation & Cleanup

### 11.1 Delete Testing Agent
- [ ] Delete `agents/tool-tester.agent.md` (temporary agent no longer needed)
- [ ] Remove from any deployed workspaces

### 11.2 Update documentation
- [ ] Update `docs/CHAT_INTEGRATION.md`
- [ ] Update `README.md` if needed
- [ ] Update any other docs referencing old tool names

### 11.3 Final cleanup
- [ ] Update CHANGELOG.md with consolidation notes
- [ ] Bump version: server 2.0.0, extension 0.3.0
- [ ] Remove `index.ts.backup` (keep `C:\Users\User\Project_Memory_MCP\backup`)
- [ ] Final build and package all components

---

## Rollback Plan

If anything breaks:
1. `C:\Users\User\Project_Memory_MCP\backup` has original agent files
2. `server/src/index.ts.backup` has original 39-tool server
3. Git history has all previous versions

---

# Appendix: Complete Tool Mapping Reference

## All 39 Current Tools → 5 Consolidated Tools

| # | Old Tool Name | New Tool | Action | Parameters |
|---|---------------|----------|--------|------------|
| 1 | `register_workspace` | `memory_workspace` | `register` | workspace_path |
| 2 | `list_workspaces` | `memory_workspace` | `list` | - |
| 3 | `get_workspace_plans` | `memory_plan` | `list` | workspace_id |
| 4 | `reindex_workspace` | `memory_workspace` | `reindex` | workspace_id |
| 5 | `find_plan` | `memory_plan` | `find` | plan_id |
| 6 | `list_plans` | `memory_plan` | `list` | workspace_id, include_archived? |
| 7 | `create_plan` | `memory_plan` | `create` | workspace_id, title, description, category, priority |
| 8 | `get_plan_state` | `memory_plan` | `get` | workspace_id, plan_id |
| 9 | `update_step` | `memory_steps` | `update` | workspace_id, plan_id, step_id, status |
| 10 | `batch_update_steps` | `memory_steps` | `batch_update` | workspace_id, plan_id, updates[] |
| 11 | `modify_plan` | `memory_plan` | `update` | workspace_id, plan_id, steps[] |
| 12 | `append_steps` | `memory_steps` | `add` | workspace_id, plan_id, steps[] |
| 13 | `archive_plan` | `memory_plan` | `archive` | workspace_id, plan_id |
| 14 | `add_plan_note` | `memory_plan` | `add_note` | workspace_id, plan_id, note, note_type |
| 15 | `import_plan` | `memory_plan` | `import` | workspace_id, plan_file_path, category |
| 16 | `initialise_agent` | `memory_agent` | `init` | workspace_id, plan_id, agent_type, context? |
| 17 | `complete_agent` | `memory_agent` | `complete` | workspace_id, plan_id, agent_type, summary, artifacts? |
| 18 | `handoff` | `memory_agent` | `handoff` | workspace_id, plan_id, target_agent, reason, summary? |
| 19 | `validate_coordinator` | `memory_agent` | `validate` | workspace_id, plan_id, agent_type: Coordinator |
| 20 | `validate_researcher` | `memory_agent` | `validate` | workspace_id, plan_id, agent_type: Researcher |
| 21 | `validate_architect` | `memory_agent` | `validate` | workspace_id, plan_id, agent_type: Architect |
| 22 | `validate_executor` | `memory_agent` | `validate` | workspace_id, plan_id, agent_type: Executor |
| 23 | `validate_reviewer` | `memory_agent` | `validate` | workspace_id, plan_id, agent_type: Reviewer |
| 24 | `validate_tester` | `memory_agent` | `validate` | workspace_id, plan_id, agent_type: Tester |
| 25 | `validate_revisionist` | `memory_agent` | `validate` | workspace_id, plan_id, agent_type: Revisionist |
| 26 | `validate_archivist` | `memory_agent` | `validate` | workspace_id, plan_id, agent_type: Archivist |
| 27 | `validate_analyst` | `memory_agent` | `validate` | workspace_id, plan_id, agent_type: Analyst |
| 28 | `list_agents` | `memory_agent` | `list` | - |
| 29 | `deploy_agents_to_workspace` | `memory_agent` | `deploy` | workspace_path, agents? |
| 30 | `get_agent_instructions` | `memory_agent` | `get_instructions` | agent_name |
| 31 | `get_mission_briefing` | `memory_context` | `briefing` | workspace_id, plan_id |
| 32 | `get_lineage` | `memory_context` | `lineage` | workspace_id, plan_id |
| 33 | `store_initial_context` | `memory_context` | `store_initial` | workspace_id, plan_id, request, context |
| 34 | `store_context` | `memory_context` | `store` | workspace_id, plan_id, type, data |
| 35 | `get_context` | `memory_context` | `get` | workspace_id, plan_id, type |
| 36 | `list_context` | `memory_context` | `list` | workspace_id, plan_id |
| 37 | `append_research` | `memory_context` | `add_research` | workspace_id, plan_id, content, filename |
| 38 | `list_research_notes` | `memory_context` | `list_research` | workspace_id, plan_id |
| 39 | `generate_plan_instructions` | `memory_context` | `generate_instructions` | workspace_id, plan_id, output_path? |

---

## Files That Need Updates

### MCP Server
| File | Changes |
|------|---------|
| `server/src/tools/consolidated/` | NEW - Create directory and all 5 tool files |
| `server/src/index.ts` | ADD 5 new tool registrations, later REMOVE 39 old ones |

### Agent Files (10 files)
| File | Key Tool References to Update |
|------|-------------------------------|
| `coordinator.agent.md` | init, validate, handoff, complete, get (plan), create (plan) |
| `researcher.agent.md` | init, validate, handoff, complete, get (plan), store (context) |
| `architect.agent.md` | init, validate, handoff, complete, get (plan), update (plan) |
| `executor.agent.md` | init, validate, handoff, complete, update (steps) |
| `reviewer.agent.md` | init, validate, handoff, complete |
| `revisionist.agent.md` | init, validate, handoff, complete, update (plan) |
| `tester.agent.md` | init, validate, handoff, complete |
| `archivist.agent.md` | init, validate, complete, archive (plan) |
| `analyst.agent.md` | init, validate, handoff, complete, briefing |
| `brainstorm.agent.md` | Minimal - mostly conversational |

### Instruction Files (4 files need updates)
| File | Key Tool References |
|------|---------------------|
| `mcp-usage.instructions.md` | All tools - main reference doc |
| `handoff-protocol.instructions.md` | handoff, complete_agent |
| `plan-context.instructions.md` | get_plan_state, store_context |
| `tests.instructions.md` | initialise_agent, handoff, complete_agent |

### Prompt Files (check all 6)
| File | Expected Tool References |
|------|-------------------------|
| `add-tests.prompt.md` | Possibly none |
| `code-review.prompt.md` | Possibly none |
| `document.prompt.md` | Possibly none |
| `fix-bug.prompt.md` | Possibly none |
| `new-feature.prompt.md` | Possibly none |
| `refactor.prompt.md` | Possibly none |

---

## Testing Checklist

### Phase 2: Each Consolidated Tool Action
```
memory_workspace:
  ✓ register  ✓ list  ✓ info  ✓ reindex

memory_plan:
  ✓ list  ✓ get  ✓ create  ✓ update  ✓ archive  ✓ import  ✓ find  ✓ add_note

memory_steps:
  ✓ add  ✓ update  ✓ batch_update

memory_agent:
  ✓ init  ✓ complete  ✓ handoff  ✓ validate  ✓ list  ✓ get_instructions  ✓ deploy

memory_context:
  ✓ get  ✓ store  ✓ list  ✓ add_research  ✓ list_research  ✓ briefing  ✓ lineage  ✓ generate_instructions  ✓ store_initial
```

### Phase 8: Integration Test Scenarios
1. **New Plan Flow**: Coordinator → create plan → add steps → spawn Executor
2. **Execution Flow**: Executor → update steps → handoff → complete
3. **Review Flow**: Reviewer → validate → handoff to Tester
4. **Archive Flow**: Archivist → archive plan → complete

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-02-02 | Initial consolidation (broke system - removed tools without verification) |
| 2.0 | 2026-02-02 | Revised plan - add first, verify, then remove |
