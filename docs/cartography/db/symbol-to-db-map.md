# Symbol-to-DB Map

> **Cartography artifact — Step 12 of Database Cartography plan**
> Bidirectional index: TypeScript code symbols ↔ SQLite database objects.
> Covers interfaces (type layer), repository functions (access layer), and tool handlers (call layer).

---

## 1. TypeScript Interface → Table Mapping

Every row interface in `server/src/db/types.ts` mirrors exactly one active table.

| TypeScript Interface | SQLite Table | DB Module |
|---------------------|-------------|-----------|
| `WorkspaceRow` | `workspaces` | `workspace-db.ts` |
| `ProgramRow` | `programs` | `program-db.ts` |
| `ProgramPlanRow` | `program_plan_links` | `program-workspace-links-db.ts` |
| `ProgramWorkspaceLinkRow` | `program_workspace_links` | `program-workspace-links-db.ts` |
| `ProgramRiskRow` | `program_risks` | `program-risks-db.ts` |
| `PlanRow` | `plans` | `plan-db.ts` |
| `PhaseRow` | `phases` | `phase-db.ts` |
| `StepRow` | `steps` | `step-db.ts` |
| `PlanNoteRow` | `plan_notes` | `plan-note-db.ts` |
| `SessionRow` | `sessions` | `session-db.ts` |
| `LineageRow` | `lineage` | `lineage-db.ts` |
| `ContextItemRow` | `context_items` | `context-db.ts` |
| `ResearchDocumentRow` | `research_documents` | `research-db.ts` |
| `KnowledgeRow` | `knowledge_items` | `knowledge-db.ts` |
| `BuildScriptRow` | `build_scripts` | `build-script-db.ts` |
| `DependencyRow` | `dependencies` | `dependency-db.ts` |
| `ToolRow` | `tool_catalog` | `tool-catalog-db.ts` |
| `ToolActionRow` | `tool_actions` | `tool-catalog-db.ts` |
| `ToolActionParamRow` | `tool_action_params` | `tool-catalog-db.ts` |
| `AgentDefinitionRow` | `agent_definitions` | `agent-definition-db.ts` |
| `DeployableAgentProfileRow` | `deployable_agent_profiles` | `deployable-agent-profile-db.ts` |
| `CategoryWorkflowDefinitionRow` | `category_workflows` | `category-workflow-db.ts` |
| `WorkspaceSessionRegistryRow` | `workspace_session_registry` | `workspace-session-registry-db.ts` |
| `GuiRoutingContractRow` | `gui_routing_contracts` | `gui-routing-contracts-db.ts` |
| `InstructionFileRow` | `instructions` | `instruction-db.ts` |
| `SkillDefinitionRow` | `skills` | `skill-db.ts` |
| `WorkspaceInstructionAssignmentRow` | `workspace_instruction_assignments` | `instruction-deployment-db.ts` |
| `WorkspaceSkillAssignmentRow` | `workspace_skill_assignments` | `skill-deployment-db.ts` |
| `UpdateLogRow` | `workspace_update_logs` | `update-log-db.ts` |
| `EventLogRow` | `agent_event_logs` | `event-log-db.ts` |
| `FileEditRow` | `step_file_edits` | `file-edits-db.ts` |
| `AgentDeploymentRow` | `agent_deployments` | `agent-deployment-db.ts` |
| `InstructionDeploymentRow` | `instruction_deployments` | `instruction-deployment-db.ts` |
| `SkillDeploymentRow` | `skill_deployments` | `skill-deployment-db.ts` |

**Archive types** (extend active row types with `archived_at`):

| TypeScript Interface | SQLite Table |
|---------------------|-------------|
| `PlanArchiveRow` | `plans_archive` |
| `PhaseArchiveRow` | `phases_archive` |
| `StepArchiveRow` | `steps_archive` |
| `SessionArchiveRow` | `sessions_archive` |
| `LineageArchiveRow` | `lineage_archive` |

**Unmapped types** (no direct table correspondence):

| TypeScript Type/Interface | Role |
|--------------------------|------|
| `ContextParentType` | Union literal type — values stored in `context_items.parent_type` column |
| `WorkflowMode` | Union literal type — values stored in `plans` JSON columns |
| `ToolHelp` | Composite query result object (not a row type) |
| `MigrationResult` | Return shape of `runMigrations()` |

---

## 2. Repository Function → SQL Operation

### workspaces (workspace-db.ts)

| Function | SQL Operation | Tables |
|----------|--------------|--------|
| `createWorkspace(path, name)` | INSERT | `workspaces` |
| `getWorkspace(id)` | SELECT WHERE id | `workspaces` |
| `getWorkspaceByPath(path)` | SELECT WHERE path | `workspaces` |
| `listWorkspaces()` | SELECT all | `workspaces` |
| `updateWorkspace(id, fields)` | UPDATE SET by id | `workspaces` |

