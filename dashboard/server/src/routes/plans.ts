import { Router } from 'express';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { promisify } from 'util';
import { getWorkspacePlans, getPlanState, getPlanLineage, getPlanAudit, getResearchNotes } from '../services/fileScanner.js';
import { emitEvent } from '../events/emitter.js';

export const plansRouter = Router();

type PlanTemplateId = 'feature' | 'bugfix' | 'refactor' | 'documentation' | 'analysis' | 'investigation';

const PLAN_TEMPLATES: Record<PlanTemplateId, {
  template: PlanTemplateId;
  category: string;
  label: string;
  goals?: string[];
  success_criteria?: string[];
  steps: Array<{ phase: string; task: string; status?: string; type?: string; requires_validation?: boolean }>;
}> = {
  feature: {
    template: 'feature',
    category: 'feature',
    label: 'Feature',
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
    category: 'bug',
    label: 'Bug Fix',
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
    category: 'refactor',
    label: 'Refactor',
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
    category: 'documentation',
    label: 'Documentation',
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
    category: 'analysis',
    label: 'Analysis',
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
    category: 'investigation',
    label: 'Investigation',
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

// GET /api/plans/workspace/:workspaceId - Get all plans for a workspace
plansRouter.get('/workspace/:workspaceId', async (req, res) => {
  try {
    const plans = await getWorkspacePlans(globalThis.MBS_DATA_ROOT, req.params.workspaceId);
    res.json({
      plans,
      total: plans.length,
    });
  } catch (error) {
    console.error('Error getting plans:', error);
    res.status(500).json({ error: 'Failed to get plans' });
  }
});

// GET /api/plans/:workspaceId/:planId - Get full plan state
plansRouter.get('/:workspaceId/:planId', async (req, res) => {
  try {
    const plan = await getPlanState(
      globalThis.MBS_DATA_ROOT, 
      req.params.workspaceId, 
      req.params.planId
    );
    if (!plan) {
      return res.status(404).json({ error: 'Plan not found' });
    }
    res.json(plan);
  } catch (error) {
    console.error('Error getting plan:', error);
    res.status(500).json({ error: 'Failed to get plan' });
  }
});

// GET /api/plans/:workspaceId/:planId/lineage - Get handoff history
plansRouter.get('/:workspaceId/:planId/lineage', async (req, res) => {
  try {
    const lineage = await getPlanLineage(
      globalThis.MBS_DATA_ROOT,
      req.params.workspaceId,
      req.params.planId
    );
    res.json({ lineage });
  } catch (error) {
    console.error('Error getting lineage:', error);
    res.status(500).json({ error: 'Failed to get lineage' });
  }
});

// POST /api/plans/:workspaceId/:planId/handoff - Record a handoff and update lineage
plansRouter.post('/:workspaceId/:planId/handoff', async (req, res) => {
  try {
    const { workspaceId, planId } = req.params;
    const { from_agent, to_agent, reason, summary, artifacts } = req.body;

    if (!from_agent || !to_agent || !reason) {
      return res.status(400).json({
        error: 'Missing required fields: from_agent, to_agent, reason'
      });
    }

    const statePath = path.join(globalThis.MBS_DATA_ROOT, workspaceId, 'plans', planId, 'state.json');
    const content = await fs.readFile(statePath, 'utf-8');
    const state = JSON.parse(content);

    const entry = {
      timestamp: new Date().toISOString(),
      from_agent,
      to_agent,
      reason,
      summary: summary || undefined,
      artifacts: Array.isArray(artifacts) ? artifacts : undefined
    };

    if (!Array.isArray(state.lineage)) {
      state.lineage = [];
    }
    state.lineage.push(entry);
    state.recommended_next_agent = to_agent;
    state.updated_at = entry.timestamp;

    await fs.writeFile(statePath, JSON.stringify(state, null, 2));

    const handoffFile = `handoff_${String(from_agent).toLowerCase()}_to_${String(to_agent).toLowerCase()}_${Date.now()}.json`;
    const handoffPath = path.join(globalThis.MBS_DATA_ROOT, workspaceId, 'plans', planId, handoffFile);
    await fs.writeFile(handoffPath, JSON.stringify(entry, null, 2));

    const metaPath = path.join(globalThis.MBS_DATA_ROOT, workspaceId, 'workspace.meta.json');
    try {
      const metaContent = await fs.readFile(metaPath, 'utf-8');
      const meta = JSON.parse(metaContent);
      meta.last_accessed = entry.timestamp;
      await fs.writeFile(metaPath, JSON.stringify(meta, null, 2));
    } catch (e) {
      console.warn('Could not update workspace meta:', e);
    }

    await emitEvent('handoff_completed', {
      from_agent,
      to_agent,
      reason,
      summary: summary || undefined,
      artifacts: Array.isArray(artifacts) ? artifacts : undefined
    }, { workspace_id: workspaceId, plan_id: planId, agent_type: from_agent });

    res.json({ success: true, handoff: entry, plan: state });
  } catch (error) {
    console.error('Error recording handoff:', error);
    res.status(500).json({ error: 'Failed to record handoff' });
  }
});

// POST /api/plans/:workspaceId/:planId/context/initial - Store initial request context
plansRouter.post('/:workspaceId/:planId/context/initial', async (req, res) => {
  try {
    const { workspaceId, planId } = req.params;
    const {
      user_request,
      files_mentioned,
      file_contents,
      requirements,
      constraints,
      examples,
      conversation_context,
      additional_notes
    } = req.body;

    if (!user_request) {
      return res.status(400).json({ error: 'user_request is required' });
    }

    const statePath = path.join(globalThis.MBS_DATA_ROOT, workspaceId, 'plans', planId, 'state.json');
    await fs.readFile(statePath, 'utf-8');

    const contextPath = path.join(globalThis.MBS_DATA_ROOT, workspaceId, 'plans', planId, 'original_request.json');
    const initialContext = {
      type: 'original_request',
      plan_id: planId,
      workspace_id: workspaceId,
      captured_at: new Date().toISOString(),
      user_request,
      context: {
        files_mentioned: Array.isArray(files_mentioned) ? files_mentioned : [],
        file_contents: file_contents || {},
        requirements: Array.isArray(requirements) ? requirements : [],
        constraints: Array.isArray(constraints) ? constraints : [],
        examples: Array.isArray(examples) ? examples : [],
        conversation_context: conversation_context || null,
        additional_notes: additional_notes || null
      }
    };

    await fs.writeFile(contextPath, JSON.stringify(initialContext, null, 2));

    res.status(201).json({ success: true, path: contextPath });
  } catch (error) {
    console.error('Error storing initial context:', error);
    res.status(500).json({ error: 'Failed to store initial context' });
  }
});

// POST /api/plans/:workspaceId/:planId/context - Store context data by type
plansRouter.post('/:workspaceId/:planId/context', async (req, res) => {
  try {
    const { workspaceId, planId } = req.params;
    const { type, data } = req.body;

    if (!type || data === undefined) {
      return res.status(400).json({ error: 'type and data are required' });
    }

    const statePath = path.join(globalThis.MBS_DATA_ROOT, workspaceId, 'plans', planId, 'state.json');
    await fs.readFile(statePath, 'utf-8');

    const contextPath = path.join(globalThis.MBS_DATA_ROOT, workspaceId, 'plans', planId, `${type}.json`);
    const contextData = {
      type,
      plan_id: planId,
      workspace_id: workspaceId,
      stored_at: new Date().toISOString(),
      data
    };

    await fs.writeFile(contextPath, JSON.stringify(contextData, null, 2));

    res.status(201).json({ success: true, path: contextPath });
  } catch (error) {
    console.error('Error storing context:', error);
    res.status(500).json({ error: 'Failed to store context' });
  }
});

// GET /api/plans/:workspaceId/:planId/context - List context files
plansRouter.get('/:workspaceId/:planId/context', async (req, res) => {
  try {
    const { workspaceId, planId } = req.params;
    const planDir = path.join(globalThis.MBS_DATA_ROOT, workspaceId, 'plans', planId);
    const files = await fs.readdir(planDir);
    const contextFiles = files.filter(file => file.endsWith('.json') && file !== 'state.json' && file !== 'audit.json');
    res.json({ context: contextFiles });
  } catch (error) {
    console.error('Error listing context files:', error);
    res.status(500).json({ error: 'Failed to list context files' });
  }
});

// GET /api/plans/:workspaceId/:planId/context/research - List research note files
plansRouter.get('/:workspaceId/:planId/context/research', async (req, res) => {
  try {
    const { workspaceId, planId } = req.params;
    const researchDir = path.join(globalThis.MBS_DATA_ROOT, workspaceId, 'plans', planId, 'research_notes');
    try {
      const files = await fs.readdir(researchDir);
      res.json({ notes: files });
    } catch {
      res.json({ notes: [] });
    }
  } catch (error) {
    console.error('Error listing research notes:', error);
    res.status(500).json({ error: 'Failed to list research notes' });
  }
});

// GET /api/plans/:workspaceId/:planId/context/:type - Get context data by type
plansRouter.get('/:workspaceId/:planId/context/:type', async (req, res) => {
  try {
    const { workspaceId, planId, type } = req.params;
    const contextPath = path.join(globalThis.MBS_DATA_ROOT, workspaceId, 'plans', planId, `${type}.json`);
    const content = await fs.readFile(contextPath, 'utf-8');
    res.json(JSON.parse(content));
  } catch (error) {
    console.error('Error getting context:', error);
    res.status(404).json({ error: 'Context not found' });
  }
});

// POST /api/plans/:workspaceId/:planId/research - Append a research note
plansRouter.post('/:workspaceId/:planId/research', async (req, res) => {
  try {
    const { workspaceId, planId } = req.params;
    const { filename, content } = req.body;

    if (!filename || !content) {
      return res.status(400).json({ error: 'filename and content are required' });
    }

    const statePath = path.join(globalThis.MBS_DATA_ROOT, workspaceId, 'plans', planId, 'state.json');
    await fs.readFile(statePath, 'utf-8');

    const safeFilename = String(filename).replace(/[^a-zA-Z0-9-_.]/g, '-');
    const researchDir = path.join(globalThis.MBS_DATA_ROOT, workspaceId, 'plans', planId, 'research_notes');
    await fs.mkdir(researchDir, { recursive: true });
    const filePath = path.join(researchDir, safeFilename);

    await fs.writeFile(filePath, String(content), 'utf-8');

    res.status(201).json({ success: true, path: filePath });
  } catch (error) {
    console.error('Error appending research note:', error);
    res.status(500).json({ error: 'Failed to append research note' });
  }
});

// GET /api/plans/:workspaceId/:planId/audit - Get audit log
plansRouter.get('/:workspaceId/:planId/audit', async (req, res) => {
  try {
    const audit = await getPlanAudit(
      globalThis.MBS_DATA_ROOT,
      req.params.workspaceId,
      req.params.planId
    );
    res.json(audit);
  } catch (error) {
    console.error('Error getting audit:', error);
    res.status(500).json({ error: 'Failed to get audit log' });
  }
});

// GET /api/plans/:workspaceId/:planId/research - Get research notes
plansRouter.get('/:workspaceId/:planId/research', async (req, res) => {
  try {
    const notes = await getResearchNotes(
      globalThis.MBS_DATA_ROOT,
      req.params.workspaceId,
      req.params.planId
    );
    res.json({ notes });
  } catch (error) {
    console.error('Error getting research notes:', error);
    res.status(500).json({ error: 'Failed to get research notes' });
  }
});

// GET /api/plans/templates - List plan templates
plansRouter.get('/templates', async (_req, res) => {
  res.json({ templates: Object.values(PLAN_TEMPLATES) });
});

// POST /api/plans/:workspaceId/template - Create a plan from template
plansRouter.post('/:workspaceId/template', async (req, res) => {
  try {
    const { template, title, description, priority, goals, success_criteria } = req.body;
    const workspaceId = req.params.workspaceId;

    if (!template || !title || !description) {
      return res.status(400).json({
        error: 'Missing required fields: template, title, description'
      });
    }

    const templateData = PLAN_TEMPLATES[template as PlanTemplateId];
    if (!templateData) {
      return res.status(400).json({
        error: `Unknown template: ${template}`
      });
    }

    const resolvedGoals = Array.isArray(goals) && goals.length > 0 ? goals : (templateData.goals || []);
    const resolvedCriteria = Array.isArray(success_criteria) && success_criteria.length > 0
      ? success_criteria
      : (templateData.success_criteria || []);

    if (templateData.category === 'investigation') {
      if (resolvedGoals.length === 0 || resolvedCriteria.length === 0) {
        return res.status(400).json({
          error: 'Investigation plans require at least 1 goal and 1 success criteria'
        });
      }
    }

    // Generate plan ID
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).slice(2, 6);
    const planId = `plan_${timestamp}${random}_${crypto.randomUUID().slice(0, 8)}`;

    const planDir = path.join(globalThis.MBS_DATA_ROOT, workspaceId, 'plans', planId);
    await fs.mkdir(planDir, { recursive: true });
    await fs.mkdir(path.join(planDir, 'research_notes'), { recursive: true });
    await fs.mkdir(path.join(planDir, 'logs'), { recursive: true });

    const now = new Date().toISOString();
    const indexedSteps = templateData.steps.map((step, index) => ({
      index,
      phase: step.phase,
      task: step.task,
      status: step.status || 'pending',
      type: step.type,
      requires_validation: step.requires_validation
    }));

    const planState = {
      id: planId,
      workspace_id: workspaceId,
      title,
      description,
      category: templateData.category,
      priority: priority || 'medium',
      status: 'active',
      current_agent: null,
      current_phase: indexedSteps[0]?.phase || '',
      goals: resolvedGoals,
      success_criteria: resolvedCriteria,
      steps: indexedSteps,
      lineage: [],
      agent_sessions: [],
      created_at: now,
      updated_at: now,
      template_used: templateData.template,
    };

    await fs.writeFile(
      path.join(planDir, 'state.json'),
      JSON.stringify(planState, null, 2)
    );

    // Update workspace meta
    const metaPath = path.join(globalThis.MBS_DATA_ROOT, workspaceId, 'workspace.meta.json');
    try {
      const metaContent = await fs.readFile(metaPath, 'utf-8');
      const meta = JSON.parse(metaContent);
      if (!meta.active_plans.includes(planId)) {
        meta.active_plans.push(planId);
        meta.last_accessed = now;
        await fs.writeFile(metaPath, JSON.stringify(meta, null, 2));
      }
    } catch (e) {
      console.warn('Could not update workspace meta:', e);
    }

    res.status(201).json({ plan: planState, plan_id: planId });
  } catch (error) {
    console.error('Error creating plan from template:', error);
    res.status(500).json({ error: 'Failed to create plan from template' });
  }
});

// POST /api/plans/:workspaceId - Create a new plan
plansRouter.post('/:workspaceId', async (req, res) => {
  try {
    const { title, description, category, priority, goals, success_criteria } = req.body;
    const workspaceId = req.params.workspaceId;
    
    if (!title || !description || !category) {
      return res.status(400).json({ error: 'Missing required fields: title, description, category' });
    }

    if (category === 'investigation') {
      const hasGoals = Array.isArray(goals) && goals.length > 0;
      const hasCriteria = Array.isArray(success_criteria) && success_criteria.length > 0;
      if (!hasGoals || !hasCriteria) {
        return res.status(400).json({
          error: 'Investigation plans require at least 1 goal and 1 success criteria'
        });
      }
    }
    
    // Generate plan ID
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).slice(2, 6);
    const planId = `plan_${timestamp}${random}_${crypto.randomUUID().slice(0, 8)}`;
    
    const planDir = path.join(globalThis.MBS_DATA_ROOT, workspaceId, 'plans', planId);
    await fs.mkdir(planDir, { recursive: true });
    await fs.mkdir(path.join(planDir, 'research_notes'), { recursive: true });
    await fs.mkdir(path.join(planDir, 'logs'), { recursive: true });
    
    const now = new Date().toISOString();
    const planState = {
      id: planId,
      workspace_id: workspaceId,
      title,
      description,
      category,
      priority: priority || 'medium',
      status: 'active',
      current_agent: null,
      goals: Array.isArray(goals) ? goals : [],
      success_criteria: Array.isArray(success_criteria) ? success_criteria : [],
      steps: [],
      lineage: [],
      agent_sessions: [],
      created_at: now,
      updated_at: now,
    };
    
    await fs.writeFile(
      path.join(planDir, 'state.json'),
      JSON.stringify(planState, null, 2)
    );
    
    // Update workspace meta
    const metaPath = path.join(globalThis.MBS_DATA_ROOT, workspaceId, 'workspace.meta.json');
    try {
      const metaContent = await fs.readFile(metaPath, 'utf-8');
      const meta = JSON.parse(metaContent);
      if (!meta.active_plans.includes(planId)) {
        meta.active_plans.push(planId);
        meta.last_accessed = now;
        await fs.writeFile(metaPath, JSON.stringify(meta, null, 2));
      }
    } catch (e) {
      console.warn('Could not update workspace meta:', e);
    }
    
    res.status(201).json({ plan: planState, plan_id: planId });
  } catch (error) {
    console.error('Error creating plan:', error);
    res.status(500).json({ error: 'Failed to create plan' });
  }
});

