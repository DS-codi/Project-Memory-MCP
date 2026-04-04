// Claude-profile MCP server — simplified tool set for Claude Code hub-and-spoke.
//
// Registers the same tool surface as the CLI server but:
//   - Omits memory_filesystem (Claude Code has native Read/Glob/Grep)
//   - Omits memory_brainstorm (absorbed into memory_agent for Claude profile)
//   - Adds prep_claude action on memory_session
//
// Default port: 3467  (same as CLI profile — single process, same DB)
// Supervisor component name: claude-mcp

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import * as workspaceTools from './tools/workspace.tools.js';
import * as store from './storage/db-store.js';
import { logToolCall, runWithToolContext } from './logging/tool-logger.js';
import { touchLiveSession, hasInstructionsSurfaced, markInstructionsSurfaced } from './tools/session-live-store.js';
import { getAutoSurfaceInstructions } from './db/instruction-db.js';
import * as consolidatedTools from './tools/consolidated/index.js';
import { memoryTask, type MemoryTaskParams } from './tools/consolidated/memory_task.js';
import { createHttpApp, closeAllTransports, type TransportType } from './transport/http-transport.js';
import { ContainerAlertListener } from './transport/container-alert-listener.js';
import { sendStartupAlert } from './transport/container-startup-alert.js';
import { setDataRoot, startLivenessPolling, stopLivenessPolling } from './transport/data-root-liveness.js';
import { getDb } from './db/connection.js';
import { getImportantResponseContextForRequest } from './utils/important-response-context.js';
import { formatZodError, isZodError } from './utils/zod-error-formatter.js';
import { detectUnknownFields } from './tools/preflight/index.js';

// =============================================================================
// Logging Helper (identical to index.ts)
// =============================================================================

async function withLogging<T>(
  toolName: string,
  params: Record<string, unknown>,
  fn: () => Promise<T>
): Promise<T> {
  return runWithToolContext(toolName, params, async () => {
    const startTime = Date.now();

    const sessionId = params._session_id as string | undefined;
    if (sessionId) {
      touchLiveSession(sessionId, toolName);
    }

    const action = params.action as string | undefined;
    if (action) {
      const unknowns = detectUnknownFields(toolName, action, params);
      if (unknowns) {
        const details = unknowns.map(u =>
          u.suggestion ? `${u.field} (did you mean '${u.suggestion}'?)` : u.field
        ).join(', ');
        console.error(`[withLogging] Unknown properties in ${toolName}(action: "${action}"): [${details}]`);
      }
    }

    try {
      const result = await fn();

      if (result && typeof result === 'object' && 'success' in result) {
        const importantContext = await getImportantResponseContextForRequest({
          workspace_id: params.workspace_id,
          workspace_path: params.workspace_path,
        });
        if (importantContext) {
          (result as Record<string, unknown>).important_context = importantContext;
        }

        // Phase 2 — Workspace-First Instructions: inject auto_surface instructions
        // on the first tool call in a session for a given workspace.
        const workspaceId = params.workspace_id as string | undefined;
        if (workspaceId && sessionId && !hasInstructionsSurfaced(sessionId, workspaceId)) {
          try {
            const autoSurfaceInstructions = getAutoSurfaceInstructions(workspaceId);
            if (autoSurfaceInstructions.length > 0) {
              (result as Record<string, unknown>).priority_instructions = {
                surfaced_at: new Date().toISOString(),
                workspace_id: workspaceId,
                instructions: autoSurfaceInstructions.map(i => ({
                  filename: i.filename,
                  priority: i.priority,
                  content:  i.content,
                })),
                notice: 'PRIORITY: These workspace instructions must be followed for all work in this session.',
              };
            }
            markInstructionsSurfaced(sessionId, workspaceId);
          } catch {
            // Non-fatal: if the migration hasn't run yet or columns are missing, skip silently.
          }
        }
      }

      const durationMs = Date.now() - startTime;
      const resultObj = result as { success?: boolean; error?: string };
      await logToolCall(
        toolName, params,
        resultObj.success !== false ? 'success' : 'error',
        resultObj.error, durationMs
      );

      return result;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = isZodError(error)
        ? formatZodError(error, toolName)
        : (error as Error).message;
      await logToolCall(toolName, params, 'error', errorMessage, durationMs);
      if (isZodError(error)) throw new Error(errorMessage);
      throw error;
    }
  });
}

