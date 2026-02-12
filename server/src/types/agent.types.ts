/**
 * Agent Type Definitions
 *
 * Core types for agent identity, sessions, lineage, and role boundaries.
 */

// =============================================================================
// Agent Types
// =============================================================================

export type AgentType =
  | 'Coordinator'
  | 'Analyst'
  | 'Brainstorm'
  | 'Runner'
  | 'Researcher'
  | 'Architect'
  | 'Executor'
  | 'Builder'
  | 'Revisionist'
  | 'Reviewer'
  | 'Tester'
  | 'Archivist'
  | 'SkillWriter'
  | 'Worker'
  | 'TDDDriver';

// =============================================================================
// Lineage & Handoff
// =============================================================================

export interface LineageEntry {
  timestamp: string;
  from_agent: AgentType | 'User';
  to_agent: AgentType;
  reason: string;
}

export interface AgentSession {
  session_id: string;
  agent_type: AgentType;
  started_at: string;
  completed_at?: string;
  context: Record<string, unknown>;
  summary?: string;
  artifacts?: string[];
}

// =============================================================================
// Agent Role Boundaries - Enforced constraints per agent type
// =============================================================================

export interface AgentRoleBoundaries {
  agent_type: AgentType;
  can_implement: boolean;         // Can create/edit code files
  can_edit_docs?: boolean;        // Can edit documentation files (README, docs, etc.)
  can_finalize: boolean;          // Can complete without handoff (only Archivist)
  is_hub?: boolean;               // Hub agent that can spawn subagents (Coordinator, Analyst, Runner, TDDDriver)
  can_spawn_subagents?: boolean;  // Explicit flag for subagent spawning capability
  must_handoff_to: AgentType[];   // Recommended next agents (Coordinator will deploy)
  forbidden_actions: string[];    // Actions this agent must NOT take
  primary_responsibility: string; // What this agent should focus on
  // Worker scope limits (only applicable to Worker agent)
  max_steps?: number;             // Maximum plan steps a Worker may execute (default 5)
  max_context_tokens?: number;    // Maximum context tokens for Worker (default 50000)
}

/**
 * AGENT ROLE BOUNDARIES
 *
 * HUB-AND-SPOKE MODEL:
 * - Coordinator is the hub that runs all other agents as subagents
 * - Subagents complete and return control to Coordinator
 * - must_handoff_to = recommendation for which agent Coordinator should deploy next
 * - Only Archivist can finalize (complete without recommending next agent)
 */