### plans (plan-db.ts)

| Function | SQL Operation | Tables |
|----------|--------------|--------|
| `createPlan(wsId, data)` | transaction: INSERT plan + INSERT phases + INSERT steps | `plans`, `phases`, `steps` |
| `getPlan(id)` | SELECT WHERE id | `plans` |
| `listPlans(wsId)` | SELECT WHERE workspace_id | `plans` |
| `assemblePlanState(id)` | SELECT plans + JOIN phases + JOIN steps + JOIN sessions + JOIN lineage | `plans`, `phases`, `steps`, `sessions`, `lineage` |
| `updatePlan(id, fields)` | UPDATE SET by id | `plans` |
| `deletePlan(id)` | transaction: DELETE steps, phases, sessions, lineage, context → archive → DELETE plan | `plans`, `phases`, `steps`, `sessions`, `lineage`, `context_items`, `plans_archive` |
| `confirmPhase(id, phaseName)` | UPDATE plans.confirmation_state JSON | `plans` |
| `confirmStep(planId, stepIndex)` | SELECT step + UPDATE plans.confirmation_state JSON | `plans`, `steps` |

### phases (phase-db.ts)

| Function | SQL Operation | Tables |
|----------|--------------|--------|
| `createPhase(planId, name, order)` | INSERT | `phases` |
| `getPhasesForPlan(planId)` | SELECT WHERE plan_id ORDER BY order_index | `phases` |
| `updatePhase(id, fields)` | UPDATE SET | `phases` |
| `deletePhase(id)` | DELETE WHERE id | `phases` |

### steps (step-db.ts)

| Function | SQL Operation | Tables |
|----------|--------------|--------|
| `createStep(phaseId, planId, task, type)` | INSERT | `steps` |
| `getStep(id)` | SELECT WHERE id | `steps` |
| `getStepsForPlan(planId)` | SELECT WHERE plan_id ORDER BY order_index | `steps` |
| `updateStep(id, fields)` | UPDATE SET (status, notes, completed_at, completed_by_agent) | `steps` |
| `deleteStep(id)` | DELETE WHERE id | `steps` |

### sessions (session-db.ts)

| Function | SQL Operation | Tables |
|----------|--------------|--------|
| `createSession(planId, data)` | INSERT + SELECT (return full row) | `sessions` |
| `getSession(id)` | SELECT WHERE id | `sessions` |
| `getSessions(planId)` | SELECT WHERE plan_id ORDER BY started_at DESC | `sessions` |
| `getOrphanedSessions(planId)` | SELECT WHERE plan_id AND is_orphaned=1 | `sessions` |
| `completeSession(id, summary, artifacts)` | UPDATE completed_at, summary, artifacts, is_orphaned=0 | `sessions` |
| `markSessionOrphaned(id)` | UPDATE is_orphaned=1 | `sessions` |
| `deleteSession(id)` | DELETE WHERE id | `sessions` |

### context_items (context-db.ts)

| Function | SQL Operation | Tables |
|----------|--------------|--------|
| `storeContext(parentType, parentId, type, data)` | SELECT (check existing) → INSERT or UPDATE (upsert) | `context_items` |
| `getContext(parentType, parentId, type?)` | SELECT WHERE parent_type + parent_id [+ type] | `context_items` |
| `getContextItem(id)` | SELECT WHERE id | `context_items` |
| `deleteContext(parentType, parentId, type)` | DELETE WHERE parent_type + parent_id + type | `context_items` |
| `pruneContextLogs(parentType, parentId, typePrefix, keepCount)` | SELECT ORDER BY created_at DESC → DELETE excess rows | `context_items` |

### lineage (lineage-db.ts)

| Function | SQL Operation | Tables |
|----------|--------------|--------|
| `recordHandoff(planId, fromAgent, toAgent, reason, data)` | INSERT | `lineage` |
| `getLineageForPlan(planId)` | SELECT WHERE plan_id ORDER BY timestamp | `lineage` |

### dependencies (dependency-db.ts)

| Function | SQL Operation | Tables |
|----------|--------------|--------|
| `addStepDependency(sourceId, targetId, depType)` | INSERT | `dependencies` |
| `getStepDependencies(stepId)` | SELECT WHERE source_id | `dependencies` |
| `getDependents(stepId)` | SELECT WHERE target_id | `dependencies` |
| `removeStepDependency(sourceId, targetId)` | DELETE WHERE source_id + target_id | `dependencies` |

### research_documents (research-db.ts)

