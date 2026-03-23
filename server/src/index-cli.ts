/**
 * Project Memory CLI MCP Server
 *
 * A standalone HTTP MCP server tailored for CLI agents
 * (Gemini CLI, Copilot CLI, etc.) running inside Interactive Terminal sessions.
 *
 * Key differences from the main index.ts server:
 *   - HTTP-only transport (no stdio, never connected to VS Code)
 *   - Slim tool set — omits memory_agent, memory_session, memory_brainstorm,
 *     memory_terminal, memory_cartographer
 *   - Adds memory_task composite tool for fewer round-trips
 *   - No GUI approval flow, no live-session tracking, no tray/proxy integration
 *   - Shares the same SQLite database as the main MCP server
 *
 * Transport:  HTTP Streamable (POST /mcp) on --port <n> (default 3466)
 * Health:     GET /health
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import * as store from './storage/db-store.js';
import { createHttpApp, closeAllTransports } from './transport/http-transport.js';
import * as consolidatedTools from './tools/consolidated/index.js';
import { memoryTask } from './tools/consolidated/memory_task.js';

// =============================================================================
// Shared Zod sub-schemas (mirrors those used in index.ts)
// =============================================================================

const StepStatusSchema = z.enum(['pending', 'active', 'done', 'blocked']);

const StepTypeSchema = z.enum([
  'standard', 'analysis', 'validation', 'user_validation', 'complex',
  'critical', 'build', 'fix', 'refactor', 'confirmation', 'research',
  'planning', 'code', 'test', 'documentation',
]);

const RequestCategorySchema = z.enum([
  'feature', 'bug', 'change', 'analysis', 'investigation', 'debug',
  'refactor', 'documentation',
]);

const PrioritySchema = z.enum(['low', 'medium', 'high', 'critical']);

// Step object used in memory_plan / memory_steps actions
const StepObjectSchema = z.object({
  phase: z.string(),
  task: z.string(),
  type: StepTypeSchema,
  status: StepStatusSchema.optional().default('pending'),
  notes: z.string().optional(),
  assignee: z.string().optional(),
  depends_on: z.array(z.number()).optional(),
  requires_validation: z.boolean().optional(),
  requires_confirmation: z.boolean().optional(),
  requires_user_confirmation: z.boolean().optional(),
});

// =============================================================================
// CLI MCP Server Factory
// =============================================================================

function createCliMcpServer(): McpServer {
  const server = new McpServer({
    name: 'project-memory-cli-mcp',
    version: '1.0.0',
  });

  // ---- memory_workspace -------------------------------------------------------
  server.tool(
    'memory_workspace',
    'Workspace management. Actions: register (register a workspace), list (list all workspaces), info (get plans for a workspace), reindex (update codebase profile), migrate (recover old workspace data), scan_ghosts.',
    {
      action: z.enum([
        'register', 'list', 'info', 'reindex', 'merge', 'scan_ghosts', 'migrate',
        'link', 'export_pending', 'generate_focused_workspace', 'list_focused_workspaces',
      ]).describe('The action to perform'),
      workspace_id: z.string().optional().describe('Workspace ID'),
      workspace_path: z.string().optional().describe('Workspace path'),
      force: z.boolean().optional(),
      source_workspace_id: z.string().optional(),
      target_workspace_id: z.string().optional(),
      dry_run: z.boolean().optional(),
      child_workspace_id: z.string().optional(),
      mode: z.enum(['link', 'unlink']).optional(),
      hierarchical: z.boolean().optional(),
      output_filename: z.string().optional(),
      plan_id: z.string().optional(),
      files_allowed: z.array(z.string()).optional(),
      directories_allowed: z.array(z.string()).optional(),
      base_workspace_path: z.string().optional(),
      session_id: z.string().optional(),
    },
    async (params) => {
      const result = await consolidatedTools.memoryWorkspace(
        params as consolidatedTools.MemoryWorkspaceParams,
      );
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  // ---- memory_plan ------------------------------------------------------------
  server.tool(
    'memory_plan',
    'Plan lifecycle management. Actions: list, get, create, update, archive, import, find, add_note, delete, consolidate, set_goals, add_build_script, list_build_scripts, run_build_script, delete_build_script, create_from_template, list_templates, confirm, create_program, add_plan_to_program, upgrade_to_program, list_program_plans, set_plan_dependencies, get_plan_dependencies, set_plan_priority, clone_plan, merge_plans, pause_plan, resume_plan, search.',
    {
      action: z.enum([
        'list', 'get', 'create', 'update', 'archive', 'import', 'find',
        'add_note', 'delete', 'consolidate', 'set_goals',
        'add_build_script', 'list_build_scripts', 'run_build_script', 'delete_build_script',
        'create_from_template', 'list_templates', 'confirm',
        'create_program', 'add_plan_to_program', 'upgrade_to_program', 'list_program_plans',
        'export_plan', 'link_to_program', 'unlink_from_program',
        'set_plan_dependencies', 'get_plan_dependencies', 'set_plan_priority',
        'clone_plan', 'merge_plans', 'pause_plan', 'resume_plan', 'search',
      ]).describe('The action to perform'),
      workspace_id: z.string().optional(),
      workspace_path: z.string().optional(),
      plan_id: z.string().optional(),
      program_id: z.string().optional(),
      move_steps_to_child: z.boolean().optional(),
      child_plan_title: z.string().optional(),
      title: z.string().optional(),
      description: z.string().optional(),
      category: RequestCategorySchema.optional(),
      priority: PrioritySchema.optional(),
      steps: z.array(StepObjectSchema).optional(),
      include_archived: z.boolean().optional(),
      plan_file_path: z.string().optional(),
      note: z.string().optional(),
      note_type: z.enum(['info', 'warning', 'instruction']).optional(),
      confirm: z.boolean().optional(),
      step_indices: z.array(z.number()).optional(),
      consolidated_task: z.string().optional(),
      goals: z.array(z.string()).optional(),
      success_criteria: z.array(z.string()).optional(),
      script_name: z.string().optional(),
      script_description: z.string().optional(),
      script_command: z.string().optional(),
      script_directory: z.string().optional(),
      script_mcp_handle: z.string().optional(),
      script_id: z.string().optional(),
      template: z.enum([
        'feature', 'bugfix', 'refactor', 'documentation', 'analysis', 'investigation_workflow',
      ]).optional(),
      confirmation_scope: z.enum(['phase', 'step']).optional(),
      confirm_phase: z.string().optional(),
      confirm_step_index: z.number().optional(),
      confirmed_by: z.string().optional(),
      depends_on_plans: z.array(z.string()).optional(),
      new_title: z.string().optional(),
      reset_steps: z.boolean().optional(),
      link_to_same_program: z.boolean().optional(),
      target_plan_id: z.string().optional(),
      source_plan_ids: z.array(z.string()).optional(),
      archive_sources: z.boolean().optional(),
      pause_reason: z.enum(['rejected', 'timeout', 'deferred']).optional(),
      pause_step_index: z.number().optional(),
      pause_user_notes: z.string().optional(),
      pause_session_id: z.string().optional(),
      query: z.string().optional(),
      search_entity_type: z.enum(['program', 'plan', 'phase', 'step']).optional(),
      search_status: z.string().optional(),
      search_phase: z.string().optional(),
      search_limit: z.number().int().positive().optional(),
      search_include_archived: z.boolean().optional(),
    },
    async (params) => {
      const result = await consolidatedTools.memoryPlan(
        params as consolidatedTools.MemoryPlanParams,
      );
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  // ---- memory_steps -----------------------------------------------------------
  server.tool(
    'memory_steps',
    'Step management. Actions: add, update, batch_update, insert, delete, reorder, move, sort, set_order, replace.',
    {
      action: z.enum([
        'add', 'update', 'batch_update', 'insert', 'delete', 'reorder',
        'move', 'sort', 'set_order', 'replace',
      ]).describe('The action to perform'),
      workspace_id: z.string(),
      plan_id: z.string(),
      steps: z.array(StepObjectSchema).optional(),
      step_index: z.number().optional(),
      status: StepStatusSchema.optional(),
      notes: z.string().optional(),
      agent_type: z.string().optional(),
      updates: z.array(z.object({
        index: z.number(),
        status: StepStatusSchema.optional(),
        notes: z.string().optional(),
      })).optional(),
      at_index: z.number().optional(),
      step: StepObjectSchema.optional(),
      direction: z.enum(['up', 'down']).optional(),
      from_index: z.number().optional(),
      to_index: z.number().optional(),
      phase_order: z.array(z.string()).optional(),
      new_order: z.array(z.number()).optional(),
      replacement_steps: z.array(StepObjectSchema).optional(),
    },
    async (params) => {
      const result = await consolidatedTools.memorySteps(
        params as consolidatedTools.MemoryStepsParams,
      );
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  // ---- memory_context ---------------------------------------------------------
  server.tool(
    'memory_context',
    'Context and research management. Actions: store, get, store_initial, list, list_research, append_research, generate_instructions, batch_store, workspace_get, workspace_set, workspace_update, workspace_delete, knowledge_store, knowledge_get, knowledge_list, knowledge_delete, search, pull, write_prompt, dump_context.',
    {
      action: z.enum([
        'store', 'get', 'store_initial', 'list', 'list_research', 'append_research',
        'generate_instructions', 'batch_store',
        'workspace_get', 'workspace_set', 'workspace_update', 'workspace_delete',
        'knowledge_store', 'knowledge_get', 'knowledge_list', 'knowledge_delete',
        'search', 'promptanalyst_discover', 'pull', 'write_prompt', 'dump_context',
      ]).describe('The action to perform'),
      workspace_id: z.string(),
      plan_id: z.string().optional(),
      type: z.string().optional(),
      data: z.record(z.unknown()).optional(),
      query: z.string().optional(),
      scope: z.enum(['plan', 'workspace', 'program', 'all']).optional(),
      types: z.array(z.string()).optional(),
      selectors: z.array(z.record(z.unknown())).optional(),
      limit: z.number().int().positive().optional(),
      user_request: z.string().optional(),
      files_mentioned: z.array(z.string()).optional(),
      file_contents: z.record(z.string()).optional(),
      requirements: z.array(z.string()).optional(),
      constraints: z.array(z.string()).optional(),
      examples: z.array(z.string()).optional(),
      conversation_context: z.string().optional(),
      additional_notes: z.string().optional(),
      filename: z.string().optional(),
      content: z.string().optional(),
      output_path: z.string().optional(),
      items: z.array(z.object({ type: z.string(), data: z.record(z.unknown()) })).optional(),
      slug: z.string().optional(),
      title: z.string().optional(),
      category: z.string().optional(),
      tags: z.array(z.string()).optional(),
      created_by_agent: z.string().optional(),
      created_by_plan: z.string().optional(),
      prompt_title: z.string().optional(),
      prompt_agent: z.string().optional(),
      prompt_description: z.string().optional(),
      prompt_sections: z.array(z.object({ title: z.string(), content: z.string() })).optional(),
      prompt_variables: z.array(z.string()).optional(),
      prompt_raw_body: z.string().optional(),
      prompt_mode: z.string().optional(),
      prompt_phase: z.string().optional(),
      prompt_step_indices: z.array(z.number()).optional(),
      prompt_expires_after: z.string().optional(),
      prompt_version: z.string().optional(),
      prompt_slug: z.string().optional(),
    },
    async (params) => {
      const result = await consolidatedTools.memoryContext(
        params as consolidatedTools.MemoryContextParams,
      );
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  // ---- memory_filesystem ------------------------------------------------------
  server.tool(
    'memory_filesystem',
    'Workspace-scoped filesystem operations. Actions: read, write, search, discover_codebase, list, tree, delete, move, copy, append, exists.',
    {
      action: z.enum([
        'read', 'write', 'search', 'discover_codebase', 'list', 'tree',
        'delete', 'move', 'copy', 'append', 'exists',
      ]).describe('The action to perform'),
      workspace_id: z.string(),
      path: z.string().optional(),
      content: z.string().optional(),
      create_dirs: z.boolean().optional(),
      pattern: z.string().optional(),
      regex: z.string().optional(),
      include: z.string().optional(),
      prompt_text: z.string().optional(),
      task_text: z.string().optional(),
      limit: z.number().optional(),
      recursive: z.boolean().optional(),
      max_depth: z.number().optional(),
      confirm: z.boolean().optional(),
      dry_run: z.boolean().optional(),
      source: z.string().optional(),
      destination: z.string().optional(),
      overwrite: z.boolean().optional(),
    },
    async (params) => {
      const result = await consolidatedTools.memoryFilesystem(
        params as consolidatedTools.MemoryFilesystemParams,
      );
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  // ---- memory_task (CLI-optimised composite) ----------------------------------
  server.tool(
    'memory_task',
    'CLI-optimised composite tool. Replaces 4-5 round-trips for the get-current-step → work → mark-done loop. Actions: get_current (idempotent — returns active/pending step + lookahead + goals; marks step active only if pending), mark_done (mark step done, returns next step), mark_blocked (mark step blocked), get_context (fetch research notes for current phase), summarize_plan (phase-by-phase progress table), log_work (append findings to research notes). All responses are trimmed — no lineage, no session history, no skill injection.',
    {
      action: z.enum([
        'get_current', 'mark_done', 'mark_blocked',
        'get_context', 'summarize_plan', 'log_work',
      ]).describe('The action to perform'),
      workspace_id: z.string().describe('Workspace ID'),
      plan_id: z.string().optional().describe('Plan ID — omit to auto-resolve from first active plan'),
      step_index: z.number().optional().describe('0-based step index (mark_done, mark_blocked, log_work)'),
      notes: z.string().optional().describe('Completion notes (mark_done)'),
      reason: z.string().optional().describe('Blocked reason (mark_blocked)'),
      context_type: z.string().optional().describe('Context type to retrieve (get_context, default: research)'),
      findings: z.string().optional().describe('Findings to append (log_work)'),
    },
    async (params) => {
      const result = await memoryTask(params as import('./tools/consolidated/memory_task.js').MemoryTaskParams);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  // ---- memory_sprint ----------------------------------------------------------
  server.tool(
    'memory_sprint',
    'Sprint management. Actions: list (by workspace), get (single sprint with goals), create (new sprint), update (title/status), archive, delete, set_goals (replace goals array), add_goal, complete_goal, remove_goal, attach_plan, detach_plan.',
    {
      action: z.enum([
        'list', 'get', 'create', 'update', 'archive', 'delete',
        'set_goals', 'add_goal', 'complete_goal', 'remove_goal',
        'attach_plan', 'detach_plan',
      ]).describe('The action to perform'),
      workspace_id: z.string().optional().describe('Workspace ID (required for list, create)'),
      sprint_id: z.string().optional().describe('Sprint ID'),
      title: z.string().optional().describe('Sprint title'),
      status: z.enum(['active', 'completed', 'archived']).optional().describe('Sprint status'),
      plan_id: z.string().optional().describe('Plan ID to attach'),
      goals: z.array(z.string()).optional().describe('Array of goal descriptions (for set_goals)'),
      goal_description: z.string().optional().describe('Goal description (for add_goal)'),
      goal_id: z.string().optional().describe('Goal ID (for complete_goal, remove_goal)'),
      include_archived: z.boolean().optional().describe('Include archived sprints in list'),
      confirm: z.boolean().optional().describe('Confirmation for delete action'),
    },
    async (params) => {
      const result = await consolidatedTools.memorySprint(
        params as consolidatedTools.MemorySprintParams,
      );
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  return server;
}

// =============================================================================
// CLI argument parsing helpers
// =============================================================================

function parsePort(): number {
  const idx = process.argv.indexOf('--port');
  if (idx !== -1 && process.argv[idx + 1]) {
    const n = parseInt(process.argv[idx + 1], 10);
    if (!isNaN(n) && n > 0 && n < 65536) return n;
  }
  const fromEnv = parseInt(process.env.PM_CLI_MCP_PORT ?? '', 10);
  if (!isNaN(fromEnv) && fromEnv > 0 && fromEnv < 65536) return fromEnv;
  return 3466;
}

// =============================================================================
// Entry point
// =============================================================================

async function main(): Promise<void> {
  const port = parsePort();

  // Initialise shared SQLite store (same data root as the main MCP server)
  await store.initDataRoot();

  const app = createHttpApp(createCliMcpServer);
  const host = process.env.PM_CLI_MCP_HOST ?? '127.0.0.1';

  const httpServer = app.listen(port, host, () => {
    console.error(`[cli-mcp] CLI MCP server listening on http://${host}:${port}/mcp`);
    console.error(`[cli-mcp] Health endpoint: http://${host}:${port}/health`);
  });

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    console.error(`[cli-mcp] Received ${signal} — shutting down`);
    await closeAllTransports();
    httpServer.close(() => {
      console.error('[cli-mcp] HTTP server closed');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('[cli-mcp] Fatal error:', err);
  process.exit(1);
});