// PUT /api/plans/:workspaceId/:planId/steps - Update plan steps
plansRouter.put('/:workspaceId/:planId/steps', async (req, res) => {
  try {
    const { steps } = req.body;
    const { workspaceId, planId } = req.params;
    
    const statePath = path.join(globalThis.MBS_DATA_ROOT, workspaceId, 'plans', planId, 'state.json');
    const content = await fs.readFile(statePath, 'utf-8');
    const state = JSON.parse(content);
    
    // Detect which steps changed
    const changedSteps = steps.filter((step: { status: string }, index: number) => 
      state.steps[index]?.status !== step.status
    );
    
    state.steps = steps;
    state.updated_at = new Date().toISOString();
    
    await fs.writeFile(statePath, JSON.stringify(state, null, 2));
    
    // Emit events for changed steps
    for (const step of changedSteps) {
      await emitEvent('step_updated', {
        step_index: steps.indexOf(step),
        step_task: step.task,
        new_status: step.status,
        plan_title: state.title,
      }, { workspace_id: workspaceId, plan_id: planId });
    }
    
    res.json({ success: true, state });
  } catch (error) {
    console.error('Error updating steps:', error);
    res.status(500).json({ error: 'Failed to update steps' });
  }
});

// POST /api/plans/:workspaceId/:planId/archive - Archive a plan
plansRouter.post('/:workspaceId/:planId/archive', async (req, res) => {
  try {
    const { workspaceId, planId } = req.params;
    
    const statePath = path.join(globalThis.MBS_DATA_ROOT, workspaceId, 'plans', planId, 'state.json');
    const content = await fs.readFile(statePath, 'utf-8');
    const state = JSON.parse(content);
    
    state.status = 'archived';
    state.archived_at = new Date().toISOString();
    state.updated_at = new Date().toISOString();
    
    await fs.writeFile(statePath, JSON.stringify(state, null, 2));
    
    // Update workspace meta: remove from active_plans, add to archived_plans
    const metaPath = path.join(globalThis.MBS_DATA_ROOT, workspaceId, 'workspace.meta.json');
    try {
      const metaContent = await fs.readFile(metaPath, 'utf-8');
      const meta = JSON.parse(metaContent);
      meta.active_plans = meta.active_plans.filter((p: string) => p !== planId);
      if (!meta.archived_plans.includes(planId)) {
        meta.archived_plans.push(planId);
      }
      meta.last_accessed = new Date().toISOString();
      await fs.writeFile(metaPath, JSON.stringify(meta, null, 2));
    } catch (e) {
      console.warn('Could not update workspace meta:', e);
    }
    
    // Emit event
    await emitEvent('plan_archived', {
      plan_title: state.title,
    }, { workspace_id: workspaceId, plan_id: planId });
    
    res.json({ success: true, plan: state });
  } catch (error) {
    console.error('Error archiving plan:', error);
    res.status(500).json({ error: 'Failed to archive plan' });
  }
});

