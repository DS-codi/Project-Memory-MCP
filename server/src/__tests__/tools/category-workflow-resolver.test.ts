import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { setupTestDb, teardownTestDb } from '../db/fixtures.js';
import { upsertCategoryWorkflowDefinition } from '../../db/category-workflow-db.js';
import { resolveCategoryWorkflow } from '../../tools/orchestration/category-workflow-resolver.js';
import { CATEGORY_ROUTING } from '../../types/category-routing.js';

describe('category-workflow-resolver', () => {
  beforeAll(() => setupTestDb());
  afterAll(() => teardownTestDb());

  it('prefers categorization_result routing when provided', () => {
    const resolved = resolveCategoryWorkflow('feature', {
      planning_depth: 'none',
      workflow_path: ['Runner'],
      skip_agents: ['Researcher'],
      requires_research: false,
      requires_brainstorm: false,
    });

    expect(resolved.source).toBe('categorization_result');
    expect(resolved.routing?.workflow_path).toEqual(['Runner']);
  });

  it('uses DB definition when categorization routing is absent', () => {
    upsertCategoryWorkflowDefinition('bugfix', {
      scope_classification: 'single_plan',
      planning_depth: 'branching',
      workflow_path: ['Architect', 'Executor', 'Reviewer'],
      skip_agents: ['Brainstorm'],
      requires_research: false,
      requires_brainstorm: false,
      decomposition_strategy: 'db-driven',
    });

    const resolved = resolveCategoryWorkflow('bugfix');

    expect(resolved.source).toBe('db_definition');
    expect(resolved.routing?.workflow_path).toEqual(['Architect', 'Executor', 'Reviewer']);
    expect(resolved.routing?.planning_depth).toBe('branching');
  });

  it('falls back to static routing when DB definition is missing', () => {
    const resolved = resolveCategoryWorkflow('quick_task');

    expect(resolved.source).toBe('static_fallback');
    expect(resolved.routing).toEqual(CATEGORY_ROUTING.quick_task);
  });
});
