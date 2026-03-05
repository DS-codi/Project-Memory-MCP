# DB Relation Graph — Adjacency View

**Source:** Migration files 001–009 | FK edge analysis from step4_constraints  
**Date:** 2026-03-05 | **Total FK edges:** 34 | **Self-referential:** 1

---

## Nodes (35 active domain tables + 1 tracking + 5 archive = 41 total)

### Active Domain Tables (35)
```
workspaces               programs                 plans
program_plans            program_workspace_links  program_risks
phases                   steps                    plan_notes
sessions                 lineage                  context_items
research_documents       knowledge                build_scripts
dependencies             tools                    tool_actions
tool_action_params       agent_definitions        instruction_files
skill_definitions        update_log               event_log
step_file_edits          agent_deployments        instruction_deployments
skill_deployments        workspace_session_registry  gui_routing_contracts
deployable_agent_profiles  category_workflow_definitions
workspace_instruction_assignments  workspace_skill_assignments
plan_workflow_settings
```

### Tracking Table (1)
```
_migrations
```

### Archive Tables (5, no FK constraints)
```
plans_archive  phases_archive  steps_archive  sessions_archive  lineage_archive
```

---

## Adjacency List

> Format: `table → [target_table (via column, ON DELETE action)]`  
> NULLABLE marker = FK column is nullable (allows orphan rows)

### workspaces
```
workspaces → [workspaces (via parent_workspace_id, SET NULL) ⟲ SELF-REF NULLABLE]
```

### programs
```
programs → [workspaces (via workspace_id, CASCADE)]
```

### plans
```
plans → [
  workspaces (via workspace_id, CASCADE),
  programs   (via program_id, SET NULL) NULLABLE
]
```

### program_plans
```
program_plans → [
  programs (via program_id, CASCADE),
  plans    (via plan_id, CASCADE)
]
```

### program_workspace_links
```
program_workspace_links → [
  programs   (via program_id, CASCADE),
  workspaces (via workspace_id, CASCADE)
]
```

### program_risks
```
program_risks → [programs (via program_id, CASCADE)]
```

### phases
```
phases → [plans (via plan_id, CASCADE)]
```

### steps
```
steps → [
  phases (via phase_id, CASCADE),
  plans  (via plan_id, CASCADE)
]
```

### plan_notes
```
plan_notes → [plans (via plan_id, CASCADE)]
```

### sessions
```
sessions → [plans (via plan_id, CASCADE)]
```

### lineage
```
lineage → [plans (via plan_id, CASCADE)]
```

### context_items
```
context_items → [] (polymorphic: parent_type/parent_id — no FK constraint)
```

### research_documents
```
research_documents → [workspaces (via workspace_id, CASCADE)]
```

### knowledge
```
knowledge → [workspaces (via workspace_id, CASCADE)]
```

### build_scripts
```
build_scripts → [
  workspaces (via workspace_id, CASCADE),
  plans      (via plan_id, SET NULL) NULLABLE
]
```

### dependencies
```
dependencies → [] (polymorphic: source_type/source_id, target_type/target_id — CHECK constraint only)
```

### tools
```
tools → [] (root node)
```

### tool_actions
```
tool_actions → [tools (via tool_id, CASCADE)]
```

### tool_action_params
```
tool_action_params → [tool_actions (via action_id, CASCADE)]
```

### agent_definitions
```
agent_definitions → [] (root node)
```

### instruction_files
```
instruction_files → [] (root node)
```

### skill_definitions
```
skill_definitions → [] (root node)
```

### update_log
```
update_log → [workspaces (via workspace_id, CASCADE)]
```

### event_log
```
event_log → [] (root node)
```

### step_file_edits
```
step_file_edits → [
  workspaces (via workspace_id, CASCADE),
  plans      (via plan_id, CASCADE),
  steps      (via step_id, SET NULL) NULLABLE
]
```

### agent_deployments
```
agent_deployments → [workspaces (via workspace_id, CASCADE)]
```

### instruction_deployments
```
instruction_deployments → [workspaces (via workspace_id, CASCADE)]
```

### skill_deployments
```
skill_deployments → [workspaces (via workspace_id, CASCADE)]
```

### workspace_session_registry
```
workspace_session_registry → [
  workspaces (via workspace_id, CASCADE),
  plans      (via plan_id, SET NULL) NULLABLE
]
```

### gui_routing_contracts
```
gui_routing_contracts → [] (root node)
```