// POST /api/plans/:workspaceId/:planId/notes - Add a note to the plan
plansRouter.post('/:workspaceId/:planId/notes', async (req, res) => {
  try {
    const { workspaceId, planId } = req.params;
    const { note, type = 'info' } = req.body;
    
    if (!note) {
      return res.status(400).json({ error: 'Note is required' });
    }
    
    const statePath = path.join(globalThis.MBS_DATA_ROOT, workspaceId, 'plans', planId, 'state.json');
    const content = await fs.readFile(statePath, 'utf-8');
    const state = JSON.parse(content);
    
    // Initialize pending_notes if it doesn't exist
    if (!state.pending_notes) {
      state.pending_notes = [];
    }
    
    // Add the note
    state.pending_notes.push({
      note,
      type,
      added_at: new Date().toISOString(),
      added_by: 'user'
    });
    
    state.updated_at = new Date().toISOString();
    
    await fs.writeFile(statePath, JSON.stringify(state, null, 2));
    
    // Emit event
    await emitEvent('note_added', {
      note,
      type,
    }, { workspace_id: workspaceId, plan_id: planId });
    
    res.json({ 
      success: true, 
      notes_count: state.pending_notes.length 
    });
  } catch (error) {
    console.error('Error adding note:', error);
    res.status(500).json({ error: 'Failed to add note' });
  }
});