| Function | SQL Operation | Tables |
|----------|--------------|--------|
| `appendResearch(wsId, parentType, parentId, filename, content)` | INSERT OR REPLACE | `research_documents` |
| `appendPlanResearch(planId, wsId, filename, content)` | INSERT OR REPLACE | `research_documents` |
| `getResearch(wsId, parentType, parentId)` | SELECT WHERE workspace_id + parent_type + parent_id | `research_documents` |
| `getResearchByWorkspace(wsId)` | SELECT WHERE workspace_id | `research_documents` |
| `deleteResearch(id)` | DELETE WHERE id | `research_documents` |

### knowledge_items (knowledge-db.ts)

| Function | SQL Operation | Tables |
|----------|--------------|--------|
| `createKnowledge(wsId, slug, title, data)` | INSERT | `knowledge_items` |
| `getKnowledge(wsId, slug)` | SELECT WHERE workspace_id + slug | `knowledge_items` |
| `listKnowledge(wsId, category?)` | SELECT WHERE workspace_id [+ category] | `knowledge_items` |
| `updateKnowledge(id, fields)` | UPDATE SET | `knowledge_items` |
| `deleteKnowledge(id)` | DELETE WHERE id | `knowledge_items` |

---

## 3. DB Table → TypeScript Surface (Reverse Map)

For each key table: which TS type, which repo functions, which tool handlers.

### `workspaces`

| Layer | Symbols |
|-------|---------|
| **Row type** | `WorkspaceRow` |
| **Repository** | `createWorkspace`, `getWorkspace`, `getWorkspaceByPath`, `listWorkspaces`, `updateWorkspace` |
| **Tool handlers** | `workspace.tools.ts`, `consolidated/memory_workspace.ts`, `handoff.tools.ts` (workspace validation) |
| **Inbound FKs** | 15 tables reference `workspaces.id` — see `graph-adjacency.md` |

### `plans`

| Layer | Symbols |
|-------|---------|
| **Row type** | `PlanRow`, `PlanArchiveRow` |
| **Repository** | `createPlan`, `getPlan`, `listPlans`, `assemblePlanState`, `updatePlan`, `deletePlan`, `confirmPhase`, `confirmStep` |
| **Tool handlers** | `plan/plan-lifecycle.ts`, `plan/plan-goals.ts`, `plan/plan-confirmation.ts`, `consolidated/memory_plan.ts` |
| **Inbound FKs** | 10 tables reference `plans.id` |

### `steps`

| Layer | Symbols |
|-------|---------|
| **Row type** | `StepRow`, `StepArchiveRow` |
| **Repository** | `createStep`, `getStep`, `getStepsForPlan`, `updateStep`, `deleteStep` |
| **Tool handlers** | `plan/plan-steps.ts`, `plan/plan-step-mutations.ts`, `plan/plan-step-ordering.ts`, `consolidated/memory_steps.ts` |

### `context_items`

| Layer | Symbols |
|-------|---------|
| **Row type** | `ContextItemRow` |
| **Parent type discriminant** | `ContextParentType = 'workspace' \| 'plan' \| 'phase' \| 'step'` |
| **Repository** | `storeContext`, `getContext`, `getContextItem`, `deleteContext`, `pruneContextLogs` |
| **Tool handlers** | `context.tools.ts`, `context-pull.tools.ts`, `context-search.tools.ts`, `workspace-context.tools.ts`, `consolidated/memory_context.ts` |

### `sessions`

| Layer | Symbols |
|-------|---------|
| **Row type** | `SessionRow`, `SessionArchiveRow` |
| **Repository** | `createSession`, `getSession`, `getSessions`, `getOrphanedSessions`, `completeSession`, `markSessionOrphaned`, `deleteSession` |
| **Tool handlers** | `agent.tools.ts`, `handoff.tools.ts`, `session-live-store.ts`, `consolidated/memory_agent.ts`, `consolidated/memory_session.ts` |

### `lineage`

| Layer | Symbols |
|-------|---------|
| **Row type** | `LineageRow`, `LineageArchiveRow` |
| **Repository** | `recordHandoff`, `getLineageForPlan` |
| **Tool handlers** | `handoff.tools.ts`, `agent.tools.ts` |

### `agent_definitions`

| Layer | Symbols |
|-------|---------|
| **Row type** | `AgentDefinitionRow` |
| **Repository** | `createAgentDefinition`, `getAgentDefinition`, `listAgentDefinitions`, `updateAgentDefinition`, `deleteAgentDefinition` |
| **Tool handlers** | `agent.tools.ts`, `agent-materialise.ts`, `agent-validation.tools.ts`, `consolidated/memory_agent.ts` |

### `skills`

| Layer | Symbols |
|-------|---------|
| **Row type** | `SkillDefinitionRow` |
| **Repository** | `createSkill`, `getSkill`, `getSkillByName`, `listSkills`, `updateSkill`, `deleteSkill` |
| **Tool handlers** | `skills.tools.ts`, `skill-phase-matcher.ts`, `skill-registry.ts` |

