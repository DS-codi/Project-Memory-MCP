/**
 * Project Memory MCP Server
 * 
 * A local Model Context Protocol server for managing multi-agent
 * software development workflows with isolated workspace and plan state.
 * 
 * Supports multiple transports:
 *   --transport stdio           (default) Standard stdio for local VS Code use
 *   --transport sse             HTTP + SSE for container mode (legacy clients)
 *   --transport streamable-http Streamable HTTP for container mode (modern clients)
 *   --port <number>             Port for HTTP transports (default: 3000)
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

// Import tools
import * as workspaceTools from './tools/workspace.tools.js';
import * as planTools from './tools/plan/index.js';
import * as handoffTools from './tools/handoff.tools.js';
import * as contextTools from './tools/context.tools.js';
import * as agentTools from './tools/agent.tools.js';
import * as validationTools from './tools/agent-validation.tools.js';
import * as store from './storage/file-store.js';
import { logToolCall, runWithToolContext, setCurrentAgent } from './logging/tool-logger.js';

// Import consolidated tools
import * as consolidatedTools from './tools/consolidated/index.js';

// Import HTTP transport (Phase 6A)
import { createHttpApp, closeAllTransports, type TransportType } from './transport/http-transport.js';

// Import container alert listener (strict mode boundaries)
import { ContainerAlertListener } from './transport/container-alert-listener.js';

// Import container startup alert and data-root liveness (container mode)
import { sendStartupAlert } from './transport/container-startup-alert.js';
import { setDataRoot, startLivenessPolling, stopLivenessPolling } from './transport/data-root-liveness.js';

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
// CLI Argument Parsing (Phase 6A.2)
// =============================================================================

function parseCliArgs(): { transport: TransportType; port: number } {
  const args = process.argv.slice(2);
  let transport: TransportType = 'stdio';
  let port = 3000;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--transport' && args[i + 1]) {
      const value = args[i + 1];
      if (value === 'stdio' || value === 'sse' || value === 'streamable-http') {
        transport = value;
      } else {
        console.error(`Invalid transport: ${value}. Valid: stdio, sse, streamable-http`);
        process.exit(1);
      }
      i++;
    } else if (args[i] === '--port' && args[i + 1]) {
      port = parseInt(args[i + 1], 10);
      if (isNaN(port) || port < 1 || port > 65535) {
        console.error(`Invalid port: ${args[i + 1]}`);
        process.exit(1);
      }
      i++;
    }
  }

  return { transport, port };
}

// =============================================================================
// Server Factory
// =============================================================================

/**
 * Create and configure a new McpServer instance with all tools registered.
 * Used as a factory so HTTP transport can create per-session servers.
 */