// DELETE /api/plans/:workspaceId/:planId - Delete a plan
plansRouter.delete('/:workspaceId/:planId', async (req, res) => {
  try {
    const { workspaceId, planId } = req.params;
    const archive = req.query.archive !== 'false'; // Default to archiving
    
    // Get plan info before deleting
    const statePath = path.join(globalThis.MBS_DATA_ROOT, workspaceId, 'plans', planId, 'state.json');
    let planTitle = planId;
    try {
      const content = await fs.readFile(statePath, 'utf-8');
      const state = JSON.parse(content);
      planTitle = state.title || planId;
    } catch (e) {
      // Continue with deletion
    }
    
    const planDir = path.join(globalThis.MBS_DATA_ROOT, workspaceId, 'plans', planId);
    
    if (archive) {
      // Move to archive folder
      const archiveDir = path.join(globalThis.MBS_DATA_ROOT, workspaceId, 'plans', '_archived');
      await fs.mkdir(archiveDir, { recursive: true });
      const archivePath = path.join(archiveDir, planId);
      await fs.rename(planDir, archivePath);
    } else {
      // Permanently delete
      await fs.rm(planDir, { recursive: true, force: true });
    }
    
    // Remove from active_plans in workspace meta
    const metaPath = path.join(globalThis.MBS_DATA_ROOT, workspaceId, 'workspace.meta.json');
    try {
      const metaContent = await fs.readFile(metaPath, 'utf-8');
      const meta = JSON.parse(metaContent);
      meta.active_plans = meta.active_plans.filter((p: string) => p !== planId);
      meta.last_accessed = new Date().toISOString();
      await fs.writeFile(metaPath, JSON.stringify(meta, null, 2));
    } catch (e) {
      console.warn('Could not update workspace meta:', e);
    }
    
    // Emit event
    await emitEvent('plan_deleted', {
      plan_title: planTitle,
      permanent: !archive,
    }, { workspace_id: workspaceId, plan_id: planId });
    
    res.json({ 
      success: true, 
      archived: archive,
      message: archive ? 'Plan moved to archive' : 'Plan permanently deleted'
    });
  } catch (error) {
    console.error('Error deleting plan:', error);
    res.status(500).json({ error: 'Failed to delete plan' });
  }
});