### `instructions`

| Layer | Symbols |
|-------|---------|
| **Row type** | `InstructionFileRow` |
| **Repository** | `createInstruction`, `getInstruction`, `getInstructionByFilename`, `listInstructions`, `updateInstruction`, `deleteInstruction` |
| **Tool handlers** | `agent.tools.ts` (instruction-related actions), `consolidated/memory_agent.ts` |

### `dependencies`

| Layer | Symbols |
|-------|---------|
| **Row type** | `DependencyRow` |
| **Repository** | `addStepDependency`, `getStepDependencies`, `getDependents`, `removeStepDependency` |
| **Tool handlers** | `plan/plan-step-mutations.ts` |

### `gui_routing_contracts`

| Layer | Symbols |
|-------|---------|
| **Row type** | `GuiRoutingContractRow` |
| **Repository** | `createRoutingContract`, `getRoutingContract`, `getPendingContracts`, `resolveContract`, `deleteContract` |
| **Tool handlers** | `consolidated/memory_brainstorm.ts`, GUI launch orchestration |

---

## 4. JSON Column → Embedded Data Structure

Several columns store JSON blobs. This table maps column path → expected TypeScript shape.

| Table | Column | Embedded Shape |
|-------|--------|---------------|
| `plans` | `goals` | `string[]` |
| `plans` | `success_criteria` | `string[]` |
| `plans` | `categorization` | `CategorizationResult \| null` |
| `plans` | `deployment_context` | `DeploymentContext \| null` |
| `plans` | `confirmation_state` | `ConfirmationState \| null` |
| `plans` | `paused_at_snapshot` | `PausedAtSnapshot \| null` |
| `context_items` | `data` | Arbitrary JSON (plan context, research, architecture) |
| `sessions` | `artifacts` | `string[]` file paths |
| `sessions` | `context` | `{ deployed_by, reason, current_step_index, ... }` |
| `lineage` | `data` | `{ recommendation, steps_completed, files_modified, ... }` |
| `workspaces` | `profile` | `{ languages, frameworks, package_manager, ... }` |
| `workspaces` | `meta` | Arbitrary workspace metadata |
| `research_documents` | `content` | The research text (stored verbatim, not JSON) |
| `knowledge_items` | `data` | Arbitrary knowledge JSON |
| `knowledge_items` | `tags` | `string[]` |
| `agent_definitions` | `allowed_tools` | `string[]` of `"tool:action"` patterns |
| `agent_definitions` | `blocked_tools` | `string[]` of `"tool:action"` patterns |
| `agent_definitions` | `required_context_keys` | `string[]` |
| `agent_definitions` | `checkpoint_triggers` | `CheckpointTriggerConfig` |
| `agent_definitions` | `metadata` | Arbitrary agent metadata |
| `gui_routing_contracts` | `trigger_criteria` | `TriggerCriteria` |
| `gui_routing_contracts` | `invocation_params_schema` | JSON Schema object |
| `gui_routing_contracts` | `response_schema` | Expected response envelope |
| `gui_routing_contracts` | `feedback_paths` | `{ approve: [...], reject: [...], ... }` |
| `workspace_session_registry` | `step_indices_claimed` | `number[]` |
| `workspace_session_registry` | `files_in_scope` | `string[]` absolute file paths |
| `program_risks` | `affected_plan_ids` | `string[]` |
| `programs` | `goals` | `string[]` |
| `programs` | `success_criteria` | `string[]` |
| `dependencies` | *(no JSON columns)* | — |

---

## 5. Key Type Aliases and Union Types

| Symbol | Definition | Used In |
|--------|-----------|---------|
| `ContextParentType` | `'workspace' \| 'plan' \| 'phase' \| 'step'` | `context_items.parent_type`, `research_documents.parent_type` |
| `WorkflowMode` | `'standard' \| 'tdd' \| 'enrichment' \| 'overnight'` | `plans` (stored in categorization JSON) |
| `PlanStatus` | `'active' \| 'completed' \| 'archived' \| 'paused' \| 'blocked'` | `plans.status` |
| `PlanCategory` | `'feature' \| 'bugfix' \| 'refactor' \| 'orchestration' \| 'quick_task' \| 'advisory'` | `plans.category` |
| `PlanPriority` | `'low' \| 'medium' \| 'high' \| 'critical'` | `plans.priority`, `programs.priority` |
| `DependencyType` | `'blocks' \| 'informs'` | `dependencies.dep_type` |
| `DependencyStatus` | `'pending' \| 'satisfied'` | `dependencies.dep_status` |
| `SyncStatus` | `'synced' \| 'outdated' \| 'customized' \| 'missing'` | `*_deployments.sync_status` |

---

*Generated by Database Cartography Executor agent — plan plan_mm9b56x6_551d976d*
