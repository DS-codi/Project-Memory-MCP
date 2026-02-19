/**
 * Agent-to-Tool Action Mappings
 *
 * Static registry mapping each agent type to the tool+action pairs they are
 * allowed to invoke. Used by the contract builder to assemble per-agent tool
 * contract summaries at init time.
 *
 * Dependency: preflight.types.ts → this file → contract-builder.ts
 */

import type { AgentType } from '../../types/agent.types.js';

// =============================================================================
// Types
// =============================================================================

/** A single tool and its allowed actions for an agent. */
export interface ToolActionMapping {
  tool: string;
  actions: string[];
}

/** The full registry type: agent → allowed tool+action pairs. */
export type AgentToolMappingRegistry = Record<AgentType, ToolActionMapping[]>;

// =============================================================================
// Shared action sets (DRY helpers)
// =============================================================================

/** Every agent gets these memory_agent actions. */
const AGENT_LIFECYCLE: ToolActionMapping = {
  tool: 'memory_agent',
  actions: ['init', 'handoff', 'complete', 'validate'],
};

/** Read-only plan access. */
const PLAN_READ: ToolActionMapping = {
  tool: 'memory_plan',
  actions: ['get'],
};

// =============================================================================
// AGENT_TOOL_MAPPINGS — the static source of truth
// =============================================================================