// POST /api/plans/:workspaceId/:planId/duplicate - Duplicate a plan as template
plansRouter.post('/:workspaceId/:planId/duplicate', async (req, res) => {
  try {
    const { workspaceId, planId } = req.params;
    const { newTitle } = req.body;
    
    // Read source plan
    const sourcePath = path.join(globalThis.MBS_DATA_ROOT, workspaceId, 'plans', planId, 'state.json');
    const sourceContent = await fs.readFile(sourcePath, 'utf-8');
    const sourceState = JSON.parse(sourceContent);
    
    // Generate new plan ID
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).slice(2, 6);
    const newPlanId = `plan_${timestamp}${random}_${crypto.randomUUID().slice(0, 8)}`;
    
    const newPlanDir = path.join(globalThis.MBS_DATA_ROOT, workspaceId, 'plans', newPlanId);
    await fs.mkdir(newPlanDir, { recursive: true });
    await fs.mkdir(path.join(newPlanDir, 'research_notes'), { recursive: true });
    await fs.mkdir(path.join(newPlanDir, 'logs'), { recursive: true });
    
    const now = new Date().toISOString();
    
    // Create new state with reset metadata
    const newState = {
      id: newPlanId,
      workspace_id: workspaceId,
      title: newTitle || `${sourceState.title} (Copy)`,
      description: sourceState.description,
      category: sourceState.category,
      priority: sourceState.priority || 'medium',
      status: 'active',
      current_agent: null,
      steps: sourceState.steps?.map((step: { phase: string; task: string }) => ({
        ...step,
        status: 'pending', // Reset all steps
      })) || [],
      lineage: [],
      agent_sessions: [],
      created_at: now,
      updated_at: now,
      duplicated_from: planId,
    };
    
    await fs.writeFile(
      path.join(newPlanDir, 'state.json'),
      JSON.stringify(newState, null, 2)
    );
    
    // Update workspace meta
    const metaPath = path.join(globalThis.MBS_DATA_ROOT, workspaceId, 'workspace.meta.json');
    try {
      const metaContent = await fs.readFile(metaPath, 'utf-8');
      const meta = JSON.parse(metaContent);
      if (!meta.active_plans.includes(newPlanId)) {
        meta.active_plans.push(newPlanId);
        meta.last_accessed = now;
        await fs.writeFile(metaPath, JSON.stringify(meta, null, 2));
      }
    } catch (e) {
      console.warn('Could not update workspace meta:', e);
    }
    
    // Emit event
    await emitEvent('plan_duplicated', {
      source_plan_id: planId,
      source_title: sourceState.title,
      new_title: newState.title,
      step_count: newState.steps.length,
    }, { workspace_id: workspaceId, plan_id: newPlanId });
    
    res.status(201).json({ 
      success: true, 
      plan: newState, 
      plan_id: newPlanId,
      message: 'Plan duplicated successfully'
    });
  } catch (error) {
    console.error('Error duplicating plan:', error);
    res.status(500).json({ error: 'Failed to duplicate plan' });
  }
});