export function createMcpServer(): McpServer {

const server = new McpServer({
  name: 'project-memory',
  version: '1.0.0'
});

// =============================================================================
// Tool Schemas
// =============================================================================

const AgentTypeSchema = z.enum([
  'Coordinator', 'Analyst', 'Researcher', 'Architect', 'Executor',
  'Reviewer', 'Tester', 'Revisionist', 'Archivist',
  'Brainstorm', 'Runner', 'SkillWriter', 'Worker', 'TDDDriver', 'Cognition',
  'Migrator'
]);

const StepStatusSchema = z.enum(['pending', 'active', 'done', 'blocked']);

const StepTypeSchema = z.enum([
  'standard', 'analysis', 'validation', 'user_validation', 'complex', 
  'critical', 'build', 'fix', 'refactor', 'confirmation',
  'research', 'planning', 'code', 'test', 'documentation'
]).optional().default('standard');

const PrioritySchema = z.enum(['low', 'medium', 'high', 'critical']);

const RequestCategorySchema = z.enum([
  'feature',        // Add new functionality
  'bugfix',         // Fix something broken
  'refactor',       // Improve code without changing behavior
  'orchestration',  // Systemic/cross-cutting agent system changes
  'program',        // Multi-plan container
  'quick_task',     // Small task, hub routes directly
  'advisory'        // Conversational, no action taken
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
  'Consolidated workspace management tool. Actions: register (register a workspace directory), list (list all workspaces), info (get plans for a workspace), reindex (update codebase profile after changes), merge (merge a ghost/source workspace into a canonical target), scan_ghosts (scan for unregistered data-root directories), migrate (re-register workspace, find and merge all ghost/duplicate folders, recover plans, and clean up — use this when opening old workspaces), link (link/unlink parent-child workspace hierarchy), export_pending (export all unfinished steps from every plan to a .md file in the workspace).',
  {
    action: z.enum(['register', 'list', 'info', 'reindex', 'merge', 'scan_ghosts', 'migrate', 'link', 'export_pending']).describe('The action to perform'),
    workspace_id: z.string().optional().describe('Workspace ID (for info, reindex, link)'),
    workspace_path: z.string().optional().describe('Workspace path (for register, migrate)'),
    force: z.boolean().optional().describe('Force registration even if directory overlaps with existing workspace (for register)'),
    source_workspace_id: z.string().optional().describe('Source workspace/ghost folder ID to merge from (for merge)'),
    target_workspace_id: z.string().optional().describe('Target canonical workspace ID to merge into (for merge)'),
    dry_run: z.boolean().optional().describe('If true (default), report what would be merged without making changes (for merge)'),
    child_workspace_id: z.string().optional().describe('Child workspace ID (for link action)'),
    mode: z.enum(['link', 'unlink']).optional().describe('Link or unlink mode (for link action, defaults to link)'),
    hierarchical: z.boolean().optional().describe('When true, group child workspaces under parents in list results (for list action)'),
    output_filename: z.string().optional().describe('Custom output filename for export_pending (defaults to pending-steps.md)')
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
  'Consolidated plan lifecycle management. Actions: list (list plans), get (get plan state), create (create new plan), update (modify plan steps), archive (archive completed plan), import (import existing plan file), find (find plan by ID), add_note (add note to plan), delete (delete plan), consolidate (consolidate steps), set_goals (set goals and success criteria), add_build_script (add build script), list_build_scripts (list build scripts), run_build_script (resolve build script for terminal execution), delete_build_script (delete build script), create_from_template (create plan from template), list_templates (list available templates), link_to_program (link plan to program), unlink_from_program (unlink plan from program), set_plan_dependencies (set plan dependencies), get_plan_dependencies (get plan dependencies and dependents), set_plan_priority (update plan priority), clone_plan (deep copy a plan), merge_plans (merge steps from multiple plans).',
  {
    action: z.enum(['list', 'get', 'create', 'update', 'archive', 'import', 'find', 'add_note', 'delete', 'consolidate', 'set_goals', 'add_build_script', 'list_build_scripts', 'run_build_script', 'delete_build_script', 'create_from_template', 'list_templates', 'confirm', 'create_program', 'add_plan_to_program', 'upgrade_to_program', 'list_program_plans', 'export_plan', 'link_to_program', 'unlink_from_program', 'set_plan_dependencies', 'get_plan_dependencies', 'set_plan_priority', 'clone_plan', 'merge_plans']).describe('The action to perform'),
    workspace_id: z.string().optional().describe('Workspace ID'),
    workspace_path: z.string().optional().describe('Workspace path (alternative to workspace_id for list)'),
    plan_id: z.string().optional().describe('Plan ID'),
    program_id: z.string().optional().describe('Program ID (for program actions)'),
    move_steps_to_child: z.boolean().optional().describe('Move existing steps to a child plan when upgrading to program'),
    child_plan_title: z.string().optional().describe('Title for child plan when upgrading with move_steps_to_child'),
    title: z.string().optional().describe('Plan title (for create/import)'),
    description: z.string().optional().describe('Plan description (for create)'),
    schema_version: z.string().optional().describe('Plan schema version (auto-set to current version)'),
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
    template: z.enum(['feature', 'bugfix', 'refactor', 'documentation', 'analysis', 'investigation_workflow']).optional().describe('Plan template (for create_from_template)'),
    confirmation_scope: z.enum(['phase', 'step']).optional().describe('Confirmation scope (for confirm action)'),
    confirm_phase: z.string().optional().describe('Phase to confirm (for confirm action)'),
    confirm_step_index: z.number().optional().describe('0-based step index to confirm (for confirm action)'),
    confirmed_by: z.string().optional().describe('Who confirmed the phase/step'),
    depends_on_plans: z.array(z.string()).optional().describe('Array of plan IDs this plan depends on (for set_plan_dependencies)'),
    new_title: z.string().optional().describe('New title for cloned plan (for clone_plan)'),
    reset_steps: z.boolean().optional().describe('Reset all step statuses to pending (for clone_plan, default true)'),
    link_to_same_program: z.boolean().optional().describe('Link cloned plan to same program as source (for clone_plan)'),
    target_plan_id: z.string().optional().describe('Target plan ID to merge steps into (for merge_plans)'),
    source_plan_ids: z.array(z.string()).optional().describe('Source plan IDs to merge from (for merge_plans)'),
    archive_sources: z.boolean().optional().describe('Archive source plans after merge (for merge_plans)')
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
  'Consolidated agent lifecycle and deployment tool. Actions: init (initialize agent session), complete (complete session), handoff (recommend next agent), validate (validate agent for current task), list (list available agents), get_instructions (get agent instructions), deploy (deploy agents to workspace), get_briefing (get mission briefing), get_lineage (get handoff history), categorize (store categorization decision on plan), deploy_for_task (deploy agent files + context bundle for a specific task).',
  {
    action: z.enum(['init', 'complete', 'handoff', 'validate', 'list', 'get_instructions', 'deploy', 'get_briefing', 'get_lineage', 'categorize', 'deploy_for_task']).describe('The action to perform'),
    workspace_id: z.string().optional().describe('Workspace ID'),
    plan_id: z.string().optional().describe('Plan ID'),
    agent_type: AgentTypeSchema.optional().describe('Agent type'),
    context: z.record(z.unknown()).optional().describe('Context data (for init)'),
    compact: z.boolean().optional().describe('Default true - return compact plan state with summarized sessions/lineage/steps'),
    context_budget: z.number().optional().describe('Optional byte budget - progressively trim plan_state payload to fit'),
    include_workspace_context: z.boolean().optional().describe('If true, include workspace context summary (sections, item counts, staleness) in init response'),
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
    include_instructions: z.boolean().optional().describe('Include instructions in deployment'),
    include_skills: z.boolean().optional().describe('Include skills in deployment'),
    categorization_result: z.record(z.unknown()).optional().describe('Categorization decision result — CategoryDecision object (for categorize)'),
    phase_context: z.record(z.unknown()).optional().describe('Phase-specific context data (for deploy_for_task)'),
    context_markers: z.record(z.enum(['phase-persistent', 'single-agent'])).optional().describe('Context persistence markers (for deploy_for_task)'),
    include_research: z.boolean().optional().describe('Include research notes in context bundle (for deploy_for_task)'),
    include_architecture: z.boolean().optional().describe('Include architecture context in bundle (for deploy_for_task)'),
    phase_name: z.string().optional().describe('Current phase name (for deploy_for_task)'),
    step_indices: z.array(z.number()).optional().describe('Step indices to work on (for deploy_for_task)')
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
  'Consolidated context and research management tool. Actions: store (store plan context), get (retrieve plan context), store_initial (store initial user request), list (list plan context files), list_research (list research notes), append_research (add research note), generate_instructions (generate plan instructions file), batch_store (store multiple context items at once), workspace_get/workspace_set/workspace_update/workspace_delete (workspace-scoped context CRUD), knowledge_store/knowledge_get/knowledge_list/knowledge_delete (workspace knowledge file CRUD), write_prompt (create plan-specific .prompt.md files).',
  {
    action: z.enum(['store', 'get', 'store_initial', 'list', 'list_research', 'append_research', 'generate_instructions', 'batch_store', 'workspace_get', 'workspace_set', 'workspace_update', 'workspace_delete', 'knowledge_store', 'knowledge_get', 'knowledge_list', 'knowledge_delete', 'write_prompt', 'dump_context']).describe('The action to perform'),
    workspace_id: z.string().describe('Workspace ID'),
    plan_id: z.string().optional().describe('Plan ID (required for plan-scoped actions)'),
    type: z.string().optional().describe('Context type (for store/get)'),
    data: z.record(z.unknown()).optional().describe('Context data. For workspace_set/workspace_update: pass either { sections: { sectionName: { summary?, items? } } } or flat key-value pairs that get auto-wrapped as sections (string→summary, array→items, object→JSON summary).'),
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
    })).optional().describe('Array of context items to store (for batch_store)'),
    slug: z.string().optional().describe('Knowledge file slug (for knowledge_store/knowledge_get/knowledge_delete)'),
    title: z.string().optional().describe('Knowledge file title (for knowledge_store)'),
    category: z.string().optional().describe('Knowledge file category (for knowledge_store/knowledge_list)'),
    tags: z.array(z.string()).optional().describe('Knowledge file tags (for knowledge_store)'),
    created_by_agent: z.string().optional().describe('Agent that created the knowledge file'),
    created_by_plan: z.string().optional().describe('Plan that created the knowledge file'),
    prompt_title: z.string().optional().describe('Prompt title (for write_prompt)'),
    prompt_agent: z.string().optional().describe('Target agent for prompt (for write_prompt)'),
    prompt_description: z.string().optional().describe('Prompt description (for write_prompt)'),
    prompt_sections: z.array(z.object({ title: z.string(), content: z.string() })).optional().describe('Prompt body sections (for write_prompt)'),
    prompt_variables: z.array(z.string()).optional().describe('Template variables (for write_prompt)'),
    prompt_raw_body: z.string().optional().describe('Raw prompt body, used instead of sections (for write_prompt)'),
    prompt_mode: z.string().optional().describe('Prompt mode: agent, ask, edit (for write_prompt)'),
    prompt_phase: z.string().optional().describe('Plan phase (for write_prompt)'),
    prompt_step_indices: z.array(z.number()).optional().describe('Step indices covered (for write_prompt)'),
    prompt_expires_after: z.string().optional().describe('Expiry: plan_completion, phase_completion, or ISO date (for write_prompt)'),
    prompt_version: z.string().optional().describe('Semver version (for write_prompt)'),
    prompt_slug: z.string().optional().describe('Filename slug override (for write_prompt)'),
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
// Terminal Tool — GUI approval flow
// =============================================================================

server.tool(
  'memory_terminal',
  'Terminal tool with GUI approval flow. Actions: run (execute command — auto-approves allowlisted, blocks destructive, shows GUI approval for others), read_output (get output from a session), kill (terminate a session), get_allowlist (view allowlist), update_allowlist (manage allowlist patterns).',
  {
    action: z.enum(['run', 'read_output', 'kill', 'get_allowlist', 'update_allowlist']).describe('The action to perform'),
    command: z.string().optional().describe('Command to execute (for run)'),
    args: z.array(z.string()).optional().describe('Command arguments (for run)'),
    cwd: z.string().optional().describe('Working directory (for run)'),
    timeout_ms: z.number().optional().describe('Execution timeout in milliseconds (for run)'),
    workspace_id: z.string().optional().describe('Workspace ID'),
    session_id: z.string().optional().describe('Session ID (for read_output, kill)'),
    patterns: z.array(z.string()).optional().describe('Allowlist patterns (for update_allowlist)'),
    operation: z.enum(['add', 'remove', 'set']).optional().describe('How to modify the allowlist (for update_allowlist)'),
  },
  async (params, extra) => {
    const result = await withLogging('memory_terminal', params, () =>
      consolidatedTools.memoryTerminal(params as consolidatedTools.MemoryTerminalParams, extra)
    );
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
    };
  }
);

// =============================================================================
// Filesystem Tool — workspace-scoped file operations
// =============================================================================

server.tool(
  'memory_filesystem',
  'Workspace-scoped filesystem operations with safety boundaries. Actions: read (read file content), write (write/create a file), search (find files by glob/regex), list (directory listing), tree (recursive directory tree), delete (delete file/empty directory; requires confirm), move (move/rename path), copy (copy file), append (append to existing file), exists (check existence and type).',
  {
    action: z.enum(['read', 'write', 'search', 'list', 'tree', 'delete', 'move', 'copy', 'append', 'exists']).describe('The action to perform'),
    workspace_id: z.string().describe('Workspace ID — all paths are resolved relative to the workspace root'),
    path: z.string().optional().describe('File or directory path relative to workspace root'),
    content: z.string().optional().describe('File content (for write/append)'),
    create_dirs: z.boolean().optional().describe('Auto-create parent directories (for write). Default true'),
    pattern: z.string().optional().describe('Glob pattern (for search)'),
    regex: z.string().optional().describe('Regex pattern (for search, alternative to glob)'),
    include: z.string().optional().describe('File include filter, e.g. "*.ts" (for search)'),
    recursive: z.boolean().optional().describe('Recurse into subdirectories (for list)'),
    max_depth: z.number().optional().describe('Maximum tree depth (for tree). Default 3, max 10'),
    confirm: z.boolean().optional().describe('Explicit confirmation for destructive operations (required for delete)'),
    dry_run: z.boolean().optional().describe('Preview destructive operation without side effects (delete/move)'),
    source: z.string().optional().describe('Source path for move/copy actions'),
    destination: z.string().optional().describe('Destination path for move/copy actions'),
    overwrite: z.boolean().optional().describe('Overwrite destination when it exists (move/copy). Default false')
  },
  async (params) => {
    const result = await withLogging('memory_filesystem', params, () =>
      consolidatedTools.memoryFilesystem(params as consolidatedTools.MemoryFilesystemParams)
    );
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
    };
  }
);

// =============================================================================
// Session Tool — session management & spawn preparation
// =============================================================================

server.tool(
  'memory_session',
  'Agent session management and spawn preparation. Actions: prep (mint session ID, enrich prompt with context/scope/anti-spawning blocks — does NOT execute spawns), list_sessions (query sessions from plan state), get_session (find a specific session by ID).',
  {
    action: z.enum(['prep', 'list_sessions', 'get_session']).describe('The action to perform'),
    workspace_id: z.string().optional().describe('Workspace ID'),
    plan_id: z.string().optional().describe('Plan ID'),
    agent_name: z.string().optional().describe('Target agent name (for prep)'),
    prompt: z.string().optional().describe('Base prompt to enrich (for prep)'),
    compat_mode: z.enum(['legacy', 'strict']).optional().describe('Compatibility mode (for prep). strict returns prep_config only; legacy also returns spawn_config alias'),
    parent_session_id: z.string().optional().describe('Parent session ID for lineage tracking (for prep)'),
    prep_config: z.object({
      scope_boundaries: z.object({
        files_allowed: z.array(z.string()).optional().describe('Files the subagent may modify'),
        directories_allowed: z.array(z.string()).optional().describe('Directories for new file creation'),
        scope_escalation_instruction: z.string().optional().describe('Custom scope escalation instruction')
      }).optional()
    }).optional().describe('Preparation config with scope boundaries (for prep)'),
    session_id: z.string().optional().describe('Session ID to look up (for get_session)'),
    status_filter: z.enum(['active', 'stopping', 'completed', 'all']).optional().describe('Filter sessions by status (for list_sessions)')
  },
  async (params) => {
    const result = await withLogging('memory_session', params, () =>
      consolidatedTools.memorySession(params as consolidatedTools.MemorySessionParams)
    );
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
    };
  }
);

  return server;
}

