# Implementation Plan: Project Memory MCP Server

## Overview

A local Model Context Protocol (MCP) server that enables structured, multi-agent software development workflows. The server manages isolated state for multiple workspaces and plans, allowing any VS Code instance to connect and leverage behavioral agents for feature development.

---

## 1. Architecture Summary

```
┌─────────────────────────────────────────────────────────────────┐
│                     VS Code Instance A                          │
│  (Workspace: my-web-app)                                        │
│     └── Agent Instructions (.agents/*.md)                       │
└──────────────────────┬──────────────────────────────────────────┘
                       │ MCP Protocol (stdio/SSE)
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Project Memory MCP Server                      │
│  (Runs locally, single instance)                                │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  API Layer (MCP Tools)                                   │   │
│  │  - create_plan, get_plan_state, update_step, etc.       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                           │                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Storage Layer (Disk-Based)                              │   │
│  │  /mbs-data/{workspace_id}/{plan_id}/                    │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                       ▲
                       │ MCP Protocol
┌──────────────────────┴──────────────────────────────────────────┐
│                     VS Code Instance B                          │
│  (Workspace: backend-api)                                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Directory Structure

### MCP Server Root (This Project)
```
/vscode_ModularAgenticProcedureSystem/
├── server/
│   ├── src/
│   │   ├── index.ts              # MCP server entry point
│   │   ├── tools/                # MCP tool implementations
│   │   │   ├── plan.tools.ts     # create_plan, get_plan_state, etc.
│   │   │   ├── context.tools.ts  # store_context, get_context
│   │   │   ├── handoff.tools.ts  # handoff, get_lineage
│   │   │   └── workspace.tools.ts# register_workspace, list_workspaces
│   │   ├── storage/
│   │   │   ├── file-store.ts     # Disk I/O operations
│   │   │   └── schema.ts         # JSON schemas for validation
│   │   └── types/
│   │       └── index.ts          # TypeScript interfaces
│   ├── package.json
│   └── tsconfig.json
│
├── data/                          # All workspace data lives here
│   ├── {workspace_id}/            # Auto-generated folder per workspace
│   │   ├── workspace.meta.json   # Workspace metadata
│   │   └── plans/
│   │       ├── {plan_id}/
│   │       │   ├── state.json    # Master state object
│   │       │   ├── plan.md       # Human-readable checklist
│   │       │   ├── audit_log.json
│   │       │   └── research_notes/
│   │       └── {plan_id_2}/
│   └── {workspace_id_2}/
│
├── agents/                        # Reusable agent instruction files
│   ├── auditor.md
│   ├── researcher.md
│   ├── architect.md
│   ├── executor.md
│   ├── revisionist.md
│   ├── reviewer.md
│   ├── tester.md
│   └── archivist.md
│
├── Initial.DesignDocument.md
├── Second.DesignDocument.md
└── Implementation.Plan.md         # This file
```

---

## 3. MCP Tool Definitions

### 3.1 Workspace Management

| Tool | Parameters | Description |
|------|------------|-------------|
| `register_workspace` | `workspace_path: string` | Registers a workspace, creates folder, returns `workspace_id` |
| `list_workspaces` | — | Returns all registered workspaces |
| `get_workspace_plans` | `workspace_id: string` | Lists all plans for a workspace |

### 3.2 Plan Lifecycle

| Tool | Parameters | Description |
|------|------------|-------------|
| `create_plan` | `workspace_id, title, description, priority?` | Initializes a new plan folder and state.json |
| `get_plan_state` | `workspace_id, plan_id` | Returns full JSON state for agent ingestion |
| `update_step` | `workspace_id, plan_id, step_index, status, notes?` | Updates step status (Pending → Active → Done) |
| `modify_plan` | `workspace_id, plan_id, new_steps[]` | Allows Revisionist to alter the roadmap |
| `archive_plan` | `workspace_id, plan_id` | Moves plan to archived status |

### 3.3 Context Storage

| Tool | Parameters | Description |
|------|------------|-------------|
| `store_context` | `workspace_id, plan_id, type, data` | Saves audit/research data (JSON/text) |
| `get_context` | `workspace_id, plan_id, type` | Retrieves stored context by type |
| `append_research` | `workspace_id, plan_id, filename, content` | Adds a file to research_notes/ |

### 3.4 Agent Lifecycle

| Tool | Parameters | Description |
|------|------------|-------------|
| `initialise_agent` | `workspace_id, plan_id, agent_type, context` | **Required first call by every agent.** Records agent activation with full context snapshot |
| `handoff` | `workspace_id, plan_id, from_agent, to_agent, reason, data?` | Records handoff in lineage, updates current owner |
| `get_mission_briefing` | `workspace_id, plan_id` | Returns lineage, deploying agent, and reason |
| `get_lineage` | `workspace_id, plan_id` | Returns full handoff history |
| `complete_agent` | `workspace_id, plan_id, agent_type, summary, artifacts?` | Marks agent work complete, records output summary |

---

## 4. Data Schemas

### 4.1 state.json (Plan State)
```json
{
  "id": "plan_001",
  "workspace_id": "my-web-app-abc123",
  "title": "Add OAuth Support",
  "description": "Implement Google OAuth login flow",
  "priority": "high",
  "status": "active",
  "current_phase": "implementation",
  "current_agent": "Executor",
  "created_at": "2026-01-30T10:00:00Z",
  "updated_at": "2026-01-30T14:30:00Z",
  "agent_sessions": [
    {
      "session_id": "sess_001",
      "agent_type": "Auditor",
      "started_at": "2026-01-30T10:00:00Z",
      "completed_at": "2026-01-30T10:14:00Z",
      "context": {
        "user_request": "Add OAuth support for Google login",
        "files_in_scope": ["src/auth/", "src/routes/login.ts"],
        "initial_observations": "Existing session-based auth detected"
      },
      "summary": "Mapped auth patterns, identified missing OAuth library",
      "artifacts": ["audit_log.json"]
    },
    {
      "session_id": "sess_002",
      "agent_type": "Researcher",
      "started_at": "2026-01-30T10:15:00Z",
      "completed_at": "2026-01-30T10:45:00Z",
      "context": {
        "deployed_by": "Auditor",
        "reason": "Missing OAuth library documentation",
        "research_targets": ["passport-google-oauth20", "OAuth 2.0 flow"]
      },
      "summary": "Documented OAuth flow, identified passport.js as best fit",
      "artifacts": ["research_notes/oauth-flow.md", "research_notes/passport-setup.md"]
    }
  ],
  "lineage": [
    {
      "timestamp": "2026-01-30T10:00:00Z",
      "from_agent": "User",
      "to_agent": "Auditor",
      "reason": "New feature request"
    },
    {
      "timestamp": "2026-01-30T10:15:00Z",
      "from_agent": "Auditor",
      "to_agent": "Researcher",
      "reason": "Missing OAuth library documentation"
    }
  ],
  "steps": [
    { "index": 0, "phase": "audit", "task": "Map existing auth patterns", "status": "done" },
    { "index": 1, "phase": "research", "task": "Document OAuth 2.0 flow", "status": "done" },
    { "index": 2, "phase": "implementation", "task": "Install dependencies", "status": "active" },
    { "index": 3, "phase": "implementation", "task": "Create OAuth callback route", "status": "pending" }
  ]
}
```

### 4.2 initialise_agent Context Schema
```json
{
  "session_id": "sess_003",
  "agent_type": "Executor",
  "workspace_id": "my-web-app-abc123",
  "plan_id": "plan_001",
  "started_at": "2026-01-30T11:00:00Z",
  "context": {
    "deployed_by": "Architect",
    "reason": "Plan ready for implementation",
    "mission_briefing": "Implement steps 2-5 of the OAuth integration plan",
    "current_step_index": 2,
    "environment": {
      "vscode_workspace": "C:\\Users\\codi.f\\projects\\my-web-app",
      "active_branch": "feature/oauth-support"
    },
    "constraints": ["Do not modify existing auth until OAuth is tested"],
    "success_criteria": ["All steps marked done", "Build passes", "No type errors"]
  }
}
```

### 4.3 workspace.meta.json
```json
{
  "workspace_id": "my-web-app-abc123",
  "path": "C:\\Users\\codi.f\\projects\\my-web-app",
  "name": "my-web-app",
  "registered_at": "2026-01-30T09:00:00Z",
  "last_accessed": "2026-01-30T14:30:00Z",
  "active_plans": ["plan_001", "plan_003"],
  "archived_plans": ["plan_002"]
}
```

---

## 5. Agent Specifications

Each agent MUST call `initialise_agent` as its first action. This records the full context of why the agent was invoked and what information it has access to.

### 5.1 Auditor (State Clarifier)

| Property | Value |
|----------|-------|
| **Trigger** | User submits a new feature request |
| **Deployed By** | User (initial) or Revisionist (re-audit) |
| **Purpose** | Scan the repository to understand existing patterns, dependencies, and logic related to the request |

**Initialise Context Schema:**
```json
{
  "user_request": "string - The original user prompt",
  "target_directories": ["array of paths to scan"],
  "known_technologies": ["detected frameworks/languages"],
  "related_issues": ["any linked tickets or references"]
}
```

**Required Tools:**
- `initialise_agent` - Record activation context
- `filesystem:read_dir` - List directory contents
- `filesystem:read_file` - Read source files
- `store_context` - Save audit findings
- `handoff` - Transfer to Researcher or Architect

**Exit Conditions:**
| Condition | Next Agent |
|-----------|------------|
| Missing external documentation | Researcher |
| Unknown library/API detected | Researcher |
| Sufficient context gathered | Architect |

**Output Artifacts:**
- `audit_log.json` - Structured findings
- Updates `state.json` with `agent_sessions` entry

---

### 5.2 Researcher (Knowledge Gatherer)

| Property | Value |
|----------|-------|
| **Trigger** | Auditor flags missing context or external library requirements |
| **Deployed By** | Auditor |
| **Purpose** | Search documentation, web resources, and internal wikis to fill knowledge gaps |

**Initialise Context Schema:**
```json
{
  "deployed_by": "Auditor",
  "reason": "string - Why research is needed",
  "research_targets": ["specific topics/libraries to research"],
  "questions_to_answer": ["list of specific questions"],
  "known_resources": ["any URLs or docs already identified"]
}
```

**Required Tools:**
- `initialise_agent` - Record activation context
- `web_search:brave_search` - Search the web
- `fetch:get_url` - Retrieve documentation pages
- `append_research` - Save research notes to plan folder
- `handoff` - Transfer to Architect

**Exit Conditions:**
| Condition | Next Agent |
|-----------|------------|
| All questions answered | Architect |
| Research complete | Architect |
| Need more repo context | Auditor (rare) |

**Output Artifacts:**
- `research_notes/*.md` - Individual research documents
- `research_summary.json` - Structured findings

---

### 5.3 Architect (Planner)

| Property | Value |
|----------|-------|
| **Trigger** | Completion of Audit and/or Research phases |
| **Deployed By** | Auditor or Researcher |
| **Purpose** | Synthesize audit and research into a technical roadmap with atomic, verifiable steps |

**Initialise Context Schema:**
```json
{
  "deployed_by": "Auditor|Researcher",
  "reason": "string - Summary of readiness",
  "audit_summary": "string - Key findings from audit",
  "research_summary": "string - Key findings from research",
  "constraints": ["technical/business constraints"],
  "acceptance_criteria": ["how success will be measured"]
}
```

**Required Tools:**
- `initialise_agent` - Record activation context
- `get_context` - Retrieve audit/research data
- `modify_plan` - Define implementation steps
- `store_context` - Save architectural decisions
- `handoff` - Transfer to Executor

**Exit Conditions:**
| Condition | Next Agent |
|-----------|------------|
| Plan created with all steps | Executor |
| Need more research | Researcher |
| Need repo clarification | Auditor |

**Output Artifacts:**
- `plan.md` - Human-readable checklist
- Updates `state.json` with `steps[]` array
- `architecture_decisions.json` - Key decisions and rationale

---

### 5.4 Executor (Implementer)

| Property | Value |
|----------|-------|
| **Trigger** | Architect provides a complete plan |
| **Deployed By** | Architect or Revisionist |
| **Purpose** | Work through checklist items sequentially, writing code and verifying each step |

**Initialise Context Schema:**
```json
{
  "deployed_by": "Architect|Revisionist",
  "reason": "string - Why execution is starting/resuming",
  "current_step_index": "number - Which step to start from",
  "steps_to_complete": ["array of step descriptions"],
  "environment": {
    "working_directory": "path",
    "active_branch": "git branch name",
    "build_command": "npm run build, etc."
  },
  "blockers_to_avoid": ["known issues from previous attempts"]
}
```

**Required Tools:**
- `initialise_agent` - Record activation context
- `get_plan_state` - Get current plan and steps
- `filesystem:write_file` - Create/modify source files
- `terminal:run_command` - Run build/lint commands
- `update_step` - Mark steps as active/done
- `handoff` - Transfer to Reviewer or Revisionist

**Exit Conditions:**
| Condition | Next Agent |
|-----------|------------|
| All steps in phase complete | Reviewer |
| Blocker/error encountered | Revisionist |
| Tests failing | Revisionist |
| Build failing | Revisionist |

**Output Artifacts:**
- Modified source files
- `execution_log.json` - Commands run and results

---

### 5.5 Revisionist (The Pivot)

| Property | Value |
|----------|-------|
| **Trigger** | Executor encounters a blocker or failed test |
| **Deployed By** | Executor |
| **Purpose** | Analyze errors, update the plan to correct course, and reset execution |

**Initialise Context Schema:**
```json
{
  "deployed_by": "Executor",
  "reason": "string - Description of the failure",
  "failed_step_index": "number",
  "error_details": {
    "type": "build_error|test_failure|runtime_error|blocker",
    "message": "string - Error message",
    "stack_trace": "string - If available",
    "attempted_fixes": ["what was already tried"]
  },
  "files_involved": ["paths to relevant files"],
  "original_plan_summary": "string - What was the plan before failure"
}
```

**Required Tools:**
- `initialise_agent` - Record activation context
- `get_plan_state` - Understand current state
- `get_context` - Review audit/research for missed info
- `modify_plan` - Alter steps to fix the issue
- `store_context` - Record the pivot reasoning
- `handoff` - Transfer back to Executor or Auditor

**Exit Conditions:**
| Condition | Next Agent |
|-----------|------------|
| Plan corrected, ready to retry | Executor |
| Need additional research | Researcher |
| Fundamental misunderstanding | Auditor |

**Output Artifacts:**
- Updated `state.json` with modified steps
- `pivot_log.json` - Record of what changed and why

---

### 5.6 Reviewer (Quality Gate)

| Property | Value |
|----------|-------|
| **Trigger** | Executor marks all steps in a phase as complete |
| **Deployed By** | Executor |
| **Purpose** | Perform static analysis, check best practices, and validate changes against requirements |

**Initialise Context Schema:**
```json
{
  "deployed_by": "Executor",
  "reason": "Phase complete, ready for review",
  "completed_steps": ["list of completed step descriptions"],
  "files_changed": ["paths to modified files"],
  "original_requirements": "string - From initial request",
  "acceptance_criteria": ["from Architect's plan"]
}
```

**Required Tools:**
- `initialise_agent` - Record activation context
- `git:get_diff` - See all changes made
- `linter:run` - Check code quality
- `get_context` - Compare against audit findings
- `handoff` - Transfer to Tester or Executor

**Exit Conditions:**
| Condition | Next Agent |
|-----------|------------|
| Review passed | Tester |
| Issues found, fixable | Executor |
| Major problems, need replan | Revisionist |

**Output Artifacts:**
- `review_report.json` - Findings and recommendations
- Updated `state.json` with review status

---

### 5.7 Tester (Verification)

| Property | Value |
|----------|-------|
| **Trigger** | Reviewer approval |
| **Deployed By** | Reviewer |
| **Purpose** | Execute unit, integration, and end-to-end tests |

**Initialise Context Schema:**
```json
{
  "deployed_by": "Reviewer",
  "reason": "Review passed, ready for testing",
  "test_scope": {
    "unit_tests": ["specific test files/patterns"],
    "integration_tests": ["if applicable"],
    "e2e_tests": ["if applicable"]
  },
  "test_commands": ["npm test", "npm run e2e"],
  "coverage_requirements": "minimum coverage if specified",
  "critical_paths": ["user flows that must work"]
}
```

**Required Tools:**
- `initialise_agent` - Record activation context
- `terminal:run_tests` - Execute test suites
- `store_context` - Save test results
- `handoff` - Transfer to Archivist or Executor

**Exit Conditions:**
| Condition | Next Agent |
|-----------|------------|
| All tests pass | Archivist |
| Tests fail | Executor (with details) |
| Test infrastructure broken | Revisionist |

**Output Artifacts:**
- `test_results.json` - Full test output
- Coverage reports (if applicable)

---

### 5.8 Archivist (Completion)

| Property | Value |
|----------|-------|
| **Trigger** | All tests pass |
| **Deployed By** | Tester |
| **Purpose** | Manage git workflow (commit/push/PR) and archive the completed plan |

**Initialise Context Schema:**
```json
{
  "deployed_by": "Tester",
  "reason": "All tests passed, ready for commit",
  "files_to_commit": ["list of changed files"],
  "commit_message_draft": "string - Suggested commit message",
  "target_branch": "main|develop|feature-branch",
  "pr_required": "boolean",
  "documentation_updates": ["files that need doc updates"]
}
```

**Required Tools:**
- `initialise_agent` - Record activation context
- `git:commit` - Create commit
- `git:push` - Push to remote
- `git:create_pr` - Open pull request (if needed)
- `archive_plan` - Mark plan as complete
- `store_context` - Save final documentation

**Exit Conditions:**
| Condition | Next Agent |
|-----------|------------|
| Commit/PR created, plan archived | None (Complete) |
| Git conflict | Executor |
| Push rejected | Revisionist |

**Output Artifacts:**
- Git commit(s)
- Pull request (if applicable)
- `completion_summary.md` - Final documentation
- Plan moved to archived status

---

## 6. Implementation Phases

### Phase 1: Core MCP Server (Week 1) ✅ COMPLETE
- [x] Initialize TypeScript project with MCP SDK
- [x] Implement file-store.ts for disk I/O
- [x] Implement `initialise_agent` tool (critical for context tracking)
- [x] Create workspace management tools
- [x] Create basic plan CRUD tools
- [x] Test with single VS Code instance

### Phase 2: Agent Handoff Protocol (Week 2) ✅ COMPLETE
- [x] Implement handoff tool with lineage tracking
- [x] Implement get_mission_briefing for agent context
- [x] Implement complete_agent for session closure
- [x] Create state machine validation (valid transitions)
- [x] Write agent instruction files (auditor.md, etc.)

### Phase 3: Context & Research Storage (Week 3) ✅ COMPLETE
- [x] Implement store_context / get_context
- [x] Create research_notes directory management
- [x] Add audit_log.json generation
- [x] Implement plan.md generation from steps

### Phase 4: Multi-Instance Testing (Week 4)
- [ ] Test concurrent access from multiple VS Code windows
- [ ] Implement file locking for write operations
- [ ] Add conflict resolution for simultaneous updates
- [ ] Document client-side configuration

---

## 7. VS Code Client Configuration

Each workspace that wants to use the MCP server adds this to their MCP config:

### Option A: Global User Settings (Recommended)
`%APPDATA%\Code\User\settings.json`:
```json
{
  "mcp": {
    "servers": {
      "project-memory": {
        "command": "node",
        "args": ["C:\\Users\\codi.f\\vscode_ModularAgenticProcedureSystem\\server\\dist\\index.js"],
        "env": {
          "MBS_DATA_ROOT": "C:\\Users\\codi.f\\vscode_ModularAgenticProcedureSystem\\data"
        }
      }
    }
  }
}
```

### Option B: Per-Workspace Configuration
`.vscode/mcp.json` in each project:
```json
{
  "servers": {
    "project-memory": {
      "command": "node",
      "args": ["C:\\Users\\codi.f\\vscode_ModularAgenticProcedureSystem\\server\\dist\\index.js"]
    }
  }
}
```

---

## 8. Agent Workflow Example (with initialise_agent)

```
User Request: "Add dark mode toggle to settings page"
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│ 1. AUDITOR                                                      │
│    - Calls: register_workspace(current_workspace_path)          │
│    - Calls: create_plan(workspace_id, "Dark Mode Toggle", ...)  │
│    - Calls: initialise_agent(ws, plan, "Auditor", {             │
│        user_request: "Add dark mode toggle...",                 │
│        target_directories: ["src/components", "src/styles"]     │
│      })                                                         │
│    - Reads: src/components/Settings.tsx, src/styles/theme.ts    │
│    - Calls: store_context(workspace_id, plan_id, "audit", {...})│
│    - Calls: complete_agent(ws, plan, "Auditor", "Found theme...")│
│    - Calls: handoff(ws, plan, "Auditor", "Architect", "Ready")  │
└─────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. ARCHITECT                                                    │
│    - Calls: initialise_agent(ws, plan, "Architect", {           │
│        deployed_by: "Auditor",                                  │
│        audit_summary: "Theme system exists...",                 │
│        acceptance_criteria: ["Toggle persists", "CSS vars used"]│
│      })                                                         │
│    - Calls: get_context(workspace_id, plan_id, "audit")         │
│    - Creates: step-by-step implementation plan                  │
│    - Calls: modify_plan(workspace_id, plan_id, steps[])         │
│    - Calls: complete_agent(ws, plan, "Architect", "5 steps...")│
│    - Calls: handoff(ws, plan, "Architect", "Executor", "Ready") │
└─────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. EXECUTOR                                                     │
│    - Calls: initialise_agent(ws, plan, "Executor", {            │
│        deployed_by: "Architect",                                │
│        current_step_index: 0,                                   │
│        environment: { active_branch: "feature/dark-mode" }      │
│      })                                                         │
│    - Calls: get_plan_state(workspace_id, plan_id)               │
│    - Implements each step, calling update_step() after each     │
│    - Calls: complete_agent(...) when phase done                 │
│    - On error: handoff to Revisionist                           │
│    - On success: handoff to Reviewer                            │
└─────────────────────────────────────────────────────────────────┘
                          │
                          ▼
                    [Reviewer → Tester → Archivist]
                    (Each calls initialise_agent first)
```

---

## 9. Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Workspace ID = hash of path** | Ensures uniqueness even if folder names collide |
| **Disk-based storage (not SQLite)** | Human-readable, git-friendly, easy debugging |
| **Lineage in state.json** | Single source of truth, agents always have context |
| **Agent instructions as .md files** | Portable, version-controlled, LLM-agnostic |
| **Single MCP server instance** | Simplifies file locking, consistent state |
| **initialise_agent as first call** | Ensures every agent session is recorded with full context |
| **agent_sessions[] in state.json** | Complete audit trail of all agent work |

---

## 10. Future Enhancements

- **Dashboard UI**: Web interface to view all workspaces/plans
- **WebSocket notifications**: Real-time updates when plan state changes
- **Plan templates**: Pre-built checklists for common tasks (new feature, bug fix, refactor)
- **Metrics export**: Track agent efficiency, blockers, time-per-phase

---

## 11. Next Steps

1. Initialize the `server/` directory with `npm init` and TypeScript config
2. Install MCP SDK: `@modelcontextprotocol/sdk`
3. Implement `register_workspace` and `create_plan` first
4. Test basic flow with Auditor agent