export const AGENT_BOUNDARIES: Record<AgentType, AgentRoleBoundaries> = {
  Coordinator: {
    agent_type: 'Coordinator',
    can_implement: false,
    can_finalize: false,
    must_handoff_to: ['Researcher', 'Architect'],
    forbidden_actions: ['create files', 'edit code', 'run tests', 'implement features'],
    primary_responsibility: 'Orchestrate plan execution by deploying appropriate subagents'
  },
  Analyst: {
    agent_type: 'Analyst',
    can_implement: true,
    can_finalize: false,
    must_handoff_to: ['Coordinator', 'Executor', 'Archivist'],
    forbidden_actions: [],
    primary_responsibility: 'Long-term iterative analysis and investigation - manages hypothesis-driven exploration cycles, reverse engineering, and format discovery. Can make small code changes to support analysis.'
  },
  Brainstorm: {
    agent_type: 'Brainstorm',
    can_implement: false,
    can_finalize: false,
    must_handoff_to: ['Coordinator', 'Architect'],
    forbidden_actions: ['create files', 'edit code', 'run tests', 'implement features'],
    primary_responsibility: 'Explore ideas, compare approaches, and refine requirements before a formal plan is created.'
  },
  Runner: {
    agent_type: 'Runner',
    can_implement: true,
    can_finalize: false,
    must_handoff_to: ['Coordinator', 'Analyst', 'Brainstorm'],
    forbidden_actions: [],
    primary_responsibility: 'Execute quick, ad-hoc tasks without formal plans, logging context when useful.'
  },
  Researcher: {
    agent_type: 'Researcher',
    can_implement: false,
    can_finalize: false,
    must_handoff_to: ['Architect'],
    forbidden_actions: ['create files', 'edit code', 'implement features'],
    primary_responsibility: 'Gather information, document findings, research patterns'
  },
  Architect: {
    agent_type: 'Architect',
    can_implement: false,
    can_finalize: false,
    must_handoff_to: ['Executor'],
    forbidden_actions: ['create files', 'edit code', 'implement features'],
    primary_responsibility: 'Design solution, define architecture, specify what to build'
  },
  Executor: {
    agent_type: 'Executor',
    can_implement: true,
    can_finalize: false,
    must_handoff_to: ['Builder', 'Reviewer', 'Tester'],
    forbidden_actions: [],
    primary_responsibility: 'Implement code changes according to Architect design'
  },
  Builder: {
    agent_type: 'Builder',
    can_implement: false,
    can_finalize: false,
    must_handoff_to: ['Reviewer', 'Coordinator'],
    forbidden_actions: [
      'create files',
      'edit code',
      'implement features'
    ],
    primary_responsibility: 'Create and register build scripts, verify end-of-plan compilation readiness, provide user-facing build instructions, regression detection when pre_plan_build_status is passing',
    deployment_modes: ['regression_check', 'final_verification']
  } as AgentRoleBoundaries & { deployment_modes: string[] },
  Reviewer: {
    agent_type: 'Reviewer',
    can_implement: false,
    can_finalize: false,
    must_handoff_to: ['Tester', 'Archivist', 'Revisionist'],
    forbidden_actions: ['create files', 'edit code', 'implement features'],
    primary_responsibility: 'Review code quality, suggest improvements'
  },
  Tester: {
    agent_type: 'Tester',
    can_implement: true,
    can_finalize: false,
    must_handoff_to: ['Archivist', 'Revisionist'],
    forbidden_actions: [],
    primary_responsibility: 'Write and run tests, verify implementation'
  },
  Revisionist: {
    agent_type: 'Revisionist',
    can_implement: false,
    can_finalize: false,
    must_handoff_to: ['Architect', 'Executor'],
    forbidden_actions: ['create files', 'edit code', 'implement features'],
    primary_responsibility: 'Analyze failures, adjust plan, redirect work'
  },
  Archivist: {
    agent_type: 'Archivist',
    can_implement: false,
    can_edit_docs: true,
    can_finalize: true,
    must_handoff_to: [],
    forbidden_actions: ['create source files', 'edit source code', 'implement features'],
    primary_responsibility: 'Archive completed plan, update documentation, commit changes'
  },
  SkillWriter: {
    agent_type: 'SkillWriter',
    can_implement: false,
    can_finalize: false,
    must_handoff_to: ['Coordinator'],
    forbidden_actions: ['edit source code', 'modify config files', 'run tests', 'implement features'],
    primary_responsibility: 'Analyze codebases and generate skill files'
  },
  Worker: {
    agent_type: 'Worker',
    can_implement: true,
    can_finalize: false,
    must_handoff_to: ['Coordinator'],
    forbidden_actions: ['spawn subagents', 'create plans', 'archive', 'modify plan steps'],
    primary_responsibility: 'Execute specific sub-tasks delegated by hub agents',
    max_steps: 5,
    max_context_tokens: 50000
  },
  TDDDriver: {
    agent_type: 'TDDDriver',
    can_implement: false,
    can_finalize: false,
    is_hub: true,
    can_spawn_subagents: true,
    must_handoff_to: ['Coordinator'],
    forbidden_actions: ['create files', 'edit code', 'implement features'],
    primary_responsibility: 'Orchestrate TDD red-green-refactor cycles'
  }
};
