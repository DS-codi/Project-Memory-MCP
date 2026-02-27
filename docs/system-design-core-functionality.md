# Project Memory MCP — Core Functionality Design Doc

## 1) What this system is (in basic terms)

Project Memory MCP is a planning and memory system for AI-assisted software development.

At a high level, it helps an AI team (or a human + AI workflow) do work in an organized way by:

- creating structured plans,
- breaking work into steps,
- tracking status over time,
- storing context and decisions,
- coordinating specialized agents,
- and preserving all of that across sessions.

The system is local-first and developer-focused. It is designed to run with VS Code, an MCP server, and supporting UI/runtime components.

---

## 2) Core idea: plans are the center of the system

The core design principle is:

**A plan is the primary unit of work.**

Everything else exists to support plan execution:

- workspaces contain plans,
- plans contain steps,
- agents execute and hand off plan steps,
- context stores the reasoning and evidence behind plan decisions,
- and tooling provides visibility and control while plans move from start to completion.

---

## 3) Main objects in the system

### Workspace
A registered project root.

It provides the boundary for:

- plan collection,
- shared context/knowledge,
- execution history,
- and workspace-level metadata.

### Plan
A structured work package.

A plan typically includes:

- title/description/category/priority,
- goals and success criteria,
- ordered steps,
- lifecycle state (active, archived, etc.),
- handoff/session lineage,
- optional build/test scripts,
- optional program linkage (for multi-plan work).

### Integrated Program
A higher-level container for related plans.

Use a program when one request grows into multiple connected workstreams (for example: backend changes, extension changes, and dashboard changes that should be tracked together).

A program typically includes:

- parent program metadata,
- child plans linked under the same umbrella,
- cross-plan dependency visibility,
- and shared progress tracking across all child plans.

### Step
An atomic action item inside a plan.

A step includes:

- phase,
- task description,
- status (`pending`, `active`, `done`, `blocked`),
- optional notes, dependencies, and assignee.

### Context and Knowledge
Persistent supporting information.

- **Plan context**: research, architecture notes, review findings, execution logs.
- **Workspace context**: reusable cross-plan notes and conventions.
- **Knowledge files**: longer-lived reference documents.

### Agent Session
A bounded execution period for an agent role.

Sessions capture:

- what the agent did,
- artifacts touched,
- handoffs,
- and completion summaries.

---

## 4) Core functionality list

## 4.1 Plan lifecycle management

The system can:

- create plans,
- update and reorder steps,
- track progress over time,
- pause/resume or block work,
- and archive completed plans.

This gives users a durable work record instead of one-off chat outputs.

## 4.1b Integrated program management

The system can group multiple plans into a single integrated program.

It supports:

- creating a new program,
- adding existing plans as child plans,
- upgrading a large single plan into a program structure,
- and tracking program-level progress while each child plan keeps its own steps and lifecycle.

This is useful when scope expands beyond what one plan can safely manage.

## 4.2 Step-level execution control

The system supports atomic step updates so progress is explicit.

Typical loop:

1. mark step `active`,
2. perform work,
3. mark step `done` (or `blocked`) with notes.

This makes state transitions auditable and predictable.

## 4.3 Agent orchestration and handoffs

The system supports role-based agent execution (for example: Coordinator, Executor, Reviewer, Tester).

It tracks:

- which agent is active,
- what was handed off,
- why control moved,
- and what should happen next.

This enables multi-agent workflows without losing continuity.

## 4.4 Persistent context memory

The system stores context as first-class data, not temporary chat-only notes.

Benefits:

- future sessions can continue without re-explaining,
- architectural decisions remain discoverable,
- and research/review evidence stays attached to the plan.

## 4.5 Workspace management

The system registers and tracks workspaces so all plan/state operations are scoped correctly.

It supports:

- workspace discovery/listing,
- identity consistency,
- migration and recovery flows,
- and profile/index refresh.

## 4.6 Build/test script integration

Plans can reference repeatable scripts (build, test, package, etc.) so verification is standardized.

This reduces ad-hoc command drift and improves reproducibility.

## 4.7 Operational visibility

Through the dashboard and extension surfaces, users can inspect:

- plan status,
- step progress,
- agent activity,
- and stored context.

This makes long-running work understandable and manageable.

---

## 5) System components (simple view)

### MCP Server
The core backend that executes tool actions and manages plan/workspace/context/agent state.

### VS Code Extension
The developer-facing integration layer that exposes commands/chat workflows and connects VS Code to the MCP server.

### Dashboard
A visual management UI for plans, steps, workspaces, and agent activity.

### Interactive/Supervisory runtimes
Supporting runtime components that manage process control and interactive execution surfaces where configured.

---

## 6) Typical end-to-end flow (plan-centric)

1. Register workspace.
2. Create plan with goals and success criteria.
3. Add or refine plan steps.
4. Agent begins step execution (`active`).
5. Context/research is stored while work progresses.
6. Step is marked `done` or `blocked`.
7. Agent hands off to next role when needed.
8. Build/test scripts run for verification.
9. Plan is completed and archived.

This flow is the core behavior the system is designed to make reliable.

### Program-scale flow (when work gets bigger)

1. Start with one plan.
2. Detect scope growth (more phases/workstreams than one plan should hold).
3. Create or upgrade to an integrated program.
4. Split work into child plans under the program.
5. Execute each child plan through the normal plan/step/agent loop.
6. Track dependencies and aggregate progress at the program level.
7. Close child plans, then close out the overall program.

This keeps large efforts structured without losing step-level clarity.

---

## 7) Why this design matters

Without a plan-centered memory system, AI-assisted development often becomes stateless and inconsistent.

Project Memory MCP addresses that by making work:

- **structured** (plans + steps),
- **persistent** (context + lineage),
- **coordinated** (agent lifecycle + handoff),
- **scalable** (single plans can grow into integrated programs),
- and **verifiable** (scripts + status tracking).

In short: it turns AI coding sessions into an operational workflow that can be resumed, reviewed, and completed with less friction.
