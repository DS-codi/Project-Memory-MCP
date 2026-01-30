Design Document: Modular Behavioral Agent System (MBAS)
1. Goal
To establish a reusable, deterministic multi-agent orchestration layer that treats software development as a series of state-machine transitions. The system manages multiple concurrent feature requests by isolating state within unique Plan IDs managed through a local MCP server.
2. Core Architecture: The "Memory-First" Approach
State Isolation: Every action is tagged with a plan_id.
Local Persistence: All plan data, checklists, and research notes are stored as physical files on the host machine.
Lineage Protocol: Every agent handoff is recorded. When an agent starts, it must query the MCP for its "Mission Briefing," which includes the identity of the deploying agent and the reason for handoff.
3. The Behavioral Agents (Updated)
Agent       | Trigger       | Deployment Awareness            |  Primary Task
Auditor     | User Prompt   | Deployed by: User               | Maps repository state to the request.
Researcher  | Missing Info  | Deployed by: Auditor            | Fetches external/internal docs.
Architect   | Data Ready    | Deployed by: Auditor/Researcher | Creates plan.md in the plan directory.
Executor    | Plan Created  | Deployed by: Architect          | Implements changes and updates checklist.
Revisionist | Error/Blocker | Deployed by: Executor           | Pivots the plan to solve obstacles.
Reviewer    | Work Finished | Deployed by: Executor           | Validates diffs against requirements.
Tester      | Rev. Passed   | Deployed by: Reviewer           | Runs test suites.
Archivist   | Tests Passed  | Deployed by: Tester             | Commits code and archives the plan.

4. MCP Server: "Project Memory" (Local)
This server runs on your local machine and acts as the "Disk-Based Source of Truth."
File Structure on Disk:
/mbs-root/
  /active_plans/
    /{plan_id}/
      state.json        # The master state (Metadata, Lineage, Current Agent)
      plan.md           # The human-readable checklist and roadmap
      research_notes/   # Directory for researcher output
      audit_log.json    # Initial repository analysis


5. Agent Handoff Protocol
When Agent A finishes its task, it calls: handoff(target_agent, reason, data)
The MCP Server then:
Updates state.json -> last_agent: "Agent A".
Appends to lineage: "Agent A deployed Agent B because [reason]".
Moves the "Current Owner" status to Agent B.
When Agent B is initialized, it reads the lineage to understand its context.
