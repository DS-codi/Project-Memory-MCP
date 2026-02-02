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
import * as validationTools from './tools/agent-validation.tools.js';
import * as store from './storage/file-store.js';
import { logToolCall, setCurrentAgent } from './logging/tool-logger.js';

// Import consolidated tools
import * as consolidatedTools from './tools/consolidated/index.js';

// =============================================================================
// Logging Helper
// =============================================================================

/**
 * Wrap a tool execution with logging
 */
async function withLogging<T>(
  toolName: string,
  params: Record<string, unknown>,
  fn: () => Promise<T>
): Promise<T> {
  const startTime = Date.now();
  
  try {
    const result = await fn();
    const durationMs = Date.now() - startTime;
    
    // Extract success/error from result if it has that shape
    const resultObj = result as { success?: boolean; error?: string };
    await logToolCall(
      toolName,
      params,
      resultObj.success !== false ? 'success' : 'error',
      resultObj.error,
      durationMs
    );
    
    return result;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    await logToolCall(
      toolName,
      params,
      'error',
      (error as Error).message,
      durationMs
    );
    throw error;
  }
}

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
// MCP TOOLS - 5 consolidated tools for workspace, plan, steps, agent, context
// =============================================================================

server.tool(
  'memory_workspace',
  'Consolidated workspace management tool. Actions: register (register a workspace directory), list (list all workspaces), info (get plans for a workspace), reindex (update codebase profile after changes).',
  {
    action: z.enum(['register', 'list', 'info', 'reindex']).describe('The action to perform'),
    workspace_id: z.string().optional().describe('Workspace ID (for info, reindex)'),
    workspace_path: z.string().optional().describe('Workspace path (for register)')
  },
  async (params) => {
    const result = await withLogging('memory_workspace', params, () =>
      consolidatedTools.memoryWorkspace(params as consolidatedTools.MemoryWorkspaceParams)
    );
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
    };
  }
);

server.tool(
  'memory_plan',
  'Consolidated plan lifecycle management. Actions: list (list plans), get (get plan state), create (create new plan), update (modify plan steps), archive (archive completed plan), import (import existing plan file), find (find plan by ID), add_note (add note to plan).',
  {
    action: z.enum(['list', 'get', 'create', 'update', 'archive', 'import', 'find', 'add_note']).describe('The action to perform'),
    workspace_id: z.string().optional().describe('Workspace ID'),
    workspace_path: z.string().optional().describe('Workspace path (alternative to workspace_id for list)'),
    plan_id: z.string().optional().describe('Plan ID'),
    title: z.string().optional().describe('Plan title (for create/import)'),
    description: z.string().optional().describe('Plan description (for create)'),
    category: RequestCategorySchema.optional().describe('Request category'),
    priority: PrioritySchema.optional().describe('Priority level'),
    steps: z.array(z.object({
      phase: z.string(),
      task: z.string(),
      status: StepStatusSchema.optional().default('pending'),
      notes: z.string().optional(),
      assignee: z.string().optional()
    })).optional().describe('Plan steps (for update)'),
    include_archived: z.boolean().optional().describe('Include archived plans (for list)'),
    plan_file_path: z.string().optional().describe('Path to plan file (for import)'),
    note: z.string().optional().describe('Note content (for add_note)'),
    note_type: z.enum(['info', 'warning', 'instruction']).optional().describe('Note type'),
    categorization: RequestCategorizationSchema.optional().describe('Full categorization details')
  },
  async (params) => {
    const result = await withLogging('memory_plan', params, () =>
      consolidatedTools.memoryPlan(params as consolidatedTools.MemoryPlanParams)
    );
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
    };
  }
);

