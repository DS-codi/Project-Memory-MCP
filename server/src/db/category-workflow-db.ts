/**
 * Category workflow definitions.
 *
 * DB-backed routing model for category -> workflow selection used by hub
 * categorization/routing logic.
 */

import type { CategoryWorkflowDefinitionRow } from './types.js';
import { queryOne, queryAll, run, newId, nowIso } from './query-helpers.js';

export type WorkflowScopeClassification = 'quick_task' | 'single_plan' | 'multi_plan' | 'program';

export interface UpsertCategoryWorkflowDefinitionInput {
  scope_classification: WorkflowScopeClassification;
  planning_depth: string;
  workflow_path: string[];
  skip_agents: string[];
  requires_research: boolean;
  requires_brainstorm: boolean;
  recommends_integrated_program?: boolean;
  recommended_plan_count?: number;
  recommended_program_count?: number;
  candidate_plan_titles?: string[];
  decomposition_strategy?: string | null;
  hub_agent_name?: string | null;
  prompt_analyst_agent_name?: string | null;
  metadata?: Record<string, unknown> | null;
}

export function upsertCategoryWorkflowDefinition(
  category: string,
  input: UpsertCategoryWorkflowDefinitionInput,
): void {
  const existing = getCategoryWorkflowDefinition(category);
  const now = nowIso();

  const rowValues = [
    input.scope_classification,
    input.planning_depth,
    JSON.stringify(input.workflow_path),
    JSON.stringify(input.skip_agents),
    input.requires_research ? 1 : 0,
    input.requires_brainstorm ? 1 : 0,
    input.recommends_integrated_program ? 1 : 0,
    Math.max(0, input.recommended_plan_count ?? 1),
    Math.max(0, input.recommended_program_count ?? 0),
    JSON.stringify(input.candidate_plan_titles ?? []),
    input.decomposition_strategy ?? null,
    input.hub_agent_name ?? null,
    input.prompt_analyst_agent_name ?? null,
    input.metadata ? JSON.stringify(input.metadata) : null,
    now,
  ];

  if (existing) {
    run(
      `UPDATE category_workflow_definitions
          SET scope_classification = ?, planning_depth = ?, workflow_path = ?, skip_agents = ?,
              requires_research = ?, requires_brainstorm = ?,
              recommends_integrated_program = ?, recommended_plan_count = ?, recommended_program_count = ?,
              candidate_plan_titles = ?, decomposition_strategy = ?,
              hub_agent_name = ?, prompt_analyst_agent_name = ?, metadata = ?, updated_at = ?
        WHERE category = ?`,
      [...rowValues, category],
    );
    return;
  }

  run(
    `INSERT INTO category_workflow_definitions
       (id, category, scope_classification, planning_depth, workflow_path, skip_agents,
        requires_research, requires_brainstorm, recommends_integrated_program,
        recommended_plan_count, recommended_program_count, candidate_plan_titles,
        decomposition_strategy, hub_agent_name, prompt_analyst_agent_name,
        metadata, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      newId(),
      category,
      ...rowValues.slice(0, 14),
      now,
      now,
    ],
  );
}

export function getCategoryWorkflowDefinition(category: string): CategoryWorkflowDefinitionRow | null {
  return queryOne<CategoryWorkflowDefinitionRow>(
    'SELECT * FROM category_workflow_definitions WHERE category = ?',
    [category],
  ) ?? null;
}

export function listCategoryWorkflowDefinitions(): CategoryWorkflowDefinitionRow[] {
  return queryAll<CategoryWorkflowDefinitionRow>(
    'SELECT * FROM category_workflow_definitions ORDER BY category',
  );
}

export function listCategoryWorkflowDefinitionsByScope(
  scopeClassification: WorkflowScopeClassification,
): CategoryWorkflowDefinitionRow[] {
  return queryAll<CategoryWorkflowDefinitionRow>(
    'SELECT * FROM category_workflow_definitions WHERE scope_classification = ? ORDER BY category',
    [scopeClassification],
  );
}

export function deleteCategoryWorkflowDefinition(category: string): void {
  run('DELETE FROM category_workflow_definitions WHERE category = ?', [category]);
}
