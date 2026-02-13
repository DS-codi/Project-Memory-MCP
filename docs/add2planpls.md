---
name: Plan for added spawn tool, dedicated thinking agent (idk what else to call it)
description: Implements strict gatekeeping for subagent spawning, creates a dedicated 'Cognition' agent, and adds interactive MCP Apps for UI control.
---
plan:
  - step: Define the '@Cognition' Agent
    description: Create the definition file for the dedicated thinking agent.
    file: agents/Cognition.agent.md

  - step: Update 'memory_agent' Tool Logic
    description: Modify the MCP server to handle the 'spawn' action with strict validation.
    file: server/src/tools/consolidated/memory_agent.ts

  - step: Enforce Hub Restrictions
    description: Update the Coordinator's system prompt to force tool usage for delegation.
    file: agents/Coordinator.agent.md

  - step: System Access Injection
    description: Ensure the spawn tool injects the full workspace context into the subagent.

  - step: Implement MCP Apps (UI Layer)
    description: Create interactive UI components for Plans, Handoffs, and Context selection.
    file: vscode-extension/src/mcp-apps/

# Feature Implementation Guide: Strict Subagent Spawning & UI

This guide details how to modify **Project Memory MCP** to enforce a strict Hub-and-Spoke model. The Hub (Coordinator) will be restricted from "hallucinating" helpers and must use a specific tool to spawn validated subagents. Additionally, it upgrades the user experience from text-based JSON to interactive **MCP Apps**.

## 1. Create the Dedicated Thinking Agent (`@Cognition`)

We need a specific agent for "pure thought" so the Coordinator doesn't try to invent one (e.g., "LogicBot").

**File:** `agents/Cognition.agent.md`

```markdown
---
name: Cognition
description: A pure reasoning agent for analyzing complex problems, architectural trade-offs, and logic puzzles.
tools:
  - memory_plan (read-only)
  - memory_context (read-only)
  - memory_steps (read-only)
handoffs:
  - Coordinator (return results)
---

# Identity
You are the **Cognition** agent. You do NOT write code, execute terminal commands, or edit files.
Your sole purpose is **Deep Reasoning** and **Option Analysis**.

# Capabilities
1. **Analyze:** Read plans and context to understand the current state.
2. **Ideate:** Generate multiple approaches to a problem (e.g., "Option A vs Option B").
3. **Critique:** finding potential flaws, security risks, or edge cases in a proposed design.

# Rules
- **READ-ONLY:** You cannot change the plan or file system.
- **OUTPUT:** Your output must be structured as a clear analysis or set of recommendations.
- **HANDOFF:** When your analysis is complete, you MUST explicitly hand off back to the `@Coordinator` with your summary.
```

## 2. Update `memory_agent` Tool Logic

We will add a `spawn` action that acts as a **Gatekeeper**. It validates the requested agent against the file system and runs it.

**File:** `server/src/tools/consolidated/memory_agent.ts`

### A. Update Tool Schema

Ensure the Zod schema for `memory_agent` includes the new action and parameters.

```typescript
const MemoryAgentSchema = z.object({
  action: z.enum(['init', 'complete', 'handoff', 'validate', 'list', 'spawn']), // Added 'spawn'
  agent_name: z.string().optional(),     // The strict enum target (e.g., "Cognition")
  task_context: z.string().optional(),   // The specific question/task for the subagent
  // ... existing params
});
```

### B. Implement `handleSpawn` Logic

This function performs the "Agent-as-a-Tool" logic: validation, instantiation, execution, and context injection.

```typescript
import { listAgentFiles } from '../../utils/agent-loader';
// Import your internal Agent class/runner
import { AgentRunner } from '../../agent/runner'; 

async function handleSpawn(args: AgentArgs, dependencies: ToolDependencies) {
  const { agent_name, task_context, plan_id } = args;

  // 1. STRICT REGISTRY CHECK (The Gatekeeper)
  // ---------------------------------------------------------
  const validAgents = listAgentFiles(process.env.MBS_AGENTS_ROOT);
  if (!validAgents.includes(agent_name)) {
    throw new Error(
      `⛔ SPAWN REJECTED: '${agent_name}' is not a valid agent.\n` +
      `Available agents: ${validAgents.join(', ')}`
    );
  }

  // 2. CONTEXT INJECTION (Access to the Greater System)
  // ---------------------------------------------------------
  // Fetch current state to "hydrate" the subagent
  const workspaceState = await dependencies.workspaceService.getProfile();
  const currentPlan = plan_id ? await dependencies.planService.get(plan_id) : null;

  const systemContext = {
    workspace_root: workspaceState.path,
    active_plan: currentPlan,
    // Pass the capability to call tools back to the runner
    tools: dependencies.allTools 
  };

  // 3. SERVER-SIDE EXECUTION
  // ---------------------------------------------------------
  // Instantiate the subagent loop. This blocks until the subagent finishes.
  const runner = new AgentRunner({
    agentName: agent_name,
    systemContext: systemContext,
    permissions: ['read', 'write'] // Define capabilities based on agent type
  });

  const result = await runner.execute({
    task: task_context
  });

  // 4. RETURN RESULT TO HUB
  // ---------------------------------------------------------
  return {
    content: [
      {
        type: "text",
        text: `✅ **@${agent_name} Task Complete**\n\n${result.summary}`
      }
    ]
  };
}
```