// POST /api/plans/:workspaceId/import - Import a plan from a file path
plansRouter.post('/:workspaceId/import', async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const { filePath, category, priority } = req.body;
    
    if (!filePath) {
      return res.status(400).json({ error: 'filePath is required' });
    }
    
    // Read the file
    const content = await fs.readFile(filePath, 'utf-8');
    
    // Extract title from first heading
    const titleMatch = content.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1] : path.basename(filePath, path.extname(filePath));
    
    // Extract steps from checkbox patterns
    const stepMatches = content.matchAll(/^[-*]\s*\[[ x]\]\s*(.+)$/gm);
    const steps = Array.from(stepMatches).map((match, index) => ({
      phase: 'imported',
      task: match[1],
      status: match[0].includes('[x]') ? 'done' : 'pending',
      order: index,
    }));
    
    // Generate plan ID
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).slice(2, 6);
    const planId = `plan_${timestamp}${random}_${crypto.randomUUID().slice(0, 8)}`;
    
    const planDir = path.join(globalThis.MBS_DATA_ROOT, workspaceId, 'plans', planId);
    await fs.mkdir(planDir, { recursive: true });
    await fs.mkdir(path.join(planDir, 'research_notes'), { recursive: true });
    await fs.mkdir(path.join(planDir, 'logs'), { recursive: true });
    
    const now = new Date().toISOString();
    const planState = {
      id: planId,
      workspace_id: workspaceId,
      title,
      description: `Imported from: ${filePath}`,
      category: category || 'change',
      priority: priority || 'medium',
      status: 'active',
      current_agent: null,
      steps,
      lineage: [],
      agent_sessions: [],
      created_at: now,
      updated_at: now,
      imported_from: filePath,
    };
    
    await fs.writeFile(
      path.join(planDir, 'state.json'),
      JSON.stringify(planState, null, 2)
    );
    
    // Copy original file as plan.md
    await fs.writeFile(path.join(planDir, 'plan.md'), content);
    
    // Update workspace meta
    const metaPath = path.join(globalThis.MBS_DATA_ROOT, workspaceId, 'workspace.meta.json');
    try {
      const metaContent = await fs.readFile(metaPath, 'utf-8');
      const meta = JSON.parse(metaContent);
      if (!meta.active_plans.includes(planId)) {
        meta.active_plans.push(planId);
        meta.last_accessed = now;
        await fs.writeFile(metaPath, JSON.stringify(meta, null, 2));
      }
    } catch (e) {
      console.warn('Could not update workspace meta:', e);
    }
    
    // Emit event
    await emitEvent('plan_imported', {
      source_file: filePath,
      plan_title: title,
      step_count: steps.length,
    }, { workspace_id: workspaceId, plan_id: planId });
    
    res.status(201).json({ 
      success: true,
      plan: planState, 
      plan_id: planId,
      steps_imported: steps.length,
      message: `Plan imported with ${steps.length} steps`
    });
  } catch (error) {
    console.error('Error importing plan:', error);
    res.status(500).json({ error: 'Failed to import plan' });
  }
});
// ============================================================================
// Goals and Success Criteria Endpoints
// ============================================================================