server.tool(
  'memory_steps',
  'Consolidated step management tool. Actions: add (append new steps), update (update single step status), batch_update (update multiple steps at once).',
  {
    action: z.enum(['add', 'update', 'batch_update']).describe('The action to perform'),
    workspace_id: z.string().describe('Workspace ID'),
    plan_id: z.string().describe('Plan ID'),
    steps: z.array(z.object({
      phase: z.string(),
      task: z.string(),
      status: StepStatusSchema.optional().default('pending'),
      notes: z.string().optional(),
      assignee: z.string().optional()
    })).optional().describe('Steps to add (for add action)'),
    step_index: z.number().optional().describe('Step index to update (for update action)'),
    status: StepStatusSchema.optional().describe('New status (for update action)'),
    notes: z.string().optional().describe('Notes to add (for update action)'),
    agent_type: z.string().optional().describe('Agent type making the update'),
    updates: z.array(z.object({
      index: z.number(),
      status: StepStatusSchema.optional(),
      notes: z.string().optional()
    })).optional().describe('Batch updates (for batch_update action)')
  },
  async (params) => {
    const result = await withLogging('memory_steps', params, () =>
      consolidatedTools.memorySteps(params as consolidatedTools.MemoryStepsParams)
    );
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
    };
  }
);

server.tool(
  'memory_agent',
  'Consolidated agent lifecycle and deployment tool. Actions: init (initialize agent session), complete (complete session), handoff (recommend next agent), validate (validate agent for current task), list (list available agents), get_instructions (get agent instructions), deploy (deploy agents to workspace), get_briefing (get mission briefing), get_lineage (get handoff history).',
  {
    action: z.enum(['init', 'complete', 'handoff', 'validate', 'list', 'get_instructions', 'deploy', 'get_briefing', 'get_lineage']).describe('The action to perform'),
    workspace_id: z.string().optional().describe('Workspace ID'),
    plan_id: z.string().optional().describe('Plan ID'),
    agent_type: AgentTypeSchema.optional().describe('Agent type'),
    context: z.record(z.unknown()).optional().describe('Context data (for init)'),
    summary: z.string().optional().describe('Session summary (for complete)'),
    artifacts: z.array(z.string()).optional().describe('Created artifacts (for complete)'),
    from_agent: AgentTypeSchema.optional().describe('Source agent (for handoff)'),
    to_agent: AgentTypeSchema.optional().describe('Target agent (for handoff)'),
    reason: z.string().optional().describe('Handoff reason'),
    data: z.record(z.unknown()).optional().describe('Handoff data'),
    agent_name: z.string().optional().describe('Agent name (for get_instructions)'),
    workspace_path: z.string().optional().describe('Workspace path (for deploy)'),
    agents: z.array(z.string()).optional().describe('Specific agents to deploy'),
    include_prompts: z.boolean().optional().describe('Include prompts in deployment'),
    include_instructions: z.boolean().optional().describe('Include instructions in deployment')
  },
  async (params) => {
    const result = await withLogging('memory_agent', params, () =>
      consolidatedTools.memoryAgent(params as consolidatedTools.MemoryAgentParams)
    );
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
    };
  }
);

server.tool(
  'memory_context',
  'Consolidated context and research management tool. Actions: store (store context data), get (retrieve context), store_initial (store initial user request), list (list context files), list_research (list research notes), append_research (add research note), generate_instructions (generate plan instructions file).',
  {
    action: z.enum(['store', 'get', 'store_initial', 'list', 'list_research', 'append_research', 'generate_instructions']).describe('The action to perform'),
    workspace_id: z.string().describe('Workspace ID'),
    plan_id: z.string().describe('Plan ID'),
    type: z.string().optional().describe('Context type (for store/get)'),
    data: z.record(z.unknown()).optional().describe('Context data (for store)'),
    user_request: z.string().optional().describe('User request text (for store_initial)'),
    files_mentioned: z.array(z.string()).optional().describe('Files mentioned by user'),
    file_contents: z.record(z.string()).optional().describe('File contents'),
    requirements: z.array(z.string()).optional().describe('Requirements'),
    constraints: z.array(z.string()).optional().describe('Constraints'),
    examples: z.array(z.string()).optional().describe('Examples'),
    conversation_context: z.string().optional().describe('Conversation context'),
    additional_notes: z.string().optional().describe('Additional notes'),
    filename: z.string().optional().describe('Research filename (for append_research)'),
    content: z.string().optional().describe('Research content (for append_research)'),
    output_path: z.string().optional().describe('Output path (for generate_instructions)')
  },
  async (params) => {
    const result = await withLogging('memory_context', params, () =>
      consolidatedTools.memoryContext(params as consolidatedTools.MemoryContextParams)
    );
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