## 3. Enforce Hub Restrictions

Update the Coordinator to ensure it knows it *cannot* do the work itself and *must* use the tool.

**File:** `agents/Coordinator.agent.md`

```markdown
# Constraint: Strict Delegation Protocol
You are the **Hub**. You orchestrate; you do not execute.

## How to Delegate
1. **Identify the Need:**
   - Need Code? -> `@Executor`
   - Need Research? -> `@Researcher`
   - Need Plans? -> `@Architect`
   - Need **Thinking/Reasoning**? -> **`@Cognition`** (DO NOT simulate thinking yourself)

2. **Execute the Spawn:**
   You MUST use the `memory_agent` tool with `action='spawn'`.
   
   ❌ **BAD:** "I will now think about the database schema..."
   ✅ **GOOD:** Call `memory_agent(action='spawn', agent_name='Cognition', task_context='Evaluate SQL vs NoSQL for this schema')`

## Forbidden Actions
- Do NOT invent agent names (e.g., "DatabaseBot", "RefactorHelper").
- Do NOT run the subagent's task in your own scratchpad. Spawn it.
```

## 4. MCP App Integrations (UI Layer)

To move away from text-only interactions, we will implement three "MCP Apps" that render interactive UI components in the chat stream.

### Architecture

1. **Tool Output:** The tool returns a `resourceUri` in the `_meta` field.

2. **VS Code Extension:** A `ResourceProvider` in the extension listens for `internal://ui/*` schemes.

3. **Rendering:** The extension returns HTML (using React components from the dashboard) to be rendered in the Chat iframe.

### A. The "Plan Phase" Interactive Ticket

**Replaces:** Text dump of `memory_plan` / `memory_steps`.
**Trigger:** `memory_plan(action='create' | 'update')`

**Payload:**

```json
{
  "content": [{ "type": "text", "text": "Plan Updated." }],
  "_meta": { 
    "ui": { 
      "resourceUri": "internal://ui/plan-ticket?planId=123&phase=Implementation" 
    } 
  }
}
```

**UI Capabilities:**

* **Status Toggles:** Checkboxes to complete steps.

* **Phase Gate:** "Approve Phase" button sends `memory_plan(action='confirm_phase')`.

* **Edit Mode:** Inline editing of step descriptions.

### B. The "Handoff Gate" Approval Card

**Replaces:** Automatic `handoff` execution.
**Trigger:** `memory_agent(action='handoff' | 'spawn')`

**Payload:**

```json
{
  "content": [{ "type": "text", "text": "Requesting Handoff..." }],
  "_meta": { 
    "ui": { 
      "resourceUri": "internal://ui/handoff-gate?from=Architect&to=Executor&reason=PlanReady" 
    } 
  }
}
```

**UI Capabilities:**

* **Approve Button:** Triggers the actual `spawn` or `handoff` execution.

* **Refine Input:** Allows user to inject "Last Minute Instructions" which are appended to the subagent's system prompt.

### C. The "Context Weaver" Selector

**Replaces:** Opaque `memory_context` retrieval.
**Trigger:** `memory_context(action='get' | 'search')`

**Payload:**

```json
{
  "content": [{ "type": "text", "text": "Found 5 context files." }],
  "_meta": { 
    "ui": { 
      "resourceUri": "internal://ui/context-selector?query=database&limit=5" 
    } 
  }
}
```

**UI Capabilities:**

* **Selection List:** Checkbox list of found files/nodes.

* **Token Count:** Shows estimated token cost of selected context.

* **Inject Button:** Confirms selection and returns the content to the chat context.
