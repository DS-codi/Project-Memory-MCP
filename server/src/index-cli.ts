/**
 * Project Memory CLI MCP Server
 *
 * A standalone HTTP MCP server tailored for CLI agents
 * (Gemini CLI, Copilot CLI, etc.) running inside Interactive Terminal sessions.
 *
 * Key differences from the main index.ts server:
 *   - HTTP-only transport (no stdio, never connected to VS Code)
 *   - Adds memory_task composite tool for fewer round-trips
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

const AgentTypeSchema = z.preprocess(
  (val) => val === 'Hub' ? 'Coordinator' : val,
  z.enum([
    'Coordinator', 'Analyst', 'Researcher', 'Architect', 'Executor',
    'Reviewer', 'Tester', 'Revisionist', 'Archivist',
    'Brainstorm', 'Runner', 'SkillWriter', 'Worker', 'TDDDriver', 'Cognition',
    'Migrator',
  ])
);

const StepStatusSchema = z.enum(['pending', 'active', 'done', 'blocked']);

const StepTypeSchema = z.enum([
  'standard', 'analysis', 'validation', 'user_validation', 'complex',
  'critical', 'build', 'fix', 'refactor', 'confirmation', 'research',
  'planning', 'code', 'test', 'documentation',
]);

const RequestCategorySchema = z.enum([
  'feature', 'bugfix', 'refactor', 'orchestration', 'program', 'quick_task', 'advisory',
]);

const PrioritySchema = z.enum(['low', 'medium', 'high', 'critical']);

const RequestCategorizationSchema = z.object({
  category: RequestCategorySchema,
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  suggested_workflow: z.array(AgentTypeSchema),
  skip_agents: z.array(AgentTypeSchema).optional(),
});

const PromptAnalystOutputSchema = z.object({
  provisioning_contract_version: z.string().optional(),
  hub_skill_bundle_id: z.string().optional(),
  hub_skill_bundle_version: z.string().optional(),
  hub_skill_scope: z.enum(['task', 'phase', 'plan']).optional(),
  hub_skill_selection_reason: z.string().optional(),
  confidence: z.number().optional(),
  requires_fallback: z.boolean().optional(),
  fallback_policy_hint: z.enum(['deny', 'allow_compat', 'allow_static_restore']).optional(),
  trace_id: z.string().optional(),
}).optional();

const HubDecisionPayloadSchema = z.object({
  bundle_decision_id: z.string().optional(),
  bundle_decision_version: z.string().optional(),
  hub_selected_skill_bundle: z.object({
    bundle_id: z.string().optional(),
    version: z.string().optional(),
    scope: z.enum(['task', 'phase', 'plan']).optional(),
    source: z.enum(['promptanalyst', 'hub_override']).optional(),
  }).optional(),
  spoke_instruction_bundle: z.object({
    bundle_id: z.string().optional(),
    version: z.string().optional(),
    instruction_ids: z.array(z.string()).optional(),
    resolution_mode: z.enum(['strict', 'compat']).optional(),
  }).optional(),
  spoke_skill_bundle: z.object({
    bundle_id: z.string().optional(),
    version: z.string().optional(),
    skill_ids: z.array(z.string()).optional(),
    resolution_mode: z.enum(['strict', 'compat']).optional(),
  }).optional(),
  fallback_policy: z.object({
    fallback_allowed: z.boolean().optional(),
    fallback_mode: z.enum(['none', 'compat_dynamic', 'static_restore']).optional(),
    fallback_reason_code: z.string().nullable().optional(),
  }).optional(),
  enforcement: z.object({
    block_on_missing_promptanalyst: z.boolean().optional(),
    block_on_ambient_scan: z.boolean().optional(),
    block_on_include_skills_all: z.boolean().optional(),
  }).optional(),
  telemetry: z.object({
    trace_id: z.string().optional(),
    session_id: z.string().optional(),
    plan_id: z.string().optional(),
    workspace_id: z.string().optional(),
  }).optional(),
}).optional();

const DeployFallbackPolicySchema = z.object({
  fallback_allowed: z.boolean().optional(),
  fallback_mode: z.enum(['none', 'compat_dynamic', 'static_restore']).optional(),
  fallback_reason_code: z.string().nullable().optional(),
}).optional();

const DeployTelemetryContextSchema = z.object({
  trace_id: z.string().optional(),
  session_id: z.string().optional(),
  plan_id: z.string().optional(),
  workspace_id: z.string().optional(),
}).optional();

// Step object used across memory_plan / memory_steps actions
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
    'Workspace management. Actions: register (register a workspace), list (list all workspaces), info (get plans for a workspace), reindex (update codebase profile), migrate (recover old workspace data), scan_ghosts, merge, link, set_display_name, export_pending, generate_focused_workspace, list_focused_workspaces, check_context_sync (compare .github/ files against DB), import_context_file (preview or import an eligible DB-missing .github file), inject_cli_mcp (write or update .mcp.json at the workspace root so Claude Code agents discover the CLI MCP server; pass all_workspaces:true to inject into every registered workspace at once).',
    {
      action: z.enum([
        'register', 'list', 'info', 'reindex', 'merge', 'scan_ghosts', 'migrate',
        'link', 'set_display_name', 'export_pending', 'generate_focused_workspace',
        'list_focused_workspaces', 'check_context_sync', 'import_context_file', 'inject_cli_mcp',
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
      display_name: z.string().optional().describe('New display name (for set_display_name)'),
      output_filename: z.string().optional(),
      plan_id: z.string().optional(),
      files_allowed: z.array(z.string()).optional(),
      directories_allowed: z.array(z.string()).optional(),
      base_workspace_path: z.string().optional(),
      session_id: z.string().optional(),
      relative_path: z.string().optional().describe('Workspace-relative or .github-relative path (for import_context_file)'),
      confirm: z.boolean().optional().describe('Perform explicit import when true (for import_context_file)'),
      expected_kind: z.enum(['agent', 'instruction']).optional().describe('Safety check for import_context_file'),
      all_workspaces: z.boolean().optional().describe('When true, inject_cli_mcp targets every registered workspace'),
      cli_mcp_port: z.number().int().positive().optional().describe('CLI MCP server port override (default: PM_CLI_MCP_PORT or 3466)'),
      _session_id: z.string().optional().describe('Session ID for instrumentation tracking'),
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
    'Plan lifecycle management. Actions: list, get, create, update, archive, import, find, add_note, delete, consolidate, set_goals, add_build_script, list_build_scripts, run_build_script, delete_build_script, create_from_template, list_templates, confirm, summon_approval, summon_cleanup_approval, create_program, add_plan_to_program, upgrade_to_program, list_program_plans, export_plan, link_to_program, unlink_from_program, set_plan_dependencies, get_plan_dependencies, set_plan_priority, clone_plan, merge_plans, pause_plan, resume_plan, search.',
    {
      action: z.enum([
        'list', 'get', 'create', 'update', 'archive', 'import', 'find',
        'add_note', 'delete', 'consolidate', 'set_goals',
        'add_build_script', 'list_build_scripts', 'run_build_script', 'delete_build_script',
        'create_from_template', 'list_templates', 'confirm',
        'summon_approval', 'summon_cleanup_approval',
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
      schema_version: z.string().optional(),
      category: RequestCategorySchema.optional(),
      priority: PrioritySchema.optional(),
      steps: z.array(StepObjectSchema).optional(),
      include_archived: z.boolean().optional(),
      plan_file_path: z.string().optional(),
      note: z.string().optional(),
      note_type: z.enum(['info', 'warning', 'instruction']).optional(),
      categorization: RequestCategorizationSchema.optional(),
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
      approval_step_index: z.number().optional().describe('0-based step index to request GUI approval for (for summon_approval)'),
      approval_session_id: z.string().optional().describe('Optional session ID for approval routing (for summon_approval)'),
      cleanup_report_path: z.string().optional().describe('Path to plan_cleanup_audit report JSON (for summon_cleanup_approval)'),
      cleanup_form_request: z.record(z.string(), z.unknown()).optional(),
      cleanup_response_mapping: z.array(z.record(z.string(), z.unknown())).optional(),
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
      _session_id: z.string().optional().describe('Session ID for instrumentation tracking'),
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
      _session_id: z.string().optional().describe('Session ID for instrumentation tracking'),
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
    'Context and research management. Actions: store, get, store_initial, list, list_research, append_research, generate_instructions, batch_store, workspace_get, workspace_set, workspace_update, workspace_populate, workspace_delete, knowledge_store, knowledge_get, knowledge_list, knowledge_delete, search, promptanalyst_discover, pull, write_prompt, dump_context.',
    {
      action: z.enum([
        'store', 'get', 'store_initial', 'list', 'list_research', 'append_research',
        'generate_instructions', 'batch_store',
        'workspace_get', 'workspace_set', 'workspace_update', 'workspace_populate', 'workspace_delete',
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
      _session_id: z.string().optional().describe('Session ID for instrumentation tracking'),
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
      _session_id: z.string().optional().describe('Session ID for instrumentation tracking'),
    },
    async (params) => {
      const result = await consolidatedTools.memoryFilesystem(
        params as consolidatedTools.MemoryFilesystemParams,
      );
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  // ---- memory_agent -----------------------------------------------------------
  server.tool(
    'memory_agent',
    'Consolidated agent lifecycle and deployment tool. Actions: init (initialize agent session), complete (complete session), handoff (recommend next agent), validate (validate agent for current task), list (list available agents), get_instructions (get agent instructions), deploy (deploy agents to workspace), get_briefing (get mission briefing), get_lineage (get handoff history), categorize (store categorization decision on plan), deploy_for_task (deploy agent files + context bundle for a specific task). Skill discovery: list_skills, get_skill, assign_skill, unassign_skill, list_workspace_skills. Skill management: create_skill, delete_skill. Instruction discovery: list_instructions, get_instruction, assign_instruction, unassign_instruction, list_workspace_instructions. Instruction management: create_instruction, delete_instruction.',
    {
      action: z.enum([
        'init', 'complete', 'handoff', 'validate', 'list', 'get_instructions', 'deploy',
        'get_briefing', 'get_lineage', 'categorize', 'deploy_for_task',
        'list_skills', 'get_skill', 'create_skill', 'delete_skill',
        'assign_skill', 'unassign_skill', 'list_workspace_skills',
        'list_instructions', 'get_instruction', 'create_instruction', 'delete_instruction',
        'assign_instruction', 'unassign_instruction', 'list_workspace_instructions',
      ]).describe('The action to perform'),
      workspace_id: z.string().optional(),
      plan_id: z.string().optional(),
      agent_type: AgentTypeSchema.optional(),
      context: z.record(z.unknown()).optional(),
      compact: z.boolean().optional(),
      context_budget: z.number().optional(),
      include_workspace_context: z.boolean().optional(),
      validate: z.boolean().optional(),
      validation_mode: z.enum(['init+validate']).optional(),
      deployment_context: z.object({
        deployed_by: z.string(),
        reason: z.string(),
        override_validation: z.boolean().optional(),
      }).optional(),
      summary: z.string().optional(),
      artifacts: z.array(z.string()).optional(),
      hub_force_close: z.boolean().optional(),
      from_agent: AgentTypeSchema.optional(),
      to_agent: AgentTypeSchema.optional(),
      reason: z.string().optional(),
      data: z.record(z.unknown()).optional(),
      agent_name: z.string().optional(),
      skill_name: z.string().optional(),
      skill_category: z.string().optional(),
      skill_content: z.string().optional(),
      skill_description: z.string().optional(),
      skill_tags: z.array(z.string()).optional(),
      skill_language_targets: z.array(z.string()).optional(),
      skill_framework_targets: z.array(z.string()).optional(),
      instruction_filename: z.string().optional(),
      instruction_applies_to: z.string().optional(),
      instruction_content: z.string().optional(),
      notes: z.string().optional(),
      workspace_path: z.string().optional(),
      agents: z.array(z.string()).optional(),
      include_prompts: z.boolean().optional(),
      include_instructions: z.boolean().optional(),
      include_skills: z.boolean().optional(),
      categorization_result: z.record(z.unknown()).optional(),
      phase_context: z.record(z.unknown()).optional(),
      context_markers: z.record(z.enum(['phase-persistent', 'single-agent'])).optional(),
      include_research: z.boolean().optional(),
      include_architecture: z.boolean().optional(),
      prompt_analyst_output: PromptAnalystOutputSchema,
      hub_decision_payload: HubDecisionPayloadSchema,
      provisioning_mode: z.enum(['on_demand', 'compat']).optional(),
      allow_legacy_always_on: z.boolean().optional(),
      allow_ambient_instruction_scan: z.boolean().optional(),
      allow_include_skills_all: z.boolean().optional(),
      fallback_policy: DeployFallbackPolicySchema,
      telemetry_context: DeployTelemetryContextSchema,
      requested_scope: z.enum(['task', 'phase', 'plan']).optional(),
      strict_bundle_resolution: z.boolean().optional(),
      phase_name: z.string().optional(),
      step_indices: z.array(z.number()).optional(),
      _session_id: z.string().optional().describe('Session ID for instrumentation tracking'),
    },
    async (params) => {
      const result = await consolidatedTools.memoryAgent(
        params as consolidatedTools.MemoryAgentParams,
      );
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  // ---- memory_terminal --------------------------------------------------------
  server.tool(
    'memory_terminal',
    'Terminal tool with GUI approval flow. Actions: run (execute command — auto-approves allowlisted, blocks destructive, shows GUI approval for others), spawn_cli_session (validated provider session spawn with provider/cwd/prompt/context payload), read_output (get output from a session), kill (terminate a session), get_allowlist (view allowlist), update_allowlist (manage allowlist patterns). SEQUENTIAL RULE: You MUST wait for each run response before calling run again. Concurrent run calls targeting the same session are automatically rerouted to a new terminal tab and will include a rate_limit_note in the response data.',
    {
      action: z.enum([
        'run', 'spawn_cli_session', 'read_output', 'kill', 'get_allowlist', 'update_allowlist',
      ]).describe('The action to perform'),
      command: z.string().optional(),
      args: z.array(z.string()).optional(),
      cwd: z.string().optional(),
      timeout_ms: z.number().optional(),
      workspace_id: z.string().optional(),
      session_id: z.string().optional(),
      session_target: z.enum(['selected', 'default', 'specific']).optional(),
      patterns: z.array(z.string()).optional(),
      operation: z.enum(['add', 'remove', 'set']).optional(),
      env: z.record(z.string()).optional(),
      provider: z.string().optional(),
      prompt: z.string().optional(),
      context: z
        .object({
          requesting_agent: z.string().optional(),
          plan_id: z.string().optional(),
          session_id: z.string().optional(),
          step_notes: z.string().optional(),
          relevant_files: z
            .array(z.object({ path: z.string(), snippet: z.string().optional() }))
            .optional(),
          workspace_instructions: z.string().optional(),
          custom_instructions: z.string().optional(),
          output_format: z.enum(['text', 'json', 'stream-json']).optional(),
          session_mode: z.enum(['new', 'resume']).optional(),
          resume_session_id: z.string().optional(),
        })
        .passthrough()
        .optional(),
      _session_id: z.string().optional().describe('Session ID for instrumentation tracking'),
    },
    async (params, extra) => {
      const result = await consolidatedTools.memoryTerminal(
        params as consolidatedTools.MemoryTerminalParams,
        extra,
      );
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  // ---- memory_session ---------------------------------------------------------
  server.tool(
    'memory_session',
    'Agent session management and spawn preparation. Actions: prep (mint session ID + enrich prompt), deploy_and_prep (deploy context bundle + prepare enriched prompt in one call), list_sessions (query sessions from plan state), get_session (find a specific session by ID).',
    {
      action: z.enum(['prep', 'deploy_and_prep', 'list_sessions', 'get_session']).describe('The action to perform'),
      workspace_id: z.string().optional(),
      plan_id: z.string().optional(),
      agent_name: z.string().optional(),
      prompt: z.string().optional(),
      compat_mode: z.enum(['legacy', 'strict']).optional(),
      parent_session_id: z.string().optional(),
      prep_config: z.object({
        scope_boundaries: z.object({
          files_allowed: z.array(z.string()).optional(),
          directories_allowed: z.array(z.string()).optional(),
          scope_escalation_instruction: z.string().optional(),
        }).optional(),
      }).optional(),
      phase_name: z.string().optional(),
      step_indices: z.array(z.number()).optional(),
      include_skills: z.boolean().optional(),
      include_research: z.boolean().optional(),
      include_architecture: z.boolean().optional(),
      prompt_analyst_output: PromptAnalystOutputSchema,
      hub_decision_payload: HubDecisionPayloadSchema,
      provisioning_mode: z.enum(['on_demand', 'compat']).optional(),
      allow_legacy_always_on: z.boolean().optional(),
      allow_ambient_instruction_scan: z.boolean().optional(),
      allow_include_skills_all: z.boolean().optional(),
      fallback_policy: DeployFallbackPolicySchema,
      telemetry_context: DeployTelemetryContextSchema,
      requested_scope: z.enum(['task', 'phase', 'plan']).optional(),
      strict_bundle_resolution: z.boolean().optional(),
      requested_hub_label: z.enum(['Coordinator', 'Analyst', 'Runner', 'TDDDriver', 'Hub']).optional(),
      current_hub_mode: z.enum(['standard_orchestration', 'investigation', 'adhoc_runner', 'tdd_cycle']).optional(),
      previous_hub_mode: z.enum(['standard_orchestration', 'investigation', 'adhoc_runner', 'tdd_cycle']).optional(),
      requested_hub_mode: z.enum(['standard_orchestration', 'investigation', 'adhoc_runner', 'tdd_cycle']).optional(),
      transition_event: z.string().optional(),
      transition_reason_code: z.string().optional(),
      prompt_analyst_enrichment_applied: z.boolean().optional(),
      bypass_prompt_analyst_policy: z.boolean().optional(),
      prompt_analyst_latency_ms: z.number().optional(),
      peer_sessions_count: z.number().int().nonnegative().optional(),
      session_id: z.string().optional(),
      status_filter: z.enum(['active', 'stopping', 'completed', 'all']).optional(),
      _session_id: z.string().optional().describe('Session ID for instrumentation tracking'),
    },
    async (params) => {
      const result = await consolidatedTools.memorySession(
        params as consolidatedTools.MemorySessionParams,
      );
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  // ---- memory_brainstorm ------------------------------------------------------
  server.tool(
    'memory_brainstorm',
    'GUI form routing and refinement. Actions: route (send FormRequest to GUI via Supervisor), route_with_fallback (send to GUI; when GUI is unavailable returns success:false with requires_approval:true — agent MUST call memory_terminal echo sentinel for VS Code approval before using fallback answers), refine (submit standalone FormRefinementRequest to active Brainstorm agent). GUI launches are serialised per-app: concurrent calls queue and wait rather than spawning duplicate windows.',
    {
      action: z.enum(['route', 'route_with_fallback', 'refine']).describe('The action to perform'),
      form_request: z.record(z.unknown()).optional(),
      refinement_request: z.record(z.unknown()).optional(),
      _session_id: z.string().optional().describe('Session ID for instrumentation tracking'),
    },
    async (params) => {
      const result = await consolidatedTools.memoryBrainstorm(
        params as consolidatedTools.MemoryBrainstormParams,
      );
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  // ---- memory_cartographer ----------------------------------------------------
  server.tool(
    'memory_cartographer',
    'Consolidated cartography tool. Actions: get_plan_dependencies, get_dependencies, reverse_dependent_lookup, bounded_traversal (SQLite plan dependency graph traversal); db_map_summary, db_node_lookup, db_edge_lookup, context_items_projection (read-only SQLite schema introspection — context_data always masked); summary, file_context, flow_entry_points, layer_view, search (cartography_queries, Python runtime required); slice_catalog, slice_detail, slice_projection, slice_filters (architecture_slices, Python runtime required).',
    {
      action: z.enum([
        'summary', 'file_context', 'flow_entry_points', 'layer_view', 'search',
        'get_plan_dependencies', 'get_dependencies', 'reverse_dependent_lookup', 'bounded_traversal',
        'slice_catalog', 'slice_detail', 'slice_projection', 'slice_filters',
        'db_map_summary', 'db_node_lookup', 'db_edge_lookup', 'context_items_projection',
      ]).describe('The action to perform'),
      workspace_id: z.string(),
      agent_type: z.string().optional(),
      _session_id: z.string().optional(),
      caller_surface: z.string().optional(),
      write_documentation: z.boolean().optional(),
      debug_output: z.boolean().optional(),
      plan_id: z.string().optional(),
      root_plan_id: z.string().optional(),
      depth_limit: z.number().optional(),
      direction: z.enum(['dependencies', 'dependents', 'both']).optional(),
      include_archived: z.boolean().optional(),
      cursor: z.string().optional(),
      page_size: z.number().optional(),
      table_name: z.enum([
        'context_items', 'workspaces', 'plans', 'agent_sessions',
        'steps', 'handoffs', 'build_scripts', 'research_notes',
      ]).optional(),
      primary_key: z.string().optional(),
      edge_direction: z.enum(['outbound', 'inbound', 'both']).optional(),
      parent_type: z.enum(['plan', 'workspace']).optional(),
      parent_id: z.string().optional(),
      type_filter: z.array(z.string()).optional(),
      limit: z.number().optional(),
      order_by: z.enum(['created_at', 'type', 'parent_id']).optional(),
      file_id: z.string().optional(),
      include_symbols: z.boolean().optional(),
      include_references: z.boolean().optional(),
      force_refresh: z.boolean().optional(),
      layer_filter: z.array(z.string()).optional(),
      language_filter: z.array(z.string()).optional(),
      layers: z.array(z.string()).optional(),
      include_cross_layer_edges: z.boolean().optional(),
      query: z.string().optional(),
      search_scope: z.enum(['symbols', 'files', 'modules', 'all']).optional(),
      slice_id: z.string().optional(),
      materialize: z.boolean().optional(),
      projection_type: z.enum(['file_level', 'module_level', 'symbol_level']).optional(),
      filters: z.array(z.unknown()).optional(),
    },
    async (params) => {
      const result = await consolidatedTools.handleMemoryCartographer(
        params as consolidatedTools.MemoryCartographerParams,
      );
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  // ---- memory_instructions ----------------------------------------------------
  server.tool(
    'memory_instructions',
    'Read and search instruction files from the Project Memory DB. Actions: search (keyword search; returns section_matches per file, NOT full content — use to discover relevant sections without loading whole files), get (full content of one instruction by filename), get_section (extract a specific ## or ### section by heading), list (all instructions, metadata only), list_workspace (workspace-assigned instructions, metadata only).',
    {
      action: z.enum(['search', 'get', 'get_section', 'list', 'list_workspace']).describe('Action to perform'),
      query: z.string().optional().describe('Keyword to search for (required for: search)'),
      filename: z.string().optional().describe('Instruction filename (required for: get, get_section)'),
      heading: z.string().optional().describe('Section heading — partial case-insensitive match (required for: get_section)'),
      workspace_id: z.string().optional().describe('Workspace ID (required for: list_workspace)'),
      _session_id: z.string().optional().describe('Session ID for instrumentation tracking'),
    },
    async (params) => {
      const result = await consolidatedTools.memoryInstructions(
        params as consolidatedTools.MemoryInstructionsParams,
      );
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  // ---- memory_task (CLI-optimised composite) ----------------------------------
  server.tool(
    'memory_task',
    'CLI-optimised composite tool for the step work loop. REQUIRED PATTERN: (1) call get_current → read the step and the next_required_call field in the response, (2) do the work, (3) call mark_done with the step_index from next_required_call — you MUST call mark_done after every step or progress will not be recorded. Actions: get_current (returns active/pending step + goals + next_required_call hint; marks step active only if pending), mark_done (mark step done — REQUIRED after completing a step, returns next step), mark_blocked (mark step blocked with reason), get_context (fetch research notes for current phase), summarize_plan (phase-by-phase progress table), log_work (append findings to research notes). All responses are trimmed — no lineage, no session history, no skill injection.',
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

function parseHost(): string {
  const idx = process.argv.indexOf('--host');
  if (idx !== -1 && process.argv[idx + 1]) {
    const h = process.argv[idx + 1].trim();
    if (h && !h.startsWith('--')) return h;
  }
  return process.env.PM_CLI_MCP_HOST ?? '127.0.0.1';
}

// =============================================================================
// Entry point
// =============================================================================

async function main(): Promise<void> {
  const port = parsePort();

  // Initialise shared SQLite store (same data root as the main MCP server)
  await store.initDataRoot();

  const app = createHttpApp(createCliMcpServer);
  const host = parseHost();

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