// PATCH /api/plans/:workspaceId/:planId/goals - Update goals/success_criteria
plansRouter.patch('/:workspaceId/:planId/goals', async (req, res) => {
  try {
    const { goals, success_criteria } = req.body;
    const { workspaceId, planId } = req.params;
    
    const statePath = path.join(globalThis.MBS_DATA_ROOT, workspaceId, 'plans', planId, 'state.json');
    const content = await fs.readFile(statePath, 'utf-8');
    const state = JSON.parse(content);

    const nextGoals = goals !== undefined ? goals : (state.goals || []);
    const nextCriteria = success_criteria !== undefined ? success_criteria : (state.success_criteria || []);

    if (state.category === 'investigation') {
      const hasGoals = Array.isArray(nextGoals) && nextGoals.length > 0;
      const hasCriteria = Array.isArray(nextCriteria) && nextCriteria.length > 0;
      if (!hasGoals || !hasCriteria) {
        return res.status(400).json({
          error: 'Investigation plans require at least 1 goal and 1 success criteria'
        });
      }
    }
    
    if (goals !== undefined) {
      state.goals = goals;
    }
    if (success_criteria !== undefined) {
      state.success_criteria = success_criteria;
    }
    state.updated_at = new Date().toISOString();
    
    await fs.writeFile(statePath, JSON.stringify(state, null, 2));
    
    res.json({ success: true, state });
  } catch (error) {
    console.error('Error updating goals:', error);
    res.status(500).json({ error: 'Failed to update goals' });
  }
});

// ============================================================================
// Build Scripts Endpoints
// ============================================================================

// GET /api/plans/:planId/build-scripts - Get all build scripts for a plan
plansRouter.get('/:planId/build-scripts', async (req, res) => {
  try {
    const { planId } = req.params;
    
    // Find workspace ID by scanning
    const workspacesDir = globalThis.MBS_DATA_ROOT;
    const workspaces = await fs.readdir(workspacesDir);
    let workspaceId = '';
    
    for (const ws of workspaces) {
      const wsPath = path.join(workspacesDir, ws);
      const stat = await fs.stat(wsPath).catch(() => null);
      if (stat?.isDirectory()) {
        const planPath = path.join(wsPath, 'plans', planId, 'state.json');
        try {
          await fs.access(planPath);
          workspaceId = ws;
          break;
        } catch {}
      }
    }
    
    if (!workspaceId) {
      return res.status(404).json({ error: 'Plan not found' });
    }
    
    const statePath = path.join(globalThis.MBS_DATA_ROOT, workspaceId, 'plans', planId, 'state.json');
    const content = await fs.readFile(statePath, 'utf-8');
    const state = JSON.parse(content);
    
    const scripts = state.build_scripts || [];
    res.json({ scripts });
  } catch (error) {
    console.error('Error getting build scripts:', error);
    res.status(500).json({ error: 'Failed to get build scripts' });
  }
});

