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
import { logToolCall, runWithToolContext, setCurrentAgent } from './logging/tool-logger.js';

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
  return runWithToolContext(toolName, params, async () => {
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
  });
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
  'Coordinator', 'Analyst', 'Researcher', 'Architect', 'Executor',
  'Builder', 'Reviewer', 'Tester', 'Revisionist', 'Archivist',
  'Brainstorm', 'Runner'
]);

const StepStatusSchema = z.enum(['pending', 'active', 'done', 'blocked']);

const StepTypeSchema = z.enum([
  'standard', 'analysis', 'validation', 'user_validation', 'complex', 
  'critical', 'build', 'fix', 'refactor', 'confirmation',
  'research', 'planning', 'code', 'test', 'documentation'
]).optional().default('standard');

const PrioritySchema = z.enum(['low', 'medium', 'high', 'critical']);

const RequestCategorySchema = z.enum([
  'feature',       // Add new functionality
  'bug',           // Fix something broken
  'change',        // Modify existing behavior
  'analysis',      // Understand how something works
  'investigation', // Deep problem resolution and discovery
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
  'Consolidated workspace management tool. Actions: register (register a workspace directory), list (list all workspaces), info (get plans for a workspace), reindex (update codebase profile after changes), merge (merge a ghost/source workspace into a canonical target), scan_ghosts (scan for unregistered data-root directories), migrate (re-register workspace, find and merge all ghost/duplicate folders, recover plans, and clean up — use this when opening old workspaces).',
  {
    action: z.enum(['register', 'list', 'info', 'reindex', 'merge', 'scan_ghosts', 'migrate']).describe('The action to perform'),
    workspace_id: z.string().optional().describe('Workspace ID (for info, reindex)'),
    workspace_path: z.string().optional().describe('Workspace path (for register, migrate)'),
    source_workspace_id: z.string().optional().describe('Source workspace/ghost folder ID to merge from (for merge)'),
    target_workspace_id: z.string().optional().describe('Target canonical workspace ID to merge into (for merge)'),
    dry_run: z.boolean().optional().describe('If true (default), report what would be merged without making changes (for merge)')
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
  'Consolidated plan lifecycle management. Actions: list (list plans), get (get plan state), create (create new plan), update (modify plan steps), archive (archive completed plan), import (import existing plan file), find (find plan by ID), add_note (add note to plan), delete (delete plan), consolidate (consolidate steps), set_goals (set goals and success criteria), add_build_script (add build script), list_build_scripts (list build scripts), run_build_script (resolve build script for terminal execution), delete_build_script (delete build script), create_from_template (create plan from template), list_templates (list available templates).',
  {
    action: z.enum(['list', 'get', 'create', 'update', 'archive', 'import', 'find', 'add_note', 'delete', 'consolidate', 'set_goals', 'add_build_script', 'list_build_scripts', 'run_build_script', 'delete_build_script', 'create_from_template', 'list_templates', 'confirm']).describe('The action to perform'),
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
      type: StepTypeSchema,
      status: StepStatusSchema.optional().default('pending'),
      notes: z.string().optional(),
      assignee: z.string().optional(),
      requires_validation: z.boolean().optional(),
      requires_confirmation: z.boolean().optional(),
      requires_user_confirmation: z.boolean().optional()
    })).optional().describe('Plan steps (for update)'),
    include_archived: z.boolean().optional().describe('Include archived plans (for list)'),
    plan_file_path: z.string().optional().describe('Path to plan file (for import)'),
    note: z.string().optional().describe('Note content (for add_note)'),
    note_type: z.enum(['info', 'warning', 'instruction']).optional().describe('Note type'),
    categorization: RequestCategorizationSchema.optional().describe('Full categorization details'),
    confirm: z.boolean().optional().describe('Confirmation required for destructive delete action'),
    step_indices: z.array(z.number()).optional().describe('Array of 0-based step indices to consolidate (for consolidate action)'),
    consolidated_task: z.string().optional().describe('Consolidated task description (for consolidate action)'),
    goals: z.array(z.string()).optional().describe('Plan goals (for create or set_goals action)'),
    success_criteria: z.array(z.string()).optional().describe('Success criteria (for create or set_goals action)'),
    script_name: z.string().optional().describe('Build script name (for build script actions)'),
    script_description: z.string().optional().describe('Build script description'),
    script_command: z.string().optional().describe('Build script command to run'),
    script_directory: z.string().optional().describe('Directory to run the build script in'),
    script_mcp_handle: z.string().optional().describe('MCP handle identifier for the script'),
    script_id: z.string().optional().describe('Build script ID (for run/delete)'),
    template: z.enum(['feature', 'bugfix', 'refactor', 'documentation', 'analysis', 'investigation']).optional().describe('Plan template (for create_from_template)'),
    confirmation_scope: z.enum(['phase', 'step']).optional().describe('Confirmation scope (for confirm action)'),
    confirm_phase: z.string().optional().describe('Phase to confirm (for confirm action)'),
    confirm_step_index: z.number().optional().describe('0-based step index to confirm (for confirm action)'),
    confirmed_by: z.string().optional().describe('Who confirmed the phase/step')
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
  'Consolidated step management tool. Actions: add (append new steps), update (update single step status), batch_update (update multiple steps at once), insert (insert step at index), delete (delete step at index), reorder (swap step with adjacent step up/down), move (move step from one index to another), sort (sort all steps by phase), set_order (completely reorder all steps), replace (replace all steps with new array).',
  {
    action: z.enum(['add', 'update', 'batch_update', 'insert', 'delete', 'reorder', 'move', 'sort', 'set_order', 'replace']).describe('The action to perform'),
    workspace_id: z.string().describe('Workspace ID'),
    plan_id: z.string().describe('Plan ID'),
    steps: z.array(z.object({
      phase: z.string(),
      task: z.string(),
      type: StepTypeSchema,
      status: StepStatusSchema.optional().default('pending'),
      notes: z.string().optional(),
      assignee: z.string().optional(),
      depends_on: z.array(z.number()).optional().describe('Indices of steps that must complete before this one'),
      requires_validation: z.boolean().optional(),
      requires_confirmation: z.boolean().optional(),
      requires_user_confirmation: z.boolean().optional()
    })).optional().describe('Steps to add (for add action)'),
    step_index: z.number().optional().describe('Step index (0-based) to update (for update action)'),
    status: StepStatusSchema.optional().describe('New status (for update action)'),
    notes: z.string().optional().describe('Notes to add (for update action)'),
    agent_type: z.string().optional().describe('Agent type making the update'),
    updates: z.array(z.object({
      index: z.number(),
      status: StepStatusSchema.optional(),
      notes: z.string().optional()
    })).optional().describe('Batch updates (for batch_update action)'),
    at_index: z.number().optional().describe('0-based index at which to insert step (for insert action)'),
    step: z.object({
      phase: z.string(),
      task: z.string(),
      type: StepTypeSchema,
      status: StepStatusSchema.optional().default('pending'),
      notes: z.string().optional(),
      assignee: z.string().optional(),
      depends_on: z.array(z.number()).optional().describe('Indices of steps that must complete before this one'),
      requires_validation: z.boolean().optional(),
      requires_confirmation: z.boolean().optional(),
      requires_user_confirmation: z.boolean().optional()
    }).optional().describe('Single step to insert (for insert action)'),
    direction: z.enum(['up', 'down']).optional().describe('Direction to move step (for reorder action)'),
    from_index: z.number().optional().describe('0-based source step index (for move action)'),
    to_index: z.number().optional().describe('0-based target step index (for move action)'),
    phase_order: z.array(z.string()).optional().describe('Custom phase order for sort action, e.g. ["Research", "Design", "Implement", "Test"]'),
    new_order: z.array(z.number()).optional().describe('Array of current step indices in desired new order (for set_order action)'),
    replacement_steps: z.array(z.object({
      phase: z.string(),
      task: z.string(),
      type: StepTypeSchema,
      status: StepStatusSchema.optional().default('pending'),
      notes: z.string().optional(),
      assignee: z.string().optional(),
      depends_on: z.array(z.number()).optional(),
      requires_validation: z.boolean().optional(),
      requires_confirmation: z.boolean().optional(),
      requires_user_confirmation: z.boolean().optional()
    })).optional().describe('Complete new steps array (for replace action)')
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
    validate: z.boolean().optional().describe('If true, run validation during init'),
    validation_mode: z.enum(['init+validate']).optional().describe('Run validation as part of init and return result'),
    deployment_context: z.object({
      deployed_by: z.string().describe('Who is deploying this agent (Coordinator, Analyst, Runner, User)'),
      reason: z.string().describe('Why this agent was chosen for the current task'),
      override_validation: z.boolean().optional().describe('If true (default), validation will respect this deployment and not redirect the agent')
    }).optional().describe('Set by orchestrators (Coordinator/Analyst/Runner) during init to control validation behavior'),
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
  'Consolidated context and research management tool. Actions: store (store plan context), get (retrieve plan context), store_initial (store initial user request), list (list plan context files), list_research (list research notes), append_research (add research note), generate_instructions (generate plan instructions file), batch_store (store multiple context items at once), workspace_get/workspace_set/workspace_update/workspace_delete (workspace-scoped context CRUD).',
  {
    action: z.enum(['store', 'get', 'store_initial', 'list', 'list_research', 'append_research', 'generate_instructions', 'batch_store', 'workspace_get', 'workspace_set', 'workspace_update', 'workspace_delete']).describe('The action to perform'),
    workspace_id: z.string().describe('Workspace ID'),
    plan_id: z.string().optional().describe('Plan ID (required for plan-scoped actions)'),
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
    output_path: z.string().optional().describe('Output path (for generate_instructions)'),
    items: z.array(z.object({
      type: z.string(),
      data: z.record(z.unknown())
    })).optional().describe('Array of context items to store (for batch_store)')
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
