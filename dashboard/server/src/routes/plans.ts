import { Router } from 'express';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { promisify } from 'util';
import { getWorkspacePlans, getPlanState, getPlanLineage, getPlanAudit, getResearchNotes } from '../services/fileScanner.js';
import { emitEvent } from '../events/emitter.js';

export const plansRouter = Router();

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

// POST /api/plans/:workspaceId - Create a new plan
plansRouter.post('/:workspaceId', async (req, res) => {
  try {
    const { title, description, category, priority } = req.body;
    const workspaceId = req.params.workspaceId;
    
    if (!title || !description || !category) {
      return res.status(400).json({ error: 'Missing required fields: title, description, category' });
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