### deployable_agent_profiles
```
deployable_agent_profiles → [agent_definitions (via agent_name, CASCADE)]
```

### category_workflow_definitions
```
category_workflow_definitions → [
  deployable_agent_profiles (via hub_agent_name, SET NULL) NULLABLE,
  deployable_agent_profiles (via prompt_analyst_agent_name, SET NULL) NULLABLE
]
```

### workspace_instruction_assignments
```
workspace_instruction_assignments → [workspaces (via workspace_id, CASCADE)]
```

### workspace_skill_assignments
```
workspace_skill_assignments → [workspaces (via workspace_id, CASCADE)]
```

### plan_workflow_settings
```
plan_workflow_settings → [plans (via plan_id, CASCADE)]
```

---

## High-Centrality Analysis

### By Inbound FK Count (hubs other tables depend on)

| Rank | Table | Inbound FKs | Dependent Tables |
|------|-------|-------------|-----------------|
| 1 | **workspaces** | 15 | programs, plans, program_workspace_links, research_documents, knowledge, build_scripts, update_log, step_file_edits, agent_deployments, instruction_deployments, skill_deployments, workspace_session_registry, workspace_instruction_assignments, workspace_skill_assignments, workspaces (self) |
| 2 | **plans** | 10 | phases, steps, plan_notes, sessions, lineage, build_scripts, step_file_edits, workspace_session_registry, plan_workflow_settings, program_plans |
| 3 | **programs** | 4 | plans, program_plans, program_workspace_links, program_risks |
| 4 | **deployable_agent_profiles** | 2 | category_workflow_definitions (×2: hub_agent_name, prompt_analyst_agent_name) |
| 5 | **phases** | 1 | steps |
| 5 | **steps** | 1 | step_file_edits |
| 5 | **tools** | 1 | tool_actions |
| 5 | **tool_actions** | 1 | tool_action_params |
| 5 | **agent_definitions** | 1 | deployable_agent_profiles |

### By Outbound FK Count (tables with many dependencies)

| Rank | Table | Outbound FKs | Targets |
|------|-------|--------------|---------|
| 1 | **step_file_edits** | 3 | workspaces, plans, steps |
| 2 | **plans** | 2 | workspaces, programs |
| 2 | **program_plans** | 2 | programs, plans |
| 2 | **program_workspace_links** | 2 | programs, workspaces |
| 2 | **steps** | 2 | phases, plans |
| 2 | **build_scripts** | 2 | workspaces, plans |
| 2 | **workspace_session_registry** | 2 | workspaces, plans |
| 2 | **category_workflow_definitions** | 2 | deployable_agent_profiles (×2) |

---

## Impact Hubs

### `workspaces` — 15 inbound FKs

The root anchor of the entire graph. Every workspace-scoped entity carries a `workspace_id` FK pointing here. On `DELETE CASCADE`, deleting a workspace removes:
- All programs, plans, program_workspace_links
- All research_documents, knowledge entries, build_scripts
- All update_log entries, step_file_edits
- All agent_deployments, instruction_deployments, skill_deployments
- All workspace_session_registry entries
- All workspace_instruction_assignments, workspace_skill_assignments

**Risk:** Workspace deletion is a full cascade. No soft-delete or archive pattern exists for workspaces.  
**Self-reference:** `parent_workspace_id` allows workspace hierarchies (nullable, SET NULL on parent delete).

---

### `plans` — 10 inbound FKs

The primary unit of work. All plan content (phases, steps, sessions, lineage, notes, file edits) cascades off plans.

On `DELETE CASCADE`, deleting a plan removes:
- All phases (and transitively all steps via phases.plan_id chain)
- All plan_notes, sessions, lineage
- All step_file_edits for that plan
- workspace_session_registry entries (SET NULL on plan_id)
- build_scripts (SET NULL on plan_id — script persists without plan link)
- plan_workflow_settings

**Note:** `program_plans` also records plan→program membership; its `plan_id` FK cascades, so program membership records are auto-cleaned.

---

### `programs` — 4 inbound FKs

Mid-tier hub for program-scoped entities. Deleting a program:
- Removes program_plans, program_workspace_links, program_risks
- Sets `plans.program_id = NULL` (SET NULL) — plans survive, unlinked

---

### `deployable_agent_profiles` — 2 inbound FKs

Hub for workflow definitions. Both `hub_agent_name` and `prompt_analyst_agent_name` in `category_workflow_definitions` point here with SET NULL — workflow definitions survive profile deletion but lose agent references.
