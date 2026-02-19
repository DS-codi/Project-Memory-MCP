/**
 * Category Routing Definitions
 *
 * Maps each of the 7 request categories to their routing configuration:
 * planning depth, workflow path, skip/require agents, and research needs.
 *
 * See docs/plans/context-orchestration-overhaul-design.md for the
 * authoritative Category Routing Table.
 */

import type { AgentType } from './agent.types.js';

// =============================================================================
// Planning Depth
// =============================================================================

export type PlanningDepth =
  | 'full'                   // Full pipeline: Research → Brainstorm → Architect → Execute
  | 'branching'              // Hub checks cause clarity, may branch to investigation
  | 'full_minus_brainstorm'  // Research → Architect → Execute (skip Brainstorm)
  | 'full_plus_research'     // Extra research emphasis; systemic impact
  | 'meta'                   // Program-level: decomposes into child plans
  | 'none';                  // No formal plan; direct execution or conversational

// =============================================================================
// Routing Config
// =============================================================================

export interface CategoryRoutingConfig {
  /** How deeply the planning pipeline runs for this category. */
  planning_depth: PlanningDepth;

  /** Ordered list of agents in the workflow path. */
  workflow_path: AgentType[];

  /** Agents that should be skipped for this category. */
  skip_agents: AgentType[];

  /** Whether this category requires a Research phase. */
  requires_research: boolean;

  /** Whether this category requires a Brainstorm phase. */
  requires_brainstorm: boolean;
}

// =============================================================================
// Category Routing Constant
// =============================================================================

/**
 * Static routing table mapping each RequestCategory to its routing config.
 *
 * Source of truth: docs/plans/context-orchestration-overhaul-design.md
 */
export const CATEGORY_ROUTING: Record<string, CategoryRoutingConfig> = {
  feature: {
    planning_depth: 'full',
    workflow_path: ['Researcher', 'Brainstorm', 'Architect', 'Executor', 'Reviewer', 'Tester', 'Archivist'],
    skip_agents: [],
    requires_research: true,
    requires_brainstorm: true,
  },

  bugfix: {
    planning_depth: 'branching',
    workflow_path: ['Architect', 'Executor', 'Reviewer', 'Tester', 'Archivist'],
    skip_agents: ['Brainstorm'],
    requires_research: false,
    requires_brainstorm: false,
  },

  refactor: {
    planning_depth: 'full_minus_brainstorm',
    workflow_path: ['Researcher', 'Architect', 'Executor', 'Reviewer', 'Tester', 'Archivist'],
    skip_agents: ['Brainstorm'],
    requires_research: true,
    requires_brainstorm: false,
  },

  orchestration: {
    planning_depth: 'full_plus_research',
    workflow_path: ['Researcher', 'Brainstorm', 'Architect', 'Executor', 'Reviewer', 'Tester', 'Archivist'],
    skip_agents: [],
    requires_research: true,
    requires_brainstorm: true,
  },

  program: {
    planning_depth: 'meta',
    workflow_path: ['Architect', 'Coordinator'],
    skip_agents: ['Researcher', 'Brainstorm', 'Executor', 'Tester'],
    requires_research: false,
    requires_brainstorm: false,
  },

  quick_task: {
    planning_depth: 'none',
    workflow_path: ['Runner'],
    skip_agents: ['Researcher', 'Brainstorm', 'Architect', 'Tester', 'Archivist'],
    requires_research: false,
    requires_brainstorm: false,
  },

  advisory: {
    planning_depth: 'none',
    workflow_path: [],
    skip_agents: ['Researcher', 'Brainstorm', 'Architect', 'Executor', 'Reviewer', 'Tester', 'Archivist'],
    requires_research: false,
    requires_brainstorm: false,
  },
} as const;
