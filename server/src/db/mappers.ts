/**
 * Mappers: DB row types ↔ domain types.
 *
 * The tool handlers continue using the existing `PlanState`, `PlanStep`,
 * `WorkspaceMeta`, `AgentSession`, and `LineageEntry` interfaces.
 * These functions convert flat DB rows to/from those rich domain objects,
 * keeping the migration boundary clean.
 */

import type { PlanState, PlanStep, StepStatus, StepType } from '../types/plan.types.js';
import type { WorkspaceMeta, WorkspaceProfile }              from '../types/workspace.types.js';
import type { AgentSession, AgentType, LineageEntry }      from '../types/agent.types.js';
import type { ProgramState }                               from '../types/program-v2.types.js';
import type {
  WorkspaceRow,
  PlanRow,
  PhaseRow,
  StepRow,
  SessionRow,
  LineageRow,
  ProgramRow,
  DependencyRow,
  ProgramWorkspaceLinkRow,
  ResearchDocumentRow,
} from './types.js';
import { queryAll } from './query-helpers.js';

// ---------------------------------------------------------------------------
// Workspace
// ---------------------------------------------------------------------------

export function rowToWorkspaceMeta(row: WorkspaceRow): WorkspaceMeta {
  const profile  = row.profile ? JSON.parse(row.profile) as WorkspaceProfile : undefined;
  const metaBlob = row.meta    ? JSON.parse(row.meta)    as Record<string, unknown> : {};

  return {
    workspace_id:   row.id,
    path:           row.path,
    name:           row.name,
    registered_at:  row.registered_at,
    last_accessed:  row.updated_at,
    updated_at:     row.updated_at,
    active_plans:   [],     // Populated separately from plan queries
    archived_plans: [],
    active_programs: [],
    indexed:        Boolean(profile),
    profile,
    parent_workspace_id:  row.parent_workspace_id ?? undefined,
    hierarchy_linked_at:  (metaBlob['hierarchy_linked_at'] as string | undefined),
    child_workspace_ids:  [],  // Populated separately via listChildWorkspaces
  };
}

export function workspaceMetaToRow(
  meta: WorkspaceMeta
): Omit<WorkspaceRow, 'registered_at' | 'updated_at'> {
  return {
    id:                  meta.workspace_id,
    path:                meta.path,
    name:                meta.name,
    parent_workspace_id: meta.parent_workspace_id ?? null,
    profile:             meta.profile ? JSON.stringify(meta.profile) : null,
    meta:                null,
  };
}

// ---------------------------------------------------------------------------
// Step
// ---------------------------------------------------------------------------

/**
 * Convert a step row to a domain `PlanStep`.
 *
 * @param row           Raw DB row from the `steps` table
 * @param _phaseName    Human-readable phase name (filled by assemblePlanState)
 * @param dependsOnIds  Step IDs that must complete before this step; pre-loaded
 *                      by the caller to avoid N+1 queries.
 */