// =============================================================================
// CLI Argument Parsing
// =============================================================================

function parseCliArgs(): { transport: TransportType; port: number } {
  const args = process.argv.slice(2);
  let transport: TransportType = 'stdio';
  let port = 3467;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--transport' && args[i + 1]) {
      const value = args[i + 1];
      if (value === 'stdio' || value === 'sse' || value === 'streamable-http') {
        transport = value as TransportType;
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
// Shared Zod schemas
// =============================================================================

const AgentTypeSchema = z.preprocess(
  (val) => val === 'Hub' ? 'Coordinator' : val,
  z.enum([
    'Coordinator', 'Analyst', 'Researcher', 'Architect', 'Executor',
    'Reviewer', 'Tester', 'Revisionist', 'Archivist',
    'Brainstorm', 'Runner', 'SkillWriter', 'Worker', 'TDDDriver', 'Cognition',
    'Migrator'
  ])
);

const StepStatusSchema = z.enum(['pending', 'active', 'done', 'blocked']);

const StepTypeSchema = z.enum([
  'standard', 'analysis', 'validation', 'user_validation', 'complex',
  'critical', 'build', 'fix', 'refactor', 'confirmation',
  'research', 'planning', 'code', 'test', 'documentation'
]).optional().default('standard');

const PrioritySchema = z.enum(['low', 'medium', 'high', 'critical']);

// =============================================================================
// Server Factory
// =============================================================================

export function createClaudeMcpServer(): McpServer {

const server = new McpServer({
  name: 'project-memory-claude',
  version: '1.0.0'
});

// =============================================================================
// memory_workspace
// =============================================================================

server.tool(
  'memory_workspace',
  'Consolidated workspace management tool. Actions: register (register a workspace directory), list (list all workspaces), info (get plans for a workspace), reindex (update codebase profile after changes), migrate (re-register workspace, find and merge all ghost/duplicate folders, recover plans), link (link/unlink parent-child workspace hierarchy), export_pending (export all unfinished steps to a .md file), inject_cli_mcp (write or update .mcp.json at workspace root for Claude Code agent discovery).',
  {
    action: z.enum(['register', 'list', 'info', 'reindex', 'merge', 'scan_ghosts', 'migrate', 'link', 'set_display_name', 'export_pending', 'generate_focused_workspace', 'list_focused_workspaces', 'check_context_sync', 'import_context_file', 'inject_cli_mcp']).describe('The action to perform'),
    workspace_id: z.string().optional().describe('Workspace ID'),
    workspace_path: z.string().optional().describe('Absolute path to workspace root (for register)'),
    display_name: z.string().optional().describe('Display name (for set_display_name)'),
    parent_workspace_id: z.string().optional().describe('Parent workspace ID (for link)'),
    child_workspace_id: z.string().optional().describe('Child workspace ID (for link)'),
    operation: z.enum(['link', 'unlink']).optional().describe('Link operation'),
    source_workspace_id: z.string().optional().describe('Source workspace ID (for merge)'),
    target_workspace_id: z.string().optional().describe('Target workspace ID (for merge)'),
    output_path: z.string().optional().describe('Output file path (for export_pending)'),
    scope: z.string().optional().describe('Scope definition (for generate_focused_workspace)'),
    all_workspaces: z.boolean().optional().describe('Apply to all workspaces (for inject_cli_mcp)'),
    verbose: z.boolean().optional().describe('When true, return full WorkspaceMeta objects for list action; default false returns a slim summary per workspace'),
    _session_id: z.string().optional().describe('Session ID for instrumentation tracking')
  },
  async (params) => {
    const result = await withLogging('memory_workspace', params, () =>
      consolidatedTools.memoryWorkspace(params as consolidatedTools.MemoryWorkspaceParams)
    );
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  }
);

// =============================================================================
// memory_plan
// =============================================================================

server.tool(
  'memory_plan',
  'Plan lifecycle management. Actions: list, get, create, update, archive, import, find, add_note, delete, consolidate, set_goals, add_build_script, list_build_scripts, run_build_script, delete_build_script, create_from_template, list_templates.',
  {
    action: z.enum(['list', 'get', 'create', 'update', 'archive', 'import', 'find', 'add_note', 'delete', 'consolidate', 'set_goals', 'add_build_script', 'list_build_scripts', 'run_build_script', 'delete_build_script', 'create_from_template', 'list_templates']).describe('The action to perform'),
    workspace_id: z.string().optional().describe('Workspace ID'),
    plan_id: z.string().optional().describe('Plan ID'),
    title: z.string().optional().describe('Plan title'),
    description: z.string().optional().describe('Plan description'),
    status: z.enum(['active', 'completed', 'archived']).optional().describe('Plan status'),
    current_phase: z.string().optional().describe('Current phase name'),
    goals: z.array(z.string()).optional().describe('Plan goals'),
    success_criteria: z.array(z.string()).optional().describe('Success criteria'),
    note: z.string().optional().describe('Note to add'),
    plan_data: z.record(z.unknown()).optional().describe('Plan data for import'),
    template_name: z.string().optional().describe('Template name'),
    script_name: z.string().optional().describe('Build script name'),
    script_content: z.string().optional().describe('Build script content'),
    _session_id: z.string().optional().describe('Session ID for instrumentation tracking')
  },
  async (params) => {
    const result = await withLogging('memory_plan', params, () =>
      consolidatedTools.memoryPlan(params as consolidatedTools.MemoryPlanParams)
    );
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  }
);

// =============================================================================
// memory_steps
// =============================================================================

server.tool(
  'memory_steps',
  'Step management. Actions: add, update, batch_update, insert, delete, reorder, move, sort, set_order.',
  {
    action: z.enum(['add', 'update', 'batch_update', 'insert', 'delete', 'reorder', 'move', 'sort', 'set_order']).describe('The action to perform'),
    workspace_id: z.string().optional().describe('Workspace ID'),
    plan_id: z.string().optional().describe('Plan ID'),
    step_index: z.number().int().optional().describe('Zero-based step index'),
    step_indices: z.array(z.number().int()).optional().describe('Multiple step indices'),
    title: z.string().optional().describe('Step title'),
    description: z.string().optional().describe('Step description'),
    status: StepStatusSchema.optional().describe('Step status'),
    notes: z.string().optional().describe('Step notes'),
    step_type: StepTypeSchema,
    priority: PrioritySchema.optional(),
    phase: z.string().optional().describe('Phase name'),
    steps: z.array(z.object({
      title: z.string(),
      description: z.string().optional(),
      status: StepStatusSchema.optional(),
      step_type: StepTypeSchema,
      phase: z.string().optional(),
      priority: PrioritySchema.optional(),
    })).optional().describe('Steps array (for add/batch_update)'),
    from_index: z.number().int().optional().describe('Source index (for move)'),
    to_index: z.number().int().optional().describe('Destination index (for move)'),
    order: z.array(z.number().int()).optional().describe('New order array (for reorder/set_order)'),
    sort_by: z.enum(['phase', 'priority', 'status', 'type']).optional().describe('Sort field'),
    _session_id: z.string().optional().describe('Session ID for instrumentation tracking')
  },
  async (params) => {
    const result = await withLogging('memory_steps', params, () =>
      consolidatedTools.memorySteps(params as consolidatedTools.MemoryStepsParams)
    );
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  }
);

// =============================================================================
// memory_agent
// =============================================================================

server.tool(
  'memory_agent',
  'Agent lifecycle and deployment. Actions: init, complete, handoff, validate, list, get_instructions, deploy, get_briefing, get_lineage, route (send FormRequest to GUI via Supervisor — gets human attention immediately), route_with_fallback.',
  {
    action: z.enum(['init', 'complete', 'handoff', 'validate', 'list', 'get_instructions', 'deploy', 'get_briefing', 'get_lineage', 'route', 'route_with_fallback', 'get_skill', 'list_skills', 'list_workspace_skills', 'list_workspace_instructions']).describe('The action to perform'),
    workspace_id: z.string().optional().describe('Workspace ID'),
    plan_id: z.string().optional().describe('Plan ID'),
    session_id: z.string().optional().describe('Session ID'),
    agent_type: AgentTypeSchema.optional().describe('Agent type'),
    from_agent: z.string().optional().describe('Source agent (for handoff)'),
    to_agent: z.string().optional().describe('Target agent (for handoff)'),
    reason: z.string().optional().describe('Handoff reason'),
    summary: z.string().optional().describe('Session summary (for complete)'),
    artifacts: z.array(z.string()).optional().describe('Produced artifacts (for complete)'),
    data: z.record(z.unknown()).optional().describe('Additional data'),
    instruction_name: z.string().optional().describe('Instruction name (for get_instructions)'),
    skill_name: z.string().optional().describe('Skill name (for get_skill)'),
    form_request: z.record(z.unknown()).optional().describe('FormRequest payload (for route/route_with_fallback)'),
    _session_id: z.string().optional().describe('Session ID for instrumentation tracking')
  },
  async (params) => {
    const result = await withLogging('memory_agent', params, () =>
      consolidatedTools.memoryAgent(params as consolidatedTools.MemoryAgentParams)
    );
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  }
);

// =============================================================================
// memory_context
// =============================================================================

server.tool(
  'memory_context',
  'Context and research management. Actions: store, get, store_initial, list, list_research, append_research, generate_instructions, batch_store, workspace_get, workspace_set, workspace_update, workspace_delete.',
  {
    action: z.enum(['store', 'get', 'store_initial', 'list', 'list_research', 'append_research', 'generate_instructions', 'batch_store', 'workspace_get', 'workspace_set', 'workspace_update', 'workspace_delete']).describe('The action to perform'),
    workspace_id: z.string().optional().describe('Workspace ID'),
    plan_id: z.string().optional().describe('Plan ID'),
    type: z.string().optional().describe('Context type'),
    content: z.union([z.string(), z.record(z.unknown())]).optional().describe('Context content'),
    section_key: z.string().optional().describe('Workspace context section key'),
    summary: z.string().optional().describe('Section summary'),
    items: z.array(z.record(z.unknown())).optional().describe('Section items'),
    contexts: z.array(z.object({
      type: z.string(),
      content: z.union([z.string(), z.record(z.unknown())])
    })).optional().describe('Batch contexts'),
    _session_id: z.string().optional().describe('Session ID for instrumentation tracking')
  },
  async (params) => {
    const result = await withLogging('memory_context', params, () =>
      consolidatedTools.memoryContext(params as consolidatedTools.MemoryContextParams)
    );
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  }
);

// =============================================================================
// memory_session — with prep_claude action
// =============================================================================

server.tool(
  'memory_session',
  'Agent session management and spawn preparation. Actions: prep_claude (Claude-native spoke prep — pre-embeds instructions and skills, returns enriched_prompt ready for Agent tool), prep (legacy: mint session ID + enrich prompt), list_sessions (query sessions from plan state), get_session (find a specific session by ID).',
  {
    action: z.enum(['prep_claude', 'prep', 'deploy_and_prep', 'list_sessions', 'get_session']).describe('The action to perform. Use prep_claude for Claude Code hub-and-spoke.'),
    workspace_id: z.string().optional().describe('Workspace ID'),
    plan_id: z.string().optional().describe('Plan ID'),
    // prep_claude params
    role: z.enum(['Researcher', 'Architect', 'Executor', 'Reviewer', 'Tester', 'Revisionist', 'Archivist', 'Worker']).optional().describe('Spoke role (for prep_claude)'),
    prompt: z.string().optional().describe('Task prompt for the spoke (for prep_claude / prep)'),
    phase_name: z.string().optional().describe('Current phase name'),
    step_indices: z.array(z.number()).optional().describe('Step indices assigned to this spoke'),
    parent_session_id: z.string().optional().describe('Hub session ID for lineage tracking'),
    context_summary: z.string().optional().describe('Brief summary of what Hub has done and what the spoke should know (for prep_claude)'),
    skills_to_load: z.array(z.string()).optional().describe('Explicit skill names to embed (for prep_claude; omit to embed all workspace-assigned skills)'),
    instructions_to_load: z.array(z.string()).optional().describe('Explicit instruction names to embed (for prep_claude; omit to embed all workspace-assigned instructions)'),
    prep_config: z.object({
      scope_boundaries: z.object({
        files_allowed: z.array(z.string()).optional().describe('Files the spoke may modify'),
        directories_allowed: z.array(z.string()).optional().describe('Directories for new file creation'),
        scope_escalation_instruction: z.string().optional().describe('Custom scope escalation instruction')
      }).optional()
    }).optional().describe('Scope boundaries (for prep_claude / prep)'),
    // prep / deploy_and_prep legacy params (pass-through)
    agent_name: z.string().optional().describe('Target agent name (for legacy prep/deploy_and_prep)'),
    compat_mode: z.enum(['legacy', 'strict']).optional(),
    session_id: z.string().optional().describe('Session ID to look up (for get_session)'),
    status_filter: z.enum(['active', 'stopping', 'completed', 'all']).optional().describe('Filter sessions by status (for list_sessions)'),
    _session_id: z.string().optional().describe('Session ID for instrumentation tracking')
  },
  async (params) => {
    const result = await withLogging('memory_session', params, () =>
      consolidatedTools.memorySession(params as consolidatedTools.MemorySessionParams)
    );
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  }
);

// =============================================================================
// memory_terminal
// =============================================================================

server.tool(
  'memory_terminal',
  'Terminal tool with GUI approval flow. Actions: run (execute command), spawn_cli_session (launch a provider CLI session — use provider:"claude" to fork a new Claude Code conversation with optional --resume support), read_output (get output from a session), kill (terminate a session), list_forks (list Claude conversation forks for a workspace), get_allowlist, update_allowlist.',
  {
    action: z.enum(['run', 'spawn_cli_session', 'read_output', 'kill', 'get_allowlist', 'update_allowlist', 'list_forks']).describe('The action to perform'),
    command: z.string().optional().describe('Command to execute (for run)'),
    args: z.array(z.string()).optional().describe('Command arguments (for run)'),
    cwd: z.string().optional().describe('Working directory'),
    timeout_ms: z.number().optional().describe('Execution timeout in milliseconds'),
    workspace_id: z.string().optional().describe('Workspace ID'),
    session_id: z.string().optional().describe('Session ID'),
    session_target: z.enum(['selected', 'default', 'specific']).optional(),
    patterns: z.array(z.string()).optional().describe('Allowlist patterns'),
    operation: z.enum(['add', 'remove', 'set']).optional(),
    env: z.record(z.string()).optional().describe('Per-request environment variables'),
    provider: z.string().optional().describe('Provider to launch (for spawn_cli_session): "claude", "gemini", "copilot"'),
    prompt: z.string().optional().describe('Startup prompt for spawn_cli_session'),
    context: z.object({
      requesting_agent: z.string().optional(),
      plan_id: z.string().optional(),
      session_id: z.string().optional(),
      step_notes: z.string().optional(),
      relevant_files: z.array(z.object({ path: z.string(), snippet: z.string().optional() })).optional(),
      workspace_instructions: z.string().optional(),
      custom_instructions: z.string().optional(),
      output_format: z.enum(['text', 'json', 'stream-json']).optional(),
      session_mode: z.enum(['new', 'resume']).optional(),
      resume_session_id: z.string().optional().describe('Claude conversation ID to resume with --resume (for spawn_cli_session with provider:claude)'),
      allowed_tools: z.array(z.string()).optional().describe('Tools to pass as --allowedTools (for provider:claude)'),
      claude_profile: z.string().optional().describe('Claude settings profile to use with --profile (for provider:claude)'),
    }).optional(),
    _session_id: z.string().optional().describe('Session ID for instrumentation tracking')
  },
  async (params, extra) => {
    const result = await withLogging('memory_terminal', params, () =>
      consolidatedTools.memoryTerminal(params as consolidatedTools.MemoryTerminalParams, extra)
    );
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  }
);

// =============================================================================
// memory_cartographer
// =============================================================================

server.tool(
  'memory_cartographer',
  'Codebase and plan graph mapping. Phase A actions (SQLite-based, always available): get_plan_dependencies, reverse_dependent_lookup, context_items_projection, db_map_summary.',
  {
    action: z.enum(['get_plan_dependencies', 'reverse_dependent_lookup', 'context_items_projection', 'db_map_summary', 'summary', 'file_context', 'layer_view', 'impact_radius', 'search']).describe('The action to perform'),
    workspace_id: z.string().optional().describe('Workspace ID'),
    plan_id: z.string().optional().describe('Plan ID'),
    file_path: z.string().optional().describe('File path'),
    query: z.string().optional().describe('Search query'),
    depth: z.number().optional().describe('Graph traversal depth'),
    _session_id: z.string().optional().describe('Session ID for instrumentation tracking')
  },
  async (params) => {
    const result = await withLogging('memory_cartographer', params, () =>
      consolidatedTools.handleMemoryCartographer(params as consolidatedTools.MemoryCartographerParams)
    );
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  }
);

// =============================================================================
// memory_instructions
// =============================================================================

server.tool(
  'memory_instructions',
  'Read and search instruction files from DB. Actions: get (fetch by filename), list (list all), search (search by content/applies_to), list_workspace (list workspace-assigned instructions).',
  {
    action: z.enum(['get', 'list', 'search', 'list_workspace', 'get_section', 'assign_priority']).describe('The action to perform'),
    filename: z.string().optional().describe('Instruction filename (required for: get, get_section, assign_priority)'),
    workspace_id: z.string().optional().describe('Workspace ID (for list_workspace; optional for assign_priority)'),
    query: z.string().optional().describe('Search query (for search)'),
    heading: z.string().optional().describe('Section heading (for get_section)'),
    priority: z.enum(['normal', 'critical']).optional().describe('Priority level (for assign_priority)'),
    auto_surface: z.boolean().optional().describe('Auto-surface on first session tool call (for assign_priority)'),
    _session_id: z.string().optional().describe('Session ID for instrumentation tracking')
  },
  async (params) => {
    const result = await withLogging('memory_instructions', params, () =>
      consolidatedTools.memoryInstructions(params as consolidatedTools.MemoryInstructionsParams)
    );
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  }
);

// =============================================================================
// memory_sprint
// =============================================================================

server.tool(
  'memory_sprint',
  'Sprint management. Actions: list (by workspace), get (single sprint with goals), create (new sprint), update (title/status), archive, delete, set_goals (replace goals array), add_goal, complete_goal, remove_goal, attach_plan, detach_plan.',
  {
    action: z.enum(['list', 'get', 'create', 'update', 'archive', 'delete', 'set_goals', 'add_goal', 'complete_goal', 'remove_goal', 'attach_plan', 'detach_plan']).describe('The action to perform'),
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
    _session_id: z.string().optional().describe('Session ID for instrumentation tracking')
  },
  async (params) => {
    const result = await withLogging('memory_sprint', params, () =>
      consolidatedTools.memorySprint(params as consolidatedTools.MemorySprintParams)
    );
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  }
);

// =============================================================================
// memory_task
// =============================================================================

server.tool(
  'memory_task',
  'CLI-optimised composite tool for the step work loop. Actions: get_current (returns active/pending step + goals + next_required_call hint), mark_done (mark step done — REQUIRED after completing a step), mark_blocked (mark step blocked with reason), get_context (fetch research notes for current phase), summarize_plan (phase-by-phase progress table), log_work (append findings to research notes).',
  {
    action: z.enum(['get_current', 'mark_done', 'mark_blocked', 'get_context', 'summarize_plan', 'log_work']).describe('The action to perform'),
    workspace_id: z.string().describe('Workspace ID'),
    plan_id: z.string().optional().describe('Plan ID — omit to auto-resolve from first active plan'),
    step_index: z.number().optional().describe('0-based step index (mark_done, mark_blocked, log_work)'),
    notes: z.string().optional().describe('Completion notes (mark_done)'),
    reason: z.string().optional().describe('Blocked reason (mark_blocked)'),
    context_type: z.string().optional().describe('Context type to retrieve (get_context, default: research)'),
    findings: z.string().optional().describe('Findings to append (log_work)'),
  },
  async (params) => {
    const result = await withLogging('memory_task', params, () =>
      memoryTask(params as MemoryTaskParams)
    );
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  }
);

  return server;
}

// =============================================================================
// Server Startup
// =============================================================================

async function main() {
  const dataRoot = process.env.MBS_DATA_ROOT;
  const agentsRoot = process.env.MBS_AGENTS_ROOT;
  if (dataRoot) {
    const fs = await import('fs');
    if (!fs.existsSync(dataRoot)) {
      console.error(`Warning: MBS_DATA_ROOT does not exist: ${dataRoot} — creating...`);
      fs.mkdirSync(dataRoot, { recursive: true });
    }
  }
  if (agentsRoot) {
    const fs = await import('fs');
    if (!fs.existsSync(agentsRoot)) {
      console.error(`Warning: MBS_AGENTS_ROOT does not exist: ${agentsRoot}`);
    }
  }

  await store.initDataRoot();
  void workspaceTools.syncWorkspaceRegistry();

  const { transport, port } = parseCliArgs();

  console.error('Project Memory MCP Server (Claude profile) starting...');
  console.error(`Data root: ${store.getDataRoot()}`);
  console.error(`Transport: ${transport}`);

  if (transport === 'stdio') {
    const server = createClaudeMcpServer();
    const stdioTransport = new StdioServerTransport();
    await server.connect(stdioTransport);
    console.error('Project Memory MCP (Claude profile) running (stdio)');

    const alertListener = new ContainerAlertListener();
    await alertListener.start();

    process.on('SIGINT', async () => {
      await alertListener.stop();
      try { getDb().close(); } catch { /* ignore */ }
      process.exit(0);
    });
  } else {
    setDataRoot(store.getDataRoot());
    startLivenessPolling();

    const app = createHttpApp(createClaudeMcpServer);
    const httpServer = app.listen(port, () => {
      console.error(`Project Memory MCP (Claude profile) running (${transport}) on port ${port}`);
      console.error(`  Health: http://localhost:${port}/health`);
      console.error(`  MCP:    http://localhost:${port}/mcp`);
      void sendStartupAlert(port, '1.0.0', transport);
    });

    const shutdown = async () => {
      console.error('Shutting down...');
      stopLivenessPolling();
      await closeAllTransports();
      httpServer.close();
      try { getDb().close(); } catch { /* ignore */ }
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