// =============================================================================
// Server Startup
// =============================================================================

async function main() {
  // Validate environment variables (6A.4)
  const dataRoot = process.env.MBS_DATA_ROOT;
  const agentsRoot = process.env.MBS_AGENTS_ROOT;
  if (dataRoot) {
    const fs = await import('fs');
    if (!fs.existsSync(dataRoot)) {
      console.error(`Warning: MBS_DATA_ROOT directory does not exist: ${dataRoot}`);
      console.error('Creating directory...');
      fs.mkdirSync(dataRoot, { recursive: true });
    }
  }
  if (agentsRoot) {
    const fs = await import('fs');
    if (!fs.existsSync(agentsRoot)) {
      console.error(`Warning: MBS_AGENTS_ROOT directory does not exist: ${agentsRoot}`);
    }
  }
  const skillsRoot = process.env.MBS_SKILLS_ROOT;
  if (skillsRoot) {
    const fs = await import('fs');
    if (!fs.existsSync(skillsRoot)) {
      console.error(`Warning: MBS_SKILLS_ROOT directory does not exist: ${skillsRoot}`);
    }
  }

  // Initialize data root
  await store.initDataRoot();

  const { transport, port } = parseCliArgs();
  
  console.error('Project Memory MCP Server starting...');
  console.error(`Data root: ${store.getDataRoot()}`);
  console.error(`Transport: ${transport}`);

  if (transport === 'stdio') {
    // Local stdio transport (default)
    const server = createMcpServer();
    const stdioTransport = new StdioServerTransport();
    await server.connect(stdioTransport);
    console.error('Project Memory MCP Server running (stdio, local)');

    // Start alert listener for container-ready notifications
    const alertListener = new ContainerAlertListener();
    await alertListener.start();

    // Graceful cleanup on exit
    process.on('SIGINT', async () => {
      await alertListener.stop();
      process.exit(0);
    });
  } else {
    // HTTP-based transport (container mode)
    // Set up data-root liveness monitoring
    setDataRoot(store.getDataRoot());
    startLivenessPolling();

    const app = createHttpApp(createMcpServer);
    
    const httpServer = app.listen(port, () => {
      console.error(`Project Memory MCP Server running (${transport}) on port ${port}`);
      console.error(`  Health: http://localhost:${port}/health`);
      if (transport === 'streamable-http' || transport === 'sse') {
        console.error(`  MCP:    http://localhost:${port}/mcp`);
        console.error(`  SSE:    http://localhost:${port}/sse`);
      }

      // Send container-ready alert to host (fire-and-forget)
      void sendStartupAlert(port, '1.0.0', transport);
    });

    // Graceful shutdown
    const shutdown = async () => {
      console.error('Shutting down...');
      stopLivenessPolling();
      await closeAllTransports();
      httpServer.close();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  }
}

main().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