export const AGENT_TOOL_MAPPINGS: AgentToolMappingRegistry = {

  // ── Hub: Coordinator ─────────────────────────────────────────────────
  Coordinator: [
    {
      tool: 'memory_agent',
      actions: [
        'init', 'complete', 'handoff', 'validate', 'list',
        'get_instructions', 'deploy', 'get_briefing', 'get_lineage',
        'categorize', 'deploy_for_task',
      ],
    },
    {
      tool: 'memory_plan',
      actions: [
        'list', 'get', 'create', 'update', 'archive', 'import', 'find',
        'add_note', 'delete', 'consolidate', 'set_goals', 'add_build_script',
        'list_build_scripts', 'run_build_script', 'delete_build_script',
        'create_from_template', 'list_templates', 'confirm',
        'create_program', 'add_plan_to_program', 'upgrade_to_program',
        'list_program_plans', 'export_plan', 'link_to_program',
        'unlink_from_program', 'set_plan_dependencies',
        'get_plan_dependencies', 'set_plan_priority', 'clone_plan',
        'merge_plans',
      ],
    },
    {
      tool: 'memory_steps',
      actions: [
        'add', 'update', 'batch_update', 'insert', 'delete',
        'reorder', 'move', 'sort', 'set_order', 'replace',
      ],
    },
    {
      tool: 'memory_context',
      actions: [
        'store', 'get', 'store_initial', 'list', 'list_research',
        'append_research', 'generate_instructions', 'batch_store',
        'workspace_get', 'workspace_set', 'workspace_update',
        'workspace_delete', 'knowledge_store', 'knowledge_get',
        'knowledge_list', 'knowledge_delete', 'write_prompt', 'dump_context',
      ],
    },
    {
      tool: 'memory_workspace',
      actions: [
        'register', 'list', 'info', 'reindex', 'merge',
        'scan_ghosts', 'migrate', 'link', 'export_pending',
      ],
    },
  ],

  // ── Hub: Analyst ─────────────────────────────────────────────────────
  Analyst: [
    AGENT_LIFECYCLE,
    PLAN_READ,
    {
      tool: 'memory_context',
      actions: ['get', 'store', 'append_research', 'list_research'],
    },
  ],

  // ── Hub: Runner ──────────────────────────────────────────────────────
  Runner: [
    AGENT_LIFECYCLE,
    {
      tool: 'memory_plan',
      actions: ['get', 'create', 'list'],
    },
    {
      tool: 'memory_steps',
      actions: ['update', 'add'],
    },
    {
      tool: 'memory_context',
      actions: ['store', 'get'],
    },
  ],

  // ── Hub: TDDDriver ───────────────────────────────────────────────────
  TDDDriver: [
    AGENT_LIFECYCLE,
    {
      tool: 'memory_plan',
      actions: ['get', 'list'],
    },
    {
      tool: 'memory_steps',
      actions: ['update', 'batch_update'],
    },
  ],

  // ── Spoke: Executor ──────────────────────────────────────────────────
  Executor: [
    AGENT_LIFECYCLE,
    PLAN_READ,
    {
      tool: 'memory_steps',
      actions: ['update', 'batch_update'],
    },
    {
      tool: 'memory_context',
      actions: ['store', 'get'],
    },
  ],

  // ── Spoke: Architect ─────────────────────────────────────────────────
  Architect: [
    AGENT_LIFECYCLE,
    {
      tool: 'memory_plan',
      actions: [
        'get', 'update', 'set_goals', 'create_from_template',
        'list_templates',
      ],
    },
    {
      tool: 'memory_steps',
      actions: [
        'add', 'insert', 'delete', 'reorder', 'move',
        'sort', 'set_order', 'replace',
      ],
    },
    {
      tool: 'memory_context',
      actions: ['get', 'store'],
    },
  ],

  // ── Spoke: Reviewer ──────────────────────────────────────────────────
  Reviewer: [
    AGENT_LIFECYCLE,
    {
      tool: 'memory_plan',
      actions: [
        'get', 'add_note', 'add_build_script', 'list_build_scripts',
        'run_build_script', 'delete_build_script',
      ],
    },
    {
      tool: 'memory_steps',
      actions: ['update', 'batch_update'],
    },
    {
      tool: 'memory_context',
      actions: ['store', 'get'],
    },
  ],

  // ── Spoke: Tester ────────────────────────────────────────────────────
  Tester: [
    AGENT_LIFECYCLE,
    {
      tool: 'memory_plan',
      actions: ['get', 'list_build_scripts', 'run_build_script'],
    },
    {
      tool: 'memory_steps',
      actions: ['update', 'batch_update'],
    },
    {
      tool: 'memory_context',
      actions: ['store', 'get'],
    },
  ],

  // ── Spoke: Researcher ────────────────────────────────────────────────
  Researcher: [
    AGENT_LIFECYCLE,
    PLAN_READ,
    {
      tool: 'memory_context',
      actions: ['append_research', 'list_research', 'get', 'store'],
    },
  ],

  // ── Spoke: Archivist ─────────────────────────────────────────────────
  Archivist: [
    AGENT_LIFECYCLE,
    {
      tool: 'memory_plan',
      actions: ['get', 'archive'],
    },
    {
      tool: 'memory_workspace',
      actions: ['reindex'],
    },
    {
      tool: 'memory_context',
      actions: ['knowledge_store', 'knowledge_list', 'get'],
    },
  ],

  // ── Spoke: Revisionist ───────────────────────────────────────────────
  Revisionist: [
    AGENT_LIFECYCLE,
    {
      tool: 'memory_plan',
      actions: ['get', 'add_note'],
    },
    {
      tool: 'memory_steps',
      actions: ['update', 'batch_update', 'insert', 'delete', 'add', 'replace'],
    },
    {
      tool: 'memory_context',
      actions: ['get', 'store'],
    },
  ],

  // ── Spoke: Brainstorm ────────────────────────────────────────────────
  Brainstorm: [
    AGENT_LIFECYCLE,
    PLAN_READ,
    {
      tool: 'memory_context',
      actions: ['append_research', 'get'],
    },
  ],

  // ── Spoke: Worker ────────────────────────────────────────────────────
  Worker: [
    AGENT_LIFECYCLE,
    PLAN_READ,
    {
      tool: 'memory_steps',
      actions: ['update'],
    },
    {
      tool: 'memory_context',
      actions: ['get'],
    },
  ],

  // ── Spoke: Cognition ─────────────────────────────────────────────────
  Cognition: [
    AGENT_LIFECYCLE,
    PLAN_READ,
    {
      tool: 'memory_context',
      actions: ['get', 'list_research'],
    },
  ],

  // ── Spoke: SkillWriter ───────────────────────────────────────────────
  SkillWriter: [
    AGENT_LIFECYCLE,
    PLAN_READ,
  ],

  // ── Spoke: Migrator ──────────────────────────────────────────────────
  Migrator: [
    AGENT_LIFECYCLE,
    {
      tool: 'memory_plan',
      actions: ['get', 'list'],
    },
    {
      tool: 'memory_workspace',
      actions: [
        'register', 'info', 'list', 'reindex',
        'merge', 'scan_ghosts', 'migrate',
      ],
    },
  ],
};

// =============================================================================
// Accessor
// =============================================================================

/**
 * Get the tool-action mapping for a specific agent type.
 * Returns an empty array for unknown agent types (defensive).
 */
export function getAgentToolMappings(agentType: AgentType): ToolActionMapping[] {
  return AGENT_TOOL_MAPPINGS[agentType] ?? [];
}
