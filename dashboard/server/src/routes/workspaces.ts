import { Router } from 'express';
import * as fs from 'fs/promises';
import * as path from 'path';
import { scanWorkspaces, getWorkspaceDetails } from '../services/fileScanner.js';

export const workspacesRouter = Router();

// GET /api/workspaces - List all workspaces
workspacesRouter.get('/', async (req, res) => {
  try {
    const workspaces = await scanWorkspaces(globalThis.MBS_DATA_ROOT);
    res.json({
      workspaces,
      total: workspaces.length,
    });
  } catch (error) {
    console.error('Error scanning workspaces:', error);
    res.status(500).json({ error: 'Failed to scan workspaces' });
  }
});

// GET /api/workspaces/:id - Get workspace details
workspacesRouter.get('/:id', async (req, res) => {
  try {
    const workspace = await getWorkspaceDetails(globalThis.MBS_DATA_ROOT, req.params.id);
    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }
    res.json(workspace);
  } catch (error) {
    console.error('Error getting workspace:', error);
    res.status(500).json({ error: 'Failed to get workspace details' });
  }
});

// GET /api/workspaces/:id/philosophy - Get project philosophy file
workspacesRouter.get('/:id/philosophy', async (req, res) => {
  try {
    const metaPath = path.join(globalThis.MBS_DATA_ROOT, req.params.id, 'workspace.meta.json');
    const metaContent = await fs.readFile(metaPath, 'utf-8');
    const meta = JSON.parse(metaContent);
    const workspacePath = meta.path;

    const philosophyPath = path.join(workspacePath, '.github', 'project-philosophy.md');

    try {
      const content = await fs.readFile(philosophyPath, 'utf-8');
      const stats = await fs.stat(philosophyPath);
      res.json({
        exists: true,
        content,
        path: philosophyPath,
        lastModified: stats.mtime.toISOString(),
      });
    } catch {
      res.json({
        exists: false,
        content: '',
        path: philosophyPath,
      });
    }
  } catch (error) {
    console.error('Error getting philosophy:', error);
    res.status(500).json({ error: 'Failed to get philosophy file' });
  }
});

// PUT /api/workspaces/:id/philosophy - Save project philosophy file
workspacesRouter.put('/:id/philosophy', async (req, res) => {
  try {
    const { content } = req.body;

    if (typeof content !== 'string') {
      return res.status(400).json({ error: 'content is required' });
    }

    const metaPath = path.join(globalThis.MBS_DATA_ROOT, req.params.id, 'workspace.meta.json');
    const metaContent = await fs.readFile(metaPath, 'utf-8');
    const meta = JSON.parse(metaContent);
    const workspacePath = meta.path;

    const githubDir = path.join(workspacePath, '.github');
    await fs.mkdir(githubDir, { recursive: true });

    const philosophyPath = path.join(githubDir, 'project-philosophy.md');
    await fs.writeFile(philosophyPath, content, 'utf-8');

    res.json({ success: true, path: philosophyPath });
  } catch (error) {
    console.error('Error saving philosophy:', error);
    res.status(500).json({ error: 'Failed to save philosophy file' });
  }
});
