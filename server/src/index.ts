/**
 * Project Memory MCP Server
 * 
 * A local Model Context Protocol server for managing multi-agent
 * software development workflows with isolated workspace and plan state.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

// Import tools
import * as workspaceTools from './tools/workspace.tools.js';
import * as planTools from './tools/plan.tools.js';
import * as handoffTools from './tools/handoff.tools.js';
import * as contextTools from './tools/context.tools.js';
import * as agentTools from './tools/agent.tools.js';
import * as store from './storage/file-store.js';

// =============================================================================
// Server Setup
// =============================================================================

const server = new McpServer({
  name: 'project-memory',
  version: '1.0.0'
});

// =============================================================================
// Tool Schemas
// =============================================================================

const AgentTypeSchema = z.enum([
  'Coordinator', 'Researcher', 'Architect', 'Executor', 
  'Revisionist', 'Reviewer', 'Tester', 'Archivist'
]);

const StepStatusSchema = z.enum(['pending', 'active', 'done', 'blocked']);

const PrioritySchema = z.enum(['low', 'medium', 'high', 'critical']);

const RequestCategorySchema = z.enum([
  'feature',       // Add new functionality
  'bug',           // Fix something broken
  'change',        // Modify existing behavior
  'analysis',      // Understand how something works
  'debug',         // Investigate a specific issue
  'refactor',      // Improve code without changing behavior
  'documentation'  // Update or create docs
]);

const RequestCategorizationSchema = z.object({
  category: RequestCategorySchema,
  confidence: z.number().min(0).max(1).describe('Confidence in categorization (0-1)'),
  reasoning: z.string().describe('Explanation of why this category was chosen'),
  suggested_workflow: z.array(AgentTypeSchema).describe('Suggested agent workflow for this request'),
  skip_agents: z.array(AgentTypeSchema).optional().describe('Agents that can be skipped for this request type')
});

// =============================================================================
// Workspace Tools
// =============================================================================

server.tool(
  'register_workspace',
  'Register a workspace directory. Creates a folder for the workspace if it does not exist. Returns workspace_id for use in other tools.',
  {
    workspace_path: z.string().describe('Absolute path to the workspace directory')
  },
  async (params) => {
    const result = await workspaceTools.registerWorkspace({
      workspace_path: params.workspace_path
    });
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
    };
  }
);

server.tool(
  'list_workspaces',
  'List all registered workspaces with their metadata.',
  {},
  async () => {
    const result = await workspaceTools.listWorkspaces();
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
    };
  }
);

server.tool(
  'get_workspace_plans',
  'Get all plans for a specific workspace.',
  {
    workspace_id: z.string().describe('The workspace ID returned from register_workspace')
  },
  async (params) => {
    const result = await workspaceTools.getWorkspacePlans({
      workspace_id: params.workspace_id
    });
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
    };
  }
);

server.tool(
  'reindex_workspace',
  'Re-index a workspace to update the codebase profile after significant changes. Use after successful reviews to capture new files, dependencies, or structural changes. Returns the previous and new profiles with a summary of changes.',
  {
    workspace_id: z.string().describe('The workspace ID to re-index')
  },
  async (params) => {
    const result = await workspaceTools.reindexWorkspace({
      workspace_id: params.workspace_id
    });
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
    };
  }
);

// =============================================================================
// Plan Tools
// =============================================================================

server.tool(
  'create_plan',
  'Create a new plan within a workspace. Requires categorizing the request type (feature, bug, change, analysis, debug, refactor, documentation). Returns the plan state with plan_id.',
  {
    workspace_id: z.string().describe('The workspace ID'),
    title: z.string().describe('Title of the plan/feature'),
    description: z.string().describe('Detailed description of what needs to be done'),
    category: RequestCategorySchema.describe('Type of request: feature, bug, change, analysis, debug, refactor, or documentation'),
    priority: PrioritySchema.optional().describe('Priority level (low, medium, high, critical)'),
    categorization: RequestCategorizationSchema.optional().describe('Full categorization details including confidence and suggested workflow')
  },
  async (params) => {
    const result = await planTools.createPlan({
      workspace_id: params.workspace_id,
      title: params.title,
      description: params.description,
      category: params.category,
      priority: params.priority,
      categorization: params.categorization
    });
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
    };
  }
);

server.tool(
  'get_plan_state',
  'Get the complete current state of a plan including steps, lineage, and agent sessions.',
  {
    workspace_id: z.string().describe('The workspace ID'),
    plan_id: z.string().describe('The plan ID')
  },
  async (params) => {
    const result = await planTools.getPlanState({
      workspace_id: params.workspace_id,
      plan_id: params.plan_id
    });
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
    };
  }
);

server.tool(
  'update_step',
  'Update the status of a specific step in the plan.',
  {
    workspace_id: z.string().describe('The workspace ID'),
    plan_id: z.string().describe('The plan ID'),
    step_index: z.number().describe('Index of the step to update'),
    status: StepStatusSchema.describe('New status (pending, active, done, blocked)'),
    notes: z.string().optional().describe('Optional notes about the step')
  },
  async (params) => {
    const result = await planTools.updateStep({
      workspace_id: params.workspace_id,
      plan_id: params.plan_id,
      step_index: params.step_index,
      status: params.status,
      notes: params.notes
    });
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
    };
  }
);

server.tool(
  'modify_plan',
  'Replace the plan steps with a new set of steps. Used by Architect to create plan or Revisionist to pivot.',
  {
    workspace_id: z.string().describe('The workspace ID'),
    plan_id: z.string().describe('The plan ID'),
    new_steps: z.array(z.object({
      phase: z.string().describe('Phase name (e.g., audit, research, implementation)'),
      task: z.string().describe('Description of the task'),
      status: StepStatusSchema.optional().describe('Initial status (defaults to pending)')
    })).describe('Array of new steps')
  },
  async (params) => {
    const result = await planTools.modifyPlan({
      workspace_id: params.workspace_id,
      plan_id: params.plan_id,
      new_steps: params.new_steps.map(s => ({
        phase: s.phase,
        task: s.task,
        status: s.status || 'pending' as const
      }))
    });
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
    };
  }
);

server.tool(
  'archive_plan',
  'Archive a completed plan. Moves it from active to archived status.',
  {
    workspace_id: z.string().describe('The workspace ID'),
    plan_id: z.string().describe('The plan ID')
  },
  async (params) => {
    const result = await planTools.archivePlan({
      workspace_id: params.workspace_id,
      plan_id: params.plan_id
    });
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
    };
  }
);

// =============================================================================
// Agent Lifecycle Tools
// =============================================================================

server.tool(
  'initialise_agent',
  'REQUIRED: Must be called first by every agent. Records agent activation with full context snapshot for traceability.',
  {
    workspace_id: z.string().describe('The workspace ID'),
    plan_id: z.string().describe('The plan ID'),
    agent_type: AgentTypeSchema.describe('Type of agent being initialized'),
    context: z.record(z.unknown()).describe('Full context object specific to this agent type')
  },
  async (params) => {
    const result = await handoffTools.initialiseAgent({
      workspace_id: params.workspace_id,
      plan_id: params.plan_id,
      agent_type: params.agent_type,
      context: params.context
    });
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
    };
  }
);

server.tool(
  'complete_agent',
  'Mark an agent session as complete. Records summary and output artifacts.',
  {
    workspace_id: z.string().describe('The workspace ID'),
    plan_id: z.string().describe('The plan ID'),
    agent_type: AgentTypeSchema.describe('Type of agent completing'),
    summary: z.string().describe('Summary of what the agent accomplished'),
    artifacts: z.array(z.string()).optional().describe('List of artifact filenames created')
  },
  async (params) => {
    const result = await handoffTools.completeAgent({
      workspace_id: params.workspace_id,
      plan_id: params.plan_id,
      agent_type: params.agent_type,
      summary: params.summary,
      artifacts: params.artifacts
    });
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
    };
  }
);

server.tool(
  'handoff',
  'Transfer control from one agent to another. Records the handoff in lineage.',
  {
    workspace_id: z.string().describe('The workspace ID'),
    plan_id: z.string().describe('The plan ID'),
    from_agent: AgentTypeSchema.describe('Agent handing off'),
    to_agent: AgentTypeSchema.describe('Agent receiving control'),
    reason: z.string().describe('Reason for the handoff'),
    data: z.record(z.unknown()).optional().describe('Optional data to pass to next agent')
  },
  async (params) => {
    const result = await handoffTools.handoff({
      workspace_id: params.workspace_id,
      plan_id: params.plan_id,
      from_agent: params.from_agent,
      to_agent: params.to_agent,
      reason: params.reason,
      data: params.data
    });
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
    };
  }
);

server.tool(
  'get_mission_briefing',
  'Get the mission briefing for a plan. Returns deployment context, previous sessions, and current steps.',
  {
    workspace_id: z.string().describe('The workspace ID'),
    plan_id: z.string().describe('The plan ID')
  },
  async (params) => {
    const result = await handoffTools.getMissionBriefing({
      workspace_id: params.workspace_id,
      plan_id: params.plan_id
    });
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
    };
  }
);

server.tool(
  'get_lineage',
  'Get the full handoff history for a plan.',
  {
    workspace_id: z.string().describe('The workspace ID'),
    plan_id: z.string().describe('The plan ID')
  },
  async (params) => {
    const result = await handoffTools.getLineage({
      workspace_id: params.workspace_id,
      plan_id: params.plan_id
    });
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
    };
  }
);

// =============================================================================
// Context Tools
// =============================================================================

server.tool(
  'store_context',
  'Store context data (audit findings, research results, decisions, etc.) as JSON.',
  {
    workspace_id: z.string().describe('The workspace ID'),
    plan_id: z.string().describe('The plan ID'),
    type: z.string().describe('Type of context (e.g., audit, research, decisions)'),
    data: z.record(z.unknown()).describe('The context data to store')
  },
  async (params) => {
    const result = await contextTools.storeContext({
      workspace_id: params.workspace_id,
      plan_id: params.plan_id,
      type: params.type,
      data: params.data
    });
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
    };
  }
);

server.tool(
  'get_context',
  'Retrieve stored context data by type.',
  {
    workspace_id: z.string().describe('The workspace ID'),
    plan_id: z.string().describe('The plan ID'),
    type: z.string().describe('Type of context to retrieve')
  },
  async (params) => {
    const result = await contextTools.getContext({
      workspace_id: params.workspace_id,
      plan_id: params.plan_id,
      type: params.type
    });
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
    };
  }
);

server.tool(
  'append_research',
  'Add a research note file to the plan.',
  {
    workspace_id: z.string().describe('The workspace ID'),
    plan_id: z.string().describe('The plan ID'),
    filename: z.string().describe('Name of the research file (e.g., oauth-flow.md)'),
    content: z.string().describe('Content of the research note')
  },
  async (params) => {
    const result = await contextTools.appendResearch({
      workspace_id: params.workspace_id,
      plan_id: params.plan_id,
      filename: params.filename,
      content: params.content
    });
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
    };
  }
);

server.tool(
  'list_context',
  'List all context files for a plan.',
  {
    workspace_id: z.string().describe('The workspace ID'),
    plan_id: z.string().describe('The plan ID')
  },
  async (params) => {
    const result = await contextTools.listContext({
      workspace_id: params.workspace_id,
      plan_id: params.plan_id
    });
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
    };
  }
);

server.tool(
  'list_research_notes',
  'List all research note files for a plan.',
  {
    workspace_id: z.string().describe('The workspace ID'),
    plan_id: z.string().describe('The plan ID')
  },
  async (params) => {
    const result = await contextTools.listResearchNotes({
      workspace_id: params.workspace_id,
      plan_id: params.plan_id
    });
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
    };
  }
);

// =============================================================================
// Agent Deployment Tools
// =============================================================================

server.tool(
  'list_agents',
  'List all available agent instruction files that can be deployed to workspaces.',
  {},
  async () => {
    const result = await agentTools.listAgents();
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
    };
  }
);

server.tool(
  'deploy_agents_to_workspace',
  'Copy agent instruction files (.agent.md) to a workspace\'s .github/agents/ directory for VS Code to discover.',
  {
    workspace_path: z.string().describe('Absolute path to the target workspace'),
    agents: z.array(z.string()).optional().describe('Optional list of specific agents to deploy (e.g., ["auditor", "executor"]). Deploys all if omitted.')
  },
  async (params) => {
    const result = await agentTools.deployAgentsToWorkspace({
      workspace_path: params.workspace_path,
      agents: params.agents
    });
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
    };
  }
);

server.tool(
  'get_agent_instructions',
  'Get the content of a specific agent instruction file.',
  {
    agent_name: z.string().describe('Name of the agent (e.g., "auditor", "executor")')
  },
  async (params) => {
    const result = await agentTools.getAgentInstructions({
      agent_name: params.agent_name
    });
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
    };
  }
);

// =============================================================================
// Server Startup
// =============================================================================

async function main() {
  // Initialize data root
  await store.initDataRoot();
  
  console.error('Project Memory MCP Server starting...');
  console.error(`Data root: ${store.getDataRoot()}`);
  
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  console.error('Project Memory MCP Server running');
}

main().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
