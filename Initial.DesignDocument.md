Design Document: Modular Behavioral Agent System (MBAS)
1. Goal
To establish a reusable, deterministic multi-agent orchestration layer that treats software development as a series of state-machine transitions. The system manages multiple concurrent feature requests by isolating state within unique Plan IDs managed through a Model Context Protocol (MCP) server.
2. Core Architecture: The "Memory-First" Approach
Unlike standard "Chat" agents, these agents do not rely on long conversation histories. Instead, they interact with a Project Memory MCP Server.
●	State Isolation: Every action is tagged with a plan_id.
●	Stateless Agents: Agents are defined by their behavior and tools, not their memory. They fetch the current state of a plan_id before performing any work.
3. The Behavioral Agents
A. The Auditor (State Clarifier)
●	Trigger: New Feature Request (Prompt).
●	Behavior: Scans the local repository to understand existing patterns, dependencies, and logic related to the request.
●	Tools: filesystem:read_dir, filesystem:read_file.
●	Exit: Generates a state_audit object and initializes a new plan_id via MCP.
B. The Researcher ****
●	Trigger: Auditor flags "Missing Context" or "External Library" requirements.
●	Behavior: Searches documentation, web resources, and internal wikis.
●	Tools: web_search:brave_search, fetch:get_url.
●	Exit: Stores structured research_notes in MCP under the current plan_id.
C. The Architect (Planner)
●	Trigger: Completion of Research/Audit.
●	Behavior: Synthesizes the audit and research into a technical roadmap.
●	Output Format:
○	Metadata: Plan ID, Priority, Dependencies.
○	Phases: Logical groupings of work.
○	Checklist: Atomic, verifiable tasks.
○	References: File paths and URLs.
●	Tools: memory:initialize_plan_doc.
D. The Executor (Implementer)
●	Trigger: Planner provides an active plan_id.
●	Behavior: Works through checklist items sequentially. It writes code, runs local build commands, and verifies syntax.
●	Tools: filesystem:write_file, terminal:run_command, memory:update_step_status.
●	Exit: Hands off to Reviewer on success, or Revisionist on failure.
E. The Revisionist (The Pivot)
●	Trigger: Executor encounters a blocker or failed test that deviates from the plan.
●	
○	Behavior: Analyzes the error, updates the_plan.md to correct the path, and resets the Executor to the corrected step.
●	Tools: memory:modify_plan_structure.
F. The Reviewer
●	Trigger: Executor marks all steps in a phase as "Complete".
●	Behavior: Performs static analysis, checks for best practices, and compares changes against the initial state_audit.
●	Tools: git:get_diff, linter:run.
G. The Tester
●	Trigger: Reviewer approval.
●	Behavior: Executes unit, integration, and end-to-end tests.
●	Tools: terminal:run_tests.
H. The Archivist (Git & Documentation)
●	Trigger: Testing suite passes.
●	Behavior: Manages the git workflow (commit/push/PR) and generates final feature documentation.
●	Tools: git:commit, git:push, memory:archive_plan.
4. MCP Server Definition: "Project Memory"
This server is the backbone of the system. It ensures that multiple plans (e.g., feat-auth-123 and feat-ui-456) can run concurrently without cross-contamination.
API Schema (Endpoints)
Function	Parameters	Description
create_plan	id, title, description	Initializes a new state object.
store_context	id, type, data	Saves research or audit logs (JSON).
update_step	id, step_index, status	Changes status (Pending, Active, Done).
get_plan_state	id	Returns the full JSON of the plan for agent ingestion.
modify_plan	id, new_steps[]	Allows the Revisionist to alter the roadmap.
5. Directory Structure & Reusability
To reuse this setup, the agents are stored as Markdown Instruction Files. This allows you to "prime" any LLM with a specific file to turn it into that agent.
/my-project
  /.mcp/
    config.json          # Points to the Project Memory server
  /.agents/
    auditor.md           # Instructions + Tool definitions
    researcher.md
    architect.md
    ...
  /active_plans/         # Physical storage for the MCP server
    plan_001.json
    plan_002.json

6. Workflow Example (Concurrent)
1.	User: "Add OAuth support (Plan A)" -> Auditor creates plan_A.
2.	User: "Fix CSS in header (Plan B)" -> Auditor creates plan_B.
3.	Planner processes plan_B immediately (small task).
4.	Researcher starts gathering OAuth docs for plan_A.
5.	Executor works on plan_B while Researcher is still active on plan_A.
6.	MCP tracks that plan_B is at Step 2/3 while plan_A is at "Research Phase".
