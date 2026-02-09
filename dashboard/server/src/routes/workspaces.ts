import { Router } from 'express';
import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { scanWorkspaces, getWorkspaceDetails } from '../services/fileScanner.js';
import { emitEvent } from '../events/emitter.js';
import { getDataRoot, getWorkspaceDisplayName, getWorkspaceIdFromPath, resolveCanonicalWorkspaceId, writeWorkspaceIdentityFile } from '../storage/workspace-utils.js';

export const workspacesRouter = Router();

const WORKSPACE_SCHEMA_VERSION = '1.0.0';
const WORKSPACE_CONTEXT_SCHEMA_VERSION = '1.0.0';

interface WorkspaceContextSectionItem {
  title: string;
  description?: string;
  links?: string[];
}

interface WorkspaceContextSection {
  summary?: string;
  items?: WorkspaceContextSectionItem[];
}

interface WorkspaceContext {
  schema_version: string;
  workspace_id: string;
  workspace_path: string;
  name: string;
  created_at: string;
  updated_at: string;
  sections: Record<string, WorkspaceContextSection>;
}

function getRandomIdSuffix(): string {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().slice(0, 8);
  }
  return crypto.randomBytes(16).toString('hex').slice(0, 8);
}

async function upsertWorkspaceMeta(workspacePath: string): Promise<{ meta: Record<string, any>; created: boolean }> {
  const resolvedPath = path.resolve(workspacePath);
  // Use identity.json-aware resolution instead of raw hash
  const workspaceId = await resolveCanonicalWorkspaceId(resolvedPath);
  const workspaceDir = path.join(globalThis.MBS_DATA_ROOT, workspaceId);
  const metaPath = path.join(workspaceDir, 'workspace.meta.json');

  await fs.mkdir(path.join(workspaceDir, 'plans'), { recursive: true });

  const now = new Date().toISOString();
  let meta: Record<string, any>;
  let created = false;

  try {
    const content = await fs.readFile(metaPath, 'utf-8');
    meta = JSON.parse(content);
  } catch {
    created = true;
    meta = {
      schema_version: WORKSPACE_SCHEMA_VERSION,
      workspace_id: workspaceId,
      workspace_path: resolvedPath,
      path: resolvedPath,
      name: getWorkspaceDisplayName(resolvedPath),
      created_at: now,
      registered_at: now,
      active_plans: [],
      archived_plans: [],
      indexed: false,
    };
  }

  meta.schema_version = meta.schema_version || WORKSPACE_SCHEMA_VERSION;
  meta.workspace_id = meta.workspace_id || workspaceId;
  meta.workspace_path = meta.workspace_path || resolvedPath;
  meta.path = meta.path || resolvedPath;
  meta.name = meta.name || getWorkspaceDisplayName(resolvedPath);
  meta.data_root = meta.data_root || getDataRoot();
  meta.last_accessed = now;
  meta.last_seen_at = now;
  meta.updated_at = now;
  meta.active_plans = Array.isArray(meta.active_plans) ? meta.active_plans : [];
  meta.archived_plans = Array.isArray(meta.archived_plans) ? meta.archived_plans : [];
  meta.indexed = Boolean(meta.indexed);

  await fs.writeFile(metaPath, JSON.stringify(meta, null, 2));

  return { meta, created };
}

async function readWorkspaceMeta(workspaceId: string): Promise<Record<string, any>> {
  const metaPath = path.join(globalThis.MBS_DATA_ROOT, workspaceId, 'workspace.meta.json');
  const metaContent = await fs.readFile(metaPath, 'utf-8');
  return JSON.parse(metaContent);
}

function normalizeWorkspaceSections(input: unknown): Record<string, WorkspaceContextSection> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {};
  }

  const sections: Record<string, WorkspaceContextSection> = {};

  for (const [key, value] of Object.entries(input)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      continue;
    }

    const section = value as WorkspaceContextSection;
    const normalized: WorkspaceContextSection = {};

    if (typeof section.summary === 'string') {
      normalized.summary = section.summary;
    }

    if (Array.isArray(section.items)) {
      normalized.items = section.items
        .filter((item) => item && typeof item === 'object' && !Array.isArray(item))
        .map((item) => item as WorkspaceContextSectionItem)
        .filter((item) => typeof item.title === 'string');
    }

    sections[key] = normalized;
  }

  return sections;
}

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

