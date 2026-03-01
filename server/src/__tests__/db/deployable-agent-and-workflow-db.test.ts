import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { setupTestDb, teardownTestDb } from './fixtures.js';
import { storeAgent } from '../../db/agent-definition-db.js';
import {
  upsertDeployableAgentProfile,
  getDeployableAgentProfileByRole,
  listDeployableAgentProfiles,
} from '../../db/deployable-agent-profile-db.js';
import {
  upsertCategoryWorkflowDefinition,
  getCategoryWorkflowDefinition,
} from '../../db/category-workflow-db.js';

describe('deployable agent + category workflow definitions', () => {
  beforeAll(() => setupTestDb());
  afterAll(() => teardownTestDb());

  it('stores and retrieves deployable hub profiles', () => {
    storeAgent('Hub', '# Hub', {});
    storeAgent('PromptAnalyst', '# PromptAnalyst', {});

    upsertDeployableAgentProfile('Hub', { role: 'hub', enabled: true });
    upsertDeployableAgentProfile('PromptAnalyst', { role: 'prompt_analyst', enabled: true });

    const hub = getDeployableAgentProfileByRole('hub');
    const promptAnalyst = getDeployableAgentProfileByRole('prompt_analyst');

    expect(hub?.agent_name).toBe('Hub');
    expect(promptAnalyst?.agent_name).toBe('PromptAnalyst');

    const all = listDeployableAgentProfiles(true);
    expect(all.length).toBeGreaterThanOrEqual(2);
  });

  it('stores category workflow definitions linked to deployable profiles', () => {
    upsertCategoryWorkflowDefinition('feature', {
      scope_classification: 'single_plan',
      planning_depth: 'full',
      workflow_path: ['Researcher', 'Architect', 'Executor'],
      skip_agents: ['Brainstorm'],
      requires_research: true,
      requires_brainstorm: false,
      recommends_integrated_program: false,
      recommended_plan_count: 1,
      recommended_program_count: 0,
      candidate_plan_titles: ['Feature Plan'],
      decomposition_strategy: 'single-plan-default',
      hub_agent_name: 'Hub',
      prompt_analyst_agent_name: 'PromptAnalyst',
      metadata: { source: 'test' },
    });

    const row = getCategoryWorkflowDefinition('feature');
    expect(row).toBeTruthy();
    expect(row?.scope_classification).toBe('single_plan');
    expect(row?.hub_agent_name).toBe('Hub');
    expect(row?.prompt_analyst_agent_name).toBe('PromptAnalyst');

    const workflowPath = JSON.parse(row!.workflow_path) as string[];
    expect(workflowPath).toEqual(['Researcher', 'Architect', 'Executor']);
  });
});
