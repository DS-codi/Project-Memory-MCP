/**
 * Plan Templates - Template definitions and template-based plan creation
 *
 * Functions: createPlanFromTemplate, getTemplates
 */

import type {
  ToolResponse,
  PlanState,
  PlanStep,
  RequestCategory
} from '../../types/index.js';
import * as store from '../../storage/db-store.js';
import { events } from '../../events/event-emitter.js';

// =============================================================================
// Template Types
// =============================================================================

export type PlanTemplate = 'feature' | 'bugfix' | 'refactor' | 'documentation' | 'analysis' | 'investigation_workflow' | 'investigation';

export interface PlanTemplateSteps {
  template: PlanTemplate;
  steps: Omit<PlanStep, 'index'>[];
  goals?: string[];
  success_criteria?: string[];
}

// =============================================================================
// Template Definitions
// =============================================================================

const PLAN_TEMPLATES: Record<PlanTemplate, PlanTemplateSteps> = {
  feature: {
    template: 'feature',
    goals: ['Implement the requested feature', 'Ensure code quality and test coverage'],
    success_criteria: ['Feature works as specified', 'Tests pass', 'No regressions'],
    steps: [
      { phase: 'Research', task: 'Analyze requirements and gather context', status: 'pending', type: 'research' },
      { phase: 'Research', task: 'Investigate existing codebase patterns', status: 'pending', type: 'research' },
      { phase: 'Architecture', task: 'Design implementation approach', status: 'pending', type: 'planning' },
      { phase: 'Architecture', task: 'Identify files to create/modify', status: 'pending', type: 'planning' },
      { phase: 'Implementation', task: 'Implement core functionality', status: 'pending', type: 'code' },
      { phase: 'Implementation', task: 'Add error handling', status: 'pending', type: 'code' },
      { phase: 'Testing', task: 'Write unit tests', status: 'pending', type: 'test' },
      { phase: 'Testing', task: 'Run test suite', status: 'pending', type: 'test', requires_validation: true },
      { phase: 'Review', task: 'Code review and validation', status: 'pending', type: 'validation', requires_validation: true },
      { phase: 'Documentation', task: 'Update documentation', status: 'pending', type: 'documentation' }
    ]
  },
  bugfix: {
    template: 'bugfix',
    goals: ['Identify and fix the bug', 'Add regression test'],
    success_criteria: ['Bug is fixed', 'Regression test added', 'No new bugs introduced'],
    steps: [
      { phase: 'Investigation', task: 'Reproduce the bug', status: 'pending', type: 'research' },
      { phase: 'Investigation', task: 'Identify root cause', status: 'pending', type: 'research' },
      { phase: 'Fix', task: 'Implement the fix', status: 'pending', type: 'code' },
      { phase: 'Testing', task: 'Write regression test', status: 'pending', type: 'test' },
      { phase: 'Testing', task: 'Run test suite', status: 'pending', type: 'test', requires_validation: true },
      { phase: 'Review', task: 'Verify fix and test coverage', status: 'pending', type: 'validation', requires_validation: true }
    ]
  },
  refactor: {
    template: 'refactor',
    goals: ['Improve code quality without changing behavior', 'Maintain test coverage'],
    success_criteria: ['Code is cleaner/more maintainable', 'All tests still pass', 'No behavioral changes'],
    steps: [
      { phase: 'Analysis', task: 'Identify code smells and improvement areas', status: 'pending', type: 'research' },
      { phase: 'Analysis', task: 'Document current behavior', status: 'pending', type: 'research' },
      { phase: 'Planning', task: 'Plan refactoring steps', status: 'pending', type: 'planning' },
      { phase: 'Implementation', task: 'Apply refactoring changes', status: 'pending', type: 'code' },
      { phase: 'Testing', task: 'Verify tests still pass', status: 'pending', type: 'test', requires_validation: true },
      { phase: 'Review', task: 'Review changes for quality', status: 'pending', type: 'validation', requires_validation: true }
    ]
  },
  documentation: {
    template: 'documentation',
    goals: ['Create or update documentation', 'Ensure accuracy and clarity'],
    success_criteria: ['Documentation is complete', 'Examples are working', 'Easy to understand'],
    steps: [
      { phase: 'Research', task: 'Gather information from code and existing docs', status: 'pending', type: 'research' },
      { phase: 'Planning', task: 'Outline documentation structure', status: 'pending', type: 'planning' },
      { phase: 'Writing', task: 'Write documentation content', status: 'pending', type: 'documentation' },
      { phase: 'Writing', task: 'Add code examples', status: 'pending', type: 'documentation' },
      { phase: 'Review', task: 'Review for accuracy and clarity', status: 'pending', type: 'validation', requires_validation: true }
    ]
  },
  analysis: {
    template: 'analysis',
    goals: ['Analyze and understand the system/problem', 'Provide recommendations'],
    success_criteria: ['Analysis is comprehensive', 'Findings are documented', 'Recommendations are actionable'],
    steps: [
      { phase: 'Discovery', task: 'Gather context and requirements', status: 'pending', type: 'research' },
      { phase: 'Discovery', task: 'Explore codebase and documentation', status: 'pending', type: 'research' },
      { phase: 'Analysis', task: 'Analyze patterns and architecture', status: 'pending', type: 'research' },
      { phase: 'Analysis', task: 'Identify issues and opportunities', status: 'pending', type: 'research' },
      { phase: 'Reporting', task: 'Document findings', status: 'pending', type: 'documentation' },
      { phase: 'Reporting', task: 'Provide recommendations', status: 'pending', type: 'documentation' }
    ]
  },
  investigation: {
    template: 'investigation',
    goals: ['Investigate and resolve the identified problem', 'Produce a validated explanation or fix path'],
    success_criteria: ['Root cause is identified', 'Evidence supports conclusions', 'Resolution path is clear'],
    steps: [
      { phase: 'Intake', task: 'Capture symptoms, scope, and constraints', status: 'pending', type: 'analysis' },
      { phase: 'Recon', task: 'Survey relevant code, data, and logs', status: 'pending', type: 'analysis' },
      { phase: 'Hypothesis', task: 'Form and prioritize hypotheses', status: 'pending', type: 'analysis' },
      { phase: 'Experiment', task: 'Validate hypotheses with targeted experiments', status: 'pending', type: 'analysis' },
      { phase: 'Validation', task: 'Confirm findings against evidence', status: 'pending', type: 'analysis' },
      { phase: 'Resolution', task: 'Define the resolution plan and risks', status: 'pending', type: 'analysis' },
      { phase: 'Handoff', task: 'Handoff findings and next steps', status: 'pending', type: 'analysis' }
    ]
  },
  investigation_workflow: {
    template: 'investigation_workflow',
    goals: ['Resolve the identified problem', 'Produce a validated explanation or fix path'],
    success_criteria: ['Root cause is identified', 'Evidence supports conclusions', 'Resolution path is clear'],
    steps: [
      { phase: 'Intake', task: 'Capture symptoms, scope, and constraints', status: 'pending', type: 'analysis' },
      { phase: 'Recon', task: 'Survey relevant code, data, and logs', status: 'pending', type: 'analysis' },
      { phase: 'Structure Discovery', task: 'Map structure and dependencies', status: 'pending', type: 'analysis' },
      { phase: 'Content Decoding', task: 'Decode formats or runtime behavior', status: 'pending', type: 'analysis' },
      { phase: 'Hypothesis', task: 'Form and prioritize hypotheses', status: 'pending', type: 'analysis' },
      { phase: 'Experiment', task: 'Validate hypotheses with targeted experiments', status: 'pending', type: 'analysis' },
      { phase: 'Validation', task: 'Confirm findings against evidence', status: 'pending', type: 'analysis' },
      { phase: 'Resolution', task: 'Define the resolution plan and risks', status: 'pending', type: 'analysis' },
      { phase: 'Handoff', task: 'Handoff findings and next steps', status: 'pending', type: 'analysis' }
    ]
  }
};

