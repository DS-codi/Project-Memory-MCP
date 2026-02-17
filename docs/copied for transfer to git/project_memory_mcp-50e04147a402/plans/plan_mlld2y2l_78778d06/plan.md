# Plan Management Tool Actions — Program Linking & Dependencies

**Plan ID:** plan_mlld2y2l_78778d06
**Status:** archived
**Priority:** medium
**Current Phase:** complete
**Current Agent:** None

## Description

Add MCP tool actions for program and plan management: link_to_program, unlink_from_program, set_plan_dependencies, get_plan_dependencies, set_plan_priority, clone_plan, merge_plans. These actions enable agents to programmatically manage plan relationships, dependencies, and metadata without manual JSON editing.

## Progress

- [x] **Research:** [research] Audit existing memory_plan actions and identify gaps in program/plan management capabilities
  - _Audited all memory_plan actions. 22 existing actions identified. Gaps identified for link_to_program, unlink_from_program, set_plan_dependencies, get_plan_dependencies, set_plan_priority, clone_plan, merge_plans._
- [x] **Research:** [research] Review add_plan_to_program implementation to understand current linking logic and circular reference detection
  - _Reviewed add_plan_to_program implementation, circular reference detection (wouldCreateCycle, validatePlanDependencies, hasDependencyPath), upgrade_to_program logic. All patterns documented in plan-management-audit.md._
- [x] **Implementation:** [code] Add link_to_program action — wrapper around add_plan_to_program with better error messages and validation
  - _Added linkToProgram wrapper in plan-programs.ts with enhanced error messages_
- [x] **Implementation:** [code] Add unlink_from_program action — remove plan from program's child_plan_ids and clear plan's parent_program_id
  - _Added unlinkFromProgram in plan-programs.ts with bidirectional update_
- [x] **Implementation:** [code] Add set_plan_dependencies action — set depends_on_plans array with circular dependency validation
  - _Added setPlanDependencies in plan-programs.ts with circular dep validation_
- [x] **Implementation:** [code] Add get_plan_dependencies action — return depends_on_plans and dependents (plans that depend on this one)
  - _Added getPlanDependencies in plan-programs.ts with reverse lookup_
- [x] **Implementation:** [code] Add set_plan_priority action — update priority with validation (low/medium/high/critical)
  - _Added setPlanPriority in plan-goals.ts with validation_
- [x] **Implementation:** [code] Add clone_plan action — deep copy plan with new ID, optionally reset step statuses
  - _Added clonePlan in plan-lifecycle.ts with deep copy and optional step reset_
- [x] **Implementation:** [code] Add merge_plans action — combine steps from multiple plans into one, archive sources optionally
  - _Added mergePlans in plan-lifecycle.ts with optional source archival_
- [x] **Implementation:** [code] Add TypeScript types for all new actions in server/src/types/plan.types.ts
  - _Added types in program.types.ts: UnlinkFromProgramParams, SetPlanDependenciesParams, GetPlanDependenciesParams, GetPlanDependenciesResult, ClonePlanParams, ClonePlanResult, MergePlansParams, MergePlansResult_
- [x] **Integration:** [code] Register all new actions in memory_plan tool handler with proper parameter validation
  - _Registered all 7 new actions in memory_plan handler with Zod schemas, dispatch cases, type unions, and param definitions. Build passes, all 1110 tests pass._
- [x] **Validation:** [test] Write unit tests for link/unlink program actions including edge cases
  - _Created plan-link-unlink.test.ts: 8 tests for linkToProgram (success bidirectional, already-linked error, non-existent program, non-program, self-ref, missing plan, missing fields, no-op same program) + 8 tests for unlinkFromProgram (success bidirectional, savePlanState calls, generatePlanMd calls, event emission, no program_id error, plan missing, orphaned cleanup, missing fields)_
- [x] **Validation:** [test] Write unit tests for dependency management actions including circular detection
  - _Created plan-dependency-mgmt.test.ts: 11 tests for setPlanDependencies (success, save+md, event, circular A→B→A, self-dep, non-existent dep, empty clears, plan not found, missing fields, not array, multiple missing) + 7 tests for getPlanDependencies (depends_on list, reverse lookup, empty deps, no self in dependents, message, plan not found, missing fields)_
- [x] **Validation:** [test] Write unit tests for clone_plan and merge_plans actions
  - _Created plan-clone-merge-priority.test.ts: 11 tests for clonePlan, 9 tests for mergePlans, 8 tests for setPlanPriority. All comprehensive with edge cases._
- [x] **Documentation:** [documentation] Update mcp-tool-plan.instructions.md with new action documentation
  - _Documentation phase confirmed by user request. Updated mcp-tool-plan.instructions.md with all implemented plan-management actions and parameter references._

## Agent Lineage

- **2026-02-13T23:38:40.973Z**: Researcher → Coordinator — _Research complete — all existing memory_plan actions audited, add_plan_to_program implementation documented, circular reference detection analyzed, gaps identified for 7 new actions. Research stored in plan-management-audit.md. Recommend Executor for implementation._
- **2026-02-14T00:42:49.066Z**: Executor → Coordinator — _Steps 2-10 complete. Implemented all 7 new memory_plan actions (link_to_program, unlink_from_program, set_plan_dependencies, get_plan_dependencies, set_plan_priority, clone_plan, merge_plans) with TypeScript types via program.types.ts, handler registration via memory_plan.ts + index.ts. Build passes with zero errors. All 1110 existing tests pass. Ready for build verification and code review."_
- **2026-02-14T00:46:51.208Z**: Reviewer → Coordinator — _Build verification and code review complete. Build passes (zero errors), all 1110 tests pass (zero regressions). All 7 new actions reviewed and APPROVED: link_to_program, unlink_from_program, set_plan_dependencies, get_plan_dependencies, set_plan_priority, clone_plan, merge_plans. All success criteria met. Recommend Tester for Steps 11-13 (unit test writing)._
- **2026-02-14T00:53:31.565Z**: Tester → Coordinator — _Tests written for all 7 new plan actions (Steps 11-13 complete). 55 tests across 3 files covering linkToProgram, unlinkFromProgram, setPlanDependencies, getPlanDependencies, clonePlan, mergePlans, setPlanPriority. Ready for Tester RUN mode._
- **2026-02-14T01:04:56.991Z**: Tester → Coordinator — _All 1177 tests passing across 63 test files. All 67 new tests for the 7 new actions pass. 3 test expectation fixes applied. Recommend Reviewer for final verification._