export function rowToStep(row: StepRow, _phaseName?: string, dependsOnIds?: string[]): PlanStep {
  return {
    index:  row.order_index,
    phase:  _phaseName ?? row.phase_id,  // filled in by assemblePlanState
    task:   row.task,
    status: row.status as StepStatus,
    type:   row.type   as StepType | undefined,
    assignee:  row.assignee  ?? undefined,
    notes:     row.notes     ?? undefined,
    completed_at: row.completed_at ?? undefined,
    requires_confirmation:      Boolean(row.requires_confirmation),
    requires_user_confirmation: Boolean(row.requires_user_confirmation),
    requires_validation:        Boolean(row.requires_validation),
    depends_on: dependsOnIds?.length ? dependsOnIds : undefined,
  };
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

export function rowToSession(row: SessionRow): AgentSession {
  const context: Record<string, unknown> = row.context ? JSON.parse(row.context) : {};
  return {
    session_id:   row.id,
    agent_type:   row.agent_type as AgentType,
    started_at:   row.started_at,
    completed_at: row.completed_at ?? undefined,
    context,
    summary:      row.summary    ?? undefined,
    artifacts:    row.artifacts  ? JSON.parse(row.artifacts) : undefined,
  };
}

export function sessionToRow(
  planId:  string,
  session: AgentSession
): Omit<SessionRow, 'is_orphaned'> {
  return {
    id:           session.session_id,
    plan_id:      planId,
    agent_type:   session.agent_type,
    started_at:   session.started_at,
    completed_at: session.completed_at ?? null,
    summary:      session.summary      ?? null,
    artifacts:    session.artifacts    ? JSON.stringify(session.artifacts) : null,
    context:      Object.keys(session.context).length
                    ? JSON.stringify(session.context)
                    : null,
  };
}

// ---------------------------------------------------------------------------
// Lineage
// ---------------------------------------------------------------------------

export function rowToLineage(row: LineageRow): LineageEntry {
  return {
    timestamp:  row.timestamp,
    from_agent: row.from_agent as AgentType | 'User',
    to_agent:   row.to_agent   as AgentType,
    reason:     row.reason,
  };
}

export function lineageToRow(planId: string, entry: LineageEntry, id: string): LineageRow {
  return {
    id,
    plan_id:    planId,
    from_agent: entry.from_agent as string,
    to_agent:   entry.to_agent,
    reason:     entry.reason,
    data:       null,
    timestamp:  entry.timestamp,
  };
}

// ---------------------------------------------------------------------------
// Full PlanState assembly
// ---------------------------------------------------------------------------

/**
 * Assemble a full `PlanState` from a plan row plus its children.
 *
 * This is the primary mapper used by tool handlers that need the complete
 * domain object.
 */
export function assemblePlanState(
  planRow:  PlanRow,
  phases:   PhaseRow[],
  steps:    StepRow[],
  sessions: SessionRow[],
  lineage:  LineageRow[]
): PlanState {
  // Build a phase-id → phase-name lookup
  const phaseNameById = new Map(phases.map(p => [p.id, p.name]));

  // Pre-load all step-level 'blocks' dependencies for this plan in one query.
  // dependencies.source_id = the step that must complete first (the blocker).
  // dependencies.target_id = the step that is blocked (i.e. depends on source).
  // For PlanStep.depends_on we want the IDs of blockers per blocked step.
  interface DepRow { source_id: string; target_id: string; }
  const depRows: DepRow[] = steps.length > 0
    ? queryAll<DepRow>(
        `SELECT source_id, target_id FROM dependencies
         WHERE target_type = 'step'
           AND dep_type    = 'blocks'
           AND target_id   IN (${steps.map(() => '?').join(',')})`,
        steps.map(s => s.id)
      )
    : [];

  // Build a map: blocked-step-id → [blocker-step-ids]
  const depsByBlockedStepId = new Map<string, string[]>();
  for (const dep of depRows) {
    if (!depsByBlockedStepId.has(dep.target_id)) {
      depsByBlockedStepId.set(dep.target_id, []);
    }
    depsByBlockedStepId.get(dep.target_id)!.push(dep.source_id);
  }

  // Map steps with their phase names and pre-loaded dependency IDs
  const domainSteps: PlanStep[] = steps.map(s =>
    rowToStep(
      s,
      phaseNameById.get(s.phase_id) ?? s.phase_id,
      depsByBlockedStepId.get(s.id)
    )
  );

  // Determine current_phase from first pending/active step
  const currentStep = steps
    .filter(s => s.status === 'pending' || s.status === 'active')
    .sort((a, b) => {
      const phaseA = phases.find(p => p.id === a.phase_id)?.order_index ?? 0;
      const phaseB = phases.find(p => p.id === b.phase_id)?.order_index ?? 0;
      if (phaseA !== phaseB) return phaseA - phaseB;
      return a.order_index - b.order_index;
    })[0];

  const currentPhase = currentStep
    ? (phaseNameById.get(currentStep.phase_id) ?? '')
    : (phases[phases.length - 1]?.name ?? '');

  const state: PlanState = {
    id:             planRow.id,
    workspace_id:   planRow.workspace_id,
    title:          planRow.title,
    description:    planRow.description,
    priority:       planRow.priority    as PlanState['priority'],
    status:         planRow.status      as PlanState['status'],
    category:       planRow.category    as PlanState['category'],
    schema_version: planRow.schema_version,
    current_phase:  currentPhase,
    current_agent:  null,
    recommended_next_agent: planRow.recommended_next_agent as AgentType | undefined,
    goals:           JSON.parse(planRow.goals),
    success_criteria: JSON.parse(planRow.success_criteria),
    categorization:  planRow.categorization   ? JSON.parse(planRow.categorization)   : undefined,
    deployment_context: planRow.deployment_context ? JSON.parse(planRow.deployment_context) : undefined,
    confirmation_state: planRow.confirmation_state ? JSON.parse(planRow.confirmation_state) : undefined,
    paused_at_snapshot: planRow.paused_at_snapshot ? JSON.parse(planRow.paused_at_snapshot) : undefined,
    program_id:      planRow.program_id        ?? undefined,
    created_at:      planRow.created_at,
    updated_at:      planRow.updated_at,
    completed_at:    planRow.completed_at       ?? undefined,
    agent_sessions:  sessions.map(rowToSession),
    lineage:         lineage.map(rowToLineage),
    steps:           domainSteps,
  };

  return state;
}

/**
 * Decompose a `PlanState` into the flat DB rows needed for persistence.
 *
 * Used during the data-migration phase (Plan 4) to convert JSON-file state
 * into DB rows without going through the full CRUD layer.
 */
export interface DecomposedPlanState {
  plan:     Omit<PlanRow, 'archived_at'>;
  phases:   Array<Omit<PhaseRow, 'id' | 'created_at'>>;
  steps:    Array<{
    phaseName: string;
    data: Omit<StepRow, 'id' | 'phase_id' | 'plan_id' | 'created_at' | 'updated_at'>;
  }>;
  sessions: Array<Omit<SessionRow, 'is_orphaned'>>;
  lineage:  LineageRow[];
}

export function decomposePlanState(
  state:      PlanState,
  planId:     string,
  workspaceId: string
): DecomposedPlanState {
  const now = new Date().toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');

  // Collect unique phase names in order
  const seenPhases = new Map<string, number>();
  for (const step of state.steps) {
    if (!seenPhases.has(step.phase)) {
      seenPhases.set(step.phase, seenPhases.size);
    }
  }

  const phases = Array.from(seenPhases.entries()).map(([name, idx]) => ({
    plan_id:     planId,
    name,
    order_index: idx,
  }));

  const steps = state.steps.map((step, idx) => ({
    phaseName: step.phase,
    data: {
      plan_id:                    planId,
      task:                       step.task,
      type:                       step.type ?? 'standard',
      status:                     step.status,
      assignee:                   step.assignee  ?? null,
      notes:                      step.notes     ?? null,
      order_index:                idx,
      requires_confirmation:      step.requires_confirmation      ? 1 : 0,
      requires_user_confirmation: step.requires_user_confirmation ? 1 : 0,
      requires_validation:        step.requires_validation        ? 1 : 0,
      completed_at:               step.completed_at ?? null,
      completed_by_agent:         null,
    },
  }));

  const plan: Omit<PlanRow, 'archived_at'> = {
    id:                     planId,
    workspace_id:           workspaceId,
    program_id:             state.program_id  ?? null,
    title:                  state.title,
    description:            state.description,
    category:               state.category    as PlanRow['category'],
    priority:               state.priority    as PlanRow['priority'],
    status:                 state.status      as PlanRow['status'],
    schema_version:         state.schema_version ?? '2.0',
    goals:                  state.goals            ? JSON.stringify(state.goals)            : '[]',
    success_criteria:       state.success_criteria ? JSON.stringify(state.success_criteria) : '[]',
    recommended_next_agent: state.recommended_next_agent ?? null,
    categorization:         state.categorization   ? JSON.stringify(state.categorization)   : null,
    deployment_context:     state.deployment_context
                              ? JSON.stringify(state.deployment_context)
                              : null,
    confirmation_state:     state.confirmation_state
                              ? JSON.stringify(state.confirmation_state)
                              : null,
    paused_at:              null,  // index-only column; set via updatePlan() at runtime
    paused_at_snapshot:     state.paused_at_snapshot
                              ? JSON.stringify(state.paused_at_snapshot)
                              : null,
    created_at:             state.created_at,
    updated_at:             state.updated_at,
    completed_at:           state.completed_at ?? null,
  };

  const sessionRows = state.agent_sessions.map(s => sessionToRow(planId, s));

  const lineageRows: LineageRow[] = state.lineage.map((entry, idx) =>
    lineageToRow(planId, entry, `${planId}-l-${idx}`)
  );

  return { plan, phases, steps, sessions: sessionRows, lineage: lineageRows };
}

// ---------------------------------------------------------------------------
// Convenience aliases (conventional mapper naming)
// ---------------------------------------------------------------------------

/**
 * Alias for `assemblePlanState`. Converts a plan row plus pre-loaded child
 * rows into the rich `PlanState` domain object.
 */
export const planRowToState = assemblePlanState;

/**
 * Extract the flat `PlanRow` portion from a `PlanState`.
 * Thin wrapper around `decomposePlanState(state, planId, workspaceId).plan`.
 */
export function stateToPlanRow(
  state:       PlanState,
  planId:      string,
  workspaceId: string
): Omit<PlanRow, 'archived_at'> {
  return decomposePlanState(state, planId, workspaceId).plan;
}

// ---------------------------------------------------------------------------
// Program mappers
// ---------------------------------------------------------------------------

/**
 * Convert a `ProgramRow` to the domain `ProgramState` interface.
 */
export function programRowToState(row: ProgramRow): ProgramState {
  return {
    id:          row.id,
    workspace_id: row.workspace_id,
    title:       row.title,
    description: row.description,
    priority:    row.priority,
    category:    row.category,
    status:      row.status === 'completed' || row.status === 'archived' || row.status === 'paused'
                   ? (row.status === 'archived' ? 'archived' : 'active')
                   : 'active',
    created_at:  row.created_at,
    updated_at:  row.updated_at,
    archived_at: row.archived_at ?? undefined,
  };
}

/**
 * Convert a domain `ProgramState` into a `ProgramRow` suitable for DB
 * insertion (without the `archived_at` column).
 */
export function stateToProgramRow(
  state:       ProgramState,
  programId:   string,
  workspaceId: string
): Omit<ProgramRow, 'archived_at'> {
  return {
    id:               programId,
    workspace_id:     workspaceId,
    title:            state.title,
    description:      state.description,
    category:         state.category as ProgramRow['category'],
    priority:         state.priority,
    status:           state.status === 'archived' ? 'archived' : 'active',
    schema_version:   '2.0',
    goals:            '[]',
    success_criteria: '[]',
    source:           'v2',
    created_at:       state.created_at,
    updated_at:       state.updated_at,
  };
}

// ---------------------------------------------------------------------------
// Dependency edge
// ---------------------------------------------------------------------------

/**
 * Lightweight domain representation of a DB dependency row.
 * Avoids leaking the internal numeric `id` to callers.
 */
export interface PlanDependencyEdge {
  sourceType: DependencyRow['source_type'];
  sourceId:   string;
  targetType: DependencyRow['target_type'];
  targetId:   string;
  depType:    DependencyRow['dep_type'];
  depStatus:  DependencyRow['dep_status'];
  createdAt:  string;
}

/**
 * Convert a `DependencyRow` to the cleaner `PlanDependencyEdge` shape.
 */
export function dependencyRowToEdge(row: DependencyRow): PlanDependencyEdge {
  return {
    sourceType: row.source_type,
    sourceId:   row.source_id,
    targetType: row.target_type,
    targetId:   row.target_id,
    depType:    row.dep_type,
    depStatus:  row.dep_status,
    createdAt:  row.created_at,
  };
}

// ---------------------------------------------------------------------------
// Program workspace link
// ---------------------------------------------------------------------------

/** Domain representation of a program ↔ workspace cross-link row. */
export interface WorkspaceLinkEntry {
  programId:   string;
  workspaceId: string;
  linkedAt:    string;
  linkedBy:    string | undefined;
}

/**
 * Convert a `ProgramWorkspaceLinkRow` to the cleaner `WorkspaceLinkEntry`.
 */
export function programWorkspaceLinkRowToLink(row: ProgramWorkspaceLinkRow): WorkspaceLinkEntry {
  return {
    programId:   row.program_id,
    workspaceId: row.workspace_id,
    linkedAt:    row.linked_at,
    linkedBy:    row.linked_by ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// Research document
// ---------------------------------------------------------------------------

/** Domain representation of a stored research document. */
export interface ResearchNote {
  filename:   string;
  content:    string;
  parentType: ResearchDocumentRow['parent_type'];
  parentId:   string | null;
  createdAt:  string;
  updatedAt:  string;
}

/**
 * Convert a `ResearchDocumentRow` to the cleaner `ResearchNote` shape.
 */
export function researchDocumentRowToNote(row: ResearchDocumentRow): ResearchNote {
  return {
    filename:   row.filename,
    content:    row.content,
    parentType: row.parent_type,
    parentId:   row.parent_id,
    createdAt:  row.created_at,
    updatedAt:  row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// Step (conventional alias)
// ---------------------------------------------------------------------------

/**
 * Conventional mapper-naming alias for `rowToStep`.
 *
 * @param row           Raw DB row from the `steps` table
 * @param phaseName     Human-readable phase name
 * @param dependsOnIds  Blocker step IDs (pre-loaded by caller)
 */
export function stepRowToStep(row: StepRow, phaseName?: string, dependsOnIds?: string[]): PlanStep {
  return rowToStep(row, phaseName, dependsOnIds);
}