// POST /api/workspaces/register - Register a workspace by path
workspacesRouter.post('/register', async (req, res) => {
  try {
    const workspacePath = req.body.workspace_path || req.body.workspacePath;

    if (!workspacePath || typeof workspacePath !== 'string') {
      return res.status(400).json({ error: 'workspace_path is required' });
    }

    const { meta, created } = await upsertWorkspaceMeta(workspacePath);
    const workspaceId = meta.workspace_id as string | undefined;

    // Write identity.json to the workspace directory if missing
    if (workspaceId && meta.data_root) {
      try {
        await writeWorkspaceIdentityFile(workspacePath, workspaceId, meta.data_root as string);
      } catch (identityError) {
        console.error('Failed to write workspace identity file:', identityError);
      }
    }

    if (workspaceId) {
      await emitEvent('workspace_registered', {
        workspace_id: workspaceId,
        workspace_path: meta.workspace_path,
      }, { workspace_id: workspaceId });
    }

    res.status(created ? 201 : 200).json({ workspace: meta, created });
  } catch (error) {
    console.error('Error registering workspace:', error);
    res.status(500).json({ error: 'Failed to register workspace' });
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
    const meta = await readWorkspaceMeta(req.params.id);
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

    const meta = await readWorkspaceMeta(req.params.id);
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

// GET /api/workspaces/:id/context - Get workspace context
workspacesRouter.get('/:id/context', async (req, res) => {
  try {
    const workspaceId = req.params.id;
    const meta = await readWorkspaceMeta(workspaceId);
    const contextPath = path.join(globalThis.MBS_DATA_ROOT, workspaceId, 'workspace.context.json');

    try {
      const content = await fs.readFile(contextPath, 'utf-8');
      const context = JSON.parse(content) as WorkspaceContext;
      return res.json({ exists: true, context, path: contextPath });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }

    const now = new Date().toISOString();
    const context: WorkspaceContext = {
      schema_version: WORKSPACE_CONTEXT_SCHEMA_VERSION,
      workspace_id: workspaceId,
      workspace_path: meta.path,
      name: meta.name,
      created_at: now,
      updated_at: now,
      sections: {},
    };

    res.json({ exists: false, context, path: contextPath });
  } catch (error) {
    console.error('Error getting workspace context:', error);
    res.status(500).json({ error: 'Failed to get workspace context' });
  }
});

// PUT /api/workspaces/:id/context - Save workspace context
workspacesRouter.put('/:id/context', async (req, res) => {
  try {
    const workspaceId = req.params.id;
    const meta = await readWorkspaceMeta(workspaceId);
    const contextPath = path.join(globalThis.MBS_DATA_ROOT, workspaceId, 'workspace.context.json');
    const now = new Date().toISOString();

    let existing: WorkspaceContext | null = null;
    try {
      const content = await fs.readFile(contextPath, 'utf-8');
      existing = JSON.parse(content) as WorkspaceContext;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }

    const sections = normalizeWorkspaceSections(req.body.sections);

    const context: WorkspaceContext = {
      schema_version: existing?.schema_version || WORKSPACE_CONTEXT_SCHEMA_VERSION,
      workspace_id: workspaceId,
      workspace_path: meta.path,
      name: typeof req.body.name === 'string' ? req.body.name : meta.name,
      created_at: existing?.created_at || now,
      updated_at: now,
      sections,
    };

    await fs.writeFile(contextPath, JSON.stringify(context, null, 2));

    res.json({ success: true, context, path: contextPath });
  } catch (error) {
    console.error('Error saving workspace context:', error);
    res.status(500).json({ error: 'Failed to save workspace context' });
  }
});

// ============================================================================
// Build Scripts Endpoints (Workspace-level)
// ============================================================================

// GET /api/workspaces/:workspaceId/build-scripts - Get workspace-level build scripts
workspacesRouter.get('/:workspaceId/build-scripts', async (req, res) => {
  try {
    const { workspaceId } = req.params;
    
    const metaPath = path.join(globalThis.MBS_DATA_ROOT, workspaceId, 'workspace.meta.json');
    const content = await fs.readFile(metaPath, 'utf-8');
    const meta = JSON.parse(content);
    
    const scripts = meta.build_scripts || [];
    res.json({ scripts });
  } catch (error) {
    console.error('Error getting workspace build scripts:', error);
    res.status(500).json({ error: 'Failed to get workspace build scripts' });
  }
});

// POST /api/workspaces/:workspaceId/build-scripts - Add workspace-level build script
workspacesRouter.post('/:workspaceId/build-scripts', async (req, res) => {
  try {
    const { name, description, command, directory, mcp_handle } = req.body;
    const { workspaceId } = req.params;
    
    if (!name || !command) {
      return res.status(400).json({ error: 'Missing required fields: name, command' });
    }
    
    const metaPath = path.join(globalThis.MBS_DATA_ROOT, workspaceId, 'workspace.meta.json');
    const content = await fs.readFile(metaPath, 'utf-8');
    const meta = JSON.parse(content);
    
    const scriptId = `script_${Date.now()}_${getRandomIdSuffix()}`;
    const newScript = {
      id: scriptId,
      name,
      description: description || '',
      command,
      directory: directory || './',
      workspace_id: workspaceId,
      mcp_handle: mcp_handle || undefined,
      created_at: new Date().toISOString(),
    };
    
    if (!meta.build_scripts) {
      meta.build_scripts = [];
    }
    meta.build_scripts.push(newScript);
    meta.updated_at = new Date().toISOString();
    
    await fs.writeFile(metaPath, JSON.stringify(meta, null, 2));
    
    res.status(201).json({ script: newScript });
  } catch (error) {
    console.error('Error adding workspace build script:', error);
    res.status(500).json({ error: 'Failed to add workspace build script' });
  }
});