// =============================================================================
// Template Functions
// =============================================================================

/**
 * Create a plan from a predefined template
 */
export async function createPlanFromTemplate(
  params: {
    workspace_id: string;
    template: PlanTemplate;
    title: string;
    description: string;
    priority?: 'low' | 'medium' | 'high' | 'critical';
  }
): Promise<ToolResponse<PlanState>> {
  try {
    const { workspace_id, template, title, description, priority } = params;

    if (!workspace_id || !template || !title || !description) {
      return {
        success: false,
        error: 'workspace_id, template, title, and description are required'
      };
    }

    const templateData = PLAN_TEMPLATES[template];
    if (!templateData) {
      return {
        success: false,
        error: `Unknown template: ${template}. Valid templates: ${Object.keys(PLAN_TEMPLATES).join(', ')}`
      };
    }

    // Verify workspace exists
    const workspace = await store.getWorkspace(workspace_id);
    if (!workspace) {
      return {
        success: false,
        error: `Workspace not found: ${workspace_id}`
      };
    }

    // Map template to category
    const categoryMap: Record<PlanTemplate, RequestCategory> = {
      feature: 'feature',
      bugfix: 'bugfix',
      refactor: 'refactor',
      documentation: 'quick_task',
      analysis: 'advisory',
      investigation: 'advisory',
      investigation_workflow: 'advisory'
    };

    const plan = await store.createPlan(
      workspace_id,
      title,
      description,
      categoryMap[template],
      priority || 'medium',
      undefined,
      templateData.goals,
      templateData.success_criteria
    );

    // Add template steps with proper indexing
    const indexedSteps: PlanStep[] = templateData.steps.map((step, index) => ({
      ...step,
      index,
      status: step.status || 'pending'
    }));

    plan.steps = indexedSteps;
    plan.current_phase = indexedSteps[0]?.phase || '';

    await store.savePlanState(plan);
    await store.generatePlanMd(plan);

    // Emit event for dashboard
    await events.planCreated(workspace_id, plan.id, title, categoryMap[template]);

    return {
      success: true,
      data: plan
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to create plan from template: ${(error as Error).message}`
    };
  }
}

/**
 * Get available plan templates
 */
export function getTemplates(): PlanTemplateSteps[] {
  return Object.values(PLAN_TEMPLATES);
}