// POST /api/plans/:planId/build-scripts - Add a build script to a plan
plansRouter.post('/:planId/build-scripts', async (req, res) => {
  try {
    const { name, description, command, directory, mcp_handle } = req.body;
    const { planId } = req.params;
    
    if (!name || !command) {
      return res.status(400).json({ error: 'Missing required fields: name, command' });
    }
    
    // Find workspace ID
    const workspacesDir = globalThis.MBS_DATA_ROOT;
    const workspaces = await fs.readdir(workspacesDir);
    let workspaceId = '';
    
    for (const ws of workspaces) {
      const wsPath = path.join(workspacesDir, ws);
      const stat = await fs.stat(wsPath).catch(() => null);
      if (stat?.isDirectory()) {
        const planPath = path.join(wsPath, 'plans', planId, 'state.json');
        try {
          await fs.access(planPath);
          workspaceId = ws;
          break;
        } catch {}
      }
    }
    
    if (!workspaceId) {
      return res.status(404).json({ error: 'Plan not found' });
    }
    
    const statePath = path.join(globalThis.MBS_DATA_ROOT, workspaceId, 'plans', planId, 'state.json');
    const content = await fs.readFile(statePath, 'utf-8');
    const state = JSON.parse(content);
    
    const scriptId = `script_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
    const newScript = {
      id: scriptId,
      name,
      description: description || '',
      command,
      directory: directory || './',
      workspace_id: workspaceId,
      plan_id: planId,
      mcp_handle: mcp_handle || undefined,
      created_at: new Date().toISOString(),
    };
    
    if (!state.build_scripts) {
      state.build_scripts = [];
    }
    state.build_scripts.push(newScript);
    state.updated_at = new Date().toISOString();
    
    await fs.writeFile(statePath, JSON.stringify(state, null, 2));
    
    res.status(201).json({ script: newScript });
  } catch (error) {
    console.error('Error adding build script:', error);
    res.status(500).json({ error: 'Failed to add build script' });
  }
});

// DELETE /api/plans/:planId/build-scripts/:scriptId - Delete a build script
plansRouter.delete('/:planId/build-scripts/:scriptId', async (req, res) => {
  try {
    const { planId, scriptId } = req.params;
    
    // Find workspace ID
    const workspacesDir = globalThis.MBS_DATA_ROOT;
    const workspaces = await fs.readdir(workspacesDir);
    let workspaceId = '';
    
    for (const ws of workspaces) {
      const wsPath = path.join(workspacesDir, ws);
      const stat = await fs.stat(wsPath).catch(() => null);
      if (stat?.isDirectory()) {
        const planPath = path.join(wsPath, 'plans', planId, 'state.json');
        try {
          await fs.access(planPath);
          workspaceId = ws;
          break;
        } catch {}
      }
    }
    
    if (!workspaceId) {
      return res.status(404).json({ error: 'Plan not found' });
    }
    
    const statePath = path.join(globalThis.MBS_DATA_ROOT, workspaceId, 'plans', planId, 'state.json');
    const content = await fs.readFile(statePath, 'utf-8');
    const state = JSON.parse(content);
    
    if (!state.build_scripts) {
      return res.status(404).json({ error: 'Script not found' });
    }
    
    const initialLength = state.build_scripts.length;
    state.build_scripts = state.build_scripts.filter((s: { id: string }) => s.id !== scriptId);
    
    if (state.build_scripts.length === initialLength) {
      return res.status(404).json({ error: 'Script not found' });
    }
    
    state.updated_at = new Date().toISOString();
    await fs.writeFile(statePath, JSON.stringify(state, null, 2));
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting build script:', error);
    res.status(500).json({ error: 'Failed to delete build script' });
  }
});

// POST /api/plans/:planId/build-scripts/:scriptId/run - Run a build script
plansRouter.post('/:planId/build-scripts/:scriptId/run', async (req, res) => {
  try {
    const { planId, scriptId } = req.params;
    
    // Find workspace ID
    const workspacesDir = globalThis.MBS_DATA_ROOT;
    const workspaces = await fs.readdir(workspacesDir);
    let workspaceId = '';
    let wsPath = '';
    
    for (const ws of workspaces) {
      wsPath = path.join(workspacesDir, ws);
      const stat = await fs.stat(wsPath).catch(() => null);
      if (stat?.isDirectory()) {
        const planPath = path.join(wsPath, 'plans', planId, 'state.json');
        try {
          await fs.access(planPath);
          workspaceId = ws;
          break;
        } catch {}
      }
    }
    
    if (!workspaceId) {
      return res.status(404).json({ error: 'Plan not found' });
    }
    
    const statePath = path.join(globalThis.MBS_DATA_ROOT, workspaceId, 'plans', planId, 'state.json');
    const content = await fs.readFile(statePath, 'utf-8');
    const state = JSON.parse(content);
    
    const script = state.build_scripts?.find((s: { id: string }) => s.id === scriptId);
    if (!script) {
      return res.status(404).json({ error: 'Script not found' });
    }
    
    // Execute the script
    const execAsync = promisify(require('child_process').exec);
    const workingDir = path.join(wsPath, script.directory);
    
    try {
      const { stdout, stderr } = await execAsync(script.command, {
        cwd: workingDir,
        timeout: 300000, // 5 minute timeout
      });
      
      res.json({ 
        success: true, 
        output: stdout,
        error: stderr || undefined
      });
    } catch (execError: any) {
      res.json({
        success: false,
        output: execError.stdout || '',
        error: execError.stderr || execError.message
      });
    }
  } catch (error: any) {
    console.error('Error running build script:', error);
    res.status(500).json({ error: 'Failed to run build script', message: error.message });
  }
});